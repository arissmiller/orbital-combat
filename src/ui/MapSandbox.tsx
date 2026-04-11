import { Application, Container, Graphics, Text } from "pixi.js";
import { useEffect, useState, useRef } from "react";
import { logDevEvent } from "../dev/runtime-log";
import {
  createCelestialEphemeris,
  createCelestialStateEvaluator,
  type CelestialPose,
} from "../game/maps/celestial-ephemeris";
import {
  createBinarySystemConfigs,
  createBinaryDefenseConfigs,
  createDefenseConfigs,
  createGiantMoonSystemConfigs,
  createOrbitalFlightTrainingLayout,
  createRefinerySystemConfigs,
  createRingedGasGiantSystemConfigs,
  createSimpleSystemConfigs,
} from "../game/maps/prototype-maps";
import type {
  CelestialBodyClass,
  CelestialConfig,
  CelestialRockyPalette,
  CelestialWeatherLevel,
  DefenseConfig,
  MapSpawnConfig,
  SharedMapLayout,
} from "../game/maps/types";
import { MAP_LAB_SHARED_LAYOUT } from "../game/maps/shared-map-layouts";
import {
  AURELIA_COMBAT_RANGE_SCENARIO,
  ORBITAL_FLIGHT_TRAINING_SCENARIO,
  SCENARIO_DEFINITIONS,
} from "../game/scenarios/scenario-definitions";
import {
  createCelestialSprite,
  type CelestialRenderStage,
} from "../game/rendering/celestial-generator";
import { decorateRefuelBodySprite } from "../game/rendering/refuel-body-decoration";
import type { Vector2Like } from "../game/physics/vector2";
import { WORLD_ENTITY_STYLES } from "../game/rendering/world-entity-styles";
import type {
  MissionBriefingBlock,
  MissionControlNode,
  MissionDifficulty,
  MissionFactionConfig,
  MissionRuntimeLogicId,
  MissionMarkerDefinition,
  MissionObjective,
  MissionSupportLink,
  MissionTrigger,
} from "../game/missions/mission-definition";
import type {
  ScenarioAuthoringMetadata,
  ScenarioDefinition,
  ScenarioEncounterGroup,
} from "../game/scenarios/scenario-definition";
import { closeMapEditor, useDevToolsState } from "./dev-tools-store";

const INITIAL_PREVIEW_WIDTH = 1280;
const INITIAL_PREVIEW_HEIGHT = 720;
const INITIAL_BODY_LAB_PREVIEW_WIDTH = 360;
const INITIAL_BODY_LAB_PREVIEW_HEIGHT = 228;
const GRID_SPACING_WORLD_UNITS = [50, 100, 200, 400, 800, 1600, 3200, 6400];
const MAP_BOUNDS_SAMPLE_COUNT = 72;
const ORBIT_PATH_SAMPLE_COUNT = 96;
const MAP_PREVIEW_MIN_ZOOM = 0.35;
const MAP_PREVIEW_MAX_ZOOM = 4;
const BODY_LAB_MIN_ZOOM = 0.7;
const BODY_LAB_MAX_ZOOM = 2.4;
const MAP_LAB_HISTORY_LIMIT = 80;
const MAP_LAB_SAVE_ROUTE = "/__map-lab/save-mission";
const MAP_LAB_SAVE_TARGET = "scenario";

type MapPresetId =
  | "flight-tutorial"
  | "simple-system"
  | "binary-system"
  | "refinery-system"
  | "giant-moons"
  | "ring-giant";

type MapSidebarPanel = "world" | "selection" | "scenario" | "output";

type MapScenarioJsonEditor =
  | "factions"
  | "control-nodes"
  | "support-links"
  | "markers"
  | "objectives"
  | "briefings"
  | "triggers"
  | "initial-flags"
  | "encounters";

const MAP_PRESET_OPTIONS: Array<{ value: MapPresetId; label: string }> = [
  { value: "flight-tutorial", label: "Orbital Flight Tutorial" },
  { value: "simple-system", label: "Aurelia Training" },
  { value: "binary-system", label: "Janus Binary" },
  { value: "refinery-system", label: "Vesta Refinery" },
  { value: "giant-moons", label: "Brontes Array" },
  { value: "ring-giant", label: "Hyperion Rings" },
];

const BODY_CLASS_OPTIONS: Array<{ value: CelestialBodyClass; label: string }> = [
  { value: "meteor", label: "Meteor" },
  { value: "comet", label: "Comet" },
  { value: "asteroid", label: "Asteroid" },
  { value: "rocky-moon", label: "Rocky Moon" },
  { value: "icy-moon", label: "Icy Moon" },
  { value: "dwarf-planet", label: "Dwarf Planet" },
  { value: "icy-dwarf", label: "Icy Dwarf" },
  { value: "small-rocky-planet", label: "Small Rocky Planet" },
  { value: "small-icy-planet", label: "Small Icy Planet" },
  { value: "small-volcanic-planet", label: "Small Volcanic Planet" },
  { value: "medium-ocean-planet", label: "Medium Ocean Planet" },
  { value: "medium-terrestrial-planet", label: "Medium Terrestrial Planet" },
  { value: "medium-earthlike-planet", label: "Medium Earthlike Planet" },
  { value: "large-ocean-planet", label: "Large Ocean Planet" },
  { value: "large-terrestrial-planet", label: "Large Terrestrial Planet" },
  { value: "large-earthlike-planet", label: "Large Earthlike Planet" },
  { value: "gas-giant", label: "Gas Giant" },
  { value: "gas-supergiant", label: "Gas Supergiant" },
];

const WEATHER_OPTIONS: Array<{ value: CelestialWeatherLevel; label: string }> = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" },
  { value: "extreme", label: "Extreme" },
];

const ROCKY_PALETTE_OPTIONS: Array<{
  value: CelestialRockyPalette;
  label: string;
}> = [
  { value: "default", label: "Default" },
  { value: "ash", label: "Ash" },
  { value: "basalt", label: "Basalt" },
  { value: "slate", label: "Slate" },
  { value: "ochre", label: "Ochre" },
  { value: "umber", label: "Umber" },
  { value: "rust", label: "Rust" },
  { value: "iron", label: "Iron" },
  { value: "obsidian", label: "Obsidian" },
];

const BODY_LAB_RENDER_STAGE_OPTIONS: Array<{
  value: CelestialRenderStage;
  label: string;
}> = [
  { value: "flat", label: "Flat" },
  { value: "surface", label: "Surface" },
  { value: "relief", label: "Relief" },
  { value: "full", label: "Full" },
];

interface PreviewSize {
  width: number;
  height: number;
}

interface PreviewCamera {
  center: Vector2Like;
  pixelsPerWorldUnit: number;
}

interface PreviewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface BodyScreenHit {
  id: string;
  screenPosition: Vector2Like;
  hitRadius: number;
}

interface OrbitPreviewModel {
  viewBox: string;
  orbitPath: string;
  currentPosition: Vector2Like;
  tangentEnd: Vector2Like;
  parentRadius: number;
  bodyRadius: number;
}

type MapLabEntityTemplate = "torpedo" | "beam" | "station" | "target";

interface MapSandboxPresetBundle {
  mapName: string;
  mapDescription?: string;
  bodies: CelestialConfig[];
  entities: DefenseConfig[];
  spawn: MapSpawnConfig;
  scenario: ScenarioDefinition;
}

interface MapLabEditorSnapshot {
  presetId: MapPresetId;
  selectedLibraryScenarioId: string;
  selectedBodyId: string | null;
  selectedEntityId: string | null;
  activeSelectionKind: "body" | "entity";
  mapName: string;
  mapDescription: string;
  bodies: CelestialConfig[];
  entities: DefenseConfig[];
  spawnConfig: MapSpawnConfig;
  scenarioId: string;
  scenarioName: string;
  scenarioDescription: string;
  scenarioDifficulty: MissionDifficulty;
  scenarioTagsText: string;
  scenarioEyebrow: string;
  scenarioAccentColor: string;
  scenarioSortOrder: number;
  scenarioRuntimeLogicId: MissionRuntimeLogicId;
  scenarioFactions: MissionFactionConfig[];
  scenarioControlNodes: MissionControlNode[];
  scenarioSupportLinks: MissionSupportLink[];
  scenarioMarkers: MissionMarkerDefinition[];
  scenarioObjectives: MissionObjective[];
  scenarioBriefings: MissionBriefingBlock[];
  scenarioTriggers: MissionTrigger[];
  scenarioInitialFlags: Record<string, string | number | boolean>;
  scenarioEncounters: ScenarioEncounterGroup[];
  scenarioAuthoringVersion: number;
  scenarioAuthoringSummary: string;
  scenarioDesignGoalsText: string;
  scenarioPlaytestFocusText: string;
  scenarioEditorHintsText: string;
  scenarioAiPromptSeed: string;
  scenarioNotesText: string;
}

const SCENARIO_DIFFICULTY_OPTIONS: Array<{
  value: MissionDifficulty;
  label: string;
}> = [
  { value: "tutorial", label: "Tutorial" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "extreme", label: "Extreme" },
];

const SCENARIO_RUNTIME_OPTIONS: Array<{
  value: MissionRuntimeLogicId;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "orbital-flight-training", label: "Orbital Flight Training" },
  { value: "nadir-random-gate-run", label: "Nadir Random Gate Run" },
];

