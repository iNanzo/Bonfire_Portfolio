// The clearing and a scene's camera (src/visualizer/clearing.js; camera.js pin()): the clamp
// is idempotent; every move's whole cycle stays in the clearing and comes back to the
// painted framing (a sweep painted at the clearing's edge swings the other way); and the
// camera, pinned, refuses the show's cuts while it holds, plays the move on the beat, freezes
// when paused, hands back to the show when it doesn't hold, and never leaves the clearing
// over 32 bars of any move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLEARING, MOVE_KINDS, MOVE_BARS, keepInClearing, movePose, fitMove, poseOnCycle } from '../src/visualizer/clearing.js';
import { createCamera, SHOTS } from '../src/visualizer/camera.js';

const inside = ([x, y, z]) => {
  const p = keepInClearing({ x, y, z });
  return Math.hypot(p.x - x, p.y - y, p.z - z) < 1e-6;
};
const seeded = (seed = 5) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const [FX, , FZ] = CLEARING.fire;
/** A framing at `bearing` (radians from straight in front), `r` out and `y` up, looking at the fire. */
const at = (bearing, r, y, move) => ({ pos: [FX + Math.sin(bearing) * r, y, FZ + Math.cos(bearing) * r], target: [0, 0.6, 0], fov: 36, roll: 0.05, move });

test('keepInClearing: idempotent, and anything it returns is inside', () => {
  const rnd = seeded();
  for (let i = 0; i < 2000; i++) {
    const p = keepInClearing({ x: (rnd() - 0.5) * 20, y: (rnd() - 0.3) * 12, z: (rnd() - 0.5) * 20 });
    const q = keepInClearing({ ...p });
    assert.ok(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-9);
    const r = Math.hypot(p.x - FX, p.z - FZ);
    assert.ok(r <= CLEARING.maxR + 1e-9 && p.y >= CLEARING.minY && p.y <= CLEARING.maxY);
    assert.ok(Math.abs(Math.atan2(p.x - FX, p.z - FZ)) <= CLEARING.bearing + 1e-9);
    if (p.y < CLEARING.lowY) assert.ok(r >= CLEARING.minR - 1e-9);
  }
});

test('every move over a whole cycle stays in the clearing and comes back to the framing', () => {
  const bases = [at(0, 4, 1.5), at(1.2, 5.8, 2.5), at(-1.7, 3, 1), at(1.74, 2, 0.6), at(0.3, 1.1, 0.4), at(-0.5, 6.4, 6)];
  const beat = 60 / 124;
  for (const base of bases) {
    for (const kind of MOVE_KINDS) {
      for (const amount of [0.3, 1]) {
        for (const bars of [2, 8]) {
          const pin = { ...base, move: { kind, amount, bars } };
          const cycle = bars * 4 * beat;
          const start = movePose(pin, 0, beat);
          const end = movePose(pin, cycle, beat);
          assert.ok(Math.hypot(...start.pos.map((v, i) => v - end.pos[i])) < 1e-6, `${kind}: back where it began`);
          assert.ok(inside(start.pos), `${kind}: the framing itself is kept inside`);
          for (let s = 0; s <= 200; s++) {
            const p = movePose(pin, (s / 200) * cycle * 1.5, beat);
            assert.ok(inside(p.pos), `${kind} ${amount} at ${base.pos.map((v) => v.toFixed(2))}: step ${s} outside (${p.pos.map((v) => v.toFixed(3))})`);
            assert.ok(p.fov >= 10 && p.fov <= 80, `${kind}: lens ${p.fov}`);
            assert.deepEqual(p.target, start.target);
          }
        }
      }
    }
  }
});

test('a sweep at the clearing’s edge swings the other way, and still sweeps', () => {
  for (const edge of [1.74, -1.74]) {
    const pin = at(edge, 4, 1.6, { kind: 'sweep', amount: 1, bars: 8 });
    assert.notEqual(fitMove(pin).side, 0, 'one side only');
    const bearings = Array.from({ length: 65 }, (_, i) => {
      const p = poseOnCycle(pin, i / 64);
      return Math.atan2(p.pos[0] - FX, p.pos[2] - FZ);
    });
    assert.ok(bearings.every((b) => Math.sign(edge) * b <= Math.abs(edge) + 1e-6), 'away from the edge');
    const arc = Math.max(...bearings) - Math.min(...bearings);
    assert.ok(arc > 1, `a real sweep (${arc.toFixed(2)} rad)`);
  }
  // In the middle: either side, the full swing.
  const mid = fitMove(at(0, 4, 1.6, { kind: 'sway', amount: 1, bars: 4 }));
  assert.equal(mid.side, 0);
  assert.ok(mid.reach > 0.3);
  // A move with nothing to it is still; an unknown kind or bar count falls back.
  assert.equal(fitMove(at(0, 4, 1.6, { kind: 'push', amount: 0, bars: 4 })).kind, 'still');
  assert.equal(fitMove(at(0, 4, 1.6, { kind: 'zoomies', amount: 1, bars: 3 })).kind, 'still');
  assert.equal(fitMove(at(0, 4, 1.6, { kind: 'push', amount: 1, bars: 3 })).bars, 8);
  assert.deepEqual(MOVE_BARS, [2, 4, 8, 16, 32]);
});

