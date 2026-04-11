import type { Application } from "pixi.js";
import { mountLevelSelectScene } from "./level-select-scene";
import { mountMainMenuScene } from "./main-menu-scene";
import { mountMultiplayerMenuScene } from "./multiplayer-menu-scene";
import { mountPrototypeScene } from "./prototype-scene";
import { mountSettingsMenuScene } from "./settings-menu-scene";
import { mountTutorialSelectScene } from "./tutorial-select-scene";
import { resetGameOverlayState } from "../../ui/game-overlay-store";
import { resetGameMenuState } from "../../ui/game-menu-store";
import { getSharedMapLayout } from "../maps/shared-map-layouts";
import {
  getMissionDefinition,
  ORBITAL_FLIGHT_TRAINING_MISSION_ID,
} from "../missions/mission-definitions";

type BuiltInSceneId =
  | "main-menu"
  | "settings-menu"
  | "multiplayer-menu"
  | "tutorial-select"
  | "level-select"
  | "prototype"
  | "prototype-classic"
  | "prototype-outer-range"
  | "prototype-giant"
  | "prototype-rings";

export type MissionSceneId = `mission:${string}`;
export type GameSceneId = BuiltInSceneId | `shared:${string}` | MissionSceneId;
export interface SceneHandle {
  dispose(): void;
}

export interface SceneContext {
  app: Application;
  load(sceneId: GameSceneId): void;
}

type SceneFactory = (context: SceneContext) => SceneHandle;

const SCENE_FACTORIES: Record<BuiltInSceneId, SceneFactory> = {
  "main-menu": mountMainMenuScene,
  "settings-menu": mountSettingsMenuScene,
  "multiplayer-menu": mountMultiplayerMenuScene,
  "tutorial-select": mountTutorialSelectScene,
  "level-select": mountLevelSelectScene,
  prototype: (context) => {
    const missionDefinition = getMissionDefinition(ORBITAL_FLIGHT_TRAINING_MISSION_ID);
    return mountPrototypeScene(context.app, {
      missionDefinition: missionDefinition ?? undefined,
    }, { load: context.load });
  },
  "prototype-classic": (context) =>
    mountPrototypeScene(context.app, {
      includeTrainingMoon: true,
      trainingMissionEnabled: false,
      sceneTitle: "Aurelia Combat Range",
      sceneLayout: "range",
      mapDescription:
        "Aurelia + Selene combat range | launcher, raider, refinery station",
    }, { load: context.load }),
  "prototype-outer-range": (context) =>
    mountPrototypeScene(context.app, {
      includeTrainingMoon: true,
      trainingMissionEnabled: false,
      sceneTitle: "Aurelia Outer Battery",
      sceneLayout: "range",
      rangeVariant: "outer-orbit-launcher",
      mapDescription:
        "Aurelia + Selene combat range | long-range outer launcher, raider, refinery station",
    }, { load: context.load }),
  "prototype-giant": (context) =>
    mountPrototypeScene(context.app, {
      trainingMissionEnabled: false,
      sceneTitle: "Brontes Moon Array",
      sceneLayout: "giant-moons",
      randomTargetPractice: true,
      spawnSystemId: "brontes-array",
      spawnOrbitRadius: 1680,
      mapDescription:
        "Brontes gas giant with six authored moons | mixed circular and eccentric tracks plus floating practice targets in open safe zones",
    }, { load: context.load }),
  "prototype-rings": (context) =>
    mountPrototypeScene(context.app, {
      trainingMissionEnabled: false,
      sceneTitle: "Hyperion Ringfall",
      sceneLayout: "ring-giant",
      randomTargetPractice: true,
      spawnSystemId: "hyperion-rings",
      spawnOrbitRadius: 1860,
      mapDescription:
        "Hyperion gas giant with a dense authored asteroid ring | drifting lanes through layered orbital debris and randomly spawning disintegrator targets",
    }, { load: context.load }),
};

export function buildSharedMapSceneId(layoutId: string): GameSceneId {
  return `shared:${layoutId}`;
}

export function buildMissionSceneId(missionId: string): MissionSceneId {
  return `mission:${missionId}`;
}

function resolveSceneFactory(sceneId: GameSceneId): SceneFactory | null {
  if (sceneId in SCENE_FACTORIES) {
    return SCENE_FACTORIES[sceneId as BuiltInSceneId];
  }

  if (sceneId.startsWith("shared:")) {
    const layoutId = sceneId.slice("shared:".length);
    const layout = getSharedMapLayout(layoutId);
    if (!layout) {
      return null;
    }

    return (context) => mountPrototypeScene(context.app, {
      trainingMissionEnabled: false,
      sceneTitle: layout.name,
      mapDescription: layout.mapDescription || "Shared authored test mission.",
      sharedMapLayout: layout,
      spawnSystemId: layout.spawn.systemId,
      spawnOrbitRadius: layout.spawn.orbitRadius,
      spawnOrbitDirection: layout.spawn.orbitDirection,
    }, { load: context.load });
  }

  if (sceneId.startsWith("mission:")) {
    const missionId = sceneId.slice("mission:".length);
    const missionDefinition = getMissionDefinition(missionId);
    if (!missionDefinition) {
      return null;
    }

    return (context) => mountPrototypeScene(context.app, {
      missionDefinition,
    }, { load: context.load });
  }

  return null;
}

export class SceneManager {
  private currentScene: SceneHandle | null = null;

  public constructor(private readonly app: Application) {}

  public load(sceneId: GameSceneId): void {
    resetGameOverlayState();
    resetGameMenuState();
    this.currentScene?.dispose();
    const sceneFactory = resolveSceneFactory(sceneId) ?? SCENE_FACTORIES["level-select"];
    this.currentScene = sceneFactory({
      app: this.app,
      load: (nextSceneId) => this.load(nextSceneId),
    });
  }

  public dispose(): void {
    resetGameOverlayState();
    resetGameMenuState();
    this.currentScene?.dispose();
    this.currentScene = null;
  }
}
