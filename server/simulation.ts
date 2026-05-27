import type {
  SimCombatEventCause,
  SimCombatEventSnapshot,
  SimCombatEventType,
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
  isPlayerCloaked,
  PLAYER_CLOAK_MAX_CHARGE,
  round3,
  stepMultiplayerPlayers,
  type MultiplayerSimPlayerState,
} from "../shared/multiplayer-simulation-core.js";
import { COMBAT_BALANCE } from "../shared/combat-balance.js";
import {
  resolveArmedWeaponDischarge,
  type WeaponEngagementState,
  updateWeaponEngagementStates,
} from "../shared/player-weapon-core.js";
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

export type RoomSimulationMode = "standard" | "ffa";

export interface CreateRoomSimulationOptions {
  mode?: RoomSimulationMode;
}

export interface RoomSimulationState {
  roomCode: string;
  mode: RoomSimulationMode;
  tick: number;
  elapsedSeconds: number;
  mapDefinition: MultiplayerMapDefinition;
  mapRuntime: MultiplayerMapRuntime;
  celestialBodies: SimCelestialBodySnapshot[];
  players: Map<string, MultiplayerSimPlayerState>;
  playerScannerLocks: Map<string, Map<string, number>>;
  playerWeaponEngagements: Map<string, Map<string, WeaponEngagementState>>;
  playerShieldDisruptUntilSeconds: Map<string, number>;
  playerTargetSelections: Map<string, string | null>;
  combatEvents: SimCombatEventSnapshot[];
  nextCombatEventSerial: number;
}

export function createRoomSimulation(
  roomCode: string,
  playerIds: string[],
  mapDefinition = getDefaultMultiplayerMapDefinition(),
  options: CreateRoomSimulationOptions = {},
): RoomSimulationState {
  const mode = options.mode ?? "standard";
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
    mode,
    tick: 0,
    elapsedSeconds: 0,
    mapDefinition,
    mapRuntime,
    celestialBodies: initialCelestialBodies,
    players,
    playerScannerLocks: createPlayerScannerLockState(players.keys()),
    playerWeaponEngagements: createPlayerWeaponEngagementState(players.keys()),
    playerShieldDisruptUntilSeconds: createPlayerShieldDisruptState(players.keys()),
    playerTargetSelections: createPlayerTargetSelectionState(players.keys()),
    combatEvents: [],
    nextCombatEventSerial: 0,
  };
}

