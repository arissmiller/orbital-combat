import type {
  SimCelestialBodySnapshot,
  SimPlayerSnapshot,
  SimulationSnapshot,
} from "./multiplayer-protocol.js";
import {
  DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  stepMultiplayerPlayers,
  type MultiplayerSimPlayerState,
} from "./multiplayer-simulation-core.js";

export interface ResolvedSimPlayerState extends SimPlayerSnapshot {
  renderX: number;
  renderY: number;
}

export interface ResolvedSimCelestialBodyState extends SimCelestialBodySnapshot {
  renderX: number;
  renderY: number;
}

export interface ResolvedSimulationFrame {
  tick: number;
  players: ResolvedSimPlayerState[];
  celestialBodies: ResolvedSimCelestialBodyState[];
}

export interface ResolveSimulationFrameOptions {
  previousSnapshot: SimulationSnapshot | null;
  latestSnapshot: SimulationSnapshot | null;
  nowMs: number;
  interpolationDelayMs: number;
  extrapolationLimitMs: number;
}

export function resolveSimulationFrame(
  options: ResolveSimulationFrameOptions,
): ResolvedSimulationFrame | null {
  const latestSnapshot = options.latestSnapshot;
  if (!latestSnapshot) {
    return null;
  }

  const renderTimeMs = options.nowMs - options.interpolationDelayMs;
  const previousSnapshot = options.previousSnapshot;

  if (!previousSnapshot || previousSnapshot.tick >= latestSnapshot.tick) {
    return buildProjectedFrame(latestSnapshot, renderTimeMs, options.extrapolationLimitMs);
  }

  const previousTime = previousSnapshot.sentAtMs;
  const latestTime = latestSnapshot.sentAtMs;

  if (latestTime <= previousTime) {
    return buildProjectedFrame(latestSnapshot, renderTimeMs, options.extrapolationLimitMs);
  }
  if (renderTimeMs <= previousTime) {
    return buildProjectedFrame(previousSnapshot, renderTimeMs, options.extrapolationLimitMs);
  }
  if (renderTimeMs >= latestTime) {
    return buildProjectedFrame(latestSnapshot, renderTimeMs, options.extrapolationLimitMs);
  }

  const alpha = clamp((renderTimeMs - previousTime) / (latestTime - previousTime), 0, 1);
  const previousPlayersById = new Map(
    previousSnapshot.players.map((player) => [player.playerId, player]),
  );
  const previousBodiesById = new Map(
    (previousSnapshot.celestialBodies ?? []).map((body) => [body.id, body]),
  );

  const players = latestSnapshot.players.map((player) => {
    const previousPlayer = previousPlayersById.get(player.playerId);
    if (!previousPlayer) {
      return {
        ...player,
        renderX: player.x,
        renderY: player.y,
      };
    }

    return {
      ...player,
      vx: lerp(previousPlayer.vx, player.vx, alpha),
      vy: lerp(previousPlayer.vy, player.vy, alpha),
      throttle:
        previousPlayer.throttle !== undefined && previousPlayer.throttle !== null
        && player.throttle !== undefined && player.throttle !== null
          ? lerp(previousPlayer.throttle, player.throttle, alpha)
          : player.throttle,
      heading: lerpAngle(previousPlayer.heading, player.heading, alpha),
      thrustHeading:
        previousPlayer.thrustHeading !== null && previousPlayer.thrustHeading !== undefined
        && player.thrustHeading !== null && player.thrustHeading !== undefined
          ? lerpAngle(previousPlayer.thrustHeading, player.thrustHeading, alpha)
          : player.thrustHeading,
      renderX: lerp(previousPlayer.x, player.x, alpha),
      renderY: lerp(previousPlayer.y, player.y, alpha),
    };
  });

  const bodies = (latestSnapshot.celestialBodies ?? []).map((body) => {
    const previousBody = previousBodiesById.get(body.id);
    if (!previousBody) {
      return {
        ...body,
        renderX: body.x,
        renderY: body.y,
      };
    }

    return {
      ...body,
      renderX: lerp(previousBody.x, body.x, alpha),
      renderY: lerp(previousBody.y, body.y, alpha),
    };
  });

  return {
    tick: latestSnapshot.tick,
    players,
    celestialBodies: bodies,
  };
}

