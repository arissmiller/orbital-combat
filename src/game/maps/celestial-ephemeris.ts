import type { Vector2Like } from "../physics/vector2";
import type { CelestialConfig } from "./types";

export interface CelestialPose {
  position: Vector2Like;
  velocity: Vector2Like;
}

export type CelestialStateMap = Map<string, CelestialPose>;

interface CelestialEphemerisEntry {
  config: CelestialConfig;
  localSamples: readonly CelestialPose[] | null;
}

export interface CelestialEphemeris {
  entries: readonly CelestialEphemerisEntry[];
}

export interface CelestialStateEvaluator {
  evaluate: (timeSeconds: number) => CelestialStateMap;
}

const ORBIT_SAMPLE_COUNT = 360;
const KEPLER_SOLVER_ITERATIONS = 12;

interface AuthoredOrbitMotionProfile {
  periodSeconds: number;
  meanMotion: number;
  eccentricity: number;
  semiMajorAxis: number;
  semiMinorAxis: number;
  orbitRotation: number;
  initialMeanAnomaly: number;
}

export function createCelestialEphemeris(
  configs: readonly CelestialConfig[],
): CelestialEphemeris {
  return {
    entries: configs.map((config) => ({
      config,
      localSamples:
        config.parentId === null || config.orbitPeriod <= 0
          ? null
          : buildLocalOrbitSamples(config, ORBIT_SAMPLE_COUNT),
    })),
  };
}

export function createCelestialStateEvaluator(
  ephemeris: CelestialEphemeris,
): CelestialStateEvaluator {
  let lastTimeSeconds = Number.NaN;
  let lastState: CelestialStateMap | null = null;

  return {
    evaluate(timeSeconds: number): CelestialStateMap {
      if (lastState && timeSeconds === lastTimeSeconds) {
        return lastState;
      }

      lastTimeSeconds = timeSeconds;
      lastState = evaluateCelestialState(ephemeris, timeSeconds);
      return lastState;
    },
  };
}

export function evaluateCelestialState(
  ephemeris: CelestialEphemeris,
  timeSeconds: number,
): CelestialStateMap {
  const state: CelestialStateMap = new Map();

  for (const entry of ephemeris.entries) {
    const { config } = entry;

    if (config.parentId === null) {
      state.set(config.id, {
        position: { x: config.rootPosition.x, y: config.rootPosition.y },
        velocity: { x: 0, y: 0 },
      });
      continue;
    }

    const parent = state.get(config.parentId);

    if (!parent) {
      throw new Error(`Missing parent state for ${config.id}`);
    }

    const orbitState = sampleLocalOrbit(entry, timeSeconds);

    state.set(config.id, {
      position: {
        x: parent.position.x + orbitState.position.x,
        y: parent.position.y + orbitState.position.y,
      },
      velocity: {
        x: parent.velocity.x + orbitState.velocity.x,
        y: parent.velocity.y + orbitState.velocity.y,
      },
    });
  }

  return state;
}

function buildLocalOrbitSamples(
  config: Pick<
    CelestialConfig,
    | "orbitRadius"
    | "orbitPeriod"
    | "initialAngle"
    | "orbitDirection"
    | "orbitEccentricity"
    | "orbitRotation"
  >,
  sampleCount: number,
): CelestialPose[] {
  const samples: CelestialPose[] = [];
  const profile = buildAuthoredOrbitMotionProfile(config);

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = (index / sampleCount) * config.orbitPeriod;
    samples.push(evaluateAuthoredOrbitState(profile, timeSeconds));
  }

  return samples;
}

function sampleLocalOrbit(
  entry: CelestialEphemerisEntry,
  timeSeconds: number,
): CelestialPose {
  if (!entry.localSamples || entry.localSamples.length === 0) {
    return {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
    };
  }

  const sampleCount = entry.localSamples.length;
  const normalizedTime =
    ((timeSeconds % entry.config.orbitPeriod) + entry.config.orbitPeriod) %
    entry.config.orbitPeriod;
  const samplePosition =
    (normalizedTime / entry.config.orbitPeriod) * sampleCount;
  const startIndex = Math.floor(samplePosition) % sampleCount;
  const endIndex = (startIndex + 1) % sampleCount;
  const alpha = samplePosition - Math.floor(samplePosition);
  const start = entry.localSamples[startIndex];
  const end = entry.localSamples[endIndex];

  return {
    position: lerpVector(start.position, end.position, alpha),
    velocity: lerpVector(start.velocity, end.velocity, alpha),
  };
}

function evaluateAuthoredOrbitState(
  profile: AuthoredOrbitMotionProfile,
  timeSeconds: number,
): CelestialPose {
  const meanAnomaly = normalizeAngle(
    profile.initialMeanAnomaly + profile.meanMotion * timeSeconds,
  );
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, profile.eccentricity);
  const localPosition = authoredOrbitLocalPosition(profile, eccentricAnomaly);
  const localVelocity = authoredOrbitLocalVelocity(profile, eccentricAnomaly);

  return {
    position: localPosition,
    velocity: localVelocity,
  };
}

