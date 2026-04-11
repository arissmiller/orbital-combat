import { useEffect, useRef } from "react";
import {
  createBackgroundAudioManager,
  type BackgroundAudioManager,
} from "../game/audio/background-audio-manager";

export function GameBackgroundAudio(): null {
  const managerRef = useRef<BackgroundAudioManager | null>(null);

  useEffect(() => {
    managerRef.current = createBackgroundAudioManager();

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  return null;
}
