import {useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {Palette} from './theme.ts';
import {fontFamilies, mixColors, surface} from './theme.ts';
import {cueFrames, easeAt, springAt, useClock} from './clock.tsx';
import {contextHeight} from './field.ts';
import {orbitPose, projectPoint, SoftLights, Stage3D} from './stage3d.tsx';
import {drawGlyph, glyphKinds} from './glyphs.ts';

const COLS = 7;
const ROWS = 4;
const SPACING = 1.0;
const HERO_CELLS: [number, number][] = [[3, 1], [1, 2], [5, 2], [2, 0], [4, 3], [6, 0]];
const WIDTH = 900;

function Placeholder({height}: {height: number}) {
  return <div style={{height}}/>;
}

function clayColors(palette: Palette) {
  const paper = palette.look === 'paper';
  return {
    clay: paper ? '#cfcabd' : mixColors(palette.foreground, palette.background, 0.6),
    slab: paper ? '#ece8dd' : mixColors(palette.background, palette.foreground, 0.1),
    shadow: paper ? 0.28 : 0.5,
  };
}

/** The ranked bars of a chart on a clay field: lit, soft-shadowed, bevelled, under a slowly turning camera. */
export function BarField({data, unit, palette}: {data: {label: string; value: number}[]; unit: string; palette: Palette}) {
  const clock = useClock();
  const height = 640;
  if (clock.settled) return <Placeholder height={height + 150}/>;
  const ranked = data.map(item => ({...item})).sort((a, b) => b.value - a.value);
  const max = Math.max(...data.map(item => item.value), 1e-9);
  const cues = cueFrames(clock.spoken, ranked.length, clock.duration, 44);
  const progress = easeAt(clock, 0, clock.duration, t => t);
  const pose = orbitPose(12.9, -34 + 18 * progress, 38 - 6 * progress, [0, 0.6, 0.1], 27);
  const colors = clayColors(palette);
  const hero = new Map(ranked.map((item, rank) => [`${HERO_CELLS[rank]![0]},${HERO_CELLS[rank]![1]}`, {...item, rank}]));
  const paper = palette.look === 'paper';
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}>
        {ranked.map((item, rank) => {
          const p = springAt(clock, cues[rank]!);
          return (
            <div key={item.label} style={{...surface(palette), ...(paper ? {boxShadow: `5px 5px 0 ${palette.foreground}`, borderRadius: 4} : {borderRadius: 18}), display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', fontSize: 30, fontWeight: 800, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * 20}px)`}}>
              <span>#{rank + 1} {item.label}</span>
              <span style={{background: palette.accent, color: palette.onAccent, padding: '2px 12px', borderRadius: paper ? 3 : 10, fontVariantNumeric: 'tabular-nums'}}>{item.value}{unit}</span>
            </div>
          );
        })}
      </div>
      <div style={{position: 'relative', width: WIDTH, height, overflow: 'hidden'}}>
        <Stage3D width={WIDTH} height={height} pose={pose}>
          <SoftLights/>
          <FieldMeshes clock={clock} hero={hero} max={max} cues={cues} palette={palette} colors={colors}/>
        </Stage3D>
        {ranked.map((item, rank) => {
          const cell = HERO_CELLS[rank]!;
          const lit = easeAt(clock, cues[rank]!, 10);
          const h = 0.55 + (item.value / max) * 1.9;
          const at = projectPoint(pose, WIDTH, height, [(cell[0] - (COLS - 1) / 2) * SPACING, h + 0.45, (cell[1] - (ROWS - 1) / 2) * SPACING]);
          return (
            <div key={item.label} style={{position: 'absolute', left: at.x - 46, top: at.y - 24, width: 92, textAlign: 'center', padding: '2px 0', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 30, background: palette.accent, color: palette.onAccent, border: `3px solid ${paper ? palette.foreground : palette.background}`, borderRadius: 24, opacity: lit, transform: `translateY(${(1 - lit) * 14}px) scale(${0.7 + 0.3 * lit})`}}>#{rank + 1}</div>
          );
        })}
      </div>
    </div>
  );
}

function FieldMeshes({clock, hero, max, cues, palette, colors}: {clock: ReturnType<typeof useClock>; hero: Map<string, {value: number; rank: number}>; max: number; cues: number[]; palette: Palette; colors: ReturnType<typeof clayColors>}) {
  const geometry = useMemo(() => new RoundedBoxGeometry(0.74, 1, 0.74, 4, 0.07), []);
  const slab = useMemo(() => new RoundedBoxGeometry(COLS * SPACING + 0.9, 0.24, ROWS * SPACING + 0.9, 3, 0.08), []);
  return (
    <>
      <mesh geometry={slab} position={[0, -0.12, 0]} receiveShadow>
        <meshStandardMaterial color={colors.slab} roughness={0.95}/>
      </mesh>
      {Array.from({length: ROWS}, (_, row) => Array.from({length: COLS}, (_, col) => {
        const entry = hero.get(`${col},${row}`);
        const grow = springAt(clock, 6 + (col + row) * 3, {damping: 20, stiffness: 110});
        const target = entry ? 0.55 + (entry.value / max) * 1.9 : contextHeight(col, row) / 56;
        const h = Math.max(0.02, target * Math.min(1.04, grow));
        const lit = entry ? easeAt(clock, cues[entry.rank]!, 10) : 0;
        const color = entry ? mixColors(colors.clay, palette.accent, lit) : colors.clay;
        return (
          <mesh key={`${col}-${row}`} geometry={geometry} position={[(col - (COLS - 1) / 2) * SPACING, h / 2, (row - (ROWS - 1) / 2) * SPACING]} scale={[1, h, 1]} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.82}/>
          </mesh>
        );
      }))}
    </>
  );
}

function starShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const rays = 12;
  const outer = 1.15;
  const inner = 0.2;
  const half = Math.PI / rays;
  const polar = (radius: number, angle: number): [number, number] => [Math.cos(angle) * radius, Math.sin(angle) * radius];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const base = polar(inner, a - half * 0.55);
    const end = polar(inner, a + half * 0.55);
    const tip = polar(outer, a);
    const left = polar(outer * 0.62, a - half * 0.3);
    const right = polar(outer * 0.62, a + half * 0.3);
    if (i === 0) shape.moveTo(...base);
    else shape.lineTo(...base);
    shape.quadraticCurveTo(left[0], left[1], tip[0], tip[1]);
    shape.quadraticCurveTo(right[0], right[1], end[0], end[1]);
  }
  shape.closePath();
  return shape;
}

function glyphTexture(index: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);
  drawGlyph(ctx, glyphKinds[index % glyphKinds.length]!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A clay starburst with icon blocks orbiting it on a shadow disc; each block arrives as the narrator reaches it. */
export function OrbitHero({count, label, palette}: {count: number; label: string; palette: Palette}) {
  const clock = useClock();
  const height = 760;
  if (clock.settled) return <Placeholder height={height}/>;
  const paper = palette.look === 'paper';
  const cues = cueFrames(clock.spoken, count, clock.duration, 14);
  const t = clock.frame / clock.fps;
  const pose = orbitPose(9.9, 0, 21, [0, -0.3, 0], 30);
  const lit = cues.filter(cue => clock.frame >= cue).length;
  const burst = springAt(clock, 2, {damping: 11, stiffness: 120});
  return (
    <div style={{position: 'relative', width: WIDTH, height, overflow: 'hidden'}}>
      <Stage3D width={WIDTH} height={height} pose={pose}>
        <SoftLights/>
        <HeroMeshes count={count} cues={cues} t={t} burst={burst} palette={palette}/>
      </Stage3D>
      <div style={{position: 'absolute', right: 8, top: 6, ...surface(palette, 'accent'), ...(paper ? {boxShadow: `7px 7px 0 ${palette.foreground}`} : {}), padding: '10px 26px', display: 'flex', alignItems: 'baseline', gap: 14, transform: 'rotate(-3deg)'}}>
        <span style={{fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 84, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>{lit}</span>
        <span style={{fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 34, letterSpacing: 3, textTransform: 'uppercase'}}>{label}</span>
      </div>
    </div>
  );
}

function HeroMeshes({count, cues, t, burst, palette}: {count: number; cues: number[]; t: number; burst: number; palette: Palette}) {
  const clock = useClock();
  const starGeometry = useMemo(() => new THREE.ExtrudeGeometry(starShape(), {depth: 0.42, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 5, curveSegments: 16}), []);
  const blockGeometry = useMemo(() => new RoundedBoxGeometry(0.86, 0.86, 0.3, 4, 0.06), []);
  const textures = useMemo(() => Array.from({length: count}, (_, i) => glyphTexture(i)), [count]);
  const radius = 2.3;
  const blockMaterials = useMemo(() => textures.map(texture => [0, 1, 2, 3, 4, 5].map(face => face === 4 ? new THREE.MeshStandardMaterial({map: texture, roughness: 0.6}) : new THREE.MeshStandardMaterial({color: '#d9d4c7', roughness: 0.85}))), [textures]);
  const disc = palette.look === 'paper' ? '#e3dfd3' : mixColors(palette.background, palette.foreground, 0.12);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.25, 0]} receiveShadow scale={[1, 1, 1]}>
        <circleGeometry args={[3.35, 96]}/>
        <meshStandardMaterial color={disc} roughness={1}/>
      </mesh>
      <mesh geometry={starGeometry} position={[0, 0.05, -0.2]} rotation={[0.22, 0.55 * Math.sin(t * 0.8), 0.05 * Math.sin(t * 1.3)]} scale={Math.max(0.01, burst)} castShadow>
        <meshStandardMaterial color={palette.accent} roughness={0.5} metalness={0.02}/>
      </mesh>
      {Array.from({length: count}, (_, i) => {
        const arrive = springAt(clock, cues[i]!, {damping: 12, stiffness: 150});
        const angle = (i / count) * Math.PI * 2 + t * 0.32 - Math.PI / 2;
        const bob = Math.sin(t * 1.6 + i) * 0.07;
        return (
          <mesh key={i} geometry={blockGeometry} material={blockMaterials[i]!} position={[Math.cos(angle) * radius * arrive, -0.55 + bob + (1 - arrive) * 1.4, Math.sin(angle) * radius * arrive]} rotation={[0, Math.PI / 2 - angle + 0.12 * Math.sin(t + i), 0.05 * Math.sin(t * 1.2 + i)]} scale={Math.max(0.01, arrive)} castShadow receiveShadow/>
        );
      })}
    </>
  );
}
