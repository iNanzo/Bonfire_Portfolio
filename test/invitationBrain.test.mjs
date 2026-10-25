// NEWT's brain in the invitation toy (src/invitation/brain.js), driven frame by frame the way
// main.js drives it: a stand-in world plays the clips the brain asks for (so it reports each
// clip's time left), steers him with steer.js, and lands him a moment after he's dropped. It
// checks every row of the plan's state table (idle, walk, react, flee, held, fall, land and the
// sit trio) and its taps table: stress building to flee and decaying, gestures (a short press
// is a tap, a drag a grab, a cancel a drop), a release going fall → land → idle or flee, a
// grab working in every state, sitting after 20 s alone and getting up before obeying, floor
// taps, the buttons (and their being off while he's held or falling), the Sit/Stand label,
// faces from FACE_TRACK with blinks from faces.js, no reaction three times running, the turn
// to the camera before a reaction (a sit, the tablet's sit and lie and a carry keep the way he
// faces) and, held, his head hung with a glance up every few seconds; the play area shrunk
// under him, he walks back in, onto what's on screen. The seeded rng (rng.js) is checked here too.
// The intro's dialogue mode: he gets up if he's sitting, walks in toward the middle when he's
// far out, turns to the camera, then plays each box's animation (a gesture once, then Talk while
// the line types and Idle after; a loop holds; none keeps what he does; Sit sits him down and the
// next gesture gets him up) with the box's face, looking at the camera; taps, grabs, floor taps,
// buttons, wandering and sitting by himself do nothing meanwhile; at the end he's back to play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, DIALOGUE_CLIPS, FACE_TRACK, GAIT, fadeFor } from '../src/invitation/clips.js';
import { createBrain, TUNE } from '../src/invitation/brain.js';
import { clampTo, steer, wrapAngle } from '../src/invitation/steer.js';
import { playArea } from '../src/invitation/area.js';
import { createGesture } from '../src/invitation/gesture.js';
import { createFaceState, faceStep, BLINK } from '../src/invitation/faces.js';
import { createRng, between } from '../src/invitation/rng.js';

const BOUNDS = { minX: -2, maxX: 2, minZ: -2, maxZ: 1.4 };
const DT = 1 / 60;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const SITTING = ['sitDown', 'sit'];

/**
 * A stand-in for main.js: plays the clip the brain asks for, steers NEWT, and lands him 0.4 s
 * after he's let go. `w.pointer` and `w.carry` are what the page would pass.
 */
function sim({ seed = 1, calm = true, tune, x = 0, z = 0, yaw = 0, camera = null } = {}) {
  const brain = createBrain({ seed, calm, bounds: BOUNDS, tune });
  const w = {
    t: 0,
    body: { x, z, yaw, speed: 0 },
    grounded: true,
    clip: null,
    clipStart: 0,
    pointer: null,
    carry: null,
    camera,
    /** @type {{seq: number, animation: string, face: string, typing: boolean}|null} the intro's box, while it runs */
    dialogue: null,
    landAt: Infinity,
    out: null,
  };
  const clipInfo = () => {
    if (!w.clip) return null;
    const spec = CLIPS[w.clip];
    const time = w.t - w.clipStart;
    if (spec.loop) {
      const tt = time % spec.length;
      return { name: w.clip, time: tt, remaining: spec.length - tt };
    }
    return { name: w.clip, time: Math.min(time, spec.length), remaining: Math.max(0, spec.length - time) };
  };
  function frame({ events = [], button = null, each } = {}) {
    w.t += DT;
    each?.(w);
    const out = brain.step({
      t: w.t,
      dt: DT,
      events: events.map((e) => ({ x: 0, y: 0, t: w.t, ...e })),
      button,
      pointer: w.pointer,
      newt: { x: w.body.x, z: w.body.z, yaw: w.body.yaw, grounded: w.grounded },
      clip: clipInfo(),
      carry: w.out?.state === 'held' ? w.carry : null,
      camera: w.camera,
      dialogue: w.dialogue,
    });
    if (out.clip === 'gait') w.clip = null;
    else if (out.restart || out.clip !== w.clip) {
      w.clip = out.clip;
      w.clipStart = w.t;
    }
    if (out.state === 'held') {
      w.grounded = false;
      w.landAt = Infinity;
    } else if (out.state === 'fall') {
      if (w.landAt === Infinity) w.landAt = w.t + 0.4;
      if (w.t >= w.landAt) w.grounded = true;
    } else {
      w.grounded = true;
      w.landAt = Infinity;
      w.body = steer(w.body, out.move, w.pointer, BOUNDS, DT);
    }
    w.out = out;
    return out;
  }
  const s = {
    w,
    brain,
    frame,
    run(seconds, opts) {
      let out = w.out;
      for (let i = 0; i < Math.round(seconds / DT); i++) out = frame(opts);
      return out;
    },
    /** Frames until `pred(out)`; fails after `max` seconds. Passes every out to `seen`. */
    until(pred, max = 30, seen) {
      for (let i = 0; i < Math.round(max / DT); i++) {
        const out = frame();
        seen?.(out);
        if (pred(out)) return out;
      }
      assert.fail(`not reached within ${max} s (state ${w.out?.state})`);
    },
    tap: () => frame({ events: [{ type: 'tap', on: 'newt' }] }),
    floorTap: (fx, fz) => frame({ events: [{ type: 'tap', on: 'floor', floor: { x: fx, z: fz } }] }),
    grab: () => frame({ events: [{ type: 'grab', on: 'newt' }] }),
    release: () => frame({ events: [{ type: 'release', on: 'newt' }] }),
    cancel: () => frame({ events: [{ type: 'cancel', on: 'newt' }] }),
    hover: (px, py) => frame({ events: [{ type: 'hover', on: 'floor', x: px, y: py }] }),
    button: (name) => frame({ button: name }),
  };
  s.frame();
  return s;
}
/** States in order, repeats dropped. */
const order = (outs) => outs.map((o) => o.state).filter((st, i, a) => i === 0 || a[i - 1] !== st);

test('createRng repeats per seed and stays in [0, 1)', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const xs = Array.from({ length: 2000 }, () => a());
  assert.deepEqual(
    xs,
    Array.from({ length: 2000 }, () => b()),
  );
  assert.notDeepEqual(
    xs,
    Array.from({ length: 2000 }, () => c()),
  );
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  close(xs.reduce((s, v) => s + v, 0) / xs.length, 0.5, 0.03, 'mean');
  const r = createRng(0);
  for (let i = 0; i < 100; i++) {
    const v = between(r, 2, 5);
    assert.ok(v >= 2 && v < 5);
  }
});

test('idle wanders: a walk to a goal after 1.5–4 s, and idle again on arrival', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = sim({ seed, calm: false });
    assert.equal(s.w.out.state, 'idle');
    assert.equal(s.w.out.clip, 'gait');
    assert.equal(s.w.out.move.speed, 0);
    assert.equal(s.w.out.wander, true);
    const out = s.until((o) => o.state === 'walk', 5);
    assert.ok(s.w.t >= TUNE.idleMin - 1e-6 && s.w.t <= TUNE.idleMax + 2 * DT, `walked at ${s.w.t}`);
    assert.equal(out.clip, 'gait');
    assert.equal(out.move.mode, 'goto');
    assert.equal(out.move.speed, GAIT.walk);
    assert.ok(dist(out.move.goal, s.w.body) >= 1 - 1e-6);
    const goal = out.move.goal;
    s.until((o) => o.state === 'idle', 15);
    assert.ok(dist(s.w.body, goal) <= TUNE.arrive, 'arrived');
  }
});

test('a tap turns him to face the camera, then plays Wave or Spook, then idle when it ends', () => {
  const s = sim({ yaw: 2 });
  s.run(0.3);
  let out = s.tap();
  assert.equal(out.state, 'react');
  assert.equal(out.faceCamera, true);
  assert.equal(out.clip, 'gait');
  assert.equal(out.move.mode, 'face');
  const t0 = s.w.t;
  out = s.until((o) => o.clip !== 'gait', 1);
  const turn = s.w.t - t0;
  // (Until he faces it, a pivot of about 2 rad on the spot, never longer than faceTurn.)
  assert.ok(turn > 0.3 && turn <= TUNE.faceTurn + DT + 1e-6, `turned for ${turn} s`);
  assert.ok(Math.abs(wrapAngle(s.w.body.yaw)) <= TUNE.facedEnough + 0.1, 'facing the camera');
  assert.ok(['Wave', 'Spook'].includes(out.clip));
  assert.equal(out.reaction, out.clip);
  assert.equal(out.restart, true);
  assert.equal(out.faceCamera, false);
  const name = out.clip;
  const start = s.w.t;
  out = s.frame();
  assert.equal(out.restart, false, 'restart only on the first frame');
  assert.equal(out.clip, name);
  out = s.until((o) => o.state !== 'react', 3);
  assert.equal(out.state, 'idle');
  close(s.w.t - start, CLIPS[name].length - fadeFor(name, 'Idle'), DT + 1e-6, 'ends with its fade to go');
});

