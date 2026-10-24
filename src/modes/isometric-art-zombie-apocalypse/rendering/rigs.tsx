import {useMemo} from 'react';
import '@react-three/fiber';
import * as THREE from 'three';
import type {ShotActor} from '../shots.ts';
import {knockLift} from '../motion.ts';

export type Pose = {legL: number; legR: number; kneeL: number; kneeR: number; armL: number; armR: number; foreL: number; foreR: number; lean: number; bob: number; sway: number; headTilt: number; headTurn: number};

const strideByGait: Record<ShotActor['gait'], number> = {idle: 1, still: 1, knock: 1, walk: 0.5, run: 0.9, shamble: 0.3, lunge: 0.65};

export function strideLength(gait: ShotActor['gait'], heightPx: number): number {
  return strideByGait[gait] * heightPx;
}

export function poseFor(gait: ShotActor['gait'], phase: number, seconds: number, carrying: boolean): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const breathe = Math.sin(seconds * 2.4) * 0.012;
  switch (gait) {
    case 'walk':
      return {legL: s * 0.5, legR: -s * 0.5, kneeL: Math.max(0, -c) * 0.55, kneeR: Math.max(0, c) * 0.55, armL: carrying ? -0.45 : -s * 0.45, armR: s * 0.45, foreL: carrying ? -1 : -0.3, foreR: -0.3, lean: 0.06, bob: Math.abs(c) * 0.02, sway: s * 0.03, headTilt: 0, headTurn: 0};
    case 'run':
      return {legL: s * 0.95, legR: -s * 0.95, kneeL: Math.max(0, -c) * 1.4, kneeR: Math.max(0, c) * 1.4, armL: -s * 1, armR: s * 1, foreL: -1.4, foreR: -1.4, lean: 0.3, bob: Math.abs(c) * 0.05, sway: s * 0.05, headTilt: -0.15, headTurn: 0};
    case 'shamble': {
      const drag = Math.max(0, s);
      return {legL: s * 0.35, legR: -drag * 0.15, kneeL: Math.max(0, -c) * 0.4, kneeR: 0.1, armL: -1.4 + Math.sin(phase * 0.5) * 0.12, armR: -1.25 + Math.cos(phase * 0.5) * 0.15, foreL: -0.1, foreR: -0.25, lean: 0.32, bob: Math.abs(s) * 0.02, sway: Math.sin(phase * 0.5) * 0.14, headTilt: 0.4 + Math.sin(phase * 0.5) * 0.08, headTurn: Math.sin(seconds * 0.9) * 0.2};
    }
    case 'lunge':
      return {legL: s * 0.75, legR: -s * 0.75, kneeL: Math.max(0, -c) * 1, kneeR: Math.max(0, c) * 1, armL: -1.6, armR: -1.5, foreL: 0, foreR: 0, lean: 0.45, bob: Math.abs(c) * 0.04, sway: s * 0.06, headTilt: 0.15, headTurn: 0};
    case 'knock':
      return {legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0.02, armR: -1.75 + knockLift(seconds) * 0.35, foreR: -0.9 + knockLift(seconds) * 0.6, foreL: -0.05, lean: 0.02, bob: 0, sway: 0, headTilt: 0.32, headTurn: 0};
    case 'still':
      return {legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, foreL: 0, foreR: 0, lean: 0, bob: 0, sway: 0, headTilt: 0.38, headTurn: 0};
    case 'idle':
      return {legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: carrying ? -0.45 : 0.05, armR: -0.05, foreL: carrying ? -1 : -0.15, foreR: -0.15, lean: 0.03, bob: breathe, sway: 0, headTilt: Math.sin(seconds * 0.7) * 0.03, headTurn: Math.sin(seconds * 0.5) * 0.25};
  }
}

function useClay(color: string, emissive = '#000000', emissiveIntensity = 0) {
  return useMemo(() => new THREE.MeshStandardMaterial({color, roughness: 0.72, metalness: 0, emissive, emissiveIntensity}), [color, emissive, emissiveIntensity]);
}

type Build = {coat: string; trim: string; skin: string; pants: string; boots: string; shoulder: number; armLength: number; hunch: number};
const builds: Record<ShotActor['rig'], Build> = {
  hero: {coat: '#f5c330', trim: '#d39a18', skin: '#efbf98', pants: '#2c3650', boots: '#4a3326', shoulder: 0.15, armLength: 1, hunch: 0},
  zombie: {coat: '#55292d', trim: '#3a2427', skin: '#b4b8b3', pants: '#2c2f36', boots: '#1f1d1c', shoulder: 0.16, armLength: 1.38, hunch: 0.2},
  double: {coat: '#e9c24a', trim: '#c79d2a', skin: '#c9cbc6', pants: '#2c3650', boots: '#4a3326', shoulder: 0.15, armLength: 1.1, hunch: 0},
};

