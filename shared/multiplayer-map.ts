export type OrbitDirection = "cw" | "ccw";

export type MultiplayerCelestialRenderPreset =
  | "auto"
  | "oceanic"
  | "terrestrial"
  | "earthlike"
  | "desert"
  | "gas"
  | "rocky"
  | "ice"
  | "lava";

export type MultiplayerCelestialBodyClass =
  | "meteor"
  | "comet"
  | "asteroid"
  | "rocky-moon"
  | "icy-moon"
  | "dwarf-planet"
  | "icy-dwarf"
  | "small-rocky-planet"
  | "small-icy-planet"
  | "small-volcanic-planet"
  | "medium-ocean-planet"
  | "medium-terrestrial-planet"
  | "medium-earthlike-planet"
  | "large-ocean-planet"
  | "large-terrestrial-planet"
  | "large-earthlike-planet"
  | "gas-giant"
  | "gas-supergiant";

export type MultiplayerCelestialWeatherLevel =
  | "none"
  | "light"
  | "moderate"
  | "heavy"
  | "extreme";

export type MultiplayerCelestialRockyPalette =
  | "default"
  | "ash"
  | "basalt"
  | "slate"
  | "ochre"
  | "umber"
  | "rust"
  | "iron"
  | "obsidian";

export interface MultiplayerMapBodyConfig {
  id: string;
  name: string;
  parentId: string | null;
  rootPosition: {
    x: number;
    y: number;
  };
  mass: number;
  radius: number;
  orbitRadius: number;
  orbitPeriod: number;
  initialAngle: number;
  orbitDirection?: OrbitDirection;
  orbitEccentricity?: number;
  orbitRotation?: number;
  color?: number;
  celestialClass?: MultiplayerCelestialBodyClass;
  weatherLevel?: MultiplayerCelestialWeatherLevel;
  renderPreset?: MultiplayerCelestialRenderPreset;
  rockyPalette?: MultiplayerCelestialRockyPalette;
  renderSeed?: string;
}

export interface MultiplayerMapDefinition {
  id: string;
  name: string;
  description: string;
  spawnOrbitRadius: number;
  spawnOrbitDirection: OrbitDirection;
  celestialBodies: readonly MultiplayerMapBodyConfig[];
}

export interface RoomMapSnapshot {
  id: string;
  name: string;
  description: string;
  celestialBodyCount: number;
}

export interface SimCelestialBodySnapshot {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  orbitEccentricity: number;
}

interface OrbitMotionProfile {
  meanMotion: number;
  eccentricity: number;
  semiMajorAxis: number;
  semiMinorAxis: number;
  orbitRotation: number;
  initialMeanAnomaly: number;
}

interface MultiplayerMapBodyRuntime {
  config: MultiplayerMapBodyConfig;
  orbitProfile: OrbitMotionProfile | null;
}

export interface MultiplayerMapRuntime {
  definition: MultiplayerMapDefinition;
  bodies: readonly MultiplayerMapBodyRuntime[];
}

const KEPLER_SOLVER_ITERATIONS = 12;

const DEFAULT_MULTIPLAYER_MAP: MultiplayerMapDefinition = {
  id: "multiplayer-gas-giant-two-moons",
  name: "Caldera Twin-Moon Arena",
  description:
    "Caldera gas giant with two moons in distinct eccentric orbits: Forge (e=0.07) and Mistral (e=0.31).",
  spawnOrbitRadius: 1820,
  spawnOrbitDirection: "cw",
  celestialBodies: [
    {
      id: "caldera",
      name: "Caldera",
      parentId: null,
      rootPosition: { x: 0, y: 0 },
      mass: 410000,
      radius: 228,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      orbitDirection: "cw",
      orbitEccentricity: 0,
      orbitRotation: 0,
      color: 0xd48b4e,
      celestialClass: "gas-giant",
      weatherLevel: "extreme",
      renderPreset: "gas",
      renderSeed: "caldera",
    },
    {
      id: "forge",
      name: "Forge",
      parentId: "caldera",
      rootPosition: { x: 0, y: 0 },
      mass: 11200,
      radius: 54,
      orbitRadius: 760,
      orbitPeriod: 36,
      initialAngle: Math.PI * 0.22,
      orbitDirection: "cw",
      orbitEccentricity: 0.07,
      orbitRotation: Math.PI * 0.18,
      color: 0x8995c9,
      celestialClass: "rocky-moon",
      weatherLevel: "light",
      renderPreset: "rocky",
      renderSeed: "forge",
    },
    {
      id: "mistral",
      name: "Mistral",
      parentId: "caldera",
      rootPosition: { x: 0, y: 0 },
      mass: 14600,
      radius: 62,
      orbitRadius: 1460,
      orbitPeriod: 78,
      initialAngle: Math.PI * 1.06,
      orbitDirection: "ccw",
      orbitEccentricity: 0.31,
      orbitRotation: Math.PI * 0.63,
      color: 0x7eb2d6,
      celestialClass: "icy-moon",
      weatherLevel: "moderate",
      renderPreset: "ice",
      renderSeed: "mistral",
    },
  ],
};

