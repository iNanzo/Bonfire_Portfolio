// The envelope that opens /invitation/ (src/invitation/envelope.js, pure): its states (floating
// until opened or skipped; opening while the seal cracks and the flap lifts; waiting when it's
// open before NEWT is in; fading as it pushes toward the camera and dithers out; gone, or
// skipped), how a drag on it reads (a swipe up opens it, a swipe down skips: far enough or a fast
// flick, and mostly up or down), the keys (Enter, Space and ArrowUp open; Escape and ArrowDown
// skip), how it follows a finger with some give while the flap lifts, the live hint while
// dragging, and the opening as functions of time (reduced motion: no bob, the flap snaps open, a
// short crossfade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOB,
  ENVELOPE_TEXT,
  FLAP_OPEN,
  SWAY,
  SWIPE,
  TIMES,
  createEnvelope,
  dragHint,
  dragPose,
  envelopeGesture,
  envelopeKey,
} from '../src/invitation/envelope.js';

test('a swipe up opens it and a swipe down skips: |dy| past max(48 px, 12% of the height), mostly up or down', () => {
  const tall = 844; // (12%: 101 px)
  assert.equal(envelopeGesture(0, -120, 600, tall), 'open', 'far enough up, slowly');
  assert.equal(envelopeGesture(10, 130, 600, tall), 'skip', 'far enough down');
  assert.equal(envelopeGesture(0, -90, 600, tall), 'none', 'under 12% of a tall screen, slowly');
  const short = 300; // (12%: 36 px, so 48 px counts)
  assert.equal(envelopeGesture(0, -50, 900, short), 'open');
  assert.equal(envelopeGesture(0, -44, 900, short), 'none', 'never under 48 px');
  // Mostly sideways: neither.
  assert.equal(envelopeGesture(200, -150, 400, tall), 'none', '|dy| must beat 1.2·|dx|');
  assert.equal(envelopeGesture(100, -130, 400, tall), 'open', '130 > 120');
  assert.equal(envelopeGesture(-300, 0, 300, tall), 'none', 'a sideways drag');
  assert.equal(envelopeGesture(0, 0, 50, tall), 'none', 'a press');
  assert.ok(SWIPE.min === 48 && SWIPE.share === 0.12 && SWIPE.ratio === 1.2);
});

test('a fast flick counts: 0.6 px/ms or more with |dy| of 24 px or more', () => {
  const h = 844;
  assert.equal(envelopeGesture(0, -30, 40, h), 'open', '0.75 px/ms');
  assert.equal(envelopeGesture(0, 30, 45, h), 'skip', '0.67 px/ms down');
  assert.equal(envelopeGesture(0, -30, 100, h), 'none', '0.3 px/ms is a slow drag');
  assert.equal(envelopeGesture(0, -20, 10, h), 'none', 'too short however fast');
  assert.equal(envelopeGesture(0, -24, 40, h), 'open', 'exactly 24 px at 0.6 px/ms');
  assert.equal(envelopeGesture(30, -30, 40, h), 'none', 'a fast diagonal');
  assert.equal(envelopeGesture(0, -30, 0, h), 'open', 'no time at all: as fast as can be');
  assert.ok(SWIPE.flick === 0.6 && SWIPE.flickMin === 24);
});

test('the keys: Enter, Space and ArrowUp open it; Escape and ArrowDown skip; the rest do nothing', () => {
  for (const k of ['Enter', ' ', 'ArrowUp']) assert.equal(envelopeKey(k), 'open', k);
  for (const k of ['Escape', 'ArrowDown']) assert.equal(envelopeKey(k), 'skip', k);
  for (const k of ['Tab', 'a', 'ArrowLeft', 'Shift', '']) assert.equal(envelopeKey(k), null, k);
});

test('it floats until opened, cracks and lifts, waits for NEWT if he isn’t in, then fades and is gone', () => {
  const e = createEnvelope();
  assert.equal(e.state, 'floating');
  assert.equal(e.step(5, true), 'floating', 'floating stays until it’s opened');
  assert.equal(e.open(10), true);
  assert.equal(e.state, 'opening');
  assert.equal(e.open(10.1), false, 'a second open does nothing');
  assert.equal(e.step(10 + TIMES.opening / 2, false), 'opening');
  assert.equal(e.step(10 + TIMES.opening, false), 'waiting', 'open before he is in: it waits');
  assert.equal(e.step(12, false), 'waiting');
  assert.equal(e.covers, true, 'it still covers the toy while it waits');
  assert.equal(e.step(13, true), 'fading', 'he’s in: it fades');
  assert.equal(e.covers, false, 'the toy shows through as it fades');
  assert.equal(e.skip(13.1), false, 'a skip while it fades does nothing (the intro is under way)');
  assert.equal(e.done(13 + TIMES.fade - 0.01), false);
  assert.equal(e.step(13 + TIMES.fade, true), 'gone');
  assert.equal(e.done(13 + TIMES.fade), true);
  assert.equal(e.opened, true);
});

