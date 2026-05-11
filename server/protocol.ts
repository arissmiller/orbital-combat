const MAX_NAME_LENGTH = 24;

export const SERVER_TICK_RATE = 20;
export const DEFAULT_MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 6;

export type ClientMessage =
  | {
      type: "hello";
      displayName?: string;
    }
  | {
      type: "create-room";
      maxPlayers?: number;
    }
  | {
      type: "join-room";
      roomCode: string;
      displayName?: string;
    }
  | {
      type: "leave-room";
    }
  | {
      type: "ready";
      ready: boolean;
    }
  | {
      type: "start-match";
    }
  | {
      type: "input";
      sequence: number;
      thrustX: number;
      thrustY: number;
      yaw: number;
      firePrimary: boolean;
      fireSecondary: boolean;
    }
  | {
      type: "ping";
      clientTime: number;
    };

export interface RoomPlayerSnapshot {
  id: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface RoomSnapshot {
  code: string;
  status: "lobby" | "running";
  maxPlayers: number;
  hostPlayerId: string;
  players: RoomPlayerSnapshot[];
}

export interface SimPlayerSnapshot {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  lastProcessedInputSequence: number | null;
}

export interface SimulationSnapshot {
  roomCode: string;
  tick: number;
  sentAtMs: number;
  players: SimPlayerSnapshot[];
}

export type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      serverTimeMs: number;
    }
  | {
      type: "room-update";
      room: RoomSnapshot;
    }
  | {
      type: "match-started";
      roomCode: string;
      tick: number;
      serverTimeMs: number;
    }
  | {
      type: "snapshot";
      snapshot: SimulationSnapshot;
    }
  | {
      type: "pong";
      clientTime: number;
      serverTimeMs: number;
    }
  | {
      type: "info";
      message: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export interface PlayerInputCommand {
  sequence: number;
  thrustX: number;
  thrustY: number;
  yaw: number;
  firePrimary: boolean;
  fireSecondary: boolean;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const message = raw as Record<string, unknown>;
  if (typeof message.type !== "string") {
    return null;
  }

  switch (message.type) {
    case "hello":
      return {
        type: "hello",
        displayName: sanitizeDisplayName(message.displayName),
      };
    case "create-room":
      if (message.maxPlayers === undefined) {
        return {
          type: "create-room",
        };
      }
      {
        const maxPlayers = clampInteger(message.maxPlayers, 2, 8);
        if (maxPlayers === null) {
          return null;
        }
        return {
          type: "create-room",
          maxPlayers,
        };
      }
    case "join-room": {
      const roomCode = sanitizeRoomCode(message.roomCode);
      if (!roomCode) {
        return null;
      }
      return {
        type: "join-room",
        roomCode,
        displayName: sanitizeDisplayName(message.displayName),
      };
    }
    case "leave-room":
      return { type: "leave-room" };
    case "ready":
      if (typeof message.ready !== "boolean") {
        return null;
      }
      return {
        type: "ready",
        ready: message.ready,
      };
    case "start-match":
      return { type: "start-match" };
    case "input": {
      const sequence = clampInteger(message.sequence, 0, Number.MAX_SAFE_INTEGER);
      const thrustX = clampNumber(message.thrustX, -1, 1);
      const thrustY = clampNumber(message.thrustY, -1, 1);
      const yaw = clampNumber(message.yaw, -1, 1);
      if (sequence === null || thrustX === null || thrustY === null || yaw === null) {
        return null;
      }

      return {
        type: "input",
        sequence,
        thrustX,
        thrustY,
        yaw,
        firePrimary: Boolean(message.firePrimary),
        fireSecondary: Boolean(message.fireSecondary),
      };
    }
    case "ping": {
      const clientTime = clampNumber(message.clientTime, 0, Number.MAX_SAFE_INTEGER);
      if (clientTime === null) {
        return null;
      }
      return {
        type: "ping",
        clientTime,
      };
    }
    default:
      return null;
  }
}

export function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

export function sanitizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.slice(0, MAX_NAME_LENGTH);
}

export function sanitizeRoomCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length !== ROOM_CODE_LENGTH) {
    return null;
  }

  return normalized;
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: unknown, min: number, max: number): number | null {
  const clamped = clampNumber(value, min, max);
  if (clamped === null) {
    return null;
  }
  return Math.trunc(clamped);
}