test('he turns to face the camera before reacting', () => {
  const s = sim({ yaw: 2 });
  s.tap();
  const before = Math.abs(wrapAngle(s.w.body.yaw));
  let out = s.until((o) => o.clip !== 'gait', 1);
  assert.equal(out.state, 'react');
  const after = Math.abs(wrapAngle(s.w.body.yaw));
  assert.ok(after < before / 3, `still ${after} rad off the camera`);
  // Already facing it: the reaction starts at once.
  const f = sim({ yaw: 0.05 });
  out = f.tap();
  assert.ok(['Wave', 'Spook'].includes(out.clip));
  assert.equal(out.restart, true);
  // With the camera's spot given, "facing it" means toward that spot.
  const c = sim({ x: 1.5, yaw: 0, camera: { x: 0, z: 6 } });
  out = c.tap();
  assert.equal(out.clip, 'gait', 'at x 1.5, yaw 0 is not facing a camera at x 0');
  assert.deepEqual(out.move.goal, { x: 0, z: 6 });
  c.until((o) => o.clip !== 'gait', 1);
  close(c.w.body.yaw, Math.atan2(-1.5, 6), 0.1);
});

test('in a reaction, a tap in the first 60% only adds stress; a later tap starts a new one', () => {
  const s = sim();
  let out = s.tap();
  const first = out.clip;
  assert.ok(['Wave', 'Spook'].includes(first));
  const st = out.stress;
  close(st, TUNE.stressTap, 0.01);
  s.run(CLIPS[first].length * 0.3);
  out = s.tap();
  assert.equal(out.state, 'react');
  assert.equal(out.restart, false);
  assert.equal(out.clip, first);
  assert.ok(out.stress > st + 0.9, 'stress only');
  s.run(CLIPS[first].length * 0.35);
  assert.equal(s.w.out.state, 'react');
  out = s.tap();
  assert.equal(out.state, 'react');
  assert.equal(out.restart, true, 'a new reaction');
  assert.ok(['Wave', 'Spook'].includes(out.clip));
});

test('stress builds to flee: four taps send him running, and he calms down after 2.5 s or more', () => {
  const s = sim();
  let out;
  for (let i = 0; i < 4; i++) {
    out = s.tap();
    if (i < 3) assert.notEqual(out.state, 'flee');
    s.run(0.1);
  }
  out = s.w.out;
  assert.equal(out.state, 'flee');
  assert.equal(out.clip, 'gait');
  assert.equal(out.move.mode, 'flee');
  assert.equal(out.move.speed, GAIT.run);
  assert.ok(out.move.speed >= 2 * GAIT.walk * 0.95, 'about twice walking speed');
  assert.ok(out.stress >= TUNE.stressFlee - 0.01);
  const t0 = s.w.t - 0.1;
  out = s.until((o) => o.state !== 'flee', 20);
  assert.equal(out.state, 'idle');
  assert.ok(s.w.t - t0 >= TUNE.fleeMin, `fled for ${s.w.t - t0} s`);
  assert.ok(out.stress < TUNE.stressCalm);
});

test('stress decays at about 0.5/s after a moment, faster when the pointer is far or still', () => {
  const drop = (setPointer) => {
    const s = sim();
    s.tap();
    s.tap();
    s.tap();
    const peak = s.w.out.stress;
    s.run(TUNE.decayDelay - 0.2, { each: setPointer });
    assert.ok(s.w.out.stress >= peak - 1e-6, 'no decay for a moment after a tap');
    s.run(0.4, { each: setPointer });
    const a = s.w.out.stress;
    s.run(1, { each: setPointer });
    return a - s.w.out.stress;
  };
  const near = drop((w) => {
    w.pointer = { x: w.body.x + 0.3 * Math.cos(w.t * 3), z: w.body.z + 0.3 * Math.sin(w.t * 3) };
  });
  close(near, TUNE.decay, 0.05, 'near and moving');
  const still = drop((w) => {
    w.pointer = { x: w.body.x + 0.3, z: w.body.z };
  });
  const far = drop((w) => {
    w.pointer = { x: w.body.x + TUNE.farDist + 0.5 + 0.3 * Math.cos(w.t * 3), z: w.body.z };
  });
  const gone = drop((w) => {
    w.pointer = null;
  });
  assert.ok(still > near * 1.2, `still ${still} vs ${near}`);
  assert.ok(far > near * 1.5, `far ${far} vs ${near}`);
  assert.ok(gone >= far && gone >= still, 'no pointer is both');
});

test('fleeing: a tap adds stress and he keeps running; a floor tap is ignored', () => {
  const s = sim();
  for (let i = 0; i < 4; i++) s.tap();
  assert.equal(s.w.out.state, 'flee');
  const st = s.w.out.stress;
  let out = s.tap();
  assert.equal(out.state, 'flee');
  assert.ok(out.stress > st + 0.5);
  out = s.floorTap(1, 1);
  assert.equal(out.state, 'flee');
  assert.equal(out.move.mode, 'flee');
  assert.deepEqual(out.move.goal, { x: 1, z: 1 }, 'not a place to walk to: the finger he runs from');
});

test('fleeing from stress with the finger lifted, he runs from where it was; the Run button across the view, from a spot beside him', () => {
  const s = sim();
  const at = { x: 0.4, z: 0.2 };
  s.w.pointer = at;
  for (let i = 0; i < 3; i++) s.tap();
  s.w.pointer = null;
  let out = s.tap();
  assert.equal(out.state, 'flee');
  assert.deepEqual(out.move.goal, at, 'the pointer was last seen there');
  s.run(TUNE.threatMemory + 0.1);
  assert.equal(s.w.out.state, 'flee');
  assert.equal(s.w.out.move.goal, null, 'forgotten after a while');
  s.w.pointer = { x: -1, z: 0 };
  out = s.frame();
  assert.equal(out.move.goal, null, 'a live pointer is passed to steer instead');

  const r = sim();
  r.w.pointer = at;
  r.frame();
  r.w.pointer = null;
  out = r.button('Run');
  assert.equal(out.state, 'flee');
  // The Run button with no pointer: from a spot beside him as the camera sees it (+z without
  // one), so he runs across the view, not at the camera; either side.
  const sides = new Set();
  for (let seed = 1; seed <= 8; seed++)
    for (const camera of [null, { x: 0.3, z: 9 }, { x: 8, z: -0.2 }]) {
      const q = sim({ seed, x: 0.3, z: -0.2, camera });
      q.frame();
      const from = { ...q.w.body };
      const { goal } = q.button('Run').move;
      const toCam = camera ? { x: camera.x - from.x, z: camera.z - from.z } : { x: 0, z: 1 };
      const d = { x: goal.x - from.x, z: goal.z - from.z };
      close(Math.hypot(d.x, d.z), TUNE.runFromGap, 1e-9, `seed ${seed}: beside him`);
      close((d.x * toCam.x + d.z * toCam.z) / Math.hypot(toCam.x, toCam.z), 0, 1e-9, 'square to the camera');
      if (!camera) sides.add(Math.sign(d.x));
      assert.deepEqual(q.run(1).move.goal, goal, 'it stays put while he runs on away from it');
    }
  assert.equal(sides.size, 2, 'either side');
});

test('through gestures: a short press is a tap, a drag is a grab, and a cancel is a drop', () => {
  const s = sim();
  const g = createGesture();
  const P = (id, x, y, t) => ({ id, x, y, t, kind: 'touch', buttons: 1 });
  g.down(P(1, 100, 100, s.w.t), true);
  s.frame({ events: g.tick(s.w.t + DT) });
  let out = s.frame({ events: g.up(P(1, 103, 101, s.w.t + 0.1)) });
  assert.equal(out.state, 'react');
  s.until((o) => o.state === 'idle', 3);

  g.down(P(2, 100, 100, s.w.t), true);
  out = s.frame({ events: g.move(P(2, 130, 100, s.w.t + 0.05)) });
  assert.equal(out.state, 'held');
  out = s.frame({ events: g.move(P(2, 160, 100, s.w.t + 0.05)) });
  assert.equal(out.state, 'held');
  out = s.frame({ events: g.cancel(2, s.w.t) });
  assert.equal(out.state, 'fall', 'a cancel drops him');
  s.until((o) => o.state === 'idle', 3);

  g.down(P(3, 100, 100, s.w.t), true);
  out = s.frame({ events: g.tick(s.w.t + 0.3) });
  assert.equal(out.state, 'held', 'a long press grabs');
  out = s.frame({ events: g.up(P(3, 100, 100, s.w.t + 0.4)) });
  assert.equal(out.state, 'fall');
});

test('a release goes fall → land → idle, or on to flee when he is stressed', () => {
  const s = sim();
  let out = s.grab();
  assert.equal(out.state, 'held');
  assert.equal(out.clip, 'Held');
  assert.equal(out.restart, true);
  assert.equal(out.move.mode, 'stay');
  s.run(0.5);
  out = s.release();
  assert.equal(out.state, 'fall');
  assert.equal(out.clip, 'Fall');
  assert.equal(out.restart, true);
  const seen = [out];
  s.until(
    (o) => o.state === 'idle',
    5,
    (o) => seen.push(o),
  );
  assert.deepEqual(order(seen), ['fall', 'land', 'idle']);
  const land = seen.find((o) => o.state === 'land');
  assert.equal(land.clip, 'Land');
  assert.equal(land.restart, true);

  const r = sim();
  r.grab();
  r.w.carry = { dragSpeed: 2, shake: 30 };
  r.run(1.5);
  assert.ok(r.w.out.stress >= TUNE.stressFlee, `held roughly: stress ${r.w.out.stress}`);
  const seen2 = [r.release()];
  r.until(
    (o) => o.state === 'flee',
    5,
    (o) => seen2.push(o),
  );
  assert.deepEqual(order(seen2), ['fall', 'land', 'flee']);
});

