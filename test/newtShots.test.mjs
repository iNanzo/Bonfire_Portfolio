// NEWT shot contracts and projection checks through the actual camera and clearing clamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, PerspectiveCamera } from 'three';
import { SHOTS, createCamera } from '../src/visualizer/camera.js';
import {
  NEWT_SHOTS,
  WANDER_BOUNDS,
  createShotFrame,
  reframeShot,
  pickLetter,
  easeAnchors,
} from '../src/visualizer/newt/shots.js';
import { keepInClearing } from '../src/visualizer/clearing.js';

test('NEWT shots cover every shot and preserve its own target', () => {
  assert.deepEqual(Object.keys(NEWT_SHOTS).sort(), Object.keys(SHOTS).sort());
  for (const [key, shot] of Object.entries(SHOTS)) assert.deepEqual(NEWT_SHOTS[key].target, shot.target);
  assert.equal(WANDER_BOUNDS.r, 2);
});
test('letter priority is held, newest, then chest, with current positions', () => {
  const chest = { x: 2, y: 0.55, z: 1 };
  const held = { kind: 'held', frame: { x: 1, y: 2, z: 3 } };
  const quick = { kind: 'quick', frame: { x: 4, y: 5, z: 6 } };
  assert.equal(pickLetter([held, quick], chest), held.frame);
  assert.equal(pickLetter([quick], chest), quick.frame);
  assert.equal(pickLetter([], chest), chest);
});
test('anchors ease in world time, framing itself never advances them', () => {
  const state = createShotFrame();
  easeAnchors(state, { x: 2, y: 0.55, z: 0 }, { x: 1, y: 1.35, z: 0 }, 0.3);
  assert.ok(state.newt.x > 1 && state.newt.x < 2);
  assert.ok(state.letter.x > 0.5 && state.letter.x < 1);
  const before = structuredClone(state);
  for (let i = 0; i < 10; i++)
    reframeShot({ pos: new Vector3(0, 2, 5), target: new Vector3(0, 0.55, 0), fov: 32, roll: 0 }, 'clearing', state);
  assert.deepEqual(state, before);
});
test('re-aim uses each anchor and retains the scaled hold lift', () => {
  for (const holding of [false, true])
    for (const [key, s] of Object.entries(NEWT_SHOTS)) {
      const state = createShotFrame();
      state.newt = { x: 2, y: 0.55, z: 0 };
      state.letter = { x: 0, y: 1.35, z: 0 };
      const p = { pos: new Vector3(...SHOTS[key].pos), target: new Vector3(...s.target), fov: 40, roll: 0 };
      if (holding) {
        p.target.y += 0.45;
        p.pos.y += 0.6;
      }
      const anchor = reframeShot(p, key, state);
      const expected =
        s.anchor === 'page'
          ? { x: 0, y: 0.55, z: 0 }
          : s.anchor === 'newt'
            ? state.newt
            : s.anchor === 'letter'
              ? state.letter
              : { x: 1, y: 0.95, z: 0 };
      for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(anchor[axis] - expected[axis]) < 1e-9);
      assert.ok(Math.abs(p.target.y - anchor.y - (holding ? 0.45 * s.scale : 0)) < 1e-9);
      assert.equal(p.target.x, anchor.x);
      assert.equal(p.target.z, anchor.z);
    }
  const distance = {};
  for (const key of ['clearing', 'low']) {
    const state = createShotFrame();
    const p = { pos: new Vector3(...SHOTS[key].pos), target: new Vector3(...SHOTS[key].target), fov: 40, roll: 0 };
    reframeShot(p, key, state);
    keepInClearing(p.pos);
    distance[key] = p.pos.distanceTo(new Vector3(0, 0.55, 0));
  }
  assert.ok(Math.abs(distance.clearing - Math.hypot(1.65, 6.1) * 0.75) < 1e-9);
  assert.ok(distance.low / distance.clearing < 0.62);
});
test('every moving shot frames its subjects at the disc centre and rim, with and without a hold [slow]', () => {
  for (const aspect of [16 / 9, 9 / 16])
    for (const holding of [false, true])
      for (const angle of [
        null,
        0,
        Math.PI / 4,
        Math.PI / 2,
        (3 * Math.PI) / 4,
        Math.PI,
        (5 * Math.PI) / 4,
        (3 * Math.PI) / 2,
        (7 * Math.PI) / 4,
      ])
        for (const key of Object.keys(SHOTS)) {
          const root = {
            x: angle === null ? 0 : WANDER_BOUNDS.r * Math.cos(angle),
            z: angle === null ? 0 : WANDER_BOUNDS.r * Math.sin(angle),
          };
          const state = createShotFrame();
          state.aspect = aspect;
          state.newt = { ...root, y: 0.55 };
          state.letter = { x: 0, y: 1.35, z: 0 };
          let pose;
          const camera = createCamera(
            {
              blade: null,
              frameShot: (o, k) => reframeShot(o, k, state),
              setPose: (p) => {
                pose = structuredClone(p);
              },
            },
            { camera: 'drift', shot: key, transition: 'cut' },
          );
          for (let i = 0; i <= 960; i++) {
            camera.update(1 / 60, { period: 0.5, punch: 0, holding, build: 0, breath: 0 });
            // update advances first: i=119/359 are sway extrema (2/6s),
            // i=479 is push/crane end and spin's 16th beat (8s).
            if (i !== 0 && i % 60 !== 59) continue;
            const cam = new PerspectiveCamera(pose.fov, aspect, 0.1, 80);
            cam.position.fromArray(pose.pos);
            keepInClearing(cam.position);
            cam.lookAt(new Vector3(...pose.target));
            cam.rotateZ(pose.roll);
            cam.updateMatrixWorld();
            const points = [];
            const kind = NEWT_SHOTS[key].anchor;
            if (kind !== 'letter') points.push([root.x, 0, root.z], [root.x, 1, root.z]);
            if (kind !== 'newt') for (const x of [-0.55, 0.55]) for (const y of [0.97, 1.73]) points.push([x, y, 0]);
            for (const xyz of points) {
              const p = new Vector3(...xyz).project(cam);
              assert.ok(
                Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1,
                `${key} ${aspect} ${holding} ${angle} frame ${i}: ${p.toArray()}`,
              );
            }
          }
        }
});

