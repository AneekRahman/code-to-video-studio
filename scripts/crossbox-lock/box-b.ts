import {stat, utimes} from 'node:fs/promises';
import {acquireJobLock, unlockJob} from '../../src/lock.ts';
import {cleanStudioWork} from '../../src/recovery.ts';
import {pruneScratch} from '../../src/prune.ts';
import {hostname} from 'node:os';

const lock = '/work/out/work/outputs/.studio-lock';
const phase = process.argv[2];
const code = (e: unknown) => (e as {code?: string}).code;
const report: Record<string, unknown> = {phase, hostname: hostname(), pid: process.pid};
if (phase === 'while-held') {
  report.unlock = await unlockJob(lock).then(() => 'UNLOCKED', code);
  report.acquire = await acquireJobLock(lock).then(() => 'ACQUIRED', code);
  report.clean = await cleanStudioWork({jobId: 'job-1', workDir: '/work/out/work'}).then(() => 'CLEANED', code);
  const old = Date.now() / 1000 - 72 * 3600;
  await utimes(lock, old, old);
  report.prune = (await pruneScratch({workDir: '/work/out/work', maxAgeMs: 48 * 3600 * 1000})).candidates.map(candidate => candidate.name);
  report.stagingSurvives = await stat('/work/out/work/outputs/job-1/.attempt-live').then(() => true, () => false);
  report.lockSurvives = await stat(lock).then(() => true, () => false);
} else {
  const started = Date.now();
  const held = await acquireJobLock(lock);
  report.acquiredAfterMs = Date.now() - started;
  report.leasePid = held.lease.pid;
  await held.release();
}
console.log(JSON.stringify(report));
