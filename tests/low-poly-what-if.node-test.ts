import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AudioPlanSchema, EscalationSchema, type Escalation} from '../src/modes/low-poly-3d-what-if/escalation.ts';
import {activeCaption, clockText, exactTally, formatBig, frameAt, rungStart, rungText, tallyLines} from '../src/modes/low-poly-3d-what-if/timeline.ts';
import {mixFilter, planAudio, shoutDb} from '../src/modes/low-poly-3d-what-if/audio.ts';
import {whatIfRubric} from '../src/modes/low-poly-3d-what-if/quality.ts';
import {packageWhatIf} from '../src/modes/low-poly-3d-what-if/package.ts';
import {lowPolyWhatIfMode} from '../src/modes/low-poly-3d-what-if/mode.ts';
import {loadAnyJob} from '../src/jobs.ts';

const dir = (name: string) => fileURLToPath(new URL(`../src/modes/low-poly-3d-what-if/${name}`, import.meta.url));
const template = async (): Promise<Escalation> => EscalationSchema.parse(JSON.parse(await readFile(dir('escalation.template.json'), 'utf8')));
const plan = async () => AudioPlanSchema.parse(JSON.parse(await readFile(dir('audio.template.json'), 'utf8')));
const invalid = (mutate: (e: Record<string, any>) => void) => async () => {
  const raw = JSON.parse(await readFile(dir('escalation.template.json'), 'utf8'));
  mutate(raw);
  return EscalationSchema.safeParse(raw);
};

test('the template validates and each way of breaking it is refused', async () => {
  await template();
  assert.equal((await invalid(e => { e.shots[1].from_seconds = 15; })()).success, false, 'a gap between shots');
  assert.equal((await invalid(e => { e.shots[e.shots.length - 1].to_seconds = 40; })()).success, false, 'shots that end before the duration');
  assert.equal((await invalid(e => { e.rungs.pop(); })()).success, false, 'a rung per counter step');
  assert.equal((await invalid(e => { e.counter.period_seconds = 4; })()).success, false, 'a counter that runs past the end');
  assert.equal((await invalid(e => { e.counter.ratio = 1; })()).success, false, 'a geometric counter must grow');
  assert.equal((await invalid(e => { e.shots[0].world = 'volcano'; })()).success, false, 'an unknown world');
  assert.equal((await invalid(e => { e.duration_seconds = 20; })()).success, false, 'a duration below the mode range');
});

test('counters print as the references do, and a doubling counter ends on the exact tally', async () => {
  assert.equal(formatBig(1), '1');
  assert.equal(formatBig(2048), '2,048');
  assert.equal(formatBig(2 ** 23), '8.39 million');
  assert.equal(formatBig(2 ** 27), '134 million');
  assert.equal(formatBig(2 ** 31), '2.15 billion');
  assert.equal(formatBig(2 ** 55), '36.0 quadrillion');
  assert.equal(formatBig(2 ** 91), '2.48 octillion');
  const e = await template();
  const piss = {...e, counter: {...e.counter, rungs: 92, start: 1, ratio: 2}};
  assert.equal(exactTally(piss as Escalation, 92), '2,475,880,078,570,760,549,798,248,448');
  assert.deepEqual(tallyLines(piss as Escalation), ['2,475,880,078,570,', '760,549,798,248,448 J']);
  assert.equal(clockText(91), '1:31');
  assert.equal(clockText(5), '0:05');
});

test('an arithmetic counter rolls to its new value and a geometric one jumps', async () => {
  const e = await template();
  const arithmetic = EscalationSchema.parse({...e, counter: {kind: 'arithmetic', start: 70, step: 10, unit: 'dB', first_at_seconds: 2.4, period_seconds: 1.2, rungs: 30, roll_seconds: 0.8}});
  assert.equal(rungText(arithmetic, 3, Infinity), '90 dB');
  const mid = Number(rungText(arithmetic, 3, 0.2).split(' ')[0]);
  assert.ok(mid > 80 && mid < 90, `mid-roll ${mid}`);
  assert.equal(rungText(arithmetic, 3, 0), '80 dB');
  assert.equal(rungText(e, 4, 0), '8 J', 'a geometric counter prints the new value at once');
});

