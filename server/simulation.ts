import type {
  PlayerWeaponMode,
  PlayerInputCommand,
  SimCelestialBodySnapshot,
  SimulationSnapshot,
} from "./protocol.js";
import {
  createMultiplayerMapRuntime,
  evaluateMultiplayerMap,
  getDefaultMultiplayerMapDefinition,
  type MultiplayerMapDefinition,
  type MultiplayerMapRuntime,
} from "./map.js";
import {
  buildSimPlayerSnapshots,
  createSpawnedPlayers,
  DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  round3,
  stepMultiplayerPlayers,
  type MultiplayerSimPlayerState,
} from "../shared/multiplayer-simulation-core.js";
import { computePlayerWarningChannels } from "./player-warning-channels.js";

const SPAWN_RADIUS_FALLBACK = 180;
const PLAYER_RESPAWN_DELAY_SECONDS = 2.25;
const PLAYER_RESPAWN_GRACE_SECONDS = 1.35;
const RESPAWN_PLAYER_CLEARANCE = 110;
const RESPAWN_CELESTIAL_CLEARANCE_PADDING = 42;

// Damage model: each unit of impact speed deals this many HP of damage
const COLLISION_DAMAGE_PER_SPEED = 50;
// Below this impact speed no damage is applied (brushing contact)
const COLLISION_MIN_DAMAGE_SPEED = 0.05;
// One full charge (1.0) of the defenses subsystem can absorb this many HP
const SHIELD_CHARGE_TO_HP = 100;
// When defenses subsystem is boosted, shield absorption is multiplied
const SHIELD_BOOSTED_MULTIPLIER = 1.5;
const PLAYER_BASE_SCANNER_RANGE = 5400;
const PLAYER_SCANNER_BOOST_RANGE_MULTIPLIER = 1.5;
const PLAYER_SCANNER_OCCLUDER_RADIUS_MULTIPLIER = 1.05;
const PLAYER_SCANNER_LOCK_DECAY_PER_SECOND = 1.8;
const PLAYER_SCANNER_LOCK_BASE_RATE = 1.2;
const PLAYER_SCANNER_LOCK_CHARGE_FACTOR = 1.7;
const PLAYER_SCANNER_BOOST_LOCK_MULTIPLIER = 6;
const PLAYER_SCANNER_INSTANT_LOCK_WHEN_BOOSTED = true;
const PLAYER_BASE_DISINTEGRATOR_RANGE = 280;
const PLAYER_WEAPON_BOOST_RANGE_MULTIPLIER = 1.75;
const PLAYER_WEAPON_BOOST_DAMAGE_MULTIPLIER = 1.5;
const PLAYER_WEAPON_BOOST_ENERGY_COST_MULTIPLIER = 1.5;
const DISRUPTOR_RANGE_MULTIPLIER = 1.2;
const DISINTEGRATOR_DISCHARGE_PER_SECOND = 0.72;
const DISRUPTOR_DISCHARGE_PER_SECOND = 0.56;
const DISINTEGRATOR_TARGET_ACQUIRE_THRESHOLD = 1;
const DISRUPTOR_TARGET_ACQUIRE_THRESHOLD = 0.55;
const DISINTEGRATOR_ENGAGE_START_THRESHOLD = 0.02;
const DISRUPTOR_ENGAGE_START_THRESHOLD = 0.02;
const DISINTEGRATOR_ENGAGE_RAMP_UP_PER_SECOND = 1.75;
const DISRUPTOR_ENGAGE_RAMP_UP_PER_SECOND = 1.55;
const DISINTEGRATOR_ENGAGE_DECAY_PER_SECOND = 3.2;
const DISRUPTOR_ENGAGE_DECAY_PER_SECOND = 3.1;
const DISRUPTOR_SHIELD_DAMAGE_MULTIPLIER = 1.15;
const DISRUPTOR_DISABLE_SECONDS = 4.8;
const PLAYER_DISINTEGRATOR_DURABILITY = 0.42;

export interface RoomSimulationState {
  roomCode: string;
  tick: number;
  elapsedSeconds: number;
  mapDefinition: MultiplayerMapDefinition;
  mapRuntime: MultiplayerMapRuntime;
  celestialBodies: SimCelestialBodySnapshot[];
  players: Map<string, MultiplayerSimPlayerState>;
  playerScannerLocks: Map<string, Map<string, number>>;
  playerWeaponEngagements: Map<string, Map<string, number>>;
}

