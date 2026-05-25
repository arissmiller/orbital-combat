import type {
  RoomMapSnapshot,
  SimCelestialBodySnapshot,
} from "./multiplayer-map.js";

const MAX_NAME_LENGTH = 24;

export const DEFAULT_MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 6;
export type ShipSubsystemKey = "engines" | "scanners" | "weapons" | "defenses";
export type PlayerWeaponMode = "disintegrator" | "disruptor";

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
      progradeInput: boolean;
      retrogradeInput: boolean;
      leftInput: boolean;
      rightInput: boolean;
      eBrakeInput: boolean;
      gravityDiveInput: boolean;
      boostInput: boolean;
      firePrimary: boolean;
      fireSecondary: boolean;
      focusSubsystem?: ShipSubsystemKey;
      weaponArmed?: boolean;
      weaponMode?: PlayerWeaponMode;
    }
  | {
      type: "ping";
      clientTime: number;
    }
  | {
      type: "list-rooms";
    };

export interface RoomPlayerSnapshot {
  id: string;
  displayName: string;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
}

export type { RoomMapSnapshot } from "./multiplayer-map.js";

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

export interface SimPlayerWarning {
  id: string;
  title: string;
  message: string;
  accentColor: string;
  priority: number;
}

export interface SimPlayerSnapshot {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  lastProcessedInputSequence: number | null;
  throttle?: number;
  thrustHeading?: number | null;
  superBurnActive?: boolean;
  systems?: SimPlayerSystemsSnapshot;
  life?: SimPlayerLifeSnapshot;
  scanner?: SimPlayerScannerSnapshot;
  warnings?: SimPlayerWarning[];
  weaponArmed?: boolean;
  weaponMode?: PlayerWeaponMode;
  weaponFiring?: boolean;
}

export interface SimPlayerSubsystemSnapshot {
  charge: number;
  maxCharge: number;
}

export interface SimPlayerSystemsSnapshot {
  boosted: ShipSubsystemKey;
  engines: SimPlayerSubsystemSnapshot;
  scanners: SimPlayerSubsystemSnapshot;
  weapons: SimPlayerSubsystemSnapshot;
  defenses: SimPlayerSubsystemSnapshot;
}

export interface SimPlayerLifeSnapshot {
  alive: boolean;
  respawnTimerSeconds: number;
  respawnGraceSeconds: number;
  deaths: number;
  health: number;
  maxHealth: number;
}

export interface SimPlayerScannerContactSnapshot {
  targetPlayerId: string;
  distance: number;
  inRange: boolean;
  visible: boolean;
  occludedByCelestialId: string | null;
  lockProgress: number;
  registered: boolean;
}

export interface SimPlayerScannerSnapshot {
  range: number;
  contacts: SimPlayerScannerContactSnapshot[];
}

export type { SimCelestialBodySnapshot } from "./multiplayer-map.js";

export interface SimulationSnapshot {
  roomCode: string;
  tick: number;
  sentAtMs: number;
  players: SimPlayerSnapshot[];
  mapId?: string;
  celestialBodies?: SimCelestialBodySnapshot[];
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

export interface PlayerInputCommand {
  sequence: number;
  progradeInput: boolean;
  retrogradeInput: boolean;
  leftInput: boolean;
  rightInput: boolean;
  eBrakeInput: boolean;
  gravityDiveInput: boolean;
  boostInput: boolean;
  firePrimary: boolean;
  fireSecondary: boolean;
  focusSubsystem?: ShipSubsystemKey;
  weaponArmed?: boolean;
  weaponMode?: PlayerWeaponMode;
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
      if (sequence === null) {
        return null;
      }

      const focusSubsystem = parseShipSubsystemKey(message.focusSubsystem);
      if (message.focusSubsystem !== undefined && focusSubsystem === null) {
        return null;
      }
      const weaponMode = parsePlayerWeaponMode(message.weaponMode);
      if (message.weaponMode !== undefined && weaponMode === null) {
        return null;
      }
      const weaponArmed = parseOptionalBoolean(message.weaponArmed);
      if (message.weaponArmed !== undefined && weaponArmed === undefined) {
        return null;
      }

      return {
        type: "input",
        sequence,
        progradeInput: parseBoolean(message.progradeInput),
        retrogradeInput: parseBoolean(message.retrogradeInput),
        leftInput: parseBoolean(message.leftInput),
        rightInput: parseBoolean(message.rightInput),
        eBrakeInput: parseBoolean(message.eBrakeInput),
        gravityDiveInput: parseBoolean(message.gravityDiveInput),
        boostInput: parseBoolean(message.boostInput),
        firePrimary: parseBoolean(message.firePrimary),
        fireSecondary: parseBoolean(message.fireSecondary),
        focusSubsystem: focusSubsystem ?? undefined,
        weaponArmed,
        weaponMode: weaponMode ?? undefined,
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
    case "list-rooms":
      return { type: "list-rooms" };
    default:
      return null;
  }
}

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
      throttle: parseOptionalNumber(playerSnapshot.throttle),
      thrustHeading: parseOptionalNullableNumber(playerSnapshot.thrustHeading),
      superBurnActive: parseOptionalBoolean(playerSnapshot.superBurnActive),
      systems: parseOptionalSimPlayerSystemsSnapshot(playerSnapshot.systems),
      life: parseOptionalSimPlayerLifeSnapshot(playerSnapshot.life),
      scanner: parseOptionalSimPlayerScannerSnapshot(playerSnapshot.scanner),
      warnings: parseOptionalSimPlayerWarnings(playerSnapshot.warnings),
      weaponArmed: parseOptionalBoolean(playerSnapshot.weaponArmed),
      weaponMode: parseOptionalPlayerWeaponMode(playerSnapshot.weaponMode),
      weaponFiring: parseOptionalBoolean(playerSnapshot.weaponFiring),
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

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? value : undefined;
}

function parseOptionalNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === "number") {
    return value;
  }
  return undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : undefined;
}

function parseOptionalPlayerWeaponMode(
  value: unknown,
): PlayerWeaponMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parsePlayerWeaponMode(value) ?? undefined;
}

function parseOptionalSimPlayerSystemsSnapshot(
  value: unknown,
): SimPlayerSystemsSnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const systems = value as Record<string, unknown>;
  const boosted = parseShipSubsystemKey(systems.boosted);
  const engines = parseSimPlayerSubsystemSnapshot(systems.engines);
  const scanners = parseSimPlayerSubsystemSnapshot(systems.scanners);
  const weapons = parseSimPlayerSubsystemSnapshot(systems.weapons);
  const defenses = parseSimPlayerSubsystemSnapshot(systems.defenses);

  if (!boosted || !engines || !scanners || !weapons || !defenses) {
    return undefined;
  }

  return {
    boosted,
    engines,
    scanners,
    weapons,
    defenses,
  };
}

function parseOptionalSimPlayerWarnings(
  value: unknown,
): SimPlayerWarning[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const warnings: SimPlayerWarning[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const w = item as Record<string, unknown>;
    if (
      typeof w.id === "string"
      && typeof w.title === "string"
      && typeof w.message === "string"
      && typeof w.accentColor === "string"
      && typeof w.priority === "number"
    ) {
      warnings.push({
        id: w.id,
        title: w.title,
        message: w.message,
        accentColor: w.accentColor,
        priority: w.priority,
      });
    }
  }
  return warnings;
}

function parseOptionalSimPlayerScannerSnapshot(
  value: unknown,
): SimPlayerScannerSnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const scanner = value as Record<string, unknown>;
  if (typeof scanner.range !== "number" || !Array.isArray(scanner.contacts)) {
    return undefined;
  }

  const contacts: SimPlayerScannerContactSnapshot[] = [];
  for (const rawContact of scanner.contacts) {
    const contact = parseSimPlayerScannerContactSnapshot(rawContact);
    if (!contact) {
      continue;
    }
    contacts.push(contact);
  }

  return {
    range: scanner.range,
    contacts,
  };
}

function parseSimPlayerScannerContactSnapshot(
  value: unknown,
): SimPlayerScannerContactSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const contact = value as Record<string, unknown>;
  if (
    typeof contact.targetPlayerId !== "string"
    || typeof contact.distance !== "number"
    || typeof contact.inRange !== "boolean"
    || typeof contact.visible !== "boolean"
    || typeof contact.lockProgress !== "number"
    || typeof contact.registered !== "boolean"
    || (contact.occludedByCelestialId !== null
      && typeof contact.occludedByCelestialId !== "string")
  ) {
    return null;
  }

  return {
    targetPlayerId: contact.targetPlayerId,
    distance: contact.distance,
    inRange: contact.inRange,
    visible: contact.visible,
    occludedByCelestialId: contact.occludedByCelestialId,
    lockProgress: contact.lockProgress,
    registered: contact.registered,
  };
}

function parseOptionalSimPlayerLifeSnapshot(
  value: unknown,
): SimPlayerLifeSnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const life = value as Record<string, unknown>;
  if (
    typeof life.alive !== "boolean"
    || typeof life.respawnTimerSeconds !== "number"
    || typeof life.respawnGraceSeconds !== "number"
    || typeof life.deaths !== "number"
    || typeof life.health !== "number"
    || typeof life.maxHealth !== "number"
  ) {
    return undefined;
  }

  return {
    alive: life.alive,
    respawnTimerSeconds: life.respawnTimerSeconds,
    respawnGraceSeconds: life.respawnGraceSeconds,
    deaths: life.deaths,
    health: life.health,
    maxHealth: life.maxHealth,
  };
}

function parseSimPlayerSubsystemSnapshot(
  value: unknown,
): SimPlayerSubsystemSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const subsystem = value as Record<string, unknown>;
  if (typeof subsystem.charge !== "number" || typeof subsystem.maxCharge !== "number") {
    return null;
  }
  return {
    charge: subsystem.charge,
    maxCharge: subsystem.maxCharge,
  };
}

function parseShipSubsystemKey(value: unknown): ShipSubsystemKey | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value === "engines" || value === "scanners" || value === "weapons" || value === "defenses") {
    return value;
  }
  return null;
}

function parsePlayerWeaponMode(value: unknown): PlayerWeaponMode | null {
  if (value === "disintegrator" || value === "disruptor") {
    return value;
  }
  return null;
}

function parseBoolean(value: unknown): boolean {
  return value === true;
}
