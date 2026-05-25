import { Container, Graphics, type Ticker } from "pixi.js";
import { resetGameOverlayState, setGameOverlayState } from "../../ui/game-overlay-store";
import { resetGameMenuState } from "../../ui/game-menu-store";
import { getDevToolsState } from "../../ui/dev-tools-store";
import { buildPrototypeHudState } from "../../ui/prototype-hud";
import type { MissionRuntimeSnapshot } from "../missions/mission-runtime";
import { DEFAULT_MISSION_CONTROL_STATE } from "../missions/mission-control";
import { createDefaultMultiplayerServerUrl } from "../network/browser-multiplayer-client";
import {
  suppressNextMultiplayerMenuAutoJoin,
  getOrCreateMultiplayerClient,
} from "../network/multiplayer-session";
import type {
  RoomSnapshot,
  SimulationSnapshot,
  ShipSubsystemKey,
  PlayerInputCommand,
  SimCelestialBodySnapshot,
  SimPlayerSystemsSnapshot,
} from "../network/multiplayer-protocol";
import {
  resolveSimulationFrame,
  type ResolvedSimCelestialBodyState,
  type ResolvedSimPlayerState,
  type ResolvedSimulationFrame,
} from "../../../shared/multiplayer-snapshot-view.js";
import {
  getDefaultMultiplayerMapDefinition,
  getMultiplayerMapDefinitionById,
} from "../../../shared/multiplayer-map.js";
import { createMultiplayerWorldPresenter } from "../rendering/multiplayer-world-presenter";
import { KeyTracker } from "../input/key-tracker";
import { createSceneInputState, readSceneInputActions } from "../input/scene-input";
import {
  readFlightInput,
  type FlightInputState,
} from "../flight/controls";
import { FORECAST_TUNING } from "../forecasting/forecast-tuning";
import type { Vector2Like } from "../physics/vector2";
import {
  createShipSystemsState,
  focusSubsystem,
  getWeaponRangeMultiplier,
  type ShipSystemsState,
} from "../ships/systems";
import {
  drawEngineCompass,
  drawLikelyEnemyMarkers,
  drawScannerRadius,
} from "../rendering/prototype-overlays";
import {
  WORLD_OVERLAY_STYLES,
  getBurnForecastColor,
} from "../rendering/world-overlay-styles";
import {
  createGameWarningManagerState,
  updateGameWarningManager,
  type GameWarningCandidate,
  type GameWarningState,
} from "../warnings/game-warning-manager";
import {
  resolveCollisionWarning,
  COLLISION_WARNING_DANGER_CLEARANCE,
  COLLISION_WARNING_CAUTION_CLEARANCE,
  COLLISION_WARNING_MIN_CLOSING_SPEED,
} from "../warnings/resolve-collision-warning";
import type { SceneContext, SceneHandle } from "./scene-manager";
import {
  DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
  stepMultiplayerPlayers,
  type MultiplayerSimPlayerState,
} from "../../../shared/multiplayer-simulation-core.js";

const INPUT_SEND_INTERVAL_MS = 50;
const SNAPSHOT_INTERPOLATION_DELAY_MS = 110;
const SNAPSHOT_EXTRAPOLATION_LIMIT_MS = 220;
const CAMERA_SMOOTHING = 0.12;
const CAMERA_MIN_SCALE = 0.22;
const CAMERA_MAX_SCALE = 1.1;
const CAMERA_WORLD_PADDING = 124;
const HEADING_DISPLAY_SMOOTHING = 0.45;
const FORECAST_STEPS = 84;
const FORECAST_STEP_SECONDS = 1 / 20;
const FORECAST_GRAVITY_EPSILON = 0.000001;
const FORECAST_COLLISION_STOP_SPEED = 0.01;
const BASE_DISINTEGRATOR_RANGE = 280;

const EMPTY_MULTIPLAYER_MISSION_SNAPSHOT: MissionRuntimeSnapshot = {
  title: "",
  subtitle: "",
  currentInstruction: "",
  steps: [],
  currentProgress: 0,
  completedSteps: 0,
  totalSteps: 0,
  completed: false,
  activeTarget: null,
  targetEvents: [],
  control: DEFAULT_MISSION_CONTROL_STATE,
};

