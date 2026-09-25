// The NH monogram: an N and an H sharing one long crossbar, the two inner stems
// rising high like a blade over its guard. Line art in currentColor, so it takes
// whatever color the flame gives it; no background, no container.
// Each stroke is its own subpath with butt caps, as in the drawn original: the N's
// diagonal meets its stems in a fine wedge instead of a beveled joint.
const PATH = 'M-15 78V27M-15 27L-4.5 68M-4.5 68V2M4.5 2V68M15 27V78M-27.5 47H27.5';

/** Inline header mark: fine antialiased strokes (not pixel-snapped), scaled with the SVG. */
export const logoMark = (className = '') =>
  `<svg class="${className}" viewBox="-29 0 58 80" fill="none" stroke="currentColor" stroke-width="2.4" shape-rendering="geometricPrecision" aria-hidden="true" focusable="false"><path d="${PATH}"/></svg>`;

/** Favicon markup: heavier strokes to survive 16–32 px; the flame's bright tone on dark tab strips, its deep tone on light ones. */
export const faviconSvg = (dark, light) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 0 80 80"><style>path{stroke:${dark}}@media (prefers-color-scheme:light){path{stroke:${light}}}</style><path d="${PATH}" fill="none" stroke-width="5.5"/></svg>`;
