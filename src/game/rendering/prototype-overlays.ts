import { Graphics } from "pixi.js";
import { COMBAT_BALANCE } from "../combat/combat-balance";
import type { CelestialConfig, DefenseConfig } from "../maps/types";
import type { Vector2Like } from "../physics/vector2";
import { WORLD_ENTITY_STYLES } from "./world-entity-styles";
import { WORLD_OVERLAY_STYLES } from "./world-overlay-styles";
import type { WorldMarkerView } from "../world/world-marker";
import type { GuidanceFieldMesh } from "../forecasting/guidance-fidelity-mesh";

interface CelestialLike {
  config: CelestialConfig;
  body: {
    id: string;
    position: Vector2Like;
    radius: number;
  };
}

interface DefenseLike {
  config: DefenseConfig;
  body: {
    position: Vector2Like;
    radius: number;
  };
  destroyed: boolean;
}

interface ScannerContactLike {
  visual: DefenseLike | CelestialLike;
  distance: number;
  visible: boolean;
}

interface LikelyEnemyMarkerLike {
  position: Vector2Like;
  radius: number;
  enemyClass?: EnemyOverlayClass;
}

interface TorpedoScannerContactLike {
  missile: {
    id: string;
    body: {
      position: Vector2Like;
    };
    detonationPosition: Vector2Like | null;
  };
}

interface LauncherStateLike {
  lockProgress: number;
  interceptSolution: {
    interceptPoint: Vector2Like;
  } | null;
  beamEngagement: number;
  firing: boolean;
}

interface DefenseLockStateLike {
  progress: number;
}

interface TorpedoLockStateLike {
  progress: number;
  solution: {
    interceptPoint: Vector2Like;
  } | null;
}

interface DisintegratorTargetLike {
  id: string;
  position: Vector2Like;
}

interface DisintegratorEngagementStateLike {
  progress: number;
}

type PlayerWeaponMode = "disintegrator" | "disruptor";
type EnemyOverlayClass =
  | "surfaceLauncher"
  | "orbitalLauncher"
  | "raider"
  | "supportStation"
  | "trainingTarget"
  | "unknown";

export function drawOrbitalGuides(
  graphics: Graphics,
  visuals: readonly CelestialLike[],
): void {
  graphics.clear();
  const visualById = new Map(
    visuals.map((visual) => [visual.config.id, visual] as const),
  );

  for (const visual of visuals) {
    if (visual.config.hidden || visual.config.parentId === null) {
      continue;
    }

    const parent = visualById.get(visual.config.parentId);

    if (!parent) {
      continue;
    }

    drawOrbitTrace(graphics, visual.config, parent.body.position);
  }

  for (const visual of visuals) {
    if (visual.config.hidden) {
      continue;
    }
    const baseRadius = visual.config.radius;
    const fieldRings = visual.config.parentId === null
      ? WORLD_OVERLAY_STYLES.orbitalGuides.rootRingRadii.map((scale) => baseRadius * scale)
      : WORLD_OVERLAY_STYLES.orbitalGuides.childRingRadii.map((scale) => baseRadius * scale);
    const baseColor = visual.config.parentId === null
      ? WORLD_OVERLAY_STYLES.orbitalGuides.rootColor
      : WORLD_OVERLAY_STYLES.orbitalGuides.childColor;
    const alphaScale = visual.config.parentId === null
      ? WORLD_OVERLAY_STYLES.orbitalGuides.rootAlpha
      : WORLD_OVERLAY_STYLES.orbitalGuides.childAlpha;

    for (let index = 0; index < fieldRings.length; index += 1) {
      const radius = fieldRings[index];
      graphics.circle(visual.body.position.x, visual.body.position.y, radius);
      graphics.stroke({
        color: baseColor,
        width: index === 0
          ? WORLD_OVERLAY_STYLES.orbitalGuides.firstRingWidth
          : WORLD_OVERLAY_STYLES.orbitalGuides.otherRingWidth,
        alpha: alphaScale * (1 - index * WORLD_OVERLAY_STYLES.orbitalGuides.alphaDecayPerRing),
      });
    }
  }
}

function drawOrbitTrace(
  graphics: Graphics,
  config: CelestialConfig,
  parentPosition: Vector2Like,
): void {
  const pointCount = WORLD_OVERLAY_STYLES.orbitalGuides.orbitTrace.pointCount;
  const eccentricity = Math.max(0, Math.min(0.92, config.orbitEccentricity ?? 0));
  const semiMajorAxis = config.orbitRadius;
  const semiLatusRectum = semiMajorAxis * (1 - eccentricity * eccentricity);
  const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
  const rotation = config.orbitRotation ?? 0;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points: Vector2Like[] = [];

  for (let index = 0; index <= pointCount; index += 1) {
    const trueAnomaly = (index / pointCount) * Math.PI * 2;
    const radiusFromFocus =
      semiLatusRectum / Math.max(1 + eccentricity * Math.cos(trueAnomaly), 0.0001);
    const localX = Math.cos(trueAnomaly) * radiusFromFocus;
    const localY = Math.sin(trueAnomaly) * radiusFromFocus;
    const rotatedX = localX * cosRotation - localY * sinRotation;
    const rotatedY = localX * sinRotation + localY * cosRotation;
    points.push({
      x: parentPosition.x + rotatedX,
      y: parentPosition.y + rotatedY,
    });
  }

  const dashSegments = buildDashedPathSegments(
    points,
    WORLD_OVERLAY_STYLES.orbitalGuides.orbitTrace.dashLength,
    WORLD_OVERLAY_STYLES.orbitalGuides.orbitTrace.gapLength,
  );

  for (const segment of dashSegments) {
    graphics.moveTo(segment.start.x, segment.start.y);
    graphics.lineTo(segment.end.x, segment.end.y);
    graphics.stroke({
      color: WORLD_OVERLAY_STYLES.orbitalGuides.orbitTrace.color,
      width: WORLD_OVERLAY_STYLES.orbitalGuides.orbitTrace.width,
      alpha: WORLD_OVERLAY_STYLES.orbitalGuides.orbitTrace.alpha,
    });
  }
}

export function drawTrainingMissionArea(
  graphics: Graphics,
  target: WorldMarkerView | null,
): void {
  graphics.clear();

  if (!target) {
    return;
  }

  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 320);
  const accentColor = WORLD_OVERLAY_STYLES.trainingMissionArea.accentColor;
  const fuelLaneAccentColor = 0x7affd7;
  const fillAlpha = 0.035 + pulse * 0.025;
  const strokeAlpha = 0.28 + pulse * 0.18;

  if (target.guideOrbitBand) {
    const guideAccentColor = target.guideOrbitBand.radialLabel
      ? fuelLaneAccentColor
      : accentColor;
    drawTrainingOrbitBand(
      graphics,
      target.guideOrbitBand,
      guideAccentColor,
      strokeAlpha * 0.54,
      fillAlpha * 0.7,
    );
  }

  if (target.shape === "orbitBand") {
    const orbitBandAccentColor = target.radialLabel
      ? fuelLaneAccentColor
      : accentColor;
    drawTrainingOrbitBand(
      graphics,
      target,
      orbitBandAccentColor,
      strokeAlpha,
      fillAlpha,
    );
    return;
  }

  if (target.shape === "directionArrow") {
    const arrowPoints = getTrainingDirectionArrowPoints(target, 1);
    graphics.poly(arrowPoints);
    graphics.fill({
      color: accentColor,
      alpha: fillAlpha * 1.85,
    });
    graphics.poly(arrowPoints);
    graphics.stroke({
      color: accentColor,
      width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.centerWidth,
      alpha: strokeAlpha,
    });

    const innerArrowPoints = getTrainingDirectionArrowPoints(target, 0.5);
    graphics.poly(innerArrowPoints);
    graphics.stroke({
      color: accentColor,
      width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.innerRingWidth,
      alpha: strokeAlpha * 0.5,
    });
    return;
  }

  const corners = getTrainingTargetCorners(target);
  if (target.variant !== "bracket") {
    graphics.poly(corners);
    graphics.fill({
      color: accentColor,
      alpha: target.variant === "gate" ? fillAlpha * 1.45 : fillAlpha * 1.9,
    });
  }
  if (target.variant === "gate") {
    drawOpenTargetSegments(
      graphics,
      corners,
      target.center,
      accentColor,
      strokeAlpha,
      WORLD_OVERLAY_STYLES.trainingMissionArea.gateSegmentCoverage,
    );
  } else if (target.variant === "bracket") {
    drawBracketTargetSegments(
      graphics,
      corners,
      target.center,
      accentColor,
      strokeAlpha,
      WORLD_OVERLAY_STYLES.trainingMissionArea.bracketSegmentCoverage,
    );
  } else {
    graphics.poly(corners);
    graphics.stroke({
      color: accentColor,
      width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.centerWidth,
      alpha: strokeAlpha,
    });
  }

  if (target.shape === "circle") {
    graphics.circle(target.center.x, target.center.y, Math.max(18, target.radius * 0.45));
  } else {
    const innerCorners = getTrainingTargetCorners({
      ...target,
      radius: Math.max(18, target.radius * 0.45),
    });
    graphics.poly(innerCorners);
  }
  graphics.stroke({
    color: accentColor,
    width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.innerRingWidth,
    alpha: strokeAlpha * 0.35,
  });
}

