import assert from 'node:assert/strict';
import {test} from 'node:test';
import {coverFit, isoCamera, isoElevationRad, plateToFrame, screenDirectionToYaw, screenHeightToWorld, screenToGround, worldToScreen} from '../src/modes/isometric-art-zombie-apocalypse/projection.ts';
import {pathDistance, pathHeading, pathPoint} from '../src/modes/isometric-art-zombie-apocalypse/motion.ts';
import {ShotListSchema, compileShots} from '../src/modes/isometric-art-zombie-apocalypse/shots.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('ground projection round-trips frame pixels', () => {
  const camera = isoCamera(1080, 1920);
  for (const [x, y] of [[540, 960], [0, 0], [1080, 1920], [200, 1500]] as const) {
    const ground = screenToGround(camera, x, y);
    close(ground[1], 0);
    const [sx, sy] = worldToScreen(camera, ground);
    close(sx, x, 1e-4);
    close(sy, y, 1e-4);
  }
});

test('an upright figure projects to its requested screen height', () => {
  const camera = isoCamera(1080, 1920);
  const foot = screenToGround(camera, 540, 1200);
  const height = screenHeightToWorld(100);
  const [, headY] = worldToScreen(camera, [foot[0], height, foot[2]]);
  close(1200 - headY, 100, 1e-4);
  close(isoElevationRad, Math.atan(1 / Math.SQRT2));
});

test('screen-right and screen-down headings map to distinct ground yaws', () => {
  const camera = isoCamera(1080, 1920);
  const right = screenDirectionToYaw(camera, 540, 960, 1, 0);
  const down = screenDirectionToYaw(camera, 540, 960, 0, 1);
  assert.ok(Math.abs(right - down) > 0.5);
});

test('cover fit fills a 9:16 frame from a 768x1344 plate without letterboxing', () => {
  const fit = coverFit(768, 1344, 1080, 1920);
  close(fit.height, 1920);
  assert.ok(fit.width >= 1080);
  const [x, y] = plateToFrame(fit, 0.5, 0.5);
  close(x, 540);
  close(y, 960);
});

test('paths hold before the first and after the last waypoint and report travel', () => {
  const path = [{at: 0.2, x: 0, y: 0}, {at: 0.6, x: 1, y: 0}];
  assert.deepEqual(pathPoint(path, 0), {x: 0, y: 0});
  close(pathPoint(path, 0.4).x, 0.5);
  assert.deepEqual(pathPoint(path, 1), {x: 1, y: 0});
  close(pathDistance(path, 1, p => [p.x * 100, p.y * 100]), 100, 1e-6);
  assert.deepEqual(pathHeading(path, 0.9), {x: 1, y: 0});
});

test('shot lists compile to contiguous frame ranges and reject duplicates', () => {
  const shot = {shot_id: 'a', plate_id: 'p', duration_seconds: 1.5, grade: 'night', camera: {from: {x: 0.5, y: 0.5, zoom: 1}, to: {x: 0.5, y: 0.5, zoom: 1.2}}};
  const list = ShotListSchema.parse({schema_version: '1.0', fps: 30, shots: [shot, {...shot, shot_id: 'b', duration_seconds: 2}]});
  const compiled = compileShots(list);
  assert.deepEqual(compiled.shots.map(s => [s.startFrame, s.durationInFrames]), [[0, 45], [45, 60]]);
  assert.equal(compiled.durationInFrames, 105);
  assert.throws(() => compileShots(ShotListSchema.parse({schema_version: '1.0', fps: 30, shots: [shot, shot]})));
});
