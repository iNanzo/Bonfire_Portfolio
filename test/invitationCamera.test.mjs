// The invitation toy's orbit camera (src/invitation/camera.js), pure: a drag on empty space
// turns it around the vertical axis (a full turn and more; about three quarters of one for a
// drag across the whole stage, on a phone and a desktop alike) and tilts it between 12° and 70°
// (by the stage's height),
// eased (damped, no jump, no overshoot) with a little coast after a fling; the wheel and a
// pinch zoom between half and twice the default distance; the point it orbits stays on the
// play area's centre at a desktop's default zoom (the whole play area in view) and follows NEWT
// softly as it zooms in, so he stays in frame (on a phone, where he's drawn bigger, most of the
// way at the default zoom too); Reset Camera eases back to the default the short way
// round; a resize keeps the zoom; and the light turns with it, so his shadow falls the same way
// on screen after any orbit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_Y,
  ORBIT,
  createOrbit,
  followShare,
  lightDir,
  orbitDrag,
  orbitEvents,
  orbitHome,
  orbitPose,
  orbitRelease,
  orbitReset,
  orbitSpan,
  orbitSpot,
  orbitStep,
  orbitWheel,
  orbitZoom,
  tiltPerPx,
  turnPerPx,
} from '../src/invitation/camera.js';
import { VIEW } from '../src/invitation/pixels.js';
import { LOOKS } from '../src/invitation/look.js';

const D = Math.PI / 180;
const DT = 1 / 60;
const HOME = 30;
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Steps the orbit `s` seconds with NEWT at `focus`. */
function settle(o, s = 2, focus = null) {
  for (let i = 0; i < s * 60; i++) orbitStep(o, DT, focus);
  return o;
}

test('the default view: 36° up, yaw 0 (the camera on the +z side), the home distance, aimed at the play area’s centre', () => {
  const o = createOrbit({ distance: HOME });
  close(o.elevation, VIEW.elevation * D);
  assert.equal(o.yaw, 0);
  assert.equal(o.distance, HOME);
  const { position, target } = orbitPose(o);
  assert.deepEqual(target, { x: 0, y: FOCUS_Y, z: 0 });
  close(position.x, 0);
  close(position.y, FOCUS_Y + HOME * Math.sin(36 * D));
  close(position.z, HOME * Math.cos(36 * D));
  close(Math.hypot(position.x, position.y - FOCUS_Y, position.z), HOME, 1e-9, 'at the distance');
  assert.deepEqual(orbitSpot(o), { x: position.x, z: position.z }, 'its spot on the floor');
  assert.ok(ORBIT.elevMin >= 10 * D && ORBIT.elevMin <= 14 * D && ORBIT.elevMax >= 65 * D && ORBIT.elevMax <= 75 * D);
  assert.deepEqual([ORBIT.zoomMin, ORBIT.zoomMax], [0.5, 2]);
});

test('a horizontal drag turns the camera around the vertical axis, a full turn and more; a vertical drag tilts it between 12° and 70°', () => {
  const o = createOrbit({ distance: HOME });
  // Dragging right turns the world with the finger: the camera goes round to its left (−x).
  orbitDrag(o, 40, 0, 0.1);
  settle(o, 1);
  assert.ok(o.yaw < -0.1, `turned (${o.yaw})`);
  const p = orbitPose(o).position;
  assert.ok(p.x < 0, 'the camera went round to the left');
  close(Math.hypot(p.x, p.z), HOME * Math.cos(o.elevation), 1e-9, 'still on its circle');
  // Keep dragging: past a whole turn, no stop.
  let t = 0.2;
  const turn = (2 * Math.PI) / turnPerPx(o);
  for (let i = 0; i < 30; i++) orbitDrag(o, -(turn * 1.25) / 30, 0, (t += DT));
  orbitRelease(o, t + 0.5);
  settle(o, 2);
  close(wrap(o.yaw - (-40 * turnPerPx(o) + 1.25 * 2 * Math.PI)), 0, 1e-3, 'a turn and a quarter the other way');
  // Dragging down tilts it up (more from above), to 70° at most; up, to 12° at least.
  orbitDrag(o, 0, 5000, (t += 1));
  settle(o, 2);
  close(o.elevation, ORBIT.elevMax, 1e-6, 'up to 70°');
  orbitDrag(o, 0, -10000, (t += 1));
  settle(o, 2);
  close(o.elevation, ORBIT.elevMin, 1e-6, 'down to 12°');
  orbitDrag(o, 0, 100, t + 1);
  settle(o, 2);
  close(o.elevation, ORBIT.elevMin + 100 * tiltPerPx(o), 1e-6, 'and back up at once, nothing stored past the limit');
});

