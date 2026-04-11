export interface ForecastSamplingTuning {
  steps: number;
  farSteps: number;
  deltaSeconds: number;
  sampleRate: number;
  farSampleRate: number;
}

export interface ForecastRefreshTuning {
  trackSeconds: number;
  previewSeconds: number;
  missileSeconds: number;
}

export interface ForecastRenderingTuning {
  instantaneousFallbackEnabled: boolean;
  minimumNavigationLength: number;
  coastLerpFactor: number;
  burnLerpFactor: number;
  boostLerpFactor: number;
  spatialSmoothingFactor: number;
  lockedLeadingPoints: number;
  resampleSpacing: number;
  maxRenderPoints: number;
  originNoseOffset: number;
  leadingSkipDistance: number;
  trailingTrimFraction: number;
  trailingTrimMinimumPoints: number;
  stabilityPointDelta: number;
  stabilityOverlapSearchPoints: number;
  stabilityOverlapComparePoints: number;
  stabilityAlignmentSearchPoints: number;
  stabilityBacktrackPoints: number;
  stabilityViolationWindowPoints: number;
  stabilityViolationThreshold: number;
  stablePointDropPerFrame: number;
  stablePointGrowPerFrame: number;
  stablePointDropConfirmFrames: number;
  instantaneousMinimumSourcePoints: number;
  instantaneousUnstablePointSlack: number;
  instantaneousStableRatioThreshold: number;
}

export interface ForecastSubdivisionBand {
  distanceRadiusMultiplier: number;
  subdivisions: number;
}

export type GuidanceMode = "simulation" | "hybrid";

export interface HybridGuidanceTuning {
  epochSeconds: number;
  simulationFallbackEnabled: boolean;
  gradientSampleDistance: number;
  adaptiveGradientStart: number;
  fullSimulationGradientThreshold: number;
  positionBucketSize: number;
  speedBucketSize: number;
  radialVelocityBucketSize: number;
  adaptiveMinPositionBucketScale: number;
  adaptiveMinRadialVelocityBucketScale: number;
  adaptiveMinFragmentStepScale: number;
  adaptiveExtraGravitySources: number;
  directionBuckets: number;
  throttleBuckets: number;
  fragmentSteps: number;
  maxGravitySources: number;
  maxSubdivisions: number;
  simulationFallbackMinSpeed: number;
  simulationFallbackSpeedBucketFactor: number;
  simulationFallbackMinRadialSpeed: number;
  simulationFallbackRadialSpeedBucketFactor: number;
  simulationFallbackTurnAngleDegrees: number;
  ambiguityPatchMaxSpeed: number;
  ambiguityNetToTotalRatioThreshold: number;
  ambiguityNetAccelerationThreshold: number;
  ambiguityFineGridScale: number;
  ambiguityPatchRadius: number;
  ambiguityTrustedHorizonScale: number;
  ambiguityMinimumTrustedSteps: number;
}

export interface ForecastTuning {
  guidanceMode: GuidanceMode;
  refresh: ForecastRefreshTuning;
  rendering: ForecastRenderingTuning;
  player: ForecastSamplingTuning;
  missile: ForecastSamplingTuning;
  hazardDangerRadiusMultiplier: number;
  subdivisionBands: readonly ForecastSubdivisionBand[];
  hybrid: HybridGuidanceTuning;
}

export const FORECAST_TUNING: ForecastTuning = {
  guidanceMode: "hybrid",
  refresh: {
    trackSeconds: 1 / 10,
    previewSeconds: 1 / 12,
    missileSeconds: 1 / 8,
  },
  rendering: {
    instantaneousFallbackEnabled: false,
    minimumNavigationLength: 280,
    coastLerpFactor: 0.13,
    burnLerpFactor: 0.16,
    boostLerpFactor: 0.19,
    spatialSmoothingFactor: 0.22,
    lockedLeadingPoints: 2,
    resampleSpacing: 22,
    maxRenderPoints: 96,
    originNoseOffset: 20,
    leadingSkipDistance: 18,
    trailingTrimFraction: 0.18,
    trailingTrimMinimumPoints: 10,
    stabilityPointDelta: 44,
    stabilityOverlapSearchPoints: 8,
    stabilityOverlapComparePoints: 10,
    stabilityAlignmentSearchPoints: 3,
    stabilityBacktrackPoints: 3,
    stabilityViolationWindowPoints: 4,
    stabilityViolationThreshold: 2,
    stablePointDropPerFrame: 6,
    stablePointGrowPerFrame: 4,
    stablePointDropConfirmFrames: 4,
    instantaneousMinimumSourcePoints: 10,
    instantaneousUnstablePointSlack: 8,
    instantaneousStableRatioThreshold: 0.72,
  },
  player: {
    steps: 720,
    farSteps: 1080,
    deltaSeconds: 1 / 120,
    sampleRate: 8,
    farSampleRate: 28,
  },
  missile: {
    steps: 160,
    farSteps: 240,
    deltaSeconds: 1 / 120,
    sampleRate: 5,
    farSampleRate: 12,
  },
  hazardDangerRadiusMultiplier: 2.2,
  subdivisionBands: [
    { distanceRadiusMultiplier: 3.5, subdivisions: 4 },
    { distanceRadiusMultiplier: 8, subdivisions: 3 },
    { distanceRadiusMultiplier: 16, subdivisions: 2 },
  ],
  hybrid: {
    epochSeconds: 0.3,
    simulationFallbackEnabled: false,
    gradientSampleDistance: 18,
    adaptiveGradientStart: 0.55,
    fullSimulationGradientThreshold: 3.6,
    positionBucketSize: 20,
    speedBucketSize: 12,
    radialVelocityBucketSize: 3,
    adaptiveMinPositionBucketScale: 0.4,
    adaptiveMinRadialVelocityBucketScale: 0.4,
    adaptiveMinFragmentStepScale: 0.45,
    adaptiveExtraGravitySources: 3,
    directionBuckets: 32,
    throttleBuckets: 10,
    fragmentSteps: 10,
    maxGravitySources: 5,
    maxSubdivisions: 3,
    simulationFallbackMinSpeed: 2.5,
    simulationFallbackSpeedBucketFactor: 1,
    simulationFallbackMinRadialSpeed: 3.5,
    simulationFallbackRadialSpeedBucketFactor: 0.35,
    simulationFallbackTurnAngleDegrees: 132,
    ambiguityPatchMaxSpeed: 8,
    ambiguityNetToTotalRatioThreshold: 0.42,
    ambiguityNetAccelerationThreshold: 1.25,
    ambiguityFineGridScale: 0.4,
    ambiguityPatchRadius: 240,
    ambiguityTrustedHorizonScale: 0.42,
    ambiguityMinimumTrustedSteps: 120,
  },
};
