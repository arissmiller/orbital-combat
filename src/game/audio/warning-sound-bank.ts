import type { SynthCue, SynthStep } from "./simple-synth";

type WarningStepLength = number;
type PitchClass =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";

interface WarningPitch {
  note: PitchClass;
  octave: number;
}

interface WarningPitchEnvelope {
  startSemitones: number;
  endSemitones: number;
}

interface WarningMetronome {
  bpm: number;
  stepsPerBeat: number;
  stepCount: number;
  wave: OscillatorType;
}

interface WarningEnvelope {
  gain: number;
  gateFraction: number;
  attackSeconds: number;
  releaseSeconds: number;
}

interface WarningSequenceDefinition {
  wave?: OscillatorType;
  pitch: WarningPitch;
  pitchEnvelope: WarningPitchEnvelope;
  pattern: readonly WarningStepLength[];
  envelope: WarningEnvelope;
}

// Warning sound tuning lives here as one shared pattern sheet.
// Pattern legend:
// - 8 steps per cycle
// - `0` = rest
// - `1` = trigger a one-step note
// - `2+` = trigger a sustained note that lasts that many steps
// Pitch legend:
// - use `{ note: "A", octave: 4 }` style tuning
// - sharps are supported: `C#`, `D#`, `F#`, `G#`, `A#`
// Pitch envelope legend:
// - `startSemitones` / `endSemitones` are offsets from the base note
// - positive = higher, negative = lower
// Each warning keeps its own pitch and envelope, and can optionally
// override the default waveform for a different alert character.
export const WARNING_PATTERN_SHEET: {
  metronome: WarningMetronome;
  defaultSequence: WarningSequenceDefinition;
  sequences: Record<string, WarningSequenceDefinition>;
} = {
  metronome: {
    bpm: 160,
    stepsPerBeat: 2,
    stepCount: 8,
    wave: "square",
  },
  defaultSequence: {
    pitch: { note: "E", octave: 5 },
    pitchEnvelope: {
      startSemitones: 0,
      endSemitones: 0,
    },
    pattern: [1, 0, 0, 0, 1, 0, 0, 0],
    envelope: {
      gain: 0.24,
      gateFraction: 0.62,
      attackSeconds: 0.004,
      releaseSeconds: 0.06,
    }
  },
  sequences: {
    "nav-solution-unstable": {
      wave: "square",
      pitch: { note: "A#", octave: 1 },
      pitchEnvelope: {
        startSemitones: 0.5,
        endSemitones: 0,
      },
      pattern: [1, 1, 0, 0, 1, 1, 0, 0],
      envelope: {
        gain: 0.2,
        gateFraction: 0.72,
        attackSeconds: 0.006,
        releaseSeconds: 0.08,
      },
    },
    "enemy-lock": {
      wave: "square",
      pitch: { note: "F#", octave: 5 },
      pitchEnvelope: {
        startSemitones: -12,
        endSemitones: 0,
      },
      pattern: [2, 0, 2, 0, 2, 0, 2, 0],
      envelope: {
        gain: 0.24,
        gateFraction: 0.5,
        attackSeconds: 0.004,
        releaseSeconds: 0.035,
      },
    },
    "incoming-torpedo": {
      wave: "square",
      pitch: { note: "A#", octave: 5 },
      pitchEnvelope: {
        startSemitones: -1,
        endSemitones: 1.5,
      },
      pattern: [1, 1, 1, 1, 1, 1, 1, 1],
      envelope: {
        gain: 0.3,
        gateFraction: 0.42,
        attackSeconds: 0.01,
        releaseSeconds: 0.028,
      },
    },
    "defensive-lock-acquired": {
      wave: "sine",
      pitch: { note: "D", octave: 7 },
      pitchEnvelope: {
        startSemitones: 0,
        endSemitones: 2,
      },
      pattern: [1, 1, 0, 0, 1, 1, 0, 0],
      envelope: {
        gain: 0.18,
        gateFraction: 0.9,
        attackSeconds: 0.01,
        releaseSeconds: 0.11,
      },
    },
  },
};

export const WARNING_METRONOME = WARNING_PATTERN_SHEET.metronome;
const DEFAULT_WARNING_SEQUENCE = WARNING_PATTERN_SHEET.defaultSequence;
const WARNING_SEQUENCES = WARNING_PATTERN_SHEET.sequences;

export function getWarningCue(
  warningId: string,
  metronomeElapsedSeconds = 0,
): SynthCue {
  const sequence = WARNING_SEQUENCES[warningId] ?? DEFAULT_WARNING_SEQUENCE;
  return createSequencedCue(sequence, metronomeElapsedSeconds);
}

