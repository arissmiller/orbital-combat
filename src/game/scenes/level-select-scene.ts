import { resetGameMenuState, setGameMenuState } from "../../ui/game-menu-store";
import { SHARED_MAP_LAYOUTS } from "../maps/shared-map-layouts";
import {
  buildSharedMapSceneId,
  type SceneContext,
  type SceneHandle,
} from "./scene-manager";

const SHARED_TEST_MISSION_ACCENTS = [
  "#7fe7d0",
  "#a7d7ff",
  "#f2c27e",
  "#ffa58a",
];

export function mountLevelSelectScene(context: SceneContext): SceneHandle {
  const sharedMissionCards = Object.values(SHARED_MAP_LAYOUTS)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((layout, index) => {
      const accentColor =
        SHARED_TEST_MISSION_ACCENTS[index % SHARED_TEST_MISSION_ACCENTS.length] ?? "#7fe7d0";

      return {
        key: `shared-${layout.id}`,
        eyebrow: "TESTING",
        title: layout.name,
        description:
          layout.mapDescription
          || "Shared authored mission loaded from src/game/maps/shared-map-layouts.ts.",
        accentColor,
        action: {
          label: "Launch Test Mission",
          accentColor,
          onSelect: () => context.load(buildSharedMapSceneId(layout.id)),
        },
      };
    });

  setGameMenuState({
    visible: true,
    title: "Level Select",
    subtitle:
      "Campaign missions are temporarily offline while we rework them. Use these sandbox and test routes in the meantime.",
    description: "Campaign mission drafts removed for this playtest cycle.",
    accentColor: "#8b9bff",
    layout: "cards",
    actions: [],
    cards: [
      {
        key: "outer-battery",
        eyebrow: "SANDBOX",
        title: "Aurelia Outer Battery",
        description:
          "Aurelia and Selene again, but with a torpedo launcher orbiting beyond the moon on a very long all-aspect sensor range.",
        accentColor: "#ffb07f",
        action: {
          label: "Launch Outer Battery",
          accentColor: "#ffb07f",
          onSelect: () => context.load("prototype-outer-range"),
        },
      },
      {
        key: "giant-moons",
        eyebrow: "ASTRODYNAMICS",
        title: "Brontes Moon Array",
        description:
          "A massive primary with six moons on mixed circular and eccentric authored tracks, now seeded with floating disintegrator targets outside the moons' orbital paths.",
        accentColor: "#f2c27e",
        action: {
          label: "Launch Moon Array",
          accentColor: "#f2c27e",
          onSelect: () => context.load("prototype-giant"),
        },
      },
      {
        key: "ringfall",
        eyebrow: "ASTRODYNAMICS",
        title: "Hyperion Ringfall",
        description:
          "A gas giant surrounded by three authored asteroid bands, now seeded with randomly spawning disintegrator targets for live range practice.",
        accentColor: "#d7a56e",
        action: {
          label: "Launch Ringfall",
          accentColor: "#d7a56e",
          onSelect: () => context.load("prototype-rings"),
        },
      },
      ...sharedMissionCards,
    ],
    footerActions: [
      {
        label: "Back",
        accentColor: "#7fc7ff",
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
