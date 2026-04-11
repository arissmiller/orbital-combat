import { Container, Graphics } from "pixi.js";
import type {
  CelestialBodyClass,
  CelestialConfig,
  CelestialRockyPalette,
  CelestialRenderPreset,
  CelestialWeatherLevel,
} from "../maps/types";
import { WORLD_ENTITY_STYLES } from "./world-entity-styles";

type ResolvedPreset = Exclude<CelestialRenderPreset, "auto">;
type BodyShapeStyle = "sphere" | "smooth-potato" | "jagged-potato";
export type CelestialRenderStage =
  | "flat"
  | "surface"
  | "relief"
  | "full";

interface ShapePoint {
  x: number;
  y: number;
}

type LandmassCellDatum = {
  cell: {
    center: ShapePoint;
    row: number;
    col: number;
  };
  elevation: number;
  continentality: number;
  landSignal: number;
};

type LandmassComponent = {
  center: ShapePoint;
  points: ShapePoint[];
  cellCount: number;
  averageElevation: number;
  averageContinentality: number;
};

type AcceptedLandmass = {
  center: ShapePoint;
  path: ShapePoint[];
  radius: number;
  cellCount: number;
  landColor: number;
  averageElevation: number;
  averageContinentality: number;
};

type AcceptedPathRegion = {
  center: ShapePoint;
  path: ShapePoint[];
  radius: number;
};

type CloudVortex = {
  center: ShapePoint;
  influenceRadius: number;
  spin: number;
  strength: number;
  radialBias: number;
};

export interface CelestialTopographyData {
  radius: number;
  silhouettePath: Array<{ x: number; y: number }>;
  contourPaths: Array<Array<{ x: number; y: number }>>;
}

export interface CelestialTectonicPlateData {
  radius: number;
  sampleSpacing: number;
  silhouettePath: Array<{ x: number; y: number }>;
  plates: Array<{
    center: { x: number; y: number };
    drift: { x: number; y: number };
    tone: number;
  }>;
  cells: Array<{
    center: { x: number; y: number };
    plateIndex: number;
    row: number;
    col: number;
    boundary: boolean;
    jointRole?: "over" | "under";
    neighborPlateIndex?: number;
    jointStrength?: number;
  }>;
  joints: Array<{
    plateAIndex: number;
    plateBIndex: number;
    overPlateIndex: number;
    underPlateIndex: number;
    strength: number;
  }>;
}

interface CelestialSilhouette {
  style: BodyShapeStyle;
  points: ShapePoint[] | null;
  radius: number;
}

interface CelestialPalette {
  base: number;
  secondary: number;
  accent: number;
  highlight: number;
  shadow: number;
  atmosphere: number;
}

interface CelestialRenderProfile {
  bodyClass: CelestialBodyClass;
  preset: ResolvedPreset;
  weatherLevel: CelestialWeatherLevel;
  bodyShape: BodyShapeStyle;
  craterDensity: number;
  mineralPatchAlpha: number;
  bandAlpha: number;
  bandDensity: number;
  stormCount: number;
  cloudDensity: number;
  cloudAlpha: number;
  continentCountScale: number;
  continentAlpha: number;
  vegetationColor: number;
  hasIceCaps: boolean;
  fractureDensity: number;
  crackDensity: number;
  atmosphereScale: number;
  highlightScale: number;
  irregularOverlayAlpha: number;
  contourLineAlpha: number;
  edgeChunkCount: number;
  edgeChunkDepth: number;
  edgeChunkWidth: number;
  floatingRockCount: number;
  cometTailLengthScale: number;
  cometTailAlpha: number;
}

interface RockReliefProfile {
  ridgeDensity: number;
  ridgeScale: number;
  basinDensity: number;
  broadShadowAlpha: number;
  broadHighlightAlpha: number;
  ridgeShadowAlpha: number;
  ridgeHighlightAlpha: number;
}

export const CELESTIAL_SOLAR_LIGHT_DIRECTION = normalizePoint({
  x: -0.82,
  y: -0.58,
});

const ROCKY_PALETTE_SHEET: Record<
  Exclude<CelestialRockyPalette, "default">,
  CelestialPalette
> = {
  ash: {
    base: 0x928b86,
    secondary: 0x625b57,
    accent: 0xcbc2b9,
    highlight: 0xf5eee6,
    shadow: 0x211d1b,
    atmosphere: 0xddd5ce,
  },
  basalt: {
    base: 0x5d5957,
    secondary: 0x34302f,
    accent: 0x918983,
    highlight: 0xd0c7bf,
    shadow: 0x131111,
    atmosphere: 0xa6a09a,
  },
  slate: {
    base: 0x76808a,
    secondary: 0x4b5862,
    accent: 0xb6c2cb,
    highlight: 0xe8f0f7,
    shadow: 0x1a2229,
    atmosphere: 0xcfdee8,
  },
  ochre: {
    base: 0xa88c61,
    secondary: 0x74593c,
    accent: 0xd8bf8d,
    highlight: 0xf7e5b7,
    shadow: 0x302216,
    atmosphere: 0xe6ce9e,
  },
  umber: {
    base: 0x8c6a4d,
    secondary: 0x5b3f2d,
    accent: 0xc29c71,
    highlight: 0xf1d0a9,
    shadow: 0x24170f,
    atmosphere: 0xd9b48e,
  },
  rust: {
    base: 0x96604f,
    secondary: 0x66362a,
    accent: 0xc98b68,
    highlight: 0xf0b48f,
    shadow: 0x281310,
    atmosphere: 0xd8a280,
  },
  iron: {
    base: 0x7f837d,
    secondary: 0x555b56,
    accent: 0xb2b9b1,
    highlight: 0xe9eee8,
    shadow: 0x1a1f1c,
    atmosphere: 0xd2d8d0,
  },
  obsidian: {
    base: 0x3e3a42,
    secondary: 0x1e1b20,
    accent: 0x766a84,
    highlight: 0xcfc5db,
    shadow: 0x09080b,
    atmosphere: 0x9a8faa,
  },
};

export function createCelestialSprite(
  config: CelestialConfig,
  options?: {
    renderStage?: CelestialRenderStage;
  },
): Container {
  const sprite = new Container();

  if (config.hidden || config.radius <= 0) {
    return sprite;
  }

  const rng = createSeededRandom(config.renderSeed ?? config.id);
  const profile = resolveRenderProfile(config, rng);
  const renderStage = options?.renderStage ?? "full";
  const palette = createCelestialPalette(
    config.color,
    profile.preset,
    profile.bodyClass,
    config.rockyPalette,
  );
  const silhouette = createBodySilhouette(profile, config.radius, rng);
  const bodyLayer = new Container();
  const showSurfaceLayer =
    renderStage === "surface" || renderStage === "full";
  const showReliefLayer =
    renderStage === "relief" ||
    renderStage === "surface" ||
    renderStage === "full";
  const showWeatherLayer = renderStage === "full";

  if (
    renderStage === "full" &&
    profile.cometTailLengthScale > 0 &&
    profile.cometTailAlpha > 0
  ) {
    const tailLayer = new Graphics();
    drawCometTail(
      tailLayer,
      config.radius,
      rng,
      palette,
      profile.cometTailLengthScale,
      profile.cometTailAlpha,
    );
    sprite.addChild(tailLayer);
  }

  const mask = new Graphics();
  drawBodyFill(mask, silhouette, 0xffffff, 1);
  bodyLayer.mask = mask;
  sprite.addChild(mask);

  const fillLayer = new Graphics();
  drawBodyFill(fillLayer, silhouette, palette.base, 1);
  bodyLayer.addChild(fillLayer);

  if (renderStage === "full" && profile.contourLineAlpha > 0) {
    const contourLayer = new Graphics();
    drawInsetContour(
      contourLayer,
      silhouette,
      palette.shadow,
      Math.max(1, config.radius * 0.014),
      profile.contourLineAlpha,
      0.72,
      {
        x: -config.radius * 0.05,
        y: -config.radius * 0.03,
      },
    );
    bodyLayer.addChild(contourLayer);
  }

  const surfaceLayer = new Graphics();
  const weatherLayer = new Graphics();
  const tectonicPlateData =
    showSurfaceLayer && supportsTectonicPlateField(profile.bodyClass)
      ? createCelestialTectonicPlateData(config)
      : null;
  if (
    showReliefLayer &&
    profile.preset === "rocky" &&
    !usesRockyMoonTerrain(profile.bodyClass)
  ) {
    drawRockReliefShading(
      surfaceLayer,
      config.radius,
      rng,
      palette,
      getRockReliefProfile(profile.bodyClass),
    );
  }
  if (showSurfaceLayer) {
    switch (profile.preset) {
      case "oceanic":
        if (tectonicPlateData && tectonicPlateData.cells.length > 0) {
          drawPlateDrivenContinentalSurface(
            surfaceLayer,
            tectonicPlateData,
            palette,
            "oceanic",
            mixColor(palette.accent, palette.highlight, 0.22),
            profile.continentCountScale,
            profile.continentAlpha,
          );
        } else {
          drawContinentalSurface(
            surfaceLayer,
            config.radius,
            rng,
            mixColor(palette.accent, palette.highlight, 0.22),
            profile.continentCountScale,
            profile.continentAlpha,
          );
        }
        break;
      case "terrestrial":
        if (tectonicPlateData && tectonicPlateData.cells.length > 0) {
          drawPlateDrivenContinentalSurface(
            surfaceLayer,
            tectonicPlateData,
            palette,
            "terrestrial",
            mixColor(palette.secondary, profile.vegetationColor, 0.28),
            profile.continentCountScale,
            profile.continentAlpha,
          );
        } else {
          drawContinentalSurface(
            surfaceLayer,
            config.radius,
            rng,
            mixColor(palette.secondary, profile.vegetationColor, 0.28),
            profile.continentCountScale,
            profile.continentAlpha,
          );
        }
        break;
      case "earthlike":
        if (tectonicPlateData && tectonicPlateData.cells.length > 0) {
          drawPlateDrivenContinentalSurface(
            surfaceLayer,
            tectonicPlateData,
            palette,
            "earthlike",
            mixColor(profile.vegetationColor, palette.accent, 0.18),
            profile.continentCountScale,
            profile.continentAlpha,
          );
        } else {
          drawContinentalSurface(
            surfaceLayer,
            config.radius,
            rng,
            mixColor(profile.vegetationColor, palette.accent, 0.18),
            profile.continentCountScale,
            profile.continentAlpha,
          );
        }
        break;
      case "desert":
        drawBands(
          surfaceLayer,
          config.radius,
          rng,
          palette,
          Math.max(profile.bandAlpha, 0.22),
          Math.max(profile.bandDensity, 1),
        );
        break;
      case "rocky":
        if (usesRockyMoonTerrain(profile.bodyClass)) {
          drawRockyMoonTerrain(
            surfaceLayer,
            config.radius,
            rng,
            palette,
            profile.bodyClass,
            profile.craterDensity,
            Math.max(0.08, profile.mineralPatchAlpha * 0.8),
          );
        }
        if (tectonicPlateData && tectonicPlateData.cells.length > 0) {
          drawPlateDrivenContinentalSurface(
            surfaceLayer,
            tectonicPlateData,
            palette,
            "rocky",
            mixColor(palette.secondary, palette.accent, 0.36),
            profile.continentCountScale,
            Math.max(0.16, profile.mineralPatchAlpha * 0.7),
          );
        }
        break;
      case "ice":
        if (profile.hasIceCaps) {
          drawIceCaps(surfaceLayer, config.radius, palette);
        }
        if (profile.fractureDensity > 0) {
          drawIceFractures(
            surfaceLayer,
            config.radius,
            rng,
            palette,
            profile.fractureDensity,
          );
        }
        break;
      case "lava":
        if (profile.crackDensity > 0) {
          drawLavaCracks(
            surfaceLayer,
            config.radius,
            rng,
            palette,
            profile.crackDensity,
          );
        }
        break;
      case "gas":
        break;
    }
  }
  bodyLayer.addChild(surfaceLayer);

  if (showWeatherLayer) {
    switch (profile.preset) {
      case "oceanic":
      case "terrestrial":
      case "earthlike":
        if (profile.cloudDensity > 0) {
          drawCloudBands(
            weatherLayer,
            config.radius,
            rng,
            palette,
            profile.cloudDensity,
            profile.cloudAlpha,
          );
        }
        break;
      case "gas":
        drawGasBands(
          weatherLayer,
          config.radius,
          rng,
          palette,
          profile.bandAlpha,
          profile.bandDensity,
        );
        drawGasStormSpots(
          weatherLayer,
          config.radius,
          rng,
          palette,
          profile.stormCount,
          0.22 + getWeatherIntensity(profile.weatherLevel) * 0.16,
        );
        break;
      case "ice":
        if (profile.cloudDensity > 0) {
          drawCloudBands(
            weatherLayer,
            config.radius,
            rng,
            palette,
            profile.cloudDensity * 0.7,
            profile.cloudAlpha * 0.8,
          );
        }
        break;
      default:
        break;
    }
    bodyLayer.addChild(weatherLayer);
  }

  sprite.addChild(bodyLayer);

  if (renderStage === "full" && profile.floatingRockCount > 0) {
    const floatingRocksLayer = new Graphics();
    drawFloatingRocks(
      floatingRocksLayer,
      silhouette,
      rng,
      palette,
      profile.floatingRockCount,
    );
    sprite.addChild(floatingRocksLayer);
  }

  if (renderStage === "full") {
    const outlineLayer = new Graphics();
    drawAtmosphereAndOutline(
      outlineLayer,
      config,
      palette,
      profile.atmosphereScale,
      silhouette,
    );
    sprite.addChild(outlineLayer);
  }
  return sprite;
}

export function createCelestialTopographyData(
  config: CelestialConfig,
  options?: {
    contourCount?: number;
    insetStart?: number;
    insetEnd?: number;
  },
): CelestialTopographyData {
  if (config.hidden || config.radius <= 0) {
    return {
      radius: Math.max(0, config.radius),
      silhouettePath: [],
      contourPaths: [],
    };
  }

  const rng = createSeededRandom(config.renderSeed ?? config.id);
  const profile = resolveRenderProfile(config, rng);
  const silhouette = createBodySilhouette(profile, config.radius, rng);
  const contourCount = Math.max(1, Math.round(options?.contourCount ?? 6));
  const insetStart = clamp01(options?.insetStart ?? 0.9);
  const insetEnd = clamp01(options?.insetEnd ?? 0.22);

  return {
    radius: silhouette.radius,
    silhouettePath: scaleSilhouetteContour(silhouette, 1),
    contourPaths: buildTopographyContours(
      silhouette,
      contourCount,
      Math.max(insetEnd, insetStart),
      Math.min(insetEnd, insetStart),
      rng,
    ),
  };
}

export function createCelestialTectonicPlateData(
  config: CelestialConfig,
  options?: {
    plateCount?: number;
    sampleSpacing?: number;
  },
): CelestialTectonicPlateData {
  if (config.hidden || config.radius <= 0) {
    return {
      radius: Math.max(0, config.radius),
      sampleSpacing: 0,
      silhouettePath: [],
      plates: [],
      cells: [],
      joints: [],
    };
  }

  const rng = createSeededRandom(config.renderSeed ?? config.id);
  const profile = resolveRenderProfile(config, rng);
  const silhouette = createBodySilhouette(profile, config.radius, rng);
  const silhouettePath = scaleSilhouetteContour(silhouette, 1);
  if (!supportsTectonicPlateField(profile.bodyClass)) {
    return {
      radius: silhouette.radius,
      sampleSpacing: Math.max(4, silhouette.radius / 12),
      silhouettePath,
      plates: [],
      cells: [],
      joints: [],
    };
  }

  const plateCount = Math.max(
    3,
    Math.round(
      options?.plateCount ??
        getDefaultTectonicPlateCount(profile.bodyClass, config.radius),
    ),
  );
  const sampleSpacing = Math.max(
    4,
    options?.sampleSpacing ?? Math.max(4, config.radius / 14),
  );
  const bounds = getPointPathBounds(silhouettePath);
  const plates = createTectonicPlateSeeds(
    silhouettePath,
    bounds,
    plateCount,
    silhouette.radius,
    rng,
  );

  const provisionalCells: Array<{
    center: { x: number; y: number };
    plateIndex: number;
    row: number;
    col: number;
  }> = [];
  const cellIndexByGrid = new Map<string, number>();

  let row = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += sampleSpacing, row += 1) {
    let col = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x += sampleSpacing, col += 1) {
      const center = {
        x: x + sampleSpacing * 0.5,
        y: y + sampleSpacing * 0.5,
      };
      if (!pointInPointPath(center, silhouettePath)) {
        continue;
      }

      const plateIndex = assignPlateIndex(center, plates, silhouette.radius);
      cellIndexByGrid.set(`${row}:${col}`, provisionalCells.length);
      provisionalCells.push({
        center,
        plateIndex,
        row,
        col,
      });
    }
  }

  const jointData = buildTectonicJoints(
    provisionalCells,
    cellIndexByGrid,
    plates,
    silhouette.radius,
  );
  const cells = provisionalCells.map((cell) => {
    const representativeJoint = jointData.cellJointByIndex.get(
      `${cell.row}:${cell.col}`,
    );

    return {
      center: cell.center,
      plateIndex: cell.plateIndex,
      row: cell.row,
      col: cell.col,
      boundary: representativeJoint !== undefined,
      jointRole:
        representativeJoint === undefined
          ? undefined
          : representativeJoint.overPlateIndex === cell.plateIndex
            ? ("over" as const)
            : ("under" as const),
      neighborPlateIndex:
        representativeJoint === undefined
          ? undefined
          : representativeJoint.overPlateIndex === cell.plateIndex
            ? representativeJoint.underPlateIndex
            : representativeJoint.overPlateIndex,
      jointStrength: representativeJoint?.strength,
    };
  });

  return {
    radius: silhouette.radius,
    sampleSpacing,
    silhouettePath,
    plates: plates.map((plate) => ({
      center: plate.center,
      drift: plate.drift,
      tone: plate.tone,
    })),
    cells,
    joints: jointData.joints,
  };
}

