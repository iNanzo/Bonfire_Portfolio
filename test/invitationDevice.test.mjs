// The tablet Screen Time hands NEWT (src/invitation/device.js, placed by character.js), three.js
// in Node: a 1.6 × 1.2 × 0.08 model-unit pad (4:3, about his torso's width) in a cream bezel with
// an unlit screen showing a 16×12 pixel game (nearest-filtered, so it stays pixels; it moves on
// with the toy's clock and comes round the same), every part marked as his so the retro pass
// outlines it. Each frame it sits at the midpoint of his palms (the ForeArm bones plus
// clips.js DEVICE.palm along each forearm) less the clip's lift along its screen's normal, moved
// its grip away from him along the screen (lying he holds it by its near edge, so it sticks out
// past his face; LieDown keeps DeviceLie's tilt, lift and grip so it doesn't pop), its
// width along the line from palm to palm, its screen tilted from straight up toward his face by
// the clips' tilt (DEVICE's, mixed by their weights), and it shows while DeviceSit, LieDown and
// DeviceLie weigh 0.5 or more between them, until StandUp or GetUp begins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEVICE_GRIP,
  DEVICE_LIFT,
  DEVICE_TILT,
  PALM,
  SCREEN,
  TABLET,
  createTablet,
  deviceFrame,
  deviceGrip,
  deviceLift,
  deviceShown,
  deviceTilt,
  gameFrame,
} from '../src/invitation/device.js';
import { createCharacter } from '../src/invitation/character.js';
import { BONES, DEVICE } from '../src/invitation/clips.js';
import { standIn } from './lib/newtStandIn.mjs';

const DEG = Math.PI / 180;
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

test('the tablet: 1.6 × 1.2 × 0.08 model units, a cream bezel and an unlit screen showing a 16×12 game, nearest-filtered, every part marked as his', () => {
  assert.deepEqual([TABLET.w, TABLET.h, TABLET.d], [1.6, 1.2, 0.08]);
  assert.deepEqual([TABLET.w, TABLET.h, TABLET.d], DEVICE.size, 'clips.js DEVICE’s');
  assert.deepEqual([SCREEN.w, SCREEN.h], [16, 12]);
  const tab = createTablet();
  tab.group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(tab.group).getSize(new THREE.Vector3());
  close(size.x, TABLET.w, 0.02, 'wide');
  close(size.z, TABLET.h, 0.02, 'tall');
  assert.ok(size.y <= TABLET.d + 0.02, `thin: ${size.y}`);
  const bezel = tab.bezel.material;
  assert.ok(bezel.isMeshToonMaterial, 'the bezel is toon, like him');
  const c = bezel.color;
  assert.ok(c.r > 0.8 && c.g > 0.75 && c.b > 0.55 && c.b < c.r, `cream: ${c.getHexString()}`);
  const screen = tab.screen.material;
  assert.ok(screen.isMeshBasicMaterial, 'the screen is unlit');
  const map = screen.map;
  assert.deepEqual([map.image.width, map.image.height], [16, 12]);
  assert.equal(map.magFilter, THREE.NearestFilter);
  assert.equal(map.minFilter, THREE.NearestFilter);
  assert.equal(map.generateMipmaps, false);
  for (const m of [bezel, screen]) assert.match(m.customProgramCacheKey(), /invitation-surface-id/, 'marked as his');
  // The screen sits on the face of the pad, a bezel's width in from its edges.
  const ss = new THREE.Box3().setFromObject(tab.screen).getSize(new THREE.Vector3());
  assert.ok(ss.x < TABLET.w - 0.1 && ss.z < TABLET.h - 0.1 && ss.x / ss.z > 1.2, 'inside the bezel, landscape');
});

test('its game moves on with the clock, the same at the same time, never a blank screen', () => {
  const a = gameFrame(0);
  assert.equal(a.length, 16 * 12 * 4);
  assert.notDeepEqual(gameFrame(0.6), a, 'moved on');
  assert.deepEqual(gameFrame(1.25), gameFrame(1.25), 'the same at the same time');
  for (const t of [0, 0.3, 2, 7.7]) {
    const f = gameFrame(t);
    const colours = new Set();
    for (let i = 0; i < f.length; i += 4) colours.add(`${f[i]},${f[i + 1]},${f[i + 2]}`);
    assert.ok(colours.size >= 3, `${t} s: ${colours.size} colours`);
  }
  // The tablet's screen texture follows it.
  const tab = createTablet();
  tab.update(0);
  const before = Uint8Array.from(tab.screen.material.map.image.data);
  tab.update(0.6);
  assert.notDeepEqual(Uint8Array.from(tab.screen.material.map.image.data), before);
});