function drawTrainingOrbitBand(
  graphics: Graphics,
  band: {
    center: Vector2Like;
    radius: number;
    thickness?: number;
  },
  accentColor: number,
  strokeAlpha: number,
  fillAlpha: number,
): void {
  const thickness = Math.max(24, band.thickness ?? 120);
  const innerRadius = Math.max(12, band.radius - thickness / 2);
  const outerRadius = band.radius + thickness / 2;

  graphics.circle(band.center.x, band.center.y, outerRadius);
  graphics.stroke({
    color: accentColor,
    width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.outerWidth,
    alpha: strokeAlpha * 0.75,
  });
  graphics.circle(band.center.x, band.center.y, band.radius);
  graphics.stroke({
    color: accentColor,
    width: thickness,
    alpha: fillAlpha,
  });
  graphics.circle(band.center.x, band.center.y, innerRadius);
  graphics.stroke({
    color: accentColor,
    width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.innerWidth,
    alpha: strokeAlpha * 0.45,
  });
}

export function drawForceVector(
  graphics: Graphics,
  origin: Vector2Like,
  vector: Vector2Like,
): void {
  graphics.clear();

  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude <= 0.0001) {
    return;
  }

  const normalizedX = vector.x / magnitude;
  const normalizedY = vector.y / magnitude;
  const style = WORLD_OVERLAY_STYLES.forceVector;
  const length = clamp(
    Math.log1p(magnitude) * style.lengthScale,
    style.minimumLength,
    style.maximumLength,
  );
  const end = {
    x: origin.x + normalizedX * length,
    y: origin.y + normalizedY * length,
  };
  const headBase = {
    x: end.x - normalizedX * style.headLength,
    y: end.y - normalizedY * style.headLength,
  };
  const normalX = -normalizedY;
  const normalY = normalizedX;
  const headHalfWidth = style.headLength * 0.46;

  graphics.circle(origin.x, origin.y, style.baseRingRadius);
  graphics.stroke({
    color: style.color,
    width: style.width * 0.82,
    alpha: style.alpha * 0.72,
  });

  graphics.moveTo(origin.x, origin.y);
  graphics.lineTo(headBase.x, headBase.y);
  graphics.stroke({
    color: style.color,
    width: style.width,
    alpha: style.alpha,
    cap: "round",
  });

  graphics.poly([
    end.x,
    end.y,
    headBase.x + normalX * headHalfWidth,
    headBase.y + normalY * headHalfWidth,
    headBase.x - normalX * headHalfWidth,
    headBase.y - normalY * headHalfWidth,
  ]);
  graphics.fill({
    color: style.color,
    alpha: style.alpha,
  });
}

export function drawEngineCompass(
  graphics: Graphics,
  options: {
    origin: Vector2Like;
    referenceHeading: number;
    thrustHeading: number | null;
    throttleFraction: number;
    gravityHeading: number | null;
    scale?: number;
    boosted: boolean;
  },
): void {
  graphics.clear();

  const style = WORLD_OVERLAY_STYLES.engineCompass;
  const scale = options.scale ?? 1;
  const radius = style.radius * scale;
  const innerRadius = style.innerRadius * scale;
  const clampedThrottle = clamp(options.throttleFraction, 0, 1);

  graphics.circle(options.origin.x, options.origin.y, radius);
  graphics.stroke({
    color: style.ringColor,
    width: style.ringWidth * scale,
    alpha: style.ringAlpha,
  });

  graphics.circle(options.origin.x, options.origin.y, innerRadius);
  graphics.stroke({
    color: style.ringColor,
    width: style.ringWidth * scale,
    alpha: style.innerRingAlpha,
  });

  if (options.boosted) {
    graphics.circle(options.origin.x, options.origin.y, radius + 4 * scale);
    graphics.stroke({
      color: style.arrowColor,
      width: style.boostHaloWidth * scale,
      alpha: style.boostHaloAlpha,
    });
  }

  const tickAngles = [
    options.referenceHeading,
    options.referenceHeading + Math.PI / 2,
    options.referenceHeading + Math.PI,
    options.referenceHeading - Math.PI / 2,
  ];

  for (let index = 0; index < tickAngles.length; index += 1) {
    const angle = tickAngles[index];
    const tickLength =
      (index === 0 || index === 2 ? style.majorTickLength : style.minorTickLength) * scale;
    const outerX = options.origin.x + Math.cos(angle) * radius;
    const outerY = options.origin.y + Math.sin(angle) * radius;
    const innerX = options.origin.x + Math.cos(angle) * (radius - tickLength);
    const innerY = options.origin.y + Math.sin(angle) * (radius - tickLength);

    graphics.moveTo(innerX, innerY);
    graphics.lineTo(outerX, outerY);
    graphics.stroke({
      color: style.ringColor,
      width: style.tickWidth * scale,
      alpha: style.tickAlpha,
      cap: "round",
    });
  }

  const progradeAngle = options.referenceHeading;
  const progradeOuterX = options.origin.x + Math.cos(progradeAngle) * (radius + style.progradeMarkerInset * scale);
  const progradeOuterY = options.origin.y + Math.sin(progradeAngle) * (radius + style.progradeMarkerInset * scale);
  const progradeBaseX =
    options.origin.x +
    Math.cos(progradeAngle) * (radius - style.progradeMarkerLength * scale);
  const progradeBaseY =
    options.origin.y +
    Math.sin(progradeAngle) * (radius - style.progradeMarkerLength * scale);
  const progradeNormalX = -Math.sin(progradeAngle);
  const progradeNormalY = Math.cos(progradeAngle);
  const progradeHalfWidth = style.progradeMarkerWidth * scale;

  graphics.poly([
    progradeOuterX,
    progradeOuterY,
    progradeBaseX + progradeNormalX * progradeHalfWidth,
    progradeBaseY + progradeNormalY * progradeHalfWidth,
    progradeBaseX - progradeNormalX * progradeHalfWidth,
    progradeBaseY - progradeNormalY * progradeHalfWidth,
  ]);
  graphics.fill({
    color: style.progradeMarkerColor,
    alpha: style.progradeMarkerAlpha,
  });

  graphics.circle(options.origin.x, options.origin.y, style.centerRadius * scale);
  graphics.fill({
    color: style.arrowColor,
    alpha: style.arrowAlpha,
  });

  if (options.gravityHeading !== null) {
    drawCompassArrow(graphics, {
      origin: options.origin,
      heading: options.gravityHeading,
      length: style.gravityLength * scale,
      headLength: style.gravityHeadLength * scale,
      headWidth: style.gravityHeadWidth * scale,
      color: style.gravityColor,
      width: style.gravityWidth * scale,
      alpha: style.gravityAlpha,
    });
  }

  if (options.thrustHeading !== null && clampedThrottle > 0.02) {
    const arrowLength =
      (style.arrowMinimumLength +
        (style.arrowMaximumLength - style.arrowMinimumLength) * clampedThrottle) *
      scale;
    drawCompassArrow(graphics, {
      origin: options.origin,
      heading: options.thrustHeading,
      length: arrowLength,
      headLength: style.headLength * scale,
      headWidth: style.headWidth * scale,
      color: style.arrowColor,
      width: style.arrowWidth * scale,
      alpha: style.arrowAlpha,
    });
  }
}

