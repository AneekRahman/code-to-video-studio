import {z} from 'zod';
import type {JobEnvelope} from '../job-files.ts';

/** The mode API's version. A mode declares the `major` it was written for; a release that changes or removes anything in `src/mode-api.ts` raises `major`, one that only adds raises `minor`. */
export const modeApiVersion = {major: 1, minor: 0} as const;

const modeIdPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** Ids the studio's own tests use; no real mode may take one, so tests never depend on which local modes a workspace has. */
export const reservedModeIdPrefix = 'studio-test-';

export const ModeIdSchema = z.string().min(3).max(64).regex(modeIdPattern, 'Mode ids are lowercase words joined by hyphens');

/** The published description of a mode. Bots read these cards from `pnpm studio modes` to decide which mode a brief belongs to. */
export const ModeCardSchema = z.strictObject({
  id: ModeIdSchema,
  title: z.string().min(1),
  /** `fallback` is the one generic mode used when no specialised mode fits a request. */
  role: z.enum(['fallback', 'specialised']),
  summary: z.string().min(1),
  /** Requests this mode is for; a brief should match one of these before the mode is chosen. */
  use_when: z.array(z.string().min(1)).min(1),
  /** Near-misses that belong elsewhere, even though they share surface features. */
  not_for: z.array(z.string().min(1)),
  aspect: z.literal('9:16'),
  /** Null when the brief sets the duration and the mode enforces no range. */
  duration_seconds: z.strictObject({min: z.number().positive(), max: z.number().positive()}).nullable(),
  /** What has to exist before the mode's job can be packaged. */
  inputs: z.array(z.string().min(1)).min(1),
  /** Studio-relative paths. */
  skill: z.string().min(1),
  templates: z.array(z.string().min(1)),
  commands: z.array(z.string().min(1)).min(1),
});
export type ModeCard = z.infer<typeof ModeCardSchema>;

/** What the job runner needs from any loaded job: its manifest, resolved files, hashes and a JSON summary of what will render. */
export type LoadedJobBase = {
  mode: string;
  job: JobEnvelope;
  root: string;
  manifestPath: string;
  paths: Record<string, string>;
  assetPaths: Record<string, string>;
  inputHash: string;
  manifestHash: string;
  timeline: unknown;
};

export type ModeRuntime = {
  /** Renders the muted visual into `dir`; `kind: 'preview'` may render smaller. Returns file names relative to `dir`. */
  renderVisual(dir: string, kind: 'preview' | 'render', deadline: number): Promise<{video: string; thumbnails: string[]; width: number; height: number}>;
  /** Adds audio to the visual and writes the final video into `dir`. `artifacts` are extra files to pin; a `quality.json` with `all_checks_passed` is checked by `pnpm test:modes`. */
  finish(visualPath: string, dir: string, deadline: number): Promise<{video: string; artifacts: string[]}>;
};

type ModeSpec<Loaded extends LoadedJobBase> = {
  /** The major version of the mode API (`src/mode-api.ts`) this mode was written against. */
  api: number;
  card: ModeCard & {id: Loaded['mode']};
  load(manifestPath: string, started: number): Promise<Loaded>;
  runtime(loaded: Loaded): ModeRuntime;
  /** Writes a complete job for this mode into the empty directory `dir` using mock providers only, and returns its manifest path. */
  fixture(dir: string): Promise<string>;
};

export type StudioMode<Loaded extends LoadedJobBase = LoadedJobBase> = Pick<ModeSpec<Loaded>, 'api' | 'card' | 'load' | 'fixture'> & {
  open(manifestPath: string, started: number): Promise<{loaded: Loaded; runtime: ModeRuntime}>;
};

export function defineMode<Loaded extends LoadedJobBase>(spec: ModeSpec<Loaded>): StudioMode<Loaded> {
  return {
    api: spec.api,
    card: spec.card,
    load: spec.load,
    fixture: spec.fixture,
    open: async (manifestPath, started) => {
      const loaded = await spec.load(manifestPath, started);
      return {loaded, runtime: spec.runtime(loaded)};
    },
  };
}
