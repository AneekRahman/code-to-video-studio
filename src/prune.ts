import {lstat, readdir, realpath, rm, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {isWithin} from './files.ts';
import {packageRoot} from './render.ts';
import {requireCondition} from './errors.ts';

export type PruneOptions = {
  /** Root directory to scan (defaults to `<packageRoot>/work`). */
  workDir?: string | undefined;
  /** Maximum age in milliseconds (defaults to 48 hours: 48 * 3600 * 1000). */
  maxAgeMs?: number | undefined;
  /** Dry-run mode: report candidates without deleting. */
  dryRun?: boolean | undefined;
};

export type PruneCandidate = {
  name: string;
  path: string;
  age_hours: number;
  size_bytes: number;
};

export type PruneReport = {
  status: 'pruned' | 'clean';
  dry_run: boolean;
  threshold_hours: number;
  candidates: PruneCandidate[];
  pruned_bytes: number;
};

export async function getDirectorySize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dir, {withFileTypes: true});
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        total += info.size;
      }
    }
  } catch {
    // ignore entries that disappear during active scan
  }
  return total;
}

/**
 * Opportunistically prunes stale scratch directories and job outputs older than maxAgeMs.
 * Operates strictly within the work/ directory.
 */
export async function pruneScratch(options: PruneOptions = {}): Promise<PruneReport> {
  const root = options.workDir ? resolve(options.workDir) : resolve(packageRoot, 'work');
  let canonicalWork: string;
  try {
    canonicalWork = await realpath(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        status: 'clean',
        dry_run: Boolean(options.dryRun),
        threshold_hours: Math.round((options.maxAgeMs ?? 48 * 3600 * 1000) / 3600000),
        candidates: [],
        pruned_bytes: 0,
      };
    }
    throw error;
  }

  const maxAgeMs = options.maxAgeMs ?? 48 * 3600 * 1000;
  const thresholdHours = Math.round(maxAgeMs / 3600000);
  const now = Date.now();
  const candidates: PruneCandidate[] = [];
  let prunedBytes = 0;

  async function checkCandidate(dirPath: string, displayName: string) {
    const candidateLstat = await lstat(dirPath).catch(() => null);
    if (!candidateLstat || !candidateLstat.isDirectory() || candidateLstat.isSymbolicLink()) return;

    const candidateReal = await realpath(dirPath);
    requireCondition(isWithin(canonicalWork, candidateReal), 'OUTPUT_SCOPE', 'Prune target escapes work directory');

    // Skip active studio locks modified recently
    if (displayName.endsWith('.studio-lock') && (now - candidateLstat.mtimeMs < 2 * 3600 * 1000)) {
      return;
    }

    const ageMs = now - candidateLstat.mtimeMs;
    if (ageMs >= maxAgeMs) {
      const sizeBytes = await getDirectorySize(candidateReal);
      candidates.push({
        name: displayName,
        path: dirPath,
        age_hours: Math.round(ageMs / 3600000),
        size_bytes: sizeBytes,
      });
      prunedBytes += sizeBytes;

      if (!options.dryRun) {
        await rm(candidateReal, {recursive: true, force: true});
      }
    }
  }

  const entries = await readdir(canonicalWork, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = join(canonicalWork, entry.name);

    if (entry.name === 'outputs') {
      // Sub-scan job stores within work/outputs/
      const subEntries = await readdir(fullPath, {withFileTypes: true}).catch(() => []);
      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        await checkCandidate(join(fullPath, sub.name), `outputs/${sub.name}`);
      }
    } else {
      await checkCandidate(fullPath, entry.name);
    }
  }

  return {
    status: candidates.length ? 'pruned' : 'clean',
    dry_run: Boolean(options.dryRun),
    threshold_hours: thresholdHours,
    candidates,
    pruned_bytes: prunedBytes,
  };
}
