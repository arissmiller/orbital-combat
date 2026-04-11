import type { MissionDefinition } from "./mission-definition";
import {
  AURELIA_COMBAT_RANGE_SCENARIO_ID,
  ORBITAL_FLIGHT_TRAINING_SCENARIO_ID,
  SCENARIO_DEFINITIONS,
} from "../scenarios/scenario-definitions";
import { buildMissionDefinitionFromScenario } from "../scenarios/scenario-definition";

export const ORBITAL_FLIGHT_TRAINING_MISSION_ID =
  ORBITAL_FLIGHT_TRAINING_SCENARIO_ID;
export const AURELIA_COMBAT_RANGE_MISSION_ID =
  AURELIA_COMBAT_RANGE_SCENARIO_ID;

export const MISSION_DEFINITIONS: Record<string, MissionDefinition> = Object.fromEntries(
  Object.values(SCENARIO_DEFINITIONS).map((scenario) => [
    scenario.id,
    buildMissionDefinitionFromScenario(scenario),
  ]),
);

export const ORBITAL_FLIGHT_TRAINING_MISSION =
  MISSION_DEFINITIONS[ORBITAL_FLIGHT_TRAINING_MISSION_ID];

export const AURELIA_COMBAT_RANGE_MISSION =
  MISSION_DEFINITIONS[AURELIA_COMBAT_RANGE_MISSION_ID];

export function getMissionDefinition(
  missionId: string,
): MissionDefinition | null {
  return MISSION_DEFINITIONS[missionId] ?? null;
}