function drawCompassArrow(
  graphics: Graphics,
  options: {
    origin: Vector2Like;
    heading: number;
    length: number;
    headLength: number;
    headWidth: number;
    color: number;
    width: number;
    alpha: number;
  },
): void {
  const normalizedX = Math.cos(options.heading);
  const normalizedY = Math.sin(options.heading);
  const endX = options.origin.x + normalizedX * options.length;
  const endY = options.origin.y + normalizedY * options.length;
  const headBaseX = endX - normalizedX * options.headLength;
  const headBaseY = endY - normalizedY * options.headLength;
  const normalX = -normalizedY;
  const normalY = normalizedX;

  graphics.moveTo(options.origin.x, options.origin.y);
  graphics.lineTo(headBaseX, headBaseY);
  graphics.stroke({
    color: options.color,
    width: options.width,
    alpha: options.alpha,
    cap: "round",
  });

  graphics.poly([
    endX,
    endY,
    headBaseX + normalX * options.headWidth,
    headBaseY + normalY * options.headWidth,
    headBaseX - normalX * options.headWidth,
    headBaseY - normalY * options.headWidth,
  ]);
  graphics.fill({
    color: options.color,
    alpha: options.alpha,
  });
}

export function drawGravityWellBoundaries(
  graphics: Graphics,
  visuals: readonly CelestialLike[],
  boundaryRadii: ReadonlyMap<string, number>,
): void {
  graphics.clear();

  for (const visual of visuals) {
    if (visual.config.hidden) {
      continue;
    }

    const boundaryRadius = boundaryRadii.get(visual.config.id);
    if (!boundaryRadius || boundaryRadius <= visual.body.radius) {
      continue;
    }

    drawDashedCircle(
      graphics,
      visual.body.position,
      boundaryRadius,
      {
        dashCount: WORLD_OVERLAY_STYLES.gravityWellBoundary.dashCount,
        dashCoverage: WORLD_OVERLAY_STYLES.gravityWellBoundary.dashCoverage,
        color: WORLD_OVERLAY_STYLES.gravityWellBoundary.color,
        width: WORLD_OVERLAY_STYLES.gravityWellBoundary.width,
        alpha: WORLD_OVERLAY_STYLES.gravityWellBoundary.alpha,
      },
    );
  }
}

export function drawGuidanceFidelityMesh(
  graphics: Graphics,
  meshes: readonly GuidanceFieldMesh[],
): void {
  graphics.clear();
  const style = WORLD_OVERLAY_STYLES.guidanceFidelityMesh;

  for (const mesh of meshes) {
    for (let row = 0; row < mesh.rows; row += 1) {
      for (let column = 0; column < mesh.columns - 1; column += 1) {
        const start = mesh.nodes[row * mesh.columns + column];
        const end = mesh.nodes[row * mesh.columns + column + 1];
        drawGuidanceMeshSegment(graphics, start, end, style);
      }
    }

    for (let column = 0; column < mesh.columns; column += 1) {
      for (let row = 0; row < mesh.rows - 1; row += 1) {
        const start = mesh.nodes[row * mesh.columns + column];
        const end = mesh.nodes[(row + 1) * mesh.columns + column];
        drawGuidanceMeshSegment(graphics, start, end, style);
      }
    }
  }
}

function drawGuidanceMeshSegment(
  graphics: Graphics,
  start: {
    position: Vector2Like;
    fidelityFactor: number;
    requiresFullSimulation: boolean;
  },
  end: {
    position: Vector2Like;
    fidelityFactor: number;
    requiresFullSimulation: boolean;
  },
  style: typeof WORLD_OVERLAY_STYLES.guidanceFidelityMesh,
): void {
  const fidelity = Math.max(start.fidelityFactor, end.fidelityFactor);
  const requiresFullSimulation =
    start.requiresFullSimulation || end.requiresFullSimulation;

  if (!requiresFullSimulation && fidelity < style.minVisibleFidelity) {
    return;
  }

  graphics.moveTo(start.position.x, start.position.y);
  graphics.lineTo(end.position.x, end.position.y);
  graphics.stroke({
    color: requiresFullSimulation
      ? style.fullSimulationColor
      : style.color,
    width: style.lineWidth,
    alpha: requiresFullSimulation
      ? style.fullSimulationAlpha
      : style.baseAlpha + (style.maxAlpha - style.baseAlpha) * fidelity,
  });
}

function getTrainingTargetCorners(
  target: Pick<WorldMarkerView, "shape" | "center" | "radius">,
): Vector2Like[] {
  if (target.shape === "square") {
    return [
      { x: target.center.x - target.radius, y: target.center.y - target.radius },
      { x: target.center.x + target.radius, y: target.center.y - target.radius },
      { x: target.center.x + target.radius, y: target.center.y + target.radius },
      { x: target.center.x - target.radius, y: target.center.y + target.radius },
    ];
  }

  if (target.shape === "diamond") {
    return [
      { x: target.center.x, y: target.center.y - target.radius },
      { x: target.center.x + target.radius, y: target.center.y },
      { x: target.center.x, y: target.center.y + target.radius },
      { x: target.center.x - target.radius, y: target.center.y },
    ];
  }

  const pointCount = 28;
  const corners: Vector2Like[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    corners.push({
      x: target.center.x + Math.cos(angle) * target.radius,
      y: target.center.y + Math.sin(angle) * target.radius,
    });
  }
  return corners;
}

function getTrainingDirectionArrowPoints(
  target: Pick<WorldMarkerView, "center" | "radius" | "rotationRadians">,
  scaleMultiplier: number,
): Vector2Like[] {
  const radius = target.radius * scaleMultiplier;
  const rotation = target.rotationRadians ?? 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const localPoints = [
    { x: -radius * 0.92, y: -radius * 0.24 },
    { x: radius * 0.1, y: -radius * 0.24 },
    { x: radius * 0.1, y: -radius * 0.58 },
    { x: radius, y: 0 },
    { x: radius * 0.1, y: radius * 0.58 },
    { x: radius * 0.1, y: radius * 0.24 },
    { x: -radius * 0.92, y: radius * 0.24 },
    { x: -radius * 0.58, y: 0 },
  ] satisfies Vector2Like[];

  return localPoints.map((point) => ({
    x: target.center.x + point.x * cosine - point.y * sine,
    y: target.center.y + point.x * sine + point.y * cosine,
  }));
}

function drawOpenTargetSegments(
  graphics: Graphics,
  corners: readonly Vector2Like[],
  center: Vector2Like,
  color: number,
  alpha: number,
  segmentCoverage: number,
): void {
  for (let index = 0; index < corners.length; index += 1) {
    const start = corners[index];
    const end = corners[(index + 1) % corners.length];
    const shortenedStart = {
      x: start.x + (end.x - start.x) * (1 - segmentCoverage) * 0.5,
      y: start.y + (end.y - start.y) * (1 - segmentCoverage) * 0.5,
    };
    const shortenedEnd = {
      x: end.x + (start.x - end.x) * (1 - segmentCoverage) * 0.5,
      y: end.y + (start.y - end.y) * (1 - segmentCoverage) * 0.5,
    };
    graphics.moveTo(shortenedStart.x, shortenedStart.y);
    graphics.lineTo(shortenedEnd.x, shortenedEnd.y);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.centerWidth,
      alpha,
    });
  }

  graphics.circle(center.x, center.y, 5.5);
  graphics.fill({
    color,
    alpha: alpha * 0.85,
  });
}

