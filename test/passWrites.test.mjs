import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPassWrites } from '../src/bonfire/passWrites.js';
import { GLITCH_UNIFORMS } from '../src/bonfire/sceneUpdate.js';
import { passValue, stillClock } from '../src/bonfire/stillFx.js';
// Recorded from the pre-extraction writer on main, independent of the moved table.
const ORACLE_UNIFORMS = {
  slice: 'uSlice',
  sliceSeed: 'uSliceSeed',
  split: 'uSplit',
  block: 'uBlock',
  wave: 'uWave',
  mirror: 'uMirror',
  scan: 'uScan',
  scanMode: 'uScanMode',
  noise: 'uNoise',
  invert: 'uInvert',
  feedback: 'uFeedback',
  zoom: 'uZoom',
  feedRot: 'uFeedRot',
  kaleido: 'uKaleido',
  kaleidoRot: 'uKaleidoRot',
  rippleR: 'uRippleR',
  rippleAmp: 'uRippleAmp',
  iris: 'uIris',
  letterbox: 'uLetterbox',
  ink: 'uInk',
  cycle: 'uCycle',
  temp: 'uTemp',
  blackout: 'uBlackout',
  ghost: 'uGhost',
  ghostKeep: 'uGhostKeep',
  blur: 'uBlur',
  glow: 'uGlow',
  glowSize: 'uGlowSize',
  glowCut: 'uGlowCut',
  grad: 'uGrad',
  gradA: 'uGradA',
  gradB: 'uGradB',
  gradC: 'uGradC',
  style: 'uStyle',
  styleR: 'uStyleR',
  styleMix: 'uStyleMix',
  paintAngle: 'uPaintAngle',
  paintAspect: 'uPaintAspect',
  washEdge: 'uWashEdge',
  flicker: 'uFlicker',
  flickerMode: 'uFlickerMode',
  feedMode: 'uFeedMode',
  ghostMode: 'uGhostMode',
  warpMode: 'uWarpMode',
  warpMix: 'uWarpMix',
  inkMode: 'uInkMode',
  invertMode: 'uInvertMode',
  scanBlend: 'uScanBlend',
  glowMode: 'uGlowMode',
  gradMode: 'uGradMode',
};
const RECORDED_GLITCH = {
  slice: 0.1,
  sliceSeed: 0.15000000000000002,
  split: 0.2,
  block: 0.25,
  wave: 0.30000000000000004,
  mirror: 0.35,
  scan: 0.4,
  scanMode: 0.44999999999999996,
  noise: 0.5,
  invert: 0.55,
  feedback: 0.6,
  zoom: 0.65,
  feedRot: 0.7,
  kaleido: 0.75,
  kaleidoRot: 0.7999999999999999,
  rippleR: 0.85,
  rippleAmp: 0.9,
  iris: 0.95,
  letterbox: 1.0,
  ink: 1.05,
  cycle: 1.1,
  temp: 1.1500000000000001,
  blackout: 1.2000000000000002,
  ghost: 1.25,
  ghostKeep: 1.3,
  blur: 1.35,
  glow: 1.4000000000000001,
  glowSize: 1.4500000000000002,
  glowCut: 1.5,
  grad: 1.55,
  gradA: 1.6,
  gradB: 1.6500000000000001,
  gradC: 1.7000000000000002,
  style: 1.75,
  styleR: 1.8,
  styleMix: 1.85,
  paintAngle: 1.9000000000000001,
  paintAspect: 1.9500000000000002,
  washEdge: 2.0,
  flicker: 2.05,
  flickerMode: 2.1,
  feedMode: 2.15,
  ghostMode: 2.2,
  warpMode: 2.25,
  warpMix: 2.3000000000000003,
  inkMode: 2.35,
  invertMode: 2.4,
  scanBlend: 2.45,
  glowMode: 2.5,
  gradMode: 2.5500000000000003,
};
test('shared writes equal the former scene update for all motion/painted modes', () => {
  assert.deepEqual(GLITCH_UNIFORMS, ORACLE_UNIFORMS);
  for (const reducedMotion of [false, true])
    for (const paintedLook of [false, true]) {
      const glitch = { ...RECORDED_GLITCH };
      const uniforms = Object.fromEntries(Object.values(ORACLE_UNIFORMS).map((key) => [key, { value: -1 }]));
      uniforms.uTime = { value: -1 };
      uniforms.uCenter = { value: new THREE.Vector2() };
      const pass = { uniforms };
      const size = { w: 480, h: 270 },
        camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 80);
      camera.position.set(0, 2, 6);
      camera.lookAt(0, 0.5, 0);
      camera.updateMatrixWorld();
      const point = new THREE.Vector3(0.2, 0.55, -0.3),
        expected = point.clone().project(camera);
      createPassWrites({ pass, glitch, reducedMotion, paintedLook })(2.75, size, point, camera);
      const opts = { reducedMotion, paintedLook };
      for (const [key, u] of Object.entries(ORACLE_UNIFORMS)) {
        const want =
          key === 'rippleR'
            ? glitch.rippleR * size.h
            : key === 'rippleAmp'
              ? reducedMotion
                ? 0
                : (glitch.rippleAmp * size.h) / 270
              : passValue(key, glitch[key], opts);
        assert.equal(uniforms[u].value, want, key);
      }
      assert.equal(uniforms.uTime.value, stillClock(opts) ? 0 : 2.75);
      assert.deepEqual(uniforms.uCenter.value.toArray(), [
        (expected.x * 0.5 + 0.5) * size.w,
        (expected.y * 0.5 + 0.5) * size.h,
      ]);
    }
});
