import {open} from 'node:fs/promises';
import {z} from 'zod';
import {runTool} from './process.ts';
import {StudioError, requireCondition} from './errors.ts';

const Probe = z.object({
  format: z.object({
    format_name: z.string().optional(),
    duration: z.string().optional(),
    size: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
  }),
  streams: z.array(z.object({
    codec_type: z.string(),
    codec_name: z.string().optional(),
    profile: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    avg_frame_rate: z.string().optional(),
    pix_fmt: z.string().optional(),
    sample_rate: z.string().optional(),
    channels: z.number().optional(),
    channel_layout: z.string().optional(),
    duration: z.string().optional(),
  })),
});

export async function probe(path: string, timeout = 30_000) {
  const result = Probe.parse(JSON.parse(await runTool('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], timeout)));
  const duration = Number(result.format.duration);
  requireCondition(Number.isFinite(duration) && duration > 0, 'INVALID_MEDIA', 'Media has no positive finite duration');
  return {...result, duration};
}

export type ExpectedProfile = {
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  audio: boolean;
  channels?: number;
  sample_rate?: number;
  container?: string;
};

async function checkContainer(path: string, formatName: string, tags: Record<string, string> | undefined, expected: string): Promise<boolean> {
  const formats = formatName.split(',').map(s => s.trim().toLowerCase());
  if (expected.toLowerCase() === 'mp4') {
    if (!formats.includes('mp4')) return false;
    const major = (tags?.major_brand ?? '').trim().toLowerCase();
    const comp = (tags?.compatible_brands ?? '').toLowerCase();
    if (major === 'qt' || comp.startsWith('qt')) return false;
    const mp4Brands = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash'];
    const tagMatches = mp4Brands.some(b => major === b || comp.includes(b));
    if (tagMatches) return true;
    try {
      const handle = await open(path, 'r');
      try {
        const buffer = Buffer.alloc(16);
        const {bytesRead} = await handle.read(buffer, 0, 16, 0);
        if (bytesRead < 12) return false;
        if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
        const brand = buffer.toString('ascii', 8, 12).trim().toLowerCase();
        return brand !== 'qt' && mp4Brands.includes(brand);
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }
  return formats.includes(expected.toLowerCase());
}

export async function inspect(path: string, expected: ExpectedProfile, timeout = 30_000) {
  const started = Date.now();
  const info = await probe(path, timeout);
  const video = info.streams.filter(s => s.codec_type === 'video');
  const audio = info.streams.filter(s => s.codec_type === 'audio');
  const [numerator, denominator] = (video[0]?.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = denominator && denominator > 0 ? (numerator ?? 0) / denominator : 0;
  const videoDuration = Number(video[0]?.duration ?? info.duration);
  const audioDuration = Number(audio[0]?.duration ?? (expected.audio ? 0 : info.duration));
  const compatibleProfiles = ['High', 'Main', 'Baseline', 'Constrained Baseline', 'Progressive High'];
  const isProfileValid = Boolean(video[0]?.profile && compatibleProfiles.includes(video[0].profile));
  const isContainerValid = await checkContainer(path, info.format.format_name ?? '', info.format.tags, expected.container ?? 'mp4');

  const checks = {
    single_h264_video: video.length === 1 && video[0]?.codec_name === 'h264',
    dimensions: video[0]?.width === expected.width && video[0]?.height === expected.height,
    fps: Math.abs(fps - expected.fps) < 0.001,
    duration: Math.abs(info.duration - expected.duration_seconds) <= 1 / expected.fps + 0.03 && Math.abs(videoDuration - expected.duration_seconds) <= 1 / expected.fps + 0.03,
    container: isContainerValid,
    pixel_format: video[0]?.pix_fmt === 'yuv420p',
    h264_profile: isProfileValid,
    audio: expected.audio ? audio.length === 1 && audio[0]?.codec_name === 'aac' : audio.length === 0,
    audio_channels: expected.audio ? audio[0]?.channels === (expected.channels ?? 2) : true,
    audio_sample_rate: expected.audio ? Number(audio[0]?.sample_rate) === (expected.sample_rate ?? 48000) : true,
    audio_duration: expected.audio ? Number.isFinite(audioDuration) && Math.abs(audioDuration - expected.duration_seconds) <= 1 / expected.fps + 0.05 : true,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length > 0) {
    throw new StudioError('TECHNICAL_QA_FAILED', `Media does not match the expected output profile: ${failed.join(', ')}`, {failed_checks: failed});
  }
  await runTool('ffmpeg', ['-v', 'error', '-xerror', '-nostdin', '-threads', '1', '-i', path, '-threads', '1', '-f', 'null', '-'], timeout - (Date.now() - started));
  return {schema_version: '1.0', technical_validation: 'passed', creative_acceptance: 'not_reviewed', checks: {...checks, full_decode: true}, duration_seconds: info.duration, streams: info.streams};
}
