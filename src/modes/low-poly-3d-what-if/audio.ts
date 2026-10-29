import {resolve} from 'node:path';
import {z} from 'zod';
import {requireCondition} from '../../errors.ts';
import {runToolCapture} from '../../process.ts';
import {AudioPlanSchema, type AudioPlan, type Escalation} from './escalation.ts';
import {rungStart} from './timeline.ts';

export const loudnessTarget = {integrated: -14, truePeak: -1, range: 11};
/** AAC encoding overshoots the PCM master's true peak by about 0.7 dB at 192 kb/s. */
const truePeakHeadroom = 0.9;
const sampleRate = 48000;
const format = `aresample=${sampleRate},aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo`;
const fixed = (value: number, digits = 3) => value.toFixed(digits);

/** The shout's level under the master for `rung`: a rising curve from the first to the last, steeper early so the first doublings are audible. */
export function shoutDb(plan: AudioPlan, rung: number, rungs: number): number {
  const u = rungs <= 1 ? 1 : (rung - 1) / (rungs - 1);
  return plan.first_shout_db + (plan.last_shout_db - plan.first_shout_db) * u ** 0.85;
}

export type AudioCue = {rung: number; at: number; shout: boolean; shout_db: number; bass_db: number};

export function planAudio(escalation: Escalation, plan: AudioPlan): {cues: AudioCue[]; silence: [number, number] | null; duration: number} {
  requireCondition(plan.what_if_id === escalation.what_if_id, 'INVALID_CONTRACT', 'The audio plan targets a different what-if');
  const total = escalation.counter.rungs;
  const muted = new Set(plan.mute_rungs);
  const silenceFrom = escalation.ending?.silence_from_seconds;
  const cues = Array.from({length: total}, (_, i): AudioCue => {
    const rung = i + 1;
    const level = total <= 1 ? 1 : i / (total - 1);
    return {rung, at: rungStart(escalation, rung), shout: !muted.has(rung), shout_db: shoutDb(plan, rung, total), bass_db: plan.bass_db - (1 - level) * 20};
  }).filter(cue => silenceFrom === undefined || cue.at < silenceFrom);
  return {cues, silence: silenceFrom === undefined ? null : [silenceFrom, escalation.duration_seconds], duration: escalation.duration_seconds};
}

/** A voiced "ahh" from stacked harmonics through two formants: a stand-in for the shout a voice provider supplies. */
function shoutSource(stretch: number): string {
  const length = 0.55 + stretch * 0.3;
  const harmonics = Array.from({length: 9}, (_, k) => `sin(2*PI*${k + 1}*(165*t-34*t*t))/${k + 1}`).join('+');
  return `aevalsrc=exprs='(${harmonics})*min(t/0.025\\,1)*exp(-${fixed(3.2 / (1 + stretch), 3)}*max(t-0.18\\,0))*0.35':d=${fixed(length)}:s=${sampleRate},equalizer=f=720:t=q:w=3:g=11,equalizer=f=1150:t=q:w=4:g=7,equalizer=f=2600:t=q:w=3:g=4,highpass=f=90,${format}`;
}

const bassSource = `aevalsrc=exprs='sin(2*PI*(46+52*exp(-14*t))*t)*exp(-4.2*t)*0.9':d=0.9:s=${sampleRate},${format}`;

/** `concat` with real silence places a clip exactly; `adelay` leaves a timestamp gap that `amix` collapses. */
const placed = (source: string, at: number, label: string, tag: string) =>
  `aevalsrc=exprs=0:d=${fixed(Math.max(0.001, at))}:s=${sampleRate},${format}[z${tag}];${source}[c${tag}];[z${tag}][c${tag}]concat=n=2:v=0:a=1[${label}]`;

