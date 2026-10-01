// Looks: the pixel pass's effects (scene.glitch → pixelPass.js), played as a set of
// styles that take turns, so it isn't always glitch. One look at a time takes its turn;
// looks switched to "always" stay on underneath it. Each answers the beat its own way and
// has its own burst for the big hits.
//
//   ember    clean: just the fire (the director's zoom punch and shake still land).
//   glitch   torn rows, an RGB split on the kick, crunchy pixels and static; tearing
//            more and more through a build.
//   echo     the last frame echoes out of the fire like a tunnel (or falls into it), and
//            on downbeats the flame's ramp colors cycle, old pixel-art palette animation
//            style (its big hits spin them). The palette steps and spins follow the
//            user's Color Cycle switch: with it Off (Low Flash, Chill) the echo plays
//            without them, a scene's Echo too (update's `cycles`).
//   ripple   a shockwave ring pushes out of the fire on every kick.
//   kaleido  a kaleidoscope around the screen's center, spinning with the kicks, its
//            segments changing each phrase, with a light echo.
//   ink      downbeats flash the scene to 1-bit (dithered to the void and the flame's
//            core), over scanlines.
//   vortex   echoes turning as they stream out: a spiral, flung faster on the kicks.
//   mosaic   the kicks crunch the picture into big pixels that settle back.
//   haze     the rows shimmer sideways like heat over the fire, swelling with the music.
//   prism    the colors split apart on every beat.
//
// Every effect has one switch with three settings (MODES): off, in the mix, or always.
// Looks in the mix take turns; drop hits in the mix are drawn at random; layers, the
// director's effects and the render switches in the mix (LAYERS, CHANCE; render.js) come
// and go: each time a look comes round it re-rolls which of them are on (a new `turn`),
// and each rolls its own details (the echo's direction, the glow's size, the gradient's
// colors, how each layer blends…), so the picture keeps finding new combinations.
//
// Layers go over whatever look is playing:
//   scanlines, mirror   as before (thin, thick or column lines; horizontal, vertical or
//                       quarter mirrors, from the kinds switched on).
//   blend modes         the layers blend in new ways: echoes in screen or difference,
//                       ink in overlay, the kaleidoscope ghosted over the plain picture…
//   ghosting            a fading trail of everything that moves.
//   motion blur         the camera's moves smear the picture (whips, shakes, punches).
//   glow                light spills from the bright parts.
//   gradient map        the picture recolored by brightness through three palette colors.
//   painterly/watercolor  the picture repainted in strokes, or washed flat (one at a time).
//   flicker             the light dips on the beat, rolls, jitters like film, or wavers.
//   grain               film grain, steady or swelling on the kicks.
//   cinema bars         letterbox bars slide in and stay for the look.
//   spotlight           an iris round the fire, breathing with the music.
//   chroma split        the color channels drift apart a little, kicked wider on the beat.
// In the mix, at most two of the heavier layers come in at once (always-on ones aside).
// In any look a breakdown frames itself: letterbox bars slide in and an iris closes
// around the fire as the build rises; the drop snaps it open.
//
// Drops: besides the look's own burst (and the negative flash, a setting), each drop
// throws the hits set to always, plus one to three drawn from those in the mix, never
// the same set twice running: a shatter, shockwaves, an echo burst, a spiral, a
// kaleidoscope, mirror flips on the beat, a color cycle, an RGB burst, a crunch, an iris
// snapping open, a letterbox slam, an ink flash, an x-ray (the drop lands in one of the
// passes the picture is built from, for a beat: render.js).
// Full-screen flashes (the ink flash, the negative on drops) stay on downbeats and big
// hits, well under three a second; the flicker's fast kinds stay faint. No palette cycles
// at all (the Color Cycle hit, the Echo look's steps and spins) while `cycles` is false.
//
// Every detail the dice roll has one entry in PARAMS: the range a scene may pin (the
// Painter's slider and the scene validator use it) and the range the dice roll in (a
// part of it). A preset scene pins a look (pin()): its look plays alone, its layers are
// on, off or in the mix as painted, and the details it pinned stay put while the rest
// (and the layers in the mix) are rolled again each turn, so a held scene still keeps
// finding new combinations. A pinned look shows at its painted strength even in silence
// (update's `rest`); the beat still pulses and bursts it on top.
//
// Reduced motion (createLooks' `reducedMotion`): the looks answer no beat, hat or hit (no
// ripples, spins, color cycles, ink or kicks), so whatever shows holds still: the director
// gives the free show no strength at all (a clean picture), and a scene's pinned look comes
// already clamped to its still parts (scenePlayer.js: Ember, no layer that moves), which show
// at their painted strength without a pulse; the spotlight doesn't breathe.
import { approach, clamp, pick, shuffle } from '../math.js';
import { modeOf } from '../modes.js';

