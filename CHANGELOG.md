# Changelog

Releases are tagged `v<major>.<minor>.<patch>`. Each entry names the mode API
version it provides (`modeApiVersion` in `src/modes/mode.ts`). A release that
raises the mode API major lists, under **Migrating local modes**, every change
a local mode needs; `pnpm studio update` will not move a workspace onto it
until each local mode has been migrated and passes `pnpm test:modes`.

## v1.2.0

Mode API 1.0.

- The explainer is rebuilt on a motion system. Scenes enter on springs, list items land on the spoken word they belong to (word-anchored cues), scenes change through wipe, iris, push and zoom transitions that never break the shared scene boundary, and stills move (Ken-Burns, full-bleed or panel). Captions are word-synced with an accent box on the spoken or emphasised word.
- Two looks: `studio` (dark, drifting light, grain) and `paper` (cream sheet, ink borders, offset shadows, marker highlights, numbered chapter chips), chosen by the optional `brand.look`; `brand.motion` sets `calm`, `dynamic` or `punchy`.
- New treatments: `quote`, `steps`, `chart` (`bars`, or `iso` for a three.js clay bar field), `code` (typed, syntax-coloured), `grid` (counter chips), `gauge` and `orbit` (an extruded starburst with icon blocks orbiting it, three.js). The four existing treatments are rebuilt. New optional scene fields: `kicker`, `data`, `unit`, `chart_style`, `code`, `emphasis`, `transition`, `still_layout`, `still_motion`; `*word*` accents a title word. `lines` now defaults to empty. Every v1.1 job still validates and renders, with the new look.
- The layout check measures the settled layout of each scene, not frame 0, so entrance motion cannot hide or cause an overflow.
- Fonts: bundled Inter 800 (titles) and JetBrains Mono (code) are staged with every explainer render; the job's font stays the body font. Only `chart_style: iso` and `orbit` use WebGL (three.js: lit bevelled clay, soft shadows, a frame-driven camera); everything else is CSS and SVG. On GPU-less Linux hosts WebGL runs on the CPU (`swangle`), so those two scenes render slower there; the layout check never creates a WebGL context.
- `narrate-explainer` normalises the word timings a speech aligner returns (every word at least 0.04 s, none overlapping), so real ElevenLabs narration compiles.
- `scripts/create-showcase.ts` builds a job that uses every treatment in either look (with `--art` and `--narration` for generated pictures and real speech, whooshes timed to the transitions); `scripts/generate-showcase-art.ts` and `scripts/narrate-showcase.ts` make those inputs; the catalog is 0.2.0 and the mode API exports the new components.

## v1.1.3

Mode API 1.0.

- The layout check no longer fails a scene for content that a box clips on purpose. The still panel holds an image that zooms slowly inside a clipping box, so from the third second its `scrollWidth` passed the 12 px tolerance and every job with a still failed `LAYOUT_OVERFLOW`, however short the title. Text and unclipped boxes are checked as before.

## v1.1.2

Mode API 1.0.

- Exports stay under the 16 MiB Pegasus review limit: final renders use a capped CRF sized from the video length, and the isometric mode's `quality.json` adds `within_review_size`.
- Backend fit: plate style text is condensed so every template prompt fits 1,000 characters; backend effects are clamped to 3–10 s with the service's fixed settings, and the mixer trims one-shots to their designed length; cast voices may name `backend_voice_id` (the isometric broadcast voice falls back to `backendconfigured`).

## v1.1.1

Mode API 1.0.

- Crash-safe store lock: a render holds a kernel `flock` on `.studio-lock/owner.lock` for its whole life; a lock is stale only when that flock is free. No hostname or PID test, so it is correct across bot boxes that share a hostname and have separate PID namespaces. Without util-linux `flock` (macOS) a lock is stale after a 10-minute heartbeat gap.
- `pnpm studio unlock [--force]` frees a stale lock; `pnpm studio clean [--job <id> | --all]` removes staging, corrupt outputs and attempt ledgers while holding the lock; `--fresh` on `run`/`render` resets attempts.
- `prune` no longer deletes a lock whose owner is alive.
- `doctor` lists `capabilities` (`unlock`, `clean`, `fresh`, and `flock-lock` where a flock binary exists).
- `scripts/crossbox-lock/` reproduces the two-box lock check in Linux bubblewrap boxes.

## v1.1.0

Mode API 1.0.

- AWS Generation Backend Adapter: Automatic backend selection when `local.env` is absent, routing to deployed generation Lambda with immutable S3 artifact verification, deterministic job IDs, support for 9:16 (768×1344) vertical still plates, and expanded seeds.
- Explainer self-narration: `narrate-explainer` command and `src/modes/explainer/narrate.ts` providing automated speech synthesis and word-level timestamp generation directly from script segments.
- Studio diagnostics: `pnpm studio diagnostics [--job <id>] [--out <dir>]` exporting bounded, sanitized JSONL diagnostic support bundles with redaction of secrets, API keys, and personal paths.
- Opportunistic scratch disk auto-pruning: `src/prune.ts` purges scratch directories and job outputs in `work/` older than 48 hours.
- Runner preflight cleanup: `executeJob` runs silent opportunistic cleanup before allocating scratch directories for new jobs.
- CLI prune command: `pnpm studio prune [--older-than <hours>] [--out <work directory>] [--dry-run]` to inspect and prune disk space on demand.
- Doctor scratch retention check: `doctor` inspects scratch disk and reports eligible prune candidates.
- Automated mode migration system: `pnpm studio migrate [--mode <id>] [--to <version>] [--dry-run]` to inspect and execute mode codemod recipes.
- Update pipeline auto-migration: `pnpm studio update --to <tag>` automatically checks local mode API versions on `update/<tag>` and runs registered migration recipes before running release conformance checks.
- Migration recipe engine in `src/migrations/` with multi-hop version resolution and built-in recipes (`v0-to-v1` and `v1-to-v2`).

## v1.0.0

Mode API 1.0.

- First standalone release. Shipped modes: `explainer` (fallback) and
  `isometric-art-zombie-apocalypse`.
- Local modes in `local-modes/<id>/`, found at startup, with
  `templates/local-mode/` as a starter. Unavailable local modes are listed with
  the reason; a local mode with a shipped mode's id stops the studio with
  `MODE_ID_COLLISION`.
- The mode API: `src/mode-api.ts` (`defineMode`, `modeApiVersion`,
  `modeJobSchema`, `loadJobFiles`, `renderComposition`, `writeContactSheet`,
  `readJson`, `writeJson`, `sha256`, `StudioError`, `requireCondition`,
  `probe`, `inspect`, `runTool`, `runToolCapture`, `resolveSecret`, the image
  and audio provider types and their mock, NIM and ElevenLabs factories) and
  `src/rendering/mode-api.tsx` (the shared explainer components).
- Every mode has a mock fixture; `pnpm test:modes` renders and verifies them.
- `pnpm studio update --to <tag>` merges a release only after every check
  passes.
- WebGL uses ANGLE on macOS and `swangle` (SwiftShader, on the CPU)
  elsewhere, so the isometric mode renders on GPU-less Linux.
