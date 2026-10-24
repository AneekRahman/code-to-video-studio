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
   `pnpm studio check-mode-request --request <file>`. It rejects ids that
   already exist (`MODE_EXISTS`) and returns the plan path and the mode's
   folder and skill paths.
3. **Plan.** Write the plan at the returned path in this studio's
   `plans/` before any code, with the sections Problem, Decisions, Plan,
   Verification and a dated Status log: the taste target, what is generated
   versus drawn in code, the inputs, the quality checks, and the build
   stages with what each stage's sample will show. Name anything the mode
   needs from the maintainers (a dependency, a mode API addition). The
   person approves the plan.
4. **Start from the template.** Copy `templates/local-mode/` to
   `local-modes/<id>/` and replace `example-title-card` with the id
   everywhere in the copy. Its `mode.ts` loads a job, renders its own
   Remotion entry (`rendering/entry.tsx`), finishes audio and builds a
   mock fixture; `pnpm test:modes <id>` should pass before stage one.
5. **Build in stages.** Grow the copy one stage at a time, entirely inside
   `local-modes/<id>/`. Import studio code only from `src/mode-api.ts` and
   `src/rendering/mode-api.tsx`, packages only from `package.json`. After
   each stage, send a sample (stills, a preview or a render) and wait for
   the person's review before the next. Record each review in the plan.
6. **Card and fixture.** The card's `use_when` and `not_for` lines separate
   it from every mode `pnpm studio modes` lists; its `skill` is
   `local-modes/<id>/skill.md` and its templates live in the folder.
   `fixture()` builds a complete job with mock providers only. Write the
   skill in the same shape as the studio's skills.
7. **Ship.** `pnpm studio modes` lists the mode as `local`; run
   `pnpm typecheck`, `pnpm test`, `pnpm lint` and `pnpm test:modes`. Record
   evidence and the status in the plan, then commit the mode folder and plan
   on the workspace branch once the person approves. Never edit maintainer
   files.
8. **The first video.** For "New mode, then this video", make it in the new
   mode once it ships. For "New mode, and this video now", make it with the
   explainer first and keep building the mode alongside it.

Permitted tools: The question card, the studio CLI and the studio folder
within the controlled workflow. This instruction grants no tools,
credentials or access.

Failure: `MODE_EXISTS` means a mode already has the id; use it, or pick a
distinct id when the series really differs. A stage the person rejects is
reworked before the next one starts. A need the mode API does not meet goes
to the maintainers through the person; do not work around it by importing
studio internals.

Exit: A local mode that `pnpm studio modes` lists and `pnpm test:modes`
passes, with its skill, templates, fixture and a shipped plan, and the first
video produced as the person chose.

Examples: [Isometric horror story](isometric-horror-story.md) was built in
these stages, as a shipped mode: plates, then scene engine and story, then
audio, then job integration, with a reviewed sample after each.

Evidence: [local mode tests](../tests/local-modes.node-test.ts) and the
[starter mode](../templates/local-mode/mode.ts).
