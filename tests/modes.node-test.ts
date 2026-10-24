import assert from 'node:assert/strict';
import {test} from 'node:test';
import {access, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ModeCardSchema, modeApiVersion} from '../src/modes/mode.ts';
import {fallbackModeId, modeCatalog, newModeOffer, shippedModes, type Registry} from '../src/modes/registry.ts';
import {checkModeRequest} from '../src/modes/request.ts';
import {loadAnyJob, openJob} from '../src/jobs.ts';
import {createFixture} from '../scripts/create-fixture.ts';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const unshippedId = (base: string): string => shippedModes.some(m => m.card.id === base) ? unshippedId(`${base}-local`) : base;
const shippedOnly: Registry = {modes: shippedModes.map(mode => ({...mode, source: 'shipped' as const})), unavailable: [], collisions: []};
const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

test('every shipped mode has a valid card, one fallback, and existing skill and templates', async () => {
  const ids = shippedModes.map(m => m.card.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(shippedModes.filter(m => m.card.role === 'fallback').map(m => m.card.id), [fallbackModeId]);
  const modeDirectories = (await readdir(resolve(packageRoot, 'src/modes'), {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort();
  assert.deepEqual(modeDirectories, [...ids].sort(), 'each mode directory is registered, and each registered mode has a directory');
  for (const {card, api, fixture} of shippedModes) {
    assert.equal(api, modeApiVersion.major);
    assert.equal(typeof fixture, 'function');
    ModeCardSchema.parse(card);
    for (const path of [card.skill, ...card.templates]) await access(resolve(packageRoot, path));
    if (card.duration_seconds) assert.ok(card.duration_seconds.min <= card.duration_seconds.max);
  }
  assert.ok(newModeOffer.choices.length >= 2 && newModeOffer.choices.length <= 5, 'ask_user shows two to five one-tap choices');
  assert.equal(modeCatalog().fallback, 'explainer');
});

test('jobs dispatch by mode and an unregistered mode names the registered ones', async () => {
  const fixture = await createFixture();
  try {
    const opened = await openJob(fixture.job);
    assert.equal(opened.loaded.mode, 'explainer');
    assert.equal(typeof opened.runtime.renderVisual, 'function');
    const job = JSON.parse(await readFile(fixture.job, 'utf8'));
    await writeFile(fixture.job, JSON.stringify({...job, mode: 'explainer'}));
    assert.equal((await loadAnyJob(fixture.job)).mode, 'explainer');
    await writeFile(fixture.job, JSON.stringify({...job, mode: 'studio-test-unregistered'}));
    await assert.rejects(loadAnyJob(fixture.job), (error: unknown) => hasCode('UNKNOWN_MODE')(error) && JSON.stringify((error as {details: unknown}).details).includes('isometric-art-zombie-apocalypse'));
  } finally {
    await rm(fixture.directory, {recursive: true, force: true});
  }
});

test('a mode request is validated and may not reuse a registered id', async () => {
  const recipes = unshippedId('weekly-recipe-short');
  const dir = await mkdtemp(join(tmpdir(), 'studio-mode-request-'));
  try {
    const request = {
      schema_version: '1.0',
      mode_id: recipes,
      title: 'Weekly recipe short',
      requested_at: '2026-10-25T04:00:00Z',
      first_video: 'explainer-now',
      example_request: 'Make a 40 second video showing my lemon pasta recipe',
      series: 'One home recipe per week',
      constant: ['overhead kitchen look', 'ingredient list card', 'sign-off line'],
      varies: ['dish', 'ingredients', 'steps'],
      duration_seconds: {min: 30, max: 45},
      look: 'warm overhead flat-lay illustrations',
      references: [],
      voice_and_sound: 'friendly narrator, light acoustic bed',
      avoid: ['brand logos'],
    };
    const path = resolve(dir, 'request.json');
    await writeFile(path, JSON.stringify(request));
    const checked = await checkModeRequest(path, shippedOnly);
    assert.equal(checked.plan, `plans/2026-10-25-cannot-make-${recipes}-videos/plan.md`);
    assert.equal(checked.mode_directory, `local-modes/${recipes}/`);
    assert.equal(checked.skill, `local-modes/${recipes}/skill.md`);

    await writeFile(path, JSON.stringify({...request, mode_id: 'isometric-art-zombie-apocalypse'}));
    await assert.rejects(checkModeRequest(path, shippedOnly), hasCode('MODE_EXISTS'));
    await writeFile(path, JSON.stringify({...request, mode_id: 'studio-test-recipes'}));
    await assert.rejects(checkModeRequest(path, shippedOnly), hasCode('MODE_ID_RESERVED'));
    await writeFile(path, JSON.stringify({...request, mode_id: 'Weekly Recipes'}));
    await assert.rejects(checkModeRequest(path, shippedOnly));
    await writeFile(path, JSON.stringify({...request, duration_seconds: {min: 50, max: 40}}));
    await assert.rejects(checkModeRequest(path, shippedOnly));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
