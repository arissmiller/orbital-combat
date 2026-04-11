import type { FlightInputState } from "../flight/controls";
import {
  createWorldMarkerState,
  resetWorldMarkerState,
  type WorldMarkerEvent,
  type WorldMarkerState,
  type WorldMarkerView,
  updateWorldMarkerState,
} from "../world/world-marker";
import type { Vector2Like } from "../physics/vector2";
import type { ShipSystemsState } from "../ships/systems";
import {
  createMissionControlState,
  type MissionBriefingPage,
  type MissionCameraOverride,
  type MissionControlState,
} from "./mission-control";
import {
  getTutorialLevel1StepCopy,
  TUTORIAL_LEVEL_1_BRIEFING_PAGES,
} from "./tutorial-level-1-script";

type OrbitalFlightTrainingPhase = "fundamentals" | "transfer";

interface OrbitalFlightTrainingContext {
  deltaSeconds: number;
  advanceMissionControl: boolean;
  nextMissionPage: boolean;
  previousMissionPage: boolean;
  flightInput: FlightInputState;
  shipSystems: ShipSystemsState;
  shipPosition: Vector2Like;
  aureliaPosition: Vector2Like;
  referenceOrbitRadius: number;
  vestaPosition: Vector2Like;
  nadirPosition: Vector2Like;
  superBurnActive: boolean;
  fuelDronePosition: Vector2Like | null;
  fuelTransferActive: boolean;
}

interface OrbitalFlightTrainingStepDefinition {
  id: string;
  phase: OrbitalFlightTrainingPhase;
  label: string;
  instruction: string;
  holdSeconds: number;
  pauseOnEnter?: boolean;
  briefingPages?: readonly MissionBriefingPage[];
  getTarget: (context: OrbitalFlightTrainingContext) => WorldMarkerView | null;
  getCameraOverride?: (
    context: OrbitalFlightTrainingContext,
  ) => MissionCameraOverride | null;
  isSatisfied: (context: OrbitalFlightTrainingContext) => boolean;
  getProgress: (
    context: OrbitalFlightTrainingContext,
    holdProgress: number,
  ) => number;
}

interface NadirPracticeGate {
  id: string;
  label: string;
  shape: WorldMarkerView["shape"];
  variant: WorldMarkerView["variant"];
  angleRadians: number;
  orbitRadius: number;
  markerRadius: number;
}

export interface OrbitalFlightTrainingState {
  currentStepIndex: number;
  stepProgressSeconds: number;
  nadirGateObjectiveActive: boolean;
  completed: boolean;
  activeStepId: string | null;
  awaitingAdvanceStepId: string | null;
  briefingPageIndex: number;
  nadirPracticeGate: NadirPracticeGate | null;
  nadirPracticeGateProgressSeconds: number;
  nadirPracticeGateClearedCount: number;
  targetState: WorldMarkerState;
}

export interface OrbitalFlightTrainingStepView {
  label: string;
  completed: boolean;
  active: boolean;
}

export interface OrbitalFlightTrainingSnapshot {
  title: string;
  subtitle: string;
  currentInstruction: string;
  steps: OrbitalFlightTrainingStepView[];
  currentProgress: number;
  completedSteps: number;
  totalSteps: number;
  completed: boolean;
  activeTarget: WorldMarkerView | null;
  targetEvents: WorldMarkerEvent[];
  control: MissionControlState;
}

const FUNDAMENTALS_BRIEFING_PAGES: readonly MissionBriefingPage[] =
  TUTORIAL_LEVEL_1_BRIEFING_PAGES;

const FUNDAMENTALS_MARKER_RADIUS = 150;
const FUNDAMENTALS_MARKER_HOLD_SECONDS = 0.14;

const FUNDAMENTALS_MARKER_COURSE: readonly {
  id: string;
  label: string;
  hint: string;
  angleDegrees: number;
  radiusOffset: number;
  shape: WorldMarkerView["shape"];
  variant: WorldMarkerView["variant"];
}[] = [
  {
    id: "fundamentals-marker-1",
    label: "Marker 1",
    hint: "Use a smooth entry and preserve trajectory quality through Gate 1.",
    angleDegrees: -18,
    radiusOffset: 140,
    shape: "diamond",
    variant: "gate",
  },
  {
    id: "fundamentals-marker-2",
    label: "Marker 2",
    hint: "Make a measured correction and carry a stable line through Gate 2.",
    angleDegrees: 42,
    radiusOffset: -40,
    shape: "diamond",
    variant: "gate",
  },
  {
    id: "fundamentals-marker-3",
    label: "Marker 3",
    hint: "Use lateral shaping to align and cross Gate 3 cleanly.",
    angleDegrees: 122,
    radiusOffset: 110,
    shape: "square",
    variant: "gate",
  },
  {
    id: "fundamentals-marker-4",
    label: "Marker 4",
    hint: "Finish the circuit with controlled timing and a clean Gate 4 cross.",
    angleDegrees: 196,
    radiusOffset: -80,
    shape: "diamond",
    variant: "gate",
  },
] as const;

