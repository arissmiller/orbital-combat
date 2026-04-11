import { logDevEvent } from "../../dev/runtime-log";
import type { MixableAudioBusName } from "./audio-mixer";
import type { AudioAssetDefinition } from "./audio-asset-registry";
import type { AudioSamplePlaybackOptions, AudioSamplePlayer } from "./sample-player";

interface AudioAssetManagerOptions {
  definitions: Record<string, AudioAssetDefinition>;
  samplePlayer: AudioSamplePlayer;
}

export interface AudioAssetManager {
  listAssets(): readonly AudioAssetDefinition[];
  hasAsset(assetId: string): boolean;
  isLoaded(assetId: string): boolean;
  loadAsset(assetId: string): Promise<boolean>;
  preloadAssets(assetIds: readonly string[]): Promise<void>;
  preloadByBus(bus: MixableAudioBusName): Promise<void>;
  playAsset(assetId: string, options?: AudioSamplePlaybackOptions): boolean;
  unloadAsset(assetId: string): void;
  dispose(): void;
}

export function createAudioAssetManager(
  options: AudioAssetManagerOptions,
): AudioAssetManager {
  const assetsById = new Map<string, AudioAssetDefinition>(
    Object.values(options.definitions).map((definition) => [definition.id, definition]),
  );
  const loadedAssetIds = new Set<string>();
  const loadingById = new Map<string, Promise<boolean>>();
  const orderedAssets = [...assetsById.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return {
    listAssets() {
      return orderedAssets;
    },
    hasAsset(assetId) {
      return assetsById.has(assetId.toLowerCase());
    },
    isLoaded(assetId) {
      const normalizedAssetId = assetId.toLowerCase();
      return (
        loadedAssetIds.has(normalizedAssetId)
        || options.samplePlayer.hasSample(normalizedAssetId)
      );
    },
    async loadAsset(assetId) {
      const normalizedAssetId = assetId.toLowerCase();
      const definition = assetsById.get(normalizedAssetId);

      if (!definition) {
        return false;
      }

      if (options.samplePlayer.hasSample(normalizedAssetId)) {
        loadedAssetIds.add(normalizedAssetId);
        return true;
      }

      const inflightLoad = loadingById.get(normalizedAssetId);
      if (inflightLoad) {
        return inflightLoad;
      }

      const loadPromise = options.samplePlayer.loadSampleFromUrl(
        normalizedAssetId,
        definition.url,
        {
          bus: definition.bus,
          gain: definition.gain,
          playbackRate: definition.playbackRate,
          loop: definition.loop,
        },
      ).then(() => {
        loadedAssetIds.add(normalizedAssetId);
        return true;
      }).catch((error) => {
        logDevEvent(
          "warn",
          "audio-asset-manager",
          `Failed to load audio asset "${normalizedAssetId}".`,
          {
            details: {
              assetId: normalizedAssetId,
              sourcePath: definition.sourcePath,
              url: definition.url,
              error:
                error instanceof Error
                  ? { name: error.name, message: error.message }
                  : String(error),
            },
            stack: error instanceof Error ? error.stack : undefined,
          },
        );
        return false;
      }).finally(() => {
        loadingById.delete(normalizedAssetId);
      });

      loadingById.set(normalizedAssetId, loadPromise);
      return loadPromise;
    },
    async preloadAssets(assetIds) {
      await Promise.all(
        assetIds.map((assetId) => this.loadAsset(assetId)),
      );
    },
    async preloadByBus(bus) {
      const assetIds = orderedAssets
        .filter((definition) => definition.bus === bus)
        .map((definition) => definition.id);
      await this.preloadAssets(assetIds);
    },
    playAsset(assetId, playbackOptions) {
      const normalizedAssetId = assetId.toLowerCase();

      if (!this.hasAsset(normalizedAssetId)) {
        return false;
      }

      if (!options.samplePlayer.hasSample(normalizedAssetId)) {
        void this.loadAsset(normalizedAssetId);
        return false;
      }

      return options.samplePlayer.playSample(
        normalizedAssetId,
        playbackOptions,
      );
    },
    unloadAsset(assetId) {
      const normalizedAssetId = assetId.toLowerCase();
      options.samplePlayer.unloadSample(normalizedAssetId);
      loadedAssetIds.delete(normalizedAssetId);
      loadingById.delete(normalizedAssetId);
    },
    dispose() {
      for (const assetId of loadedAssetIds) {
        options.samplePlayer.unloadSample(assetId);
      }
      loadedAssetIds.clear();
      loadingById.clear();
    },
  };
}
