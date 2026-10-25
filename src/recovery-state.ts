import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {StudioError} from './errors.ts';

export async function resetAttempts(store: string): Promise<void> {
  await rm(resolve(store, 'attempts.json'), {force: true});
}

export async function purgeCorruptDestination(destination: string, verify: () => Promise<unknown>): Promise<boolean> {
  try {
    await verify();
    return false;
  } catch (error) {
    if (!(error instanceof StudioError) || !['OUTPUT_CHANGED', 'OUTPUT_SCOPE', 'MISSING_FILE', 'INVALID_JSON', 'INVALID_CONTRACT'].includes(error.code)) throw error;
    await rm(resolve(destination), {recursive: true, force: true});
    return true;
  }
}
