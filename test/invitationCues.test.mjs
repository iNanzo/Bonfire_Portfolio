// The ground cues every drag kind shares in the invitation toy, from cues.js: the blob straight
// down under his hips while he's off the floor (radius 0.35 of his height on contact, 0.6 of that
// and fainter, 0.45 to 0.20 times the look's lifted strength over 0.34, and softer, 0.15 to 0.5
// of the radius, as his lowest foot rises to two heights; eased in and out over 0.15 s), Ground
// Cues (Off / In the Mix / Always, the kind's own until picked; In the Mix while his lowest foot
// is over half his height or he moves over 1 u/s; faded over 0.15 s; the ring full for 0.12 s on
// a wall clamp, never at Off), the drop line fading in from a foot at 0.15 to 0.5 of his height,
// and the brain's drag speed as screen px a second over 110.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUES,
  CUE_LABELS,
  CUE_MODES,
  blobLook,
  blobWeight,
  cueStep,
  dragSpeedOf,
  groundCueMode,
  lineMode,
  lineShare,
  mixWants,
  ringStrength,
} from '../src/invitation/cues.js';
import { NEWT_HEIGHT } from '../src/invitation/area.js';
import { titleCase } from '../src/text.js';

const close = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);

test('the blob under him: 0.35 of his height across its middle on contact, shrinking to 0.6 of that, fading 0.45 to 0.20 (times the look’s lifted over 0.34) and softening 0.15 to 0.5 of its radius as his lowest foot rises to two heights', () => {
  const H = NEWT_HEIGHT;
  const on = blobLook(0, 0.34);
  close(on.radius, 0.35 * H);
  close(on.alpha, 0.45);
  close(on.soft, 0.15);
  const high = blobLook(2 * H, 0.34);
  close(high.radius, 0.35 * H * 0.6);
  close(high.alpha, 0.2);
  close(high.soft, 0.5);
  assert.deepEqual(blobLook(9 * H, 0.34), high, 'no further past two heights');
  assert.deepEqual(blobLook(-1, 0.34), on, 'a foot under the floor counts as on it');
  const mid = blobLook(H, 0.34);
  close(mid.radius, 0.35 * H * 0.8);
  close(mid.alpha, 0.325);
  // The look's lifted strength scales it (DS's 0.3 a little fainter than Soft's 0.34).
  close(blobLook(0, 0.3).alpha, (0.45 * 0.3) / 0.34);
  close(blobLook(0, 0).alpha, 0, 1e-12, 'a look with no blob: none');
  assert.ok(blobLook(0, 5).alpha <= 1, 'never past full');
  // Smaller, fainter and softer all the way up.
  let last = blobLook(0, 0.34);
  for (let h = 0.1; h <= 2; h += 0.1) {
    const b = blobLook(h, 0.34);
    assert.ok(b.radius < last.radius && b.alpha < last.alpha && b.soft > last.soft, `${h}`);
    last = b;
  }
  // Eased in as he's picked up, out once he's down, over 0.15 s.
  close(CUES.blobEase, 0.15);
  let w = 0;
  for (let i = 0; i < 5; i++) w = blobWeight(w, true, 0.03);
  close(w, 1, 1e-9, 'in after 0.15 s');
  w = blobWeight(w, false, 0.075);
  close(w, 0.5, 1e-9, 'half out');
  assert.equal(blobWeight(w, false, 1), 0);
});

test('Ground Cues: Off, In the Mix and Always (Title Case labels), the drag kind’s own until the look picks one', () => {
  assert.deepEqual([...CUE_MODES], ['off', 'mix', 'always']);
  assert.deepEqual(
    CUE_MODES.map((m) => CUE_LABELS[m]),
    ['Off', 'In the Mix', 'Always'],
  );
  for (const m of CUE_MODES) assert.equal(CUE_LABELS[m], titleCase(CUE_LABELS[m]));
  assert.equal(groundCueMode(undefined, 'mix'), 'mix');
  assert.equal(groundCueMode('auto', 'always'), 'always');
  for (const m of CUE_MODES) assert.equal(groundCueMode(m, 'off'), m);
});

test('In the Mix shows the ring and the drop line while his lowest foot is over half his height or he moves over 1 u/s across the floor; a cue fades in and out over 0.15 s, only while he’s held', () => {
  assert.equal(mixWants(0.2, 0.3), false);
  assert.equal(mixWants(0.51 * NEWT_HEIGHT, 0), true, 'high');
  assert.equal(mixWants(0, 1.2), true, 'fast');
  close(CUES.fade, 0.15);
  const step = (k, o, n = 1, dt = 0.05) => {
    for (let i = 0; i < n; i++) k = cueStep(k, { dt, ...o });
    return k;
  };
  close(step(0, { mode: 'always', want: false, held: true }), 1 / 3, 1e-9, 'a third of the way in 0.05 s');
  close(step(0, { mode: 'always', want: false, held: true }, 3), 1, 1e-9, 'Always: in after 0.15 s');
  assert.equal(step(1, { mode: 'off', want: true, held: true }, 3), 0, 'Off: never');
  assert.equal(step(0, { mode: 'mix', want: true, held: true }, 3), 1, 'In the Mix, wanted');
  assert.equal(step(1, { mode: 'mix', want: false, held: true }, 3), 0, 'In the Mix, not wanted');
  assert.equal(step(1, { mode: 'always', want: true, held: false }, 3), 0, 'down: gone');
});

test('the ring pulses to full for 0.12 s on a wall clamp (never at Off); the drop line fades in from a foot at 0.15 to 0.5 of his height', () => {
  close(CUES.pulse, 0.12);
  assert.equal(ringStrength(0.2, 0, 'mix'), 1);
  assert.equal(ringStrength(0.2, 0.11, 'always'), 1);
  assert.equal(ringStrength(0.2, 0.13, 'always'), 0.2, 'over');
  assert.equal(ringStrength(0, 0.05, 'off'), 0, 'Off');
  assert.equal(ringStrength(0.4, null, 'mix'), 0.4, 'no pulse');
  assert.equal(lineShare(0), 0);
  assert.equal(lineShare(0.15 * NEWT_HEIGHT), 0);
  assert.equal(lineShare(0.5 * NEWT_HEIGHT), 1);
  assert.equal(lineShare(3), 1);
  close(lineShare(0.325 * NEWT_HEIGHT), 0.5);
});

test('a drag kind can keep the drop line out of In the Mix (HoldCues.line false), but Always still shows it and Off never does, as every effect’s setting', () => {
  assert.equal(lineMode('mix', false), 'off');
  assert.equal(lineMode('always', false), 'always');
  assert.equal(lineMode('off', false), 'off');
  for (const mode of CUE_MODES) {
    assert.equal(lineMode(mode, undefined), mode, `${mode}: the kind says nothing`);
    assert.equal(lineMode(mode, true), mode, `${mode}: the kind lets it be`);
  }
});

test('the brain’s drag speed is his collar’s speed on screen, px a second over 110 (a vertical flick no longer counts for more than one across)', () => {
  close(CUES.dragPx, 110);
  close(dragSpeedOf(220), 2);
  close(dragSpeedOf(0), 0);
  close(dragSpeedOf(-5), 0);
});
