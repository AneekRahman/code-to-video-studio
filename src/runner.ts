import {cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat} from 'node:fs/promises';
import {basename, extname, join, resolve} from 'node:path';
import {z} from 'zod';
import {canonicalizeProspective, isWithin, readJson, sha256, writeJson} from './files.ts';
import {loadAnyJob, openJob} from './jobs.ts';
import {StudioError, requireCondition} from './errors.ts';
import {inspect} from './media.ts';
import {packageRoot} from './render.ts';
import {sourceProvenance} from './provenance.ts';
import {runTool} from './process.ts';
import {pruneScratch} from './prune.ts';

const Artifact = z.strictObject({name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]+$/).refine(name => !name.split('/').some(part => part === '..' || part === '.' || part === '')), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative()});
export const ResultSchema = z.strictObject({schema_version: z.literal('1.0'), job_id: z.string(), input_hash: z.string(), source_hash: z.string(), operation: z.enum(['preview', 'render', 'finish', 'run']), status: z.literal('technical_complete'), creative_acceptance: z.literal('not_reviewed'), publication_authorized: z.literal(false), artifacts: z.array(Artifact), final_video: z.string(), created_at: z.string()});
const Attempts = z.strictObject({count: z.number().int().nonnegative()});
export type Operation = z.infer<typeof ResultSchema>['operation'];

export async function verifyArtifacts(dir: string) {
  let canonicalDir: string;
  try {
    canonicalDir = await realpath(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StudioError('OUTPUT_CHANGED', 'Output directory does not exist');
    throw error;
  }
  let manifest: z.infer<typeof ResultSchema>;
  try {
    manifest = await readJson(resolve(canonicalDir, 'result.json'), ResultSchema);
  } catch (error) {
    if (error instanceof StudioError && error.code === 'MISSING_FILE') {
      throw new StudioError('OUTPUT_CHANGED', 'Manifest is missing from output directory');
    }
    throw error;
  }
  for (const artifact of manifest.artifacts) {
    const fullPath = resolve(canonicalDir, artifact.name);
    let lstatInfo;
    let path: string;
    try {
      lstatInfo = await lstat(fullPath);
      path = await realpath(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StudioError('OUTPUT_CHANGED', 'Pinned artifact is missing from output directory');
      }
      throw error;
    }
    requireCondition(!lstatInfo.isSymbolicLink(), 'OUTPUT_SCOPE', 'Artifact must not be a symbolic link');
    requireCondition(isWithin(canonicalDir, path), 'OUTPUT_SCOPE', 'Artifact escapes its output directory');
    let info;
    let bytes: Buffer;
    try {
      info = await stat(path);
      bytes = await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StudioError('OUTPUT_CHANGED', 'Pinned artifact is missing from output directory');
      }
      throw error;
    }
    requireCondition(info.isFile() && info.size === artifact.bytes && sha256(bytes) === artifact.sha256, 'OUTPUT_CHANGED', 'Stored artifact does not match its manifest');
  }
  requireCondition(manifest.artifacts.some(a => a.name === manifest.final_video), 'OUTPUT_CHANGED', 'Manifest video is not a pinned artifact');
  return manifest;
}

/** The package's git-ignored `work/` folder is the only place inside the source tree where job data may live. */
export function overlapsSource(canonicalPackage: string, path: string): boolean {
  if (isWithin(path, canonicalPackage)) return true;
  return isWithin(canonicalPackage, path) && !isWithin(resolve(canonicalPackage, 'work'), path);
}

