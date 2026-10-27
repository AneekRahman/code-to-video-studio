import {z} from 'zod';

const Point = z.object({x: z.number(), y: z.number(), zoom: z.number().positive()});
const Ease = z.enum(['linear', 'in', 'out', 'in-out']);

export const ActorSchema = z.object({
  actor_id: z.string(),
  rig: z.enum(['hero', 'zombie', 'double']),
  gait: z.enum(['idle', 'walk', 'run', 'shamble', 'lunge', 'knock']),
  height: z.number().positive(),
  carrying: z.string().optional(),
  enter_at: z.number().min(0).max(1).optional(),
  facing_deg: z.number().optional(),
  path: z.array(z.object({at: z.number().min(0).max(1), x: z.number(), y: z.number()})).min(1),
});

export const ShotSchema = z.object({
  shot_id: z.string(),
  plate_id: z.string(),
  grade: z.enum(['dusk', 'twilight', 'night', 'interior-night', 'blackout']),
  segments: z.array(z.string()).default([]),
  lead_in: z.number().min(0).default(0),
  extra_seconds: z.number().min(0).default(0),
  transition_in: z.enum(['cut', 'glitch', 'flash']).default('cut'),
  camera: z.object({from: Point, to: Point, ease: Ease.default('linear'), drift: z.number().min(0).default(0)}),
  shakes: z.array(z.object({at: z.number(), strength: z.number(), duration_seconds: z.number().positive()})).default([]),
  atmosphere: z.object({
    fog: z.number().min(0).max(1).default(0),
    particles: z.enum(['none', 'dust', 'ash']).default('none'),
    flicker: z.number().min(0).max(1).default(0),
    heartbeat_pulse: z.number().min(0).max(1).default(0),
  }),
  actors: z.array(ActorSchema).default([]),
});

export const OverlaySchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('title'), shot_id: z.string(), lines: z.array(z.object({text: z.string(), accent: z.boolean()})), from: z.number(), to: z.number()}),
  z.object({kind: z.literal('lights-out'), shot_id: z.string(), segment_id: z.string(), word: z.string()}),
  z.object({kind: z.literal('broadcast'), shot_id: z.string(), until_shot_id: z.string(), label: z.string(), intro_segment_id: z.string()}),
  z.object({kind: z.literal('rule'), segment_id: z.string(), number: z.number().int(), text: z.string()}),
  z.object({kind: z.literal('window-shadows'), shot_id: z.string(), region: z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()}), count: z.number().int()}),
  z.object({kind: z.literal('cut-to-black'), shot_id: z.string(), from: z.number()}),
]);

export const StorySchema = z.object({
  story_id: z.string(),
  title: z.string(),
  fps: z.number().int().positive(),
  segments: z.array(z.object({segment_id: z.string(), voice: z.string(), text: z.string(), pause_after: z.number().min(0).default(0)})),
  shots: z.array(ShotSchema).min(1),
  overlays: z.array(OverlaySchema).default([]),
});

export const TimingSchema = z.object({
  segments: z.array(z.object({
    segment_id: z.string(),
    duration_seconds: z.number().positive(),
    words: z.array(z.object({text: z.string(), start: z.number(), end: z.number()})),
  })),
});

const Anchor = z.object({
  shot_id: z.string().optional(),
  segment_id: z.string().optional(),
  word: z.string().optional(),
  edge: z.enum(['start', 'end']).default('start'),
  at: z.number().optional(),
  offset_seconds: z.number().default(0),
}).refine(anchor => Boolean(anchor.shot_id) !== Boolean(anchor.segment_id), 'An anchor names exactly one shot or segment');
export type Anchor = z.infer<typeof Anchor>;

export const SoundSchema = z.object({
  story_id: z.string(),
  cast: z.record(z.string(), z.object({process: z.enum(['close-mic', 'broadcast', 'through-door']), gain_db: z.number().default(0)}).loose()),
  effects: z.array(z.object({effect_id: z.string(), duration_seconds: z.number()}).loose()),
  music: z.object({
    gain_db: z.number().default(0),
    fade_in_seconds: z.number().default(0),
    fade_out_seconds: z.number().default(0),
    silences: z.array(z.object({from: Anchor, until: Anchor.optional()})).default([]),
  }).loose(),
  knock: z.object({effect_id: z.string(), gain_db: z.number().default(0)}),
  silences: z.array(z.object({from: Anchor, until: Anchor.optional()})).default([]),
  cues: z.array(z.object({
    effect_id: z.string(),
    at: Anchor,
    until: Anchor.optional(),
    gain_db: z.number().default(0),
    fade_in_seconds: z.number().default(0),
    fade_out_seconds: z.number().default(0),
  })),
});

export const PlateManifestSchema = z.object({plates: z.array(z.object({plate_id: z.string(), file: z.string(), width: z.number(), height: z.number()}).loose())});
export const AudioManifestSchema = z.object({assets: z.array(z.object({asset_id: z.string(), file: z.string(), duration_seconds: z.number()}).loose())});

export type Story = z.infer<typeof StorySchema>;
export type Sound = z.infer<typeof SoundSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type Shot = z.infer<typeof ShotSchema>;
