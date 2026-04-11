import type { TrajectoryForecast } from "./forecast-cache";
import type { Vector2Like } from "../physics/vector2";

export interface InterceptSolution {
  interceptPoint: Vector2Like;
  timeToInterceptSeconds: number;
  sampleTimeSeconds: number;
  confidence: "predicted" | "fallback";
}

export function findInterceptFromForecast(options: {
  forecast: TrajectoryForecast;
  startTimeSeconds: number;
  sourcePosition: Vector2Like;
  interceptorSpeed: number;
  interceptorAcceleration?: number;
  toleranceMultiplier?: number;
}): InterceptSolution | null {
  const toleranceMultiplier = options.toleranceMultiplier ?? 1.08;

  for (const sample of options.forecast.samples) {
    const timeToSample = sample.timeSeconds - options.startTimeSeconds;
    const distance = distanceBetween(options.sourcePosition, sample.position);
    const timeToIntercept = estimateInterceptTimeSeconds({
      distance,
      initialSpeed: options.interceptorSpeed,
      acceleration: options.interceptorAcceleration ?? 0,
    });

    if (timeToIntercept <= timeToSample * toleranceMultiplier) {
      return {
        interceptPoint: sample.position,
        timeToInterceptSeconds: timeToIntercept,
        sampleTimeSeconds: sample.timeSeconds,
        confidence: "predicted",
      };
    }
  }

  const fallbackSample = options.forecast.samples.at(-1);

  if (!fallbackSample) {
    return null;
  }

  return {
    interceptPoint: fallbackSample.position,
    timeToInterceptSeconds: estimateInterceptTimeSeconds({
      distance: distanceBetween(options.sourcePosition, fallbackSample.position),
      initialSpeed: options.interceptorSpeed,
      acceleration: options.interceptorAcceleration ?? 0,
    }),
    sampleTimeSeconds: fallbackSample.timeSeconds,
    confidence: "fallback",
  };
}

function estimateInterceptTimeSeconds(options: {
  distance: number;
  initialSpeed: number;
  acceleration: number;
}): number {
  if (options.distance <= 0) {
    return 0;
  }

  if (options.acceleration <= 0) {
    return options.distance / Math.max(options.initialSpeed, 0.001);
  }

  const discriminant =
    options.initialSpeed * options.initialSpeed +
    2 * options.acceleration * options.distance;

  return (
    -options.initialSpeed + Math.sqrt(Math.max(0, discriminant))
  ) / options.acceleration;
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