export function MapSandbox() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const previewLayerRef = useRef<Graphics | null>(null);
  const bodyLabHostRef = useRef<HTMLDivElement | null>(null);
  const bodyLabAppRef = useRef<Application | null>(null);
  const bodyLabLayerRef = useRef<Container | null>(null);
  const previewCameraRef = useRef<PreviewCamera | null>(null);
  const previewPoseRef = useRef<ReadonlyMap<string, CelestialPose>>(new Map());
  const previewSizeRef = useRef<PreviewSize>({
    width: INITIAL_PREVIEW_WIDTH,
    height: INITIAL_PREVIEW_HEIGHT,
  });
  const bodyScreenHitsRef = useRef<BodyScreenHit[]>([]);
  const worldTimeRef = useRef(0);
  const panOffsetRef = useRef<Vector2Like>({ x: 0, y: 0 });
  const dragStateRef = useRef<
    | {
        kind: "pan";
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startPanOffset: Vector2Like;
        startedDragging: boolean;
      }
    | {
        kind: "body";
        pointerId: number;
        bodyId: string;
        startedDragging: boolean;
      }
    | null
  >(null);
  const currentEditorSnapshotRef = useRef<MapLabEditorSnapshot | null>(null);
  const currentEditorSnapshotSignatureRef = useRef("");
  const lastCommittedSnapshotRef = useRef<MapLabEditorSnapshot | null>(null);
  const lastCommittedSnapshotSignatureRef = useRef("");
  const historyInteractionRef = useRef<
    "normal" | "applying" | "dragging-body" | "manual-commit"
  >("normal");
  const dragHistoryStartSnapshotRef = useRef<MapLabEditorSnapshot | null>(null);
  const dragHistoryStartSignatureRef = useRef("");
  const undoHistoryRef = useRef<MapLabEditorSnapshot[]>([]);
  const redoHistoryRef = useRef<MapLabEditorSnapshot[]>([]);
  const wasOpenRef = useRef(false);
  const resetHistoryOnNextSnapshotReasonRef = useRef<string | null>(null);
  const skipNextAutomaticHistoryPushReasonRef = useRef<string | null>(null);
  const initialPresetRef = useRef<MapSandboxPresetBundle | null>(null);
  if (!initialPresetRef.current) {
    initialPresetRef.current = createPresetScenarioBundle("simple-system");
  }
  const initialPreset = initialPresetRef.current;
  const { mapEditorOpen: isOpen } = useDevToolsState();

  const [previewReady, setPreviewReady] = useState(false);
  const [bodyLabPreviewReady, setBodyLabPreviewReady] = useState(false);
  const [previewSize, setPreviewSize] = useState<PreviewSize>({
    width: INITIAL_PREVIEW_WIDTH,
    height: INITIAL_PREVIEW_HEIGHT,
  });
  const [bodyLabPreviewSize, setBodyLabPreviewSize] = useState<PreviewSize>({
    width: INITIAL_BODY_LAB_PREVIEW_WIDTH,
    height: INITIAL_BODY_LAB_PREVIEW_HEIGHT,
  });
  const [presetId, setPresetId] = useState<MapPresetId>("simple-system");
  const [mapName, setMapName] = useState(
    () => initialPreset.mapName,
  );
  const [mapDescription, setMapDescription] = useState(
    () => initialPreset.mapDescription ?? "",
  );
  const [bodies, setBodies] = useState<CelestialConfig[]>(
    () => initialPreset.bodies,
  );
  const [entities, setEntities] = useState<DefenseConfig[]>(
    () => initialPreset.entities,
  );
  const [spawnConfig, setSpawnConfig] = useState<MapSpawnConfig>(
    () => initialPreset.spawn,
  );
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(
    () => initialPreset.bodies[0]?.id ?? null,
  );
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    () => initialPreset.entities[0]?.id ?? null,
  );
  const [worldTimeSeconds, setWorldTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const [cameraReferenceBounds, setCameraReferenceBounds] = useState<PreviewBounds>(
    () => measurePreviewBoundsAtTime(createPresetMapLayout("simple-system").bodies, 0),
  );
  const [panOffset, setPanOffset] = useState<Vector2Like>({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<"idle" | "panning" | "dragging-body">("idle");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showOrbitPaths, setShowOrbitPaths] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<MapSidebarPanel>("world");
  const [scenarioJsonEditor, setScenarioJsonEditor] =
    useState<MapScenarioJsonEditor>("objectives");
  const [selectedBodyRenderStage, setSelectedBodyRenderStage] =
    useState<CelestialRenderStage>("full");
  const [selectedBodyPreviewMode, setSelectedBodyPreviewMode] =
    useState<"body" | "orbit">("body");
  const [selectedBodyPreviewZoom, setSelectedBodyPreviewZoom] = useState(1);
  const [selectedBodyRotationDegrees, setSelectedBodyRotationDegrees] =
    useState(0);
  const [activeSelectionKind, setActiveSelectionKind] = useState<"body" | "entity">(
    "body",
  );
  const [scenarioId, setScenarioId] = useState(() => initialPreset.scenario.id);
  const [selectedLibraryScenarioId, setSelectedLibraryScenarioId] = useState(
    () => initialPreset.scenario.id,
  );
  const [scenarioName, setScenarioName] = useState(
    () => initialPreset.scenario.presentation.name,
  );
  const [scenarioDescription, setScenarioDescription] = useState(
    () => initialPreset.scenario.presentation.description ?? "",
  );
  const [scenarioDifficulty, setScenarioDifficulty] = useState<MissionDifficulty>(
    () => initialPreset.scenario.presentation.difficulty ?? "easy",
  );
  const [scenarioTagsText, setScenarioTagsText] = useState(
    () => (initialPreset.scenario.presentation.tags ?? []).join(", "),
  );
  const [scenarioEyebrow, setScenarioEyebrow] = useState(
    () => initialPreset.scenario.presentation.eyebrow ?? "",
  );
  const [scenarioAccentColor, setScenarioAccentColor] = useState(
    () => initialPreset.scenario.presentation.accentColor ?? "#8ee8ff",
  );
  const [scenarioSortOrder, setScenarioSortOrder] = useState(
    () => initialPreset.scenario.presentation.sortOrder ?? 100,
  );
  const [scenarioRuntimeLogicId, setScenarioRuntimeLogicId] =
    useState<MissionRuntimeLogicId>(
      () => initialPreset.scenario.mission.runtime?.logicId ?? "none",
    );
  const [scenarioFactions, setScenarioFactions] = useState<MissionFactionConfig[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.factions),
  );
  const [scenarioControlNodes, setScenarioControlNodes] = useState<MissionControlNode[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.controlNodes ?? []),
  );
  const [scenarioSupportLinks, setScenarioSupportLinks] = useState<MissionSupportLink[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.supportLinks ?? []),
  );
  const [scenarioMarkers, setScenarioMarkers] = useState<MissionMarkerDefinition[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.markers ?? []),
  );
  const [scenarioObjectives, setScenarioObjectives] = useState<MissionObjective[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.objectives),
  );
  const [scenarioBriefings, setScenarioBriefings] = useState<MissionBriefingBlock[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.briefings ?? []),
  );
  const [scenarioTriggers, setScenarioTriggers] = useState<MissionTrigger[]>(
    () => cloneScenarioJson(initialPreset.scenario.mission.triggers ?? []),
  );
  const [scenarioInitialFlags, setScenarioInitialFlags] = useState<
    Record<string, string | number | boolean>
  >(() => cloneScenarioJson(initialPreset.scenario.mission.initialFlags ?? {}));
  const [scenarioEncounters, setScenarioEncounters] = useState<ScenarioEncounterGroup[]>(
    () => cloneScenarioJson(initialPreset.scenario.encounters ?? []),
  );
  const [scenarioAuthoringVersion, setScenarioAuthoringVersion] = useState(
    () => initialPreset.scenario.authoring?.version ?? 1,
  );
  const [scenarioAuthoringSummary, setScenarioAuthoringSummary] = useState(
    () => initialPreset.scenario.authoring?.summary ?? "",
  );
  const [scenarioDesignGoalsText, setScenarioDesignGoalsText] = useState(
    () => (initialPreset.scenario.authoring?.designGoals ?? []).join("\n"),
  );
  const [scenarioPlaytestFocusText, setScenarioPlaytestFocusText] = useState(
    () => (initialPreset.scenario.authoring?.playtestFocus ?? []).join("\n"),
  );
  const [scenarioEditorHintsText, setScenarioEditorHintsText] = useState(
    () => (initialPreset.scenario.authoring?.editorHints ?? []).join("\n"),
  );
  const [scenarioAiPromptSeed, setScenarioAiPromptSeed] = useState(
    () => initialPreset.scenario.authoring?.aiPromptSeed ?? "",
  );
  const [scenarioNotesText, setScenarioNotesText] = useState(
    () => (initialPreset.scenario.authoring?.notes ?? []).join("\n"),
  );
  const [scenarioFactionsDraft, setScenarioFactionsDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.factions),
  );
  const [scenarioControlNodesDraft, setScenarioControlNodesDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.controlNodes ?? []),
  );
  const [scenarioSupportLinksDraft, setScenarioSupportLinksDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.supportLinks ?? []),
  );
  const [scenarioMarkersDraft, setScenarioMarkersDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.markers ?? []),
  );
  const [scenarioObjectivesDraft, setScenarioObjectivesDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.objectives),
  );
  const [scenarioBriefingsDraft, setScenarioBriefingsDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.briefings ?? []),
  );
  const [scenarioTriggersDraft, setScenarioTriggersDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.triggers ?? []),
  );
  const [scenarioInitialFlagsDraft, setScenarioInitialFlagsDraft] = useState(
    () => prettyJson(initialPreset.scenario.mission.initialFlags ?? {}),
  );
  const [scenarioEncountersDraft, setScenarioEncountersDraft] = useState(
    () => prettyJson(initialPreset.scenario.encounters ?? []),
  );
  const [exportStatus, setExportStatus] = useState("");
  const [undoHistory, setUndoHistory] = useState<MapLabEditorSnapshot[]>([]);
  const [redoHistory, setRedoHistory] = useState<MapLabEditorSnapshot[]>([]);

  useEffect(() => {
    previewSizeRef.current = previewSize;
  }, [previewSize]);

  useEffect(() => {
    worldTimeRef.current = worldTimeSeconds;
  }, [worldTimeSeconds]);

  useEffect(() => {
    setScenarioFactionsDraft(prettyJson(scenarioFactions));
  }, [scenarioFactions]);

  useEffect(() => {
    setScenarioControlNodesDraft(prettyJson(scenarioControlNodes));
  }, [scenarioControlNodes]);

  useEffect(() => {
    setScenarioSupportLinksDraft(prettyJson(scenarioSupportLinks));
  }, [scenarioSupportLinks]);

  useEffect(() => {
    setScenarioMarkersDraft(prettyJson(scenarioMarkers));
  }, [scenarioMarkers]);

  useEffect(() => {
    setScenarioObjectivesDraft(prettyJson(scenarioObjectives));
  }, [scenarioObjectives]);

  useEffect(() => {
    setScenarioBriefingsDraft(prettyJson(scenarioBriefings));
  }, [scenarioBriefings]);

  useEffect(() => {
    setScenarioTriggersDraft(prettyJson(scenarioTriggers));
  }, [scenarioTriggers]);

  useEffect(() => {
    setScenarioInitialFlagsDraft(prettyJson(scenarioInitialFlags));
  }, [scenarioInitialFlags]);

  useEffect(() => {
    setScenarioEncountersDraft(prettyJson(scenarioEncounters));
  }, [scenarioEncounters]);

  const normalizedBodies = normalizeMapLabBodies(bodies);
  const normalizedEntities = normalizeMapLabEntities(entities, normalizedBodies);
  const scenarioAuthoring: ScenarioAuthoringMetadata | undefined =
    hasScenarioAuthoringData({
      version: scenarioAuthoringVersion,
      summary: scenarioAuthoringSummary,
      designGoalsText: scenarioDesignGoalsText,
      playtestFocusText: scenarioPlaytestFocusText,
      editorHintsText: scenarioEditorHintsText,
      aiPromptSeed: scenarioAiPromptSeed,
      notesText: scenarioNotesText,
    })
      ? {
          version: scenarioAuthoringVersion,
          summary: scenarioAuthoringSummary.trim() || undefined,
          designGoals: splitMultilineEntries(scenarioDesignGoalsText),
          playtestFocus: splitMultilineEntries(scenarioPlaytestFocusText),
          editorHints: splitMultilineEntries(scenarioEditorHintsText),
          aiPromptSeed: scenarioAiPromptSeed.trim() || undefined,
          notes: splitMultilineEntries(scenarioNotesText),
        }
      : undefined;
  const currentScenarioDefinition: ScenarioDefinition = {
    id:
      sanitizeScenarioId(scenarioId)
      || slugify(scenarioName || mapName || "map-lab-scenario")
      || "map-lab-scenario",
    presentation: {
      name: scenarioName.trim() || mapName.trim() || "Map Lab Scenario",
      description: scenarioDescription.trim() || undefined,
      difficulty: scenarioDifficulty,
      tags: splitCommaEntries(scenarioTagsText),
      eyebrow: scenarioEyebrow.trim() || undefined,
      accentColor: normalizeOptionalHexColor(scenarioAccentColor),
      sortOrder: Number.isFinite(scenarioSortOrder) ? scenarioSortOrder : undefined,
    },
    map: {
      id: slugify(mapName || currentScenarioIdFallback(scenarioId, scenarioName)) || "map-lab-layout",
      name: mapName.trim() || scenarioName.trim() || "Map Lab Layout",
      mapDescription: mapDescription.trim() || undefined,
      celestialConfigs: cloneCelestialConfigs(normalizedBodies),
      defenseConfigs: cloneDefenseConfigs(normalizedEntities),
      spawn: {
        systemId: spawnConfig.systemId,
        orbitRadius: spawnConfig.orbitRadius,
        orbitDirection: spawnConfig.orbitDirection,
      },
    },
    mission: {
      runtime: {
        logicId: scenarioRuntimeLogicId,
      },
      factions: cloneScenarioJson(scenarioFactions),
      controlNodes: scenarioControlNodes.length > 0 ? cloneScenarioJson(scenarioControlNodes) : undefined,
      supportLinks: scenarioSupportLinks.length > 0 ? cloneScenarioJson(scenarioSupportLinks) : undefined,
      markers: scenarioMarkers.length > 0 ? cloneScenarioJson(scenarioMarkers) : undefined,
      objectives: cloneScenarioJson(scenarioObjectives),
      triggers: scenarioTriggers.length > 0 ? cloneScenarioJson(scenarioTriggers) : undefined,
      briefings: scenarioBriefings.length > 0 ? cloneScenarioJson(scenarioBriefings) : undefined,
      initialFlags:
        Object.keys(scenarioInitialFlags).length > 0
          ? cloneScenarioJson(scenarioInitialFlags)
          : undefined,
    },
    encounters: scenarioEncounters.length > 0 ? cloneScenarioJson(scenarioEncounters) : undefined,
    authoring: scenarioAuthoring,
  };
  const scenarioLibraryOptions = Object.values(SCENARIO_DEFINITIONS)
    .sort((left, right) => {
      const orderDelta =
        (left.presentation.sortOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.presentation.sortOrder ?? Number.MAX_SAFE_INTEGER);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return left.presentation.name.localeCompare(right.presentation.name);
    })
    .map((scenario) => ({
      value: scenario.id,
      label: scenario.presentation.name,
    }));
  const selectedBody =
    normalizedBodies.find((body) => body.id === selectedBodyId) ?? normalizedBodies[0] ?? null;
  const selectedBodyParent =
    selectedBody?.parentId
      ? normalizedBodies.find((body) => body.id === selectedBody.parentId) ?? null
      : null;
  const selectedBodyOrbitPreview =
    selectedBody && selectedBodyParent
      ? buildOrbitPreviewModel(selectedBody, selectedBodyParent)
      : null;
  const effectiveSelectedBodyPreviewMode =
    selectedBodyPreviewMode === "orbit" && selectedBodyParent ? "orbit" : "body";
  const selectedEntity =
    normalizedEntities.find((entity) => entity.id === selectedEntityId)
    ?? normalizedEntities[0]
    ?? null;
  const spawnRootOptions = normalizedBodies.filter(
    (body) => body.parentId === null && !body.hidden,
  );
  const exportText = buildMapLabScenarioModule(currentScenarioDefinition);
  const exportFileName = buildScenarioModuleFileName(currentScenarioDefinition.id);
  const distinctSystemCount = new Set(normalizedBodies.map((body) => body.systemId)).size;
  const selectedSubtreeIds = selectedBody
    ? collectBodySubtreeIds(normalizedBodies, selectedBody.id)
    : new Set<string>();
  const currentEditorSnapshot: MapLabEditorSnapshot = {
    presetId,
    selectedLibraryScenarioId,
    selectedBodyId,
    selectedEntityId,
    activeSelectionKind,
    mapName,
    mapDescription,
    bodies: cloneCelestialConfigs(normalizedBodies),
    entities: cloneDefenseConfigs(normalizedEntities),
    spawnConfig: cloneScenarioJson(spawnConfig),
    scenarioId,
    scenarioName,
    scenarioDescription,
    scenarioDifficulty,
    scenarioTagsText,
    scenarioEyebrow,
    scenarioAccentColor,
    scenarioSortOrder,
    scenarioRuntimeLogicId,
    scenarioFactions: cloneScenarioJson(scenarioFactions),
    scenarioControlNodes: cloneScenarioJson(scenarioControlNodes),
    scenarioSupportLinks: cloneScenarioJson(scenarioSupportLinks),
    scenarioMarkers: cloneScenarioJson(scenarioMarkers),
    scenarioObjectives: cloneScenarioJson(scenarioObjectives),
    scenarioBriefings: cloneScenarioJson(scenarioBriefings),
    scenarioTriggers: cloneScenarioJson(scenarioTriggers),
    scenarioInitialFlags: cloneScenarioJson(scenarioInitialFlags),
    scenarioEncounters: cloneScenarioJson(scenarioEncounters),
    scenarioAuthoringVersion,
    scenarioAuthoringSummary,
    scenarioDesignGoalsText,
    scenarioPlaytestFocusText,
    scenarioEditorHintsText,
    scenarioAiPromptSeed,
    scenarioNotesText,
  };
  const currentEditorSnapshotSignature = buildMapLabEditorSnapshotSignature(currentEditorSnapshot);
  const canUndo = undoHistory.length > 0;
  const canRedo = redoHistory.length > 0;
  const reportHistoryDebug = (message: string) => {
    const event = {
      message,
      bodies: normalizedBodies.length,
      entities: normalizedEntities.length,
      undoDepth: undoHistoryRef.current.length,
      redoDepth: redoHistoryRef.current.length,
      selectedBodyId,
      selectedEntityId,
      activeSelectionKind,
    };
    if (import.meta.env.DEV) {
      logDevEvent("debug", "MapSandbox.history", message, {
        details: event,
      });
    }
  };
  const setUndoHistoryStack = (nextHistory: MapLabEditorSnapshot[]) => {
    undoHistoryRef.current = nextHistory;
    setUndoHistory(nextHistory);
  };
  const setRedoHistoryStack = (nextHistory: MapLabEditorSnapshot[]) => {
    redoHistoryRef.current = nextHistory;
    setRedoHistory(nextHistory);
  };
  const resetEditorHistoryNow = (
    snapshot: MapLabEditorSnapshot,
    signature: string,
    reason: string,
  ) => {
    const clonedSnapshot = cloneMapLabEditorSnapshot(snapshot);
    currentEditorSnapshotRef.current = clonedSnapshot;
    currentEditorSnapshotSignatureRef.current = signature;
    lastCommittedSnapshotRef.current = clonedSnapshot;
    lastCommittedSnapshotSignatureRef.current = signature;
    historyInteractionRef.current = "normal";
    dragHistoryStartSnapshotRef.current = null;
    dragHistoryStartSignatureRef.current = "";
    resetHistoryOnNextSnapshotReasonRef.current = null;
    skipNextAutomaticHistoryPushReasonRef.current = null;
    setUndoHistoryStack([]);
    setRedoHistoryStack([]);
    reportHistoryDebug(
      `history reset now: ${reason} bodies=${clonedSnapshot.bodies.length} entities=${clonedSnapshot.entities.length}`,
    );
  };

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      resetEditorHistoryNow(
        currentEditorSnapshot,
        currentEditorSnapshotSignature,
        "open map lab",
      );
    }
    wasOpenRef.current = isOpen;
  }, [currentEditorSnapshot, currentEditorSnapshotSignature, isOpen]);

  const scheduleHistoryReset = (reason: string) => {
    resetHistoryOnNextSnapshotReasonRef.current = reason;
    historyInteractionRef.current = "normal";
    dragHistoryStartSnapshotRef.current = null;
    dragHistoryStartSignatureRef.current = "";
    skipNextAutomaticHistoryPushReasonRef.current = null;
    setUndoHistoryStack([]);
    setRedoHistoryStack([]);
    reportHistoryDebug(`schedule history reset: ${reason}`);
  };
  const framePreview = (configs: readonly CelestialConfig[], timeSeconds: number) => {
    setCameraReferenceBounds(measurePreviewBoundsAtTime(configs, timeSeconds));
    setPanOffset({ x: 0, y: 0 });
    setZoomMultiplier(1);
  };
  const applyEditorSnapshot = (snapshot: MapLabEditorSnapshot) => {
    setPresetId(snapshot.presetId);
    setSelectedLibraryScenarioId(snapshot.selectedLibraryScenarioId);
    setSelectedBodyId(snapshot.selectedBodyId);
    setSelectedEntityId(snapshot.selectedEntityId);
    setActiveSelectionKind(snapshot.activeSelectionKind);
    setMapName(snapshot.mapName);
    setMapDescription(snapshot.mapDescription);
    setBodies(cloneCelestialConfigs(snapshot.bodies));
    setEntities(cloneDefenseConfigs(snapshot.entities));
    setSpawnConfig(cloneScenarioJson(snapshot.spawnConfig));
    setScenarioId(snapshot.scenarioId);
    setScenarioName(snapshot.scenarioName);
    setScenarioDescription(snapshot.scenarioDescription);
    setScenarioDifficulty(snapshot.scenarioDifficulty);
    setScenarioTagsText(snapshot.scenarioTagsText);
    setScenarioEyebrow(snapshot.scenarioEyebrow);
    setScenarioAccentColor(snapshot.scenarioAccentColor);
    setScenarioSortOrder(snapshot.scenarioSortOrder);
    setScenarioRuntimeLogicId(snapshot.scenarioRuntimeLogicId);
    setScenarioFactions(cloneScenarioJson(snapshot.scenarioFactions));
    setScenarioControlNodes(cloneScenarioJson(snapshot.scenarioControlNodes));
    setScenarioSupportLinks(cloneScenarioJson(snapshot.scenarioSupportLinks));
    setScenarioMarkers(cloneScenarioJson(snapshot.scenarioMarkers));
    setScenarioObjectives(cloneScenarioJson(snapshot.scenarioObjectives));
    setScenarioBriefings(cloneScenarioJson(snapshot.scenarioBriefings));
    setScenarioTriggers(cloneScenarioJson(snapshot.scenarioTriggers));
    setScenarioInitialFlags(cloneScenarioJson(snapshot.scenarioInitialFlags));
    setScenarioEncounters(cloneScenarioJson(snapshot.scenarioEncounters));
    setScenarioAuthoringVersion(snapshot.scenarioAuthoringVersion);
    setScenarioAuthoringSummary(snapshot.scenarioAuthoringSummary);
    setScenarioDesignGoalsText(snapshot.scenarioDesignGoalsText);
    setScenarioPlaytestFocusText(snapshot.scenarioPlaytestFocusText);
    setScenarioEditorHintsText(snapshot.scenarioEditorHintsText);
    setScenarioAiPromptSeed(snapshot.scenarioAiPromptSeed);
    setScenarioNotesText(snapshot.scenarioNotesText);
  };
  const restoreEditorSnapshot = (snapshot: MapLabEditorSnapshot) => {
    historyInteractionRef.current = "applying";
    applyEditorSnapshot(snapshot);
    setExportStatus("");
    reportHistoryDebug(
      `restore snapshot: bodies=${snapshot.bodies.length} entities=${snapshot.entities.length}`,
    );
    framePreview(snapshot.bodies, worldTimeRef.current);
  };
  const undoEditorChange = () => {
    const currentSnapshot = cloneMapLabEditorSnapshot(currentEditorSnapshot);
    const target = undoHistoryRef.current[undoHistoryRef.current.length - 1];

    if (!target || !currentSnapshot) {
      reportHistoryDebug(
        `undo skipped: target=${target ? "yes" : "no"} current=${currentSnapshot.bodies.length}`,
      );
      return;
    }

    reportHistoryDebug(
      `undo history: current=${currentSnapshot.bodies.length} -> restore=${target.bodies.length}`,
    );
    setUndoHistoryStack(
      undoHistoryRef.current.length === 0
        ? undoHistoryRef.current
        : undoHistoryRef.current.slice(0, -1),
    );
    setRedoHistoryStack(
      pushHistorySnapshot(redoHistoryRef.current, cloneMapLabEditorSnapshot(currentSnapshot)),
    );
    restoreEditorSnapshot(target);
  };
  const redoEditorChange = () => {
    const target = redoHistoryRef.current[redoHistoryRef.current.length - 1];
    const currentSnapshot = cloneMapLabEditorSnapshot(currentEditorSnapshot);

    if (!target || !currentSnapshot) {
      reportHistoryDebug(
        `redo skipped: target=${target ? "yes" : "no"} current=${currentSnapshot.bodies.length}`,
      );
      return;
    }

    reportHistoryDebug(
      `redo: current=${currentSnapshot.bodies.length} -> restore=${target.bodies.length}`,
    );
    setRedoHistoryStack(redoHistoryRef.current.slice(0, -1));
    setUndoHistoryStack(
      pushHistorySnapshot(undoHistoryRef.current, cloneMapLabEditorSnapshot(currentSnapshot)),
    );
    restoreEditorSnapshot(target);
  };
  const selectBody = (bodyId: string | null) => {
    setSelectedBodyId(bodyId);
    setActiveSelectionKind("body");
  };
  const selectEntity = (entityId: string | null) => {
    setSelectedEntityId(entityId);
    setActiveSelectionKind("entity");
  };
  const deleteSelectedBody = () => {
    if (!selectedBody) {
      return;
    }

    const beforeSnapshot = cloneMapLabEditorSnapshot(currentEditorSnapshot);
    const idsToRemove = collectBodySubtreeIds(normalizedBodies, selectedBody.id);
    const nextBodies = normalizedBodies.filter((body) => !idsToRemove.has(body.id));
    const nextEntities = normalizedEntities.filter(
      (entity) => !idsToRemove.has(entity.parentId),
    );
    const nextSpawnRoots = nextBodies.filter((body) => body.parentId === null && !body.hidden);
    const spawnSystemStillValid = nextSpawnRoots.some(
      (body) => body.systemId === spawnConfig.systemId,
    );
    historyInteractionRef.current = "manual-commit";
    const nextUndoHistory = pushHistorySnapshot(undoHistoryRef.current, beforeSnapshot);
    setUndoHistoryStack(nextUndoHistory);
    setRedoHistoryStack([]);
    skipNextAutomaticHistoryPushReasonRef.current = spawnSystemStillValid
      ? null
      : "skip auto history push after delete while spawn system is corrected";
    reportHistoryDebug(
      `delete body committed: before=${beforeSnapshot.bodies.length} after=${nextBodies.length} undo=${nextUndoHistory.length}`,
    );
    setBodies(nextBodies);
    setEntities(nextEntities);
    setSelectedBodyId(nextBodies[0]?.id ?? null);
    setSelectedEntityId(nextEntities[0]?.id ?? null);
    setActiveSelectionKind(nextBodies.length > 0 ? "body" : "entity");
    framePreview(nextBodies, worldTimeRef.current);
  };
  const deleteSelectedEntity = () => {
    if (!selectedEntity) {
      return;
    }

    const beforeSnapshot = cloneMapLabEditorSnapshot(currentEditorSnapshot);
    const nextEntities = normalizedEntities.filter(
      (entity) => entity.id !== selectedEntity.id,
    );
    historyInteractionRef.current = "manual-commit";
    const nextUndoHistory = pushHistorySnapshot(undoHistoryRef.current, beforeSnapshot);
    setUndoHistoryStack(nextUndoHistory);
    setRedoHistoryStack([]);
    reportHistoryDebug(
      `delete entity committed: before=${beforeSnapshot.entities.length} after=${nextEntities.length} undo=${nextUndoHistory.length}`,
    );
    setEntities(nextEntities);
    setSelectedEntityId(nextEntities[0]?.id ?? null);
    setActiveSelectionKind(nextEntities.length > 0 ? "entity" : "body");
  };
  const applyScenarioDefinitionToEditorState = (scenario: ScenarioDefinition) => {
    setScenarioId(scenario.id);
    setScenarioName(scenario.presentation.name);
    setScenarioDescription(scenario.presentation.description ?? "");
    setScenarioDifficulty(scenario.presentation.difficulty ?? "easy");
    setScenarioTagsText((scenario.presentation.tags ?? []).join(", "));
    setScenarioEyebrow(scenario.presentation.eyebrow ?? "");
    setScenarioAccentColor(scenario.presentation.accentColor ?? "#8ee8ff");
    setScenarioSortOrder(scenario.presentation.sortOrder ?? 100);
    setScenarioRuntimeLogicId(scenario.mission.runtime?.logicId ?? "none");
    setScenarioFactions(cloneScenarioJson(scenario.mission.factions));
    setScenarioControlNodes(cloneScenarioJson(scenario.mission.controlNodes ?? []));
    setScenarioSupportLinks(cloneScenarioJson(scenario.mission.supportLinks ?? []));
    setScenarioMarkers(cloneScenarioJson(scenario.mission.markers ?? []));
    setScenarioObjectives(cloneScenarioJson(scenario.mission.objectives));
    setScenarioBriefings(cloneScenarioJson(scenario.mission.briefings ?? []));
    setScenarioTriggers(cloneScenarioJson(scenario.mission.triggers ?? []));
    setScenarioInitialFlags(cloneScenarioJson(scenario.mission.initialFlags ?? {}));
    setScenarioEncounters(cloneScenarioJson(scenario.encounters ?? []));
    setScenarioAuthoringVersion(scenario.authoring?.version ?? 1);
    setScenarioAuthoringSummary(scenario.authoring?.summary ?? "");
    setScenarioDesignGoalsText((scenario.authoring?.designGoals ?? []).join("\n"));
    setScenarioPlaytestFocusText((scenario.authoring?.playtestFocus ?? []).join("\n"));
    setScenarioEditorHintsText((scenario.authoring?.editorHints ?? []).join("\n"));
    setScenarioAiPromptSeed(scenario.authoring?.aiPromptSeed ?? "");
    setScenarioNotesText((scenario.authoring?.notes ?? []).join("\n"));
  };
  const applyJsonArrayDraft = <T,>(
    label: string,
    draft: string,
    setter: (value: T[]) => void,
  ) => {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!Array.isArray(parsed)) {
        setExportStatus(`${label} must be a JSON array.`);
        return;
      }
      setter(parsed as T[]);
      setExportStatus(`${label} updated.`);
    } catch (error) {
      setExportStatus(
        `${label} JSON is invalid: ${error instanceof Error ? error.message : "parse failed"}`,
      );
    }
  };
  const applyJsonObjectDraft = <T extends Record<string, unknown>>(
    label: string,
    draft: string,
    setter: (value: T) => void,
  ) => {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        setExportStatus(`${label} must be a JSON object.`);
        return;
      }
      setter(parsed as T);
      setExportStatus(`${label} updated.`);
    } catch (error) {
      setExportStatus(
        `${label} JSON is invalid: ${error instanceof Error ? error.message : "parse failed"}`,
      );
    }
  };
  const loadPresetLayout = (nextPresetId: MapPresetId) => {
    const nextPreset = createPresetScenarioBundle(nextPresetId);
    scheduleHistoryReset(`load preset ${nextPresetId}`);
    setPresetId(nextPresetId);
    setSelectedLibraryScenarioId(nextPreset.scenario.id);
    setMapName(nextPreset.mapName);
    setMapDescription(nextPreset.mapDescription ?? "");
    setBodies(nextPreset.bodies);
    setEntities(nextPreset.entities);
    setSpawnConfig(nextPreset.spawn);
    applyScenarioDefinitionToEditorState(nextPreset.scenario);
    selectBody(nextPreset.bodies[0]?.id ?? null);
    setSelectedEntityId(nextPreset.entities[0]?.id ?? null);
    setWorldTimeSeconds(0);
    framePreview(nextPreset.bodies, 0);
    setExportStatus("");
  };
  const loadScenarioDefinition = (scenario: ScenarioDefinition) => {
    const nextScenario = cloneScenarioJson(scenario);
    scheduleHistoryReset(`load scenario ${nextScenario.id}`);
    setSelectedLibraryScenarioId(nextScenario.id);
    setMapName(nextScenario.map.name);
    setMapDescription(nextScenario.map.mapDescription ?? "");
    setBodies(cloneCelestialConfigs(nextScenario.map.celestialConfigs));
    setEntities(cloneDefenseConfigs(nextScenario.map.defenseConfigs));
    setSpawnConfig(cloneScenarioJson(nextScenario.map.spawn));
    applyScenarioDefinitionToEditorState(nextScenario);
    selectBody(nextScenario.map.celestialConfigs[0]?.id ?? null);
    setSelectedEntityId(nextScenario.map.defenseConfigs[0]?.id ?? null);
    setWorldTimeSeconds(0);
    framePreview(nextScenario.map.celestialConfigs, 0);
    setExportStatus(`Loaded scenario ${nextScenario.presentation.name}.`);
  };
  const loadSharedLayout = (layout: SharedMapLayout) => {
    scheduleHistoryReset(`load shared layout ${layout.name}`);
    setMapName(layout.name);
    setMapDescription(layout.mapDescription ?? "");
    setBodies(cloneCelestialConfigs(layout.celestialConfigs));
    setEntities(cloneDefenseConfigs(layout.defenseConfigs));
    setSpawnConfig({
      systemId: layout.spawn.systemId,
      orbitRadius: layout.spawn.orbitRadius,
      orbitDirection: layout.spawn.orbitDirection,
    });
    applyScenarioDefinitionToEditorState(createDefaultScenarioDefinition({
      scenarioName: layout.name,
      scenarioDescription:
        layout.mapDescription || "Authored scenario layered on a shared layout import.",
      mapName: layout.name,
      mapDescription: layout.mapDescription,
      bodies: layout.celestialConfigs,
      entities: layout.defenseConfigs,
      spawn: layout.spawn,
    }));
    setSelectedLibraryScenarioId("");
    selectBody(layout.celestialConfigs[0]?.id ?? null);
    setSelectedEntityId(layout.defenseConfigs[0]?.id ?? null);
    setWorldTimeSeconds(0);
    framePreview(layout.celestialConfigs, 0);
    setExportStatus("");
  };

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    const snapshot = cloneMapLabEditorSnapshot(currentEditorSnapshot);
    currentEditorSnapshotRef.current = snapshot;
    currentEditorSnapshotSignatureRef.current = currentEditorSnapshotSignature;

    if (!lastCommittedSnapshotSignatureRef.current) {
      lastCommittedSnapshotRef.current = snapshot;
      lastCommittedSnapshotSignatureRef.current = currentEditorSnapshotSignature;
      return;
    }

    if (resetHistoryOnNextSnapshotReasonRef.current) {
      const reason = resetHistoryOnNextSnapshotReasonRef.current;
      resetEditorHistoryNow(snapshot, currentEditorSnapshotSignature, reason);
      return;
    }

    if (historyInteractionRef.current === "applying") {
      lastCommittedSnapshotRef.current = snapshot;
      lastCommittedSnapshotSignatureRef.current = currentEditorSnapshotSignature;
      historyInteractionRef.current = "normal";
      return;
    }

    if (historyInteractionRef.current === "manual-commit") {
      lastCommittedSnapshotRef.current = snapshot;
      lastCommittedSnapshotSignatureRef.current = currentEditorSnapshotSignature;
      historyInteractionRef.current = "normal";
      return;
    }

    if (historyInteractionRef.current === "dragging-body") {
      lastCommittedSnapshotRef.current = snapshot;
      lastCommittedSnapshotSignatureRef.current = currentEditorSnapshotSignature;
      return;
    }

    if (lastCommittedSnapshotSignatureRef.current === currentEditorSnapshotSignature) {
      return;
    }

    const previousSnapshot = lastCommittedSnapshotRef.current;
    lastCommittedSnapshotRef.current = snapshot;
    lastCommittedSnapshotSignatureRef.current = currentEditorSnapshotSignature;

    if (!previousSnapshot) {
      return;
    }

    if (skipNextAutomaticHistoryPushReasonRef.current) {
      const reason = skipNextAutomaticHistoryPushReasonRef.current;
      skipNextAutomaticHistoryPushReasonRef.current = null;
      reportHistoryDebug(
        `skip automatic history push: ${reason} bodies=${snapshot.bodies.length} entities=${snapshot.entities.length}`,
      );
      return;
    }

    setUndoHistoryStack(
      pushHistorySnapshot(undoHistoryRef.current, cloneMapLabEditorSnapshot(previousSnapshot)),
    );
    setRedoHistoryStack([]);
  }, [currentEditorSnapshot, currentEditorSnapshotSignature]);

  useEffect(() => {
    if (!selectedBodyId && normalizedBodies.length > 0) {
      setSelectedBodyId(normalizedBodies[0].id);
      return;
    }

    if (selectedBodyId && normalizedBodies.every((body) => body.id !== selectedBodyId)) {
      setSelectedBodyId(normalizedBodies[0]?.id ?? null);
    }
  }, [normalizedBodies, selectedBodyId]);

  useEffect(() => {
    if (!selectedEntityId && normalizedEntities.length > 0) {
      setSelectedEntityId(normalizedEntities[0].id);
      return;
    }

    if (selectedEntityId && normalizedEntities.every((entity) => entity.id !== selectedEntityId)) {
      setSelectedEntityId(normalizedEntities[0]?.id ?? null);
    }
  }, [normalizedEntities, selectedEntityId]);

  useEffect(() => {
    if (spawnRootOptions.length === 0) {
      return;
    }

    if (spawnRootOptions.every((body) => body.systemId !== spawnConfig.systemId)) {
      setSpawnConfig((current) => ({
        ...current,
        systemId: spawnRootOptions[0]?.systemId ?? current.systemId,
      }));
    }
  }, [spawnConfig.systemId, spawnRootOptions]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    let disposed = false;
    const app = new Application();

    void app
      .init({
        width: INITIAL_PREVIEW_WIDTH,
        height: INITIAL_PREVIEW_HEIGHT,
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true, texture: false });
          return;
        }

        const host = hostRef.current;
        if (!host) {
          app.destroy(true, { children: true, texture: false });
          return;
        }

        const previewLayer = new Graphics();
        app.stage.addChild(previewLayer);
        host.replaceChildren(app.canvas);

        const nextSize = measurePreviewHost(host);
        resizePreviewApplication(app, nextSize);

        appRef.current = app;
        previewLayerRef.current = previewLayer;
        setPreviewSize(nextSize);
        setPreviewReady(true);
      });

    return () => {
      disposed = true;
      previewLayerRef.current = null;
      appRef.current = null;
      app.destroy(true, { children: true, texture: false });
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    let disposed = false;
    const app = new Application();

    void app
      .init({
        width: INITIAL_BODY_LAB_PREVIEW_WIDTH,
        height: INITIAL_BODY_LAB_PREVIEW_HEIGHT,
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true, texture: false });
          return;
        }

        const host = bodyLabHostRef.current;
        if (!host) {
          app.destroy(true, { children: true, texture: false });
          return;
        }

        const previewLayer = new Container();
        app.stage.addChild(previewLayer);
        host.replaceChildren(app.canvas);

        const nextSize = measureBodyLabHost(host);
        resizePreviewApplication(app, nextSize);

        bodyLabAppRef.current = app;
        bodyLabLayerRef.current = previewLayer;
        setBodyLabPreviewSize(nextSize);
        setBodyLabPreviewReady(true);
      });

    return () => {
      disposed = true;
      bodyLabLayerRef.current = null;
      bodyLabAppRef.current = null;
      app.destroy(true, { children: true, texture: false });
    };
  }, []);

  useEffect(() => {
    if (!previewReady || !hostRef.current || !appRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !appRef.current) {
        return;
      }

      const nextSize = {
        width: Math.max(420, Math.floor(entry.contentRect.width)),
        height: Math.max(320, Math.floor(entry.contentRect.height)),
      };
      resizePreviewApplication(appRef.current, nextSize);
      setPreviewSize(nextSize);
    });

    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
    };
  }, [previewReady]);

  useEffect(() => {
    if (!bodyLabPreviewReady || !bodyLabHostRef.current || !bodyLabAppRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !bodyLabAppRef.current) {
        return;
      }

      const nextSize = {
        width: Math.max(240, Math.floor(entry.contentRect.width)),
        height: Math.max(180, Math.floor(entry.contentRect.height)),
      };
      resizePreviewApplication(bodyLabAppRef.current, nextSize);
      setBodyLabPreviewSize(nextSize);
    });

    observer.observe(bodyLabHostRef.current);
    return () => {
      observer.disconnect();
    };
  }, [bodyLabPreviewReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isOpen) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoomMultiplier((value) =>
        clamp(value * zoomFactor, MAP_PREVIEW_MIN_ZOOM, MAP_PREVIEW_MAX_ZOOM),
      );
    };

    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      host.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isOpen) {
      return;
    }

    const finishInteraction = () => {
      const dragState = dragStateRef.current;
      if (dragState?.kind === "body") {
        const startedDragging = dragState.startedDragging;
        historyInteractionRef.current = "normal";
        if (startedDragging && dragHistoryStartSnapshotRef.current) {
          const startSnapshot = dragHistoryStartSnapshotRef.current;
          const startSignature = dragHistoryStartSignatureRef.current;
          const endSignature =
            lastCommittedSnapshotSignatureRef.current
            || currentEditorSnapshotSignatureRef.current;
          if (startSignature && endSignature && startSignature !== endSignature) {
            setUndoHistoryStack(
              pushHistorySnapshot(undoHistoryRef.current, cloneMapLabEditorSnapshot(startSnapshot)),
            );
            setRedoHistoryStack([]);
          }
        }
        dragHistoryStartSnapshotRef.current = null;
        dragHistoryStartSignatureRef.current = "";
      }
      dragStateRef.current = null;
      setInteractionMode("idle");
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const localPoint = getLocalPreviewPoint(host, event);
      const hit = findBodyHitAtScreenPoint(bodyScreenHitsRef.current, localPoint);

      if (hit) {
        selectBody(hit.id);
        const dragStartSnapshot =
          lastCommittedSnapshotRef.current
          ?? currentEditorSnapshotRef.current;
        dragHistoryStartSnapshotRef.current = dragStartSnapshot
          ? cloneMapLabEditorSnapshot(dragStartSnapshot)
          : null;
        dragHistoryStartSignatureRef.current =
          lastCommittedSnapshotSignatureRef.current
          || currentEditorSnapshotSignatureRef.current
          || "";
        historyInteractionRef.current = "dragging-body";
        dragStateRef.current = {
          kind: "body",
          pointerId: event.pointerId,
          bodyId: hit.id,
          startedDragging: false,
        };
        return;
      }

      dragStateRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanOffset: {
          x: panOffsetRef.current.x,
          y: panOffsetRef.current.y,
        },
        startedDragging: false,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      const camera = previewCameraRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || !camera) {
        return;
      }

      if (dragState.kind === "pan") {
        const deltaX = event.clientX - dragState.startClientX;
        const deltaY = event.clientY - dragState.startClientY;
        const movementSquared = deltaX * deltaX + deltaY * deltaY;

        if (!dragState.startedDragging && movementSquared < 25) {
          return;
        }

        dragState.startedDragging = true;
        setInteractionMode("panning");
        setPanOffset({
          x: dragState.startPanOffset.x - deltaX / camera.pixelsPerWorldUnit,
          y: dragState.startPanOffset.y - deltaY / camera.pixelsPerWorldUnit,
        });
        return;
      }

      const localPoint = getLocalPreviewPoint(host, event);
      const previewSize = previewSizeRef.current;
      const rawWorldPoint = screenToWorldPoint(localPoint, previewSize, camera);
      const snappedWorldPoint = snapToGrid
        ? snapWorldPointToGrid(rawWorldPoint, chooseGridSpacing(camera.pixelsPerWorldUnit))
        : rawWorldPoint;

      dragState.startedDragging = true;
      setInteractionMode("dragging-body");
      setBodies((previousBodies) =>
        repositionBodyByWorldPoint(
          previousBodies,
          dragState.bodyId,
          snappedWorldPoint,
          previewPoseRef.current,
          worldTimeRef.current,
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      finishInteraction();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      finishInteraction();
    };

    host.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      host.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      finishInteraction();
    };
  }, [isOpen, snapToGrid]);

  useEffect(() => {
    if (!isOpen || !isPlaying) {
      return;
    }

    let animationFrame = 0;
    let lastFrame = performance.now();

    const tick = (now: number) => {
      const deltaSeconds = Math.min(1 / 12, (now - lastFrame) / 1000);
      lastFrame = now;
      setWorldTimeSeconds((value) => value + deltaSeconds);
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isOpen, isPlaying]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);

      if (event.key === "Escape") {
        closeMapEditor();
        return;
      }

      const usesModifier = event.metaKey || event.ctrlKey;
      if (usesModifier && event.key.toLowerCase() === "z" && !isTypingTarget) {
        event.preventDefault();
        if (event.shiftKey) {
          redoEditorChange();
          return;
        }
        undoEditorChange();
        return;
      }

      if (usesModifier && event.key.toLowerCase() === "y" && !isTypingTarget) {
        event.preventDefault();
        redoEditorChange();
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (activeSelectionKind === "entity" && selectedEntity) {
          deleteSelectedEntity();
          return;
        }
        if (selectedBody) {
          deleteSelectedBody();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSelectionKind, isOpen, redoEditorChange, selectedBody, selectedEntity, undoEditorChange]);

  useEffect(() => {
    const previewLayer = previewLayerRef.current;
    if (!previewLayer || previewSize.width <= 0 || previewSize.height <= 0) {
      return;
    }

    previewLayer.removeChildren().forEach((child) => {
      child.destroy();
    });

    if (normalizedBodies.length === 0) {
      return;
    }

    const ephemeris = createCelestialEphemeris(normalizedBodies);
    const evaluator = createCelestialStateEvaluator(ephemeris);
    const state = evaluator.evaluate(worldTimeSeconds);
    const entityState = evaluateMapLabEntityState(
      normalizedEntities,
      state,
      worldTimeSeconds,
    );
    previewPoseRef.current = state;
    const camera = resolvePreviewCamera(
      cameraReferenceBounds,
      previewSize,
      zoomMultiplier,
      panOffset,
    );
    previewCameraRef.current = camera;
    const screenHits: BodyScreenHit[] = [];

    if (showGrid) {
      const grid = new Graphics();
      drawPreviewGrid(grid, previewSize, camera);
      previewLayer.addChild(grid);
    }

    if (showOrbitPaths) {
      const orbitOverlay = new Graphics();
      drawOrbitPaths(orbitOverlay, normalizedBodies, state, previewSize, camera);
      previewLayer.addChild(orbitOverlay);
    }

    for (const body of normalizedBodies) {
      const pose = state.get(body.id);
      if (!pose) {
        continue;
      }

      const sprite = createCelestialSprite(body, { renderStage: "full" });
      decorateRefuelBodySprite(sprite, {
        bodyRadius: body.radius,
        refuelRange: body.refuelRange,
        refuelLaneRadius: body.refuelLaneRadius,
        refuelLaneThickness: body.refuelLaneThickness,
      });
      const screenPosition = toScreenPoint(pose.position, previewSize, camera);
      sprite.position.set(screenPosition.x, screenPosition.y);
      sprite.scale.set(camera.pixelsPerWorldUnit);
      previewLayer.addChild(sprite);
      screenHits.push({
        id: body.id,
        screenPosition,
        hitRadius: Math.max(body.radius * camera.pixelsPerWorldUnit + 6, 16),
      });
    }
    bodyScreenHitsRef.current = screenHits;

    const spawnRoot = spawnRootOptions.find(
      (body) => body.systemId === spawnConfig.systemId,
    );
    if (spawnRoot) {
      const spawnRootPose = state.get(spawnRoot.id);
      if (spawnRootPose) {
        const spawnWorldPosition = {
          x: spawnRootPose.position.x,
          y: spawnRootPose.position.y - spawnConfig.orbitRadius,
        };
        const spawnMarker = new Graphics();
        drawMapSpawnMarker(
          spawnMarker,
          toScreenPoint(spawnWorldPosition, previewSize, camera),
          spawnConfig.orbitDirection,
        );
        previewLayer.addChild(spawnMarker);

        if (showLabels) {
          const label = new Text({
            text: "SPAWN",
            style: {
              fill: "#dbfff3",
              fontFamily: "Menlo, Monaco, monospace",
              fontSize: 10,
            },
          });
          const screenPosition = toScreenPoint(spawnWorldPosition, previewSize, camera);
          label.anchor.set(0.5, 0);
          label.position.set(screenPosition.x, screenPosition.y + 14);
          previewLayer.addChild(label);
        }
      }
    }

    for (const entity of normalizedEntities) {
      const pose = entityState.get(entity.id);
      if (!pose) {
        continue;
      }

      const entityGraphic = new Graphics();
      drawMapEntityMarker(
        entityGraphic,
        entity,
        toScreenPoint(pose.position, previewSize, camera),
        camera.pixelsPerWorldUnit,
      );
      previewLayer.addChild(entityGraphic);
    }

    if (selectedBody) {
      const selectionPose = state.get(selectedBody.id);
      if (selectionPose) {
        const selectionRing = new Graphics();
        const screenPosition = toScreenPoint(selectionPose.position, previewSize, camera);
        selectionRing
          .circle(
            screenPosition.x,
            screenPosition.y,
            selectedBody.radius * camera.pixelsPerWorldUnit + 9,
          )
          .stroke({
            color: 0x8ee8ff,
            width: 2,
            alpha: 0.9,
          });
        previewLayer.addChild(selectionRing);
      }
    }

    if (selectedEntity) {
      const selectionPose = entityState.get(selectedEntity.id);
      if (selectionPose) {
        const selectionRing = new Graphics();
        const screenPosition = toScreenPoint(selectionPose.position, previewSize, camera);
        selectionRing
          .circle(
            screenPosition.x,
            screenPosition.y,
            Math.max(selectedEntity.radius * camera.pixelsPerWorldUnit + 10, 14),
          )
          .stroke({
            color: 0x8effba,
            width: 2,
            alpha: 0.92,
          });
        previewLayer.addChild(selectionRing);
      }
    }

    if (showLabels) {
      for (const body of normalizedBodies) {
        const pose = state.get(body.id);
        if (!pose) {
          continue;
        }

        const label = new Text({
          text: body.name,
          style: {
            fill: "#dff7ff",
            fontFamily: "Menlo, Monaco, monospace",
            fontSize: 11,
          },
        });
        const screenPosition = toScreenPoint(pose.position, previewSize, camera);
        label.anchor.set(0.5, 1);
        label.position.set(
          screenPosition.x,
          screenPosition.y - body.radius * camera.pixelsPerWorldUnit - 10,
        );
        previewLayer.addChild(label);
      }

      for (const entity of normalizedEntities) {
        const pose = entityState.get(entity.id);
        if (!pose) {
          continue;
        }

        const label = new Text({
          text: entity.name,
          style: {
            fill: "#eaffef",
            fontFamily: "Menlo, Monaco, monospace",
            fontSize: 10,
          },
        });
        const screenPosition = toScreenPoint(pose.position, previewSize, camera);
        label.anchor.set(0.5, 0);
        label.position.set(
          screenPosition.x,
          screenPosition.y + Math.max(entity.radius * camera.pixelsPerWorldUnit + 8, 12),
        );
        previewLayer.addChild(label);
      }
    }
  }, [
    normalizedBodies,
    normalizedEntities,
    previewSize,
    selectedBody,
    selectedEntity,
    showGrid,
    showLabels,
    showOrbitPaths,
    spawnConfig,
    spawnRootOptions,
    worldTimeSeconds,
    zoomMultiplier,
    panOffset,
    cameraReferenceBounds,
  ]);

  useEffect(() => {
    const previewLayer = bodyLabLayerRef.current;
    if (!previewLayer || bodyLabPreviewSize.width <= 0 || bodyLabPreviewSize.height <= 0) {
      return;
    }

    previewLayer.removeChildren().forEach((child) => {
      child.destroy();
    });

    if (!selectedBody) {
      return;
    }

    const backdrop = new Graphics();
    drawBodyLabBackdrop(backdrop, bodyLabPreviewSize);
    previewLayer.addChild(backdrop);

    const previewBody = {
      ...selectedBody,
      hidden: false,
    };
    const sprite = createCelestialSprite(previewBody, {
      renderStage: selectedBodyRenderStage,
    });
    decorateRefuelBodySprite(sprite, {
      bodyRadius: previewBody.radius,
      refuelRange: previewBody.refuelRange,
      refuelLaneRadius: previewBody.refuelLaneRadius,
      refuelLaneThickness: previewBody.refuelLaneThickness,
      showServiceRadius: false,
    });
    const fitRadius = Math.min(bodyLabPreviewSize.width, bodyLabPreviewSize.height) * 0.27;
    const scale = clamp(
      (fitRadius / Math.max(selectedBody.radius, 1)) * selectedBodyPreviewZoom,
      0.2,
      8,
    );
    sprite.position.set(bodyLabPreviewSize.width / 2, bodyLabPreviewSize.height / 2);
    sprite.scale.set(scale);
    sprite.rotation = (selectedBodyRotationDegrees * Math.PI) / 180;
    previewLayer.addChild(sprite);

    const frame = new Graphics();
    drawBodyLabFrame(
      frame,
      bodyLabPreviewSize,
      fitRadius * clamp(selectedBodyPreviewZoom, 0.8, 1.55),
    );
    previewLayer.addChild(frame);
  }, [
    bodyLabPreviewSize,
    selectedBody,
    selectedBodyPreviewZoom,
    selectedBodyRenderStage,
    selectedBodyRotationDegrees,
  ]);

  if (!import.meta.env.DEV) {
    return null;
  }

  const parentOptions = normalizedBodies.filter((body) => !selectedSubtreeIds.has(body.id));
  const entityParentOptions = normalizedBodies;
  const activeSelectionEditor =
    activeSelectionKind === "entity" && selectedEntity ? "entity" : "body";
  const activeScenarioJsonEditor = (() => {
    switch (scenarioJsonEditor) {
      case "factions":
        return {
          title: "Factions JSON",
          draft: scenarioFactionsDraft,
          setDraft: setScenarioFactionsDraft,
          apply: () => {
            applyJsonArrayDraft("Factions", scenarioFactionsDraft, setScenarioFactions);
          },
          meta: `${scenarioFactions.length} factions. Use this for team ownership, labels, and faction-level presentation.`,
        };
      case "control-nodes":
        return {
          title: "Control Nodes JSON",
          draft: scenarioControlNodesDraft,
          setDraft: setScenarioControlNodesDraft,
          apply: () => {
            applyJsonArrayDraft(
              "Control nodes",
              scenarioControlNodesDraft,
              setScenarioControlNodes,
            );
          },
          meta: `${scenarioControlNodes.length} control nodes. Use these for capture points, relays, and other strategic ownership anchors.`,
        };
      case "support-links":
        return {
          title: "Support Links JSON",
          draft: scenarioSupportLinksDraft,
          setDraft: setScenarioSupportLinksDraft,
          apply: () => {
            applyJsonArrayDraft(
              "Support links",
              scenarioSupportLinksDraft,
              setScenarioSupportLinks,
            );
          },
          meta: `${scenarioSupportLinks.length} support links. This is where system-to-system defense relationships live.`,
        };
      case "markers":
        return {
          title: "Markers JSON",
          draft: scenarioMarkersDraft,
          setDraft: setScenarioMarkersDraft,
          apply: () => {
            applyJsonArrayDraft("Markers", scenarioMarkersDraft, setScenarioMarkers);
          },
          meta: `${scenarioMarkers.length} markers. Use these for gates, approach rings, lane holds, and scripted map callouts.`,
        };
      case "objectives":
        return {
          title: "Objectives JSON",
          draft: scenarioObjectivesDraft,
          setDraft: setScenarioObjectivesDraft,
          apply: () => {
            applyJsonArrayDraft(
              "Objectives",
              scenarioObjectivesDraft,
              setScenarioObjectives,
            );
          },
          meta: `${scenarioObjectives.length} objectives. This is the main mission progression list.`,
        };
      case "briefings":
        return {
          title: "Briefings JSON",
          draft: scenarioBriefingsDraft,
          setDraft: setScenarioBriefingsDraft,
          apply: () => {
            applyJsonArrayDraft(
              "Briefings",
              scenarioBriefingsDraft,
              setScenarioBriefings,
            );
          },
          meta: `${scenarioBriefings.length} briefing blocks. Use these for start cards, comms moments, and authored instruction beats.`,
        };
      case "triggers":
        return {
          title: "Triggers JSON",
          draft: scenarioTriggersDraft,
          setDraft: setScenarioTriggersDraft,
          apply: () => {
            applyJsonArrayDraft("Triggers", scenarioTriggersDraft, setScenarioTriggers);
          },
          meta: `${scenarioTriggers.length} triggers. Use these for flag flips, objective changes, and scripted reactions.`,
        };
      case "initial-flags":
        return {
          title: "Initial Flags JSON",
          draft: scenarioInitialFlagsDraft,
          setDraft: setScenarioInitialFlagsDraft,
          apply: () => {
            applyJsonObjectDraft(
              "Initial flags",
              scenarioInitialFlagsDraft,
              setScenarioInitialFlags as (value: Record<string, unknown>) => void,
            );
          },
          meta: `${Object.keys(scenarioInitialFlags).length} initial flags. Use these for scenario state that does not belong in physical map data.`,
        };
      case "encounters":
        return {
          title: "Encounters JSON",
          draft: scenarioEncountersDraft,
          setDraft: setScenarioEncountersDraft,
          apply: () => {
            applyJsonArrayDraft(
              "Encounter groups",
              scenarioEncountersDraft,
              setScenarioEncounters,
            );
          },
          meta: `${scenarioEncounters.length} encounter groups. Keep enemy compositions and spawn-group structure here while the map stays reusable.`,
        };
    }
  })();

  return (
    <>
      <div className={`map-sandbox-overlay${isOpen ? " map-sandbox-overlay--open" : ""}`}>
        <section className="map-sandbox" aria-hidden={!isOpen}>
          <header className="map-sandbox__header">
            <div>
              <div className="map-sandbox__title">Map Lab</div>
              <div className="map-sandbox__meta">
                Dev-only scenario editor for celestial layouts, spawn setup, gameplay sites, and mission-layer data.
              </div>
            </div>
            <div className="map-sandbox__header-actions">
              <button
                type="button"
                className="map-sandbox__button"
                onClick={() => {
                  loadPresetLayout(presetId);
                }}
              >
                Reset to Preset
              </button>
              <button
                type="button"
                className="map-sandbox__button"
                onClick={() => {
                  closeMapEditor();
                }}
              >
                Close
              </button>
            </div>
          </header>
          <div className="map-sandbox__body">
            <aside className="map-sandbox__sidebar">
              <div className="map-sandbox__sidebar-tabs" role="tablist" aria-label="Map Lab sidebar panels">
                <button
                  type="button"
                  className={`map-sandbox__sidebar-tab${sidebarPanel === "world" ? " map-sandbox__sidebar-tab--active" : ""}`}
                  onClick={() => {
                    setSidebarPanel("world");
                  }}
                >
                  World
                </button>
                <button
                  type="button"
                  className={`map-sandbox__sidebar-tab${sidebarPanel === "selection" ? " map-sandbox__sidebar-tab--active" : ""}`}
                  onClick={() => {
                    setSidebarPanel("selection");
                  }}
                >
                  Selection
                </button>
                <button
                  type="button"
                  className={`map-sandbox__sidebar-tab${sidebarPanel === "scenario" ? " map-sandbox__sidebar-tab--active" : ""}`}
                  onClick={() => {
                    setSidebarPanel("scenario");
                  }}
                >
                  Scenario
                </button>
                <button
                  type="button"
                  className={`map-sandbox__sidebar-tab${sidebarPanel === "output" ? " map-sandbox__sidebar-tab--active" : ""}`}
                  onClick={() => {
                    setSidebarPanel("output");
                  }}
                >
                  Output
                </button>
              </div>

              {sidebarPanel === "world" ? (
              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Layout</div>
                <div className="map-sandbox__inline">
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={() => {
                      loadSharedLayout(MAP_LAB_SHARED_LAYOUT);
                    }}
                  >
                    Load Shared File
                  </button>
                </div>
                <div className="map-sandbox__double">
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Scenario Library</span>
                    <select
                      className="map-sandbox__select"
                      value={selectedLibraryScenarioId}
                      onChange={(event) => {
                        setSelectedLibraryScenarioId(event.target.value);
                      }}
                    >
                      <option value="">Select scenario</option>
                      {scenarioLibraryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Load Scenario</span>
                    <button
                      type="button"
                      className="map-sandbox__button"
                      disabled={!selectedLibraryScenarioId}
                      onClick={() => {
                        const scenario = SCENARIO_DEFINITIONS[selectedLibraryScenarioId];
                        if (!scenario) {
                          setExportStatus("Select a scenario from the library first.");
                          return;
                        }
                        loadScenarioDefinition(scenario);
                      }}
                    >
                      Load Scenario File
                    </button>
                  </div>
                </div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Layout Name</span>
                  <input
                    className="map-sandbox__input"
                    value={mapName}
                    onChange={(event) => {
                      setMapName(event.target.value);
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Layout Description</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={mapDescription}
                    onChange={(event) => {
                      setMapDescription(event.target.value);
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Preset</span>
                  <select
                    className="map-sandbox__select"
                    value={presetId}
                    onChange={(event) => {
                      loadPresetLayout(event.target.value as MapPresetId);
                    }}
                  >
                    {MAP_PRESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="map-sandbox__stats">
                  <span>{normalizedBodies.length} bodies</span>
                  <span>{normalizedEntities.length} entities</span>
                  <span>{scenarioObjectives.length} objectives</span>
                  <span>{scenarioMarkers.length} markers</span>
                  <span>{distinctSystemCount} systems</span>
                  <span>{worldTimeSeconds.toFixed(1)}s preview</span>
                </div>
                <div className="map-sandbox__meta">
                  Scenario file target: `src/game/scenarios/authored/&lt;scenario&gt;.ts`
                </div>
              </section>
              ) : null}

              {sidebarPanel === "scenario" ? (
              <>
              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Scenario</div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Scenario Name</span>
                  <input
                    className="map-sandbox__input"
                    value={scenarioName}
                    onChange={(event) => {
                      setScenarioName(event.target.value);
                    }}
                  />
                </label>
                <div className="map-sandbox__double">
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Scenario ID</span>
                    <input
                      className="map-sandbox__input"
                      value={scenarioId}
                      onChange={(event) => {
                        setScenarioId(event.target.value);
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Difficulty</span>
                    <select
                      className="map-sandbox__select"
                      value={scenarioDifficulty}
                      onChange={(event) => {
                        setScenarioDifficulty(event.target.value as MissionDifficulty);
                      }}
                    >
                      {SCENARIO_DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Scenario Description</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={scenarioDescription}
                    onChange={(event) => {
                      setScenarioDescription(event.target.value);
                    }}
                  />
                </label>
                <div className="map-sandbox__double">
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Eyebrow</span>
                    <input
                      className="map-sandbox__input"
                      value={scenarioEyebrow}
                      onChange={(event) => {
                        setScenarioEyebrow(event.target.value);
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Sort Order</span>
                    <input
                      className="map-sandbox__input"
                      type="number"
                      value={scenarioSortOrder}
                      onChange={(event) => {
                        setScenarioSortOrder(
                          parseFiniteNumber(event.target.value, scenarioSortOrder),
                        );
                      }}
                    />
                  </label>
                </div>
                <div className="map-sandbox__double">
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Accent Color</span>
                    <div className="map-sandbox__inline">
                      <input
                        className="map-sandbox__color"
                        type="color"
                        value={normalizeHexColor(scenarioAccentColor)}
                        onChange={(event) => {
                          setScenarioAccentColor(event.target.value);
                        }}
                      />
                      <input
                        className="map-sandbox__input"
                        value={scenarioAccentColor}
                        onChange={(event) => {
                          setScenarioAccentColor(event.target.value);
                        }}
                      />
                    </div>
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Runtime Logic</span>
                    <select
                      className="map-sandbox__select"
                      value={scenarioRuntimeLogicId}
                      onChange={(event) => {
                        setScenarioRuntimeLogicId(
                          event.target.value as MissionRuntimeLogicId,
                        );
                      }}
                    >
                      {SCENARIO_RUNTIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Tags</span>
                  <input
                    className="map-sandbox__input"
                    value={scenarioTagsText}
                    onChange={(event) => {
                      setScenarioTagsText(event.target.value);
                    }}
                  />
                </label>
                <div className="map-sandbox__meta">
                  This is the top-level playable scenario identity. The map layout below is now only one layer inside it.
                </div>
              </section>

              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Authoring Notes</div>
                <div className="map-sandbox__double">
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Version</span>
                    <input
                      className="map-sandbox__input"
                      type="number"
                      value={scenarioAuthoringVersion}
                      onChange={(event) => {
                        setScenarioAuthoringVersion(
                          Math.max(1, parseFiniteNumber(event.target.value, scenarioAuthoringVersion)),
                        );
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">AI Prompt Seed</span>
                    <input
                      className="map-sandbox__input"
                      value={scenarioAiPromptSeed}
                      onChange={(event) => {
                        setScenarioAiPromptSeed(event.target.value);
                      }}
                    />
                  </label>
                </div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Summary</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={scenarioAuthoringSummary}
                    onChange={(event) => {
                      setScenarioAuthoringSummary(event.target.value);
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Design Goals</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={scenarioDesignGoalsText}
                    onChange={(event) => {
                      setScenarioDesignGoalsText(event.target.value);
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Playtest Focus</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={scenarioPlaytestFocusText}
                    onChange={(event) => {
                      setScenarioPlaytestFocusText(event.target.value);
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Editor Hints</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={scenarioEditorHintsText}
                    onChange={(event) => {
                      setScenarioEditorHintsText(event.target.value);
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Notes</span>
                  <textarea
                    className="map-sandbox__textarea map-sandbox__textarea--compact"
                    value={scenarioNotesText}
                    onChange={(event) => {
                      setScenarioNotesText(event.target.value);
                    }}
                  />
                </label>
                <div className="map-sandbox__meta">
                  Use these fields for iteration goals, playtest reminders, and AI-guided design prompts.
                </div>
              </section>

              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Mission Data</div>
                <div className="map-sandbox__stats">
                  <span>{scenarioFactions.length} factions</span>
                  <span>{scenarioControlNodes.length} control nodes</span>
                  <span>{scenarioSupportLinks.length} support links</span>
                  <span>{scenarioMarkers.length} markers</span>
                  <span>{scenarioObjectives.length} objectives</span>
                  <span>{scenarioEncounters.length} encounters</span>
                </div>
                <div className="map-sandbox__meta">
                  First pass: the strategic scenario layers live in structured JSON editors here, while the physical map stays graphical.
                </div>
                <div className="map-sandbox__tab-strip">
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "objectives" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("objectives");
                    }}
                  >
                    Objectives
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "markers" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("markers");
                    }}
                  >
                    Markers
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "triggers" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("triggers");
                    }}
                  >
                    Triggers
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "briefings" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("briefings");
                    }}
                  >
                    Briefings
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "factions" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("factions");
                    }}
                  >
                    Factions
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "control-nodes" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("control-nodes");
                    }}
                  >
                    Nodes
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "support-links" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("support-links");
                    }}
                  >
                    Links
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "initial-flags" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("initial-flags");
                    }}
                  >
                    Flags
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${scenarioJsonEditor === "encounters" ? " map-sandbox__tab-button--active" : ""}`}
                    onClick={() => {
                      setScenarioJsonEditor("encounters");
                    }}
                  >
                    Encounters
                  </button>
                </div>
                <div className="map-sandbox__section-header">
                  <div className="map-sandbox__section-title">{activeScenarioJsonEditor.title}</div>
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={activeScenarioJsonEditor.apply}
                  >
                    Apply
                  </button>
                </div>
                <div className="map-sandbox__meta">{activeScenarioJsonEditor.meta}</div>
                <textarea
                  className="map-sandbox__textarea map-sandbox__textarea--json"
                  value={activeScenarioJsonEditor.draft}
                  onChange={(event) => {
                    activeScenarioJsonEditor.setDraft(event.target.value);
                  }}
                />
              </section>
              </>
              ) : null}

              {sidebarPanel === "world" ? (
              <>
              <section className="map-sandbox__section">
                <div className="map-sandbox__section-header">
                  <div className="map-sandbox__section-title">Bodies</div>
                  <div className="map-sandbox__inline">
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={() => {
                        const nextBodies = [
                          ...normalizedBodies,
                          createRootBodyConfig(normalizedBodies),
                        ];
                        setBodies(nextBodies);
                        selectBody(nextBodies[nextBodies.length - 1]?.id ?? null);
                        framePreview(nextBodies, worldTimeRef.current);
                      }}
                    >
                      Add Root
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={() => {
                        const parent = selectedBody ?? normalizedBodies[0] ?? null;
                        if (!parent) {
                          return;
                        }

                        const nextBodies = [
                          ...normalizedBodies,
                          createOrbiterBodyConfig(normalizedBodies, parent),
                        ];
                        setBodies(nextBodies);
                        selectBody(nextBodies[nextBodies.length - 1]?.id ?? null);
                        framePreview(nextBodies, worldTimeRef.current);
                      }}
                    >
                      Add Orbiter
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={() => {
                        const parent = selectedBody ?? normalizedBodies[0] ?? null;
                        if (!parent) {
                          return;
                        }

                        const nextBodies = [
                          ...normalizedBodies,
                          createRefuelBodyConfig(normalizedBodies, parent),
                        ];
                        setBodies(nextBodies);
                        selectBody(nextBodies[nextBodies.length - 1]?.id ?? null);
                        framePreview(nextBodies, worldTimeRef.current);
                      }}
                    >
                      Add Refuel Body
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button map-sandbox__button--danger"
                      disabled={!selectedBody}
                      onClick={deleteSelectedBody}
                    >
                      Delete Selected
                    </button>
                  </div>
                </div>
                <div className="map-sandbox__body-list">
                  {normalizedBodies.map((body) => (
                    <button
                      key={body.id}
                      type="button"
                      className={`map-sandbox__body-row${body.id === selectedBody?.id ? " map-sandbox__body-row--selected" : ""}`}
                      onClick={() => {
                        selectBody(body.id);
                      }}
                    >
                      <span className="map-sandbox__body-row-title">{body.name}</span>
                      <span className="map-sandbox__body-row-meta">
                        {body.parentId === null
                          ? (body.refuelLaneRadius ?? 0) > 0
                            ? `${body.systemId} fuel lane world`
                            : `${body.systemId} root`
                          : (body.refuelLaneRadius ?? 0) > 0
                            ? `fuel lane around ${body.parentId}`
                            : body.refuelRange
                            ? `refuel orbit around ${body.parentId}`
                            : `orbiting ${body.parentId}`}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="map-sandbox__meta">
                  Use `Delete` or `Backspace` to remove the selected body.
                </div>
              </section>

              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Spawn</div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Spawn System</span>
                  <select
                    className="map-sandbox__select"
                    value={spawnConfig.systemId}
                    onChange={(event) => {
                      setSpawnConfig((current) => ({
                        ...current,
                        systemId: event.target.value,
                      }));
                    }}
                  >
                    {spawnRootOptions.map((body) => (
                      <option key={body.id} value={body.systemId}>
                        {body.name} ({body.systemId})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Spawn Orbit Radius</span>
                  <input
                    className="map-sandbox__input"
                    type="number"
                    value={spawnConfig.orbitRadius}
                    onChange={(event) => {
                      setSpawnConfig((current) => ({
                        ...current,
                        orbitRadius: Math.max(
                          0,
                          parseFiniteNumber(event.target.value, current.orbitRadius),
                        ),
                      }));
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Coasting Direction</span>
                  <select
                    className="map-sandbox__select"
                    value={spawnConfig.orbitDirection}
                    onChange={(event) => {
                      setSpawnConfig((current) => ({
                        ...current,
                        orbitDirection: event.target.value as "cw" | "ccw",
                      }));
                    }}
                  >
                    <option value="cw">Clockwise</option>
                    <option value="ccw">Counterclockwise</option>
                  </select>
                </label>
                <div className="map-sandbox__meta">
                  Current spawn wiring uses system, orbit radius, and orbital direction. The preview
                  shows a green marker plus tangent arrow above the selected root body.
                </div>
              </section>

              <section className="map-sandbox__section">
                <div className="map-sandbox__section-header">
                  <div className="map-sandbox__section-title">Gameplay Entities</div>
                  <div className="map-sandbox__inline">
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={() => {
                        const nextEntity = createGameplayEntityConfig(
                          normalizedEntities,
                          normalizedBodies,
                          selectedBody?.id ?? normalizedBodies[0]?.id ?? null,
                          "torpedo",
                        );
                        if (!nextEntity) {
                          return;
                        }

                        setEntities([...normalizedEntities, nextEntity]);
                        selectEntity(nextEntity.id);
                      }}
                    >
                      Add Launcher
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={() => {
                        const nextEntity = createGameplayEntityConfig(
                          normalizedEntities,
                          normalizedBodies,
                          selectedBody?.id ?? normalizedBodies[0]?.id ?? null,
                          "beam",
                        );
                        if (!nextEntity) {
                          return;
                        }

                        setEntities([...normalizedEntities, nextEntity]);
                        selectEntity(nextEntity.id);
                      }}
                    >
                      Add Beam
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={() => {
                        const nextEntity = createGameplayEntityConfig(
                          normalizedEntities,
                          normalizedBodies,
                          selectedBody?.id ?? normalizedBodies[0]?.id ?? null,
                          "target",
                        );
                        if (!nextEntity) {
                          return;
                        }

                        setEntities([...normalizedEntities, nextEntity]);
                        selectEntity(nextEntity.id);
                      }}
                    >
                      Add Target
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button map-sandbox__button--danger"
                      disabled={!selectedEntity}
                      onClick={deleteSelectedEntity}
                    >
                      Delete Selected
                    </button>
                  </div>
                </div>
                <div className="map-sandbox__body-list">
                  {normalizedEntities.length > 0 ? normalizedEntities.map((entity) => (
                    <button
                      key={entity.id}
                      type="button"
                      className={`map-sandbox__body-row${entity.id === selectedEntity?.id ? " map-sandbox__body-row--selected" : ""}`}
                      onClick={() => {
                        selectEntity(entity.id);
                      }}
                    >
                      <span className="map-sandbox__body-row-title">{entity.name}</span>
                      <span className="map-sandbox__body-row-meta">
                        {entity.weaponType === "station" && entity.refuelPerSecond
                          ? `fuel station on ${entity.parentId}`
                          : entity.weaponType === "target"
                            ? `dummy target on ${entity.parentId}`
                          : `${entity.weaponType} on ${entity.parentId}`}
                      </span>
                    </button>
                  )) : (
                    <div className="map-sandbox__meta">
                      No gameplay entities yet. Add launchers, beams, dummy targets, or fuel stations here.
                    </div>
                  )}
                </div>
                <div className="map-sandbox__meta">
                  Use `Delete` or `Backspace` to remove the selected gameplay entity.
                </div>
              </section>
              </>
              ) : null}

              {sidebarPanel === "selection" ? (
              <>
              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Selection</div>
                <div className="map-sandbox__tab-strip">
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${activeSelectionEditor === "body" ? " map-sandbox__tab-button--active" : ""}`}
                    disabled={!selectedBody}
                    onClick={() => {
                      if (selectedBody) {
                        selectBody(selectedBody.id);
                      }
                    }}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    className={`map-sandbox__tab-button${activeSelectionEditor === "entity" ? " map-sandbox__tab-button--active" : ""}`}
                    disabled={!selectedEntity}
                    onClick={() => {
                      if (selectedEntity) {
                        selectEntity(selectedEntity.id);
                      }
                    }}
                  >
                    Entity
                  </button>
                </div>
                <div className="map-sandbox__meta">
                  Focus on one editable object at a time here instead of showing every inspector in the sidebar at once.
                </div>
              </section>

              {activeSelectionEditor === "body" && selectedBody ? (
                <section className="map-sandbox__section">
                  <div className="map-sandbox__section-header">
                    <div className="map-sandbox__section-title">Selected Body</div>
                    <button
                      type="button"
                      className="map-sandbox__button map-sandbox__button--danger"
                      onClick={deleteSelectedBody}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="map-sandbox__body-lab">
                    <div className="map-sandbox__preview-mode-switch" role="tablist" aria-label="Selected body preview mode">
                      <button
                        type="button"
                        className={`map-sandbox__preview-mode-button${effectiveSelectedBodyPreviewMode === "body" ? " map-sandbox__preview-mode-button--active" : ""}`}
                        onClick={() => {
                          setSelectedBodyPreviewMode("body");
                        }}
                      >
                        Body
                      </button>
                      <button
                        type="button"
                        className={`map-sandbox__preview-mode-button${effectiveSelectedBodyPreviewMode === "orbit" ? " map-sandbox__preview-mode-button--active" : ""}`}
                        disabled={!selectedBodyParent}
                        onClick={() => {
                          if (selectedBodyParent) {
                            setSelectedBodyPreviewMode("orbit");
                          }
                        }}
                      >
                        Orbit
                      </button>
                    </div>
                    <div className="map-sandbox__body-lab-preview-shell">
                      <div
                        ref={bodyLabHostRef}
                        className={`map-sandbox__body-lab-preview${effectiveSelectedBodyPreviewMode === "orbit" ? " map-sandbox__body-lab-preview--hidden" : ""}`}
                      />
                      {effectiveSelectedBodyPreviewMode === "orbit" && selectedBodyOrbitPreview && selectedBodyParent ? (
                        <svg
                          className="map-sandbox__orbit-preview"
                          viewBox={selectedBodyOrbitPreview.viewBox}
                          preserveAspectRatio="xMidYMid meet"
                          aria-hidden="true"
                        >
                          <path
                            d={selectedBodyOrbitPreview.orbitPath}
                            fill="none"
                            stroke="rgba(160, 228, 255, 0.82)"
                            strokeWidth="1.6"
                            strokeDasharray="6 4"
                            strokeLinecap="round"
                          />
                          <circle
                            cx="0"
                            cy="0"
                            r={selectedBodyOrbitPreview.parentRadius}
                            fill={`${colorNumberToHex(selectedBodyParent.color)}cc`}
                            stroke="rgba(218, 244, 255, 0.52)"
                            strokeWidth="1.6"
                          />
                          <circle
                            cx="0"
                            cy="0"
                            r={selectedBodyOrbitPreview.parentRadius * 1.12}
                            fill="none"
                            stroke="rgba(172, 229, 255, 0.14)"
                            strokeWidth="1"
                          />
                          <circle
                            cx={selectedBodyOrbitPreview.currentPosition.x}
                            cy={selectedBodyOrbitPreview.currentPosition.y}
                            r={selectedBodyOrbitPreview.bodyRadius}
                            fill={`${colorNumberToHex(selectedBody.color)}f2`}
                            stroke="rgba(234, 247, 255, 0.88)"
                            strokeWidth="1.35"
                          />
                          <line
                            x1={selectedBodyOrbitPreview.currentPosition.x}
                            y1={selectedBodyOrbitPreview.currentPosition.y}
                            x2={selectedBodyOrbitPreview.tangentEnd.x}
                            y2={selectedBodyOrbitPreview.tangentEnd.y}
                            stroke="rgba(236, 247, 255, 0.74)"
                            strokeWidth="1.15"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : null}
                      <div className="map-sandbox__body-lab-caption">
                        {effectiveSelectedBodyPreviewMode === "orbit" && selectedBodyParent
                          ? `Local orbit preview around ${selectedBodyParent.name}. The parent sits at the focus, so eccentric orbits naturally speed up near periapsis and slow down near apoapsis.`
                          : "Live body preview. Class, weather, palette, seed, color, and radius all update here immediately."}
                      </div>
                    </div>
                    {effectiveSelectedBodyPreviewMode !== "orbit" ? (
                      <>
                        <div className="map-sandbox__double">
                          <label className="map-sandbox__field">
                            <span className="map-sandbox__field-label">Render Stage</span>
                            <select
                              className="map-sandbox__select"
                              value={selectedBodyRenderStage}
                              onChange={(event) => {
                                setSelectedBodyRenderStage(
                                  event.target.value as CelestialRenderStage,
                                );
                              }}
                            >
                              {BODY_LAB_RENDER_STAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="map-sandbox__field">
                            <span className="map-sandbox__field-label">Preview Seed</span>
                            <div className="map-sandbox__inline">
                              <button
                                type="button"
                                className="map-sandbox__button"
                                onClick={() => {
                                  setBodies(updateBody(normalizedBodies, selectedBody.id, {
                                    renderSeed: buildBodyLabSeed(selectedBody),
                                  }));
                                }}
                              >
                                Randomize
                              </button>
                              <button
                                type="button"
                                className="map-sandbox__button"
                                onClick={() => {
                                  setSelectedBodyRenderStage("full");
                                  setSelectedBodyPreviewZoom(1);
                                  setSelectedBodyRotationDegrees(0);
                                }}
                              >
                                Reset View
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="map-sandbox__double">
                          <label className="map-sandbox__field">
                            <span className="map-sandbox__field-label">
                              Preview Zoom {selectedBodyPreviewZoom.toFixed(2)}x
                            </span>
                            <input
                              className="map-sandbox__range"
                              type="range"
                              min={BODY_LAB_MIN_ZOOM.toString()}
                              max={BODY_LAB_MAX_ZOOM.toString()}
                              step="0.05"
                              value={selectedBodyPreviewZoom}
                              onChange={(event) => {
                                setSelectedBodyPreviewZoom(Number(event.target.value));
                              }}
                            />
                          </label>
                          <label className="map-sandbox__field">
                            <span className="map-sandbox__field-label">
                              Rotation {selectedBodyRotationDegrees.toFixed(0)}°
                            </span>
                            <input
                              className="map-sandbox__range"
                              type="range"
                              min="-180"
                              max="180"
                              step="1"
                              value={selectedBodyRotationDegrees}
                              onChange={(event) => {
                                setSelectedBodyRotationDegrees(Number(event.target.value));
                              }}
                            />
                          </label>
                        </div>
                      </>
                    ) : null}
                  </div>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Name</span>
                    <input
                      className="map-sandbox__input"
                      value={selectedBody.name}
                      onChange={(event) => {
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          name: event.target.value,
                        }));
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">ID</span>
                    <input
                      className="map-sandbox__input"
                      value={selectedBody.id}
                      onChange={(event) => {
                        const nextId = makeUniqueBodyId(
                          normalizedBodies,
                          event.target.value.trim() || selectedBody.id,
                          selectedBody.id,
                        );
                        setBodies(renameBody(normalizedBodies, selectedBody.id, nextId));
                        selectBody(nextId);
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Class</span>
                    <select
                      className="map-sandbox__select"
                      value={selectedBody.celestialClass ?? "medium-earthlike-planet"}
                      onChange={(event) => {
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          celestialClass: event.target.value as CelestialBodyClass,
                        }));
                      }}
                    >
                      {BODY_CLASS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Weather</span>
                    <select
                      className="map-sandbox__select"
                      value={selectedBody.weatherLevel ?? "none"}
                      onChange={(event) => {
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          weatherLevel: event.target.value as CelestialWeatherLevel,
                        }));
                      }}
                    >
                      {WEATHER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Rocky Palette</span>
                    <select
                      className="map-sandbox__select"
                      value={selectedBody.rockyPalette ?? "default"}
                      onChange={(event) => {
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          rockyPalette: event.target.value as CelestialRockyPalette,
                        }));
                      }}
                    >
                      {ROCKY_PALETTE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Seed</span>
                    <input
                      className="map-sandbox__input"
                      value={selectedBody.renderSeed ?? ""}
                      onChange={(event) => {
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          renderSeed: event.target.value,
                        }));
                      }}
                    />
                  </label>
                  <div className="map-sandbox__triple">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Mass</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedBody.mass}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            mass: parseFiniteNumber(event.target.value, selectedBody.mass),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Radius</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedBody.radius}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            radius: parseFiniteNumber(event.target.value, selectedBody.radius),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Color</span>
                      <div className="map-sandbox__inline">
                        <input
                          className="map-sandbox__color"
                          type="color"
                          value={colorNumberToHex(selectedBody.color)}
                          onChange={(event) => {
                            setBodies(updateBody(normalizedBodies, selectedBody.id, {
                              color: hexToColorNumber(event.target.value),
                            }));
                          }}
                        />
                        <input
                          className="map-sandbox__input"
                          value={colorNumberToHex(selectedBody.color)}
                          onChange={(event) => {
                            setBodies(updateBody(normalizedBodies, selectedBody.id, {
                              color: hexToColorNumber(normalizeHexColor(event.target.value)),
                            }));
                          }}
                        />
                      </div>
                    </label>
                  </div>
                  <div className="map-sandbox__double">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Collision Radius</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedBody.collisionRadius ?? selectedBody.radius}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            collisionRadius: Math.max(
                              0,
                              parseFiniteNumber(
                                event.target.value,
                                selectedBody.collisionRadius ?? selectedBody.radius,
                              ),
                            ),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Refuel Range</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedBody.refuelRange ?? 0}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            refuelRange: Math.max(
                              0,
                              parseFiniteNumber(event.target.value, selectedBody.refuelRange ?? 0),
                            ),
                          }));
                        }}
                      />
                    </label>
                  </div>
                  <div className="map-sandbox__double">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Fuel Lane Radius</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedBody.refuelLaneRadius ?? 0}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            refuelLaneRadius: Math.max(
                              0,
                              parseFiniteNumber(
                                event.target.value,
                                selectedBody.refuelLaneRadius ?? 0,
                              ),
                            ),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Fuel Lane Thickness</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedBody.refuelLaneThickness ?? 160}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            refuelLaneThickness: Math.max(
                              0,
                              parseFiniteNumber(
                                event.target.value,
                                selectedBody.refuelLaneThickness ?? 160,
                              ),
                            ),
                          }));
                        }}
                      />
                    </label>
                  </div>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Refuel / s</span>
                    <input
                      className="map-sandbox__input"
                      type="number"
                      step="0.01"
                      value={selectedBody.refuelPerSecond ?? 0}
                      onChange={(event) => {
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          refuelPerSecond: Math.max(
                            0,
                            parseFiniteNumber(
                              event.target.value,
                              selectedBody.refuelPerSecond ?? 0,
                            ),
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Parent</span>
                    <select
                      className="map-sandbox__select"
                      value={selectedBody.parentId ?? ""}
                      onChange={(event) => {
                        const nextParentId = event.target.value || null;
                        const parent = nextParentId
                          ? normalizedBodies.find((body) => body.id === nextParentId) ?? null
                          : null;
                        setBodies(updateBody(normalizedBodies, selectedBody.id, {
                          parentId: nextParentId,
                          systemId: parent?.systemId ?? selectedBody.systemId,
                          rootPosition: parent
                            ? { x: parent.rootPosition.x, y: parent.rootPosition.y }
                            : selectedBody.rootPosition,
                        }));
                      }}
                    >
                      <option value="">None (root)</option>
                      {parentOptions.map((body) => (
                        <option key={body.id} value={body.id}>
                          {body.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedBody.parentId === null ? (
                    <>
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">System ID</span>
                        <input
                          className="map-sandbox__input"
                          value={selectedBody.systemId}
                          onChange={(event) => {
                            const nextSystemId = event.target.value;
                            setBodies(updateSystemIdForSubtree(
                              normalizedBodies,
                              selectedBody.id,
                              nextSystemId,
                            ));
                          }}
                        />
                      </label>
                      <div className="map-sandbox__double">
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Root X</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            value={selectedBody.rootPosition.x}
                            onChange={(event) => {
                              setBodies(updateRootPositionForSubtree(
                                normalizedBodies,
                                selectedBody.id,
                                {
                                  x: parseFiniteNumber(event.target.value, selectedBody.rootPosition.x),
                                  y: selectedBody.rootPosition.y,
                                },
                              ));
                            }}
                          />
                        </label>
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Root Y</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            value={selectedBody.rootPosition.y}
                            onChange={(event) => {
                              setBodies(updateRootPositionForSubtree(
                                normalizedBodies,
                                selectedBody.id,
                                {
                                  x: selectedBody.rootPosition.x,
                                  y: parseFiniteNumber(event.target.value, selectedBody.rootPosition.y),
                                },
                              ));
                            }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="map-sandbox__field-label">
                        System follows parent: {selectedBody.systemId}
                      </div>
                      <div className="map-sandbox__triple">
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Orbit Radius</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            value={selectedBody.orbitRadius}
                            onChange={(event) => {
                              setBodies(updateBody(normalizedBodies, selectedBody.id, {
                                orbitRadius: parseFiniteNumber(event.target.value, selectedBody.orbitRadius),
                              }));
                            }}
                          />
                        </label>
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Orbit Period</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            value={selectedBody.orbitPeriod}
                            onChange={(event) => {
                              setBodies(updateBody(normalizedBodies, selectedBody.id, {
                                orbitPeriod: parseFiniteNumber(event.target.value, selectedBody.orbitPeriod),
                              }));
                            }}
                          />
                        </label>
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">True Anomaly</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            value={selectedBody.initialAngle}
                            onChange={(event) => {
                              setBodies(updateBody(normalizedBodies, selectedBody.id, {
                                initialAngle: parseFiniteNumber(event.target.value, selectedBody.initialAngle),
                              }));
                            }}
                          />
                        </label>
                      </div>
                      <div className="map-sandbox__double">
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Eccentricity</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            step="0.01"
                            value={selectedBody.orbitEccentricity ?? 0}
                            onChange={(event) => {
                              setBodies(updateBody(normalizedBodies, selectedBody.id, {
                                orbitEccentricity: parseFiniteNumber(
                                  event.target.value,
                                  selectedBody.orbitEccentricity ?? 0,
                                ),
                              }));
                            }}
                          />
                        </label>
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Rotation</span>
                          <input
                            className="map-sandbox__input"
                            type="number"
                            step="0.01"
                            value={selectedBody.orbitRotation ?? 0}
                            onChange={(event) => {
                              setBodies(updateBody(normalizedBodies, selectedBody.id, {
                                orbitRotation: parseFiniteNumber(
                                  event.target.value,
                                  selectedBody.orbitRotation ?? 0,
                                ),
                              }));
                            }}
                          />
                        </label>
                      </div>
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Orbit Direction</span>
                        <select
                          className="map-sandbox__select"
                          value={selectedBody.orbitDirection ?? "cw"}
                          onChange={(event) => {
                            setBodies(updateBody(normalizedBodies, selectedBody.id, {
                              orbitDirection: event.target.value as "cw" | "ccw",
                            }));
                          }}
                        >
                          <option value="cw">Clockwise</option>
                          <option value="ccw">Counterclockwise</option>
                        </select>
                      </label>
                      <div className="map-sandbox__double">
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Periapsis</span>
                          <input
                            className="map-sandbox__input"
                            value={formatNumber(selectedBody.orbitRadius * (1 - (selectedBody.orbitEccentricity ?? 0)))}
                            readOnly
                          />
                        </label>
                        <label className="map-sandbox__field">
                          <span className="map-sandbox__field-label">Apoapsis</span>
                          <input
                            className="map-sandbox__input"
                            value={formatNumber(selectedBody.orbitRadius * (1 + (selectedBody.orbitEccentricity ?? 0)))}
                            readOnly
                          />
                        </label>
                      </div>
                    </>
                  )}
                  <div className="map-sandbox__inline">
                    <label className="map-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={!selectedBody.hidden}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            hidden: !event.target.checked,
                          }));
                        }}
                      />
                      <span>Visible</span>
                    </label>
                    <label className="map-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={selectedBody.affectsGravity ?? true}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            affectsGravity: event.target.checked,
                          }));
                        }}
                      />
                      <span>Affects gravity</span>
                    </label>
                    <label className="map-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={selectedBody.receivesGravity ?? true}
                        onChange={(event) => {
                          setBodies(updateBody(normalizedBodies, selectedBody.id, {
                            receivesGravity: event.target.checked,
                          }));
                        }}
                      />
                      <span>Receives gravity</span>
                    </label>
                  </div>
                </section>
              ) : !selectedBody ? (
                <section className="map-sandbox__section">
                  <div className="map-sandbox__meta">
                    No body is currently selected.
                  </div>
                </section>
              ) : null}

              {activeSelectionEditor === "entity" && selectedEntity ? (
                <section className="map-sandbox__section">
                  <div className="map-sandbox__section-header">
                    <div className="map-sandbox__section-title">Selected Entity</div>
                    <button
                      type="button"
                      className="map-sandbox__button map-sandbox__button--danger"
                      onClick={deleteSelectedEntity}
                    >
                      Delete
                    </button>
                  </div>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Name</span>
                    <input
                      className="map-sandbox__input"
                      value={selectedEntity.name}
                      onChange={(event) => {
                        setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                          name: event.target.value,
                        }));
                      }}
                    />
                  </label>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">ID</span>
                    <input
                      className="map-sandbox__input"
                      value={selectedEntity.id}
                      onChange={(event) => {
                        const nextId = makeUniqueEntityId(
                          normalizedEntities,
                          event.target.value.trim() || selectedEntity.id,
                          selectedEntity.id,
                        );
                        setEntities(renameEntity(normalizedEntities, selectedEntity.id, nextId));
                        selectEntity(nextId);
                      }}
                    />
                  </label>
                  <div className="map-sandbox__double">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Type</span>
                      <select
                        className="map-sandbox__select"
                        value={selectedEntity.weaponType}
                        onChange={(event) => {
                          const nextType = event.target.value as DefenseConfig["weaponType"];
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            weaponType: nextType,
                            beamRange: nextType === "beam" ? Math.max(selectedEntity.beamRange, 360) : 0,
                            beamDamagePerSecond:
                              nextType === "beam"
                                ? Math.max(selectedEntity.beamDamagePerSecond, 0.45)
                                : 0,
                            torpedoSpeed:
                              nextType === "torpedo"
                                ? Math.max(selectedEntity.torpedoSpeed, 210)
                                : 0,
                            torpedoThrust:
                              nextType === "torpedo"
                                ? Math.max(selectedEntity.torpedoThrust, 420)
                                : 0,
                            torpedoTurnRate:
                              nextType === "torpedo"
                                ? Math.max(selectedEntity.torpedoTurnRate, 5.2)
                                : 0,
                            scannerRange:
                              nextType === "target" || nextType === "station"
                                ? 0
                                : Math.max(selectedEntity.scannerRange, 1200),
                            lockOnSeconds:
                              nextType === "target" || nextType === "station"
                                ? 0
                                : Math.max(selectedEntity.lockOnSeconds, 1.2),
                            cooldownSeconds:
                              nextType === "torpedo"
                                ? Math.max(selectedEntity.cooldownSeconds, 4.8)
                                : 0,
                          }));
                        }}
                      >
                        <option value="torpedo">Torpedo</option>
                        <option value="beam">Beam</option>
                        <option value="target">Target</option>
                        <option value="station">Station</option>
                      </select>
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Parent Body</span>
                      <select
                        className="map-sandbox__select"
                        value={selectedEntity.parentId}
                        onChange={(event) => {
                          const parent =
                            normalizedBodies.find((body) => body.id === event.target.value) ?? null;
                          if (!parent) {
                            return;
                          }

                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            parentId: parent.id,
                            systemId: parent.systemId,
                            darkSideRelativeToId:
                              resolveDefaultDarkSideReference(
                                normalizedBodies,
                                parent,
                              ) ?? undefined,
                          }));
                        }}
                      >
                        {entityParentOptions.map((body) => (
                          <option key={body.id} value={body.id}>
                            {body.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="map-sandbox__double">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Anchor</span>
                      <select
                        className="map-sandbox__select"
                        value={selectedEntity.anchorToParent ?? "orbit"}
                        onChange={(event) => {
                          const nextAnchor = event.target.value as NonNullable<DefenseConfig["anchorToParent"]>;
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            anchorToParent: nextAnchor,
                            orbitPeriod: nextAnchor === "orbit"
                              ? Math.max(selectedEntity.orbitPeriod, 24)
                              : 0,
                          }));
                        }}
                      >
                        <option value="orbit">Orbit</option>
                        <option value="fixed">Fixed</option>
                        <option value="dark-side">Dark Side</option>
                      </select>
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Dark-Side Reference</span>
                      <select
                        className="map-sandbox__select"
                        value={selectedEntity.darkSideRelativeToId ?? ""}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            darkSideRelativeToId: event.target.value || undefined,
                          }));
                        }}
                        disabled={(selectedEntity.anchorToParent ?? "orbit") !== "dark-side"}
                      >
                        <option value="">None</option>
                        {normalizedBodies
                          .filter((body) => body.systemId === selectedEntity.systemId)
                          .map((body) => (
                            <option key={body.id} value={body.id}>
                              {body.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="map-sandbox__triple">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Radius</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.radius}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            radius: Math.max(1, parseFiniteNumber(event.target.value, selectedEntity.radius)),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Color</span>
                      <div className="map-sandbox__inline">
                        <input
                          className="map-sandbox__color"
                          type="color"
                          value={colorNumberToHex(selectedEntity.color)}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              color: hexToColorNumber(event.target.value),
                            }));
                          }}
                        />
                        <input
                          className="map-sandbox__input"
                          value={colorNumberToHex(selectedEntity.color)}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              color: hexToColorNumber(normalizeHexColor(event.target.value)),
                            }));
                          }}
                        />
                      </div>
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">System</span>
                      <input
                        className="map-sandbox__input"
                        value={selectedEntity.systemId}
                        readOnly
                      />
                    </label>
                  </div>
                  <div className="map-sandbox__triple">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Orbit Radius</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.orbitRadius}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            orbitRadius: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.orbitRadius)),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Orbit Period</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.orbitPeriod}
                        disabled={(selectedEntity.anchorToParent ?? "orbit") !== "orbit"}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            orbitPeriod: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.orbitPeriod)),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Angle</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.initialAngle}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            initialAngle: parseFiniteNumber(event.target.value, selectedEntity.initialAngle),
                          }));
                        }}
                      />
                    </label>
                  </div>
                  <label className="map-sandbox__field">
                    <span className="map-sandbox__field-label">Orbit Direction</span>
                    <select
                      className="map-sandbox__select"
                      value={selectedEntity.orbitDirection ?? "cw"}
                      disabled={(selectedEntity.anchorToParent ?? "orbit") !== "orbit"}
                      onChange={(event) => {
                        setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                          orbitDirection: event.target.value as "cw" | "ccw",
                        }));
                      }}
                    >
                      <option value="cw">Clockwise</option>
                      <option value="ccw">Counterclockwise</option>
                    </select>
                  </label>
                  <div className="map-sandbox__triple">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Scanner Range</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.scannerRange}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            scannerRange: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.scannerRange)),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Lock Seconds</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.lockOnSeconds}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            lockOnSeconds: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.lockOnSeconds)),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Cooldown</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        value={selectedEntity.cooldownSeconds}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            cooldownSeconds: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.cooldownSeconds)),
                          }));
                        }}
                      />
                    </label>
                  </div>
                  {selectedEntity.weaponType === "beam" ? (
                    <div className="map-sandbox__double">
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Beam Range</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          value={selectedEntity.beamRange}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              beamRange: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.beamRange)),
                            }));
                          }}
                        />
                      </label>
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Beam DPS</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          step="0.01"
                          value={selectedEntity.beamDamagePerSecond}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              beamDamagePerSecond: Math.max(
                                0,
                                parseFiniteNumber(event.target.value, selectedEntity.beamDamagePerSecond),
                              ),
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                  {selectedEntity.weaponType === "torpedo" ? (
                    <div className="map-sandbox__triple">
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Torpedo Speed</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          value={selectedEntity.torpedoSpeed}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              torpedoSpeed: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.torpedoSpeed)),
                            }));
                          }}
                        />
                      </label>
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Torpedo Thrust</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          value={selectedEntity.torpedoThrust}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              torpedoThrust: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.torpedoThrust)),
                            }));
                          }}
                        />
                      </label>
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Turn Rate</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          step="0.01"
                          value={selectedEntity.torpedoTurnRate}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              torpedoTurnRate: Math.max(
                                0,
                                parseFiniteNumber(event.target.value, selectedEntity.torpedoTurnRate),
                              ),
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                  <div className="map-sandbox__double">
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Shield Capacity</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        step="0.01"
                        value={selectedEntity.shieldCapacity}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            shieldCapacity: Math.max(0, parseFiniteNumber(event.target.value, selectedEntity.shieldCapacity)),
                          }));
                        }}
                      />
                    </label>
                    <label className="map-sandbox__field">
                      <span className="map-sandbox__field-label">Shield Recharge</span>
                      <input
                        className="map-sandbox__input"
                        type="number"
                        step="0.01"
                        value={selectedEntity.shieldRechargePerSecond}
                        onChange={(event) => {
                          setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                            shieldRechargePerSecond: Math.max(
                              0,
                              parseFiniteNumber(event.target.value, selectedEntity.shieldRechargePerSecond),
                            ),
                          }));
                        }}
                      />
                    </label>
                  </div>
                  {selectedEntity.weaponType === "station" ? (
                    <div className="map-sandbox__double">
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Refuel Range</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          value={selectedEntity.refuelRange ?? 0}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              refuelRange: Math.max(
                                0,
                                parseFiniteNumber(event.target.value, selectedEntity.refuelRange ?? 0),
                              ),
                            }));
                          }}
                        />
                      </label>
                      <label className="map-sandbox__field">
                        <span className="map-sandbox__field-label">Refuel / s</span>
                        <input
                          className="map-sandbox__input"
                          type="number"
                          step="0.01"
                          value={selectedEntity.refuelPerSecond ?? 0}
                          onChange={(event) => {
                            setEntities(updateEntity(normalizedEntities, selectedEntity.id, {
                              refuelPerSecond: Math.max(
                                0,
                                parseFiniteNumber(event.target.value, selectedEntity.refuelPerSecond ?? 0),
                              ),
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </section>
              ) : !selectedEntity ? (
                <section className="map-sandbox__section">
                  <div className="map-sandbox__meta">
                    No gameplay entity is currently selected.
                  </div>
                </section>
              ) : null}
              </>
              ) : null}

              {sidebarPanel === "output" ? (
              <>
              <section className="map-sandbox__section">
                <div className="map-sandbox__section-title">Preview</div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">
                    Zoom {zoomMultiplier.toFixed(2)}x
                  </span>
                  <input
                    className="map-sandbox__range"
                    type="range"
                    min={MAP_PREVIEW_MIN_ZOOM.toString()}
                    max={MAP_PREVIEW_MAX_ZOOM.toString()}
                    step="0.05"
                    value={zoomMultiplier}
                    onChange={(event) => {
                      setZoomMultiplier(Number(event.target.value));
                    }}
                  />
                </label>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">
                    Time {worldTimeSeconds.toFixed(1)}s
                  </span>
                  <input
                    className="map-sandbox__range"
                    type="range"
                    min="0"
                    max="180"
                    step="0.1"
                    value={Math.min(180, worldTimeSeconds)}
                    onChange={(event) => {
                      setWorldTimeSeconds(Number(event.target.value));
                    }}
                  />
                </label>
                <div className="map-sandbox__inline">
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={() => {
                      setIsPlaying((value) => !value);
                    }}
                  >
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={() => {
                      setIsPlaying(false);
                      setWorldTimeSeconds(0);
                    }}
                  >
                    Reset Time
                  </button>
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={() => {
                      framePreview(normalizedBodies, worldTimeRef.current);
                    }}
                  >
                    Reset View
                  </button>
                </div>
                <label className="map-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={snapToGrid}
                    onChange={(event) => {
                      setSnapToGrid(event.target.checked);
                    }}
                  />
                  <span>Snap dragged bodies to visible grid</span>
                </label>
                <label className="map-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(event) => {
                      setShowGrid(event.target.checked);
                    }}
                  />
                  <span>Show grid</span>
                </label>
                <label className="map-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={showOrbitPaths}
                    onChange={(event) => {
                      setShowOrbitPaths(event.target.checked);
                    }}
                  />
                  <span>Show orbit paths</span>
                </label>
                <label className="map-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(event) => {
                      setShowLabels(event.target.checked);
                    }}
                  />
                  <span>Show labels</span>
                </label>
              </section>

              <section className="map-sandbox__section">
                <div className="map-sandbox__section-header">
                  <div className="map-sandbox__section-title">Export</div>
                  <div className="map-sandbox__inline">
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={async () => {
                        const result = await saveMissionModuleFile(
                          exportFileName,
                          exportText,
                          MAP_LAB_SAVE_TARGET,
                        );
                        setExportStatus(result);
                      }}
                    >
                      Save Scenario File
                    </button>
                    <button
                      type="button"
                      className="map-sandbox__button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(exportText);
                          setExportStatus("Copied mission module to clipboard.");
                        } catch {
                          setExportStatus("Clipboard copy failed.");
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <label className="map-sandbox__field">
                  <span className="map-sandbox__field-label">Scenario File</span>
                  <input
                    className="map-sandbox__input"
                    value={exportFileName}
                    readOnly
                  />
                </label>
                <div className="map-sandbox__meta">
                  {exportStatus || "In local dev, Save Scenario File writes straight into src/game/scenarios/authored/. Saved scenarios appear in Level Select after refresh."}
                </div>
                <textarea
                  className="map-sandbox__textarea"
                  readOnly
                  value={exportText}
                />
              </section>
              </>
              ) : null}
            </aside>
            <section className="map-sandbox__workspace">
              <div className="map-sandbox__workspace-header">
                <div className="map-sandbox__workspace-title">World Preview</div>
                <div className="map-sandbox__workspace-meta">
                  The preview uses the same celestial renderer and authored orbit evaluator as the game.
                  The sidebar now edits both the physical map and the scenario layer wrapped around it.
                </div>
              </div>
              <div className="map-sandbox__workspace-toolbar">
                <div className="map-sandbox__workspace-tools">
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={undoEditorChange}
                    disabled={!canUndo}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={redoEditorChange}
                    disabled={!canRedo}
                  >
                    Redo
                  </button>
                  <button
                    type="button"
                    className="map-sandbox__button"
                    onClick={() => {
                      framePreview(normalizedBodies, worldTimeRef.current);
                    }}
                  >
                    Reset View
                  </button>
                </div>
                <div className="map-sandbox__workspace-toolbar-meta">
                  Use `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z` outside text fields. Body dragging commits as a single history step.
                </div>
              </div>
              <div className="map-sandbox__preview-shell">
                <div
                  ref={hostRef}
                  className={`map-sandbox__preview${
                    interactionMode !== "idle" ? " map-sandbox__preview--panning" : ""
                  }`}
                />
                <div className="map-sandbox__caption">
                  Celestial layout, gameplay sites, spawn, and authored scenario data now live in one editor.
                  Drag bodies to place them. Drag empty space to pan. Use the mouse wheel over the preview to zoom. Fuel lanes, orbit paths, and undoable map edits all preview here.
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}

