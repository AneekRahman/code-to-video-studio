import * as THREE from 'three';
import {box, clamp01, easeOut, lerp, rngFrom, smooth, type Pose, type ShotState, type Vec3, type WorldBuild} from './core.ts';
import {heroLook, makePerson, type Look} from './people.ts';
import {awning, bench, bin, building, car, house, hydrant, lamp, toilet, tree, truck} from './props.ts';
import {crowd, makeFlock, makeWalkers, pigeonsAt, since, wrap} from './agents.ts';
import {beam, debris, shockwave} from './effects.ts';

export function buildStreet(seed: number): WorldBuild {
  const rng = rngFrom(seed);
  const root = new THREE.Group();
  const zMin = -100;
  const zMax = 50;
  const length = zMax - zMin;

  root.add(Object.assign(box(44, 0.2, length + 120, '#4a4e57', [6, -0.1, zMin + length / 2 - 40]), {castShadow: false}));
  root.add(box(6, 0.24, length + 120, '#b9c0ca', [-2, -0.02, zMin + length / 2 - 40]));
  root.add(box(6, 0.24, length + 120, '#b9c0ca', [14.5, -0.02, zMin + length / 2 - 40]));
  root.add(box(0.3, 0.3, length + 120, '#8d949e', [1.15, 0.02, zMin + length / 2 - 40]));
  root.add(box(0.3, 0.3, length + 120, '#8d949e', [11.85, 0.02, zMin + length / 2 - 40]));
  for (let z = zMin - 80; z < zMax; z += 6) root.add(box(0.18, 0.02, 2.6, '#e6c84a', [6.5, 0.02, z]));
  for (let z = zMin - 80; z < zMax; z += 4) root.add(box(5.9, 0.01, 0.04, '#9aa3ad', [-2, 0.11, z]));
  for (let z = zMin - 80; z < zMax; z += 40) for (let k = 0; k < 7; k++) root.add(box(0.5, 0.02, 3.6, '#e9ecef', [3 + k * 1.1, 0.02, z]));

  let z = zMin - 80;
  while (z < zMax + 10) {
    const w = 8 + rng() * 6;
    const h = 9 + rng() * 22;
    const b = building(10, h, w, Math.floor(rng() * 1e6));
    b.position.set(-9.2, h / 2, z + w / 2);
    root.add(b);
    if (rng() < 0.85) {
      const a = awning(w * 0.7, rng() < 0.5 ? '#e0622f' : rng() < 0.5 ? '#2e8f6a' : '#c0392b');
      a.position.set(-3.45, 3.1, z + w / 2);
      root.add(a);
      root.add(box(0.1, 2.6, w * 0.8, '#7ea7c9', [-4.04, 1.5, z + w / 2], {transparent: true, opacity: 0.85}));
      root.add(box(0.12, 0.5, w * 0.5, rng() < 0.5 ? '#f2efe9' : '#2b2f36', [-4.05, 3.4, z + w / 2]));
    }
    z += w;
  }
  z = zMin - 80;
  while (z < zMax + 10) {
    const w = 9 + rng() * 6;
    const h = 8 + rng() * 26;
    const b = building(10, h, w, Math.floor(rng() * 1e6));
    b.position.set(21, h / 2, z + w / 2);
    b.rotation.y = Math.PI;
    root.add(b);
    z += w;
  }
  for (let i = 0; i < 16; i++) {
    const h = 26 + rng() * 38;
    const tower = building(12 + rng() * 8, h, 12 + rng() * 8, Math.floor(rng() * 1e6), true);
    tower.position.set(-10 + i * 4.5 - 12, h / 2, zMin - 150 - rng() * 30);
    root.add(tower);
  }
  for (let t = zMin - 80; t < zMax + 10; t += 7.5) {
    const left = tree(0.85 + rng() * 0.2);
    left.position.set(2.7 + rng() * 0.2, 0.1, t);
    root.add(left);
    const right = tree(1 + rng() * 0.3);
    right.position.set(12.2, 0.1, t + 3);
    root.add(right);
  }
  for (let l = zMin - 80; l < zMax + 10; l += 18) {
    const post = lamp();
    post.position.set(-4.7, 0.1, l);
    post.rotation.y = Math.PI;
    root.add(post);
    const post2 = lamp();
    post2.position.set(12.4, 0.1, l + 9);
    post2.rotation.y = Math.PI;
    root.add(post2);
  }
  for (let f = zMin - 80; f < zMax + 10; f += 13) {
    const kind = Math.floor(rng() * 3);
    const item = kind === 0 ? bench() : kind === 1 ? bin() : hydrant();
    item.position.set(-4.4 + (kind === 0 ? 0.2 : 0), 0.1, f + rng() * 5);
    item.rotation.y = kind === 0 ? Math.PI / 2 : 0;
    root.add(item);
  }

  const carColors = ['#2f5fd0', '#e9ecef', '#e6c229', '#c0392b', '#3a3f48', '#2f5fd0', '#3a9d6a'];
  const cars = Array.from({length: 22}, (_, i) => {
    const mesh = car(carColors[i % carColors.length]!, 1);
    const oncoming = i % 2 === 0;
    const parked = i % 5 === 0;
    const x = parked ? 10.4 : oncoming ? 9.2 : 3.9;
    const speed = parked ? 0 : (oncoming ? 1 : -1) * (5 + rng() * 5);
    const z0 = zMin + (i / 22) * length + rng() * 4;
    mesh.rotation.y = oncoming || parked ? Math.PI : 0;
    root.add(mesh);
    return {mesh, x, speed, z0, flip: rng() < 0.5 ? -1 : 1};
  });

  const hero = makePerson(heroLook);
  root.add(hero.root);
  const walkers = makeWalkers(rng, 40, [-3.9, -3.0, -2.1, 0.85, 12.6, 14.4], zMin, zMax);
  for (const w of walkers) {
    root.add(w.person.root);
    if (w.dog) root.add(w.dog);
  }
  for (const [i, w] of walkers.slice(0, 7).entries()) {
    w.spec.z0 = -68 - i * 5.5 - rng() * 2;
    w.spec.x = [-3.0, -2.1, 0.85][i % 3]! + (rng() - 0.5) * 0.3;
    w.spec.speed = (i % 2 ? 1 : -1) * (1.0 + rng() * 0.5);
  }
  const people = crowd(walkers);
  const flock = makeFlock(rng, 9, [1.5, 0, 3], 2.6);
  for (const p of flock.birds) root.add(p.bird.root);

  const glass = debris(90, seed + 5, ['#bfe3f5', '#e8f6ff', '#9ccbe8'], 0.1, 7, 6, 0.9);
  root.add(glass.mesh);
  const wave = shockwave('#ffffff');
  root.add(wave.mesh);
  const heroStart = -62;
  const speed = 1.35;

  const update = (s: ShotState) => {
    const zPos = heroStart + s.t * speed;
    hero.root.position.set(-0.35, 0.1, zPos);
    hero.set({walk: s.t * 6.4, walkAmplitude: 0.62, arms: s.level > 0.34 ? 'ears' : 'swing', mouth: s.sinceTick < 0.35 && s.rung > 0 ? 0.9 : 0, wide: s.rung > 3 ? 0.5 : 0, brows: clamp01(s.level * 3)});
    people.update(s, [-0.35, 0.1, zPos], zMin, zMax);
    pigeonsAt(flock, s, [0, 0, zPos], since(s, 2));
    for (const [i, c] of cars.entries()) {
      const brake = clamp01(since(s, 7) / 1.5);
      const lift = since(s, 11);
      const moved = c.speed * s.t * (1 - brake) * (lift > 0 ? 0 : 1);
      const near = Math.abs(zPos - wrap(c.z0 + moved, zMin, zMax)) < 40;
      const z = wrap(c.z0 + c.speed * s.t - (near ? c.speed * s.t * brake : 0), zMin, zMax);
      const up = near && lift > 0 ? Math.max(0, lift * 5 - lift * lift * 4.9) : 0;
      c.mesh.position.set(c.x + (near && lift > 0 ? c.flip * lift * 2.8 : 0), up + (i % 3 === 0 ? brake * 0.05 : 0), z);
      c.mesh.rotation.z = near && lift > 0 ? c.flip * lift * 1.6 : 0;
    }
    glass.update(since(s, 9), [-3.6, 2.4, zPos - 3], 1, 3.5);
    const r = (0.9 + s.rung * 0.55) * easeOut(s.sinceTick / 0.55);
    wave.mesh.position.set(0, 0.1, zPos);
    wave.set(r, 0.16 * (1 - clamp01(s.sinceTick / s.period)) ** 1.4 * (s.rung >= 1 ? 1 : 0));
  };

  const camera = (s: ShotState): Pose => {
    const zPos = heroStart + s.t * speed;
    const shake = (1 - clamp01(s.sinceTick / 0.3)) * s.level * 0.07;
    const sx = Math.sin(s.t * 70) * shake;
    const sy = Math.cos(s.t * 83) * shake;
    return {position: [-1.0 + sx, 1.45 + sy, zPos + 4.6], target: [1.4, 1.05, zPos - 3], fov: 64};
  };
  return {root, update, camera, background: '#b9cfe2', fog: {color: '#cfdceb', near: 55, far: 190}, sun: {intensity: 2.2, position: [-12, 22, 14], color: '#fff2dc'}, ambient: {sky: '#e6eef6', ground: '#b4b0a8', intensity: 1.55}};
}

