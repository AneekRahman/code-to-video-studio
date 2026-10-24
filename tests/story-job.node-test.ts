import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generatePlates} from '../src/plates.ts';
import {generateAudio} from '../src/audio.ts';
import {createMockImageProvider} from '../src/imagegen/mock.ts';
import {createMockAudioProvider} from '../src/audiogen/mock.ts';
import {packageStory} from '../src/modes/isometric-art-zombie-apocalypse/package.ts';
import {loadAnyJob, runtimeFor} from '../src/jobs.ts';
import {sha256} from '../src/files.ts';
import {createFixture} from '../scripts/create-fixture.ts';

const modeDir = new URL('../src/modes/isometric-art-zombie-apocalypse/', import.meta.url);
const template = (name: string) => fileURLToPath(new URL(name, modeDir));
const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

test('a packaged story job loads through the mode registry and rejects tampered or inconsistent inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-story-job-'));
  try {
    await generatePlates({plates: template('plates.template.json'), out: resolve(dir, 'plates'), provider: createMockImageProvider()});
    await generateAudio({story: template('story.template.json'), sound: template('sound.template.json'), out: resolve(dir, 'audio'), provider: createMockAudioProvider()});
    const packaged = await packageStory({story: template('story.template.json'), sound: template('sound.template.json'), plates: resolve(dir, 'plates'), audio: resolve(dir, 'audio'), out: resolve(dir, 'job')});
    assert.equal(packaged.status, 'job_ready');

    const loaded = await loadAnyJob(packaged.job);
    assert.equal(loaded.mode, 'isometric-art-zombie-apocalypse');
    assert.equal(typeof runtimeFor(loaded).finish, 'function');
    assert.equal(loaded.timeline.durationInFrames, Math.round(packaged.duration_seconds * 30));
    assert.ok(loaded.timeline.cues.length > 0);

    const jobPath = packaged.job;
    const job = JSON.parse(await readFile(jobPath, 'utf8'));
    await writeFile(jobPath, JSON.stringify({...job, format: {...job.format, duration_seconds: job.format.duration_seconds + 2}}));
    await assert.rejects(loadAnyJob(jobPath), hasCode('TIMING_CONFLICT'));

    const withoutMusic = {...job, assets: job.assets.filter((a: {asset_id: string}) => a.asset_id !== 'music')};
    await writeFile(jobPath, JSON.stringify(withoutMusic));
    await assert.rejects(loadAnyJob(jobPath), hasCode('MISSING_AUDIO'));

    await writeFile(jobPath, JSON.stringify({...job, limits: {...job.limits, max_frames: 300}}));
    await assert.rejects(loadAnyJob(jobPath), hasCode('FRAME_LIMIT'));

    await writeFile(jobPath, JSON.stringify(job));
    const timing = resolve(dir, 'job', job.inputs.timing.path);
    await writeFile(timing, (await readFile(timing, 'utf8')).replace('"duration_seconds"', '"duration_seconds" '));
    await assert.rejects(loadAnyJob(jobPath), hasCode('INPUT_CHANGED'));
    assert.notEqual(sha256(await readFile(timing)), job.inputs.timing.sha256);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('jobs without a mode still load as the narrated explainer', async () => {
  const fixture = await createFixture();
  try {
    const loaded = await loadAnyJob(fixture.job);
    assert.equal(loaded.mode, 'explainer');
  } finally {
    await rm(fixture.directory, {recursive: true, force: true});
  }
});