function createPresetMapLayout(presetId: MapPresetId): {
  mapName: string;
  mapDescription?: string;
  bodies: CelestialConfig[];
  entities: DefenseConfig[];
  spawn: MapSpawnConfig;
} {
  switch (presetId) {
    case "flight-tutorial": {
      const layout = createOrbitalFlightTrainingLayout();
      return {
        mapName: `${layout.name} Lab`,
        mapDescription:
          layout.mapDescription
          ?? "Training layout for orbital transfer, support-lane holding, and the Vesta fuel-drone sequence.",
        bodies: cloneCelestialConfigs(layout.celestialConfigs),
        entities: cloneDefenseConfigs(layout.defenseConfigs),
        spawn: {
          systemId: layout.spawn.systemId,
          orbitRadius: layout.spawn.orbitRadius,
          orbitDirection: layout.spawn.orbitDirection,
        },
      };
    }
    case "binary-system": {
      const bodies = createBinarySystemConfigs("janus-binary", "Lab", { x: 0, y: 0 });
      return {
        mapName: "Janus Binary Lab",
        mapDescription:
          "Binary-world navigation space for practicing transfers through overlapping gravity wells.",
        bodies: cloneCelestialConfigs(bodies),
        entities: cloneDefenseConfigs(
          createBinaryDefenseConfigs("janus-binary", bodies),
        ),
        spawn: {
          systemId: "janus-binary",
          orbitRadius: 980,
          orbitDirection: "cw",
        },
      };
    }
    case "refinery-system": {
      const bodies = createRefinerySystemConfigs("vesta-refinery", "Lab", { x: 0, y: 0 });
      return {
        mapName: "Vesta Refinery Lab",
        mapDescription:
          "Refinery orbit sandbox focused on support lanes, utility bodies, and orbital logistics.",
        bodies: cloneCelestialConfigs(bodies),
        entities: [],
        spawn: {
          systemId: "vesta-refinery",
          orbitRadius: 980,
          orbitDirection: "cw",
        },
      };
    }
    case "giant-moons": {
      const bodies = createGiantMoonSystemConfigs("brontes-array", "Lab", { x: 0, y: 0 });
      return {
        mapName: "Brontes Moon Array Lab",
        mapDescription:
          "Large-planet moon array for testing eccentric orbits, layered gravity, and navigation readability.",
        bodies: cloneCelestialConfigs(bodies),
        entities: [],
        spawn: {
          systemId: "brontes-array",
          orbitRadius: 1680,
          orbitDirection: "cw",
        },
      };
    }
    case "ring-giant": {
      const bodies = createRingedGasGiantSystemConfigs("hyperion-rings", "Lab", { x: 0, y: 0 });
      return {
        mapName: "Hyperion Rings Lab",
        mapDescription:
          "Ringed gas giant map for orbital debris lanes, gas-world rendering, and strategic ring traversal.",
        bodies: cloneCelestialConfigs(bodies),
        entities: [],
        spawn: {
          systemId: "hyperion-rings",
          orbitRadius: 1860,
          orbitDirection: "cw",
        },
      };
    }
    case "simple-system":
    default: {
      const bodies = createSimpleSystemConfigs("aurelia-training", "Lab", { x: 0, y: 0 }, true);
      return {
        mapName: "Aurelia Training Lab",
        mapDescription:
          "Compact single-system testbed for moon combat, launcher placement, and close orbital maneuvers.",
        bodies: cloneCelestialConfigs(bodies),
        entities: cloneDefenseConfigs(
          createDefenseConfigs("aurelia-training", bodies),
        ),
        spawn: {
          systemId: "aurelia-training",
          orbitRadius: 980,
          orbitDirection: "cw",
        },
      };
    }
  }
}

