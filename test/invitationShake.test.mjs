// Screen shake on NEWT's big drops (src/invitation/camera.js shakeKick, shakeOffset; main.js puts
// the offset on the stage's canvas, never in the orbit's own state): only over SHAKE.min of a
// landing speed, a short shake (SHAKE.time, by the speed) of a few CSS px (SHAKE.px), decaying to
// nothing; none with Screen Shake off or reduced motion. The Screen Shake setting (look.js, ui.js):
// On or Off in Settings, On by default, kept with the look in invitation.look.v1, left out until
// it's picked, so every look stored before it reads the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAKE, createOrbit, orbitPose, shakeKick, shakeOffset } from '../src/invitation/camera.js';
import { DEFAULT_LOOK, LOOK_KEY, loadLook, saveLook, shakeOn, validLook } from '../src/invitation/look.js';
import { sheetHtml } from '../src/invitation/ui.js';

const size = (o) => Math.hypot(o.x, o.y);
/** The largest offset in [from, to) seconds after the kick, sampled every 5 ms. */
function most(kick, from, to) {
  let m = 0;
  for (let t = from; t < to; t += 0.005) m = Math.max(m, size(shakeOffset(kick, t)));
  return m;
}

test('a shake only over SHAKE.min of a landing speed, a few CSS px and a third of a second or so, more for faster', () => {
  assert.equal(shakeKick(0), null);
  assert.equal(shakeKick(SHAKE.min - 0.01), null, 'a small drop: none');
  const low = shakeKick(SHAKE.min + 0.01);
  const high = shakeKick(SHAKE.full);
  assert.ok(low && high);
  assert.ok(low.px >= SHAKE.px[0] - 1e-6 && high.px <= SHAKE.px[1] + 1e-6);
  assert.ok(high.px > low.px * 2, `bigger for faster: ${low.px} → ${high.px}`);
  assert.ok(low.time >= 0.25 - 1e-6 && high.time <= 0.4 + 1e-6, `about 0.25–0.4 s: ${low.time}, ${high.time}`);
  assert.ok(high.time >= low.time);
  assert.deepEqual(shakeKick(SHAKE.full * 4), high, 'capped');
  assert.ok(SHAKE.px[1] <= 8, 'a few CSS px');
});

test('none with Screen Shake off or reduced motion, and a bad speed shakes nothing', () => {
  assert.equal(shakeKick(SHAKE.full, { on: false }), null);
  assert.equal(shakeKick(SHAKE.full, { reduced: true }), null);
  assert.ok(shakeKick(SHAKE.full, { on: true, reduced: false }));
  for (const bad of [Number.NaN, -9, undefined]) assert.equal(shakeKick(/** @type {any} */ (bad)), null);
  assert.deepEqual(shakeOffset(null, 0.1), { x: 0, y: 0 });
});

test('the shake moves the picture both ways, bounded by its px, decays, and is still once its time is up', () => {
  const k = /** @type {NonNullable<ReturnType<typeof shakeKick>>} */ (shakeKick(SHAKE.full));
  const xs = [];
  const ys = [];
  for (let t = 0; t < k.time; t += 0.005) {
    const o = shakeOffset(k, t);
    assert.ok(size(o) <= k.px + 1e-6, `within ${k.px} px: ${size(o)}`);
    xs.push(o.x);
    ys.push(o.y);
  }
  assert.ok(Math.min(...ys) < -1 && Math.max(...ys) > 1, 'up and down');
  assert.ok(Math.min(...xs) < -0.5 && Math.max(...xs) > 0.5, 'side to side');
  assert.ok(most(k, 0, 0.06) > k.px * 0.5, `a jolt at once: ${most(k, 0, 0.06)}`);
  const thirds = [0, 1, 2].map((i) => most(k, (k.time * i) / 3, (k.time * (i + 1)) / 3));
  assert.ok(thirds[0] > thirds[1] && thirds[1] > thirds[2], `decaying: ${thirds.join(', ')}`);
  assert.deepEqual(shakeOffset(k, k.time), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(k, k.time + 1), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(k, -0.1), { x: 0, y: 0 }, 'nothing before it');
});

test('the shake is an offset on its own: the orbit and its pose never change', () => {
  const s = createOrbit({ distance: 9 });
  const before = JSON.stringify(s);
  const pose = orbitPose(s);
  const k = shakeKick(SHAKE.full);
  for (let t = 0; t < 0.5; t += 0.01) shakeOffset(k, t);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(orbitPose(s), pose);
});

/** A storage holding one value. */
function memory() {
  /** @type {Record<string, string>} */
  const data = {};
  return {
    data,
    getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test('Screen Shake: On by default, Off once it is switched off, and kept for the next visit', () => {
  assert.equal(shakeOn(DEFAULT_LOOK), true, 'on by default');
  assert.equal(shakeOn(validLook(null)), true);
  assert.equal(shakeOn(validLook({ shake: false })), false);
  assert.equal(shakeOn(validLook({ shake: true })), true);
  const s = memory();
  saveLook(validLook({ ...DEFAULT_LOOK, shake: false }), s);
  assert.equal(JSON.parse(s.data[LOOK_KEY]).shake, false, 'stored with the look');
  assert.equal(shakeOn(loadLook(s)), false, 'read back');
  saveLook(validLook({ ...loadLook(s), shake: true }), s);
  assert.equal(shakeOn(loadLook(s)), true);
});

test('a look stored before Screen Shake reads as it did, shaking; a bad value is dropped, never a break', () => {
  const old = {
    pixelSize: '128',
    dither: true,
    outlines: false,
    style: 'soft',
    motion: 'smooth',
    shader: {},
    petals: false,
  };
  assert.equal(Object.hasOwn(validLook(old), 'shake'), false, 'left out until it is picked');
  assert.equal(validLook(old).petals, false, 'the rest kept');
  for (const bad of ['off', 0, 1, null, {}, []]) {
    const l = validLook({ ...old, shake: bad });
    assert.equal(Object.hasOwn(l, 'shake'), false, `${JSON.stringify(bad)} dropped`);
    assert.equal(shakeOn(l), true);
  }
  const s = memory();
  s.setItem(LOOK_KEY, JSON.stringify({ ...old, shake: 'nope' }));
  assert.equal(shakeOn(loadLook(s)), true);
  s.setItem(LOOK_KEY, '{broken');
  assert.equal(shakeOn(loadLook(s)), true);
});

test('Settings has a Screen Shake switch, on unless it was switched off, with a hint in a sentence', () => {
  const on = sheetHtml(DEFAULT_LOOK);
  assert.match(on, /<input type="checkbox" role="switch" data-look="shake" checked>/);
  assert.match(on, /Screen Shake/);
  const off = sheetHtml(validLook({ ...DEFAULT_LOOK, shake: false }));
  assert.match(off, /<input type="checkbox" role="switch" data-look="shake">/);
  const hint = /data-look="shake"[^]*?<p class="inv-hint">([^<]*)<\/p>/.exec(on)?.[1] ?? '';
  assert.ok(hint.length >= 12 && hint.length <= 160 && /\.$/.test(hint), `a hint in a sentence: ${hint}`);
});
