import { createGameAudioSystem } from "./game-audio-system";

const DISINTEGRATOR_LOOP_SOURCE_ID = "weapon-disintegrator-loop";
const DISINTEGRATOR_LOOP_ASSET_ID_CANDIDATES: readonly string[] = [
  "weapons/disintegrator-loop",
  "weapons/disentegrator-loop",
  "weapons/disintegrator_loop",
  "weapons/disentegrator_loop",
  "warnings/disintegrator-loop",
  "warnings/disentegrator-loop",
  "warnings/tesla-lightning-strike",
];

export interface WeaponAudioState {
  disintegratorFiring: boolean;
}

export interface WeaponAudioManager {
  sync(state: WeaponAudioState): void;
  dispose(): void;
}

export function createWeaponAudioManager(): WeaponAudioManager {
  const audioSystem = createGameAudioSystem({
    busVolumes: {
      weapons: 1,
      ui: 1,
      warnings: 1,
      engines: 1,
      background: 1,
      ambience: 1,
      music: 1,
    },
  });

  let disposed = false;
  let unlocked = false;
  let disintegratorLoopPlaying = false;
  let activeDisintegratorAssetId: string | null = null;
  let latestState: WeaponAudioState = {
    disintegratorFiring: false,
  };

  const unlockAudio = () => {
    unlocked = true;
    void audioSystem.resume().then(() => {
      const assetId = resolveDisintegratorAssetId();
      if (assetId) {
        void audioSystem.assets.preloadAssets([assetId]);
      }
      applyState(latestState);
    }).catch(() => {
      // Ignore resume failures; the next gesture will retry.
    });
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);

  return {
    sync(state) {
      latestState = {
        disintegratorFiring: state.disintegratorFiring,
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
      stopDisintegratorLoop();
      if (activeDisintegratorAssetId) {
        audioSystem.assets.unloadAsset(activeDisintegratorAssetId);
      }
      void audioSystem.dispose();
    },
  };

  function applyState(state: WeaponAudioState): void {
    if (!state.disintegratorFiring) {
      stopDisintegratorLoop();
      return;
    }

    if (disintegratorLoopPlaying) {
      return;
    }

    const assetId = resolveDisintegratorAssetId();
    if (!assetId) {
      return;
    }

    void audioSystem.assets.loadAsset(assetId).then((loaded) => {
      if (!loaded || disposed || !latestState.disintegratorFiring) {
        return;
      }

      const played = audioSystem.assets.playAsset(assetId, {
        sourceId: DISINTEGRATOR_LOOP_SOURCE_ID,
        loop: true,
        gain: 1,
        bus: "weapons",
      });
      if (!played) {
        return;
      }

      activeDisintegratorAssetId = assetId;
      disintegratorLoopPlaying = true;
    });
  }

  function stopDisintegratorLoop(): void {
    if (!disintegratorLoopPlaying) {
      return;
    }

    audioSystem.samplePlayer.stopSource(DISINTEGRATOR_LOOP_SOURCE_ID);
    disintegratorLoopPlaying = false;
  }

  function resolveDisintegratorAssetId(): string | null {
    for (const assetId of DISINTEGRATOR_LOOP_ASSET_ID_CANDIDATES) {
      if (audioSystem.assets.hasAsset(assetId)) {
        return assetId;
      }
    }

    return null;
  }
}
