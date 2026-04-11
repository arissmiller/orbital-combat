export interface CombatBalance {
  disintegrator: {
    dischargePerSecond: number;
    targetAcquireThreshold: number;
    engageStartThreshold: number;
    engageRampUpPerSecond: number;
    engageDecayPerSecond: number;
    torpedoDamageMultiplier: number;
  };
  disruptor: {
    rangeMultiplier: number;
    dischargePerSecond: number;
    targetAcquireThreshold: number;
    engageStartThreshold: number;
    engageRampUpPerSecond: number;
    engageDecayPerSecond: number;
    shieldDamageMultiplier: number;
    shieldDisruptSeconds: number;
    disableSeconds: number;
  };
  torpedoes: {
    durability: number;
    splashRadius: number;
    inheritedSourceLockProgress: number;
    scannerLockDecayPerSecond: number;
    scannerLockBaseRate: number;
    scannerLockChargeFactor: number;
  };
  defenses: {
    durability: number;
    disintegratorLockThreshold: number;
    scannerLockDecayPerSecond: number;
    scannerLockBaseRate: number;
    scannerLockChargeFactor: number;
  };
}

export const COMBAT_BALANCE: CombatBalance = {
  disintegrator: {
    dischargePerSecond: 0.72,
    targetAcquireThreshold: 1,
    engageStartThreshold: 0.02,
    engageRampUpPerSecond: 1.75,
    engageDecayPerSecond: 3.2,
    torpedoDamageMultiplier: 1,
  },
  disruptor: {
    rangeMultiplier: 1.2,
    dischargePerSecond: 0.56,
    targetAcquireThreshold: 0.55,
    engageStartThreshold: 0.02,
    engageRampUpPerSecond: 1.55,
    engageDecayPerSecond: 3.1,
    shieldDamageMultiplier: 1.15,
    shieldDisruptSeconds: 3.4,
    disableSeconds: 4.8,
  },
  torpedoes: {
    durability: 0.016,
    splashRadius: 54,
    inheritedSourceLockProgress: 0.65,
    scannerLockDecayPerSecond: 2.4,
    scannerLockBaseRate: 0.32,
    scannerLockChargeFactor: 0.55,
  },
  defenses: {
    durability: 0.42,
    disintegratorLockThreshold: 0.55,
    scannerLockDecayPerSecond: 1.8,
    scannerLockBaseRate: 0.32,
    scannerLockChargeFactor: 0.55,
  },
};