function resolveRenderProfile(
  config: CelestialConfig,
  rng: () => number,
): CelestialRenderProfile {
  const bodyClass = config.celestialClass ?? inferCelestialBodyClass(config, rng);
  const weatherLevel = config.weatherLevel ?? getDefaultWeatherLevel(bodyClass);
  const preset =
    config.renderPreset && config.renderPreset !== "auto"
      ? config.renderPreset
      : getDefaultPresetForBodyClass(bodyClass);
  const weatherIntensity = getWeatherIntensity(weatherLevel);
  const weatherCoverage = getWeatherCoverageScale(weatherLevel);
  const weatherOpacity = getWeatherOpacityScale(weatherLevel);

  const baseProfile: CelestialRenderProfile = {
    bodyClass,
    preset,
    weatherLevel,
    bodyShape: "sphere",
    craterDensity: 0,
    mineralPatchAlpha: 0,
    bandAlpha: 0,
    bandDensity: 1,
    stormCount: 0,
    cloudDensity: 0,
    cloudAlpha: 0,
    continentCountScale: 0,
    continentAlpha: 0,
    vegetationColor: 0x76cb7d,
    hasIceCaps: false,
    fractureDensity: 0,
    crackDensity: 0,
    atmosphereScale: 0.3,
    highlightScale: 1,
    irregularOverlayAlpha: 0,
    contourLineAlpha: 0,
    edgeChunkCount: 0,
    edgeChunkDepth: 0,
    edgeChunkWidth: 0,
    floatingRockCount: 0,
    cometTailLengthScale: 0,
    cometTailAlpha: 0,
  };

  switch (bodyClass) {
    case "meteor":
      return {
        ...baseProfile,
        bodyShape: rng() < 0.5 ? "smooth-potato" : "jagged-potato",
        craterDensity: 0.45,
        mineralPatchAlpha: 0.18,
        atmosphereScale: 0,
        highlightScale: 0.72,
        irregularOverlayAlpha: 0.18,
        contourLineAlpha: 0.22,
        edgeChunkCount: rollEdgeChunkCount(config.radius, rng, {
          minRadius: 10,
          maxRadius: 52,
          maxChunks: 3,
          minChance: 0.18,
          maxChance: 0.82,
        }),
        edgeChunkDepth: 0.12,
        edgeChunkWidth: 0.34,
        floatingRockCount: 1 + Math.floor(rng() * 2),
      };
    case "comet":
      return {
        ...baseProfile,
        bodyShape: rng() < 0.65 ? "smooth-potato" : "jagged-potato",
        fractureDensity: 0.7,
        atmosphereScale: 0,
        highlightScale: 1.14,
        irregularOverlayAlpha: 0.1,
        edgeChunkCount: rollEdgeChunkCount(config.radius, rng, {
          minRadius: 12,
          maxRadius: 72,
          maxChunks: 2,
          minChance: 0.16,
          maxChance: 0.68,
        }),
        edgeChunkDepth: 0.08,
        edgeChunkWidth: 0.26,
        cometTailLengthScale: 1 + weatherIntensity * 0.4,
        cometTailAlpha: 0.2,
      };
    case "asteroid":
      return {
        ...baseProfile,
        bodyShape: rng() < 0.35 ? "smooth-potato" : "jagged-potato",
        craterDensity: 1.35,
        mineralPatchAlpha: 0.3,
        atmosphereScale: 0,
        highlightScale: 0.72,
        irregularOverlayAlpha: 0.28,
        contourLineAlpha: 0.18,
        edgeChunkCount: rollEdgeChunkCount(config.radius, rng, {
          minRadius: 12,
          maxRadius: 96,
          maxChunks: 5,
          minChance: 0.28,
          maxChance: 0.92,
        }),
        edgeChunkDepth: 0.16,
        edgeChunkWidth: 0.28,
        floatingRockCount: 2 + Math.floor(rng() * 3),
      };
    case "rocky-moon":
      return {
        ...baseProfile,
        craterDensity: 1.05,
        mineralPatchAlpha: 0.24,
        atmosphereScale: 0.08,
        highlightScale: 0.9,
        irregularOverlayAlpha: 0.12,
      };
    case "icy-moon":
      return {
        ...baseProfile,
        hasIceCaps: true,
        fractureDensity: 1,
        atmosphereScale: 0.12,
        highlightScale: 1.08,
      };
    case "dwarf-planet":
      return {
        ...baseProfile,
        craterDensity: 0.74,
        mineralPatchAlpha: 0.26,
        atmosphereScale: 0.18,
        highlightScale: 0.92,
        irregularOverlayAlpha: 0.14,
      };
    case "icy-dwarf":
      return {
        ...baseProfile,
        hasIceCaps: true,
        fractureDensity: 0.82,
        atmosphereScale: 0.2,
        highlightScale: 1.05,
      };
    case "small-rocky-planet":
      return {
        ...baseProfile,
        craterDensity: 0.56,
        mineralPatchAlpha: 0.3,
        atmosphereScale: 0.24,
        irregularOverlayAlpha: 0.08,
      };
    case "small-icy-planet":
      return {
        ...baseProfile,
        hasIceCaps: true,
        fractureDensity: 0.92,
        atmosphereScale: 0.28,
        highlightScale: 1.08,
        cloudDensity: weatherCoverage * 0.5,
        cloudAlpha: 0.04 + weatherOpacity * 0.08,
      };
    case "small-volcanic-planet":
      return {
        ...baseProfile,
        mineralPatchAlpha: 0.42,
        crackDensity: 1.1,
        atmosphereScale: 0.22,
        highlightScale: 0.86,
      };
    case "medium-ocean-planet":
      return {
        ...baseProfile,
        continentCountScale: 0.48,
        continentAlpha: 0.24,
        cloudDensity: 0.22 + weatherCoverage * 1.08,
        cloudAlpha: 0.07 + weatherOpacity * 0.16,
        atmosphereScale: 0.78,
        highlightScale: 1.06,
      };
    case "medium-terrestrial-planet":
      return {
        ...baseProfile,
        continentCountScale: 1,
        continentAlpha: 0.36,
        vegetationColor: 0x8ca364,
        mineralPatchAlpha: 0.22,
        cloudDensity: 0.12 + weatherCoverage * 0.82,
        cloudAlpha: 0.05 + weatherOpacity * 0.13,
        atmosphereScale: 0.64,
      };
    case "medium-earthlike-planet":
      return {
        ...baseProfile,
        continentCountScale: 1.24,
        continentAlpha: 0.42,
        vegetationColor: 0x61ce72,
        cloudDensity: 0.2 + weatherCoverage * 1.02,
        cloudAlpha: 0.08 + weatherOpacity * 0.17,
        atmosphereScale: 0.82,
        highlightScale: 1.08,
      };
    case "large-ocean-planet":
      return {
        ...baseProfile,
        continentCountScale: 0.62,
        continentAlpha: 0.26,
        cloudDensity: 0.3 + weatherCoverage * 1.18,
        cloudAlpha: 0.08 + weatherOpacity * 0.18,
        atmosphereScale: 1,
        highlightScale: 1.1,
      };
    case "large-terrestrial-planet":
      return {
        ...baseProfile,
        continentCountScale: 1.16,
        continentAlpha: 0.38,
        vegetationColor: 0x90a25f,
        mineralPatchAlpha: 0.18,
        cloudDensity: 0.14 + weatherCoverage * 0.9,
        cloudAlpha: 0.05 + weatherOpacity * 0.14,
        atmosphereScale: 0.88,
      };
    case "large-earthlike-planet":
      return {
        ...baseProfile,
        continentCountScale: 1.38,
        continentAlpha: 0.46,
        vegetationColor: 0x56d26d,
        cloudDensity: 0.24 + weatherCoverage * 1.22,
        cloudAlpha: 0.09 + weatherOpacity * 0.19,
        atmosphereScale: 1.04,
        highlightScale: 1.12,
      };
    case "gas-giant":
      return {
        ...baseProfile,
        bandAlpha: 0.24 + weatherIntensity * 0.14,
        bandDensity: 1.06 + weatherIntensity * 0.34,
        stormCount: Math.max(1, 1 + Math.round(weatherIntensity * 2)),
        atmosphereScale: 0.86,
        highlightScale: 1.1,
      };
    case "gas-supergiant":
      return {
        ...baseProfile,
        bandAlpha: 0.34 + weatherIntensity * 0.18,
        bandDensity: 1.34 + weatherIntensity * 0.44,
        stormCount: 2 + Math.round(weatherIntensity * 2),
        atmosphereScale: 1.12,
        highlightScale: 1.14,
      };
  }
}

function inferCelestialBodyClass(
  config: CelestialConfig,
  rng: () => number,
): CelestialBodyClass {
  if (config.renderPreset && config.renderPreset !== "auto") {
    return inferBodyClassFromPreset(config.renderPreset, config);
  }

  if (config.parentId !== null) {
    if (config.radius <= 12) {
      return rng() < 0.55 ? "meteor" : "asteroid";
    }
    if (config.radius <= 20) {
      return "asteroid";
    }
    if (config.radius <= 38) {
      return rng() < 0.45 ? "icy-moon" : "rocky-moon";
    }
    return "rocky-moon";
  }

  if (config.radius >= 180) {
    return "gas-supergiant";
  }
  if (config.radius >= 120) {
    return "large-earthlike-planet";
  }
  if (config.radius >= 96) {
    return "medium-terrestrial-planet";
  }
  if (config.radius >= 54) {
    return "small-rocky-planet";
  }
  return rng() < 0.5 ? "dwarf-planet" : "icy-dwarf";
}

function inferBodyClassFromPreset(
  preset: ResolvedPreset,
  config: CelestialConfig,
): CelestialBodyClass {
  switch (preset) {
    case "oceanic":
      return config.radius >= 110
        ? "large-ocean-planet"
        : "medium-ocean-planet";
    case "terrestrial":
    case "desert":
      return config.radius >= 110
        ? "large-terrestrial-planet"
        : "medium-terrestrial-planet";
    case "earthlike":
      return config.radius >= 110
        ? "large-earthlike-planet"
        : "medium-earthlike-planet";
    case "gas":
      return config.radius >= 180 ? "gas-supergiant" : "gas-giant";
    case "rocky":
      return config.parentId !== null
        ? "rocky-moon"
        : config.radius < 42
          ? "dwarf-planet"
          : "small-rocky-planet";
    case "ice":
      return config.parentId !== null
        ? "icy-moon"
        : config.radius < 42
          ? "icy-dwarf"
          : "small-icy-planet";
    case "lava":
      return "small-volcanic-planet";
  }
}

function getDefaultPresetForBodyClass(
  bodyClass: CelestialBodyClass,
): ResolvedPreset {
  switch (bodyClass) {
    case "meteor":
    case "asteroid":
    case "rocky-moon":
    case "dwarf-planet":
    case "small-rocky-planet":
      return "rocky";
    case "comet":
    case "icy-moon":
    case "icy-dwarf":
    case "small-icy-planet":
      return "ice";
    case "small-volcanic-planet":
      return "lava";
    case "medium-ocean-planet":
    case "large-ocean-planet":
      return "oceanic";
    case "medium-terrestrial-planet":
    case "large-terrestrial-planet":
      return "terrestrial";
    case "medium-earthlike-planet":
    case "large-earthlike-planet":
      return "earthlike";
    case "gas-giant":
    case "gas-supergiant":
      return "gas";
  }
}

function getDefaultWeatherLevel(
  bodyClass: CelestialBodyClass,
): CelestialWeatherLevel {
  switch (bodyClass) {
    case "meteor":
    case "comet":
    case "asteroid":
    case "rocky-moon":
    case "icy-moon":
    case "dwarf-planet":
    case "icy-dwarf":
    case "small-rocky-planet":
    case "small-icy-planet":
    case "small-volcanic-planet":
      return "none";
    case "medium-ocean-planet":
    case "medium-earthlike-planet":
      return "moderate";
    case "medium-terrestrial-planet":
      return "light";
    case "large-ocean-planet":
    case "large-earthlike-planet":
      return "heavy";
    case "large-terrestrial-planet":
    case "gas-giant":
      return "moderate";
    case "gas-supergiant":
      return "extreme";
  }
}

function getWeatherIntensity(weatherLevel: CelestialWeatherLevel): number {
  switch (weatherLevel) {
    case "none":
      return 0;
    case "light":
      return 0.28;
    case "moderate":
      return 0.54;
    case "heavy":
      return 0.8;
    case "extreme":
      return 1;
  }
}

function getWeatherCoverageScale(weatherLevel: CelestialWeatherLevel): number {
  switch (weatherLevel) {
    case "none":
      return 0;
    case "light":
      return 0.25;
    case "moderate":
      return 0.8;
    case "heavy":
      return 2.15;
    case "extreme":
      return 4.1;
  }
}

function getWeatherOpacityScale(weatherLevel: CelestialWeatherLevel): number {
  switch (weatherLevel) {
    case "none":
      return 0;
    case "light":
      return 0.32;
    case "moderate":
      return 0.72;
    case "heavy":
      return 1.6;
    case "extreme":
      return 2.9;
  }
}

function rollEdgeChunkCount(
  radius: number,
  rng: () => number,
  options: {
    minRadius: number;
    maxRadius: number;
    maxChunks: number;
    minChance: number;
    maxChance: number;
  },
): number {
  const radiusProgress = normalizeRadius(
    radius,
    options.minRadius,
    options.maxRadius,
  );
  const chunkChance = lerp(options.minChance, options.maxChance, radiusProgress);
  let chunkCount = 0;

  for (let index = 0; index < options.maxChunks; index += 1) {
    const slotChance = Math.max(0.08, chunkChance - index * 0.16);
    if (rng() < slotChance) {
      chunkCount += 1;
    }
  }

  return chunkCount;
}

function normalizeRadius(
  radius: number,
  minRadius: number,
  maxRadius: number,
): number {
  if (maxRadius <= minRadius) {
    return radius >= maxRadius ? 1 : 0;
  }

  return Math.max(0, Math.min(1, (radius - minRadius) / (maxRadius - minRadius)));
}

function createCelestialPalette(
  color: number,
  preset: ResolvedPreset,
  bodyClass: CelestialBodyClass,
  rockyPalette?: CelestialRockyPalette,
): CelestialPalette {
  const paletteOverride = resolveRockyPaletteOverride(rockyPalette, bodyClass);
  const palette = paletteOverride ?? (() => {
    switch (preset) {
    case "oceanic":
      return {
        base: mixColor(color, 0x1978d6, 0.28),
        secondary: mixColor(color, 0x093f82, 0.5),
        accent: mixColor(color, 0xd4c98c, 0.54),
        highlight: mixColor(color, 0xffffff, 0.38),
        shadow: mixColor(color, 0x071a33, 0.72),
        atmosphere: mixColor(color, 0xb4efff, 0.62),
      };
    case "terrestrial":
      return {
        base: mixColor(color, 0x927657, 0.28),
        secondary: mixColor(color, 0x65513f, 0.46),
        accent: mixColor(color, 0xa8a16c, 0.34),
        highlight: mixColor(color, 0xf0dcc1, 0.28),
        shadow: mixColor(color, 0x30261d, 0.56),
        atmosphere: mixColor(color, 0xd8c79d, 0.22),
      };
    case "earthlike":
      return {
        base: mixColor(color, 0x2d87dc, 0.24),
        secondary: mixColor(color, 0x083f74, 0.44),
        accent: mixColor(color, 0x4fca63, 0.66),
        highlight: mixColor(color, 0xffffff, 0.42),
        shadow: mixColor(color, 0x081d39, 0.66),
        atmosphere: mixColor(color, 0xa8efff, 0.64),
      };
    case "desert":
      return {
        base: mixColor(color, 0xe3bb72, 0.34),
        secondary: mixColor(color, 0xbc8856, 0.46),
        accent: mixColor(color, 0xf5dbad, 0.42),
        highlight: mixColor(color, 0xfff3da, 0.4),
        shadow: mixColor(color, 0x5f3b22, 0.52),
        atmosphere: mixColor(color, 0xf7d6a0, 0.22),
      };
    case "gas":
      return {
        base: mixColor(color, 0xd39a67, 0.16),
        secondary: mixColor(color, 0xf6dfbc, 0.48),
        accent: mixColor(color, 0xa45848, 0.52),
        highlight: mixColor(color, 0xfff6e7, 0.58),
        shadow: mixColor(color, 0x40212a, 0.62),
        atmosphere: mixColor(color, 0xffedc7, 0.42),
      };
    case "rocky":
      return {
        base: mixColor(color, 0x8c8275, 0.18),
        secondary: mixColor(color, 0x6f6458, 0.32),
        accent: mixColor(color, 0xb9aa97, 0.34),
        highlight: mixColor(color, 0xf2eadf, 0.22),
        shadow: mixColor(color, 0x2a2521, 0.5),
        atmosphere: mixColor(color, 0xe8e1d8, 0.12),
      };
    case "ice":
      return {
        base: mixColor(color, 0xcfefff, 0.24),
        secondary: mixColor(color, 0x95c7ff, 0.34),
        accent: mixColor(color, 0xf7fcff, 0.44),
        highlight: mixColor(color, 0xffffff, 0.56),
        shadow: mixColor(color, 0x406f9a, 0.48),
        atmosphere: mixColor(color, 0xdff7ff, 0.52),
      };
    case "lava":
      return {
        base: mixColor(color, 0x4b241e, 0.58),
        secondary: mixColor(color, 0x201212, 0.72),
        accent: mixColor(color, 0xff7b2f, 0.62),
        highlight: mixColor(color, 0xffd177, 0.52),
        shadow: mixColor(color, 0x100a0a, 0.76),
        atmosphere: mixColor(color, 0xffaa5f, 0.22),
      };
    }
  })();

  return boostPaletteContrast(palette, preset);
}

function resolveRockyPaletteOverride(
  rockyPalette: CelestialRockyPalette | undefined,
  bodyClass: CelestialBodyClass,
): CelestialPalette | null {
  if (
    !rockyPalette ||
    rockyPalette === "default" ||
    !supportsRockyPalette(bodyClass)
  ) {
    return null;
  }

  return ROCKY_PALETTE_SHEET[rockyPalette];
}

function supportsRockyPalette(bodyClass: CelestialBodyClass): boolean {
  switch (bodyClass) {
    case "meteor":
    case "asteroid":
    case "rocky-moon":
    case "dwarf-planet":
    case "small-rocky-planet":
    case "small-volcanic-planet":
    case "medium-terrestrial-planet":
    case "large-terrestrial-planet":
      return true;
    default:
      return false;
  }
}

function createBodySilhouette(
  profile: CelestialRenderProfile,
  radius: number,
  rng: () => number,
): CelestialSilhouette {
  switch (profile.bodyShape) {
    case "sphere":
      return {
        style: "sphere",
        points: null,
        radius,
      };
    case "smooth-potato":
      return {
        style: "smooth-potato",
        points: createPotatoPoints(radius, rng, {
          pointCount: 10,
          radialJitter: 0.07,
          angularJitter: 0.08,
          stretchX: 1.18,
          stretchY: 0.9,
          lobeAmplitude: 0.08,
          chunkCount: profile.edgeChunkCount,
          chunkDepth: profile.edgeChunkDepth,
          chunkWidth: profile.edgeChunkWidth,
        }),
        radius,
      };
    case "jagged-potato":
      return {
        style: "jagged-potato",
        points: createPotatoPoints(radius, rng, {
          pointCount: 14,
          radialJitter: 0.16,
          angularJitter: 0.14,
          stretchX: 1.14,
          stretchY: 0.88,
          lobeAmplitude: 0.12,
          chunkCount: profile.edgeChunkCount,
          chunkDepth: profile.edgeChunkDepth,
          chunkWidth: profile.edgeChunkWidth,
        }),
        radius,
      };
  }
}

function buildTopographyContours(
  silhouette: CelestialSilhouette,
  contourCount: number,
  insetStart: number,
  insetEnd: number,
  rng: () => number,
): Array<Array<{ x: number; y: number }>> {
  const contourScales = Array.from({ length: contourCount }, (_, index) => {
    const t = contourCount <= 1 ? 0 : index / (contourCount - 1);
    return lerp(insetStart, insetEnd, t);
  });
  const contourPaths: Array<Array<{ x: number; y: number }>> = [];

  for (let index = 0; index < contourScales.length; index += 1) {
    const scale = contourScales[index];
    if (scale === undefined) {
      continue;
    }

    const outerScale =
      contourScales[index - 1] ??
      Math.min(1, scale + Math.max(0.06, scale - (contourScales[index + 1] ?? insetEnd)));
    const innerScale =
      contourScales[index + 1] ??
      Math.max(0, scale - Math.max(0.06, outerScale - scale));
    const baseContour = scaleSilhouetteContour(silhouette, scale);

    contourPaths.push(
      applyTopographyDivergence(
        baseContour,
        silhouette.radius,
        scale,
        outerScale,
        innerScale,
        rng,
      ),
    );
  }

  return contourPaths;
}

function scaleSilhouetteContour(
  silhouette: CelestialSilhouette,
  scale: number,
): Array<{ x: number; y: number }> {
  if (silhouette.style === "sphere" || !silhouette.points) {
    return createCircularContourPoints(silhouette.radius * scale, 40);
  }

  return silhouette.points.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
  }));
}

