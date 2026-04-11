import type { Vector2Like } from "../physics/vector2";

export interface ForecastHazard {
  bodyId: string;
  distance: number;
  kind: "danger" | "impact";
}

export interface TrajectorySample {
  position: Vector2Like;
  timeSeconds: number;
}

export interface TrajectoryForecast {
  samples: TrajectorySample[];
  positions: Vector2Like[];
  hazard: ForecastHazard | null;
}

export type ForecastVariant = "coast" | "burn" | "boost" | "track";

export function createForecastStore(): Map<string, TrajectoryForecast> {
  return new Map<string, TrajectoryForecast>();
}

export function getForecastCacheKey(
  bodyId: string,
  variant: ForecastVariant,
): string {
  return `${bodyId}:${variant}`;
}

export function updateSharedForecast(
  sharedForecasts: Map<string, TrajectoryForecast>,
  key: string,
  forecast: TrajectoryForecast,
): TrajectoryForecast {
  sharedForecasts.set(key, forecast);
  return forecast;
}

export function emptyForecast(): TrajectoryForecast {
  return {
    samples: [],
    positions: [],
    hazard: null,
  };
}