export function mountMultiplayerMatchScene(context: SceneContext): SceneHandle {
  resetGameMenuState();

  const client = getOrCreateMultiplayerClient({
    serverUrl: createDefaultMultiplayerServerUrl(),
  });

  if (client.getState().connectionStatus === "disconnected") {
    client.connect();
  }

  const root = new Container();
  const starfield = new Graphics();
  const world = new Container();
  const orbitLayer = new Graphics();
  const bodyLayer = new Container();
  const playerLayer = new Container();
  const scannerRadiusOverlay = new Graphics();
  const likelyEnemyOverlay = new Graphics();
  const scannerContactsOverlay = new Graphics();
  const forecastOverlay = new Graphics();
  const engineCompassOverlay = new Graphics();

  root.addChild(starfield);
  root.addChild(world);
  root.addChild(engineCompassOverlay);
  world.addChild(orbitLayer);
  world.addChild(bodyLayer);
  world.addChild(scannerRadiusOverlay);
  world.addChild(playerLayer);
  world.addChild(likelyEnemyOverlay);
  world.addChild(scannerContactsOverlay);
  world.addChild(forecastOverlay);
  context.app.stage.addChild(root);
  const worldPresenter = createMultiplayerWorldPresenter({
    world,
    orbitLayer,
    bodyLayer,
    playerLayer,
    initialMapDefinition: getDefaultMultiplayerMapDefinition(),
    cameraSmoothing: CAMERA_SMOOTHING,
    cameraMinScale: CAMERA_MIN_SCALE,
    cameraMaxScale: CAMERA_MAX_SCALE,
    cameraPadding: CAMERA_WORLD_PADDING,
  });

  const keyTracker = new KeyTracker();
  const sceneInputState = createSceneInputState();
  keyTracker.attach(window);

  let previousSnapshot: SimulationSnapshot | null = null;
  let latestSnapshot: SimulationSnapshot | null = null;
  let latestRoom: RoomSnapshot | null = null;
  let latestError = "";
  let selfPlayerId: string | null = null;
  let inputSequence = 0;
  let lastInputSentAtMs = 0;
  let navigatingAway = false;
  let consumedPauseMenuToggleRequestId = getDevToolsState().pauseMenuToggleRequestId;
  let activeMapDefinition = getDefaultMultiplayerMapDefinition();
  let hudVisible = true;
  let fpsSmoothed = 60;
  let pendingFocusSubsystem: ShipSubsystemKey | null = null;
  let localEngineThrottle = 0;
  let localThrustHeadingRadians: number | null = null;
  let localPlayerAlive = true;
  let localRespawnTimerSeconds = 0;
  let localHealth = 100;
  let localMaxHealth = 100;
  let smoothedThrustHeading: number | null = null;
  let smoothedThrottle = 0;
  let overlayElapsedSeconds = 0;

  const localShipSystems: ShipSystemsState = createShipSystemsState();
  const warningManager = createGameWarningManagerState();

  const drawStarfield = (): void => {
    const width = context.app.renderer.width;
    const height = context.app.renderer.height;
    starfield.clear();
    starfield.rect(0, 0, width, height).fill("#060a13");
    const starCount = Math.floor((width * height) / 5400);
    for (let index = 0; index < starCount; index += 1) {
      const x = pseudoRandom(index * 13.37 + width) * width;
      const y = pseudoRandom(index * 8.21 + height) * height;
      const alpha = 0.2 + pseudoRandom(index * 2.17) * 0.6;
      const radius = 0.6 + pseudoRandom(index * 3.91) * 1.5;
      starfield.circle(x, y, radius).fill({
        color: "#a4bfd3",
        alpha,
      });
    }
  };

  const leaveToLobby = (options?: {
    suppressAutoJoin?: boolean;
  }): void => {
    if (navigatingAway) {
      return;
    }
    if (options?.suppressAutoJoin) {
      suppressNextMultiplayerMenuAutoJoin();
    }
    navigatingAway = true;
    context.load("multiplayer-menu");
  };

  const handleClientUpdate = (): void => {
    const state = client.getState();
    latestRoom = state.room;
    latestError = state.latestErrorMessage ?? "";
    selfPlayerId = state.playerId;

    if (
      state.connectionStatus === "disconnected"
      || !state.room
      || state.room.status !== "running"
    ) {
      leaveToLobby();
      return;
    }

    const snapshot = state.latestSnapshot;
    if (!snapshot) {
      return;
    }

    const nextMapDefinition =
      getMultiplayerMapDefinitionById(snapshot.mapId)
      ?? getDefaultMultiplayerMapDefinition();
    if (nextMapDefinition.id !== activeMapDefinition.id) {
      activeMapDefinition = nextMapDefinition;
      worldPresenter.setMapDefinition(nextMapDefinition);
    }

    if (!latestSnapshot || latestSnapshot.tick !== snapshot.tick) {
      previousSnapshot = latestSnapshot;
      latestSnapshot = snapshot;
    }
  };

  const unsubscribe = client.subscribe(handleClientUpdate);
  handleClientUpdate();
  window.addEventListener("resize", drawStarfield);
  drawStarfield();

  const tickerCallback = (ticker: Ticker): void => {
    const nowMs = Date.now();
    const sceneActions = readSceneInputActions(keyTracker, sceneInputState);
    const flightInput = readFlightInput((code) => keyTracker.isPressed(code));
    const pauseMenuToggleRequestId = getDevToolsState().pauseMenuToggleRequestId;
    const pauseMenuToggleRequested =
      pauseMenuToggleRequestId !== consumedPauseMenuToggleRequestId;
    if (pauseMenuToggleRequested) {
      consumedPauseMenuToggleRequestId = pauseMenuToggleRequestId;
    }
    if (sceneActions.togglePauseMenu || pauseMenuToggleRequested) {
      leaveToLobby({
        suppressAutoJoin: true,
      });
      return;
    }
    if (sceneActions.toggleHud) {
      hudVisible = !hudVisible;
    }
    if (sceneActions.focusSubsystem) {
      focusSubsystem(localShipSystems, sceneActions.focusSubsystem);
      pendingFocusSubsystem = sceneActions.focusSubsystem;
    }

    maybeSendInput(nowMs, flightInput);

    const frame = resolveSimulationFrame({
      previousSnapshot,
      latestSnapshot,
      nowMs,
      interpolationDelayMs: SNAPSHOT_INTERPOLATION_DELAY_MS,
      extrapolationLimitMs: SNAPSHOT_EXTRAPOLATION_LIMIT_MS,
    });
    fpsSmoothed = fpsSmoothed * 0.9 + (1000 / Math.max(1, ticker.deltaMS)) * 0.1;
    overlayElapsedSeconds += ticker.deltaMS / 1000;
    if (frame) {
      applyAuthoritativeHudTelemetry(frame);
    }
    updateOverlay(frame, nowMs, overlayElapsedSeconds);

    if (!frame) {
      clearNavigationHud();
      clearScannerHud();
      return;
    }

    const rosterNamesByPlayerId = new Map(
      latestRoom?.players.map((player) => [player.id, player.displayName]) ?? [],
    );
    const renderFrame = filterFrameByScannerRegistration(frame, selfPlayerId);
    worldPresenter.render({
      frame: renderFrame,
      rosterNamesByPlayerId,
      selfPlayerId,
      tickerDeltaTime: ticker.deltaTime,
      viewportWidth: context.app.renderer.width,
      viewportHeight: context.app.renderer.height,
    });
    drawScannerHud(frame);
    drawNavigationHud(frame, flightInput, ticker.deltaTime);
  };

  const maybeSendInput = (
    nowMs: number,
    flightInput: FlightInputState,
  ): void => {
    if (nowMs - lastInputSentAtMs < INPUT_SEND_INTERVAL_MS) {
      return;
    }
    const state = client.getState();
    if (
      state.connectionStatus !== "connected"
      || !state.room
      || state.room.status !== "running"
      || !localPlayerAlive
    ) {
      return;
    }
    lastInputSentAtMs = nowMs;

    inputSequence += 1;
    client.sendInput({
      sequence: inputSequence,
      progradeInput: flightInput.progradeInput,
      retrogradeInput: flightInput.retrogradeInput,
      leftInput: flightInput.leftInput,
      rightInput: flightInput.rightInput,
      eBrakeInput: flightInput.eBrakeInput,
      gravityDiveInput: flightInput.gravityDiveInput,
      boostInput: flightInput.boostInput,
      firePrimary: keyTracker.isPressed("KeyX"),
      fireSecondary: false,
      focusSubsystem: pendingFocusSubsystem ?? undefined,
    });
    pendingFocusSubsystem = null;
  };

  const applyAuthoritativeHudTelemetry = (
    frame: ResolvedSimulationFrame,
  ): void => {
    const selfPlayer =
      selfPlayerId
        ? frame.players.find((player) => player.playerId === selfPlayerId) ?? null
        : null;
    if (!selfPlayer) {
      localEngineThrottle = 0;
      localThrustHeadingRadians = null;
      localPlayerAlive = true;
      localRespawnTimerSeconds = 0;
      return;
    }

    localPlayerAlive = selfPlayer.life?.alive ?? true;
    localRespawnTimerSeconds = selfPlayer.life?.respawnTimerSeconds ?? 0;
    localHealth = selfPlayer.life?.health ?? localMaxHealth;
    localMaxHealth = selfPlayer.life?.maxHealth ?? 100;
    localEngineThrottle = localPlayerAlive ? (selfPlayer.throttle ?? 0) : 0;
    localThrustHeadingRadians = localPlayerAlive
      ? (selfPlayer.thrustHeading ?? null)
      : null;

    if (selfPlayer.systems) {
      syncHudShipSystems(localShipSystems, selfPlayer.systems);
    }
  };

  const clearNavigationHud = (): void => {
    forecastOverlay.clear();
    engineCompassOverlay.clear();
  };

  const clearScannerHud = (): void => {
    scannerRadiusOverlay.clear();
    likelyEnemyOverlay.clear();
    scannerContactsOverlay.clear();
  };

  const drawScannerHud = (frame: ResolvedSimulationFrame): void => {
    if (!hudVisible || !selfPlayerId) {
      clearScannerHud();
      return;
    }

    const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
    if (
      !selfPlayer ||
      selfPlayer.life?.alive === false ||
      !selfPlayer.scanner ||
      selfPlayer.scanner.range <= 0
    ) {
      clearScannerHud();
      return;
    }

    const scannerStyle = WORLD_OVERLAY_STYLES.scannerRadius;
    const scannerContactsStyle = WORLD_OVERLAY_STYLES.enemyClassStyles.raider;
    const contactByPlayerId = new Map(
      selfPlayer.scanner.contacts.map((contact) => [contact.targetPlayerId, contact] as const),
    );
    const candidateContacts = frame.players.filter((player) => {
      if (player.playerId === selfPlayer.playerId || player.life?.alive === false) {
        return false;
      }
      return contactByPlayerId.has(player.playerId);
    });
    const visibleContacts = candidateContacts.filter((player) => {
      const contact = contactByPlayerId.get(player.playerId);
      return contact?.visible === true;
    });
    const occludedContacts = candidateContacts.filter((player) => {
      const contact = contactByPlayerId.get(player.playerId);
      return contact?.inRange === true && contact.visible === false && contact.registered === false;
    });

    const disintegratorRange =
      BASE_DISINTEGRATOR_RANGE * getWeaponRangeMultiplier(localShipSystems);
    const scannerOccluders = frame.celestialBodies.map((body) => ({
      config: { id: body.id },
      body: {
        id: body.id,
        position: { x: body.renderX, y: body.renderY },
        radius: body.radius,
      },
    }));
    drawScannerRadius(
      scannerRadiusOverlay,
      { x: selfPlayer.renderX, y: selfPlayer.renderY },
      selfPlayer.scanner.range,
      disintegratorRange,
      scannerOccluders as unknown as Parameters<typeof drawScannerRadius>[4],
    );

    drawLikelyEnemyMarkers(
      likelyEnemyOverlay,
      occludedContacts.map((player) => ({
        position: { x: player.renderX, y: player.renderY },
        radius: 8,
        enemyClass: "raider" as const,
      })),
    );

    scannerContactsOverlay.clear();
    for (const player of visibleContacts) {
      scannerContactsOverlay.circle(player.renderX, player.renderY, 8);
      scannerContactsOverlay.stroke({
        color: scannerContactsStyle.contactColor,
        width: WORLD_OVERLAY_STYLES.scannerContacts.strokeWidth,
        alpha: WORLD_OVERLAY_STYLES.scannerContacts.strokeAlpha,
      });
      scannerContactsOverlay.circle(player.renderX, player.renderY, 2.5);
      scannerContactsOverlay.fill({
        color: scannerContactsStyle.contactColor,
        alpha: scannerContactsStyle.contactFillAlpha,
      });
    }
  };

  const drawNavigationHud = (
    frame: ResolvedSimulationFrame,
    input: FlightInputState,
    tickerDeltaTime: number,
  ): void => {
    if (!hudVisible || !selfPlayerId) {
      clearNavigationHud();
      return;
    }

    const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
    if (!selfPlayer || selfPlayer.life?.alive === false) {
      clearNavigationHud();
      return;
    }

    const spriteInfo = worldPresenter.getPlayerSpriteInfo(selfPlayerId);
    if (!spriteInfo) {
      clearNavigationHud();
      return;
    }

    // Derive velocity heading from the sprite's already-smoothed rotation.
    // Sprite rotation = heading + π/2, so we reverse that offset.
    const velocityHeading = spriteInfo.rotation - Math.PI / 2;

    const blend = Math.min(1, HEADING_DISPLAY_SMOOTHING * tickerDeltaTime);
    smoothedThrottle = lerp(smoothedThrottle, selfPlayer.throttle ?? 0, blend);
    const rawThrustHeading = selfPlayer.thrustHeading ?? null;
    if (rawThrustHeading !== null) {
      smoothedThrustHeading = smoothedThrustHeading === null
        ? rawThrustHeading
        : lerpAngle(smoothedThrustHeading, rawThrustHeading, blend);
    }
    // When rawThrustHeading is null, keep last known heading and let
    // smoothedThrottle fade toward 0, so the arrow fades out rather than snapping off.

    const gravityAcceleration = computeNetGravityAcceleration(
      {
        x: spriteInfo.worldX,
        y: spriteInfo.worldY,
      },
      frame.celestialBodies,
    );
    const forecastOrigin = {
      x: spriteInfo.worldX + Math.cos(velocityHeading) * FORECAST_TUNING.rendering.originNoseOffset,
      y: spriteInfo.worldY + Math.sin(velocityHeading) * FORECAST_TUNING.rendering.originNoseOffset,
    };
    const previewMode = resolveBurnPreviewMode(input, gravityAcceleration);
    const coastPath = buildPredictedPath({
      player: selfPlayer,
      celestialBodies: frame.celestialBodies,
      input: null,
      steps: FORECAST_STEPS,
      stepSeconds: FORECAST_STEP_SECONDS,
    });
    const burnPath = previewMode.active
      ? buildPredictedPath({
          player: selfPlayer,
          celestialBodies: frame.celestialBodies,
          input: createPredictedInput(input, false),
          steps: FORECAST_STEPS,
          stepSeconds: FORECAST_STEP_SECONDS,
        })
      : [];
    const boostPath =
      previewMode.active && !previewMode.useFullBoostOutput
        ? buildPredictedPath({
            player: selfPlayer,
            celestialBodies: frame.celestialBodies,
            input: createPredictedInput(input, true),
            steps: FORECAST_STEPS,
            stepSeconds: FORECAST_STEP_SECONDS,
          })
        : [];

    forecastOverlay.clear();
    drawStyledPath(forecastOverlay, coastPath, {
      color: WORLD_OVERLAY_STYLES.forecast.coast.color,
      width: WORLD_OVERLAY_STYLES.forecast.coast.width,
      alpha: WORLD_OVERLAY_STYLES.forecast.coast.alpha,
      markerRadius: WORLD_OVERLAY_STYLES.forecast.coast.markerRadius,
    }, forecastOrigin, FORECAST_TUNING.rendering.minimumNavigationLength);
    if (previewMode.active) {
      drawStyledPath(forecastOverlay, burnPath, {
        color: getBurnForecastColor(previewMode.label, false),
        width: WORLD_OVERLAY_STYLES.forecast.burn.width,
        alpha: WORLD_OVERLAY_STYLES.forecast.burn.alpha,
        markerRadius: WORLD_OVERLAY_STYLES.forecast.burn.markerRadius,
      }, forecastOrigin, FORECAST_TUNING.rendering.minimumNavigationLength);
      if (!previewMode.useFullBoostOutput) {
        drawStyledPath(forecastOverlay, boostPath, {
          color: WORLD_OVERLAY_STYLES.forecast.boost.color,
          width: WORLD_OVERLAY_STYLES.forecast.boost.width,
          alpha: WORLD_OVERLAY_STYLES.forecast.boost.alpha,
          markerRadius: WORLD_OVERLAY_STYLES.forecast.boost.markerRadius,
          dashLength: WORLD_OVERLAY_STYLES.forecast.boost.dashLength,
          gapLength: WORLD_OVERLAY_STYLES.forecast.boost.gapLength,
        }, forecastOrigin, FORECAST_TUNING.rendering.minimumNavigationLength);
      }
    }

    const gravityMagnitude = Math.hypot(
      gravityAcceleration.x,
      gravityAcceleration.y,
    );
    const worldScale = world.scale.x;
    const screenPosition = {
      x: world.position.x + spriteInfo.worldX * worldScale,
      y: world.position.y + spriteInfo.worldY * worldScale,
    };
    drawEngineCompass(engineCompassOverlay, {
      origin: screenPosition,
      referenceHeading: velocityHeading,
      thrustHeading: smoothedThrustHeading,
      throttleFraction: clamp(smoothedThrottle, 0, 1),
      gravityHeading:
        gravityMagnitude > FORECAST_GRAVITY_EPSILON
          ? Math.atan2(gravityAcceleration.y, gravityAcceleration.x)
          : null,
      scale: clamp(
        Math.min(context.app.screen.width, context.app.screen.height) / 900,
        WORLD_OVERLAY_STYLES.engineCompass.scaleMin,
        WORLD_OVERLAY_STYLES.engineCompass.scaleMax,
      ),
      boosted: selfPlayer.superBurnActive ?? false,
    });
  };

  const updateOverlay = (
    frame: ResolvedSimulationFrame | null,
    nowMs: number,
    elapsedSeconds: number,
  ): void => {
    const roomCode = latestRoom?.code ?? "----";
    const mapName =
      latestRoom?.map?.name
      ?? (frame?.celestialBodies.length ? "Map Loaded" : "Map Pending");
    const snapshotAgeMs = latestSnapshot
      ? Math.max(0, nowMs - latestSnapshot.sentAtMs)
      : Number.POSITIVE_INFINITY;

    const selfPlayer = frame && selfPlayerId
      ? frame.players.find((p) => p.playerId === selfPlayerId) ?? null
      : null;

    // Nav warning: coast path is too short to navigate reliably
    const navWarningActive = selfPlayer && selfPlayer.life?.alive !== false
      ? buildPredictedPath({
          player: selfPlayer,
          celestialBodies: frame!.celestialBodies,
          input: null,
          steps: FORECAST_STEPS,
          stepSeconds: FORECAST_STEP_SECONDS,
        }).length === 0
      : false;

    const collisionWarning = resolveCollisionWarningForFrame(frame, selfPlayerId);

    // Server-sent per-player warning candidates
    const serverSnapshot = latestSnapshot?.players.find(
      (p) => p.playerId === selfPlayerId,
    );
    const serverWarnings = serverSnapshot?.warnings ?? [];

    const candidates: GameWarningCandidate[] = [
      // Server-authoritative warnings (enemy targeting, nav-solution-unstable from server)
      ...serverWarnings.map((w) => ({
        ...w,
        active: true,
      })),
      // Client-computed nav warning (uses rendered/interpolated position)
      {
        id: "nav-solution-unstable",
        title: "NAV SOLUTION UNSTABLE",
        message: "Guidance horizon is too short for reliable navigation.",
        accentColor: "#ff8a6a",
        priority: 100,
        active: navWarningActive,
      },
      // Client-only: player death / respawn
      {
        id: "player-death",
        title: `RESPAWN IN ${Math.max(0, localRespawnTimerSeconds).toFixed(1)}s`,
        message: "Ship destroyed.",
        accentColor: "#ff7b72",
        priority: 300,
        active: !localPlayerAlive,
      },
      // Client-only: collision proximity
      {
        id: "collision-imminent",
        title: "COLLISION IMMINENT",
        message: collisionWarning?.id === "collision-imminent" ? collisionWarning.message : "",
        accentColor: "#ff7b72",
        priority: 290,
        active: collisionWarning?.id === "collision-imminent",
      },
      {
        id: "collision-warning",
        title: "IMPACT TRAJECTORY",
        message: collisionWarning?.id === "collision-warning" ? collisionWarning.message : "",
        accentColor: "#ffbd59",
        priority: 210,
        active: collisionWarning?.id === "collision-warning",
      },
      // Client-only: network health
      {
        id: "multiplayer-error",
        title: "MULTIPLAYER ERROR",
        message: latestError,
        accentColor: "#ff7b72",
        priority: 320,
        active: latestError.length > 0,
      },
      {
        id: "snapshot-lag",
        title: "NETWORK DELAY",
        message: `Snapshot age ${Math.round(snapshotAgeMs)} ms`,
        accentColor: "#ffbd59",
        priority: 180,
        active: latestError.length === 0 && snapshotAgeMs > 300 && Number.isFinite(snapshotAgeMs),
      },
    ];

    const warnings = updateGameWarningManager(warningManager, candidates, elapsedSeconds);

    setGameOverlayState(
      buildPrototypeHudState({
        hudVisible,
        showLeaveGameButton: true,
        isCrashed: false,
        title: `Room ${roomCode} | ${mapName}`,
        fpsSmoothed,
        scoreboardVisible: false,
        scoreboardTimeSeconds: 0,
        scoreboardTargetsDestroyed: 0,
        engineThrottle: localEngineThrottle,
        engineThrustHeadingRadians: localThrustHeadingRadians,
        disintegratorFiring: localPlayerAlive && keyTracker.isPressed("KeyX"),
        shipSystems: localShipSystems,
        weaponArmed: true,
        weaponMode: "disintegrator",
        trainingMissionEnabled: false,
        missionActive: false,
        mission: EMPTY_MULTIPLAYER_MISSION_SNAPSHOT,
        warnings,
        audioCueIds: [],
        playerVitals: selfPlayerId
          ? {
              health: localHealth,
              maxHealth: localMaxHealth,
              shieldCharge: localShipSystems.defenses.charge,
              shieldMaxCharge: localShipSystems.defenses.maxCharge,
            }
          : null,
      }),
    );
  };

  context.app.ticker.add(tickerCallback);

  return {
    dispose() {
      navigatingAway = true;
      unsubscribe();
      context.app.ticker.remove(tickerCallback);
      window.removeEventListener("resize", drawStarfield);
      keyTracker.detach(window);
      worldPresenter.dispose();
      root.destroy({ children: true });
      resetGameOverlayState();
      resetGameMenuState();
    },
  };
}