export function buildBathroom(seed: number): WorldBuild {
  const rng = rngFrom(seed);
  const root = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#c9d3dc' : '#8fa1b3';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  const tiles = new THREE.CanvasTexture(canvas);
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(6, 6);
  tiles.magFilter = THREE.NearestFilter;
  tiles.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({map: tiles, roughness: 0.8}));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  root.add(box(8, 3.6, 0.2, '#a9d6cf', [0, 1.8, -1.2]), box(0.2, 3.6, 8, '#ecefec', [-2.4, 1.8, 0]), box(0.2, 3.6, 8, '#ecefec', [3.4, 1.8, 0]));
  for (let i = 0; i < 6; i++) root.add(box(8, 0.03, 0.02, '#8fc2ba', [0, 0.6 + i * 0.55, -1.09]));
  root.add(box(1.6, 2.2, 0.12, '#cfe6f2', [1.5, 2.2, -1.09], {emissive: new THREE.Color('#cfe8ff'), emissiveIntensity: 0.6}));
  root.add(box(1.6, 0.1, 0.3, '#ffffff', [1.5, 1.05, -1.0]));
  root.add(box(1.2, 0.1, 1.6, '#8ec6d8', [0, 0.06, 0.3]));
  const t = toilet();
  t.position.set(0, 0, -0.55);
  root.add(t);
  const hero = makePerson(heroLook);
  hero.root.position.set(0, 0.1, 0.55);
  hero.root.rotation.y = Math.PI;
  root.add(hero.root);
  const stream = beam('#f7e35a');
  root.add(stream.root);
  const bits = debris(70, seed + 1, ['#f7e35a', '#fff4a8'], 0.045, 3.2, 5, 0.6);
  root.add(bits.mesh);
  const bowl = debris(40, seed + 2, ['#f4f6f8', '#dfe5ea'], 0.14, 4.5, 9.8, 0.9);
  root.add(bowl.mesh);
  void rng;

  const update = (s: ShotState) => {
    const level = clamp01(s.level);
    hero.set({arms: 'down', lean: 0.04, mouth: 0, brows: 0});
    const thick = lerp(0.012, 0.16, level ** 1.5);
    const reach = lerp(0.45, 9, level ** 1.2);
    const origin: Vec3 = [0, 0.98, 0.34];
    const aim: Vec3 = [0, lerp(0.4, 2.4, level ** 1.4), lerp(0.34 - 0.5, -1.2 - reach, 1)];
    stream.set(origin, level < 0.2 ? [0, 0.45, -0.25] : aim, thick, level);
    bits.update(s.sinceTick, [0, 0.55, -0.25], 1 + level * 2, 1.2);
    bowl.update(since(s, 5) - 0.4, [0, 0.5, -0.2], 1.1, 3.2);
  };
  const camera = (s: ShotState): Pose => {
    const u = easeOut(s.u);
    return {position: [lerp(4.4, 3.2, u), lerp(3.8, 3.0, u), lerp(5.6, 4.6, u)], target: [0, 1.0, -0.3], fov: 42};
  };
  return {root, update, camera, background: '#cfd8df', sun: {intensity: 2.6, position: [4, 7, 4], color: '#fff4de'}, ambient: {sky: '#f4f8fb', ground: '#9fb3b8', intensity: 1.0}};
}

