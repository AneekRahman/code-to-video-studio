import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {executeJob, overlapsSource, verifyArtifacts} from '../src/runner.ts';
import {readJson, resolveInput, sha256} from '../src/files.ts';
import {sourceProvenance} from '../src/provenance.ts';
import {loadJob} from '../src/load.ts';
import {packageRoot} from '../src/render.ts';
import {createFixture} from '../scripts/create-fixture.ts';
import {JobSchema} from '../src/contracts.ts';
import {StudioError} from '../src/errors.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

test('output scope symmetrically rejects parent and child overlaps with source and input roots before mutation', async () => {
  const fixture = await createFixture();
  const canonicalPackage = await realpath(packageRoot);
  const packageParent = dirname(canonicalPackage);
  const sandbox = await mkdtemp(join(tmpdir(), 'studio-scope-test-'));
  try {
    await assert.rejects(executeJob(fixture.job, packageParent, 'preview'), hasCode('OUTPUT_SCOPE'));

    const insidePackage = resolve(canonicalPackage, 'disposable-nonexistent-scope-probe');
    await assert.rejects(executeJob(fixture.job, insidePackage, 'preview'), hasCode('OUTPUT_SCOPE'));
    let insidePackageExists = true;
    try { await stat(insidePackage); } catch { insidePackageExists = false; }
    assert.equal(insidePackageExists, false);

    await assert.rejects(executeJob(fixture.job, fixture.directory, 'preview'), hasCode('OUTPUT_SCOPE'));
    const parentOfInput = dirname(await realpath(fixture.directory));
    await assert.rejects(executeJob(fixture.job, parentOfInput, 'preview'), hasCode('OUTPUT_SCOPE'));

    const insideInput = resolve(fixture.directory, 'disposable-nonexistent-input-probe');
    await assert.rejects(executeJob(fixture.job, insideInput, 'preview'), hasCode('OUTPUT_SCOPE'));
    let insideInputExists = true;
    try { await stat(insideInput); } catch { insideInputExists = false; }
    assert.equal(insideInputExists, false);

    const symlinkToPackage = resolve(sandbox, 'symlink-to-pkg');
    await symlink(canonicalPackage, symlinkToPackage);
    const prospectiveViaSymlink = resolve(symlinkToPackage, 'disposable-symlink-probe');
    await assert.rejects(executeJob(fixture.job, prospectiveViaSymlink, 'preview'), hasCode('OUTPUT_SCOPE'));
    let symlinkProbeExists = true;
    try { await stat(prospectiveViaSymlink); } catch { symlinkProbeExists = false; }
    assert.equal(symlinkProbeExists, false);
  } finally {
    await rm(sandbox, {recursive: true, force: true});
    await rm(fixture.directory, {recursive: true, force: true});
  }
});

test('the work folder is the only place inside the package an output store may live', () => {
  const pkg = '/studio';
  assert.equal(overlapsSource(pkg, '/studio/work'), false);
  assert.equal(overlapsSource(pkg, '/studio/work/outputs/job'), false);
  assert.equal(overlapsSource(pkg, '/studio/workshop'), true);
  assert.equal(overlapsSource(pkg, '/studio/src/out'), true);
  assert.equal(overlapsSource(pkg, '/studio'), true);
  assert.equal(overlapsSource(pkg, '/'), true);
  assert.equal(overlapsSource(pkg, '/elsewhere/outputs'), false);
});

test('symlinks in inputs, JSON documents, and artifacts are strictly rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-symlink-test-'));
  try {
    const realFile = resolve(root, 'target.json');
    await writeFile(realFile, JSON.stringify({valid: true}));
    const linkFile = resolve(root, 'link.json');
    await symlink(realFile, linkFile);
    await assert.rejects(readJson(linkFile, JobSchema), hasCode('INVALID_JSON'));
    await assert.rejects(resolveInput(root, {path: 'link.json', sha256: sha256(JSON.stringify({valid: true}))}, 1000), hasCode('INPUT_SCOPE'));

    const outDir = resolve(root, 'out');
    await mkdir(outDir);
    const resultJson = resolve(outDir, 'result.json');
    const artifactPath = resolve(outDir, 'file.txt');
    const artifactLink = resolve(outDir, 'link.txt');
    await writeFile(artifactPath, 'content');
    await symlink(artifactPath, artifactLink);
    await writeFile(resultJson, JSON.stringify({
      schema_version: '1.0',
      job_id: 'test_job',
      input_hash: 'a'.repeat(64),
      source_hash: 'b'.repeat(64),
      operation: 'preview',
      status: 'technical_complete',
      creative_acceptance: 'not_reviewed',
      publication_authorized: false,
      artifacts: [{name: 'link.txt', sha256: sha256('content'), bytes: 7}],
      final_video: 'link.txt',
      created_at: new Date().toISOString(),
    }));
    await assert.rejects(verifyArtifacts(outDir), hasCode('OUTPUT_SCOPE'));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('verifyArtifacts maps missing pinned artifacts to OUTPUT_CHANGED without echoing paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-missing-artifact-test-'));
  try {
    const resultJson = resolve(root, 'result.json');
    await writeFile(resultJson, JSON.stringify({
      schema_version: '1.0',
      job_id: 'test_job',
      input_hash: 'a'.repeat(64),
      source_hash: 'b'.repeat(64),
      operation: 'preview',
      status: 'technical_complete',
      creative_acceptance: 'not_reviewed',
      publication_authorized: false,
      artifacts: [{name: 'missing-video.mp4', sha256: 'c'.repeat(64), bytes: 100}],
      final_video: 'missing-video.mp4',
      created_at: new Date().toISOString(),
    }));
    await assert.rejects(verifyArtifacts(root), (error: unknown) => {
      assert.equal(error instanceof StudioError && error.code === 'OUTPUT_CHANGED', true);
      assert.equal(error instanceof Error && !error.message.includes(root) && !error.message.includes('missing-video.mp4'), true);
      return true;
    });
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('source provenance walk rejects symbolic links in source directory', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'studio-provenance-test-'));
  try {
    const srcDir = resolve(sandbox, 'src');
    await mkdir(srcDir);
    const targetFile = resolve(srcDir, 'real.ts');
    await writeFile(targetFile, 'export const x = 1;');
    const symlinkFile = resolve(srcDir, 'link.ts');
    await symlink(targetFile, symlinkFile);
    await assert.rejects(sourceProvenance(sandbox), hasCode('PROVENANCE_AMBIGUOUS'));
  } finally {
    await rm(sandbox, {recursive: true, force: true});
  }
});

