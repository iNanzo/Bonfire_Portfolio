// The living blade's routines (src/bonfire/bladeMotion.js): smooth, on the beat, clear of
// the ground and the camera, and back in the fire at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoutine, MOVES } from '../src/bonfire/bladeMotion.js';

/** A small seeded generator, so a failure can be replayed. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A sword about 1.2 m long, planted point-down with the portfolio's lean, and a camera in front.
const LEN = 1.2;
const blade = { grip: new THREE.Vector3(0, 1.0 - 0.12 * LEN, 0), tip: new THREE.Vector3(0, -0.2, 0), len: LEN };
const home = {
  pos: new THREE.Vector3(0.04, 0, 0.03),
  quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.07, 0.16, -0.05)),
};
const center = new THREE.Vector3(0.04, 1.1, 0.03);
const camPos = new THREE.Vector3(0.3, 1.3, 3.2);
const camTarget = new THREE.Vector3(0, 0.9, 0);
function basis() {
  const toCam = camPos.clone().sub(camTarget).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(toCam).normalize();
  return { right, up: new THREE.Vector3().crossVectors(toCam, right), toCam, pos: camPos.clone() };
}

function plan(seed, { beat = 0.47, beats = 4, moves, alive = true, rests = [] } = {}) {
  const hits = [];
  for (let k = 1; k < beats; k++) if (!rests.includes(k)) hits.push(0.2 + k * beat);
  const onMove = [];
  const routine = createRoutine({
    blade,
    home,
    center,
    basis,
    hits,
    plunge: 0.2 + beats * beat,
    moves,
    alive,
    rng: seeded(seed),
    onMove: (k, kind) => onMove.push([k, kind]),
  });
  return { routine, hits, onMove };
}

function trace(routine, dt = 1 / 480) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const out = [];
  for (let t = 0; t <= routine.end + 1e-9; t += dt) {
    routine.pose(t, pos, quat);
    const tip = blade.tip.clone().applyQuaternion(quat).add(pos);
    const grip = blade.grip.clone().applyQuaternion(quat).add(pos);
    out.push({ t, tip, grip, quat: quat.clone() });
  }
  return out;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => 101 + i * 7);

test('every move kind shows up, and routines start and end planted', () => {
  const seen = new Set();
  for (const seed of SEEDS) {
    const { routine } = plan(seed, { beats: 8, rests: [2, 5] });
    routine.hits.forEach((h) => seen.add(h.kind));
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (const t of [0, routine.end]) {
      routine.pose(t, pos, quat);
      assert.ok(pos.distanceTo(home.pos) < 1e-6, `seed ${seed}: planted at ${t}`);
      assert.ok(quat.angleTo(home.quat) < 1e-5, `seed ${seed}: planted rotation at ${t}`);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(MOVES).sort());
});

/** Tip speed (m/s) and turn rate (rad/s) between samples, and how much each changes per sample. */
function rates(path) {
  const dt = path[1].t - path[0].t;
  const v = [0];
  const w = [0];
  for (let i = 1; i < path.length; i++) {
    v.push(path[i].tip.distanceTo(path[i - 1].tip) / dt);
    w.push(path[i].quat.angleTo(path[i - 1].quat) / dt);
  }
  return { v, w };
}

test('the motion is smooth: speeds change without jolts', () => {
  for (const seed of SEEDS) {
    const { routine } = plan(seed, { beats: 8, rests: seed % 3 ? [] : [3] });
    const path = trace(routine);
    const { v, w } = rates(path);
    for (let i = 2; i < path.length; i++) {
      // Per 1/480 s: a jump in position or rotation shows as a spike far past these.
      assert.ok(
        Math.abs(v[i] - v[i - 1]) < 6,
        `seed ${seed}: the tip jolted at ${path[i].t.toFixed(3)} s (${v[i - 1].toFixed(1)} → ${v[i].toFixed(1)} m/s)`,
      );
      assert.ok(
        Math.abs(w[i] - w[i - 1]) < 8,
        `seed ${seed}: the turn jolted at ${path[i].t.toFixed(3)} s (${w[i - 1].toFixed(1)} → ${w[i].toFixed(1)} rad/s)`,
      );
      assert.ok(
        v[i] < 45 && w[i] < 60,
        `seed ${seed}: too fast at ${path[i].t.toFixed(3)} s (${v[i].toFixed(1)} m/s, ${w[i].toFixed(1)} rad/s)`,
      );
    }
  }
});

