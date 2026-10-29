import {localEnvExists} from './generation-backend.ts';
import {access, mkdir, readdir, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {hostname} from 'node:os';
import {resolve} from 'node:path';
import {isWithin} from './files.ts';
import {resolveSecret} from './imagegen/credentials.ts';
import {runToolCapture} from './process.ts';
import {packageRoot} from './render.ts';
import {registry, type Registry} from './modes/registry.ts';
import {pruneScratch} from './prune.ts';
import {flockBinary} from './lock.ts';
import {probeWebgl} from './webgl-probe.ts';

export type DoctorCheck = {check_id: string; pass: boolean; required: boolean; detail: string};

export const minimumNode = [24, 5] as const;
export const ffmpegFilters = ['adelay', 'aecho', 'afade', 'aformat', 'alimiter', 'aloop', 'amix', 'apad', 'aresample', 'asetpts', 'asetrate', 'asoftclip', 'asplit', 'atempo', 'atrim', 'acompressor', 'blackdetect', 'concat', 'drawbox', 'highpass', 'loudnorm', 'lowpass', 'scale', 'sidechaincompress', 'silencedetect', 'silenceremove', 'sine', 'tile', 'volume'];
export const ffmpegEncoders = ['aac', 'mjpeg', 'png'];
export const providerKeys = ['NVIDIA_NIM', 'ELEVENLABS'];
/** OpenMausBot's bot box names its sandbox host this (server/bot-box/plan.ts). */
const boxHostname = 'omb-box';

export function nodeSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > minimumNode[0] || (major === minimumNode[0] && minor >= minimumNode[1]);
}

/** Lists the names ffmpeg prints in a `-filters` or `-encoders` table, whose rows are `<flags> <name> <description>`. */
export function ffmpegTableNames(table: string): Set<string> {
  const names = new Set<string>();
  for (const line of table.split('\n')) {
    const match = /^\s*[A-Z.|]{2,8}\s+([A-Za-z0-9_]+)\s/.exec(line);
    if (match) names.add(match[1]!);
  }
  return names;
}

export function proxyCheck(env: NodeJS.ProcessEnv, execArgv: readonly string[]): DoctorCheck {
  const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (!proxy) return {check_id: 'egress_proxy', pass: true, required: true, detail: 'no proxy configured; direct network'};
  const honoured = env.NODE_USE_ENV_PROXY === '1' || execArgv.includes('--use-env-proxy');
  return {check_id: 'egress_proxy', pass: honoured, required: true, detail: honoured ? 'proxy from the environment is used' : 'a proxy is set but Node ignores it; run through `pnpm studio` (which passes --use-env-proxy) or set NODE_USE_ENV_PROXY=1'};
}

async function toolCheck(binary: string): Promise<{present: boolean; version: string}> {
  try {
    const {stdout} = await runToolCapture(binary, ['-hide_banner', '-version'], 10_000);
    return {present: true, version: stdout.split('\n')[0] ?? ''};
  } catch {
    return {present: false, version: ''};
  }
}

async function ffmpegChecks(): Promise<DoctorCheck[]> {
  const ffmpeg = await toolCheck('ffmpeg');
  const ffprobe = await toolCheck('ffprobe');
  const checks: DoctorCheck[] = [
    {check_id: 'ffmpeg', pass: ffmpeg.present, required: true, detail: ffmpeg.present ? ffmpeg.version : 'ffmpeg is not on PATH; it must come from the host image'},
    {check_id: 'ffprobe', pass: ffprobe.present, required: true, detail: ffprobe.present ? ffprobe.version : 'ffprobe is not on PATH; it must come from the host image'},
  ];
  if (!ffmpeg.present) return checks;
  const filters = ffmpegTableNames((await runToolCapture('ffmpeg', ['-hide_banner', '-filters'], 10_000)).stdout);
  const encoders = ffmpegTableNames((await runToolCapture('ffmpeg', ['-hide_banner', '-encoders'], 10_000)).stdout);
  const missingFilters = ffmpegFilters.filter(name => !filters.has(name));
  const missingEncoders = ffmpegEncoders.filter(name => !encoders.has(name));
  checks.push(
    {check_id: 'ffmpeg_filters', pass: missingFilters.length === 0, required: true, detail: missingFilters.length ? `missing: ${missingFilters.join(', ')}` : `${ffmpegFilters.length} required filters present`},
    {check_id: 'ffmpeg_encoders', pass: missingEncoders.length === 0, required: true, detail: missingEncoders.length ? `missing: ${missingEncoders.join(', ')}` : `${ffmpegEncoders.join(', ')} present`},
  );
  return checks;
}

async function dependencyCheck(root: string): Promise<DoctorCheck> {
  try {
    const resolved = await realpath(resolve(root, 'node_modules/@remotion/renderer'));
    const inside = isWithin(root, resolved);
    return {check_id: 'dependencies', pass: inside, required: true, detail: inside ? 'installed inside the studio' : 'dependencies resolve outside the studio; run pnpm install --frozen-lockfile in the studio'};
  } catch {
    return {check_id: 'dependencies', pass: false, required: true, detail: 'not installed; run pnpm install --frozen-lockfile in the studio'};
  }
}

