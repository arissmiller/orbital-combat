import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSimpleSynth,
  type SimpleSynth,
} from "../game/audio/simple-synth";
import {
  getWarningCue,
  WARNING_PATTERN_SHEET,
} from "../game/audio/warning-sound-bank";

export function AudioSandbox() {
  const synthRef = useRef<SimpleSynth | null>(null);
  const [status, setStatus] = useState("Idle");
  const warningEntries = useMemo(
    () => Object.entries(WARNING_PATTERN_SHEET.sequences),
    [],
  );

  useEffect(() => {
    synthRef.current = createSimpleSynth({ masterGain: 0.18 });

    return () => {
      void synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  const playWarning = async (warningId: string) => {
    const synth = synthRef.current;

    if (!synth) {
      return;
    }

    await synth.resume();
    synth.playCue(getWarningCue(warningId, 0));
    setStatus(`Played ${warningId}`);
  };

  const playAllWarnings = async () => {
    const synth = synthRef.current;

    if (!synth) {
      return;
    }

    await synth.resume();
    for (const [warningId] of warningEntries) {
      synth.playCue(getWarningCue(warningId, 0));
    }
    setStatus("Played all warnings");
  };

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <aside className="audio-sandbox">
      <div className="audio-sandbox__title">Audio Sandbox</div>
      <div className="audio-sandbox__meta">
        {WARNING_PATTERN_SHEET.metronome.bpm} BPM · {WARNING_PATTERN_SHEET.metronome.stepCount} steps
      </div>
      <button
        type="button"
        className="audio-sandbox__button audio-sandbox__button--all"
        onClick={() => {
          void playAllWarnings();
        }}
      >
        Play All
      </button>
      <div className="audio-sandbox__list">
        {warningEntries.map(([warningId, sequence]) => (
          <div key={warningId} className="audio-sandbox__row">
            <div className="audio-sandbox__copy">
              <div className="audio-sandbox__label">{warningId}</div>
              <div className="audio-sandbox__detail">
                {sequence.pitch.note}
                {sequence.pitch.octave}
                {" · "}
                {sequence.pattern.join(" ")}
              </div>
            </div>
            <button
              type="button"
              className="audio-sandbox__button"
              onClick={() => {
                void playWarning(warningId);
              }}
            >
              Play
            </button>
          </div>
        ))}
      </div>
      <div className="audio-sandbox__status">{status}</div>
    </aside>
  );
}
