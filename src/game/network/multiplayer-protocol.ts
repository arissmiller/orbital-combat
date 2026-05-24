export interface RoomPlayerSnapshot {
  id: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface RoomMapSnapshot {
  id: string;
  name: string;
  description: string;
  celestialBodyCount: number;
}

export interface RoomSnapshot {
  code: string;
  status: "lobby" | "running";
  maxPlayers: number;
  hostPlayerId: string;
  players: RoomPlayerSnapshot[];
  map?: RoomMapSnapshot;
}

export interface PublicRoomSnapshot {
  code: string;
  status: "lobby" | "running";
  playerCount: number;
  maxPlayers: number;
  hostDisplayName: string;
  map?: RoomMapSnapshot;
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

export interface SimCelestialBodySnapshot {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  orbitEccentricity: number;
}

export interface SimulationSnapshot {
  roomCode: string;
  tick: number;
  sentAtMs: number;
  players: SimPlayerSnapshot[];
  mapId?: string;
  celestialBodies?: SimCelestialBodySnapshot[];
}

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
    }
  | {
      type: "list-rooms";
    };

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
      type: "room-list";
      rooms: PublicRoomSnapshot[];
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

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const message = raw as Record<string, unknown>;
  if (typeof message.type !== "string") {
    return null;
  }

  switch (message.type) {
    case "welcome":
      if (typeof message.playerId !== "string" || typeof message.serverTimeMs !== "number") {
        return null;
      }
      return {
        type: "welcome",
        playerId: message.playerId,
        serverTimeMs: message.serverTimeMs,
      };
    case "room-update": {
      const room = parseRoomSnapshot(message.room);
      if (!room) {
        return null;
      }
      return {
        type: "room-update",
        room,
      };
    }
    case "room-list": {
      if (!Array.isArray(message.rooms)) {
        return null;
      }
      const rooms: PublicRoomSnapshot[] = [];
      for (const room of message.rooms) {
        const parsedRoom = parsePublicRoomSnapshot(room);
        if (!parsedRoom) {
          return null;
        }
        rooms.push(parsedRoom);
      }
      return {
        type: "room-list",
        rooms,
      };
    }
    case "match-started":
      if (
        typeof message.roomCode !== "string"
        || typeof message.tick !== "number"
        || typeof message.serverTimeMs !== "number"
      ) {
        return null;
      }
      return {
        type: "match-started",
        roomCode: message.roomCode,
        tick: message.tick,
        serverTimeMs: message.serverTimeMs,
      };
    case "snapshot": {
      const snapshot = parseSimulationSnapshot(message.snapshot);
      if (!snapshot) {
        return null;
      }
      return {
        type: "snapshot",
        snapshot,
      };
    }
    case "pong":
      if (typeof message.clientTime !== "number" || typeof message.serverTimeMs !== "number") {
        return null;
      }
      return {
        type: "pong",
        clientTime: message.clientTime,
        serverTimeMs: message.serverTimeMs,
      };
    case "info":
      if (typeof message.message !== "string") {
        return null;
      }
      return {
        type: "info",
        message: message.message,
      };
    case "error":
      if (typeof message.code !== "string" || typeof message.message !== "string") {
        return null;
      }
      return {
        type: "error",
        code: message.code,
        message: message.message,
      };
    default:
      return null;
  }
}

function parseRoomSnapshot(raw: unknown): RoomSnapshot | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const room = raw as Record<string, unknown>;
  if (
    typeof room.code !== "string"
    || (room.status !== "lobby" && room.status !== "running")
    || typeof room.maxPlayers !== "number"
    || typeof room.hostPlayerId !== "string"
    || !Array.isArray(room.players)
  ) {
    return null;
  }

  const players: RoomPlayerSnapshot[] = [];
  for (const player of room.players) {
    if (typeof player !== "object" || player === null) {
      return null;
    }
    const snapshot = player as Record<string, unknown>;
    if (
      typeof snapshot.id !== "string"
      || typeof snapshot.displayName !== "string"
      || typeof snapshot.ready !== "boolean"
      || typeof snapshot.isHost !== "boolean"
      || typeof snapshot.connected !== "boolean"
    ) {
      return null;
    }
    players.push({
      id: snapshot.id,
      displayName: snapshot.displayName,
      ready: snapshot.ready,
      isHost: snapshot.isHost,
      connected: snapshot.connected,
    });
  }

  let map: RoomMapSnapshot | undefined;
  if (room.map !== undefined) {
    const parsedMap = parseRoomMapSnapshot(room.map);
    if (!parsedMap) {
      return null;
    }
    map = parsedMap;
  }

  return {
    code: room.code,
    status: room.status,
    maxPlayers: room.maxPlayers,
    hostPlayerId: room.hostPlayerId,
    players,
    map,
  };
}