const ORBIT_TOLERANCE = 170;
const FUNDAMENTALS_INPUT_BAND_TOLERANCE = 240;
const AURELIA_ESCAPE_RADIUS = 1750;
const AURELIA_TRANSFER_MARKER_RADIUS = 170;
const VESTA_DIRECTION_MARKER_SWITCH_DISTANCE = 2500;
const TRANSFER_DIRECTION_MARKER_DISTANCE = 460;
const TRANSFER_DIRECTION_MARKER_RADIUS = 140;
const VESTA_HIGH_ORBIT_DISTANCE = 980;
const VESTA_FUEL_LANE_TOLERANCE = 200;
const VESTA_FUEL_DRONE_MARKER_RADIUS = 135;
const NADIR_APPROACH_DISTANCE = 1380;
const NADIR_DIRECTION_MARKER_DISTANCE = 440;
const NADIR_DIRECTION_MARKER_RADIUS = 144;
const NADIR_PRACTICE_GATE_RADIUS = 164;
const NADIR_PRACTICE_GATE_HOLD_SECONDS = 0.18;
const NADIR_PRACTICE_GATE_MIN_ORBIT_RADIUS = 760;
const NADIR_PRACTICE_GATE_MAX_ORBIT_RADIUS = 1920;
const NADIR_PRACTICE_GATE_MIN_ANGULAR_SEPARATION = Math.PI / 5;
const NADIR_REQUIRED_TUTORIAL_GATES = 4;

const ORBIT_HOLD_SECONDS = 4;
const BURN_HOLD_SECONDS = 0.35;
const GATE_HOLD_SECONDS = 0.18;
const SUPER_BURN_HOLD_SECONDS = 0.25;
const CLIMB_HOLD_SECONDS = 0.3;
const DIVE_HOLD_SECONDS = 0.3;
const FUEL_TRANSFER_HOLD_SECONDS = 0.35;

function tutorialStepCopy(
  id: string,
  fallbackLabel: string,
  fallbackInstruction: string,
): { label: string; instruction: string } {
  return getTutorialLevel1StepCopy(id, {
    label: fallbackLabel,
    instruction: fallbackInstruction,
  });
}

