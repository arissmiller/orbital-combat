import type { Vector2Like } from "../physics/vector2";
import { FLIGHT_BALANCE } from "./flight-balance";

export interface FlightInputState {
  progradeInput: boolean;
  retrogradeInput: boolean;
  leftInput: boolean;
  rightInput: boolean;
  eBrakeInput: boolean;
  gravityDiveInput: boolean;
  boostInput: boolean;
}

export interface ThrustVector {
  heading: number;
  throttle: number;
  label: string;
}

export function hasDirectionalFlightInput(input: FlightInputState): boolean {
  return (
    input.progradeInput ||
    input.retrogradeInput ||
    input.leftInput ||
    input.rightInput ||
    input.eBrakeInput ||
    input.gravityDiveInput
  );
}

export function getFlightInputSignature(input: FlightInputState): string {
  return [
    input.progradeInput ? "P" : "-",
    input.retrogradeInput ? "R" : "-",
    input.leftInput ? "L" : "-",
    input.rightInput ? "T" : "-",
    input.eBrakeInput ? "E" : "-",
    input.gravityDiveInput ? "G" : "-",
  ].join("");
}

export function readFlightInput(
  isPressed: (code: string) => boolean,
): FlightInputState {
  return {
    progradeInput: isPressed("KeyW") || isPressed("ArrowUp"),
    retrogradeInput: isPressed("KeyS") || isPressed("ArrowDown"),
    leftInput: isPressed("KeyA"),
    rightInput: isPressed("KeyD"),
    eBrakeInput: isPressed("Space"),
    gravityDiveInput: isPressed("KeyC"),
    boostInput: isPressed("ShiftLeft") || isPressed("ShiftRight"),
  };
}

export function updateStableMotionHeading(
  currentHeading: number,
  velocity: Vector2Like,
  minimumSpeed = FLIGHT_BALANCE.controls.stableHeadingMinSpeed,
): number {
  const speed = Math.hypot(velocity.x, velocity.y);

  if (speed < minimumSpeed) {
    return currentHeading;
  }

  return Math.atan2(velocity.y, velocity.x);
}

export function resolveTravelRelativeThrustVector(options: {
  input: FlightInputState;
  progradeHeading: number;
  lateralHeading: number;
  progradeRetrogradeIntensity: number;
  lateralIntensity: number;
}): ThrustVector | null {
  const progradeAxis = {
    x: Math.cos(options.progradeHeading),
    y: Math.sin(options.progradeHeading),
  };
  const lateralAxis = {
    x: Math.cos(options.lateralHeading + Math.PI / 2),
    y: Math.sin(options.lateralHeading + Math.PI / 2),
  };
  const progradeAmount =
    (options.input.progradeInput ? 1 : 0) -
    (options.input.retrogradeInput ? 1 : 0);
  const lateralAmount =
    (options.input.rightInput ? 1 : 0) -
    (options.input.leftInput ? 1 : 0);
  const x =
    progradeAxis.x * progradeAmount * options.progradeRetrogradeIntensity +
    lateralAxis.x * lateralAmount * options.lateralIntensity;
  const y =
    progradeAxis.y * progradeAmount * options.progradeRetrogradeIntensity +
    lateralAxis.y * lateralAmount * options.lateralIntensity;
  const magnitude = Math.hypot(x, y);

  if (magnitude === 0) {
    return null;
  }

  const normalizedX = x / magnitude;
  const normalizedY = y / magnitude;
  const components: string[] = [];

  if (progradeAmount > 0) {
    components.push("Prograde");
  } else if (progradeAmount < 0) {
    components.push("Retrograde");
  }

  if (lateralAmount > 0) {
    components.push("Right");
  } else if (lateralAmount < 0) {
    components.push("Left");
  }

  return {
    heading: Math.atan2(normalizedY, normalizedX),
    throttle: Math.min(1, magnitude),
    label: components.join(" + "),
  };
}
