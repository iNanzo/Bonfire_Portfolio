// The "Soft" look preset (data only): Webfishing by way of Wild World on a white page. Chunkier
// pixels (about 150 texels on the short side); 20 levels a channel with a visible Bayer dither
// in his shading; a soft pastel grade; coloured outlines, a darker plum shade of the colour
// beside them, drawn on the paper just outside his silhouette like a sprite's; and a soft shadow,
// its edge spread over 2 texels and dithered into two tones on a warm white page. Every look
// value lives here so the look designer edits data, never code (look.js has the shape,
// LookPreset; retro.js the pass's own extras, RetroExtras).

/** @type {import('../look.js').LookPreset & import('../retro.js').RetroExtras} */
export default {
  label: 'Soft',
  texels: { fine: 200, ds: 150, chunky: 112 },
  levels: 20,
  dither: 0.6,
  outline: { darken: 0.35, tint: '#a0607a', depth: 0.015, outside: true },
  grade: { lift: 0.05, gamma: 1.05, saturation: 0.85, tint: '#fff2ea', exposure: 1.02 },
  toon: [0.5, 0.5, 0.5, 0.5, 0.85, 0.85, 0.85, 1],
  background: 0xfdfaf4,
  shadow: {
    type: 'basic',
    mapSize: 1024,
    bias: -0.0008,
    normalBias: 0.02,
    radius: 1,
    color: 0x9a7f9a,
    opacity: 0.55,
    soft: 2,
    steps: 2,
    dither: 1,
  },
  sun: { dir: [-0.6, 1, 0.9], color: '#fff0de', intensity: 2.4 },
  hemi: { sky: '#fdf8ff', ground: '#e6c8c0', intensity: 1.3 },
  blob: { opacity: 0.14, lifted: 0.34 },
  marker: { color: '#a3826f' },
  animFps: 0,
};
