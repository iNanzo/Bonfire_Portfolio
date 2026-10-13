// The "DS" look preset (data only): the old handheld's 3D on a white page. About 192 texels on
// the short side (the DS's own screen height); 18-bit colour (64 levels a channel, 6 bits)
// under a light Bayer dither (light enough not to crawl over him as he moves); the DS's edge
// marking (a 1-texel line on NEWT's own edge texels, where the surface or the depth jumps: none
// on the floor or in his shadow), dark enough to show on his skin and clothes; two toon bands
// and a highlight, the shade band and the fill high enough that his black hair keeps two tones,
// warmed toward Animal Crossing: Wild World by a peach fill and a little more saturation; his
// textures a mip and a half coarser, so the toon bands shade him rather than his shirt's
// pattern; a hard BasicShadowMap shadow, one flat warm lavender grey on the white, lighter than
// him; no blob under him while he stands (only a flat one while he's lifted). Every look value
// lives here so the look designer edits data, never code: retro.js, stage.js, floor.js and
// character.js read it (look.js has the shape, LookPreset; retro.js the pass's own extras,
// RetroExtras).

/** @type {import('../look.js').LookPreset & import('../retro.js').RetroExtras} */
export default {
  label: 'DS',
  texels: { fine: 256, ds: 192, chunky: 144 },
  levels: 64,
  dither: 0.25,
  outline: { darken: 0.6, tint: '#ffffff', depth: 0.015 },
  grade: { lift: 0, gamma: 1, saturation: 1.15, tint: '#fff8f0', exposure: 1.05 },
  // (Over the light's angle, -1..1 in eighths: shade below 0, lit to 0.75, the highlight above.)
  toon: [0.5, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  background: 0xffffff,
  shadow: {
    type: 'basic',
    mapSize: 1024,
    bias: -0.0006,
    normalBias: 0.015,
    radius: 1,
    color: 0x988ea6,
    opacity: 0.45,
    soft: 0,
    steps: 0,
  },
  sun: { dir: [-0.55, 1, 0.75], color: '#fff6e8', intensity: 2.6 },
  hemi: { sky: '#ffffff', ground: '#e8c8b0', intensity: 1.3 },
  blob: { opacity: 0, lifted: 0.3 },
  marker: { color: '#6f6457' },
  texture: { mipBias: 1.5 },
  // (Choppy motion, for the user to try: 15 steps a second is the choppy option; 0 is smooth.)
  animFps: 0,
};
