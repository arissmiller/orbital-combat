import type { CelestialConfig } from "../maps/types";
import type { SimCelestialBodySnapshot } from "../network/multiplayer-protocol";
import type {
  MultiplayerMapBodyConfig,
  MultiplayerMapDefinition,
} from "../../../shared/multiplayer-map.js";

export function buildMultiplayerMapBodiesById(
  mapDefinition: MultiplayerMapDefinition,
): Map<string, MultiplayerMapBodyConfig> {
  return new Map(
    mapDefinition.celestialBodies.map((body) => [body.id, body] as const),
  );
}

export function buildMultiplayerCelestialConfig(
  body: SimCelestialBodySnapshot,
  mapBodyConfig: MultiplayerMapBodyConfig | undefined,
): CelestialConfig {
  const root = body.parentId === null;
  const color = mapBodyConfig?.color
    ?? (root ? 0xd48b4e : body.orbitEccentricity > 0.2 ? 0x7eb2d6 : 0x8995c9);
  return {
    id: mapBodyConfig?.id ?? body.id,
    name: mapBodyConfig?.name ?? body.name,
    systemId:
      mapBodyConfig?.parentId === null
        ? mapBodyConfig.id
        : mapBodyConfig?.parentId ?? (root ? body.id : body.parentId ?? body.id),
    parentId: mapBodyConfig?.parentId ?? body.parentId,
    rootPosition: mapBodyConfig?.rootPosition ?? { x: 0, y: 0 },
    mass: body.mass,
    radius: body.radius,
    color,
    orbitRadius: mapBodyConfig?.orbitRadius ?? 0,
    orbitPeriod: mapBodyConfig?.orbitPeriod ?? 0,
    initialAngle: mapBodyConfig?.initialAngle ?? 0,
    orbitDirection: mapBodyConfig?.orbitDirection ?? "cw",
    orbitEccentricity: body.orbitEccentricity,
    orbitRotation: mapBodyConfig?.orbitRotation ?? 0,
    renderPreset:
      mapBodyConfig?.renderPreset
      ?? (root ? "gas" : body.orbitEccentricity > 0.2 ? "ice" : "rocky"),
    celestialClass:
      mapBodyConfig?.celestialClass
      ?? (root ? "gas-giant" : "rocky-moon"),
    weatherLevel: mapBodyConfig?.weatherLevel ?? (root ? "extreme" : "light"),
    rockyPalette: mapBodyConfig?.rockyPalette,
    renderSeed: mapBodyConfig?.renderSeed ?? body.id,
  };
}

