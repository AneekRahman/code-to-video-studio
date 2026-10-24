# Video Studio local rendering package

Keep this package and the [Video Studio guide](../docs/v1-video-studio/INDEX.md)
updated together under the [shared maintenance contract](../README.md).

This implements the approved rendering-package-first step: a strict local job
adapter, narration-driven timeline, eleven reusable components, six caption modes,
Remotion previews/visual masters, explicit FFmpeg stereo audio finishing, technical QA,
hash-verified artifacts and reproducibility snapshots. It is not a configured
OpenMausBot profile or a production-ready nine-role team. Remaining decisions and
missing capabilities are recorded in [DEFERRED.md](DEFERRED.md).

Requires Node >=24, the repository's pnpm installation, and ffmpeg/ffprobe on
PATH. All Remotion dependencies are pinned to 4.0.538. Remotion may download its
headless browser on first use; application/provider requests are not made by
frame rendering. First-run browser preparation is separate from a guaranteed
production job SLA. Check applicable Remotion licensing before production use.

From the repository root:

```sh
pnpm install
pnpm --filter @openmausbot/video-studio typecheck
pnpm --filter @openmausbot/video-studio test
pnpm --filter @openmausbot/video-studio studio schemas
pnpm --filter @openmausbot/video-studio studio catalog
pnpm --filter @openmausbot/video-studio fixture
```

`fixture` creates a new temporary input directory and prints its job path.
It generates tone-only test audio, measured timing, geometric artwork, a music
bed, and a pinned Inter font with its OFL license. Those word labels are not
spoken narration. On macOS, `fixture --speech` uses `say` to synthesize each word
and measures actual concatenated word boundaries; this is a technical speech
fixture, not production narration or perceptual acceptance.

Use the printed job path and an output directory outside both source and inputs:

```sh
pnpm --filter @openmausbot/video-studio studio validate --job /absolute/inputs/job.json
pnpm --filter @openmausbot/video-studio studio compile --job /absolute/inputs/job.json
pnpm --filter @openmausbot/video-studio studio preview --job /absolute/inputs/job.json --out /absolute/outputs
pnpm --filter @openmausbot/video-studio studio render --job /absolute/inputs/job.json --out /absolute/outputs
pnpm --filter @openmausbot/video-studio studio finish --job /absolute/inputs/job.json --out /absolute/outputs --visual-manifest /absolute/outputs/job/render-identity/result.json
pnpm --filter @openmausbot/video-studio studio run --job /absolute/inputs/job.json --out /absolute/outputs
pnpm --filter @openmausbot/video-studio studio verify --result /absolute/outputs/job/operation-identity
```

`preview` renders a half-resolution full clip plus scene thumbnails/contact sheet;
`render` produces the silent 1080x1920 H.264 visual master; `finish` consumes a
verified full visual result for exactly the same job and adds AAC narration and
explicit optional tracks. `run` performs render and finishing together. Results
include `result.json`, timeline, technical reports, source/dependency fingerprints,
exact input snapshots, media hashes and the final video filename. Compile/validate
results are returned as JSON; no arbitrary shell or code is accepted in a job.

The local schema is distinguished by `adapter: "local-fixture"`; it is separate
from the guide's illustrative production URI contracts. Export its actual JSON
Schemas with `studio schemas`. Each input is a relative local file plus SHA-256,
with symlink resolution and combined byte limits. Raster stills/fonts are staged
for frame rendering. Remote/S3 references require an unconfigured production
adapter and are rejected. The fixture approval string is an input precondition,
not authentication; this is a trusted local CLI, not a sandbox for hostile users.

Jobs must explicitly set operation attempts, runtime, input/result bytes, frame
limits and concurrency 1. Each uncached preview/render/finish/run consumes one
operation attempt; matching immutable results are verified and reused without a
new attempt. The ledger is shared across that job id within the output store.
A persistent store lock rejects simultaneous work; an interrupted lock requires
operator inspection, not automatic removal. Choosing a new output store is not
production-wide budget enforcement. Automatic loudness normalization, standalone
package deployment, and global lock stale recovery remain deferred. Oversized/failed
outputs are not published.

Source fingerprints cover package source/configuration and the workspace lockfile.
The Git field is the baseline commit; uncommitted source is identified by file
hashes, not misrepresented as that commit. Retain the corresponding source checkout
as well as the output's input snapshots when reproducing a local run.

Technical reports always retain `creative_acceptance: "not_reviewed"` and
`publication_authorized: false`. Stream/decode checks do not prove absence of
silent/black segments, clipping, bad pacing or unreadable typography. Independent
Critic review and Showrunner authorization remain required outside this package.

For the real media smoke check:

```sh
pnpm --filter @openmausbot/video-studio smoke --keep
pnpm --filter @openmausbot/video-studio smoke --speech --keep
```

Without `--keep`, only the newly created fixture tree is removed. The smoke
checks preview, full render, mix/decode, input snapshots, idempotency, leases,
corruption rejection and exhausted attempts. No live host, provider keys,
production bucket or user OpenMausBot data is used.

Source integration follows the official Remotion [bundle](https://www.remotion.dev/docs/bundle),
[composition selection](https://www.remotion.dev/docs/renderer/select-composition),
and [media rendering](https://www.remotion.dev/docs/renderer/render-media) APIs.
The [design guide](../docs/v1-video-studio/INDEX.md) remains the authority
for team roles, storage, spending and creative acceptance.
