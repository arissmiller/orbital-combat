import type { ReactElement } from "react";
import {
  type OverlayBriefingState,
  type OverlayMeterState,
  type OverlayMissionStepState,
  type OverlayScoreboardState,
  type OverlaySystemPanelState,
  useGameOverlayState,
} from "./game-overlay-store";
import { RichGameText } from "./RichGameText";

export function GameOverlay(): ReactElement | null {
  const overlayState = useGameOverlayState();

  if (!overlayState.hudVisible) {
    return null;
  }

  return (
    <div className="game-overlay">
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
        <div className="game-overlay__systems">
          {overlayState.systems.map((system) => (
            <SystemPanel key={system.key} system={system} />
          ))}
        </div>
      </div>
    </div>
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
          <div className="game-briefing__image-label">
            {page.imageLabel ?? "Screenshot Placeholder"}
          </div>
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

function SystemPanel(props: {
  system: OverlaySystemPanelState;
}): ReactElement {
  const { system } = props;
  return (
    <section
      className={`game-panel game-panel--system ${system.boosted ? "game-panel--boosted" : ""}`}
      style={createPanelStyle(system.accentColor)}
    >
      <div className="game-panel__badge">{system.title}</div>
      <div className="game-panel__meters">
        {system.meters.map((meter, index) => (
          <Meter key={`${system.key}-${index}`} meter={meter} />
        ))}
      </div>
    </section>
  );
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
