import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BrandSchema, StoryboardSchema, JobSchema, type CompiledScene} from '../src/contracts.ts';
import {compileTimeline} from '../src/timeline.ts';
import {cueFrames, spokenFrames} from '../src/rendering/motion/cues.ts';
import {parseTitle, plainTitle} from '../src/rendering/motion/title-text.ts';
import {tokenizeLine} from '../src/rendering/motion/lex.ts';
import {transitionInto} from '../src/rendering/motion/transition-plan.ts';
import {contextHeight} from '../src/rendering/motion/field.ts';
import {paletteFor, readableOn, rotateHue} from '../src/rendering/motion/theme.ts';
import {normalizeWordTimings} from '../src/modes/explainer/timing.ts';
import {lintStoryboard, usesWebGL} from '../src/storyboard-lint.ts';

const scene = (overrides: Partial<CompiledScene> = {}): CompiledScene => ({scene_id: 's', start_seconds: 0, end_seconds: 3, treatment: 'headline', title: 't', lines: [], narration_segment_ids: ['n1'], startFrame: 100, endFrame: 190, ...overrides});

test('cues land on the spoken words and stay strictly increasing inside the scene', () => {
  const spoken = [4, 12, 20, 33, 41, 55, 62, 70];
  const cues = cueFrames(spoken, 4, 90);
  assert.deepEqual(cues, [14, 20, 41, 62]);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i]! >= cues[i - 1]! + 5);
  assert.ok(cues.every(cue => cue <= 70));
});

test('cues spread evenly when no word timing exists or the words are too crowded', () => {
  const even = cueFrames([], 3, 120);
  assert.equal(even.length, 3);
  assert.ok(even[0]! >= 14 && even[2]! <= 100);
  const crowded = cueFrames([60, 61, 62, 63], 4, 90);
  assert.ok(crowded.every((cue, i) => i === 0 || cue > crowded[i - 1]!));
  assert.ok(crowded.every(cue => cue <= 70));
});

test('spoken frames are relative to the scene and limited to its segments', () => {
  const words = [
    {segment_id: 'n1', text: 'a', start: 3.4, end: 3.6, startFrame: 102, endFrame: 108},
    {segment_id: 'n1', text: 'b', start: 4, end: 4.2, startFrame: 120, endFrame: 126},
    {segment_id: 'n2', text: 'c', start: 4.5, end: 4.7, startFrame: 135, endFrame: 141},
  ];
  assert.deepEqual(spokenFrames(scene(), words), [2, 20]);
});

test('title markup accents the starred words and leaves odd markers literal', () => {
  assert.deepEqual(parseTitle('Ship *video* like code'), [
    {text: 'Ship', accent: false}, {text: 'video', accent: true}, {text: 'like', accent: false}, {text: 'code', accent: false},
  ]);
  assert.equal(plainTitle('A *b c* d'), 'A b c d');
  assert.equal(parseTitle('*one* and *two*').filter(token => token.accent).length, 2);
});

test('the code lexer colours keywords, calls, strings, numbers and comments', () => {
  const kinds = (line: string) => tokenizeLine(line).filter(token => token.kind !== 'plain' && token.kind !== 'punct').map(token => `${token.kind}:${token.text}`);
  assert.deepEqual(kinds('const x = render("a", 30); // go'), ['keyword:const', 'call:render', 'string:"a"', 'number:30', 'comment:// go']);
  assert.equal(tokenizeLine('  ').map(token => token.text).join(''), '  ');
  assert.equal(tokenizeLine('a.b(c)').map(token => token.text).join(''), 'a.b(c)');
});

test('transitions put a full-screen accent on every third boundary, honour a per-scene choice and never open the video', () => {
  const scenes = [scene(), scene(), scene({transition: 'zoom'}), scene(), scene({transition: 'cut'}), scene(), scene(), scene()];
  assert.equal(transitionInto(scenes, 0), 'cut');
  assert.equal(transitionInto(scenes, 1), 'wipe');
  assert.equal(transitionInto(scenes, 2), 'zoom');
  assert.equal(transitionInto(scenes, 3), 'cut');
  assert.equal(transitionInto(scenes, 4), 'cut');
  const auto = Array.from({length: 13}, () => scene());
  const kinds = auto.map((_, i) => transitionInto(auto, i));
  assert.deepEqual(kinds.slice(0, 8), ['cut', 'wipe', 'cut', 'cut', 'iris', 'cut', 'cut', 'zoom']);
  assert.equal(kinds.filter(kind => kind !== 'cut').length, 4);
  for (let i = 1; i < kinds.length; i++) assert.ok(kinds[i] === 'cut' || kinds[i - 1] === 'cut', 'accents are never adjacent');
});

