import {cp, mkdir, readdir, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {renderComposition} from '../src/composition.ts';
import {loadJob} from '../src/load.ts';
import {packageRoot} from '../src/render.ts';
import {runToolCapture} from '../src/process.ts';
import {usesWebGL} from '../src/storyboard-lint.ts';
import {createShowcase, type Look} from './create-showcase.ts';

/**
 * Renders one frame from every treatment of the showcase, in both looks, and compares it with the committed golden
 * frame for this platform. WebGL scenes get a looser threshold because GPU and CPU rasterisers differ by a few pixels.
 * Goldens are per platform (`tests/golden/<platform>`): run with `--update` on a new platform to create them.
 */
const flatThreshold = 0.985;
const webglThreshold = 0.93;
const goldenDir = resolve(packageRoot, 'tests/golden', process.platform);

async function renderFrames(look: Look, work: string) {
  const job = await createShowcase(resolve(work, `job-${look}`), {look, synthetic: true});
  const loaded = await loadJob(job.job);
  const publicDir = resolve(work, `public-${look}`);
  await mkdir(publicDir, {recursive: true});
  const fontAsset = loaded.job.assets.find(asset => asset.asset_id === loaded.brand.font_asset_id)!;
  await cp(loaded.assetPaths[fontAsset.asset_id]!, resolve(publicDir, 'brand.woff2'));
  await cp(fileURLToPath(import.meta.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2')), resolve(publicDir, 'studio-display.woff2'));
  await cp(fileURLToPath(import.meta.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')), resolve(publicDir, 'studio-mono.woff2'));
  const stills = loaded.timeline.scenes.map(scene => ({name: `${look}-${scene.scene_id}.jpg`, frame: scene.startFrame + Math.floor((scene.endFrame - scene.startFrame) * 0.72), scale: 0.4, format: 'jpeg' as const}));
  await renderComposition({composition: 'VideoStudio', inputProps: {timeline: loaded.timeline, brand: loaded.brand, font: 'brand.woff2', fonts: {display: 'studio-display.woff2', mono: 'studio-mono.woff2'}, stills: {}}, publicDir, workDir: work, stills});
  return loaded.timeline.scenes.map(scene => ({name: `${look}-${scene.scene_id}.jpg`, heavy: usesWebGL(scene)}));
}

async function ssim(a: string, b: string): Promise<number> {
  const {stderr} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], 60_000);
  const match = /All:([0-9.]+)/.exec(stderr);
  return match ? Number(match[1]) : 0;
}

const {values} = parseArgs({allowPositionals: true, options: {update: {type: 'boolean', default: false}}});
const work = resolve(packageRoot, 'work', `golden-${process.pid}`);
await mkdir(work, {recursive: true, mode: 0o700});
const failures: string[] = [];
let checked = 0;
try {
  for (const look of ['paper', 'studio'] as Look[]) {
    const frames = await renderFrames(look, work);
    if (values.update) await mkdir(goldenDir, {recursive: true});
    const existing = new Set(await readdir(goldenDir).catch(() => [] as string[]));
    for (const frame of frames) {
      const rendered = resolve(work, frame.name);
      if (values.update) {
        await cp(rendered, resolve(goldenDir, frame.name));
        continue;
      }
      if (!existing.has(frame.name)) {
        failures.push(`${frame.name}: no golden frame for ${process.platform}; run pnpm test:golden -- --update`);
        continue;
      }
      const score = await ssim(rendered, resolve(goldenDir, frame.name));
      checked++;
      const threshold = frame.heavy ? webglThreshold : flatThreshold;
      if (score < threshold) failures.push(`${frame.name}: SSIM ${score.toFixed(4)} is below ${threshold}`);
    }
  }
} finally {
  await rm(work, {recursive: true, force: true});
}
process.stdout.write(`${JSON.stringify({ok: failures.length === 0, platform: process.platform, updated: values.update, compared: checked, failures})}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
