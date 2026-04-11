import { useEffect, useMemo, useRef } from "react";
import {
  createWeaponAudioManager,
  type WeaponAudioManager,
} from "../game/audio/weapon-audio-manager";
import { useGameOverlayState } from "./game-overlay-store";

export function GameWeaponAudio(): null {
  const overlayState = useGameOverlayState();
  const managerRef = useRef<WeaponAudioManager | null>(null);

  const weaponAudioState = useMemo(() => {
    return {
      disintegratorFiring:
        overlayState.weaponAudio?.disintegratorFiring ?? false,
    };
  }, [overlayState.weaponAudio]);

  useEffect(() => {
    managerRef.current = createWeaponAudioManager();

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  useEffect(() => {
    managerRef.current?.sync(weaponAudioState);
  }, [weaponAudioState]);

  return null;
}
