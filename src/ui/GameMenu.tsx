import type { ReactElement } from "react";
import { useGameMenuState } from "./game-menu-store";

const SOUNDTRACK_URL =
  "https://open.spotify.com/playlist/63DWq99kJe2Vrh9m98lx3L?si=1163534a40ae431b";

export function GameMenu(): ReactElement | null {
  const menuState = useGameMenuState();
  const leftColumnLayout = menuState.layout === "left-column";
  const showExternalLinks = leftColumnLayout;

  if (!menuState.visible) {
    return null;
  }

  return (
    <div className={`game-menu ${leftColumnLayout ? "game-menu--left-column" : ""}`.trim()}>
      <div className="game-menu__scrim" />
      <main
        className={`game-menu__panel game-menu__panel--${menuState.layout}`}
        style={createAccentStyle(menuState.accentColor)}
      >
        {leftColumnLayout ? (
          <div className="game-menu__left-layout">
            <div className="game-menu__left-buttons">
              {menuState.actions.map((action) => (
                <MenuButton
                  key={action.label}
                  action={action}
                  variant="command"
                />
              ))}
              {menuState.footerActions.map((action) => (
                <MenuButton key={action.label} action={action} compact />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="game-menu__eyebrow">NAV / COMMAND</div>
            <h1 className="game-menu__title">{menuState.title}</h1>
            <p className="game-menu__subtitle">{menuState.subtitle}</p>
            {menuState.description ? (
              <p className="game-menu__description">{menuState.description}</p>
            ) : null}

            {menuState.layout === "stack" ? (
              <div className="game-menu__actions">
                {menuState.actions.map((action) => (
                  <MenuButton key={action.label} action={action} />
                ))}
              </div>
            ) : null}

            {menuState.layout === "cards" && menuState.actions.length > 0 ? (
              <div className="game-menu__actions game-menu__actions--tabs">
                {menuState.actions.map((action) => (
                  <MenuButton key={action.label} action={action} compact />
                ))}
              </div>
            ) : null}

            {menuState.layout === "cards" ? (
              <div className="game-menu__cards">
                {menuState.cards.map((card) => (
                  <section
                    key={card.key}
                    className="game-menu__card"
                    style={createAccentStyle(card.accentColor)}
                  >
                    <div className="game-menu__card-eyebrow">{card.eyebrow}</div>
                    <h2 className="game-menu__card-title">{card.title}</h2>
                    <p className="game-menu__card-description">{card.description}</p>
                    <MenuButton action={card.action} />
                  </section>
                ))}
              </div>
            ) : null}

            {menuState.footerActions.length > 0 ? (
              <div className="game-menu__footer">
                {menuState.footerActions.map((action) => (
                  <MenuButton key={action.label} action={action} compact />
                ))}
              </div>
            ) : null}
          </>
        )}
      </main>
      {showExternalLinks ? (
        <div className="game-menu__external-links">
          <a
            className="game-menu__button game-menu__button--compact game-menu__button--link game-menu__button--soundtrack"
            href={SOUNDTRACK_URL}
            target="_blank"
            rel="noreferrer"
          >
            <svg
              className="game-menu__spotify-logo"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="12" fill="#1ed760" />
              <path
                d="M17.8 9.4a.94.94 0 0 1-1.29.3 9.6 9.6 0 0 0-9.4-.9.94.94 0 1 1-.74-1.72 11.5 11.5 0 0 1 11.27 1.06.94.94 0 0 1 .16 1.26Z"
                fill="#0b0f14"
              />
              <path
                d="M16.8 12.2a.78.78 0 0 1-1.08.24 7.9 7.9 0 0 0-7.34-.7.78.78 0 1 1-.58-1.44 9.46 9.46 0 0 1 8.77.83.78.78 0 0 1 .23 1.07Z"
                fill="#0b0f14"
              />
              <path
                d="M15.9 14.8a.62.62 0 0 1-.86.2 6.3 6.3 0 0 0-5.38-.5.62.62 0 0 1-.42-1.17 7.53 7.53 0 0 1 6.43.6.62.62 0 0 1 .23.87Z"
                fill="#0b0f14"
              />
            </svg>
            <span>"Soundtrack" on Spotify</span>
          </a>
          <a
            className="game-menu__button game-menu__button--compact game-menu__button--link"
            href="https://arissmiller.net"
          >
            Back to Projects
          </a>
          <a
            className="game-menu__button game-menu__button--compact game-menu__button--link"
            href="https://github.com/arissmiller/orbital-combat"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      ) : null}
    </div>
  );
}

function MenuButton(props: {
  action: {
    label: string;
    accentColor: string;
    onSelect: () => void;
  };
  compact?: boolean;
  variant?: "default" | "command";
}): ReactElement {
  const { action, compact = false, variant = "default" } = props;
  return (
    <button
      type="button"
      className={[
        "game-menu__button",
        compact ? "game-menu__button--compact" : "",
        variant === "command" ? "game-menu__button--command" : "",
      ].filter((value) => value.length > 0).join(" ")}
      style={createAccentStyle(action.accentColor)}
      onClick={action.onSelect}
    >
      {action.label}
    </button>
  );
}

function createAccentStyle(accentColor: string): Record<string, string> {
  return {
    ["--menu-accent" as string]: accentColor,
    ["--menu-accent-soft" as string]: hexToRgba(accentColor, 0.24),
    ["--menu-accent-faint" as string]: hexToRgba(accentColor, 0.12),
    ["--menu-accent-line" as string]: hexToRgba(accentColor, 0.32),
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
