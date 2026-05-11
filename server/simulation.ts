import type {
  PlayerInputCommand,
  SimPlayerSnapshot,
  SimulationSnapshot,
} from "./protocol.js";

const PLAYER_ACCELERATION = 240;
const PLAYER_DRAG_PER_SECOND = 2.4;
const PLAYER_MAX_SPEED = 420;
const PLAYER_TURN_RATE = Math.PI * 1.4;
const SPAWN_RADIUS = 180;

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
  players: Map<string, SimPlayerState>;
}

export function createRoomSimulation(
  roomCode: string,
  playerIds: string[],
): RoomSimulationState {
  const players = new Map<string, SimPlayerState>();
  const count = Math.max(playerIds.length, 1);

  playerIds.forEach((playerId, index) => {
    const angle = (Math.PI * 2 * index) / count;
    players.set(playerId, {
      playerId,
      x: Math.cos(angle) * SPAWN_RADIUS,
      y: Math.sin(angle) * SPAWN_RADIUS,
      vx: 0,
      vy: 0,
      heading: angle + Math.PI * 0.5,
      lastProcessedInputSequence: null,
    });
  });

  return {
    roomCode,
    tick: 0,
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
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