const ORBITAL_FLIGHT_TRAINING_STEPS: readonly OrbitalFlightTrainingStepDefinition[] = [
  {
    id: "hold-aurelia-orbit",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "hold-aurelia-orbit",
      "Hold the Aurelia ring",
      "Stay inside the highlighted orbit band to feel a stable single-body orbit.",
    ),
    holdSeconds: ORBIT_HOLD_SECONDS,
    pauseOnEnter: true,
    briefingPages: FUNDAMENTALS_BRIEFING_PAGES,
    getTarget: (context) => ({
      id: "target:aurelia-orbit",
      label: "Aurelia Orbit",
      shape: "orbitBand",
      variant: "pulse",
      center: context.aureliaPosition,
      radius: context.referenceOrbitRadius,
      thickness: ORBIT_TOLERANCE * 2,
    }),
    getCameraOverride: (context) => ({
      mode: "focus",
      center: context.aureliaPosition,
      zoom: 0.34,
      positionLerp: 0.12,
      zoomLerp: 0.1,
    }),
    isSatisfied: (context) => {
      const orbitalOffset =
        Math.abs(distanceBetween(context.shipPosition, context.aureliaPosition) - context.referenceOrbitRadius);
      return orbitalOffset <= ORBIT_TOLERANCE;
    },
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "prograde-burn",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "prograde-burn",
      "Pulse a prograde burn",
      "Hold [W] briefly while staying near the Aurelia ring. Watch the solid yellow preview stretch ahead of your coast line.",
    ),
    holdSeconds: BURN_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsOrbitBandTarget(context, "Training Orbit"),
    isSatisfied: (context) =>
      isWithinFundamentalsInputBand(context) &&
      context.flightInput.progradeInput &&
      !context.flightInput.retrogradeInput,
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "retrograde-burn",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "retrograde-burn",
      "Pulse a retrograde burn",
      "Hold [S] briefly to pull your projected course tighter toward Aurelia without leaving the training band.",
    ),
    holdSeconds: BURN_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsOrbitBandTarget(context, "Training Orbit"),
    isSatisfied: (context) =>
      isWithinFundamentalsInputBand(context) &&
      context.flightInput.retrogradeInput &&
      !context.flightInput.progradeInput,
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "lateral-burn",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "lateral-burn",
      "Slide laterally",
      "Hold [A] or [D] briefly. Lateral burns slide the forecast across your current direction of travel instead of only stretching it.",
    ),
    holdSeconds: BURN_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsOrbitBandTarget(context, "Training Orbit"),
    isSatisfied: (context) =>
      isWithinFundamentalsInputBand(context) &&
      (context.flightInput.leftInput || context.flightInput.rightInput),
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "boosted-burn",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "boosted-burn",
      "Engage a boosted burn",
      "Hold [SHIFT] with any burn input to engage the engine boost. The dotted preview shows the stronger boosted path.",
    ),
    holdSeconds: SUPER_BURN_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsOrbitBandTarget(context, "Training Orbit"),
    isSatisfied: (context) =>
      isWithinFundamentalsInputBand(context) &&
      context.superBurnActive &&
      hasDirectionalBurnInput(context.flightInput),
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "climb-burn",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "climb-burn",
      "Climb Maneuver [SPACE]",
      "Execute a climb to move into a higher lane and create space.",
    ),
    holdSeconds: CLIMB_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsOrbitBandTarget(context, "Training Orbit"),
    isSatisfied: (context) =>
      isWithinFundamentalsInputBand(context) && context.flightInput.eBrakeInput,
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "dive-burn",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "dive-burn",
      "Dive Maneuver [C]",
      "Execute a dive to recover timing and speed on your current route.",
    ),
    holdSeconds: DIVE_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsOrbitBandTarget(context, "Training Orbit"),
    isSatisfied: (context) =>
      isWithinFundamentalsInputBand(context) &&
      context.flightInput.gravityDiveInput,
    getProgress: (_context, holdProgress) => holdProgress,
  },
  {
    id: "fundamentals-marker-1",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "fundamentals-marker-1",
      "Fly through Marker 1",
      FUNDAMENTALS_MARKER_COURSE[0].hint,
    ),
    holdSeconds: FUNDAMENTALS_MARKER_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsMarkerTarget(context, 0),
    isSatisfied: (context) =>
      distanceBetween(context.shipPosition, getFundamentalsMarkerCenter(context, 0)) <=
      FUNDAMENTALS_MARKER_RADIUS,
    getProgress: (context, holdProgress) =>
      Math.max(
        holdProgress,
        getCircleProgress(
          context.shipPosition,
          getFundamentalsMarkerCenter(context, 0),
          FUNDAMENTALS_MARKER_RADIUS,
        ),
      ),
  },
  {
    id: "fundamentals-marker-2",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "fundamentals-marker-2",
      "Fly through Marker 2",
      FUNDAMENTALS_MARKER_COURSE[1].hint,
    ),
    holdSeconds: FUNDAMENTALS_MARKER_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsMarkerTarget(context, 1),
    isSatisfied: (context) =>
      distanceBetween(context.shipPosition, getFundamentalsMarkerCenter(context, 1)) <=
      FUNDAMENTALS_MARKER_RADIUS,
    getProgress: (context, holdProgress) =>
      Math.max(
        holdProgress,
        getCircleProgress(
          context.shipPosition,
          getFundamentalsMarkerCenter(context, 1),
          FUNDAMENTALS_MARKER_RADIUS,
        ),
      ),
  },
  {
    id: "fundamentals-marker-3",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "fundamentals-marker-3",
      "Fly through Marker 3",
      FUNDAMENTALS_MARKER_COURSE[2].hint,
    ),
    holdSeconds: FUNDAMENTALS_MARKER_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsMarkerTarget(context, 2),
    isSatisfied: (context) =>
      distanceBetween(context.shipPosition, getFundamentalsMarkerCenter(context, 2)) <=
      FUNDAMENTALS_MARKER_RADIUS,
    getProgress: (context, holdProgress) =>
      Math.max(
        holdProgress,
        getCircleProgress(
          context.shipPosition,
          getFundamentalsMarkerCenter(context, 2),
          FUNDAMENTALS_MARKER_RADIUS,
        ),
      ),
  },
  {
    id: "fundamentals-marker-4",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "fundamentals-marker-4",
      "Fly through Marker 4",
      FUNDAMENTALS_MARKER_COURSE[3].hint,
    ),
    holdSeconds: FUNDAMENTALS_MARKER_HOLD_SECONDS,
    getTarget: (context) => buildFundamentalsMarkerTarget(context, 3),
    isSatisfied: (context) =>
      distanceBetween(context.shipPosition, getFundamentalsMarkerCenter(context, 3)) <=
      FUNDAMENTALS_MARKER_RADIUS,
    getProgress: (context, holdProgress) =>
      Math.max(
        holdProgress,
        getCircleProgress(
          context.shipPosition,
          getFundamentalsMarkerCenter(context, 3),
          FUNDAMENTALS_MARKER_RADIUS,
        ),
      ),
  },
  {
    id: "escape-aurelia",
    phase: "fundamentals",
    ...tutorialStepCopy(
      "escape-aurelia",
      "Break for Vesta",
      "Line up your escape through the Vesta transfer marker. Build speed before you cross it so the breakaway carries you toward the next system.",
    ),
    holdSeconds: GATE_HOLD_SECONDS,
    getTarget: (context) => buildAureliaTransferMarker(context),
    isSatisfied: (context) => hasBrokenFromAurelia(context),
    getProgress: (context, holdProgress) => {
      const currentRadius = distanceBetween(
        context.shipPosition,
        context.aureliaPosition,
      );
      const distanceToVesta = distanceBetween(
        context.shipPosition,
        context.vestaPosition,
      );
      const aureliaToVestaDistance = distanceBetween(
        context.aureliaPosition,
        context.vestaPosition,
      );
      return Math.max(
        holdProgress,
        getCircleProgress(
          context.shipPosition,
          getAureliaTransferMarkerCenter(context),
          AURELIA_TRANSFER_MARKER_RADIUS,
        ),
        clamp(
          (currentRadius - context.referenceOrbitRadius) /
            Math.max(1, AURELIA_ESCAPE_RADIUS - context.referenceOrbitRadius),
          0,
          1,
        ),
        clamp(
          (aureliaToVestaDistance - distanceToVesta) /
            Math.max(
              1,
              aureliaToVestaDistance - VESTA_DIRECTION_MARKER_SWITCH_DISTANCE,
            ),
          0,
          1,
        ),
      );
    },
  },
  {
    id: "receive-fuel-drone",
    phase: "transfer",
    ...tutorialStepCopy(
      "receive-fuel-drone",
      "Hold for Fuel Transfer",
      "Close on Vesta, enter the fuel lane, and hold steady. A fuel drone will match your orbit and transfer begins automatically.",
    ),
    holdSeconds: FUEL_TRANSFER_HOLD_SECONDS,
    getTarget: (context) => {
      const distanceToVesta = distanceBetween(
        context.shipPosition,
        context.vestaPosition,
      );
      if (context.fuelDronePosition) {
        return {
          id: "target:fuel-drone",
          label: "Fuel Drone",
          shape: "circle",
          variant: "pulse",
          center: context.fuelDronePosition,
          radius: VESTA_FUEL_DRONE_MARKER_RADIUS,
        };
      }

      if (distanceToVesta > VESTA_DIRECTION_MARKER_SWITCH_DISTANCE) {
        return withVestaFuelLaneGuide(
          context,
          buildVestaDirectionMarker(context),
        );
      }

      return {
        id: "target:vesta-fuel-lane-hold",
        label: "Hold Fuel Lane",
        shape: "orbitBand",
        variant: "pulse",
        center: context.vestaPosition,
        radius: VESTA_HIGH_ORBIT_DISTANCE,
        thickness: VESTA_FUEL_LANE_TOLERANCE * 2,
        radialLabel: "FUEL LANE",
      };
    },
    getCameraOverride: (context) => ({
      mode: "focus",
      center: context.vestaPosition,
      zoom: 0.26,
      positionLerp: 0.12,
      zoomLerp: 0.1,
    }),
    isSatisfied: (context) =>
      context.fuelTransferActive,
    getProgress: (context, holdProgress) => {
      const distanceToVesta = distanceBetween(
        context.shipPosition,
        context.vestaPosition,
      );
      const laneProgress = clamp(
        1 -
          Math.abs(distanceToVesta - VESTA_HIGH_ORBIT_DISTANCE) /
            VESTA_FUEL_LANE_TOLERANCE,
        0,
        1,
      );
      const approachProgress = clamp(
        (VESTA_DIRECTION_MARKER_SWITCH_DISTANCE - distanceToVesta) /
          Math.max(
            1,
            VESTA_DIRECTION_MARKER_SWITCH_DISTANCE - VESTA_HIGH_ORBIT_DISTANCE,
          ),
        0,
        1,
      );

      return Math.max(
        holdProgress,
        context.fuelTransferActive
          ? 1
          : context.fuelDronePosition
            ? getCircleProgress(
                context.shipPosition,
                context.fuelDronePosition,
                VESTA_FUEL_DRONE_MARKER_RADIUS,
              )
            : Math.max(approachProgress, laneProgress),
      );
    },
  },
  {
    id: "transfer-nadir",
    phase: "transfer",
    ...tutorialStepCopy(
      "transfer-nadir",
      "Transfer to Nadir",
      "Break from Vesta and transfer toward Nadir to complete the tutorial.",
    ),
    holdSeconds: GATE_HOLD_SECONDS,
    pauseOnEnter: true,
    getTarget: (context) => buildNadirDirectionMarker(context),
    getCameraOverride: (context) => ({
      mode: "focus",
      center: midpoint(context.vestaPosition, context.nadirPosition),
      zoom: 0.23,
      positionLerp: 0.12,
      zoomLerp: 0.1,
    }),
    isSatisfied: (context) =>
      distanceBetween(context.shipPosition, context.nadirPosition) <=
      NADIR_APPROACH_DISTANCE,
    getProgress: (context, holdProgress) => {
      const distanceToNadir = distanceBetween(
        context.shipPosition,
        context.nadirPosition,
      );
      const vestaToNadirDistance = distanceBetween(
        context.vestaPosition,
        context.nadirPosition,
      );
      return Math.max(
        holdProgress,
        clamp(
          (vestaToNadirDistance - distanceToNadir) /
            Math.max(1, vestaToNadirDistance - NADIR_APPROACH_DISTANCE),
          0,
          1,
        ),
      );
    },
  },
];

