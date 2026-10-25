// What NEWT feels from the user's hand while he's held (carry.js createHand, handStep, handFeel,
// read by the brain): being shaken means being shaken back and forth, never one fast move or a
// hiccup in the pointer's events. A single fast flick (260 px in half a second) is no shake, so
// no "Too much!"; a ±40 px shake at 4–6 Hz is one within 0.4 s of its start; a pointer whose
// events stall for a quarter of a second while the frames keep coming (a slow lift) isn't a jolt:
// the gap starts the tracker over from where the pointer is when it comes back. And his stress
// comes from rough handling (a hard shake, fast flings, being dropped from high), never from being
// carried about gently: a long slow carry leaves him well under the flee line. Each is driven
// frame by frame as main.js drives the hand, with the brain reading it, at the CSS px a world unit
// spans where he hangs in the toy's default desktop (1280x800) and phone (390x844) views.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HAND, createHand, handFeel, handStep } from '../src/invitation/carry.js';
import { TUNE, createBrain } from '../src/invitation/brain.js';
import { CUES } from '../src/invitation/cues.js';

/** CSS px a world unit across the screen where he hangs (main.js pxPerUnit) in the default views. */
const PPU = { desktop: 171, phone: 109 };
const START = { x: 640, y: 420 };

/**
 * NEWT held from t = 0 for `seconds`, the pointer at `path(t)` (client px). The pointer's spot is
 * sampled every `every`th frame at `fps` (a 60 Hz pointer on a faster screen), and not at all
 * while `stalled(t)` (its events stop; the frames keep coming). Returns every frame's time, face,
 * stress and what the hand reads.
 * @param {(t: number) => {x: number, y: number}} path
 * @param {{seconds: number, ppu: number, fps?: number, every?: number, stalled?: (t: number) => boolean, brain?: ReturnType<typeof createBrain>}} o
 */
function heldBy(
  path,
  { seconds, ppu, fps = 60, every = 1, stalled = () => false, brain = createBrain({ seed: 3, calm: true }) },
) {
  const dt = 1 / fps;
  const still = { button: null, pointer: null, clip: null };
  brain.step({ ...still, t: 0, dt, events: [], newt: { x: 0, z: 0, yaw: 0, grounded: true }, carry: null });
  let px = path(0);
  const hand = createHand(px, dt);
  const out = [];
  for (let i = 1; i <= Math.round(seconds * fps); i++) {
    const t = dt + i * dt;
    if (i % every === 0 && !stalled(t)) px = path(t);
    handStep(hand, { ...px }, dt, t, ppu);
    const o = brain.step({
      ...still,
      t,
      dt,
      events: i === 1 ? [{ type: 'grab', on: 'newt', x: px.x, y: px.y, t }] : [],
      // (The pointer's spot on the floor, about under him as it carries him.)
      pointer: { x: (px.x - START.x) / ppu, z: 0 },
      newt: { x: 0, z: 0, yaw: 0, grounded: false },
      carry: i === 1 ? null : handFeel(hand),
    });
    out.push({ t, face: o.face, state: o.state, stress: brain.snapshot().stress, feel: handFeel(hand), hand });
  }
  return out;
}

/** A move from 0 to 1 over [0, 1]: steady, or eased in and out (a hand's flick). */
const EASES = {
  steady: (/** @type {number} */ u) => Math.min(1, Math.max(0, u)),
  eased: (/** @type {number} */ u) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2,
};

/** Every screen, frame rate and pointer rate the hand is read at. */
const RIGS = [
  { screen: 'desktop', fps: 60, every: 1 },
  { screen: 'desktop', fps: 144, every: 2 },
  { screen: 'phone', fps: 60, every: 1 },
  { screen: 'phone', fps: 120, every: 2 },
];

/** Every flick: steady or eased, in half a second or a quarter, across, up or slantwise, with a 12 px bounce back as the hand stops or none. */
const FLICKS = RIGS.flatMap((rig) =>
  Object.entries(EASES).flatMap(([ease, f]) =>
    [0.5, 0.25].flatMap((len) =>
      Object.entries({ across: [1, 0], up: [0, -1], diagonal: [0.71, -0.71] }).flatMap(([way, d]) =>
        [0, 12].map((bounce) => ({ rig, ease, f, len, way, d, bounce })),
      ),
    ),
  ),
);

test('a single fast flick (260 px in half a second, or in a quarter) is no shake: no "Too much!", no stress from shaking, whichever way it goes', () => {
  for (const { rig, ease, f, len, way, d, bounce } of FLICKS) {
    const tag = `${rig.screen} at ${rig.fps} fps, ${ease}, 260 px ${way} in ${len} s${bounce ? ', a 12 px bounce back' : ''}`;
    // (Held still for a second, the flick, a small bounce back as the hand stops, then still.)
    const frames = heldBy(
      (t) => {
        const k = 260 * f((t - 1) / len) - bounce * EASES.eased((t - 1 - len) / 0.12);
        return { x: START.x + d[0] * k, y: START.y + d[1] * k };
      },
      { seconds: 3, ppu: PPU[rig.screen], fps: rig.fps, every: rig.every },
    );
    for (const fr of frames) {
      assert.notEqual(fr.face, 'surprised', `${tag}: shaken at ${fr.t.toFixed(3)} s`);
      assert.ok(fr.feel.shake < TUNE.shakeSoft, `${tag}: shake ${fr.feel.shake.toFixed(1)} at ${fr.t.toFixed(3)} s`);
    }
    const fastest = Math.max(...frames.map((fr) => fr.feel.dragSpeed * CUES.dragPx));
    assert.ok(fastest > 400, `${tag}: it was fast (${fastest.toFixed(0)} px/s)`);
  }
});

