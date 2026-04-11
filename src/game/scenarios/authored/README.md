Map Lab's scenario export writes authored scenario modules here, for example:

- `src/game/scenarios/authored/my-test-scenario.ts`

These files should default-export a `ScenarioDefinition`. They are auto-discovered by
[scenario-definitions.ts](/Users/armen/orbital-combat/src/game/scenarios/scenario-definitions.ts)
and appear in Level Select as playable authored scenarios after refresh.
