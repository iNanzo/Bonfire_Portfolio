// The rose petals (src/invitation/petals.js, pure): three shapes (rounded, cupped, curled) in a
// few sizes and three reds, each petal its own tumble and flutter, stepped as a simulation (its
// position and velocity, drag toward the air, a smooth noise, a gentle wind, a pull toward its
// slot in a formation), seeded and fixed-step so every visit is the same; the flows (a flurry as
// the letter appears, a slow helix swirl round the floating letter flung out as it opens, a pour
// up out of its inside, the seal's bloom, a burst ring at a click, a cursor trail with variety,
// petals off the letter's trailing edge as it moves, a spill on a skip); never more than POOL at
// once, and none at all with reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOOM_SIZE,
  FLOWS,
  LETTER_DEPTHS,
  LETTER_MOUTH,
  PETAL_LEN,
  PETAL_SHAPES,
  PETAL_SIZES,
  POOL,
  STEP,
  SWIRL,
  TRAIL,
  WAKE,
  createPetalFlow,
  createTrail,
  petalAt,
  petalGrid,
  swirlRadius,
  swirlSlot,
  valueNoise,
} from '../src/invitation/petals.js';
import { DEPTH, envelopeLayout } from '../src/invitation/envelopeLook.js';
import { FLAP_OPEN, TIMES, createEnvelope } from '../src/invitation/envelope.js';

const ORIGIN = { x: 0, y: 0, z: 0 };
/** The letter standing square to the camera at `c` (petals.js LetterFrame). */
const frameAt = (c = ORIGIN, o = {}) => ({
  c: { ...c },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fwd: { x: 0, y: 0, z: 1 },
  h: 0.66,
  opening: 0,
  floating: true,
  ...o,
});
/** Step `f` on by `secs` at `dt` a frame, calling `each(f)` before every frame. */
function run(f, secs, dt = 1 / 60, each = null) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) {
    each?.(f, i);
    f.step(dt);
  }
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const speed = (p) => Math.hypot(p.vx, p.vy, p.vz);

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

test('seeded and fixed-step: the same seed and frames give the same petals, whatever the frame rate', () => {
  const play = (seed, dt) => {
    const f = createPetalFlow({ seed });
    f.emit('spawn', ORIGIN);
    run(f, 2, dt, (g) => g.letter(frameAt()));
    f.emit('ring', { x: 0.3, y: 0.1, z: 0.1 });
    f.emit('trail', { x: -0.2, y: 0, z: 0.1 }, { v: { x: 1.5, y: -0.4, z: 0 }, n: 3 });
    run(f, 1, dt, (g) => g.letter(frameAt()));
    return f.petals.map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz].map((v) => v.toFixed(9)).join());
  };
  assert.deepEqual(play(5, 1 / 60), play(5, 1 / 60), 'the same every visit');
  assert.deepEqual(play(5, 1 / 30), play(5, 1 / 60), 'stepped at STEP, so 30 or 60 frames a second agree');
  assert.notDeepEqual(play(6, 1 / 60), play(5, 1 / 60), 'another seed, other petals');
  assert.ok(STEP > 0 && STEP <= 1 / 50, 'a small fixed step');
});

test('the petals vary: every shape, a few sizes, the three reds, and each its own tumble and flutter', () => {
  const f = createPetalFlow({ seed: 2 });
  f.emit('spawn', ORIGIN);
  f.emit('ring', ORIGIN);
  f.emit('trail', ORIGIN, { v: { x: 1, y: 0, z: 0 }, n: 3 });
  const ps = f.petals;
  assert.ok(ps.length >= 20);
  for (const s of PETAL_SHAPES)
    assert.ok(
      ps.some((p) => p.shape === s),
      `some ${s}`,
    );
  assert.ok(new Set(ps.map((p) => p.size)).size >= 3, 'three sizes or more');
  assert.deepEqual([...new Set(ps.map((p) => p.shade))].sort(), [-1, 0, 1], 'light, mid and dark reds');
  for (const p of ps) {
    assert.ok(Math.abs(Math.hypot(...p.axis) - 1) < 1e-9, 'a unit spin axis');
    assert.ok(Math.abs(p.rate) >= 1 && Math.abs(p.rate) <= 7, `a tumble, not a blur: ${p.rate}`);
    assert.ok(p.sway > 0 && p.freq > 0, 'a flutter');
  }
  const distinct = (key) => new Set(ps.map((p) => p[key].toFixed(4))).size;
  assert.ok(distinct('rate') === ps.length && distinct('freq') === ps.length && distinct('seed') === ps.length);
  assert.ok(ps.some((p) => p.rate > 0) && ps.some((p) => p.rate < 0), 'both ways round');
});

