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
// With "recolor the scenery", each palette brings scenery colors of its own (the site's
// come back with the site's palettes), blended in as the flame lands.
import { applyCssPalette, base, flames, mixHex, rotation } from '../palette.js';
import { harmoniousFlame, harmoniousScene, hexToOklch, SCHEMES, wildFlame, wildScene } from '../paletteGen.js';

export const COLOR_MODES = { site: 'The Site’s Palettes', harmonious: 'Harmonious Random', wild: 'Fully Random', mix: 'A Mix of All Three' };
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

export function createColors(settings) {
  const siteBase = { ...base };
  const made = [];
  let count = 0;
  let sceneBlend = null; // { from, to, t, dur }

  function add(colors, scene) {
    const key = `live-${++count}`;
    flames[key] = { name: `${colorName(colors.mid)} Flame`, ramp: [colors.lo, colors.mid, colors.hi, colors.core], shade: colors.shade, light: 0.34, hidden: true, scene };
    made.push(key);
    while (made.length > KEEP) delete flames[made.shift()];
    return key;
  }
  function make(mode) {
    const voidHex = siteBase.void;
    const colors = mode === 'wild' ? wildFlame(Math.random, { voidHex }) : harmoniousFlame(Math.random, { voidHex, scheme: settings.scheme }).colors;
    const scene = (mode === 'wild' ? wildScene : harmoniousScene)(Math.random, { flames: [colors] });
    return add(colors, scene);
  }
  const siteKeys = () => Object.keys(flames).filter((k) => !k.startsWith('live-'));

  return {
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
    /** A flame landed: blend the scenery to its colors (or back to the site's). */
    landed(key, seconds = 1.2) {
      const want = settings.sceneColors && flames[key]?.scene ? flames[key].scene : siteBase;
      if (SCENE_KEYS.every((k) => base[k] === want[k])) return;
      sceneBlend = { from: { ...base }, to: { ...want }, t: 0, dur: seconds };
    },
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
