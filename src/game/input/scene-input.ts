import type { ShipSubsystemKey } from "../ships/systems";
import { KeyTracker } from "./key-tracker";

export interface SceneInputState {
  latches: Record<string, boolean>;
}

export interface SceneInputActions {
  advance: boolean;
  cycleTorpedoLock: boolean;
  fireTorpedo: boolean;
  focusSubsystem: ShipSubsystemKey | null;
  navigateNext: boolean;
  navigatePrevious: boolean;
  restart: boolean;
  switchWeaponMode: boolean;
  toggleDebugHud: boolean;
  toggleHud: boolean;
  togglePause: boolean;
  togglePauseMenu: boolean;
  toggleTacticalView: boolean;
  toggleWeaponArm: boolean;
}

const SCENE_ACTION_BINDINGS = {
  advance: "Enter",
  cycleTorpedoLock: "Tab",
  fireTorpedo: "KeyX",
  navigateNext: "ArrowRight",
  navigatePrevious: "ArrowLeft",
  restart: "KeyR",
  switchWeaponMode: "KeyG",
  toggleDebugHud: "Backquote",
  toggleHud: "KeyH",
  togglePause: "KeyP",
  togglePauseMenu: "Escape",
  toggleTacticalView: "KeyM",
  toggleWeaponArm: "KeyF",
} as const;

const SUBSYSTEM_BINDINGS: readonly [string, ShipSubsystemKey][] = [
  ["Digit1", "engines"],
  ["Digit2", "scanners"],
  ["Digit3", "weapons"],
  ["Digit4", "defenses"],
];

export function createSceneInputState(): SceneInputState {
  return {
    latches: {},
  };
}

export function readSceneInputActions(
  keyTracker: KeyTracker,
  state: SceneInputState,
): SceneInputActions {
  let focusSubsystem: ShipSubsystemKey | null = null;

  for (const [code, subsystem] of SUBSYSTEM_BINDINGS) {
    if (consumeEdge(keyTracker, state, code)) {
      focusSubsystem = subsystem;
    }
  }

  return {
    advance: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.advance),
    cycleTorpedoLock: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.cycleTorpedoLock),
    fireTorpedo: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.fireTorpedo),
    focusSubsystem,
    navigateNext: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.navigateNext),
    navigatePrevious: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.navigatePrevious),
    restart: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.restart),
    switchWeaponMode: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.switchWeaponMode),
    toggleDebugHud: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.toggleDebugHud),
    toggleHud: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.toggleHud),
    togglePause: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.togglePause),
    togglePauseMenu: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.togglePauseMenu),
    toggleTacticalView: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.toggleTacticalView),
    toggleWeaponArm: consumeEdge(keyTracker, state, SCENE_ACTION_BINDINGS.toggleWeaponArm),
  };
}

function consumeEdge(
  keyTracker: KeyTracker,
  state: SceneInputState,
  code: string,
): boolean {
  const pressed = keyTracker.isPressed(code);
  const triggered = pressed && !state.latches[code];
  state.latches[code] = pressed;
  return triggered;
}