test('the noise is smooth and bounded; drag eases any launch into the air, which stays gentle', () => {
  for (let x = -20; x < 20; x += 0.013) {
    const n = valueNoise(x);
    assert.ok(n >= -1 && n <= 1, `bounded: ${n}`);
    assert.ok(Math.abs(valueNoise(x + 0.01) - n) < 0.05, 'smooth');
  }
  const values = Array.from({ length: 200 }, (_, i) => valueNoise(i * 0.37));
  assert.ok(Math.max(...values) > 0.3 && Math.min(...values) < -0.3, 'it wanders both ways');
  const f = createPetalFlow({ seed: 3 });
  f.emit('trail', ORIGIN, { v: { x: 12, y: 8, z: 0 }, n: 3 });
  f.emit('ring', ORIGIN);
  const start = Math.max(...f.petals.map(speed));
  run(f, 0.6);
  for (const p of f.petals) assert.ok(speed(p) < start * 0.5, `the launch eases off: ${speed(p)}`);
  // Long after, whatever it was launched at, only the air is left: a light wind, a slow fall and the noise.
  const calm = createPetalFlow({ seed: 4 });
  calm.emit('trail', ORIGIN, { v: { x: 20, y: 0, z: 0 }, n: 3 });
  let most = 0;
  run(calm, 0.8);
  for (let i = 0; i < 60; i++) {
    calm.step(1 / 60);
    for (const p of calm.petals) most = Math.max(most, speed(p));
  }
  assert.ok(most < 0.6, `gentle once it has settled: ${most}`);
  // The noise moves petals launched alike apart.
  const two = createPetalFlow({ seed: 5 });
  two.emit('trail', ORIGIN, { v: { x: 0, y: 0, z: 0 }, n: 2 });
  const [a, b] = two.petals;
  a.vx = b.vx = a.vy = b.vy = a.vz = b.vz = 0;
  run(two, 1);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.01, 'its own noise');
});

test('a petal’s pose: there only through its life, growing in and shrinking out, a unit quaternion, tumbling and fluttering', () => {
  const f = createPetalFlow({ seed: 3 });
  f.emit('spawn', ORIGIN);
  const p = f.petals[0];
  assert.equal(petalAt(p, p.born - 0.01).visible, false, 'not before it’s born');
  assert.equal(petalAt(p, p.born + p.life).visible, false, 'gone after its life');
  const mid = petalAt(p, p.born + p.life * 0.4);
  assert.equal(mid.visible, true);
  assert.ok(Math.abs(Math.hypot(...mid.q) - 1) < 1e-9);
  assert.ok(petalAt(p, p.born + 0.01).scale < mid.scale, 'it grows in');
  assert.ok(petalAt(p, p.born + p.life * 0.97).scale < mid.scale * 0.5, 'and shrinks out');
  const q0 = petalAt(p, p.born + 0.3).q;
  const q1 = petalAt(p, p.born + 0.6).q;
  assert.ok(Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]) < 0.9999, 'it turns');
  // Its flutter: a sway across on top of where it is.
  const off = [];
  for (let a = 0.5; a < p.life * 0.7; a += 0.05) off.push(petalAt(p, p.born + a).x - p.x);
  assert.ok(Math.max(...off) > 0.005 && Math.min(...off) < -0.005, 'both ways');
});

test('the flurry as the letter appears: soft, from round the letter, staggered, falling gently past it', () => {
  const f = createPetalFlow({ seed: 1 });
  assert.equal(f.emit('spawn', ORIGIN), FLOWS.spawn.n);
  assert.ok(FLOWS.spawn.n >= 8 && FLOWS.spawn.n <= 18, 'a flurry, not a storm');
  const born = f.petals.map((p) => p.born);
  assert.ok(Math.max(...born) - Math.min(...born) >= 0.3, 'staggered, not all at once');
  for (const p of f.petals) assert.ok(Math.abs(p.start.x) <= 0.65 && Math.abs(p.start.y) <= 0.6, 'round the letter');
  run(f, 2.2);
  assert.equal(f.petals.length, FLOWS.spawn.n, 'all still up');
  for (const p of f.petals) {
    assert.ok(p.y < p.start.y, 'it falls in the end');
    assert.ok(Math.hypot(p.x - p.start.x, p.y - p.start.y) / 2 < 0.45, 'gently');
  }
});