function createSequencedCue(
  sequence: WarningSequenceDefinition,
  metronomeElapsedSeconds: number,
): SynthCue {
  validatePattern(sequence.pattern);
  const stepDurationSeconds = getWarningStepDurationSeconds();
  const cycleDurationSeconds =
    stepDurationSeconds * WARNING_METRONOME.stepCount;
  const baseFrequencyHz = warningPitchToFrequencyHz(sequence.pitch);
  const normalizedPhaseSeconds =
    ((metronomeElapsedSeconds % cycleDurationSeconds) + cycleDurationSeconds) %
    cycleDurationSeconds;
  const currentStepIndex = Math.floor(
    normalizedPhaseSeconds / stepDurationSeconds,
  ) % WARNING_METRONOME.stepCount;
  const elapsedInCurrentStepSeconds =
    normalizedPhaseSeconds - currentStepIndex * stepDurationSeconds;
  const remainingCurrentStepSeconds =
    stepDurationSeconds - elapsedInCurrentStepSeconds;
  const steps: SynthStep[] = [];

  for (let stepOffset = 0; stepOffset < WARNING_METRONOME.stepCount; stepOffset += 1) {
    const patternIndex =
      (currentStepIndex + stepOffset) % WARNING_METRONOME.stepCount;
    const holdSteps = sequence.pattern[patternIndex];

    if (holdSteps <= 0) {
      continue;
    }

    const isCurrentStep = stepOffset === 0;
    const noteDurationSeconds =
      stepDurationSeconds * holdSteps * sequence.envelope.gateFraction;
    const offsetSeconds = isCurrentStep
      ? 0
      : remainingCurrentStepSeconds + (stepOffset - 1) * stepDurationSeconds;
    const durationSeconds = isCurrentStep
      ? Math.max(0, noteDurationSeconds - elapsedInCurrentStepSeconds)
      : noteDurationSeconds;

    if (durationSeconds <= 0.0001) {
      continue;
    }

    const startProgress = isCurrentStep
      ? Math.max(0, Math.min(1, elapsedInCurrentStepSeconds / noteDurationSeconds))
      : 0;
    const startSemitones = interpolateNumber(
      sequence.pitchEnvelope.startSemitones,
      sequence.pitchEnvelope.endSemitones,
      startProgress,
    );

    steps.push({
      offsetSeconds,
      durationSeconds,
      frequencyHz: applySemitoneOffset(baseFrequencyHz, startSemitones),
      endFrequencyHz: applySemitoneOffset(
        baseFrequencyHz,
        sequence.pitchEnvelope.endSemitones,
      ),
      gain: sequence.envelope.gain,
      wave: sequence.wave ?? WARNING_METRONOME.wave,
      attackSeconds: sequence.envelope.attackSeconds,
      releaseSeconds: sequence.envelope.releaseSeconds,
    });
  }

  return { steps };
}

function getWarningStepDurationSeconds(): number {
  return 60 / WARNING_METRONOME.bpm / WARNING_METRONOME.stepsPerBeat;
}

function validatePattern(pattern: readonly WarningStepLength[]): void {
  if (pattern.length !== WARNING_METRONOME.stepCount) {
    throw new Error(
      `Warning pattern must have exactly ${WARNING_METRONOME.stepCount} steps.`,
    );
  }

  for (const stepLength of pattern) {
    if (!Number.isFinite(stepLength) || stepLength < 0) {
      throw new Error("Warning pattern step lengths must be finite non-negative numbers.");
    }
  }
}

function warningPitchToFrequencyHz(pitch: WarningPitch): number {
  const semitoneOffsetFromA4 =
    getPitchClassOffsetFromA(pitch.note) + (pitch.octave - 4) * 12;
  return applySemitoneOffset(440, semitoneOffsetFromA4);
}

function applySemitoneOffset(
  baseFrequencyHz: number,
  semitoneOffset: number,
): number {
  return baseFrequencyHz * 2 ** (semitoneOffset / 12);
}

function getPitchClassOffsetFromA(note: PitchClass): number {
  switch (note) {
    case "C":
      return -9;
    case "C#":
      return -8;
    case "D":
      return -7;
    case "D#":
      return -6;
    case "E":
      return -5;
    case "F":
      return -4;
    case "F#":
      return -3;
    case "G":
      return -2;
    case "G#":
      return -1;
    case "A":
      return 0;
    case "A#":
      return 1;
    case "B":
      return 2;
  }
}

function interpolateNumber(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
