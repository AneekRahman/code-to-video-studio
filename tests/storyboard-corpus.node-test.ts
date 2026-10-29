import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {BrandSchema, StoryboardSchema, type CompiledScene} from '../src/contracts.ts';
import {lintStoryboard, usesWebGL, webglBudget} from '../src/storyboard-lint.ts';
import {webglVerdict} from '../src/webgl-probe.ts';
import {lintFiles, lookBrand, starterBundle, storyboardSkeleton, type Look} from '../src/storyboard-template.ts';

const compiled = (scenes: ReturnType<typeof storyboardSkeleton>['scenes']): CompiledScene[] => scenes.map(scene => ({...scene, startFrame: 0, endFrame: 1}));
const scene = (treatment: CompiledScene['treatment'], extra: Partial<CompiledScene> = {}): CompiledScene => ({scene_id: `s_${Math.random().toString(36).slice(2, 7)}`, start_seconds: 0, end_seconds: 1, treatment, title: 't', lines: [], narration_segment_ids: ['n1'], startFrame: 0, endFrame: 1, ...extra});
const spoken = new Map([['n1', ['ten', 'times', 'faster', 'every', 'time']]]);

// The mistakes a model makes when it writes a storyboard from prose rules, each with the verdict the loader must give.
const corpus: {name: string; scenes: CompiledScene[]; brand: Record<string, unknown>; expect: RegExp}[] = [
  {name: 'copies the studio palette onto the paper look', scenes: [scene('stat')], brand: {look: 'paper', background: '#0e1423', foreground: '#f4f6fb'}, expect: /paper look needs a light background/},
  {name: 'picks a light background for the studio look', scenes: [scene('stat')], brand: {look: 'studio', background: '#f6f3ec', foreground: '#141414'}, expect: /studio look needs a dark background/},
  {name: 'low-contrast text', scenes: [scene('stat')], brand: {look: 'paper', foreground: '#c9c5ba'}, expect: /contrast/},
  {name: 'five headlines in a row', scenes: Array.from({length: 5}, () => scene('headline')), brand: {}, expect: /3rd 'headline' scene in a row/},
  {name: 'every scene a 3D showpiece', scenes: [scene('logos'), scene('orbit'), scene('chart', {chart_style: 'iso'}), scene('orbit')], brand: {}, expect: /4 WebGL scenes/},
  {name: 'emphasis paraphrases the narration', scenes: [scene('stat', {emphasis: ['tenfold']})], brand: {}, expect: /emphasises 'tenfold'/},
  {name: 'emphasis on a word from another scene', scenes: [scene('stat', {emphasis: ['faster'], narration_segment_ids: ['n2']})], brand: {}, expect: /emphasises 'faster'/},
];

for (const entry of corpus) {
  test(`corpus: a model that ${entry.name} is refused`, () => {
    const brand = BrandSchema.parse({schema_version: '1.0', brand_id: 'b', version: '1', background: '#f6f3ec', foreground: '#141414', accent: '#e8764b', font_asset_id: 'f', caption_mode: 'phrase', look: 'paper', safe_area: {top: 1, bottom: 1, left: 1, right: 1}, ...entry.brand});
    assert.match(lintStoryboard(entry.scenes, brand, spoken).join(' | '), entry.expect);
  });
}

test('corpus: structurally wrong storyboards fail the schema, not the lint', () => {
  const base = {scene_id: 'a', start_seconds: 0, end_seconds: 1, title: 'x', narration_segment_ids: ['n1']};
  for (const bad of [{treatment: 'hero-banner'}, {treatment: 'headline', emphasis: Array.from({length: 9}, (_, i) => `w${i}`)}, {treatment: 'chart', data: [{label: 'a'.repeat(30), value: 1}, {label: 'b', value: 2}]}, {treatment: 'logos', logos: ['tiktok']}]) {
    assert.throws(() => StoryboardSchema.parse({schema_version: '1.0', scenes: [{...base, ...bad}]}), `${JSON.stringify(bad).slice(0, 50)} should not parse`);
  }
});

for (const look of ['paper', 'studio'] as Look[]) {
  test(`the ${look} starter bundle follows its own rules at every length`, () => {
    for (let count = 1; count <= 12; count++) {
      const bundle = starterBundle(look, count);
      const scenes = compiled(bundle.storyboard.scenes);
      assert.deepEqual(lintStoryboard(scenes, bundle.brand, new Map()), [], `${count} scenes`);
      assert.ok(scenes.filter(usesWebGL).length <= webglBudget());
    }
    assert.equal(lookBrand(look).look, look);
  });
}

test('a host with no WebGL budget gets a starter without WebGL scenes, and refuses them', () => {
  const previous = process.env.STUDIO_WEBGL_BUDGET;
  process.env.STUDIO_WEBGL_BUDGET = '0';
  try {
    const skeleton = storyboardSkeleton(12);
    assert.equal(skeleton.scenes.filter(usesWebGL).length, 0);
    assert.match(lintStoryboard([scene('logos')], lookBrand('paper'), spoken).join(' '), /1 WebGL scenes.*budget is 0/);
  } finally {
    if (previous === undefined) delete process.env.STUDIO_WEBGL_BUDGET;
    else process.env.STUDIO_WEBGL_BUDGET = previous;
  }
});

test('lint-storyboard judges draft files before any job exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lint-'));
  try {
    const bundle = starterBundle('paper', 3);
    const bad = {...bundle.storyboard, scenes: bundle.storyboard.scenes.map(s => ({...s, emphasis: ['nowhere']}))};
    await writeFile(join(dir, 'storyboard.json'), JSON.stringify(bad));
    await writeFile(join(dir, 'brand.json'), JSON.stringify({...bundle.brand, background: '#101418', foreground: '#f4f4f4'}));
    await writeFile(join(dir, 'timestamps.json'), JSON.stringify({schema_version: '1.0', audio_sha256: 'a'.repeat(64), duration_seconds: 3, words: [{segment_id: 'n1', text: 'hello', start: 0, end: 1}, {segment_id: 'n2', text: 'there', start: 1, end: 2}, {segment_id: 'n3', text: 'world', start: 2, end: 3}]}));
    const verdict = await lintFiles(join(dir, 'storyboard.json'), join(dir, 'brand.json'), join(dir, 'timestamps.json'));
    assert.equal(verdict.ok, false);
    assert.ok(verdict.problems.some(problem => /paper look needs a light background/.test(problem)));
    assert.ok(verdict.problems.some(problem => /never says/.test(problem)));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('the WebGL verdict maps benchmark speed to a scene budget', () => {
  assert.deepEqual(webglVerdict(8.34, 'ANGLE (Apple M1)'), {verdict: 'fast', renderer: 'ANGLE (Apple M1)', ms_per_frame: 8.3, webgl_budget: 3});
  assert.equal(webglVerdict(28, 'SwiftShader M1').webgl_budget, 3);
  assert.equal(webglVerdict(150, 'SwiftShader').webgl_budget, 1);
  assert.equal(webglVerdict(400, 'SwiftShader').verdict, 'too_slow');
  assert.equal(webglVerdict(400, 'SwiftShader').webgl_budget, 0);
});