test('a grab works in every state: catching him mid-run holds him', () => {
  const into = {
    idle: (s) => s.frame(),
    walk: (s) => s.floorTap(1, -1),
    react: (s) => s.tap(),
    'react (turning)': (s) => {
      s.w.body.yaw = 2;
      return s.tap();
    },
    flee: (s) => {
      s.button('Run');
      return s.run(0.5);
    },
    held: (s) => s.grab(),
    fall: (s) => {
      s.grab();
      return s.release();
    },
    land: (s) => {
      s.grab();
      s.release();
      return s.until((o) => o.state === 'land', 3);
    },
    sitDown: (s) => s.button('Sit'),
    sit: (s) => {
      s.button('Sit');
      return s.until((o) => o.state === 'sit', 3);
    },
    standUp: (s) => {
      s.button('Sit');
      s.until((o) => o.state === 'sit', 3);
      return s.button('Sit');
    },
  };
  for (const [name, go] of Object.entries(into)) {
    const s = sim();
    const before = go(s);
    assert.equal(before.state, name.split(' ')[0], name);
    const out = s.grab();
    assert.equal(out.state, 'held', `grabbed in ${name}`);
    assert.equal(out.clip, 'Held');
  }
});

test('held: sad from the first frame, with slow blinks; surprised while he’s shaken hard; angry while he thrashes', () => {
  const s = sim();
  let out = s.grab();
  assert.equal(out.face, 'sad');
  assert.equal(out.blink, 'slow');
  out = s.run(1);
  assert.equal(out.face, 'sad', 'still sad a second on');
  s.w.carry = { dragSpeed: 0, shake: TUNE.shakeHard + 5 };
  out = s.frame();
  assert.equal(out.face, 'surprised');
  assert.equal(out.blink, 'none');
  s.w.carry = { dragSpeed: 0, shake: 0 };
  out = s.until((o) => o.clip === 'Thrash', 10);
  assert.equal(out.face, 'angry', 'thrashing');
  out = s.until((o) => o.clip === 'Held', 3);
  assert.equal(out.face, 'sad', 'back to hanging');
});

test('held, he thrashes every 3–7 s (sooner when he’s shaken): Thrash once from its start, then back to Held without restarting it', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = sim({ seed });
    s.grab();
    let hangingSince = s.w.t;
    for (let n = 0; n < 3; n++) {
      const out = s.until((o) => o.clip === 'Thrash', 10);
      assert.equal(out.state, 'held');
      assert.equal(out.restart, true, 'from its start');
      const waited = s.w.t - hangingSince;
      // (One due as a glance up comes waits for it: up to the Thrash's length and the glance's.)
      const most = TUNE.thrashMax + CLIPS.Thrash.length + TUNE.lookUpForMax;
      assert.ok(waited >= 3 - DT && waited <= most + DT, `seed ${seed}: thrashed after ${waited.toFixed(2)} s hanging`);
      const began = s.w.t;
      const back = s.until((o) => o.clip !== 'Thrash', 3);
      assert.equal(back.clip, 'Held', 'back to Held');
      assert.equal(back.restart, false, 'Held keeps its clock');
      assert.ok(s.w.t - began <= CLIPS.Thrash.length + DT, 'Thrash played once');
      hangingSince = s.w.t;
    }
  }
  // Shaken hard, he thrashes sooner: well before the 3 s he'd otherwise hang still.
  const s = sim({ seed: 2 });
  s.grab();
  s.run(0.5);
  s.w.carry = { dragSpeed: 2, shake: TUNE.shakeHard + 5 };
  s.frame();
  s.w.carry = { dragSpeed: 0, shake: 0 };
  const grabbedAt = s.w.t - 0.5;
  s.until((o) => o.clip === 'Thrash', 3);
  assert.ok(s.w.t - grabbedAt < 2.5, `shaken at 0.5 s, thrashed at ${(s.w.t - grabbedAt).toFixed(2)} s`);
  // Shaken on and on, he still hangs a moment between thrashes.
  s.w.carry = { dragSpeed: 2, shake: TUNE.shakeHard + 5 };
  let ended = null;
  let gaps = 0;
  for (let i = 0; i < 600; i++) {
    const o = s.frame();
    if (o.clip === 'Held' && ended === null) ended = s.w.t;
    if (o.clip === 'Thrash' && ended !== null) {
      assert.ok(s.w.t - ended >= TUNE.thrashRest - 0.02, `hung ${(s.w.t - ended).toFixed(2)} s between thrashes`);
      ended = null;
      gaps++;
    }
  }
  assert.ok(gaps >= 2, `he still thrashes, sooner: ${gaps} in 10 s`);
  s.w.carry = { dragSpeed: 0, shake: 0 };
  // Let go mid-thrash, he falls as ever.
  const out = s.release();
  assert.equal(out.state, 'fall');
  assert.equal(out.clip, 'Fall');
});

test('held, his head hangs (a light look aimed down) and 1.5–2.5 s after the grab, then every 2.5–4.5 s from one glance’s start to the next, he glances up at you for 0.8–1.2 s, eased up and back down, the hung look’s weight left as it is (the glance has its own); never during a Thrash', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = sim({ seed, tune: { thrashMin: 99, thrashMax: 99 } });
    let out = s.grab();
    assert.deepEqual(
      out.look,
      {
        mode: 'forward',
        weight: TUNE.heldLook,
        pitch: TUNE.heldPitch,
        up: 0,
        lift: TUNE.lookUpLift,
        upWeight: TUNE.lookUpWeight,
      },
      'hanging his head',
    );
    let last = s.w.t;
    let prev = 0;
    /** @type {{from: number, to: number, most: number, weight: number}|null} */
    let on = null;
    const glances = [];
    for (let i = 0; i < Math.round(20 / DT); i++) {
      out = s.frame();
      const up = out.look.up;
      assert.ok(up >= 0 && up <= 1, `up ${up}`);
      assert.ok(Math.abs(up - prev) <= (DT / TUNE.lookUpEase) * 1.6 + 1e-9, `eased: ${prev} → ${up}`);
      // (The hung look keeps its light weight: the page turns it into the glance's, play.js glanceLook.)
      assert.equal(out.look.weight, TUNE.heldLook, 'the hung look as it is');
      assert.equal(out.look.upWeight, TUNE.lookUpWeight, 'the glance’s own weight');
      assert.equal(out.look.pitch, TUNE.heldPitch);
      if (up > 0 && !on) on = { from: s.w.t - DT, to: 0, most: 0, weight: 0 };
      if (on) {
        on.most = Math.max(on.most, up);
        on.weight = Math.max(on.weight, out.look.upWeight * up);
      }
      if (on && up === 0) {
        on.to = s.w.t;
        glances.push({ ...on, after: on.from - last });
        last = on.from;
        on = null;
      }
      prev = up;
    }
    assert.ok(glances.length >= 4, `seed ${seed}: ${glances.length} glances up in 20 s`);
    for (const [i, g] of glances.entries()) {
      const [lo, hi] = i === 0 ? [TUNE.lookUpFirstMin, TUNE.lookUpFirstMax] : [TUNE.lookUpMin, TUNE.lookUpMax];
      assert.ok(
        g.after >= lo - DT && g.after <= hi + DT,
        `seed ${seed}: glance ${i + 1} up after ${g.after.toFixed(2)} s`,
      );
      const long = g.to - g.from;
      assert.ok(
        long >= TUNE.lookUpForMin - DT && long <= TUNE.lookUpForMax + 2 * DT,
        `seed ${seed}: up for ${long.toFixed(2)} s`,
      );
      assert.equal(g.most, 1, 'all the way up');
      assert.ok(Math.abs(g.weight - TUNE.lookUpWeight) < 1e-9);
    }
  }
  // With his thrashes as ever: never up while he thrashes, and it still comes between them.
  let ups = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = sim({ seed });
    s.grab();
    for (let i = 0; i < Math.round(20 / DT); i++) {
      const out = s.frame();
      if (out.clip === 'Thrash') assert.equal(out.look.up, 0, `seed ${seed}: not up while he thrashes`);
      else if (out.look.up === 1) ups++;
    }
  }
  assert.ok(ups > 0, 'he still looks up between thrashes');
  // Let go, the look-up is over.
  const s = sim({ seed: 1, tune: { thrashMin: 99, thrashMax: 99 } });
  s.grab();
  s.until((o) => o.look.up === 1, 8);
  const out = s.release();
  assert.equal(out.state, 'fall');
  assert.equal(out.look.up, undefined);
});

