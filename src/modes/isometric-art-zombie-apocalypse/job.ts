import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, resolve} from 'node:path';
import {StoryJobSchema} from '../../contracts.ts';
import {readJson, resolveInput, sha256} from '../../files.ts';
import {StudioError, requireCondition} from '../../errors.ts';
import {detectRasterFormat} from '../../imagegen/provider.ts';
import {isMp3} from '../../audiogen/provider.ts';
import {probe} from '../../media.ts';
import {runTool} from '../../process.ts';
import {modeId} from './style.ts';
import {SegmentTimingSchema, StorySchema, compileStory, type StoryProps} from './story.ts';
import {SoundSchema, planMix} from './sound.ts';
import {mixStory, muxStory} from './mixdown.ts';
import {measureExport, storyRubric} from './quality.ts';
import {renderComposition} from '../../composition.ts';
import {stageFonts, stagePlates, type StagedPlate} from './render.ts';

const contractError = (code: string) => (error: unknown): never => {
  if (error instanceof StudioError) throw error;
  throw new StudioError(code, error instanceof Error ? error.message : 'Story inputs are inconsistent');
};

export async function loadStoryJob(manifestPath: string, started = Date.now()) {
  const root = dirname(manifestPath);
  const job = await readJson(manifestPath, StoryJobSchema);
  const remaining = () => Math.min(30_000, started + job.limits.max_runtime_seconds * 1000 - Date.now());
  const paths = {} as Record<keyof typeof job.inputs, string>;
  let bytes = 0;
  for (const key of Object.keys(job.inputs) as (keyof typeof job.inputs)[]) {
    paths[key] = await resolveInput(root, job.inputs[key], job.limits.max_input_bytes);
    bytes += (await stat(paths[key])).size;
  }
  const assetPaths: Record<string, string> = Object.create(null);
  for (const asset of job.assets) {
    requireCondition(!assetPaths[asset.asset_id], 'DUPLICATE_ID', 'Asset ids must be unique');
    const path = await resolveInput(root, asset.file, job.limits.max_input_bytes);
    bytes += (await stat(path)).size;
    const ext = extname(asset.file.path).toLowerCase();
    const head = (await readFile(path)).subarray(0, 16);
    if (asset.kind === 'still') requireCondition(['.jpg', '.jpeg', '.png'].includes(ext) && detectRasterFormat(head), 'UNSUPPORTED_ASSET', 'Plates must be JPEG or PNG files');
    else requireCondition(ext === '.mp3' && isMp3(head), 'UNSUPPORTED_ASSET', 'Story audio clips must be MP3 files');
    assetPaths[asset.asset_id] = path;
  }
  requireCondition(bytes <= job.limits.max_input_bytes, 'INPUT_LIMIT', 'Combined inputs exceed their byte allowance');

  const [story, sound, timing] = await Promise.all([readJson(paths.story, StorySchema), readJson(paths.sound, SoundSchema), readJson(paths.timing, SegmentTimingSchema)]);
  requireCondition(sound.story_id === story.story_id, 'INVALID_CONTRACT', 'Sound design targets a different story');
  let compiled: ReturnType<typeof compileStory>;
  try {
    compiled = compileStory(story, timing);
  } catch (error) {
    return contractError('TIMING_CONFLICT')(error);
  }
  requireCondition(compiled.durationInFrames <= job.limits.max_frames, 'FRAME_LIMIT', 'Job exceeds the configured frame allowance');
  requireCondition(Math.abs(compiled.durationInFrames / story.fps - job.format.duration_seconds) <= 1 / story.fps, 'TIMING_CONFLICT', 'Job duration does not match the narration-timed story');

  const kindOf = (assetId: string) => job.assets.find(a => a.asset_id === assetId)?.kind;
  const plates: Record<string, StagedPlate> = {};
  for (const plateId of new Set(compiled.shots.map(s => s.plate_id))) {
    requireCondition(kindOf(plateId) === 'still', 'MISSING_ASSET', `Plate ${plateId} is not a pinned still asset`);
    const [width, height] = (await runTool('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', assetPaths[plateId]!], remaining())).trim().split(',').map(Number);
    requireCondition(width && height, 'UNSUPPORTED_ASSET', `Plate ${plateId} has no readable dimensions`);
    plates[plateId] = {src: `${plateId}${extname(assetPaths[plateId]!)}`, file: assetPaths[plateId]!, width, height};
  }
  const clip = async (assetId: string) => {
    requireCondition(kindOf(assetId) === 'audio', 'MISSING_AUDIO', `Clip ${assetId} is not a pinned audio asset`);
    return (await probe(assetPaths[assetId]!, remaining())).duration;
  };
  for (const segment of timing.segments) {
    requireCondition(await clip(`speech-${segment.segment_id}`) <= segment.duration_seconds + 1 / story.fps, 'TIMING_CONFLICT', `Narration clip ${segment.segment_id} is longer than its timing`);
  }
  const effectDurations: Record<string, number> = {};
  for (const effect of sound.effects) effectDurations[effect.effect_id] = await clip(`effect-${effect.effect_id}`);
  await clip('music');

  const timeline = {fps: story.fps, ...compiled};
  let plan: ReturnType<typeof planMix>;
  try {
    plan = planMix(sound, timeline);
  } catch (error) {
    return contractError('INVALID_MIX')(error);
  }
  const summary = {
    schema_version: '1.0', job_id: job.job_id, mode: modeId, fps: story.fps, durationInFrames: compiled.durationInFrames, timing_source: compiled.timing_source,
    shots: compiled.shots.map(s => ({shot_id: s.shot_id, plate_id: s.plate_id, startFrame: s.startFrame, durationInFrames: s.durationInFrames})),
    segments: compiled.segments.map(s => ({segment_id: s.segment_id, voice: s.voice, startFrame: s.startFrame, endFrame: s.endFrame})),
    cues: plan.cues,
  };
  return {mode: modeId, job, root, manifestPath, paths, assetPaths, story, sound, compiled: timeline, plan, plates, effectDurations, timeline: summary, inputHash: sha256(JSON.stringify(job)), manifestHash: sha256(await readFile(manifestPath))};
}

