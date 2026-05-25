import type { SimCelestialBodySnapshot, SimPlayerWarning, PlayerInputCommand } from "./protocol.js";
import type { MultiplayerSimPlayerState } from "../shared/multiplayer-simulation-core.js";

// Disintegrator-range constants (km, matching single-player beam maps)
const ENEMY_TARGETING_RANGE = 440;
const ENEMY_TARGETING_CONE_HALF_ANGLE = Math.PI / 6; // 30 degrees half-angle

// Trajectory forecast for nav warning — 60 steps × 0.25 s = 15-second horizon
const NAV_FORECAST_STEPS = 60;
const NAV_FORECAST_STEP_SECONDS = 0.25;
const GRAVITY_CONSTANT = 750;
const GRAVITY_SOFTENING_SQ = 15 * 15;

export function computePlayerWarningChannels(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
  celestialBodies: readonly SimCelestialBodySnapshot[],
): Map<string, SimPlayerWarning[]> {
  const channels = new Map<string, SimPlayerWarning[]>();
  for (const player of players.values()) {
    if (player.life?.alive !== false) {
      channels.set(player.playerId, []);
    }
  }

  addEnemyTargetingWarnings(players, inputByPlayerId, channels);
  addNavSolutionWarnings(players, celestialBodies, channels);

  return channels;
}

function addEnemyTargetingWarnings(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
  channels: Map<string, SimPlayerWarning[]>,
): void {
  for (const attacker of players.values()) {
    if (attacker.life?.alive === false) {
      continue;
    }
    const input = inputByPlayerId.get(attacker.playerId);
    if (!input?.firePrimary) {
      continue;
    }

    for (const target of players.values()) {
      if (target.playerId === attacker.playerId || target.life?.alive === false) {
        continue;
      }

      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const distance = Math.hypot(dx, dy);
      if (distance > ENEMY_TARGETING_RANGE || distance < 0.001) {
        continue;
      }

      const angleToTarget = Math.atan2(dy, dx);
      let angleDiff = Math.abs(angleToTarget - attacker.heading);
      if (angleDiff > Math.PI) {
        angleDiff = Math.PI * 2 - angleDiff;
      }
      if (angleDiff > ENEMY_TARGETING_CONE_HALF_ANGLE) {
        continue;
      }

      const targetWarnings = channels.get(target.playerId);
      if (!targetWarnings) {
        continue;
      }

      // Only add once per target (multiple attackers → one consolidated warning)
      if (targetWarnings.some((w) => w.id === "enemy-targeting")) {
        continue;
      }

      targetWarnings.push({
        id: "enemy-lock",
        title: "ENEMY LOCK",
        message: `Hostile targeting at ${Math.round(distance)} km.`,
        accentColor: "#ff9158",
        priority: 200,
      });
    }
  }
}

function addNavSolutionWarnings(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
  celestialBodies: readonly SimCelestialBodySnapshot[],
  channels: Map<string, SimPlayerWarning[]>,
): void {
  if (celestialBodies.length === 0) {
    return;
  }

  for (const player of players.values()) {
    if (player.life?.alive === false) {
      continue;
    }

    if (forecastHitsCelestialBody(player, celestialBodies)) {
      const warnings = channels.get(player.playerId);
      if (warnings) {
        warnings.push({
          id: "nav-solution-unstable",
          title: "NAV SOLUTION UNSTABLE",
          message: "Guidance horizon is too short for reliable navigation.",
          accentColor: "#ff8a6a",
          priority: 100,
        });
      }
    }
  }
}

function forecastHitsCelestialBody(
  player: MultiplayerSimPlayerState,
  celestialBodies: readonly SimCelestialBodySnapshot[],
): boolean {
  let x = player.x;
  let y = player.y;
  let vx = player.vx;
  let vy = player.vy;

  for (let step = 0; step < NAV_FORECAST_STEPS; step++) {
    // Accumulate gravity then step position
    for (const body of celestialBodies) {
      const dx = body.x - x;
      const dy = body.y - y;
      const distSq = dx * dx + dy * dy + GRAVITY_SOFTENING_SQ;
      const dist = Math.sqrt(distSq);
      const accel = (GRAVITY_CONSTANT * body.mass) / distSq;
      vx += (dx / dist) * accel * NAV_FORECAST_STEP_SECONDS;
      vy += (dy / dist) * accel * NAV_FORECAST_STEP_SECONDS;
    }

    x += vx * NAV_FORECAST_STEP_SECONDS;
    y += vy * NAV_FORECAST_STEP_SECONDS;

    for (const body of celestialBodies) {
      const dx = body.x - x;
      const dy = body.y - y;
      if (Math.hypot(dx, dy) <= body.radius) {
        return true;
      }
    }
  }

  return false;
}
