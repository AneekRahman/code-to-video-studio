# remotion-scene-authoring

Trigger: Author or modify the explainer.

Inputs: Approved scene plan, validated job and pinned assets.

Method: Search catalog; compose existing components; keep frame calculations pure; render scene previews; preserve exclusive frame ends.

Permitted tools: Local TypeScript checks, studio preview/render, artifact inspection. This instruction grants no tools, credentials or access.

Failure: Reject missing requirements and return a structured conflict.

Exit: Changed scene previews and technical checks pass; no self-issued creative pass.

Examples: return a versioned artifact/report for the requested outcome; never claim that a successful command proves creative acceptance.

Evidence: [package tests](../tests/contracts.node-test.ts), [render smoke](../scripts/smoke.ts), and [catalog](../catalog/components.json).
