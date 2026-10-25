// The envelope's shape and tones (src/invitation/envelopeLook.js envelopeLayout, LEAN, bandOf):
// seen from the back it's a plain rectangle with a straight flap V from its top corners to a tip
// under the seal's middle, over one pocket whose mouth (a shallow V) is tucked under the flap.
// Drawn the way the scene draws it (each part over the last in IDS order, an ink line on a texel
// that borders a part in front of it, and round the silhouette), closed its only lines are the
// outline and the flap's V: no fold lines (2026-10-25: the user circled the bottom fold's two
// edges to go; 2026-10-24: a seam ran from the seal to the right edge). Open, the pocket's mouth
// shows. Every paper face is one flat tone of the three, the same one all through the sway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  IDS,
  LEAN,
  LIGHT,
  PITCH,
  REST,
  SHADES,
  TILT,
  bandOf,
  envelopeLayout,
  paperLit,
} from '../src/invitation/envelopeLook.js';
import { SWAY, TURN, turnRoll } from '../src/invitation/envelope.js';

const L = envelopeLayout();
const ORDER = /** @type {(keyof typeof L.parts)[]} */ (['body', 'inside', 'pocket', 'flap']);

/**
 * Whether (x, y) is inside the polygon `pts` (even-odd).
 * @param {number[][]} pts
 * @param {number} x
 * @param {number} y
 */
function inside(pts, x, y) {
  let k = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
  }
  return k;
}

/** Distance from (x, y) to the segment a–b. */
function toSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/**
 * The closed envelope drawn as the scene draws it, `n` texels a letter's width: each texel's
 * part (the front-most), then the ink: a texel that borders (4 ways) a part later in IDS order,
 * or an empty one beside (8 ways) any part.
 * @param {number} n
 * @param {(keyof typeof L.parts)[]} [order]  the parts drawn (open: no flap)
 */
function draw(n, order = ORDER) {
  const s = L.W / n;
  const cols = Math.ceil((L.W + 0.2) / s);
  const rows = Math.ceil((L.H + 0.2) / s);
  const x0 = -cols * s * 0.5;
  const y0 = -rows * s * 0.5;
  const id = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * s;
      const y = y0 + (j + 0.5) * s;
      for (const part of order) if (inside(L.parts[part], x, y)) id[j * cols + i] = IDS[part];
    }
  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : id[j * cols + i]);
  /** @type {number[][]} */
  const ink = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const me = at(i, j);
      let near = Math.max(at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1));
      if (me === 0) near = Math.max(near, at(i + 1, j + 1), at(i - 1, j + 1), at(i + 1, j - 1), at(i - 1, j - 1));
      if (near > me) ink.push([x0 + (i + 0.5) * s, y0 + (j + 0.5) * s]);
    }
  return { ink, s };
}

