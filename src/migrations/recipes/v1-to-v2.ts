import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {MigrationContext, MigrationRecipe, MigrationResult} from '../types.ts';

export const v1ToV2Recipe: MigrationRecipe = {
  fromApi: 1,
  toApi: 2,
  title: 'Migrate to Mode API 2.0',
  description: 'Bumps mode API version to 2 and validates mode contract conformance',
  apply: async (ctx: MigrationContext): Promise<MigrationResult> => {
    const modeTs = resolve(ctx.modeDir, 'mode.ts');
    let source: string;
    try {
      source = await readFile(modeTs, 'utf8');
    } catch (error) {
      return {success: false, changes: [], error: `Cannot read mode.ts: ${error instanceof Error ? error.message : String(error)}`};
    }

    let modified = source;
    const changes = [];

    if (/\bapi:\s*1\b/.test(modified)) {
      modified = modified.replace(/\bapi:\s*1\b/, 'api: 2');
      changes.push({file: 'mode.ts', description: 'Updated api declaration from 1 to 2'});
    }

    if (!ctx.dryRun && changes.length > 0) {
      await writeFile(modeTs, modified, 'utf8');
    }

    return {success: true, changes};
  },
};
