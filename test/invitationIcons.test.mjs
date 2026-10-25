// The invitation toy's icons (src/invitation/icons.js): every toolbar and camera-pad button's
// icon is a Phosphor bold glyph (MIT, its licence in the module), its path data vendored, drawn
// as inline SVG on Phosphor's 256 grid at 24 px in the button's text colour (currentColor), with
// no pixel snapping (no crispEdges), hidden from screen readers (the button's own label names it)
// and carrying no text or tooltip; every label the toolbar shows has one, no two are alike, and
// each pair reads as one (Turn Right mirrors Turn Left; Tilt Down, Sit and Lie Down are Tilt Up,
// Stand and Get Up upside down). The buttons' hover and press fills are ordered (Bayer 4×4)
// dither tiles: n of the 16 cells at coverage n, each coverage's cells inside the next one's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { BAYER4, ICONS, ICON_PX, ICON_SOURCES, LABEL_ICONS, ditherMask, iconSvg } from '../src/invitation/icons.js';

/** @typedef {keyof typeof ICONS} Name */
const NAMES = /** @type {Name[]} */ (Object.keys(ICONS));

/**
 * An icon drawn 64×64 (sharp's SVG renderer), as a mask: true where it's more than half inked.
 * @param {Name} name
 */
async function mask(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="64" height="64"><path d="${ICONS[name]}" fill="#000"/></svg>`;
  const data = await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer();
  return Array.from({ length: 64 }, (_, y) => Array.from({ length: 64 }, (_, x) => data[y * 64 + x] > 127));
}
/** The share of two masks' ink they have in common (intersection over union). @param {boolean[][]} a @param {boolean[][]} b */
function overlap(a, b) {
  let both = 0;
  let either = 0;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      both += Number(a[y][x] && b[y][x]);
      either += Number(a[y][x] || b[y][x]);
    }
  return both / either;
}
/** A mask the other way round, left for right. @param {boolean[][]} m */
const mirrorX = (m) => m.map((row) => [...row].reverse());
/** A mask upside down. @param {boolean[][]} m */
const flipY = (m) => [...m].reverse();
/** A mask's share of inked cells. @param {boolean[][]} m */
const inked = (m) => m.flat().filter(Boolean).length / 4096;

const LABELS = [
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
];

test('every icon is a Phosphor bold path on its 256 grid, drawn at 24 px in currentColor with no pixel snapping, hidden from screen readers', async () => {
  assert.equal(ICON_PX, 24);
  assert.ok(NAMES.length >= 18, `${NAMES.length} icons`);
  for (const name of NAMES) {
    const d = ICONS[name];
    assert.match(d, /^M[-\d.,A-Za-z]+Z$/, `${name}: closed path data`);
    const k = inked(await mask(name));
    assert.ok(k > 0.08 && k < 0.6, `${name}: drawn (${k.toFixed(2)} of its square inked)`);
    const svg = iconSvg(name);
    assert.match(svg, /^<svg class="inv-icon" viewBox="0 0 256 256" width="24" height="24" fill="currentColor"/, name);
    assert.doesNotMatch(svg, /crispEdges|shape-rendering/, `${name}: smooth, not snapped to pixels`);
    assert.match(svg, /aria-hidden="true"/, `${name}: the label names the button`);
    assert.match(svg, /focusable="false"/);
    assert.doesNotMatch(svg, /<title|<text|\stitle=/, `${name}: no text, no tooltip`);
    assert.equal(svg.match(/<path /g)?.length, 1, `${name}: one path`);
    assert.ok(svg.includes(`d="${d}"`), `${name}: its own path data`);
  }
  assert.throws(() => iconSvg(/** @type {any} */ ('nothing')), /icon/);
});

test('the icons are the agreed Phosphor bold ones, and the module carries Phosphor’s MIT licence', () => {
  assert.deepEqual(Object.fromEntries(LABELS.map((label) => [label, ICON_SOURCES[LABEL_ICONS[label]]])), {
    'Replay Intro': 'envelope-simple',
    Wave: 'hand-waving',
    Sit: 'arrow-line-down',
    Stand: 'arrow-line-up',
    'Give Device': 'device-mobile',
    'Lie Down': 'arrow-fat-line-down',
    'Get Up': 'arrow-fat-line-up',
    Run: 'sneaker-move',
    Camera: 'camera',
    Settings: 'sliders-horizontal',
    'Turn Left': 'arrow-counter-clockwise',
    'Turn Right': 'arrow-clockwise',
    'Tilt Up': 'caret-up',
    'Tilt Down': 'caret-down',
    'Zoom In': 'magnifying-glass-plus',
    'Zoom Out': 'magnifying-glass-minus',
    'Follow NEWT': 'crosshair',
    'Reset Camera': 'house',
  });
  const src = readFileSync(new URL('../src/invitation/icons.js', import.meta.url), 'utf8');
  assert.match(src.split('\n')[0], /^\/\/ [^@]/, 'it starts with what it does');
  assert.match(src, /\/\*! Phosphor Icons \| MIT \| https:\/\/github\.com\/phosphor-icons\/core \*\//);
  assert.match(src, /Copyright \(c\) 2023 Phosphor Icons/);
  assert.match(src, /Permission is hereby granted, free of charge/);
  assert.match(src, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test('every label the toolbar and the camera pad show has its own icon, no two alike, and each pair reads as one', async () => {
  for (const label of LABELS) {
    const name = LABEL_ICONS[label];
    assert.ok(name && ICONS[name], `${label}: an icon`);
  }
  const used = LABELS.map((label) => LABEL_ICONS[label]);
  assert.equal(new Set(used).size, used.length, 'one icon a label');
  const masks = new Map(await Promise.all(NAMES.map(async (n) => /** @type {const} */ ([n, await mask(n)]))));
  const M = (/** @type {Name} */ name) => /** @type {boolean[][]} */ (masks.get(name));
  // (Zoom In and Out are one magnifier, a + or a − in it: the + is what tells them apart.)
  const twins = (/** @type {Name} */ a, /** @type {Name} */ b) => `${a} ${b}` === 'zoomIn zoomOut';
  for (let i = 0; i < NAMES.length; i++)
    for (let j = i + 1; j < NAMES.length; j++) {
      const k = overlap(M(NAMES[i]), M(NAMES[j]));
      assert.ok(k < (twins(NAMES[i], NAMES[j]) ? 0.95 : 0.8), `${NAMES[i]} looks like ${NAMES[j]} (${k.toFixed(2)})`);
    }
  assert.ok(inked(M('zoomIn')) > inked(M('zoomOut')) + 0.01, 'Zoom In’s +');
  // (Turning left and right are mirror images; down and up turn over: each pair reads as one.)
  const mirrored = overlap(M('turnRight'), mirrorX(M('turnLeft')));
  assert.ok(mirrored > 0.9, `Turn Right mirrors Turn Left (${mirrored.toFixed(2)})`);
  for (const [down, up] of /** @type {[Name, Name][]} */ ([
    ['tiltDown', 'tiltUp'],
    ['sit', 'stand'],
    ['lieDown', 'getUp'],
  ])) {
    const k = overlap(M(down), flipY(M(up)));
    assert.ok(k > 0.9, `${down} is ${up} upside down (${k.toFixed(2)})`);
  }
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
