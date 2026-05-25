import type {
  PlayerInputCommand,
  SimCelestialBodySnapshot,
  SimPlayerLifeSnapshot,
  SimPlayerSnapshot,
  ShipSubsystemKey,
} from "./multiplayer-protocol.js";

interface Vector2Like {
  x: number;
  y: number;
}

interface FlightInputState {
  progradeInput: boolean;
  retrogradeInput: boolean;
  leftInput: boolean;
  rightInput: boolean;
  eBrakeInput: boolean;
  gravityDiveInput: boolean;
  boostInput: boolean;
}

interface ThrustVector {
  heading: number;
  throttle: number;
  label: string;
}

interface ShipSubsystemState {
  baseMaxCharge: number;
  charge: number;
  maxCharge: number;
}

interface ShipSystemsState {
  boosted: ShipSubsystemKey;
  engines: ShipSubsystemState;
  scanners: ShipSubsystemState;
  weapons: ShipSubsystemState;
  defenses: ShipSubsystemState;
}

export interface MultiplayerSimPlayerLifeState {
  alive: boolean;
  respawnTimerSeconds: number;
  respawnGraceSeconds: number;
  deaths: number;
  health: number;
  maxHealth: number;
}

const STABLE_HEADING_MIN_SPEED = 0.18;
const HEADING_ALIGNMENT_MIN_SPEED = 0.01;
const PHYSICS_GRAVITATIONAL_CONSTANT = 750;
const PHYSICS_SOFTENING = 15;

const SHIP_SYSTEMS_BALANCE = {
  rechargePerSecond: 0.36,
  weapons: {
    disintegratorChargeMaxMultiplier: 1.5,
    disintegratorRechargeRateMultiplier: 1.5,
    baseRechargeRateMultiplier: 0.4,
  },
  engines: {
    fuelCapacity: 10,
    thrustMultiplier: 2,
    progradeRetrogradeThrustScale: 1,
    lateralThrustScale: 1,
    superBurnMultiplier: 2.8,
    fuelBurnPerSecond: 0.01,
  },
} as const;

export interface MultiplayerSimulationTuning {
  playerMass: number;
  playerBaseMaxThrust: number;
  gravitationalConstant: number;
  gravitySoftening: number;
  playerCollisionPadding: number;
}

export interface MultiplayerSimPlayerState {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  lastProcessedInputSequence: number | null;
  stableMotionHeading?: number;
  systems?: ShipSystemsState;
  life?: MultiplayerSimPlayerLifeState;
  throttle?: number;
  thrustHeading?: number | null;
  superBurnActive?: boolean;
  lastCollisionImpactSpeed?: number;
}

export interface MultiplayerSpawnOptions {
  spawnCenterX: number;
  spawnCenterY: number;
  spawnRadius: number;
  spawnOrbitDirection: "cw" | "ccw";
  primaryMass: number | null;
}

export const DEFAULT_MULTIPLAYER_SIMULATION_TUNING: MultiplayerSimulationTuning = {
  playerMass: 12,
  playerBaseMaxThrust: 180,
  gravitationalConstant: PHYSICS_GRAVITATIONAL_CONSTANT,
  gravitySoftening: PHYSICS_SOFTENING,
  playerCollisionPadding: 18,
};

