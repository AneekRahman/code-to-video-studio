# Code-to-Video studio

This folder is the Code-to-Video bot's studio: its working folder in
OpenMausBot and the only folder it writes. It is a self-contained project
(its own lockfile and settings); everything the bot needs is inside it.
Read README.md and DEFERRED.md before changing execution behaviour.

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
mode's skill from `catalog/modes.json`.

## Where things go

- Job data (plates, audio, packaged jobs, output stores, previews) goes in
  `work/`: git-ignored and persistent. Never `/tmp`, which the bot box
  discards after each turn, and nowhere else in the source tree; the runner
  refuses other paths.
- Provider keys come only from `local.env` (git-ignored, mode 600). The bot
  box strips them from the environment. Never print, log or copy a key, or
  put one in a job, brief, report or commit.
- Plans for new modes go in `plans/` here, as
  [create-mode](skills/create-mode.md) describes.
- Never write outside this folder. The team's design guide and the
  repository's plans belong to their maintainers.

## Changing the studio

Keep source, dependencies, contracts, catalogs and skills here. Preserve
strict contracts, pinned file hashes, narrated timing and technical-only
completion. Provider calls belong only in the explicit `generate-*`
commands and never run while rendering, mixing or validating a job. Never
add production storage, automatic acceptance or publishing without explicit
configured contracts.

A mode is one directory under `src/modes/` exporting its `defineMode`
definition, listed in `src/modes/registry.ts`, with its skill, templates,
tests and a regenerated `catalog/modes.json` (`pnpm catalog:modes`). New
modes follow [create-mode](skills/create-mode.md): interview, plan, then a
staged build reviewed after each stage.

Write a code comment only for what the code cannot say: an external tool's
behaviour with its version, a public contract, or a security invariant.

After meaningful changes run `pnpm typecheck`, `pnpm test` and `pnpm lint`;
run `pnpm smoke` when rendering or audio behaviour changes. Do not treat
tone fixture labels as speech alignment evidence.