export function createRoomSimulation(
  roomCode: string,
  playerIds: string[],
  mapDefinition = getDefaultMultiplayerMapDefinition(),
): RoomSimulationState {
  const mapRuntime = createMultiplayerMapRuntime(mapDefinition);
  const initialCelestialBodies = evaluateMultiplayerMap(mapRuntime, 0);
  const primaryBody =
    initialCelestialBodies.find((body) => body.parentId === null)
    ?? initialCelestialBodies[0]
    ?? null;
  const spawnRadius =
    mapDefinition.spawnOrbitRadius > 0
      ? mapDefinition.spawnOrbitRadius
      : SPAWN_RADIUS_FALLBACK;
  const players = createSpawnedPlayers(playerIds, {
    spawnCenterX: primaryBody?.x ?? 0,
    spawnCenterY: primaryBody?.y ?? 0,
    spawnRadius,
    spawnOrbitDirection: mapDefinition.spawnOrbitDirection,
    primaryMass: primaryBody?.mass ?? null,
  });
  for (const player of players.values()) {
    armPlayerForLife(player, PLAYER_RESPAWN_GRACE_SECONDS);
  }

  return {
    roomCode,
    tick: 0,
    elapsedSeconds: 0,
    mapDefinition,
    mapRuntime,
    celestialBodies: initialCelestialBodies,
    players,
    playerScannerLocks: createPlayerScannerLockState(players.keys()),
    playerWeaponEngagements: createPlayerWeaponEngagementState(players.keys()),
  };
}

export function removePlayerFromSimulation(
  simulation: RoomSimulationState,
  playerId: string,
): void {
  simulation.players.delete(playerId);
  simulation.playerScannerLocks.delete(playerId);
  simulation.playerWeaponEngagements.delete(playerId);
  for (const locksByTarget of simulation.playerScannerLocks.values()) {
    locksByTarget.delete(playerId);
  }
  for (const engagementsByTarget of simulation.playerWeaponEngagements.values()) {
    engagementsByTarget.delete(playerId);
  }
}

export function addPlayerToSimulation(
  simulation: RoomSimulationState,
  playerId: string,
): boolean {
  if (simulation.players.has(playerId)) {
    return false;
  }

  const primaryBody =
    simulation.celestialBodies.find((body) => body.parentId === null)
    ?? simulation.celestialBodies[0]
    ?? null;
  const spawnRadius =
    simulation.mapDefinition.spawnOrbitRadius > 0
      ? simulation.mapDefinition.spawnOrbitRadius
      : SPAWN_RADIUS_FALLBACK;
  const spawnCenterX = primaryBody?.x ?? 0;
  const spawnCenterY = primaryBody?.y ?? 0;
  const spawnedPlayers = createSpawnedPlayers([playerId], {
    spawnCenterX,
    spawnCenterY,
    spawnRadius,
    spawnOrbitDirection: simulation.mapDefinition.spawnOrbitDirection,
    primaryMass: primaryBody?.mass ?? null,
  });
  const spawnedPlayer = spawnedPlayers.get(playerId);
  if (!spawnedPlayer) {
    return false;
  }

  const spawnAngle = pickDropInSpawnAngle(
    simulation,
    spawnCenterX,
    spawnCenterY,
    spawnRadius,
  );
  const orbitDirectionSign =
    simulation.mapDefinition.spawnOrbitDirection === "ccw" ? -1 : 1;
  const tangentAngle = spawnAngle + orbitDirectionSign * (Math.PI * 0.5);
  const orbitalSpeed = Math.hypot(spawnedPlayer.vx, spawnedPlayer.vy);

  spawnedPlayer.x = spawnCenterX + Math.cos(spawnAngle) * spawnRadius;
  spawnedPlayer.y = spawnCenterY + Math.sin(spawnAngle) * spawnRadius;
  spawnedPlayer.vx = Math.cos(tangentAngle) * orbitalSpeed;
  spawnedPlayer.vy = Math.sin(tangentAngle) * orbitalSpeed;
  spawnedPlayer.heading = tangentAngle;
  spawnedPlayer.stableMotionHeading = tangentAngle;
  spawnedPlayer.lastProcessedInputSequence = null;
  spawnedPlayer.throttle = 0;
  spawnedPlayer.thrustHeading = null;
  spawnedPlayer.superBurnActive = false;
  armPlayerForLife(spawnedPlayer, PLAYER_RESPAWN_GRACE_SECONDS);

  simulation.players.set(playerId, spawnedPlayer);
  simulation.playerScannerLocks.set(playerId, new Map());
  simulation.playerWeaponEngagements.set(playerId, new Map());
  for (const [observerId, locksByTarget] of simulation.playerScannerLocks.entries()) {
    if (observerId === playerId) {
      continue;
    }
    locksByTarget.delete(playerId);
  }
  for (const [observerId, engagementsByTarget] of simulation.playerWeaponEngagements.entries()) {
    if (observerId === playerId) {
      continue;
    }
    engagementsByTarget.delete(playerId);
  }
  return true;
}

