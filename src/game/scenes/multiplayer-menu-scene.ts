import {
  resetGameMenuState,
  setGameMenuState,
  type MenuActionState,
  type MenuCardState,
} from "../../ui/game-menu-store";
import {
  BrowserMultiplayerClient,
  createDefaultMultiplayerServerUrl,
  type MultiplayerClientState,
} from "../network/browser-multiplayer-client";
import type { SceneContext, SceneHandle } from "./scene-manager";

const MULTIPLAYER_NAME_KEY = "orbital-combat.multiplayer.display-name";
const MULTIPLAYER_SERVER_URL_KEY = "orbital-combat.multiplayer.server-url";

export function mountMultiplayerMenuScene(context: SceneContext): SceneHandle {
  const client = new BrowserMultiplayerClient({
    serverUrl:
      readStoredValue(MULTIPLAYER_SERVER_URL_KEY)
      ?? createDefaultMultiplayerServerUrl(),
    displayName: readStoredValue(MULTIPLAYER_NAME_KEY) ?? "Pilot",
  });

  const promptDisplayName = (): void => {
    if (typeof window === "undefined") {
      return;
    }
    const currentName = client.getState().displayName;
    const nextName = window.prompt("Display name", currentName);
    if (nextName === null) {
      return;
    }
    const sanitized = nextName.trim();
    if (sanitized.length === 0) {
      return;
    }
    client.setDisplayName(sanitized);
    writeStoredValue(MULTIPLAYER_NAME_KEY, sanitized);
  };

  const promptServerUrl = (): void => {
    if (typeof window === "undefined") {
      return;
    }
    const currentUrl = client.getState().serverUrl;
    const nextUrl = window.prompt("WebSocket server URL", currentUrl);
    if (nextUrl === null) {
      return;
    }
    const sanitized = nextUrl.trim();
    if (sanitized.length === 0) {
      return;
    }
    client.setServerUrl(sanitized);
    writeStoredValue(MULTIPLAYER_SERVER_URL_KEY, sanitized);
  };

  const promptJoinRoom = (): void => {
    if (typeof window === "undefined") {
      return;
    }
    const roomCode = window.prompt("Room code (6 characters)", "");
    if (roomCode === null) {
      return;
    }
    const normalized = roomCode.trim().toUpperCase();
    if (normalized.length !== 6) {
      return;
    }
    client.joinRoom(normalized);
  };

  const promptCreateRoom = (): void => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.prompt("Max players (2-8). Leave blank for 4.", "4");
    if (raw === null) {
      return;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      client.createRoom();
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.max(2, Math.min(8, parsed));
    client.createRoom(clamped);
  };

  const syncMenu = (): void => {
    const state = client.getState();
    const lobbyBrowserMode =
      state.connectionStatus === "connected" && !state.room;
    setGameMenuState({
      visible: true,
      title: "Multiplayer",
      subtitle: buildSubtitle(state),
      description: buildDescription(state),
      accentColor: "#ffb07f",
      layout: lobbyBrowserMode ? "cards" : "stack",
      actions: buildActions(
        state,
        client,
        promptDisplayName,
        promptServerUrl,
        promptCreateRoom,
        promptJoinRoom,
      ),
      cards: buildCards(state, client, promptCreateRoom, promptJoinRoom),
      footerActions: [
        {
          label: "Back",
          accentColor: "#8ee8ff",
          onSelect: () => context.load("main-menu"),
        },
      ],
    });
  };

  const unsubscribe = client.subscribe(syncMenu);
  syncMenu();

  return {
    dispose() {
      unsubscribe();
      client.disconnect("Left multiplayer menu.");
      resetGameMenuState();
    },
  };
}

