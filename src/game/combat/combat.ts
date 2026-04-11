import { Container, Graphics } from "pixi.js";
import { COMBAT_BALANCE } from "./combat-balance";
import {
  findInterceptFromForecast,
  type InterceptSolution,
} from "../forecasting/intercepts";
import type { CelestialConfig, DefenseConfig } from "../maps/types";
import type { OrbitalBodyState } from "../physics/body";
import type { CollisionEvent, OrbitalWorld } from "../physics/orbital-world";
import type { Vector2Like } from "../physics/vector2";
import type { ShipSystemsState } from "../ships/systems";
import {
  absorbDefenseBeamDamage,
  absorbDefenseTorpedoImpact,
  getDefenseEnemyLockMultiplier,
  getWeaponDamageMultiplier,
  getWeaponEnergyCostMultiplier,
  hasInstantDefenseDisintegratorLocks,
} from "../ships/systems";
import type { TrajectoryForecast } from "../forecasting/forecast-cache";

export interface MissileVisual {
  id: string;
  body: OrbitalBodyState;
  sprite: Graphics;
  sourceId: string;
  lifetimeSeconds: number;
  interceptSolution: InterceptSolution | null;
  detonationElapsedSeconds: number | null;
  neutralizedElapsedSeconds: number | null;
  detonationPosition: Vector2Like | null;
  disintegratorEnergyAbsorbed: number;
  lostTrackSeconds: number;
  splashApplied: boolean;
}

export interface TorpedoLockState {
  progress: number;
  solution: InterceptSolution | null;
}

export interface DefenseLockState {
  progress: number;
}

export interface LauncherState {
  lockProgress: number;
  hasDetection: boolean;
  detectedOccluderId: string | null;
  interceptSolution: InterceptSolution | null;
  beamEngagement: number;
  firing: boolean;
}

export interface PlayerShieldState {
  flash: number;
}

export interface CelestialCombatVisual {
  config: CelestialConfig;
  body: OrbitalBodyState;
}

export interface DefenseCombatVisual {
  config: DefenseConfig;
  body: OrbitalBodyState;
  destroyed: boolean;
  disintegratorEnergyAbsorbed: number;
  shieldCharge: number;
  shieldMaxCharge: number;
  shieldRechargePerSecond: number;
  shieldDisruptedUntilSeconds: number;
  disabledUntilSeconds: number;
  disabledHoldPosition: Vector2Like | null;
}

export type ScannerTargetVisual = CelestialCombatVisual | DefenseCombatVisual;

export interface ScannerContact {
  visual: ScannerTargetVisual;
  distance: number;
  occludedBy: CelestialCombatVisual | null;
  inRange: boolean;
  visible: boolean;
}

export interface TorpedoScannerContact {
  missile: MissileVisual;
  distance: number;
  occludedBy: CelestialCombatVisual | null;
  inRange: boolean;
  visible: boolean;
}

export interface DisintegratorTarget {
  kind: "torpedo" | "defense";
  id: string;
  position: Vector2Like;
  missile?: MissileVisual;
  defense?: DefenseCombatVisual;
}

export interface DisintegratorEngagementState {
  progress: number;
}

export type PlayerWeaponMode = "disintegrator" | "disruptor";

export function createLauncherState(): LauncherState {
  return {
    lockProgress: 0,
    hasDetection: false,
    detectedOccluderId: null,
    interceptSolution: null,
    beamEngagement: 0,
    firing: false,
  };
}

export function isDefenseVisual(
  visual: ScannerTargetVisual,
): visual is DefenseCombatVisual {
  return "scannerRange" in visual.config;
}

export function isCombatDefenseVisual(
  visual: DefenseCombatVisual,
): boolean {
  return visual.config.weaponType !== "station";
}

function isPassiveDefenseWeaponType(
  weaponType: DefenseConfig["weaponType"],
): boolean {
  return weaponType === "station" || weaponType === "target";
}

export function detonateMissile(missile: MissileVisual): void {
  missile.detonationElapsedSeconds = 0;
  missile.neutralizedElapsedSeconds = null;
  missile.detonationPosition = {
    x: missile.body.position.x,
    y: missile.body.position.y,
  };
  missile.body.velocity = { x: 0, y: 0 };
  missile.body.acceleration = { x: 0, y: 0 };

  if (missile.body.propulsion) {
    missile.body.propulsion.throttle = 0;
  }
}

