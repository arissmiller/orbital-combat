# Audio Assets

Place game audio files in this directory using bus folders:

- `src/assets/audio/ui/`
- `src/assets/audio/warnings/`
- `src/assets/audio/weapons/`
- `src/assets/audio/engines/`
- `src/assets/audio/background/`
- `src/assets/audio/ambience/`
- `src/assets/audio/music/`

Supported formats:

- `.wav`
- `.mp3`
- `.ogg`
- `.m4a`
- `.aac`
- `.flac`

Asset IDs are derived from folder + filename:

- `src/assets/audio/warnings/incoming-torpedo.wav`
- asset id: `warnings/incoming-torpedo`

Current warning audio playback will automatically use a matching warning asset id
when present, and otherwise fall back to synth cues.

Weapon loop note:

- Add a file named `disintegrator-loop` (or `disentegrator-loop`) under
  `src/assets/audio/weapons/` to drive the disintegrator firing loop.

Legacy compatibility:

- Root-level files like `src/assets/player_death.wav` are also discovered.
- They are mapped to warnings using a normalized id (for example:
  `src/assets/player_death.wav` -> `warnings/player-death`).
