import * as THREE from 'three';
import {clamp01, easeOut, type ShotState, type Vec3} from './core.ts';
import {bystanderLooks, makePerson, type Person} from './people.ts';
import {dog as makeDog, pigeon as makePigeon, type Pigeon} from './props.ts';

/** `value` wrapped into [min, max). */
export const wrap = (value: number, min: number, max: number) => min + ((((value - min) % (max - min)) + (max - min)) % (max - min));

/** Seconds since the ladder reached `rung`, valid while the counter keeps one period. */
export const since = (s: ShotState, rung: number) => (s.rung - rung) * s.period + s.sinceTick;

export type WalkerSpec = {
  look: number;
  /** Sidewalk lane, x. */
  x: number;
  /** Where along the street the walker is at t = 0. */
  z0: number;
  /** Metres per second along z, negative walks away from the camera. */
  speed: number;
  /** A walk of `walk` seconds, then a pause of `pause` seconds, repeated. */
  walk: number;
  pause: number;
  /** Seconds into the cycle at t = 0, so no two walkers share a rhythm. */
  offset: number;
  /** A dog on a lead follows this walker. */
  dog?: boolean;
};

export type Walker = {spec: WalkerSpec; person: Person; dog: ReturnType<typeof makeDog> | null; dogLegs: THREE.Object3D[]};

/** Distance a walker has covered after `t` seconds: it only advances during the walking part of each cycle. */
export function travelled(spec: WalkerSpec, t: number): number {
  const cycle = spec.walk + spec.pause;
  const at = t + spec.offset;
  const full = Math.floor(at / cycle);
  const inside = at - full * cycle;
  return (full * spec.walk + Math.min(inside, spec.walk)) * Math.abs(spec.speed);
}

export const isWalking = (spec: WalkerSpec, t: number) => ((t + spec.offset) % (spec.walk + spec.pause)) < spec.walk;

/** Builds walkers that spread themselves along a street from a seeded random stream. */
export function makeWalkers(rng: () => number, count: number, lanes: readonly number[], zMin: number, zMax: number): Walker[] {
  return Array.from({length: count}, (_, i) => {
    const direction = rng() < 0.5 ? -1 : 1;
    const spec: WalkerSpec = {
      look: i % bystanderLooks.length,
      x: lanes[i % lanes.length]! + (rng() - 0.5) * 0.6,
      z0: zMin + ((i + rng() * 0.8) / count) * (zMax - zMin),
      speed: direction * (0.9 + rng() * 0.9),
      walk: 5 + rng() * 6,
      pause: 1.5 + rng() * 4,
      offset: rng() * 14,
      dog: i % 5 === 2,
    };
    const dog = spec.dog ? makeDog() : null;
    return {spec, person: makePerson(bystanderLooks[spec.look]!), dog, dogLegs: dog ? dog.children.filter(child => child.userData.leg) : []};
  });
}

export type Crowd = {
  /** Poses every walker for `s`; `hero` is where the hero stands, and the ladder drives their reactions. */
  update(s: ShotState, hero: Vec3, min: number, max: number): void;
};

/**
 * Reactions layer over each walker's own routine: they notice the shout, cover their ears, then run from it.
 * `axis` is the direction the street runs; a walker's `x` is its lane across it.
 */
