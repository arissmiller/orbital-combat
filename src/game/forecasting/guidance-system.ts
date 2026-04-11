import type { MissileVisual } from "../combat/combat";
import type { CelestialConfig, DefenseConfig } from "../maps/types";
import type { OrbitalBodyState } from "../physics/body";
import { PHYSICS_TUNING } from "../physics/physics-tuning";
import { OrbitalWorld } from "../physics/orbital-world";
import type { Vector2Like } from "../physics/vector2";
import {
  createForecastStore,
  emptyForecast,
  getForecastCacheKey,
  type ForecastHazard,
  type ForecastVariant,
  type TrajectoryForecast,
  type TrajectorySample,
  updateSharedForecast,
} from "./forecast-cache";
import { sampleGuidanceFidelityMesh } from "./guidance-fidelity-mesh";
import { FORECAST_TUNING } from "./forecast-tuning";

interface GuidanceCallbacks {
  applyCelestialState: (
    simulation: OrbitalWorld,
    configs: readonly CelestialConfig[],
    timeSeconds: number,
  ) => void;
  applyDefenseState: (
    simulation: OrbitalWorld,
    configs: readonly DefenseConfig[],
    celestialConfigs: readonly CelestialConfig[],
    timeSeconds: number,
  ) => void;
  getPredictionSubdivisionCount: (
    target: OrbitalBodyState,
    bodies: readonly OrbitalBodyState[],
  ) => number;
  detectHazard: (
    target: OrbitalBodyState,
    bodies: readonly OrbitalBodyState[],
  ) => ForecastHazard | null;
}

interface GuidancePredictionOptions {
  simulation: OrbitalWorld;
  celestialConfigs: readonly CelestialConfig[];
  defenseConfigs: readonly DefenseConfig[];
  startTimeSeconds: number;
  targetId: string;
  steps: number;
  deltaSeconds: number;
  sampleRate: number;
  farSteps?: number;
  farSampleRate?: number;
  headingRadians?: number;
  throttle?: number;
  maxThrustOverride?: number;
}

export interface GuidancePreviewOptions {
  simulation: OrbitalWorld;
  celestialConfigs: readonly CelestialConfig[];
  defenseConfigs: readonly DefenseConfig[];
  elapsedSeconds: number;
  targetId: string;
  headingRadians?: number;
  throttle?: number;
  burnMaxThrustOverride?: number;
  boostedMaxThrust?: number;
}

export interface GuidancePreviewForecasts {
  coast: TrajectoryForecast;
  burn: TrajectoryForecast;
  boost: TrajectoryForecast;
}

export interface GuidanceSystem {
  reset(): void;
  getForecast(bodyId: string, variant: ForecastVariant): TrajectoryForecast;
  updateTrackForecast(options: {
    simulation: OrbitalWorld;
    celestialConfigs: readonly CelestialConfig[];
    defenseConfigs: readonly DefenseConfig[];
    elapsedSeconds: number;
    targetId: string;
    disabled?: boolean;
  }): TrajectoryForecast;
  updatePreviewForecasts(options: GuidancePreviewOptions & {
    disabled?: boolean;
  }): GuidancePreviewForecasts;
  refreshMissileForecasts(options: {
    simulation: OrbitalWorld;
    celestialConfigs: readonly CelestialConfig[];
    defenseConfigs: readonly DefenseConfig[];
    elapsedSeconds: number;
    missiles: readonly MissileVisual[];
  }): void;
}

interface ForecastState {
  sharedForecasts: Map<string, TrajectoryForecast>;
  nextTrackForecastRefreshAt: number;
  nextPreviewForecastRefreshAt: number;
  nextMissileForecastRefreshAt: number;
}

interface GuidanceSnapshot {
  epoch: number;
  systemBodies: readonly OrbitalBodyState[];
  gravityBodies: readonly OrbitalBodyState[];
  targetBody: OrbitalBodyState;
}

interface ApproximateBodyState {
  position: Vector2Like;
  velocity: Vector2Like;
  heading: number;
  throttle: number;
  maxThrust: number;
}

interface HybridFragment {
  positions: Vector2Like[];
  endPosition: Vector2Like;
  endVelocity: Vector2Like;
  stepsSimulated: number;
  hazard: ForecastHazard | null;
  hazardStepIndex: number | null;
  cutoffReached: boolean;
}

interface HybridAccuracyProfile {
  positionBucketSize: number;
  localFieldBucketSize: number;
  localFieldPatchRadius: number;
  radialVelocityBucketSize: number;
  maxGravitySources: number;
  maxSubdivisions: number;
  fragmentSteps: number;
  trustedForecastStepLimit: number | null;
}

interface ForceBalanceSample {
  netAccelerationMagnitude: number;
  totalSourceAccelerationMagnitude: number;
  netToTotalRatio: number;
}

export function createConfiguredGuidanceSystem(
  callbacks: GuidanceCallbacks,
): GuidanceSystem {
  return FORECAST_TUNING.guidanceMode === "hybrid"
    ? createHybridGuidanceSystem(callbacks)
    : createSimulationGuidanceSystem(callbacks);
}

