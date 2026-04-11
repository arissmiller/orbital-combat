import { useEffect, useMemo, useRef } from "react";
import {
  createEngineAudioManager,
  type EngineAudioManager,
} from "../game/audio/engine-audio-manager";
import { useGameOverlayState } from "./game-overlay-store";

export function GameEngineAudio(): null {
  const overlayState = useGameOverlayState();
  const managerRef = useRef<EngineAudioManager | null>(null);

  const engineAudioState = useMemo(() => {
    if (overlayState.engineAudio) {
      return overlayState.engineAudio;
    }

    const enginePanel = overlayState.systems.find((system) => system.key === "engines");
    const outputLevel = overlayState.hudVisible
      ? enginePanel?.meters[0]?.value ?? 0
      : 0;

    return {
      outputLevel,
      boosted: enginePanel?.boosted ?? false,
      thrustHeadingRadians: null,
    };
  }, [overlayState.engineAudio, overlayState.hudVisible, overlayState.systems]);

  useEffect(() => {
    managerRef.current = createEngineAudioManager();

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  useEffect(() => {
    managerRef.current?.syncEngine(engineAudioState);
  }, [engineAudioState]);

  return null;
}
