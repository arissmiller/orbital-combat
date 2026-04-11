import { useEffect, useRef } from "react";
import { bootstrapGame, type GameRuntime } from "../game/bootstrap";
import { resetGameOverlayState } from "./game-overlay-store";
import { AudioSandbox } from "./AudioSandbox";
import { GameBackgroundAudio } from "./GameBackgroundAudio";
import { GameEngineAudio } from "./GameEngineAudio";
import { GameOverlay } from "./GameOverlay";
import { GameMenu } from "./GameMenu";
import { GameWarningAudio } from "./GameWarningAudio";
import { GameWeaponAudio } from "./GameWeaponAudio";
import { MapSandbox } from "./MapSandbox";
import { PauseLauncher } from "./PauseLauncher";
import { PlanetSandbox } from "./PlanetSandbox";
import { resetDevToolsState } from "./dev-tools-store";
import { resetGameMenuState } from "./game-menu-store";
import "./audio-sandbox.css";
import "./game-overlay.css";
import "./game-menu.css";
import "./game-text.css";
import "./map-sandbox.css";
import "./planet-sandbox.css";

const AUDIO_SANDBOX_ENABLED = false;

export function GameApp() {
  const gameHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let runtime: GameRuntime | null = null;
    let disposed = false;

    void bootstrapGame(gameHostRef.current).then((nextRuntime) => {
      if (disposed) {
        nextRuntime.dispose();
        return;
      }
      runtime = nextRuntime;
    });

    return () => {
      disposed = true;
      resetDevToolsState();
      resetGameOverlayState();
      resetGameMenuState();
      runtime?.dispose();
    };
  }, []);

  return (
    <div className="game-shell">
      <div ref={gameHostRef} className="game-shell__canvas" />
      <GameWarningAudio />
      <GameEngineAudio />
      <GameWeaponAudio />
      <GameBackgroundAudio />
      {AUDIO_SANDBOX_ENABLED ? <AudioSandbox /> : null}
      <PauseLauncher />
      <MapSandbox />
      <PlanetSandbox />
      <GameMenu />
      <GameOverlay />
    </div>
  );
}
