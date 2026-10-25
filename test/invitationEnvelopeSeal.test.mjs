// The envelope's wax seal and look (src/invitation/envelopeSeal.js, envelopeLook.js): the seal is
// a lumpy round blob (its outline wobbling, never far from round), its rim raised above a domed
// face; the parts' order puts a line on the lower side of every fold (the flap over the pocket,
// the seal over the flap, the petals over all); every part is the one toon material, drawn as its
// colours or as its id. The NH stamp's strokes are logo.js's PATH, and it's drawn on the seal's
// own texels (stampLayout, stampCell: the shader's sums), so it reads as the logo at the seal's
// size on a desktop and a phone (about 31 and 42 texels across its radius): four even uprights,
// the N's diagonal at least as wide as them and stepping across from the outer stem to the inner
// one, the middle stems apart, every stroke a solid dark recess, and a one-texel lit lip only
// under the crossbar and the stems' feet (the wall that faces the light from above).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOGO_STROKES } from '../src/ui/logo.js';
import { IDS, INK, PAPER, shared, toon } from '../src/invitation/envelopeLook.js';
import {
  MONOGRAM_PATH,
  MONOGRAM_STROKES,
  SEAL_SIZE,
  buildSeal,
  diagonalAt,
  sealEdge,
  sealGeometry,
  sealTexel,
  stampCell,
  stampLayout,
} from '../src/invitation/envelopeSeal.js';

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

test('the stamp’s strokes come from logo.js’s PATH: the same path, the same six strokes', () => {
  const src = readFileSync(new URL('../src/ui/logo.js', import.meta.url), 'utf8');
  const path = /const PATH = '([^']+)'/.exec(src)?.[1];
  assert.equal(MONOGRAM_PATH, path, 'the PATH, copied as it is');
  assert.deepEqual(MONOGRAM_STROKES, LOGO_STROKES);
});

test('the seal is a little bigger than it was for its stamp’s sake, still a seal, not a coin', () => {
  assert.ok(SEAL_SIZE > 0.18 && SEAL_SIZE <= 0.21, `its radius ${SEAL_SIZE} of the letter’s width`);
});

test('a texel at the seal’s face: the envelope’s texel, smaller the nearer the face is to the camera', () => {
  assert.equal(sealTexel(3, 300, 0.5, 0, 6), 3 / 300 / 0.5);
  assert.ok(Math.abs(sealTexel(3, 300, 0.5, 0.3, 6) - ((3 / 300 / 0.5) * 5.7) / 6) < 1e-12);
});

/**
 * The stamp on a seal `radius` texels across its radius: its layout and a reader of its cells.
 * @param {number} radius
 */
function stampOf(radius) {
  const L = stampLayout(radius);
  const at = (/** @type {number} */ i, /** @type {number} */ j) => stampCell(L, i, j);
  const n = Math.ceil(radius);
  return { L, at, n };
}
/** Desktops' seals to phones' (about 31 and 42 texels across the radius) and either side. */
const RADII = /** @type {number[]} */ ([]);
for (let r = 26; r <= 46; r += 0.25) RADII.push(r);

test('the stamp’s four uprights are even, the crossbar as thick, the N’s diagonal at least as wide, all inside the face', () => {
  for (const radius of RADII) {
    const { L, at, n } = stampOf(radius);
    const [ol, il, ir, or, bar] = L.boxes;
    for (const b of [ol, il, ir, or]) assert.equal(b[2] - b[0], L.stem, `${radius}: an upright ${b[2] - b[0]} wide`);
    assert.equal(bar[3] - bar[1], L.stem, `${radius}: the crossbar as thick as the uprights`);
    assert.ok(L.stem >= 2, `${radius}: strokes two texels or more`);
    assert.ok(L.diagonal >= L.stem, `${radius}: the diagonal ${L.diagonal} as wide as the stems ${L.stem} or more`);
    // (Mirrored: H's stems where N's are, across the middle; the crossbar's ends too.)
    assert.deepEqual([-ir[2], ir[1], -ir[0], ir[3]], il, `${radius}: the inner stems mirrored`);
    assert.deepEqual([-or[2], or[1], -or[0], or[3]], ol, `${radius}: the outer stems mirrored`);
    assert.equal(-bar[0], bar[2], `${radius}: the crossbar centred`);
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++)
        if (at(i, j))
          assert.ok(Math.hypot(i + 0.5, j + 0.5) < 0.75 * radius, `${radius}: (${i}, ${j}) inside the face`);
  }
});

