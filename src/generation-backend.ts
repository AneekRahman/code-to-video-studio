import {execFile} from 'node:child_process';
import {lstat, mkdir, mkdtemp, readFile, stat, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {z} from 'zod';
import {StudioError, requireCondition} from './errors.ts';
import {sha256} from './files.ts';
import {packageRoot} from './render.ts';
import {detectRasterFormat, type ImageProvider} from './imagegen/provider.ts';
import {isMp3, type AudioProvider} from './audiogen/provider.ts';
import type {SourceArtifact} from './generation-source.ts';

const exec = promisify(execFile);
const maxBytes = 24 * 1024 * 1024;
const Pointer = z.object({bucket: z.string().min(1), key: z.string().startsWith('assets/'), version_id: z.string().min(1).refine(v => v !== 'null'), sha256: z.string().regex(/^[a-f0-9]{64}$/), content_type: z.enum(['image/png', 'image/jpeg', 'audio/mpeg', 'application/json'])});
const Receipt = z.object({ok: z.literal(true), status: z.literal('COMPLETE'), operation: z.string(), artifacts: z.array(Pointer).min(1).max(2)});
const Timing = z.object({characters: z.array(z.string().length(1)).min(1), character_start_times_seconds: z.array(z.number().finite().nonnegative()), character_end_times_seconds: z.array(z.number().finite().nonnegative())});
type Payload = {operation: 'image' | 'speech' | 'effect' | 'music'; text: string; seed?: number; duration_seconds?: number};
export type BackendTransport = (payload: Record<string, unknown>, signal: AbortSignal) => Promise<{receipt: unknown; download: (pointer: SourceArtifact) => Promise<Buffer>; close?: () => Promise<void>}>;

export async function localEnvExists(root = packageRoot): Promise<boolean> {
  try { await lstat(resolve(root, 'local.env')); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new StudioError('CONFIG_REQUIRED', 'Cannot inspect local.env; fix access before choosing a generation route');
  }
}

async function aws(args: string[], signal: AbortSignal): Promise<void> {
  try { await exec('aws', [...args, '--cli-connect-timeout', '10', '--cli-read-timeout', '260', '--region', process.env.STUDIO_GENERATION_REGION ?? 'us-east-1', '--output', 'json'], {signal, env: {...process.env, AWS_MAX_ATTEMPTS: '1', AWS_PAGER: ''}, maxBuffer: 1024 * 1024}); }
  catch { throw new StudioError(signal.aborted ? 'DEADLINE_EXCEEDED' : 'CONFIG_REQUIRED', 'Generation backend unavailable or production environment not configured. Check AWS CLI, scoped AWS credentials/profile, Lambda access and backend setup. Do not retry uncertain work automatically.'); }
}

const awsTransport: BackendTransport = async (payload, signal) => {
  const work = resolve(packageRoot, 'work');
  await mkdir(work, {recursive: true, mode: 0o700});
  const directory = await mkdtemp(resolve(work, '.generation-'));
  const close = () => rm(directory, {recursive: true, force: true});
  try {
    const request = resolve(directory, 'request.json');
    const response = resolve(directory, 'receipt.json');
    await writeFile(request, JSON.stringify(payload), {mode: 0o600});
    await aws(['lambda', 'invoke', '--function-name', process.env.STUDIO_GENERATION_FUNCTION ?? 'openmausbot-generation-v1-generate', '--invocation-type', 'RequestResponse', '--payload', `fileb://${request}`, response], signal);
    const receipt: unknown = JSON.parse(await readFile(response, 'utf8'));
    let index = 0;
    return {receipt, close, async download(pointer) {
      const file = resolve(directory, `asset-${index++}`);
      await aws(['s3api', 'get-object', '--bucket', pointer.bucket, '--key', pointer.key, '--version-id', pointer.version_id, file], signal);
      requireCondition((await stat(file)).size <= maxBytes, 'PROVIDER_PROTOCOL', 'Backend artifact exceeds download limits');
      return readFile(file);
    }};
  } catch (error) { await close(); throw error; }
};

export function createBackendProviders(jobId: string, transport: BackendTransport = awsTransport): {image: ImageProvider; audio: AudioProvider} {
  requireCondition(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(jobId), 'CONFIG_REQUIRED', 'Backend generation requires --job-id with 1–64 letters, digits, underscores or hyphens');
  async function call(payload: Payload, signal: AbortSignal) {
    requireCondition(payload.text.trim().length > 0 && payload.text.length <= (payload.operation === 'speech' ? 1500 : 1000), 'UNSUPPORTED_BACKEND_REQUEST', 'Prompt exceeds generation backend limits');
    if (payload.seed !== undefined) requireCondition(Number.isInteger(payload.seed) && payload.seed >= 0 && payload.seed <= 858993459, 'UNSUPPORTED_BACKEND_REQUEST', 'Backend seed must be 0–858993459');
    if (payload.duration_seconds !== undefined) requireCondition(Number.isFinite(payload.duration_seconds) && payload.duration_seconds >= 3 && payload.duration_seconds <= (payload.operation === 'effect' ? 10 : 30), 'UNSUPPORTED_BACKEND_REQUEST', 'Backend effects support 3–10 seconds; music supports 3–30 seconds');
    const event = {action: 'generate', job_id: jobId, request_id: sha256(JSON.stringify(payload)), ...payload};
    const result = await transport(event, signal);
    try {
      const parsed = Receipt.safeParse(result.receipt);
      if (!parsed.success) {
        const code = z.object({code: z.string().regex(/^[A-Z_]{1,64}$/)}).safeParse(result.receipt);
        throw new StudioError(code.success ? code.data.code : 'PROVIDER_PROTOCOL', 'Generation backend did not complete. Check production setup and the saved backend request before any manual retry; no automatic retry was made.');
      }
      requireCondition(parsed.data.operation === payload.operation && parsed.data.artifacts.length === (payload.operation === 'speech' ? 2 : 1), 'PROVIDER_PROTOCOL', 'Backend receipt does not match the requested operation');
      const assets = [];
      for (const pointer of parsed.data.artifacts) {
        const bytes = await result.download(pointer);
        requireCondition(bytes.length <= maxBytes && sha256(bytes) === pointer.sha256, 'INPUT_CHANGED', 'Backend artifact hash does not match its pinned S3 version');
        assets.push({pointer, bytes});
      }
      return assets;
    } finally { await result.close?.(); }
  }
  return {
    image: {
      provider_id: 'openmausbot-generation', model: 'nim-first-nova-canvas-fallback', max_prompt_chars: 1000,
      validateSize(width, height) { requireCondition(width === 1024 && height === 1024, 'UNSUPPORTED_SIZE', 'Generation backend supports 1024×1024 images only'); },
      async generate(request, signal) {
        this.validateSize(request.width, request.height);
        const started = Date.now();
        const assets = await call({operation: 'image', text: request.prompt, seed: request.seed}, signal);
        const format = detectRasterFormat(assets[0]!.bytes);
        requireCondition(format && assets[0]!.pointer.content_type === (format === 'png' ? 'image/png' : 'image/jpeg'), 'PROVIDER_PROTOCOL', 'Backend image format is invalid');
        return {bytes: assets[0]!.bytes, format, seed: request.seed, provider_request_ms: Date.now() - started, source_artifacts: assets.map(a => a.pointer)};
      },
    },
    audio: {
      provider_id: 'openmausbot-generation', models: {speech_default: 'eleven_multilingual_v2', effect: 'eleven_text_to_sound_v2', music: 'music_v1'},
      async speak(request, signal) {
        requireCondition(request.voice_id === 'backendconfigured' && request.model === 'eleven_multilingual_v2' && Object.keys(request.settings ?? {}).length === 0, 'UNSUPPORTED_BACKEND_REQUEST', 'Backend speech requires voice_id backendconfigured, model eleven_multilingual_v2 and no voice settings; it uses the service-configured voice');
        const started = Date.now();
        const assets = await call({operation: 'speech', text: request.text, seed: request.seed}, signal);
        requireCondition(assets[0]!.pointer.content_type === 'audio/mpeg' && isMp3(assets[0]!.bytes) && assets[1]!.pointer.content_type === 'application/json', 'PROVIDER_PROTOCOL', 'Backend speech artifacts are invalid');
        const value = Timing.parse(JSON.parse(assets[1]!.bytes.toString('utf8')));
        requireCondition(value.characters.join('') === request.text && value.characters.length === value.character_start_times_seconds.length && value.characters.length === value.character_end_times_seconds.length, 'PROVIDER_PROTOCOL', 'Backend speech alignment does not match the script');
        let previous = 0;
        value.character_start_times_seconds.forEach((start, i) => { requireCondition(start >= previous && value.character_end_times_seconds[i]! >= start, 'PROVIDER_PROTOCOL', 'Backend speech timing is invalid'); previous = start; });
        return {bytes: assets[0]!.bytes, alignment: {characters: value.characters, starts: value.character_start_times_seconds, ends: value.character_end_times_seconds}, provider_request_ms: Date.now() - started, source_artifacts: assets.map(a => a.pointer)};
      },
      async effect(request, signal) {
        requireCondition(!request.loop && request.prompt_influence === 0.3, 'UNSUPPORTED_BACKEND_REQUEST', 'Backend effects require loop false and prompt_influence 0.3');
        const started = Date.now();
        const assets = await call({operation: 'effect', text: request.prompt, duration_seconds: request.duration_seconds}, signal);
        requireCondition(assets[0]!.pointer.content_type === 'audio/mpeg' && isMp3(assets[0]!.bytes), 'PROVIDER_PROTOCOL', 'Backend effect is not MP3');
        return {bytes: assets[0]!.bytes, provider_request_ms: Date.now() - started, source_artifacts: assets.map(a => a.pointer)};
      },
      async music(request, signal) {
        const started = Date.now();
        const assets = await call({operation: 'music', text: request.prompt, duration_seconds: request.duration_seconds}, signal);
        requireCondition(assets[0]!.pointer.content_type === 'audio/mpeg' && isMp3(assets[0]!.bytes), 'PROVIDER_PROTOCOL', 'Backend music is not MP3');
        return {bytes: assets[0]!.bytes, provider_request_ms: Date.now() - started, source_artifacts: assets.map(a => a.pointer)};
      },
    },
  };
}