test('a drag across the whole stage turns the camera about three quarters of a turn, a drag down its whole height tilts it half a turn, on phones and a desktop alike', () => {
  assert.ok(ORBIT.turn >= 0.6 && ORBIT.turn <= 0.9, `${ORBIT.turn} of a turn across the stage`);
  for (const [w, h] of [
    [390, 844],
    [412, 915],
    [1280, 800],
  ]) {
    const o = createOrbit({ distance: HOME, span: { w, h } });
    orbitDrag(o, -w, 0, 0);
    close(o.goal.yaw, ORBIT.turn * 2 * Math.PI, 1e-9, `${w}x${h}: across the whole width`);
    orbitDrag(o, 0, h / 8, 0.1);
    close(o.goal.elevation, VIEW.elevation * D + ORBIT.tilt / 8, 1e-9, `${w}x${h}: an eighth of the height`);
  }
  // So the same few px turn a desktop less than a phone, by their widths.
  const phone = createOrbit({ distance: HOME, span: { w: 390, h: 844 } });
  const desk = createOrbit({ distance: HOME, span: { w: 1280, h: 800 } });
  close(turnPerPx(desk) / turnPerPx(phone), 390 / 1280, 1e-9);
  // A resize brings the new stage's rate.
  orbitSpan(phone, { w: 1280, h: 800 });
  close(turnPerPx(phone), turnPerPx(desk), 1e-12);
  close(tiltPerPx(phone), tiltPerPx(desk), 1e-12);
  orbitSpan(phone, { w: 0, h: Number.NaN });
  close(turnPerPx(phone), turnPerPx(desk), 1e-12, 'a stage with no size keeps the last');
});

test('the view eases toward a drag: no jump, no overshoot', () => {
  const o = createOrbit({ distance: HOME });
  orbitDrag(o, -60, 30, 0.1);
  const goal = { yaw: 60 * turnPerPx(o), elevation: 36 * D + 30 * tiltPerPx(o) };
  close(o.goal.yaw, goal.yaw);
  close(o.goal.elevation, goal.elevation);
  orbitStep(o, DT, null);
  assert.ok(o.yaw > 0 && o.yaw < goal.yaw * 0.5, `a frame moves part of the way (${o.yaw})`);
  let prev = o.yaw;
  for (let i = 0; i < 120; i++) {
    orbitStep(o, DT, null);
    assert.ok(o.yaw >= prev - 1e-12 && o.yaw <= goal.yaw + 1e-12, 'monotonic, never past the goal');
    assert.ok(o.elevation <= goal.elevation + 1e-12);
    prev = o.yaw;
  }
  close(o.yaw, goal.yaw, 1e-4, 'arrived');
});

test('a fling coasts a little after the finger lifts, then stops; a finger that stopped before lifting doesn’t', () => {
  const fling = createOrbit({ distance: HOME });
  let t = 0;
  for (let i = 0; i < 10; i++) orbitDrag(fling, 12, 0, (t += DT));
  const atLift = fling.goal.yaw;
  orbitRelease(fling, t + DT / 2);
  settle(fling, 3);
  const coast = atLift - fling.goal.yaw;
  assert.ok(coast > 0.05, `it coasts on (${coast.toFixed(3)} rad)`);
  assert.ok(coast < 1.5, `a little (${coast.toFixed(3)} rad)`);
  const g = fling.goal.yaw;
  settle(fling, 1);
  close(fling.goal.yaw, g, 1e-6, 'then stops');
  close(fling.yaw, fling.goal.yaw, 1e-4);

  const still = createOrbit({ distance: HOME });
  t = 0;
  for (let i = 0; i < 10; i++) orbitDrag(still, 12, 0, (t += DT));
  const held = still.goal.yaw;
  orbitRelease(still, t + 0.4);
  settle(still, 2);
  close(still.goal.yaw, held, 1e-9, 'no coast after a pause');
});