export const LOOKS = {
  ember: 'Ember', glitch: 'Glitch', echo: 'Echo', ripple: 'Ripple', kaleido: 'Kaleido', ink: 'Ink',
  vortex: 'Vortex', mosaic: 'Mosaic', haze: 'Haze', prism: 'Prism',
};
export const DROP_FX = {
  shatter: 'Shatter', shock: 'Shockwaves', burst: 'Echo Burst', spiral: 'Spiral', kaleido: 'Kaleido Burst', flips: 'Mirror Flips',
  cycle: 'Color Cycle', split: 'RGB Burst', crunch: 'Crunch', iris: 'Iris Snap', slam: 'Letterbox Slam', ink: 'Ink Flash',
  xray: 'X-Ray',
};
// Every effect's switch (Off / In the Mix / Always) and a saved one read as a mode: shared
// with the settings fields, so they live in src/modes.js.
export { MODES, modeOf } from '../modes.js';
/** Layers over any look, each with its own switch (settings keys). */
export const LAYERS = {
  scanlines: 'Scanlines', mirror: 'Mirror', blend: 'Blend Modes', ghost: 'Ghosting', blur: 'Motion Blur', glow: 'Glow',
  gradient: 'Gradient Map', paint: 'Painterly', wash: 'Watercolor', flicker: 'Flicker',
  grain: 'Grain', cinema: 'Cinema Bars', spotlight: 'Spotlight', chroma: 'Chroma Split',
};
export const MIRRORS = { horizontal: 'Horizontal', vertical: 'Vertical', quarter: 'Quarter' };
// The pixel pass's mirror modes (x + 3y) for each kind; quarters mostly keep the top.
const MIRROR_MODES = { horizontal: [1, 2], vertical: [3, 6], quarter: [4, 5, 4, 5, 7, 8] };
/** A mirror mode from the kinds switched on, picked by two rolls in 0..1. */
function mirrorMode(kinds, r1, r2) {
  const on = Object.keys(MIRRORS).filter((k) => !kinds || kinds[k]);
  const modes = MIRROR_MODES[on[Math.floor(r1 * on.length)] ?? 'horizontal'];
  return modes[Math.floor(r2 * modes.length)];
}

// How likely each switch in the mix is to be on for a look's turn: the layers, the
// director's own effects (sparks, the blade's echo, the zoom punch, the feel, the drop's
// blackout and negative flash), and the render switches (render.js: outlines, a few
// colors, pixel shifts, x-ray flips, how hits land).
export const CHANCE = {
  scanlines: 0.3, mirror: 0.3, blend: 0.5,
  ghost: 0.3, blur: 0.35, glow: 0.4, gradient: 0.3, paint: 0.2, wash: 0.2, flicker: 0.25,
  grain: 0.3, cinema: 0.25, spotlight: 0.2, chroma: 0.3,
  sparks: 0.6, echo: 0.6, punch: 0.75, temperature: 0.6, breathe: 0.6, blackout: 0.5, flash: 0.5,
  outlines: 0.75, fewColors: 0.2, pixelShift: 0.35, xray: 0.35, hitStop: 0.6, hitFlash: 0.7, debris: 0.75, marks: 0.75,
};
const HEAVY = ['ghost', 'blur', 'glow', 'gradient', 'paint', 'wash', 'flicker'];
const MAX_HEAVY = 2;

// The pixel pass's blend modes (pixelPass.js blendMode), and the ones each layer may
// roll: the first is its classic way. Echoes and glow only get modes where black
// leaves the picture alone (their layer is mostly black).
export const BLEND = {
  normal: 0, add: 1, subtract: 2, multiply: 3, screen: 4, darken: 5, lighten: 6, overlay: 7, hardLight: 8, softLight: 9, difference: 10, exclusion: 11,
};
/** The blend modes each layer may roll (BLEND names), its classic way first. */
export const LAYER_BLENDS = {
  feed: ['lighten', 'screen', 'difference', 'exclusion'],
  ghost: ['normal', 'lighten', 'screen', 'difference', 'softLight'],
  warp: ['normal', 'screen', 'lighten', 'darken', 'difference', 'overlay'],
  ink: ['normal', 'overlay', 'multiply', 'difference', 'exclusion', 'hardLight'],
  invert: ['normal', 'difference', 'exclusion'],
  scan: ['multiply', 'screen', 'overlay'],
  glow: ['add', 'screen', 'lighten'],
  gradient: ['normal', 'overlay', 'softLight', 'hardLight', 'multiply', 'screen'],
};
const CLASSIC = Object.fromEntries(Object.entries(LAYER_BLENDS).map(([k, list]) => [k, BLEND[list[0]]]));
// Gradient maps: palette slots (scenePalette: 0 void, 1 shadow, 2 stone, 3 wood, 4 bone,
// 5–8 the flame's ramp lo → core, 9 its shade), dark to light.
const GRADIENTS = [[0, 6, 8], [9, 5, 7], [0, 2, 4], [1, 6, 4], [0, 5, 7], [2, 7, 8], [0, 3, 8]];
// The flicker's kinds: a dip on each beat, a band rolling down, film jitter, a candle's
// waver. The fast ones stay faint.
const FLICKER_AMP = [0.22, 0.25, 0.06, 0.09];

/**
 * One detail the dice roll, and what a scene may pin it to.
 * - A number: `range` (what may be pinned), `roll` (where the dice land, inside it), `step`;
 *   `signed`: the dice roll the size and a sign apart; `chance`: how often it's rolled at
 *   all (otherwise 0).
 * - A choice: `values` (what may be pinned; `names` for them), `roll` (those the dice pick from).
 * - A switch: `bool`, on with `chance`.
 * - Palette slots: `slots` of them, each 0..`of`-1.
 * @typedef {{ label: string, hint: string, range?: number[], roll?: number[], step?: number,
 *   signed?: boolean, chance?: number, values?: number[], names?: string[], bool?: boolean,
 *   slots?: number, of?: number }} ParamSpec
 */
