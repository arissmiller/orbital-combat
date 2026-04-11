import {
  createAureliaCombatRangeLayout,
  createAureliaDisintegratorRangeLayout,
  createHelionWeaponsTutorialLayout,
  createNadirGateRunLayout,
  createOrbitalFlightTrainingLayout,
} from "../maps/prototype-maps";
import {
  type ScenarioDefinition,
} from "./scenario-definition";

export const ORBITAL_FLIGHT_TRAINING_SCENARIO_ID = "orbital-flight-training";
export const HELION_WEAPONS_TUTORIAL_SCENARIO_ID = "helion-weapons-training";
export const AURELIA_DISINTEGRATOR_RANGE_SCENARIO_ID = "aurelia-disintegrator-range";
export const NADIR_GATE_RUN_SCENARIO_ID = "nadir-gate-run";
export const AURELIA_COMBAT_RANGE_SCENARIO_ID = "aurelia-combat-range";

export const ORBITAL_FLIGHT_TRAINING_SCENARIO: ScenarioDefinition = {
  id: ORBITAL_FLIGHT_TRAINING_SCENARIO_ID,
  presentation: {
    name: "Orbital Flight Training",
    description:
      "Learn orbital fundamentals, transfer cleanly between systems, and hold Vesta's high lane long enough to receive a fuel drone.",
    difficulty: "tutorial",
    tags: ["training", "navigation", "fundamentals"],
    eyebrow: "Tutorial",
    accentColor: "#8ee8ff",
    sortOrder: 10,
  },
  map: createOrbitalFlightTrainingLayout(),
  mission: {
    runtime: {
      logicId: "orbital-flight-training",
    },
    factions: [
      {
        id: "academy",
        label: "Academy Control",
        team: "friendly",
        accentColor: "#8ee8ff",
        description:
          "Guides the pilot through orbital fundamentals and logistics support.",
      },
      {
        id: "hostiles",
        label: "Hostile Defenses",
        team: "hostile",
        accentColor: "#ff7b72",
        description:
          "Training-opposition launchers and batteries providing live pressure.",
      },
    ],
    supportLinks: [
      {
        id: "vesta-fuel-support",
        label: "Vesta Fuel Support",
        kind: "logistics",
        source: { kind: "system", id: "vesta-refinery" },
        target: { kind: "spawn", id: "player" },
        activeAtStart: true,
        description:
          "Vesta can launch a fuel drone once the player stabilizes in the correct orbital service lane.",
      },
    ],
    objectives: [
      {
        id: "complete-fundamentals",
        title: "Complete the orbital fundamentals course",
        kind: "hold",
        primary: true,
        visibleAtStart: true,
        successWhen: [
          {
            kind: "flag-state",
            flag: "training.phase",
            value: "transfer",
          },
        ],
      },
      {
        id: "transfer-to-vesta",
        title: "Transfer to Vesta",
        kind: "reach",
        primary: true,
        visibleAtStart: true,
        dependsOn: ["complete-fundamentals"],
        successWhen: [
          {
            kind: "flag-state",
            flag: "training.step",
            value: "vesta-fuel-lane",
          },
        ],
      },
      {
        id: "receive-fuel-drone",
        title: "Hold the Vesta service lane and receive fuel",
        kind: "refuel",
        primary: true,
        visibleAtStart: true,
        dependsOn: ["transfer-to-vesta"],
        successWhen: [
          {
            kind: "flag-state",
            flag: "training.completed",
            value: true,
          },
        ],
      },
    ],
  },
  encounters: [
    {
      id: "academy-guidance-network",
      label: "Academy Guidance Network",
      factionId: "academy",
      role: "support",
      assets: [
        { kind: "support-link", id: "vesta-fuel-support" },
        { kind: "spawn", id: "player" },
      ],
      description:
        "Friendly training support that watches the player's orbit and dispatches logistics help once the correct lane is held.",
      enabledAtStart: true,
    },
  ],
  authoring: {
    version: 1,
    summary:
      "Baseline flight-training scenario used to teach orbital fundamentals and service-lane behavior.",
    designGoals: [
      "Teach core orbital verbs before layered combat.",
      "Keep mission logic readable enough to convert into generic authored objectives over time.",
    ],
    playtestFocus: [
      "Clarity of transfer guidance from Aurelia to Vesta.",
      "How legible the fuel-drone reward loop feels once the player stabilizes.",
    ],
    editorHints: [
      "This scenario intentionally mixes authored mission data with custom training runtime logic.",
      "Keep Vesta's high lane easy to read when iterating on support timing.",
    ],
    aiPromptSeed:
      "Build tutorial-style orbital missions that reward stable lane holding, transfer timing, and systems awareness rather than twitch piloting.",
  },
};

