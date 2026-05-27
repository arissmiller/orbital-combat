export interface WeaponTarget {
  id: string;
}

export interface WeaponEngagementState {
  progress: number;
}

export function updateWeaponEngagementStates<TTarget extends WeaponTarget>(
  engagementStates: Map<string, WeaponEngagementState>,
  activeTargets: readonly TTarget[],
  canEngage: boolean,
  engageRampUpPerSecond: number,
  engageDecayPerSecond: number,
  deltaSeconds: number,
): void {
  const activeIds = new Set(activeTargets.map((target) => target.id));

  for (const [targetId, state] of engagementStates.entries()) {
    if (canEngage && activeIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * engageDecayPerSecond,
    );

    if (state.progress === 0) {
      engagementStates.delete(targetId);
    }
  }

  if (!canEngage) {
    return;
  }

  for (const target of activeTargets) {
    const state = engagementStates.get(target.id) ?? {
      progress: 0,
    };
    state.progress = Math.min(
      1,
      state.progress + deltaSeconds * engageRampUpPerSecond,
    );
    engagementStates.set(target.id, state);
  }
}

export interface WeaponDischargeAllocation<TTarget extends WeaponTarget> {
  target: TTarget;
  progress: number;
  appliedEnergy: number;
}

export interface ResolveArmedWeaponDischargeOptions<TTarget extends WeaponTarget> {
  weaponArmed: boolean;
  blocked: boolean;
  deltaSeconds: number;
  weaponCharge: number;
  energyCostMultiplier: number;
  dischargePerSecond: number;
  engageStartThreshold: number;
  damageMultiplier: number;
  activeTargets: readonly TTarget[];
  engagementStates: ReadonlyMap<string, WeaponEngagementState>;
}

export interface ResolveArmedWeaponDischargeResult<TTarget extends WeaponTarget> {
  fired: boolean;
  targetCount: number;
  chargePerTarget: number;
  maxDischarge: number;
  nextWeaponCharge: number;
  allocations: WeaponDischargeAllocation<TTarget>[];
}

export function resolveArmedWeaponDischarge<TTarget extends WeaponTarget>(
  options: ResolveArmedWeaponDischargeOptions<TTarget>,
): ResolveArmedWeaponDischargeResult<TTarget> {
  if (
    !options.weaponArmed ||
    options.blocked ||
    options.activeTargets.length === 0 ||
    options.weaponCharge <= 0 ||
    options.energyCostMultiplier <= 0
  ) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      maxDischarge: 0,
      nextWeaponCharge: Math.max(0, options.weaponCharge),
      allocations: [],
    };
  }

  const weightedTargets = options.activeTargets
    .map((target) => ({
      target,
      progress: options.engagementStates.get(target.id)?.progress ?? 0,
    }))
    .filter((entry) => entry.progress > options.engageStartThreshold);
  const totalProgress = weightedTargets.reduce((sum, entry) => sum + entry.progress, 0);

  if (weightedTargets.length === 0 || totalProgress <= 0) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      maxDischarge: 0,
      nextWeaponCharge: Math.max(0, options.weaponCharge),
      allocations: [],
    };
  }

  const maxDischarge = Math.min(
    options.weaponCharge / options.energyCostMultiplier,
    options.deltaSeconds *
      options.dischargePerSecond *
      Math.min(1, totalProgress / weightedTargets.length),
  );
  if (maxDischarge <= 0) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      maxDischarge: 0,
      nextWeaponCharge: Math.max(0, options.weaponCharge),
      allocations: [],
    };
  }

  const chargePerTarget = maxDischarge / weightedTargets.length;
  const nextWeaponCharge = Math.max(
    0,
    options.weaponCharge - maxDischarge * options.energyCostMultiplier,
  );
  const allocations = weightedTargets.map((entry) => ({
    target: entry.target,
    progress: entry.progress,
    appliedEnergy:
      ((maxDischarge * entry.progress) / totalProgress) * options.damageMultiplier,
  }));

  return {
    fired: true,
    targetCount: weightedTargets.length,
    chargePerTarget,
    maxDischarge,
    nextWeaponCharge,
    allocations,
  };
}
