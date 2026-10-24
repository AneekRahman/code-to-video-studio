# narration-sync

Trigger: Compile or repair captions/timing.

Inputs: Finalized narration hash, validated script/word timestamps, scene boundaries.

Method: Use secondsToFrames nearest-half-up; validate transcript/segment order; compile exclusive ranges; never stretch speech or invent timings.

Permitted tools: studio validate/compile, ffprobe, tests. This instruction grants no tools, credentials or access.

Failure: TIMING_CONFLICT returns to Audio Director/Showrunner; numeric adjustment policy is deferred.

Exit: No gaps/overlap/zero-frame words; scene coverage and actual audio duration agree.

Examples: return a versioned artifact/report for the requested outcome; never claim that a successful command proves creative acceptance.

Evidence: [package tests](../tests/contracts.node-test.ts), [render smoke](../scripts/smoke.ts), and [catalog](../catalog/components.json).
