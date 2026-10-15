// The "Default" look preset (data only): the user's own look (round 14), the Style a first visit
// starts on and the first in the row. It's Soft (soft.js) with the values they picked in the Look
// menu: 6 colour levels a channel under a full-strength Bayer dither, which reads as a chunky
// sprite's checker; full-strength lines in Soft's plum ink on the Outer Ring (just outside him,
// like a sprite's outline: at full strength the ink is near black); two toon bands and the
// Highlight; the soft, dithered shadow edge. Everything else (the page, the grade, the light, the
// shadow map, the decals, the texture mips) is Soft's, taken from soft.js, so a change there
// carries over. Its Pixel Size, 128×128, is pixels.js DEFAULT_PIXEL (no preset sets the grid),
// and Motion Smooth is look.js's default. look.js has the shape (LookPreset); shader.js the
// Shader options it sets.
import soft from './soft.js';

/** @type {import('../look.js').LookPreset & import('../retro.js').RetroExtras} */
export default {
  ...soft,
  label: 'Default',
  levels: 6,
  dither: 1,
  outline: { ...soft.outline, darken: 1, ink: 'tinted', outside: true },
  toon: { ...soft.toon, bands: 2, highlight: true },
  shadow: { ...soft.shadow, soft: 1, steps: 2, dither: 1 },
};
