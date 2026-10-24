# Code-to-Video studio

The Code-to-Video bot's studio for the OpenMausBot Video Studio team: a
local, code-driven video renderer whose modes turn a brief into a narrated
9:16 short. Each workspace runs its own clone, on its own branch, as the
bot's working folder, builds its own modes in it, and takes maintainer
releases with `pnpm studio update`. [AGENTS.md](AGENTS.md) is the bot's
entry point.

This implements the approved rendering-package-first step: a strict local job
adapter, narration-driven timeline, eleven reusable components, six caption modes,
Remotion previews/visual masters, explicit FFmpeg stereo audio finishing, technical QA,
hash-verified artifacts and reproducibility snapshots. It also implements one
narrative production mode, `isometric-art-zombie-apocalypse` (generated
isometric plates animated with code-drawn rigs, generated narration, effects
and music), described below and in
[the mode skill](skills/isometric-horror-story.md). It is not a configured
OpenMausBot profile or a production-ready nine-role team. Remaining decisions and
missing capabilities are recorded in [DEFERRED.md](DEFERRED.md).

## Modes

A job's `mode` selects how it is produced. The explainer is the fallback for
every request no specialised mode fits; a job without `mode` is an explainer
job, and an unregistered mode fails with `UNKNOWN_MODE`.

- **Shipped modes** live in `src/modes/<id>/` and come with releases.
- **Local modes** are a workspace's own, in `local-modes/<id>/`, found at
  startup ([local modes](local-modes/README.md)). They import studio code
  only through the mode API, `src/mode-api.ts` and
  `src/rendering/mode-api.tsx`, and declare the API major they were written
  for. A local mode written for another major, or one that fails to load, is
  listed as unavailable with the reason and never offered. A local mode with
  a shipped mode's id stops the studio with `MODE_ID_COLLISION` until it is
  renamed. `templates/local-mode/` is a working starter.

`studio modes` prints the catalog (`pnpm catalog:modes` writes it to the
git-ignored `catalog/modes.json`): each mode's source, purpose, `use_when`
and `not_for` lines, duration range, inputs, skill, templates and commands,
the unavailable local modes, and the new-mode offer. When a person's request
falls back to the explainer, the bot asks that offer through OpenMausBot's
question card before production; unattended Showrunner jobs put a
suggestion in the report instead ([mode selection](skills/mode-selection.md)).
A person who will make more videos of a kind can have a local mode built for
it: `studio check-mode-request --request <file>` validates the interview
record and returns the plan and mode paths
([create a mode](skills/create-mode.md)).

Every mode has a fixture built with mock providers. `pnpm test:modes [id…]`
renders and verifies each one end to end under `work/conformance/`, and
fails on any technical or `quality.json` failure; it keeps the run only when
something failed.

Requires Node 24.5 or later, pnpm 10.33, git, and ffmpeg/ffprobe on PATH.
All Remotion dependencies are pinned to 4.0.538. Provider requests are never
made by frame rendering.

From this folder:

```sh
pnpm install --frozen-lockfile
pnpm studio prepare-browser
pnpm studio doctor
pnpm typecheck
pnpm test
pnpm lint
pnpm test:modes
pnpm studio schemas
pnpm studio catalog
pnpm studio modes
pnpm fixture --out work/fixture
```

## Installing in a workspace

One clone per workspace, made by the workspace admin from a release tag:

```sh
git clone --origin upstream --branch v<release> https://github.com/AneekRahman/code-to-video-studio.git video-studio
cd video-studio
git switch -c workspace/<workspace name>
```

The bot commits its local modes and plans on that branch and never pushes;
they exist only in the workspace, so its backups must include this folder.
The repository is public, so fetching a release needs no credentials.

## Updating

```sh
pnpm studio update --to v<release>
```

`update` refuses uncommitted changes and a held job lock, fetches the tag
from `upstream`, and merges it on `update/<tag>`. There it runs install,
typecheck, lint, tests, `test:modes` (so every local mode renders against the
new release) and `doctor`. Only when all pass does the workspace branch move
to the merge. On a conflict or a failed check the workspace branch is
unchanged and the error names the cause; a failed check keeps `update/<tag>`
so local modes can be migrated there (see [CHANGELOG.md](CHANGELOG.md)), and
rerunning the same update resumes it. Earlier outputs keep their recorded
source fingerprint and still verify.

## Running inside OpenMausBot

Give the Code-to-Video bot this folder as its working folder, placed inside
the bot's own folder so the bot box hides it from the workspace's other
bots, and enable no other bot's access to it. With the box on, a turn sees
only that folder, its bot folder, `HOME` and the read-only image:

- **Host image.** ffmpeg and ffprobe (with the filters `doctor` lists), Node
  and pnpm come from the image; a boxed bot cannot install them.
- **Network.** The box allows the internet only through its proxy.
  `pnpm studio` and `pnpm smoke` pass `--use-env-proxy` so provider calls and
  Remotion's one-time browser download use it.
- **Keys.** The box strips `NVIDIA_NIM` and `ELEVENLABS` from the
  environment, so they come from `local.env` in this folder (git-ignored,
  mode 600; `doctor` fails a group- or world-readable file).
- **Data.** The box gives each turn a private `/tmp` that is discarded
  afterwards. Plates, audio, jobs and output stores go in `work/`
  (git-ignored), the only place inside the studio the runner accepts.

`pnpm studio doctor` reports each of these as a check, without printing key
values, and returns `ready` when every required check passes.

`fixture` creates an input directory (a temporary one without `--out`) and prints its job path.
It generates tone-only test audio, measured timing, geometric artwork, a music
bed, and a pinned Inter font with its OFL license. Those word labels are not
spoken narration. On macOS, `fixture --speech` uses `say` to synthesize each word
and measures actual concatenated word boundaries; this is a technical speech
fixture, not production narration or perceptual acceptance.

