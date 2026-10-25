// The envelope's wax seal and look (src/invitation/envelopeSeal.js, envelopeLook.js), read like
// the user's reference (2026-10-24): a round seal with a gently wavy edge, a raised rim with a
// highlight band on its lit side, a thin ring inside the rim, a flat recessed field, the NH logo
// debossed in that field in thin strokes, and exactly one stray splotch of wax beside it. Its
// face is drawn once, texel by texel (sealFace), at the size it shows on the screen, and put on
// the screen texel for texel, so moving the letter moves a steady picture. The stamp's strokes
// are logo.js's PATH, one texel wide (two before), each a dark floor with a one-texel light lip on
// its lit side (right of every stroke, under the crossbar and the stems' feet), all inside the
// ring, reading as N and H on a desktop and a phone (about 31 and 42 texels across the radius).
// The parts' order puts a line on the lower side of every fold, and every part is the one toon
// material, drawn as its colours or as its id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { LOGO_STROKES } from '../src/ui/logo.js';
import { HOVER, IDS, INK, LIGHT, PAPER, SHADES, WAX, rgb, shared, toon } from '../src/invitation/envelopeLook.js';
import { HOVER_INK } from '../src/invitation/retro.js';
import {
  MONOGRAM_PATH,
  MONOGRAM_STROKES,
  SEAL_SIZE,
  buildSeal,
  diagonalAt,
  sealEdge,
  sealFace,
  sealLayout,
  sealOnScreen,
  stampCell,
  stampLayout,
} from '../src/invitation/envelopeSeal.js';

/** Desktops' seals to phones' (about 31 and 42 texels across the radius) and either side. */
const RADII = /** @type {number[]} */ ([]);
for (let r = 26; r <= 46; r += 0.25) RADII.push(r);
/** A few of them, for the slower checks of the whole face. */
const SOME = [26, 31, 36.5, 42, 46];

test('its edge is gently wavy: never more than 7% off round, but not a plain circle', () => {
  const r = [];
  for (let a = 0; a < Math.PI * 2; a += 0.02) r.push(sealEdge(a));
  assert.ok(Math.min(...r) >= 0.93 && Math.max(...r) <= 1.07, `${Math.min(...r)}…${Math.max(...r)}`);
  assert.ok(Math.max(...r) - Math.min(...r) > 0.06, 'wavy, not a circle');
  // (Gentle: no sharp lumps, its slope small.)
  for (let a = 0; a < Math.PI * 2; a += 0.02)
    assert.ok(Math.abs(sealEdge(a + 0.01) - sealEdge(a)) / 0.01 < 0.4, `steep at ${a}`);
});

test('the layout: a flat field inside a thin ring inside the rim, and one stray splotch clear of the edge', () => {
  for (const R of RADII) {
    const L = sealLayout(R);
    assert.ok(L.ring > 0.66 * R && L.ring < 0.78 * R, `${R}: the ring at ${L.ring}`);
    assert.ok(L.field <= L.ring - 0.5 && L.field >= L.ring - 1.5, `${R}: the field out to ${L.field}`);
    assert.ok(L.rim >= L.ring + 1.5, `${R}: the rim starts ${L.rim}, a texel or more past the ring`);
    assert.ok(L.rim <= 0.93 * R - 4, `${R}: the rim ${R * 0.93 - L.rim} texels wide or more`);
    assert.equal(L.splotches.length, 1, 'exactly one splotch');
    const [s] = L.splotches;
    const a = Math.atan2(s.y, s.x);
    const gap = Math.hypot(s.x, s.y) - s.r - R * sealEdge(a);
    assert.ok(gap >= 3, `${R}: the splotch ${gap} texels clear (its line and the paper between)`);
    assert.ok(gap <= 0.25 * R, `${R}: and beside it, not off on its own`);
    assert.ok(s.r >= 2.5 && s.r <= 0.18 * R, `${R}: a splotch ${s.r} across`);
  }
});

