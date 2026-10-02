// Pixel icons drawn as ASCII art and turned into crisp inline SVG, so they can be edited
// by eye and animated with CSS (a frame is a <g>; styles.css decides which one shows).
//
//   '#'  line, in the current text color (brightens on hover with the button)
//   '+'  accent, in the flame's bright color (--accent-hi)
//   '.'  empty
//
// Every icon is 16×16 and minimal on purpose: line art plus a few accent pixels, like the
// site's other pixel glyphs (the cursor, the sound and stoke icons).

const SIZE = 16;

/** One frame's pixels as path data per ink ('#' and '+'), merged into horizontal runs. */
function paths(rows) {
  const out = { '#': '', '+': '' };
  rows.forEach((row, y) => {
    if (row.length !== SIZE) throw new Error(`pixel icon row ${y} is ${row.length} wide, not ${SIZE}: "${row}"`);
    for (let x = 0; x < SIZE;) {
      const ink = row[x];
      if (!(ink in out)) {
        x++;
        continue;
      }
      let end = x;
      while (end < SIZE && row[end] === ink) end++;
      out[ink] += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return out;
}

/**
 * An icon's SVG: `frames` is a list of 16 rows each (frame 0 shows by default; the rest
 * carry px-f1, px-f2… for CSS to swap in).
 */
export function pixelSvg(frames, cls = '') {
  const groups = frames
    .map((rows, i) => {
      const p = paths(rows);
      return `<g class="px-f${i}">${p['#'] ? `<path class="px-line" d="${p['#']}"/>` : ''}${p['+'] ? `<path class="px-accent" d="${p['+']}"/>` : ''}</g>`;
    })
    .join('');
  return `<svg class="px-icon ${cls}" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE * 2}" height="${SIZE * 2}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${groups}</svg>`;
}

const BACKPACK_BODY = [
  '..#.########.#..',
  '..#.#......#.#..',
  '..#.#......#.#..',
  '..#.########.#..',
  '...##########...',
  '................',
];

// The anvil from its face down: the horn to the left, the heel to the right, a waist, feet.
const ANVIL_BODY = [
  '...###########..',
  '.##..........#..',
  '#............#..',
  '.###.........#..',
  '....####..####..',
  '.......#..#.....',
  '.......#..#.....',
  '......##..##....',
  '....##......##..',
  '...#..........#.',
  '...############.',
  '................',
  '................',
];

export const ICONS = {
  // Closed, then open (the flap thrown back, the mouth glowing).
  backpack: [
    [
      '................',
      '......####......',
      '.....#....#.....',
      '...##########...',
      '..#..........#..',
      '..#..........#..',
      '..############..',
      '..#....++....#..',
      '..#....++....#..',
      '..#..........#..',
      ...BACKPACK_BODY,
    ],
    [
      '...##########...',
      '..#....++....#..',
      '...##########...',
      '..#++++++++++#..',
      '..#..........#..',
      '..#..........#..',
      '..#..........#..',
      '..#..........#..',
      '..#..........#..',
      '..#..........#..',
      ...BACKPACK_BODY,
    ],
  ],
  // A folded map: a dotted route to an X (the X blinks on hover).
  map: [
    [
      '................',
      '................',
      '.##############.',
      '.#....#....#..#.',
      '.#.+..#....#..#.',
      '.#....#....#..#.',
      '.#...+#....#..#.',
      '.#....#.+..#..#.',
      '.#....#...+#..#.',
      '.#....#....+.+#.',
      '.#....#.....+.#.',
      '.#....#....+.+#.',
      '.#....#....#..#.',
      '.##############.',
      '................',
      '................',
    ],
    [
      '................',
      '................',
      '.##############.',
      '.#....#....#..#.',
      '.#....#....#..#.',
      '.#..+.#....#..#.',
      '.#....+....#..#.',
      '.#....#..+.#..#.',
      '.#....#....#..#.',
      '.#....#....#..#.',
      '.#....#....#..#.',
      '.#....#....#..#.',
      '.#....#....#..#.',
      '.##############.',
      '................',
      '................',
    ],
  ],
  // An anvil with a hot bar on its face; on hover the bar is struck and throws sparks.
  anvil: [
    ['................', '................', '......++++......', ...ANVIL_BODY],
    ['....+......+....', '.......+........', '..+...++++...+..', ...ANVIL_BODY],
  ],
  // The knight's helm: the great helm, its eye slit lit by the fire; on hover it swaps with
  // the pointed bascinet and back (its two slits and cross-shaped breaths).
  helm: [
    [
      '................',
      '....########....',
      '...#........#...',
      '..#..........#..',
      '..#....##....#..',
      '..#....##....#..',
      '..#++++##++++#..',
      '..#....##....#..',
      '..#....##....#..',
      '..#.#..##..#.#..',
      '..#....##....#..',
      '..#.#..##..#.#..',
      '..#....##....#..',
      '...#...##...#...',
      '....########....',
      '................',
    ],
    [
      '.......##.......',
      '......#..#......',
      '.....#....#.....',
      '....#......#....',
      '...#........#...',
      '..#..........#..',
      '..#.++++++++.#..',
      '..#..........#..',
      '..#..#....#..#..',
      '..#.###..###.#..',
      '..#..#....#..#..',
      '..#..........#..',
      '..#.#.#..#.#.#..',
      '...#........#...',
      '....########....',
      '................',
    ],
  ],
  // A spell tome with a rune on its cover (the rune flares on hover).
  tome: [
    [
      '................',
      '..###########...',
      '..#.#.......##..',
      '..#.#.......#.#.',
      '..#.#...+...#.#.',
      '..#.#..+.+..#.#.',
      '..#.#.+...+.#.#.',
      '..#.#..+.+..#.#.',
      '..#.#...+...#.#.',
      '..#.#.......#.#.',
      '..#.#.......#.#.',
      '..###########.#.',
      '...#.........##.',
      '...###########..',
      '................',
      '................',
    ],
    [
      '................',
      '..###########...',
      '..#.#...+...##..',
      '..#.#.......#.#.',
      '..#.#...+...#.#.',
      '..#.#..+++..#.#.',
      '..#.#++++++.#.#.',
      '..#.#..+++..#.#.',
      '..#.#...+...#.#.',
      '..#.#.......#.#.',
      '..#.#...+...#.#.',
      '..###########.#.',
      '...#.........##.',
      '...###########..',
      '................',
      '................',
    ],
  ],
};

/** A named icon's SVG. */
export const icon = (name, cls = '') => pixelSvg(ICONS[name], cls);
