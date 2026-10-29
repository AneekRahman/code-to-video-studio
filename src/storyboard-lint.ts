import type {Brand, CompiledScene} from './contracts.ts';
import {luminance} from './rendering/motion/theme.ts';

export const DEFAULT_WEBGL_SCENE_BUDGET = 3;

/** The host's WebGL allowance: `STUDIO_WEBGL_BUDGET` (set from the `doctor` verdict), else 3. */
export function webglBudget(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.STUDIO_WEBGL_BUDGET);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_WEBGL_SCENE_BUDGET;
}
export const MAX_REPEATED_TREATMENT = 2;

const normalise = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function usesWebGL(scene: Pick<CompiledScene, 'treatment' | 'chart_style'>): boolean {
  return scene.treatment === 'orbit' || scene.treatment === 'logos' || (scene.treatment === 'chart' && scene.chart_style === 'iso');
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Rules the renderer cannot enforce by looking at a frame: a palette that cannot carry its look, a job that is
 * too heavy to render inside its deadline on a GPU-less host, monotone pacing, and emphasis that never gets spoken.
 */
export function lintStoryboard(scenes: CompiledScene[], brand: Brand, spokenWords: Map<string, string[]>): string[] {
  const problems: string[] = [];
  const look = brand.look ?? 'studio';
  if (contrast(brand.foreground, brand.background) < 4.5) problems.push(`brand foreground and background contrast ${contrast(brand.foreground, brand.background).toFixed(1)}:1; the ${look} look needs at least 4.5:1`);
  if (look === 'paper' && !(luminance(brand.background) >= 0.6 && luminance(brand.foreground) <= 0.2)) problems.push('the paper look needs a light background (luminance 0.6 or more) and a dark foreground (0.2 or less): its cards are white with dark text');
  if (look === 'studio' && luminance(brand.background) > 0.3) problems.push('the studio look needs a dark background (luminance 0.3 or less): its glass cards and light are tuned for dark');
  if (look === 'studio' && contrast(brand.accent, brand.background) < 3) problems.push('brand accent is too close to the background for the studio look (needs 3:1)');
  const heavy = scenes.filter(usesWebGL).length;
  if (heavy > webglBudget()) problems.push(`${heavy} WebGL scenes (iso charts, orbit, logos); this host's budget is ${webglBudget()} so it can finish inside the job deadline`);
  let run = 1;
  for (let i = 1; i < scenes.length; i++) {
    run = scenes[i]!.treatment === scenes[i - 1]!.treatment ? run + 1 : 1;
    if (run > MAX_REPEATED_TREATMENT) problems.push(`scene '${scenes[i]!.scene_id}' is the ${run}rd '${scenes[i]!.treatment}' scene in a row; vary the treatment`);
  }
  for (const scene of scenes) {
    const spoken = new Set(scene.narration_segment_ids.flatMap(id => spokenWords.get(id) ?? []));
    for (const word of scene.emphasis ?? []) {
      if (!spoken.has(normalise(word))) problems.push(`scene '${scene.scene_id}' emphasises '${word}', which its narration never says`);
    }
  }
  return problems;
}