export function createSimulationGuidanceSystem(
  callbacks: GuidanceCallbacks,
): GuidanceSystem {
  const state = createForecastState();

  return createGuidanceSystemFromPredictor({
    state,
    callbacks,
    predict: (options) => predictTrajectoryWithCycles(callbacks, options),
  });
}

export function createHybridGuidanceSystem(
  callbacks: GuidanceCallbacks,
): GuidanceSystem {
  const state = createForecastState();
  const fragmentCache = new Map<string, HybridFragment>();
  const localFieldCache = new Map<string, Vector2Like>();
  let currentEpoch = Number.NaN;

  const reset = () => {
    state.sharedForecasts.clear();
    state.nextTrackForecastRefreshAt = 0;
    state.nextPreviewForecastRefreshAt = 0;
    state.nextMissileForecastRefreshAt = 0;
    fragmentCache.clear();
    localFieldCache.clear();
    currentEpoch = Number.NaN;
  };

  const ensureEpoch = (elapsedSeconds: number) => {
    const epoch = Math.floor(
      elapsedSeconds / FORECAST_TUNING.hybrid.epochSeconds,
    );

    if (epoch !== currentEpoch) {
      reset();
      currentEpoch = epoch;
    }

    return epoch;
  };

  return createGuidanceSystemFromPredictor({
    state,
    callbacks,
    onBeforePredict: (options) => ensureEpoch(options.startTimeSeconds),
    onReset: reset,
    predict: (options) => {
      const epoch = ensureEpoch(options.startTimeSeconds);
      return predictHybridTrajectory(
        callbacks,
        options,
        epoch,
        fragmentCache,
        localFieldCache,
      );
    },
  });
}