const HELION_LAUNCHER_MARKER_ANGLE = Math.PI * 0.72;
const HELION_LAUNCHER_MARKER_RADIUS = 166;
const HELION_REQUIRED_TORPEDO_INTERCEPTS = 4;

export const HELION_WEAPONS_TUTORIAL_SCENARIO: ScenarioDefinition = {
  id: HELION_WEAPONS_TUTORIAL_SCENARIO_ID,
  presentation: {
    name: "Helion Weapons Tutorial",
    description:
      "Tutorial 2: arm disintegrators, clear floating targets, intercept dummy torpedoes, then boost Weapons to destroy the surface launcher.",
    difficulty: "tutorial",
    tags: ["tutorial", "weapons", "disintegrators", "intercepts"],
    eyebrow: "Tutorial",
    accentColor: "#ffd173",
    sortOrder: 12,
  },
  map: createHelionWeaponsTutorialLayout(),
  mission: {
    runtime: {
      logicId: "none",
    },
    factions: [
      {
        id: "academy",
        label: "Academy Weapons Control",
        team: "friendly",
        accentColor: "#8ee8ff",
        description:
          "Runs controlled live-fire drills and logs disintegrator accuracy against both static and incoming targets.",
      },
      {
        id: "range-opposition",
        label: "Helion Range Opposition",
        team: "hostile",
        accentColor: "#ffd173",
        description:
          "Inert floating targets plus a scripted dummy launcher for defensive disintegrator practice.",
      },
    ],
    briefings: [
      {
        id: "helion-weapons-briefing",
        title: "Weapons Tutorial",
        subtitle: "Disintegrator fundamentals",
        showAtStart: true,
        pages: [
          {
            title: "Arm and Clear Targets",
            body:
              "Press [F] to arm disintegrators, then destroy Helion Targets Alpha, Beta, and Gamma.",
            imageLabel: "Weapons Briefing",
          },
          {
            title: "Intercept Dummy Torpedoes",
            body:
              `After targets are clear, intercept ${HELION_REQUIRED_TORPEDO_INTERCEPTS} dummy torpedoes launched from the Helion Surface Launcher.`,
            imageLabel: "Weapons Briefing",
          },
          {
            title: "Boost Weapons for Range",
            body:
              "Press [3] to boost Weapons, extending your beam range. Use that extended range to destroy the surface launcher.",
            imageLabel: "Weapons Briefing",
          },
        ],
        pauseGameplay: true,
        blockPlayerInput: true,
      },
    ],
    markers: [
      {
        id: "helion-launcher-marker",
        label: "Surface Launcher",
        shape: "diamond",
        variant: "pulse",
        anchor: {
          kind: "body",
          bodyId: "helion-weapons-training:helion",
          offset: {
            x: Math.cos(HELION_LAUNCHER_MARKER_ANGLE) * HELION_LAUNCHER_MARKER_RADIUS,
            y: Math.sin(HELION_LAUNCHER_MARKER_ANGLE) * HELION_LAUNCHER_MARKER_RADIUS,
          },
        },
        radius: 84,
        visibleAtStart: false,
      },
    ],
    objectives: [
      {
        id: "arm-and-clear-floating-targets",
        title: "Arm disintegrators and destroy floating targets",
        summary:
          "Press [F] to arm disintegrators, then destroy Helion Target Alpha, Beta, and Gamma.",
        kind: "destroy",
        primary: true,
        visibleAtStart: true,
        successWhen: [
          {
            kind: "flag-state",
            flag: "tutorial2.weapons-armed-ever",
            value: true,
          },
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "helion-weapons-training:helion-target-alpha",
            },
          },
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "helion-weapons-training:helion-target-beta",
            },
          },
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "helion-weapons-training:helion-target-gamma",
            },
          },
        ],
        successMatch: "all",
      },
      {
        id: "intercept-dummy-torpedoes",
        title:
          `Intercept dummy torpedoes with disintegrators ({{flag:tutorial2.intercepts-count|0}}/${HELION_REQUIRED_TORPEDO_INTERCEPTS})`,
        summary:
          `Neutralize incoming dummy torpedoes from the Helion launcher (Intercepted: {{flag:tutorial2.intercepts-count|0}}/${HELION_REQUIRED_TORPEDO_INTERCEPTS}).`,
        kind: "defend",
        primary: true,
        visibleAtStart: false,
        dependsOn: ["arm-and-clear-floating-targets"],
        successWhen: [
          {
            kind: "flag-state",
            flag: "tutorial2.intercepts-complete",
            value: true,
          },
        ],
      },
      {
        id: "boost-weapons-and-destroy-launcher",
        title: "Boost Weapons and destroy the launcher",
        summary:
          "Press [3] to boost Weapons for extended range, then destroy the Helion Surface Launcher.",
        kind: "destroy",
        primary: true,
        visibleAtStart: false,
        dependsOn: ["intercept-dummy-torpedoes"],
        markerIds: ["helion-launcher-marker"],
        successWhen: [
          {
            kind: "flag-state",
            flag: "tutorial2.weapons-boosted-ever",
            value: true,
          },
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "helion-weapons-training:helion-surface-launcher",
            },
          },
        ],
      },
    ],
    triggers: [
      {
        id: "show-launcher-marker",
        once: true,
        when: [
          {
            kind: "objective-completed",
            objectiveId: "intercept-dummy-torpedoes",
          },
        ],
        actions: [
          {
            kind: "set-marker-visible",
            markerId: "helion-launcher-marker",
            visible: true,
          },
        ],
      },
    ],
  },
  encounters: [
    {
      id: "helion-floating-targets",
      label: "Helion Floating Target Cluster",
      factionId: "range-opposition",
      role: "custom",
      assets: [
        { kind: "defense", id: "helion-weapons-training:helion-target-alpha" },
        { kind: "defense", id: "helion-weapons-training:helion-target-beta" },
        { kind: "defense", id: "helion-weapons-training:helion-target-gamma" },
        { kind: "objective", id: "arm-and-clear-floating-targets" },
      ],
      description:
        "Initial disintegrator drill focused on weapon arming and stable target destruction around Helion.",
      enabledAtStart: true,
    },
    {
      id: "helion-surface-launcher-drill",
      label: "Helion Surface Launcher Drill",
      factionId: "range-opposition",
      role: "objective-defense",
      assets: [
        { kind: "defense", id: "helion-weapons-training:helion-surface-launcher" },
        { kind: "marker", id: "helion-launcher-marker" },
        { kind: "objective", id: "intercept-dummy-torpedoes" },
        { kind: "objective", id: "boost-weapons-and-destroy-launcher" },
      ],
      description:
        "Dummy torpedo pressure phase followed by a boosted-range launcher takedown.",
      enabledAtStart: true,
    },
  ],
  authoring: {
    version: 1,
    summary:
      "Tutorial 2 mission that teaches weapon arming, incoming torpedo interception, and weapon-range boosting in one compact single-planet arena.",
    designGoals: [
      "Create a clear bridge between navigation training and live combat systems.",
      "Teach defensive beam usage before introducing heavier combat encounters.",
    ],
    playtestFocus: [
      "Whether players discover [F] arm and [3] weapons boost without confusion.",
      "Whether torpedo cadence feels readable and fair for first-time interceptions.",
    ],
    editorHints: [
      "This scenario relies on scene-fed external flags for arming, intercept counts, and boosted subsystem checks.",
    ],
    aiPromptSeed:
      "Build a compact second tutorial that transitions from static beam targets into defensive torpedo interception and ends with an extended-range launcher kill.",
  },
};