test('“Full droop, occasionally looks up”: over a 12 s still hold, thrashes and all, he glances up at least 3 times, never while he thrashes', () => {
  assert.equal(TUNE.lookUpMin, 2.5);
  assert.equal(TUNE.lookUpMax, 4.5);
  // (A Thrash that waits for a glance up always fits before the next one.)
  assert.ok(TUNE.lookUpMin - TUNE.lookUpForMax > CLIPS.Thrash.length);
  for (let seed = 1; seed <= 24; seed++) {
    const s = sim({ seed });
    s.grab();
    let glances = 0;
    let thrashes = 0;
    let prev = s.w.out;
    for (let i = 0; i < Math.round(12 / DT); i++) {
      const out = s.frame();
      if (out.clip === 'Thrash') assert.equal(out.look.up, 0, `seed ${seed}: not up while he thrashes`);
      if (out.look.up === 1 && prev.look.up < 1) glances++;
      if (out.clip === 'Thrash' && prev.clip !== 'Thrash') thrashes++;
      prev = out;
    }
    assert.equal(s.w.out.state, 'held');
    assert.ok(thrashes >= 1, `seed ${seed}: he thrashed (${thrashes})`);
    assert.ok(glances >= 3, `seed ${seed}: ${glances} glances up in 12 s (${thrashes} thrashes)`);
  }
});

test('held, a Thrash that comes due during a glance up waits for it to end; a hard shake’s cuts it short, and the glance comes again TUNE.lookUpRest s after the Thrash', () => {
  // (Due at 3 s, with the glance up at 2.5 s for 1.2, or due at 3.5 s, before the Thrash would be
  // over: the Thrash waits till it's down, then comes at once.)
  for (const first of [2.5, 3.5]) {
    const glance = { lookUpFirstMin: first, lookUpFirstMax: first, lookUpForMin: 1.2, lookUpForMax: 1.2 };
    const s = sim({ tune: { thrashMin: 3, thrashMax: 3, ...glance } });
    s.grab();
    const t0 = s.w.t - DT;
    s.until((o) => o.look.up === 1, 5);
    const out = s.until((o) => o.clip === 'Thrash', 3);
    assert.equal(out.look.up, 0);
    const at = s.w.t - t0;
    assert.ok(
      at >= first + 1.2 - 2 * DT && at <= first + 1.2 + 2 * DT,
      `the Thrash at ${at.toFixed(2)} s, as the glance ends`,
    );
  }
  // (Shaken hard in the middle of one: the Thrash cuts it, and it's back after.)
  const h = sim({
    tune: {
      thrashMin: 99,
      thrashMax: 99,
      lookUpFirstMin: 2.5,
      lookUpFirstMax: 2.5,
      lookUpForMin: 1.2,
      lookUpForMax: 1.2,
    },
  });
  h.grab();
  h.until((o) => o.look.up === 1, 3);
  h.w.carry = { dragSpeed: 0, shake: TUNE.shakeHard + 5 };
  h.until((o) => o.clip === 'Thrash', 2);
  h.w.carry = { dragSpeed: 0, shake: 0 };
  h.until((o) => o.clip !== 'Thrash', 3);
  const ended = h.w.t;
  h.until((o) => o.look.up > 0, 3);
  const after = h.w.t - DT - ended;
  assert.ok(
    Math.abs(after - TUNE.lookUpRest) <= 2 * DT,
    `the cut glance up again ${after.toFixed(2)} s after the Thrash`,
  );
});

test('held, a glance up that came due while he thrashed comes TUNE.lookUpRest s after the Thrash, not a whole wait later', () => {
  // (Only a shake's Thrash can be under way as one comes due: any other waits for it.)
  const s = sim({ tune: { thrashMin: 99, thrashMax: 99, lookUpFirstMin: 2.4, lookUpFirstMax: 2.4 } });
  s.grab();
  s.run(1.6);
  s.w.carry = { dragSpeed: 0, shake: TUNE.shakeHard + 5 };
  s.frame();
  s.w.carry = { dragSpeed: 0, shake: 0 };
  s.until((o) => o.clip === 'Thrash', 2);
  assert.equal(s.w.out.look.up, 0, 'not up yet');
  const out = s.until((o) => o.clip !== 'Thrash', 3);
  assert.equal(out.look.up, 0);
  const ended = s.w.t;
  s.until((o) => o.look.up > 0, 3);
  const after = s.w.t - DT - ended;
  assert.ok(Math.abs(after - TUNE.lookUpRest) <= 2 * DT, `up ${after.toFixed(2)} s after the Thrash`);
});

test('held, falling and landing he keeps the way he faced when grabbed (no turn to the camera), and carries on from there', () => {
  for (const yaw of [2, -1.3, Math.PI]) {
    const s = sim({ yaw, camera: { x: 0, z: 6 } });
    s.grab();
    const seen = [];
    s.run(1.5);
    s.release();
    s.until(
      (o) => o.state === 'idle',
      5,
      (o) => seen.push(o),
    );
    for (const o of seen) {
      assert.equal(o.faceCamera, false, `${o.state}: no turn`);
      assert.equal(o.move.mode, 'stay', `${o.state}: staying put`);
    }
    assert.ok(seen.some((o) => o.state === 'land'));
    assert.ok(Math.abs(wrapAngle(s.w.body.yaw - yaw)) < 1e-9, `yaw ${yaw}: as grabbed`);
  }
});

test('in fall and land taps are ignored, but a grab still works', () => {
  const s = sim();
  s.grab();
  s.run(0.2);
  s.release();
  const st = s.w.out.stress;
  let out = s.tap();
  assert.equal(out.state, 'fall');
  assert.ok(out.stress <= st + 1e-6, 'not even stress');
  out = s.floorTap(1, 1);
  assert.equal(out.state, 'fall');
  s.until((o) => o.state === 'land', 3);
  out = s.tap();
  assert.equal(out.state, 'land');
  out = s.floorTap(1, 1);
  assert.equal(out.state, 'land');
  out = s.grab();
  assert.equal(out.state, 'held');
});

test('after 20 s alone he sits by himself, and gets up before obeying a tap or a floor tap', () => {
  const s = sim({ calm: false, seed: 2 });
  let out = s.until((o) => o.clip === 'SitDown', 40); // (once he's turned to the camera)
  assert.ok(s.w.t >= TUNE.sitAfter && s.w.t <= TUNE.sitAfter + 8, `sat at ${s.w.t}`);
  assert.equal(out.state, 'sitDown');
  assert.equal(out.restart, true);
  assert.equal(out.sitLabel, 'Stand');
  out = s.until((o) => o.state === 'sit', 3);
  assert.equal(out.clip, 'Sit');
  out = s.run(5);
  assert.equal(out.state, 'sit', 'stays sitting while left alone');

  out = s.tap();
  assert.equal(out.state, 'standUp');
  assert.equal(out.clip, 'StandUp');
  assert.equal(out.restart, true);
  assert.equal(out.sitLabel, 'Sit');
  const seen = [out];
  out = s.until(
    (o) => o.state !== 'standUp',
    3,
    (o) => seen.push(o),
  );
  assert.equal(out.state, 'react', 'then reacts');

  const f = sim({ calm: false, seed: 3, tune: { sitAfter: 2, idleMin: 99, idleMax: 99 } });
  f.until((o) => o.state === 'sit', 10);
  out = f.floorTap(1, -1);
  assert.equal(out.state, 'standUp');
  out = f.until((o) => o.state !== 'standUp', 3);
  assert.equal(out.state, 'walk', 'then walks there');
  assert.deepEqual(out.move.goal, { x: 1, z: -1 });

  // A tap while he's still sitting down gets him up too.
  const d = sim({ calm: false, tune: { sitAfter: 1, idleMin: 99, idleMax: 99 } });
  d.until((o) => o.state === 'sitDown', 5);
  assert.equal(d.tap().state, 'standUp');
});

test('sitting down, by the button or by himself, he keeps the way he faces: SitDown at once (no turn to the camera), then sits there with his happy face', () => {
  const alone = { calm: false, x: 1.5, yaw: 2.5, tune: { sitAfter: 2, idleMin: 99, idleMax: 99 } };
  const cases = { 'the button': [{ yaw: 2 }, null], 'by himself': [alone, { x: 0, z: 6 }] };
  // Facing away from the camera: the Sit button with no camera spot (+z), and by himself with one off to the side.
  for (const [how, [opts, camera]] of Object.entries(cases)) {
    const s = sim({ ...opts, camera });
    const yaw = s.w.body.yaw;
    let out = camera ? s.until((o) => o.state === 'sitDown', 4) : s.button('Sit');
    const first = [out.state, out.clip, out.restart, out.faceCamera, out.move.mode, out.sitLabel, out.face];
    assert.deepEqual(first, ['sitDown', 'SitDown', true, false, 'stay', 'Stand', 'happy'], `${how}: down at once`);
    out = s.until(
      (o) => o.state === 'sit',
      3,
      (o) => assert.equal(o.move.mode, 'stay', `${how}: no turn`),
    );
    assert.ok(
      Math.abs(wrapAngle(s.w.body.yaw - yaw)) < 1e-9 && out.face === 'happy',
      `${how}: sitting the way he faced, happy`,
    );
  }
  // Sitting down, he has begun to sit: a tap or Stand gets him up first.
  for (const poke of [(s) => s.tap(), (s) => s.button('Sit')]) {
    const s = sim({ yaw: 2 });
    s.button('Sit');
    assert.equal(poke(s).state, 'standUp');
  }
});

