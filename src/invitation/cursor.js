// The invitation toy's pixel cursors (types.js CursorKind): the arrow; a pointing hand over the
// buttons, the chat box and the Settings sheet's controls; an open hand over NEWT; a closed hand
// while he's held or pressed on and while the view is panned; and the turn glyph while the camera
// orbits. Each is 16×16 pixel art ('#' a dark line, 'o' a light fill), drawn at runtime with a
// light rim round its lines so it reads on any floor, at 2 CSS px a pixel (32 CSS px: Chromium
// hides bigger cursors near the window's edge) as a 1× and a 2× PNG. The CSS (cursorCss, in a
// style element installCursors adds) gives each the plain url() form, then the -webkit-
// image-set() one (Safari) and the standard image-set() one, with its hotspot in CSS px and a
// system cursor after it, so the last form the browser knows wins and an old one still shows a
// cursor. The OS draws it: it never lags the pointer, which matters for the closed hand, whose
// hotspot sits on its knuckles, where his collar hangs as he's carried. main.js sets the stage's
// data-cursor each frame from cursorKind (what the pointer's over and doing); buttons and the
// chat box take the pointing hand from the CSS. Pure but for installCursors.

/** @typedef {import('./types.js').CursorKind} CursorKind */

/** CSS px per art pixel. */
export const CURSOR_SCALE = 2;
/** @type {readonly CursorKind[]} */
export const CURSOR_KINDS = ['arrow', 'point', 'open', 'grab', 'turn'];

/** The line's and the fill's (and the rim's) colours, RGBA. */
const INK = [58, 51, 45, 255];
const LIGHT = [251, 249, 245, 255];

/**
 * Each cursor: its art, its hotspot (CSS px from its top left, on a drawn pixel), and the system
 * cursor a browser without image cursors shows.
 * @type {Record<CursorKind, {art: string[], hot: [number, number], fallback: string}>}
 */
export const CURSORS = {
  arrow: {
    art: [
      '#...............',
      '##..............',
      '#o#.............',
      '#oo#............',
      '#ooo#...........',
      '#oooo#..........',
      '#ooooo#.........',
      '#oooooo#........',
      '#ooooooo#.......',
      '#oooo#####......',
      '#oo#oo#.........',
      '#o#.#oo#........',
      '##..#oo#........',
      '#....#oo#.......',
      '.....#oo#.......',
      '......##........',
    ],
    hot: [1, 1],
    fallback: 'default',
  },
  point: {
    art: [
      '.....##.........',
      '....#oo#........',
      '....#oo#........',
      '....#oo#........',
      '....#oo###......',
      '....#oo#oo###...',
      '.##.#oo#oo#oo##.',
      '#oo##oo#oo#oo#o#',
      '#ooo#oooooooooo#',
      '.#oooooooooooo#.',
      '.#oooooooooooo#.',
      '..#ooooooooooo#.',
      '..#oooooooooo#..',
      '...#ooooooooo#..',
      '...#ooooooooo#..',
      '...###########..',
    ],
    hot: [11, 1],
    fallback: 'pointer',
  },
  open: {
    art: [
      '.......##.......',
      '....###oo###....',
      '...#oo#oo#oo#...',
      '...#oo#oo#oo###.',
      '...#oo#oo#oo#oo#',
      '...#oo#oo#oo#oo#',
      '.###oo#oo#oo#oo#',
      '#oo#ooooooooooo#',
      '#oooooooooooooo#',
      '.#ooooooooooooo#',
      '..#oooooooooooo#',
      '...#ooooooooooo#',
      '...#oooooooooo#.',
      '....#oooooooo#..',
      '....#oooooooo#..',
      '....##########..',
    ],
    hot: [19, 15],
    fallback: 'grab',
  },
  grab: {
    art: [
      '................',
      '................',
      '................',
      '................',
      '....##.##.##....',
      '...#oo#oo#oo##..',
      '..##oo#oo#oo#o#.',
      '.#o#oo#oo#oo#o#.',
      '.#oooooooooooo#.',
      '.#oooooooooooo#.',
      '..#ooooooooooo#.',
      '..#oooooooooo#..',
      '...#ooooooooo#..',
      '...#ooooooooo#..',
      '....#########...',
      '................',
    ],
    hot: [17, 15],
    fallback: 'grabbing',
  },
  turn: {
    art: [
      '................',
      '........#.......',
      '........##......',
      '..#########.....',
      '..##########....',
      '..#########.....',
      '........##......',
      '........#.......',
      '.......#........',
      '......##........',
      '.....#########..',
      '....##########..',
      '.....#########..',
      '......##........',
      '.......#........',
      '................',
    ],
    hot: [16, 15],
    fallback: 'move',
  },
};

