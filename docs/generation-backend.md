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

The current deployed backend is deliberately narrower than the local providers:

- Images: **1024×1024**, at most 1,000 prompt characters and seed 0–858993459.
  Existing vertical plate templates must be deliberately adapted; no implicit
  resize, crop or change to framing is performed.
- Speech: at most 1,500 characters; set sound cast `voice_id` to the explicit
  marker **`backendconfigured`**, model `eleven_multilingual_v2`, and omit voice
  settings. This selects the service-configured voice, not three independently
  cast voices. Unsupported casting/model/settings are refused before generation.
- Effects: 3–10 seconds, `loop: false`, `prompt_influence: 0.3`, matching the
  service's fixed defaults. Music: instrumental, 3–30 seconds.
- Backend defaults reserve USD 10/day and USD 5/job; conservative reservations
  are not actual prices. Inspect service allowances before a multi-asset run.

Existing templates may exceed these limits; configure compatible input files or
keep `local.env` for direct providers. Validation happens before each provider
request, not as an all-assets budget/compatibility guarantee. Earlier successfully
generated assets remain saved if a later request is unsupported.

`STUDIO_GENERATION_FUNCTION` and `STUDIO_GENERATION_REGION` optionally override
the non-secret endpoint configuration. `doctor` reports backend selection without
calling AWS or claiming the service is ready. Missing AWS CLI/access, missing
provider secrets and backend rejection produce configuration/error messages.

Local tests use injected transports and fixture bytes, without paid calls. Actual
AWS identity, provider compatibility, decoded asset quality and cloud deduplication
still require an isolated production-setup test; these are not claimed by local
adapter tests. Rendering/mixing/validation never invoke generation.
