import * as THREE from 'three';

export {worldKinds, type WorldKind} from './kinds.ts';

export type Vec3 = [number, number, number];
export type Pose = {position: Vec3; target: Vec3; fov: number};

/** Everything a world needs to draw one frame; worlds are pure functions of this and hold no state between frames. */
export type ShotState = {
  /** Seconds since the shot began. */
  t: number;
  /** Progress through the shot, 0 to 1. */
  u: number;
  /** Escalation of the whole ladder, 0 to 1. */
  level: number;
  /** The rung on screen, counted from 1. */
  rung: number;
  /** Seconds since the counter last ticked. */
  sinceTick: number;
  /** Seconds between ticks. */
  period: number;
};

export type WorldBuild = {
  root: THREE.Object3D;
  update(state: ShotState): void;
  /** The camera the shot uses when the job does not set one. */
  camera(state: ShotState): Pose;
  background: THREE.ColorRepresentation;
  fog?: {color: THREE.ColorRepresentation; near: number; far: number};
  /** Sun intensity and direction; worlds that are lit by something else lower it. */
  sun: {intensity: number; position: Vec3; color?: THREE.ColorRepresentation};
  ambient: {sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; intensity: number};
};

export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const smooth = (a: number, b: number, v: number) => easeInOut((v - a) / (b - a));

export function lerpPose(from: Pose, to: Pose, t: number): Pose {
  return {
    position: [lerp(from.position[0], to.position[0], t), lerp(from.position[1], to.position[1], t), lerp(from.position[2], to.position[2], t)],
    target: [lerp(from.target[0], to.target[0], t), lerp(from.target[1], to.target[1], t), lerp(from.target[2], to.target[2], t)],
    fov: lerp(from.fov, to.fov, t),
  };
}

const materials = new Map<string, THREE.MeshStandardMaterial>();
/** Flat-shaded, matte, shared by colour: the low-poly look is faceted normals and no specular. */
export function flat(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${JSON.stringify(extra)}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({color, flatShading: true, roughness: 0.92, metalness: 0, ...extra});
    materials.set(key, material);
  }
  return material;
}

export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation, at: Vec3 = [0, 0, 0], extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color, extra));
  mesh.position.set(...at);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const child of children) g.add(child);
  return g;
}

/** A hash of three numbers to [0, 1), for per-instance variety that does not depend on build order. */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise on a 2D grid, in [0, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, 1);
  const b = hash3(xi + 1, yi, 1);
  const c = hash3(xi, yi + 1, 1);
  const d = hash3(xi + 1, yi + 1, 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f, y * f) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}