export function crowd(walkers: readonly Walker[], axis: 'x' | 'z' = 'z'): Crowd {
  const quarter = Math.PI / 2;
  return {
    update(s, hero, min, max) {
      const heroAlong = axis === 'z' ? hero[2] : hero[0];
      for (const [i, w] of walkers.entries()) {
        const {spec, person, dog} = w;
        const heading = spec.speed >= 0 ? 1 : -1;
        const walking = isWalking(spec, s.t);
        let along = wrap(spec.z0 + travelled(spec, s.t) * heading, min, max);
        let lane = spec.x;
        const toHero = heroAlong - along;
        const near = Math.abs(toHero) < 34;
        const heard = near && s.rung >= 3;
        const frightened = near && s.rung >= 6;
        const flee = near ? Math.max(0, since(s, 8)) : 0;
        const away = toHero > 0 ? -1 : 1;
        along += away * flee * 3.6;
        lane += (i % 2 ? 1 : -1) * easeOut(flee / 3) * 1.4;
        const faceAlong = (sign: number) => (axis === 'z' ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? quarter : -quarter);
        const base = faceAlong(heading);
        const turnIn = easeOut(clamp01(since(s, 3) / 0.7));
        const toward = faceAlong(toHero > 0 ? 1 : -1);
        person.root.position.set(axis === 'z' ? lane : along, 0.1, axis === 'z' ? along : lane);
        person.root.rotation.y = flee > 0 ? faceAlong(away) : heard ? base + (toward - base) * turnIn : base;
        const moving = flee > 0 || walking;
        person.set({
          walk: moving ? (flee > 0 ? s.t * 11 + i : (travelled(spec, s.t) / 0.62) * Math.PI) : 0,
          walkAmplitude: flee > 0 ? 0.95 : moving ? 0.55 : 0,
          arms: flee > 0 ? 'swing' : frightened ? 'ears' : heard ? (i % 3 === 0 ? 'up' : 'down') : moving ? 'swing' : 'down',
          mouth: heard && !flee ? 0.7 : flee > 0 ? 0.9 : 0,
          wide: heard ? 0.9 : 0,
          brows: heard ? 1 : 0,
          lean: clamp01(flee / 0.6) * 0.18,
        });
        if (dog) {
          const lag = (flee > 0 ? 1.5 : 0.6) * -heading;
          const side = spec.x < 0 || axis === 'x' ? 0.75 : -0.75;
          dog.position.set(axis === 'z' ? lane + side : along + lag, 0.1 + (moving ? Math.abs(Math.sin(s.t * 12 + i)) * 0.04 : 0), axis === 'z' ? along + lag : lane + side);
          dog.rotation.y = person.root.rotation.y;
          dog.children.filter(child => child.userData.leg).forEach((leg, k) => {
            leg.rotation.x = moving ? Math.sin(s.t * 12 + (k % 2) * Math.PI) * 0.7 : 0;
          });
          const tail = dog.userData.tail as THREE.Object3D | undefined;
          if (tail) tail.rotation.z = Math.sin(s.t * 14 + i) * 0.5;
        }
      }
    },
  };
}

export type Flock = {birds: {bird: Pigeon; base: Vec3; spin: number}[]};

export function makeFlock(rng: () => number, count: number, around: Vec3, spread: number): Flock {
  return {
    birds: Array.from({length: count}, () => {
      const bird = makePigeon();
      const base: Vec3 = [around[0] + (rng() - 0.5) * spread, 0.1, around[2] + (rng() - 0.5) * spread * 1.4];
      bird.root.position.set(...base);
      return {bird, base, spin: rng() * 6.28};
    }),
  };
}

/** Pigeons walk in small loops and peck until the shout, then burst into the air. */
export function pigeonsAt(flock: Flock, s: ShotState, origin: Vec3, takeoffSince: number): void {
  const fly = clamp01(takeoffSince / 3);
  for (const [i, p] of flock.birds.entries()) {
    const t = s.t + p.spin;
    const pecking = Math.sin(t * 1.3 + i) > 0.35;
    const wander = 0.5 + (i % 3) * 0.25;
    const gx = p.base[0] + origin[0] + Math.cos(t * 0.5) * wander;
    const gz = p.base[2] + origin[2] + Math.sin(t * 0.45) * wander;
    const dx = fly * (i % 2 ? 6 : -4) * (0.8 + i * 0.06);
    const rise = easeOut(fly) * (5 + i * 0.9);
    p.bird.root.position.set(gx + dx, 0.1 + rise, gz - fly * 9);
    p.bird.root.rotation.y = fly > 0 ? (i % 2 ? 1 : -1) * 0.9 : Math.atan2(-Math.sin(t * 0.5) * 0.25, Math.cos(t * 0.45) * 0.22) + Math.PI / 2;
    p.bird.root.rotation.x = fly > 0 ? -0.4 : pecking ? 0.35 : 0;
    for (const [k, wing] of p.bird.wings.entries()) wing.rotation.z = (k ? -1 : 1) * (fly > 0 ? Math.sin(s.t * 28 + i) * 0.9 : 0);
    p.bird.root.visible = fly < 0.98;
  }
}