export function neutralizeMissile(missile: MissileVisual): void {
  missile.neutralizedElapsedSeconds = 0;
  missile.detonationElapsedSeconds = null;
  missile.detonationPosition = null;
  missile.splashApplied = true;
  missile.body.velocity = { x: 0, y: 0 };
  missile.body.acceleration = { x: 0, y: 0 };
  missile.body.collisionRadius = 0;

  if (missile.body.propulsion) {
    missile.body.propulsion.throttle = 0;
  }
}

export function disableDefense(
  defense: DefenseCombatVisual,
  elapsedSeconds: number,
  durationSeconds: number,
): void {
  defense.disabledUntilSeconds = Math.max(
    defense.disabledUntilSeconds,
    elapsedSeconds + durationSeconds,
  );

  if (defense.disabledHoldPosition === null) {
    defense.disabledHoldPosition = {
      x: defense.body.position.x,
      y: defense.body.position.y,
    };
  }
}

export function updateLauncherMissiles(options: {
  simulation: OrbitalWorld;
  shipSystems: ShipSystemsState;
  celestialVisuals: readonly CelestialCombatVisual[];
  defenseVisuals: readonly DefenseCombatVisual[];
  defenseCooldowns: Map<string, number>;
  launcherStates: Map<string, LauncherState>;
  playerBeamState: { absorbed: number };
  playerShieldState: PlayerShieldState;
  missileVisuals: MissileVisual[];
  interceptorBody: OrbitalBodyState;
  targetForecast: TrajectoryForecast;
  world: Container;
  stepSeconds: number;
  elapsedSeconds: number;
  nextMissileIdRef: { value: number };
}): void {
  const postInterceptGraceSeconds = 2.0;
  let hostileBeamActive = false;
  const defenseById = new Map(
    options.defenseVisuals.map((defense) => [defense.config.id, defense] as const),
  );

  for (const missile of options.missileVisuals) {
    missile.lifetimeSeconds -= options.stepSeconds;

    if (missile.neutralizedElapsedSeconds !== null) {
      missile.neutralizedElapsedSeconds += options.stepSeconds;
      continue;
    }

    if (missile.detonationElapsedSeconds !== null) {
      if (!missile.splashApplied) {
        tryApplyMissileSplashDamageToShip(
          missile,
          options.interceptorBody,
          options.shipSystems,
          options.playerShieldState,
        );
      }
      missile.detonationElapsedSeconds += options.stepSeconds;
      continue;
    }

    if (missile.body.crashed || !missile.body.propulsion) {
      continue;
    }

    const sourceDefense = defenseById.get(missile.sourceId);
    const interceptSolution = sourceDefense
      ? findInterceptFromForecast({
          forecast: options.targetForecast,
          startTimeSeconds: options.elapsedSeconds,
          sourcePosition: missile.body.position,
          interceptorSpeed: Math.hypot(
            missile.body.velocity.x,
            missile.body.velocity.y,
          ),
          interceptorAcceleration: getTorpedoAcceleration(sourceDefense.config),
          toleranceMultiplier: 1.18,
        })
      : null;
    if (interceptSolution?.confidence === "predicted") {
      missile.interceptSolution = interceptSolution;
      missile.lostTrackSeconds = 0;
    } else {
      missile.lostTrackSeconds += options.stepSeconds;
    }

    const plannedInterceptTime = missile.interceptSolution?.sampleTimeSeconds ?? null;
    if (
      plannedInterceptTime !== null &&
      options.elapsedSeconds > plannedInterceptTime + postInterceptGraceSeconds
    ) {
      detonateMissile(missile);
      continue;
    }

    const desiredHeading = Math.atan2(
      (missile.interceptSolution?.interceptPoint.y ?? options.interceptorBody.position.y) - missile.body.position.y,
      (missile.interceptSolution?.interceptPoint.x ?? options.interceptorBody.position.x) - missile.body.position.x,
    );
    if (
      hasMissileOvershotTarget(
        missile.body.position,
        missile.body.velocity,
        options.interceptorBody.position,
      )
    ) {
      detonateMissile(missile);
      tryApplyMissileSplashDamageToShip(
        missile,
        options.interceptorBody,
        options.shipSystems,
        options.playerShieldState,
      );
      continue;
    }
    missile.body.propulsion.heading = rotateTowardAngle(
      missile.body.propulsion.heading,
      desiredHeading,
      (sourceDefense?.config.torpedoTurnRate ?? 3.6) * options.stepSeconds,
    );
    missile.body.propulsion.throttle = 1;
  }

  for (const defense of options.defenseVisuals) {
    const launcherState = options.launcherStates.get(defense.config.id);

    if (defense.destroyed || isPassiveDefenseWeaponType(defense.config.weaponType)) {
      if (launcherState) {
        resetLauncherState(launcherState);
      }
      continue;
    }

    const currentCooldown = Math.max(
      0,
      (options.defenseCooldowns.get(defense.config.id) ?? 0) - options.stepSeconds,
    );
    options.defenseCooldowns.set(defense.config.id, currentCooldown);

    if (!launcherState) {
      continue;
    }

    if (
      defense.disabledUntilSeconds > options.elapsedSeconds ||
      options.interceptorBody.crashed
    ) {
      resetLauncherState(launcherState);
      continue;
    }

    const distanceToShip = distanceBetween(
      defense.body.position,
      options.interceptorBody.position,
    );
    const parentBody = options.celestialVisuals.find(
      (visual) => visual.config.id === defense.config.parentId,
    )?.body;
    const occluder = findOccludingBodyBetween(
      defense.body.position,
      options.interceptorBody.position,
      options.celestialVisuals,
    );
    const withinSensorArc = parentBody && defense.config.anchorToParent === "dark-side"
      ? isPointWithinDefenseSensorArc(
          defense.body.position,
          parentBody.position,
          parentBody.radius,
          options.interceptorBody.position,
          12,
        )
      : true;
    const hasDetection =
      distanceToShip <= defense.config.scannerRange &&
      occluder === null &&
      withinSensorArc;

    launcherState.hasDetection = hasDetection;
    launcherState.detectedOccluderId = occluder?.config.id ?? null;
    launcherState.firing = false;
    const lockSolution = hasDetection
      ? findInterceptFromForecast({
          forecast: options.targetForecast,
          startTimeSeconds: options.elapsedSeconds,
          sourcePosition: defense.body.position,
          interceptorSpeed: defense.config.torpedoSpeed,
          interceptorAcceleration: getTorpedoAcceleration(defense.config),
        }) ?? null
      : null;
    launcherState.interceptSolution =
      lockSolution?.confidence === "predicted" ? lockSolution : null;

    if (!hasDetection || currentCooldown > 0) {
      launcherState.lockProgress = Math.max(
        0,
        launcherState.lockProgress - options.stepSeconds * 1.6,
      );
      launcherState.beamEngagement = Math.max(
        0,
        launcherState.beamEngagement - options.stepSeconds * 2.6,
      );
      continue;
    }

    launcherState.lockProgress = Math.min(
      defense.config.lockOnSeconds,
      launcherState.lockProgress +
        options.stepSeconds * getDefenseEnemyLockMultiplier(options.shipSystems),
    );

    if (
      launcherState.lockProgress < defense.config.lockOnSeconds ||
      (defense.config.weaponType === "torpedo" && !launcherState.interceptSolution)
    ) {
      launcherState.beamEngagement = Math.max(
        0,
        launcherState.beamEngagement - options.stepSeconds * 2.6,
      );
      continue;
    }

    if (defense.config.weaponType === "beam") {
      if (distanceToShip > defense.config.beamRange) {
        launcherState.beamEngagement = Math.max(
          0,
          launcherState.beamEngagement - options.stepSeconds * 2.6,
        );
        continue;
      }

      hostileBeamActive = true;
      launcherState.firing = true;
      launcherState.beamEngagement = Math.min(
        1,
        launcherState.beamEngagement + options.stepSeconds * 2.2,
      );
      const incomingBeamDamage =
        defense.config.beamDamagePerSecond *
        launcherState.beamEngagement *
        options.stepSeconds;
      const shieldResult = absorbDefenseBeamDamage(
        options.shipSystems,
        incomingBeamDamage,
      );
      if (shieldResult.absorbedDamage > 0) {
        options.playerShieldState.flash = Math.min(
          1,
          options.playerShieldState.flash + shieldResult.absorbedDamage * 3.2,
        );
      }
      options.playerBeamState.absorbed += shieldResult.remainingDamage;

      if (options.playerBeamState.absorbed >= 1 && !options.interceptorBody.crashed) {
        options.interceptorBody.crashed = {
          otherBodyId: defense.config.id,
          relativeSpeed: 0,
        };
      }
      continue;
    }

    const interceptSolution = launcherState.interceptSolution;
    if (!interceptSolution) {
      continue;
    }
    const missileId = `${defense.config.id}:missile:${options.nextMissileIdRef.value}`;
    options.nextMissileIdRef.value += 1;
    const launchHeading = Math.atan2(
      interceptSolution.interceptPoint.y - defense.body.position.y,
      interceptSolution.interceptPoint.x - defense.body.position.x,
    );
    const launchDirection = {
      x: Math.cos(launchHeading),
      y: Math.sin(launchHeading),
    };
    const missileBody = options.simulation.addBody({
      id: missileId,
      mass: 0.18,
      radius: 8,
      collisionRadius: 16,
      systemId: defense.body.systemId,
      affectsGravity: false,
      receivesGravity: false,
      collisionExclusions: [
        defense.config.id,
        defense.config.parentId,
      ],
      position: {
        x: defense.body.position.x + launchDirection.x * (defense.config.radius + 18),
        y: defense.body.position.y + launchDirection.y * (defense.config.radius + 18),
      },
      velocity: {
        x: launchDirection.x * defense.config.torpedoSpeed,
        y: launchDirection.y * defense.config.torpedoSpeed,
      },
      propulsion: {
        heading: launchHeading,
        throttle: 1,
        maxThrust: defense.config.torpedoThrust,
      },
    });
    const sprite = new Graphics()
      .poly([0, -16, 8, 9, 0, 4, -8, 9])
      .fill(0xffb36b)
      .stroke({ color: 0xfff2d6, width: 2, alpha: 0.95 });
    options.world.addChild(sprite);
    options.missileVisuals.push({
      id: missileId,
      body: missileBody,
      sprite,
      sourceId: defense.config.id,
      lifetimeSeconds: 18,
      interceptSolution: { ...interceptSolution },
      detonationElapsedSeconds: null,
      neutralizedElapsedSeconds: null,
      detonationPosition: null,
      disintegratorEnergyAbsorbed: 0,
      lostTrackSeconds: 0,
      splashApplied: false,
    });
    options.defenseCooldowns.set(defense.config.id, defense.config.cooldownSeconds);
    launcherState.lockProgress = 0;
    launcherState.interceptSolution = null;
  }

  if (!hostileBeamActive) {
    options.playerBeamState.absorbed = Math.max(
      0,
      options.playerBeamState.absorbed - options.stepSeconds * 0.28,
    );
  }
}

