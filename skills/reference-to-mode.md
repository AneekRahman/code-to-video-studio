# reference-to-mode

Trigger: A person wants a video, or a new mode, made from a reference video ("make it like this reel"), or chose "New mode from this reference" at intake.

Inputs: The reference as a **file** under `work/` (the bot box has no route to Instagram or YouTube; the person attaches the file, or the operator downloads it outside the box), the person's wish, and the usual new-mode interview ([create-mode](create-mode.md)).

Credit: the measure-look-critique-fix loop and the fixed critique passes are adapted from [taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, Leonxlnx); reading a reference by timecode before copying anything is adapted from Hypit's published reference-video guidance. No code from either is used.

## What this can and cannot do

The studio **measures** a reference: cut times (to about 0.1 s), scene lengths, the palette and its proportions, overall activity, loudness. It does **not** know the typography, the layout inside a frame, what a transition is, the easing of any motion, the words, or what a graphic depicts: `unmeasured` in the analysis lists them. You read those from the frames and record each as a timestamped observation. The mode is reproduced to the precision of the measurements and of those observations, not beyond. Say so to the person.

References inform technique. Never reproduce a reference's text, characters, logos or artwork; the new mode must work for a different subject.

## Method

1. **Measure.** `pnpm studio analyze-reference --video work/ref/<name>.mp4 --out work/ref/<name>-analysis`. Open `frames/tiles-*.jpg` (the analysis lists the second each tile was taken). A reference that analyses to one scene when you can see many (graphics animating inside a fixed frame) is read from the tiles; the cut threshold is adaptive, `--cut-threshold` overrides it.
2. **Read it twice.** First as a whole: hook, argument, payoff, what the viewer is meant to feel. Then close, scene by scene: for each system you can see (typography, layout, motion, transition, color, sound, graphic) write an observation: `{reference, start_seconds, end_seconds, system, behavior}`. A behavior says what it is and how it enters, moves, persists and leaves, in numbers where you can (a card slides up 40 px in about 0.3 s, then holds). A scene with no observation, or a required system never observed, fails `check-mode-request` (`REFERENCE_UNDER_OBSERVED`).
3. **Name the tokens.** From the analysis and observations write down the design tokens the mode will use: palette with proportions (from `palette`), type scale and case, spacing and border treatment, shadow, motion durations and easing, cut rate and median scene length, loudness target. Each token cites the observation or measurement it comes from.
4. **Record the request.** The new-mode interview, with `reference_analyses` (the analysis file and the video's sha256) and `observations`, then `pnpm studio check-mode-request --request <file>`. Fix what it names.
5. **Plan and build in stages** exactly as [create-mode](create-mode.md) says. Add one rule: after each stage render a sample, then run `pnpm studio compare-reference --analysis <reference-analysis.json> --video <sample.mp4> --out work/ref/<stage>` and put the `measured_fidelity` and the failed checks in the plan. A failed check is a defect to fix or a deviation to justify in writing.
6. **Look, then critique.** Measuring is not judging. Open the sample's frames and judge only the pictures (a problem visible in a frame is real, whatever the code says). Fixed passes, in this order:
   1. One second, then five: what does the first frame say? Is there one dominant element?
   2. Squint at a thumbnail: does it reduce to two or three masses, with the same hierarchy as the reference?
   3. Cover the title: could the frame belong to a different series? If so the idea is wrong, not the details.
   4. Edges: count the distinct left edges in a frame; the reference's count is the target.
   5. Colour: name the proportions (a measured number now) and where the accent sits.
   6. Type: is the jump from caption to title decisive, and is the case right?
   7. Sameness: write one word per scene for its layout; the reference's variety is the target.
   8. Motion: read a frame grid at 0.1 s steps through one entrance; compare duration, path and settle with your observation of the reference.
   9. Collisions: nothing lies over a title or a caption at any frame.
   Fix the top three problems in this order (idea, hierarchy, composition, type, colour, detail, motion last), render, measure, look again. Three rounds at most per stage, then ask the person.
7. **Review and ship.** Send the sample, the comparison numbers and your critique for the person's review before the next stage, as create-mode requires.

## Exit

A mode whose plan holds, per stage, the comparison numbers and the critique; whose `check-mode-request` passed; and whose last `compare-reference` is recorded with each remaining failed check explained. Creative acceptance stays with the person and the Critic.

Permitted tools: The studio CLI and the studio folder. This instruction grants no tools, credentials or access.
