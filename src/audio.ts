import {mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readJson, sha256} from './files.ts';
import {StudioError, requireCondition} from './errors.ts';
import {runTool} from './process.ts';
import type {AudioProvider, CharacterAlignment} from './audiogen/provider.ts';
import {StorySchema, type SegmentTiming} from './modes/isometric-art-zombie-apocalypse/story.ts';
import {SoundSchema, alignmentWords} from './modes/isometric-art-zombie-apocalypse/sound.ts';

export type AudioAssetKind = 'speech' | 'effect' | 'music';

export type AudioRecord = {
  asset_id: string;
  kind: AudioAssetKind;
  file: string;
  sha256: string;
  duration_seconds: number;
  request: Record<string, unknown>;
  request_sha256: string;
  provider_id: string;
  model: string;
  alignment?: CharacterAlignment;
  provider_request_ms: number;
  generated_at: string;
  usage_rights: string;
};

export type AudioManifest = {schema_version: '1.0'; story_id: string; assets: AudioRecord[]};

export const audioManifestName = 'audio.json';
export const timingName = 'timing.json';

type Planned = {asset_id: string; kind: AudioAssetKind; model: string; request: Record<string, unknown>; text?: string};

async function readManifest(path: string): Promise<AudioManifest | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AudioManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new StudioError('INVALID_CONTRACT', `Existing ${audioManifestName} is unreadable`);
  }
}

