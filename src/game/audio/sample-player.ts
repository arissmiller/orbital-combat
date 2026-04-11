import type { AudioMixer, MixableAudioBusName } from "./audio-mixer";

export interface AudioSampleConfig {
  bus?: MixableAudioBusName;
  gain?: number;
  playbackRate?: number;
  loop?: boolean;
}

export interface AudioSamplePlaybackOptions extends AudioSampleConfig {
  offsetSeconds?: number;
  sourceId?: string;
}

export interface AudioSamplePlayer {
  resume(): Promise<void>;
  hasSample(sampleId: string): boolean;
  getSampleDuration(sampleId: string): number | null;
  loadSampleFromUrl(
    sampleId: string,
    url: string,
    config?: AudioSampleConfig,
  ): Promise<void>;
  loadSampleFromArrayBuffer(
    sampleId: string,
    data: ArrayBuffer,
    config?: AudioSampleConfig,
  ): Promise<void>;
  registerSampleBuffer(
    sampleId: string,
    buffer: AudioBuffer,
    config?: AudioSampleConfig,
  ): void;
  unloadSample(sampleId: string): void;
  playSample(
    sampleId: string,
    options?: AudioSamplePlaybackOptions,
  ): boolean;
  setSourceGain(
    sourceId: string,
    gain: number,
    rampSeconds?: number,
  ): boolean;
  setSourcePlaybackRate(
    sourceId: string,
    playbackRate: number,
    rampSeconds?: number,
  ): boolean;
  stopSource(sourceId: string): boolean;
  dispose(): Promise<void>;
}

interface SamplePlayerOptions {
  mixer: AudioMixer;
}

interface LoadedSample {
  buffer: AudioBuffer;
  config: Required<AudioSampleConfig>;
}