function createPresetScenarioBundle(
  presetId: MapPresetId,
): MapSandboxPresetBundle {
  if (presetId === "flight-tutorial") {
    const scenario = cloneScenarioJson(ORBITAL_FLIGHT_TRAINING_SCENARIO);
    return {
      mapName: scenario.map.name,
      mapDescription: scenario.map.mapDescription,
      bodies: cloneCelestialConfigs(scenario.map.celestialConfigs),
      entities: cloneDefenseConfigs(scenario.map.defenseConfigs),
      spawn: cloneScenarioJson(scenario.map.spawn),
      scenario,
    };
  }

  if (presetId === "simple-system") {
    const scenario = cloneScenarioJson(AURELIA_COMBAT_RANGE_SCENARIO);
    return {
      mapName: scenario.map.name,
      mapDescription: scenario.map.mapDescription,
      bodies: cloneCelestialConfigs(scenario.map.celestialConfigs),
      entities: cloneDefenseConfigs(scenario.map.defenseConfigs),
      spawn: cloneScenarioJson(scenario.map.spawn),
      scenario,
    };
  }

  const layout = createPresetMapLayout(presetId);
  return {
    ...layout,
    scenario: createDefaultScenarioDefinition({
      scenarioName: layout.mapName,
      scenarioDescription:
        layout.mapDescription || "Authored scenario built in Map Lab.",
      mapName: layout.mapName,
      mapDescription: layout.mapDescription,
      bodies: layout.bodies,
      entities: layout.entities,
      spawn: layout.spawn,
    }),
  };
}

