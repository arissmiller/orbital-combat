import type { ReactElement } from "react";
import {
  type OverlayBriefingState,
  type OverlayMeterState,
  type OverlayMultiplayerEventState,
  type OverlayMissionStepState,
  type OverlayScoreboardState,
  type OverlaySystemPanelState,
  type OverlayVitalsState,
  useGameOverlayState,
} from "./game-overlay-store";
import { RichGameText } from "./RichGameText";

export function GameOverlay(): ReactElement | null {
  const overlayState = useGameOverlayState();

  if (!overlayState.hudVisible) {
    return null;
  }

  return (
    <div className={`game-overlay ${overlayState.showLeaveGameButton ? "game-overlay--multiplayer" : ""}`}>
      <header className="game-overlay__top">
        <div className="game-overlay__top-center-stack">
          <h1 className="game-overlay__title">{overlayState.title}</h1>
          {overlayState.scoreboard ? (
            <ScoreboardPanel scoreboard={overlayState.scoreboard} />
          ) : null}
        </div>
        <div className="game-overlay__fps">{overlayState.fpsText}</div>
      </header>

      {!overlayState.briefing && overlayState.mission ? (
        <div className="game-overlay__mission-stack">
          {overlayState.mission ? (
            <MissionPanel mission={overlayState.mission} />
          ) : null}
          {overlayState.mission && overlayState.mission.instruction.trim().length > 0 ? (
            <HintPanel mission={overlayState.mission} />
          ) : null}
        </div>
      ) : null}

      {overlayState.briefing ? (
        <div className="game-overlay__briefing-row">
          <BriefingPanel briefing={overlayState.briefing} />
        </div>
      ) : null}

      <div className="game-overlay__bottom">
        {overlayState.warnings.length > 0 && !overlayState.briefing ? (
          <div className="game-overlay__warning-stack">
            {overlayState.warnings.map((warning) => (
              <div
                key={warning.id}
                className="game-overlay__warning-banner"
                style={createWarningStyle(warning.accentColor)}
              >
                {warning.title}
              </div>
            ))}
          </div>
        ) : null}
        {overlayState.multiplayerEvents.length > 0 ? (
          <div className="game-overlay__event-log-row">
            <MultiplayerEventLogPanel events={overlayState.multiplayerEvents} />
          </div>
      ) : null}
        <div className="game-overlay__status-cluster">
          {overlayState.vitals || overlayState.systems.length > 0 ? (
            <div className="game-overlay__ship-status">
              <ShipStatusPanel
                vitals={overlayState.vitals}
                systems={overlayState.systems}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MultiplayerEventLogPanel(props: {
  events: OverlayMultiplayerEventState[];
}): ReactElement {
  const { events } = props;
  return (
    <section
      className="game-panel game-panel--event-log"
      style={createPanelStyle("#ffc86a")}
    >
      <div className="game-panel__badge">Multiplayer Feed</div>
      <div className="game-event-log__entries">
        {events.map((event) => (
          <div
            key={event.id}
            className={`game-event-log__entry game-event-log__entry--${event.tone}`}
          >
            {event.text}
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoreboardPanel(props: {
  scoreboard: OverlayScoreboardState;
}): ReactElement {
  const { scoreboard } = props;
  return (
    <section
      className="game-panel game-panel--scoreboard"
      style={createPanelStyle(scoreboard.accentColor)}
    >
      <div className="game-panel__badge">{scoreboard.title}</div>
      <div className="game-scoreboard__metrics">
        {scoreboard.metrics.map((metric) => (
          <div key={metric.label} className="game-scoreboard__metric">
            <div className="game-scoreboard__label">{metric.label}</div>
            <div className="game-scoreboard__value">{metric.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BriefingPanel(props: {
  briefing: OverlayBriefingState;
}): ReactElement {
  const { briefing } = props;
  const page = briefing.pages[briefing.pageIndex];
  const pageCount = briefing.pages.length;
  const onLastPage = briefing.pageIndex >= pageCount - 1;
  const controlsText = onLastPage
    ? "[LEFT] / [RIGHT] to navigate. [ENTER] to continue."
    : "[LEFT] / [RIGHT] to navigate.";

  return (
    <section
      className="game-panel game-panel--briefing"
      style={createPanelStyle("#8ee8ff")}
    >
      <div className="game-panel__badge">{briefing.title}</div>
      {briefing.subtitle ? (
        <div className="game-briefing__subtitle">{briefing.subtitle}</div>
      ) : null}
      <div className="game-briefing__content">
        <div className="game-briefing__image">
          <BriefingVisual page={page} />
        </div>
        <div className="game-briefing__copy">
          <div className="game-briefing__page-title">{page.title}</div>
          <div className="game-briefing__body">
            <RichGameText text={page.body} />
          </div>
        </div>
      </div>
      <div className="game-briefing__footer">
        <div className="game-briefing__page-indicator">
          Page {briefing.pageIndex + 1}/{pageCount}
        </div>
        <div className="game-briefing__controls">
          <RichGameText text={controlsText} />
        </div>
      </div>
    </section>
  );
}

function BriefingVisual(props: {
  page: OverlayBriefingState["pages"][number];
}): ReactElement {
  const { page } = props;
  switch (page.viewId) {
    case "trajectory-view":
      return (
        <svg
          className="game-briefing__visual-svg"
          viewBox="0 0 320 220"
          role="img"
          aria-label={page.imageLabel ?? "Trajectory View"}
        >
          <defs>
            <radialGradient id="trajectoryGlow" cx="50%" cy="45%" r="62%">
              <stop offset="0%" stopColor="#12304a" />
              <stop offset="100%" stopColor="#08131d" />
            </radialGradient>
          </defs>
          <rect width="320" height="220" rx="12" fill="url(#trajectoryGlow)" />
          <circle cx="110" cy="110" r="22" fill="#264f70" stroke="#9fdcff" strokeWidth="2" />
          <circle
            cx="110"
            cy="110"
            r="72"
            fill="none"
            stroke="#5aa8d8"
            strokeOpacity="0.42"
            strokeWidth="1.5"
          />
          <path
            d="M 196 62 C 242 84, 252 122, 228 151 C 206 178, 162 183, 128 160"
            fill="none"
            stroke="#8ee8ff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="196" cy="62" r="4.2" fill="#d8f7ff" />
          <circle cx="128" cy="160" r="4.2" fill="#d8f7ff" />
          <text x="18" y="202" fill="#9ec5db" fontSize="12" fontFamily="Menlo, Monaco, monospace">
            Coast path projection
          </text>
        </svg>
      );
    case "burn-forecast":
      return (
        <svg
          className="game-briefing__visual-svg"
          viewBox="0 0 320 220"
          role="img"
          aria-label={page.imageLabel ?? "Burn Forecast"}
        >
          <rect width="320" height="220" rx="12" fill="#08131d" />
          <circle cx="88" cy="112" r="26" fill="#214765" stroke="#8ecbf1" strokeWidth="2" />
          <path
            d="M 126 102 C 172 90, 220 108, 258 148"
            fill="none"
            stroke="#79dfff"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M 126 102 C 176 75, 231 87, 277 125"
            fill="none"
            stroke="#ffd170"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 126 102 C 180 56, 248 56, 299 95"
            fill="none"
            stroke="#ffc053"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            strokeLinecap="round"
          />
          <text x="168" y="165" fill="#9ec5db" fontSize="11.5" fontFamily="Menlo, Monaco, monospace">
            cyan coast / yellow burn / dashed boost
          </text>
        </svg>
      );
    case "energy-maneuvers":
      return (
        <svg
          className="game-briefing__visual-svg"
          viewBox="0 0 320 220"
          role="img"
          aria-label={page.imageLabel ?? "Energy Maneuvers"}
        >
          <rect width="320" height="220" rx="12" fill="#08131d" />
          <circle cx="160" cy="112" r="34" fill="#233f5a" stroke="#9fdcff" strokeWidth="2" />
          <circle
            cx="160"
            cy="112"
            r="82"
            fill="none"
            stroke="#6da6ce"
            strokeOpacity="0.4"
            strokeWidth="1.6"
          />
          <path
            d="M 116 148 C 98 168, 88 188, 86 202"
            fill="none"
            stroke="#89ffd0"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 204 76 C 228 56, 242 38, 246 20"
            fill="none"
            stroke="#ffcc72"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <polygon points="81,199 95,200 88,210" fill="#89ffd0" />
          <polygon points="250,18 241,30 255,30" fill="#ffcc72" />
          <text x="20" y="34" fill="#ffcc72" fontSize="12" fontFamily="Menlo, Monaco, monospace">
            Climb
          </text>
          <text x="20" y="204" fill="#89ffd0" fontSize="12" fontFamily="Menlo, Monaco, monospace">
            Dive
          </text>
        </svg>
      );
    default:
      return (
        <div className="game-briefing__image-label">
          {page.imageLabel ?? "Screenshot Placeholder"}
        </div>
      );
  }
}

function ShipStatusPanel(props: {
  vitals: OverlayVitalsState | null;
  systems: OverlaySystemPanelState[];
}): ReactElement {
  const { vitals, systems } = props;
  const focusedSystemKey = systems.find((system) => system.boosted)?.key ?? null;
  const defensesBoosted = systems.find((system) => system.key === "defenses")?.boosted ?? false;
  const enginesSystem = systems.find((system) => system.key === "engines");
  const weaponsSystem = systems.find((system) => system.key === "weapons");
  const enginesMeter = enginesSystem
    ? enginesSystem.meters[Math.max(enginesSystem.meters.length - 1, 0)] ?? null
    : null;
  const weaponsMeter = weaponsSystem?.meters[0] ?? null;
  const healthFraction = vitals && vitals.maxHealth > 0 ? vitals.health / vitals.maxHealth : 0;
  const shieldFraction = vitals && vitals.shieldMaxCharge > 0
    ? vitals.shieldCharge / vitals.shieldMaxCharge
    : 0;
  const enginesFraction = enginesMeter ? enginesMeter.value : 0;
  const weaponsFraction = weaponsMeter ? weaponsMeter.value : 0;
  const boostedShieldCapacityMultiplier = 1.5;
  const activeShieldCapacityMultiplier = defensesBoosted ? boostedShieldCapacityMultiplier : 1;
  const effectiveShieldCapacityFraction = Math.max(
    0,
    Math.min(
      1,
      shieldFraction * (activeShieldCapacityMultiplier / boostedShieldCapacityMultiplier),
    ),
  );
  const healthColor = healthFraction > 0.6 ? "#6ae78c" : healthFraction > 0.3 ? "#ffbd59" : "#ff7b72";
  const enginesColor = enginesMeter?.fillColor ?? "#ffbd59";
  const weaponsColor = weaponsMeter?.fillColor ?? "#ff7b72";
  const focusedLabel = formatFocusedSystemLabel(focusedSystemKey);
  const hullValueText = vitals
    ? `${Math.round(vitals.health)} / ${Math.round(vitals.maxHealth)}`
    : "N/A";
  const shieldValueText = vitals
    ? `${Math.round(effectiveShieldCapacityFraction * 100)}% CAP`
    : "N/A";
  const enginesValueText = enginesMeter
    ? `${Math.round(clamp01(enginesFraction) * 100)}% CHG`
    : "N/A";
  const weaponsValueText = weaponsMeter
    ? `${Math.round(clamp01(weaponsFraction) * 100)}% CHG`
    : "N/A";

  return (
    <section
      className="game-panel game-panel--ship-status"
      style={{
        ...createPanelStyle("#78e8ff"),
        ["--vitals-health-color" as string]: healthColor,
        ["--vitals-shield-color" as string]: "#78e8ff",
        ["--vitals-engines-color" as string]: enginesColor,
        ["--vitals-weapons-color" as string]: weaponsColor,
      }}
    >
      <div className="game-panel__badge">Ship Status</div>
      <div className="game-vitals__focus-line">
        Focus: <span className="game-vitals__focus-value">{focusedLabel}</span>
      </div>
      <div className="game-vitals__groups">
        <div className="game-vitals__group game-vitals__group--health">
          <div className="game-vitals__row">
            <span className="game-vitals__label">Hull</span>
            <span className="game-vitals__value">{hullValueText}</span>
          </div>
          <Meter
            meter={{
              value: healthFraction,
              fillColor: healthColor,
              backgroundColor: "#17202b",
            }}
          />
        </div>
        <div
          className={`game-vitals__group game-vitals__group--shield ${
            focusedSystemKey === "defenses" ? "is-focused" : ""
          }`}
        >
          <div className="game-vitals__row">
            <span className="game-vitals__label-wrap">
              <span className="game-vitals__label">Shield</span>
              {focusedSystemKey === "defenses" ? (
                <span className="game-vitals__focus-pill">Focus</span>
              ) : null}
            </span>
            <span className="game-vitals__value">{shieldValueText}</span>
          </div>
          <Meter
            meter={{
              value: effectiveShieldCapacityFraction,
              fillColor: defensesBoosted ? "#78e8ff" : "#4ea7c5",
              backgroundColor: "#0d1e2e",
            }}
          />
        </div>
        <div
          className={`game-vitals__group game-vitals__group--engines ${
            focusedSystemKey === "engines" ? "is-focused" : ""
          }`}
        >
          <div className="game-vitals__row">
            <span className="game-vitals__label-wrap">
              <span className="game-vitals__label">Engines</span>
              {focusedSystemKey === "engines" ? (
                <span className="game-vitals__focus-pill">Focus</span>
              ) : null}
            </span>
            <span className="game-vitals__value">{enginesValueText}</span>
          </div>
          <Meter
            meter={{
              value: enginesFraction,
              fillColor: enginesMeter?.fillColor ?? "#ffbd59",
              backgroundColor: enginesMeter?.backgroundColor ?? "#2c2212",
            }}
          />
        </div>
        <div
          className={`game-vitals__group game-vitals__group--weapons ${
            focusedSystemKey === "weapons" ? "is-focused" : ""
          }`}
        >
          <div className="game-vitals__row">
            <span className="game-vitals__label-wrap">
              <span className="game-vitals__label">Weapons</span>
              {focusedSystemKey === "weapons" ? (
                <span className="game-vitals__focus-pill">Focus</span>
              ) : null}
            </span>
            <span className="game-vitals__value">{weaponsValueText}</span>
          </div>
          <Meter
            meter={{
              value: weaponsFraction,
              fillColor: weaponsMeter?.fillColor ?? "#ff7b72",
              backgroundColor: weaponsMeter?.backgroundColor ?? "#2d1519",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function formatFocusedSystemLabel(systemKey: string | null): string {
  switch (systemKey) {
    case "engines":
      return "Engines";
    case "scanners":
      return "Scanners";
    case "weapons":
      return "Weapons";
    case "defenses":
      return "Shield";
    default:
      return "None";
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function MissionPanel(props: {
  mission: {
    title: string;
    accentColor: string;
    subtitle: string;
    steps: OverlayMissionStepState[];
    instruction: string;
    progress: number;
  };
}): ReactElement {
  const { mission } = props;
  return (
    <section
      className="game-panel game-panel--mission"
      style={createPanelStyle(mission.accentColor)}
    >
      <div className="game-panel__badge">{mission.title}</div>
      <div className="game-mission__subtitle">{mission.subtitle}</div>
      <div className="game-mission__steps">
        {mission.steps.map((step, index) => (
          <div
            key={`${step.label}-${index}`}
            className={`game-mission__step ${step.completed ? "is-complete" : step.active ? "is-active" : ""}`}
          >
            <span className="game-mission__step-marker">
              {step.completed ? "✓" : step.active ? ">" : "•"}
            </span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
      <Meter
        meter={{
          value: mission.progress,
          fillColor: mission.accentColor,
          backgroundColor: "#17202b",
        }}
      />
    </section>
  );
}

function HintPanel(props: {
  mission: {
    accentColor: string;
    instruction: string;
  };
}): ReactElement {
  const { mission } = props;
  return (
    <section
      className="game-panel game-panel--hint"
      style={createPanelStyle(mission.accentColor)}
    >
      <div className="game-panel__badge">Hint</div>
      <div className="game-mission__instruction">
        <RichGameText text={mission.instruction} />
      </div>
    </section>
  );
}

function createPanelStyle(accentColor: string): Record<string, string> {
  return {
    ["--panel-accent" as string]: accentColor,
    ["--panel-accent-soft" as string]: hexToRgba(accentColor, 0.28),
    ["--panel-accent-faint" as string]: hexToRgba(accentColor, 0.12),
    ["--panel-accent-line" as string]: hexToRgba(accentColor, 0.3),
  };
}

function createWarningStyle(accentColor: string): Record<string, string> {
  return {
    ["--warning-accent" as string]: accentColor,
    ["--warning-accent-strong" as string]: hexToRgba(accentColor, 0.8),
    ["--warning-accent-soft" as string]: hexToRgba(accentColor, 0.42),
    ["--warning-accent-faint" as string]: hexToRgba(accentColor, 0.12),
  };
}

function hexToRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");
  const color = normalized.length === 3
    ? normalized
        .split("")
        .map((character) => `${character}${character}`)
        .join("")
    : normalized.padStart(6, "0").slice(0, 6);
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function Meter(props: { meter: OverlayMeterState }): ReactElement {
  const { meter } = props;
  return (
    <div
      className="game-meter"
      style={{ ["--meter-fill" as string]: meter.fillColor, ["--meter-bg" as string]: meter.backgroundColor }}
    >
      <div
        className="game-meter__fill"
        style={{ width: `${Math.max(0, Math.min(1, meter.value)) * 100}%` }}
      />
    </div>
  );
}
