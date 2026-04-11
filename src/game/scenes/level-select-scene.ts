import { resetGameMenuState, setGameMenuState } from "../../ui/game-menu-store";
import { SHARED_MAP_LAYOUTS } from "../maps/shared-map-layouts";
import {
  buildMissionSceneId,
  buildSharedMapSceneId,
  type SceneContext,
  type SceneHandle,
} from "./scene-manager";
import { SCENARIO_DEFINITIONS } from "../scenarios/scenario-definitions";

const SHARED_TEST_MISSION_ACCENTS = [
  "#7fe7d0",
  "#a7d7ff",
  "#f2c27e",
  "#ffa58a",
];

export function mountLevelSelectScene(context: SceneContext): SceneHandle {
  const scenarioCards = Object.values(SCENARIO_DEFINITIONS)
    .sort((left, right) => {
      const orderDelta =
        (left.presentation.sortOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.presentation.sortOrder ?? Number.MAX_SAFE_INTEGER);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return left.presentation.name.localeCompare(right.presentation.name);
    })
    .map((scenario) => {
      const accentColor = scenario.presentation.accentColor ?? "#8ee8ff";
      const eyebrow = scenario.presentation.eyebrow ?? "SCENARIO";
      return {
        key: `scenario-${scenario.id}`,
        eyebrow,
        title: scenario.presentation.name,
        description:
          scenario.presentation.description
          ?? scenario.map.mapDescription
          ?? "Authored scenario mission.",
        accentColor,
        action: {
          label: "Launch Scenario",
          accentColor,
          onSelect: () => context.load(buildMissionSceneId(scenario.id)),
        },
      };
    });

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
    subtitle: "Choose a route: authored scenarios, guided orbital drills, combat sandboxes, giant-system tests, or any shared Map Lab layout saved into the registry.",
    description: "",
    accentColor: "#8b9bff",
    layout: "cards",
    actions: [],
    cards: [
      ...scenarioCards,
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
