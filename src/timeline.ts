import type {Job, Timing, Timeline, Scene} from './contracts.ts';
import {requireCondition} from './errors.ts';

export function secondsToFrames(seconds: number, fps: number): number {
  requireCondition(Number.isFinite(seconds) && seconds >= 0 && Number.isInteger(fps) && fps > 0, 'INVALID_TIMING', 'Frame conversion needs nonnegative seconds and positive integer fps');
  const frames = Math.floor(seconds * fps + 0.5 + Number.EPSILON * Math.max(1, seconds * fps));
  requireCondition(Number.isSafeInteger(frames), 'INVALID_TIMING', 'Frame count is outside the supported integer range');
  return frames;
}
export function compileTimeline(job: Job, scenes: Scene[], timing: Timing, segments: {segment_id: string; text: string}[]): Timeline {
  const fps = job.format.fps;
  const duration = secondsToFrames(job.format.duration_seconds, fps);
  requireCondition(duration > 0 && duration <= job.limits.max_frames, 'FRAME_LIMIT', 'Job exceeds the configured frame allowance');
  requireCondition(Math.abs(timing.duration_seconds - job.format.duration_seconds) <= 1 / fps, 'TIMING_CONFLICT', 'Narration and job duration differ beyond one frame; an approved adjustment policy is required');
  const segmentIds = new Set(segments.map(s => s.segment_id));
  requireCondition(segmentIds.size === segments.length, 'DUPLICATE_ID', 'Script segment ids must be unique');
  for (const segment of segments) {
    requireCondition(/[\p{L}\p{N}]/u.test(segment.text), 'INVALID_SCRIPT', 'Script segments must contain speech words');
  }
  const sceneIds = new Set<string>();
  let boundary = 0;
  let rawBoundary = 0;
  const compiledScenes = scenes.map(scene => {
    requireCondition(!sceneIds.has(scene.scene_id), 'DUPLICATE_ID', 'Scene ids must be unique');
    sceneIds.add(scene.scene_id);
    requireCondition(Math.abs(scene.start_seconds - rawBoundary) < 1e-8 && scene.end_seconds > scene.start_seconds, 'TIMING_CONFLICT', 'Scenes must be adjacent, ordered and positive; automatic adjustment is not configured');
    const startFrame = secondsToFrames(scene.start_seconds, fps);
    const endFrame = secondsToFrames(scene.end_seconds, fps);
    requireCondition(startFrame === boundary && endFrame > startFrame && endFrame <= duration, 'TIMING_CONFLICT', 'Scene has a gap, overlap, zero-frame range or exceeds duration');
    requireCondition(scene.narration_segment_ids.every(id => segmentIds.has(id)), 'MISSING_SEGMENT', 'Scene references an unknown script segment');
    requireCondition(scene.treatment !== 'stat' || scene.value !== undefined, 'INVALID_SCENE', 'Stat scenes require a numeric value');
    boundary = endFrame; rawBoundary = scene.end_seconds;
    return {...scene, startFrame, endFrame};
  });
  requireCondition(boundary === duration, 'TIMING_CONFLICT', 'Scene plan must cover the whole video');
  let lastEnd = 0;
  let currentSegmentIndex = 0;
  let activeSegmentId: string | null = null;
  const seenSegmentIds = new Set<string>();

  const words = timing.words.map(word => {
    requireCondition(segmentIds.has(word.segment_id), 'MISSING_SEGMENT', 'Timed word references an unknown script segment');
    requireCondition(/[\p{L}\p{N}]/u.test(word.text), 'INVALID_TIMING', 'Timed word must contain spoken characters');
    requireCondition(word.start >= lastEnd && word.end > word.start && word.end <= timing.duration_seconds, 'INVALID_TIMING', 'Word timing must be ordered, non-overlapping and within narration');
    lastEnd = word.end;

    if (word.segment_id !== activeSegmentId) {
      requireCondition(!seenSegmentIds.has(word.segment_id), 'TRANSCRIPT_CONFLICT', 'Script segments in timed words must be contiguous');
      seenSegmentIds.add(word.segment_id);
      requireCondition(currentSegmentIndex < segments.length && segments[currentSegmentIndex]!.segment_id === word.segment_id, 'TRANSCRIPT_CONFLICT', 'Timed words segment order does not match approved script segment order');
      currentSegmentIndex++;
      activeSegmentId = word.segment_id;
    }

    const startFrame = secondsToFrames(word.start, fps);
    const endFrame = secondsToFrames(word.end, fps);
    requireCondition(endFrame > startFrame, 'INVALID_TIMING', 'Word timing collapses to zero frames; adjustment policy is not configured');
    requireCondition(endFrame <= duration && word.end <= job.format.duration_seconds + 1e-8, 'TIMING_CONFLICT', 'Speech word exceeds the output video duration; narration tail would be clipped');
    requireCondition(compiledScenes.some(scene => scene.narration_segment_ids.includes(word.segment_id) && word.start >= scene.start_seconds - 1 / fps && word.end <= scene.end_seconds + 1 / fps), 'TIMING_CONFLICT', 'Word does not fit a scene assigned to its narration segment');
    return {...word, startFrame, endFrame};
  });
  requireCondition(currentSegmentIndex === segments.length, 'TRANSCRIPT_CONFLICT', 'All approved script segments must be covered by timed words');
  const tokenize = (text: string): string[] =>
    text
      .normalize('NFKC')
      .toLowerCase()
      .split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(token => token.length > 0);

  const scriptTokens = segments.flatMap(s => tokenize(s.text));
  const timedTokens = timing.words.flatMap(w => tokenize(w.text));
  requireCondition(
    scriptTokens.length === timedTokens.length && scriptTokens.every((token, idx) => token === timedTokens[idx]),
    'TRANSCRIPT_CONFLICT',
    'Timed transcript words do not match the approved script word-for-word'
  );

  for (const segment of segments) {
    const segTokens = tokenize(segment.text);
    const wordTokens = timing.words.filter(w => w.segment_id === segment.segment_id).flatMap(w => tokenize(w.text));
    requireCondition(
      segTokens.length === wordTokens.length && segTokens.every((token, idx) => token === wordTokens[idx]),
      'TRANSCRIPT_CONFLICT',
      'Timed words do not match the approved script for segment'
    );
  }
  return {schema_version: '1.0', job_id: job.job_id, rounding: 'nearest-half-up', fps, width: job.format.width, height: job.format.height, durationInFrames: duration, scenes: compiledScenes, words};
}
