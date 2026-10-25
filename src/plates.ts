import {mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readJson, sha256} from './files.ts';
import {StudioError, requireCondition} from './errors.ts';
import {runTool} from './process.ts';
import type {ImageProvider} from './imagegen/provider.ts';
import {PlateSetSchema, composePlatePrompt, type Plate} from './modes/isometric-art-zombie-apocalypse/style.ts';

export type PlateRecord = {
  source_artifacts?: import('./generation-source.ts').SourceArtifact[];
  plate_id: string;
  file: string;
  sha256: string;
  format: 'jpeg' | 'png';
  width: number;
  height: number;
  framing: Plate['framing'];
  phase: Plate['phase'];
  prompt: string;
  prompt_sha256: string;
  seed: number;
  provider_id: string;
  model: string;
  provider_request_ms: number;
  generated_at: string;
  usage_rights: string;
};

export type PlateManifest = {schema_version: '1.0'; mode: string; plates: PlateRecord[]};

const manifestName = 'plates.json';

async function readManifest(path: string): Promise<PlateManifest | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as PlateManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new StudioError('INVALID_CONTRACT', 'Existing plates.json is unreadable');
  }
}

function matchesRequest(record: PlateRecord, plate: Plate, prompt: string, provider: ImageProvider): boolean {
  return record.prompt_sha256 === sha256(prompt) && record.seed === plate.seed && record.width === plate.width && record.height === plate.height && record.model === provider.model && record.provider_id === provider.provider_id;
}

export async function generatePlates(options: {plates: string; out: string; provider: ImageProvider; only?: string[]; timeoutMs?: number}) {
  const set = await readJson(await realpath(resolve(options.plates)), PlateSetSchema);
  const ids = new Set<string>();
  for (const plate of set.plates) {
    requireCondition(!ids.has(plate.plate_id), 'DUPLICATE_ID', 'Plate ids must be unique');
    ids.add(plate.plate_id);
    options.provider.validateSize(plate.width, plate.height);
    requireCondition(composePlatePrompt(plate).length <= options.provider.max_prompt_chars, 'PROMPT_TOO_LONG', `Plate ${plate.plate_id} prompt exceeds the provider limit`);
  }
  for (const id of options.only ?? []) requireCondition(ids.has(id), 'MISSING_PLATE', `Unknown plate id ${id}`);

  const out = resolve(options.out);
  await mkdir(out, {recursive: true, mode: 0o700});
  const manifestPath = resolve(out, manifestName);
  const existing = await readManifest(manifestPath);
  requireCondition(!existing || existing.mode === set.mode, 'INVALID_CONTRACT', 'Output directory holds plates for a different mode');
  const records = new Map((existing?.plates ?? []).map(record => [record.plate_id, record]));
  const outcomes: {plate_id: string; status: 'reused' | 'generated' | 'refused'; reason?: string}[] = [];

  for (const plate of set.plates) {
    if (options.only && !options.only.includes(plate.plate_id)) continue;
    const prompt = composePlatePrompt(plate);
    const previous = records.get(plate.plate_id);
    if (previous && matchesRequest(previous, plate, prompt, options.provider)) {
      const bytes = await readFile(resolve(out, previous.file));
      requireCondition(sha256(bytes) === previous.sha256, 'INPUT_CHANGED', `Plate ${plate.plate_id} bytes no longer match the manifest`);
      outcomes.push({plate_id: plate.plate_id, status: 'reused'});
      continue;
    }
    const version = previous ? Number(/-v(\d+)\./.exec(previous.file)?.[1] ?? 1) + 1 : 1;
    const signal = AbortSignal.timeout(options.timeoutMs ?? 120_000);
    let image;
    try {
      image = await options.provider.generate({prompt, width: plate.width, height: plate.height, seed: plate.seed}, signal);
    } catch (error) {
      if (!(error instanceof StudioError) || error.code !== 'PROVIDER_REFUSED') throw error;
      outcomes.push({plate_id: plate.plate_id, status: 'refused', reason: error.message});
      continue;
    }
    const file = `${plate.plate_id}-v${version}.${image.format === 'jpeg' ? 'jpg' : 'png'}`;
    await writeFile(resolve(out, file), image.bytes, {flag: 'wx', mode: 0o600});
    records.set(plate.plate_id, {
      source_artifacts: image.source_artifacts,
      plate_id: plate.plate_id,
      file,
      sha256: sha256(image.bytes),
      format: image.format,
      width: plate.width,
      height: plate.height,
      framing: plate.framing,
      phase: plate.phase,
      prompt,
      prompt_sha256: sha256(prompt),
      seed: image.seed,
      provider_id: options.provider.provider_id,
      model: options.provider.model,
      provider_request_ms: image.provider_request_ms,
      generated_at: new Date().toISOString(),
      usage_rights: 'generated for this job; provider terms apply',
    });
    outcomes.push({plate_id: plate.plate_id, status: 'generated'});
    await writeManifest(manifestPath, {schema_version: '1.0', mode: set.mode, plates: [...records.values()]});
  }

  const manifest: PlateManifest = {schema_version: '1.0', mode: set.mode, plates: set.plates.map(p => records.get(p.plate_id)).filter((r): r is PlateRecord => Boolean(r))};
  await writeManifest(manifestPath, manifest);
  const contactSheet = await writeContactSheet(out, manifest.plates);
  return {status: outcomes.some(o => o.status === 'refused') ? 'plates_incomplete' : 'plates_ready', out, manifest: manifestName, contact_sheet: contactSheet, outcomes};
}

async function writeManifest(path: string, manifest: PlateManifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
}

async function writeContactSheet(out: string, plates: PlateRecord[]): Promise<string | null> {
  if (plates.length === 0) return null;
  const columns = Math.min(4, plates.length);
  const rows = Math.ceil(plates.length / columns);
  const cell = {w: 384, h: 672};
  const inputs = plates.flatMap(p => ['-i', resolve(out, p.file)]);
  const scaled = plates.map((_, i) => `[${i}:v]scale=${cell.w}:${cell.h}:force_original_aspect_ratio=decrease,pad=${cell.w}:${cell.h}:(ow-iw)/2:(oh-ih)/2:color=black[c${i}]`);
  const layout = plates.map((_, i) => `${(i % columns) * cell.w}_${Math.floor(i / columns) * cell.h}`).join('|');
  const filter = plates.length === 1
    ? `${scaled[0]};[c0]null[out]`
    : `${scaled.join(';')};${plates.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${plates.length}:layout=${layout}:fill=black,scale=${columns * cell.w}:${rows * cell.h}[out]`;
  const name = 'contact-sheet.jpg';
  const target = resolve(out, name);
  await rm(target, {force: true});
  await runTool('ffmpeg', ['-v', 'error', '-nostdin', ...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-q:v', '3', target]);
  return name;
}
