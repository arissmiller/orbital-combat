import { SHIP_SYSTEMS_BALANCE } from "./system-balance";

export type ShipSubsystemKey =
  | "engines"
  | "scanners"
  | "weapons"
  | "defenses";

export interface ShipSubsystemState {
  baseMaxCharge: number;
  charge: number;
  maxCharge: number;
}

export interface ShipSystemsState {
  boosted: ShipSubsystemKey;
  engines: ShipSubsystemState;
  scanners: ShipSubsystemState;
  weapons: ShipSubsystemState;
  defenses: ShipSubsystemState;
}

const SUBSYSTEM_KEYS: readonly ShipSubsystemKey[] = [
  "engines",
  "scanners",
  "weapons",
  "defenses",
];

export function createShipSystemsState(): ShipSystemsState {
  return {
    boosted: "engines",
    engines: createSubsystemState(SHIP_SYSTEMS_BALANCE.engines.fuelCapacity),
    scanners: createSubsystemState(),
    weapons: createSubsystemState(),
    defenses: createSubsystemState(),
  };
}

export function focusSubsystem(
  state: ShipSystemsState,
  subsystem: ShipSubsystemKey,
): void {
  state.boosted = subsystem;
}

export function updateShipSystems(
  state: ShipSystemsState,
  deltaSeconds: number,
): void {
  for (const key of SUBSYSTEM_KEYS) {
    const subsystem = state[key];
    subsystem.maxCharge = getSubsystemMaxCharge(state, key);
    subsystem.charge = clamp(
      subsystem.charge +
        SHIP_SYSTEMS_BALANCE.rechargePerSecond *
          getSubsystemRechargeMultiplier(state, key) *
          deltaSeconds,
      0,
      subsystem.maxCharge,
    );
  }
}

export function getEngineThrustMultiplier(state: ShipSystemsState): number {
  return state.boosted === "engines"
    ? SHIP_SYSTEMS_BALANCE.engines.thrustMultiplier
    : 1;
}

export function getEngineProgradeRetrogradeThrustScale(): number {
  return SHIP_SYSTEMS_BALANCE.engines.progradeRetrogradeThrustScale;
}

export function getEngineLateralThrustScale(): number {
  return SHIP_SYSTEMS_BALANCE.engines.lateralThrustScale;
}

export function getEngineResponseMultiplier(state: ShipSystemsState): number {
  return state.boosted === "engines"
    ? SHIP_SYSTEMS_BALANCE.engines.responseMultiplier
    : 1;
}

export function getEngineSuperBurnMultiplier(state: ShipSystemsState): number {
  return state.boosted === "engines"
    ? SHIP_SYSTEMS_BALANCE.engines.superBurnMultiplier
    : 1;
}

export function getEngineFullBoostMultiplier(): number {
  return SHIP_SYSTEMS_BALANCE.engines.superBurnMultiplier;
}

export function getEngineCruiseOutputCeiling(state: ShipSystemsState): number {
  return state.boosted === "engines"
    ? 1
    : SHIP_SYSTEMS_BALANCE.engines.cruiseOutputCeilingUnfocused;
}

export function getEngineFuelFraction(state: ShipSystemsState): number {
  return state.engines.maxCharge > 0
    ? state.engines.charge / state.engines.maxCharge
    : 0;
}

export function consumeEngineFuel(
  state: ShipSystemsState,
  engineOutput: number,
  deltaSeconds: number,
): number {
  const consumption = Math.max(
    0,
    engineOutput * SHIP_SYSTEMS_BALANCE.engines.fuelBurnPerSecond * deltaSeconds,
  );
  state.engines.charge = clamp(
    state.engines.charge - consumption,
    0,
    state.engines.maxCharge,
  );
  return state.engines.charge;
}

export function refillEngineFuel(
  state: ShipSystemsState,
  fuelAmount: number,
): number {
  state.engines.charge = clamp(
    state.engines.charge + Math.max(0, fuelAmount),
    0,
    state.engines.maxCharge,
  );
  return state.engines.charge;
}

export function getScannerRangeMultiplier(state: ShipSystemsState): number {
  return state.boosted === "scanners"
    ? SHIP_SYSTEMS_BALANCE.scanners.rangeMultiplier
    : 1;
}

