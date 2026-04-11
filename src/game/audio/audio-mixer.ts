export type AudioBusName =
  | "master"
  | "ui"
  | "warnings"
  | "weapons"
  | "engines"
  | "background"
  | "ambience"
  | "music";

export type MixableAudioBusName = Exclude<AudioBusName, "master">;

export interface AudioMixerBus {
  name: MixableAudioBusName;
  inputNode: GainNode;
  outputNode: GainNode;
  setVolume(volume: number): void;
  getVolume(): number;
}

export interface AudioMixer {
  context: AudioContext;
  masterNode: GainNode;
  getBus(name: MixableAudioBusName): AudioMixerBus;
  setMasterVolume(volume: number): void;
  getMasterVolume(): number;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}

interface AudioMixerOptions {
  audioContext?: AudioContext;
  destinationNode?: AudioNode;
  masterVolume?: number;
  busVolumes?: Partial<Record<MixableAudioBusName, number>>;
}

const MIXER_BUS_NAMES: readonly MixableAudioBusName[] = [
  "ui",
  "warnings",
  "weapons",
  "engines",
  "background",
  "ambience",
  "music",
] as const;

export function createAudioMixer(
  options: AudioMixerOptions = {},
): AudioMixer {
  const sharedAudioContext = options.audioContext ?? null;
  const ownsAudioContext = sharedAudioContext === null;
  const context = sharedAudioContext ?? new AudioContext();
  const destinationNode = options.destinationNode ?? context.destination;
  const masterNode = context.createGain();
  const busMap = new Map<MixableAudioBusName, AudioMixerBus>();

  masterNode.gain.value = clampVolume(options.masterVolume ?? 1);
  masterNode.connect(destinationNode);

  for (const busName of MIXER_BUS_NAMES) {
    const inputNode = context.createGain();
    const outputNode = context.createGain();
    inputNode.connect(outputNode);
    outputNode.connect(masterNode);
    outputNode.gain.value = clampVolume(options.busVolumes?.[busName] ?? 1);
    busMap.set(busName, {
      name: busName,
      inputNode,
      outputNode,
      setVolume(volume) {
        outputNode.gain.value = clampVolume(volume);
      },
      getVolume() {
        return outputNode.gain.value;
      },
    });
  }

  return {
    context,
    masterNode,
    getBus(name) {
      const bus = busMap.get(name);

      if (!bus) {
        throw new Error(`Unknown audio mixer bus "${name}"`);
      }

      return bus;
    },
    setMasterVolume(volume) {
      masterNode.gain.value = clampVolume(volume);
    },
    getMasterVolume() {
      return masterNode.gain.value;
    },
    async resume() {
      if (context.state !== "running") {
        await context.resume();
      }
    },
    async dispose() {
      for (const bus of busMap.values()) {
        bus.inputNode.disconnect();
        bus.outputNode.disconnect();
      }
      masterNode.disconnect();

      if (ownsAudioContext) {
        await context.close();
      }
    },
  };
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(2, volume));
}
