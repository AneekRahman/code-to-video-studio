import assert from 'node:assert/strict';
import {test} from 'node:test';
import {StorySchema, TimingSchema} from '../src/contracts.ts';
import {compileTimeline, resolveAnchor} from '../src/timeline.ts';
import {knockTimes, planAudio} from '../src/audio.ts';
import {SoundSchema} from '../src/contracts.ts';

const camera = {from: {x: 0.5, y: 0.5, zoom: 1}, to: {x: 0.5, y: 0.5, zoom: 1.2}};
const story = StorySchema.parse({
  story_id: 's', title: 'T', fps: 30,
  segments: [{segment_id: 'a', voice: 'narrator', text: 'Day one.', pause_after: 0.5}, {segment_id: 'b', voice: 'narrator', text: 'And I ran.'}],
  shots: [
    {shot_id: 'one', plate_id: 'p', grade: 'night', segments: ['a'], lead_in: 0.2, camera, atmosphere: {}},
    {shot_id: 'two', plate_id: 'p', grade: 'night', segments: ['b'], extra_seconds: 1, camera, atmosphere: {}},
  ],
});
const timing = TimingSchema.parse({segments: [
  {segment_id: 'a', duration_seconds: 1, words: [{text: 'Day', start: 0, end: 0.3}, {text: 'one.', start: 0.4, end: 1}]},
  {segment_id: 'b', duration_seconds: 2, words: [{text: 'And', start: 0, end: 0.2}, {text: 'I', start: 0.3, end: 0.4}, {text: 'ran.', start: 0.5, end: 2}]},
]});

test('shots run lead-in, segments with pauses, then extra time, edges on frames', () => {
  const timeline = compileTimeline(story, timing);
  assert.equal(timeline.shots[0]!.end, 1.7);
  assert.equal(timeline.segments[1]!.start, 1.7);
  assert.equal(timeline.duration, 4.7);
  assert.ok(timeline.shots.every(shot => Math.abs(shot.end * 30 - Math.round(shot.end * 30)) < 1e-9));
});

test('anchors resolve to shots, segments and words, clamped to the video', () => {
  const timeline = compileTimeline(story, timing);
  assert.equal(resolveAnchor(timeline, {shot_id: 'two', at: 0.5, edge: 'start', offset_seconds: 0}), 1.7 + 1.5);
  assert.equal(resolveAnchor(timeline, {segment_id: 'b', word: 'ran', edge: 'end', offset_seconds: 0}), 3.7);
  assert.equal(resolveAnchor(timeline, {shot_id: 'one', edge: 'start', offset_seconds: -5}), 0);
  assert.throws(() => resolveAnchor(timeline, {segment_id: 'b', word: 'walked', edge: 'start', offset_seconds: 0}));
});

test('a long cue repeats its file, silences cut every clip, and knocks stay in their shot', () => {
  const timeline = compileTimeline(story, timing);
  const sound = SoundSchema.parse({
    story_id: 's', cast: {narrator: {process: 'close-mic'}}, effects: [{effect_id: 'wind', duration_seconds: 1}],
    music: {silences: []}, knock: {effect_id: 'knock'}, silences: [{from: {shot_id: 'two', at: 0.9}}],
    cues: [{effect_id: 'wind', at: {shot_id: 'one'}, until: {shot_id: 'two', at: 1}}],
  });
  const voices = new Map([['a', {file: 'a.wav', duration: 1}], ['b', {file: 'b.wav', duration: 2}]]);
  const clips = planAudio(timeline, sound, voices, new Map([['wind', {file: 'wind.mp3', duration: 1}]]), {file: 'm.mp3', duration: 10});
  const silenceAt = 1.7 + 0.9 * 3;
  assert.ok(clips.every(clip => clip.start + clip.duration <= silenceAt + 1e-6));
  assert.ok(clips.filter(clip => clip.src === 'wind.mp3').length >= 4);
  assert.ok(clips.every(clip => clip.duration > 0 && clip.mediaStart >= 0));
  assert.deepEqual(knockTimes(0, 1), [0.45]);
});
