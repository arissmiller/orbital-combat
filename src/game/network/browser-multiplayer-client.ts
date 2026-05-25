import {
  parseServerMessage,
  type ClientMessage,
  type PublicRoomSnapshot,
  type RoomSnapshot,
  type SimulationSnapshot,
} from "./multiplayer-protocol";

const DEFAULT_DISPLAY_NAME = "Pilot";

export interface MultiplayerClientState {
  connectionStatus: "disconnected" | "connecting" | "connected";
  serverUrl: string;
  playerId: string | null;
  displayName: string;
  room: RoomSnapshot | null;
  availableRooms: PublicRoomSnapshot[];
  latestSnapshot: SimulationSnapshot | null;
  latestInfoMessage: string | null;
  latestErrorMessage: string | null;
  estimatedLatencyMs: number | null;
}

interface MultiplayerClientOptions {
  serverUrl: string;
  displayName?: string;
}

export interface MultiplayerInputCommand {
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
  focusSubsystem?: "engines" | "scanners" | "weapons" | "defenses";
}

export class BrowserMultiplayerClient {
  private socket: WebSocket | null = null;
  private state: MultiplayerClientState;
  private readonly listeners = new Set<() => void>();

  public constructor(options: MultiplayerClientOptions) {
    this.state = {
      connectionStatus: "disconnected",
      serverUrl: options.serverUrl,
      playerId: null,
      displayName: sanitizeDisplayName(options.displayName),
      room: null,
      availableRooms: [],
      latestSnapshot: null,
      latestInfoMessage: null,
      latestErrorMessage: null,
      estimatedLatencyMs: null,
    };
  }

  public getState(): MultiplayerClientState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setDisplayName(displayName: string): void {
    const sanitized = sanitizeDisplayName(displayName);
    this.setState({
      displayName: sanitized,
    });
    if (this.state.connectionStatus === "connected") {
      this.send({
        type: "hello",
        displayName: sanitized,
      });
    }
  }

  public setServerUrl(serverUrl: string): void {
    this.setState({
      serverUrl: sanitizeServerUrl(serverUrl),
    });
  }

  public connect(): void {
    if (
      this.state.connectionStatus === "connecting"
      || this.state.connectionStatus === "connected"
    ) {
      return;
    }

    this.setState({
      connectionStatus: "connecting",
      latestErrorMessage: null,
      latestInfoMessage: null,
      playerId: null,
      room: null,
      availableRooms: [],
      latestSnapshot: null,
      estimatedLatencyMs: null,
    });

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.state.serverUrl);
    } catch {
      this.setState({
        connectionStatus: "disconnected",
        latestErrorMessage: "Invalid WebSocket URL. Use ws:// or wss://.",
      });
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.setState({
        connectionStatus: "connected",
      });
      this.send({
        type: "hello",
        displayName: this.state.displayName,
      });
      this.requestRoomList();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") {
        return;
      }

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch {
        this.setState({
          latestErrorMessage: "Received invalid JSON from server.",
        });
        return;
      }

      const message = parseServerMessage(parsed);
      if (!message) {
        this.setState({
          latestErrorMessage: "Received unknown server message.",
        });
        return;
      }

      switch (message.type) {
        case "welcome":
          this.setState({
            playerId: message.playerId,
            latestInfoMessage: `Connected as ${message.playerId}.`,
          });
          return;
        case "room-update":
          this.setState({
            room: message.room,
            latestErrorMessage: null,
          });
          return;
        case "room-list":
          this.setState({
            availableRooms: message.rooms,
          });
          return;
        case "match-started":
          this.setState({
            latestInfoMessage:
              `Match started in room ${message.roomCode} at tick ${message.tick}.`,
            latestErrorMessage: null,
          });
          return;
        case "snapshot":
          this.setState({
            latestSnapshot: message.snapshot,
            latestErrorMessage: null,
          });
          return;
        case "pong":
          this.setState({
            estimatedLatencyMs: Math.max(0, Date.now() - message.clientTime),
            latestErrorMessage: null,
          });
          return;
        case "info":
          this.setState({
            latestInfoMessage: message.message,
            latestErrorMessage: null,
          });
          return;
        case "error":
          this.setState({
            latestErrorMessage: `${message.code}: ${message.message}`,
          });
          return;
        default:
          return;
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.setState({
        connectionStatus: "disconnected",
        playerId: null,
        room: null,
        availableRooms: [],
        latestSnapshot: null,
      });
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }
      this.setState({
        latestErrorMessage: "Connection error. Confirm server URL and availability.",
      });
    });
  }

  public disconnect(reason = "Disconnected from server."): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setState({
      connectionStatus: "disconnected",
      playerId: null,
      room: null,
      availableRooms: [],
      latestSnapshot: null,
      latestInfoMessage: reason,
    });
  }

  public createRoom(maxPlayers?: number): void {
    this.send({
      type: "create-room",
      maxPlayers,
    });
  }

  public joinRoom(roomCode: string): void {
    this.send({
      type: "join-room",
      roomCode: roomCode.trim().toUpperCase(),
      displayName: this.state.displayName,
    });
  }

  public leaveRoom(): void {
    const wasConnected = this.socket?.readyState === WebSocket.OPEN;
    this.send({
      type: "leave-room",
    });
    this.setState({
      room: null,
      latestSnapshot: null,
      latestErrorMessage: null,
      latestInfoMessage: "Left room.",
    });
    if (wasConnected) {
      this.requestRoomList();
    }
  }

  public setReady(ready: boolean): void {
    this.send({
      type: "ready",
      ready,
    });
  }

  public startMatch(): void {
    this.send({
      type: "start-match",
    });
  }

  public sendInput(command: MultiplayerInputCommand): void {
    this.send({
      type: "input",
      sequence: command.sequence,
      progradeInput: command.progradeInput,
      retrogradeInput: command.retrogradeInput,
      leftInput: command.leftInput,
      rightInput: command.rightInput,
      eBrakeInput: command.eBrakeInput,
      gravityDiveInput: command.gravityDiveInput,
      boostInput: command.boostInput,
      firePrimary: command.firePrimary,
      fireSecondary: command.fireSecondary,
      focusSubsystem: command.focusSubsystem,
    });
  }

  public ping(): void {
    this.send({
      type: "ping",
      clientTime: Date.now(),
    });
  }

  public requestRoomList(): void {
    this.send({
      type: "list-rooms",
    });
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.setState({
        latestErrorMessage: "Not connected to multiplayer server.",
      });
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private setState(patch: Partial<MultiplayerClientState>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createDefaultMultiplayerServerUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_WS_URL;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return sanitizeServerUrl(configured);
  }

  if (typeof window === "undefined") {
    return "ws://127.0.0.1:8787/ws";
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = window.location.hostname || "127.0.0.1";
  if (isLocalhostHostname(hostname)) {
    return `${protocol}://${hostname}:8787/ws`;
  }

  const host = window.location.host || hostname;
  return `${protocol}://${host}/ws`;
}

function sanitizeDisplayName(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim() ?? "";
  if (trimmed.length === 0) {
    return DEFAULT_DISPLAY_NAME;
  }
  return trimmed.slice(0, 24);
}

function sanitizeServerUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return "ws://127.0.0.1:8787/ws";
  }
  return trimmed;
}

function isLocalhostHostname(hostname: string): boolean {
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "::1"
  );
}