export type PortraitVariant = 'hero' | 'anchor';

export function buildPortrait(seed: number, variant: PortraitVariant = 'hero'): WorldBuild {
  void seed;
  const root = new THREE.Group();
  const look: Look = variant === 'anchor'
    ? {shirt: '#2447a8', pants: '#1a2850', skin: '#e0b48c', hair: '#aeb4bd', shoes: '#111', hoodie: false}
    : {...heroLook, skin: '#c99a73'};
  const person = makePerson(look, 3.2);
  person.root.position.set(0, -4.2, 0);
  root.add(person.root);
  if (variant === 'anchor') {
    person.root.add(box(0.18, 0.5, 0.04, '#ffffff', [0, 1.28, 0.19]), box(0.07, 0.34, 0.03, '#d7232d', [0, 1.26, 0.2]));
    person.root.add(box(0.42, 0.06, 0.06, '#1a1a1f', [0, 1.78, -0.05]));
  }
  const wall = box(30, 20, 0.3, '#d6dadf', [0, 0, -5]);
  wall.castShadow = false;
  root.add(wall);
  const update = (s: ShotState) => {
    const t = clamp01(s.level * 1.6 + s.rung * 0.04);
    const talk = Math.abs(Math.sin(s.t * 9));
    person.set({arms: 'down', mouth: variant === 'anchor' ? talk * 0.7 : smooth(0, 0.5, t) * 0.7 + (s.sinceTick < 0.3 ? 0.25 : 0), wide: smooth(0.1, 0.6, t), brows: smooth(0, 0.5, t), grit: t > 0.8 ? 1 : 0});
    person.head.rotation.y = Math.sin(s.t * 1.3) * 0.06;
    person.head.rotation.z = Math.sin(s.t * 0.9) * 0.025;
  };
  const camera = (s: ShotState): Pose => {
    const u = easeOut(s.u);
    return {position: [lerp(0.3, 0, u), lerp(1.9, 1.78, u), lerp(7.6, 6.4, u)], target: [0, 1.62, 0], fov: 26};
  };
  return {root, update, camera, background: '#d6dadf', sun: {intensity: 2.2, position: [5, 8, 8], color: '#fff2dc'}, ambient: {sky: '#ffffff', ground: '#c1c6cc', intensity: 1.1}};
}

