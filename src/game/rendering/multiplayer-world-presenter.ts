import { Container, Graphics, Text } from "pixi.js";
import { computeCameraFrame } from "../camera/prototype-camera";
import { createCelestialSprite } from "./celestial-generator";
import {
  buildMultiplayerCelestialConfig,
  buildMultiplayerMapBodiesById,
} from "./multiplayer-celestial-adapter";
import { drawOrbitalGuides } from "./prototype-overlays";
import {
  createInterceptorSprite,
  paintInterceptorSprite,
} from "./ship-sprites";
import { WORLD_ENTITY_STYLES } from "./world-entity-styles";
import type {
  MultiplayerMapBodyConfig,
  MultiplayerMapDefinition,
} from "../../../shared/multiplayer-map.js";
import type {
  ResolvedSimCelestialBodyState,
  ResolvedSimulationFrame,
  ResolvedSimPlayerState,
} from "../../../shared/multiplayer-snapshot-view.js";

interface BodyVisual {
  sprite: Container;
}

const EXPLOSION_DURATION_SECONDS = 1.4;

interface PlayerVisual {
  sprite: Graphics;
  explosion: Graphics;
  label: Text;
  initialized: boolean;
  wasAlive: boolean;
  explosionElapsedSeconds: number;
  explosionX: number;
  explosionY: number;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
  initialized: boolean;
}