export function stepRoomSimulation(
  simulation: RoomSimulationState,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
  stepSeconds: number,
): void {
  simulation.tick += 1;
  simulation.elapsedSeconds += stepSeconds;
  simulation.celestialBodies = evaluateMultiplayerMap(
    simulation.mapRuntime,
    simulation.elapsedSeconds,
  );
  stepMultiplayerPlayers(
    simulation.players,
    inputByPlayerId,
    simulation.celestialBodies,
    stepSeconds,
    DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  );
  updatePlayerLifeStates(simulation);
  updatePlayerScannerLocks(simulation, stepSeconds);
  applyPlayerWeaponSystems(simulation, stepSeconds);
}

export function buildSimulationSnapshot(
  simulation: RoomSimulationState,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
): SimulationSnapshot {
  const warningChannels = computePlayerWarningChannels(
    simulation.players,
    inputByPlayerId,
    simulation.celestialBodies,
  );
  const scannerChannels = computePlayerScannerChannels(
    simulation.players,
    simulation.celestialBodies,
    simulation.playerScannerLocks,
  );

  const playerSnapshots = buildSimPlayerSnapshots(simulation.players);
  for (const player of playerSnapshots) {
    const scanner = scannerChannels.get(player.playerId);
    if (scanner) {
      player.scanner = scanner;
    }

    const warnings = warningChannels.get(player.playerId);
    if (warnings && warnings.length > 0) {
      player.warnings = warnings;
    }
  }

  return {
    roomCode: simulation.roomCode,
    tick: simulation.tick,
    sentAtMs: Date.now(),
    players: playerSnapshots,
    mapId: simulation.mapDefinition.id,
    celestialBodies: simulation.celestialBodies.map((body) => ({
      id: body.id,
      name: body.name,
      parentId: body.parentId,
      x: round3(body.x),
      y: round3(body.y),
      vx: round3(body.vx),
      vy: round3(body.vy),
      mass: round3(body.mass),
      radius: round3(body.radius),
      orbitEccentricity: round3(body.orbitEccentricity),
    })),
  };
}

function computePlayerScannerChannels(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
  celestialBodies: readonly SimCelestialBodySnapshot[],
  playerScannerLocks: ReadonlyMap<string, ReadonlyMap<string, number>>,
): Map<
  string,
  {
    range: number;
    contacts: Array<{
      targetPlayerId: string;
      distance: number;
      inRange: boolean;
      visible: boolean;
      occludedByCelestialId: string | null;
      lockProgress: number;
      registered: boolean;
    }>;
  }
> {
  const channels = new Map<
    string,
    {
      range: number;
      contacts: Array<{
        targetPlayerId: string;
        distance: number;
        inRange: boolean;
        visible: boolean;
        occludedByCelestialId: string | null;
        lockProgress: number;
        registered: boolean;
      }>;
    }
  >();
  const playersList = [...players.values()];

  for (const player of playersList) {
    const scannerRange = resolvePlayerScannerRange(player);
    const contacts: Array<{
      targetPlayerId: string;
      distance: number;
      inRange: boolean;
      visible: boolean;
      occludedByCelestialId: string | null;
      lockProgress: number;
      registered: boolean;
    }> = [];
    const lockStatesByTarget = playerScannerLocks.get(player.playerId);

    for (const target of playersList) {
      if (target.playerId === player.playerId || target.life?.alive === false) {
        continue;
      }

      const distance = Math.hypot(target.x - player.x, target.y - player.y);
      const inRange = distance <= scannerRange;
      const occludedByCelestialId = inRange
        ? findOccludingCelestialBodyId(
            { x: player.x, y: player.y },
            { x: target.x, y: target.y },
            celestialBodies,
          )
        : null;
      const lockProgress = Math.max(0, Math.min(1, lockStatesByTarget?.get(target.playerId) ?? 0));
      const visible = inRange && occludedByCelestialId === null;

      contacts.push({
        targetPlayerId: target.playerId,
        distance: round3(distance),
        inRange,
        visible,
        occludedByCelestialId,
        lockProgress: round3(lockProgress),
        registered: visible || lockProgress > 0,
      });
    }

    contacts.sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.targetPlayerId.localeCompare(right.targetPlayerId);
    });

    channels.set(player.playerId, {
      range: round3(scannerRange),
      contacts,
    });
  }

  return channels;
}