test('the swirl: three helix strands on an ellipse round the letter, the back half behind it, slow', () => {
  assert.ok(SWIRL.strands >= 2 && SWIRL.strands <= 3);
  assert.ok(Math.abs(SWIRL.rx - 0.7) <= 0.1 && Math.abs(SWIRL.rz - 0.3) <= 0.1, 'about 0.7 × 0.3 letter widths');
  assert.ok(SWIRL.spin[0] >= 0.5 && SWIRL.spin[1] <= 0.8, 'spinning 0.5–0.8 rad a second');
  assert.ok(SWIRL.climb[0] >= 0.04 && SWIRL.climb[1] <= 0.08, 'climbing 0.04–0.08 a second');
  const L = frameAt();
  // A slot is on its ellipse, its radius swelling in the middle of the climb and drawn in at the ends.
  for (let s = 0; s <= 1; s += 0.1)
    for (let strand = 0; strand < 3; strand++) {
      const slot = { strand, s, r: 1 };
      const at = swirlSlot(L, slot, 0.4);
      const e = Math.hypot(at.x / SWIRL.rx, at.z / SWIRL.rz);
      assert.ok(Math.abs(e - swirlRadius(s)) < 1e-9, `on its ellipse: ${e}`);
      assert.ok(Math.abs(at.y - (s - 0.5) * SWIRL.span * L.h + at.z * SWIRL.tilt) < 1e-9, 'up the letter as it climbs');
    }
  assert.ok(swirlRadius(0.5) > swirlRadius(0.05) && swirlRadius(0.5) > swirlRadius(0.95));
  // Seen from a little above: its back half higher than its front, so it reads as a loop.
  const back = swirlSlot(L, { strand: 0, s: 0.5, r: 1 }, -Math.PI / 2 - 0.5 * SWIRL.turns * 2 * Math.PI);
  const front = swirlSlot(L, { strand: 0, s: 0.5, r: 1 }, Math.PI / 2 - 0.5 * SWIRL.turns * 2 * Math.PI);
  assert.ok(back.z < 0 && front.z > 0 && back.y - front.y > 0.15, `a loop: ${back.y - front.y}`);
  assert.ok(SWIRL.tilt > 0.2 && SWIRL.tilt < 0.8);
  // The strands a third of a turn apart.
  const a0 = swirlSlot(L, { strand: 0, s: 0.5, r: 1 }, 0);
  const a1 = swirlSlot(L, { strand: 1, s: 0.5, r: 1 }, 0);
  const turn = Math.atan2(a1.z / SWIRL.rz, a1.x / SWIRL.rx) - Math.atan2(a0.z / SWIRL.rz, a0.x / SWIRL.rx);
  assert.ok(Math.abs(Math.cos(turn) - Math.cos((2 * Math.PI) / 3)) < 1e-6, 'a third of a turn apart');

  const f = createPetalFlow({ seed: 7 });
  run(f, 6, 1 / 60, (g) => g.letter(L));
  const swirl = f.petals.filter((p) => p.slot);
  assert.equal(swirl.length, FLOWS.swirl.n, 'it fills in');
  assert.equal(new Set(swirl.map((p) => p.slot.strand)).size, SWIRL.strands, 'on every strand');
  assert.ok(swirl.some((p) => p.z < -0.05) && swirl.some((p) => p.z > 0.05), 'round the back and the front');
  for (const p of swirl) {
    if (p.slot.infall) continue;
    const want = swirlSlot(L, p.slot, f.swirlSpin);
    assert.ok(Math.hypot(p.x - want.x, p.y - want.y, p.z - want.z) < 0.08, 'close to its slot');
    assert.ok(speed(p) < 1.6, `slow: ${speed(p)}`);
  }
  // Every fourth spirals in from further out.
  assert.equal(swirl.filter((p) => p.slot.outer).length, Math.ceil(FLOWS.swirl.n / 4));
  const fresh = createPetalFlow({ seed: 7 });
  run(fresh, 2, 1 / 60, (g) => g.letter(L));
  assert.ok(
    fresh.petals.some((p) => p.slot?.infall && p.slot.r > 1.2),
    'one further out',
  );
  // It follows the letter.
  const moved = frameAt({ x: 1, y: 0.5, z: 0 });
  run(f, 2, 1 / 60, (g) => g.letter(moved));
  for (const p of swirl.filter((q) => q.slot && !q.slot.infall)) {
    const want = swirlSlot(moved, p.slot, f.swirlSpin);
    assert.ok(Math.hypot(p.x - want.x, p.y - want.y, p.z - want.z) < 0.1, 'with the letter');
  }
});

test('as it opens the swirl is flung outward and goes', () => {
  const f = createPetalFlow({ seed: 8 });
  const L = frameAt();
  run(f, 5, 1 / 60, (g) => g.letter(L));
  const swirl = f.petals.filter((p) => p.slot);
  const out = swirl.map((p) => Math.hypot(p.x, p.z));
  f.letter({ ...L, floating: false, opening: 0.05 });
  assert.ok(
    swirl.every((p) => !p.slot),
    'let go',
  );
  run(f, 0.5, 1 / 60, (g) => g.letter({ ...L, floating: false, opening: 0.3 }));
  const further = swirl.filter((p, i) => Math.hypot(p.x, p.z) > out[i] + 0.1).length;
  assert.ok(further >= swirl.length * 0.8, `outward: ${further} of ${swirl.length}`);
  run(f, 2.5, 1 / 60, (g) => g.letter(null));
  assert.ok(!f.petals.some((p) => p.kind === 'swirl'), 'gone');
});

