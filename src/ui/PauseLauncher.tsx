import { useState } from "react";
import { requestPauseMenuToggle } from "./dev-tools-store";
import { useGameMenuState } from "./game-menu-store";
import { useGameOverlayState } from "./game-overlay-store";

export function PauseLauncher() {
  const menuState = useGameMenuState();
  const overlayState = useGameOverlayState();
  const [confirmVisible, setConfirmVisible] = useState(false);

  if (menuState.visible) {
    return null;
  }

  if (overlayState.showLeaveGameButton) {
    return (
      <div className="game-leave-launcher">
        <button
          type="button"
          className="game-leave-button"
          onClick={() => setConfirmVisible(true)}
        >
          Leave Game
        </button>
        {confirmVisible ? (
          <div className="game-leave-confirm">
            <div className="game-leave-confirm__prompt">Leave game?</div>
            <div className="game-leave-confirm__actions">
              <button
                type="button"
                className="game-leave-confirm__btn game-leave-confirm__btn--cancel"
                onClick={() => setConfirmVisible(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="game-leave-confirm__btn game-leave-confirm__btn--leave"
                onClick={() => {
                  setConfirmVisible(false);
                  requestPauseMenuToggle();
                }}
              >
                Leave
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
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