test('missing files produce MISSING_FILE without leaking filepaths in error messages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-missing-test-'));
  try {
    await assert.rejects(readJson(resolve(root, 'nonexistent.json'), JobSchema), hasCode('MISSING_FILE'));
    await assert.rejects(resolveInput(root, {path: 'nonexistent.bin', sha256: sha256('')}, 1000), hasCode('MISSING_FILE'));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('output store locking fails closed when .studio-lock exists', async () => {
  const fixture = await createFixture();
  const root = await mkdtemp(join(tmpdir(), 'studio-lock-test-'));
  const out = resolve(root, 'outputs');
  try {
    await mkdir(out, {recursive: true});
    const lockDir = resolve(out, '.studio-lock');
    await mkdir(lockDir);
    await assert.rejects(executeJob(fixture.job, out, 'preview'), hasCode('JOB_LOCKED'));
    await rm(lockDir, {recursive: true, force: true});
    let lockExists = true;
    try {
      await realpath(lockDir);
    } catch {
      lockExists = false;
    }
    assert.equal(lockExists, false);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(fixture.directory, {recursive: true, force: true});
  }
});

test('dirty cached destination fails early with OUTPUT_CORRUPT, checks job_id, and never overwrites', async () => {
  const fixture = await createFixture();
  const root = await mkdtemp(join(tmpdir(), 'studio-dirty-dest-test-'));
  const out = resolve(root, 'outputs');
  try {
    const loaded = await loadJob(fixture.job);
    const source = await sourceProvenance();
    const identity = sha256(JSON.stringify({job_id: loaded.job.job_id, input: loaded.inputHash, source: source.source_sha256, operation: 'preview', visual: undefined})).slice(0, 24);
    const store = resolve(out, loaded.job.job_id);
    const destDir = resolve(store, `preview-${identity}`);
    await mkdir(destDir, {recursive: true});

    const dummyVideo = resolve(destDir, 'dummy.mp4');
    await writeFile(dummyVideo, 'dummy');
    const validManifest = {
      schema_version: '1.0',
      job_id: loaded.job.job_id,
      input_hash: loaded.inputHash,
      source_hash: source.source_sha256,
      operation: 'preview',
      status: 'technical_complete',
      creative_acceptance: 'not_reviewed',
      publication_authorized: false,
      artifacts: [{name: 'dummy.mp4', sha256: sha256('dummy'), bytes: 5}],
      final_video: 'dummy.mp4',
      created_at: new Date().toISOString(),
    };
    const resultFile = resolve(destDir, 'result.json');
    await writeFile(resultFile, JSON.stringify(validManifest));

    const cached = await executeJob(fixture.job, out, 'preview');
    assert.equal(cached.cached, true);

    const mismatchedJobManifest = {...validManifest, job_id: 'foreign_job_id'};
    await writeFile(resultFile, JSON.stringify(mismatchedJobManifest));
    await assert.rejects(executeJob(fixture.job, out, 'preview'), hasCode('OUTPUT_CORRUPT'));

    await writeFile(resultFile, 'corrupted-json-content');
    await assert.rejects(executeJob(fixture.job, out, 'preview'), hasCode('OUTPUT_CORRUPT'));

    await rm(resultFile);
    await assert.rejects(executeJob(fixture.job, out, 'preview'), hasCode('OUTPUT_CORRUPT'));

    await writeFile(resultFile, JSON.stringify(validManifest));
    await writeFile(dummyVideo, 'modified');
    await assert.rejects(executeJob(fixture.job, out, 'preview'), hasCode('OUTPUT_CORRUPT'));

    await rm(dummyVideo);
    await assert.rejects(executeJob(fixture.job, out, 'preview'), hasCode('OUTPUT_CORRUPT'));
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(fixture.directory, {recursive: true, force: true});
  }
});
