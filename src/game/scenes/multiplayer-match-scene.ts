import { Container, Graphics, type Ticker } from "pixi.js";
import {
  resetGameOverlayState,
  setGameOverlayState,
  type OverlayMultiplayerEventState,
} from "../../ui/game-overlay-store";
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
  PlayerWeaponMode,
  RoomSnapshot,
  SimCombatEventSnapshot,
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
  resolveTravelRelativeThrustVector,
  readFlightInput,
  type FlightInputState,
} from "../flight/controls";
import { FORECAST_TUNING } from "../forecasting/forecast-tuning";
import type { Vector2Like } from "../physics/vector2";
import {
  createShipSystemsState,
  focusSubsystem,
  getEngineCruiseOutputCeiling,
  getEngineFuelFraction,
  getEngineFullBoostMultiplier,
  getEngineLateralThrustScale,
  getEngineProgradeRetrogradeThrustScale,
  getEngineSuperBurnMultiplier,
  getEngineThrustMultiplier,
  getWeaponRangeMultiplier,
  type ShipSystemsState,
} from "../ships/systems";
import {
  drawPlayerWeaponRange,
  drawDisintegratorEngagementLines,
  drawEngineCompass,
  drawLikelyEnemyMarkers,
  drawScannerRadius,
  drawShieldBubble,
} from "../rendering/prototype-overlays";
import { COMBAT_BALANCE } from "../combat/combat-balance";
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
  isPlayerCloaked,
  PLAYER_CLOAK_MAX_CHARGE,
  stepMultiplayerPlayers,
  type MultiplayerSimPlayerState,
} from "../../../shared/multiplayer-simulation-core.js";
import {
  updateWeaponEngagementStates,
  type WeaponEngagementState,
} from "../../../shared/player-weapon-core.js";

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
const DISRUPTOR_RANGE_MULTIPLIER = 1.2;
const PLAYER_SHIELD_BUBBLE_RADIUS = 38;
const BOOSTED_SHIELD_CAPACITY_MULTIPLIER = 1.5;
const SHIELD_RENDER_CHARGE_SMOOTHING = 10;
const SHIELD_RENDER_FLASH_DECAY_PER_SECOND = 2.8;
const SHIELD_RENDER_FLASH_GAIN_PER_CAPACITY_LOSS = 3.2;
const MAX_MULTIPLAYER_EVENTS = 8;
const COMBAT_EVENT_MAX_TRACKED_IDS = 4096;
const COMBAT_EVENT_BEAM_TTL_SECONDS = 0.16;
const COMBAT_EVENT_BEAM_DECAY_PER_SECOND = 6;
const COMBAT_EVENT_LOCK_DECAY_PER_SECOND = 2.6;
const COMBAT_EVENT_HIT_DECAY_PER_SECOND = 3.4;
const COMBAT_EVENT_DESTROYED_DECAY_PER_SECOND = 1.6;
const CLOAK_ACTIVATION_MIN_CHARGE_FRACTION = 0.02;

const COAST_ONLY_FLIGHT_INPUT: FlightInputState = {
  progradeInput: false,
  retrogradeInput: false,
  leftInput: false,
  rightInput: false,
  eBrakeInput: false,
  gravityDiveInput: false,
  boostInput: false,
};

interface TrackedRoomPlayerState {
  displayName: string;
  connected: boolean;
}

interface PlayerScannerContactState {
  player: ResolvedSimPlayerState;
  distance: number;
  inRange: boolean;
  visible: boolean;
  lockProgress: number;
}

interface CombatTargetFxState {
  lockAcquiringPulse: number;
  lockAcquiredPulse: number;
  shieldHitPulse: number;
  hullHitPulse: number;
  destroyedPulse: number;
}

interface CombatBeamFxState {
  attackerPlayerId: string;
  targetPlayerId: string;
  weaponMode: PlayerWeaponMode;
  intensity: number;
  ttlSeconds: number;
}

