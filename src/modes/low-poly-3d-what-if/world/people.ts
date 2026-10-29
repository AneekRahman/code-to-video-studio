import * as THREE from 'three';
import {box, flat, group, type Vec3} from './core.ts';

export type Look = {shirt: string; pants: string; skin: string; hair: string; shoes: string; hoodie?: boolean};

export const heroLook: Look = {shirt: '#d7232d', pants: '#b9bcc1', skin: '#d9a982', hair: '#2a1d18', shoes: '#f3f4f6', hoodie: true};

export const bystanderLooks: Look[] = [
  {shirt: '#e8782e', pants: '#26324a', skin: '#8a5a3c', hair: '#1c1412', shoes: '#f3f4f6'},
  {shirt: '#5b43d6', pants: '#1f2a44', skin: '#a8714f', hair: '#16100e', shoes: '#3a2a22'},
  {shirt: '#f2f2f0', pants: '#1c2233', skin: '#6e4630', hair: '#0f0b0a', shoes: '#f3f4f6'},
  {shirt: '#d7232d', pants: '#1a1a1f', skin: '#d6a47c', hair: '#4a2c1a', shoes: '#3a2a22'},
  {shirt: '#3a7bd5', pants: '#4a5568', skin: '#e0b48c', hair: '#c9b79c', shoes: '#f3f4f6'},
];

export type PersonPose = {
  /** Walk phase in radians; the legs and arms swing with it. */
  walk?: number;
  walkAmplitude?: number;
  arms?: 'swing' | 'up' | 'ears' | 'out' | 'forward' | 'down';
  /** Jaw open, 0 to 1. */
  mouth?: number;
  /** Eyes wide, 0 to 1. */
  wide?: number;
  /** Brows raised, 0 to 1. */
  brows?: number;
  /** Teeth showing instead of a dark mouth. */
  grit?: number;
  lean?: number;
};

export type Person = {
  root: THREE.Group;
  head: THREE.Group;
  set(pose: PersonPose): void;
};

const pivot = (at: Vec3, ...children: THREE.Object3D[]) => {
  const g = group(...children);
  g.position.set(...at);
  return g;
};

