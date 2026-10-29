import * as THREE from 'three';
import {box, clamp01, easeOut, fbm, hash3, lerp, rngFrom, smooth, type Pose, type ShotState, type WorldBuild} from './core.ts';
import {heroLook, makePerson} from './people.ts';
import {wrap} from './agents.ts';
import {beam, debris, starfield} from './effects.ts';

const daylight = {sky: '#e6eef6', ground: '#9a9488', intensity: 1.0};
const dark = {sky: '#1b2236', ground: '#05060a', intensity: 0.5};
const dummy = new THREE.Object3D();

export function buildCity(seed: number): WorldBuild {
  const rng = rngFrom(seed);
  const root = new THREE.Group();
  const grid = 22;
  const cell = 6.4;
  const count = grid * grid;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({flatShading: true, roughness: 0.95}), count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const palette = ['#dcdad4', '#c8c5bd', '#e6e2da', '#b8b3a8', '#d98a5b', '#e8e8e6', '#aeb8c4'].map(c => new THREE.Color(c));
  const cells: {x: number; z: number; w: number; d: number; h: number}[] = [];
  let i = 0;
  for (let gx = 0; gx < grid; gx++) for (let gz = 0; gz < grid; gz++) {
    const x = (gx - grid / 2) * cell;
    const z = (gz - grid / 2) * cell;
    const street = gx % 4 === 0 || gz % 4 === 0;
    const h = street ? 0.2 : 2 + rng() * rng() * 22;
    cells.push({x, z, w: street ? cell : cell * (0.6 + rng() * 0.3), d: street ? cell : cell * (0.6 + rng() * 0.3), h});
    mesh.setColorAt(i++, street ? new THREE.Color('#6d717b') : palette[Math.floor(rng() * palette.length)]!);
  }
  root.add(mesh);
  root.add(box(300, 0.3, 300, '#a7a49c', [0, -0.3, 0], {}));
  const carCount = 150;
  const traffic = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({flatShading: true, roughness: 0.9}), carCount);
  traffic.frustumCulled = false;
  traffic.castShadow = true;
  const carPalette = ['#2f5fd0', '#e9ecef', '#e6c229', '#c0392b', '#3a3f48', '#3a9d6a'].map(c => new THREE.Color(c));
  const lanes = Array.from({length: carCount}, (_, i) => {
    const street = (Math.floor(rng() * (grid / 4)) * 4 - grid / 2) * cell + (rng() < 0.5 ? -0.9 : 0.9);
    traffic.setColorAt(i, carPalette[i % carPalette.length]!);
    return {street, alongX: i % 2 === 0, start: (rng() - 0.5) * grid * cell, speed: (3 + rng() * 5) * (rng() < 0.5 ? -1 : 1)};
  });
  root.add(traffic);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({color: '#2d241d'}));
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = 0.06;
  root.add(crater);
  const rubble = debris(160, seed + 3, ['#d7d3ca', '#b9b4a8', '#c86e44', '#8f8a80'], 0.55, 22, 18, 0.9);
  root.add(rubble.mesh);

  const radius = (s: ShotState) => (4 + s.rung * 5.5) * easeOut(s.sinceTick / 0.7 + 0.3) * (s.rung > 0 ? 1 : 0.1);
  const update = (s: ShotState) => {
    const r = radius(s);
    cells.forEach((c, k) => {
      const dist = Math.hypot(c.x, c.z);
      const squash = dist < r ? clamp01((dist - r * 0.55) / (r * 0.45 + 0.001)) * 0.9 + 0.02 : 1;
      dummy.position.set(c.x, (c.h * squash) / 2, c.z);
      dummy.scale.set(c.w, Math.max(0.15, c.h * squash), c.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    const half = (grid * cell) / 2;
    lanes.forEach((lane, k) => {
      const along = wrap(lane.start + lane.speed * s.t, -half, half);
      const x = lane.alongX ? along : lane.street;
      const z = lane.alongX ? lane.street : along;
      const gone = Math.hypot(x, z) < r * 0.55;
      dummy.position.set(x, gone ? -5 : 0.45, z);
      dummy.scale.set(lane.alongX ? 2.4 : 1.2, 0.8, lane.alongX ? 1.2 : 2.4);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      traffic.setMatrixAt(k, dummy.matrix);
    });
    traffic.instanceMatrix.needsUpdate = true;
    if (traffic.instanceColor) traffic.instanceColor.needsUpdate = true;
    crater.scale.setScalar(Math.max(0.01, r * 0.5));
    rubble.update(s.sinceTick, [0, 2, 0], 0.9 + s.level, 3);
  };
  const camera = (s: ShotState): Pose => {
    const a = s.t * 0.12 + 0.5;
    const radiusCam = lerp(52, 96, s.u);
    const height = lerp(44, 105, s.u);
    return {position: [Math.sin(a) * radiusCam, height, Math.cos(a) * radiusCam], target: [0, 0, 0], fov: 55};
  };
  return {root, update, camera, background: '#c6d4e1', fog: {color: '#c6d4e1', near: 90, far: 260}, sun: {intensity: 2.6, position: [60, 90, 40], color: '#fff2dc'}, ambient: daylight};
}

export function buildTerrain(seed: number): WorldBuild {
  const root = new THREE.Group();
  const n = 72;
  const size = 1.5;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({flatShading: true, roughness: 1}), n * n);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  const heights: number[] = [];
  const colors = ['#4f9d3a', '#5fae3f', '#6ab94a', '#7b7a43', '#a98a52', '#b79b66'].map(c => new THREE.Color(c));
  let i = 0;
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    const f = fbm(x * 0.09 + seed, z * 0.09, 4);
    heights.push(Math.floor(f * 6) * 0.5);
    mesh.setColorAt(i++, colors[Math.min(colors.length - 1, Math.floor(f * 7.2))]!);
  }
  root.add(mesh);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.9}));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 1.3;
  root.add(ring);
  const rubble = debris(100, seed + 4, ['#6b5a40', '#8a7550', '#3a2f22'], 0.7, 18, 14, 1);
  root.add(rubble.mesh);

  const update = (s: ShotState) => {
    const crater = (2 + s.rung * 0.5) * (0.7 + easeOut(s.sinceTick / 0.6) * 0.3) + s.level * 5;
    let k = 0;
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
      const px = (x - n / 2) * size;
      const pz = (z - n / 2) * size;
      const d = Math.hypot(px, pz);
      const base = heights[k]!;
      const inside = d < crater;
      const rim = d < crater * 1.2 && d >= crater;
      const h = inside ? 0.2 : rim ? base + 0.7 : base;
      dummy.position.set(px, h / 2, pz);
      dummy.scale.set(size, Math.max(0.1, h), size);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      if (inside) mesh.setColorAt(k, new THREE.Color(d < crater * 0.55 ? '#241a14' : '#4a3a2c'));
      k++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    ring.scale.setScalar(Math.max(0.1, crater * 1.05));
    ring.visible = s.sinceTick > 0.15 && s.sinceTick < s.period;
    rubble.update(s.sinceTick, [0, 1, 0], 1 + s.level, 2.6);
  };
  const camera = (s: ShotState): Pose => ({position: [Math.sin(s.t * 0.05) * 6, lerp(48, 82, s.u), 26 + Math.cos(s.t * 0.05) * 4], target: [0, 0, 0], fov: 52});
  return {root, update, camera, background: '#bcd3e6', fog: {color: '#bcd3e6', near: 120, far: 300}, sun: {intensity: 2.5, position: [30, 60, 20], color: '#fff2dc'}, ambient: daylight};
}

