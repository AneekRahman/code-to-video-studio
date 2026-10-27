# Code-to-Video Studio (Hyperframes)

A rebuild of the studio on [Hyperframes](https://github.com/heygen-com/hyperframes):
a story becomes one HTML composition that headless Chrome renders frame by frame.
No React, no Remotion.

## Run

```sh
pnpm install
pnpm studio render --input <story dir> --out <output dir> [--max-mib 15]
```

A story dir holds `story.json`, `sound.json`, `plates/plates.json` (with the
images) and `audio/audio.json` + `audio/timing.json` (with the audio files) — the
same inputs the Remotion studio's `isometric-art-zombie-apocalypse` mode uses.

`pnpm studio compose --input <dir> --project <dir>` writes the Hyperframes project
only, for `npx hyperframes preview` or `snapshot`.

## Pipeline

1. `src/timeline.ts` lays shots end to end from the word timing and resolves
   sound and overlay anchors (shot fraction, segment, word edge, offset).
2. `src/audio.ts` treats voices with ffmpeg (close-mic, broadcast, through-door),
   then turns narration, cues, knocks and music into timed `<audio>` clips,
   repeating files across long spans and cutting declared silences.
3. `src/compose.ts` writes `index.html`, plates, fonts, pinned GSAP, Three.js and the
   runtime. `src/runtime/scene.js` draws every frame from the time alone: camera
   moves, drift and shakes, grades, fog, particles, flicker, heartbeat vignette,
   glitch and flash transitions, Three.js clay characters with gaits (lit per
   grade, with contact shadows), captions, title,
   broadcast banner and terminal, rule cards with spoken-word highlight, window
   shadows and the cut to black. One paused GSAP timeline drives it.
4. `src/render.ts` renders with Hyperframes at a bitrate sized to stay under
   Pegasus's 16 MiB limit, normalises loudness to −14 LUFS (true peak ≤ −1 dBTP),
   and writes a QA report next to the video.

Telemetry is off (`HYPERFRAMES_NO_TELEMETRY=1`). Requires Node ≥ 24.5 and FFmpeg.
