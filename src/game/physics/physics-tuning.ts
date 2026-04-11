export interface PhysicsTuning {
  world: {
    gravitationalConstant: number;
    softening: number;
  };
  fixedStep: {
    stepSeconds: number;
    maxAccumulatedSeconds: number;
  };
}

export const PHYSICS_TUNING: PhysicsTuning = {
  world: {
    gravitationalConstant: 750,
    softening: 15,
  },
  fixedStep: {
    stepSeconds: 1 / 120,
    maxAccumulatedSeconds: (1 / 120) * 5,
  },
};
