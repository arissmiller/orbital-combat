import { vec, type Vector2Like } from "./vector2";

export interface PropulsionDefinition {
  heading?: number;
  throttle?: number;
  maxThrust?: number;
}

export interface OrbitalBodyDefinition {
  id: string;
  mass: number;
  radius: number;
  collisionRadius?: number;
  position: Vector2Like;
  velocity?: Vector2Like;
  isStatic?: boolean;
  systemId?: string;
  affectsGravity?: boolean;
  receivesGravity?: boolean;
  propulsion?: PropulsionDefinition;
  collisionExclusions?: string[];
}

export interface PropulsionState {
  heading: number;
  throttle: number;
  maxThrust: number;
}

export interface CrashState {
  otherBodyId: string;
  relativeSpeed: number;
}

export interface OrbitalBodyState {
  id: string;
  mass: number;
  radius: number;
  collisionRadius: number;
  position: Vector2Like;
  velocity: Vector2Like;
  acceleration: Vector2Like;
  isStatic: boolean;
  systemId: string;
  affectsGravity: boolean;
  receivesGravity: boolean;
  propulsion: PropulsionState | null;
  crashed: CrashState | null;
  collisionExclusions: string[];
}

export function createBody(
  definition: OrbitalBodyDefinition,
): OrbitalBodyState {
  return {
    id: definition.id,
    mass: definition.mass,
    radius: definition.radius,
    collisionRadius: definition.collisionRadius ?? definition.radius,
    position: vec(definition.position.x, definition.position.y),
    velocity: definition.velocity
      ? vec(definition.velocity.x, definition.velocity.y)
      : vec(),
    acceleration: vec(),
    isStatic: definition.isStatic ?? false,
    systemId: definition.systemId ?? "default",
    affectsGravity: definition.affectsGravity ?? true,
    receivesGravity: definition.receivesGravity ?? true,
    propulsion: definition.propulsion
      ? {
          heading: definition.propulsion.heading ?? 0,
          throttle: definition.propulsion.throttle ?? 0,
          maxThrust: definition.propulsion.maxThrust ?? 0,
        }
      : null,
    crashed: null,
    collisionExclusions: [...(definition.collisionExclusions ?? [])],
  };
}

export function cloneBody(body: OrbitalBodyState): OrbitalBodyState {
  return {
    id: body.id,
    mass: body.mass,
    radius: body.radius,
    collisionRadius: body.collisionRadius,
    position: vec(body.position.x, body.position.y),
    velocity: vec(body.velocity.x, body.velocity.y),
    acceleration: vec(body.acceleration.x, body.acceleration.y),
    isStatic: body.isStatic,
    systemId: body.systemId,
    affectsGravity: body.affectsGravity,
    receivesGravity: body.receivesGravity,
    propulsion: body.propulsion
      ? {
          heading: body.propulsion.heading,
          throttle: body.propulsion.throttle,
          maxThrust: body.propulsion.maxThrust,
        }
      : null,
    crashed: body.crashed
      ? {
          otherBodyId: body.crashed.otherBodyId,
          relativeSpeed: body.crashed.relativeSpeed,
        }
      : null,
    collisionExclusions: [...body.collisionExclusions],
  };
}
