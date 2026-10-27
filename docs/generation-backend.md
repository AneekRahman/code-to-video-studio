# Generation without local.env

When `local.env` is absent, `generate-plates` and `generate-audio` automatically
select `openmausbot-generation-v1-generate` in `us-east-1`. An existing empty or
incomplete file retains local generation and reports missing keys. A provider
failure never switches the studio to a different route. `--provider nim`,
`--provider elevenlabs` and `--provider mock` retain their explicit behavior;
`--provider backend` explicitly selects the backend even when local.env exists.

Install AWS CLI v2 and configure an AWS identity authorized to invoke the function
and read its versioned S3 assets. Prefer a restricted role/temporary credentials.
Use `AWS_PROFILE` to select a configured profile; root cannot assume a role.
The backend's operator configures NVIDIA/ElevenLabs keys privately in its Secrets
Manager records and enables Bedrock access. No provider API key is sent to this
studio. AWS credentials are still required; absence of local.env is not proof of
production readiness. Bot-box egress/credential availability must be configured by
the operator. Never copy an administrative/root session into a bot.

```sh
AWS_PROFILE=video-generation pnpm studio generate-plates \
  --job-id video-001 --plates work/my-video/plates.json --out work/my-video/plates
AWS_PROFILE=video-generation pnpm studio generate-audio \
  --job-id video-001 --story work/my-video/story.json --sound work/my-video/sound.json \
  --out work/my-video/audio
```

Use the same `--job-id` for all generation belonging to a video. It must be 1–64
letters/digits/underscores/hyphens and start with a letter or digit. Requests use
stable hashes of the operation parameters, so repeating an identical request
retrieves the backend's existing outcome rather than starting a new generation.
The CLI disables AWS SDK/CLI retries; neither failures nor timeouts trigger a
new request. AWS CLI connect/read timeouts are 10/260 seconds; backend plate
requests use a 300-second overall deadline, matching audio. Lambda has a 240-second
maximum execution time. Reconcile uncertain outcomes before operator recovery. The backend
owns NIM-first/Bedrock fallback, reservations, deduplication and direct S3 writes.
The studio downloads exact object versions and verifies SHA-256; local plate/audio
manifests retain `source_artifacts` S3 pointers for canonical provenance.

The deployed backend is narrower than the local providers. The studio fits the
shipped templates to it automatically:

- Images: 1024×1024 or 768×1344, at most 1,000 prompt characters. Every
  template plate prompt fits; a longer custom prompt is refused before any
  request (`PROMPT_TOO_LONG`).
- Speech: at most 1,500 characters, an ElevenLabs voice id the backend's
  account holds (or `backendconfigured` for the service's own voice), and no
  voice settings. A cast voice can name `backend_voice_id`; the backend uses it
  instead of `voice_id`, while local ElevenLabs keeps the designed voice. The
  isometric template's designed broadcast voice is not in the backend's account,
  so it falls back to `backendconfigured`. An unknown voice id costs a
  reservation and ends uncertain (HTTP 404), so set `backend_voice_id` for any
  voice the backend's account does not hold.
- Effects: the backend generates 3–10 seconds at a fixed prompt influence of
  0.3 and never loops. The studio sends each effect clamped to that range; the
  mixer trims a one-shot back to its designed length with a short fade and loops
  looping effects itself.
- Music: instrumental, 3–30 seconds.
- Caps: each `--job-id` may reserve the backend's per-job cap (800 cents) and
  the whole backend shares a daily cap. A long mode can exceed one job's cap;
  generation resumes from its manifest, so continue with a new `--job-id`.
  Reservations are conservative, not actual prices.

Finished exports are encoded with a capped CRF so they stay under the 16 MiB
Pegasus review limit; `quality.json` reports `within_review_size`.

`STUDIO_GENERATION_FUNCTION` and `STUDIO_GENERATION_REGION` optionally override
the non-secret endpoint configuration. `doctor` reports backend selection without
calling AWS or claiming the service is ready. Missing AWS CLI/access, missing
provider secrets and backend rejection produce configuration/error messages.

Local tests use injected transports and fixture bytes, without paid calls. Actual
AWS identity, provider compatibility, decoded asset quality and cloud deduplication
still require an isolated production-setup test; these are not claimed by local
adapter tests. Rendering/mixing/validation never invoke generation.
