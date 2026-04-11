import type {
  MapSpawnConfig,
  SharedMapLayout,
} from "../maps/types";
import type {
  MissionBriefingBlock,
  MissionCondition,
  MissionControlNode,
  MissionDefinition,
  MissionDifficulty,
  MissionFactionConfig,
  MissionMarkerDefinition,
  MissionObjective,
  MissionRuntimeConfig,
  MissionSupportLink,
  MissionTrigger,
} from "../missions/mission-definition";

export interface ScenarioPresentation {
  name: string;
  description?: string;
  difficulty?: MissionDifficulty;
  tags?: string[];
  eyebrow?: string;
  accentColor?: string;
  sortOrder?: number;
}

export type ScenarioEncounterAssetKind =
  | "system"
  | "celestial"
  | "defense"
  | "control-node"
  | "support-link"
  | "marker"
  | "objective"
  | "spawn";

export interface ScenarioEncounterAssetRef {
  kind: ScenarioEncounterAssetKind;
  id: string;
}

export type ScenarioEncounterRole =
  | "objective-defense"
  | "patrol"
  | "ambush"
  | "support"
  | "logistics"
  | "picket"
  | "siege"
  | "hazard"
  | "custom";

export interface ScenarioEncounterGroup {
  id: string;
  label: string;
  factionId: string;
  role: ScenarioEncounterRole;
  assets?: ScenarioEncounterAssetRef[];
  tags?: string[];
  description?: string;
  enabledAtStart?: boolean;
}

export interface ScenarioAuthoringMetadata {
  version?: number;
  summary?: string;
  designGoals?: string[];
  playtestFocus?: string[];
  editorHints?: string[];
  aiPromptSeed?: string;
  notes?: string[];
}

export interface ScenarioMissionLayer {
  spawnOverride?: Partial<MapSpawnConfig>;
  runtime?: MissionRuntimeConfig;
  factions: MissionFactionConfig[];
  controlNodes?: MissionControlNode[];
  supportLinks?: MissionSupportLink[];
  markers?: MissionMarkerDefinition[];
  objectives: MissionObjective[];
  triggers?: MissionTrigger[];
  briefings?: MissionBriefingBlock[];
  initialFlags?: Record<string, string | number | boolean>;
  victoryConditions?: MissionCondition[];
  failureConditions?: MissionCondition[];
}

export interface ScenarioDefinition {
  id: string;
  presentation: ScenarioPresentation;
  map: SharedMapLayout;
  mission: ScenarioMissionLayer;
  encounters?: ScenarioEncounterGroup[];
  authoring?: ScenarioAuthoringMetadata;
}

export function buildMissionDefinitionFromScenario(
  scenario: ScenarioDefinition,
): MissionDefinition {
  return {
    id: scenario.id,
    name: scenario.presentation.name,
    description: scenario.presentation.description,
    difficulty: scenario.presentation.difficulty,
    tags: scenario.presentation.tags,
    map: {
      layout: scenario.map,
      spawnOverride: scenario.mission.spawnOverride,
    },
    runtime: scenario.mission.runtime,
    factions: scenario.mission.factions,
    controlNodes: scenario.mission.controlNodes,
    supportLinks: scenario.mission.supportLinks,
    markers: scenario.mission.markers,
    objectives: scenario.mission.objectives,
    triggers: scenario.mission.triggers,
    briefings: scenario.mission.briefings,
    initialFlags: scenario.mission.initialFlags,
    victoryConditions: scenario.mission.victoryConditions,
    failureConditions: scenario.mission.failureConditions,
  };
}