function createGuidanceSystemFromPredictor(options: {
  state: ForecastState;
  callbacks: GuidanceCallbacks;
  predict: (options: GuidancePredictionOptions) => TrajectoryForecast;
  onReset?: () => void;
  onBeforePredict?: (options: GuidancePredictionOptions) => void;
}): GuidanceSystem {
  const { state, predict, onReset, onBeforePredict } = options;

  const getForecast = (
    bodyId: string,
    variant: ForecastVariant,
  ): TrajectoryForecast =>
    state.sharedForecasts.get(getForecastCacheKey(bodyId, variant)) ??
    emptyForecast();

  const reset = () => {
    state.sharedForecasts.clear();
    state.nextTrackForecastRefreshAt = 0;
    state.nextPreviewForecastRefreshAt = 0;
    state.nextMissileForecastRefreshAt = 0;
    onReset?.();
  };

  const buildForecast = (
    key: string,
    guidanceOptions: GuidancePredictionOptions,
  ) => {
    onBeforePredict?.(guidanceOptions);
    return updateSharedForecast(
      state.sharedForecasts,
      key,
      predict(guidanceOptions),
    );
  };

  return {
    reset,

    getForecast,

    updateTrackForecast(guidanceOptions) {
      if (guidanceOptions.disabled) {
        return emptyForecast();
      }

      const key = getForecastCacheKey(guidanceOptions.targetId, "track");
      const shouldRefresh =
        guidanceOptions.elapsedSeconds >= state.nextTrackForecastRefreshAt ||
        !state.sharedForecasts.has(key);

      if (!shouldRefresh) {
        return getForecast(guidanceOptions.targetId, "track");
      }

      state.nextTrackForecastRefreshAt =
        guidanceOptions.elapsedSeconds + FORECAST_TUNING.refresh.trackSeconds;
      return buildForecast(key, {
        simulation: guidanceOptions.simulation,
        celestialConfigs: guidanceOptions.celestialConfigs,
        defenseConfigs: guidanceOptions.defenseConfigs,
        startTimeSeconds: guidanceOptions.elapsedSeconds,
        targetId: guidanceOptions.targetId,
        steps: FORECAST_TUNING.player.steps,
        farSteps: FORECAST_TUNING.player.farSteps,
        deltaSeconds: FORECAST_TUNING.player.deltaSeconds,
        sampleRate: FORECAST_TUNING.player.sampleRate,
        farSampleRate: FORECAST_TUNING.player.farSampleRate,
      });
    },

    updatePreviewForecasts(guidanceOptions) {
      if (guidanceOptions.disabled) {
        return {
          coast: emptyForecast(),
          burn: emptyForecast(),
          boost: emptyForecast(),
        };
      }

      const coastKey = getForecastCacheKey(guidanceOptions.targetId, "coast");
      const burnKey = getForecastCacheKey(guidanceOptions.targetId, "burn");
      const boostKey = getForecastCacheKey(guidanceOptions.targetId, "boost");
      const hasBurnInput =
        guidanceOptions.headingRadians !== undefined &&
        guidanceOptions.throttle !== undefined;
      const shouldRefresh =
        guidanceOptions.elapsedSeconds >= state.nextPreviewForecastRefreshAt ||
        !state.sharedForecasts.has(coastKey) ||
        (hasBurnInput && !state.sharedForecasts.has(burnKey)) ||
        (hasBurnInput && !state.sharedForecasts.has(boostKey));

      let coast = getForecast(guidanceOptions.targetId, "coast");
      let burn = hasBurnInput ? getForecast(guidanceOptions.targetId, "burn") : coast;
      let boost = hasBurnInput ? getForecast(guidanceOptions.targetId, "boost") : coast;

      if (!shouldRefresh) {
        return { coast, burn, boost };
      }

      state.nextPreviewForecastRefreshAt =
        guidanceOptions.elapsedSeconds + FORECAST_TUNING.refresh.previewSeconds;

      coast = buildForecast(coastKey, {
        simulation: guidanceOptions.simulation,
        celestialConfigs: guidanceOptions.celestialConfigs,
        defenseConfigs: guidanceOptions.defenseConfigs,
        startTimeSeconds: guidanceOptions.elapsedSeconds,
        targetId: guidanceOptions.targetId,
        steps: FORECAST_TUNING.player.steps,
        farSteps: FORECAST_TUNING.player.farSteps,
        deltaSeconds: FORECAST_TUNING.player.deltaSeconds,
        sampleRate: FORECAST_TUNING.player.sampleRate,
        farSampleRate: FORECAST_TUNING.player.farSampleRate,
      });

      if (!hasBurnInput) {
        return {
          coast,
          burn: coast,
          boost: coast,
        };
      }

      burn = buildForecast(burnKey, {
        simulation: guidanceOptions.simulation,
        celestialConfigs: guidanceOptions.celestialConfigs,
        defenseConfigs: guidanceOptions.defenseConfigs,
        startTimeSeconds: guidanceOptions.elapsedSeconds,
        targetId: guidanceOptions.targetId,
        steps: FORECAST_TUNING.player.steps,
        farSteps: FORECAST_TUNING.player.farSteps,
        deltaSeconds: FORECAST_TUNING.player.deltaSeconds,
        sampleRate: FORECAST_TUNING.player.sampleRate,
        farSampleRate: FORECAST_TUNING.player.farSampleRate,
        headingRadians: guidanceOptions.headingRadians,
        throttle: guidanceOptions.throttle,
        maxThrustOverride: guidanceOptions.burnMaxThrustOverride,
      });

      boost = guidanceOptions.boostedMaxThrust !== undefined
        ? buildForecast(boostKey, {
            simulation: guidanceOptions.simulation,
            celestialConfigs: guidanceOptions.celestialConfigs,
            defenseConfigs: guidanceOptions.defenseConfigs,
            startTimeSeconds: guidanceOptions.elapsedSeconds,
            targetId: guidanceOptions.targetId,
            steps: FORECAST_TUNING.player.steps,
            farSteps: FORECAST_TUNING.player.farSteps,
            deltaSeconds: FORECAST_TUNING.player.deltaSeconds,
            sampleRate: FORECAST_TUNING.player.sampleRate,
            farSampleRate: FORECAST_TUNING.player.farSampleRate,
            headingRadians: guidanceOptions.headingRadians,
            throttle: guidanceOptions.throttle,
            maxThrustOverride: guidanceOptions.boostedMaxThrust,
          })
        : burn;

      return { coast, burn, boost };
    },

    refreshMissileForecasts(guidanceOptions) {
      const shouldRefresh =
        guidanceOptions.elapsedSeconds >= state.nextMissileForecastRefreshAt ||
        guidanceOptions.missiles.some(
          (missile) =>
            !state.sharedForecasts.has(getForecastCacheKey(missile.id, "track")),
        );

      if (!shouldRefresh) {
        return;
      }

      state.nextMissileForecastRefreshAt =
        guidanceOptions.elapsedSeconds + FORECAST_TUNING.refresh.missileSeconds;

      for (const missile of guidanceOptions.missiles) {
        if (missile.body.crashed) {
          continue;
        }

        buildForecast(getForecastCacheKey(missile.id, "track"), {
          simulation: guidanceOptions.simulation,
          celestialConfigs: guidanceOptions.celestialConfigs,
          defenseConfigs: guidanceOptions.defenseConfigs,
          startTimeSeconds: guidanceOptions.elapsedSeconds,
          targetId: missile.id,
          steps: FORECAST_TUNING.missile.steps,
          farSteps: FORECAST_TUNING.missile.farSteps,
          deltaSeconds: FORECAST_TUNING.missile.deltaSeconds,
          sampleRate: FORECAST_TUNING.missile.sampleRate,
          farSampleRate: FORECAST_TUNING.missile.farSampleRate,
        });
      }
    },
  };
}

function createForecastState(): ForecastState {
  return {
    sharedForecasts: createForecastStore(),
    nextTrackForecastRefreshAt: 0,
    nextPreviewForecastRefreshAt: 0,
    nextMissileForecastRefreshAt: 0,
  };
}

