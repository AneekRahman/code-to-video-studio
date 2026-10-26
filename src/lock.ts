import {hostname} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, rm, stat} from 'node:fs/promises';
import {z} from 'zod';
import {StudioError} from './errors.ts';
import {writeJson} from './files.ts';

const LeaseSchema = z.strictObject({pid: z.number().int().positive(), hostname: z.string(), createdAt: z.number().int(), heartbeatAt: z.number().int()});
export type Lease = z.infer<typeof LeaseSchema>;
export const LOCK_STALE_AFTER_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function readLease(lock: string): Promise<Lease | null> {
  try {
    return LeaseSchema.parse(JSON.parse(await readFile(join(lock, 'lease.json'), 'utf8')));
  } catch {
    return null;
  }
}

async function isStale(lock: string, now = Date.now()): Promise<boolean> {
  const lease = await readLease(lock);
  if (lease) {
    if (lease.hostname === hostname() && !isAlive(lease.pid)) return true;
    return now - lease.heartbeatAt > LOCK_STALE_AFTER_MS;
  }
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

export async function acquireJobLock(path: string) {
  const lock = resolve(path);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let created = false;
    try {
      await mkdir(lock, {mode: 0o700});
      created = true;
      const lease: Lease = {pid: process.pid, hostname: hostname(), createdAt: Date.now(), heartbeatAt: Date.now()};
      await writeLease(lock, lease);
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
        },
      };
    } catch (error) {
      if (created) {
        await rm(lock, {recursive: true, force: true});
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!await isStale(lock)) {
        throw new StudioError('JOB_LOCKED', 'Job already has a live owner; wait for it or explicitly unlock it');
      }
      await moveStaleLock(lock);
      process.stderr.write(`Recovered stale studio lock at ${lock}\n`);
    }
  }
  throw new StudioError('JOB_LOCKED', 'Could not acquire the job lock after stale-lock recovery');
}

export async function unlockJob(path: string, force = false): Promise<{status: 'unlocked' | 'already_unlocked'; lock: string}> {
  const lock = resolve(path);
  const lease = await readLease(lock);
  let exists = true;
  try { await stat(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false;
    else throw error;
  }
  if (!exists) return {status: 'already_unlocked', lock};
  if (!force && !await isStale(lock)) {
    throw new StudioError('JOB_LOCKED', lease?.hostname === hostname() ? 'Studio lock owner is still running; pass --force to remove it' : 'Studio lock owner cannot be verified as stopped; pass --force to remove it');
  }
  if (force) await rm(lock, {recursive: true, force: true});
  else await moveStaleLock(lock);
  return {status: 'unlocked', lock};
}

export async function hasLiveJobLock(path: string): Promise<boolean> {
  let exists = true;
  try { await stat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false;
    else throw error;
  }
  return exists && !await isStale(path);
}
