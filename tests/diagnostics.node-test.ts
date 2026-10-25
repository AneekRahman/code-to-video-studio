import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {exportDiagnostics, sanitizeText} from '../src/diagnostics.ts';

test('sanitizeText redacts known sensitive API key patterns and personal user paths', () => {
  const sensitive = 'Authorization: Bearer sk-1234567890abcdef and xi-api-key: my-secret-key in /Users/testuser/project';
  const clean = sanitizeText(sensitive);
  assert.ok(!clean.includes('sk-1234567890abcdef'));
  assert.ok(!clean.includes('my-secret-key'));
  assert.ok(!clean.includes('/Users/testuser'));
  assert.ok(clean.includes('[REDACTED_SECRET]'));
  assert.ok(clean.includes('/[REDACTED_PATH]'));
});

test('exportDiagnostics exports a bounded JSONL bundle with environment details and redaction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-diag-'));
  try {
    const workDir = resolve(dir, 'work');
    const jobDir = resolve(workDir, 'fixture-job');
    const outDir = resolve(dir, 'out');
    const {mkdir} = await import('node:fs/promises');
    await mkdir(jobDir, {recursive: true});

    // Create a dummy result.json and a dummy media file that should be omitted
    await writeFile(
      resolve(jobDir, 'result.json'),
      JSON.stringify({ok: true, status: 'COMPLETE', token: 'Bearer sk-sample-token-value'}),
      'utf8'
    );
    await writeFile(resolve(jobDir, 'export.mp4'), Buffer.from('video data'));

    const report = await exportDiagnostics({
      jobId: 'fixture-job',
      workDir,
      out: outDir,
    });

    assert.equal(report.status, 'diagnostics_exported');
    assert.ok(report.sizeBytes > 0);
    assert.ok(report.entriesCount >= 2);
    assert.ok(report.filesIncluded.includes('result.json'));
    assert.ok(report.filesOmitted.includes('export.mp4'));

    const content = await readFile(report.bundlePath, 'utf8');
    assert.ok(!content.includes('sk-sample-token-value'));
    assert.ok(content.includes('[REDACTED_SECRET]'));
    assert.ok(content.includes('environment'));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
