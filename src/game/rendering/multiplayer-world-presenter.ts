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

  const t = clamp(elapsedSeconds / EXPLOSION_DURATION_SECONDS, 0, 1);
  const blast = 1 - (1 - t) * (1 - t) * (1 - t);
  const alpha = 1 - t;
  const flicker = 0.88 + 0.12 * Math.sin(elapsedSeconds * 28);

  const shockRadius = 10 + blast * 132;
  const shockAlpha = Math.max(0, 0.78 * alpha * alpha);
  if (shockAlpha > 0.01) {
    graphics.circle(cx, cy, shockRadius);
    graphics.stroke({
      color: 0xffe8c4,
      width: 2.4 - t * 1.2,
      alpha: shockAlpha * flicker,
    });
  }

  if (t > 0.16) {
    const t2 = (t - 0.16) / 0.84;
    const secondaryRadius = 18 + clamp(t2, 0, 1) * 104;
    const secondaryAlpha = Math.max(0, 0.34 * (1 - t2) * alpha);
    if (secondaryAlpha > 0.01) {
      graphics.circle(cx, cy, secondaryRadius);
      graphics.stroke({
        color: 0xffb86f,
        width: 1.8 - clamp(t2, 0, 1) * 0.9,
        alpha: secondaryAlpha,
      });
    }
  }

  const lobeCount = 4;
  for (let lobe = 0; lobe < lobeCount; lobe += 1) {
    const angle = t * 2.7 + (lobe / lobeCount) * Math.PI * 2;
    const drift = 4 + lobe * 2.4;
    const offset = 2 + blast * drift;
    const lobeX = cx + Math.cos(angle) * offset;
    const lobeY = cy + Math.sin(angle) * offset;
    const lobeRadius = 14 + blast * (62 + lobe * 7);
    graphics.circle(lobeX, lobeY, lobeRadius);
    graphics.fill({
      color: WORLD_ENTITY_STYLES.explosions.ship.outerColor,
      alpha: alpha * (0.2 + lobe * 0.03),
    });
  }

  const innerAlpha = Math.max(0, 1 - t * 2.7);
  if (innerAlpha > 0.01) {
    const innerRadius = 6 + blast * 28;
    graphics.circle(cx, cy, innerRadius);
    graphics.fill({
      color: WORLD_ENTITY_STYLES.explosions.ship.innerColor,
      alpha: innerAlpha * WORLD_ENTITY_STYLES.explosions.ship.innerAlpha * flicker,
    });
  }

  const streakCount = 14;
  for (let index = 0; index < streakCount; index += 1) {
    const baseAngle = (index / streakCount) * Math.PI * 2;
    const wobble = Math.sin(elapsedSeconds * (5.6 + index * 0.21) + index * 0.6) * 0.16;
    const angle = baseAngle + blast * 2.8 + wobble;
    const ringWeight = index % 3 === 0 ? 1 : index % 3 === 1 ? 0.72 : 0.54;
    const travel = (20 + blast * 84) * ringWeight;
    const tipX = cx + Math.cos(angle) * travel;
    const tipY = cy + Math.sin(angle) * travel;
    const tailLength = (10 + (1 - t) * 10) * ringWeight;
    const tailX = tipX - Math.cos(angle) * tailLength;
    const tailY = tipY - Math.sin(angle) * tailLength;
    const streakAlpha = alpha * (0.28 + 0.22 * ringWeight);
    graphics.moveTo(tailX, tailY);
    graphics.lineTo(tipX, tipY);
    graphics.stroke({
      color: 0xffa25f,
      width: 1.7 * ringWeight,
      alpha: streakAlpha,
      cap: "round",
    });
    const emberRadius = Math.max(0.8, (3.2 - t * 2.5) * ringWeight);
    graphics.circle(tipX, tipY, emberRadius);
    graphics.fill({
      color: WORLD_ENTITY_STYLES.explosions.ship.shardColor,
      alpha: alpha * WORLD_ENTITY_STYLES.explosions.ship.shardAlpha * (0.62 + 0.38 * ringWeight),
    });
  }

  const sparkCount = 8;
  for (let spark = 0; spark < sparkCount; spark += 1) {
    const angle = (spark / sparkCount) * Math.PI * 2 + t * 5.4;
    const dist = 8 + blast * (26 + spark * 4);
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    graphics.circle(sx, sy, Math.max(0.7, 2.2 - t * 1.7));
    graphics.fill({
      color: 0xfff2cd,
      alpha: Math.max(0, 0.65 - t * 0.78),
    });
  }
}