export function createOrbitalFlightTrainingState(): OrbitalFlightTrainingState {
  return {
    currentStepIndex: 0,
    stepProgressSeconds: 0,
    nadirGateObjectiveActive: false,
    completed: false,
    activeStepId: ORBITAL_FLIGHT_TRAINING_STEPS[0]?.id ?? null,
    awaitingAdvanceStepId: ORBITAL_FLIGHT_TRAINING_STEPS[0]?.pauseOnEnter
      ? ORBITAL_FLIGHT_TRAINING_STEPS[0].id
      : null,
    briefingPageIndex: 0,
    nadirPracticeGate: null,
    nadirPracticeGateProgressSeconds: 0,
    nadirPracticeGateClearedCount: 0,
    targetState: createWorldMarkerState(),
  };
}

export function resetOrbitalFlightTrainingState(
  state: OrbitalFlightTrainingState,
): void {
  state.currentStepIndex = 0;
  state.stepProgressSeconds = 0;
  state.nadirGateObjectiveActive = false;
  state.completed = false;
  state.activeStepId = ORBITAL_FLIGHT_TRAINING_STEPS[0]?.id ?? null;
  state.awaitingAdvanceStepId = ORBITAL_FLIGHT_TRAINING_STEPS[0]?.pauseOnEnter
    ? ORBITAL_FLIGHT_TRAINING_STEPS[0].id
    : null;
  state.briefingPageIndex = 0;
  state.nadirPracticeGate = null;
  state.nadirPracticeGateProgressSeconds = 0;
  state.nadirPracticeGateClearedCount = 0;
  resetWorldMarkerState(state.targetState);
}

