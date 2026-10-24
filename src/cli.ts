import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {loadAnyJob} from './jobs.ts';
import {StudioError, requireCondition} from './errors.ts';
import {executeJob, verifyArtifacts} from './runner.ts';
import {sourceProvenance} from './provenance.ts';
import {schemas} from './schemas.ts';
import {generatePlates} from './plates.ts';
import {createMockImageProvider} from './imagegen/mock.ts';
import {createNimFluxProvider} from './imagegen/nim-flux.ts';
import {resolveSecret} from './imagegen/credentials.ts';
import {previewShots, previewStory} from './modes/isometric-art-zombie-apocalypse/preview.ts';
import {generateAudio} from './audio.ts';
import {packageStory} from './modes/isometric-art-zombie-apocalypse/package.ts';
import {createElevenLabsProvider} from './audiogen/elevenlabs.ts';
import {createMockAudioProvider} from './audiogen/mock.ts';

function sanitizeIssues(issues: z.ZodIssue[]): {path: string; code: string}[] {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
  }));
}

function sanitizeDetails(details: unknown): unknown {
  if (Array.isArray(details)) {
    return details.map(item => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const path = Array.isArray(obj.path) ? obj.path.join('.') : typeof obj.path === 'string' ? obj.path : undefined;
        const code = typeof obj.code === 'string' ? obj.code : 'invalid_field';
        return {path, code};
      }
      return item;
    });
  }
  return details;
}

async function main() {
  const {positionals, values} = parseArgs({allowPositionals: true, options: {job: {type: 'string'}, out: {type: 'string'}, 'visual-manifest': {type: 'string'}, result: {type: 'string'}, plates: {type: 'string'}, shots: {type: 'string'}, story: {type: 'string'}, timing: {type: 'string'}, 'stills-only': {type: 'boolean'}, provider: {type: 'string'}, only: {type: 'string'}, sound: {type: 'string'}, audio: {type: 'string'}, 'job-id': {type: 'string'}}});
  const command = positionals[0];
  if (command === 'generate-plates') {
    requireCondition(values.plates && values.out, 'USAGE', 'generate-plates requires --plates <plates.json> --out <external directory> [--provider nim|mock] [--only id,id]');
    requireCondition(!values.provider || values.provider === 'nim' || values.provider === 'mock', 'USAGE', 'Supported image providers: nim, mock');
    const provider = values.provider === 'mock' ? createMockImageProvider() : createNimFluxProvider(await resolveSecret('NVIDIA_NIM'));
    return generatePlates({plates: values.plates, out: values.out, provider, only: values.only?.split(',').filter(Boolean)});
  }
  if (command === 'preview-shots') {
    requireCondition(values.shots && values.plates && values.out, 'USAGE', 'preview-shots requires --shots <shots.json> --plates <plates directory> --out <empty external directory>');
    return previewShots({shots: values.shots, plates: values.plates, out: values.out});
  }
  if (command === 'preview-story') {
    requireCondition(values.story && values.plates && values.out, 'USAGE', 'preview-story requires --story <story.json> --plates <plates directory> --out <empty external directory> [--timing <segment-timing.json>] [--stills-only]');
    return previewStory({story: values.story, plates: values.plates, timing: values.timing, out: values.out, stillsOnly: values['stills-only']});
  }
  if (command === 'generate-audio') {
    requireCondition(values.story && values.sound && values.out, 'USAGE', 'generate-audio requires --story <story.json> --sound <sound.json> --out <external directory> [--provider elevenlabs|mock]');
    requireCondition(!values.provider || values.provider === 'elevenlabs' || values.provider === 'mock', 'USAGE', 'Supported audio providers: elevenlabs, mock');
    const provider = values.provider === 'mock' ? createMockAudioProvider() : createElevenLabsProvider(await resolveSecret('ELEVENLABS'));
    return generateAudio({story: values.story, sound: values.sound, out: values.out, provider});
  }
  if (command === 'package-story') {
    requireCondition(values.story && values.sound && values.plates && values.audio && values.out, 'USAGE', 'package-story requires --story <story.json> --sound <sound.json> --plates <plates directory> --audio <audio directory> --out <empty job directory> [--job-id id]');
    return packageStory({story: values.story, sound: values.sound, plates: values.plates, audio: values.audio, out: values.out, jobId: values['job-id']});
  }
  if (command === 'schemas') return {schema_version: '1.0', schemas: schemas()};
  if (command === 'catalog') return JSON.parse(await readFile(new URL('../catalog/components.json', import.meta.url), 'utf8'));
  if (command === 'verify') {
    requireCondition(values.result, 'USAGE', 'verify requires --result <output directory>');
    return {status: 'verified', result: await verifyArtifacts(values.result)};
  }
  requireCondition(values.job, 'USAGE', 'Commands: validate, compile, preview, render, finish, run --job <job.json> [--out <external store>]; generate-plates; generate-audio; package-story; preview-shots; preview-story; catalog; schemas; verify --result <directory>');
  if (command === 'validate' || command === 'compile') {
    const loaded = await loadAnyJob(values.job);
    return {status: 'validated', job_id: loaded.job.job_id, adapter: loaded.job.adapter, input_hash: loaded.inputHash, timeline: command === 'compile' ? loaded.timeline : undefined, source: await sourceProvenance()};
  }
  requireCondition(command === 'preview' || command === 'render' || command === 'finish' || command === 'run', 'USAGE', 'Unknown studio command');
  requireCondition(values.out, 'USAGE', 'Rendering commands require --out <external output store>');
  return executeJob(values.job, values.out, command, values['visual-manifest']);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(`${JSON.stringify({ok: true, ...result})}\n`)).catch((error: unknown) => {
    const known = error instanceof StudioError;
    const isZod = error instanceof z.ZodError;
    const code = known ? error.code : isZod ? 'INVALID_CONTRACT' : 'EXECUTION_FAILED';
    const message = known ? error.message : isZod ? 'Document does not match schema 1.0' : 'Operation failed; check input files and configured local tools';
    const details = known
      ? (code === 'INVALID_CONTRACT' ? sanitizeDetails(error.details) : error.details)
      : isZod
        ? sanitizeIssues(error.issues)
        : undefined;
    process.stdout.write(`${JSON.stringify({ok: false, error: {code, message, details}})}\n`);
    process.exitCode = 1;
  });
}
