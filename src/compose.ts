import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AudioManifestSchema, PlateManifestSchema, SoundSchema, StorySchema, TimingSchema} from './contracts.ts';
import {knockTimes, mediaDuration, planAudio, processVoice, type AudioAsset, type Clip} from './audio.ts';
import {compileTimeline, normalizeWord, resolveAnchor, type Timeline} from './timeline.ts';

const WIDTH = 1080;
const HEIGHT = 1920;
const here = fileURLToPath(new URL('.', import.meta.url));
const modules = resolve(here, '../node_modules');

const GRADES: Record<string, string> = {
  'dusk': 'saturate(1.08) contrast(1.05) brightness(1.02) sepia(0.1)',
  'twilight': 'saturate(0.92) contrast(1.06) brightness(0.92) hue-rotate(-6deg)',
  'night': 'saturate(0.85) contrast(1.12) brightness(0.82)',
  'interior-night': 'saturate(0.9) contrast(1.1) brightness(0.86)',
  'blackout': 'saturate(0.7) contrast(1.18) brightness(0.56)',
};
const TINTS: Record<string, string> = {
  'dusk': 'linear-gradient(180deg, rgba(255,150,80,0.10), rgba(80,30,60,0.18))',
  'twilight': 'linear-gradient(180deg, rgba(20,80,90,0.18), rgba(30,60,40,0.22))',
  'night': 'linear-gradient(180deg, rgba(10,30,70,0.25), rgba(10,40,30,0.25))',
  'interior-night': 'linear-gradient(180deg, rgba(20,30,70,0.20), rgba(40,20,10,0.20))',
  'blackout': 'linear-gradient(180deg, rgba(5,10,30,0.35), rgba(0,0,0,0.35))',
};

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;

export interface Composition { project: string; timeline: Timeline; clips: Clip[] }

export async function compose(input: string, project: string): Promise<Composition> {
  const story = StorySchema.parse(await readJson(join(input, 'story.json')));
  const sound = SoundSchema.parse(await readJson(join(input, 'sound.json')));
  if (sound.story_id !== story.story_id) throw new Error('Sound design targets a different story');
  const timing = TimingSchema.parse(await readJson(join(input, 'audio/timing.json')));
  const plates = PlateManifestSchema.parse(await readJson(join(input, 'plates/plates.json')));
  const audio = AudioManifestSchema.parse(await readJson(join(input, 'audio/audio.json')));
  const timeline = compileTimeline(story, timing);

  for (const dir of ['plates', 'audio', 'fonts', 'lib']) await mkdir(join(project, dir), {recursive: true});
  const plateInfo: Record<string, {src: string; width: number; height: number}> = {};
  for (const plate of plates.plates) {
    await copyFile(join(input, 'plates', plate.file), join(project, 'plates', basename(plate.file)));
    plateInfo[plate.plate_id] = {src: `plates/${basename(plate.file)}`, width: plate.width, height: plate.height};
  }
  for (const shot of story.shots) if (!plateInfo[shot.plate_id]) throw new Error(`Shot ${shot.shot_id} needs missing plate ${shot.plate_id}`);

  const assets = new Map(audio.assets.map(asset => [asset.asset_id, asset]));
  const voices = new Map<string, AudioAsset>();
  for (const segment of timeline.segments) {
    const asset = assets.get(`speech-${segment.segment_id}`);
    if (!asset) throw new Error(`Missing narration for ${segment.segment_id}`);
    const treatment = sound.cast[segment.voice]?.process ?? 'close-mic';
    const file = `audio/voice-${segment.segment_id}.wav`;
    await processVoice(join(input, 'audio', asset.file), join(project, file), treatment);
    voices.set(segment.segment_id, {file, duration: await mediaDuration(join(project, file))});
  }
  const effects = new Map<string, AudioAsset>();
  for (const effect of sound.effects) {
    const asset = assets.get(`effect-${effect.effect_id}`);
    if (!asset) continue;
    const file = `audio/${basename(asset.file)}`;
    await copyFile(join(input, 'audio', asset.file), join(project, file));
    effects.set(effect.effect_id, {file, duration: asset.duration_seconds});
  }
  const musicAsset = assets.get('music');
  if (!musicAsset) throw new Error('Missing music');
  await copyFile(join(input, 'audio', musicAsset.file), join(project, 'audio', basename(musicAsset.file)));
  const clips = planAudio(timeline, sound, voices, effects, {file: `audio/${basename(musicAsset.file)}`, duration: musicAsset.duration_seconds});

  await copyFile(join(modules, 'gsap/dist/gsap.min.js'), join(project, 'lib/gsap.min.js'));
  await copyFile(join(here, 'runtime/scene.js'), join(project, 'lib/scene.js'));
  const fonts = {
    'bebas.woff2': '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2',
    'inter-800.woff2': '@fontsource/inter/files/inter-latin-800-normal.woff2',
    'inter-800i.woff2': '@fontsource/inter/files/inter-latin-800-italic.woff2',
    'vt323.woff2': '@fontsource/vt323/files/vt323-latin-400-normal.woff2',
  };
  for (const [name, source] of Object.entries(fonts)) await copyFile(join(modules, source), join(project, 'fonts', name));

  await writeFile(join(project, 'index.html'), html(sceneData(story, timeline, sound, plateInfo), clips, timeline.duration));
  return {project, timeline, clips};
}

