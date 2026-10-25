// The envelope's wax seal and look (src/invitation/envelopeSeal.js, envelopeLook.js): the seal is
// a lumpy round blob (its outline wobbling, never far from round), its rim raised above a domed
// face, the NH monogram's strokes are logo.js's and fit inside the face; the parts' order puts a
// line on the lower side of every fold (the flap over the pocket, the seal over the flap, the
// petals over all); every part is the one toon material, drawn as its colours or as its id. The
// stamp reads as the NH logo at the seal's size on a desktop (about 28 texels across its radius)
// and a phone (about 38): each stroke a solid dark recess at least two texels wide, the N's
// diagonal too, the two middle stems apart, and a one-texel lit lip only along the strokes'
// lower edges (the crossbar's), so no stroke shows as a dark bar beside a light one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_STROKES } from '../src/ui/logo.js';
import { IDS, INK, PAPER, shared, toon } from '../src/invitation/envelopeLook.js';
import { STAMP, buildSeal, monogramSegments, sealEdge, sealGeometry, stampAt } from '../src/invitation/envelopeSeal.js';

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

/**
 * The stamp as drawn on a seal `radius` texels across its radius (r 1 in its own units), its texel
 * grid offset by (ox, oy) of a texel: what each texel centre shows, by rows from the top, over the
 * monogram's box. (envelopeSeal.js stampAt runs the shader's sums.)
 */
function stampTexels(radius, ox = 0, oy = 0) {
  const t = 1 / radius;
  const segs = monogramSegments(STAMP.height);
  const half = STAMP.height / 2 + t * 2;
  const rows = [];
  for (let y = half; y >= -half; y -= t) {
    const row = [];
    for (let x = -half; x <= half; x += t)
      row.push(stampAt(segs, STAMP.height * STAMP.stroke, t, x + ox * t, y + oy * t));
    rows.push({ y: y + oy * t, cells: row, x0: -half + ox * t });
  }
  return { rows, t };
}
/** Logo units (logo.js: x across, y 2…78 down) to the seal's, at STAMP.height. */
const fromLogo = (x, y) => [(x * STAMP.height) / 76, ((40 - y) * STAMP.height) / 76];

for (const [screen, radius] of [
  ['a desktop', 28],
  ['a phone', 38],
]) {
  test(`on ${screen} the stamp reads as NH: solid dark strokes two texels or more wide, the middle stems apart, a lit lip only along the strokes’ lower edges and never on the N’s diagonal`, () => {
    assert.ok(
      STAMP.height * STAMP.stroke * radius >= 2.9,
      `strokes ${(STAMP.height * STAMP.stroke * radius).toFixed(2)} texels wide`,
    );
    for (const [ox, oy] of [
      [0, 0],
      [0.25, 0.5],
      [0.5, 0.25],
      [0.75, 0.75],
    ]) {
      const { rows, t } = stampTexels(radius, ox, oy);
      // A row through the four stems and the diagonal (logo y 56 to 64): dark runs two texels or
      // more wide, none with a lit texel in it (at this size the N's diagonal meets its stems, as
      // the logo's does at the favicon's: the N, then H's two stems).
      for (const ly of [56, 60, 64]) {
        const [, sy] = fromLogo(0, ly);
        const row = rows.reduce((a, b) => (Math.abs(b.y - sy) < Math.abs(a.y - sy) ? b : a));
        const line = row.cells.map((c) => (c === 'deep' ? '#' : c === 'lip' ? '+' : '.')).join('');
        assert.ok(!line.includes('+'), `(${ox}, ${oy}) logo y ${ly}: no lit texel across the stems: ${line}`);
        const runs = line.split(/\.+/).filter(Boolean);
        assert.ok(runs.length >= 3, `(${ox}, ${oy}) logo y ${ly}: the N and H's two stems apart: ${line}`);
        for (const r of runs)
          assert.ok(r.length >= 2, `(${ox}, ${oy}) logo y ${ly}: a stroke ${r.length} wide: ${line}`);
      }
      // The face shows between the middle stems all the way down them (over and under the
      // crossbar), and inside H above and below it (at the texel nearest each spot).
      const near = (lx, ly) => {
        const [x, y] = fromLogo(lx, ly);
        const row = rows.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
        return row.cells[Math.round((x - row.x0) / t)];
      };
      for (const ly of [8, 14, 20, 26, 32, 38, 56, 62])
        assert.equal(near(0, ly), null, `(${ox}, ${oy}) between the middle stems at ${ly}`);
      for (const ly of [32, 38, 56, 62]) assert.equal(near(9.75, ly), null, `(${ox}, ${oy}) inside H at ${ly}`);
      // The diagonal's middle line: never lit.
      for (let k = 0.1; k <= 0.9; k += 0.05) {
        const [x, y] = fromLogo(-15 + 10.5 * k, 27 + 41 * k);
        const c = stampAt(monogramSegments(STAMP.height), STAMP.height * STAMP.stroke, t, x, y);
        assert.equal(c, 'deep', `(${ox}, ${oy}) the diagonal at ${k.toFixed(2)}`);
      }
      // The crossbar's lower edge, where the face shows under it (not where a stem goes on down):
      // lit, one texel high, the rest of the bar dark.
      let lit = 0;
      let open = 0;
      const [, top] = fromLogo(0, 47 - (STAMP.stroke * 76) / 2);
      for (let lx = -26; lx <= 26; lx += 1) {
        const [x] = fromLogo(lx, 47);
        const col = rows.map((r) => r.cells[Math.round((x - r.x0) / t)]);
        const first = rows.findIndex((r, i) => r.y <= top + t && col[i]);
        if (first < 0) continue;
        let last = first;
        while (col[last + 1]) last++;
        // (A stem going on down under the bar: no lower edge here.)
        if (rows[last].y < fromLogo(0, 47 + STAMP.stroke * 76)[1]) continue;
        open++;
        const bar = col.slice(first, last + 1);
        if (bar.at(-1) === 'lip' && bar.filter((c) => c === 'lip').length === 1) lit++;
      }
      assert.ok(open >= 10, `(${ox}, ${oy}) ${open} columns with the face under the crossbar`);
      assert.ok(lit >= open * 0.9, `(${ox}, ${oy}) the crossbar lit along ${lit} of ${open} columns`);
    }
  });
}

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