function predictTrajectoryWithCycles(
  callbacks: GuidanceCallbacks,
  options: GuidancePredictionOptions,
): TrajectoryForecast {
  const prediction = options.simulation.clone();
  let timeSeconds = options.startTimeSeconds;
  const samples: TrajectorySample[] = [];
  const positions: Vector2Like[] = [];

  if (options.headingRadians !== undefined) {
    prediction.setHeading(options.targetId, options.headingRadians);
  }

  if (options.throttle !== undefined) {
    prediction.setThrottle(options.targetId, options.throttle);
  }

  if (options.maxThrustOverride !== undefined) {
    const target = prediction.getBody(options.targetId);

    if (target?.propulsion) {
      target.propulsion.maxThrust = options.maxThrustOverride;
    }
  }

  const totalSteps = options.steps + (options.farSteps ?? 0);

  for (let index = 0; index < totalSteps; index += 1) {
    const isFarPhase = index >= options.steps;
    const sampleRate = isFarPhase
      ? (options.farSampleRate ?? options.sampleRate * 3)
      : options.sampleRate;
    const targetBeforeStep = prediction.getBody(options.targetId);

    if (!targetBeforeStep) {
      break;
    }

    const subdivisionCount = callbacks.getPredictionSubdivisionCount(
      targetBeforeStep,
      prediction.listBodies(),
    );
    const substepSeconds = options.deltaSeconds / subdivisionCount;

    for (let substep = 0; substep < subdivisionCount; substep += 1) {
      timeSeconds += substepSeconds;
      callbacks.applyCelestialState(
        prediction,
        options.celestialConfigs,
        timeSeconds,
      );
      callbacks.applyDefenseState(
        prediction,
        options.defenseConfigs,
        options.celestialConfigs,
        timeSeconds,
      );
      prediction.step(substepSeconds);
    }

    const target = prediction.getBody(options.targetId);

    if (!target) {
      break;
    }

    const hazard = callbacks.detectHazard(target, prediction.listBodies());

    if (index % sampleRate === 0) {
      const position = { x: target.position.x, y: target.position.y };
      samples.push({
        position,
        timeSeconds,
      });
      positions.push(position);
    }

    if (hazard) {
      return {
        samples,
        positions,
        hazard,
      };
    }
  }

  return {
    samples,
    positions,
    hazard: null,
  };
}

function predictHybridTrajectory(
  callbacks: GuidanceCallbacks,
  options: GuidancePredictionOptions,
  epoch: number,
  fragmentCache: Map<string, HybridFragment>,
  localFieldCache: Map<string, Vector2Like>,
): TrajectoryForecast {
  const snapshot = createGuidanceSnapshot(options.simulation, options.targetId, epoch);

  if (!snapshot) {
    return emptyForecast();
  }

  if (shouldFallbackToSimulation(options)) {
    return predictTrajectoryWithCycles(callbacks, options);
  }

  let timeSeconds = options.startTimeSeconds;
  let state = createApproximateBodyState(snapshot.targetBody, options);
  const samples: TrajectorySample[] = [];
  const positions: Vector2Like[] = [];
  const totalSteps = options.steps + (options.farSteps ?? 0);

  for (let index = 0; index < totalSteps;) {
    const profile = getHybridAccuracyProfile(
      callbacks,
      snapshot,
      state,
      totalSteps,
    );

    if (
      profile.trustedForecastStepLimit !== null &&
      index >= profile.trustedForecastStepLimit
    ) {
      return {
        samples,
        positions,
        hazard: null,
      };
    }

    const fragment = getHybridFragment(
      callbacks,
      options,
      snapshot,
      state,
      profile,
      fragmentCache,
      localFieldCache,
    );

    if (fragment.stepsSimulated === 0) {
      break;
    }

    for (
      let localStep = 0;
      localStep < fragment.stepsSimulated && index < totalSteps;
      localStep += 1
    ) {
      timeSeconds += options.deltaSeconds;
      const isFarPhase = index >= options.steps;
      const sampleRate = isFarPhase
        ? (options.farSampleRate ?? options.sampleRate * 3)
        : options.sampleRate;

      if (index % sampleRate === 0) {
        const position = fragment.positions[localStep];
        samples.push({
          position,
          timeSeconds,
        });
        positions.push(position);
      }

      if (
        fragment.hazard &&
        fragment.hazardStepIndex !== null &&
        localStep >= fragment.hazardStepIndex
      ) {
        return {
          samples,
          positions,
          hazard: fragment.hazard,
        };
      }

      index += 1;

      if (
        profile.trustedForecastStepLimit !== null &&
        index >= profile.trustedForecastStepLimit
      ) {
        return {
          samples,
          positions,
          hazard: null,
        };
      }
    }

    if (fragment.cutoffReached) {
      const lastPosition = positions[positions.length - 1];
      if (
        !lastPosition ||
        distanceBetweenPositions(lastPosition, fragment.endPosition) > 0.0001
      ) {
        const endpoint = {
          x: fragment.endPosition.x,
          y: fragment.endPosition.y,
        };
        samples.push({
          position: endpoint,
          timeSeconds,
        });
        positions.push(endpoint);
      }

      return {
        samples,
        positions,
        hazard: null,
      };
    }

    state = {
      ...state,
      position: fragment.endPosition,
      velocity: fragment.endVelocity,
    };
  }

  return {
    samples,
    positions,
    hazard: null,
  };
}

function createGuidanceSnapshot(
  simulation: OrbitalWorld,
  targetId: string,
  epoch: number,
): GuidanceSnapshot | null {
  const targetBody = simulation.getBody(targetId);

  if (!targetBody) {
    return null;
  }

  const systemBodies = simulation
    .listBodies()
    .filter((body) => body.systemId === targetBody.systemId);
  const gravityBodies = systemBodies.filter(
    (body) => body.id !== targetBody.id && body.affectsGravity,
  );

  return {
    epoch,
    systemBodies,
    gravityBodies,
    targetBody,
  };
}