function sceneData(story: ReturnType<typeof StorySchema.parse>, timeline: Timeline, sound: ReturnType<typeof SoundSchema.parse>, plates: Record<string, {src: string; width: number; height: number}>) {
  const shotById = new Map(timeline.shots.map(shot => [shot.shot_id, shot]));
  const span = (id: string) => { const shot = shotById.get(id); if (!shot) throw new Error(`Overlay names unknown shot ${id}`); return shot; };
  let title = {lines: [] as Array<{text: string; accent: boolean}>, start: 0, end: 0};
  let broadcast = {label: '', start: 0, end: 0, intro_segment_id: ''};
  let lightsOut: {time: number; until: number} | null = null;
  let cutToBlack: {time: number} | null = null;
  const rules: Record<string, {number: number; text: string}> = {};
  const windowShadows = new Map<string, unknown>();
  for (const overlay of story.overlays) {
    if (overlay.kind === 'title') { const shot = span(overlay.shot_id); const d = shot.end - shot.start; title = {lines: overlay.lines, start: shot.start + overlay.from * d, end: shot.start + overlay.to * d}; }
    if (overlay.kind === 'broadcast') broadcast = {label: overlay.label, start: span(overlay.shot_id).start, end: span(overlay.until_shot_id).end, intro_segment_id: overlay.intro_segment_id};
    if (overlay.kind === 'rule') rules[overlay.segment_id] = {number: overlay.number, text: overlay.text};
    if (overlay.kind === 'lights-out') {
      const time = resolveAnchor(timeline, {segment_id: overlay.segment_id, word: overlay.word, edge: 'end', offset_seconds: 0});
      lightsOut = {time, until: span(overlay.shot_id).end};
    }
    if (overlay.kind === 'window-shadows') windowShadows.set(overlay.shot_id, {region: overlay.region, count: overlay.count});
    if (overlay.kind === 'cut-to-black') { const shot = span(overlay.shot_id); cutToBlack = {time: shot.start + overlay.from * (shot.end - shot.start)}; }
  }
  const knocks: Record<string, number[]> = {};
  for (const shot of timeline.shots) if (shot.actors.some(actor => actor.gait === 'knock')) knocks[shot.shot_id] = knockTimes(shot.start, shot.end);
  return {
    width: WIDTH, height: HEIGHT, duration: timeline.duration, fps: timeline.fps,
    shots: timeline.shots.map(shot => ({...shot, windowShadows: windowShadows.get(shot.shot_id) ?? null})),
    segments: timeline.segments.map(segment => ({...segment, words: segment.words.map(word => ({...word, key: normalizeWord(word.text)}))})),
    plates, grades: GRADES, tints: TINTS, title, broadcast, rules, lightsOut, cutToBlack, knocks, story_id: story.story_id, voices: Object.keys(sound.cast),
  };
}

