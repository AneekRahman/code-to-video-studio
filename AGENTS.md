# Video Studio implementation

Read [the shared maintenance contract](../README.md), README.md and DEFERRED.md
before changing execution behavior. Keep the guide and implementation updated
together under that contract. This package
implements the local fixture rendering tool, not a configured production bot.

Keep source, dependencies, contracts, catalog and skills here. Put jobs/media,
credentials, caches and render outputs outside this source tree. Preserve strict
contracts, pinned file hashes, narrated timing and technical-only completion.
Never add live provider calls, production storage, automatic acceptance, or
publishing without explicit configured contracts. Existing repository comment
and isolated-verification rules apply.

Run package typecheck/tests and scoped root lint after meaningful changes. Use
scripts/smoke.ts for media-path changes; keep fixtures separate from live user
workspaces. Do not treat tone fixture labels as actual speech alignment evidence.
