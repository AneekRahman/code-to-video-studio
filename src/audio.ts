import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import type {Sound} from './contracts.ts';
import {resolveAnchor, type Timeline} from './timeline.ts';

const run = promisify(execFile);

export interface Clip {
  id: string;
  src: string;
  start: number;
  duration: number;
  mediaStart: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioAsset { file: string; duration: number }

// The Hyperframes runtime caps clip gain at +12 dB (3.98).
const gain = (db: number) => Math.min(3.98, 10 ** (db / 20));

// ffmpeg filter chains for the cast's voice treatments; loudnorm levels every line before the mix.
const VOICE_FILTERS: Record<string, string> = {
  'close-mic': 'highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-2:LRA=7',
  'broadcast': 'highpass=f=320,lowpass=f=3400,acompressor=threshold=-24dB:ratio=6:attack=2:release=60,acrusher=bits=10:mix=0.12,loudnorm=I=-17:TP=-2:LRA=5',
  'through-door': 'lowpass=f=950,highpass=f=90,aecho=0.8:0.6:38|71:0.35|0.22,loudnorm=I=-19:TP=-2:LRA=7',
};

export async function processVoice(input: string, output: string, treatment: string): Promise<void> {
  const filter = VOICE_FILTERS[treatment];
  if (!filter) throw new Error(`Unknown voice treatment ${treatment}`);
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', `${filter},aresample=48000`, '-ac', '2', '-c:a', 'pcm_s16le', output]);
}

/** Splits [start, end) minus silent ranges into the parts that may sound. */
function audible(start: number, end: number, silent: Array<[number, number]>): Array<[number, number]> {
  let parts: Array<[number, number]> = [[start, end]];
  for (const [from, until] of silent) {
    parts = parts.flatMap(([a, b]) => {
      if (until <= a || from >= b) return [[a, b] as [number, number]];
      const kept: Array<[number, number]> = [];
      if (from > a) kept.push([a, from]);
      if (until < b) kept.push([until, b]);
      return kept;
    });
  }
  return parts.filter(([a, b]) => b - a > 1 / 60);
}

/** Lays a file over [start, end), repeating it when the span outlasts the file; media position carries across parts. */
function spread(id: string, asset: AudioAsset, start: number, end: number, silent: Array<[number, number]>, volume: number, fadeIn: number, fadeOut: number): Clip[] {
  const clips: Clip[] = [];
  const parts = audible(start, end, silent);
  parts.forEach(([a, b], partIndex) => {
    let time = a;
    while (b - time > 1 / 60) {
      let mediaStart = (time - start) % asset.duration;
      if (asset.duration - mediaStart < 1 / 60) mediaStart = 0;
      const duration = Math.min(b - time, asset.duration - mediaStart);
      const first = partIndex === 0 && time === a;
      const last = partIndex === parts.length - 1 && time + duration >= b - 1e-6;
      clips.push({id: `${id}-${clips.length}`, src: asset.file, start: time, duration, mediaStart, volume, fadeIn: first ? fadeIn : 0.01, fadeOut: last ? fadeOut : 0.01});
      time += duration;
    }
  });
  return clips;
}

export function planAudio(timeline: Timeline, sound: Sound, voices: Map<string, AudioAsset>, effects: Map<string, AudioAsset>, music: AudioAsset): Clip[] {
  const end = timeline.duration;
  const globalSilence: Array<[number, number]> = sound.silences.map(range => [resolveAnchor(timeline, range.from), range.until ? resolveAnchor(timeline, range.until) : end]);
  const clips: Clip[] = [];

  for (const segment of timeline.segments) {
    const voice = voices.get(segment.segment_id);
    if (!voice) throw new Error(`No narration for ${segment.segment_id}`);
    const cast = sound.cast[segment.voice];
    clips.push(...spread(`voice-${segment.segment_id}`, voice, segment.start, Math.min(end, segment.start + voice.duration), globalSilence, gain(cast?.gain_db ?? 0), 0.005, 0.03));
  }

  sound.cues.forEach((cue, index) => {
    const asset = effects.get(cue.effect_id);
    if (!asset) throw new Error(`No effect ${cue.effect_id}`);
    const start = resolveAnchor(timeline, cue.at);
    const stop = cue.until ? resolveAnchor(timeline, cue.until) : Math.min(end, start + asset.duration);
    if (stop > start) clips.push(...spread(`cue${index}-${cue.effect_id}`, asset, start, stop, globalSilence, gain(cue.gain_db), cue.fade_in_seconds || 0.01, cue.fade_out_seconds || 0.05));
  });

  const knock = effects.get(sound.knock.effect_id);
  if (knock) {
    for (const shot of timeline.shots.filter(item => item.actors.some(actor => actor.gait === 'knock'))) {
      for (const at of knockTimes(shot.start, shot.end)) clips.push(...spread(`knock-${shot.shot_id}-${at.toFixed(2)}`, knock, at, Math.min(end, at + 0.9), globalSilence, gain(sound.knock.gain_db), 0.005, 0.25));
    }
  }

  const musicSilence = [...globalSilence, ...sound.music.silences.map(range => [resolveAnchor(timeline, range.from), range.until ? resolveAnchor(timeline, range.until) : end] as [number, number])];
  clips.push(...spread('music', music, 0, end, musicSilence, gain(sound.music.gain_db), sound.music.fade_in_seconds || 0.5, sound.music.fade_out_seconds || 0.3));
  return clips;
}

/** Knock rhythm for a knocking actor: the same beats the rig animates. */
export function knockTimes(start: number, end: number): number[] {
  const times: number[] = [];
  for (let at = start + 0.45; at < end - 0.3; at += 1.6) times.push(at);
  return times.slice(0, 3);
}

export async function mediaDuration(file: string): Promise<number> {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const value = Number(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Unreadable media ${file}`);
  return value;
}

export const audioPath = (dir: string, name: string) => join(dir, name);