export function buildSuburb(seed: number): WorldBuild {
  const rng = rngFrom(seed);
  const root = new THREE.Group();
  root.add(Object.assign(box(160, 0.2, 140, '#5ebb3f', [0, -0.1, 0]), {castShadow: false}));
  root.add(box(160, 0.12, 8, '#4a4e57', [0, 0.02, 4]));
  for (let x = -70; x < 70; x += 6) root.add(box(2.6, 0.02, 0.18, '#e6c84a', [x, 0.09, 4]));
  root.add(box(160, 0.14, 2.4, '#bfc5cc', [0, 0.02, -0.2]));
  root.add(box(160, 0.14, 2.4, '#bfc5cc', [0, 0.02, 8.2]));
  for (let i = 0; i < 14; i++) {
    const h = house(Math.floor(rng() * 1e6), 1.1);
    h.position.set(-58 + i * 9, 0, -9 - (i % 2) * 1.5);
    root.add(h);
    const tr = tree(1.2);
    tr.position.set(-58 + i * 9 + 4.6, 0, -6.2);
    root.add(tr);
    for (let f = 0; f < 5; f++) root.add(box(0.1, 0.9, 0.1, '#f6f6f2', [-58 + i * 9 - 3 + f * 1.5, 0.45, -4.6]), box(1.4, 0.08, 0.06, '#f6f6f2', [-58 + i * 9 - 2.2 + f * 1.5, 0.7, -4.6]));
    const hedge = box(2.6, 0.7, 0.8, '#3f8f35', [-58 + i * 9 + 1, 0.35, -3.3]);
    root.add(hedge);
  }
  const wallBlock = box(7, 1.2, 0.4, '#d8cfc0', [0, 0.6, -5.2]);
  root.add(wallBlock, box(7.2, 0.14, 0.5, '#bfb5a4', [0, 1.27, -5.2]));
  const lampPost = lamp();
  lampPost.position.set(-4, 0, 1.2);
  root.add(lampPost);
  const vehicle = truck('#c0392b');
  vehicle.position.set(9, 0, 5.2);
  vehicle.rotation.y = Math.PI / 2;
  root.add(vehicle);
  const parked = [['#2f5fd0', -14], ['#e9ecef', 17], ['#e6c229', -27]] as const;
  for (const [color, x] of parked) {
    const c = car(color, 1);
    c.position.set(x, 0, 1.1);
    c.rotation.y = Math.PI / 2;
    root.add(c);
  }
  const traffic = Array.from({length: 8}, (_, i) => {
    const mesh = car(['#3a3f48', '#c0392b', '#2f5fd0', '#e9ecef'][i % 4]!, 1);
    mesh.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2;
    root.add(mesh);
    return {mesh, z: i % 2 ? 5.4 : 2.7, speed: (i % 2 ? 1 : -1) * (5 + rng() * 4), x0: -60 + (i / 8) * 120};
  });
  const hero = makePerson(heroLook);
  root.add(hero.root);
  const stream = beam('#f7e35a');
  root.add(stream.root);
  const rubble = debris(130, seed + 9, ['#c9d6e6', '#e8e1d3', '#c46a45', '#a7b4c4'], 0.28, 8, 7, 1);
  root.add(rubble.mesh);

  const alongX = makeWalkers(rng, 14, [-0.2, 9.2], -60, 60);
  for (const w of alongX) {
    root.add(w.person.root);
    if (w.dog) root.add(w.dog);
  }
  const people = crowd(alongX, 'x');

  const update = (s: ShotState) => {
    const level = clamp01(s.level);
    const kick = s.u * 0.5;
    hero.root.position.set(lerp(-1.5, 1.2, kick), 0.1 + Math.max(0, level - 0.04) * 2.2 * Math.sin(Math.min(1, s.t * 0.6) * Math.PI), 4.4);
    hero.root.rotation.set(0, 0.5, 0);
    hero.set({arms: 'out', mouth: 0.8, wide: 0.8, brows: 1, lean: -0.3});
    people.update(s, [hero.root.position.x, 0, hero.root.position.z], -60, 60);
    for (const t of traffic) t.mesh.position.set(wrap(t.x0 + t.speed * s.t, -70, 70), 0, t.z);
    stream.set([hero.root.position.x, hero.root.position.y + 0.95, hero.root.position.z + 0.4], [hero.root.position.x - 8 - level * 60, 1 + level * 8, -2 - level * 30], lerp(0.03, 0.4, level), level);
    rubble.update(Math.max(0, s.sinceTick), [0, 1.2, -5], 0.7 + level * 1.4, 3.5);
    wallBlock.visible = level < 0.02 || s.sinceTick < 0.02;
  };
  const camera = (s: ShotState): Pose => {
    const u = easeOut(s.u);
    return {position: [lerp(7, 2.2, u), lerp(2.2, 1.6, u), lerp(14, 11, u)], target: [-1, 1.8, -1], fov: 52};
  };
  return {root, update, camera, background: '#cfe1ef', fog: {color: '#d8e6f1', near: 50, far: 150}, sun: {intensity: 2.4, position: [-14, 18, 12], color: '#fff2dc'}, ambient: {sky: '#e6eef6', ground: '#b4b0a8', intensity: 1.5}};
}
