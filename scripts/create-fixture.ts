import {cp, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {JobSchema} from '../src/contracts.ts';
import {sha256, writeJson} from '../src/files.ts';
import {probe} from '../src/media.ts';
import {runTool} from '../src/process.ts';

export async function createFixture(root?: string, speech = false) {
  const dir = root ? resolve(root) : await mkdtemp(join(tmpdir(), 'video-studio-fixture-'));
  await mkdir(dir, {recursive: true, mode: 0o700});
  const font = fileURLToPath(import.meta.resolve('@fontsource/inter/files/inter-latin-400-normal.woff2'));
  await cp(font, resolve(dir, 'font.woff2'));
  const licensePath = fileURLToPath(import.meta.resolve('@fontsource/inter/LICENSE'));
  await cp(licensePath, resolve(dir, 'font-license.txt'));
  const fontLicenseText = await readFile(licensePath, 'utf8');
  const words = ['Clear', 'stories', 'create', 'strong', 'connections', 'through', 'motion', 'and', 'sound'];
  const timings: {segment_id: string; text: string; start: number; end: number}[] = [];
  let duration = 0;
  const chunkPaths: string[] = [];
  for (const [index, text] of words.entries()) {
    const chunk = resolve(dir, `word-${index}.wav`);
    if (speech) {
      const aiff = resolve(dir, `word-${index}.aiff`);
      await runTool('say', ['-o', aiff, text]);
      await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', aiff, '-af', 'silenceremove=stop_periods=1:stop_duration=0.05:stop_threshold=-40dB', '-ar', '48000', '-ac', '1', chunk]);
    } else {
      await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', `sine=frequency=${320 + index * 40}:sample_rate=48000:duration=0.6`, chunk]);
    }
    const length = (await probe(chunk)).duration;
    const segment_id = index < 3 ? 'n1' : index < 5 ? 'n2' : 'n3';
    timings.push({segment_id, text, start: duration, end: duration + length});
    duration += length;
    chunkPaths.push(chunk);
  }
  const totalFrames = Math.ceil(duration * 30);
  const target = totalFrames / 30;
  const args = ['-v', 'error', '-nostdin', '-n'];
  for (const path of chunkPaths) args.push('-i', path);
  args.push('-filter_complex', `${chunkPaths.map((_, i) => `[${i}:a]`).join('')}concat=n=${words.length}:v=0:a=1,apad=whole_dur=${target}[audio]`, '-map', '[audio]', '-t', String(target), '-ar', '48000', resolve(dir, 'narration.wav'));
  await runTool('ffmpeg', args);
  await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=0x223c55:s=640x360', '-vf', 'drawbox=x=80:y=60:w=480:h=240:color=0x56e3c2:t=12', '-frames:v', '1', resolve(dir, 'still.png')]);
  await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', `sine=frequency=180:sample_rate=48000:duration=${target}`, resolve(dir, 'music.wav')]);
  const ref = async (name: string) => ({path: name, sha256: sha256(await readFile(resolve(dir, name)))});
  await writeJson(resolve(dir, 'script.json'), {schema_version: '1.0', segments: [
    {segment_id: 'n1', text: words.slice(0, 3).join(' ')},
    {segment_id: 'n2', text: words.slice(3, 5).join(' ')},
    {segment_id: 'n3', text: words.slice(5).join(' ')},
  ]});
  await writeJson(resolve(dir, 'timestamps.json'), {schema_version: '1.0', audio_sha256: (await ref('narration.wav')).sha256, duration_seconds: target, words: timings});
  const boundary1 = timings[3]!.start;
  const boundary2 = timings[5]!.start;
  await writeJson(resolve(dir, 'storyboard.json'), {schema_version: '1.0', scenes: [
    {scene_id: 'hook', start_seconds: 0, end_seconds: boundary1, treatment: 'headline', title: 'Clear stories create connection', lines: ['Start with one clear idea'], still_asset_id: 'fixture_still', narration_segment_ids: ['n1']},
    {scene_id: 'compare', start_seconds: boundary1, end_seconds: boundary2, treatment: 'comparison', title: 'Make every scene earn its place', lines: ['One idea per scene', 'Motion supports the story'], narration_segment_ids: ['n2']},
    {scene_id: 'close', start_seconds: boundary2, end_seconds: target, treatment: 'stat', title: 'Bring picture and sound together', value: 3, suffix: ' steps', lines: ['Plan', 'Animate', 'Review'], narration_segment_ids: ['n3']},
  ]});
  await writeJson(resolve(dir, 'brand.json'), {schema_version: '1.0', brand_id: 'fixture_only', version: '1', background: '#111827', foreground: '#ffffff', accent: '#56e3c2', font_asset_id: 'fixture_font', caption_mode: 'word-highlight', safe_area: {top: 150, bottom: 280, left: 90, right: 90}});
  await writeJson(resolve(dir, 'mix.json'), {schema_version: '1.0', narration_gain_db: 0, tracks: [{asset_id: 'fixture_music', start_seconds: 0, duration_seconds: target, gain_db: -28, fade_in_seconds: 0.2, fade_out_seconds: 0.4}]});
  const job = JobSchema.parse({schema_version: '1.0', adapter: 'local-fixture', job_id: speech ? 'spoken_fixture' : 'synthetic_fixture', status: 'approved_for_visual_production', format: {width: 1080, height: 1920, fps: 30, duration_seconds: target, codec: 'h264', container: 'mp4'}, inputs: {script: await ref('script.json'), storyboard: await ref('storyboard.json'), narration: await ref('narration.wav'), timestamps: await ref('timestamps.json'), brand: await ref('brand.json'), mix: await ref('mix.json')}, assets: [
    {asset_id: 'fixture_font', kind: 'font', file: await ref('font.woff2'), provenance: '@fontsource/inter 5.3.0', usage_rights: fontLicenseText},
    {asset_id: 'fixture_still', kind: 'still', file: await ref('still.png'), provenance: 'Locally generated geometric fixture; no provider requests', usage_rights: 'Project-generated test artwork'},
    {asset_id: 'fixture_music', kind: 'audio', file: await ref('music.wav'), provenance: 'Locally synthesized sine-wave test bed', usage_rights: 'Project-generated test audio'},
  ], limits: {max_operation_attempts: 8, max_runtime_seconds: 300, max_input_bytes: 50_000_000, max_output_bytes: 100_000_000, max_frames: 3600, concurrency: 1}});
  await writeJson(resolve(dir, 'job.json'), job);
  await writeFile(resolve(dir, 'fixture-info.txt'), speech ? 'OS speech synthesized per word; boundaries measured from the actual concatenated audio chunks. This is a technical fixture, not production narration.\n' : 'Synthetic tone fixture. Timed word labels exercise contracts but are not spoken narration. Not a quality or speech-alignment qualification.\n');
  return {directory: dir, job: resolve(dir, 'job.json'), speech, duration_seconds: target};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {out: {type: 'string'}, speech: {type: 'boolean', default: false}}});
  createFixture(values.out, values.speech).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((err: unknown) => {
    const reason = err instanceof Error ? `: ${err.message}` : '';
    process.stderr.write(`Fixture creation failed${reason}; ffmpeg/ffprobe and, for --speech, macOS say are required.\n`);
    process.exitCode = 1;
  });
}
