import {BrandSchema, StoryboardSchema, TimingSchema, type Brand, type CompiledScene} from './contracts.ts';
import {readJson} from './files.ts';
import {lintStoryboard, usesWebGL, webglBudget} from './storyboard-lint.ts';

export type Look = NonNullable<Brand['look']>;

const palettes: Record<Look, Pick<Brand, 'background' | 'foreground' | 'accent'>> = {
  studio: {background: '#0e1423', foreground: '#f4f6fb', accent: '#5eead4'},
  paper: {background: '#f6f3ec', foreground: '#141414', accent: '#e8764b'},
};

/** A brand that carries its look: the palettes the renderer is tuned and tested against. */
export function lookBrand(look: Look, fontAssetId = 'brand_font'): Brand {
  return BrandSchema.parse({schema_version: '1.0', brand_id: `starter_${look}`, version: '1', ...palettes[look], font_asset_id: fontAssetId, caption_mode: 'word-highlight', motion: 'dynamic', look, safe_area: {top: 150, bottom: 240, left: 90, right: 90}});
}

type Starter = {treatment: CompiledScene['treatment']; scene: Record<string, unknown>};

const starters: Starter[] = [
  {treatment: 'logos', scene: {title: 'The *big idea* in one line', kicker: '/topic', logos: ['youtube', 'instagram'], lines: ['One supporting line'], emphasis: []}},
  {treatment: 'stat', scene: {title: 'The number that *matters*', value: 10, suffix: ' x', lines: ['First proof', 'Second proof'], emphasis: []}},
  {treatment: 'steps', scene: {title: 'How it *works*', lines: ['First step', 'Second step', 'Third step'], emphasis: []}},
  {treatment: 'comparison', scene: {title: 'Stop this, *start* that', lines: ['The old way', 'The better way'], emphasis: []}},
  {treatment: 'code', scene: {title: 'Show the *code*', code: {language: 'file.json', text: '{\n  "key": "value"\n}', highlight: [2]}, emphasis: []}},
  {treatment: 'chart', scene: {title: 'It *grows*', unit: ' x', data: [{label: 'Before', value: 2}, {label: 'After', value: 9}], emphasis: []}},
  {treatment: 'checklist', scene: {title: 'Check these *first*', lines: ['First check', 'Second check', 'Third check'], emphasis: []}},
  {treatment: 'gauge', scene: {title: 'And the *score*', value: 80, suffix: 'score', lines: ['Strong'], emphasis: []}},
  {treatment: 'grid', scene: {title: 'Every *one* counts', value: 8, suffix: 'items', emphasis: []}},
  {treatment: 'orbit', scene: {title: 'All *working* together', value: 8, suffix: 'parts', emphasis: []}},
  {treatment: 'headline', scene: {title: 'The point *again*', lines: ['A short supporting line'], emphasis: []}},
  {treatment: 'quote', scene: {title: 'Remember *this*', lines: ['The one sentence worth repeating.', 'Source'], emphasis: []}},
];

/**
 * A storyboard that already follows every rule (varied treatments, at most the WebGL budget, valid fields), for the
 * Producer to rewrite scene by scene. Times and narration segments are placeholders to be replaced from the timings.
 */
export function storyboardSkeleton(sceneCount: number) {
  const count = Math.max(1, Math.min(starters.length, Math.floor(sceneCount)));
  const budget = Math.max(0, webglBudget());
  let heavy = 0;
  const chosen = starters.filter(starter => {
    if (!usesWebGL({treatment: starter.treatment, chart_style: undefined})) return true;
    heavy++;
    return heavy <= budget;
  }).slice(0, count);
  const each = 5;
  return StoryboardSchema.parse({schema_version: '1.0', scenes: chosen.map((starter, i) => ({scene_id: `scene${i + 1}`, start_seconds: i * each, end_seconds: (i + 1) * each, treatment: starter.treatment, narration_segment_ids: [`n${i + 1}`], ...starter.scene}))});
}

export function starterBundle(look: Look, sceneCount: number) {
  return {
    look,
    brand: lookBrand(look),
    storyboard: storyboardSkeleton(sceneCount),
    rules: [
      'Replace every scene field; keep the treatment order varied (no treatment three times in a row).',
      `At most ${webglBudget()} WebGL scenes (iso chart, orbit, logos); run doctor and follow its webgl_budget.`,
      'Set start_seconds/end_seconds from the narration timestamps; scenes must be adjacent and cover the video.',
      'Every emphasis word must be spoken in its scene (1 to 3 words); wrap the words to colour in a title in *asterisks*.',
      'Keep the brand palette from this bundle for the look; do not invent colours.',
    ],
  };
}

/** Lints a draft storyboard, brand and timestamps before any job exists. */
export async function lintFiles(storyboardPath: string, brandPath: string, timestampsPath: string) {
  const storyboard = await readJson(storyboardPath, StoryboardSchema);
  const brand = await readJson(brandPath, BrandSchema);
  const timing = await readJson(timestampsPath, TimingSchema);
  const spoken = new Map<string, string[]>();
  for (const word of timing.words) spoken.set(word.segment_id, [...(spoken.get(word.segment_id) ?? []), word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')]);
  const scenes = storyboard.scenes.map(scene => ({...scene, startFrame: 0, endFrame: 1}));
  const problems = lintStoryboard(scenes, brand, spoken);
  return {ok: problems.length === 0, scenes: scenes.length, webgl_scenes: scenes.filter(usesWebGL).length, webgl_budget: webglBudget(), problems};
}
