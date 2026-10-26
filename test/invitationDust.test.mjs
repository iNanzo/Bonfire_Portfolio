// The dust cloud when NEWT lands (src/invitation/dust.js, pure; stage.js draws it): a ring of
// small dithered puffs spreading out from his feet along the floor and rising a little, gone in
// about 0.5 to 0.8 s, sized and counted by the landing's speed (a set-down: a small puff or
// none; a big drop: a full ring), never more than DUST.max at once, never under the floor. And
// the landing's speed as play.js bodyStep reports it (carry.js fallStep's impact).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUST, createDust, dustBounds, dustLand, dustPuffs, dustShare, landingSpeed } from '../src/invitation/dust.js';
import { createRng } from '../src/invitation/rng.js';
import { CARRY, fallStep } from '../src/invitation/carry.js';
import { bodyStep, createBody } from '../src/invitation/play.js';

const FEET = { x: 1.5, z: -0.5 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** A landing at `speed` at t = 0, its puffs at `age` seconds. */
function cloud(speed, age = 0, seed = 7) {
  const d = createDust();
  dustLand(d, FEET, speed, 0, createRng(seed));
  return dustPuffs(d, age);
}
/** The farthest any puff gets from his feet over its life (sampled every 10 ms). */
function reach(speed, seed = 7) {
  const d = createDust();
  dustLand(d, FEET, speed, 0, createRng(seed));
  let most = 0;
  for (let t = 0; t <= 1; t += 0.01)
    for (const p of dustPuffs(d, t)) most = Math.max(most, Math.hypot(p.x - FEET.x, p.z - FEET.z) + p.r);
  return most;
}

test('the landing speed: how fast he comes down, and a share of how fast he slides; none going up', () => {
  assert.equal(landingSpeed({ x: 0, y: -4, z: 0 }), 4);
  assert.equal(landingSpeed(null), 0);
  assert.equal(landingSpeed({ x: 0, y: 0, z: 0 }), 0);
  assert.equal(landingSpeed({ x: 0, y: 2, z: 0 }), 0, 'never up');
  const slide = landingSpeed({ x: 3, y: -4, z: 0 });
  assert.ok(slide > 4 && slide < 4 + 3, `a slide adds a share: ${slide}`);
  assert.ok(near(landingSpeed({ x: 0, y: -4, z: 3 }), slide), 'either way across');
});

test('fallStep says how fast he hit the floor, and bodyStep keeps it with where and when he landed', () => {
  // (Dropped from his feet a unit up: the floor at about √(2 g h).)
  let root = { x: 0, y: 1, z: 0 };
  let vel = { x: 0, y: 0, z: 0 };
  let f = null;
  for (let i = 0; i < 400 && !f?.landed; i++) {
    f = fallStep(root, vel, root.y, 1 / 60, null);
    root = f.root;
    vel = f.vel;
  }
  assert.ok(f?.landed, 'landed');
  const expect = Math.sqrt(2 * CARRY.fallGravity * 1);
  assert.ok(Math.abs(-f.impact.y - expect) < 0.4, `impact ${f.impact.y} near ${-expect}`);
  assert.deepEqual(f.vel, { x: 0, y: 0, z: 0 }, 'and stopped');

  const s = createBody({ x: 2, z: 1 });
  s.mode = 'fall';
  s.grounded = false;
  s.root = { x: 2, y: 0.8, z: 1 };
  s.vel = { x: 1, y: -2, z: 0 };
  assert.equal(s.landing, null, 'none yet');
  let t = 0;
  for (let i = 0; i < 400 && s.mode === 'fall'; i++) {
    t += 1 / 60;
    bodyStep(s, {
      state: 'fall',
      move: { mode: 'stay', goal: null, speed: 0 },
      pointer: null,
      bounds: null,
      dt: 1 / 60,
      t,
    });
  }
  assert.equal(s.mode, 'ground');
  assert.ok(s.landing, 'a landing');
  assert.equal(s.landing.t, s.landedAt);
  assert.ok(near(s.landing.x, s.root.x) && near(s.landing.z, s.root.z), 'where his feet came down');
  assert.ok(s.landing.speed > 4, `his speed as he hit: ${s.landing.speed}`);
});

test('a gentle set-down raises nothing or a small puff; a big drop a full ring; the count grows with the speed', () => {
  assert.equal(cloud(0).length, 0);
  assert.equal(cloud(DUST.min * 0.9).length, 0, 'under DUST.min: none');
  const small = cloud(DUST.min + 0.3).length;
  assert.ok(small >= 1 && small <= 4, `a small puff: ${small}`);
  assert.equal(cloud(DUST.full).length, DUST.count[1], 'a full ring');
  assert.equal(cloud(DUST.full * 3).length, DUST.count[1], 'never more for faster');
  let was = 0;
  for (let v = DUST.min; v <= DUST.full; v += 0.25) {
    const n = cloud(v).length;
    assert.ok(n >= was, `${n} puffs at ${v} after ${was}`);
    was = n;
  }
  assert.ok(near(dustShare(DUST.min), 0) && near(dustShare(DUST.full), 1) && dustShare(99) === 1);
});

test('a big drop rings his feet: puffs all round, spreading out along the floor further than a small one', () => {
  const ring = cloud(DUST.full);
  const sides = new Set(
    ring.map((p) => Math.floor((Math.atan2(p.z - FEET.z, p.x - FEET.x) + Math.PI) / (Math.PI / 2)) % 4),
  );
  assert.equal(sides.size, 4, 'every quarter round his feet');
  for (const p of ring) assert.ok(Math.hypot(p.x - FEET.x, p.z - FEET.z) <= DUST.start + 1e-6, 'starting at his feet');
  const big = reach(DUST.full);
  const little = reach(DUST.min + 0.5);
  assert.ok(big > little * 1.4, `a big drop spreads further: ${big} vs ${little}`);
  assert.ok(big <= DUST.start + DUST.spread[1] * 1.25 + DUST.size[1] * 1.25 * 1.4 + 1e-6, `bounded: ${big}`);
  // (Bigger puffs for a bigger drop.)
  const r = (v) => Math.max(...cloud(v, 0.1).map((p) => p.r));
  assert.ok(r(DUST.full) > r(DUST.min + 0.5), 'bigger puffs');
});

test('the puffs spread out and rise a little, never under the floor, and fade out within about 0.8 s', () => {
  const d = createDust();
  dustLand(d, FEET, DUST.full, 2, createRng(3));
  const at = (t) => dustPuffs(d, t);
  const first = at(2.02);
  const later = at(2.3);
  assert.equal(first.length, later.length);
  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const b = later[i];
    assert.ok(Math.hypot(b.x - FEET.x, b.z - FEET.z) > Math.hypot(a.x - FEET.x, a.z - FEET.z), 'out');
    assert.ok(b.y > a.y, 'up');
  }
  // (Strong as it bursts out, faint at the end, gone after.)
  const strength = (t) => Math.max(0, ...at(t).map((p) => p.a));
  assert.ok(strength(2.06) > 0.6, `strong early: ${strength(2.06)}`);
  assert.ok(strength(2.06) > strength(2.3) && strength(2.3) > strength(2.55), 'fading');
  let top = 0;
  for (let t = 2; t <= 3; t += 0.01)
    for (const p of at(t)) {
      assert.ok(p.y >= p.r - 1e-6, 'its bottom never under the floor');
      assert.ok(p.a >= 0 && p.a <= 1, `strength in 0..1: ${p.a}`);
      assert.ok(p.r > 0);
      top = Math.max(top, p.y - p.r);
    }
  assert.ok(top > 0.03 && top <= DUST.rise[1] * 1.25 + 1e-6, `rising a little: ${top}`);
  assert.equal(at(2 + DUST.life[1] * 1.15 + 1e-6).length, 0, 'gone by the end of the longest life');
  assert.equal(d.puffs.length, 0, 'and dropped');
  // (A small drop's go sooner.)
  const s = createDust();
  dustLand(s, FEET, DUST.min + 0.3, 0, createRng(3));
  assert.equal(dustPuffs(s, DUST.life[0] * 1.15 + 1e-6).length, 0, 'a small puff is gone sooner');
});

