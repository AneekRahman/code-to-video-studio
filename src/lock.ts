import {hostname} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {mkdir, readFile, rename, rm, stat} from 'node:fs/promises';
import {z} from 'zod';
import {StudioError} from './errors.ts';
import {writeJson} from './files.ts';

const LeaseSchema = z.strictObject({pid: z.number().int().positive(), hostname: z.string(), createdAt: z.number().int(), heartbeatAt: z.number().int()});
export type Lease = z.infer<typeof LeaseSchema>;
export const LOCK_STALE_AFTER_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const OWNER_FILE = 'owner.lock';

// Security invariant: liveness is a kernel flock on OWNER_FILE, never a PID or
// hostname. Bot boxes share one hostname and each has its own PID namespace, so
// a PID test from another box always reports the owner as dead.
function flockBinary(): string | null {
  const override = process.env.STUDIO_FLOCK;
  if (override) return override;
  return ['/usr/bin/flock', '/bin/flock'].find(path => existsSync(path)) ?? null;
}

function ownerHeld(flock: string, file: string): boolean {
  const probe = spawnSync(flock, ['-n', file, 'true'], {stdio: 'ignore'});
  if (probe.status === 0) return false;
  if (probe.status === 1) return true;
  throw new StudioError('JOB_LOCKED', `Could not probe the studio lock with ${flock}`);
}

function holdOwner(flock: string, file: string): Promise<ChildProcess> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(flock, ['-n', file, 'sh', '-c', 'echo held; exec cat'], {stdio: ['pipe', 'pipe', 'ignore']});
    let output = '';
    child.once('error', error => { child.kill('SIGKILL'); reject(error); });
    child.once('exit', () => reject(new StudioError('JOB_LOCKED', 'Job already has a live owner')));
    child.stdout!.on('data', chunk => {
      output += String(chunk);
      if (!output.includes('held')) return;
      child.removeAllListeners('exit');
      child.stdout!.destroy();
      child.unref();
      (child.stdin as unknown as {unref?: () => void}).unref?.();
      resolvePromise(child);
    });
  });
}

async function releaseOwner(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
  child.stdin!.end();
  await exited;
}

async function readLease(lock: string): Promise<Lease | null> {
  try {
    return LeaseSchema.parse(JSON.parse(await readFile(join(lock, 'lease.json'), 'utf8')));
  } catch {
    return null;
  }
}

async function isStale(lock: string, now = Date.now()): Promise<boolean> {
  const flock = flockBinary();
  const owner = join(lock, OWNER_FILE);
  if (flock && existsSync(owner)) return !ownerHeld(flock, owner);
  const lease = await readLease(lock);
  if (lease) return now - lease.heartbeatAt > LOCK_STALE_AFTER_MS;
  try {
    return now - (await stat(lock)).mtimeMs > LOCK_STALE_AFTER_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

async function writeLease(lock: string, lease: Lease): Promise<void> {
  const temp = join(lock, `lease-${process.pid}.tmp`);
  await rm(temp, {force: true});
  await writeJson(temp, lease);
  await rename(temp, join(lock, 'lease.json'));
}

async function moveStaleLock(lock: string): Promise<void> {
  const abandoned = `${lock}.stale-${process.pid}-${randomUUID()}`;
  try { await rename(lock, abandoned); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await rm(abandoned, {recursive: true, force: true});
}

async function lockExists(lock: string): Promise<boolean> {
  try { await stat(lock); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function createLock(lock: string): Promise<{lease: Lease; owner: ChildProcess | null} | null> {
  const temp = `${lock}.new-${process.pid}-${randomUUID()}`;
  await mkdir(temp, {mode: 0o700});
  let owner: ChildProcess | null = null;
  try {
    const flock = flockBinary();
    if (flock) owner = await holdOwner(flock, join(temp, OWNER_FILE));
    const lease: Lease = {pid: process.pid, hostname: hostname(), createdAt: Date.now(), heartbeatAt: Date.now()};
    await writeLease(temp, lease);
    try {
      await rename(temp, lock);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await releaseOwner(owner);
      await rm(temp, {recursive: true, force: true});
      return null;
    }
    return {lease, owner};
  } catch (error) {
    await releaseOwner(owner);
    await rm(temp, {recursive: true, force: true});
    throw error;
  }
}

export async function acquireJobLock(path: string) {
  const lock = resolve(path);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await lockExists(lock)) {
      if (!await isStale(lock)) {
        throw new StudioError('JOB_LOCKED', 'Job already has a live owner; wait for it or explicitly unlock it');
      }
      await moveStaleLock(lock);
      process.stderr.write(`Recovered stale studio lock at ${lock}\n`);
      continue;
    }
    const created = await createLock(lock);
    if (!created) continue;
    const {lease, owner} = created;
    let current = lease;
    let update = Promise.resolve();
    const timer = setInterval(() => {
      update = update.then(async () => {
        const latest = await readLease(lock);
        if (!latest || latest.pid !== lease.pid || latest.hostname !== lease.hostname || latest.createdAt !== lease.createdAt) return;
        current = {...current, heartbeatAt: Date.now()};
        await writeLease(lock, current);
      }).catch(() => undefined);
    }, HEARTBEAT_MS);
    timer.unref();
    return {
      lease,
      async release() {
        clearInterval(timer);
        await update;
        const latest = await readLease(lock);
        if (latest?.pid === lease.pid && latest.hostname === lease.hostname && latest.createdAt === lease.createdAt) {
          await rm(lock, {recursive: true, force: true});
        }
        await releaseOwner(owner);
      },
    };
  }
  throw new StudioError('JOB_LOCKED', 'Could not acquire the job lock after stale-lock recovery');
}

export async function unlockJob(path: string, force = false): Promise<{status: 'unlocked' | 'already_unlocked'; lock: string}> {
  const lock = resolve(path);
  if (!await lockExists(lock)) return {status: 'already_unlocked', lock};
  if (!force && !await isStale(lock)) {
    throw new StudioError('JOB_LOCKED', 'Studio lock owner is still running; pass --force to remove it');
  }
  if (force) await rm(lock, {recursive: true, force: true});
  else await moveStaleLock(lock);
  return {status: 'unlocked', lock};
}

export async function isJobLockLive(path: string): Promise<boolean> {
  const lock = resolve(path);
  return await lockExists(lock) && !await isStale(lock);
}