function buildProjectedFrame(
  snapshot: SimulationSnapshot,
  renderTimeMs: number,
  extrapolationLimitMs: number,
): ResolvedSimulationFrame {
  const deltaMs = clamp(
    renderTimeMs - snapshot.sentAtMs,
    0,
    extrapolationLimitMs,
  );
  const deltaSeconds = deltaMs / 1000;

  const bodies = (snapshot.celestialBodies ?? []).map((body): ResolvedSimCelestialBodyState => ({
    ...body,
    renderX: body.x + body.vx * deltaSeconds,
    renderY: body.y + body.vy * deltaSeconds,
  }));
  const simulationBodies: SimCelestialBodySnapshot[] = bodies.map((body) => ({
    id: body.id,
    name: body.name,
    parentId: body.parentId,
    x: body.renderX,
    y: body.renderY,
    vx: body.vx,
    vy: body.vy,
    mass: body.mass,
    radius: body.radius,
    orbitEccentricity: body.orbitEccentricity,
  }));
  const playerMetadataById = new Map(
    snapshot.players.map((player) => [
      player.playerId,
      {
        scanner: player.scanner,
        warnings: player.warnings,
      },
    ] as const),
  );
  const playersById = new Map<string, MultiplayerSimPlayerState>();
  for (const player of snapshot.players) {
    playersById.set(player.playerId, {
      playerId: player.playerId,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      heading: player.heading,
      lastProcessedInputSequence: player.lastProcessedInputSequence,
      throttle: player.throttle,
      thrustHeading: player.thrustHeading,
      superBurnActive: player.superBurnActive,
      life: player.life
        ? {
            alive: player.life.alive,
            respawnTimerSeconds: player.life.respawnTimerSeconds,
            respawnGraceSeconds: player.life.respawnGraceSeconds,
            deaths: player.life.deaths,
            health: player.life.health,
            maxHealth: player.life.maxHealth,
          }
        : undefined,
      systems: player.systems
        ? {
            boosted: player.systems.boosted,
            engines: {
              baseMaxCharge: player.systems.engines.maxCharge,
              charge: player.systems.engines.charge,
              maxCharge: player.systems.engines.maxCharge,
            },
            scanners: {
              baseMaxCharge: player.systems.scanners.maxCharge,
              charge: player.systems.scanners.charge,
              maxCharge: player.systems.scanners.maxCharge,
            },
            weapons: {
              baseMaxCharge: player.systems.weapons.maxCharge,
              charge: player.systems.weapons.charge,
              maxCharge: player.systems.weapons.maxCharge,
            },
            defenses: {
              baseMaxCharge: player.systems.defenses.maxCharge,
              charge: player.systems.defenses.charge,
              maxCharge: player.systems.defenses.maxCharge,
            },
          }
        : undefined,
    });
  }
  const emptyInputs = new Map<string, null>();
  stepMultiplayerPlayers(
    playersById,
    emptyInputs,
    simulationBodies,
    deltaSeconds,
    DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  );
  const players: ResolvedSimPlayerState[] = [];
  for (const player of playersById.values()) {
    const metadata = playerMetadataById.get(player.playerId);
    players.push({
      playerId: player.playerId,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      heading: player.heading,
      lastProcessedInputSequence: player.lastProcessedInputSequence,
      throttle: player.throttle,
      thrustHeading: player.thrustHeading,
      superBurnActive: player.superBurnActive,
      life: player.life
        ? {
            alive: player.life.alive,
            respawnTimerSeconds: player.life.respawnTimerSeconds,
            respawnGraceSeconds: player.life.respawnGraceSeconds,
            deaths: player.life.deaths,
            health: player.life.health,
            maxHealth: player.life.maxHealth,
          }
        : undefined,
      systems: player.systems
        ? {
            boosted: player.systems.boosted,
            engines: {
              charge: player.systems.engines.charge,
              maxCharge: player.systems.engines.maxCharge,
            },
            scanners: {
              charge: player.systems.scanners.charge,
              maxCharge: player.systems.scanners.maxCharge,
            },
            weapons: {
              charge: player.systems.weapons.charge,
              maxCharge: player.systems.weapons.maxCharge,
            },
            defenses: {
              charge: player.systems.defenses.charge,
              maxCharge: player.systems.defenses.maxCharge,
            },
          }
        : undefined,
      scanner: metadata?.scanner
        ? {
            range: metadata.scanner.range,
            contacts: metadata.scanner.contacts.map((contact) => ({
              targetPlayerId: contact.targetPlayerId,
              distance: contact.distance,
              inRange: contact.inRange,
              visible: contact.visible,
              occludedByCelestialId: contact.occludedByCelestialId,
              lockProgress: contact.lockProgress,
              registered: contact.registered,
            })),
          }
        : undefined,
      warnings: metadata?.warnings
        ? metadata.warnings.map((warning) => ({
            id: warning.id,
            title: warning.title,
            message: warning.message,
            accentColor: warning.accentColor,
            priority: warning.priority,
          }))
        : undefined,
      renderX: player.x,
      renderY: player.y,
    });
  }

  return {
    tick: snapshot.tick,
    players,
    celestialBodies: bodies,
  };
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function lerpAngle(start: number, end: number, alpha: number): number {
  const delta = normalizeAngle(end - start);
  return start + delta * alpha;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }
  while (normalized < -Math.PI) {
    normalized += Math.PI * 2;
  }
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