test('bounded: landings in a row never keep more than DUST.max puffs, and nothing before a landing', () => {
  const d = createDust();
  assert.deepEqual(dustPuffs(d, 0), []);
  const rng = createRng(11);
  for (let i = 0; i < 20; i++) {
    dustLand(d, { x: i * 0.1, z: 0 }, DUST.full * 2, i * 0.05, rng);
    assert.ok(d.puffs.length <= DUST.max, `${d.puffs.length} kept`);
    assert.ok(dustPuffs(d, i * 0.05).length <= DUST.max);
  }
  // (The newest landing's ring is whole: the oldest puffs go first.)
  const newest = dustPuffs(d, 19 * 0.05).filter((p) => near(p.born, 19 * 0.05));
  assert.equal(newest.length, DUST.count[1]);
});

test('the same seed raises the same cloud; a bad speed or point raises none', () => {
  assert.deepEqual(cloud(6, 0.2, 5), cloud(6, 0.2, 5));
  assert.notDeepEqual(cloud(6, 0.2, 5), cloud(6, 0.2, 6));
  for (const bad of [Number.NaN, -3, Infinity * 0]) assert.equal(cloud(bad).length, 0, String(bad));
  const d = createDust();
  dustLand(d, { x: Number.NaN, z: 0 }, 8, 0, createRng(1));
  assert.equal(d.puffs.length, 0);
});

test('the box the puffs fill holds every puff whole, for the retro pass’s area; none for no puffs', () => {
  assert.equal(dustBounds([]), null);
  const puffs = cloud(DUST.full, 0.3);
  const b = dustBounds(puffs);
  assert.ok(b);
  for (const p of puffs) {
    assert.ok(p.x - p.r >= b.minX - 1e-6 && p.x + p.r <= b.maxX + 1e-6);
    assert.ok(p.z - p.r >= b.minZ - 1e-6 && p.z + p.r <= b.maxZ + 1e-6);
    assert.ok(p.y + p.r <= b.top + 1e-6);
  }
});

test('the stage draws every puff the dust keeps', async () => {
  const { DUST_PUFFS } = await import('../src/invitation/dustLayer.js');
  assert.ok(DUST.max <= DUST_PUFFS, `${DUST.max} kept, ${DUST_PUFFS} drawn`);
  assert.ok(DUST.count[1] <= DUST.max, 'a whole ring fits');
});
