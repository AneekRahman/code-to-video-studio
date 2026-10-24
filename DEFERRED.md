# Decisions and implementation still needed

The user approved a package in this monorepo, JSON CLI, local rendering, a first
narrated explainer, fixture adapters, pinned contracts and isolated verification.
The local adapter/schema and fixture brand are implemented starting points;
they do not settle production deployment or creative policy.

| Area | Still to determine or implement |
|---|---|
| Live placement | Workspace/OS identity, deployed checkout and data directories, bot-box access, resource enforcement and safe update/rollback. Standalone package deployment outside monorepo root is deferred. |
| Bot/team integration | Engine/model profiles, scoped authenticated tools, Showrunner dispatch, persistent global job state/leases, Critic audiovisual service, two-round correction ledger and per-platform Publisher integration. The CLI cannot accept or publish work. |
| Production storage | S3 bucket/prefix, credentials/roles, immutable versions, upload/download adapter, retention and artifact authorization. Local files are fixture/work copies, not a change to the selected S3 design. |
| Database and orchestration | Product selection, global leases/cancellation/recovery, durable state/events/accounting, queue/backpressure. Filesystem locking only serializes this local output store. |
| Image API | Endpoint, authentication and request/response protocol, supported sizes, usage rights, free/paid pricing, limits and real adapter. No provider calls or API keys are needed for the geometric fixture. |
| Narration/alignment | ElevenLabs selection and credentials belong to Audio Director. Production word-alignment source and validation evidence remain open. This package ingests already prepared audio and timestamps; it never invents missing timing. |
| Brand/content | Final fonts, colors, platform safe areas, caption treatment, polished template/artwork and representative reference videos. Inter/OFL and the fixture palette illustrate mechanics, not accepted branding. |
| Limits | Actual dollar caps (existing proposals remain proposals), global quota/accounting, numeric production attempt/time/byte/frame/resource limits and correction enforcement. Fixture values apply only to the sample job; all local jobs must supply explicit limits. |
| Timing adjustment | Permitted operations, numeric bounds and protected cues. Current compiler rejects conflicts; nearest-half-up rounding is the implemented local contract. |
| Output/quality | Bitrate/color space/loudness targets, timing tolerances, mobile/perceptual checks, silence/clipping/black-frame detectors, calibrated Critic scoring and formal acceptance. Current checks cover streams, dimensions/fps/duration/codecs/pixel format and full decoding. |
| Advanced audio | Approved ducking, automatic loudness normalization (EBU R128), loudness measurement, looping/trimming and more elaborate mix contracts. Current explicit-gain/fade/delay tracks mix deterministically with required narration into 48kHz stereo AAC; no automatic creative choices. |
| Reuse/repair | Scene-level media cache, targeted render CLI, transition-aware partial assembly and reusable character rigs. Current code/asset reuse and full composition re-rendering are implemented. |
| Operational hardening | Hard sandbox CPU/memory/network/disk enforcement, global cancellation, global stale-lock automatic recovery, monitoring/alerts and deployment CI. Local deadlines/attempts are checked; byte limits reject oversized inputs/results but are not filesystem quotas. Interrupted store locks require manual inspection. |
| Excluded/deferred modes | AI video remains excluded. Moving footage, silent production, new isolation architecture, parallel videos and remote/Lambda rendering need separate decisions. |

See the [design decision register](../docs/v1-video-studio/open-decisions.md)
and [roadmap](../docs/v1-video-studio/implementation-roadmap.md). No live
fleet or user app state has been configured by this package.