test('slashes and spins are fastest right on their beat', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const { routine } = plan(seed, { beats: 8, rests: seed % 2 ? [2] : [4] });
    const dt = 1 / 960;
    const path = trace(routine, dt);
    const speed = (i) => path[i].tip.distanceTo(path[i - 1].tip) / dt;
    for (const hit of routine.hits) {
      if (hit.kind === 'thrust') continue;
      let best = 0;
      let bestT = 0;
      for (let i = 1; i < path.length; i++) {
        if (Math.abs(path[i].t - hit.t) > 0.12) continue;
        const v = speed(i);
        if (v > best) {
          best = v;
          bestT = path[i].t;
        }
      }
      assert.ok(
        Math.abs(bestT - hit.t) < 0.006,
        `seed ${seed}: ${hit.kind} peaked ${((bestT - hit.t) * 1000).toFixed(1)} ms off the beat`,
      );
      assert.ok(best > 4, `seed ${seed}: a ${hit.kind} should cut fast (${best.toFixed(1)} m/s)`);
      checked++;
    }
  }
  assert.ok(checked > 40);
});

test('thrusts drive hardest into the hit, then stop dead', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const { routine } = plan(seed, { beats: 8, moves: { thrust: true } });
    const dt = 1 / 960;
    const path = trace(routine, dt);
    for (const hit of routine.hits) {
      const at = (t) => path[Math.round(t / dt)];
      const v = (t) => at(t).grip.distanceTo(at(t - dt).grip) / dt;
      const into = v(hit.t);
      assert.ok(into > 3, `seed ${seed}: the thrust lands at ${into.toFixed(1)} m/s`);
      assert.ok(
        v(hit.t - 0.03) < into && v(hit.t + 0.05) < into * 0.35,
        `seed ${seed}: it should accelerate in and stop dead`,
      );
      checked++;
    }
  }
  assert.ok(checked > 40);
});

test('out of the fire, the blade stays above the ground and off the camera', () => {
  for (const seed of SEEDS) {
    const { routine, hits } = plan(seed, { beats: 8 });
    for (const p of trace(routine)) {
      if (p.t < hits[0] - 0.05 || p.t > hits.at(-1) + 0.2) continue; // (rising out of the ashes, plunging back in)
      assert.ok(
        p.tip.y > 0.15,
        `seed ${seed}: the tip went into the ground at ${p.t.toFixed(3)} s (${p.tip.y.toFixed(2)})`,
      );
      assert.ok(p.tip.distanceTo(camPos) > 0.6, `seed ${seed}: the tip nearly hit the camera`);
    }
  }
});

test('each move takes its plane once, in order, and rests leave room to hover', () => {
  const { routine, onMove, hits } = plan(7, { beats: 8, rests: [3, 4] });
  trace(routine);
  assert.deepEqual(
    onMove.map(([k]) => k),
    hits.map((_, k) => k),
  );
  assert.equal(routine.hits.length, 5);
});

test('the same seed plays the same routine; moves can be limited', () => {
  const a = trace(plan(42, { beats: 8 }).routine, 1 / 60);
  const b = trace(plan(42, { beats: 8 }).routine, 1 / 60);
  a.forEach((p, i) => assert.ok(p.tip.distanceTo(b[i].tip) < 1e-9));
  for (const seed of SEEDS.slice(0, 10)) {
    assert.ok(plan(seed, { beats: 8, moves: { slash: true } }).routine.hits.every((h) => h.kind === 'slash'));
  }
});

test('fast tempos still fit: moves squeeze into short beats', () => {
  for (const seed of SEEDS.slice(0, 15)) {
    const { routine } = plan(seed, { beat: 0.33, beats: 8 });
    const path = trace(routine);
    const { v } = rates(path);
    for (let i = 2; i < path.length; i++) {
      assert.ok(Math.abs(v[i] - v[i - 1]) < 10, `seed ${seed}: the tip jolted at ${path[i].t.toFixed(3)} s`);
    }
  }
});
