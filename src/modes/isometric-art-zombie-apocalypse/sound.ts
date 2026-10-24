import {z} from 'zod';
import type {CharacterAlignment} from '../../audiogen/provider.ts';
import {modeId} from './style.ts';
import {knockContacts} from './motion.ts';
import {normalizeWord} from './reveal.ts';
import {Voice, spokenWords, type TimedSegment} from './story.ts';
import type {CompiledShot} from './shots.ts';

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const gain = z.number().min(-60).max(12);

export const VoiceProcess = z.enum(['close-mic', 'broadcast', 'through-door']);

const CastSchema = z.strictObject({
  voice_id: z.string().regex(/^[A-Za-z0-9]{8,64}$/),
  label: z.string().min(1).max(80),
  model: z.string().min(1).max(64),
  seed: z.number().int().min(0).max(4_294_967_295),
  settings: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  process: VoiceProcess,
  gain_db: gain.default(0),
});

const EffectSchema = z.strictObject({
  effect_id: id,
  prompt: z.string().min(1).max(450),
  duration_seconds: z.number().min(0.5).max(30),
  prompt_influence: z.number().min(0).max(1).default(0.5),
  loop: z.boolean().default(false),
});

/** A moment in the cut: a fraction of a shot, or the start or end of a segment or one of its spoken words. */
export const AnchorSchema = z.union([
  z.strictObject({shot_id: id, at: z.number().min(0).max(1).default(0), offset_seconds: z.number().min(-5).max(5).default(0)}),
  z.strictObject({segment_id: id, word: z.string().min(1).optional(), edge: z.enum(['start', 'end']).default('start'), offset_seconds: z.number().min(-5).max(5).default(0)}),
]);

const CueSchema = z.strictObject({
  effect_id: id,
  at: AnchorSchema,
  until: AnchorSchema.optional(),
  gain_db: gain.default(0),
  fade_in_seconds: z.number().min(0).max(10).default(0),
  fade_out_seconds: z.number().min(0).max(10).default(0.05),
});

export const SoundSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  mode: z.literal(modeId),
  story_id: id,
  cast: z.strictObject({narrator: CastSchema, broadcast: CastSchema, double: CastSchema}),
  effects: z.array(EffectSchema).max(40),
  music: z.strictObject({
    prompt: z.string().min(1).max(1000),
    duration_seconds: z.number().min(10).max(300),
    gain_db: gain.default(-14),
    fade_in_seconds: z.number().min(0).max(10).default(1.5),
    fade_out_seconds: z.number().min(0).max(10).default(0.5),
    silences: z.array(z.strictObject({from: AnchorSchema, until: AnchorSchema.optional()})).max(10).default([]),
  }),
  knock: z.strictObject({effect_id: id, gain_db: gain.default(0)}).optional(),
  silences: z.array(z.strictObject({from: AnchorSchema, until: AnchorSchema.optional()})).max(10).default([]),
  cues: z.array(CueSchema).max(80).default([]),
});

export type Sound = z.infer<typeof SoundSchema>;
export type Anchor = z.infer<typeof AnchorSchema>;

export function alignmentWords(text: string, alignment: CharacterAlignment): {text: string; start: number; end: number}[] {
  const words: {text: string; start: number; end: number}[] = [];
  let current: {chars: string[]; first: number; last: number} | null = null;
  const close = () => {
    if (current && /[\p{L}\p{N}]/u.test(current.chars.join(''))) words.push({text: current.chars.join(''), start: alignment.starts[current.first]!, end: alignment.ends[current.last]!});
    current = null;
  };
  alignment.characters.forEach((char, i) => {
    if (/\s/.test(char)) return close();
    if (current) {
      current.chars.push(char);
      current.last = i;
    } else {
      current = {chars: [char], first: i, last: i};
    }
  });
  close();
  const expected = spokenWords(text);
  if (words.length !== expected.length || words.some((w, i) => normalizeWord(w.text) !== normalizeWord(expected[i]!))) {
    throw new Error('Speech alignment does not match the script words');
  }
  return words.map((w, i) => ({...w, text: expected[i]!}));
}