export function cleanupMissiles(
  simulation: OrbitalWorld,
  missileVisuals: MissileVisual[],
  world: Container,
): void {
  for (let index = missileVisuals.length - 1; index >= 0; index -= 1) {
    const missile = missileVisuals[index];
    const expired = missile.lifetimeSeconds <= 0;
    const crashed = missile.body.crashed !== null;
    const neutralized =
      missile.neutralizedElapsedSeconds !== null &&
      missile.neutralizedElapsedSeconds >= 0.18;
    const detonated =
      missile.detonationElapsedSeconds !== null &&
      missile.detonationElapsedSeconds >= 0.45;

    if (
      crashed &&
      missile.detonationElapsedSeconds === null &&
      missile.neutralizedElapsedSeconds === null
    ) {
      detonateMissile(missile);
    }

    if (!expired && !detonated && !neutralized) {
      continue;
    }

    simulation.removeBody(missile.id);
    world.removeChild(missile.sprite);
    missile.sprite.destroy();
    missileVisuals.splice(index, 1);
  }
}

export function applyCollisionEventsToShip(
  collisionEvents: readonly CollisionEvent[],
  missileVisuals: readonly MissileVisual[],
  interceptorBody: OrbitalBodyState,
  shipSystems: ShipSystemsState,
  playerShieldState: PlayerShieldState,
): void {
  const missileById = new Map(missileVisuals.map((missile) => [missile.id, missile] as const));

  for (const event of collisionEvents) {
    const missileId = event.aId === interceptorBody.id
      ? event.bId
      : event.bId === interceptorBody.id
        ? event.aId
        : null;

    if (!missileId) {
      continue;
    }

    const missile = missileById.get(missileId);

    if (!missile) {
      continue;
    }

    if (missile.neutralizedElapsedSeconds !== null) {
      continue;
    }

    if (missile.detonationElapsedSeconds === null) {
      detonateMissile(missile);
      missile.detonationPosition = {
        x: event.impactPosition.x,
        y: event.impactPosition.y,
      };
    }
    missile.splashApplied = true;

    if (interceptorBody.crashed) {
      continue;
    }

    if (absorbDefenseTorpedoImpact(shipSystems)) {
      playerShieldState.flash = 1;
      continue;
    }

    interceptorBody.crashed = {
      otherBodyId: missileId,
      relativeSpeed: event.relativeSpeed,
    };
    return;
  }
}