test('it’s a rectangle a little wider than tall, with the flap’s tip under the seal’s middle', () => {
  const [x0, y0, x1, y1] = [-L.W / 2, -L.H / 2, L.W / 2, L.H / 2];
  assert.deepEqual(L.parts.body, [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
  assert.ok(L.W / L.H > 1.3 && L.W / L.H < 1.6, `aspect ${L.W / L.H}`);
  assert.deepEqual(L.parts.flap, [[x0, y1], L.tip, [x1, y1]], 'a straight V from the top corners');
  assert.equal(L.tip[0], 0);
  assert.ok(L.tip[1] < 0 && L.tip[1] > -L.H * 0.2, `the tip ${L.tip[1]} a little under the middle`);
  assert.deepEqual([L.seal.x, L.seal.y], L.tip, 'the seal’s middle on the flap’s tip');
  assert.ok(L.seal.r > L.W * 0.18 && L.seal.r <= L.W * 0.21, `the seal ${L.seal.r} across its radius`);
});

/**
 * Every ink texel of `ink` (outside the seal) lies on one of the `allowed` segments, and every
 * segment is inked all along.
 * @param {number} n
 * @param {number[][]} ink
 * @param {number} s
 * @param {[number[], number[]][]} allowed
 */
function onlyLines(n, ink, s, allowed) {
  // (The seal covers the middle; its own outline is the seal's.)
  const free = ink.filter(([x, y]) => Math.hypot(x - L.seal.x, y - L.seal.y) > L.seal.r * 1.05);
  for (const [x, y] of free) {
    const d = Math.min(...allowed.map(([a, b]) => toSegment(x, y, a, b)));
    assert.ok(d <= s * 1.5, `${n}: a line at (${x.toFixed(3)}, ${y.toFixed(3)}), ${(d / s).toFixed(1)} texels off`);
  }
  for (const [a, b] of allowed)
    for (let t = 0.03; t < 0.97; t += 0.02) {
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      if (Math.hypot(x - L.seal.x, y - L.seal.y) < L.seal.r * 1.1) continue;
      assert.ok(
        free.some(([px, py]) => Math.hypot(px - x, py - y) <= s * 1.5),
        `${n}: the line from (${a}) to (${b}) is missing at ${t.toFixed(2)}`,
      );
    }
}

test('closed, its only lines are the outline and the flap’s V: no fold lines', () => {
  const h = L.H / 2;
  const w = L.W / 2;
  /** @type {[number[], number[]][]} */
  const allowed = [
    [
      [-w, -h],
      [w, -h],
    ],
    [
      [w, -h],
      [w, h],
    ],
    [
      [w, h],
      [-w, h],
    ],
    [
      [-w, h],
      [-w, -h],
    ],
    [[-w, h], L.tip],
    [[w, h], L.tip],
  ];
  for (const n of [260, 300, 360]) {
    const { ink, s } = draw(n);
    onlyLines(n, ink, s, allowed);
  }
});

test('open, the pocket’s mouth shows: a shallow V from its top corners, over the inside', () => {
  const h = L.H / 2;
  const w = L.W / 2;
  const { pocket } = L.parts;
  assert.equal(pocket.length, 5, 'one pocket: its mouth and its three sides');
  const [mouth] = pocket;
  assert.deepEqual(pocket.slice(1), [
    [-w, h],
    [-w, -h],
    [w, -h],
    [w, h],
  ]);
  assert.equal(mouth[0], 0);
  assert.ok(mouth[1] > L.tip[1] + L.H * 0.2 && mouth[1] < h - L.H * 0.1, `its mouth’s foot ${mouth[1]}`);
  /** @type {[number[], number[]][]} */
  const allowed = [
    [
      [-w, -h],
      [w, -h],
    ],
    [
      [w, -h],
      [w, h],
    ],
    [
      [w, h],
      [-w, h],
    ],
    [
      [-w, h],
      [-w, -h],
    ],
    [[-w, h], mouth],
    [[w, h], mouth],
  ];
  // (No seal on an open letter: it bloomed away. Its middle's left out all the same.)
  for (const n of [260, 300]) {
    const { ink, s } = draw(n, ['body', 'inside', 'pocket']);
    onlyLines(n, ink, s, allowed);
  }
});

test('the pocket’s mouth and the inside lie under the closed flap', () => {
  const { pocket, inside: inner, flap } = L.parts;
  const [mouth, a, , , b] = pocket;
  const half = (/** @type {number[]} */ p, /** @type {number[]} */ q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  for (const [x, y] of [mouth, half(mouth, a), half(mouth, b)])
    assert.ok(inside(flap, x, y), `the mouth at (${x}, ${y}) shows`);
  for (const [x, y] of inner) if (Math.abs(x) < L.W / 2 - 1e-9) assert.ok(inside(flap, x, y), 'the inside shows');
});

test('every paper face is one flat tone, the same through the whole sway and the letter’s turn: the flap light, the pocket mid, the inside shade', () => {
  const want = { body: 1, inside: 2, pocket: 1, flap: 0 };
  const light = new THREE.Vector3(...LIGHT);
  assert.ok(Math.abs(light.length() - 1) < 1e-9);
  // (The rest pose: the letter's lean and tip, as the scene sets them.)
  const rest = new THREE.Matrix3().setFromMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(PITCH, 0, TILT)),
  );
  assert.deepEqual(REST.elements, rest.elements);
  const most = SWAY + TURN.max;
  for (const part of ORDER)
    for (let yaw = -most; yaw <= most + 1e-9; yaw += most / 8) {
      // (The face as drawn, turned by the sway and the turn; its normal taken back into the
      // letter's own frame (the shader's derivatives there) and lit as the rest pose has it.)
      // (The turn's roll with it, at its most: the letter's own tones never see either.)
      const pose = new THREE.Matrix4()
        .makeRotationZ(turnRoll(Math.max(-TURN.max, Math.min(TURN.max, yaw))))
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(PITCH, 0, TILT)));
      const drawn = new THREE.Vector3(0, 0, 1).transformDirection(pose);
      const own = drawn.clone().transformDirection(pose.clone().invert());
      const v = paperLit(own) + LEAN[part];
      // (At rest, the same as lighting it as drawn.)
      if (Math.abs(yaw) < 1e-9) assert.ok(Math.abs(v - drawn.dot(light) - LEAN[part]) < 1e-9);
      assert.equal(bandOf(v), want[part], `${part} at a yaw of ${yaw.toFixed(2)}: ${v.toFixed(3)}`);
      // (Well inside its band, so it never flickers to the next.)
      for (const edge of [SHADES.light, SHADES.mid]) assert.ok(Math.abs(v - edge) > 0.05, `${part}: ${v} by ${edge}`);
    }
});

test('the bands: light over SHADES.light, mid over SHADES.mid, shade under', () => {
  assert.equal(bandOf(SHADES.light + 0.01), 0);
  assert.equal(bandOf(SHADES.light - 0.01), 1);
  assert.equal(bandOf(SHADES.mid + 0.01), 1);
  assert.equal(bandOf(SHADES.mid - 0.01), 2);
});