test('the wheel and a pinch zoom between half and twice the default distance', () => {
  const o = createOrbit({ distance: HOME });
  orbitZoom(o, 1.25);
  close(o.goal.distance, HOME / 1.25, 1e-9, 'fingers apart: closer');
  orbitZoom(o, 100);
  close(o.goal.distance, HOME * ORBIT.zoomMin, 1e-9, 'no closer than half');
  orbitZoom(o, 0.001);
  close(o.goal.distance, HOME * ORBIT.zoomMax, 1e-9, 'no further than twice');
  const w = createOrbit({ distance: HOME });
  orbitWheel(w, 100);
  assert.ok(w.goal.distance > HOME, 'the wheel toward you: further');
  orbitWheel(w, -200);
  assert.ok(w.goal.distance < HOME, 'away from you: closer');
  settle(w, 2);
  close(w.distance, w.goal.distance, 1e-4, 'eased there');
});

test('on a desktop the orbit stays on the play area’s centre at the default zoom and follows NEWT softly as it zooms in', () => {
  const newt = { x: 2, z: -1 };
  const o = createOrbit({ distance: HOME, span: { w: 1280, h: 800 } });
  settle(o, 3, newt);
  assert.equal(followShare(o), 0);
  assert.deepEqual(orbitPose(o).target, { x: 0, y: FOCUS_Y, z: 0 }, 'the whole play area stays in view');
  orbitZoom(o, 0.8);
  settle(o, 3, newt);
  assert.equal(followShare(o), 0, 'zoomed out too');
  // Zoomed all the way in, it follows him: softly (not at once), all the way.
  orbitZoom(o, 100);
  settle(o, 1);
  close(followShare(o), 1, 1e-3);
  orbitStep(o, DT, newt);
  const first = orbitPose(o).target;
  assert.ok(first.x > 0 && first.x < 0.2, `a frame moves only a little (${first.x})`);
  settle(o, 4, newt);
  const end = orbitPose(o).target;
  close(end.x, newt.x, 1e-3);
  close(end.z, newt.z, 1e-3);
  assert.equal(end.y, FOCUS_Y);
  // Half way in, half way to him.
  const half = createOrbit({ distance: HOME });
  orbitZoom(half, 1 / 0.75);
  settle(half, 6, newt);
  close(followShare(half), 0.5, 1e-3);
  close(orbitPose(half).target.x, 1, 2e-3);
});

test('on a phone’s stage the orbit follows NEWT softly most of the way at the default zoom too, all the way zoomed in; a resize to a desktop stops it', () => {
  const newt = { x: 2, z: -1 };
  assert.ok(ORBIT.phoneFollow >= 0.6 && ORBIT.phoneFollow <= 1, `${ORBIT.phoneFollow} of the way`);
  for (const span of [
    { w: 390, h: 844 },
    { w: 412, h: 915 },
    { w: 844, h: 390 },
  ]) {
    const o = createOrbit({ distance: HOME, span });
    close(followShare(o), ORBIT.phoneFollow, 1e-9, `${span.w}x${span.h}: at the default zoom`);
    orbitStep(o, DT, newt);
    assert.ok(o.target.x > 0 && o.target.x < 0.2, `softly: a frame moves only a little (${o.target.x})`);
    settle(o, 4, newt);
    close(o.target.x, newt.x * ORBIT.phoneFollow, 1e-3, 'most of the way to him');
    close(o.target.z, newt.z * ORBIT.phoneFollow, 1e-3);
    orbitZoom(o, 0.6);
    settle(o, 2, newt);
    close(followShare(o), ORBIT.phoneFollow, 1e-9, 'zoomed out: the same');
    orbitZoom(o, 100);
    settle(o, 4, newt);
    close(followShare(o), 1, 1e-3, 'zoomed all the way in: all the way');
  }
  const o = createOrbit({ distance: HOME, span: { w: 390, h: 844 } });
  orbitSpan(o, { w: 1280, h: 800 });
  assert.equal(followShare(o), 0, 'a desktop’s stage: the centre again');
  orbitSpan(o, { w: 600, h: 599 });
  close(followShare(o), ORBIT.phoneFollow, 1e-9, 'a short side under 600 px is a phone’s');
});

test('Reset Camera eases back to the default view, the short way round', () => {
  const o = createOrbit({ distance: HOME });
  let t = 0;
  orbitDrag(o, -(200 * D) / turnPerPx(o), 80, (t += DT)); // round past half a turn
  orbitZoom(o, 1.8);
  orbitRelease(o, t + 1);
  settle(o, 3, { x: 1, z: 1 });
  assert.ok(Math.abs(wrap(o.yaw)) > 150 * D);
  orbitReset(o);
  orbitStep(o, DT, { x: 1, z: 1 });
  assert.ok(Math.abs(wrap(o.yaw)) > 140 * D, 'it eases, not jumps');
  let travelled = 0;
  let prev = o.yaw;
  for (let i = 0; i < 4 * 60; i++) {
    orbitStep(o, DT, { x: 1, z: 1 });
    travelled += Math.abs(o.yaw - prev);
    prev = o.yaw;
  }
  close(wrap(o.yaw), 0, 1e-3, 'yaw');
  close(o.elevation, 36 * D, 1e-3, 'elevation');
  close(o.distance, HOME, 1e-2, 'distance');
  const { target } = orbitPose(o);
  close(target.x, 0, 1e-2, 'back on the centre');
  assert.ok(travelled < 170 * D, `the short way round (${(travelled / D).toFixed(0)}°)`);
});

