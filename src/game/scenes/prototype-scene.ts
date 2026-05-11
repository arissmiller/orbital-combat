import { Application, Container, Graphics, Sprite, Text, Texture, type Ticker } from "pixi.js";
import { COMBAT_BALANCE } from "../combat/combat-balance";
import {
  applyCollisionEventsToShip,
  applyDefenseStatusOverrides,
  classifyScannerContact,
  classifyTorpedoScannerContact,
  cleanupMissiles,
  createLauncherState,
  type DefenseCombatVisual,
  type DefenseLockState,
  type DisintegratorEngagementState,
  type DisintegratorTarget,
  type LauncherState,
  type MissileVisual,
  type PlayerShieldState,
  type PlayerWeaponMode,
  resolveArmedDisintegrator,
  resolveArmedDisruptor,
  type ScannerContact,
  type ScannerTargetVisual,
  type TorpedoLockState,
  type TorpedoScannerContact,
  updateDefenseScannerLocks,
  updateDefenseShieldStates,
  updateDisintegratorEngagementStates,
  updateLauncherMissiles,
  updateTorpedoScannerLocks,
  isCombatDefenseVisual,
  isDefenseVisual,
} from "../combat/combat";
import {
  computeCameraFrame,
  updatePrototypeCamera,
} from "../camera/prototype-camera";
import {
  readFlightInput,
  resolveTravelRelativeThrustVector,
  updateStableMotionHeading,
} from "../flight/controls";
import {
  emptyForecast,
  type ForecastHazard,
  type TrajectoryForecast,
} from "../forecasting/forecast-cache";
import { createConfiguredGuidanceSystem } from "../forecasting/guidance-system";
import {
  estimateGuidanceWellBoundaryRadius,
  sampleGuidanceFieldMeshGrid,
} from "../forecasting/guidance-fidelity-mesh";
import { FORECAST_TUNING } from "../forecasting/forecast-tuning";
import {
  findInterceptFromForecast,
  type InterceptSolution,
} from "../forecasting/intercepts";
import { KeyTracker } from "../input/key-tracker";
import {
  createSceneInputState,
  readSceneInputActions,
} from "../input/scene-input";
import {
  createOrbitalFlightTrainingState,
  resetOrbitalFlightTrainingState,
  updateOrbitalFlightTraining,
} from "../missions/orbital-flight-training";
import {
  createNadirRandomGateRunState,
  resetNadirRandomGateRunState,
  updateNadirRandomGateRun,
} from "../missions/nadir-random-gate-run";
import {
  createMissionRuntimeState,
  resetMissionRuntimeState,
  updateMissionRuntime,
  type MissionRuntimeSnapshot,
} from "../missions/mission-runtime";
import {
  createDefenseConfigs,
  createOuterOrbitDefenseConfigs,
  createGiantMoonSystemConfigs,
  createRingedGasGiantSystemConfigs,
  createRefinerySystemConfigs,
  createSingleMoonWorldSystemConfigs,
  createSimpleSystemConfigs,
  getSystemSpawnRootConfig,
} from "../maps/prototype-maps";
import {
  createCelestialEphemeris,
  createCelestialStateEvaluator,
  type CelestialStateEvaluator,
  type CelestialStateMap,
} from "../maps/celestial-ephemeris";
import { getSharedMapLayout } from "../maps/shared-map-layouts";
import type {
  CelestialConfig,
  DefenseConfig,
  MapSpawnOrbitDirection,
  SharedMapLayout,
} from "../maps/types";
import type {
  MissionDefinition,
  MissionMarkerDefinition,
} from "../missions/mission-definition";
import type {
  WorldMarkerEvent,
  WorldMarkerView,
} from "../world/world-marker";
import {
  DEFAULT_MISSION_CONTROL_STATE,
  type MissionControlState,
} from "../missions/mission-control";
import { decorateRefuelBodySprite } from "../rendering/refuel-body-decoration";
import {
  createTacticalEntitySystem,
  resetTacticalEntitySystem,
  upsertTacticalEntity,
  type TacticalEntitySystem,
} from "../tactical/tactical-entity-system";
import {
  createGameWarningManagerState,
  resetGameWarningManagerState,
  updateGameWarningManager,
  type GameWarningState,
} from "../warnings/game-warning-manager";
import { createSceneEventQueue } from "./scene-event-queue";
import type { SceneCameraOverride } from "./scene-camera";
import {
  createFuelDroneSupportState,
  resetFuelDroneSupportState,
  syncFuelDroneGraphic,
  TRAINING_FUEL_DRONE_SUPPORT_CONFIG,
  updateFuelDroneSupport,
} from "./prototype-scene-fuel-drone";
import type { OrbitalBodyState } from "../physics/body";
import { FixedStepLoop } from "../physics/fixed-step-loop";
import { PHYSICS_TUNING } from "../physics/physics-tuning";
import { OrbitalWorld, type CollisionEvent } from "../physics/orbital-world";
import { WORLD_ENTITY_STYLES } from "../rendering/world-entity-styles";
import { createCelestialSprite } from "../rendering/celestial-generator";
import {
  drawDefenseLockOverlay,
  drawDefenseScannerCones,
  drawDefenseSensorRanges,
  drawDisintegratorEngagementLines,
  drawEngineCompass,
  drawForceVector,
  drawGuidanceFidelityMesh,
  drawGravityWellBoundaries,
  drawHostileBeamLines,
  drawInterceptReticles,
  drawLikelyEnemyMarkers,
  drawOrbitalGuides,
  drawPlayerWeaponRange,
  drawScannerContacts,
  drawScannerRadius,
  drawShieldBubble,
  drawTorpedoLockOverlay,
  drawTrainingMissionArea,
} from "../rendering/prototype-overlays";
import { WORLD_OVERLAY_STYLES, getBurnForecastColor } from "../rendering/world-overlay-styles";
import {
  absorbDefenseBeamDamage,
  absorbDefenseTorpedoImpact,
  consumeEngineFuel,
  createShipSystemsState,
  focusSubsystem,
  getDefenseEnemyLockMultiplier,
  getDefenseDisintegratorResistanceMultiplier,
  getEngineFuelFraction,
  getEngineFullBoostMultiplier,
  getEngineLateralThrustScale,
  getEngineProgradeRetrogradeThrustScale,
  getEngineResponseMultiplier,
  getEngineSuperBurnMultiplier,
  getEngineThrustMultiplier,
  hasInstantDefenseDisintegratorLocks,
  getScannerLockMultiplier,
  getScannerRangeMultiplier,
  getWeaponChargeCapacityMultiplier,
  getWeaponEnergyCostMultiplier,
  getWeaponDamageMultiplier,
  getWeaponRangeMultiplier,
  refillEngineFuel,
  type ShipSystemsState,
  updateShipSystems,
} from "../ships/systems";
import type { Vector2Like } from "../physics/vector2";
import { getDevToolsState } from "../../ui/dev-tools-store";
import { setGameOverlayState } from "../../ui/game-overlay-store";
import { resetGameMenuState, setGameMenuState } from "../../ui/game-menu-store";
import { buildPrototypeHudState } from "../../ui/prototype-hud";
import type { GameSceneId, SceneHandle } from "./scene-manager";

type PrototypeSceneEvent =
  | {
      type: "world-marker-entered";
      emittedAtSeconds: number;
      payload: {
        markerId: string;
        label: string;
      };
    }
  | {
      type: "world-marker-exited";
      emittedAtSeconds: number;
      payload: {
        markerId: string;
        label: string;
      };
    }
  | {
      type: "world-marker-activated";
      emittedAtSeconds: number;
      payload: {
        markerId: string;
        label: string;
      };
    };

interface CelestialVisual {
  config: CelestialConfig;
  body: OrbitalBodyState;
  sprite: Container;
}

interface ShipSpawnState {
  systemId: string;
  position: Vector2Like;
  velocity: Vector2Like;
  heading: number;
}

interface DefenseVisual extends DefenseCombatVisual {
  sprite: Graphics;
}

interface LikelyEnemyMarker {
  id: string;
  label: string;
  systemId: string;
  position: Vector2Like;
  radius: number;
  linkedDefenseId: string;
  enemyClass:
    | "surfaceLauncher"
    | "orbitalLauncher"
    | "raider"
    | "supportStation"
    | "trainingTarget"
    | "unknown";
}

interface CombatTargetSnapshot {
  scannerContacts: ScannerContact[];
  visibleContacts: ScannerContact[];
  visibleDefenseContacts: Array<ScannerContact & { visual: DefenseVisual }>;
  visibleFuelStations: DefenseVisual[];
  torpedoContacts: TorpedoScannerContact[];
  visibleTorpedoes: TorpedoScannerContact[];
  lockedDisintegratorTargets: TorpedoScannerContact[];
  lockedDefenseTargets: Array<ScannerContact & { visual: DefenseVisual }>;
  lockedDisruptorTargets: Array<ScannerContact & { visual: DefenseVisual }>;
  eligibleDisintegratorTargets: DisintegratorTarget[];
  eligibleDisruptorTargets: DisintegratorTarget[];
  activeWeaponTargets: DisintegratorTarget[];
}

interface PlayerWeaponFireResult {
  fired: boolean;
  targetCount: number;
  chargePerTarget: number;
  neutralizedTorpedoCount: number;
}

interface RenderedPathState {
  points: Vector2Like[];
  sourcePositions: readonly Vector2Like[] | null;
  stablePointCount: number;
  visibleStablePointCount: number;
  pendingStablePointCount: number;
  pendingStableFrames: number;
  confidence: ForecastConfidenceLevel;
  pendingConfidence: ForecastConfidenceLevel | null;
  pendingConfidenceFrames: number;
}

type ForecastConfidenceLevel = "high" | "medium" | "low" | "unstable";

const EMPTY_PLAYER_WEAPON_FIRE_RESULT: PlayerWeaponFireResult = {
  fired: false,
  targetCount: 0,
  chargePerTarget: 0,
  neutralizedTorpedoCount: 0,
};

interface PathSegmentInstruction {
  start: Vector2Like;
  end: Vector2Like;
}

interface PathRenderer {
  container: Container;
  segments: Sprite[];
  endpoint: Graphics;
}

interface MapKillBorder {
  center: Vector2Like;
  radius: number;
}

interface ForecastVisibilityState {
  coastPath: Vector2Like[];
  burnPath: Vector2Like[];
  boostPath: Vector2Like[];
  navigationWarning: string | null;
}

interface HudConfig {
  overlays: {
    disintegratorRange: boolean;
    defenseSensorRanges: boolean;
    scannerRadius: boolean;
    defenseScannerCones: boolean;
    interceptReticles: boolean;
    defenseLocks: boolean;
    torpedoLocks: boolean;
    disintegratorEngagement: boolean;
    scannerContacts: boolean;
    orbitalGuides: boolean;
    forceVector: boolean;
    gravityWellBoundaries: boolean;
    guidanceFidelityMesh: boolean;
  };
  telemetry: {
    fps: boolean;
    nearestBody: boolean;
    nearestDefense: boolean;
    localRange: boolean;
    speed: boolean;
    throttle: boolean;
    boost: boolean;
    state: boolean;
    disintegrator: boolean;
    system: boolean;
    scanner: boolean;
    defenseLocks: boolean;
    torpedoContacts: boolean;
    disintegratorRange: boolean;
    disintegratorLocks: boolean;
    torpedoesInFlight: boolean;
    trackedIntercepts: boolean;
    torpedoScannerLocks: boolean;
    subsystemFocus: boolean;
    subsystemStatus: boolean;
    cameraZoom: boolean;
    mapInfo: boolean;
    activeBurn: boolean;
    previewLegend: boolean;
    contacts: boolean;
    occludedContacts: boolean;
    warnings: boolean;
    controls: boolean;
    systems: boolean;
    utility: boolean;
  };
}

const WARNING_PRIORITIES = {
  defensiveLockAcquired: 150,
  navSolutionUnstable: 100,
  enemyLock: 200,
  incomingTorpedo: 300,
  tutorialComplete: 350,
} as const;
const PLAYER_DEATH_AUDIO_CUE_ID = "player-death";
const HELION_WEAPONS_TUTORIAL_SCENARIO_ID = "helion-weapons-training";
const HELION_WEAPONS_TUTORIAL_REQUIRED_INTERCEPTS = 4;
const TUTORIAL_COMPLETE_NOTIFICATION_SECONDS = 4;
const MAP_KILL_BORDER_PADDING = 1800;
const MAP_KILL_BORDER_MIN_RADIUS = 5400;
const MAP_KILL_BORDER_ARROW_DISTANCE = 540;
const MAP_KILL_BORDER_ARROW_RADIUS = 190;
const MAP_KILL_BORDER_STRIPE_OUTER_WIDTH = 340;
const MAP_KILL_BORDER_STRIPE_INNER_OFFSET = 22;

interface PrototypeSceneOptions {
  includeTrainingMoon?: boolean;
  trainingMissionEnabled?: boolean;
  missionDefinition?: MissionDefinition;
  sceneTitle?: string;
  sceneLayout?: "range" | "giant-moons" | "ring-giant";
  randomTargetPractice?: boolean;
  rangeVariant?: "classic" | "outer-orbit-launcher";
  spawnSystemId?: string;
  spawnAnchorBodyId?: string;
  spawnOrbitRadius?: number;
  spawnOrbitDirection?: "cw" | "ccw";
  sharedMapLayout?: SharedMapLayout;
  mapDescription?: string;
}