export function getScannerLockMultiplier(state: ShipSystemsState): number {
  return state.boosted === "scanners"
    ? SHIP_SYSTEMS_BALANCE.scanners.lockMultiplier
    : 1;
}

export function hasInstantDefenseDisintegratorLocks(state: ShipSystemsState): boolean {
  return (
    state.boosted === "scanners" &&
    SHIP_SYSTEMS_BALANCE.scanners.instantDefenseDisintegratorLocks
  );
}

export function getWeaponRangeMultiplier(state: ShipSystemsState): number {
  return state.boosted === "weapons"
    ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorRangeMultiplier
    : 1;
}

export function getWeaponDamageMultiplier(state: ShipSystemsState): number {
  return state.boosted === "weapons"
    ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorDamageMultiplier
    : 1;
}

export function getWeaponChargeCapacityMultiplier(state: ShipSystemsState): number {
  return state.boosted === "weapons"
    ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorChargeMaxMultiplier
    : 1;
}

export function getWeaponRechargeRateMultiplier(state: ShipSystemsState): number {
  return SHIP_SYSTEMS_BALANCE.weapons.baseRechargeRateMultiplier *
    (state.boosted === "weapons"
      ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorRechargeRateMultiplier
      : 1);
}

export function getWeaponEnergyCostMultiplier(state: ShipSystemsState): number {
  return state.boosted === "weapons"
    ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorEnergyCostMultiplier
    : 1;
}

export function getDefenseEnemyLockMultiplier(state: ShipSystemsState): number {
  return state.boosted === "defenses"
    ? SHIP_SYSTEMS_BALANCE.defenses.enemyLockRateMultiplier
    : 1;
}

export function getDefenseDisintegratorResistanceMultiplier(
  state: ShipSystemsState,
): number {
  return state.boosted === "defenses"
    ? SHIP_SYSTEMS_BALANCE.defenses.disintegratorResistanceMultiplier
    : 1;
}

export function absorbDefenseBeamDamage(
  state: ShipSystemsState,
  incomingDamage: number,
): {
  absorbedDamage: number;
  remainingDamage: number;
  spentCharge: number;
} {
  if (
    state.boosted !== "defenses" ||
    incomingDamage <= 0 ||
    state.defenses.charge <= 0
  ) {
    return {
      absorbedDamage: 0,
      remainingDamage: incomingDamage,
      spentCharge: 0,
    };
  }

  const resistanceMultiplier = getDefenseDisintegratorResistanceMultiplier(state);
  const absorbableDamage = state.defenses.charge * resistanceMultiplier;
  const absorbedDamage = Math.min(incomingDamage, absorbableDamage);
  const spentCharge = absorbedDamage / resistanceMultiplier;

  state.defenses.charge = clamp(
    state.defenses.charge - spentCharge,
    0,
    state.defenses.maxCharge,
  );

  return {
    absorbedDamage,
    remainingDamage: incomingDamage - absorbedDamage,
    spentCharge,
  };
}

export function absorbDefenseTorpedoImpact(state: ShipSystemsState): boolean {
  if (state.boosted !== "defenses") {
    return false;
  }

  const requiredCharge = SHIP_SYSTEMS_BALANCE.defenses.torpedoImpactChargeCost;
  if (state.defenses.charge < requiredCharge) {
    return false;
  }

  state.defenses.charge = clamp(
    state.defenses.charge - requiredCharge,
    0,
    state.defenses.maxCharge,
  );
  return true;
}

function createSubsystemState(baseMaxCharge = 1): ShipSubsystemState {
  return {
    baseMaxCharge,
    charge: baseMaxCharge,
    maxCharge: baseMaxCharge,
  };
}

function getSubsystemMaxCharge(
  state: ShipSystemsState,
  key: ShipSubsystemKey,
): number {
  if (key === "weapons") {
    return state.weapons.baseMaxCharge * getWeaponChargeCapacityMultiplier(state);
  }

  return state[key].baseMaxCharge;
}

function getSubsystemRechargeMultiplier(
  state: ShipSystemsState,
  key: ShipSubsystemKey,
): number {
  if (key === "engines") {
    return 0;
  }

  if (key === "weapons") {
    return getWeaponRechargeRateMultiplier(state);
  }

  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
