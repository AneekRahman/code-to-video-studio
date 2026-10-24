import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {MigrationContext, MigrationRecipe, MigrationResult} from '../types.ts';

export const v0ToV1Recipe: MigrationRecipe = {
  fromApi: 0,
  toApi: 1,
  title: 'Adopt Mode API 1.0',
  description: 'Adds explicit api: 1 declaration and normalizes mode-api imports',
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

    if (/\bapi:\s*0\b/.test(modified)) {
      modified = modified.replace(/\bapi:\s*0\b/, 'api: 1');
      changes.push({file: 'mode.ts', description: 'Updated api from 0 to 1'});
    } else if (!/\bapi:\s*\d+\b/.test(modified)) {
      if (/defineMode(<[^>]+>)?\s*\(\s*\{/.test(modified)) {
        modified = modified.replace(/(defineMode(?:<[^>]+>)?\s*\(\s*\{)/, '$1\n  api: 1,');
        changes.push({file: 'mode.ts', description: 'Added api: 1 declaration'});
      }
    }

    const internalImport = /from\s+['"][^'"]*\/src\/(?!mode-api|rendering\/mode-api)[^'"]+['"]/g;
    if (internalImport.test(modified)) {
      modified = modified.replaceAll(internalImport, "from '../../src/mode-api.ts'");
      changes.push({file: 'mode.ts', description: 'Redirected internal imports to mode-api.ts'});
    }

    if (!ctx.dryRun && changes.length > 0) {
      await writeFile(modeTs, modified, 'utf8');
    }

    return {success: true, changes};
  },
};