function createApproximateBodyState(
  body: OrbitalBodyState,
  options: GuidancePredictionOptions,
): ApproximateBodyState {
  return {
    position: { x: body.position.x, y: body.position.y },
    velocity: { x: body.velocity.x, y: body.velocity.y },
    heading: options.headingRadians ?? body.propulsion?.heading ?? 0,
    throttle: clamp(options.throttle ?? body.propulsion?.throttle ?? 0, -1, 1),
    maxThrust: options.maxThrustOverride ?? body.propulsion?.maxThrust ?? 0,
  };
}

function getHybridFragment(
  callbacks: GuidanceCallbacks,
  options: GuidancePredictionOptions,
  snapshot: GuidanceSnapshot,
  state: ApproximateBodyState,
  profile: HybridAccuracyProfile,
  fragmentCache: Map<string, HybridFragment>,
  localFieldCache: Map<string, Vector2Like>,
): HybridFragment {
  const fragmentKey = createHybridFragmentKey(snapshot, state, options, profile);
  const cached = fragmentCache.get(fragmentKey);

  if (cached) {
    return cached;
  }

  const fragment = buildHybridFragment(
    callbacks,
    options,
    snapshot,
    state,
    profile,
    localFieldCache,
  );
  fragmentCache.set(fragmentKey, fragment);
  return fragment;
}

function buildHybridFragment(
  callbacks: GuidanceCallbacks,
  options: GuidancePredictionOptions,
  snapshot: GuidanceSnapshot,
  startingState: ApproximateBodyState,
  profile: HybridAccuracyProfile,
  localFieldCache: Map<string, Vector2Like>,
): HybridFragment {
  const positions: Vector2Like[] = [];
  let position = { ...startingState.position };
  let velocity = { ...startingState.velocity };

  for (let stepIndex = 0; stepIndex < profile.fragmentSteps; stepIndex += 1) {
    const projectedBody = createProjectedBody(snapshot.targetBody, position, velocity);
    const subdivisions = Math.max(
      1,
      Math.min(
        profile.maxSubdivisions,
        callbacks.getPredictionSubdivisionCount(
          projectedBody,
          snapshot.systemBodies,
        ),
      ),
    );
    const substepSeconds = options.deltaSeconds / subdivisions;

    for (let substep = 0; substep < subdivisions; substep += 1) {
      const gravityAcceleration = snapshot.targetBody.receivesGravity
        ? getCachedGravityAcceleration(
            snapshot,
            position,
            profile,
            localFieldCache,
          )
        : ZERO_VECTOR;
      const thrustAcceleration = computeThrustAcceleration(
        snapshot.targetBody.mass,
        startingState.heading,
        startingState.throttle,
        startingState.maxThrust,
      );
      const totalAcceleration = {
        x: gravityAcceleration.x + thrustAcceleration.x,
        y: gravityAcceleration.y + thrustAcceleration.y,
      };

      velocity = {
        x: velocity.x + totalAcceleration.x * substepSeconds,
        y: velocity.y + totalAcceleration.y * substepSeconds,
      };
      position = {
        x: position.x + velocity.x * substepSeconds,
        y: position.y + velocity.y * substepSeconds,
      };

      if (shouldCutoffForecastForGravityWell(snapshot, position)) {
        return {
          positions,
          endPosition: { x: position.x, y: position.y },
          endVelocity: { x: velocity.x, y: velocity.y },
          stepsSimulated: positions.length,
          hazard: null,
          hazardStepIndex: null,
          cutoffReached: true,
        };
      }
    }

    positions.push({ x: position.x, y: position.y });
    const hazard = callbacks.detectHazard(
      createProjectedBody(snapshot.targetBody, position, velocity),
      snapshot.systemBodies,
    );

    if (hazard) {
      return {
        positions,
        endPosition: { x: position.x, y: position.y },
        endVelocity: { x: velocity.x, y: velocity.y },
        stepsSimulated: positions.length,
        hazard,
        hazardStepIndex: positions.length - 1,
        cutoffReached: false,
      };
    }
  }

  return {
    positions,
    endPosition: { x: position.x, y: position.y },
    endVelocity: { x: velocity.x, y: velocity.y },
    stepsSimulated: positions.length,
    hazard: null,
    hazardStepIndex: null,
    cutoffReached: false,
  };
}