test('a real shake, ±40 px at 4–6 Hz, across or up and down, is one within 0.4 s of its start', () => {
  for (const rig of RIGS)
    for (const hz of [4, 5, 6])
      for (const [way, d] of Object.entries({ across: [1, 0], 'up and down': [0, 1] })) {
        const tag = `${rig.screen} at ${rig.fps} fps, ${hz} Hz ${way}`;
        const frames = heldBy(
          (t) => {
            const k = t > 1 ? 40 * Math.sin(2 * Math.PI * hz * (t - 1)) : 0;
            return { x: START.x + d[0] * k, y: START.y + d[1] * k };
          },
          { seconds: 2, ppu: PPU[rig.screen], fps: rig.fps, every: rig.every },
        );
        const first = frames.find((fr) => fr.face === 'surprised');
        assert.ok(first, `${tag}: shaken`);
        assert.ok(first.t > 1 && first.t <= 1.4, `${tag}: shaken at ${first.t.toFixed(3)} s`);
        assert.ok(frames.at(-1).feel.shake >= TUNE.shakeHard, `${tag}: still shaking at the end`);
      }
});

test('a pointer whose events stall for a quarter of a second during a slow lift is no shake: the gap starts the tracker over where the pointer comes back', () => {
  for (const rig of RIGS)
    for (const [gap, at] of [
      [0.25, 1],
      [0.15, 0.6],
      [0.3, 1.4],
    ]) {
      const tag = `${rig.screen} at ${rig.fps} fps, ${gap} s from ${at} s`;
      // (Lifted slowly, 120 px/s up and 30 across; the events stop for `gap` s, then come back
      // where the pointer has got to.)
      const lift = (/** @type {number} */ t) => ({ x: START.x + 30 * t, y: START.y - 120 * t });
      const frames = heldBy(lift, {
        seconds: 2.5,
        ppu: PPU[rig.screen],
        fps: rig.fps,
        every: rig.every,
        stalled: (t) => t >= at && t < at + gap,
      });
      for (const fr of frames) {
        assert.notEqual(fr.face, 'surprised', `${tag}: shaken at ${fr.t.toFixed(3)} s`);
        assert.ok(fr.feel.shake < TUNE.shakeSoft, `${tag}: shake ${fr.feel.shake.toFixed(1)} at ${fr.t.toFixed(3)} s`);
        // (No jolt in the drag speed either: never much faster than the lift itself.)
        assert.ok(
          fr.feel.dragSpeed * CUES.dragPx < 1.3 * Math.hypot(30, 120),
          `${tag}: ${(fr.feel.dragSpeed * CUES.dragPx).toFixed(0)} px/s at ${fr.t.toFixed(3)} s`,
        );
      }
    }
  // The hand once the pointer comes back from a gap: on it, at rest, as if just grabbed there.
  const h = createHand({ x: 0, y: 0 }, 0);
  const DT = 1 / 60;
  let t = 0;
  for (let i = 0; i < 30; i++) handStep(h, { x: 0, y: -2 * i }, DT, (t += DT), 100);
  for (let i = 0; i < Math.ceil(HAND.gap / DT) + 2; i++) handStep(h, { x: 0, y: -58 }, DT, (t += DT), 100);
  handStep(h, { x: 0, y: -90 }, DT, t + DT, 100);
  assert.deepEqual(h.drive, { x: 0, y: -90 }, 'back on the pointer');
  assert.deepEqual(h.vel, { x: 0, y: 0 }, 'at rest');
  assert.ok(HAND.gap >= 0.08 && HAND.gap <= 0.15, `a gap is ${HAND.gap} s without a sample`);
});

/**
 * Let go at `t0` (the brain's last step): he falls for `fall` s and lands. The states he goes
 * through over the next 4 s (repeats dropped) and his stress as he lands.
 * @param {ReturnType<typeof createBrain>} brain
 * @param {number} t0
 * @param {number} fall
 */
function letGo(brain, t0, fall) {
  const dt = 1 / 60;
  /** @type {string[]} */
  const states = [];
  let landed = NaN;
  for (let i = 1; i <= Math.round((fall + 4) / dt); i++) {
    const t = t0 + i * dt;
    const o = brain.step({
      t,
      dt,
      events: i === 1 ? [{ type: 'release', on: 'newt', x: 0, y: 0, t }] : [],
      button: null,
      pointer: null,
      clip: null,
      newt: { x: 0, z: 0, yaw: 0, grounded: t - t0 > fall },
      carry: null,
    });
    if (o.state === 'land' && Number.isNaN(landed)) landed = brain.snapshot().stress;
    if (states.at(-1) !== o.state) states.push(o.state);
  }
  return { states, landed };
}