function buildAuthoredOrbitMotionProfile(
  config: Pick<
    CelestialConfig,
    | "orbitRadius"
    | "orbitPeriod"
    | "initialAngle"
    | "orbitDirection"
    | "orbitEccentricity"
    | "orbitRotation"
  >,
): AuthoredOrbitMotionProfile {
  const eccentricity = clamp(config.orbitEccentricity ?? 0, 0, 0.92);
  const semiMajorAxis = config.orbitRadius;
  const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
  const orbitRotation = config.orbitRotation ?? 0;
  const initialTrueAnomaly = normalizeAngle(config.initialAngle);
  const initialEccentricAnomaly = trueAnomalyToEccentricAnomaly(
    initialTrueAnomaly,
    eccentricity,
  );
  const meanMotion =
    ((Math.PI * 2) / config.orbitPeriod) *
    getOrbitDirectionSign(config.orbitDirection);

  return {
    periodSeconds: config.orbitPeriod,
    meanMotion,
    eccentricity,
    semiMajorAxis,
    semiMinorAxis,
    orbitRotation,
    initialMeanAnomaly: normalizeAngle(
      initialEccentricAnomaly - eccentricity * Math.sin(initialEccentricAnomaly),
    ),
  };
}

function authoredOrbitLocalPosition(
  profile: Pick<
    AuthoredOrbitMotionProfile,
    "semiMajorAxis" | "semiMinorAxis" | "eccentricity" | "orbitRotation"
  >,
  eccentricAnomaly: number,
): Vector2Like {
  const cosAngle = Math.cos(eccentricAnomaly);
  const sinAngle = Math.sin(eccentricAnomaly);
  const cosRotation = Math.cos(profile.orbitRotation);
  const sinRotation = Math.sin(profile.orbitRotation);
  const localX = profile.semiMajorAxis * (cosAngle - profile.eccentricity);
  const localY = sinAngle * profile.semiMinorAxis;

  return {
    x: localX * cosRotation - localY * sinRotation,
    y: localX * sinRotation + localY * cosRotation,
  };
}

function authoredOrbitLocalVelocity(
  profile: AuthoredOrbitMotionProfile,
  eccentricAnomaly: number,
): Vector2Like {
  const sinAngle = Math.sin(eccentricAnomaly);
  const cosAngle = Math.cos(eccentricAnomaly);
  const cosRotation = Math.cos(profile.orbitRotation);
  const sinRotation = Math.sin(profile.orbitRotation);
  const eccentricDenominator = Math.max(1 - profile.eccentricity * cosAngle, 1e-4);
  const eccentricAnomalyRate = profile.meanMotion / eccentricDenominator;
  const localVelocityX = -profile.semiMajorAxis * sinAngle * eccentricAnomalyRate;
  const localVelocityY = profile.semiMinorAxis * cosAngle * eccentricAnomalyRate;

  return {
    x: localVelocityX * cosRotation - localVelocityY * sinRotation,
    y: localVelocityX * sinRotation + localVelocityY * cosRotation,
  };
}

function solveEccentricAnomaly(
  meanAnomaly: number,
  eccentricity: number,
): number {
  let eccentricAnomaly =
    eccentricity < 0.8 ? meanAnomaly : Math.PI;

  for (let iteration = 0; iteration < KEPLER_SOLVER_ITERATIONS; iteration += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      Math.max(1 - eccentricity * Math.cos(eccentricAnomaly), 1e-4);
    eccentricAnomaly -= delta;
  }

  return normalizeAngle(eccentricAnomaly);
}

function trueAnomalyToEccentricAnomaly(
  trueAnomaly: number,
  eccentricity: number,
): number {
  if (eccentricity <= 0) {
    return normalizeAngle(trueAnomaly);
  }

  const sinHalf = Math.sin(trueAnomaly * 0.5);
  const cosHalf = Math.cos(trueAnomaly * 0.5);
  return normalizeAngle(
    2 *
      Math.atan2(
        Math.sqrt(1 - eccentricity) * sinHalf,
        Math.sqrt(1 + eccentricity) * cosHalf,
      ),
  );
}

function lerpVector(
  start: Vector2Like,
  end: Vector2Like,
  alpha: number,
): Vector2Like {
  return {
    x: start.x + (end.x - start.x) * alpha,
    y: start.y + (end.y - start.y) * alpha,
  };
}

function normalizeAngle(angleRadians: number): number {
  const fullTurn = Math.PI * 2;
  const wrapped = angleRadians % fullTurn;
  return wrapped < 0 ? wrapped + fullTurn : wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getOrbitDirectionSign(direction: "cw" | "ccw" | undefined): number {
  return direction === "ccw" ? -1 : 1;
}
