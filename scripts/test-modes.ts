import {mkdir, readFile, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeJob, verifyArtifacts} from '../src/runner.ts';
import {packageRoot} from '../src/render.ts';
import {registry, type Registry} from '../src/modes/registry.ts';

export type ModeConformance = {mode: string; source: string; pass: boolean; detail: string};

/** Renders every registered mode's mock fixture end to end and checks its result; a run directory is kept only when something failed. */
export async function checkModeConformance(current: Registry = registry, only?: readonly string[]) {
  const runRoot = resolve(packageRoot, 'work/conformance', new Date().toISOString().replace(/[:.]/g, '-'));
  const results: ModeConformance[] = [];
  for (const mode of current.modes.filter(m => !only?.length || only.includes(m.card.id))) {
    const dir = resolve(runRoot, mode.card.id);
    try {
      await mkdir(resolve(dir, 'inputs'), {recursive: true, mode: 0o700});
      const job = await mode.fixture(resolve(dir, 'inputs'));
      const run = await executeJob(job, resolve(dir, 'out'), 'run');
      const result = await verifyArtifacts(dirname(run.manifest));
      const finalQa = JSON.parse(await readFile(resolve(dirname(run.manifest), 'final-qa.json'), 'utf8')) as {technical_validation?: string; checks?: Record<string, boolean>};
      if (finalQa.technical_validation !== 'passed') throw new Error(`final video fails technical checks: ${Object.entries(finalQa.checks ?? {}).filter(([, pass]) => !pass).map(([name]) => name).join(', ')}`);
      if (result.artifacts.some(artifact => artifact.name === 'quality.json')) {
        const quality = JSON.parse(await readFile(resolve(dirname(run.manifest), 'quality.json'), 'utf8')) as {all_checks_passed?: boolean; checks?: {check_id?: string; pass?: boolean}[]};
        const failed = (quality.checks ?? []).filter(check => !check.pass).map(check => check.check_id);
        if (quality.all_checks_passed !== true) throw new Error(`quality checks failed: ${failed.join(', ') || 'all_checks_passed is not true'}`);
      }
      results.push({mode: mode.card.id, source: mode.source, pass: true, detail: `${result.final_video} verified`});
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? `${String(error.code)}: ` : '';
      results.push({mode: mode.card.id, source: mode.source, pass: false, detail: `${code}${error instanceof Error ? error.message : String(error)}`});
    }
  }
  for (const {id, reason} of current.unavailable) results.push({mode: id, source: 'local', pass: false, detail: `unavailable: ${reason}`});
  for (const id of current.collisions) results.push({mode: id, source: 'local', pass: false, detail: 'MODE_ID_COLLISION: a shipped mode has the same id'});
  const pass = results.every(result => result.pass);
  if (pass) await rm(runRoot, {recursive: true, force: true});
  return {status: pass ? 'passed' as const : 'failed' as const, kept: pass ? null : runRoot, results};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outcome = await checkModeConformance(registry, process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  if (outcome.status !== 'passed') process.exitCode = 1;
}
