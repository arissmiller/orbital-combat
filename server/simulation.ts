import type {
  PlayerInputCommand,
  SimCelestialBodySnapshot,
  SimPlayerSnapshot,
  SimulationSnapshot,
} from "./protocol.js";
import {
  createMultiplayerMapRuntime,
  evaluateMultiplayerMap,
  getDefaultMultiplayerMapDefinition,
  type MultiplayerMapDefinition,
  type MultiplayerMapRuntime,
} from "./map.js";

const PLAYER_ACCELERATION = 240;
const PLAYER_DRAG_PER_SECOND = 2.4;
const PLAYER_MAX_SPEED = 420;
const PLAYER_TURN_RATE = Math.PI * 1.4;
const SPAWN_RADIUS_FALLBACK = 180;
const GRAVITY_CONSTANT = 46;
const GRAVITY_SOFTENING_DISTANCE = 120;
const PLAYER_COLLISION_PADDING = 18;

interface SimPlayerState {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  lastProcessedInputSequence: number | null;
}

export interface RoomSimulationState {
  roomCode: string;
  tick: number;
  elapsedSeconds: number;
  mapDefinition: MultiplayerMapDefinition;
  mapRuntime: MultiplayerMapRuntime;
  celestialBodies: SimCelestialBodySnapshot[];
  players: Map<string, SimPlayerState>;
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
  const orbitDirectionSign = mapDefinition.spawnOrbitDirection === "ccw" ? -1 : 1;
  const orbitalSpeed =
    primaryBody && spawnRadius > 0
      ? Math.sqrt((GRAVITY_CONSTANT * primaryBody.mass) / spawnRadius)
      : 0;

  const players = new Map<string, SimPlayerState>();
  const count = Math.max(playerIds.length, 1);

  playerIds.forEach((playerId, index) => {
    const angle = (Math.PI * 2 * index) / count;
    const tangentAngle = angle + orbitDirectionSign * (Math.PI * 0.5);
    const spawnCenterX = primaryBody?.x ?? 0;
    const spawnCenterY = primaryBody?.y ?? 0;

    players.set(playerId, {
      playerId,
      x: spawnCenterX + Math.cos(angle) * spawnRadius,
      y: spawnCenterY + Math.sin(angle) * spawnRadius,
      vx: Math.cos(tangentAngle) * orbitalSpeed,
      vy: Math.sin(tangentAngle) * orbitalSpeed,
      heading: tangentAngle,
      lastProcessedInputSequence: null,
    });
  });

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

  for (const player of simulation.players.values()) {
    const input = inputByPlayerId.get(player.playerId) ?? null;
    if (input) {
      player.lastProcessedInputSequence = input.sequence;

      const accelerationX = input.thrustX * PLAYER_ACCELERATION;
      const accelerationY = input.thrustY * PLAYER_ACCELERATION;
      player.vx += accelerationX * stepSeconds;
      player.vy += accelerationY * stepSeconds;
      player.heading += input.yaw * PLAYER_TURN_RATE * stepSeconds;
    }

    applyCelestialGravity(player, simulation.celestialBodies, stepSeconds);

    const dragMultiplier = Math.max(0, 1 - PLAYER_DRAG_PER_SECOND * stepSeconds);
    player.vx *= dragMultiplier;
    player.vy *= dragMultiplier;

    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER_MAX_SPEED && speed > 0) {
      const clampedMultiplier = PLAYER_MAX_SPEED / speed;
      player.vx *= clampedMultiplier;
      player.vy *= clampedMultiplier;
    }

    player.x += player.vx * stepSeconds;
    player.y += player.vy * stepSeconds;

    resolveCelestialCollisions(player, simulation.celestialBodies);
  }
}

export function buildSimulationSnapshot(
  simulation: RoomSimulationState,
): SimulationSnapshot {
  const players: SimPlayerSnapshot[] = [];
  for (const player of simulation.players.values()) {
    players.push({
      playerId: player.playerId,
      x: round3(player.x),
      y: round3(player.y),
      vx: round3(player.vx),
      vy: round3(player.vy),
      heading: round3(player.heading),
      lastProcessedInputSequence: player.lastProcessedInputSequence,
    });
  }

  return {
    roomCode: simulation.roomCode,
    tick: simulation.tick,
    sentAtMs: Date.now(),
    players,
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

function applyCelestialGravity(
  player: SimPlayerState,
  celestialBodies: readonly SimCelestialBodySnapshot[],
  stepSeconds: number,
): void {
  for (const body of celestialBodies) {
    const dx = body.x - player.x;
    const dy = body.y - player.y;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq <= 1e-6) {
      continue;
    }

    const distance = Math.sqrt(distanceSq);
    const softeningRadius = body.radius + GRAVITY_SOFTENING_DISTANCE;
    const softenedDistanceSq = Math.max(distanceSq, softeningRadius * softeningRadius);
    const accelerationMagnitude = (GRAVITY_CONSTANT * body.mass) / softenedDistanceSq;

    player.vx += (dx / distance) * accelerationMagnitude * stepSeconds;
    player.vy += (dy / distance) * accelerationMagnitude * stepSeconds;
  }
}

function resolveCelestialCollisions(
  player: SimPlayerState,
  celestialBodies: readonly SimCelestialBodySnapshot[],
): void {
  for (const body of celestialBodies) {
    const dx = player.x - body.x;
    const dy = player.y - body.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = body.radius + PLAYER_COLLISION_PADDING;

    if (distance >= minDistance) {
      continue;
    }

    const normalX = distance > 1e-6 ? dx / distance : 1;
    const normalY = distance > 1e-6 ? dy / distance : 0;
    const penetration = minDistance - distance;

    player.x += normalX * penetration;
    player.y += normalY * penetration;

    const radialVelocity = player.vx * normalX + player.vy * normalY;
    if (radialVelocity < 0) {
      player.vx -= radialVelocity * normalX;
      player.vy -= radialVelocity * normalY;
    }
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