test('deviceFrame: at his palms’ midpoint less the lift along its screen’s normal, its width along the line from palm to palm, its screen tilted from straight up toward his face by the tilt', () => {
  const pL = { x: 0.13, y: 0.18, z: 0.2 };
  const pR = { x: -0.13, y: 0.17, z: 0.21 };
  const forward = { x: 0, y: 0, z: 1 };
  for (const tilt of [0, 22 * DEG, 5 * DEG]) {
    const f = deviceFrame(pL, pR, forward, tilt);
    close(f.centre.x, 0, 1e-6);
    close(f.centre.y, 0.175, 1e-6);
    close(f.centre.z, 0.205, 1e-6);
    const right = v3(pR).sub(v3(pL)).normalize();
    assert.ok(v3(f.right).angleTo(right) < 1e-6, 'its width along the palms');
    close(v3(f.normal).dot(v3(f.right)), 0, 1e-6, 'its screen square to that');
    close(v3(f.normal).length(), 1, 1e-6);
    const up = new THREE.Vector3(0, 1, 0);
    close(v3(f.normal).angleTo(up), tilt, 0.05, 'tilted from straight up');
    if (tilt > 0) assert.ok(f.normal.z < 0, 'toward his face (he’s behind it)');
    // Lying, his palms rest on top of its edges: the pad sits its lift under them.
    const lifted = deviceFrame(pL, pR, forward, tilt, 0.3);
    const drop = v3(f.centre).sub(v3(lifted.centre));
    close(drop.length(), 0.3, 1e-6);
    assert.ok(drop.angleTo(v3(f.normal)) < 1e-6, 'along its normal');
  }
});

test('deviceFrame: held by its near edge, it sits its grip further from him along its screen, rising with the tilt', () => {
  const pL = { x: 0.1, y: 0.05, z: 0.5 };
  const pR = { x: -0.1, y: 0.05, z: 0.5 };
  const forward = { x: 0, y: 0, z: 1 };
  for (const tilt of [0, 20 * DEG]) {
    const base = deviceFrame(pL, pR, forward, tilt, 0.1);
    const f = deviceFrame(pL, pR, forward, tilt, 0.1, 0.6);
    const moved = v3(f.centre).sub(v3(base.centre));
    close(moved.length(), 0.6, 1e-6);
    close(moved.dot(v3(f.normal)), 0, 1e-6, 'in the screen’s plane');
    close(moved.dot(v3(f.right)), 0, 1e-6, 'square to his palms');
    assert.ok(moved.z > 0.5, 'away from him, out in front');
    close(moved.y, 0.6 * Math.sin(tilt), 1e-6, 'its far edge up as it tips toward his face');
  }
});

