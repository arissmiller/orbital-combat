import "./styles.css";
import { createRoot } from "react-dom/client";
import { installDevRuntimeLogging } from "./dev/runtime-log";
import { GameApp } from "./ui/GameApp";

const rootElement = document.querySelector("#app");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Expected a root #app element.");
}

installDevRuntimeLogging();

createRoot(rootElement).render(<GameApp />);
