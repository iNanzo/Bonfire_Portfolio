// The envelope's wax seal and look (src/invitation/envelopeSeal.js, envelopeLook.js): the seal is
// a lumpy round blob (its outline wobbling, never far from round), its rim raised above a domed
// face, the NH monogram's strokes are logo.js's and fit inside the face; the parts' order puts a
// line on the lower side of every fold (the flap over the pocket, the seal over the flap, the
// petals over all); every part is the one toon material, drawn as its colours or as its id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_STROKES } from '../src/ui/logo.js';
import { IDS, INK, PAPER, shared, toon } from '../src/invitation/envelopeLook.js';
import { STAMP, buildSeal, monogramSegments, sealEdge, sealGeometry } from '../src/invitation/envelopeSeal.js';

test('the seal’s outline wobbles like pressed wax, never more than about 15% off round', () => {
  const r = [];
  for (let a = 0; a < Math.PI * 2; a += 0.05) r.push(sealEdge(a));
  assert.ok(Math.min(...r) >= 0.85 && Math.max(...r) <= 1.15, `${Math.min(...r)}…${Math.max(...r)}`);
  assert.ok(Math.max(...r) - Math.min(...r) > 0.1, 'lumpy, not a circle');
});

test('its rim stands above its domed face, and the edge comes down to the paper', () => {
  const r = 1;
  const pos = sealGeometry(r).attributes.position;
  let face = 0;
  let rim = 0;
  let edge = 1;
  for (let i = 0; i < pos.count; i++) {
    const rho = Math.hypot(pos.getX(i), pos.getY(i)) / sealEdge(Math.atan2(pos.getY(i), pos.getX(i)));
    const z = pos.getZ(i);
    if (rho < 0.6) face = Math.max(face, z);
    else if (rho > 0.75 && rho < 0.92) rim = Math.max(rim, z);
    if (rho > 0.99) edge = Math.min(edge, z);
  }
  assert.ok(rim > face + 0.03, `the rim ${rim} over the face ${face}`);
  assert.ok(edge < 0.1, 'down at the edge');
});

test('the monogram is logo.js’s six strokes, upright, inside the seal’s face', () => {
  const segs = monogramSegments(STAMP.height);
  assert.equal(segs.length, LOGO_STROKES.length);
  segs.forEach(([x0, y0, x1, y1], i) => {
    const [a, b, c, d] = LOGO_STROKES[i];
    const k = STAMP.height / 76;
    assert.ok(Math.abs(x0 - a * k) < 1e-9 && Math.abs(x1 - c * k) < 1e-9, 'the same strokes across');
    assert.ok(Math.abs(y0 - y1 - (d - b) * k) < 1e-9, 'y up, not down');
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ])
      assert.ok(Math.hypot(x, y) + (STAMP.stroke * STAMP.height) / 2 < 0.75, 'inside the face, within the rim');
  });
  assert.ok(STAMP.stroke * STAMP.height < (9 / 76) * STAMP.height, 'a gap between the two middle strokes');
});

test('the parts’ order lines every fold on its lower side, and the seal is in two halves', () => {
  assert.ok(IDS.body < IDS.inside && IDS.inside < IDS.left && IDS.left < IDS.bottom && IDS.right < IDS.bottom);
  assert.ok(IDS.bottom < IDS.flap && IDS.flap < IDS.seal && IDS.seal < IDS.petal);
  assert.ok(
    Object.values(IDS).every((v) => v > 0 && v < 256),
    'none is the empty paper (0)',
  );
  assert.equal(INK, 0x3a332d, 'the toy’s ink');
  const u = shared();
  const m = toon(PAPER, u, IDS.flap);
  assert.equal(m.uniforms.uId.value, IDS.flap);
  assert.equal(m.uniforms.uIdPass, u.uIdPass, 'one switch for every part’s id pass');
  assert.equal(m.uniforms.uDissolve, u.uDissolve, 'one dissolve for the whole letter');
  const seal = buildSeal(u, 0.3);
  assert.equal(seal.halves.length, 2);
  const sides = seal.halves.map((h) => /** @type {any} */ (h.children[0]).material.uniforms.uSide.value);
  assert.deepEqual(sides, [-1, 1]);
});
