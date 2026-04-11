import { createGameAudioSystem } from "./game-audio-system";
import { resolveWarningAudioAssetId } from "./audio-asset-registry";
import { createSimpleSynth } from "./simple-synth";
import { getWarningCue } from "./warning-sound-bank";

const WARNING_AUDIO_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  "defensive-lock-acquired": ["incoming-torpedo"],
};
const WARNING_COOLDOWN_OVERRIDES_MILLISECONDS: Readonly<Record<string, number>> = {
  "player-death": 300,
};

export interface WarningAudioSource {
  id: string;
}

interface WarningAudioManagerOptions {
  perWarningCooldownMilliseconds?: number;
  masterGain?: number;
}

export interface WarningAudioManager {
  syncWarnings(warnings: readonly WarningAudioSource[]): void;
  dispose(): void;
}

export function createWarningAudioManager(
  options: WarningAudioManagerOptions = {},
): WarningAudioManager {
  const perWarningCooldownMilliseconds =
    options.perWarningCooldownMilliseconds ?? 1800;
  const audioSystem = createGameAudioSystem({
    busVolumes: {
      warnings: options.masterGain ?? 0.14,
      ui: 0.9,
      weapons: 1,
      engines: 1,
      ambience: 1,
      music: 1,
    },
  });
  const synth = createSimpleSynth({
    masterGain: 1,
    audioContext: audioSystem.mixer.context,
    destinationNode: audioSystem.mixer.getBus("warnings").inputNode,
  });

  let unlocked = false;
  let currentWarningIds = new Set<string>();
  const lastPlayedAtById = new Map<string, number>();
  const queuedWarningIds: string[] = [];
  let scheduledRetryTimeout: number | null = null;
  let warningAssetsPreloaded = false;

  const unlockAudio = () => {
    unlocked = true;
    void audioSystem.resume().then(() => {
      primeWarningAssets();
      drainQueue();
    }).catch(() => {
      // Ignore resume failures; the next gesture will retry.
    });
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);

  return {
    syncWarnings(warnings) {
      const nextWarningIds = new Set(warnings.map((warning) => warning.id));

      for (const warning of warnings) {
        if (currentWarningIds.has(warning.id)) {
          continue;
        }

        const lastPlayedAt = lastPlayedAtById.get(warning.id) ?? -Infinity;
        const nowMilliseconds = performance.now();
        const warningCooldownMilliseconds =
          WARNING_COOLDOWN_OVERRIDES_MILLISECONDS[warning.id]
          ?? perWarningCooldownMilliseconds;

        if (nowMilliseconds - lastPlayedAt < warningCooldownMilliseconds) {
          continue;
        }

        if (!queuedWarningIds.includes(warning.id)) {
          removeOverriddenWarningsFromQueue(warning.id);
          queuedWarningIds.push(warning.id);
        }
      }

      currentWarningIds = nextWarningIds;
      drainQueue();
    },
    dispose() {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);

      if (scheduledRetryTimeout !== null) {
        window.clearTimeout(scheduledRetryTimeout);
      }

      queuedWarningIds.length = 0;
      currentWarningIds.clear();
      void synth.dispose();
      void audioSystem.dispose();
    },
  };

  function drainQueue(): void {
    if (!unlocked) {
      return;
    }

    if (queuedWarningIds.length === 0) {
      return;
    }

    const pendingWarningIds = normalizeQueuedWarnings(
      queuedWarningIds.splice(0, queuedWarningIds.length),
    );
    const metronomeTimeSeconds = performance.now() / 1000;
    let needsRetry = false;

    for (const warningId of pendingWarningIds) {
      if (!playCue(warningId, metronomeTimeSeconds)) {
        queuedWarningIds.push(warningId);
        needsRetry = true;
        continue;
      }

      lastPlayedAtById.set(warningId, performance.now());
    }

    if (needsRetry && scheduledRetryTimeout === null) {
      scheduledRetryTimeout = window.setTimeout(() => {
        scheduledRetryTimeout = null;
        drainQueue();
      }, 80);
    }
  }

  function playCue(warningId: string, metronomeTimeSeconds: number): boolean {
    stopOverriddenCueAudio(warningId);
    if (tryPlayWarningSample(warningId)) {
      return true;
    }

    const cue = getWarningCue(warningId, metronomeTimeSeconds);
    return synth.playCue(cue, warningId);
  }

  function removeOverriddenWarningsFromQueue(warningId: string): void {
    const overriddenIds = WARNING_AUDIO_OVERRIDES[warningId];

    if (!overriddenIds?.length) {
      return;
    }

    for (let index = queuedWarningIds.length - 1; index >= 0; index -= 1) {
      if (overriddenIds.includes(queuedWarningIds[index])) {
        queuedWarningIds.splice(index, 1);
      }
    }
  }

  function normalizeQueuedWarnings(warningIds: readonly string[]): string[] {
    const blockedIds = new Set<string>();

    for (const warningId of warningIds) {
      for (const overriddenId of WARNING_AUDIO_OVERRIDES[warningId] ?? []) {
        blockedIds.add(overriddenId);
      }
    }

    return warningIds.filter((warningId) => !blockedIds.has(warningId));
  }

  function stopOverriddenCueAudio(warningId: string): void {
    const overriddenIds = WARNING_AUDIO_OVERRIDES[warningId];

    if (!overriddenIds?.length) {
      return;
    }

    for (const overriddenId of overriddenIds) {
      audioSystem.samplePlayer.stopSource(overriddenId);
      synth.stopCue(overriddenId);
    }
  }

  function primeWarningAssets(): void {
    if (warningAssetsPreloaded) {
      return;
    }

    warningAssetsPreloaded = true;
    void audioSystem.assets.preloadByBus("warnings");
  }

  function tryPlayWarningSample(warningId: string): boolean {
    const warningAssetId = resolveWarningAudioAssetId(warningId);

    if (!audioSystem.assets.hasAsset(warningAssetId)) {
      return false;
    }

    return audioSystem.assets.playAsset(warningAssetId, {
      sourceId: warningId,
    });
  }
}