export function mountPrototypeScene(
  app: Application,
  options: PrototypeSceneOptions = {},
  navigation?: { load(sceneId: GameSceneId): void },
): SceneHandle {
  const sceneOptions = {
    includeTrainingMoon: false,
    trainingMissionEnabled: true,
    missionDefinition: null as MissionDefinition | null,
    sceneTitle: "Orbital Flight Training",
    sceneLayout: "range" as const,
    randomTargetPractice: false,
    rangeVariant: "classic" as const,
    spawnSystemId: null as string | null,
    spawnAnchorBodyId: null as string | null,
    spawnOrbitRadius: null as number | null,
    spawnOrbitDirection: null as "cw" | "ccw" | null,
    sharedMapLayout: null as SharedMapLayout | null,
    mapDescription:
      "training world + neighboring binary + Vesta fuel world + Nadir gas giant with two moons | launcher + raider",
    ...options,
  };
  const missionDefinition = sceneOptions.missionDefinition;
  const missionSharedMapLayout = missionDefinition?.map.layout
    ?? (missionDefinition?.map.layoutId
      ? getSharedMapLayout(missionDefinition.map.layoutId)
      : null);
  if (missionDefinition?.map.layoutId && !missionSharedMapLayout) {
    throw new Error(
      `Missing mission map layout for ${missionDefinition.id}: ${missionDefinition.map.layoutId}`,
    );
  }
  const activeSharedMapLayout = sceneOptions.sharedMapLayout ?? missionSharedMapLayout;
  const activeMapDescription =
    missionDefinition?.description
    ?? activeSharedMapLayout?.mapDescription
    ?? sceneOptions.mapDescription
    ?? "Prototype scenario";
  const activeSceneTitle =
    missionDefinition?.name
    ?? sceneOptions.sceneTitle
    ?? "Prototype Scene";
  const missionRuntimeLogicId = missionDefinition?.runtime?.logicId
    ?? (sceneOptions.trainingMissionEnabled ? "orbital-flight-training" : "none");
  const orbitalFlightTrainingEnabled =
    missionRuntimeLogicId === "orbital-flight-training";
  const nadirRandomGateRunEnabled =
    missionRuntimeLogicId === "nadir-random-gate-run";
  const helionWeaponsTutorialEnabled =
    missionDefinition?.id === HELION_WEAPONS_TUTORIAL_SCENARIO_ID;
  const customTrainingMissionEnabled =
    orbitalFlightTrainingEnabled || nadirRandomGateRunEnabled;
  const missionSpawnOverride = missionDefinition?.map.spawnOverride ?? null;
  const sceneRoot = new Container();
  app.stage.addChild(sceneRoot);
  const world = new Container();
  sceneRoot.addChild(world);
  const celestialNameOverlay = new Container();
  sceneRoot.addChild(celestialNameOverlay);
  const shipOverlayRoot = new Graphics();
  sceneRoot.addChild(shipOverlayRoot);
  const debugHudRoot = new Container();
  sceneRoot.addChild(debugHudRoot);
  const sceneEvents = createSceneEventQueue<PrototypeSceneEvent>();
  const tacticalEntities = createTacticalEntitySystem();

  const getScreenCenter = () => ({
    x: app.screen.width / 2,
    y: app.screen.height / 2,
  });

  let cameraZoom = 1;
  let elapsedSeconds = 0;
  let cameraCenter: Vector2Like = { x: 0, y: 0 };
  let sceneCameraOverride: SceneCameraOverride | null = null;
  let tacticalViewActive = false;
  let fpsSmoothed = 60;
  const trainingStartingFuelFraction = 0.42;
  const baseScannerRange = 1450;
  const baseDisintegratorRange = 280;
  const shipSystems = createShipSystemsState();
  if (orbitalFlightTrainingEnabled) {
    shipSystems.engines.charge =
      shipSystems.engines.maxCharge * trainingStartingFuelFraction;
  } else if (nadirRandomGateRunEnabled) {
    shipSystems.engines.charge = shipSystems.engines.maxCharge;
  }
  const renderedPathCache = {
    coast: createRenderedPathState(),
    burn: createRenderedPathState(),
    boost: createRenderedPathState(),
  };
  const hudConfig: HudConfig = {
    overlays: {
      disintegratorRange: true,
      defenseSensorRanges: true,
      scannerRadius: true,
      defenseScannerCones: false,
      interceptReticles: true,
      defenseLocks: true,
      torpedoLocks: true,
      disintegratorEngagement: true,
      scannerContacts: true,
      orbitalGuides: true,
      forceVector: true,
      gravityWellBoundaries: true,
      guidanceFidelityMesh: false,
    },
    telemetry: {
      fps: true,
      nearestBody: true,
      nearestDefense: true,
      localRange: true,
      speed: true,
      throttle: true,
      boost: true,
      state: true,
      disintegrator: true,
      system: true,
      scanner: true,
      defenseLocks: true,
      torpedoContacts: true,
      disintegratorRange: true,
      disintegratorLocks: true,
      torpedoesInFlight: true,
      trackedIntercepts: true,
      torpedoScannerLocks: true,
      subsystemFocus: true,
      subsystemStatus: true,
      cameraZoom: true,
      mapInfo: true,
      activeBurn: true,
      previewLegend: true,
      contacts: true,
      occludedContacts: true,
      warnings: true,
      controls: true,
      systems: true,
      utility: true,
    },
  };

  const gravitationalConstant = PHYSICS_TUNING.world.gravitationalConstant;
  const simulation = new OrbitalWorld({
    gravitationalConstant,
    softening: PHYSICS_TUNING.world.softening,
  });
  const stepper = new FixedStepLoop(PHYSICS_TUNING.fixedStep);

  const startingSystem = {
    systemId: "aurelia-training",
    label: "Training",
    center: { x: 0, y: 0 },
  };
  const refinerySystem = {
    systemId: "vesta-refinery",
    label: "Vesta",
    center: { x: -4380, y: 760 },
  };
  const moonRunSystem = {
    systemId: "nadir-moon",
    label: "Nadir",
    center: { x: -4380, y: 5060 },
  };
  const giantMoonSystem = {
    systemId: "brontes-array",
    label: "Brontes",
    center: { x: 0, y: 0 },
  };
  const ringGiantSystem = {
    systemId: "hyperion-rings",
    label: "Hyperion",
    center: { x: 0, y: 0 },
  };
  let celestialConfigs: CelestialConfig[];
  let defenseConfigs: DefenseConfig[];

  if (activeSharedMapLayout) {
    celestialConfigs = activeSharedMapLayout.celestialConfigs.map((config) => ({
      ...config,
      rootPosition: { x: config.rootPosition.x, y: config.rootPosition.y },
      orbitCenterOffset: config.orbitCenterOffset
        ? { x: config.orbitCenterOffset.x, y: config.orbitCenterOffset.y }
        : undefined,
    }));
    defenseConfigs = activeSharedMapLayout.defenseConfigs.map((config) => ({
      ...config,
    }));
  } else if (sceneOptions.sceneLayout === "giant-moons") {
    celestialConfigs = createGiantMoonSystemConfigs(
      giantMoonSystem.systemId,
      giantMoonSystem.label,
      giantMoonSystem.center,
    );
    defenseConfigs = [];
  } else if (sceneOptions.sceneLayout === "ring-giant") {
    celestialConfigs = createRingedGasGiantSystemConfigs(
      ringGiantSystem.systemId,
      ringGiantSystem.label,
      ringGiantSystem.center,
    );
    defenseConfigs = [];
  } else {
    const trainingCelestialConfigs = createSimpleSystemConfigs(
      startingSystem.systemId,
      startingSystem.label,
      startingSystem.center,
      sceneOptions.includeTrainingMoon,
    );
    const refineryCelestialConfigs = createRefinerySystemConfigs(
      refinerySystem.systemId,
      refinerySystem.label,
      refinerySystem.center,
    );
    const moonRunCelestialConfigs = createSingleMoonWorldSystemConfigs(
      moonRunSystem.systemId,
      moonRunSystem.label,
      moonRunSystem.center,
    );
    celestialConfigs = [
      ...trainingCelestialConfigs,
      ...refineryCelestialConfigs,
      ...moonRunCelestialConfigs,
    ];
    const startingDefenseConfigs =
      sceneOptions.rangeVariant === "outer-orbit-launcher"
        ? createOuterOrbitDefenseConfigs(
            startingSystem.systemId,
            trainingCelestialConfigs,
          )
        : createDefenseConfigs(
            startingSystem.systemId,
            trainingCelestialConfigs,
          );
    defenseConfigs = [
      ...startingDefenseConfigs,
    ];
  }

  let helionLauncherTemplateConfig: DefenseConfig | null = null;
  if (helionWeaponsTutorialEnabled) {
    const launcherConfigIndex = defenseConfigs.findIndex(
      (config) => config.weaponType === "torpedo",
    );
    if (launcherConfigIndex >= 0) {
      helionLauncherTemplateConfig = {
        ...defenseConfigs[launcherConfigIndex],
      };
      defenseConfigs.splice(launcherConfigIndex, 1);
    }
  }
  let helionPendingLauncherConfig: DefenseConfig | null =
    helionLauncherTemplateConfig
      ? { ...helionLauncherTemplateConfig }
      : null;
  const mapKillBorder = computeMapKillBorder(celestialConfigs, defenseConfigs);

  const celestialEphemeris = createCelestialEphemeris(celestialConfigs);
  const celestialStateEvaluator = createCelestialStateEvaluator(celestialEphemeris);
  const guidanceSystem = createConfiguredGuidanceSystem({
    applyCelestialState: (simulation, configs, timeSeconds) =>
      applyCelestialState(
        simulation,
        configs,
        timeSeconds,
        celestialStateEvaluator,
      ),
    applyDefenseState: (simulation, configs, celestialConfigs, timeSeconds) =>
      applyDefenseState(
        simulation,
        configs,
        celestialConfigs,
        timeSeconds,
        celestialStateEvaluator,
      ),
    getPredictionSubdivisionCount,
    detectHazard,
  });
  const initialCelestialState = celestialStateEvaluator.evaluate(0);
  const initialDefenseState = evaluateDefenseState(
    defenseConfigs,
    initialCelestialState,
    0,
  );
  const orbitalGuides = new Graphics();
  world.addChild(orbitalGuides);

  const gravityWellOverlay = new Graphics();
  world.addChild(gravityWellOverlay);

  const guidanceMeshOverlay = new Graphics();
  world.addChild(guidanceMeshOverlay);

  const missionAreaOverlay = new Graphics();
  world.addChild(missionAreaOverlay);
  const mapKillBorderOverlay = new Graphics();
  world.addChild(mapKillBorderOverlay);
  const missionAreaLabelOverlay = new Container();
  world.addChild(missionAreaLabelOverlay);

  const disintegratorRangeOverlay = new Graphics();
  world.addChild(disintegratorRangeOverlay);

  const shieldBubbleOverlay = new Graphics();
  world.addChild(shieldBubbleOverlay);

  const defenseRangeOverlay = new Graphics();
  world.addChild(defenseRangeOverlay);

  const scannerRadiusOverlay = new Graphics();
  world.addChild(scannerRadiusOverlay);

  const defenseConeOverlay = new Graphics();
  world.addChild(defenseConeOverlay);

  const interceptReticleOverlay = new Graphics();
  world.addChild(interceptReticleOverlay);

  const defenseLockOverlay = new Graphics();
  world.addChild(defenseLockOverlay);

  const torpedoLockOverlay = new Graphics();
  world.addChild(torpedoLockOverlay);

  const disintegratorEngagementOverlay = new Graphics();
  world.addChild(disintegratorEngagementOverlay);

  const hostileBeamOverlay = new Graphics();
  world.addChild(hostileBeamOverlay);

  const likelyEnemyOverlay = new Graphics();
  world.addChild(likelyEnemyOverlay);

  const scannerContactsOverlay = new Graphics();
  world.addChild(scannerContactsOverlay);

  const forceVectorOverlay = new Graphics();
  world.addChild(forceVectorOverlay);

  const gravityWellBoundaryRadii = new Map<string, number>();
  for (const config of celestialConfigs) {
    if (config.hidden || config.mass <= 0) {
      continue;
    }

    const initialState = initialCelestialState.get(config.id);
    if (!initialState) {
      continue;
    }

    const boundaryRadius = estimateGuidanceWellBoundaryRadius(
      {
        id: config.id,
        systemId: config.systemId,
        mass: config.mass,
        radius: config.radius,
        position: initialState.position,
        affectsGravity: config.affectsGravity ?? true,
      },
      {
        gradientSampleDistance: FORECAST_TUNING.hybrid.gradientSampleDistance,
        adaptiveGradientStart: FORECAST_TUNING.hybrid.adaptiveGradientStart,
        fullSimulationGradientThreshold:
          FORECAST_TUNING.hybrid.fullSimulationGradientThreshold,
      },
    );

    if (boundaryRadius) {
      gravityWellBoundaryRadii.set(config.id, boundaryRadius);
    }
  }

  const celestialVisuals = celestialConfigs.map((config) => {
    const state = initialCelestialState.get(config.id);

    if (!state) {
      throw new Error(`Missing initial state for ${config.id}`);
    }

    const body = simulation.addBody({
      id: config.id,
      mass: config.mass,
      radius: config.radius,
      collisionRadius: config.collisionRadius ?? config.radius,
      systemId: config.systemId,
      isStatic: true,
      position: state.position,
      velocity: state.velocity,
      affectsGravity: config.affectsGravity ?? true,
      receivesGravity: config.receivesGravity ?? true,
    });

    const sprite = createCelestialSprite(config);
    decorateRefuelBodySprite(sprite, {
      bodyRadius: config.radius,
      refuelRange: config.refuelRange,
      refuelLaneRadius: config.refuelLaneRadius,
      refuelLaneThickness: config.refuelLaneThickness,
      showBodyMarker: config.showRefuelMarker,
    });
    sprite.visible = !config.hidden;
    world.addChild(sprite);

    return {
      config,
      body,
      sprite,
    };
  });

  if (hudConfig.overlays.orbitalGuides) {
    drawOrbitalGuides(orbitalGuides, celestialVisuals);
  }
  if (hudConfig.overlays.gravityWellBoundaries) {
    drawGravityWellBoundaries(
      gravityWellOverlay,
      celestialVisuals,
      gravityWellBoundaryRadii,
    );
  }

  const createDefenseVisual = (
    config: DefenseConfig,
    state: { position: Vector2Like; velocity: Vector2Like },
  ): DefenseVisual => {
    const body = simulation.addBody({
      id: config.id,
      mass: 0,
      radius: config.radius,
      collisionRadius: config.weaponType === "target" ? 0 : config.radius,
      collisionExclusions: config.weaponType === "target" ? ["interceptor"] : undefined,
      systemId: config.systemId,
      isStatic: true,
      affectsGravity: false,
      position: state.position,
      velocity: state.velocity,
    });

    const sprite = new Graphics();
    if (config.weaponType === "beam") {
      sprite
        .poly([
          0, -config.radius - 6,
          config.radius + 2, 0,
          0, config.radius + 6,
          -config.radius - 2, 0,
        ])
        .fill(config.color)
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.beamStrokeColor,
          width: WORLD_ENTITY_STYLES.defense.beamStrokeWidth,
          alpha: WORLD_ENTITY_STYLES.defense.beamStrokeAlpha,
        });
    } else if (config.weaponType === "target") {
      sprite
        .circle(0, 0, config.radius + 2)
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.targetStrokeColor,
          width: WORLD_ENTITY_STYLES.defense.targetStrokeWidth,
          alpha: WORLD_ENTITY_STYLES.defense.targetStrokeAlpha,
        });
      sprite
        .circle(0, 0, Math.max(6, config.radius * 0.56))
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.targetStrokeColor,
          width: WORLD_ENTITY_STYLES.defense.targetStrokeWidth,
          alpha: WORLD_ENTITY_STYLES.defense.targetStrokeAlpha,
        });
      sprite
        .circle(0, 0, Math.max(3, config.radius * 0.22))
        .fill(config.color)
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.targetDetailColor,
          width: 1.5,
          alpha: 0.95,
        });
      sprite
        .rect(-1.5, -config.radius - 5, 3, config.radius * 2 + 10)
        .fill(WORLD_ENTITY_STYLES.defense.targetDetailColor);
      sprite
        .rect(-config.radius - 5, -1.5, config.radius * 2 + 10, 3)
        .fill(WORLD_ENTITY_STYLES.defense.targetDetailColor);
    } else if (config.weaponType === "station") {
      sprite
        .roundRect(-config.radius - 2, -config.radius + 2, (config.radius + 2) * 2, (config.radius - 2) * 2, 6)
        .fill(config.color)
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.stationStrokeColor,
          width: WORLD_ENTITY_STYLES.defense.stationStrokeWidth,
          alpha: WORLD_ENTITY_STYLES.defense.stationStrokeAlpha,
        });
      sprite
        .rect(-4, -config.radius - 6, 8, config.radius * 2 + 12)
        .fill(WORLD_ENTITY_STYLES.defense.stationDetailColor);
      sprite
        .rect(-config.radius - 6, -4, config.radius * 2 + 12, 8)
        .fill(WORLD_ENTITY_STYLES.defense.stationDetailColor);
    } else if (config.anchorToParent === "dark-side") {
      sprite
        .poly([
          0, -config.radius - 4,
          config.radius, config.radius,
          0, config.radius * 0.35,
          -config.radius, config.radius,
        ])
        .fill(config.color)
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.launcherStrokeColor,
          width: WORLD_ENTITY_STYLES.defense.launcherStrokeWidth,
          alpha: WORLD_ENTITY_STYLES.defense.launcherStrokeAlpha,
        });
    } else {
      sprite
        .roundRect(-config.radius, -config.radius, config.radius * 2, config.radius * 2, 4)
        .fill(config.color)
        .stroke({
          color: WORLD_ENTITY_STYLES.defense.launcherStrokeColor,
          width: WORLD_ENTITY_STYLES.defense.launcherStrokeWidth,
          alpha: WORLD_ENTITY_STYLES.defense.genericStrokeAlpha,
        });
    }
    world.addChild(sprite);

    return {
      config,
      body,
      sprite,
      destroyed: false,
      disintegratorEnergyAbsorbed: 0,
      shieldCharge: config.shieldCapacity,
      shieldMaxCharge: config.shieldCapacity,
      shieldRechargePerSecond: config.shieldRechargePerSecond,
      shieldDisruptedUntilSeconds: 0,
      disabledUntilSeconds: 0,
      disabledHoldPosition: null,
    };
  };

  const defenseVisuals: DefenseVisual[] = defenseConfigs.map((config) => {
    const state = initialDefenseState.get(config.id);

    if (!state) {
      throw new Error(`Missing initial defense state for ${config.id}`);
    }

    return createDefenseVisual(config, state);
  });
  const helionTutorialTargetIds = helionWeaponsTutorialEnabled
    ? new Set(
        defenseVisuals
          .filter((defense) => defense.config.weaponType === "target")
          .map((defense) => defense.config.id),
      )
    : new Set<string>();
  const helionTutorialLauncherId = helionWeaponsTutorialEnabled
    ? helionLauncherTemplateConfig?.id
      ?? defenseVisuals.find((defense) => defense.config.weaponType === "torpedo")?.config.id
      ?? null
    : null;

  const sharedSpawn = activeSharedMapLayout?.spawn ?? null;
  const spawnSystemId = sceneOptions.spawnSystemId
    ?? missionSpawnOverride?.systemId
    ?? sharedSpawn?.systemId
    ?? (sceneOptions.sceneLayout === "giant-moons"
      ? giantMoonSystem.systemId
      : sceneOptions.sceneLayout === "ring-giant"
        ? ringGiantSystem.systemId
        : startingSystem.systemId);
  const spawnRootConfig = getSystemSpawnRootConfig(celestialConfigs, spawnSystemId);
  const spawnAnchorBodyId = sceneOptions.spawnAnchorBodyId
    ?? missionSpawnOverride?.anchorBodyId
    ?? sharedSpawn?.anchorBodyId
    ?? null;
  const spawnAnchorConfig = resolveSpawnAnchorConfig({
    celestialConfigs,
    systemId: spawnSystemId,
    fallbackRootConfig: spawnRootConfig,
    anchorBodyId: spawnAnchorBodyId,
  });
  const spawnAnchorState = initialCelestialState.get(spawnAnchorConfig.id);
  if (!spawnAnchorState) {
    throw new Error(`Missing spawn anchor state for ${spawnAnchorConfig.id}`);
  }
  const spawnOrbitRadius = sceneOptions.spawnOrbitRadius
    ?? missionSpawnOverride?.orbitRadius
    ?? sharedSpawn?.orbitRadius
    ?? (sceneOptions.sceneLayout === "giant-moons"
      ? 1680
      : sceneOptions.sceneLayout === "ring-giant"
        ? 1860
        : 980);
  const spawnAnchorCollisionRadius =
    spawnAnchorConfig.collisionRadius ?? spawnAnchorConfig.radius;
  const safeSpawnOrbitRadius = Math.max(
    spawnOrbitRadius,
    spawnAnchorCollisionRadius + 260,
  );
  const spawnOrbitDirection = sceneOptions.spawnOrbitDirection
    ?? missionSpawnOverride?.orbitDirection
    ?? sharedSpawn?.orbitDirection
    ?? "cw";
  const spawnOrbitalSpeed = Math.sqrt(
    (gravitationalConstant * spawnAnchorConfig.mass) / safeSpawnOrbitRadius,
  );
  const spawnVelocityDirection = spawnOrbitDirection === "cw" ? 1 : -1;
  const spawnHeading = spawnOrbitDirection === "cw"
    ? Math.PI / 2
    : Math.PI * 1.5;

  const interceptorBody = simulation.addBody({
    id: "interceptor",
    mass: 12,
    radius: 16,
    collisionRadius: 26,
    systemId: spawnAnchorConfig.systemId,
    affectsGravity: false,
    position: {
      x: spawnAnchorState.position.x,
      y: spawnAnchorState.position.y - safeSpawnOrbitRadius,
    },
    velocity: {
      x: spawnAnchorState.velocity.x + spawnOrbitalSpeed * spawnVelocityDirection,
      y: spawnAnchorState.velocity.y,
    },
    propulsion: {
      heading: spawnHeading,
      throttle: 0,
      maxThrust: 180,
    },
  });
  const shipSpawnState = {
    systemId: spawnAnchorConfig.systemId,
    position: { x: interceptorBody.position.x, y: interceptorBody.position.y },
    velocity: { x: interceptorBody.velocity.x, y: interceptorBody.velocity.y },
    heading: interceptorBody.propulsion?.heading ?? spawnHeading,
  };
  const trainingRoot = orbitalFlightTrainingEnabled
    ? getSystemRoot(celestialVisuals, startingSystem.systemId)
    : null;
  const vestaRoot = orbitalFlightTrainingEnabled
    ? getSystemRoot(celestialVisuals, refinerySystem.systemId)
    : null;
  const nadirRoot = customTrainingMissionEnabled
    ? getSystemRoot(celestialVisuals, moonRunSystem.systemId)
    : null;
  if (orbitalFlightTrainingEnabled && (!trainingRoot || !vestaRoot || !nadirRoot)) {
    throw new Error("Missing orbital flight training landmarks");
  }
  if (nadirRandomGateRunEnabled && !nadirRoot) {
    throw new Error("Missing Nadir gate-run landmarks");
  }
  const trainingOrbitRadius = trainingRoot
    ? distanceBetween(shipSpawnState.position, trainingRoot.body.position)
    : 0;
  const interceptorBaseMaxThrust = interceptorBody.propulsion?.maxThrust ?? 0;

  const trajectoryPreview = createPathRenderer(world);
  const currentBurnPreview = createPathRenderer(world);
  const boostedPreview = createPathRenderer(world);
  const engineCompassOverlay = shipOverlayRoot;

  const interceptor = new Graphics()
    .poly([0, -18, 14, 12, 0, 6, -14, 12])
    .fill(0xffc857);
  world.addChild(interceptor);

  const explosion = new Graphics();
  world.addChild(explosion);
  const fuelDrone = new Graphics();
  fuelDrone.visible = false;
  world.addChild(fuelDrone);
  const fuelDroneSupport = createFuelDroneSupportState();

  const missileVisuals: MissileVisual[] = [];
  const playerBeamState = { absorbed: 0 };
  const playerShieldState: PlayerShieldState = { flash: 0 };
  const defenseCooldowns = new Map<string, number>();
  const launcherStates = new Map<string, LauncherState>();
  const defenseLockStates = new Map<string, DefenseLockState>();
  const disintegratorEngagementStates = new Map<string, DisintegratorEngagementState>();
  const torpedoLockStates = new Map<string, TorpedoLockState>();
  const announcedDefensiveLockIds = new Set<string>();
  const nextMissileIdRef = { value: 0 };
  let defensiveLockAlertSeconds = 0;
  let crashSequenceElapsed = 0;
  let autoRestartTimer = 0;
  let hasHandledCrash = false;

  for (const defense of defenseVisuals) {
    defenseCooldowns.set(defense.config.id, defense.config.cooldownSeconds * 0.55);
    launcherStates.set(defense.config.id, createLauncherState());
  }

  const hyperionPracticeRootConfig =
    sceneOptions.randomTargetPractice && sceneOptions.sceneLayout === "ring-giant"
      ? celestialConfigs.find(
          (config) =>
            config.systemId === ringGiantSystem.systemId &&
            config.parentId === null,
        ) ?? null
      : null;
  const hyperionPracticeOrbitTemplates =
    hyperionPracticeRootConfig
      ? celestialConfigs.filter(
          (config) =>
            config.parentId === hyperionPracticeRootConfig.id &&
            (config.celestialClass === "meteor" || config.celestialClass === "asteroid"),
        )
      : [];
  const hyperionPracticeTargets = {
    enabled:
      hyperionPracticeRootConfig !== null &&
      hyperionPracticeOrbitTemplates.length > 0,
    nextSpawnAtSeconds: 2.5,
    nextId: 0,
    maxActiveTargets: 5,
    dynamicDefenseIds: new Set<string>(),
  };
  const brontesPracticeRootConfig =
    sceneOptions.randomTargetPractice && sceneOptions.sceneLayout === "giant-moons"
      ? celestialConfigs.find(
          (config) =>
            config.systemId === giantMoonSystem.systemId &&
            config.parentId === null,
        ) ?? null
      : null;
  const brontesPracticeOrbiters =
    brontesPracticeRootConfig
      ? celestialConfigs.filter(
          (config) =>
            config.parentId === brontesPracticeRootConfig.id &&
            !config.hidden,
        )
      : [];
  const brontesPracticeTargets = {
    enabled:
      brontesPracticeRootConfig !== null &&
      brontesPracticeOrbiters.length > 0,
    nextSpawnAtSeconds: 3.5,
    nextId: 0,
    maxActiveTargets: 6,
    dynamicDefenseIds: new Set<string>(),
  };
  const brontesOrbitalPathSamples =
    brontesPracticeRootConfig
      ? brontesPracticeOrbiters.map((config) => {
          const sampleCount = Math.max(72, Math.round(config.orbitPeriod * 1.5));
          const samples = Array.from({ length: sampleCount }, (_, index) => {
            const timeSeconds = (index / sampleCount) * config.orbitPeriod;
            const state = celestialStateEvaluator.evaluate(timeSeconds);
            const rootPose = state.get(brontesPracticeRootConfig.id);
            const bodyPose = state.get(config.id);
            if (!rootPose || !bodyPose) {
              return { x: 0, y: 0 };
            }

            return {
              x: bodyPose.position.x - rootPose.position.x,
              y: bodyPose.position.y - rootPose.position.y,
            };
          });
          return {
            config,
            clearanceRadius: config.radius + 110,
            samples,
          };
        })
      : [];

  const removeDefenseVisual = (defenseId: string) => {
    const defenseIndex = defenseVisuals.findIndex(
      (defense) => defense.config.id === defenseId,
    );
    if (defenseIndex >= 0) {
      const [defense] = defenseVisuals.splice(defenseIndex, 1);
      simulation.removeBody(defense.config.id);
      world.removeChild(defense.sprite);
      defense.sprite.destroy();
    }

    const configIndex = defenseConfigs.findIndex((config) => config.id === defenseId);
    if (configIndex >= 0) {
      defenseConfigs.splice(configIndex, 1);
    }

    defenseCooldowns.delete(defenseId);
    launcherStates.delete(defenseId);
    defenseLockStates.delete(defenseId);
    disintegratorEngagementStates.delete(defenseId);
    hyperionPracticeTargets.dynamicDefenseIds.delete(defenseId);
    brontesPracticeTargets.dynamicDefenseIds.delete(defenseId);
  };

  const cleanupDestroyedPracticeTargets = () => {
    const destroyedTargetIds = defenseVisuals
      .filter(
        (defense) =>
          defense.destroyed &&
          (
            hyperionPracticeTargets.dynamicDefenseIds.has(defense.config.id) ||
            brontesPracticeTargets.dynamicDefenseIds.has(defense.config.id)
          ),
      )
      .map((defense) => defense.config.id);

    for (const defenseId of destroyedTargetIds) {
      removeDefenseVisual(defenseId);
    }
  };

  const clearPracticeTargets = () => {
    for (const defenseId of [...hyperionPracticeTargets.dynamicDefenseIds]) {
      removeDefenseVisual(defenseId);
    }
    for (const defenseId of [...brontesPracticeTargets.dynamicDefenseIds]) {
      removeDefenseVisual(defenseId);
    }

    hyperionPracticeTargets.nextSpawnAtSeconds = 2.5;
    hyperionPracticeTargets.nextId = 0;
    brontesPracticeTargets.nextSpawnAtSeconds = 3.5;
    brontesPracticeTargets.nextId = 0;
  };

  const resetHelionSurfaceLauncher = () => {
    if (
      !helionWeaponsTutorialEnabled ||
      !helionLauncherTemplateConfig ||
      !helionTutorialLauncherId
    ) {
      return;
    }

    if (defenseVisuals.some((defense) => defense.config.id === helionTutorialLauncherId)) {
      removeDefenseVisual(helionTutorialLauncherId);
    }

    helionPendingLauncherConfig = { ...helionLauncherTemplateConfig };
  };

  const spawnHelionSurfaceLauncher = () => {
    if (!helionWeaponsTutorialEnabled || !helionPendingLauncherConfig) {
      return;
    }

    if (
      defenseVisuals.some(
        (defense) => defense.config.id === helionPendingLauncherConfig?.id,
      )
    ) {
      helionPendingLauncherConfig = null;
      return;
    }

    const config = helionPendingLauncherConfig;
    const celestialState = celestialStateEvaluator.evaluate(elapsedSeconds);
    const defenseState = evaluateDefenseState(
      [config],
      celestialState,
      elapsedSeconds,
    ).get(config.id);

    if (!defenseState) {
      return;
    }

    defenseConfigs.push(config);
    defenseVisuals.push(createDefenseVisual(config, defenseState));
    defenseCooldowns.set(config.id, config.cooldownSeconds * 0.55);
    launcherStates.set(config.id, createLauncherState());
    helionPendingLauncherConfig = null;
  };

  const spawnHyperionPracticeTarget = () => {
    if (
      !hyperionPracticeTargets.enabled ||
      !hyperionPracticeRootConfig ||
      interceptorBody.systemId !== hyperionPracticeRootConfig.systemId
    ) {
      return;
    }

    const activeTargets = defenseVisuals.filter(
      (defense) =>
        hyperionPracticeTargets.dynamicDefenseIds.has(defense.config.id) &&
        !defense.destroyed,
    );

    if (activeTargets.length >= hyperionPracticeTargets.maxActiveTargets) {
      return;
    }

    const celestialState = celestialStateEvaluator.evaluate(elapsedSeconds);
    const rootState = celestialState.get(hyperionPracticeRootConfig.id);

    if (!rootState) {
      return;
    }

    const playerRelative = {
      x: interceptorBody.position.x - rootState.position.x,
      y: interceptorBody.position.y - rootState.position.y,
    };
    const playerRadius = Math.hypot(playerRelative.x, playerRelative.y);
    const playerAngle = Math.atan2(playerRelative.y, playerRelative.x);
    const sortedTemplates = [...hyperionPracticeOrbitTemplates].sort(
      (left, right) =>
        Math.abs(left.orbitRadius - playerRadius) -
        Math.abs(right.orbitRadius - playerRadius),
    );
    const candidateTemplates = sortedTemplates.slice(
      0,
      Math.min(6, sortedTemplates.length),
    );
    const template =
      candidateTemplates[
        Math.floor(Math.random() * candidateTemplates.length)
      ] ?? hyperionPracticeOrbitTemplates[0];

    if (!template) {
      return;
    }

    const aheadSign = Math.random() < 0.5 ? -1 : 1;
    const spawnAngle =
      playerAngle + aheadSign * (0.32 + Math.random() * 0.52);
    const orbitPeriod = Math.max(
      20,
      template.orbitPeriod * (0.94 + Math.random() * 0.12),
    );
    const orbitDirection = template.orbitDirection ?? "cw";
    const angularSpeed =
      ((Math.PI * 2) / orbitPeriod) *
      (orbitDirection === "ccw" ? -1 : 1);
    const orbitRadius = Math.max(
      hyperionPracticeRootConfig.radius + 120,
      template.orbitRadius + (-26 + Math.random() * 52),
    );
    const targetId = `${hyperionPracticeRootConfig.systemId}:practice-target-${hyperionPracticeTargets.nextId + 1}`;
    const targetNumber = hyperionPracticeTargets.nextId + 1;
    const config: DefenseConfig = {
      id: targetId,
      name: `Hyperion Target ${targetNumber}`,
      systemId: hyperionPracticeRootConfig.systemId,
      parentId: hyperionPracticeRootConfig.id,
      weaponType: "target",
      anchorToParent: "orbit",
      scannerRange: 0,
      lockOnSeconds: 0,
      cooldownSeconds: 0,
      beamRange: 0,
      beamDamagePerSecond: 0,
      torpedoSpeed: 0,
      torpedoThrust: 0,
      torpedoTurnRate: 0,
      radius: 15 + (targetNumber % 3),
      color: 0xffcf73,
      orbitRadius,
      orbitPeriod,
      initialAngle: spawnAngle - angularSpeed * elapsedSeconds,
      orbitDirection,
      shieldCapacity: 0,
      shieldRechargePerSecond: 0,
    };
    const defenseState = evaluateDefenseState(
      [config],
      celestialState,
      elapsedSeconds,
    ).get(config.id);

    if (!defenseState) {
      return;
    }

    defenseConfigs.push(config);
    defenseVisuals.push(createDefenseVisual(config, defenseState));
    defenseCooldowns.set(config.id, 0);
    launcherStates.set(config.id, createLauncherState());
    hyperionPracticeTargets.dynamicDefenseIds.add(config.id);
    hyperionPracticeTargets.nextId += 1;
    hyperionPracticeTargets.nextSpawnAtSeconds =
      elapsedSeconds + 4.5 + Math.random() * 4.5;
  };

  const spawnBrontesPracticeTarget = () => {
    if (
      !brontesPracticeTargets.enabled ||
      !brontesPracticeRootConfig ||
      interceptorBody.systemId !== brontesPracticeRootConfig.systemId
    ) {
      return;
    }

    const activeTargets = defenseVisuals.filter(
      (defense) =>
        brontesPracticeTargets.dynamicDefenseIds.has(defense.config.id) &&
        !defense.destroyed,
    );
    if (activeTargets.length >= brontesPracticeTargets.maxActiveTargets) {
      return;
    }

    const celestialState = celestialStateEvaluator.evaluate(elapsedSeconds);
    const rootState = celestialState.get(brontesPracticeRootConfig.id);

    if (!rootState) {
      return;
    }

    const playerRelative = {
      x: interceptorBody.position.x - rootState.position.x,
      y: interceptorBody.position.y - rootState.position.y,
    };
    const playerRadius = Math.hypot(playerRelative.x, playerRelative.y);
    const innerRadius = brontesPracticeRootConfig.radius + 220;
    const outerRadius = Math.max(
      innerRadius + 220,
      ...brontesPracticeOrbiters.map((config) => config.orbitRadius + config.radius + 220),
    );
    const minimumTargetSpacing = 120;

    const isCandidateSafe = (candidate: Vector2Like) => {
      const distanceFromRoot = Math.hypot(candidate.x, candidate.y);
      if (distanceFromRoot < innerRadius || distanceFromRoot > outerRadius) {
        return false;
      }

      for (const orbitPath of brontesOrbitalPathSamples) {
        for (const sample of orbitPath.samples) {
          if (
            distanceBetween(candidate, sample) <
            orbitPath.clearanceRadius
          ) {
            return false;
          }
        }
      }

      for (const defense of defenseVisuals) {
        if (
          !brontesPracticeTargets.dynamicDefenseIds.has(defense.config.id) ||
          defense.destroyed
        ) {
          continue;
        }

        const defenseRelative = {
          x: defense.body.position.x - rootState.position.x,
          y: defense.body.position.y - rootState.position.y,
        };

        if (
          distanceBetween(candidate, defenseRelative) <
          defense.config.radius + minimumTargetSpacing
        ) {
          return false;
        }
      }

      return true;
    };

    let candidate: Vector2Like | null = null;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const radiusBias = playerRadius > 0
        ? playerRadius + (-520 + Math.random() * 1040)
        : innerRadius + Math.random() * (outerRadius - innerRadius);
      const candidateRadius = Math.max(
        innerRadius,
        Math.min(outerRadius, radiusBias),
      );
      const candidateAngle = Math.random() * Math.PI * 2;
      const nextCandidate = {
        x: Math.cos(candidateAngle) * candidateRadius,
        y: Math.sin(candidateAngle) * candidateRadius,
      };

      if (!isCandidateSafe(nextCandidate)) {
        continue;
      }

      const distanceToPlayer = distanceBetween(nextCandidate, playerRelative);
      if (distanceToPlayer < 260 || distanceToPlayer > 1900) {
        continue;
      }

      candidate = nextCandidate;
      break;
    }

    if (!candidate) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const candidateRadius =
          innerRadius + Math.random() * (outerRadius - innerRadius);
        const candidateAngle = Math.random() * Math.PI * 2;
        const nextCandidate = {
          x: Math.cos(candidateAngle) * candidateRadius,
          y: Math.sin(candidateAngle) * candidateRadius,
        };

        if (isCandidateSafe(nextCandidate)) {
          candidate = nextCandidate;
          break;
        }
      }
    }

    if (!candidate) {
      brontesPracticeTargets.nextSpawnAtSeconds = elapsedSeconds + 3.5;
      return;
    }

    const targetId = `${brontesPracticeRootConfig.systemId}:floating-target-${brontesPracticeTargets.nextId + 1}`;
    const targetNumber = brontesPracticeTargets.nextId + 1;
    const config: DefenseConfig = {
      id: targetId,
      name: `Brontes Floating Target ${targetNumber}`,
      systemId: brontesPracticeRootConfig.systemId,
      parentId: brontesPracticeRootConfig.id,
      weaponType: "target",
      anchorToParent: "fixed",
      scannerRange: 0,
      lockOnSeconds: 0,
      cooldownSeconds: 0,
      beamRange: 0,
      beamDamagePerSecond: 0,
      torpedoSpeed: 0,
      torpedoThrust: 0,
      torpedoTurnRate: 0,
      radius: 15 + (targetNumber % 3),
      color: 0x9ff3ff,
      orbitRadius: Math.hypot(candidate.x, candidate.y),
      orbitPeriod: 0,
      initialAngle: Math.atan2(candidate.y, candidate.x),
      shieldCapacity: 0,
      shieldRechargePerSecond: 0,
    };
    const defenseState = evaluateDefenseState(
      [config],
      celestialState,
      elapsedSeconds,
    ).get(config.id);

    if (!defenseState) {
      return;
    }

    defenseConfigs.push(config);
    defenseVisuals.push(createDefenseVisual(config, defenseState));
    defenseCooldowns.set(config.id, 0);
    launcherStates.set(config.id, createLauncherState());
    brontesPracticeTargets.dynamicDefenseIds.add(config.id);
    brontesPracticeTargets.nextId += 1;
    brontesPracticeTargets.nextSpawnAtSeconds =
      elapsedSeconds + 5 + Math.random() * 4;
  };

  const telemetry = new Text({
    text: "",
    style: {
      fill: "#a9dfff",
      fontFamily: "Menlo, Monaco, monospace",
      fontSize: 15,
    },
  });
  telemetry.position.set(24, 66);
  debugHudRoot.addChild(telemetry);

  const keyTracker = new KeyTracker();
  const sceneInputState = createSceneInputState();
  let consumedPauseMenuToggleRequestId =
    getDevToolsState().pauseMenuToggleRequestId;
  let isPaused = false;
  let pauseMenuOpen = false;
  let hudVisible = true;
  let debugHudVisible = false;
  let weaponArmed = false;
  let weaponMode: PlayerWeaponMode = "disintegrator";
  const trainingMissionState = createOrbitalFlightTrainingState();
  const nadirRandomGateRunState = createNadirRandomGateRunState();
  const genericMissionState =
    missionDefinition && !customTrainingMissionEnabled
      ? createMissionRuntimeState(missionDefinition)
      : null;
  let lastTrainingTargetEvent: WorldMarkerEvent | null = null;
  let missionControl: MissionControlState = DEFAULT_MISSION_CONTROL_STATE;
  let burnIntensity = 0.75;
  let engineThrottle = 0;
  let stableMotionHeading = interceptorBody.propulsion?.heading ?? 0;
  const warningManager = createGameWarningManagerState();
  const scoreboardVisible =
    sceneOptions.randomTargetPractice ||
    defenseConfigs.some((config) => config.weaponType === "target");
  const countedDestroyedTargetIds = new Set<string>();
  let destroyedTargetCount = 0;
  let helionWeaponsArmedEver = false;
  let helionWeaponsBoostedEver = false;
  let helionTargetsCleared = false;
  let helionInterceptedTorpedoes = 0;
  let orbitalTrainingWasCompleted = false;
  let tutorialCompleteWarningUntilSeconds = -Infinity;

  const unsubscribeSceneEvents = sceneEvents.subscribe((event) => {
    if (
      event.type === "world-marker-entered" ||
      event.type === "world-marker-exited" ||
      event.type === "world-marker-activated"
    ) {
      lastTrainingTargetEvent = {
        markerId: event.payload.markerId,
        label: event.payload.label,
        type:
          event.type === "world-marker-entered"
            ? "entered"
            : event.type === "world-marker-exited"
              ? "exited"
              : "activated",
      };
    }
  });

  keyTracker.attach(window);

  applyCelestialState(
    simulation,
    celestialConfigs,
    elapsedSeconds,
    celestialStateEvaluator,
  );
  applyDefenseState(
    simulation,
    defenseConfigs,
    celestialConfigs,
    elapsedSeconds,
    celestialStateEvaluator,
  );

  const closePauseMenu = () => {
    pauseMenuOpen = false;
    resetGameMenuState();
    if (interceptorBody.crashed === null) {
      isPaused = false;
    }
  };

  const openPauseMenu = () => {
    pauseMenuOpen = true;
    isPaused = true;
    setGameMenuState({
      visible: true,
      title: "Paused",
      subtitle: "Simulation hold engaged.",
      description: "Resume the current flight or return to the main command menu.",
      accentColor: "#8ee8ff",
      layout: "stack",
      actions: [
        {
          label: "Resume Flight",
          accentColor: "#8ee8ff",
          onSelect: () => {
            closePauseMenu();
          },
        },
        {
          label: "Quit to Main Menu",
          accentColor: "#ff9f7f",
          onSelect: () => {
            pauseMenuOpen = false;
            resetGameMenuState();
            navigation?.load("main-menu");
          },
        },
      ],
      cards: [],
      footerActions: [],
    });
  };

  const tickScene = (ticker: Ticker) => {
    const frameSeconds = Math.max(1 / 240, ticker.deltaMS / 1000);
    const instantaneousFps = 1 / frameSeconds;
    fpsSmoothed += (instantaneousFps - fpsSmoothed) * 0.1;
    const sceneActions = readSceneInputActions(keyTracker, sceneInputState);
    const pauseMenuToggleRequestId =
      getDevToolsState().pauseMenuToggleRequestId;
    const pauseMenuToggleRequested =
      pauseMenuToggleRequestId !== consumedPauseMenuToggleRequestId;
    if (pauseMenuToggleRequested) {
      consumedPauseMenuToggleRequestId = pauseMenuToggleRequestId;
    }
    const enginesOnlyTraining = customTrainingMissionEnabled;
    const missionPauseActive = missionControl.pauseGameplay;
    const gameplayInputBlocked = pauseMenuOpen || missionControl.blockPlayerInput;
    if (sceneActions.restart) {
      restartScenario({
        simulation,
        celestialConfigs,
        celestialStateEvaluator,
        interceptorBody,
        shipSystems,
        shipSpawnState,
        onResetElapsedSeconds: () => {
          elapsedSeconds = 0;
          destroyedTargetCount = 0;
          countedDestroyedTargetIds.clear();
          guidanceSystem.reset();
          missionControl = DEFAULT_MISSION_CONTROL_STATE;
          sceneCameraOverride = null;
          sceneEvents.clear();
          resetGameWarningManagerState(warningManager);
          defensiveLockAlertSeconds = 0;
          orbitalTrainingWasCompleted = false;
          tutorialCompleteWarningUntilSeconds = -Infinity;
        },
        onResetCameraZoom: () => {
          cameraZoom = 1;
        },
        onResetThrottle: () => {
          engineThrottle = 0;
          stableMotionHeading = shipSpawnState.heading;
        },
        onClearPause: () => {
          isPaused = false;
          pauseMenuOpen = false;
          resetGameMenuState();
        },
        onClearMissiles: () => {
          resetFuelDroneSupportState(fuelDroneSupport);
          clearPracticeTargets();
          resetHelionSurfaceLauncher();
          guidanceSystem.reset();
          defenseLockStates.clear();
          disintegratorEngagementStates.clear();
          torpedoLockStates.clear();
          announcedDefensiveLockIds.clear();
          for (const missile of missileVisuals) {
            simulation.removeBody(missile.id);
            world.removeChild(missile.sprite);
            missile.sprite.destroy();
          }
          missileVisuals.length = 0;
          nextMissileIdRef.value = 0;
          playerBeamState.absorbed = 0;
          playerShieldState.flash = 0;
          for (const defense of defenseVisuals) {
            defense.destroyed = false;
            defense.disintegratorEnergyAbsorbed = 0;
            defense.shieldCharge = defense.shieldMaxCharge;
            defense.shieldDisruptedUntilSeconds = 0;
            defense.disabledUntilSeconds = 0;
            defense.disabledHoldPosition = null;
            defenseCooldowns.set(defense.config.id, defense.config.cooldownSeconds * 0.55);
            launcherStates.set(defense.config.id, createLauncherState());
          }
        },
      });
      resetOrbitalFlightTrainingState(trainingMissionState);
      resetNadirRandomGateRunState(nadirRandomGateRunState);
      if (genericMissionState && missionDefinition) {
        resetMissionRuntimeState(genericMissionState, missionDefinition);
      }
      if (orbitalFlightTrainingEnabled) {
        shipSystems.engines.charge =
          shipSystems.engines.maxCharge * trainingStartingFuelFraction;
      } else if (nadirRandomGateRunEnabled) {
        shipSystems.engines.charge = shipSystems.engines.maxCharge;
      }
      weaponArmed = false;
      helionWeaponsArmedEver = false;
      helionWeaponsBoostedEver = false;
      helionTargetsCleared = false;
      helionInterceptedTorpedoes = 0;
      hasHandledCrash = false;
      crashSequenceElapsed = 0;
      autoRestartTimer = 0;
    }
    if (
      (sceneActions.togglePauseMenu || pauseMenuToggleRequested) &&
      !interceptorBody.crashed
    ) {
      if (pauseMenuOpen) {
        closePauseMenu();
      } else {
        openPauseMenu();
      }
    }

    if (sceneActions.toggleTacticalView) {
      tacticalViewActive = !tacticalViewActive;
    }

    if (sceneActions.toggleHud) {
      hudVisible = !hudVisible;
    }
    if (sceneActions.toggleDebugHud) {
      debugHudVisible = !debugHudVisible;
    }

    if (enginesOnlyTraining) {
      focusSubsystem(shipSystems, "engines");
      weaponArmed = false;
    }

    if (
      !enginesOnlyTraining &&
      sceneActions.toggleWeaponArm &&
      !interceptorBody.crashed &&
      !gameplayInputBlocked
    ) {
      weaponArmed = !weaponArmed;
    }

    if (
      !enginesOnlyTraining &&
      sceneActions.switchWeaponMode &&
      !interceptorBody.crashed &&
      !gameplayInputBlocked
    ) {
      weaponMode = weaponMode === "disintegrator" ? "disruptor" : "disintegrator";
    }

    if (
      !enginesOnlyTraining &&
      sceneActions.focusSubsystem &&
      !interceptorBody.crashed &&
      !gameplayInputBlocked
    ) {
      focusSubsystem(shipSystems, sceneActions.focusSubsystem);
    }

    const wasCrashed = interceptorBody.crashed !== null;
    const pauseActive = isPaused || missionPauseActive;

    if (sceneActions.togglePause && !wasCrashed && !pauseMenuOpen && !missionPauseActive) {
      isPaused = !isPaused;
    }

    const flightInput = readFlightInput((code) =>
      gameplayInputBlocked ? false : keyTracker.isPressed(code),
    );
    const advanceMissionControl =
      sceneActions.advance && missionPauseActive && !pauseMenuOpen;
    const nextMissionPage =
      (sceneActions.navigateNext || sceneActions.advance) &&
      missionPauseActive &&
      !pauseMenuOpen;
    const previousMissionPage =
      sceneActions.navigatePrevious &&
      missionPauseActive &&
      !pauseMenuOpen;
    const boostInput = flightInput.boostInput;
    const liveVelocity = interceptorBody.velocity;
    const liveVelocityHeading =
      liveVelocity.x !== 0 || liveVelocity.y !== 0
        ? Math.atan2(liveVelocity.y, liveVelocity.x)
        : stableMotionHeading;
    syncBodyToNearestSystemRoot(interceptorBody, celestialVisuals);
    const netGravityAcceleration = computeNetGravityAccelerationForBody(
      interceptorBody,
      simulation.listBodies(),
      gravitationalConstant,
      PHYSICS_TUNING.world.softening,
    );
    stableMotionHeading = updateStableMotionHeading(
      stableMotionHeading,
      liveVelocity,
    );
    const progradeHeading = liveVelocityHeading;
    const engineThrustMultiplier = getEngineThrustMultiplier(shipSystems);
    const engineSuperBurnMultiplier = getEngineSuperBurnMultiplier(shipSystems);
    const engineFullBoostMultiplier = getEngineFullBoostMultiplier();
    const engineFuelFraction = getEngineFuelFraction(shipSystems);
    const resolvedDirectionalThrustVector = resolveTravelRelativeThrustVector({
      input: flightInput,
      progradeHeading,
      lateralHeading: liveVelocityHeading,
      progradeRetrogradeIntensity:
        burnIntensity *
        engineThrustMultiplier *
        getEngineProgradeRetrogradeThrustScale(),
      lateralIntensity:
        burnIntensity *
        engineThrustMultiplier *
        getEngineLateralThrustScale(),
    });
    const directionalThrustVector = resolvedDirectionalThrustVector
      ? {
          ...resolvedDirectionalThrustVector,
          useFullBoostOutput: false,
        }
      : null;
    const emergencyBrakeThrustVector = createGravityAlignedBoostThrustVector(
      flightInput.eBrakeInput,
      netGravityAcceleration,
      "away",
      "E-Brake",
    );
    const gravityDiveThrustVector = createGravityAlignedBoostThrustVector(
      flightInput.gravityDiveInput,
      netGravityAcceleration,
      "toward",
      "Gravity Dive",
    );
    const thrustVector =
      emergencyBrakeThrustVector ??
      gravityDiveThrustVector ??
      directionalThrustVector;
    const superBurnActive =
      thrustVector?.useFullBoostOutput === true ||
      (boostInput && shipSystems.boosted === "engines");
    const engineOutputCeiling = thrustVector?.useFullBoostOutput
      ? engineFullBoostMultiplier
      : superBurnActive
        ? engineSuperBurnMultiplier
        : 1;
    if (interceptorBody.propulsion) {
      interceptorBody.propulsion.maxThrust =
        interceptorBaseMaxThrust *
        engineThrustMultiplier *
        engineOutputCeiling;
    }
    const scannerRange =
      baseScannerRange * getScannerRangeMultiplier(shipSystems);
    const disintegratorRange =
      baseDisintegratorRange * getWeaponRangeMultiplier(shipSystems);
    const disruptorRange =
      disintegratorRange * COMBAT_BALANCE.disruptor.rangeMultiplier;
    const requestedThrottle =
      pauseActive || !thrustVector || engineFuelFraction <= 0
        ? 0
        : thrustVector.throttle * engineOutputCeiling;
    let helionPreStepNeutralizedTorpedoes = 0;

    if (interceptorBody.propulsion && !wasCrashed) {
      if (thrustVector) {
        simulation.setHeading(interceptorBody.id, thrustVector.heading);
      }
    }

    const systemsTargetForecast = guidanceSystem.updateTrackForecast({
      simulation,
      celestialConfigs,
      defenseConfigs,
      elapsedSeconds,
      targetId: interceptorBody.id,
      disabled: wasCrashed,
    });

    if (!pauseActive && !wasCrashed) {
      stepper.tick(ticker.deltaMS, (stepSeconds) => {
        elapsedSeconds += stepSeconds;
        updateShipSystems(shipSystems, stepSeconds);
        playerShieldState.flash = Math.max(
          0,
          playerShieldState.flash - stepSeconds * 2.8,
        );
        engineThrottle = approachValue(
          engineThrottle,
          requestedThrottle,
          getEngineResponseMultiplier(shipSystems) * stepSeconds,
        );
        consumeEngineFuel(shipSystems, engineThrottle, stepSeconds);
        simulation.setThrottle(
          interceptorBody.id,
          engineOutputCeiling > 0 ? engineThrottle / engineOutputCeiling : 0,
        );
        applyCelestialState(
          simulation,
          celestialConfigs,
          elapsedSeconds,
          celestialStateEvaluator,
        );
        applyDefenseState(
          simulation,
          defenseConfigs,
          celestialConfigs,
          elapsedSeconds,
          celestialStateEvaluator,
        );
        cleanupDestroyedPracticeTargets();
        if (!pauseActive && interceptorBody.crashed === null) {
          if (
            hyperionPracticeTargets.enabled &&
            elapsedSeconds >= hyperionPracticeTargets.nextSpawnAtSeconds
          ) {
            spawnHyperionPracticeTarget();
          }
          if (
            brontesPracticeTargets.enabled &&
            elapsedSeconds >= brontesPracticeTargets.nextSpawnAtSeconds
          ) {
            spawnBrontesPracticeTarget();
          }
        }
        syncBodyToNearestSystemRoot(interceptorBody, celestialVisuals);
        updateDefenseShieldStates(defenseVisuals, elapsedSeconds, stepSeconds);
        applyDefenseStatusOverrides(defenseVisuals, launcherStates, elapsedSeconds);
        updateLauncherMissiles({
          simulation,
          shipSystems,
          celestialVisuals,
          defenseVisuals,
          defenseCooldowns,
          launcherStates,
          playerBeamState,
          playerShieldState,
          missileVisuals,
          interceptorBody,
          targetForecast: systemsTargetForecast,
          world,
          stepSeconds,
          elapsedSeconds,
          nextMissileIdRef,
        });
        applyDefenseStatusOverrides(defenseVisuals, launcherStates, elapsedSeconds);
        helionPreStepNeutralizedTorpedoes += resolvePreStepLockedTorpedoDefense({
          interceptorPosition: interceptorBody.position,
          scannerRange,
          disintegratorRange,
          deltaSeconds: stepSeconds,
          pauseActive,
          isCrashed: interceptorBody.crashed !== null,
          shipSystems,
          weaponMode,
          weaponArmed,
          celestialVisuals,
          missileVisuals,
          defenseLockStates,
          torpedoLockStates,
          disintegratorEngagementStates,
        });
        simulation.step(stepSeconds);
        const collisionEvents = simulation.consumeCollisionEvents();
        applyCollisionEventsToShip(
          collisionEvents,
          missileVisuals,
          interceptorBody,
          shipSystems,
          playerShieldState,
        );
        syncBodyToNearestSystemRoot(interceptorBody, celestialVisuals);
        cleanupMissiles(simulation, missileVisuals, world);
      });
    } else {
      engineThrottle = approachValue(
        engineThrottle,
        requestedThrottle,
        getEngineResponseMultiplier(shipSystems) * (ticker.deltaMS / 1000),
      );
      simulation.setThrottle(
        interceptorBody.id,
        engineOutputCeiling > 0 ? engineThrottle / engineOutputCeiling : 0,
      );
      applyCelestialState(
        simulation,
        celestialConfigs,
        elapsedSeconds,
        celestialStateEvaluator,
      );
      applyDefenseState(
        simulation,
        defenseConfigs,
        celestialConfigs,
        elapsedSeconds,
        celestialStateEvaluator,
      );
      syncBodyToNearestSystemRoot(interceptorBody, celestialVisuals);
      applyDefenseStatusOverrides(defenseVisuals, launcherStates, elapsedSeconds);
    }

    const mapKillBorderBreached =
      !pauseActive &&
      !wasCrashed &&
      interceptorBody.crashed === null &&
      distanceBetween(interceptorBody.position, mapKillBorder.center) >
        mapKillBorder.radius;
    if (mapKillBorderBreached) {
      interceptorBody.crashed = {
        otherBodyId: "map-boundary",
        relativeSpeed: Math.hypot(
          interceptorBody.velocity.x,
          interceptorBody.velocity.y,
        ),
      };
    }

    const outOfFuelInTraining =
      orbitalFlightTrainingEnabled &&
      shipSystems.engines.charge <= 0.0001 &&
      !pauseActive &&
      !wasCrashed;
    const isCrashed = interceptorBody.crashed !== null;
    const playerDeathCueTriggered = isCrashed && !wasCrashed;

    if ((isCrashed || outOfFuelInTraining) && !hasHandledCrash) {
      hasHandledCrash = true;
      crashSequenceElapsed = 0;
      autoRestartTimer = 1.25;
      isPaused = true;
      weaponArmed = false;
    } else if (!isCrashed) {
      hasHandledCrash = false;
    }

    if (isCrashed) {
      const frameSeconds = ticker.deltaMS / 1000;
      crashSequenceElapsed += frameSeconds;
      autoRestartTimer = Math.max(0, autoRestartTimer - frameSeconds);

      if (autoRestartTimer === 0) {
        if (orbitalFlightTrainingEnabled) {
          const respawnState = createSystemRespawnState({
            systemId: interceptorBody.systemId,
            celestialConfigs,
            celestialVisuals,
            gravitationalConstant,
            anchorBodyId: spawnAnchorBodyId,
            defaultOrbitRadius: spawnOrbitRadius,
            orbitDirection: spawnOrbitDirection,
          });
          respawnInterceptor({
            interceptorBody,
            shipSystems,
            shipSpawnState: respawnState,
            onResetThrottle: () => {
              engineThrottle = 0;
              stableMotionHeading = respawnState.heading;
            },
            onClearPause: () => {
              isPaused = false;
            },
            onClearMissiles: () => {
              resetFuelDroneSupportState(fuelDroneSupport);
              clearPracticeTargets();
              resetHelionSurfaceLauncher();
              guidanceSystem.reset();
              defenseLockStates.clear();
              disintegratorEngagementStates.clear();
              torpedoLockStates.clear();
              announcedDefensiveLockIds.clear();
              defensiveLockAlertSeconds = 0;
              for (const missile of missileVisuals) {
                simulation.removeBody(missile.id);
                world.removeChild(missile.sprite);
                missile.sprite.destroy();
              }
              missileVisuals.length = 0;
              nextMissileIdRef.value = 0;
              playerBeamState.absorbed = 0;
              playerShieldState.flash = 0;
              for (const defense of defenseVisuals) {
                defense.destroyed = false;
                defense.disintegratorEnergyAbsorbed = 0;
                defense.shieldCharge = defense.shieldMaxCharge;
                defense.shieldDisruptedUntilSeconds = 0;
                defense.disabledUntilSeconds = 0;
                defense.disabledHoldPosition = null;
                defenseCooldowns.set(defense.config.id, defense.config.cooldownSeconds * 0.55);
                launcherStates.set(defense.config.id, createLauncherState());
              }
            },
          });
          shipSystems.engines.charge =
            shipSystems.engines.maxCharge * trainingStartingFuelFraction;
          resetGameWarningManagerState(warningManager);
          defensiveLockAlertSeconds = 0;
          sceneEvents.clear();
        } else {
          restartScenario({
            simulation,
            celestialConfigs,
            celestialStateEvaluator,
            interceptorBody,
            shipSystems,
            shipSpawnState,
            onResetElapsedSeconds: () => {
              elapsedSeconds = 0;
              destroyedTargetCount = 0;
              countedDestroyedTargetIds.clear();
              guidanceSystem.reset();
              resetGameWarningManagerState(warningManager);
              defensiveLockAlertSeconds = 0;
              orbitalTrainingWasCompleted = false;
              tutorialCompleteWarningUntilSeconds = -Infinity;
            },
            onResetCameraZoom: () => {
              cameraZoom = 1;
            },
            onResetThrottle: () => {
              engineThrottle = 0;
            },
            onClearPause: () => {
              isPaused = false;
            },
            onClearMissiles: () => {
              resetFuelDroneSupportState(fuelDroneSupport);
              clearPracticeTargets();
              resetHelionSurfaceLauncher();
              guidanceSystem.reset();
              defenseLockStates.clear();
              disintegratorEngagementStates.clear();
              torpedoLockStates.clear();
              announcedDefensiveLockIds.clear();
              defensiveLockAlertSeconds = 0;
              for (const missile of missileVisuals) {
                simulation.removeBody(missile.id);
                world.removeChild(missile.sprite);
                missile.sprite.destroy();
              }
              missileVisuals.length = 0;
              nextMissileIdRef.value = 0;
              playerBeamState.absorbed = 0;
              playerShieldState.flash = 0;
              for (const defense of defenseVisuals) {
                defense.destroyed = false;
                defense.disintegratorEnergyAbsorbed = 0;
                defense.shieldCharge = defense.shieldMaxCharge;
                defense.shieldDisruptedUntilSeconds = 0;
                defense.disabledUntilSeconds = 0;
                defense.disabledHoldPosition = null;
                defenseCooldowns.set(defense.config.id, defense.config.cooldownSeconds * 0.55);
                launcherStates.set(defense.config.id, createLauncherState());
              }
            },
          });
          resetOrbitalFlightTrainingState(trainingMissionState);
          resetNadirRandomGateRunState(nadirRandomGateRunState);
          if (genericMissionState && missionDefinition) {
            resetMissionRuntimeState(genericMissionState, missionDefinition);
          }
          if (nadirRandomGateRunEnabled) {
            shipSystems.engines.charge = shipSystems.engines.maxCharge;
          }
        }
        resetFuelDroneSupportState(fuelDroneSupport);
        fuelDrone.visible = false;
        weaponArmed = false;
        helionWeaponsArmedEver = false;
        helionWeaponsBoostedEver = false;
        helionTargetsCleared = false;
        helionInterceptedTorpedoes = 0;
        hasHandledCrash = false;
        crashSequenceElapsed = 0;
        autoRestartTimer = 0;
      }
    }

    const interceptorPosition = interceptorBody.position;
    const interceptorVelocity = interceptorBody.velocity;
    const interceptorFuelFraction = getEngineFuelFraction(shipSystems);

    if (orbitalFlightTrainingEnabled && vestaRoot) {
      updateFuelDroneSupport({
        state: fuelDroneSupport,
        deltaSeconds: frameSeconds,
        shipPosition: interceptorPosition,
        shipVelocity: interceptorVelocity,
        shipFuelFraction: interceptorFuelFraction,
        shipSystems,
        serviceWorldPosition: vestaRoot.body.position,
        inServiceSystem: interceptorBody.systemId === vestaRoot.config.systemId,
        paused: pauseActive,
        disabled: isCrashed,
        config: TRAINING_FUEL_DRONE_SUPPORT_CONFIG,
      });
    } else {
      resetFuelDroneSupportState(fuelDroneSupport);
    }

    syncFuelDroneGraphic({
      graphics: fuelDrone,
      state: fuelDroneSupport,
      visible: !isCrashed,
      config: TRAINING_FUEL_DRONE_SUPPORT_CONFIG,
    });

    const destroyedTargetIds = new Set<string>(
      defenseVisuals
        .filter((visual) => visual.destroyed)
        .map((visual) => visual.config.id),
    );
    if (helionWeaponsTutorialEnabled) {
      helionWeaponsArmedEver = helionWeaponsArmedEver || weaponArmed;
      helionWeaponsBoostedEver =
        helionWeaponsBoostedEver || shipSystems.boosted === "weapons";
      helionTargetsCleared = [...helionTutorialTargetIds].every((targetId) =>
        destroyedTargetIds.has(targetId)
      );
      if (helionTargetsCleared) {
        spawnHelionSurfaceLauncher();
      }
      if (helionTargetsCleared && helionPreStepNeutralizedTorpedoes > 0) {
        helionInterceptedTorpedoes += helionPreStepNeutralizedTorpedoes;
      }
    }
    const systemRootPositions = buildSystemRootPositionMap(celestialVisuals);
    const resolvedMissionMarkers =
      genericMissionState && missionDefinition
        ? resolveMissionMarkerViews(missionDefinition, celestialVisuals)
        : null;
    const resolvedMissionTargetPositions =
      genericMissionState && missionDefinition
        ? buildResolvedMissionTargetPositions(
            celestialVisuals,
            defenseVisuals,
            resolvedMissionMarkers,
          )
        : null;

    const missionSnapshot: MissionRuntimeSnapshot = orbitalFlightTrainingEnabled
      ? updateOrbitalFlightTraining(trainingMissionState, {
          deltaSeconds: !pauseActive && !isCrashed ? frameSeconds : 0,
          advanceMissionControl,
          nextMissionPage,
          previousMissionPage,
          flightInput,
          shipSystems,
          shipPosition: interceptorPosition,
          aureliaPosition: trainingRoot!.body.position,
          referenceOrbitRadius: trainingOrbitRadius,
          vestaPosition: vestaRoot!.body.position,
          nadirPosition: nadirRoot!.body.position,
          superBurnActive,
          fuelDronePosition: fuelDroneSupport.position,
          fuelTransferActive: fuelDroneSupport.transferActive,
        })
      : nadirRandomGateRunEnabled
        ? updateNadirRandomGateRun(nadirRandomGateRunState, {
            deltaSeconds: !pauseActive && !isCrashed ? frameSeconds : 0,
            shipPosition: interceptorPosition,
            nadirPosition: nadirRoot!.body.position,
          })
      : genericMissionState && missionDefinition
        ? updateMissionRuntime(genericMissionState, missionDefinition, {
            deltaSeconds: !pauseActive && !isCrashed ? frameSeconds : 0,
            advanceMissionControl,
            nextMissionPage,
            previousMissionPage,
            externalFlags: helionWeaponsTutorialEnabled
              ? {
                  "tutorial2.weapons-armed-ever": helionWeaponsArmedEver,
                  "tutorial2.targets-cleared": helionTargetsCleared,
                  "tutorial2.intercepts-count": helionInterceptedTorpedoes,
                  "tutorial2.intercepts-complete":
                    helionInterceptedTorpedoes >=
                      HELION_WEAPONS_TUTORIAL_REQUIRED_INTERCEPTS,
                  "tutorial2.weapons-boosted-ever": helionWeaponsBoostedEver,
                  "tutorial2.launcher-destroyed":
                    helionTutorialLauncherId
                      ? destroyedTargetIds.has(helionTutorialLauncherId)
                      : false,
                }
              : undefined,
            destroyedTargetIds,
            shipPosition: interceptorPosition,
            systemRootPositions,
            resolvedMarkers: resolvedMissionMarkers ?? undefined,
            resolvedTargetPositions: resolvedMissionTargetPositions ?? undefined,
          })
      : createSandboxMissionSnapshot(activeSceneTitle);
    const missionDisplayTarget =
      buildReturnToObjectiveSystemMarker({
        missionTarget: missionSnapshot.activeTarget,
        shipPosition: interceptorPosition,
        shipSystemId: interceptorBody.systemId,
        systemRootPositions,
        celestialVisuals,
      }) ?? missionSnapshot.activeTarget;
    if (orbitalFlightTrainingEnabled) {
      if (!orbitalTrainingWasCompleted && missionSnapshot.completed) {
        tutorialCompleteWarningUntilSeconds =
          elapsedSeconds + TUTORIAL_COMPLETE_NOTIFICATION_SECONDS;
      }
      orbitalTrainingWasCompleted = missionSnapshot.completed;
    } else {
      orbitalTrainingWasCompleted = missionSnapshot.completed;
    }
    missionControl = missionSnapshot.control;
    sceneCameraOverride = missionSnapshot.control.cameraOverride;
    for (const targetEvent of missionSnapshot.targetEvents) {
      sceneEvents.emit({
        type: `world-marker-${targetEvent.type}`,
        emittedAtSeconds: elapsedSeconds,
        payload: {
          markerId: targetEvent.markerId,
          label: targetEvent.label,
        },
      });
    }

    const previewForecasts = guidanceSystem.updatePreviewForecasts({
      simulation,
      celestialConfigs,
      defenseConfigs,
      elapsedSeconds,
      targetId: interceptorBody.id,
      headingRadians: thrustVector?.heading,
      throttle: thrustVector?.throttle,
      burnMaxThrustOverride: thrustVector?.useFullBoostOutput
        ? interceptorBaseMaxThrust * engineThrustMultiplier * engineFullBoostMultiplier
        : undefined,
      boostedMaxThrust:
        interceptorBaseMaxThrust *
        engineThrustMultiplier *
        (shipSystems.boosted === "engines" ? engineSuperBurnMultiplier : 1),
      disabled: isCrashed,
    });
    const coastPrediction = previewForecasts.coast;
    const currentBurnPrediction = previewForecasts.burn;
    const boostedPrediction = previewForecasts.boost;

    guidanceSystem.refreshMissileForecasts({
      simulation,
      celestialConfigs,
      defenseConfigs,
      elapsedSeconds,
      missiles: missileVisuals,
    });
    const flightCameraFocusPoints = [
      interceptorPosition,
      ...missileVisuals
        .filter(
          (missile) =>
            missile.detonationElapsedSeconds === null &&
            missile.neutralizedElapsedSeconds === null &&
            distanceBetween(missile.body.position, interceptorPosition) <= 920,
        )
        .map((missile) => missile.body.position),
      ...coastPrediction.positions.slice(0, 18),
      ...currentBurnPrediction.positions.slice(0, 18),
      ...boostedPrediction.positions.slice(0, 18),
    ];
    const tacticalCameraFocusPoints = [
      interceptorPosition,
      ...celestialVisuals
        .filter((visual) => !visual.config.hidden)
        .map((visual) => visual.body.position),
      ...defenseVisuals
        .filter((visual) => !visual.destroyed)
        .map((visual) => visual.body.position),
      ...missileVisuals
        .filter(
          (missile) =>
            missile.detonationElapsedSeconds === null &&
            missile.neutralizedElapsedSeconds === null,
        )
        .map((missile) => missile.body.position),
      ...coastPrediction.positions.slice(0, 40),
      ...currentBurnPrediction.positions.slice(0, 40),
      ...boostedPrediction.positions.slice(0, 40),
    ];
    const cameraFrame = computeCameraFrame({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      focusPoints: tacticalViewActive
        ? tacticalCameraFocusPoints
        : flightCameraFocusPoints,
      padding: tacticalViewActive ? 520 : 124,
      minZoom: tacticalViewActive ? 0.06 : 0.22,
      maxZoom: tacticalViewActive ? 1.1 : 1.22,
    });
    const nextCamera = updatePrototypeCamera({
      currentCenter: cameraCenter,
      currentZoom: cameraZoom,
      cameraFrame,
      shipPosition: interceptorPosition,
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      tacticalViewActive,
      missionVisible:
        hudVisible &&
        (customTrainingMissionEnabled || genericMissionState !== null) &&
        !isCrashed,
      hudVisible,
      isCrashed,
      scannerRange,
      sceneCameraOverride: pauseMenuOpen ? null : sceneCameraOverride,
    });
    cameraCenter = nextCamera.center;
    cameraZoom = nextCamera.zoom;

    const screenCenter = getScreenCenter();
    world.scale.set(cameraZoom);
    world.position.set(
      screenCenter.x - cameraCenter.x * cameraZoom,
      screenCenter.y - cameraCenter.y * cameraZoom,
    );
    syncCelestialNameLabels({
      container: celestialNameOverlay,
      celestialVisuals,
      cameraZoom,
      worldOffset: world.position,
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      visible: !isCrashed,
    });

    if (hudConfig.overlays.guidanceFidelityMesh) {
      const viewWidth = app.screen.width / cameraZoom;
      const viewHeight = app.screen.height / cameraZoom;
      const meshStyle = WORLD_OVERLAY_STYLES.guidanceFidelityMesh;
      const sampleSpacing = Math.max(
        meshStyle.minSampleSpacing,
        Math.max(
          viewWidth / meshStyle.maxColumns,
          viewHeight / meshStyle.maxRows,
        ),
      );
      const meshBounds = {
        minX: cameraCenter.x - viewWidth * 0.5,
        maxX: cameraCenter.x + viewWidth * 0.5,
        minY: cameraCenter.y - viewHeight * 0.5,
        maxY: cameraCenter.y + viewHeight * 0.5,
      };
      const gravityBodiesBySystem = new Map<string, OrbitalBodyState[]>();
      const systemMeshOrigins = new Map<string, { x: number; y: number }>();

      for (const visual of celestialVisuals) {
        if (visual.config.hidden || !visual.body.affectsGravity) {
          continue;
        }

        const bodies = gravityBodiesBySystem.get(visual.body.systemId) ?? [];
        bodies.push(visual.body);
        gravityBodiesBySystem.set(visual.body.systemId, bodies);
      }

      for (const systemId of gravityBodiesBySystem.keys()) {
        const systemRoot = getSystemRoot(celestialVisuals, systemId);
        systemMeshOrigins.set(systemId, {
          x: systemRoot.body.position.x,
          y: systemRoot.body.position.y,
        });
      }

      const meshGrids = [...gravityBodiesBySystem.entries()].map(
        ([systemId, gravityBodies]) =>
          sampleGuidanceFieldMeshGrid(
            gravityBodies,
            meshBounds,
            sampleSpacing,
            systemMeshOrigins.get(systemId) ?? { x: 0, y: 0 },
            {
              gradientSampleDistance: FORECAST_TUNING.hybrid.gradientSampleDistance,
              adaptiveGradientStart: FORECAST_TUNING.hybrid.adaptiveGradientStart,
              fullSimulationGradientThreshold:
                FORECAST_TUNING.hybrid.fullSimulationGradientThreshold,
            },
            meshStyle.displacementScale,
            meshStyle.maxDisplacementFraction,
          ),
      );

      drawGuidanceFidelityMesh(guidanceMeshOverlay, meshGrids);
    } else {
      guidanceMeshOverlay.clear();
    }

    for (const visual of celestialVisuals) {
      visual.sprite.position.set(visual.body.position.x, visual.body.position.y);
      visual.sprite.visible = !visual.config.hidden;
    }
    if (hudConfig.overlays.orbitalGuides) {
      drawOrbitalGuides(orbitalGuides, celestialVisuals);
    } else {
      orbitalGuides.clear();
    }
    if (hudConfig.overlays.gravityWellBoundaries) {
      drawGravityWellBoundaries(
        gravityWellOverlay,
        celestialVisuals,
        gravityWellBoundaryRadii,
      );
    } else {
      gravityWellOverlay.clear();
    }
    defensiveLockAlertSeconds = Math.max(
      0,
      defensiveLockAlertSeconds - ticker.deltaMS / 1000,
    );

    const scannerContacts = [
      ...celestialVisuals.filter((visual) => visual.config.parentId !== null),
      ...defenseVisuals.filter((visual) => !visual.destroyed),
    ]
      .map((visual) =>
        classifyScannerContact(
          interceptorPosition,
          visual,
          celestialVisuals,
          scannerRange,
        ),
      );
    const visibleContacts = scannerContacts.filter((contact) => contact.visible);
    const defenseSensorRangeContacts = visibleContacts;
    const highlightedDefenseSensorIds: Set<string> | null = null;
    const visibleDefenseContacts = visibleContacts.filter(
      (contact): contact is ScannerContact & { visual: DefenseVisual } =>
        isDefenseVisual(contact.visual) && isCombatDefenseVisual(contact.visual),
    );
    const visibleFuelStations = visibleContacts.filter((contact) =>
      isDefenseVisual(contact.visual) && contact.visual.config.weaponType === "station"
    );
    const refuelBodies = celestialVisuals.filter((visual) => hasCelestialRefuelSource(visual.config));
    const torpedoContacts = missileVisuals.map((missile) =>
      classifyTorpedoScannerContact(
        interceptorPosition,
        missile,
        celestialVisuals,
        scannerRange,
      ),
    );
    updateTorpedoScannerLocks(
      torpedoLockStates,
      torpedoContacts,
      defenseLockStates,
      shipSystems,
      getScannerLockMultiplier(shipSystems),
      ticker.deltaMS / 1000,
    );
    const registeredTorpedoes = torpedoContacts.filter((contact) =>
      isRegisteredTorpedoContact(contact, torpedoLockStates),
    );
    const registeredTorpedoIds = new Set(
      registeredTorpedoes.map((contact) => contact.missile.id),
    );
    updateMissileSprites(missileVisuals, registeredTorpedoIds);
    let defensiveLockCueTriggered = false;
    const currentlyAcquiredDefensiveLocks = new Set<string>();
    for (const contact of registeredTorpedoes) {
      const lockState = torpedoLockStates.get(contact.missile.id);
      if (
        lockState === undefined ||
        lockState.progress < COMBAT_BALANCE.disintegrator.targetAcquireThreshold
      ) {
        continue;
      }

      currentlyAcquiredDefensiveLocks.add(contact.missile.id);
      if (!announcedDefensiveLockIds.has(contact.missile.id)) {
        defensiveLockCueTriggered = true;
      }
    }
    for (const lockId of currentlyAcquiredDefensiveLocks) {
      announcedDefensiveLockIds.add(lockId);
    }
    for (const lockId of [...announcedDefensiveLockIds]) {
      if (!currentlyAcquiredDefensiveLocks.has(lockId)) {
        announcedDefensiveLockIds.delete(lockId);
      }
    }
    if (defensiveLockCueTriggered) {
      defensiveLockAlertSeconds = 1.15;
    }
    updateDefenseScannerLocks(
      defenseLockStates,
      visibleDefenseContacts,
      shipSystems.scanners.charge,
      getScannerLockMultiplier(shipSystems),
      ticker.deltaMS / 1000,
    );
    const activeIncomingTorpedoes = missileVisuals.filter(
      (missile) =>
        missile.detonationElapsedSeconds === null &&
        missile.neutralizedElapsedSeconds === null,
    );
    const registeredIncomingTorpedoes = activeIncomingTorpedoes.filter((missile) =>
      registeredTorpedoIds.has(missile.id),
    );
    const registeredHostileDefenseIds = getRegisteredHostileDefenseIds(
      visibleDefenseContacts,
      defenseLockStates,
    );
    const likelyEnemyMarkers = buildLikelyEnemyMarkers({
      defenseVisuals,
      registeredHostileDefenseIds,
      launcherStates,
      missileVisuals: activeIncomingTorpedoes,
    });
    syncTacticalEntitySystem({
      system: tacticalEntities,
      interceptorBody,
      celestialVisuals,
      defenseVisuals,
      missileVisuals,
      activeMarker: missionDisplayTarget,
      knownHostileDefenseIds: registeredHostileDefenseIds,
      likelyEnemyMarkers,
      knownMissileIds: registeredTorpedoIds,
    });
    for (const visual of defenseVisuals) {
      visual.sprite.position.set(visual.body.position.x, visual.body.position.y);
      if (visual.disabledUntilSeconds <= elapsedSeconds) {
        visual.sprite.rotation += 0.01;
      }
      const registeredOnScanners =
        visual.config.weaponType === "station" ||
        registeredHostileDefenseIds.has(visual.config.id);
      visual.sprite.visible = !visual.destroyed && registeredOnScanners;
      visual.sprite.alpha = visual.sprite.visible ? 1 : 0;
    }
    const legacyStationRefueling =
      !pauseActive &&
      interceptorBody.crashed === null &&
      applyFuelStationRefuel(
      shipSystems,
      interceptorPosition,
      [
        ...refuelBodies,
        ...visibleFuelStations
          .map((contact) => contact.visual)
          .filter((visual): visual is DefenseVisual => isDefenseVisual(visual)),
      ],
      ticker.deltaMS / 1000,
    );
    const isRefueling = legacyStationRefueling || fuelDroneSupport.transferActive;
    const lockedDisintegratorTargets = registeredTorpedoes.filter((contact) => {
      const lockState = torpedoLockStates.get(contact.missile.id);
      return (
        lockState !== undefined &&
        lockState.progress >= COMBAT_BALANCE.disintegrator.targetAcquireThreshold &&
        contact.distance <= disintegratorRange
      );
    });
    const lockedDefenseTargets = visibleDefenseContacts.filter((contact) => {
      const lockState = defenseLockStates.get(contact.visual.config.id);
      return (
        lockState !== undefined &&
        lockState.progress >= COMBAT_BALANCE.defenses.disintegratorLockThreshold &&
        contact.distance <= disintegratorRange
      );
    });
    const lockedDisruptorTargets = visibleDefenseContacts.filter((contact) => {
      const lockState = defenseLockStates.get(contact.visual.config.id);
      return (
        lockState !== undefined &&
        lockState.progress >= COMBAT_BALANCE.disruptor.targetAcquireThreshold &&
        contact.distance <= disruptorRange
      );
    });
    const helionLauncherInvulnerable =
      helionWeaponsTutorialEnabled &&
      helionTutorialLauncherId !== null &&
      helionInterceptedTorpedoes < HELION_WEAPONS_TUTORIAL_REQUIRED_INTERCEPTS;
    const eligibleDisintegratorTargets = [
      ...lockedDisintegratorTargets.map((contact) => ({
        kind: "torpedo" as const,
        id: contact.missile.id,
        position: contact.missile.detonationPosition ?? contact.missile.body.position,
        missile: contact.missile,
      })),
      ...lockedDefenseTargets
        .filter((contact): contact is ScannerContact & { visual: DefenseVisual } =>
          isDefenseVisual(contact.visual)
        )
        .filter(
          (contact) =>
            !helionLauncherInvulnerable ||
            contact.visual.config.id !== helionTutorialLauncherId,
        )
        .map((contact) => ({
          kind: "defense" as const,
          id: contact.visual.config.id,
          position: contact.visual.body.position,
          defense: contact.visual,
        })),
    ];
    const eligibleDisruptorTargets = lockedDisruptorTargets
      .filter((contact): contact is ScannerContact & { visual: DefenseVisual } =>
        isDefenseVisual(contact.visual)
      )
      .filter(
        (contact) =>
          !helionLauncherInvulnerable ||
          contact.visual.config.id !== helionTutorialLauncherId,
      )
      .map((contact) => ({
        kind: "defense" as const,
        id: contact.visual.config.id,
        position: contact.visual.body.position,
        defense: contact.visual,
      }));
    const activeWeaponTargets =
      weaponMode === "disintegrator"
        ? (weaponArmed ? eligibleDisintegratorTargets : [])
        : (weaponArmed ? eligibleDisruptorTargets : []);
    updateDisintegratorEngagementStates(
      disintegratorEngagementStates,
      activeWeaponTargets,
      weaponArmed && !pauseActive && !isCrashed,
      weaponMode === "disintegrator"
        ? COMBAT_BALANCE.disintegrator.engageRampUpPerSecond
        : COMBAT_BALANCE.disruptor.engageRampUpPerSecond,
      weaponMode === "disintegrator"
        ? COMBAT_BALANCE.disintegrator.engageDecayPerSecond
        : COMBAT_BALANCE.disruptor.engageDecayPerSecond,
      ticker.deltaMS / 1000,
    );
    const playerWeaponFireResult = weaponMode === "disintegrator"
      ? resolveArmedDisintegrator({
        weaponArmed,
        isPaused: pauseActive,
        isCrashed,
        deltaSeconds: ticker.deltaMS / 1000,
        shipSystems,
        activeTargets: activeWeaponTargets,
        disintegratorEngagementStates,
      })
      : resolveArmedDisruptor({
        weaponArmed,
        isPaused: pauseActive,
        isCrashed,
        deltaSeconds: ticker.deltaMS / 1000,
        elapsedSeconds,
        shipSystems,
        activeTargets: activeWeaponTargets,
        disintegratorEngagementStates,
      });
    if (helionWeaponsTutorialEnabled) {
      helionWeaponsArmedEver = helionWeaponsArmedEver || weaponArmed;
      helionWeaponsBoostedEver =
        helionWeaponsBoostedEver || shipSystems.boosted === "weapons";
    }

    for (const defense of defenseVisuals) {
      if (
        defense.destroyed &&
        defense.config.weaponType === "target" &&
        !countedDestroyedTargetIds.has(defense.config.id)
      ) {
        countedDestroyedTargetIds.add(defense.config.id);
        destroyedTargetCount += 1;
      }
    }
    if (helionWeaponsTutorialEnabled) {
      helionTargetsCleared = [...helionTutorialTargetIds].every((targetId) =>
        defenseVisuals.some(
          (defense) =>
            defense.config.id === targetId &&
            defense.destroyed,
        )
      );
      if (helionTargetsCleared) {
        spawnHelionSurfaceLauncher();
      }
      if (helionTargetsCleared && playerWeaponFireResult.neutralizedTorpedoCount > 0) {
        helionInterceptedTorpedoes += playerWeaponFireResult.neutralizedTorpedoCount;
      }
    }

    for (const defense of defenseVisuals) {
      if (defense.destroyed) {
        continue;
      }

      const engagementProgress = disintegratorEngagementStates.get(defense.config.id)?.progress ?? 0;
      const damageGlow = Math.min(
        1,
        defense.disintegratorEnergyAbsorbed / COMBAT_BALANCE.defenses.durability,
      );
      const shieldFraction = defense.shieldMaxCharge > 0
        ? defense.shieldCharge / defense.shieldMaxCharge
        : 0;
      const disabled = defense.disabledUntilSeconds > elapsedSeconds;
      defense.sprite.alpha = disabled ? 0.45 : 0.7 + damageGlow * 0.18 + shieldFraction * 0.12;
      defense.sprite.scale.set(1 + engagementProgress * 0.06 + shieldFraction * 0.03);
    }

    if (isCrashed) {
      missionAreaOverlay.clear();
      mapKillBorderOverlay.clear();
      clearMissionAreaRadialLabels(missionAreaLabelOverlay);
      gravityWellOverlay.clear();
      guidanceMeshOverlay.clear();
      disintegratorRangeOverlay.clear();
      shieldBubbleOverlay.clear();
      defenseRangeOverlay.clear();
      scannerRadiusOverlay.clear();
      defenseConeOverlay.clear();
      interceptReticleOverlay.clear();
      defenseLockOverlay.clear();
      torpedoLockOverlay.clear();
      disintegratorEngagementOverlay.clear();
      hostileBeamOverlay.clear();
      likelyEnemyOverlay.clear();
      scannerContactsOverlay.clear();
      forceVectorOverlay.clear();
      engineCompassOverlay.clear();
      clearPathRenderer(trajectoryPreview);
      clearPathRenderer(currentBurnPreview);
      clearPathRenderer(boostedPreview);
      renderedPathCache.coast = createRenderedPathState();
      renderedPathCache.burn = createRenderedPathState();
      renderedPathCache.boost = createRenderedPathState();
    } else if (customTrainingMissionEnabled || genericMissionState) {
      drawTrainingMissionArea(missionAreaOverlay, missionDisplayTarget);
      drawMapKillBorder(
        mapKillBorderOverlay,
        mapKillBorder,
        interceptorPosition,
      );
      syncFuelLaneMapLabels(missionAreaLabelOverlay, celestialVisuals);
    } else {
      missionAreaOverlay.clear();
      drawMapKillBorder(
        mapKillBorderOverlay,
        mapKillBorder,
        interceptorPosition,
      );
      syncFuelLaneMapLabels(missionAreaLabelOverlay, celestialVisuals);
    }

    if (!isCrashed && hudConfig.overlays.disintegratorRange) {
      drawPlayerWeaponRange(
        disintegratorRangeOverlay,
        interceptorPosition,
        weaponMode === "disintegrator" ? disintegratorRange : disruptorRange,
        weaponArmed,
        weaponMode,
      );
    } else {
      disintegratorRangeOverlay.clear();
    }
    if (!isCrashed && shipSystems.boosted === "defenses") {
      drawShieldBubble(
        shieldBubbleOverlay,
        interceptorPosition,
        interceptorBody.radius + 26,
        shipSystems.defenses.maxCharge > 0
          ? shipSystems.defenses.charge / shipSystems.defenses.maxCharge
          : 0,
        playerShieldState.flash,
      );
    } else {
      shieldBubbleOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.defenseSensorRanges) {
      drawDefenseSensorRanges(
        defenseRangeOverlay,
        defenseSensorRangeContacts,
        launcherStates,
        celestialVisuals,
        highlightedDefenseSensorIds ?? undefined,
      );
    } else {
      defenseRangeOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.scannerRadius) {
      drawScannerRadius(
        scannerRadiusOverlay,
        interceptorPosition,
        scannerRange,
        weaponMode === "disintegrator" ? disintegratorRange : disruptorRange,
        celestialVisuals,
      );
    } else {
      scannerRadiusOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.defenseScannerCones) {
      drawDefenseScannerCones(
        defenseConeOverlay,
        visibleContacts,
        celestialVisuals,
      );
    } else {
      defenseConeOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.interceptReticles) {
      drawInterceptReticles(
        interceptReticleOverlay,
        visibleContacts,
        launcherStates,
      );
    } else {
      interceptReticleOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.defenseLocks) {
      drawDefenseLockOverlay(
        defenseLockOverlay,
        defenseLockStates,
        visibleDefenseContacts,
      );
    } else {
      defenseLockOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.torpedoLocks) {
      drawTorpedoLockOverlay(
        torpedoLockOverlay,
        torpedoLockStates,
        registeredTorpedoes,
      );
    } else {
      torpedoLockOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.disintegratorEngagement) {
      drawDisintegratorEngagementLines(
        disintegratorEngagementOverlay,
        interceptorPosition,
        weaponMode === "disintegrator"
          ? eligibleDisintegratorTargets
          : eligibleDisruptorTargets,
        weaponArmed,
        disintegratorEngagementStates,
        weaponMode,
      );
    } else {
      disintegratorEngagementOverlay.clear();
    }
    if (!isCrashed) {
      drawHostileBeamLines(
        hostileBeamOverlay,
        defenseVisuals,
        launcherStates,
        interceptorPosition,
      );
    } else {
      hostileBeamOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.scannerContacts) {
      drawLikelyEnemyMarkers(likelyEnemyOverlay, likelyEnemyMarkers);
      drawScannerContacts(scannerContactsOverlay, visibleContacts);
    } else {
      likelyEnemyOverlay.clear();
      scannerContactsOverlay.clear();
    }

    for (const visual of celestialVisuals) {
      visual.sprite.alpha = 1;
    }

    let activeWarnings: GameWarningState[] = [];
    let navigationWarning: string | null = null;
    if (!isCrashed) {
      renderedPathCache.coast = updateRenderedPathState(
        renderedPathCache.coast,
        coastPrediction.positions,
        FORECAST_TUNING.rendering.coastLerpFactor,
        FORECAST_TUNING.rendering.spatialSmoothingFactor,
        FORECAST_TUNING.rendering.lockedLeadingPoints,
        FORECAST_TUNING.rendering.resampleSpacing,
        FORECAST_TUNING.rendering.maxRenderPoints,
        FORECAST_TUNING.rendering.stabilityPointDelta,
        FORECAST_TUNING.rendering.stabilityOverlapSearchPoints,
        FORECAST_TUNING.rendering.stabilityOverlapComparePoints,
        FORECAST_TUNING.rendering.stabilityAlignmentSearchPoints,
        FORECAST_TUNING.rendering.stabilityBacktrackPoints,
        FORECAST_TUNING.rendering.stabilityViolationWindowPoints,
        FORECAST_TUNING.rendering.stabilityViolationThreshold,
        FORECAST_TUNING.rendering.stablePointDropPerFrame,
        FORECAST_TUNING.rendering.stablePointGrowPerFrame,
        FORECAST_TUNING.rendering.stablePointDropConfirmFrames,
      );
      renderedPathCache.burn = updateRenderedPathState(
        renderedPathCache.burn,
        currentBurnPrediction.positions,
        FORECAST_TUNING.rendering.burnLerpFactor,
        FORECAST_TUNING.rendering.spatialSmoothingFactor,
        FORECAST_TUNING.rendering.lockedLeadingPoints,
        FORECAST_TUNING.rendering.resampleSpacing,
        FORECAST_TUNING.rendering.maxRenderPoints,
        FORECAST_TUNING.rendering.stabilityPointDelta,
        FORECAST_TUNING.rendering.stabilityOverlapSearchPoints,
        FORECAST_TUNING.rendering.stabilityOverlapComparePoints,
        FORECAST_TUNING.rendering.stabilityAlignmentSearchPoints,
        FORECAST_TUNING.rendering.stabilityBacktrackPoints,
        FORECAST_TUNING.rendering.stabilityViolationWindowPoints,
        FORECAST_TUNING.rendering.stabilityViolationThreshold,
        FORECAST_TUNING.rendering.stablePointDropPerFrame,
        FORECAST_TUNING.rendering.stablePointGrowPerFrame,
        FORECAST_TUNING.rendering.stablePointDropConfirmFrames,
      );
      renderedPathCache.boost = updateRenderedPathState(
        renderedPathCache.boost,
        boostedPrediction.positions,
        FORECAST_TUNING.rendering.boostLerpFactor,
        FORECAST_TUNING.rendering.spatialSmoothingFactor,
        FORECAST_TUNING.rendering.lockedLeadingPoints,
        FORECAST_TUNING.rendering.resampleSpacing,
        FORECAST_TUNING.rendering.maxRenderPoints,
        FORECAST_TUNING.rendering.stabilityPointDelta,
        FORECAST_TUNING.rendering.stabilityOverlapSearchPoints,
        FORECAST_TUNING.rendering.stabilityOverlapComparePoints,
        FORECAST_TUNING.rendering.stabilityAlignmentSearchPoints,
        FORECAST_TUNING.rendering.stabilityBacktrackPoints,
        FORECAST_TUNING.rendering.stabilityViolationWindowPoints,
        FORECAST_TUNING.rendering.stabilityViolationThreshold,
        FORECAST_TUNING.rendering.stablePointDropPerFrame,
        FORECAST_TUNING.rendering.stablePointGrowPerFrame,
        FORECAST_TUNING.rendering.stablePointDropConfirmFrames,
      );

      const forecastOrigin = getForecastOrigin(
        interceptorPosition,
        liveVelocityHeading,
        FORECAST_TUNING.rendering.originNoseOffset,
      );
      const coastRenderPath = prepareRenderedPath(
        renderedPathCache.coast.points,
        renderedPathCache.coast.visibleStablePointCount,
        interceptorPosition,
        liveVelocityHeading,
        FORECAST_TUNING.rendering.leadingSkipDistance,
        FORECAST_TUNING.rendering.trailingTrimFraction,
        FORECAST_TUNING.rendering.trailingTrimMinimumPoints,
      );
      const burnRenderPath = prepareRenderedPath(
        renderedPathCache.burn.points,
        renderedPathCache.burn.visibleStablePointCount,
        interceptorPosition,
        liveVelocityHeading,
        FORECAST_TUNING.rendering.leadingSkipDistance,
        FORECAST_TUNING.rendering.trailingTrimFraction,
        FORECAST_TUNING.rendering.trailingTrimMinimumPoints,
      );
      const boostRenderPath = prepareRenderedPath(
        renderedPathCache.boost.points,
        renderedPathCache.boost.visibleStablePointCount,
        interceptorPosition,
        liveVelocityHeading,
        FORECAST_TUNING.rendering.leadingSkipDistance,
        FORECAST_TUNING.rendering.trailingTrimFraction,
        FORECAST_TUNING.rendering.trailingTrimMinimumPoints,
      );
      const coastConfidence = getRenderedPathConfidence(
        renderedPathCache.coast,
      );
      const burnConfidence = getRenderedPathConfidence(
        renderedPathCache.burn,
      );
      const boostConfidence = getRenderedPathConfidence(
        renderedPathCache.boost,
      );
      const forecastVisibility = resolveForecastVisibilityState({
        coastPath: coastRenderPath,
        burnPath: burnRenderPath,
        boostPath: boostRenderPath,
        forecastOrigin,
        minimumNavigationLength: FORECAST_TUNING.rendering.minimumNavigationLength,
        burnPreviewActive: !!thrustVector,
      });
      const coastVisiblePath = forecastVisibility.coastPath;
      const burnVisiblePath = forecastVisibility.burnPath;
      const boostVisiblePath = forecastVisibility.boostPath;
      navigationWarning = forecastVisibility.navigationWarning;
      const useInstantaneousGuidance = shouldUseInstantaneousGuidance(
        thrustVector
          ? [
              renderedPathCache.coast,
              renderedPathCache.burn,
              renderedPathCache.boost,
            ]
          : [renderedPathCache.coast],
        FORECAST_TUNING.rendering.instantaneousMinimumSourcePoints,
        FORECAST_TUNING.rendering.instantaneousUnstablePointSlack,
        FORECAST_TUNING.rendering.instantaneousStableRatioThreshold,
      );

      if (
        FORECAST_TUNING.rendering.instantaneousFallbackEnabled &&
        useInstantaneousGuidance &&
        hudConfig.overlays.forceVector
      ) {
        clearPathRenderer(trajectoryPreview);
        clearPathRenderer(currentBurnPreview);
        clearPathRenderer(boostedPreview);
        drawForceVector(
          forceVectorOverlay,
          interceptorPosition,
          interceptorBody.acceleration,
        );
      } else {
        forceVectorOverlay.clear();
        drawStyledPath(trajectoryPreview, coastVisiblePath, {
          color: WORLD_OVERLAY_STYLES.forecast.coast.color,
          width: WORLD_OVERLAY_STYLES.forecast.coast.width,
          alpha: coastPrediction.hazard
            ? WORLD_OVERLAY_STYLES.forecast.coast.hazardAlpha
            : WORLD_OVERLAY_STYLES.forecast.coast.alpha,
          markerRadius: WORLD_OVERLAY_STYLES.forecast.coast.markerRadius,
        }, forecastOrigin, coastConfidence);
        if (thrustVector) {
          drawStyledPath(currentBurnPreview, burnVisiblePath, {
            color: getBurnForecastColor(thrustVector.label, !!currentBurnPrediction.hazard),
            width: WORLD_OVERLAY_STYLES.forecast.burn.width,
            alpha: currentBurnPrediction.hazard
              ? WORLD_OVERLAY_STYLES.forecast.burn.hazardAlpha
              : WORLD_OVERLAY_STYLES.forecast.burn.alpha,
            markerRadius: WORLD_OVERLAY_STYLES.forecast.burn.markerRadius,
          }, forecastOrigin, burnConfidence);
          if (thrustVector.useFullBoostOutput) {
            clearPathRenderer(boostedPreview);
          } else {
            drawStyledPath(boostedPreview, boostVisiblePath, {
              color: WORLD_OVERLAY_STYLES.forecast.boost.color,
              width: WORLD_OVERLAY_STYLES.forecast.boost.width,
              alpha: boostedPrediction.hazard
                ? WORLD_OVERLAY_STYLES.forecast.boost.hazardAlpha
                : WORLD_OVERLAY_STYLES.forecast.boost.alpha,
              markerRadius: WORLD_OVERLAY_STYLES.forecast.boost.markerRadius,
              dashLength: WORLD_OVERLAY_STYLES.forecast.boost.dashLength,
              gapLength: WORLD_OVERLAY_STYLES.forecast.boost.gapLength,
            }, forecastOrigin, boostConfidence);
          }
        } else {
          renderedPathCache.burn = createRenderedPathState();
          renderedPathCache.boost = createRenderedPathState();
          clearPathRenderer(currentBurnPreview);
          clearPathRenderer(boostedPreview);
        }
      }
    } else {
      forceVectorOverlay.clear();
    }
    if (!isCrashed && hudConfig.overlays.forceVector) {
      const gravityMagnitude = Math.hypot(
        netGravityAcceleration.x,
        netGravityAcceleration.y,
      );
      const screenCenter = getScreenCenter();
      const interceptorScreenPosition = {
        x: screenCenter.x + (interceptorPosition.x - cameraCenter.x) * cameraZoom,
        y: screenCenter.y + (interceptorPosition.y - cameraCenter.y) * cameraZoom,
      };
      drawEngineCompass(engineCompassOverlay, {
        origin: interceptorScreenPosition,
        referenceHeading: liveVelocityHeading,
        thrustHeading: interceptorBody.propulsion?.heading ?? null,
        throttleFraction: clamp(
          engineOutputCeiling > 0
            ? Math.max(engineThrottle, requestedThrottle) / engineOutputCeiling
            : 0,
          0,
          1,
        ),
        gravityHeading:
          gravityMagnitude > 0.000001
            ? Math.atan2(netGravityAcceleration.y, netGravityAcceleration.x)
            : null,
        scale: clamp(
          Math.min(app.screen.width, app.screen.height) / 900,
          WORLD_OVERLAY_STYLES.engineCompass.scaleMin,
          WORLD_OVERLAY_STYLES.engineCompass.scaleMax,
        ),
        boosted: superBurnActive || engineThrottle > 1.01,
      });
    } else {
      engineCompassOverlay.clear();
    }

    interceptor.position.set(interceptorPosition.x, interceptorPosition.y);
    interceptor.rotation = liveVelocityHeading + Math.PI / 2;
    interceptor.visible = !isCrashed;
    drawExplosion(
      explosion,
      interceptorPosition,
      isCrashed ? crashSequenceElapsed : 0,
    );

    const nearestBody = findNearestBody(interceptorPosition, celestialVisuals);
    const nearestDefense =
      defenseVisuals.length > 0
        ? findNearestDefense(
            interceptorPosition,
            defenseVisuals.filter(
              (defense) =>
                !defense.destroyed &&
                isCombatDefenseVisual(defense) &&
                registeredHostileDefenseIds.has(defense.config.id),
            ),
          )
        : null;
    const torpedoesWithSolutions = missileVisuals.filter(
      (missile) => missile.interceptSolution !== null,
    );
    const lockedTorpedoes = registeredTorpedoes.filter((contact) => {
      const lockState = torpedoLockStates.get(contact.missile.id);
      return lockState !== undefined && lockState.progress > 0;
    });
    const strongestEnemyLock = findStrongestEnemyLockThreat(
      defenseVisuals,
      launcherStates,
    );
    const enemyLockWarningActive =
      strongestEnemyLock !== null || registeredIncomingTorpedoes.length > 0;
    activeWarnings = updateGameWarningManager(warningManager, [
      {
        id: "tutorial-complete",
        title: "TUTORIAL COMPLETE",
        message: "Nadir free play unlocked.",
        accentColor: "#74f0b4",
        priority: WARNING_PRIORITIES.tutorialComplete,
        active:
          orbitalFlightTrainingEnabled &&
          missionSnapshot.completed &&
          elapsedSeconds <= tutorialCompleteWarningUntilSeconds,
      },
      {
        id: "defensive-lock-acquired",
        title: "DEFENSIVE LOCK ACQUIRED",
        message: "Point-defense solution aligned on incoming torpedo.",
        accentColor: "#6ae78c",
        priority: WARNING_PRIORITIES.defensiveLockAcquired,
        active: defensiveLockAlertSeconds > 0,
      },
      {
        id: "incoming-torpedo",
        title: "INCOMING TORPEDO",
        message: registeredIncomingTorpedoes.length > 1
          ? `${registeredIncomingTorpedoes.length} hostile torpedoes inbound.`
          : "Hostile torpedo inbound.",
        accentColor: "#ff5f57",
        priority: WARNING_PRIORITIES.incomingTorpedo,
        active: registeredIncomingTorpedoes.length > 0,
      },
      {
        id: "enemy-lock",
        title: "ENEMY LOCK",
        message: strongestEnemyLock
          ? registeredHostileDefenseIds.has(strongestEnemyLock.id)
            ? `${strongestEnemyLock.name} tracking at ${(strongestEnemyLock.lockFraction * 100).toFixed(0)}%.`
            : `Likely hostile contact tracking at ${(strongestEnemyLock.lockFraction * 100).toFixed(0)}%.`
          : registeredIncomingTorpedoes.length > 0
            ? "Hostile lock is sustaining incoming torpedo guidance."
            : "Hostile fire-control solution forming.",
        accentColor: "#ff9158",
        priority: WARNING_PRIORITIES.enemyLock,
        active: enemyLockWarningActive,
      },
      {
        id: "nav-solution-unstable",
        title: "NAV SOLUTION UNSTABLE",
        message: navigationWarning ?? "",
        accentColor: "#ff8a6a",
        priority: WARNING_PRIORITIES.navSolutionUnstable,
        active: navigationWarning !== null,
      },
    ], elapsedSeconds);
    const scannerStatus =
      visibleContacts.length > 0
        ? visibleContacts
            .map((contact) => `${contact.visual.config.name} ${contact.distance.toFixed(0)} km`)
            .join(" | ")
        : "No clear contacts";
    const occludedContacts = scannerContacts
      .filter((contact) => contact.inRange && !contact.visible && contact.occludedBy)
      .map((contact) => {
        const hiddenHostileDefense =
          isDefenseVisual(contact.visual) &&
          isCombatDefenseVisual(contact.visual) &&
          !registeredHostileDefenseIds.has(contact.visual.config.id);
        const label = hiddenHostileDefense
          ? "Unknown hostile contact"
          : contact.visual.config.name;
        return `${label} behind ${contact.occludedBy?.config.name}`;
      })
      .join(" | ");
    const warnings = [
      lastTrainingTargetEvent
        ? `Marker ${lastTrainingTargetEvent.type}: ${lastTrainingTargetEvent.label}`
        : null,
      formatWarning("Coast", coastPrediction.hazard),
      thrustVector
        ? formatWarning("Burn", currentBurnPrediction.hazard)
        : null,
      thrustVector
        ? formatWarning("Boost", boostedPrediction.hazard)
        : null,
      interceptorBody.crashed
        ? `Ship destroyed on impact with ${interceptorBody.crashed.otherBodyId} at ${interceptorBody.crashed.relativeSpeed.toFixed(2)} km/s`
        : null,
      isCrashed ? `Auto-restart in ${autoRestartTimer.toFixed(1)}s` : null,
      ...defenseVisuals
        .filter(
          (defense) =>
            !defense.destroyed &&
            isCombatDefenseVisual(defense) &&
            registeredHostileDefenseIds.has(defense.config.id),
        )
        .map((defense) => ({
          defense,
          launcherState: launcherStates.get(defense.config.id),
          occluder: findOccludingBodyBetween(
            defense.body.position,
            interceptorPosition,
            celestialVisuals,
          ),
        }))
        .filter(({ defense }) =>
          distanceBetween(interceptorPosition, defense.body.position) <= defense.config.scannerRange,
        )
        .map((defense) => {
          if (defense.occluder) {
            return `${defense.defense.config.name}: sensor shadowed by ${defense.occluder.config.name}`;
          }

          const lockFraction = defense.launcherState
            ? defense.launcherState.lockProgress / defense.defense.config.lockOnSeconds
            : 0;
          return lockFraction >= 1
            ? `${defense.defense.config.name}: torpedo away`
            : `${defense.defense.config.name}: lock ${(lockFraction * 100).toFixed(0)}%`;
        }),
    ].filter((warning) => warning !== null);

    const telemetryLines = [
      hudConfig.telemetry.fps
        ? `FPS: ${fpsSmoothed.toFixed(0)}`
        : null,
      hudConfig.telemetry.nearestBody
        ? `Nearest body: ${nearestBody.config.name} at ${nearestBody.distance.toFixed(1)} km`
        : null,
      hudConfig.telemetry.nearestDefense && nearestDefense
        ? `Nearest defense: ${nearestDefense.config.name} at ${nearestDefense.distance.toFixed(1)} km`
        : null,
      hudConfig.telemetry.localRange
        ? `Range to local ${getSystemRoot(celestialVisuals, interceptorBody.systemId).config.name}: ${distanceBetween(interceptorPosition, getSystemRoot(celestialVisuals, interceptorBody.systemId).body.position).toFixed(1)} km`
        : null,
      hudConfig.telemetry.speed
        ? `Speed: ${Math.hypot(interceptorVelocity.x, interceptorVelocity.y).toFixed(2)} km/s`
        : null,
      hudConfig.telemetry.throttle
        ? `Throttle: ${(engineThrottle * 100).toFixed(0)}% -> target ${(requestedThrottle * 100).toFixed(0)}%`
        : null,
      hudConfig.telemetry.boost ? `Boost: ${superBurnActive ? "SUPER" : "OFF"}` : null,
      hudConfig.telemetry.state
        ? `State: ${isCrashed ? "DESTROYED" : pauseActive ? "PAUSED" : "LIVE"}`
        : null,
      hudConfig.telemetry.disintegrator
        ? `${getPlayerWeaponLabel(weaponMode)}: ${weaponArmed ? "ARMED" : "SAFE"}${playerWeaponFireResult.fired ? ` | firing ${playerWeaponFireResult.targetCount}` : ""}`
        : null,
      hudConfig.telemetry.system
        ? `System: ${interceptorBody.systemId} | Motion: deterministic cycles`
        : null,
      hudConfig.telemetry.scanner
        ? `Scanner: ${scannerRange.toFixed(0)} km | ${visibleContacts.length} clear contact(s)`
        : null,
      hudConfig.telemetry.defenseLocks
        ? `Defense locks: ${visibleDefenseContacts
            .filter((contact) => {
              const lockState = defenseLockStates.get(contact.visual.config.id);
              return lockState !== undefined && lockState.progress > 0;
            })
            .map((contact) => {
              const lockState = defenseLockStates.get(contact.visual.config.id);
              return `${contact.visual.config.name} ${(Math.min(1, lockState?.progress ?? 0) * 100).toFixed(0)}%`;
            })
            .join(" | ") || "No defense locks"}`
        : null,
      hudConfig.telemetry.torpedoContacts
        ? `Torpedo scanner contacts: ${registeredTorpedoes.length}`
        : null,
      hudConfig.telemetry.disintegratorRange
        ? `${getPlayerWeaponLabel(weaponMode)} range: ${(weaponMode === "disintegrator" ? disintegratorRange : disruptorRange).toFixed(0)} km`
        : null,
      hudConfig.telemetry.disintegratorLocks
        ? `${getPlayerWeaponLabel(weaponMode)} locks in range: ${weaponMode === "disintegrator" ? lockedDisintegratorTargets.length + lockedDefenseTargets.length : lockedDisruptorTargets.length}${activeWeaponTargets.length > 0 ? ` | charge share ${(playerWeaponFireResult.chargePerTarget * 100).toFixed(0)}%` : ""}`
        : null,
      hudConfig.telemetry.torpedoesInFlight
        ? `Photon torpedoes in flight: ${missileVisuals.length}`
        : null,
      hudConfig.telemetry.trackedIntercepts && torpedoesWithSolutions.length > 0
        ? `Tracked torpedo intercepts: ${torpedoesWithSolutions
            .map((missile) =>
              `${missile.id.split(":").at(-1)} -> ${missile.interceptSolution?.timeToInterceptSeconds.toFixed(1)}s`,
            )
            .join(" | ")}`
        : null,
      hudConfig.telemetry.torpedoScannerLocks
        ? `Scanner locks: ${lockedTorpedoes.length > 0
            ? lockedTorpedoes
                .map((contact) => {
                  const lockState = torpedoLockStates.get(contact.missile.id);
                  return `${contact.missile.id.split(":").at(-1)} ${(Math.min(1, lockState?.progress ?? 0) * 100).toFixed(0)}%${lockState?.solution ? ` | ETA ${lockState.solution.timeToInterceptSeconds.toFixed(1)}s` : ""}`;
                })
                .join(" | ")
            : "No torpedo locks"}`
        : null,
      hudConfig.telemetry.subsystemFocus ? `Boosted: ${shipSystems.boosted}` : null,
      hudConfig.telemetry.subsystemStatus
        ? formatSubsystemLine("ENG", shipSystems.engines, getEngineThrustMultiplier(shipSystems))
        : null,
      hudConfig.telemetry.subsystemStatus
        ? formatSubsystemLine("SCN", shipSystems.scanners, getScannerRangeMultiplier(shipSystems))
        : null,
      hudConfig.telemetry.subsystemStatus
        ? formatSubsystemLine("WEP", shipSystems.weapons, getWeaponRangeMultiplier(shipSystems))
        : null,
      hudConfig.telemetry.subsystemStatus
        ? formatSubsystemLine("DEF", shipSystems.defenses, getDefenseDisintegratorResistanceMultiplier(shipSystems))
        : null,
      hudConfig.telemetry.cameraZoom ? `Camera zoom: ${cameraZoom.toFixed(2)}x` : null,
      hudConfig.telemetry.cameraZoom
        ? `Camera mode: ${tacticalViewActive ? "TACTICAL" : "FLIGHT"}`
        : null,
      hudConfig.telemetry.mapInfo
          ? `Map: ${activeMapDescription}`
        : null,
      hudConfig.telemetry.activeBurn
        ? `Active burn: ${thrustVector ? `${formatThrustLabel(thrustVector)} @ ${(thrustVector.throttle * 100).toFixed(0)}%` : "None"}`
        : null,
      hudConfig.telemetry.previewLegend
        ? `Preview: cyan coast | colored current burn | gold boosted burn`
        : null,
      hudConfig.telemetry.contacts ? `Contacts: ${scannerStatus}` : null,
      hudConfig.telemetry.occludedContacts && occludedContacts
        ? `Occluded: ${occludedContacts}`
        : null,
      ...(hudConfig.telemetry.warnings
        ? [
            ...(fuelDroneSupport.phase === "inbound" ? ["Vesta fuel drone inbound"] : []),
            ...(isRefueling ? ["Fuel drone transfer active"] : []),
            ...warnings,
          ]
        : []),
      hudConfig.telemetry.controls
        ? "Controls: W prograde, S retrograde, D right, A left, Space E-Brake, C Gravity Dive"
        : null,
      hudConfig.telemetry.controls
        ? "Mix directions to combine burns | Shift super-burns when ENG is boosted | P pause"
        : null,
      hudConfig.telemetry.systems
        ? "Systems: 1 engines, 2 scanners, 3 weapons, 4 defenses"
        : null,
      hudConfig.telemetry.utility
        ? `Utility: H HUD, \` debug, F arm weapon, G switch weapon, M tactical view, Esc menu, R restart${missionPauseActive ? ", Enter continue" : ""}`
        : null,
    ].filter((line): line is string => line !== null);
    const audioCueIds: string[] = [];
    if (defensiveLockCueTriggered) {
      audioCueIds.push("defensive-lock-acquired");
    }
    if (playerDeathCueTriggered) {
      audioCueIds.push(PLAYER_DEATH_AUDIO_CUE_ID);
    }

    setGameOverlayState({
      ...buildPrototypeHudState({
        hudVisible,
        isCrashed,
        title: customTrainingMissionEnabled || genericMissionState
          ? missionSnapshot.title
          : activeSceneTitle,
        fpsSmoothed,
        scoreboardVisible,
        scoreboardTimeSeconds: elapsedSeconds,
        scoreboardTargetsDestroyed: destroyedTargetCount,
        engineThrottle,
        engineThrustHeadingRadians: thrustVector?.heading ?? null,
        disintegratorFiring:
          weaponMode === "disintegrator" && playerWeaponFireResult.fired,
        shipSystems,
        weaponArmed,
        weaponMode,
        trainingMissionEnabled: customTrainingMissionEnabled,
        missionActive: customTrainingMissionEnabled || genericMissionState !== null,
        mission: missionSnapshot,
        warnings: activeWarnings,
        audioCueIds,
      }),
    });
    debugHudRoot.visible = debugHudVisible;
    telemetry.visible = debugHudVisible;
    telemetry.text = telemetryLines.join("\n");
    sceneEvents.clear();
  };

  app.ticker.add(tickScene);

  return {
    dispose() {
      app.ticker.remove(tickScene);
      unsubscribeSceneEvents();
      keyTracker.detach(window);
      sceneRoot.destroy({
        children: true,
      });
    },
  };
}

