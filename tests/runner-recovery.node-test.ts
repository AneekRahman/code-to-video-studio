import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hostname, tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile} from 'node:fs/promises';
import {spawn, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {acquireJobLock, isJobLockLive, LOCK_STALE_AFTER_MS, unlockJob} from '../src/lock.ts';
import {pruneScratch} from '../src/prune.ts';
import {cleanStudioWork} from '../src/recovery.ts';
import {purgeCorruptDestination, resetAttempts} from '../src/recovery-state.ts';
import {verifyArtifacts} from '../src/runner.ts';

const fakeFlock = fileURLToPath(new URL('./fixtures/fake-flock.py', import.meta.url));
const holdLock = fileURLToPath(new URL('./fixtures/hold-lock.ts', import.meta.url));
const isLocked = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'JOB_LOCKED';

async function withFlock<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.STUDIO_FLOCK;
  process.env.STUDIO_FLOCK = fakeFlock;
  try { return await run(); } finally {
    if (previous === undefined) delete process.env.STUDIO_FLOCK;
    else process.env.STUDIO_FLOCK = previous;
  }
}

function startHolder(lock: string): Promise<ChildProcess> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', holdLock, lock], {stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, STUDIO_FLOCK: fakeFlock}});
    child.once('exit', code => reject(new Error(`holder exited ${code}`)));
    child.stdout!.on('data', chunk => { if (String(chunk).includes('ready')) { child.removeAllListeners('exit'); resolvePromise(child); } });
  });
}

test('a lease naming this hostname and a dead pid stays locked while its heartbeat is fresh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-dead-pid-lock-'));
  const lock = resolve(root, '.studio-lock');
  try {
    await mkdir(lock);
    await writeFile(join(lock, 'lease.json'), JSON.stringify({pid: process.pid + 10_000_000, hostname: hostname(), createdAt: Date.now(), heartbeatAt: Date.now()}));
    await assert.rejects(acquireJobLock(lock), isLocked);
    await assert.rejects(unlockJob(lock), isLocked);
    await stat(lock);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('a lock held by another process refuses acquire, unlock and clean whatever its lease says, and frees on SIGKILL', {skip: process.platform === 'win32'}, async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'studio-flock-'));
  const outputs = resolve(workDir, 'outputs');
  const lock = resolve(outputs, '.studio-lock');
  const staging = resolve(outputs, 'job-1', '.attempt-live');
  await mkdir(staging, {recursive: true});
  const holder = await startHolder(lock);
  try {
    await withFlock(async () => {
      const leasePath = join(lock, 'lease.json');
      const lease = JSON.parse(await readFile(leasePath, 'utf8'));
      await writeFile(leasePath, JSON.stringify({...lease, pid: process.pid + 10_000_000}));
      await assert.rejects(acquireJobLock(lock), isLocked);
      await assert.rejects(unlockJob(lock), isLocked);
      await assert.rejects(cleanStudioWork({jobId: 'job-1', workDir}), isLocked);
      await stat(staging);
      await stat(leasePath);

      const exited = new Promise(resolvePromise => holder.once('exit', resolvePromise));
      holder.kill('SIGKILL');
      await exited;
      let acquired: Awaited<ReturnType<typeof acquireJobLock>> | undefined;
      for (let attempt = 0; attempt < 50 && !acquired; attempt += 1) {
        acquired = await acquireJobLock(lock).catch(error => { if (!isLocked(error)) throw error; return undefined; });
        if (!acquired) await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
      }
      assert.ok(acquired, 'lock was not freed after the holder was killed');
      assert.equal(acquired.lease.pid, process.pid);
      await assert.rejects(acquireJobLock(lock), isLocked);
      await acquired.release();
      await assert.rejects(stat(lock), {code: 'ENOENT'});
    });
  } finally {
    holder.kill('SIGKILL');
    await rm(workDir, {recursive: true, force: true});
  }
});

test('prune keeps an old lock while another process holds it and removes it once the holder is gone', {skip: process.platform === 'win32'}, async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'studio-prune-lock-'));
  const lock = resolve(workDir, 'outputs', '.studio-lock');
  await mkdir(resolve(workDir, 'outputs'), {recursive: true});
  const holder = await startHolder(lock);
  try {
    await withFlock(async () => {
      const old = Date.now() / 1000 - 72 * 3600;
      await utimes(lock, old, old);
      assert.equal((await pruneScratch({workDir, maxAgeMs: 48 * 3600 * 1000})).candidates.length, 0);
      await stat(lock);
      const exited = new Promise(resolvePromise => holder.once('exit', resolvePromise));
      holder.kill('SIGKILL');
      await exited;
      for (let attempt = 0; attempt < 50 && await isJobLockLive(lock); attempt += 1) await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
      await utimes(lock, old, old);
      assert.deepEqual((await pruneScratch({workDir, maxAgeMs: 48 * 3600 * 1000})).candidates.map(c => c.name), ['outputs/.studio-lock']);
    });
  } finally {
    holder.kill('SIGKILL');
    await rm(workDir, {recursive: true, force: true});
  }
});

test('a live lock with a recent heartbeat fails closed and unlock requires force', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-live-lock-'));
  const lock = resolve(root, '.studio-lock');
  try {
    await mkdir(lock);
    const leasePath = join(lock, 'lease.json');
    await writeFile(leasePath, JSON.stringify({pid: process.pid, hostname: hostname(), createdAt: Date.now(), heartbeatAt: Date.now()}));
    const leaseBefore = await readFile(leasePath, 'utf8');
    await assert.rejects(acquireJobLock(lock), error => error instanceof Error && 'code' in error && error.code === 'JOB_LOCKED');
    assert.equal(await readFile(leasePath, 'utf8'), leaseBefore);
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

test('a lease write failure after mkdir removes the new lock and allows a retry', {skip: process.platform === 'win32'}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-lease-failure-'));
  const lock = resolve(root, '.studio-lock');
  try {
    // A 0o500 lock directory makes the lease write fail after mkdir succeeds.
    const previous = process.umask(0o200);
    try {
      await assert.rejects(acquireJobLock(lock), error => error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM'));
      await assert.rejects(stat(lock), {code: 'ENOENT'});
    } finally {
      process.umask(previous);
    }
    const acquired = await acquireJobLock(lock);
    assert.equal(acquired.lease.pid, process.pid);
    await acquired.release();
    await assert.rejects(stat(lock), {code: 'ENOENT'});
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