function createDefaultScenarioDefinition(options: {
  scenarioName: string;
  scenarioDescription?: string;
  mapName: string;
  mapDescription?: string;
  bodies: readonly CelestialConfig[];
  entities: readonly DefenseConfig[];
  spawn: MapSpawnConfig;
}): ScenarioDefinition {
  const scenarioName = options.scenarioName.trim() || "Map Lab Scenario";
  const scenarioId = slugify(scenarioName) || "map-lab-scenario";
  return {
    id: scenarioId,
    presentation: {
      name: scenarioName,
      description: options.scenarioDescription ?? "Authored scenario built in Map Lab.",
      difficulty: "easy",
      tags: ["testing", "map-lab"],
      eyebrow: "Testing",
      accentColor: "#8ee8ff",
      sortOrder: 100,
    },
    map: {
      id: slugify(options.mapName || scenarioName) || `${scenarioId}-layout`,
      name: options.mapName.trim() || scenarioName,
      mapDescription: options.mapDescription,
      celestialConfigs: cloneCelestialConfigs(options.bodies),
      defenseConfigs: cloneDefenseConfigs(options.entities),
      spawn: cloneScenarioJson(options.spawn),
    },
    mission: {
      runtime: {
        logicId: "none",
      },
      factions: [
        {
          id: "player-command",
          label: "Player Command",
          team: "player",
          accentColor: "#8ee8ff",
          description: "Player-aligned forces and mission command.",
        },
        {
          id: "opposition",
          label: "Opposition",
          team: "hostile",
          accentColor: "#ff9f7f",
          description: "Primary hostile force in this authored scenario.",
        },
      ],
      objectives: [],
      markers: [],
      controlNodes: [],
      supportLinks: [],
      briefings: [],
      triggers: [],
      initialFlags: {},
    },
    encounters: [],
    authoring: {
      version: 1,
      summary: "",
      designGoals: [],
      playtestFocus: [],
      editorHints: [],
      aiPromptSeed: "",
      notes: [],
    },
  };
}

function cloneScenarioJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneMapLabEditorSnapshot(snapshot: MapLabEditorSnapshot): MapLabEditorSnapshot {
  return cloneScenarioJson(snapshot);
}

function buildMapLabEditorSnapshotSignature(snapshot: MapLabEditorSnapshot): string {
  const {
    selectedBodyId: _selectedBodyId,
    selectedEntityId: _selectedEntityId,
    activeSelectionKind: _activeSelectionKind,
    ...historyTrackedSnapshot
  } = snapshot;
  return JSON.stringify(historyTrackedSnapshot);
}

function pushHistorySnapshot(
  history: readonly MapLabEditorSnapshot[],
  snapshot: MapLabEditorSnapshot,
): MapLabEditorSnapshot[] {
  return [
    ...history.slice(-(MAP_LAB_HISTORY_LIMIT - 1)),
    cloneMapLabEditorSnapshot(snapshot),
  ];
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function splitCommaEntries(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitMultilineEntries(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeScenarioId(value: string): string {
  return slugify(value || "");
}

function currentScenarioIdFallback(
  scenarioId: string,
  scenarioName: string,
): string {
  return sanitizeScenarioId(scenarioId) || slugify(scenarioName || "") || "map-lab-scenario";
}

function normalizeOptionalHexColor(value: string): string | undefined {
  const normalized = normalizeHexColor(value || "");
  return normalized || undefined;
}

function hasScenarioAuthoringData(options: {
  version: number;
  summary: string;
  designGoalsText: string;
  playtestFocusText: string;
  editorHintsText: string;
  aiPromptSeed: string;
  notesText: string;
}): boolean {
  return (
    options.version !== 1
    || options.summary.trim().length > 0
    || splitMultilineEntries(options.designGoalsText).length > 0
    || splitMultilineEntries(options.playtestFocusText).length > 0
    || splitMultilineEntries(options.editorHintsText).length > 0
    || options.aiPromptSeed.trim().length > 0
    || splitMultilineEntries(options.notesText).length > 0
  );
}

function cloneCelestialConfigs(configs: readonly CelestialConfig[]): CelestialConfig[] {
  return configs.map((config) => ({
    ...config,
    rootPosition: {
      x: config.rootPosition.x,
      y: config.rootPosition.y,
    },
    orbitCenterOffset: config.orbitCenterOffset
      ? {
          x: config.orbitCenterOffset.x,
          y: config.orbitCenterOffset.y,
        }
      : undefined,
    collisionRadius: config.collisionRadius,
    refuelRange: config.refuelRange,
    refuelLaneRadius: config.refuelLaneRadius,
    refuelLaneThickness: config.refuelLaneThickness,
    refuelPerSecond: config.refuelPerSecond,
  }));
}

function cloneDefenseConfigs(configs: readonly DefenseConfig[]): DefenseConfig[] {
  return configs.map((config) => ({
    ...config,
  }));
}

function normalizeMapLabBodies(configs: readonly CelestialConfig[]): CelestialConfig[] {
  const uniqueBodies: CelestialConfig[] = [];
  const seenIds = new Set<string>();

  for (const config of configs) {
    if (!config.id || seenIds.has(config.id)) {
      continue;
    }

    seenIds.add(config.id);
    uniqueBodies.push({
      ...config,
      rootPosition: {
        x: config.rootPosition.x,
        y: config.rootPosition.y,
      },
      orbitCenterOffset: { x: 0, y: 0 },
      hidden: config.hidden ?? false,
      affectsGravity: config.affectsGravity ?? true,
      receivesGravity: config.receivesGravity ?? true,
      collisionRadius:
        config.collisionRadius === undefined
          ? config.radius
          : Math.max(0, config.collisionRadius),
      renderSeed: config.renderSeed || config.id,
      celestialClass: config.celestialClass ?? "medium-earthlike-planet",
      weatherLevel: config.weatherLevel ?? "none",
      rockyPalette: config.rockyPalette ?? "default",
      mass: Math.max(0, config.mass),
      radius: Math.max(1, config.radius),
      refuelRange:
        config.refuelRange === undefined ? undefined : Math.max(0, config.refuelRange),
      refuelLaneRadius:
        config.refuelLaneRadius === undefined
          ? undefined
          : Math.max(0, config.refuelLaneRadius),
      refuelLaneThickness:
        config.refuelLaneThickness === undefined
          ? undefined
          : Math.max(0, config.refuelLaneThickness),
      refuelPerSecond:
        config.refuelPerSecond === undefined
          ? undefined
          : Math.max(0, config.refuelPerSecond),
      orbitRadius: Math.max(0, config.orbitRadius),
      orbitPeriod: config.parentId === null ? 0 : Math.max(1, config.orbitPeriod || 1),
      initialAngle: Number.isFinite(config.initialAngle) ? config.initialAngle : 0,
      orbitDirection: config.orbitDirection ?? "cw",
      orbitEccentricity: clamp(config.orbitEccentricity ?? 0, 0, 0.92),
      orbitRotation: Number.isFinite(config.orbitRotation ?? 0) ? config.orbitRotation : 0,
    });
  }

  const byId = new Map(uniqueBodies.map((body) => [body.id, body]));

  for (const body of uniqueBodies) {
    if (body.parentId === null) {
      continue;
    }

    const parent = byId.get(body.parentId);
    if (!parent) {
      body.parentId = null;
      body.orbitRadius = 0;
      body.orbitPeriod = 0;
      continue;
    }

    body.systemId = parent.systemId;
    body.rootPosition = {
      x: parent.rootPosition.x,
      y: parent.rootPosition.y,
    };
  }

  return sortCelestialConfigsForEvaluation(uniqueBodies);
}

function normalizeMapLabEntities(
  configs: readonly DefenseConfig[],
  bodies: readonly CelestialConfig[],
): DefenseConfig[] {
  const uniqueEntities: DefenseConfig[] = [];
  const seenIds = new Set<string>();
  const bodyById = new Map(bodies.map((body) => [body.id, body]));

  for (const config of configs) {
    if (!config.id || seenIds.has(config.id)) {
      continue;
    }

    const parent = bodyById.get(config.parentId);
    if (!parent) {
      continue;
    }

    seenIds.add(config.id);
    uniqueEntities.push({
      ...config,
      systemId: parent.systemId,
      anchorToParent: config.anchorToParent ?? "orbit",
      darkSideRelativeToId:
        config.anchorToParent === "dark-side"
          ? (
              config.darkSideRelativeToId && bodyById.has(config.darkSideRelativeToId)
                ? config.darkSideRelativeToId
                : resolveDefaultDarkSideReference(bodies, parent)
            ) ?? undefined
          : undefined,
      scannerRange: Math.max(0, config.scannerRange),
      lockOnSeconds: Math.max(0, config.lockOnSeconds),
      cooldownSeconds: Math.max(0, config.cooldownSeconds),
      beamRange: Math.max(0, config.beamRange),
      beamDamagePerSecond: Math.max(0, config.beamDamagePerSecond),
      torpedoSpeed: Math.max(0, config.torpedoSpeed),
      torpedoThrust: Math.max(0, config.torpedoThrust),
      torpedoTurnRate: Math.max(0, config.torpedoTurnRate),
      radius: Math.max(1, config.radius),
      orbitRadius: Math.max(0, config.orbitRadius),
      orbitPeriod:
        (config.anchorToParent ?? "orbit") === "orbit"
          ? Math.max(1, config.orbitPeriod || 1)
          : 0,
      initialAngle: Number.isFinite(config.initialAngle) ? config.initialAngle : 0,
      orbitDirection: config.orbitDirection ?? "cw",
      shieldCapacity: Math.max(0, config.shieldCapacity),
      shieldRechargePerSecond: Math.max(0, config.shieldRechargePerSecond),
      refuelRange:
        config.refuelRange === undefined ? undefined : Math.max(0, config.refuelRange),
      refuelPerSecond:
        config.refuelPerSecond === undefined
          ? undefined
          : Math.max(0, config.refuelPerSecond),
    });
  }

  uniqueEntities.sort((a, b) => a.name.localeCompare(b.name));
  return uniqueEntities;
}

function sortCelestialConfigsForEvaluation(
  configs: readonly CelestialConfig[],
): CelestialConfig[] {
  const childrenByParent = new Map<string, CelestialConfig[]>();
  const roots: CelestialConfig[] = [];
  const byId = new Map(configs.map((config) => [config.id, config]));

  for (const config of configs) {
    if (config.parentId === null || !byId.has(config.parentId)) {
      roots.push(config);
      continue;
    }

    const siblings = childrenByParent.get(config.parentId) ?? [];
    siblings.push(config);
    childrenByParent.set(config.parentId, siblings);
  }

  const ordered: CelestialConfig[] = [];
  const visited = new Set<string>();

  const visit = (config: CelestialConfig) => {
    if (visited.has(config.id)) {
      return;
    }

    visited.add(config.id);
    ordered.push(config);

    const children = childrenByParent.get(config.id) ?? [];
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      visit(child);
    }
  };

  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const root of roots) {
    visit(root);
  }

  for (const config of configs) {
    visit(config);
  }

  return ordered;
}

function updateBody(
  configs: readonly CelestialConfig[],
  targetId: string,
  patch: Partial<CelestialConfig>,
): CelestialConfig[] {
  return configs.map((config) =>
    config.id === targetId
      ? {
          ...config,
          ...patch,
          rootPosition: patch.rootPosition
            ? { x: patch.rootPosition.x, y: patch.rootPosition.y }
            : { x: config.rootPosition.x, y: config.rootPosition.y },
          orbitCenterOffset: patch.orbitCenterOffset
            ? { x: patch.orbitCenterOffset.x, y: patch.orbitCenterOffset.y }
            : { x: config.orbitCenterOffset?.x ?? 0, y: config.orbitCenterOffset?.y ?? 0 },
        }
      : {
          ...config,
          rootPosition: { x: config.rootPosition.x, y: config.rootPosition.y },
          orbitCenterOffset: config.orbitCenterOffset
            ? { x: config.orbitCenterOffset.x, y: config.orbitCenterOffset.y }
            : { x: 0, y: 0 },
        },
  );
}

function renameBody(
  configs: readonly CelestialConfig[],
  previousId: string,
  nextIdRaw: string,
): CelestialConfig[] {
  const nextId = makeUniqueBodyId(configs, nextIdRaw.trim() || previousId, previousId);
  return configs.map((config) => {
    const nextConfig = {
      ...config,
      rootPosition: { x: config.rootPosition.x, y: config.rootPosition.y },
      orbitCenterOffset: config.orbitCenterOffset
        ? { x: config.orbitCenterOffset.x, y: config.orbitCenterOffset.y }
        : { x: 0, y: 0 },
    };

    if (config.id === previousId) {
      nextConfig.id = nextId;
    }

    if (config.parentId === previousId) {
      nextConfig.parentId = nextId;
    }

    return nextConfig;
  });
}

function updateEntity(
  configs: readonly DefenseConfig[],
  targetId: string,
  patch: Partial<DefenseConfig>,
): DefenseConfig[] {
  return configs.map((config) =>
    config.id === targetId
      ? {
          ...config,
          ...patch,
        }
      : {
          ...config,
        },
  );
}

function renameEntity(
  configs: readonly DefenseConfig[],
  previousId: string,
  nextIdRaw: string,
): DefenseConfig[] {
  const nextId = makeUniqueEntityId(configs, nextIdRaw.trim() || previousId, previousId);
  return configs.map((config) =>
    config.id === previousId
      ? {
          ...config,
          id: nextId,
        }
      : {
          ...config,
        },
  );
}

function updateSystemIdForSubtree(
  configs: readonly CelestialConfig[],
  rootId: string,
  systemId: string,
): CelestialConfig[] {
  const subtreeIds = collectBodySubtreeIds(configs, rootId);
  return configs.map((config) => ({
    ...config,
    rootPosition: { x: config.rootPosition.x, y: config.rootPosition.y },
    orbitCenterOffset: config.orbitCenterOffset
      ? { x: config.orbitCenterOffset.x, y: config.orbitCenterOffset.y }
      : { x: 0, y: 0 },
    systemId: subtreeIds.has(config.id) ? systemId : config.systemId,
  }));
}

function updateRootPositionForSubtree(
  configs: readonly CelestialConfig[],
  rootId: string,
  rootPosition: Vector2Like,
): CelestialConfig[] {
  const subtreeIds = collectBodySubtreeIds(configs, rootId);
  return configs.map((config) => ({
    ...config,
    rootPosition: subtreeIds.has(config.id)
      ? { x: rootPosition.x, y: rootPosition.y }
      : { x: config.rootPosition.x, y: config.rootPosition.y },
    orbitCenterOffset: config.orbitCenterOffset
      ? { x: config.orbitCenterOffset.x, y: config.orbitCenterOffset.y }
      : { x: 0, y: 0 },
  }));
}

function collectBodySubtreeIds(
  configs: readonly CelestialConfig[],
  rootId: string,
): Set<string> {
  const subtreeIds = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || subtreeIds.has(currentId)) {
      continue;
    }

    subtreeIds.add(currentId);
    for (const config of configs) {
      if (config.parentId === currentId) {
        stack.push(config.id);
      }
    }
  }

  return subtreeIds;
}