function buildCombatTargetSnapshot(options: {
  interceptorPosition: Vector2Like;
  scannerRange: number;
  disintegratorRange: number;
  disruptorRange: number;
  weaponMode: PlayerWeaponMode;
  weaponArmed: boolean;
  celestialVisuals: readonly CelestialVisual[];
  defenseVisuals: readonly DefenseVisual[];
  missileVisuals: readonly MissileVisual[];
  torpedoLockStates: ReadonlyMap<string, TorpedoLockState>;
  defenseLockStates: ReadonlyMap<string, DefenseLockState>;
}): CombatTargetSnapshot {
  const scannerContacts = [
    ...options.celestialVisuals.filter((visual) => visual.config.parentId !== null),
    ...options.defenseVisuals.filter((visual) => !visual.destroyed),
  ].map((visual) =>
    classifyScannerContact(
      options.interceptorPosition,
      visual,
      options.celestialVisuals,
      options.scannerRange,
    ),
  );
  const visibleContacts = scannerContacts.filter((contact) => contact.visible);
  const visibleDefenseContacts = visibleContacts.filter(
    (contact): contact is ScannerContact & { visual: DefenseVisual } =>
      isDefenseVisual(contact.visual) && isCombatDefenseVisual(contact.visual),
  );
  const visibleFuelStations = visibleContacts
    .map((contact) => contact.visual)
    .filter(
      (visual): visual is DefenseVisual =>
        isDefenseVisual(visual) && visual.config.weaponType === "station",
    );
  const torpedoContacts = options.missileVisuals.map((missile) =>
    classifyTorpedoScannerContact(
      options.interceptorPosition,
      missile,
      options.celestialVisuals,
      options.scannerRange,
    ),
  );
  const visibleTorpedoes = torpedoContacts.filter((contact) => contact.visible);
  const lockedDisintegratorTargets = visibleTorpedoes.filter((contact) => {
    const lockState = options.torpedoLockStates.get(contact.missile.id);
    return (
      lockState !== undefined &&
      lockState.progress >= COMBAT_BALANCE.disintegrator.targetAcquireThreshold &&
      contact.distance <= options.disintegratorRange
    );
  });
  const lockedDefenseTargets = visibleDefenseContacts.filter((contact) => {
    const lockState = options.defenseLockStates.get(contact.visual.config.id);
    return (
      lockState !== undefined &&
      lockState.progress >= COMBAT_BALANCE.defenses.disintegratorLockThreshold &&
      contact.distance <= options.disintegratorRange
    );
  });
  const lockedDisruptorTargets = visibleDefenseContacts.filter((contact) => {
    const lockState = options.defenseLockStates.get(contact.visual.config.id);
    return (
      lockState !== undefined &&
      lockState.progress >= COMBAT_BALANCE.disruptor.targetAcquireThreshold &&
      contact.distance <= options.disruptorRange
    );
  });
  const eligibleDisintegratorTargets = [
    ...lockedDisintegratorTargets.map((contact) => ({
      kind: "torpedo" as const,
      id: contact.missile.id,
      position: contact.missile.detonationPosition ?? contact.missile.body.position,
      missile: contact.missile,
    })),
    ...lockedDefenseTargets.map((contact) => ({
      kind: "defense" as const,
      id: contact.visual.config.id,
      position: contact.visual.body.position,
      defense: contact.visual,
    })),
  ];
  const eligibleDisruptorTargets = lockedDisruptorTargets.map((contact) => ({
    kind: "defense" as const,
    id: contact.visual.config.id,
    position: contact.visual.body.position,
    defense: contact.visual,
  }));
  const activeWeaponTargets =
    options.weaponMode === "disintegrator"
      ? (options.weaponArmed ? eligibleDisintegratorTargets : [])
      : (options.weaponArmed ? eligibleDisruptorTargets : []);

  return {
    scannerContacts,
    visibleContacts,
    visibleDefenseContacts,
    visibleFuelStations,
    torpedoContacts,
    visibleTorpedoes,
    lockedDisintegratorTargets,
    lockedDefenseTargets,
    lockedDisruptorTargets,
    eligibleDisintegratorTargets,
    eligibleDisruptorTargets,
    activeWeaponTargets,
  };
}