export function updateDefenseShieldStates(
  defenseVisuals: readonly DefenseCombatVisual[],
  elapsedSeconds: number,
  deltaSeconds: number,
): void {
  for (const defense of defenseVisuals) {
    if (defense.destroyed || defense.shieldMaxCharge <= 0) {
      continue;
    }

    if (defense.shieldDisruptedUntilSeconds > elapsedSeconds) {
      continue;
    }

    defense.shieldCharge = Math.min(
      defense.shieldMaxCharge,
      defense.shieldCharge + defense.shieldRechargePerSecond * deltaSeconds,
    );
  }
}

export function applyDefenseStatusOverrides(
  defenseVisuals: readonly DefenseCombatVisual[],
  launcherStates: ReadonlyMap<string, LauncherState>,
  elapsedSeconds: number,
): void {
  for (const defense of defenseVisuals) {
    const launcherState = launcherStates.get(defense.config.id);

    if (defense.destroyed) {
      defense.disabledHoldPosition = null;
      if (launcherState) {
        resetLauncherState(launcherState);
      }
      continue;
    }

    if (defense.disabledUntilSeconds > elapsedSeconds && defense.disabledHoldPosition) {
      defense.body.position = {
        x: defense.disabledHoldPosition.x,
        y: defense.disabledHoldPosition.y,
      };
      defense.body.velocity = { x: 0, y: 0 };
      defense.body.acceleration = { x: 0, y: 0 };

      if (launcherState) {
        resetLauncherState(launcherState);
      }
      continue;
    }

    defense.disabledHoldPosition = null;
  }
}