function resolvePlayerScannerRange(player: MultiplayerSimPlayerState): number {
  const boostedMultiplier = player.systems?.boosted === "scanners"
    ? PLAYER_SCANNER_BOOST_RANGE_MULTIPLIER
    : 1;
  return PLAYER_BASE_SCANNER_RANGE * boostedMultiplier;
}

function updatePlayerScannerLocks(
  simulation: RoomSimulationState,
  deltaSeconds: number,
): void {
  const playersList = [...simulation.players.values()];
  const alivePlayerIds = new Set(
    playersList
      .filter((player) => player.life?.alive !== false)
      .map((player) => player.playerId),
  );
  for (const observer of playersList) {
    const locksByTarget =
      simulation.playerScannerLocks.get(observer.playerId) ?? new Map<string, number>();
    if (!simulation.playerScannerLocks.has(observer.playerId)) {
      simulation.playerScannerLocks.set(observer.playerId, locksByTarget);
    }

    if (observer.life?.alive === false) {
      locksByTarget.clear();
      continue;
    }

    const scannerRange = resolvePlayerScannerRange(observer);
    const scannerCharge = observer.systems?.scanners.charge ?? 0;
    const scannerLockMultiplier = resolvePlayerScannerLockMultiplier(observer);
    const instantLocks = hasInstantPlayerScannerLocks(observer);
    const trackedTargetIds = new Set<string>();

    for (const target of playersList) {
      if (target.playerId === observer.playerId || target.life?.alive === false) {
        continue;
      }

      trackedTargetIds.add(target.playerId);
      const distance = Math.hypot(target.x - observer.x, target.y - observer.y);
      const inRange = distance <= scannerRange;
      const occludedByCelestialId = inRange
        ? findOccludingCelestialBodyId(
            { x: observer.x, y: observer.y },
            { x: target.x, y: target.y },
            simulation.celestialBodies,
          )
        : null;
      const visible = inRange && occludedByCelestialId === null;
      const currentProgress = locksByTarget.get(target.playerId) ?? 0;

      const nextProgress = visible
        ? instantLocks
          ? 1
          : Math.min(
              1,
              currentProgress +
                deltaSeconds *
                  scannerLockMultiplier *
                  (PLAYER_SCANNER_LOCK_BASE_RATE +
                    scannerCharge * PLAYER_SCANNER_LOCK_CHARGE_FACTOR),
            )
        : Math.max(
            0,
            currentProgress - deltaSeconds * PLAYER_SCANNER_LOCK_DECAY_PER_SECOND,
          );

      if (nextProgress > 0) {
        locksByTarget.set(target.playerId, nextProgress);
      } else {
        locksByTarget.delete(target.playerId);
      }
    }

    for (const targetId of [...locksByTarget.keys()]) {
      if (targetId === observer.playerId || !alivePlayerIds.has(targetId)) {
        locksByTarget.delete(targetId);
        continue;
      }
      if (!trackedTargetIds.has(targetId)) {
        locksByTarget.delete(targetId);
      }
    }
  }
}

function resolvePlayerScannerLockMultiplier(player: MultiplayerSimPlayerState): number {
  return player.systems?.boosted === "scanners"
    ? PLAYER_SCANNER_BOOST_LOCK_MULTIPLIER
    : 1;
}

function hasInstantPlayerScannerLocks(player: MultiplayerSimPlayerState): boolean {
  return (
    PLAYER_SCANNER_INSTANT_LOCK_WHEN_BOOSTED &&
    player.systems?.boosted === "scanners"
  );
}

