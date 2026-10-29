import * as THREE from 'three';
import {easeInOut, lerpPose, type Pose, type ShotState, type WorldBuild, type WorldKind} from './core.ts';
import {buildBathroom, buildPortrait, buildStreet, buildSuburb, type PortraitVariant} from './worlds-ground.ts';
import {buildCity, buildExplosion, buildGlobe, buildSpace, buildTerrain, type GlobeVariant, type SpaceVariant} from './worlds-scale.ts';

export type ShotSpec = {
  world: WorldKind;
  variant?: string | undefined;
  start: number;
  end: number;
  seed: number;
  offset?: number;
  /** Replaces the world's own camera for this shot; the camera moves from `from` to `to` over the shot. */
  camera?: {from: Pose; to: Pose; ease?: 'linear' | 'in-out'} | undefined;
};

export type TimelineState = {time: number; level: number; rung: number; sinceTick: number; period: number};

function build(kind: WorldKind, seed: number, variant: string | undefined): WorldBuild {
  switch (kind) {
    case 'street': return buildStreet(seed);
    case 'bathroom': return buildBathroom(seed);
    case 'portrait': return buildPortrait(seed, (variant as PortraitVariant | undefined) ?? 'hero');
    case 'suburb': return buildSuburb(seed);
    case 'city': return buildCity(seed);
    case 'terrain': return buildTerrain(seed);
    case 'globe': return buildGlobe(seed, (variant as GlobeVariant | undefined) ?? 'earth');
    case 'sun': return buildGlobe(seed, 'sun');
    case 'space': return buildSpace(seed, (variant as SpaceVariant | undefined) ?? 'plain');
    case 'explosion': return buildExplosion(seed);
  }
}

type Built = {world: WorldBuild; scene: THREE.Scene; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight};

export type Stage = {
  /** Draws the frame for `state` onto the renderer's canvas. */
  render(state: TimelineState): void;
  shotAt(time: number): ShotSpec;
};

export function createStage(renderer: THREE.WebGLRenderer, width: number, height: number, shots: readonly ShotSpec[]): Stage {
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 600);
  const cache = new Map<string, Built>();

  const get = (shot: ShotSpec): Built => {
    const key = `${shot.world}|${shot.variant ?? ''}|${shot.seed}`;
    let built = cache.get(key);
    if (!built) {
      const world = build(shot.world, shot.seed, shot.variant);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(world.background);
      if (world.fog) scene.fog = new THREE.Fog(world.fog.color, world.fog.near, world.fog.far);
      const hemi = new THREE.HemisphereLight(world.ambient.sky, world.ambient.ground, world.ambient.intensity);
      const sun = new THREE.DirectionalLight(world.sun.color ?? '#ffffff', world.sun.intensity);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
      sun.shadow.radius = 3;
      scene.add(hemi, sun, sun.target, world.root);
      built = {world, scene, sun, hemi};
      cache.set(key, built);
    }
    return built;
  };

  const shotAt = (time: number): ShotSpec => shots.find(s => time >= s.start && time < s.end) ?? shots[shots.length - 1]!;

  return {
    shotAt,
    render(timeline) {
      const shot = shotAt(timeline.time);
      const built = get(shot);
      const t = Math.max(0, timeline.time - shot.start) + (shot.offset ?? 0);
      const state: ShotState = {t, u: Math.min(1, t / Math.max(0.001, shot.end - shot.start)), level: timeline.level, rung: timeline.rung, sinceTick: timeline.sinceTick, period: timeline.period};
      built.world.update(state);
      const pose = shot.camera ? lerpPose(shot.camera.from, shot.camera.to, shot.camera.ease === 'linear' ? state.u : easeInOut(state.u)) : built.world.camera(state);
      camera.position.set(...pose.position);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(...pose.target);
      const distance = camera.position.distanceTo(new THREE.Vector3(...pose.target));
      const span = Math.max(9, distance * 0.75);
      const sunDir = new THREE.Vector3(...built.world.sun.position).normalize();
      built.sun.position.set(pose.target[0] + sunDir.x * 80, pose.target[1] + sunDir.y * 80, pose.target[2] + sunDir.z * 80);
      built.sun.target.position.set(...pose.target);
      const shadow = built.sun.shadow.camera;
      shadow.left = -span;
      shadow.right = span;
      shadow.top = span;
      shadow.bottom = -span;
      shadow.near = 5;
      shadow.far = 200;
      shadow.updateProjectionMatrix();
      renderer.render(built.scene, camera);
    },
  };
}
