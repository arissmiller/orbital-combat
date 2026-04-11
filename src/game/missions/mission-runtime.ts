import type {
  MissionAction,
  MissionBriefingBlock,
  MissionCondition,
  MissionDefinition,
  MissionObjective,
} from "./mission-definition";
import {
  createMissionControlState,
  type MissionControlState,
} from "./mission-control";
import type { Vector2Like } from "../physics/vector2";
import {
  createWorldMarkerState,
  isPointInsideWorldMarker,
  resetWorldMarkerState,
  updateWorldMarkerState,
  type WorldMarkerEvent,
  type WorldMarkerState,
  type WorldMarkerView,
} from "../world/world-marker";

type MissionFlagValue = string | number | boolean;
const MISSION_TEXT_FLAG_TOKEN_REGEX =
  /\{\{\s*flag:([a-zA-Z0-9._-]+)(?:\|([^}]*))?\s*\}\}/g;

interface MissionObjectiveRuntimeState {
  visible: boolean;
  completed: boolean;
  failed: boolean;
}

export interface MissionRuntimeState {
  elapsedSeconds: number;
  objectiveStates: Map<string, MissionObjectiveRuntimeState>;
  markerVisibility: Map<string, boolean>;
  orbitHoldProgressSeconds: Map<string, number>;
  flags: Record<string, MissionFlagValue>;
  firedTriggerIds: Set<string>;
  activeBriefingId: string | null;
  briefingPageIndex: number;
  markerState: WorldMarkerState;
}

export interface MissionRuntimeSnapshot {
  title: string;
  subtitle: string;
  currentInstruction: string;
  steps: Array<{
    label: string;
    completed: boolean;
    active: boolean;
  }>;
  currentProgress: number;
  completedSteps: number;
  totalSteps: number;
  completed: boolean;
  activeTarget: WorldMarkerView | null;
  targetEvents: WorldMarkerEvent[];
  control: MissionControlState;
}

export interface MissionRuntimeContext {
  deltaSeconds: number;
  advanceMissionControl: boolean;
  nextMissionPage: boolean;
  previousMissionPage: boolean;
  externalFlags?: Record<string, MissionFlagValue>;
  destroyedTargetIds?: ReadonlySet<string>;
  shipPosition?: Vector2Like;
  systemRootPositions?: ReadonlyMap<string, Vector2Like>;
  resolvedMarkers?: ReadonlyMap<string, WorldMarkerView>;
  resolvedTargetPositions?: ReadonlyMap<string, Vector2Like>;
}

export function createMissionRuntimeState(
  mission: MissionDefinition,
): MissionRuntimeState {
  return {
    elapsedSeconds: 0,
    objectiveStates: new Map(
      mission.objectives.map((objective) => [
        objective.id,
        {
          visible: objective.visibleAtStart ?? true,
          completed: false,
          failed: false,
        },
      ]),
    ),
    markerVisibility: new Map(
      (mission.markers ?? []).map((marker) => [
        marker.id,
        marker.visibleAtStart ?? true,
      ]),
    ),
    orbitHoldProgressSeconds: new Map(),
    flags: { ...(mission.initialFlags ?? {}) },
    firedTriggerIds: new Set<string>(),
    activeBriefingId: mission.briefings?.find((briefing) => briefing.showAtStart)?.id ?? null,
    briefingPageIndex: 0,
    markerState: createWorldMarkerState(),
  };
}

export function resetMissionRuntimeState(
  state: MissionRuntimeState,
  mission: MissionDefinition,
): void {
  state.elapsedSeconds = 0;
  state.objectiveStates = new Map(
    mission.objectives.map((objective) => [
      objective.id,
      {
        visible: objective.visibleAtStart ?? true,
        completed: false,
        failed: false,
      },
    ]),
  );
  state.markerVisibility = new Map(
    (mission.markers ?? []).map((marker) => [
      marker.id,
      marker.visibleAtStart ?? true,
    ]),
  );
  state.orbitHoldProgressSeconds.clear();
  state.flags = { ...(mission.initialFlags ?? {}) };
  state.firedTriggerIds.clear();
  state.activeBriefingId = mission.briefings?.find((briefing) => briefing.showAtStart)?.id ?? null;
  state.briefingPageIndex = 0;
  resetWorldMarkerState(state.markerState);
}