function applyPlayerWeaponSystems(
  simulation: RoomSimulationState,
  deltaSeconds: number,
): void {
  const playersList = [...simulation.players.values()];
  const alivePlayerIds = new Set(
    playersList
      .filter((player) => player.life?.alive !== false)
      .map((player) => player.playerId),
  );

  for (const attacker of playersList) {
    attacker.weaponFiring = false;
    const engagementsByTarget =
      simulation.playerWeaponEngagements.get(attacker.playerId) ?? new Map<string, number>();
    if (!simulation.playerWeaponEngagements.has(attacker.playerId)) {
      simulation.playerWeaponEngagements.set(attacker.playerId, engagementsByTarget);
    }

    for (const targetId of [...engagementsByTarget.keys()]) {
      if (targetId === attacker.playerId || !alivePlayerIds.has(targetId)) {
        engagementsByTarget.delete(targetId);
      }
    }

    if (attacker.life?.alive === false || !attacker.systems) {
      engagementsByTarget.clear();
      continue;
    }

    const weaponMode = resolvePlayerWeaponMode(attacker);
    const weaponRange = resolvePlayerWeaponRange(attacker, weaponMode);
    const requiredLockProgress = weaponMode === "disintegrator"
      ? DISINTEGRATOR_TARGET_ACQUIRE_THRESHOLD
      : DISRUPTOR_TARGET_ACQUIRE_THRESHOLD;
    const engageStartThreshold = weaponMode === "disintegrator"
      ? DISINTEGRATOR_ENGAGE_START_THRESHOLD
      : DISRUPTOR_ENGAGE_START_THRESHOLD;
    const engageRampUpPerSecond = weaponMode === "disintegrator"
      ? DISINTEGRATOR_ENGAGE_RAMP_UP_PER_SECOND
      : DISRUPTOR_ENGAGE_RAMP_UP_PER_SECOND;
    const engageDecayPerSecond = weaponMode === "disintegrator"
      ? DISINTEGRATOR_ENGAGE_DECAY_PER_SECOND
      : DISRUPTOR_ENGAGE_DECAY_PER_SECOND;
    const scannerRange = resolvePlayerScannerRange(attacker);
    const lockStatesByTarget = simulation.playerScannerLocks.get(attacker.playerId);
    const visibleTargets: Array<{
      target: MultiplayerSimPlayerState;
    }> = [];

    for (const target of playersList) {
      if (target.playerId === attacker.playerId || target.life?.alive === false) {
        continue;
      }

      const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
      if (distance > weaponRange || distance > scannerRange) {
        continue;
      }

      const occludedByCelestialId = findOccludingCelestialBodyId(
        { x: attacker.x, y: attacker.y },
        { x: target.x, y: target.y },
        simulation.celestialBodies,
      );
      if (occludedByCelestialId !== null) {
        continue;
      }

      const lockProgress = Math.max(
        0,
        Math.min(1, lockStatesByTarget?.get(target.playerId) ?? 0),
      );
      if (lockProgress < requiredLockProgress) {
        continue;
      }

      visibleTargets.push({
        target,
      });
    }

    const weaponArmed =
      (attacker.weaponArmed ?? false) &&
      !hasPlayerWeaponsDisabled(attacker, simulation.elapsedSeconds);
    const activeTargetIds = weaponArmed
      ? new Set(visibleTargets.map((entry) => entry.target.playerId))
      : new Set<string>();

    for (const [targetId, progress] of engagementsByTarget.entries()) {
      if (activeTargetIds.has(targetId)) {
        continue;
      }

      const nextProgress = Math.max(
        0,
        progress - deltaSeconds * engageDecayPerSecond,
      );
      if (nextProgress > 0) {
        engagementsByTarget.set(targetId, nextProgress);
      } else {
        engagementsByTarget.delete(targetId);
      }
    }

    if (weaponArmed) {
      for (const entry of visibleTargets) {
        const currentProgress = engagementsByTarget.get(entry.target.playerId) ?? 0;
        engagementsByTarget.set(
          entry.target.playerId,
          Math.min(1, currentProgress + deltaSeconds * engageRampUpPerSecond),
        );
      }
    }

    if (!weaponArmed || visibleTargets.length === 0 || attacker.systems.weapons.charge <= 0) {
      continue;
    }

    const weightedTargets = visibleTargets
      .map((entry) => ({
        target: entry.target,
        progress: engagementsByTarget.get(entry.target.playerId) ?? 0,
      }))
      .filter((entry) => entry.progress > engageStartThreshold);
    const totalProgress = weightedTargets.reduce((sum, entry) => sum + entry.progress, 0);
    if (weightedTargets.length === 0 || totalProgress <= 0) {
      continue;
    }

    const energyCostMultiplier = getPlayerWeaponEnergyCostMultiplier(attacker);
    const dischargePerSecond = weaponMode === "disintegrator"
      ? DISINTEGRATOR_DISCHARGE_PER_SECOND
      : DISRUPTOR_DISCHARGE_PER_SECOND;
    const maxDischarge = Math.min(
      attacker.systems.weapons.charge / energyCostMultiplier,
      deltaSeconds *
        dischargePerSecond *
        Math.min(1, totalProgress / weightedTargets.length),
    );
    if (maxDischarge <= 0) {
      continue;
    }

    attacker.systems.weapons.charge = Math.max(
      0,
      attacker.systems.weapons.charge - maxDischarge * energyCostMultiplier,
    );
    attacker.weaponFiring = true;

    const damageMultiplier = getPlayerWeaponDamageMultiplier(attacker);
    for (const entry of weightedTargets) {
      if (entry.target.life?.alive === false) {
        continue;
      }

      const appliedEnergy =
        ((maxDischarge * entry.progress) / totalProgress) * damageMultiplier;
      if (weaponMode === "disintegrator") {
        applyDisintegratorDamage(entry.target, appliedEnergy);
      } else {
        applyDisruptorEffect(simulation, entry.target, appliedEnergy);
      }
    }
  }
}

