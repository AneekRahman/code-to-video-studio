import {resolve} from 'node:path';
import {z} from 'zod';
import {requireCondition} from '../../errors.ts';
import {runToolCapture} from '../../process.ts';
import type {MixPlan, Sound, VoiceProcess} from './sound.ts';

const format = 'aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
const pitch = 0.94;

const voiceChains: Record<z.infer<typeof VoiceProcess>, string> = {
  'close-mic': 'highpass=f=80,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=2',
  broadcast: 'highpass=f=320,lowpass=f=3400,acompressor=threshold=0.08:ratio=6:attack=2:release=80:makeup=3,asoftclip=type=tanh:threshold=0.7,aecho=0.85:0.5:22:0.22',
  'through-door': `aresample=44100,asetrate=${44100 * pitch},aresample=44100,atempo=${(1 / pitch).toFixed(4)},highpass=f=160,lowpass=f=1900,aecho=0.8:0.75:40|85:0.35|0.2`,
};

const seconds = (value: number) => value.toFixed(3);

function muteDuring(spans: [number, number][]): string {
  if (spans.length === 0) return '';
  const inside = spans.map(([from, until]) => `between(t\\,${seconds(from)}\\,${seconds(until)})`).join('+');
  return `,volume=volume=if(${inside}\\,0\\,1):eval=frame`;
}

export type MixInputs = {
  voiceFiles: Record<string, string>;
  voiceLevelling?: Record<string, number>;
  effectFiles: Record<string, string>;
  effectDurations: Record<string, number>;
  musicFile: string;
};

export function mixGraph(plan: MixPlan, sound: Sound, inputs: MixInputs): {files: string[]; filter: string} {
  const files: string[] = [];
  const filters: string[] = [];
  const bus: string[] = [];
  const speech: string[] = [];

  plan.voices.forEach((voice, i) => {
    const file = inputs.voiceFiles[voice.segment_id];
    requireCondition(file, 'MISSING_AUDIO', `No narration clip for segment ${voice.segment_id}`);
    const cast = sound.cast[voice.voice];
    files.push(file);
    const levelling = inputs.voiceLevelling?.[voice.segment_id] ?? 0;
    filters.push(`[${files.length - 1}:a]${voiceChains[cast.process]},volume=${(cast.gain_db + levelling).toFixed(2)}dB,${format},adelay=${Math.round(voice.start * 1000)}:all=1[v${i}]`);
    speech.push(`[v${i}]`);
  });

  const uses = new Map<string, number>();
  for (const cue of plan.cues) uses.set(cue.effect_id, (uses.get(cue.effect_id) ?? 0) + 1);
  const taps = new Map<string, string[]>();
  for (const [effectId, count] of uses) {
    const file = inputs.effectFiles[effectId];
    requireCondition(file, 'MISSING_AUDIO', `No clip for effect ${effectId}`);
    files.push(file);
    const labels = Array.from({length: count}, (_, k) => `[e_${effectId.replace(/-/g, '_')}_${k}]`);
    const oneShot = !sound.effects.find(e => e.effect_id === effectId)?.loop;
    const onTransient = oneShot ? 'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.005,' : '';
    filters.push(`[${files.length - 1}:a]${onTransient}${format},asplit=${count}${labels.join('')}`);
    taps.set(effectId, labels);
  }
  plan.cues.forEach((cue, i) => {
    const source = taps.get(cue.effect_id)!.shift()!;
    const effect = sound.effects.find(e => e.effect_id === cue.effect_id);
    const file = inputs.effectDurations[cue.effect_id]!;
    const clip = effect && !effect.loop ? Math.min(file, effect.duration_seconds) : file;
    const length = Math.min(cue.end === null ? clip : cue.end - cue.start, plan.duration_seconds - cue.start);
    const loop = cue.end !== null && cue.end - cue.start > clip ? 'aloop=loop=-1:size=2147483647,' : '';
    const fadeIn = cue.fade_in_seconds > 0 ? `,afade=t=in:st=0:d=${seconds(cue.fade_in_seconds)}` : '';
    const fadeOut = Math.min(Math.max(cue.fade_out_seconds, clip < file ? 0.05 : 0), length);
    filters.push(`${source}${loop}atrim=0:${seconds(length)},asetpts=PTS-STARTPTS${fadeIn},afade=t=out:st=${seconds(length - fadeOut)}:d=${seconds(fadeOut)},volume=${cue.gain_db}dB,adelay=${Math.round(cue.start * 1000)}:all=1[c${i}]`);
    bus.push(`[c${i}]`);
  });

  const duration = plan.duration_seconds;
  files.push(inputs.musicFile);
  const silence = muteDuring(plan.music_silences);
  filters.push(`[${files.length - 1}:a]${format},aloop=loop=-1:size=2147483647,atrim=0:${seconds(duration)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${seconds(sound.music.fade_in_seconds)},afade=t=out:st=${seconds(duration - sound.music.fade_out_seconds)}:d=${seconds(sound.music.fade_out_seconds)},volume=${sound.music.gain_db}dB${silence}[music]`);
  filters.push(`${speech.join('')}amix=inputs=${speech.length}:normalize=0:duration=longest,asplit=2[speech][key]`);
  filters.push('[music][key]sidechaincompress=threshold=0.03:ratio=4:attack=15:release=400[ducked]');
  const all = ['[speech]', ...bus, '[ducked]'];
  filters.push(`${all.join('')}amix=inputs=${all.length}:normalize=0:duration=longest,atrim=0:${seconds(duration)},apad=whole_dur=${seconds(duration)}${muteDuring(plan.silences)},alimiter=limit=0.95:level=false[mix]`);
  return {files, filter: filters.join(';')};
}