export interface MultiplayerWorldPresenterRenderOptions {
  frame: ResolvedSimulationFrame;
  rosterNamesByPlayerId: ReadonlyMap<string, string>;
  selfPlayerId: string | null;
  tickerDeltaTime: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface MultiplayerWorldPresenterOptions {
  world: Container;
  orbitLayer: Graphics;
  bodyLayer: Container;
  playerLayer: Container;
  initialMapDefinition: MultiplayerMapDefinition;
  cameraSmoothing?: number;
  cameraMinScale?: number;
  cameraMaxScale?: number;
  cameraPadding?: number;
}

export interface PlayerSpriteInfo {
  worldX: number;
  worldY: number;
  rotation: number;
}

export interface MultiplayerWorldPresenter {
  setMapDefinition(mapDefinition: MultiplayerMapDefinition): void;
  render(options: MultiplayerWorldPresenterRenderOptions): void;
  dispose(): void;
  getPlayerSpriteInfo(playerId: string): PlayerSpriteInfo | null;
}

const DEFAULT_CAMERA_SMOOTHING = 0.12;
const DEFAULT_CAMERA_MIN_SCALE = 0.08;
const DEFAULT_CAMERA_MAX_SCALE = 0.46;
const DEFAULT_CAMERA_PADDING = 260;
const DEFAULT_PLAYER_RENDER_SMOOTHING = 0.3;
const PLAYER_RENDER_TELEPORT_SNAP_DISTANCE = 520;

export function createMultiplayerWorldPresenter(
  options: MultiplayerWorldPresenterOptions,
): MultiplayerWorldPresenter {
  let activeMapDefinition = options.initialMapDefinition;
  let activeMapBodiesById = buildMultiplayerMapBodiesById(activeMapDefinition);
  const bodyVisuals = new Map<string, BodyVisual>();
  const playerVisuals = new Map<string, PlayerVisual>();
  const camera: CameraState = {
    x: 0,
    y: 0,
    scale: 1,
    initialized: false,
  };

  const cameraSmoothing = options.cameraSmoothing ?? DEFAULT_CAMERA_SMOOTHING;
  const cameraMinScale = options.cameraMinScale ?? DEFAULT_CAMERA_MIN_SCALE;
  const cameraMaxScale = options.cameraMaxScale ?? DEFAULT_CAMERA_MAX_SCALE;
  const cameraPadding = options.cameraPadding ?? DEFAULT_CAMERA_PADDING;

  const setMapDefinition = (mapDefinition: MultiplayerMapDefinition): void => {
    if (mapDefinition.id === activeMapDefinition.id) {
      return;
    }

    activeMapDefinition = mapDefinition;
    activeMapBodiesById = buildMultiplayerMapBodiesById(activeMapDefinition);
    for (const visual of bodyVisuals.values()) {
      visual.sprite.destroy();
    }
    bodyVisuals.clear();
  };

  const render = (renderOptions: MultiplayerWorldPresenterRenderOptions): void => {
    renderBodies(renderOptions.frame.celestialBodies);
    renderPlayers(
      renderOptions.frame.players,
      renderOptions.rosterNamesByPlayerId,
      renderOptions.selfPlayerId,
      renderOptions.tickerDeltaTime,
    );
    updateCamera(renderOptions);
  };

  const renderBodies = (bodies: readonly ResolvedSimCelestialBodyState[]): void => {
    const activeIds = new Set(bodies.map((body) => body.id));
    for (const [bodyId, visual] of bodyVisuals) {
      if (activeIds.has(bodyId)) {
        continue;
      }
      visual.sprite.destroy();
      bodyVisuals.delete(bodyId);
    }

    drawOrbitalGuides(
      options.orbitLayer,
      bodies.map((body) => ({
        config: buildMultiplayerCelestialConfig(
          body,
          activeMapBodiesById.get(body.id),
        ),
        body: {
          id: body.id,
          position: {
            x: body.renderX,
            y: body.renderY,
          },
          radius: body.radius,
        },
      })),
    );

    for (const body of bodies) {
      let visual = bodyVisuals.get(body.id);
      if (!visual) {
        visual = createBodyVisual(body, activeMapBodiesById.get(body.id));
        bodyVisuals.set(body.id, visual);
        options.bodyLayer.addChild(visual.sprite);
      }
      visual.sprite.position.set(body.renderX, body.renderY);
    }
  };

  const renderPlayers = (
    players: readonly ResolvedSimPlayerState[],
    rosterNamesByPlayerId: ReadonlyMap<string, string>,
    selfPlayerId: string | null,
    tickerDeltaTime: number,
  ): void => {
    const activeIds = new Set(players.map((player) => player.playerId));
    for (const [playerId, visual] of playerVisuals) {
      if (activeIds.has(playerId)) {
        continue;
      }
      visual.explosion.destroy();
      visual.sprite.destroy();
      visual.label.destroy();
      playerVisuals.delete(playerId);
    }

    for (const player of players) {
      let visual = playerVisuals.get(player.playerId);
      if (!visual) {
        const isSelf = player.playerId === selfPlayerId;
        visual = createPlayerVisual(isSelf);
        playerVisuals.set(player.playerId, visual);
        options.playerLayer.addChild(visual.explosion);
        options.playerLayer.addChild(visual.sprite);
        options.playerLayer.addChild(visual.label);
      }

      const isSelf = player.playerId === selfPlayerId;
      const targetX = player.renderX;
      const targetY = player.renderY;
      const targetRotation = player.heading + Math.PI / 2;
      const positionBlend = Math.min(
        1,
        DEFAULT_PLAYER_RENDER_SMOOTHING * tickerDeltaTime,
      );
      if (!visual.initialized) {
        visual.sprite.position.set(targetX, targetY);
        visual.sprite.rotation = targetRotation;
        visual.initialized = true;
      } else {
        const positionDeltaX = targetX - visual.sprite.position.x;
        const positionDeltaY = targetY - visual.sprite.position.y;
        const shouldSnap =
          positionDeltaX * positionDeltaX + positionDeltaY * positionDeltaY >=
          PLAYER_RENDER_TELEPORT_SNAP_DISTANCE * PLAYER_RENDER_TELEPORT_SNAP_DISTANCE;
        if (shouldSnap) {
          visual.sprite.position.set(targetX, targetY);
          visual.sprite.rotation = targetRotation;
        } else {
          visual.sprite.position.set(
            lerp(visual.sprite.position.x, targetX, positionBlend),
            lerp(visual.sprite.position.y, targetY, positionBlend),
          );
          visual.sprite.rotation = lerpAngle(
            visual.sprite.rotation,
            targetRotation,
            positionBlend,
          );
        }
      }
      recolorPlayerVisual(visual.sprite, isSelf);
      visual.label.position.set(visual.sprite.position.x, visual.sprite.position.y - 26);
      const displayName = rosterNamesByPlayerId.get(player.playerId) ?? player.playerId;
      const alive = player.life?.alive !== false;
      const respawnTimer = player.life?.respawnTimerSeconds ?? 0;
      const respawnGrace = player.life?.respawnGraceSeconds ?? 0;
      const deltaSeconds = tickerDeltaTime / 60;
      const justDied = visual.wasAlive && !alive;
      if (justDied) {
        visual.explosionElapsedSeconds = 0.001;
        visual.explosionX = visual.sprite.position.x;
        visual.explosionY = visual.sprite.position.y;
      }
      if (visual.explosionElapsedSeconds > 0) {
        visual.explosionElapsedSeconds += deltaSeconds;
        if (visual.explosionElapsedSeconds >= EXPLOSION_DURATION_SECONDS) {
          visual.explosionElapsedSeconds = 0;
          visual.explosion.clear();
        } else {
          drawPlayerExplosion(
            visual.explosion,
            visual.explosionX,
            visual.explosionY,
            visual.explosionElapsedSeconds,
          );
        }
      }
      visual.wasAlive = alive;

      visual.sprite.alpha = alive ? (respawnGrace > 0 ? 0.72 : 1) : 0;
      visual.label.alpha = alive ? 1 : 0.72;
      visual.label.text = alive
        ? (isSelf ? `${displayName} (you)` : displayName)
        : `${displayName} [respawn ${respawnTimer.toFixed(1)}s]`;
    }
  };

  const updateCamera = (
    renderOptions: MultiplayerWorldPresenterRenderOptions,
  ): void => {
    const alivePlayers = renderOptions.frame.players.filter(
      (player) => player.life?.alive !== false,
    );
    const playersForCamera = alivePlayers.length > 0
      ? alivePlayers
      : renderOptions.frame.players;
    const focusPoints = [
      ...renderOptions.frame.celestialBodies.map((body) => ({
        x: body.renderX,
        y: body.renderY,
      })),
      ...playersForCamera.map((player) => ({
        x: player.renderX,
        y: player.renderY,
      })),
    ];
    const cameraFrame = computeCameraFrame({
      screenWidth: renderOptions.viewportWidth,
      screenHeight: renderOptions.viewportHeight,
      focusPoints,
      padding: cameraPadding,
      minZoom: cameraMinScale,
      maxZoom: cameraMaxScale,
    });
    const targetScale = clamp(cameraFrame.zoom, cameraMinScale, cameraMaxScale);
    const targetX = cameraFrame.center.x;
    const targetY = cameraFrame.center.y;

    if (!camera.initialized) {
      camera.x = targetX;
      camera.y = targetY;
      camera.scale = targetScale;
      camera.initialized = true;
    } else {
      const blend = Math.min(1, cameraSmoothing * renderOptions.tickerDeltaTime);
      camera.x = lerp(camera.x, targetX, blend);
      camera.y = lerp(camera.y, targetY, blend);
      camera.scale = lerp(camera.scale, targetScale, blend);
    }

    options.world.scale.set(camera.scale);
    options.world.position.set(
      renderOptions.viewportWidth * 0.5 - camera.x * camera.scale,
      renderOptions.viewportHeight * 0.5 - camera.y * camera.scale,
    );
  };

  const dispose = (): void => {
    for (const visual of bodyVisuals.values()) {
      visual.sprite.destroy();
    }
    for (const visual of playerVisuals.values()) {
      visual.explosion.destroy();
      visual.sprite.destroy();
      visual.label.destroy();
    }
    bodyVisuals.clear();
    playerVisuals.clear();
    options.orbitLayer.clear();
  };

  const getPlayerSpriteInfo = (playerId: string): PlayerSpriteInfo | null => {
    const visual = playerVisuals.get(playerId);
    if (!visual || !visual.initialized) {
      return null;
    }
    return {
      worldX: visual.sprite.position.x,
      worldY: visual.sprite.position.y,
      rotation: visual.sprite.rotation,
    };
  };

  return {
    setMapDefinition,
    render,
    dispose,
    getPlayerSpriteInfo,
  };
}

function createBodyVisual(
  body: ResolvedSimCelestialBodyState,
  mapBodyConfig: MultiplayerMapBodyConfig | undefined,
): BodyVisual {
  const sprite = createCelestialSprite(
    buildMultiplayerCelestialConfig(body, mapBodyConfig),
  );
  return { sprite };
}

function createPlayerVisual(isSelf: boolean): PlayerVisual {
  const sprite = createInterceptorSprite();
  recolorPlayerVisual(sprite, isSelf);
  const explosion = new Graphics();
  const label = new Text({
    text: "",
    style: {
      fill: isSelf ? "#9ee9ff" : "#ffd5bd",
      fontFamily: "Menlo, Monaco, monospace",
      fontSize: 12,
      align: "center",
    },
  });
  label.anchor.set(0.5, 1);
  return {
    sprite,
    explosion,
    label,
    initialized: false,
    wasAlive: true,
    explosionElapsedSeconds: 0,
    explosionX: 0,
    explosionY: 0,
  };
}

function recolorPlayerVisual(sprite: Graphics, isSelf: boolean): void {
  const fill = isSelf ? 0xffc857 : 0xff8f63;
  const stroke = isSelf ? 0xfff2cb : 0xffd9cb;
  paintInterceptorSprite(sprite, {
    fillColor: fill,
    strokeColor: stroke,
    strokeWidth: 2,
    strokeAlpha: 0.95,
  });
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function lerpAngle(start: number, end: number, alpha: number): number {
  const delta = normalizeAngle(end - start);
  return start + delta * alpha;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }
  while (normalized < -Math.PI) {
    normalized += Math.PI * 2;
  }
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawPlayerExplosion(
  graphics: Graphics,
  cx: number,
  cy: number,
  elapsedSeconds: number,
): void {
  graphics.clear();

  const t = Math.min(1, elapsedSeconds / EXPLOSION_DURATION_SECONDS);
  const easeOut = 1 - (1 - t) * (1 - t);
  const alpha = 1 - t;

  // Shockwave ring — fast-expanding thin circle
  const shockRadius = 12 + easeOut * 120;
  const shockAlpha = Math.max(0, 0.6 - t * 2.2);
  if (shockAlpha > 0) {
    graphics.circle(cx, cy, shockRadius);
    graphics.stroke({ color: 0xfff2bf, width: 2, alpha: shockAlpha });
  }

  // Outer bloom
  const outerRadius = 16 + easeOut * 80;
  graphics.circle(cx, cy, outerRadius);
  graphics.fill({
    color: WORLD_ENTITY_STYLES.explosions.ship.outerColor,
    alpha: alpha * WORLD_ENTITY_STYLES.explosions.ship.outerAlpha * 1.4,
  });

  // Inner core — fades quickly
  const innerAlpha = Math.max(0, 1 - t * 2.5);
  if (innerAlpha > 0) {
    const innerRadius = 6 + easeOut * 22;
    graphics.circle(cx, cy, innerRadius);
    graphics.fill({
      color: WORLD_ENTITY_STYLES.explosions.ship.innerColor,
      alpha: innerAlpha * WORLD_ENTITY_STYLES.explosions.ship.innerAlpha,
    });
  }

  // Debris shards — 12 pieces in two rings
  const shardCount = 12;
  const shardBaseAngle = easeOut * 4;
  for (let i = 0; i < shardCount; i += 1) {
    const angle = shardBaseAngle + (i / shardCount) * Math.PI * 2;
    // Alternate inner/outer ring
    const ring = i % 2 === 0 ? 1 : 0.55;
    const dist = (14 + easeOut * 58) * ring;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const shardRadius = Math.max(1, (4.5 - t * 3.5) * (ring > 0.8 ? 1 : 0.7));
    graphics.circle(sx, sy, shardRadius);
    graphics.fill({
      color: WORLD_ENTITY_STYLES.explosions.ship.shardColor,
      alpha: alpha * WORLD_ENTITY_STYLES.explosions.ship.shardAlpha,
    });
  }
}
