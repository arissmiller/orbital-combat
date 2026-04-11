import { resetGameMenuState, setGameMenuState } from "../../ui/game-menu-store";
import { openMapEditor, openPlanetLab } from "../../ui/dev-tools-store";
import type { SceneContext, SceneHandle } from "./scene-manager";

export function mountMainMenuScene(context: SceneContext): SceneHandle {
  const actions = [
    {
      label: "Tutorial",
      accentColor: "#8ee8ff",
      onSelect: () => context.load("tutorial-select"),
    },
    {
      label: "Campaign",
      accentColor: "#9ebdff",
      onSelect: () => context.load("level-select"),
    },
    {
      label: "Multiplayer",
      accentColor: "#ffb07f",
      onSelect: () => context.load("multiplayer-menu"),
    },
    {
      label: "Settings",
      accentColor: "#89d4be",
      onSelect: () => context.load("settings-menu"),
    },
  ];

  if (import.meta.env.DEV) {
    actions.push(
      {
        label: "Map Editor",
        accentColor: "#7fe7d0",
        onSelect: () => {
          openMapEditor();
        },
      },
      {
        label: "Planet Lab",
        accentColor: "#f2c27e",
        onSelect: () => {
          openPlanetLab();
        },
      },
    );
  }

  setGameMenuState({
    visible: true,
    title: "Orbital Combat",
    subtitle: "Choose your command path.",
    description: import.meta.env.DEV
      ? "Tutorial missions are ready now. Campaign and Multiplayer routes are staged for this prototype cycle. Dev tools are available from this menu."
      : "Tutorial missions are ready now. Campaign and Multiplayer routes are staged for this prototype cycle.",
    accentColor: "#8ee8ff",
    layout: "left-column",
    actions,
    cards: [],
    footerActions: [],
  });

  return {
    dispose() {
      resetGameMenuState();
    },
  };
}
