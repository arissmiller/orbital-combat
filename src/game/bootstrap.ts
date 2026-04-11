import { Application } from "pixi.js";
import { resolveInitialSceneId } from "./scenes/scene-launch";
import { SceneManager } from "./scenes/scene-manager";

export interface GameRuntime {
  app: Application;
  scenes: SceneManager;
  dispose(): void;
}

export async function bootstrapGame(container: Element | null): Promise<GameRuntime> {
  if (!(container instanceof HTMLElement)) {
    throw new Error("Expected a root #app element for the game bootstrap.");
  }

  const app = new Application();
  await app.init({
    antialias: true,
    autoDensity: true,
    resizeTo: window,
    backgroundAlpha: 0,
  });

  container.replaceChildren(app.canvas);
  const scenes = new SceneManager(app);
  scenes.load(resolveInitialSceneId());

  return {
    app,
    scenes,
    dispose() {
      scenes.dispose();
      app.destroy(true, {
        children: true,
        texture: false,
      });
    },
  };
}
