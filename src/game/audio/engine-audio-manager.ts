import { createGameAudioSystem } from "./game-audio-system";

const ENGINE_LOOP_PRIMARY_ASSET_ID = "engines/thruster-loop";
const ENGINE_LOOP_PRIMARY_SOURCE_ID = "player-engine-primary-loop";

interface EngineAudioManagerOptions {
  masterGain?: number;
  gainSmoothingSeconds?: number;
  playbackRateSmoothingSeconds?: number;
  minimumActiveOutput?: number;
}

export interface EngineAudioState {
  outputLevel: number;
  boosted: boolean;
  thrustHeadingRadians: number | null;
}

export interface EngineAudioManager {
  syncEngine(state: EngineAudioState): void;
  dispose(): void;
}

export function createEngineAudioManager(
  options: EngineAudioManagerOptions = {},
): EngineAudioManager {
  const gainSmoothingSeconds = options.gainSmoothingSeconds ?? 0;
  const playbackRateSmoothingSeconds = options.playbackRateSmoothingSeconds ?? 0.08;
  const minimumActiveOutput = options.minimumActiveOutput ?? 0.008;
  const audioSystem = createGameAudioSystem({
    busVolumes: {
      warnings: 0.4,
      ui: 1,
      weapons: 1,
      engines: options.masterGain ?? 0.6,
      ambience: 1,
      music: 1,
    },
  });

  let unlocked = false;
  let disposed = false;
  let primaryLoopPlaying = false;
  let latestState: EngineAudioState = {
    outputLevel: 0,
    boosted: false,
    thrustHeadingRadians: null,
  };
  const modulationPhaseA = Math.random() * Math.PI * 2;
  const modulationPhaseB = Math.random() * Math.PI * 2;
  const modulationStartMilliseconds = performance.now();

  const unlockAudio = () => {
    unlocked = true;
    void audioSystem.resume().then(() => {
      void audioSystem.assets.preloadAssets([ENGINE_LOOP_PRIMARY_ASSET_ID]);
      applyState(latestState);
    }).catch(() => {
      // Ignore resume failures; the next gesture will retry.
    });
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);

  return {
    syncEngine(state) {
      latestState = {
        outputLevel: clamp01(state.outputLevel),
        boosted: state.boosted,
        thrustHeadingRadians: normalizeHeadingRadians(state.thrustHeadingRadians),
      };

      if (!unlocked || disposed) {
        return;
      }

      applyState(latestState);
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      stopPrimaryLoop();
      void audioSystem.dispose();
    },
  };

  function applyState(state: EngineAudioState): void {
    if (state.outputLevel <= minimumActiveOutput) {
      stopPrimaryLoop();
      return;
    }

    if (!primaryLoopPlaying) {
      const loopDurationSeconds =
        audioSystem.samplePlayer.getSampleDuration(ENGINE_LOOP_PRIMARY_ASSET_ID) ?? 0;
      const randomLoopOffsetSeconds = loopDurationSeconds > 0
        ? Math.random() * loopDurationSeconds
        : 0;
      primaryLoopPlaying = audioSystem.assets.playAsset(
        ENGINE_LOOP_PRIMARY_ASSET_ID,
        {
          sourceId: ENGINE_LOOP_PRIMARY_SOURCE_ID,
          loop: true,
          gain: state.outputLevel,
          offsetSeconds: randomLoopOffsetSeconds,
          playbackRate: computeEnginePlaybackRate(state),
        },
      );
    }

    if (primaryLoopPlaying) {
      audioSystem.samplePlayer.setSourceGain(
        ENGINE_LOOP_PRIMARY_SOURCE_ID,
        state.outputLevel,
        gainSmoothingSeconds,
      );
      audioSystem.samplePlayer.setSourcePlaybackRate(
        ENGINE_LOOP_PRIMARY_SOURCE_ID,
        computeEnginePlaybackRate(state),
        playbackRateSmoothingSeconds,
      );
    }
  }

  function stopPrimaryLoop(): void {
    if (!primaryLoopPlaying) {
      return;
    }

    audioSystem.samplePlayer.stopSource(ENGINE_LOOP_PRIMARY_SOURCE_ID);
    primaryLoopPlaying = false;
  }

  function computeEnginePlaybackRate(state: EngineAudioState): number {
    const elapsedSeconds = (performance.now() - modulationStartMilliseconds) / 1000;
    const thrustPhase = state.thrustHeadingRadians ?? 0;
    const thrustPhaseInfluence = state.thrustHeadingRadians === null ? 0 : 1;
    const baseRate = 0.91 + state.outputLevel * 0.19 + (state.boosted ? 0.03 : 0);
    const modulation =
      Math.sin(
        elapsedSeconds * 0.63 + modulationPhaseA + thrustPhase * 0.75 * thrustPhaseInfluence,
      ) * 0.017
      + Math.sin(
        elapsedSeconds * 1.46 + modulationPhaseB - thrustPhase * 0.42 * thrustPhaseInfluence,
      ) * 0.009;
    return Math.max(0.7, Math.min(1.3, baseRate + modulation));
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeHeadingRadians(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const twoPi = Math.PI * 2;
  let normalized = value % twoPi;
  if (normalized <= -Math.PI) {
    normalized += twoPi;
  } else if (normalized > Math.PI) {
    normalized -= twoPi;
  }
  return normalized;
}
