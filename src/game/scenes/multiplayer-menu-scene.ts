import { resetGameMenuState, setGameMenuState } from "../../ui/game-menu-store";
import type { SceneContext, SceneHandle } from "./scene-manager";

export function mountMultiplayerMenuScene(context: SceneContext): SceneHandle {
  setGameMenuState({
    visible: true,
    title: "Multiplayer",
    subtitle: "Command network synchronization is in active development.",
    description:
      "For this playtest build, use Tutorial and Campaign while we finish online matchmaking and session flow.",
    accentColor: "#ffb07f",
    layout: "stack",
    actions: [],
    cards: [],
    footerActions: [
      {
        label: "Back",
        accentColor: "#8ee8ff",
        onSelect: () => context.load("main-menu"),
      },
    ],
  });

  return {
    dispose() {
      resetGameMenuState();
    },
  };
}