export function updateDisintegratorEngagementStates(
  disintegratorEngagementStates: Map<string, DisintegratorEngagementState>,
  activeTargets: readonly DisintegratorTarget[],
  canEngage: boolean,
  engageRampUpPerSecond: number,
  engageDecayPerSecond: number,
  deltaSeconds: number,
): void {
  const activeIds = new Set(activeTargets.map((target) => target.id));

  for (const [targetId, state] of disintegratorEngagementStates.entries()) {
    if (canEngage && activeIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * engageDecayPerSecond,
    );

    if (state.progress === 0) {
      disintegratorEngagementStates.delete(targetId);
    }
  }

  if (!canEngage) {
    return;
  }

  for (const target of activeTargets) {
    const state = disintegratorEngagementStates.get(target.id) ?? {
      progress: 0,
    };
    state.progress = Math.min(
      1,
      state.progress + deltaSeconds * engageRampUpPerSecond,
    );
    disintegratorEngagementStates.set(target.id, state);
  }
}

export function resolveArmedDisintegrator(options: {
  weaponArmed: boolean;
  isPaused: boolean;
  isCrashed: boolean;
  deltaSeconds: number;
  shipSystems: ShipSystemsState;
  activeTargets: readonly DisintegratorTarget[];
  disintegratorEngagementStates: ReadonlyMap<string, DisintegratorEngagementState>;
}): {
  fired: boolean;
  targetCount: number;
  chargePerTarget: number;
  neutralizedTorpedoCount: number;
} {
  if (
    !options.weaponArmed ||
    options.isPaused ||
    options.isCrashed ||
    options.activeTargets.length === 0 ||
    options.shipSystems.weapons.charge <= 0
  ) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      neutralizedTorpedoCount: 0,
    };
  }

  const weightedTargets = options.activeTargets
    .map((target) => ({
      target,
      progress: options.disintegratorEngagementStates.get(target.id)?.progress ?? 0,
    }))
    .filter((entry) => entry.progress > COMBAT_BALANCE.disintegrator.engageStartThreshold);
  const totalProgress = weightedTargets.reduce((sum, entry) => sum + entry.progress, 0);

  if (weightedTargets.length === 0 || totalProgress <= 0) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      neutralizedTorpedoCount: 0,
    };
  }

  const maxDischarge = Math.min(
    options.shipSystems.weapons.charge / getWeaponEnergyCostMultiplier(options.shipSystems),
    options.deltaSeconds *
      COMBAT_BALANCE.disintegrator.dischargePerSecond *
      Math.min(1, totalProgress / weightedTargets.length),
  );
  const chargePerTarget = maxDischarge / weightedTargets.length;

  options.shipSystems.weapons.charge = Math.max(
    0,
    options.shipSystems.weapons.charge -
      maxDischarge * getWeaponEnergyCostMultiplier(options.shipSystems),
  );

  let neutralizedTorpedoCount = 0;
  for (const { target, progress } of weightedTargets) {
    const appliedEnergy =
      ((maxDischarge * progress) / totalProgress) *
      getWeaponDamageMultiplier(options.shipSystems);

    if (target.kind === "torpedo" && target.missile) {
      const missile = target.missile;

      if (
        missile.detonationElapsedSeconds !== null ||
        missile.neutralizedElapsedSeconds !== null ||
        missile.body.crashed
      ) {
        continue;
      }

      missile.disintegratorEnergyAbsorbed +=
        appliedEnergy * COMBAT_BALANCE.disintegrator.torpedoDamageMultiplier;

      if (missile.disintegratorEnergyAbsorbed >= COMBAT_BALANCE.torpedoes.durability) {
        neutralizeMissile(missile);
        neutralizedTorpedoCount += 1;
      }
      continue;
    }

    if (target.kind === "defense" && target.defense && !target.defense.destroyed) {
      target.defense.disintegratorEnergyAbsorbed += appliedEnergy;

      if (target.defense.disintegratorEnergyAbsorbed >= COMBAT_BALANCE.defenses.durability) {
        target.defense.destroyed = true;
      }
    }
  }

  return {
    fired: true,
    targetCount: weightedTargets.length,
    chargePerTarget,
    neutralizedTorpedoCount,
  };
}