test('a frame is a pure function of time: rungs, captions, title and the final card', async () => {
  const e = await template();
  const before = frameAt(e, 1);
  assert.equal(before.timeline.rung, 1);
  assert.equal(before.hud.hudAlpha, 0, 'no HUD before the first rung');
  assert.ok(before.hud.title && before.hud.title.alpha > 0.9);
  const first = frameAt(e, rungStart(e, 1) + 0.5);
  assert.equal(first.hud.kicker, 'Clap #1');
  assert.equal(first.hud.value, '1 J');
  assert.equal(first.hud.hudAlpha, 1);
  assert.equal(first.hud.title, undefined);
  assert.deepEqual(frameAt(e, 20.123), frameAt(e, 20.123), 'same time, same frame');
  const last = frameAt(e, rungStart(e, e.counter.rungs) + 0.1);
  assert.equal(last.hud.value, '0 J');
  assert.equal(last.timeline.level, 1);
  const span = activeCaption(e, 2);
  assert.equal(span?.text, 'One clap. Nobody notices.', 'a caption stays for its rungs');
  assert.equal(activeCaption(e, 3)?.text, 'Heads turn.');
});

test('the closing card replaces the HUD and carries the tally', async () => {
  const e = await template();
  const closing = {...e, ending: {from_seconds: 41, final: {kicker: 'Final energy', line: 'it was only a clap.'}, silence_from_seconds: 38.5}} as Escalation;
  assert.ok(frameAt(closing, 40).hud.final === undefined);
  const card = frameAt(closing, 42).hud;
  assert.ok(card.final && card.final.alpha > 0.9);
  assert.equal(card.hudAlpha, 0);
});

test('the audio plan places one cue per rung before the declared silence, and silence is exact', async () => {
  const e = await template();
  const p = await plan();
  const cues = planAudio(e, p);
  assert.equal(cues.silence?.[0], 38.5);
  assert.ok(cues.cues.every(cue => cue.at < 38.5));
  assert.equal(cues.cues.length, e.counter.rungs, 'every rung starts before the silence');
  const early = planAudio({...e, ending: {from_seconds: 46, silence_from_seconds: 30}}, p);
  assert.ok(early.cues.length < e.counter.rungs && early.cues.every(cue => cue.at < 30), 'rungs inside the silence get no cue');
  assert.ok(shoutDb(p, 1, 30) < shoutDb(p, 15, 30) && shoutDb(p, 15, 30) < shoutDb(p, 30, 30), 'each shout is louder');
  assert.equal(shoutDb(p, 30, 30), p.last_shout_db);
  const {filter} = mixFilter(cues.cues, cues.duration, cues.silence, false, p.shout_stretch);
  assert.ok(filter.includes('concat=n=2:v=0:a=1'), 'cues are placed with real silence, not a timestamp gap');
  assert.ok(!filter.includes('adelay'), 'adelay leaves a gap that amix collapses');
  assert.ok(filter.includes('if(gte(t\\,38.500)'), 'the silence is muted from its declared second');
  assert.throws(() => planAudio(e, {...p, what_if_id: 'someone-else'}), /different what-if/);
});

test('job checks pass on the template and name a caption that cannot be read in time', async () => {
  const e = await template();
  assert.ok(whatIfRubric(e).every(check => check.pass), JSON.stringify(whatIfRubric(e).filter(check => !check.pass)));
  const rushed = {...e, rungs: e.rungs.map((r, i) => i === 3 ? {...r, caption: 'This sentence has far too many words to be read inside one short rung of the ladder.', caption_rungs: 1} : r)} as Escalation;
  const failed = whatIfRubric(rushed).filter(check => !check.pass);
  assert.deepEqual(failed.map(check => check.check_id), ['caption_reading_time']);
  assert.match(failed[0]!.detail, /rung 4/);
});