function supportsTectonicPlateField(bodyClass: CelestialBodyClass): boolean {
  switch (bodyClass) {
    case "small-rocky-planet":
    case "small-volcanic-planet":
    case "medium-terrestrial-planet":
    case "medium-earthlike-planet":
    case "medium-ocean-planet":
    case "large-terrestrial-planet":
    case "large-earthlike-planet":
    case "large-ocean-planet":
      return true;
    default:
      return false;
  }
}

function usesRockyMoonTerrain(bodyClass: CelestialBodyClass): boolean {
  switch (bodyClass) {
    case "rocky-moon":
    case "dwarf-planet":
      return true;
    default:
      return false;
  }
}

function getDefaultTectonicPlateCount(
  bodyClass: CelestialBodyClass,
  radius: number,
): number {
  const radiusFactor = Math.max(0, Math.min(1, (radius - 40) / 150));

  switch (bodyClass) {
    case "small-rocky-planet":
    case "small-volcanic-planet":
      return Math.round(6 + radiusFactor * 4);
    case "medium-terrestrial-planet":
    case "medium-earthlike-planet":
    case "medium-ocean-planet":
      return Math.round(7 + radiusFactor * 5);
    case "large-terrestrial-planet":
    case "large-earthlike-planet":
    case "large-ocean-planet":
      return Math.round(9 + radiusFactor * 6);
    default:
      return 6;
  }
}

function createTectonicPlateSeeds(
  silhouettePath: ReadonlyArray<ShapePoint>,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  plateCount: number,
  radius: number,
  rng: () => number,
): Array<{
  center: { x: number; y: number };
  drift: { x: number; y: number };
  tone: number;
  noisePhase: number;
  bias: number;
}> {
  const plates: Array<{
    center: { x: number; y: number };
    drift: { x: number; y: number };
    tone: number;
    noisePhase: number;
    bias: number;
  }> = [];

  let attempts = 0;
  const maxAttempts = plateCount * 48;
  while (plates.length < plateCount && attempts < maxAttempts) {
    attempts += 1;
    const candidate = {
      x: lerp(bounds.minX, bounds.maxX, rng()),
      y: lerp(bounds.minY, bounds.maxY, rng()),
    };
    if (!pointInPointPath(candidate, silhouettePath)) {
      continue;
    }
    if (distanceToPointPath(candidate, silhouettePath) < radius * 0.1) {
      continue;
    }

    let tooClose = false;
    for (const plate of plates) {
      if (
        Math.hypot(
          plate.center.x - candidate.x,
          plate.center.y - candidate.y,
        ) <
        radius * 0.26
      ) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) {
      continue;
    }

    const driftDirection = normalizePoint({
      x: rng() * 2 - 1,
      y: rng() * 2 - 1,
    });
    plates.push({
      center: candidate,
      drift: {
        x: driftDirection.x * (0.18 + rng() * 0.24),
        y: driftDirection.y * (0.18 + rng() * 0.24),
      },
      tone: rng() * 2 - 1,
      noisePhase: rng() * Math.PI * 2,
      bias: 0.84 + rng() * 0.34,
    });
  }

  if (plates.length === 0) {
    plates.push({
      center: { x: 0, y: 0 },
      drift: { x: 0, y: 0 },
      tone: 0,
      noisePhase: 0,
      bias: 1,
    });
  }

  return plates;
}

function assignPlateIndex(
  point: { x: number; y: number },
  plates: ReadonlyArray<{
    center: { x: number; y: number };
    drift: { x: number; y: number };
    tone: number;
    noisePhase: number;
    bias: number;
  }>,
  radius: number,
): number {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < plates.length; index += 1) {
    const plate = plates[index];
    if (!plate) {
      continue;
    }

    const dx = point.x - plate.center.x;
    const dy = point.y - plate.center.y;
    const distance = Math.hypot(dx, dy);
    const directionalBias = dx * plate.drift.x + dy * plate.drift.y;
    const fieldNoise =
      Math.sin((dx / radius) * 4.2 + plate.noisePhase) +
      Math.cos((dy / radius) * 3.6 - plate.noisePhase * 0.7);
    const score =
      distance * plate.bias -
      directionalBias * radius * 0.14 -
      fieldNoise * radius * 0.035;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function buildTectonicJoints(
  cells: ReadonlyArray<{
    center: { x: number; y: number };
    plateIndex: number;
    row: number;
    col: number;
  }>,
  cellIndexByGrid: ReadonlyMap<string, number>,
  plates: ReadonlyArray<{
    center: { x: number; y: number };
    drift: { x: number; y: number };
    tone: number;
    noisePhase: number;
    bias: number;
  }>,
  radius: number,
): {
  joints: Array<{
    plateAIndex: number;
    plateBIndex: number;
    overPlateIndex: number;
    underPlateIndex: number;
    strength: number;
  }>;
  cellJointByIndex: Map<
    string,
    {
      plateAIndex: number;
      plateBIndex: number;
      overPlateIndex: number;
      underPlateIndex: number;
      strength: number;
    }
  >;
} {
  const pairCounts = new Map<string, number>();

  for (const cell of cells) {
    const rightNeighborIndex = cellIndexByGrid.get(`${cell.row}:${cell.col + 1}`);
    const downNeighborIndex = cellIndexByGrid.get(`${cell.row + 1}:${cell.col}`);

    for (const neighborIndex of [rightNeighborIndex, downNeighborIndex]) {
      if (neighborIndex === undefined) {
        continue;
      }

      const neighbor = cells[neighborIndex];
      if (!neighbor || neighbor.plateIndex === cell.plateIndex) {
        continue;
      }

      const pairKey = createPlatePairKey(cell.plateIndex, neighbor.plateIndex);
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
    }
  }

  const joints = Array.from(pairCounts.entries()).map(([pairKey, count]) => {
    const [plateAIndex, plateBIndex] = parsePlatePairKey(pairKey);
    const resolvedJoint = resolveTectonicJoint(
      plateAIndex,
      plateBIndex,
      plates,
      radius,
    );

    return {
      plateAIndex,
      plateBIndex,
      overPlateIndex: resolvedJoint.overPlateIndex,
      underPlateIndex: resolvedJoint.underPlateIndex,
      strength: count,
    };
  });

  const jointByPair = new Map(
    joints.map((joint) => [createPlatePairKey(joint.plateAIndex, joint.plateBIndex), joint]),
  );
  const cellJointByIndex = new Map<
    string,
    {
      plateAIndex: number;
      plateBIndex: number;
      overPlateIndex: number;
      underPlateIndex: number;
      strength: number;
    }
  >();

  for (const cell of cells) {
    let bestJoint:
      | {
          plateAIndex: number;
          plateBIndex: number;
          overPlateIndex: number;
          underPlateIndex: number;
          strength: number;
        }
      | undefined;

    for (const [neighborRow, neighborCol] of [
      [cell.row - 1, cell.col],
      [cell.row + 1, cell.col],
      [cell.row, cell.col - 1],
      [cell.row, cell.col + 1],
    ]) {
      const neighborIndex = cellIndexByGrid.get(`${neighborRow}:${neighborCol}`);
      if (neighborIndex === undefined) {
        continue;
      }

      const neighbor = cells[neighborIndex];
      if (!neighbor || neighbor.plateIndex === cell.plateIndex) {
        continue;
      }

      const joint = jointByPair.get(
        createPlatePairKey(cell.plateIndex, neighbor.plateIndex),
      );
      if (!joint) {
        continue;
      }

      if (!bestJoint || joint.strength > bestJoint.strength) {
        bestJoint = joint;
      }
    }

    if (bestJoint) {
      cellJointByIndex.set(`${cell.row}:${cell.col}`, bestJoint);
    }
  }

  return {
    joints,
    cellJointByIndex,
  };
}

function resolveTectonicJoint(
  plateAIndex: number,
  plateBIndex: number,
  plates: ReadonlyArray<{
    center: { x: number; y: number };
    drift: { x: number; y: number };
    tone: number;
    noisePhase: number;
    bias: number;
  }>,
  radius: number,
): {
  overPlateIndex: number;
  underPlateIndex: number;
} {
  const plateA = plates[plateAIndex];
  const plateB = plates[plateBIndex];
  if (!plateA || !plateB) {
    return {
      overPlateIndex: plateAIndex,
      underPlateIndex: plateBIndex,
    };
  }

  const towardB = normalizePoint({
    x: plateB.center.x - plateA.center.x,
    y: plateB.center.y - plateA.center.y,
  });
  const towardA = {
    x: -towardB.x,
    y: -towardB.y,
  };
  const compressionA = dotPoint(plateA.drift, towardB);
  const compressionB = dotPoint(plateB.drift, towardA);
  const scoreA =
    plateA.tone * 0.52 +
    compressionA * 1.4 +
    (Math.hypot(plateA.center.x, plateA.center.y) / Math.max(1, radius)) * 0.08;
  const scoreB =
    plateB.tone * 0.52 +
    compressionB * 1.4 +
    (Math.hypot(plateB.center.x, plateB.center.y) / Math.max(1, radius)) * 0.08;

  if (scoreA === scoreB) {
    return plateAIndex <= plateBIndex
      ? {
          overPlateIndex: plateAIndex,
          underPlateIndex: plateBIndex,
        }
      : {
          overPlateIndex: plateBIndex,
          underPlateIndex: plateAIndex,
        };
  }

  return scoreA > scoreB
    ? {
        overPlateIndex: plateAIndex,
        underPlateIndex: plateBIndex,
      }
    : {
        overPlateIndex: plateBIndex,
        underPlateIndex: plateAIndex,
      };
}

function createPlatePairKey(plateAIndex: number, plateBIndex: number): string {
  return plateAIndex < plateBIndex
    ? `${plateAIndex}:${plateBIndex}`
    : `${plateBIndex}:${plateAIndex}`;
}

function parsePlatePairKey(pairKey: string): [number, number] {
  const [left, right] = pairKey.split(":");
  return [Number(left), Number(right)];
}

function dotPoint(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return left.x * right.x + left.y * right.y;
}

function getPointPathBounds(
  path: ReadonlyArray<{ x: number; y: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of path) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function pointInPointPath(
  point: { x: number; y: number },
  polygon: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false;

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];
    if (!current || !previous) {
      continue;
    }

    const intersects =
      (current.y > point.y) !== (previous.y > point.y) &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y + Number.EPSILON) +
          current.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToPointPath(
  point: { x: number; y: number },
  path: ReadonlyArray<{ x: number; y: number }>,
): number {
  let minDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length; index += 1) {
    const start = path[index];
    const end = path[(index + 1) % path.length];
    if (!start || !end) {
      continue;
    }

    minDistanceSquared = Math.min(
      minDistanceSquared,
      distanceToSegmentSquared(point, start, end),
    );
  }

  return Math.sqrt(minDistanceSquared);
}

function distanceToSegmentSquared(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared <= Number.EPSILON) {
    const pointDeltaX = point.x - start.x;
    const pointDeltaY = point.y - start.y;
    return pointDeltaX * pointDeltaX + pointDeltaY * pointDeltaY;
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
        lengthSquared,
    ),
  );
  const projectionX = start.x + deltaX * t;
  const projectionY = start.y + deltaY * t;
  const distanceX = point.x - projectionX;
  const distanceY = point.y - projectionY;
  return distanceX * distanceX + distanceY * distanceY;
}

function createCircularContourPoints(
  radius: number,
  pointCount: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

function applyTopographyDivergence(
  contour: ReadonlyArray<{ x: number; y: number }>,
  silhouetteRadius: number,
  scale: number,
  outerScale: number,
  innerScale: number,
  rng: () => number,
): Array<{ x: number; y: number }> {
  if (contour.length === 0) {
    return [];
  }

  const availableOuter = Math.max(0, outerScale - scale);
  const availableInner = Math.max(0, scale - innerScale);
  const maxOffsetScale = Math.max(
    0.003,
    Math.min(
      availableOuter > 0 ? availableOuter * 0.34 : Number.POSITIVE_INFINITY,
      availableInner > 0 ? availableInner * 0.34 : Number.POSITIVE_INFINITY,
    ),
  );

  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const phaseC = rng() * Math.PI * 2;
  const frequencyA = 2 + Math.floor(rng() * 3);
  const frequencyB = 4 + Math.floor(rng() * 4);
  const layerBias = (rng() - 0.5) * 0.18;

  return contour.map((point, index) => {
    const angle = Math.atan2(point.y, point.x);
    const orbitT = contour.length <= 1 ? 0 : index / contour.length;
    const wave =
      Math.sin(angle * frequencyA + phaseA) * 0.58 +
      Math.sin(angle * frequencyB + phaseB) * 0.28 +
      Math.sin(orbitT * Math.PI * 2 + phaseC) * 0.14 +
      layerBias;
    const offsetScale = Math.max(-1, Math.min(1, wave)) * maxOffsetScale;
    const distance = Math.hypot(point.x, point.y);

    if (distance <= 0.000001) {
      return point;
    }

    const direction = {
      x: point.x / distance,
      y: point.y / distance,
    };
    const targetDistance = Math.max(
      0,
      distance + silhouetteRadius * offsetScale,
    );

    return {
      x: direction.x * targetDistance,
      y: direction.y * targetDistance,
    };
  });
}

function drawBodyFill(
  graphics: Graphics,
  silhouette: CelestialSilhouette,
  color: number,
  alpha: number,
): void {
  if (silhouette.style === "sphere" || !silhouette.points) {
    graphics.circle(0, 0, silhouette.radius);
    graphics.fill({ color, alpha });
    return;
  }

  traceSilhouettePath(graphics, silhouette);
  graphics.fill({ color, alpha });
}

function drawBodyStroke(
  graphics: Graphics,
  silhouette: CelestialSilhouette,
  color: number,
  width: number,
  alpha: number,
): void {
  if (silhouette.style === "sphere" || !silhouette.points) {
    graphics.circle(0, 0, silhouette.radius);
    graphics.stroke({ color, width, alpha });
    return;
  }

  traceSilhouettePath(graphics, silhouette);
  graphics.stroke({ color, width, alpha });
}

function drawInsetContour(
  graphics: Graphics,
  silhouette: CelestialSilhouette,
  color: number,
  width: number,
  alpha: number,
  scale: number,
  offset: ShapePoint,
): void {
  if (!silhouette.points || silhouette.style === "sphere") {
    return;
  }

  const insetSilhouette: CelestialSilhouette = {
    style: silhouette.style,
    radius: silhouette.radius * scale,
    points: silhouette.points.map((point) => ({
      x: point.x * scale + offset.x,
      y: point.y * scale + offset.y,
    })),
  };

  traceSilhouettePath(graphics, insetSilhouette);
  graphics.stroke({
    color,
    width,
    alpha,
    cap: "round",
    join: "round",
  });
}

function traceSilhouettePath(
  graphics: Graphics,
  silhouette: CelestialSilhouette,
): void {
  if (!silhouette.points || silhouette.points.length === 0) {
    return;
  }

  if (silhouette.style === "jagged-potato") {
    graphics.poly(flattenPoints(silhouette.points), true);
    return;
  }

  const points = silhouette.points;
  const first = points[0];
  if (!first) {
    return;
  }

  graphics.moveTo(first.x, first.y);

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];

    if (!current || !next) {
      continue;
    }

    const midpoint = {
      x: (current.x + next.x) * 0.5,
      y: (current.y + next.y) * 0.5,
    };
    graphics.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
  }

  graphics.closePath();
}

function createPotatoPoints(
  radius: number,
  rng: () => number,
  options: {
    pointCount: number;
    radialJitter: number;
    angularJitter: number;
    stretchX: number;
    stretchY: number;
    lobeAmplitude: number;
    chunkCount: number;
    chunkDepth: number;
    chunkWidth: number;
  },
): ShapePoint[] {
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const sampleLobe = (angle: number) =>
    Math.sin(angle * 2 + phaseA) * options.lobeAmplitude +
    Math.sin(angle * 3 + phaseB) * options.lobeAmplitude * 0.6;
  const chunks = Array.from({ length: options.chunkCount }, () => {
    const angle = rng() * Math.PI * 2;
    const boundaryRadius =
      radius * (0.84 + sampleLobe(angle) * 0.7);
    const biteRadius =
      radius *
      options.chunkDepth *
      (0.82 + rng() * 0.28 + options.chunkWidth * 0.35);
    const center = {
      x: Math.cos(angle) * boundaryRadius * options.stretchX,
      y: Math.sin(angle) * boundaryRadius * options.stretchY,
    };
    const centerDistance = Math.max(1, Math.hypot(center.x, center.y));
    const angularSpan =
      Math.asin(Math.min(0.98, biteRadius / centerDistance)) *
      (0.92 + options.chunkWidth * 0.55);

    return {
      angle,
      angularSpan,
      center,
      radius: biteRadius,
    };
  });
  const sampleAngles = buildPotatoSampleAngles(options.pointCount, chunks);
  const points: ShapePoint[] = [];

  for (const sampleAngle of sampleAngles) {
    const angle = sampleAngle + (rng() - 0.5) * options.angularJitter * 0.45;
    const lobe = sampleLobe(angle);
    const localRadius =
      radius *
      Math.max(0.46, 0.8 + lobe + (rng() - 0.5) * options.radialJitter);
    const basePoint = {
      x: Math.cos(angle) * localRadius * options.stretchX,
      y: Math.sin(angle) * localRadius * options.stretchY,
    };
    const baseDistance = Math.hypot(basePoint.x, basePoint.y);

    if (baseDistance === 0) {
      points.push(basePoint);
      continue;
    }

    const direction = {
      x: basePoint.x / baseDistance,
      y: basePoint.y / baseDistance,
    };
    let carvedDistance = baseDistance;

    for (const chunk of chunks) {
      const hit = intersectRayCircle(direction, chunk.center, chunk.radius);
      if (!hit) {
        continue;
      }

      if (hit.enter > 0 && hit.enter < carvedDistance) {
        carvedDistance = hit.enter;
      }
    }

    points.push({
      x: direction.x * carvedDistance,
      y: direction.y * carvedDistance,
    });
  }

  const maxDistance = Math.max(
    ...points.map((point) => Math.hypot(point.x, point.y)),
    1,
  );
  const scale = (radius * 0.98) / maxDistance;

  return points.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
  }));
}

function buildPotatoSampleAngles(
  basePointCount: number,
  chunks: ReadonlyArray<{
    angle: number;
    angularSpan: number;
  }>,
): number[] {
  const sampleAngles = Array.from({ length: basePointCount }, (_, index) =>
    (index / basePointCount) * Math.PI * 2,
  );

  for (const chunk of chunks) {
    sampleAngles.push(
      phaseWrap(chunk.angle - chunk.angularSpan),
      phaseWrap(chunk.angle - chunk.angularSpan * 0.45),
      phaseWrap(chunk.angle),
      phaseWrap(chunk.angle + chunk.angularSpan * 0.45),
      phaseWrap(chunk.angle + chunk.angularSpan),
    );
  }

  sampleAngles.sort((a, b) => a - b);

  return sampleAngles.filter((angle, index, values) => {
    if (index === 0) {
      return true;
    }
    return values[index - 1] !== undefined && angle - values[index - 1] > 0.02;
  });
}

function flattenPoints(points: readonly ShapePoint[]): number[] {
  const flat: number[] = [];
  for (const point of points) {
    flat.push(point.x, point.y);
  }
  return flat;
}