/**
 * A cursor's pixels at `scale` device px an art pixel: RGBA, row by row (the art's lines dark,
 * its fill light, a light rim on the clear pixels touching a line, the rest clear).
 * @param {CursorKind} kind
 * @param {number} scale  a whole number
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function cursorPixels(kind, scale) {
  const { art } = CURSORS[kind];
  const n = art.length;
  const width = n * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  /** @param {number} x @param {number} y */
  const cell = (x, y) => art[y]?.[x] ?? '.';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const c = cell(x, y);
      let rgba = null;
      if (c === '#') rgba = INK;
      else if (c === 'o') rgba = LIGHT;
      else if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => cell(x + dx, y + dy) === '#'))) rgba = LIGHT;
      if (!rgba) continue;
      for (let j = 0; j < scale; j++)
        for (let i = 0; i < scale; i++) data.set(rgba, ((y * scale + j) * width + x * scale + i) * 4);
    }
  return { width, height: width, data };
}

/**
 * A cursor's CSS value: the standard image-set() form, the -webkit- one, or a plain url() (the
 * 1× image), each with its hotspot and its system fallback.
 * @param {CursorKind} kind
 * @param {{x1: string, x2: string}} urls  its 1× and 2× images
 * @param {'standard'|'webkit'|'url'} form
 */
export function cursorValue(kind, { x1, x2 }, form) {
  const { hot, fallback } = CURSORS[kind];
  const at = `${hot[0]} ${hot[1]}, ${fallback}`;
  if (form === 'url') return `url("${x1}") ${at}`;
  const set = `image-set(url("${x1}") 1x, url("${x2}") 2x)`;
  return `${form === 'webkit' ? '-webkit-' : ''}${set} ${at}`;
}

/** Which elements show which cursor (the stage's own kinds by its data-cursor). */
const RULES = /** @type {const} */ ([
  ['.inv-stage', 'arrow'],
  ['.inv-stage[data-cursor="open"] .inv-canvas', 'open'],
  ['.inv-stage[data-cursor="grab"] .inv-canvas', 'grab'],
  ['.inv-stage[data-cursor="turn"] .inv-canvas', 'turn'],
  ['.inv-btn:not(:disabled), .inv-talk, .inv-seg, .inv-switch, .inv-range', 'point'],
  ['.inv-btn:disabled', 'arrow'],
]);

/**
 * The cursors' CSS: a rule for each element and kind, its three forms in order (the last one the
 * browser knows wins).
 * @param {Record<CursorKind, {x1: string, x2: string}>} urls
 */
export function cursorCss(urls) {
  return RULES.map(([sel, kind]) => {
    const decls = /** @type {const} */ (['url', 'webkit', 'standard'])
      .map((form) => `cursor: ${cursorValue(kind, urls[kind], form)};`)
      .join(' ');
    return `${sel} { ${decls} }`;
  }).join('\n');
}

/**
 * Which cursor the stage shows: the closed hand while he's held or pressed on and while the view
 * is panned, the turn glyph while it orbits, the open hand over him; the arrow otherwise, and
 * while the intro runs (nothing on the stage takes a press then).
 * @param {{onNewt?: boolean, pressing?: boolean, held?: boolean, drag?: 'orbit'|'pan'|null, talking?: boolean}} o
 * @returns {CursorKind}
 */
export function cursorKind({ onNewt = false, pressing = false, held = false, drag = null, talking = false }) {
  if (talking) return 'arrow';
  if (held) return 'grab';
  if (drag === 'orbit') return 'turn';
  if (drag === 'pan') return 'grab';
  if (onNewt) return pressing ? 'grab' : 'open';
  return 'arrow';
}

/**
 * Draws every cursor at 1× and 2× and puts their CSS in the page, once.
 * @param {Document} [doc]
 */
export function installCursors(doc = document) {
  if (doc.querySelector('style[data-inv-cursors]')) return;
  const canvas = doc.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) return;
  /** @param {CursorKind} kind @param {number} scale */
  const draw = (kind, scale) => {
    const { width, height, data } = cursorPixels(kind, scale);
    canvas.width = width;
    canvas.height = height;
    const img = g.createImageData(width, height);
    img.data.set(data);
    g.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  };
  const urls = /** @type {Record<CursorKind, {x1: string, x2: string}>} */ (
    Object.fromEntries(CURSOR_KINDS.map((k) => [k, { x1: draw(k, CURSOR_SCALE), x2: draw(k, CURSOR_SCALE * 2) }]))
  );
  const style = doc.createElement('style');
  style.dataset.invCursors = '';
  style.textContent = cursorCss(urls);
  doc.head.append(style);
}
