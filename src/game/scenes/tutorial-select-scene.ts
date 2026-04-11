import { resetGameMenuState, setGameMenuState } from "../../ui/game-menu-store";
import {
  AURELIA_COMBAT_RANGE_SCENARIO_ID,
  HELION_WEAPONS_TUTORIAL_SCENARIO_ID,
  NADIR_GATE_RUN_SCENARIO_ID,
  ORBITAL_FLIGHT_TRAINING_SCENARIO_ID,
} from "../scenarios/scenario-definitions";
import {
  buildMissionSceneId,
  type SceneContext,
  type SceneHandle,
} from "./scene-manager";

export function mountTutorialSelectScene(context: SceneContext): SceneHandle {
  setGameMenuState({
    visible: true,
    title: "Pilot Onboarding",
    subtitle: "Recommended path for early playtesters and collaborators.",
    description:
      "Run these in order to learn flight fundamentals, weapon basics, precision gate running, and live combat pressure before open sandbox sessions.",
    accentColor: "#8ee8ff",
    layout: "cards",
    actions: [],
    cards: [
      {
        key: "tutorial-step-1",
        eyebrow: "STEP 1",
        title: "Orbital Flight Training",
        description:
          "Learn stable orbits, transfer planning, and fuel-lane control. Target session: 8-12 minutes.",
        accentColor: "#8ee8ff",
        action: {
          label: "Launch Step 1",
          accentColor: "#8ee8ff",
          onSelect: () =>
            context.load(buildMissionSceneId(ORBITAL_FLIGHT_TRAINING_SCENARIO_ID)),
        },
      },
      {
        key: "tutorial-step-2",
        eyebrow: "STEP 2",
        title: "Helion Weapons Tutorial",
        description:
          "Arm disintegrators, clear floating targets, intercept dummy torpedoes, then boost Weapons and destroy the launcher. Target session: 6-10 minutes.",
        accentColor: "#9ebdff",
        action: {
          label: "Launch Step 2",
          accentColor: "#9ebdff",
          onSelect: () =>
            context.load(buildMissionSceneId(HELION_WEAPONS_TUTORIAL_SCENARIO_ID)),
        },
      },
      {
        key: "tutorial-step-3",
        eyebrow: "STEP 3",
        title: "Nadir Gate Run",
        description:
          "Fly through ten randomized gates around Nadir to build precision lane control and transfer rhythm. Target session: 4-7 minutes.",
        accentColor: "#9be7d5",
        action: {
          label: "Launch Step 3",
          accentColor: "#9be7d5",
          onSelect: () =>
            context.load(buildMissionSceneId(NADIR_GATE_RUN_SCENARIO_ID)),
        },
      },
      {
        key: "tutorial-step-4",
        eyebrow: "STEP 4",
        title: "Aurelia Combat Range",
        description:
          "Apply movement, scanner discipline, and subsystem choices under live fire. Target session: 8-15 minutes.",
        accentColor: "#ffb07f",
        action: {
          label: "Launch Step 4",
          accentColor: "#ffb07f",
          onSelect: () =>
            context.load(buildMissionSceneId(AURELIA_COMBAT_RANGE_SCENARIO_ID)),
        },
      },
      {
        key: "tutorial-step-5",
        eyebrow: "OPTIONAL",
        title: "Brontes Moon Array Sandbox",
        description:
          "Open sandbox for movement fluency in multi-moon orbital geometry. Suggested after steps 1-3.",
        accentColor: "#f2c27e",
        action: {
          label: "Launch Sandbox",
          accentColor: "#f2c27e",
          onSelect: () => context.load("prototype-giant"),
        },
      },
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
