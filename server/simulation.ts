import type {
  PlayerInputCommand,
  SimCelestialBodySnapshot,
  SimulationSnapshot,
} from "./protocol.js";
import {
  createMultiplayerMapRuntime,
  evaluateMultiplayerMap,
  getDefaultMultiplayerMapDefinition,
  type MultiplayerMapDefinition,
  type MultiplayerMapRuntime,
} from "./map.js";
import {
  buildSimPlayerSnapshots,
  createSpawnedPlayers,
  DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  round3,
  stepMultiplayerPlayers,
  type MultiplayerSimPlayerState,
} from "../shared/multiplayer-simulation-core.js";
import { computePlayerWarningChannels } from "./player-warning-channels.js";

const SPAWN_RADIUS_FALLBACK = 180;
const PLAYER_RESPAWN_DELAY_SECONDS = 2.25;
const PLAYER_RESPAWN_GRACE_SECONDS = 1.35;
const PLAYER_DEATH_IMPACT_SPEED = 0.5;
const RESPAWN_PLAYER_CLEARANCE = 110;
const RESPAWN_CELESTIAL_CLEARANCE_PADDING = 42;

export interface RoomSimulationState {
  roomCode: string;
  tick: number;
  elapsedSeconds: number;
  mapDefinition: MultiplayerMapDefinition;
  mapRuntime: MultiplayerMapRuntime;
  celestialBodies: SimCelestialBodySnapshot[];
  players: Map<string, MultiplayerSimPlayerState>;
}

export function createRoomSimulation(
  roomCode: string,
  playerIds: string[],
  mapDefinition = getDefaultMultiplayerMapDefinition(),
): RoomSimulationState {
  const mapRuntime = createMultiplayerMapRuntime(mapDefinition);
  const initialCelestialBodies = evaluateMultiplayerMap(mapRuntime, 0);
  const primaryBody =
    initialCelestialBodies.find((body) => body.parentId === null)
    ?? initialCelestialBodies[0]
    ?? null;
  const spawnRadius =
    mapDefinition.spawnOrbitRadius > 0
      ? mapDefinition.spawnOrbitRadius
      : SPAWN_RADIUS_FALLBACK;
  const players = createSpawnedPlayers(playerIds, {
    spawnCenterX: primaryBody?.x ?? 0,
    spawnCenterY: primaryBody?.y ?? 0,
    spawnRadius,
    spawnOrbitDirection: mapDefinition.spawnOrbitDirection,
    primaryMass: primaryBody?.mass ?? null,
  });
  for (const player of players.values()) {
    armPlayerForLife(player, PLAYER_RESPAWN_GRACE_SECONDS);
  }

  return {
    roomCode,
    tick: 0,
    elapsedSeconds: 0,
    mapDefinition,
    mapRuntime,
    celestialBodies: initialCelestialBodies,
    players,
  };
}

export function removePlayerFromSimulation(
  simulation: RoomSimulationState,
  playerId: string,
): void {
  simulation.players.delete(playerId);
}

export function addPlayerToSimulation(
  simulation: RoomSimulationState,
  playerId: string,
): boolean {
  if (simulation.players.has(playerId)) {
    return false;
  }

  const primaryBody =
    simulation.celestialBodies.find((body) => body.parentId === null)
    ?? simulation.celestialBodies[0]
    ?? null;
  const spawnRadius =
    simulation.mapDefinition.spawnOrbitRadius > 0
      ? simulation.mapDefinition.spawnOrbitRadius
      : SPAWN_RADIUS_FALLBACK;
  const spawnCenterX = primaryBody?.x ?? 0;
  const spawnCenterY = primaryBody?.y ?? 0;
  const spawnedPlayers = createSpawnedPlayers([playerId], {
    spawnCenterX,
    spawnCenterY,
    spawnRadius,
    spawnOrbitDirection: simulation.mapDefinition.spawnOrbitDirection,
    primaryMass: primaryBody?.mass ?? null,
  });
  const spawnedPlayer = spawnedPlayers.get(playerId);
  if (!spawnedPlayer) {
    return false;
  }

  const spawnAngle = pickDropInSpawnAngle(
    simulation,
    spawnCenterX,
    spawnCenterY,
    spawnRadius,
  );
  const orbitDirectionSign =
    simulation.mapDefinition.spawnOrbitDirection === "ccw" ? -1 : 1;
  const tangentAngle = spawnAngle + orbitDirectionSign * (Math.PI * 0.5);
  const orbitalSpeed = Math.hypot(spawnedPlayer.vx, spawnedPlayer.vy);

  spawnedPlayer.x = spawnCenterX + Math.cos(spawnAngle) * spawnRadius;
  spawnedPlayer.y = spawnCenterY + Math.sin(spawnAngle) * spawnRadius;
  spawnedPlayer.vx = Math.cos(tangentAngle) * orbitalSpeed;
  spawnedPlayer.vy = Math.sin(tangentAngle) * orbitalSpeed;
  spawnedPlayer.heading = tangentAngle;
  spawnedPlayer.stableMotionHeading = tangentAngle;
  spawnedPlayer.lastProcessedInputSequence = null;
  spawnedPlayer.throttle = 0;
  spawnedPlayer.thrustHeading = null;
  spawnedPlayer.superBurnActive = false;
  armPlayerForLife(spawnedPlayer, PLAYER_RESPAWN_GRACE_SECONDS);

  simulation.players.set(playerId, spawnedPlayer);
  return true;
}

