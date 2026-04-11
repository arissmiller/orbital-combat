import type { Vector2Like } from "../physics/vector2";

export type CelestialRenderPreset =
  | "auto"
  | "oceanic"
  | "terrestrial"
  | "earthlike"
  | "desert"
  | "gas"
  | "rocky"
  | "ice"
  | "lava";

export type CelestialBodyClass =
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

export type CelestialWeatherLevel =
  | "none"
  | "light"
  | "moderate"
  | "heavy"
  | "extreme";

export type CelestialRockyPalette =
  | "default"
  | "ash"
  | "basalt"
  | "slate"
  | "ochre"
  | "umber"
  | "rust"
  | "iron"
  | "obsidian";

export type OrbitDirection = "cw" | "ccw";

export interface CelestialConfig {
  id: string;
  name: string;
  systemId: string;
  parentId: string | null;
  hidden?: boolean;
  affectsGravity?: boolean;
  receivesGravity?: boolean;
  collisionRadius?: number;
  rootPosition: Vector2Like;
  mass: number;
  radius: number;
  color: number;
  orbitRadius: number;
  orbitPeriod: number;
  initialAngle: number;
  orbitDirection?: OrbitDirection;
  orbitCenterOffset?: Vector2Like;
  orbitEccentricity?: number;
  orbitRotation?: number;
  celestialClass?: CelestialBodyClass;
  weatherLevel?: CelestialWeatherLevel;
  renderPreset?: CelestialRenderPreset;
  renderSeed?: string;
  rockyPalette?: CelestialRockyPalette;
  refuelRange?: number;
  refuelLaneRadius?: number;
  refuelLaneThickness?: number;
  refuelPerSecond?: number;
  showRefuelMarker?: boolean;
}

export interface DefenseConfig {
  id: string;
  name: string;
  systemId: string;
  parentId: string;
  weaponType: "torpedo" | "beam" | "station" | "target";
  anchorToParent?: "orbit" | "dark-side" | "fixed";
  darkSideRelativeToId?: string;
  scannerRange: number;
  lockOnSeconds: number;
  cooldownSeconds: number;
  beamRange: number;
  beamDamagePerSecond: number;
  torpedoSpeed: number;
  torpedoThrust: number;
  torpedoTurnRate: number;
  radius: number;
  color: number;
  orbitRadius: number;
  orbitPeriod: number;
  initialAngle: number;
  orbitDirection?: OrbitDirection;
  shieldCapacity: number;
  shieldRechargePerSecond: number;
  refuelRange?: number;
  refuelPerSecond?: number;
}

export type MapSpawnOrbitDirection = OrbitDirection;

export interface MapSpawnConfig {
  systemId: string;
  orbitRadius: number;
  orbitDirection: MapSpawnOrbitDirection;
}

export interface SharedMapLayout {
  id: string;
  name: string;
  mapDescription?: string;
  celestialConfigs: CelestialConfig[];
  defenseConfigs: DefenseConfig[];
  spawn: MapSpawnConfig;
}
