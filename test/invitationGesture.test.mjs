// How the invitation toy reads pointers (src/invitation/gesture.js). A short, still press on
// NEWT is a tap and on the floor a floor tap; a press on him that moves more than 10 CSS px or
// lasts longer than 280 ms is a grab, then drags, then a release when it lets go. A cancelled
// pointer or a lost capture drops him and never taps him, and only the first pointer counts.
// Mouse moves without a button hover. Its helpers find where a ray meets a level plane (the
// floor, or the lift height while he's carried) and whether a point is on his screen shape: a
// head circle and a body capsule, at least 22 px across, plus some slop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGesture, rayPlaneY, pickScreen, GESTURE, PICK_MIN_R } from '../src/invitation/gesture.js';

/** A touch sample: client px, seconds. */
const P = (id, x, y, t, extra = {}) => ({ id, x, y, t, kind: 'touch', buttons: 1, ...extra });
const types = (evs) => evs.map((e) => e.type);
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} should be ${b}`);

test('the defaults are 10 CSS px and 280 ms', () => {
  assert.equal(GESTURE.moveTol, 10);
  assert.equal(GESTURE.holdMs, 280);
});

test('a short, still press on NEWT is a tap; on the floor it is a floor tap', () => {
  const g = createGesture();
  assert.deepEqual(g.down(P(1, 100, 100, 1), true), []);
  assert.deepEqual(g.tick(1.2), []);
  assert.deepEqual(g.move(P(1, 106, 108, 1.22)), [], '10 px is still a tap');
  const a = g.up(P(1, 106, 108, 1.25));
  assert.deepEqual(types(a), ['tap']);
  assert.equal(a[0].on, 'newt');
  assert.equal(a[0].x, 106);
  assert.equal(a[0].y, 108);
  assert.equal(a[0].t, 1.25);

  assert.deepEqual(g.down(P(2, 300, 400, 2), false), []);
  const b = g.up(P(2, 302, 401, 2.1));
  assert.deepEqual(types(b), ['tap']);
  assert.equal(b[0].on, 'floor');
});

test('a press on NEWT that moves more than 10 px is a grab, then drags, then a release', () => {
  const g = createGesture();
  g.down(P(1, 100, 100, 0), true);
  assert.deepEqual(g.move(P(1, 106, 108, 0.05)), []);
  const m = g.move(P(1, 107, 108, 0.06));
  assert.deepEqual(types(m), ['grab', 'drag']);
  assert.ok(m.every((e) => e.on === 'newt'));
  assert.deepEqual(types(g.move(P(1, 150, 120, 0.1))), ['drag']);
  assert.deepEqual(g.tick(0.5), [], 'a grab is only made once');
  const r = g.up(P(1, 150, 120, 0.6));
  assert.deepEqual(types(r), ['release']);
  assert.equal(r[0].x, 150);
});

test('a press on NEWT that lasts longer than 280 ms is a grab, even without moving', () => {
  const g = createGesture();
  g.down(P(3, 50, 50, 1), true);
  assert.deepEqual(g.tick(1.28), [], 'at 280 ms it would still be a tap');
  const k = g.tick(1.29);
  assert.deepEqual(types(k), ['grab']);
  assert.equal(k[0].on, 'newt');
  assert.deepEqual(g.tick(1.5), []);
  assert.deepEqual(types(g.up(P(3, 50, 50, 1.6))), ['release']);

  g.down(P(4, 50, 50, 2), true);
  assert.deepEqual(types(g.up(P(4, 50, 50, 2.28))), ['tap'], 'let go at 280 ms: a tap');

  g.down(P(5, 50, 50, 3), true);
  assert.deepEqual(types(g.up(P(5, 50, 50, 3.4))), ['grab', 'release'], 'no tick came: still a grab, never a tap');

  g.down(P(6, 50, 50, 4), true);
  assert.deepEqual(types(g.move(P(6, 52, 50, 4.3))), ['grab', 'drag'], 'a small move after 280 ms grabs');
});

test('a floor press that moves or lingers is not a floor tap', () => {
  const g = createGesture();
  g.down(P(1, 10, 10, 0), false);
  assert.deepEqual(g.move(P(1, 15, 10, 0.02)), []);
  const d = g.move(P(1, 40, 10, 0.05));
  assert.deepEqual(types(d), ['drag']);
  assert.equal(d[0].on, 'floor');
  assert.deepEqual(g.tick(1), [], 'the floor is never grabbed');
  const u = g.up(P(1, 40, 10, 0.1));
  assert.ok(!types(u).includes('tap'));

  g.down(P(2, 10, 10, 1), false);
  assert.deepEqual(g.up(P(2, 10, 10, 1 + GESTURE.floorHoldMs / 1000 + 0.05)), []);
});

test('a cancel or a lost capture drops him and never taps', () => {
  const g = createGesture();
  g.down(P(1, 0, 0, 0), true);
  g.move(P(1, 30, 0, 0.05));
  const c = g.cancel(1, 0.1);
  assert.deepEqual(types(c), ['cancel']);
  assert.equal(c[0].on, 'newt');
  assert.equal(c[0].t, 0.1);
  assert.deepEqual(g.up(P(1, 30, 0, 0.12)), [], 'the up after a cancel is nothing');

  g.down(P(2, 0, 0, 1), true);
  assert.deepEqual(types(g.cancel(2, 1.05)), ['cancel'], 'cancelled before it was a grab: still no tap');
  assert.deepEqual(g.up(P(2, 0, 0, 1.1)), []);

  g.down(P(3, 0, 0, 2), true);
  assert.deepEqual(g.cancel(9, 2.05), [], "another pointer's cancel is nothing");
  assert.deepEqual(types(g.up(P(3, 0, 0, 2.1))), ['tap']);
});

test('only the first pointer counts', () => {
  const g = createGesture();
  g.down(P(1, 0, 0, 0), true);
  assert.deepEqual(g.down(P(2, 200, 200, 0.05), false), []);
  assert.deepEqual(g.move(P(2, 260, 260, 0.08)), []);
  assert.deepEqual(g.up(P(2, 260, 260, 0.1)), []);
  assert.deepEqual(g.cancel(2, 0.11), []);
  assert.deepEqual(types(g.up(P(1, 0, 0, 0.15))), ['tap']);
  assert.equal(g.current(), null);

  g.down(P(2, 0, 0, 1), false);
  assert.equal(g.current().id, 2, 'once the first lets go, the next press is the first');
  assert.deepEqual(types(g.up(P(2, 0, 0, 1.1))), ['tap']);
});

test('mouse moves without a button hover; touches never do', () => {
  const g = createGesture();
  const h = g.move({ id: 1, x: 5, y: 6, t: 0, kind: 'mouse', buttons: 0 });
  assert.deepEqual(types(h), ['hover']);
  assert.equal(h[0].x, 5);
  assert.equal(h[0].y, 6);
  assert.equal(types(g.move({ id: 1, x: 5, y: 6, t: 0, kind: 'mouse', buttons: 0 }, true))[0], 'hover');
  assert.equal(g.move({ id: 1, x: 5, y: 6, t: 0, kind: 'mouse', buttons: 0 }, true)[0].on, 'newt');
  assert.deepEqual(g.move({ id: 2, x: 5, y: 6, t: 0, kind: 'touch', buttons: 0 }), []);
  g.down({ id: 1, x: 0, y: 0, t: 1, kind: 'mouse', buttons: 1 }, false);
  assert.ok(!types(g.move({ id: 1, x: 2, y: 0, t: 1.01, kind: 'mouse', buttons: 1 })).includes('hover'));
});

test('rayPlaneY finds where a ray meets a level plane, or null when it never does', () => {
  const p = rayPlaneY({ x: 0, y: 2, z: 5 }, { x: 0, y: -1, z: -1 }, 0);
  close(p.x, 0);
  close(p.z, 3);
  const q = rayPlaneY({ x: 1, y: 3, z: 0 }, { x: 0.5, y: -0.5, z: 0.25 }, 1);
  close(q.x, 3);
  close(q.z, 1);
  assert.equal(rayPlaneY({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 0), null, 'parallel');
  assert.equal(rayPlaneY({ x: 0, y: 2, z: 0 }, { x: 0, y: 1, z: 0 }, 0), null, 'pointing away');
});

test('pickScreen hits the head circle and the body capsule, with slop, at least 22 px across', () => {
  const head = { x: 100, y: 50, r: 20 };
  const body = { a: { x: 100, y: 75 }, b: { x: 100, y: 130 }, r: 15 };
  assert.ok(pickScreen({ x: 115, y: 50 }, head, body, 0), 'in the head');
  assert.ok(pickScreen({ x: 112, y: 100 }, head, body, 0), 'in the body');
  assert.ok(!pickScreen({ x: 130, y: 100 }, head, body, 0), 'beside him');
  assert.ok(pickScreen({ x: 130, y: 100 }, head, body, 16), 'beside him, inside the slop');
  assert.ok(pickScreen({ x: 100, y: 144 }, head, body, 0), "the capsule's round end");
  assert.ok(!pickScreen({ x: 100, y: 146 }, head, body, 0));

  assert.equal(PICK_MIN_R, 11);
  const tiny = { head: { x: 0, y: 0, r: 3 }, body: { a: { x: 0, y: 4 }, b: { x: 0, y: 8 }, r: 2 } };
  assert.ok(pickScreen({ x: 10.5, y: 0 }, tiny.head, tiny.body, 0), 'a tiny NEWT still has a 22 px target');
  assert.ok(pickScreen({ x: 0, y: 18.5 }, tiny.head, tiny.body, 0));
  assert.ok(!pickScreen({ x: 11.5, y: -1 }, tiny.head, tiny.body, 0));
});