function resolvePreStepLockedTorpedoDefense(options: {
  interceptorPosition: Vector2Like;
  scannerRange: number;
  disintegratorRange: number;
  deltaSeconds: number;
  pauseActive: boolean;
  isCrashed: boolean;
  shipSystems: ShipSystemsState;
  weaponMode: PlayerWeaponMode;
  weaponArmed: boolean;
  celestialVisuals: readonly CelestialVisual[];
  missileVisuals: readonly MissileVisual[];
  defenseLockStates: ReadonlyMap<string, DefenseLockState>;
  torpedoLockStates: Map<string, TorpedoLockState>;
  disintegratorEngagementStates: Map<string, DisintegratorEngagementState>;
}): number {
  if (
    options.weaponMode !== "disintegrator" ||
    !options.weaponArmed ||
    options.pauseActive ||
    options.isCrashed ||
    options.missileVisuals.length === 0
  ) {
    return 0;
  }

  const torpedoContacts = options.missileVisuals.map((missile) =>
    classifyTorpedoScannerContact(
      options.interceptorPosition,
      missile,
      options.celestialVisuals,
      options.scannerRange,
    ),
  );
  const registeredTorpedoes = torpedoContacts.filter((contact) => {
    const sourceDefenseLock =
      options.defenseLockStates.get(contact.missile.sourceId)?.progress ?? 0;
    return (
      contact.visible ||
      (contact.inRange &&
        sourceDefenseLock >= COMBAT_BALANCE.defenses.disintegratorLockThreshold) ||
      isRegisteredTorpedoContact(contact, options.torpedoLockStates)
    );
  });
  const lockedDisintegratorTargets = registeredTorpedoes.filter((contact) => {
    const lockState = options.torpedoLockStates.get(contact.missile.id);
    const sourceDefenseLock =
      options.defenseLockStates.get(contact.missile.sourceId)?.progress ?? 0;
    const effectiveLockProgress = Math.max(
      lockState?.progress ?? 0,
      sourceDefenseLock >= COMBAT_BALANCE.defenses.disintegratorLockThreshold
        ? COMBAT_BALANCE.torpedoes.inheritedSourceLockProgress
        : 0,
    );
    return (
      effectiveLockProgress >= COMBAT_BALANCE.disintegrator.targetAcquireThreshold &&
      contact.distance <= options.disintegratorRange
    );
  });
  const activeWeaponTargets = lockedDisintegratorTargets.map((contact) => ({
    kind: "torpedo" as const,
    id: contact.missile.id,
    position: contact.missile.detonationPosition ?? contact.missile.body.position,
    missile: contact.missile,
  }));

  updateDisintegratorEngagementStates(
    options.disintegratorEngagementStates,
    activeWeaponTargets,
    true,
    COMBAT_BALANCE.disintegrator.engageRampUpPerSecond,
    COMBAT_BALANCE.disintegrator.engageDecayPerSecond,
    options.deltaSeconds,
  );

  const preStepResult = resolveArmedDisintegrator({
    weaponArmed: options.weaponArmed,
    isPaused: options.pauseActive,
    isCrashed: options.isCrashed,
    deltaSeconds: options.deltaSeconds,
    shipSystems: options.shipSystems,
    activeTargets: activeWeaponTargets,
    disintegratorEngagementStates: options.disintegratorEngagementStates,
  });
  return preStepResult.neutralizedTorpedoCount;
}

