import {mkdir, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {packageRoot} from './render.ts';
import {sha256} from './files.ts';
import {modeApiVersion} from './modes/mode.ts';
import {requireCondition} from './errors.ts';
import {runTool} from './process.ts';

const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const EXCLUDED_EXTENSIONS = new Set(['.mp4', '.mov', '.mp3', '.wav', '.aac', '.m4a', '.png', '.jpg', '.jpeg', '.webp']);
const SENSITIVE_PATTERN = /(Bearer\s+[A-Za-z0-9._~+/-]+)|(xi-api-key["'\s:]+[A-Za-z0-9_-]+)|(nvapi-[A-Za-z0-9_-]+)|(sk-[A-Za-z0-9_-]+)|(AKIA[0-9A-Z]{16})|(\b[a-zA-Z0-9_-]{32,64}\b(?=.*(?:secret|key|token|password)))/gi;
const PATH_PATTERN = /\/(Users|home)\/[a-zA-Z0-9._-]+/g;

export type DiagnosticsOptions = {
  jobId?: string;
  out?: string;
  workDir?: string;
};

export type DiagnosticsReport = {
  status: 'diagnostics_exported';
  bundlePath: string;
  sha256: string;
  sizeBytes: number;
  entriesCount: number;
  filesIncluded: string[];
  filesOmitted: string[];
};

export function sanitizeText(text: string): string {
  return text
    .replace(SENSITIVE_PATTERN, '[REDACTED_SECRET]')
    .replace(PATH_PATTERN, '/[REDACTED_PATH]');
}

export async function exportDiagnostics(options: DiagnosticsOptions = {}): Promise<DiagnosticsReport> {
  const root = packageRoot;
  const work = options.workDir ? resolve(options.workDir) : resolve(root, 'work');
  const targetDir = options.out ? resolve(options.out) : resolve(work, 'diagnostics');
  await mkdir(targetDir, {recursive: true, mode: 0o700});

  let ffmpegVersion = 'unavailable';
  let ffprobeVersion = 'unavailable';
  try {
    const raw = await runTool('ffmpeg', ['-version']);
    ffmpegVersion = raw.split('\n')[0]?.trim() ?? 'unknown';
  } catch { /* ffmpeg missing */ }

  try {
    const raw = await runTool('ffprobe', ['-version']);
    ffprobeVersion = raw.split('\n')[0]?.trim() ?? 'unknown';
  } catch { /* ffprobe missing */ }

  let pkgVersion = '1.1.1';
  try {
    const rawPkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {version?: string};
    if (rawPkg.version) pkgVersion = rawPkg.version;
  } catch { /* ignore */ }

  const environmentRecord = {
    type: 'environment',
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    studio_version: pkgVersion,
    mode_api_version: modeApiVersion,
    ffmpeg: ffmpegVersion,
    ffprobe: ffprobeVersion,
  };

  const records: Record<string, unknown>[] = [environmentRecord];
  const filesIncluded: string[] = ['environment'];
  const filesOmitted: string[] = [];

  if (options.jobId) {
    const safeJobId = options.jobId.replace(/[^a-zA-Z0-9_-]/g, '');
    requireCondition(safeJobId.length > 0, 'USAGE', 'Invalid job id for diagnostics');
    const jobDir = resolve(work, safeJobId);

    try {
      const entries = await readdir(jobDir, {withFileTypes: true});
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (EXCLUDED_EXTENSIONS.has(ext) || entry.name.includes('secret') || entry.name.endsWith('.env')) {
          filesOmitted.push(entry.name);
          continue;
        }

        const fullPath = join(jobDir, entry.name);
        const stats = await stat(fullPath);
        if (stats.size > 512 * 1024) {
          filesOmitted.push(`${entry.name} (exceeds 512 KB)`);
          continue;
        }

        const raw = await readFile(fullPath, 'utf8');
        let parsed: unknown = raw;
        if (ext === '.json') {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
        }

        records.push({
          type: 'job_file',
          name: entry.name,
          sha256: sha256(raw),
          size_bytes: stats.size,
          content: typeof parsed === 'string' ? sanitizeText(parsed) : parsed,
        });
        filesIncluded.push(entry.name);
      }
    } catch {
      records.push({
        type: 'job_diagnostic_warning',
        warning: `Job directory ${safeJobId} not found or unreadable under work/`,
      });
    }
  }

  const lines = records.map(r => sanitizeText(JSON.stringify(r))).join('\n') + '\n';
  requireCondition(Buffer.byteLength(lines, 'utf8') <= MAX_BUNDLE_BYTES, 'DIAGNOSTICS_TOO_LARGE', 'Support bundle exceeds 10 MiB limit');

  const bundleFilename = `support-bundle-${Date.now()}.jsonl`;
  const bundlePath = resolve(targetDir, bundleFilename);
  await writeFile(bundlePath, lines, {mode: 0o600});

  const bundleBytes = await readFile(bundlePath);
  return {
    status: 'diagnostics_exported',
    bundlePath,
    sha256: sha256(bundleBytes),
    sizeBytes: bundleBytes.length,
    entriesCount: records.length,
    filesIncluded,
    filesOmitted,
  };
}