export const NADIR_GATE_RUN_SCENARIO: ScenarioDefinition = {
  id: NADIR_GATE_RUN_SCENARIO_ID,
  presentation: {
    name: "Nadir Gate Run",
    description:
      "Mission 3: fly through ten randomized gates around Nadir, a distant gas giant with twin moons.",
    difficulty: "easy",
    tags: ["training", "navigation", "nadir", "gates"],
    eyebrow: "Tutorial",
    accentColor: "#9be7d5",
    sortOrder: 18,
  },
  map: createNadirGateRunLayout(),
  mission: {
    runtime: {
      logicId: "nadir-random-gate-run",
    },
    factions: [
      {
        id: "academy",
        label: "Academy Gate Control",
        team: "friendly",
        accentColor: "#9be7d5",
        description:
          "Runs randomized gate patterns around Nadir for precision transfer and lane-control drills.",
      },
    ],
    objectives: [
      {
        id: "complete-nadir-random-gate-run",
        title: "Clear all 10 randomized Nadir gates",
        summary:
          "Maintain control around Nadir and cross each randomized gate in sequence.",
        kind: "reach",
        primary: true,
        visibleAtStart: true,
        successWhen: [
          {
            kind: "flag-state",
            flag: "nadir.gate-run.completed",
            value: true,
          },
        ],
      },
    ],
  },
  encounters: [
    {
      id: "nadir-gate-control",
      label: "Nadir Gate Control",
      factionId: "academy",
      role: "support",
      assets: [{ kind: "spawn", id: "player" }],
      description:
        "A pure-flight drill with randomized gate placement and no live-fire opposition.",
      enabledAtStart: true,
    },
  ],
  authoring: {
    version: 1,
    summary:
      "Tutorial Mission 3 focused on repeatable, randomized gate precision around a multi-body moon system.",
    designGoals: [
      "Reinforce lane discipline and rhythm after the foundational transfer tutorial.",
      "Give playtesters a short repeatable skill check that changes each run.",
    ],
    playtestFocus: [
      "Whether ten gates feels like the right difficulty for first-time testers.",
      "How readable gate sequencing is around Nadir and its moons.",
    ],
    editorHints: [
      "Random gates are generated by custom runtime logic; marker positions in this scenario are intentionally minimal.",
    ],
    aiPromptSeed:
      "Build a randomized gate-run mission around a gas giant and nearby moons, focused on smooth orbital control and repeatability.",
  },
};

