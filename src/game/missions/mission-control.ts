import type { SceneCameraOverride } from "../scenes/scene-camera";

export type MissionCameraOverride = SceneCameraOverride;

export interface MissionBriefingPage {
  title: string;
  body: string;
  imageLabel?: string;
}

export interface MissionBriefingState {
  title: string;
  subtitle?: string;
  pages: MissionBriefingPage[];
  pageIndex: number;
}

export interface MissionControlState {
  pauseGameplay: boolean;
  blockPlayerInput: boolean;
  cameraOverride: MissionCameraOverride | null;
  briefing: MissionBriefingState | null;
}

export const DEFAULT_MISSION_CONTROL_STATE: MissionControlState = {
  pauseGameplay: false,
  blockPlayerInput: false,
  cameraOverride: null,
  briefing: null,
};

export function createMissionControlState(
  overrides: Partial<MissionControlState> = {},
): MissionControlState {
  return {
    ...DEFAULT_MISSION_CONTROL_STATE,
    ...overrides,
  };
}
