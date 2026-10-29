import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {runTool} from '../src/process.ts';
import {analyzeReference, compareAnalyses, tileTimes} from '../src/reference.ts';
import {autoCutThreshold, cutsFromScores, deltaE, dominantColors, fromHex, median, paletteDistance, pearson, resample} from '../src/reference-math.ts';

async function clip(dir: string, name: string, segments: [string, number][], withAudio = true): Promise<string> {
  const path = join(dir, name);
  const inputs = segments.flatMap(([color, seconds]) => ['-f', 'lavfi', '-i', `color=c=${color}:s=216x384:r=30:d=${seconds}`]);
  const audio = withAudio ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${segments.reduce((s, [, d]) => s + d, 0)}`] : [];
  const concat = `${segments.map((_, i) => `[${i}:v]`).join('')}concat=n=${segments.length}:v=1:a=0[v]`;
  await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...inputs, ...audio, '-filter_complex', concat, '-map', '[v]', ...(withAudio ? ['-map', `${segments.length}:a`, '-c:a', 'aac'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest', path]);
  return path;
}

test('colour maths: identical colours are 0 apart, black and white far apart', () => {
  assert.equal(deltaE([10, 20, 30], [10, 20, 30]), 0);
  assert.ok(deltaE([0, 0, 0], [255, 255, 255]) > 95);
  assert.ok(deltaE(fromHex('#e8764b'), fromHex('#e57a50')) < 4);
});

test('the palette is deterministic and ordered by share', () => {
  const pixels: [number, number, number][] = [...Array(600).fill([245, 243, 236]), ...Array(300).fill([232, 118, 75]), ...Array(100).fill([20, 20, 20])];
  const a = dominantColors(pixels, 3);
  assert.deepEqual(a, dominantColors(pixels, 3));
  assert.equal(a.length, 3);
  assert.ok(a[0]!.share > a[1]!.share && a[1]!.share > a[2]!.share);
  assert.ok(deltaE(fromHex(a[0]!.hex), [245, 243, 236]) < 3);
  assert.equal(paletteDistance(a, a), 0);
});

test('cuts are local maxima over the threshold and close ones merge', () => {
  const scores = [0, 0.01, 0.5, 0.02, 0, 0, 0, 0.4, 0.45, 0.01, 0, 0.35].map((score, i) => ({time: i / 10, score}));
  const cuts = cutsFromScores(scores, 0.3, 0.25);
  assert.deepEqual(cuts.map(c => c.time), [0.2, 0.8, 1.1]);
  assert.equal(autoCutThreshold([]), 0.3);
  assert.equal(autoCutThreshold(Array(100).fill(0.001)), 0.02);
  assert.equal(autoCutThreshold(Array(100).fill(0.9)), 0.3);
});

test('statistics helpers behave', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), 0);
  assert.deepEqual(resample([0, 10], 3), [0, 5, 10]);
  assert.deepEqual(tileTimes([0, 6, 10], 10).every(t => t >= 0 && t < 10), true);
  assert.ok(tileTimes(Array.from({length: 80}, (_, i) => i), 80).length <= 32);
});

test('analysis finds the cuts and colours of a video whose answer is known', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ref-'));
  try {
    const video = await clip(dir, 'known.mp4', [['0xff0000', 2], ['0x00ff00', 3], ['0x0000ff', 1]]);
    const analysis = await analyzeReference({video, out: join(dir, 'out')});
    assert.equal(analysis.cuts.length, 2);
    assert.ok(Math.abs(analysis.cuts[0]!.time - 2) <= 0.1, `first cut ${analysis.cuts[0]!.time}`);
    assert.ok(Math.abs(analysis.cuts[1]!.time - 5) <= 0.1, `second cut ${analysis.cuts[1]!.time}`);
    assert.deepEqual(analysis.scenes.map(s => Math.round(s.duration)), [2, 3, 1]);
    assert.ok(deltaE(fromHex(analysis.scenes[1]!.palette[0]!.hex), [0, 255, 0]) < 12);
    assert.ok(Math.abs(analysis.palette[0]!.share - 0.5) < 0.08, 'green is half the video');
    assert.equal(analysis.video.has_audio, true);
    assert.ok(analysis.audio && analysis.audio.integrated_lufs !== null && analysis.audio.integrated_lufs < 0);
    assert.equal(analysis.tiles[0]!.frames.length, analysis.tiles.flatMap(t => t.frames).length);
    assert.ok(analysis.unmeasured.some(item => /typography/.test(item)));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('a sample with the same colours and rhythm scores high, a different one scores low', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cmp-'));
  try {
    const reference = await analyzeReference({video: await clip(dir, 'ref.mp4', [['0xe8764b', 2], ['0xf6f3ec', 3], ['0x141414', 1]]), out: join(dir, 'a')});
    const same = await analyzeReference({video: await clip(dir, 'same.mp4', [['0xe57a50', 2], ['0xf5f2eb', 3], ['0x151515', 1]]), out: join(dir, 'b')});
    const other = await analyzeReference({video: await clip(dir, 'other.mp4', [['0x0000ff', 0.7], ['0x00ff00', 0.7], ['0xff00ff', 0.7], ['0x00ffff', 0.7], ['0xffff00', 0.7], ['0x0000ff', 0.7], ['0x00ff00', 0.7], ['0xff00ff', 0.7]], false), out: join(dir, 'c')});
    const good = compareAnalyses(reference, same);
    const bad = compareAnalyses(reference, other);
    assert.ok(good.measured_fidelity >= 0.75, JSON.stringify(good.checks.filter(c => !c.pass)));
    assert.ok(bad.measured_fidelity <= 0.25, JSON.stringify(bad.checks));
    assert.equal(bad.checks.find(c => c.check === 'palette_delta_e')!.pass, false);
    assert.ok(good.not_measured.length > 0);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

import {writeFile} from 'node:fs/promises';
import {ModeRequestSchema, checkReferenceCoverage} from '../src/modes/request.ts';

const sha = 'a'.repeat(64);
const fakeAnalysis = {schema_version: '1.0', video: {sha256: sha, duration_seconds: 10, width: 1080, height: 1920, fps: 30, has_audio: true}, settings: {cut_threshold: 0.1, cut_sample_fps: 15}, cuts: [{time: 4, score: 0.5}], scenes: [{index: 0, start: 0, end: 4, duration: 4, palette: [], motion_mean: 0.1}, {index: 1, start: 4, end: 10, duration: 6, palette: [], motion_mean: 0.1}], palette: [], motion: {step_seconds: 0.5, curve: []}, audio: {integrated_lufs: -14, true_peak_db: -1, silences: []}, tiles: [], unmeasured: []};
const behavior = 'A white card slides up from the bottom with a hard shadow, settles, then fades out.';
const observe = (start: number, end: number, system: string) => ({start_seconds: start, end_seconds: end, system, behavior});
const request = (observations: unknown[], overrides: Record<string, unknown> = {}) => ModeRequestSchema.parse({schema_version: '1.0', mode_id: 'ref-test', title: 'Ref test', requested_at: '2026-10-30T00:00:00.000Z', first_video: 'wait-for-mode', example_request: 'x', series: 'x', constant: ['x'], varies: ['x'], duration_seconds: {min: 10, max: 30}, look: 'x', references: [], voice_and_sound: 'x', avoid: [], observations, ...overrides});

async function withAnalysis(run: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'cov-'));
  try {
    const path = join(dir, 'reference-analysis.json');
    await writeFile(path, JSON.stringify(fakeAnalysis));
    await run(path);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

const full = [observe(0, 4, 'typography'), observe(0, 4, 'layout'), observe(1, 3, 'motion'), observe(4, 10, 'transition'), observe(4, 10, 'sound')];

test('a reference is read closely when every scene and system has a timestamped observation', async () => {
  await withAnalysis(async path => {
    const report = await checkReferenceCoverage(request(full, {reference_analyses: [{analysis: path, reference_sha256: sha}]}));
    assert.deepEqual(report, [{reference: 0, scenes: 2, uncovered: [], systems_missing: []}]);
  });
  assert.equal(await checkReferenceCoverage(request([])), null);
});

test('a request is refused for a reference it has not read closely', async () => {
  await withAnalysis(async path => {
    const analyses = {reference_analyses: [{analysis: path, reference_sha256: sha}]};
    await assert.rejects(checkReferenceCoverage(request(full.slice(0, 3), analyses)), /1 of 2 scenes have no observation \(first at 4s to 10s\)/);
    await assert.rejects(checkReferenceCoverage(request([observe(0, 10, 'typography'), observe(0, 10, 'layout'), observe(0, 10, 'motion')], analyses)), /no observation of transition, sound/);
    await assert.rejects(checkReferenceCoverage(request(full, {reference_analyses: [{analysis: path, reference_sha256: 'b'.repeat(64)}]})), /different video/);
    await assert.rejects(checkReferenceCoverage(request([...full, observe(9, 12, 'color')], analyses)), /past the 10s reference/);
    await assert.rejects(checkReferenceCoverage(request([...full, {...observe(1, 2, 'graphic'), reference: 3}], analyses)), /no analysis/);
    await assert.rejects(checkReferenceCoverage(request([], analyses)), /timestamped observations/);
  });
  await assert.rejects(checkReferenceCoverage(request(full)), /run studio analyze-reference first/);
});

test('an observation must describe behaviour, not name a thing', () => {
  assert.throws(() => request([observe(0, 1, 'motion')].map(o => ({...o, behavior: 'a card'}))), /Describe the behaviour/);
  assert.throws(() => request([observe(2, 1, 'motion')]));
});
