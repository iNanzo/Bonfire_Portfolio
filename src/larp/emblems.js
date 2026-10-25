// The team emblems: small pixel-art shapes (types.js EMBLEMS), so a team is never told apart by
// color alone. Each is a 9-column grid drawn as an SVG of square cells in currentColor (the
// team's color comes from the element around it, `color: var(--team)`), crisp at any size.
// Pure: the markup is a string. Screens use ui.js emblem(), which wraps emblemSvg().
import { esc } from '../html.js';
import { EMBLEMS } from './types.js';

/** @typedef {import('./types.js').EmblemKey} EmblemKey */

/** '#' is a filled cell. Rows are 9 wide; the heights vary. */
export const EMBLEM_PIXELS = Object.freeze({
  shield: [
    '#########',
    '#########',
    '##.###.##',
    '##.###.##',
    '#########',
    '.#######.',
    '.#######.',
    '..#####..',
    '....#....',
  ],
  star: [
    '....#....',
    '....#....',
    '...###...',
    '#########',
    '.#######.',
    '..#####..',
    '..##.##..',
    '.##...##.',
    '.#.....#.',
  ],
  flame: [
    '....#....',
    '....##...',
    '...###...',
    '..####.#.',
    '.#######.',
    '.###.####',
    '.##...###',
    '.##...##.',
    '..#####..',
  ],
  cross: [
    '...###...',
    '...###...',
    '#########',
    '#########',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
  ],
  dove: [
    '.........',
    '#.......#',
    '##.....##',
    '.##...##.',
    '..##.##..',
    '...###...',
    '..#####..',
    '....#....',
    '.........',
  ],
  crown: [
    '#...#...#',
    '#...#...#',
    '##.###.##',
    '#########',
    '#########',
    '#########',
    '.........',
    '#########',
    '.........',
  ],
  anchor: [
    '...###...',
    '...#.#...',
    '...###...',
    '.#######.',
    '....#....',
    '....#....',
    '#...#...#',
    '##..#..##',
    '.#######.',
    '..#####..',
  ],
  lamp: [
    '....#....',
    '...###...',
    '....#....',
    '..#####..',
    '.#######.',
    '#########',
    '.#######.',
    '...###...',
    '.#######.',
  ],
});

/**
 * One emblem as SVG cells (one <path> of unit squares). An unknown key draws the first emblem.
 * `label` (plain text) makes it an image with that name; without one it is decorative.
 * @param {EmblemKey|string} key
 * @param {{ size?: number, label?: string, cls?: string }} [opts] size in CSS px (height)
 * @returns {string}
 */
export function emblemSvg(key, { size = 24, label = '', cls = '' } = {}) {
  const rows = Object.hasOwn(EMBLEM_PIXELS, key)
    ? EMBLEM_PIXELS[/** @type {EmblemKey} */ (key)]
    : EMBLEM_PIXELS[EMBLEMS[0]];
  const w = rows[0].length;
  const h = rows.length;
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') d += `M${x} ${y}h1v1h-1z`;
  });
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  const height = Math.max(1, Math.round(size));
  const width = Math.round((height * w) / h);
  return `<svg class="larp-emblem${cls ? ' ' + esc(cls) : ''}" data-emblem="${esc(key)}" viewBox="0 0 ${w} ${h}" width="${width}" height="${height}" shape-rendering="crispEdges" ${a11y}><path fill="currentColor" d="${d}"/></svg>`;
}