/** @type {Record<string, ParamSpec>} Every detail the dice roll for a look's turn. */
export const PARAMS = {
  // The layers' details (rolled into each turn, in this order).
  ghostKeep: { label: 'Trail Length', hint: 'How long the ghost trail lingers behind everything that moves.', range: [0.6, 0.97], roll: [0.8, 0.94], step: 0.01 },
  ghostMix: { label: 'Trail Strength', hint: 'How much of the ghost trail shows over the picture.', range: [0.1, 0.85], roll: [0.35, 0.7], step: 0.01 },
  blur: { label: 'Blur Amount', hint: 'How far the camera’s moves (whips, shakes, punches) smear the picture.', range: [0.2, 2], roll: [0.6, 1.2], step: 0.05 },
  glowSize: { label: 'Glow Size', hint: 'How wide the light spills from the bright parts.', range: [1, 5], roll: [1.5, 3.2], step: 0.1 },
  glowCut: { label: 'Glow Threshold', hint: 'Only what is brighter than this glows: lower lets more of the picture spill light.', range: [0.05, 0.6], roll: [0.12, 0.3], step: 0.01 },
  glowAmt: { label: 'Glow Strength', hint: 'How bright the spilled light is; it swells on the kicks.', range: [0, 1.6], roll: [0.5, 1.1], step: 0.05 },
  grad: { label: 'Gradient Colors', hint: 'The three palette colors the picture is recolored through, dark to light.', slots: 3, of: 10 },
  gradAmt: { label: 'Gradient Strength', hint: 'How much of the recolored picture shows over the real one.', range: [0.1, 1], roll: [0.35, 0.8], step: 0.05 },
  paintR: { label: 'Brush Size', hint: 'How big the painterly strokes are, in pixels.', values: [2, 3, 4] },
  paintAngle: { label: 'Stroke Angle', hint: 'Which way the painterly strokes run, in radians: 0 lies flat, about 1.57 stands upright and 3.14 lies flat again.', range: [0, Math.PI], roll: [0, Math.PI], step: 0.05 },
  paintAspect: { label: 'Stroke Length', hint: 'How long the painterly strokes are for their width.', range: [1, 3], roll: [1, 2.4], step: 0.1 },
  washR: { label: 'Wash Size', hint: 'How big the watercolor’s flat washes are, in pixels.', values: [2, 3, 4] },
  washEdge: { label: 'Wash Edges', hint: 'How dark the pigment pools along the watercolor’s edges.', range: [0, 1], roll: [0, 0.7], step: 0.05 },
  styleMix: { label: 'Repaint Strength', hint: 'How much of the painterly or watercolor repaint shows over the picture.', range: [0.3, 1], roll: [0.7, 1], step: 0.05 },
  // (True shows the strokes: update() draws style 1 when it is. Rolled only, never pinned.)
  styleFlip: { label: 'Painterly Over Watercolor', hint: 'When Painterly and Watercolor are both on, only one can show: on picks the brush strokes, off the watercolor wash.', bool: true, chance: 0.5 },
  flicker: { label: 'Flicker Kind', hint: 'How the light flickers: a dip on each beat, a rolling band, film jitter or a candle’s waver.', values: [0, 1, 2, 3], names: ['Beat Dip', 'Rolling Band', 'Film Jitter', 'Candle Waver'] },
  warpMix: { label: 'Warp Blend', hint: 'With Blend Modes: how much of a warp (the kaleidoscope, a ripple) lies over the plain picture.', range: [0.2, 1], roll: [0.5, 0.9], step: 0.05 },
  grain: { label: 'Grain', hint: 'How much the noise speckles the picture, from a faint film texture to heavy static.', range: [0.02, 0.4], roll: [0.1, 0.22], step: 0.01 },
  grainKick: { label: 'Grain On the Kick', hint: 'How much heavier the grain swells on each kick (0: steady).', range: [0, 0.4], roll: [0.1, 0.25], chance: 0.5, step: 0.01 },
  cinema: { label: 'Bar Height', hint: 'How tall each cinema bar is, as a share of the screen’s height: 0.1 covers a tenth at the top and a tenth at the bottom.', range: [0.04, 0.2], roll: [0.07, 0.14], step: 0.01 },
  spot: { label: 'Spotlight Size', hint: 'How wide the spotlight’s circle round the fire is.', range: [0.2, 0.8], roll: [0.28, 0.5], step: 0.01 },
  spotBreath: { label: 'Spotlight Breath', hint: 'How much the spotlight opens with the music and the kicks.', range: [0, 0.25], roll: [0.04, 0.14], step: 0.01 },
  chroma: { label: 'Split Width', hint: 'How far apart the color channels drift, in pixels.', values: [1, 2, 3], roll: [1, 2] },
  chromaKick: { label: 'Split On the Kick', hint: 'How much wider the color split is kicked on each beat.', range: [0, 6], roll: [0, 4], step: 0.1 },
  // The looks' own (LOOK_PARAMS).
  zoomIn: { label: 'Falls Inward', hint: 'The echo falls into the fire instead of streaming out of it.', bool: true, chance: 0.35 },
  turn: { label: 'Spiral Turn', hint: 'How fast the vortex turns its echoes, and which way (negative: the other way).', range: [-1.5, 1.5], roll: [0.5, 1.5], signed: true, step: 0.05 },
  crunch: { label: 'Crunch Size', hint: 'How big the mosaic’s pixels get on the kicks.', values: [2, 3, 4] },
  segments: { label: 'Segments', hint: 'How many mirrored segments the kaleidoscope has.', values: [4, 6, 8, 10], roll: [4, 6, 8] },
  // The layers' kinds.
  scan: { label: 'Scanline Kind', hint: 'Which way the scanlines run: thin rows every other pixel, thick rows two pixels deep, or columns.', values: [0, 1, 2], names: ['Thin Rows', 'Thick Rows', 'Columns'] },
  mirror: {
    label: 'Mirror Kind', hint: 'Which half or quarter of the picture is mirrored over the rest.', values: [1, 2, 3, 4, 5, 6, 7, 8],
    names: ['Left To Right', 'Right To Left', 'Top Down', 'Top Left Quarter', 'Top Right Quarter', 'Bottom Up', 'Bottom Left Quarter', 'Bottom Right Quarter'],
  },
};
/** The details each look has of its own (a scene's `look.params`). */
export const LOOK_PARAMS = { echo: ['zoomIn'], kaleido: ['segments'], vortex: ['turn'], mosaic: ['crunch'] };
/** The details each layer has (a scene's `details`). */
export const LAYER_DETAILS = {
  scanlines: ['scan'], mirror: ['mirror'], ghost: ['ghostKeep', 'ghostMix'], blur: ['blur'],
  glow: ['glowSize', 'glowCut', 'glowAmt'], gradient: ['grad', 'gradAmt'], paint: ['paintR', 'paintAngle', 'paintAspect', 'styleMix'],
  wash: ['washR', 'washEdge', 'styleMix'], flicker: ['flicker'], grain: ['grain', 'grainKick'], cinema: ['cinema'],
  spotlight: ['spot', 'spotBreath'], chroma: ['chroma', 'chromaKick'], blend: ['warpMix'],
};
// A turn's layer details, in the order the dice roll them.
const ROLLED = [
  'ghostKeep', 'ghostMix', 'blur', 'glowSize', 'glowCut', 'glowAmt', 'grad', 'gradAmt', 'paintR', 'paintAngle', 'paintAspect',
  'washR', 'washEdge', 'styleMix', 'styleFlip', 'flicker', 'warpMix', 'grain', 'grainKick', 'cinema', 'spot', 'spotBreath', 'chroma', 'chromaKick',
];
const BLEND_NAME = Object.fromEntries(Object.entries(BLEND).map(([k, v]) => [v, k]));

