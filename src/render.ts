import {bundle} from '@remotion/bundler';
import {makeCancelSignal, openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {cp, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {LoadedJob} from './load.ts';
import {StudioError, requireCondition} from './errors.ts';

export const packageRoot = fileURLToPath(new URL('..', import.meta.url));

export function selectThumbnailFrame(scene: {startFrame: number; endFrame: number}): number {
  const duration = scene.endFrame - scene.startFrame;
  if (duration <= 0) return scene.startFrame;
  const lastFrame = scene.endFrame - 1;
  const introFrames = 25;
  if (duration > introFrames) {
    return scene.startFrame + introFrames + Math.floor((duration - introFrames) / 2);
  }
  return lastFrame;
}

export async function renderVisual(loaded: LoadedJob, dir: string, kind: 'preview' | 'render', deadline: number) {
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired before visual preparation');
  const publicDir = resolve(dir, 'public');
  await mkdir(publicDir, {recursive: true});
  const stills: Record<string, string> = {};
  let font = '';
  for (const asset of loaded.job.assets) {
    if (asset.kind === 'audio') continue;
    const ext = extname(asset.file.path).toLowerCase();
    requireCondition(
      asset.kind === 'still'
        ? ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
        : ['.woff2', '.woff', '.ttf', '.otf'].includes(ext),
      'UNSUPPORTED_ASSET',
      'Only local raster stills and font files can enter the renderer'
    );
    const name = `${asset.asset_id}${ext}`;
    await cp(loaded.assetPaths[asset.asset_id]!, resolve(publicDir, name), {errorOnExist: true, force: false});
    if (asset.kind === 'still') stills[asset.asset_id] = name;
    if (asset.asset_id === loaded.brand.font_asset_id) font = name;
  }

  const serveUrl = await bundle({
    entryPoint: resolve(packageRoot, 'src/rendering/entry.tsx'),
    rootDir: packageRoot,
    publicDir,
    outDir: resolve(dir, 'bundle'),
    enableCaching: false,
  });
  requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired while bundling');

  const browser = await openBrowser('chrome', {logLevel: 'error'});
  let timedOut = false;
  let signalReceived: string | null = null;
  const cancellation = makeCancelSignal();
  const timer = setTimeout(() => {
    timedOut = true;
    cancellation.cancel();
  }, Math.max(1, deadline - Date.now()));
  timer.unref();

  const handleSigInt = () => {
    signalReceived = 'SIGINT';
    cancellation.cancel();
  };
  const handleSigTerm = () => {
    signalReceived = 'SIGTERM';
    cancellation.cancel();
  };
  process.once('SIGINT', handleSigInt);
  process.once('SIGTERM', handleSigTerm);

  try {
    const inputProps = {timeline: loaded.timeline, brand: loaded.brand, font, stills};
    const stepTimeout = Math.max(1_000, deadline - Date.now());
    const composition = await selectComposition({
      serveUrl,
      id: 'VideoStudio',
      inputProps,
      puppeteerInstance: browser,
      timeoutInMilliseconds: stepTimeout,
      logLevel: 'error',
    });

    requireCondition(!signalReceived, 'JOB_CANCELLED', `Rendering cancelled by ${signalReceived}`);
    requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired before visual rendering');

    const scale = kind === 'preview' ? 0.5 : 1;
    const outputLocation = resolve(dir, 'visual.mp4');
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      outputLocation,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      muted: true,
      concurrency: 1,
      scale,
      crf: 20,
      x264Preset: 'fast',
      puppeteerInstance: browser,
      cancelSignal: cancellation.cancelSignal,
      timeoutInMilliseconds: Math.max(1_000, deadline - Date.now()),
      logLevel: 'error',
    });

    const thumbnails: string[] = [];
    for (const scene of loaded.timeline.scenes) {
      requireCondition(!signalReceived, 'JOB_CANCELLED', `Rendering cancelled by ${signalReceived}`);
      requireCondition(Date.now() < deadline, 'DEADLINE_EXCEEDED', 'Job deadline expired during thumbnails');
      const name = `scene-${scene.scene_id}.png`;
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        output: resolve(dir, name),
        frame: selectThumbnailFrame(scene),
        scale: 0.25,
        imageFormat: 'png',
        puppeteerInstance: browser,
        cancelSignal: cancellation.cancelSignal,
        timeoutInMilliseconds: Math.max(1_000, deadline - Date.now()),
        logLevel: 'error',
      });
      thumbnails.push(name);
    }
    return {video: 'visual.mp4', thumbnails, width: composition.width * scale, height: composition.height * scale};
  } catch (error) {
    if (signalReceived) {
      throw new StudioError('JOB_CANCELLED', `Rendering cancelled by ${signalReceived}`, {signal: signalReceived});
    }
    if (timedOut || Date.now() >= deadline) {
      throw new StudioError('DEADLINE_EXCEEDED', 'Job deadline expired during visual rendering');
    }
    if (error instanceof StudioError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('LAYOUT_OVERFLOW')) {
      throw new StudioError('LAYOUT_OVERFLOW', message);
    }
    throw new StudioError('RENDER_FAILED', message);
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', handleSigInt);
    process.off('SIGTERM', handleSigTerm);
    await browser.close({silent: true});
  }
}
