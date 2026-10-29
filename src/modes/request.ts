import {z} from 'zod';
import {readJson} from '../files.ts';
import {StudioError} from '../errors.ts';
import {ReferenceAnalysisSchema} from '../reference.ts';
import {ModeIdSchema, reservedModeIdPrefix} from './mode.ts';
import {registry, type Registry} from './registry.ts';

const text = z.string().trim().min(1);

export const observationSystems = ['typography', 'layout', 'motion', 'transition', 'color', 'sound', 'graphic'] as const;
/** Systems a reference must be read for before a mode may be planned from it; `sound` only when the reference has audio. */
export const requiredSystems = ['typography', 'layout', 'motion', 'transition'] as const;

/** One thing seen or heard in a reference, pinned to the seconds where it happens. */
export const ObservationSchema = z.strictObject({
  reference: z.number().int().nonnegative().default(0),
  start_seconds: z.number().finite().nonnegative(),
  end_seconds: z.number().finite().positive(),
  system: z.enum(observationSystems),
  behavior: z.string().trim().min(24, 'Describe the behaviour: what it is, how it enters, moves and leaves'),
}).refine(o => o.end_seconds > o.start_seconds, 'end_seconds must be after start_seconds');

/** The new-mode interview, recorded when a person chooses to create a mode. It seeds the mode's plan. */
export const ModeRequestSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  mode_id: ModeIdSchema,
  title: text,
  requested_at: z.iso.datetime(),
  /** Whether the video that prompted the request waits for the new mode or is made with the explainer meanwhile. */
  first_video: z.enum(['wait-for-mode', 'explainer-now']),
  /** The person's original request, verbatim. */
  example_request: text,
  /** What the videos of this kind are about, across the series. */
  series: text,
  /** What stays the same in every video: format, structure, characters, look, sign-off. */
  constant: z.array(text).min(1),
  /** What changes from one video to the next: topic, location, cast, rules, data. */
  varies: z.array(text).min(1),
  duration_seconds: z.strictObject({min: z.number().positive(), max: z.number().positive()}).refine(range => range.min <= range.max, 'min must not exceed max'),
  look: text,
  /** Links or descriptions of reference videos and images; references inform technique, never copying. */
  references: z.array(text),
  /** Measured analyses (`studio analyze-reference`) of the reference videos, in the order observations index them. */
  reference_analyses: z.array(z.strictObject({analysis: text, reference_sha256: z.string().regex(/^[a-f0-9]{64}$/)})).default([]),
  /** What an observer saw and heard, with timestamps; required, and checked for coverage, when reference_analyses is given. */
  observations: z.array(ObservationSchema).default([]),
  voice_and_sound: text,
  avoid: z.array(text),
});
export type ModeRequest = z.infer<typeof ModeRequestSchema>;

/** Refuses a reference-based request that has not read its reference closely: unknown seconds, uncovered scenes, unread systems. */
export async function checkReferenceCoverage(request: ModeRequest) {
  if (request.reference_analyses.length === 0) {
    if (request.observations.length > 0) throw new StudioError('REFERENCE_UNMEASURED', 'Observations need a reference_analyses entry; run studio analyze-reference first');
    return null;
  }
  if (request.observations.length === 0) throw new StudioError('REFERENCE_UNDER_OBSERVED', 'A reference-based mode needs timestamped observations of what the reference does');
  const report: {reference: number; scenes: number; uncovered: {index: number; start: number; end: number}[]; systems_missing: string[]}[] = [];
  for (const [index, entry] of request.reference_analyses.entries()) {
    const analysis = await readJson(entry.analysis, ReferenceAnalysisSchema);
    if (analysis.video.sha256 !== entry.reference_sha256) throw new StudioError('REFERENCE_CHANGED', `Analysis ${entry.analysis} is of a different video than the request names`);
    const mine = request.observations.filter(o => o.reference === index);
    const outside = mine.filter(o => o.end_seconds > analysis.video.duration_seconds + 0.25);
    if (outside.length > 0) throw new StudioError('OBSERVATION_OUT_OF_RANGE', `Observation at ${outside[0]!.start_seconds}s to ${outside[0]!.end_seconds}s is past the ${analysis.video.duration_seconds}s reference`);
    const uncovered = analysis.scenes.filter(scene => scene.duration >= 0.5 && !mine.some(o => o.start_seconds < scene.end && o.end_seconds > scene.start)).map(scene => ({index: scene.index, start: scene.start, end: scene.end}));
    const needed = [...requiredSystems, ...(analysis.audio ? ['sound' as const] : [])];
    const systemsMissing = needed.filter(system => !mine.some(o => o.system === system));
    report.push({reference: index, scenes: analysis.scenes.length, uncovered, systems_missing: systemsMissing});
    if (uncovered.length > 0 || systemsMissing.length > 0) {
      throw new StudioError('REFERENCE_UNDER_OBSERVED', `Reference ${index} is not read closely enough: ${uncovered.length} of ${analysis.scenes.length} scenes have no observation${uncovered.length ? ` (first at ${uncovered[0]!.start}s to ${uncovered[0]!.end}s)` : ''}${systemsMissing.length ? `; no observation of ${systemsMissing.join(', ')}` : ''}`, {uncovered, systems_missing: systemsMissing});
    }
  }
  const unindexed = request.observations.filter(o => o.reference >= request.reference_analyses.length);
  if (unindexed.length > 0) throw new StudioError('OBSERVATION_OUT_OF_RANGE', 'An observation names a reference that has no analysis');
  return report;
}

export async function checkModeRequest(path: string, current: Registry = registry) {
  const request = await readJson(path, ModeRequestSchema);
  if (request.mode_id.startsWith(reservedModeIdPrefix)) throw new StudioError('MODE_ID_RESERVED', `Mode ids starting with ${reservedModeIdPrefix} are reserved for the studio's tests; choose another id`);
  const taken = [...current.modes.map(mode => mode.card.id), ...current.unavailable.map(mode => mode.id)];
  if (taken.includes(request.mode_id)) {
    throw new StudioError('MODE_EXISTS', `Mode "${request.mode_id}" already exists; use it, or choose another id`, {registered: taken});
  }
  const coverage = await checkReferenceCoverage(request);
  const day = request.requested_at.slice(0, 10);
  const directory = `local-modes/${request.mode_id}`;
  return {
    status: 'valid' as const,
    mode_id: request.mode_id,
    first_video: request.first_video,
    reference_coverage: coverage,
    plan: `plans/${day}-cannot-make-${request.mode_id}-videos/plan.md`,
    mode_directory: `${directory}/`,
    skill: `${directory}/skill.md`,
    next: [
      'Write the plan from this request, with the stages and what each stage sample will show; get the person to approve it.',
      `Build stage by stage inside ${directory}/, importing studio code only from src/mode-api.ts and src/rendering/mode-api.tsx; send a sample after each stage and wait for the person's review before the next.`,
      `Export the mode as the default export of ${directory}/mode.ts, with a mock-provider fixture; pnpm studio modes must list it and pnpm test:modes must pass.`,
      'Record evidence in the plan, then commit the mode folder and plan on the workspace branch once the person approves.',
    ],
  };
}
