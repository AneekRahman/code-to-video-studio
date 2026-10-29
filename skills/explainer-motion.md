# explainer-motion

Trigger: Plan or write the storyboard of a narrated explainer, or choose its look.

Inputs: Approved script, word timestamps, brand, permitted stills.

## Start from the starter, then lint

1. `pnpm studio doctor`: note `webgl_budget` (it caps iso charts, orbit and logos; export it as `STUDIO_WEBGL_BUDGET` if it is below 3).
2. `pnpm studio storyboard-template --look paper --scenes 8` (or `studio`): copy its `brand` unchanged and rewrite its `storyboard` scene by scene. Do not invent colours.
3. After narration, set times from the timestamps, then `pnpm studio lint-storyboard --storyboard ... --brand ... --timestamps ...` and fix every problem before building the job.

## Pick the look

`brand.look` is `studio` (dark, glass cards, drifting light, grain; the default) or `paper` (cream sheet, ink borders, offset shadows, orange marker highlights, numbered chapter chips). Paper wants a light `background`, a near-black `foreground` and one warm `accent`; studio wants a dark background. `brand.motion` is `calm`, `dynamic` (default) or `punchy`.

## Pick the treatment per scene

One idea per scene, one treatment per idea.

| Treatment | Fields | Use for |
| --- | --- | --- |
| `headline` | `lines` (0-4) | A claim and its supporting points |
| `comparison` | `lines` (2-4) | Two cards with a VS badge (2), or stacked rows |
| `checklist` | `lines` (1-4) | Things to check, each ticked as spoken |
| `stat` | `value`, `suffix`, `lines` | One number that matters |
| `quote` | `lines` (quote, attribution) | A line worth reading aloud |
| `steps` | `lines` (2-4) | A process, in order |
| `chart` | `data` (2-6), `unit`, `chart_style` `bars` or `iso` | Compare quantities; `iso` ranks them on a three.js 3D bar field |
| `code` | `code.language`, `code.text` (<=10 lines of <=38 characters), `code.highlight` (line numbers) | Show how something is written |
| `grid` | `value` (1-24), `suffix` | A count of things, lighting one by one |
| `logos` | `logos` (`youtube`, `instagram`), `lines` | An opening scene with the platform logos in 3D (three.js) |
| `orbit` | `value` (3-12), `suffix` | A hero scene: a starburst with that many blocks orbiting it (three.js) |
| `gauge` | `value` (0-100), `suffix`, `lines[0]` (verdict) | A score |

Optional on any scene: `kicker` (a `/tag` chip), `emphasis` (up to 8 words to mark in the captions; each must be spoken in that scene), and `transition` into the scene (`auto`, `cut`, `wipe`, `push`, `iris`, `zoom`). Wrap the words to colour in a title in `*asterisks*`.

## Rules that make it good

- Items enter when the narrator reaches them (line i of n cues to word i of the scene's speech). Write list lines in the order they are spoken, and keep each line a short echo of its spoken words, never a new sentence.
- Mark the one to three words per scene that carry the meaning in `emphasis` and in the title; more than that marks nothing.
- Vary treatments: never the same treatment twice in a row, and never more than three `headline` scenes in a video.
- Scenes under 2 seconds cannot animate; scenes over 8 seconds need a second beat (a list or a chart) so something moves.
- Keep `transition` on `auto`: it puts a full-screen accent (wipe, iris, zoom) on every third boundary and cuts between the rest, which matches the pace of the reference reels we measured (about 29 cuts a minute). A shutter counts as two cuts, so setting one on every boundary makes the video cut about 1.5 times as fast. Set `transition` yourself only when a boundary is the point.
- This mode is typography, motion and 3D: do not add generated pictures. (`still_asset_id` still validates for jobs written before v1.2.0.)
- The loader rejects a storyboard that breaks the rules above it can check: palette against look, more than 3 WebGL scenes (iso chart, orbit, logos), a treatment used 3 times in a row, emphasis words that are never spoken. Fix the storyboard; do not change the brand to silence it.
- Run `validate`, `compile` then `preview` and read the contact sheet before `run`. `LAYOUT_OVERFLOW` names the scene and the box: shorten the line or drop a still, do not shrink the type.

Permitted tools: Catalog, local previews and tests. This instruction grants no tools, credentials or access.

Exit: Preview contact sheet read; no scene overflows; creative acceptance stays with the Critic and Showrunner.
