import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {createFixture} from './create-fixture.ts';
import {executeJob, verifyArtifacts} from '../src/runner.ts';
import {inspect} from '../src/media.ts';

const {values} = parseArgs({options: {speech: {type: 'boolean', default: false}, keep: {type: 'boolean', default: false}}});
const root = await mkdtemp(join(tmpdir(), 'video-studio-smoke-'));
try {
  const fixture = await createFixture(resolve(root, 'inputs'), values.speech);
  const out = resolve(root, 'outputs');
  const preview = await executeJob(fixture.job, out, 'preview');
  const previewDir = dirname(preview.manifest);
  const previewResult = await verifyArtifacts(previewDir);
  assert.equal(previewResult.operation, 'preview');
  assert.ok(previewResult.artifacts.some(a => a.name === 'contact-sheet.png'));
  assert.ok(previewResult.artifacts.some(a => a.name === 'visual.mp4'));
  const previewQA = await inspect(resolve(previewDir, previewResult.final_video), {width: 540, height: 960, fps: 30, duration_seconds: fixture.duration_seconds, audio: false});
  assert.equal(previewQA.technical_validation, 'passed');

  const rendered = await executeJob(fixture.job, out, 'render');
  const finished = await executeJob(fixture.job, out, 'finish', rendered.manifest);
  const result = await verifyArtifacts(dirname(finished.manifest));
  assert.equal(result.publication_authorized, false);
  assert.equal(result.creative_acceptance, 'not_reviewed');
  assert.equal((await executeJob(fixture.job, out, 'finish', rendered.manifest)).cached, true);
  const artifacts = dirname(finished.manifest);
  const finishedQA = await inspect(resolve(artifacts, result.final_video), {
    width: 1080,
    height: 1920,
    fps: 30,
    duration_seconds: fixture.duration_seconds,
    audio: true,
    channels: 2,
    sample_rate: 48000,
  });
  assert.equal(finishedQA.technical_validation, 'passed');
  assert.equal(finishedQA.checks.audio_channels, true);
  assert.equal(finishedQA.checks.audio_sample_rate, true);

  const fullRun = await executeJob(fixture.job, out, 'run');
  const runDir = dirname(fullRun.manifest);
  const runResult = await verifyArtifacts(runDir);
  assert.equal(runResult.operation, 'run');
  assert.equal(runResult.final_video, 'final.mp4');
  assert.equal((await executeJob(fixture.job, out, 'run')).cached, true);
  const runQA = await inspect(resolve(runDir, runResult.final_video), {
    width: 1080,
    height: 1920,
    fps: 30,
    duration_seconds: fixture.duration_seconds,
    audio: true,
    channels: 2,
    sample_rate: 48000,
  });
  assert.equal(runQA.technical_validation, 'passed');
  assert.equal(runQA.checks.audio_channels, true);

  const savedJob = JSON.parse(await readFile(resolve(artifacts, 'inputs/job.json'), 'utf8'));
  assert.equal(savedJob.adapter, 'local-fixture');
  await mkdir(resolve(out, '.studio-lock'));
  await assert.rejects(executeJob(fixture.job, out, 'run'), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'JOB_LOCKED');
  await rm(resolve(out, '.studio-lock'), {recursive: true});
  const video = resolve(artifacts, result.final_video);
  const original = await readFile(video);
  await writeFile(video, 'corruption');
  await assert.rejects(verifyArtifacts(artifacts));
  await writeFile(video, original);
  await writeFile(resolve(out, result.job_id, 'attempts.json'), JSON.stringify({count: 8}));
  const cachedAfterExhaustion = await executeJob(fixture.job, out, 'run');
  assert.equal(cachedAfterExhaustion.cached, true);
  const fixtureJobData = JSON.parse(await readFile(fixture.job, 'utf8'));
  const uncachedJobData = {...fixtureJobData, limits: {...fixtureJobData.limits, max_frames: fixtureJobData.limits.max_frames - 1}};
  const uncachedJobPath = resolve(fixture.directory, 'uncached-job.json');
  await writeFile(uncachedJobPath, JSON.stringify(uncachedJobData));
  await assert.rejects(executeJob(uncachedJobPath, out, 'run'), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ATTEMPTS_EXHAUSTED');
  process.stdout.write(`${JSON.stringify({ok: true, directory: root, speech: values.speech, duration_seconds: fixture.duration_seconds, preview: preview.manifest, visual: rendered.manifest, final: finished.manifest, fullRun: fullRun.manifest, checks: ['preview', 'preview-scale', '1080p-h264', 'aac-mix', 'stereo-48k', 'combined-run', 'full-decode', 'input-snapshot', 'idempotency', 'lease', 'artifact-corruption', 'attempt-limit'], creative_acceptance: 'not_reviewed'})}\n`);
} finally {
  if (!values.keep) await rm(root, {recursive: true, force: true});
}
