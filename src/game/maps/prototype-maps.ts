import type { Vector2Like } from "../physics/vector2";
import type {
  CelestialBodyClass,
  CelestialConfig,
  CelestialRockyPalette,
  CelestialWeatherLevel,
  DefenseConfig,
  SharedMapLayout,
} from "./types";

function createCelestialStyle(
  renderSeed: string,
  celestialClass: CelestialBodyClass,
  weatherLevel?: CelestialWeatherLevel,
  rockyPalette?: CelestialRockyPalette,
): Pick<
  CelestialConfig,
  "renderSeed" | "celestialClass" | "weatherLevel" | "rockyPalette"
> {
  return {
    renderSeed,
    celestialClass,
    weatherLevel,
    rockyPalette,
  };
}

export function createSimpleSystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
  includeMoon: boolean,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;
  const configs: CelestialConfig[] = [
    {
      id: makeId("aurelia"),
      name: `Aurelia ${label}`,
      systemId,
      parentId: null,
      hidden: false,
      rootPosition: center,
      mass: 170000,
      radius: 130,
      color: 0x4d9bff,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      ...createCelestialStyle(
        "aurelia",
        "medium-earthlike-planet",
        "moderate",
      ),
    },
  ];

  if (includeMoon) {
    configs.push({
      id: makeId("selene"),
      name: `Selene ${label}`,
      systemId,
      parentId: makeId("aurelia"),
      hidden: false,
      rootPosition: center,
      mass: 6800,
      radius: 46,
      color: 0xbec9ff,
      orbitRadius: 1200,
      orbitPeriod: 74,
      initialAngle: Math.PI * 0.15,
      ...createCelestialStyle("selene", "rocky-moon", undefined, "slate"),
    });
  }

  return configs;
}

export function createBinarySystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;

  return [
    {
      id: makeId("barycenter"),
      name: `Janus Barycenter ${label}`,
      systemId,
      parentId: null,
      hidden: true,
      rootPosition: center,
      mass: 0,
      radius: 0,
      color: 0x000000,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
    },
    {
      id: makeId("castor"),
      name: `Castor ${label}`,
      systemId,
      parentId: makeId("barycenter"),
      hidden: false,
      rootPosition: center,
      mass: 92000,
      radius: 92,
      color: 0xffb36e,
      orbitRadius: 240,
      orbitPeriod: 46,
      initialAngle: 0,
      ...createCelestialStyle("castor", "gas-giant", "moderate"),
    },
    {
      id: makeId("pollux"),
      name: `Pollux ${label}`,
      systemId,
      parentId: makeId("barycenter"),
      hidden: false,
      rootPosition: center,
      mass: 86000,
      radius: 84,
      color: 0xff8ea4,
      orbitRadius: 258,
      orbitPeriod: 46,
      initialAngle: Math.PI,
      ...createCelestialStyle("pollux", "gas-giant", "heavy"),
    },
  ];
}

export function createRefinerySystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;

  return [
    {
      id: makeId("vesta"),
      name: `Vesta ${label}`,
      systemId,
      parentId: null,
      hidden: false,
      rootPosition: center,
      mass: 118000,
      radius: 108,
      color: 0x9a8d7b,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      refuelLaneRadius: 980,
      refuelLaneThickness: 400,
      showRefuelMarker: false,
      ...createCelestialStyle("vesta", "dwarf-planet", undefined, "umber"),
    },
  ];
}

export function createSingleMoonWorldSystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;

  return [
    {
      id: makeId("nadir"),
      name: `Nadir ${label}`,
      systemId,
      parentId: null,
      hidden: false,
      rootPosition: center,
      mass: 212000,
      radius: 126,
      color: 0x87a4c9,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      ...createCelestialStyle("nadir", "gas-giant", "light"),
    },
    {
      id: makeId("pharos"),
      name: `Pharos ${label}`,
      systemId,
      parentId: makeId("nadir"),
      hidden: false,
      rootPosition: center,
      mass: 8600,
      radius: 40,
      color: 0xc7b79a,
      orbitRadius: 560,
      orbitPeriod: 18,
      initialAngle: Math.PI * 0.24,
      orbitEccentricity: 0.04,
      orbitRotation: Math.PI * 0.16,
      ...createCelestialStyle("pharos", "rocky-moon", undefined, "ochre"),
    },
    {
      id: makeId("lyra"),
      name: `Lyra ${label}`,
      systemId,
      parentId: makeId("nadir"),
      hidden: false,
      rootPosition: center,
      mass: 9900,
      radius: 44,
      color: 0xaac3de,
      orbitRadius: 1360,
      orbitPeriod: 38,
      initialAngle: Math.PI * 1.18,
      orbitEccentricity: 0.06,
      orbitRotation: Math.PI * 0.44,
      ...createCelestialStyle("lyra", "icy-moon", "light", "slate"),
    },
  ];
}