function boostPaletteContrast(
  palette: CelestialPalette,
  preset: ResolvedPreset,
): CelestialPalette {
  switch (preset) {
    case "oceanic":
      return {
        base: mixColor(palette.base, 0x0f55a8, 0.12),
        secondary: mixColor(palette.secondary, 0x081b3d, 0.18),
        accent: mixColor(palette.accent, 0x8bff9f, 0.2),
        highlight: mixColor(palette.highlight, 0xffffff, 0.18),
        shadow: mixColor(palette.shadow, 0x000000, 0.18),
        atmosphere: mixColor(palette.atmosphere, 0xc5f6ff, 0.12),
      };
    case "terrestrial":
    case "desert":
      return {
        base: mixColor(palette.base, 0x8f6a45, 0.1),
        secondary: mixColor(palette.secondary, 0x2a1b11, 0.18),
        accent: mixColor(palette.accent, 0xffe3a2, 0.16),
        highlight: mixColor(palette.highlight, 0xffffff, 0.14),
        shadow: mixColor(palette.shadow, 0x000000, 0.16),
        atmosphere: mixColor(palette.atmosphere, 0xffe1ac, 0.08),
      };
    case "earthlike":
      return {
        base: mixColor(palette.base, 0x1b69c4, 0.12),
        secondary: mixColor(palette.secondary, 0x071b39, 0.16),
        accent: mixColor(palette.accent, 0x7fff84, 0.18),
        highlight: mixColor(palette.highlight, 0xffffff, 0.18),
        shadow: mixColor(palette.shadow, 0x000000, 0.16),
        atmosphere: mixColor(palette.atmosphere, 0xd9fbff, 0.16),
      };
    case "gas":
      return {
        base: mixColor(palette.base, 0xd09060, 0.08),
        secondary: mixColor(palette.secondary, 0x5d342f, 0.16),
        accent: mixColor(palette.accent, 0xf59d78, 0.16),
        highlight: mixColor(palette.highlight, 0xffffff, 0.18),
        shadow: mixColor(palette.shadow, 0x000000, 0.14),
        atmosphere: mixColor(palette.atmosphere, 0xfff1d6, 0.1),
      };
    case "rocky":
      return {
        base: mixColor(palette.base, 0x8a7c68, 0.08),
        secondary: mixColor(palette.secondary, 0x1f1a16, 0.18),
        accent: mixColor(palette.accent, 0xe0c7a7, 0.18),
        highlight: mixColor(palette.highlight, 0xffffff, 0.14),
        shadow: mixColor(palette.shadow, 0x000000, 0.18),
        atmosphere: mixColor(palette.atmosphere, 0xffffff, 0.06),
      };
    case "ice":
      return {
        base: mixColor(palette.base, 0xbfe6ff, 0.08),
        secondary: mixColor(palette.secondary, 0x4e86bd, 0.14),
        accent: mixColor(palette.accent, 0xffffff, 0.16),
        highlight: mixColor(palette.highlight, 0xffffff, 0.22),
        shadow: mixColor(palette.shadow, 0x17385d, 0.14),
        atmosphere: mixColor(palette.atmosphere, 0xf3feff, 0.14),
      };
    case "lava":
      return {
        base: mixColor(palette.base, 0x3e1a16, 0.1),
        secondary: mixColor(palette.secondary, 0x000000, 0.14),
        accent: mixColor(palette.accent, 0xff9a3f, 0.18),
        highlight: mixColor(palette.highlight, 0xffefb0, 0.16),
        shadow: mixColor(palette.shadow, 0x000000, 0.16),
        atmosphere: mixColor(palette.atmosphere, 0xffc27a, 0.1),
      };
  }
}

function drawBands(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  alphaScale: number,
  densityScale: number,
): void {
  const bandCount = Math.max(
    4,
    Math.round((radius / 24 + 2) * densityScale),
  );

  for (let index = 0; index < bandCount; index += 1) {
    const y =
      lerp(-radius * 0.72, radius * 0.72, (index + 0.5) / bandCount) +
      (rng() - 0.5) * radius * 0.12;
    const bandHeight = Math.max(5, radius * (0.08 + rng() * 0.07));
    const halfWidth = getInteriorHalfWidth(radius, y, radius * 0.06);

    if (halfWidth <= bandHeight * 0.6) {
      continue;
    }

    const color = index % 2 === 0 ? palette.secondary : palette.accent;
    graphics.roundRect(
      -halfWidth,
      y - bandHeight * 0.5,
      halfWidth * 2,
      bandHeight,
      bandHeight * 0.5,
    );
    graphics.fill({
      color,
      alpha: alphaScale * (0.72 + rng() * 0.24),
    });
  }
}

function drawGasBands(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  alphaScale: number,
  densityScale: number,
): void {
  const bandCount = Math.max(
    5,
    Math.round((radius / 22 + 3) * densityScale),
  );
  const bandColors = [
    mixColor(palette.shadow, palette.secondary, 0.44),
    mixColor(palette.secondary, palette.base, 0.28),
    mixColor(palette.base, palette.accent, 0.52),
    mixColor(palette.accent, palette.highlight, 0.34),
  ];

  for (let index = 0; index < bandCount; index += 1) {
    const y =
      lerp(-radius * 0.8, radius * 0.8, (index + 0.5) / bandCount) +
      (rng() - 0.5) * radius * 0.12;
    const bandHeight = Math.max(5, radius * (0.07 + rng() * 0.075));
    const halfWidth = getInteriorHalfWidth(radius, y, -radius * 0.1);

    if (halfWidth <= bandHeight * 0.55) {
      continue;
    }

    const color = bandColors[index % bandColors.length] ?? palette.accent;
    graphics.roundRect(
      -halfWidth,
      y - bandHeight * 0.5,
      halfWidth * 2,
      bandHeight,
      bandHeight * 0.5,
    );
    graphics.fill({
      color,
      alpha: alphaScale * (0.84 + rng() * 0.34),
    });

    if (rng() < 0.56) {
      const streakHeight = bandHeight * (0.2 + rng() * 0.22);
      const streakOffset = (rng() - 0.5) * bandHeight * 0.34;
      const streakColor =
        index % 2 === 0
          ? mixColor(palette.highlight, palette.accent, 0.26)
          : mixColor(palette.shadow, palette.secondary, 0.28);
      graphics.roundRect(
        -halfWidth,
        y - streakHeight * 0.5 + streakOffset,
        halfWidth * 2,
        streakHeight,
        streakHeight * 0.5,
      );
      graphics.fill({
        color: streakColor,
        alpha: alphaScale * (0.22 + rng() * 0.16),
      });
    }
  }
}

function drawStormSpots(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  count: number,
  alphaScale: number,
): void {
  if (count <= 0 || radius < 42) {
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const centerX = (rng() * 0.7 - 0.35) * radius;
    const centerY = (rng() * 0.66 - 0.33) * radius;
    const spotWidth = radius * (0.12 + rng() * 0.1);
    const spotHeight = spotWidth * (0.48 + rng() * 0.22);

    graphics.ellipse(centerX, centerY, spotWidth, spotHeight);
    graphics.fill({
      color: index % 2 === 0 ? palette.accent : palette.secondary,
      alpha: alphaScale,
    });

    graphics.ellipse(
      centerX - spotWidth * 0.12,
      centerY - spotHeight * 0.08,
      spotWidth * 0.72,
      spotHeight * 0.7,
    );
    graphics.fill({
      color: palette.highlight,
      alpha: alphaScale * 0.36,
    });
  }
}

function drawGasStormSpots(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  count: number,
  alphaScale: number,
): void {
  if (count <= 0 || radius < 42) {
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const centerX = (rng() * 0.76 - 0.38) * radius;
    const centerY = (rng() * 0.68 - 0.34) * radius;
    const spotWidth = radius * (0.12 + rng() * 0.12);
    const spotHeight = spotWidth * (0.44 + rng() * 0.2);
    const outerColor =
      index % 2 === 0
        ? mixColor(palette.accent, palette.shadow, 0.18)
        : mixColor(palette.secondary, palette.highlight, 0.18);

    graphics.ellipse(centerX, centerY, spotWidth, spotHeight);
    graphics.fill({
      color: outerColor,
      alpha: alphaScale * 1.05,
    });

    graphics.ellipse(
      centerX - spotWidth * 0.12,
      centerY - spotHeight * 0.08,
      spotWidth * 0.72,
      spotHeight * 0.68,
    );
    graphics.fill({
      color: mixColor(palette.highlight, palette.accent, 0.18),
      alpha: alphaScale * 0.42,
    });
  }
}

function drawCraterField(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  densityScale: number,
): void {
  const craterCount = Math.max(4, Math.round((radius / 12) * densityScale));

  for (let index = 0; index < craterCount; index += 1) {
    const craterRadius = radius * (0.045 + rng() * 0.08);
    const center = randomPointInDisk(radius * 0.72, rng);

    graphics.circle(center.x, center.y, craterRadius);
    graphics.fill({
      color: palette.shadow,
      alpha: 0.24 + rng() * 0.16,
    });
    graphics.circle(
      center.x - craterRadius * 0.18,
      center.y - craterRadius * 0.14,
      craterRadius * 0.72,
    );
    graphics.fill({
      color: palette.highlight,
      alpha: 0.08 + rng() * 0.08,
    });
    graphics.circle(center.x, center.y, craterRadius);
    graphics.stroke({
      color: palette.shadow,
      width: Math.max(1, radius * 0.01),
      alpha: 0.2,
    });
  }
}

function drawRockyMoonTerrain(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  bodyClass: CelestialBodyClass,
  craterDensity: number,
  albedoAlpha: number,
): void {
  const isRockyMoon = bodyClass === "rocky-moon";
  const highlandColor = mixColor(palette.base, palette.highlight, 0.16);
  const basinColor = mixColor(palette.secondary, palette.shadow, 0.32);
  const mariaColor = mixColor(palette.secondary, palette.shadow, 0.54);
  const rimColor = mixColor(palette.highlight, palette.accent, 0.42);
  const floorShadowColor = mixColor(palette.shadow, palette.secondary, 0.28);
  const basinCount =
    isRockyMoon
      ? clamp(Math.round(radius / 34), 2, 4)
      : clamp(Math.round(radius / 34), 1, 4);
  const mariaChance = isRockyMoon ? 0.86 : 0.46;
  const acceptedBasinRegions: AcceptedPathRegion[] = [];
  const acceptedMariaRegions: AcceptedPathRegion[] = [];

  if (!isRockyMoon) {
    const albedoPatchCount = Math.max(2, Math.round(radius / 34));
    for (let index = 0; index < albedoPatchCount; index += 1) {
      const patchRadius = radius * (0.14 + rng() * 0.09);
      const center = randomFeatureCenterInBody(radius, patchRadius, rng, 0.08);
      drawBlob(
        graphics,
        center,
        patchRadius,
        radius * 0.82,
        7 + Math.floor(rng() * 4),
        rng,
        index % 2 === 0
          ? highlandColor
          : mixColor(palette.base, palette.secondary, 0.12),
        albedoAlpha * (0.16 + rng() * 0.08),
      );
    }
  }

  for (let basinIndex = 0; basinIndex < basinCount; basinIndex += 1) {
    const majorRadius = isRockyMoon
      ? radius * (0.22 + rng() * 0.14)
      : radius * (0.16 + rng() * 0.12);
    const minorRadius = majorRadius * (0.78 + rng() * 0.24);
    const center = randomFeatureCenterInBody(
      radius,
      majorRadius * 1.08,
      rng,
      0.14,
    );
    const rotation = rng() * Math.PI * 2;
    const basinPath = buildRotatedEllipsePath(
      center,
      majorRadius * 1.08,
      minorRadius * 1.08,
      rotation,
      28,
    );
    const basinRegion: AcceptedPathRegion = {
      center,
      path: basinPath,
      radius: estimatePathRadius(basinPath, center),
    };
    if (
      isRockyMoon &&
      pathOverlapsAcceptedRegions(
        basinRegion,
        acceptedBasinRegions,
        0.12,
        0.04,
        0.78,
      )
    ) {
      continue;
    }
    graphics.poly(flattenPoints(basinPath), true);
    graphics.fill({
      color: basinColor,
      alpha: 0.16 + rng() * 0.08,
    });
    if (isRockyMoon) {
      acceptedBasinRegions.push(basinRegion);
    }

    const floorCenter = {
      x: center.x + CELESTIAL_SOLAR_LIGHT_DIRECTION.x * majorRadius * 0.06,
      y: center.y + CELESTIAL_SOLAR_LIGHT_DIRECTION.y * majorRadius * 0.06,
    };
    const hasMaria = rng() < mariaChance;
    const mariaScale = isRockyMoon ? 0.9 + rng() * 0.05 : 0.84;
    const floorScale = hasMaria ? mariaScale : 0.76;
    const floorPath = buildRotatedEllipsePath(
      floorCenter,
      majorRadius * floorScale,
      minorRadius * floorScale,
      rotation,
      24,
    );
    const floorRegion: AcceptedPathRegion = {
      center: floorCenter,
      path: floorPath,
      radius: estimatePathRadius(floorPath, floorCenter),
    };
    const renderAsMaria =
      hasMaria &&
      (!isRockyMoon ||
        !pathOverlapsAcceptedRegions(
          floorRegion,
          acceptedMariaRegions,
          0.18,
          0.08,
          0.72,
        ));
    graphics.poly(flattenPoints(floorPath), true);
    graphics.fill({
      color: renderAsMaria ? mariaColor : floorShadowColor,
      alpha: renderAsMaria
        ? isRockyMoon
          ? 0.32 + rng() * 0.12
          : 0.24 + rng() * 0.1
        : 0.12 + rng() * 0.06,
    });

    if (renderAsMaria) {
      acceptedMariaRegions.push(floorRegion);
    }

    if (renderAsMaria && isRockyMoon && rng() < 0.58) {
      const lobeCenter = {
        x: floorCenter.x + (rng() * 2 - 1) * majorRadius * 0.18,
        y: floorCenter.y + (rng() * 2 - 1) * minorRadius * 0.16,
      };
      const lobePath = buildRotatedEllipsePath(
        lobeCenter,
        majorRadius * (0.42 + rng() * 0.18),
        minorRadius * (0.38 + rng() * 0.16),
        rotation + (rng() * 2 - 1) * 0.4,
        20,
      );
      const lobeRegion: AcceptedPathRegion = {
        center: lobeCenter,
        path: lobePath,
        radius: estimatePathRadius(lobePath, lobeCenter),
      };
      if (
        !pathOverlapsAcceptedRegions(
          lobeRegion,
          acceptedMariaRegions,
          0.12,
          0.05,
          0.68,
        )
      ) {
        graphics.poly(flattenPoints(lobePath), true);
        graphics.fill({
          color: mariaColor,
          alpha: 0.18 + rng() * 0.1,
        });
        acceptedMariaRegions.push(lobeRegion);
      }
    }

    graphics.poly(flattenPoints(basinPath), true);
    graphics.stroke({
      color: rimColor,
      width: Math.max(1, radius * 0.008),
      alpha: 0.16 + rng() * 0.08,
      join: "round",
    });

    const innerRimPath = buildRotatedEllipsePath(
      center,
      majorRadius * 0.92,
      minorRadius * 0.92,
      rotation,
      24,
    );
    graphics.poly(flattenPoints(innerRimPath), true);
    graphics.stroke({
      color: mixColor(basinColor, palette.shadow, 0.36),
      width: Math.max(0.8, radius * 0.005),
      alpha: 0.16,
      join: "round",
    });
  }

  drawHierarchicalCraterField(
    graphics,
    radius,
    rng,
    palette,
    bodyClass,
    craterDensity,
  );
}

function drawHierarchicalCraterField(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  bodyClass: CelestialBodyClass,
  densityScale: number,
): void {
  const isRockyMoon = bodyClass === "rocky-moon";
  drawCraterTier(graphics, radius, rng, palette, {
    count: Math.max(1, Math.round((radius / 54) * densityScale)),
    minScale: 0.05,
    maxScale: 0.11,
    floorAlpha: 0.18,
    rimAlpha: 0.2,
    edgeAllowance: 0.16,
  });
  drawCraterTier(graphics, radius, rng, palette, {
    count: Math.max(3, Math.round((radius / 24) * densityScale * 1.2)),
    minScale: 0.022,
    maxScale: 0.055,
    floorAlpha: 0.14,
    rimAlpha: 0.16,
    edgeAllowance: 0.1,
  });
  drawCraterTier(graphics, radius, rng, palette, {
    count: Math.max(
      isRockyMoon ? 18 : 8,
      Math.round((radius / (isRockyMoon ? 9 : 11)) * densityScale * (isRockyMoon ? 2.6 : 1.5)),
    ),
    minScale: isRockyMoon ? 0.007 : 0.009,
    maxScale: isRockyMoon ? 0.02 : 0.026,
    floorAlpha: 0.1,
    rimAlpha: 0.12,
    edgeAllowance: isRockyMoon ? 0.04 : 0.06,
  });
  if (isRockyMoon) {
    drawCraterTier(graphics, radius, rng, palette, {
      count: Math.max(40, Math.round((radius / 6.5) * densityScale * 3.4)),
      minScale: 0.0035,
      maxScale: 0.011,
      floorAlpha: 0.07,
      rimAlpha: 0.08,
      edgeAllowance: 0.02,
    });
  }
}

function drawCraterTier(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  options: {
    count: number;
    minScale: number;
    maxScale: number;
    floorAlpha: number;
    rimAlpha: number;
    edgeAllowance: number;
  },
): void {
  for (let index = 0; index < options.count; index += 1) {
    const craterRadius =
      radius * (options.minScale + rng() * (options.maxScale - options.minScale));
    const craterCenter = randomFeatureCenterInBody(
      radius,
      craterRadius,
      rng,
      options.edgeAllowance,
    );
    const eccentricity = rng() < 0.3 ? 0.72 + rng() * 0.18 : 1;
    const majorRadius = craterRadius;
    const minorRadius = craterRadius * eccentricity;
    const rotation = rng() * Math.PI * 2;
    const rimPath = buildRotatedEllipsePath(
      craterCenter,
      majorRadius,
      minorRadius,
      rotation,
      18,
    );
    graphics.poly(flattenPoints(rimPath), true);
    graphics.fill({
      color: mixColor(palette.shadow, palette.secondary, 0.26),
      alpha: options.floorAlpha + rng() * 0.06,
    });

    const highlightCenter = {
      x: craterCenter.x - CELESTIAL_SOLAR_LIGHT_DIRECTION.x * craterRadius * 0.18,
      y: craterCenter.y - CELESTIAL_SOLAR_LIGHT_DIRECTION.y * craterRadius * 0.18,
    };
    const highlightPath = buildRotatedEllipsePath(
      highlightCenter,
      majorRadius * 0.68,
      minorRadius * 0.68,
      rotation,
      16,
    );
    graphics.poly(flattenPoints(highlightPath), true);
    graphics.fill({
      color: palette.highlight,
      alpha: options.floorAlpha * 0.3,
    });

    graphics.poly(flattenPoints(rimPath), true);
    graphics.stroke({
      color: mixColor(palette.shadow, palette.highlight, 0.18),
      width: Math.max(0.8, radius * 0.0045),
      alpha: options.rimAlpha,
      join: "round",
    });
  }
}

