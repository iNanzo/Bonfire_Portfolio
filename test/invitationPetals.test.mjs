// The rose petals round the envelope (src/invitation/petals.js, pure): several shapes (rounded,
// cupped, curled) in a few sizes and three reds, each petal with its own tumble, flutter and
// drift, seeded so every visit is the same; the flows that launch them (a soft flurry as the
// letter appears, a gentle stir under a hover or a touch, the seal blooming into a ring of petals
// that unfurl and lift, a burst out of the opened letter, a spill down on a skip, and a slow
// trickle at most while it floats), never more than a few dozen at once, and none at all with
// reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOOM_SIZE,
  FLOWS,
  PETAL_SHAPES,
  PETAL_SIZES,
  POOL,
  TRICKLE_EVERY,
  createPetalFlow,
  petalAt,
  petalGrid,
} from '../src/invitation/petals.js';

const ORIGIN = { x: 0, y: 0, z: 0 };
/** Every petal a flow launched, with its pose `dt` after it was born. */
const posesAt = (flow, dt) => flow.petals.map((p) => ({ p, at: petalAt(p, p.born + dt) }));

test('three petal shapes, each a curved grid of triangles (rounded, cupped, curled), no two alike', () => {
  assert.deepEqual(PETAL_SHAPES, ['round', 'cupped', 'curled']);
  const grids = PETAL_SHAPES.map((s) => petalGrid(s));
  for (const [i, g] of grids.entries()) {
    assert.equal(g.positions.length % 3, 0);
    assert.equal(g.index.length % 3, 0);
    assert.ok(g.index.length / 3 >= 30, `${PETAL_SHAPES[i]}: enough facets for its bands`);
    assert.ok(Math.max(...g.index) < g.positions.length / 3);
    const ys = g.positions.filter((_, k) => k % 3 === 1);
    const xs = g.positions.filter((_, k) => k % 3 === 0);
    const zs = g.positions.filter((_, k) => k % 3 === 2);
    assert.ok(Math.min(...ys) >= -0.5 - 1e-9 && Math.max(...ys) <= 0.5 + 1e-9, 'a unit long, centred');
    assert.ok(Math.max(...xs) < 0.5 && Math.min(...xs) > -0.5, 'narrower than it is long');
    assert.ok(Math.max(...zs) - Math.min(...zs) > 0.04, 'curved, not flat');
  }
  const width = (g) => Math.max(...g.positions.filter((_, k) => k % 3 === 0));
  const depth = (g) => {
    const zs = g.positions.filter((_, k) => k % 3 === 2);
    return Math.max(...zs) - Math.min(...zs);
  };
  const [round, cupped, curled] = grids;
  assert.ok(width(round) > width(cupped) && width(round) > width(curled), 'the rounded one is the widest');
  assert.ok(depth(cupped) > depth(round), 'the cupped one is deeper across');
  const tipZ = (g) => {
    let best = -1;
    let z = 0;
    for (let k = 0; k < g.positions.length; k += 3) {
      if (g.positions[k + 1] > best) {
        best = g.positions[k + 1];
        z = g.positions[k + 2];
      }
    }
    return z;
  };
  assert.ok(tipZ(curled) < -0.1, 'the curled one’s tip rolls back');
});

test('the same seed launches the same petals on the same path every visit', () => {
  const run = () => {
    const f = createPetalFlow({ seed: 5 });
    f.emit('spawn', 0, ORIGIN);
    f.emit('burst', 1, { x: 0, y: 0.2, z: 0 });
    return [0.1, 0.6, 1.4].map((t) => f.at(t + 1).map(({ pose }) => pose));
  };
  assert.deepEqual(run(), run());
  const other = createPetalFlow({ seed: 6 });
  other.emit('spawn', 0, ORIGIN);
  const a = createPetalFlow({ seed: 5 });
  a.emit('spawn', 0, ORIGIN);
  assert.notDeepEqual(
    a.petals.map((p) => p.rate),
    other.petals.map((p) => p.rate),
    'another seed, other petals',
  );
});

test('the petals vary: every shape, a few sizes, the three reds, and each its own tumble, flutter and drift', () => {
  const f = createPetalFlow({ seed: 2 });
  f.emit('spawn', 0, ORIGIN);
  f.emit('burst', 0, ORIGIN);
  const ps = f.petals;
  assert.ok(ps.length >= 20);
  for (const s of PETAL_SHAPES)
    assert.ok(
      ps.some((p) => p.shape === s),
      `some ${s}`,
    );
  assert.ok(new Set(ps.map((p) => p.size)).size >= 3, 'three sizes or more');
  assert.ok(ps.every((p) => PETAL_SIZES.includes(p.size)));
  assert.deepEqual([...new Set(ps.map((p) => p.shade))].sort(), [-1, 0, 1], 'light, mid and dark reds');
  for (const p of ps) {
    assert.ok(Math.abs(Math.hypot(...p.axis) - 1) < 1e-9, 'a unit spin axis');
    assert.ok(Math.abs(p.rate) >= 1 && Math.abs(p.rate) <= 7, `a tumble, not a blur: ${p.rate}`);
    assert.ok(p.sway > 0 && p.freq > 0, 'a flutter');
  }
  const distinct = (key) => new Set(ps.map((p) => p[key].toFixed(4))).size;
  assert.ok(distinct('rate') === ps.length && distinct('freq') === ps.length && distinct('drift') === ps.length);
  assert.ok(new Set(ps.map((p) => p.axis.map((v) => v.toFixed(3)).join())).size === ps.length, 'own axes');
  assert.ok(ps.some((p) => p.rate > 0) && ps.some((p) => p.rate < 0), 'both ways round');
});

