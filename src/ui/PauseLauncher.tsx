import { requestPauseMenuToggle } from "./dev-tools-store";
import { useGameMenuState } from "./game-menu-store";

export function PauseLauncher() {
  const menuState = useGameMenuState();

  if (menuState.visible) {
    return null;
  }

  return (
    <button
      type="button"
      className="game-pause-launcher"
      aria-label="Open pause menu"
      onClick={() => {
        requestPauseMenuToggle();
      }}
    >
      <span className="game-pause-launcher__line" />
      <span className="game-pause-launcher__line" />
      <span className="game-pause-launcher__line" />
    </button>
  );
}
