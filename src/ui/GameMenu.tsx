import type { ReactElement } from "react";
import { useGameMenuState } from "./game-menu-store";

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