function applyDisintegratorDamage(
  target: MultiplayerSimPlayerState,
  appliedEnergy: number,
): void {
  if (appliedEnergy <= 0) {
    return;
  }

  const life = getOrCreatePlayerLife(target);
  if (!life.alive || life.respawnGraceSeconds > 0) {
    return;
  }

  const damage = (appliedEnergy / PLAYER_DISINTEGRATOR_DURABILITY) * life.maxHealth;
  life.health = Math.max(0, life.health - damage);
  if (life.health <= 0) {
    destroyPlayerForRespawn(target);
  }
}

function applyDisruptorEffect(
  simulation: RoomSimulationState,
  target: MultiplayerSimPlayerState,
  appliedEnergy: number,
): void {
  if (appliedEnergy <= 0) {
    return;
  }

  const life = getOrCreatePlayerLife(target);
  if (!life.alive || life.respawnGraceSeconds > 0) {
    return;
  }

  const defenses = target.systems?.defenses;
  if (defenses && defenses.charge > 0) {
    const shieldDamage = appliedEnergy * DISRUPTOR_SHIELD_DAMAGE_MULTIPLIER;
    const absorbedShieldDamage = Math.min(defenses.charge, shieldDamage);
    defenses.charge = Math.max(0, defenses.charge - absorbedShieldDamage);
    if (defenses.charge > 0) {
      return;
    }
  }

  target.weaponArmed = false;
  target.weaponFiring = false;
  target.weaponDisabledUntilSeconds = Math.max(
    target.weaponDisabledUntilSeconds ?? 0,
    simulation.elapsedSeconds + DISRUPTOR_DISABLE_SECONDS,
  );
}

function resolvePlayerWeaponMode(
  player: MultiplayerSimPlayerState,
): PlayerWeaponMode {
  return player.weaponMode === "disruptor" ? "disruptor" : "disintegrator";
}

function hasPlayerWeaponsDisabled(
  player: MultiplayerSimPlayerState,
  elapsedSeconds: number,
): boolean {
  return (player.weaponDisabledUntilSeconds ?? 0) > elapsedSeconds;
}

function resolvePlayerDisintegratorRange(
  player: MultiplayerSimPlayerState,
): number {
  const boostedMultiplier = player.systems?.boosted === "weapons"
    ? PLAYER_WEAPON_BOOST_RANGE_MULTIPLIER
    : 1;
  return PLAYER_BASE_DISINTEGRATOR_RANGE * boostedMultiplier;
}

function resolvePlayerWeaponRange(
  player: MultiplayerSimPlayerState,
  weaponMode: PlayerWeaponMode,
): number {
  const disintegratorRange = resolvePlayerDisintegratorRange(player);
  return weaponMode === "disintegrator"
    ? disintegratorRange
    : disintegratorRange * DISRUPTOR_RANGE_MULTIPLIER;
}

function getPlayerWeaponDamageMultiplier(player: MultiplayerSimPlayerState): number {
  return player.systems?.boosted === "weapons"
    ? PLAYER_WEAPON_BOOST_DAMAGE_MULTIPLIER
    : 1;
}

function getPlayerWeaponEnergyCostMultiplier(player: MultiplayerSimPlayerState): number {
  return player.systems?.boosted === "weapons"
    ? PLAYER_WEAPON_BOOST_ENERGY_COST_MULTIPLIER
    : 1;
}