export function stepRoomSimulation(
  simulation: RoomSimulationState,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
  stepSeconds: number,
): void {
  simulation.tick += 1;
  simulation.elapsedSeconds += stepSeconds;
  simulation.celestialBodies = evaluateMultiplayerMap(
    simulation.mapRuntime,
    simulation.elapsedSeconds,
  );
  stepMultiplayerPlayers(
    simulation.players,
    inputByPlayerId,
    simulation.celestialBodies,
    stepSeconds,
    DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  );
  updatePlayerLifeStates(simulation);
}

export function buildSimulationSnapshot(
  simulation: RoomSimulationState,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
): SimulationSnapshot {
  const warningChannels = computePlayerWarningChannels(
    simulation.players,
    inputByPlayerId,
    simulation.celestialBodies,
  );

  const playerSnapshots = buildSimPlayerSnapshots(simulation.players);
  for (const player of playerSnapshots) {
    const warnings = warningChannels.get(player.playerId);
    if (warnings && warnings.length > 0) {
      player.warnings = warnings;
    }
  }

  return {
    roomCode: simulation.roomCode,
    tick: simulation.tick,
    sentAtMs: Date.now(),
    players: playerSnapshots,
    mapId: simulation.mapDefinition.id,
    celestialBodies: simulation.celestialBodies.map((body) => ({
      id: body.id,
      name: body.name,
      parentId: body.parentId,
      x: round3(body.x),
      y: round3(body.y),
      vx: round3(body.vx),
      vy: round3(body.vy),
      mass: round3(body.mass),
      radius: round3(body.radius),
      orbitEccentricity: round3(body.orbitEccentricity),
    })),
  };
}

