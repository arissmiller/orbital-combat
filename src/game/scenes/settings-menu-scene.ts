import {
  resetGameMenuState,
  setGameMenuState,
  type MenuCardState,
} from "../../ui/game-menu-store";
import type { SceneContext, SceneHandle } from "./scene-manager";

type SettingsTabId = "keybindings" | "graphics" | "audio";

interface SettingsTabConfig {
  id: SettingsTabId;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  cards: MenuCardState[];
}

const SETTINGS_TABS: readonly SettingsTabConfig[] = [
  {
    id: "keybindings",
    title: "Settings",
    subtitle: "Keybindings",
    description:
      "Core flight and combat bindings. Start with rebinding the most-used inputs first so testers can adapt quickly.",
    accentColor: "#8ee8ff",
    cards: [
      createDraftCard(
        "keybindings-flight",
        "FLIGHT",
        "Flight Controls",
        "Prograde [W], Retrograde [S], Lateral [A]/[D], Climb [Space], Dive [C], Boost [Shift].",
        "#8ee8ff",
      ),
      createDraftCard(
        "keybindings-combat",
        "COMBAT",
        "Combat Controls",
        "Arm Weapons [F], Switch Weapon Mode [G], Focus Subsystems [1-4].",
        "#9ebdff",
      ),
      createDraftCard(
        "keybindings-interface",
        "INTERFACE",
        "Interface + Mission",
        "Advance Briefing [Enter], Next/Prev Briefing [Right]/[Left], Pause [Esc], Restart [R], Tactical View [M].",
        "#89d4be",
      ),
    ],
  },
  {
    id: "graphics",
    title: "Settings",
    subtitle: "Graphics",
    description:
      "This game is intentionally readable and lightweight. Keep graphics controls focused on clarity and performance for playtests.",
    accentColor: "#9ebdff",
    cards: [
      createDraftCard(
        "graphics-display",
        "DISPLAY",
        "Display",
        "Window mode, resolution scale, and VSync. Add these first for compatibility across testers' hardware.",
        "#9ebdff",
      ),
      createDraftCard(
        "graphics-visibility",
        "READABILITY",
        "Visibility + HUD",
        "HUD scale, celestial name tags, orbital guide intensity, and warning flash intensity.",
        "#8ee8ff",
      ),
      createDraftCard(
        "graphics-performance",
        "PERFORMANCE",
        "Performance Profile",
        "Simple presets: Performance, Balanced, and Quality. With current visuals, this should be enough.",
        "#89d4be",
      ),
    ],
  },
  {
    id: "audio",
    title: "Settings",
    subtitle: "Audio",
    description:
      "Audio buses already exist in-engine. The draft should expose top-level controls and a few practical submixes.",
    accentColor: "#89d4be",
    cards: [
      createDraftCard(
        "audio-master",
        "MIXER",
        "Master + Mix",
        "Master volume and mute. Submix sliders for Engines, Weapons, Warnings, and Background/Music.",
        "#89d4be",
      ),
      createDraftCard(
        "audio-cues",
        "WARNINGS",
        "Warning Cue Behavior",
        "Warning volume trim and optional cooldown tuning for repetitive alerts.",
        "#8ee8ff",
      ),
      createDraftCard(
        "audio-accessibility",
        "ACCESSIBILITY",
        "Accessibility Audio",
        "Toggle audio ducking for mission briefings and boost warning cue prominence.",
        "#9ebdff",
      ),
    ],
  },
];

export function mountSettingsMenuScene(context: SceneContext): SceneHandle {
  let activeTab: SettingsTabId = "keybindings";
  let disposed = false;

  const render = () => {
    if (disposed) {
      return;
    }
    const tab = SETTINGS_TABS.find((candidate) => candidate.id === activeTab)
      ?? SETTINGS_TABS[0];
    const inactiveAccent = "#4f657e";

    setGameMenuState({
      visible: true,
      title: tab.title,
      subtitle: tab.subtitle,
      description: tab.description,
      accentColor: tab.accentColor,
      layout: "cards",
      actions: SETTINGS_TABS.map((candidate) => ({
        label: candidate.id === "keybindings"
          ? "Keybindings"
          : candidate.id === "graphics"
            ? "Graphics"
            : "Audio",
        accentColor: candidate.id === tab.id
          ? candidate.accentColor
          : inactiveAccent,
        onSelect: () => {
          activeTab = candidate.id;
          render();
        },
      })),
      cards: tab.cards,
      footerActions: [
        {
          label: "Back",
          accentColor: "#7fc7ff",
          onSelect: () => context.load("main-menu"),
        },
      ],
    });
  };

  render();

  return {
    dispose() {
      disposed = true;
      resetGameMenuState();
    },
  };
}

function createDraftCard(
  key: string,
  eyebrow: string,
  title: string,
  description: string,
  accentColor: string,
): MenuCardState {
  return {
    key,
    eyebrow,
    title,
    description,
    accentColor,
    action: {
      label: "Drafted",
      accentColor,
      onSelect: () => {
        // Placeholder: this draft menu is intentionally informational for now.
      },
    },
  };
}