function createRootBodyConfig(
  configs: readonly CelestialConfig[],
): CelestialConfig {
  const rootCount = configs.filter((body) => body.parentId === null).length;
  const systemId = `map-system-${rootCount + 1}`;
  const id = makeUniqueBodyId(configs, `${systemId}:primary`);
  return {
    id,
    name: `Primary ${rootCount + 1}`,
    systemId,
    parentId: null,
    rootPosition: {
      x: rootCount * 2600,
      y: (rootCount % 2 === 0 ? 1 : -1) * 420,
    },
    mass: 100000,
    radius: 100,
    color: 0x6ca7ff,
    orbitRadius: 0,
    orbitPeriod: 0,
    initialAngle: 0,
    orbitCenterOffset: { x: 0, y: 0 },
    celestialClass: "medium-earthlike-planet",
    weatherLevel: "moderate",
    renderSeed: `${systemId}-primary`,
    rockyPalette: "default",
    hidden: false,
    affectsGravity: true,
    receivesGravity: true,
  };
}

function createOrbiterBodyConfig(
  configs: readonly CelestialConfig[],
  parent: CelestialConfig,
): CelestialConfig {
  const siblingCount = configs.filter((body) => body.parentId === parent.id).length;
  const slug = slugify(parent.name || parent.id);
  const id = makeUniqueBodyId(
    configs,
    `${parent.systemId}:${slug}-orbiter-${siblingCount + 1}`,
  );
  return {
    id,
    name: `${parent.name} Orbiter ${siblingCount + 1}`,
    systemId: parent.systemId,
    parentId: parent.id,
    rootPosition: { x: parent.rootPosition.x, y: parent.rootPosition.y },
    mass: 5000,
    radius: 28,
    color: 0xc7d3de,
    orbitRadius: Math.max(parent.radius * 5, 480 + siblingCount * 220),
    orbitPeriod: 28 + siblingCount * 8,
    initialAngle: siblingCount * 0.9,
    orbitCenterOffset: { x: 0, y: 0 },
    celestialClass: "rocky-moon",
    weatherLevel: "none",
    renderSeed: `${parent.id}-orbiter-${siblingCount + 1}`,
    rockyPalette: "slate",
    hidden: false,
    affectsGravity: true,
    receivesGravity: true,
  };
}

function createRefuelBodyConfig(
  configs: readonly CelestialConfig[],
  parent: CelestialConfig,
): CelestialConfig {
  const siblingCount = configs.filter((body) => body.parentId === parent.id).length;
  const slug = slugify(parent.name || parent.id);
  const id = makeUniqueBodyId(
    configs,
    `${parent.systemId}:${slug}-refuel-${siblingCount + 1}`,
  );
  return {
    id,
    name: `${parent.name} Fuel Station ${siblingCount + 1}`,
    systemId: parent.systemId,
    parentId: parent.id,
    rootPosition: { x: parent.rootPosition.x, y: parent.rootPosition.y },
    mass: 0,
    radius: 16,
    collisionRadius: 0,
    color: 0x89ffd0,
    orbitRadius: Math.max(parent.radius + 76, 96),
    orbitPeriod: Math.max(6, 10 + siblingCount * 1.5),
    initialAngle: siblingCount * 0.62,
    orbitCenterOffset: { x: 0, y: 0 },
    celestialClass: "asteroid",
    weatherLevel: "none",
    renderSeed: `${parent.id}-refuel-${siblingCount + 1}`,
    rockyPalette: "iron",
    hidden: false,
    affectsGravity: false,
    receivesGravity: false,
    refuelRange: 150,
    refuelPerSecond: 0.22,
  };
}

function createGameplayEntityConfig(
  entities: readonly DefenseConfig[],
  bodies: readonly CelestialConfig[],
  preferredParentId: string | null,
  template: MapLabEntityTemplate,
): DefenseConfig | null {
  const parent =
    bodies.find((body) => body.id === preferredParentId)
    ?? bodies[0]
    ?? null;
  if (!parent) {
    return null;
  }

  const siblingCount = entities.filter((entity) => entity.parentId === parent.id).length;
  const baseId = `${parent.systemId}:${slugify(parent.name || parent.id)}-${template}-${siblingCount + 1}`;
  const id = makeUniqueEntityId(entities, baseId);
  const darkSideRelativeToId = resolveDefaultDarkSideReference(bodies, parent) ?? undefined;
  const orbitRadius = Math.max(parent.radius + 24, 28);

  switch (template) {
    case "beam":
      return {
        id,
        name: `${parent.name} Beam ${siblingCount + 1}`,
        systemId: parent.systemId,
        parentId: parent.id,
        weaponType: "beam",
        anchorToParent: "orbit",
        scannerRange: 1380,
        lockOnSeconds: 1.2,
        cooldownSeconds: 0,
        beamRange: 430,
        beamDamagePerSecond: 0.55,
        torpedoSpeed: 0,
        torpedoThrust: 0,
        torpedoTurnRate: 0,
        radius: 18,
        color: 0xff7f9a,
        orbitRadius: Math.max(parent.radius * 3.6, 140),
        orbitPeriod: 88,
        initialAngle: siblingCount * 0.72,
        shieldCapacity: 0.28,
        shieldRechargePerSecond: 0.045,
      };
    case "target":
      return {
        id,
        name: `${parent.name} Target ${siblingCount + 1}`,
        systemId: parent.systemId,
        parentId: parent.id,
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
        radius: 15,
        color: 0xffcc66,
        orbitRadius,
        orbitPeriod: 0,
        initialAngle: siblingCount * 0.62,
        shieldCapacity: 0,
        shieldRechargePerSecond: 0,
      };
    case "station":
      return {
        id,
        name: `${parent.name} Station ${siblingCount + 1}`,
        systemId: parent.systemId,
        parentId: parent.id,
        weaponType: "station",
        anchorToParent: "fixed",
        scannerRange: 0,
        lockOnSeconds: 0,
        cooldownSeconds: 0,
        beamRange: 0,
        beamDamagePerSecond: 0,
        torpedoSpeed: 0,
        torpedoThrust: 0,
        torpedoTurnRate: 0,
        radius: 16,
        color: 0x89ffd0,
        orbitRadius,
        orbitPeriod: 0,
        initialAngle: siblingCount * 0.62,
        shieldCapacity: 0,
        shieldRechargePerSecond: 0,
      };
    case "torpedo":
    default:
      return {
        id,
        name: `${parent.name} Launcher ${siblingCount + 1}`,
        systemId: parent.systemId,
        parentId: parent.id,
        weaponType: "torpedo",
        anchorToParent: parent.parentId === null ? "orbit" : "dark-side",
        darkSideRelativeToId,
        scannerRange: 1320,
        lockOnSeconds: 1.6,
        cooldownSeconds: 5.8,
        beamRange: 0,
        beamDamagePerSecond: 0,
        torpedoSpeed: 210,
        torpedoThrust: 420,
        torpedoTurnRate: 5.4,
        radius: 14,
        color: 0xff6b6b,
        orbitRadius,
        orbitPeriod: parent.parentId === null ? 76 : 0,
        initialAngle: siblingCount * 0.8,
        shieldCapacity: 0.16,
        shieldRechargePerSecond: 0.03,
      };
  }
}

function resolveDefaultDarkSideReference(
  bodies: readonly CelestialConfig[],
  parent: CelestialConfig,
): string | null {
  const systemRoot = bodies.find(
    (body) => body.systemId === parent.systemId && body.parentId === null && body.id !== parent.id,
  );
  if (systemRoot) {
    return systemRoot.id;
  }

  const fallbackRoot = bodies.find(
    (body) => body.systemId === parent.systemId && body.parentId === null,
  );
  return fallbackRoot?.id ?? null;
}

function resolvePreviewCamera(
  referenceBounds: PreviewBounds,
  previewSize: PreviewSize,
  zoomMultiplier: number,
  panOffset: Vector2Like,
): PreviewCamera {
  const width = Math.max(1, referenceBounds.maxX - referenceBounds.minX);
  const height = Math.max(1, referenceBounds.maxY - referenceBounds.minY);
  const paddingPixels = 86;
  const pixelsPerWorldUnit =
    Math.max(
      0.02,
      Math.min(
        (previewSize.width - paddingPixels * 2) / width,
        (previewSize.height - paddingPixels * 2) / height,
      ),
    ) * zoomMultiplier;

  return {
    center: {
      x: (referenceBounds.minX + referenceBounds.maxX) * 0.5 + panOffset.x,
      y: (referenceBounds.minY + referenceBounds.maxY) * 0.5 + panOffset.y,
    },
    pixelsPerWorldUnit,
  };
}

function measurePreviewBoundsAtTime(
  configs: readonly CelestialConfig[],
  timeSeconds: number,
): PreviewBounds {
  const normalizedConfigs = normalizeMapLabBodies(configs);
  if (normalizedConfigs.length === 0) {
    return {
      minX: -400,
      maxX: 400,
      minY: -300,
      maxY: 300,
    };
  }

  const ephemeris = createCelestialEphemeris(normalizedConfigs);
  const evaluator = createCelestialStateEvaluator(ephemeris);
  return getPreviewBounds(normalizedConfigs, evaluator.evaluate(timeSeconds));
}

function getPreviewBounds(
  configs: readonly CelestialConfig[],
  state: ReadonlyMap<string, CelestialPose>,
): PreviewBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includePoint = (point: Vector2Like, radius = 0) => {
    minX = Math.min(minX, point.x - radius);
    maxX = Math.max(maxX, point.x + radius);
    minY = Math.min(minY, point.y - radius);
    maxY = Math.max(maxY, point.y + radius);
  };

  for (const config of configs) {
    const pose = state.get(config.id);
    if (pose) {
      const laneRadius =
        (config.refuelLaneRadius ?? 0) > 0
          ? (config.refuelLaneRadius ?? 0)
            + Math.max(24, config.refuelLaneThickness ?? 160) * 0.5
          : 0;
      includePoint(
        pose.position,
        Math.max(
          config.radius,
          config.refuelRange ?? 0,
          config.collisionRadius ?? 0,
          laneRadius,
        ) + 90,
      );
    }

    if (config.parentId === null || config.orbitRadius <= 0) {
      continue;
    }

    const parentPose = state.get(config.parentId);
    if (!parentPose) {
      continue;
    }

    for (let index = 0; index < MAP_BOUNDS_SAMPLE_COUNT; index += 1) {
      const angle = (index / MAP_BOUNDS_SAMPLE_COUNT) * Math.PI * 2;
      const orbitPoint = evaluateOrbitPathPoint(config, parentPose.position, angle);
      includePoint(orbitPoint, config.radius + 45);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: -400,
      maxX: 400,
      minY: -300,
      maxY: 300,
    };
  }

  return { minX, maxX, minY, maxY };
}

