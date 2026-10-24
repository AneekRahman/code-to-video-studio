import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {readJson} from './files.ts';
import {loadJob, type LoadedJob} from './load.ts';
import {renderVisual} from './render.ts';
import {finishAudio} from './mix.ts';
import {modeId as storyModeId} from './modes/isometric-art-zombie-apocalypse/style.ts';
import {finishStory, loadStoryJob, renderStoryVisual, type LoadedStoryJob} from './modes/isometric-art-zombie-apocalypse/job.ts';

export type AnyLoadedJob = (LoadedJob & {mode: 'explainer'}) | LoadedStoryJob;

export type ModeRuntime = {
  renderVisual(dir: string, kind: 'preview' | 'render', deadline: number): Promise<{video: string; thumbnails: string[]; width: number; height: number}>;
  finish(visualPath: string, dir: string, deadline: number): Promise<{video: string; artifacts: string[]}>;
};

const ModeProbe = z.looseObject({mode: z.string().optional()});

export async function loadAnyJob(path: string, started = Date.now()): Promise<AnyLoadedJob> {
  const manifestPath = await realpath(resolve(path));
  const {mode} = await readJson(manifestPath, ModeProbe);
  if (mode === storyModeId) return loadStoryJob(manifestPath, started);
  return {...await loadJob(manifestPath, started), mode: 'explainer'};
}

export function runtimeFor(loaded: AnyLoadedJob): ModeRuntime {
  if (loaded.mode === 'explainer') {
    return {
      renderVisual: (dir, kind, deadline) => renderVisual(loaded, dir, kind, deadline),
      finish: async (visual, dir, deadline) => ({video: await finishAudio(loaded, visual, dir, deadline), artifacts: []}),
    };
  }
  return {
    renderVisual: (dir, kind, deadline) => renderStoryVisual(loaded, dir, kind, deadline),
    finish: (visual, dir, deadline) => finishStory(loaded, visual, dir, deadline),
  };
}
