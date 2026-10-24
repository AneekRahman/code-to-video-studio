import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {JobSchema, ScriptSchema, TimingSchema} from '../src/contracts.ts';
import {isWithin, resolveInput, sha256} from '../src/files.ts';
import {loadJob} from '../src/load.ts';
import {secondsToFrames, compileTimeline} from '../src/timeline.ts';
import {mixFilter} from '../src/mix.ts';
import {createFixture} from '../scripts/create-fixture.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

test('frame conversion uses nearest-half-up and rejects invalid ranges', () => {
  assert.equal(secondsToFrames(1.26, 30), 38);
  assert.equal(secondsToFrames(3.2, 30), 96);
  assert.equal(secondsToFrames(0.25, 30), 8);
  assert.equal(secondsToFrames(0, 30), 0);
  assert.throws(() => secondsToFrames(-1, 30), hasCode('INVALID_TIMING'));
  assert.throws(() => secondsToFrames(Infinity, 30), hasCode('INVALID_TIMING'));
});

test('relative scope rejects sibling-prefix and symlink escapes and changed hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-scope-'));
  const external = await mkdtemp(join(tmpdir(), 'studio-external-'));
  try {
    await writeFile(resolve(root, 'inside'), 'approved');
    await writeFile(resolve(external, 'secret'), 'external');
    await symlink(resolve(external, 'secret'), resolve(root, 'escape'));
    assert.equal(isWithin('/tmp/job', '/tmp/job-sibling'), false);
    assert.equal(isWithin('/tmp/job', '/tmp/job/../secret'), false);
    assert.equal(await resolveInput(root, {path: 'inside', sha256: sha256('approved')}, 100), await realpath(resolve(root, 'inside')));
    await assert.rejects(resolveInput(root, {path: 'escape', sha256: sha256('external')}, 100), hasCode('INPUT_SCOPE'));
    await assert.rejects(resolveInput(root, {path: '../outside', sha256: sha256('')}, 100));
    await assert.rejects(resolveInput(root, {path: 'inside', sha256: sha256('changed')}, 100), hasCode('INPUT_CHANGED'));
    await assert.rejects(resolveInput(root, {path: 's3://bucket/asset', sha256: sha256('')}, 100), hasCode('CONFIG_REQUIRED'));
  } finally {await rm(root, {recursive: true, force: true}); await rm(external, {recursive: true, force: true});}
});

test('validated fixture compiles coverage and rejects mismatched or unsupported inputs', async () => {
  const fixture = await createFixture();
  try {
    const loaded = await loadJob(fixture.job);
    assert.equal(loaded.timeline.scenes[0]?.startFrame, 0);
    assert.equal(loaded.timeline.scenes.at(-1)?.endFrame, loaded.timeline.durationInFrames);
    assert.equal(loaded.timeline.words.length, 9);
    const duplicate = structuredClone(loaded.storyboard.scenes);
    duplicate[1]!.scene_id = duplicate[0]!.scene_id;
    assert.throws(() => compileTimeline(loaded.job, duplicate, loaded.timing, loaded.script.segments), hasCode('DUPLICATE_ID'));
    const gap = structuredClone(loaded.storyboard.scenes);
    gap[1]!.start_seconds += 0.01;
    assert.throws(() => compileTimeline(loaded.job, gap, loaded.timing, loaded.script.segments), hasCode('TIMING_CONFLICT'));
    const transcript = structuredClone(loaded.script.segments);
    transcript[0]!.text = 'Unauthorized story rewrite';
    assert.throws(() => compileTimeline(loaded.job, loaded.storyboard.scenes, loaded.timing, transcript), hasCode('TRANSCRIPT_CONFLICT'));
    const timing = structuredClone(loaded.timing);
    timing.words[1]!.start = 0;
    assert.throws(() => compileTimeline(loaded.job, loaded.storyboard.scenes, timing, loaded.script.segments), hasCode('INVALID_TIMING'));
    assert.equal(JobSchema.safeParse({...loaded.job, adapter: 'production'}).success, false);
    assert.equal(JobSchema.safeParse({...loaded.job, api_key: 'must-not-be-in-job'}).success, false);
    assert.equal(JobSchema.safeParse({...loaded.job, limits: {...loaded.job.limits, concurrency: 2}}).success, false);
    const filter = mixFilter(loaded);
    assert.match(filter, /volume=-28dB/);
    assert.match(filter, /amix=inputs=2/);
    const job = JSON.parse(await readFile(fixture.job, 'utf8'));
    job.inputs.timestamps.sha256 = sha256('modified');
    await writeFile(fixture.job, JSON.stringify(job));
    await assert.rejects(loadJob(fixture.job), hasCode('INPUT_CHANGED'));
  } finally {await rm(fixture.directory, {recursive: true, force: true});}
});