export const AURELIA_COMBAT_RANGE_SCENARIO: ScenarioDefinition = {
  id: AURELIA_COMBAT_RANGE_SCENARIO_ID,
  presentation: {
    name: "Aurelia Combat Range",
    description:
      "Disable the Selene darkside launcher and survive long enough to clear the range.",
    difficulty: "easy",
    tags: ["sandbox", "combat", "aurelia"],
    eyebrow: "Testing",
    accentColor: "#ff9f7f",
    sortOrder: 20,
  },
  map: createAureliaCombatRangeLayout(),
  mission: {
    runtime: {
      logicId: "none",
    },
    factions: [
      {
        id: "academy",
        label: "Academy Range Control",
        team: "friendly",
        accentColor: "#8ee8ff",
        description: "Supervises the combat range and logs performance.",
      },
      {
        id: "opposition",
        label: "Opposition Defenses",
        team: "hostile",
        accentColor: "#ff9f7f",
        description:
          "Live-fire launcher and battery network seeded around Aurelia and Janus.",
      },
    ],
    briefings: [
      {
        id: "range-intro",
        title: "Combat Range",
        subtitle: "Primary tasking",
        showAtStart: true,
        pages: [
          {
            title: "Disable the Launcher",
            body:
              "Destroy the [Selene Darkside Launcher]. Stay aware of Aurelia and Selene occlusion while you close.",
            imageLabel: "Range Briefing",
          },
          {
            title: "Read the Network",
            body:
              "This is a simple authored combat mission. The launcher is the primary objective, but other hostile defenses may still shape the fight while you are in range.",
            imageLabel: "Range Briefing",
          },
        ],
        pauseGameplay: true,
        blockPlayerInput: true,
      },
    ],
    markers: [
      {
        id: "selene-approach-ring",
        label: "Selene Approach Ring",
        shape: "circle",
        variant: "gate",
        anchor: {
          kind: "body",
          bodyId: "aurelia-training:selene",
        },
        radius: 180,
        visibleAtStart: true,
      },
    ],
    objectives: [
      {
        id: "enter-selene-approach",
        title: "Enter the Selene approach ring",
        summary:
          "Close on Selene and cross the marked approach ring before committing to the attack run.",
        kind: "reach",
        primary: true,
        visibleAtStart: true,
        markerIds: ["selene-approach-ring"],
        successWhen: [
          {
            kind: "marker-activated",
            markerId: "selene-approach-ring",
          },
        ],
      },
      {
        id: "destroy-selene-launcher",
        title: "Destroy the Selene Darkside Launcher",
        summary:
          "Use orbit, occlusion, and subsystem timing to disable the primary launcher.",
        kind: "destroy",
        primary: true,
        visibleAtStart: false,
        dependsOn: ["enter-selene-approach"],
        successWhen: [
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "aurelia-training:selene-darkside-missile",
            },
          },
        ],
      },
    ],
  },
  encounters: [
    {
      id: "selene-launcher-cell",
      label: "Selene Launcher Cell",
      factionId: "opposition",
      role: "objective-defense",
      assets: [
        { kind: "defense", id: "aurelia-training:selene-darkside-missile" },
        { kind: "marker", id: "selene-approach-ring" },
        { kind: "objective", id: "destroy-selene-launcher" },
      ],
      description:
        "A simple authored range encounter: close on Selene, survive the approach, and destroy the launcher.",
      enabledAtStart: true,
    },
  ],
  authoring: {
    version: 1,
    summary:
      "Reference combat scenario for testing marker-driven authored objectives without custom mission runtime logic.",
    designGoals: [
      "Exercise the generic mission runtime with real markers and destroy objectives.",
      "Keep the encounter small and readable so future scenario tooling has a clean baseline.",
    ],
    playtestFocus: [
      "Whether the marker-first objective flow is clear.",
      "How well the authored combat range communicates objective sequencing.",
    ],
    editorHints: [
      "Use this as the baseline scenario when building out marker, support-link, and control-node editing.",
    ],
    aiPromptSeed:
      "Build short combat scenarios with one primary hostile objective, clear approach markers, and a small but readable support network.",
  },
};

