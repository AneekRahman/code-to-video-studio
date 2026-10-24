# Local modes

This folder belongs to the workspace that installed the studio. Releases ship
only this file here and never change it, so a workspace's own modes merge
cleanly with every update.

Each mode is one folder named after its id:

```text
local-modes/<mode-id>/
  mode.ts        export default defineMode({...}) from ../../src/mode-api.ts
  skill.md       how to make a video in this mode (the card's `skill`)
  *.template.json
  rendering/     its Remotion entry (registerRoot) and scenes, if it has any
  tests/         optional *.node-test.ts files, run by pnpm test
```

Rules, checked by `pnpm test` and `pnpm test:modes`:

- Studio code comes only from `src/mode-api.ts` and
  `src/rendering/mode-api.tsx`. Packages come only from the studio's
  `package.json`; ask the maintainers for a new one.
- The card's `id` equals the folder name, its `role` is `specialised`, and its
  `skill` and `templates` are paths inside this folder.
- `api` is the mode API major the mode was written for, as a number
  (`api: 1`), never `modeApiVersion.major`, which would always claim the
  current one. After an update raises it, `pnpm studio modes`
  lists the mode as unavailable until it is migrated using `CHANGELOG.md`.
- `fixture(dir)` builds a complete job with mock providers only;
  `pnpm test:modes` renders and verifies it.