async function browserCheck(root: string): Promise<DoctorCheck> {
  const cache = resolve(root, 'node_modules/.remotion');
  const entries = await readdir(cache).catch(() => [] as string[]);
  const present = entries.some(name => name.startsWith('chrome-headless-shell'));
  return {check_id: 'render_browser', pass: present, required: true, detail: present ? 'Remotion headless browser is installed' : 'not installed; run pnpm studio prepare-browser once'};
}

async function workCheck(root: string): Promise<DoctorCheck> {
  const work = resolve(root, 'work');
  const probe = resolve(work, `.doctor-${process.pid}`);
  try {
    await mkdir(work, {recursive: true, mode: 0o700});
    await writeFile(probe, 'probe', {flag: 'wx', mode: 0o600});
    await rm(probe);
    return {check_id: 'work_folder', pass: true, required: true, detail: 'work/ is writable'};
  } catch {
    return {check_id: 'work_folder', pass: false, required: true, detail: 'work/ is not writable'};
  }
}

async function webglCheck(root: string): Promise<{check: DoctorCheck; budget: number}> {
  const result = await probeWebgl(root);
  const detail = result.verdict === 'unavailable'
    ? `WebGL benchmark unavailable (${result.renderer}); treat the WebGL budget as 0`
    : `${result.renderer}: ${result.ms_per_frame} ms per benchmark frame, ${result.verdict}; WebGL scene budget ${result.webgl_budget} (iso chart, orbit, logos)`;
  return {check: {check_id: 'webgl', pass: result.verdict !== 'unavailable', required: false, detail}, budget: result.webgl_budget};
}

async function scratchCheck(root: string): Promise<DoctorCheck> {
  const work = resolve(root, 'work');
  try {
    const report = await pruneScratch({workDir: work, maxAgeMs: 48 * 3600 * 1000, dryRun: true});
    const bytesMb = (report.pruned_bytes / (1024 * 1024)).toFixed(1);
    return {
      check_id: 'scratch_retention',
      pass: true,
      required: false,
      detail: report.candidates.length
        ? `${report.candidates.length} scratch folders older than 48h (${bytesMb} MB) eligible for pruning`
        : 'scratch disk clean; no directories older than 48h',
    };
  } catch {
    return {check_id: 'scratch_retention', pass: true, required: false, detail: 'unable to inspect scratch disk'};
  }
}

async function credentialChecks(root: string): Promise<DoctorCheck[]> {
  const envFile = resolve(root, 'local.env');
  const checks: DoctorCheck[] = [];
  if (!await localEnvExists(root)) checks.push({check_id: 'generation_backend', pass: false, required: false, detail: 'No local.env: generation selects openmausbot-generation-v1-generate; AWS CLI, scoped credentials, --job-id and provider setup required; not verified by doctor'});
  for (const name of providerKeys) {
    const configured = await resolveSecret(name, envFile).then(() => true, () => false);
    checks.push({check_id: `key_${name}`, pass: configured, required: false, detail: configured ? 'configured' : 'not configured; needed only for generate-* with the real provider'});
  }
  const info = await stat(envFile).catch(() => null);
  if (info) {
    const privateFile = (info.mode & 0o077) === 0;
    checks.push({check_id: 'local_env_private', pass: privateFile, required: true, detail: privateFile ? 'local.env is readable by its owner only' : `local.env mode is ${(info.mode & 0o777).toString(8)}; run chmod 600 local.env`});
  }
  return checks;
}

export function modeChecks(current: Registry): DoctorCheck[] {
  const local = current.modes.filter(mode => mode.source === 'local').map(mode => mode.card.id);
  return [
    {check_id: 'mode_ids', pass: current.collisions.length === 0, required: true, detail: current.collisions.length ? `local modes share an id with a shipped mode: ${current.collisions.join(', ')}; rename them` : 'no local mode shares an id with a shipped mode'},
    {check_id: 'local_modes', pass: current.unavailable.length === 0, required: false, detail: current.unavailable.length ? current.unavailable.map(m => `${m.id}: ${m.reason}`).join('; ') : local.length ? `available: ${local.join(', ')}` : 'none'},
  ];
}

/** Commands and guarantees this release offers; the host refuses to rely on ones a studio does not list. */
export function capabilities(): string[] {
  return ['unlock', 'clean', 'fresh', ...(flockBinary() ? ['flock-lock'] : [])];
}

export async function doctor(root = packageRoot, current: Registry = registry) {
  const canonical = await realpath(root);
  const webgl = await webglCheck(canonical);
  const checks: DoctorCheck[] = [
    {check_id: 'node', pass: nodeSupported(process.versions.node), required: true, detail: `Node ${process.versions.node}; needs ${minimumNode.join('.')} or later`},
    proxyCheck(process.env, process.execArgv),
    ...await ffmpegChecks(),
    await dependencyCheck(canonical),
    await browserCheck(canonical),
    await workCheck(canonical),
    await scratchCheck(canonical),
    webgl.check,
    ...await credentialChecks(canonical),
    ...modeChecks(current),
  ];
  await access(resolve(canonical, 'package.json'));
  const ready = checks.every(check => check.pass || !check.required);
  return {status: ready ? 'ready' as const : 'not_ready' as const, bot_box: hostname() === boxHostname, studio: canonical, capabilities: capabilities(), webgl_budget: webgl.budget, checks};
}