export const AURELIA_DISINTEGRATOR_RANGE_SCENARIO: ScenarioDefinition = {
  id: AURELIA_DISINTEGRATOR_RANGE_SCENARIO_ID,
  presentation: {
    name: "Aurelia Disintegrator Range",
    description:
      "Approach Selene and destroy three inert disintegrator targets mounted around the moon.",
    difficulty: "easy",
    tags: ["training", "combat", "weapons"],
    eyebrow: "Training",
    accentColor: "#ffd173",
    sortOrder: 15,
  },
  map: createAureliaDisintegratorRangeLayout(),
  mission: {
    runtime: {
      logicId: "none",
    },
    factions: [
      {
        id: "academy",
        label: "Academy Range Control",
        team: "friendly",
        accentColor: "#8ee8ff",
        description:
          "Runs the live-fire beam range and monitors approach discipline around Selene.",
      },
      {
        id: "range-dummies",
        label: "Disintegrator Target Cluster",
        team: "hostile",
        accentColor: "#ffd173",
        description:
          "Inert practice targets that can be scanned, locked, and destroyed without returning fire.",
      },
    ],
    briefings: [
      {
        id: "disintegrator-range-intro",
        title: "Disintegrator Range",
        subtitle: "Beam practice",
        showAtStart: true,
        pages: [
          {
            title: "Close on Selene",
            body:
              "Three [Selene Disintegrator Targets] are mounted around the moon. Enter the marked approach ring and clear all three.",
            imageLabel: "Range Briefing",
          },
          {
            title: "Read the Geometry",
            body:
              "The targets will not fire back. Use this as a clean environment for scanning, lock timing, and short-range beam attacks around a moving moon.",
            imageLabel: "Range Briefing",
          },
        ],
        pauseGameplay: true,
        blockPlayerInput: true,
      },
    ],
    markers: [
      {
        id: "selene-disintegrator-approach-ring",
        label: "Selene Target Ring",
        shape: "circle",
        variant: "gate",
        anchor: {
          kind: "body",
          bodyId: "aurelia-disintegrator-range:selene",
        },
        radius: 220,
        visibleAtStart: true,
      },
    ],
    objectives: [
      {
        id: "enter-selene-target-ring",
        title: "Enter the Selene target ring",
        summary:
          "Approach Selene until you cross into the marked beam-practice envelope.",
        kind: "reach",
        primary: true,
        visibleAtStart: true,
        markerIds: ["selene-disintegrator-approach-ring"],
        successWhen: [
          {
            kind: "marker-activated",
            markerId: "selene-disintegrator-approach-ring",
          },
        ],
      },
      {
        id: "destroy-selene-disintegrator-targets",
        title: "Destroy all three disintegrator targets",
        summary:
          "Lock and destroy Selene Targets Alpha, Beta, and Gamma.",
        kind: "destroy",
        primary: true,
        visibleAtStart: false,
        dependsOn: ["enter-selene-target-ring"],
        successWhen: [
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "aurelia-disintegrator-range:selene-disintegrator-target-alpha",
            },
          },
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "aurelia-disintegrator-range:selene-disintegrator-target-beta",
            },
          },
          {
            kind: "entity-destroyed",
            target: {
              kind: "defense",
              id: "aurelia-disintegrator-range:selene-disintegrator-target-gamma",
            },
          },
        ],
        successMatch: "all",
      },
    ],
  },
  encounters: [
    {
      id: "selene-disintegrator-target-cluster",
      label: "Selene Disintegrator Target Cluster",
      factionId: "range-dummies",
      role: "custom",
      assets: [
        { kind: "defense", id: "aurelia-disintegrator-range:selene-disintegrator-target-alpha" },
        { kind: "defense", id: "aurelia-disintegrator-range:selene-disintegrator-target-beta" },
        { kind: "defense", id: "aurelia-disintegrator-range:selene-disintegrator-target-gamma" },
        { kind: "marker", id: "selene-disintegrator-approach-ring" },
        { kind: "objective", id: "destroy-selene-disintegrator-targets" },
      ],
      description:
        "A compact cluster of inert practice targets used to test scanner locks, approach timing, and beam lethality around Selene.",
      enabledAtStart: true,
    },
  ],
  authoring: {
    version: 1,
    summary:
      "First dedicated beam-target scenario built around passive hostile dummies instead of live return fire.",
    designGoals: [
      "Create a low-pressure combat space for iterating on beam target feel.",
      "Give the project a reusable passive target site type that can be placed in real scenarios later.",
    ],
    playtestFocus: [
      "How readable the target silhouettes are against Selene.",
      "Whether three fixed targets are enough to judge beam lock and damage pacing.",
    ],
    editorHints: [
      "Use this scenario as the baseline when placing passive dummy targets in Map Lab.",
      "The targets are hostile for scanner and weapon purposes, but they never return fire.",
    ],
    aiPromptSeed:
      "Build low-pressure beam practice scenarios using inert hostile target dummies, short approach markers, and simple destroy objectives.",
  },
};