function getPlayerWeaponLabel(mode: PlayerWeaponMode): string {
  return mode === "disintegrator" ? "Disintegrator Beam" : "Disruptor";
}

function getPlayerWeaponShortLabel(mode: PlayerWeaponMode): string {
  return mode === "disintegrator" ? "BEAM" : "DISR";
}

function getPlayerWeaponAccentColor(mode: PlayerWeaponMode): number {
  return mode === "disintegrator" ? 0xff7b72 : 0x8b9bff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function restartScenario(options: {
  simulation: OrbitalWorld;
  celestialConfigs: readonly CelestialConfig[];
  celestialStateEvaluator: CelestialStateEvaluator;
  interceptorBody: OrbitalBodyState;
  shipSystems: ReturnType<typeof createShipSystemsState>;
  shipSpawnState: ShipSpawnState;
  onResetElapsedSeconds: () => void;
  onResetCameraZoom: () => void;
  onResetThrottle: () => void;
  onClearPause: () => void;
  onClearMissiles: () => void;
}): void {
  options.onResetElapsedSeconds();
  options.onResetCameraZoom();
  options.onResetThrottle();
  options.onClearPause();
  options.onClearMissiles();
  focusSubsystem(options.shipSystems, "engines");
  options.shipSystems.engines.charge = options.shipSystems.engines.maxCharge;
  options.shipSystems.scanners.charge = options.shipSystems.scanners.maxCharge;
  options.shipSystems.weapons.charge = options.shipSystems.weapons.maxCharge;
  options.shipSystems.defenses.charge = options.shipSystems.defenses.maxCharge;

  applyCelestialState(
    options.simulation,
    options.celestialConfigs,
    0,
    options.celestialStateEvaluator,
  );

  options.interceptorBody.position = {
    x: options.shipSpawnState.position.x,
    y: options.shipSpawnState.position.y,
  };
  options.interceptorBody.velocity = {
    x: options.shipSpawnState.velocity.x,
    y: options.shipSpawnState.velocity.y,
  };
  options.interceptorBody.acceleration = { x: 0, y: 0 };
  options.interceptorBody.crashed = null;
  options.interceptorBody.systemId = options.shipSpawnState.systemId;

  if (options.interceptorBody.propulsion) {
    options.interceptorBody.propulsion.heading = options.shipSpawnState.heading;
    options.interceptorBody.propulsion.throttle = 0;
  }
}

function respawnInterceptor(options: {
  interceptorBody: OrbitalBodyState;
  shipSystems: ReturnType<typeof createShipSystemsState>;
  shipSpawnState: ShipSpawnState;
  onResetThrottle: () => void;
  onClearPause: () => void;
  onClearMissiles: () => void;
}): void {
  options.onResetThrottle();
  options.onClearPause();
  options.onClearMissiles();
  focusSubsystem(options.shipSystems, "engines");
  options.shipSystems.engines.charge = options.shipSystems.engines.maxCharge;
  options.shipSystems.scanners.charge = options.shipSystems.scanners.maxCharge;
  options.shipSystems.weapons.charge = options.shipSystems.weapons.maxCharge;
  options.shipSystems.defenses.charge = options.shipSystems.defenses.maxCharge;
  options.interceptorBody.position = {
    x: options.shipSpawnState.position.x,
    y: options.shipSpawnState.position.y,
  };
  options.interceptorBody.velocity = {
    x: options.shipSpawnState.velocity.x,
    y: options.shipSpawnState.velocity.y,
  };
  options.interceptorBody.acceleration = { x: 0, y: 0 };
  options.interceptorBody.crashed = null;
  options.interceptorBody.systemId = options.shipSpawnState.systemId;

  if (options.interceptorBody.propulsion) {
    options.interceptorBody.propulsion.heading = options.shipSpawnState.heading;
    options.interceptorBody.propulsion.throttle = 0;
  }
}

function createSystemRespawnState(options: {
  systemId: string;
  celestialConfigs: readonly CelestialConfig[];
  celestialVisuals: readonly CelestialVisual[];
  gravitationalConstant: number;
  anchorBodyId?: string | null;
  defaultOrbitRadius: number;
  orbitDirection: MapSpawnOrbitDirection;
}): ShipSpawnState {
  const rootConfig = getSystemSpawnRootConfig(
    options.celestialConfigs,
    options.systemId,
  );
  const spawnAnchorConfig = resolveSpawnAnchorConfig({
    celestialConfigs: options.celestialConfigs,
    systemId: options.systemId,
    fallbackRootConfig: rootConfig,
    anchorBodyId: options.anchorBodyId,
  });
  const spawnAnchorVisual = options.celestialVisuals.find(
    (visual) => visual.config.id === spawnAnchorConfig.id,
  );
  if (!spawnAnchorVisual) {
    throw new Error(`Missing spawn anchor visual for ${spawnAnchorConfig.id}`);
  }
  const spawnAnchorCollisionRadius =
    spawnAnchorConfig.collisionRadius ?? spawnAnchorConfig.radius;
  const orbitRadius = Math.max(
    options.defaultOrbitRadius,
    spawnAnchorCollisionRadius + 260,
  );
  const orbitalSpeed = Math.sqrt(
    (options.gravitationalConstant * spawnAnchorConfig.mass) / orbitRadius,
  );
  const velocityDirection = options.orbitDirection === "cw" ? 1 : -1;
  const heading =
    options.orbitDirection === "cw" ? Math.PI / 2 : Math.PI * 1.5;

  return {
    systemId: spawnAnchorConfig.systemId,
    position: {
      x: spawnAnchorVisual.body.position.x,
      y: spawnAnchorVisual.body.position.y - orbitRadius,
    },
    velocity: {
      x: spawnAnchorVisual.body.velocity.x + orbitalSpeed * velocityDirection,
      y: spawnAnchorVisual.body.velocity.y,
    },
    heading,
  };
}

function formatSubsystemLine(
  label: string,
  subsystem: { charge: number },
  multiplier: number,
): string {
  return `${label} charge ${(subsystem.charge * 100).toFixed(0)}% | bonus x${multiplier.toFixed(2)}`;
}

function approachValue(current: number, target: number, maxDelta: number): number {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }

  return Math.max(current - maxDelta, target);
}

function applyCelestialState(
  world: OrbitalWorld,
  configs: readonly CelestialConfig[],
  timeSeconds: number,
  celestialStateEvaluator: CelestialStateEvaluator,
): void {
  const state = celestialStateEvaluator.evaluate(timeSeconds);

  for (const config of configs) {
    const body = world.getBody(config.id);
    const pose = state.get(config.id);

    if (!body || !pose) {
      continue;
    }

    body.position = { x: pose.position.x, y: pose.position.y };
    body.velocity = { x: pose.velocity.x, y: pose.velocity.y };
    body.acceleration = { x: 0, y: 0 };
  }
}

function applyDefenseState(
  world: OrbitalWorld,
  defenseConfigs: readonly DefenseConfig[],
  _celestialConfigs: readonly CelestialConfig[],
  timeSeconds: number,
  celestialStateEvaluator: CelestialStateEvaluator,
): void {
  const celestialState = celestialStateEvaluator.evaluate(timeSeconds);
  const defenseState = evaluateDefenseState(defenseConfigs, celestialState, timeSeconds);

  for (const config of defenseConfigs) {
    const body = world.getBody(config.id);
    const pose = defenseState.get(config.id);

    if (!body || !pose) {
      continue;
    }

    body.position = { x: pose.position.x, y: pose.position.y };
    body.velocity = { x: pose.velocity.x, y: pose.velocity.y };
    body.acceleration = { x: 0, y: 0 };
  }
}

function evaluateDefenseState(
  configs: readonly DefenseConfig[],
  celestialState: Readonly<CelestialStateMap>,
  timeSeconds: number,
): Map<string, { position: Vector2Like; velocity: Vector2Like }> {
  const state = new Map<string, { position: Vector2Like; velocity: Vector2Like }>();

  for (const config of configs) {
    const parent = celestialState.get(config.parentId);

    if (!parent) {
      throw new Error(`Missing parent state for defense ${config.id}`);
    }

    if (config.anchorToParent === "dark-side") {
      const referenceBody = config.darkSideRelativeToId
        ? celestialState.get(config.darkSideRelativeToId)
        : null;

      if (!referenceBody) {
        throw new Error(`Missing dark-side reference for defense ${config.id}`);
      }

      const awayX = parent.position.x - referenceBody.position.x;
      const awayY = parent.position.y - referenceBody.position.y;
      const awayLength = Math.hypot(awayX, awayY) || 1;
      const normalX = awayX / awayLength;
      const normalY = awayY / awayLength;

      state.set(config.id, {
        position: {
          x: parent.position.x + normalX * config.orbitRadius,
          y: parent.position.y + normalY * config.orbitRadius,
        },
        velocity: {
          x: parent.velocity.x,
          y: parent.velocity.y,
        },
      });
      continue;
    }

    if (config.anchorToParent === "fixed") {
      const angle = config.initialAngle;
      const relativePosition = {
        x: Math.cos(angle) * config.orbitRadius,
        y: Math.sin(angle) * config.orbitRadius,
      };

      state.set(config.id, {
        position: {
          x: parent.position.x + relativePosition.x,
          y: parent.position.y + relativePosition.y,
        },
        velocity: {
          x: parent.velocity.x,
          y: parent.velocity.y,
        },
      });
      continue;
    }

    const angularSpeed =
      ((Math.PI * 2) / config.orbitPeriod) *
      (config.orbitDirection === "ccw" ? -1 : 1);
    const angle = config.initialAngle + angularSpeed * timeSeconds;
    const relativePosition = {
      x: Math.cos(angle) * config.orbitRadius,
      y: Math.sin(angle) * config.orbitRadius,
    };
    const tangentialSpeed = angularSpeed * config.orbitRadius;
    const relativeVelocity = {
      x: -Math.sin(angle) * tangentialSpeed,
      y: Math.cos(angle) * tangentialSpeed,
    };

    state.set(config.id, {
      position: {
        x: parent.position.x + relativePosition.x,
        y: parent.position.y + relativePosition.y,
      },
      velocity: {
        x: parent.velocity.x + relativeVelocity.x,
        y: parent.velocity.y + relativeVelocity.y,
      },
    });
  }

  return state;
}

