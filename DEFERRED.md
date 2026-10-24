# Decisions and implementation still needed

The user approved a package in this monorepo, JSON CLI, local rendering, a first
narrated explainer, fixture adapters, pinned contracts and isolated verification.
The local adapter/schema and fixture brand are implemented starting points;
they do not settle production deployment or creative policy.

| Area | Still to determine or implement |
|---|---|
| Live placement | The studio is a self-contained project (own lockfile and pnpm settings), runs from a copy in the bot's own folder, sends provider calls through the bot box's proxy, keeps job data in `work/`, reads keys from `local.env`, and `doctor` checks the environment. Still open: creating the Code-to-Video bot and its working folder in a workspace, switching the bot box on, ffmpeg in the host image, verifying `doctor` and a render inside a real box, resource enforcement, and safe update/rollback of the studio copy. |
| Bot/team integration | Engine/model profiles, scoped authenticated tools, Showrunner dispatch, persistent global job state/leases, Critic audiovisual service, two-round correction ledger and per-platform Publisher integration. The CLI cannot accept or publish work. |
| Production storage | S3 bucket/prefix, credentials/roles, immutable versions, upload/download adapter, retention and artifact authorization. Local files are fixture/work copies, not a change to the selected S3 design. |
| Database and orchestration | Product selection, global leases/cancellation/recovery, durable state/events/accounting, queue/backpressure. Filesystem locking only serializes this local output store. |
| Image API | Hosted NVIDIA NIM FLUX 3 Image Klein is implemented for `generate-plates` (key `NVIDIA_NIM`, generation only, no reference images) and used by the isometric mode. Still open: pricing and free/paid status, rate limits, retry policy, usage-rights confirmation, the possible move to AWS Bedrock image models, and use by the explainer. |
| Narration/alignment | The isometric mode generates narration with ElevenLabs text-to-speech and character timestamps (`generate-audio`, key `ELEVENLABS`) and validates word timing against the script. The explainer still ingests prepared audio and timestamps. Audio Director ownership of casting, production credentials and a second alignment source remain open. |
| Brand/content | Final fonts, colors, platform safe areas, caption treatment, polished template/artwork and representative reference videos. Inter/OFL and the fixture palette illustrate mechanics, not accepted branding. |
| Limits | Actual dollar caps (existing proposals remain proposals), global quota/accounting, numeric production attempt/time/byte/frame/resource limits and correction enforcement. Fixture values apply only to the sample job; all local jobs must supply explicit limits. |
| Timing adjustment | Permitted operations, numeric bounds and protected cues. Current compiler rejects conflicts; nearest-half-up rounding is the implemented local contract. |
| Output/quality | The isometric mode writes `quality.json` per run: hook timing, rule reading time, duration, integrated loudness, true peak, and black or silent stretches outside declared cuts. Thresholds are calibrated on one reviewed story only. Still open: bitrate and colour-space targets, mobile perceptual checks, calibrated Critic scoring and formal acceptance. |
| Advanced audio | The isometric mode implements per-voice processing, per-clip dialogue levelling, sidechain ducking, looping beds, word-anchored cues, music and master silences, and two-pass EBU R128 normalisation to −14 LUFS with true-peak headroom for AAC. The explainer keeps explicit gain, fade and delay tracks. Still open: the approved per-platform loudness policy, and Audio Director approval of mixes. |
| Reuse/repair | Generated plates and audio are reused when the request is unchanged, and the isometric mode has reusable clay character rigs. Still open: a scene-level media cache, a targeted render CLI and transition-aware partial assembly. Repairs re-render the full composition. |
| Operational hardening | Hard sandbox CPU/memory/network/disk enforcement, global cancellation, global stale-lock automatic recovery, monitoring/alerts and deployment CI. Local deadlines/attempts are checked; byte limits reject oversized inputs/results but are not filesystem quotas. Interrupted store locks require manual inspection. |
| Mode selection | The mode registry, published mode catalog, `UNKNOWN_MODE` dispatch, new-mode offer wording and `check-mode-request` are implemented. Choosing a mode from a request is the bot's judgment against each card's `use_when` and `not_for`, not code. Still open: a production-report schema with the new-mode suggestion for unattended jobs, a persistent record of offers and answers, and a configured bot profile that follows the mode-selection skill. |
| Excluded/deferred modes | AI video remains excluded. Moving footage, silent production, new isolation architecture, parallel videos and remote/Lambda rendering need separate decisions. |

The team's design guide (decision register and roadmap) and the
repository's plans are kept by maintainers outside this studio. No live
fleet or user app state has been configured by this studio.
