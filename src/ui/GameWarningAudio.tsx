import { useEffect, useRef } from "react";
import {
  createWarningAudioManager,
  type WarningAudioManager,
} from "../game/audio/warning-audio-manager";
import { useGameOverlayState } from "./game-overlay-store";

export function GameWarningAudio(): null {
  const overlayState = useGameOverlayState();
  const managerRef = useRef<WarningAudioManager | null>(null);

  useEffect(() => {
    managerRef.current = createWarningAudioManager();

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  useEffect(() => {
    managerRef.current?.syncWarnings(
      overlayState.briefing
        ? []
        : [...overlayState.warnings, ...overlayState.audioCues],
    );
  }, [overlayState.audioCues, overlayState.briefing, overlayState.warnings]);

  return null;
}