export function updateOrbitalFlightTraining(
  state: OrbitalFlightTrainingState,
  context: OrbitalFlightTrainingContext,
): OrbitalFlightTrainingSnapshot {
  const synchronizeActiveStep = () => {
    const nextStep = ORBITAL_FLIGHT_TRAINING_STEPS[state.currentStepIndex] ?? null;
    state.activeStepId = nextStep?.id ?? null;
    state.awaitingAdvanceStepId = nextStep?.pauseOnEnter ? nextStep.id : null;
    state.briefingPageIndex = 0;
  };

  const enteredStep =
    ORBITAL_FLIGHT_TRAINING_STEPS[state.currentStepIndex] ?? null;
  if (
    !state.nadirGateObjectiveActive &&
    !state.completed &&
    enteredStep &&
    state.activeStepId !== enteredStep.id
  ) {
    synchronizeActiveStep();
  }

  if (!state.nadirGateObjectiveActive && !state.completed) {
    const currentStep =
      ORBITAL_FLIGHT_TRAINING_STEPS[state.currentStepIndex] ?? null;

    if (currentStep) {
      const awaitingAdvance = state.awaitingAdvanceStepId === currentStep.id;
      if (awaitingAdvance) {
        const briefingPageCount = currentStep.briefingPages?.length ?? 0;
        const nextPageRequested =
          context.nextMissionPage && !context.advanceMissionControl;
        if (briefingPageCount > 0) {
          if (context.previousMissionPage) {
            state.briefingPageIndex = Math.max(0, state.briefingPageIndex - 1);
          }
          if (nextPageRequested) {
            state.briefingPageIndex = Math.min(
              briefingPageCount - 1,
              state.briefingPageIndex + 1,
            );
          }
        }

        if (
          context.advanceMissionControl &&
          (briefingPageCount === 0 || state.briefingPageIndex >= briefingPageCount - 1)
        ) {
          state.awaitingAdvanceStepId = null;
        }
      }

      if (context.deltaSeconds > 0 && state.awaitingAdvanceStepId !== currentStep.id) {
        if (currentStep.isSatisfied(context)) {
          state.stepProgressSeconds = Math.min(
            currentStep.holdSeconds,
            state.stepProgressSeconds + context.deltaSeconds,
          );
        } else {
          state.stepProgressSeconds = Math.max(
            0,
            state.stepProgressSeconds - context.deltaSeconds * 0.9,
          );
        }

        if (state.stepProgressSeconds >= currentStep.holdSeconds) {
          state.currentStepIndex += 1;
          state.stepProgressSeconds = 0;
          if (state.currentStepIndex >= ORBITAL_FLIGHT_TRAINING_STEPS.length) {
            state.nadirGateObjectiveActive = true;
            state.activeStepId = null;
            state.awaitingAdvanceStepId = null;
          } else {
            synchronizeActiveStep();
          }
        }
      }
    } else {
      state.nadirGateObjectiveActive = true;
    }
  }

  const phase3Active = state.nadirGateObjectiveActive || state.completed;
  const baseTutorialStepCount = ORBITAL_FLIGHT_TRAINING_STEPS.length;
  const totalSteps = baseTutorialStepCount + 1;
  const safeStepIndex = clamp(state.currentStepIndex, 0, baseTutorialStepCount - 1);
  const activeStep = phase3Active
    ? null
    : ORBITAL_FLIGHT_TRAINING_STEPS[safeStepIndex];
  const awaitingAdvance = !!activeStep && state.awaitingAdvanceStepId === activeStep.id;
  const briefingPages = activeStep?.briefingPages ?? [];
  const briefingPageIndex = clamp(
    state.briefingPageIndex,
    0,
    Math.max(0, briefingPages.length - 1),
  );
  const activeStepHoldProgress = activeStep
    ? clamp(state.stepProgressSeconds / activeStep.holdSeconds, 0, 1)
    : 1;
  const activeStepProgress = activeStep
    ? clamp(activeStep.getProgress(context, activeStepHoldProgress), 0, 1)
    : 1;
  const phase3Progress = state.completed
    ? 1
    : clamp(
        (state.nadirPracticeGateClearedCount +
          state.nadirPracticeGateProgressSeconds /
            Math.max(NADIR_PRACTICE_GATE_HOLD_SECONDS, 0.0001)) /
          NADIR_REQUIRED_TUTORIAL_GATES,
        0,
        1,
      );
  const completedSteps = phase3Active
    ? baseTutorialStepCount + (state.completed ? 1 : 0)
    : safeStepIndex;
  const activePhase = activeStep?.phase ?? "transfer";
  if (phase3Active && !state.nadirPracticeGate) {
    state.nadirPracticeGate = createNadirPracticeGate(state, null);
    resetWorldMarkerState(state.targetState);
  }
  if (phase3Active && state.nadirPracticeGate && context.deltaSeconds > 0) {
    if (isShipInsideNadirPracticeGate(context, state.nadirPracticeGate)) {
      state.nadirPracticeGateProgressSeconds = Math.min(
        NADIR_PRACTICE_GATE_HOLD_SECONDS,
        state.nadirPracticeGateProgressSeconds + context.deltaSeconds,
      );
    } else {
      state.nadirPracticeGateProgressSeconds = Math.max(
        0,
        state.nadirPracticeGateProgressSeconds - context.deltaSeconds * 0.9,
      );
    }

    if (state.nadirPracticeGateProgressSeconds >= NADIR_PRACTICE_GATE_HOLD_SECONDS) {
      const previousGateAngle = state.nadirPracticeGate.angleRadians;
      state.nadirPracticeGateClearedCount += 1;
      state.nadirPracticeGateProgressSeconds = 0;
      state.nadirPracticeGate = createNadirPracticeGate(
        state,
        previousGateAngle,
      );
      resetWorldMarkerState(state.targetState);
      if (
        !state.completed &&
        state.nadirPracticeGateClearedCount >= NADIR_REQUIRED_TUTORIAL_GATES
      ) {
        state.completed = true;
      }
    }
  }

  const activeTarget = phase3Active
    ? buildNadirPracticeGateTarget(context, state.nadirPracticeGate)
    : activeStep
      ? activeStep.getTarget(context)
      : null;
  const visibleSteps = phase3Active
    ? state.completed
      ? [
          {
            label: `Clear ${NADIR_REQUIRED_TUTORIAL_GATES} Nadir gates (${NADIR_REQUIRED_TUTORIAL_GATES}/${NADIR_REQUIRED_TUTORIAL_GATES})`,
            completed: true,
            active: false,
          },
          {
            label: "Free play unlocked around Nadir",
            completed: false,
            active: true,
          },
        ]
      : [{
          label:
            `Clear ${NADIR_REQUIRED_TUTORIAL_GATES} Nadir gates (${Math.min(state.nadirPracticeGateClearedCount, NADIR_REQUIRED_TUTORIAL_GATES)}/${NADIR_REQUIRED_TUTORIAL_GATES})`,
          completed: false,
          active: true,
        }]
    : ORBITAL_FLIGHT_TRAINING_STEPS.filter(
        (step) => step.phase === activePhase,
      ).map((step) => {
        const stepIndex = ORBITAL_FLIGHT_TRAINING_STEPS.indexOf(step);
        return {
          label: step.label,
          completed: stepIndex < safeStepIndex,
          active: stepIndex === safeStepIndex,
        };
      });
  const practiceGateActivated =
    phase3Active &&
    state.nadirPracticeGate !== null &&
    isShipInsideNadirPracticeGate(context, state.nadirPracticeGate);
  const targetEvents = updateWorldMarkerState({
    state: state.targetState,
    shipPosition: context.shipPosition,
    marker: activeTarget,
    activated: practiceGateActivated ||
      (!!activeStep && activeStep.isSatisfied(context) && !awaitingAdvance),
  });

  return {
    title: "Orbital Flight Training",
    subtitle:
      state.completed
        ? "Phase 3: Nadir Free Play"
        : phase3Active
          ? "Phase 3: Nadir Gate Objective"
        : activePhase === "fundamentals"
        ? "Phase 1: Burns around Aurelia"
        : activePhase === "transfer"
          ? "Phase 2: Transfer and Fuel at Vesta"
          : "Phase 2: Transfer and Fuel at Vesta",
    currentInstruction: state.completed
      ? `Tutorial complete. Nadir free play unlocked. Gates cleared: ${state.nadirPracticeGateClearedCount}.`
      : phase3Active
        ? `Clear ${NADIR_REQUIRED_TUTORIAL_GATES} Nadir gates to complete the tutorial (${Math.min(state.nadirPracticeGateClearedCount, NADIR_REQUIRED_TUTORIAL_GATES)}/${NADIR_REQUIRED_TUTORIAL_GATES}).`
      : awaitingAdvance
        ? briefingPages.length > 0
          ? briefingPageIndex >= briefingPages.length - 1
            ? `${briefingPages[briefingPageIndex]?.title ?? activeStep?.instruction ?? "Continue."} Use [Left] and [Right] to change pages. Press [Enter] to continue.`
            : `${briefingPages[briefingPageIndex]?.title ?? activeStep?.instruction ?? "Continue."} Use [Left] and [Right] to change pages.`
          : `${activeStep?.instruction ?? "Continue."} Press [Enter] to continue.`
        : activeStep?.instruction ?? "Training complete.",
    steps: visibleSteps,
    currentProgress: state.completed
      ? 1
      : phase3Active
        ? clamp((baseTutorialStepCount + phase3Progress) / totalSteps, 0, 1)
      : clamp(
          (completedSteps + activeStepProgress) / totalSteps,
          0,
          1,
        ),
    completedSteps,
    totalSteps,
    completed: state.completed,
    activeTarget,
    targetEvents,
    control:
      !phase3Active && activeStep && awaitingAdvance
        ? createMissionControlState({
            pauseGameplay: true,
            blockPlayerInput: true,
            cameraOverride: activeStep.getCameraOverride?.(context) ?? null,
            briefing: briefingPages.length > 0
              ? {
                  title: activeStep.label,
                  subtitle: activePhase === "fundamentals"
                    ? "Flight Briefing"
                    : "Mission Briefing",
                  pages: [...briefingPages],
                  pageIndex: briefingPageIndex,
                }
              : null,
          })
        : createMissionControlState(),
  };
}