export async function executeJob(jobPath: string, out: string, operation: Operation, visualManifest?: string) {
  const started = Date.now();
  try {
    await pruneScratch({maxAgeMs: 48 * 3600 * 1000});
  } catch {
    // Best-effort opportunistic preflight cleanup must never fail a valid job
  }
  const loaded = await loadAnyJob(jobPath, started);
  const deadline = started + loaded.job.limits.max_runtime_seconds * 1000;
  const canonicalPackage = await realpath(packageRoot);
  const prospectiveRoot = await canonicalizeProspective(out);
  requireCondition(
    !overlapsSource(canonicalPackage, prospectiveRoot) &&
    !isWithin(loaded.root, prospectiveRoot) &&
    !isWithin(prospectiveRoot, loaded.root),
    'OUTPUT_SCOPE',
    'Output store must be outside source (or inside work/) and input directories, without overlap'
  );
  await mkdir(resolve(out), {recursive: true, mode: 0o700});
  const root = await realpath(resolve(out));
  requireCondition(
    !overlapsSource(canonicalPackage, root) &&
    !isWithin(loaded.root, root) &&
    !isWithin(root, loaded.root),
    'OUTPUT_SCOPE',
    'Output store must be outside source (or inside work/) and input directories, without overlap'
  );
  const store = resolve(root, loaded.job.job_id);
  const prospectiveStore = await canonicalizeProspective(store);
  requireCondition(isWithin(root, prospectiveStore), 'OUTPUT_SCOPE', 'Output job directory escapes its store');
  await mkdir(store, {recursive: true, mode: 0o700});
  const canonicalStore = await realpath(store);
  const storeLstat = await lstat(store);
  requireCondition(!storeLstat.isSymbolicLink() && isWithin(root, canonicalStore), 'OUTPUT_SCOPE', 'Output job directory escapes its store');
  const lock = resolve(root, '.studio-lock');
  try {await mkdir(lock, {mode: 0o700});}
  catch (error) {if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StudioError('JOB_LOCKED', 'Job already has an active or interrupted owner; inspect it before explicit recovery'); throw error;}
  let stage: string | undefined;
  try {
    const source = await sourceProvenance();
    let visualPath: string | undefined;
    let base: z.infer<typeof ResultSchema> | undefined;
    if (operation === 'finish') {
      requireCondition(visualManifest, 'USAGE', 'finish requires --visual-manifest');
      const path = await realpath(resolve(visualManifest));
      requireCondition(isWithin(root, path) && basename(path) === 'result.json', 'OUTPUT_SCOPE', 'Visual manifest must belong to this output store');
      const visualDir = resolve(path, '..');
      base = await verifyArtifacts(visualDir);
      requireCondition(base.job_id === loaded.job.job_id && base.input_hash === loaded.inputHash && base.operation === 'render', 'INPUT_CHANGED', 'Finishing requires a full visual render of these exact job inputs');
      visualPath = resolve(visualDir, base.final_video);
    }
    const identity = sha256(JSON.stringify({job_id: loaded.job.job_id, input: loaded.inputHash, source: source.source_sha256, operation, visual: base?.artifacts})).slice(0, 24);
    const destination = resolve(store, `${operation}-${identity}`);
    let destinationExists = false;
    try {
      await stat(destination);
      destinationExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (destinationExists) {
      let cached: z.infer<typeof ResultSchema>;
      try {
        cached = await verifyArtifacts(destination);
        requireCondition(
          cached.job_id === loaded.job.job_id &&
          cached.input_hash === loaded.inputHash &&
          cached.source_hash === source.source_sha256 &&
          cached.operation === operation,
          'OUTPUT_CHANGED',
          'Cached result identity is invalid'
        );
      } catch (error) {
        throw new StudioError(
          'OUTPUT_CORRUPT',
          'Existing output destination is partial, corrupt, or does not match its manifest; inspect or remove manually before rerun',
          {cause: error instanceof Error && 'code' in error ? (error as {code: string}).code : 'UNVERIFIED'}
        );
      }
      return {manifest: resolve(destination, 'result.json'), cached: true, result: cached};
    }
    const ledgerPath = resolve(store, 'attempts.json');
    let attempts = {count: 0};
    try {attempts = await readJson(ledgerPath, Attempts);}
    catch (error) {
      const code = error instanceof StudioError ? error.code : (error as NodeJS.ErrnoException).code;
      if (code !== 'MISSING_FILE' && code !== 'ENOENT') throw error;
    }
    requireCondition(attempts.count < loaded.job.limits.max_operation_attempts, 'ATTEMPTS_EXHAUSTED', 'Local job operation allowance is exhausted');
    const nextLedger = resolve(lock, 'attempts.json');
    await writeJson(nextLedger, {count: attempts.count + 1});
    await rename(nextLedger, ledgerPath);
    stage = await mkdtemp(join(store, '.attempt-'));
    const snapshot = resolve(stage, 'inputs');
    await mkdir(snapshot);
    const snapshotJob = structuredClone(loaded.job);
    const snapshotFiles: string[] = [];
    const inputPaths: Record<string, string> = loaded.paths;
    const snapshotInputs: Record<string, {path: string}> = snapshotJob.inputs;
    for (const [key, path] of Object.entries(inputPaths)) {
      const name = `input-${key}${extname(path)}`;
      await cp(path, resolve(snapshot, name), {errorOnExist: true, force: false});
      snapshotInputs[key]!.path = name;
      snapshotFiles.push(`inputs/${name}`);
    }
    for (const asset of snapshotJob.assets) {
      const name = `asset-${asset.asset_id}${extname(asset.file.path)}`;
      await cp(loaded.assetPaths[asset.asset_id]!, resolve(snapshot, name), {errorOnExist: true, force: false});
      asset.file.path = name;
      snapshotFiles.push(`inputs/${name}`);
    }
    await writeJson(resolve(snapshot, 'job.json'), snapshotJob);
    snapshotFiles.push('inputs/job.json');
    const {runtime} = await openJob(resolve(snapshot, 'job.json'), started);
    const artifacts: string[] = [...snapshotFiles];
    let finalVideo: string;
    const expected = {...loaded.job.format, duration_seconds: loaded.job.format.duration_seconds};
    if (operation !== 'finish') {
      const visual = await runtime.renderVisual(stage, operation === 'preview' ? 'preview' : 'render', deadline);
      artifacts.push(visual.video, ...visual.thumbnails);
      const report = await inspect(resolve(stage, visual.video), {width: visual.width, height: visual.height, fps: expected.fps, duration_seconds: expected.duration_seconds, audio: false}, deadline - Date.now());
      await writeJson(resolve(stage, 'visual-qa.json'), report);
      artifacts.push('visual-qa.json');
      visualPath = resolve(stage, visual.video);
      finalVideo = visual.video;
      if (visual.thumbnails.length) {
        const args = ['-v', 'error', '-nostdin', '-n'];
        for (const thumbnail of visual.thumbnails) args.push('-i', resolve(stage, thumbnail));
        args.push('-filter_complex', `${visual.thumbnails.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${visual.thumbnails.length}:layout=${visual.thumbnails.map((_, i) => `${(i % 4) * 270}_${Math.floor(i / 4) * 480}`).join('|')}:fill=black[v]`, '-map', '[v]', '-frames:v', '1', resolve(stage, 'contact-sheet.png'));
        if (visual.thumbnails.length === 1) await cp(resolve(stage, visual.thumbnails[0]!), resolve(stage, 'contact-sheet.png'));
        else await runTool('ffmpeg', args, deadline - Date.now());
        artifacts.push('contact-sheet.png');
      }
    } else finalVideo = '';
    if (operation === 'run' || operation === 'finish') {
      requireCondition(visualPath, 'MISSING_VISUAL', 'Audio finishing needs a visual master');
      const finished = await runtime.finish(visualPath, stage, deadline);
      finalVideo = finished.video;
      await writeJson(resolve(stage, 'final-qa.json'), await inspect(resolve(stage, finalVideo), {width: expected.width, height: expected.height, fps: expected.fps, duration_seconds: expected.duration_seconds, audio: true}, deadline - Date.now()));
      artifacts.push(finalVideo, 'final-qa.json', ...finished.artifacts);
    }
    await writeJson(resolve(stage, 'timeline.json'), loaded.timeline);
    await writeJson(resolve(stage, 'provenance.json'), {source, job: loaded.job, input_hash: loaded.inputHash, original_manifest_hash: loaded.manifestHash, base_visual: base ?? null, actual_provider_spend_usd: 0, provider_requests: 0, local_runtime_ms: Date.now() - started, technical_validation_only: true});
    artifacts.push('timeline.json', 'provenance.json');
    requireCondition((await loadAnyJob(jobPath, started)).inputHash === loaded.inputHash, 'INPUT_CHANGED', 'Job changed during execution');
    requireCondition((await sourceProvenance()).source_sha256 === source.source_sha256, 'SOURCE_CHANGED', 'Source changed during rendering');
    const pinnedArtifacts = await Promise.all(artifacts.map(async name => {const bytes = await readFile(resolve(stage!, name));return {name, sha256: sha256(bytes), bytes: bytes.length};}));
    requireCondition(pinnedArtifacts.reduce((sum, a) => sum + a.bytes, 0) <= loaded.job.limits.max_output_bytes, 'OUTPUT_LIMIT', 'Job artifacts exceed their byte allowance');
    requireCondition(Date.now() <= deadline, 'DEADLINE_EXCEEDED', 'Job execution deadline expired');
    const result = ResultSchema.parse({schema_version: '1.0', job_id: loaded.job.job_id, input_hash: loaded.inputHash, source_hash: source.source_sha256, operation, status: 'technical_complete', creative_acceptance: 'not_reviewed', publication_authorized: false, artifacts: pinnedArtifacts, final_video: finalVideo, created_at: new Date().toISOString()});
    await writeJson(resolve(stage, 'result.json'), result);
    await rm(resolve(stage, 'bundle'), {recursive: true, force: true});
    await rm(resolve(stage, 'public'), {recursive: true, force: true});
    await rename(stage, destination);
    stage = undefined;
    return {manifest: resolve(destination, 'result.json'), cached: false, result};
  } finally {
    if (stage) await rm(stage, {recursive: true, force: true});
    await rm(lock, {recursive: true, force: true});
  }
}