interface ActiveSampleVoice {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

const DEFAULT_SAMPLE_CONFIG: Required<AudioSampleConfig> = {
  bus: "ui",
  gain: 1,
  playbackRate: 1,
  loop: false,
};

export function createSamplePlayer(
  options: SamplePlayerOptions,
): AudioSamplePlayer {
  const samples = new Map<string, LoadedSample>();
  const activeVoicesBySource = new Map<string, Set<ActiveSampleVoice>>();

  return {
    async resume() {
      await options.mixer.resume();
    },
    hasSample(sampleId) {
      return samples.has(sampleId);
    },
    getSampleDuration(sampleId) {
      return samples.get(sampleId)?.buffer.duration ?? null;
    },
    async loadSampleFromUrl(sampleId, url, config) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load audio sample "${sampleId}" from ${url}`);
      }

      const data = await response.arrayBuffer();
      await this.loadSampleFromArrayBuffer(sampleId, data, config);
    },
    async loadSampleFromArrayBuffer(sampleId, data, config) {
      const decoded = await options.mixer.context.decodeAudioData(data.slice(0));
      samples.set(sampleId, {
        buffer: decoded,
        config: resolveSampleConfig(config),
      });
    },
    registerSampleBuffer(sampleId, buffer, config) {
      samples.set(sampleId, {
        buffer,
        config: resolveSampleConfig(config),
      });
    },
    unloadSample(sampleId) {
      samples.delete(sampleId);
    },
    playSample(sampleId, playbackOptions) {
      const sample = samples.get(sampleId);

      if (!sample || options.mixer.context.state !== "running") {
        return false;
      }

      const mergedConfig = {
        ...sample.config,
        ...resolveSampleConfig(playbackOptions),
      };
      const sourceNode = options.mixer.context.createBufferSource();
      const gainNode = options.mixer.context.createGain();
      const sourceId = playbackOptions?.sourceId;

      sourceNode.buffer = sample.buffer;
      sourceNode.loop = mergedConfig.loop;
      sourceNode.playbackRate.value = Math.max(0.01, mergedConfig.playbackRate);
      gainNode.gain.value = Math.max(0, mergedConfig.gain);

      sourceNode.connect(gainNode);
      gainNode.connect(options.mixer.getBus(mergedConfig.bus).inputNode);

      if (sourceId) {
        const voice = { sourceNode, gainNode };
        registerVoice(sourceId, voice);
        sourceNode.addEventListener("ended", () => {
          unregisterVoice(sourceId, voice);
        }, { once: true });
      }

      const offsetSeconds = Math.max(0, playbackOptions?.offsetSeconds ?? 0);
      sourceNode.start(0, offsetSeconds);
      return true;
    },
    setSourceGain(sourceId, gain, rampSeconds = 0) {
      const activeVoices = activeVoicesBySource.get(sourceId);
      if (!activeVoices || activeVoices.size === 0) {
        return false;
      }

      const now = options.mixer.context.currentTime;
      const clampedGain = Math.max(0, gain);
      for (const voice of activeVoices) {
        try {
          voice.gainNode.gain.cancelScheduledValues(now);
          if (rampSeconds > 0) {
            voice.gainNode.gain.setValueAtTime(
              Math.max(0.0001, voice.gainNode.gain.value),
              now,
            );
            voice.gainNode.gain.linearRampToValueAtTime(
              clampedGain,
              now + rampSeconds,
            );
          } else {
            voice.gainNode.gain.setValueAtTime(clampedGain, now);
          }
        } catch {
          // Ignore voices that already ended.
        }
      }

      return true;
    },
    setSourcePlaybackRate(sourceId, playbackRate, rampSeconds = 0) {
      const activeVoices = activeVoicesBySource.get(sourceId);
      if (!activeVoices || activeVoices.size === 0) {
        return false;
      }

      const now = options.mixer.context.currentTime;
      const clampedRate = Math.max(0.01, playbackRate);
      for (const voice of activeVoices) {
        try {
          const rateParam = voice.sourceNode.playbackRate;
          rateParam.cancelScheduledValues(now);
          if (rampSeconds > 0) {
            rateParam.setValueAtTime(
              Math.max(0.01, rateParam.value),
              now,
            );
            rateParam.linearRampToValueAtTime(clampedRate, now + rampSeconds);
          } else {
            rateParam.setValueAtTime(clampedRate, now);
          }
        } catch {
          // Ignore voices that already ended.
        }
      }

      return true;
    },
    stopSource(sourceId) {
      const activeVoices = activeVoicesBySource.get(sourceId);

      if (!activeVoices || activeVoices.size === 0) {
        return false;
      }

      const now = options.mixer.context.currentTime;
      for (const voice of activeVoices) {
        try {
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(
            Math.max(0.0001, voice.gainNode.gain.value),
            now,
          );
          voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
          voice.sourceNode.stop(now + 0.03);
        } catch {
          // Ignore voices that already ended.
        }
      }

      activeVoicesBySource.delete(sourceId);
      return true;
    },
    async dispose() {
      for (const sourceId of activeVoicesBySource.keys()) {
        this.stopSource(sourceId);
      }

      activeVoicesBySource.clear();
      samples.clear();
    },
  };

  function registerVoice(sourceId: string, voice: ActiveSampleVoice): void {
    const voices = activeVoicesBySource.get(sourceId) ?? new Set<ActiveSampleVoice>();
    voices.add(voice);
    activeVoicesBySource.set(sourceId, voices);
  }

  function unregisterVoice(sourceId: string, voice: ActiveSampleVoice): void {
    const voices = activeVoicesBySource.get(sourceId);

    if (!voices) {
      return;
    }

    voices.delete(voice);
    if (voices.size === 0) {
      activeVoicesBySource.delete(sourceId);
    }
  }
}

function resolveSampleConfig(
  config?: AudioSampleConfig,
): Required<AudioSampleConfig> {
  return {
    bus: config?.bus ?? DEFAULT_SAMPLE_CONFIG.bus,
    gain: config?.gain ?? DEFAULT_SAMPLE_CONFIG.gain,
    playbackRate: config?.playbackRate ?? DEFAULT_SAMPLE_CONFIG.playbackRate,
    loop: config?.loop ?? DEFAULT_SAMPLE_CONFIG.loop,
  };
}