/** How far up the letter `L` its pocket's mouth is at `across` (its V: lowest in the middle). */
const mouthAt = (L, across) => L.h / 2 - LETTER_MOUTH * L.h * (1 - Math.min(1, Math.abs(across) / 0.5));

test('the pour: once the flap is half open, a good stream of petals rises out of the mouth, fast, up and forward', () => {
  // The letter on its side: its up is the screen’s left, its forward the camera.
  const L = frameAt(
    { x: 0.2, y: 0.1, z: 0 },
    { right: { x: 0, y: 1, z: 0 }, up: { x: -1, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: 1 }, floating: false },
  );
  assert.ok(FLOWS.pour.n >= 28, `enough to read as a pour: ${FLOWS.pour.n}`);
  assert.ok(FLOWS.pour.from >= 0.4 && FLOWS.pour.from <= 0.6, 'from about half open');
  const f = createPetalFlow({ seed: 9 });
  /** @type {number|null} when it passed FLOWS.pour.from */
  let halfAt = null;
  run(f, 1.4, 1 / 60, (g, i) => {
    const opening = Math.min(1, i / 60);
    if (opening < FLOWS.pour.from) assert.equal(g.emitted.pour, 0, `none till it's half open: ${opening}`);
    else halfAt ??= g.time;
    g.letter({ ...L, opening });
  });
  const pour = f.petals.filter((p) => p.kind === 'pour');
  assert.equal(pour.length, FLOWS.pour.n, `the whole pour: ${pour.length}`);
  assert.ok(f.emitted.pour === pour.length);
  const born = pour.map((p) => p.born);
  assert.ok(Math.min(...born) >= /** @type {number} */ (halfAt) - 1e-9);
  const spread = Math.max(...born) - Math.min(...born);
  assert.ok(spread > 0.3 && spread <= FLOWS.pour.over + 0.05, `a stream over the opening, not all at once: ${spread}`);
  for (const p of pour) {
    const local = sub(p.start, L.c);
    const across = dot(local, L.right);
    const up = dot(local, L.up);
    assert.ok(Math.abs(across) <= 0.45, 'across its mouth');
    // (Just inside the mouth: the pocket hides only its first moment.)
    const mouth = mouthAt(L, across);
    assert.ok(up < mouth && up > mouth - 0.06, `just under the mouth: ${(mouth - up).toFixed(3)} under it`);
    assert.ok(Math.abs(dot(local, L.fwd)) < 0.03, 'at the pocket’s depth');
    assert.ok(dot(p.launch, L.up) >= 1.2 && dot(p.launch, L.fwd) > 0.05, 'up, fast, and forward out of it');
    assert.ok(p.size >= 1, `big enough to read: ${p.size}`);
  }
  // None more once it’s open, none while it floats.
  const n = f.emitted.pour;
  run(f, 1, 1 / 60, (g) => g.letter({ ...L, opening: 1 }));
  assert.equal(f.emitted.pour, n);
  const idle = createPetalFlow({ seed: 9 });
  run(idle, 2, 1 / 60, (g) => g.letter(frameAt()));
  assert.equal(idle.emitted.pour, 0);
});

test('poured, the petals stand well clear above the mouth: risen 0.3 of the letter over it within half a second, out past its top', () => {
  for (const seed of [9, 10, 11]) {
    const L = frameAt(ORIGIN, { floating: false });
    const f = createPetalFlow({ seed });
    /** @type {Map<object, number>} */
    const risen = new Map();
    run(f, 2, 1 / 60, (g, i) => {
      g.letter({ ...L, opening: Math.min(1, i / 30) });
      for (const p of g.petals) {
        if (p.kind !== 'pour' || p.born > g.time) continue;
        const a = g.time - p.born;
        if (a >= 0.5 - 1e-9 && !risen.has(p)) {
          const local = sub(p, L.c);
          risen.set(p, dot(local, L.up) - mouthAt(L, dot(local, L.right)));
        }
      }
    });
    assert.ok(risen.size >= FLOWS.pour.n * 0.9, `${risen.size}`);
    for (const h of risen.values()) assert.ok(h > 0.3, `above the mouth by ${h.toFixed(3)}`);
  }
});

