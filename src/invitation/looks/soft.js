// The "Soft" look preset (data only): Webfishing by way of Wild World, chunkier pixels (about
// 150 texels on the short side at DS), 20 levels a channel with a visible Bayer dither, a pastel
// grade, warm coloured outlines and a softer, dithered shadow. Every look value lives here so the
// look designer edits data, never code (src/invitation/look.js has the shape, LookPreset).

/** @type {import('../look.js').LookPreset} */
export default {
  label: 'Soft',
  texels: { fine: 216, ds: 150, chunky: 120 },
  levels: 20,
  dither: 1,
  outline: { darken: 0.3, tint: '#c49a8a', depth: 0.002 },
  grade: { lift: 0.06, gamma: 1.05, saturation: 0.86, tint: '#fff4ec', exposure: 1 },
  toon: [0.55, 0.8, 1],
  shadow: { type: 'pcf', mapSize: 1024, bias: -0.0008, normalBias: 0.02, radius: 3 },
  sun: { dir: [-0.6, 1, 0.9], color: '#fff0de', intensity: 2.4 },
  hemi: { sky: '#fdf8ff', ground: '#e6dccb', intensity: 1.3 },
  room: { background: '#f6efe6', floor: '#eadfce', wall: '#fbf6ef', side: '#f3ece3', baseboard: '#d8c8b4' },
  blob: { color: '#6b5a52', opacity: 0.2, lifted: 0.34 },
  marker: { color: '#a3826f' },
  animFps: 0,
};
