import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {defineMode, loadJobFiles, modeJobSchema, readJson, renderComposition, requireCondition, runTool, sha256, writeJson} from '../../src/mode-api.ts';

const id = 'example-title-card';
const folder = `local-modes/${id}`;
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const JobSchema = modeJobSchema(id, ['card'], ['audio']);
const CardSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  title: z.string().min(1).max(60),
  subtitle: z.string().max(80),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  duration_seconds: z.number().min(1).max(60),
});

async function load(manifestPath: string) {
  const files = await loadJobFiles(manifestPath, JobSchema);
  const card = await readJson(files.paths.card, CardSchema);
  const {fps, duration_seconds} = files.job.format;
  requireCondition(Math.abs(card.duration_seconds - duration_seconds) < 1e-6, 'TIMING_CONFLICT', 'The card and the job disagree on duration');
  const durationInFrames = Math.round(duration_seconds * fps);
  requireCondition(durationInFrames <= files.job.limits.max_frames, 'FRAME_LIMIT', 'Job exceeds the configured frame allowance');
  return {...files, mode: id, card, timeline: {schema_version: '1.0', job_id: files.job.job_id, mode: id, fps, durationInFrames}};
}

export default defineMode<Awaited<ReturnType<typeof load>>>({
  api: 1,
  card: {
    id,
    title: 'Example title card',
    role: 'specialised',
    summary: 'A single animated title card over a solid colour, with a silent soundtrack. A starting point for new modes, not a production mode.',
    use_when: ['testing that a new local mode renders end to end'],
    not_for: ['any real request'],
    aspect: '9:16',
    duration_seconds: {min: 1, max: 60},
    inputs: ['card (title, subtitle, colours, duration)'],
    skill: `${folder}/skill.md`,
    templates: [`${folder}/card.template.json`],
    commands: ['run', 'verify'],
  },
  load,
  runtime: loaded => ({
    renderVisual: async (dir, kind, deadline) => {
      const publicDir = resolve(dir, 'public');
      await mkdir(publicDir, {recursive: true});
      const scale = kind === 'preview' ? 0.5 : 1;
      const {durationInFrames, fps} = loaded.timeline;
      const size = await renderComposition({
        entryPoint: here('rendering/entry.tsx'),
        composition: 'ExampleTitleCard',
        inputProps: {card: loaded.card, durationInFrames, fps},
        publicDir,
        workDir: dir,
        video: {path: resolve(dir, 'visual.mp4'), scale},
        stills: [{name: 'title.png', frame: Math.floor(durationInFrames / 2), scale: 0.25, format: 'png'}],
        deadline,
      });
      return {video: 'visual.mp4', thumbnails: ['title.png'], width: size.width * scale, height: size.height * scale};
    },
    finish: async (visual, dir, deadline) => {
      await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', visual, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', resolve(dir, 'final.mp4')], deadline - Date.now());
      return {video: 'final.mp4', artifacts: []};
    },
  }),
  fixture: async dir => {
    const card = `${JSON.stringify({schema_version: '1.0', title: 'Hello from a local mode', subtitle: 'Rendered by the conformance check', background: '#101820', accent: '#f2aa4c', duration_seconds: 3}, null, 2)}\n`;
    await writeFile(resolve(dir, 'card.json'), card);
    const job = resolve(dir, 'job.json');
    await writeJson(job, {
      schema_version: '1.0', adapter: 'local-fixture', mode: id, job_id: 'example-title-card-fixture', status: 'approved_for_visual_production',
      format: {width: 1080, height: 1920, fps: 30, duration_seconds: 3, codec: 'h264', container: 'mp4'},
      inputs: {card: {path: 'card.json', sha256: sha256(card)}},
      assets: [],
      limits: {max_operation_attempts: 3, max_runtime_seconds: 600, max_input_bytes: 1_000_000, max_output_bytes: 100_000_000, max_frames: 90, concurrency: 1},
    });
    return job;
  },
});
