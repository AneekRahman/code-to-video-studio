import type {MigrationRecipe} from './types.ts';
import {v0ToV1Recipe} from './recipes/v0-to-v1.ts';
import {v1ToV2Recipe} from './recipes/v1-to-v2.ts';

export const builtInRecipes: readonly MigrationRecipe[] = [v0ToV1Recipe, v1ToV2Recipe];

export function findMigrationPath(
  fromApi: number,
  toApi: number,
  recipes: readonly MigrationRecipe[] = builtInRecipes,
): MigrationRecipe[] | null {
  if (fromApi === toApi) return [];
  if (fromApi > toApi) return null;

  const queue: {version: number; path: MigrationRecipe[]}[] = [{version: fromApi, path: []}];
  const visited = new Set<number>([fromApi]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.version === toApi) return current.path;

    for (const recipe of recipes) {
      if (recipe.fromApi === current.version && !visited.has(recipe.toApi)) {
        visited.add(recipe.toApi);
        queue.push({
          version: recipe.toApi,
          path: [...current.path, recipe],
        });
      }
    }
  }

  return null;
}
