import { WebSocket } from "ws";
import type { RawData } from "ws";
import {
  buildRoomMapSnapshot,
  getDefaultMultiplayerMapDefinition,
  type MultiplayerMapDefinition,
} from "./map.js";
import {
  DEFAULT_MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  SERVER_TICK_RATE,
  type ClientMessage,
  type PlayerInputCommand,
  type PublicRoomSnapshot,
  type RoomSnapshot,
  type ServerMessage,
  type RoomPlayerSnapshot,
} from "./protocol.js";
import {
  addPlayerToSimulation,
  buildSimulationSnapshot,
  createRoomSimulation,
  removePlayerFromSimulation,
  stepRoomSimulation,
  type RoomSimulationState,
} from "./simulation.js";

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_ACTIVE_ROOMS = 4;

interface ConnectedClient {
  id: string;
  socket: WebSocket;
  displayName: string;
  roomCode: string | null;
  ready: boolean;
  lastInput: PlayerInputCommand | null;
  connected: boolean;
}

interface RoomState {
  code: string;
  status: "lobby" | "running";
  maxPlayers: number;
  hostPlayerId: string;
  playerIds: string[];
  mapDefinition: MultiplayerMapDefinition;
  simulation: RoomSimulationState | null;
  persistent: boolean;
}

export class RoomManager {
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly rooms = new Map<string, RoomState>();
  private nextClientId = 1;

  public initPersistentRooms(): void {
    const configs = [{ code: "FFA-01" }, { code: "FFA-02" }];
    for (const config of configs) {
      const mapDefinition = getDefaultMultiplayerMapDefinition();
      const simulation = createRoomSimulation(config.code, [], mapDefinition);
      const room: RoomState = {
        code: config.code,
        status: "running",
        maxPlayers: 4,
        hostPlayerId: "server",
        playerIds: [],
        mapDefinition,
        simulation,
        persistent: true,
      };
      this.rooms.set(config.code, room);
      console.log(`[room-manager] persistent room ${config.code} ready`);
    }
  }

  public registerClient(socket: WebSocket): ConnectedClient {
    const clientId = `p${this.nextClientId}`;
    this.nextClientId += 1;

    const client: ConnectedClient = {
      id: clientId,
      socket,
      displayName: `Pilot ${clientId.toUpperCase()}`,
      roomCode: null,
      ready: false,
      lastInput: null,
      connected: true,
    };

    this.clients.set(clientId, client);
    this.broadcastRoomDirectory();
    return client;
  }

