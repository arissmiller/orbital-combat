import type { Vector2Like } from "../physics/vector2";
import type {
  MapSpawnConfig,
  SharedMapLayout,
} from "../maps/types";
import type {
  MissionBriefingPage,
  MissionCameraOverride,
} from "./mission-control";
import type {
  WorldMarkerShape,
  WorldMarkerVariant,
} from "../world/world-marker";

export type MissionDifficulty =
  | "tutorial"
  | "easy"
  | "medium"
  | "hard"
  | "extreme";

export type MissionFactionTeam =
  | "player"
  | "friendly"
  | "hostile"
  | "neutral";

export interface MissionFactionConfig {
  id: string;
  label: string;
  team: MissionFactionTeam;
  accentColor?: string;
  description?: string;
}

export type MissionTargetKind =
  | "system"
  | "celestial"
  | "defense"
  | "route"
  | "marker"
  | "spawn";

export interface MissionTargetRef {
  kind: MissionTargetKind;
  id: string;
}

export type MissionControlNodeState =
  | "active"
  | "disabled"
  | "contested"
  | "captured"
  | "destroyed"
  | "hidden";

export interface MissionControlNode {
  id: string;
  label: string;
  target: MissionTargetRef;
  factionId: string;
  state: MissionControlNodeState;
  tags?: string[];
  description?: string;
}

export type MissionSupportLinkKind =
  | "sensor-feed"
  | "fire-support"
  | "beam-mirror"
  | "shield-relay"
  | "logistics"
  | "jamming"
  | "route-access"
  | "custom";

export interface MissionSupportLink {
  id: string;
  label: string;
  kind: MissionSupportLinkKind;
  source: MissionTargetRef;
  target: MissionTargetRef;
  activeAtStart?: boolean;
  reversible?: boolean;
  tags?: string[];
  description?: string;
}

export type MissionMarkerAnchor =
  | {
      kind: "position";
      position: Vector2Like;
    }
  | {
      kind: "body";
      bodyId: string;
      offset?: Vector2Like;
    }
  | {
      kind: "system-root";
      systemId: string;
      offset?: Vector2Like;
    };

export interface MissionMarkerDefinition {
  id: string;
  label: string;
  shape: WorldMarkerShape;
  variant: WorldMarkerVariant;
  anchor: MissionMarkerAnchor;
  radius: number;
  thickness?: number;
  rotationRadians?: number;
  visibleAtStart?: boolean;
}

export interface MissionBriefingBlock {
  id: string;
  title: string;
  subtitle?: string;
  pages: MissionBriefingPage[];
  showAtStart?: boolean;
  pauseGameplay?: boolean;
  blockPlayerInput?: boolean;
  cameraOverride?: MissionCameraOverride | null;
}

export type MissionCondition =
  | {
      kind: "objective-completed";
      objectiveId: string;
    }
  | {
      kind: "objective-failed";
      objectiveId: string;
    }
  | {
      kind: "entity-destroyed";
      target: MissionTargetRef;
    }
  | {
      kind: "entity-captured";
      target: MissionTargetRef;
      factionId?: string;
    }
  | {
      kind: "entity-reached";
      target: MissionTargetRef;
      range?: number;
    }
  | {
      kind: "marker-activated";
      markerId: string;
    }
  | {
      kind: "support-link-state";
      supportLinkId: string;
      active: boolean;
    }
  | {
      kind: "control-node-state";
      controlNodeId: string;
      state: MissionControlNodeState;
      factionId?: string;
    }
  | {
      kind: "time-elapsed";
      seconds: number;
    }
  | {
      kind: "orbit-held";
      systemId: string;
      radius: number;
      tolerance: number;
      durationSeconds: number;
    }
  | {
      kind: "flag-state";
      flag: string;
      value?: string | number | boolean;
    };

export type MissionAction =
  | {
      kind: "show-briefing";
      briefingId: string;
    }
  | {
      kind: "set-objective-visible";
      objectiveId: string;
      visible: boolean;
    }
  | {
      kind: "complete-objective";
      objectiveId: string;
    }
  | {
      kind: "fail-objective";
      objectiveId: string;
    }
  | {
      kind: "set-control-node-state";
      controlNodeId: string;
      state: MissionControlNodeState;
      factionId?: string;
    }
  | {
      kind: "set-support-link-state";
      supportLinkId: string;
      active: boolean;
    }
  | {
      kind: "set-marker-visible";
      markerId: string;
      visible: boolean;
    }
  | {
      kind: "set-camera";
      cameraOverride: MissionCameraOverride | null;
    }
  | {
      kind: "set-flag";
      flag: string;
      value: string | number | boolean;
    }
  | {
      kind: "emit-comm";
      message: string;
    };

export interface MissionTrigger {
  id: string;
  label?: string;
  once?: boolean;
  match?: "all" | "any";
  when: MissionCondition[];
  actions: MissionAction[];
}

export type MissionObjectiveKind =
  | "destroy"
  | "capture"
  | "hold"
  | "escort"
  | "defend"
  | "reach"
  | "clear-route"
  | "survive"
  | "scan"
  | "refuel"
  | "custom";

export interface MissionObjective {
  id: string;
  title: string;
  summary?: string;
  kind: MissionObjectiveKind;
  primary?: boolean;
  optional?: boolean;
  visibleAtStart?: boolean;
  dependsOn?: string[];
  markerIds?: string[];
  tags?: string[];
  successMatch?: "all" | "any";
  successWhen: MissionCondition[];
  failureMatch?: "all" | "any";
  failureWhen?: MissionCondition[];
}

export interface MissionMapReference {
  layoutId?: string;
  layout?: SharedMapLayout;
  spawnOverride?: Partial<MapSpawnConfig>;
}

export type MissionRuntimeLogicId =
  | "none"
  | "orbital-flight-training"
  | "nadir-random-gate-run";

export interface MissionRuntimeConfig {
  logicId?: MissionRuntimeLogicId;
}

export interface MissionDefinition {
  id: string;
  name: string;
  description?: string;
  difficulty?: MissionDifficulty;
  tags?: string[];
  map: MissionMapReference;
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