test('the N’s diagonal steps from the top of the outer stem down to the foot of the inner one, seen apart from each', () => {
  for (const radius of RADII) {
    const { L, at } = stampOf(radius);
    const [ol, il, , , bar] = L.boxes;
    const { y0, y1 } = L.diag;
    assert.equal(y0, ol[3], `${radius}: from the outer stem’s top`);
    assert.equal(y1, il[1], `${radius}: to the inner stem’s foot`);
    let last = -Infinity;
    let freeOfInner = 0;
    let freeOfOuter = 0;
    for (let j = y0 - 1; j >= y1; j--) {
      const [a, b] = diagonalAt(L, j);
      assert.ok(b - a >= L.stem, `${radius}: row ${j} ${b - a} wide`);
      assert.ok(a >= last, `${radius}: row ${j} never back to the left`);
      last = a;
      if (j >= bar[1] && j < bar[3]) continue;
      if (at(b, j) === null && b < il[0]) freeOfInner++;
      if (at(a - 1, j) === null && a > ol[2]) freeOfOuter++;
    }
    const rows = y0 - y1;
    assert.ok(diagonalAt(L, y0 - 1)[0] <= ol[0] + 1, `${radius}: it starts on the outer stem`);
    assert.ok(diagonalAt(L, y1)[1] >= il[2] - 1, `${radius}: it ends on the inner stem`);
    assert.ok(
      freeOfInner >= rows * 0.25,
      `${radius}: the face between it and the inner stem on ${freeOfInner} of ${rows} rows`,
    );
    assert.ok(
      freeOfOuter >= rows * 0.25,
      `${radius}: the face between it and the outer stem on ${freeOfOuter} of ${rows} rows`,
    );
  }
});

test('the middle stems stand apart all the way up, and H is open over and under its crossbar', () => {
  for (const radius of RADII) {
    const { L, at } = stampOf(radius);
    const [, il, ir, or, bar] = L.boxes;
    assert.ok(ir[0] - il[2] >= 2, `${radius}: two texels or more between them`);
    for (let j = il[1]; j < il[3]; j++) {
      if (j >= bar[1] - 1 && j < bar[3]) continue;
      for (let i = il[2]; i < ir[0]; i++)
        assert.equal(at(i, j), null, `${radius}: between the middle stems at (${i}, ${j})`);
    }
    for (const j of [bar[1] - 2, or[1] + 1, bar[3] + 1, or[3] - 1])
      for (let i = ir[2]; i < or[0]; i++) assert.equal(at(i, j), null, `${radius}: inside H at (${i}, ${j})`);
  }
});

test('every stroke is a solid dark recess, with a lit lip only right under the crossbar and the stems’ feet', () => {
  for (const radius of RADII) {
    const { L, at, n } = stampOf(radius);
    const bar = L.boxes[4];
    const inBox = (/** @type {number} */ i, /** @type {number} */ j) =>
      L.boxes.some(([x0, y0, x1, y1]) => i >= x0 && i < x1 && j >= y0 && j < y1);
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++) {
        const c = at(i, j);
        if (inBox(i, j)) assert.equal(c, 'deep', `${radius}: (${i}, ${j}) a solid recess`);
        if (c === 'lip') assert.ok(inBox(i, j + 1) && !inBox(i, j), `${radius}: (${i}, ${j}) lit only under a stroke`);
      }
    let under = 0;
    let lit = 0;
    const [da, db] = diagonalAt(L, bar[1] - 1);
    for (let i = bar[0]; i < bar[2]; i++) {
      if (inBox(i, bar[1] - 1) || (i >= da && i < db)) continue;
      under++;
      if (at(i, bar[1] - 1) === 'lip') lit++;
    }
    assert.ok(under >= 10 && lit === under, `${radius}: lit under the crossbar along ${lit} of ${under} columns`);
    for (const [x0, y0, x1] of L.boxes.slice(0, 4))
      for (let i = x0; i < x1; i++) assert.equal(at(i, y0 - 1), 'lip', `${radius}: lit under a stem’s foot at ${i}`);
  }
});

test('the seal’s shader draws the layout for its texel: setTexel hands it the cells stampLayout has', () => {
  const r = 0.3;
  const seal = buildSeal(shared(), r);
  /** @type {any} */
  let mat = null;
  seal.group.traverse((o) => {
    const m = /** @type {any} */ (o).material;
    if (m?.defines && 'SEAL' in m.defines) mat = m;
  });
  for (const t of [r / 31, r / 42]) {
    seal.setTexel(t);
    const L = stampLayout(r / t);
    assert.equal(mat.uniforms.uTexelS.value, t);
    assert.deepEqual(
      mat.uniforms.uBox.value.map((/** @type {any} */ v) => [v.x, v.y, v.z, v.w]),
      L.boxes,
    );
    const d = mat.uniforms.uDiag.value;
    assert.deepEqual([d.x, d.y, d.z, d.w], [L.diag.x0, L.diag.y0, L.diag.x1, L.diag.y1]);
    assert.equal(mat.uniforms.uDiagW.value, L.diagonal);
  }
});

test('the parts’ order lines every fold on its lower side, and the seal is one piece (no halves to carry its stamp)', () => {
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
  assert.equal(/** @type {any} */ (seal).halves, undefined, 'no halves');
  const stamped = [];
  seal.group.traverse((o) => {
    const mat = /** @type {any} */ (o).material;
    if (mat?.defines && 'SEAL' in mat.defines) stamped.push(o);
  });
  assert.equal(stamped.length, 1, 'the monogram on the one seal, nowhere else');
  assert.equal(/** @type {any} */ (stamped[0]).material.uniforms.uSide, undefined, 'never clipped in two');
});