function legacyUpdateLauncherMissiles(options: {
  simulation: OrbitalWorld;
  shipSystems: ReturnType<typeof createShipSystemsState>;
  celestialConfigs: readonly CelestialConfig[];
  defenseConfigs: readonly DefenseConfig[];
  celestialVisuals: readonly CelestialVisual[];
  defenseVisuals: readonly DefenseVisual[];
  defenseCooldowns: Map<string, number>;
  launcherStates: Map<string, LauncherState>;
  playerBeamState: { absorbed: number };
  playerShieldState: PlayerShieldState;
  missileVisuals: MissileVisual[];
  interceptorBody: OrbitalBodyState;
  targetForecast: TrajectoryForecast;
  world: Container;
  stepSeconds: number;
  elapsedSeconds: number;
  nextMissileIdRef: { value: number };
}): void {
  const postInterceptGraceSeconds = 2.0;
  let hostileBeamActive = false;
  const defenseById = new Map(
    options.defenseVisuals.map((defense) => [defense.config.id, defense] as const),
  );

  for (const missile of options.missileVisuals) {
    missile.lifetimeSeconds -= options.stepSeconds;

    if (missile.detonationElapsedSeconds !== null) {
      missile.detonationElapsedSeconds += options.stepSeconds;
      continue;
    }

    if (missile.body.crashed || !missile.body.propulsion) {
      continue;
    }

    const sourceDefense = defenseById.get(missile.sourceId);
    const interceptSolution = sourceDefense
      ? findInterceptFromForecast({
          forecast: options.targetForecast,
          startTimeSeconds: options.elapsedSeconds,
          sourcePosition: missile.body.position,
          interceptorSpeed: Math.hypot(
            missile.body.velocity.x,
            missile.body.velocity.y,
          ),
          interceptorAcceleration: getTorpedoAcceleration(sourceDefense.config),
          toleranceMultiplier: 1.18,
        })
      : null;
    if (interceptSolution?.confidence === "predicted") {
      missile.interceptSolution = interceptSolution;
      missile.lostTrackSeconds = 0;
    } else {
      missile.lostTrackSeconds += options.stepSeconds;
    }

    const plannedInterceptTime = missile.interceptSolution?.sampleTimeSeconds ?? null;
    if (
      plannedInterceptTime !== null &&
      options.elapsedSeconds > plannedInterceptTime + postInterceptGraceSeconds
    ) {
      legacyDetonateMissile(missile);
      continue;
    }

    const desiredHeading = Math.atan2(
      (missile.interceptSolution?.interceptPoint.y ?? options.interceptorBody.position.y) - missile.body.position.y,
      (missile.interceptSolution?.interceptPoint.x ?? options.interceptorBody.position.x) - missile.body.position.x,
    );
    missile.body.propulsion.heading = rotateTowardAngle(
      missile.body.propulsion.heading,
      desiredHeading,
      (sourceDefense?.config.torpedoTurnRate ?? 3.6) * options.stepSeconds,
    );
    missile.body.propulsion.throttle = 1;
  }

  for (const defense of options.defenseVisuals) {
    if (defense.destroyed) {
      const launcherState = options.launcherStates.get(defense.config.id);
      if (launcherState) {
        launcherState.lockProgress = 0;
        launcherState.hasDetection = false;
        launcherState.detectedOccluderId = null;
        launcherState.interceptSolution = null;
        launcherState.beamEngagement = 0;
        launcherState.firing = false;
      }
      continue;
    }

    if (defense.config.weaponType === "station") {
      const launcherState = options.launcherStates.get(defense.config.id);
      if (launcherState) {
        launcherState.lockProgress = 0;
        launcherState.hasDetection = false;
        launcherState.detectedOccluderId = null;
        launcherState.interceptSolution = null;
        launcherState.beamEngagement = 0;
        launcherState.firing = false;
      }
      continue;
    }

    const launcherState = options.launcherStates.get(defense.config.id);
    const currentCooldown = Math.max(
      0,
      (options.defenseCooldowns.get(defense.config.id) ?? 0) - options.stepSeconds,
    );
    options.defenseCooldowns.set(defense.config.id, currentCooldown);

    if (!launcherState) {
      continue;
    }

    if (defense.disabledUntilSeconds > options.elapsedSeconds) {
      launcherState.lockProgress = 0;
      launcherState.hasDetection = false;
      launcherState.detectedOccluderId = null;
      launcherState.interceptSolution = null;
      launcherState.beamEngagement = 0;
      launcherState.firing = false;
      continue;
    }

    if (options.interceptorBody.crashed) {
      launcherState.lockProgress = 0;
      launcherState.hasDetection = false;
      launcherState.detectedOccluderId = null;
      launcherState.interceptSolution = null;
      launcherState.beamEngagement = 0;
      launcherState.firing = false;
      continue;
    }

    const distanceToShip = distanceBetween(
      defense.body.position,
      options.interceptorBody.position,
    );
    const parentBody = options.celestialVisuals.find(
      (visual) => visual.config.id === defense.config.parentId,
    )?.body;
    const occluder = findOccludingBodyBetween(
      defense.body.position,
      options.interceptorBody.position,
      options.celestialVisuals,
    );
    const withinSensorArc = parentBody && defense.config.anchorToParent === "dark-side"
      ? isPointWithinDefenseSensorArc(
          defense.body.position,
          parentBody.position,
          parentBody.radius,
          options.interceptorBody.position,
          12,
      )
      : true;
    const hasDetection =
      distanceToShip <= defense.config.scannerRange &&
      occluder === null &&
      withinSensorArc;

    launcherState.hasDetection = hasDetection;
    launcherState.detectedOccluderId = occluder?.config.id ?? null;
    launcherState.firing = false;
    const lockSolution = hasDetection
      ? findInterceptFromForecast({
          forecast: options.targetForecast,
          startTimeSeconds: options.elapsedSeconds,
          sourcePosition: defense.body.position,
          interceptorSpeed: defense.config.torpedoSpeed,
          interceptorAcceleration: getTorpedoAcceleration(defense.config),
        }) ?? null
      : null;
    launcherState.interceptSolution =
      lockSolution?.confidence === "predicted" ? lockSolution : null;

    if (!hasDetection || currentCooldown > 0) {
      launcherState.lockProgress = Math.max(
        0,
        launcherState.lockProgress - options.stepSeconds * 1.6,
      );
      launcherState.beamEngagement = Math.max(
        0,
        launcherState.beamEngagement - options.stepSeconds * 2.6,
      );
      continue;
    }

    launcherState.lockProgress = Math.min(
      defense.config.lockOnSeconds,
      launcherState.lockProgress +
        options.stepSeconds * getDefenseEnemyLockMultiplier(options.shipSystems),
    );

    if (
      launcherState.lockProgress < defense.config.lockOnSeconds ||
      (defense.config.weaponType === "torpedo" && !launcherState.interceptSolution)
    ) {
      launcherState.beamEngagement = Math.max(
        0,
        launcherState.beamEngagement - options.stepSeconds * 2.6,
      );
      continue;
    }

    if (defense.config.weaponType === "beam") {
      if (distanceToShip > defense.config.beamRange) {
        launcherState.beamEngagement = Math.max(
          0,
          launcherState.beamEngagement - options.stepSeconds * 2.6,
        );
        continue;
      }

      hostileBeamActive = true;
      launcherState.firing = true;
      launcherState.beamEngagement = Math.min(
        1,
        launcherState.beamEngagement + options.stepSeconds * 2.2,
      );
      const incomingBeamDamage =
        defense.config.beamDamagePerSecond *
        launcherState.beamEngagement *
        options.stepSeconds;
      const shieldResult = absorbDefenseBeamDamage(
        options.shipSystems,
        incomingBeamDamage,
      );
      if (shieldResult.absorbedDamage > 0) {
        options.playerShieldState.flash = Math.min(
          1,
          options.playerShieldState.flash + shieldResult.absorbedDamage * 3.2,
        );
      }
      options.playerBeamState.absorbed += shieldResult.remainingDamage;

      if (options.playerBeamState.absorbed >= 1 && !options.interceptorBody.crashed) {
        options.interceptorBody.crashed = {
          otherBodyId: defense.config.id,
          relativeSpeed: 0,
        };
      }
      continue;
    }

    const interceptSolution = launcherState.interceptSolution;
    if (!interceptSolution) {
      continue;
    }
    const missileId = `${defense.config.id}:missile:${options.nextMissileIdRef.value}`;
    options.nextMissileIdRef.value += 1;
    const launchHeading = Math.atan2(
      interceptSolution.interceptPoint.y - defense.body.position.y,
      interceptSolution.interceptPoint.x - defense.body.position.x,
    );
    const launchDirection = {
      x: Math.cos(launchHeading),
      y: Math.sin(launchHeading),
    };
    const missileBody = options.simulation.addBody({
      id: missileId,
      mass: 0.18,
      radius: 8,
      collisionRadius: 16,
      systemId: defense.body.systemId,
      affectsGravity: false,
      receivesGravity: false,
      collisionExclusions: [
        defense.config.id,
        defense.config.parentId,
      ],
      position: {
        x: defense.body.position.x + launchDirection.x * (defense.config.radius + 18),
        y: defense.body.position.y + launchDirection.y * (defense.config.radius + 18),
      },
      velocity: {
        x: launchDirection.x * defense.config.torpedoSpeed,
        y: launchDirection.y * defense.config.torpedoSpeed,
      },
      propulsion: {
        heading: launchHeading,
        throttle: 1,
        maxThrust: defense.config.torpedoThrust,
      },
    });
    const sprite = new Graphics()
      .poly([0, -16, 8, 9, 0, 4, -8, 9])
      .fill(0xffb36b)
      .stroke({ color: 0xfff2d6, width: 2, alpha: 0.95 });
    options.world.addChild(sprite);
    options.missileVisuals.push({
      id: missileId,
      body: missileBody,
      sprite,
      sourceId: defense.config.id,
      lifetimeSeconds: 18,
      interceptSolution: { ...interceptSolution },
      detonationElapsedSeconds: null,
      neutralizedElapsedSeconds: null,
      detonationPosition: null,
      disintegratorEnergyAbsorbed: 0,
      lostTrackSeconds: 0,
      splashApplied: false,
    });
    options.defenseCooldowns.set(defense.config.id, defense.config.cooldownSeconds);
    launcherState.lockProgress = 0;
    launcherState.interceptSolution = null;
  }

  if (!hostileBeamActive) {
    options.playerBeamState.absorbed = Math.max(
      0,
      options.playerBeamState.absorbed - options.stepSeconds * 0.28,
    );
  }
}

function legacyCleanupMissiles(
  simulation: OrbitalWorld,
  missileVisuals: MissileVisual[],
  world: Container,
): void {
  for (let index = missileVisuals.length - 1; index >= 0; index -= 1) {
    const missile = missileVisuals[index];
    const expired = missile.lifetimeSeconds <= 0;
    const crashed = missile.body.crashed !== null;
    const detonated =
      missile.detonationElapsedSeconds !== null &&
      missile.detonationElapsedSeconds >= 0.45;

    if (crashed && missile.detonationElapsedSeconds === null) {
      missile.detonationElapsedSeconds = 0;
      missile.detonationPosition = {
        x: missile.body.position.x,
        y: missile.body.position.y,
      };
      missile.body.velocity = { x: 0, y: 0 };
      missile.body.acceleration = { x: 0, y: 0 };

      if (missile.body.propulsion) {
        missile.body.propulsion.throttle = 0;
      }
    }

    if (!expired && !detonated) {
      continue;
    }

    simulation.removeBody(missile.id);
    world.removeChild(missile.sprite);
    missile.sprite.destroy();
    missileVisuals.splice(index, 1);
  }
}

function legacyApplyCollisionEventsToShip(
  collisionEvents: readonly CollisionEvent[],
  missileVisuals: readonly MissileVisual[],
  interceptorBody: OrbitalBodyState,
  shipSystems: ReturnType<typeof createShipSystemsState>,
  playerShieldState: PlayerShieldState,
): void {
  const missileById = new Map(missileVisuals.map((missile) => [missile.id, missile] as const));

  for (const event of collisionEvents) {
    const missileId = event.aId === interceptorBody.id
      ? event.bId
      : event.bId === interceptorBody.id
        ? event.aId
        : null;

    if (!missileId) {
      continue;
    }

    const missile = missileById.get(missileId);

    if (!missile) {
      continue;
    }

    if (missile.detonationElapsedSeconds === null) {
      missile.detonationElapsedSeconds = 0;
      missile.detonationPosition = {
        x: event.impactPosition.x,
        y: event.impactPosition.y,
      };
      missile.body.velocity = { x: 0, y: 0 };
      missile.body.acceleration = { x: 0, y: 0 };

      if (missile.body.propulsion) {
        missile.body.propulsion.throttle = 0;
      }
    }

    if (interceptorBody.crashed) {
      continue;
    }

    if (absorbDefenseTorpedoImpact(shipSystems)) {
      playerShieldState.flash = 1;
      continue;
    }

    interceptorBody.crashed = {
      otherBodyId: missileId,
      relativeSpeed: event.relativeSpeed,
    };
    return;
  }
}

function legacyDetonateMissile(missile: MissileVisual): void {
  missile.detonationElapsedSeconds = 0;
  missile.detonationPosition = {
    x: missile.body.position.x,
    y: missile.body.position.y,
  };
  missile.body.velocity = { x: 0, y: 0 };
  missile.body.acceleration = { x: 0, y: 0 };

  if (missile.body.propulsion) {
    missile.body.propulsion.throttle = 0;
  }
}

function legacyDisableDefense(
  defense: DefenseCombatVisual,
  elapsedSeconds: number,
  durationSeconds: number,
): void {
  defense.disabledUntilSeconds = Math.max(
    defense.disabledUntilSeconds,
    elapsedSeconds + durationSeconds,
  );

  if (defense.disabledHoldPosition === null) {
    defense.disabledHoldPosition = {
      x: defense.body.position.x,
      y: defense.body.position.y,
    };
  }
}

function legacyIsCombatDefenseVisual(visual: DefenseVisual): boolean {
  return visual.config.weaponType !== "station";
}

function applyFuelStationRefuel(
  shipSystems: ReturnType<typeof createShipSystemsState>,
  shipPosition: Vector2Like,
  stations: readonly (CelestialVisual | DefenseVisual)[],
  deltaSeconds: number,
): boolean {
  let refueled = false;

  for (const station of stations) {
    const refuelRange = "weaponType" in station.config
      ? station.config.refuelRange
      : station.config.refuelRange;
    const refuelLaneRadius = "weaponType" in station.config
      ? undefined
      : station.config.refuelLaneRadius;
    const refuelLaneThickness = "weaponType" in station.config
      ? undefined
      : station.config.refuelLaneThickness;
    const refuelPerSecond = "weaponType" in station.config
      ? station.config.refuelPerSecond
      : station.config.refuelPerSecond;
    const destroyed = "destroyed" in station ? station.destroyed : false;

    if (
      destroyed ||
      (!(refuelRange && refuelRange > 0) && !(refuelLaneRadius && refuelLaneRadius > 0)) ||
      !refuelPerSecond
    ) {
      continue;
    }

    if (
      !isShipWithinRefuelSource(shipPosition, station.body.position, {
        refuelRange,
        refuelLaneRadius,
        refuelLaneThickness,
      })
    ) {
      continue;
    }

    refillEngineFuel(
      shipSystems,
      refuelPerSecond * deltaSeconds,
    );
    refueled = true;
  }

  return refueled;
}

function hasCelestialRefuelSource(config: CelestialConfig): boolean {
  const hasPointRange = (config.refuelRange ?? 0) > 0;
  const hasLane = (config.refuelLaneRadius ?? 0) > 0;
  return (hasPointRange || hasLane) && (config.refuelPerSecond ?? 0) > 0;
}

function isShipWithinRefuelSource(
  shipPosition: Vector2Like,
  sourcePosition: Vector2Like,
  source: {
    refuelRange?: number;
    refuelLaneRadius?: number;
    refuelLaneThickness?: number;
  },
): boolean {
  const distance = distanceBetween(shipPosition, sourcePosition);
  if ((source.refuelRange ?? 0) > 0 && distance <= (source.refuelRange ?? 0)) {
    return true;
  }

  const laneRadius = source.refuelLaneRadius ?? 0;
  if (laneRadius <= 0) {
    return false;
  }

  const laneThickness = Math.max(24, source.refuelLaneThickness ?? 160);
  return Math.abs(distance - laneRadius) <= laneThickness * 0.5;
}

function legacyUpdateDefenseShieldStates(
  defenseVisuals: readonly DefenseVisual[],
  elapsedSeconds: number,
  deltaSeconds: number,
): void {
  for (const defense of defenseVisuals) {
    if (defense.destroyed || defense.shieldMaxCharge <= 0) {
      continue;
    }

    if (defense.shieldDisruptedUntilSeconds > elapsedSeconds) {
      continue;
    }

    defense.shieldCharge = Math.min(
      defense.shieldMaxCharge,
      defense.shieldCharge + defense.shieldRechargePerSecond * deltaSeconds,
    );
  }
}

function legacyApplyDefenseStatusOverrides(
  defenseVisuals: readonly DefenseVisual[],
  launcherStates: ReadonlyMap<string, LauncherState>,
  elapsedSeconds: number,
): void {
  for (const defense of defenseVisuals) {
    const launcherState = launcherStates.get(defense.config.id);

    if (defense.destroyed) {
      defense.disabledHoldPosition = null;
      if (launcherState) {
        launcherState.firing = false;
        launcherState.hasDetection = false;
        launcherState.lockProgress = 0;
        launcherState.interceptSolution = null;
        launcherState.beamEngagement = 0;
      }
      continue;
    }

    if (defense.disabledUntilSeconds > elapsedSeconds && defense.disabledHoldPosition) {
      defense.body.position = {
        x: defense.disabledHoldPosition.x,
        y: defense.disabledHoldPosition.y,
      };
      defense.body.velocity = { x: 0, y: 0 };
      defense.body.acceleration = { x: 0, y: 0 };

      if (launcherState) {
        launcherState.firing = false;
        launcherState.hasDetection = false;
        launcherState.lockProgress = 0;
        launcherState.interceptSolution = null;
        launcherState.beamEngagement = 0;
      }
      continue;
    }

    defense.disabledHoldPosition = null;
  }
}
function getPredictionSubdivisionCount(
  target: OrbitalBodyState,
  bodies: readonly OrbitalBodyState[],
): number {
  let nearestRelevantDistance = Number.POSITIVE_INFINITY;
  let nearestRelevantRadius = 0;

  for (const body of bodies) {
    if (
      body.id === target.id ||
      body.systemId !== target.systemId ||
      !body.affectsGravity
    ) {
      continue;
    }

    const distance = distanceBetween(target.position, body.position);

    if (distance < nearestRelevantDistance) {
      nearestRelevantDistance = distance;
      nearestRelevantRadius = body.radius + target.radius;
    }
  }

  if (!Number.isFinite(nearestRelevantDistance)) {
    return 1;
  }

  for (const band of FORECAST_TUNING.subdivisionBands) {
    if (
      nearestRelevantDistance <=
      nearestRelevantRadius * band.distanceRadiusMultiplier
    ) {
      return band.subdivisions;
    }
  }

  return 1;
}

function detectHazard(
  target: OrbitalBodyState,
  bodies: readonly OrbitalBodyState[],
): ForecastHazard | null {
  for (const body of bodies) {
    if (body.id === target.id || body.systemId !== target.systemId) {
      continue;
    }

    const distance = distanceBetween(target.position, body.position);
    const impactRadius = target.radius + body.radius;
    const dangerRadius =
      impactRadius * FORECAST_TUNING.hazardDangerRadiusMultiplier;

    if (distance <= impactRadius) {
      return {
        bodyId: body.id,
        distance,
        kind: "impact",
      };
    }

    if (distance <= dangerRadius) {
      return {
        bodyId: body.id,
        distance,
        kind: "danger",
      };
    }
  }

  return null;
}

function findNearestBody(
  position: Vector2Like,
  visuals: readonly CelestialVisual[],
): { config: CelestialConfig; distance: number } {
  const visibleBodies = visuals.filter((visual) => !visual.config.hidden);
  let nearest = visibleBodies[0];
  let nearestDistance = distanceBetween(position, visibleBodies[0].body.position);

  for (let index = 1; index < visibleBodies.length; index += 1) {
    const distance = distanceBetween(position, visibleBodies[index].body.position);

    if (distance < nearestDistance) {
      nearest = visibleBodies[index];
      nearestDistance = distance;
    }
  }

  return {
    config: nearest.config,
    distance: nearestDistance,
  };
}

function findNearestDefense(
  position: Vector2Like,
  visuals: readonly DefenseVisual[],
): { config: DefenseConfig; distance: number } | null {
  if (visuals.length === 0) {
    return null;
  }

  let nearest = visuals[0];
  let nearestDistance = distanceBetween(position, visuals[0].body.position);

  for (let index = 1; index < visuals.length; index += 1) {
    const distance = distanceBetween(position, visuals[index].body.position);

    if (distance < nearestDistance) {
      nearest = visuals[index];
      nearestDistance = distance;
    }
  }

  return {
    config: nearest.config,
    distance: nearestDistance,
  };
}

function formatThrustLabel(thrustVector: { label: string }): string {
  return thrustVector.label;
}

function createGravityAlignedBoostThrustVector(
  active: boolean,
  netGravityAcceleration: Vector2Like,
  direction: "toward" | "away",
  label: string,
): {
  heading: number;
  throttle: number;
  label: string;
  useFullBoostOutput: boolean;
} | null {
  if (!active) {
    return null;
  }

  const gravityMagnitude = Math.hypot(
    netGravityAcceleration.x,
    netGravityAcceleration.y,
  );

  if (gravityMagnitude <= 0.000001) {
    return null;
  }

  const directionMultiplier = direction === "toward" ? 1 : -1;

  return {
    heading: Math.atan2(
      netGravityAcceleration.y * directionMultiplier,
      netGravityAcceleration.x * directionMultiplier,
    ),
    throttle: 1,
    label,
    useFullBoostOutput: true,
  };
}

function computeNetGravityAccelerationForBody(
  target: {
    id: string;
    position: Vector2Like;
    systemId: string;
    receivesGravity: boolean;
  },
  bodies: readonly {
    id: string;
    position: Vector2Like;
    systemId: string;
    affectsGravity: boolean;
    mass: number;
  }[],
  gravitationalConstant: number,
  softening: number,
): Vector2Like {
  if (!target.receivesGravity) {
    return { x: 0, y: 0 };
  }

  let x = 0;
  let y = 0;

  for (const source of bodies) {
    if (
      source.id === target.id ||
      source.systemId !== target.systemId ||
      !source.affectsGravity
    ) {
      continue;
    }

    const offsetX = source.position.x - target.position.x;
    const offsetY = source.position.y - target.position.y;
    const distanceSquared =
      offsetX * offsetX + offsetY * offsetY + softening * softening;
    const distance = Math.sqrt(distanceSquared);
    const accelerationMagnitude =
      (gravitationalConstant * source.mass) / distanceSquared;

    x += (offsetX / distance) * accelerationMagnitude;
    y += (offsetY / distance) * accelerationMagnitude;
  }

  return { x, y };
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getTorpedoAcceleration(defense: DefenseConfig): number {
  const torpedoMass = 0.18;
  return defense.torpedoThrust / torpedoMass;
}

function rotateTowardAngle(
  current: number,
  target: number,
  maxDelta: number,
): number {
  const delta = normalizeAngle(target - current);

  if (Math.abs(delta) <= maxDelta) {
    return target;
  }

  return current + Math.sign(delta) * maxDelta;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;

  while (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}

function getDefenseSensorHalfAngle(
  defensePosition: Vector2Like,
  parentPosition: Vector2Like,
  parentRadius: number,
  bonusDegrees: number,
): number {
  const distanceFromParent = distanceBetween(defensePosition, parentPosition);
  const clampedRatio = Math.max(
    -1,
    Math.min(1, parentRadius / Math.max(distanceFromParent, parentRadius)),
  );
  const tangentHalfAngle = Math.acos(clampedRatio);
  return tangentHalfAngle + (bonusDegrees * Math.PI) / 180;
}

function isPointWithinDefenseSensorArc(
  defensePosition: Vector2Like,
  parentPosition: Vector2Like,
  parentRadius: number,
  targetPosition: Vector2Like,
  bonusDegrees: number,
): boolean {
  const outwardHeading = Math.atan2(
    defensePosition.y - parentPosition.y,
    defensePosition.x - parentPosition.x,
  );
  const targetHeading = Math.atan2(
    targetPosition.y - defensePosition.y,
    targetPosition.x - defensePosition.x,
  );
  const halfAngle = getDefenseSensorHalfAngle(
    defensePosition,
    parentPosition,
    parentRadius,
    bonusDegrees,
  );
  return Math.abs(normalizeAngle(targetHeading - outwardHeading)) <= halfAngle;
}

function drawExplosion(
  graphics: Graphics,
  center: Vector2Like,
  elapsedSeconds: number,
): void {
  graphics.clear();

  if (elapsedSeconds <= 0) {
    return;
  }

  const normalized = Math.min(1, elapsedSeconds / 0.9);
  const outerRadius = 18 + normalized * 54;
  const innerRadius = 8 + normalized * 18;
  const alpha = 1 - normalized;

  graphics.circle(center.x, center.y, outerRadius);
  graphics.fill({
    color: WORLD_ENTITY_STYLES.explosions.ship.outerColor,
    alpha: alpha * WORLD_ENTITY_STYLES.explosions.ship.outerAlpha,
  });
  graphics.circle(center.x, center.y, innerRadius);
  graphics.fill({
    color: WORLD_ENTITY_STYLES.explosions.ship.innerColor,
    alpha: alpha * WORLD_ENTITY_STYLES.explosions.ship.innerAlpha,
  });

  for (let index = 0; index < 7; index += 1) {
    const angle = normalized * 6 + (index / 7) * Math.PI * 2;
    const shardDistance = 10 + normalized * 44;
    const shardX = center.x + Math.cos(angle) * shardDistance;
    const shardY = center.y + Math.sin(angle) * shardDistance;

    graphics.circle(shardX, shardY, Math.max(2, 5 - normalized * 3));
    graphics.fill({
      color: WORLD_ENTITY_STYLES.explosions.ship.shardColor,
      alpha: alpha * WORLD_ENTITY_STYLES.explosions.ship.shardAlpha,
    });
  }
}

function legacyUpdateDisintegratorEngagementStates(
  disintegratorEngagementStates: Map<string, DisintegratorEngagementState>,
  activeTargets: readonly DisintegratorTarget[],
  canEngage: boolean,
  engageRampUpPerSecond: number,
  engageDecayPerSecond: number,
  deltaSeconds: number,
): void {
  const activeIds = new Set(activeTargets.map((target) => target.id));

  for (const [targetId, state] of disintegratorEngagementStates.entries()) {
    if (canEngage && activeIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * engageDecayPerSecond,
    );

    if (state.progress === 0) {
      disintegratorEngagementStates.delete(targetId);
    }
  }

  if (!canEngage) {
    return;
  }

  for (const target of activeTargets) {
    const state = disintegratorEngagementStates.get(target.id) ?? {
      progress: 0,
    };
    state.progress = Math.min(
      1,
      state.progress + deltaSeconds * engageRampUpPerSecond,
    );
    disintegratorEngagementStates.set(target.id, state);
  }
}

function legacyResolveArmedDisintegrator(options: {
  weaponArmed: boolean;
  isPaused: boolean;
  isCrashed: boolean;
  deltaSeconds: number;
  shipSystems: ReturnType<typeof createShipSystemsState>;
  activeTargets: readonly DisintegratorTarget[];
  disintegratorEngagementStates: ReadonlyMap<string, DisintegratorEngagementState>;
}): { fired: boolean; targetCount: number; chargePerTarget: number } {
  if (
    !options.weaponArmed ||
    options.isPaused ||
    options.isCrashed ||
    options.activeTargets.length === 0 ||
    options.shipSystems.weapons.charge <= 0
  ) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
    };
  }

  const weightedTargets = options.activeTargets
    .map((target) => ({
      target,
      progress: options.disintegratorEngagementStates.get(target.id)?.progress ?? 0,
    }))
    .filter((entry) => entry.progress > COMBAT_BALANCE.disintegrator.engageStartThreshold);
  const totalProgress = weightedTargets.reduce((sum, entry) => sum + entry.progress, 0);

  if (weightedTargets.length === 0 || totalProgress <= 0) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
    };
  }

  const maxDischarge = Math.min(
    options.shipSystems.weapons.charge / getWeaponEnergyCostMultiplier(options.shipSystems),
    options.deltaSeconds *
      COMBAT_BALANCE.disintegrator.dischargePerSecond *
      Math.min(1, totalProgress / weightedTargets.length),
  );
  const chargePerTarget = maxDischarge / weightedTargets.length;

  options.shipSystems.weapons.charge = Math.max(
    0,
    options.shipSystems.weapons.charge -
      maxDischarge * getWeaponEnergyCostMultiplier(options.shipSystems),
  );

  for (const { target, progress } of weightedTargets) {
    const appliedEnergy =
      ((maxDischarge * progress) / totalProgress) *
      getWeaponDamageMultiplier(options.shipSystems);

    if (target.kind === "torpedo" && target.missile) {
      const missile = target.missile;

      if (missile.detonationElapsedSeconds !== null || missile.body.crashed) {
        continue;
      }

      missile.disintegratorEnergyAbsorbed += appliedEnergy;

      if (missile.disintegratorEnergyAbsorbed >= COMBAT_BALANCE.torpedoes.durability) {
        missile.detonationElapsedSeconds = 0;
        missile.detonationPosition = {
          x: missile.body.position.x,
          y: missile.body.position.y,
        };
        missile.body.velocity = { x: 0, y: 0 };
        missile.body.acceleration = { x: 0, y: 0 };

        if (missile.body.propulsion) {
          missile.body.propulsion.throttle = 0;
        }
      }
      continue;
    }

    if (target.kind === "defense" && target.defense && !target.defense.destroyed) {
      target.defense.disintegratorEnergyAbsorbed += appliedEnergy;

      if (target.defense.disintegratorEnergyAbsorbed >= COMBAT_BALANCE.defenses.durability) {
        target.defense.destroyed = true;
      }
    }
  }

  return {
    fired: true,
    targetCount: weightedTargets.length,
    chargePerTarget,
  };
}

function legacyResolveArmedDisruptor(options: {
  weaponArmed: boolean;
  isPaused: boolean;
  isCrashed: boolean;
  deltaSeconds: number;
  elapsedSeconds: number;
  shipSystems: ReturnType<typeof createShipSystemsState>;
  activeTargets: readonly DisintegratorTarget[];
  disintegratorEngagementStates: ReadonlyMap<string, DisintegratorEngagementState>;
}): { fired: boolean; targetCount: number; chargePerTarget: number } {
  if (
    !options.weaponArmed ||
    options.isPaused ||
    options.isCrashed ||
    options.activeTargets.length === 0 ||
    options.shipSystems.weapons.charge <= 0
  ) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
    };
  }

  const weightedTargets = options.activeTargets
    .map((target) => ({
      target,
      progress: options.disintegratorEngagementStates.get(target.id)?.progress ?? 0,
    }))
    .filter((entry) => entry.progress > COMBAT_BALANCE.disruptor.engageStartThreshold);
  const totalProgress = weightedTargets.reduce((sum, entry) => sum + entry.progress, 0);

  if (weightedTargets.length === 0 || totalProgress <= 0) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
    };
  }

  const maxDischarge = Math.min(
    options.shipSystems.weapons.charge / getWeaponEnergyCostMultiplier(options.shipSystems),
    options.deltaSeconds *
      COMBAT_BALANCE.disruptor.dischargePerSecond *
      Math.min(1, totalProgress / weightedTargets.length),
  );
  const chargePerTarget = maxDischarge / weightedTargets.length;

  options.shipSystems.weapons.charge = Math.max(
    0,
    options.shipSystems.weapons.charge -
      maxDischarge * getWeaponEnergyCostMultiplier(options.shipSystems),
  );

  for (const { target, progress } of weightedTargets) {
    if (target.kind !== "defense" || !target.defense || target.defense.destroyed) {
      continue;
    }

    const defense = target.defense;
    const appliedEnergy =
      ((maxDischarge * progress) / totalProgress) *
      getWeaponDamageMultiplier(options.shipSystems);

    if (defense.shieldCharge > 0) {
      const shieldDamage = appliedEnergy * COMBAT_BALANCE.disruptor.shieldDamageMultiplier;
      const absorbedShieldDamage = Math.min(defense.shieldCharge, shieldDamage);
      defense.shieldCharge = Math.max(0, defense.shieldCharge - absorbedShieldDamage);
      defense.shieldDisruptedUntilSeconds = Math.max(
        defense.shieldDisruptedUntilSeconds,
        options.elapsedSeconds + COMBAT_BALANCE.disruptor.shieldDisruptSeconds,
      );

      if (defense.shieldCharge > 0) {
        continue;
      }
    }

    legacyDisableDefense(
      defense,
      options.elapsedSeconds,
      COMBAT_BALANCE.disruptor.disableSeconds,
    );
  }

  return {
    fired: true,
    targetCount: weightedTargets.length,
    chargePerTarget,
  };
}