export async function mediaDuration(path: string): Promise<number> {
  const seconds = Number((await runTool('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])).trim());
  requireCondition(Number.isFinite(seconds) && seconds > 0, 'INVALID_MEDIA', 'Generated audio has no measurable duration');
  return seconds;
}

function planAssets(story: ReturnType<typeof StorySchema.parse>, sound: ReturnType<typeof SoundSchema.parse>, provider: AudioProvider): Planned[] {
  const speech = story.segments.map((segment): Planned => {
    const cast = sound.cast[segment.voice];
    return {asset_id: `speech-${segment.segment_id}`, kind: 'speech', model: cast.model, text: segment.text, request: {voice_id: cast.voice_id, model: cast.model, text: segment.text, seed: cast.seed, ...(cast.settings ? {settings: cast.settings} : {})}};
  });
  const effects = sound.effects.map((effect): Planned => ({asset_id: `effect-${effect.effect_id}`, kind: 'effect', model: provider.models.effect, request: {prompt: effect.prompt, duration_seconds: effect.duration_seconds, prompt_influence: effect.prompt_influence, loop: effect.loop}}));
  const music: Planned = {asset_id: 'music', kind: 'music', model: provider.models.music, request: {prompt: sound.music.prompt, duration_seconds: sound.music.duration_seconds}};
  return [...speech, ...effects, music];
}

export async function generateAudio(options: {story: string; sound: string; out: string; provider: AudioProvider; timeoutMs?: number}) {
  const story = await readJson(await realpath(resolve(options.story)), StorySchema);
  const sound = await readJson(await realpath(resolve(options.sound)), SoundSchema);
  requireCondition(sound.story_id === story.story_id, 'INVALID_CONTRACT', 'Sound design targets a different story');
  const out = resolve(options.out);
  await mkdir(out, {recursive: true, mode: 0o700});
  const manifestPath = resolve(out, audioManifestName);
  const existing = await readManifest(manifestPath);
  requireCondition(!existing || existing.story_id === story.story_id, 'INVALID_CONTRACT', 'Output directory holds audio for a different story');
  const records = new Map((existing?.assets ?? []).map(r => [r.asset_id, r]));
  const outcomes: {asset_id: string; status: 'reused' | 'generated' | 'refused'; reason?: string}[] = [];
  const planned = planAssets(story, sound, options.provider);

  for (const asset of planned) {
    const requestHash = sha256(JSON.stringify({provider: options.provider.provider_id, model: asset.model, ...asset.request}));
    const previous = records.get(asset.asset_id);
    if (previous && previous.request_sha256 === requestHash) {
      requireCondition(sha256(await readFile(resolve(out, previous.file))) === previous.sha256, 'INPUT_CHANGED', `Audio ${asset.asset_id} bytes no longer match the manifest`);
      outcomes.push({asset_id: asset.asset_id, status: 'reused'});
      continue;
    }
    const signal = AbortSignal.timeout(options.timeoutMs ?? 300_000);
    let bytes: Buffer;
    let alignment: CharacterAlignment | undefined;
    let requestMs: number;
    try {
      if (asset.kind === 'speech') {
        const r = asset.request as {voice_id: string; model: string; text: string; seed: number; settings?: Record<string, number | boolean>};
        const speech = await options.provider.speak(r, signal);
        alignmentWords(r.text, speech.alignment);
        ({bytes, alignment, provider_request_ms: requestMs} = speech);
      } else if (asset.kind === 'effect') {
        ({bytes, provider_request_ms: requestMs} = await options.provider.effect(asset.request as {prompt: string; duration_seconds: number; prompt_influence: number; loop: boolean}, signal));
      } else {
        ({bytes, provider_request_ms: requestMs} = await options.provider.music(asset.request as {prompt: string; duration_seconds: number}, signal));
      }
    } catch (error) {
      if (!(error instanceof StudioError) || error.code !== 'PROVIDER_REFUSED') throw error;
      outcomes.push({asset_id: asset.asset_id, status: 'refused', reason: error.message});
      continue;
    }
    const version = previous ? Number(/-v(\d+)\./.exec(previous.file)?.[1] ?? 1) + 1 : 1;
    const file = `${asset.asset_id}-v${version}.mp3`;
    await writeFile(resolve(out, file), bytes, {flag: 'wx', mode: 0o600});
    records.set(asset.asset_id, {
      asset_id: asset.asset_id,
      kind: asset.kind,
      file,
      sha256: sha256(bytes),
      duration_seconds: await mediaDuration(resolve(out, file)),
      request: asset.request,
      request_sha256: requestHash,
      provider_id: options.provider.provider_id,
      model: asset.model,
      ...(alignment ? {alignment} : {}),
      provider_request_ms: requestMs,
      generated_at: new Date().toISOString(),
      usage_rights: 'generated for this job; provider terms apply',
    });
    outcomes.push({asset_id: asset.asset_id, status: 'generated'});
    await writeManifest(manifestPath, {schema_version: '1.0', story_id: story.story_id, assets: [...records.values()]});
  }

  const assets = planned.map(p => records.get(p.asset_id)).filter((r): r is AudioRecord => Boolean(r));
  await writeManifest(manifestPath, {schema_version: '1.0', story_id: story.story_id, assets});
  const complete = assets.length === planned.length;
  if (complete) {
    const timing: SegmentTiming = {
      schema_version: '1.0',
      source: `${options.provider.provider_id}-alignment`,
      segments: story.segments.map(segment => {
        const record = records.get(`speech-${segment.segment_id}`)!;
        const words = alignmentWords(segment.text, record.alignment!);
        return {segment_id: segment.segment_id, duration_seconds: Math.max(record.duration_seconds, words.at(-1)!.end), words};
      }),
    };
    await writeFile(resolve(out, timingName), `${JSON.stringify(timing, null, 2)}\n`, {mode: 0o600});
  }
  return {status: complete ? 'audio_ready' : 'audio_incomplete', out, manifest: audioManifestName, timing: complete ? timingName : null, outcomes};
}

export async function loadAudio(audioDir: string): Promise<{dir: string; manifest: AudioManifest; files: Record<string, string>; timingPath: string}> {
  const dir = await realpath(resolve(audioDir));
  const manifest = JSON.parse(await readFile(resolve(dir, audioManifestName), 'utf8')) as AudioManifest;
  const files: Record<string, string> = {};
  for (const record of manifest.assets) {
    const path = resolve(dir, record.file);
    requireCondition(sha256(await readFile(path)) === record.sha256, 'INPUT_CHANGED', `Audio ${record.asset_id} does not match its manifest hash`);
    files[record.asset_id] = path;
  }
  return {dir, manifest, files, timingPath: resolve(dir, timingName)};
}

async function writeManifest(path: string, manifest: AudioManifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
}
