// The invitation toy's pixel icons (src/invitation/icons.js): every toolbar and camera-pad
// button's icon is 16×16 ASCII art (a copy of src/ui/pixelArt.js's approach, since the page
// imports nothing from src/ui), drawn as crisp inline SVG whose runs cover exactly the art's
// pixels, hidden from screen readers (the button's own label names it) and carrying no text or
// tooltip; every label the toolbar shows has one, and no two icons are alike. The buttons' hover
// and press fills are ordered (Bayer 4×4) dither tiles: n of the 16 cells at coverage n, each
// coverage's cells inside the next one's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAYER4, ICONS, ICON_SIZE, LABEL_ICONS, ditherMask, iconSvg } from '../src/invitation/icons.js';

/** The pixels an SVG's paths fill, per class, from its `M x y h w v1 h-w z` runs. */
function painted(svg) {
  const out = {};
  for (const [, cls, d] of svg.matchAll(/<path class="([^"]+)" d="([^"]+)"\/>/g)) {
    const grid = (out[cls] ??= Array.from({ length: ICON_SIZE }, () => Array(ICON_SIZE).fill(false)));
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g))
      for (let i = 0; i < Number(w); i++) grid[Number(y)][Number(x) + i] = true;
  }
  return out;
}

test('every icon is 16×16 art of line and accent pixels, drawn as crisp SVG covering exactly its pixels, hidden from screen readers', () => {
  assert.equal(ICON_SIZE, 16);
  const names = Object.keys(ICONS);
  assert.ok(names.length >= 17, `${names.length} icons`);
  for (const name of names) {
    const rows = ICONS[/** @type {keyof typeof ICONS} */ (name)];
    assert.equal(rows.length, 16, `${name}: 16 rows`);
    for (const row of rows) assert.match(row, /^[.#+]{16}$/, `${name}: ${row}`);
    assert.ok(rows.join('').includes('#'), `${name}: some line`);
    const svg = iconSvg(/** @type {keyof typeof ICONS} */ (name));
    assert.match(svg, /^<svg class="inv-icon" viewBox="0 0 16 16"/, name);
    assert.match(svg, /shape-rendering="crispEdges"/, `${name}: crisp`);
    assert.match(svg, /aria-hidden="true"/, `${name}: the label names the button`);
    assert.match(svg, /focusable="false"/);
    assert.doesNotMatch(svg, /<title|<text|\stitle=/, `${name}: no text, no tooltip`);
    const p = painted(svg);
    for (const [cls, ink] of [
      ['inv-icon-line', '#'],
      ['inv-icon-accent', '+'],
    ]) {
      const want = rows.map((row) => [...row].map((c) => c === ink));
      const got = p[cls] ?? Array.from({ length: 16 }, () => Array(16).fill(false));
      assert.deepEqual(got, want, `${name}: ${cls} covers its '${ink}' pixels`);
    }
  }
  assert.throws(() => iconSvg(/** @type {any} */ ('nothing')), /icon/);
});

test('every label the toolbar and the camera pad show has its own icon, and no two icons are alike', () => {
  for (const label of [
    'Replay Intro',
    'Wave',
    'Sit',
    'Stand',
    'Give Device',
    'Lie Down',
    'Get Up',
    'Run',
    'Camera',
    'Settings',
    'Turn Left',
    'Turn Right',
    'Tilt Up',
    'Tilt Down',
    'Zoom In',
    'Zoom Out',
    'Follow NEWT',
    'Reset Camera',
  ]) {
    const name = LABEL_ICONS[label];
    assert.ok(name && ICONS[name], `${label}: an icon`);
  }
  const seen = new Map();
  for (const [name, rows] of Object.entries(ICONS)) {
    const key = rows.join('');
    assert.ok(!seen.has(key), `${name} looks like ${seen.get(key)}`);
    seen.set(key, name);
  }
  // (Turning left and right, tilting up and down, are mirror images: they read as a pair.)
  const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));
  assert.deepEqual(ICONS.turnRight, mirror(ICONS.turnLeft), 'Turn Right mirrors Turn Left');
  assert.deepEqual(ICONS.tiltDown, [...ICONS.tiltUp].reverse(), 'Tilt Down flips Tilt Up');
});

test('the dither fills: a Bayer 4×4 tile with n of its 16 cells at coverage n, each inside the next', () => {
  assert.deepEqual(
    [...BAYER4.flat()].sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, i) => i),
    'every threshold once',
  );
  let last = ditherMask(0);
  assert.equal(last.filter(Boolean).length, 0);
  for (let n = 1; n <= 16; n++) {
    const m = ditherMask(n);
    assert.equal(m.length, 16);
    assert.equal(m.filter(Boolean).length, n, `coverage ${n}`);
    m.forEach((on, i) => assert.ok(on || !last[i], `coverage ${n} keeps cell ${i}`));
    last = m;
  }
  // (Spread out, not clumped: at a quarter, one cell in each 2×2 block.)
  const q = ditherMask(4);
  for (const [bx, by] of [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ])
    assert.equal(
      [q[by * 4 + bx], q[by * 4 + bx + 1], q[(by + 1) * 4 + bx], q[(by + 1) * 4 + bx + 1]].filter(Boolean).length,
      1,
    );
});
