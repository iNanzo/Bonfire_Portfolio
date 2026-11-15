import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, hashSeed } from '../src/bonfire/bolts.js';
import { createRng } from '../src/invitation/rng.js';
import { toLinear, toGamma } from '../src/paletteGen.js';
const oldSeeded = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
test('both rng callers preserve the original sequence bit for bit', () => {
  for (const seed of [0, 1, 7, -1, 1234567, 0xffffffff, 1.5, NaN]) {
    const a = seeded(seed),
      b = createRng(seed),
      old = oldSeeded(seed);
    for (let i = 0; i < 1000; i++) {
      const expected = old();
      assert.equal(a(), expected);
      assert.equal(b(), expected);
    }
  }
  const a = seeded(),
    zero = createRng(0);
  for (let i = 0; i < 1000; i++) assert.equal(a(), zero());
  assert.equal(hashSeed(2, 3, 4), (Math.imul(3, 73856093) ^ Math.imul(4, 19349663) ^ Math.imul(5, 83492791)) >>> 0);
});
test('exported transfer functions round-trip the color range', () => {
  for (let i = 0; i <= 255; i++) assert.ok(Math.abs(toGamma(toLinear(i / 255)) - i / 255) < 1e-6);
});

test('shared render exports preserve uniforms and write-through restoration', async () => {
  const { GLITCH_UNIFORMS } = await import('../src/bonfire/sceneUpdate.js');
  const { WRITE_THROUGH, applyRenderTo } = await import('../src/bonfire/sceneRender.js');
  assert.equal(GLITCH_UNIFORMS.blackout, 'uBlackout');
  assert.ok(Object.keys(GLITCH_UNIFORMS).length > 40);
  const pass = {
    uniforms: Object.fromEntries(
      ['ditherStrength', 'ditherScale', 'outlines', 'exposure'].map((k) => [k, { value: null }]),
    ),
  };
  const fx = {
    render: { dither: 0.2, ditherMatrix: 4, outlines: true, exposure: 1, colorChange: 0.4 },
    fire: { fps: 24 },
    impact: { hitStop: 0.1, flash: 0.2, debris: 1, marks: true },
  };
  const own = {};
  const override = { exposure: 1.5, outlines: false, flameFps: 12, hitStop: 0 };
  applyRenderTo(pass, fx, override, own);
  assert.deepEqual(
    Object.values(pass.uniforms).map((u) => u.value),
    [0.2, 4, 0, 1.5],
  );
  assert.equal(fx.fire.fps, 12);
  assert.equal(fx.impact.hitStop, 0);
  assert.deepEqual(own, { flameFps: 24, hitStop: 0.1 });
  assert.deepEqual(WRITE_THROUGH.marks, ['impact', 'marks', false]);
  applyRenderTo(pass, fx, {}, own);
  assert.equal(fx.fire.fps, 24);
  assert.equal(fx.impact.hitStop, 0.1);
  assert.deepEqual(own, {});
});