const css = `
@font-face{font-family:Bebas;src:url(fonts/bebas.woff2) format('woff2')}
@font-face{font-family:Inter;font-weight:800;src:url(fonts/inter-800.woff2) format('woff2')}
@font-face{font-family:Inter;font-weight:800;font-style:italic;src:url(fonts/inter-800i.woff2) format('woff2')}
@font-face{font-family:Terminal;src:url(fonts/vt323.woff2) format('woff2')}
html,body{margin:0;padding:0;background:#000}
#root{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#05070c}
#stage{position:absolute;inset:0;overflow:hidden}
.world{position:absolute;inset:0;overflow:hidden}
.shot{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform,filter}
.plate{position:absolute;left:0;top:0;display:block}
.actor{position:absolute}
.actor svg{width:100%;height:100%;overflow:visible;transform-origin:50% 100%}
.window-shadows{position:absolute;overflow:hidden}
.shadow-figure{position:absolute;bottom:-10%;width:38%;height:105%;background:radial-gradient(ellipse 34% 22% at 50% 22%,rgba(0,0,0,.95) 98%,transparent 100%),radial-gradient(ellipse 50% 46% at 50% 82%,rgba(0,0,0,.95) 98%,transparent 100%);filter:blur(1.5px)}
.fx,.tint,.lights-out,.flash,.black{position:absolute;inset:0;pointer-events:none}
.tint{mix-blend-mode:multiply}
.lights-out{background:#000;opacity:0}
.flash{background:#fff;opacity:0}
.black{background:#000;opacity:0}
.title{position:absolute;left:64px;top:150px;font-family:Bebas,sans-serif;font-size:132px;line-height:.92;color:#fff;letter-spacing:1px;text-shadow:0 6px 24px rgba(0,0,0,.8)}
.title-line.accent{color:#ec3b3b}
.caption{position:absolute;left:60px;right:60px;top:${Math.round(HEIGHT * 0.68)}px;text-align:center;font-family:Inter,sans-serif;font-weight:800;font-size:58px;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.95),0 0 3px #000;letter-spacing:.5px}
.caption .hot{color:#ffc83d}
.caption.double{font-style:italic;color:#c9d2d6}
.caption.double .hot{color:#ffffff}
.banner{text-transform:uppercase;position:absolute;left:56px;right:56px;top:300px;height:62px;background:#e3262d;border-radius:6px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;font-family:Terminal,monospace;font-size:40px;color:#fff;letter-spacing:2px;box-shadow:0 10px 30px rgba(227,38,45,.35)}
.banner .banner-live{opacity:.55}
.banner.blink .banner-live{opacity:1}
.terminal{position:absolute;left:72px;right:72px;top:410px;font-family:Terminal,monospace;font-size:64px;line-height:1.05;color:#b9f5d0;text-shadow:0 0 12px rgba(120,255,180,.55);background:rgba(4,14,10,.55);padding:20px 26px;border-left:6px solid #e3262d}
.rule{position:absolute;left:72px;right:72px;top:410px;font-family:Bebas,sans-serif;text-shadow:0 6px 24px rgba(0,0,0,.9)}
.rule-number{font-size:96px;color:#ec3b3b;letter-spacing:3px}
.rule-text{font-size:104px;line-height:.98;color:#fff}
.rule-text .w.next{color:rgba(255,255,255,.28)}
.rule-text .w.now{color:#ffc83d}
`;

function html(scene: unknown, clips: Clip[], duration: number): string {
  const audio = clips.map(clip => `<audio id="${clip.id}" src="${clip.src}" data-start="${clip.start.toFixed(3)}" data-duration="${clip.duration.toFixed(3)}" data-media-start="${clip.mediaStart.toFixed(3)}" data-volume="${clip.volume.toFixed(4)}" data-fade-in="${clip.fadeIn.toFixed(3)}" data-fade-out="${clip.fadeOut.toFixed(3)}" preload="auto"></audio>`).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
<div id="root" data-composition-id="root" data-width="${WIDTH}" data-height="${HEIGHT}" data-start="0" data-duration="${duration.toFixed(3)}">
<div id="stage"></div>
${audio}
</div>
<script>window.__SCENE=${JSON.stringify(scene).replace(/</g, '\\u003c')};</script>
<script src="lib/gsap.min.js"></script>
<script src="lib/scene.js"></script>
<script>window.__timelines = window.__timelines || {}; window.__timelines["root"] = window.__sceneTimeline;</script>
</body></html>
`;
}
