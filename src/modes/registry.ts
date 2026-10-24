import {access, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {StudioError} from '../errors.ts';
import {packageRoot} from '../render.ts';
import {explainerMode} from './explainer/mode.ts';
import {isometricZombieMode} from './isometric-art-zombie-apocalypse/mode.ts';
import {ModeCardSchema, ModeIdSchema, modeApiVersion, reservedModeIdPrefix, type LoadedJobBase, type StudioMode} from './mode.ts';

export const shippedModes: readonly StudioMode[] = [explainerMode, isometricZombieMode];
export const fallbackModeId = explainerMode.card.id;
export const localModesDirectory = resolve(packageRoot, 'local-modes');

export type ModeSource = 'shipped' | 'local';
export type Registry = {
  modes: readonly (StudioMode & {source: ModeSource})[];
  /** Local modes that exist but cannot be offered, with the reason. */
  unavailable: readonly {id: string; reason: string}[];
  /** Local modes whose id a release also ships; the studio refuses to start until they are renamed. */
  collisions: readonly string[];
};

function asStudioMode(value: unknown): StudioMode | null {
  if (!value || typeof value !== 'object') return null;
  const mode = value as Partial<StudioMode>;
  const functions = [mode.load, mode.open, mode.fixture].every(f => typeof f === 'function');
  return functions && typeof mode.api === 'number' && mode.card ? mode as StudioMode : null;
}

async function checkLocalMode(id: string, root: string): Promise<StudioMode | string> {
  if (!ModeIdSchema.safeParse(id).success) return 'the folder name is not a mode id (lowercase words joined by hyphens)';
  if (id.startsWith(reservedModeIdPrefix)) return `ids starting with ${reservedModeIdPrefix} are reserved for the studio's tests`;
  let imported: {default?: unknown};
  try {
    imported = await import(pathToFileURL(resolve(root, id, 'mode.ts')).href);
  } catch (error) {
    return `mode.ts does not load: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
  const mode = asStudioMode(imported.default);
  if (!mode) return 'mode.ts must `export default defineMode({...})`';
  if (mode.api !== modeApiVersion.major) return `written for mode API ${mode.api}; this studio provides ${modeApiVersion.major}. Migrate it with CHANGELOG.md`;
  const card = ModeCardSchema.safeParse(mode.card);
  if (!card.success) return `invalid card: ${card.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join('; ')}`;
  if (card.data.id !== id) return `card id "${card.data.id}" must equal its folder name`;
  if (card.data.role !== 'specialised') return 'local modes are specialised; the explainer is the only fallback';
  for (const path of [card.data.skill, ...card.data.templates]) {
    if (!path.startsWith(`local-modes/${id}/`)) return `${path} must be inside local-modes/${id}/`;
    if (!await access(resolve(root, '..', path)).then(() => true, () => false)) return `missing ${path}`;
  }
  return mode;
}

export async function discoverModes(root = localModesDirectory): Promise<Registry> {
  const shippedIds = new Set(shippedModes.map(mode => mode.card.id));
  const entries = await readdir(root, {withFileTypes: true}).catch(() => []);
  const folders = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort();
  const local: StudioMode[] = [];
  const unavailable: {id: string; reason: string}[] = [];
  const collisions = folders.filter(id => shippedIds.has(id));
  for (const id of folders.filter(name => !shippedIds.has(name))) {
    const checked = await checkLocalMode(id, root);
    if (typeof checked === 'string') unavailable.push({id, reason: checked});
    else local.push(checked);
  }
  return {
    modes: [...shippedModes.map(mode => ({...mode, source: 'shipped' as const})), ...local.map(mode => ({...mode, source: 'local' as const}))],
    unavailable,
    collisions,
  };
}

export const registry = await discoverModes();
export const modes = registry.modes;

export type AnyLoadedJob = LoadedJobBase;

export function requireNoCollisions(current: Registry = registry): void {
  if (current.collisions.length === 0) return;
  throw new StudioError('MODE_ID_COLLISION', `This studio release ships modes with the same id as local modes: ${current.collisions.join(', ')}. Rename the local mode folders (and their card ids), then retry.`, {collisions: current.collisions});
}

/** What a bot asks a person when their request falls back to the explainer. OpenMausBot shows `question` and the choice labels as one-tap buttons. */
export const newModeOffer = {
  ask_when: 'A person asked for this video in the conversation, and no specialised mode fits it, so it would fall back to the explainer. Ask once, before production starts.',
  ask_with: 'The OpenMausBot question card: the ask_user tool, or the engine\'s own AskUserQuestion tool.',
  question: 'No specialised video mode fits this request, so I would make it with the general explainer mode. If you will make more videos like this one, I can first build a dedicated mode for them: a short interview, a plan, then a sample for you to review after each build stage. How would you like to go?',
  choices: [
    {label: 'Just this video', action: 'Make it with the explainer mode.'},
    {label: 'New mode, then this video', action: 'Interview, plan and build the new mode (skills/create-mode.md); make this video in it once it ships.'},
    {label: 'New mode, and this video now', action: 'Make this video with the explainer now, and build the new mode alongside it.'},
  ],
  unattended: 'A job Showrunner dispatched without a person in the conversation never waits on this question: make it with the explainer and add a new-mode suggestion to the production report.',
} as const;

export function modeCatalog(current: Registry = registry) {
  return {
    schema_version: '1.0' as const,
    mode_api: modeApiVersion,
    fallback: fallbackModeId,
    modes: current.modes.map(mode => ({...mode.card, source: mode.source})),
    unavailable: current.unavailable,
    collisions: current.collisions,
    new_mode_offer: newModeOffer,
  };
}