test('opened when NEWT is already in, it goes straight from opening to fading', () => {
  const e = createEnvelope();
  e.open(0);
  assert.equal(e.step(TIMES.opening, true), 'fading');
  assert.equal(e.step(TIMES.opening + TIMES.fade, true), 'gone');
});

test('a skip leaves it from floating, opening or waiting; it drops away and is done; nothing opens it again', () => {
  for (const before of ['floating', 'opening', 'waiting']) {
    const e = createEnvelope();
    if (before !== 'floating') e.open(0);
    if (before === 'waiting') e.step(TIMES.opening, false);
    assert.equal(e.state, before);
    assert.equal(e.skip(2), true, before);
    assert.equal(e.state, 'skipped');
    assert.equal(e.covers, false);
    assert.equal(e.opened, false, 'skipped is not opened');
    assert.equal(e.open(2.1), false, 'no opening after a skip');
    assert.equal(e.step(2.2, true), 'skipped');
    assert.equal(e.done(2 + TIMES.skip - 0.01), false);
    assert.equal(e.done(2 + TIMES.skip), true);
  }
});

test('the opening over time: the seal cracks first, the flap lifts to FLAP_OPEN, then it pushes toward the camera and dithers out', () => {
  const e = createEnvelope();
  const p0 = e.pose(0);
  assert.equal(p0.crack, 0);
  assert.equal(p0.flap, 0);
  assert.equal(p0.push, 0);
  assert.equal(p0.fade, 0);
  e.open(1);
  let crack = 0;
  let flap = 0;
  for (let t = 1; t <= 1 + TIMES.opening + 1e-9; t += 0.02) {
    const p = e.pose(t);
    assert.ok(p.crack >= crack - 1e-9 && p.crack <= 1, `the crack only grows: ${t}`);
    assert.ok(p.flap >= flap - 1e-9 && p.flap <= FLAP_OPEN + 1e-9, `the flap only lifts: ${t}`);
    crack = p.crack;
    flap = p.flap;
    assert.equal(p.push, 0, 'no push before the fade');
  }
  assert.ok(e.pose(1 + TIMES.crack).crack > 0.99, 'cracked by TIMES.crack');
  assert.ok(e.pose(1 + TIMES.crack / 2).flap < FLAP_OPEN / 2, 'the flap is still low while the seal cracks');
  assert.ok(Math.abs(e.pose(1 + TIMES.opening).flap - FLAP_OPEN) < 1e-6, 'fully open by the end');
  assert.ok(FLAP_OPEN > Math.PI * 0.8 && FLAP_OPEN <= Math.PI, 'it folds right back');
  e.step(1 + TIMES.opening, true);
  let push = 0;
  let fade = 0;
  for (let t = 1 + TIMES.opening; t <= 1 + TIMES.opening + TIMES.fade + 1e-9; t += 0.02) {
    const p = e.pose(t);
    assert.ok(p.push >= push - 1e-9 && p.fade >= fade - 1e-9, `push and fade only grow: ${t}`);
    push = p.push;
    fade = p.fade;
  }
  const end = e.pose(1 + TIMES.opening + TIMES.fade);
  assert.ok(end.push > 0.99 && end.fade > 0.99, 'pushed and dithered out by the end');
  assert.equal(end.crossfade, false, 'dithered, not a crossfade');
});

test('it bobs ±0.03 and sways ±8°, gently; waiting, it pulses', () => {
  const e = createEnvelope();
  let bobs = [0, 0];
  let yaws = [0, 0];
  for (let t = 0; t < 20; t += 0.05) {
    const p = e.pose(t);
    bobs = [Math.min(bobs[0], p.bob), Math.max(bobs[1], p.bob)];
    yaws = [Math.min(yaws[0], p.yaw), Math.max(yaws[1], p.yaw)];
  }
  assert.ok(Math.abs(BOB - 0.03) < 1e-9 && Math.abs(SWAY - (8 * Math.PI) / 180) < 1e-9);
  assert.ok(bobs[1] <= BOB + 1e-9 && bobs[0] >= -BOB - 1e-9 && bobs[1] > BOB * 0.8, `bob ${bobs}`);
  assert.ok(yaws[1] <= SWAY + 1e-9 && yaws[0] >= -SWAY - 1e-9 && yaws[1] > SWAY * 0.8, `yaw ${yaws}`);
  e.open(0);
  e.step(TIMES.opening, false);
  const pulses = [0.1, 0.3, 0.5, 0.7].map((dt) => e.pose(TIMES.opening + dt).pulse);
  assert.ok(Math.max(...pulses) > 0.3 && Math.min(...pulses) < Math.max(...pulses), `a pulse: ${pulses}`);
  assert.ok(pulses.every((v) => v >= 0 && v <= 1));
});

