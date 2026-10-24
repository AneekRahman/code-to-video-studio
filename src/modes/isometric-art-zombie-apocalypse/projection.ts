export type Vec3 = [number, number, number];

export const isoElevationRad = Math.atan(1 / Math.SQRT2);
export const isoAzimuthRad = Math.PI / 4;
const cameraDistance = 5000;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

export type IsoCamera = {position: Vec3; forward: Vec3; right: Vec3; up: Vec3; width: number; height: number};

export function isoCamera(width: number, height: number): IsoCamera {
  const position: Vec3 = [
    cameraDistance * Math.cos(isoElevationRad) * Math.sin(isoAzimuthRad),
    cameraDistance * Math.sin(isoElevationRad),
    cameraDistance * Math.cos(isoElevationRad) * Math.cos(isoAzimuthRad),
  ];
  const forward = normalize(scale(position, -1));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return {position, forward, right, up, width, height};
}

/** World point on the ground plane (y = 0) under a frame pixel, for an orthographic camera at 1 world unit per pixel. */
export function screenToGround(camera: IsoCamera, px: number, py: number): Vec3 {
  const origin = add(add(camera.position, scale(camera.right, px - camera.width / 2)), scale(camera.up, camera.height / 2 - py));
  const t = -origin[1] / camera.forward[1];
  return add(origin, scale(camera.forward, t));
}

export function worldToScreen(camera: IsoCamera, point: Vec3): [number, number] {
  const rel = sub(point, camera.position);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [camera.width / 2 + dot(rel, camera.right), camera.height / 2 - dot(rel, camera.up)];
}

/** Model yaw (radians, model faces +Z at 0) that points along a screen-space direction on the ground. */
export function screenDirectionToYaw(camera: IsoCamera, px: number, py: number, dx: number, dy: number): number {
  const a = screenToGround(camera, px, py);
  const b = screenToGround(camera, px + dx, py + dy);
  return Math.atan2(b[0] - a[0], b[2] - a[2]);
}

/** World height that projects to the given number of screen pixels when standing upright. */
export function screenHeightToWorld(pixels: number): number {
  return pixels / Math.cos(isoElevationRad);
}

export type PlateFit = {scale: number; offsetX: number; offsetY: number; width: number; height: number};

export function coverFit(plateWidth: number, plateHeight: number, frameWidth: number, frameHeight: number): PlateFit {
  const s = Math.max(frameWidth / plateWidth, frameHeight / plateHeight);
  const width = plateWidth * s;
  const height = plateHeight * s;
  return {scale: s, offsetX: (frameWidth - width) / 2, offsetY: (frameHeight - height) / 2, width, height};
}

export function plateToFrame(fit: PlateFit, x: number, y: number): [number, number] {
  return [fit.offsetX + x * fit.width, fit.offsetY + y * fit.height];
}