export function resolveArmedDisruptor(options: {
  weaponArmed: boolean;
  isPaused: boolean;
  isCrashed: boolean;
  deltaSeconds: number;
  elapsedSeconds: number;
  shipSystems: ShipSystemsState;
  activeTargets: readonly DisintegratorTarget[];
  disintegratorEngagementStates: ReadonlyMap<string, DisintegratorEngagementState>;
}): {
  fired: boolean;
  targetCount: number;
  chargePerTarget: number;
  neutralizedTorpedoCount: number;
} {
  if (
    !options.weaponArmed ||
    options.isPaused ||
    options.isCrashed ||
    options.activeTargets.length === 0 ||
    options.shipSystems.weapons.charge <= 0
  ) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      neutralizedTorpedoCount: 0,
    };
  }

  const weightedTargets = options.activeTargets
    .map((target) => ({
      target,
      progress: options.disintegratorEngagementStates.get(target.id)?.progress ?? 0,
    }))
    .filter((entry) => entry.progress > COMBAT_BALANCE.disruptor.engageStartThreshold);
  const totalProgress = weightedTargets.reduce((sum, entry) => sum + entry.progress, 0);

  if (weightedTargets.length === 0 || totalProgress <= 0) {
    return {
      fired: false,
      targetCount: 0,
      chargePerTarget: 0,
      neutralizedTorpedoCount: 0,
    };
  }

  const maxDischarge = Math.min(
    options.shipSystems.weapons.charge / getWeaponEnergyCostMultiplier(options.shipSystems),
    options.deltaSeconds *
      COMBAT_BALANCE.disruptor.dischargePerSecond *
      Math.min(1, totalProgress / weightedTargets.length),
  );
  const chargePerTarget = maxDischarge / weightedTargets.length;

  options.shipSystems.weapons.charge = Math.max(
    0,
    options.shipSystems.weapons.charge -
      maxDischarge * getWeaponEnergyCostMultiplier(options.shipSystems),
  );

  for (const { target, progress } of weightedTargets) {
    if (target.kind !== "defense" || !target.defense || target.defense.destroyed) {
      continue;
    }

    const defense = target.defense;
    const appliedEnergy =
      ((maxDischarge * progress) / totalProgress) *
      getWeaponDamageMultiplier(options.shipSystems);

    if (defense.shieldCharge > 0) {
      const shieldDamage = appliedEnergy * COMBAT_BALANCE.disruptor.shieldDamageMultiplier;
      const absorbedShieldDamage = Math.min(defense.shieldCharge, shieldDamage);
      defense.shieldCharge = Math.max(0, defense.shieldCharge - absorbedShieldDamage);
      defense.shieldDisruptedUntilSeconds = Math.max(
        defense.shieldDisruptedUntilSeconds,
        options.elapsedSeconds + COMBAT_BALANCE.disruptor.shieldDisruptSeconds,
      );

      if (defense.shieldCharge > 0) {
        continue;
      }
    }

    disableDefense(defense, options.elapsedSeconds, COMBAT_BALANCE.disruptor.disableSeconds);
  }

  return {
    fired: true,
    targetCount: weightedTargets.length,
    chargePerTarget,
    neutralizedTorpedoCount: 0,
  };
}

export function classifyTorpedoScannerContact(
  origin: Vector2Like,
  missile: MissileVisual,
  bodies: readonly CelestialCombatVisual[],
  scannerRange: number,
): TorpedoScannerContact {
  if (missile.neutralizedElapsedSeconds !== null) {
    return {
      missile,
      distance: Number.POSITIVE_INFINITY,
      occludedBy: null,
      inRange: false,
      visible: false,
    };
  }

  const position = missile.detonationPosition ?? missile.body.position;
  const distance = distanceBetween(origin, position);
  const inRange = distance <= scannerRange;
  const occludedBy = inRange
    ? findOccludingBodyBetween(origin, position, bodies, missile.id)
    : null;

  return {
    missile,
    distance,
    occludedBy,
    inRange,
    visible: inRange && occludedBy === null,
  };
}

