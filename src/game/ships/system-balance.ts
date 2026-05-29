export interface ShipSystemsBalance {
  rechargePerSecond: number;
  weapons: {
    disintegratorRangeMultiplier: number;
    disintegratorDamageMultiplier: number;
    disintegratorChargeMaxMultiplier: number;
    disintegratorRechargeRateMultiplier: number;
    baseRechargeRateMultiplier: number;
    disintegratorEnergyCostMultiplier: number;
  };
  defenses: {
    enemyLockRateMultiplier: number;
    disintegratorResistanceMultiplier: number;
    torpedoImpactChargeCost: number;
  };
  engines: {
    fuelCapacity: number;
    thrustMultiplier: number;
    progradeRetrogradeThrustScale: number;
    lateralThrustScale: number;
    cruiseOutputCeilingUnfocused: number;
    responseMultiplier: number;
    superBurnMultiplier: number;
    fuelBurnPerSecond: number;
  };
  scanners: {
    rangeMultiplier: number;
    lockMultiplier: number;
    instantDefenseDisintegratorLocks: boolean;
  };
}

// Central tuning surface for the simplified boosted-system model.
export const SHIP_SYSTEMS_BALANCE: ShipSystemsBalance = {
  rechargePerSecond: 0.36,
  weapons: {
    disintegratorRangeMultiplier: 1.75,
    disintegratorDamageMultiplier: 1.5,
    disintegratorChargeMaxMultiplier: 1.5,
    disintegratorRechargeRateMultiplier: 1.5,
    baseRechargeRateMultiplier: 0.4,
    disintegratorEnergyCostMultiplier: 1.5,
  },
  defenses: {
    enemyLockRateMultiplier: 0.68,
    disintegratorResistanceMultiplier: 1.25,
    torpedoImpactChargeCost: 0.62,
  },
  engines: {
    fuelCapacity: 10,
    thrustMultiplier: 2,
    progradeRetrogradeThrustScale: 1,
    lateralThrustScale: 1,
    cruiseOutputCeilingUnfocused: 1,
    responseMultiplier: 2,
    superBurnMultiplier: 2.8,
    fuelBurnPerSecond: 0.01,
  },
  scanners: {
    rangeMultiplier: 1.5,
    lockMultiplier: 6,
    instantDefenseDisintegratorLocks: true,
  },
};
