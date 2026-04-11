import type { OrbitalBodyState } from "../physics/body";
import { PHYSICS_TUNING } from "../physics/physics-tuning";
import type { Vector2Like } from "../physics/vector2";

export interface GuidanceFidelityMeshOptions {
  gradientSampleDistance: number;
  adaptiveGradientStart: number;
  fullSimulationGradientThreshold: number;
}

export interface GuidanceFidelityMeshSample {
  gradientMagnitude: number;
  fidelityFactor: number;
  requiresFullSimulation: boolean;
}

export interface GuidanceFidelityMeshCell {
  center: Vector2Like;
  spacing: number;
  fidelityFactor: number;
  requiresFullSimulation: boolean;
}

export interface GuidanceFieldMeshNode {
  position: Vector2Like;
  fidelityFactor: number;
  requiresFullSimulation: boolean;
}

export interface GuidanceFieldMesh {
  columns: number;
  rows: number;
  spacing: number;
  nodes: GuidanceFieldMeshNode[];
}

export interface GuidanceFidelityMeshBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function sampleGuidanceFidelityMesh(
  gravityBodies: readonly Pick<OrbitalBodyState, "mass" | "position" | "affectsGravity">[],
  position: Vector2Like,
  options: GuidanceFidelityMeshOptions,
): GuidanceFidelityMeshSample {
  const gradientMagnitude = estimateGravityGradientMagnitude(
    gravityBodies,
    position,
    options.gradientSampleDistance,
  );
  const fidelityFactor = clamp(
    (gradientMagnitude - options.adaptiveGradientStart) /
      Math.max(
        0.0001,
        options.fullSimulationGradientThreshold - options.adaptiveGradientStart,
      ),
    0,
    1,
  );

  return {
    gradientMagnitude,
    fidelityFactor,
    requiresFullSimulation:
      gradientMagnitude >= options.fullSimulationGradientThreshold,
  };
}

export function estimateGuidanceWellBoundaryRadius(
  body: Pick<
    OrbitalBodyState,
    "id" | "systemId" | "mass" | "radius" | "position" | "affectsGravity"
  >,
  options: GuidanceFidelityMeshOptions,
): number | null {
  if (!body.affectsGravity || body.mass <= 0) {
    return null;
  }

  const minimumRadius = Math.max(
    body.radius + options.gradientSampleDistance,
    body.radius * 1.1,
  );
  const maximumRadius = 24000;
  let low = minimumRadius;
  let high = minimumRadius;

  if (
    estimateGravityGradientMagnitude(
      [body],
      { x: body.position.x + low, y: body.position.y },
      options.gradientSampleDistance,
    ) < options.fullSimulationGradientThreshold
  ) {
    return null;
  }

  while (high < maximumRadius) {
    const gradientMagnitude = estimateGravityGradientMagnitude(
      [body],
      { x: body.position.x + high, y: body.position.y },
      options.gradientSampleDistance,
    );

    if (gradientMagnitude < options.fullSimulationGradientThreshold) {
      break;
    }

    low = high;
    high *= 1.35;
  }

  if (high >= maximumRadius) {
    return maximumRadius;
  }

  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) * 0.5;
    const gradientMagnitude = estimateGravityGradientMagnitude(
      [body],
      { x: body.position.x + middle, y: body.position.y },
      options.gradientSampleDistance,
    );

    if (gradientMagnitude >= options.fullSimulationGradientThreshold) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return high;
}

export function sampleGuidanceFidelityMeshGrid(
  gravityBodies: readonly Pick<OrbitalBodyState, "mass" | "position" | "affectsGravity">[],
  bounds: GuidanceFidelityMeshBounds,
  spacing: number,
  options: GuidanceFidelityMeshOptions,
): GuidanceFidelityMeshCell[] {
  const cells: GuidanceFidelityMeshCell[] = [];
  const sampleSpacing = Math.max(24, spacing);

  for (
    let y = bounds.minY + sampleSpacing * 0.5;
    y <= bounds.maxY;
    y += sampleSpacing
  ) {
    for (
      let x = bounds.minX + sampleSpacing * 0.5;
      x <= bounds.maxX;
      x += sampleSpacing
    ) {
      const sample = sampleGuidanceFidelityMesh(
        gravityBodies,
        { x, y },
        options,
      );
      cells.push({
        center: { x, y },
        spacing: sampleSpacing,
        fidelityFactor: sample.fidelityFactor,
        requiresFullSimulation: sample.requiresFullSimulation,
      });
    }
  }

  return cells;
}

