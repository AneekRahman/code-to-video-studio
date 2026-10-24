import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {discoverModes, modeCatalog, requireNoCollisions, shippedModes} from '../src/modes/registry.ts';
import {modeApiVersion} from '../src/modes/mode.ts';
import {modeChecks} from '../src/doctor.ts';
import {workspaceOwnedFiles} from '../scripts/check-release.ts';

const studio = fileURLToPath(new URL('..', import.meta.url));
const template = resolve(studio, 'templates/local-mode');
/** An example local mode id that no shipped mode uses, whatever a release ships. */
const unshippedId = (base: string): string => shippedModes.some(m => m.card.id === base) ? unshippedId(`${base}-local`) : base;
const recipes = unshippedId('weekly-recipe-short');
const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

async function scratchStudio() {
  const root = await mkdtemp(join(tmpdir(), 'studio-local-modes-'));
  await symlink(resolve(studio, 'src'), resolve(root, 'src'));
  await symlink(resolve(studio, 'node_modules'), resolve(root, 'node_modules'));
  await mkdir(resolve(root, 'local-modes'));
  const addMode = async (folder: string, edit: (source: string) => string = source => source) => {
    const dir = resolve(root, 'local-modes', folder);
    await cp(template, dir, {recursive: true});
    const mode = resolve(dir, 'mode.ts');
    await writeFile(mode, edit((await readFile(mode, 'utf8')).replaceAll('example-title-card', folder)));
  };
  return {root, localModes: resolve(root, 'local-modes'), addMode};
}

test('local modes are discovered, and incompatible, broken or colliding ones are never offered', async () => {
  const scratch = await scratchStudio();
  try {
    await scratch.addMode(recipes);
    await scratch.addMode('old-api-mode', source => source.replace(/\n  api: \d+,/, `\n  api: ${modeApiVersion.major + 1},`));
    await scratch.addMode('broken-mode', source => source.replace("from '../../src/mode-api.ts'", "from '../../src/removed-api.ts'"));
    await scratch.addMode('fallback-mode', source => source.replace("role: 'specialised'", "role: 'fallback'"));
    await scratch.addMode('Bad_Name');
    await scratch.addMode('studio-test-reserved');
    const found = await discoverModes(scratch.localModes);
    assert.deepEqual(found.modes.map(m => [m.card.id, m.source]), [...shippedModes.map(m => [m.card.id, 'shipped']), [recipes, 'local']]);
    const reasons = Object.fromEntries(found.unavailable.map(m => [m.id, m.reason]));
    assert.deepEqual(Object.keys(reasons).sort(), ['Bad_Name', 'broken-mode', 'fallback-mode', 'old-api-mode', 'studio-test-reserved']);
    assert.match(reasons['old-api-mode']!, new RegExp(`mode API ${modeApiVersion.major + 1}`));
    assert.match(reasons['broken-mode']!, /does not load/);
    assert.match(reasons['fallback-mode']!, /specialised/);
    assert.match(reasons['studio-test-reserved']!, /reserved/);
    assert.deepEqual(found.collisions, []);
    requireNoCollisions(found);
    assert.equal(modeChecks(found).find(c => c.check_id === 'local_modes')?.pass, false);

    await scratch.addMode('explainer');
    const colliding = await discoverModes(scratch.localModes);
    assert.deepEqual(colliding.collisions, ['explainer']);
    assert.equal(colliding.modes.filter(m => m.card.id === 'explainer').length, 1);
    assert.throws(() => requireNoCollisions(colliding), hasCode('MODE_ID_COLLISION'));
    assert.equal(modeChecks(colliding).find(c => c.check_id === 'mode_ids')?.pass, false);
    assert.deepEqual(modeCatalog(colliding).collisions, ['explainer']);
  } finally {
    await rm(scratch.root, {recursive: true, force: true});
  }
});

/** Every module specifier in a TypeScript source, from static imports, re-exports and dynamic imports. */
function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => (m[1] ?? m[2] ?? m[3])!);
}

async function sources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {withFileTypes: true, recursive: true}).catch(() => []);
  return entries.filter(e => e.isFile() && /\.(ts|tsx)$/.test(e.name)).map(e => resolve(e.parentPath, e.name));
}

test('the starter template declares the mode API it was written for as a number', async () => {
  assert.match(await readFile(resolve(template, 'mode.ts'), 'utf8'), /\n  api: \d+,\n/);
});

test('local modes and the starter template use studio code only through the mode API', async () => {
  const manifest = JSON.parse(await readFile(resolve(studio, 'package.json'), 'utf8')) as {dependencies: Record<string, string>};
  const allowed = new Set([resolve(studio, 'src/mode-api.ts'), resolve(studio, 'src/rendering/mode-api.tsx')]);
  const folders = [template, ...(await readdir(resolve(studio, 'local-modes'), {withFileTypes: true})).filter(e => e.isDirectory()).map(e => resolve(studio, 'local-modes', e.name))];
  const offenders: string[] = [];
  for (const folder of folders) {
    for (const file of await sources(folder)) {
      for (const specifier of specifiers(await readFile(file, 'utf8'))) {
        if (specifier.startsWith('node:')) continue;
        if (!specifier.startsWith('.')) {
          const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;
          if (!(name in manifest.dependencies)) offenders.push(`${relative(studio, file)} → ${specifier} (not a studio dependency)`);
          continue;
        }
        const target = resolve(dirname(file), specifier);
        if (!target.startsWith(`${folder}/`) && !allowed.has(target)) offenders.push(`${relative(studio, file)} → ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('a release must not carry workspace-owned files', () => {
  assert.deepEqual(workspaceOwnedFiles(['src/cli.ts', 'local-modes/README.md', 'templates/local-mode/mode.ts', 'README.md']), []);
  assert.deepEqual(
    workspaceOwnedFiles(['local-modes/recipes/mode.ts', 'plans/2026-10-25-x/plan.md', 'work/a.json', 'local.env', 'catalog/modes.json', 'catalog/components.json']),
    ['local-modes/recipes/mode.ts', 'plans/2026-10-25-x/plan.md', 'work/a.json', 'local.env', 'catalog/modes.json'],
  );
});