test('the pour starts between the inside and the pocket, which hides it till it rises out of the mouth', () => {
  // (The envelope's depths, letter widths in front of its middle: envelopeLook.js DEPTH.)
  const { T, W } = envelopeLayout();
  const depths = { inside: (T / 2 + DEPTH.inside) / W, pocket: (T / 2 + DEPTH.pocket) / W };
  for (const k of /** @type {const} */ (['inside', 'pocket']))
    assert.ok(Math.abs(LETTER_DEPTHS[k] - depths[k]) < 1e-9, `petals.js LETTER_DEPTHS.${k} is the envelope's`);
  // (The mouth's V, its foot a share of the letter's height under its top: the envelope's.)
  const { H, parts } = envelopeLayout();
  assert.ok(
    Math.abs(LETTER_MOUTH - (H / 2 - parts.pocket[0][1]) / H) < 1e-9,
    'petals.js LETTER_MOUTH is the envelope’s',
  );
  for (const seed of [9, 10, 11]) {
    const L = frameAt(ORIGIN, { floating: false, ...depths });
    const f = createPetalFlow({ seed });
    /** @type {Map<object, number>} each pour petal's height up the letter at its birth */
    const bornAt = new Map();
    run(f, 1.4, 1 / 60, (g, i) => {
      g.letter({ ...L, opening: Math.min(1, i / 60) });
      for (const p of g.petals) {
        if (p.kind !== 'pour' || p.born > g.time) continue;
        if (!bornAt.has(p)) {
          const d = dot(sub(p.start, L.c), L.fwd);
          assert.ok(d > depths.inside && d < depths.pocket, `born between them: ${d.toFixed(4)}`);
          bornAt.set(p, dot(sub(p.start, L.c), L.up));
        }
        // (Below its mouth it's behind the pocket: risen less than the mouth is above any birth.)
        const local = sub(p, L.c);
        if (dot(local, L.up) - bornAt.get(p) < 0.06)
          assert.ok(dot(local, L.fwd) < depths.pocket, `behind the pocket: ${dot(local, L.fwd).toFixed(4)}`);
      }
    });
    assert.ok(bornAt.size >= 10, `a pour: ${bornAt.size}`);
  }
});

test('the seal blooms: a ring of petals tight round it that unfurl outward and lift away', () => {
  const f = createPetalFlow({ seed: 9 });
  const seal = { x: 0.05, y: -0.1, z: 0.1 };
  assert.equal(f.emit('bloom', seal, { radius: 0.09 }), FLOWS.bloom.n);
  assert.ok(FLOWS.bloom.n >= 5 && FLOWS.bloom.n <= 12);
  const first = f.petals.map((p) => ({ x: p.x, y: p.y, unfurl: petalAt(p, 0.001).unfurl }));
  for (const [i, p] of f.petals.entries()) {
    assert.ok(Math.hypot(first[i].x - seal.x, first[i].y - seal.y) <= 0.09, 'inside the seal as it starts');
    assert.ok(p.size >= BLOOM_SIZE[0] && p.size <= BLOOM_SIZE[1], 'big enough that a few make up the seal');
    assert.ok(Math.abs(first[i].unfurl) > Math.abs(petalAt(p, 0.4).unfurl), 'it unfurls');
  }
  run(f, 0.45);
  const angles = f.petals.map((p, i) => {
    assert.ok(Math.hypot(p.x - seal.x, p.y - seal.y) > Math.hypot(first[i].x - seal.x, first[i].y - seal.y), 'out');
    return Math.atan2(p.y - seal.y, p.x - seal.x);
  });
  run(f, 0.45);
  for (const p of f.petals) assert.ok(p.y > seal.y - 0.05, 'lifting, not dropping, as it goes');
  const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI) / (Math.PI / 2)) % 4)));
  assert.equal(quadrants.size, 4, 'all round it');
});

test('the bloom drifts up and aside off the seal and fades soon, so by the time the flap is half open the mouth is clear for the pour', () => {
  // (The letter square on, its seal on the flap's tip, as the envelope has it.)
  const { H, W, tip } = envelopeLayout();
  const h = H / W;
  const seal = { x: 0, y: tip[1] / W, z: 0.03 };
  // (When the flap passes half open, by the envelope's own timeline.)
  const env = createEnvelope();
  env.open(0);
  let half = 0;
  while (env.pose(half).flap < FLAP_OPEN / 2) half += 1 / 240;
  assert.ok(half > TIMES.flapAt && half < TIMES.opening);
  for (const seed of [9, 10, 11, 12]) {
    const f = createPetalFlow({ seed });
    f.emit('bloom', seal, { radius: 0.09 });
    let inMouth = 0;
    let most = 0;
    run(f, 1.6, 1 / 60, (g) => {
      if (g.time < half) return;
      let n = 0;
      for (const { petal, pose } of g.at()) {
        if (petal.kind !== 'bloom' || !pose.visible) continue;
        most = Math.max(most, g.time - petal.born);
        // (Over the mouth's middle, from the seal up to the letter's top, at more than half its size.)
        const big = pose.scale > PETAL_LEN * petal.size * 0.5;
        if (big && Math.abs(pose.x) < 0.2 && pose.y > seal.y && pose.y < h / 2 + 0.1) n++;
      }
      inMouth = Math.max(inMouth, n);
    });
    assert.ok(inMouth <= 1, `seed ${seed}: ${inMouth} bloom petals over the mouth from half open on`);
    assert.ok(most <= 1.5, `gone soon: ${most.toFixed(2)} s`);
  }
});

