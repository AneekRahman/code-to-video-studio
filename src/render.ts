import {execFile} from 'node:child_process';
import {stat, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const studioRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Pegasus review accepts at most 16 MiB; aim under it with headroom for the container. */
export const DEFAULT_SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
const AUDIO_KBPS = 160;
const TARGET_LUFS = -14;

export function videoKbpsFor(durationSeconds: number, limitBytes: number): number {
  const totalKbps = (limitBytes * 8) / 1000 / durationSeconds;
  return Math.max(800, Math.floor(totalKbps * 0.94 - AUDIO_KBPS));
}

export async function renderComposition(project: string, output: string, durationSeconds: number, fps: number, limitBytes = DEFAULT_SIZE_LIMIT_BYTES) {
  const silent = join(project, 'hyperframes.mp4');
  const env = {...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1'};
  const kbps = videoKbpsFor(durationSeconds, limitBytes);
  await run(join(studioRoot, 'node_modules/.bin/hyperframes'), ['render', project, '-o', silent, '--fps', String(fps), '--video-bitrate', `${kbps}k`, '--quiet'], {env, maxBuffer: 64 * 1024 * 1024});

  const first = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', silent, '-af', `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=11:print_format=json`, '-f', 'null', '-'], {maxBuffer: 16 * 1024 * 1024});
  const measured = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/s.exec(first.stderr)?.[0] ?? '{}') as Record<string, string>;
  const loudnorm = measured.input_i
    ? `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=11`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', `${loudnorm},aresample=48000`, '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '2', '-movflags', '+faststart', output]);
  return quality(output, durationSeconds, limitBytes);
}

export async function quality(file: string, expectedSeconds: number, limitBytes: number) {
  const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,pix_fmt,channels,sample_rate', '-of', 'json', file])).stdout) as {format: {duration: string; size: string}; streams: Array<Record<string, string | number>>};
  const video = probe.streams.find(s => s.codec_type === 'video');
  const audio = probe.streams.find(s => s.codec_type === 'audio');
  const ebur = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {maxBuffer: 64 * 1024 * 1024});
  const integrated = Number(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/.exec(ebur.stderr.slice(ebur.stderr.lastIndexOf('Summary')))?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(ebur.stderr.slice(ebur.stderr.lastIndexOf('Summary')))?.[1]);
  await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
  const size = (await stat(file)).size;
  const duration = Number(probe.format.duration);
  const checks = {
    h264_1080x1920: video?.codec_name === 'h264' && video.width === 1080 && video.height === 1920,
    fps_30: video?.avg_frame_rate === '30/1',
    yuv420p: video?.pix_fmt === 'yuv420p',
    stereo_aac_48k: audio?.codec_name === 'aac' && audio.channels === 2 && String(audio.sample_rate) === '48000',
    duration_matches: Math.abs(duration - expectedSeconds) < 0.1,
    duration_30_60s: duration >= 30 && duration <= 60,
    within_pegasus_size: size <= 16 * 1024 * 1024 && size <= limitBytes * 1.04,
    loudness_minus14: Math.abs(integrated - TARGET_LUFS) <= 1,
    true_peak_below_minus1: peak <= -1,
    full_decode: true,
  };
  const report = {schema_version: '1.0', all_checks_passed: Object.values(checks).every(Boolean), checks, duration_seconds: duration, size_bytes: size, integrated_lufs: integrated, true_peak_dbtp: peak};
  await writeFile(`${file}.qa.json`, JSON.stringify(report, null, 2));
  return report;
}