export function updateMissionRuntime(
  state: MissionRuntimeState,
  mission: MissionDefinition,
  context: MissionRuntimeContext,
): MissionRuntimeSnapshot {
  state.elapsedSeconds += context.deltaSeconds;
  if (context.externalFlags) {
    Object.assign(state.flags, context.externalFlags);
  }

  revealUnlockedObjectives(state, mission);
  updateOrbitHoldProgress(state, mission, context);
  const visibleObjectives = mission.objectives.filter(
    (objective) => state.objectiveStates.get(objective.id)?.visible,
  );
  const primaryObjectives = mission.objectives.filter((objective) => !objective.optional);
  const activeObjective = visibleObjectives.find((objective) => {
    const objectiveState = state.objectiveStates.get(objective.id);
    return objectiveState && !objectiveState.completed && !objectiveState.failed;
  });
  const activeTarget = resolveActiveTarget(state, activeObjective, context);
  const targetEvents = context.shipPosition
    ? updateWorldMarkerState({
        state: state.markerState,
        shipPosition: context.shipPosition,
        marker: activeTarget,
        activated:
          activeTarget !== null &&
          isPointInsideWorldMarker(context.shipPosition, activeTarget),
      })
    : [];
  resolveObjectives(state, mission, context);
  resolveTriggers(state, mission, context);
  revealUnlockedObjectives(state, mission);
  updateOrbitHoldProgress(state, mission, context);
  resolveObjectives(state, mission, context);

  const control = buildMissionControlState(state, mission, context);
  const completedPrimaryObjectives = primaryObjectives.filter(
    (objective) => state.objectiveStates.get(objective.id)?.completed,
  );
  const missionCompleted =
    primaryObjectives.length > 0 &&
    completedPrimaryObjectives.length === primaryObjectives.length;

  return {
    title: mission.name,
    subtitle: mission.description ?? "",
    currentInstruction: formatMissionText(
      activeObjective?.summary ?? activeObjective?.title ?? "",
      state.flags,
    ),
    steps: visibleObjectives.map((objective) => {
      const objectiveState = state.objectiveStates.get(objective.id);
      const active =
        !missionCompleted &&
        activeObjective?.id === objective.id &&
        !(objectiveState?.completed ?? false) &&
        !(objectiveState?.failed ?? false);
      return {
        label: formatMissionText(objective.title, state.flags),
        completed: objectiveState?.completed ?? false,
        active,
      };
    }),
    currentProgress:
      primaryObjectives.length > 0
        ? completedPrimaryObjectives.length / primaryObjectives.length
        : 0,
    completedSteps: visibleObjectives.filter(
      (objective) => state.objectiveStates.get(objective.id)?.completed,
    ).length,
    totalSteps: visibleObjectives.length,
    completed: missionCompleted,
    activeTarget,
    targetEvents,
    control,
  };
}

function revealUnlockedObjectives(
  state: MissionRuntimeState,
  mission: MissionDefinition,
): void {
  for (const objective of mission.objectives) {
    const objectiveState = state.objectiveStates.get(objective.id);
    if (!objectiveState) {
      continue;
    }

    if (!objectiveState.visible && areObjectiveDependenciesSatisfied(state, objective)) {
      objectiveState.visible = true;
    }
  }
}

function resolveObjectives(
  state: MissionRuntimeState,
  mission: MissionDefinition,
  context: MissionRuntimeContext,
): void {
  for (const objective of mission.objectives) {
    const objectiveState = state.objectiveStates.get(objective.id);
    if (!objectiveState || objectiveState.completed || objectiveState.failed) {
      continue;
    }

    if (!areObjectiveDependenciesSatisfied(state, objective)) {
      continue;
    }

    if (
      objective.failureWhen &&
      objective.failureWhen.length > 0 &&
      matchConditions(
        state,
        objective.failureWhen,
        objective.failureMatch ?? "all",
        context,
      )
    ) {
      objectiveState.failed = true;
      continue;
    }

    if (
      objective.successWhen.length > 0 &&
      matchConditions(
        state,
        objective.successWhen,
        objective.successMatch ?? "all",
        context,
      )
    ) {
      objectiveState.completed = true;
    }
  }
}