test('the stamp’s strokes come from logo.js’s PATH: the same path, the same six strokes', () => {
  const src = readFileSync(new URL('../src/ui/logo.js', import.meta.url), 'utf8');
  const path = /const PATH = '([^']+)'/.exec(src)?.[1];
  assert.equal(MONOGRAM_PATH, path, 'the PATH, copied as it is');
  assert.deepEqual(MONOGRAM_STROKES, LOGO_STROKES);
});

test('the seal is a seal, not a coin', () => {
  assert.ok(SEAL_SIZE > 0.18 && SEAL_SIZE <= 0.21, `its radius ${SEAL_SIZE} of the letter’s width`);
});

test('drawn for its axes on the screen: upright and round it’s the seal of that radius, texel for texel', () => {
  for (const R of SOME) assert.deepEqual(sealFace([R, 0, 0, R]).tones, sealFace(R).tones, `${R}`);
});

/**
 * The wax's extent along a screen direction (cos a, sin a): the furthest texel middle of the seal
 * itself (the splotch left out), texels from its middle.
 * @param {ReturnType<typeof sealFace>} f
 * @param {number} a
 */
function reach(f, a) {
  let most = 0;
  for (let j = -f.c; j < f.c; j++)
    for (let i = -f.c; i < f.c; i++) {
      if (!f.at(i, j)) continue;
      const x = i + 0.5;
      const y = j + 0.5;
      // (Within a texel of the line.)
      if (Math.abs(-Math.sin(a) * x + Math.cos(a) * y) > 0.71) continue;
      const along = Math.cos(a) * x + Math.sin(a) * y;
      if (along > 0 && Math.hypot(x, y) < f.c * 0.9) most = Math.max(most, along);
    }
  return most;
}

test('turned and narrowed as the letter leans and turns, its outline is the ellipse its axes make, the stamp upright', () => {
  for (const R of [31, 42]) {
    const k = 0.86;
    const lean = -0.36;
    const [c, s] = [Math.cos(lean), Math.sin(lean)];
    const f = sealFace([k * R * c, k * R * s, -R * s, R * c]);
    const round = sealFace(R);
    // (Its wavy edge along each of its own axes, against the round one's there: narrower along the
    // turned one.)
    // (Away from the splotch, which sits by the x axis.)
    const across = reach(f, lean + Math.PI) / reach(round, Math.PI);
    const up = reach(f, lean + Math.PI / 2) / reach(round, Math.PI / 2);
    assert.ok(Math.abs(across - k) < 0.06, `${R}: ${across.toFixed(3)} across its narrowed axis`);
    assert.ok(Math.abs(up - 1) < 0.06, `${R}: ${up.toFixed(3)} along the other`);
    // (Still the seal and its one splotch.)
    assert.equal(blobs(f).length, 2, `${R}: two blobs`);
    // (The stamp upright on the screen, as at rest: its strokes and lips where the round one has them.)
    const S = stampLayout(Math.sqrt(k) * R);
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        const cell = stampCell(S, i, j);
        if (cell === 'deep') assert.equal(f.at(i, j), 3, `${R}: a stroke at (${i}, ${j})`);
        else if (cell === 'lip') assert.equal(f.at(i, j), 1, `${R}: a lip at (${i}, ${j})`);
      }
  }
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

test('the stamp’s strokes are one texel wide (thinner than the two they were), even and mirrored, all inside the ring', () => {
  for (const radius of RADII) {
    const { L, at, n } = stampOf(radius);
    const [ol, il, ir, or, bar] = L.boxes;
    assert.equal(L.stem, 1, `${radius}: strokes one texel wide`);
    assert.equal(L.diagonal, 1, `${radius}: the diagonal too`);
    for (const b of [ol, il, ir, or]) assert.equal(b[2] - b[0], 1, `${radius}: an upright ${b[2] - b[0]} wide`);
    assert.equal(bar[3] - bar[1], 1, `${radius}: the crossbar one texel high`);
    assert.deepEqual([-ir[2], ir[1], -ir[0], ir[3]], il, `${radius}: the inner stems mirrored`);
    assert.deepEqual([-or[2], or[1], -or[0], or[3]], ol, `${radius}: the outer stems mirrored`);
    assert.equal(-bar[0], bar[2], `${radius}: the crossbar centred`);
    const { ring } = sealLayout(radius);
    let h = 0;
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++)
        if (at(i, j)) {
          assert.ok(Math.hypot(i + 0.5, j + 0.5) < ring - 1.5, `${radius}: (${i}, ${j}) inside the ring`);
          h = Math.max(h, Math.abs(j + 0.5));
        }
    assert.ok(h > 0.55 * ring, `${radius}: big enough to read (${h} of ${ring})`);
  }
});

