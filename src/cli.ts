import {mkdir, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {compose} from './compose.ts';
import {DEFAULT_SIZE_LIMIT_BYTES, renderComposition} from './render.ts';

const USAGE = 'Usage: studio compose --input <story dir> --project <new dir>\n       studio render --input <story dir> --out <dir> [--max-mib 15]\n\nA story dir holds story.json, sound.json, plates/plates.json and audio/{audio.json,timing.json}.';

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const {values} = parseArgs({args: rest, options: {input: {type: 'string'}, project: {type: 'string'}, out: {type: 'string'}, 'max-mib': {type: 'string'}}});
  if (!values.input || (command !== 'compose' && command !== 'render')) throw new Error(USAGE);
  const input = resolve(values.input);
  if (command === 'compose') {
    if (!values.project) throw new Error(USAGE);
    const result = await compose(input, resolve(values.project));
    return {status: 'composed', project: result.project, duration_seconds: result.timeline.duration, audio_clips: result.clips.length};
  }
  if (!values.out) throw new Error(USAGE);
  const out = resolve(values.out);
  const project = join(out, 'project');
  await rm(project, {recursive: true, force: true});
  await mkdir(project, {recursive: true});
  const started = Date.now();
  const {timeline, clips} = await compose(input, project);
  const limit = values['max-mib'] ? Number(values['max-mib']) * 1024 * 1024 : DEFAULT_SIZE_LIMIT_BYTES;
  const final = join(out, 'final.mp4');
  const qa = await renderComposition(project, final, timeline.duration, timeline.fps, limit);
  return {status: qa.all_checks_passed ? 'rendered' : 'rendered_with_failed_checks', final, duration_seconds: timeline.duration, audio_clips: clips.length, render_seconds: Math.round((Date.now() - started) / 1000), qa};
}

main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), (error: unknown) => {
  process.stdout.write(`${JSON.stringify({ok: false, error: error instanceof Error ? error.message : String(error)})}\n`);
  process.exitCode = 1;
});
