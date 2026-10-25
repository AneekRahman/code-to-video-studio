import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hostname, tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {acquireJobLock, LOCK_STALE_AFTER_MS, unlockJob} from '../src/lock.ts';
import {cleanStudioWork} from '../src/recovery.ts';
import {purgeCorruptDestination, resetAttempts} from '../src/recovery-state.ts';
import {verifyArtifacts} from '../src/runner.ts';

test('a lock with a dead local pid is recovered', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-dead-lock-'));
  const lock = resolve(root, '.studio-lock');
  try {
    await mkdir(lock);
    await writeFile(join(lock, 'lease.json'), JSON.stringify({pid: process.pid + 10_000_000, hostname: hostname(), createdAt: Date.now(), heartbeatAt: Date.now()}));
    const acquired = await acquireJobLock(lock);
    assert.equal(acquired.lease.pid, process.pid);
    await acquired.release();
    await assert.rejects(stat(lock), {code: 'ENOENT'});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('a live lock with a recent heartbeat fails closed and unlock requires force', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-live-lock-'));
  const lock = resolve(root, '.studio-lock');
  try {
    await mkdir(lock);
    await writeFile(join(lock, 'lease.json'), JSON.stringify({pid: process.pid, hostname: hostname(), createdAt: Date.now(), heartbeatAt: Date.now()}));
    await assert.rejects(acquireJobLock(lock), error => error instanceof Error && 'code' in error && error.code === 'JOB_LOCKED');
    await assert.rejects(unlockJob(lock), error => error instanceof Error && 'code' in error && error.code === 'JOB_LOCKED');
    assert.equal((await unlockJob(lock, true)).status, 'unlocked');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('an expired heartbeat is recovered even when its pid is alive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-expired-lock-'));
  const lock = resolve(root, '.studio-lock');
  try {
    await mkdir(lock);
    const old = Date.now() - LOCK_STALE_AFTER_MS - 1;
    await writeFile(join(lock, 'lease.json'), JSON.stringify({pid: process.pid, hostname: hostname(), createdAt: old, heartbeatAt: old}));
    const acquired = await acquireJobLock(lock);
    assert.equal(acquired.lease.pid, process.pid);
    await acquired.release();
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('--fresh state reset removes the attempt ledger and corrupt destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-fresh-state-'));
  const store = resolve(root, 'job-1');
  const destination = resolve(store, 'preview-abc');
  try {
    await mkdir(destination, {recursive: true});
    await writeFile(resolve(store, 'attempts.json'), JSON.stringify({count: 8}));
    await writeFile(join(destination, 'result.json'), '{');
    await resetAttempts(store);
    const purged = await purgeCorruptDestination(destination, () => verifyArtifacts(destination));
    assert.equal(purged, true);
    await assert.rejects(stat(resolve(store, 'attempts.json')), {code: 'ENOENT'});
    await assert.rejects(stat(destination), {code: 'ENOENT'});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('studio clean removes staging, corrupt outputs, and attempts only in the selected fixture job', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'studio-clean-fixture-'));
  const selected = resolve(workDir, 'outputs', 'job-1');
  const other = resolve(workDir, 'outputs', 'job-2');
  try {
    await mkdir(resolve(selected, '.attempt-old'), {recursive: true});
    await mkdir(resolve(selected, 'render-partial'), {recursive: true});
    await mkdir(other, {recursive: true});
    await writeFile(resolve(selected, 'attempts.json'), JSON.stringify({count: 4}));
    await writeFile(resolve(selected, 'render-partial', 'result.json'), '{');
    await writeFile(resolve(other, 'attempts.json'), JSON.stringify({count: 2}));
    const report = await cleanStudioWork({jobId: 'job-1', workDir});
    assert.deepEqual(report.jobs, ['job-1']);
    assert.deepEqual(new Set(report.removed), new Set(['job-1/.attempt-old', 'job-1/attempts.json', 'job-1/render-partial']));
    await assert.rejects(stat(resolve(selected, '.attempt-old')), {code: 'ENOENT'});
    await assert.rejects(stat(resolve(selected, 'render-partial')), {code: 'ENOENT'});
    await assert.rejects(stat(resolve(selected, 'attempts.json')), {code: 'ENOENT'});
    assert.equal(JSON.parse(await readFile(resolve(other, 'attempts.json'), 'utf8')).count, 2);
  } finally {
    await rm(workDir, {recursive: true, force: true});
  }
});
