import {stat} from 'node:fs/promises';
import {runToolCapture} from '../../process.ts';
import {REVIEW_MAX_BYTES} from '../../review-size.ts';
import {loudnessTarget} from './mixdown.ts';
import type {MixPlan} from './sound.ts';
import {spokenWords, type Overlay, type TimedSegment} from './story.ts';
import type {CompiledShot} from './shots.ts';

export type QualityCheck = {check_id: string; pass: boolean; detail: string};

type CompiledStory = {fps: number; durationInFrames: number; shots: CompiledShot[]; segments: TimedSegment[]; overlays: Overlay[]};

const hookSeconds = 1.5;
const readingWordsPerSecond = 3;
const readingLeadSeconds = 0.5;
export const durationRange = [30, 60] as const;

export function storyRubric(story: CompiledStory): QualityCheck[] {
  const seconds = (frames: number) => frames / story.fps;
  const first = story.shots[0]!;
  const title = story.overlays.find(o => o.kind === 'title' && o.shot_id === first.shot_id);
  const firstWord = story.segments[0]?.words[0];
  const hookAt = Math.min(title && title.kind === 'title' ? seconds(first.durationInFrames * title.from) : Infinity, firstWord ? seconds(firstWord.startFrame) : Infinity);
  const checks: QualityCheck[] = [{check_id: 'hook_within_1_5s', pass: hookAt <= hookSeconds, detail: `first title or spoken word at ${hookAt.toFixed(2)} s`}];
  for (const rule of story.overlays.filter(o => o.kind === 'rule')) {
    const segment = story.segments.find(s => s.segment_id === rule.segment_id)!;
    const shot = story.shots.find(s => segment.startFrame >= s.startFrame && segment.startFrame < s.startFrame + s.durationInFrames)!;
    const visible = seconds(shot.startFrame + shot.durationInFrames - segment.startFrame);
    const needed = spokenWords(rule.text).length / readingWordsPerSecond + readingLeadSeconds;
    checks.push({check_id: `rule_${rule.number}_reading_time`, pass: visible >= needed, detail: `on screen ${visible.toFixed(2)} s, needs ${needed.toFixed(2)} s`});
  }
  const total = seconds(story.durationInFrames);
  checks.push({check_id: 'duration_30_60s', pass: total >= durationRange[0] && total <= durationRange[1], detail: `${total.toFixed(2)} s`});
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

/** Measured checks on the finished export; declared cuts to black and silences are allowed. */
export async function measureExport(video: string, story: CompiledStory, plan: MixPlan, timeoutMs = 600_000): Promise<QualityCheck[]> {
  const seconds = (frames: number) => frames / story.fps;
  const black: Window[] = story.overlays.flatMap(o => {
    if (o.kind !== 'cut-to-black') return [];
    const shot = story.shots.find(s => s.shot_id === o.shot_id)!;
    return [[seconds(shot.startFrame + shot.durationInFrames * o.from), seconds(story.durationInFrames)] as Window];
  });
  const {stderr: picture} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-vf', 'blackdetect=d=0.4:pix_th=0.06', '-an', '-f', 'null', '-'], timeoutMs);
  const unexpectedBlack = outside(intervals(picture, 'black_start', 'black_end'), black, 0.1);

  const {stderr: sound} = await runToolCapture('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-af', `silencedetect=n=-55dB:d=0.8,loudnorm=I=${loudnessTarget.integrated}:TP=${loudnessTarget.truePeak}:LRA=${loudnessTarget.range}:print_format=json`, '-vn', '-f', 'null', '-'], timeoutMs);
  const unexpectedSilence = outside(intervals(sound, 'silence_start', 'silence_end'), plan.silences, 0.1);
  const loudness = JSON.parse(sound.slice(sound.lastIndexOf('{'), sound.lastIndexOf('}') + 1)) as {input_i: string; input_tp: string};
  const integrated = Number(loudness.input_i);
  const truePeak = Number(loudness.input_tp);
  const bytes = (await stat(video)).size;
  return [
    {check_id: 'within_review_size', pass: bytes <= REVIEW_MAX_BYTES, detail: `${(bytes / 1048576).toFixed(1)} MiB, review limit ${REVIEW_MAX_BYTES / 1048576} MiB`},
    {check_id: 'integrated_loudness', pass: Math.abs(integrated - loudnessTarget.integrated) <= 1, detail: `${integrated.toFixed(2)} LUFS, target ${loudnessTarget.integrated} ± 1`},
    {check_id: 'true_peak', pass: truePeak <= loudnessTarget.truePeak, detail: `${truePeak.toFixed(2)} dBTP, ceiling ${loudnessTarget.truePeak}`},
    {check_id: 'no_unexpected_black', pass: unexpectedBlack.length === 0, detail: unexpectedBlack.length ? describe(unexpectedBlack) : 'black only inside declared cuts'},
    {check_id: 'no_unexpected_silence', pass: unexpectedSilence.length === 0, detail: unexpectedSilence.length ? describe(unexpectedSilence) : 'silence only inside declared silences'},
  ];
}
