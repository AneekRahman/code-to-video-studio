import {bundle} from '@remotion/bundler';
import {makeCancelSignal, openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {cp} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StudioError, requireCondition} from '../../errors.ts';
import {packageRoot} from '../../render.ts';
import {runTool} from '../../process.ts';
import type {CompiledShot, IsoProps, PlateRef} from './shots.ts';
import type {StoryProps} from './story.ts';

/** Remotion's headless Chrome needs a GPU-backed GL implementation for three.js layers. */
const chromiumOptions = {gl: 'angle' as const};

export const storyFonts = {
  display: fileURLToPath(import.meta.resolve('@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2')),
  mono: fileURLToPath(import.meta.resolve('@fontsource/vt323/files/vt323-latin-400-normal.woff2')),
  caption: fileURLToPath(import.meta.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2')),
};

export type StagedPlate = PlateRef & {file: string};

export async function stagePlates(shots: CompiledShot[], plates: Record<string, StagedPlate>, publicDir: string): Promise<Record<string, PlateRef>> {
  const staged: Record<string, PlateRef> = {};
  for (const id of new Set(shots.map(s => s.plate_id))) {
    const plate = plates[id];
    requireCondition(plate, 'MISSING_PLATE', `A shot references unknown plate ${id}`);
    await cp(plate.file, resolve(publicDir, plate.src), {errorOnExist: true, force: false});
    staged[id] = {src: plate.src, width: plate.width, height: plate.height};
  }
  return staged;
}

export async function stageFonts(publicDir: string): Promise<StoryProps['fonts']> {
  const fonts = {} as StoryProps['fonts'];
  for (const [key, path] of Object.entries(storyFonts) as [keyof typeof storyFonts, string][]) {
    await cp(path, resolve(publicDir, basename(path)), {errorOnExist: true, force: false});
    fonts[key] = basename(path);
  }
  return fonts;
}

export type StillRequest = {name: string; frame: number; scale: number; format: 'jpeg' | 'png'};

/** Renders a composition to an optional muted video and a list of stills, cancelled at `deadline`. */
export async function renderComposition(options: {composition: 'IsoHorror' | 'IsoStory'; inputProps: IsoProps | StoryProps; publicDir: string; workDir: string; video?: {path: string; scale: number}; stills: StillRequest[]; deadline?: number}) {
  const deadline = options.deadline ?? Infinity;
  const remaining = () => Math.max(1_000, Math.min(deadline - Date.now(), 2_147_000_000));
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired before visual preparation');
  const serveUrl = await bundle({entryPoint: resolve(packageRoot, 'src/rendering/entry.tsx'), rootDir: packageRoot, publicDir: options.publicDir, outDir: resolve(options.workDir, 'bundle'), enableCaching: false});
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired while bundling');
  const browser = await openBrowser('chrome', {logLevel: 'error', chromiumOptions});
  const cancellation = makeCancelSignal();
  let timedOut = false;
  const timer = Number.isFinite(deadline) ? setTimeout(() => {
    timedOut = true;
    cancellation.cancel();
  }, remaining()) : null;
  timer?.unref();
  const common = {serveUrl, inputProps: options.inputProps, puppeteerInstance: browser, chromiumOptions, logLevel: 'error' as const};
  try {
    const composition = await selectComposition({...common, id: options.composition, timeoutInMilliseconds: remaining()});
    if (options.video) {
      await renderMedia({...common, composition, outputLocation: options.video.path, codec: 'h264', pixelFormat: 'yuv420p', muted: true, concurrency: 1, scale: options.video.scale, crf: 18, x264Preset: 'fast', cancelSignal: cancellation.cancelSignal, timeoutInMilliseconds: remaining()});
    }
    for (const still of options.stills) {
      await renderStill({...common, composition, output: resolve(options.workDir, still.name), frame: still.frame, scale: still.scale, imageFormat: still.format, ...(still.format === 'jpeg' ? {jpegQuality: 88} : {}), cancelSignal: cancellation.cancelSignal, timeoutInMilliseconds: remaining()});
    }
    return {width: composition.width, height: composition.height};
  } catch (error) {
    if (timedOut || Date.now() >= deadline) throw new StudioError('DEADLINE_EXCEEDED', 'Job deadline expired during visual rendering');
    if (error instanceof StudioError) throw error;
    throw new StudioError('RENDER_FAILED', error instanceof Error ? error.message : String(error));
  } finally {
    if (timer) clearTimeout(timer);
    await browser.close({silent: true});
  }
}

export async function writeContactSheet(dir: string, stills: string[], cell: {w: number; h: number}, name: string) {
  const columns = Math.min(8, stills.length);
  const filter = `${stills.map((_, i) => `[${i}:v]scale=${cell.w}:${cell.h}[c${i}]`).join(';')};${stills.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${stills.length}:layout=${stills.map((_, i) => `${(i % columns) * cell.w}_${Math.floor(i / columns) * cell.h}`).join('|')}:fill=black[out]`;
  await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', ...stills.flatMap(s => ['-i', resolve(dir, s)]), '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-q:v', '3', resolve(dir, name)], 120_000);
  return name;
}
