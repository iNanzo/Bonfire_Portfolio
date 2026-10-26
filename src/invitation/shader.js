// The invitation toy's Shader options (pure: no three.js, no DOM): the retro look's own values,
// which the Look menu shows under Shader, one entry each in SHADER_CONTROLS: its key (as stored
// in the look's `shader`), its Title Case label, its kind (a range, on min..max in steps or on a
// list of steps; a choice; a switch), how its value reads (text: shown, and as a screen reader
// says it), whether it's part of the pixel look (pixelOnly: it rests at Pixel Size Off, where
// the retro pass doesn't run), the Look menu switch it hangs on (needs: Dithering or Outlines),
// and where it lives in a look preset (get reads a style's value; set writes one into a copy of
// a preset). ui.js renders every control from this table and look.js keeps them, so adding a
// control later is one entry here (and its field in looks/*.js).
//
// A Style (looks/*.js) sets every one; look.js keeps only the user's changes (validLook: each
// snapped onto its control, snapShader, or dropped on its own; one equal to the style's own
// value is no change) and lookPreset writes them into a copy of the style, which the renderer
// reads as it reads any preset (retro.js the colours, lines, shadow edge and grade; stage.js
// the light and the shadow's strength; character.js the toon ramp and Pixel Face, his face
// redrawn in pixels to fit his size, `texture.pixelFace`). (Pixel Shirt, a bold pixel plaid on
// his shirt at the coarser resolutions, is gone: look.js RETIRED_SHADER.)
//
//   toonRamp(toon)    the toon gradient, TOON_CELLS cells over the light's angle (dark side to
//                     facing it): Smooth (0 bands), or 2 to 4 flat bands from `shade` to `lit`
//                     around the terminator, and a white highlight where the light falls
//                     straight (2 bands and a highlight is DS's and Soft's old 8-cell gradient
//                     exactly); a preset's own array of bands as it is
//   warmthTint(w)     the grade's tint toward warm (w > 0) or cool (w < 0), as RGB multipliers

/**
 * @typedef {object} ToonSpec  a look preset's toon shading
 * @property {number} bands  0 (Smooth) or 2 to 4 flat bands
 * @property {boolean} highlight  white where the light falls straight on him
 * @property {number} shade  the darkest band, 0..1 (his side away from the light)
 * @property {number} lit  the lightest band, 0..1
 */
/** @typedef {number|string|boolean} ShaderValue */
/** @typedef {Record<string, ShaderValue>} ShaderValues  a control's key → its value */
/**
 * @typedef {object} ShaderControl
 * @property {string} key  as stored in the look's `shader`
 * @property {string} label  Title Case
 * @property {'range'|'choice'|'switch'} kind
 * @property {number} [min]  a range's ends and step (unless it runs over `steps`)
 * @property {number} [max]
 * @property {number} [step]
 * @property {number[]} [steps]  a range over these values, in order (the slider's index)
 * @property {Array<{value: string, label: string, spoken?: string}>} [options]  a choice's (spoken:
 *   its name for a screen reader, where the label alone is a bare number)
 * @property {boolean} pixelOnly  part of the pixel look: it rests at Pixel Size Off
 * @property {'dither'|'outlines'} [needs]  the Look menu switch it hangs on
 * @property {(v: any) => [string, string]} text  [shown, spoken]
 * @property {(p: any) => ShaderValue} get  a preset's value
 * @property {(p: any, v: any) => void} set  writes a value into a preset (a copy: lookPreset)
 */

/** Colors' last step: every level an 8-bit channel has (no quantizing to speak of). */
export const FULL = 256;
/** The toon gradient's cells over the light's angle (the gradient map's texels, nearest). */
export const TOON_CELLS = 64;
/** A soft shadow edge, for a style whose own is hard: spread a texel, dithered into two tones. */
export const SOFT_EDGE = { soft: 1, steps: 2, dither: 1 };

/** A share as a percent. */
const percent = (v) => `${Math.round(v * 100)}%`;
/** A percent, or Off at 0. */
const percentOrOff = (v) => (v > 0 ? percent(v) : 'Off');
/** The same text shown and spoken. */
const both = (s) => /** @type {[string, string]} */ ([s, s]);

/**
 * A preset's toon shading as a spec (an older preset's array of bands read as one).
 * @param {ToonSpec|number[]|undefined} toon
 * @returns {ToonSpec}
 */
export function toonSpec(toon) {
  if (!Array.isArray(toon)) return { bands: 2, highlight: true, shade: 0.5, lit: 0.8, ...toon };
  const highlight = toon.length > 2 && toon.at(-1) > toon.at(-2);
  const body = highlight ? toon.slice(0, -1) : toon;
  return {
    bands: Math.min(4, Math.max(2, new Set(body).size)),
    highlight,
    shade: Math.min(...body),
    lit: Math.max(...body),
  };
}

