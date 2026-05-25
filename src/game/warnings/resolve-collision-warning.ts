import type { GameWarningState } from "./game-warning-manager";

export const COLLISION_WARNING_DANGER_CLEARANCE = 42;
export const COLLISION_WARNING_CAUTION_CLEARANCE = 190;
export const COLLISION_WARNING_MIN_CLOSING_SPEED = 12;
const COLLISION_PADDING = 18;

export interface CollisionCheckPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface CollisionCheckBody {
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export function resolveCollisionWarning(
  player: CollisionCheckPlayer | null,
  bodies: readonly CollisionCheckBody[],
): GameWarningState | null {
  if (!player) {
    return null;
  }

  let nearestThreat: {
    bodyName: string;
    clearance: number;
    closingSpeed: number;
  } | null = null;

  for (const body of bodies) {
    const dx = player.x - body.x;
    const dy = player.y - body.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1e-6) {
      continue;
    }

    const normalX = dx / distance;
    const normalY = dy / distance;
    const safeDistance = body.radius + COLLISION_PADDING;
    const clearance = distance - safeDistance;
    const relVx = player.vx - body.vx;
    const relVy = player.vy - body.vy;
    const closingSpeed = Math.max(0, -(relVx * normalX + relVy * normalY));

    if (!nearestThreat || clearance < nearestThreat.clearance) {
      nearestThreat = { bodyName: body.name, clearance, closingSpeed };
    }
  }

  if (!nearestThreat) {
    return null;
  }

  if (nearestThreat.clearance <= COLLISION_WARNING_DANGER_CLEARANCE) {
    return {
      id: "collision-imminent",
      title: "COLLISION IMMINENT",
      message: `Clear ${nearestThreat.bodyName} now.`,
      accentColor: "#ff7b72",
      priority: 290,
    };
  }

  if (
    nearestThreat.clearance <= COLLISION_WARNING_CAUTION_CLEARANCE
    && nearestThreat.closingSpeed >= COLLISION_WARNING_MIN_CLOSING_SPEED
  ) {
    const etaSeconds = nearestThreat.clearance / nearestThreat.closingSpeed;
    return {
      id: "collision-warning",
      title: "IMPACT TRAJECTORY",
      message:
        Number.isFinite(etaSeconds) && etaSeconds > 0
          ? `${nearestThreat.bodyName} in ${etaSeconds.toFixed(1)}s`
          : `Closing on ${nearestThreat.bodyName}`,
      accentColor: "#ffbd59",
      priority: 210,
    };
  }

  return null;
}