const MULTIPLAYER_MAP_DEFINITIONS: readonly MultiplayerMapDefinition[] = [
  DEFAULT_MULTIPLAYER_MAP,
];

const MULTIPLAYER_MAP_DEFINITIONS_BY_ID = new Map<string, MultiplayerMapDefinition>(
  MULTIPLAYER_MAP_DEFINITIONS.map((definition) => [definition.id, definition] as const),
);

export function getDefaultMultiplayerMapDefinition(): MultiplayerMapDefinition {
  return DEFAULT_MULTIPLAYER_MAP;
}

export function getMultiplayerMapDefinitionById(
  mapId: string | undefined,
): MultiplayerMapDefinition | null {
  if (!mapId) {
    return null;
  }
  return MULTIPLAYER_MAP_DEFINITIONS_BY_ID.get(mapId) ?? null;
}

export function buildRoomMapSnapshot(
  mapDefinition: MultiplayerMapDefinition,
): RoomMapSnapshot {
  return {
    id: mapDefinition.id,
    name: mapDefinition.name,
    description: mapDefinition.description,
    celestialBodyCount: mapDefinition.celestialBodies.length,
  };
}

export function createMultiplayerMapRuntime(
  definition: MultiplayerMapDefinition,
): MultiplayerMapRuntime {
  const configById = new Map<string, MultiplayerMapBodyConfig>();
  for (const config of definition.celestialBodies) {
    if (configById.has(config.id)) {
      throw new Error(`Duplicate multiplayer map body id "${config.id}".`);
    }
    configById.set(config.id, config);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const bodies: MultiplayerMapBodyRuntime[] = [];

  const visit = (bodyId: string): void => {
    if (visited.has(bodyId)) {
      return;
    }
    if (visiting.has(bodyId)) {
      throw new Error(`Circular parent relationship in multiplayer map at "${bodyId}".`);
    }

    const config = configById.get(bodyId);
    if (!config) {
      throw new Error(`Unknown multiplayer map body id "${bodyId}".`);
    }

    visiting.add(bodyId);
    if (config.parentId !== null) {
      if (!configById.has(config.parentId)) {
        throw new Error(
          `Unknown parent "${config.parentId}" for multiplayer map body "${config.id}".`,
        );
      }
      visit(config.parentId);
    }

    bodies.push({
      config,
      orbitProfile: buildOrbitProfile(config),
    });
    visiting.delete(bodyId);
    visited.add(bodyId);
  };

  for (const config of definition.celestialBodies) {
    visit(config.id);
  }

  return {
    definition,
    bodies,
  };
}

export function evaluateMultiplayerMap(
  runtime: MultiplayerMapRuntime,
  timeSeconds: number,
): SimCelestialBodySnapshot[] {
  const states = new Map<string, SimCelestialBodySnapshot>();

  for (const entry of runtime.bodies) {
    const { config, orbitProfile } = entry;

    let x = config.rootPosition.x;
    let y = config.rootPosition.y;
    let vx = 0;
    let vy = 0;

    if (config.parentId !== null) {
      const parent = states.get(config.parentId);
      if (!parent) {
        throw new Error(`Missing parent state for multiplayer map body "${config.id}".`);
      }

      if (orbitProfile) {
        const localPose = evaluateOrbitPose(orbitProfile, timeSeconds);
        x = parent.x + localPose.x;
        y = parent.y + localPose.y;
        vx = parent.vx + localPose.vx;
        vy = parent.vy + localPose.vy;
      } else {
        x = parent.x;
        y = parent.y;
        vx = parent.vx;
        vy = parent.vy;
      }
    }

    states.set(config.id, {
      id: config.id,
      name: config.name,
      parentId: config.parentId,
      x,
      y,
      vx,
      vy,
      mass: config.mass,
      radius: config.radius,
      orbitEccentricity: clamp(config.orbitEccentricity ?? 0, 0, 0.92),
    });
  }

  return Array.from(states.values());
}

function buildOrbitProfile(
  config: Pick<
    MultiplayerMapBodyConfig,
    | "parentId"
    | "orbitPeriod"
    | "orbitRadius"
    | "initialAngle"
    | "orbitDirection"
    | "orbitEccentricity"
    | "orbitRotation"
  >,
): OrbitMotionProfile | null {
  if (config.parentId === null || config.orbitPeriod <= 0 || config.orbitRadius <= 0) {
    return null;
  }

  const eccentricity = clamp(config.orbitEccentricity ?? 0, 0, 0.92);
  const semiMajorAxis = config.orbitRadius;
  const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
  const orbitRotation = config.orbitRotation ?? 0;
  const initialTrueAnomaly = normalizeAngle(config.initialAngle);
  const initialEccentricAnomaly = trueAnomalyToEccentricAnomaly(
    initialTrueAnomaly,
    eccentricity,
  );
  const meanMotion =
    ((Math.PI * 2) / config.orbitPeriod) * getOrbitDirectionSign(config.orbitDirection);

  return {
    meanMotion,
    eccentricity,
    semiMajorAxis,
    semiMinorAxis,
    orbitRotation,
    initialMeanAnomaly: normalizeAngle(
      initialEccentricAnomaly - eccentricity * Math.sin(initialEccentricAnomaly),
    ),
  };
}

function evaluateOrbitPose(
  profile: OrbitMotionProfile,
  timeSeconds: number,
): {
  x: number;
  y: number;
  vx: number;
  vy: number;
} {
  const meanAnomaly = normalizeAngle(
    profile.initialMeanAnomaly + profile.meanMotion * timeSeconds,
  );
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, profile.eccentricity);
  const cosAngle = Math.cos(eccentricAnomaly);
  const sinAngle = Math.sin(eccentricAnomaly);
  const cosRotation = Math.cos(profile.orbitRotation);
  const sinRotation = Math.sin(profile.orbitRotation);

  const localX = profile.semiMajorAxis * (cosAngle - profile.eccentricity);
  const localY = sinAngle * profile.semiMinorAxis;

  const eccentricDenominator = Math.max(1 - profile.eccentricity * cosAngle, 1e-4);
  const eccentricAnomalyRate = profile.meanMotion / eccentricDenominator;
  const localVx = -profile.semiMajorAxis * sinAngle * eccentricAnomalyRate;
  const localVy = profile.semiMinorAxis * cosAngle * eccentricAnomalyRate;

  return {
    x: localX * cosRotation - localY * sinRotation,
    y: localX * sinRotation + localY * cosRotation,
    vx: localVx * cosRotation - localVy * sinRotation,
    vy: localVx * sinRotation + localVy * cosRotation,
  };
}