function buildActions(
  state: MultiplayerClientState,
  client: BrowserMultiplayerClient,
  promptDisplayName: () => void,
  promptServerUrl: () => void,
  promptCreateRoom: () => void,
  promptJoinRoom: () => void,
): MenuActionState[] {
  const room = state.room;
  const self = room?.players.find((player) => player.id === state.playerId) ?? null;
  const selfIsHost = Boolean(self?.isHost);

  if (state.connectionStatus === "disconnected") {
    return [
      {
        label: "Connect",
        accentColor: "#ffb07f",
        onSelect: () => client.connect(),
      },
      {
        label: "Set Display Name",
        accentColor: "#8ee8ff",
        onSelect: promptDisplayName,
      },
      {
        label: "Set Server URL",
        accentColor: "#ffd173",
        onSelect: promptServerUrl,
      },
    ];
  }

  if (state.connectionStatus === "connecting") {
    return [
      {
        label: "Cancel",
        accentColor: "#ff9f7f",
        onSelect: () => client.disconnect("Canceled connection attempt."),
      },
      {
        label: "Set Display Name",
        accentColor: "#8ee8ff",
        onSelect: promptDisplayName,
      },
      {
        label: "Set Server URL",
        accentColor: "#ffd173",
        onSelect: promptServerUrl,
      },
    ];
  }

  if (!room) {
    return [
      {
        label: "Create",
        accentColor: "#ffb07f",
        onSelect: promptCreateRoom,
      },
      {
        label: "Refresh",
        accentColor: "#8ee8ff",
        onSelect: () => client.requestRoomList(),
      },
      {
        label: "Join by Code",
        accentColor: "#7fe7d0",
        onSelect: promptJoinRoom,
      },
      {
        label: "Set Display Name",
        accentColor: "#ffd173",
        onSelect: promptDisplayName,
      },
      {
        label: "Set Server URL",
        accentColor: "#c1a5ff",
        onSelect: promptServerUrl,
      },
      {
        label: "Disconnect",
        accentColor: "#ff9f7f",
        onSelect: () => client.disconnect(),
      },
    ];
  }

  const actions: MenuActionState[] = [];
  if (room.status === "lobby" && self) {
    actions.push({
      label: self.ready ? "Set Unready" : "Set Ready",
      accentColor: self.ready ? "#7fe7d0" : "#ffd173",
      onSelect: () => client.setReady(!self.ready),
    });
  }

  if (room.status === "lobby" && selfIsHost) {
    actions.push({
      label: "Start Match",
      accentColor: "#ffb07f",
      onSelect: () => client.startMatch(),
    });
  }

  actions.push(
    {
      label: "Ping",
      accentColor: "#8ee8ff",
      onSelect: () => client.ping(),
    },
    {
      label: "Leave Room",
      accentColor: "#ffd173",
      onSelect: () => client.leaveRoom(),
    },
    {
      label: "Disconnect",
      accentColor: "#ff9f7f",
      onSelect: () => client.disconnect(),
    },
  );

  return actions;
}

function buildSubtitle(state: MultiplayerClientState): string {
  if (state.connectionStatus === "disconnected") {
    return "Disconnected. Connect to your server to host or join a room.";
  }
  if (state.connectionStatus === "connecting") {
    return "Connecting to multiplayer server...";
  }
  if (!state.room) {
    return `Connected. ${state.availableRooms.length} joinable room${state.availableRooms.length === 1 ? "" : "s"} available.`;
  }

  const readyCount = state.room.players.filter((player) => player.ready).length;
  const mapSuffix = state.room.map ? ` | Map ${state.room.map.name}` : "";
  return `Room ${state.room.code} | ${state.room.status.toUpperCase()} | Players ${state.room.players.length}/${state.room.maxPlayers} | Ready ${readyCount}/${state.room.players.length}${mapSuffix}`;
}

