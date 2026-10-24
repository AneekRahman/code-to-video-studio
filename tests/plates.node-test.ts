import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnvFile, resolveSecret} from '../src/imagegen/credentials.ts';
import {createNimFluxProvider} from '../src/imagegen/nim-flux.ts';
import {createMockImageProvider} from '../src/imagegen/mock.ts';
import {StudioError} from '../src/errors.ts';
import type {ImageProvider} from '../src/imagegen/provider.ts';
import {generatePlates, type PlateManifest} from '../src/plates.ts';
import {PlateSetSchema, composePlatePrompt} from '../src/modes/isometric-art-zombie-apocalypse/style.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;
const templatePath = fileURLToPath(new URL('../src/modes/isometric-art-zombie-apocalypse/plates.template.json', import.meta.url));

test('env file parsing handles quotes, export and comments', () => {
  assert.deepEqual({...parseEnvFile('# c\nexport A="x y"\nB=\'z\'\nC = plain\nbad line\n')}, {A: 'x y', B: 'z', C: 'plain'});
});

test('missing secret is a configuration error that does not echo file contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-env-'));
  try {
    await writeFile(resolve(dir, 'local.env'), 'OTHER=secret-value\n');
    await assert.rejects(resolveSecret('STUDIO_TEST_UNSET_KEY', resolve(dir, 'local.env')), (error: unknown) => hasCode('CONFIG_REQUIRED')(error) && !String((error as Error).message).includes('secret-value'));
  } finally {await rm(dir, {recursive: true, force: true});}
});

test('NIM FLUX sizes follow the hosted 16 px grid and pixel ceiling', () => {
  const provider = createNimFluxProvider('unused');
  provider.validateSize(768, 1344);
  assert.throws(() => provider.validateSize(1080, 1920), hasCode('UNSUPPORTED_SIZE'));
  assert.throws(() => provider.validateSize(770, 1344), hasCode('UNSUPPORTED_SIZE'));
  assert.throws(() => provider.validateSize(1568, 1568), hasCode('UNSUPPORTED_SIZE'));
});

test('every template plate composes a prompt within the provider limit', async () => {
  const set = PlateSetSchema.parse(JSON.parse(await readFile(templatePath, 'utf8')));
  for (const plate of set.plates) assert.ok(composePlatePrompt(plate).length <= 2000, plate.plate_id);
});

test('plate generation reuses matching plates, versions changed ones and records refusals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-plates-'));
  try {
    const set = PlateSetSchema.parse(JSON.parse(await readFile(templatePath, 'utf8')));
    const two = {...set, plates: set.plates.slice(0, 2)};
    const platesPath = resolve(dir, 'plates.json');
    await writeFile(platesPath, JSON.stringify(two));
    const out = resolve(dir, 'out');
    const first = await generatePlates({plates: platesPath, out, provider: createMockImageProvider()});
    assert.deepEqual(first.outcomes.map(o => o.status), ['generated', 'generated']);
    const again = await generatePlates({plates: platesPath, out, provider: createMockImageProvider()});
    assert.deepEqual(again.outcomes.map(o => o.status), ['reused', 'reused']);

    two.plates[1] = {...two.plates[1]!, seed: two.plates[1]!.seed + 1};
    await writeFile(platesPath, JSON.stringify(two));
    const refusing: ImageProvider = {...createMockImageProvider(), async generate() {throw new StudioError('PROVIDER_REFUSED', 'Image provider finished with CONTENT_FILTERED');}};
    const refused = await generatePlates({plates: platesPath, out, provider: refusing});
    assert.equal(refused.status, 'plates_incomplete');
    assert.deepEqual(refused.outcomes.map(o => o.status), ['reused', 'refused']);

    const changed = await generatePlates({plates: platesPath, out, provider: createMockImageProvider()});
    assert.deepEqual(changed.outcomes.map(o => o.status), ['reused', 'generated']);
    const manifest = JSON.parse(await readFile(resolve(out, 'plates.json'), 'utf8')) as PlateManifest;
    assert.equal(manifest.plates[1]!.file, `${two.plates[1]!.plate_id}-v2.png`);
    assert.equal(changed.contact_sheet, 'contact-sheet.jpg');
  } finally {await rm(dir, {recursive: true, force: true});}
});
