import {
  BrowserMultiplayerClient,
  createDefaultMultiplayerServerUrl,
} from "./browser-multiplayer-client";

interface MultiplayerSessionOptions {
  serverUrl?: string;
  displayName?: string;
}

let sharedMultiplayerClient: BrowserMultiplayerClient | null = null;
let suppressNextMenuAutoJoin = false;

export function getOrCreateMultiplayerClient(
  options: MultiplayerSessionOptions = {},
): BrowserMultiplayerClient {
  if (!sharedMultiplayerClient) {
    sharedMultiplayerClient = new BrowserMultiplayerClient({
      serverUrl: options.serverUrl ?? createDefaultMultiplayerServerUrl(),
      displayName: options.displayName,
    });
    return sharedMultiplayerClient;
  }

  if (options.displayName) {
    sharedMultiplayerClient.setDisplayName(options.displayName);
  }

  if (
    options.serverUrl
    && sharedMultiplayerClient.getState().connectionStatus === "disconnected"
  ) {
    sharedMultiplayerClient.setServerUrl(options.serverUrl);
  }

  return sharedMultiplayerClient;
}

export function disconnectMultiplayerClient(
  reason = "Disconnected from multiplayer.",
): void {
  sharedMultiplayerClient?.disconnect(reason);
}

export function suppressNextMultiplayerMenuAutoJoin(): void {
  suppressNextMenuAutoJoin = true;
}

export function consumeShouldAutoJoinRunningRoom(): boolean {
  if (!suppressNextMenuAutoJoin) {
    return true;
  }

  suppressNextMenuAutoJoin = false;
  return false;
}