test('a click’s burst ring: 10–14 petals at even angles with a little jitter, out with drag, gone in about a second', () => {
  const at = { x: -0.4, y: 0.3, z: 0.1 };
  for (const seed of [1, 2, 3, 4, 5]) {
    const f = createPetalFlow({ seed });
    const n = f.emit('ring', at);
    assert.ok(n >= FLOWS.ring.n[0] && n <= FLOWS.ring.n[1] && FLOWS.ring.n[0] >= 10 && FLOWS.ring.n[1] <= 14);
    const ring = f.petals;
    const angles = ring.map((p) => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (i ? a - angles[i - 1] : a + 2 * Math.PI - angles.at(-1)));
    const even = (2 * Math.PI) / n;
    for (const g of gaps) assert.ok(g > even * 0.45 && g < even * 1.55, `even, with jitter: ${g / even}`);
    assert.ok(new Set(gaps.map((g) => g.toFixed(3))).size > 1, 'jittered');
    for (const p of ring) {
      assert.ok(p.life >= 0.8 && p.life <= 1.25, `about a second: ${p.life}`);
      assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < 0.03, 'from the pointer');
    }
    const v0 = ring.map(speed);
    run(f, 0.3);
    ring.forEach((p, i) => {
      assert.ok(Math.hypot(p.x - at.x, p.y - at.y) > 0.08, 'out');
      assert.ok(speed(p) < v0[i] * 0.6, 'slowing');
    });
    run(f, 1);
    assert.equal(f.live(), 0, 'gone');
  }
});

test('the cursor trail: a petal every 14–30 px, 1–3 a step, at most about 20 a second', () => {
  assert.ok(TRAIL.gap[0] === 14 && TRAIL.gap[1] === 30 && TRAIL.perStep[0] === 1 && TRAIL.perStep[1] === 3);
  const sweep = (pxPerS, secs = 1, seed = 1) => {
    const tr = createTrail({ seed });
    const out = [];
    let t = 0;
    out.push(...tr.down(t, 0, 0, false));
    for (; t < secs; t += 1 / 120) out.push(...tr.move(t, pxPerS * t, 0));
    return out;
  };
  const slow = sweep(240);
  const pts = slow.map((e) => e.x);
  const steps = pts.slice(1).map((x, i) => x - pts[i]);
  for (const s of steps) assert.ok(s >= 14 - 1e-6 && s <= 30 + 1e-6, `spaced 14–30 px: ${s}`);
  assert.ok(new Set(steps.map((s) => s.toFixed(1))).size > 3, 'jittered');
  for (const e of slow) assert.ok(e.n >= 1 && e.n <= 3);
  assert.ok(new Set(slow.map((e) => e.n)).size >= 2, 'some steps more than one');
  const count = (es) => es.reduce((n, e) => n + e.n, 0);
  assert.ok(count(slow) >= 10, `${count(slow)} at 240 px a second`);
  // However fast it moves, about 20 a second at most.
  for (const v of [1500, 4000, 9000]) {
    const fast = sweep(v, 2);
    assert.ok(count(fast) <= TRAIL.rate * 2 + TRAIL.burst, `${count(fast)} in 2 s at ${v} px/s`);
    assert.ok(count(fast) >= TRAIL.rate * 2 * 0.7, 'still a stream');
  }
  assert.ok(TRAIL.rate >= 15 && TRAIL.rate <= 25);
  // Its velocity goes with each, as the pointer moved.
  for (const e of sweep(600)) assert.ok(Math.abs(e.vx - 600) < 120 && Math.abs(e.vy) < 60, `${e.vx} ${e.vy}`);
  // A short wiggle: nothing.
  const tr = createTrail({ seed: 2 });
  tr.down(0, 0, 0, false);
  assert.equal(tr.move(0.05, 8, 0).length + tr.move(0.1, 5, 0).length, 0);
});