test('the isometric field is deterministic', () => {
  assert.equal(contextHeight(2, 3), contextHeight(2, 3));
  assert.ok(contextHeight(0, 0) >= 22 && contextHeight(6, 3) <= 100);
});

test('palettes derive readable text and a distinct second accent', () => {
  assert.equal(readableOn('#ffffff'), '#0b1020');
  assert.equal(readableOn('#101820'), '#ffffff');
  assert.notEqual(rotateHue('#e8764b', 42), '#e8764b');
  assert.equal(rotateHue('#e8764b', 360), rotateHue('#e8764b', 0));
  assert.equal(paletteFor({background: '#fff', foreground: '#000', accent: '#e8764b'}).look, 'studio');
  assert.equal(paletteFor({background: '#fff', foreground: '#000', accent: '#e8764b', look: 'paper'}).look, 'paper');
});

const base = {scene_id: 'a', start_seconds: 0, end_seconds: 1, treatment: 'headline', title: 'Hello', narration_segment_ids: ['n1']};

test('a v1.1 storyboard still parses and gains empty lines where it had none', () => {
  const parsed = StoryboardSchema.parse({schema_version: '1.0', scenes: [{...base, lines: ['one']}, {...base, scene_id: 'b', treatment: 'stat', value: 3}]});
  assert.deepEqual(parsed.scenes[1]!.lines, []);
});

test('new scene fields are strict', () => {
  assert.throws(() => StoryboardSchema.parse({schema_version: '1.0', scenes: [{...base, treatment: 'sparkle'}]}));
  assert.throws(() => StoryboardSchema.parse({schema_version: '1.0', scenes: [{...base, data: [{label: 'a', value: 1}]}]}));
  assert.throws(() => StoryboardSchema.parse({schema_version: '1.0', scenes: [{...base, bogus: true}]}));
  assert.doesNotThrow(() => BrandSchema.parse({schema_version: '1.0', brand_id: 'b', version: '1', background: '#ffffff', foreground: '#000000', accent: '#e8764b', font_asset_id: 'f', caption_mode: 'phrase', motion: 'punchy', look: 'paper', safe_area: {top: 1, bottom: 1, left: 1, right: 1}}));
});

const job = JobSchema.parse({schema_version: '1.0', adapter: 'local-fixture', job_id: 'j', status: 'approved_for_visual_production', format: {width: 1080, height: 1920, fps: 30, duration_seconds: 1, codec: 'h264', container: 'mp4'}, inputs: Object.fromEntries(['script', 'storyboard', 'narration', 'timestamps', 'brand', 'mix'].map(key => [key, {path: `${key}.json`, sha256: 'a'.repeat(64)}])), assets: [], limits: {max_operation_attempts: 3, max_runtime_seconds: 60, max_input_bytes: 1e6, max_output_bytes: 1e6, max_frames: 100, concurrency: 1}});
const timing = {schema_version: '1.0' as const, audio_sha256: 'a'.repeat(64), duration_seconds: 1, words: [{segment_id: 'n1', text: 'hello', start: 0, end: 1}]};
const compile = (extra: Record<string, unknown>) => {
  const storyboard = StoryboardSchema.parse({schema_version: '1.0', scenes: [{...base, ...extra}]});
  return compileTimeline(job, storyboard.scenes, timing, [{segment_id: 'n1', text: 'hello'}]);
};

test('each treatment states what it needs', () => {
  assert.throws(() => compile({treatment: 'chart'}), /Chart scenes require data/);
  assert.throws(() => compile({treatment: 'code'}), /Code scenes require a code block/);
  assert.throws(() => compile({treatment: 'grid', value: 2.5}), /Grid scenes/);
  assert.throws(() => compile({treatment: 'grid', value: 30}), /Grid scenes/);
  assert.throws(() => compile({treatment: 'gauge', value: 101}), /Gauge scenes/);
  assert.throws(() => compile({treatment: 'orbit', value: 2}), /Orbit scenes/);
  assert.throws(() => compile({treatment: 'orbit', value: 13}), /Orbit scenes/);
  assert.throws(() => compile({treatment: 'steps', lines: ['only one']}), /at least two lines/);
  assert.throws(() => compile({treatment: 'quote'}), /at least one line/);
  assert.throws(() => compile({treatment: 'code', code: {language: 'js', text: 'x'.repeat(39)}}), /at most 10 lines of 38/);
  assert.throws(() => compile({treatment: 'code', code: {language: 'js', text: 'a\nb', highlight: [3]}}), /outside the block/);
  assert.throws(() => compile({treatment: 'chart', chart_style: 'iso', data: Array.from({length: 7}, (_, i) => ({label: `l${i}`, value: i}))}));
});

