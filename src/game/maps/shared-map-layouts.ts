import type { SharedMapLayout } from "./types";

export const MAP_LAB_SHARED_LAYOUT: SharedMapLayout = {
  id: "map-lab-shared",
  name: "Map Lab Shared Layout",
  mapDescription:
    "Shared authored map layout for importing into scenes and other systems.",
  spawn: {
    systemId: "aurelia-training",
    orbitRadius: 980,
    orbitDirection: "cw",
  },
  celestialConfigs: [
    {
      id: "aurelia-training:aurelia",
      name: "Aurelia Lab",
      systemId: "aurelia-training",
      parentId: null,
      hidden: false,
      rootPosition: { x: 0, y: 0 },
      mass: 170000,
      radius: 130,
      color: 0x4d9bff,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      renderSeed: "aurelia",
      celestialClass: "medium-earthlike-planet",
      weatherLevel: "moderate",
      rockyPalette: "default",
      affectsGravity: true,
      receivesGravity: true,
    },
    {
      id: "aurelia-training:selene",
      name: "Selene Lab",
      systemId: "aurelia-training",
      parentId: "aurelia-training:aurelia",
      hidden: false,
      rootPosition: { x: 0, y: 0 },
      mass: 6800,
      radius: 46,
      color: 0xbec9ff,
      orbitRadius: 1200,
      orbitPeriod: 74,
      initialAngle: Math.PI * 0.15,
      renderSeed: "selene",
      celestialClass: "rocky-moon",
      weatherLevel: "none",
      rockyPalette: "slate",
      affectsGravity: true,
      receivesGravity: true,
    },
  ],
  defenseConfigs: [
    {
      id: "aurelia-training:selene-darkside-missile",
      name: "Selene Darkside Launcher",
      systemId: "aurelia-training",
      parentId: "aurelia-training:selene",
      weaponType: "torpedo",
      anchorToParent: "dark-side",
      darkSideRelativeToId: "aurelia-training:aurelia",
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
      orbitRadius: 70,
      orbitPeriod: 0,
      initialAngle: 0,
      shieldCapacity: 0.16,
      shieldRechargePerSecond: 0.03,
    },
  ],
};

export const AureliaTrainingLabLayout: SharedMapLayout = {
  id: "aurelia-training-lab",
  name: "Aurelia Training Lab",
  spawn: {
    systemId: "aurelia-training",
    orbitRadius: 980,
    orbitDirection: "cw",
  },
  celestialConfigs: [
    {
      id: "aurelia-training:aurelia",
      name: "Aurelia Lab",
      systemId: "aurelia-training",
      parentId: null,
      rootPosition: { x: 0, y: 0 },
      mass: 170000,
      radius: 130,
      color: 0x4d9bff,
      orbitRadius: 0,
      orbitPeriod: 0,
      initialAngle: 0,
      celestialClass: "medium-earthlike-planet",
      weatherLevel: "moderate",
      rockyPalette: "default",
      renderSeed: "aurelia",
    },
    {
      id: "aurelia-training:selene",
      name: "Selene Lab",
      systemId: "aurelia-training",
      parentId: "aurelia-training:aurelia",
      rootPosition: { x: 0, y: 0 },
      mass: 6800,
      radius: 46,
      color: 0xbec9ff,
      orbitRadius: 1166.19,
      orbitPeriod: 74,
      initialAngle: 0.54,
      orbitEccentricity: 0.7,
      celestialClass: "rocky-moon",
      weatherLevel: "none",
      rockyPalette: "slate",
      renderSeed: "selene",
    },
  ],
  defenseConfigs: [
    {
      id: "aurelia-training:selene-darkside-missile",
      name: "Selene Darkside Launcher",
      systemId: "aurelia-training",
      parentId: "aurelia-training:selene",
      weaponType: "torpedo",
      anchorToParent: "dark-side",
      darkSideRelativeToId: "aurelia-training:aurelia",
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
      orbitRadius: 70,
      orbitPeriod: 0,
      initialAngle: 0,
      shieldCapacity: 0.16,
      shieldRechargePerSecond: 0.03,
    },
  ],
};

const DISCOVERED_SHARED_MAP_LAYOUT_MODULES =
  import.meta.glob("./shared-layouts/*.ts", {
    eager: true,
    import: "default",
  }) as Record<string, SharedMapLayout>;

const DISCOVERED_SHARED_MAP_LAYOUTS: Record<string, SharedMapLayout> = Object.fromEntries(
  Object.values(DISCOVERED_SHARED_MAP_LAYOUT_MODULES)
    .filter((layout) => Boolean(layout?.id))
    .map((layout) => [layout.id, layout]),
);

export const SHARED_MAP_LAYOUTS: Record<string, SharedMapLayout> = {
  [MAP_LAB_SHARED_LAYOUT.id]: MAP_LAB_SHARED_LAYOUT,
  [AureliaTrainingLabLayout.id]: AureliaTrainingLabLayout,
  ...DISCOVERED_SHARED_MAP_LAYOUTS,
};

export function getSharedMapLayout(
  layoutId: string,
): SharedMapLayout | null {
  return SHARED_MAP_LAYOUTS[layoutId] ?? null;
}