test('the N’s diagonal steps from the top of the outer stem down to the foot of the inner one, unbroken, seen apart from each', () => {
  for (const radius of RADII) {
    const { L, at } = stampOf(radius);
    const [ol, il, , , bar] = L.boxes;
    const { y0, y1 } = L.diag;
    assert.equal(y0, ol[3], `${radius}: from the outer stem’s top`);
    assert.equal(y1, il[1], `${radius}: to the inner stem’s foot`);
    let last = diagonalAt(L, y0 - 1)[0];
    let freeOfInner = 0;
    let freeOfOuter = 0;
    for (let j = y0 - 1; j >= y1; j--) {
      const [a, b] = diagonalAt(L, j);
      assert.equal(b - a, 1, `${radius}: row ${j} one texel`);
      assert.ok(a >= last && a <= last + 1, `${radius}: row ${j} steps at most one texel, rightward`);
      last = a;
      if (j >= bar[1] - 1 && j < bar[3]) continue;
      if (at(b + 1, j) === null && b + 1 < il[0]) freeOfInner++;
      if (at(a - 1, j) === null && a - 1 > ol[2]) freeOfOuter++;
    }
    const rows = y0 - y1;
    assert.ok(diagonalAt(L, y0 - 1)[0] <= ol[0] + 1, `${radius}: it starts on the outer stem`);
    assert.ok(diagonalAt(L, y1)[1] >= il[2] - 1, `${radius}: it ends on the inner stem`);
    assert.ok(freeOfInner >= rows * 0.3, `${radius}: clear of the inner stem on ${freeOfInner} of ${rows} rows`);
    assert.ok(freeOfOuter >= rows * 0.3, `${radius}: clear of the outer stem on ${freeOfOuter} of ${rows} rows`);
  }
});

test('the middle stems stand apart with clear field between, and H is open over and under its crossbar', () => {
  for (const radius of RADII) {
    const { L, at } = stampOf(radius);
    const [, il, ir, or, bar] = L.boxes;
    assert.ok(ir[0] - il[2] >= 2, `${radius}: two texels or more between them`);
    for (let j = il[1]; j < il[3]; j++) {
      if (j >= bar[1] - 1 && j < bar[3]) continue;
      // (Right of the N's stem, its lip; then clear field up to the H's.)
      assert.equal(at(il[2], j), 'lip', `${radius}: the lip right of the N’s inner stem at ${j}`);
      for (let i = il[2] + 1; i < ir[0]; i++)
        assert.equal(at(i, j), null, `${radius}: between the stems at (${i}, ${j})`);
    }
    for (const j of [bar[1] - 2, or[1] + 1, bar[3] + 1, or[3] - 1])
      for (let i = ir[2] + 1; i < or[0]; i++) assert.equal(at(i, j), null, `${radius}: inside H at (${i}, ${j})`);
  }
});