function drawBracketTargetSegments(
  graphics: Graphics,
  corners: readonly Vector2Like[],
  center: Vector2Like,
  color: number,
  alpha: number,
  segmentCoverage: number,
): void {
  for (const corner of corners) {
    const towardCenter = {
      x: center.x - corner.x,
      y: center.y - corner.y,
    };
    const length = Math.hypot(towardCenter.x, towardCenter.y) || 1;
    const inset = {
      x: corner.x + (towardCenter.x / length) * (length * segmentCoverage),
      y: corner.y + (towardCenter.y / length) * (length * segmentCoverage),
    };
    graphics.moveTo(corner.x, corner.y);
    graphics.lineTo(inset.x, inset.y);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.trainingMissionArea.orbitBand.centerWidth,
      alpha,
    });
  }
}

export function drawScannerRadius(
  graphics: Graphics,
  center: Vector2Like,
  radius: number,
  disintegratorRange: number,
  occluders: readonly CelestialLike[],
): void {
  graphics.clear();
  const scannerFillInnerRadius = Math.max(
    0,
    disintegratorRange - Math.max(34, disintegratorRange * 0.16),
  );
  drawCircularScannerField(
    graphics,
    center,
    radius,
    scannerFillInnerRadius,
    occluders,
    {
      shellColor: WORLD_OVERLAY_STYLES.scannerRadius.shellColor,
      shellSteps: WORLD_OVERLAY_STYLES.scannerRadius.shellSteps,
      shellAlpha: WORLD_OVERLAY_STYLES.scannerRadius.shellAlpha,
      rimColor: WORLD_OVERLAY_STYLES.scannerRadius.rimColor,
      rimWidth: WORLD_OVERLAY_STYLES.scannerRadius.rimWidth,
      rimAlpha: WORLD_OVERLAY_STYLES.scannerRadius.rimAlpha,
      occlusionColor: WORLD_OVERLAY_STYLES.scannerRadius.occlusionColor,
      occlusionAlpha: WORLD_OVERLAY_STYLES.scannerRadius.occlusionAlpha,
    },
  );
}

function getScannerShadowWedge(
  center: Vector2Like,
  scannerRadius: number,
  occluderCenter: Vector2Like,
  occluderRadius: number,
): { startAngle: number; endAngle: number; tangentDistance: number } | null {
  const offsetX = occluderCenter.x - center.x;
  const offsetY = occluderCenter.y - center.y;
  const distance = Math.hypot(offsetX, offsetY);

  if (distance <= occluderRadius || distance >= scannerRadius + occluderRadius) {
    return null;
  }

  const heading = Math.atan2(offsetY, offsetX);
  const halfAngle = Math.asin(
    Math.max(-0.999, Math.min(0.999, occluderRadius / distance)),
  );

  return {
    startAngle: heading - halfAngle,
    endAngle: heading + halfAngle,
    tangentDistance: Math.sqrt(
      Math.max(0, distance * distance - occluderRadius * occluderRadius),
    ),
  };
}

export function drawPlayerWeaponRange(
  graphics: Graphics,
  center: Vector2Like,
  radius: number,
  armed: boolean,
  weaponMode: PlayerWeaponMode,
): void {
  graphics.clear();
  const bandThickness = Math.max(34, radius * 0.16);
  const innerRadius = Math.max(0, radius - bandThickness);
  const shellColor = weaponMode === "disintegrator" ? 0xff6a6a : 0x8b9bff;
  const rimColor = weaponMode === "disintegrator" ? 0xff8c8c : 0xb7c1ff;

  if (armed) {
    const shellSteps = WORLD_OVERLAY_STYLES.weaponRange.armed.shellSteps;

    for (let index = 0; index < shellSteps; index += 1) {
      const t = index / Math.max(1, shellSteps - 1);
      const shellRadius = radius - bandThickness * t;
      graphics.circle(center.x, center.y, shellRadius);
      graphics.stroke({
        color: shellColor,
        width: bandThickness / shellSteps,
        alpha: WORLD_OVERLAY_STYLES.weaponRange.armed.shellAlpha * (1 - t) * (1 - t),
      });
    }

    graphics.circle(center.x, center.y, radius);
    graphics.stroke({
      color: rimColor,
      width: WORLD_OVERLAY_STYLES.weaponRange.armed.rimWidth,
      alpha: WORLD_OVERLAY_STYLES.weaponRange.armed.rimAlpha,
    });
  } else {
    drawDashedCircle(graphics, center, radius, {
      dashCount: WORLD_OVERLAY_STYLES.weaponRange.safe.dashCount,
      dashCoverage: WORLD_OVERLAY_STYLES.weaponRange.safe.dashCoverage,
      color: rimColor,
      width: WORLD_OVERLAY_STYLES.weaponRange.safe.width,
      alpha: WORLD_OVERLAY_STYLES.weaponRange.safe.alpha,
    });
  }

  graphics.circle(center.x, center.y, innerRadius);
  graphics.fill({
    color: 0x000000,
    alpha: 0.001,
  });
}

export function drawShieldBubble(
  graphics: Graphics,
  center: Vector2Like,
  radius: number,
  chargeFraction: number,
  flash: number,
): void {
  graphics.clear();

  const clampedCharge = clamp(chargeFraction, 0, 1);
  const clampedFlash = clamp(flash, 0, 1);
  const innerRadius = Math.max(12, radius - Math.max(8, radius * 0.22));
  const shellSteps = WORLD_OVERLAY_STYLES.shieldBubble.shellSteps;
  const outerRadius = radius + clampedFlash * 2.5;

  for (let index = 0; index < shellSteps; index += 1) {
    const t = index / (shellSteps - 1 || 1);
    const ringRadius = innerRadius + (outerRadius - innerRadius) * t;
    graphics.circle(center.x, center.y, ringRadius);
    graphics.stroke({
      color: clampedFlash > 0.1 ? 0xc8f4ff : 0x6fdcff,
      width: WORLD_OVERLAY_STYLES.shieldBubble.innerWidth,
      alpha:
        (0.08 + clampedCharge * 0.12 + clampedFlash * 0.2) *
        (1 - t * 0.55),
    });
  }

  graphics.circle(center.x, center.y, outerRadius);
  graphics.stroke({
    color: clampedFlash > 0.1 ? 0xf5fdff : 0xb9f0ff,
    width: WORLD_OVERLAY_STYLES.shieldBubble.outerWidth
      + clampedFlash * WORLD_OVERLAY_STYLES.shieldBubble.outerFlashWidth,
    alpha: 0.16 + clampedCharge * 0.26 + clampedFlash * 0.34,
  });

  graphics.circle(center.x, center.y, innerRadius);
  graphics.fill({
    color: WORLD_OVERLAY_STYLES.shieldBubble.fillColor,
    alpha: 0.01 + clampedCharge * 0.03 + clampedFlash * 0.05,
  });
}

