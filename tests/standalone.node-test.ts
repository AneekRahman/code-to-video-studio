import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ffmpegTableNames, nodeSupported, proxyCheck} from '../src/doctor.ts';

const studio = fileURLToPath(new URL('..', import.meta.url));

/** Reads the root importer's `name → specifier` pairs from a pnpm 9 lockfile. */
function lockedSpecifiers(lockfile: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  const lines = lockfile.split('\n');
  const start = lines.indexOf('  .:');
  assert.ok(start >= 0, 'lockfile has a root importer');
  let section = '';
  let name = '';
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) || /^ {2}\S/.test(line)) break;
    const sectionMatch = /^ {4}(\w+):$/.exec(line);
    if (sectionMatch) { section = sectionMatch[1]!; sections[section] = {}; continue; }
    const nameMatch = /^ {6}'?([^':]+)'?:$/.exec(line);
    if (nameMatch) { name = nameMatch[1]!; continue; }
    const specifierMatch = /^ {8}specifier: '?([^']+)'?$/.exec(line);
    if (specifierMatch) sections[section]![name] = specifierMatch[1]!;
  }
  return sections;
}

test('the studio lockfile pins exactly the dependencies package.json declares', async () => {
  const manifest = JSON.parse(await readFile(resolve(studio, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
  const locked = lockedSpecifiers(await readFile(resolve(studio, 'pnpm-lock.yaml'), 'utf8'));
  for (const section of ['dependencies', 'devDependencies']) {
    assert.deepEqual(locked[section] ?? {}, manifest[section] ?? {}, `${section} differ: run pnpm install in the studio`);
  }
});

test('nothing in the studio points outside it', async () => {
  const offenders: string[] = [];
  const markdown = async (dir: string): Promise<string[]> => (await readdir(resolve(studio, dir))).filter(name => name.endsWith('.md')).map(name => `${dir}/${name}`);
  for (const file of ['AGENTS.md', 'README.md', 'DEFERRED.md', ...await markdown('skills')]) {
    const text = await readFile(resolve(studio, file), 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+)/g)) {
      if (/^[a-z]+:/.test(target!)) continue;
      const absolute = resolve(studio, file, '..', target!);
      if (!absolute.startsWith(studio)) offenders.push(`${file} → ${target}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('doctor recognises supported Node, proxy handling and ffmpeg tables', () => {
  assert.equal(nodeSupported('24.4.0'), false);
  assert.equal(nodeSupported('24.5.0'), true);
  assert.equal(nodeSupported('26.9.0'), true);
  assert.equal(proxyCheck({}, []).pass, true);
  assert.equal(proxyCheck({HTTPS_PROXY: 'http://127.0.0.1:3128'}, []).pass, false);
  assert.equal(proxyCheck({HTTPS_PROXY: 'http://127.0.0.1:3128'}, ['--use-env-proxy']).pass, true);
  assert.equal(proxyCheck({https_proxy: 'http://127.0.0.1:3128', NODE_USE_ENV_PROXY: '1'}, []).pass, true);
  const filters = ffmpegTableNames('Filters:\n  T.. = Timeline support\n  ------\n .. loudnorm          A->A       EBU R128 loudness normalization\n TS acompressor       A->A       Audio compressor.\n');
  assert.deepEqual([...filters].sort(), ['acompressor', 'loudnorm']);
  const encoders = ffmpegTableNames('Encoders:\n V..... = Video\n ------\n A....D aac                  AAC (Advanced Audio Coding)\n');
  assert.deepEqual([...encoders], ['aac']);
});