test('a resize brings a new home distance and keeps the zoom', () => {
  const o = createOrbit({ distance: HOME });
  orbitZoom(o, 1.5);
  settle(o, 2);
  orbitHome(o, 20);
  close(o.home.distance, 20);
  close(o.goal.distance, 20 / 1.5, 1e-9);
  close(o.distance, 20 / 1.5, 1e-3);
  orbitZoom(o, 100);
  close(o.goal.distance, 10, 1e-9, 'the limits follow the new home');
});

test('the gestures move it: an orbit turns it, a pinch zooms it, letting go of an orbit flings it; a tap does nothing', () => {
  const o = createOrbit({ distance: HOME });
  orbitEvents(o, [
    { type: 'tap', on: 'floor', x: 0, y: 0, t: 0 },
    { type: 'orbit', on: 'floor', x: 10, y: 0, t: 0.01, dx: 30, dy: 10 },
    { type: 'orbit', on: 'floor', x: 20, y: 0, t: 0.03, dx: 20, dy: 0 },
  ]);
  close(o.goal.yaw, -50 * turnPerPx(o), 1e-9);
  close(o.goal.elevation, 36 * D + 10 * tiltPerPx(o), 1e-9);
  orbitEvents(o, [{ type: 'release', on: 'floor', x: 20, y: 0, t: 0.04 }]);
  assert.ok(o.spin.yaw < 0, 'a fling');
  orbitEvents(o, [{ type: 'pinch', on: 'floor', x: 0, y: 0, t: 1, scale: 1.25 }]);
  close(o.goal.distance, HOME / 1.25, 1e-9);
  const before = { ...o.goal };
  orbitEvents(o, [
    { type: 'pinch', on: 'floor', x: 0, y: 0, t: 1, scale: 1 },
    { type: 'release', on: 'newt', x: 0, y: 0, t: 2 },
    { type: 'grab', on: 'newt', x: 0, y: 0, t: 2 },
  ]);
  assert.deepEqual(o.goal, before, 'his own gestures leave it be');
});

test('the light turns with the camera’s yaw, so his shadow falls the same way on screen (back and to one side) after any orbit', () => {
  for (const [name, p] of Object.entries(LOOKS)) {
    /** Where his shadow falls (away from the light), across and into the screen, with the camera at `yaw`. */
    const onScreen = (yaw) => {
      const o = createOrbit({ distance: HOME, yaw });
      const { position, target } = orbitPose(o);
      const into = { x: target.x - position.x, z: target.z - position.z };
      const n = Math.hypot(into.x, into.z);
      const fwd = { x: into.x / n, z: into.z / n };
      const right = { x: -fwd.z, z: fwd.x };
      const l = lightDir(p.sun.dir, yaw);
      close(l.y, p.sun.dir[1], 1e-12, `${name}: as high as ever`);
      close(Math.hypot(l.x, l.z), Math.hypot(p.sun.dir[0], p.sun.dir[2]), 1e-12, `${name}: only turned`);
      const fall = { x: -l.x, z: -l.z };
      return { across: fall.x * right.x + fall.z * right.z, into: fall.x * fwd.x + fall.z * fwd.z };
    };
    const home = onScreen(0);
    assert.deepEqual(lightDir(p.sun.dir, 0), { x: p.sun.dir[0], y: p.sun.dir[1], z: p.sun.dir[2] });
    assert.ok(home.into > 0, `${name}: at the default view it falls back, away from the camera`);
    assert.ok(Math.abs(home.across) > 0.3 * home.into, `${name}: and to one side`);
    for (const yaw of [0.4, 1.7, -2.3, Math.PI, 5.5]) {
      const at = onScreen(yaw);
      close(at.across, home.across, 1e-9, `${name} at yaw ${yaw}: across`);
      close(at.into, home.into, 1e-9, `${name} at yaw ${yaw}: into the screen`);
    }
  }
});
