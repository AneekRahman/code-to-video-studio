import {z} from 'zod';

const modeIdPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const ModeIdSchema = z.string().min(3).max(64).regex(modeIdPattern, 'Mode ids are lowercase words joined by hyphens');

/** The published description of a mode. Other bots read these cards from `catalog/modes.json` to decide which mode a brief belongs to. */
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
  /** Package-relative paths. */
  skill: z.string().min(1),
  templates: z.array(z.string().min(1)),
  commands: z.array(z.string().min(1)).min(1),
});
export type ModeCard = z.infer<typeof ModeCardSchema>;

export type ModeRuntime = {
  renderVisual(dir: string, kind: 'preview' | 'render', deadline: number): Promise<{video: string; thumbnails: string[]; width: number; height: number}>;
  finish(visualPath: string, dir: string, deadline: number): Promise<{video: string; artifacts: string[]}>;
};

type ModeSpec<Loaded extends {mode: string}> = {
  card: ModeCard & {id: Loaded['mode']};
  load(manifestPath: string, started: number): Promise<Loaded>;
  runtime(loaded: Loaded): ModeRuntime;
};

export type StudioMode<Loaded extends {mode: string}> = Pick<ModeSpec<Loaded>, 'card' | 'load'> & {
  open(manifestPath: string, started: number): Promise<{loaded: Loaded; runtime: ModeRuntime}>;
};

export function defineMode<Loaded extends {mode: string}>(spec: ModeSpec<Loaded>): StudioMode<Loaded> {
  return {
    card: spec.card,
    load: spec.load,
    open: async (manifestPath, started) => {
      const loaded = await spec.load(manifestPath, started);
      return {loaded, runtime: spec.runtime(loaded)};
    },
  };
}
