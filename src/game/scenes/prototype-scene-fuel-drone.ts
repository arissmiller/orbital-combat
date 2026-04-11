import { Graphics } from "pixi.js";
import type { Vector2Like } from "../physics/vector2";
import { refillEngineFuel, type ShipSystemsState } from "../ships/systems";

type FuelDronePhase = "idle" | "inbound" | "escort";

export interface FuelDroneSupportConfig {
  laneRadius: number;
  laneTolerance: number;
  laneHoldSecondsRequired: number;
  approachSeconds: number;
  escortSeconds: number;
  refuelRange: number;
  refuelPerSecond: number;
}

export interface FuelDroneSupportState {
  phase: FuelDronePhase;
  phaseSeconds: number;
  laneHoldSeconds: number;
  escortSeconds: number;
  position: Vector2Like | null;
  transferActive: boolean;
}

export const TRAINING_FUEL_DRONE_SUPPORT_CONFIG: FuelDroneSupportConfig = {
  laneRadius: 980,
  laneTolerance: 200,
  laneHoldSecondsRequired: 3.4,
  approachSeconds: 2.1,
  escortSeconds: 9,
  refuelRange: 170,
  refuelPerSecond: 0.26,
};

export function createFuelDroneSupportState(): FuelDroneSupportState {
  return {
    phase: "idle",
    phaseSeconds: 0,
    laneHoldSeconds: 0,
    escortSeconds: 0,
    position: null,
    transferActive: false,
  };
}

export function resetFuelDroneSupportState(
  state: FuelDroneSupportState,
): void {
  state.phase = "idle";
  state.phaseSeconds = 0;
  state.laneHoldSeconds = 0;
  state.escortSeconds = 0;
  state.position = null;
  state.transferActive = false;
}

export function updateFuelDroneSupport(options: {
  state: FuelDroneSupportState;
  deltaSeconds: number;
  shipPosition: Vector2Like;
  shipVelocity: Vector2Like;
  shipFuelFraction: number;
  shipSystems: ShipSystemsState;
  serviceWorldPosition: Vector2Like | null;
  inServiceSystem: boolean;
  paused: boolean;
  disabled: boolean;
  config?: FuelDroneSupportConfig;
}): void {
  const {
    state,
    deltaSeconds,
    shipPosition,
    shipVelocity,
    shipFuelFraction,
    shipSystems,
    serviceWorldPosition,
    inServiceSystem,
    paused,
    disabled,
  } = options;
  const config = options.config ?? TRAINING_FUEL_DRONE_SUPPORT_CONFIG;

  if (!serviceWorldPosition) {
    resetFuelDroneSupportState(state);
    return;
  }

  if (paused || disabled) {
    state.transferActive = false;
    return;
  }

  const distanceToServiceWorld = distanceBetween(shipPosition, serviceWorldPosition);
  const inServiceLane =
    inServiceSystem &&
    Math.abs(distanceToServiceWorld - config.laneRadius) <= config.laneTolerance;

  if (state.phase === "idle") {
    state.transferActive = false;
    if (inServiceLane && shipFuelFraction < 0.995) {
      state.laneHoldSeconds = Math.min(
        config.laneHoldSecondsRequired,
        state.laneHoldSeconds + deltaSeconds,
      );
    } else {
      state.laneHoldSeconds = Math.max(
        0,
        state.laneHoldSeconds - deltaSeconds * 1.4,
      );
    }

    if (state.laneHoldSeconds >= config.laneHoldSecondsRequired) {
      state.phase = "inbound";
      state.phaseSeconds = 0;
      state.escortSeconds = 0;
      state.position = {
        x: serviceWorldPosition.x,
        y: serviceWorldPosition.y,
      };
      state.laneHoldSeconds = 0;
    }
  } else {
    state.laneHoldSeconds = 0;

    if (!inServiceSystem) {
      resetFuelDroneSupportState(state);
      return;
    }
  }

  if (state.phase === "inbound") {
    state.transferActive = false;
    state.phaseSeconds += deltaSeconds;
    const approachProgress = clamp(
      state.phaseSeconds / config.approachSeconds,
      0,
      1,
    );
    const escortTarget = resolveFuelDroneEscortPosition(
      shipPosition,
      shipVelocity,
      serviceWorldPosition,
    );
    state.position = lerpPoint(
      serviceWorldPosition,
      escortTarget,
      easeOutCubic(approachProgress),
    );
    if (approachProgress >= 1) {
      state.phase = "escort";
      state.phaseSeconds = 0;
      state.escortSeconds = 0;
    }
    return;
  }

  if (state.phase === "escort" && state.position) {
    state.escortSeconds += deltaSeconds;
    const escortTarget = resolveFuelDroneEscortPosition(
      shipPosition,
      shipVelocity,
      serviceWorldPosition,
    );
    state.position = lerpPoint(
      state.position,
      escortTarget,
      clamp(deltaSeconds * 3.8, 0, 1),
    );
    state.transferActive =
      distanceBetween(state.position, shipPosition) <= config.refuelRange;

    if (state.transferActive) {
      refillEngineFuel(
        shipSystems,
        config.refuelPerSecond * deltaSeconds,
      );
    }

    if (shipFuelFraction >= 0.995 || state.escortSeconds >= config.escortSeconds) {
      resetFuelDroneSupportState(state);
    }
    return;
  }

  state.transferActive = false;
}

export function syncFuelDroneGraphic(options: {
  graphics: Graphics;
  state: FuelDroneSupportState;
  visible: boolean;
  config?: FuelDroneSupportConfig;
}): void {
  const { graphics, state, visible } = options;
  const config = options.config ?? TRAINING_FUEL_DRONE_SUPPORT_CONFIG;

  graphics.clear();

  if (!visible || !state.position) {
    graphics.visible = false;
    return;
  }

  graphics.position.set(state.position.x, state.position.y);
  graphics
    .circle(0, 0, config.refuelRange)
    .stroke({
      color: 0x8df7cb,
      width: 2,
      alpha: state.transferActive ? 0.48 : 0.22,
    });
  graphics
    .circle(0, 0, 12)
    .fill({
      color: 0x07120e,
      alpha: 0.8,
    })
    .stroke({
      color: 0x89ffd0,
      width: 2,
      alpha: 0.98,
    });
  graphics
    .rect(-2, -10, 4, 20)
    .fill(0x89ffd0);
  graphics
    .rect(-10, -2, 20, 4)
    .fill(0x89ffd0);
  graphics.visible = true;
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPoint(a: Vector2Like, b: Vector2Like, t: number): Vector2Like {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function normalizeVector(
  vector: Vector2Like,
  fallback: Vector2Like,
): Vector2Like {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.0001) {
    return fallback;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function resolveFuelDroneEscortPosition(
  shipPosition: Vector2Like,
  shipVelocity: Vector2Like,
  worldPosition: Vector2Like,
): Vector2Like {
  const radial = normalizeVector(
    {
      x: shipPosition.x - worldPosition.x,
      y: shipPosition.y - worldPosition.y,
    },
    { x: 0, y: -1 },
  );
  const velocityDirection = normalizeVector(
    shipVelocity,
    { x: -radial.y, y: radial.x },
  );
  return {
    x: shipPosition.x - velocityDirection.x * 74 + radial.x * 58,
    y: shipPosition.y - velocityDirection.y * 74 + radial.y * 58,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