/** A blocky person about 1.8 units tall, standing on y = 0 and facing +z. */
export function makePerson(look: Look, scale = 1): Person {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = box(0.62, 0.66, 0.34, look.shirt, [0, 1.18, 0]);
  const hip = box(0.58, 0.18, 0.32, look.pants, [0, 0.8, 0]);
  body.add(torso, hip);
  if (look.hoodie) {
    body.add(box(0.68, 0.14, 0.4, look.shirt, [0, 1.52, 0]));
    body.add(box(0.06, 0.2, 0.02, '#e9e9ea', [-0.1, 1.34, 0.18]), box(0.06, 0.2, 0.02, '#e9e9ea', [0.1, 1.34, 0.18]));
  }

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  const skull = box(0.36, 0.38, 0.36, look.skin, [0, 0.2, 0]);
  const hair = box(0.4, 0.14, 0.4, look.hair, [0, 0.42, -0.01]);
  const fringe = box(0.4, 0.1, 0.1, look.hair, [0, 0.36, 0.15]);
  const nose = box(0.06, 0.08, 0.06, look.skin, [0, 0.17, 0.2]);
  nose.material = flat(new THREE.Color(look.skin).multiplyScalar(0.92));
  const eyeL = box(0.07, 0.07, 0.02, '#111111', [-0.09, 0.25, 0.185]);
  const eyeR = box(0.07, 0.07, 0.02, '#111111', [0.09, 0.25, 0.185]);
  const scleraL = box(0.13, 0.1, 0.012, '#ffffff', [-0.09, 0.25, 0.182]);
  const scleraR = box(0.13, 0.1, 0.012, '#ffffff', [0.09, 0.25, 0.182]);
  const browL = box(0.1, 0.03, 0.02, look.hair, [-0.09, 0.32, 0.19]);
  const browR = box(0.1, 0.03, 0.02, look.hair, [0.09, 0.32, 0.19]);
  const mouth = box(0.14, 0.04, 0.02, '#1a0d0d', [0, 0.07, 0.19]);
  const teeth = box(0.12, 0.03, 0.02, '#ffffff', [0, 0.09, 0.195]);
  teeth.visible = false;
  head.add(skull, hair, fringe, nose, scleraL, scleraR, eyeL, eyeR, browL, browR, mouth, teeth);
  body.add(head);

  const armL = pivot([-0.38, 1.46, 0], box(0.18, 0.62, 0.2, look.shirt, [0, -0.28, 0]), box(0.16, 0.14, 0.18, look.skin, [0, -0.62, 0]));
  const armR = pivot([0.38, 1.46, 0], box(0.18, 0.62, 0.2, look.shirt, [0, -0.28, 0]), box(0.16, 0.14, 0.18, look.skin, [0, -0.62, 0]));
  const legL = pivot([-0.15, 0.78, 0], box(0.22, 0.7, 0.24, look.pants, [0, -0.35, 0]), box(0.24, 0.1, 0.34, look.shoes, [0, -0.75, 0.05]));
  const legR = pivot([0.15, 0.78, 0], box(0.22, 0.7, 0.24, look.pants, [0, -0.35, 0]), box(0.24, 0.1, 0.34, look.shoes, [0, -0.75, 0.05]));
  body.add(armL, armR, legL, legR);
  root.scale.setScalar(scale);

  const set = (pose: PersonPose) => {
    const walk = pose.walk ?? 0;
    const amp = pose.walkAmplitude ?? 0;
    const swing = Math.sin(walk) * amp;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    body.position.y = Math.abs(Math.sin(walk)) * amp * 0.06;
    body.rotation.x = pose.lean ?? 0;
    const arms = pose.arms ?? 'swing';
    if (arms === 'swing') {
      armL.rotation.set(-swing * 0.9, 0, 0.06);
      armR.rotation.set(swing * 0.9, 0, -0.06);
    } else if (arms === 'up') {
      armL.rotation.set(Math.PI * 0.95, 0, 0.3);
      armR.rotation.set(Math.PI * 0.95, 0, -0.3);
    } else if (arms === 'ears') {
      armL.rotation.set(Math.PI * 0.82, 0, -0.55);
      armR.rotation.set(Math.PI * 0.82, 0, 0.55);
    } else if (arms === 'out') {
      armL.rotation.set(0, 0, Math.PI * 0.45);
      armR.rotation.set(0, 0, -Math.PI * 0.45);
    } else if (arms === 'forward') {
      armL.rotation.set(Math.PI * 0.5, 0, 0);
      armR.rotation.set(Math.PI * 0.5, 0, 0);
    } else {
      armL.rotation.set(0, 0, 0.05);
      armR.rotation.set(0, 0, -0.05);
    }
    const open = pose.mouth ?? 0;
    const grit = pose.grit ?? 0;
    mouth.scale.set(1 - open * 0.2, 1 + open * 3, 1);
    mouth.position.y = 0.07 - open * 0.025;
    mouth.visible = grit < 0.5;
    teeth.visible = grit >= 0.5;
    const wide = pose.wide ?? 0;
    for (const eye of [eyeL, eyeR]) eye.scale.set(1 - wide * 0.15, 1 + wide * 0.5, 1);
    for (const sclera of [scleraL, scleraR]) {
      sclera.visible = wide > 0.3;
      sclera.scale.set(1, 0.6 + wide * 0.8, 1);
    }
    const brows = pose.brows ?? 0;
    browL.position.y = 0.32 + brows * 0.05;
    browR.position.y = 0.32 + brows * 0.05;
    browL.rotation.z = -brows * 0.25;
    browR.rotation.z = brows * 0.25;
  };
  set({});
  return {root, head, set};
}
