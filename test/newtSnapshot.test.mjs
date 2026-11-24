// Rendering can inspect the actual world's snapshot bridge without verifying seal rasters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapshotLetter } from '../src/visualizer/newt/fireDuck.js';

test('world page and letter-frame reads leave seal diagnostics lazy until requested', () => {
  let reads = 0;
  const seal = { placedAt: { faceMatches: true } };
  const actor = {
    inner: { matrixWorld: new THREE.Matrix4().makeTranslation(3, 4, 5) },
    get sealAt() {
      reads++;
      return seal;
    },
  };
  const snapshot = () => ({
    page: 'dusk',
    letter: snapshotLetter({ id: 7, state: 'waiting' }, actor, (a) =>
      new THREE.Vector3().setFromMatrixPosition(a.inner.matrixWorld),
    ),
  });
  assert.equal(snapshot().page, 'dusk');
  assert.deepEqual(snapshot().letter.frame, new THREE.Vector3(3, 4, 5));
  assert.equal(reads, 0, 'page and frame reads must not verify seal pixels');
  assert.equal(snapshot().letter.seal, seal);
  assert.equal(reads, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot())).letter.seal, seal);
  assert.equal(reads, 2, 'serialization requests the diagnostic seal snapshot');
  assert.equal(snapshotLetter(null, actor), null);
  assert.equal(snapshotLetter({ id: 8 }, null).seal, null);
  assert.equal(snapshotLetter({ id: 8 }, null).frame, null);
});
