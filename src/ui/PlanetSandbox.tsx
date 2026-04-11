import { Application, Container, Graphics } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import {
  CELESTIAL_SOLAR_LIGHT_DIRECTION,
  createCelestialSprite,
  createCelestialTectonicPlateData,
  createCelestialTopographyData,
  type CelestialRenderStage,
} from "../game/rendering/celestial-generator";
import type {
  CelestialBodyClass,
  CelestialConfig,
  CelestialRockyPalette,
  CelestialWeatherLevel,
} from "../game/maps/types";
import { closePlanetLab, useDevToolsState } from "./dev-tools-store";

const INITIAL_PREVIEW_WIDTH = 1280;
const INITIAL_PREVIEW_HEIGHT = 720;
const GRID_SPACING_WORLD_UNITS = [25, 50, 100, 200, 400, 800, 1600, 3200];

const BODY_CLASS_OPTIONS: Array<{
  value: CelestialBodyClass;
  label: string;
}> = [
  { value: "meteor", label: "Meteor" },
  { value: "comet", label: "Comet" },
  { value: "asteroid", label: "Asteroid" },
  { value: "rocky-moon", label: "Rocky Moon" },
  { value: "icy-moon", label: "Icy Moon" },
  { value: "dwarf-planet", label: "Dwarf Planet" },
  { value: "icy-dwarf", label: "Icy Dwarf" },
  { value: "small-rocky-planet", label: "Small Rocky Planet" },
  { value: "small-icy-planet", label: "Small Icy Planet" },
  { value: "small-volcanic-planet", label: "Small Volcanic Planet" },
  { value: "medium-ocean-planet", label: "Medium Ocean Planet" },
  { value: "medium-terrestrial-planet", label: "Medium Terrestrial Planet" },
  { value: "medium-earthlike-planet", label: "Medium Earthlike Planet" },
  { value: "large-ocean-planet", label: "Large Ocean Planet" },
  { value: "large-terrestrial-planet", label: "Large Terrestrial Planet" },
  { value: "large-earthlike-planet", label: "Large Earthlike Planet" },
  { value: "gas-giant", label: "Gas Giant" },
  { value: "gas-supergiant", label: "Gas Supergiant" },
];

const WEATHER_OPTIONS: Array<{
  value: CelestialWeatherLevel;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" },
  { value: "extreme", label: "Extreme" },
];

const ROCKY_PALETTE_OPTIONS: Array<{
  value: CelestialRockyPalette;
  label: string;
}> = [
  { value: "default", label: "Default" },
  { value: "ash", label: "Ash" },
  { value: "basalt", label: "Basalt" },
  { value: "slate", label: "Slate" },
  { value: "ochre", label: "Ochre" },
  { value: "umber", label: "Umber" },
  { value: "rust", label: "Rust" },
  { value: "iron", label: "Iron" },
  { value: "obsidian", label: "Obsidian" },
];

const RENDER_STAGE_OPTIONS: Array<{
  value: CelestialRenderStage;
  label: string;
}> = [
  { value: "flat", label: "Flat" },
  { value: "surface", label: "Surface" },
  { value: "relief", label: "Relief" },
  { value: "full", label: "Full" },
];

interface PreviewSize {
  width: number;
  height: number;
}