function buildAureliaTransferMarker(
  context: OrbitalFlightTrainingContext,
): WorldMarkerView {
  const directionToVesta = getAureliaToVestaDirection(context);
  return {
    id: "target:aurelia-transfer-vector",
    label: "Vesta Transfer",
    shape: "directionArrow",
    variant: "pulse",
    center: getAureliaTransferMarkerCenter(context),
    radius: AURELIA_TRANSFER_MARKER_RADIUS,
    rotationRadians: Math.atan2(directionToVesta.y, directionToVesta.x),
  };
}

function getAureliaTransferMarkerCenter(
  context: OrbitalFlightTrainingContext,
): Vector2Like {
  return add(
    context.aureliaPosition,
    scale(getAureliaToVestaDirection(context), AURELIA_ESCAPE_RADIUS),
  );
}

function buildVestaDirectionMarker(
  context: OrbitalFlightTrainingContext,
): WorldMarkerView {
  const directionToVesta = safeNormalize(
    subtract(context.vestaPosition, context.shipPosition),
    { x: -1, y: 0 },
  );
  return {
    id: "target:vesta-transfer-vector",
    label: "To Vesta",
    shape: "directionArrow",
    variant: "pulse",
    center: add(
      context.shipPosition,
      scale(directionToVesta, TRANSFER_DIRECTION_MARKER_DISTANCE),
    ),
    radius: TRANSFER_DIRECTION_MARKER_RADIUS,
    rotationRadians: Math.atan2(directionToVesta.y, directionToVesta.x),
  };
}

