import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findMigrationPath} from '../src/migrations/registry.ts';
import {inspectModeApi, migrateAllModes, migrateMode} from '../src/migrations/runner.ts';
import {v0ToV1Recipe} from '../src/migrations/recipes/v0-to-v1.ts';
import {v1ToV2Recipe} from '../src/migrations/recipes/v1-to-v2.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute = promisify(execFile);
const studio = fileURLToPath(new URL('..', import.meta.url));
const template = resolve(studio, 'templates/local-mode');

test('findMigrationPath resolves direct, multi-hop, identity and missing paths', () => {
  assert.deepEqual(findMigrationPath(1, 1), []);
  assert.deepEqual(findMigrationPath(0, 1)?.map(r => r.title), [v0ToV1Recipe.title]);
  assert.deepEqual(findMigrationPath(1, 2)?.map(r => r.title), [v1ToV2Recipe.title]);
  assert.deepEqual(findMigrationPath(0, 2)?.map(r => r.title), [v0ToV1Recipe.title, v1ToV2Recipe.title]);
  assert.equal(findMigrationPath(2, 1), null);
  assert.equal(findMigrationPath(1, 5), null);
});

test('inspectModeApi accurately classifies versioned, unversioned and non-mode sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inspect-mode-'));
  try {
    const v1Dir = resolve(root, 'v1');
    await mkdir(v1Dir);
    await writeFile(resolve(v1Dir, 'mode.ts'), 'export default defineMode({\n  api: 1,\n});\n');
    assert.equal(await inspectModeApi(v1Dir), 1);

    const v2Dir = resolve(root, 'v2');
    await mkdir(v2Dir);
    await writeFile(resolve(v2Dir, 'mode.ts'), 'export default defineMode({\n  api: 2,\n});\n');
    assert.equal(await inspectModeApi(v2Dir), 2);

    const unversionedDir = resolve(root, 'unversioned');
    await mkdir(unversionedDir);
    await writeFile(resolve(unversionedDir, 'mode.ts'), 'export default defineMode({\n  card: {},\n});\n');
    assert.equal(await inspectModeApi(unversionedDir), 0);

    const notModeDir = resolve(root, 'not-mode');
    await mkdir(notModeDir);
    await writeFile(resolve(notModeDir, 'mode.ts'), 'export default 1;\n');
    assert.equal(await inspectModeApi(notModeDir), null);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('migrateMode performs dry-run and live migration from API 1 to API 2', async () => {
  const root = await mkdtemp(join(tmpdir(), 'migrate-mode-'));
  try {
    const localModes = resolve(root, 'local-modes');
    const testMode = resolve(localModes, 'test-custom-mode');
    await cp(template, testMode, {recursive: true});

    const initialSource = await readFile(resolve(testMode, 'mode.ts'), 'utf8');
    assert.match(initialSource, /\bapi:\s*1\b/);

    const dryRunReport = await migrateMode('test-custom-mode', {
      localModesDir: localModes,
      toApi: 2,
      dryRun: true,
    });
    assert.equal(dryRunReport.status, 'migrated');
    assert.equal(dryRunReport.from_api, 1);
    assert.equal(dryRunReport.to_api, 2);
    assert.equal(dryRunReport.changes.length, 1);
    assert.equal(await readFile(resolve(testMode, 'mode.ts'), 'utf8'), initialSource);

    const liveReport = await migrateMode('test-custom-mode', {
      localModesDir: localModes,
      toApi: 2,
      dryRun: false,
    });
    assert.equal(liveReport.status, 'migrated');
    assert.equal(liveReport.from_api, 1);
    assert.equal(liveReport.to_api, 2);
    const migratedSource = await readFile(resolve(testMode, 'mode.ts'), 'utf8');
    assert.match(migratedSource, /\bapi:\s*2\b/);
    assert.doesNotMatch(migratedSource, /\bapi:\s*1\b/);

    const upToDateReport = await migrateMode('test-custom-mode', {
      localModesDir: localModes,
      toApi: 2,
    });
    assert.equal(upToDateReport.status, 'up_to_date');
    assert.equal(upToDateReport.changes.length, 0);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('migrateMode chains multiple recipes (0 -> 1 -> 2) on unversioned modes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'migrate-chain-'));
  try {
    const localModes = resolve(root, 'local-modes');
    const testMode = resolve(localModes, 'legacy-mode');
    await mkdir(testMode, {recursive: true});
    await writeFile(
      resolve(testMode, 'mode.ts'),
      "import {defineMode} from '../../src/mode-api.ts';\nexport default defineMode({\n  card: {},\n});\n",
    );

    const report = await migrateMode('legacy-mode', {
      localModesDir: localModes,
      toApi: 2,
    });
    assert.equal(report.status, 'migrated');
    assert.equal(report.from_api, 0);
    assert.equal(report.to_api, 2);
    assert.equal(report.changes.length, 2);

    const finalSource = await readFile(resolve(testMode, 'mode.ts'), 'utf8');
    assert.match(finalSource, /\bapi:\s*2\b/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('migrateAllModes respects skipUnversioned and handles missing migration paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'migrate-all-'));
  try {
    const localModes = resolve(root, 'local-modes');
    await cp(template, resolve(localModes, 'mode-a'), {recursive: true});
    await cp(template, resolve(localModes, 'mode-b'), {recursive: true});
    const nonMode = resolve(localModes, 'dummy-folder');
    await mkdir(nonMode, {recursive: true});
    await writeFile(resolve(nonMode, 'mode.ts'), 'export default 42;\n');

    const skippedReports = await migrateAllModes({
      localModesDir: localModes,
      toApi: 2,
      skipUnversioned: true,
    });
    assert.deepEqual(skippedReports.map(r => r.mode_id).sort(), ['mode-a', 'mode-b']);
    assert.equal(skippedReports.every(r => r.status === 'migrated'), true);

    const noPathReports = await migrateAllModes({
      localModesDir: localModes,
      toApi: 99,
      skipUnversioned: true,
    });
    assert.equal(noPathReports.every(r => r.status === 'no_path'), true);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('CLI studio migrate command executes and outputs structured JSON report', async () => {
  const {stdout} = await execute('node', ['--experimental-strip-types', resolve(studio, 'src/cli.ts'), 'migrate', '--dry-run'], {cwd: studio});
  const parsed = JSON.parse(stdout) as {ok: boolean; status: string; dry_run: boolean; reports: unknown[]};
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'migrated');
  assert.equal(parsed.dry_run, true);
  assert.ok(Array.isArray(parsed.reports));
});