export function drawDefenseSensorRanges(
  graphics: Graphics,
  visibleContacts: readonly ScannerContactLike[],
  launcherStates: ReadonlyMap<string, LauncherStateLike>,
  celestialVisuals: readonly CelestialLike[],
  highlightedDefenseIds?: ReadonlySet<string>,
): void {
  graphics.clear();

  for (const contact of visibleContacts) {
    const defense = contact.visual as DefenseLike;
    if (
      !("weaponType" in defense.config) ||
      defense.config.weaponType === "station" ||
      defense.config.weaponType === "target"
    ) {
      continue;
    }
    const launcherState = launcherStates.get(defense.config.id);
    const radius = defense.config.scannerRange;
    const lockProgress = launcherState
      ? launcherState.lockProgress / defense.config.lockOnSeconds
      : 0;
    const lockFraction = Math.max(0, Math.min(1, lockProgress));
    const highlighted = highlightedDefenseIds?.has(defense.config.id) ?? false;
    const innerRadius = Math.max(0, radius - Math.max(40, radius * 0.18));
    const enemyClass = getDefenseEnemyOverlayClass(defense.config);
    const enemyStyle = WORLD_OVERLAY_STYLES.enemyClassStyles[enemyClass];

    if (defense.config.weaponType === "beam") {
      const color = lockFraction > 0
        ? enemyStyle.sensorActiveColor
        : enemyStyle.sensorIdleColor;
      drawCircularScannerField(
        graphics,
        defense.body.position,
        radius,
        innerRadius,
        celestialVisuals,
        {
          shellColor: color,
          shellSteps: highlighted ? 3 : 2,
          shellAlpha:
            (0.022 + lockFraction * 0.022) +
            (highlighted ? 0.02 : 0),
          rimColor: color,
          rimWidth:
            WORLD_OVERLAY_STYLES.defenseSensorRanges.beam.width *
            (highlighted ? 1.4 : 1),
          rimAlpha:
            (0.14 + lockFraction * 0.16) +
            (highlighted ? 0.12 : 0),
          occlusionColor: WORLD_OVERLAY_STYLES.scannerRadius.occlusionColor,
          occlusionAlpha: WORLD_OVERLAY_STYLES.scannerRadius.occlusionAlpha * 0.78,
        },
      );
      if (highlighted) {
        drawHighlightedScannerAccent(
          graphics,
          defense.body.position,
          radius,
          lockFraction,
        );
      }
      continue;
    }

    if (
      defense.config.weaponType === "torpedo" &&
      (defense.config.anchorToParent === "dark-side" ||
        defense.config.anchorToParent === "fixed")
    ) {
      const parentBody = celestialVisuals.find(
        (visual) => visual.config.id === defense.config.parentId,
      )?.body;

      if (!parentBody) {
        continue;
      }

      const heading = Math.atan2(
        defense.body.position.y - parentBody.position.y,
        defense.body.position.x - parentBody.position.x,
      );
      const halfAngle = getDefenseSensorHalfAngle(
        defense.body.position,
        parentBody.position,
        parentBody.radius,
        12,
      );
      const startAngle = heading - halfAngle;
      const endAngle = heading + halfAngle;
      const leftPoint = {
        x: defense.body.position.x + Math.cos(startAngle) * radius,
        y: defense.body.position.y + Math.sin(startAngle) * radius,
      };

      graphics.moveTo(defense.body.position.x, defense.body.position.y);
      graphics.lineTo(leftPoint.x, leftPoint.y);
      graphics.arc(defense.body.position.x, defense.body.position.y, radius, startAngle, endAngle);
      graphics.lineTo(defense.body.position.x, defense.body.position.y);
      graphics.fill({
        color: lockFraction > 0
          ? enemyStyle.sensorActiveColor
          : enemyStyle.sensorIdleColor,
        alpha:
          (0.05 + lockFraction * 0.06) +
          (highlighted ? 0.06 : 0),
      });

      graphics.moveTo(leftPoint.x, leftPoint.y);
      graphics.arc(defense.body.position.x, defense.body.position.y, radius, startAngle, endAngle);
      graphics.stroke({
        color: lockFraction > 0
          ? enemyStyle.sensorActiveColor
          : enemyStyle.sensorIdleColor,
        width:
          WORLD_OVERLAY_STYLES.defenseSensorRanges.torpedo.rimWidth *
          (highlighted ? 1.4 : 1),
        alpha:
          (0.18 + lockFraction * 0.18) +
          (highlighted ? 0.12 : 0),
      });

      if (lockFraction > 0) {
        const progressAngle = startAngle + (endAngle - startAngle) * lockFraction;
        graphics.moveTo(
          defense.body.position.x + Math.cos(startAngle) * radius,
          defense.body.position.y + Math.sin(startAngle) * radius,
        );
        graphics.arc(
          defense.body.position.x,
          defense.body.position.y,
          radius,
          startAngle,
          progressAngle,
        );
        graphics.stroke({
          color: enemyStyle.sensorProgressColor,
          width:
            WORLD_OVERLAY_STYLES.defenseSensorRanges.torpedo.progressWidth *
            (highlighted ? 1.35 : 1),
          alpha: highlighted ? 0.72 : 0.45,
          cap: "round",
        });
      }

      if (highlighted) {
        drawHighlightedScannerAccent(
          graphics,
          defense.body.position,
          radius,
          lockFraction,
        );
      }
      continue;
    }

    const color = lockFraction > 0
      ? enemyStyle.sensorActiveColor
      : enemyStyle.sensorIdleColor;
    drawCircularScannerField(
      graphics,
      defense.body.position,
      radius,
      innerRadius,
      celestialVisuals,
      {
        shellColor: color,
        shellSteps: highlighted ? 3 : 2,
        shellAlpha:
          (0.028 + lockFraction * 0.028) +
          (highlighted ? 0.024 : 0),
        rimColor: color,
        rimWidth:
          WORLD_OVERLAY_STYLES.defenseSensorRanges.torpedo.rimWidth *
          (highlighted ? 1.4 : 1),
        rimAlpha:
          (0.18 + lockFraction * 0.18) +
          (highlighted ? 0.14 : 0),
        occlusionColor: WORLD_OVERLAY_STYLES.scannerRadius.occlusionColor,
        occlusionAlpha: WORLD_OVERLAY_STYLES.scannerRadius.occlusionAlpha * 0.82,
      },
    );

    if (lockFraction > 0) {
      const startAngle = -Math.PI / 2;
      const progressAngle = startAngle + Math.PI * 2 * lockFraction;
      graphics.moveTo(
        defense.body.position.x + Math.cos(startAngle) * radius,
        defense.body.position.y + Math.sin(startAngle) * radius,
      );
      graphics.arc(
        defense.body.position.x,
        defense.body.position.y,
        radius,
        startAngle,
        progressAngle,
      );
      graphics.stroke({
        color: enemyStyle.sensorProgressColor,
        width:
          WORLD_OVERLAY_STYLES.defenseSensorRanges.torpedo.progressWidth *
          (highlighted ? 1.35 : 1),
        alpha: highlighted ? 0.72 : 0.45,
        cap: "round",
      });
    }
    if (highlighted) {
      drawHighlightedScannerAccent(
        graphics,
        defense.body.position,
        radius,
        lockFraction,
      );
    }
  }
}

function drawHighlightedScannerAccent(
  graphics: Graphics,
  center: Vector2Like,
  radius: number,
  lockFraction: number,
): void {
  const pulse = 0.62 + 0.38 * Math.sin(performance.now() / 220);
  const outerPulseRadius = radius + 10 + pulse * 9;
  const sweepStart = (performance.now() / 800) % (Math.PI * 2) - Math.PI / 2;
  const sweepEnd = sweepStart + 0.58 + lockFraction * 0.46;

  graphics.circle(center.x, center.y, outerPulseRadius);
  graphics.stroke({
    color: 0xffe0a2,
    width: 2.2,
    alpha: 0.2 + pulse * 0.24,
  });

  graphics.circle(center.x, center.y, Math.max(40, radius - 34 - pulse * 6));
  graphics.stroke({
    color: 0xfff3cf,
    width: 1.4,
    alpha: 0.14 + pulse * 0.16,
  });

  graphics.moveTo(
    center.x + Math.cos(sweepStart) * (radius + 3),
    center.y + Math.sin(sweepStart) * (radius + 3),
  );
  graphics.arc(center.x, center.y, radius + 3, sweepStart, sweepEnd);
  graphics.stroke({
    color: 0xffbe73,
    width: 3,
    alpha: 0.32 + pulse * 0.28,
    cap: "round",
  });
}