function getCachedGravityAcceleration(
  snapshot: GuidanceSnapshot,
  position: Vector2Like,
  profile: HybridAccuracyProfile,
  localFieldCache: Map<string, Vector2Like>,
): Vector2Like {
  const bucketSize = profile.localFieldBucketSize;
  const patchSize = profile.localFieldPatchRadius * 2;
  const patchOriginX =
    profile.localFieldPatchRadius > 0
      ? Math.round(position.x / patchSize) * patchSize
      : 0;
  const patchOriginY =
    profile.localFieldPatchRadius > 0
      ? Math.round(position.y / patchSize) * patchSize
      : 0;
  const quantizedX =
    profile.localFieldPatchRadius > 0
      ? Math.round((position.x - patchOriginX) / bucketSize)
      : Math.round(position.x / bucketSize);
  const quantizedY =
    profile.localFieldPatchRadius > 0
      ? Math.round((position.y - patchOriginY) / bucketSize)
      : Math.round(position.y / bucketSize);
  const key = `${snapshot.epoch}:${snapshot.targetBody.systemId}:${bucketSize}:${profile.maxGravitySources}:${patchOriginX}:${patchOriginY}:${quantizedX}:${quantizedY}`;
  const cached = localFieldCache.get(key);

  if (cached) {
    return cached;
  }

  const relevantSources = snapshot.gravityBodies
    .map((body) => ({
      body,
      influence: getGravityInfluenceMagnitude(body, position),
      distanceSquared:
        (body.position.x - position.x) * (body.position.x - position.x) +
        (body.position.y - position.y) * (body.position.y - position.y),
    }))
    .sort((left, right) => {
      if (right.influence !== left.influence) {
        return right.influence - left.influence;
      }
      return left.distanceSquared - right.distanceSquared;
    })
    .slice(0, profile.maxGravitySources)
    .map((entry) => entry.body);

  const acceleration = relevantSources.reduce(
    (sum, source) => {
      const offsetX = source.position.x - position.x;
      const offsetY = source.position.y - position.y;
      const distanceSquared =
        offsetX * offsetX +
        offsetY * offsetY +
        PHYSICS_TUNING.world.softening * PHYSICS_TUNING.world.softening;
      const distance = Math.sqrt(distanceSquared) || 1;
      const magnitude =
        (PHYSICS_TUNING.world.gravitationalConstant * source.mass) /
        distanceSquared;

      return {
        x: sum.x + (offsetX / distance) * magnitude,
        y: sum.y + (offsetY / distance) * magnitude,
      };
    },
    { x: 0, y: 0 } satisfies Vector2Like,
  );

  localFieldCache.set(key, acceleration);
  return acceleration;
}

function computeThrustAcceleration(
  mass: number,
  heading: number,
  throttle: number,
  maxThrust: number,
): Vector2Like {
  if (mass === 0 || maxThrust === 0 || throttle === 0) {
    return ZERO_VECTOR;
  }

  const thrustAcceleration = (maxThrust * throttle) / mass;
  return {
    x: Math.cos(heading) * thrustAcceleration,
    y: Math.sin(heading) * thrustAcceleration,
  };
}

function createProjectedBody(
  body: OrbitalBodyState,
  position: Vector2Like,
  velocity: Vector2Like,
): OrbitalBodyState {
  return {
    ...body,
    position,
    velocity,
    acceleration: ZERO_VECTOR,
  };
}

function createHybridFragmentKey(
  snapshot: GuidanceSnapshot,
  state: ApproximateBodyState,
  options: GuidancePredictionOptions,
  profile: HybridAccuracyProfile,
): string {
  const positionBucketSize = profile.positionBucketSize;
  const speedBucketSize = FORECAST_TUNING.hybrid.speedBucketSize;
  const radialVelocityBucketSize = profile.radialVelocityBucketSize;
  const directionBuckets = FORECAST_TUNING.hybrid.directionBuckets;
  const throttleBuckets = FORECAST_TUNING.hybrid.throttleBuckets;
  const positionX = Math.round(state.position.x / positionBucketSize);
  const positionY = Math.round(state.position.y / positionBucketSize);
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  const speedBucket = Math.round(speed / speedBucketSize);
  const velocityDirection = quantizeAngle(
    Math.atan2(state.velocity.y, state.velocity.x),
    directionBuckets,
  );
  const headingBucket = quantizeAngle(state.heading, directionBuckets);
  const throttleBucket = Math.round(state.throttle * throttleBuckets);
  const maxThrustBucket = Math.round(state.maxThrust / 25);
  const dominantGravitySource = getDominantGravitySource(
    snapshot.gravityBodies,
    state.position,
  );
  const radialVelocity = dominantGravitySource
    ? getRadialVelocityRelativeToSource(
        dominantGravitySource.position,
        state.position,
        state.velocity,
      )
    : 0;
  const radialVelocityBucket = dominantGravitySource
    ? Math.round(radialVelocity / radialVelocityBucketSize)
    : 0;

  return [
    snapshot.epoch,
    snapshot.targetBody.id,
    positionBucketSize,
    profile.localFieldBucketSize,
    profile.localFieldPatchRadius,
    radialVelocityBucketSize,
    profile.maxGravitySources,
    profile.maxSubdivisions,
    profile.fragmentSteps,
    positionX,
    positionY,
    speedBucket,
    velocityDirection,
    dominantGravitySource?.id ?? "none",
    radialVelocityBucket,
    headingBucket,
    throttleBucket,
    maxThrustBucket,
    Math.round(options.deltaSeconds * 10000),
  ].join(":");
}

