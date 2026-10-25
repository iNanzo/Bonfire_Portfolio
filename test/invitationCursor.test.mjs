// The invitation toy's pixel cursors (src/invitation/cursor.js): five 16×16 pixel-art kinds
// (types.js CursorKind: the arrow; a pointing hand over buttons and the chat box; an open hand
// over NEWT; a closed hand while he's held or the view is panned; the turn glyph while it
// orbits), drawn at runtime at 1× and 2× (dark lines, a light fill and a light rim round the
// lines, so they read on any floor), at most 32 CSS px, each hotspot exactly on a drawn pixel
// where it matters (the arrow's tip, the finger's tip, the closed hand's knuckles, where his
// collar hangs). The CSS takes the standard image-set() form after the -webkit- one and a plain
// url() one, with a system cursor to fall back on; and which kind shows comes from the pointer:
// held or pressing on him, panning, orbiting, over him, or none of those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURSORS,
  CURSOR_KINDS,
  CURSOR_SCALE,
  cursorCss,
  cursorKind,
  cursorPixels,
  cursorValue,
} from '../src/invitation/cursor.js';

const URLS = Object.fromEntries(
  ['arrow', 'point', 'open', 'grab', 'turn'].map((k) => [k, { x1: `data:${k}-1x`, x2: `data:${k}-2x` }]),
);

test('five cursors, each 16×16 art drawn at most 32 CSS px, the hotspot on a drawn pixel', () => {
  assert.deepEqual([...CURSOR_KINDS].sort(), ['arrow', 'grab', 'open', 'point', 'turn']);
  assert.ok(16 * CURSOR_SCALE <= 32, 'at most 32 CSS px: Chromium hides bigger cursors near the edge');
  for (const kind of CURSOR_KINDS) {
    const c = CURSORS[kind];
    assert.equal(c.art.length, 16, `${kind}: 16 rows`);
    for (const row of c.art) assert.match(row, /^[.#o]{16}$/, `${kind}: ${row}`);
    const [hx, hy] = c.hot;
    assert.ok(Number.isInteger(hx) && Number.isInteger(hy), `${kind}: whole CSS px`);
    assert.ok(hx >= 0 && hy >= 0 && hx < 16 * CURSOR_SCALE && hy < 16 * CURSOR_SCALE, `${kind}: inside it`);
    const cell = c.art[Math.floor(hy / CURSOR_SCALE)][Math.floor(hx / CURSOR_SCALE)];
    assert.notEqual(cell, '.', `${kind}: the hotspot (${hx}, ${hy}) is on a drawn pixel`);
    assert.match(c.fallback, /^(default|pointer|grab|grabbing|move|all-scroll)$/, `${kind}: a system fallback`);
    for (const scale of [CURSOR_SCALE, CURSOR_SCALE * 2]) {
      const px = cursorPixels(kind, scale);
      assert.equal(px.width, 16 * scale);
      assert.equal(px.height, 16 * scale);
      assert.equal(px.data.length, px.width * px.height * 4);
    }
  }
  // Where each hotspot sits: the arrow's tip at its top left, the pointing finger's tip at the
  // top, the closed hand's knuckles in its middle (his collar hangs there, under the pointer).
  assert.ok(CURSORS.arrow.hot[0] <= 2 && CURSORS.arrow.hot[1] <= 2, 'the arrow: its tip');
  assert.ok(CURSORS.point.hot[1] <= 2, 'the pointing hand: its fingertip');
  assert.equal(CURSORS.point.art[0][Math.floor(CURSORS.point.hot[0] / CURSOR_SCALE)], '#', 'right on the fingertip');
  const [gx, gy] = CURSORS.grab.hot;
  assert.ok(gx > 8 && gx < 24 && gy > 8 && gy < 24, `the closed hand: its knuckles, in its middle (${gx}, ${gy})`);
});

test('a cursor’s pixels: dark lines, a light fill, a light rim round the lines, and clear elsewhere, crisp at 1× and 2×', () => {
  for (const kind of CURSOR_KINDS) {
    const art = CURSORS[kind].art;
    const one = cursorPixels(kind, 1);
    const at = (px, x, y) => [...px.data.subarray((y * px.width + x) * 4, (y * px.width + x) * 4 + 4)];
    let rim = 0;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const [r, g, b, a] = at(one, x, y);
        const c = art[y][x];
        if (c === '#') assert.ok(a === 255 && r + g + b < 300, `${kind} (${x}, ${y}): a dark line`);
        else if (c === 'o') assert.ok(a === 255 && r + g + b > 600, `${kind} (${x}, ${y}): a light fill`);
        else {
          const nearLine = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => art[y + dy]?.[x + dx] === '#'));
          if (nearLine) {
            assert.ok(a === 255 && r + g + b > 600, `${kind} (${x}, ${y}): the rim`);
            rim++;
          } else assert.equal(a, 0, `${kind} (${x}, ${y}): clear`);
        }
      }
    assert.ok(rim > 0, `${kind}: a rim`);
    // Scaled up by whole pixels: each art pixel a block of the same colour.
    const two = cursorPixels(kind, 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const want = at(one, x, y);
        for (const [dx, dy] of [
          [0, 0],
          [3, 3],
          [1, 2],
        ])
          assert.deepEqual(at(two, x * 4 + dx, y * 4 + dy), want, `${kind} (${x}, ${y}) at 4×`);
      }
  }
});