export function drawDefenseScannerCones(
  graphics: Graphics,
  visibleContacts: readonly ScannerContactLike[],
  celestialVisuals: readonly CelestialLike[],
): void {
  graphics.clear();
  void visibleContacts;
  void celestialVisuals;
}

export function drawInterceptReticles(
  graphics: Graphics,
  visibleContacts: readonly ScannerContactLike[],
  launcherStates: ReadonlyMap<string, LauncherStateLike>,
): void {
  graphics.clear();

  for (const contact of visibleContacts) {
    const defense = contact.visual as DefenseLike;
    if (
      !("weaponType" in defense.config) ||
      defense.config.weaponType === "station" ||
      defense.config.weaponType === "target"
    ) {
      continue;
    }

    const launcherState = launcherStates.get(defense.config.id);
    const interceptPoint = launcherState?.interceptSolution?.interceptPoint;

    if (!interceptPoint) {
      continue;
    }

    const lockFraction = launcherState
      ? launcherState.lockProgress / defense.config.lockOnSeconds
      : 0;
    const color = lockFraction >= 1
      ? WORLD_OVERLAY_STYLES.interceptReticle.lockedColor
      : WORLD_OVERLAY_STYLES.interceptReticle.unlockedColor;
    const alpha = 0.28 + Math.min(lockFraction, 1) * 0.34;
    const outerRadius = lockFraction >= 1 ? 20 : 14;
    const innerRadius = Math.max(6, outerRadius - 7);
    const armLength = outerRadius + 8;
    const gap = innerRadius + 3;

    graphics.circle(interceptPoint.x, interceptPoint.y, outerRadius);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.interceptReticle.outerWidth,
      alpha,
    });

    graphics.circle(interceptPoint.x, interceptPoint.y, innerRadius);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.interceptReticle.innerWidth,
      alpha: alpha * 0.6,
    });

    graphics.moveTo(interceptPoint.x - armLength, interceptPoint.y);
    graphics.lineTo(interceptPoint.x - gap, interceptPoint.y);
    graphics.moveTo(interceptPoint.x + gap, interceptPoint.y);
    graphics.lineTo(interceptPoint.x + armLength, interceptPoint.y);
    graphics.moveTo(interceptPoint.x, interceptPoint.y - armLength);
    graphics.lineTo(interceptPoint.x, interceptPoint.y - gap);
    graphics.moveTo(interceptPoint.x, interceptPoint.y + gap);
    graphics.lineTo(interceptPoint.x, interceptPoint.y + armLength);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.interceptReticle.armWidth,
      alpha,
      cap: "round",
    });
  }
}

export function drawDefenseLockOverlay(
  graphics: Graphics,
  defenseLockStates: ReadonlyMap<string, DefenseLockStateLike>,
  visibleDefenseContacts: readonly ScannerContactLike[],
  selectedDefenseId?: string | null,
): void {
  graphics.clear();

  for (const contact of visibleDefenseContacts) {
    const defense = contact.visual as DefenseLike;
    if (!("weaponType" in defense.config)) {
      continue;
    }

    const defenseLockState = defenseLockStates.get(defense.config.id);

    if (!defenseLockState || defenseLockState.progress <= 0) {
      continue;
    }

    const center = defense.body.position;
    const lockSize = defense.body.radius + 10 + defenseLockState.progress * 8;
    const arm = lockSize + 8;
    const gap = Math.max(4, defense.body.radius * 0.45);
    const isLocked = defenseLockState.progress >= 1;
    const color = isLocked
      ? WORLD_OVERLAY_STYLES.defenseLock.lockedColor
      : WORLD_OVERLAY_STYLES.defenseLock.scanningColor;

    graphics.moveTo(center.x - arm, center.y - lockSize);
    graphics.lineTo(center.x - gap, center.y - lockSize);
    graphics.moveTo(center.x + gap, center.y - lockSize);
    graphics.lineTo(center.x + arm, center.y - lockSize);
    graphics.moveTo(center.x - arm, center.y + lockSize);
    graphics.lineTo(center.x - gap, center.y + lockSize);
    graphics.moveTo(center.x + gap, center.y + lockSize);
    graphics.lineTo(center.x + arm, center.y + lockSize);
    graphics.moveTo(center.x - lockSize, center.y - arm);
    graphics.lineTo(center.x - lockSize, center.y - gap);
    graphics.moveTo(center.x + lockSize, center.y - arm);
    graphics.lineTo(center.x + lockSize, center.y - gap);
    graphics.moveTo(center.x - lockSize, center.y + gap);
    graphics.lineTo(center.x - lockSize, center.y + arm);
    graphics.moveTo(center.x + lockSize, center.y + gap);
    graphics.lineTo(center.x + lockSize, center.y + arm);
    graphics.stroke({
      color,
      width: isLocked
        ? WORLD_OVERLAY_STYLES.defenseLock.lockedWidth
        : WORLD_OVERLAY_STYLES.defenseLock.scanningWidth,
      alpha: 0.4 + defenseLockState.progress * 0.35,
      cap: "round",
    });

    graphics.circle(center.x, center.y, defense.body.radius + 4);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.defenseLock.ringWidth,
      alpha: 0.18 + defenseLockState.progress * 0.2,
    });

    if (selectedDefenseId && defense.config.id === selectedDefenseId) {
      graphics.circle(center.x, center.y, lockSize + 14);
      graphics.stroke({
        color: WORLD_OVERLAY_STYLES.defenseLock.lockedColor,
        width: WORLD_OVERLAY_STYLES.defenseLock.lockedWidth + 0.5,
        alpha: 0.9,
      });
      graphics.moveTo(center.x, center.y);
      graphics.lineTo(center.x, center.y - (lockSize + 20));
      graphics.stroke({
        color: WORLD_OVERLAY_STYLES.defenseLock.lockedColor,
        width: WORLD_OVERLAY_STYLES.defenseLock.lockedWidth,
        alpha: 0.75,
        cap: "round",
      });
    }
  }
}

export function drawTorpedoLockOverlay(
  graphics: Graphics,
  torpedoLockStates: ReadonlyMap<string, TorpedoLockStateLike>,
  visibleTorpedoes: readonly TorpedoScannerContactLike[],
): void {
  graphics.clear();

  for (const contact of visibleTorpedoes) {
    const torpedoLockState = torpedoLockStates.get(contact.missile.id);

    if (!torpedoLockState || torpedoLockState.progress <= 0) {
      continue;
    }

    const center = contact.missile.detonationPosition ?? contact.missile.body.position;
    const lockSize = 16 + torpedoLockState.progress * 10;
    const gap = 6;
    const arm = lockSize + 6;
    const color = torpedoLockState.progress >= 1
      ? WORLD_OVERLAY_STYLES.torpedoLock.lockedColor
      : WORLD_OVERLAY_STYLES.torpedoLock.scanningColor;

    graphics.moveTo(center.x - arm, center.y - lockSize);
    graphics.lineTo(center.x - gap, center.y - lockSize);
    graphics.moveTo(center.x + gap, center.y - lockSize);
    graphics.lineTo(center.x + arm, center.y - lockSize);
    graphics.moveTo(center.x - arm, center.y + lockSize);
    graphics.lineTo(center.x - gap, center.y + lockSize);
    graphics.moveTo(center.x + gap, center.y + lockSize);
    graphics.lineTo(center.x + arm, center.y + lockSize);
    graphics.moveTo(center.x - lockSize, center.y - arm);
    graphics.lineTo(center.x - lockSize, center.y - gap);
    graphics.moveTo(center.x + lockSize, center.y - arm);
    graphics.lineTo(center.x + lockSize, center.y - gap);
    graphics.moveTo(center.x - lockSize, center.y + gap);
    graphics.lineTo(center.x - lockSize, center.y + arm);
    graphics.moveTo(center.x + lockSize, center.y + gap);
    graphics.lineTo(center.x + lockSize, center.y + arm);
    graphics.stroke({
      color,
      width: WORLD_OVERLAY_STYLES.torpedoLock.frameWidth,
      alpha: 0.4 + torpedoLockState.progress * 0.35,
      cap: "round",
    });

    if (torpedoLockState.solution) {
      graphics.moveTo(center.x, center.y);
      graphics.lineTo(
        torpedoLockState.solution.interceptPoint.x,
        torpedoLockState.solution.interceptPoint.y,
      );
      graphics.stroke({
        color,
        width: WORLD_OVERLAY_STYLES.torpedoLock.interceptLineWidth,
        alpha: WORLD_OVERLAY_STYLES.torpedoLock.interceptLineAlpha,
      });
    }
  }
}

