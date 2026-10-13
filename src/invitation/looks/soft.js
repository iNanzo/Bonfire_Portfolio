// The "Soft" look preset (data only): Webfishing by way of Wild World on a white page, on the same
// grid as DS (the Pixel Size's: no preset sets the grid); 28 levels a channel with a Bayer dither
// that stays in his soft gradients, not over his dark hair and clothes; a pastel grade that keeps
// him peachy and his eyes near black; coloured outlines, a darker plum shade of the colour beside
// them, drawn on the paper just outside his silhouette like a sprite's (never on his face); his
// textures a mip and a half coarser, so the toon bands shade him rather than his shirt's pattern
// (half a mip from 128 texels tall, where the glb's own plaid shows and has the texels to resolve);
// and a soft shadow, its edge spread over one texel and dithered into two tones on a warm white
// page; no blob under him while he stands (only a flat one while he's lifted). Every look value
// lives here so the look designer edits data, never code (look.js has the shape, LookPreset;
// retro.js the pass's own extras, RetroExtras).

/** @type {import('../look.js').LookPreset & import('../retro.js').RetroExtras} */
export default {
  label: 'Soft',
  levels: 28,
  dither: 0.35,
  outline: { darken: 0.35, tint: '#a0607a', ink: 'tinted', depth: 0.015, outside: true },
  grade: { lift: 0.02, gamma: 1.05, saturation: 0.95, tint: '#fff2ea', exposure: 1.02, contrast: 1, warmth: 0 },
  toon: { bands: 2, highlight: true, shade: 0.5, lit: 0.85 },
  background: 0xfdfaf4,
  shadow: {
    type: 'basic',
    mapSize: 1024,
    bias: -0.0008,
    normalBias: 0.02,
    radius: 1,
    color: 0x9a7f9a,
    opacity: 0.6,
    soft: 1,
    steps: 2,
    dither: 1,
  },
  sun: { dir: [-0.6, 1, 0.9], color: '#fff0de', intensity: 2.4, turn: 0, strength: 1 },
  hemi: { sky: '#fdf8ff', ground: '#e6c8c0', intensity: 1.3 },
  blob: { opacity: 0, lifted: 0.34 },
  marker: { color: '#a3826f' },
  texture: { mipBias: 1.5, fineMipBias: 0.5 },
  animFps: 0,
};
