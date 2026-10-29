import {execFile} from 'node:child_process';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {writeContactSheet} from './composition.ts';
import {StudioError, requireCondition} from './errors.ts';
import {readJson, sha256, writeJson} from './files.ts';
import {probe} from './media.ts';
import {runTool, runToolCapture} from './process.ts';
import {autoCutThreshold, cutsFromScores, dominantColors, median, paletteDistance, type Rgb, type Swatch} from './reference-math.ts';

const SwatchSchema = z.strictObject({hex: z.string().regex(/^#[0-9a-f]{6}$/), share: z.number()});

export const ReferenceAnalysisSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  video: z.strictObject({sha256: z.string(), duration_seconds: z.number(), width: z.number(), height: z.number(), fps: z.number(), has_audio: z.boolean()}),
  settings: z.strictObject({cut_threshold: z.number(), cut_sample_fps: z.number()}),
  cuts: z.array(z.strictObject({time: z.number(), score: z.number()})),
  scenes: z.array(z.strictObject({index: z.number(), start: z.number(), end: z.number(), duration: z.number(), palette: z.array(SwatchSchema), motion_mean: z.number()})),
  palette: z.array(SwatchSchema),
  motion: z.strictObject({step_seconds: z.number(), curve: z.array(z.number())}),
  audio: z.strictObject({integrated_lufs: z.number().nullable(), true_peak_db: z.number().nullable(), silences: z.array(z.strictObject({start: z.number(), end: z.number()}))}).nullable(),
  tiles: z.array(z.strictObject({file: z.string(), frames: z.array(z.strictObject({index: z.number(), time: z.number()}))})),
  /** What these measurements cannot tell: an observer must read the tiles and log it with timestamps. */
  unmeasured: z.array(z.string()),
});
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;

export const unmeasured = [
  'typography (faces, sizes, weights, case)',
  'layout and hierarchy inside a frame',
  'the path and easing of each motion (the motion curve is overall activity only)',
  'what a transition is (a wipe and a hard cut both register as a cut)',
  'the words spoken or shown on screen',
  'the identity of any graphic, 3D object or illustration',
];

const SAMPLE_FPS = 15;
const PALETTE_FPS = 2;

function rawRgb(video: string, fps: number, width: number, height: number): Promise<Buffer> {
  return new Promise((done, fail) => {
    execFile('ffmpeg', ['-nostdin', '-v', 'error', '-i', video, '-vf', `fps=${fps},scale=${width}:${height}`, '-an', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, timeout: 300_000}, (error, stdout) => {
      if (error) fail(new StudioError('TOOL_FAILED', 'ffmpeg could not decode the reference video'));
      else done(stdout);
    });
  });
}

async function sceneScores(video: string): Promise<{time: number; score: number}[]> {
  const {stdout} = await runToolCapture('ffmpeg', ['-nostdin', '-v', 'error', '-i', video, '-vf', `fps=${SAMPLE_FPS},select='gte(scene,0)',metadata=mode=print:file=-`, '-an', '-f', 'null', '-'], 300_000);
  const scores: {time: number; score: number}[] = [];
  let time = 0;
  for (const line of stdout.split('\n')) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) time = Number(t[1]);
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (s) scores.push({time, score: Number(s[1])});
  }
  return scores;
}

async function audioStats(video: string): Promise<NonNullable<ReferenceAnalysis['audio']>> {
  const loud = await runToolCapture('ffmpeg', ['-nostdin', '-hide_banner', '-i', video, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], 300_000);
  const last = (pattern: RegExp) => {
    const all = [...loud.stderr.matchAll(pattern)];
    return all.length ? Number(all.at(-1)![1]) : null;
  };
  const silence = await runToolCapture('ffmpeg', ['-nostdin', '-hide_banner', '-i', video, '-vn', '-af', 'silencedetect=n=-45dB:d=0.4', '-f', 'null', '-'], 300_000);
  const starts = [...silence.stderr.matchAll(/silence_start: ([\d.]+)/g)].map(m => Number(m[1]));
  const ends = [...silence.stderr.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]));
  return {integrated_lufs: last(/\bI:\s+(-?[\d.]+) LUFS/g), true_peak_db: last(/Peak:\s+(-?[\d.]+) dBFS/g), silences: starts.flatMap((start, i) => (ends[i] !== undefined ? [{start, end: ends[i]!}] : []))};
}