test('a petal’s pose: there only through its life, growing in and shrinking out, its rotation a unit quaternion', () => {
  const f = createPetalFlow({ seed: 3 });
  f.emit('spawn', 0, ORIGIN);
  for (const p of f.petals) {
    assert.equal(petalAt(p, p.born - 0.01).visible, false, 'not before it’s born');
    assert.equal(petalAt(p, p.born + p.life).visible, false, 'gone after its life');
    const mid = petalAt(p, p.born + p.life * 0.4);
    assert.equal(mid.visible, true);
    assert.ok(Math.abs(Math.hypot(...mid.q) - 1) < 1e-9);
    assert.ok(petalAt(p, p.born + 0.01).scale < mid.scale, 'it grows in');
    assert.ok(petalAt(p, p.born + p.life * 0.97).scale < mid.scale * 0.5, 'and shrinks out');
    // It tumbles: its rotation keeps turning.
    const q0 = petalAt(p, p.born + 0.3).q;
    const q1 = petalAt(p, p.born + 0.6).q;
    assert.ok(Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]) < 0.9999, 'it turns');
  }
});

test('it flutters: a side-to-side sway on top of its drift', () => {
  const f = createPetalFlow({ seed: 4 });
  f.emit('trickle', 0, ORIGIN);
  const p = f.petals[0];
  // The sway, less the steady drift: it goes both ways.
  const off = [];
  for (let a = 0.5; a < p.life * 0.7; a += 0.05) {
    const at = petalAt(p, p.born + a);
    const steady = petalAt({ ...p, sway: 0 }, p.born + a);
    off.push(at.x - steady.x);
  }
  assert.ok(
    Math.max(...off) > 0.005 && Math.min(...off) < -0.005,
    `both ways: ${Math.min(...off)} ${Math.max(...off)}`,
  );
});

test('the flurry as the letter appears: soft, from round the letter, staggered, falling gently past it', () => {
  const f = createPetalFlow({ seed: 1 });
  assert.equal(f.emit('spawn', 0, ORIGIN), FLOWS.spawn.n);
  assert.ok(FLOWS.spawn.n >= 8 && FLOWS.spawn.n <= 18, 'a flurry, not a storm');
  const born = f.petals.map((p) => p.born);
  assert.ok(Math.max(...born) - Math.min(...born) >= 0.3, 'staggered, not all at once');
  for (const { p, at } of posesAt(f, 0)) {
    assert.ok(Math.abs(at.x) <= 0.65 && Math.abs(at.y) <= 0.6, 'round the letter');
    const late = petalAt(p, p.born + p.life * 0.9);
    assert.ok(late.y < at.y, 'it falls in the end');
    const speed = Math.hypot(late.x - at.x, late.y - at.y) / (p.life * 0.9);
    assert.ok(speed < 0.45, `gently: ${speed}`);
  }
});

test('a stir under a hover or a touch: a few petals near the point, drifting out gently; held back if it comes too often', () => {
  const f = createPetalFlow({ seed: 8 });
  const at = { x: 0.2, y: -0.1, z: 0.1 };
  const n = f.stir(0, at);
  assert.equal(n, FLOWS.stir.n);
  assert.ok(n >= 1 && n <= 4, 'a few');
  assert.equal(f.stir(0.05, at), 0, 'not again at once');
  assert.ok(f.stir(FLOWS.stir.gap + 0.01, at) > 0, 'again after a moment');
  for (const p of f.petals) {
    const a = petalAt(p, p.born);
    assert.ok(Math.hypot(a.x - at.x, a.y - at.y) < 0.08, 'from the point');
    const b = petalAt(p, p.born + 1);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.35, 'gently');
  }
});