test('the mode is registered, packages its template into a hash-pinned job and loads it', async () => {
  assert.equal(lowPolyWhatIfMode.card.id, 'low-poly-3d-what-if');
  assert.equal(lowPolyWhatIfMode.card.role, 'specialised');
  const root = await mkdtemp(join(tmpdir(), 'studio-what-if-'));
  try {
    const job = await lowPolyWhatIfMode.fixture(root);
    const loaded = await loadAnyJob(job);
    assert.equal(loaded.mode, 'low-poly-3d-what-if');
    const timeline = loaded.timeline as {durationInFrames: number; rungs: number; shots: unknown[]};
    assert.equal(timeline.durationInFrames, 46 * 30);
    assert.equal(timeline.rungs, 30);
    assert.equal(timeline.shots.length, 6);
    const tampered = JSON.parse(await readFile(job, 'utf8'));
    tampered.format.duration_seconds = 50;
    await writeFile(job, JSON.stringify(tampered));
    await assert.rejects(loadAnyJob(job), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'TIMING_CONFLICT');
    await assert.rejects(packageWhatIf({escalation: dir('escalation.template.json'), audio: dir('audio.template.json'), out: join(root, 'job')}), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'OUTPUT_EXISTS');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('side characters are autonomous: they walk, pause, keep to the street and move as a pure function of time', async () => {
  const {crowd, isWalking, makeFlock, makeWalkers, pigeonsAt, travelled, wrap} = await import('../src/modes/low-poly-3d-what-if/world/agents.ts');
  const {rngFrom} = await import('../src/modes/low-poly-3d-what-if/world/core.ts');
  const state = (t: number, rung = 1) => ({t, u: 0, level: 0, rung, sinceTick: 0.3, period: 1.2});
  const walkers = makeWalkers(rngFrom(7), 30, [-3, -2, 1], -100, 50);
  const people = crowd(walkers);
  const hero: [number, number, number] = [0, 0, -40];
  const at = (t: number) => {
    people.update(state(t), hero, -100, 50);
    return walkers.map(w => ({x: w.person.root.position.x, z: w.person.root.position.z, leg: w.person.root.children[0]!.children.length}));
  };
  const first = at(2);
  const later = at(9);
  const moved = first.filter((p, i) => Math.hypot(p.x - later[i]!.x, p.z - later[i]!.z) > 0.5).length;
  assert.ok(moved >= 24, `${moved} of 30 walkers moved in seven seconds`);
  assert.deepEqual(at(9), later, 'same time, same positions');
  for (const t of [0, 5, 31, 77, 140]) for (const p of at(t)) assert.ok(p.z >= -100 && p.z < 50, `z ${p.z} stays in the street at t=${t}`);
  const w = walkers[0]!.spec;
  const before = travelled(w, 0);
  assert.ok(travelled(w, 40) > before + 5, 'a walker covers ground over time');
  let paused = 0;
  for (let t = 0; t < 40; t += 0.25) if (!isWalking(w, t)) paused++;
  assert.ok(paused > 8 && paused < 100, 'a walker pauses on its own rhythm');
  const resting = Array.from({length: 400}, (_, i) => i * 0.1).find(t => !isWalking(w, t) && !isWalking(w, t + 0.2))!;
  assert.equal(travelled(w, resting), travelled(w, resting + 0.2), 'standing still covers no ground');
  const rhythms = new Set(walkers.map(x => x.spec.offset.toFixed(2)));
  assert.equal(rhythms.size, walkers.length, 'no two walkers share a rhythm');
  assert.equal(wrap(-101, -100, 50), 49);
  const flock = makeFlock(rngFrom(3), 9, [1.5, 0, 3], 2.6);
  pigeonsAt(flock, state(1), [0, 0, 0], -1);
  const a = flock.birds.map(b => [b.bird.root.position.x, b.bird.root.position.z]);
  pigeonsAt(flock, state(4), [0, 0, 0], -1);
  const b = flock.birds.map(x => [x.bird.root.position.x, x.bird.root.position.z]);
  assert.ok(a.some((p, i) => Math.hypot(p[0]! - b[i]![0]!, p[1]! - b[i]![1]!) > 0.1), 'pigeons wander before the shout');
  pigeonsAt(flock, state(8), [0, 0, 0], 3);
  assert.ok(flock.birds.every(x => !x.bird.root.visible || x.bird.root.position.y > 1), 'after the shout they are in the air');
});