export function createSpawnedPlayers(
  playerIds: readonly string[],
  options: MultiplayerSpawnOptions,
  tuning: MultiplayerSimulationTuning = DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
): Map<string, MultiplayerSimPlayerState> {
  const players = new Map<string, MultiplayerSimPlayerState>();
  const count = Math.max(playerIds.length, 1);
  const orbitDirectionSign = options.spawnOrbitDirection === "ccw" ? -1 : 1;
  const orbitalSpeed =
    options.primaryMass && options.spawnRadius > 0
      ? Math.sqrt((tuning.gravitationalConstant * options.primaryMass) / options.spawnRadius)
      : 0;

  playerIds.forEach((playerId, index) => {
    const angle = (Math.PI * 2 * index) / count;
    const tangentAngle = angle + orbitDirectionSign * (Math.PI * 0.5);

    players.set(playerId, {
      playerId,
      x: options.spawnCenterX + Math.cos(angle) * options.spawnRadius,
      y: options.spawnCenterY + Math.sin(angle) * options.spawnRadius,
      vx: Math.cos(tangentAngle) * orbitalSpeed,
      vy: Math.sin(tangentAngle) * orbitalSpeed,
      heading: tangentAngle,
      lastProcessedInputSequence: null,
      stableMotionHeading: tangentAngle,
      systems: createShipSystemsState(),
      life: createDefaultPlayerLifeState(),
      throttle: 0,
      thrustHeading: null,
      superBurnActive: false,
      lastCollisionImpactSpeed: 0,
    });
  });

  return players;
}

export function stepMultiplayerPlayers(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
  inputByPlayerId: ReadonlyMap<string, PlayerInputCommand | null>,
  celestialBodies: readonly SimCelestialBodySnapshot[],
  stepSeconds: number,
  tuning: MultiplayerSimulationTuning = DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
): void {
  for (const player of players.values()) {
    const inputCommand = inputByPlayerId.get(player.playerId) ?? null;
    if (inputCommand) {
      player.lastProcessedInputSequence = inputCommand.sequence;
    }
    const life = ensurePlayerLifeState(player);
    if (life.respawnGraceSeconds > 0) {
      life.respawnGraceSeconds = Math.max(0, life.respawnGraceSeconds - stepSeconds);
    }
    if (!life.alive) {
      life.respawnTimerSeconds = Math.max(0, life.respawnTimerSeconds - stepSeconds);
      player.throttle = 0;
      player.thrustHeading = null;
      player.superBurnActive = false;
      player.lastCollisionImpactSpeed = 0;
      continue;
    }

    if (!player.systems) {
      player.systems = createShipSystemsState();
    }
    if (inputCommand?.focusSubsystem) {
      focusSubsystem(player.systems, inputCommand.focusSubsystem);
    }
    if (player.stableMotionHeading === undefined) {
      player.stableMotionHeading = player.heading;
    }

    updateShipSystems(player.systems, stepSeconds);
    const flightInput = toFlightInputState(inputCommand);
    const liveVelocityHeading =
      player.vx !== 0 || player.vy !== 0
        ? Math.atan2(player.vy, player.vx)
        : player.stableMotionHeading;
    player.stableMotionHeading = updateStableMotionHeading(
      player.stableMotionHeading,
      { x: player.vx, y: player.vy },
    );
    const netGravityAcceleration = computeNetGravityAccelerationForPlayer(
      player,
      celestialBodies,
      tuning,
    );

    const directionalThrust = resolveTravelRelativeThrustVector({
      input: flightInput,
      progradeHeading: liveVelocityHeading,
      lateralHeading: liveVelocityHeading,
      progradeRetrogradeIntensity:
        getEngineThrustMultiplier(player.systems) *
        getEngineProgradeRetrogradeThrustScale(),
      lateralIntensity:
        getEngineThrustMultiplier(player.systems) *
        getEngineLateralThrustScale(),
    });
    const directionalThrustVector = directionalThrust
      ? {
          ...directionalThrust,
          useFullBoostOutput: false,
        }
      : null;
    const emergencyBrakeThrustVector = createGravityAlignedBoostThrustVector(
      flightInput.eBrakeInput,
      netGravityAcceleration,
      "away",
      "E-Brake",
    );
    const gravityDiveThrustVector = createGravityAlignedBoostThrustVector(
      flightInput.gravityDiveInput,
      netGravityAcceleration,
      "toward",
      "Gravity Dive",
    );
    const thrustVector =
      emergencyBrakeThrustVector
      ?? gravityDiveThrustVector
      ?? directionalThrustVector;
    const superBurnActive =
      thrustVector?.useFullBoostOutput === true
      || (flightInput.boostInput && player.systems.boosted === "engines");
    const engineOutputCeiling = thrustVector?.useFullBoostOutput
      ? getEngineFullBoostMultiplier()
      : superBurnActive
        ? getEngineSuperBurnMultiplier(player.systems)
        : 1;
    const engineFuelFraction = getEngineFuelFraction(player.systems);
    const requestedThrottle =
      !thrustVector || engineFuelFraction <= 0
        ? 0
        : thrustVector.throttle * engineOutputCeiling;

    if (thrustVector && requestedThrottle > 0) {
      const maxThrust =
        tuning.playerBaseMaxThrust *
        getEngineThrustMultiplier(player.systems) *
        engineOutputCeiling;
      const thrustAcceleration = (maxThrust * requestedThrottle) / tuning.playerMass;
      player.vx += Math.cos(thrustVector.heading) * thrustAcceleration * stepSeconds;
      player.vy += Math.sin(thrustVector.heading) * thrustAcceleration * stepSeconds;
      consumeEngineFuel(player.systems, requestedThrottle, stepSeconds);
    }

    player.vx += netGravityAcceleration.x * stepSeconds;
    player.vy += netGravityAcceleration.y * stepSeconds;
    player.throttle = requestedThrottle;
    player.thrustHeading = thrustVector?.heading ?? null;
    player.superBurnActive = superBurnActive;

    player.x += player.vx * stepSeconds;
    player.y += player.vy * stepSeconds;

    player.lastCollisionImpactSpeed = resolveCelestialCollisions(
      player,
      celestialBodies,
      tuning,
    );

    const speed = Math.hypot(player.vx, player.vy);
    if (speed >= HEADING_ALIGNMENT_MIN_SPEED) {
      player.heading = Math.atan2(player.vy, player.vx);
    }
    player.stableMotionHeading = updateStableMotionHeading(
      player.stableMotionHeading,
      { x: player.vx, y: player.vy },
    );
  }

  const playerImpactSpeeds = resolvePlayerCollisions(players, tuning);
  for (const [playerId, impactSpeed] of playerImpactSpeeds) {
    const player = players.get(playerId);
    if (!player) {
      continue;
    }
    player.lastCollisionImpactSpeed = Math.max(
      player.lastCollisionImpactSpeed ?? 0,
      impactSpeed,
    );
  }
}