export const loudnessTarget = {integrated: -14, truePeak: -1, range: 11};
/** AAC encoding overshoots the PCM master's true peak; observed +0.74 dB at 192 kb/s with ffmpeg's native encoder. */
const truePeakHeadroom = 1.5;
const dialogueLufs = -16;

const LoudnessSchema = z.object({input_i: z.string(), input_tp: z.string(), input_lra: z.string(), input_thresh: z.string(), target_offset: z.string()});

async function measure(file: string, chain = '') {
  const {stderr} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', `${chain}loudnorm=I=${loudnessTarget.integrated}:TP=${loudnessTarget.truePeak}:LRA=${loudnessTarget.range}:print_format=json`, '-f', 'null', '-'], 300_000);
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  return LoudnessSchema.parse(JSON.parse(json));
}

/** Gain that brings each processed narration clip to the same dialogue loudness, so cast gains are relative. */
async function levelVoices(plan: MixPlan, sound: Sound, voiceFiles: Record<string, string>): Promise<Record<string, number>> {
  const levelling: Record<string, number> = {};
  for (const voice of plan.voices) {
    const measured = Number((await measure(voiceFiles[voice.segment_id]!, `${voiceChains[sound.cast[voice.voice].process]},`)).input_i);
    levelling[voice.segment_id] = Number.isFinite(measured) ? Math.max(-12, Math.min(18, dialogueLufs - measured)) : 0;
  }
  return levelling;
}

export async function mixStory(plan: MixPlan, sound: Sound, inputs: MixInputs, out: string) {
  const voiceLevelling = await levelVoices(plan, sound, inputs.voiceFiles);
  const {files, filter} = mixGraph(plan, sound, {...inputs, voiceLevelling});
  const premaster = resolve(out, 'premaster.wav');
  await runToolCapture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...files.flatMap(f => ['-i', f]), '-filter_complex', filter, '-map', '[mix]', '-c:a', 'pcm_s24le', '-ar', '48000', premaster], 600_000);
  const first = await measure(premaster);
  const master = resolve(out, 'master.wav');
  const t = loudnessTarget;
  await runToolCapture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', premaster, '-af', `loudnorm=I=${t.integrated}:TP=${t.truePeak - truePeakHeadroom}:LRA=${t.range}:measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}:offset=${first.target_offset}:linear=true,${format}`, '-c:a', 'pcm_s24le', '-ar', '48000', master], 600_000);
  const final = await measure(master);
  return {master: 'master.wav', voice_levelling_db: voiceLevelling, loudness: {integrated_lufs: Number(final.input_i), true_peak_dbtp: Number(final.input_tp), range_lu: Number(final.input_lra)}};
}

export async function muxStory(video: string, master: string, durationSeconds: number, output: string) {
  await runToolCapture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', video, '-i', master, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', seconds(durationSeconds), '-movflags', '+faststart', output], 600_000);
}