export function PlanetSandbox() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const previewLayerRef = useRef<Container | null>(null);
  const { planetLabOpen: isOpen } = useDevToolsState();

  const [previewReady, setPreviewReady] = useState(false);
  const [previewSize, setPreviewSize] = useState<PreviewSize>({
    width: INITIAL_PREVIEW_WIDTH,
    height: INITIAL_PREVIEW_HEIGHT,
  });

  const [bodyClass, setBodyClass] = useState<CelestialBodyClass>(
    "medium-earthlike-planet",
  );
  const [weatherLevel, setWeatherLevel] =
    useState<CelestialWeatherLevel>("moderate");
  const [rockyPalette, setRockyPalette] =
    useState<CelestialRockyPalette>("default");
  const [renderSeed, setRenderSeed] = useState("aurelia");
  const [radius, setRadius] = useState(130);
  const [colorHex, setColorHex] = useState("#4d9bff");
  const [renderStage, setRenderStage] = useState<CelestialRenderStage>("full");
  const [worldZoom, setWorldZoom] = useState(152);
  const [rotationDegrees, setRotationDegrees] = useState(-8);
  const [showGrid, setShowGrid] = useState(true);
  const [showScaleRings, setShowScaleRings] = useState(true);
  const [showReadabilityPreviews, setShowReadabilityPreviews] = useState(true);
  const [showTectonicPlates, setShowTectonicPlates] = useState(false);
  const [hasEditedRenderStage, setHasEditedRenderStage] = useState(false);
  const [hasEditedTectonicOverlay, setHasEditedTectonicOverlay] = useState(false);
  const [tectonicPlateCount, setTectonicPlateCount] = useState(7);
  const [showTopography, setShowTopography] = useState(true);
  const [showTopographyShading, setShowTopographyShading] = useState(true);
  const [showTopographyCraters, setShowTopographyCraters] = useState(true);
  const [topographyContourCount, setTopographyContourCount] = useState(6);
  const [topographyShadeLevels, setTopographyShadeLevels] = useState(5);
  const [topographyCraterDensity, setTopographyCraterDensity] = useState(1);

  useEffect(() => {
    const supportsTectonics = supportsPlanetLabTectonicsForBody(bodyClass);
    if (supportsTectonics && !hasEditedRenderStage && renderStage === "flat") {
      setRenderStage("full");
    }
    if (supportsTectonics && !hasEditedTectonicOverlay && showTectonicPlates) {
      setShowTectonicPlates(false);
    }
  }, [
    bodyClass,
    hasEditedRenderStage,
    hasEditedTectonicOverlay,
    renderStage,
    showTectonicPlates,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    let disposed = false;
    const app = new Application();

    void app
      .init({
        width: INITIAL_PREVIEW_WIDTH,
        height: INITIAL_PREVIEW_HEIGHT,
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true, texture: false });
          return;
        }

        const host = hostRef.current;
        if (!host) {
          app.destroy(true, { children: true, texture: false });
          return;
        }

        const previewLayer = new Container();
        app.stage.addChild(previewLayer);
        host.replaceChildren(app.canvas);

        const nextSize = measurePreviewHost(host);
        resizePreviewApplication(app, nextSize);

        appRef.current = app;
        previewLayerRef.current = previewLayer;
        setPreviewSize(nextSize);
        setPreviewReady(true);
      });

    return () => {
      disposed = true;
      previewLayerRef.current = null;
      appRef.current = null;
      app.destroy(true, { children: true, texture: false });
    };
  }, []);

  useEffect(() => {
    if (!previewReady || !hostRef.current || !appRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !appRef.current) {
        return;
      }

      const nextSize = {
        width: Math.max(420, Math.floor(entry.contentRect.width)),
        height: Math.max(320, Math.floor(entry.contentRect.height)),
      };
      resizePreviewApplication(appRef.current, nextSize);
      setPreviewSize(nextSize);
    });

    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
    };
  }, [previewReady]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePlanetLab();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    const previewLayer = previewLayerRef.current;

    if (!previewLayer || previewSize.width <= 0 || previewSize.height <= 0) {
      return;
    }

    previewLayer.removeChildren().forEach((child) => {
      child.destroy();
    });

    const config = createSandboxConfig({
      bodyClass,
      weatherLevel,
      rockyPalette,
      renderSeed,
      radius,
      colorHex,
    });
    const supportsPlanetLabTectonics = supportsPlanetLabTectonicsForBody(bodyClass);
    const supportsIrregularTopography = supportsPlanetLabTopography(bodyClass);

    const previewRailWidth = showReadabilityPreviews
      ? Math.min(268, Math.max(188, previewSize.width * 0.22))
      : 0;
    const worldViewportWidth = Math.max(420, previewSize.width - previewRailWidth);
    const worldCenterX = Math.round(worldViewportWidth * 0.5);
    const worldCenterY = Math.round(previewSize.height * 0.56);
    const pixelsPerWorldUnit = Math.max(
      0.08,
      worldZoom / Math.max(config.radius, 1),
    );

    const backgroundLayer = new Graphics();
    drawStarField(backgroundLayer, previewSize, `${renderSeed}:stars`);
    previewLayer.addChild(backgroundLayer);

    if (showGrid) {
      const gridLayer = new Graphics();
      drawWorldGrid(gridLayer, {
        previewSize,
        viewportWidth: worldViewportWidth,
        centerX: worldCenterX,
        centerY: worldCenterY,
        pixelsPerWorldUnit,
      });
      previewLayer.addChild(gridLayer);
    }

    if (showScaleRings) {
      const scaleRingLayer = new Graphics();
      drawScaleRings(scaleRingLayer, {
        centerX: worldCenterX,
        centerY: worldCenterY,
        bodyRadius: config.radius,
        pixelsPerWorldUnit,
        viewportWidth: worldViewportWidth,
        viewportHeight: previewSize.height,
      });
      previewLayer.addChild(scaleRingLayer);
    }

    if (showReadabilityPreviews) {
      const previewRailLayer = new Graphics();
      drawPreviewRail(previewRailLayer, previewSize, previewRailWidth);
      previewLayer.addChild(previewRailLayer);
    }

    const mainSprite = createCelestialSprite(config, { renderStage });
    mainSprite.scale.set(worldZoom / Math.max(config.radius, 1));
    mainSprite.rotation = degreesToRadians(rotationDegrees);
    mainSprite.position.set(worldCenterX, worldCenterY);
    previewLayer.addChild(mainSprite);

    if (supportsPlanetLabTectonics && showTectonicPlates) {
      const plateData = createCelestialTectonicPlateData(config, {
        plateCount: tectonicPlateCount,
      });
      if (plateData.cells.length > 0) {
        const tectonicLayer = new Graphics();
        drawTectonicPlateOverlay(tectonicLayer, plateData, {
          centerX: worldCenterX,
          centerY: worldCenterY,
          scale: worldZoom / Math.max(config.radius, 1),
          rotationDegrees,
        });
        previewLayer.addChild(tectonicLayer);
      }
    }

    if (
      supportsIrregularTopography &&
      (showTopography || showTopographyShading || showTopographyCraters)
    ) {
      const topographyData = createCelestialTopographyData(config, {
        contourCount: topographyContourCount,
      });
      const topographyTransform = {
        centerX: worldCenterX,
        centerY: worldCenterY,
        scale: worldZoom / Math.max(config.radius, 1),
        rotationDegrees,
      };
      const topographyLayer = new Container();
      const topographyMask = new Graphics();
      drawTopographyMask(topographyMask, topographyData, topographyTransform);
      topographyLayer.mask = topographyMask;
      previewLayer.addChild(topographyMask);

      if (showTopographyShading) {
        const topographyShadingLayer = new Graphics();
        drawTopographyShading(
          topographyShadingLayer,
          topographyData,
          topographyTransform,
          {
            bodyClass,
            shadeLevels: topographyShadeLevels,
          },
        );
        topographyLayer.addChild(topographyShadingLayer);
      }
      if (showTopographyCraters) {
        const topographyCraterLayer = new Graphics();
        drawTopographyCraters(
          topographyCraterLayer,
          topographyData,
          topographyTransform,
          {
            bodyClass,
            renderSeed,
            densityScale: topographyCraterDensity,
          },
        );
        topographyLayer.addChild(topographyCraterLayer);
      }
      if (showTopography) {
        const topographyOverlayLayer = new Graphics();
        drawTopographyOverlay(
          topographyOverlayLayer,
          topographyData,
          topographyTransform,
        );
        topographyLayer.addChild(topographyOverlayLayer);
      }
      previewLayer.addChild(topographyLayer);
    }

    if (showReadabilityPreviews) {
      const previewRailCenterX =
        previewSize.width - Math.round(previewRailWidth * 0.5);

      const commandSprite = createCelestialSprite(config, { renderStage });
      commandSprite.scale.set(56 / Math.max(config.radius, 1));
      commandSprite.rotation = degreesToRadians(rotationDegrees);
      commandSprite.position.set(previewRailCenterX, previewSize.height * 0.31);
      previewLayer.addChild(commandSprite);

      const tacticalSprite = createCelestialSprite(config, { renderStage });
      tacticalSprite.scale.set(20 / Math.max(config.radius, 1));
      tacticalSprite.rotation = degreesToRadians(rotationDegrees);
      tacticalSprite.position.set(previewRailCenterX, previewSize.height * 0.66);
      previewLayer.addChild(tacticalSprite);
    }
  }, [
    bodyClass,
    colorHex,
    previewReady,
    previewSize,
    radius,
    renderStage,
    renderSeed,
    rockyPalette,
    rotationDegrees,
    showGrid,
    showReadabilityPreviews,
    showScaleRings,
    showTectonicPlates,
    showTopography,
    showTopographyCraters,
    showTopographyShading,
    tectonicPlateCount,
    topographyCraterDensity,
    topographyContourCount,
    topographyShadeLevels,
    weatherLevel,
    worldZoom,
  ]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <>
      <div
        className={`planet-sandbox-overlay${isOpen ? " planet-sandbox-overlay--open" : ""}`}
      >
        <section className="planet-sandbox" aria-hidden={!isOpen}>
          <header className="planet-sandbox__header">
            <div>
              <div className="planet-sandbox__title">Planet Lab</div>
              <div className="planet-sandbox__meta">
                Full-screen procedural body preview with world-space scale,
                command-scale, and tactical-scale references.
              </div>
            </div>
            <div className="planet-sandbox__header-actions">
              <button
                type="button"
                className="planet-sandbox__button"
                onClick={() => {
                  setRenderSeed(createRandomSeed());
                }}
              >
                Randomize Seed
              </button>
              <button
                type="button"
                className="planet-sandbox__button"
                onClick={() => {
                  closePlanetLab();
                }}
              >
                Close
              </button>
            </div>
          </header>
          <div className="planet-sandbox__body">
            <aside className="planet-sandbox__sidebar">
              <section className="planet-sandbox__section">
                <div className="planet-sandbox__section-title">Body</div>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">Class</span>
                  <select
                    className="planet-sandbox__select"
                    value={bodyClass}
                    onChange={(event) => {
                      setBodyClass(event.target.value as CelestialBodyClass);
                    }}
                  >
                    {BODY_CLASS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">Weather</span>
                  <select
                    className="planet-sandbox__select"
                    value={weatherLevel}
                    onChange={(event) => {
                      setWeatherLevel(event.target.value as CelestialWeatherLevel);
                    }}
                  >
                    {WEATHER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">
                    Render Stage
                  </span>
                  <select
                    className="planet-sandbox__select"
                    value={renderStage}
                    onChange={(event) => {
                      setHasEditedRenderStage(true);
                      setRenderStage(event.target.value as CelestialRenderStage);
                    }}
                  >
                    {RENDER_STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">
                    Rocky Palette
                  </span>
                  <select
                    className="planet-sandbox__select"
                    value={rockyPalette}
                    onChange={(event) => {
                      setRockyPalette(event.target.value as CelestialRockyPalette);
                    }}
                  >
                    {ROCKY_PALETTE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">Seed</span>
                  <div className="planet-sandbox__inline">
                    <input
                      className="planet-sandbox__input"
                      value={renderSeed}
                      onChange={(event) => {
                        setRenderSeed(event.target.value);
                      }}
                    />
                    <button
                      type="button"
                      className="planet-sandbox__button"
                      onClick={() => {
                        setRenderSeed(createRandomSeed());
                      }}
                    >
                      Random
                    </button>
                  </div>
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">
                    Radius {radius}
                  </span>
                  <input
                    className="planet-sandbox__range"
                    type="range"
                    min="12"
                    max="240"
                    step="1"
                    value={radius}
                    onChange={(event) => {
                      setRadius(Number(event.target.value));
                    }}
                  />
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">Base Color</span>
                  <div className="planet-sandbox__inline">
                    <input
                      className="planet-sandbox__color"
                      type="color"
                      value={colorHex}
                      onChange={(event) => {
                        setColorHex(event.target.value);
                      }}
                    />
                    <input
                      className="planet-sandbox__input"
                      value={colorHex}
                      onChange={(event) => {
                        setColorHex(normalizeHexColor(event.target.value));
                      }}
                    />
                  </div>
                </label>
              </section>
              <section className="planet-sandbox__section">
                <div className="planet-sandbox__section-title">World View</div>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">
                    World Zoom {worldZoom}
                  </span>
                  <input
                    className="planet-sandbox__range"
                    type="range"
                    min="44"
                    max="260"
                    step="1"
                    value={worldZoom}
                    onChange={(event) => {
                      setWorldZoom(Number(event.target.value));
                    }}
                  />
                </label>
                <label className="planet-sandbox__field">
                  <span className="planet-sandbox__field-label">
                    Rotation {rotationDegrees}°
                  </span>
                  <input
                    className="planet-sandbox__range"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotationDegrees}
                    onChange={(event) => {
                      setRotationDegrees(Number(event.target.value));
                    }}
                  />
                </label>
                <label className="planet-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(event) => {
                      setShowGrid(event.target.checked);
                    }}
                  />
                  <span>Show world grid</span>
                </label>
                <label className="planet-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={showScaleRings}
                    onChange={(event) => {
                      setShowScaleRings(event.target.checked);
                    }}
                  />
                  <span>Show scale rings</span>
                </label>
                <label className="planet-sandbox__toggle">
                  <input
                    type="checkbox"
                    checked={showReadabilityPreviews}
                    onChange={(event) => {
                      setShowReadabilityPreviews(event.target.checked);
                    }}
                  />
                  <span>Show command and tactical references</span>
                </label>
                {supportsPlanetLabTectonicsForBody(bodyClass) ? (
                  <>
                    <label className="planet-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={showTectonicPlates}
                        onChange={(event) => {
                          setHasEditedTectonicOverlay(true);
                          setShowTectonicPlates(event.target.checked);
                        }}
                      />
                      <span>Show tectonic debug overlay</span>
                    </label>
                    <label className="planet-sandbox__field">
                      <span className="planet-sandbox__field-label">
                        Plate Count {tectonicPlateCount}
                      </span>
                      <input
                        className="planet-sandbox__range"
                        type="range"
                        min="3"
                        max="16"
                        step="1"
                        value={tectonicPlateCount}
                        onChange={(event) => {
                          setTectonicPlateCount(Number(event.target.value));
                        }}
                      />
                    </label>
                  </>
                ) : null}
                {supportsPlanetLabTopography(bodyClass) ? (
                  <>
                    <label className="planet-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={showTopography}
                        onChange={(event) => {
                          setShowTopography(event.target.checked);
                        }}
                      />
                      <span>Show topography lines</span>
                    </label>
                    <label className="planet-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={showTopographyShading}
                        onChange={(event) => {
                          setShowTopographyShading(event.target.checked);
                        }}
                      />
                      <span>Shade topography</span>
                    </label>
                    <label className="planet-sandbox__toggle">
                      <input
                        type="checkbox"
                        checked={showTopographyCraters}
                        onChange={(event) => {
                          setShowTopographyCraters(event.target.checked);
                        }}
                      />
                      <span>Show craters</span>
                    </label>
                    <label className="planet-sandbox__field">
                      <span className="planet-sandbox__field-label">
                        Topography Contours {topographyContourCount}
                      </span>
                      <input
                        className="planet-sandbox__range"
                        type="range"
                        min="3"
                        max="12"
                        step="1"
                        value={topographyContourCount}
                        onChange={(event) => {
                          setTopographyContourCount(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="planet-sandbox__field">
                      <span className="planet-sandbox__field-label">
                        Shading Levels {topographyShadeLevels}
                      </span>
                      <input
                        className="planet-sandbox__range"
                        type="range"
                        min="2"
                        max="9"
                        step="1"
                        value={topographyShadeLevels}
                        onChange={(event) => {
                          setTopographyShadeLevels(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="planet-sandbox__field">
                      <span className="planet-sandbox__field-label">
                        Crater Density {topographyCraterDensity.toFixed(2)}
                      </span>
                      <input
                        className="planet-sandbox__range"
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={topographyCraterDensity}
                        onChange={(event) => {
                          setTopographyCraterDensity(Number(event.target.value));
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </section>
            </aside>
            <section className="planet-sandbox__workspace">
              <div className="planet-sandbox__workspace-header">
                <div className="planet-sandbox__workspace-title">
                  World-Space Preview
                </div>
                <div className="planet-sandbox__workspace-meta">
                  The center view uses map-space grid scaling. The right rail keeps
                  smaller command and tactical readability references visible while
                  you tune the main body.
                </div>
              </div>
              <div className="planet-sandbox__preview-shell">
                <div ref={hostRef} className="planet-sandbox__preview" />
                {showReadabilityPreviews ? (
                  <div className="planet-sandbox__preview-stack">
                    <div className="planet-sandbox__preview-label">Command</div>
                    <div className="planet-sandbox__preview-label">Tactical</div>
                  </div>
                ) : null}
                <div className="planet-sandbox__caption">
                  Planet Lab is dev-only. This is the same rendering path used by
                  in-game celestial bodies, now with room to tune against world
                  scale.
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}

function createSandboxConfig(input: {
  bodyClass: CelestialBodyClass;
  weatherLevel: CelestialWeatherLevel;
  rockyPalette: CelestialRockyPalette;
  renderSeed: string;
  radius: number;
  colorHex: string;
}): CelestialConfig {
  return {
    id: "sandbox:planet",
    name: "Sandbox Planet",
    systemId: "sandbox",
    parentId: null,
    rootPosition: { x: 0, y: 0 },
    mass: 1,
    radius: input.radius,
    color: hexToColorNumber(input.colorHex),
    orbitRadius: 0,
    orbitPeriod: 0,
    initialAngle: 0,
    celestialClass: input.bodyClass,
    weatherLevel: input.weatherLevel,
    rockyPalette: input.rockyPalette,
    renderSeed: input.renderSeed || "sandbox",
  };
}

function resizePreviewApplication(
  app: Application,
  size: PreviewSize,
): void {
  app.renderer.resize(size.width, size.height);
}

function measurePreviewHost(host: HTMLDivElement): PreviewSize {
  return {
    width: Math.max(420, Math.floor(host.clientWidth || INITIAL_PREVIEW_WIDTH)),
    height: Math.max(320, Math.floor(host.clientHeight || INITIAL_PREVIEW_HEIGHT)),
  };
}

function drawStarField(
  graphics: Graphics,
  previewSize: PreviewSize,
  seed: string,
): void {
  const rng = createSeededRandom(seed);
  const starCount = Math.round((previewSize.width * previewSize.height) / 14000);

  for (let index = 0; index < starCount; index += 1) {
    const x = rng() * previewSize.width;
    const y = rng() * previewSize.height;
    const radius = rng() < 0.88 ? 0.7 + rng() * 1.3 : 1.6 + rng() * 2.4;
    const alpha = 0.12 + rng() * 0.46;
    const color = rng() < 0.18 ? 0xbcecff : 0xffffff;
    graphics.circle(x, y, radius);
    graphics.fill({ color, alpha });
  }
}

function drawWorldGrid(
  graphics: Graphics,
  input: {
    previewSize: PreviewSize;
    viewportWidth: number;
    centerX: number;
    centerY: number;
    pixelsPerWorldUnit: number;
  },
): void {
  const worldSpacing = chooseGridSpacing(84 / input.pixelsPerWorldUnit);
  const spacingPixels = worldSpacing * input.pixelsPerWorldUnit;

  for (let index = 0; ; index += 1) {
    const positiveX = input.centerX + index * spacingPixels;
    const negativeX = input.centerX - index * spacingPixels;

    if (index === 0) {
      graphics.moveTo(positiveX, 0);
      graphics.lineTo(positiveX, input.previewSize.height);
      graphics.stroke({ color: 0x70e1ff, width: 1.4, alpha: 0.22 });
    } else {
      if (positiveX <= input.viewportWidth) {
        graphics.moveTo(positiveX, 0);
        graphics.lineTo(positiveX, input.previewSize.height);
        graphics.stroke({ color: 0x79b9d7, width: 1, alpha: 0.11 });
      }
      if (negativeX >= 0) {
        graphics.moveTo(negativeX, 0);
        graphics.lineTo(negativeX, input.previewSize.height);
        graphics.stroke({ color: 0x79b9d7, width: 1, alpha: 0.11 });
      }
      if (positiveX > input.viewportWidth && negativeX < 0) {
        break;
      }
    }
  }

  for (let index = 0; ; index += 1) {
    const positiveY = input.centerY + index * spacingPixels;
    const negativeY = input.centerY - index * spacingPixels;

    if (index === 0) {
      graphics.moveTo(0, positiveY);
      graphics.lineTo(input.viewportWidth, positiveY);
      graphics.stroke({ color: 0x70e1ff, width: 1.4, alpha: 0.22 });
    } else {
      if (positiveY <= input.previewSize.height) {
        graphics.moveTo(0, positiveY);
        graphics.lineTo(input.viewportWidth, positiveY);
        graphics.stroke({ color: 0x79b9d7, width: 1, alpha: 0.11 });
      }
      if (negativeY >= 0) {
        graphics.moveTo(0, negativeY);
        graphics.lineTo(input.viewportWidth, negativeY);
        graphics.stroke({ color: 0x79b9d7, width: 1, alpha: 0.11 });
      }
      if (positiveY > input.previewSize.height && negativeY < 0) {
        break;
      }
    }
  }
}

function drawScaleRings(
  graphics: Graphics,
  input: {
    centerX: number;
    centerY: number;
    bodyRadius: number;
    pixelsPerWorldUnit: number;
    viewportWidth: number;
    viewportHeight: number;
  },
): void {
  const maxVisibleRadius =
    Math.min(input.viewportWidth, input.viewportHeight) * 0.45;

  for (const multiplier of [2, 4, 8, 16]) {
    const ringRadius = input.bodyRadius * multiplier * input.pixelsPerWorldUnit;
    if (ringRadius < 26 || ringRadius > maxVisibleRadius) {
      continue;
    }

    graphics.circle(input.centerX, input.centerY, ringRadius);
    graphics.stroke({
      color: 0x9ae4ff,
      width: multiplier === 2 ? 1.2 : 1,
      alpha: multiplier === 2 ? 0.18 : 0.1,
    });
  }
}

function drawPreviewRail(
  graphics: Graphics,
  previewSize: PreviewSize,
  previewRailWidth: number,
): void {
  const x = previewSize.width - previewRailWidth;
  graphics.rect(x, 0, previewRailWidth, previewSize.height);
  graphics.fill({ color: 0x08101b, alpha: 0.58 });

  graphics.moveTo(x, 0);
  graphics.lineTo(x, previewSize.height);
  graphics.stroke({ color: 0x98dcff, width: 1, alpha: 0.18 });

  for (const y of [previewSize.height * 0.18, previewSize.height * 0.52]) {
    graphics.moveTo(x + 18, y);
    graphics.lineTo(previewSize.width - 18, y);
    graphics.stroke({ color: 0xc7efff, width: 1, alpha: 0.08 });
  }
}

function supportsPlanetLabTopography(bodyClass: CelestialBodyClass): boolean {
  switch (bodyClass) {
    case "meteor":
    case "asteroid":
    case "comet":
      return true;
    default:
      return false;
  }
}

function supportsPlanetLabTectonicsForBody(bodyClass: CelestialBodyClass): boolean {
  switch (bodyClass) {
    case "small-rocky-planet":
    case "small-volcanic-planet":
    case "medium-ocean-planet":
    case "medium-terrestrial-planet":
    case "medium-earthlike-planet":
    case "large-ocean-planet":
    case "large-terrestrial-planet":
    case "large-earthlike-planet":
      return true;
    default:
      return false;
  }
}

function drawTopographyOverlay(
  graphics: Graphics,
  topographyData: {
    contourPaths: Array<Array<{ x: number; y: number }>>;
  },
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
): void {
  topographyData.contourPaths.forEach((path, index) => {
    if (path.length < 2) {
      return;
    }

    const transformedPath = transformContourPath(path, transform);

    const first = transformedPath[0];
    if (!first) {
      return;
    }

    graphics.moveTo(first.x, first.y);
    for (let pointIndex = 1; pointIndex < transformedPath.length; pointIndex += 1) {
      const point = transformedPath[pointIndex];
      if (!point) {
        continue;
      }
      graphics.lineTo(point.x, point.y);
    }
    graphics.lineTo(first.x, first.y);
    graphics.stroke({
      color: index % 4 === 0 ? 0xf5f7da : 0xdbefcf,
      width: index % 4 === 0 ? 1.25 : 1,
      alpha: index % 4 === 0 ? 0.48 : 0.34,
      join: "round",
      cap: "round",
    });
  });
}

function drawTopographyMask(
  graphics: Graphics,
  topographyData: {
    silhouettePath: Array<{ x: number; y: number }>;
  },
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
): void {
  if (topographyData.silhouettePath.length < 3) {
    return;
  }

  fillClosedPath(
    graphics,
    transformContourPath(topographyData.silhouettePath, transform),
    0xffffff,
    1,
  );
}

function drawTopographyShading(
  graphics: Graphics,
  topographyData: {
    silhouettePath: Array<{ x: number; y: number }>;
    contourPaths: Array<Array<{ x: number; y: number }>>;
  },
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
  options: {
    bodyClass: CelestialBodyClass;
    shadeLevels: number;
  },
): void {
  const contourCount = topographyData.contourPaths.length;
  if (contourCount === 0 || topographyData.silhouettePath.length < 3) {
    return;
  }

  const transformedSilhouette = transformContourPath(
    topographyData.silhouettePath,
    transform,
  );
  const transformedContours = topographyData.contourPaths.map((path) =>
    transformContourPath(path, transform),
  );
  const bounds = getPathBounds(transformedSilhouette);
  const sampleSpacing = Math.max(2.6, Math.min(7.2, transform.scale * 3.8));
  const sampleRadius = sampleSpacing * 0.9;
  const lightDirection = rotateDirection(
    CELESTIAL_SOLAR_LIGHT_DIRECTION,
    transform.rotationDegrees,
  );
  const lightVector = normalizeVector3({
    x: lightDirection.x,
    y: lightDirection.y,
    z: 0.88,
  });
  const shadingProfile = getTopographyShadingProfile(options.bodyClass);
  const slopeStrength = shadingProfile.slopeStrength;
  const highlightAlphaCap = shadingProfile.highlightAlphaCap;
  const shadeAlphaCap = shadingProfile.shadowAlphaCap;

  for (
    let y = bounds.minY;
    y <= bounds.maxY;
    y += sampleSpacing
  ) {
    for (
      let x = bounds.minX;
      x <= bounds.maxX;
      x += sampleSpacing
    ) {
      const sampleCenter = {
        x: x + sampleSpacing * 0.5,
        y: y + sampleSpacing * 0.5,
      };
      const cellCoverage = sampleCellCoverage(
        sampleCenter,
        transformedSilhouette,
        sampleSpacing,
      );
      if (!cellCoverage) {
        continue;
      }
      const samplePoint = cellCoverage.anchor;
      const coverage = cellCoverage.coverage;
      const gradientSampleStep = sampleSpacing * 0.82;

      const height = sampleTopographyHeight(
        samplePoint,
        transformedSilhouette,
        transformedContours,
        sampleSpacing,
      );
      const heightRight = sampleTopographyHeight(
        {
          x: samplePoint.x + gradientSampleStep,
          y: samplePoint.y,
        },
        transformedSilhouette,
        transformedContours,
        sampleSpacing,
      );
      const heightLeft = sampleTopographyHeight(
        {
          x: samplePoint.x - gradientSampleStep,
          y: samplePoint.y,
        },
        transformedSilhouette,
        transformedContours,
        sampleSpacing,
      );
      const heightDown = sampleTopographyHeight(
        {
          x: samplePoint.x,
          y: samplePoint.y + gradientSampleStep,
        },
        transformedSilhouette,
        transformedContours,
        sampleSpacing,
      );
      const heightUp = sampleTopographyHeight(
        {
          x: samplePoint.x,
          y: samplePoint.y - gradientSampleStep,
        },
        transformedSilhouette,
        transformedContours,
        sampleSpacing,
      );

      const gradientX = (heightRight - heightLeft) / (gradientSampleStep * 2);
      const gradientY = (heightDown - heightUp) / (gradientSampleStep * 2);
      const normal = normalizeVector3({
        x: -gradientX * slopeStrength,
        y: -gradientY * slopeStrength,
        z: 1,
      });
      const intensity = dotVector3(normal, lightVector);
      const slopeMagnitude = Math.hypot(gradientX, gradientY);
      const reliefAmount = Math.max(
        shadingProfile.reliefFloor,
        Math.min(
          1,
          height * shadingProfile.heightWeight +
            slopeMagnitude * gradientSampleStep * shadingProfile.slopeWeight,
        ),
      );
      const shadowOcclusion = computeTopographyShadowOcclusion(
        samplePoint,
        height,
        transformedSilhouette,
        transformedContours,
        lightDirection,
        sampleSpacing,
      );

      const highlightAlpha = quantizeAlpha(
        Math.max(0, intensity - shadingProfile.highlightThreshold) *
          shadingProfile.highlightWeight *
          reliefAmount *
          coverage,
        highlightAlphaCap,
        Math.max(2, options.shadeLevels - 1),
      );
      const baseShadeAlpha =
        (Math.max(0, shadingProfile.shadowThreshold - intensity) *
          shadingProfile.shadowWeight *
          reliefAmount +
          shadowOcclusion * shadingProfile.occlusionWeight) *
        coverage;
      const shadeAlpha = quantizeAlpha(
        remapAlphaTowardCap(
          baseShadeAlpha,
          shadeAlphaCap,
          shadingProfile.shadowRemapExponent,
        ),
        shadeAlphaCap,
        options.shadeLevels,
      );

      if (highlightAlpha > 0.004) {
        graphics.circle(samplePoint.x, samplePoint.y, sampleRadius);
        graphics.fill({
          color: shadingProfile.highlightColor,
          alpha: Math.min(highlightAlphaCap, highlightAlpha),
        });
      }

      if (shadeAlpha > 0.004) {
        graphics.circle(samplePoint.x, samplePoint.y, sampleRadius);
        graphics.fill({
          color: shadingProfile.shadowColor,
          alpha: Math.min(shadeAlphaCap, shadeAlpha),
        });
      }
    }
  }
}

function drawTopographyCraters(
  graphics: Graphics,
  topographyData: {
    radius: number;
    silhouettePath: Array<{ x: number; y: number }>;
  },
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
  options: {
    bodyClass: CelestialBodyClass;
    renderSeed: string;
    densityScale: number;
  },
): void {
  const craterProfile = getTopographyCraterProfile(options.bodyClass);
  if (!craterProfile || options.densityScale <= 0) {
    return;
  }

  const silhouettePath = topographyData.silhouettePath;
  if (silhouettePath.length < 3) {
    return;
  }

  const rng = createSeededRandom(
    `${options.renderSeed}:${options.bodyClass}:craters`,
  );
  const localBounds = getPathBounds(silhouettePath);
  const lightDirection = rotateDirection(
    CELESTIAL_SOLAR_LIGHT_DIRECTION,
    transform.rotationDegrees,
  );
  const targetCount = Math.max(
    1,
    Math.round(
      (topographyData.radius / 18) *
        craterProfile.density *
        options.densityScale,
    ),
  );
  const placedCraters: Array<{
    center: { x: number; y: number };
    radius: number;
  }> = [];

  let attempts = 0;
  const maxAttempts = targetCount * 24;
  while (placedCraters.length < targetCount && attempts < maxAttempts) {
    attempts += 1;
    const craterRadius =
      topographyData.radius *
      lerp(
        craterProfile.minRadiusScale,
        craterProfile.maxRadiusScale,
        rng(),
      );
    const candidate = {
      x: lerp(localBounds.minX, localBounds.maxX, rng()),
      y: lerp(localBounds.minY, localBounds.maxY, rng()),
    };

    if (!pointInPolygon(candidate, silhouettePath)) {
      continue;
    }

    if (
      distanceToClosedPath(candidate, silhouettePath) <
      craterRadius * craterProfile.edgePaddingScale
    ) {
      continue;
    }

    let overlapsExisting = false;
    for (const crater of placedCraters) {
      const separation = Math.hypot(
        crater.center.x - candidate.x,
        crater.center.y - candidate.y,
      );
      if (
        separation <
        (crater.radius + craterRadius) * craterProfile.minimumSeparationScale
      ) {
        overlapsExisting = true;
        break;
      }
    }
    if (overlapsExisting) {
      continue;
    }

    placedCraters.push({
      center: candidate,
      radius: craterRadius,
    });
  }

  for (const crater of placedCraters) {
    const center = transformPoint(crater.center, transform);
    const craterRadius = crater.radius * transform.scale;
    const innerRadius = craterRadius * craterProfile.innerRadiusScale;
    const rimWidth = Math.max(1, craterRadius * craterProfile.rimWidthScale);
    const pitOffset = {
      x: -lightDirection.x * craterRadius * craterProfile.pitOffsetScale,
      y: -lightDirection.y * craterRadius * craterProfile.pitOffsetScale,
    };
    const highlightOffset = {
      x: lightDirection.x * craterRadius * craterProfile.highlightOffsetScale,
      y: lightDirection.y * craterRadius * craterProfile.highlightOffsetScale,
    };

    graphics.circle(center.x, center.y, craterRadius);
    graphics.fill({
      color: craterProfile.floorColor,
      alpha: craterProfile.floorAlpha,
    });
    graphics.circle(center.x + pitOffset.x, center.y + pitOffset.y, innerRadius);
    graphics.fill({
      color: craterProfile.shadowColor,
      alpha: craterProfile.shadowAlpha,
    });
    graphics.circle(
      center.x + highlightOffset.x,
      center.y + highlightOffset.y,
      innerRadius * 0.74,
    );
    graphics.fill({
      color: craterProfile.highlightColor,
      alpha: craterProfile.highlightAlpha,
    });
    graphics.circle(center.x, center.y, craterRadius);
    graphics.stroke({
      color: craterProfile.rimColor,
      width: rimWidth,
      alpha: craterProfile.rimAlpha,
    });
  }
}

function drawTectonicPlateOverlay(
  graphics: Graphics,
  plateData: {
    radius: number;
    sampleSpacing: number;
    plates: Array<{
      center: { x: number; y: number };
      drift: { x: number; y: number };
      tone: number;
    }>;
    cells: Array<{
      center: { x: number; y: number };
      plateIndex: number;
      boundary: boolean;
      jointRole?: "over" | "under";
      jointStrength?: number;
    }>;
  },
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
): void {
  const sampleRadius = Math.max(1.2, plateData.sampleSpacing * transform.scale * 0.52);
  const neutralColor = 0x8f8878;
  const highColor = 0xcfc3a9;
  const lowColor = 0x575247;

  for (const cell of plateData.cells) {
    const point = transformPoint(cell.center, transform);
    const plate = plateData.plates[cell.plateIndex];
    const elevation = computePlateCellElevation(cell, plate, plateData);
    const cellColor =
      elevation >= 0
        ? mixColorLocal(neutralColor, highColor, elevation)
        : mixColorLocal(neutralColor, lowColor, Math.abs(elevation));
    const cellAlpha = 0.14 + Math.abs(elevation) * 0.1;

    graphics.circle(point.x, point.y, sampleRadius);
    graphics.fill({
      color: cellColor,
      alpha: cellAlpha,
    });

    if (cell.boundary) {
      const jointStrength = Math.max(
        0.35,
        Math.min(1, (cell.jointStrength ?? 1) / 6),
      );
      if (cell.jointRole === "over") {
        graphics.circle(point.x, point.y, sampleRadius * 0.48);
        graphics.fill({
          color: mixColorLocal(highColor, 0xf7efdd, 0.42),
          alpha: 0.1 + jointStrength * 0.14,
        });
        graphics.circle(point.x, point.y, sampleRadius * 0.74);
        graphics.stroke({
          color: 0x605548,
          width: Math.max(1, sampleRadius * 0.24),
          alpha: 0.16 + jointStrength * 0.12,
        });
      } else if (cell.jointRole === "under") {
        graphics.circle(point.x, point.y, sampleRadius * 0.36);
        graphics.fill({
          color: mixColorLocal(lowColor, 0x151210, 0.55),
          alpha: 0.1 + jointStrength * 0.14,
        });
        graphics.circle(point.x, point.y, sampleRadius * 0.68);
        graphics.stroke({
          color: 0x201b17,
          width: Math.max(1, sampleRadius * 0.24),
          alpha: 0.14 + jointStrength * 0.14,
        });
      } else {
        graphics.circle(point.x, point.y, sampleRadius * 0.42);
        graphics.fill({
          color: 0xf1e4c5,
          alpha: 0.14,
        });
        graphics.circle(point.x, point.y, sampleRadius * 0.72);
        graphics.stroke({
          color: 0x3c372f,
          width: Math.max(1, sampleRadius * 0.24),
          alpha: 0.22,
        });
      }
    }
  }
}

function computePlateCellElevation(
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

function transformContourPath(
  path: ReadonlyArray<{ x: number; y: number }>,
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
): Array<{ x: number; y: number }> {
  const rotation = degreesToRadians(transform.rotationDegrees);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return path.map((point) => {
    const scaledX = point.x * transform.scale;
    const scaledY = point.y * transform.scale;
    return {
      x: transform.centerX + scaledX * cos - scaledY * sin,
      y: transform.centerY + scaledX * sin + scaledY * cos,
    };
  });
}

function transformPoint(
  point: { x: number; y: number },
  transform: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
  },
): { x: number; y: number } {
  const rotation = degreesToRadians(transform.rotationDegrees);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaledX = point.x * transform.scale;
  const scaledY = point.y * transform.scale;

  return {
    x: transform.centerX + scaledX * cos - scaledY * sin,
    y: transform.centerY + scaledX * sin + scaledY * cos,
  };
}

function offsetPath(
  path: ReadonlyArray<{ x: number; y: number }>,
  offset: { x: number; y: number },
): Array<{ x: number; y: number }> {
  return path.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  }));
}

function fillClosedPath(
  graphics: Graphics,
  path: ReadonlyArray<{ x: number; y: number }>,
  color: number,
  alpha: number,
): void {
  if (path.length < 3) {
    return;
  }

  graphics.poly(flattenPath(path), true);
  graphics.fill({ color, alpha });
}

function flattenPath(path: ReadonlyArray<{ x: number; y: number }>): number[] {
  const flat: number[] = [];
  for (const point of path) {
    flat.push(point.x, point.y);
  }
  return flat;
}

function rotateDirection(
  direction: { x: number; y: number },
  rotationDegrees: number,
): { x: number; y: number } {
  const rotation = degreesToRadians(rotationDegrees);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  };
}

function sampleTopographyHeight(
  point: { x: number; y: number },
  silhouettePath: ReadonlyArray<{ x: number; y: number }>,
  contourPaths: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  sampleSpacing: number,
): number {
  if (!pointInPolygon(point, silhouettePath)) {
    return 0;
  }

  const edgeRelief = smoothstep(
    0,
    sampleSpacing * 4.5,
    distanceToClosedPath(point, silhouettePath),
  );
  let height = edgeRelief * 0.12;
  const layerInfluenceDistance = sampleSpacing * 5.2;
  const layerWeight = contourPaths.length > 0 ? 1 / contourPaths.length : 0;

  for (const contourPath of contourPaths) {
    if (!pointInPolygon(point, contourPath)) {
      continue;
    }

    const distance = distanceToClosedPath(point, contourPath);
    height +=
      smoothstep(0, layerInfluenceDistance, distance) * layerWeight;
  }

  return Math.max(0, Math.min(1, height));
}

function sampleCellCoverage(
  point: { x: number; y: number },
  silhouettePath: ReadonlyArray<{ x: number; y: number }>,
  sampleSpacing: number,
): { coverage: number; anchor: { x: number; y: number } } | null {
  const sampleOffsets = [
    { x: 0, y: 0 },
    { x: -0.42, y: 0 },
    { x: 0.42, y: 0 },
    { x: 0, y: -0.42 },
    { x: 0, y: 0.42 },
    { x: -0.28, y: -0.28 },
    { x: 0.28, y: -0.28 },
    { x: -0.28, y: 0.28 },
    { x: 0.28, y: 0.28 },
  ];

  let insideCount = 0;
  let sumX = 0;
  let sumY = 0;

  for (const offset of sampleOffsets) {
    const samplePoint = {
      x: point.x + offset.x * sampleSpacing,
      y: point.y + offset.y * sampleSpacing,
    };
    if (!pointInPolygon(samplePoint, silhouettePath)) {
      continue;
    }

    insideCount += 1;
    sumX += samplePoint.x;
    sumY += samplePoint.y;
  }

  if (insideCount === 0) {
    return null;
  }

  return {
    coverage: insideCount / sampleOffsets.length,
    anchor: {
      x: sumX / insideCount,
      y: sumY / insideCount,
    },
  };
}

function computeTopographyShadowOcclusion(
  point: { x: number; y: number },
  height: number,
  silhouettePath: ReadonlyArray<{ x: number; y: number }>,
  contourPaths: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  lightDirection: { x: number; y: number },
  sampleSpacing: number,
): number {
  let strongestShadow = 0;
  const marchDistance = sampleSpacing * 1.3;

  for (let step = 1; step <= 7; step += 1) {
    const marchPoint = {
      x: point.x + lightDirection.x * marchDistance * step,
      y: point.y + lightDirection.y * marchDistance * step,
    };
    if (!pointInPolygon(marchPoint, silhouettePath)) {
      break;
    }

    const upstreamHeight = sampleTopographyHeight(
      marchPoint,
      silhouettePath,
      contourPaths,
      sampleSpacing,
    );
    const allowableRise = 0.035 * step;
    strongestShadow = Math.max(
      strongestShadow,
      upstreamHeight - height - allowableRise,
    );
  }

  return Math.max(0, Math.min(1, strongestShadow * 3.4));
}

function getPathBounds(
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

function pointInPolygon(
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

function distanceToClosedPath(
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalizeVector3(vector: {
  x: number;
  y: number;
  z: number;
}): { x: number; y: number; z: number } {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (magnitude <= Number.EPSILON) {
    return { x: 0, y: 0, z: 1 };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function dotVector3(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function quantizeAlpha(value: number, cap: number, levels: number): number {
  if (value <= 0 || cap <= 0 || levels <= 1) {
    return Math.max(0, value);
  }

  const normalized = Math.max(0, Math.min(1, value / cap));
  const quantized = Math.round(normalized * levels) / levels;
  return quantized * cap;
}

function mixColorLocal(a: number, b: number, t: number): number {
  const rgbA = toRgbLocal(a);
  const rgbB = toRgbLocal(b);
  return fromRgbLocal({
    r: Math.round(lerp(rgbA.r, rgbB.r, t)),
    g: Math.round(lerp(rgbA.g, rgbB.g, t)),
    b: Math.round(lerp(rgbA.b, rgbB.b, t)),
  });
}

function toRgbLocal(color: number): { r: number; g: number; b: number } {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

function fromRgbLocal(rgb: { r: number; g: number; b: number }): number {
  return (
    (clampChannelLocal(rgb.r) << 16) |
    (clampChannelLocal(rgb.g) << 8) |
    clampChannelLocal(rgb.b)
  );
}

function clampChannelLocal(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function remapAlphaTowardCap(
  value: number,
  cap: number,
  exponent: number,
): number {
  if (value <= 0 || cap <= 0) {
    return 0;
  }

  const normalized = Math.max(0, Math.min(1, value / cap));
  return cap * Math.pow(normalized, exponent);
}

function getTopographyShadingProfile(bodyClass: CelestialBodyClass): {
  slopeStrength: number;
  reliefFloor: number;
  heightWeight: number;
  slopeWeight: number;
  highlightThreshold: number;
  highlightWeight: number;
  highlightAlphaCap: number;
  shadowThreshold: number;
  shadowWeight: number;
  occlusionWeight: number;
  shadowAlphaCap: number;
  shadowRemapExponent: number;
  highlightColor: number;
  shadowColor: number;
} {
  switch (bodyClass) {
    case "asteroid":
    case "meteor":
      return {
        slopeStrength: 7.5,
        reliefFloor: 0.08,
        heightWeight: 0.62,
        slopeWeight: 1.05,
        highlightThreshold: 0.76,
        highlightWeight: 0.34,
        highlightAlphaCap: 0.08,
        shadowThreshold: 0.72,
        shadowWeight: 0.58,
        occlusionWeight: 0.18,
        shadowAlphaCap: 0.16,
        shadowRemapExponent: 0.74,
        highlightColor: 0xe9e3c7,
        shadowColor: 0x0d1511,
      };
    default:
      return {
        slopeStrength: 12,
        reliefFloor: 0.16,
        heightWeight: 0.9,
        slopeWeight: 1.9,
        highlightThreshold: 0.71,
        highlightWeight: 0.68,
        highlightAlphaCap: 0.18,
        shadowThreshold: 0.69,
        shadowWeight: 0.8,
        occlusionWeight: 0.34,
        shadowAlphaCap: 0.22,
        shadowRemapExponent: 0.62,
        highlightColor: 0xf7f4d6,
        shadowColor: 0x08120d,
      };
  }
}

function getTopographyCraterProfile(bodyClass: CelestialBodyClass): {
  density: number;
  minRadiusScale: number;
  maxRadiusScale: number;
  edgePaddingScale: number;
  minimumSeparationScale: number;
  innerRadiusScale: number;
  pitOffsetScale: number;
  highlightOffsetScale: number;
  rimWidthScale: number;
  floorColor: number;
  floorAlpha: number;
  shadowColor: number;
  shadowAlpha: number;
  highlightColor: number;
  highlightAlpha: number;
  rimColor: number;
  rimAlpha: number;
} | null {
  switch (bodyClass) {
    case "meteor":
      return {
        density: 0.92,
        minRadiusScale: 0.034,
        maxRadiusScale: 0.082,
        edgePaddingScale: 1.1,
        minimumSeparationScale: 1.45,
        innerRadiusScale: 0.72,
        pitOffsetScale: 0.16,
        highlightOffsetScale: 0.12,
        rimWidthScale: 0.08,
        floorColor: 0x131714,
        floorAlpha: 0.12,
        shadowColor: 0x090d0b,
        shadowAlpha: 0.16,
        highlightColor: 0xf0e7c8,
        highlightAlpha: 0.06,
        rimColor: 0xe1d8b8,
        rimAlpha: 0.11,
      };
    case "asteroid":
      return {
        density: 1.15,
        minRadiusScale: 0.032,
        maxRadiusScale: 0.088,
        edgePaddingScale: 1.08,
        minimumSeparationScale: 1.38,
        innerRadiusScale: 0.74,
        pitOffsetScale: 0.16,
        highlightOffsetScale: 0.12,
        rimWidthScale: 0.08,
        floorColor: 0x121613,
        floorAlpha: 0.12,
        shadowColor: 0x080d0a,
        shadowAlpha: 0.16,
        highlightColor: 0xf1e8ca,
        highlightAlpha: 0.055,
        rimColor: 0xe7ddbd,
        rimAlpha: 0.1,
      };
    case "rocky-moon":
    case "icy-moon":
    case "dwarf-planet":
    case "icy-dwarf":
    case "small-rocky-planet":
    case "small-icy-planet":
      return {
        density: 0.72,
        minRadiusScale: 0.028,
        maxRadiusScale: 0.072,
        edgePaddingScale: 1.12,
        minimumSeparationScale: 1.34,
        innerRadiusScale: 0.76,
        pitOffsetScale: 0.15,
        highlightOffsetScale: 0.11,
        rimWidthScale: 0.074,
        floorColor: 0x141914,
        floorAlpha: 0.11,
        shadowColor: 0x09100c,
        shadowAlpha: 0.14,
        highlightColor: 0xf3edd3,
        highlightAlpha: 0.05,
        rimColor: 0xe8e1c6,
        rimAlpha: 0.09,
      };
    default:
      return null;
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function chooseGridSpacing(targetWorldSpacing: number): number {
  let bestSpacing = GRID_SPACING_WORLD_UNITS[0];
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const spacing of GRID_SPACING_WORLD_UNITS) {
    const delta = Math.abs(spacing - targetWorldSpacing);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSpacing = spacing;
    }
  }

  return bestSpacing;
}

function hexToColorNumber(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function createRandomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return "#4d9bff";
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
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
