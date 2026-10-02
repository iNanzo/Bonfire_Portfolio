// Bonfire Live's Render tab (settings.js): the pixel pass's own options (pixel size, the
// dither and its pattern, outlines, the palette, vignette, exposure) and the scene's (fog,
// the fire's shadow, the flame's frame rate, how long a color change takes, how hits land),
// applied through the scene's absolute setters (setRender, setPalette, setFog, setShadows,
// setXray), which leave the site's own settings alone. applyRenderSettings does it all,
// sending the scene only what changed; the render show calls it every frame.
//
// Several of them are effects too, each with the usual switch (off, in the mix, always).
// In the mix they're rolled again with each look (looks.js active(), CHANCE), and each
// time with new details:
//   outlines      come and go;
//   few colors    the palette drops to a few colors: Ashen, Moonlit, or a few of the
//                 flame's own (which follow it as it changes);
//   pixel shifts  the pixel size jumps to a rolled size with the look, and again on a drop;
//   x-ray         now and then on a bar the show flips to one of the passes the picture is
//                 built from (the normals, the lighting, the particles alone, the flow
//                 field) for a beat, two or the bar, never on a drop's own bar (unless the
//                 drop throws its X-Ray hit: then it lands in it, for a beat);
//   hit-stop, the hit flash, debris, ground marks   how hits land;
// and the dither pattern and the fog can take "a mix" (a pick with each look).
// A preset scene (its settings laid over the user's, layered.js) may also set the palette
// to a few slots of the scene palette and hold one x-ray view (`xrayView`).
import { modeOf } from './looks.js';
import { pick } from '../math.js';

/** The palettes the picture can be drawn in (the scene's setPalette). */
export const PALETTES = { flame: 'The Flame’s Colors', ashen: 'Ashen (3 Colors)', moonlit: 'Moonlit (4 Colors)' };
/**
 * Few-color palettes the Few Colors switch rolls: the two fixed ones, or a few of the
 * flame's own, as slots of the scene palette (0 void, 1 shadow, 2 stone, 3 wood, 4 bone,
 * 5–8 the flame's ramp lo → core, 9 its shade; the first is the darkest, for the outlines).
 */
export const FEW_PALETTES = [
  'ashen',
  'moonlit',
  [0, 6, 8],
  [0, 5, 7],
  [0, 9, 7],
  [0, 1, 6, 8],
  [0, 2, 7, 8],
  [0, 5, 6, 8],
  [0, 7],
];
/** The fog's kinds (Light is the site's: the settings' hints say so). */
export const FOGS = { off: 'Off', light: 'Light', thick: 'Thick' };
/** The pixel sizes a menu offers: one list for every app (import it rather than keeping another). */
export const PIXEL_SIZES = [2, 3, 4, 6, 8];
export const FLAME_FPS = [8, 12, 24, 60];
/** The x-ray's views (the scene's setXray). */
export const XRAY_VIEWS = { normals: 'Normals', lighting: 'Lighting', particles: 'Particles', flow: 'Flow Field' };
// How many beats an x-ray flip lasts (a beat, two, or the bar), and on which beat of the bar it starts.
const FLIP_BEATS = [1, 1, 2, 2, 4];
const FLIP_START = [0, 0, 0, 1, 2];

/**
 * What the scene should be showing: the settings, with the render show's rolls (`live`)
 * for the switches in the mix. Without them, each switch rests where it was: outlines and
 * hit effects on, the palette, pixel size, pattern and fog as set, no x-ray.
 */
export function renderState(s, live = null) {
  const lit = (key) => live?.[key] ?? modeOf(s[key]) !== 'off';
  const slots =
    Array.isArray(s.palette) &&
    s.palette.length >= 2 &&
    s.palette.every((i) => Number.isInteger(i) && i >= 0 && i <= 9);
  return {
    pixelSize: live?.pixelSize ?? s.pixelSize,
    dither: s.dither,
    ditherMatrix: s.ditherMatrix === 'mix' ? (live?.matrix ?? 4) : String(s.ditherMatrix) === '8' ? 8 : 4,
    outlines: lit('outlines'),
    vignette: s.vignette,
    exposure: s.exposure,
    colorChange: s.colorChange,
    flameFps: s.flameFps,
    hitStop: lit('hitStop'),
    hitFlash: lit('hitFlash'),
    debris: lit('debris'),
    marks: lit('marks'),
    palette: live?.few ?? (slots ? [...s.palette] : PALETTES[s.palette] ? s.palette : 'flame'),
    fog: s.fog === 'mix' ? (live?.fog ?? 'light') : FOGS[s.fog] ? s.fog : 'light',
    shadows: s.shadows !== false,
    xray: live?.xray ?? (XRAY_VIEWS[s.xrayView] ? s.xrayView : null),
  };
}

const SET_RENDER = [
  'pixelSize',
  'dither',
  'ditherMatrix',
  'outlines',
  'vignette',
  'exposure',
  'colorChange',
  'flameFps',
  'hitStop',
  'hitFlash',
  'debris',
  'marks',
];
/**
 * Everything renderState reads: the settings' keys and the render show's rolls (exported for
 * the tests, which hold renderState to it).
 */