test('a jump (the mouse gone a while and back somewhere else) sheds nothing along it; lifted off the page, nothing on its return', () => {
  const tr = createTrail({ seed: 4 });
  tr.move(0, 10, 10);
  tr.move(0.01, 14, 10);
  // (A second later, far across the page: nothing where it never went.)
  assert.equal(tr.move(1, 700, 400).length, 0, 'nothing across a gap of a second');
  // From there it trails as usual, only where it goes.
  const on = [];
  for (let i = 1; i <= 30; i++) on.push(...tr.move(1 + i / 120, 700 + i * 8, 400));
  assert.ok(on.length > 0, 'it trails again');
  assert.ok(
    on.every((e) => e.x >= 700 - 1e-6 && e.y === 400),
    'only along where it went',
  );
  // Lifted (it left the page), even a quick return elsewhere sheds nothing on the jump.
  const tr2 = createTrail({ seed: 5 });
  tr2.move(0, 10, 10);
  tr2.move(0.01, 20, 10);
  tr2.lift();
  assert.equal(tr2.move(0.05, 600, 300).length, 0, 'nothing across the jump');
  const back = [];
  for (let i = 1; i <= 30; i++) back.push(...tr2.move(0.05 + i / 120, 600 - i * 8, 300));
  assert.ok(back.length > 0 && back.every((e) => e.x <= 600 + 1e-6 && e.y === 300), 'then it trails from there');
});

test('a held finger (or button) keeps a few coming where it is; let go, none', () => {
  const tr = createTrail({ seed: 3 });
  tr.down(0, 50, 60, true);
  const held = [];
  for (let t = 0; t < 2; t += 1 / 60) held.push(...tr.hold(t));
  const n = held.reduce((k, e) => k + e.n, 0);
  assert.ok(n >= TRAIL.hold * 2 * 0.6 && n <= TRAIL.hold * 2 + 2, `${n} in 2 s held`);
  assert.ok(held.every((e) => e.x === 50 && e.y === 60 && e.vx === 0 && e.vy === 0));
  tr.up(2);
  const after = [];
  for (let t = 2; t < 3; t += 1 / 60) after.push(...tr.hold(t));
  assert.equal(after.length, 0);
  // A mouse that only hovers (no button down) never holds.
  const hover = createTrail({ seed: 3 });
  hover.move(0, 10, 10);
  for (let t = 0; t < 1; t += 1 / 60) assert.equal(hover.hold(t).length, 0);
});

test('a trail petal: launched at 0.2–0.4 × the pointer’s velocity with a sideways spread, every shape and size, 0.9–2.2 s', () => {
  const f = createPetalFlow({ seed: 11 });
  const v = { x: 2, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) f.emit('trail', { x: 0, y: 0, z: 0.1 }, { v, n: 3 });
  const ps = f.petals;
  assert.equal(ps.length, 60);
  for (const p of ps) {
    assert.ok(p.vx >= 2 * TRAIL.vel[0] - 0.12 && p.vx <= 2 * TRAIL.vel[1] + 0.12, `along: ${p.vx}`);
    assert.ok(p.life >= TRAIL.life[0] && p.life <= TRAIL.life[1]);
  }
  assert.ok(ps.some((p) => p.vy > 0.05) && ps.some((p) => p.vy < -0.05), 'spread both ways across');
  for (const s of PETAL_SHAPES) assert.ok(ps.some((p) => p.shape === s));
  assert.ok(new Set(ps.map((p) => p.size)).size === PETAL_SIZES.length, 'every size');
  // Still (a hold): a soft puff any way.
  const still = createPetalFlow({ seed: 12 });
  still.emit('trail', ORIGIN, { v: { x: 0, y: 0, z: 0 }, n: 3 });
  for (const p of still.petals) assert.ok(speed(p) > 0.05 && speed(p) < 0.4);
});

