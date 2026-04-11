import {
  createAudioMixer,
  type AudioMixer,
  type MixableAudioBusName,
} from "./audio-mixer";
import {
  createSamplePlayer,
  type AudioSamplePlayer,
} from "./sample-player";
import {
  createAudioAssetManager,
  type AudioAssetManager,
} from "./audio-asset-manager";
import { AUDIO_ASSET_DEFINITIONS } from "./audio-asset-registry";

export interface GameAudioSystem {
  mixer: AudioMixer;
  samplePlayer: AudioSamplePlayer;
  assets: AudioAssetManager;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}

interface GameAudioSystemOptions {
  masterVolume?: number;
  busVolumes?: Partial<Record<MixableAudioBusName, number>>;
}

export function createGameAudioSystem(
  options: GameAudioSystemOptions = {},
): GameAudioSystem {
  const mixer = createAudioMixer({
    masterVolume: options.masterVolume ?? 1,
    busVolumes: options.busVolumes,
  });
  const samplePlayer = createSamplePlayer({ mixer });
  const assets = createAudioAssetManager({
    samplePlayer,
    definitions: AUDIO_ASSET_DEFINITIONS,
  });

  return {
    mixer,
    samplePlayer,
    assets,
    async resume() {
      await mixer.resume();
    },
    async dispose() {
      assets.dispose();
      await samplePlayer.dispose();
      await mixer.dispose();
    },
  };
}