function drawRockReliefShading(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  reliefProfile: RockReliefProfile,
): void {
  const lightDirection = CELESTIAL_SOLAR_LIGHT_DIRECTION;
  const shadowColor = mixColor(palette.shadow, palette.secondary, 0.24);
  const midtoneColor = mixColor(palette.secondary, palette.accent, 0.18);
  const highlightColor = mixColor(palette.highlight, palette.accent, 0.14);

  if (reliefProfile.broadShadowAlpha > 0.001) {
    graphics.ellipse(
      radius * 0.12,
      radius * 0.16,
      radius * 0.86,
      radius * 0.74,
    );
    graphics.fill({
      color: shadowColor,
      alpha: reliefProfile.broadShadowAlpha,
    });
  }

  if (reliefProfile.broadHighlightAlpha > 0.001) {
    graphics.ellipse(
      -radius * 0.18,
      -radius * 0.22,
      radius * 0.46,
      radius * 0.36,
    );
    graphics.fill({
      color: highlightColor,
      alpha: reliefProfile.broadHighlightAlpha,
    });
  }

  const ridgeCount = Math.max(
    3,
    Math.round((radius / 18) * reliefProfile.ridgeDensity),
  );
  for (let index = 0; index < ridgeCount; index += 1) {
    const ridgeRadius =
      radius * (0.08 + rng() * 0.08) * reliefProfile.ridgeScale;
    const ridgeCenter = constrainPointToDisk(
      {
        x: (rng() * 0.7 - 0.35) * radius - lightDirection.x * radius * 0.08,
        y: (rng() * 0.64 - 0.32) * radius - lightDirection.y * radius * 0.06,
      },
      radius * 0.72,
    );
    const shadowCenter = {
      x: ridgeCenter.x - lightDirection.x * ridgeRadius * 0.28,
      y: ridgeCenter.y - lightDirection.y * ridgeRadius * 0.28,
    };
    const midtoneCenter = {
      x: ridgeCenter.x + lightDirection.x * ridgeRadius * 0.04,
      y: ridgeCenter.y + lightDirection.y * ridgeRadius * 0.04,
    };
    const highlightCenter = {
      x: ridgeCenter.x + lightDirection.x * ridgeRadius * 0.24,
      y: ridgeCenter.y + lightDirection.y * ridgeRadius * 0.24,
    };

    drawBlob(
      graphics,
      shadowCenter,
      ridgeRadius * (1.02 + rng() * 0.12),
      radius * 0.88,
      7 + Math.floor(rng() * 3),
      rng,
      shadowColor,
      reliefProfile.ridgeShadowAlpha * (0.82 + rng() * 0.22),
    );
    drawBlob(
      graphics,
      midtoneCenter,
      ridgeRadius * (0.84 + rng() * 0.08),
      radius * 0.86,
      7 + Math.floor(rng() * 3),
      rng,
      midtoneColor,
      reliefProfile.ridgeShadowAlpha * 0.28,
    );
    drawBlob(
      graphics,
      highlightCenter,
      ridgeRadius * (0.58 + rng() * 0.08),
      radius * 0.84,
      6 + Math.floor(rng() * 3),
      rng,
      highlightColor,
      reliefProfile.ridgeHighlightAlpha * (0.82 + rng() * 0.24),
    );
  }

  const basinCount = Math.max(
    1,
    Math.round((radius / 32) * reliefProfile.basinDensity),
  );
  for (let index = 0; index < basinCount; index += 1) {
    const basinRadius = radius * (0.16 + rng() * 0.1);
    const basinCenter = constrainPointToDisk(
      {
        x: (rng() * 0.74 - 0.37) * radius,
        y: (rng() * 0.6 - 0.3) * radius,
      },
      radius * 0.62,
    );

    drawBlob(
      graphics,
      {
        x: basinCenter.x + lightDirection.x * basinRadius * 0.12,
        y: basinCenter.y + lightDirection.y * basinRadius * 0.12,
      },
      basinRadius * 0.82,
      radius * 0.84,
      8 + Math.floor(rng() * 4),
      rng,
      highlightColor,
      reliefProfile.ridgeHighlightAlpha * 0.28,
    );
    drawBlob(
      graphics,
      {
        x: basinCenter.x - lightDirection.x * basinRadius * 0.16,
        y: basinCenter.y - lightDirection.y * basinRadius * 0.16,
      },
      basinRadius,
      radius * 0.82,
      8 + Math.floor(rng() * 4),
      rng,
      shadowColor,
      reliefProfile.ridgeShadowAlpha * 0.38,
    );
  }
}

function drawSolarTerminatorShading(
  graphics: Graphics,
  radius: number,
  palette: CelestialPalette,
  lightDirection: { x: number; y: number },
): void {
  const darkColor = mixColor(palette.shadow, 0x000000, 0.24);
  const lightColor = mixColor(palette.highlight, palette.atmosphere, 0.42);

  graphics.circle(
    -lightDirection.x * radius * 0.28,
    -lightDirection.y * radius * 0.28,
    radius * 1.04,
  );
  graphics.fill({
    color: darkColor,
    alpha: 0.2,
  });

  graphics.circle(
    -lightDirection.x * radius * 0.56,
    -lightDirection.y * radius * 0.56,
    radius * 0.88,
  );
  graphics.fill({
    color: darkColor,
    alpha: 0.12,
  });

  graphics.ellipse(
    lightDirection.x * radius * 0.18,
    lightDirection.y * radius * 0.18,
    radius * 0.66,
    radius * 0.54,
  );
  graphics.fill({
    color: lightColor,
    alpha: 0.1,
  });
}

function drawContinentalSurface(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  surfaceColor: number,
  countScale: number,
  alpha: number,
): void {
  const continentCount = Math.max(
    2,
    Math.round((radius / 62) * (0.9 + countScale * 1.1)),
  );
  const coastShadowColor = mixColor(surfaceColor, 0x17321b, 0.18);

  for (let index = 0; index < continentCount; index += 1) {
    const lobeCount = 3 + Math.floor(rng() * 3 + countScale);
    const driftDirection = rng() < 0.5 ? -1 : 1;
    const latitude = (rng() * 1 - 0.5) * radius * 0.54;
    const driftX = radius * (0.08 + rng() * 0.04) * driftDirection;
    let center = constrainPointToDisk(
      {
        x: (rng() * 0.34 - 0.17) * radius,
        y: latitude * (0.78 + rng() * 0.18),
      },
      radius * 0.64,
    );

    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const progression =
        lobeCount <= 1 ? 0.5 : lobeIndex / (lobeCount - 1);
      const blobRadius =
        radius *
        (0.13 + rng() * 0.07) *
        (0.9 + Math.sin(progression * Math.PI) * 0.22);

      drawBlob(
        graphics,
        {
          x: center.x + blobRadius * 0.08,
          y: center.y + blobRadius * 0.06,
        },
        blobRadius * 1.02,
        radius * 0.9,
        9 + Math.floor(rng() * 4),
        rng,
        coastShadowColor,
        alpha * 0.2,
      );
      drawBlob(
        graphics,
        center,
        blobRadius,
        radius * 0.88,
        9 + Math.floor(rng() * 4),
        rng,
        surfaceColor,
        alpha * (0.88 + rng() * 0.12),
      );

      center = constrainPointToDisk(
        {
          x:
            center.x +
            driftX * (0.88 + rng() * 0.36) +
            (rng() - 0.5) * radius * 0.05,
          y:
            center.y +
            (rng() - 0.5) * radius * 0.08 +
            Math.sin(progression * Math.PI) * driftDirection * radius * 0.018,
        },
        radius * 0.66,
      );
    }

    const islandCount = 1 + Math.floor(rng() * 3);
    for (let islandIndex = 0; islandIndex < islandCount; islandIndex += 1) {
      const islandCenter = constrainPointToDisk(
        {
          x: center.x + (rng() - 0.5) * radius * 0.28,
          y: center.y + (rng() - 0.5) * radius * 0.18,
        },
        radius * 0.78,
      );
      drawBlob(
        graphics,
        islandCenter,
        radius * (0.035 + rng() * 0.03),
        radius * 0.86,
        7 + Math.floor(rng() * 3),
        rng,
        surfaceColor,
        alpha * 0.72,
      );
    }
  }
}

function drawPlateDrivenContinentalSurface(
  graphics: Graphics,
  plateData: CelestialTectonicPlateData,
  palette: CelestialPalette,
  preset: "oceanic" | "terrestrial" | "earthlike" | "rocky",
  surfaceColor: number,
  continentCountScale: number,
  alpha: number,
): void {
  if (plateData.cells.length === 0) {
    return;
  }

  const style = getPlateSurfaceStyle(preset);
  const cellRadius = Math.max(1.2, plateData.sampleSpacing * 0.54);
  const highColor = mixColor(surfaceColor, palette.highlight, style.highBlend);
  const lowColor = mixColor(surfaceColor, palette.secondary, style.lowBlend);
  const basinColor = mixColor(palette.base, palette.shadow, style.basinBlend);
  const mountainColor = mixColor(surfaceColor, palette.highlight, 0.54);
  const transitionColor = mixColor(palette.base, surfaceColor, style.transitionBlend);
  const deepWaterColor = mixColor(palette.base, palette.shadow, style.oceanBlend);
  const trenchColor = mixColor(basinColor, palette.shadow, 0.38);
  const highlandColor = mixColor(surfaceColor, palette.highlight, 0.3);
  const mareColor = mixColor(lowColor, basinColor, 0.44);
  const coastlineColor = mixColor(lowColor, palette.shadow, 0.44);
  const adjustedLandThreshold =
    style.landThreshold - (continentCountScale - 1) * 0.18;
  const adjustedTransitionThreshold =
    style.transitionThreshold - (continentCountScale - 1) * 0.1;
  const cellRenderData: Array<{
    cell: CelestialTectonicPlateData["cells"][number];
    plate: CelestialTectonicPlateData["plates"][number];
    elevation: number;
    crustSignal: number;
    continentality: number;
    landSignal: number;
    transitionSignal: number;
    jointStrength: number;
  }> = [];
  const plateStats = plateData.plates.map(() => ({
    cellCount: 0,
    elevationSum: 0,
    crustSignalSum: 0,
    continentalitySum: 0,
  }));
  const plateRegionBuckets = plateData.plates.map(() => ({
    highland: [] as ShapePoint[],
    mare: [] as ShapePoint[],
  }));

  for (const cell of plateData.cells) {
    const plate = plateData.plates[cell.plateIndex];
    if (!plate) {
      continue;
    }

    const elevation = computePlateSurfaceElevation(cell, plate, plateData);
    const crustSignal = computePlateCrustSignal(cell, plate, plateData);
    const jointStrength = clamp01((cell.jointStrength ?? 0) / 6);
    const continentality =
      crustSignal * style.crustWeight +
      elevation * style.elevationWeight +
      (cell.jointRole === "over"
        ? style.overBias
        : cell.jointRole === "under"
          ? -style.underBias
          : 0);
    const landSignal = continentality - adjustedLandThreshold;
    const transitionSignal = continentality - adjustedTransitionThreshold;
    cellRenderData.push({
      cell,
      plate,
      elevation,
      crustSignal,
      continentality,
      landSignal,
      transitionSignal,
      jointStrength,
    });
    const plateStat = plateStats[cell.plateIndex];
    if (plateStat) {
      plateStat.cellCount += 1;
      plateStat.elevationSum += elevation;
      plateStat.crustSignalSum += crustSignal;
      plateStat.continentalitySum += continentality;
    }
    const bucket = plateRegionBuckets[cell.plateIndex];
    if (bucket) {
      if (preset === "rocky") {
        if (continentality >= 0) {
          bucket.highland.push(cell.center);
        } else {
          bucket.mare.push(cell.center);
        }
      }
    }
  }

  if (preset !== "rocky") {
    const landmassComponents = buildLandmassComponents(
      cellRenderData,
      plateData.sampleSpacing,
      plateData.radius,
      continentCountScale,
      preset,
    );
    const landMassMaxDistance = plateData.radius * 0.996;
    const acceptedLandmasses: AcceptedLandmass[] = [];

    for (const component of landmassComponents) {
      let path = buildContinentalLandmassPath(
        component,
        cellRadius * 1.12,
        landMassMaxDistance,
      );
      if (path.length < 3) {
        continue;
      }
      const islandScale =
        component.cellCount <= 3
          ? 0.68
          : component.cellCount <= 5
            ? 0.8
            : component.cellCount <= 8
              ? 0.92
              : 1;
      const presetScale =
        preset === "oceanic"
          ? component.cellCount <= 4
            ? 0.62
            : component.cellCount <= 8
              ? 0.74
              : 0.84
          : preset === "earthlike"
            ? component.cellCount <= 4
              ? 0.88
              : component.cellCount <= 8
                ? 0.94
                : 1
            : 1;
      const finalScale = Math.min(islandScale, presetScale);
      if (finalScale < 1) {
        path = scalePathToward(path, component.center, finalScale);
      }
      const pathRadius = estimatePathRadius(path, component.center);
      let overlapsExistingLandmass = false;
      for (const accepted of acceptedLandmasses) {
        const overlapFraction = getSymmetricPathOverlapFraction(
          path,
          accepted.path,
        );
        const centerInsideAccepted = pointInPolygon(component.center, accepted.path);
        const acceptedCenterInsideCandidate = pointInPolygon(
          accepted.center,
          path,
        );
        const centersAreTooClose =
          Math.hypot(
            component.center.x - accepted.center.x,
            component.center.y - accepted.center.y,
          ) <
          (pathRadius + accepted.radius) * 0.66;
        const overlapThreshold =
          component.cellCount <= 3
            ? 0.03
            : component.cellCount <= 6
              ? 0.06
              : 0.14;
        if (
          centerInsideAccepted ||
          acceptedCenterInsideCandidate ||
          overlapFraction >= overlapThreshold ||
          (centersAreTooClose && overlapFraction >= overlapThreshold * 0.5)
        ) {
          overlapsExistingLandmass = true;
          break;
        }
      }
      if (overlapsExistingLandmass) {
        continue;
      }

      const landColor =
        component.averageElevation >= 0
          ? mixColor(
              surfaceColor,
              highColor,
              clamp01(
                component.averageElevation * 0.38 +
                  clamp01(component.averageContinentality) * 0.22,
              ),
            )
          : mixColor(
              surfaceColor,
              lowColor,
              clamp01(Math.abs(component.averageElevation) * 0.14 + 0.08),
            );
      drawPlateRegionMass(
        graphics,
        component.center,
        path,
        landColor,
        0.94,
        coastlineColor,
        0.58,
        component.cellCount >= 8 ? [0.9, 0.78] : [0.88],
        alpha * 0.1,
      );
      drawLandBiomePatches(
        graphics,
        {
          center: component.center,
          path,
          radius: pathRadius,
          cellCount: component.cellCount,
          landColor,
          averageElevation: component.averageElevation,
          averageContinentality: component.averageContinentality,
        },
        palette,
        preset,
        plateData.radius,
        alpha,
      );
      acceptedLandmasses.push({
        center: component.center,
        path,
        radius: pathRadius,
        cellCount: component.cellCount,
        landColor,
        averageElevation: component.averageElevation,
        averageContinentality: component.averageContinentality,
      });
    }

    drawArchipelagoChains(
      graphics,
      acceptedLandmasses,
      palette,
      preset,
      coastlineColor,
      continentCountScale,
      cellRadius,
      landMassMaxDistance,
      alpha,
    );
  }

  for (let plateIndex = 0; plateIndex < plateData.plates.length; plateIndex += 1) {
    const plate = plateData.plates[plateIndex];
    const stat = plateStats[plateIndex];
    if (!plate || !stat || stat.cellCount === 0) {
      continue;
    }

    const meanElevation = stat.elevationSum / stat.cellCount;
    const meanContinentality = stat.continentalitySum / stat.cellCount;
    const coverage = Math.sqrt(stat.cellCount / Math.max(plateData.cells.length, 1));
    const driftDirection = normalizePoint(plate.drift);
    const normalDirection = {
      x: -driftDirection.y,
      y: driftDirection.x,
    };
    const seed = `${preset}:${plateIndex}:${Math.round(meanContinentality * 1000)}:${Math.round(plate.tone * 1000)}`;
    const plateRng = createSeededRandom(seed);
    const maxDistanceFromOrigin = plateData.radius * 0.992;
    const primaryRadius = Math.max(
      plateData.sampleSpacing * 2.8,
      Math.min(
        plateData.radius * 0.34,
        Math.sqrt(stat.cellCount) * plateData.sampleSpacing * (0.76 + coverage * 0.18),
      ),
    );
    const secondaryRadius = primaryRadius * 0.72;
    const tertiaryRadius = primaryRadius * 0.54;
    let foundationColor: number;
    let foundationAlpha: number;

    if (preset === "rocky") {
      foundationColor =
        meanContinentality >= 0
          ? mixColor(surfaceColor, highlandColor, clamp01(meanContinentality * 0.64 + 0.18))
          : mixColor(surfaceColor, mareColor, clamp01(Math.abs(meanContinentality) * 0.84 + 0.18));
      foundationAlpha = alpha * (0.14 + Math.abs(meanContinentality) * 0.1);
    } else if (meanContinentality > adjustedLandThreshold) {
      foundationColor =
        meanElevation >= 0
          ? mixColor(surfaceColor, highColor, clamp01(meanElevation * 0.44 + 0.2))
          : mixColor(surfaceColor, lowColor, clamp01(Math.abs(meanElevation) * 0.18 + 0.08));
      foundationAlpha = alpha * (0.16 + clamp01(meanContinentality) * 0.12);
    } else if (meanContinentality > adjustedTransitionThreshold) {
      foundationColor = mixColor(transitionColor, surfaceColor, 0.28);
      foundationAlpha = alpha * 0.14;
    } else {
      foundationColor = mixColor(
        deepWaterColor,
        trenchColor,
        clamp01(Math.abs(meanContinentality) * 0.34),
      );
      foundationAlpha = alpha * (0.14 + clamp01(Math.abs(meanContinentality)) * 0.08);
    }

    if (preset === "rocky") {
      drawBlob(
        graphics,
        plate.center,
        primaryRadius,
        maxDistanceFromOrigin,
        9 + Math.floor(plateRng() * 3),
        plateRng,
        foundationColor,
        foundationAlpha,
      );

      const driftOffset = primaryRadius * (0.34 + plateRng() * 0.18);
      const lateralOffset = primaryRadius * (plateRng() * 0.24 - 0.12);
      drawBlob(
        graphics,
        constrainPointToDisk(
          {
            x:
              plate.center.x +
              driftDirection.x * driftOffset +
              normalDirection.x * lateralOffset,
            y:
              plate.center.y +
              driftDirection.y * driftOffset +
              normalDirection.y * lateralOffset,
          },
          maxDistanceFromOrigin,
        ),
        secondaryRadius,
        maxDistanceFromOrigin,
        8 + Math.floor(plateRng() * 3),
        plateRng,
        foundationColor,
        foundationAlpha * 0.84,
      );

      if (stat.cellCount >= 8) {
        drawBlob(
          graphics,
          constrainPointToDisk(
            {
              x:
                plate.center.x -
                driftDirection.x * primaryRadius * (0.16 + plateRng() * 0.12) +
                normalDirection.x * primaryRadius * (plateRng() * 0.3 - 0.15),
              y:
                plate.center.y -
                driftDirection.y * primaryRadius * (0.16 + plateRng() * 0.12) +
                normalDirection.y * primaryRadius * (plateRng() * 0.3 - 0.15),
            },
            maxDistanceFromOrigin,
          ),
          tertiaryRadius,
          maxDistanceFromOrigin,
          7 + Math.floor(plateRng() * 3),
          plateRng,
          foundationColor,
          foundationAlpha * 0.72,
        );
      }
    }

    const regionBucket = plateRegionBuckets[plateIndex];
    if (!regionBucket) {
      continue;
    }

    if (preset === "rocky") {
      drawPlateRegionMass(
        graphics,
        plate.center,
        buildPlateRegionPath(
          plate.center,
          regionBucket.mare,
          cellRadius,
          maxDistanceFromOrigin,
        ),
        mixColor(surfaceColor, mareColor, 0.8),
        alpha * 0.28,
        mixColor(mareColor, basinColor, 0.46),
        alpha * 0.14,
        [0.82],
        alpha * 0.08,
      );
      drawPlateRegionMass(
        graphics,
        plate.center,
        buildPlateRegionPath(
          plate.center,
          regionBucket.highland,
          cellRadius,
          maxDistanceFromOrigin,
        ),
        mixColor(surfaceColor, highlandColor, 0.82),
        alpha * 0.34,
        mixColor(highlandColor, mountainColor, 0.42),
        alpha * 0.16,
        [0.84, 0.68],
        alpha * 0.08,
      );
    }
  }

  for (const cellData of cellRenderData) {
    const {
      cell,
      elevation,
      continentality,
    } = cellData;

    if (preset !== "rocky") {
      continue;
    }

    const rockyColor =
      continentality >= 0
        ? mixColor(
            surfaceColor,
            highlandColor,
            clamp01(continentality * 0.78 + Math.max(0, elevation) * 0.24),
          )
        : mixColor(
            surfaceColor,
            mareColor,
            clamp01(Math.abs(continentality) * 0.86 + Math.abs(Math.min(0, elevation)) * 0.18),
          );
    graphics.circle(cell.center.x, cell.center.y, cellRadius);
    graphics.fill({
      color: rockyColor,
      alpha: alpha * (0.1 + Math.abs(continentality) * 0.08),
    });
  }
}

