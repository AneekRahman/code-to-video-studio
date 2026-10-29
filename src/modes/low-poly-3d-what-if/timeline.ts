import type {Escalation} from './escalation.ts';
import {clamp01} from './world/core.ts';
import type {HudState} from './world/hud.ts';
import type {ShotSpec, TimelineState} from './world/stage.ts';

const scaleNames = ['million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion'];

/** Three significant figures with the short-scale word, as the references print their counters. */
export function formatBig(value: number): string {
  if (value < 1e6) return Number.isInteger(value) ? value.toLocaleString('en-US') : String(Number(value.toPrecision(3)));
  const group = Math.min(scaleNames.length + 1, Math.floor(Math.log10(value) / 3));
  const scaled = value / 10 ** (group * 3);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${scaled.toFixed(digits)} ${scaleNames[group - 2] ?? 'million'}`;
}

export function counterValue(escalation: Escalation, rung: number): number {
  const c = escalation.counter;
  const set = escalation.rungs[rung - 1]?.value;
  if (set !== undefined) return set;
  return c.kind === 'arithmetic' ? c.start + c.step * (rung - 1) : c.start * c.ratio ** (rung - 1);
}

/** The number on screen `sinceTick` seconds into `rung`; an arithmetic counter rolls from the last rung's number. */
export function rungText(escalation: Escalation, rung: number, sinceTick = Infinity): string {
  const spec = escalation.rungs[rung - 1];
  if (spec?.value_text) return spec.value_text;
  const c = escalation.counter;
  let amount = counterValue(escalation, rung);
  if (c.kind === 'arithmetic' && c.roll_seconds > 0 && rung > 1 && sinceTick < c.roll_seconds) {
    const from = counterValue(escalation, rung - 1);
    amount = Math.round(from + (amount - from) * (1 - (1 - sinceTick / c.roll_seconds) ** 3));
  }
  return `${c.kind === 'arithmetic' ? amount.toLocaleString('en-US') : formatBig(amount)} ${c.unit}`;
}

const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The exact value of a geometric counter at `rung`, as an integer string with thousands separators. */
export function exactTally(escalation: Escalation, rung: number): string | null {
  const c = escalation.counter;
  if (c.kind !== 'geometric' || !Number.isInteger(c.start) || !Number.isInteger(c.ratio)) return null;
  return grouped((BigInt(c.start) * BigInt(c.ratio) ** BigInt(rung - 1)).toString());
}

/** The closing figure on one or two lines, split at the separator nearest the middle. */
export function tallyLines(escalation: Escalation): string[] {
  const exact = exactTally(escalation, escalation.counter.rungs);
  const unit = escalation.counter.unit;
  if (!exact) return [rungText(escalation, escalation.counter.rungs)];
  const parts = exact.split(',');
  if (parts.length < 4) return [`${exact} ${unit}`];
  const cut = Math.ceil(parts.length / 2);
  return [`${parts.slice(0, cut).join(',')},`, `${parts.slice(cut).join(',')} ${unit}`];
}

export const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function rungStart(escalation: Escalation, rung: number): number {
  return escalation.counter.first_at_seconds + (rung - 1) * escalation.counter.period_seconds;
}

export function shotsOf(escalation: Escalation): ShotSpec[] {
  return escalation.shots.map((shot, i) => ({world: shot.world, variant: shot.variant, start: shot.from_seconds, end: shot.to_seconds, seed: shot.seed ?? 1000 + i * 17 + shot.world.length * 31, offset: shot.offset_seconds ?? 0, camera: shot.camera}));
}

/** The caption on screen during `rung`: the nearest earlier (or this) rung whose caption still has rungs left. */
export function activeCaption(escalation: Escalation, rung: number): {text: string; from: number; to: number} | null {
  for (let j = rung; j >= 1 && j > rung - 8; j--) {
    const spec = escalation.rungs[j - 1];
    const span = spec?.caption_rungs ?? 1;
    if (spec?.caption && rung - j < span) return {text: spec.caption, from: rungStart(escalation, j), to: j + span > escalation.counter.rungs ? escalation.duration_seconds : rungStart(escalation, j + span)};
  }
  return null;
}

const fade = (time: number, from: number, to: number, ramp = 0.22) => clamp01(Math.min((time - from) / ramp, (to - time) / ramp));

export type FrameState = {timeline: TimelineState; hud: HudState};

/** Everything a frame shows, as a pure function of the job and the time. */
export function frameAt(escalation: Escalation, time: number): FrameState {
  const c = escalation.counter;
  const total = c.rungs;
  const elapsed = time - c.first_at_seconds;
  const rung = elapsed < 0 ? 0 : Math.min(total, Math.floor(elapsed / c.period_seconds) + 1);
  const sinceTick = rung === 0 ? Math.max(0, time) : elapsed - (rung - 1) * c.period_seconds;
  const level = rung <= 1 ? 0 : (rung - 1) / (total - 1);
  const timeline: TimelineState = {time, level, rung: Math.max(1, rung), sinceTick: Math.min(sinceTick, 60), period: c.period_seconds};

  const ending = escalation.ending;
  const finalAt = ending?.final ? ending.from_seconds : Infinity;
  const showFinal = time >= finalAt;
  const spec = rung > 0 ? escalation.rungs[rung - 1] : undefined;
  const caption = rung > 0 ? activeCaption(escalation, rung) : null;
  const captionAlpha = caption ? fade(time, caption.from + 0.12, Math.min(caption.to, finalAt) - 0.06) : 0;

  const hud: HudState = {
    kicker: rung > 0 ? escalation.hud.kicker.replace('{n}', String(rung)) : '',
    value: rung > 0 ? rungText(escalation, rung, sinceTick) : '',
    valueColor: escalation.hud.value_color,
    unit: spec?.comparison ?? '',
    pill: escalation.hud.pill,
    hudAlpha: rung > 0 && !showFinal ? 1 : 0,
    flash: 0,
    cover: time < escalation.title.black_until_seconds ? 1 : 0,
  };
  if (rung > 0 && spec?.detail) hud.aux = {text: spec.detail, kind: 'detail'};
  if (rung > 0 && escalation.hud.clock) hud.aux = {text: spec?.clock_text ?? clockText((rung - 1) * c.period_seconds), kind: 'clock'};
  if (time < escalation.title.to_seconds) hud.title = {lines: escalation.title.lines, alpha: fade(time, -1, escalation.title.to_seconds, 0.3)};
  if (caption && captionAlpha > 0 && !showFinal) hud.caption = {text: caption.text, alpha: captionAlpha};
  if (showFinal && ending?.final) hud.final = {kicker: ending.final.kicker, lines: tallyLines(escalation), line: ending.final.line, alpha: fade(time, finalAt, escalation.duration_seconds + 1, 0.5)};
  const news = escalation.news.find(n => time >= n.from_seconds && time < n.to_seconds);
  if (news) hud.news = {headline: news.headline, ticker: news.ticker, channel: news.channel, tag: news.tag, alpha: fade(time, news.from_seconds, news.to_seconds, 0.2)};
  return {timeline, hud};
}