/** @type {ShaderControl[]} */
export const SHADER_CONTROLS = [
  {
    key: 'levels',
    label: 'Colors',
    kind: 'range',
    steps: [4, 6, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64, FULL],
    pixelOnly: true,
    text: (v) => (v >= FULL ? both('Full') : [String(v), `${v} levels`]),
    get: (p) => p.levels,
    set: (p, v) => (p.levels = v),
  },
  {
    key: 'dither',
    label: 'Dither Strength',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    pixelOnly: true,
    needs: 'dither',
    text: (v) => both(percentOrOff(v)),
    get: (p) => p.dither,
    set: (p, v) => (p.dither = v),
  },
  {
    key: 'outline',
    label: 'Outline Strength',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    pixelOnly: true,
    needs: 'outlines',
    text: (v) => both(percentOrOff(v)),
    get: (p) => p.outline.darken,
    set: (p, v) => (p.outline.darken = v),
  },
  {
    key: 'ink',
    label: 'Outline Color',
    kind: 'choice',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'tinted', label: 'Tinted' },
    ],
    pixelOnly: true,
    needs: 'outlines',
    text: (v) => both(v === 'dark' ? 'Dark' : 'Tinted'),
    get: (p) => (p.outline.ink === 'dark' ? 'dark' : 'tinted'),
    set: (p, v) => (p.outline.ink = v),
  },
  {
    key: 'ring',
    label: 'Outer Ring',
    kind: 'switch',
    pixelOnly: true,
    needs: 'outlines',
    text: (v) => both(v ? 'On' : 'Off'),
    get: (p) => Boolean(p.outline.outside),
    set: (p, v) => (p.outline.outside = v),
  },
  {
    key: 'bands',
    label: 'Toon Shading',
    kind: 'choice',
    options: [
      { value: 'smooth', label: 'Smooth' },
      { value: '2', label: '2', spoken: '2 Bands' },
      { value: '3', label: '3', spoken: '3 Bands' },
      { value: '4', label: '4', spoken: '4 Bands' },
    ],
    pixelOnly: false,
    text: (v) => both(v === 'smooth' ? 'Smooth' : `${v} Bands`),
    get: (p) => {
      const { bands } = toonSpec(p.toon);
      return bands ? String(bands) : 'smooth';
    },
    set: (p, v) => (p.toon = { ...toonSpec(p.toon), bands: v === 'smooth' ? 0 : Number(v) }),
  },
  {
    key: 'highlight',
    label: 'Highlight',
    kind: 'switch',
    pixelOnly: false,
    text: (v) => both(v ? 'On' : 'Off'),
    get: (p) => toonSpec(p.toon).highlight,
    set: (p, v) => (p.toon = { ...toonSpec(p.toon), highlight: v }),
  },
  {
    // (His face redrawn in pixels to fit his size, the sheets of models/newt-face.png: character.js.
    // On in every style; off, the glb's smooth face at every resolution.)
    key: 'pixelFace',
    label: 'Pixel Face',
    kind: 'switch',
    pixelOnly: true,
    text: (v) => both(v ? 'On' : 'Off'),
    get: (p) => p.texture?.pixelFace !== false,
    set: (p, v) => (p.texture = { ...p.texture, pixelFace: v }),
  },
  {
    key: 'edge',
    label: 'Shadow',
    kind: 'choice',
    options: [
      { value: 'hard', label: 'Hard' },
      { value: 'soft', label: 'Soft' },
    ],
    pixelOnly: true,
    text: (v) => both(v === 'soft' ? 'Soft' : 'Hard'),
    get: (p) => ((p.shadow.soft ?? 0) > 0 || (p.shadow.steps ?? 0) > 0 ? 'soft' : 'hard'),
    set: (p, v) => Object.assign(p.shadow, v === 'soft' ? SOFT_EDGE : { soft: 0, steps: 0 }),
  },
  {
    key: 'shadow',
    label: 'Shadow Strength',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    pixelOnly: false,
    text: (v) => both(percentOrOff(v)),
    get: (p) => p.shadow.opacity,
    set: (p, v) => (p.shadow.opacity = v),
  },
  {
    key: 'turn',
    label: 'Light Angle',
    kind: 'range',
    min: -180,
    max: 180,
    step: 15,
    pixelOnly: false,
    text: (v) => [`${v}°`, `${v} degrees`],
    get: (p) => p.sun.turn ?? 0,
    set: (p, v) => (p.sun.turn = v),
  },
  {
    key: 'light',
    label: 'Light Strength',
    kind: 'range',
    min: 0.25,
    max: 2,
    step: 0.05,
    pixelOnly: false,
    text: (v) => both(percent(v)),
    get: (p) => p.sun.strength ?? 1,
    set: (p, v) => (p.sun.strength = v),
  },
  {
    key: 'saturation',
    label: 'Saturation',
    kind: 'range',
    min: 0,
    max: 2,
    step: 0.01,
    pixelOnly: true,
    text: (v) => both(percent(v)),
    get: (p) => p.grade.saturation,
    set: (p, v) => (p.grade.saturation = v),
  },
  {
    key: 'warmth',
    label: 'Warmth',
    kind: 'range',
    min: -1,
    max: 1,
    step: 0.05,
    pixelOnly: true,
    text: (v) => both(v > 0 ? `Warm ${percent(v)}` : v < 0 ? `Cool ${percent(-v)}` : 'Neutral'),
    get: (p) => p.grade.warmth ?? 0,
    set: (p, v) => (p.grade.warmth = v),
  },
  {
    key: 'exposure',
    label: 'Brightness',
    kind: 'range',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    pixelOnly: true,
    text: (v) => both(percent(v)),
    get: (p) => p.grade.exposure,
    set: (p, v) => (p.grade.exposure = v),
  },
  {
    key: 'contrast',
    label: 'Contrast',
    kind: 'range',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    pixelOnly: true,
    text: (v) => both(percent(v)),
    get: (p) => p.grade.contrast ?? 1,
    set: (p, v) => (p.grade.contrast = v),
  },
];

