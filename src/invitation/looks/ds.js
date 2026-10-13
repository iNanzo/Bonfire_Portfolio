// The "DS" look preset (data only): the old handheld's 3D on a white page. About 192 texels on
// the short side; 18-bit colour (64 levels a channel, 6 bits) under a fine Bayer dither; the
// DS's edge marking (a 1-texel line on NEWT's own edge texels, where the surface or the depth
// jumps: none on the floor or in his shadow); two toon bands and a highlight, warmed toward
// Animal Crossing: Wild World by a peach fill in his shade; a hard BasicShadowMap shadow, one
// flat lavender grey on the white. Every look value lives here so the look designer edits data,
// never code: retro.js, stage.js, floor.js and character.js read it (look.js has the shape,
// LookPreset; retro.js the pass's own extras, RetroExtras).

/** @type {import('../look.js').LookPreset & import('../retro.js').RetroExtras} */
export default {
  label: 'DS',
  texels: { fine: 256, ds: 192, chunky: 144 },
  levels: 64,
  dither: 0.3,
  outline: { darken: 0.45, tint: '#ffffff', depth: 0.015 },
  grade: { lift: 0, gamma: 1, saturation: 1.08, tint: '#fff8f0', exposure: 1.05 },
  // (Over the light's angle, -1..1 in eighths: shade below 0, lit to 0.75, the highlight above.)
  toon: [0.42, 0.42, 0.42, 0.42, 0.8, 0.8, 0.8, 1],
  background: 0xffffff,
  shadow: {
    type: 'basic',
    mapSize: 1024,
    bias: -0.0006,
    normalBias: 0.015,
    radius: 1,
    color: 0x8a86a6,
    opacity: 0.6,
    soft: 0,
    steps: 0,
  },
  sun: { dir: [-0.55, 1, 0.75], color: '#fff6e8', intensity: 2.6 },
  hemi: { sky: '#ffffff', ground: '#e8c8b0', intensity: 1.15 },
  blob: { opacity: 0.12, lifted: 0.3 },
  marker: { color: '#6f6457' },
  // (Choppy motion, for the user to try: 12 to 15 steps a second; 0 is smooth.)
  animFps: 0,
};
