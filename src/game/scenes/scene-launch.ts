import type { GameSceneId } from "./scene-manager";

type DebugLaunchableSceneId =
  | "multiplayer-menu"
  | "tutorial-select"
  | "prototype"
  | "prototype-classic"
  | "prototype-outer-range"
  | "prototype-giant";

const DEBUG_LAUNCH_SCENE: DebugLaunchableSceneId | null = null;
const FORCE_MENU_QUERY_PARAM = "menu";

export function resolveInitialSceneId(): GameSceneId {
  if (shouldForceMenu()) {
    return "main-menu";
  }

  if (import.meta.env.DEV && DEBUG_LAUNCH_SCENE) {
    return DEBUG_LAUNCH_SCENE;
  }

  return "main-menu";
}

function shouldForceMenu(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get(FORCE_MENU_QUERY_PARAM) === "1";
}