test('every stroke is a dark floor, with a one-texel light lip on its lit side only', () => {
  for (const radius of RADII) {
    const { L, at, n } = stampOf(radius);
    const bar = L.boxes[4];
    const inBox = (/** @type {number} */ i, /** @type {number} */ j) =>
      L.boxes.some(([x0, y0, x1, y1]) => i >= x0 && i < x1 && j >= y0 && j < y1);
    const deep = (/** @type {number} */ i, /** @type {number} */ j) => at(i, j) === 'deep';
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++) {
        const c = at(i, j);
        if (inBox(i, j)) assert.equal(c, 'deep', `${radius}: (${i}, ${j}) a recess`);
        // (Lit from the upper left: the wall on a stroke's right, and under a straight one.)
        if (c === 'lip') assert.ok(deep(i - 1, j) || inBox(i, j + 1), `${radius}: (${i}, ${j}) lit beside no stroke`);
        if (c === null) assert.ok(!deep(i - 1, j) && !inBox(i, j + 1), `${radius}: (${i}, ${j}) should be lit`);
      }
    for (let i = bar[0] + 1; i < bar[2]; i++)
      if (!deep(i, bar[1] - 1)) assert.equal(at(i, bar[1] - 1), 'lip', `${radius}: lit under the crossbar at ${i}`);
    for (const [x0, y0, x1] of L.boxes.slice(0, 4))
      for (let i = x0; i < x1; i++) assert.equal(at(i, y0 - 1), 'lip', `${radius}: lit under a stem’s foot at ${i}`);
  }
});

/**
 * The face's connected blobs of wax (4 ways), biggest first, each its texel count and middle.
 * @param {ReturnType<typeof sealFace>} f
 */
function blobs(f) {
  const seen = new Uint8Array(f.size * f.size);
  const out = [];
  for (let k = 0; k < seen.length; k++) {
    if (seen[k] || !f.tones[k]) continue;
    const stack = [k];
    seen[k] = 1;
    let count = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const q = /** @type {number} */ (stack.pop());
      const x = q % f.size;
      const y = (q - x) / f.size;
      count++;
      sx += x;
      sy += y;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= f.size || ny >= f.size) continue;
        const nk = ny * f.size + nx;
        if (!seen[nk] && f.tones[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    out.push({ count, x: sx / count + 0.5 - f.c, y: sy / count + 0.5 - f.c });
  }
  return out.sort((a, b) => b.count - a.count);
}

test('the face is the seal and exactly one stray splotch: two blobs of wax, nothing else', () => {
  for (const R of SOME) {
    const f = sealFace(R);
    const b = blobs(f);
    assert.equal(b.length, 2, `${R}: ${b.length} blobs`);
    assert.ok(Math.hypot(b[0].x, b[0].y) < 1.5, `${R}: the seal round its middle`);
    const [s] = sealLayout(R).splotches;
    assert.ok(Math.hypot(b[1].x - s.x, b[1].y - s.y) < 1, `${R}: the splotch where the layout puts it`);
    // (Every texel one of the wax's three tones, or nothing.)
    assert.ok(f.tones.every((t) => t <= 3));
  }
});

test('the field is flat (mid), the ring and the strokes dark, their lips light', () => {
  for (const R of SOME) {
    const f = sealFace(R);
    const { ring } = sealLayout(R);
    const S = stampLayout(R);
    const n = Math.ceil(ring) + 1;
    let ringDark = 0;
    let ringAll = 0;
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++) {
        const d = Math.hypot(i + 0.5, j + 0.5);
        const t = f.at(i, j);
        const c = stampCell(S, i, j);
        if (c === 'deep') assert.equal(t, 3, `${R}: a stroke at (${i}, ${j}) dark`);
        else if (c === 'lip') assert.equal(t, 1, `${R}: a lip at (${i}, ${j}) light`);
        else if (d < ring - 1.5) assert.equal(t, 2, `${R}: the field at (${i}, ${j}) flat`);
        const onRing = Math.abs(d - ring) < 0.5;
        ringAll += onRing ? 1 : 0;
        ringDark += onRing && t === 3 ? 1 : 0;
      }
    assert.equal(ringDark, ringAll, `${R}: the ring dark all round`);
  }
});