export function createGiantMoonSystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;

  return [
    {
      id: makeId("brontes"),
      name: `Brontes ${label}`,
      systemId,
      parentId: null,
      hidden: false,
      rootPosition: center,
      mass: 580000,
      radius: 228,
      color: 0xd39d5f,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      ...createCelestialStyle("brontes", "gas-supergiant", "extreme"),
    },
    {
      id: makeId("ioxa"),
      name: `Ioxa ${label}`,
      systemId,
      parentId: makeId("brontes"),
      hidden: false,
      rootPosition: center,
      mass: 8200,
      radius: 42,
      color: 0xffc27e,
      orbitRadius: 620,
      orbitPeriod: 16,
      initialAngle: Math.PI * 0.18,
      orbitEccentricity: 0.02,
      orbitRotation: Math.PI * 0.12,
      ...createCelestialStyle(
        "ioxa",
        "small-volcanic-planet",
        undefined,
        "rust",
      ),
    },
    {
      id: makeId("thalassa"),
      name: `Thalassa ${label}`,
      systemId,
      parentId: makeId("brontes"),
      hidden: false,
      rootPosition: center,
      mass: 7600,
      radius: 38,
      color: 0x9ec9ff,
      orbitRadius: 880,
      orbitPeriod: 24,
      initialAngle: Math.PI * 0.72,
      orbitEccentricity: 0.08,
      orbitRotation: Math.PI * 0.36,
      ...createCelestialStyle("thalassa", "small-icy-planet", "light"),
    },
    {
      id: makeId("rhea"),
      name: `Rhea ${label}`,
      systemId,
      parentId: makeId("brontes"),
      hidden: false,
      rootPosition: center,
      mass: 6900,
      radius: 34,
      color: 0xd9e2f4,
      orbitRadius: 1160,
      orbitPeriod: 36,
      initialAngle: Math.PI * 1.06,
      orbitEccentricity: 0.03,
      orbitRotation: Math.PI * 0.52,
      ...createCelestialStyle("rhea", "icy-moon"),
    },
    {
      id: makeId("nera"),
      name: `Nera ${label}`,
      systemId,
      parentId: makeId("brontes"),
      hidden: false,
      rootPosition: center,
      mass: 5400,
      radius: 28,
      color: 0x8be0cf,
      orbitRadius: 1500,
      orbitPeriod: 52,
      initialAngle: Math.PI * 1.52,
      orbitEccentricity: 0.16,
      orbitRotation: Math.PI * 0.2,
      ...createCelestialStyle("nera", "medium-ocean-planet", "light"),
    },
    {
      id: makeId("eidon"),
      name: `Eidon ${label}`,
      systemId,
      parentId: makeId("brontes"),
      hidden: false,
      rootPosition: center,
      mass: 4800,
      radius: 26,
      color: 0xc9b0ff,
      orbitRadius: 1900,
      orbitPeriod: 70,
      initialAngle: Math.PI * 0.34,
      orbitEccentricity: 0.22,
      orbitRotation: Math.PI * 0.68,
      ...createCelestialStyle("eidon", "dwarf-planet", undefined, "iron"),
    },
    {
      id: makeId("khepri"),
      name: `Khepri ${label}`,
      systemId,
      parentId: makeId("brontes"),
      hidden: false,
      rootPosition: center,
      mass: 3900,
      radius: 22,
      color: 0xf2c2d1,
      orbitRadius: 2380,
      orbitPeriod: 96,
      initialAngle: Math.PI * 1.72,
      orbitEccentricity: 0.12,
      orbitRotation: Math.PI * 1.08,
      ...createCelestialStyle(
        "khepri",
        "small-rocky-planet",
        undefined,
        "ochre",
      ),
    },
  ];
}

