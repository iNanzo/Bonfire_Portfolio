// The pixel pass's effects under reduced motion (src/bonfire/stillFx.js, as scene.js sets the
// pass's uniforms): the show's keep only the still ones, as before; the Painter's painted look
// (`paintedLook`) shows as painted, held still (no palette cycle, negative, ink, blackout,
// flicker, torn rows, RGB split, ripple or kaleidoscope turn; the clock stopped), so the look
// being painted reaches the stage and its thumbnail; without reduced motion, everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passValue, stillClock, STILL, HELD, OFF } from '../src/bonfire/stillFx.js';

const sceneSrc = readFileSync(new URL('../src/bonfire/scene.js', import.meta.url), 'utf8');
/** The pass's effects (scene.js GLITCH_UNIFORMS' keys). */
const KEYS = Object.keys(Object.fromEntries([...(/const GLITCH_UNIFORMS = \{([\s\S]*?)\n {2}\};/.exec(sceneSrc)?.[1] ?? '').matchAll(/(\w+): 'u\w+'/g)].map((m) => [m[1], 1])));
/** A painted Kaleido look with glow, grain, a gradient and a trail, caught mid-flash. */
const LOOK = {
  kaleido: 8, kaleidoRot: 1.7, feedback: 0.4, zoom: 1.006, feedRot: 0.02, glow: 0.6, glowSize: 2.4, noise: 0.2, grad: 0.7,
  ghost: 0.5, blur: 0.3, wave: 1.2, letterbox: 0.09, iris: 1.1, style: 1, block: 3, split: 4, slice: 0.6, sliceSeed: 3,
  cycle: 2, invert: 1, ink: 1, blackout: 1, flicker: 0.4, rippleR: 0.3, rippleAmp: 5,
};
const apply = (o) => Object.fromEntries(Object.entries(LOOK).map(([k, v]) => [k, passValue(k, v, o)]));

test('every effect the gate names is one of the pass’s, and scene.js sets the pass through it', () => {
  assert.ok(KEYS.length > 40, `the pass's effects read from scene.js (${KEYS.length})`);
  for (const k of [...STILL, ...HELD, ...Object.keys(OFF)]) assert.ok(KEYS.includes(k), `${k} is a pass effect`);
  for (const k of Object.keys(LOOK)) assert.ok(KEYS.includes(k), `(the test's ${k})`);
  assert.match(sceneSrc, /pass\.uniforms\[u\]\.value = passValue\(k, glitch\[k\], stillOpts\)/);
  assert.match(sceneSrc, /pass\.uniforms\.uTime\.value = stillClock\(stillOpts\) \? 0 : t;/);
  assert.match(sceneSrc, /const stillOpts = \{ reducedMotion, paintedLook \}/);
});

test('without reduced motion every effect shows as the looks set it', () => {
  for (const paintedLook of [false, true]) assert.deepEqual(apply({ paintedLook }), LOOK);
  assert.equal(stillClock({}), false);
  assert.equal(stillClock({ paintedLook: true }), false);
});

test('reduced motion, the show (Bonfire Live, the site): only the still effects, as before', () => {
  const v = apply({ reducedMotion: true });
  for (const k of Object.keys(LOOK)) assert.equal(v[k], STILL.has(k) ? LOOK[k] : OFF[k] ?? 0, k);
  // (No kaleidoscope, echo, glow, grain, trail or shimmer; the framing, the recolor and the crunch kept.)
  assert.deepEqual([v.kaleido, v.feedback, v.zoom, v.glow, v.noise, v.ghost, v.wave], [0, 0, 1.006, 0, 0, 0, 0]);
  assert.deepEqual([v.grad, v.letterbox, v.iris, v.style, v.block], [0.7, 0.09, 1.1, 1, 3]);
  assert.equal(stillClock({ reducedMotion: true }), false, 'the clock untouched (nothing that reads it shows)');
});

test('reduced motion, the Painter’s painted look: shown as painted, held still, nothing that flashes or jitters', () => {
  const o = { reducedMotion: true, paintedLook: true };
  const v = apply(o);
  // The look being painted: its kaleidoscope, echo, glow, grain, gradient, trail, repaint, bars and spotlight.
  for (const k of ['kaleido', 'feedback', 'zoom', 'feedRot', 'glow', 'glowSize', 'noise', 'grad', 'ghost', 'blur', 'wave', 'letterbox', 'iris', 'style', 'block']) assert.equal(v[k], LOOK[k], `${k} as painted`);
  // Off: the palette cycle, the negative, the ink flash, the blackout, the flicker, the tears and split, the ripple.
  for (const k of ['cycle', 'invert', 'ink', 'blackout', 'flicker', 'slice', 'sliceSeed', 'split', 'rippleR', 'rippleAmp']) assert.equal(v[k], 0, `${k} off`);
  assert.equal(v.kaleidoRot, 0, 'the kaleidoscope held at its resting angle, not turning');
  assert.equal(stillClock(o), true, 'the clock held: grain and shimmer are still pictures');
  // Everything else a still look keeps under the show's reduced motion, the Painter's keeps too.
  for (const k of STILL) assert.ok(!HELD.has(k), `${k}: still for the show, still for the Painter`);
});