export const RENDER_READS = {
  settings: [
    'pixelSize',
    'dither',
    'ditherMatrix',
    'outlines',
    'vignette',
    'exposure',
    'colorChange',
    'flameFps',
    'hitStop',
    'hitFlash',
    'debris',
    'marks',
    'palette',
    'fog',
    'shadows',
    'xrayView',
  ],
  live: ['outlines', 'hitStop', 'hitFlash', 'debris', 'marks', 'pixelSize', 'matrix', 'few', 'fog', 'xray'],
};
// (A value as it was read: a list of palette slots is copied, so one changed in place shows.)
const same = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
function unchanged(seen, settings, live) {
  if (seen.live !== !!live) return false;
  for (const k of RENDER_READS.settings) if (!same(seen.settings[k], settings[k])) return false;
  if (live) for (const k of RENDER_READS.live) if (!same(seen.rolls[k], live[k])) return false;
  return true;
}
function remember(seen, settings, live) {
  seen.live = !!live;
  for (const k of RENDER_READS.settings) seen.settings[k] = Array.isArray(settings[k]) ? [...settings[k]] : settings[k];
  if (live) for (const k of RENDER_READS.live) seen.rolls[k] = Array.isArray(live[k]) ? [...live[k]] : live[k];
}
const applied = new WeakMap(); // per scene: { state: the state it was last sent, seen: what that was worked out from }
/**
 * Every Render setting onto the scene (`live`: the render show's current rolls; without,
 * each switch in the mix rests as renderState says). Only what changed since the last call
 * for this scene is sent, so a new scene gets everything. The render show calls it every
 * frame, and most frames nothing it reads has changed: then it's done before working out
 * anything (no state, no strings to compare).
 */
export function applyRenderSettings(fire, settings, live = null) {
  if (!fire) return;
  const last = applied.get(fire);
  if (last && unchanged(last.seen, settings, live)) return;
  const want = renderState(settings, live);
  const was = last?.state ?? {};
  const changed = (k) => String(want[k]) !== String(was[k]);
  const partial = Object.fromEntries(SET_RENDER.filter(changed).map((k) => [k, want[k]]));
  if (Object.keys(partial).length) fire.setRender(partial);
  if (changed('palette')) fire.setPalette(want.palette);
  if (changed('fog')) fire.setFog(want.fog);
  if (changed('shadows')) fire.setShadows(want.shadows);
  if (changed('xray')) fire.setXray(want.xray);
  const seen = last?.seen ?? { live: false, settings: {}, rolls: {} };
  remember(seen, settings, live);
  applied.set(fire, { state: want, seen });
}
/**
 * Forget what the scene was last sent, so the next apply sends everything (after anything
 * that resets the scene behind this module's back, e.g. its applyEffects()).
 */
export function forgetApplied(fire) {
  if (fire) applied.delete(fire);
}

// The steps a render menu (P) walks each setting through, and how it shows them.
const SWITCH = { off: 'Off', mix: 'In the Mix', on: 'Always' };
export const RENDER_STEPS = {
  pixelSize: PIXEL_SIZES,
  palette: Object.keys(PALETTES),
  fewColors: Object.keys(SWITCH),
  dither: [0, 0.08, 0.16, 0.26, 0.4],
  ditherMatrix: ['4', '8', 'mix'],
  outlines: ['on', 'mix', 'off'],
  pixelShift: Object.keys(SWITCH),
  xray: Object.keys(SWITCH),
  fog: ['off', 'light', 'thick', 'mix'],
  flameFps: FLAME_FPS,
};
/**
 * Step a render setting to its next value (`dir` -1: the one before), from wherever it is
 * (a value between the steps goes to the next one up). Returns the new value; the caller
 * saves the settings and applies them.
 * @param {Record<string, any>} settings
 * @param {keyof typeof RENDER_STEPS} key
 */
export function stepRender(settings, key, dir = 1) {
  const steps = RENDER_STEPS[key];
  if (!steps) return undefined;
  const cur = settings[key];
  let i = steps.findIndex((v) => String(v) === String(cur));
  if (i < 0 && typeof cur === 'number') {
    const above = steps.findIndex((v) => Number(v) > cur); // (between two steps: as if just under the next)
    i = (above < 0 ? steps.length : above) - (dir > 0 ? 1 : 0);
  }
  const next = steps[(((i + dir) % steps.length) + steps.length) % steps.length];
  settings[key] = next;
  return next;
}
/**
 * A render setting as a short line of text (for a menu).
 * @param {Record<string, any>} settings
 * @param {string} key
 */
export function renderText(settings, key) {
  const v = settings[key];
  if (key === 'pixelSize') return `${v} px`;
  if (key === 'palette') return Array.isArray(v) ? `A Scene’s ${v.length} Colors` : (PALETTES[v] ?? PALETTES.flame);
  if (key === 'dither') return v ? Number(v).toFixed(2) : 'Off';
  if (key === 'ditherMatrix') return v === 'mix' ? '4×4 / 8×8' : `${v}×${v}`;
  if (key === 'fog') return v === 'mix' ? 'A Mix' : (FOGS[v] ?? FOGS.light);
  if (key === 'flameFps') return `${v} fps`;
  return SWITCH[modeOf(v)] ?? String(v);
}

