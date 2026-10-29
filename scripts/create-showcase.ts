import {cp, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {JobSchema, TimingSchema} from '../src/contracts.ts';
import {sha256, writeJson} from '../src/files.ts';
import {probe} from '../src/media.ts';
import {runTool} from '../src/process.ts';
import {normalizeWordTimings} from '../src/modes/explainer/timing.ts';

const palettes = {
  studio: {background: '#0e1423', foreground: '#f4f6fb', accent: '#5eead4'},
  paper: {background: '#f6f3ec', foreground: '#141414', accent: '#e8764b'},
} as const;

export type Look = keyof typeof palettes;

export const showcaseScenes = [
  {id: 'hook', segment: 'Ship video like you ship code. Script in, MP4 out.', treatment: 'headline', title: 'Ship *video* like you ship code', kicker: '/code-to-video', lines: ['Script in, MP4 out'], emphasis: ['video', 'code'], still: 'hook', still_layout: 'full', still_motion: 'push-in'},
  {id: 'frames', segment: 'Every frame is a pure function. Same input, same video, every time.', treatment: 'stat', title: 'Every frame is a *function*', value: 30, suffix: ' fps', lines: ['Pure code', 'Same input, same video'], emphasis: ['function', 'same'], still: 'frames', still_layout: 'panel', still_motion: 'pan-right'},
  {id: 'steps', segment: 'Four steps and no timeline. Write the script, narrate it, compile the timing, render the frames.', treatment: 'steps', title: 'Four steps, *zero* timeline', kicker: '/how-it-works', lines: ['Write the script', 'Narrate it', 'Compile the timing', 'Render the frames'], emphasis: ['four', 'no']},
  {id: 'code', segment: 'Scenes are just data. Change a line, and the whole video updates.', treatment: 'code', title: 'Scenes are just *data*', code: {language: 'storyboard.json', text: '{\n  "treatment": "stat",\n  "title": "Every frame",\n  "value": 30,\n  "suffix": " fps"\n}', highlight: [3, 4]}, emphasis: ['data', 'updates']},
  {id: 'chart', segment: 'Rendering gets faster. Timeline editing takes forty two minutes, scripting takes eleven, and cached reruns take three.', treatment: 'chart', title: 'Production time *drops*', kicker: '/minutes', unit: ' min', data: [{label: 'Timeline editor', value: 42}, {label: 'Scripted', value: 11}, {label: 'Cached rerun', value: 3}], emphasis: ['forty', 'eleven', 'three']},
  {id: 'iso', segment: 'Across every channel you watch, the ranking is clear. Three formats beat the rest, and one wins by far.', treatment: 'chart', chart_style: 'iso', title: 'It ranks *every* channel', kicker: '/ranking', unit: 'x', data: [{label: 'Shorts', value: 4}, {label: 'Reels', value: 3.6}, {label: 'Long', value: 3.2}], emphasis: ['ranking', 'wins']},
  {id: 'orbit', segment: 'It ships with twelve skills, each with its own job, all working together.', treatment: 'orbit', title: 'Twelve skills, *one* team', value: 12, suffix: 'skills', emphasis: ['twelve', 'team']},
  {id: 'gauge', segment: 'Then it scores the hook before you record. Eighty five out of one hundred means strong.', treatment: 'gauge', title: 'And it *scores* the hook', value: 85.6, suffix: 'hook score', lines: ['Strong'], emphasis: ['scores', 'strong']},
  {id: 'versus', segment: 'Stop dragging clips around. Start describing the video you want.', treatment: 'comparison', title: 'Stop *dragging* clips', lines: ['Dragging clips on a timeline', 'Describing the video in code'], emphasis: ['stop', 'describing'], still: 'versus', still_layout: 'panel', still_motion: 'pull-out'},
  {id: 'review', segment: 'Then review before it ships. Check the layout, check the sound, and check the story.', treatment: 'checklist', title: 'Review before it *ships*', lines: ['Layout stays in the safe area', 'Loudness hits the target', 'The story holds together'], emphasis: ['layout', 'sound', 'story'], still: 'review', still_layout: 'panel', still_motion: 'push-in'},
  {id: 'quote', segment: 'Make the boring parts automatic, and the creative part obvious.', treatment: 'quote', title: 'Why it *works*', lines: ['Make the boring parts automatic and the creative part obvious.', 'The studio'], emphasis: ['automatic', 'obvious']},
] as const;

export type ShowcaseOptions = {look?: Look; only?: string[]; art?: string; narration?: string};

const cleanWord = (word: string) => word.replace(/[.,]/g, '');

export function showcaseScript(only?: string[]) {
  const chosen = only ? showcaseScenes.filter(scene => only.includes(scene.id)) : showcaseScenes;
  return {schema_version: '1.0' as const, segments: chosen.map((scene, i) => ({segment_id: `n${i + 1}`, text: scene.segment.split(/\s+/).filter(Boolean).map(cleanWord).join(' ')}))};
}

export async function createShowcase(root: string | undefined, options: ShowcaseOptions = {}) {
  const look = options.look ?? 'studio';
  const dir = root ? resolve(root) : await mkdtemp(join(tmpdir(), 'video-studio-showcase-'));
  await mkdir(dir, {recursive: true, mode: 0o700});
  const font = fileURLToPath(import.meta.resolve('@fontsource/inter/files/inter-latin-400-normal.woff2'));
  await cp(font, resolve(dir, 'font.woff2'));
  const licensePath = fileURLToPath(import.meta.resolve('@fontsource/inter/LICENSE'));
  await cp(licensePath, resolve(dir, 'font-license.txt'));
  const fontLicenseText = await readFile(licensePath, 'utf8');

  const chosen = options.only ? showcaseScenes.filter(scene => options.only!.includes(scene.id)) : showcaseScenes;
  const script = showcaseScript(options.only);
  const timings: {segment_id: string; text: string; start: number; end: number}[] = [];
  let target: number;

  if (options.narration) {
    const supplied = TimingSchema.parse(JSON.parse(await readFile(resolve(options.narration, 'timestamps.json'), 'utf8')));
    timings.push(...normalizeWordTimings(supplied.words, supplied.duration_seconds));
    target = Math.ceil(supplied.duration_seconds * 30 + 12) / 30;
    await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', resolve(options.narration, 'narration.mp3'), '-af', `apad=whole_dur=${target}`, '-t', String(target), '-ar', '48000', '-ac', '1', resolve(dir, 'narration.wav')]);
  } else {
    const chunks: string[] = [];
    let cursor = 0;
    let index = 0;
    for (const [sceneIndex, segment] of script.segments.entries()) {
      for (const text of segment.text.split(' ')) {
        const aiff = resolve(dir, `w${index}.aiff`);
        const chunk = resolve(dir, `w${index}.wav`);
        await runTool('say', ['-o', aiff, text]);
        await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', aiff, '-af', 'silenceremove=stop_periods=1:stop_duration=0.05:stop_threshold=-40dB,apad=pad_dur=0.06', '-ar', '48000', '-ac', '1', chunk]);
        const length = (await probe(chunk)).duration;
        timings.push({segment_id: `n${sceneIndex + 1}`, text, start: cursor, end: cursor + length});
        cursor += length;
        chunks.push(chunk);
        index++;
      }
    }
    target = Math.ceil(cursor * 30) / 30;
    await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', ...chunks.flatMap(path => ['-i', path]), '-filter_complex', `${chunks.map((_, i) => `[${i}:a]`).join('')}concat=n=${chunks.length}:v=0:a=1,apad=whole_dur=${target}[audio]`, '-map', '[audio]', '-t', String(target), '-ar', '48000', resolve(dir, 'narration.wav')]);
  }

  const firstWord = (segmentId: string) => timings.find(word => word.segment_id === segmentId)!.start;
  const bounds = chosen.map((_, i) => ({start: i === 0 ? 0 : firstWord(`n${i + 1}`), end: i === chosen.length - 1 ? target : firstWord(`n${i + 2}`)}));

  const stillAssets: {asset_id: string; file: string; provenance: string}[] = [];
  for (const scene of chosen) {
    const stillId = (scene as {still?: string}).still;
    const source = stillId && options.art ? resolve(options.art, `${stillId}.jpg`) : null;
    if (stillId && source && existsSync(source)) {
      await cp(source, resolve(dir, `art-${stillId}.jpg`));
      stillAssets.push({asset_id: `art_${stillId}`, file: `art-${stillId}.jpg`, provenance: 'NVIDIA NIM black-forest-labs/flux-3-image-klein, generated for this demonstration'});
    }
  }

  await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'anoisesrc=d=0.6:color=pink:a=0.9:r=48000', '-af', 'highpass=f=260,lowpass=f=3200,afade=t=in:d=0.28,afade=t=out:st=0.26:d=0.34,volume=0.9', '-ac', '1', resolve(dir, 'whoosh.wav')]);
  const ref = async (name: string) => ({path: name, sha256: sha256(await readFile(resolve(dir, name)))});

  await writeJson(resolve(dir, 'script.json'), script);
  await writeJson(resolve(dir, 'timestamps.json'), {schema_version: '1.0', audio_sha256: (await ref('narration.wav')).sha256, duration_seconds: target, words: timings});
  const arted = new Set(stillAssets.map(asset => asset.asset_id));
  await writeJson(resolve(dir, 'storyboard.json'), {schema_version: '1.0', scenes: chosen.map((scene, i) => {
    const {segment: _segment, id, still, ...rest} = scene as typeof scene & {still?: string};
    const hasArt = still !== undefined && arted.has(`art_${still}`);
    const {still_layout, still_motion, ...kept} = rest as typeof rest & {still_layout?: string; still_motion?: string};
    return {...kept, scene_id: id, start_seconds: bounds[i]!.start, end_seconds: bounds[i]!.end, ...(hasArt ? {still_asset_id: `art_${still}`, still_layout, still_motion} : {}), narration_segment_ids: [`n${i + 1}`]};
  })});
  await writeJson(resolve(dir, 'brand.json'), {schema_version: '1.0', brand_id: `showcase_${look}`, version: '1', ...palettes[look], font_asset_id: 'showcase_font', caption_mode: 'word-highlight', motion: 'dynamic', look, safe_area: {top: 150, bottom: 240, left: 90, right: 90}});
  const tracks = bounds.slice(1).map(bound => ({asset_id: 'showcase_whoosh', start_seconds: Math.max(0, Number((bound.start - 0.3).toFixed(3))), duration_seconds: 0.6, gain_db: -26, fade_in_seconds: 0.05, fade_out_seconds: 0.2}));
  await writeJson(resolve(dir, 'mix.json'), {schema_version: '1.0', narration_gain_db: 0, tracks});
  const job = JobSchema.parse({schema_version: '1.0', adapter: 'local-fixture', job_id: `showcase_${look}`, status: 'approved_for_visual_production', format: {width: 1080, height: 1920, fps: 30, duration_seconds: target, codec: 'h264', container: 'mp4'}, inputs: {script: await ref('script.json'), storyboard: await ref('storyboard.json'), narration: await ref('narration.wav'), timestamps: await ref('timestamps.json'), brand: await ref('brand.json'), mix: await ref('mix.json')}, assets: [
    {asset_id: 'showcase_font', kind: 'font', file: await ref('font.woff2'), provenance: '@fontsource/inter 5.3.0', usage_rights: fontLicenseText},
    ...(await Promise.all(stillAssets.map(async asset => ({asset_id: asset.asset_id, kind: 'still' as const, file: await ref(asset.file), provenance: asset.provenance, usage_rights: 'Generated for this demonstration; not cleared for publication'})))),
    {asset_id: 'showcase_whoosh', kind: 'audio', file: await ref('whoosh.wav'), provenance: 'Locally synthesized filtered noise sweep', usage_rights: 'Project-generated sound effect'},
  ], limits: {max_operation_attempts: 8, max_runtime_seconds: 1800, max_input_bytes: 80_000_000, max_output_bytes: 250_000_000, max_frames: 3600, concurrency: 1}});
  await writeJson(resolve(dir, 'job.json'), job);
  await writeFile(resolve(dir, 'showcase-info.txt'), 'Every explainer treatment in one job. A technical showcase, not production narration.\n');
  return {directory: dir, job: resolve(dir, 'job.json'), look, duration_seconds: target, still_assets: stillAssets.length};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {out: {type: 'string'}, look: {type: 'string', default: 'studio'}, only: {type: 'string'}, art: {type: 'string'}, narration: {type: 'string'}}});
  const look = values.look === 'paper' ? 'paper' : 'studio';
  createShowcase(values.out, {look, only: values.only?.split(','), art: values.art, narration: values.narration}).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((err: unknown) => {
    process.stderr.write(`Showcase creation failed${err instanceof Error ? `: ${err.message}` : ''}; ffmpeg and macOS say are required.\n`);
    process.exitCode = 1;
  });
}
