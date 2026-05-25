import { useSyncExternalStore } from "react";

export interface OverlayMeterState {
  value: number;
  fillColor: string;
  backgroundColor: string;
}

export interface OverlayPanelState {
  title: string;
  accentColor: string;
  meters: OverlayMeterState[];
}

export interface OverlaySystemPanelState extends OverlayPanelState {
  key: string;
  boosted: boolean;
}

export interface OverlayMissionStepState {
  label: string;
  completed: boolean;
  active: boolean;
}

export interface OverlayMissionState {
  title: string;
  accentColor: string;
  subtitle: string;
  steps: OverlayMissionStepState[];
  instruction: string;
  progress: number;
}

export interface OverlayBriefingPageState {
  title: string;
  body: string;
  imageLabel?: string;
  viewId?: string;
}

export interface OverlayBriefingState {
  title: string;
  subtitle?: string;
  pages: OverlayBriefingPageState[];
  pageIndex: number;
}

export interface OverlayWarningState {
  id: string;
  title: string;
  accentColor: string;
  message: string;
}

export interface OverlayScoreboardMetricState {
  label: string;
  value: string;
}

export interface OverlayScoreboardState {
  title: string;
  accentColor: string;
  metrics: OverlayScoreboardMetricState[];
}

export interface OverlayAudioCueState {
  id: string;
}

export interface OverlayEngineAudioState {
  outputLevel: number;
  boosted: boolean;
  thrustHeadingRadians: number | null;
}

export interface OverlayWeaponAudioState {
  disintegratorFiring: boolean;
}

export interface OverlayVitalsState {
  health: number;
  maxHealth: number;
  shieldCharge: number;
  shieldMaxCharge: number;
}

export interface GameOverlayState {
  hudVisible: boolean;
  showLeaveGameButton: boolean;
  title: string;
  fpsText: string;
  scoreboard: OverlayScoreboardState | null;
  briefing: OverlayBriefingState | null;
  mission: OverlayMissionState | null;
  warnings: OverlayWarningState[];
  audioCues: OverlayAudioCueState[];
  engineAudio: OverlayEngineAudioState | null;
  weaponAudio: OverlayWeaponAudioState | null;
  systems: OverlaySystemPanelState[];
  vitals: OverlayVitalsState | null;
}

const DEFAULT_OVERLAY_STATE: GameOverlayState = {
  hudVisible: false,
  showLeaveGameButton: false,
  title: "",
  fpsText: "",
  scoreboard: null,
  briefing: null,
  mission: null,
  warnings: [],
  audioCues: [],
  engineAudio: null,
  weaponAudio: null,
  systems: [],
  vitals: null,
};

let overlayState: GameOverlayState = DEFAULT_OVERLAY_STATE;
const listeners = new Set<() => void>();

export function setGameOverlayState(nextState: GameOverlayState): void {
  overlayState = nextState;
  emit();
}

export function resetGameOverlayState(): void {
  overlayState = DEFAULT_OVERLAY_STATE;
  emit();
}

export function useGameOverlayState(): GameOverlayState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): GameOverlayState {
  return overlayState;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
