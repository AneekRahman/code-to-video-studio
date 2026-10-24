import {resolve} from 'node:path';
import type {LoadedJob} from './load.ts';
import {runTool} from './process.ts';

export function mixFilter(loaded: Pick<LoadedJob, 'mix' | 'job'>): string {
  const duration = loaded.job.format.duration_seconds;
  const filters = [`[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${loaded.mix.narration_gain_db}dB,apad=whole_dur=${duration}[narration]`];
  loaded.mix.tracks.forEach((track, index) => {
    filters.push(`[${index + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${track.duration_seconds},asetpts=PTS-STARTPTS,volume=${track.gain_db}dB,afade=t=in:st=0:d=${track.fade_in_seconds},afade=t=out:st=${track.duration_seconds - track.fade_out_seconds}:d=${track.fade_out_seconds},adelay=${Math.round(track.start_seconds * 1000)}:all=1[track${index}]`);
  });
  const labels = ['[narration]', ...loaded.mix.tracks.map((_, i) => `[track${i}]`)].join('');
  filters.push(`${labels}amix=inputs=${loaded.mix.tracks.length + 1}:duration=longest:normalize=0,atrim=0:${duration}[mixed]`);
  return filters.join(';');
}
export async function finishAudio(loaded: LoadedJob, visual: string, outputDir: string, deadline: number): Promise<string> {
  const output = resolve(outputDir, 'final.mp4');
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', visual, '-i', loaded.paths.narration];
  for (const track of loaded.mix.tracks) args.push('-i', loaded.assetPaths[track.asset_id]!);
  args.push('-filter_complex', mixFilter(loaded), '-map', '0:v:0', '-map', '[mixed]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(loaded.job.format.duration_seconds), '-movflags', '+faststart', '-threads', '1', output);
  await runTool('ffmpeg', args, deadline - Date.now());
  return 'final.mp4';
}
