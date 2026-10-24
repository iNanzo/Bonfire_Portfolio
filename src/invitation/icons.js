// The invitation toy's pixel icons and dither tiles. Each toolbar and Camera-pad button wears a
// 16×16 icon drawn as ASCII art and turned into crisp inline SVG (a copy of src/ui/pixelArt.js's
// approach: the page imports nothing from src/ui), its runs merged into one path per ink:
//
//   '#'  line, in the button's text colour (currentColor)
//   '+'  accent, in the toy's gold (--inv-accent)
//   '.'  empty
//
// The SVG is hidden from screen readers and carries no text: the button's own label, a span
// beside it, names it (ui.js). Turn Right is Turn Left mirrored and Tilt Down is Tilt Up turned
// over, so each pair reads as one. The buttons' hover and press fills are ordered dither: Bayer
// 4×4 tiles at a coverage of n/16 (ditherMask), drawn at runtime as tiny PNGs in CSS custom
// properties (installDither, a copy of src/ui/dither.js's approach), the same dither as NEWT's.
// Pure but for installDither.

export const ICON_SIZE = 16;

/** Each row mirrored (left for right). @param {string[]} rows */
const mirrored = (rows) => rows.map((r) => [...r].reverse().join(''));
/** The rows in reverse order (upside down). @param {string[]} rows */
const flipped = (rows) => [...rows].reverse();

const TURN_LEFT = [
  '................',
  '................',
  '......####......',
  '....##....##....',
  '...#........#...',
  '..#..........#..',
  '..#..........#..',
  '#####........#..',
  '.###............',
  '..#.............',
  '.......++.......',
  '......++++......',
  '....++++++++....',
  '...++++++++++...',
  '................',
  '................',
];
const TILT_UP = [
  '................',
  '.......##.......',
  '......####......',
  '.....######.....',
  '....########....',
  '...##########...',
  '......####......',
  '......####......',
  '......####......',
  '......####......',
  '................',
  '.....++++++.....',
  '..++++++++++++..',
  '.....++++++.....',
  '................',
  '................',
];
/** A magnifier: its lens, its handle, and a + or − in it. */
const lens = (plus) => [
  '................',
  '....####........',
  '..##....##......',
  `..#..${plus ? '++' : '..'}..#......`,
  `.#...${plus ? '++' : '..'}...#.....`,
  '.#.++++++.#.....',
  '.#.++++++.#.....',
  `.#...${plus ? '++' : '..'}...#.....`,
  `..#..${plus ? '++' : '..'}..#......`,
  '..##....###.....',
  '....####.###....',
  '..........###...',
  '...........###..',
  '............###.',
  '.............##.',
  '................',
];