function syncHudShipSystems(
  target: ShipSystemsState,
  source: SimPlayerSystemsSnapshot,
): void {
  target.boosted = source.boosted;
  syncHudSubsystem(target.engines, source.engines);
  syncHudSubsystem(target.scanners, source.scanners);
  syncHudSubsystem(target.weapons, source.weapons);
  syncHudSubsystem(target.defenses, source.defenses);
}

function resolveCollisionWarningForFrame(
  frame: ResolvedSimulationFrame | null,
  selfPlayerId: string | null,
): GameWarningState | null {
  if (!frame || !selfPlayerId) {
    return null;
  }

  const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
  if (!selfPlayer || selfPlayer.life?.alive === false) {
    return null;
  }

  return resolveCollisionWarning(
    { x: selfPlayer.renderX, y: selfPlayer.renderY, vx: selfPlayer.vx, vy: selfPlayer.vy },
    frame.celestialBodies.map((body) => ({
      name: body.name,
      x: body.renderX,
      y: body.renderY,
      vx: body.vx,
      vy: body.vy,
      radius: body.radius,
    })),
  );
}

function syncHudSubsystem(
  target: ShipSystemsState["engines"],
  source: SimPlayerSystemsSnapshot["engines"],
): void {
  const maxCharge = Math.max(0, source.maxCharge);
  target.baseMaxCharge = maxCharge;
  target.maxCharge = maxCharge;
  target.charge = clamp(source.charge, 0, maxCharge);
}


