import type {Anchor, Shot, Story, Timing} from './contracts.ts';

export interface TimedWord { text: string; start: number; end: number }
export interface TimedSegment { segment_id: string; voice: string; text: string; start: number; end: number; words: TimedWord[] }
export interface TimedShot extends Shot { start: number; end: number }
export interface Timeline { fps: number; duration: number; shots: TimedShot[]; segments: TimedSegment[] }

const snap = (seconds: number, fps: number) => Math.round(seconds * fps) / fps;
export const normalizeWord = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/** Lays shots end to end: lead-in, then each segment with its pause, then extra seconds. Shot edges land on frames. */
export function compileTimeline(story: Story, timing: Timing): Timeline {
  const durations = new Map(timing.segments.map(segment => [segment.segment_id, segment]));
  const script = new Map(story.segments.map(segment => [segment.segment_id, segment]));
  const shots: TimedShot[] = [];
  const segments: TimedSegment[] = [];
  let cursor = 0;
  for (const shot of story.shots) {
    const start = cursor;
    let inner = start + shot.lead_in;
    for (const id of shot.segments) {
      const timed = durations.get(id);
      const line = script.get(id);
      if (!timed || !line) throw new Error(`Segment ${id} has no timing or script line`);
      segments.push({
        segment_id: id, voice: line.voice, text: line.text, start: inner, end: inner + timed.duration_seconds,
        words: timed.words.map(word => ({text: word.text, start: inner + word.start, end: inner + word.end})),
      });
      inner += timed.duration_seconds + line.pause_after;
    }
    const end = snap(inner + shot.extra_seconds, story.fps);
    if (end <= start) throw new Error(`Shot ${shot.shot_id} has no duration`);
    shots.push({...shot, start, end});
    cursor = end;
  }
  return {fps: story.fps, duration: cursor, shots, segments};
}

/** Absolute time of a sound or overlay anchor. */
export function resolveAnchor(timeline: Timeline, anchor: Anchor): number {
  let time: number;
  if (anchor.shot_id) {
    const shot = timeline.shots.find(item => item.shot_id === anchor.shot_id);
    if (!shot) throw new Error(`Unknown shot ${anchor.shot_id}`);
    time = shot.start + (anchor.at ?? 0) * (shot.end - shot.start);
  } else {
    const segment = timeline.segments.find(item => item.segment_id === anchor.segment_id);
    if (!segment) throw new Error(`Unknown segment ${anchor.segment_id}`);
    if (anchor.word) {
      const word = segment.words.find(item => normalizeWord(item.text) === normalizeWord(anchor.word!));
      if (!word) throw new Error(`Word "${anchor.word}" is not in segment ${segment.segment_id}`);
      time = anchor.edge === 'end' ? word.end : word.start;
    } else {
      time = segment.start + (anchor.at ?? 0) * (segment.end - segment.start);
    }
  }
  return Math.min(timeline.duration, Math.max(0, time + anchor.offset_seconds));
}