test('the rim is raised and lit from the upper left: a light band there, shade on the lower right', () => {
  for (const R of SOME) {
    const f = sealFace(R);
    const L = sealLayout(R);
    /** Tones on the rim's outer slope within 40° of angle `a`. */
    const tally = (/** @type {number} */ a) => {
      const k = [0, 0, 0, 0];
      const n = Math.ceil(R * 1.1);
      for (let j = -n; j <= n; j++)
        for (let i = -n; i <= n; i++) {
          const x = i + 0.5;
          const y = j + 0.5;
          const b = Math.atan2(y, x);
          const off = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
          const d = Math.hypot(x, y) / (R * sealEdge(b));
          if (off < (40 * Math.PI) / 180 && d > 0.88 && d < 0.98) k[f.at(i, j)]++;
        }
      return k;
    };
    const lit = Math.atan2(LIGHT[1], LIGHT[0]);
    const up = tally(lit);
    const down = tally(lit + Math.PI);
    assert.ok(up[1] > (up[2] + up[3]) * 1.5, `${R}: the band toward the light mostly light ${up}`);
    assert.ok(down[3] > (down[1] + down[2]) * 1.5, `${R}: away from it mostly shade ${down}`);
    // (The rim stands above the field: its inner wall facing the light, on the lower right, is lit too.)
    let innerLit = 0;
    for (let k = 0; k < 120; k++) {
      const a = lit + Math.PI + (k / 120 - 0.5) * 1.2;
      const d = L.rim + 1;
      if (f.at(Math.floor(Math.cos(a) * d), Math.floor(Math.sin(a) * d)) === 1) innerLit++;
    }
    assert.ok(innerLit > 60, `${R}: the inner wall on the lower right lit (${innerLit} of 120)`);
  }
});

test('the seal’s face is a texture of sealFace’s tones in the wax’s colours, put on the screen texel for texel', () => {
  const u = shared();
  const seal = buildSeal(u, 0.4);
  for (const R of [31, 42]) {
    seal.place(100, 50, [R, 0, 0, R]);
    const f = sealFace(R);
    const tex = seal.material.uniforms.uFace.value;
    assert.equal(tex.image.width, f.size);
    assert.equal(tex.image.height, f.size);
    assert.equal(seal.material.uniforms.uFaceC.value, f.c);
    const data = tex.image.data;
    for (let k = 0; k < f.tones.length; k += 7) {
      const t = f.tones[k];
      if (!t) {
        assert.equal(data[k * 4 + 3], 0, 'clear off the wax');
        continue;
      }
      const c = rgb(WAX[t - 1]);
      assert.deepEqual(
        [data[k * 4], data[k * 4 + 1], data[k * 4 + 2], data[k * 4 + 3]],
        [Math.round(c.x * 255), Math.round(c.y * 255), Math.round(c.z * 255), 255],
      );
    }
  }
  // (Where its middle falls on the screen, snapped to a texel's corner.)
  assert.equal(seal.place(100.4, 51.6, [31, 0, 0, 31]), true);
  assert.deepEqual(seal.material.uniforms.uCenter.value.toArray(), [100, 52]);
});

test('the face is drawn again only as its axes cross a half-texel step, from a cache: never resampled, never shimmering', () => {
  const seal = buildSeal(shared(), 0.4);
  const face = () => seal.material.uniforms.uFace.value;
  seal.place(10, 10, [31, -11, 11, 31]);
  const first = face();
  // (A hair off, as the letter sways: the same picture.)
  seal.place(10.2, 10, [31.2, -11.1, 10.9, 30.8]);
  assert.equal(face(), first, 'the same face under half a texel');
  // (Past half a texel: drawn for the new axes, a whole step from the last.)
  seal.place(10, 10, [30.4, -11, 11, 31]);
  const next = face();
  assert.notEqual(next, first);
  assert.deepEqual(
    Array.from(next.image.data),
    Array.from(sealFace([30.5, -11, 11, 31]).tones).flatMap((t) => (t ? [...faceColour(t), 255] : [0, 0, 0, 0])),
    'the face for the axes snapped to half texels',
  );
  // (Back where it was: from the cache.)
  seal.place(10, 10, [31, -11, 11, 31]);
  assert.equal(face(), first, 'cached');
  // (Shrunk to under a texel and a half as it blooms away, it hides.)
  assert.equal(seal.place(10, 10, [1, 0, 0, 1]), false);
  seal.dispose();
});

