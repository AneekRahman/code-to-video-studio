# render-troubleshooting

Trigger: A job or media check fails.

Inputs: Structured error, job manifest, pinned source and artifact reports.

Method: Inspect error code; verify ffmpeg/ffprobe, fonts and hashes; reconcile output; retry only with available attempts and deadline.

Permitted tools: studio validate/verify, tests, local tool diagnostics. This instruction grants no tools, credentials or access.

Failure: Do not auto-delete interrupted lock or bypass limits; operator inspects lock ownership.

Exit: Explicit success or preserved actionable failure; no secrets in reports.

Examples: return a versioned artifact/report for the requested outcome; never claim that a successful command proves creative acceptance.

Evidence: [package tests](../tests/contracts.node-test.ts), [render smoke](../scripts/smoke.ts), and [catalog](../catalog/components.json).