export type GlobeVariant = 'earth' | 'sun';

export function buildGlobe(seed: number, variant: GlobeVariant = 'earth'): WorldBuild {
  const root = new THREE.Group();
  const R = 3;
  const geometry = new THREE.IcosahedronGeometry(R, 4);
  const position = geometry.attributes.position!;
  const colorAttr = new Float32Array(position.count * 3);
  const ocean = new THREE.Color('#2f7bd0');
  const shallow = new THREE.Color('#4a9be0');
  const land = [new THREE.Color('#4f9d3a'), new THREE.Color('#6aae45'), new THREE.Color('#b79b66'), new THREE.Color('#e9ecef')];
  const hot = [new THREE.Color('#ff6a14'), new THREE.Color('#ff8a1f'), new THREE.Color('#ffb02e'), new THREE.Color('#ffd36b')];
  const tri = new THREE.Vector3();
  for (let f = 0; f < position.count; f += 3) {
    tri.set(0, 0, 0);
    for (let k = 0; k < 3; k++) tri.add(new THREE.Vector3().fromBufferAttribute(position, f + k));
    tri.normalize();
    const v = fbm(tri.x * 2.2 + seed, tri.y * 2.2 + tri.z * 1.3, 4);
    let c: THREE.Color;
    if (variant === 'earth') c = Math.abs(tri.y) > 0.9 ? land[3]! : v > 0.52 ? land[v > 0.66 ? 2 : (hash3(f, 1, 1) > 0.5 ? 0 : 1)]! : (v > 0.46 ? shallow : ocean);
    else c = hot[Math.min(3, Math.floor(fbm(tri.x * 7 + seed, tri.y * 7 + tri.z * 3, 3) * 4.2 + hash3(f, 2, 3) * 0.9))]!;
    for (let k = 0; k < 3; k++) colorAttr.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
  const material = variant === 'earth' ? new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.9}) : new THREE.MeshBasicMaterial({vertexColors: true});
  const planet = new THREE.Mesh(geometry, material);
  planet.castShadow = variant === 'earth';
  root.add(planet);

  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 1.05, 3), new THREE.MeshStandardMaterial({color: '#bfe3ff', flatShading: true, transparent: true, opacity: 0.3, roughness: 0.2, depthWrite: false}));
  shell.visible = variant === 'earth';
  root.add(shell);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 40, 20, 0, Math.PI * 2, 0, 1), new THREE.MeshBasicMaterial({color: '#e8641c'}));
  cap.rotation.x = Math.PI / 2;
  root.add(cap);
  const cracks: THREE.Mesh[] = [];
  const rng = rngFrom(seed + 17);
  for (let c = 0; c < 18; c++) {
    const pts: THREE.Vector3[] = [];
    const heading = rng() * Math.PI * 2;
    for (let k = 0; k <= 30; k++) {
      const phi = (k / 30) * 1.1;
      const wob = Math.sin(k * 0.7 + c) * 0.05;
      const th = heading + wob;
      pts.push(new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th), Math.cos(phi)).multiplyScalar(R * 1.015));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.024, 4), new THREE.MeshBasicMaterial({color: '#ffcf4a'}));
    cracks.push(tube);
    root.add(tube);
  }
  const embers = debris(220, seed + 21, ['#ffb347', '#ffd77a', '#ff7a1a'], 0.09, 2.2, 0.3, 1);
  root.add(embers.mesh);
  const stars = starfield(500, seed + 31);
  root.add(stars);

  const update = (s: ShotState) => {
    planet.rotation.y = s.t * 0.12;
    const hit = easeOut(s.sinceTick / 0.5);
    cap.visible = variant === 'earth' && s.level > 0.02;
    const angle = lerp(0.06, 0.22, clamp01(s.level * 1.1)) * (0.92 + 0.08 * hit);
    cap.geometry.dispose();
    cap.geometry = new THREE.SphereGeometry(R * 1.012, 40, 20, 0, Math.PI * 2, 0, angle);
    for (const c of cracks) {
      const count = (c.geometry.index?.count ?? 0);
      c.geometry.setDrawRange(0, Math.floor((count / 3) * clamp01(s.level * 1.3 + 0.04)) * 3);
    }
    const shellMat = shell.material as THREE.MeshStandardMaterial;
    shellMat.opacity = 0.32 * (1 - smooth(0.3, 0.9, s.level));
    shell.scale.setScalar(1 + smooth(0.3, 1, s.level) * 0.12);
    embers.update(s.t % 3, [0, 0, 0], 1 + s.level, 6);
    embers.mesh.visible = variant === 'sun' || s.level > 0.5;
  };
  const camera = (s: ShotState): Pose => {
    const d = lerp(12.5, 15, s.u);
    return {position: [Math.sin(0.4) * d * 0.4, 1.6, d], target: [0, 0.2, 0], fov: 40};
  };
  return {root, update, camera, background: '#02030a', sun: {intensity: variant === 'earth' ? 3.0 : 0.2, position: [14, 6, 10], color: '#ffffff'}, ambient: {...dark, intensity: variant === 'earth' ? 0.7 : 1.5}};
}

