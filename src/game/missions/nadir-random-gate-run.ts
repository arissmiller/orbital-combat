import type { Vector2Like } from "../physics/vector2";
import {
  createMissionControlState,
  type MissionControlState,
} from "./mission-control";
import {
  createWorldMarkerState,
  resetWorldMarkerState,
  type WorldMarkerEvent,
  type WorldMarkerState,
  type WorldMarkerView,
  updateWorldMarkerState,
} from "../world/world-marker";

interface NadirRandomGateRunContext {
  deltaSeconds: number;
  shipPosition: Vector2Like;
  nadirPosition: Vector2Like;
}

interface NadirRandomGateRunGate {
  id: string;
  label: string;
  shape: WorldMarkerView["shape"];
  variant: WorldMarkerView["variant"];
  angleRadians: number;
  orbitRadius: number;
  markerRadius: number;
  holdSeconds: number;
}

export interface NadirRandomGateRunState {
  currentGateIndex: number;
  gateProgressSeconds: number;
  completed: boolean;
  activeGateId: string | null;
  gateCourse: NadirRandomGateRunGate[];
  targetState: WorldMarkerState;
}

export interface NadirRandomGateRunSnapshot {
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

const RANDOM_GATE_COUNT = 10;
const RANDOM_GATE_MIN_RADIUS = 680;
const RANDOM_GATE_MAX_RADIUS = 1920;
const RANDOM_GATE_MARKER_RADIUS = 156;
const RANDOM_GATE_HOLD_SECONDS = 0.17;
const RANDOM_GATE_MIN_ANGULAR_SEPARATION = Math.PI / 6;

export function createNadirRandomGateRunState(): NadirRandomGateRunState {
  const gateCourse = buildRandomGateCourse(RANDOM_GATE_COUNT);
  return {
    currentGateIndex: 0,
    gateProgressSeconds: 0,
    completed: false,
    activeGateId: gateCourse[0]?.id ?? null,
    gateCourse,
    targetState: createWorldMarkerState(),
  };
}

export function resetNadirRandomGateRunState(
  state: NadirRandomGateRunState,
): void {
  state.currentGateIndex = 0;
  state.gateProgressSeconds = 0;
  state.completed = false;
  state.gateCourse = buildRandomGateCourse(RANDOM_GATE_COUNT);
  state.activeGateId = state.gateCourse[0]?.id ?? null;
  resetWorldMarkerState(state.targetState);
}

export function updateNadirRandomGateRun(
  state: NadirRandomGateRunState,
  context: NadirRandomGateRunContext,
): NadirRandomGateRunSnapshot {
  const totalGates = state.gateCourse.length;
  const activeGate = state.completed
    ? null
    : state.gateCourse[state.currentGateIndex] ?? null;
  const activeGateCenter = activeGate
    ? getGateCenter(context.nadirPosition, activeGate)
    : null;
  const activeGateSatisfied =
    !!activeGateCenter &&
    !!activeGate &&
    distanceBetween(context.shipPosition, activeGateCenter) <= activeGate.markerRadius;

  if (!state.completed && activeGate && context.deltaSeconds > 0) {
    if (activeGateSatisfied) {
      state.gateProgressSeconds = Math.min(
        activeGate.holdSeconds,
        state.gateProgressSeconds + context.deltaSeconds,
      );
    } else {
      state.gateProgressSeconds = Math.max(
        0,
        state.gateProgressSeconds - context.deltaSeconds * 0.9,
      );
    }

    if (state.gateProgressSeconds >= activeGate.holdSeconds) {
      state.currentGateIndex += 1;
      state.gateProgressSeconds = 0;
      if (state.currentGateIndex >= totalGates) {
        state.completed = true;
        state.activeGateId = null;
      } else {
        state.activeGateId = state.gateCourse[state.currentGateIndex]?.id ?? null;
      }
    }
  }

  const nextActiveGate = state.completed
    ? null
    : state.gateCourse[state.currentGateIndex] ?? null;
  const nextGateCenter = nextActiveGate
    ? getGateCenter(context.nadirPosition, nextActiveGate)
    : null;
  const activeTarget: WorldMarkerView | null = nextActiveGate && nextGateCenter
    ? {
        id: `target:${nextActiveGate.id}`,
        label: nextActiveGate.label,
        shape: nextActiveGate.shape,
        variant: nextActiveGate.variant,
        center: nextGateCenter,
        radius: nextActiveGate.markerRadius,
      }
    : null;
  const targetEvents = updateWorldMarkerState({
    state: state.targetState,
    shipPosition: context.shipPosition,
    marker: activeTarget,
    activated: !!nextActiveGate && !!nextGateCenter &&
      distanceBetween(context.shipPosition, nextGateCenter) <=
        nextActiveGate.markerRadius,
  });

  const completedSteps = state.completed
    ? totalGates
    : clamp(state.currentGateIndex, 0, totalGates);
  const activeGateProgress = nextActiveGate
    ? clamp(
        state.gateProgressSeconds / Math.max(nextActiveGate.holdSeconds, 0.0001),
        0,
        1,
      )
    : 1;
  const currentProgress = totalGates > 0
    ? clamp((completedSteps + activeGateProgress) / totalGates, 0, 1)
    : 1;

  return {
    title: "Nadir Gate Run",
    subtitle: "Mission 3: Fly Through 10 Random Gates",
    currentInstruction: state.completed
      ? "Mission complete. Gate circuit cleared."
      : `Fly through Gate ${Math.min(totalGates, state.currentGateIndex + 1)} of ${totalGates} around Nadir.`,
    steps: state.gateCourse.map((gate, index) => ({
      label: gate.label,
      completed: state.completed || index < state.currentGateIndex,
      active: !state.completed && index === state.currentGateIndex,
    })),
    currentProgress,
    completedSteps,
    totalSteps: totalGates,
    completed: state.completed,
    activeTarget,
    targetEvents,
    control: createMissionControlState(),
  };
}

function buildRandomGateCourse(count: number): NadirRandomGateRunGate[] {
  const random = createSeededRandom((Math.random() * 0xffffffff) >>> 0);
  const course: NadirRandomGateRunGate[] = [];
  const shapePool: Array<WorldMarkerView["shape"]> = ["diamond", "square"];

  for (let index = 0; index < count; index += 1) {
    let chosenAngle = random() * Math.PI * 2;
    let chosenRadius = lerp(
      RANDOM_GATE_MIN_RADIUS,
      RANDOM_GATE_MAX_RADIUS,
      random(),
    );

    let attempts = 0;
    while (attempts < 72) {
      const overlapsExisting = course.some((existingGate) => {
        const angleDelta = circularAngleDistance(
          chosenAngle,
          existingGate.angleRadians,
        );
        const radiusDelta = Math.abs(chosenRadius - existingGate.orbitRadius);
        return (
          angleDelta < RANDOM_GATE_MIN_ANGULAR_SEPARATION &&
          radiusDelta < 440
        );
      });

      if (!overlapsExisting) {
        break;
      }

      chosenAngle = random() * Math.PI * 2;
      chosenRadius = lerp(
        RANDOM_GATE_MIN_RADIUS,
        RANDOM_GATE_MAX_RADIUS,
        random(),
      );
      attempts += 1;
    }

    course.push({
      id: `nadir-random-gate-${index + 1}`,
      label: `Gate ${index + 1}`,
      shape: shapePool[Math.floor(random() * shapePool.length)] ?? "diamond",
      variant: "gate",
      angleRadians: chosenAngle,
      orbitRadius: chosenRadius,
      markerRadius: RANDOM_GATE_MARKER_RADIUS,
      holdSeconds: RANDOM_GATE_HOLD_SECONDS,
    });
  }

  return course;
}

function getGateCenter(
  nadirPosition: Vector2Like,
  gate: NadirRandomGateRunGate,
): Vector2Like {
  return {
    x: nadirPosition.x + Math.cos(gate.angleRadians) * gate.orbitRadius,
    y: nadirPosition.y + Math.sin(gate.angleRadians) * gate.orbitRadius,
  };
}

function circularAngleDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % (Math.PI * 2);
  return delta > Math.PI ? Math.PI * 2 - delta : delta;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
