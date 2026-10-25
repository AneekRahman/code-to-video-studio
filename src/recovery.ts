import {lstat, readdir, realpath, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {StudioError, requireCondition} from './errors.ts';
import {packageRoot} from './render.ts';
import {hasLiveJobLock, unlockJob} from './lock.ts';
import {verifyArtifacts} from './runner.ts';
import {purgeCorruptDestination, resetAttempts} from './recovery-state.ts';
import {isWithin} from './files.ts';

export async function cleanStudioWork(options: {jobId?: string; all?: boolean; workDir?: string}): Promise<{status: 'cleaned'; jobs: string[]; removed: string[]}> {
  requireCondition(Boolean(options.all) !== Boolean(options.jobId), 'USAGE', 'clean requires either --job <id> or --all');
  if (options.jobId) requireCondition(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(options.jobId), 'USAGE', 'clean --job requires a valid job id');
  const work = resolve(options.workDir ?? resolve(packageRoot, 'work'));
  const outputRoot = resolve(work, 'outputs');
  const outputRootInfo = await lstat(outputRoot).catch(() => null);
  if (!outputRootInfo) return {status: 'cleaned', jobs: [], removed: []};
  requireCondition(outputRootInfo.isDirectory() && !outputRootInfo.isSymbolicLink(), 'OUTPUT_SCOPE', 'Studio outputs must be a real directory inside work/');
  const canonicalWork = await realpath(work);
  const canonicalOutputRoot = await realpath(outputRoot);
  requireCondition(isWithin(canonicalWork, canonicalOutputRoot), 'OUTPUT_SCOPE', 'Studio outputs must stay inside work/');
  const jobNames = await readdir(canonicalOutputRoot);
  const selectedJobs = options.all ? jobNames : jobNames.filter(name => name === options.jobId);
  const jobs: string[] = [];
  const removed: string[] = [];
  for (const jobId of selectedJobs) {
    const store = join(canonicalOutputRoot, jobId);
    const storeInfo = await lstat(store).catch(() => null);
    if (!storeInfo?.isDirectory() || storeInfo.isSymbolicLink()) continue;
    jobs.push(jobId);
    const lock = join(canonicalOutputRoot, '.studio-lock');
    if (await hasLiveJobLock(lock)) throw new StudioError('JOB_LOCKED', `Job ${jobId} is active and cannot be cleaned`);
    await unlockJob(lock);
    const entries = await readdir(store);
    for (const name of entries) {
      const path = join(store, name);
      const info = await lstat(path).catch(() => null);
      if (!info) continue;
      if (name.startsWith('.attempt-')) {
        await rm(path, {recursive: true, force: true});
        removed.push(`${jobId}/${name}`);
      } else if (name === 'attempts.json') {
        await resetAttempts(store);
        removed.push(`${jobId}/${name}`);
      } else if ((info.isDirectory() || info.isSymbolicLink()) && /^(preview|render|finish|run)-/.test(name)) {
        const purged = await purgeCorruptDestination(path, () => verifyArtifacts(path));
        if (purged) removed.push(`${jobId}/${name}`);
      }
    }
  }
  return {status: 'cleaned', jobs, removed};
}