export function drawDisintegratorEngagementLines(
  graphics: Graphics,
  shipPosition: Vector2Like,
  lockedTargets: readonly DisintegratorTargetLike[],
  armed: boolean,
  disintegratorEngagementStates: ReadonlyMap<string, DisintegratorEngagementStateLike>,
  weaponMode: PlayerWeaponMode,
): void {
  graphics.clear();
  const timeSeconds = performance.now() / 1000;
  const engageStartThreshold = weaponMode === "disintegrator"
    ? COMBAT_BALANCE.disintegrator.engageStartThreshold
    : COMBAT_BALANCE.disruptor.engageStartThreshold;
  const safeColor = weaponMode === "disintegrator"
    ? WORLD_OVERLAY_STYLES.disintegratorEngagement.safe.disintegratorColor
    : WORLD_OVERLAY_STYLES.disintegratorEngagement.safe.disruptorColor;
  const armedPalette = weaponMode === "disintegrator"
    ? WORLD_OVERLAY_STYLES.disintegratorEngagement.armed.disintegrator
    : WORLD_OVERLAY_STYLES.disintegratorEngagement.armed.disruptor;

  for (const target of lockedTargets) {
    const engagementProgress = disintegratorEngagementStates.get(target.id)?.progress ?? 0;

    if (armed && engagementProgress <= engageStartThreshold) {
      continue;
    }

    const targetPosition = target.position;
    if (!armed) {
      const segments = 8;

      for (let index = 0; index < segments; index += 1) {
        if (index % 2 === 1) {
          continue;
        }

        const startT = index / segments;
        const endT = (index + 1) / segments;
        const start = {
          x: shipPosition.x + (targetPosition.x - shipPosition.x) * startT,
          y: shipPosition.y + (targetPosition.y - shipPosition.y) * startT,
        };
        const end = {
          x: shipPosition.x + (targetPosition.x - shipPosition.x) * endT,
          y: shipPosition.y + (targetPosition.y - shipPosition.y) * endT,
        };

        graphics.moveTo(start.x, start.y);
        graphics.lineTo(end.x, end.y);
        graphics.stroke({
          color: safeColor,
          width: 1.8,
          alpha: 0.62,
          cap: "butt",
        });
      }

      continue;
    }

    const flicker =
      0.85 +
      0.15 *
        Math.sin(timeSeconds * 24 + targetPosition.x * 0.01 + targetPosition.y * 0.013);
    const coreWidth = 1.6 + engagementProgress * 2.1;
    const glowWidth = coreWidth * 2.6;
    const outerGlowWidth = coreWidth * 4.2;

    graphics.moveTo(shipPosition.x, shipPosition.y);
    graphics.lineTo(targetPosition.x, targetPosition.y);
    graphics.stroke({
      color: armedPalette.outerColor,
      width: outerGlowWidth,
      alpha: (0.05 + engagementProgress * 0.08) * flicker,
      cap: "round",
    });

    graphics.moveTo(shipPosition.x, shipPosition.y);
    graphics.lineTo(targetPosition.x, targetPosition.y);
    graphics.stroke({
      color: armedPalette.glowColor,
      width: glowWidth,
      alpha: (0.12 + engagementProgress * 0.16) * flicker,
      cap: "round",
    });

    graphics.moveTo(shipPosition.x, shipPosition.y);
    graphics.lineTo(targetPosition.x, targetPosition.y);
    graphics.stroke({
      color: armedPalette.rimColor,
      width: coreWidth * 1.35,
      alpha: 0.3 + engagementProgress * 0.28 * flicker,
      cap: "round",
    });

    graphics.moveTo(shipPosition.x, shipPosition.y);
    graphics.lineTo(targetPosition.x, targetPosition.y);
    graphics.stroke({
      color: armedPalette.coreColor,
      width: coreWidth,
      alpha: 0.6 + engagementProgress * 0.25 * flicker,
      cap: "round",
    });
  }
}

export function drawHostileBeamLines(
  graphics: Graphics,
  defenseVisuals: readonly DefenseLike[],
  launcherStates: ReadonlyMap<string, LauncherStateLike>,
  targetPosition: Vector2Like,
): void {
  graphics.clear();
  const timeSeconds = performance.now() / 1000;

  for (const defense of defenseVisuals) {
    if (defense.destroyed || defense.config.weaponType !== "beam") {
      continue;
    }

    const launcherState = launcherStates.get(defense.config.id);
    if (!launcherState?.firing || launcherState.beamEngagement <= 0) {
      continue;
    }

    const flicker =
      0.82 +
      0.18 * Math.sin(
        timeSeconds * 19 + defense.body.position.x * 0.008 + defense.body.position.y * 0.01,
      );
    const coreWidth = 1.4 + launcherState.beamEngagement * 2.4;
    const outerWidth = coreWidth * 3.2;

    graphics.moveTo(defense.body.position.x, defense.body.position.y);
    graphics.lineTo(targetPosition.x, targetPosition.y);
    graphics.stroke({
      color: WORLD_OVERLAY_STYLES.hostileBeam.outerColor,
      width: outerWidth,
      alpha: (0.06 + launcherState.beamEngagement * 0.1) * flicker,
      cap: "round",
    });

    graphics.moveTo(defense.body.position.x, defense.body.position.y);
    graphics.lineTo(targetPosition.x, targetPosition.y);
    graphics.stroke({
      color: WORLD_OVERLAY_STYLES.hostileBeam.coreColor,
      width: coreWidth,
      alpha: 0.26 + launcherState.beamEngagement * 0.26 * flicker,
      cap: "round",
    });
  }
}

export function drawScannerContacts(
  graphics: Graphics,
  visibleContacts: readonly ScannerContactLike[],
): void {
  graphics.clear();

  for (const contact of visibleContacts) {
    const position = contact.visual.body.position;
    const enemyClass = isDefenseLike(contact.visual)
      ? getDefenseEnemyOverlayClass(contact.visual.config)
      : "unknown";
    const classStyle = WORLD_OVERLAY_STYLES.enemyClassStyles[enemyClass];
    const contactColor = isDefenseLike(contact.visual)
      ? classStyle.contactColor
      : WORLD_OVERLAY_STYLES.scannerContacts.strokeColor;
    const contactFillAlpha = isDefenseLike(contact.visual)
      ? classStyle.contactFillAlpha
      : WORLD_OVERLAY_STYLES.scannerContacts.fillAlpha;
    graphics.circle(position.x, position.y, 8);
    graphics.stroke({
      color: contactColor,
      width: WORLD_OVERLAY_STYLES.scannerContacts.strokeWidth,
      alpha: WORLD_OVERLAY_STYLES.scannerContacts.strokeAlpha,
    });
    graphics.circle(position.x, position.y, 2.5);
    graphics.fill({
      color: contactColor,
      alpha: contactFillAlpha,
    });
  }
}