/** A fall from about where he hangs (his feet just off the floor), and one from up high (carry.js CARRY.liftMax). */
const LOW_FALL = 0.1;
const HIGH_FALL = 0.86;

test('a long gentle carry (10 s about the screen at 140 px/s at most) leaves him well under the flee line, and he lands calm', () => {
  for (const screen of /** @type {const} */ (['desktop', 'phone'])) {
    // (Side to side and up and down at once: 108 px/s across at most and 80 up, 134 together.)
    const brain = createBrain({ seed: 3, calm: true });
    const frames = heldBy((t) => ({ x: START.x + 90 * Math.sin(1.2 * t), y: START.y - 40 * Math.sin(2 * t) }), {
      seconds: 10,
      ppu: PPU[screen],
      brain,
    });
    const most = Math.max(...frames.map((f) => f.stress));
    assert.ok(most < 0.25 * TUNE.stressFlee, `${screen}: stress ${most.toFixed(2)} (he flees at ${TUNE.stressFlee})`);
    assert.ok(
      frames.some((f) => f.feel.dragSpeed * CUES.dragPx > 120),
      `${screen}: carried about`,
    );
    assert.ok(Math.max(...frames.map((f) => f.feel.dragSpeed * CUES.dragPx)) <= 140, `${screen}: gently`);
    assert.ok(
      frames.every((f) => f.face !== 'surprised'),
      `${screen}: never shaken`,
    );
    const { states } = letGo(brain, frames.at(-1).t, LOW_FALL);
    assert.deepEqual(states, ['fall', 'land', 'idle'], `${screen}: lands calm`);
  }
});

test('rough handling stresses him: a hard shake (he flees once he lands), fast flings, and a drop from high, but not a low one', () => {
  for (const screen of /** @type {const} */ (['desktop', 'phone'])) {
    // Shaken hard (±40 px at 5 Hz) for 2 s: past the flee line; let go, he lands and runs.
    const shaker = createBrain({ seed: 3, calm: true });
    const shaken = heldBy(
      (t) => ({ x: START.x + (t > 0.5 ? 40 * Math.sin(2 * Math.PI * 5 * (t - 0.5)) : 0), y: START.y }),
      { seconds: 2.5, ppu: PPU[screen], brain: shaker },
    );
    assert.ok(shaken.at(-1).stress >= TUNE.stressFlee, `${screen}: shaken, stress ${shaken.at(-1).stress.toFixed(2)}`);
    assert.deepEqual(letGo(shaker, shaken.at(-1).t, LOW_FALL).states, ['fall', 'land', 'flee'], `${screen}: shaken`);

    // Flung 300 px across in a quarter of a second, three times, back and forth with half a
    // second's pause between (no shake: the turns are far apart): stress from the flings alone.
    const flings = (/** @type {number} */ k) => (/** @type {number} */ t) => {
      const n = Math.min(2, Math.floor(t / (0.75 * k)));
      const e = EASES.eased((t - 0.75 * k * n) / (0.25 * k));
      return { x: START.x - 150 + 300 * (n % 2 ? 1 - e : e), y: START.y };
    };
    const flung = heldBy(flings(1), { seconds: 3, ppu: PPU[screen] });
    const fast = Math.max(...flung.map((f) => f.feel.dragSpeed * CUES.dragPx));
    assert.ok(fast > 1000, `${screen}: flung at ${fast.toFixed(0)} px/s`);
    assert.ok(
      flung.every((f) => f.face !== 'surprised'),
      `${screen}: flings aren't a shake`,
    );
    const most = Math.max(...flung.map((f) => f.stress));
    assert.ok(most >= 1, `${screen}: three flings, stress ${most.toFixed(2)}`);
    // (Slowed down nine times over, the same path is a carry at 210 px/s at most: no stress.)
    const carried = heldBy(flings(9), { seconds: 3 * 9, ppu: PPU[screen] });
    assert.ok(Math.max(...carried.map((f) => f.stress)) < 0.01, `${screen}: carried the same way slowly`);
  }
  // Dropped from high (his feet about four of his heights up), stress as he lands; from where he
  // hangs, none.
  for (const [fall, want] of [
    [HIGH_FALL, (/** @type {number} */ s) => s >= 1],
    [LOW_FALL, (/** @type {number} */ s) => s === 0],
  ]) {
    const brain = createBrain({ seed: 3, calm: true });
    const held = heldBy(() => START, { seconds: 1, ppu: PPU.desktop, brain });
    assert.equal(held.at(-1).stress, 0, 'held still: no stress');
    const { landed } = letGo(brain, held.at(-1).t, fall);
    assert.ok(want(landed), `a ${fall} s fall: stress ${landed} as he lands`);
  }
});