test('ordered contiguous script segment coverage rejects out-of-order, non-contiguous, or unspoken segments', async () => {
  const fixture = await createFixture();
  try {
    const loaded = await loadJob(fixture.job);
    const baseJob = loaded.job;
    const baseScenes = loaded.storyboard.scenes;

    // Reject punctuation-only unspoken segments
    assert.equal(ScriptSchema.safeParse({schema_version: '1.0', segments: [{segment_id: 'n1', text: '...'}]}).success, false);
    assert.equal(TimingSchema.safeParse({schema_version: '1.0', audio_sha256: loaded.timing.audio_sha256, duration_seconds: 1, words: [{segment_id: 'n1', text: '...', start: 0, end: 1}]}).success, false);

    // Non-contiguous segments: n1 -> n2 -> n1
    const nonContiguousScenes = baseScenes.map(s => ({...s, narration_segment_ids: ['n1', 'n2', 'n3']}));
    const nonContiguousTiming = structuredClone(loaded.timing);
    nonContiguousTiming.words[3]!.segment_id = 'n2';
    nonContiguousTiming.words[4]!.segment_id = 'n1';
    assert.throws(() => compileTimeline(baseJob, nonContiguousScenes, nonContiguousTiming, loaded.script.segments), hasCode('TRANSCRIPT_CONFLICT'));

    // Identical words but inverted segment order: n2 before n1
    const repeatScript = {schema_version: '1.0' as const, segments: [{segment_id: 'n1', text: 'hello'}, {segment_id: 'n2', text: 'hello'}]};
    const repeatScenes = [
      {scene_id: 's1', start_seconds: 0, end_seconds: loaded.job.format.duration_seconds / 2, treatment: 'headline' as const, title: 'Scene 1', lines: [], narration_segment_ids: ['n1', 'n2']},
      {scene_id: 's2', start_seconds: loaded.job.format.duration_seconds / 2, end_seconds: loaded.job.format.duration_seconds, treatment: 'headline' as const, title: 'Scene 2', lines: [], narration_segment_ids: ['n1', 'n2']},
    ];
    const invertedRepeatTiming = {
      schema_version: '1.0' as const,
      audio_sha256: loaded.timing.audio_sha256,
      duration_seconds: loaded.job.format.duration_seconds,
      words: [
        {segment_id: 'n2', text: 'hello', start: 0.1, end: 1.0},
        {segment_id: 'n1', text: 'hello', start: 1.1, end: 2.0},
      ],
    };
    assert.throws(() => compileTimeline(baseJob, repeatScenes, invertedRepeatTiming, repeatScript.segments), hasCode('TRANSCRIPT_CONFLICT'));

    // Unspoken segment in script that is never covered by timed words
    const missingSegmentScript = {schema_version: '1.0' as const, segments: [...loaded.script.segments, {segment_id: 'n4', text: 'unspoken segment'}]};
    assert.throws(() => compileTimeline(baseJob, baseScenes, loaded.timing, missingSegmentScript.segments), hasCode('TRANSCRIPT_CONFLICT'));

    // Word segmentation boundary: "now here" vs "nowhere" must fail TRANSCRIPT_CONFLICT
    const boundaryScript = {schema_version: '1.0' as const, segments: [{segment_id: 'n1', text: 'now here'}]};
    const boundaryTiming = {
      schema_version: '1.0' as const,
      audio_sha256: loaded.timing.audio_sha256,
      duration_seconds: loaded.job.format.duration_seconds,
      words: [{segment_id: 'n1', text: 'nowhere', start: 0.1, end: 1.0}],
    };
    const singleScene = [{scene_id: 's1', start_seconds: 0, end_seconds: loaded.job.format.duration_seconds, treatment: 'headline' as const, title: 'T', lines: [], narration_segment_ids: ['n1']}];
    assert.throws(() => compileTimeline(baseJob, singleScene, boundaryTiming, boundaryScript.segments), hasCode('TRANSCRIPT_CONFLICT'));
  } finally {await rm(fixture.directory, {recursive: true, force: true});}
});

