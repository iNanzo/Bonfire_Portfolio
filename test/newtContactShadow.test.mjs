// The contact cue preserves scene alpha and releases its GPU resources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createContactShadow } from '../src/visualizer/newt/contactShadow.js';
import { createResourceScope } from '../src/bonfire/resources.js';

test('contact shadow fades to transparent edges without changing the scene surface id', () => {
  const scene = new THREE.Scene(),
    scope = createResourceScope();
  const blob = createContactShadow({ scene, scope, color: 0, ghost: 7 });
  assert.equal(blob.parent, scene);
  assert.equal(blob.layers.mask, 1 << 7);
  const { material } = blob,
    data = material.map.image.data;
  assert.equal(data[3], 0);
  assert.ok(data[(16 * 32 + 16) * 4 + 3] > 230);
  assert.equal(material.depthWrite, false);
  assert.equal(material.blendSrcAlpha, THREE.ZeroFactor);
  assert.equal(material.blendDstAlpha, THREE.OneFactor);
  let disposed = 0;
  for (const item of [material, material.map, blob.geometry]) item.addEventListener('dispose', () => disposed++);
  scope.dispose();
  assert.equal(disposed, 3);
});
