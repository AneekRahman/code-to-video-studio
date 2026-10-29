import {mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ScriptSchema, TimingSchema, type Script} from '../../contracts.ts';
import {readJson, sha256, writeJson} from '../../files.ts';
import {runTool} from '../../process.ts';
import type {AudioProvider} from '../../audiogen/provider.ts';
import {alignmentWords} from '../isometric-art-zombie-apocalypse/sound.ts';
import {mediaDuration} from '../../audio.ts';
import {normalizeWordTimings} from './timing.ts';

export type NarrateExplainerOptions = {
  script: string | Script;
  out: string;
  provider: AudioProvider;
  voiceId?: string;
  model?: string;
  seed?: number;
  timeoutMs?: number;
};

export type NarrateExplainerResult = {
  status: 'narration_ready';
  out: string;
  narrationFile: string;
  timestampsFile: string;
  narrationSha256: string;
  durationSeconds: number;
  wordCount: number;
};

export async function narrateExplainer(options: NarrateExplainerOptions): Promise<NarrateExplainerResult> {
  const script: Script = typeof options.script === 'string'
    ? await readJson(await realpath(resolve(options.script)), ScriptSchema)
    : ScriptSchema.parse(options.script);

  const outDir = resolve(options.out);
  await mkdir(outDir, {recursive: true, mode: 0o700});

  const voiceId = options.voiceId ?? 'backendconfigured';
  const model = options.model ?? 'eleven_multilingual_v2';
  const seed = options.seed ?? 1;

  const segmentAudios: {path: string; duration: number}[] = [];
  const allWords: {segment_id: string; text: string; start: number; end: number}[] = [];
  let cumulativeSeconds = 0;

  for (const [index, segment] of script.segments.entries()) {
    const signal = AbortSignal.timeout(options.timeoutMs ?? 300_000);
    const speech = await options.provider.speak({
      voice_id: voiceId,
      model,
      text: segment.text,
      seed,
    }, signal);

    const chunkFile = resolve(outDir, `segment-${index}.mp3`);
    await writeFile(chunkFile, speech.bytes, {mode: 0o600});
    const chunkDuration = await mediaDuration(chunkFile);

    const words = alignmentWords(segment.text, speech.alignment);
    for (const word of words) {
      allWords.push({
        segment_id: segment.segment_id,
        text: word.text,
        start: Number((cumulativeSeconds + word.start).toFixed(3)),
        end: Number((cumulativeSeconds + word.end).toFixed(3)),
      });
    }

    segmentAudios.push({path: chunkFile, duration: chunkDuration});
    cumulativeSeconds += chunkDuration;
  }

  const narrationFile = resolve(outDir, 'narration.mp3');
  if (segmentAudios.length === 1) {
    const single = await readFile(segmentAudios[0]!.path);
    await writeFile(narrationFile, single, {mode: 0o600});
  } else {
    const listFile = resolve(outDir, '.concat-list.txt');
    const lines = segmentAudios.map(s => `file '${s.path.replace(/'/g, "'\\''")}'`).join('\n');
    await writeFile(listFile, `${lines}\n`, {mode: 0o600});
    try {
      await runTool('ffmpeg', [
        '-v', 'error',
        '-nostdin',
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        narrationFile,
      ]);
    } finally {
      const {rm} = await import('node:fs/promises');
      await rm(listFile, {force: true});
    }
  }

  const finalDuration = await mediaDuration(narrationFile);
  const narrationBytes = await readFile(narrationFile);
  const audioSha256 = sha256(narrationBytes);

  const timestamps = TimingSchema.parse({
    schema_version: '1.0',
    audio_sha256: audioSha256,
    duration_seconds: finalDuration,
    words: normalizeWordTimings(allWords, finalDuration),
  });

  const timestampsFile = resolve(outDir, 'timestamps.json');
  await writeJson(timestampsFile, timestamps);

  return {
    status: 'narration_ready',
    out: outDir,
    narrationFile,
    timestampsFile,
    narrationSha256: audioSha256,
    durationSeconds: finalDuration,
    wordCount: allWords.length,
  };
}