test('with reduced motion: no bob or sway, the flap snaps open, and a short crossfade instead of the push', () => {
  const e = createEnvelope({ reduced: true });
  for (const t of [0, 0.7, 3.3]) {
    const p = e.pose(t);
    assert.equal(p.bob, 0);
    assert.equal(p.yaw, 0);
  }
  e.open(1);
  const p = e.pose(1);
  assert.ok(Math.abs(p.flap - FLAP_OPEN) < 1e-6, 'open at once');
  assert.equal(p.crack, 1);
  assert.equal(e.step(1, true), 'fading', 'nothing to wait through');
  const mid = e.pose(1 + TIMES.reducedFade / 2);
  assert.equal(mid.push, 0, 'no push');
  assert.equal(mid.crossfade, true);
  assert.ok(mid.fade > 0 && mid.fade < 1);
  assert.equal(e.pose(4).pulse, 0, 'no pulse');
  assert.equal(e.step(1 + TIMES.reducedFade, true), 'gone');
  assert.ok(TIMES.reducedFade <= 0.3, 'short');
  const s = createEnvelope({ reduced: true });
  s.skip(0);
  assert.equal(s.pose(0.05).drop, 0, 'a skip crossfades too, no drop');
  assert.equal(s.done(TIMES.reducedFade), true);
});

test('a skip drops it away and fades it', () => {
  const e = createEnvelope();
  e.skip(0);
  let drop = 0;
  for (let t = 0; t <= TIMES.skip + 1e-9; t += 0.02) {
    const p = e.pose(t);
    assert.ok(p.drop >= drop - 1e-9);
    drop = p.drop;
  }
  assert.ok(e.pose(TIMES.skip).drop > 0.99 && e.pose(TIMES.skip).fade > 0.99);
});

test('dragged, it follows the finger with some give and the flap lifts as it goes up', () => {
  const h = 844;
  assert.deepEqual(dragPose(0, h), { follow: 0, lift: 0 });
  let last = 0;
  for (const dy of [-10, -40, -80, -160, -320, -640]) {
    const p = dragPose(dy, h);
    assert.ok(p.follow < 0 && Math.abs(p.follow) < Math.abs(dy), `${dy}: follows, with give`);
    assert.ok(Math.abs(p.follow) > Math.abs(last), `${dy}: further for further`);
    last = p.follow;
    assert.ok(p.lift > 0 && p.lift <= 1, `${dy}: the flap lifts`);
  }
  assert.ok(Math.abs(dragPose(-10000, h).follow) < h * 0.4, 'never off the screen');
  const down = dragPose(160, h);
  assert.ok(down.follow > 0 && down.follow < 160);
  assert.equal(down.lift, 0, 'down, the flap stays shut');
});

test('while dragging the hint says which way it goes; under the tap slop it says nothing', () => {
  assert.equal(dragHint(-30), 'open');
  assert.equal(dragHint(40), 'skip');
  assert.equal(dragHint(-SWIPE.tap + 1), null);
  assert.equal(dragHint(SWIPE.tap - 1), null);
  assert.ok(SWIPE.tap >= 8 && SWIPE.tap <= 12, 'about a fingertip’s wobble');
});

test('its words: labels in Title Case, hints in sentences, ≤ 160 characters', () => {
  assert.equal(ENVELOPE_TEXT.skip, 'Skip Intro');
  assert.equal(ENVELOPE_TEXT.hint, 'Click or swipe up to open');
  assert.equal(ENVELOPE_TEXT.hintSkip, 'Swipe down to skip');
  assert.equal(ENVELOPE_TEXT.dragOpen, 'Open ↑');
  assert.equal(ENVELOPE_TEXT.dragSkip, 'Skip ↓');
  for (const [k, v] of Object.entries(ENVELOPE_TEXT)) assert.ok(v.length > 0 && v.length <= 160, k);
  assert.match(ENVELOPE_TEXT.open, /^[A-Z][a-z]*( (the|[A-Z][a-z]*))*$/, 'the button’s name, Title Case');
  assert.ok(TIMES.idleHint === 1.2, 'the touch hint after 1.2 s idle');
});