function buildLandmassComponents(
  cellRenderData: ReadonlyArray<LandmassCellDatum>,
  sampleSpacing: number,
  radius: number,
  continentCountScale: number,
  preset: "oceanic" | "terrestrial" | "earthlike" | "rocky",
): LandmassComponent[] {
  const landCells = cellRenderData.filter((cell) => cell.landSignal > 0);
  const cellByGrid = new Map<string, (typeof landCells)[number]>(
    landCells.map((cell) => [`${cell.cell.row}:${cell.cell.col}`, cell] as const),
  );
  const visited = new Set<string>();
  const rawComponents: Array<typeof landCells> = [];
  const neighborOffsets = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  for (const startCell of landCells) {
    const startKey = `${startCell.cell.row}:${startCell.cell.col}`;
    if (visited.has(startKey)) {
      continue;
    }

    const queue = [startCell];
    const componentCells: typeof landCells = [];
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      componentCells.push(current);

      for (const [rowOffset, colOffset] of neighborOffsets) {
        const neighborKey = `${current.cell.row + rowOffset}:${current.cell.col + colOffset}`;
        if (visited.has(neighborKey)) {
          continue;
        }
        const neighbor = cellByGrid.get(neighborKey);
        if (!neighbor) {
          continue;
        }
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }

    if (componentCells.length === 0) {
      continue;
    }

    rawComponents.push(componentCells);
  }

  const totalLandCellCount = rawComponents.reduce(
    (sum, component) => sum + component.length,
    0,
  );
  const desiredContinentCount = estimateDesiredContinentCount(
    radius,
    sampleSpacing,
    continentCountScale,
    preset,
    totalLandCellCount,
  );
  const remainingPotentialSplits = Math.max(
    0,
    desiredContinentCount - rawComponents.length,
  );

  return rawComponents
    .sort((a, b) => b.length - a.length)
    .flatMap((componentCells, componentIndex) => {
      const sizeShare = componentCells.length / Math.max(totalLandCellCount, 1);
      const largeEnoughToSplit =
        componentCells.length >= 10 &&
        sizeShare >= 0.22 &&
        componentIndex < Math.max(1, remainingPotentialSplits + 1);
      const suggestedSplitCount = largeEnoughToSplit
        ? clamp(
            Math.round(sizeShare * desiredContinentCount + 0.35),
            1,
            1 + Math.min(3, remainingPotentialSplits),
          )
        : 1;
      const splitCount = Math.min(
        suggestedSplitCount,
        Math.max(1, Math.floor(componentCells.length / 6)),
      );
      if (splitCount <= 1) {
        return [createLandmassComponent(componentCells, sampleSpacing)];
      }
      const splitComponents = splitLandmassCells(
        componentCells,
        sampleSpacing,
        splitCount,
      );
      return splitComponents.length > 0
        ? splitComponents
        : [createLandmassComponent(componentCells, sampleSpacing)];
    })
    .filter((component) => component.cellCount >= 2)
    .sort((a, b) => b.cellCount - a.cellCount);
}

function estimateDesiredContinentCount(
  radius: number,
  sampleSpacing: number,
  continentCountScale: number,
  preset: "oceanic" | "terrestrial" | "earthlike" | "rocky",
  totalLandCellCount: number,
): number {
  const presetBias =
    preset === "oceanic" ? 1.02 : preset === "earthlike" ? 1.3 : 1;
  const radiusBias = clamp(radius / Math.max(sampleSpacing * 18, 1), 0.9, 2.4);
  const cellBias = clamp(Math.sqrt(totalLandCellCount) / 3.4, 0.8, 2.1);
  return clamp(
    Math.round(radiusBias * cellBias * presetBias * (0.9 + continentCountScale * 0.5)),
    preset === "oceanic" ? 3 : 3,
    7,
  );
}

function createLandmassComponent(
  componentCells: ReadonlyArray<LandmassCellDatum>,
  sampleSpacing: number,
): LandmassComponent {
  const total = componentCells.reduce(
    (accumulator, current) => {
      return {
        x: accumulator.x + current.cell.center.x,
        y: accumulator.y + current.cell.center.y,
        elevation: accumulator.elevation + current.elevation,
        continentality: accumulator.continentality + current.continentality,
      };
    },
    { x: 0, y: 0, elevation: 0, continentality: 0 },
  );
  const center = {
    x: total.x / componentCells.length,
    y: total.y / componentCells.length,
  };
  const expandedPoints = componentCells.flatMap((current) => {
    const radius = sampleSpacing * 0.72;
    return [
      current.cell.center,
      { x: current.cell.center.x - radius, y: current.cell.center.y },
      { x: current.cell.center.x + radius, y: current.cell.center.y },
      { x: current.cell.center.x, y: current.cell.center.y - radius },
      { x: current.cell.center.x, y: current.cell.center.y + radius },
    ];
  });
  return {
    center,
    points: expandedPoints,
    cellCount: componentCells.length,
    averageElevation: total.elevation / componentCells.length,
    averageContinentality: total.continentality / componentCells.length,
  };
}

function splitLandmassCells(
  componentCells: ReadonlyArray<LandmassCellDatum>,
  sampleSpacing: number,
  splitCount: number,
): LandmassComponent[] {
  if (splitCount <= 1 || componentCells.length < splitCount * 3) {
    return [createLandmassComponent(componentCells, sampleSpacing)];
  }

  const seeds: ShapePoint[] = [];
  const weightedCells = [...componentCells].sort(
    (a, b) => b.landSignal - a.landSignal,
  );
  const firstCell = weightedCells[0];
  if (!firstCell) {
    return [];
  }
  seeds.push(firstCell.cell.center);
  while (seeds.length < splitCount) {
    let bestCell: LandmassCellDatum | null = null;
    let bestDistance = -Infinity;
    for (const cell of weightedCells) {
      const minDistance = seeds.reduce((minimum, seed) => {
        const distance = Math.hypot(
          cell.cell.center.x - seed.x,
          cell.cell.center.y - seed.y,
        );
        return Math.min(minimum, distance);
      }, Number.POSITIVE_INFINITY);
      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        bestCell = cell;
      }
    }
    if (!bestCell) {
      break;
    }
    seeds.push(bestCell.cell.center);
  }

  let centers = seeds.slice();
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const clusters = centers.map(() => [] as LandmassCellDatum[]);
    for (const cell of componentCells) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        const center = centers[index];
        if (!center) {
          continue;
        }
        const distance = Math.hypot(
          cell.cell.center.x - center.x,
          cell.cell.center.y - center.y,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      const cluster = clusters[bestIndex];
      if (cluster) {
        cluster.push(cell);
      }
    }

    centers = clusters.map((cluster, index) => {
      if (cluster.length === 0) {
        return centers[index] ?? firstCell.cell.center;
      }
      const total = cluster.reduce(
        (sum, cell) => ({
          x: sum.x + cell.cell.center.x,
          y: sum.y + cell.cell.center.y,
        }),
        { x: 0, y: 0 },
      );
      return {
        x: total.x / cluster.length,
        y: total.y / cluster.length,
      };
    });
  }

  const finalClusters = centers.map(() => [] as LandmassCellDatum[]);
  for (const cell of componentCells) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < centers.length; index += 1) {
      const center = centers[index];
      if (!center) {
        continue;
      }
      const distance = Math.hypot(
        cell.cell.center.x - center.x,
        cell.cell.center.y - center.y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    const cluster = finalClusters[bestIndex];
    if (cluster) {
      cluster.push(cell);
    }
  }

  return finalClusters
    .filter((cluster) => cluster.length > 0)
    .map((cluster) => createLandmassComponent(cluster, sampleSpacing));
}

function drawLandBiomePatches(
  graphics: Graphics,
  landmass: AcceptedLandmass,
  palette: CelestialPalette,
  preset: "oceanic" | "terrestrial" | "earthlike" | "rocky",
  planetRadius: number,
  alpha: number,
): void {
  const latitude = clamp01(Math.abs(landmass.center.y) / Math.max(planetRadius, 1));
  const biomeSeed = `biome:${preset}:${Math.round(landmass.center.x * 10)}:${Math.round(landmass.center.y * 10)}:${landmass.cellCount}`;
  const rng = createSeededRandom(biomeSeed);
  const moisture = clamp01(
    (1 - latitude) * (preset === "oceanic" ? 0.62 : 0.46) +
      landmass.averageContinentality * 0.18 +
      rng() * 0.38,
  );
  const heat = clamp01(
    1 - latitude * (preset === "oceanic" ? 0.76 : preset === "terrestrial" ? 0.94 : 0.86),
  );
  const verdantColor = mixColor(
    landmass.landColor,
    0x5f8f4a,
    0.18 + moisture * 0.16,
  );
  const aridColor = mixColor(
    landmass.landColor,
    0xb59661,
    0.14 + (1 - moisture) * 0.24,
  );
  const alpineColor = mixColor(
    landmass.landColor,
    0xd4cbb8,
    0.1 + latitude * 0.22 + Math.max(0, landmass.averageElevation) * 0.08,
  );
  const scrubColor = mixColor(
    landmass.landColor,
    0x798454,
    0.12 + (1 - moisture) * 0.12,
  );

  const primaryBiomeColor =
    latitude > 0.68
      ? alpineColor
      : moisture > 0.58
        ? verdantColor
        : moisture < 0.34
          ? aridColor
          : scrubColor;
  const secondaryBiomeColor =
    latitude > 0.62
      ? mixColor(alpineColor, scrubColor, 0.36)
      : heat > 0.72 && moisture < 0.44
        ? aridColor
        : mixColor(verdantColor, scrubColor, 0.48);

  const primaryAnchor = getBiomeAnchor(landmass, rng, 0.2);
  const secondaryAnchor = getBiomeAnchor(landmass, rng, 0.28);
  const primaryPath = scalePathToward(
    landmass.path,
    primaryAnchor,
    landmass.cellCount >= 10 ? 0.72 : 0.64,
  );
  const secondaryPath = scalePathToward(
    landmass.path,
    secondaryAnchor,
    landmass.cellCount >= 10 ? 0.48 : 0.4,
  );

  if (primaryPath.length >= 3) {
    graphics.poly(flattenPoints(primaryPath), true);
    graphics.fill({
      color: primaryBiomeColor,
      alpha: alpha * 0.16,
    });
  }

  if (secondaryPath.length >= 3 && landmass.cellCount >= 5) {
    graphics.poly(flattenPoints(secondaryPath), true);
    graphics.fill({
      color: secondaryBiomeColor,
      alpha: alpha * 0.18,
    });
  }
}

function getBiomeAnchor(
  landmass: AcceptedLandmass,
  rng: () => number,
  offsetScale: number,
): ShapePoint {
  const angle = rng() * Math.PI * 2;
  const distance = landmass.radius * (0.06 + rng() * offsetScale);
  const candidate = {
    x: landmass.center.x + Math.cos(angle) * distance,
    y: landmass.center.y + Math.sin(angle) * distance,
  };
  return pointInPolygon(candidate, landmass.path) ? candidate : landmass.center;
}

function drawArchipelagoChains(
  graphics: Graphics,
  landmasses: ReadonlyArray<AcceptedLandmass>,
  palette: CelestialPalette,
  preset: "oceanic" | "terrestrial" | "earthlike" | "rocky",
  coastlineColor: number,
  continentCountScale: number,
  cellRadius: number,
  maxDistanceFromOrigin: number,
  alpha: number,
): void {
  const placedIslands: AcceptedLandmass[] = [];
  const chainHosts = landmasses
    .filter((landmass) => landmass.cellCount >= 6)
    .slice(0, 4);

  for (const landmass of chainHosts) {
    const rng = createSeededRandom(
      `archipelago:${preset}:${Math.round(landmass.center.x * 10)}:${Math.round(landmass.center.y * 10)}:${landmass.cellCount}`,
    );
    const chainCount = clamp(
      Math.round((continentCountScale - 0.84) * 1.6 + rng() * 1.2),
      1,
      landmass.cellCount >= 14 ? 3 : 2,
    );

    for (let chainIndex = 0; chainIndex < chainCount; chainIndex += 1) {
      const coastIndex = Math.floor(rng() * landmass.path.length);
      const coastPoint = landmass.path[coastIndex];
      const previousPoint =
        landmass.path[(coastIndex - 1 + landmass.path.length) % landmass.path.length];
      const nextPoint =
        landmass.path[(coastIndex + 1) % landmass.path.length];
      if (!coastPoint || !previousPoint || !nextPoint) {
        continue;
      }
      const tangent = normalizePoint({
        x: nextPoint.x - previousPoint.x,
        y: nextPoint.y - previousPoint.y,
      });
      const outward = normalizePoint({
        x: coastPoint.x - landmass.center.x,
        y: coastPoint.y - landmass.center.y,
      });
      if (
        Math.hypot(outward.x, outward.y) <= 0.0001 ||
        Math.hypot(tangent.x, tangent.y) <= 0.0001
      ) {
        continue;
      }

      const islandCount = 2 + Math.floor(rng() * 3);
      for (let islandIndex = 0; islandIndex < islandCount; islandIndex += 1) {
        const radialDistance =
          landmass.radius * (0.12 + islandIndex * 0.08) +
          cellRadius * (1.1 + rng() * 0.5);
        const tangentOffset =
          (islandIndex - (islandCount - 1) * 0.5) * cellRadius * 1.9 +
          (rng() - 0.5) * cellRadius * 0.9;
        const islandCenter = constrainPointToDisk(
          {
            x:
              coastPoint.x +
              outward.x * radialDistance +
              tangent.x * tangentOffset,
            y:
              coastPoint.y +
              outward.y * radialDistance +
              tangent.y * tangentOffset,
          },
          maxDistanceFromOrigin,
        );
        if (pointInPolygon(islandCenter, landmass.path)) {
          continue;
        }

        const islandRadius =
          cellRadius * (0.65 + rng() * 0.5) * (1 - islandIndex * 0.1);
        const islandPath = createArchipelagoIslandPath(
          islandCenter,
          islandRadius,
          maxDistanceFromOrigin,
          rng,
        );
        const islandLandmass: AcceptedLandmass = {
          center: islandCenter,
          path: islandPath,
          radius: estimatePathRadius(islandPath, islandCenter),
          cellCount: 1,
          landColor: mixColor(
            landmass.landColor,
            palette.highlight,
            0.08 + rng() * 0.12,
          ),
          averageElevation: landmass.averageElevation,
          averageContinentality: landmass.averageContinentality,
        };
        if (
          islandPath.length < 3 ||
          pathOverlapsAcceptedLandmasses(islandLandmass, landmasses) ||
          pathOverlapsAcceptedLandmasses(islandLandmass, placedIslands)
        ) {
          continue;
        }

        drawPlateRegionMass(
          graphics,
          islandCenter,
          islandPath,
          islandLandmass.landColor,
          0.9,
          coastlineColor,
          0.44,
          [],
          0,
        );
        placedIslands.push(islandLandmass);
      }
    }
  }
}

function createArchipelagoIslandPath(
  center: ShapePoint,
  radius: number,
  maxDistanceFromOrigin: number,
  rng: () => number,
): ShapePoint[] {
  const pointCount = 8 + Math.floor(rng() * 4);
  const points: ShapePoint[] = [];
  let smoothedRadii = Array.from({ length: pointCount }, () =>
    radius * (0.72 + rng() * 0.42),
  );

  for (let pass = 0; pass < 2; pass += 1) {
    smoothedRadii = smoothedRadii.map((value, index, radii) => {
      const previous = radii[(index - 1 + radii.length) % radii.length] ?? value;
      const next = radii[(index + 1) % radii.length] ?? value;
      return previous * 0.22 + value * 0.56 + next * 0.22;
    });
  }

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const point = constrainPointToDisk(
      {
        x: center.x + Math.cos(angle) * smoothedRadii[index],
        y: center.y + Math.sin(angle) * smoothedRadii[index],
      },
      maxDistanceFromOrigin,
    );
    points.push(point);
  }

  return points;
}

function pathOverlapsAcceptedLandmasses(
  candidate: AcceptedLandmass,
  acceptedLandmasses: ReadonlyArray<AcceptedLandmass>,
): boolean {
  return pathOverlapsAcceptedRegions(candidate, acceptedLandmasses);
}

function pathOverlapsAcceptedRegions(
  candidate: AcceptedPathRegion,
  acceptedRegions: ReadonlyArray<AcceptedPathRegion>,
  overlapThreshold = 0.04,
  closeOverlapThreshold = 0.015,
  proximityScale = 0.62,
): boolean {
  return acceptedRegions.some((accepted) => {
    const overlapFraction = getSymmetricPathOverlapFraction(
      candidate.path,
      accepted.path,
    );
    const centerInsideAccepted = pointInPolygon(candidate.center, accepted.path);
    const acceptedCenterInsideCandidate = pointInPolygon(
      accepted.center,
      candidate.path,
    );
    const centersAreTooClose =
      Math.hypot(
        candidate.center.x - accepted.center.x,
        candidate.center.y - accepted.center.y,
      ) <
      (candidate.radius + accepted.radius) * proximityScale;
    return (
      centerInsideAccepted ||
      acceptedCenterInsideCandidate ||
      overlapFraction >= overlapThreshold ||
      (centersAreTooClose && overlapFraction >= closeOverlapThreshold)
    );
  });
}

function drawPlateRegionMass(
  graphics: Graphics,
  center: ShapePoint,
  path: ReadonlyArray<ShapePoint>,
  fillColor: number,
  fillAlpha: number,
  contourColor: number,
  strokeAlpha: number,
  contourScales: number[],
  contourAlpha: number,
): void {
  if (path.length < 3) {
    return;
  }

  graphics.poly(flattenPoints(path), true);
  graphics.fill({
    color: fillColor,
    alpha: fillAlpha,
  });

  if (strokeAlpha > 0) {
    graphics.poly(flattenPoints(path), true);
    graphics.stroke({
      color: contourColor,
      width: Math.max(1, estimatePathStrokeWidth(path, center, 0.16)),
      alpha: strokeAlpha,
      join: "round",
    });
  }

  for (const scale of contourScales) {
    const innerPath = scalePathToward(path, center, scale);
    if (innerPath.length < 3) {
      continue;
    }
    graphics.poly(flattenPoints(innerPath), true);
    graphics.stroke({
      color: contourColor,
      width: Math.max(0.9, estimatePathStrokeWidth(path, center, 0.12)),
      alpha: contourAlpha,
      join: "round",
    });
  }
}

