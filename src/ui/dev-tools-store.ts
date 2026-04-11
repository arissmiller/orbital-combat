import { useSyncExternalStore } from "react";

interface DevToolsState {
  mapEditorOpen: boolean;
  planetLabOpen: boolean;
  pauseMenuToggleRequestId: number;
}

const DEFAULT_DEV_TOOLS_STATE: DevToolsState = {
  mapEditorOpen: false,
  planetLabOpen: false,
  pauseMenuToggleRequestId: 0,
};

let devToolsState: DevToolsState = DEFAULT_DEV_TOOLS_STATE;
const listeners = new Set<() => void>();

export function openMapEditor(): void {
  if (devToolsState.mapEditorOpen) {
    return;
  }

  devToolsState = {
    ...devToolsState,
    mapEditorOpen: true,
  };
  emit();
}

export function closeMapEditor(): void {
  if (!devToolsState.mapEditorOpen) {
    return;
  }

  devToolsState = {
    ...devToolsState,
    mapEditorOpen: false,
  };
  emit();
}

export function openPlanetLab(): void {
  if (devToolsState.planetLabOpen) {
    return;
  }

  devToolsState = {
    ...devToolsState,
    planetLabOpen: true,
  };
  emit();
}

export function closePlanetLab(): void {
  if (!devToolsState.planetLabOpen) {
    return;
  }

  devToolsState = {
    ...devToolsState,
    planetLabOpen: false,
  };
  emit();
}

export function requestPauseMenuToggle(): void {
  devToolsState = {
    ...devToolsState,
    pauseMenuToggleRequestId: devToolsState.pauseMenuToggleRequestId + 1,
  };
  emit();
}

export function getDevToolsState(): DevToolsState {
  return devToolsState;
}

export function resetDevToolsState(): void {
  devToolsState = DEFAULT_DEV_TOOLS_STATE;
  emit();
}

export function useDevToolsState(): DevToolsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DevToolsState {
  return devToolsState;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
