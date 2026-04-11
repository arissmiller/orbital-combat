export interface SynthStep {
  offsetSeconds: number;
  durationSeconds: number;
  frequencyHz: number;
  endFrequencyHz?: number;
  gain: number;
  wave: OscillatorType;
  attackSeconds?: number;
  releaseSeconds?: number;
  detuneCents?: number;
}

export interface SynthCue {
  steps: readonly SynthStep[];
}

interface SimpleSynthOptions {
  masterGain?: number;
  audioContext?: AudioContext;
  destinationNode?: AudioNode;
}

export interface SimpleSynth {
  resume(): Promise<void>;
  playCue(cue: SynthCue, sourceId?: string): boolean;
  stopCue(sourceId: string): boolean;
  dispose(): Promise<void>;
}

interface ActiveSynthVoice {
  oscillator: OscillatorNode;
  gainNode: GainNode;
}

export function getSynthCueDurationSeconds(cue: SynthCue): number {
  return cue.steps.reduce(
    (maxDuration, step) =>
      Math.max(maxDuration, step.offsetSeconds + step.durationSeconds),
    0,
  );
}

export function createSimpleSynth(
  options: SimpleSynthOptions = {},
): SimpleSynth {
  const masterGainValue = options.masterGain ?? 0.14;
  const sharedAudioContext = options.audioContext ?? null;
  const destinationNode = options.destinationNode ?? null;
  const ownsAudioContext = sharedAudioContext === null;
  let audioContext: AudioContext | null = sharedAudioContext;
  let masterGainNode: GainNode | null = null;
  const activeVoicesBySource = new Map<string, Set<ActiveSynthVoice>>();

  return {
    async resume() {
      const context = ensureAudioContext();
      if (context.state !== "running") {
        await context.resume();
      }
    },
    playCue(cue, sourceId) {
      const context = ensureAudioContext();

      if (context.state !== "running" || !masterGainNode) {
        return false;
      }

      const startTime = context.currentTime;

      for (const step of cue.steps) {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        const voice = { oscillator, gainNode };
        const startSeconds = startTime + step.offsetSeconds;
        const attackSeconds = step.attackSeconds ?? 0.008;
        const releaseSeconds = step.releaseSeconds ?? 0.04;
        const sustainEndSeconds = Math.max(
          startSeconds + attackSeconds,
          startSeconds + step.durationSeconds - releaseSeconds,
        );

        oscillator.type = step.wave;
        oscillator.frequency.setValueAtTime(step.frequencyHz, startSeconds);
        if (step.endFrequencyHz !== undefined) {
          oscillator.frequency.linearRampToValueAtTime(
            step.endFrequencyHz,
            startSeconds + step.durationSeconds,
          );
        }

        if (step.detuneCents !== undefined) {
          oscillator.detune.setValueAtTime(step.detuneCents, startSeconds);
        }

        gainNode.gain.setValueAtTime(0.0001, startSeconds);
        gainNode.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, step.gain),
          Math.min(startSeconds + attackSeconds, sustainEndSeconds),
        );
        gainNode.gain.setValueAtTime(
          Math.max(0.0001, step.gain),
          sustainEndSeconds,
        );
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          startSeconds + step.durationSeconds,
        );

        oscillator.connect(gainNode);
        gainNode.connect(masterGainNode);
        if (sourceId) {
          registerVoice(sourceId, voice);
          oscillator.addEventListener("ended", () => {
            unregisterVoice(sourceId, voice);
          }, { once: true });
        }
        oscillator.start(startSeconds);
        oscillator.stop(startSeconds + step.durationSeconds + 0.03);
      }

      return true;
    },
    stopCue(sourceId) {
      const context = audioContext;
      const activeVoices = activeVoicesBySource.get(sourceId);

      if (!context || !activeVoices || activeVoices.size === 0) {
        return false;
      }

      const now = context.currentTime;
      for (const voice of activeVoices) {
        try {
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(
            Math.max(0.0001, voice.gainNode.gain.value),
            now,
          );
          voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
          voice.oscillator.stop(now + 0.03);
        } catch {
          // Ignore races with already-stopped voices.
        }
      }

      activeVoicesBySource.delete(sourceId);
      return true;
    },
    async dispose() {
      for (const sourceId of activeVoicesBySource.keys()) {
        this.stopCue(sourceId);
      }

      if (audioContext) {
        if (ownsAudioContext) {
          await audioContext.close();
        }
      }

      masterGainNode?.disconnect();
      audioContext = null;
      masterGainNode = null;
      activeVoicesBySource.clear();
    },
  };

  function ensureAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    if (!masterGainNode) {
      masterGainNode = audioContext.createGain();
      masterGainNode.gain.value = masterGainValue;
      masterGainNode.connect(destinationNode ?? audioContext.destination);
    }

    return audioContext;
  }

  function registerVoice(sourceId: string, voice: ActiveSynthVoice): void {
    const voices = activeVoicesBySource.get(sourceId) ?? new Set<ActiveSynthVoice>();
    voices.add(voice);
    activeVoicesBySource.set(sourceId, voices);
  }

  function unregisterVoice(sourceId: string, voice: ActiveSynthVoice): void {
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
