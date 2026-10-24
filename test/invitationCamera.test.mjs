// The invitation toy's orbit camera (src/invitation/camera.js), pure: a drag on empty space
// turns it around the vertical axis (a full turn and more; about three quarters of one for a
// drag across the whole stage, on a phone and a desktop alike) and tilts it between 12° and 70°
// (by the stage's height),
// eased (damped, no jump, no overshoot) with a little coast after a fling; the wheel and a
// pinch zoom between half and twice the default distance; the point it orbits stays on the
// play area's centre at a desktop's default zoom (the whole play area in view) and follows NEWT
// softly as it zooms in, so he stays in frame (on a phone, where he's drawn bigger, most of the
// way at the default zoom too, and all the way at any zoom while the Look sheet is open);
// Reset Camera eases back to the default the short way round; a resize keeps the zoom; and the light turns with it, so his shadow falls the same way
// on screen after any orbit. A pan (the mouse's left-drag on empty space, two fingers) slides
// the view across and up and down the screen, the floor under the cursor staying under it,
// kept to a region round the play area's middle sized by the area and the zoom (past its edge
// it gives like a rubber band and eases back once let go); a pan stays where it was put however
// NEWT moves, until Follow NEWT, a grab or a tap on him, or Reset Camera ends it. The wheel and
// a pinch zoom about the cursor or the fingers' middle (the floor there stays there) and keep
// the pan. The camera pad turns it 45° and tilts it 12° at a press, eased. However the camera
// is turned, a tap across the screen's middle reaches its sides (one play area round the
// middle), and NEWT walking anywhere in the play area never leaves the screen: the view holds
// still while he's well inside it and moves on as he nears an edge. While he's held the view
// holds still. Play Intro's shots: the
// view goes round to the front and each box's camera eases there (or cuts, for reduced motion):
// close (head and shoulders), medium (his whole body), wide (the default view), keep (as it
// was), framed in the clear space over the chat box; at the end it eases back to the view before.
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
  orbitFollowAll,
  orbitHome,
  orbitPose,
  orbitRelease,
  orbitReset,
  orbitSpan,
  orbitSpot,
  orbitStep,
  orbitTurning,
  orbitWheel,
  orbitZoom,
  tiltPerPx,
  turnPerPx,
  orbitArea,
  orbitFollow,
  orbitHold,
  orbitNudge,
  orbitPan,
  panRegion,
  screenOf,
  worldPerPx,
  floorUnder,
  SHOT,
  orbitShot,
  orbitTalk,
  shotView,
} from '../src/invitation/camera.js';
import { VIEW, frameView, project, texelGrid } from '../src/invitation/pixels.js';
import { LOOKS } from '../src/invitation/look.js';
import { AREA_RADIUS, NEWT_HEIGHT, NEWT_RADIUS, viewArea } from '../src/invitation/area.js';
import { centreOf, clampTo, xRange } from '../src/invitation/steer.js';
import { GAIT } from '../src/invitation/clips.js';
import { createRng } from '../src/invitation/rng.js';

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

