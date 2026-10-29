import {z} from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const FileRef = z.strictObject({path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/)});
export const FormatSchema = z.strictObject({width: z.literal(1080), height: z.literal(1920), fps: z.literal(30), duration_seconds: z.number().finite().positive(), codec: z.literal('h264'), container: z.literal('mp4')});
export const LimitsSchema = z.strictObject({max_operation_attempts: z.number().int().positive(), max_runtime_seconds: z.number().positive().finite(), max_input_bytes: z.number().int().positive(), max_output_bytes: z.number().int().positive(), max_frames: z.number().int().positive(), concurrency: z.literal(1)});
export const AssetSchema = <K extends [string, ...string[]]>(kinds: K) => z.strictObject({asset_id: id, kind: z.enum(kinds), file: FileRef, provenance: z.string().min(1), usage_rights: z.string().min(1)});
/** The narrated explainer job; a job without `mode` is this one. */
export const JobSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  adapter: z.literal('local-fixture'),
  mode: z.literal('explainer').optional(),
  job_id: id,
  status: z.literal('approved_for_visual_production'),
  format: FormatSchema,
  inputs: z.strictObject({script: FileRef, storyboard: FileRef, narration: FileRef, timestamps: FileRef, brand: FileRef, mix: FileRef}),
  assets: z.array(AssetSchema(['still', 'font', 'audio'])),
  limits: LimitsSchema,
});
/**
 * An isometric horror story job. Plates are `still` assets whose `asset_id` is the plate id;
 * generated clips are `audio` assets named `speech-<segment_id>`, `effect-<effect_id>` and `music`.
 */
export const StoryJobSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  adapter: z.literal('local-fixture'),
  mode: z.literal('isometric-art-zombie-apocalypse'),
  job_id: id,
  status: z.literal('approved_for_visual_production'),
  format: FormatSchema,
  inputs: z.strictObject({story: FileRef, sound: FileRef, timing: FileRef}),
  assets: z.array(AssetSchema(['still', 'audio'])),
  limits: LimitsSchema,
});
export const ScriptSchema = z.strictObject({schema_version: z.literal('1.0'), segments: z.array(z.strictObject({segment_id: id, text: z.string().min(1).regex(/[\p{L}\p{N}]/u, 'Script segment must contain spoken characters')})).min(1)});
export const TimingSchema = z.strictObject({schema_version: z.literal('1.0'), audio_sha256: z.string().regex(/^[a-f0-9]{64}$/), duration_seconds: z.number().finite().positive(), words: z.array(z.strictObject({segment_id: id, text: z.string().min(1).regex(/[\p{L}\p{N}]/u, 'Timed word must contain spoken characters'), start: z.number().finite().nonnegative(), end: z.number().finite().positive()})).min(1)});
export const treatments = ['headline', 'comparison', 'checklist', 'stat', 'quote', 'steps', 'chart', 'code', 'grid', 'gauge', 'orbit'] as const;
export const transitions = ['auto', 'cut', 'wipe', 'push', 'iris', 'zoom'] as const;
export const StoryboardSchema = z.strictObject({schema_version: z.literal('1.0'), scenes: z.array(z.strictObject({
  scene_id: id, start_seconds: z.number().finite().nonnegative(), end_seconds: z.number().finite().positive(),
  treatment: z.enum(treatments), title: z.string().min(1).max(100),
  lines: z.array(z.string().min(1).max(100)).max(4).default([]), value: z.number().finite().optional(), suffix: z.string().max(12).optional(),
  still_asset_id: id.optional(), narration_segment_ids: z.array(id).min(1),
  kicker: z.string().min(1).max(32).optional(),
  data: z.array(z.strictObject({label: z.string().min(1).max(18), value: z.number().finite().nonnegative()})).min(2).max(6).optional(),
  unit: z.string().max(8).optional(),
  chart_style: z.enum(['bars', 'iso']).optional(),
  emphasis: z.array(z.string().min(1).max(24)).max(8).optional(),
  code: z.strictObject({language: z.string().min(1).max(16), text: z.string().min(1).max(480), highlight: z.array(z.number().int().positive()).max(6).optional()}).optional(),
  transition: z.enum(transitions).optional(),
  still_layout: z.enum(['panel', 'full']).optional(),
  still_motion: z.enum(['push-in', 'pull-out', 'pan-left', 'pan-right']).optional(),
})).min(1)});
export const BrandSchema = z.strictObject({schema_version: z.literal('1.0'), brand_id: id, version: z.string().min(1), background: color, foreground: color, accent: color, font_asset_id: id, caption_mode: z.enum(['phrase', 'word-highlight', 'karaoke', 'keyword', 'lower-third', 'none']), motion: z.enum(['calm', 'dynamic', 'punchy']).optional(), look: z.enum(['studio', 'paper']).optional(), safe_area: z.strictObject({top: z.number().int().min(0).max(400), bottom: z.number().int().min(0).max(600), left: z.number().int().min(0).max(250), right: z.number().int().min(0).max(250)})});
export const MixSchema = z.strictObject({schema_version: z.literal('1.0'), narration_gain_db: z.number().min(-40).max(12), tracks: z.array(z.strictObject({asset_id: id, start_seconds: z.number().finite().nonnegative(), duration_seconds: z.number().finite().positive(), gain_db: z.number().min(-60).max(12), fade_in_seconds: z.number().finite().nonnegative(), fade_out_seconds: z.number().finite().nonnegative()})).max(16)});
export type Job = z.infer<typeof JobSchema>;
export type StoryJob = z.infer<typeof StoryJobSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type Scene = z.infer<typeof StoryboardSchema>['scenes'][number];
export type Brand = z.infer<typeof BrandSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type Mix = z.infer<typeof MixSchema>;
export type CompiledScene = Scene & {startFrame: number; endFrame: number};
export type CompiledWord = Timing['words'][number] & {startFrame: number; endFrame: number};
export type Timeline = {schema_version: '1.0'; job_id: string; rounding: 'nearest-half-up'; fps: number; width: number; height: number; durationInFrames: number; scenes: CompiledScene[]; words: CompiledWord[]};
export type RenderProps = {timeline: Timeline; brand: Brand; stills: Record<string, string>; font: string; fonts?: {display: string; mono: string}};