export type SpaceVariant = 'plain' | 'moon' | 'earth';

export function buildSpace(seed: number, variant: SpaceVariant = 'plain'): WorldBuild {
  const root = new THREE.Group();
  root.add(starfield(900, seed));
  const hero = makePerson(heroLook, 1);
  root.add(hero.root);
  if (variant !== 'plain') {
    const geometry = new THREE.IcosahedronGeometry(variant === 'moon' ? 3.2 : 14, variant === 'moon' ? 3 : 4);
    const position = geometry.attributes.position!;
    const col = new Float32Array(position.count * 3);
    const v3 = new THREE.Vector3();
    for (let f = 0; f < position.count; f += 3) {
      v3.set(0, 0, 0);
      for (let k = 0; k < 3; k++) v3.add(new THREE.Vector3().fromBufferAttribute(position, f + k));
      v3.normalize();
      const n = fbm(v3.x * 2.4 + seed, v3.y * 2.4 + v3.z, 3);
      const c = variant === 'moon' ? new THREE.Color().setHSL(0, 0, 0.55 + n * 0.3) : (n > 0.5 ? new THREE.Color('#5fae3f') : new THREE.Color('#2f7bd0'));
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true}));
    body.position.set(variant === 'moon' ? 5 : 0, variant === 'moon' ? -1 : -15.5, variant === 'moon' ? -7 : -6);
    root.add(body);
  }
  const stream = beam('#f7e35a');
  root.add(stream.root);
  const update = (s: ShotState) => {
    hero.root.position.set(Math.sin(s.t * 0.6) * 0.3, Math.sin(s.t * 0.9) * 0.2, 0);
    hero.root.rotation.set(0.5 + s.t * 0.25, s.t * 0.4, 0.3 + s.t * 0.15);
    hero.set({arms: 'out', mouth: 0.5, wide: 0.8, brows: 1});
    const hip = new THREE.Vector3(0, 0.9, 0.2).applyEuler(hero.root.rotation).add(hero.root.position);
    const dir = new THREE.Vector3(0, 0, 1).applyEuler(hero.root.rotation);
    stream.set([hip.x, hip.y, hip.z], [hip.x + dir.x * 60, hip.y + dir.y * 60, hip.z + dir.z * 60], 0.03 + s.level * 0.06, 0.4 + s.level * 0.6);
  };
  const camera = (s: ShotState): Pose => ({position: [lerp(1.2, 0.2, easeOut(s.u)), lerp(0.9, 0.4, s.u), lerp(11, 8.5, easeOut(s.u))], target: [0, 0, 0], fov: 42});
  return {root, update, camera, background: '#000005', sun: {intensity: 2.4, position: [6, 4, 6], color: '#ffffff'}, ambient: {...dark, intensity: 0.8}};
}