test('orbitTurning says whether the view still turns: while dragged, through a fling’s coast and its easing, and not once it has come to rest', () => {
  const o = createOrbit({ distance: HOME });
  assert.equal(orbitTurning(o), false, 'at rest at home');
  let t = 0;
  for (let i = 0; i < 6; i++) orbitDrag(o, -30, 0, (t += DT));
  assert.equal(orbitTurning(o), true, 'while dragged');
  orbitRelease(o, t + DT / 2);
  assert.ok(o.spin.yaw !== 0, 'a quick drag let go flings it');
  assert.equal(orbitTurning(o), true, 'coasting');
  let frames = 0;
  while (orbitTurning(o) && frames < 60 * 30) {
    orbitStep(o, DT, null);
    frames++;
  }
  assert.ok(frames < 60 * 30, `it comes to rest (${frames} frames)`);
  const still = o.yaw;
  for (let i = 0; i < 60; i++) orbitStep(o, DT, null);
  assert.ok(Math.abs(o.yaw - still) < 2e-3, `at rest it stays put (moved ${Math.abs(o.yaw - still)})`);
  // (Slow frames, as a software-rendered browser draws them: the same rest, by the toy's clock.)
  const slow = createOrbit({ distance: HOME });
  t = 0;
  for (let i = 0; i < 6; i++) orbitDrag(slow, -30, 0, (t += DT));
  orbitRelease(slow, t + DT / 2);
  let steps = 0;
  while (orbitTurning(slow) && steps < 600) {
    orbitStep(slow, 0.05, null);
    steps++;
  }
  assert.ok(steps < 600, `slow frames come to rest too (${steps} steps of 50 ms)`);
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
  const newt = { x: 0.8, z: -0.6 }; // (well inside a phone's view: keeping him on screen leaves it be)
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

test('while the Look sheet is open the orbit follows NEWT all the way, softly, at any zoom, so he stays in the clear space; closed, the usual share again', () => {
  const newt = { x: 2, z: -1 };
  for (const span of [
    { w: 1280, h: 800 },
    { w: 390, h: 844 },
  ]) {
    const o = createOrbit({ distance: HOME, span });
    const usual = followShare(o);
    orbitFollowAll(o, true);
    assert.equal(followShare(o), 1, `${span.w}x${span.h}: all the way at the default zoom`);
    orbitStep(o, DT, newt);
    assert.ok(o.target.x > 0 && o.target.x < 0.2, `softly: a frame moves only a little (${o.target.x})`);
    settle(o, 4, newt);
    close(o.target.x, newt.x, 1e-3, 'onto him');
    close(o.target.z, newt.z, 1e-3);
    orbitZoom(o, 0.6);
    settle(o, 2, newt);
    assert.equal(followShare(o), 1, 'zoomed out too');
    orbitFollowAll(o, false);
    assert.equal(followShare(o), usual, 'closed: the usual share at this zoom');
    settle(o, 4, newt);
    close(o.target.x, newt.x * usual, 1e-3, 'and back to it, softly');
  }
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

// ---- pan, the play area and keeping NEWT in view -------------------------------------------

const INSETS = { top: 16, bottom: 72, left: 24, right: 24 };
/**
 * A screen's default view, its play area, and an orbit on it as main.js makes one: the stage's
 * size, the canvas's height (the field of view's) and half the clear space round where the
 * point it looks at shows.
 */
function stageFor(w, h, dpr = 1) {
  const grid = texelGrid({ cssW: w, cssH: h, dpr, pixelSize: '96' });
  const view = frameView({ cssW: w, cssH: h, grid, insets: INSETS, area: AREA_RADIUS + NEWT_RADIUS });
  const area = viewArea({ view, cssW: w, cssH: h, insets: INSETS });
  const frame = { hw: (w - INSETS.left - INSETS.right) / 2, hh: (h - INSETS.top - INSETS.bottom) / 2 };
  const make = (yaw = 0) => {
    const o = createOrbit({ distance: view.distance, yaw, span: { w, h } });
    orbitSpan(o, { w, h, ch: view.canvasH, ...frame });
    orbitArea(o, area);
    return o;
  };
  return { view, area, frame, make };
}
/** NEWT standing at `n` on screen with orbit `o` (CSS px from where its target shows): his body's extremes. */
function boxOf(o, n) {
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  const r = { x: Math.cos(o.yaw), z: -Math.sin(o.yaw) };
  for (const y of [0, NEWT_HEIGHT])
    for (const k of [-1, 1]) {
      const s = screenOf(o, { x: n.x + k * NEWT_RADIUS * r.x, y, z: n.z + k * NEWT_RADIUS * r.z });
      box.left = Math.min(box.left, s.x);
      box.right = Math.max(box.right, s.x);
      box.top = Math.min(box.top, s.y);
      box.bottom = Math.max(box.bottom, s.y);
    }
  return box;
}
const inFrame = (box, f) => box.left >= -f.hw && box.right <= f.hw && box.top >= -f.hh && box.bottom <= f.hh;

test('screenOf puts a world point where the camera shows it: as pixels.js projects it at the default view, and turned with the camera', () => {
  for (const [w, h, dpr] of [
    [1280, 800, 1],
    [390, 844, 3],
  ]) {
    const { view, make } = stageFor(w, h, dpr);
    const o = make();
    const at = project(view, view.target);
    for (const p of [
      { x: 1, y: 0, z: 0 },
      { x: -2, y: 1, z: -3 },
      { x: 0.5, y: 0.2, z: 2 },
    ]) {
      const want = project(view, p);
      const got = screenOf(o, p);
      close(got.x, want.x - at.x, 1e-6, `${w}x${h} across`);
      close(got.y, want.y - at.y, 1e-6, `${w}x${h} down`);
    }
    // Turned, a point turned with it shows in the same place.
    orbitDrag(o, -200, 0, 0);
    settle(o, 3);
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const p = { x: 1.5, y: 0.3, z: -1 };
    const turned = { x: p.x * c + p.z * s, y: p.y, z: p.z * c - p.x * s };
    const want = project(view, p);
    close(screenOf(o, turned).x, want.x - at.x, 1e-6);
    close(screenOf(o, turned).y, want.y - at.y, 1e-6);
  }
});

test('a pan slides the view across and up and down the screen, at once: the floor under the cursor stays under it, at any yaw and zoom (inside the pan’s region)', () => {
  const { make } = stageFor(1280, 800);
  for (const yaw of [0, 1, 2.5, -2]) {
    for (const zoom of [1, 1.6, 2]) {
      const o = make(yaw);
      orbitZoom(o, zoom);
      settle(o, 3);
      const at = `yaw ${yaw}, zoom ${zoom}`;
      // A drag that starts here and there on the floor, in several moves.
      let cursor = { x: 120, y: 60 };
      const grabbed = floorUnder(o, cursor);
      const shown = screenOf(o, { x: grabbed.x, y: 0, z: grabbed.z });
      close(shown.x, cursor.x, 1e-6, `${at}: floorUnder is screenOf's inverse`);
      close(shown.y, cursor.y, 1e-6);
      for (const [dx, dy] of [
        [80, 0],
        [0, -60],
        [-50, 40],
        [-30, -25],
      ]) {
        cursor = { x: cursor.x + dx, y: cursor.y + dy };
        orbitPan(o, dx, dy, cursor);
        const now = screenOf(o, { x: grabbed.x, y: 0, z: grabbed.z });
        close(now.x, cursor.x, 1e-6, `${at}: across after (${dx}, ${dy})`);
        close(now.y, cursor.y, 1e-6, `${at}: down after (${dx}, ${dy})`);
      }
      // It stays where the pan put it, at NEWT's middle height, and nothing else about the view
      // changes.
      const put = { ...o.target };
      settle(o, 1, grabbed);
      assert.deepEqual(o.target, put, `${at}: it stays where the pan put it`);
      close(o.target.y, FOCUS_Y, 1e-6, 'the point it looks at stays at his middle height');
      close(o.yaw, o.goal.yaw, 1e-3);
    }
  }
  // Without the cursor's spot: about where the point it looks at shows. With no floor under the
  // cursor (above the horizon), as fast as the floor there would go, and never a fling.
  const o = make();
  close(worldPerPx(o), (2 * o.distance * Math.tan((VIEW.fov * D) / 2)) / o.ch, 1e-6);
  orbitPan(o, 40, 0);
  assert.ok(o.target.x < 0 && o.target.x > -60 * worldPerPx(o), `about 40 px across (${o.target.x})`);
  const sky = make();
  orbitPan(sky, 0, 30, { x: 0, y: -5000 });
  assert.ok(sky.target.z < 0 && sky.target.z > -6 * 30 * worldPerPx(sky), `up the screen, a little (${sky.target.z})`);
});

/** How far the point the camera looks at is past the pan's region, world units. */
const pastRegion = (o) => {
  const c = clampTo(panRegion(o), o.target);
  return Math.hypot(c.x - o.target.x, c.z - o.target.z);
};
const RELEASE = { type: 'release', on: 'floor', x: 0, y: 0, t: 1 };

test('the pan’s region: a square round the play area’s middle, the area’s half less what the view shows its narrower way, so none fully zoomed out and more the closer it zooms, whatever the yaw; at its edge the area’s side shows at the clear space’s side', () => {
  for (const [w, h, dpr] of [
    [1280, 800, 1],
    [390, 844, 3],
  ]) {
    const { area, frame, make } = stageFor(w, h, dpr);
    const half = (area.maxX - area.minX) / 2;
    const c = centreOf(area);
    let last = -1;
    for (const factor of [ORBIT.zoomMin, 0.7, 1, 1.4, 1 / ORBIT.zoomMin]) {
      const o = make();
      orbitZoom(o, factor);
      settle(o, 3);
      const r = panRegion(o);
      const at = `${w}x${h} zoom ${factor}`;
      const l = (r.maxX - r.minX) / 2;
      close((r.maxZ - r.minZ) / 2, l, 1e-9, `${at}: a square`);
      close((r.minX + r.maxX) / 2, c.x, 1e-9, `${at}: round the middle`);
      close((r.minZ + r.maxZ) / 2, c.z, 1e-9);
      assert.ok(l >= last - 1e-9, `${at}: more room the closer it zooms (${l} after ${last})`);
      assert.ok(l < half, `${at}: inside the play area`);
      last = l;
      if (factor === ORBIT.zoomMin) assert.equal(l, 0, `${at}: fully zoomed out, the whole area's in view: no pan`);
      const turned = make(1.1);
      orbitZoom(turned, factor);
      settle(turned, 3);
      assert.deepEqual(panRegion(turned), r, `${at}: the same turned`);
    }
    if (w > h) continue;
    // On a phone, its narrower way is across: at the region's edge the area's side shows at the
    // clear space's side, turned or not.
    for (const yaw of [0, Math.PI / 2]) {
      const o = make(yaw);
      settle(o, 2);
      const r = panRegion(o);
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const l = (r.maxX - r.minX) / 2;
      o.target.x = c.x + right.x * l;
      o.target.z = c.z + right.z * l;
      const side = screenOf(o, { x: c.x + right.x * half, y: 0, z: c.z + right.z * half });
      close(side.x, frame.hw, frame.hw * 0.06, `yaw ${yaw}: the area's side at the clear space's`);
    }
  }
});

test('past the pan’s region a pan gives like a rubber band: the floor slips under the cursor and the view goes at most ORBIT.bandPx further; let go, it eases back inside with no jump', () => {
  assert.ok(ORBIT.band > 0.2 && ORBIT.band < 1, `give ${ORBIT.band}`);
  assert.ok(ORBIT.bandPx >= 40 && ORBIT.bandPx <= 160, `${ORBIT.bandPx} CSS px`);
  assert.ok(ORBIT.bandBack >= 0.08 && ORBIT.bandBack <= 0.4, `${ORBIT.bandBack} s`);
  const cases = [];
  for (const size of [
    [1280, 800, 1],
    [390, 844, 3],
  ])
    for (const yaw of [0, 0.8, Math.PI, -2.2])
      for (const zoom of [1, 1.6])
        for (const by of [
          [4000, 0],
          [-4000, 0],
          [0, 4000],
          [0, -4000],
          [3000, -3000],
        ])
          cases.push({ size, yaw, zoom, by });
  for (const {
    size: [w, h, dpr],
    yaw,
    zoom,
    by: [dx, dy],
  } of cases) {
    const { make } = stageFor(w, h, dpr);
    const at = `${w}x${h} yaw ${yaw} zoom ${zoom}`;
    const o = make(yaw);
    orbitZoom(o, zoom);
    settle(o, 3);
    const stretch = ORBIT.bandPx * worldPerPx(o);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      orbitPan(o, dx / 40, dy / 40);
      worst = Math.max(worst, pastRegion(o));
    }
    assert.ok(worst > 0.5 * stretch, `${at} (${dx}, ${dy}): it gave past the edge (${worst} of ${stretch})`);
    assert.ok(worst <= stretch + 1e-6, `${at} (${dx}, ${dy}): at most the band's stretch (${worst} of ${stretch})`);
    orbitEvents(o, [RELEASE]);
    let last = pastRegion(o);
    const steps = [];
    for (let t = 0; t < 2; t += DT) {
      orbitStep(o, DT, null);
      const now = pastRegion(o);
      steps.push(last - now);
      last = now;
    }
    assert.ok(last < 1e-3, `${at} (${dx}, ${dy}): back inside (${last})`);
    assert.ok(steps[0] > 0 && steps[0] < 0.25 * worst, `${at}: eased, the first frame ${steps[0]} of ${worst}`);
    steps.forEach((d, i) =>
      assert.ok(i === 0 || d <= steps[i - 1] + 1e-9, `${at}: frame ${i} moves ${d} after ${steps[i - 1]}`),
    );
    assert.ok(o.panned, `${at}: still a pan, only back inside`);
  }
});

test('a pan stays where it was put however NEWT moves, off the screen too; a grab or a tap on him and Follow NEWT (onto him) end it, and so does Reset Camera, with the zoom', () => {
  for (const [w, h, dpr] of [
    [1280, 800, 1],
    [390, 844, 3],
  ]) {
    const { frame, make } = stageFor(w, h, dpr);
    const o = make();
    const at = `${w}x${h}`;
    let newt = { x: 0, z: 0 };
    settle(o, 2, newt);
    orbitPan(o, -frame.hw * 0.25, 0); // (the view slides left: NEWT shows to the right of the middle)
    orbitEvents(o, [RELEASE]);
    settle(o, 0.5, newt);
    const put = { ...o.target };
    // He walks about a little, then walks off to the right: the view stays put all the while.
    for (let t = 0; t < 2; t += DT) {
      newt = { x: 0.3 * Math.sin(t * 3), z: 0.3 * Math.cos(t * 2) };
      orbitStep(o, DT, newt);
    }
    for (let t = 0; t < 10; t += DT) {
      newt = { x: newt.x + GAIT.walk * DT, z: newt.z };
      orbitStep(o, DT, newt);
    }
    close(o.target.x, put.x, 1e-6, `${at}: stayed put`);
    close(o.target.z, put.z, 1e-6);
    assert.ok(o.panned && !inFrame(boxOf(o, newt), frame), `${at}: he walked off and the pan held`);
    // A grab or a tap on him: the pan's over and the view takes him again, from where it was (no
    // jump: an ease), until he's in view.
    orbitFollow(o);
    assert.equal(o.panned, false, `${at}: no pan`);
    const before = { ...o.target };
    orbitStep(o, DT, newt);
    const first = Math.hypot(o.target.x - before.x, o.target.z - before.z);
    settle(o, 5, newt);
    const whole = Math.hypot(o.target.x - before.x, o.target.z - before.z);
    assert.ok(first < 0.1 * whole, `${at}: eased (${first.toFixed(3)} of ${whole.toFixed(3)} the first frame)`);
    assert.ok(inFrame(boxOf(o, newt), frame), `${at}: him in view`);
    // Panned away again, then Follow NEWT: onto him.
    newt = { x: 0.6, z: -0.4 };
    orbitPan(o, frame.hw * 0.2, frame.hh * 0.1);
    orbitEvents(o, [RELEASE]);
    settle(o, 1, newt);
    orbitFollow(o, newt);
    settle(o, 4, newt);
    assert.equal(o.panned, false);
    assert.ok(
      Math.hypot(o.target.x - newt.x, o.target.z - newt.z) < 0.05,
      `${at}: onto him ${JSON.stringify(o.target)}`,
    );
    // Reset Camera: no pan, the default zoom, and him in view again, the view as near the
    // default as keeps him there.
    orbitPan(o, -frame.hw * 0.2, 0);
    orbitEvents(o, [RELEASE]);
    orbitZoom(o, 0.7);
    newt = { x: 0.5, z: 0.2 };
    orbitReset(o);
    settle(o, 5, newt);
    assert.equal(o.panned, false);
    close(o.distance, o.home.distance, 1e-2 * o.home.distance, `${at}: the default zoom`);
    assert.ok(inFrame(boxOf(o, newt), frame), `${at}: him in view`);
    assert.ok(
      Math.hypot(o.target.x, o.target.z) < 0.5 + 1e-3,
      `${at}: back near the middle (${JSON.stringify(o.target)})`,
    );
  }
});

test('the wheel and a pinch zoom about the cursor or the fingers’ middle: the floor there stays there all the way in or out, and the view stays put after (a pan); with no point, or the point it looks at, it zooms where it looks', () => {
  for (const [w, h, dpr] of [
    [1280, 800, 1],
    [390, 844, 3],
  ])
    for (const yaw of [0, 1.2]) {
      const { make } = stageFor(w, h, dpr);
      const where = `${w}x${h} yaw ${yaw}`;
      const o = make(yaw);
      const newt = { x: 0, z: 0 };
      settle(o, 2, newt);
      /** Steps until the zoom has arrived, the floor under `at` staying `p` every frame. */
      const holds = (at, p, msg) => {
        for (let i = 0; i < 300 && Math.abs(o.goal.distance - o.distance) > 1e-3 * o.home.distance; i++) {
          orbitStep(o, DT, newt);
          const q = floorUnder(o, at);
          assert.ok(
            Math.hypot(q.x - p.x, q.z - p.z) < 1e-4,
            `${where} ${msg}: frame ${i} the floor slid to ${JSON.stringify(q)}`,
          );
        }
      };
      const at = { x: w * 0.12, y: h * 0.06 };
      const p = floorUnder(o, at);
      orbitWheel(o, -300, at);
      assert.ok(o.goal.distance < o.home.distance * 0.7, `${where}: closer`);
      assert.ok(o.panned, `${where}: a zoom about a point holds the view there`);
      holds(at, p, 'the wheel');
      // A pinch's middle, in the events' client px with where the point it looks at shows.
      const shown = { x: 500, y: 300 };
      const mid = { x: 30, y: -20 };
      const p2 = floorUnder(o, mid);
      orbitEvents(
        o,
        [{ type: 'pinch', on: 'floor', x: shown.x + mid.x, y: shown.y + mid.y, t: 2, scale: 0.85 }],
        shown,
      );
      assert.ok(o.goal.distance > o.distance, `${where}: the fingers closing: further`);
      holds(mid, p2, 'the pinch');
      const put = { ...o.target };
      settle(o, 2, { x: 3, z: 3 });
      assert.ok(Math.hypot(o.target.x - put.x, o.target.z - put.z) < 0.05, `${where}: the view stays put after`);
    }
  // With no point (the camera pad's Zoom In and Out), or about the point it looks at: no pan.
  const { make } = stageFor(1280, 800);
  const o = make();
  settle(o, 2, { x: 0, z: 0 });
  orbitZoom(o, 1.25);
  orbitZoom(o, 1.25, { x: 0, y: 0 });
  assert.equal(o.panned, false);
  settle(o, 2, { x: 0, z: 0 });
  close(o.target.x, 0, 1e-6);
  close(o.target.z, 0, 1e-6);
  // A zoom while panned keeps the pan where it was.
  orbitPan(o, 60, 20);
  orbitEvents(o, [RELEASE]);
  settle(o, 1, { x: 0, z: 0 });
  const put = { ...o.target };
  orbitZoom(o, 1.2);
  settle(o, 2, { x: 0, z: 0 });
  assert.ok(o.panned, 'still panned');
  close(o.target.x, put.x, 1e-6, 'and where it was');
  close(o.target.z, put.z, 1e-6);
});

test('the camera pad: Turn Left and Right go round 45°, Tilt Up and Down 12° within 12°–70°, eased with no jump or overshoot; a fling under way stops; the pan and the zoom stay', () => {
  assert.ok(ORBIT.nudgeEase >= 0.15 && ORBIT.nudgeEase <= 0.4, `${ORBIT.nudgeEase} s`);
  const o = createOrbit({ distance: HOME });
  settle(o, 1);
  orbitPan(o, 30, 0);
  orbitEvents(o, [RELEASE]);
  orbitZoom(o, 1.2);
  settle(o, 2);
  const target = { ...o.target };
  const distance = o.distance;
  orbitNudge(o, { yaw: 45 * D });
  close(o.goal.yaw, 45 * D, 1e-9, 'its goal: 45° round');
  let last = o.yaw;
  const steps = [];
  for (let t = 0; t < 2; t += DT) {
    orbitStep(o, DT, null);
    steps.push(o.yaw - last);
    last = o.yaw;
    assert.ok(o.yaw <= 45 * D + 1e-9, 'no overshoot');
  }
  close(o.yaw, 45 * D, 1e-3, 'there');
  assert.ok(steps[0] > 0 && steps[0] < 0.15 * 45 * D, `eased: ${(steps[0] / D).toFixed(1)}° the first frame`);
  steps.forEach((d, i) => assert.ok(i === 0 || d <= steps[i - 1] + 1e-9, `frame ${i}`));
  orbitNudge(o, { yaw: -90 * D });
  settle(o, 2);
  close(o.yaw, -45 * D, 1e-3, 'and back past where it began');
  // The tilt: 12° a press, never past 12° or 70°.
  close(o.elevation, VIEW.elevation * D, 1e-3);
  orbitNudge(o, { elevation: 12 * D });
  close(o.goal.elevation, (VIEW.elevation + 12) * D, 1e-9);
  for (let i = 0; i < 6; i++) orbitNudge(o, { elevation: 12 * D });
  close(o.goal.elevation, ORBIT.elevMax, 1e-9, 'at most 70°');
  for (let i = 0; i < 9; i++) orbitNudge(o, { elevation: -12 * D });
  close(o.goal.elevation, ORBIT.elevMin, 1e-9, 'at least 12°');
  settle(o, 2);
  // A fling coasting: a press stops it.
  orbitDrag(o, 0, 0, 10);
  orbitDrag(o, -200, 0, 10.02);
  orbitRelease(o, 10.03);
  assert.ok(o.spin.yaw !== 0, 'flung');
  orbitNudge(o, { yaw: 45 * D });
  assert.deepEqual(o.spin, { yaw: 0, elevation: 0 });
  assert.equal(o.drag, null);
  settle(o, 2);
  close(o.target.x, target.x, 1e-6, 'the pan stays');
  close(o.target.z, target.z, 1e-6);
  close(o.distance, distance, 1e-6, 'the zoom stays');
});

test('however the camera turns, a tap across the screen’s middle reaches its sides at the default zoom: one play area round the middle, its walls never inside the screen', () => {
  for (const [w, h, dpr] of [
    [1280, 800, 1],
    [390, 844, 3],
  ]) {
    const { area, frame, make } = stageFor(w, h, dpr);
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const o = make(yaw);
      settle(o, 2, { x: 0, z: 0 });
      for (let i = -10; i <= 10; i++)
        for (const row of [-0.1, 0, 0.1]) {
          const p = { x: (frame.hw * 0.96 * i) / 10, y: frame.hh * row };
          const f = floorUnder(o, p);
          const c = clampTo(area, f);
          assert.ok(
            Math.hypot(c.x - f.x, c.z - f.z) < 1e-9,
            `${w}x${h} yaw ${(yaw / D).toFixed(0)}°: a tap at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) can't reach ${JSON.stringify(f)}`,
          );
        }
    }
  }
});

test('NEWT walking or running anywhere in the play area never leaves the screen, however the camera is turned: the view holds still while he is well inside it and moves on as he nears an edge', () => {
  const rng = createRng(4);
  for (const [w, h, dpr] of [
    [1280, 800, 1],
    [390, 844, 3],
    [844, 390, 3],
  ]) {
    const { area, frame, make } = stageFor(w, h, dpr);
    for (const yaw of [0, 1.2, Math.PI, -2]) {
      const at = `${w}x${h} at yaw ${yaw}`;
      const o = make(yaw);
      let newt = { x: 0, z: 0 };
      settle(o, 3, newt);
      for (let leg = 0; leg < 8; leg++) {
        // To a spot anywhere in the play area, at walking or running speed.
        const z = area.minZ + rng() * (area.maxZ - area.minZ);
        const [lo, hi] = xRange(area, z);
        const goal = { x: lo + rng() * (hi - lo), z };
        const speed = leg % 2 ? GAIT.run : GAIT.walk;
        const len = Math.hypot(goal.x - newt.x, goal.z - newt.z);
        const from = newt;
        for (let t = 0; t < len / speed + 1; t += DT) {
          const k = Math.min(1, (t * speed) / len);
          newt = { x: from.x + (goal.x - from.x) * k, z: from.z + (goal.z - from.z) * k };
          orbitStep(o, DT, newt);
          const box = boxOf(o, newt);
          assert.ok(inFrame(box, frame), `${at}, leg ${leg} at ${t.toFixed(2)} s: ${JSON.stringify(box)}`);
        }
      }
    }
  }
  // On a desktop, small steps round the middle never move the view at the default zoom.
  const { make } = stageFor(1280, 800);
  const o = make();
  settle(o, 2, { x: 0, z: 0 });
  for (let t = 0; t < 4; t += DT) orbitStep(o, DT, { x: 1.2 * Math.sin(t), z: 0.8 * Math.cos(t) });
  close(o.target.x, 0, 1e-6, 'still');
  close(o.target.z, 0, 1e-6);
});

test('while NEWT is held the view holds still, zoomed in too, and once he is let go it follows again', () => {
  const { make } = stageFor(1280, 800);
  const o = make();
  orbitZoom(o, 100); // (all the way in: it follows him all the way)
  settle(o, 3, { x: 0, z: 0 });
  orbitHold(o, true);
  for (let t = 0; t < 1; t += DT) orbitStep(o, DT, { x: t, z: 0, y: 0.6 });
  close(o.target.x, 0, 1e-6, 'held: still');
  orbitHold(o, false);
  settle(o, 5, { x: 1, z: 0 });
  close(o.target.x, 1, 1e-3, 'let go: after him');
});

test('let go out near the screen’s edge, past where the view keeps him, the view eases back round him: no jump on the frame he’s let go, zoomed in too', () => {
  /** NEWT at `n` (his feet `n.y` up) on screen: his box, CSS px from where the target shows. */
  const boxAt = (o, n) => {
    const r = { x: Math.cos(o.yaw), z: -Math.sin(o.yaw) };
    const xs = [];
    const ys = [];
    for (const y of [n.y, n.y + NEWT_HEIGHT])
      for (const k of [-1, 1]) {
        const s = screenOf(o, { x: n.x + k * NEWT_RADIUS * r.x, y, z: n.z + k * NEWT_RADIUS * r.z });
        xs.push(s.x);
        ys.push(s.y);
      }
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  };
  for (const zoom of [1, 1.5, 2]) {
    const { frame, make } = stageFor(1280, 800);
    const o = make();
    orbitZoom(o, zoom);
    settle(o, 3, { x: 0, z: 0 });
    // Held and carried out to the screen's right edge, a little off the floor (his side past the
    // clear space, as a drag along the edge leaves him): the view holds.
    orbitHold(o, true);
    let newt = { x: 0, z: 0, y: 0.4 };
    while (boxAt(o, newt).right < frame.hw + 20) {
      newt = { ...newt, x: newt.x + 0.005 };
      orbitStep(o, DT, newt);
    }
    const over = boxAt(o, newt).right - ORBIT.keepOut * frame.hw;
    assert.ok(over > 50, `zoom ${zoom}: past keepOut by ${over.toFixed(1)} px`);
    // Let go where he is (he drops there): an ease back, never the whole way at once, each
    // frame's move no bigger than the last (no jump later on either).
    orbitHold(o, false);
    let last = boxAt(o, newt).right;
    const steps = [];
    for (let t = 0; t < 1.5; t += DT) {
      orbitStep(o, DT, newt);
      const now = boxAt(o, newt).right;
      steps.push(last - now);
      last = now;
    }
    assert.ok(
      steps[0] < 0.4 * over,
      `zoom ${zoom}: the first frame moves him ${steps[0].toFixed(1)} of ${over.toFixed(1)} px`,
    );
    steps.forEach((d, i) =>
      assert.ok(
        i === 0 || d <= steps[i - 1] + 0.5,
        `zoom ${zoom}: frame ${i} moves him ${d.toFixed(1)} px, after ${steps[i - 1]?.toFixed(1)}`,
      ),
    );
    assert.ok(last <= ORBIT.keepOut * frame.hw + 0.5, `zoom ${zoom}: back inside keepOut (${last.toFixed(1)})`);
    // And from there it keeps him in as before: walking out at running speed, never past it.
    for (let t = 0; t < 1; t += DT) {
      newt = { x: newt.x + GAIT.run * DT, z: 0, y: 0 };
      orbitStep(o, DT, newt);
      assert.ok(boxAt(o, newt).right <= ORBIT.keepOut * frame.hw + 0.5, `zoom ${zoom}: kept in at ${t.toFixed(2)} s`);
    }
  }
});

test('the gestures pan it too: a pan event slides it at once, and letting go ends the pan', () => {
  const { make } = stageFor(1280, 800);
  const o = make();
  settle(o, 1, { x: 0, z: 0 });
  orbitEvents(o, [
    { type: 'pan', on: 'floor', x: 10, y: 0, t: 0.01, dx: 30, dy: 0 },
    { type: 'pan', on: 'floor', x: 20, y: 0, t: 0.02, dx: 20, dy: 10 },
  ]);
  close(o.target.x, -50 * worldPerPx(o), 0.15 * 50 * worldPerPx(o), 'slid across by about 50 px');
  assert.ok(o.target.z < 0, 'and up the screen');
  // Told where the point it looks at shows, a pan keeps the floor under the cursor.
  const q = make();
  settle(q, 1, { x: 0, z: 0 });
  const shownAt = { x: 640, y: 380 };
  const under = floorUnder(q, { x: 100, y: 50 });
  orbitEvents(q, [{ type: 'pan', on: 'floor', x: 640 + 130, y: 380 + 20, t: 0.01, dx: 30, dy: -30 }], shownAt);
  const now = screenOf(q, { x: under.x, y: 0, z: under.z });
  close(now.x, 130, 1e-6);
  close(now.y, 20, 1e-6);
  assert.equal(o.panned, true);
  assert.equal(o.panning, true);
  orbitEvents(o, [{ type: 'release', on: 'floor', x: 20, y: 0, t: 0.04 }]);
  assert.equal(o.panning, false);
  assert.equal(o.panned, true, 'the view stays where it was put');
  assert.deepEqual(o.spin, { yaw: 0, elevation: 0 }, 'a pan never flings the turn');
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

// ---- Play Intro's shots -----------------------------------------------------------------------

/** A phone's orbit, its view the toy's (pixels.js frameView), NEWT at `at`. */
function phoneOrbit() {
  const grid = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '128' });
  const view = frameView({ cssW: 390, cssH: 844, grid, insets: { top: 16, bottom: 80, left: 24, right: 24 } });
  const o = createOrbit({ distance: view.distance, span: { w: 390, h: 844 } });
  orbitSpan(o, { w: 390, h: 844, ch: grid.canvasH });
  return o;
}
const CLEAR = { h: 560, raise: 40 };

test('the shots: close nearer than medium, medium nearer than the default; lower and aimed higher; wide is the default view; keep is none', () => {
  const o = phoneOrbit();
  orbitTalk(o, true);
  const c = shotView(o, 'close', CLEAR);
  const m = shotView(o, 'medium', CLEAR);
  const w = shotView(o, 'wide', CLEAR);
  assert.ok(c && m && w);
  assert.ok(c.distance < m.distance && m.distance < o.home.distance, `${c.distance} ${m.distance} ${o.home.distance}`);
  assert.ok(c.elevation < o.home.elevation && m.elevation < o.home.elevation);
  assert.ok(c.lookY > m.lookY, 'close aims at his head');
  close(w.distance, o.home.distance);
  close(w.elevation, o.home.elevation);
  assert.equal(shotView(o, 'keep', CLEAR), null);
  for (const v of [c, m, w]) close(v.yaw, o.home.yaw, 1e-6, 'all from the front');
});

test('a shot frames him in the clear space: close his head and shoulders, medium his whole body, raised over the box', () => {
  for (const [name, spec] of /** @type {const} */ ([
    ['close', SHOT.close],
    ['medium', SHOT.medium],
  ])) {
    const o = phoneOrbit();
    orbitTalk(o, true);
    orbitShot(o, shotView(o, name, CLEAR), { cut: true, focus: { x: 0, z: 0 } });
    const top = screenOf(o, { x: 0, y: spec.mid + spec.span / 2, z: 0 });
    const bottom = screenOf(o, { x: 0, y: spec.mid - spec.span / 2, z: 0 });
    const mid = screenOf(o, { x: 0, y: spec.mid, z: 0 });
    assert.ok(top && bottom && mid);
    const tall = bottom.y - top.y;
    assert.ok(Math.abs(tall - spec.fill * CLEAR.h) <= 0.12 * spec.fill * CLEAR.h, `${name}: ${tall} px tall`);
    assert.ok(
      Math.abs(mid.y + CLEAR.raise) <= 0.15 * CLEAR.raise + 4,
      `${name}: his middle ${mid.y} px from the point`,
    );
  }
});

test('Play Intro turns the view round to the front the short way; each shot eases there, or cuts', () => {
  const o = phoneOrbit();
  orbitDrag(o, -300, 0, 0);
  settle(o, 2, { x: 0, z: 0 });
  const turned = o.yaw;
  assert.ok(Math.abs(turned) > 1);
  orbitTalk(o, true);
  const v = /** @type {NonNullable<ReturnType<typeof shotView>>} */ (shotView(o, 'close', CLEAR));
  orbitShot(o, v, { focus: { x: 0.2, z: -0.1 } });
  orbitStep(o, DT, { x: 0.2, z: -0.1 });
  assert.ok(Math.abs(o.distance - v.distance) > 0.8 * Math.abs(o.home.distance - v.distance), 'no jump');
  assert.ok(Math.abs(wrap(o.yaw - turned)) < 0.2, 'eases, from where it was');
  settle(o, 4, { x: 0.2, z: -0.1 });
  close(o.distance, v.distance, 1e-3 * v.distance);
  close(wrap(o.yaw), 0, 1e-3, 'at the front');
  close(o.target.x, 0.2, 1e-3, 'on NEWT');
  close(o.target.z, -0.1, 1e-3);
  close(o.target.y, v.lookY, 1e-3);
  // (Cut: there at once.)
  const m = /** @type {NonNullable<ReturnType<typeof shotView>>} */ (shotView(o, 'medium', CLEAR));
  orbitShot(o, m, { cut: true, focus: { x: 0.2, z: -0.1 } });
  close(o.distance, m.distance);
  close(o.elevation, m.elevation);
  close(o.target.y, m.lookY);
  // (Keep: nothing changes.)
  orbitShot(o, null, { focus: { x: 0.2, z: -0.1 } });
  settle(o, 1, { x: 0.2, z: -0.1 });
  close(o.distance, m.distance, 1e-6);
});

test('with reduced motion the intro cuts: the turn to the front and the way back are there at once', () => {
  const o = phoneOrbit();
  const him = { x: 0.3, z: 0.2 };
  orbitDrag(o, -300, 0, 0);
  orbitZoom(o, 1.3);
  settle(o, 3, him);
  const was = { yaw: o.yaw, elevation: o.elevation, distance: o.distance, target: { ...o.target } };
  assert.ok(Math.abs(wrap(was.yaw)) > 1);
  orbitTalk(o, true, { cut: true });
  close(wrap(o.yaw), 0, 1e-9, 'at the front at once');
  orbitShot(o, shotView(o, 'close', CLEAR), { cut: true, focus: him });
  orbitStep(o, DT, him);
  orbitTalk(o, false, { cut: true, focus: him });
  close(wrap(o.yaw - was.yaw), 0, 1e-9, 'back at once');
  close(o.elevation, was.elevation, 1e-9);
  close(o.distance, was.distance, 1e-9);
  close(o.target.y, FOCUS_Y, 1e-9);
  close(o.target.x, was.target.x, 1e-3, 'looking where it did');
  close(o.target.z, was.target.z, 1e-3);
  assert.equal(o.resetting, false, 'nothing left to ease');
  // (A frame later, nothing has eased on.)
  orbitStep(o, DT, him);
  close(o.distance, was.distance, 1e-9);
  close(wrap(o.yaw - was.yaw), 0, 1e-9);
  close(o.target.x, was.target.x, 1e-3);
});

test('at the end of the intro the view eases back to where it was, its pan too', () => {
  const o = phoneOrbit();
  orbitPan(o, 40, 0);
  o.panning = false;
  orbitZoom(o, 1.4);
  settle(o, 2, { x: 0, z: 0 });
  const was = { yaw: o.yaw, elevation: o.elevation, distance: o.distance, base: { ...o.base } };
  orbitTalk(o, true);
  orbitShot(o, shotView(o, 'close', CLEAR), { cut: true, focus: { x: 0, z: 0 } });
  orbitTalk(o, false);
  orbitStep(o, DT, { x: 0, z: 0 });
  assert.ok(Math.abs(o.distance - was.distance) > 0.5 * Math.abs(was.distance - SHOT.close.span), 'no jump back');
  settle(o, 4, { x: 0, z: 0 });
  close(o.distance, was.distance, 1e-3 * was.distance);
  close(o.elevation, was.elevation, 1e-3);
  close(wrap(o.yaw - was.yaw), 0, 1e-3);
  close(o.target.y, FOCUS_Y, 1e-3);
  assert.equal(o.panned, true, 'the pan kept');
  close(o.base.x, was.base.x, 1e-6);
});
