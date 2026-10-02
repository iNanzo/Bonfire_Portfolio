// The height map's CPU part a few rows at a time (src/bonfire/terrain.js heightSteps): what
// the places built beforehand run in idle moments. Stepped or run through, the same map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightSteps } from '../src/bonfire/terrain.js';

const MAX_H = 4; // (terrain.js packs heights into 16 bits over [0, 4] m)

/** Heights as drawn (two bytes a cell): a 1 m block over cells i 100–139, j 150–179, on flat ground. */
function drawn(res) {
  const px = new Uint8Array(res * res * 4);
  const v = Math.round((1 / MAX_H) * 65535);
  for (let j = 150; j < 180; j++) for (let i = 100; i < 140; i++) {
    px[(j * res + i) * 4] = v >> 8;
    px[(j * res + i) * 4 + 1] = v & 255;
  }
  return px;
}

test('stepped, the height map comes in small steps and reads the heights drawn', () => {
  const o = { size: 12, res: 320, pad: 2 };
  const steps = heightSteps(drawn(o.res), o);
  let yields = 0;
  let r = steps.next();
  while (!r.done) { yields++; r = steps.next(); }
  assert.ok(yields >= 10, `a few rows a step (${yields} steps)`);
  const map = r.value;
  const cell = o.size / o.res;
  const x = (i) => -o.size / 2 + (i + 0.5) * cell;
  const z = (j) => o.size / 2 - (j + 0.5) * cell;
  assert.ok(Math.abs(map.top(x(120), z(160)) - 1) < 1e-3, 'on the block: 1 m');
  assert.equal(map.top(x(20), z(20)), 0, 'the ground: 0');
  assert.ok(Math.abs(map.solid(x(98), z(160)) - 1) < 1e-3, 'grown by the pad beside it');
  assert.equal(map.solid(x(96), z(160)), 0, 'and no further');
  assert.ok(map.wallSpots.length > 0 && map.wallSpots.every((w) => w.hi - w.lo >= 0.25), 'its sides are walls to land on');
});