function buildNadirDirectionMarker(
  context: OrbitalFlightTrainingContext,
): WorldMarkerView {
  const directionToNadir = safeNormalize(
    subtract(context.nadirPosition, context.shipPosition),
    { x: 0, y: 1 },
  );
  return {
    id: "target:nadir-transfer-vector",
    label: "To Nadir",
    shape: "directionArrow",
    variant: "pulse",
    center: add(
      context.shipPosition,
      scale(directionToNadir, NADIR_DIRECTION_MARKER_DISTANCE),
    ),
    radius: NADIR_DIRECTION_MARKER_RADIUS,
    rotationRadians: Math.atan2(directionToNadir.y, directionToNadir.x),
  };
}

function buildNadirPracticeGateTarget(
  context: OrbitalFlightTrainingContext,
  gate: NadirPracticeGate | null,
): WorldMarkerView | null {
  if (!gate) {
    return null;
  }
  const gateCenter = getNadirPracticeGateCenter(context, gate);
  return {
    id: `target:${gate.id}`,
    label: gate.label,
    shape: gate.shape,
    variant: gate.variant,
    center: gateCenter,
    radius: gate.markerRadius,
  };
}

function getNadirPracticeGateCenter(
  context: OrbitalFlightTrainingContext,
  gate: NadirPracticeGate,
): Vector2Like {
  return {
    x: context.nadirPosition.x + Math.cos(gate.angleRadians) * gate.orbitRadius,
    y: context.nadirPosition.y + Math.sin(gate.angleRadians) * gate.orbitRadius,
  };
}

function isShipInsideNadirPracticeGate(
  context: OrbitalFlightTrainingContext,
  gate: NadirPracticeGate,
): boolean {
  return (
    distanceBetween(
      context.shipPosition,
      getNadirPracticeGateCenter(context, gate),
    ) <= gate.markerRadius
  );
}

function createNadirPracticeGate(
  state: OrbitalFlightTrainingState,
  previousGateAngle: number | null,
): NadirPracticeGate {
  let angleRadians = Math.random() * Math.PI * 2;
  if (previousGateAngle !== null) {
    let attempts = 0;
    while (
      attempts < 48 &&
      circularAngleDistance(angleRadians, previousGateAngle) <
        NADIR_PRACTICE_GATE_MIN_ANGULAR_SEPARATION
    ) {
      angleRadians = Math.random() * Math.PI * 2;
      attempts += 1;
    }
  }

  return {
    id: `nadir-practice-gate-${state.nadirPracticeGateClearedCount + 1}`,
    label: `Nadir Gate ${state.nadirPracticeGateClearedCount + 1}`,
    shape: Math.random() < 0.5 ? "diamond" : "square",
    variant: "gate",
    angleRadians,
    orbitRadius: lerp(
      NADIR_PRACTICE_GATE_MIN_ORBIT_RADIUS,
      NADIR_PRACTICE_GATE_MAX_ORBIT_RADIUS,
      Math.random(),
    ),
    markerRadius: NADIR_PRACTICE_GATE_RADIUS,
  };
}

