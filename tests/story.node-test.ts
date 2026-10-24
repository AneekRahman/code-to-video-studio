import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {StorySchema, compileStory, estimateTiming, spokenWords} from '../src/modes/isometric-art-zombie-apocalypse/story.ts';
import {revealFrames} from '../src/modes/isometric-art-zombie-apocalypse/reveal.ts';

const template = async () => StorySchema.parse(JSON.parse(await readFile(new URL('../src/modes/isometric-art-zombie-apocalypse/story.template.json', import.meta.url), 'utf8')));

test('the story template compiles to contiguous shots that place every segment once', async () => {
  const story = await template();
  const compiled = compileStory(story, estimateTiming(story));
  let cursor = 0;
  for (const shot of compiled.shots) {
    assert.equal(shot.startFrame, cursor);
    cursor += shot.durationInFrames;
  }
  assert.equal(compiled.durationInFrames, cursor);
  assert.equal(compiled.segments.length, story.segments.length);
  const seconds = compiled.durationInFrames / story.fps;
  assert.ok(seconds >= 30 && seconds <= 60, `template runs ${seconds}s`);
});

test('segments start inside the shot that owns them, in script order', async () => {
  const story = await template();
  const compiled = compileStory(story, estimateTiming(story));
  for (const shot of story.shots) {
    const range = compiled.shots.find(s => s.shot_id === shot.shot_id)!;
    for (const id of shot.segments) {
      const segment = compiled.segments.find(s => s.segment_id === id)!;
      assert.ok(segment.startFrame >= range.startFrame && segment.endFrame <= range.startFrame + range.durationInFrames, id);
    }
  }
});

test('timing that disagrees with the script word count is rejected', async () => {
  const story = await template();
  const timing = estimateTiming(story);
  timing.segments[0]!.words.pop();
  assert.throws(() => compileStory(story, timing), /word count/);
});

test('a segment placed in two shots is rejected', async () => {
  const story = await template();
  story.shots[1]!.segments = [...story.shots[1]!.segments, story.shots[0]!.segments[0]!];
  assert.throws(() => compileStory(story, estimateTiming(story)), /more than one shot/);
});

test('rule card words reveal on their spoken word and interpolate unmatched words', () => {
  const spoken = ['Rule', 'one.', 'Turn', 'off', 'every', 'light.'].map((text, i) => ({text, startFrame: i * 10, endFrame: i * 10 + 8}));
  assert.deepEqual(revealFrames(['Turn', 'off', 'every', 'light.'], spoken, 0, 60), [20, 30, 40, 50]);
  assert.deepEqual(revealFrames(['Turn', 'OFF', 'all', 'light'], spoken, 0, 60), [20, 30, 40, 50]);
  assert.deepEqual(spokenWords('Hey… it\'s me. Let me in.'), ['Hey…', "it's", 'me.', 'Let', 'me', 'in.']);
});