/** A tone's colour as the face's texture has it. */
function faceColour(/** @type {number} */ t) {
  const c = rgb(WAX[t - 1]);
  return [Math.round(c.x * 255), Math.round(c.y * 255), Math.round(c.z * 255)];
}

test('the parts’ order lines the pocket’s mouth over the inside; the seal is one piece, drawn with the toon material', () => {
  assert.ok(
    IDS.body < IDS.inside && IDS.inside < IDS.pocket && IDS.pocket < IDS.flap,
    'the mouth lined over the inside',
  );
  assert.ok(IDS.flap < IDS.seal && IDS.seal < IDS.petal);
  assert.ok(
    Object.values(IDS).every((v) => v > 0 && v < 256),
    'none is the empty paper (0)',
  );
  assert.equal(INK, 0x3a332d, 'the toy’s ink');
  assert.equal(PAPER.length, 3, 'three tones of paper');
  assert.equal(WAX.length, 3, 'three of wax');
  assert.ok(SHADES.light > SHADES.mid);
  const u = shared();
  const m = toon(PAPER, u, IDS.flap, { lean: 0.2 });
  assert.equal(m.uniforms.uId.value, IDS.flap);
  assert.equal(m.uniforms.uLean.value, 0.2);
  assert.ok('FLAT' in m.defines, 'paper is flat: one tone a face, no dither');
  assert.equal(m.uniforms.uIdPass, u.uIdPass, 'one switch for every part’s id pass');
  assert.equal(m.uniforms.uDissolve, u.uDissolve, 'one dissolve for the whole letter');
  const seal = buildSeal(u, 0.4);
  const faces = [];
  seal.group.traverse((o) => {
    const mat = /** @type {any} */ (o).material;
    if (mat) faces.push(mat);
  });
  assert.equal(faces.length, 1, 'one piece: the face (its splotch drawn in it), no beads');
  assert.ok('SEAL' in faces[0].defines);
  assert.equal(faces[0].uniforms.uIdPass, u.uIdPass);
  assert.equal(faces[0].uniforms.uId.value, IDS.seal);
});

test('the first frame’s seal is placed as the letter shows it: about its size, not spun (the red box on reload)', () => {
  // (As the scene makes it: a camera put in place but never drawn with, and the seal in the
  // letter's group. three only updates a camera's matrices as it draws, so the first frame's
  // placement once read an identity view and put a seal 37 times its size on the screen.)
  const camera = new THREE.PerspectiveCamera(30, 1280 / 800, 0.1, 40);
  camera.position.set(0, 0, 6);
  camera.updateProjectionMatrix();
  const letter = new THREE.Group();
  letter.scale.setScalar(1.4);
  const seal = new THREE.Group();
  seal.position.set(0, -0.2, 0.05);
  letter.add(seal);
  const tw = 400;
  const th = 250;
  const r = 0.4;
  const at = sealOnScreen(seal, camera, r, tw, th);
  // (The radius it shows at, texels: the view's height at the letter is 2·6·tan 15°.)
  const want = (r * 1.4 * th) / (2 * (6 - 0.05 * 1.4) * Math.tan(Math.PI / 12));
  const [ax, ay, bx, by] = at.axes;
  assert.ok(Math.abs(Math.hypot(ax, ay) / want - 1) < 0.02, `its x axis ${Math.hypot(ax, ay)} of ${want}`);
  assert.ok(Math.abs(Math.hypot(bx, by) / want - 1) < 0.02, `its y axis ${Math.hypot(bx, by)} of ${want}`);
  assert.ok(Math.abs(ay) < 1e-6 && Math.abs(bx) < 1e-6, 'upright, not spun');
  assert.ok(Math.abs(at.x - tw / 2) < 1e-6, `its middle across ${at.x}`);
  assert.ok(at.y < th / 2 && at.y > th / 2 - want, `its middle up ${at.y}`);
});

test('the hover pulse’s gold is NEWT’s hover gold (retro.js HOVER_INK, copied)', () => {
  assert.equal(HOVER, HOVER_INK);
});
