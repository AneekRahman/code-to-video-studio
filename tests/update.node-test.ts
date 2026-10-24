import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {updateStudio, type UpdateCheck} from '../src/update.ts';

const execute = promisify(execFile);
const identity = ['-c', 'user.name=Maintainer', '-c', 'user.email=maintainer@example.invalid', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'];
const git = async (cwd: string, ...args: string[]) => (await execute('git', [...identity, ...args], {cwd})).stdout.trim();
const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;
const passes: UpdateCheck[] = [{check_id: 'ok', command: 'true', args: [], timeout_ms: 10_000}];

async function write(dir: string, name: string, text: string) {
  await mkdir(resolve(dir, name, '..'), {recursive: true});
  await writeFile(resolve(dir, name), text);
}

/** A maintainer repository with release v1.0.0, and a workspace cloned from it with one local mode committed. */
async function rehearsal() {
  const root = await mkdtemp(join(tmpdir(), 'studio-update-'));
  const upstream = resolve(root, 'upstream');
  const workspace = resolve(root, 'workspace');
  await mkdir(upstream);
  await git(upstream, 'init', '--quiet');
  await write(upstream, 'src/core.ts', 'export const core = 1;\n');
  await write(upstream, 'local-modes/README.md', 'Workspace modes live here.\n');
  await write(upstream, '.gitignore', 'work/\n');
  await git(upstream, 'add', '.');
  await git(upstream, 'commit', '--quiet', '-m', 'release 1.0.0');
  await git(upstream, 'tag', 'v1.0.0');
  await git(root, 'clone', '--quiet', '--origin', 'upstream', '--branch', 'v1.0.0', upstream, workspace);
  await git(workspace, 'switch', '--quiet', '-c', 'workspace/test');
  await write(workspace, 'local-modes/recipes/mode.ts', 'export default 1;\n');
  await git(workspace, 'add', '.');
  await git(workspace, 'commit', '--quiet', '-m', 'add recipes mode');
  const release = async (tag: string, file: string, text: string) => {
    await write(upstream, file, text);
    await git(upstream, 'commit', '--quiet', '-am', `release ${tag}`);
    await git(upstream, 'tag', tag);
  };
  return {root, upstream, workspace, release};
}

test('an update merges a release into the workspace branch and keeps local modes', async () => {
  const r = await rehearsal();
  try {
    await r.release('v1.1.0', 'src/core.ts', 'export const core = 2;\n');
    const before = await git(r.workspace, 'rev-parse', 'HEAD');
    const updated = await updateStudio({to: 'v1.1.0', root: r.workspace, checks: passes});
    assert.equal(updated.status, 'updated');
    assert.equal(updated.from_commit, before);
    assert.deepEqual(updated.checks, ['ok']);
    assert.equal(await git(r.workspace, 'branch', '--show-current'), 'workspace/test');
    assert.equal(await readFile(resolve(r.workspace, 'src/core.ts'), 'utf8'), 'export const core = 2;\n');
    assert.equal(await readFile(resolve(r.workspace, 'local-modes/recipes/mode.ts'), 'utf8'), 'export default 1;\n');
    assert.equal(await git(r.workspace, 'branch', '--list', 'update/*'), '');
    assert.equal((await updateStudio({to: 'v1.1.0', root: r.workspace, checks: passes})).status, 'up_to_date');
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('an update automatically migrates local modes when a release bumps the mode API major', async () => {
  const r = await rehearsal();
  try {
    await write(r.workspace, 'local-modes/recipes/mode.ts', "import {defineMode} from '../../src/mode-api.ts';\nexport default defineMode({\n  api: 1,\n  card: {id: 'recipes'},\n});\n");
    await git(r.workspace, 'commit', '--quiet', '-am', 'update recipes to declare api: 1');

    await write(r.upstream, 'src/modes/mode.ts', 'export const modeApiVersion = {major: 2, minor: 0} as const;\n');
    await git(r.upstream, 'add', 'src/modes/mode.ts');
    await r.release('v2.0.0', 'src/core.ts', 'export const core = 3;\n');

    const updated = await updateStudio({to: 'v2.0.0', root: r.workspace, checks: passes});
    assert.equal(updated.status, 'updated');
    assert.equal(updated.migrations?.length, 1);
    assert.equal(updated.migrations?.[0]?.mode_id, 'recipes');
    assert.equal(updated.migrations?.[0]?.from_api, 1);
    assert.equal(updated.migrations?.[0]?.to_api, 2);

    const migratedSource = await readFile(resolve(r.workspace, 'local-modes/recipes/mode.ts'), 'utf8');
    assert.match(migratedSource, /\bapi:\s*2\b/);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('a release that fails a check leaves the workspace branch unchanged, and the kept update branch can be repaired and resumed', async () => {
  const r = await rehearsal();
  try {
    await r.release('v2.0.0', 'src/core.ts', 'export const core = 3;\n');
    const before = await git(r.workspace, 'rev-parse', 'HEAD');
    const failing: UpdateCheck[] = [...passes, {check_id: 'modes', command: 'sh', args: ['-c', 'echo "recipes: written for mode API 1" >&2; exit 1'], timeout_ms: 10_000}];
    await assert.rejects(updateStudio({to: 'v2.0.0', root: r.workspace, checks: failing}), (error: unknown) => {
      const details = (error as {details: {check: string; passed: string[]; kept_branch: string; output: string}}).details;
      return hasCode('UPDATE_CHECK_FAILED')(error) && details.check === 'modes' && details.passed.join() === 'ok' && details.kept_branch === 'update/v2.0.0' && details.output.includes('mode API 1');
    });
    assert.equal(await git(r.workspace, 'branch', '--show-current'), 'workspace/test');
    assert.equal(await git(r.workspace, 'rev-parse', 'HEAD'), before);
    assert.equal(await readFile(resolve(r.workspace, 'src/core.ts'), 'utf8'), 'export const core = 1;\n');
    assert.equal(await git(r.workspace, 'branch', '--list', 'update/v2.0.0', '--format=%(refname:short)'), 'update/v2.0.0');

    await git(r.workspace, 'switch', '--quiet', 'update/v2.0.0');
    await write(r.workspace, 'local-modes/recipes/mode.ts', 'export default "migrated to mode API 2";\n');
    await git(r.workspace, 'commit', '--quiet', '-am', 'migrate recipes mode');
    await git(r.workspace, 'switch', '--quiet', 'workspace/test');
    await write(r.workspace, 'local-modes/notes/mode.ts', 'export default 3;\n');
    await git(r.workspace, 'add', '.');
    await git(r.workspace, 'commit', '--quiet', '-m', 'add notes mode meanwhile');
    const repaired = await updateStudio({to: 'v2.0.0', root: r.workspace, checks: passes});
    assert.equal(repaired.status, 'updated');
    assert.equal(await readFile(resolve(r.workspace, 'local-modes/recipes/mode.ts'), 'utf8'), 'export default "migrated to mode API 2";\n');
    assert.equal(await readFile(resolve(r.workspace, 'local-modes/notes/mode.ts'), 'utf8'), 'export default 3;\n');
    assert.equal(await readFile(resolve(r.workspace, 'src/core.ts'), 'utf8'), 'export const core = 3;\n');
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('an update refuses conflicts, uncommitted work, running jobs and non-release tags', async () => {
  const r = await rehearsal();
  try {
    await write(r.workspace, 'src/core.ts', 'export const core = "edited in the workspace";\n');
    await git(r.workspace, 'commit', '--quiet', '-am', 'edit maintainer code');
    await r.release('v1.2.0', 'src/core.ts', 'export const core = 4;\n');
    const before = await git(r.workspace, 'rev-parse', 'HEAD');
    await assert.rejects(updateStudio({to: 'v1.2.0', root: r.workspace, checks: passes}), (error: unknown) =>
      hasCode('UPDATE_CONFLICT')(error) && JSON.stringify((error as {details: unknown}).details).includes('src/core.ts'));
    assert.equal(await git(r.workspace, 'rev-parse', 'HEAD'), before);
    assert.equal(await git(r.workspace, 'status', '--porcelain'), '');
    assert.equal(await git(r.workspace, 'branch', '--list', 'update/*'), '');

    await writeFile(resolve(r.workspace, 'local-modes/recipes/mode.ts'), 'export default 2;\n');
    await assert.rejects(updateStudio({to: 'v1.2.0', root: r.workspace, checks: passes}), hasCode('UPDATE_DIRTY'));
    await git(r.workspace, 'checkout', '--', '.');

    await mkdir(resolve(r.workspace, 'work/store/job-1/.studio-lock'), {recursive: true});
    await assert.rejects(updateStudio({to: 'v1.2.0', root: r.workspace, checks: passes}), hasCode('UPDATE_BUSY'));
    await rm(resolve(r.workspace, 'work'), {recursive: true});

    await assert.rejects(updateStudio({to: 'main', root: r.workspace, checks: passes}), hasCode('USAGE'));
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});