test('company resets the 20 s sit timer: a press, a button, or the pointer moving more than 30 px', () => {
  const quiet = { calm: false, tune: { idleMin: 999, idleMax: 999 } };
  const sitsAt = (poke) => {
    const s = sim(quiet);
    s.run(15);
    poke(s);
    s.until((o) => o.state === 'sitDown', 40);
    return s.w.t;
  };
  const alone = sitsAt(() => {});
  close(alone, TUNE.sitAfter, 2 * DT);
  const hovered = sitsAt((s) => {
    s.hover(100, 100);
    s.hover(120, 100);
    s.hover(131, 100);
  });
  close(hovered, 15 + TUNE.sitAfter, 0.1, 'a 31 px move');
  const jiggled = sitsAt((s) => {
    s.hover(100, 100);
    s.hover(115, 100);
    s.hover(100, 110);
    s.hover(110, 90);
  });
  close(jiggled, TUNE.sitAfter, 2 * DT, 'jiggling within 30 px is still alone');
  const pressed = sitsAt((s) => {
    s.floorTap(0, 0);
  });
  assert.ok(pressed >= 15 + TUNE.sitAfter - 0.1, 'a floor tap');
  const buttoned = sitsAt((s) => {
    s.button('Wander');
    s.button('Wander');
  });
  close(buttoned, 15 + TUNE.sitAfter, 0.1, 'a button');
});

test('turning, panning or zooming the camera is company too, and never moves him or reacts', () => {
  const quiet = { calm: false, tune: { idleMin: 999, idleMax: 999 } };
  const sitsAt = (poke) => {
    const s = sim(quiet);
    s.run(15);
    const before = s.w.out.state;
    poke(s);
    assert.equal(s.w.out.state, before, 'still where he was');
    s.until((o) => o.state === 'sitDown', 40);
    return s.w.t;
  };
  // (An orbit's or a pan's moves themselves, 40 px of them, with no release.)
  for (const type of ['orbit', 'pan']) {
    const at = sitsAt((s) => [100, 140].forEach((x) => s.frame({ events: [{ type, on: 'floor', x, y: 100 }] })));
    assert.ok(at >= 15 + TUNE.sitAfter - 0.1, `${type} (${at.toFixed(2)} s)`);
  }
  const pinched = sitsAt((s) => {
    s.frame({ events: [{ type: 'pinch', on: 'floor', x: 100, y: 100, scale: 1 }] });
    s.frame({ events: [{ type: 'pinch', on: 'floor', x: 100, y: 100, scale: 1.2 }] });
  });
  close(pinched, 15 + TUNE.sitAfter, 0.1, 'a pinch');
});

test('a floor tap makes him walk there, clamped to the play area', () => {
  const s = sim();
  let out = s.floorTap(1.2, -1);
  assert.equal(out.state, 'walk');
  assert.equal(out.clip, 'gait');
  assert.equal(out.move.mode, 'goto');
  assert.deepEqual(out.move.goal, { x: 1.2, z: -1 });
  assert.equal(out.move.speed, GAIT.walk);
  s.until((o) => o.state === 'idle', 10);
  assert.ok(dist(s.w.body, { x: 1.2, z: -1 }) <= TUNE.arrive);
  out = s.floorTap(5, 9);
  assert.deepEqual(out.move.goal, { x: BOUNDS.maxX, z: BOUNDS.maxZ });
  out = s.floorTap(-1, 0.5);
  assert.deepEqual(out.move.goal, { x: -1, z: 0.5 }, 'a new floor tap while walking changes the goal');
  // During a reaction a floor tap does nothing.
  const r = sim();
  r.tap();
  out = r.floorTap(1, 1);
  assert.equal(out.state, 'react');
});

test('buttons: Wave and Spook react, Run flees for 3 s, Wander toggles wandering', () => {
  const s = sim();
  let out = s.button('Wave');
  assert.equal(out.state, 'react');
  assert.equal(out.clip, 'Wave');
  assert.equal(out.stress, 0, 'buttons add no stress');
  s.until((o) => o.state === 'idle', 3);
  out = s.button('Spook');
  assert.equal(out.clip, 'Spook');
  s.until((o) => o.state === 'idle', 3);

  s.w.pointer = null;
  out = s.button('Run');
  assert.equal(out.state, 'flee');
  assert.equal(out.move.mode, 'flee');
  assert.equal(out.move.speed, GAIT.run);
  const t0 = s.w.t;
  s.until((o) => o.state !== 'flee', 10);
  close(s.w.t - t0, TUNE.runFor, 2 * DT, 'for 3 s');

  assert.equal(s.w.out.wander, false, 'calm: no wandering');
  out = s.button('Wander');
  assert.equal(out.wander, true);
  s.until((o) => o.state === 'walk', TUNE.idleMax + 1);
  out = s.button('Wander');
  assert.equal(out.wander, false);
  assert.equal(out.state, 'idle', 'a wander walk stops when wandering is turned off');
  out = s.run(10);
  assert.equal(out.state, 'idle');
});

test('buttons are disabled while he is held or falling', () => {
  const s = sim();
  assert.equal(s.w.out.buttonsEnabled, true);
  let out = s.grab();
  assert.equal(out.buttonsEnabled, false);
  for (const b of ['Wave', 'Spook', 'Sit', 'Run', 'Wander']) {
    out = s.button(b);
    assert.equal(out.state, 'held', b);
    assert.equal(out.wander, false);
  }
  out = s.release();
  assert.equal(out.buttonsEnabled, false);
  out = s.button('Sit');
  assert.equal(out.state, 'fall');
  out = s.until((o) => o.state === 'land', 3);
  assert.equal(out.buttonsEnabled, true);
});

test('Screen Time: the first press sits him down with the tablet (SitDown, DeviceSit), the second lies him on his stomach with it (LieDown, DeviceLie), each the way he faced (no turn), the third gets him up (GetUp, idle); device and deviceLabel say which', () => {
  const s = sim({ camera: { x: 0, z: 6 }, yaw: 1.2 });
  let out = s.frame();
  assert.equal(out.device, null);
  assert.equal(out.deviceLabel, 'Screen Time');
  const yaw = s.w.body.yaw;
  /** He faces the way he did, and isn't turned. */
  const kept = (o, msg) => {
    assert.equal(o.move.mode, 'stay', `${msg}: no turn`);
    assert.ok(Math.abs(wrapAngle(s.w.body.yaw - yaw)) < 1e-9, `${msg}: facing as he did`);
  };
  // 1: down with the tablet, at once.
  out = s.button('Device');
  assert.equal(out.state, 'sitDown');
  assert.equal(out.device, 'sit');
  assert.equal(out.deviceLabel, 'Lie Down');
  assert.equal(out.faceCamera, false);
  assert.equal(out.clip, 'SitDown');
  assert.equal(out.restart, true);
  out = s.until(
    (o) => o.state === 'deviceSit',
    3,
    (o) => kept(o, 'sitting down'),
  );
  assert.equal(out.clip, 'DeviceSit');
  assert.equal(out.restart, true);
  assert.equal(out.device, 'sit');
  assert.equal(out.deviceLabel, 'Lie Down');
  assert.equal(out.face, FACE_TRACK.DeviceSit.face);
  assert.equal(out.sitLabel, 'Stand');
  assert.equal(out.buttonsEnabled, true);
  out = s.run(4);
  assert.equal(out.state, 'deviceSit', 'he sits with it until asked');
  kept(out, 'sitting');
  // 2: lies down with it, the way he faces.
  out = s.button('Device');
  assert.equal(out.state, 'lieDown');
  assert.equal(out.clip, 'LieDown');
  assert.equal(out.restart, true);
  assert.equal(out.device, 'lie');
  assert.equal(out.deviceLabel, 'Get Up');
  out = s.until(
    (o) => o.state === 'deviceLie',
    3,
    (o) => kept(o, 'lying down'),
  );
  assert.equal(out.clip, 'DeviceLie');
  assert.equal(out.face, FACE_TRACK.DeviceLie.face);
  out = s.run(3);
  assert.equal(out.state, 'deviceLie');
  kept(out, 'lying');
  // 3: up again.
  out = s.button('Device');
  assert.equal(out.state, 'getUp');
  assert.equal(out.clip, 'GetUp');
  assert.equal(out.device, null);
  assert.equal(out.deviceLabel, 'Screen Time');
  out = s.until((o) => o.state === 'idle', 3);
  assert.equal(out.deviceLabel, 'Screen Time');
  // From plain sitting, the press hands him the tablet where he sits.
  const t = sim({ camera: { x: 0, z: 6 } });
  t.button('Sit');
  t.until((o) => o.state === 'sit', 5);
  out = t.button('Device');
  assert.equal(out.state, 'deviceSit');
  assert.equal(out.clip, 'DeviceSit');
  // Pressed again while he's still sitting down with it: he lies down once he's sat.
  const u = sim({ camera: { x: 0, z: 6 } });
  u.button('Device');
  u.until((o) => o.clip === 'SitDown', 3);
  out = u.button('Device');
  assert.equal(out.deviceLabel, 'Get Up');
  out = u.until((o) => o.state !== 'sitDown', 3);
  assert.equal(out.state, 'lieDown', 'straight on down');
});

