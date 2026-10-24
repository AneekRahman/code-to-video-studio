# mode-selection

Trigger: Any new video request, from a person in an OpenMausBot conversation
or from a Showrunner brief, before any script, plate, audio or job work.

Inputs: The request or brief, and the mode catalog from
`pnpm studio modes`: shipped modes, this workspace's local modes, and any
local modes that are unavailable (with the reason).

Method:

1. Consider only the modes in `modes`; never offer one listed under
   `unavailable` (report its reason to the person instead, when it would
   have fitted). Read every card's `use_when` and `not_for`. Choose a specialised mode
   only when the request matches one of its `use_when` lines and none of its
   `not_for` lines. Matching is a judgment on what the video is, not on
   keywords: a zombie-themed birthday invitation is not a zombie survival
   story.
2. If a brief already names a mode, confirm it against that card; a
   mismatch goes back to Showrunner rather than being silently corrected.
3. If no specialised mode fits, the video uses the fallback mode
   (`explainer`). Then:
   - **A person asked in the conversation:** before starting production,
     ask the catalog's `new_mode_offer.question` with its choice labels as
     one-tap answers, through the OpenMausBot question card (the `ask_user`
     tool, or the engine's native `AskUserQuestion`). If neither tool is
     enabled for this bot, ask the same question with the choices in a chat
     reply and wait for the answer. Ask once per request,
     not again on revisions of it. Act on the answer as the matching
     choice's `action` says; for a new mode, follow
     [create-mode](create-mode.md).
   - **Showrunner dispatched the job unattended:** do not wait for anyone.
     Produce with the explainer and add a new-mode suggestion to the
     production report: the request, why no mode fits, and what a dedicated
     mode would standardise.
4. Write the chosen id in the job's `mode` field. A job without `mode` is an
   explainer job; a job naming an unregistered mode fails with
   `UNKNOWN_MODE`, and one naming an unavailable local mode with
   `MODE_UNAVAILABLE`.

Permitted tools: The mode catalog and the OpenMausBot question card. This
instruction grants no tools, credentials or access.

Failure: `UNKNOWN_MODE` lists the registered ids; a brief that names the
wrong mode returns to Showrunner.

Exit: One registered mode id for the job, and for a fallback requested by a
person, their recorded answer to the new-mode offer.

Examples: "Explain three ways to save on groceries" → explainer, offer made.
"Rules for surviving the first night of the outbreak, in the isometric style"
→ `isometric-art-zombie-apocalypse`, no offer.

Evidence: [mode tests](../tests/modes.node-test.ts) and
[local mode tests](../tests/local-modes.node-test.ts).
