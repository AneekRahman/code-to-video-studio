import {createHash} from 'node:crypto';
import {lstat, readFile, realpath, stat, writeFile} from 'node:fs/promises';
import {basename, dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import type {z} from 'zod';
import {StudioError, requireCondition} from './errors.ts';

export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
export async function canonicalizeProspective(path: string): Promise<string> {
  const target = resolve(path);
  let current = target;
  const missingParts: string[] = [];
  while (true) {
    try {
      const info = await stat(current);
      if (info.isDirectory()) {
        const canonicalExisting = await realpath(current);
        return missingParts.length ? resolve(canonicalExisting, ...missingParts.reverse()) : canonicalExisting;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    }
    const parent = dirname(current);
    if (parent === current) return target;
    missingParts.push(basename(current));
    current = parent;
  }
}
export async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let lstatInfo;
  try {
    lstatInfo = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StudioError('MISSING_FILE', 'Required document was not found');
    throw error;
  }
  requireCondition(!lstatInfo.isSymbolicLink(), 'INVALID_JSON', 'JSON document must not be a symbolic link');
  requireCondition(lstatInfo.isFile() && lstatInfo.size <= 1024 * 1024, 'INVALID_JSON', 'JSON must be a file of at most 1 MiB');
  let value: unknown;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new StudioError('INVALID_JSON', 'Cannot read JSON document'); }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StudioError(
      'INVALID_CONTRACT',
      'Document does not match schema 1.0',
      result.error.issues.map(({path: p, code}) => ({path: p.map(String).slice(0, 10), code}))
    );
  }
  return result.data;
}
export async function resolveInput(root: string, ref: {path: string; sha256: string}, maxBytes: number): Promise<string> {
  requireCondition(!isAbsolute(ref.path) && !ref.path.includes('://'), 'CONFIG_REQUIRED', 'Local fixture references must be relative paths');
  const canonicalRoot = await realpath(root);
  const rawPath = resolve(canonicalRoot, ref.path);
  let candidate: string;
  try {
    candidate = await realpath(rawPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StudioError('MISSING_FILE', 'Referenced input file was not found');
    throw error;
  }
  requireCondition(isWithin(canonicalRoot, candidate), 'INPUT_SCOPE', 'Input escapes the job directory');
  const rawLstat = await lstat(rawPath);
  requireCondition(!rawLstat.isSymbolicLink(), 'INPUT_SCOPE', 'Input must not be a symbolic link');
  const info = await stat(candidate);
  requireCondition(info.isFile() && info.size <= maxBytes, 'INPUT_LIMIT', 'Input is not a file or exceeds its byte limit');
  requireCondition(sha256(await readFile(candidate)) === ref.sha256, 'INPUT_CHANGED', 'Input content does not match its pinned hash');
  return candidate;
}
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx', mode: 0o600});
}
