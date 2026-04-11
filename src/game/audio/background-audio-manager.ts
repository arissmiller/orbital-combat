import { createGameAudioSystem } from "./game-audio-system";

interface BackgroundLoopTrackDefinition {
  sourceId: string;
  candidateAssetIds: readonly string[];
}

interface ActiveBackgroundLoopTrack {
  sourceId: string;
  assetId: string;
}

const BACKGROUND_LOOP_TRACKS: readonly BackgroundLoopTrackDefinition[] = [
  {
    sourceId: "background-undercity-loop",
    candidateAssetIds: [
      "background/ethereal-dark-undercity",
      "background/ethereal-underdark-city-loop",
      "music/ethereal-dark-undercity",
      "music/ethereal-underdark-city-loop",
      "warnings/ethereal-underdark-city-loop",
    ],
  },
  {
    sourceId: "background-razor-peaks-loop",
    candidateAssetIds: [
      "background/razor-peaks",
      "music/razor-peaks",
      "warnings/razor-peaks",
    ],
  },
] as const;

export interface BackgroundAudioManager {
  dispose(): void;
}

export function createBackgroundAudioManager(): BackgroundAudioManager {
  const audioSystem = createGameAudioSystem({
    busVolumes: {
      background: 0.3,
      ui: 1,
      warnings: 1,
      weapons: 1,
      engines: 1,
      ambience: 1,
      music: 1,
    },
  });

  let disposed = false;
  let started = false;
  const activeTracks: ActiveBackgroundLoopTrack[] = [];

  const unlockAudio = () => {
    void startBackgroundLoop();
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      for (const track of activeTracks) {
        audioSystem.samplePlayer.stopSource(track.sourceId);
      }
      const activeAssetIds = new Set(activeTracks.map((track) => track.assetId));
      for (const assetId of activeAssetIds) {
        audioSystem.assets.unloadAsset(assetId);
      }
      activeTracks.length = 0;
      void audioSystem.dispose();
    },
  };

  async function startBackgroundLoop(): Promise<void> {
    if (disposed || started) {
      return;
    }

    await audioSystem.resume();
    const resolvedTracks = resolveAvailableBackgroundTracks();
    if (resolvedTracks.length === 0) {
      return;
    }

    const uniqueAssetIds = [...new Set(resolvedTracks.map((track) => track.assetId))];
    await audioSystem.assets.preloadAssets(uniqueAssetIds);
    if (disposed || started) {
      return;
    }

    const perLoopGain = 1 / resolvedTracks.length;
    let playedAny = false;

    for (const track of resolvedTracks) {
      const loopDurationSeconds =
        audioSystem.samplePlayer.getSampleDuration(track.assetId) ?? 0;
      const randomLoopOffsetSeconds =
        loopDurationSeconds > 0 ? Math.random() * loopDurationSeconds : 0;
      const played = audioSystem.assets.playAsset(track.assetId, {
        sourceId: track.sourceId,
        loop: true,
        gain: perLoopGain,
        bus: "background",
        offsetSeconds: randomLoopOffsetSeconds,
      });
      if (!played) {
        continue;
      }

      activeTracks.push({
        sourceId: track.sourceId,
        assetId: track.assetId,
      });
      playedAny = true;
    }

    if (playedAny) {
      started = true;
    }
  }

  function resolveAvailableBackgroundTracks(): ActiveBackgroundLoopTrack[] {
    const resolvedTracks: ActiveBackgroundLoopTrack[] = [];

    for (const track of BACKGROUND_LOOP_TRACKS) {
      const matchedAssetId = track.candidateAssetIds.find((candidateId) =>
        audioSystem.assets.hasAsset(candidateId),
      );
      if (!matchedAssetId) {
        continue;
      }

      resolvedTracks.push({
        sourceId: track.sourceId,
        assetId: matchedAssetId,
      });
    }

    return resolvedTracks;
  }
}