test('the seal blooms: a ring of petals tight round it that unfurl outward and lift away', () => {
  const f = createPetalFlow({ seed: 9 });
  const seal = { x: 0.05, y: -0.1, z: 0.1 };
  assert.equal(f.emit('bloom', 0, seal, { radius: 0.09 }), FLOWS.bloom.n);
  assert.ok(FLOWS.bloom.n >= 5 && FLOWS.bloom.n <= 12);
  const angles = [];
  for (const p of f.petals) {
    assert.equal(p.born, 0, 'all at once, as the seal goes');
    const a = petalAt(p, 0.001);
    assert.ok(Math.hypot(a.x - seal.x, a.y - seal.y) <= 0.09, 'inside the seal as it starts');
    const b = petalAt(p, 0.45);
    assert.ok(Math.hypot(b.x - seal.x, b.y - seal.y) > Math.hypot(a.x - seal.x, a.y - seal.y), 'outward');
    angles.push(Math.atan2(b.y - seal.y, b.x - seal.x));
    const late = petalAt(p, 0.9);
    assert.ok(late.y > seal.y - 0.05, 'lifting, not dropping, as it goes');
    assert.ok(p.unfurl > 0, 'it starts folded in (a bud)');
    assert.ok(p.size >= BLOOM_SIZE[0] && p.size <= BLOOM_SIZE[1], 'big enough that a few make up the seal');
    assert.ok(Math.abs(petalAt(p, 0.001).unfurl) > Math.abs(petalAt(p, 0.4).unfurl), 'and unfurls');
  }
  // All round the seal.
  const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI) / (Math.PI / 2)) % 4)));
  assert.equal(quadrants.size, 4, 'all round it');
});

test('a burst out of the opened letter goes up and out; a spill on a skip goes down', () => {
  const up = createPetalFlow({ seed: 10 });
  up.emit('burst', 0, ORIGIN);
  assert.ok(FLOWS.burst.n >= 8 && FLOWS.burst.n <= 16);
  for (const { p, at } of posesAt(up, 0)) {
    const b = petalAt(p, p.born + 0.4);
    assert.ok(b.y > at.y + 0.05, 'up');
    assert.ok(p.life <= 1.85, 'gone before the letter has dissolved');
  }
  const down = createPetalFlow({ seed: 10 });
  down.emit('spill', 0, ORIGIN);
  for (const { p, at } of posesAt(down, 0)) {
    const b = petalAt(p, p.born + 0.4);
    assert.ok(b.y < at.y - 0.1, 'down, quickly');
    assert.ok(p.life <= 1.2, 'gone soon after the letter drops away');
  }
});

test('idle it trickles a petal now and then at most, never cluttered; never more than a few dozen at once', () => {
  const f = createPetalFlow({ seed: 11 });
  f.emit('spawn', 0, ORIGIN);
  let most = 0;
  for (let t = 0; t < 40; t += 1 / 30) {
    f.step(t, { x: 0, y: -0.1, z: 0.1 });
    if (t > 4) most = Math.max(most, f.live(t));
  }
  assert.ok(TRICKLE_EVERY >= 1.5, 'slowly');
  assert.ok(most >= 1 && most <= 3, `a trickle: ${most}`);
  assert.ok(f.emitted.trickle >= 10 && f.emitted.trickle <= Math.ceil(40 / TRICKLE_EVERY) + 1);
  f.step(40, null);
  const n = f.emitted.trickle;
  for (let t = 40; t < 50; t += 0.1) f.step(t, null);
  assert.equal(f.emitted.trickle, n, 'no trickle without a place to trickle from');
  // Everything at once still stays a few dozen.
  const all = createPetalFlow({ seed: 12 });
  for (let i = 0; i < 6; i++) {
    all.emit('spawn', i * 0.1, ORIGIN);
    all.emit('burst', i * 0.1, ORIGIN);
    all.emit('bloom', i * 0.1, ORIGIN);
  }
  assert.ok(all.petals.length <= POOL && POOL <= 48, `${all.petals.length} of ${POOL}`);
});

test('cut (a skip): every petal up shrinks away quickly; the ones launched after fly on', () => {
  const f = createPetalFlow({ seed: 13 });
  f.emit('spawn', 0, ORIGIN);
  f.cut(0.8, 0.35);
  f.emit('spill', 0.8, ORIGIN);
  const spill = f.petals.filter((p) => p.kind === 'spill');
  const spawn = f.petals.filter((p) => p.kind === 'spawn');
  for (const p of spawn) {
    const before = petalAt(p, 0.79);
    if (before.visible) assert.ok(petalAt(p, 0.95).scale < before.scale, 'shrinking');
    assert.equal(petalAt(p, 0.8 + 0.35).visible, false, 'gone within 0.35 s');
  }
  assert.ok(
    spill.every((p) => petalAt(p, p.born + 0.5).visible),
    'the spill flies on',
  );
  f.step(1.2, null);
  assert.ok(
    f.petals.every((p) => p.kind === 'spill'),
    'the cut ones are dropped',
  );
});

test('with reduced motion, no petals at all', () => {
  const f = createPetalFlow({ seed: 1, reduced: true });
  assert.equal(f.emit('spawn', 0, ORIGIN), 0);
  assert.equal(f.emit('bloom', 0, ORIGIN), 0);
  assert.equal(f.stir(0, ORIGIN), 0);
  for (let t = 0; t < 10; t += 0.1) f.step(t, ORIGIN);
  assert.equal(f.petals.length, 0);
  assert.equal(f.live(5), 0);
  assert.deepEqual(Object.values(f.emitted), [0, 0, 0, 0, 0, 0]);
});
