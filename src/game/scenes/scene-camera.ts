import type { Vector2Like } from "../physics/vector2";

export interface SceneCameraOverride {
  mode: "focus";
  center: Vector2Like;
  zoom: number;
  positionLerp?: number;
  zoomLerp?: number;
}