/** A stand-in scene for the camera: records every pose it's sent. */
function fakeFire() {
  const poses = [];
  return { poses, blade: null, setPose: (p) => poses.push({ pos: [...p.pos], target: [...p.target], fov: p.fov, roll: p.roll, sx: p.sx, sy: p.sy }) };
}
const settingsFor = (over = {}) => ({ camera: 'cuts', shot: 'clearing', transition: 'cut', cutBars: 2, ...over });
const tick = (camera, n = 1, period = 0.5) => { for (let i = 0; i < n; i++) camera.update(1 / 60, { period, punch: 0, holding: false, build: 0, breath: 0 }); };

test('camera: a held pin refuses the show’s cuts and setShot; a pin that doesn’t hold hands back at the next cut', () => {
  const fire = fakeFire();
  const shots = [];
  const camera = createCamera(fire, settingsFor(), { onShot: (n) => shots.push(n) });
  tick(camera);
  const pin = at(0.4, 3.5, 1.3, { kind: 'still', amount: 0, bars: 8 });
  camera.pin(pin);
  assert.equal(camera.held, true);
  tick(camera);
  assert.deepEqual(fire.poses.at(-1).pos.map((v) => +v.toFixed(4)), pin.pos.map((v) => +v.toFixed(4)), 'the painted framing');
  assert.equal(fire.poses.at(-1).fov, 36);
  assert.equal(camera.cut('hearth'), null, 'a cut is refused');
  assert.equal(camera.cut('follow'), null, 'a rig too');
  camera.setShot('above');
  tick(camera);
  assert.equal(camera.shot, 'scene');
  assert.equal(camera.rig, null);
  assert.deepEqual(shots, [], 'no shot events while it holds');
  // Not held: the next cut takes over.
  camera.pin(pin, { hold: false });
  assert.equal(camera.held, false);
  assert.equal(camera.cut('hearth'), 'hearth');
  assert.equal(camera.pinned, null);
  tick(camera);
  assert.equal(camera.shot, 'hearth');
  // Unpinned by the show: its shots again.
  camera.pin(pin);
  camera.pin(null);
  assert.equal(camera.cut('low'), 'low');
});

test('camera: the move plays on the beat and comes round; pause freezes it; frame() can land at once', () => {
  const fire = fakeFire();
  const camera = createCamera(fire, settingsFor({ camera: 'drift' }));
  const pin = at(0, 4, 1.6, { kind: 'sway', amount: 1, bars: 2 });
  camera.pin(pin);
  const period = 0.5; // (2 bars: 4 s)
  tick(camera, 1, period);
  const first = fire.poses.at(-1).pos;
  tick(camera, 60, period); // 1 s: a quarter of the way round
  const quarter = fire.poses.at(-1).pos;
  assert.ok(Math.hypot(...first.map((v, i) => v - quarter[i])) > 0.5, 'it swings');
  camera.pause(true);
  tick(camera, 30, period);
  assert.deepEqual(fire.poses.at(-1).pos, fire.poses.at(-2).pos, 'paused: frozen');
  camera.pause(false);
  tick(camera, 180, period); // the rest of the cycle (and the frame at pause)
  const round = fire.poses.at(-1).pos;
  assert.ok(Math.hypot(...first.map((v, i) => v - round[i])) < 0.05, 'round again to where it began');
  camera.frame(0.2, -0.1, { instant: true });
  tick(camera);
  assert.equal(fire.poses.at(-1).sx, 0.2);
  assert.equal(fire.poses.at(-1).sy, -0.1);
  // A still camera (the setting) or reduced motion: the painted framing, no move.
  const still = fakeFire();
  const cam2 = createCamera(still, settingsFor({ camera: 'still' }));
  cam2.pin(pin);
  tick(cam2, 120);
  assert.deepEqual(still.poses.at(-1).pos.map((v) => +v.toFixed(4)), keepInClearingArr(pin.pos));
});
const keepInClearingArr = ([x, y, z]) => {
  const p = keepInClearing({ x, y, z });
  return [p.x, p.y, p.z].map((v) => +v.toFixed(4));
};

test('camera: 32 bars of each move from framings all round the clearing never leave it', () => {
  const rnd = seeded(9);
  for (const kind of MOVE_KINDS) {
    for (let k = 0; k < 4; k++) {
      const fire = fakeFire();
      const camera = createCamera(fire, settingsFor({ camera: 'drift' }));
      const pin = at((rnd() * 2 - 1) * 1.8, 1 + rnd() * 5.5, 0.3 + rnd() * 4, { kind, amount: 0.5 + rnd() * 0.5, bars: MOVE_BARS[Math.floor(rnd() * MOVE_BARS.length)] });
      camera.pin(pin);
      const period = 60 / 128;
      for (let f = 0; f < 32 * 4 * period * 30; f++) camera.update(1 / 30, { period, punch: 0, holding: false, build: 0, breath: 0 });
      for (const p of fire.poses) assert.ok(inside(p.pos), `${kind}: ${p.pos.map((v) => v.toFixed(2))}`);
    }
  }
  assert.ok(SHOTS.clearing);
});