function getHybridAccuracyProfile(
  callbacks: GuidanceCallbacks,
  snapshot: GuidanceSnapshot,
  state: ApproximateBodyState,
  totalSteps: number,
): HybridAccuracyProfile {
  const meshSample = sampleGuidanceFidelityMesh(
    snapshot.gravityBodies,
    state.position,
    {
      gradientSampleDistance: FORECAST_TUNING.hybrid.gradientSampleDistance,
      adaptiveGradientStart: FORECAST_TUNING.hybrid.adaptiveGradientStart,
      fullSimulationGradientThreshold:
        FORECAST_TUNING.hybrid.fullSimulationGradientThreshold,
    },
  );
  const projectedBody = createProjectedBody(
    snapshot.targetBody,
    state.position,
    state.velocity,
  );
  const localSubdivisionCount = callbacks.getPredictionSubdivisionCount(
    projectedBody,
    snapshot.systemBodies,
  );
  const maxConfiguredSubdivisionCount = getMaxConfiguredSubdivisionCount();
  const gravityFactor = meshSample.fidelityFactor;
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  const forceBalance = sampleForceBalance(
    snapshot.gravityBodies,
    state.position,
  );
  const useLocalFineFieldPatch =
    snapshot.gravityBodies.length > 0 &&
    speed <= FORECAST_TUNING.hybrid.ambiguityPatchMaxSpeed;
  const ambiguousForceBalance =
    useLocalFineFieldPatch &&
    (
      forceBalance.netToTotalRatio <=
        FORECAST_TUNING.hybrid.ambiguityNetToTotalRatioThreshold ||
      forceBalance.netAccelerationMagnitude <=
        FORECAST_TUNING.hybrid.ambiguityNetAccelerationThreshold
    );

  return {
    positionBucketSize: roundAdaptiveBucketSize(
      FORECAST_TUNING.hybrid.positionBucketSize *
        lerp(
          1,
          FORECAST_TUNING.hybrid.adaptiveMinPositionBucketScale,
          gravityFactor,
        ),
      1,
    ),
    localFieldBucketSize: roundAdaptiveBucketSize(
      (
        FORECAST_TUNING.hybrid.positionBucketSize *
        lerp(
          1,
          FORECAST_TUNING.hybrid.adaptiveMinPositionBucketScale,
          gravityFactor,
        )
      ) *
        (useLocalFineFieldPatch
          ? FORECAST_TUNING.hybrid.ambiguityFineGridScale
          : 1),
      0.5,
    ),
    localFieldPatchRadius: useLocalFineFieldPatch
      ? FORECAST_TUNING.hybrid.ambiguityPatchRadius
      : 0,
    radialVelocityBucketSize: roundAdaptiveBucketSize(
      FORECAST_TUNING.hybrid.radialVelocityBucketSize *
        lerp(
          1,
          FORECAST_TUNING.hybrid.adaptiveMinRadialVelocityBucketScale,
          gravityFactor,
        ),
      0.5,
    ),
    maxGravitySources: Math.max(
      1,
      Math.min(
        snapshot.gravityBodies.length,
        FORECAST_TUNING.hybrid.maxGravitySources +
          Math.round(
            FORECAST_TUNING.hybrid.adaptiveExtraGravitySources * gravityFactor,
          ),
      ),
    ),
    maxSubdivisions: Math.max(
      Math.max(1, localSubdivisionCount),
      Math.round(
        lerp(
          FORECAST_TUNING.hybrid.maxSubdivisions,
          maxConfiguredSubdivisionCount,
          gravityFactor,
        ),
      ),
    ),
    fragmentSteps: Math.max(
      2,
      Math.min(
        FORECAST_TUNING.hybrid.fragmentSteps,
        Math.round(
          FORECAST_TUNING.hybrid.fragmentSteps *
            lerp(
              1,
              FORECAST_TUNING.hybrid.adaptiveMinFragmentStepScale,
              gravityFactor,
            ),
        ),
      ),
    ),
    trustedForecastStepLimit: ambiguousForceBalance
      ? Math.min(
          totalSteps,
          Math.max(
            FORECAST_TUNING.hybrid.ambiguityMinimumTrustedSteps,
            Math.round(
              totalSteps * FORECAST_TUNING.hybrid.ambiguityTrustedHorizonScale,
            ),
          ),
        )
      : null,
  };
}

function getMaxConfiguredSubdivisionCount(): number {
  return FORECAST_TUNING.subdivisionBands.reduce(
    (maxCount, band) => Math.max(maxCount, band.subdivisions),
    1,
  );
}

function roundAdaptiveBucketSize(value: number, minimum: number): number {
  return Math.max(minimum, Math.round((Math.max(minimum, value) / minimum)) * minimum);
}