interface LocalEngineTelemetry {
  throttle: number;
  thrustHeading: number | null;
  superBurnActive: boolean;
}

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
  const weaponRangeOverlay = new Graphics();
  const shieldBubbleOverlay = new Graphics();
  const scannerRadiusOverlay = new Graphics();
  const likelyEnemyOverlay = new Graphics();
  const scannerContactsOverlay = new Graphics();
  const scannerLockOverlay = new Graphics();
  const weaponEngagementOverlay = new Graphics();
  const combatEventOverlay = new Graphics();
  const forecastOverlay = new Graphics();
  const engineCompassOverlay = new Graphics();

  root.addChild(starfield);
  root.addChild(world);
  root.addChild(engineCompassOverlay);
  world.addChild(orbitLayer);
  world.addChild(bodyLayer);
  world.addChild(playerLayer);
  world.addChild(weaponRangeOverlay);
  world.addChild(shieldBubbleOverlay);
  world.addChild(scannerRadiusOverlay);
  world.addChild(likelyEnemyOverlay);
  world.addChild(scannerContactsOverlay);
  world.addChild(scannerLockOverlay);
  world.addChild(weaponEngagementOverlay);
  world.addChild(combatEventOverlay);
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
  let selectedTargetPlayerId: string | null = null;
  let localEngineThrottle = 0;
  let localThrustHeadingRadians: number | null = null;
  let localPlayerAlive = true;
  let localRespawnTimerSeconds = 0;
  let localHealth = 100;
  let localMaxHealth = 100;
  let localWeaponArmed = false;
  let localWeaponMode: PlayerWeaponMode = "disintegrator";
  let pendingWeaponStateInputSequence: number | null = null;
  let weaponStateSyncPending = false;
  let localCloakActive = false;
  let localCloakCharge = PLAYER_CLOAK_MAX_CHARGE;
  let localCloakMaxCharge = PLAYER_CLOAK_MAX_CHARGE;
  let pendingCloakStateInputSequence: number | null = null;
  let cloakStateSyncPending = false;
  let lastAuthoritativeAlive: boolean | null = null;
  let localWeaponFiring = false;
  let localShieldRenderFraction = 0;
  let localShieldRenderTargetFraction = 0;
  let localShieldRenderFlash = 0;
  let localShieldRenderInitialized = false;
  let localSuperBurnActive = false;
  let smoothedThrustHeading: number | null = null;
  let smoothedThrottle = 0;
  let overlayElapsedSeconds = 0;
  let eventSequence = 0;
  let latestInfoMessage = "";
  let latestLoggedErrorMessage = "";
  let trackedRoomCode: string | null = null;
  let trackedRoomPlayersById = new Map<string, TrackedRoomPlayerState>();
  let multiplayerEvents: OverlayMultiplayerEventState[] = [];
  const localWeaponEngagementStates = new Map<string, WeaponEngagementState>();
  const combatTargetFxByPlayerId = new Map<string, CombatTargetFxState>();
  const combatBeamFxByEdgeId = new Map<string, CombatBeamFxState>();
  const processedCombatEventIds = new Set<string>();

  const localShipSystems: ShipSystemsState = createShipSystemsState();
  const warningManager = createGameWarningManagerState();

  const getDisplayNameForPlayerId = (playerId: string): string => {
    return latestRoom?.players.find((player) => player.id === playerId)?.displayName
      ?? trackedRoomPlayersById.get(playerId)?.displayName
      ?? playerId;
  };

  const shouldSurfaceInfoMessage = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return (
      !normalized.includes(" joined room ")
      && !normalized.includes(" left room ")
      && !normalized.includes(" dropped into room ")
    );
  };

  const pushMultiplayerEvent = (
    text: string,
    tone: OverlayMultiplayerEventState["tone"],
    alsoConsole = true,
  ): void => {
    eventSequence += 1;
    const event: OverlayMultiplayerEventState = {
      id: `mpe-${eventSequence}`,
      text,
      tone,
    };
    multiplayerEvents = [event, ...multiplayerEvents].slice(0, MAX_MULTIPLAYER_EVENTS);
    if (alsoConsole) {
      const roomLabel = latestRoom?.code ?? trackedRoomCode ?? "----";
      console.log(`[multiplayer][room:${roomLabel}] ${text}`);
    }
  };

  const resolveCurrentWeaponRange = (): number => {
    const disintegratorRange =
      BASE_DISINTEGRATOR_RANGE * getWeaponRangeMultiplier(localShipSystems);
    return localWeaponMode === "disintegrator"
      ? disintegratorRange
      : disintegratorRange * DISRUPTOR_RANGE_MULTIPLIER;
  };

  const resolveCurrentLockAcquireThreshold = (): number => {
    return localWeaponMode === "disintegrator"
      ? COMBAT_BALANCE.disintegrator.targetAcquireThreshold
      : COMBAT_BALANCE.disruptor.targetAcquireThreshold;
  };

  const collectScannerContactStates = (
    frame: ResolvedSimulationFrame,
    selfPlayer: ResolvedSimPlayerState,
  ): PlayerScannerContactState[] => {
    const contactByPlayerId = new Map(
      selfPlayer.scanner?.contacts.map((contact) => [contact.targetPlayerId, contact] as const) ?? [],
    );
    const contacts: PlayerScannerContactState[] = [];
    for (const player of frame.players) {
      if (player.playerId === selfPlayer.playerId || player.life?.alive === false) {
        continue;
      }
      const contact = contactByPlayerId.get(player.playerId);
      if (!contact) {
        continue;
      }
      contacts.push({
        player,
        distance: contact.distance,
        inRange: contact.inRange,
        visible: contact.visible,
        lockProgress: clamp(contact.lockProgress, 0, 1),
      });
    }
    contacts.sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.player.playerId.localeCompare(right.player.playerId);
    });
    return contacts;
  };

  const resolveTargetCycleCandidates = (): string[] => {
    if (!selfPlayerId || !latestSnapshot) {
      return [];
    }
    const selfSnapshot = latestSnapshot.players.find((player) => player.playerId === selfPlayerId);
    if (!selfSnapshot?.scanner) {
      return [];
    }
    const alivePlayerIds = new Set(
      latestSnapshot.players
        .filter((player) => player.life?.alive !== false)
        .map((player) => player.playerId),
    );
    return [...selfSnapshot.scanner.contacts]
      .filter((contact) =>
        contact.visible &&
        contact.inRange &&
        contact.lockProgress >= resolveCurrentLockAcquireThreshold() &&
        alivePlayerIds.has(contact.targetPlayerId),
      )
      .sort((left, right) => {
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return left.targetPlayerId.localeCompare(right.targetPlayerId);
      })
      .map((contact) => contact.targetPlayerId);
  };

  const resolvePlayerHudPosition = (
    player: ResolvedSimPlayerState,
  ): { x: number; y: number } => {
    const spriteInfo = worldPresenter.getPlayerSpriteInfo(player.playerId);
    if (spriteInfo) {
      return {
        x: spriteInfo.worldX,
        y: spriteInfo.worldY,
      };
    }
    return {
      x: player.renderX,
      y: player.renderY,
    };
  };

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

  const trackRoomRosterEvents = (room: RoomSnapshot): void => {
    const nextRoomPlayersById = new Map(
      room.players.map((player) => [
        player.id,
        {
          displayName: player.displayName,
          connected: player.connected,
        },
      ] as const),
    );

    if (trackedRoomCode !== room.code) {
      trackedRoomCode = room.code;
      trackedRoomPlayersById = nextRoomPlayersById;
      multiplayerEvents = [];
      combatEventOverlay.clear();
      combatTargetFxByPlayerId.clear();
      combatBeamFxByEdgeId.clear();
      processedCombatEventIds.clear();
      pushMultiplayerEvent(`Connected to room ${room.code}.`, "system");
      return;
    }

    for (const [playerId, player] of nextRoomPlayersById.entries()) {
      const previousPlayer = trackedRoomPlayersById.get(playerId);
      if (!previousPlayer) {
        pushMultiplayerEvent(`${player.displayName} joined the room.`, "system");
        continue;
      }
      if (previousPlayer.connected !== player.connected) {
        pushMultiplayerEvent(
          `${player.displayName} ${player.connected ? "reconnected" : "disconnected"}.`,
          "system",
        );
      }
    }

    for (const [playerId, player] of trackedRoomPlayersById.entries()) {
      if (!nextRoomPlayersById.has(playerId)) {
        pushMultiplayerEvent(`${player.displayName} left the room.`, "system");
      }
    }

    trackedRoomPlayersById = nextRoomPlayersById;
  };

  const trackSnapshotCombatEvents = (
    previous: SimulationSnapshot | null,
    next: SimulationSnapshot,
  ): void => {
    if (!previous) {
      return;
    }
    const destroyedEventCountByTargetPlayerId = new Map<string, number>();
    const destroyedEvents = (next.combatEvents ?? []).filter(
      (event) => event.type === "ship-destroyed",
    );
    for (const event of destroyedEvents) {
      destroyedEventCountByTargetPlayerId.set(
        event.targetPlayerId,
        (destroyedEventCountByTargetPlayerId.get(event.targetPlayerId) ?? 0) + 1,
      );

      const targetDisplayName = getDisplayNameForPlayerId(event.targetPlayerId);
      const targetIsSelf = event.targetPlayerId === selfPlayerId;
      const attackerPlayerId = event.attackerPlayerId;
      const attackerIsKnownOtherPlayer =
        typeof attackerPlayerId === "string" &&
        attackerPlayerId.length > 0 &&
        attackerPlayerId !== event.targetPlayerId;
      const attackerDisplayName = attackerIsKnownOtherPlayer
        ? getDisplayNameForPlayerId(attackerPlayerId)
        : null;
      const attackerIsSelf = attackerIsKnownOtherPlayer && attackerPlayerId === selfPlayerId;

      let eventText: string;
      if (event.cause === "collision") {
        eventText = targetIsSelf ? "You crashed." : `${targetDisplayName} crashed.`;
      } else if (attackerIsKnownOtherPlayer && attackerDisplayName) {
        if (targetIsSelf) {
          eventText = `You were eliminated by ${attackerDisplayName}.`;
        } else if (attackerIsSelf) {
          eventText = `You eliminated ${targetDisplayName}.`;
        } else {
          eventText = `${targetDisplayName} was eliminated by ${attackerDisplayName}.`;
        }
      } else if (targetIsSelf) {
        eventText = "You were eliminated.";
      } else {
        eventText = `${targetDisplayName} was eliminated.`;
      }

      pushMultiplayerEvent(eventText, "combat");
    }

    const previousPlayersById = new Map(
      previous.players.map((player) => [player.playerId, player] as const),
    );

    for (const player of next.players) {
      const previousPlayer = previousPlayersById.get(player.playerId);
      if (!previousPlayer) {
        continue;
      }

      const previousDeaths = Math.max(0, previousPlayer.life?.deaths ?? 0);
      const nextDeaths = Math.max(0, player.life?.deaths ?? 0);
      if (nextDeaths > previousDeaths) {
        const deathEvents = Math.max(1, Math.floor(nextDeaths - previousDeaths));
        const matchedDestroyedEventCount =
          destroyedEventCountByTargetPlayerId.get(player.playerId) ?? 0;
        const unresolvedDeathEvents = Math.max(0, deathEvents - matchedDestroyedEventCount);
        for (let index = 0; index < unresolvedDeathEvents; index += 1) {
          const displayName = getDisplayNameForPlayerId(player.playerId);
          const eventText = player.playerId === selfPlayerId
            ? "You were destroyed."
            : `${displayName} was destroyed.`;
          pushMultiplayerEvent(eventText, "combat");
        }
      }

      const wasAlive = previousPlayer.life?.alive ?? true;
      const isAlive = player.life?.alive ?? true;
      if (!wasAlive && isAlive) {
        const displayName = getDisplayNameForPlayerId(player.playerId);
        const eventText = player.playerId === selfPlayerId
          ? "You respawned."
          : `${displayName} respawned.`;
        pushMultiplayerEvent(eventText, "system");
      }
    }
  };

  const handleClientUpdate = (): void => {
    const state = client.getState();
    latestRoom = state.room;
    latestError = state.latestErrorMessage ?? "";
    selfPlayerId = state.playerId;
    if (
      state.latestInfoMessage &&
      state.latestInfoMessage !== latestInfoMessage &&
      shouldSurfaceInfoMessage(state.latestInfoMessage)
    ) {
      latestInfoMessage = state.latestInfoMessage;
      pushMultiplayerEvent(state.latestInfoMessage, "system");
    } else if (state.latestInfoMessage && state.latestInfoMessage !== latestInfoMessage) {
      latestInfoMessage = state.latestInfoMessage;
    }
    if (
      state.latestErrorMessage &&
      state.latestErrorMessage !== latestLoggedErrorMessage
    ) {
      latestLoggedErrorMessage = state.latestErrorMessage;
      pushMultiplayerEvent(state.latestErrorMessage, "error");
    }

    if (
      state.connectionStatus === "disconnected"
      || !state.room
      || state.room.status !== "running"
    ) {
      leaveToLobby();
      return;
    }
    trackRoomRosterEvents(state.room);

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
      trackSnapshotCombatEvents(latestSnapshot, snapshot);
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
    let forceImmediateInputSend = false;
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
    if (sceneActions.toggleWeaponArm && localPlayerAlive) {
      localWeaponArmed = !localWeaponArmed;
      weaponStateSyncPending = true;
      forceImmediateInputSend = true;
    }
    if (sceneActions.switchWeaponMode && localPlayerAlive) {
      localWeaponMode = localWeaponMode === "disintegrator" ? "disruptor" : "disintegrator";
      weaponStateSyncPending = true;
      forceImmediateInputSend = true;
    }
    if (sceneActions.restart && localPlayerAlive) {
      const minimumActivationCharge = Math.max(
        0.01,
        localCloakMaxCharge * CLOAK_ACTIVATION_MIN_CHARGE_FRACTION,
      );
      if (localCloakActive || localCloakCharge > minimumActivationCharge) {
        localCloakActive = !localCloakActive;
        cloakStateSyncPending = true;
        forceImmediateInputSend = true;
        pushMultiplayerEvent(
          localCloakActive ? "Cloak engaged." : "Cloak disengaged.",
          "system",
        );
      } else {
        pushMultiplayerEvent("Cloak unavailable: insufficient charge.", "error");
      }
    }
    const targetCycleCandidates = resolveTargetCycleCandidates();
    if (
      selectedTargetPlayerId &&
      !targetCycleCandidates.includes(selectedTargetPlayerId)
    ) {
      selectedTargetPlayerId = null;
      forceImmediateInputSend = true;
    }
    if (sceneActions.cycleTorpedoLock && localPlayerAlive) {
      if (targetCycleCandidates.length === 0) {
        selectedTargetPlayerId = null;
      } else {
        const selectedIndex = selectedTargetPlayerId
          ? targetCycleCandidates.indexOf(selectedTargetPlayerId)
          : -1;
        const nextIndex = selectedIndex < 0
          ? 0
          : (selectedIndex + 1) % targetCycleCandidates.length;
        selectedTargetPlayerId = targetCycleCandidates[nextIndex] ?? null;
      }
      const selectionLabel = selectedTargetPlayerId
        ? getDisplayNameForPlayerId(selectedTargetPlayerId)
        : "none";
      pushMultiplayerEvent(`Target lock: ${selectionLabel}.`, "system");
      forceImmediateInputSend = true;
    }

    maybeSendInput(nowMs, flightInput, forceImmediateInputSend);

    const frame = resolveSimulationFrame({
      previousSnapshot,
      latestSnapshot,
      nowMs,
      interpolationDelayMs: SNAPSHOT_INTERPOLATION_DELAY_MS,
      extrapolationLimitMs: SNAPSHOT_EXTRAPOLATION_LIMIT_MS,
    });
    const deltaSeconds = ticker.deltaMS / 1000;
    fpsSmoothed = fpsSmoothed * 0.9 + (1000 / Math.max(1, ticker.deltaMS)) * 0.1;
    overlayElapsedSeconds += deltaSeconds;
    if (frame) {
      applyAuthoritativeHudTelemetry(frame, flightInput);
    }
    stepShieldRenderState(deltaSeconds);
    updateOverlay(frame, nowMs, overlayElapsedSeconds);

    if (!frame) {
      clearNavigationHud();
      clearWeaponRangeHud();
      clearWeaponEngagementHud();
      clearCombatEventHud();
      clearShieldHud();
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
      selectedTargetPlayerId,
      tickerDeltaTime: ticker.deltaTime,
      viewportWidth: context.app.renderer.width,
      viewportHeight: context.app.renderer.height,
    });
    drawWeaponRangeHud(frame);
    drawWeaponEngagementHud(frame, deltaSeconds);
    drawCombatEventHud(renderFrame, deltaSeconds);
    drawShieldHud(frame);
    drawScannerHud(frame);
    drawNavigationHud(frame, flightInput, ticker.deltaTime);
  };

  const maybeSendInput = (
    nowMs: number,
    flightInput: FlightInputState,
    forceSend: boolean,
  ): void => {
    if (!forceSend && nowMs - lastInputSentAtMs < INPUT_SEND_INTERVAL_MS) {
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
      weaponArmed: localWeaponArmed,
      weaponMode: localWeaponMode,
      targetPlayerId: selectedTargetPlayerId,
      cloakActive: localCloakActive,
    });
    lastInputSentAtMs = nowMs;
    if (weaponStateSyncPending) {
      pendingWeaponStateInputSequence = inputSequence;
      weaponStateSyncPending = false;
    }
    if (cloakStateSyncPending) {
      pendingCloakStateInputSequence = inputSequence;
      cloakStateSyncPending = false;
    }
    pendingFocusSubsystem = null;
  };

  const applyAuthoritativeHudTelemetry = (
    frame: ResolvedSimulationFrame,
    input: FlightInputState,
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
      localWeaponArmed = false;
      localWeaponMode = "disintegrator";
      pendingWeaponStateInputSequence = null;
      weaponStateSyncPending = false;
      localCloakActive = false;
      localCloakCharge = PLAYER_CLOAK_MAX_CHARGE;
      localCloakMaxCharge = PLAYER_CLOAK_MAX_CHARGE;
      pendingCloakStateInputSequence = null;
      cloakStateSyncPending = false;
      lastAuthoritativeAlive = null;
      localWeaponFiring = false;
      localShieldRenderFraction = 0;
      localShieldRenderTargetFraction = 0;
      localShieldRenderFlash = 0;
      localShieldRenderInitialized = false;
      localSuperBurnActive = false;
      selectedTargetPlayerId = null;
      localWeaponEngagementStates.clear();
      return;
    }

    const latestAuthoritativeSelfPlayer =
      selfPlayerId && latestSnapshot
        ? latestSnapshot.players.find((player) => player.playerId === selfPlayerId) ?? null
        : null;
    const authoritativeSelfPlayer = latestAuthoritativeSelfPlayer ?? selfPlayer;
    const authoritativeAlive = authoritativeSelfPlayer.life?.alive ?? true;
    const lifeStateTransitioned =
      lastAuthoritativeAlive !== null && lastAuthoritativeAlive !== authoritativeAlive;
    lastAuthoritativeAlive = authoritativeAlive;

    localPlayerAlive = authoritativeAlive;
    localRespawnTimerSeconds = authoritativeSelfPlayer.life?.respawnTimerSeconds ?? 0;
    localHealth = authoritativeSelfPlayer.life?.health ?? localMaxHealth;
    localMaxHealth = authoritativeSelfPlayer.life?.maxHealth ?? 100;
    const authoritativeWeaponArmed = authoritativeSelfPlayer.weaponArmed ?? false;
    const authoritativeWeaponMode = authoritativeSelfPlayer.weaponMode ?? "disintegrator";
    const authoritativeCloakMaxCharge = Math.max(
      0.0001,
      authoritativeSelfPlayer.cloakMaxCharge
        ?? localCloakMaxCharge
        ?? PLAYER_CLOAK_MAX_CHARGE,
    );
    const authoritativeCloakCharge = clamp(
      authoritativeSelfPlayer.cloakCharge ?? authoritativeCloakMaxCharge,
      0,
      authoritativeCloakMaxCharge,
    );
    const authoritativeCloakActive = isPlayerCloaked(authoritativeSelfPlayer);
    const lastProcessedInputSequence = authoritativeSelfPlayer.lastProcessedInputSequence;
    const previousLocalCloakActive = localCloakActive;
    if (lifeStateTransitioned) {
      pendingWeaponStateInputSequence = null;
      weaponStateSyncPending = false;
      localWeaponArmed = authoritativeWeaponArmed;
      localWeaponMode = authoritativeWeaponMode;
      pendingCloakStateInputSequence = null;
      cloakStateSyncPending = false;
      localCloakActive = authoritativeCloakActive;
    }
    const waitingForWeaponStateAck =
      pendingWeaponStateInputSequence !== null &&
      (
        lastProcessedInputSequence === null
        || lastProcessedInputSequence < pendingWeaponStateInputSequence
      );
    const waitingForCloakStateAck =
      pendingCloakStateInputSequence !== null &&
      (
        lastProcessedInputSequence === null
        || lastProcessedInputSequence < pendingCloakStateInputSequence
      );
    if (!waitingForWeaponStateAck) {
      localWeaponArmed = authoritativeWeaponArmed;
      localWeaponMode = authoritativeWeaponMode;
      pendingWeaponStateInputSequence = null;
    }
    if (!waitingForCloakStateAck) {
      localCloakActive = authoritativeCloakActive;
      pendingCloakStateInputSequence = null;
    }
    localCloakCharge = authoritativeCloakCharge;
    localCloakMaxCharge = authoritativeCloakMaxCharge;
    if (
      previousLocalCloakActive &&
      !localCloakActive &&
      authoritativeCloakCharge <= 0.01 &&
      !waitingForCloakStateAck &&
      localPlayerAlive
    ) {
      pushMultiplayerEvent("Cloak depleted.", "system");
    }
    localWeaponFiring = localPlayerAlive ? (authoritativeSelfPlayer.weaponFiring ?? false) : false;
    if (selfPlayer.systems) {
      syncHudShipSystems(localShipSystems, selfPlayer.systems);
    }
    const localEngineTelemetry = resolveLocalEngineTelemetry({
      frame,
      selfPlayer,
      input,
      shipSystems: localShipSystems,
      cloaked: localCloakActive,
    });
    localEngineThrottle = localPlayerAlive
      ? clamp(selfPlayer.throttle ?? localEngineTelemetry.throttle, 0, Number.POSITIVE_INFINITY)
      : 0;
    localThrustHeadingRadians = localPlayerAlive
      ? localEngineTelemetry.thrustHeading
      : null;
    localSuperBurnActive = localPlayerAlive
      ? localEngineTelemetry.superBurnActive
      : false;
    if (!localPlayerAlive) {
      localWeaponArmed = authoritativeWeaponArmed;
      localWeaponMode = authoritativeWeaponMode;
      pendingWeaponStateInputSequence = null;
      weaponStateSyncPending = false;
      localCloakActive = false;
      pendingCloakStateInputSequence = null;
      cloakStateSyncPending = false;
      selectedTargetPlayerId = null;
      localWeaponEngagementStates.clear();
      localShieldRenderFraction = 0;
      localShieldRenderTargetFraction = 0;
      localShieldRenderFlash = 0;
      localShieldRenderInitialized = false;
      localSuperBurnActive = false;
    }

    if (selfPlayer.systems) {
      const nextShieldRenderTargetFraction = getShieldCapacityFraction(selfPlayer.systems);
      if (!localShieldRenderInitialized) {
        localShieldRenderFraction = nextShieldRenderTargetFraction;
        localShieldRenderTargetFraction = nextShieldRenderTargetFraction;
        localShieldRenderInitialized = true;
      } else {
        const shieldLoss = Math.max(
          0,
          localShieldRenderTargetFraction - nextShieldRenderTargetFraction,
        );
        if (shieldLoss > 0.0001) {
          localShieldRenderFlash = Math.min(
            1,
            localShieldRenderFlash + shieldLoss * SHIELD_RENDER_FLASH_GAIN_PER_CAPACITY_LOSS,
          );
        }
        localShieldRenderTargetFraction = nextShieldRenderTargetFraction;
      }
    }
  };

  const stepShieldRenderState = (deltaSeconds: number): void => {
    localShieldRenderFlash = Math.max(
      0,
      localShieldRenderFlash - deltaSeconds * SHIELD_RENDER_FLASH_DECAY_PER_SECOND,
    );
    const blend = 1 - Math.exp(-SHIELD_RENDER_CHARGE_SMOOTHING * deltaSeconds);
    localShieldRenderFraction = lerp(
      localShieldRenderFraction,
      localShieldRenderTargetFraction,
      blend,
    );
  };

  const clearNavigationHud = (): void => {
    forecastOverlay.clear();
    engineCompassOverlay.clear();
  };

  const clearShieldHud = (): void => {
    shieldBubbleOverlay.clear();
  };

  const clearWeaponRangeHud = (): void => {
    weaponRangeOverlay.clear();
  };

  const clearWeaponEngagementHud = (): void => {
    weaponEngagementOverlay.clear();
    localWeaponEngagementStates.clear();
  };

  const clearCombatEventHud = (): void => {
    combatEventOverlay.clear();
  };

  const getOrCreateCombatTargetFxState = (playerId: string): CombatTargetFxState => {
    const existing = combatTargetFxByPlayerId.get(playerId);
    if (existing) {
      return existing;
    }
    const created: CombatTargetFxState = {
      lockAcquiringPulse: 0,
      lockAcquiredPulse: 0,
      shieldHitPulse: 0,
      hullHitPulse: 0,
      destroyedPulse: 0,
    };
    combatTargetFxByPlayerId.set(playerId, created);
    return created;
  };

  const markCombatEventProcessed = (eventId: string): boolean => {
    if (processedCombatEventIds.has(eventId)) {
      return false;
    }
    processedCombatEventIds.add(eventId);
    while (processedCombatEventIds.size > COMBAT_EVENT_MAX_TRACKED_IDS) {
      const oldest = processedCombatEventIds.values().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      processedCombatEventIds.delete(oldest);
    }
    return true;
  };

  const ingestCombatEvents = (events: readonly SimCombatEventSnapshot[]): void => {
    for (const event of events) {
      if (!markCombatEventProcessed(event.id)) {
        continue;
      }

      const targetState = getOrCreateCombatTargetFxState(event.targetPlayerId);
      if (event.type === "lock-acquiring") {
        const lockStrength = clamp(event.lockProgress ?? event.strength ?? 0.45, 0, 1);
        targetState.lockAcquiringPulse = Math.max(
          targetState.lockAcquiringPulse,
          0.28 + lockStrength * 0.72,
        );
        continue;
      }

      if (event.type === "lock-acquired") {
        targetState.lockAcquiredPulse = Math.max(targetState.lockAcquiredPulse, 1);
        continue;
      }

      if (event.type === "shield-hit") {
        const shieldDamage = Math.max(0, event.shieldDamage ?? 0);
        targetState.shieldHitPulse = Math.min(
          1,
          Math.max(targetState.shieldHitPulse, 0.22) + shieldDamage * 2.4,
        );
        continue;
      }

      if (event.type === "hull-hit") {
        const hullDamage = Math.max(0, event.hullDamage ?? 0);
        targetState.hullHitPulse = Math.min(
          1,
          Math.max(targetState.hullHitPulse, 0.26) + hullDamage * 0.08,
        );
        continue;
      }

      if (event.type === "ship-destroyed") {
        targetState.destroyedPulse = Math.max(targetState.destroyedPulse, 1);
        continue;
      }

      if (event.type === "weapon-firing" && event.attackerPlayerId) {
        const weaponMode = event.weaponMode ?? "disintegrator";
        const beamEdgeId =
          `${event.attackerPlayerId}->${event.targetPlayerId}:${weaponMode}`;
        const beamState = combatBeamFxByEdgeId.get(beamEdgeId) ?? {
          attackerPlayerId: event.attackerPlayerId,
          targetPlayerId: event.targetPlayerId,
          weaponMode,
          intensity: 0,
          ttlSeconds: 0,
        };
        beamState.intensity = Math.max(
          beamState.intensity,
          clamp(event.strength ?? 0.48, 0.2, 1),
        );
        beamState.ttlSeconds = COMBAT_EVENT_BEAM_TTL_SECONDS;
        combatBeamFxByEdgeId.set(beamEdgeId, beamState);
      }
    }
  };

  const stepCombatEventFxStates = (deltaSeconds: number): void => {
    for (const [playerId, state] of combatTargetFxByPlayerId.entries()) {
      state.lockAcquiringPulse = Math.max(
        0,
        state.lockAcquiringPulse - deltaSeconds * COMBAT_EVENT_LOCK_DECAY_PER_SECOND,
      );
      state.lockAcquiredPulse = Math.max(
        0,
        state.lockAcquiredPulse - deltaSeconds * COMBAT_EVENT_LOCK_DECAY_PER_SECOND,
      );
      state.shieldHitPulse = Math.max(
        0,
        state.shieldHitPulse - deltaSeconds * COMBAT_EVENT_HIT_DECAY_PER_SECOND,
      );
      state.hullHitPulse = Math.max(
        0,
        state.hullHitPulse - deltaSeconds * COMBAT_EVENT_HIT_DECAY_PER_SECOND,
      );
      state.destroyedPulse = Math.max(
        0,
        state.destroyedPulse - deltaSeconds * COMBAT_EVENT_DESTROYED_DECAY_PER_SECOND,
      );

      if (
        state.lockAcquiringPulse <= 0 &&
        state.lockAcquiredPulse <= 0 &&
        state.shieldHitPulse <= 0 &&
        state.hullHitPulse <= 0 &&
        state.destroyedPulse <= 0
      ) {
        combatTargetFxByPlayerId.delete(playerId);
      }
    }

    for (const [beamEdgeId, beamState] of combatBeamFxByEdgeId.entries()) {
      beamState.ttlSeconds = Math.max(0, beamState.ttlSeconds - deltaSeconds);
      beamState.intensity = Math.max(
        0,
        beamState.intensity - deltaSeconds * COMBAT_EVENT_BEAM_DECAY_PER_SECOND,
      );
      if (beamState.ttlSeconds <= 0 || beamState.intensity <= 0) {
        combatBeamFxByEdgeId.delete(beamEdgeId);
      }
    }
  };

  const drawCombatEventHud = (
    frame: ResolvedSimulationFrame,
    deltaSeconds: number,
  ): void => {
    ingestCombatEvents(frame.combatEvents);
    stepCombatEventFxStates(deltaSeconds);

    if (!hudVisible) {
      clearCombatEventHud();
      return;
    }

    const playersById = new Map(
      frame.players.map((player) => [player.playerId, player] as const),
    );

    combatEventOverlay.clear();

    const pulseTime = performance.now() / 1000;
    for (const beamState of combatBeamFxByEdgeId.values()) {
      const attacker = playersById.get(beamState.attackerPlayerId);
      const target = playersById.get(beamState.targetPlayerId);
      if (!attacker || !target) {
        continue;
      }

      const ttlAlpha = clamp(
        beamState.ttlSeconds / COMBAT_EVENT_BEAM_TTL_SECONDS,
        0,
        1,
      );
      const flicker = 0.84 + 0.16 * Math.sin(
        pulseTime * 25 +
          attacker.renderX * 0.01 +
          target.renderY * 0.012,
      );
      const beamAlpha = ttlAlpha * beamState.intensity * flicker;
      const coreColor = beamState.weaponMode === "disintegrator" ? 0xff7a68 : 0xa3aeff;
      const glowColor = beamState.weaponMode === "disintegrator" ? 0xff4438 : 0x5f74ff;
      const coreWidth = 1.2 + beamState.intensity * 1.8;

      combatEventOverlay.moveTo(attacker.renderX, attacker.renderY);
      combatEventOverlay.lineTo(target.renderX, target.renderY);
      combatEventOverlay.stroke({
        color: glowColor,
        width: coreWidth * 2.8,
        alpha: beamAlpha * 0.3,
        cap: "round",
      });
      combatEventOverlay.moveTo(attacker.renderX, attacker.renderY);
      combatEventOverlay.lineTo(target.renderX, target.renderY);
      combatEventOverlay.stroke({
        color: coreColor,
        width: coreWidth,
        alpha: beamAlpha * 0.92,
        cap: "round",
      });
    }

    for (const [playerId, state] of combatTargetFxByPlayerId.entries()) {
      const target = playersById.get(playerId);
      if (!target) {
        continue;
      }
      const center = { x: target.renderX, y: target.renderY };

      if (state.lockAcquiringPulse > 0) {
        const radius = 13 + state.lockAcquiringPulse * 12;
        combatEventOverlay.circle(center.x, center.y, radius);
        combatEventOverlay.stroke({
          color: 0x93eaff,
          width: 1.2 + state.lockAcquiringPulse * 1.1,
          alpha: 0.16 + state.lockAcquiringPulse * 0.5,
        });
      }

      if (state.lockAcquiredPulse > 0) {
        const expansion = 1 - clamp(state.lockAcquiredPulse, 0, 1);
        const radius = 18 + expansion * 20;
        combatEventOverlay.circle(center.x, center.y, radius);
        combatEventOverlay.stroke({
          color: 0xff9d74,
          width: 1.8 + state.lockAcquiredPulse * 1.2,
          alpha: state.lockAcquiredPulse * 0.72,
        });
      }

      if (state.shieldHitPulse > 0) {
        const radius = 10 + state.shieldHitPulse * 14;
        combatEventOverlay.circle(center.x, center.y, radius);
        combatEventOverlay.fill({
          color: 0x6fd4ff,
          alpha: 0.06 + state.shieldHitPulse * 0.15,
        });
        combatEventOverlay.circle(center.x, center.y, radius + 2);
        combatEventOverlay.stroke({
          color: 0x8ee6ff,
          width: 1.1 + state.shieldHitPulse * 1.1,
          alpha: 0.2 + state.shieldHitPulse * 0.46,
        });
      }

      if (state.hullHitPulse > 0) {
        const radius = 9 + state.hullHitPulse * 12;
        combatEventOverlay.circle(center.x, center.y, radius);
        combatEventOverlay.fill({
          color: 0xff704f,
          alpha: 0.08 + state.hullHitPulse * 0.16,
        });
        combatEventOverlay.circle(center.x, center.y, radius + 1.5);
        combatEventOverlay.stroke({
          color: 0xff9d74,
          width: 1.2 + state.hullHitPulse * 1.2,
          alpha: 0.28 + state.hullHitPulse * 0.46,
        });
      }

      if (state.destroyedPulse > 0) {
        const radius = 22 + (1 - state.destroyedPulse) * 36;
        combatEventOverlay.circle(center.x, center.y, radius);
        combatEventOverlay.stroke({
          color: 0xffb66b,
          width: 2.1,
          alpha: state.destroyedPulse * 0.78,
        });
      }
    }
  };

  const drawWeaponRangeHud = (frame: ResolvedSimulationFrame): void => {
    if (!hudVisible || !selfPlayerId) {
      clearWeaponRangeHud();
      return;
    }

    const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
    if (!selfPlayer || selfPlayer.life?.alive === false) {
      clearWeaponRangeHud();
      return;
    }

    const spriteInfo = worldPresenter.getPlayerSpriteInfo(selfPlayerId);
    const weaponRangeCenter = spriteInfo
      ? { x: spriteInfo.worldX, y: spriteInfo.worldY }
      : { x: selfPlayer.renderX, y: selfPlayer.renderY };
    const disintegratorRange =
      BASE_DISINTEGRATOR_RANGE * getWeaponRangeMultiplier(localShipSystems);
    const weaponRange = localWeaponMode === "disintegrator"
      ? disintegratorRange
      : disintegratorRange * DISRUPTOR_RANGE_MULTIPLIER;
    drawPlayerWeaponRange(
      weaponRangeOverlay,
      weaponRangeCenter,
      weaponRange,
      localWeaponArmed,
      localWeaponMode,
    );
  };

  const drawShieldHud = (frame: ResolvedSimulationFrame): void => {
    if (!hudVisible || !selfPlayerId) {
      clearShieldHud();
      return;
    }

    const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
    if (!selfPlayer || selfPlayer.life?.alive === false) {
      clearShieldHud();
      return;
    }

    const spriteInfo = worldPresenter.getPlayerSpriteInfo(selfPlayerId);
    const shieldCenter = spriteInfo
      ? { x: spriteInfo.worldX, y: spriteInfo.worldY }
      : { x: selfPlayer.renderX, y: selfPlayer.renderY };
    drawShieldBubble(
      shieldBubbleOverlay,
      shieldCenter,
      PLAYER_SHIELD_BUBBLE_RADIUS,
      localShieldRenderFraction,
      localShieldRenderFlash,
    );
  };

  const clearScannerHud = (): void => {
    scannerRadiusOverlay.clear();
    likelyEnemyOverlay.clear();
    scannerContactsOverlay.clear();
    scannerLockOverlay.clear();
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
    const contactStates = collectScannerContactStates(frame, selfPlayer);
    const visibleContacts = contactStates.filter((contact) => contact.visible);
    const occludedContacts = contactStates.filter((contact) =>
      contact.inRange && !contact.visible
    );
    const weaponRange = resolveCurrentWeaponRange();
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
      weaponRange,
      scannerOccluders as unknown as Parameters<typeof drawScannerRadius>[4],
    );

    drawLikelyEnemyMarkers(
      likelyEnemyOverlay,
      occludedContacts.map((contact) => ({
        position: resolvePlayerHudPosition(contact.player),
        radius: 8,
        enemyClass: "raider" as const,
      })),
    );

    scannerContactsOverlay.clear();
    for (const contactState of visibleContacts) {
      const player = contactState.player;
      const center = resolvePlayerHudPosition(player);
      scannerContactsOverlay.circle(center.x, center.y, 8);
      scannerContactsOverlay.stroke({
        color: scannerContactsStyle.contactColor,
        width: WORLD_OVERLAY_STYLES.scannerContacts.strokeWidth,
        alpha: WORLD_OVERLAY_STYLES.scannerContacts.strokeAlpha,
      });
      scannerContactsOverlay.circle(center.x, center.y, 2.5);
      scannerContactsOverlay.fill({
        color: scannerContactsStyle.contactColor,
        alpha: scannerContactsStyle.contactFillAlpha,
      });
    }

    scannerLockOverlay.clear();
    for (const contactState of visibleContacts) {
      if (contactState.lockProgress <= 0) {
        continue;
      }
      const center = resolvePlayerHudPosition(contactState.player);
      const lockRadius = 11 + contactState.lockProgress * 10;
      const selected = selectedTargetPlayerId === contactState.player.playerId;
      const locked = contactState.lockProgress >= resolveCurrentLockAcquireThreshold();
      const color = locked ? 0xff9d74 : 0x93eaff;
      const width = locked ? 2 : 1.5;
      const alpha = selected ? 0.96 : (0.35 + contactState.lockProgress * 0.5);
      scannerLockOverlay.circle(center.x, center.y, lockRadius);
      scannerLockOverlay.stroke({
        color,
        width,
        alpha,
      });
      const arm = lockRadius + 6;
      const gap = Math.max(4, lockRadius * 0.42);
      scannerLockOverlay.moveTo(center.x - arm, center.y - lockRadius);
      scannerLockOverlay.lineTo(center.x - gap, center.y - lockRadius);
      scannerLockOverlay.moveTo(center.x + gap, center.y - lockRadius);
      scannerLockOverlay.lineTo(center.x + arm, center.y - lockRadius);
      scannerLockOverlay.moveTo(center.x - arm, center.y + lockRadius);
      scannerLockOverlay.lineTo(center.x - gap, center.y + lockRadius);
      scannerLockOverlay.moveTo(center.x + gap, center.y + lockRadius);
      scannerLockOverlay.lineTo(center.x + arm, center.y + lockRadius);
      scannerLockOverlay.stroke({
        color,
        width: width + 0.2,
        alpha,
        cap: "round",
      });
    }
  };

  const drawWeaponEngagementHud = (
    frame: ResolvedSimulationFrame,
    deltaSeconds: number,
  ): void => {
    if (!hudVisible || !selfPlayerId) {
      clearWeaponEngagementHud();
      return;
    }

    const selfPlayer = frame.players.find((player) => player.playerId === selfPlayerId);
    if (
      !selfPlayer ||
      selfPlayer.life?.alive === false ||
      !selfPlayer.scanner
    ) {
      clearWeaponEngagementHud();
      return;
    }

    const weaponRange = resolveCurrentWeaponRange();
    const requiredLockProgress = resolveCurrentLockAcquireThreshold();
    const contactStates = collectScannerContactStates(frame, selfPlayer)
      .filter((contact) =>
        contact.visible &&
        contact.distance <= weaponRange &&
        contact.lockProgress >= requiredLockProgress,
      );
    const prioritizedContacts = selectedTargetPlayerId
      ? contactStates.filter((contact) => contact.player.playerId === selectedTargetPlayerId)
      : contactStates;
    const activeContacts = prioritizedContacts.length > 0
      ? prioritizedContacts
      : contactStates;
    const activeTargets = activeContacts.map((contact) => ({
      id: contact.player.playerId,
      position: {
        x: contact.player.renderX,
        y: contact.player.renderY,
      },
    }));

    updateWeaponEngagementStates(
      localWeaponEngagementStates,
      activeTargets,
      localWeaponArmed,
      localWeaponMode === "disintegrator"
        ? COMBAT_BALANCE.disintegrator.engageRampUpPerSecond
        : COMBAT_BALANCE.disruptor.engageRampUpPerSecond,
      localWeaponMode === "disintegrator"
        ? COMBAT_BALANCE.disintegrator.engageDecayPerSecond
        : COMBAT_BALANCE.disruptor.engageDecayPerSecond,
      deltaSeconds,
    );

    const spriteInfo = worldPresenter.getPlayerSpriteInfo(selfPlayerId);
    const shipPosition = spriteInfo
      ? { x: spriteInfo.worldX, y: spriteInfo.worldY }
      : { x: selfPlayer.renderX, y: selfPlayer.renderY };
    drawDisintegratorEngagementLines(
      weaponEngagementOverlay,
      shipPosition,
      activeTargets,
      localWeaponArmed && localWeaponFiring,
      localWeaponEngagementStates,
      localWeaponMode,
    );
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
    const cloaked = localCloakActive;
    const previewInput = cloaked ? COAST_ONLY_FLIGHT_INPUT : input;

    // Derive velocity heading from the sprite's already-smoothed rotation.
    // Sprite rotation = heading + π/2, so we reverse that offset.
    const velocityHeading = spriteInfo.rotation - Math.PI / 2;

    const blend = Math.min(1, HEADING_DISPLAY_SMOOTHING * tickerDeltaTime);
    smoothedThrottle = lerp(smoothedThrottle, localEngineThrottle, blend);
    const rawThrustHeading = localThrustHeadingRadians;
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
    const previewMode = resolveBurnPreviewMode(previewInput, gravityAcceleration, cloaked);
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
          input: createPredictedInput(previewInput, false),
          steps: FORECAST_STEPS,
          stepSeconds: FORECAST_STEP_SECONDS,
        })
      : [];
    const boostPath =
      previewMode.active && !previewMode.useFullBoostOutput
        ? buildPredictedPath({
            player: selfPlayer,
            celestialBodies: frame.celestialBodies,
            input: createPredictedInput(previewInput, true),
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
      boosted: localSuperBurnActive,
      cloaked,
      cloakChargeFraction: localCloakMaxCharge > 0
        ? localCloakCharge / localCloakMaxCharge
        : 0,
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
        disintegratorFiring:
          localPlayerAlive &&
          localWeaponMode === "disintegrator" &&
          localWeaponFiring,
        shipSystems: localShipSystems,
        weaponArmed: localWeaponArmed,
        weaponMode: localWeaponMode,
        trainingMissionEnabled: false,
        missionActive: false,
        mission: EMPTY_MULTIPLAYER_MISSION_SNAPSHOT,
        warnings,
        audioCueIds: [],
        multiplayerEvents,
        playerVitals: selfPlayerId
          ? {
              health: localHealth,
              maxHealth: localMaxHealth,
              shieldCharge: localShipSystems.defenses.charge,
              shieldMaxCharge: localShipSystems.defenses.maxCharge,
            }
          : null,
        cloak: selfPlayerId
          ? {
              active: localCloakActive,
              charge: localCloakCharge,
              maxCharge: localCloakMaxCharge,
              hotkey: "R",
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
  if (target.baseMaxCharge <= 0) {
    target.baseMaxCharge = maxCharge;
  }
  target.maxCharge = maxCharge;
  target.charge = clamp(source.charge, 0, maxCharge);
}

function getShieldCapacityFraction(
  systems: SimPlayerSystemsSnapshot,
): number {
  const shieldFraction = systems.defenses.maxCharge > 0
    ? systems.defenses.charge / systems.defenses.maxCharge
    : 0;
  const activeShieldCapacityMultiplier =
    systems.boosted === "defenses" ? BOOSTED_SHIELD_CAPACITY_MULTIPLIER : 1;
  return clamp(
    shieldFraction * (activeShieldCapacityMultiplier / BOOSTED_SHIELD_CAPACITY_MULTIPLIER),
    0,
    1,
  );
}

function resolveLocalEngineTelemetry(options: {
  frame: ResolvedSimulationFrame;
  selfPlayer: ResolvedSimPlayerState;
  input: FlightInputState;
  shipSystems: ShipSystemsState;
  cloaked: boolean;
}): LocalEngineTelemetry {
  if (options.selfPlayer.life?.alive === false || options.cloaked) {
    return {
      throttle: 0,
      thrustHeading: null,
      superBurnActive: false,
    };
  }

  const gravityAcceleration = computeNetGravityAcceleration(
    {
      x: options.selfPlayer.renderX,
      y: options.selfPlayer.renderY,
    },
    options.frame.celestialBodies,
  );
  const gravityMagnitude = Math.hypot(gravityAcceleration.x, gravityAcceleration.y);
  let thrustHeading: number | null = null;
  let thrustThrottle = 0;
  let useFullBoostOutput = false;

  if (options.input.eBrakeInput && gravityMagnitude > FORECAST_GRAVITY_EPSILON) {
    thrustHeading = Math.atan2(-gravityAcceleration.y, -gravityAcceleration.x);
    thrustThrottle = 1;
    useFullBoostOutput = true;
  } else if (options.input.gravityDiveInput && gravityMagnitude > FORECAST_GRAVITY_EPSILON) {
    thrustHeading = Math.atan2(gravityAcceleration.y, gravityAcceleration.x);
    thrustThrottle = 1;
    useFullBoostOutput = true;
  } else {
    const speed = Math.hypot(options.selfPlayer.vx, options.selfPlayer.vy);
    const travelHeading = speed > FORECAST_GRAVITY_EPSILON
      ? Math.atan2(options.selfPlayer.vy, options.selfPlayer.vx)
      : options.selfPlayer.heading;
    const directionalThrust = resolveTravelRelativeThrustVector({
      input: options.input,
      progradeHeading: travelHeading,
      lateralHeading: travelHeading,
      progradeRetrogradeIntensity:
        getEngineThrustMultiplier(options.shipSystems) *
        getEngineProgradeRetrogradeThrustScale(),
      lateralIntensity:
        getEngineThrustMultiplier(options.shipSystems) *
        getEngineLateralThrustScale(),
    });
    if (directionalThrust) {
      thrustHeading = directionalThrust.heading;
      thrustThrottle = directionalThrust.throttle;
    }
  }

  const superBurnActive =
    (thrustHeading !== null && useFullBoostOutput) ||
    (thrustHeading !== null &&
      options.input.boostInput &&
      options.shipSystems.boosted === "engines");
  const engineCruiseOutputCeiling = getEngineCruiseOutputCeiling(options.shipSystems);
  const engineOutputCeiling = useFullBoostOutput
    ? getEngineFullBoostMultiplier()
    : superBurnActive
      ? getEngineSuperBurnMultiplier(options.shipSystems)
      : engineCruiseOutputCeiling;
  const engineFuelFraction = getEngineFuelFraction(options.shipSystems);
  if (thrustHeading === null || engineFuelFraction <= 0) {
    return {
      throttle: 0,
      thrustHeading: null,
      superBurnActive: false,
    };
  }

  return {
    throttle: thrustThrottle * engineOutputCeiling,
    thrustHeading,
    superBurnActive,
  };
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
  cloaked = false,
): {
  active: boolean;
  useFullBoostOutput: boolean;
  label: string;
} {
  if (cloaked) {
    return {
      active: false,
      useFullBoostOutput: false,
      label: "",
    };
  }
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
    weaponArmed: player.weaponArmed,
    weaponMode: player.weaponMode,
    weaponFiring: player.weaponFiring,
    weaponDisabledUntilSeconds: 0,
    cloakActive: player.cloakActive,
    cloakCharge: player.cloakCharge,
    cloakMaxCharge: player.cloakMaxCharge,
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
    return contactByPlayerId.get(player.playerId)?.visible === true;
  });

  if (filteredPlayers.length === frame.players.length) {
    return frame;
  }

  return {
    tick: frame.tick,
    players: filteredPlayers,
    celestialBodies: frame.celestialBodies,
    combatEvents: frame.combatEvents,
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
