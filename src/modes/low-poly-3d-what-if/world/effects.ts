import * as THREE from 'three';
import {clamp01, flat, rngFrom, type Vec3} from './core.ts';

export type Debris = {
  mesh: THREE.InstancedMesh;
  /** Positions every chunk at `age` seconds after a burst at `origin`; fully determined by its arguments. */
  update(age: number, origin: Vec3, strength?: number, life?: number): void;
};

const scratch = new THREE.Object3D();

/** Cubes thrown outward from a point and pulled down by gravity, for walls bursting, glass, sparks and planets breaking. */
export function debris(count: number, seed: number, colors: readonly string[], size: number, speed: number, gravity = 9.8, upward = 0.5): Debris {
  const rng = rngFrom(seed);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, flat('#ffffff'), count);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const velocity: Vec3[] = [];
  const spin: Vec3[] = [];
  const scale: number[] = [];
  const palette = colors.map(c => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const s = speed * (0.3 + rng() * 0.9);
    velocity.push([Math.sin(phi) * Math.cos(theta) * s, Math.abs(Math.cos(phi)) * s * upward + rng() * s * 0.3, Math.sin(phi) * Math.sin(theta) * s]);
    spin.push([(rng() - 0.5) * 9, (rng() - 0.5) * 9, (rng() - 0.5) * 9]);
    scale.push(size * (0.4 + rng() * 1.1));
    mesh.setColorAt(i, palette[Math.floor(rng() * palette.length)]!);
  }
  const update = (age: number, origin: Vec3, strength = 1, life = 4) => {
    const visible = age >= 0 && age < life;
    mesh.visible = visible;
    if (!visible) return;
    const fade = 1 - clamp01((age - life * 0.6) / (life * 0.4));
    for (let i = 0; i < count; i++) {
      const v = velocity[i]!;
      const w = spin[i]!;
      scratch.position.set(origin[0] + v[0] * strength * age, origin[1] + v[1] * strength * age - 0.5 * gravity * age * age, origin[2] + v[2] * strength * age);
      scratch.rotation.set(w[0] * age, w[1] * age, w[2] * age);
      scratch.scale.setScalar(scale[i]! * fade);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return {mesh, update};
}

export type Shockwave = {mesh: THREE.Group; set(radius: number, opacity: number): void};

/** The shout made visible: a faint dome and a bright ring that run out along the ground. */
export function shockwave(color: THREE.ColorRepresentation = '#ffffff'): Shockwave {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false}));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false}));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const mesh = new THREE.Group();
  mesh.add(dome, ring);
  mesh.renderOrder = 5;
  return {
    mesh,
    set(radius, opacity) {
      mesh.scale.setScalar(Math.max(0.001, radius));
      (dome.material as THREE.MeshBasicMaterial).opacity = clamp01(opacity * 0.35);
      (ring.material as THREE.MeshBasicMaterial).opacity = clamp01(opacity * 3.2);
      mesh.visible = opacity > 0.002;
    },
  };
}

export type Beam = {root: THREE.Group; set(from: Vec3, to: Vec3, thickness: number, glow: number): void};

/** A bright additive stream between two points: the stream itself, a wider glow around it. */
export function beam(color: THREE.ColorRepresentation = '#f6e05a'): Beam {
  const root = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.95, depthWrite: false}));
  const halo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending}));
  root.add(core, halo);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  return {
    root,
    set(from, to, thickness, glow) {
      a.set(...from);
      b.set(...to);
      const length = a.distanceTo(b);
      mid.copy(a).add(b).multiplyScalar(0.5);
      for (const [mesh, k] of [[core, 1], [halo, 1 + glow * 2.2]] as const) {
        mesh.position.copy(mid);
        mesh.lookAt(b);
        mesh.scale.set(thickness * k, thickness * k, length);
      }
      root.visible = length > 0.001;
    },
  };
}

export function starfield(count: number, seed: number, radius = 80): THREE.Points {
  const rng = rngFrom(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = radius * (0.7 + rng() * 0.3);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({color: '#ffffff', size: 0.25, sizeAttenuation: true, fog: false}));
}