export function tileTimes(boundaries: number[], duration: number, limit = 32): number[] {
  const times = new Set<number>();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const span = end - start;
    times.add(Number(Math.min(end - 0.04, start + 0.12).toFixed(2)));
    times.add(Number((start + span * 0.55).toFixed(2)));
    if (span > 4) times.add(Number((start + span * 0.85).toFixed(2)));
  }
  let sorted = [...times].filter(t => t >= 0 && t < duration).sort((a, b) => a - b).filter((t, i, all) => i === 0 || t - all[i - 1]! >= 0.2);
  while (sorted.length > limit) sorted = sorted.filter((_, i) => i % 2 === 0 || i === sorted.length - 1);
  return sorted;
}

export async function analyzeReference(options: {video: string; out: string; cutThreshold?: number}): Promise<ReferenceAnalysis> {
  const video = resolve(options.video);
  const out = resolve(options.out);
  const info = await probe(video);
  const picture = info.streams.find(stream => stream.codec_type === 'video');
  requireCondition(picture?.width && picture.height, 'INVALID_REFERENCE', 'The reference has no video stream');
  requireCondition(info.duration > 0.5 && info.duration <= 600, 'INVALID_REFERENCE', 'The reference must run between 0.5 and 600 seconds');
  await mkdir(out, {recursive: true, mode: 0o700});
  const [num = 30, den = 1] = (picture.avg_frame_rate ?? '30/1').split('/').map(Number);
  const duration = Number(info.duration.toFixed(3));

  const scores = await sceneScores(video);
  const threshold = options.cutThreshold ?? autoCutThreshold(scores.map(s => s.score));
  const cuts = cutsFromScores(scores, threshold);
  const boundaries = [0, ...cuts.map(cut => cut.time).filter(t => t > 0.1 && t < duration - 0.1), duration];
  const step = 0.5;
  const buckets = Math.ceil(duration / step);
  const curve = Array.from({length: buckets}, (_, b) => {
    const inside = scores.filter(s => s.time >= b * step && s.time < (b + 1) * step);
    return Number((inside.reduce((sum, s) => sum + s.score, 0) / Math.max(1, inside.length)).toFixed(4));
  });

  const w = 48;
  const h = Math.max(2, Math.round((w * picture.height) / picture.width / 2) * 2);
  const raw = await rawRgb(video, PALETTE_FPS, w, h);
  const frameBytes = w * h * 3;
  const frames = Math.floor(raw.length / frameBytes);
  const pixelsOf = (from: number, to: number): Rgb[] => {
    const pixels: Rgb[] = [];
    for (let f = Math.max(0, from); f < Math.min(frames, Math.max(to, from + 1)); f++) {
      for (let p = 0; p < w * h; p += 2) pixels.push([raw[f * frameBytes + p * 3]!, raw[f * frameBytes + p * 3 + 1]!, raw[f * frameBytes + p * 3 + 2]!]);
    }
    return pixels;
  };
  const scenes = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]!;
    const inside = scores.filter(s => s.time >= start && s.time < end);
    return {index, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), duration: Number((end - start).toFixed(3)), palette: dominantColors(pixelsOf(Math.floor(start * PALETTE_FPS), Math.ceil(end * PALETTE_FPS)), 3), motion_mean: Number((inside.reduce((sum, s) => sum + s.score, 0) / Math.max(1, inside.length)).toFixed(4))};
  });

  const times = tileTimes(boundaries, duration);
  const framesDir = resolve(out, 'frames');
  await mkdir(framesDir, {recursive: true, mode: 0o700});
  const cellW = 270;
  const cellH = Math.round((cellW * picture.height) / picture.width / 2) * 2;
  const files: string[] = [];
  for (const [i, time] of times.entries()) {
    const name = `f${String(i).padStart(3, '0')}.jpg`;
    await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-ss', String(time), '-i', video, '-frames:v', '1', '-vf', `scale=${cellW}:${cellH}`, '-q:v', '3', resolve(framesDir, name)], 60_000);
    files.push(name);
  }
  const tiles: ReferenceAnalysis['tiles'] = [];
  for (let sheet = 0; sheet * 16 < files.length; sheet++) {
    const slice = files.slice(sheet * 16, sheet * 16 + 16);
    const name = `tiles-${String(sheet + 1).padStart(2, '0')}.jpg`;
    await writeContactSheet(framesDir, slice, {w: cellW, h: cellH}, name);
    tiles.push({file: `frames/${name}`, frames: slice.map((_, i) => ({index: i, time: times[sheet * 16 + i]!}))});
  }
  for (const file of files) await rm(resolve(framesDir, file));

  const analysis: ReferenceAnalysis = {
    schema_version: '1.0',
    video: {sha256: sha256(await readFile(video)), duration_seconds: duration, width: picture.width, height: picture.height, fps: Number((num / den).toFixed(2)), has_audio: info.streams.some(stream => stream.codec_type === 'audio')},
    settings: {cut_threshold: threshold, cut_sample_fps: SAMPLE_FPS},
    cuts,
    scenes,
    palette: dominantColors(pixelsOf(0, frames), 6),
    motion: {step_seconds: step, curve},
    audio: info.streams.some(stream => stream.codec_type === 'audio') ? await audioStats(video) : null,
    tiles,
    unmeasured,
  };
  await writeJson(resolve(out, 'reference-analysis.json'), analysis);
  return analysis;
}

