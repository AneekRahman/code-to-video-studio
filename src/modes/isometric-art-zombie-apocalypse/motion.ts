import type {ShotActor} from './shots.ts';

type Point = {x: number; y: number};
type Waypoint = ShotActor['path'][number];

export function pathPoint(path: Waypoint[], progress: number): Point {
  const first = path[0]!;
  if (progress <= first.at || path.length === 1) return {x: first.x, y: first.y};
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (progress <= b.at) {
      const span = b.at - a.at;
      const t = span <= 0 ? 1 : (progress - a.at) / span;
      return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
    }
  }
  const last = path.at(-1)!;
  return {x: last.x, y: last.y};
}

/** Distance travelled along the path up to `progress`, in the units produced by `toPixels`. */
export function pathDistance(path: Waypoint[], progress: number, toPixels: (p: Point) => [number, number]): number {
  let total = 0;
  let previous = toPixels(pathPoint(path, 0));
  const samples = 48;
  for (let i = 1; i <= samples; i++) {
    const current = toPixels(pathPoint(path, (progress * i) / samples));
    total += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    previous = current;
  }
  return total;
}

export function pathHeading(path: Waypoint[], progress: number): Point | null {
  const epsilon = 0.01;
  const a = pathPoint(path, Math.max(0, progress - epsilon));
  const b = pathPoint(path, Math.min(1, progress + epsilon));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) > 1e-6) return {x: dx, y: dy};
  for (let i = path.length - 1; i > 0; i--) {
    const from = path[i - 1]!;
    const to = path[i]!;
    if (to.at <= progress && Math.hypot(to.x - from.x, to.y - from.y) > 1e-6) return {x: to.x - from.x, y: to.y - from.y};
  }
  return null;
}

const knockRhythm = {cycleSeconds: 1.7, rapSeconds: 0.3, raps: 3, contactAt: 1 / 1.6};

/** Fist wind-up in [0, 1]; the fist meets the door when the lift returns to 0. */
export function knockLift(secondsSinceEnter: number): number {
  const t = secondsSinceEnter % knockRhythm.cycleSeconds;
  const rap = Math.floor(t / knockRhythm.rapSeconds);
  if (rap >= knockRhythm.raps) return 0;
  const local = (t % knockRhythm.rapSeconds) / knockRhythm.rapSeconds;
  return Math.sin(Math.PI * Math.min(1, local / knockRhythm.contactAt));
}

/** Seconds since the actor entered at which each knock lands, before `untilSeconds`. */
export function knockContacts(untilSeconds: number): number[] {
  const contacts: number[] = [];
  for (let cycle = 0; cycle * knockRhythm.cycleSeconds < untilSeconds; cycle++) {
    for (let rap = 0; rap < knockRhythm.raps; rap++) {
      const at = cycle * knockRhythm.cycleSeconds + (rap + knockRhythm.contactAt) * knockRhythm.rapSeconds;
      if (at < untilSeconds) contacts.push(at);
    }
  }
  return contacts;
}

/** Deterministic smooth noise in [-1, 1] built from incommensurate sines. */
export function smoothNoise(t: number, seed: number): number {
  return (Math.sin(t * 1.7 + seed * 12.9898) * 0.5 + Math.sin(t * 2.9 + seed * 78.233) * 0.3 + Math.sin(t * 5.3 + seed * 37.719) * 0.2);
}
