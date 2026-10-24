# quality-checklist

Trigger: Before claiming technical completion.

Inputs: Exact MP4, expected profile and input snapshots.

Method: Verify hashes, dimensions/fps/duration/codecs, AAC presence for final mix, and full decode; review contact sheet; retain technical-only state.

Permitted tools: studio verify, media inspector, isolated smoke. This instruction grants no tools, credentials or access.

Failure: Failures block technical completion; black/silence/loudness and perceptual gates remain explicitly deferred.

Exit: Durable result.json and reports; independent audiovisual Critic and Showrunner remain required.

Examples: return a versioned artifact/report for the requested outcome; never claim that a successful command proves creative acceptance.

Evidence: [package tests](../tests/contracts.node-test.ts), [render smoke](../scripts/smoke.ts), and [catalog](../catalog/components.json).