export type Check = {check: string; pass: boolean; reference: number | null; sample: number | null; detail: string};

/** Measures how closely a sample reproduces the reference's colour, rhythm, activity and loudness. Everything the analysis cannot measure stays with the reviewer. */
export function compareAnalyses(reference: ReferenceAnalysis, sample: ReferenceAnalysis) {
  const refCuts = reference.cuts.length / (reference.video.duration_seconds / 60);
  const sampleCuts = sample.cuts.length / (sample.video.duration_seconds / 60);
  const refMedian = median(reference.scenes.map(s => s.duration));
  const sampleMedian = median(sample.scenes.map(s => s.duration));
  const colour = paletteDistance(reference.palette as Swatch[], sample.palette as Swatch[]);
  const stats = (curve: number[]) => {
    const sorted = [...curve].sort((a, b) => a - b);
    const mean = curve.reduce((sum, v) => sum + v, 0) / Math.max(1, curve.length);
    return {mean, p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0};
  };
  const refActivity = stats(reference.motion.curve);
  const sampleActivity = stats(sample.motion.curve);
  const ratio = (a: number, b: number) => (b === 0 ? Infinity : a / b);
  const checks: Check[] = [
    {check: 'palette_delta_e', pass: colour <= 18, reference: null, sample: Number(colour.toFixed(1)), detail: 'weighted distance from each reference colour to the nearest sample colour; at most 18'},
    {check: 'cuts_per_minute_ratio', pass: ratio(sampleCuts, refCuts) >= 0.67 && ratio(sampleCuts, refCuts) <= 1.5, reference: Number(refCuts.toFixed(1)), sample: Number(sampleCuts.toFixed(1)), detail: 'sample cut rate within 0.67 to 1.5 times the reference'},
    {check: 'median_scene_seconds_ratio', pass: ratio(sampleMedian, refMedian) >= 0.67 && ratio(sampleMedian, refMedian) <= 1.5, reference: Number(refMedian.toFixed(2)), sample: Number(sampleMedian.toFixed(2)), detail: 'median scene length within 0.67 to 1.5 times the reference'},
    {check: 'mean_activity_ratio', pass: ratio(sampleActivity.mean, refActivity.mean) >= 0.5 && ratio(sampleActivity.mean, refActivity.mean) <= 2, reference: Number(refActivity.mean.toFixed(4)), sample: Number(sampleActivity.mean.toFixed(4)), detail: 'how much changes on screen per frame, on average, within 0.5 to 2 times the reference'},
    {check: 'activity_burstiness_ratio', pass: ratio(sampleActivity.p90 / Math.max(1e-9, sampleActivity.mean), refActivity.p90 / Math.max(1e-9, refActivity.mean)) >= 0.5 && ratio(sampleActivity.p90 / Math.max(1e-9, sampleActivity.mean), refActivity.p90 / Math.max(1e-9, refActivity.mean)) <= 2, reference: Number((refActivity.p90 / Math.max(1e-9, refActivity.mean)).toFixed(2)), sample: Number((sampleActivity.p90 / Math.max(1e-9, sampleActivity.mean)).toFixed(2)), detail: 'how bursty the changes are (busiest tenth against the average), within 0.5 to 2 times the reference'},
  ];
  if (reference.audio?.integrated_lufs != null && sample.audio?.integrated_lufs != null) {
    const delta = Math.abs(reference.audio.integrated_lufs - sample.audio.integrated_lufs);
    checks.push({check: 'loudness_lufs_difference', pass: delta <= 3, reference: reference.audio.integrated_lufs, sample: sample.audio.integrated_lufs, detail: 'integrated loudness within 3 LU'});
  }
  const passed = checks.filter(check => check.pass).length;
  return {measured_fidelity: Number((passed / checks.length).toFixed(2)), passed, total: checks.length, checks, not_measured: reference.unmeasured};
}

export async function compareReference(options: {analysis: string; video: string; out: string}) {
  const reference = await readJson(resolve(options.analysis), ReferenceAnalysisSchema);
  const sample = await analyzeReference({video: options.video, out: options.out, cutThreshold: reference.settings.cut_threshold});
  const report = {schema_version: '1.0' as const, reference_sha256: reference.video.sha256, sample_sha256: sample.video.sha256, ...compareAnalyses(reference, sample)};
  await writeJson(resolve(options.out, 'reference-comparison.json'), report);
  return report;
}
