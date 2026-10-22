// NEWT's blinks on the dialogue's faces (src/invitation/faces.js): none on sad, angry, shy or smug
// (clips.js EXTRA_FACES), as a blink is neutral's closed eye under neutral's brows and sad's or
// angry's would jump for it; back on neutral they come again as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_FACES } from '../src/invitation/clips.js';
import { createFaceState, faceStep } from '../src/invitation/faces.js';
import { createRng } from '../src/invitation/rng.js';

const NAMES = /** @type {Array<import('../src/invitation/clips.js').FaceName>} */ (Object.keys(EXTRA_FACES));

test('the blinks: never on the dialogue faces (a blink is neutral’s closed eye: his brows would jump), as before on the first four', () => {
  const rng = createRng(5);
  const st = createFaceState();
  let t = 0;
  for (const name of NAMES)
    for (let i = 0; i < 60 * 30; i++, t += 1 / 30)
      assert.equal(faceStep(st, name, 'normal', t, rng), name, `${name} at ${t.toFixed(2)} s`);
  // Back on neutral, the blinks come again.
  let blinks = 0;
  for (let i = 0; i < 60 * 30; i++, t += 1 / 30) if (faceStep(st, 'neutral', 'normal', t, rng) === 'blink') blinks++;
  assert.ok(blinks > 0, 'neutral blinks again');
});