test('any other input gets him up from the tablet first (StandUp from DeviceSit, GetUp from DeviceLie), then does it; a grab picks him straight up', () => {
  const seated = () => {
    const s = sim({ camera: { x: 0, z: 6 } });
    s.button('Device');
    s.until((o) => o.state === 'deviceSit', 5);
    return s;
  };
  const lying = () => {
    const s = seated();
    s.button('Device');
    s.until((o) => o.state === 'deviceLie', 5);
    return s;
  };
  for (const [name, make, up] of [
    ['sitting', seated, 'standUp'],
    ['lying', lying, 'getUp'],
  ]) {
    /** @type {Array<[string, (s: any) => any, string]>} */
    const inputs = [
      ['a tap', (s) => s.tap(), 'react'],
      ['a floor tap', (s) => s.floorTap(1, 0.5), 'walk'],
      ['Wave', (s) => s.button('Wave'), 'react'],
      ['Run', (s) => s.button('Run'), 'flee'],
      ['Stand', (s) => s.button('Sit'), 'idle'],
    ];
    for (const [what, act, then] of inputs) {
      const s = make();
      let out = act(s);
      assert.equal(out.state, up, `${name}, ${what}: up first`);
      assert.equal(out.clip, up === 'getUp' ? 'GetUp' : 'StandUp');
      assert.equal(out.device, null);
      out = s.until((o) => o.state !== up, 3);
      assert.equal(out.state, then, `${name}, ${what}: then ${then}`);
    }
    const s = make();
    const out = s.grab();
    assert.equal(out.state, 'held', `${name}: a grab picks him straight up`);
    assert.equal(out.device, null);
  }
});

test('sitLabel flips to Stand whenever he sits, by the button or by himself', () => {
  const s = sim();
  assert.equal(s.w.out.sitLabel, 'Sit');
  let out = s.button('Sit');
  assert.equal(out.state, 'sitDown');
  assert.equal(out.sitLabel, 'Stand');
  out = s.until((o) => o.state === 'sit', 3);
  assert.equal(out.sitLabel, 'Stand');
  out = s.button('Sit');
  assert.equal(out.state, 'standUp');
  assert.equal(out.sitLabel, 'Sit');
  out = s.until((o) => o.state !== 'standUp', 3);
  assert.equal(out.state, 'idle');

  const a = sim({ calm: false, tune: { sitAfter: 3, idleMin: 99, idleMax: 99 } });
  out = a.until((o) => SITTING.includes(o.state), 5);
  assert.equal(out.sitLabel, 'Stand');
  out = a.button('Sit');
  assert.equal(out.state, 'standUp', 'the Stand button gets him up');
});

test('calm: no wandering and no sitting by himself', () => {
  const s = sim({ calm: true });
  const seen = new Set();
  for (let i = 0; i < 40 * 60; i++) seen.add(s.frame().state);
  assert.deepEqual([...seen], ['idle']);
});

test('gait states play the gait blend by move.speed; the others their clip, restarted on entry', () => {
  const s = sim();
  let out = s.frame();
  assert.deepEqual([out.clip, out.move.speed, out.restart], ['gait', 0, false]);
  out = s.floorTap(1, 0);
  assert.deepEqual([out.state, out.clip, out.move.speed, out.restart], ['walk', 'gait', GAIT.walk, false]);
  out = s.button('Run');
  assert.deepEqual([out.state, out.clip, out.move.speed, out.restart], ['flee', 'gait', GAIT.run, false]);
  for (const [b, state, clip] of [
    ['Sit', 'sitDown', 'SitDown'],
    ['Sit', 'standUp', 'StandUp'],
    [null, 'idle', 'gait'],
    ['Wave', 'react', 'Wave'],
  ]) {
    if (!b) {
      out = s.until((o) => o.state === state, 3);
      assert.equal(out.clip, clip);
      continue;
    }
    s.w.body.yaw = 0;
    out = s.button(b);
    assert.deepEqual([out.state, out.clip, out.restart], [state, clip, true], b);
    out = s.frame();
    assert.equal(out.restart, false);
  }
  out = s.button('Wave');
  assert.equal(out.restart, true, 'the same clip again restarts');
});

test('faces follow FACE_TRACK', () => {
  const track = (name, since) => {
    const tr = FACE_TRACK[name];
    let face = tr.face;
    for (const [at, f] of tr.at ?? []) if (since >= at - 1e-6) face = f;
    return { face, blink: face === 'surprised' ? 'none' : tr.blink };
  };
  const GAIT_TRACK = { idle: 'Idle', walk: 'Walk', flee: 'Run' };
  const check = (s, out) => {
    if (out.state === 'held') return;
    let name;
    let since;
    if (out.state === 'react') {
      name = out.reaction;
      since = out.clip === 'gait' ? 0 : s.w.t - s.w.clipStart;
    } else if (out.state === 'sitDown' && out.clip === 'gait') {
      name = 'SitDown'; // (turning to the camera first)
      since = 0;
    } else if (out.clip === 'gait') {
      name = GAIT_TRACK[out.state];
      since = 0;
    } else {
      name = out.clip;
      since = s.w.t - s.w.clipStart;
    }
    const want = track(name, since);
    assert.deepEqual({ face: out.face, blink: out.blink }, want, `${out.state} ${name} at ${since.toFixed(3)}`);
  };
  const s = sim({ yaw: 1.5 });
  const watch = (o) => check(s, o);
  check(s, s.w.out);
  check(s, s.tap());
  s.until((o) => o.state === 'idle', 3, watch);
  check(s, s.button('Spook'));
  const spook = [];
  s.until(
    (o) => o.state === 'idle',
    3,
    (o) => {
      watch(o);
      spook.push(o.face);
    },
  );
  assert.ok(spook.includes('surprised') && spook.includes('neutral'), 'Spook: surprised, then neutral');
  check(s, s.floorTap(1, 0));
  s.until((o) => o.state === 'idle', 5, watch);
  check(s, s.button('Run'));
  s.until((o) => o.state === 'idle', 5, watch);
  s.grab();
  s.run(0.3);
  check(s, s.release());
  s.until((o) => o.state === 'idle', 3, watch);
  check(s, s.button('Sit'));
  s.until((o) => o.state === 'sit', 3, watch);
  s.run(1, { each: () => {} });
  check(s, s.button('Sit'));
  s.until((o) => o.state === 'idle', 3, watch);
});

test('blinks: normal every 2–5 s for 0.12 s, sometimes twice; slow every 3–6 s for 0.25 s; none never', () => {
  const STEP = 1 / 240;
  const blinks = (mode, seconds, seed, base = 'neutral') => {
    const rng = createRng(seed);
    const st = createFaceState();
    const out = [];
    let prev = base;
    let start = 0;
    for (let i = 0; i <= seconds * 240; i++) {
      const t = i * STEP;
      const f = faceStep(st, base, mode, t, rng);
      assert.ok(f === base || f === 'blink');
      if (f === 'blink' && prev !== 'blink') start = t;
      if (f !== 'blink' && prev === 'blink') out.push({ start, length: t - start });
      prev = f;
    }
    return out;
  };
  const groups = (list) => {
    const g = [];
    for (const b of list) {
      const last = g[g.length - 1];
      if (last && b.start - (last[last.length - 1].start + last[last.length - 1].length) < 0.3) last.push(b);
      else g.push([b]);
    }
    return g;
  };
  const normal = blinks('normal', 600, 11);
  for (const b of normal) close(b.length, BLINK.normal.length, STEP + 1e-6, 'a normal blink');
  const ng = groups(normal);
  for (let i = 1; i < ng.length; i++) {
    const gap = ng[i][0].start - ng[i - 1][0].start;
    assert.ok(gap >= 2 - 1e-6 && gap <= 5 + STEP + 1e-6, `normal gap ${gap}`);
  }
  const doubles = ng.filter((g) => g.length === 2).length / ng.length;
  assert.ok(doubles > 0.07 && doubles < 0.25, `${(doubles * 100).toFixed(0)}% double blinks`);
  assert.ok(ng.every((g) => g.length <= 2));

  const slow = blinks('slow', 300, 12, 'happy');
  for (const b of slow) close(b.length, BLINK.slow.length, STEP + 1e-6, 'a slow blink');
  const sg = groups(slow);
  assert.ok(
    sg.every((g) => g.length === 1),
    'no double slow blinks',
  );
  for (let i = 1; i < sg.length; i++) {
    const gap = sg[i][0].start - sg[i - 1][0].start;
    assert.ok(gap >= 3 - 1e-6 && gap <= 6 + STEP + 1e-6, `slow gap ${gap}`);
  }
  assert.deepEqual(blinks('none', 60, 13, 'surprised'), []);
  assert.deepEqual(blinks('normal', 60, 14), blinks('normal', 60, 14), 'seeded');
});

test('snapshot is a plain copy of what the brain is doing', () => {
  const s = sim();
  s.tap();
  const snap = s.brain.snapshot();
  assert.equal(snap.state, 'react');
  assert.ok(['Wave', 'Spook'].includes(snap.reaction));
  assert.ok(snap.stress > 0.9);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  snap.state = 'idle';
  assert.equal(s.brain.snapshot().state, 'react', 'changing the copy changes nothing');
});

