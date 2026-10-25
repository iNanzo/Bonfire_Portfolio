// The envelope's shape and tones (src/invitation/envelopeLook.js envelopeLayout, LEAN, bandOf):
// seen from the back it's a plain rectangle with a straight flap V from its top corners to a tip
// under the seal's middle, the pocket's side folds tucked under the flap and the bottom fold, and
// the bottom fold's two edges running up from the bottom corners to the flap. Drawn the way the
// scene draws it (each part over the last in IDS order, an ink line on a texel that borders a part
// in front of it, and round the silhouette), its only lines are the outline, the flap's V and
// those two edges: no extra seam (2026-10-24: one ran right from the seal to the right edge).
// Every paper face is one flat tone of the three, the same one all through the sway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IDS, LEAN, LIGHT, PITCH, SHADES, bandOf, envelopeLayout } from '../src/invitation/envelopeLook.js';
import { SWAY } from '../src/invitation/envelope.js';

const L = envelopeLayout();
const ORDER = /** @type {(keyof typeof L.parts)[]} */ (['body', 'inside', 'left', 'right', 'bottom', 'flap']);

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

/** The flap's edge's height at `x`. */
const flapEdgeY = (x) => L.tip[1] + ((L.H / 2 - L.tip[1]) * Math.abs(x)) / (L.W / 2);

/**
 * The closed envelope drawn as the scene draws it, `n` texels a letter's width: each texel's
 * part (the front-most), then the ink: a texel that borders (4 ways) a part later in IDS order,
 * or an empty one beside (8 ways) any part.
 * @param {number} n
 */
function draw(n) {
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
      for (const part of ORDER) if (inside(L.parts[part], x, y)) id[j * cols + i] = IDS[part];
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

test('its only lines are the outline, the flap’s V and the bottom fold’s two edges: no extra seam', () => {
  const h = L.H / 2;
  const w = L.W / 2;
  const [sx, sy] = L.slant;
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
    [
      [-w, -h],
      [-sx, sy],
    ],
    [
      [w, -h],
      [sx, sy],
    ],
  ];
  assert.ok(Math.abs(sy - flapEdgeY(sx)) < 1e-9, 'the bottom fold’s edges end on the flap’s');
  for (const n of [260, 300, 360]) {
    const { ink, s } = draw(n);
    // (The seal covers the middle; its own outline is the seal's.)
    const free = ink.filter(([x, y]) => Math.hypot(x - L.seal.x, y - L.seal.y) > L.seal.r * 1.05);
    for (const [x, y] of free) {
      const d = Math.min(...allowed.map(([a, b]) => toSegment(x, y, a, b)));
      assert.ok(d <= s * 1.5, `${n}: a line at (${x.toFixed(3)}, ${y.toFixed(3)}), ${(d / s).toFixed(1)} texels off`);
    }
    // And every one of them is drawn, all along (outside the seal).
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
});

test('the pocket’s side folds lie under the flap and the bottom fold; the inside under them', () => {
  const { left, right, bottom, inside: inner, flap } = L.parts;
  for (const fold of [left, right]) {
    // (Their inner corner, and their edges' middles, all under the flap or the bottom fold.)
    const pts = fold.flatMap((p, i) => {
      const q = fold[(i + 1) % fold.length];
      return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]];
    });
    for (const [x, y] of pts) {
      if (Math.abs(x) >= L.W / 2 - 1e-9) continue;
      assert.ok(inside(flap, x, y) || inside(bottom, x, y), `(${x}, ${y}) shows`);
    }
  }
  for (const [x, y] of inner) if (Math.abs(x) < L.W / 2 - 1e-9) assert.ok(inside(flap, x, y), 'the inside shows');
  for (const [x, y] of bottom.slice(2)) assert.ok(inside(flap, x, y), `the bottom fold’s top (${x}, ${y}) shows`);
});

test('every paper face is one flat tone, the same through the whole sway: the flap light, the pocket mid, the inside shade', () => {
  const want = { body: 1, inside: 2, left: 1, right: 1, bottom: 1, flap: 0 };
  const light = new THREE.Vector3(...LIGHT);
  assert.ok(Math.abs(light.length() - 1) < 1e-9);
  for (const part of ORDER)
    for (let yaw = -SWAY; yaw <= SWAY + 1e-9; yaw += SWAY / 8) {
      const n = new THREE.Vector3(0, 0, 1)
        .applyEuler(new THREE.Euler(PITCH, 0, 0))
        .applyEuler(new THREE.Euler(0, yaw, 0));
      const v = n.dot(light) + LEAN[part];
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