function buildContinentalLandmassPath(
  component: LandmassComponent,
  cellRadius: number,
  maxDistanceFromOrigin: number,
): ShapePoint[] {
  if (component.points.length < 3) {
    return [];
  }

  if (component.cellCount <= 3) {
    return buildPlateRegionPath(
      component.center,
      component.points,
      cellRadius,
      maxDistanceFromOrigin,
    );
  }

  const sectorCount = Math.max(
    18,
    Math.min(34, Math.round(Math.sqrt(component.cellCount) * 5.2)),
  );
  const sectorRadii = new Array<number | null>(sectorCount).fill(null);
  const fullTurn = Math.PI * 2;
  const majorAxisAngle = computePrincipalAxisAngle(component.points, component.center);
  const seed = `continent:${Math.round(component.center.x * 10)}:${Math.round(component.center.y * 10)}:${component.cellCount}:${Math.round(component.averageContinentality * 1000)}`;
  const rng = createSeededRandom(seed);

  for (const point of component.points) {
    const dx = point.x - component.center.x;
    const dy = point.y - component.center.y;
    const angle = phaseWrap(Math.atan2(dy, dx));
    const sectorIndex = Math.min(
      sectorCount - 1,
      Math.floor((angle / fullTurn) * sectorCount),
    );
    const radius = Math.hypot(dx, dy);
    sectorRadii[sectorIndex] = Math.max(sectorRadii[sectorIndex] ?? 0, radius);
  }

  const fallbackRadius = Math.max(
    cellRadius * 2.4,
    component.points.reduce((sum, point) => {
      return sum + Math.hypot(point.x - component.center.x, point.y - component.center.y);
    }, 0) / Math.max(component.points.length, 1),
  );
  const resolvedRadii = sectorRadii.map((radius, index) => {
    if (radius !== null) {
      return radius;
    }

    for (let offset = 1; offset < sectorCount; offset += 1) {
      const prev = sectorRadii[(index - offset + sectorCount) % sectorCount];
      const next = sectorRadii[(index + offset) % sectorCount];
      if (prev !== null && next !== null) {
        return (prev + next) * 0.5;
      }
      if (prev !== null) {
        return prev;
      }
      if (next !== null) {
        return next;
      }
    }

    return fallbackRadius;
  });

  const lobeAngles = [
    phaseWrap(majorAxisAngle + (rng() - 0.5) * 0.26),
    phaseWrap(majorAxisAngle + Math.PI + (rng() - 0.5) * 0.26),
  ];
  if (component.cellCount >= 8) {
    lobeAngles.push(
      phaseWrap(
        majorAxisAngle +
          (rng() > 0.5 ? 1 : -1) * (Math.PI * (0.44 + rng() * 0.14)),
      ),
    );
  }
  const bayAngles = lobeAngles
    .slice(0, Math.max(1, lobeAngles.length - 1))
    .map((angle, index) =>
      phaseWrap(angle + Math.PI * (0.32 + index * 0.18) * (rng() > 0.5 ? 1 : -1)),
    );

  let shapedRadii = resolvedRadii.map((baseRadius, index) => {
    const angle = (index / sectorCount) * fullTurn;
    const axialBias =
      1 +
      Math.cos(angle - majorAxisAngle) * Math.cos(angle - majorAxisAngle) * 0.18 -
      Math.sin(angle - majorAxisAngle) * Math.sin(angle - majorAxisAngle) * 0.05;
    let lobeBias = 1;
    for (const lobeAngle of lobeAngles) {
      const distance = wrappedAngularDistance(angle, lobeAngle);
      lobeBias += Math.exp(-(distance * distance) / (2 * 0.42 * 0.42)) * 0.16;
    }
    for (const bayAngle of bayAngles) {
      const distance = wrappedAngularDistance(angle, bayAngle);
      lobeBias -= Math.exp(-(distance * distance) / (2 * 0.32 * 0.32)) * 0.1;
    }
    const coastalNoise =
      1 +
      Math.sin(angle * (2 + Math.floor(rng() * 2)) + rng() * Math.PI * 2) * 0.06 +
      Math.sin(angle * (4 + Math.floor(rng() * 2)) + rng() * Math.PI * 2) * 0.03;
    return Math.max(cellRadius * 1.9, baseRadius * axialBias * lobeBias * coastalNoise);
  });

  for (let pass = 0; pass < 3; pass += 1) {
    shapedRadii = shapedRadii.map((radius, index, radii) => {
      const prev = radii[(index - 1 + radii.length) % radii.length] ?? radius;
      const next = radii[(index + 1) % radii.length] ?? radius;
      return prev * 0.22 + radius * 0.56 + next * 0.22;
    });
  }

  return shapedRadii.map((radius, index) => {
    const angle = (index / sectorCount) * fullTurn;
    const point = {
      x: component.center.x + Math.cos(angle) * radius,
      y: component.center.y + Math.sin(angle) * radius,
    };
    const distance = Math.hypot(point.x, point.y);
    if (distance <= maxDistanceFromOrigin) {
      return point;
    }
    const scale = maxDistanceFromOrigin / Math.max(distance, 1);
    return {
      x: point.x * scale,
      y: point.y * scale,
    };
  });
}

function computePrincipalAxisAngle(
  points: ReadonlyArray<ShapePoint>,
  center: ShapePoint,
): number {
  let xx = 0;
  let xy = 0;
  let yy = 0;

  for (const point of points) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }

  return 0.5 * Math.atan2(2 * xy, xx - yy);
}

function wrappedAngularDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % (Math.PI * 2);
  return difference > Math.PI ? Math.PI * 2 - difference : difference;
}

function estimatePathStrokeWidth(
  path: ReadonlyArray<ShapePoint>,
  center: ShapePoint,
  scale: number,
): number {
  if (path.length === 0) {
    return 1;
  }

  const averageRadius =
    path.reduce((sum, point) => {
      return sum + Math.hypot(point.x - center.x, point.y - center.y);
    }, 0) / path.length;
  return averageRadius * scale;
}

function estimatePathRadius(
  path: ReadonlyArray<ShapePoint>,
  center: ShapePoint,
): number {
  if (path.length === 0) {
    return 0;
  }

  return (
    path.reduce((sum, point) => {
      return sum + Math.hypot(point.x - center.x, point.y - center.y);
    }, 0) / path.length
  );
}

function pointInPolygon(
  point: ShapePoint,
  polygon: ReadonlyArray<ShapePoint>,
): boolean {
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) {
      continue;
    }
    const denominator = previousPoint.y - currentPoint.y;
    const safeDenominator =
      Math.abs(denominator) < 0.000001
        ? denominator < 0
          ? -0.000001
          : 0.000001
        : denominator;
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          safeDenominator +
          currentPoint.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getPathOverlapFraction(
  path: ReadonlyArray<ShapePoint>,
  otherPath: ReadonlyArray<ShapePoint>,
): number {
  if (path.length === 0 || otherPath.length === 0) {
    return 0;
  }

  const insideCount = path.reduce((count, point) => {
    return count + (pointInPolygon(point, otherPath) ? 1 : 0);
  }, 0);
  return insideCount / path.length;
}

function getSymmetricPathOverlapFraction(
  path: ReadonlyArray<ShapePoint>,
  otherPath: ReadonlyArray<ShapePoint>,
): number {
  return Math.max(
    getPathOverlapFraction(path, otherPath),
    getPathOverlapFraction(otherPath, path),
  );
}

function buildPlateRegionPath(
  center: ShapePoint,
  regionPoints: ReadonlyArray<ShapePoint>,
  cellRadius: number,
  maxDistanceFromOrigin: number,
): ShapePoint[] {
  if (regionPoints.length < 3) {
    return [];
  }

  const sectorCount = Math.max(
    12,
    Math.min(28, Math.round(Math.sqrt(regionPoints.length) * 5.4)),
  );
  const sectorRadii = new Array<number | null>(sectorCount).fill(null);
  const fullTurn = Math.PI * 2;

  for (const point of regionPoints) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const angle = phaseWrap(Math.atan2(dy, dx));
    const sectorIndex = Math.min(
      sectorCount - 1,
      Math.floor((angle / fullTurn) * sectorCount),
    );
    const radius = Math.hypot(dx, dy) + cellRadius * 1.35;
    sectorRadii[sectorIndex] = Math.max(sectorRadii[sectorIndex] ?? 0, radius);
  }

  const fallbackRadius = Math.max(
    cellRadius * 2.1,
    regionPoints.reduce((sum, point) => {
      return sum + Math.hypot(point.x - center.x, point.y - center.y);
    }, 0) / Math.max(regionPoints.length, 1),
  );
  const resolvedRadii = sectorRadii.map((radius, index) => {
    if (radius !== null) {
      return radius;
    }

    for (let offset = 1; offset < sectorCount; offset += 1) {
      const prev = sectorRadii[(index - offset + sectorCount) % sectorCount];
      const next = sectorRadii[(index + offset) % sectorCount];
      if (prev !== null && next !== null) {
        return (prev + next) * 0.5;
      }
      if (prev !== null) {
        return prev;
      }
      if (next !== null) {
        return next;
      }
    }

    return fallbackRadius;
  });

  let smoothedRadii = resolvedRadii.slice();
  for (let pass = 0; pass < 2; pass += 1) {
    smoothedRadii = smoothedRadii.map((radius, index, radii) => {
      const prev = radii[(index - 1 + radii.length) % radii.length] ?? radius;
      const next = radii[(index + 1) % radii.length] ?? radius;
      return prev * 0.24 + radius * 0.52 + next * 0.24;
    });
  }

  return smoothedRadii.map((radius, index) => {
    const angle = (index / sectorCount) * fullTurn;
    const point = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    const distance = Math.hypot(point.x, point.y);
    if (distance <= maxDistanceFromOrigin) {
      return point;
    }
    const scale = maxDistanceFromOrigin / Math.max(distance, 1);
    return {
      x: point.x * scale,
      y: point.y * scale,
    };
  });
}

function scalePathToward(
  path: ReadonlyArray<ShapePoint>,
  center: ShapePoint,
  scale: number,
): ShapePoint[] {
  return path.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  }));
}

function drawCloudBands(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  densityScale: number,
  alphaScale: number,
): void {
  const vortices = createCloudVortices(radius, densityScale, rng);
  const weatherExtent = radius * 1.08;
  const saturation = Math.max(0, densityScale - 1);
  const streamlineCount = Math.max(
    12,
    Math.round((radius / 20) * (1.4 + densityScale * 2.2 + saturation * 1.4)),
  );

  const canopyStrength = clamp01((densityScale - 1.15) / 1.85);
  if (canopyStrength > 0) {
    drawCloudCanopy(
      graphics,
      radius,
      rng,
      palette,
      canopyStrength,
      alphaScale,
      weatherExtent,
    );
  }

  for (let index = 0; index < streamlineCount; index += 1) {
    const sourceVortex = vortices[Math.floor(rng() * vortices.length)];
    if (!sourceVortex) {
      continue;
    }

    const startAngle = rng() * Math.PI * 2;
    const startDistance =
      sourceVortex.influenceRadius * (0.26 + rng() * 0.92);
    let point = constrainPointToDisk(
      {
        x: sourceVortex.center.x + Math.cos(startAngle) * startDistance,
        y: sourceVortex.center.y + Math.sin(startAngle) * startDistance,
      },
      weatherExtent,
    );
    const puffCount = 4 + Math.floor(rng() * 5 + densityScale * 3.4);

    for (let puffIndex = 0; puffIndex < puffCount; puffIndex += 1) {
      const flow = sampleCloudFlowField(point, radius, vortices, densityScale);
      const magnitude = Math.hypot(flow.x, flow.y);
      if (magnitude <= 0.0001) {
        break;
      }

      const tangent = {
        x: flow.x / magnitude,
        y: flow.y / magnitude,
      };
      const rotation = Math.atan2(tangent.y, tangent.x);
      const puffWidth =
        radius * (0.046 + rng() * 0.03) * (0.94 + densityScale * 0.26);
      const puffHeight = puffWidth * (0.34 + rng() * 0.14);
      const edgeFade =
        1 -
        clamp01(
          (Math.hypot(point.x, point.y) - radius * 0.32) /
            Math.max(radius * 0.62, 1),
        ) *
          0.4;
      drawCloudPuff(
        graphics,
        point,
        puffWidth,
        puffHeight,
        rotation,
        palette.highlight,
        alphaScale * (0.32 + densityScale * 0.05 + rng() * 0.14) * edgeFade,
      );
      drawCloudPuff(
        graphics,
        {
          x: point.x - tangent.x * puffWidth * 0.2,
          y: point.y - tangent.y * puffWidth * 0.1,
        },
        puffWidth * 0.52,
        puffHeight * 0.7,
        rotation,
        palette.atmosphere,
        alphaScale * (0.12 + densityScale * 0.03) * edgeFade,
      );

      point = constrainPointToDisk(
        {
          x:
            point.x +
            tangent.x * (puffWidth * (0.78 + rng() * 0.26)) +
            -tangent.y * (rng() - 0.5) * puffHeight * 0.42,
          y:
            point.y +
            tangent.y * (puffWidth * (0.78 + rng() * 0.26)) +
            tangent.x * (rng() - 0.5) * puffHeight * 0.42,
        },
        weatherExtent,
      );
    }
  }

  for (const vortex of vortices) {
    const corePuffCount = 4 + Math.floor(rng() * 4 + densityScale * 1.2);
    for (let puffIndex = 0; puffIndex < corePuffCount; puffIndex += 1) {
      const t = (puffIndex + 1) / (corePuffCount + 1);
      const angle =
        vortex.spin * t * Math.PI * (2.2 + densityScale * 0.8) +
        rng() * 0.4;
      const distance = vortex.influenceRadius * (0.08 + t * 0.38);
      const point = constrainPointToDisk(
        {
          x: vortex.center.x + Math.cos(angle) * distance,
          y: vortex.center.y + Math.sin(angle) * distance * 0.82,
        },
        weatherExtent,
      );
      const tangent = normalizePoint({
        x: -(point.y - vortex.center.y) * vortex.spin,
        y: (point.x - vortex.center.x) * vortex.spin,
      });
      const puffWidth =
        radius * (0.038 + (1 - t) * 0.02) * (0.96 + densityScale * 0.12);
      const puffHeight = puffWidth * 0.42;
      drawCloudPuff(
        graphics,
        point,
        puffWidth,
        puffHeight,
        Math.atan2(tangent.y, tangent.x),
        palette.highlight,
        alphaScale * (0.2 + densityScale * 0.04 + (1 - t) * 0.14),
      );
    }
  }
}

function drawCloudCanopy(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  canopyStrength: number,
  alphaScale: number,
  weatherExtent: number,
): void {
  const canopyCount = Math.max(
    8,
    Math.round((radius / 18) * (1.8 + canopyStrength * 6.4)),
  );

  for (let index = 0; index < canopyCount; index += 1) {
    const center = constrainPointToDisk(
      {
        x: (rng() * 2 - 1) * radius * 0.92,
        y: (rng() * 2 - 1) * radius * 0.92,
      },
      weatherExtent,
    );
    const rotation = rng() * Math.PI * 2;
    const puffWidth =
      radius * (0.09 + rng() * 0.08) * (0.9 + canopyStrength * 0.4);
    const puffHeight = puffWidth * (0.42 + rng() * 0.16);
    drawCloudPuff(
      graphics,
      center,
      puffWidth,
      puffHeight,
      rotation,
      palette.highlight,
      alphaScale * (0.05 + canopyStrength * 0.08),
    );
    drawCloudPuff(
      graphics,
      {
        x: center.x - Math.cos(rotation) * puffWidth * 0.08,
        y: center.y - Math.sin(rotation) * puffWidth * 0.08,
      },
      puffWidth * 0.56,
      puffHeight * 0.74,
      rotation,
      palette.atmosphere,
      alphaScale * (0.025 + canopyStrength * 0.05),
    );
  }
}

function createCloudVortices(
  radius: number,
  densityScale: number,
  rng: () => number,
): CloudVortex[] {
  const vortexCount = Math.max(
    3,
    Math.min(8, Math.round(2.2 + densityScale * 2.1 + radius / 150)),
  );
  const vortices: CloudVortex[] = [];
  let attempts = 0;

  while (vortices.length < vortexCount && attempts < vortexCount * 20) {
    attempts += 1;
    const edgeBiased = rng() < 0.55;
    const angle = rng() * Math.PI * 2;
    const radialDistance =
      radius *
      (edgeBiased
        ? 0.68 + rng() * 0.44
        : 0.12 + Math.sqrt(rng()) * 0.72);
    const candidate: CloudVortex = {
      center: {
        x: Math.cos(angle) * radialDistance,
        y: Math.sin(angle) * radialDistance * (0.9 + rng() * 0.16),
      },
      influenceRadius: radius * (0.12 + rng() * 0.12),
      spin: rng() < 0.5 ? -1 : 1,
      strength: 0.74 + rng() * 0.76,
      radialBias: (rng() - 0.5) * 0.34,
    };
    const overlapsExistingVortex = vortices.some((vortex) => {
      return (
        Math.hypot(
          candidate.center.x - vortex.center.x,
          candidate.center.y - vortex.center.y,
        ) <
        (candidate.influenceRadius + vortex.influenceRadius) * 0.44
      );
    });
    if (overlapsExistingVortex) {
      continue;
    }
    vortices.push(candidate);
  }

  if (vortices.length === 0) {
    vortices.push({
      center: { x: 0, y: 0 },
      influenceRadius: radius * 0.24,
      spin: 1,
      strength: 1,
      radialBias: 0.1,
    });
  }

  return vortices;
}

function sampleCloudFlowField(
  point: ShapePoint,
  radius: number,
  vortices: ReadonlyArray<CloudVortex>,
  densityScale: number,
): ShapePoint {
  const latitude = point.y / Math.max(radius, 1);
  const zonalStrength =
    (1 - clamp01(Math.abs(latitude) * 1.08)) * (0.7 + densityScale * 0.24);
  const zonalFlow = {
    x: (latitude >= 0 ? -1 : 1) * zonalStrength,
    y: 0,
  };
  const flow = { x: zonalFlow.x, y: zonalFlow.y };

  for (const vortex of vortices) {
    const dx = point.x - vortex.center.x;
    const dy = point.y - vortex.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) {
      continue;
    }
    const falloff = Math.exp(
      -(distance * distance) /
        (2 * vortex.influenceRadius * vortex.influenceRadius),
    );
    const tangent = {
      x: (-dy / distance) * vortex.spin,
      y: (dx / distance) * vortex.spin,
    };
    const radial = {
      x: dx / distance,
      y: dy / distance,
    };
    flow.x += tangent.x * vortex.strength * falloff;
    flow.y += tangent.y * vortex.strength * falloff;
    flow.x += radial.x * vortex.radialBias * falloff;
    flow.y += radial.y * vortex.radialBias * falloff;
  }

  return flow;
}

function drawCloudPuff(
  graphics: Graphics,
  center: ShapePoint,
  halfWidth: number,
  halfHeight: number,
  rotation: number,
  color: number,
  alpha: number,
): void {
  const path = buildRotatedEllipsePath(center, halfWidth, halfHeight, rotation, 14);
  graphics.poly(flattenPoints(path), true);
  graphics.fill({
    color,
    alpha,
  });
}

function buildRotatedEllipsePath(
  center: ShapePoint,
  halfWidth: number,
  halfHeight: number,
  rotation: number,
  segmentCount: number,
): ShapePoint[] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const points: ShapePoint[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2;
    const localX = Math.cos(angle) * halfWidth;
    const localY = Math.sin(angle) * halfHeight;
    points.push({
      x: center.x + localX * cosine - localY * sine,
      y: center.y + localX * sine + localY * cosine,
    });
  }

  return points;
}

