// Colors for the visualizer's swaps: the site's own palettes, or new ones made on the fly
// with the admin's palette generator (src/paletteGen.js):
//   site        the flames in rotation on the site (content.json)
//   harmonious  a new palette each time, whose colors work together, in any scheme (hue
//               shift, analogous, monochrome, complementary, split, triadic) or the one
//               picked in the settings
//   wild        five random colors (the tips kept readable)
//   mix         any of the three
// Made palettes join palette.js's `flames` under "live-N" keys (hidden from the site's
// rotation), named for their hue, and the oldest are dropped once they can't be burning.
// Recolored scenery (a switch: off, in the mix = some flames, always): as a flame lands,
// the stone, wood, shadow and background blend to colors made for it on the spot, with
// real color (paletteGen's vividScene: around the flame's hue or any hue; fully random
// now and then), a new set every landing, whatever palette the flame came from. Without
// it, the site's own scenery comes back.
// Preset scenes: a scene's flame is registered under its own key (register(), hidden from
// the site's rotation and never pruned like the made ones), and its scenery colors are
// pinned (pinScenery()): held, a landing leaves them alone until the scene lets go.
import { applyCssPalette, base, flames, mixHex, rotation } from '../palette.js';
import { harmoniousFlame, hexToOklch, SCHEMES, vividScene, wildFlame, wildScene } from '../paletteGen.js';
import { modeOf } from './looks.js';

/** Where a new flame's colors come from (the settings' Flame Colors), as the menus name them. */
export const COLOR_MODES = { site: 'The Site’s Palettes', harmonious: 'Harmonious Random', wild: 'Fully Random', mix: 'A Mix, New Each Flame' };
export const COLOR_SCHEMES = { auto: 'Any Scheme', ...Object.fromEntries(SCHEMES.map((s) => [s.id, s.label])) };

// Hue names by OKLCH hue (each entry: up to this angle).
const HUES = [[18, 'Rose'], [42, 'Crimson'], [62, 'Ember'], [82, 'Amber'], [104, 'Gold'], [128, 'Lime'], [158, 'Verdant'], [184, 'Jade'],
  [212, 'Teal'], [244, 'Azure'], [274, 'Cobalt'], [304, 'Violet'], [334, 'Orchid'], [361, 'Rose']];
/** A name for a color: its hue family ("Ashen" when it's nearly gray). */
export function colorName(hex) {
  const { C, h } = hexToOklch(hex);
  return C < 0.035 ? 'Ashen' : HUES.find(([top]) => h < top)[1];
}

const KEEP = 6; // made palettes kept: the one burning, one blending out, one being forged, and spares
const SCENE_KEYS = ['void', 'shadow', 'stone', 'wood', 'bone'];
const RECOLOR_CHANCE = 0.5; // in the mix: how many landings recolor the scenery

/** @typedef {{ lo: string, mid: string, hi: string, core: string, shade: string, light?: number }} FlameColors */
/** @typedef {{ void: string, shadow: string, stone: string, wood: string, bone: string }} SceneryColors */

