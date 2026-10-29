import {dirname, extname, resolve} from 'node:path';
import {open, realpath, readFile, stat} from 'node:fs/promises';
import {JobSchema, ScriptSchema, StoryboardSchema, TimingSchema, BrandSchema, MixSchema} from './contracts.ts';
import {readJson, resolveInput, sha256} from './files.ts';
import {requireCondition} from './errors.ts';
import {compileTimeline} from './timeline.ts';
import {probe} from './media.ts';
import {lintStoryboard} from './storyboard-lint.ts';

async function validateRasterAsset(path: string): Promise<void> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const {bytesRead} = await fh.read(buf, 0, 16, 0);
    requireCondition(bytesRead >= 8, 'UNSUPPORTED_ASSET', 'Still asset is too small to be a valid raster image');
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isWebp = bytesRead >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    requireCondition(isPng || isJpg || isWebp, 'UNSUPPORTED_ASSET', 'Still asset byte signature is not a supported raster format (PNG, JPEG, WebP)');
  } finally {
    await fh.close();
  }
}

async function validateFontAsset(path: string): Promise<void> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const {bytesRead} = await fh.read(buf, 0, 16, 0);
    requireCondition(bytesRead >= 4, 'UNSUPPORTED_ASSET', 'Font asset is too small to be a valid font');
    const magic4 = buf.subarray(0, 4).toString('ascii');
    const isWoff2 = magic4 === 'wOF2';
    const isWoff = magic4 === 'wOFF';
    const isOtf = magic4 === 'OTTO';
    const isTtf = (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) || magic4 === 'true';
    requireCondition(isWoff2 || isWoff || isOtf || isTtf, 'UNSUPPORTED_ASSET', 'Font asset byte signature is not a supported font format (WOFF2, WOFF, OTF, TTF)');
  } finally {
    await fh.close();
  }
}

export async function loadJob(path: string, started = Date.now()) {
  const manifestPath = await realpath(resolve(path));
  const root = dirname(manifestPath);
  const job = await readJson(manifestPath, JobSchema);
  const paths = {} as Record<keyof typeof job.inputs, string>;
  let bytes = 0;
  for (const key of Object.keys(job.inputs) as (keyof typeof job.inputs)[]) {
    paths[key] = await resolveInput(root, job.inputs[key], job.limits.max_input_bytes);
    bytes += (await stat(paths[key])).size;
  }
  const assetPaths: Record<string, string> = Object.create(null);
  for (const asset of job.assets) {
    requireCondition(!assetPaths[asset.asset_id], 'DUPLICATE_ID', 'Asset ids must be unique');
    assetPaths[asset.asset_id] = await resolveInput(root, asset.file, job.limits.max_input_bytes);
    bytes += (await stat(assetPaths[asset.asset_id]!)).size;

    const ext = extname(asset.file.path).toLowerCase();
    const assetPath = assetPaths[asset.asset_id]!;
    if (asset.kind === 'still') {
      requireCondition(['.png', '.jpg', '.jpeg', '.webp'].includes(ext), 'UNSUPPORTED_ASSET', 'Only local raster stills (.png, .jpg, .jpeg, .webp) can enter the renderer');
      await validateRasterAsset(assetPath);
    } else if (asset.kind === 'font') {
      requireCondition(['.woff2', '.woff', '.ttf', '.otf'].includes(ext), 'UNSUPPORTED_ASSET', 'Only local font files (.woff2, .woff, .ttf, .otf) can enter the renderer');
      await validateFontAsset(assetPath);
    } else if (asset.kind === 'audio') {
      requireCondition(['.wav', '.mp3', '.aac', '.m4a', '.flac', '.ogg'].includes(ext), 'UNSUPPORTED_ASSET', 'Only supported local audio files can enter the audio pipeline');
    }
  }
  requireCondition(bytes <= job.limits.max_input_bytes, 'INPUT_LIMIT', 'Combined inputs exceed their byte allowance');
  const [script, storyboard, timing, brand, mix] = await Promise.all([
    readJson(paths.script, ScriptSchema), readJson(paths.storyboard, StoryboardSchema), readJson(paths.timestamps, TimingSchema), readJson(paths.brand, BrandSchema), readJson(paths.mix, MixSchema),
  ]);
  requireCondition(timing.audio_sha256 === job.inputs.narration.sha256, 'INPUT_CHANGED', 'Timestamp manifest belongs to different narration');
  const remaining = () => Math.min(30_000, started + job.limits.max_runtime_seconds * 1000 - Date.now());
  const narration = await probe(paths.narration, remaining());
  requireCondition(narration.streams.some(s => s.codec_type === 'audio') && !narration.streams.some(s => s.codec_type === 'video'), 'INVALID_NARRATION', 'Narration must be audio-only media');
  requireCondition(Math.abs(narration.duration - timing.duration_seconds) <= 1 / job.format.fps, 'TIMING_CONFLICT', 'Timestamp duration does not match actual audio');
  requireCondition(narration.duration <= job.format.duration_seconds + 1 / job.format.fps, 'TIMING_CONFLICT', 'Narration audio duration exceeds output duration beyond one frame tolerance');
  const timeline = compileTimeline(job, storyboard.scenes, timing, script.segments);
  const spokenWords = new Map<string, string[]>();
  for (const word of timing.words) spokenWords.set(word.segment_id, [...(spokenWords.get(word.segment_id) ?? []), word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')]);
  const lint = lintStoryboard(timeline.scenes, brand, spokenWords);
  requireCondition(lint.length === 0, 'STORYBOARD_LINT', `Storyboard breaks explainer rules: ${lint.join('; ')}`);
  const asset = (id: string, kind: 'still' | 'audio' | 'font') => job.assets.find(a => a.asset_id === id && a.kind === kind);
  requireCondition(asset(brand.font_asset_id, 'font'), 'MISSING_FONT', 'Brand must reference a pinned font asset');
  for (const scene of storyboard.scenes) {
    if (scene.still_asset_id) requireCondition(asset(scene.still_asset_id, 'still'), 'MISSING_ASSET', 'Scene still asset is missing or has wrong kind');
  }
  for (const track of mix.tracks) {
    requireCondition(asset(track.asset_id, 'audio'), 'MISSING_ASSET', 'Mix track is missing or has wrong kind');
    requireCondition(track.start_seconds + track.duration_seconds <= job.format.duration_seconds + 1e-8 && track.fade_in_seconds + track.fade_out_seconds <= track.duration_seconds, 'INVALID_MIX', 'Mix track or fades exceed their duration');
    const media = await probe(assetPaths[track.asset_id]!, remaining());
    requireCondition(media.streams.some(s => s.codec_type === 'audio') && !media.streams.some(s => s.codec_type === 'video') && media.duration >= track.duration_seconds - 1 / job.format.fps, 'INVALID_MIX', 'Mix source cannot cover its requested audio range');
  }
  const inputHash = sha256(JSON.stringify(job));
  return {job, root, manifestPath, paths, assetPaths, script, storyboard, timing, brand, mix, timeline, inputHash, manifestHash: sha256(await readFile(manifestPath))};
}
export type LoadedJob = Awaited<ReturnType<typeof loadJob>>;
