import { COMBAT_BALANCE } from "../game/combat/combat-balance";
import type { MissionRuntimeSnapshot } from "../game/missions/mission-runtime";
import type { GameWarningState } from "../game/warnings/game-warning-manager";
import type { ShipSystemsState } from "../game/ships/systems";
import {
  getEngineSuperBurnMultiplier,
} from "../game/ships/systems";
import type {
  GameOverlayState,
  OverlayMultiplayerEventState,
  OverlayScoreboardState,
  OverlaySystemPanelState,
  OverlayVitalsState,
} from "./game-overlay-store";

type PlayerWeaponMode = "disintegrator" | "disruptor";
type ShipSystemPanelKey = "engines" | "scanners" | "weapons" | "defenses";

interface BuildPrototypeHudStateOptions {
  hudVisible: boolean;
  showLeaveGameButton?: boolean;
  isCrashed: boolean;
  title: string;
  fpsSmoothed: number;
  scoreboardVisible: boolean;
  scoreboardTimeSeconds: number;
  scoreboardTargetsDestroyed: number;
  engineThrottle: number;
  engineThrustHeadingRadians: number | null;
  disintegratorFiring: boolean;
  shipSystems: ShipSystemsState;
  weaponArmed: boolean;
  weaponMode: PlayerWeaponMode;
  trainingMissionEnabled: boolean;
  missionActive: boolean;
  mission: MissionRuntimeSnapshot;
  warnings: readonly GameWarningState[];
  audioCueIds: readonly string[];
  playerVitals?: OverlayVitalsState | null;
  multiplayerEvents?: readonly OverlayMultiplayerEventState[];
}

const SYSTEM_PANEL_CONFIG: readonly {
  key: ShipSystemPanelKey;
  label: string;
  hotkey: string;
  accent: number;
}[] = [
  { key: "engines", label: "ENG", hotkey: "1", accent: 0xffbd59 },
  { key: "scanners", label: "SCN", hotkey: "2", accent: 0x78e8ff },
  { key: "weapons", label: "WEP", hotkey: "3", accent: 0xff6a5c },
  { key: "defenses", label: "DEF", hotkey: "4", accent: 0x6ae78c },
] as const;

const TRAINING_HINT_OBJECTIVE_LIMIT = 4;

export function buildPrototypeHudState(
  options: BuildPrototypeHudStateOptions,
): GameOverlayState {
  const weaponAccent = getWeaponAccentColor(options.weaponMode);
  const weaponChargeFraction = options.shipSystems.weapons.maxCharge > 0
    ? options.shipSystems.weapons.charge / options.shipSystems.weapons.maxCharge
    : 0;
  const engineOutputLevel = getEngineOutputLevel(
    options.shipSystems,
    options.engineThrottle,
  );

  return {
    hudVisible: options.hudVisible && !options.isCrashed,
    showLeaveGameButton: options.showLeaveGameButton ?? false,
    title: options.title,
    fpsText: `${options.fpsSmoothed.toFixed(0)} FPS`,
    scoreboard: options.scoreboardVisible
      ? buildScoreboardState(
          options.scoreboardTimeSeconds,
          options.scoreboardTargetsDestroyed,
        )
      : null,
    briefing: options.mission.control.briefing
      ? {
          title: options.mission.control.briefing.title,
          subtitle: options.mission.control.briefing.subtitle,
          pages: options.mission.control.briefing.pages.map((page) => ({
            title: page.title,
            body: page.body,
            imageLabel: page.imageLabel,
            viewId: page.viewId,
          })),
          pageIndex: options.mission.control.briefing.pageIndex,
        }
      : null,
    mission: options.missionActive
      ? {
          title: "Mission",
          accentColor: colorToCssHex(
            options.mission.completed ? 0x74f0b4 : 0x8ee8ff,
          ),
          subtitle: options.mission.subtitle,
          steps: options.mission.steps,
          instruction:
            !options.mission.completed &&
            (!options.trainingMissionEnabled ||
              options.mission.completedSteps < TRAINING_HINT_OBJECTIVE_LIMIT)
              ? options.mission.currentInstruction
              : "",
          progress: options.mission.currentProgress,
        }
      : null,
    warnings: options.warnings.map((warning) => ({
      id: warning.id,
      title: warning.title,
      accentColor: warning.accentColor,
      message: warning.message,
    })),
    audioCues: options.audioCueIds.map((id) => ({ id })),
    engineAudio: {
      outputLevel: options.hudVisible && !options.isCrashed ? engineOutputLevel : 0,
      boosted: options.shipSystems.boosted === "engines",
      thrustHeadingRadians: options.engineThrustHeadingRadians,
    },
    weaponAudio: {
      disintegratorFiring:
        options.disintegratorFiring && !options.isCrashed,
    },
    systems: buildSystemPanels(
      options.shipSystems,
      options.engineThrottle,
      options.weaponMode,
      options.weaponArmed,
      options.trainingMissionEnabled,
    ),
    vitals: options.playerVitals ?? null,
    multiplayerEvents: [...(options.multiplayerEvents ?? [])],
  };
}