/** Every icon, by name: 16 rows of 16 pixels. */
export const ICONS = {
  // Replay Intro: a speech bubble with a play triangle (the intro is a dialogue).
  replay: [
    '................',
    '................',
    '.##############.',
    '#..............#',
    '#.....+........#',
    '#.....++.......#',
    '#.....+++......#',
    '#.....++++.....#',
    '#.....+++......#',
    '#.....++.......#',
    '#.....+........#',
    '.###...########.',
    '...#..#.........',
    '...#.#..........',
    '...##...........',
    '................',
  ],
  // Wave: a raised open hand, the air moving beside it.
  wave: [
    '................',
    '......##........',
    '...##.##.##.....',
    '...##.##.##.##..',
    '...##.##.##.##..',
    '+..##.##.##.##..',
    '...##.##.##.##.+',
    '+..###########..',
    '##.###########.+',
    '.#############..',
    '..############..',
    '...##########...',
    '...##########...',
    '....########....',
    '................',
    '................',
  ],
  // Sit: a figure sitting on a stool.
  sit: [
    '................',
    '....###.........',
    '....###.........',
    '....###.........',
    '.+..##..........',
    '.+..####........',
    '.+..##.##.......',
    '.+..##..........',
    '.+..#######.....',
    '.+..#######.....',
    '.+++++++.##.....',
    '.+.....+.##.....',
    '.+.....+.##.....',
    '.+.....+.####...',
    '................',
    '................',
  ],
  // Stand (Sit's label while he sits): a figure standing tall.
  stand: [
    '................',
    '......###.......',
    '......###.......',
    '......###.......',
    '.......#........',
    '....#######.....',
    '...##.###.##....',
    '...#..###..#....',
    '...#..###..#....',
    '......###.......',
    '......#.#.......',
    '......#.#.......',
    '......#.#.......',
    '.....##.##......',
    '..++++++++++....',
    '................',
  ],
  // Give Device: a tablet held sideways, a little game on its screen.
  device: [
    '................',
    '................',
    '..############..',
    '.#............#.',
    '.#.++++++++++.#.',
    '.#.++++++++++.#.',
    '.#.+++#++++++.#.',
    '.#.++###+++#+.#.',
    '.#.+++#++++++.#.',
    '.#.++++++++++.#.',
    '.#.++++++++++.#.',
    '.#............#.',
    '..############..',
    '................',
    '................',
    '................',
  ],
  // Lie Down (while he sits with the tablet): a figure on its front, feet up, the tablet ahead.
  lieDown: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..###...........',
    '..###........##.',
    '..###.......##..',
    '...##......##...',
    '...###########..',
    '...###########..',
    '++++............',
    '................',
    '################',
    '................',
    '................',
  ],
  // Get Up (while he lies): a figure rising, an arrow up beside it.
  getUp: [
    '................',
    '.....###........',
    '.....###.....+..',
    '.....###....+++.',
    '......#....+++++',
    '...######....+..',
    '..##.##.##...+..',
    '.....##......+..',
    '.....##......+..',
    '....####.....+..',
    '...##..##.......',
    '..##....##......',
    '..#......##.....',
    '################',
    '................',
    '................',
  ],
  // Run: a running figure, speed lines behind it.
  run: [
    '................',
    '..........###...',
    '..........###...',
    '..........###...',
    '+++....######...',
    '......#.###.#...',
    '.++.....##...#..',
    '.......###......',
    '+++...##.##.....',
    '.....##...##....',
    '....##.....#....',
    '..###......##...',
    '..#.........#...',
    '............##..',
    '................',
    '................',
  ],
  // Camera: its body, its lens, a flash.
  camera: [
    '................',
    '................',
    '................',
    '.....####.......',
    '.##############.',
    '.#..........+.#.',
    '.#....####....#.',
    '.#...#....#...#.',
    '.#...#.++.#...#.',
    '.#...#.++.#...#.',
    '.#...#....#...#.',
    '.#....####....#.',
    '.#............#.',
    '.##############.',
    '................',
    '................',
  ],
  // Settings: three sliders.
  settings: [
    '................',
    '................',
    '...###..........',
    '.####+#########.',
    '...###..........',
    '................',
    '................',
    '.........###....',
    '.########+####..',
    '.........###....',
    '................',
    '................',
    '.....###........',
    '.#####+#######..',
    '.....###........',
    '................',
  ],
  // Turn Left and Right: an arrow round the floor he stands on.
  turnLeft: TURN_LEFT,
  turnRight: mirrored(TURN_LEFT),
  // Tilt Up and Down: an arrow up from the floor, and the same turned over.
  tiltUp: TILT_UP,
  tiltDown: flipped(TILT_UP),
  // Zoom In and Out: a magnifier with a + or a −.
  zoomIn: lens(true),
  zoomOut: lens(false),
  // Follow NEWT: crosshairs on a little figure.
  follow: [
    '.......##.......',
    '.......##.......',
    '.......##.......',
    '.....######.....',
    '....#......#....',
    '...#...++...#...',
    '...#...++...#...',
    '###...++++...###',
    '###...++++...###',
    '...#...++...#...',
    '...#..+..+..#...',
    '....#......#....',
    '.....######.....',
    '.......##.......',
    '.......##.......',
    '.......##.......',
  ],
  // Reset Camera: home.
  reset: [
    '................',
    '.......##.......',
    '......#..#......',
    '.....#....#.....',
    '....#......#....',
    '...#........#...',
    '..#..........#..',
    '.###........###.',
    '...#........#...',
    '...#........#...',
    '...#...++...#...',
    '...#...++...#...',
    '...#...++...#...',
    '...#...++...#...',
    '...##########...',
    '................',
  ],
};