  public unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    client.connected = false;
    this.leaveRoom(client, "Player disconnected.");
    this.clients.delete(clientId);
    this.broadcastRoomDirectory();
  }

  public handleMessage(clientId: string, message: ClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    switch (message.type) {
      case "hello":
        if (message.displayName) {
          client.displayName = message.displayName;
          this.broadcastRoomUpdate(client.roomCode);
          this.broadcastRoomDirectory();
        }
        return;
      case "create-room":
        this.leaveRoom(client);
        this.createRoomForClient(client, message.maxPlayers ?? DEFAULT_MAX_PLAYERS);
        return;
      case "join-room":
        if (message.displayName) {
          client.displayName = message.displayName;
        }
        this.joinRoom(client, message.roomCode);
        return;
      case "leave-room":
        this.leaveRoom(client, "You left the room.");
        return;
      case "ready":
        this.setReadyState(client, message.ready);
        return;
      case "start-match":
        this.startMatch(client);
        return;
      case "input":
        this.recordPlayerInput(client, message);
        return;
      case "ping":
        this.send(client, {
          type: "pong",
          clientTime: message.clientTime,
          serverTimeMs: Date.now(),
        });
        return;
      case "list-rooms":
        this.sendRoomDirectory(client);
        return;
      default:
        return;
    }
  }

  public tick(): void {
    const stepSeconds = 1 / SERVER_TICK_RATE;
    for (const room of this.rooms.values()) {
      if (room.status !== "running" || !room.simulation) {
        continue;
      }

      const inputByPlayerId = new Map<string, PlayerInputCommand | null>();
      for (const playerId of room.playerIds) {
        const client = this.clients.get(playerId);
        inputByPlayerId.set(playerId, client?.lastInput ?? null);
      }

      stepRoomSimulation(room.simulation, inputByPlayerId, stepSeconds);
      const snapshot = buildSimulationSnapshot(room.simulation, inputByPlayerId);
      this.broadcast(room, {
        type: "snapshot",
        snapshot,
      });
    }
  }

  public static decodePayload(rawData: RawData): string | null {
    if (typeof rawData === "string") {
      return rawData;
    }

    if (rawData instanceof ArrayBuffer) {
      return Buffer.from(rawData).toString("utf8");
    }

    if (Array.isArray(rawData)) {
      return Buffer.concat(rawData).toString("utf8");
    }

    if (Buffer.isBuffer(rawData)) {
      return rawData.toString("utf8");
    }

    return null;
  }

  private createRoomForClient(client: ConnectedClient, maxPlayers: number): void {
    const userRoomCount = [...this.rooms.values()].filter((r) => !r.persistent).length;
    if (userRoomCount >= MAX_ACTIVE_ROOMS) {
      this.sendError(
        client,
        "room-limit-reached",
        `Server room cap reached (${MAX_ACTIVE_ROOMS}). Try joining an existing room.`,
      );
      this.sendRoomDirectory(client);
      return;
    }

    const mapDefinition = getDefaultMultiplayerMapDefinition();
    const roomCode = this.generateRoomCode();
    const clampedMaxPlayers = clampInteger(maxPlayers, 2, 8);
    const room: RoomState = {
      code: roomCode,
      status: "lobby",
      maxPlayers: clampedMaxPlayers,
      hostPlayerId: client.id,
      playerIds: [client.id],
      mapDefinition,
      simulation: null,
      persistent: false,
    };

    client.roomCode = roomCode;
    client.ready = false;
    client.lastInput = null;
    this.rooms.set(roomCode, room);

    this.send(client, {
      type: "info",
      message:
        `Room ${roomCode} created on map ${mapDefinition.name}.`
        + ` (${userRoomCount + 1}/${MAX_ACTIVE_ROOMS} active rooms)`,
    });
    this.broadcastRoomUpdate(roomCode);
    this.broadcastRoomDirectory();
  }

  private joinRoom(client: ConnectedClient, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendError(client, "room-not-found", `Room ${roomCode} does not exist.`);
      return;
    }
    if (room.playerIds.length >= room.maxPlayers) {
      this.sendError(client, "room-full", "That room is full.");
      return;
    }

    this.leaveRoom(client);
    room.playerIds.push(client.id);
    client.roomCode = room.code;
    client.ready = false;
    client.lastInput = null;

    if (room.status === "running") {
      if (!room.simulation) {
        this.sendError(
          client,
          "match-unavailable",
          "This room is currently unavailable. Try again in a moment.",
        );
        room.playerIds = room.playerIds.filter((playerId) => playerId !== client.id);
        client.roomCode = null;
        this.broadcastRoomDirectory();
        return;
      }

      const added = addPlayerToSimulation(room.simulation, client.id);
      if (!added) {
        this.sendError(
          client,
          "match-join-failed",
          "Failed to add you to the active match. Try again.",
        );
        room.playerIds = room.playerIds.filter((playerId) => playerId !== client.id);
        client.roomCode = null;
        this.broadcastRoomDirectory();
        return;
      }

      this.send(client, {
        type: "match-started",
        roomCode: room.code,
        tick: room.simulation.tick,
        serverTimeMs: Date.now(),
      });
      this.send(client, {
        type: "snapshot",
        snapshot: buildSimulationSnapshot(room.simulation, new Map()),
      });
    }

    this.broadcast(room, {
      type: "info",
      message:
        room.status === "running"
          ? `${client.displayName} dropped into room ${room.code}.`
          : `${client.displayName} joined room ${room.code}.`,
    });
    this.broadcastRoomUpdate(room.code);
    this.broadcastRoomDirectory();
  }

  private leaveRoom(client: ConnectedClient, infoMessage?: string): void {
    const roomCode = client.roomCode;
    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);
    client.roomCode = null;
    client.ready = false;
    client.lastInput = null;

    if (!room) {
      return;
    }

    room.playerIds = room.playerIds.filter((playerId) => playerId !== client.id);
    if (room.simulation) {
      removePlayerFromSimulation(room.simulation, client.id);
    }

    if (room.playerIds.length === 0) {
      if (!room.persistent) {
        this.rooms.delete(room.code);
      } else {
        room.hostPlayerId = "server";
      }
      this.broadcastRoomDirectory();
      return;
    }

    if (room.hostPlayerId === client.id) {
      room.hostPlayerId = room.playerIds[0] ?? room.hostPlayerId;
    }

    if (room.status !== "running" && infoMessage) {
      this.send(client, { type: "info", message: infoMessage });
    }

    this.broadcast(room, {
      type: "info",
      message: `${client.displayName} left room ${room.code}.`,
    });
    this.broadcastRoomUpdate(room.code);
    this.broadcastRoomDirectory();
  }

  private setReadyState(client: ConnectedClient, ready: boolean): void {
    const room = this.getClientRoom(client);
    if (!room) {
      this.sendError(client, "not-in-room", "Join a room before toggling ready state.");
      return;
    }
    if (room.status !== "lobby") {
      this.sendError(client, "match-running", "Cannot change ready state during a match.");
      return;
    }
    client.ready = ready;
    this.broadcastRoomUpdate(room.code);
  }

  private startMatch(client: ConnectedClient): void {
    const room = this.getClientRoom(client);
    if (!room) {
      this.sendError(client, "not-in-room", "Join a room before starting a match.");
      return;
    }
    if (room.hostPlayerId !== client.id) {
      this.sendError(client, "not-host", "Only the host can start the match.");
      return;
    }
    if (room.status !== "lobby") {
      this.sendError(client, "already-running", "Match is already running.");
      return;
    }
    if (room.playerIds.length < 1) {
      this.sendError(client, "not-enough-players", "At least 1 player is required.");
      return;
    }

    if (room.playerIds.length > 1) {
      const missingReady = room.playerIds.some((playerId) => {
        const roomClient = this.clients.get(playerId);
        return roomClient ? !roomClient.ready : true;
      });
      if (missingReady) {
        this.sendError(client, "players-not-ready", "All players must be ready first.");
        return;
      }
    }

    room.status = "running";
    room.simulation = createRoomSimulation(
      room.code,
      room.playerIds,
      room.mapDefinition,
    );
    for (const playerId of room.playerIds) {
      const roomClient = this.clients.get(playerId);
      if (roomClient) {
        roomClient.lastInput = null;
      }
    }

    this.broadcast(room, {
      type: "match-started",
      roomCode: room.code,
      tick: room.simulation.tick,
      serverTimeMs: Date.now(),
    });
    this.broadcastRoomUpdate(room.code);
    this.broadcastRoomDirectory();
  }

  private recordPlayerInput(client: ConnectedClient, input: PlayerInputCommand): void {
    const room = this.getClientRoom(client);
    if (!room || room.status !== "running") {
      return;
    }
    if (client.lastInput && input.sequence <= client.lastInput.sequence) {
      return;
    }
    client.lastInput = input;
  }

  private getClientRoom(client: ConnectedClient): RoomState | null {
    if (!client.roomCode) {
      return null;
    }
    return this.rooms.get(client.roomCode) ?? null;
  }

  private broadcastRoomUpdate(roomCode: string | null): void {
    if (!roomCode) {
      return;
    }
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }
    this.broadcast(room, {
      type: "room-update",
      room: this.buildRoomSnapshot(room),
    });
  }

  private buildRoomSnapshot(room: RoomState): RoomSnapshot {
    const players: RoomPlayerSnapshot[] = room.playerIds.map((playerId) => {
      const client = this.clients.get(playerId);
      return {
        id: playerId,
        displayName: client?.displayName ?? "Disconnected",
        ready: client?.ready ?? false,
        isHost: playerId === room.hostPlayerId,
        connected: client?.connected ?? false,
      };
    });

    return {
      code: room.code,
      status: room.status,
      maxPlayers: room.maxPlayers,
      hostPlayerId: room.hostPlayerId,
      players,
      map: buildRoomMapSnapshot(room.mapDefinition),
    };
  }

  private broadcast(room: RoomState, message: ServerMessage): void {
    for (const playerId of room.playerIds) {
      const client = this.clients.get(playerId);
      if (!client) {
        continue;
      }
      this.send(client, message);
    }
  }

  private send(client: ConnectedClient, message: ServerMessage): void {
    if (client.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    client.socket.send(JSON.stringify(message));
  }

  private sendError(client: ConnectedClient, code: string, message: string): void {
    this.send(client, {
      type: "error",
      code,
      message,
    });
  }

  private broadcastRoomDirectory(): void {
    for (const client of this.clients.values()) {
      this.sendRoomDirectory(client);
    }
  }

  private sendRoomDirectory(client: ConnectedClient): void {
    this.send(client, {
      type: "room-list",
      rooms: this.buildPublicRoomSnapshots(),
    });
  }

  private buildPublicRoomSnapshots(): PublicRoomSnapshot[] {
    const rooms: PublicRoomSnapshot[] = [];
    for (const room of this.rooms.values()) {
      if (room.playerIds.length >= room.maxPlayers) {
        continue;
      }
      const host = this.clients.get(room.hostPlayerId);
      rooms.push({
        code: room.code,
        status: room.status,
        playerCount: room.playerIds.length,
        maxPlayers: room.maxPlayers,
        hostDisplayName: host?.displayName ?? (room.persistent ? "Server" : "Host"),
        map: buildRoomMapSnapshot(room.mapDefinition),
      });
    }

    rooms.sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "lobby" ? -1 : 1;
      }
      if (left.playerCount !== right.playerCount) {
        return right.playerCount - left.playerCount;
      }
      return left.code.localeCompare(right.code);
    });
    return rooms;
  }

  private generateRoomCode(): string {
    let attempts = 0;
    while (attempts < 1000) {
      attempts += 1;
      let code = "";
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
        code += ROOM_CODE_ALPHABET[randomIndex] ?? "X";
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }

    throw new Error("Failed to generate unique room code.");
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(Math.max(min, Math.min(max, value)));
}
