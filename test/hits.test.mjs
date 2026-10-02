// How hits land: debris (src/bonfire/debris.js) and camera trauma (src/bonfire/view.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDebris } from '../src/bonfire/debris.js';
import { createView } from '../src/bonfire/view.js';

test('debris: every element bounces, settles on the ground and is gone by the end of its life', () => {
  for (const kind of ['fire', 'ice', 'lightning']) {
    const d = createDebris({ kind, material: new THREE.PointsMaterial(), count: 40 });
    d.setGround((x) => (x > 0 ? 0.1 : 0)); // a step, like a flagstone
    d.setRamp(['#300', '#a00', '#f80', '#ffe'].map((h) => new THREE.Color(h)));
    d.throw(0, 0.2, 0, 30);
    const P = d.points.geometry.attributes.position.array;
    const S = d.points.geometry.attributes.size.array;
    for (let f = 0; f < 60 * 4; f++) {
      d.step(1 / 60);
      for (let i = 0; i < 40; i++) {
        if (!S[i]) continue;
        const floor = P[i * 3] > 0 ? 0.1 : 0;
        assert.ok(P[i * 3 + 1] >= floor, `${kind}: below the ground`);
        assert.ok(Number.isFinite(P[i * 3]), `${kind}: finite`);
      }
    }
    assert.ok(
      S.every((s) => s === 0),
      `${kind}: all gone after their life`,
    );
  }
});

test('trauma: hits stack (capped), shake grows with it, and it settles to nothing', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = createView(camera);
  const size = { w: 320, h: 180 };
  const pointer = { sx: 0, sy: 0 };
  view.apply(0, size, pointer);
  const rest = camera.position.clone();
  view.shake(0.04);
  const small = view.trauma;
  view.shake(0.3);
  view.shake(0.3);
  view.shake(0.3);
  assert.ok(view.trauma > small && view.trauma <= 1, 'stacks and caps');
  let moved = 0;
  for (let i = 0; i < 20; i++) {
    view.apply(1 / 60, size, pointer);
    moved = Math.max(moved, camera.position.distanceTo(rest));
  }
  assert.ok(moved > 0, 'it shakes');
  for (let i = 0; i < 120; i++) view.apply(1 / 60, size, pointer);
  assert.equal(view.trauma, 0);
  assert.ok(camera.position.distanceTo(rest) < 1e-9, 'back at rest');
});