function buildCards(
  state: MultiplayerClientState,
  client: BrowserMultiplayerClient,
  promptCreateRoom: () => void,
  promptJoinRoom: () => void,
): MenuCardState[] {
  if (state.connectionStatus !== "connected" || state.room) {
    return [];
  }

  const cards: MenuCardState[] = [
    {
      key: "create-room",
      eyebrow: "HOST",
      title: "Create Room",
      description:
        "Open a new room on Caldera Twin-Moon Arena. Default room size is 4 pilots (configurable).",
      accentColor: "#ffb07f",
      action: {
        label: "Create",
        accentColor: "#ffb07f",
        onSelect: promptCreateRoom,
      },
    },
  ];

  if (state.availableRooms.length === 0) {
    cards.push({
      key: "empty-room-list",
      eyebrow: "BROWSE",
      title: "No Joinable Rooms",
      description: "No lobby rooms are open right now. Create one or refresh the list.",
      accentColor: "#8ee8ff",
      action: {
        label: "Refresh",
        accentColor: "#8ee8ff",
        onSelect: () => client.requestRoomList(),
      },
    });
  } else {
    for (const room of state.availableRooms) {
      const mapName = room.map?.name ?? "Unknown map";
      cards.push({
        key: `room-${room.code}`,
        eyebrow: "JOIN",
        title: `Room ${room.code}`,
        description:
          `${room.playerCount}/${room.maxPlayers} pilots | Host ${room.hostDisplayName}`
          + ` | ${mapName}`,
        accentColor: "#7fe7d0",
        action: {
          label: "Join Room",
          accentColor: "#7fe7d0",
          onSelect: () => client.joinRoom(room.code),
        },
      });
    }
  }

  cards.push({
    key: "join-by-code",
    eyebrow: "DIRECT",
    title: "Join by Code",
    description: "Enter a 6-character room code to join directly.",
    accentColor: "#ffd173",
    action: {
      label: "Enter Code",
      accentColor: "#ffd173",
      onSelect: promptJoinRoom,
    },
  });

  return cards;
}

function buildDescription(state: MultiplayerClientState): string {
  const parts = [
    `Server ${state.serverUrl}`,
    `Name ${state.displayName}`,
    state.playerId ? `Player ${state.playerId}` : "Player pending",
  ];

  if (state.room) {
    const roster = state.room.players
      .map((player) => {
        const selfSuffix = player.id === state.playerId ? " (you)" : "";
        const hostSuffix = player.isHost ? " [host]" : "";
        const readySuffix = player.ready ? " [ready]" : "";
        const connectionSuffix = player.connected ? "" : " [offline]";
        return `${player.displayName}${selfSuffix}${hostSuffix}${readySuffix}${connectionSuffix}`;
      })
      .join(", ");
    parts.push(`Roster ${roster}`);
    if (state.room.map) {
      parts.push(
        `Map ${state.room.map.name} (${state.room.map.celestialBodyCount} bodies)`,
      );
    }
  } else if (state.connectionStatus === "connected") {
    if (state.availableRooms.length === 0) {
      parts.push("Available rooms: none");
    } else {
      const labels = state.availableRooms
        .slice(0, 4)
        .map((room) => `${room.code} (${room.playerCount}/${room.maxPlayers})`)
        .join(", ");
      parts.push(`Available rooms: ${labels}`);
    }
  }

  if (state.latestSnapshot) {
    const celestialCount = state.latestSnapshot.celestialBodies?.length ?? 0;
    const mapId = state.latestSnapshot.mapId ? ` on ${state.latestSnapshot.mapId}` : "";
    parts.push(
      `Snapshot tick ${state.latestSnapshot.tick}${mapId} (${state.latestSnapshot.players.length} players, ${celestialCount} celestial bodies)`,
    );
  }

  if (state.estimatedLatencyMs !== null) {
    parts.push(`Latency ~${state.estimatedLatencyMs}ms`);
  }
  if (state.latestInfoMessage) {
    parts.push(`Info ${state.latestInfoMessage}`);
  }
  if (state.latestErrorMessage) {
    parts.push(`Error ${state.latestErrorMessage}`);
  }

  return parts.join(" | ");
}

function readStoredValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private browsing or restrictive environments.
  }
}