function computeNetGravityAcceleration(
  position: Vector2Like,
  celestialBodies: readonly ResolvedSimCelestialBodyState[],
): Vector2Like {
  let x = 0;
  let y = 0;
  const tuning = DEFAULT_MULTIPLAYER_SIMULATION_TUNING;

  for (const body of celestialBodies) {
    const dx = body.renderX - position.x;
    const dy = body.renderY - position.y;
    const distanceSquared =
      dx * dx + dy * dy + tuning.gravitySoftening * tuning.gravitySoftening;
    const distance = Math.sqrt(distanceSquared);
    if (distance <= FORECAST_GRAVITY_EPSILON) {
      continue;
    }

    const accelerationMagnitude =
      (tuning.gravitationalConstant * body.mass) / distanceSquared;
    x += (dx / distance) * accelerationMagnitude;
    y += (dy / distance) * accelerationMagnitude;
  }

  return { x, y };
}

function resolveBurnPreviewMode(
  input: FlightInputState,
  gravityAcceleration: Vector2Like,
): {
  active: boolean;
  useFullBoostOutput: boolean;
  label: string;
} {
  const gravityMagnitude = Math.hypot(gravityAcceleration.x, gravityAcceleration.y);
  if (input.eBrakeInput && gravityMagnitude > FORECAST_GRAVITY_EPSILON) {
    return {
      active: true,
      useFullBoostOutput: true,
      label: "E-Brake",
    };
  }
  if (input.gravityDiveInput && gravityMagnitude > FORECAST_GRAVITY_EPSILON) {
    return {
      active: true,
      useFullBoostOutput: true,
      label: "Gravity Dive",
    };
  }

  const progradeAmount = (input.progradeInput ? 1 : 0) - (input.retrogradeInput ? 1 : 0);
  const lateralAmount = (input.rightInput ? 1 : 0) - (input.leftInput ? 1 : 0);
  if (progradeAmount === 0 && lateralAmount === 0) {
    return {
      active: false,
      useFullBoostOutput: false,
      label: "",
    };
  }

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
    active: true,
    useFullBoostOutput: false,
    label: components.join(" + "),
  };
}