function buildSystemPanels(
  shipSystems: ShipSystemsState,
  engineThrottle: number,
  weaponMode: PlayerWeaponMode,
  weaponArmed: boolean,
  trainingMissionEnabled: boolean,
): OverlaySystemPanelState[] {
  const visiblePanels = trainingMissionEnabled
    ? SYSTEM_PANEL_CONFIG.filter((panel) => panel.key === "engines")
    : SYSTEM_PANEL_CONFIG;

  return visiblePanels.map((panel) => {
    const boosted = shipSystems.boosted === panel.key;
    const systemState = shipSystems[panel.key];
    const accentColor = colorToCssHex(boosted ? panel.accent : 0x557188);

    if (panel.key === "engines") {
      const outputFraction = getEngineOutputLevel(shipSystems, engineThrottle);
      return {
        key: panel.key,
        title: `${panel.hotkey} ${panel.label}`,
        accentColor,
        boosted,
        meters: [
          {
            value: outputFraction,
            fillColor: colorToCssHex(0xffc86a),
            backgroundColor: colorToCssHex(0x2c2212),
          },
          {
            value: systemState.maxCharge > 0
              ? systemState.charge / systemState.maxCharge
              : 0,
            fillColor: colorToCssHex(boosted ? panel.accent : 0x6f8797),
            backgroundColor: colorToCssHex(0x17202b),
          },
        ],
      };
    }

    if (panel.key === "weapons") {
      return {
        key: panel.key,
        title: `${panel.hotkey} ${panel.label}`,
        accentColor,
        boosted,
        meters: [
          {
            value: systemState.maxCharge > 0
              ? systemState.charge / systemState.maxCharge
              : 0,
            fillColor: colorToCssHex(
              weaponArmed ? getWeaponAccentColor(weaponMode) : 0xd46a60,
            ),
            backgroundColor: colorToCssHex(
              weaponMode === "disintegrator" ? 0x2d1519 : 0x1f1d35,
            ),
          },
        ],
      };
    }

    return {
      key: panel.key,
      title: `${panel.hotkey} ${panel.label}`,
      accentColor,
      boosted,
      meters: [
        {
          value: systemState.maxCharge > 0
            ? systemState.charge / systemState.maxCharge
            : 0,
          fillColor: colorToCssHex(boosted ? panel.accent : 0x6f8797),
          backgroundColor: colorToCssHex(0x17202b),
        },
      ],
    };
  });
}

function getEngineOutputLevel(
  shipSystems: ShipSystemsState,
  engineThrottle: number,
): number {
  return Math.min(
    1,
    engineThrottle / getEngineSuperBurnMultiplier(shipSystems),
  );
}

function buildScoreboardState(
  elapsedSeconds: number,
  targetsDestroyed: number,
): OverlayScoreboardState {
  return {
    title: "Range Score",
    accentColor: colorToCssHex(0x8ee8ff),
    metrics: [
      {
        label: "Time",
        value: formatScoreboardTime(elapsedSeconds),
      },
      {
        label: "Targets",
        value: targetsDestroyed.toString(),
      },
    ],
  };
}

function formatScoreboardTime(totalSeconds: number): string {
  const clampedSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = Math.floor(clampedSeconds % 60);
  const centiseconds = Math.floor((clampedSeconds - Math.floor(clampedSeconds)) * 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

function getWeaponAccentColor(mode: PlayerWeaponMode): number {
  return mode === "disintegrator" ? 0xff7b72 : 0x8b9bff;
}

function colorToCssHex(color: number): string {
  return `#${Math.max(0, Math.min(0xffffff, color)).toString(16).padStart(6, "0")}`;
}

export function getPrototypeHudWeaponOutputPerSecond(
  weaponMode: PlayerWeaponMode,
): number {
  return weaponMode === "disintegrator"
    ? COMBAT_BALANCE.disintegrator.dischargePerSecond
    : COMBAT_BALANCE.disruptor.dischargePerSecond;
}
