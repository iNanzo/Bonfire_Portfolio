// The envelope that opens /invitation/ (src/invitation/envelope.js, pure): its states (floating
// until opened or skipped; opening while the seal blooms into rose petals and only then the flap
// lifts; waiting when it's open before NEWT is in; fading as it pushes toward the camera and
// dithers out; gone, or skipped), how a drag on it reads (a swipe up opens it, a swipe down
// skips: far enough or a fast flick, and mostly up or down), the keys (Enter, Space and ArrowUp
// open; Escape and ArrowDown skip), how it follows a finger with some give while the seal starts
// to open, the live hint while dragging, how it arrives, and the opening as functions of time
// (reduced motion: no bob, no bloom, the flap snaps open, a short crossfade). Opened, the letter
// alone dissolves into particles: a noisy edge sweeps up across it shedding specks of paper and
// ember that drift up and fade, and the white page behind clears at once (never a dither over
// the screen). Where the letter still hides a point of it (letterCovers: the intro's first line
// waits until it no longer hides NEWT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOB,
  DISSOLVE,
  ENVELOPE_TEXT,
  FLAP_OPEN,
  HOVER_PULSE,
  SWAY,
  SWIPE,
  TIMES,
  createEnvelope,
  dragHint,
  dissolveAt,
  dragPose,
  FLAP_TIP,
  letterCovers,
  sealBloom,
  TURN,
  turnGoal,
  turnStep,
  envelopeGesture,
  envelopeKey,
  hintFor,
  hoverPulse,
  hoverStep,
  particleAt,
  shedParticles,
} from '../src/invitation/envelope.js';

test('the letter hides a point of it until the dissolve’s edge has passed it, dither and all (its open flap too); outside it never; reduced motion until it’s half faded', () => {
  const e = createEnvelope();
  assert.equal(letterCovers(e.pose(0), 0, 0), true, 'floating, it covers');
  assert.equal(letterCovers(e.pose(0), 1.2, 0), false, 'beside it, never');
  assert.equal(letterCovers(e.pose(0), 0, 1.5), false, 'over its top with the flap shut, never');
  e.open(0);
  e.step(TIMES.opening, true);
  const t0 = TIMES.opening;
  assert.equal(letterCovers(e.pose(t0), 0, 1.5), true, 'the open flap over its top covers');
  assert.equal(letterCovers(e.pose(t0), 0, 1 + FLAP_TIP + 0.05), false, 'past its tip, not');
  assert.equal(letterCovers(e.pose(t0), 0.9, 1.5), false, 'beside its slope, not');
  // Each point is uncovered once, for good, as the edge passes its value and half the dither.
  for (const [x, y] of [
    [0, 0],
    [-0.8, -0.8],
    [0.6, 0.7],
    [0.2, 1.3],
  ]) {
    let was = true;
    let at = null;
    for (let t = t0; t <= t0 + TIMES.fade + 1e-9; t += 0.01) {
      const p = e.pose(t);
      const now = letterCovers(p, x, y);
      assert.ok(!now || was, `(${x}, ${y}) covered again at ${t.toFixed(2)}`);
      if (was && !now) at = p;
      was = now;
    }
    assert.ok(at, `(${x}, ${y}) uncovered`);
    assert.ok(DISSOLVE.edge(at.dissolve) >= dissolveAt(x, y) + DISSOLVE.dither / 2 - 1e-9);
  }
  // (Low on the letter before high on it: the edge sweeps up.)
  const when = (x, y) => {
    for (let t = t0; ; t += 0.01) if (!letterCovers(e.pose(t), x, y)) return t;
  };
  assert.ok(when(-0.8, -0.8) < when(0.6, 0.7));
  const r = createEnvelope({ reduced: true });
  r.open(0);
  r.step(0, true);
  assert.equal(letterCovers(r.pose(TIMES.reducedFade * 0.4), 0, 0), true);
  assert.equal(letterCovers(r.pose(TIMES.reducedFade * 0.6), 0, 0), false);
});

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