function createPredictedInput(
  input: FlightInputState,
  boostInput: boolean,
): PlayerInputCommand {
  return {
    sequence: 0,
    progradeInput: input.progradeInput,
    retrogradeInput: input.retrogradeInput,
    leftInput: input.leftInput,
    rightInput: input.rightInput,
    eBrakeInput: input.eBrakeInput,
    gravityDiveInput: input.gravityDiveInput,
    boostInput,
    firePrimary: false,
    fireSecondary: false,
  };
}

function buildPredictedPath(options: {
  player: ResolvedSimPlayerState;
  celestialBodies: readonly ResolvedSimCelestialBodyState[];
  input: PlayerInputCommand | null;
  steps: number;
  stepSeconds: number;
}): Vector2Like[] {
  const predictedPlayer = toPredictedPlayerState(options.player);
  const predictedBodies = options.celestialBodies.map(clonePredictedBodyState);
  const playersById = new Map<string, MultiplayerSimPlayerState>([
    [predictedPlayer.playerId, predictedPlayer],
  ]);
  const inputByPlayerId = new Map<string, PlayerInputCommand | null>([
    [predictedPlayer.playerId, options.input],
  ]);
  const path: Vector2Like[] = [];

  for (let index = 0; index < options.steps; index += 1) {
    advancePredictedCelestialBodies(predictedBodies, options.stepSeconds);
    stepMultiplayerPlayers(
      playersById,
      inputByPlayerId,
      predictedBodies,
      options.stepSeconds,
      DEFAULT_MULTIPLAYER_SIMULATION_TUNING,
    );
    const next = playersById.get(predictedPlayer.playerId);
    if (!next) {
      break;
    }
    path.push({
      x: next.x,
      y: next.y,
    });
    if ((next.lastCollisionImpactSpeed ?? 0) >= FORECAST_COLLISION_STOP_SPEED) {
      break;
    }
  }

  return path;
}

