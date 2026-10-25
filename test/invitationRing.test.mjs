// The invitation toy's floor ring (src/invitation/ring.js, drawn by stage.js): the cursor marker
// where the pointer meets the floor and the ring under NEWT while he's held. It's drawn in its
// shader from the distance to its centre, its rim RING.rim texels wide from the distance's screen
// derivative (so crisp at any elevation and zoom, never a texture's stair-steps), cut hard with
// the pixel look on and with a smooth edge a texel wide at Pixel Size Off; its centre is moved
// onto the texel grid (so it steps a whole texel at a time and keeps its shape), its radius on
// screen is at least RING.minTexels texels, and the cursor marker fades out as the view gets low
// (below about 18° over it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  RING,
  RING_FRAGMENT,
  elevationAt,
  markerFade,
  ringCover,
  ringRadius,
  snapToTexel,
  texelSize,
} from '../src/invitation/ring.js';

const RAD = Math.PI / 180;

/** A camera looking down at the floor's middle from `elevation` (radians), `w` × `h` texels. */
function cameraAt(elevation, w = 320, h = 200, distance = 9) {
  const c = new THREE.PerspectiveCamera(20, w / h, 0.5, 80);
  c.position.set(
    0.7 * distance * Math.cos(elevation),
    distance * Math.sin(elevation),
    0.7 * distance * Math.cos(elevation),
  );
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}
/** Where a world point shows, in texels from the target's top left (x right, y down). */
function texelOf(/** @type {THREE.Camera} */ c, /** @type {{w: number, h: number}} */ grid, x, y, z) {
  const p = new THREE.Vector3(x, y, z).project(c);
  return { x: ((p.x + 1) / 2) * grid.w, y: ((1 - p.y) / 2) * grid.h };
}

test('the ring: a rim RING.rim texels wide just inside its radius, hard with the pixel look on and a texel’s smooth edge at Off', () => {
  assert.equal(RING.rim, 2);
  assert.equal(RING.minTexels, 6);
  const g = 0.01; // (world units a texel, where it is)
  const R = 0.2;
  // (Pixel look: on from R - 2 texels to R, off either side; nothing in the middle.)
  for (const [d, on] of [
    [0, 0],
    [R - 2.5 * g, 0],
    [R - 1.99 * g, 1],
    [R - 1 * g, 1],
    [R - 0.01 * g, 1],
    [R + 0.01 * g, 0],
    [R + g, 0],
  ])
    assert.equal(ringCover(d, g, R, false), on, `pixel at ${((d - R) / g).toFixed(2)} texels`);
  // (Every texel centre along a line through it: the rim is two texels wide on each side.)
  const row = Array.from({ length: 60 }, (_, i) => ringCover(Math.abs(i + 0.5 - 30) * g, g, R, false));
  const runs = row.join('').match(/1+/g) ?? [];
  assert.deepEqual(
    runs.map((r) => r.length),
    [2, 2],
    row.join(''),
  );
  // (Off: smooth, a texel of falloff at each edge, full in the rim's middle.)
  assert.equal(ringCover(R - g, g, R, true), 1);
  assert.ok(Math.abs(ringCover(R, g, R, true) - 0.5) < 1e-9, 'half at the outer edge');
  assert.ok(Math.abs(ringCover(R - 2 * g, g, R, true) - 0.5) < 1e-9, 'half at the inner edge');
  assert.equal(ringCover(R + g, g, R, true), 0);
  assert.equal(ringCover(R - 3 * g, g, R, true), 0);
  const grey = Array.from({ length: 40 }, (_, i) => ringCover(R - 3 * g + (i / 40) * 4 * g, g, R, true)).filter(
    (a) => a > 0 && a < 1,
  );
  assert.ok(grey.length >= 10, 'in-between steps: a smooth edge');
});

