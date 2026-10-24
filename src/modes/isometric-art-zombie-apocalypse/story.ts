import {z} from 'zod';
import {modeId} from './style.ts';
import {ShotSchema, type CompiledShot, type PlateRef} from './shots.ts';

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const fraction = z.number().min(0).max(1);

export const Voice = z.enum(['narrator', 'broadcast', 'double']);

export const SegmentSchema = z.strictObject({
  segment_id: id,
  voice: Voice,
  text: z.string().min(1).max(220),
  pause_after: z.number().min(0).max(4).default(0.25),
});

export const StoryShotSchema = ShotSchema.omit({duration_seconds: true}).extend({
  segments: z.array(id).max(4).default([]),
  lead_in: z.number().min(0).max(3).default(0.1),
  extra_seconds: z.number().min(0).max(8).default(0),
});

const Region = z.strictObject({x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1)});

export const OverlaySchema = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.literal('title'), shot_id: id, lines: z.array(z.strictObject({text: z.string().min(1).max(32), accent: z.boolean().default(false)})).min(1).max(3), from: fraction.default(0), to: fraction.default(1)}),
  z.strictObject({kind: z.literal('broadcast'), shot_id: id, until_shot_id: id, from: fraction.default(0), label: z.string().min(1).max(40), intro_segment_id: id.optional()}),
  z.strictObject({kind: z.literal('rule'), segment_id: id, number: z.number().int().min(1).max(9), text: z.string().min(1).max(90)}),
  z.strictObject({kind: z.literal('window-shadows'), shot_id: id, region: Region, count: z.number().int().min(1).max(4).default(2)}),
  z.strictObject({kind: z.literal('cut-to-black'), shot_id: id, from: fraction}),
  z.strictObject({kind: z.literal('lights-out'), shot_id: id, segment_id: id, word: z.string().min(1)}),
]);

export const StorySchema = z.strictObject({
  schema_version: z.literal('1.0'),
  mode: z.literal(modeId),
  story_id: id,
  title: z.string().min(1).max(100),
  fps: z.literal(30),
  segments: z.array(SegmentSchema).min(1).max(40),
  shots: z.array(StoryShotSchema).min(1).max(40),
  overlays: z.array(OverlaySchema).max(40).default([]),
});

/** Measured narration per segment: clip duration and word offsets relative to the clip start. */
export const SegmentTimingSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  source: z.string().min(1),
  segments: z.array(z.strictObject({
    segment_id: id,
    duration_seconds: z.number().positive(),
    words: z.array(z.strictObject({text: z.string().min(1), start: z.number().min(0), end: z.number().positive()})).min(1),
  })).min(1),
});

export type Story = z.infer<typeof StorySchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type SegmentTiming = z.infer<typeof SegmentTimingSchema>;
export type TimedWord = {text: string; startFrame: number; endFrame: number};
export type TimedSegment = {segment_id: string; voice: z.infer<typeof Voice>; text: string; start: number; end: number; startFrame: number; endFrame: number; words: TimedWord[]};
export type StoryProps = {width: number; height: number; fps: number; durationInFrames: number; plates: Record<string, PlateRef>; shots: CompiledShot[]; segments: TimedSegment[]; overlays: Overlay[]; fonts: Record<'display' | 'mono' | 'caption', string>};

export function spokenWords(text: string): string[] {
  return text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word));
}

/** Placeholder narration timing until measured audio exists; never used for an accepted render. */
export function estimateTiming(story: Story): SegmentTiming {
  return {
    schema_version: '1.0',
    source: 'estimate',
    segments: story.segments.map(segment => {
      const words = spokenWords(segment.text);
      const per = segment.voice === 'broadcast' ? 0.36 : 0.34;
      let cursor = 0.05;
      const timed = words.map(text => {
        const length = per * (0.6 + 0.4 * Math.min(2, text.length / 5));
        const word = {text, start: cursor, end: cursor + length};
        cursor += length + (/[.,…!?]$/.test(text) ? 0.22 : 0.02);
        return word;
      });
      return {segment_id: segment.segment_id, duration_seconds: cursor + 0.1, words: timed};
    }),
  };
}

export function compileStory(story: Story, timing: SegmentTiming) {
  const fps = story.fps;
  const toFrame = (s: number) => Math.round(s * fps);
  const segmentById = new Map(story.segments.map(s => [s.segment_id, s]));
  const timingById = new Map(timing.segments.map(s => [s.segment_id, s]));
  const shotIds = new Set<string>();
  const used = new Set<string>();
  const segments: TimedSegment[] = [];
  const shots: CompiledShot[] = [];
  let cursor = 0;

  for (const shot of story.shots) {
    if (shotIds.has(shot.shot_id)) throw new Error(`Duplicate shot id ${shot.shot_id}`);
    shotIds.add(shot.shot_id);
    const start = cursor;
    if (shot.segments.length > 0) cursor += shot.lead_in;
    for (const segmentId of shot.segments) {
      const segment = segmentById.get(segmentId);
      const measured = timingById.get(segmentId);
      if (!segment || !measured) throw new Error(`Shot ${shot.shot_id} references segment ${segmentId} without text or timing`);
      if (used.has(segmentId)) throw new Error(`Segment ${segmentId} is assigned to more than one shot`);
      used.add(segmentId);
      if (spokenWords(segment.text).length !== measured.words.length) throw new Error(`Timing for ${segmentId} does not match its script word count`);
      segments.push({
        segment_id: segmentId,
        voice: segment.voice,
        text: segment.text,
        start: cursor,
        end: cursor + measured.duration_seconds,
        startFrame: toFrame(cursor),
        endFrame: toFrame(cursor + measured.duration_seconds),
        words: measured.words.map(w => ({text: w.text, startFrame: toFrame(cursor + w.start), endFrame: toFrame(cursor + w.end)})),
      });
      cursor += measured.duration_seconds + segment.pause_after;
    }
    cursor += shot.extra_seconds;
    const startFrame = toFrame(start);
    const durationInFrames = Math.max(1, toFrame(cursor) - startFrame);
    const {segments: _segments, lead_in: _leadIn, extra_seconds: _extra, ...rest} = shot;
    shots.push({...rest, duration_seconds: durationInFrames / fps, startFrame, durationInFrames});
  }
  for (const segment of story.segments) {
    if (!used.has(segment.segment_id)) throw new Error(`Segment ${segment.segment_id} is not placed in any shot`);
  }
  for (const overlay of story.overlays) {
    if ('shot_id' in overlay && !shotIds.has(overlay.shot_id)) throw new Error(`Overlay references unknown shot ${overlay.shot_id}`);
    if (overlay.kind === 'broadcast' && !shotIds.has(overlay.until_shot_id)) throw new Error(`Broadcast ends at unknown shot ${overlay.until_shot_id}`);
    if ((overlay.kind === 'rule' || overlay.kind === 'lights-out') && !used.has(overlay.segment_id)) throw new Error(`Rule references unknown segment ${overlay.segment_id}`);
  }
  const last = shots.at(-1)!;
  return {shots, segments, overlays: story.overlays, durationInFrames: last.startFrame + last.durationInFrames, timing_source: timing.source};
}
