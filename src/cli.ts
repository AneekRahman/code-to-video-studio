import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {loadJob} from './load.ts';
import {StudioError, requireCondition} from './errors.ts';
import {executeJob, verifyArtifacts} from './runner.ts';
import {sourceProvenance} from './provenance.ts';
import {schemas} from './schemas.ts';

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
  const {positionals, values} = parseArgs({allowPositionals: true, options: {job: {type: 'string'}, out: {type: 'string'}, 'visual-manifest': {type: 'string'}, result: {type: 'string'}}});
  const command = positionals[0];
  if (command === 'schemas') return {schema_version: '1.0', schemas: schemas()};
  if (command === 'catalog') return JSON.parse(await readFile(new URL('../catalog/components.json', import.meta.url), 'utf8'));
  if (command === 'verify') {
    requireCondition(values.result, 'USAGE', 'verify requires --result <output directory>');
    return {status: 'verified', result: await verifyArtifacts(values.result)};
  }
  requireCondition(values.job, 'USAGE', 'Commands: validate, compile, preview, render, finish, run --job <job.json> [--out <external store>]; catalog; schemas; verify --result <directory>');
  if (command === 'validate' || command === 'compile') {
    const loaded = await loadJob(values.job);
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