test('no random reaction three times in a row (seeded)', () => {
  const picks = (seed) => {
    const s = sim({ seed });
    const list = [];
    for (let i = 0; i < 24; i++) {
      s.tap();
      list.push(s.w.out.clip);
      s.until((o) => o.state === 'idle', 3);
      s.run(2.5);
    }
    return list;
  };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const list = picks(seed);
    assert.ok(list.includes('Wave') && list.includes('Spook'), `seed ${seed}: ${list}`);
    for (let i = 2; i < list.length; i++)
      assert.ok(!(list[i] === list[i - 1] && list[i] === list[i - 2]), `seed ${seed}: ${list.join(' ')}`);
  }
  assert.deepEqual(picks(9), picks(9));
});

// ---- the intro: dialogue mode ---------------------------------------------------------------

/** A box of the intro as main.js hands it to the brain. */
const box = (seq, animation = 'none', face = 'neutral', typing = true) => ({ seq, animation, face, typing });
/** Frames until the intro is under way (turned to the camera, his first box playing). */
const talking = (s) =>
  s.until((o) => o.state === 'talk' && !o.faceCamera && s.brain.snapshot().talk?.phase === 'on', 8);

test('Play Intro: he turns to the camera, and nothing else moves him while it runs', () => {
  const s = sim({ calm: false, yaw: Math.PI, camera: { x: 0, z: 6 } });
  s.w.dialogue = box(1, 'Talk', 'happy');
  const first = s.frame();
  assert.equal(first.state, 'talk');
  assert.equal(first.move.mode, 'face', 'turning to the camera');
  assert.ok(first.faceCamera);
  assert.equal(first.buttonsEnabled, false);
  talking(s);
  assert.ok(Math.abs(wrapAngle(s.w.body.yaw - Math.atan2(0 - s.w.body.x, 6 - s.w.body.z))) <= TUNE.facedEnough + 0.05);
  // (Taps, grabs, floor taps, buttons: nothing. Left 40 s alone he neither wanders nor sits.)
  s.tap();
  s.grab();
  s.floorTap(1, 1);
  for (const b of ['Wave', 'Sit', 'Run', 'Wander']) s.button(b);
  const seen = new Set();
  s.until(
    () => s.w.t > 45,
    50,
    (o) => seen.add(o.state),
  );
  assert.deepEqual([...seen], ['talk']);
  assert.equal(s.w.out.wander, true, 'Wander kept as it was');
  assert.equal(s.w.out.stress, 0);
  assert.ok(dist(s.w.body, { x: 0, z: 0 }) < 0.05, 'never walked off');
});

test('far out from the middle he walks a step in first, then turns to the camera', () => {
  const s = sim({ x: 1.8, z: 1.2, yaw: 0, camera: { x: 0, z: 6 } });
  s.w.dialogue = box(1);
  const o = s.frame();
  assert.equal(o.state, 'talk');
  assert.equal(o.move.mode, 'goto', 'a step in');
  talking(s);
  assert.ok(Math.hypot(s.w.body.x, s.w.body.z) <= TUNE.talkNear + TUNE.arrive + 0.05, 'near the middle');
  // (Toward the middle of the view when it's given, not the play area box's.)
  const withMiddle = createBrain({ bounds: BOUNDS, middle: { x: 0, z: 1 } });
  const out = withMiddle.step({
    t: 0.1,
    dt: DT,
    events: [],
    button: null,
    pointer: null,
    newt: { x: 0, z: 1.2, yaw: 0, grounded: true },
    clip: null,
    carry: null,
    camera: { x: 0, z: 6 },
    dialogue: box(1),
  });
  assert.notEqual(out.move.mode, 'goto', 'near the view’s middle: no walk');
  // (Near the middle already: no walk.)
  const t = sim({ x: 0.3, z: 0.2, camera: { x: 0, z: 6 } });
  t.w.dialogue = box(1);
  assert.notEqual(t.frame().move.mode, 'goto');
});

test('each box: a gesture plays once, then Talk while the line types and Idle after; a loop holds; none keeps it', () => {
  const s = sim({ camera: { x: 0, z: 6 } });
  s.w.dialogue = box(1, 'Nod', 'smug');
  talking(s);
  let o = s.w.out;
  assert.equal(o.clip, 'Nod');
  assert.ok(o.restart || s.brain.snapshot().clip === 'Nod');
  assert.equal(o.face, 'smug');
  assert.equal(o.blink, 'none', 'blinks on neutral only');
  assert.deepEqual(o.look, { mode: 'camera', weight: 1 });
  o = s.until((x) => x.clip !== 'Nod', CLIPS.Nod.length + 0.5);
  assert.equal(o.clip, 'Talk', 'Talk while it types');
  s.w.dialogue = box(1, 'Nod', 'smug', false);
  o = s.frame();
  assert.equal(o.clip, 'gait', 'Idle once the line is up');
  // (The same box again is no new gesture.)
  s.run(1);
  assert.equal(s.w.out.clip, 'gait');
  // A loop holds, typing or not.
  s.w.dialogue = box(2, 'Think', 'neutral', true);
  o = s.frame();
  assert.equal(o.clip, 'Think');
  assert.ok(o.restart);
  assert.equal(o.blink, 'normal');
  s.w.dialogue = box(2, 'Think', 'neutral', false);
  s.run(3);
  assert.equal(s.w.out.clip, 'Think', 'held');
  // None keeps what he does.
  s.w.dialogue = box(3, 'none', 'sad', true);
  o = s.frame();
  assert.equal(o.clip, 'Think');
  assert.equal(o.face, 'sad');
  // A gesture after a loop: once, then Talk.
  s.w.dialogue = box(4, 'Cheer', 'happy', true);
  assert.equal(s.frame().clip, 'Cheer');
  o = s.until((x) => x.clip !== 'Cheer', CLIPS.Cheer.length + 0.5);
  assert.equal(o.clip, 'Talk');
});

test('every animation a box may ask for (clips.js DIALOGUE_CLIPS: every clip) plays from it, on its own and one after another', () => {
  assert.deepEqual([...DIALOGUE_CLIPS].sort(), Object.keys(CLIPS).sort(), 'every clip');
  // (What each shows as from the box's first frame: Idle as the gait; Sit, Sit Down and the
  // tablet's sit by sitting down first; lying with it by sitting down, then lying down; Stand Up
  // and Get Up keep what he does when he's on his feet, Talk while the line types; the rest as
  // themselves.)
  const first = (a) =>
    a === 'Idle'
      ? 'gait'
      : a === 'StandUp' || a === 'GetUp'
        ? 'Talk'
        : a === 'Sit' || a === 'SitDown' || a === 'DeviceSit' || a === 'LieDown' || a === 'DeviceLie'
          ? 'SitDown'
          : a;
  // (What each holds once it's under way, the line still typing.)
  const holds = (a) =>
    ({
      Idle: 'gait',
      StandUp: 'Talk',
      GetUp: 'Talk',
      SitDown: 'Sit',
      LieDown: 'DeviceLie',
      Fall: 'Talk',
      Land: 'Talk',
    })[a] ?? (CLIPS[a].loop ? a : 'Talk');
  for (const a of DIALOGUE_CLIPS) {
    const s = sim({ camera: { x: 0, z: 6 } });
    s.w.dialogue = box(1, a, 'neutral', true);
    talking(s);
    assert.equal(s.w.out.clip, first(a), `${a}: from the box's first frame`);
    s.until((o) => o.clip === holds(a), 6);
    s.run(1.5);
    assert.equal(s.w.out.clip, holds(a), `${a}: held while the line types`);
    assert.equal(s.w.out.state, 'talk');
  }
  // Each after the one before (a loop, a gesture under way, sitting, lying, dangling): each new
  // box's plays.
  const s = sim({ camera: { x: 0, z: 6 } });
  s.w.dialogue = box(0, 'none');
  talking(s);
  for (const [i, a] of [...DIALOGUE_CLIPS, ...DIALOGUE_CLIPS.slice().reverse()].entries()) {
    const typing = i % 2 === 0;
    s.w.dialogue = box(i + 1, a, 'happy', typing);
    const want = holds(a) === 'Talk' && a !== 'Talk' && !typing ? 'gait' : holds(a);
    // (Stand Up and Get Up only get him up: on his feet, he keeps what he was doing.)
    const up = ['SitDown', 'Sit', 'DeviceSit', 'LieDown', 'DeviceLie', 'StandUp', 'GetUp'];
    if (a === 'StandUp' || a === 'GetUp') s.until((o) => !up.includes(o.clip), 8);
    else s.until((o) => o.clip === want, 8);
    s.run(0.2);
  }
});

