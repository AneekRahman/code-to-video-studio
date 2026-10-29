import {useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {Palette} from './theme.ts';
import {easeAt, springAt, useClock, type Clock} from './clock.tsx';
import {orbitPose, SoftLights, Stage3D} from './stage3d.tsx';

export type Platform = 'youtube' | 'instagram';

const WIDTH = 900;
const HEIGHT = 700;
const SPACING = 3.0;
const BURST = 14;

function roundedRect(width: number, height: number, radius: number): THREE.Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function gradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(100, 560, 20, 100, 560, 700);
  gradient.addColorStop(0, '#fdf497');
  gradient.addColorStop(0.28, '#fd7b49');
  gradient.addColorStop(0.5, '#e1306c');
  gradient.addColorStop(0.78, '#9b36b7');
  gradient.addColorStop(1, '#4c5fd5');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function YouTubeLogo() {
  const body = useMemo(() => new RoundedBoxGeometry(2.2, 1.55, 0.55, 5, 0.46), []);
  const play = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 0.48);
    shape.lineTo(-0.3, -0.48);
    shape.lineTo(0.55, 0);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.07, bevelSegments: 4});
  }, []);
  return (
    <group>
      <mesh geometry={body} castShadow receiveShadow>
        <meshStandardMaterial color="#ff1f3a" roughness={0.42}/>
      </mesh>
      <mesh geometry={play} position={[-0.02, 0, 0.27]} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.35}/>
      </mesh>
    </group>
  );
}

function InstagramLogo() {
  const body = useMemo(() => new RoundedBoxGeometry(1.8, 1.8, 0.55, 5, 0.52), []);
  const materials = useMemo(() => {
    const texture = gradientTexture();
    return [0, 1, 2, 3, 4, 5].map(face => new THREE.MeshStandardMaterial(face === 4 ? {map: texture, roughness: 0.42} : {color: '#b53a8e', roughness: 0.5}));
  }, []);
  const frame = useMemo(() => {
    const shape = roundedRect(1.2, 1.2, 0.36);
    shape.holes.push(new THREE.Path(roundedRect(0.98, 0.98, 0.26).getPoints(24)));
    return new THREE.ExtrudeGeometry(shape, {depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3});
  }, []);
  const white = <meshStandardMaterial color="#ffffff" roughness={0.35}/>;
  return (
    <group>
      <mesh geometry={body} material={materials} castShadow receiveShadow/>
      <mesh geometry={frame} position={[0, 0, 0.27]} castShadow>{white}</mesh>
      <mesh position={[0, 0, 0.3]} castShadow>
        <torusGeometry args={[0.3, 0.075, 18, 56]}/>
        {white}
      </mesh>
      <mesh position={[0.4, 0.4, 0.3]} castShadow>
        <sphereGeometry args={[0.075, 20, 20]}/>
        {white}
      </mesh>
    </group>
  );
}

function seeded(index: number): number {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Confetti({clock, landing, origin, palette}: {clock: Clock; landing: number; origin: number; palette: Palette}) {
  const geometry = useMemo(() => new RoundedBoxGeometry(0.22, 0.22, 0.07, 2, 0.03), []);
  const age = (clock.frame - landing) / clock.fps;
  if (age < 0 || age > 1.5) return null;
  const colors = [palette.accent, '#ffffff', '#ffd23f', palette.accent2];
  return (
    <>
      {Array.from({length: BURST}, (_, i) => {
        const angle = seeded(i + origin * 31) * Math.PI * 2;
        const speed = 1.6 + seeded(i * 3 + origin) * 2.4;
        const up = 2.4 + seeded(i * 5 + origin) * 2.2;
        const fall = Math.max(0, age);
        const x = Math.cos(angle) * speed * fall;
        const y = -0.7 + up * fall - 4.6 * fall * fall;
        const z = Math.sin(angle) * speed * fall * 0.7;
        const fade = Math.max(0, 1 - age / 1.5);
        return (
          <mesh key={i} geometry={geometry} position={[x, Math.max(y, -0.66), z]} rotation={[fall * 6 * seeded(i), fall * 7 * seeded(i + 9), fall * 5]} scale={fade} castShadow>
            <meshStandardMaterial color={colors[i % colors.length]!} roughness={0.5}/>
          </mesh>
        );
      })}
    </>
  );
}

function Shockwave({clock, landing, palette}: {clock: Clock; landing: number; palette: Palette}) {
  const age = (clock.frame - landing) / 20;
  if (age < 0 || age > 1) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.68, 0]} scale={0.8 + age * 4.2}>
      <torusGeometry args={[1, 0.035, 8, 80]}/>
      <meshBasicMaterial color={palette.accent} transparent opacity={(1 - age) * 0.9}/>
    </mesh>
  );
}

function LogoMeshes({platforms, palette}: {platforms: Platform[]; palette: Palette}) {
  const clock = useClock();
  const t = clock.frame / clock.fps;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]} receiveShadow>
        <planeGeometry args={[40, 40]}/>
        <shadowMaterial opacity={palette.look === 'paper' ? 0.22 : 0.4}/>
      </mesh>
      {platforms.map((platform, index) => {
        const delay = 8 + index * 10;
        const landing = delay + 15;
        const s = springAt(clock, delay, {damping: 8, stiffness: 95});
        const settled = Math.min(1, Math.max(0, s));
        const x = (index - (platforms.length - 1) / 2) * SPACING;
        const drop = (1 - s) * 7.5;
        const spin = (1 - s) * Math.PI * 3.2;
        const sway = 0.34 * Math.sin(t * 1.15 + index * 1.9) * settled;
        const bob = 0.09 * Math.sin(t * 1.7 + index) * settled;
        const scale = Math.max(0.01, 0.55 + 0.45 * Math.min(1.1, s * 1.5));
        return (
          <group key={platform} position={[x, 0, 0]}>
            <group position={[0, 0.1 + drop + bob, 0]} rotation={[0.1 * Math.sin(t * 0.9 + index) * settled - (1 - s) * 0.5, spin + sway, 0.04 * Math.sin(t * 1.3 + index) * settled]} scale={scale}>
              {platform === 'youtube' ? <YouTubeLogo/> : <InstagramLogo/>}
            </group>
            <Shockwave clock={clock} landing={landing} palette={palette}/>
            <Confetti clock={clock} landing={landing} origin={index} palette={palette}/>
          </group>
        );
      })}
    </>
  );
}

/** Chunky 3D platform logos that drop in with a spin, land with a shockwave and confetti, then float. */
export function LogoStage({platforms, palette}: {platforms: Platform[]; palette: Palette}) {
  const clock = useClock();
  if (clock.settled) return <div style={{height: HEIGHT}}/>;
  const push = easeAt(clock, 0, clock.duration, t => t);
  const pose = orbitPose(10.4 - 1.5 * push, -6 + 12 * push, 17 - 3 * push, [0, 0.25, 0], 28);
  return (
    <div style={{position: 'relative', width: WIDTH, height: HEIGHT, overflow: 'hidden'}}>
      <Stage3D width={WIDTH} height={HEIGHT} pose={pose}>
        <SoftLights/>
        <LogoMeshes platforms={platforms} palette={palette}/>
      </Stage3D>
    </div>
  );
}