test('it shows while DeviceSit, LieDown and DeviceLie weigh 0.5 or more (in his hands as he lies down), gone as soon as he starts to get up, at the tilt of the mix (clips.js DEVICE’s: sitting and lying tipped toward him, less than the camera’s 36°)', () => {
  const w = (o) => (k) => o[k] ?? 0;
  assert.equal(deviceShown(w({ DeviceSit: 0.3, DeviceLie: 0.25 })), true);
  // Lying down with it: in his hands all the way.
  assert.equal(deviceShown(w({ DeviceSit: 0.6, LieDown: 0.4 })), true);
  assert.equal(deviceShown(w({ LieDown: 1 })), true);
  assert.equal(deviceShown(w({ LieDown: 0.3, DeviceLie: 0.7 })), true);
  // Getting up: gone from StandUp's or GetUp's first frame.
  assert.equal(deviceShown(w({ DeviceSit: 0.98, StandUp: 0.02 })), false);
  assert.equal(deviceShown(w({ DeviceLie: 0.99, GetUp: 0.01 })), false);
  assert.equal(deviceShown(w({ DeviceSit: 0.49, Sit: 0.51 })), false);
  assert.equal(deviceShown(w({ Idle: 1 })), false);
  close(DEVICE_TILT.DeviceSit, DEVICE.clips.DeviceSit.tilt * DEG);
  close(DEVICE_TILT.DeviceLie, DEVICE.clips.DeviceLie.tilt * DEG);
  assert.ok(
    DEVICE_TILT.DeviceSit > 0 && DEVICE_TILT.DeviceSit <= 36 * DEG,
    'sitting, it tips toward him (less than the camera’s 36°)',
  );
  assert.ok(
    DEVICE_TILT.DeviceLie >= 0 && DEVICE_TILT.DeviceLie <= 30 * DEG,
    'lying, held up by its near edge, tipped a little toward his face',
  );
  close(deviceTilt(w({ DeviceSit: 1 })), DEVICE_TILT.DeviceSit);
  close(deviceTilt(w({ DeviceLie: 1 })), DEVICE_TILT.DeviceLie);
  const mid = deviceTilt(w({ DeviceSit: 0.5, DeviceLie: 0.5 }));
  close(mid, (DEVICE_TILT.DeviceSit + DEVICE_TILT.DeviceLie) / 2, 1e-6);
});

test('lying down with it, the tablet keeps DeviceLie’s tilt, lift and grip, so nothing pops as DeviceLie fades in', () => {
  const w = (o) => (k) => o[k] ?? 0;
  close(DEVICE_TILT.LieDown, DEVICE_TILT.DeviceLie);
  close(DEVICE_LIFT.LieDown, DEVICE_LIFT.DeviceLie);
  close(DEVICE_GRIP.LieDown, DEVICE_GRIP.DeviceLie);
  for (const k of [0, 0.3, 0.7, 1]) {
    const mix = w({ LieDown: 1 - k, DeviceLie: k });
    close(deviceTilt(mix), DEVICE_TILT.DeviceLie, 1e-9);
    close(deviceLift(mix), DEVICE_LIFT.DeviceLie, 1e-9);
    close(deviceGrip(mix), DEVICE_GRIP.DeviceLie, 1e-9);
  }
  close(deviceGrip(w({ DeviceSit: 1 })), 0, 1e-9, 'sitting: by its sides');
  close(DEVICE_GRIP.DeviceLie, DEVICE.size[1] / 2, 1e-9, 'lying: by its near edge');
});

test('on him: each frame at his palms (each ForeArm bone plus DEVICE.palm along it), shown with the tablet’s clips and hidden without', () => {
  close(PALM, DEVICE.palm);
  const sit = new THREE.AnimationClip('DeviceSit', 3, []);
  const { gltf, bones } = standIn([sit]);
  const ch = createCharacter(gltf);
  assert.ok(ch.tablet, 'he has one');
  assert.equal(ch.tablet.visible, false, 'hidden at first');
  ch.restart('DeviceSit');
  ch.setWeights({ DeviceSit: 1 }, 0);
  ch.root.position.set(0.4, 0, -0.2);
  ch.root.rotation.y = 0.7;
  ch.update(1 / 60);
  ch.root.updateMatrixWorld(true);
  ch.accessories(1 / 60, 1);
  assert.equal(ch.tablet.visible, true);
  const palm = (name) => bones[name].localToWorld(new THREE.Vector3(0, PALM, 0));
  const mid = palm(BONES.forearmL).add(palm(BONES.forearmR)).multiplyScalar(0.5);
  ch.root.updateMatrixWorld(true);
  const at = ch.tablet.getWorldPosition(new THREE.Vector3());
  assert.ok(at.distanceTo(mid) < 1e-6, `at his palms: ${at.toArray()} vs ${mid.toArray()}`);
  // Its width along the palm-to-palm line.
  const across = new THREE.Vector3(1, 0, 0).transformDirection(ch.tablet.matrixWorld);
  const line = palm(BONES.forearmR).sub(palm(BONES.forearmL)).normalize();
  assert.ok(across.angleTo(line) < 1e-6, 'its width along his palms');
  ch.setWeights({ DeviceSit: 0.3 }, 0);
  ch.accessories(1 / 60, 1.1);
  assert.equal(ch.tablet.visible, false, 'hidden as the clip fades out');
});