test('timing conflict errors reject speech word exceeding output duration and preserve zero-frame rejection', async () => {
  const fixture = await createFixture();
  try {
    const loaded = await loadJob(fixture.job);
    const baseJob = loaded.job;
    const baseScenes = loaded.storyboard.scenes;

    // Speech word exceeding video duration must fail with TIMING_CONFLICT
    const overflowTiming = structuredClone(loaded.timing);
    const lastWord = overflowTiming.words.at(-1)!;
    lastWord.end = baseJob.format.duration_seconds + 0.05;
    overflowTiming.duration_seconds = lastWord.end;
    assert.throws(() => compileTimeline(baseJob, baseScenes, overflowTiming, loaded.script.segments), hasCode('TIMING_CONFLICT'));

    // Sub-frame word collapse (e.g. 15ms at 30fps) must fail with INVALID_TIMING without automatic clamping
    const subframeTiming = structuredClone(loaded.timing);
    subframeTiming.words[0]!.start = 0.1;
    subframeTiming.words[0]!.end = 0.115; // 15ms -> startFrame: 3, endFrame: 3
    assert.throws(() => compileTimeline(baseJob, baseScenes, subframeTiming, loaded.script.segments), hasCode('INVALID_TIMING'));
  } finally {await rm(fixture.directory, {recursive: true, force: true});}
});

test('asset intake validation rejects invalid extensions and non-matching byte signatures', async () => {
  const fixture = await createFixture();
  try {
    // 1. Text file renamed as font.woff2 (invalid magic bytes)
    const fontFakePath = resolve(fixture.directory, 'font-fake.woff2');
    await writeFile(fontFakePath, 'plain text content that is not woff2');
    const jobData = JSON.parse(await readFile(fixture.job, 'utf8'));
    jobData.assets.find((a: {kind: string}) => a.kind === 'font').file = {path: 'font-fake.woff2', sha256: sha256('plain text content that is not woff2')};
    await writeFile(fixture.job, JSON.stringify(jobData));
    await assert.rejects(loadJob(fixture.job), hasCode('UNSUPPORTED_ASSET'));

    // 2. Font with invalid extension (.txt)
    const fontTxtPath = resolve(fixture.directory, 'font.txt');
    await writeFile(fontTxtPath, 'plain text');
    jobData.assets.find((a: {kind: string}) => a.kind === 'font').file = {path: 'font.txt', sha256: sha256('plain text')};
    await writeFile(fixture.job, JSON.stringify(jobData));
    await assert.rejects(loadJob(fixture.job), hasCode('UNSUPPORTED_ASSET'));

    // 3. Text file renamed as still.png (invalid magic bytes)
    const stillFakePath = resolve(fixture.directory, 'still-fake.png');
    await writeFile(stillFakePath, 'plain text content that is not png');
    jobData.assets.find((a: {kind: string}) => a.kind === 'still').file = {path: 'still-fake.png', sha256: sha256('plain text content that is not png')};
    await writeFile(fixture.job, JSON.stringify(jobData));
    await assert.rejects(loadJob(fixture.job), hasCode('UNSUPPORTED_ASSET'));

    // 4. Still with unsupported extension (.svg)
    const stillSvgPath = resolve(fixture.directory, 'still.svg');
    await writeFile(stillSvgPath, '<svg></svg>');
    jobData.assets.find((a: {kind: string}) => a.kind === 'still').file = {path: 'still.svg', sha256: sha256('<svg></svg>')};
    await writeFile(fixture.job, JSON.stringify(jobData));
    await assert.rejects(loadJob(fixture.job), hasCode('UNSUPPORTED_ASSET'));
  } finally {await rm(fixture.directory, {recursive: true, force: true});}
});