function resolveTriggers(
  state: MissionRuntimeState,
  mission: MissionDefinition,
  context: MissionRuntimeContext,
): void {
  for (const trigger of mission.triggers ?? []) {
    if (trigger.once !== false && state.firedTriggerIds.has(trigger.id)) {
      continue;
    }

    if (
      !matchConditions(
        state,
        trigger.when,
        trigger.match ?? "all",
        context,
      )
    ) {
      continue;
    }

    for (const action of trigger.actions) {
      applyTriggerAction(state, mission, action);
    }

    if (trigger.once !== false) {
      state.firedTriggerIds.add(trigger.id);
    }
  }
}

function applyTriggerAction(
  state: MissionRuntimeState,
  mission: MissionDefinition,
  action: MissionAction,
): void {
  switch (action.kind) {
    case "show-briefing":
      if (mission.briefings?.some((briefing) => briefing.id === action.briefingId)) {
        state.activeBriefingId = action.briefingId;
        state.briefingPageIndex = 0;
      }
      return;
    case "set-objective-visible": {
      const objectiveState = state.objectiveStates.get(action.objectiveId);
      if (objectiveState) {
        objectiveState.visible = action.visible;
      }
      return;
    }
    case "complete-objective": {
      const objectiveState = state.objectiveStates.get(action.objectiveId);
      if (objectiveState) {
        objectiveState.completed = true;
        objectiveState.failed = false;
      }
      return;
    }
    case "fail-objective": {
      const objectiveState = state.objectiveStates.get(action.objectiveId);
      if (objectiveState) {
        objectiveState.failed = true;
      }
      return;
    }
    case "set-flag":
      state.flags[action.flag] = action.value;
      return;
    case "set-marker-visible":
      state.markerVisibility.set(action.markerId, action.visible);
      return;
    default:
      return;
  }
}

function buildMissionControlState(
  state: MissionRuntimeState,
  mission: MissionDefinition,
  context: MissionRuntimeContext,
): MissionControlState {
  if (!state.activeBriefingId) {
    return createMissionControlState();
  }

  const briefing = mission.briefings?.find(
    (candidate) => candidate.id === state.activeBriefingId,
  );
  if (!briefing) {
    state.activeBriefingId = null;
    state.briefingPageIndex = 0;
    return createMissionControlState();
  }

  if (context.previousMissionPage) {
    state.briefingPageIndex = Math.max(0, state.briefingPageIndex - 1);
  } else if (context.nextMissionPage) {
    state.briefingPageIndex = Math.min(
      briefing.pages.length - 1,
      state.briefingPageIndex + 1,
    );
  }

  if (context.advanceMissionControl) {
    if (state.briefingPageIndex >= briefing.pages.length - 1) {
      state.activeBriefingId = null;
      state.briefingPageIndex = 0;
      return createMissionControlState();
    }

    state.briefingPageIndex = Math.min(
      briefing.pages.length - 1,
      state.briefingPageIndex + 1,
    );
  }

  return createMissionControlState({
    pauseGameplay: briefing.pauseGameplay ?? true,
    blockPlayerInput: briefing.blockPlayerInput ?? true,
    cameraOverride: briefing.cameraOverride ?? null,
    briefing: {
      title: briefing.title,
      subtitle: briefing.subtitle,
      pages: briefing.pages,
      pageIndex: state.briefingPageIndex,
    },
  });
}

function matchConditions(
  state: MissionRuntimeState,
  conditions: readonly MissionCondition[],
  match: "all" | "any",
  context: MissionRuntimeContext,
): boolean {
  if (conditions.length === 0) {
    return true;
  }

  if (match === "any") {
    return conditions.some((condition) =>
      matchCondition(state, condition, context),
    );
  }

  return conditions.every((condition) =>
    matchCondition(state, condition, context),
  );
}