/** Another pixel size for a shift: one of the sizes from half to twice `base`, not `not`. */
export function shiftSize(base, not = base, rng = Math.random) {
  const near = PIXEL_SIZES.filter((s) => s !== base && s !== not && s >= base / 2 && s <= base * 2);
  const pool = near.length ? near : PIXEL_SIZES.filter((s) => s !== not);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * The render switches through the show. `looks` (looks.js) says which switches in the mix
 * are on for the look playing and counts its turns; each new turn rolls the details here.
 * Call update() every frame, bar() on each bar's downbeat, drop() when a drop lands and
 * xrayHit() when it throws the X-Ray hit. Times are in seconds (performance time).
 */
export function createRenderShow(fire, settings, { looks, reducedMotion = false }) {
  const live = {
    outlines: true,
    few: null,
    pixelSize: null,
    matrix: 4,
    fog: 'light',
    hitStop: true,
    hitFlash: true,
    debris: true,
    marks: true,
    xray: null,
  };
  const rolled = { few: FEW_PALETTES[0], matrix: 4, fog: 'light', xrayRate: 0.4 };
  let turn = -1; // the look's turn the details were rolled for
  let firstTurn = -1; // ...and the opening look's (the start screen and the intro)
  let base = settings.pixelSize;
  let flip = null; // an x-ray flip: { view, start, end, hit (the drop's) }
  let lastView = null;
  const on = (key) => looks.active(key, settings[key]);
  const moving = () => !reducedMotion;

  function reroll(first) {
    rolled.few = pick(FEW_PALETTES.filter((p) => String(p) !== String(rolled.few)));
    rolled.matrix = Math.random() < 0.5 ? 4 : 8;
    rolled.fog = pick(['light', 'light', 'thick', 'thick', 'off']);
    rolled.xrayRate = 0.15 + 0.3 * Math.random(); // (a bar's chance of a flip)
    // A new look brings its own pixel size (or the one set). (The show starts on the one set.)
    live.pixelSize = !first && moving() && on('pixelShift') ? shiftSize(base) : null;
  }
  const views = () => Object.keys(XRAY_VIEWS).filter((k) => settings.xrayViews?.[k]);
  function flipTo(start, beats, period, hit = false) {
    const pool = views().filter((v) => v !== lastView);
    const view = pick(pool.length ? pool : views());
    lastView = view;
    flip = { view, start, end: start + beats * period, hit };
  }

  return {
    /** The current rolls (what renderState reads for the switches in the mix). */
    get live() {
      return live;
    },
    /** Send the scene everything as it stands now. */
    apply() {
      applyRenderSettings(fire, settings, live);
    },
    update(t) {
      if (settings.pixelSize !== base) {
        base = settings.pixelSize;
        live.pixelSize = null;
      }
      if (looks.turn !== turn) {
        const first = turn < 0;
        turn = looks.turn;
        if (first) firstTurn = turn;
        reroll(first);
      }
      live.outlines = on('outlines');
      // (In the mix, the opening look, the start screen and the intro, keeps the flame's colors.)
      live.few = on('fewColors') && (turn > firstTurn || modeOf(settings.fewColors) === 'on') ? rolled.few : null;
      live.matrix = rolled.matrix;
      live.fog = rolled.fog;
      for (const k of ['hitStop', 'hitFlash', 'debris', 'marks']) live[k] = on(k);
      if (!moving() || !on('pixelShift')) live.pixelSize = null;
      if (flip && (t >= flip.end || (!flip.hit && !on('xray')))) flip = null;
      live.xray = moving() && flip && t >= flip.start ? flip.view : null;
      applyRenderSettings(fire, settings, live);
    },
    /**
     * A bar's downbeat at `t`: maybe an x-ray flip, on this beat or a later one of the bar,
     * for a beat, two or the bar. Not on the drop's own bar or one that brings a new look,
     * and less in calm parts (`budget`, the director's).
     */
    bar(t, { period, sinceDrop, budget = 1 }) {
      if (!moving() || !period || flip || sinceDrop < 1 || looks.turn !== turn || !on('xray') || !views().length)
        return;
      if (Math.random() > rolled.xrayRate * (0.4 + 0.6 * budget)) return;
      const beats = pick(FLIP_BEATS);
      flipTo(t + (beats === 4 ? 0 : pick(FLIP_START)) * period, beats, period);
    },
    /** A drop lands: the picture comes back from any x-ray, and a pixel shift jumps. */
    drop() {
      flip = null;
      if (moving() && on('pixelShift')) live.pixelSize = shiftSize(base, live.pixelSize ?? base);
    },
    /** The drop's X-Ray hit: it lands in a view for a beat. */
    xrayHit(t, period) {
      if (moving() && views().length) flipTo(t, 1, period || 0.5, true);
    },
  };
}