export function mixFilter(cues: AudioCue[], duration: number, silence: [number, number] | null, hasShoutFile: boolean, stretch: number, bed: [number, number] = [-90, -90]): {filter: string} {
  const shouts = cues.filter(cue => cue.shout);
  const filters: string[] = [];
  const bus: string[] = [];
  if (hasShoutFile && shouts.length > 0) {
    const file = `[0:a]silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01,${format},loudnorm=I=-20:TP=-3:LRA=7`;
    filters.push(shouts.length > 1 ? `${file},asplit=${shouts.length}${shouts.map((_, i) => `[f${i}]`).join('')}` : `${file}[f0]`);
  }
  shouts.forEach((cue, i) => {
    const source = hasShoutFile ? `[f${i}]volume=${fixed(cue.shout_db, 2)}dB` : `${shoutSource(stretch)},volume=${fixed(cue.shout_db, 2)}dB`;
    filters.push(placed(source, cue.at + 0.04, `v${i}`, `s${i}`));
    bus.push(`[v${i}]`);
  });
  cues.forEach((cue, i) => {
    filters.push(placed(`${bassSource},volume=${fixed(cue.bass_db, 2)}dB`, cue.at, `h${i}`, `b${i}`));
    bus.push(`[h${i}]`);
  });
  if (bed[1] > -60 || bed[0] > -60) {
    filters.push(`anoisesrc=d=${fixed(duration)}:c=brown:a=0.8:r=${sampleRate},lowpass=f=420,${format},volume=volume='pow(10\\,(${fixed(bed[0], 2)}+(${fixed(bed[1] - bed[0], 2)})*t/${fixed(duration)})/20)':eval=frame[bed]`);
    bus.push('[bed]');
  }
  const mute = silence ? `,volume=volume=if(gte(t\\,${fixed(silence[0])})\\,0\\,1):eval=frame` : '';
  filters.push(`${bus.join('')}amix=inputs=${bus.length}:normalize=0:duration=longest,atrim=0:${fixed(duration)},apad=whole_dur=${fixed(duration)}${mute},acompressor=threshold=0.1:ratio=4:attack=3:release=160:makeup=3,alimiter=limit=0.9:attack=2:release=60:level=false[mix]`);
  return {filter: filters.join(';')};
}

const LoudnessSchema = z.object({input_i: z.string(), input_tp: z.string(), input_lra: z.string(), input_thresh: z.string(), target_offset: z.string()});

async function measure(file: string) {
  const {stderr} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', `loudnorm=I=${loudnessTarget.integrated}:TP=${loudnessTarget.truePeak}:LRA=${loudnessTarget.range}:print_format=json`, '-f', 'null', '-'], 300_000);
  return LoudnessSchema.parse(JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1)));
}

/** Mixes the ladder's shouts and bass hits, mutes the declared silence, and masters to the loudness target with one linear gain. */
export async function mixWhatIf(escalation: Escalation, plan: AudioPlan, shoutFile: string | undefined, out: string) {
  AudioPlanSchema.parse(plan);
  const {cues, silence, duration} = planAudio(escalation, plan);
  const {filter} = mixFilter(cues, duration, silence, Boolean(shoutFile), plan.shout_stretch, [plan.bed_start_db, plan.bed_end_db]);
  const premaster = resolve(out, 'premaster.wav');
  const inputs = shoutFile ? ['-i', shoutFile] : [];
  await runToolCapture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...inputs, '-filter_complex', filter, '-map', '[mix]', '-c:a', 'pcm_s24le', '-ar', String(sampleRate), premaster], 600_000);
  const first = await measure(premaster);
  const master = resolve(out, 'master.wav');
  const ceiling = 10 ** ((loudnessTarget.truePeak - truePeakHeadroom) / 20);
  const apply = (gain: number) => runToolCapture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', premaster, '-af', `volume=${fixed(gain, 2)}dB,alimiter=limit=${ceiling.toFixed(4)}:attack=1.5:release=50:level=false`, '-c:a', 'pcm_s24le', '-ar', String(sampleRate), master], 600_000);
  let gain = loudnessTarget.integrated - Number(first.input_i);
  let final = first;
  for (let pass = 0; pass < 4; pass++) {
    await apply(gain);
    final = await measure(master);
    const missing = loudnessTarget.integrated - Number(final.input_i);
    if (Math.abs(missing) <= 0.25) break;
    gain += missing;
  }
  return {master: 'master.wav', silence, cues: cues.length, loudness: {integrated_lufs: Number(final.input_i), true_peak_dbtp: Number(final.input_tp), range_lu: Number(final.input_lra)}};
}

export async function muxWhatIf(video: string, master: string, durationSeconds: number, output: string) {
  await runToolCapture('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', video, '-i', master, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', fixed(durationSeconds), '-movflags', '+faststart', output], 600_000);
}
