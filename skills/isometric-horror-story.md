# isometric-horror-story

Trigger: Produce or repair a short in mode `isometric-art-zombie-apocalypse`
(a narrated isometric horror story ending in on-screen survival rules).

Inputs: An approved story (`story.json`: voiced segments, shots, overlays), a
plate set (`plates.json`), and a sound design (`sound.json`: cast, effects,
music, cues). Start from the templates in
`src/modes/isometric-art-zombie-apocalypse/`.

Method:

1. `generate-plates` once per plate set, then review `contact-sheet.jpg`.
   Reword a refused plate's subject rather than its safety-sensitive phase
   words, then rerun; unchanged plates are reused.
2. `preview-story` without timing to check framing, actor paths and overlay
   placement cheaply (estimated timing, half resolution).
3. `generate-audio`, then `preview-story --timing <audio>/timing.json` when
   shot pacing needs checking against the real voice.
4. Get Audio Director approval of the sound file and the generated voices,
   then `package-story`, then `run`. Read `quality.json` and the contact sheet,
   then watch and listen to `final.mp4` before any handoff.

Taste rules (from reviewed renders):

- Hook in the first second: open on the payoff image (the double knocking)
  with the title; the story loops back to it, so the cut to black must land
  on the twist's last word.
- Plates: one diorama tile spanning nearly the full frame width; close
  framing for interiors and the porch. "Horror" in prompts trips the safety
  filter; describe mood ("eerie silent") instead.
- Characters: capsule clay rigs at 48–50 px in wide shots and about 168 px
  indoors. The hero stays yellow. Zombies are uncanny, never gory: pale grey
  skin, no eyes, long arms, hunched.
- Dark scenes need a light source (window glow), not just a darker grade.
  Event moments (lights out) must happen on screen, on the spoken word.
- Sound: every line is levelled to the same dialogue loudness before
  mixing, so cast `gain_db` is relative. Keep impacts (rule hits) 7–10 dB under
  dialogue. Anchor cues to spoken words, such as the light click on "light"
  and the chain on "Chain". Knocks come from the knock animation; do not
  place them by hand. Cut the music on the slam and before the twist.
- Rules: each card stays on screen at least `words / 3 + 0.5` seconds.

Permitted tools: studio `generate-plates`, `generate-audio` (provider
calls with keys from the environment or `local.env`), `preview-shots`,
`preview-story`, `package-story`, `validate`, `preview`, `render`, `finish`,
`run`, `verify`, plus ffprobe and ffmpeg for inspection. This instruction grants no
tools, credentials or access.

Failure: `plates_incomplete` or `audio_incomplete` lists refused assets;
`TIMING_CONFLICT` means the timing does not match the script word for word
or the job duration; `INVALID_MIX` names an unknown effect, shot, segment or
word in a cue anchor. A failed `quality.json` check is evidence for the
Critic, not a reason to hide the export.

Exit: All `quality.json` checks pass, the result verifies, and the
assembled export has been watched with sound. Creative acceptance remains the
Critic's.

Examples: good — moving the slam cue by `offset_seconds` after the contact
sheet shows the flash a frame late. Bad — stretching a shot's `extra_seconds`
to hide a late narration line instead of regenerating that segment.

Evidence: [sound tests](../tests/sound.node-test.ts),
[story job tests](../tests/story-job.node-test.ts),
[story tests](../tests/story.node-test.ts) and the
[plan](../../../../plans/2026-10-24-video-studio-cannot-tell-isometric-horror-stories/plan.md).
