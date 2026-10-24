# Changelog

Releases are tagged `v<major>.<minor>.<patch>`. Each entry names the mode API
version it provides (`modeApiVersion` in `src/modes/mode.ts`). A release that
raises the mode API major lists, under **Migrating local modes**, every change
a local mode needs; `pnpm studio update` will not move a workspace onto it
until each local mode has been migrated and passes `pnpm test:modes`.

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
