// The NH monogram: an N and an H sharing one long crossbar, the two inner stems
// rising high like a blade over its guard. Line art in currentColor, so it takes
// whatever color the flame gives it; no background, no container.
// Each stroke is its own subpath with butt caps, as in the drawn original: the N's
// diagonal meets its stems in a fine wedge instead of a beveled joint.
// The same six strokes, parsed from the path (LOGO_STROKES), are the 3D monogram's too: the
// knight's summon sign on the ground (bonfire/summonSign.js) and the cult's sigils
// (bonfire/scenery.js), so the mark and its glyphs never drift apart.
const PATH = 'M-15 78V27M-15 27L-4.5 68M-4.5 68V2M4.5 2V68M15 27V78M-27.5 47H27.5';

/**
 * The path's strokes as straight segments [x0, y0, x1, y1], in its own units (the header
 * mark's viewBox: x −27.5…27.5 across, y 2…78 down). Only the commands the mark uses: M,
 * L, H and V, absolute.
 * @param {string} d
 * @returns {number[][]}
 */
export function strokesOf(d) {
  const out = [];
  let x = 0, y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M') { [x, y] = n; continue; }
    const [nx, ny] = cmd === 'L' ? n : cmd === 'H' ? [n[0], y] : [x, n[0]];
    out.push([x, y, nx, ny]);
    x = nx; y = ny;
  }
  return out;
}

/** The monogram's six strokes: [x0, y0, x1, y1] each, in the path's units (see strokesOf). */
export const LOGO_STROKES = strokesOf(PATH);
/** The strokes' extent in the path's units: [xMin, yMin, xMax, yMax]. */
export const LOGO_BOUNDS = LOGO_STROKES.reduce(
  (b, [x0, y0, x1, y1]) => [Math.min(b[0], x0, x1), Math.min(b[1], y0, y1), Math.max(b[2], x0, x1), Math.max(b[3], y0, y1)],
  [Infinity, Infinity, -Infinity, -Infinity],
);

/**
 * The monogram as bars for a 3D glyph `height` m tall, strokes `stroke` m wide: each bar's
 * middle (u across, to the right; v up, from the glyph's middle), its length and its angle
 * from the u axis (radians, counterclockwise). The ends are butt-cut like the mark's, so the
 * N's diagonal meets its stems in the same fine wedge.
 * @param {number} height
 * @param {number} stroke
 * @returns {{ u: number, v: number, len: number, angle: number, width: number }[]}
 */
export function logoBars(height, stroke) {
  const [x0, y0, x1, y1] = LOGO_BOUNDS;
  const k = height / (y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return LOGO_STROKES.map(([ax, ay, bx, by]) => {
    const u0 = (ax - cx) * k, v0 = (cy - ay) * k, u1 = (bx - cx) * k, v1 = (cy - by) * k;
    return { u: (u0 + u1) / 2, v: (v0 + v1) / 2, len: Math.hypot(u1 - u0, v1 - v0), angle: Math.atan2(v1 - v0, u1 - u0), width: stroke };
  });
}

/** Inline header mark: fine antialiased strokes (not pixel-snapped), scaled with the SVG. */
export const logoMark = (className = '') =>
  `<svg class="${className}" viewBox="-29 0 58 80" fill="none" stroke="currentColor" stroke-width="2.4" shape-rendering="geometricPrecision" aria-hidden="true" focusable="false"><path d="${PATH}"/></svg>`;

/** Favicon markup: heavier strokes to survive 16–32 px; the flame's bright tone on dark tab strips, its deep tone on light ones. */
export const faviconSvg = (dark, light) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 0 80 80"><style>path{stroke:${dark}}@media (prefers-color-scheme:light){path{stroke:${light}}}</style><path d="${PATH}" fill="none" stroke-width="5.5"/></svg>`;