function toPredictedPlayerState(
  player: ResolvedSimPlayerState,
): MultiplayerSimPlayerState {
  return {
    playerId: player.playerId,
    x: player.renderX,
    y: player.renderY,
    vx: player.vx,
    vy: player.vy,
    heading: player.heading,
    lastProcessedInputSequence: player.lastProcessedInputSequence,
    stableMotionHeading: player.heading,
    systems: clonePredictedSystems(player.systems),
    life: player.life
      ? {
          alive: player.life.alive,
          respawnTimerSeconds: player.life.respawnTimerSeconds,
          respawnGraceSeconds: player.life.respawnGraceSeconds,
          deaths: player.life.deaths,
          health: player.life.health,
          maxHealth: player.life.maxHealth,
        }
      : undefined,
    throttle: player.throttle,
    thrustHeading: player.thrustHeading,
    superBurnActive: player.superBurnActive,
  };
}

function clonePredictedSystems(
  systems: ResolvedSimPlayerState["systems"],
): MultiplayerSimPlayerState["systems"] {
  if (!systems) {
    return undefined;
  }

  return {
    boosted: systems.boosted,
    engines: {
      baseMaxCharge: systems.engines.maxCharge,
      charge: systems.engines.charge,
      maxCharge: systems.engines.maxCharge,
    },
    scanners: {
      baseMaxCharge: systems.scanners.maxCharge,
      charge: systems.scanners.charge,
      maxCharge: systems.scanners.maxCharge,
    },
    weapons: {
      baseMaxCharge: systems.weapons.maxCharge,
      charge: systems.weapons.charge,
      maxCharge: systems.weapons.maxCharge,
    },
    defenses: {
      baseMaxCharge: systems.defenses.maxCharge,
      charge: systems.defenses.charge,
      maxCharge: systems.defenses.maxCharge,
    },
  };
}