export function sampleGuidanceFieldMeshGrid(
  gravityBodies: readonly Pick<OrbitalBodyState, "mass" | "position" | "affectsGravity">[],
  bounds: GuidanceFidelityMeshBounds,
  spacing: number,
  origin: Vector2Like,
  options: GuidanceFidelityMeshOptions,
  displacementScale: number,
  maxDisplacementFraction: number,
): GuidanceFieldMesh {
  const sampleSpacing = Math.max(24, spacing);
  const startX =
    origin.x +
    Math.floor((bounds.minX - origin.x) / sampleSpacing) * sampleSpacing;
  const startY =
    origin.y +
    Math.floor((bounds.minY - origin.y) / sampleSpacing) * sampleSpacing;
  const columns = Math.max(
    2,
    Math.floor((bounds.maxX - startX) / sampleSpacing) + 1,
  );
  const rows = Math.max(
    2,
    Math.floor((bounds.maxY - startY) / sampleSpacing) + 1,
  );
  const nodes: GuidanceFieldMeshNode[] = [];

  for (let row = 0; row < rows; row += 1) {
    const y = startY + row * sampleSpacing;
    for (let column = 0; column < columns; column += 1) {
      const x = startX + column * sampleSpacing;
      const acceleration = computeGravityAcceleration(gravityBodies, { x, y });
      const magnitude = Math.hypot(acceleration.x, acceleration.y);
      const sample = sampleGuidanceFidelityMesh(
        gravityBodies,
        { x, y },
        options,
      );
      const displacement = clamp(
        Math.log1p(magnitude) * sampleSpacing * displacementScale,
        0,
        sampleSpacing * maxDisplacementFraction,
      );
      const normalizedX = magnitude > 0.0001 ? acceleration.x / magnitude : 0;
      const normalizedY = magnitude > 0.0001 ? acceleration.y / magnitude : 0;

      nodes.push({
        position: {
          x: x + normalizedX * displacement,
          y: y + normalizedY * displacement,
        },
        fidelityFactor: sample.fidelityFactor,
        requiresFullSimulation: sample.requiresFullSimulation,
      });
    }
  }

  return {
    columns,
    rows,
    spacing: sampleSpacing,
    nodes,
  };
}

function estimateGravityGradientMagnitude(
  gravityBodies: readonly Pick<OrbitalBodyState, "mass" | "position" | "affectsGravity">[],
  position: Vector2Like,
  sampleDistance: number,
): number {
  if (gravityBodies.length === 0) {
    return 0;
  }

  const h = Math.max(1, sampleDistance);
  const accelerationXPositive = computeGravityAcceleration(
    gravityBodies,
    { x: position.x + h, y: position.y },
  );
  const accelerationXNegative = computeGravityAcceleration(
    gravityBodies,
    { x: position.x - h, y: position.y },
  );
  const accelerationYPositive = computeGravityAcceleration(
    gravityBodies,
    { x: position.x, y: position.y + h },
  );
  const accelerationYNegative = computeGravityAcceleration(
    gravityBodies,
    { x: position.x, y: position.y - h },
  );

  const xGradient =
    distanceBetweenVectors(accelerationXPositive, accelerationXNegative) /
    (h * 2);
  const yGradient =
    distanceBetweenVectors(accelerationYPositive, accelerationYNegative) /
    (h * 2);

  return Math.max(xGradient, yGradient);
}

function computeGravityAcceleration(
  gravityBodies: readonly Pick<OrbitalBodyState, "mass" | "position" | "affectsGravity">[],
  position: Vector2Like,
): Vector2Like {
  let accelerationX = 0;
  let accelerationY = 0;

  for (const body of gravityBodies) {
    if (!body.affectsGravity) {
      continue;
    }

    const offsetX = body.position.x - position.x;
    const offsetY = body.position.y - position.y;
    const distanceSquared =
      offsetX * offsetX +
      offsetY * offsetY +
      PHYSICS_TUNING.world.softening * PHYSICS_TUNING.world.softening;
    const distance = Math.sqrt(distanceSquared) || 1;
    const magnitude =
      (PHYSICS_TUNING.world.gravitationalConstant * body.mass) /
      distanceSquared;

    accelerationX += (offsetX / distance) * magnitude;
    accelerationY += (offsetY / distance) * magnitude;
  }

  return {
    x: accelerationX,
    y: accelerationY,
  };
}

function distanceBetweenVectors(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
