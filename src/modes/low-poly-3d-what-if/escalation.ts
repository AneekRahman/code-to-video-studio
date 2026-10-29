import {z} from 'zod';
import {worldKinds} from './world/kinds.ts';

export const modeId = 'low-poly-3d-what-if' as const;
export const durationRange = [45, 120] as const;

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const text = (max: number) => z.string().min(1).max(max);
const seconds = z.number().finite().nonnegative().max(600);
const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const pose = z.strictObject({position: vec3, target: vec3, fov: z.number().min(10).max(120)});

const Counter = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.literal('arithmetic'), start: z.number().finite(), step: z.number().finite(), unit: text(12), first_at_seconds: seconds, period_seconds: z.number().min(0.5).max(6), rungs: z.number().int().min(4).max(120), roll_seconds: z.number().min(0).max(2).default(0)}),
  z.strictObject({kind: z.literal('geometric'), start: z.number().positive().finite(), ratio: z.number().gt(1).finite(), unit: text(12), first_at_seconds: seconds, period_seconds: z.number().min(0.5).max(6), rungs: z.number().int().min(4).max(120)}),
]);

const Rung = z.strictObject({
  /** The line under the number: what this size of the number is like. */
  comparison: text(44).optional(),
  /** One sentence naming the consequence, shown for most of the rung. */
  caption: text(90).optional(),
  /** How many rungs the caption stays on screen, counted from this one. */
  caption_rungs: z.number().int().min(1).max(8).optional(),
  /** A second small line under the comparison, such as the energy it carries. */
  detail: text(48).optional(),
  /** Replaces the computed number for this rung. A numeric counter rolls to it. */
  value: z.number().finite().optional(),
  /** Replaces the printed number and unit for this rung. */
  value_text: text(40).optional(),
  /** Replaces the clock for this rung. */
  clock_text: text(24).optional(),
});

const Shot = z.strictObject({
  world: z.enum(worldKinds),
  variant: text(16).optional(),
  from_seconds: seconds,
  to_seconds: seconds,
  seed: z.number().int().min(1).max(4_294_967_295).optional(),
  /** The world's own clock starts here instead of at 0, so a second shot of the same world and seed continues the first. */
  offset_seconds: seconds.optional(),
  camera: z.strictObject({from: pose, to: pose, ease: z.enum(['linear', 'in-out']).optional()}).optional(),
});

const News = z.strictObject({from_seconds: seconds, to_seconds: seconds, headline: text(48), ticker: text(160), channel: text(24), tag: text(16)});

export const EscalationSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  what_if_id: id,
  fps: z.literal(30),
  duration_seconds: z.number().min(durationRange[0]).max(durationRange[1]),
  title: z.strictObject({lines: z.array(text(40)).min(1).max(5), to_seconds: z.number().positive().max(10), black_until_seconds: seconds.default(0)}),
  hud: z.strictObject({
    /** `{n}` is replaced by the rung number. */
    kicker: text(32),
    pill: text(36),
    value_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
    clock: z.boolean().default(false),
  }),
  counter: Counter,
  rungs: z.array(Rung).min(4).max(120),
  shots: z.array(Shot).min(1).max(160),
  news: z.array(News).max(8).default([]),
  ending: z.strictObject({
    /** The counter stops and the HUD gives way to `final` from this second. */
    from_seconds: seconds,
    final: z.strictObject({kicker: text(24), line: text(40)}).optional(),
    /** Sound drops to digital silence from this second to the end. */
    silence_from_seconds: seconds.optional(),
  }).optional(),
}).superRefine((e, ctx) => {
  const fail = (message: string, path: (string | number)[]) => ctx.addIssue({code: 'custom', message, path});
  if (e.rungs.length !== e.counter.rungs) fail(`rungs has ${e.rungs.length} entries but the counter has ${e.counter.rungs}`, ['rungs']);
  const counterEnd = e.counter.first_at_seconds + e.counter.rungs * e.counter.period_seconds;
  if (counterEnd > e.duration_seconds + 1e-6) fail('the counter runs past the end of the video', ['counter']);
  let cursor = 0;
  e.shots.forEach((shot, i) => {
    if (Math.abs(shot.from_seconds - cursor) > 1e-6) fail(`shot ${i} starts at ${shot.from_seconds} s; the previous one ended at ${cursor} s`, ['shots', i, 'from_seconds']);
    if (shot.to_seconds <= shot.from_seconds) fail(`shot ${i} ends before it starts`, ['shots', i, 'to_seconds']);
    cursor = shot.to_seconds;
  });
  if (Math.abs(cursor - e.duration_seconds) > 1e-6) fail(`shots end at ${cursor} s but the duration is ${e.duration_seconds} s`, ['shots']);
  if (e.title.to_seconds > e.counter.first_at_seconds + 1) fail('the title must not outlast the first rung by more than a second', ['title', 'to_seconds']);
  if (e.ending && e.ending.from_seconds < counterEnd - e.counter.period_seconds) fail('the ending begins before the last rung', ['ending', 'from_seconds']);
});

export type Escalation = z.infer<typeof EscalationSchema>;

export const AudioPlanSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  what_if_id: id,
  /** Level of the first and last shout under the master, in dB; the crescendo between them is what the reference's listener hears. */
  first_shout_db: z.number().min(-60).max(0),
  last_shout_db: z.number().min(-60).max(0),
  /** Rungs whose shout is replaced by the bass hit alone, e.g. when the sound cannot travel. */
  mute_rungs: z.array(z.number().int().positive()).max(120).default([]),
  /** Seconds of stretch applied to the shout as the rungs climb, 0 for none. */
  shout_stretch: z.number().min(0).max(1).default(0.25),
  bass_db: z.number().min(-40).max(0).default(-12),
  /** A continuous low rumble under the whole ladder, rising from the first level to the second; at or below -60 dB it is off. */
  bed_start_db: z.number().min(-90).max(0).default(-90),
  bed_end_db: z.number().min(-90).max(0).default(-90),
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;