export function createRingedGasGiantSystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;
  const rootId = makeId("hyperion");
  const ringBandDefinitions = [
    { key: "a", orbitRadius: 920, radiusJitter: 52, count: 8, periodStart: 26, periodStep: 1.3 },
    { key: "b", orbitRadius: 1080, radiusJitter: 64, count: 10, periodStart: 33, periodStep: 1.45 },
    { key: "c", orbitRadius: 1260, radiusJitter: 78, count: 12, periodStart: 42, periodStep: 1.55 },
  ] as const;

  const asteroidConfigs = ringBandDefinitions.flatMap((band, bandIndex) => {
    return Array.from({ length: band.count }, (_, index) => {
      const angle = ((index + (bandIndex * 0.37)) / band.count) * Math.PI * 2;
      const orbitRadius =
        band.orbitRadius +
        Math.sin(index * 1.73 + bandIndex * 0.9) * band.radiusJitter;
      const radius = 8 + ((index + bandIndex) % 5) * 2 + (bandIndex === 2 ? 1 : 0);
      const mass = 120 + radius * radius * (1.1 + bandIndex * 0.16);
      const isMeteor = (index + bandIndex) % 4 === 0;
      const rockyPalette: CelestialRockyPalette =
        bandIndex === 0
          ? "obsidian"
          : bandIndex === 1
            ? "slate"
            : "iron";

      return {
        id: makeId(`ring-${band.key}-${index + 1}`),
        name: `Hyperion Ring ${band.key.toUpperCase()}-${index + 1}`,
        systemId,
        parentId: rootId,
        hidden: false,
        rootPosition: center,
        mass,
        radius,
        color: bandIndex === 0 ? 0xa6aab5 : bandIndex === 1 ? 0xc7cbd3 : 0xe0d7ca,
        orbitRadius,
        orbitPeriod: band.periodStart + index * band.periodStep,
        initialAngle: angle,
        orbitEccentricity: 0.01 + ((index + bandIndex) % 3) * 0.015,
        orbitRotation: angle * 0.42 + bandIndex * 0.35,
        ...createCelestialStyle(
          `hyperion-ring-${band.key}-${index + 1}`,
          isMeteor ? "meteor" : "asteroid",
          undefined,
          rockyPalette,
        ),
      };
    });
  });

  return [
    {
      id: rootId,
      name: `Hyperion ${label}`,
      systemId,
      parentId: null,
      hidden: false,
      rootPosition: center,
      mass: 640000,
      radius: 242,
      color: 0xc98a53,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      ...createCelestialStyle("hyperion", "gas-giant", "extreme"),
    },
    ...asteroidConfigs,
  ];
}

export function createDefenseConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): DefenseConfig[] {
  const moon = celestialConfigs.find((config) => config.parentId !== null);
  const root = celestialConfigs.find((config) => config.parentId === null);

  if (!moon || !root) {
    return [];
  }

  return [
    {
      id: `${systemId}:selene-darkside-missile`,
      name: `Selene Darkside Launcher`,
      systemId,
      parentId: moon.id,
      weaponType: "torpedo",
      anchorToParent: "dark-side",
      darkSideRelativeToId: root.id,
      scannerRange: 1320,
      lockOnSeconds: 1.6,
      cooldownSeconds: 5.8,
      beamRange: 0,
      beamDamagePerSecond: 0,
      torpedoSpeed: 210,
      torpedoThrust: 420,
      torpedoTurnRate: 5.4,
      radius: 14,
      color: 0xff6b6b,
      orbitRadius: moon.radius + 24,
      orbitPeriod: 0,
      initialAngle: 0,
      shieldCapacity: 0.16,
      shieldRechargePerSecond: 0.03,
    },
  ];
}

export function createOuterOrbitDefenseConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): DefenseConfig[] {
  const moon = celestialConfigs.find((config) => config.parentId !== null);
  const root = celestialConfigs.find((config) => config.parentId === null);

  if (!moon || !root) {
    return [];
  }

  return [
    {
      id: `${systemId}:aurelia-outer-orbit-missile`,
      name: "Aurelia Outer Launcher",
      systemId,
      parentId: root.id,
      weaponType: "torpedo",
      anchorToParent: "orbit",
      scannerRange: 6400,
      lockOnSeconds: 1.9,
      cooldownSeconds: 6.6,
      beamRange: 0,
      beamDamagePerSecond: 0,
      torpedoSpeed: 220,
      torpedoThrust: 440,
      torpedoTurnRate: 5.1,
      radius: 15,
      color: 0xff8b72,
      orbitRadius: moon.orbitRadius + 520,
      orbitPeriod: moon.orbitPeriod * 1.45,
      initialAngle: moon.initialAngle + Math.PI * 0.82,
      shieldCapacity: 0.18,
      shieldRechargePerSecond: 0.035,
    },
  ];
}

