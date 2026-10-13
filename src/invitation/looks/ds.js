// The "DS" look preset (data only): the old handheld's 3D, about 192 texels on the short side,
// 18-bit colour (64 levels a channel, barely dithered), a 1-texel line where depth or the
// surface changes, two toon bands and a highlight, a hard shadow. Every look value lives here
// so the look designer edits data, never code; retro.js, stage.js, room.js and character.js
// read it (src/invitation/look.js has the shape, LookPreset).

/** @type {import('../look.js').LookPreset} */
export default {
  label: 'DS',
  texels: { fine: 270, ds: 192, chunky: 150 },
  levels: 64,
  dither: 0.35,
  outline: { darken: 0.42, tint: '#ffffff', depth: 0.002 },
  grade: { lift: 0.015, gamma: 1, saturation: 1.05, tint: '#ffffff', exposure: 1 },
  toon: [0.45, 0.78, 0.78, 1],
  shadow: { type: 'basic', mapSize: 1024, bias: -0.0006, normalBias: 0.015, radius: 1 },
  sun: { dir: [-0.55, 1, 0.75], color: '#fff6e8', intensity: 2.6 },
  hemi: { sky: '#ffffff', ground: '#d9d2c5', intensity: 1.15 },
  room: { background: '#f3f0ea', floor: '#e3ddd2', wall: '#f7f5f0', side: '#efece6', baseboard: '#cfc7b9' },
  blob: { color: '#5a5048', opacity: 0.16, lifted: 0.3 },
  marker: { color: '#6f6457' },
  animFps: 0,
};
