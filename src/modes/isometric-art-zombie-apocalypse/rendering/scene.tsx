import {useLayoutEffect, type ReactNode} from 'react';
import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Easing, Img, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {grades} from '../grades.ts';
import {pathDistance, pathHeading, pathPoint, smoothNoise} from '../motion.ts';
import {coverFit, isoCamera, plateToFrame, screenDirectionToYaw, screenHeightToWorld, screenToGround, type IsoCamera, type PlateFit} from '../projection.ts';
import type {CompiledShot, IsoProps, PlateRef, ShotActor} from '../shots.ts';
import {Figure, poseFor, strideLength} from './rigs.tsx';
import {Grain, GroundFog, Particles, Tint, TransitionIn, Vignette, flickerLevel, heartbeat} from './atmosphere.tsx';

const easings = {
  'linear': (t: number) => t,
  'in-out': Easing.inOut(Easing.cubic),
  'out': Easing.out(Easing.cubic),
  'in': Easing.in(Easing.cubic),
};

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

export function cameraTransform(shot: CompiledShot, frame: number, fps: number, fit: PlateFit, width: number, height: number) {
  const progress = shot.durationInFrames <= 1 ? 1 : frame / (shot.durationInFrames - 1);
  const t = easings[shot.camera.ease](Math.min(1, Math.max(0, progress)));
  const seconds = frame / fps;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  let shake = 0;
  let shakeX = 0;
  let shakeY = 0;
  for (const [i, s] of shot.shakes.entries()) {
    const start = s.at * shot.durationInFrames;
    const local = (frame - start) / (s.duration_seconds * fps);
    if (local < 0 || local > 1) continue;
    const envelope = s.strength * Math.pow(1 - local, 2);
    shake = Math.max(shake, envelope);
    shakeX += envelope * 34 * smoothNoise(seconds * 31, i + 1);
    shakeY += envelope * 26 * smoothNoise(seconds * 27, i + 9);
  }
  const drift = shot.camera.drift;
  const zoom = lerp(shot.camera.from.zoom, shot.camera.to.zoom) * (1 + drift * 0.015 + shake * 0.04);
  const [rawX, rawY] = plateToFrame(fit, lerp(shot.camera.from.x, shot.camera.to.x), lerp(shot.camera.from.y, shot.camera.to.y));
  const halfW = width / (2 * zoom);
  const halfH = height / (2 * zoom);
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const cx = clamp(rawX + drift * 12 * smoothNoise(seconds * 0.22, 1) + shakeX / zoom, fit.offsetX + halfW, fit.offsetX + fit.width - halfW);
  const cy = clamp(rawY + drift * 9 * smoothNoise(seconds * 0.19, 2) + shakeY / zoom, fit.offsetY + halfH, fit.offsetY + fit.height - halfH);
  const rotation = drift * 0.4 * smoothNoise(seconds * 0.16, 3) + shake * 1.2 * smoothNoise(seconds * 23, 5);
  return {transform: `translate(${width / 2}px, ${height / 2}px) rotate(${rotation}deg) scale(${zoom}) translate(${-cx}px, ${-cy}px)`, zoom};
}

function OrthoIsoCamera({camera}: {camera: IsoCamera}) {
  const three = useThree(state => state.camera);
  useLayoutEffect(() => {
    three.position.set(...camera.position);
    three.up.set(0, 1, 0);
    three.lookAt(0, 0, 0);
    three.near = 1;
    three.far = 20000;
    three.updateProjectionMatrix();
  }, [three, camera]);
  return null;
}

