# create-mode

Trigger: A person chose "New mode, then this video" or "New mode, and this
video now" in answer to the new-mode offer, or asked directly for a new mode.

Inputs: The person's original request, and their answers to the interview
below.

Method:

1. **Interview.** Ask, in as few question cards as possible (up to six
   questions each), what the series is about, what stays the same in every
   video, what changes per video, the duration range, the look and any
   references, the voice and sound, and anything to avoid. Propose a mode id
   (lowercase words joined by hyphens) and title, and let them correct it.
2. **Record the request.** Write the answers as a `mode_request` document
   (`studio schemas`) in `work/mode-requests/`, then run
   `pnpm studio check-mode-request --request <file>`. It rejects ids that are
   already registered (`MODE_EXISTS`) and returns the plan path and the
   mode's directory and skill paths.
3. **Plan.** Write the plan at the returned path in this studio's
   `plans/` before any code, with the sections Problem, Decisions, Plan,
   Verification and a dated Status log: the taste
   target, what is generated versus drawn in code, the inputs, the quality
   checks, and the build stages with what each stage's sample will show. The
   person approves the plan.
4. **Build in stages.** Build each stage in `src/modes/<id>/`, reusing shared
   providers, rendering and job running. After each stage, send a sample
   (stills, a preview or a render) and wait for the person's review before
   the next. Record each review in the plan.
5. **Register.** Export the mode with `defineMode` from
   `src/modes/<id>/mode.ts`, with a card whose `use_when` and `not_for` lines
   separate it from existing modes. Add it to `src/modes/registry.ts`, run
   `pnpm catalog:modes`, and add its skill, templates and tests.
6. **Ship.** Update the studio README, DEFERRED register and component
   catalog. Run `pnpm typecheck`, `pnpm test`, `pnpm lint` and `pnpm smoke`.
   Record evidence and the status in the plan, then commit once the person
   approves. Do not edit anything outside the studio; the team's guide is
   kept by its maintainers.
7. **The first video.** For "New mode, then this video", make it in the new
   mode once it ships. For "New mode, and this video now", make it with the
   explainer first and keep building the mode alongside it.

Permitted tools: The question card, the studio CLI and the studio folder
within the controlled workflow. This instruction grants no tools,
credentials or access.

Failure: `MODE_EXISTS` means a mode already covers the id; use it, or pick a
distinct id when the series really differs. A stage the person rejects is
reworked before the next one starts.

Exit: A registered, catalogued mode with its skill, templates, tests and a
shipped plan, and the first video produced as the person chose.

Examples: [Isometric horror story](isometric-horror-story.md) was built this
way: plates, then scene engine and story, then audio, then job integration,
with a reviewed sample after each.

Evidence: [mode tests](../tests/modes.node-test.ts).
