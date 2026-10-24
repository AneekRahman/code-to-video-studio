import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import type {CompiledWord} from '../src/contracts.ts';
import type {LoadedJob} from '../src/load.ts';
import {loadJob} from '../src/load.ts';
import {resolveCaptionState} from '../src/captions.ts';
import {renderVisual, selectThumbnailFrame} from '../src/render.ts';
import {createFixture} from '../scripts/create-fixture.ts';

const sampleWords: CompiledWord[] = [
  {segment_id: 's1', text: 'Clear', start: 0.0, end: 0.4, startFrame: 0, endFrame: 12},
  {segment_id: 's1', text: 'stories', start: 0.5, end: 0.9, startFrame: 15, endFrame: 27},
  {segment_id: 's1', text: 'create', start: 1.0, end: 1.3, startFrame: 30, endFrame: 39},
  {segment_id: 's1', text: 'strong', start: 1.5, end: 1.9, startFrame: 45, endFrame: 57},
  {segment_id: 's1', text: 'connections', start: 2.0, end: 2.6, startFrame: 60, endFrame: 78},
  {segment_id: 's2', text: 'through', start: 3.0, end: 3.4, startFrame: 90, endFrame: 102},
  {segment_id: 's2', text: 'motion', start: 3.5, end: 4.0, startFrame: 105, endFrame: 120},
];

test('caption_mode none yields no caption state', () => {
  assert.equal(resolveCaptionState(sampleWords, 5, 'none'), null);
});

test('keyword caption boundary matches spoken word span and clears during pauses', () => {
  const active = resolveCaptionState(sampleWords, 6, 'keyword');
  assert.ok(active);
  assert.equal(active.displayed.length, 1);
  assert.equal(active.displayed[0]?.text, 'Clear');
  assert.ok(active.highlightedIndices.has(0));

  assert.equal(resolveCaptionState(sampleWords, 13, 'keyword'), null);

  const second = resolveCaptionState(sampleWords, 20, 'keyword');
  assert.ok(second);
  assert.equal(second.displayed[0]?.text, 'stories');

  assert.equal(resolveCaptionState(sampleWords, -1, 'keyword'), null);
});

test('word-highlight caption mode tracks five-word window and active word highlight', () => {
  const state0 = resolveCaptionState(sampleWords, 5, 'word-highlight');
  assert.ok(state0);
  assert.equal(state0.displayed.length, 5);
  assert.equal(state0.displayed[0]?.text, 'Clear');
  assert.equal(state0.displayed[4]?.text, 'connections');
  assert.ok(state0.highlightedIndices.has(0));
  assert.ok(!state0.highlightedIndices.has(1));

  const statePause = resolveCaptionState(sampleWords, 13, 'word-highlight');
  assert.ok(statePause);
  assert.equal(statePause.displayed.length, 5);
  assert.equal(statePause.highlightedIndices.size, 0);

  const state1 = resolveCaptionState(sampleWords, 20, 'word-highlight');
  assert.ok(state1);
  assert.ok(state1.highlightedIndices.has(1));

  assert.equal(resolveCaptionState(sampleWords, 80, 'word-highlight'), null);

  const stateChunk2 = resolveCaptionState(sampleWords, 95, 'word-highlight');
  assert.ok(stateChunk2);
  assert.equal(stateChunk2.displayed.length, 2);
  assert.equal(stateChunk2.displayed[0]?.text, 'through');
  assert.ok(stateChunk2.highlightedIndices.has(0));
});

test('karaoke caption mode accumulates highlighted indices', () => {
  const karaoke = resolveCaptionState(sampleWords, 20, 'karaoke');
  assert.ok(karaoke);
  assert.ok(karaoke.highlightedIndices.has(0));
  assert.ok(karaoke.highlightedIndices.has(1));
  assert.ok(!karaoke.highlightedIndices.has(2));
});

test('phrase caption mode returns current chunk without highlighting individual words', () => {
  const phrase = resolveCaptionState(sampleWords, 20, 'phrase');
  assert.ok(phrase);
  assert.equal(phrase.displayed.length, 5);
  assert.equal(phrase.highlightedIndices.size, 0);
});

test('selectThumbnailFrame samples settled post-intro frame and handles short scenes', () => {
  assert.equal(selectThumbnailFrame({startFrame: 0, endFrame: 120}), 72);
  assert.equal(selectThumbnailFrame({startFrame: 100, endFrame: 180}), 152);
  assert.equal(selectThumbnailFrame({startFrame: 0, endFrame: 20}), 19);
  assert.equal(selectThumbnailFrame({startFrame: 10, endFrame: 35}), 34);
  assert.equal(selectThumbnailFrame({startFrame: 50, endFrame: 50}), 50);
});

test('renderVisual rejects immediately when deadline has expired', async () => {
  const dummyLoaded = {job: {assets: []}} as unknown as LoadedJob;
  await assert.rejects(
    renderVisual(dummyLoaded, '/tmp/nonexistent', 'preview', Date.now() - 100),
    (err: unknown) => err instanceof Error && 'code' in err && err.code === 'DEADLINE_EXCEEDED'
  );
});

test('renderVisual validates layout against safe area and rejects overflowing content', async () => {
  const fixture = await createFixture();
  const workDir = await mkdtemp(join(tmpdir(), 'studio-visual-test-'));
  try {
    const loaded = await loadJob(fixture.job);

    const supportedDir = join(workDir, 'supported');
    const validResult = await renderVisual(loaded, supportedDir, 'preview', Date.now() + 180_000);
    assert.equal(validResult.video, 'visual.mp4');
    assert.ok(validResult.thumbnails.length > 0);

    const overflowingLoaded = structuredClone(loaded);
    overflowingLoaded.timeline.scenes[0]!.lines = Array.from(
      {length: 16},
      (_, i) => `Overflow line entry ${i + 1} with substantial text content designed to exceed canvas bounds`
    );

    const overflowDir = join(workDir, 'overflow');
    await assert.rejects(
      renderVisual(overflowingLoaded, overflowDir, 'preview', Date.now() + 180_000),
      (err: unknown) =>
        err instanceof Error &&
        'code' in err &&
        err.code === 'LAYOUT_OVERFLOW' &&
        err.message.includes('hook')
    );

    const horizontalOverflowLoaded = structuredClone(loaded);
    horizontalOverflowLoaded.timeline.scenes[0]!.title = 'W'.repeat(100);

    const horizontalOverflowDir = join(workDir, 'overflow-horizontal');
    await assert.rejects(
      renderVisual(horizontalOverflowLoaded, horizontalOverflowDir, 'preview', Date.now() + 180_000),
      (err: unknown) =>
        err instanceof Error &&
        'code' in err &&
        err.code === 'LAYOUT_OVERFLOW' &&
        err.message.includes('hook')
    );
  } finally {
    await rm(fixture.directory, {recursive: true, force: true});
    await rm(workDir, {recursive: true, force: true});
  }
});