function evaluateMapLabEntityState(
  configs: readonly DefenseConfig[],
  celestialState: ReadonlyMap<string, CelestialPose>,
  timeSeconds: number,
): Map<string, { position: Vector2Like; velocity: Vector2Like }> {
  const state = new Map<string, { position: Vector2Like; velocity: Vector2Like }>();

  for (const config of configs) {
    const parent = celestialState.get(config.parentId);
    if (!parent) {
      continue;
    }

    if (config.anchorToParent === "dark-side") {
      const referenceBody = config.darkSideRelativeToId
        ? celestialState.get(config.darkSideRelativeToId)
        : null;
      if (!referenceBody) {
        continue;
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
      state.set(config.id, {
        position: {
          x: parent.position.x + Math.cos(angle) * config.orbitRadius,
          y: parent.position.y + Math.sin(angle) * config.orbitRadius,
        },
        velocity: {
          x: parent.velocity.x,
          y: parent.velocity.y,
        },
      });
      continue;
    }

    const angularSpeed =
      ((Math.PI * 2) / Math.max(config.orbitPeriod, 1)) *
      getOrbitDirectionSign(config.orbitDirection);
    const angle = config.initialAngle + angularSpeed * timeSeconds;
    const tangentialSpeed = angularSpeed * config.orbitRadius;
    state.set(config.id, {
      position: {
        x: parent.position.x + Math.cos(angle) * config.orbitRadius,
        y: parent.position.y + Math.sin(angle) * config.orbitRadius,
      },
      velocity: {
        x: parent.velocity.x - Math.sin(angle) * tangentialSpeed,
        y: parent.velocity.y + Math.cos(angle) * tangentialSpeed,
      },
    });
  }

  return state;
}

function drawMapSpawnMarker(
  graphics: Graphics,
  screenPosition: Vector2Like,
  orbitDirection: "cw" | "ccw",
): void {
  const radius = 10;
  const tangentDirection = orbitDirection === "cw" ? 1 : -1;
  const arrowBaseX = screenPosition.x + tangentDirection * (radius + 6);
  const arrowTipX = screenPosition.x + tangentDirection * (radius + 18);
  graphics
    .circle(screenPosition.x, screenPosition.y, radius)
    .stroke({
      color: 0x7af0b2,
      width: 2,
      alpha: 0.95,
    });
  graphics
    .moveTo(screenPosition.x - radius - 6, screenPosition.y)
    .lineTo(screenPosition.x + radius + 6, screenPosition.y)
    .moveTo(screenPosition.x, screenPosition.y - radius - 6)
    .lineTo(screenPosition.x, screenPosition.y + radius + 6)
    .stroke({
      color: 0xcfffe3,
      width: 1.4,
      alpha: 0.8,
    });
  graphics
    .moveTo(arrowBaseX, screenPosition.y)
    .lineTo(arrowTipX, screenPosition.y)
    .lineTo(
      arrowTipX - tangentDirection * 6,
      screenPosition.y - 4,
    )
    .moveTo(arrowTipX, screenPosition.y)
    .lineTo(
      arrowTipX - tangentDirection * 6,
      screenPosition.y + 4,
    )
    .stroke({
      color: 0x7af0b2,
      width: 1.8,
      alpha: 0.92,
    });
}

function drawMapEntityMarker(
  graphics: Graphics,
  config: DefenseConfig,
  screenPosition: Vector2Like,
  pixelsPerWorldUnit: number,
): void {
  const radius = Math.max(config.radius * pixelsPerWorldUnit, 7);
  graphics.position.set(screenPosition.x, screenPosition.y);

  if (config.weaponType === "beam") {
    graphics
      .poly([
        0, -radius - 4,
        radius + 2, 0,
        0, radius + 4,
        -radius - 2, 0,
      ])
      .fill(config.color)
      .stroke({
        color: WORLD_ENTITY_STYLES.defense.beamStrokeColor,
        width: 2,
        alpha: WORLD_ENTITY_STYLES.defense.beamStrokeAlpha,
      });
    return;
  }

  if (config.weaponType === "station") {
    graphics
      .roundRect(-radius, -radius + 1, radius * 2, (radius - 1) * 2, Math.max(4, radius * 0.28))
      .fill(config.color)
      .stroke({
        color: WORLD_ENTITY_STYLES.defense.stationStrokeColor,
        width: 2,
        alpha: WORLD_ENTITY_STYLES.defense.stationStrokeAlpha,
      });
    graphics
      .rect(-3, -radius - 5, 6, radius * 2 + 10)
      .fill(WORLD_ENTITY_STYLES.defense.stationDetailColor);
    graphics
      .rect(-radius - 5, -3, radius * 2 + 10, 6)
      .fill(WORLD_ENTITY_STYLES.defense.stationDetailColor);
    if ((config.refuelPerSecond ?? 0) > 0) {
      graphics
        .circle(0, 0, radius + 6)
        .stroke({
          color: 0x8df7cb,
          width: 1.5,
          alpha: 0.36,
        });
    }
    return;
  }

  if (config.weaponType === "target") {
    graphics
      .circle(0, 0, radius + 2)
      .stroke({
        color: WORLD_ENTITY_STYLES.defense.targetStrokeColor,
        width: 2,
        alpha: WORLD_ENTITY_STYLES.defense.targetStrokeAlpha,
      });
    graphics
      .circle(0, 0, Math.max(5, radius * 0.56))
      .stroke({
        color: WORLD_ENTITY_STYLES.defense.targetStrokeColor,
        width: 2,
        alpha: WORLD_ENTITY_STYLES.defense.targetStrokeAlpha,
      });
    graphics
      .circle(0, 0, Math.max(3, radius * 0.22))
      .fill(config.color)
      .stroke({
        color: WORLD_ENTITY_STYLES.defense.targetDetailColor,
        width: 1.5,
        alpha: 0.95,
      });
    graphics
      .rect(-1.5, -radius - 5, 3, radius * 2 + 10)
      .fill(WORLD_ENTITY_STYLES.defense.targetDetailColor);
    graphics
      .rect(-radius - 5, -1.5, radius * 2 + 10, 3)
      .fill(WORLD_ENTITY_STYLES.defense.targetDetailColor);
    return;
  }

  if (config.anchorToParent === "dark-side") {
    graphics
      .poly([
        0, -radius - 4,
        radius, radius,
        0, radius * 0.34,
        -radius, radius,
      ])
      .fill(config.color)
      .stroke({
        color: WORLD_ENTITY_STYLES.defense.launcherStrokeColor,
        width: 2,
        alpha: WORLD_ENTITY_STYLES.defense.launcherStrokeAlpha,
      });
    return;
  }

  graphics
    .roundRect(-radius, -radius, radius * 2, radius * 2, Math.max(4, radius * 0.24))
    .fill(config.color)
    .stroke({
      color: WORLD_ENTITY_STYLES.defense.launcherStrokeColor,
      width: 2,
      alpha: WORLD_ENTITY_STYLES.defense.genericStrokeAlpha,
    });
}

function drawPreviewGrid(
  graphics: Graphics,
  previewSize: PreviewSize,
  camera: PreviewCamera,
): void {
  const halfWidthWorld = previewSize.width * 0.5 / camera.pixelsPerWorldUnit;
  const halfHeightWorld = previewSize.height * 0.5 / camera.pixelsPerWorldUnit;
  const worldMinX = camera.center.x - halfWidthWorld;
  const worldMaxX = camera.center.x + halfWidthWorld;
  const worldMinY = camera.center.y - halfHeightWorld;
  const worldMaxY = camera.center.y + halfHeightWorld;
  const spacing = chooseGridSpacing(camera.pixelsPerWorldUnit);

  for (
    let x = Math.floor(worldMinX / spacing) * spacing;
    x <= worldMaxX;
    x += spacing
  ) {
    const screenX = toScreenPoint({ x, y: 0 }, previewSize, camera).x;
    graphics
      .moveTo(screenX, 0)
      .lineTo(screenX, previewSize.height)
      .stroke({
        color: x === 0 ? 0x89d8ff : 0x315774,
        width: x === 0 ? 1.6 : 1,
        alpha: x === 0 ? 0.22 : 0.14,
      });
  }

  for (
    let y = Math.floor(worldMinY / spacing) * spacing;
    y <= worldMaxY;
    y += spacing
  ) {
    const screenY = toScreenPoint({ x: 0, y }, previewSize, camera).y;
    graphics
      .moveTo(0, screenY)
      .lineTo(previewSize.width, screenY)
      .stroke({
        color: y === 0 ? 0x89d8ff : 0x315774,
        width: y === 0 ? 1.6 : 1,
        alpha: y === 0 ? 0.22 : 0.14,
      });
  }
}

function drawOrbitPaths(
  graphics: Graphics,
  configs: readonly CelestialConfig[],
  state: ReadonlyMap<string, CelestialPose>,
  previewSize: PreviewSize,
  camera: PreviewCamera,
): void {
  for (const config of configs) {
    if (config.parentId === null || config.orbitRadius <= 0) {
      continue;
    }

    const parentPose = state.get(config.parentId);
    if (!parentPose) {
      continue;
    }

    const points: Vector2Like[] = [];
    for (let index = 0; index <= ORBIT_PATH_SAMPLE_COUNT; index += 1) {
      const angle = (index / ORBIT_PATH_SAMPLE_COUNT) * Math.PI * 2;
      points.push(
        toScreenPoint(
          evaluateOrbitPathPoint(config, parentPose.position, angle),
          previewSize,
          camera,
        ),
      );
    }

    if (points.length < 2) {
      continue;
    }

    graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      graphics.lineTo(points[index].x, points[index].y);
    }
    graphics.stroke({
      color: 0x8ee8ff,
      width: 1.5,
      alpha: 0.2,
    });
  }
}

function repositionBodyByWorldPoint(
  configs: readonly CelestialConfig[],
  bodyId: string,
  worldPoint: Vector2Like,
  poseState: ReadonlyMap<string, CelestialPose>,
  timeSeconds: number,
): CelestialConfig[] {
  const normalized = normalizeMapLabBodies(configs);
  const body = normalized.find((entry) => entry.id === bodyId);
  if (!body) {
    return normalized;
  }

  if (body.parentId === null) {
    return updateRootPositionForSubtree(normalized, body.id, worldPoint);
  }

  const parentPose = poseState.get(body.parentId);
  if (!parentPose) {
    return normalized;
  }

  return updateBody(normalized, body.id, resolveOrbitalDragPatch(
    body,
    parentPose.position,
    worldPoint,
    timeSeconds,
  ));
}

function resolveOrbitalDragPatch(
  body: CelestialConfig,
  parentPosition: Vector2Like,
  worldPoint: Vector2Like,
  timeSeconds: number,
): Partial<CelestialConfig> {
  const offsetX = worldPoint.x - parentPosition.x;
  const offsetY = worldPoint.y - parentPosition.y;
  const orbitRotation = body.orbitRotation ?? 0;
  const eccentricity = clamp(body.orbitEccentricity ?? 0, 0, 0.92);
  const cosRotation = Math.cos(orbitRotation);
  const sinRotation = Math.sin(orbitRotation);
  const localX = offsetX * cosRotation + offsetY * sinRotation;
  const localY = -offsetX * sinRotation + offsetY * cosRotation;
  const trueAnomaly = normalizeAngle(Math.atan2(localY, localX));
  const radiusFromFocus = Math.hypot(localX, localY);
  const orbitRadius = Math.max(
    1,
    (radiusFromFocus * (1 + eccentricity * Math.cos(trueAnomaly))) /
      Math.max(1 - eccentricity * eccentricity, 0.0001),
  );
  const meanMotion =
    body.orbitPeriod > 0
      ? ((Math.PI * 2) / body.orbitPeriod) * getOrbitDirectionSign(body.orbitDirection)
      : 0;
  const currentEccentricAnomaly = trueAnomalyToEccentricAnomaly(trueAnomaly, eccentricity);
  const currentMeanAnomaly = normalizeAngle(
    currentEccentricAnomaly - eccentricity * Math.sin(currentEccentricAnomaly),
  );
  const initialMeanAnomaly = normalizeAngle(currentMeanAnomaly - meanMotion * timeSeconds);
  const initialEccentricAnomaly = solveEccentricAnomaly(initialMeanAnomaly, eccentricity);
  const initialAngle = eccentricAnomalyToTrueAnomaly(initialEccentricAnomaly, eccentricity);

  return {
    orbitRadius,
    initialAngle,
  };
}

function evaluateOrbitPathPoint(
  config: Pick<
    CelestialConfig,
    "orbitRadius" | "orbitEccentricity" | "orbitRotation"
  >,
  parentPose: Vector2Like,
  trueAnomaly: number,
): Vector2Like {
  const eccentricity = clamp(config.orbitEccentricity ?? 0, 0, 0.92);
  const semiLatusRectum = config.orbitRadius * (1 - eccentricity * eccentricity);
  const orbitRotation = config.orbitRotation ?? 0;
  const radiusFromFocus =
    semiLatusRectum / Math.max(1 + eccentricity * Math.cos(trueAnomaly), 0.0001);
  const localX = Math.cos(trueAnomaly) * radiusFromFocus;
  const localY = Math.sin(trueAnomaly) * radiusFromFocus;
  const cosRotation = Math.cos(orbitRotation);
  const sinRotation = Math.sin(orbitRotation);

  return {
    x:
      parentPose.x +
      (localX * cosRotation - localY * sinRotation),
    y:
      parentPose.y +
      (localX * sinRotation + localY * cosRotation),
  };
}

function buildOrbitPreviewModel(
  body: CelestialConfig,
  parentBody: CelestialConfig,
): OrbitPreviewModel {
  const parentPose = { x: 0, y: 0 };
  const orbitPoints: Vector2Like[] = [];

  for (let index = 0; index < ORBIT_PATH_SAMPLE_COUNT; index += 1) {
    const angle = (index / ORBIT_PATH_SAMPLE_COUNT) * Math.PI * 2;
    orbitPoints.push(evaluateOrbitPathPoint(body, parentPose, angle));
  }

  const currentAngle = normalizeAngle(body.initialAngle);
  const currentPosition = evaluateOrbitPathPoint(body, parentPose, currentAngle);
  const tangentEnd = projectOrbitTangentPoint(body, currentAngle, currentPosition);

  let minX = -parentBody.radius;
  let maxX = parentBody.radius;
  let minY = -parentBody.radius;
  let maxY = parentBody.radius;

  for (const point of orbitPoints) {
    minX = Math.min(minX, point.x - body.radius);
    maxX = Math.max(maxX, point.x + body.radius);
    minY = Math.min(minY, point.y - body.radius);
    maxY = Math.max(maxY, point.y + body.radius);
  }

  minX = Math.min(minX, tangentEnd.x);
  maxX = Math.max(maxX, tangentEnd.x);
  minY = Math.min(minY, tangentEnd.y);
  maxY = Math.max(maxY, tangentEnd.y);

  const span = Math.max(maxX - minX, maxY - minY, 1);
  const parentRadius = Math.max(parentBody.radius, span * 0.03);
  const bodyRadius = Math.max(body.radius, span * 0.016);
  const padding = span * 0.12 + bodyRadius;

  minX = Math.min(minX, -parentRadius) - padding;
  maxX = Math.max(maxX, parentRadius) + padding;
  minY = Math.min(minY, -parentRadius) - padding;
  maxY = Math.max(maxY, parentRadius) + padding;

  return {
    viewBox: `${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(maxX - minX)} ${formatNumber(maxY - minY)}`,
    orbitPath: buildSvgPath(orbitPoints, true),
    currentPosition,
    tangentEnd,
    parentRadius,
    bodyRadius,
  };
}

function buildSvgPath(points: readonly Vector2Like[], closed: boolean): string {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...rest] = points;
  const commands = [`M ${formatNumber(firstPoint.x)} ${formatNumber(firstPoint.y)}`];

  for (const point of rest) {
    commands.push(`L ${formatNumber(point.x)} ${formatNumber(point.y)}`);
  }

  if (closed) {
    commands.push("Z");
  }

  return commands.join(" ");
}

function projectOrbitTangentPoint(
  body: Pick<CelestialConfig, "orbitRadius" | "orbitDirection" | "orbitEccentricity" | "orbitRotation">,
  trueAnomaly: number,
  position: Vector2Like,
): Vector2Like {
  const directionSign = getOrbitDirectionSign(body.orbitDirection);
  const previousPoint = evaluateOrbitPathPoint(
    body,
    { x: 0, y: 0 },
    normalizeAngle(trueAnomaly - 0.015 * directionSign),
  );
  const nextPoint = evaluateOrbitPathPoint(
    body,
    { x: 0, y: 0 },
    normalizeAngle(trueAnomaly + 0.015 * directionSign),
  );
  const tangentWorld = {
    x: nextPoint.x - previousPoint.x,
    y: nextPoint.y - previousPoint.y,
  };
  const tangentLength = Math.hypot(tangentWorld.x, tangentWorld.y) || 1;
  const eccentricity = clamp(body.orbitEccentricity ?? 0, 0, 0.92);
  const semiMinorAxis = body.orbitRadius * Math.sqrt(1 - eccentricity * eccentricity);
  const previewLength = Math.max(Math.max(body.orbitRadius, semiMinorAxis) * 0.16, 12);

  return {
    x: position.x + (tangentWorld.x / tangentLength) * previewLength,
    y: position.y + (tangentWorld.y / tangentLength) * previewLength,
  };
}

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      Math.max(1 - eccentricity * Math.cos(eccentricAnomaly), 1e-4);
    eccentricAnomaly -= delta;
  }

  return normalizeAngle(eccentricAnomaly);
}

function trueAnomalyToEccentricAnomaly(
  trueAnomaly: number,
  eccentricity: number,
): number {
  if (eccentricity <= 0) {
    return normalizeAngle(trueAnomaly);
  }

  const sinHalf = Math.sin(trueAnomaly * 0.5);
  const cosHalf = Math.cos(trueAnomaly * 0.5);
  return normalizeAngle(
    2 *
      Math.atan2(
        Math.sqrt(1 - eccentricity) * sinHalf,
        Math.sqrt(1 + eccentricity) * cosHalf,
      ),
  );
}

function eccentricAnomalyToTrueAnomaly(
  eccentricAnomaly: number,
  eccentricity: number,
): number {
  if (eccentricity <= 0) {
    return normalizeAngle(eccentricAnomaly);
  }

  const sinHalf = Math.sin(eccentricAnomaly * 0.5);
  const cosHalf = Math.cos(eccentricAnomaly * 0.5);
  return normalizeAngle(
    2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * sinHalf,
        Math.sqrt(1 - eccentricity) * cosHalf,
      ),
  );
}

function getOrbitDirectionSign(direction: "cw" | "ccw" | undefined): number {
  return direction === "ccw" ? -1 : 1;
}

function toScreenPoint(
  point: Vector2Like,
  previewSize: PreviewSize,
  camera: PreviewCamera,
): Vector2Like {
  return {
    x: previewSize.width * 0.5 + (point.x - camera.center.x) * camera.pixelsPerWorldUnit,
    y: previewSize.height * 0.5 + (point.y - camera.center.y) * camera.pixelsPerWorldUnit,
  };
}

function screenToWorldPoint(
  point: Vector2Like,
  previewSize: PreviewSize,
  camera: PreviewCamera,
): Vector2Like {
  return {
    x: camera.center.x + (point.x - previewSize.width * 0.5) / camera.pixelsPerWorldUnit,
    y: camera.center.y + (point.y - previewSize.height * 0.5) / camera.pixelsPerWorldUnit,
  };
}

function getLocalPreviewPoint(
  host: HTMLDivElement,
  event: PointerEvent,
): Vector2Like {
  const bounds = host.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function findBodyHitAtScreenPoint(
  hits: readonly BodyScreenHit[],
  point: Vector2Like,
): BodyScreenHit | null {
  let bestHit: BodyScreenHit | null = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const hit of hits) {
    const deltaX = point.x - hit.screenPosition.x;
    const deltaY = point.y - hit.screenPosition.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared > hit.hitRadius * hit.hitRadius) {
      continue;
    }

    if (distanceSquared < bestDistanceSquared) {
      bestHit = hit;
      bestDistanceSquared = distanceSquared;
    }
  }

  return bestHit;
}

function snapWorldPointToGrid(
  point: Vector2Like,
  spacing: number,
): Vector2Like {
  if (spacing <= 0) {
    return point;
  }

  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

function chooseGridSpacing(pixelsPerWorldUnit: number): number {
  for (const spacing of GRID_SPACING_WORLD_UNITS) {
    if (spacing * pixelsPerWorldUnit >= 56) {
      return spacing;
    }
  }

  return GRID_SPACING_WORLD_UNITS[GRID_SPACING_WORLD_UNITS.length - 1] ?? 6400;
}

function drawBodyLabBackdrop(
  graphics: Graphics,
  previewSize: PreviewSize,
): void {
  const centerX = previewSize.width * 0.5;
  const centerY = previewSize.height * 0.5;
  const ringRadius = Math.min(previewSize.width, previewSize.height) * 0.34;

  graphics
    .circle(centerX, centerY, ringRadius * 1.18)
    .stroke({
      color: 0x74dfff,
      width: 1.2,
      alpha: 0.1,
    });
  graphics
    .circle(centerX, centerY, ringRadius * 0.84)
    .stroke({
      color: 0xa4eaff,
      width: 1,
      alpha: 0.14,
    });
  graphics
    .moveTo(centerX - ringRadius * 1.35, centerY)
    .lineTo(centerX + ringRadius * 1.35, centerY)
    .stroke({
      color: 0x8fdfff,
      width: 1,
      alpha: 0.08,
    });
  graphics
    .moveTo(centerX, centerY - ringRadius * 1.35)
    .lineTo(centerX, centerY + ringRadius * 1.35)
    .stroke({
      color: 0x8fdfff,
      width: 1,
      alpha: 0.08,
    });
}

function drawBodyLabFrame(
  graphics: Graphics,
  previewSize: PreviewSize,
  bodyRadius: number,
): void {
  const centerX = previewSize.width * 0.5;
  const centerY = previewSize.height * 0.5;

  graphics
    .circle(centerX, centerY, Math.max(bodyRadius + 14, 22))
    .stroke({
      color: 0xb3f0ff,
      width: 1.4,
      alpha: 0.18,
    });
}

function normalizeAngle(angleRadians: number): number {
  const fullTurn = Math.PI * 2;
  const wrapped = angleRadians % fullTurn;
  return wrapped < 0 ? wrapped + fullTurn : wrapped;
}

function buildMapLabScenarioModule(
  scenario: ScenarioDefinition,
): string {
  const exportName = buildScenarioExportName(
    scenario.id || scenario.presentation.name || "map-lab-scenario",
  );
  return [
    "import type { ScenarioDefinition } from \"../scenario-definition\";",
    "",
    `export const ${exportName}: ScenarioDefinition = ${JSON.stringify(scenario, null, 2)};`,
    "",
    `export default ${exportName};`,
  ].join("\n");
}

function buildScenarioExportName(name: string): string {
  const base = slugify(name || "map-lab-scenario")
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
  return `${base || "MapLab"}Scenario`;
}

function buildScenarioModuleFileName(name: string): string {
  return `${slugify(name || "map-lab-scenario") || "map-lab-scenario"}.ts`;
}

async function saveMissionModuleFile(
  suggestedName: string,
  contents: string,
  target: "shared-layout" | "scenario" = "shared-layout",
): Promise<string> {
  if (import.meta.env.DEV) {
    try {
      const response = await fetch(MAP_LAB_SAVE_ROUTE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: suggestedName,
          contents,
          target,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        path?: string;
        error?: string;
      };
      if (response.ok && payload.ok) {
        return `Scenario file saved to ${payload.path ?? "src/game/scenarios/authored/"}. Refresh to load it into Level Select.`;
      }
      if (payload.error) {
        return `Scenario save failed: ${payload.error}`;
      }
    } catch {
      // Fall back to browser save flows outside the dev middleware path.
    }
  }

  const picker = (
    globalThis as typeof globalThis & {
      showSaveFilePicker?: (options?: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (data: string) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [
          {
            description: "TypeScript mission module",
            accept: {
              "text/typescript": [".ts"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return "Scenario file saved. If you saved it into src/game/scenarios/authored/, it will appear in Level Select after refresh.";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "Save canceled.";
      }
    }
  }

  const blob = new Blob([contents], {
    type: "text/typescript;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });
  return "Scenario module downloaded. Move it into src/game/scenarios/authored/ to have it appear in Level Select.";
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function resizePreviewApplication(
  app: Application,
  size: PreviewSize,
): void {
  app.renderer.resize(size.width, size.height);
}

function measurePreviewHost(host: HTMLDivElement): PreviewSize {
  return {
    width: Math.max(420, Math.floor(host.clientWidth || INITIAL_PREVIEW_WIDTH)),
    height: Math.max(320, Math.floor(host.clientHeight || INITIAL_PREVIEW_HEIGHT)),
  };
}

function measureBodyLabHost(host: HTMLDivElement): PreviewSize {
  return {
    width: Math.max(240, Math.floor(host.clientWidth || INITIAL_BODY_LAB_PREVIEW_WIDTH)),
    height: Math.max(180, Math.floor(host.clientHeight || INITIAL_BODY_LAB_PREVIEW_HEIGHT)),
  };
}

function buildBodyLabSeed(config: CelestialConfig): string {
  const base = slugify(config.name || config.id);
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeUniqueBodyId(
  configs: readonly CelestialConfig[],
  baseId: string,
  ignoredId?: string,
): string {
  const candidateBase = baseId || "body";
  let candidate = candidateBase;
  let suffix = 2;

  while (
    configs.some(
      (config) => config.id === candidate && config.id !== ignoredId,
    )
  ) {
    candidate = `${candidateBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function makeUniqueEntityId(
  configs: readonly DefenseConfig[],
  baseId: string,
  ignoredId?: string,
): string {
  const candidateBase = baseId || "entity";
  let candidate = candidateBase;
  let suffix = 2;

  while (
    configs.some(
      (config) => config.id === candidate && config.id !== ignoredId,
    )
  ) {
    candidate = `${candidateBase}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function parseFiniteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function colorNumberToHex(value: number): string {
  return `#${Math.max(0, value).toString(16).padStart(6, "0")}`;
}

function normalizeHexColor(value: string): string {
  if (!value.startsWith("#")) {
    return `#${value.slice(0, 6)}`;
  }

  return value.slice(0, 7);
}

function hexToColorNumber(value: string): number {
  const parsed = Number.parseInt(normalizeHexColor(value).slice(1), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "body";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