function parsePublicRoomSnapshot(raw: unknown): PublicRoomSnapshot | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const room = raw as Record<string, unknown>;
  if (
    typeof room.code !== "string"
    || (room.status !== "lobby" && room.status !== "running")
    || typeof room.playerCount !== "number"
    || typeof room.maxPlayers !== "number"
    || typeof room.hostDisplayName !== "string"
  ) {
    return null;
  }

  let map: RoomMapSnapshot | undefined;
  if (room.map !== undefined) {
    const parsedMap = parseRoomMapSnapshot(room.map);
    if (!parsedMap) {
      return null;
    }
    map = parsedMap;
  }

  return {
    code: room.code,
    status: room.status,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
    hostDisplayName: room.hostDisplayName,
    map,
  };
}

function parseSimulationSnapshot(raw: unknown): SimulationSnapshot | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const snapshot = raw as Record<string, unknown>;
  if (
    typeof snapshot.roomCode !== "string"
    || typeof snapshot.tick !== "number"
    || typeof snapshot.sentAtMs !== "number"
    || !Array.isArray(snapshot.players)
  ) {
    return null;
  }

  const players: SimPlayerSnapshot[] = [];
  for (const player of snapshot.players) {
    if (typeof player !== "object" || player === null) {
      return null;
    }
    const playerSnapshot = player as Record<string, unknown>;
    if (
      typeof playerSnapshot.playerId !== "string"
      || typeof playerSnapshot.x !== "number"
      || typeof playerSnapshot.y !== "number"
      || typeof playerSnapshot.vx !== "number"
      || typeof playerSnapshot.vy !== "number"
      || typeof playerSnapshot.heading !== "number"
      || (typeof playerSnapshot.lastProcessedInputSequence !== "number"
        && playerSnapshot.lastProcessedInputSequence !== null)
    ) {
      return null;
    }

    players.push({
      playerId: playerSnapshot.playerId,
      x: playerSnapshot.x,
      y: playerSnapshot.y,
      vx: playerSnapshot.vx,
      vy: playerSnapshot.vy,
      heading: playerSnapshot.heading,
      lastProcessedInputSequence: playerSnapshot.lastProcessedInputSequence,
    });
  }

  let mapId: string | undefined;
  if (snapshot.mapId !== undefined) {
    if (typeof snapshot.mapId !== "string") {
      return null;
    }
    mapId = snapshot.mapId;
  }

  let celestialBodies: SimCelestialBodySnapshot[] | undefined;
  if (snapshot.celestialBodies !== undefined) {
    if (!Array.isArray(snapshot.celestialBodies)) {
      return null;
    }

    celestialBodies = [];
    for (const body of snapshot.celestialBodies) {
      const parsedBody = parseSimCelestialBodySnapshot(body);
      if (!parsedBody) {
        return null;
      }
      celestialBodies.push(parsedBody);
    }
  }

  return {
    roomCode: snapshot.roomCode,
    tick: snapshot.tick,
    sentAtMs: snapshot.sentAtMs,
    players,
    mapId,
    celestialBodies,
  };
}

function parseRoomMapSnapshot(raw: unknown): RoomMapSnapshot | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const snapshot = raw as Record<string, unknown>;
  if (
    typeof snapshot.id !== "string"
    || typeof snapshot.name !== "string"
    || typeof snapshot.description !== "string"
    || typeof snapshot.celestialBodyCount !== "number"
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    name: snapshot.name,
    description: snapshot.description,
    celestialBodyCount: snapshot.celestialBodyCount,
  };
}

function parseSimCelestialBodySnapshot(raw: unknown): SimCelestialBodySnapshot | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const snapshot = raw as Record<string, unknown>;
  if (
    typeof snapshot.id !== "string"
    || typeof snapshot.name !== "string"
    || (typeof snapshot.parentId !== "string" && snapshot.parentId !== null)
    || typeof snapshot.x !== "number"
    || typeof snapshot.y !== "number"
    || typeof snapshot.vx !== "number"
    || typeof snapshot.vy !== "number"
    || typeof snapshot.mass !== "number"
    || typeof snapshot.radius !== "number"
    || typeof snapshot.orbitEccentricity !== "number"
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    name: snapshot.name,
    parentId: snapshot.parentId,
    x: snapshot.x,
    y: snapshot.y,
    vx: snapshot.vx,
    vy: snapshot.vy,
    mass: snapshot.mass,
    radius: snapshot.radius,
    orbitEccentricity: snapshot.orbitEccentricity,
  };
}
