import {readdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {modeApiVersion} from '../modes/mode.ts';
import {packageRoot} from '../render.ts';
import {findMigrationPath} from './registry.ts';
import type {MigrationChange, MigrationRecipe, ModeMigrationReport} from './types.ts';

export async function detectStudioApiVersion(studioRoot: string): Promise<number> {
  const modeTs = resolve(studioRoot, 'src/modes/mode.ts');
  try {
    const content = await readFile(modeTs, 'utf8');
    const match = content.match(/modeApiVersion\s*=\s*\{\s*major:\s*(\d+)/);
    if (match) return Number(match[1]);
  } catch {
    // fallback if file not found
  }
  return modeApiVersion.major;
}

export async function inspectModeApi(modeDir: string): Promise<number | null> {
  const modeTs = resolve(modeDir, 'mode.ts');
  try {
    const source = await readFile(modeTs, 'utf8');
    const match = source.match(/\bapi:\s*(\d+)\b/);
    if (match) return Number(match[1]);
    if (/defineMode\s*(?:<[^>]+>)?\s*\(/.test(source)) return 0;
    return null;
  } catch {
    return null;
  }
}

export async function discoverLocalModeFolders(localModesDir: string): Promise<string[]> {
  const entries = await readdir(localModesDir, {withFileTypes: true}).catch(() => []);
  return entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort();
}

export async function migrateMode(
  modeId: string,
  options: {
    studioRoot?: string;
    localModesDir?: string;
    toApi?: number;
    dryRun?: boolean;
    recipes?: readonly MigrationRecipe[];
  } = {},
): Promise<ModeMigrationReport> {
  const studioRoot = options.studioRoot ?? packageRoot;
  const localModesDir = options.localModesDir ?? resolve(studioRoot, 'local-modes');
  const modeDir = resolve(localModesDir, modeId);
  const targetApi = options.toApi ?? await detectStudioApiVersion(studioRoot);

  const currentApi = await inspectModeApi(modeDir);
  if (currentApi === null) {
    return {
      mode_id: modeId,
      from_api: -1,
      to_api: -1,
      target_api: targetApi,
      status: 'failed',
      changes: [],
      error: 'mode.ts does not export defineMode or declare an api version',
    };
  }

  if (currentApi === targetApi) {
    return {
      mode_id: modeId,
      from_api: currentApi,
      to_api: currentApi,
      target_api: targetApi,
      status: 'up_to_date',
      changes: [],
    };
  }

  if (currentApi > targetApi) {
    return {
      mode_id: modeId,
      from_api: currentApi,
      to_api: currentApi,
      target_api: targetApi,
      status: 'failed',
      changes: [],
      error: `Mode declared API ${currentApi} is newer than target API ${targetApi}`,
    };
  }

  const path = findMigrationPath(currentApi, targetApi, options.recipes);
  if (!path) {
    return {
      mode_id: modeId,
      from_api: currentApi,
      to_api: currentApi,
      target_api: targetApi,
      status: 'no_path',
      changes: [],
      error: `No migration recipes available to migrate from API ${currentApi} to ${targetApi}. Consult CHANGELOG.md for manual steps.`,
    };
  }

  const changes: MigrationChange[] = [];
  let effectiveApi = currentApi;

  for (const recipe of path) {
    const result = await recipe.apply({
      studioRoot,
      modeDir,
      modeId,
      dryRun: options.dryRun,
    });

    if (!result.success) {
      return {
        mode_id: modeId,
        from_api: currentApi,
        to_api: effectiveApi,
        target_api: targetApi,
        status: 'failed',
        changes,
        error: result.error ?? `Migration step ${recipe.title} failed`,
      };
    }

    changes.push(...result.changes);
    effectiveApi = recipe.toApi;
  }

  return {
    mode_id: modeId,
    from_api: currentApi,
    to_api: effectiveApi,
    target_api: targetApi,
    status: 'migrated',
    changes,
  };
}

export async function migrateAllModes(
  options: {
    studioRoot?: string;
    localModesDir?: string;
    toApi?: number;
    dryRun?: boolean;
    recipes?: readonly MigrationRecipe[];
    skipUnversioned?: boolean;
  } = {},
): Promise<ModeMigrationReport[]> {
  const studioRoot = options.studioRoot ?? packageRoot;
  const localModesDir = options.localModesDir ?? resolve(studioRoot, 'local-modes');
  const targetApi = options.toApi ?? await detectStudioApiVersion(studioRoot);
  const modeIds = await discoverLocalModeFolders(localModesDir);
  const reports: ModeMigrationReport[] = [];
  for (const modeId of modeIds) {
    const currentApi = await inspectModeApi(resolve(localModesDir, modeId));
    if (currentApi === null && options.skipUnversioned) continue;
    reports.push(await migrateMode(modeId, {...options, toApi: targetApi}));
  }
  return reports;
}