function createPlayerScannerLockState(
  playerIds: Iterable<string>,
): Map<string, Map<string, number>> {
  const state = new Map<string, Map<string, number>>();
  for (const playerId of playerIds) {
    state.set(playerId, new Map());
  }
  return state;
}

function createPlayerWeaponEngagementState(
  playerIds: Iterable<string>,
): Map<string, Map<string, number>> {
  const state = new Map<string, Map<string, number>>();
  for (const playerId of playerIds) {
    state.set(playerId, new Map());
  }
  return state;
}

function findOccludingCelestialBodyId(
  start: { x: number; y: number },
  end: { x: number; y: number },
  celestialBodies: readonly SimCelestialBodySnapshot[],
): string | null {
  for (const body of celestialBodies) {
    if (
      segmentIntersectsCircle(
        start,
        end,
        { x: body.x, y: body.y },
        body.radius * PLAYER_SCANNER_OCCLUDER_RADIUS_MULTIPLIER,
      )
    ) {
      return body.id;
    }
  }

  return null;
}

function segmentIntersectsCircle(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
): boolean {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;

  if (segmentLengthSquared <= 0.0001) {
    return Math.hypot(center.x - start.x, center.y - start.y) <= radius;
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

  return Math.hypot(closest.x - center.x, closest.y - center.y) <= radius;
}

function pickDropInSpawnAngle(
  simulation: RoomSimulationState,
  centerX: number,
  centerY: number,
  spawnRadius: number,
  playerIdToIgnore?: string,
): number {
  if (simulation.players.size === 0 || spawnRadius <= 0) {
    return 0;
  }

  const candidateCount = Math.max(16, Math.min(64, simulation.players.size * 8));
  let bestAngle = 0;
  let bestClearance = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < candidateCount; index += 1) {
    const angle = (Math.PI * 2 * index) / candidateCount;
    const x = centerX + Math.cos(angle) * spawnRadius;
    const y = centerY + Math.sin(angle) * spawnRadius;
    let minClearance = Number.POSITIVE_INFINITY;

    for (const body of simulation.celestialBodies) {
      const distance = Math.hypot(body.x - x, body.y - y);
      const safeDistance =
        body.radius
        + DEFAULT_MULTIPLAYER_SIMULATION_TUNING.playerCollisionPadding
        + RESPAWN_CELESTIAL_CLEARANCE_PADDING;
      minClearance = Math.min(minClearance, distance - safeDistance);
    }

    for (const player of simulation.players.values()) {
      if (player.playerId === playerIdToIgnore) {
        continue;
      }
      if (player.life?.alive === false) {
        continue;
      }
      const dx = player.x - x;
      const dy = player.y - y;
      const distance = Math.hypot(dx, dy);
      minClearance = Math.min(minClearance, distance - RESPAWN_PLAYER_CLEARANCE);
    }

    if (minClearance > bestClearance) {
      bestClearance = minClearance;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

function updatePlayerLifeStates(simulation: RoomSimulationState): void {
  for (const player of simulation.players.values()) {
    const life = getOrCreatePlayerLife(player);
    const impactSpeed = player.lastCollisionImpactSpeed ?? 0;

    if (life.alive) {
      if (life.respawnGraceSeconds <= 0 && impactSpeed >= COLLISION_MIN_DAMAGE_SPEED) {
        applyCollisionDamage(player, life, impactSpeed);
        if (life.health <= 0) {
          destroyPlayerForRespawn(player);
          continue;
        }
      }
      continue;
    }

    if (life.respawnTimerSeconds <= 0) {
      respawnPlayer(simulation, player);
    }
  }
}

function applyCollisionDamage(
  player: MultiplayerSimPlayerState,
  life: ReturnType<typeof getOrCreatePlayerLife>,
  impactSpeed: number,
): void {
  const totalDamage = impactSpeed * COLLISION_DAMAGE_PER_SPEED;
  const defenses = player.systems?.defenses;
  const boostedToDefenses = player.systems?.boosted === "defenses";
  const resistanceMultiplier = boostedToDefenses ? SHIELD_BOOSTED_MULTIPLIER : 1;

  let shieldAbsorbed = 0;
  if (defenses && defenses.charge > 0) {
    const maxAbsorb = defenses.charge * SHIELD_CHARGE_TO_HP * resistanceMultiplier;
    shieldAbsorbed = Math.min(totalDamage, maxAbsorb);
    const chargeSpent = shieldAbsorbed / (SHIELD_CHARGE_TO_HP * resistanceMultiplier);
    defenses.charge = Math.max(0, defenses.charge - chargeSpent);
  }

  life.health = Math.max(0, life.health - (totalDamage - shieldAbsorbed));
}

function destroyPlayerForRespawn(player: MultiplayerSimPlayerState): void {
  const life = getOrCreatePlayerLife(player);
  if (!life.alive) {
    return;
  }

  life.alive = false;
  life.deaths += 1;
  life.respawnTimerSeconds = PLAYER_RESPAWN_DELAY_SECONDS;
  life.respawnGraceSeconds = 0;

  player.vx = 0;
  player.vy = 0;
  player.throttle = 0;
  player.thrustHeading = null;
  player.superBurnActive = false;
  player.lastCollisionImpactSpeed = 0;
  player.weaponArmed = false;
  player.weaponFiring = false;
  player.weaponDisabledUntilSeconds = 0;
}

function respawnPlayer(
  simulation: RoomSimulationState,
  player: MultiplayerSimPlayerState,
): void {
  const primaryBody =
    simulation.celestialBodies.find((body) => body.parentId === null)
    ?? simulation.celestialBodies[0]
    ?? null;
  const spawnRadius =
    simulation.mapDefinition.spawnOrbitRadius > 0
      ? simulation.mapDefinition.spawnOrbitRadius
      : SPAWN_RADIUS_FALLBACK;
  const spawnCenterX = primaryBody?.x ?? 0;
  const spawnCenterY = primaryBody?.y ?? 0;
  const spawnAngle = pickDropInSpawnAngle(
    simulation,
    spawnCenterX,
    spawnCenterY,
    spawnRadius,
    player.playerId,
  );
  const orbitDirectionSign =
    simulation.mapDefinition.spawnOrbitDirection === "ccw" ? -1 : 1;
  const tangentAngle = spawnAngle + orbitDirectionSign * (Math.PI * 0.5);
  const orbitalSpeed =
    primaryBody?.mass && spawnRadius > 0
      ? Math.sqrt(
          (DEFAULT_MULTIPLAYER_SIMULATION_TUNING.gravitationalConstant * primaryBody.mass) /
            spawnRadius,
        )
      : 0;

  player.x = spawnCenterX + Math.cos(spawnAngle) * spawnRadius;
  player.y = spawnCenterY + Math.sin(spawnAngle) * spawnRadius;
  player.vx = (primaryBody?.vx ?? 0) + Math.cos(tangentAngle) * orbitalSpeed;
  player.vy = (primaryBody?.vy ?? 0) + Math.sin(tangentAngle) * orbitalSpeed;
  player.heading = tangentAngle;
  player.stableMotionHeading = tangentAngle;
  player.lastProcessedInputSequence = null;
  player.throttle = 0;
  player.thrustHeading = null;
  player.superBurnActive = false;
  player.lastCollisionImpactSpeed = 0;
  player.weaponArmed = false;
  player.weaponMode = "disintegrator";
  player.weaponFiring = false;
  player.weaponDisabledUntilSeconds = 0;
  refillPlayerSystems(player);
  armPlayerForLife(player, PLAYER_RESPAWN_GRACE_SECONDS);
}

function armPlayerForLife(
  player: MultiplayerSimPlayerState,
  respawnGraceSeconds: number,
): void {
  const life = getOrCreatePlayerLife(player);
  life.alive = true;
  life.respawnTimerSeconds = 0;
  life.respawnGraceSeconds = Math.max(0, respawnGraceSeconds);
  life.health = life.maxHealth;
  player.weaponDisabledUntilSeconds = 0;
}

function refillPlayerSystems(player: MultiplayerSimPlayerState): void {
  if (!player.systems) {
    return;
  }

  player.systems.boosted = "engines";
  for (const subsystem of [
    player.systems.engines,
    player.systems.scanners,
    player.systems.weapons,
    player.systems.defenses,
  ]) {
    subsystem.charge = subsystem.maxCharge;
  }
}

function getOrCreatePlayerLife(
  player: MultiplayerSimPlayerState,
): NonNullable<MultiplayerSimPlayerState["life"]> {
  if (!player.life) {
    player.life = {
      alive: true,
      respawnTimerSeconds: 0,
      respawnGraceSeconds: 0,
      deaths: 0,
      health: 100,
      maxHealth: 100,
    };
  }
  return player.life;
}