function legacyClassifyTorpedoScannerContact(
  origin: Vector2Like,
  missile: MissileVisual,
  bodies: readonly CelestialVisual[],
  scannerRange: number,
): TorpedoScannerContact {
  const position = missile.detonationPosition ?? missile.body.position;
  const distance = distanceBetween(origin, position);
  const inRange = distance <= scannerRange;
  const occludedBy = inRange
    ? findOccludingBodyBetween(origin, position, bodies, missile.id)
    : null;

  return {
    missile,
    distance,
    occludedBy,
    inRange,
    visible: inRange && occludedBy === null,
  };
}

function legacyUpdateTorpedoScannerLocks(
  torpedoLockStates: Map<string, TorpedoLockState>,
  visibleTorpedoes: readonly TorpedoScannerContact[],
  scannerCharge: number,
  scannerLockMultiplier: number,
  instantDefenseDisintegratorLocks: boolean,
  deltaSeconds: number,
): void {
  const visibleIds = new Set(visibleTorpedoes.map((contact) => contact.missile.id));

  for (const [targetId, state] of torpedoLockStates.entries()) {
    if (visibleIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * COMBAT_BALANCE.torpedoes.scannerLockDecayPerSecond,
    );

    if (state.progress === 0) {
      torpedoLockStates.delete(targetId);
    }
  }

  for (const contact of visibleTorpedoes) {
    const state = torpedoLockStates.get(contact.missile.id) ?? {
      progress: 0,
      solution: null,
    };
    state.progress = instantDefenseDisintegratorLocks
      ? 1
      : Math.min(
        1,
        state.progress +
          deltaSeconds *
            scannerLockMultiplier *
            (COMBAT_BALANCE.torpedoes.scannerLockBaseRate +
              scannerCharge * COMBAT_BALANCE.torpedoes.scannerLockChargeFactor),
      );
    state.solution = contact.missile.interceptSolution;
    torpedoLockStates.set(contact.missile.id, state);
  }
}

function legacyUpdateDefenseScannerLocks(
  defenseLockStates: Map<string, DefenseLockState>,
  visibleDefenseContacts: readonly ScannerContact[],
  scannerCharge: number,
  scannerLockMultiplier: number,
  deltaSeconds: number,
): void {
  const visibleIds = new Set(
    visibleDefenseContacts
      .filter((contact) => isDefenseVisual(contact.visual))
      .map((contact) => contact.visual.config.id),
  );

  for (const [targetId, state] of defenseLockStates.entries()) {
    if (visibleIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * COMBAT_BALANCE.defenses.scannerLockDecayPerSecond,
    );

    if (state.progress === 0) {
      defenseLockStates.delete(targetId);
    }
  }

  for (const contact of visibleDefenseContacts) {
    if (!isDefenseVisual(contact.visual)) {
      continue;
    }

    const state = defenseLockStates.get(contact.visual.config.id) ?? {
      progress: 0,
    };
    state.progress = Math.min(
        1,
      state.progress +
        deltaSeconds *
          scannerLockMultiplier *
          (COMBAT_BALANCE.defenses.scannerLockBaseRate +
            scannerCharge * COMBAT_BALANCE.defenses.scannerLockChargeFactor),
    );
    defenseLockStates.set(contact.visual.config.id, state);
  }
}

function legacyIsDefenseVisual(visual: ScannerTargetVisual): visual is DefenseVisual {
  return "scannerRange" in visual.config;
}

function updateMissileSprites(
  missileVisuals: readonly MissileVisual[],
  registeredMissileIds: ReadonlySet<string>,
): void {
  for (const missile of missileVisuals) {
    const registeredOnScanners = registeredMissileIds.has(missile.id);
    if (missile.neutralizedElapsedSeconds !== null) {
      missile.sprite.clear();
      drawNeutralizedMissile(
        missile.sprite,
        missile.body.position,
        missile.neutralizedElapsedSeconds,
      );
      missile.sprite.visible = true;
      continue;
    }

    if (
      missile.detonationElapsedSeconds !== null &&
      missile.detonationPosition !== null
    ) {
      missile.sprite.clear();
      drawMissileExplosion(
        missile.sprite,
        missile.detonationPosition,
        missile.detonationElapsedSeconds,
      );
      missile.sprite.visible = registeredOnScanners;
      continue;
    }

    missile.sprite.clear();
    const heading = Math.atan2(missile.body.velocity.y, missile.body.velocity.x);
    const trailLength = 26;
    const trailStart = { x: 0, y: 6 };
    const trailEnd = { x: 0, y: trailLength };
    missile.sprite.moveTo(trailStart.x, trailStart.y);
    missile.sprite.lineTo(trailEnd.x, trailEnd.y);
    missile.sprite.stroke({
      color: WORLD_ENTITY_STYLES.missile.trailOuterColor,
      width: WORLD_ENTITY_STYLES.missile.trailOuterWidth,
      alpha: WORLD_ENTITY_STYLES.missile.trailOuterAlpha,
      cap: "round",
    });
    missile.sprite.moveTo(trailStart.x, trailStart.y);
    missile.sprite.lineTo(trailEnd.x, trailEnd.y);
    missile.sprite.stroke({
      color: WORLD_ENTITY_STYLES.missile.trailInnerColor,
      width: WORLD_ENTITY_STYLES.missile.trailInnerWidth,
      alpha: WORLD_ENTITY_STYLES.missile.trailInnerAlpha,
      cap: "round",
    });
    missile.sprite
      .poly([0, -16, 8, 9, 0, 4, -8, 9])
      .fill(WORLD_ENTITY_STYLES.missile.bodyFillColor)
      .stroke({
        color: WORLD_ENTITY_STYLES.missile.bodyStrokeColor,
        width: WORLD_ENTITY_STYLES.missile.bodyStrokeWidth,
        alpha: WORLD_ENTITY_STYLES.missile.bodyStrokeAlpha,
      });
    missile.sprite.circle(0, -4, 5);
    missile.sprite.fill({
      color: WORLD_ENTITY_STYLES.missile.noseGlowColor,
      alpha: WORLD_ENTITY_STYLES.missile.noseGlowAlpha,
    });
    missile.sprite.position.set(missile.body.position.x, missile.body.position.y);
    missile.sprite.rotation = heading + Math.PI / 2;
    missile.sprite.alpha = missile.body.crashed ? WORLD_ENTITY_STYLES.missile.crashedAlpha : 1;
    missile.sprite.visible = registeredOnScanners;
  }
}

function drawNeutralizedMissile(
  graphics: Graphics,
  center: Vector2Like,
  elapsedSeconds: number,
): void {
  const normalized = Math.min(1, elapsedSeconds / 0.18);
  const alpha = 1 - normalized;
  const radius = 6 + normalized * 8;

  graphics.circle(center.x, center.y, radius);
  graphics.stroke({
    color: 0x9ef5ff,
    width: 1.8,
    alpha: alpha * 0.72,
  });
  graphics.moveTo(center.x - radius * 0.7, center.y - radius * 0.7);
  graphics.lineTo(center.x + radius * 0.7, center.y + radius * 0.7);
  graphics.moveTo(center.x - radius * 0.7, center.y + radius * 0.7);
  graphics.lineTo(center.x + radius * 0.7, center.y - radius * 0.7);
  graphics.stroke({
    color: 0xd7feff,
    width: 1.4,
    alpha: alpha * 0.82,
    cap: "round",
  });
}

function drawMissileExplosion(
  graphics: Graphics,
  center: Vector2Like,
  elapsedSeconds: number,
): void {
  const normalized = Math.min(1, elapsedSeconds / 0.45);
  const outerRadius = 6 + normalized * 18;
  const innerRadius = 3 + normalized * 7;
  const alpha = 1 - normalized;

  graphics.circle(center.x, center.y, outerRadius);
  graphics.fill({
    color: WORLD_ENTITY_STYLES.explosions.missile.outerColor,
    alpha: alpha * WORLD_ENTITY_STYLES.explosions.missile.outerAlpha,
  });
  graphics.circle(center.x, center.y, innerRadius);
  graphics.fill({
    color: WORLD_ENTITY_STYLES.explosions.missile.innerColor,
    alpha: alpha * WORLD_ENTITY_STYLES.explosions.missile.innerAlpha,
  });
}

function legacyClassifyScannerContact(
  origin: Vector2Like,
  target: ScannerTargetVisual,
  bodies: readonly CelestialVisual[],
  scannerRange: number,
): ScannerContact {
  const distance = distanceBetween(origin, target.body.position);
  const inRange = distance <= scannerRange;
  const occludedBy = inRange ? findOccludingBody(origin, target, bodies) : null;

  return {
    visual: target,
    distance,
    occludedBy,
    inRange,
    visible: inRange && occludedBy === null,
  };
}

function findOccludingBody(
  origin: Vector2Like,
  target: ScannerTargetVisual,
  bodies: readonly CelestialVisual[],
): CelestialVisual | null {
  return findOccludingBodyBetween(origin, target.body.position, bodies, target.body.id);
}

function findOccludingBodyBetween(
  start: Vector2Like,
  end: Vector2Like,
  bodies: readonly CelestialVisual[],
  ignoredBodyId?: string,
): CelestialVisual | null {
  for (const body of bodies) {
    if (body.config.id === ignoredBodyId) {
      continue;
    }

    if (
      segmentIntersectsCircle(
        start,
        end,
        body.body.position,
        body.body.radius * 1.05,
      )
    ) {
      return body;
    }
  }

  return null;
}

function segmentIntersectsCircle(
  start: Vector2Like,
  end: Vector2Like,
  center: Vector2Like,
  radius: number,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distanceBetween(start, center) <= radius;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((center.x - start.x) * dx + (center.y - start.y) * dy) / lengthSquared,
    ),
  );
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };

  return distanceBetween(closest, center) <= radius;
}

function createRenderedPathState(): RenderedPathState {
  return {
    points: [],
    sourcePositions: null,
    stablePointCount: 0,
    visibleStablePointCount: 0,
    pendingStablePointCount: 0,
    pendingStableFrames: 0,
    confidence: "high",
    pendingConfidence: null,
    pendingConfidenceFrames: 0,
  };
}

function updateRenderedPathState(
  current: RenderedPathState,
  next: readonly Vector2Like[],
  lerpFactor: number,
  spatialSmoothingFactor: number,
  lockedLeadingPoints: number,
  resampleSpacing: number,
  maxRenderPoints: number,
  stabilityPointDelta: number,
  stabilityOverlapSearchPoints: number,
  stabilityOverlapComparePoints: number,
  stabilityAlignmentSearchPoints: number,
  stabilityBacktrackPoints: number,
  stabilityViolationWindowPoints: number,
  stabilityViolationThreshold: number,
  stablePointDropPerFrame: number,
  stablePointGrowPerFrame: number,
  stablePointDropConfirmFrames: number,
): RenderedPathState {
  if (next.length === 0) {
    return createRenderedPathState();
  }

  const renderSource = resamplePathPoints(
    next,
    resampleSpacing,
    maxRenderPoints,
  );

  if (renderSource.length === 0) {
    return createRenderedPathState();
  }

  const overlapOffset = current.sourcePositions
    ? findBestPathOverlapOffset(
        current.sourcePositions,
        renderSource,
        lockedLeadingPoints,
        stabilityOverlapSearchPoints,
        stabilityOverlapComparePoints,
      )
    : 0;

  const stablePointCount = getStablePointCount(
    current.sourcePositions,
    renderSource,
    lockedLeadingPoints,
    stabilityPointDelta,
    stabilityOverlapSearchPoints,
    stabilityOverlapComparePoints,
    stabilityAlignmentSearchPoints,
    stabilityBacktrackPoints,
    stabilityViolationWindowPoints,
    stabilityViolationThreshold,
  );
  const stableDisplayState = smoothStablePointCount(
    current,
    stablePointCount,
    stablePointDropPerFrame,
    stablePointGrowPerFrame,
    stablePointDropConfirmFrames,
  );
  const rawConfidence = getRawRenderedPathConfidence({
    sourcePointCount: renderSource.length,
    stablePointCount,
    visibleStablePointCount: stableDisplayState.visibleStablePointCount,
  });
  const confidenceState = smoothForecastConfidence(current, rawConfidence);

  return {
    points: smoothRenderedPath(
      current.points,
      renderSource,
      lerpFactor,
      spatialSmoothingFactor,
      overlapOffset,
      lockedLeadingPoints,
    ),
    sourcePositions: renderSource,
    stablePointCount,
    visibleStablePointCount: stableDisplayState.visibleStablePointCount,
    pendingStablePointCount: stableDisplayState.pendingStablePointCount,
    pendingStableFrames: stableDisplayState.pendingStableFrames,
    confidence: confidenceState.confidence,
    pendingConfidence: confidenceState.pendingConfidence,
    pendingConfidenceFrames: confidenceState.pendingConfidenceFrames,
  };
}

function smoothStablePointCount(
  current: RenderedPathState,
  next: number,
  maxDropPerFrame: number,
  maxGrowPerFrame: number,
  confirmFrames: number,
): Pick<
  RenderedPathState,
  "visibleStablePointCount" | "pendingStablePointCount" | "pendingStableFrames"
> {
  if (current.visibleStablePointCount <= 0) {
    return {
      visibleStablePointCount: next,
      pendingStablePointCount: 0,
      pendingStableFrames: 0,
    };
  }

  if (next >= current.visibleStablePointCount) {
    return {
      visibleStablePointCount: Math.min(
        next,
        current.visibleStablePointCount + Math.max(1, maxGrowPerFrame),
      ),
      pendingStablePointCount: 0,
      pendingStableFrames: 0,
    };
  }

  const pendingStablePointCount = current.pendingStablePointCount > 0
    ? Math.min(current.pendingStablePointCount, next)
    : next;
  const pendingStableFrames = current.pendingStableFrames + 1;

  if (pendingStableFrames < Math.max(1, confirmFrames)) {
    return {
      visibleStablePointCount: current.visibleStablePointCount,
      pendingStablePointCount,
      pendingStableFrames,
    };
  }

  return {
    visibleStablePointCount: Math.max(
      pendingStablePointCount,
      current.visibleStablePointCount - Math.max(1, maxDropPerFrame),
    ),
    pendingStablePointCount,
    pendingStableFrames,
  };
}

function smoothRenderedPath(
  previous: readonly Vector2Like[],
  next: readonly Vector2Like[],
  lerpFactor: number,
  spatialSmoothingFactor: number,
  overlapOffset: number,
  lockedLeadingPoints: number,
): Vector2Like[] {
  if (next.length === 0) {
    return [];
  }

  const smoothed: Vector2Like[] = [];

  for (let index = 0; index < next.length; index += 1) {
    const target = next[index];
    if (index < lockedLeadingPoints) {
      smoothed.push({
        x: target.x,
        y: target.y,
      });
      continue;
    }
    const prior = previous[index + overlapOffset] ?? previous[index] ?? target;
    smoothed.push({
      x: prior.x + (target.x - prior.x) * lerpFactor,
      y: prior.y + (target.y - prior.y) * lerpFactor,
    });
  }

  return smoothRenderedPathShape(
    smoothed,
    lockedLeadingPoints,
    spatialSmoothingFactor,
  );
}

function smoothRenderedPathShape(
  points: readonly Vector2Like[],
  lockedLeadingPoints: number,
  smoothingFactor: number,
): Vector2Like[] {
  if (points.length < 3 || smoothingFactor <= 0) {
    return [...points];
  }

  const smoothed = points.map((point) => ({ x: point.x, y: point.y }));
  for (
    let index = Math.max(lockedLeadingPoints, 1);
    index < points.length - 1;
    index += 1
  ) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const midpoint = {
      x: (previous.x + next.x) * 0.5,
      y: (previous.y + next.y) * 0.5,
    };
    smoothed[index] = {
      x: current.x + (midpoint.x - current.x) * smoothingFactor,
      y: current.y + (midpoint.y - current.y) * smoothingFactor,
    };
  }

  return smoothed;
}

function prepareRenderedPath(
  positions: readonly Vector2Like[],
  stablePointCount: number,
  shipPosition: Vector2Like,
  headingRadians: number,
  leadingSkipDistance: number,
  trailingTrimFraction: number,
  trailingTrimMinimumPoints: number,
): Vector2Like[] {
  if (positions.length === 0) {
    return [...positions];
  }

  const stabilityTrimmed = positions.slice(
    0,
    clamp(stablePointCount || positions.length, 0, positions.length),
  );

  if (stabilityTrimmed.length === 0) {
    return [];
  }

  const headingVector = {
    x: Math.cos(headingRadians),
    y: Math.sin(headingRadians),
  };
  let leadingIndex = 0;
  while (leadingIndex < stabilityTrimmed.length - 1) {
    const point = stabilityTrimmed[leadingIndex];
    const offsetX = point.x - shipPosition.x;
    const offsetY = point.y - shipPosition.y;
    const forwardDistance = offsetX * headingVector.x + offsetY * headingVector.y;
    const absoluteDistance = Math.hypot(offsetX, offsetY);

    if (
      forwardDistance >= leadingSkipDistance * 0.35 &&
      absoluteDistance >= leadingSkipDistance
    ) {
      break;
    }

    leadingIndex += 1;
  }

  const trimmedLeading = stabilityTrimmed.slice(leadingIndex);
  if (trimmedLeading.length <= 2) {
    return trimmedLeading;
  }

  const trailingTrimPoints = Math.max(
    trailingTrimMinimumPoints,
    Math.floor(trimmedLeading.length * trailingTrimFraction),
  );
  const keptLength = Math.max(2, trimmedLeading.length - trailingTrimPoints);
  return trimmedLeading.slice(0, keptLength);
}

function shouldUseInstantaneousGuidance(
  states: readonly RenderedPathState[],
  minimumSourcePoints: number,
  unstablePointSlack: number,
  stableRatioThreshold: number,
): boolean {
  return states.some((state) =>
    isRenderedPathUnstable(
      state,
      minimumSourcePoints,
      unstablePointSlack,
      stableRatioThreshold,
    ),
  );
}

function isRenderedPathUnstable(
  state: RenderedPathState,
  minimumSourcePoints: number,
  unstablePointSlack: number,
  stableRatioThreshold: number,
): boolean {
  if (!state.sourcePositions || state.sourcePositions.length < minimumSourcePoints) {
    return false;
  }

  const stableRatio = state.stablePointCount / Math.max(1, state.sourcePositions.length);
  return (
    state.stablePointCount <= state.sourcePositions.length - unstablePointSlack &&
    stableRatio < stableRatioThreshold
  );
}

function resamplePathPoints(
  points: readonly Vector2Like[],
  spacing: number,
  maxPoints: number,
): Vector2Like[] {
  if (points.length === 0 || maxPoints <= 0) {
    return [];
  }

  if (points.length === 1) {
    return [{ x: points[0].x, y: points[0].y }];
  }

  const effectiveSpacing = Math.max(1, spacing);
  const resampled: Vector2Like[] = [{ x: points[0].x, y: points[0].y }];
  let distanceSinceLastSample = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const segmentLength = Math.hypot(deltaX, deltaY);

    if (segmentLength <= 0.0001) {
      continue;
    }

    let traversed = 0;
    while (
      distanceSinceLastSample + (segmentLength - traversed) >= effectiveSpacing &&
      resampled.length < Math.max(2, maxPoints - 1)
    ) {
      const distanceNeeded = effectiveSpacing - distanceSinceLastSample;
      traversed += distanceNeeded;
      const ratio = traversed / segmentLength;
      resampled.push({
        x: start.x + deltaX * ratio,
        y: start.y + deltaY * ratio,
      });
      distanceSinceLastSample = 0;
    }

    distanceSinceLastSample += segmentLength - traversed;
  }

  const lastPoint = points[points.length - 1];
  const previousPoint = resampled[resampled.length - 1];
  if (
    previousPoint.x !== lastPoint.x ||
    previousPoint.y !== lastPoint.y
  ) {
    if (resampled.length >= maxPoints) {
      resampled[resampled.length - 1] = {
        x: lastPoint.x,
        y: lastPoint.y,
      };
    } else {
      resampled.push({
        x: lastPoint.x,
        y: lastPoint.y,
      });
    }
  }

  return resampled;
}

function getStablePointCount(
  previousSource: readonly Vector2Like[] | null,
  nextSource: readonly Vector2Like[],
  lockedLeadingPoints: number,
  stabilityPointDelta: number,
  stabilityOverlapSearchPoints: number,
  stabilityOverlapComparePoints: number,
  stabilityAlignmentSearchPoints: number,
  stabilityBacktrackPoints: number,
  stabilityViolationWindowPoints: number,
  stabilityViolationThreshold: number,
): number {
  if (!previousSource || previousSource.length === 0) {
    return nextSource.length;
  }

  const overlapOffset = findBestPathOverlapOffset(
    previousSource,
    nextSource,
    lockedLeadingPoints,
    stabilityOverlapSearchPoints,
    stabilityOverlapComparePoints,
  );
  const sharedLength = Math.min(
    nextSource.length,
    Math.max(0, previousSource.length - overlapOffset),
  );
  for (let index = lockedLeadingPoints; index < sharedLength; index += 1) {
    if (
      getAlignedPathPointDistance(
        previousSource,
        nextSource,
        index + overlapOffset,
        index,
        stabilityAlignmentSearchPoints,
      ) <= stabilityPointDelta
    ) {
      continue;
    }

    const violationCount = countStabilityViolationsInWindow(
      previousSource,
      nextSource,
      overlapOffset,
      index,
      sharedLength,
      stabilityPointDelta,
      stabilityAlignmentSearchPoints,
      stabilityViolationWindowPoints,
    );

    if (violationCount < stabilityViolationThreshold) {
      continue;
    }

    return Math.max(
      2,
      index - stabilityBacktrackPoints,
    );
  }

  return nextSource.length;
}

function countStabilityViolationsInWindow(
  previousSource: readonly Vector2Like[],
  nextSource: readonly Vector2Like[],
  overlapOffset: number,
  startIndex: number,
  sharedLength: number,
  stabilityPointDelta: number,
  alignmentSearchPoints: number,
  windowPoints: number,
): number {
  let violations = 0;
  const endIndex = Math.min(
    sharedLength,
    startIndex + Math.max(1, windowPoints),
  );

  for (let index = startIndex; index < endIndex; index += 1) {
    if (
      getAlignedPathPointDistance(
        previousSource,
        nextSource,
        index + overlapOffset,
        index,
        alignmentSearchPoints,
      ) > stabilityPointDelta
    ) {
      violations += 1;
    }
  }

  return violations;
}

function getAlignedPathPointDistance(
  previousSource: readonly Vector2Like[],
  nextSource: readonly Vector2Like[],
  previousIndex: number,
  nextIndex: number,
  alignmentSearchPoints: number,
): number {
  const nextPoint = nextSource[nextIndex];
  let bestDistance = Number.POSITIVE_INFINITY;
  const searchRadius = Math.max(0, alignmentSearchPoints);
  const startIndex = Math.max(0, previousIndex - searchRadius);
  const endIndex = Math.min(previousSource.length - 1, previousIndex + searchRadius);

  for (let candidateIndex = startIndex; candidateIndex <= endIndex; candidateIndex += 1) {
    bestDistance = Math.min(
      bestDistance,
      distanceBetween(previousSource[candidateIndex], nextPoint),
    );
  }

  return bestDistance;
}

