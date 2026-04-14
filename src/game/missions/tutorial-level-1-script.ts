import type { MissionBriefingPage } from "./mission-control";

export interface TutorialStepCopy {
  label: string;
  instruction: string;
}

export const TUTORIAL_LEVEL_1_BRIEFING_PAGES: readonly MissionBriefingPage[] = [
  {
    title: "Read the Coast Line",
    body:
      "The blue line is your projected coast path.\nUse it to evaluate where your ship is going before you commit to a burn.",
    imageLabel: "Trajectory View",
    viewId: "trajectory-view",
  },
  {
    title: "Shape, Then Commit",
    body:
      "Short, deliberate corrections are more stable than long panic burns.\nThe objective is controlled trajectory quality, not constant thrust.\n- [W] prograde burn\n- [S] retrograde burn\n- [A] / [D] lateral burn\n- [SHIFT] + [W|A|S|D] boosted burn",
    imageLabel: "Burn Forecast",
    viewId: "burn-forecast",
  },
  {
    title: "Climb and Dive",
    body:
      "Use climb to create space and reset geometry.\nUse dive to recover timing and speed.\n- [Space] Climb against gravity\n- [C] Dive into gravity\nThese maneuvers are core tools for transfer and combat positioning.",
    imageLabel: "Energy Maneuvers",
    viewId: "energy-maneuvers",
  },
];

export const TUTORIAL_LEVEL_1_STEP_COPY: Record<string, TutorialStepCopy> = {
  "hold-aurelia-orbit": {
    label: "Stabilize Training Orbit",
    instruction: "Hold the highlighted orbit band around Aurelia.",
  },
  "prograde-burn": {
    label: "Extend the Path [W]",
    instruction: "Apply a forward burn and observe how your projected path extends.",
  },
  "retrograde-burn": {
    label: "Tighten the Path [S]",
    instruction: "Apply a reverse burn and observe how your projected path tightens.",
  },
  "lateral-burn": {
    label: "Shift the Path [A]/[D]",
    instruction: "Apply a lateral burn to slide your projected line across your orbit.",
  },
  "boosted-burn": {
    label: "Boosted Burn Check [SHIFT] + [W|A|S|D]",
    instruction: "Use a boosted burn and compare the stronger forecast with your normal burn line.",
  },
  "climb-burn": {
    label: "Climb Maneuver [SPACE]",
    instruction: "Execute a climb to move into a higher lane and create space. [SPACE]",
  },
  "dive-burn": {
    label: "Dive Maneuver [C]",
    instruction: "Execute a dive to recover timing and speed on your current route. [C]",
  },
  "fundamentals-marker-1": {
    label: "Gate 1",
    instruction: "Cross Gate 1",
  },
  "fundamentals-marker-2": {
    label: "Gate 2",
    instruction: "Cross Gate 2",
  },
  "fundamentals-marker-3": {
    label: "Gate 3",
    instruction: "Cross Gate 3",
  },
  "fundamentals-marker-4": {
    label: "Gate 4",
    instruction: "Cross Gate 4 to complete the local gate circuit.",
  },
  "escape-aurelia": {
    label: "Execute Transfer Break",
    instruction: "Break orbit toward Vesta.",
  },
  "receive-fuel-drone": {
    label: "Hold for Fuel Transfer",
    instruction: "Approach Vesta, enter the fuel lane, and hold steady until transfer starts.",
  },
  "transfer-nadir": {
    label: "Transfer to Nadir",
    instruction: "Transfer to Nadir to complete Tutorial 1. Random gates unlock after completion.",
  },
};

export function getTutorialLevel1StepCopy(
  stepId: string,
  fallback: TutorialStepCopy,
): TutorialStepCopy {
  return TUTORIAL_LEVEL_1_STEP_COPY[stepId] ?? fallback;
}
