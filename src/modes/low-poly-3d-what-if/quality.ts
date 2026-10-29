import {stat} from 'node:fs/promises';
import {runToolCapture} from '../../process.ts';
import {REVIEW_MAX_BYTES} from '../../review-size.ts';
import {loudnessTarget} from './audio.ts';
import {durationRange, type Escalation} from './escalation.ts';
import {activeCaption, rungStart} from './timeline.ts';

export type QualityCheck = {check_id: string; pass: boolean; detail: string};

const hookSeconds = 1.5;
const wordsPerSecond = 7;
const readingLeadSeconds = 0.25;
const captionFadeSeconds = 0.18;
/** The last sound before a declared silence may fade out up to this long before the mute begins. */
const decaySeconds = 1.5;
export const periodRange = [0.8, 3.2] as const;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Checks on the job itself: they hold before anything is rendered. */
export function whatIfRubric(e: Escalation): QualityCheck[] {
  const checks: QualityCheck[] = [
    {check_id: 'hook_within_1_5s', pass: e.title.black_until_seconds <= hookSeconds, detail: `the title is readable from ${e.title.black_until_seconds.toFixed(2)} s`},
    {check_id: 'counter_starts_early', pass: e.counter.first_at_seconds <= 4, detail: `the first rung starts at ${e.counter.first_at_seconds.toFixed(2)} s`},
    {check_id: 'rung_cadence', pass: e.counter.period_seconds >= periodRange[0] && e.counter.period_seconds <= periodRange[1], detail: `${e.counter.period_seconds.toFixed(2)} s per rung, allowed ${periodRange[0]} to ${periodRange[1]} s`},
    {check_id: 'duration_range', pass: e.duration_seconds >= durationRange[0] && e.duration_seconds <= durationRange[1], detail: `${e.duration_seconds.toFixed(1)} s, allowed ${durationRange[0]} to ${durationRange[1]} s`},
  ];
  const slow: string[] = [];
  const seen = new Set<string>();
  for (let rung = 1; rung <= e.counter.rungs; rung++) {
    const caption = activeCaption(e, rung);
    if (!caption || seen.has(`${caption.from}`)) continue;
    seen.add(`${caption.from}`);
    const visible = caption.to - caption.from - captionFadeSeconds;
    const needed = wordCount(caption.text) / wordsPerSecond + readingLeadSeconds;
    if (visible < needed) slow.push(`rung ${rung} (${visible.toFixed(2)} s for ${needed.toFixed(2)} s)`);
  }
  checks.push({check_id: 'caption_reading_time', pass: slow.length === 0, detail: slow.length ? `too short on ${slow.join(', ')}` : `every caption stays up for its words at ${wordsPerSecond} words per second`});
  const last = rungStart(e, e.counter.rungs);
  checks.push({check_id: 'ladder_inside_video', pass: last < e.duration_seconds, detail: `the last rung starts at ${last.toFixed(2)} s of ${e.duration_seconds.toFixed(1)} s`});
  return checks;
}

type Window = [number, number];

function intervals(log: string, startKey: string, endKey: string): Window[] {
  const starts = [...log.matchAll(new RegExp(`${startKey}:\\s*(-?[\\d.]+)`, 'g'))].map(m => Number(m[1]));
  const ends = [...log.matchAll(new RegExp(`${endKey}:\\s*(-?[\\d.]+)`, 'g'))].map(m => Number(m[1]));
  return starts.map((start, i) => [start, ends[i] ?? Infinity]);
}

const outside = (found: Window[], allowed: Window[], slack: number) => found.filter(([a, b]) => !allowed.some(([x, y]) => a >= x - slack && b <= y + slack));
const describe = (spans: Window[]) => spans.map(([a, b]) => `${a.toFixed(2)}-${Number.isFinite(b) ? b.toFixed(2) : 'end'} s`).join(', ');

/** Measured checks on the finished export: size, loudness, declared silence only, and no frozen picture. */
export async function measureExport(video: string, e: Escalation, timeoutMs = 600_000): Promise<QualityCheck[]> {
  const silence: Window[] = e.ending?.silence_from_seconds === undefined ? [] : [[e.ending.silence_from_seconds - decaySeconds, e.duration_seconds + 1]];
  const stillAllowed: Window[] = [[0, e.title.black_until_seconds + 0.3], ...(e.ending?.final ? [[e.ending.from_seconds, e.duration_seconds + 1] as Window] : [])];
  const {stderr: sound} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-af', `silencedetect=n=-55dB:d=0.8,loudnorm=I=${loudnessTarget.integrated}:TP=${loudnessTarget.truePeak}:LRA=${loudnessTarget.range}:print_format=json`, '-vn', '-f', 'null', '-'], timeoutMs);
  const unexpectedSilence = outside(intervals(sound, 'silence_start', 'silence_end'), silence, 0.15);
  const loudness = JSON.parse(sound.slice(sound.lastIndexOf('{'), sound.lastIndexOf('}') + 1)) as {input_i: string; input_tp: string};
  const integrated = Number(loudness.input_i);
  const truePeak = Number(loudness.input_tp);
  const silenceOk = silence.length === 0 || intervals(sound, 'silence_start', 'silence_end').some(([a]) => a <= silence[0]![0] + decaySeconds + 0.4);
  const {stderr: picture} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-vf', 'freezedetect=n=-58dB:d=1.2', '-an', '-f', 'null', '-'], timeoutMs);
  const frozen = outside(intervals(picture, 'freeze_start', 'freeze_end'), stillAllowed, 0.3);
  const bytes = (await stat(video)).size;
  return [
    {check_id: 'within_review_size', pass: bytes <= REVIEW_MAX_BYTES, detail: `${(bytes / 1048576).toFixed(1)} MiB, review limit ${REVIEW_MAX_BYTES / 1048576} MiB`},
    {check_id: 'integrated_loudness', pass: Math.abs(integrated - loudnessTarget.integrated) <= 1, detail: `${integrated.toFixed(2)} LUFS, target ${loudnessTarget.integrated} ± 1`},
    {check_id: 'true_peak', pass: truePeak <= loudnessTarget.truePeak, detail: `${truePeak.toFixed(2)} dBTP, ceiling ${loudnessTarget.truePeak}`},
    {check_id: 'no_unexpected_silence', pass: unexpectedSilence.length === 0, detail: unexpectedSilence.length ? describe(unexpectedSilence) : 'silence only inside the declared ending'},
    {check_id: 'declared_silence_present', pass: silenceOk, detail: silence.length ? `the sound drops to silence from ${silence[0]![0].toFixed(2)} s` : 'no silence declared'},
    {check_id: 'no_frozen_picture', pass: frozen.length === 0, detail: frozen.length ? describe(frozen) : 'the picture moves except under the title cover and the final card'},
  ];
}