export function drawLikelyEnemyMarkers(
  graphics: Graphics,
  markers: readonly LikelyEnemyMarkerLike[],
): void {
  graphics.clear();

  if (markers.length === 0) {
    return;
  }

  const pulse = 0.72 + 0.28 * Math.sin(performance.now() / 220);
  const style = WORLD_OVERLAY_STYLES.likelyEnemyContact;

  for (const marker of markers) {
    const enemyClass = marker.enemyClass ?? "unknown";
    const classStyle = WORLD_OVERLAY_STYLES.enemyClassStyles[enemyClass];
    const radius = marker.radius * (1 + pulse * 0.08);
    const center = marker.position;

    graphics.moveTo(center.x, center.y - radius);
    graphics.lineTo(center.x + radius, center.y);
    graphics.lineTo(center.x, center.y + radius);
    graphics.lineTo(center.x - radius, center.y);
    graphics.lineTo(center.x, center.y - radius);
    graphics.stroke({
      color: classStyle.likelyEnemyColor,
      width: style.width,
      alpha: style.alpha * (0.88 + pulse * 0.12),
      join: "round",
    });

    graphics.circle(center.x, center.y, radius * 0.36);
    graphics.stroke({
      color: classStyle.likelyEnemyColor,
      width: style.width * 0.72,
      alpha: style.innerAlpha,
    });

    graphics.circle(center.x, center.y, style.pingRadius + pulse * 5);
    graphics.stroke({
      color: classStyle.likelyEnemyColor,
      width: style.width * 0.8,
      alpha: style.pingAlpha * pulse,
    });
  }
}

function isDefenseLike(
  visual: DefenseLike | CelestialLike,
): visual is DefenseLike {
  return "weaponType" in visual.config;
}

function getDefenseEnemyOverlayClass(
  config: DefenseConfig,
): EnemyOverlayClass {
  if (config.weaponType === "beam") {
    return "raider";
  }
  if (config.weaponType === "station") {
    return "supportStation";
  }
  if (config.weaponType === "target") {
    return "trainingTarget";
  }
  if (
    config.anchorToParent === "dark-side" ||
    config.anchorToParent === "fixed"
  ) {
    return "surfaceLauncher";
  }
  return "orbitalLauncher";
}

function getDefenseSensorHalfAngle(
  defensePosition: Vector2Like,
  parentPosition: Vector2Like,
  parentRadius: number,
  bonusDegrees: number,
): number {
  const distanceFromParent = distanceBetween(defensePosition, parentPosition);
  const clampedRatio = Math.max(
    -1,
    Math.min(1, parentRadius / Math.max(distanceFromParent, parentRadius)),
  );
  const tangentHalfAngle = Math.acos(clampedRatio);
  return tangentHalfAngle + (bonusDegrees * Math.PI) / 180;
}

function drawCircularScannerField(
  graphics: Graphics,
  center: Vector2Like,
  radius: number,
  innerRadius: number,
  occluders: readonly CelestialLike[],
  style: {
    shellColor: number;
    shellSteps: number;
    shellAlpha: number;
    rimColor: number;
    rimWidth: number;
    rimAlpha: number;
    occlusionColor: number;
    occlusionAlpha: number;
  },
): void {
  const shellSteps = Math.max(1, style.shellSteps);

  for (let index = 0; index < shellSteps; index += 1) {
    const t = index / Math.max(1, shellSteps - 1);
    const shellRadius =
      innerRadius + (radius - innerRadius) * (t + 1) / shellSteps;
    graphics.circle(center.x, center.y, shellRadius);
    graphics.stroke({
      color: style.shellColor,
      width: Math.max(1, (radius - innerRadius) / shellSteps),
      alpha: style.shellAlpha * (1 - t * 0.7),
    });
  }

  for (const occluder of occluders) {
    const shadow = getScannerShadowWedge(
      center,
      radius,
      occluder.body.position,
      occluder.body.radius * 1.04,
    );

    if (!shadow) {
      continue;
    }

    const outerLeftPoint = {
      x: center.x + Math.cos(shadow.startAngle) * radius,
      y: center.y + Math.sin(shadow.startAngle) * radius,
    };
    const innerLeftPoint = {
      x: center.x + Math.cos(shadow.startAngle) * shadow.tangentDistance,
      y: center.y + Math.sin(shadow.startAngle) * shadow.tangentDistance,
    };
    const innerRightPoint = {
      x: center.x + Math.cos(shadow.endAngle) * shadow.tangentDistance,
      y: center.y + Math.sin(shadow.endAngle) * shadow.tangentDistance,
    };

    graphics.moveTo(innerLeftPoint.x, innerLeftPoint.y);
    graphics.lineTo(outerLeftPoint.x, outerLeftPoint.y);
    graphics.arc(center.x, center.y, radius, shadow.startAngle, shadow.endAngle);
    graphics.lineTo(innerRightPoint.x, innerRightPoint.y);
    graphics.arc(
      center.x,
      center.y,
      shadow.tangentDistance,
      shadow.endAngle,
      shadow.startAngle,
      true,
    );
    graphics.fill({
      color: style.occlusionColor,
      alpha: style.occlusionAlpha,
    });
  }

  graphics.circle(center.x, center.y, radius);
  graphics.stroke({
    color: style.rimColor,
    width: style.rimWidth,
    alpha: style.rimAlpha,
  });
}

function drawDashedCircle(
  graphics: Graphics,
  center: Vector2Like,
  radius: number,
  options: {
    dashCount: number;
    dashCoverage: number;
    color: number;
    width: number;
    alpha: number;
  },
): void {
  const fullTurn = Math.PI * 2;
  const segmentAngle = fullTurn / options.dashCount;
  const dashAngle = segmentAngle * options.dashCoverage;

  for (let index = 0; index < options.dashCount; index += 1) {
    const startAngle = index * segmentAngle;
    const endAngle = startAngle + dashAngle;
    graphics.moveTo(
      center.x + Math.cos(startAngle) * radius,
      center.y + Math.sin(startAngle) * radius,
    );
    graphics.arc(center.x, center.y, radius, startAngle, endAngle);
    graphics.stroke({
      color: options.color,
      width: options.width,
      alpha: options.alpha,
      cap: WORLD_OVERLAY_STYLES.dashedCircle.defaultCap,
    });
  }
}

function buildDashedPathSegments(
  points: readonly Vector2Like[],
  dashLength: number,
  gapLength: number,
): { start: Vector2Like; end: Vector2Like }[] {
  const segments: { start: Vector2Like; end: Vector2Like }[] = [];

  if (points.length < 2) {
    return segments;
  }

  let drawDash = true;
  let remainingPatternLength = dashLength;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const segmentLength = Math.hypot(deltaX, deltaY);

    if (segmentLength <= 0.0001) {
      continue;
    }

    let traversed = 0;
    while (traversed < segmentLength) {
      const chunkLength = Math.min(
        remainingPatternLength,
        segmentLength - traversed,
      );
      const chunkStartRatio = traversed / segmentLength;
      const chunkEndRatio = (traversed + chunkLength) / segmentLength;
      const chunkStart = {
        x: start.x + deltaX * chunkStartRatio,
        y: start.y + deltaY * chunkStartRatio,
      };
      const chunkEnd = {
        x: start.x + deltaX * chunkEndRatio,
        y: start.y + deltaY * chunkEndRatio,
      };

      if (drawDash) {
        segments.push({
          start: chunkStart,
          end: chunkEnd,
        });
      }

      traversed += chunkLength;
      remainingPatternLength -= chunkLength;

      if (remainingPatternLength <= 0.0001) {
        drawDash = !drawDash;
        remainingPatternLength = drawDash ? dashLength : gapLength;
      }
    }
  }

  return segments;
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle: number): number {
  let normalized = angle;

  while (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
