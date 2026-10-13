// The "DS" look preset (data only): the old handheld's 3D on a white page, on the Pixel Size's grid
// (96×96 by default: 390 texels across a 390-wide phone, twice the DS's own 192 lines; no
// preset sets the grid); 18-bit colour (64 levels a channel, 6 bits) under a light Bayer dither (light enough
// not to crawl over him as he moves); the DS's edge marking (a 1-texel line on NEWT's own edge
// texels, where the surface or the depth jumps: none on the floor or in his shadow), dark enough to
// show on his skin and clothes; two toon bands and a highlight, the shade band and the fill high
// enough that his black hair keeps two tones, warmed toward Animal Crossing: Wild World by a peach
// fill, the grade close to neutral (a stronger warm tint and saturation turned his skin orange and
// his grey trousers brown); his textures a mip and a half coarser where the pixel atlas isn't
// loaded (character.js; its flat colours have no mips), so the toon bands shade him rather than
// his shirt's pattern, and half a mip from 128 texels tall, where the glb's own plaid replaces
// the pixel atlas (at 1.5 its checks blurred into grey, its neighbours streaking his trousers); a hard BasicShadowMap shadow, one flat warm lavender grey on
// the white, lighter than him; no blob under him while he stands (only a flat one while he's
// lifted). Every look value lives here so the look designer edits data, never code: retro.js,
// stage.js, floor.js and character.js read it (look.js has the shape, LookPreset; retro.js the
// pass's own extras, RetroExtras).

/** @type {import('../look.js').LookPreset & import('../retro.js').RetroExtras} */
export default {
  label: 'DS',
  levels: 64,
  dither: 0.25,
  // (Dark lines; Tinted, a Shader option, multiplies them by the lavender of his shadow.)
  outline: { darken: 0.6, tint: '#9c88c4', ink: 'dark', depth: 0.015, outside: false },
  grade: { lift: 0, gamma: 1, saturation: 1.04, tint: '#fffdfa', exposure: 1.02, contrast: 1, warmth: 0 },
  // (Over the light's angle: shade on his side away from it, lit facing it, the highlight where
  // it falls straight, N·L 0.75 on: shader.js toonRamp.)
  toon: { bands: 2, highlight: true, shade: 0.5, lit: 0.8 },
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
  sun: { dir: [-0.55, 1, 0.75], color: '#fff6e8', intensity: 2.6, turn: 0, strength: 1 },
  hemi: { sky: '#ffffff', ground: '#e8c8b0', intensity: 1.3 },
  blob: { opacity: 0, lifted: 0.3 },
  marker: { color: '#6f6457' },
  texture: { mipBias: 1.5, fineMipBias: 0.5 },
  // (Choppy motion, for the user to try: 15 steps a second is the choppy option; 0 is smooth.)
  animFps: 0,
};