export function buildSimPlayerSnapshots(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
): SimPlayerSnapshot[] {
  const snapshots: SimPlayerSnapshot[] = [];
  for (const player of players.values()) {
    const systems = player.systems
      ? {
          boosted: player.systems.boosted,
          engines: {
            charge: round3(player.systems.engines.charge),
            maxCharge: round3(player.systems.engines.maxCharge),
          },
          scanners: {
            charge: round3(player.systems.scanners.charge),
            maxCharge: round3(player.systems.scanners.maxCharge),
          },
          weapons: {
            charge: round3(player.systems.weapons.charge),
            maxCharge: round3(player.systems.weapons.maxCharge),
          },
          defenses: {
            charge: round3(player.systems.defenses.charge),
            maxCharge: round3(player.systems.defenses.maxCharge),
          },
        }
      : undefined;
    const life = player.life
      ? buildSimPlayerLifeSnapshot(player.life)
      : undefined;
    snapshots.push({
      playerId: player.playerId,
      x: round3(player.x),
      y: round3(player.y),
      vx: round3(player.vx),
      vy: round3(player.vy),
      heading: round3(player.heading),
      lastProcessedInputSequence: player.lastProcessedInputSequence,
      throttle: player.throttle !== undefined ? round3(player.throttle) : undefined,
      thrustHeading: player.thrustHeading !== undefined ? player.thrustHeading : undefined,
      superBurnActive: player.superBurnActive,
      systems,
      life,
    });
  }
  return snapshots;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createShipSystemsState(): ShipSystemsState {
  return {
    boosted: "engines",
    engines: createSubsystemState(SHIP_SYSTEMS_BALANCE.engines.fuelCapacity),
    scanners: createSubsystemState(),
    weapons: createSubsystemState(),
    defenses: createSubsystemState(),
  };
}

const PLAYER_MAX_HEALTH = 100;

function createDefaultPlayerLifeState(): MultiplayerSimPlayerLifeState {
  return {
    alive: true,
    respawnTimerSeconds: 0,
    respawnGraceSeconds: 0,
    deaths: 0,
    health: PLAYER_MAX_HEALTH,
    maxHealth: PLAYER_MAX_HEALTH,
  };
}

function ensurePlayerLifeState(
  player: MultiplayerSimPlayerState,
): MultiplayerSimPlayerLifeState {
  if (!player.life) {
    player.life = createDefaultPlayerLifeState();
  }
  return player.life;
}

function buildSimPlayerLifeSnapshot(
  life: MultiplayerSimPlayerLifeState,
): SimPlayerLifeSnapshot {
  return {
    alive: life.alive,
    respawnTimerSeconds: round3(Math.max(0, life.respawnTimerSeconds)),
    respawnGraceSeconds: round3(Math.max(0, life.respawnGraceSeconds)),
    deaths: Math.max(0, Math.trunc(life.deaths)),
    health: round3(clamp(life.health, 0, life.maxHealth)),
    maxHealth: life.maxHealth,
  };
}

function focusSubsystem(
  state: ShipSystemsState,
  subsystem: ShipSubsystemKey,
): void {
  state.boosted = subsystem;
}

function updateShipSystems(
  state: ShipSystemsState,
  deltaSeconds: number,
): void {
  for (const key of ["engines", "scanners", "weapons", "defenses"] as const) {
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

function getEngineThrustMultiplier(state: ShipSystemsState): number {
  return state.boosted === "engines"
    ? SHIP_SYSTEMS_BALANCE.engines.thrustMultiplier
    : 1;
}

function getEngineProgradeRetrogradeThrustScale(): number {
  return SHIP_SYSTEMS_BALANCE.engines.progradeRetrogradeThrustScale;
}

function getEngineLateralThrustScale(): number {
  return SHIP_SYSTEMS_BALANCE.engines.lateralThrustScale;
}

function getEngineSuperBurnMultiplier(state: ShipSystemsState): number {
  return state.boosted === "engines"
    ? SHIP_SYSTEMS_BALANCE.engines.superBurnMultiplier
    : 1;
}

function getEngineFullBoostMultiplier(): number {
  return SHIP_SYSTEMS_BALANCE.engines.superBurnMultiplier;
}

function getEngineFuelFraction(state: ShipSystemsState): number {
  return state.engines.maxCharge > 0
    ? state.engines.charge / state.engines.maxCharge
    : 0;
}

function consumeEngineFuel(
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

function getSubsystemMaxCharge(
  state: ShipSystemsState,
  key: ShipSubsystemKey,
): number {
  if (key === "weapons") {
    const chargeMultiplier = state.boosted === "weapons"
      ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorChargeMaxMultiplier
      : 1;
    return state.weapons.baseMaxCharge * chargeMultiplier;
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
    const weaponMultiplier = state.boosted === "weapons"
      ? SHIP_SYSTEMS_BALANCE.weapons.disintegratorRechargeRateMultiplier
      : 1;
    return SHIP_SYSTEMS_BALANCE.weapons.baseRechargeRateMultiplier * weaponMultiplier;
  }

  return 1;
}

function createSubsystemState(baseMaxCharge = 1): ShipSubsystemState {
  return {
    baseMaxCharge,
    charge: baseMaxCharge,
    maxCharge: baseMaxCharge,
  };
}

function updateStableMotionHeading(
  currentHeading: number,
  velocity: Vector2Like,
): number {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < STABLE_HEADING_MIN_SPEED) {
    return currentHeading;
  }
  return Math.atan2(velocity.y, velocity.x);
}

function resolveTravelRelativeThrustVector(options: {
  input: FlightInputState;
  progradeHeading: number;
  lateralHeading: number;
  progradeRetrogradeIntensity: number;
  lateralIntensity: number;
}): ThrustVector | null {
  const progradeAxis = {
    x: Math.cos(options.progradeHeading),
    y: Math.sin(options.progradeHeading),
  };
  const lateralAxis = {
    x: Math.cos(options.lateralHeading + Math.PI / 2),
    y: Math.sin(options.lateralHeading + Math.PI / 2),
  };
  const progradeAmount =
    (options.input.progradeInput ? 1 : 0) -
    (options.input.retrogradeInput ? 1 : 0);
  const lateralAmount =
    (options.input.rightInput ? 1 : 0) -
    (options.input.leftInput ? 1 : 0);
  const x =
    progradeAxis.x * progradeAmount * options.progradeRetrogradeIntensity +
    lateralAxis.x * lateralAmount * options.lateralIntensity;
  const y =
    progradeAxis.y * progradeAmount * options.progradeRetrogradeIntensity +
    lateralAxis.y * lateralAmount * options.lateralIntensity;
  const magnitude = Math.hypot(x, y);

  if (magnitude === 0) {
    return null;
  }

  const normalizedX = x / magnitude;
  const normalizedY = y / magnitude;
  const components: string[] = [];

  if (progradeAmount > 0) {
    components.push("Prograde");
  } else if (progradeAmount < 0) {
    components.push("Retrograde");
  }

  if (lateralAmount > 0) {
    components.push("Right");
  } else if (lateralAmount < 0) {
    components.push("Left");
  }

  return {
    heading: Math.atan2(normalizedY, normalizedX),
    throttle: Math.min(1, magnitude),
    label: components.join(" + "),
  };
}

function computeNetGravityAccelerationForPlayer(
  player: Pick<MultiplayerSimPlayerState, "playerId" | "x" | "y">,
  celestialBodies: readonly SimCelestialBodySnapshot[],
  tuning: MultiplayerSimulationTuning,
): Vector2Like {
  let x = 0;
  let y = 0;

  for (const body of celestialBodies) {
    const dx = body.x - player.x;
    const dy = body.y - player.y;
    const distanceSquared =
      dx * dx + dy * dy + tuning.gravitySoftening * tuning.gravitySoftening;
    const distance = Math.sqrt(distanceSquared);
    if (distance <= 0.000001) {
      continue;
    }

    const accelerationMagnitude =
      (tuning.gravitationalConstant * body.mass) / distanceSquared;
    x += (dx / distance) * accelerationMagnitude;
    y += (dy / distance) * accelerationMagnitude;
  }

  return { x, y };
}

function createGravityAlignedBoostThrustVector(
  active: boolean,
  netGravityAcceleration: Vector2Like,
  direction: "toward" | "away",
  label: string,
): (ThrustVector & { useFullBoostOutput: boolean }) | null {
  if (!active) {
    return null;
  }

  const gravityMagnitude = Math.hypot(
    netGravityAcceleration.x,
    netGravityAcceleration.y,
  );
  if (gravityMagnitude <= 0.000001) {
    return null;
  }

  const directionMultiplier = direction === "toward" ? 1 : -1;
  return {
    heading: Math.atan2(
      netGravityAcceleration.y * directionMultiplier,
      netGravityAcceleration.x * directionMultiplier,
    ),
    throttle: 1,
    label,
    useFullBoostOutput: true,
  };
}

function toFlightInputState(input: PlayerInputCommand | null): FlightInputState {
  if (!input) {
    return {
      progradeInput: false,
      retrogradeInput: false,
      leftInput: false,
      rightInput: false,
      eBrakeInput: false,
      gravityDiveInput: false,
      boostInput: false,
    };
  }

  return {
    progradeInput: input.progradeInput,
    retrogradeInput: input.retrogradeInput,
    leftInput: input.leftInput,
    rightInput: input.rightInput,
    eBrakeInput: input.eBrakeInput,
    gravityDiveInput: input.gravityDiveInput,
    boostInput: input.boostInput,
  };
}

function resolveCelestialCollisions(
  player: MultiplayerSimPlayerState,
  celestialBodies: readonly SimCelestialBodySnapshot[],
  tuning: MultiplayerSimulationTuning,
): number {
  let maxImpactSpeed = 0;
  for (const body of celestialBodies) {
    const dx = player.x - body.x;
    const dy = player.y - body.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = body.radius + tuning.playerCollisionPadding;

    if (distance >= minDistance) {
      continue;
    }

    const normalX = distance > 1e-6 ? dx / distance : 1;
    const normalY = distance > 1e-6 ? dy / distance : 0;
    const penetration = minDistance - distance;

    player.x += normalX * penetration;
    player.y += normalY * penetration;

    const relativeVelocityX = player.vx - body.vx;
    const relativeVelocityY = player.vy - body.vy;
    const impactSpeed = Math.hypot(relativeVelocityX, relativeVelocityY);
    maxImpactSpeed = Math.max(maxImpactSpeed, impactSpeed);
    const radialRelativeVelocity =
      relativeVelocityX * normalX + relativeVelocityY * normalY;
    if (radialRelativeVelocity < 0) {
      const adjustedRelativeVelocityX =
        relativeVelocityX - radialRelativeVelocity * normalX;
      const adjustedRelativeVelocityY =
        relativeVelocityY - radialRelativeVelocity * normalY;
      player.vx = adjustedRelativeVelocityX + body.vx;
      player.vy = adjustedRelativeVelocityY + body.vy;
    }
  }

  return maxImpactSpeed;
}

function resolvePlayerCollisions(
  players: ReadonlyMap<string, MultiplayerSimPlayerState>,
  tuning: MultiplayerSimulationTuning,
): Map<string, number> {
  const alivePlayers = [...players.values()].filter(
    (player) => player.life?.alive !== false,
  );
  const impactsByPlayerId = new Map<string, number>();
  const minDistance = tuning.playerCollisionPadding * 2;

  for (let index = 0; index < alivePlayers.length; index += 1) {
    const left = alivePlayers[index];
    for (let nextIndex = index + 1; nextIndex < alivePlayers.length; nextIndex += 1) {
      const right = alivePlayers[nextIndex];
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= minDistance) {
        continue;
      }

      const normalX = distance > 1e-6 ? dx / distance : 1;
      const normalY = distance > 1e-6 ? dy / distance : 0;
      const penetration = minDistance - distance;
      const separationX = normalX * (penetration * 0.5);
      const separationY = normalY * (penetration * 0.5);
      left.x -= separationX;
      left.y -= separationY;
      right.x += separationX;
      right.y += separationY;

      const relativeVelocityX = right.vx - left.vx;
      const relativeVelocityY = right.vy - left.vy;
      const closingSpeed =
        relativeVelocityX * normalX + relativeVelocityY * normalY;
      if (closingSpeed < 0) {
        const correction = closingSpeed * 0.5;
        left.vx += normalX * correction;
        left.vy += normalY * correction;
        right.vx -= normalX * correction;
        right.vy -= normalY * correction;
      }

      const impactSpeed = Math.hypot(relativeVelocityX, relativeVelocityY);
      impactsByPlayerId.set(
        left.playerId,
        Math.max(impactsByPlayerId.get(left.playerId) ?? 0, impactSpeed),
      );
      impactsByPlayerId.set(
        right.playerId,
        Math.max(impactsByPlayerId.get(right.playerId) ?? 0, impactSpeed),
      );
    }
  }

  return impactsByPlayerId;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