export function createBinaryDefenseConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): DefenseConfig[] {
  const barycenter = celestialConfigs.find((config) => config.parentId === null);

  if (!barycenter) {
    return [];
  }

  return [
    {
      id: `${systemId}:raider-01`,
      name: "Janus Raider",
      systemId,
      parentId: barycenter.id,
      weaponType: "beam",
      anchorToParent: "orbit",
      scannerRange: 1380,
      lockOnSeconds: 1.2,
      cooldownSeconds: 0,
      beamRange: 430,
      beamDamagePerSecond: 0.55,
      torpedoSpeed: 0,
      torpedoThrust: 0,
      torpedoTurnRate: 0,
      radius: 18,
      color: 0xff7f9a,
      orbitRadius: 1120,
      orbitPeriod: 88,
      initialAngle: Math.PI * 0.22,
      shieldCapacity: 0.28,
      shieldRechargePerSecond: 0.045,
    },
  ];
}

export function createRefinerySiteConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): DefenseConfig[] {
  const moon = celestialConfigs.find((config) => config.parentId !== null);

  if (!moon) {
    return [];
  }

  return [
    {
      id: `${systemId}:leda-fuel-station`,
      name: "Leda Fuel Station",
      systemId,
      parentId: moon.id,
      weaponType: "station",
      anchorToParent: "fixed",
      scannerRange: 0,
      lockOnSeconds: 0,
      cooldownSeconds: 0,
      beamRange: 0,
      beamDamagePerSecond: 0,
      torpedoSpeed: 0,
      torpedoThrust: 0,
      torpedoTurnRate: 0,
      radius: 16,
      color: 0x89ffd0,
      orbitRadius: moon.radius + 24,
      orbitPeriod: 0,
      initialAngle: Math.PI * 0.18,
      shieldCapacity: 0,
      shieldRechargePerSecond: 0,
      refuelRange: 150,
      refuelPerSecond: 0.22,
    },
  ];
}

export function createDummyDisintegratorTargetConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): DefenseConfig[] {
  const moon = celestialConfigs.find((config) => config.parentId !== null);

  if (!moon) {
    return [];
  }

  const targetOrbitRadius = moon.radius + 58;
  const makeTarget = (
    idSuffix: string,
    label: string,
    initialAngle: number,
  ): DefenseConfig => ({
    id: `${systemId}:${idSuffix}`,
    name: `Selene Disintegrator Target ${label}`,
    systemId,
    parentId: moon.id,
    weaponType: "target",
    anchorToParent: "fixed",
    scannerRange: 0,
    lockOnSeconds: 0,
    cooldownSeconds: 0,
    beamRange: 0,
    beamDamagePerSecond: 0,
    torpedoSpeed: 0,
    torpedoThrust: 0,
    torpedoTurnRate: 0,
    radius: 15,
    color: 0xffcc66,
    orbitRadius: targetOrbitRadius,
    orbitPeriod: 0,
    initialAngle,
    shieldCapacity: 0,
    shieldRechargePerSecond: 0,
  });

  return [
    makeTarget("selene-disintegrator-target-alpha", "Alpha", Math.PI * 0.12),
    makeTarget("selene-disintegrator-target-beta", "Beta", Math.PI * 0.46),
    makeTarget("selene-disintegrator-target-gamma", "Gamma", Math.PI * 0.82),
  ];
}

export function createWeaponsTutorialSystemConfigs(
  systemId: string,
  label: string,
  center: Vector2Like,
): CelestialConfig[] {
  const makeId = (id: string) => `${systemId}:${id}`;

  return [
    {
      id: makeId("helion"),
      name: `Helion ${label}`,
      systemId,
      parentId: null,
      hidden: false,
      rootPosition: center,
      mass: 186000,
      radius: 138,
      color: 0x6fb5ff,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      ...createCelestialStyle(
        "helion",
        "medium-terrestrial-planet",
        "moderate",
      ),
    },
  ];
}

export function createWeaponsTutorialDefenseConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): DefenseConfig[] {
  const root = celestialConfigs.find((config) => config.parentId === null);

  if (!root) {
    return [];
  }

  const highTargetOrbitRadius = root.radius + 1120;
  const midTargetOrbitRadius = root.radius + 760;
  const lowTargetOrbitRadius = root.radius + 420;
  const launcherOrbitRadius = root.radius + 28;
  const makeTarget = (
    idSuffix: string,
    label: string,
    initialAngle: number,
    orbitPeriod: number,
    orbitRadius: number,
  ): DefenseConfig => ({
    id: `${systemId}:${idSuffix}`,
    name: `Helion Target ${label}`,
    systemId,
    parentId: root.id,
    weaponType: "target",
    anchorToParent: "orbit",
    scannerRange: 0,
    lockOnSeconds: 0,
    cooldownSeconds: 0,
    beamRange: 0,
    beamDamagePerSecond: 0,
    torpedoSpeed: 0,
    torpedoThrust: 0,
    torpedoTurnRate: 0,
    radius: 14,
    color: 0xffd27a,
    orbitRadius,
    orbitPeriod,
    initialAngle,
    shieldCapacity: 0,
    shieldRechargePerSecond: 0,
  });

  return [
    makeTarget(
      "helion-target-alpha",
      "Alpha",
      Math.PI * 0.2,
      82,
      highTargetOrbitRadius,
    ),
    makeTarget(
      "helion-target-beta",
      "Beta",
      Math.PI * 1.05,
      56,
      midTargetOrbitRadius,
    ),
    makeTarget(
      "helion-target-gamma",
      "Gamma",
      Math.PI * 1.74,
      34,
      lowTargetOrbitRadius,
    ),
    {
      id: `${systemId}:helion-surface-launcher`,
      name: "Helion Surface Launcher",
      systemId,
      parentId: root.id,
      weaponType: "torpedo",
      anchorToParent: "fixed",
      scannerRange: 980,
      lockOnSeconds: 0.95,
      cooldownSeconds: 3.7,
      beamRange: 0,
      beamDamagePerSecond: 0,
      torpedoSpeed: 156,
      torpedoThrust: 280,
      torpedoTurnRate: 3.2,
      radius: 15,
      color: 0xff8f72,
      orbitRadius: launcherOrbitRadius,
      orbitPeriod: 0,
      initialAngle: Math.PI * 0.72,
      shieldCapacity: 0.2,
      shieldRechargePerSecond: 0.03,
    },
  ];
}

export function createRefineryUtilityConfigs(
  systemId: string,
  celestialConfigs: readonly CelestialConfig[],
): CelestialConfig[] {
  void systemId;
  void celestialConfigs;
  return [];
}

export function createOrbitalFlightTrainingLayout(): SharedMapLayout {
  const startingSystem = {
    systemId: "aurelia-training",
    label: "Training",
    center: { x: 0, y: 0 },
  };
  const refinerySystem = {
    systemId: "vesta-refinery",
    label: "Vesta",
    center: { x: -4380, y: 760 },
  };
  const moonRunSystem = {
    systemId: "nadir-moon",
    label: "Nadir",
    center: { x: -4380, y: 5060 },
  };

  const trainingCelestialConfigs = createSimpleSystemConfigs(
    startingSystem.systemId,
    startingSystem.label,
    startingSystem.center,
    false,
  );
  const refineryCelestialConfigs = createRefinerySystemConfigs(
    refinerySystem.systemId,
    refinerySystem.label,
    refinerySystem.center,
  );
  const moonRunCelestialConfigs = createSingleMoonWorldSystemConfigs(
    moonRunSystem.systemId,
    moonRunSystem.label,
    moonRunSystem.center,
  );
  return {
    id: "orbital-flight-training",
    name: "Orbital Flight Training",
    mapDescription:
      "training world + Vesta fuel world + Nadir gas giant with two moons | launcher",
    celestialConfigs: [
      ...trainingCelestialConfigs,
      ...refineryCelestialConfigs,
      ...moonRunCelestialConfigs,
    ],
    defenseConfigs: [
      ...createDefenseConfigs(
        startingSystem.systemId,
        trainingCelestialConfigs,
      ),
    ],
    spawn: {
      systemId: startingSystem.systemId,
      orbitRadius: 980,
      orbitDirection: "cw",
    },
  };
}