type Timeline = {fps: number; shots: CompiledShot[]; segments: TimedSegment[]};

export function resolveAnchor(anchor: Anchor, timeline: Timeline): number {
  if ('shot_id' in anchor) {
    const shot = timeline.shots.find(s => s.shot_id === anchor.shot_id);
    if (!shot) throw new Error(`Sound anchor references unknown shot ${anchor.shot_id}`);
    return (shot.startFrame + shot.durationInFrames * anchor.at) / timeline.fps + anchor.offset_seconds;
  }
  const segment = timeline.segments.find(s => s.segment_id === anchor.segment_id);
  if (!segment) throw new Error(`Sound anchor references unknown segment ${anchor.segment_id}`);
  if (!anchor.word) return (anchor.edge === 'start' ? segment.start : segment.end) + anchor.offset_seconds;
  const word = segment.words.find(w => normalizeWord(w.text) === normalizeWord(anchor.word!));
  if (!word) throw new Error(`Segment ${anchor.segment_id} has no spoken word "${anchor.word}"`);
  return (anchor.edge === 'start' ? word.startFrame : word.endFrame) / timeline.fps + anchor.offset_seconds;
}

export type PlannedVoice = {segment_id: string; voice: z.infer<typeof Voice>; start: number};
export type PlannedCue = {effect_id: string; start: number; end: number | null; gain_db: number; fade_in_seconds: number; fade_out_seconds: number};
export type MixPlan = {duration_seconds: number; voices: PlannedVoice[]; cues: PlannedCue[]; music_silences: [number, number][]; silences: [number, number][]};

const knockAccents = [0, -2.5, -1];

export function planMix(sound: Sound, timeline: Timeline & {durationInFrames: number}): MixPlan {
  const duration = timeline.durationInFrames / timeline.fps;
  const effects = new Set(sound.effects.map(e => e.effect_id));
  const requireEffect = (effectId: string) => {
    if (!effects.has(effectId)) throw new Error(`Sound cue references unknown effect ${effectId}`);
  };
  const cues: PlannedCue[] = sound.cues.map(cue => {
    requireEffect(cue.effect_id);
    const start = Math.max(0, resolveAnchor(cue.at, timeline));
    const end = cue.until ? resolveAnchor(cue.until, timeline) : null;
    if (end !== null && end <= start) throw new Error(`Cue ${cue.effect_id} ends before it starts`);
    return {effect_id: cue.effect_id, start, end, gain_db: cue.gain_db, fade_in_seconds: cue.fade_in_seconds, fade_out_seconds: cue.fade_out_seconds};
  });
  if (sound.knock) {
    requireEffect(sound.knock.effect_id);
    for (const shot of timeline.shots) {
      const shotStart = shot.startFrame / timeline.fps;
      const shotSeconds = shot.durationInFrames / timeline.fps;
      for (const actor of shot.actors.filter(a => a.gait === 'knock')) {
        const enter = actor.enter_at * shotSeconds;
        knockContacts(shotSeconds - enter).forEach((contact, i) => {
          cues.push({effect_id: sound.knock!.effect_id, start: shotStart + enter + contact, end: null, gain_db: sound.knock!.gain_db + knockAccents[i % knockAccents.length]!, fade_in_seconds: 0, fade_out_seconds: 0.02});
        });
      }
    }
  }
  const span = ({from, until}: {from: Anchor; until?: Anchor | undefined}): [number, number] => [resolveAnchor(from, timeline), until ? resolveAnchor(until, timeline) : duration];
  const voices = timeline.segments.map(s => ({segment_id: s.segment_id, voice: s.voice, start: s.start}));
  return {duration_seconds: duration, voices, cues: cues.filter(c => c.start < duration).sort((a, b) => a.start - b.start), music_silences: sound.music.silences.map(span), silences: sound.silences.map(span)};
}