function pickDropInSpawnAngle(
  simulation: RoomSimulationState,
  centerX: number,
  centerY: number,
  spawnRadius: number,
  playerIdToIgnore?: string,
): number {
  if (simulation.players.size === 0 || spawnRadius <= 0) {
    return 0;
  }

  const candidateCount = Math.max(16, Math.min(64, simulation.players.size * 8));
  let bestAngle = 0;
  let bestClearance = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < candidateCount; index += 1) {
    const angle = (Math.PI * 2 * index) / candidateCount;
    const x = centerX + Math.cos(angle) * spawnRadius;
    const y = centerY + Math.sin(angle) * spawnRadius;
    let minClearance = Number.POSITIVE_INFINITY;

    for (const body of simulation.celestialBodies) {
      const distance = Math.hypot(body.x - x, body.y - y);
      const safeDistance =
        body.radius
        + DEFAULT_MULTIPLAYER_SIMULATION_TUNING.playerCollisionPadding
        + RESPAWN_CELESTIAL_CLEARANCE_PADDING;
      minClearance = Math.min(minClearance, distance - safeDistance);
    }

    for (const player of simulation.players.values()) {
      if (player.playerId === playerIdToIgnore) {
        continue;
      }
      if (player.life?.alive === false) {
        continue;
      }
      const dx = player.x - x;
      const dy = player.y - y;
      const distance = Math.hypot(dx, dy);
      minClearance = Math.min(minClearance, distance - RESPAWN_PLAYER_CLEARANCE);
    }

    if (minClearance > bestClearance) {
      bestClearance = minClearance;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

function updatePlayerLifeStates(simulation: RoomSimulationState): void {
  for (const player of simulation.players.values()) {
    const life = getOrCreatePlayerLife(player);
    const impactSpeed = player.lastCollisionImpactSpeed ?? 0;

    if (life.alive) {
      if (
        life.respawnGraceSeconds <= 0
        && impactSpeed >= PLAYER_DEATH_IMPACT_SPEED
      ) {
        destroyPlayerForRespawn(player);
      }
      continue;
    }

    if (life.respawnTimerSeconds <= 0) {
      respawnPlayer(simulation, player);
    }
  }
}

function destroyPlayerForRespawn(player: MultiplayerSimPlayerState): void {
  const life = getOrCreatePlayerLife(player);
  if (!life.alive) {
    return;
  }

  life.alive = false;
  life.deaths += 1;
  life.respawnTimerSeconds = PLAYER_RESPAWN_DELAY_SECONDS;
  life.respawnGraceSeconds = 0;

  player.vx = 0;
  player.vy = 0;
  player.throttle = 0;
  player.thrustHeading = null;
  player.superBurnActive = false;
  player.lastCollisionImpactSpeed = 0;
}

function respawnPlayer(
  simulation: RoomSimulationState,
  player: MultiplayerSimPlayerState,
): void {
  const primaryBody =
    simulation.celestialBodies.find((body) => body.parentId === null)
    ?? simulation.celestialBodies[0]
    ?? null;
  const spawnRadius =
    simulation.mapDefinition.spawnOrbitRadius > 0
      ? simulation.mapDefinition.spawnOrbitRadius
      : SPAWN_RADIUS_FALLBACK;
  const spawnCenterX = primaryBody?.x ?? 0;
  const spawnCenterY = primaryBody?.y ?? 0;
  const spawnAngle = pickDropInSpawnAngle(
    simulation,
    spawnCenterX,
    spawnCenterY,
    spawnRadius,
    player.playerId,
  );
  const orbitDirectionSign =
    simulation.mapDefinition.spawnOrbitDirection === "ccw" ? -1 : 1;
  const tangentAngle = spawnAngle + orbitDirectionSign * (Math.PI * 0.5);
  const orbitalSpeed =
    primaryBody?.mass && spawnRadius > 0
      ? Math.sqrt(
          (DEFAULT_MULTIPLAYER_SIMULATION_TUNING.gravitationalConstant * primaryBody.mass) /
            spawnRadius,
        )
      : 0;

  player.x = spawnCenterX + Math.cos(spawnAngle) * spawnRadius;
  player.y = spawnCenterY + Math.sin(spawnAngle) * spawnRadius;
  player.vx = (primaryBody?.vx ?? 0) + Math.cos(tangentAngle) * orbitalSpeed;
  player.vy = (primaryBody?.vy ?? 0) + Math.sin(tangentAngle) * orbitalSpeed;
  player.heading = tangentAngle;
  player.stableMotionHeading = tangentAngle;
  player.lastProcessedInputSequence = null;
  player.throttle = 0;
  player.thrustHeading = null;
  player.superBurnActive = false;
  player.lastCollisionImpactSpeed = 0;
  refillPlayerSystems(player);
  armPlayerForLife(player, PLAYER_RESPAWN_GRACE_SECONDS);
}

function armPlayerForLife(
  player: MultiplayerSimPlayerState,
  respawnGraceSeconds: number,
): void {
  const life = getOrCreatePlayerLife(player);
  life.alive = true;
  life.respawnTimerSeconds = 0;
  life.respawnGraceSeconds = Math.max(0, respawnGraceSeconds);
}

function refillPlayerSystems(player: MultiplayerSimPlayerState): void {
  if (!player.systems) {
    return;
  }

  player.systems.boosted = "engines";
  for (const subsystem of [
    player.systems.engines,
    player.systems.scanners,
    player.systems.weapons,
    player.systems.defenses,
  ]) {
    subsystem.charge = subsystem.maxCharge;
  }
}

function getOrCreatePlayerLife(
  player: MultiplayerSimPlayerState,
): NonNullable<MultiplayerSimPlayerState["life"]> {
  if (!player.life) {
    player.life = {
      alive: true,
      respawnTimerSeconds: 0,
      respawnGraceSeconds: 0,
      deaths: 0,
    };
  }
  return player.life;
}