test('the letter moving sheds petals off its trailing edge, drifting its way; still or bobbing, none', () => {
  const f = createPetalFlow({ seed: 13 });
  let x = 0;
  run(f, 1, 1 / 60, (g) => {
    x += 0.4 / 60;
    g.letter(frameAt({ x, y: 0, z: 0 }));
  });
  const wake = f.petals.filter((p) => p.kind === 'wake');
  assert.ok(wake.length >= 4 && wake.length <= WAKE.rate + 2, `a few: ${wake.length}`);
  for (const p of wake) {
    const at = 0.4 * p.born; // (where the letter was then, near enough)
    assert.ok(p.start.x < at - 0.3, 'off its trailing (left) edge');
    assert.ok(p.launch.x > 0.05, 'drifting its way');
  }
  // Faster, more.
  const fast = createPetalFlow({ seed: 13 });
  x = 0;
  run(fast, 1, 1 / 60, (g) => {
    x += 3 / 60;
    g.letter(frameAt({ x, y: 0, z: 0 }));
  });
  assert.ok(fast.emitted.wake > f.emitted.wake, 'tied to its speed');
  // A turn sheds from the edge that swings back.
  const turn = createPetalFlow({ seed: 14 });
  let a = 0;
  run(turn, 1, 1 / 60, (g) => {
    a += 1.2 / 60;
    g.letter(
      frameAt(ORIGIN, {
        right: { x: Math.cos(a), y: 0, z: -Math.sin(a) },
        fwd: { x: Math.sin(a), y: 0, z: Math.cos(a) },
      }),
    );
  });
  assert.ok(turn.emitted.wake > 0, 'a turn too');
  // On a fast screen (several frames a step), the same.
  const quick = createPetalFlow({ seed: 13 });
  x = 0;
  run(quick, 1, 1 / 144, (g) => {
    x += 0.4 / 144;
    g.letter(frameAt({ x, y: 0, z: 0 }));
  });
  assert.ok(
    Math.abs(quick.emitted.wake - f.emitted.wake) <= 2,
    `${quick.emitted.wake} at 144 Hz, ${f.emitted.wake} at 60`,
  );
  // A finger dragging it a little (a quarter of its width a second, for half a second): a few.
  const nudge = createPetalFlow({ seed: 16 });
  x = 0;
  run(nudge, 0.5, 1 / 60, (g) => {
    x += 0.25 / 60;
    g.letter(frameAt({ x, y: 0, z: 0 }));
  });
  assert.ok(nudge.emitted.wake >= 2, `a nudge: ${nudge.emitted.wake}`);
  // Bobbing as it floats, none.
  const bob = createPetalFlow({ seed: 15 });
  run(bob, 4, 1 / 60, (g, i) => g.letter(frameAt({ x: 0, y: 0.02 * Math.sin(i / 30), z: 0 })));
  assert.equal(bob.emitted.wake, 0);
});

test('a spill on a skip goes down quickly; cut, every petal up shrinks away and the ones after fly on', () => {
  const f = createPetalFlow({ seed: 10 });
  f.emit('spill', ORIGIN);
  const y0 = f.petals.map((p) => p.y);
  run(f, 0.4);
  f.petals.forEach((p, i) => assert.ok(p.y < y0[i] - 0.1, 'down, quickly'));
  assert.ok(f.petals.every((p) => p.life <= 1.2));
  const g = createPetalFlow({ seed: 13 });
  g.emit('spawn', ORIGIN);
  run(g, 0.8, 1 / 60, (h) => h.letter(frameAt()));
  g.cut(0.35);
  g.letter(null);
  g.emit('spill', ORIGIN);
  const spill = g.petals.filter((p) => p.kind === 'spill');
  const before = g.petals.filter((p) => p.kind !== 'spill');
  assert.ok(before.length > 0);
  const scale0 = before.map((p) => petalAt(p, g.time).scale);
  run(g, 0.15);
  // (Grown in by then: one born a moment before the cut may still be growing.)
  before.forEach(
    (p, i) => scale0[i] && g.time - p.born > 0.35 && assert.ok(petalAt(p, g.time).scale < scale0[i], 'shrinking'),
  );
  run(g, 0.25);
  assert.ok(
    g.petals.every((p) => p.kind === 'spill'),
    'the cut ones gone within 0.35 s',
  );
  assert.ok(
    spill.every((p) => petalAt(p, g.time).visible),
    'the spill flies on',
  );
});

test('never more than POOL at once (the oldest go first, the swirl kept)', () => {
  assert.ok(POOL >= 100 && POOL <= 140, `about 120: ${POOL}`);
  const f = createPetalFlow({ seed: 12 });
  run(f, 4, 1 / 60, (g) => g.letter(frameAt()));
  const swirl = f.petals.filter((p) => p.slot).length;
  for (let i = 0; i < 30; i++) {
    f.emit('ring', ORIGIN);
    f.emit('trail', ORIGIN, { v: { x: 1, y: 0, z: 0 }, n: 3 });
  }
  assert.ok(f.petals.length <= POOL, `${f.petals.length} of ${POOL}`);
  assert.equal(f.petals.filter((p) => p.slot).length, swirl, 'the swirl stays whole');
  const kinds = f.petals.filter((p) => !p.slot).map((p) => p.born);
  assert.ok(kinds.length > 0);
});

test('with reduced motion, no petals at all', () => {
  const f = createPetalFlow({ seed: 1, reduced: true });
  for (const kind of /** @type {const} */ (['spawn', 'bloom', 'ring', 'spill'])) assert.equal(f.emit(kind, ORIGIN), 0);
  assert.equal(f.emit('trail', ORIGIN, { v: { x: 1, y: 0, z: 0 }, n: 3 }), 0);
  let x = 0;
  run(f, 3, 1 / 60, (g, i) => {
    x += 2 / 60;
    g.letter(frameAt({ x, y: 0, z: 0 }, { opening: Math.min(1, i / 60), floating: i < 60 }));
  });
  assert.equal(f.petals.length, 0);
  assert.equal(f.live(), 0);
  assert.ok(Object.values(f.emitted).every((n) => n === 0));
});
