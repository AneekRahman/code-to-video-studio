import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile} from 'node:fs/promises';
import {pruneScratch} from '../src/prune.ts';
import {runToolCapture} from '../src/process.ts';

const MS_PER_HOUR = 3600 * 1000;

test('pruneScratch identifies and removes directories older than the threshold', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'prune-test-'));
  const workDir = join(sandbox, 'work');
  await mkdir(workDir, {recursive: true});

  const staleJob = join(workDir, 'job-stale-001');
  const freshJob = join(workDir, 'job-fresh-002');
  await mkdir(staleJob, {recursive: true});
  await mkdir(freshJob, {recursive: true});

  await writeFile(join(staleJob, 'temp-frame.png'), 'dummy-frame-bytes');
  await writeFile(join(freshJob, 'active-frame.png'), 'active-frame-bytes');

  // Set staleJob mtime to 50 hours ago
  const nowSec = Date.now() / 1000;
  const fiftyHoursAgoSec = nowSec - (50 * 3600);
  await utimes(staleJob, fiftyHoursAgoSec, fiftyHoursAgoSec);

  const report = await pruneScratch({workDir, maxAgeMs: 48 * MS_PER_HOUR});

  assert.equal(report.status, 'pruned');
  assert.equal(report.dry_run, false);
  assert.equal(report.threshold_hours, 48);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0]?.name, 'job-stale-001');
  assert(report.pruned_bytes > 0);

  // Stale job removed
  let staleExists = true;
  try { await stat(staleJob); } catch { staleExists = false; }
  assert.equal(staleExists, false);

  // Fresh job preserved
  let freshExists = false;
  try { await stat(freshJob); freshExists = true; } catch { freshExists = false; }
  assert.equal(freshExists, true);

  await rm(sandbox, {recursive: true, force: true});
});

test('pruneScratch with dryRun reports candidates without deleting files', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'prune-dry-test-'));
  const workDir = join(sandbox, 'work');
  await mkdir(workDir, {recursive: true});

  const staleJob = join(workDir, 'job-stale-dry');
  await mkdir(staleJob, {recursive: true});
  await writeFile(join(staleJob, 'artifact.bin'), 'important-bytes');

  const nowSec = Date.now() / 1000;
  const sixtyHoursAgoSec = nowSec - (60 * 3600);
  await utimes(staleJob, sixtyHoursAgoSec, sixtyHoursAgoSec);

  const report = await pruneScratch({workDir, maxAgeMs: 48 * MS_PER_HOUR, dryRun: true});

  assert.equal(report.status, 'pruned');
  assert.equal(report.dry_run, true);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0]?.name, 'job-stale-dry');

  // Directory still exists
  let stillExists = false;
  try { await stat(staleJob); stillExists = true; } catch { stillExists = false; }
  assert.equal(stillExists, true);

  await rm(sandbox, {recursive: true, force: true});
});

test('pruneScratch handles subdirectories inside outputs/ container', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'prune-outputs-test-'));
  const workDir = join(sandbox, 'work');
  const outputsDir = join(workDir, 'outputs');
  await mkdir(outputsDir, {recursive: true});

  const oldOutput = join(outputsDir, 'render-job-old');
  const newOutput = join(outputsDir, 'render-job-new');
  await mkdir(oldOutput, {recursive: true});
  await mkdir(newOutput, {recursive: true});

  await writeFile(join(oldOutput, 'result.json'), '{}');
  await writeFile(join(newOutput, 'result.json'), '{}');

  const nowSec = Date.now() / 1000;
  const oldSec = nowSec - (72 * 3600);
  await utimes(oldOutput, oldSec, oldSec);

  const report = await pruneScratch({workDir, maxAgeMs: 48 * MS_PER_HOUR});

  assert.equal(report.status, 'pruned');
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0]?.name, 'outputs/render-job-old');

  let oldExists = true;
  try { await stat(oldOutput); } catch { oldExists = false; }
  assert.equal(oldExists, false);

  let newExists = false;
  try { await stat(newOutput); newExists = true; } catch { newExists = false; }
  assert.equal(newExists, true);

  await rm(sandbox, {recursive: true, force: true});
});

test('pruneScratch skips symlinks targeting outside work directory', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'prune-symlink-test-'));
  const workDir = join(sandbox, 'work');
  const outsideDir = join(sandbox, 'outside-target');
  await mkdir(workDir, {recursive: true});
  await mkdir(outsideDir, {recursive: true});

  const symlinkPath = join(workDir, 'symlink-candidate');
  await symlink(outsideDir, symlinkPath);

  const report = await pruneScratch({workDir, maxAgeMs: 1});
  assert.equal(report.status, 'clean');
  assert.equal(report.candidates.length, 0);

  let outsideExists = false;
  try { await stat(outsideDir); outsideExists = true; } catch { outsideExists = false; }
  assert.equal(outsideExists, true);

  await rm(sandbox, {recursive: true, force: true});
});

test('CLI studio prune executes and outputs structured JSON report', async () => {
  const {stdout} = await runToolCapture('node', ['--experimental-strip-types', 'src/cli.ts', 'prune', '--older-than', '48', '--dry-run'], 10_000);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert(parsed.status === 'clean' || parsed.status === 'pruned');
  assert.equal(parsed.dry_run, true);
  assert.equal(parsed.threshold_hours, 48);
  assert(Array.isArray(parsed.candidates));
});