test('the CSS: image-set at 1× and 2× with the hotspot and a system fallback, after the -webkit- form and a plain url', () => {
  for (const kind of CURSOR_KINDS) {
    const { hot, fallback } = CURSORS[kind];
    const u = URLS[kind];
    assert.equal(
      cursorValue(kind, u, 'standard'),
      `image-set(url("${u.x1}") 1x, url("${u.x2}") 2x) ${hot[0]} ${hot[1]}, ${fallback}`,
    );
    assert.equal(
      cursorValue(kind, u, 'webkit'),
      `-webkit-image-set(url("${u.x1}") 1x, url("${u.x2}") 2x) ${hot[0]} ${hot[1]}, ${fallback}`,
    );
    assert.equal(cursorValue(kind, u, 'url'), `url("${u.x1}") ${hot[0]} ${hot[1]}, ${fallback}`);
  }
  const css = cursorCss(URLS);
  /** A rule's declarations for a selector it starts with. */
  const rule = (sel) => {
    const at = css.indexOf(`${sel}`);
    assert.ok(at >= 0, `a rule for ${sel}`);
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  };
  for (const [sel, kind] of [
    ['.inv-stage', 'arrow'],
    ['.inv-stage[data-cursor="open"] .inv-canvas', 'open'],
    ['.inv-stage[data-cursor="grab"] .inv-canvas', 'grab'],
    ['.inv-stage[data-cursor="turn"] .inv-canvas', 'turn'],
    ['.inv-btn:not(:disabled)', 'point'],
  ]) {
    const decls = rule(sel)
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
    assert.deepEqual(
      decls,
      [
        `cursor: ${cursorValue(kind, URLS[kind], 'url')}`,
        `cursor: ${cursorValue(kind, URLS[kind], 'webkit')}`,
        `cursor: ${cursorValue(kind, URLS[kind], 'standard')}`,
      ],
      `${sel}: the last form the browser knows wins`,
    );
  }
  // (The chat box and the sheet's controls take the pointing hand as buttons do.)
  assert.match(css, /\.inv-talk[^{]*\{[^}]*image-set\(url\("data:point-1x"\)/);
  assert.doesNotMatch(css, /url\((?!")/, 'every url quoted');
});

test('which cursor shows: the closed hand holding him or pressing on him and while panning, the turn glyph orbiting, the open hand over him, else the arrow', () => {
  assert.equal(cursorKind({}), 'arrow');
  assert.equal(cursorKind({ onNewt: true }), 'open');
  assert.equal(cursorKind({ onNewt: true, pressing: true }), 'grab');
  assert.equal(cursorKind({ held: true }), 'grab');
  assert.equal(cursorKind({ held: true, onNewt: false, drag: null }), 'grab');
  assert.equal(cursorKind({ drag: 'pan' }), 'grab');
  assert.equal(cursorKind({ drag: 'orbit', onNewt: true }), 'turn', 'a right-drag that starts on him turns');
  assert.equal(cursorKind({ drag: 'orbit' }), 'turn');
  // While the intro runs nothing on the stage takes a press: the arrow (the chat box has its own).
  assert.equal(cursorKind({ onNewt: true, talking: true }), 'arrow');
  assert.equal(cursorKind({ drag: 'pan', talking: true }), 'arrow');
});