test('valid new scenes compile', () => {
  assert.equal(compile({treatment: 'chart', chart_style: 'iso', data: [{label: 'a', value: 2}, {label: 'b', value: 3}]}).scenes.length, 1);
  assert.equal(compile({treatment: 'gauge', value: 85.6, lines: ['Strong']}).scenes[0]!.treatment, 'gauge');
  assert.equal(compile({treatment: 'orbit', value: 12}).scenes[0]!.treatment, 'orbit');
  assert.equal(compile({treatment: 'code', code: {language: 'ts', text: 'const a = 1;\nreturn a;', highlight: [2]}}).scenes.length, 1);
});

test('word timings from a speech aligner are given a frame of life and never overlap', () => {
  const words = [
    {segment_id: 'n1', text: 'a', start: 0, end: 0.01},
    {segment_id: 'n1', text: 'quick', start: 0.01, end: 0.3},
    {segment_id: 'n1', text: 'x', start: 0.3, end: 0.3},
    {segment_id: 'n1', text: 'end', start: 0.3, end: 0.5},
  ];
  const fixed = normalizeWordTimings(words, 0.5);
  for (const [i, word] of fixed.entries()) {
    assert.ok(word.end - word.start >= 0.039, `word ${i} is long enough`);
    if (i > 0) assert.ok(word.start >= fixed[i - 1]!.end - 1e-9, `word ${i} starts after the previous ends`);
  }
  assert.ok(fixed.at(-1)!.end <= 0.5 + 1e-9);
  assert.deepEqual(normalizeWordTimings([{segment_id: 'n1', text: 'ok', start: 0.1, end: 0.4}], 1), [{segment_id: 'n1', text: 'ok', start: 0.1, end: 0.4}]);
});

const brandOf = (overrides: Record<string, unknown> = {}) => BrandSchema.parse({schema_version: '1.0', brand_id: 'b', version: '1', background: '#f6f3ec', foreground: '#141414', accent: '#e8764b', font_asset_id: 'f', caption_mode: 'phrase', look: 'paper', safe_area: {top: 1, bottom: 1, left: 1, right: 1}, ...overrides});
const words = new Map([['n1', ['one', 'two']]]);

test('lint accepts a well-formed paper storyboard', () => {
  assert.deepEqual(lintStoryboard([scene({emphasis: ['One']})], brandOf(), words), []);
});

test('lint refuses a palette that cannot carry its look', () => {
  assert.match(lintStoryboard([scene()], brandOf({background: '#101418', foreground: '#f4f4f4'}), words).join(' '), /paper look needs a light background/);
  assert.match(lintStoryboard([scene()], brandOf({look: 'studio'}), words).join(' '), /studio look needs a dark background/);
  assert.match(lintStoryboard([scene()], brandOf({foreground: '#e8e4da'}), words).join(' '), /contrast/);
});

test('lint caps WebGL scenes and repeated treatments, and checks emphasis is spoken', () => {
  const heavy = [scene({scene_id: 'a', treatment: 'orbit'}), scene({scene_id: 'b', treatment: 'logos'}), scene({scene_id: 'c', treatment: 'chart', chart_style: 'iso'}), scene({scene_id: 'd', treatment: 'chart', chart_style: 'iso'})];
  assert.ok(usesWebGL(heavy[3]!) && !usesWebGL(scene()));
  assert.match(lintStoryboard(heavy, brandOf(), words).join(' '), /4 WebGL scenes/);
  const same = [scene({scene_id: 'a'}), scene({scene_id: 'b'}), scene({scene_id: 'c'})];
  assert.match(lintStoryboard(same, brandOf(), words).join(' '), /3rd 'headline' scene in a row/);
  assert.match(lintStoryboard([scene({emphasis: ['three']})], brandOf(), words).join(' '), /never says/);
});
