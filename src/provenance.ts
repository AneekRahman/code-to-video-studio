import {readFile, readdir, realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {packageRoot} from './render.ts';
import {sha256} from './files.ts';
import {runTool} from './process.ts';
import {StudioError} from './errors.ts';

export async function sourceProvenance(root = packageRoot) {
  const canonicalRoot = await realpath(root);
  const hashes: Record<string, string> = {};
  async function walk(dir: string) {
    const entries = await readdir(resolve(canonicalRoot, dir), {withFileTypes: true});
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const name = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new StudioError('PROVENANCE_AMBIGUOUS', `Source tree must not contain symbolic links: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) hashes[name] = sha256(await readFile(resolve(canonicalRoot, name)));
      else throw new StudioError('PROVENANCE_AMBIGUOUS', `Unsupported filesystem entry in source tree: ${name}`);
    }
  }
  await walk('src');
  for (const name of ['package.json', 'tsconfig.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) hashes[name] = sha256(await readFile(resolve(canonicalRoot, name)));
  let gitCommit: string | null = null;
  try {gitCommit = (await runTool('git', ['-C', canonicalRoot, 'rev-parse', 'HEAD'])).trim();} catch {gitCommit = null;}
  const sortedFiles = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {git_base_commit: gitCommit, source_sha256: sha256(JSON.stringify({files: sortedFiles, node: process.version})), files: sortedFiles, node: process.version, remotion: '4.0.538', renderer: 'local', adapter: 'local-fixture'};
}
