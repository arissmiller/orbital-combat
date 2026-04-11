import {
  cloneBody,
  createBody,
  type OrbitalBodyDefinition,
  type OrbitalBodyState,
} from "./body";
import { add, length, scale, subtract, vec, type Vector2Like } from "./vector2";

export interface OrbitalWorldOptions {
  gravitationalConstant: number;
  softening?: number;
}

export interface PredictionOverrides {
  headingRadians?: number;
  throttle?: number;
}

export interface PredictedHazard {
  bodyId: string;
  distance: number;
  kind: "danger" | "impact";
}

export interface TrajectoryPrediction {
  positions: Vector2Like[];
  hazard: PredictedHazard | null;
}

export interface CollisionEvent {
  aId: string;
  bId: string;
  relativeSpeed: number;
  impactPosition: Vector2Like;
}

export class OrbitalWorld {
  private readonly bodies = new Map<string, OrbitalBodyState>();
  private readonly gravitationalConstant: number;
  private readonly softening: number;
  private collisionEvents: CollisionEvent[] = [];

  public constructor(options: OrbitalWorldOptions) {
    this.gravitationalConstant = options.gravitationalConstant;
    this.softening = options.softening ?? 1;
  }

  public addBody(definition: OrbitalBodyDefinition): OrbitalBodyState {
    const body = createBody(definition);
    this.bodies.set(body.id, body);
    return body;
  }

  public getBody(id: string): OrbitalBodyState | undefined {
    return this.bodies.get(id);
  }

  public removeBody(id: string): void {
    this.bodies.delete(id);
  }

  public listBodies(): readonly OrbitalBodyState[] {
    return [...this.bodies.values()];
  }

  public clone(): OrbitalWorld {
    const world = new OrbitalWorld({
      gravitationalConstant: this.gravitationalConstant,
      softening: this.softening,
    });

    for (const body of this.bodies.values()) {
      world.bodies.set(body.id, cloneBody(body));
    }

    return world;
  }

  public step(deltaSeconds: number): void {
    const bodies = this.listBodies();
    const previousPositions = new Map<string, Vector2Like>();
    this.collisionEvents = [];

    for (const body of bodies) {
      previousPositions.set(body.id, {
        x: body.position.x,
        y: body.position.y,
      });
      body.acceleration = body.isStatic || body.crashed
        ? vec()
        : this.computeAcceleration(body, bodies);
    }

    for (const body of bodies) {
      if (body.isStatic || body.crashed) {
        continue;
      }

      body.velocity = add(body.velocity, scale(body.acceleration, deltaSeconds));
      body.position = add(body.position, scale(body.velocity, deltaSeconds));
    }

    this.resolveCrashes(bodies, previousPositions);
  }

  public consumeCollisionEvents(): CollisionEvent[] {
    const events = this.collisionEvents;
    this.collisionEvents = [];
    return events;
  }

  public getOrbitalSpeed(orbiter: OrbitalBodyState, around: OrbitalBodyState): number {
    const distance = length(subtract(orbiter.position, around.position));
    return Math.sqrt((this.gravitationalConstant * around.mass) / distance);
  }

  public setThrottle(id: string, throttle: number): void {
    const body = this.requireBody(id);

    if (!body.propulsion) {
      return;
    }

    body.propulsion.throttle = clamp(throttle, -1, 1);
  }

  public setHeading(id: string, headingRadians: number): void {
    const body = this.requireBody(id);

    if (!body.propulsion) {
      return;
    }

    body.propulsion.heading = headingRadians;
  }

  public predictPositions(
    targetId: string,
    steps: number,
    deltaSeconds: number,
    sampleRate = 1,
    overrides?: PredictionOverrides,
  ): Vector2Like[] {
    return this.predictTrajectory(
      targetId,
      steps,
      deltaSeconds,
      sampleRate,
      overrides,
    ).positions;
  }

  public predictTrajectory(
    targetId: string,
    steps: number,
    deltaSeconds: number,
    sampleRate = 1,
    overrides?: PredictionOverrides,
  ): TrajectoryPrediction {
    const prediction = this.clone();
    const positions: Vector2Like[] = [];
    const targetBody = prediction.getBody(targetId);

    if (!targetBody) {
      return {
        positions,
        hazard: null,
      };
    }

    if (overrides?.headingRadians !== undefined) {
      prediction.setHeading(targetId, overrides.headingRadians);
    }

    if (overrides?.throttle !== undefined) {
      prediction.setThrottle(targetId, overrides.throttle);
    }

    for (let index = 0; index < steps; index += 1) {
      prediction.step(deltaSeconds);

      const target = prediction.getBody(targetId);

      if (!target) {
        break;
      }

      const hazard = prediction.detectHazard(target);

      if (index % sampleRate === 0) {
        positions.push({
          x: target.position.x,
          y: target.position.y,
        });
      }

      if (hazard) {
        return {
          positions,
          hazard,
        };
      }
    }

    return {
      positions,
      hazard: null,
    };
  }

