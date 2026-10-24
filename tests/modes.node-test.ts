import assert from 'node:assert/strict';
import {test} from 'node:test';
import {access, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ModeCardSchema} from '../src/modes/mode.ts';
import {fallbackModeId, modeCatalog, modes, newModeOffer} from '../src/modes/registry.ts';
import {checkModeRequest} from '../src/modes/request.ts';
import {loadAnyJob, openJob} from '../src/jobs.ts';
import {createFixture} from '../scripts/create-fixture.ts';
import {modeCatalogUrl, renderModeCatalog} from '../scripts/write-mode-catalog.ts';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

test('the published mode catalog matches the registry', async () => {
  assert.equal(await readFile(modeCatalogUrl, 'utf8'), renderModeCatalog(), 'catalog/modes.json is stale: run pnpm catalog:modes');
});

test('every registered mode has a valid card, one fallback, and existing skill and templates', async () => {
  const ids = modes.map(m => m.card.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(modes.filter(m => m.card.role === 'fallback').map(m => m.card.id), [fallbackModeId]);
  const modeDirectories = (await readdir(resolve(packageRoot, 'src/modes'), {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort();
  assert.deepEqual(modeDirectories, [...ids].sort(), 'each mode directory is registered, and each registered mode has a directory');
  for (const {card} of modes) {
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
    await writeFile(fixture.job, JSON.stringify({...job, mode: 'cooking-recipe'}));
    await assert.rejects(loadAnyJob(fixture.job), (error: unknown) => hasCode('UNKNOWN_MODE')(error) && JSON.stringify((error as {details: unknown}).details).includes('isometric-art-zombie-apocalypse'));
  } finally {
    await rm(fixture.directory, {recursive: true, force: true});
  }
});

test('a mode request is validated and may not reuse a registered id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mode-request-'));
  try {
    const request = {
      schema_version: '1.0',
      mode_id: 'weekly-recipe-short',
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
    const checked = await checkModeRequest(path);
    assert.equal(checked.plan, 'plans/2026-10-25-cannot-make-weekly-recipe-short-videos/plan.md');
    assert.equal(checked.mode_directory, 'src/modes/weekly-recipe-short/');

    await writeFile(path, JSON.stringify({...request, mode_id: 'isometric-art-zombie-apocalypse'}));
    await assert.rejects(checkModeRequest(path), hasCode('MODE_EXISTS'));
    await writeFile(path, JSON.stringify({...request, mode_id: 'Weekly Recipes'}));
    await assert.rejects(checkModeRequest(path));
    await writeFile(path, JSON.stringify({...request, duration_seconds: {min: 50, max: 40}}));
    await assert.rejects(checkModeRequest(path));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