export function createColors(settings) {
  const siteBase = { ...base };
  const made = [];
  let count = 0;
  let sceneBlend = null; // { from, to, t, dur }
  let scenery = null;    // the colors the scenery is on (or heading to); null: the site's
  let held = false;      // a scene's scenery colors: landings leave them alone
  const registered = new Map(); // key → a scene's flame (never pruned)

  function add(colors) {
    const key = `live-${++count}`;
    flames[key] = { name: `${colorName(colors.mid)} Flame`, ramp: [colors.lo, colors.mid, colors.hi, colors.core], shade: colors.shade, light: 0.34, hidden: true };
    made.push(key);
    while (made.length > KEEP) delete flames[made.shift()];
    return key;
  }
  function make(mode) {
    const voidHex = siteBase.void;
    return add(mode === 'wild' ? wildFlame(Math.random, { voidHex }) : harmoniousFlame(Math.random, { voidHex, scheme: settings.scheme }).colors);
  }
  /** New scenery for a flame: around its hue (or any), sometimes fully random; its tips stay readable. */
  function sceneFor(flame) {
    const readable = [{ hi: flame.ramp[2] }];
    const wild = settings.colors === 'wild' ? 0.5 : 0.15;
    return Math.random() < wild ? wildScene(Math.random, { flames: readable }) : vividScene(Math.random, { flames: readable, hue: hexToOklch(flame.ramp[1]).h });
  }
  const siteKeys = () => Object.keys(flames).filter((k) => !k.startsWith('live-') && !registered.has(k));
  /** Blend the scenery to `want` over `seconds` (nothing to do if it's there already). */
  function blendTo(want, seconds) {
    if (SCENE_KEYS.every((k) => base[k] === want[k])) { sceneBlend = null; return; }
    sceneBlend = { from: { ...base }, to: { ...want }, t: 0, dur: Math.max(0.001, seconds) };
  }

  return {
    /** The scenery colors now showing or blending in (null: the site's own). */
    get scenery() { return scenery; },
    /**
     * The next flame for a swap (other than `current`). `step` ±1 walks the site's
     * palettes in order instead (the arrow keys).
     */
    next(current, step = 0) {
      if (step) {
        const all = siteKeys();
        const at = all.indexOf(current);
        return all[((at < 0 ? 0 : at + step) + all.length) % all.length];
      }
      let mode = settings.colors;
      if (mode === 'mix') mode = Math.random() < 0.4 ? 'site' : Math.random() < 0.7 ? 'harmonious' : 'wild';
      if (mode === 'harmonious' || mode === 'wild') return make(mode);
      const keys = rotation().length ? rotation() : siteKeys();
      const fresh = keys.filter((k) => k !== current);
      const pool = fresh.length ? fresh : keys;
      return pool[Math.floor(Math.random() * pool.length)];
    },
    /** A flame landed: blend the scenery to new colors made for it (or back to the site's). A scene's held colors stay. */
    landed(key, seconds = 1.2) {
      if (held) return;
      const mode = modeOf(settings.sceneColors);
      const recolor = flames[key] && (mode === 'on' || (mode === 'mix' && Math.random() < RECOLOR_CHANCE));
      scenery = recolor ? sceneFor(flames[key]) : null;
      blendTo(scenery ?? siteBase, seconds);
    },
    /**
     * A scene's flame, under `key` (e.g. 'scene-b-frozen-shrine'): hidden from the site's
     * rotation and the arrow keys, and never pruned. Returns the key.
     * @param {string} key
     * @param {FlameColors} flame
     */
    register(key, flame, name = `${colorName(flame.mid)} Flame`) {
      const entry = { name, ramp: [flame.lo, flame.mid, flame.hi, flame.core], shade: flame.shade, light: flame.light ?? 0.34, hidden: true };
      registered.set(key, entry);
      flames[key] = entry;
      return key;
    },
    /** Take a scene's flame away again. */
    unregister(key) {
      if (!registered.delete(key)) return;
      delete flames[key];
    },
    /** The scene flames registered now. */
    get registered() { return [...registered.keys()]; },
    /**
     * Blend the scenery to a scene's colors (null: the site's own) over `seconds`. Held,
     * landings leave them alone until release() (or a pin with `hold: false`, which the
     * next landing takes over from).
     * @param {SceneryColors | null} colors
     */
    pinScenery(colors, { seconds = 1.2, hold = true } = {}) {
      scenery = colors ? Object.fromEntries(SCENE_KEYS.map((k) => [k, colors[k] ?? siteBase[k]])) : null;
      held = hold;
      blendTo(scenery ?? siteBase, seconds);
    },
    /** Whether a scene holds the scenery colors. */
    get held() { return held; },
    /** Let go of a scene's scenery colors: the next landing recolors as the settings say. */
    release() { held = false; },
    /** Per frame: step a scenery blend. True if the scenery colors changed. */
    update(dt) {
      if (!sceneBlend) return false;
      const b = sceneBlend;
      b.t = Math.min(1, b.t + dt / b.dur);
      const k = b.t * b.t * (3 - 2 * b.t);
      for (const key of SCENE_KEYS) base[key] = mixHex(b.from[key], b.to[key], k);
      if (b.t >= 1) { sceneBlend = null; applyCssPalette(); }
      return true;
    },
  };
}