function clonePredictedBodyState(
  body: ResolvedSimCelestialBodyState,
): SimCelestialBodySnapshot {
  return {
    id: body.id,
    name: body.name,
    parentId: body.parentId,
    x: body.renderX,
    y: body.renderY,
    vx: body.vx,
    vy: body.vy,
    mass: body.mass,
    radius: body.radius,
    orbitEccentricity: body.orbitEccentricity,
  };
}

function advancePredictedCelestialBodies(
  celestialBodies: SimCelestialBodySnapshot[],
  stepSeconds: number,
): void {
  for (const body of celestialBodies) {
    body.x += body.vx * stepSeconds;
    body.y += body.vy * stepSeconds;
  }
}

function drawStyledPath(
  graphics: Graphics,
  positions: readonly Vector2Like[],
  style: {
    color: number;
    width: number;
    alpha: number;
    markerRadius: number;
    dashLength?: number;
    gapLength?: number;
  },
  origin: Vector2Like,
  minimumNavigationLength: number,
): void {
  if (positions.length === 0) {
    return;
  }

  const pathPoints = [origin, ...positions];
  if (pathPoints.length < 2 || getPathLength(pathPoints) < minimumNavigationLength) {
    return;
  }

  const segments = (!style.dashLength || !style.gapLength)
    ? buildSolidPathSegments(pathPoints)
    : buildDashedPathSegments(pathPoints, style.dashLength, style.gapLength);
  if (segments.length === 0) {
    return;
  }

  for (const segment of segments) {
    graphics.moveTo(segment.start.x, segment.start.y);
    graphics.lineTo(segment.end.x, segment.end.y);
    graphics.stroke({
      color: style.color,
      width: style.width,
      alpha: style.alpha,
      cap: "round",
    });
  }

  const endpoint = pathPoints[pathPoints.length - 1];
  graphics.circle(endpoint.x, endpoint.y, style.markerRadius);
  graphics.fill({
    color: style.color,
    alpha: Math.min(1, style.alpha + 0.2),
  });
}

