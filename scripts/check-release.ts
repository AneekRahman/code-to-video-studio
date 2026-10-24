import {fileURLToPath} from 'node:url';
import {runTool} from '../src/process.ts';
import {packageRoot} from '../src/render.ts';

/** Files a workspace owns. A release commit must not contain them, or updates would conflict with workspace work. */
export function workspaceOwnedFiles(tracked: readonly string[]): string[] {
  return tracked.filter(path =>
    (path.startsWith('local-modes/') && path !== 'local-modes/README.md') ||
    path.startsWith('plans/') ||
    path.startsWith('work/') ||
    path === 'local.env' ||
    path === 'catalog/modes.json');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tracked = (await runTool('git', ['-C', packageRoot, 'ls-files'])).split('\n').filter(Boolean);
  const offenders = workspaceOwnedFiles(tracked);
  process.stdout.write(`${JSON.stringify({status: offenders.length ? 'failed' : 'passed', workspace_owned_files: offenders}, null, 2)}\n`);
  if (offenders.length) process.exitCode = 1;
}