/** The dice for one detail (PARAMS). */
function rollParam(spec) {
  if (spec.bool) return Math.random() < spec.chance;
  if (spec.values) {
    const list = spec.roll ?? spec.values;
    return list[Math.floor(Math.random() * list.length)];
  }
  if (spec.chance !== undefined && !(Math.random() < spec.chance)) return 0;
  const sign = spec.signed ? (Math.random() < 0.5 ? -1 : 1) : 1;
  const [lo, hi] = spec.roll;
  return sign * (lo + Math.random() * (hi - lo));
}
/** A gradient map: mostly the picked one; sometimes random slots, sometimes turned upside down. */
function rollGrad(picked) {
  return Math.random() < 0.25 ? [0, 0, 0].map(() => Math.floor(Math.random() * PARAMS.grad.of)) : Math.random() < 0.2 ? [...picked].reverse() : picked;
}
/** A pinned value made safe for `key` (PARAMS), or undefined when it can't be. */
export function cleanParam(key, v) {
  const spec = Object.hasOwn(PARAMS, key) ? PARAMS[key] : null;
  if (!spec) return undefined;
  if (spec.bool) return typeof v === 'boolean' ? v : undefined;
  if (spec.slots) {
    return Array.isArray(v) && v.length === spec.slots && v.every((n) => Number.isInteger(n) && n >= 0 && n < spec.of) ? [...v] : undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (spec.values) return spec.values.includes(v) ? v : undefined;
  return clamp(v, spec.range[0], spec.range[1]);
}
const cleanAll = (o, keys) => {
  const out = {};
  for (const k of keys) {
    const v = cleanParam(k, o?.[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
};
const LOOK_KEYS = [...new Set(Object.values(LOOK_PARAMS).flat())];
const DETAIL_KEYS = [...new Set(Object.values(LAYER_DETAILS).flat())];

/**
 * A look pinned by a scene: the look, how strong it is at rest (0..2), its own details,
 * each layer's switch (missing: off), the layers' pinned details and blends (missing:
 * rolled each turn), and the scene's drop hits (the director's business).
 * @typedef {{ look: string, amount?: number, params?: Record<string, any>, layers?: Record<string, 'off'|'mix'|'on'>,
 *   details?: Record<string, any>, blends?: Record<string, string>, dropFx?: Record<string, string> }} LooksPin
 */

/**
 * The looks, writing the pixel pass's effects into `g` (scene.glitch). `reducedMotion`: they
 * answer no beat, hat or hit, and the spotlight doesn't breathe (see the header).
 * @param {Record<string, any>} g
 * @param {{ reducedMotion?: boolean }} [o]
 */
export function createLooks(g, { reducedMotion = false } = {}) {
  let look = 'ember';
  let modes = {};       // the settings, as of the last update
  let slice = 0;
  let block = 0;
  let hitEnv = 0;       // the last big hit, decaying
  let kick = 0;
  let dip = 0;          // the flicker's beat dip
  let inkFor = 0;
  let invertFor = 0;
  let lastFlash = -Infinity;
  let cycleFor = 0;
  let cycleStep = 0;
  let spinFor = 0;      // the palette spinning (echo's burst, the color cycle drop)
  let ripples = [];     // { t, s }
  let kaleSeg = 6;
  let kaleRot = 0;
  let kaleSpin = 0;
  let letterbox = 0;
  let iris = 2;
  let cinema = 0;       // the cinema bars' height, sliding in and out
  let spot = 2;         // the spotlight's radius (2: open)
  let clock = 0;
  let turn = 0;         // counts the rolls (each look's turn)
  // Rolled each time a look comes round: its details, which switches in the mix are on,
  // and how the layers look and blend.
  const roll = { zoomIn: false, turn: 1, mirror: [0, 0], scan: 0, crunch: 1, on: {}, p: {}, blends: { ...CLASSIC } };
  // Drop hits: seconds left of each (and their envelopes).
  const FX_TIME = { shatter: 0.5, burst: 0.9, spiral: 1.2, kaleido: 1.6, flips: 2, split: 0.6, crunch: 0.5, iris: 0.45, slam: 0.6, ink: 0.2 };
  const fx = Object.fromEntries(Object.keys(FX_TIME).map((k) => [k, 0]));
  let flip = [0, 0]; // the mirror flips' current rolls
  let lastDrop = '';
  /** @type {null | { look: string, amount: number, params: Record<string, any>, layers: Record<string, string>, details: Record<string, any>, blends: Record<string, number>, blendNames: Record<string, string>, dropFx: any }} */
  let pinned = null;    // a scene's look (pin())
  let pinHold = true;   // ...held until unpinned (false: for this turn only)
  let P = roll.p;       // the details on screen: the turn's, with a pin's laid over them
  let blendsNow = roll.blends;

  function reseed() { g.sliceSeed = Math.random() * 100; }
  /** The details and blends on screen: the rolled ones, with the pinned ones over them. */
  function merge() {
    P = pinned ? { ...roll.p, ...pinned.details } : roll.p;
    blendsNow = pinned ? { ...roll.blends, ...pinned.blends } : roll.blends;
  }

  function reroll() {
    turn++;
    roll.zoomIn = rollParam(PARAMS.zoomIn);
    roll.turn = rollParam(PARAMS.turn);
    roll.mirror = [Math.random(), Math.random()];
    roll.scan = rollParam(PARAMS.scan);
    roll.crunch = rollParam(PARAMS.crunch);
    for (const [k, c] of Object.entries(CHANCE)) roll.on[k] = Math.random() < c;
    // Keep the mix from piling up: two heavy layers at most, one restyle.
    const heavy = shuffle(HEAVY.filter((k) => roll.on[k]));
    heavy.forEach((k, i) => { roll.on[k] = i < MAX_HEAVY; });
    if (roll.on.paint && roll.on.wash) roll.on[Math.random() < 0.5 ? 'paint' : 'wash'] = false;
    const grad = pick(GRADIENTS);
    const p = {};
    for (const k of ROLLED) p[k] = k === 'grad' ? rollGrad(grad) : rollParam(PARAMS[k]);
    roll.p = p;
    for (const [k, list] of Object.entries(LAYER_BLENDS)) roll.blends[k] = BLEND[pick(list)];
    merge();
  }
  reroll();

  function set(name) {
    if (pinned && pinHold) return;
    if (!Object.hasOwn(LOOKS, name) || (name === look && !pinned)) return;
    pinned = null;
    look = name;
    if (name === 'kaleido') kaleSeg = rollParam(PARAMS.segments);
    reroll();
  }
  /** A switch's mode says it's on right now (always, or in the mix and rolled on for this look). */
  function active(key, mode) {
    const m = modeOf(mode);
    return m === 'on' || (m === 'mix' && !!roll.on[key]);
  }
  /** A look is playing: its turn, or switched to always (a pinned look plays alone). */
  const has = (k) => k === look || (!pinned && modeOf(modes.looks?.[k], 'mix') === 'on');
  const mixLooks = (enabled) => Object.keys(LOOKS).filter((k) => modeOf(enabled?.[k], 'mix') === 'mix');
  /** A layer's switch: the pinned scene's (missing: off), or the settings'. */
  const layerMode = (k, m = modes) => (pinned ? pinned.layers[k] ?? 'off' : m[k]);
  const lookParam = (k) => pinned?.params[k] ?? roll[k];
  const segmentsNow = () => (pinned?.params.segments !== undefined && !(fx.kaleido > 0) ? pinned.params.segments : kaleSeg);
  const mirrorNow = (kinds) => P.mirror ?? mirrorMode(kinds, ...roll.mirror);
  const scanNow = () => P.scan ?? roll.scan;

  return {
    get look() { return look; },
    /** Counts the looks' turns: a new one each time the mix is rolled again. */
    get turn() { return turn; },
    /** The looks playing: the one taking its turn, then those always on (a pinned look alone). */
    get playing() {
      if (pinned) return [look];
      const always = Object.keys(LOOKS).filter((k) => k !== look && k !== 'ember' && modeOf(modes.looks?.[k], 'mix') === 'on');
      return look === 'ember' && always.length ? always : [look, ...always];
    },
    set,
    active,
    /**
     * Pin a scene's look (null: back to the show's). Held (`hold`), it stays until unpinned:
     * set() and sync() leave it be and each next() is a new turn of it (the details it
     * doesn't pin and its layers in the mix rolled again). Not held, it lasts this turn:
     * the next next() hands back to the show. `fresh`: a new turn now (a scene coming
     * round); false keeps the current rolls (the same scene edited: a slider moved).
     * @param {LooksPin | null} p
     * @param {{ hold?: boolean, fresh?: boolean }} [o]
     */
    pin(p, { hold = true, fresh = true } = {}) {
      if (!p) {
        pinned = null;
        merge();
        return;
      }
      const blendNames = {};
      for (const [k, v] of Object.entries(p.blends ?? {})) if (Object.hasOwn(LAYER_BLENDS, k) && Object.hasOwn(BLEND, v)) blendNames[k] = v;
      const layers = {};
      for (const k of Object.keys(LAYERS)) {
        const m = p.layers?.[k];
        if (m !== undefined) layers[k] = modeOf(m);
      }
      const amount = Number.isFinite(p.amount) ? clamp(p.amount, 0, 2) : 1;
      pinned = {
        look: Object.hasOwn(LOOKS, p.look) ? p.look : 'ember',
        amount,
        params: cleanAll(p.params, LOOK_KEYS),
        layers,
        details: cleanAll(p.details, DETAIL_KEYS),
        blends: Object.fromEntries(Object.entries(blendNames).map(([k, v]) => [k, BLEND[v]])),
        blendNames,
        dropFx: p.dropFx ?? null,
      };
      pinHold = hold;
      look = pinned.look;
      if (fresh) {
        if (look === 'kaleido') kaleSeg = rollParam(PARAMS.segments);
        reroll();
      } else merge();
    },
    /** The pinned look (cleaned: only what may be pinned), or null. */
    get pinned() {
      if (!pinned) return null;
      const { look: l, amount, params, layers, details, blendNames, dropFx } = pinned;
      return { look: l, amount, params: { ...params }, layers: { ...layers }, details: structuredClone(details), blends: { ...blendNames }, dropFx };
    },
    /** Whether a pin holds past this turn. */
    get held() { return !!pinned && pinHold; },
    /**
     * What's on screen now, in a pin's terms ("Pin What You See"): the look and its
     * details, which layers are showing this turn, their details and how they blend.
     */
    get details() {
      const on = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, active(k, layerMode(k))]));
      const blends = on.blend ? blendsNow : CLASSIC;
      return {
        look,
        segments: segmentsNow(),
        zoomIn: lookParam('zoomIn'),
        turn: lookParam('turn'),
        crunch: lookParam('crunch'),
        scan: scanNow(),
        mirror: mirrorNow(modes.mirrors),
        on,
        p: structuredClone(Object.fromEntries(ROLLED.filter((k) => DETAIL_KEYS.includes(k)).map((k) => [k, P[k]]))),
        blends: Object.fromEntries(Object.entries(blends).map(([k, v]) => [k, BLEND_NAME[v]])),
      };
    },
    /** Another look from those in the mix (with none, the clean fire); the mix re-rolls either way. */
    next(enabled) {
      if (pinned && pinHold) { reroll(); return; }
      if (pinned) {
        // A turn-only pin ends here: the show carries on from it.
        pinned = null;
        merge();
      }
      const pool = mixLooks(enabled).filter((k) => k !== look);
      if (pool.length) set(pick(pool));
      else {
        if (!mixLooks(enabled).includes(look)) look = 'ember';
        reroll();
      }
    },
    /** Keep the look's turn to one still in the mix (the settings may have changed; a pin keeps its own). */
    sync(enabled) {
      if (pinned) return;
      const pool = mixLooks(enabled);
      if (pool.includes(look) || (!pool.length && look === 'ember')) return;
      this.next(enabled);
    },
    beat(s, accent, period = 0.5) {
      if (reducedMotion) return;
      kick = Math.max(kick, s);
      dip = Math.max(dip, s);
      if (fx.flips > 0) flip = [Math.random(), Math.random()];
      if (s < 0.05) return;
      if (has('ripple') && s > 0.2) ripples.push({ t: 0, s: accent ? 1 : 0.6 * s });
      if (has('echo') && accent && s > 0.3) { cycleFor = period * 0.5; cycleStep = 1 + Math.floor(Math.random() * 3); }
      if (has('ink') && accent) inkFor = 0.09;
      if ((has('kaleido') || has('vortex')) && accent) kaleSpin = Math.max(kaleSpin, 0.6 * s);
    },
    hat(s) {
      if (reducedMotion) return;
      if (has('glitch') && s > 0.6 && Math.random() < 0.15) { slice = Math.max(slice, 0.2); reseed(); }
    },
    /** A big hit in the playing looks' style (drops, combos landing, rings, G). */
    bang(amount = 1, { flash = false } = {}) {
      if (reducedMotion) return;
      hitEnv = Math.max(hitEnv, amount);
      if (has('glitch')) { slice = Math.max(slice, amount); block = Math.max(block, amount); reseed(); }
      if (has('echo')) spinFor = 0.5 * amount;
      if (has('ripple')) for (let k = 0; k < 3; k++) ripples.push({ t: -k * 0.12, s: amount });
      if (has('kaleido')) { kaleSeg = pick([4, 6, 8, 10].filter((n) => n !== kaleSeg)); kaleSpin = Math.max(kaleSpin, 2 * amount); }
      if (has('vortex')) kaleSpin = Math.max(kaleSpin, 2.5 * amount);
      if (has('ink')) inkFor = 0.22 * amount;
      if (flash && amount >= 0.9 && clock - lastFlash > 2) { lastFlash = clock; invertFor = 0.07; }
    },
    /**
     * A drop: the hits set to always, and up to `max` in all with one or more drawn from
     * those in the mix (`enabled`: { name: mode }), never the same draw as the last drop.
     * Returns their names (none under reduced motion).
     */
    drop(enabled, max = 2) {
      if (reducedMotion) return [];
      const always = Object.keys(DROP_FX).filter((k) => modeOf(enabled?.[k], 'mix') === 'on');
      const pool = Object.keys(DROP_FX).filter((k) => modeOf(enabled?.[k], 'mix') === 'mix');
      let drawn = [];
      const room = Math.min(pool.length, Math.max(always.length ? 0 : 1, max - always.length));
      for (let tries = 0; room && tries < 6; tries++) {
        const n = 1 + Math.floor(Math.random() * room);
        drawn = shuffle([...pool]).slice(0, n);
        if (drawn.slice().sort().join() !== lastDrop || pool.length === 1) break;
      }
      if (drawn.length) lastDrop = drawn.slice().sort().join();
      const chosen = [...always, ...drawn];
      for (const name of chosen) {
        if (name === 'shock') for (let k = 0; k < 4; k++) ripples.push({ t: -k * 0.1, s: 1 });
        else if (name === 'cycle') spinFor = 0.6;
        else if (name === 'xray') { /* the render show flips the view (render.js xrayHit) */ }
        else {
          fx[name] = FX_TIME[name];
          if (name === 'shatter') { slice = 1; block = 1; reseed(); }
          if (name === 'kaleido') kaleSeg = pick([6, 8, 10]);
          if (name === 'flips') flip = [Math.random(), Math.random()];
        }
      }
      return chosen.map((k) => DROP_FX[k]);
    },
    /**
     * The looks' effects, the drop hits, the layers, and every look's framing. `modes`: the
     * settings (looks, the layers' switches, mirror kinds). `rest`: how strong a pinned
     * look is when the music gives it nothing (its painted strength times this; 0: silent
     * means clean, as without a pin). `cycles`: the palette may cycle (the user's Color
     * Cycle isn't Off); false keeps it still whatever plays: the Echo look's downbeat steps
     * and its spins on big hits, a Color Cycle hit (a scene's look too: Low Flash and Chill
     * promise no palette swaps).
     * @param {number} dt
     * @param {{ amt: number, build: number, low: boolean, energy: number, modes?: Record<string, any>, rest?: number, cycles?: boolean }} o
     */
    update(dt, { amt: amtIn, build, low, energy, modes: m = {}, rest = 0, cycles = true }) {
      modes = m;
      const amt = pinned ? Math.max(amtIn, pinned.amount * rest) : amtIn;
      clock += dt;
      kick *= Math.exp(-dt / 0.14);
      dip *= Math.exp(-dt / 0.09);
      hitEnv *= Math.exp(-dt / 0.5);
      slice *= Math.exp(-dt / 0.22);
      block *= Math.exp(-dt / 0.3);
      kaleSpin *= Math.exp(-dt / 0.4);
      // (A flash set since the last frame shows for at least this one, however long the frame
      // took: a hitch mustn't eat a drop's negative.)
      const inking = inkFor > 0;
      const inverting = invertFor > 0;
      inkFor -= dt;
      invertFor -= dt;
      cycleFor -= dt;
      spinFor -= dt;
      for (const k of Object.keys(fx)) fx[k] = Math.max(0, fx[k] - dt);
      const env = (k) => fx[k] / FX_TIME[k]; // 1 → 0 through a drop hit
      const on = amt > 0 ? 1 : 0;
      const a = Math.min(1, amt);
      const layer = (k) => on && active(k, layerMode(k, m));

      // Glitch (and a shatter): tears and crunch.
      if (!reducedMotion && has('glitch') && amt > 0 && build > 0.3 && Math.random() < dt * 6 * build) { slice = Math.max(slice, 0.25 + 0.5 * build); reseed(); }
      const gl = has('glitch') || fx.shatter > 0 ? amt : 0;
      g.slice = gl * Math.min(1, slice);
      g.split = Math.round(Math.max(
        (has('glitch') ? amt * (1.6 * kick + 3 * hitEnv + 1.5 * build) : 0)
        + (has('prism') ? amt * (1 + 5 * kick + 6 * hitEnv) : 0)
        + amt * 10 * env('split') ** 1.5,
        layer('chroma') ? Math.max(1, a * (P.chroma + P.chromaKick * kick)) : 0,
      ));
      g.block = 1 + Math.round(
        gl * 3 * block
        + (has('mosaic') ? amt * (lookParam('crunch') * 1.6 * kick + 4 * hitEnv) : 0)
        + amt * 7 * env('crunch') ** 2,
      );
      g.wave = gl * (1.2 * build + 3 * hitEnv) + (has('haze') ? amt * (0.8 + 1.8 * energy + 2.5 * kick) : 0);
      g.noise = Math.max(gl * (0.08 * build + 0.12 * hitEnv), layer('grain') ? a * (P.grain + P.grainKick * kick) : 0);

      // Echoes: the echo look, a light one under the kaleidoscope, the vortex, and the drop bursts.
      let echo = Math.max(
        has('echo') ? 0.62 + 0.2 * energy + 0.2 * Math.max(0, spinFor) : 0,
        has('kaleido') ? 0.4 : 0,
        has('vortex') ? 0.7 + 0.15 * energy : 0,
      );
      echo = Math.max(echo, 0.85 * env('burst'), 0.8 * env('spiral'));
      g.feedback = Math.min(0.9, amt * echo);
      const zoomBy = has('echo') ? 0.012 + 0.03 * kick + 0.05 * hitEnv : has('vortex') ? 0.01 + 0.02 * kick : 0.006;
      g.zoom = 1 + (has('echo') && lookParam('zoomIn') ? -0.6 : 1) * zoomBy + 0.06 * env('burst');
      g.feedRot = (has('vortex') ? lookParam('turn') * (0.02 + 0.05 * kaleSpin) : 0) + lookParam('turn') * 0.07 * env('spiral');
      g.cycle = !cycles ? 0 : spinFor > 0 ? Math.floor(clock * 16) % 4 : cycleFor > 0 ? cycleStep : 0;

      // Ripple: rings out of the fire (radius as a fraction of the screen height).
      ripples = ripples.filter((r) => (r.t += dt) < 0.7);
      const front = ripples.filter((r) => r.t >= 0).at(-1);
      g.rippleR = front ? front.t * 1.6 : 0;
      g.rippleAmp = front && amt > 0 ? amt * 7 * front.s * (1 - front.t / 0.7) : 0;

      // Kaleidoscope.
      kaleRot += dt * (0.12 + 1.5 * kaleSpin);
      g.kaleido = (has('kaleido') || fx.kaleido > 0) && amt > 0 ? segmentsNow() : 0;
      g.kaleidoRot = kaleRot;

      // Ink, the negative.
      g.ink = (has('ink') && (inkFor > 0 || inking)) || fx.ink > 0 ? Math.min(1, amt) : 0;
      g.invert = invertFor > 0 || inverting ? 1 : 0;

      // The mirror and scanlines: off, in the mix (this look rolled one), or always.
      g.mirror = fx.flips > 0 && on ? mirrorMode(m.mirrors, ...flip) : layer('mirror') ? mirrorNow(m.mirrors) : 0;
      const scanned = layer('scanlines') || has('ink');
      g.scan = scanned ? 0.22 : 0;
      g.scanMode = has('ink') ? 0 : scanNow();

      // The layers, each rolled in (or always on), scaled by the effects' strength.
      g.ghost = layer('ghost') ? Math.min(0.85, a * P.ghostMix * (0.8 + 0.4 * energy)) : 0;
      g.ghostKeep = P.ghostKeep;
      g.blur = layer('blur') ? a * P.blur : 0;
      g.glow = layer('glow') ? a * P.glowAmt * (0.7 + 0.5 * kick + 0.3 * hitEnv) : 0;
      g.glowSize = P.glowSize;
      g.glowCut = P.glowCut;
      g.grad = layer('gradient') ? Math.min(1, a * P.gradAmt * (1 + 0.3 * kick)) : 0;
      [g.gradA, g.gradB, g.gradC] = P.grad;
      const paint = layer('paint');
      const wash = layer('wash');
      g.style = paint && wash ? (P.styleFlip ? 1 : 2) : paint ? 1 : wash ? 2 : 0;
      g.styleR = g.style === 1 ? P.paintR : P.washR;
      g.styleMix = a * P.styleMix;
      g.paintAngle = P.paintAngle;
      g.paintAspect = P.paintAspect;
      g.washEdge = P.washEdge;
      g.flickerMode = P.flicker;
      g.flicker = layer('flicker') ? a * FLICKER_AMP[P.flicker] * (P.flicker === 0 ? dip : 1) : 0;
      // How the layers blend: their classic ways, or ones rolled for this look.
      const b = layer('blend') ? blendsNow : CLASSIC;
      g.feedMode = b.feed;
      g.ghostMode = b.ghost;
      g.warpMode = b.warp;
      g.warpMix = b === CLASSIC ? 1 : P.warpMix;
      g.inkMode = b.ink;
      g.invertMode = b.invert;
      g.scanBlend = b.scan;
      g.glowMode = b.glow;
      g.gradMode = b.gradient;

      // Framing in breakdowns: bars in, the iris closing with the build; snapping open.
      // A drop's iris snap opens from a pinhole; its letterbox slam shuts and springs back.
      // The cinema bars and the spotlight (layers) slide in for a look's turn and out after
      // it; whichever frames tightest wins.
      letterbox = approach(letterbox, low ? 0.09 : 0, low ? 0.8 : 0.15, dt);
      iris = low ? approach(Math.min(iris, 1.3), 0.95 - 0.5 * build, 0.6, dt) : approach(iris, 2, 0.12, dt);
      cinema = approach(cinema, layer('cinema') ? P.cinema : 0, 0.35, dt);
      const spotAt = P.spot + (reducedMotion ? 0 : P.spotBreath * (0.5 * energy + kick)) + 0.1 * (1 - a);
      spot = layer('spotlight') ? approach(Math.min(spot, 1.3), spotAt, 0.12, dt) : approach(spot, 2, 0.25, dt);
      const x = 1 - env('slam');
      const lb = Math.max(letterbox, cinema, fx.slam > 0 ? on * 0.24 * (x < 0.15 ? x / 0.15 : (1 - x) / 0.85) : 0);
      g.letterbox = lb < 0.004 ? 0 : lb;
      const snap = fx.iris > 0 && on ? 0.04 + 2 * (1 - env('iris')) ** 2 : 2;
      const ir = Math.min(iris, snap, spot);
      g.iris = ir > 1.95 ? 2 : ir;
    },
  };
}