function buildSolidPathSegments(
  points: readonly Vector2Like[],
): Array<{ start: Vector2Like; end: Vector2Like }> {
  const segments: Array<{ start: Vector2Like; end: Vector2Like }> = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (distanceBetween(start, end) <= 0.0001) {
      continue;
    }
    segments.push({ start, end });
  }

  return segments;
}

function buildDashedPathSegments(
  points: readonly Vector2Like[],
  dashLength: number,
  gapLength: number,
): Array<{ start: Vector2Like; end: Vector2Like }> {
  const segments: Array<{ start: Vector2Like; end: Vector2Like }> = [];
  let drawDash = true;
  let remainingPatternLength = dashLength;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const segmentLength = Math.hypot(deltaX, deltaY);

    if (segmentLength <= 0.0001) {
      continue;
    }

    let traversed = 0;
    while (traversed < segmentLength) {
      const chunkLength = Math.min(remainingPatternLength, segmentLength - traversed);
      const chunkStartRatio = traversed / segmentLength;
      const chunkEndRatio = (traversed + chunkLength) / segmentLength;
      const chunkStart = {
        x: start.x + deltaX * chunkStartRatio,
        y: start.y + deltaY * chunkStartRatio,
      };
      const chunkEnd = {
        x: start.x + deltaX * chunkEndRatio,
        y: start.y + deltaY * chunkEndRatio,
      };

      if (drawDash) {
        segments.push({
          start: chunkStart,
          end: chunkEnd,
        });
      }

      traversed += chunkLength;
      remainingPatternLength -= chunkLength;
      if (remainingPatternLength <= 0.0001) {
        drawDash = !drawDash;
        remainingPatternLength = drawDash ? dashLength : gapLength;
      }
    }
  }

  return segments;
}

function getPathLength(points: readonly Vector2Like[]): number {
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalLength += distanceBetween(points[index - 1], points[index]);
  }
  return totalLength;
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function filterFrameByScannerRegistration(
  frame: ResolvedSimulationFrame,
  selfPlayerId: string | null,
): ResolvedSimulationFrame {
  if (!selfPlayerId) {
    return frame;
  }

  const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
  if (!selfPlayer || !selfPlayer.scanner) {
    return frame;
  }

  const contactByPlayerId = new Map(
    selfPlayer.scanner.contacts.map((contact) => [contact.targetPlayerId, contact] as const),
  );
  const filteredPlayers = frame.players.filter((player) => {
    if (player.playerId === selfPlayerId) {
      return true;
    }
    if (player.life?.alive === false) {
      return false;
    }
    return contactByPlayerId.get(player.playerId)?.registered === true;
  });

  if (filteredPlayers.length === frame.players.length) {
    return frame;
  }

  return {
    tick: frame.tick,
    players: filteredPlayers,
    celestialBodies: frame.celestialBodies,
  };
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function lerpAngle(start: number, end: number, alpha: number): number {
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return start + delta * alpha;
}