export function updateTorpedoScannerLocks(
  torpedoLockStates: Map<string, TorpedoLockState>,
  torpedoContacts: readonly TorpedoScannerContact[],
  defenseLockStates: ReadonlyMap<string, DefenseLockState>,
  shipSystems: ShipSystemsState,
  scannerLockMultiplier: number,
  deltaSeconds: number,
): void {
  const trackedIds = new Set<string>();
  const hasInstantLocks = hasInstantDefenseDisintegratorLocks(shipSystems);

  for (const contact of torpedoContacts) {
    const sourceDefenseLock =
      defenseLockStates.get(contact.missile.sourceId)?.progress ?? 0;
    const inheritsSourceLock =
      contact.inRange &&
      sourceDefenseLock >= COMBAT_BALANCE.defenses.disintegratorLockThreshold;

    if (!contact.visible && !inheritsSourceLock) {
      continue;
    }

    trackedIds.add(contact.missile.id);
    const state = torpedoLockStates.get(contact.missile.id) ?? {
      progress: 0,
      solution: null,
    };
    const inheritedProgress = inheritsSourceLock
      ? COMBAT_BALANCE.torpedoes.inheritedSourceLockProgress
      : 0;
    const baseProgress = Math.max(state.progress, inheritedProgress);
    state.progress = hasInstantLocks
      ? 1
      : contact.visible
        ? Math.min(
            1,
            baseProgress +
              deltaSeconds *
                scannerLockMultiplier *
                (COMBAT_BALANCE.torpedoes.scannerLockBaseRate +
                  shipSystems.scanners.charge *
                    COMBAT_BALANCE.torpedoes.scannerLockChargeFactor),
          )
        : baseProgress;
    state.solution = contact.missile.interceptSolution;
    torpedoLockStates.set(contact.missile.id, state);
  }

  for (const [targetId, state] of torpedoLockStates.entries()) {
    if (trackedIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * COMBAT_BALANCE.torpedoes.scannerLockDecayPerSecond,
    );

    if (state.progress === 0) {
      torpedoLockStates.delete(targetId);
    }
  }
}

export function updateDefenseScannerLocks(
  defenseLockStates: Map<string, DefenseLockState>,
  visibleDefenseContacts: readonly ScannerContact[],
  scannerCharge: number,
  scannerLockMultiplier: number,
  deltaSeconds: number,
): void {
  const visibleIds = new Set(
    visibleDefenseContacts
      .filter((contact) => isDefenseVisual(contact.visual))
      .map((contact) => contact.visual.config.id),
  );

  for (const [targetId, state] of defenseLockStates.entries()) {
    if (visibleIds.has(targetId)) {
      continue;
    }

    state.progress = Math.max(
      0,
      state.progress - deltaSeconds * COMBAT_BALANCE.defenses.scannerLockDecayPerSecond,
    );

    if (state.progress === 0) {
      defenseLockStates.delete(targetId);
    }
  }

  for (const contact of visibleDefenseContacts) {
    if (!isDefenseVisual(contact.visual)) {
      continue;
    }

    const state = defenseLockStates.get(contact.visual.config.id) ?? {
      progress: 0,
    };
    state.progress = Math.min(
      1,
      state.progress +
        deltaSeconds *
          scannerLockMultiplier *
          (COMBAT_BALANCE.defenses.scannerLockBaseRate +
            scannerCharge * COMBAT_BALANCE.defenses.scannerLockChargeFactor),
    );
    defenseLockStates.set(contact.visual.config.id, state);
  }
}

export function classifyScannerContact(
  origin: Vector2Like,
  target: ScannerTargetVisual,
  bodies: readonly CelestialCombatVisual[],
  scannerRange: number,
): ScannerContact {
  const distance = distanceBetween(origin, target.body.position);
  const inRange = distance <= scannerRange;
  const occludedBy = inRange ? findOccludingBody(origin, target, bodies) : null;

  return {
    visual: target,
    distance,
    occludedBy,
    inRange,
    visible: inRange && occludedBy === null,
  };
}

function resetLauncherState(launcherState: LauncherState): void {
  launcherState.lockProgress = 0;
  launcherState.hasDetection = false;
  launcherState.detectedOccluderId = null;
  launcherState.interceptSolution = null;
  launcherState.beamEngagement = 0;
  launcherState.firing = false;
}

