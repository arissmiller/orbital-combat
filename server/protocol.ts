export const SERVER_TICK_RATE = 20;

export {
  DEFAULT_MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  parseClientMessage,
  parseServerMessage,
  safeJsonParse,
  sanitizeDisplayName,
  sanitizeRoomCode,
  type ClientMessage,
  type PlayerInputCommand,
  type PublicRoomSnapshot,
  type RoomMapSnapshot,
  type RoomPlayerSnapshot,
  type RoomSnapshot,
  type ServerMessage,
  type SimCelestialBodySnapshot,
  type SimPlayerLifeSnapshot,
  type SimPlayerSnapshot,
  type SimPlayerWarning,
  type SimulationSnapshot,
} from "../shared/multiplayer-protocol.js";