export function removePlayerFromSimulation(
  simulation: RoomSimulationState,
  playerId: string,
): void {
  simulation.players.delete(playerId);
  simulation.playerScannerLocks.delete(playerId);
  simulation.playerWeaponEngagements.delete(playerId);
  simulation.playerShieldDisruptUntilSeconds.delete(playerId);
  simulation.playerTargetSelections.delete(playerId);
  for (const [observerId, selectedTargetId] of simulation.playerTargetSelections.entries()) {
    if (observerId !== playerId && selectedTargetId === playerId) {
      simulation.playerTargetSelections.set(observerId, null);
    }
  }
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
  simulation.playerShieldDisruptUntilSeconds.set(playerId, 0);
  simulation.playerTargetSelections.set(playerId, null);
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
  simulation.combatEvents = [];
  const suppressedShieldChargeByPlayerId = new Map<string, number>();
  for (const [playerId, disruptedUntilSeconds] of simulation.playerShieldDisruptUntilSeconds) {
    if (disruptedUntilSeconds <= simulation.elapsedSeconds) {
      simulation.playerShieldDisruptUntilSeconds.delete(playerId);
      continue;
    }

    const player = simulation.players.get(playerId);
    if (!player?.systems) {
      continue;
    }
    suppressedShieldChargeByPlayerId.set(playerId, player.systems.defenses.charge);
  }
  stepMultiplayerPlayers(
    simulation.players,
    inputByPlayerId,
    simulation.celestialBodies,
    stepSeconds,
    DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  );
  for (const [playerId, suppressedCharge] of suppressedShieldChargeByPlayerId) {
    const player = simulation.players.get(playerId);
    if (!player?.systems) {
      continue;
    }
    player.systems.defenses.charge = Math.min(
      player.systems.defenses.charge,
      suppressedCharge,
    );
  }
  updatePlayerTargetSelections(simulation, inputByPlayerId);
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
    combatEvents: simulation.combatEvents,
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
      if (isPlayerCloaked(target)) {
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
  const autoLockInRangeTargets = simulation.mode === "ffa";
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
      if (isPlayerCloaked(target)) {
        locksByTarget.delete(target.playerId);
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

      let nextProgress = Math.max(
        0,
        currentProgress - deltaSeconds * PLAYER_SCANNER_LOCK_DECAY_PER_SECOND,
      );
      if (autoLockInRangeTargets && inRange) {
        nextProgress = 1;
      } else if (visible) {
        nextProgress = instantLocks
          ? 1
          : Math.min(
              1,
              currentProgress +
                deltaSeconds *
                  scannerLockMultiplier *
                  (PLAYER_SCANNER_LOCK_BASE_RATE +
                    scannerCharge * PLAYER_SCANNER_LOCK_CHARGE_FACTOR),
            );
      }

      if (nextProgress > 0) {
        locksByTarget.set(target.playerId, nextProgress);
      } else {
        locksByTarget.delete(target.playerId);
      }

      if (currentProgress <= 0 && nextProgress > 0 && nextProgress < 1) {
        pushCombatEvent(simulation, {
          type: "lock-acquiring",
          attackerPlayerId: observer.playerId,
          targetPlayerId: target.playerId,
          lockProgress: round3(nextProgress),
          strength: round3(nextProgress),
        });
      } else if (currentProgress < 1 && nextProgress >= 1) {
        pushCombatEvent(simulation, {
          type: "lock-acquired",
          attackerPlayerId: observer.playerId,
          targetPlayerId: target.playerId,
          lockProgress: 1,
          strength: 1,
        });
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

function updatePlayerTargetSelections(
  simulation: RoomSimulationState,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
): void {
  for (const player of simulation.players.values()) {
    const input = inputByPlayerId.get(player.playerId);
    if (!input || input.targetPlayerId === undefined) {
      continue;
    }

    if (
      input.targetPlayerId === null ||
      input.targetPlayerId === "" ||
      input.targetPlayerId === player.playerId
    ) {
      simulation.playerTargetSelections.set(player.playerId, null);
      continue;
    }
    simulation.playerTargetSelections.set(player.playerId, input.targetPlayerId);
  }

  const alivePlayerIds = new Set(
    [...simulation.players.values()]
      .filter((player) => player.life?.alive !== false && !isPlayerCloaked(player))
      .map((player) => player.playerId),
  );
  for (const [observerId, selectedTargetId] of simulation.playerTargetSelections.entries()) {
    if (!simulation.players.has(observerId)) {
      simulation.playerTargetSelections.delete(observerId);
      continue;
    }
    if (
      selectedTargetId &&
      (selectedTargetId === observerId || !alivePlayerIds.has(selectedTargetId))
    ) {
      simulation.playerTargetSelections.set(observerId, null);
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
      simulation.playerWeaponEngagements.get(attacker.playerId)
      ?? new Map<string, WeaponEngagementState>();
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
      ? COMBAT_BALANCE.disintegrator.targetAcquireThreshold
      : COMBAT_BALANCE.disruptor.targetAcquireThreshold;
    const engageRampUpPerSecond = weaponMode === "disintegrator"
      ? COMBAT_BALANCE.disintegrator.engageRampUpPerSecond
      : COMBAT_BALANCE.disruptor.engageRampUpPerSecond;
    const engageDecayPerSecond = weaponMode === "disintegrator"
      ? COMBAT_BALANCE.disintegrator.engageDecayPerSecond
      : COMBAT_BALANCE.disruptor.engageDecayPerSecond;
    const scannerRange = resolvePlayerScannerRange(attacker);
    const lockStatesByTarget = simulation.playerScannerLocks.get(attacker.playerId);
    const visibleTargets: Array<{
      target: MultiplayerSimPlayerState;
    }> = [];

    for (const target of playersList) {
      if (target.playerId === attacker.playerId || target.life?.alive === false) {
        continue;
      }
      if (isPlayerCloaked(target)) {
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
    const selectedTargetId = simulation.playerTargetSelections.get(attacker.playerId) ?? null;
    const prioritizedTargets = selectedTargetId
      ? visibleTargets.filter((entry) => entry.target.playerId === selectedTargetId)
      : visibleTargets;
    const resolvedTargets = prioritizedTargets.length > 0
      ? prioritizedTargets
      : visibleTargets;
    const activeTargets = resolvedTargets.map((entry) => ({
      id: entry.target.playerId,
      target: entry.target,
    }));
    updateWeaponEngagementStates(
      engagementsByTarget,
      activeTargets,
      weaponArmed,
      engageRampUpPerSecond,
      engageDecayPerSecond,
      deltaSeconds,
    );

    const fireResult = resolveArmedWeaponDischarge({
      weaponArmed,
      blocked: false,
      deltaSeconds,
      weaponCharge: attacker.systems.weapons.charge,
      energyCostMultiplier: getPlayerWeaponEnergyCostMultiplier(attacker),
      dischargePerSecond: weaponMode === "disintegrator"
        ? COMBAT_BALANCE.disintegrator.dischargePerSecond
        : COMBAT_BALANCE.disruptor.dischargePerSecond,
      engageStartThreshold: weaponMode === "disintegrator"
        ? COMBAT_BALANCE.disintegrator.engageStartThreshold
        : COMBAT_BALANCE.disruptor.engageStartThreshold,
      damageMultiplier: getPlayerWeaponDamageMultiplier(attacker),
      activeTargets,
      engagementStates: engagementsByTarget,
    });
    attacker.systems.weapons.charge = fireResult.nextWeaponCharge;
    attacker.weaponFiring = fireResult.fired;
    if (!fireResult.fired) {
      continue;
    }

    for (const allocation of fireResult.allocations) {
      const target = allocation.target.target;
      if (target.life?.alive === false) {
        continue;
      }

      pushCombatEvent(simulation, {
        type: "weapon-firing",
        attackerPlayerId: attacker.playerId,
        targetPlayerId: target.playerId,
        weaponMode,
        strength: round3(Math.max(0, Math.min(1, allocation.progress))),
      });

      if (weaponMode === "disintegrator") {
        applyDisintegratorDamage(
          simulation,
          target,
          allocation.appliedEnergy,
          attacker.playerId,
        );
      } else {
        applyDisruptorEffect(
          simulation,
          target,
          allocation.appliedEnergy,
          attacker.playerId,
        );
      }
    }
  }
}

function applyDisintegratorDamage(
  simulation: RoomSimulationState,
  target: MultiplayerSimPlayerState,
  appliedEnergy: number,
  attackerPlayerId: string,
): void {
  if (appliedEnergy <= 0) {
    return;
  }

  const life = getOrCreatePlayerLife(target);
  if (!life.alive || life.respawnGraceSeconds > 0) {
    return;
  }

  const damage = (appliedEnergy / COMBAT_BALANCE.defenses.durability) * life.maxHealth;
  const healthBefore = life.health;
  life.health = Math.max(0, life.health - damage);
  const hullDamage = Math.max(0, healthBefore - life.health);
  if (hullDamage > 0) {
    pushCombatEvent(simulation, {
      type: "hull-hit",
      attackerPlayerId,
      targetPlayerId: target.playerId,
      weaponMode: "disintegrator",
      cause: "weapon",
      hullDamage: round3(hullDamage),
      targetHealth: round3(life.health),
    });
  }
  if (life.health <= 0) {
    destroyPlayerForRespawn(simulation, target, {
      attackerPlayerId,
      weaponMode: "disintegrator",
      cause: "weapon",
    });
  }
}

function applyDisruptorEffect(
  simulation: RoomSimulationState,
  target: MultiplayerSimPlayerState,
  appliedEnergy: number,
  attackerPlayerId: string,
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
    const shieldBefore = defenses.charge;
    const shieldDamage = appliedEnergy * COMBAT_BALANCE.disruptor.shieldDamageMultiplier;
    const absorbedShieldDamage = Math.min(defenses.charge, shieldDamage);
    defenses.charge = Math.max(0, defenses.charge - absorbedShieldDamage);
    const shieldDelta = Math.max(0, shieldBefore - defenses.charge);
    if (shieldDelta > 0) {
      pushCombatEvent(simulation, {
        type: "shield-hit",
        attackerPlayerId,
        targetPlayerId: target.playerId,
        weaponMode: "disruptor",
        cause: "weapon",
        shieldDamage: round3(shieldDelta),
        targetShieldCharge: round3(defenses.charge),
      });
    }
    simulation.playerShieldDisruptUntilSeconds.set(
      target.playerId,
      Math.max(
        simulation.playerShieldDisruptUntilSeconds.get(target.playerId) ?? 0,
        simulation.elapsedSeconds + COMBAT_BALANCE.disruptor.shieldDisruptSeconds,
      ),
    );
    if (defenses.charge > 0) {
      return;
    }
  }

  target.weaponArmed = false;
  target.weaponFiring = false;
  target.weaponDisabledUntilSeconds = Math.max(
    target.weaponDisabledUntilSeconds ?? 0,
    simulation.elapsedSeconds + COMBAT_BALANCE.disruptor.disableSeconds,
  );
}

function pushCombatEvent(
  simulation: RoomSimulationState,
  event: {
    type: SimCombatEventType;
    attackerPlayerId?: string;
    targetPlayerId: string;
    weaponMode?: PlayerWeaponMode;
    cause?: SimCombatEventCause;
    lockProgress?: number;
    strength?: number;
    shieldDamage?: number;
    hullDamage?: number;
    targetHealth?: number;
    targetShieldCharge?: number;
  },
): void {
  simulation.nextCombatEventSerial += 1;
  simulation.combatEvents.push({
    id: `${simulation.tick}:${simulation.nextCombatEventSerial}`,
    type: event.type,
    attackerPlayerId: event.attackerPlayerId,
    targetPlayerId: event.targetPlayerId,
    weaponMode: event.weaponMode,
    cause: event.cause,
    lockProgress: event.lockProgress,
    strength: event.strength,
    shieldDamage: event.shieldDamage,
    hullDamage: event.hullDamage,
    targetHealth: event.targetHealth,
    targetShieldCharge: event.targetShieldCharge,
  });
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
    : disintegratorRange * COMBAT_BALANCE.disruptor.rangeMultiplier;
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
): Map<string, Map<string, WeaponEngagementState>> {
  const state = new Map<string, Map<string, WeaponEngagementState>>();
  for (const playerId of playerIds) {
    state.set(playerId, new Map());
  }
  return state;
}

function createPlayerShieldDisruptState(
  playerIds: Iterable<string>,
): Map<string, number> {
  const state = new Map<string, number>();
  for (const playerId of playerIds) {
    state.set(playerId, 0);
  }
  return state;
}

function createPlayerTargetSelectionState(
  playerIds: Iterable<string>,
): Map<string, string | null> {
  const state = new Map<string, string | null>();
  for (const playerId of playerIds) {
    state.set(playerId, null);
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
        applyCollisionDamage(simulation, player, life, impactSpeed);
        if (life.health <= 0) {
          simulation.playerShieldDisruptUntilSeconds.delete(player.playerId);
          destroyPlayerForRespawn(simulation, player, { cause: "collision" });
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
  simulation: RoomSimulationState,
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
    const shieldBefore = defenses.charge;
    const maxAbsorb = defenses.charge * SHIELD_CHARGE_TO_HP * resistanceMultiplier;
    shieldAbsorbed = Math.min(totalDamage, maxAbsorb);
    const chargeSpent = shieldAbsorbed / (SHIELD_CHARGE_TO_HP * resistanceMultiplier);
    defenses.charge = Math.max(0, defenses.charge - chargeSpent);
    const shieldDelta = Math.max(0, shieldBefore - defenses.charge);
    if (shieldDelta > 0) {
      pushCombatEvent(simulation, {
        type: "shield-hit",
        targetPlayerId: player.playerId,
        cause: "collision",
        shieldDamage: round3(shieldDelta),
        targetShieldCharge: round3(defenses.charge),
      });
    }
  }

  const healthBefore = life.health;
  life.health = Math.max(0, life.health - (totalDamage - shieldAbsorbed));
  const hullDamage = Math.max(0, healthBefore - life.health);
  if (hullDamage > 0) {
    pushCombatEvent(simulation, {
      type: "hull-hit",
      targetPlayerId: player.playerId,
      cause: "collision",
      hullDamage: round3(hullDamage),
      targetHealth: round3(life.health),
    });
  }
}

function destroyPlayerForRespawn(
  simulation: RoomSimulationState,
  player: MultiplayerSimPlayerState,
  options: {
    attackerPlayerId?: string;
    weaponMode?: PlayerWeaponMode;
    cause: SimCombatEventCause;
  },
): void {
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
  player.cloakActive = false;

  pushCombatEvent(simulation, {
    type: "ship-destroyed",
    attackerPlayerId: options.attackerPlayerId,
    targetPlayerId: player.playerId,
    weaponMode: options.weaponMode,
    cause: options.cause,
    targetHealth: 0,
  });
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
  refillPlayerCloak(player);
  armPlayerForLife(player, PLAYER_RESPAWN_GRACE_SECONDS);
  simulation.playerShieldDisruptUntilSeconds.delete(player.playerId);
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
  player.cloakActive = false;
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

function refillPlayerCloak(player: MultiplayerSimPlayerState): void {
  const cloakMax = clamp(
    player.cloakMaxCharge ?? PLAYER_CLOAK_MAX_CHARGE,
    0.1,
    PLAYER_CLOAK_MAX_CHARGE,
  );
  player.cloakMaxCharge = cloakMax;
  player.cloakCharge = cloakMax;
  player.cloakActive = false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