test('the shader does what ringCover does: the distance’s screen derivative for the rim, a hard cut with the pixel look on', () => {
  assert.match(RING_FRAGMENT, /dFdx\(\s*ringD\s*\)/);
  assert.match(RING_FRAGMENT, /dFdy\(\s*ringD\s*\)/);
  assert.match(RING_FRAGMENT, /uRingRadius - [\d.]+ \* ringG/, 'the rim, RING.rim texels in');
  assert.ok(RING_FRAGMENT.includes(`${RING.rim.toFixed(1)} * ringG`));
  assert.match(RING_FRAGMENT, /uIdOn > 0\.5/, 'hard with the pixel look on');
  assert.match(RING_FRAGMENT, /discard/);
  const stage = readFileSync(new URL('../src/invitation/stage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(stage, /ringTexture/, 'no texture stretched on the floor any more');
  assert.match(stage, /RING_FRAGMENT/);
});

test('its radius on screen is at least RING.minTexels texels: a texel’s world size where it is', () => {
  // (A texel's world size: the view's height at that distance over the texels down.)
  const t = texelSize(10, 20, 200);
  assert.ok(Math.abs(t - (2 * 10 * Math.tan(10 * RAD)) / 200) < 1e-12);
  assert.equal(ringRadius(0.17, 0.01), 0.17, 'big enough already');
  assert.ok(Math.abs(ringRadius(0.17, 0.05) - 0.3) < 1e-12, 'zoomed out or coarse: six texels');
  assert.ok(ringRadius(0.4, 0.2) >= RING.minTexels * 0.2 - 1e-12);
});

test('the cursor marker fades as the view gets low over it: full from about 18° up, gone by 10°', () => {
  assert.equal(markerFade(70 * RAD), 1);
  assert.equal(markerFade(36 * RAD), 1);
  assert.equal(markerFade(18 * RAD), 1);
  assert.equal(markerFade(10 * RAD), 0);
  assert.equal(markerFade(5 * RAD), 0);
  const at12 = markerFade(12 * RAD);
  assert.ok(at12 > 0 && at12 < 0.4, `faint at 12°: ${at12.toFixed(2)}`);
  for (let e = 10; e < 18; e += 0.5) assert.ok(markerFade((e + 0.5) * RAD) >= markerFade(e * RAD), `rising at ${e}°`);
  // (The elevation at a floor spot, from the camera: how low the view is over it.)
  assert.ok(Math.abs(elevationAt({ x: 0, y: 1, z: 1 }, { x: 0, z: 0 }) - 45 * RAD) < 1e-12);
  assert.ok(Math.abs(elevationAt({ x: 3, y: Math.sqrt(3) * 2, z: 2 }, { x: 3, z: 0 }) - 60 * RAD) < 1e-12);
});

test('its centre goes onto the texel grid: it shows at a texel corner, within half a texel of the spot, on the floor', () => {
  for (const elevation of [12 * RAD, 36 * RAD, 70 * RAD]) {
    const c = cameraAt(elevation);
    const grid = { w: 320, h: 200 };
    for (const spot of [
      { x: 0.13, z: -0.31 },
      { x: -0.77, z: 0.42 },
      { x: 1.05, z: 0.6 },
    ]) {
      const s = snapToTexel(spot, c, grid, 0.003);
      const at = texelOf(c, grid, s.x, 0.003, s.z);
      assert.ok(Math.abs(at.x - Math.round(at.x)) < 1e-4, `x on a corner: ${at.x}`);
      assert.ok(Math.abs(at.y - Math.round(at.y)) < 1e-4, `y on a corner: ${at.y}`);
      const was = texelOf(c, grid, spot.x, 0.003, spot.z);
      assert.ok(Math.abs(at.x - was.x) <= 0.5 + 1e-4 && Math.abs(at.y - was.y) <= 0.5 + 1e-4, 'the nearest corner');
      // (A spot a whole texel over snaps a whole texel over: the ring steps, it never crawls.)
    }
  }
  // (Off the screen or behind the camera: left as it is.)
  const c = cameraAt(36 * RAD);
  assert.deepEqual(snapToTexel({ x: 40, z: 40 }, c, { w: 320, h: 200 }, 0.003), { x: 40, z: 40 });
});