/**
 * A control by its key.
 * @param {string} key
 */
export const controlFor = (key) => SHADER_CONTROLS.find((c) => c.key === key);

/**
 * A value onto control `c`: a range's clamped into it and onto its steps (the nearest of a
 * list's), a choice's kept when it's one of them, a switch's when it's a boolean; anything else
 * undefined.
 * @param {ShaderControl} c
 * @param {unknown} v
 * @returns {ShaderValue|undefined}
 */
export function snapShader(c, v) {
  if (c.kind === 'switch') return typeof v === 'boolean' ? v : undefined;
  if (c.kind === 'choice') return c.options?.some((o) => o.value === v) ? /** @type {string} */ (v) : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (c.steps) return c.steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const min = /** @type {number} */ (c.min);
  const max = /** @type {number} */ (c.max);
  const step = /** @type {number} */ (c.step);
  const n = Math.round((Math.min(max, Math.max(min, v)) - min) / step);
  return Number((min + n * step).toFixed(6));
}

/**
 * How control `c`'s value reads: shown beside it, and as a screen reader says it.
 * @param {ShaderControl} c
 * @param {ShaderValue} v
 */
export function shaderText(c, v) {
  const [shown, spoken] = c.text(v);
  return { shown, spoken };
}

/**
 * A style's own value for every control, in the table's order.
 * @param {any} preset  a LookPreset
 * @returns {ShaderValues}
 */
export const styleShader = (preset) => Object.fromEntries(SHADER_CONTROLS.map((c) => [c.key, c.get(preset)]));

/**
 * The toon gradient: TOON_CELLS values over the light's angle, from his side away from it to
 * facing it (three's toon shader samples it at N·L × ½ + ½). Smooth (0 bands) ramps from
 * `shade` to `lit`; 2 to 4 bands are flat steps evenly from `shade` to `lit`, split at N·L 0 (2
 * bands), ±0.3 (3) or 0 and ±0.45 (4); a highlight is white from N·L 0.75 on. An array (an older
 * preset's own bands) is kept as it is.
 * @param {ToonSpec|number[]} toon
 * @returns {number[]}
 */
export function toonRamp(toon) {
  if (Array.isArray(toon)) return toon;
  const { bands, highlight, shade, lit } = toonSpec(toon);
  const n = bands === 0 ? 0 : Math.min(4, Math.max(2, Math.round(bands)));
  // (Where one band gives way to the next, in N·L: evenly over ±w around the terminator.)
  const w = n > 2 ? 0.15 * (n - 1) : 0;
  const cuts = n === 2 ? [0] : Array.from({ length: n - 1 }, (_, j) => -w + (2 * w * j) / (n - 2));
  return Array.from({ length: TOON_CELLS }, (_, i) => {
    const d = ((i + 0.5) / TOON_CELLS) * 2 - 1;
    if (highlight && d >= 0.75) return 1;
    if (!n) {
      const t = Math.min(1, Math.max(0, (d + 0.6) / 1.2));
      return shade + (lit - shade) * t * t * (3 - 2 * t);
    }
    const band = cuts.filter((c) => d >= c).length;
    return shade + ((lit - shade) * band) / (n - 1);
  });
}

/**
 * The grade's tint toward warm (w > 0: less blue, a little less green) or cool (w < 0: less red,
 * a little less green), as RGB multipliers; 0 leaves it be.
 * @param {number} w  -1..1
 * @returns {[number, number, number]}
 */
export function warmthTint(w) {
  const k = Math.min(1, Math.abs(w || 0));
  if (!(w > 0) && !(w < 0)) return [1, 1, 1];
  return w > 0 ? [1, 1 - 0.14 * k, 1 - 0.3 * k] : [1 - 0.22 * k, 1 - 0.12 * k, 1];
}
