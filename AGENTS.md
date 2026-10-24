# Code-to-Video studio

> For general AI agent indexing, autonomous setup, error troubleshooting matrices, and execution patterns across any environment, see [AGENT_README.md](AGENT_README.md).

This folder is the Code-to-Video bot's studio: its working folder in
OpenMausBot and the only folder it writes. It is a git clone of a studio
release, on this workspace's own branch (`workspace/<name>`). Everything the
bot needs is inside it. Read README.md and DEFERRED.md before changing
execution behaviour.

## Start of a session

1. `pnpm install --frozen-lockfile` if `node_modules` is missing or the
   lockfile changed; `pnpm studio prepare-browser` once per install.
2. `pnpm studio doctor`. Fix, or report to Showrunner or the person, every
   failed required check before production. ffmpeg comes from the host
   image; the bot cannot install it.
3. Run every command as `pnpm studio <command>` from this folder. It passes
   `--use-env-proxy`; inside the bot box, network access exists only
   through the box's proxy, which Node otherwise ignores.

## Every video request

Start with [mode selection](skills/mode-selection.md), then the chosen
mode's skill as `pnpm studio modes` lists it.

## Who owns what

The maintainers own everything here except the workspace's own files, and
change it only through releases:

- `local-modes/<id>/`: modes this workspace built (`local-modes/README.md`
  is the maintainers').
- `plans/`: plans for those modes.
- `work/` and `local.env`: git-ignored job data and keys.

Never edit maintainer files. A change the workspace needs in them (a fix, a
shared component, a new dependency, a mode API addition) is reported to the
person for the maintainers, with what and why. A workspace edit to a
maintainer file conflicts with every later release.

## Where things go

- Job data (plates, audio, packaged jobs, output stores, previews) goes in
  `work/`: persistent. Never `/tmp`, which the bot box discards after each
  turn, and nowhere else in the tree; the runner refuses other paths.
- Provider keys come only from `local.env` (mode 600). The bot box strips
  them from the environment. Never print, log or copy a key, or put one in a
  job, brief, report or commit.
- Never write outside this folder. The team's design guide belongs to its
  maintainers.
- Commit local modes and their plans on the workspace branch. Never push:
  the `upstream` remote is the maintainers' public repository, and this
  bot has no credentials for it.

## New modes

Follow [create-mode](skills/create-mode.md): interview, plan, then a staged
build in `local-modes/<id>/`, starting from `templates/local-mode/` and
reviewed after each stage. A local mode imports studio code only from
`src/mode-api.ts` and `src/rendering/mode-api.tsx`, and packages only from
`package.json`; `pnpm test` enforces both.

## Updates

Update only when the person or a maintainer asks, never during a job:

1. `pnpm studio update --to <release tag>` (for example `v1.2.0`). It
   merges the release on `update/<tag>`, automatically applies mode migration
   recipes (`studio migrate`) if the release raised the mode API major, runs
   install, typecheck, lint, tests, `test:modes` and `doctor`, and only then
   moves the workspace branch. On any failure the workspace branch is unchanged.
2. `UPDATE_CHECK_FAILED`: read the failing check's output and `CHANGELOG.md`
   for that release. If automatic migration could not find a path, inspect
   `CHANGELOG.md` and run `pnpm studio migrate [--dry-run]` or repair each
   local mode on the kept `update/<tag>` branch (`git switch update/<tag>`,
   `pnpm install --frozen-lockfile`, fix, commit), switch back to the workspace
   branch and rerun the same update. Report anything the changelog does not
   explain to the person. If a newer release appears meanwhile, keep the
   repairs by renaming the branch (`git branch -m update/<old tag> update/<new tag>`)
   and update to the newer tag.
3. `UPDATE_CONFLICT` means a maintainer file was edited here; report it.
   `MODE_ID_COLLISION` means a release now ships a mode with a local mode's
   id: ask the person for a new id, rename the folder and card, commit and
   retry. `UPDATE_DIRTY` and `UPDATE_BUSY`: commit the work, or wait for the
   job to finish.

## Changing the studio

Preserve strict contracts, pinned file hashes, narrated timing and
technical-only completion. Provider calls belong only in explicit generation
commands and never run while rendering, mixing or validating a job. Never
add production storage, automatic acceptance or publishing without explicit
configured contracts.

Write a code comment only for what the code cannot say: an external tool's
behaviour with its version, a public contract, or a security invariant.

After meaningful changes run `pnpm typecheck`, `pnpm test`, `pnpm lint` and
`pnpm test:modes`. Do not treat tone fixture labels as speech alignment
evidence.