function computePlateSurfaceElevation(
  cell: {
    center: { x: number; y: number };
    jointRole?: "over" | "under";
    jointStrength?: number;
  },
  plate:
    | {
        center: { x: number; y: number };
        drift: { x: number; y: number };
        tone: number;
      }
    | undefined,
  plateData: {
    radius: number;
    sampleSpacing: number;
  },
): number {
  if (!plate) {
    return 0;
  }

  const dx = cell.center.x - plate.center.x;
  const dy = cell.center.y - plate.center.y;
  const driftMagnitude = Math.hypot(plate.drift.x, plate.drift.y) || 1;
  const driftDirection = {
    x: plate.drift.x / driftMagnitude,
    y: plate.drift.y / driftMagnitude,
  };
  const normalDirection = {
    x: -driftDirection.y,
    y: driftDirection.x,
  };
  const longitudinal =
    (dx * driftDirection.x + dy * driftDirection.y) /
    Math.max(plateData.sampleSpacing * 2.6, 1);
  const lateral =
    (dx * normalDirection.x + dy * normalDirection.y) /
    Math.max(plateData.sampleSpacing * 2.2, 1);
  const radialDistance =
    Math.hypot(dx, dy) / Math.max(plateData.radius * 0.72, 1);
  const longWave =
    Math.sin(longitudinal * 0.9 + plate.tone * 2.2) * 0.16 +
    Math.sin(longitudinal * 2.2 - lateral * 0.35) * 0.08;
  const latWave =
    Math.cos(lateral * 1.1 - plate.tone * 1.8) * 0.12 +
    Math.cos(lateral * 2.8 + longitudinal * 0.42) * 0.05;
  const broadBias = plate.tone * 0.18 - radialDistance * 0.08;
  const jointStrength = Math.max(
    0,
    Math.min(1, (cell.jointStrength ?? 0) / 6),
  );
  const jointBias =
    cell.jointRole === "over"
      ? 0.42 * jointStrength
      : cell.jointRole === "under"
        ? -0.38 * jointStrength
        : 0;

  return Math.max(-1, Math.min(1, broadBias + longWave + latWave + jointBias));
}

function computePlateCrustSignal(
  cell: {
    center: { x: number; y: number };
  },
  plate:
    | {
        center: { x: number; y: number };
        drift: { x: number; y: number };
        tone: number;
      }
    | undefined,
  plateData: {
    radius: number;
    sampleSpacing: number;
  },
): number {
  if (!plate) {
    return 0;
  }

  const dx = cell.center.x - plate.center.x;
  const dy = cell.center.y - plate.center.y;
  const driftMagnitude = Math.hypot(plate.drift.x, plate.drift.y) || 1;
  const driftDirection = {
    x: plate.drift.x / driftMagnitude,
    y: plate.drift.y / driftMagnitude,
  };
  const normalDirection = {
    x: -driftDirection.y,
    y: driftDirection.x,
  };
  const longitudinal =
    (dx * driftDirection.x + dy * driftDirection.y) /
    Math.max(plateData.sampleSpacing * 3.1, 1);
  const lateral =
    (dx * normalDirection.x + dy * normalDirection.y) /
    Math.max(plateData.sampleSpacing * 2.7, 1);
  const distanceFromCenter = Math.hypot(dx, dy);
  const coreT = clamp01(
    1 -
      distanceFromCenter /
        Math.max(
          plateData.radius * 0.3 + Math.abs(plate.tone) * plateData.radius * 0.08,
          plateData.sampleSpacing * 4,
        ),
  );
  const rimT = clamp01(
    (distanceFromCenter - plateData.sampleSpacing * 2.4) /
      Math.max(plateData.radius * 0.24, 1),
  );
  const crustWave =
    Math.sin(longitudinal * 0.72 + plate.tone * 2.4) * 0.16 +
    Math.cos(lateral * 0.84 - plate.tone * 2.1) * 0.12 +
    Math.sin((longitudinal + lateral) * 0.48 + plate.tone * 4.6) * 0.08;
  const coreBias = coreT * (plate.tone >= 0 ? 0.34 : -0.18);
  const rimBias = -rimT * 0.08;

  return Math.max(
    -1,
    Math.min(1, plate.tone * 0.62 + crustWave + coreBias + rimBias),
  );
}

function getPlateSurfaceStyle(
  preset: "oceanic" | "terrestrial" | "earthlike" | "rocky",
): {
  landThreshold: number;
  transitionThreshold: number;
  deepOceanThreshold: number;
  crustWeight: number;
  elevationWeight: number;
  overBias: number;
  underBias: number;
  highBlend: number;
  lowBlend: number;
  basinBlend: number;
  basinAlpha: number;
  ridgeAlpha: number;
  ridgeShadowAlpha: number;
  transitionBlend: number;
  transitionAlpha: number;
  oceanBlend: number;
  trenchAlpha: number;
} {
  switch (preset) {
    case "oceanic":
      return {
        landThreshold: 0.42,
        transitionThreshold: 0.16,
        deepOceanThreshold: -0.22,
        crustWeight: 0.88,
        elevationWeight: 0.28,
        overBias: 0.16,
        underBias: 0.26,
        highBlend: 0.28,
        lowBlend: 0.14,
        basinBlend: 0.38,
        basinAlpha: 0.28,
        ridgeAlpha: 0.18,
        ridgeShadowAlpha: 0.16,
        transitionBlend: 0.12,
        transitionAlpha: 0.18,
        oceanBlend: 0.32,
        trenchAlpha: 0.3,
      };
    case "terrestrial":
      return {
        landThreshold: -0.08,
        transitionThreshold: -0.28,
        deepOceanThreshold: -0.54,
        crustWeight: 0.66,
        elevationWeight: 0.42,
        overBias: 0.22,
        underBias: 0.18,
        highBlend: 0.3,
        lowBlend: 0.24,
        basinBlend: 0.28,
        basinAlpha: 0.24,
        ridgeAlpha: 0.22,
        ridgeShadowAlpha: 0.18,
        transitionBlend: 0.22,
        transitionAlpha: 0.24,
        oceanBlend: 0.24,
        trenchAlpha: 0.2,
      };
    case "earthlike":
      return {
        landThreshold: -0.02,
        transitionThreshold: -0.2,
        deepOceanThreshold: -0.42,
        crustWeight: 0.72,
        elevationWeight: 0.44,
        overBias: 0.24,
        underBias: 0.18,
        highBlend: 0.4,
        lowBlend: 0.18,
        basinBlend: 0.2,
        basinAlpha: 0.16,
        ridgeAlpha: 0.28,
        ridgeShadowAlpha: 0.2,
        transitionBlend: 0.24,
        transitionAlpha: 0.16,
        oceanBlend: 0.16,
        trenchAlpha: 0.18,
      };
    case "rocky":
      return {
        landThreshold: 1,
        transitionThreshold: 0,
        deepOceanThreshold: -0.18,
        crustWeight: 0.52,
        elevationWeight: 0.58,
        overBias: 0.18,
        underBias: 0.16,
        highBlend: 0.26,
        lowBlend: 0.22,
        basinBlend: 0.24,
        basinAlpha: 0.18,
        ridgeAlpha: 0.18,
        ridgeShadowAlpha: 0.14,
        transitionBlend: 0.16,
        transitionAlpha: 0.12,
        oceanBlend: 0.22,
        trenchAlpha: 0.22,
      };
  }
}

function drawMineralPatches(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  alpha: number,
): void {
  const patchCount = Math.max(3, Math.round(radius / 40));

  for (let index = 0; index < patchCount; index += 1) {
    const center = randomPointInDisk(radius * 0.34, rng);
    drawBlob(
      graphics,
      center,
      radius * (0.14 + rng() * 0.08),
      radius * 0.86,
      6 + Math.floor(rng() * 4),
      rng,
      index % 2 === 0 ? palette.secondary : palette.accent,
      alpha,
    );
  }
}

function drawIrregularTerrain(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  alpha: number,
): void {
  const patchCount = Math.max(2, Math.round(radius / 30));

  for (let index = 0; index < patchCount; index += 1) {
    const center = randomPointInDisk(radius * 0.3, rng);
    drawBlob(
      graphics,
      center,
      radius * (0.18 + rng() * 0.08),
      radius * 0.9,
      5 + Math.floor(rng() * 3),
      rng,
      index % 2 === 0 ? palette.shadow : palette.secondary,
      alpha * (0.7 + rng() * 0.3),
    );
  }
}

function drawIceCaps(
  graphics: Graphics,
  radius: number,
  palette: CelestialPalette,
): void {
  const capOffset = radius * 0.58;
  const capRadius = radius * 0.24;

  graphics.circle(0, -capOffset, capRadius);
  graphics.fill({
    color: palette.highlight,
    alpha: 0.32,
  });
  graphics.circle(0, capOffset, capRadius * 0.84);
  graphics.fill({
    color: palette.accent,
    alpha: 0.2,
  });
}

function drawIceFractures(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  densityScale: number,
): void {
  const fractureCount = Math.max(3, Math.round((radius / 42) * densityScale));

  for (let index = 0; index < fractureCount; index += 1) {
    const start = randomPointInDisk(radius * 0.68, rng);
    const mid = randomPointInDisk(radius * 0.52, rng);
    const end = randomPointInDisk(radius * 0.68, rng);

    graphics.moveTo(start.x, start.y);
    graphics.lineTo(mid.x, mid.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({
      color: palette.highlight,
      width: Math.max(1.2, radius * 0.016),
      alpha: 0.26,
      cap: "round",
      join: "round",
    });
  }
}

function drawLavaCracks(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  densityScale: number,
): void {
  const crackCount = Math.max(3, Math.round((radius / 44) * densityScale));

  for (let index = 0; index < crackCount; index += 1) {
    const start = randomPointInDisk(radius * 0.56, rng);
    const mid = randomPointInDisk(radius * 0.42, rng);
    const end = randomPointInDisk(radius * 0.62, rng);

    graphics.moveTo(start.x, start.y);
    graphics.lineTo(mid.x, mid.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({
      color: palette.accent,
      width: Math.max(1.8, radius * 0.022),
      alpha: 0.42,
      cap: "round",
      join: "round",
    });

    graphics.circle(mid.x, mid.y, Math.max(2.2, radius * 0.035));
    graphics.fill({
      color: palette.highlight,
      alpha: 0.42,
    });
  }
}

function drawCometTail(
  graphics: Graphics,
  radius: number,
  rng: () => number,
  palette: CelestialPalette,
  lengthScale: number,
  alphaScale: number,
): void {
  const angle = -Math.PI * (0.72 + rng() * 0.12);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const segmentCount = 5;

  for (let index = 0; index < segmentCount; index += 1) {
    const distance = radius * (0.9 + index * 0.58) * lengthScale;
    const width = radius * (0.54 + index * 0.28) * lengthScale;
    const height = radius * (0.18 + index * 0.06);
    const centerX = -dirX * distance;
    const centerY = -dirY * distance;

    graphics.ellipse(centerX, centerY, width, height);
    graphics.fill({
      color: index === 0 ? palette.highlight : palette.atmosphere,
      alpha: Math.max(0, alphaScale * (0.46 - index * 0.07)),
    });
  }
}

function drawFloatingRocks(
  graphics: Graphics,
  silhouette: CelestialSilhouette,
  rng: () => number,
  palette: CelestialPalette,
  count: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance =
      silhouette.radius * (1.08 + rng() * 0.34);
    const center = {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
    const rockRadius = silhouette.radius * (0.08 + rng() * 0.05);
    const pointCount = 5 + Math.floor(rng() * 3);
    const points = createPotatoPoints(rockRadius, rng, {
      pointCount,
      radialJitter: 0.18,
      angularJitter: 0.16,
      stretchX: 1.06 + rng() * 0.18,
      stretchY: 0.86 + rng() * 0.16,
      lobeAmplitude: 0.14,
      chunkCount: 0,
      chunkDepth: 0,
      chunkWidth: 0,
    }).map((point) => ({
      x: point.x + center.x,
      y: point.y + center.y,
    }));

    graphics.poly(flattenPoints(points), true);
    graphics.fill({
      color: index % 2 === 0 ? palette.secondary : palette.shadow,
      alpha: 0.7 + rng() * 0.16,
    });
    graphics.poly(flattenPoints(points), true);
    graphics.stroke({
      color: palette.highlight,
      width: Math.max(0.8, silhouette.radius * 0.01),
      alpha: 0.18,
      join: "round",
    });
  }
}

function drawBlob(
  graphics: Graphics,
  center: { x: number; y: number },
  radius: number,
  maxDistanceFromOrigin: number,
  pointCount: number,
  rng: () => number,
  color: number,
  alpha: number,
): void {
  const points: number[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const localRadius = radius * (0.72 + rng() * 0.42);
    let x = center.x + Math.cos(angle) * localRadius;
    let y = center.y + Math.sin(angle) * localRadius;
    const distance = Math.hypot(x, y);

    if (distance > maxDistanceFromOrigin) {
      const scale = maxDistanceFromOrigin / distance;
      x *= scale;
      y *= scale;
    }

    points.push(x, y);
  }

  graphics.poly(points);
  graphics.fill({
    color,
    alpha,
  });
}

function drawSpecularHighlight(
  graphics: Graphics,
  radius: number,
  palette: CelestialPalette,
  alphaScale: number,
): void {
  const highlightRadius = radius * 0.24;
  const centerX = CELESTIAL_SOLAR_LIGHT_DIRECTION.x * radius * 0.28;
  const centerY = CELESTIAL_SOLAR_LIGHT_DIRECTION.y * radius * 0.28;

  graphics.circle(centerX, centerY, highlightRadius);
  graphics.fill({
    color: palette.highlight,
    alpha: 0.14 * alphaScale,
  });
}

function getRockReliefProfile(bodyClass: CelestialBodyClass): RockReliefProfile {
  switch (bodyClass) {
    case "meteor":
      return {
        ridgeDensity: 1,
        ridgeScale: 0.86,
        basinDensity: 0.8,
        broadShadowAlpha: 0.14,
        broadHighlightAlpha: 0.108,
        ridgeShadowAlpha: 0.16,
        ridgeHighlightAlpha: 0.12,
      };
    case "asteroid":
      return {
        ridgeDensity: 1.32,
        ridgeScale: 1,
        basinDensity: 1.1,
        broadShadowAlpha: 0.16,
        broadHighlightAlpha: 0.126,
        ridgeShadowAlpha: 0.18,
        ridgeHighlightAlpha: 0.14,
      };
    case "rocky-moon":
    case "dwarf-planet":
      return {
        ridgeDensity: 1.1,
        ridgeScale: 0.94,
        basinDensity: 0.94,
        broadShadowAlpha: 0,
        broadHighlightAlpha: 0,
        ridgeShadowAlpha: 0.12,
        ridgeHighlightAlpha: 0.1,
      };
    case "small-rocky-planet":
      return {
        ridgeDensity: 1.1,
        ridgeScale: 0.94,
        basinDensity: 0.94,
        broadShadowAlpha: 0.11,
        broadHighlightAlpha: 0.09,
        ridgeShadowAlpha: 0.12,
        ridgeHighlightAlpha: 0.1,
      };
    case "small-volcanic-planet":
    case "medium-terrestrial-planet":
    case "large-terrestrial-planet":
      return {
        ridgeDensity: 0.86,
        ridgeScale: 0.88,
        basinDensity: 0.72,
        broadShadowAlpha: 0.09,
        broadHighlightAlpha: 0.072,
        ridgeShadowAlpha: 0.1,
        ridgeHighlightAlpha: 0.08,
      };
    default:
      return {
        ridgeDensity: 0.74,
        ridgeScale: 0.82,
        basinDensity: 0.56,
        broadShadowAlpha: 0.08,
        broadHighlightAlpha: 0.054,
        ridgeShadowAlpha: 0.08,
        ridgeHighlightAlpha: 0.06,
      };
  }
}

function drawAtmosphereAndOutline(
  graphics: Graphics,
  config: CelestialConfig,
  palette: CelestialPalette,
  atmosphereScale: number,
  silhouette: CelestialSilhouette,
): void {
  const isRoot = config.parentId === null;
  const outlineColor = isRoot
    ? WORLD_ENTITY_STYLES.celestial.rootOutlineColor
    : WORLD_ENTITY_STYLES.celestial.childOutlineColor;
  const outlineWidth = isRoot
    ? WORLD_ENTITY_STYLES.celestial.rootOutlineWidth
    : WORLD_ENTITY_STYLES.celestial.childOutlineWidth;

  if (silhouette.style === "sphere" || !silhouette.points) {
    if (config.radius >= 24 && atmosphereScale > 0.02) {
      graphics.circle(0, 0, config.radius + (isRoot ? 5 : 3));
      graphics.stroke({
        color: palette.atmosphere,
        width: isRoot ? 4 : 2,
        alpha: (isRoot ? 0.18 : 0.1) * atmosphereScale,
      });
    }

    graphics.circle(0, 0, config.radius);
    graphics.stroke({
      color: outlineColor,
      width: outlineWidth,
      alpha: WORLD_ENTITY_STYLES.celestial.outlineAlpha,
    });
    return;
  }

  if (config.radius >= 24 && atmosphereScale > 0.02) {
    drawBodyStroke(
      graphics,
      silhouette,
      palette.atmosphere,
      (isRoot ? 4 : 2) + 1,
      (isRoot ? 0.18 : 0.1) * atmosphereScale,
    );
  }

  drawBodyStroke(
    graphics,
    silhouette,
    outlineColor,
    outlineWidth,
    WORLD_ENTITY_STYLES.celestial.outlineAlpha,
  );
}

function getInteriorHalfWidth(
  radius: number,
  y: number,
  padding: number,
): number {
  const clampedRadius = Math.max(0, radius - padding);
  const vertical = Math.min(clampedRadius, Math.abs(y));
  return Math.sqrt(
    Math.max(0, clampedRadius * clampedRadius - vertical * vertical),
  );
}

function constrainPointToDisk(
  point: { x: number; y: number },
  maxDistance: number,
): { x: number; y: number } {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= maxDistance || distance === 0) {
    return point;
  }

  const scale = maxDistance / distance;
  return {
    x: point.x * scale,
    y: point.y * scale,
  };
}

function randomPointInDisk(
  radius: number,
  rng: () => number,
): { x: number; y: number } {
  const angle = rng() * Math.PI * 2;
  const distance = Math.sqrt(rng()) * radius;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
}

function randomFeatureCenterInBody(
  bodyRadius: number,
  featureRadius: number,
  rng: () => number,
  edgeAllowance: number,
): { x: number; y: number } {
  const maxDistance = Math.max(
    0,
    bodyRadius - featureRadius * clamp(edgeAllowance, 0, 1),
  );
  return randomPointInDisk(maxDistance, rng);
}

function normalizePoint(point: { x: number; y: number }): {
  x: number;
  y: number;
} {
  const length = Math.hypot(point.x, point.y);
  if (length <= 0.000001) {
    return { x: 0, y: 0 };
  }

  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function createSeededRandom(seed: string): () => number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixColor(a: number, b: number, t: number): number {
  const rgbA = toRgb(a);
  const rgbB = toRgb(b);
  return fromRgb({
    r: Math.round(lerp(rgbA.r, rgbB.r, t)),
    g: Math.round(lerp(rgbA.g, rgbB.g, t)),
    b: Math.round(lerp(rgbA.b, rgbB.b, t)),
  });
}

function toRgb(color: number): { r: number; g: number; b: number } {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

function fromRgb(rgb: { r: number; g: number; b: number }): number {
  return (
    (clampChannel(rgb.r) << 16) |
    (clampChannel(rgb.g) << 8) |
    clampChannel(rgb.b)
  );
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function phaseWrap(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function intersectRayCircle(
  direction: ShapePoint,
  center: ShapePoint,
  radius: number,
): { enter: number; exit: number } | null {
  const projection = direction.x * center.x + direction.y * center.y;
  const centerLengthSquared = center.x * center.x + center.y * center.y;
  const discriminant =
    projection * projection - (centerLengthSquared - radius * radius);

  if (discriminant <= 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  return {
    enter: projection - root,
    exit: projection + root,
  };
}
