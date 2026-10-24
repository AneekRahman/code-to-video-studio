import {mkdir, readFile, readdir, realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readJson, sha256} from '../../files.ts';
import {requireCondition} from '../../errors.ts';
import type {PlateManifest} from '../../plates.ts';
import {ShotListSchema, compileShots, type CompiledShot, type IsoProps} from './shots.ts';
import {SegmentTimingSchema, StorySchema, compileStory, estimateTiming, type StoryProps} from './story.ts';
import {renderComposition, stageFonts, stagePlates, writeContactSheet, type StagedPlate, type StillRequest} from './render.ts';

export async function loadPlates(platesDir: string): Promise<{dir: string; manifest: PlateManifest; plates: Record<string, StagedPlate>}> {
  const dir = await realpath(resolve(platesDir));
  const manifest = JSON.parse(await readFile(resolve(dir, 'plates.json'), 'utf8')) as PlateManifest;
  const plates: Record<string, StagedPlate> = {};
  for (const record of manifest.plates) {
    const path = resolve(dir, record.file);
    requireCondition(sha256(await readFile(path)) === record.sha256, 'INPUT_CHANGED', `Plate ${record.plate_id} does not match its manifest hash`);
    plates[record.plate_id] = {src: record.file, file: path, width: record.width, height: record.height};
  }
  return {dir, manifest, plates};
}

async function prepareOutput(outDir: string) {
  const out = resolve(outDir);
  await mkdir(out, {recursive: true, mode: 0o700});
  requireCondition((await readdir(out)).length === 0, 'OUTPUT_EXISTS', 'Preview output directory must be empty');
  const publicDir = resolve(out, '.work', 'public');
  await mkdir(publicDir, {recursive: true});
  return {out, publicDir};
}

function shotStills(shots: CompiledShot[]): StillRequest[] {
  return shots.flatMap(shot => (['a', 'b'] as const).map(label => ({shot, label, at: label === 'a' ? 0.2 : 0.8}))).map(({shot, label, at}, i) => ({
    name: `${String(i).padStart(2, '0')}-${shot.shot_id}-${label}.jpg`,
    frame: shot.startFrame + Math.floor((shot.durationInFrames - 1) * at),
    scale: 0.5,
    format: 'jpeg' as const,
  }));
}

async function renderPreview(composition: 'IsoHorror' | 'IsoStory', inputProps: IsoProps | StoryProps, out: string, publicDir: string, scale: number, video: boolean) {
  const stills = shotStills(inputProps.shots);
  await renderComposition({composition, inputProps, publicDir, workDir: out, ...(video ? {video: {path: resolve(out, 'preview.mp4'), scale}} : {}), stills});
  const contactSheet = await writeContactSheet(out, stills.map(s => s.name), {w: 270, h: 480}, 'contact-sheet.jpg');
  return {stills: stills.map(s => s.name), contact_sheet: contactSheet, video: video ? 'preview.mp4' : null};
}

export async function previewShots(options: {shots: string; plates: string; out: string; scale?: number}) {
  const list = await readJson(await realpath(resolve(options.shots)), ShotListSchema);
  const {plates} = await loadPlates(options.plates);
  const {shots, durationInFrames} = compileShots(list);
  const {out, publicDir} = await prepareOutput(options.out);
  const staged = await stagePlates(shots, plates, publicDir);
  const inputProps: IsoProps = {width: 1080, height: 1920, fps: list.fps, durationInFrames, plates: staged, shots};
  const result = await renderPreview('IsoHorror', inputProps, out, publicDir, options.scale ?? 0.5, true);
  return {status: 'preview_ready', out, ...result, duration_frames: durationInFrames};
}

export async function previewStory(options: {story: string; plates: string; timing?: string; out: string; scale?: number; stillsOnly?: boolean}) {
  const {out, publicDir} = await prepareOutput(options.out);
  const story = await readJson(await realpath(resolve(options.story)), StorySchema);
  const timing = options.timing ? await readJson(await realpath(resolve(options.timing)), SegmentTimingSchema) : estimateTiming(story);
  const compiled = compileStory(story, timing);
  const {plates} = await loadPlates(options.plates);
  const props: StoryProps = {width: 1080, height: 1920, fps: story.fps, durationInFrames: compiled.durationInFrames, plates: await stagePlates(compiled.shots, plates, publicDir), shots: compiled.shots, segments: compiled.segments, overlays: compiled.overlays, fonts: await stageFonts(publicDir)};
  const result = await renderPreview('IsoStory', props, out, publicDir, options.scale ?? 0.5, !options.stillsOnly);
  return {status: 'preview_ready', out, timing_source: compiled.timing_source, duration_seconds: props.durationInFrames / props.fps, ...result};
}