test('it floats until opened, blooms and lifts, waits for NEWT if he isn’t in, then fades and is gone', () => {
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

test('the opening over time: the seal blooms into roses first, only then the flap lifts to FLAP_OPEN, then it pushes toward the camera and dithers out', () => {
  const e = createEnvelope();
  const p0 = e.pose(0);
  assert.equal(p0.bloom, 0);
  assert.equal(p0.flap, 0);
  assert.equal(p0.push, 0);
  assert.equal(p0.fade, 0);
  e.open(1);
  let bloom = 0;
  let flap = 0;
  for (let t = 1; t <= 1 + TIMES.opening + 1e-9; t += 0.01) {
    const p = e.pose(t);
    assert.ok(p.bloom >= bloom - 1e-9 && p.bloom <= 1, `the bloom only grows: ${t}`);
    assert.ok(p.flap >= flap - 1e-9 && p.flap <= FLAP_OPEN + 1e-9, `the flap only lifts: ${t}`);
    if (p.flap > 0) assert.ok(p.bloom >= 1 - 1e-9, `the seal is all petals before the flap moves: ${t}`);
    bloom = p.bloom;
    flap = p.flap;
    assert.equal(p.push, 0, 'no push before the fade');
    assert.equal(p.dissolve, 0, 'no dissolve while it opens');
  }
  assert.ok(e.pose(1 + TIMES.bloom * 0.5).bloom > 0.2, 'blooming at once');
  assert.ok(e.pose(1 + TIMES.bloom).bloom > 0.999, 'all petals by TIMES.bloom');
  assert.equal(e.pose(1 + TIMES.bloom - 0.01).flap, 0, 'the flap still shut while the seal blooms');
  assert.ok(TIMES.bloom >= 0.4 && TIMES.bloom <= 0.6, 'a brisk beat: 0.4–0.6 s');
  assert.ok(TIMES.flapAt >= TIMES.bloom - 1e-9, 'the flap after the seal');
  assert.ok(Math.abs(TIMES.opening - (TIMES.flapAt + TIMES.flap)) < 1e-9, 'opening is the bloom then the flap');
  assert.ok(TIMES.opening <= 0.95, 'the whole opening stays brisk');
  assert.ok(Math.abs(e.pose(1 + TIMES.opening).flap - FLAP_OPEN) < 1e-6, 'fully open by the end');
  assert.ok(FLAP_OPEN > Math.PI * 0.8 && FLAP_OPEN <= Math.PI, 'it folds right back');
  e.step(1 + TIMES.opening, true);
  let push = 0;
  let fade = 0;
  for (let t = 1 + TIMES.opening; t <= 1 + TIMES.opening + TIMES.fade + 1e-9; t += 0.02) {
    const p = e.pose(t);
    assert.ok(p.push >= push - 1e-9 && p.fade >= fade - 1e-9, `push and fade only grow: ${t}`);
    assert.equal(p.bloom, 1, 'the seal stays gone');
    push = p.push;
    fade = p.fade;
  }
  const end = e.pose(1 + TIMES.opening + TIMES.fade);
  assert.ok(end.push > 0.99 && end.fade > 0.99, 'pushed and dithered out by the end');
  assert.equal(end.crossfade, false, 'dithered, not a crossfade');
});

test('the seal as it blooms: a little swell, then it shrinks away to nothing as its petals open out', () => {
  assert.deepEqual(sealBloom(0), { scale: 1, spin: 0 });
  assert.equal(sealBloom(1).scale, 0, 'gone');
  assert.ok(sealBloom(0.15).scale > 1, 'it swells first');
  assert.ok(sealBloom(0.15).scale <= 1.15, 'a little');
  let last = Infinity;
  for (let b = 0.2; b <= 1 + 1e-9; b += 0.05) {
    const s = sealBloom(b).scale;
    assert.ok(s <= last + 1e-9 && s >= 0, `then only shrinks: ${b}`);
    last = s;
  }
  assert.ok(Math.abs(sealBloom(1).spin) > 0.2, 'turning a little as it goes, like a rose opening');
});

test('it arrives: settling in over TIMES.arrive from when it’s made (still with reduced motion)', () => {
  const e = createEnvelope({ born: 2 });
  assert.equal(e.pose(2).arrive, 0);
  assert.ok(e.pose(2 + TIMES.arrive / 2).arrive > 0.5, 'easing in');
  assert.equal(e.pose(2 + TIMES.arrive).arrive, 1);
  assert.equal(e.pose(9).arrive, 1);
  assert.ok(TIMES.arrive >= 0.3 && TIMES.arrive <= 0.8);
  assert.equal(createEnvelope({ reduced: true, born: 2 }).pose(2).arrive, 1, 'reduced: there at once');
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
  assert.equal(p.bloom, 0, 'no bloom: the seal simply fades with the letter');
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

test('dragged, it follows the finger with some give and the seal starts to open as it goes up', () => {
  const h = 844;
  assert.deepEqual(dragPose(0, h), { follow: 0, lift: 0 });
  let last = 0;
  for (const dy of [-10, -40, -80, -160, -320, -640]) {
    const p = dragPose(dy, h);
    assert.ok(p.follow < 0 && Math.abs(p.follow) < Math.abs(dy), `${dy}: follows, with give`);
    assert.ok(Math.abs(p.follow) > Math.abs(last), `${dy}: further for further`);
    last = p.follow;
    assert.ok(p.lift > 0 && p.lift <= 1, `${dy}: the seal starts to open`);
  }
  assert.ok(Math.abs(dragPose(-10000, h).follow) < h * 0.4, 'never off the screen');
  const down = dragPose(160, h);
  assert.ok(down.follow > 0 && down.follow < 160);
  assert.equal(down.lift, 0, 'down, the seal stays shut');
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
  assert.equal(ENVELOPE_TEXT.hintTouch, 'Tap or swipe up to open');
  assert.equal(ENVELOPE_TEXT.hintSkip, 'Swipe down to skip');
  assert.equal(ENVELOPE_TEXT.dragOpen, 'Open ↑');
  assert.equal(ENVELOPE_TEXT.dragSkip, 'Skip ↓');
  for (const [k, v] of Object.entries(ENVELOPE_TEXT)) assert.ok(v.length > 0 && v.length <= 160, k);
  assert.match(ENVELOPE_TEXT.open, /^[A-Z][a-z]*( (the|[A-Z][a-z]*))*$/, 'the button’s name, Title Case');
  assert.ok(TIMES.idleHint === 1.2, 'the touch hint after 1.2 s idle');
});

test('the hint says Tap on a touch screen and Click with a mouse', () => {
  assert.equal(hintFor(true), 'Tap or swipe up to open');
  assert.equal(hintFor(false), 'Click or swipe up to open');
});

test('opened, the letter dissolves: the edge sweeps across it over TIMES.dissolve while the page behind clears at once', () => {
  const e = createEnvelope();
  e.open(0);
  e.step(TIMES.opening, true);
  const t0 = TIMES.opening;
  const start = e.pose(t0);
  assert.equal(start.dissolve, 0, 'whole as it starts');
  assert.equal(start.backdrop, 1, 'the white page still up as it starts');
  assert.equal(start.crossfade, false);
  let dissolve = 0;
  let backdrop = 1;
  for (let t = t0; t <= t0 + TIMES.fade + 1e-9; t += 0.02) {
    const p = e.pose(t);
    assert.ok(p.dissolve >= dissolve - 1e-9 && p.dissolve <= 1, `the edge only goes on: ${t}`);
    assert.ok(p.backdrop <= backdrop + 1e-9 && p.backdrop >= 0, `the page only clears: ${t}`);
    assert.equal(p.fade, p.dissolve, 'how far it’s gone is how far the edge has swept');
    dissolve = p.dissolve;
    backdrop = p.backdrop;
  }
  assert.ok(TIMES.clear <= 0.4, 'the page behind clears quickly');
  assert.equal(e.pose(t0 + TIMES.clear).backdrop, 0, 'the scene behind is clear while the letter still dissolves');
  assert.ok(e.pose(t0 + TIMES.clear).dissolve < 0.6);
  assert.ok(e.pose(t0 + TIMES.dissolve).dissolve > 0.999, 'swept by TIMES.dissolve');
  assert.ok(TIMES.dissolve >= 0.6 && TIMES.dissolve <= 1.2, 'slow enough to read at real speed');
  assert.ok(TIMES.fade >= TIMES.dissolve + TIMES.drift - 1e-9, 'the last specks fade before it’s gone');
  for (const t of [0, 0.3, 2]) {
    const f = createEnvelope().pose(t);
    assert.equal(f.dissolve, 0);
    assert.equal(f.backdrop, 1, 'floating, the page is white behind it');
  }
});

test('the dissolve edge: nothing goes at 0, everything is gone at 1, lower parts first', () => {
  for (const [x, y] of [
    [-1, -1],
    [0, 0],
    [1, 1],
    [0.4, -0.7],
    [-0.9, 0.8],
  ]) {
    const v = dissolveAt(x, y);
    assert.ok(v >= 0 && v <= 1, `${x},${y}: ${v}`);
    assert.ok(DISSOLVE.edge(0) < v && DISSOLVE.edge(1) > v, `${x},${y}: there at 0, gone at 1`);
  }
  let low = 0;
  let high = 0;
  for (let i = 0; i < 40; i++) {
    const x = (i % 8) / 4 - 0.9;
    low += dissolveAt(x, -0.8);
    high += dissolveAt(x, 0.8);
  }
  assert.ok(low < high, 'the edge sweeps up from the bottom');
});

test('the letter sheds specks as the edge reaches them: they drift up and fade, all gone by the end', () => {
  const specks = shedParticles(120);
  assert.equal(specks.length, 120);
  assert.deepEqual(shedParticles(120), specks, 'the same every visit');
  assert.ok(specks.some((s) => s.kind === 'paper') && specks.some((s) => s.kind === 'ember'));
  for (const s of specks) {
    assert.ok(s.x >= -1 && s.x <= 1 && s.y >= -1 && s.y <= 1, 'on the letter');
    assert.ok(s.at >= 0 && s.at <= TIMES.dissolve + 1e-9, 'shed while the edge sweeps');
    assert.equal(particleAt(s, s.at - 0.01).alpha, 0, 'not before the edge reaches it');
    const a = particleAt(s, s.at + 0.05);
    const b = particleAt(s, s.at + s.life * 0.6);
    assert.ok(a.alpha > 0, 'shed: it shows');
    assert.ok(b.y > a.y && a.y >= 0, 'it drifts up');
    assert.ok(b.alpha <= a.alpha, 'it fades');
    assert.equal(particleAt(s, s.at + TIMES.drift).alpha, 0, 'gone after its drift');
    assert.equal(particleAt(s, TIMES.fade).alpha, 0, 'all gone by the end');
  }
  const order = [...specks].sort((p, q) => p.at - q.at);
  const mean = (list) => list.reduce((m, s) => m + s.y, 0) / list.length;
  assert.ok(mean(order.slice(0, 30)) < mean(order.slice(-30)), 'lower ones first');
});

test('with reduced motion it’s a short plain fade, no dissolve; a skip clears the page as it drops away', () => {
  const r = createEnvelope({ reduced: true });
  r.open(0);
  r.step(0, true);
  const mid = r.pose(TIMES.reducedFade / 2);
  assert.equal(mid.dissolve, 0, 'no dissolve');
  assert.equal(mid.crossfade, true);
  assert.ok(Math.abs(mid.backdrop - (1 - mid.fade)) < 1e-9);
  const s = createEnvelope();
  s.skip(0);
  assert.equal(s.pose(0.01).dissolve, 0, 'a skip drops it, no dissolve');
  assert.ok(s.pose(TIMES.skip).backdrop < 0.01, 'the page clears');
});

test('hovered, the letter pulses slowly: from nothing to full and back every 2.8 s, so it shows clean between pulses', () => {
  assert.equal(HOVER_PULSE.period, 2.8);
  const P = HOVER_PULSE.period;
  assert.equal(hoverPulse(1, 0), 0, 'it starts from nothing');
  assert.ok(Math.abs(hoverPulse(1, P / 2) - 1) < 1e-9, 'full at the middle of a pulse');
  assert.ok(hoverPulse(1, P) < 1e-9 && hoverPulse(1, 3 * P) < 1e-9, 'all the way back to nothing');
  for (let t = 0; t < 3 * P; t += 0.05) {
    const v = hoverPulse(1, t);
    assert.ok(v >= 0 && v <= 1);
    // (Eased in: half way in, half as strong.)
    assert.ok(Math.abs(hoverPulse(0.5, t) - v / 2) < 1e-9);
  }
  // (Slowly: under a tenth of its strength for a good share of each pulse.)
  let clean = 0;
  for (let t = 0; t < P; t += P / 100) clean += hoverPulse(1, t) < 0.1 ? 1 : 0;
  assert.ok(clean >= 15, `clean for ${clean}% of a pulse`);
  // (Reduced motion: no pulse, a steady rim while it's hovered.)
  assert.equal(hoverPulse(1, 0, true), hoverPulse(1, P / 3, true));
  assert.ok(hoverPulse(1, 0, true) > 0.3);
  assert.equal(hoverPulse(0, 1, true), 0);
});

test('the hover eases in as the pointer comes onto the letter and out as it leaves', () => {
  let k = 0;
  for (let i = 0; i < 3; i++) k = hoverStep(k, true, 0.05);
  assert.ok(k > 0 && k < 1, `easing in: ${k}`);
  for (let i = 0; i < 40; i++) k = hoverStep(k, true, 0.05);
  assert.equal(k, 1);
  k = hoverStep(k, false, 0.05);
  assert.ok(k < 1 && k > 0);
  for (let i = 0; i < 40; i++) k = hoverStep(k, false, 0.05);
  assert.equal(k, 0);
});

test('the letter leans gently toward the pointer’s x, and a sideways drag or a held arrow turns it further, 0.15 rad at most', () => {
  assert.ok(TURN.max <= 0.15 + 1e-9 && TURN.max >= 0.12, `at most ${TURN.max}`);
  assert.equal(turnGoal({}), 0, 'no pointer, no drag, no key: square on');
  // (Toward the pointer: right of the middle turns its face right, gently.)
  const right = turnGoal({ pointer: 1 });
  assert.ok(right > 0.03 && right <= 0.08, `toward the right edge ${right}`);
  assert.equal(turnGoal({ pointer: -1 }), -right);
  assert.ok(Math.abs(turnGoal({ pointer: 0.5 }) - right / 2) < 1e-9, 'by how far off the middle');
  assert.equal(turnGoal({ pointer: 4 }), right, 'never past the edge’s');
  // (A sideways drag turns it further its way, more the further it goes, never past the most.)
  const w = 1000;
  const small = turnGoal({ pointer: 0, dx: 50, w });
  const big = turnGoal({ pointer: 0, dx: 400, w });
  assert.ok(small > 0 && big > small, `${small} then ${big}`);
  assert.ok(turnGoal({ pointer: 1, dx: 5000, w }) <= TURN.max + 1e-9);
  assert.ok(turnGoal({ pointer: -1, dx: -5000, w }) >= -TURN.max - 1e-9);
  assert.ok(turnGoal({ pointer: 1, dx: 5000, w }) > TURN.max - 0.01, 'all the way, dragged far');
  // (A held arrow: further its way.)
  assert.ok(turnGoal({ key: 1 }) > right, 'ArrowRight');
  assert.equal(turnGoal({ key: -1 }), -turnGoal({ key: 1 }), 'ArrowLeft');
  assert.ok(turnGoal({ pointer: 1, key: 1 }) <= TURN.max + 1e-9);
});

test('the turn eases toward where it heads and springs back once let go; reduced motion keeps it square on', () => {
  let a = 0;
  const trace = [];
  for (let i = 0; i < 60; i++) trace.push((a = turnStep(a, 0.12, 1 / 60)));
  assert.ok(trace[0] > 0 && trace[0] < 0.06, `eased: ${trace[0]} after a frame`);
  assert.ok(Math.abs(a - 0.12) < 0.01, `there within a second: ${a}`);
  for (let i = 0; i < 90; i++) a = turnStep(a, 0, 1 / 60);
  assert.ok(Math.abs(a) < 0.005, `back square on: ${a}`);
  assert.equal(turnStep(0.1, 0.12, 1 / 60, true), 0);
});