function Capsule({radius, length, material, position = [0, 0, 0]}: {radius: number; length: number; material: THREE.Material; position?: [number, number, number]}) {
  return (
    <mesh position={position} material={material}>
      <capsuleGeometry args={[radius, length, 4, 10]}/>
    </mesh>
  );
}

function Limb({origin, swing, bend, upper, lower, radius, upperLength, lowerLength, end}: {origin: [number, number, number]; swing: number; bend: number; upper: THREE.Material; lower: THREE.Material; radius: number; upperLength: number; lowerLength: number; end?: THREE.Material}) {
  return (
    <group position={origin} rotation={[swing, 0, 0]}>
      <Capsule radius={radius} length={upperLength} material={upper} position={[0, -upperLength / 2, 0]}/>
      <group position={[0, -upperLength, 0]} rotation={[bend, 0, 0]}>
        <Capsule radius={radius * 0.9} length={lowerLength} material={lower} position={[0, -lowerLength / 2, 0]}/>
        {end ? (
          <mesh position={[0, -lowerLength - radius * 0.4, radius * 0.5]} material={end}>
            <sphereGeometry args={[radius * 1.15, 10, 8]}/>
          </mesh>
        ) : null}
      </group>
    </group>
  );
}

/** A clay figure one world unit tall at scale 1, feet at the origin, facing +Z. */
export function Figure({rig, pose, carrying}: {rig: ShotActor['rig']; pose: Pose; carrying: boolean}) {
  const b = builds[rig];
  const coat = useClay(b.coat);
  const trim = useClay(b.trim);
  const skin = useClay(b.skin);
  const pants = useClay(b.pants);
  const boots = useClay(b.boots);
  const paper = useClay('#c49562');
  const shadow = useMemo(() => new THREE.MeshBasicMaterial({color: '#000000', transparent: true, opacity: 0.45, depthWrite: false}), []);
  const zombie = rig === 'zombie';
  const hip = 0.32;
  const shoulderY = 0.62;
  const arm = 0.15 * b.armLength;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} material={shadow} scale={[1, 0.8, 1]}>
        <circleGeometry args={[0.22, 20]}/>
      </mesh>
      <group position={[0, pose.bob, 0]} rotation={[pose.lean, 0, pose.sway]}>
        <Limb origin={[-0.06, hip, 0]} swing={-pose.legL} bend={pose.kneeL} upper={pants} lower={pants} end={boots} radius={0.048} upperLength={0.13} lowerLength={0.12}/>
        <Limb origin={[0.06, hip, 0]} swing={-pose.legR} bend={pose.kneeR} upper={pants} lower={pants} end={boots} radius={0.048} upperLength={0.13} lowerLength={0.12}/>
        <group rotation={[b.hunch, 0, 0]} position={[0, hip, 0]}>
          <Capsule radius={0.115} length={0.16} material={coat} position={[0, 0.17, 0]}/>
          {zombie ? null : (
            <mesh position={[0, 0.06, 0]} material={trim}>
              <cylinderGeometry args={[0.13, 0.16, 0.12, 14, 1, true]}/>
            </mesh>
          )}
          <Limb origin={[-b.shoulder, shoulderY - hip, 0]} swing={pose.armL} bend={pose.foreL} upper={coat} lower={zombie ? skin : coat} end={skin} radius={0.038} upperLength={arm * 0.75} lowerLength={arm * 0.7}/>
          <Limb origin={[b.shoulder, shoulderY - hip, 0]} swing={pose.armR} bend={pose.foreR} upper={coat} lower={zombie ? skin : coat} end={skin} radius={0.038} upperLength={arm * 0.75} lowerLength={arm * 0.7}/>
          {carrying ? (
            <mesh position={[-0.19, 0.12, 0.15]} material={paper}>
              <boxGeometry args={[0.15, 0.19, 0.1]}/>
            </mesh>
          ) : null}
          <group position={[0, 0.48, 0.01]} rotation={[pose.headTilt, pose.headTurn, zombie ? 0.2 : 0]}>
            <mesh material={skin}>
              <sphereGeometry args={[0.15, 20, 16]}/>
            </mesh>
            {zombie ? null : (
              <mesh position={[0, 0.015, -0.01]} material={coat} rotation={[-0.25, 0, 0]}>
                <sphereGeometry args={[0.168, 20, 14, Math.PI * 0.68, Math.PI * 1.64, 0, Math.PI * 0.66]}/>
              </mesh>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}
