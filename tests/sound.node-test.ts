import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StorySchema, SegmentTimingSchema, compileStory, estimateTiming} from '../src/modes/isometric-art-zombie-apocalypse/story.ts';
import {SoundSchema, alignmentWords, planMix, resolveAnchor} from '../src/modes/isometric-art-zombie-apocalypse/sound.ts';
import {knockContacts, knockLift} from '../src/modes/isometric-art-zombie-apocalypse/motion.ts';
import {mixStory} from '../src/modes/isometric-art-zombie-apocalypse/mixdown.ts';
import {createMockAudioProvider, mockAlignment} from '../src/audiogen/mock.ts';
import {generateAudio, loadAudio} from '../src/audio.ts';

const modeDir = new URL('../src/modes/isometric-art-zombie-apocalypse/', import.meta.url);
const storyPath = fileURLToPath(new URL('story.template.json', modeDir));
const soundPath = fileURLToPath(new URL('sound.template.json', modeDir));
const load = async () => {
  const story = StorySchema.parse(JSON.parse(await readFile(storyPath, 'utf8')));
  const sound = SoundSchema.parse(JSON.parse(await readFile(soundPath, 'utf8')));
  return {story, sound, compiled: {fps: story.fps, ...compileStory(story, estimateTiming(story))}};
};

test('character alignment becomes script words, keeping punctuation and ellipses attached', () => {
  const text = "Hey… it's me. Let me in.";
  const words = alignmentWords(text, mockAlignment(text));
  assert.deepEqual(words.map(w => w.text), ['Hey…', "it's", 'me.', 'Let', 'me', 'in.']);
  assert.ok(words.every((w, i) => w.end > w.start && (i === 0 || w.start >= words[i - 1]!.end)));
  assert.throws(() => alignmentWords('Let me in.', mockAlignment('Let him in.')), /does not match/);
});

test('knock sounds land where the animated fist meets the door', () => {
  const contacts = knockContacts(3.4);
  assert.equal(contacts.length, 6);
  for (const at of contacts) {
    assert.ok(knockLift(at) < 1e-9, `fist at the door at ${at}`);
    assert.ok(knockLift(at - 0.05) > 0.2, `fist travelling before ${at}`);
  }
});

test('the sound template resolves every anchor against the story and syncs knocks to knocking actors', async () => {
  const {story, sound, compiled} = await load();
  assert.equal(sound.story_id, story.story_id);
  const plan = planMix(sound, compiled);
  assert.equal(plan.voices.length, story.segments.length);
  const knockShots = compiled.shots.filter(s => s.actors.some(a => a.gait === 'knock'));
  const knocks = plan.cues.filter(c => c.effect_id === sound.knock!.effect_id);
  assert.ok(knocks.length >= knockShots.length * 3);
  for (const knock of knocks) assert.ok(knockShots.some(s => knock.start >= s.startFrame / story.fps && knock.start < (s.startFrame + s.durationInFrames) / story.fps));
  const click = sound.cues.find(c => c.effect_id === 'light-click')!;
  const r1 = compiled.segments.find(s => s.segment_id === 'r1')!;
  assert.equal(resolveAnchor(click.at, compiled), r1.words.find(w => w.text.startsWith('light'))!.endFrame / story.fps);
  assert.throws(() => planMix({...sound, cues: [{...sound.cues[0]!, effect_id: 'missing'}]}, compiled), /unknown effect/);
  assert.throws(() => resolveAnchor({segment_id: 'r1', word: 'banana', edge: 'start', offset_seconds: 0}, compiled), /no spoken word/);
});

test('audio generation reuses unchanged assets and writes timing the story compiler accepts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-audio-'));
  try {
    const out = resolve(dir, 'audio');
    const first = await generateAudio({story: storyPath, sound: soundPath, out, provider: createMockAudioProvider()});
    assert.equal(first.status, 'audio_ready');
    assert.ok(first.outcomes.every(o => o.status === 'generated'));
    const again = await generateAudio({story: storyPath, sound: soundPath, out, provider: createMockAudioProvider()});
    assert.ok(again.outcomes.every(o => o.status === 'reused'));
    const timing = SegmentTimingSchema.parse(JSON.parse(await readFile(resolve(out, 'timing.json'), 'utf8')));
    const {story, sound} = await load();
    const compiled = {fps: story.fps, ...compileStory(story, timing)};
    assert.equal(compiled.timing_source, 'mock-alignment');

    const audio = await loadAudio(out);
    const of = (kind: string, prefix: string) => Object.fromEntries(audio.manifest.assets.filter(a => a.kind === kind).map(a => [a.asset_id.slice(prefix.length), audio.files[a.asset_id]!]));
    const short = {...sound, music: {...sound.music, silences: []}};
    const plan = planMix(short, compiled);
    const mix = await mixStory(plan, short, {voiceFiles: of('speech', 'speech-'), effectFiles: of('effect', 'effect-'), effectDurations: Object.fromEntries(audio.manifest.assets.filter(a => a.kind === 'effect').map(a => [a.asset_id.slice(7), a.duration_seconds])), musicFile: audio.files.music!}, dir);
    assert.ok(Math.abs(mix.loudness.integrated_lufs + 14) <= 1, `integrated ${mix.loudness.integrated_lufs}`);
    assert.ok(mix.loudness.true_peak_dbtp <= -1, `true peak ${mix.loudness.true_peak_dbtp}`);

    await writeFile(resolve(out, audio.manifest.assets[0]!.file), 'tampered');
    await assert.rejects(loadAudio(out), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INPUT_CHANGED');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