function withVestaFuelLaneGuide(
  context: OrbitalFlightTrainingContext,
  marker: WorldMarkerView,
): WorldMarkerView {
  return {
    ...marker,
    guideOrbitBand: {
      center: context.vestaPosition,
      radius: VESTA_HIGH_ORBIT_DISTANCE,
      thickness: VESTA_FUEL_LANE_TOLERANCE * 2,
      radialLabel: "FUEL LANE",
    },
  };
}

function hasBrokenFromAurelia(
  context: OrbitalFlightTrainingContext,
): boolean {
  const distanceFromAurelia = distanceBetween(
    context.shipPosition,
    context.aureliaPosition,
  );
  const passedTransferGate =
    distanceBetween(context.shipPosition, getAureliaTransferMarkerCenter(context)) <=
      AURELIA_TRANSFER_MARKER_RADIUS &&
    distanceFromAurelia >= AURELIA_ESCAPE_RADIUS;
  const reachedVestaApproachVolume =
    distanceFromAurelia >= AURELIA_ESCAPE_RADIUS &&
    distanceBetween(context.shipPosition, context.vestaPosition) <=
      VESTA_DIRECTION_MARKER_SWITCH_DISTANCE;

  return passedTransferGate || reachedVestaApproachVolume;
}

function buildFundamentalsMarkerTarget(
  context: OrbitalFlightTrainingContext,
  index: number,
): WorldMarkerView {
  const marker = FUNDAMENTALS_MARKER_COURSE[index];
  return {
    id: `target:${marker.id}`,
    label: marker.label,
    shape: marker.shape,
    variant: marker.variant,
    center: getFundamentalsMarkerCenter(context, index),
    radius: FUNDAMENTALS_MARKER_RADIUS,
  };
}

function buildFundamentalsOrbitBandTarget(
  context: OrbitalFlightTrainingContext,
  label: string,
): WorldMarkerView {
  return {
    id: "target:fundamentals-orbit-band",
    label,
    shape: "orbitBand",
    variant: "pulse",
    center: context.aureliaPosition,
    radius: context.referenceOrbitRadius,
    thickness: FUNDAMENTALS_INPUT_BAND_TOLERANCE * 2,
  };
}

function getFundamentalsMarkerCenter(
  context: OrbitalFlightTrainingContext,
  index: number,
): Vector2Like {
  const marker = FUNDAMENTALS_MARKER_COURSE[index];
  const radius = context.referenceOrbitRadius + marker.radiusOffset;
  const angle = (marker.angleDegrees * Math.PI) / 180;
  return {
    x: context.aureliaPosition.x + Math.cos(angle) * radius,
    y: context.aureliaPosition.y + Math.sin(angle) * radius,
  };
}

function getAureliaToVestaDirection(
  context: OrbitalFlightTrainingContext,
): Vector2Like {
  return safeNormalize(
    subtract(context.vestaPosition, context.aureliaPosition),
    { x: -1, y: 0 },
  );
}

function isWithinFundamentalsInputBand(
  context: OrbitalFlightTrainingContext,
): boolean {
  const orbitalOffset =
    Math.abs(
      distanceBetween(context.shipPosition, context.aureliaPosition) -
        context.referenceOrbitRadius,
    );
  return orbitalOffset <= FUNDAMENTALS_INPUT_BAND_TOLERANCE;
}

function hasDirectionalBurnInput(input: FlightInputState): boolean {
  return (
    input.progradeInput ||
    input.retrogradeInput ||
    input.leftInput ||
    input.rightInput
  );
}

function getCircleProgress(
  shipPosition: Vector2Like,
  center: Vector2Like,
  radius: number,
): number {
  return clamp(1 - distanceBetween(shipPosition, center) / radius, 0, 1);
}

function isWithinVestaFuelLane(
  context: OrbitalFlightTrainingContext,
): boolean {
  return (
    Math.abs(
      distanceBetween(context.shipPosition, context.vestaPosition) -
        VESTA_HIGH_ORBIT_DISTANCE,
    ) <= VESTA_FUEL_LANE_TOLERANCE
  );
}

function add(a: Vector2Like, b: Vector2Like): Vector2Like {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function midpoint(a: Vector2Like, b: Vector2Like): Vector2Like {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function scale(vector: Vector2Like, scalar: number): Vector2Like {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

function safeNormalize(
  vector: Vector2Like,
  fallback: Vector2Like,
): Vector2Like {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= 0.0001) {
    return { x: fallback.x, y: fallback.y };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function subtract(a: Vector2Like, b: Vector2Like): Vector2Like {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function circularAngleDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % (Math.PI * 2);
  return delta > Math.PI ? Math.PI * 2 - delta : delta;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
