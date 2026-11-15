import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnvelopeActor } from '../src/invitation/envelopeActor.js';
import { createEnvelope, DISSOLVE, hoverLook, sealBloom, turnRoll } from '../src/invitation/envelope.js';
import { IDS, shared, toon, PAPER } from '../src/invitation/envelopeLook.js';
import { sealOnScreen } from '../src/invitation/envelopeSeal.js';

test('actor builds the original four paper pieces, seal, and 220 specks without WebGL', () => {
  const actor = createEnvelopeActor({ size: { tw: 300, th: 200 } });
  const parts = [];
  actor.envl.group.traverse((o) => {
    if (o.isMesh && o.material.uniforms?.uId) parts.push(o.material.uniforms.uId.value);
  });
  for (const part of ['body', 'inside', 'pocket', 'flap'])
    assert.equal(parts.filter((id) => id === IDS[part]).length, 1);
  assert.equal(actor.specks.specks.length, 220);
  assert.equal(actor.inner.parent, actor.outer);
  assert.equal(actor.seal.group.parent, actor.envl.hinge);
  assert.equal(actor.specks.points.parent, actor.outer);
});

test('actor places real envelope poses with the original frame formulas and snapped seal', () => {
  const size = { tw: 300, th: 200 };
  const actor = createEnvelopeActor({ size });
  const env = createEnvelope({ born: 0 });
  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 40);
  camera.position.z = 6;
  camera.updateMatrixWorld();
  const view = { h: 3.2153903091734723, cssH: 800, scale: 0.8 };
  const follow = { y: 12, lift: 0.05 },
    turn = 0.1,
    lift = hoverLook(0.6);
  for (const t of [0, 0.3, 1, 1.2, 1.6, 2, 2.4, 2.8]) {
    if (t === 1) env.open(t);
    env.step(t, true);
    const p = env.pose(t);
    actor.pose(p, { view, follow, turn, lift, camera });
    assert.deepEqual(actor.outer.position.toArray(), [
      0,
      p.bob - follow.y * (view.h / view.cssH) - p.drop * view.h * 0.9 + (1 - p.arrive) * view.h * 0.04,
      p.push * 0.6 + lift.toward * 6,
    ]);
    assert.deepEqual(actor.outer.rotation.toArray().slice(0, 3), [0, p.yaw + turn, -0.5 * p.drop + turnRoll(turn)]);
    assert.equal(actor.outer.scale.x, view.scale * (1 + 0.025 * p.pulse) * (0.94 + 0.06 * p.arrive) * lift.scale);
    assert.equal(actor.envl.hinge.rotation.x, -p.flap);
    const bloom = sealBloom(Math.max(p.bloom, (follow.lift / 0.45) * 0.14));
    assert.equal(actor.seal.group.scale.x, bloom.scale);
    assert.equal(actor.seal.group.rotation.z, bloom.spin);
    assert.equal(actor.uniforms.uEdge.value, DISSOLVE.edge(p.dissolve));
    assert.equal(actor.uniforms.uDissolve.value, p.dissolve);
    const inverse = actor.inner.matrixWorld.clone().invert();
    assert.deepEqual(actor.uniforms.uToInner.value.elements, inverse.elements);
    if (actor.sealAt) {
      const expected = sealOnScreen(actor.seal.group, camera, actor.sealR, size.tw, size.th);
      assert.deepEqual(actor.sealAt, { x: expected.x, y: expected.y, axes: expected.axes });
      const center = actor.seal.material.uniforms.uCenter.value;
      assert.deepEqual(center.toArray(), [Math.round(expected.x), Math.round(expected.y)]);
      const axes = expected.axes.map((v) => Math.round(v * 2) / 2);
      assert.equal(
        actor.seal.material.uniforms.uFaceR.value,
        Math.sqrt(Math.abs(axes[0] * axes[3] - axes[1] * axes[2])),
      );
    }
  }
  assert.ok(actor.specks.points.visible);
});

test('look mark and linear seams default to the toy and opt into the Live buffer', () => {
  const u = shared();
  assert.equal(u.uMark.value, 1);
  assert.equal(u.uLinear.value, 0);
  const m = toon(PAPER, shared({ mark: 0.1, linear: true }), IDS.body);
  assert.equal(m.uniforms.uMark.value, 0.1);
  assert.equal(m.uniforms.uLinear.value, 1);
  const a = createEnvelopeActor({ mark: 0.12, linear: true });
  assert.equal(a.uniforms.uMark.value, 0.12);
  assert.equal(a.specks.points.material.uniforms.uMark.value, 0.12);
  const b = createEnvelopeActor();
  assert.notDeepEqual(a.specks.geo.attributes.color.array, b.specks.geo.attributes.color.array);
});
