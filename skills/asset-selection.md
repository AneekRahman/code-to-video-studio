# asset-selection

Trigger: Choose still artwork for a scene.

Inputs: Approved scene intent and rights/provenance.

Method: Reuse permitted assets; use local raster stills. Real image API adapter awaits its protocol. No AI video, imported moving footage, or live provider fallback.

Permitted tools: Local fixture inputs and media inspection. This instruction grants no tools, credentials or access.

Failure: CONFIG_REQUIRED for unconfigured service paths; missing assets return to owner.

Exit: Pinned validated inputs with rights evidence and no undisclosed provider spend.

Examples: return a versioned artifact/report for the requested outcome; never claim that a successful command proves creative acceptance.

Evidence: [package tests](../tests/contracts.node-test.ts), [render smoke](../scripts/smoke.ts), and [catalog](../catalog/components.json).