function findOccludingBody(
  origin: Vector2Like,
  target: ScannerTargetVisual,
  bodies: readonly CelestialCombatVisual[],
): CelestialCombatVisual | null {
  return findOccludingBodyBetween(origin, target.body.position, bodies, target.body.id);
}

function findOccludingBodyBetween(
  start: Vector2Like,
  end: Vector2Like,
  bodies: readonly CelestialCombatVisual[],
  ignoredBodyId?: string,
): CelestialCombatVisual | null {
  for (const body of bodies) {
    if (body.config.id === ignoredBodyId) {
      continue;
    }

    if (
      segmentIntersectsCircle(
        start,
        end,
        body.body.position,
        body.body.radius * 1.05,
      )
    ) {
      return body;
    }
  }

  return null;
}

function segmentIntersectsCircle(
  start: Vector2Like,
  end: Vector2Like,
  center: Vector2Like,
  radius: number,
): boolean {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;

  if (segmentLengthSquared <= 0.0001) {
    return distanceBetween(start, center) <= radius;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((center.x - start.x) * segment.x + (center.y - start.y) * segment.y) /
        segmentLengthSquared,
    ),
  );
  const closest = {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
  };

  return distanceBetween(closest, center) <= radius;
}

function getTorpedoAcceleration(defense: DefenseConfig): number {
  const torpedoMass = 0.18;
  return defense.torpedoThrust / torpedoMass;
}

function tryApplyMissileSplashDamageToShip(
  missile: MissileVisual,
  interceptorBody: OrbitalBodyState,
  shipSystems: ShipSystemsState,
  playerShieldState: PlayerShieldState,
): void {
  if (missile.splashApplied || interceptorBody.crashed) {
    return;
  }

  const detonationPosition = missile.detonationPosition ?? missile.body.position;
  const distanceToShip = distanceBetween(detonationPosition, interceptorBody.position);

  if (distanceToShip > COMBAT_BALANCE.torpedoes.splashRadius) {
    missile.splashApplied = true;
    return;
  }

  missile.splashApplied = true;

  if (absorbDefenseTorpedoImpact(shipSystems)) {
    playerShieldState.flash = 1;
    return;
  }

  interceptorBody.crashed = {
    otherBodyId: missile.id,
    relativeSpeed: 0,
  };
}

function hasMissileOvershotTarget(
  missilePosition: Vector2Like,
  missileVelocity: Vector2Like,
  targetPosition: Vector2Like,
): boolean {
  const speed = Math.hypot(missileVelocity.x, missileVelocity.y);

  if (speed <= 0.001) {
    return false;
  }

  const toTarget = {
    x: targetPosition.x - missilePosition.x,
    y: targetPosition.y - missilePosition.y,
  };

  return toTarget.x * missileVelocity.x + toTarget.y * missileVelocity.y < 0;
}

function rotateTowardAngle(
  current: number,
  target: number,
  maxDelta: number,
): number {
  const delta = normalizeAngle(target - current);

  if (Math.abs(delta) <= maxDelta) {
    return target;
  }

  return current + Math.sign(delta) * maxDelta;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;

  while (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}

function getDefenseSensorHalfAngle(
  defensePosition: Vector2Like,
  parentPosition: Vector2Like,
  parentRadius: number,
  bonusDegrees: number,
): number {
  const distanceFromParent = distanceBetween(defensePosition, parentPosition);
  const clampedRatio = Math.max(
    -1,
    Math.min(1, parentRadius / Math.max(distanceFromParent, parentRadius)),
  );
  const tangentHalfAngle = Math.acos(clampedRatio);
  return tangentHalfAngle + (bonusDegrees * Math.PI) / 180;
}

function isPointWithinDefenseSensorArc(
  defensePosition: Vector2Like,
  parentPosition: Vector2Like,
  parentRadius: number,
  targetPosition: Vector2Like,
  bonusDegrees: number,
): boolean {
  const outwardHeading = Math.atan2(
    defensePosition.y - parentPosition.y,
    defensePosition.x - parentPosition.x,
  );
  const targetHeading = Math.atan2(
    targetPosition.y - defensePosition.y,
    targetPosition.x - defensePosition.x,
  );
  const halfAngle = getDefenseSensorHalfAngle(
    defensePosition,
    parentPosition,
    parentRadius,
    bonusDegrees,
  );
  return Math.abs(normalizeAngle(targetHeading - outwardHeading)) <= halfAngle;
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
