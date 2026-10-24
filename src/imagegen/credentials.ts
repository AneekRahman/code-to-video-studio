import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {StudioError} from '../errors.ts';
import {packageRoot} from '../render.ts';

export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = Object.create(null);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    values[match[1]!] = value;
  }
  return values;
}

/** Resolves a secret from the process environment, then the git-ignored package `local.env`. */
export async function resolveSecret(name: string, envFile = resolve(packageRoot, 'local.env')): Promise<string> {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  let text: string;
  try {
    text = await readFile(envFile, 'utf8');
  } catch {
    throw new StudioError('CONFIG_REQUIRED', `Credential ${name} is not configured in the environment or local.env`);
  }
  const value = parseEnvFile(text)[name];
  if (!value) throw new StudioError('CONFIG_REQUIRED', `Credential ${name} is not configured in the environment or local.env`);
  return value;
}