test('in a box: Sit Down sits him and holds it; the tablet’s sit and lie hold with their way down and up (SitDown, LieDown; StandUp, GetUp); Stand Up and Get Up only get him up; Fall is a hop, then Land', () => {
  const s = sim({ camera: { x: 0, z: 6 } });
  const went = [];
  const seen = (o) => went[went.length - 1] !== o.clip && went.push(o.clip);
  s.w.dialogue = box(1, 'StandUp');
  talking(s);
  s.run(0.5);
  assert.equal(s.w.out.clip, 'Talk', 'on his feet, Stand Up keeps what he does');
  s.w.dialogue = box(2, 'DeviceLie');
  s.until((o) => o.clip === 'DeviceLie', 6, seen);
  assert.deepEqual(went, ['SitDown', 'LieDown', 'DeviceLie'], 'down, then lying with it');
  went.length = 0;
  s.w.dialogue = box(3, 'DeviceSit');
  s.until((o) => o.clip === 'DeviceSit', 8, seen);
  assert.deepEqual(went, ['GetUp', 'SitDown', 'DeviceSit'], 'up from lying, then sat with it');
  went.length = 0;
  s.w.dialogue = box(4, 'Sit');
  s.until((o) => o.clip === 'Sit', 3, seen);
  assert.deepEqual(went, ['Sit'], 'sitting already: a crossfade');
  went.length = 0;
  s.w.dialogue = box(5, 'LieDown');
  s.until((o) => o.clip === 'DeviceLie', 6, seen);
  assert.deepEqual(went, ['LieDown', 'DeviceLie'], 'Lie Down from sitting: lies down and holds it');
  went.length = 0;
  s.w.dialogue = box(6, 'GetUp');
  s.until((o) => o.clip === 'Talk', 6, seen);
  assert.deepEqual(went, ['GetUp', 'Talk'], 'Get Up from lying');
  went.length = 0;
  s.w.dialogue = box(7, 'SitDown');
  s.until((o) => o.clip === 'Sit', 6, seen);
  assert.deepEqual(went, ['SitDown', 'Sit'], 'Sit Down sits him and holds it');
  went.length = 0;
  s.w.dialogue = box(8, 'Held');
  s.until((o) => o.clip === 'Held', 6, seen);
  assert.deepEqual(went, ['StandUp', 'Held'], 'up from sitting, then dangling');
  went.length = 0;
  s.w.dialogue = box(9, 'Fall');
  s.until((o) => o.clip === 'Talk', 6, seen);
  assert.deepEqual(went, ['Fall', 'Land', 'Talk'], 'a hop, then the landing');
  // The intro over while he lies with the tablet: up first (GetUp), then back to play.
  const t = sim({ camera: { x: 0, z: 6 } });
  t.w.dialogue = box(1, 'DeviceLie');
  talking(t);
  t.until((o) => o.clip === 'DeviceLie', 6);
  t.w.dialogue = null;
  const out = t.frame();
  assert.equal(out.state, 'getUp');
  t.until((o) => o.state === 'idle', 3);
});

test('a Sit box sits him down and holds it; the next gesture gets him up first; sitting at Play Intro, he stands', () => {
  const s = sim({ camera: { x: 0, z: 6 } });
  s.w.dialogue = box(1, 'Sit');
  talking(s);
  assert.equal(s.w.out.clip, 'SitDown');
  s.until((x) => x.clip === 'Sit', 3);
  s.run(2);
  assert.equal(s.w.out.clip, 'Sit', 'held');
  s.w.dialogue = box(2, 'Wave', 'happy');
  assert.equal(s.frame().clip, 'StandUp', 'up first');
  let o = s.until((x) => x.clip === 'Wave', 3);
  assert.equal(o.face, 'happy');
  // Sitting when the intro starts: up first, then on.
  const t = sim({ camera: { x: 0, z: 6 } });
  t.button('Sit');
  t.until((x) => x.state === 'sit', 5);
  t.w.dialogue = box(1, 'Talk');
  o = t.frame();
  assert.equal(o.state, 'talk');
  assert.equal(o.clip, 'StandUp');
  talking(t);
  assert.equal(t.w.out.clip, 'Talk');
});

test('the end: he’s back to free play, standing up first if a box sat him down', () => {
  const s = sim({ calm: false, camera: { x: 0, z: 6 } });
  s.w.dialogue = box(1, 'Talk');
  talking(s);
  s.run(1);
  s.w.dialogue = null;
  let o = s.frame();
  assert.equal(o.state, 'idle');
  assert.equal(o.buttonsEnabled, true);
  assert.ok(s.brain.snapshot().aloneFor < 1, 'not left alone all that time: he won’t sit at once');
  o = s.tap();
  assert.equal(o.state, 'react', 'taps work again');

  const t = sim({ camera: { x: 0, z: 6 } });
  t.w.dialogue = box(1, 'Sit');
  talking(t);
  t.until((x) => x.clip === 'Sit', 3);
  t.w.dialogue = null;
  o = t.frame();
  assert.equal(o.state, 'standUp');
  t.until((x) => x.state === 'idle', 3);
});

test('talkReady once he’s in place: getting up, walking in and turning he keeps his own face; then the box’s, and its gesture', () => {
  // Far out: the walk in, then the turn.
  const s = sim({ x: 1.8, z: 1.2, yaw: 0, camera: { x: 0, z: 6 } });
  s.w.dialogue = box(1, 'Spook', 'surprised');
  let o = s.frame();
  const phases = new Set();
  while (s.brain.snapshot().talk?.phase !== 'on' && s.w.t < 8) {
    phases.add(s.brain.snapshot().talk?.phase);
    assert.equal(o.talkReady, false, `not ready while ${s.brain.snapshot().talk?.phase}`);
    assert.notEqual(o.face, 'surprised', 'the box’s face waits for its line');
    assert.notEqual(o.clip, 'Spook', 'and so does its gesture');
    o = s.frame();
  }
  assert.ok(phases.has('walk'), [...phases].join(' '));
  assert.equal(o.talkReady, true, 'ready the frame he’s turned');
  assert.equal(o.face, 'surprised');
  assert.equal(o.clip, 'Spook', 'its gesture starts with it');
  // Sitting: up first, never ready on the way.
  const t = sim({ camera: { x: 0, z: 6 } });
  t.button('Sit');
  t.until((x) => x.state === 'sit', 5);
  t.w.dialogue = box(1, 'Nod', 'smug');
  o = t.frame();
  assert.equal(o.clip, 'StandUp');
  assert.equal(o.talkReady, false);
  assert.notEqual(o.face, 'smug');
  o = t.until((x) => x.talkReady, 5);
  assert.equal(o.face, 'smug');
  // Out of the intro: never ready.
  assert.equal(sim({}).frame().talkReady, false);
});

test('a box the page holds back (seq −1: its line waits on the envelope) keeps him in place idle with his own face; its face and gesture come with it', () => {
  const s = sim({ camera: { x: 0, z: 6 } });
  s.w.dialogue = box(-1, 'none', 'surprised', false);
  let o = s.until((x) => x.talkReady, 5);
  for (let i = 0; i < 60; i++) {
    assert.notEqual(o.face, 'surprised', 'his own face while it waits');
    assert.equal(o.clip, 'gait', 'idle, no gesture');
    assert.equal(o.talkReady, true);
    o = s.frame();
  }
  s.w.dialogue = box(0, 'Spook', 'surprised');
  o = s.frame();
  assert.equal(o.face, 'surprised', 'the box’s face with its line');
  assert.equal(o.clip, 'Spook', 'and its gesture');
});

test('held or falling, Play Intro waits until he’s down', () => {
  const s = sim({ camera: { x: 0, z: 6 } });
  s.grab();
  s.w.dialogue = box(1, 'Talk');
  assert.equal(s.frame().state, 'held');
  s.release();
  s.until((o) => o.state === 'talk', 5);
});

test('the play area shrunk under him (a resize) as he stands: he walks back inside it, onto what’s on screen, calm or not; inside it, he stays put', () => {
  for (const calm of [true, false]) {
    /** @type {import('../src/invitation/types.js').Bounds} */
    const area = playArea(5);
    const brain = createBrain({ seed: 3, calm, bounds: area });
    let body = { x: 0.3, z: -4.5, yaw: Math.PI, speed: 0 };
    let t = 0;
    const step = () => {
      t += DT;
      const out = brain.step({
        t,
        dt: DT,
        events: [],
        button: null,
        pointer: null,
        newt: { x: body.x, z: body.z, yaw: body.yaw, grounded: true },
        clip: null,
        carry: null,
        camera: null,
        dialogue: null,
      });
      body = steer(body, out.move, null, area, DT);
      return out;
    };
    for (let i = 0; i < 60; i++) {
      step();
      assert.ok(dist(body, { x: 0.3, z: -4.5 }) < 1e-9, `calm ${calm}: inside, he stays put`);
    }
    // The window shrinks: the play area's smaller than where he stands, what's on screen nearer the middle.
    Object.assign(area, playArea(4));
    area.sight = { minX: -1, maxX: 1, minZ: -3, maxZ: 1 };
    const states = [];
    for (let i = 0; i < 12 * 60; i++) states.push(step().state);
    assert.ok(states.slice(0, 3).includes('walk'), `calm ${calm}: he sets off back at once (${states.slice(0, 3)})`);
    assert.ok(Math.hypot(body.x, body.z) <= 4 + 1e-6, `calm ${calm}: back inside ${JSON.stringify(body)}`);
    assert.ok(dist(clampTo(area.sight, body), body) < 0.1, `calm ${calm}: on screen ${JSON.stringify(body)}`);
    if (calm) assert.equal(states.at(-1), 'idle', 'then he stands');
  }
});