export function buildExplosion(seed: number): WorldBuild {
  const root = new THREE.Group();
  root.add(starfield(600, seed));
  const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({color: '#fff6da', transparent: true, opacity: 1, depthWrite: false}));
  root.add(flash);
  const orange = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({color: '#ff8a1f', transparent: true, opacity: 0.9, depthWrite: false}));
  root.add(orange);
  const chunks = debris(120, seed + 5, ['#e8782e', '#c4561f', '#7a7f88', '#f2efe9'], 0.9, 9, 0, 0.6);
  root.add(chunks.mesh);
  const sparks = debris(200, seed + 7, ['#ffd77a', '#ff9a1f', '#ffffff'], 0.12, 14, 0, 0.6);
  root.add(sparks.mesh);
  const update = (s: ShotState) => {
    const t = s.t;
    flash.scale.setScalar(0.4 + easeOut(t / 1.6) * 12);
    (flash.material as THREE.MeshBasicMaterial).opacity = 1 - smooth(0.4, 2.2, t);
    orange.scale.setScalar(0.3 + easeOut(t / 2.2) * 6);
    (orange.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - smooth(0.8, 3, t));
    chunks.update(t, [0, 0, 0], 1, 6);
    sparks.update(t, [0, 0, 0], 1, 6);
  };
  const camera = (s: ShotState): Pose => ({position: [Math.sin(s.t * 0.7) * 1, 0.6, 9 + s.t * 0.3], target: [0, 0, 0], fov: 46});
  return {root, update, camera, background: '#050408', sun: {intensity: 1.2, position: [0, 5, 8]}, ambient: {...dark, intensity: 1.0}};
}

