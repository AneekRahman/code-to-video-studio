import {copyFile, mkdir, readFile, readdir, realpath} from 'node:fs/promises';
import {extname, resolve} from 'node:path';
import {StoryJobSchema, type StoryJob} from '../../contracts.ts';
import {readJson, sha256, writeJson} from '../../files.ts';
import {requireCondition} from '../../errors.ts';
import {loadAudio} from '../../audio.ts';
import {modeId} from './style.ts';
import {SegmentTimingSchema, StorySchema, compileStory} from './story.ts';
import {SoundSchema, planMix} from './sound.ts';
import {loadPlates} from './preview.ts';

const limits = {max_operation_attempts: 4, max_runtime_seconds: 3600, max_input_bytes: 250_000_000, max_output_bytes: 400_000_000, concurrency: 1} as const;

/** Assembles a self-contained, hash-pinned story job directory from generated plates and audio. */
export async function packageStory(options: {story: string; sound: string; plates: string; audio: string; out: string; jobId?: string}) {
  const story = await readJson(await realpath(resolve(options.story)), StorySchema);
  const sound = await readJson(await realpath(resolve(options.sound)), SoundSchema);
  const audio = await loadAudio(options.audio);
  const timing = await readJson(audio.timingPath, SegmentTimingSchema);
  requireCondition(sound.story_id === story.story_id && audio.manifest.story_id === story.story_id, 'INVALID_CONTRACT', 'Sound design and audio must belong to the story');
  const compiled = {fps: story.fps, ...compileStory(story, timing)};
  planMix(sound, compiled);
  const plateSet = await loadPlates(options.plates);

  const out = resolve(options.out);
  await mkdir(out, {recursive: true, mode: 0o700});
  requireCondition((await readdir(out)).length === 0, 'OUTPUT_EXISTS', 'Job directory must be empty');
  await mkdir(resolve(out, 'plates'));
  await mkdir(resolve(out, 'audio'));
  const pin = async (source: string, name: string) => {
    await copyFile(source, resolve(out, name));
    return {path: name, sha256: sha256(await readFile(resolve(out, name)))};
  };

  const assets: StoryJob['assets'] = [];
  for (const plateId of new Set(compiled.shots.map(s => s.plate_id))) {
    const record = plateSet.manifest.plates.find(p => p.plate_id === plateId);
    requireCondition(record, 'MISSING_PLATE', `No generated plate ${plateId}`);
    assets.push({asset_id: plateId, kind: 'still', file: await pin(plateSet.plates[plateId]!.file, `plates/${plateId}${extname(record.file)}`), provenance: `${record.provider_id} ${record.model}, seed ${record.seed}, prompt sha256 ${record.prompt_sha256}, generated ${record.generated_at}`, usage_rights: record.usage_rights});
  }
  for (const record of audio.manifest.assets) {
    const voice = typeof record.request.voice_id === 'string' ? ` voice ${record.request.voice_id}` : '';
    assets.push({asset_id: record.asset_id, kind: 'audio', file: await pin(audio.files[record.asset_id]!, `audio/${record.asset_id}.mp3`), provenance: `${record.provider_id} ${record.model}${voice}, request sha256 ${record.request_sha256}, generated ${record.generated_at}`, usage_rights: record.usage_rights});
  }
  const job = StoryJobSchema.parse({
    schema_version: '1.0',
    adapter: 'local-fixture',
    mode: modeId,
    job_id: options.jobId ?? story.story_id,
    status: 'approved_for_visual_production',
    format: {width: 1080, height: 1920, fps: story.fps, duration_seconds: compiled.durationInFrames / story.fps, codec: 'h264', container: 'mp4'},
    inputs: {story: await pin(await realpath(resolve(options.story)), 'story.json'), sound: await pin(await realpath(resolve(options.sound)), 'sound.json'), timing: await pin(audio.timingPath, 'timing.json')},
    assets,
    limits: {...limits, max_frames: compiled.durationInFrames},
  });
  await writeJson(resolve(out, 'job.json'), job);
  return {status: 'job_ready', job: resolve(out, 'job.json'), job_id: job.job_id, duration_seconds: job.format.duration_seconds, assets: assets.length};
}
