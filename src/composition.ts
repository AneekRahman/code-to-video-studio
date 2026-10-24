import {bundle} from '@remotion/bundler';
import {makeCancelSignal, openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {resolve} from 'node:path';
import {StudioError, requireCondition} from './errors.ts';
import {packageRoot} from './render.ts';
import {runTool} from './process.ts';

/** Remotion's headless Chrome needs a GPU-backed GL implementation for three.js layers. */
const chromiumOptions = {gl: 'angle' as const};

export const sharedEntryPoint = resolve(packageRoot, 'src/rendering/entry.tsx');

export type StillRequest = {name: string; frame: number; scale: number; format: 'jpeg' | 'png'};

export type CompositionRequest = {
  /** A file that calls Remotion's `registerRoot`; defaults to the studio's shared entry. */
  entryPoint?: string;
  composition: string;
  inputProps: Record<string, unknown>;
  /** Files the composition loads with `staticFile`. */
  publicDir: string;
  workDir: string;
  video?: {path: string; scale: number};
  stills: StillRequest[];
  deadline?: number;
};

/** Renders a composition to an optional muted video and a list of stills, cancelled at `deadline`. */
export async function renderComposition(options: CompositionRequest) {
  const deadline = options.deadline ?? Infinity;
  const remaining = () => Math.max(1_000, Math.min(deadline - Date.now(), 2_147_000_000));
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired before visual preparation');
  const serveUrl = await bundle({entryPoint: options.entryPoint ?? sharedEntryPoint, rootDir: packageRoot, publicDir: options.publicDir, outDir: resolve(options.workDir, 'bundle'), enableCaching: false});
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