export type LoadedStoryJob = Awaited<ReturnType<typeof loadStoryJob>>;

export async function renderStoryVisual(loaded: LoadedStoryJob, dir: string, kind: 'preview' | 'render', deadline: number) {
  const publicDir = resolve(dir, 'public');
  await mkdir(publicDir, {recursive: true});
  const {compiled} = loaded;
  const props: StoryProps = {width: 1080, height: 1920, fps: compiled.fps, durationInFrames: compiled.durationInFrames, plates: await stagePlates(compiled.shots, loaded.plates, publicDir), shots: compiled.shots, segments: compiled.segments, overlays: compiled.overlays, fonts: await stageFonts(publicDir)};
  const scale = kind === 'preview' ? 0.5 : 1;
  const stills = compiled.shots.map(shot => ({name: `shot-${shot.shot_id}.png`, frame: shot.startFrame + Math.floor((shot.durationInFrames - 1) * 0.6), scale: 0.25, format: 'png' as const}));
  const size = await renderComposition({composition: 'IsoStory', inputProps: props, publicDir, workDir: dir, video: {path: resolve(dir, 'visual.mp4'), scale}, stills, deadline});
  return {video: 'visual.mp4', thumbnails: stills.map(s => s.name), width: size.width * scale, height: size.height * scale};
}

export async function finishStory(loaded: LoadedStoryJob, visualPath: string, dir: string, deadline: number) {
  const byPrefix = (prefix: string) => Object.fromEntries(loaded.job.assets.filter(a => a.kind === 'audio' && a.asset_id.startsWith(prefix)).map(a => [a.asset_id.slice(prefix.length), loaded.assetPaths[a.asset_id]!]));
  const inputs = {voiceFiles: byPrefix('speech-'), effectFiles: byPrefix('effect-'), effectDurations: loaded.effectDurations, musicFile: loaded.assetPaths.music!};
  const work = resolve(dir, 'mix');
  await mkdir(work);
  const mix = await mixStory(loaded.plan, loaded.sound, inputs, work);
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired while mixing');
  await muxStory(visualPath, resolve(work, mix.master), loaded.plan.duration_seconds, resolve(dir, 'final.mp4'));
  await rm(work, {recursive: true, force: true});
  const checks = [...storyRubric(loaded.compiled), ...await measureExport(resolve(dir, 'final.mp4'), loaded.compiled, loaded.plan)];
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired during quality measurement');
  const write = (name: string, value: unknown) => writeFile(resolve(dir, name), `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx', mode: 0o600});
  await write('mix-report.json', {schema_version: '1.0', loudness: mix.loudness, voice_levelling_db: mix.voice_levelling_db, cues: loaded.plan.cues.length});
  await write('quality.json', {schema_version: '1.0', all_checks_passed: checks.every(c => c.pass), creative_acceptance: 'not_reviewed', checks});
  return {video: 'final.mp4', artifacts: ['mix-report.json', 'quality.json']};
}