/** @typedef {keyof typeof ICONS} IconName */

/** Each label the toolbar and the Camera pad show, and its icon. @type {Record<string, IconName>} */
export const LABEL_ICONS = {
  'Replay Intro': 'replay',
  Wave: 'wave',
  Sit: 'sit',
  Stand: 'stand',
  'Give Device': 'device',
  'Lie Down': 'lieDown',
  'Get Up': 'getUp',
  Run: 'run',
  Camera: 'camera',
  Settings: 'settings',
  'Turn Left': 'turnLeft',
  'Turn Right': 'turnRight',
  'Tilt Up': 'tiltUp',
  'Tilt Down': 'tiltDown',
  'Zoom In': 'zoomIn',
  'Zoom Out': 'zoomOut',
  'Follow NEWT': 'follow',
  'Reset Camera': 'reset',
};

/**
 * An icon's pixels as path data per ink ('#' and '+'), merged into horizontal runs.
 * @param {string[]} rows
 */
function runs(rows) {
  /** @type {Record<string, string>} */
  const out = { '#': '', '+': '' };
  rows.forEach((row, y) => {
    if (row.length !== ICON_SIZE) throw new Error(`pixel icon row ${y} is ${row.length} wide: "${row}"`);
    for (let x = 0; x < ICON_SIZE;) {
      const ink = row[x];
      if (!(ink in out)) {
        x++;
        continue;
      }
      let end = x;
      while (end < ICON_SIZE && row[end] === ink) end++;
      out[ink] += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return out;
}

/**
 * An icon as inline SVG: crisp (no smoothing between pixels), twice its pixels on screen, hidden
 * from screen readers.
 * @param {IconName} name
 */
export function iconSvg(name) {
  const rows = ICONS[name];
  if (!rows) throw new Error(`no pixel icon called ${name}`);
  const p = runs(rows);
  const line = p['#'] ? `<path class="inv-icon-line" d="${p['#']}"/>` : '';
  const accent = p['+'] ? `<path class="inv-icon-accent" d="${p['+']}"/>` : '';
  return `<svg class="inv-icon" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" width="${ICON_SIZE * 2}" height="${ICON_SIZE * 2}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${line}${accent}</svg>`;
}

/** The Bayer 4×4 matrix: each cell's threshold, 0 to 15. */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * A 4×4 dither tile at a coverage of `n`/16, row by row: the cells whose threshold is under n
 * (each coverage's cells inside the next one's, spread evenly).
 * @param {number} n  0 to 16
 * @returns {boolean[]}
 */
export function ditherMask(n) {
  return BAYER4.flat().map((t) => t < n);
}

/** The coverages the CSS uses (out of 16): a hover's light fill, a press's heavier one, the label tab's shadow. */
export const DITHER_STEPS = [2, 4, 6, 8];

/**
 * The dither tiles as CSS custom properties on `root`: --inv-dv-N, a 4×4 PNG of `color` pixels
 * at N/16 coverage, for each of DITHER_STEPS (drawn on a canvas once, at runtime).
 * @param {HTMLElement} root
 * @param {string} color  a CSS colour
 */
export function installDither(root, color) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const g = c.getContext('2d');
  if (!g) return;
  for (const n of DITHER_STEPS) {
    g.clearRect(0, 0, 4, 4);
    g.fillStyle = color;
    ditherMask(n).forEach((on, i) => {
      if (on) g.fillRect(i % 4, Math.floor(i / 4), 1, 1);
    });
    root.style.setProperty(`--inv-dv-${n}`, `url("${c.toDataURL('image/png')}")`);
  }
}