export function createNadirGateRunLayout(): SharedMapLayout {
  const refinerySystem = {
    systemId: "vesta-refinery",
    label: "Vesta",
    center: { x: -4380, y: 760 },
  };
  const moonRunSystem = {
    systemId: "nadir-moon",
    label: "Nadir",
    center: { x: -4380, y: 5060 },
  };

  const refineryCelestialConfigs = createRefinerySystemConfigs(
    refinerySystem.systemId,
    refinerySystem.label,
    refinerySystem.center,
  );
  const moonRunCelestialConfigs = createSingleMoonWorldSystemConfigs(
    moonRunSystem.systemId,
    moonRunSystem.label,
    moonRunSystem.center,
  );

  return {
    id: "nadir-gate-run",
    name: "Nadir Gate Run",
    mapDescription:
      "Vesta refuel world + distant Nadir gas giant with two moons | randomized ten-gate flight challenge",
    celestialConfigs: [
      ...refineryCelestialConfigs,
      ...moonRunCelestialConfigs,
    ],
    defenseConfigs: [],
    spawn: {
      systemId: moonRunSystem.systemId,
      orbitRadius: 980,
      orbitDirection: "cw",
    },
  };
}

export function createAureliaCombatRangeLayout(): SharedMapLayout {
  const startingSystem = {
    systemId: "aurelia-training",
    label: "Training",
    center: { x: 0, y: 0 },
  };
  const refinerySystem = {
    systemId: "vesta-refinery",
    label: "Vesta",
    center: { x: -4380, y: 760 },
  };

  const trainingCelestialConfigs = createSimpleSystemConfigs(
    startingSystem.systemId,
    startingSystem.label,
    startingSystem.center,
    true,
  );
  const refineryCelestialConfigs = createRefinerySystemConfigs(
    refinerySystem.systemId,
    refinerySystem.label,
    refinerySystem.center,
  );

  return {
    id: "aurelia-combat-range",
    name: "Aurelia Combat Range",
    mapDescription:
      "Aurelia + Selene combat range | launcher, refinery station",
    celestialConfigs: [
      ...trainingCelestialConfigs,
      ...refineryCelestialConfigs,
    ],
    defenseConfigs: [
      ...createDefenseConfigs(
        startingSystem.systemId,
        trainingCelestialConfigs,
      ),
    ],
    spawn: {
      systemId: startingSystem.systemId,
      orbitRadius: 980,
      orbitDirection: "cw",
    },
  };
}

export function createAureliaDisintegratorRangeLayout(): SharedMapLayout {
  const startingSystem = {
    systemId: "aurelia-disintegrator-range",
    label: "Range",
    center: { x: 0, y: 0 },
  };

  const trainingCelestialConfigs = createSimpleSystemConfigs(
    startingSystem.systemId,
    startingSystem.label,
    startingSystem.center,
    true,
  );

  return {
    id: "aurelia-disintegrator-range",
    name: "Aurelia Disintegrator Range",
    mapDescription:
      "Aurelia + Selene target range | three inert disintegrator targets mounted around Selene",
    celestialConfigs: trainingCelestialConfigs,
    defenseConfigs: createDummyDisintegratorTargetConfigs(
      startingSystem.systemId,
      trainingCelestialConfigs,
    ),
    spawn: {
      systemId: startingSystem.systemId,
      orbitRadius: 980,
      orbitDirection: "cw",
    },
  };
}

export function createHelionWeaponsTutorialLayout(): SharedMapLayout {
  const tutorialSystem = {
    systemId: "helion-weapons-training",
    label: "Weapons Tutorial",
    center: { x: 0, y: 0 },
  };
  const celestialConfigs = createWeaponsTutorialSystemConfigs(
    tutorialSystem.systemId,
    tutorialSystem.label,
    tutorialSystem.center,
  );

  return {
    id: "helion-weapons-training",
    name: "Helion Weapons Tutorial",
    mapDescription:
      "Helion single-planet weapons drill | floating targets + surface dummy torpedo launcher",
    celestialConfigs,
    defenseConfigs: createWeaponsTutorialDefenseConfigs(
      tutorialSystem.systemId,
      celestialConfigs,
    ),
    spawn: {
      systemId: tutorialSystem.systemId,
      orbitRadius: 980,
      orbitDirection: "cw",
    },
  };
}

export function getSystemSpawnRootConfig(
  configs: readonly CelestialConfig[],
  systemId: string,
): CelestialConfig {
  const preferred = configs.find(
    (config) => config.systemId === systemId && config.parentId === null && !config.hidden,
  );
  if (preferred) {
    return preferred;
  }

  const fallback = configs.find(
    (config) => config.systemId === systemId && config.parentId === null,
  );
  if (!fallback) {
    throw new Error(`Missing spawn root config for system ${systemId}`);
  }

  return fallback;
}
