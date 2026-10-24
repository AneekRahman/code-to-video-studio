import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {readJson} from './files.ts';
import {StudioError} from './errors.ts';
import {fallbackModeId, modes, registry, requireNoCollisions, type AnyLoadedJob} from './modes/registry.ts';
import type {StudioMode} from './modes/mode.ts';

export type {AnyLoadedJob};

const ModeProbe = z.looseObject({mode: z.string().optional()});

async function modeOf(path: string): Promise<{manifestPath: string; mode: StudioMode}> {
  requireNoCollisions();
  const manifestPath = await realpath(resolve(path));
  const id = (await readJson(manifestPath, ModeProbe)).mode ?? fallbackModeId;
  const mode = modes.find(m => m.card.id === id);
  const unavailable = registry.unavailable.find(m => m.id === id);
  if (unavailable) throw new StudioError('MODE_UNAVAILABLE', `Local mode "${id}" cannot run: ${unavailable.reason}`, unavailable);
  if (!mode) throw new StudioError('UNKNOWN_MODE', `Job mode "${id}" is not registered`, {registered: modes.map(m => m.card.id)});
  return {manifestPath, mode};
}

export async function loadAnyJob(path: string, started = Date.now()): Promise<AnyLoadedJob> {
  const {manifestPath, mode} = await modeOf(path);
  return mode.load(manifestPath, started);
}

export async function openJob(path: string, started = Date.now()) {
  const {manifestPath, mode} = await modeOf(path);
  return mode.open(manifestPath, started);
}
