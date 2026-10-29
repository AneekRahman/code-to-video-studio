# low-poly-3d-what-if

Trigger: Produce, repair or extend a short in mode `low-poly-3d-what-if`: a "what if X doubled every second / was twice as loud as the last" escalation told in one flat-shaded low-poly 3D world, with a climbing counter, one comparison and one caption per rung, and a quiet punchline.

Inputs: A premise (the thing that escalates and what the counter measures), or a reference reel in this style (then also [reference-to-mode](reference-to-mode.md)). Start from `src/modes/low-poly-3d-what-if/escalation.template.json` and `audio.template.json`. Optional: a voiced shout clip (MP3).

Credit: the style is read from two public reels (see the plan `plans/2026-10-30-low-poly-3d-video-mode` in OpenMausBot); the scenes are written for this studio on three.js (MIT). The measure, look, critique, fix passes are adapted from [taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT). No Hypit code is in this mode.

## What the style is (measured on the two reels)

- **One ladder, one clock.** A counter ticks at a fixed cadence: 2.4 s per rung (arithmetic, +10 dB per shout, 39 rungs in 102 s) or 1.0 s per rung (geometric, x2, 92 rungs in 110 s; the closing tally is exactly 2^91). The HUD changes only on ticks; the camera and world change on their own cuts. Never tie shots to rungs.
- **The world is the evidence.** A scale ladder: street, then aerial city, then terrain, then the globe, then the sun, then an explosion, then black space. Each jump of scale is a hard cut; inside a world the camera moves slowly. The hero (red hoodie, grey trousers, white shoes) is in every scale: same person, bigger problem.
- **HUD (720 x 1280 design, scaled to 1080 x 1920):** kicker (16 px, spaced caps, 88 % white) at x 50, y 196; the number in Lora semibold 72 px; a spaced-caps comparison line; one aux line (a mono clock, or a small "ENERGY = ..." detail); a red pill (`#d9264a`, 11 px spaced caps). The caption sits at y 470, Lora italic 38 px. The comparison and aux lines keep their height when empty so the pill never jumps. Number colour is white, or cream `#f6e9a8` when the ladder has a clock.
- **Rhythm:** the title question is on screen until about the second rung (2 to 3 s), over the live world (or over black for the first second). A caption names one consequence, at most about 12 words; it stays up for its rung (several rungs when `caption_rungs` is set). Most rungs have a comparison; a caption on every second or third rung is enough. The number rolls up to its new value over 0.8 s on an arithmetic ladder; a geometric ladder jumps.
- **Ending:** the last rung is the joke. Either the sound drops to digital silence for the final 6 s (`ending.silence_from_seconds`), or the HUD gives way to a centred "final" card with the exact tally and one lower-case line (`ending.final`). Both can be used.
- **Sound:** a voiced shout per rung, each louder (`first_shout_db` to `last_shout_db`, about 25 dB apart), a bass hit under every rung that grows faster than the shout, an optional rising low bed (`bed_start_db`, `bed_end_db`), mastered to -14 LUFS with a 10 to 12 LU range. A shout clip from a voice provider is better than the built-in vowel; pass it as `--shout`.

## Method

1. **Premise and counter.** Name what escalates and the unit. Choose `geometric` (x2 every rung) when the joke is exponential growth, `arithmetic` when the unit is already logarithmic (dB). Pick the cadence (1.0 s for a long ladder, 2.4 s when each rung needs a sentence). Check the last number is absurd enough to need the ending, and that the counter ends at least one rung before the video does.
2. **Write the ladder.** One entry per rung in `rungs`. A comparison for every rung once the number passes everyday scale (a real thing the number equals; do not invent facts: state a comparison only when it is true to its stated precision). Captions on the rungs where the world reacts. Use `value`/`value_text`/`clock_text` only when the number must differ from the counter (a final `0 dB`, "DONE").
3. **Cut the shots.** `shots` must tile the whole duration with no gap. Worlds: `street` (walking tracking shot; reactions escalate with the ladder), `bathroom`, `portrait` (`variant` `hero` or `anchor`; the face reacts with the ladder), `suburb`, `city` (blocks flatten as the shockwave grows), `terrain` (voxel ground, crater ring), `globe` (`earth`, with a hotspot, cracks and a fading atmosphere), `sun`, `space` (`plain`, `moon`, `earth`; the hero and a stream), `explosion`. A second shot of the same world and `seed` with `offset_seconds` continues the first, so a camera can leave the street without a cut; give such a shot `camera.from/to`. A `news` entry adds the breaking-news lower third over any span.
4. **Sound.** Write `audio.json`. Mute rungs that cannot be heard (`mute_rungs`), declare the silence in `ending`, never leave unexplained silence (the check fails it).
5. **Package and render.** `pnpm studio package-what-if --escalation e.json --audio-plan a.json [--shout clip.mp3] --out work/<job>`, then `pnpm studio validate --job work/<job>/job.json`, then `run`. Frames cost about 0.4 s each on a Mac GPU; a 100 s ladder is about 25 minutes there and much longer on a GPU-less host (see `doctor`'s WebGL budget), so run `preview` (half size) first.
6. **Look, then critique** (taste-skill passes, in this order): first frame (is there one dominant element and a readable HUD?); squint (HUD plus one mass); title-cover test (could the frame belong to another series?); edges (count left edges: HUD, caption and pill share x 50); colour (white, cream and red only in the HUD, nothing else red-pill red); type (number far larger than the kicker, case right); sameness (one word per shot for its layout; two shots in a row must differ); motion (a frame grid at 0.1 s through one rung tick); collisions (no caption over the number). Fix idea, then hierarchy, then composition, then detail, three rounds at most, then ask the person.
7. **Measure.** `quality.json` must pass. With a reference: `analyze-reference` it, then `compare-reference` the render and put the failed checks in the plan. Creative acceptance stays with the person.

## Rules

- State only true comparisons. The reels' figures (an explosion's energy, the speed of light) are real physics; a made-up number presented as a fact is a defect.
- Never reproduce a reference's text, character or narration; the mode makes a new premise in the same style.
- No gore. Destruction is cubes and shockwaves; people run, cover their ears, are thrown, never injured on screen.
- Do not add worlds, HUD fields or sound beds in a job; a need the mode does not cover is reported to the person for the maintainers.

Permitted tools: The studio CLI and the studio folder. This instruction grants no tools, credentials or access.

Failure: `INVALID_CONTRACT` names the schema path; `TIMING_CONFLICT` means the duration does not equal the last shot's end; a failed `caption_reading_time` means shorten the caption or give it `caption_rungs`.

Exit: a passing `quality.json`, the contact sheet reviewed, and the final video watched and listened to before any handoff.