function quantizeAngle(angleRadians: number, bucketCount: number): number {
  const wrapped =
    ((angleRadians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round((wrapped / (Math.PI * 2)) * bucketCount) % bucketCount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

const ZERO_VECTOR = { x: 0, y: 0 } as const;

function shouldFallbackToSimulation(
  options: GuidancePredictionOptions,
): boolean {
  if (!FORECAST_TUNING.hybrid.simulationFallbackEnabled) {
    return false;
  }

  const target = options.simulation.getBody(options.targetId);

  if (!target) {
    return false;
  }

  const speed = Math.hypot(target.velocity.x, target.velocity.y);
  const lowSpeedThreshold = Math.max(
    FORECAST_TUNING.hybrid.simulationFallbackMinSpeed,
    FORECAST_TUNING.hybrid.speedBucketSize *
      FORECAST_TUNING.hybrid.simulationFallbackSpeedBucketFactor,
  );
  if (speed <= lowSpeedThreshold) {
    return true;
  }

  const dominantGravitySource = getDominantGravitySource(
    options.simulation
      .listBodies()
      .filter(
        (body) =>
          body.systemId === target.systemId &&
          body.id !== target.id &&
          body.affectsGravity,
      ),
    target.position,
  );

  if (dominantGravitySource) {
    const radialVelocity = Math.abs(
      getRadialVelocityRelativeToSource(
        dominantGravitySource.position,
        target.position,
        target.velocity,
      ),
    );
    const lowRadialSpeedThreshold = Math.max(
      FORECAST_TUNING.hybrid.simulationFallbackMinRadialSpeed,
      FORECAST_TUNING.hybrid.speedBucketSize *
        FORECAST_TUNING.hybrid.simulationFallbackRadialSpeedBucketFactor,
    );

    if (radialVelocity <= lowRadialSpeedThreshold) {
      return true;
    }
  }

  if (options.headingRadians === undefined) {
    return false;
  }

  const velocityHeading = Math.atan2(target.velocity.y, target.velocity.x);
  const turnAngleRadians =
    (FORECAST_TUNING.hybrid.simulationFallbackTurnAngleDegrees * Math.PI) / 180;
  return Math.abs(normalizeAngle(options.headingRadians - velocityHeading)) >=
    turnAngleRadians;
}

function shouldCutoffForecastForGravityWell(
  snapshot: GuidanceSnapshot,
  position: Vector2Like,
): boolean {
  return sampleGuidanceFidelityMesh(
    snapshot.gravityBodies,
    position,
    {
      gradientSampleDistance: FORECAST_TUNING.hybrid.gradientSampleDistance,
      adaptiveGradientStart: FORECAST_TUNING.hybrid.adaptiveGradientStart,
      fullSimulationGradientThreshold:
        FORECAST_TUNING.hybrid.fullSimulationGradientThreshold,
    },
  ).requiresFullSimulation;
}

function normalizeAngle(angleRadians: number): number {
  let normalized = angleRadians;

  while (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}

function distanceBetweenPositions(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getDominantGravitySource(
  gravityBodies: readonly OrbitalBodyState[],
  position: Vector2Like,
): OrbitalBodyState | null {
  let dominant: OrbitalBodyState | null = null;
  let dominantInfluence = -Infinity;

  for (const body of gravityBodies) {
    const influence = getGravityInfluenceMagnitude(body, position);

    if (influence > dominantInfluence) {
      dominant = body;
      dominantInfluence = influence;
    }
  }

  return dominant;
}

function getGravityInfluenceMagnitude(
  source: OrbitalBodyState,
  position: Vector2Like,
): number {
  const offsetX = source.position.x - position.x;
  const offsetY = source.position.y - position.y;
  const distanceSquared =
    offsetX * offsetX +
    offsetY * offsetY +
    PHYSICS_TUNING.world.softening * PHYSICS_TUNING.world.softening;

  return distanceSquared > 0
    ? (PHYSICS_TUNING.world.gravitationalConstant * source.mass) /
        distanceSquared
    : Number.POSITIVE_INFINITY;
}

function getRadialVelocityRelativeToSource(
  sourcePosition: Vector2Like,
  position: Vector2Like,
  velocity: Vector2Like,
): number {
  const radialX = position.x - sourcePosition.x;
  const radialY = position.y - sourcePosition.y;
  const radialLength = Math.hypot(radialX, radialY);

  if (radialLength <= 0.0001) {
    return 0;
  }

  return (
    (velocity.x * radialX + velocity.y * radialY) /
    radialLength
  );
}

function sampleForceBalance(
  gravityBodies: readonly OrbitalBodyState[],
  position: Vector2Like,
): ForceBalanceSample {
  let netX = 0;
  let netY = 0;
  let totalSourceAccelerationMagnitude = 0;

  for (const source of gravityBodies) {
    const offsetX = source.position.x - position.x;
    const offsetY = source.position.y - position.y;
    const distanceSquared =
      offsetX * offsetX +
      offsetY * offsetY +
      PHYSICS_TUNING.world.softening * PHYSICS_TUNING.world.softening;
    const distance = Math.sqrt(distanceSquared) || 1;
    const magnitude =
      (PHYSICS_TUNING.world.gravitationalConstant * source.mass) /
      distanceSquared;
    const accelerationX = (offsetX / distance) * magnitude;
    const accelerationY = (offsetY / distance) * magnitude;

    netX += accelerationX;
    netY += accelerationY;
    totalSourceAccelerationMagnitude += magnitude;
  }

  const netAccelerationMagnitude = Math.hypot(netX, netY);

  return {
    netAccelerationMagnitude,
    totalSourceAccelerationMagnitude,
    netToTotalRatio:
      totalSourceAccelerationMagnitude > 0.0001
        ? netAccelerationMagnitude / totalSourceAccelerationMagnitude
        : 1,
  };
}
