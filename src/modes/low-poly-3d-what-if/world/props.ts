import * as THREE from 'three';
import {box, flat, group, rngFrom, type Vec3} from './core.ts';

const facadeColors = ['#c9744f', '#e3d2b2', '#b08968', '#9aa5b1', '#d9b99b', '#8f9bb0', '#e6e0d4', '#b5654a'];

const facadeCache = new Map<string, THREE.CanvasTexture>();
function facade(color: string, floors: number, bays: number): THREE.CanvasTexture {
  const key = `${color}|${floors}|${bays}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = bays * 24;
  canvas.height = floors * 28;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(b * 24 + 5, f * 28 + 5, 14, 18);
      g.fillStyle = f % 2 ? '#2c3e57' : '#25344c';
      g.fillRect(b * 24 + 6, f * 28 + 6, 12, 16);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(b * 24 + 6, f * 28 + 6, 12, 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  facadeCache.set(key, texture);
  return texture;
}

/** A building whose front (+z) and side faces carry a window grid; `plain` skips windows for far, grey aerial blocks. */
export function building(width: number, height: number, depth: number, seed: number, plain = false): THREE.Mesh {
  const rng = rngFrom(seed);
  const color = facadeColors[Math.floor(rng() * facadeColors.length)]!;
  const floors = Math.max(2, Math.round(height / 3));
  const bays = Math.max(2, Math.round(width / 1.6));
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const side = plain ? flat(color) : new THREE.MeshStandardMaterial({map: facade(color, floors, bays), flatShading: true, roughness: 0.95});
  const sideZ = plain ? flat(color) : new THREE.MeshStandardMaterial({map: facade(color, floors, Math.max(2, Math.round(depth / 1.6))), flatShading: true, roughness: 0.95});
  const roof = flat('#7d8794');
  const mesh = new THREE.Mesh(geometry, [sideZ, sideZ, roof, roof, side, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = height / 2;
  return mesh;
}

/** A shop awning that projects 1.1 from a facade facing +x and runs `width` along z. */
export function awning(width: number, color: string): THREE.Mesh {
  const mesh = box(1.1, 0.12, width, color);
  mesh.rotation.z = -0.32;
  return mesh;
}

export function tree(scale = 1, leaf = '#4cae38'): THREE.Group {
  const t = new THREE.Group();
  t.add(box(0.22, 1.4, 0.22, '#6b4a2f', [0, 0.7, 0]));
  const crown = (r: number, y: number) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), flat(leaf));
    m.position.y = y;
    m.castShadow = true;
    return m;
  };
  t.add(crown(0.95, 2.1), crown(0.7, 2.9));
  t.scale.setScalar(scale);
  return t;
}

export function car(color: string, scale = 1): THREE.Group {
  const c = new THREE.Group();
  c.add(box(1.9, 0.6, 4.1, color, [0, 0.55, 0]));
  c.add(box(1.7, 0.55, 2.2, color, [0, 1.12, -0.2]));
  c.add(box(1.72, 0.4, 1.9, '#2a3a52', [0, 1.14, -0.2]));
  for (const x of [-0.95, 0.95]) for (const z of [-1.3, 1.3]) c.add(box(0.22, 0.6, 0.6, '#1a1a1d', [x, 0.3, z]));
  c.add(box(0.4, 0.14, 0.04, '#fff7d6', [-0.55, 0.62, 2.06]), box(0.4, 0.14, 0.04, '#fff7d6', [0.55, 0.62, 2.06]));
  c.scale.setScalar(scale);
  return c;
}

export function truck(color: string): THREE.Group {
  const t = new THREE.Group();
  t.add(box(2.2, 1.2, 2.4, color, [0, 1.0, 1.8]));
  t.add(box(2.3, 1.7, 3.6, '#e5e7eb', [0, 1.35, -1.2]));
  t.add(box(2.0, 0.55, 0.1, '#2a3a52', [0, 1.4, 3.01]));
  for (const x of [-1.1, 1.1]) for (const z of [-2, 0.2, 2.4]) t.add(box(0.28, 0.9, 0.9, '#1a1a1d', [x, 0.45, z]));
  return t;
}

export function dog(): THREE.Group {
  const d = new THREE.Group();
  const fur = '#b8742f';
  d.add(box(0.28, 0.3, 0.7, fur, [0, 0.5, 0]));
  d.add(box(0.24, 0.26, 0.26, fur, [0, 0.72, 0.42]));
  d.add(box(0.1, 0.1, 0.1, '#2a1a10', [0, 0.68, 0.58]));
  d.add(box(0.08, 0.16, 0.08, '#8a5420', [-0.1, 0.9, 0.4]), box(0.08, 0.16, 0.08, '#8a5420', [0.1, 0.9, 0.4]));
  for (const x of [-0.1, 0.1]) for (const z of [-0.26, 0.26]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.38, z);
    leg.add(box(0.08, 0.38, 0.08, fur, [0, -0.19, 0]));
    leg.userData.leg = true;
    d.add(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.62, -0.36);
  tail.add(box(0.05, 0.05, 0.28, '#8a5420', [0, 0.08, -0.12]));
  d.add(tail);
  d.userData.tail = tail;
  return d;
}

export function bench(): THREE.Group {
  return group(box(1.6, 0.08, 0.5, '#7a5a3a', [0, 0.5, 0]), box(1.6, 0.5, 0.06, '#7a5a3a', [0, 0.8, -0.22]), box(0.08, 0.5, 0.45, '#2b2f36', [-0.7, 0.25, 0]), box(0.08, 0.5, 0.45, '#2b2f36', [0.7, 0.25, 0]));
}

export function bin(): THREE.Group {
  return group(box(0.5, 0.8, 0.5, '#3f5b4a', [0, 0.4, 0]), box(0.56, 0.08, 0.56, '#2b2f36', [0, 0.84, 0]));
}

export function hydrant(): THREE.Group {
  return group(box(0.26, 0.55, 0.26, '#d7232d', [0, 0.28, 0]), box(0.34, 0.1, 0.3, '#d7232d', [0, 0.6, 0]), box(0.5, 0.1, 0.1, '#d7232d', [0, 0.4, 0]));
}

export type Pigeon = {root: THREE.Group; wings: THREE.Mesh[]};
export function pigeon(): Pigeon {
  const root = new THREE.Group();
  root.add(box(0.2, 0.14, 0.3, '#5b6270', [0, 0.1, 0]));
  root.add(box(0.12, 0.12, 0.12, '#3f4654', [0, 0.18, 0.17]));
  const wings = [box(0.28, 0.03, 0.2, '#454c59', [-0.2, 0.17, 0]), box(0.28, 0.03, 0.2, '#454c59', [0.2, 0.17, 0])];
  for (const w of wings) root.add(w);
  return {root, wings};
}

export function house(seed: number, scale = 1): THREE.Group {
  const rng = rngFrom(seed);
  const walls = ['#f2efe9', '#e8ddc6', '#d9e2ea', '#f0e0d0'][Math.floor(rng() * 4)]!;
  const roofColor = ['#8a4b32', '#5a4a42', '#7a3b2e'][Math.floor(rng() * 3)]!;
  const h = new THREE.Group();
  h.add(box(6, 2.8, 5, walls, [0, 1.4, 0]));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.4, 1.9, 4, 1), flat(roofColor));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.0, 1, 0.82);
  roof.position.y = 3.75;
  roof.castShadow = true;
  h.add(roof);
  h.add(box(1, 1.8, 0.1, '#6e4a33', [-1.2, 0.9, 2.52]), box(1.2, 1, 0.1, '#7fb3d9', [1.5, 1.6, 2.52]));
  h.scale.setScalar(scale);
  return h;
}

export function lamp(): THREE.Group {
  return group(box(0.14, 5.2, 0.14, '#2b2f36', [0, 2.6, 0]), box(1.1, 0.12, 0.2, '#2b2f36', [0.5, 5.2, 0]));
}

export function toilet(): THREE.Group {
  const t = new THREE.Group();
  const white = '#f4f6f8';
  const shade = '#dfe5ea';
  t.add(box(0.72, 0.85, 0.3, white, [0, 0.78, -0.55]));
  t.add(box(0.76, 0.07, 0.34, shade, [0, 1.24, -0.55]));
  t.add(box(0.1, 0.06, 0.06, '#9aa3ad', [0.2, 1.3, -0.5]));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.4, 8), flat(white));
  base.position.set(0, 0.2, -0.3);
  base.castShadow = true;
  t.add(base);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.26, 0.28, 10), flat(white));
  bowl.position.set(0, 0.5, -0.12);
  bowl.scale.z = 1.25;
  bowl.castShadow = true;
  t.add(bowl);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 10), flat(shade));
  seat.position.set(0, 0.66, -0.12);
  seat.scale.z = 1.25;
  t.add(seat);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 10), flat('#a9dcee'));
  water.position.set(0, 0.69, -0.12);
  water.scale.z = 1.2;
  t.add(water);
  return t;
}

export function dust(color: THREE.ColorRepresentation, count: number, spread: Vec3, seed: number, size = 0.08): THREE.Points {
  const rng = rngFrom(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * spread[0];
    positions[i * 3 + 1] = (rng() - 0.5) * spread[1];
    positions[i * 3 + 2] = (rng() - 0.5) * spread[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({color, size, sizeAttenuation: true}));
}
