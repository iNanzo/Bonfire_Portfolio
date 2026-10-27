// The invitation toy's icons and dither tiles. Each toolbar and Camera-pad button, and the link
// button (ui.js linkHtml), wears a Phosphor icon (bold weight; MIT, its licence below), the glyph's path data vendored here and
// drawn as inline SVG on Phosphor's 256 grid, 24 px on screen in the button's text colour
// (currentColor). The SVG is hidden from screen readers and carries no text: the button's own
// label, a span beside it, names it (ui.js). Each pair reads as one: Turn Right is Turn Left
// mirrored, and Tilt Down, Sit and Lie Down are Tilt Up, Stand and Get Up upside down. The
// buttons' hover and press fills are ordered dither: Bayer 4×4 tiles at a coverage of n/16
// (ditherMask), drawn at runtime as tiny PNGs in CSS custom properties (installDither, a copy of
// src/ui/dither.js's approach: the page imports nothing from src/ui), the same dither as NEWT's.
// Pure but for installDither.

/*! Phosphor Icons | MIT | https://github.com/phosphor-icons/core */
/*
 * MIT License
 *
 * Copyright (c) 2023 Phosphor Icons
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/** The icons' size on screen, CSS px (Phosphor's 256 grid scaled down). */
export const ICON_PX = 24;

/** Each icon's Phosphor name (its bold weight: assets/bold/<name>-bold.svg). */
export const ICON_SOURCES = /** @type {const} */ ({
  replay: 'envelope-simple',
  wave: 'hand-waving',
  sit: 'arrow-line-down',
  stand: 'arrow-line-up',
  device: 'device-mobile',
  lieDown: 'arrow-fat-line-down',
  getUp: 'arrow-fat-line-up',
  run: 'sneaker-move',
  camera: 'camera',
  settings: 'sliders-horizontal',
  turnLeft: 'arrow-counter-clockwise',
  turnRight: 'arrow-clockwise',
  tiltUp: 'caret-up',
  tiltDown: 'caret-down',
  zoomIn: 'magnifying-glass-plus',
  zoomOut: 'magnifying-glass-minus',
  follow: 'crosshair',
  reset: 'house',
  link: 'link',
});