const DISCOVERED_AUTHORED_SCENARIO_MODULES = import.meta.glob(
  "./authored/*.ts",
  {
    eager: true,
    import: "default",
  },
) as Record<string, ScenarioDefinition>;

const DISCOVERED_AUTHORED_SCENARIOS: Record<string, ScenarioDefinition> = Object.fromEntries(
  Object.values(DISCOVERED_AUTHORED_SCENARIO_MODULES)
    .filter((scenario) => Boolean(scenario?.id))
    .map((scenario) => [scenario.id, scenario]),
);

export const SCENARIO_DEFINITIONS: Record<string, ScenarioDefinition> = {
  [ORBITAL_FLIGHT_TRAINING_SCENARIO.id]: ORBITAL_FLIGHT_TRAINING_SCENARIO,
  [HELION_WEAPONS_TUTORIAL_SCENARIO.id]: HELION_WEAPONS_TUTORIAL_SCENARIO,
  [AURELIA_DISINTEGRATOR_RANGE_SCENARIO.id]: AURELIA_DISINTEGRATOR_RANGE_SCENARIO,
  [NADIR_GATE_RUN_SCENARIO.id]: NADIR_GATE_RUN_SCENARIO,
  [AURELIA_COMBAT_RANGE_SCENARIO.id]: AURELIA_COMBAT_RANGE_SCENARIO,
  ...DISCOVERED_AUTHORED_SCENARIOS,
};

export function getScenarioDefinition(
  scenarioId: string,
): ScenarioDefinition | null {
  return SCENARIO_DEFINITIONS[scenarioId] ?? null;
}
