import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {narrateExplainer} from '../src/modes/explainer/narrate.ts';
import {createMockAudioProvider} from '../src/audiogen/mock.ts';
import {TimingSchema} from '../src/contracts.ts';

test('narrateExplainer generates narration audio and valid timestamps from a script', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-narrate-'));
  try {
    const out = resolve(dir, 'audio');
    const script = {
      schema_version: '1.0' as const,
      segments: [
        {segment_id: 'intro', text: 'Clear stories create connections.'},
        {segment_id: 'body', text: 'Motion supports meaning.'},
      ],
    };

    const result = await narrateExplainer({
      script,
      out,
      provider: createMockAudioProvider(),
    });

    assert.equal(result.status, 'narration_ready');
    assert.ok(result.durationSeconds > 0);
    assert.equal(result.wordCount, 7);

    const timingRaw = JSON.parse(await readFile(result.timestampsFile, 'utf8'));
    const parsedTiming = TimingSchema.parse(timingRaw);

    assert.equal(parsedTiming.audio_sha256, result.narrationSha256);
    assert.equal(parsedTiming.words.length, 7);
    assert.equal(parsedTiming.words[0]!.text, 'Clear');
    assert.equal(parsedTiming.words[0]!.segment_id, 'intro');
    assert.equal(parsedTiming.words[4]!.segment_id, 'body');

    // Words must be ordered in time
    for (let i = 1; i < parsedTiming.words.length; i++) {
      assert.ok(
        parsedTiming.words[i]!.start >= parsedTiming.words[i - 1]!.start,
        `word ${i} starts after word ${i - 1}`
      );
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