/** Each icon's path data (Phosphor bold, on its viewBox 0 0 256 256). */
export const ICONS = {
  // Replay Intro: an envelope (the intro opens from one).
  replay:
    'M224,44H32A12,12,0,0,0,20,56V192a20,20,0,0,0,20,20H216a20,20,0,0,0,20-20V56A12,12,0,0,0,224,44ZM193.15,68,128,127.72,62.85,68ZM44,188V83.28l75.89,69.57a12,12,0,0,0,16.22,0L212,83.28V188Z',
  // Wave: a waving hand.
  wave: 'M184.63,23.14a12,12,0,0,1,15-8A72.34,72.34,0,0,1,228.4,32a12,12,0,0,1-16.58,17.35,48.31,48.31,0,0,0-19.2-11.2A12,12,0,0,1,184.63,23.14ZM232.85,167.8A92,92,0,0,1,64.31,190l-40-69.32A32,32,0,0,1,36,77a31.72,31.72,0,0,1,7.54-3.14A32,32,0,0,1,88.65,32.45a32,32,0,0,1,53,3.55l14.53,25.17A32,32,0,0,1,206.35,68l17.31,30A91.38,91.38,0,0,1,232.85,167.8Zm-30-57.81L185.57,80a8,8,0,0,0-13.86,8h0l6.68,11.57a12,12,0,0,1-3.18,15.59,28,28,0,0,0-6.41,38.1,12,12,0,1,1-19.86,13.46,52.05,52.05,0,0,1,3.9-63.4L120.9,48A8,8,0,0,0,107,56l24.25,42a12,12,0,1,1-20.78,12L79.33,56a8,8,0,0,0-13.85,8L99,122a12,12,0,0,1-20.78,12L58.93,100.67a8,8,0,1,0-13.85,8L85.1,178a68,68,0,0,0,117.78-68ZM50.46,198a12,12,0,1,0-20.78,12,132.79,132.79,0,0,0,20,26.38,12,12,0,1,0,17.17-16.76A109.2,109.2,0,0,1,50.46,198Z',
  // Sit: an arrow down onto a line, the floor.
  sit: 'M47.51,112.49a12,12,0,0,1,17-17L116,147V32a12,12,0,0,1,24,0V147l51.51-51.52a12,12,0,0,1,17,17l-72,72a12,12,0,0,1-17,0ZM216,204H40a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Z',
  // Stand (Sit's label while he sits): the arrow up off it.
  stand:
    'M208.49,143.51a12,12,0,0,1-17,17L140,109V224a12,12,0,0,1-24,0V109L64.49,160.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0ZM216,28H40a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Z',
  // Screen Time: a phone.
  device:
    'M176,12H80A28,28,0,0,0,52,40V216a28,28,0,0,0,28,28h96a28,28,0,0,0,28-28V40A28,28,0,0,0,176,12ZM76,76H180V180H76Zm4-40h96a4,4,0,0,1,4,4V52H76V40A4,4,0,0,1,80,36Zm96,184H80a4,4,0,0,1-4-4V204H180v12A4,4,0,0,1,176,220Z',
  // Lie Down (while he sits with the device): a fat arrow down.
  lieDown:
    'M235.09,131.41A12,12,0,0,0,224,124H188V80a12,12,0,0,0-12-12H80A12,12,0,0,0,68,80v44H32a12,12,0,0,0-8.48,20.49l96,96a12,12,0,0,0,17,0l96-96A12,12,0,0,0,235.09,131.41ZM128,215,61,148H80a12,12,0,0,0,12-12V92h72v44a12,12,0,0,0,12,12h19ZM68,40A12,12,0,0,1,80,28h96a12,12,0,0,1,0,24H80A12,12,0,0,1,68,40Z',
  // Get Up (while he lies): a fat arrow up.
  getUp:
    'M232.48,111.51l-96-96a12,12,0,0,0-17,0l-96,96A12,12,0,0,0,32,132H68v44a12,12,0,0,0,12,12h96a12,12,0,0,0,12-12V132h36a12,12,0,0,0,8.48-20.49ZM176,108a12,12,0,0,0-12,12v44H92V120a12,12,0,0,0-12-12H61l67-67,67,67Zm12,108a12,12,0,0,1-12,12H80a12,12,0,0,1,0-24h96A12,12,0,0,1,188,216Z',
  // Run: a sneaker on the move.
  run: 'M232.94,163.06l-28.62-14.31A43.78,43.78,0,0,1,180,109.39V80a12,12,0,0,0-12-12,44.05,44.05,0,0,1-44-44,12,12,0,0,0-19.25-9.56l-77,58.41-.3.23a20,20,0,0,0-1.56,29.69L139.57,216.49a12,12,0,0,0,8.49,3.51H224a20,20,0,0,0,20-20V180.94A19.88,19.88,0,0,0,232.94,163.06ZM220,196H153L46.08,89.05l12.86-9.76,41.2,41.2a12,12,0,0,0,17-17L78.25,64.65l25.24-19.14A68.24,68.24,0,0,0,156,90.94v18.45a67.62,67.62,0,0,0,37.59,60.82L220,183.42ZM55.49,184H32a12,12,0,0,1,0-24H55.49a12,12,0,0,1,0,24Zm48,24a12,12,0,0,1-12,12H48a12,12,0,0,1,0-24H91.49A12,12,0,0,1,103.49,208Z',
  // Camera: a camera.
  camera:
    'M208,52H182.42L170,33.34A12,12,0,0,0,160,28H96a12,12,0,0,0-10,5.34L73.57,52H48A28,28,0,0,0,20,80V192a28,28,0,0,0,28,28H208a28,28,0,0,0,28-28V80A28,28,0,0,0,208,52Zm4,140a4,4,0,0,1-4,4H48a4,4,0,0,1-4-4V80a4,4,0,0,1,4-4H80a12,12,0,0,0,10-5.34L102.42,52h51.15L166,70.66A12,12,0,0,0,176,76h32a4,4,0,0,1,4,4ZM128,84a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,84Zm0,72a24,24,0,1,1,24-24A24,24,0,0,1,128,156Z',
  // Settings: sliders.
  settings:
    'M40,92H70.06a36,36,0,0,0,67.88,0H216a12,12,0,0,0,0-24H137.94a36,36,0,0,0-67.88,0H40a12,12,0,0,0,0,24Zm64-24A12,12,0,1,1,92,80,12,12,0,0,1,104,68Zm112,96H201.94a36,36,0,0,0-67.88,0H40a12,12,0,0,0,0,24h94.06a36,36,0,0,0,67.88,0H216a12,12,0,0,0,0-24Zm-48,24a12,12,0,1,1,12-12A12,12,0,0,1,168,188Z',
  // Turn Left: an arrow round counter-clockwise, the way it turns the scene.
  turnLeft:
    'M228,128a100,100,0,0,1-98.66,100H128a99.39,99.39,0,0,1-68.62-27.29,12,12,0,0,1,16.48-17.45,76,76,0,1,0-1.57-109c-.13.13-.25.25-.39.37L54.89,92H72a12,12,0,0,1,0,24H24a12,12,0,0,1-12-12V56a12,12,0,0,1,24,0V76.72L57.48,57.06A100,100,0,0,1,228,128Z',
  // Turn Right: clockwise.
  turnRight:
    'M244,56v48a12,12,0,0,1-12,12H184a12,12,0,1,1,0-24H201.1l-19-17.38c-.13-.12-.26-.24-.38-.37A76,76,0,1,0,127,204h1a75.53,75.53,0,0,0,52.15-20.72,12,12,0,0,1,16.49,17.45A99.45,99.45,0,0,1,128,228h-1.37A100,100,0,1,1,198.51,57.06L220,76.72V56a12,12,0,0,1,24,0Z',
  // Tilt Up and Down: carets.
  tiltUp:
    'M216.49,168.49a12,12,0,0,1-17,0L128,97,56.49,168.49a12,12,0,0,1-17-17l80-80a12,12,0,0,1,17,0l80,80A12,12,0,0,1,216.49,168.49Z',
  tiltDown: 'M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z',
  // Zoom In and Out: a magnifier with a + or a −.
  zoomIn:
    'M156,112a12,12,0,0,1-12,12H124v20a12,12,0,0,1-24,0V124H80a12,12,0,0,1,0-24h20V80a12,12,0,0,1,24,0v20h20A12,12,0,0,1,156,112Zm76.49,120.49a12,12,0,0,1-17,0L168,185a92.12,92.12,0,1,1,17-17l47.54,47.53A12,12,0,0,1,232.49,232.49ZM112,180a68,68,0,1,0-68-68A68.08,68.08,0,0,0,112,180Z',
  zoomOut:
    'M156,112a12,12,0,0,1-12,12H80a12,12,0,0,1,0-24h64A12,12,0,0,1,156,112Zm76.49,120.49a12,12,0,0,1-17,0L168,185a92.12,92.12,0,1,1,17-17l47.54,47.53A12,12,0,0,1,232.49,232.49ZM112,180a68,68,0,1,0-68-68A68.08,68.08,0,0,0,112,180Z',
  // Follow NEWT: a crosshair.
  follow:
    'M232,116h-4.72A100.21,100.21,0,0,0,140,28.72V24a12,12,0,0,0-24,0v4.72A100.21,100.21,0,0,0,28.72,116H24a12,12,0,0,0,0,24h4.72A100.21,100.21,0,0,0,116,227.28V232a12,12,0,0,0,24,0v-4.72A100.21,100.21,0,0,0,227.28,140H232a12,12,0,0,0,0-24Zm-92,87v-3a12,12,0,0,0-24,0v3a76.15,76.15,0,0,1-63-63h3a12,12,0,0,0,0-24H53a76.15,76.15,0,0,1,63-63v3a12,12,0,0,0,24,0V53a76.15,76.15,0,0,1,63,63h-3a12,12,0,0,0,0,24h3A76.15,76.15,0,0,1,140,203ZM128,84a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,84Zm0,64a20,20,0,1,1,20-20A20,20,0,0,1,128,148Z',
  // Reset Camera: home.
  reset:
    'M222.14,105.85l-80-80a20,20,0,0,0-28.28,0l-80,80A19.86,19.86,0,0,0,28,120v96a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V164h24v52a12,12,0,0,0,12,12h64a12,12,0,0,0,12-12V120A19.86,19.86,0,0,0,222.14,105.85ZM204,204H164V152a12,12,0,0,0-12-12H104a12,12,0,0,0-12,12v52H52V121.65l76-76,76,76Z',
  // The link button (the admin's link: link.js): two chain links.
  link: 'M117.18,188.74a12,12,0,0,1,0,17l-5.12,5.12A58.26,58.26,0,0,1,70.6,228h0A58.62,58.62,0,0,1,29.14,127.92L63.89,93.17a58.64,58.64,0,0,1,98.56,28.11,12,12,0,1,1-23.37,5.44,34.65,34.65,0,0,0-58.22-16.58L46.11,144.89A34.62,34.62,0,0,0,70.57,204h0a34.41,34.41,0,0,0,24.49-10.14l5.11-5.12A12,12,0,0,1,117.18,188.74ZM226.83,45.17a58.65,58.65,0,0,0-82.93,0l-5.11,5.11a12,12,0,0,0,17,17l5.12-5.12a34.63,34.63,0,1,1,49,49L175.1,145.86A34.39,34.39,0,0,1,150.61,156h0a34.63,34.63,0,0,1-33.69-26.72,12,12,0,0,0-23.38,5.44A58.64,58.64,0,0,0,150.56,180h.05a58.28,58.28,0,0,0,41.47-17.17l34.75-34.75a58.62,58.62,0,0,0,0-82.91Z',
};

/** @typedef {keyof typeof ICONS} IconName */

/** Each label the toolbar and the Camera pad show, and its icon. @type {Record<string, IconName>} */
export const LABEL_ICONS = {
  'Replay Intro': 'replay',
  Wave: 'wave',
  Sit: 'sit',
  Stand: 'stand',
  'Screen Time': 'device',
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
 * An icon as inline SVG: its Phosphor path on the 256 grid, ICON_PX on screen in currentColor
 * (smooth, never snapped to pixels), hidden from screen readers.
 * @param {IconName} name
 */
export function iconSvg(name) {
  const d = ICONS[name];
  if (!d) throw new Error(`no icon called ${name}`);
  return `<svg class="inv-icon" viewBox="0 0 256 256" width="${ICON_PX}" height="${ICON_PX}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
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