function findBestPathOverlapOffset(
  previousSource: readonly Vector2Like[],
  nextSource: readonly Vector2Like[],
  lockedLeadingPoints: number,
  maxOffset: number,
  comparePoints: number,
): number {
  let bestOffset = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  const maxSearchOffset = Math.max(0, maxOffset);

  for (let offset = 0; offset <= maxSearchOffset; offset += 1) {
    const availablePoints = Math.min(
      Math.max(0, previousSource.length - (lockedLeadingPoints + offset)),
      Math.max(0, nextSource.length - lockedLeadingPoints),
      Math.max(1, comparePoints),
    );

    if (availablePoints <= 0) {
      continue;
    }

    let totalDistance = 0;
    for (let index = 0; index < availablePoints; index += 1) {
      totalDistance += distanceBetween(
        previousSource[lockedLeadingPoints + offset + index],
        nextSource[lockedLeadingPoints + index],
      );
    }

    const averageDistance = totalDistance / availablePoints;
    if (averageDistance < bestScore) {
      bestScore = averageDistance;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

function getForecastOrigin(
  position: Vector2Like,
  headingRadians: number,
  offsetDistance: number,
): Vector2Like {
  return {
    x: position.x + Math.cos(headingRadians) * offsetDistance,
    y: position.y + Math.sin(headingRadians) * offsetDistance,
  };
}

function createPathRenderer(parent: Container): PathRenderer {
  const container = new Container();
  parent.addChild(container);

  const endpoint = new Graphics();
  container.addChild(endpoint);

  return {
    container,
    segments: [],
    endpoint,
  };
}

function clearPathRenderer(renderer: PathRenderer): void {
  renderer.container.visible = false;
  renderer.endpoint.clear();
  for (const segment of renderer.segments) {
    segment.visible = false;
  }
}

function getRenderedPathConfidence(
  state: RenderedPathState,
): ForecastConfidenceLevel {
  return state.confidence;
}

function getRawRenderedPathConfidence(options: {
  sourcePointCount: number;
  stablePointCount: number;
  visibleStablePointCount: number;
}): ForecastConfidenceLevel {
  if (options.sourcePointCount < 8) {
    return "high";
  }

  const sourcePointCount = Math.max(1, options.sourcePointCount);
  const visibleStableRatio =
    options.visibleStablePointCount / sourcePointCount;
  const rawStableRatio = options.stablePointCount / sourcePointCount;
  const trustRatio = Math.min(visibleStableRatio, rawStableRatio);

  if (trustRatio >= 0.76) {
    return "high";
  }

  if (trustRatio >= 0.54) {
    return "medium";
  }

  if (trustRatio >= 0.22) {
    return "low";
  }

  return "unstable";
}

function smoothForecastConfidence(
  current: RenderedPathState,
  next: ForecastConfidenceLevel,
): Pick<
  RenderedPathState,
  "confidence" | "pendingConfidence" | "pendingConfidenceFrames"
> {
  const currentRank = getForecastConfidenceRank(current.confidence);
  const nextRank = getForecastConfidenceRank(next);

  if (nextRank <= currentRank) {
    return {
      confidence: next,
      pendingConfidence: null,
      pendingConfidenceFrames: 0,
    };
  }

  const pendingConfidence = current.pendingConfidence === next
    ? current.pendingConfidence
    : next;
  const pendingConfidenceFrames = current.pendingConfidence === next
    ? current.pendingConfidenceFrames + 1
    : 1;
  const confirmFrames = getForecastConfidenceConfirmFrames(next);

  if (pendingConfidenceFrames < confirmFrames) {
    return {
      confidence: current.confidence,
      pendingConfidence,
      pendingConfidenceFrames,
    };
  }

  return {
    confidence: next,
    pendingConfidence: null,
    pendingConfidenceFrames: 0,
  };
}

function getForecastConfidenceRank(level: ForecastConfidenceLevel): number {
  switch (level) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    case "unstable":
      return 3;
  }
}

function getForecastConfidenceConfirmFrames(
  level: ForecastConfidenceLevel,
): number {
  switch (level) {
    case "high":
    case "medium":
      return 1;
    case "low":
      return 2;
    case "unstable":
      return 4;
  }
}

function findStrongestEnemyLockThreat(
  defenseVisuals: readonly DefenseVisual[],
  launcherStates: ReadonlyMap<string, LauncherState>,
): { id: string; name: string; lockFraction: number } | null {
  let strongestThreat: { id: string; name: string; lockFraction: number } | null = null;

  for (const defense of defenseVisuals) {
    if (defense.destroyed || !isCombatDefenseVisual(defense)) {
      continue;
    }

    const launcherState = launcherStates.get(defense.config.id);

    if (!launcherState || launcherState.lockProgress <= 0) {
      continue;
    }

    const lockFraction = defense.config.lockOnSeconds > 0
      ? Math.min(1, launcherState.lockProgress / defense.config.lockOnSeconds)
      : 0;

    if (lockFraction <= 0) {
      continue;
    }

    if (!strongestThreat || lockFraction > strongestThreat.lockFraction) {
      strongestThreat = {
        id: defense.config.id,
        name: defense.config.name,
        lockFraction,
      };
    }
  }

  return strongestThreat;
}

function getRegisteredHostileDefenseIds(
  visibleDefenseContacts: ReadonlyArray<ScannerContact & { visual: DefenseVisual }>,
  defenseLockStates: ReadonlyMap<string, DefenseLockState>,
): Set<string> {
  const registeredIds = new Set<string>();

  for (const contact of visibleDefenseContacts) {
    registeredIds.add(contact.visual.config.id);
  }

  for (const [defenseId, lockState] of defenseLockStates.entries()) {
    if (lockState.progress > 0) {
      registeredIds.add(defenseId);
    }
  }

  return registeredIds;
}

function isRegisteredTorpedoContact(
  contact: TorpedoScannerContact,
  torpedoLockStates: ReadonlyMap<string, TorpedoLockState>,
): boolean {
  const lockState = torpedoLockStates.get(contact.missile.id);
  return contact.visible || (lockState?.progress ?? 0) > 0;
}

function buildLikelyEnemyMarkers(options: {
  defenseVisuals: readonly DefenseVisual[];
  registeredHostileDefenseIds: ReadonlySet<string>;
  launcherStates: ReadonlyMap<string, LauncherState>;
  missileVisuals: readonly MissileVisual[];
}): LikelyEnemyMarker[] {
  const activeMissileSourceIds = new Set(
    options.missileVisuals.map((missile) => missile.sourceId),
  );

  return options.defenseVisuals.flatMap((defense) => {
    if (
      defense.destroyed ||
      !isCombatDefenseVisual(defense) ||
      options.registeredHostileDefenseIds.has(defense.config.id)
    ) {
      return [];
    }

    const launcherState = options.launcherStates.get(defense.config.id);
    const hasThreatSignal =
      (launcherState?.lockProgress ?? 0) > 0 ||
      launcherState?.firing === true ||
      activeMissileSourceIds.has(defense.config.id);

    if (!hasThreatSignal) {
      return [];
    }

    return [{
      id: `likely-enemy:${defense.config.id}`,
      label: "Likely Enemy Nearby",
      systemId: defense.body.systemId,
      position: {
        x: defense.body.position.x,
        y: defense.body.position.y,
      },
      radius: Math.max(18, defense.body.radius + 12),
      linkedDefenseId: defense.config.id,
      enemyClass: getDefenseEnemyOverlayClass(defense.config),
    }];
  });
}

function getDefenseEnemyOverlayClass(
  config: DefenseConfig,
): LikelyEnemyMarker["enemyClass"] {
  if (config.weaponType === "beam") {
    return "raider";
  }
  if (config.weaponType === "station") {
    return "supportStation";
  }
  if (config.weaponType === "target") {
    return "trainingTarget";
  }
  if (
    config.anchorToParent === "dark-side" ||
    config.anchorToParent === "fixed"
  ) {
    return "surfaceLauncher";
  }
  return "orbitalLauncher";
}

function resolveForecastVisibilityState(options: {
  coastPath: readonly Vector2Like[];
  burnPath: readonly Vector2Like[];
  boostPath: readonly Vector2Like[];
  forecastOrigin: Vector2Like;
  minimumNavigationLength: number;
  burnPreviewActive: boolean;
}): ForecastVisibilityState {
  const coastPath = shouldDisplayForecastPath(
    options.coastPath,
    options.forecastOrigin,
    options.minimumNavigationLength,
  )
    ? [...options.coastPath]
    : [];
  const burnPath = shouldDisplayForecastPath(
    options.burnPath,
    options.forecastOrigin,
    options.minimumNavigationLength,
  )
    ? [...options.burnPath]
    : [];
  const boostPath = shouldDisplayForecastPath(
    options.boostPath,
    options.forecastOrigin,
    options.minimumNavigationLength,
  )
    ? [...options.boostPath]
    : [];
  const relevantVisiblePaths = options.burnPreviewActive
    ? [coastPath, burnPath, boostPath]
    : [coastPath];

  return {
    coastPath,
    burnPath,
    boostPath,
    navigationWarning: relevantVisiblePaths.every((path) => path.length === 0)
      ? "NAV SOLUTION UNSTABLE. Guidance horizon is too short for reliable navigation."
      : null,
  };
}

function shouldDisplayForecastPath(
  positions: readonly Vector2Like[],
  origin: Vector2Like,
  minimumLength: number,
): boolean {
  if (positions.length === 0) {
    return false;
  }

  return getPathLength([origin, ...positions]) >= minimumLength;
}

function getPathLength(points: readonly Vector2Like[]): number {
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalLength += distanceBetween(points[index - 1], points[index]);
  }

  return totalLength;
}

function drawStyledPath(
  renderer: PathRenderer,
  positions: readonly { x: number; y: number }[],
  style: {
    color: number;
    width: number;
    alpha: number;
    markerRadius: number;
    dashLength?: number;
    gapLength?: number;
  },
  origin?: Vector2Like,
  confidence: ForecastConfidenceLevel = "high",
): void {
  const styledPath = applyForecastConfidenceStyle(style, confidence);
  const pathPoints = origin
    ? [origin, ...positions]
    : [...positions];

  if (pathPoints.length < 2) {
    clearPathRenderer(renderer);
    return;
  }

  const segments = (!styledPath.dashLength || !styledPath.gapLength)
    ? buildSolidPathSegments(pathPoints)
    : buildDashedPathSegments(
        pathPoints,
        styledPath.dashLength,
        styledPath.gapLength,
      );

  if (segments.length === 0) {
    clearPathRenderer(renderer);
    return;
  }

  renderer.container.visible = true;
  updatePathRendererSegments(renderer, segments, styledPath);
  drawPathDecorations(
    renderer.endpoint,
    pathPoints,
    {
      color: styledPath.color,
      alpha: Math.min(1, styledPath.alpha + 0.18),
      radius: styledPath.markerRadius,
      width: styledPath.width,
    },
    !styledPath.dashLength || !styledPath.gapLength,
  );
}

function applyForecastConfidenceStyle(
  style: {
    color: number;
    width: number;
    alpha: number;
    markerRadius: number;
    dashLength?: number;
    gapLength?: number;
  },
  confidence: ForecastConfidenceLevel,
): {
  color: number;
  width: number;
  alpha: number;
  markerRadius: number;
  dashLength?: number;
  gapLength?: number;
} {
  const modifiers = WORLD_OVERLAY_STYLES.forecast.confidence[confidence];
  return {
    color: style.color,
    width: style.width * modifiers.widthScale,
    alpha: style.alpha * modifiers.alphaScale,
    markerRadius: style.markerRadius * modifiers.markerRadiusScale,
    dashLength: ("dashLength" in modifiers ? modifiers.dashLength : undefined) ??
      style.dashLength,
    gapLength: ("gapLength" in modifiers ? modifiers.gapLength : undefined) ??
      style.gapLength,
  };
}

function buildSolidPathSegments(
  points: readonly Vector2Like[],
) : PathSegmentInstruction[] {
  const segments: PathSegmentInstruction[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (distanceBetween(start, end) <= 0.0001) {
      continue;
    }

    segments.push({ start, end });
  }

  return segments;
}

function buildDashedPathSegments(
  points: readonly Vector2Like[],
  dashLength: number,
  gapLength: number,
): PathSegmentInstruction[] {
  const segments: PathSegmentInstruction[] = [];
  let drawDash = true;
  let remainingPatternLength = dashLength;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const segmentLength = Math.hypot(deltaX, deltaY);

    if (segmentLength <= 0.0001) {
      continue;
    }

    let traversed = 0;
    while (traversed < segmentLength) {
      const chunkLength = Math.min(
        remainingPatternLength,
        segmentLength - traversed,
      );
      const chunkStartRatio = traversed / segmentLength;
      const chunkEndRatio = (traversed + chunkLength) / segmentLength;
      const chunkStart = {
        x: start.x + deltaX * chunkStartRatio,
        y: start.y + deltaY * chunkStartRatio,
      };
      const chunkEnd = {
        x: start.x + deltaX * chunkEndRatio,
        y: start.y + deltaY * chunkEndRatio,
      };

      if (drawDash) {
        segments.push({
          start: chunkStart,
          end: chunkEnd,
        });
      }

      traversed += chunkLength;
      remainingPatternLength -= chunkLength;

      if (remainingPatternLength <= 0.0001) {
        drawDash = !drawDash;
        remainingPatternLength = drawDash ? dashLength : gapLength;
      }
    }
  }

  return segments;
}

function updatePathRendererSegments(
  renderer: PathRenderer,
  segments: readonly PathSegmentInstruction[],
  style: {
    color: number;
    width: number;
    alpha: number;
  },
): void {
  for (let index = 0; index < segments.length; index += 1) {
    const sprite = getPathRendererSegment(renderer, index);
    const segment = segments[index];
    const deltaX = segment.end.x - segment.start.x;
    const deltaY = segment.end.y - segment.start.y;
    const segmentLength = Math.hypot(deltaX, deltaY);

    sprite.visible = true;
    sprite.tint = style.color;
    sprite.alpha = style.alpha;
    sprite.position.set(
      (segment.start.x + segment.end.x) * 0.5,
      (segment.start.y + segment.end.y) * 0.5,
    );
    sprite.rotation = Math.atan2(deltaY, deltaX);
    sprite.width = segmentLength + style.width * 1.2;
    sprite.height = style.width;
  }

  for (let index = segments.length; index < renderer.segments.length; index += 1) {
    renderer.segments[index].visible = false;
  }
}

function getPathRendererSegment(renderer: PathRenderer, index: number): Sprite {
  const existing = renderer.segments[index];
  if (existing) {
    return existing;
  }

  const segment = new Sprite(Texture.WHITE);
  segment.anchor.set(0.5, 0.5);
  renderer.segments.push(segment);
  renderer.container.addChildAt(segment, renderer.container.children.length - 1);
  return segment;
}

function drawPathDecorations(
  graphics: Graphics,
  points: readonly Vector2Like[],
  style: {
    color: number;
    alpha: number;
    radius: number;
    width: number;
  },
  drawJoints: boolean,
): void {
  graphics.clear();

  if (drawJoints) {
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const previousHeading = Math.atan2(
        current.y - previous.y,
        current.x - previous.x,
      );
      const nextHeading = Math.atan2(
        next.y - current.y,
        next.x - current.x,
      );
      const headingDelta = Math.abs(
        normalizeAngle(nextHeading - previousHeading),
      );

      if (headingDelta < 0.045) {
        continue;
      }

      graphics.circle(current.x, current.y, style.width * 0.42);
      graphics.fill({
        color: style.color,
        alpha: style.alpha * 0.72,
      });
    }
  }

  const endpoint = points[points.length - 1];
  graphics.circle(endpoint.x, endpoint.y, style.radius);
  graphics.fill({
    color: style.color,
    alpha: style.alpha,
  });
}

function createSandboxMissionSnapshot(
  title: string,
): MissionRuntimeSnapshot {
  return {
    title,
    subtitle: "",
    currentInstruction: "",
    steps: [],
    currentProgress: 1,
    completedSteps: 0,
    totalSteps: 0,
    completed: true,
    activeTarget: null,
    targetEvents: [],
    control: DEFAULT_MISSION_CONTROL_STATE,
  };
}

function syncCelestialNameLabels(options: {
  container: Container;
  celestialVisuals: readonly CelestialVisual[];
  cameraZoom: number;
  worldOffset: Vector2Like;
  screenWidth: number;
  screenHeight: number;
  visible: boolean;
}): void {
  if (!options.visible) {
    clearMissionAreaRadialLabels(options.container);
    return;
  }

  const labelSources = options.celestialVisuals.filter((visual) =>
    !visual.config.hidden && visual.config.name.trim().length > 0
  );
  if (labelSources.length === 0) {
    clearMissionAreaRadialLabels(options.container);
    return;
  }

  ensureCelestialNameLabelCount(options.container, labelSources.length);
  const labels = options.container.children as Text[];
  let labelIndex = 0;

  for (const source of labelSources) {
    const label = labels[labelIndex];
    if (!label) {
      break;
    }

    const screenX =
      source.body.position.x * options.cameraZoom + options.worldOffset.x;
    const screenY =
      source.body.position.y * options.cameraZoom + options.worldOffset.y;
    const yOffset = Math.max(16, source.config.radius * options.cameraZoom + 10);

    label.text = source.config.name;
    label.position.set(screenX, screenY - yOffset);
    label.visible =
      screenX >= -220 &&
      screenX <= options.screenWidth + 220 &&
      screenY >= -220 &&
      screenY <= options.screenHeight + 220;
    labelIndex += 1;
  }
}

function ensureCelestialNameLabelCount(container: Container, count: number): void {
  while (container.children.length > count) {
    const stale = container.removeChildAt(container.children.length - 1);
    stale.destroy();
  }

  while (container.children.length < count) {
    const node = new Text({
      text: "",
      style: {
        fill: "#eaf6ff",
        fontFamily: "Menlo, Monaco, monospace",
        fontSize: 13,
        fontWeight: "700",
        align: "center",
        stroke: {
          color: "#0a1520",
          width: 3,
        },
      },
    });
    node.anchor.set(0.5, 1);
    container.addChild(node);
  }
}

function syncFuelLaneMapLabels(
  container: Container,
  celestialVisuals: readonly CelestialVisual[],
): void {
  const laneSources = celestialVisuals.filter(
    (visual) => !visual.config.hidden && (visual.config.refuelLaneRadius ?? 0) > 0,
  );
  const labelsPerLane = 8;
  const totalLabels = laneSources.length * labelsPerLane;

  if (totalLabels === 0) {
    clearMissionAreaRadialLabels(container);
    return;
  }

  ensureMissionAreaRadialLabelCount(container, totalLabels, "FUEL LANE");
  const labelNodes = container.children as Text[];
  const nowMs = performance.now();
  let labelIndex = 0;

  for (const source of laneSources) {
    const laneRadius = source.config.refuelLaneRadius ?? 0;
    const laneThickness = Math.max(24, source.config.refuelLaneThickness ?? 160);
    const labelRadius = laneRadius + Math.max(36, laneThickness * 0.44);

    for (let segmentIndex = 0; segmentIndex < labelsPerLane; segmentIndex += 1) {
      const node = labelNodes[labelIndex];
      if (!node) {
        break;
      }
      const angle =
        -Math.PI / 2 + (segmentIndex / labelsPerLane) * Math.PI * 2;

      node.text = "FUEL LANE";
      node.position.set(
        source.body.position.x + Math.cos(angle) * labelRadius,
        source.body.position.y + Math.sin(angle) * labelRadius,
      );
      node.rotation = angle + Math.PI / 2;
      node.alpha =
        0.34 + 0.24 * (0.5 + 0.5 * Math.sin(nowMs / 460 + labelIndex * 0.62));
      labelIndex += 1;
    }
  }
}

function ensureMissionAreaRadialLabelCount(
  container: Container,
  count: number,
  label: string,
): void {
  while (container.children.length > count) {
    const stale = container.removeChildAt(container.children.length - 1);
    stale.destroy();
  }

  while (container.children.length < count) {
    const node = new Text({
      text: label,
      style: {
        fill: "#7affd7",
        fontFamily: "Menlo, Monaco, monospace",
        fontSize: 56,
        fontWeight: "700",
        letterSpacing: 5,
      },
    });
    node.anchor.set(0.5, 0.5);
    container.addChild(node);
  }
}

function clearMissionAreaRadialLabels(container: Container): void {
  if (container.children.length === 0) {
    return;
  }

  for (const child of container.removeChildren()) {
    child.destroy();
  }
}

function syncTacticalEntitySystem(options: {
  system: TacticalEntitySystem;
  interceptorBody: OrbitalBodyState;
  celestialVisuals: readonly CelestialVisual[];
  defenseVisuals: readonly DefenseVisual[];
  missileVisuals: readonly MissileVisual[];
  activeMarker: WorldMarkerView | null;
  knownHostileDefenseIds: ReadonlySet<string>;
  likelyEnemyMarkers: readonly LikelyEnemyMarker[];
  knownMissileIds: ReadonlySet<string>;
}): void {
  resetTacticalEntitySystem(options.system);

  upsertTacticalEntity(options.system, {
    id: "player:interceptor",
    label: "Player Interceptor",
    kind: "ship",
    team: "player",
    systemId: options.interceptorBody.systemId,
    position: options.interceptorBody.position,
    radius: options.interceptorBody.radius,
    targetable: true,
    scannable: true,
    collisionTarget: true,
    tags: ["player", "ship"],
    linkedId: options.interceptorBody.id,
  });

  for (const visual of options.celestialVisuals) {
    const isRefuelBody = hasCelestialRefuelSource(visual.config);
    upsertTacticalEntity(options.system, {
      id: `celestial:${visual.config.id}`,
      label: visual.config.name,
      kind: "celestial",
      team: "environment",
      systemId: visual.config.systemId,
      position: visual.body.position,
      radius: visual.body.radius,
      targetable: false,
      scannable: !visual.config.hidden,
      collisionTarget: (visual.body.collisionRadius ?? visual.body.radius) > 0,
      tags: [
        "celestial",
        visual.config.parentId === null ? "primary" : "orbiter",
        visual.config.hidden ? "hidden" : "visible",
        ...(isRefuelBody ? ["utility", "refuel"] : []),
        ...((visual.config.refuelLaneRadius ?? 0) > 0 ? ["fuel-lane"] : []),
      ],
      linkedId: visual.config.id,
    });
  }

  for (const visual of options.defenseVisuals) {
    const isNeutralSite = visual.config.weaponType === "station";
    const isKnownHostileSite =
      isNeutralSite || options.knownHostileDefenseIds.has(visual.config.id);
    const collisionTarget =
      !visual.destroyed &&
      isKnownHostileSite &&
      visual.config.weaponType !== "target" &&
      visual.body.collisionRadius > 0;
    upsertTacticalEntity(options.system, {
      id: `site:${visual.config.id}`,
      label: visual.config.name,
      kind: "site",
      team: isNeutralSite ? "neutral" : "hostile",
      systemId: visual.config.systemId,
      position: visual.body.position,
      radius: visual.body.radius,
      targetable: !visual.destroyed && isKnownHostileSite,
      scannable: !visual.destroyed && isKnownHostileSite,
      collisionTarget,
      tags: [
        "site",
        visual.config.weaponType,
        isNeutralSite ? "utility" : "combat",
        isKnownHostileSite ? "known" : "suspected",
        visual.config.refuelRange ? "refuel" : "armed",
      ],
      linkedId: visual.config.id,
    });
  }

  for (const missile of options.missileVisuals) {
    const active =
      missile.detonationElapsedSeconds === null &&
      missile.neutralizedElapsedSeconds === null &&
      missile.body.crashed === null;
    const knownOnScanners = options.knownMissileIds.has(missile.id);
    upsertTacticalEntity(options.system, {
      id: `missile:${missile.id}`,
      label: "Torpedo",
      kind: "missile",
      team: "hostile",
      systemId: missile.body.systemId,
      position: missile.body.position,
      radius: missile.body.radius,
      targetable: active && knownOnScanners,
      scannable: active && knownOnScanners,
      collisionTarget: active,
      tags: ["missile", "torpedo", knownOnScanners ? "known" : "hidden"],
      linkedId: missile.id,
    });
  }

  if (options.activeMarker) {
    upsertTacticalEntity(options.system, {
      id: `marker:${options.activeMarker.id}`,
      label: options.activeMarker.label,
      kind: "marker",
      team: "neutral",
      systemId: null,
      position: options.activeMarker.center,
      radius: options.activeMarker.radius,
      targetable: false,
      scannable: true,
      collisionTarget: false,
      tags: ["marker", options.activeMarker.shape, options.activeMarker.variant],
      linkedId: options.activeMarker.id,
    });
  }

  for (const marker of options.likelyEnemyMarkers) {
    upsertTacticalEntity(options.system, {
      id: marker.id,
      label: marker.label,
      kind: "marker",
      team: "hostile",
      systemId: marker.systemId,
      position: marker.position,
      radius: marker.radius,
      targetable: false,
      scannable: true,
      collisionTarget: false,
      tags: ["marker", "likely-enemy", "tactical"],
      linkedId: marker.linkedDefenseId,
    });
  }
}

function formatWarning(label: string, hazard: ForecastHazard | null): string | null {
  if (!hazard) {
    return null;
  }

  const severity = hazard.kind === "impact" ? "COLLISION" : "Close approach";
  return `${label}: ${severity} risk with ${hazard.bodyId} at ${hazard.distance.toFixed(1)} km`;
}

function computeMapKillBorder(
  celestialConfigs: readonly CelestialConfig[],
  defenseConfigs: readonly DefenseConfig[],
): MapKillBorder {
  const systemRoots = celestialConfigs.filter(
    (config) => config.parentId === null,
  );
  if (systemRoots.length === 0) {
    return {
      center: { x: 0, y: 0 },
      radius: MAP_KILL_BORDER_MIN_RADIUS,
    };
  }

  const center = {
    x:
      systemRoots.reduce((sum, root) => sum + root.rootPosition.x, 0) /
      systemRoots.length,
    y:
      systemRoots.reduce((sum, root) => sum + root.rootPosition.y, 0) /
      systemRoots.length,
  };
  const maxSystemSpanById = new Map<string, number>();
  for (const config of celestialConfigs) {
    const eccentricity = Math.max(0, config.orbitEccentricity ?? 0);
    const apoapsisRadius =
      config.parentId === null
        ? 0
        : config.orbitRadius * (1 + eccentricity);
    const bodyRadius = config.collisionRadius ?? config.radius;
    const span = apoapsisRadius + bodyRadius + 460;
    const previous = maxSystemSpanById.get(config.systemId) ?? 0;
    if (span > previous) {
      maxSystemSpanById.set(config.systemId, span);
    }
  }
  for (const config of defenseConfigs) {
    const span = config.orbitRadius + config.radius + 320;
    const previous = maxSystemSpanById.get(config.systemId) ?? 0;
    if (span > previous) {
      maxSystemSpanById.set(config.systemId, span);
    }
  }

  let radius = 0;
  for (const root of systemRoots) {
    const systemSpan = Math.max(
      maxSystemSpanById.get(root.systemId) ?? 0,
      root.radius + 420,
    );
    radius = Math.max(
      radius,
      distanceBetween(center, root.rootPosition) + systemSpan,
    );
  }

  return {
    center,
    radius: Math.max(
      MAP_KILL_BORDER_MIN_RADIUS,
      radius + MAP_KILL_BORDER_PADDING,
    ),
  };
}

function drawMapKillBorder(
  graphics: Graphics,
  border: MapKillBorder,
  shipPosition: Vector2Like,
): void {
  graphics.clear();
  const distanceFromCenter = distanceBetween(shipPosition, border.center);
  const dangerBand = 920;
  const proximity = clamp(
    (distanceFromCenter - (border.radius - dangerBand)) / dangerBand,
    0,
    1,
  );
  const pulse = 0.62 + Math.sin(performance.now() / 340) * 0.38;
  const outerAlpha = 0.14 + proximity * 0.38 + pulse * 0.05;
  const innerAlpha = 0.08 + proximity * 0.24;
  const stripeAlpha = 0.08 + proximity * 0.28 + pulse * 0.05;
  const stripeInnerRadius = border.radius + MAP_KILL_BORDER_STRIPE_INNER_OFFSET;
  const stripeOuterRadius = border.radius + MAP_KILL_BORDER_STRIPE_OUTER_WIDTH;
  const stripeCount = clamp(
    Math.round((Math.PI * 2 * border.radius) / 980),
    24,
    96,
  );
  const stripeStepRadians = (Math.PI * 2) / stripeCount;
  const stripeSweepRadians = stripeStepRadians * 0.56;
  const stripePhase = performance.now() / 2200;

  for (let index = 0; index < stripeCount; index += 1) {
    const stripeStart = stripePhase + index * stripeStepRadians;
    const stripeEnd = stripeStart + stripeSweepRadians;
    drawFilledAnnulusSegment(
      graphics,
      border.center,
      stripeInnerRadius,
      stripeOuterRadius,
      stripeStart,
      stripeEnd,
      0xff4f4f,
      stripeAlpha,
    );
  }

  graphics.circle(border.center.x, border.center.y, border.radius);
  graphics.stroke({
    color: 0xff6565,
    width: 6,
    alpha: outerAlpha,
  });
  graphics.circle(border.center.x, border.center.y, border.radius - 96);
  graphics.stroke({
    color: 0xffb08c,
    width: 2,
    alpha: innerAlpha,
  });
}

function drawFilledAnnulusSegment(
  graphics: Graphics,
  center: Vector2Like,
  innerRadius: number,
  outerRadius: number,
  startRadians: number,
  endRadians: number,
  color: number,
  alpha: number,
): void {
  const spanRadians = endRadians - startRadians;
  const segmentCount = Math.max(
    4,
    Math.ceil(Math.abs(spanRadians) / (Math.PI / 20)),
  );
  const points: Vector2Like[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const angle = startRadians + spanRadians * t;
    points.push({
      x: center.x + Math.cos(angle) * outerRadius,
      y: center.y + Math.sin(angle) * outerRadius,
    });
  }

  for (let index = segmentCount; index >= 0; index -= 1) {
    const t = index / segmentCount;
    const angle = startRadians + spanRadians * t;
    points.push({
      x: center.x + Math.cos(angle) * innerRadius,
      y: center.y + Math.sin(angle) * innerRadius,
    });
  }

  graphics.poly(points);
  graphics.fill({
    color,
    alpha,
  });
}

function buildReturnToObjectiveSystemMarker(options: {
  missionTarget: WorldMarkerView | null;
  shipPosition: Vector2Like;
  shipSystemId: string;
  systemRootPositions: ReadonlyMap<string, Vector2Like>;
  celestialVisuals: readonly CelestialVisual[];
}): WorldMarkerView | null {
  if (!options.missionTarget) {
    return null;
  }

  const objectiveSystemId = getNearestSystemRootId(
    options.celestialVisuals,
    options.missionTarget.center,
  );
  if (objectiveSystemId === options.shipSystemId) {
    return null;
  }

  const objectiveSystemCenter =
    options.systemRootPositions.get(objectiveSystemId) ?? null;
  if (!objectiveSystemCenter) {
    return null;
  }

  const deltaX = objectiveSystemCenter.x - options.shipPosition.x;
  const deltaY = objectiveSystemCenter.y - options.shipPosition.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= 0.0001) {
    return null;
  }

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const heading = Math.atan2(unitY, unitX);
  const objectiveSystemName = getSystemRoot(
    options.celestialVisuals,
    objectiveSystemId,
  ).config.name;

  return {
    id: `target:return-to-system:${objectiveSystemId}`,
    label: `Return to ${objectiveSystemName}`,
    shape: "directionArrow",
    variant: "pulse",
    center: {
      x: options.shipPosition.x + unitX * MAP_KILL_BORDER_ARROW_DISTANCE,
      y: options.shipPosition.y + unitY * MAP_KILL_BORDER_ARROW_DISTANCE,
    },
    radius: MAP_KILL_BORDER_ARROW_RADIUS,
    rotationRadians: heading,
  };
}

function getSystemRoot(
  visuals: readonly CelestialVisual[],
  systemId: string,
): CelestialVisual {
  const root = visuals.find(
    (visual) => visual.config.systemId === systemId && visual.config.parentId === null,
  );

  if (!root) {
    throw new Error(`Missing root body for system ${systemId}`);
  }

  return root;
}

function resolveSpawnAnchorConfig(options: {
  celestialConfigs: readonly CelestialConfig[];
  systemId: string;
  fallbackRootConfig: CelestialConfig;
  anchorBodyId?: string | null;
}): CelestialConfig {
  const normalizedAnchorBodyId = options.anchorBodyId?.trim();
  if (!normalizedAnchorBodyId) {
    return options.fallbackRootConfig;
  }

  const anchorConfig = options.celestialConfigs.find(
    (config) =>
      config.id === normalizedAnchorBodyId
      && config.systemId === options.systemId,
  );

  return anchorConfig ?? options.fallbackRootConfig;
}

function buildSystemRootPositionMap(
  visuals: readonly CelestialVisual[],
): ReadonlyMap<string, Vector2Like> {
  return new Map(
    visuals
      .filter((visual) => visual.config.parentId === null)
      .map((visual) => [
        visual.config.systemId,
        { x: visual.body.position.x, y: visual.body.position.y },
      ]),
  );
}

function resolveMissionMarkerViews(
  mission: MissionDefinition,
  visuals: readonly CelestialVisual[],
): ReadonlyMap<string, WorldMarkerView> {
  const views = new Map<string, WorldMarkerView>();

  for (const marker of mission.markers ?? []) {
    const center = resolveMissionMarkerCenter(marker, visuals);
    if (!center) {
      continue;
    }

    views.set(marker.id, {
      id: marker.id,
      label: marker.label,
      shape: marker.shape,
      variant: marker.variant,
      center,
      radius: marker.radius,
      thickness: marker.thickness,
      rotationRadians: marker.rotationRadians,
    });
  }

  return views;
}

function resolveMissionMarkerCenter(
  marker: MissionMarkerDefinition,
  visuals: readonly CelestialVisual[],
): Vector2Like | null {
  const anchor = marker.anchor;
  const addOffset = (
    base: Vector2Like,
    offset: Vector2Like | undefined,
  ): Vector2Like => ({
    x: base.x + (offset?.x ?? 0),
    y: base.y + (offset?.y ?? 0),
  });

  switch (anchor.kind) {
    case "position":
      return {
        x: anchor.position.x,
        y: anchor.position.y,
      };
    case "body": {
      const visual = visuals.find((candidate) => candidate.config.id === anchor.bodyId);
      if (!visual) {
        return null;
      }

      return addOffset(visual.body.position, anchor.offset);
    }
    case "system-root": {
      const systemRoot = visuals.find(
        (candidate) =>
          candidate.config.systemId === anchor.systemId &&
          candidate.config.parentId === null,
      );
      if (!systemRoot) {
        return null;
      }

      return addOffset(systemRoot.body.position, anchor.offset);
    }
  }
}

function buildResolvedMissionTargetPositions(
  celestialVisuals: readonly CelestialVisual[],
  defenseVisuals: readonly DefenseVisual[],
  resolvedMarkers: ReadonlyMap<string, WorldMarkerView> | null,
): ReadonlyMap<string, Vector2Like> {
  const positions = new Map<string, Vector2Like>();

  for (const visual of celestialVisuals) {
    positions.set(visual.config.id, {
      x: visual.body.position.x,
      y: visual.body.position.y,
    });
    if (visual.config.parentId === null) {
      positions.set(visual.config.systemId, {
        x: visual.body.position.x,
        y: visual.body.position.y,
      });
    }
  }

  for (const visual of defenseVisuals) {
    positions.set(visual.config.id, {
      x: visual.body.position.x,
      y: visual.body.position.y,
    });
  }

  for (const [markerId, marker] of resolvedMarkers ?? []) {
    positions.set(markerId, {
      x: marker.center.x,
      y: marker.center.y,
    });
  }

  return positions;
}

function syncBodyToNearestSystemRoot(
  body: OrbitalBodyState,
  visuals: readonly CelestialVisual[],
): void {
  body.systemId = getNearestSystemRootId(visuals, body.position);
}

function getNearestSystemRootId(
  visuals: readonly CelestialVisual[],
  position: Vector2Like,
): string {
  let nearestRoot: CelestialVisual | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const visual of visuals) {
    if (visual.config.parentId !== null) {
      continue;
    }

    const offsetX = visual.body.position.x - position.x;
    const offsetY = visual.body.position.y - position.y;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;

    if (distanceSquared < nearestDistanceSquared) {
      nearestRoot = visual;
      nearestDistanceSquared = distanceSquared;
    }
  }

  if (!nearestRoot) {
    throw new Error("Missing system root for interceptor system sync");
  }

  return nearestRoot.config.systemId;
}
