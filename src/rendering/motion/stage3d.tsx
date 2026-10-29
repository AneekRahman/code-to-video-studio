import {useLayoutEffect, type ReactNode} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';

export type CameraPose = {position: [number, number, number]; target: [number, number, number]; fov: number};

/** Where a world point lands on screen for a pose, so HTML labels can follow 3D objects exactly. */
export function projectPoint(pose: CameraPose, width: number, height: number, point: [number, number, number]): {x: number; y: number} {
  const camera = new THREE.PerspectiveCamera(pose.fov, width / height, 0.1, 200);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3(...point).project(camera);
  return {x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height};
}

function Rig({pose}: {pose: CameraPose}) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(...pose.position);
    camera.fov = pose.fov;
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  });
  return null;
}

/** A transparent three.js canvas with a frame-driven camera; the page's own background shows through. */
export function Stage3D({width, height, pose, children}: {width: number; height: number; pose: CameraPose; children: ReactNode}) {
  return (
    <ThreeCanvas width={width} height={height} shadows camera={{fov: pose.fov, position: pose.position, near: 0.1, far: 200}} gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}} style={{position: 'absolute', left: 0, top: 0}}>
      <Rig pose={pose}/>
      {children}
    </ThreeCanvas>
  );
}

export function orbitPose(radius: number, azimuthDeg: number, elevationDeg: number, target: [number, number, number], fov: number): CameraPose {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return {position: [target[0] + radius * Math.cos(el) * Math.sin(az), target[1] + radius * Math.sin(el), target[2] + radius * Math.cos(el) * Math.cos(az)], target, fov};
}

export function SoftLights({intensity = 1}: {intensity?: number}) {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc8b8', 0.85 * intensity]}/>
      <directionalLight position={[6, 11, 5]} intensity={2.1 * intensity} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-camera-near={1} shadow-camera-far={40} shadow-radius={5} shadow-bias={-0.0004}/>
      <directionalLight position={[-6, 4, -3]} intensity={0.45 * intensity}/>
    </>
  );
}