function ActorFigure({actor, progress, seconds, shotSeconds, fit, camera}: {actor: ShotActor; progress: number; seconds: number; shotSeconds: number; fit: PlateFit; camera: IsoCamera}) {
  if (progress < actor.enter_at) return null;
  const toFrame = (p: {x: number; y: number}) => plateToFrame(fit, p.x, p.y);
  const [px, py] = toFrame(pathPoint(actor.path, progress));
  const ground = screenToGround(camera, px, py);
  const heading = actor.facing_deg !== undefined
    ? {x: Math.cos((actor.facing_deg * Math.PI) / 180), y: Math.sin((actor.facing_deg * Math.PI) / 180)}
    : pathHeading(actor.path, progress) ?? {x: -1, y: 1};
  const yaw = screenDirectionToYaw(camera, px, py, heading.x * fit.width, heading.y * fit.height);
  const heightPx = actor.height * fit.scale;
  const distance = pathDistance(actor.path, progress, toFrame);
  const moving = pathDistance(actor.path, 1, toFrame) > 1;
  const inPlace = actor.gait === 'idle' || actor.gait === 'still' || actor.gait === 'knock';
  const phase = inPlace ? 0 : moving ? (2 * Math.PI * distance) / strideLength(actor.gait, heightPx) : seconds * (actor.gait === 'shamble' ? 2.6 : 5);
  const poseClock = actor.gait === 'knock' ? seconds - actor.enter_at * shotSeconds : seconds + seedOf(actor.actor_id);
  const pose = poseFor(actor.gait, phase, poseClock, actor.carrying === 'grocery-bag');
  const s = screenHeightToWorld(heightPx);
  return (
    <group position={ground} rotation={[0, yaw, 0]} scale={[s, s, s]}>
      <Figure rig={actor.rig} pose={pose} carrying={actor.carrying === 'grocery-bag'}/>
    </group>
  );
}

export function IsoShot({shot, plate, width, height, fps, world}: {shot: CompiledShot; plate: PlateRef; width: number; height: number; fps: number; world?: (fit: PlateFit, frame: number) => ReactNode}) {
  const frame = useCurrentFrame();
  const grade = grades[shot.grade];
  const fit = coverFit(plate.width, plate.height, width, height);
  const camera = isoCamera(width, height);
  const seed = seedOf(shot.shot_id);
  const progress = shot.durationInFrames <= 1 ? 1 : frame / (shot.durationInFrames - 1);
  const seconds = frame / fps;
  const {transform} = cameraTransform(shot, frame, fps, fit, width, height);
  const flicker = flickerLevel(shot.atmosphere.flicker, frame, seed);
  const pulse = heartbeat(shot.atmosphere.heartbeat_pulse, frame, fps);
  const l = grade.light;

  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      <AbsoluteFill style={{transformOrigin: '0 0', transform, filter: `${grade.filter} brightness(${flicker})`}}>
        <Img src={staticFile(plate.src)} style={{position: 'absolute', left: fit.offsetX, top: fit.offsetY, width: fit.width, height: fit.height}}/>
        <ThreeCanvas width={width} height={height} orthographic camera={{zoom: 1, position: camera.position, near: 1, far: 20000}} style={{position: 'absolute', left: 0, top: 0}}>
          <OrthoIsoCamera camera={camera}/>
          <hemisphereLight args={[l.sky, l.ground, l.hemi]}/>
          <directionalLight color={l.key} intensity={l.keyIntensity} position={l.keyDirection}/>
          <directionalLight color={l.rim} intensity={l.rimIntensity} position={l.rimDirection}/>
          {shot.actors.map(actor => (
            <ActorFigure key={actor.actor_id} actor={actor} progress={progress} seconds={seconds} shotSeconds={shot.durationInFrames / fps} fit={fit} camera={camera}/>
          ))}
        </ThreeCanvas>
        {world ? world(fit, frame) : null}
        <GroundFog amount={shot.atmosphere.fog} color={grade.fogColor} frame={frame} width={width} height={height} seed={seed}/>
      </AbsoluteFill>
      <Particles kind={shot.atmosphere.particles} frame={frame} width={width} height={height} seed={seed}/>
      <Tint grade={grade}/>
      <Vignette strength={grade.vignette} pulse={pulse}/>
      <Grain amount={grade.grain} frame={frame} width={width} height={height}/>
      <TransitionIn kind={shot.transition_in} frame={frame}/>
    </AbsoluteFill>
  );
}

export function IsoHorror({shots, plates, width, height, fps}: IsoProps) {
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {shots.map(shot => (
        <Sequence key={shot.shot_id} from={shot.startFrame} durationInFrames={shot.durationInFrames}>
          <IsoShot shot={shot} plate={plates[shot.plate_id]!} width={width} height={height} fps={fps}/>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
