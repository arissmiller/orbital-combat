import { useSyncExternalStore } from "react";

export interface MenuActionState {
  label: string;
  accentColor: string;
  onSelect: () => void;
}

export interface MenuCardState {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  accentColor: string;
  action: MenuActionState;
}

export interface GameMenuState {
  visible: boolean;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  layout: "stack" | "cards" | "left-column";
  actions: MenuActionState[];
  cards: MenuCardState[];
  footerActions: MenuActionState[];
}

const DEFAULT_MENU_STATE: GameMenuState = {
  visible: false,
  title: "",
  subtitle: "",
  description: "",
  accentColor: "#8ee8ff",
  layout: "stack",
  actions: [],
  cards: [],
  footerActions: [],
};

let menuState: GameMenuState = DEFAULT_MENU_STATE;
const listeners = new Set<() => void>();

export function setGameMenuState(nextState: GameMenuState): void {
  menuState = nextState;
  emit();
}

export function resetGameMenuState(): void {
  menuState = DEFAULT_MENU_STATE;
  emit();
}

export function useGameMenuState(): GameMenuState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): GameMenuState {
  return menuState;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
