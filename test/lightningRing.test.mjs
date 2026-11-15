import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createLightningRing } from '../src/bonfire/lightningRing.js';
import { seeded } from '../src/bonfire/bolts.js';
import { effects, setEffects } from '../src/effects.js';
import content from '../src/content.json' with { type: 'json' };

function trace(source) {
  const clock = mock.method(performance, 'now', () => 1000);
  const random = Math.random;
  Math.random = seeded(719);
  try {
    const material = new THREE.ShaderMaterial();
    const ring = createLightningRing({
      fxMaterial: material,
      origin: new THREE.Vector3(1, 0, 2),
      field: { noise: { noise3d: () => 0 } },
      emitters: 4,
      sparks: 16,
      lights: 0,
      ...(source ? { source } : {}),
    });
    const starts = [];
    const bolt = ring.bolts.bolt;
    ring.bolts.bolt = (...args) => {
      starts.push(args.slice(0, 6));
      return bolt(...args);
    };
    ring.crackle();
    const hash = createHash('sha256');
    for (let i = 0; i < 12; i++) {
      ring.step(1 / 60, i / 60);
      for (const object of ring.objects)
        for (const attr of Object.values(object.geometry.attributes)) hash.update(Buffer.from(attr.array.buffer));
    }
    const result = { starts, hash: hash.digest('hex') };
    for (const object of ring.objects) {
      object.geometry.dispose();
      object.material.dispose();
    }
    return result;
  } finally {
    Math.random = random;
    clock.mock.restore();
  }
}

test('crackle starts at the default ball height or the supplied live source', () => {
  setEffects({});
  try {
    const original = trace();
    assert.deepEqual(original.starts[0].slice(0, 3), [1, effects.lightning.height, 2]);
    assert.deepEqual(
      trace(() => new THREE.Vector3(1, effects.lightning.height, 2)),
      original,
    );
    let point = new THREE.Vector3(-3, 4, 5);
    const custom = trace(() => point);
    assert.deepEqual(custom.starts[0].slice(0, 3), point.toArray());
    point = new THREE.Vector3(3, 2, 1);
    assert.deepEqual(trace(() => point).starts[0].slice(0, 3), point.toArray());
    assert.equal(original.hash, '27e645af3fd8f8acbea1589bba908540023f58e73fd31be91977e38f6886e2f2');
  } finally {
    setEffects(content.effects);
  }
});