function matchCondition(
  state: MissionRuntimeState,
  condition: MissionCondition,
  context: MissionRuntimeContext,
): boolean {
  switch (condition.kind) {
    case "objective-completed":
      return state.objectiveStates.get(condition.objectiveId)?.completed ?? false;
    case "objective-failed":
      return state.objectiveStates.get(condition.objectiveId)?.failed ?? false;
    case "flag-state":
      return state.flags[condition.flag] === (condition.value ?? true);
    case "time-elapsed":
      return state.elapsedSeconds >= condition.seconds;
    case "entity-destroyed":
      return context.destroyedTargetIds?.has(condition.target.id) ?? false;
    case "entity-reached": {
      const targetPosition = context.resolvedTargetPositions?.get(condition.target.id);
      if (!targetPosition || !context.shipPosition) {
        return false;
      }
      return (
        distanceBetween(context.shipPosition, targetPosition) <=
        (condition.range ?? 180)
      );
    }
    case "marker-activated":
      return state.markerState.activatedMarkerIds.has(condition.markerId);
    case "orbit-held": {
      const key = getOrbitHoldKey(condition);
      return (
        (state.orbitHoldProgressSeconds.get(key) ?? 0) >= condition.durationSeconds
      );
    }
    default:
      return false;
  }
}

function areObjectiveDependenciesSatisfied(
  state: MissionRuntimeState,
  objective: MissionObjective,
): boolean {
  return (
    objective.dependsOn?.every(
      (dependencyId) => state.objectiveStates.get(dependencyId)?.completed ?? false,
    ) ?? true
  );
}

function updateOrbitHoldProgress(
  state: MissionRuntimeState,
  mission: MissionDefinition,
  context: MissionRuntimeContext,
): void {
  const orbitConditions = collectOrbitHoldConditions(mission);
  if (
    orbitConditions.length === 0 ||
    !context.shipPosition ||
    !context.systemRootPositions
  ) {
    return;
  }

  for (const condition of orbitConditions) {
    const rootPosition = context.systemRootPositions.get(condition.systemId);
    if (!rootPosition) {
      continue;
    }

    const key = getOrbitHoldKey(condition);
    const offset =
      Math.abs(distanceBetween(context.shipPosition, rootPosition) - condition.radius);
    const nextSeconds =
      offset <= condition.tolerance
        ? (state.orbitHoldProgressSeconds.get(key) ?? 0) + context.deltaSeconds
        : Math.max(0, (state.orbitHoldProgressSeconds.get(key) ?? 0) - context.deltaSeconds);
    state.orbitHoldProgressSeconds.set(
      key,
      Math.min(condition.durationSeconds, nextSeconds),
    );
  }
}

function collectOrbitHoldConditions(
  mission: MissionDefinition,
): Array<Extract<MissionCondition, { kind: "orbit-held" }>> {
  const conditions: Array<Extract<MissionCondition, { kind: "orbit-held" }>> = [];
  const collect = (entries: readonly MissionCondition[] | undefined) => {
    for (const entry of entries ?? []) {
      if (entry.kind === "orbit-held") {
        conditions.push(entry);
      }
    }
  };

  for (const objective of mission.objectives) {
    collect(objective.successWhen);
    collect(objective.failureWhen);
  }
  for (const trigger of mission.triggers ?? []) {
    collect(trigger.when);
  }
  collect(mission.victoryConditions);
  collect(mission.failureConditions);

  return conditions;
}

function getOrbitHoldKey(
  condition: Extract<MissionCondition, { kind: "orbit-held" }>,
): string {
  return `${condition.systemId}:${condition.radius}:${condition.tolerance}:${condition.durationSeconds}`;
}

function resolveActiveTarget(
  state: MissionRuntimeState,
  activeObjective: MissionObjective | undefined,
  context: MissionRuntimeContext,
): WorldMarkerView | null {
  if (!activeObjective?.markerIds || !context.resolvedMarkers) {
    return null;
  }

  for (const markerId of activeObjective.markerIds) {
    if (!state.markerVisibility.get(markerId)) {
      continue;
    }

    const marker = context.resolvedMarkers.get(markerId);
    if (marker) {
      return marker;
    }
  }

  return null;
}

function formatMissionText(
  template: string,
  flags: Readonly<Record<string, MissionFlagValue>>,
): string {
  if (template.length === 0) {
    return template;
  }

  return template.replace(
    MISSION_TEXT_FLAG_TOKEN_REGEX,
    (_match, flagName: string, defaultValue?: string) => {
      const value = flags[flagName];
      if (value === undefined || value === null) {
        return (defaultValue ?? "").trim();
      }

      return String(value);
    },
  );
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