  private computeAcceleration(
    target: OrbitalBodyState,
    bodies: readonly OrbitalBodyState[],
  ): Vector2Like {
    let acceleration = this.computeThrustAcceleration(target);

    if (!target.receivesGravity) {
      return acceleration;
    }

    for (const source of bodies) {
      if (source.id === target.id) {
        continue;
      }

      if (source.systemId !== target.systemId || !source.affectsGravity) {
        continue;
      }

      const offset = subtract(source.position, target.position);
      const distanceSquared =
        offset.x * offset.x + offset.y * offset.y + this.softening * this.softening;
      const distance = Math.sqrt(distanceSquared);
      const accelerationMagnitude =
        (this.gravitationalConstant * source.mass) / distanceSquared;
      const direction = scale(offset, 1 / distance);

      acceleration = add(
        acceleration,
        scale(direction, accelerationMagnitude),
      );
    }

    return acceleration;
  }

  private computeThrustAcceleration(target: OrbitalBodyState): Vector2Like {
    if (
      target.crashed ||
      !target.propulsion ||
      target.propulsion.maxThrust === 0 ||
      target.mass === 0
    ) {
      return vec();
    }

    const thrustForce = target.propulsion.maxThrust * target.propulsion.throttle;
    const thrustAcceleration = thrustForce / target.mass;

    return {
      x: Math.cos(target.propulsion.heading) * thrustAcceleration,
      y: Math.sin(target.propulsion.heading) * thrustAcceleration,
    };
  }

  private requireBody(id: string): OrbitalBodyState {
    const body = this.bodies.get(id);

    if (!body) {
      throw new Error(`Unknown body "${id}"`);
    }

    return body;
  }

  private detectHazard(target: OrbitalBodyState): PredictedHazard | null {
    for (const body of this.bodies.values()) {
      if (body.id === target.id || body.systemId !== target.systemId) {
        continue;
      }

      if (
        target.collisionExclusions.includes(body.id) ||
        body.collisionExclusions.includes(target.id)
      ) {
        continue;
      }

      const distance = length(subtract(target.position, body.position));
      const impactRadius = target.collisionRadius + body.collisionRadius;
      const dangerRadius = impactRadius * 2.2;

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

  private resolveCrashes(
    bodies: readonly OrbitalBodyState[],
    previousPositions: ReadonlyMap<string, Vector2Like>,
  ): void {
    for (const target of bodies) {
      if (target.crashed) {
        continue;
      }

      for (const other of bodies) {
        if (
          other.id === target.id ||
          other.systemId !== target.systemId
        ) {
          continue;
        }

        if (
          target.collisionExclusions.includes(other.id) ||
          other.collisionExclusions.includes(target.id)
        ) {
          continue;
        }

        const impactRadius = target.collisionRadius + other.collisionRadius;
        const targetStart = previousPositions.get(target.id) ?? target.position;
        const otherStart = previousPositions.get(other.id) ?? other.position;

        const impactFraction = getCollisionFractionDuringStep(
          targetStart,
          target.position,
          otherStart,
          other.position,
          impactRadius,
        );

        if (impactFraction === null) {
          continue;
        }

        const relativeVelocity = subtract(target.velocity, other.velocity);
        const relativeSpeed = length(relativeVelocity);
        const impactPosition = {
          x: targetStart.x + (target.position.x - targetStart.x) * impactFraction,
          y: targetStart.y + (target.position.y - targetStart.y) * impactFraction,
        };
        this.collisionEvents.push({
          aId: target.id,
          bId: other.id,
          relativeSpeed,
          impactPosition,
        });

        if (!target.isStatic) {
          target.crashed = {
            otherBodyId: other.id,
            relativeSpeed,
          };
          target.velocity = vec();
          target.acceleration = vec();

          if (target.propulsion) {
            target.propulsion.throttle = 0;
          }
        }

        if (!other.isStatic && !other.crashed) {
          other.crashed = {
            otherBodyId: target.id,
            relativeSpeed,
          };
          other.velocity = vec();
          other.acceleration = vec();

          if (other.propulsion) {
            other.propulsion.throttle = 0;
          }
        }

        break;
      }
    }
  }
}

function getCollisionFractionDuringStep(
  targetStart: Vector2Like,
  targetEnd: Vector2Like,
  otherStart: Vector2Like,
  otherEnd: Vector2Like,
  impactRadius: number,
): number | null {
  const relativeStart = subtract(targetStart, otherStart);
  const relativeEnd = subtract(targetEnd, otherEnd);
  const relativeDelta = subtract(relativeEnd, relativeStart);

  const a =
    relativeDelta.x * relativeDelta.x + relativeDelta.y * relativeDelta.y;
  const b =
    2 * (relativeStart.x * relativeDelta.x + relativeStart.y * relativeDelta.y);
  const c =
    relativeStart.x * relativeStart.x +
    relativeStart.y * relativeStart.y -
    impactRadius * impactRadius;

  if (c <= 0) {
    return 0;
  }

  if (a === 0) {
    return null;
  }

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / (2 * a);
  const t2 = (-b + sqrtDiscriminant) / (2 * a);

  if (t1 >= 0 && t1 <= 1) {
    return t1;
  }

  if (t2 >= 0 && t2 <= 1) {
    return t2;
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