function solveEccentricAnomaly(
  meanAnomaly: number,
  eccentricity: number,
): number {
  let eccentricAnomaly =
    eccentricity < 0.8 ? meanAnomaly : Math.PI;

  for (let iteration = 0; iteration < KEPLER_SOLVER_ITERATIONS; iteration += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      Math.max(1 - eccentricity * Math.cos(eccentricAnomaly), 1e-4);
    eccentricAnomaly -= delta;
  }

  return normalizeAngle(eccentricAnomaly);
}

function trueAnomalyToEccentricAnomaly(
  trueAnomaly: number,
  eccentricity: number,
): number {
  if (eccentricity <= 0) {
    return normalizeAngle(trueAnomaly);
  }

  const sinHalf = Math.sin(trueAnomaly * 0.5);
  const cosHalf = Math.cos(trueAnomaly * 0.5);
  return normalizeAngle(
    2 *
      Math.atan2(
        Math.sqrt(1 - eccentricity) * sinHalf,
        Math.sqrt(1 + eccentricity) * cosHalf,
      ),
  );
}

function normalizeAngle(angleRadians: number): number {
  const fullTurn = Math.PI * 2;
  const wrapped = angleRadians % fullTurn;
  return wrapped < 0 ? wrapped + fullTurn : wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getOrbitDirectionSign(direction: OrbitDirection | undefined): number {
  return direction === "ccw" ? -1 : 1;
}

