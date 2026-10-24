import {execFile} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {StudioError, requireCondition} from './errors.ts';
import {packageRoot} from './render.ts';

const execute = promisify(execFile);

export type UpdateCheck = {check_id: string; command: string; args: string[]; timeout_ms: number; expectJson?: (stdout: string) => boolean};

const minutes = (n: number) => n * 60_000;

export const releaseChecks: UpdateCheck[] = [
  {check_id: 'install', command: 'pnpm', args: ['install', '--frozen-lockfile'], timeout_ms: minutes(15)},
  {check_id: 'mode_ids', command: 'pnpm', args: ['--silent', 'studio', 'modes'], timeout_ms: minutes(2)},
  {check_id: 'typecheck', command: 'pnpm', args: ['typecheck'], timeout_ms: minutes(5)},
  {check_id: 'lint', command: 'pnpm', args: ['lint'], timeout_ms: minutes(5)},
  {check_id: 'tests', command: 'pnpm', args: ['test'], timeout_ms: minutes(20)},
  {check_id: 'modes', command: 'pnpm', args: ['test:modes'], timeout_ms: minutes(30)},
  {check_id: 'doctor', command: 'pnpm', args: ['--silent', 'studio', 'doctor'], timeout_ms: minutes(2), expectJson: stdout => /"status":"ready"/.test(stdout)},
];

async function run(root: string, command: string, args: string[], timeoutMs = 60_000) {
  try {
    const {stdout} = await execute(command, args, {cwd: root, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, encoding: 'utf8'});
    return {ok: true as const, stdout: stdout.trim()};
  } catch (error) {
    const failed = error as {stdout?: string; stderr?: string; killed?: boolean};
    const output = `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`.trim();
    return {ok: false as const, stdout: output, tail: (failed.killed ? 'timed out\n' : '') + output.split('\n').slice(-40).join('\n')};
  }
}

async function git(root: string, ...args: string[]) {
  const result = await run(root, 'git', args);
  if (!result.ok) throw new StudioError('UPDATE_GIT_FAILED', `git ${args[0]} failed`, {output: result.tail});
  return result.stdout;
}

async function heldLocks(work: string, depth = 4): Promise<string[]> {
  if (depth < 0) return [];
  const entries = await readdir(work, {withFileTypes: true}).catch(() => []);
  const found: string[] = [];
  for (const entry of entries.filter(e => e.isDirectory())) {
    const path = resolve(work, entry.name);
    if (entry.name === '.studio-lock') found.push(path);
    else found.push(...await heldLocks(path, depth - 1));
  }
  return found;
}

/**
 * Merges release tag `to` from `remote` into the current workspace branch, but only after the merged tree passes every
 * check on a separate `update/<tag>` branch. On any failure the workspace branch is left exactly as it was. A kept
 * `update/<tag>` branch, repaired and committed, is reused by the next run with the same tag.
 */
export async function updateStudio(options: {to: string; remote?: string; root?: string; checks?: readonly UpdateCheck[]}) {
  const root = options.root ?? packageRoot;
  const remote = options.remote ?? 'upstream';
  const checks = options.checks ?? releaseChecks;
  requireCondition(/^v\d+\.\d+\.\d+$/.test(options.to), 'USAGE', 'update --to takes a release tag such as v1.2.0');
  requireCondition(await git(root, 'status', '--porcelain') === '', 'UPDATE_DIRTY', 'Commit or discard workspace changes before updating');
  const locks = await heldLocks(resolve(root, 'work'));
  if (locks.length) throw new StudioError('UPDATE_BUSY', 'A job is running (or a crashed one left its lock); wait or inspect it before updating', {locks});
  const branch = await git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD').catch(() => '');
  requireCondition(branch && !branch.startsWith('update/'), 'UPDATE_BRANCH', 'Run the update from the workspace branch');
  const before = await git(root, 'rev-parse', 'HEAD');
  const tagRef = `refs/tags/${options.to}`;
  await git(root, 'fetch', '--no-tags', remote, `+${tagRef}:${tagRef}`);
  const release = await git(root, 'rev-parse', `${tagRef}^{commit}`);
  if ((await run(root, 'git', ['merge-base', '--is-ancestor', release, 'HEAD'])).ok) {
    return {status: 'up_to_date' as const, branch, release: options.to, commit: before};
  }

  const updateBranch = `update/${options.to}`;
  const resumed = (await run(root, 'git', ['rev-parse', '--verify', '--quiet', `refs/heads/${updateBranch}`])).ok;
  await git(root, 'switch', '--quiet', ...(resumed ? [updateBranch] : ['-c', updateBranch]));
  const identity = (await run(root, 'git', ['config', 'user.email'])).ok ? [] : ['-c', 'user.name=Code-to-Video bot', '-c', 'user.email=code-to-video@localhost'];
  for (const [ref, message] of [[branch, `Bring ${branch} into ${updateBranch}`], [release, `Update studio to ${options.to}`]] as const) {
    if ((await run(root, 'git', ['merge-base', '--is-ancestor', ref, 'HEAD'])).ok) continue;
    const merged = await run(root, 'git', [...identity, 'merge', '--no-ff', '--no-edit', '-m', message, ref]);
    if (merged.ok) continue;
    const conflicts = (await git(root, 'diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean);
    await run(root, 'git', ['merge', '--abort']);
    await git(root, 'switch', '--quiet', branch);
    if (!resumed) await git(root, 'branch', '--quiet', '-D', updateBranch);
    throw new StudioError('UPDATE_CONFLICT', `Merging ${ref === release ? options.to : branch} conflicts with workspace changes; the workspace branch is unchanged`, {conflicts, kept_branch: resumed ? updateBranch : null});
  }

  const passed: string[] = [];
  for (const check of checks) {
    const result = await run(root, check.command, check.args, check.timeout_ms);
    if (!result.ok || (check.expectJson && !check.expectJson(result.stdout))) {
      await git(root, 'switch', '--quiet', branch);
      const restore = await run(root, 'pnpm', ['install', '--frozen-lockfile'], minutes(15));
      throw new StudioError('UPDATE_CHECK_FAILED', `${options.to} fails ${check.check_id} with this workspace's modes; the workspace branch is unchanged and ${updateBranch} is kept for repair`, {
        check: check.check_id, passed, kept_branch: updateBranch, dependencies_restored: restore.ok, output: result.ok ? result.stdout.split('\n').slice(-40).join('\n') : result.tail,
      });
    }
    passed.push(check.check_id);
  }
  await git(root, 'switch', '--quiet', branch);
  await git(root, 'merge', '--quiet', '--ff-only', updateBranch);
  await git(root, 'branch', '--quiet', '-d', updateBranch);
  return {status: 'updated' as const, branch, release: options.to, from_commit: before, commit: await git(root, 'rev-parse', 'HEAD'), checks: passed};
}
