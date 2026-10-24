import {z} from 'zod';
import {Phase} from './style.ts';

const unit = z.number().finite().min(-0.5).max(1.5);
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

/** Camera framing in plate space: centre (x, y in 0..1 of the plate) and zoom (1 = plate covers the frame). */
export const CameraKey = z.strictObject({x: unit, y: unit, zoom: z.number().min(1).max(3)});

export const Waypoint = z.strictObject({
  at: z.number().finite().min(0).max(1),
  x: unit,
  y: unit,
});

export const Actor = z.strictObject({
  actor_id: id,
  rig: z.enum(['hero', 'zombie', 'double']),
  gait: z.enum(['idle', 'walk', 'run', 'shamble', 'lunge', 'knock', 'still']),
  /** Standing height on screen in plate pixels. */
  height: z.number().min(20).max(900),
  path: z.array(Waypoint).min(1).max(12),
  carrying: z.enum(['none', 'grocery-bag']).default('none'),
  /** Overrides the facing derived from the path, in screen degrees (0 = towards the viewer's right, 90 = down). */
  facing_deg: z.number().finite().optional(),
  enter_at: z.number().min(0).max(1).default(0),
});

export const ShotSchema = z.strictObject({
  shot_id: id,
  plate_id: id,
  duration_seconds: z.number().min(0.2).max(20),
  grade: Phase,
  camera: z.strictObject({
    from: CameraKey,
    to: CameraKey,
    ease: z.enum(['linear', 'in-out', 'out', 'in']).default('in-out'),
    drift: z.number().min(0).max(1).default(0.35),
  }),
  shakes: z.array(z.strictObject({at: z.number().min(0).max(1), strength: z.number().min(0).max(1), duration_seconds: z.number().min(0.05).max(3)})).max(8).default([]),
  atmosphere: z.strictObject({
    fog: z.number().min(0).max(1).default(0),
    particles: z.enum(['none', 'dust', 'ash', 'rain']).default('none'),
    flicker: z.number().min(0).max(1).default(0),
    heartbeat_pulse: z.number().min(0).max(1).default(0),
  }).default({fog: 0, particles: 'none', flicker: 0, heartbeat_pulse: 0}),
  transition_in: z.enum(['cut', 'fade-black', 'flash', 'glitch']).default('cut'),
  actors: z.array(Actor).max(12).default([]),
});

export const ShotListSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  fps: z.literal(30),
  shots: z.array(ShotSchema).min(1).max(40),
});

export type Shot = z.infer<typeof ShotSchema>;
export type ShotActor = z.infer<typeof Actor>;
export type ShotList = z.infer<typeof ShotListSchema>;
export type CompiledShot = Shot & {startFrame: number; durationInFrames: number};
export type PlateRef = {src: string; width: number; height: number};
export type IsoProps = {width: number; height: number; fps: number; durationInFrames: number; plates: Record<string, PlateRef>; shots: CompiledShot[]};

export function compileShots(list: ShotList): {shots: CompiledShot[]; durationInFrames: number} {
  let cursor = 0;
  const seen = new Set<string>();
  const shots = list.shots.map(shot => {
    if (seen.has(shot.shot_id)) throw new Error(`Duplicate shot id ${shot.shot_id}`);
    seen.add(shot.shot_id);
    const durationInFrames = Math.max(1, Math.round(shot.duration_seconds * list.fps));
    const compiled = {...shot, startFrame: cursor, durationInFrames};
    cursor += durationInFrames;
    return compiled;
  });
  return {shots, durationInFrames: cursor};
}
