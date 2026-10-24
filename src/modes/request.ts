import {z} from 'zod';
import {readJson} from '../files.ts';
import {StudioError} from '../errors.ts';
import {ModeIdSchema} from './mode.ts';
import {modes} from './registry.ts';

const text = z.string().trim().min(1);

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
  voice_and_sound: text,
  avoid: z.array(text),
});
export type ModeRequest = z.infer<typeof ModeRequestSchema>;

export async function checkModeRequest(path: string) {
  const request = await readJson(path, ModeRequestSchema);
  if (modes.some(mode => mode.card.id === request.mode_id)) {
    throw new StudioError('MODE_EXISTS', `Mode "${request.mode_id}" is already registered; use it, or choose another id`, {registered: modes.map(m => m.card.id)});
  }
  const day = request.requested_at.slice(0, 10);
  return {
    status: 'valid' as const,
    mode_id: request.mode_id,
    first_video: request.first_video,
    plan: `plans/${day}-cannot-make-${request.mode_id}-videos/plan.md`,
    mode_directory: `src/modes/${request.mode_id}/`,
    skill: `skills/${request.mode_id}.md`,
    next: [
      'Write the plan from this request, with the stages and what each stage sample will show; get the person to approve it.',
      'Build stage by stage; send a sample after each stage and wait for the person\'s review before the next.',
      'Register the mode in src/modes/registry.ts, regenerate catalog/modes.json, and add its skill, templates and tests.',
      'Update the studio README, DEFERRED and component catalog, record evidence in the plan, then commit once the person approves.',
    ],
  };
}
