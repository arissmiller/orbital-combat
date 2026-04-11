import type { Vector2Like } from "../physics/vector2";

export type WorldMarkerShape =
  | "circle"
  | "orbitBand"
  | "diamond"
  | "square"
  | "directionArrow";

export type WorldMarkerVariant =
  | "pulse"
  | "gate"
  | "bracket";

export interface WorldMarkerView {
  id: string;
  label: string;
  shape: WorldMarkerShape;
  variant: WorldMarkerVariant;
  center: Vector2Like;
  radius: number;
  thickness?: number;
  rotationRadians?: number;
  radialLabel?: string;
  guideOrbitBand?: {
    center: Vector2Like;
    radius: number;
    thickness?: number;
    radialLabel?: string;
  };
}

export type WorldMarkerEventType =
  | "entered"
  | "exited"
  | "activated";

export interface WorldMarkerEvent {
  markerId: string;
  label: string;
  type: WorldMarkerEventType;
}

export interface WorldMarkerState {
  activeMarkerId: string | null;
  insideActiveMarker: boolean;
  activatedMarkerIds: Set<string>;
}

export function createWorldMarkerState(): WorldMarkerState {
  return {
    activeMarkerId: null,
    insideActiveMarker: false,
    activatedMarkerIds: new Set<string>(),
  };
}

export function resetWorldMarkerState(
  state: WorldMarkerState,
): void {
  state.activeMarkerId = null;
  state.insideActiveMarker = false;
  state.activatedMarkerIds.clear();
}

export function updateWorldMarkerState(options: {
  state: WorldMarkerState;
  shipPosition: Vector2Like;
  marker: WorldMarkerView | null;
  activated: boolean;
}): WorldMarkerEvent[] {
  const events: WorldMarkerEvent[] = [];
  const previousMarkerId = options.state.activeMarkerId;

  if (!options.marker) {
    options.state.activeMarkerId = null;
    options.state.insideActiveMarker = false;
    return events;
  }

  if (previousMarkerId !== options.marker.id) {
    options.state.activeMarkerId = options.marker.id;
    options.state.insideActiveMarker = false;
  }

  const insideMarker = isPointInsideWorldMarker(
    options.shipPosition,
    options.marker,
  );

  if (insideMarker && !options.state.insideActiveMarker) {
    events.push({
      markerId: options.marker.id,
      label: options.marker.label,
      type: "entered",
    });
  } else if (!insideMarker && options.state.insideActiveMarker) {
    events.push({
      markerId: options.marker.id,
      label: options.marker.label,
      type: "exited",
    });
  }

  options.state.insideActiveMarker = insideMarker;

  if (
    options.activated &&
    !options.state.activatedMarkerIds.has(options.marker.id)
  ) {
    options.state.activatedMarkerIds.add(options.marker.id);
    events.push({
      markerId: options.marker.id,
      label: options.marker.label,
      type: "activated",
    });
  }

  return events;
}

export function isPointInsideWorldMarker(
  point: Vector2Like,
  marker: WorldMarkerView,
): boolean {
  const dx = point.x - marker.center.x;
  const dy = point.y - marker.center.y;

  if (marker.shape === "orbitBand") {
    const thickness = Math.max(24, marker.thickness ?? 120);
    const distance = Math.hypot(dx, dy);
    return Math.abs(distance - marker.radius) <= thickness * 0.5;
  }

  if (marker.shape === "diamond") {
    return Math.abs(dx) + Math.abs(dy) <= marker.radius;
  }

  if (marker.shape === "square") {
    return Math.max(Math.abs(dx), Math.abs(dy)) <= marker.radius;
  }

  if (marker.shape === "directionArrow") {
    return Math.hypot(dx, dy) <= marker.radius;
  }

  return Math.hypot(dx, dy) <= marker.radius;
}
