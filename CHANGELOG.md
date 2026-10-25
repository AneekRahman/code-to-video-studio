# Changelog

Releases are tagged `v<major>.<minor>.<patch>`. Each entry names the mode API
version it provides (`modeApiVersion` in `src/modes/mode.ts`). A release that
raises the mode API major lists, under **Migrating local modes**, every change
a local mode needs; `pnpm studio update` will not move a workspace onto it
until each local mode has been migrated and passes `pnpm test:modes`.

## [Unreleased]

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