Use the printed job path and an output store under `work/` (or outside the studio), apart from the inputs:

```sh
pnpm studio validate --job work/fixture/job.json
pnpm studio compile --job work/fixture/job.json
pnpm studio preview --job work/fixture/job.json --out work/outputs
pnpm studio render --job work/fixture/job.json --out work/outputs
pnpm studio finish --job work/fixture/job.json --out work/outputs --visual-manifest work/outputs/job/render-identity/result.json
pnpm studio run --job work/fixture/job.json --out work/outputs
pnpm studio verify --result work/outputs/job/operation-identity
```

Environment plates for the `isometric-art-zombie-apocalypse` mode are generated
before any render, from a plate set such as
`src/modes/isometric-art-zombie-apocalypse/plates.template.json`:

```sh
pnpm studio generate-plates --plates work/plates.json --out work/plates-out [--provider nim|mock] [--only plate-id,plate-id]
```

The `nim` provider calls hosted NVIDIA NIM FLUX 3 Image Klein with the
`NVIDIA_NIM` key from the environment or the git-ignored package `local.env`.
The output directory receives versioned plate files, `plates.json` (hash,
composed prompt, seed, size, model, timing) and `contact-sheet.jpg`. Plates whose
request is unchanged are reused without a provider call; a changed request
writes a new version and never overwrites. Safety-filter refusals are reported
per plate as `plates_incomplete`.

A shot list (camera move, grade, atmosphere, transition and actors walking
plate-space paths) is previewed against a plate directory with:

```sh
pnpm studio preview-shots --shots work/shots.json --plates work/plates-out --out work/empty-preview-dir
```

It renders a silent half-resolution `preview.mp4`, two stills per shot and a
contact sheet. Actors are code-drawn clay rigs rendered by `@remotion/three`
through an orthographic isometric camera; headless Chrome runs with
`gl: "angle"` for WebGL.

```sh
pnpm studio preview-story --story work/story.json --plates work/plates-out --out work/empty-preview-dir [--timing work/timing.json] [--stills-only]
```

It renders the full story (shots, narration captions, title, broadcast and
rule cards) from a story file such as
`src/modes/isometric-art-zombie-apocalypse/story.template.json`. Shot lengths
follow the narration: without `--timing` they are estimated from word counts;
a timing file must match the script word for word.

```sh
pnpm studio generate-audio --story work/story.json --sound work/sound.json --out work/audio-out [--provider elevenlabs|mock]
pnpm studio package-story --story work/story.json --sound work/sound.json --plates work/plates-out --audio work/audio-out --out work/empty-job-dir [--job-id id]
pnpm studio run --job work/empty-job-dir/job.json --out work/outputs
```

`generate-audio` reads `ELEVENLABS` from the environment or the git-ignored
package `local.env`. It synthesises each narration segment with character
timestamps, every sound effect and the music bed described by a sound file
such as `src/modes/isometric-art-zombie-apocalypse/sound.template.json`, and
writes MP3s, `audio.json` (hashes and request provenance) and `timing.json`.
Unchanged requests are reused.

`package-story` copies the story, sound design, timing, every used plate and
every generated clip into a job directory and writes a `job.json` with
`mode: "isometric-art-zombie-apocalypse"`, hashes, provenance and explicit
limits. The job then runs through the same `validate`, `preview`, `render`,
`finish`, `run` and `verify` commands as the explainer. Finishing mixes
narration (levelled per clip), cues and ducked music to −14 LUFS integrated
with at least 1 dB of true-peak headroom after AAC encoding, and pins
`mix-report.json` and `quality.json`. The quality report holds the mode's
rubric (hook, rule reading time, duration) and measured loudness, true peak,
and black or silent stretches outside the story's declared cuts; it informs
the Critic and does not accept the video. Rendering never calls a provider.

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
production-wide budget enforcement. Automatic loudness normalization for the
explainer and global lock stale recovery remain deferred. Oversized/failed
outputs are not published.

Source fingerprints cover `src/`, `local-modes/`, `package.json`, `tsconfig.json`
and the studio's `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
The Git field is the baseline commit; uncommitted source is identified by file
hashes, not misrepresented as that commit. Retain the corresponding source checkout
as well as the output's input snapshots when reproducing a local run.

Technical reports always retain `creative_acceptance: "not_reviewed"` and
`publication_authorized: false`. Stream/decode checks do not prove absence of
silent/black segments, clipping, bad pacing or unreadable typography. Independent
Critic review and Showrunner authorization remain required outside this package.

For the real media smoke check:

```sh
pnpm smoke --keep
pnpm smoke --speech --keep
```

Without `--keep`, only the newly created fixture tree is removed. The smoke
checks preview, full render, mix/decode, input snapshots, idempotency, leases,
corruption rejection and exhausted attempts. No live host, provider keys,
production bucket or user OpenMausBot data is used.

Source integration follows the official Remotion [bundle](https://www.remotion.dev/docs/bundle),
[composition selection](https://www.remotion.dev/docs/renderer/select-composition),
and [media rendering](https://www.remotion.dev/docs/renderer/render-media) APIs.
The team's design guide, a private maintainer document, remains the
authority for team roles, storage, spending and creative
acceptance.

## License and security

The studio's own code is MIT-licensed ([LICENSE](LICENSE)). Remotion is not:
it has its own license, under which some companies need a paid company
license; check [remotion.dev/license](https://www.remotion.dev/license)
before production use. Fonts are the Fontsource packages' own (OFL).

Never commit `local.env` or anything in `work/`; both are git-ignored. Report
a security problem privately to the maintainers through GitHub's private
vulnerability reporting rather than in a public issue.