test('duck records the actual framed key and defaults to the canvas-free aspect', async () => {
  const { createFireDuck } = await import('../src/visualizer/newt/fireDuck.js');
  const duck = createFireDuck();
  const p = { pos: new Vector3(0, 2, 5), target: new Vector3(0, 0.55, 0), fov: 32, roll: 0 };
  duck.frameShot(p, 'low');
  assert.deepEqual(duck.snapshot().shot, { key: 'low', name: 'Low', anchor: { x: 0, y: 0.55, z: 0 } });
  assert.equal(duck.shotFrame.aspect, 16 / 9);
  const before = structuredClone(p);
  duck.frameShot(p, 'not-a-shot');
  assert.deepEqual(structuredClone(p), before);
});

test('letter shots fit the actual tilted paper corners rather than an upright box', () => {
  for (const aspect of [16 / 9, 9 / 16])
    for (const key of ['blade', 'vertigo']) {
      const state = createShotFrame();
      state.aspect = aspect;
      state.letterCorners = [];
      for (const x of [-0.55, 0.55])
        for (const y of [-0.38, 0.38]) {
          const corner = new Vector3(x, y, 0.02);
          corner.applyAxisAngle(new Vector3(0, 0, 1), -0.36);
          corner.applyAxisAngle(new Vector3(1, 0, 0), -0.12);
          corner.add(new Vector3(0, 1.35, 0));
          state.letterCorners.push(corner);
        }
      let pose;
      const camera = createCamera(
        {
          frameShot: (o, k) => reframeShot(o, k, state),
          setPose: (p) => {
            pose = structuredClone(p);
          },
        },
        { camera: 'drift', shot: key },
      );
      for (let i = 0; i < 480; i++) {
        camera.update(1 / 60, { period: 0.5, punch: 0, holding: true, build: 0, breath: 0 });
        if (i % 60 !== 59) continue;
        const view = new PerspectiveCamera(pose.fov, aspect, 0.1, 80);
        view.position.fromArray(pose.pos);
        view.lookAt(new Vector3(...pose.target));
        view.rotateZ(pose.roll);
        view.updateMatrixWorld();
        for (const corner of state.letterCorners) {
          const p = corner.clone().project(view);
          assert.ok(
            Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9 && p.z > -1 && p.z < 1,
            `${key} ${aspect} tilted corner: ${p.toArray()}`,
          );
        }
      }
    }
});
