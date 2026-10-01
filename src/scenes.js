// Preset scenes: one format for the Bonfire Painter (where they're made), Bonfire Live
// (which loops through them) and the admin (which keeps the built-in ones in content.json).
// A scene is a whole picture, held for a stretch of the music: where the fire burns and
// what's in it, its colors (stored in full, never a site flame's key, so a scene survives
// the site's flames being edited and moves between browsers), the fire's shape, the
// framing and its slow move, one look with its layers and their details, the drop hits,
// the render, the knights and the fireflies.
//
// Anything a scene leaves out is rolled each time it comes round: a missing detail, a
// layer or drop hit set to "in the mix", a weapon or element left to the show (null), a
// helmet left to the draw. So a scene held for a whole set still keeps finding new
// combinations inside it (the "endless variations").
//
//   defaultScene      a new scene: the ember flame, the ruins, the Clearing shot
//   normalizeScene    any value → a valid scene; never throws: fills what's missing,
//                     clamps numbers into their ranges, drops unknown keys, fixes the
//                     colors (the void darkest, the flame's hi readable on it) and the
//                     camera (inside the clearing), and migrates older versions by `v`
//   validateScene(s)  every rule, reported as err(path, message) like the content rules
//                     (paths like scenes[1].look.name), so the admin shows them in place
//   sceneFile / readSceneFile   the Painter's export file ({ app, v, scenes }); reading
//                     takes a file, a list, or one bare scene (copied from the admin)
//   sceneSummary, sceneSwatches  a one-line summary and the colors, for cards
//   sceneRef / parseRef          'b:<id>' built-in (content.json), 'm:<id>' mine (sceneStore.js)
//   encode/decodeSceneHash       a scene in a URL (#scene=…): base64url of its UTF-8 JSON
//
// Pure (no DOM, no three.js): the admin's API and node's tests use it as it is. The
// vocabularies come from the engine's own tables (looks.js PARAMS and friends, render.js,
// knightShow.js, the knight's steel finishes), so the format can't drift from what plays.
import { contrast, HEX_RE, ID_RE, luminance, slugify, WEAPON_KEYS } from './ruleBasics.js';
import { BASE_COLORS, DEFAULT_EFFECTS, ELEMENT_IDS } from './effectsDefaults.js';
import { SCENERIES } from './sceneries.js';
import { HELMET_NAMES } from './knightNames.js';
import { cleanParam, DROP_FX, LAYER_BLENDS, LAYER_DETAILS, LAYERS, LOOK_PARAMS, LOOKS, MODES, PARAMS } from './visualizer/looks.js';
import { FLAME_FPS, FOGS, PALETTES, PIXEL_SIZES, XRAY_VIEWS } from './visualizer/render.js';
import { FORMATIONS, KNIGHT_MOVES, MAX_KNIGHTS, SEAT_POSES } from './visualizer/knightShow.js';
import { FLY_MOVES } from './visualizer/fireflyMoves.js';
import { keepInClearing, MOVE_BARS } from './visualizer/clearing.js';
import { FINISHES } from './bonfire/steel.js';
import { STYLE_KEYS, STYLE_NAMES } from './bonfire/knightStyles.js';

/** The format's version (a scene's `v`); older ones are migrated as they're read. */
export const SCENE_VERSION = 1;
/** The `app` of the Painter's export file. */
export const SCENE_APP = 'bonfire-painter';
/** The most built-in scenes content.json may hold (Bonfire Live's list). */
export const MAX_SCENES = 48;
/** The longest name (characters) and id a scene may have. */
export const NAME_MAX = 40;
export const ID_MAX = 48;
/** With the music: hold everything for the stretch, or open it and let the show play on. */
export const MUSIC = { hold: 'Hold the Scene', base: 'Start From the Scene' };
/** The framing's slow move, periodic and locked to the beat (visualizer/clearing.js movePose). */
export const CAMERA_MOVES = { still: 'Still', sway: 'Sway', sweep: 'Sweep', push: 'Push In & Out', crane: 'Crane', vertigo: 'Vertigo' };
/** How many bars one cycle of the camera's move takes (clearing.js). */
export { MOVE_BARS };
/** The fireflies' light show (fireflyShow.js patterns), or in the mix. */
export const FLY_SHOWS = { off: 'Off', blink: 'Blink', species: 'Species', chase: 'Chase', twinkle: 'Twinkle', breathe: 'Breathe', strobe: 'Strobe', mix: 'In the Mix' };
/** How the knights sit by the fire (knightShow.js SEAT_POSES: knightPose.js seatedPose), or in the mix. */
export const KNIGHT_SEATS = /* @__PURE__ */ (() => ({ ...SEAT_POSES, mix: 'In the Mix' }))();
/** The knights' armor finishes (bonfire/steel.js FINISHES; FINISH_NAMES there), as a scene names them. */
export const FINISH_KEYS = /* @__PURE__ */ Object.keys(FINISHES);
/**
 * The knights' styles a scene may set (bonfire/knightStyles.js STYLES; STYLE_NAMES there), or
 * 'mix' (rolled each time they come round); a scene's null leaves it to Bonfire Live's own.
 */
export const KNIGHT_STYLE_KEYS = /* @__PURE__ */ (() => [...STYLE_KEYS, 'mix'])();
/** The fire's shape, added to the music's drive (fractions, -1..1). */
export const FIRE_KEYS = ['level', 'size', 'height', 'turbulence', 'glow', 'windX', 'windZ'];
/** The flame's colors (palette.js flames: the ramp lo → core, and the shade). */
export const RAMP_KEYS = ['lo', 'mid', 'hi', 'core', 'shade'];
/** Slots a few-color palette may use (palette.js scenePalette: 0 void … 9 shade). */
export const PALETTE_SLOTS = 10;

// (The tables built from others are pure: a page that imports contentRules.js for
// something else, like the site's validateEffects, leaves all of this out of its bundle.)

/**
 * [min, max, step, unit?] per number, keyed by path (the Painter's sliders read them too).
 * @type {Record<string, [number, number, number, string?]>}
 */
export const SCENE_RANGES = /* @__PURE__ */ (() => ({
  'colors.flame.light': [0, 1, 0.01],
  ...Object.fromEntries(FIRE_KEYS.map((k) => [`fire.${k}`, [-1, 1, 0.05]])),
  'camera.fov': [14, 80, 1, '°'],
  'camera.roll': [-0.6, 0.6, 0.01],
  'camera.move.amount': [0, 1, 0.05],
  'look.amount': [0, 2, 0.05, '×'],
  'drops.count': [1, 3, 1],
  'render.dither': [0, 0.4, 0.02],
  'render.vignette': [0, 1.5, 0.05],
  'render.exposure': [0.5, 2, 0.05, '×'],
  'knights.count': [0, MAX_KNIGHTS, 1],
  'knights.rim': [0, 1, 0.05],
  'fireflies.lit': [0, DEFAULT_EFFECTS.fireflies.count, 1],
  'fireflies.speed': [0.3, 2, 0.05, '×'],
}))();
// Numbers that are counts.
const WHOLE = new Set(['drops.count', 'knights.count', 'fireflies.lit']);

/** Where a camera may look: a box round the fire (m). */
export const TARGET_BOX = { x: [-4, 4], y: [-0.5, 4], z: [-4, 4] };
/** How close the camera may come to what it looks at (m). */
const MIN_AIM = 0.2;

/**
 * @typedef {'off'|'mix'|'on'} Mode
 * @typedef {{ lo: string, mid: string, hi: string, core: string, shade: string, light: number }} SceneFlame
 * @typedef {{ void: string, shadow: string, stone: string, wood: string, bone: string }} SceneColors
 * @typedef {{ kind: string, amount: number, bars: number }} CameraMove
 * @typedef {{ pos: number[], target: number[], fov: number, roll: number, move: CameraMove }} SceneCamera
 * @typedef {{
 *   v: number, id: string, name: string, hidden?: boolean, music: 'hold'|'base',
 *   place: { scenery: string, weapon: string|null, element: string|null },
 *   colors: { flame: SceneFlame, scenery: SceneColors|null },
 *   fire: Record<string, number>,
 *   camera: SceneCamera,
 *   look: { name: string, amount: number, params: Record<string, any> },
 *   layers: Record<string, Mode>, details: Record<string, any>, blends: Record<string, string>,
 *   drops: { fx: Record<string, Mode>, count: number } | null,
 *   render: { pixelSize: number, palette: string|number[], dither: number, ditherMatrix: number, outlines: Mode,
 *     vignette: number, exposure: number, fog: string, shadows: boolean, flameFps: number, xray: string|null },
 *   knights: { count: number, helmets: (string|null)[], dance: Mode, formation: string, moves: string[]|null,
 *     shine: Mode, reactions: Mode, finish: string, seat: string, glow: Mode, rim: number, style: string|null },
 *   fireflies: { lit: number, show: string, moves: string[]|null, speed: number },
 * }} Scene
 */

const MODE_IDS = /* @__PURE__ */ MODES.map(([id]) => id);
const LOOK_PARAM_KEYS = /* @__PURE__ */ (() => [...new Set(Object.values(LOOK_PARAMS).flat())])();
/** The details a scene may pin: the layers' (looks.js LAYER_DETAILS), exactly what looks.pin() takes. */
export const DETAIL_KEYS = /* @__PURE__ */ (() => [...new Set(Object.values(LAYER_DETAILS).flat())])();
const TOP_KEYS = ['v', 'id', 'name', 'hidden', 'music', 'place', 'colors', 'fire', 'camera', 'look', 'layers', 'details', 'blends', 'drops', 'render', 'knights', 'fireflies'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** @type {(v: number, range: readonly (number | string)[]) => number} */
const clampTo = (v, range) => Math.min(Number(range[1]), Math.max(Number(range[0]), v));
const chars = (s) => [...s].length;
const keys = (o) => Object.keys(o);

// Field kinds: each knows how to check a value and how to fix one (fix: the value made
// valid, or `undefined` when there's nothing to keep).
const num = (path) => ({ kind: 'num', path });
const one = (list) => ({ kind: 'one', list });
const HEX = { kind: 'hex' };
const BOOL = { kind: 'bool' };
const orNull = (of) => ({ kind: 'null', of });
const picks = (list) => ({ kind: 'picks', list });
const MODE = /* @__PURE__ */ one(MODE_IDS);

// Each group's fields.
const T = /* @__PURE__ */ (() => ({
  PLACE: { scenery: one(keys(SCENERIES)), weapon: orNull(one(WEAPON_KEYS)), element: orNull(one(ELEMENT_IDS)) },
  FLAME: { ...Object.fromEntries(RAMP_KEYS.map((k) => [k, HEX])), light: num('colors.flame.light') },
  SCENE_COLORS: Object.fromEntries(BASE_COLORS.map((k) => [k, HEX])),
  FIRE: Object.fromEntries(FIRE_KEYS.map((k) => [k, num(`fire.${k}`)])),
  MOVE: { kind: one(keys(CAMERA_MOVES)), amount: num('camera.move.amount'), bars: one(MOVE_BARS) },
  RENDER: {
    pixelSize: one(PIXEL_SIZES), palette: { kind: 'palette' }, dither: num('render.dither'), ditherMatrix: one([4, 8]),
    outlines: MODE, vignette: num('render.vignette'), exposure: num('render.exposure'), fog: one(keys(FOGS)),
    shadows: BOOL, flameFps: one(FLAME_FPS), xray: orNull(one(keys(XRAY_VIEWS))),
  },
  KNIGHTS: {
    count: num('knights.count'), helmets: { kind: 'helmets' }, dance: MODE, formation: one([...keys(FORMATIONS), 'mix']),
    moves: orNull(picks(keys(KNIGHT_MOVES))), shine: MODE, reactions: MODE, finish: one(['mix', ...FINISH_KEYS]),
    seat: one(keys(KNIGHT_SEATS)), glow: MODE, rim: num('knights.rim'), style: orNull(one(KNIGHT_STYLE_KEYS)),
  },
  FIREFLIES: { lit: num('fireflies.lit'), show: one(keys(FLY_SHOWS)), moves: orNull(picks(keys(FLY_MOVES))), speed: num('fireflies.speed') },
}))();

/**
 * A field's value made valid, or undefined.
 * @returns {any}
 */
function fixField(f, v) {
  switch (f.kind) {
    case 'num': {
      if (!isNum(v)) return undefined;
      const x = clampTo(v, SCENE_RANGES[f.path]);
      return WHOLE.has(f.path) ? Math.round(x) : x;
    }
    case 'one': {
      if (f.list.includes(v)) return v;
      // Numbers saved as text ('8' for the dither pattern, as Bonfire Live's settings keep it).
      if (typeof v === 'string' && v.trim() && typeof f.list[0] === 'number' && f.list.includes(Number(v))) return Number(v);
      if (f.list === MODE_IDS && typeof v === 'boolean') return v ? 'on' : 'off';
      return undefined;
    }
    case 'hex': return typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : undefined;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'null': return v === null ? null : fixField(f.of, v);
    case 'picks': {
      if (!Array.isArray(v)) return undefined;
      const kept = f.list.filter((k) => v.includes(k));
      return kept.length ? kept : undefined;
    }
    case 'palette': {
      if (typeof v === 'string') return PALETTES[v] && Object.hasOwn(PALETTES, v) ? v : undefined;
      if (!Array.isArray(v)) return undefined;
      const slots = [...new Set(v.filter((x) => Number.isInteger(x) && x >= 0 && x < PALETTE_SLOTS))];
      const out = [0, ...slots.filter((x) => x !== 0)].slice(0, 4);
      return out.length >= 2 ? out : undefined;
    }
    default: return undefined;
  }
}

/**
 * A group of fields made valid: each from `raw` when it can be, else from `fallback`.
 * @returns {any}
 */
function fixGroup(spec, raw, fallback) {
  const out = {};
  for (const [k, f] of Object.entries(spec)) {
    const v = own(raw, k) ? fixField(f, raw[k]) : undefined;
    out[k] = v === undefined ? structuredClone(fallback[k]) : v;
  }
  return out;
}

/**
 * A pinned detail made valid, or undefined: the engine's own rule (looks.js cleanParam), so
 * a scene keeps exactly what a pinned look would.
 * @param {string} key  a PARAMS key
 * @param {unknown} v
 */
const fixDetail = (key, v) => cleanParam(key, v);

/** Why a pinned detail isn't valid (or null when it is). @param {string} key @param {unknown} v */
function detailProblem(key, v) {
  const spec = Object.hasOwn(PARAMS, key) ? PARAMS[key] : null;
  if (!spec) return 'Unknown setting.';
  if (spec.values) return spec.values.includes(/** @type {number} */ (v)) ? null : `One of: ${spec.values.join(', ')}.`;
  if (spec.bool) return typeof v === 'boolean' ? null : 'Must be on or off.';
  if (spec.slots) return fixDetail(key, v) ? null : `${spec.slots} palette slots, each 0 to ${spec.of - 1}.`;
  if (spec.range) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'Must be a number.';
    return v < spec.range[0] || v > spec.range[1] ? `Between ${spec.range[0]} and ${spec.range[1]}.` : null;
  }
  return 'Unknown setting.';
}

// Colors: parse, mix, and fixes that keep the rules.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** `hex` moved toward white (or black, on a light void) until it reads at 4.5:1 on `bg`. */
function readable(hex, bg, min = 4.5) {
  if (contrast(hex, bg) >= min) return hex;
  const to = contrast('#ffffff', bg) >= min ? '#ffffff' : '#000000';
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mix(hex, to, t);
    if (contrast(c, bg) >= min) return c;
  }
  return to;
}
/** `hex` darkened until it's no brighter than `lum`. */
function darkenTo(hex, lum) {
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mix(hex, '#000000', t);
    if (luminance(c) <= lum) return c;
  }
  return '#000000';
}
const siteVoid = (voidHex) => (typeof voidHex === 'string' && HEX_RE.test(voidHex) ? voidHex : DEFAULT_EFFECTS.colors.void);

/** @type {(v: unknown) => number[] | null} */
const vec3 = (v) => (Array.isArray(v) && v.length === 3 && v.every(isNum) ? [...v] : null);
/** @type {(v: number[]) => number[]} */
const inBox = (v) => [clampTo(v[0], TARGET_BOX.x), clampTo(v[1], TARGET_BOX.y), clampTo(v[2], TARGET_BOX.z)];
/** @type {(a: number[], b: number[]) => number} */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** @type {(v: number[]) => number[]} A camera position kept in the clearing. */
const clearOf = (v) => { const p = keepInClearing({ x: v[0], y: v[1], z: v[2] }); return [p.x, p.y, p.z]; };

/** A name as a scene keeps it: one line, trimmed, at most NAME_MAX characters. */
function cleanName(v) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return [...v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()].slice(0, NAME_MAX).join('').trim();
}

/**
 * An id for a scene called `name` that isn't in `taken`: its slug ("frozen-shrine"), then
 * "frozen-shrine-2", "-3"…, never longer than ID_MAX.
 * @param {string} name
 * @param {Set<string>} [taken]
 */
export function uniqueSceneId(name, taken = new Set()) {
  const base = slugify(name).slice(0, ID_MAX).replace(/-+$/, '') || 'scene';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const tail = `-${n}`;
    const id = `${base.slice(0, ID_MAX - tail.length).replace(/-+$/, '')}${tail}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * A new scene, as the Painter starts one: the ember flame over the site's own scenery
 * colors, the ruins, Bonfire Live's Clearing shot with its sway, the clean look, a knight
 * by the fire (dancing now and then; his helmet drawn, his seat, armor finish and Edge Glow
 * in the mix, his style Bonfire Live's own), the fireflies' show in the mix.
 * @param {string} [name]
 * @returns {Scene}
 */
export function defaultScene(name = 'New Scene') {
  const [ember] = DEFAULT_EFFECTS.flames;
  const clean = cleanName(name) || 'New Scene';
  return {
    v: SCENE_VERSION,
    id: uniqueSceneId(clean),
    name: clean,
    music: 'hold',
    place: { scenery: 'ruins', weapon: null, element: null },
    colors: {
      flame: { lo: ember.lo, mid: ember.mid, hi: ember.hi, core: ember.core, shade: ember.shade, light: ember.light },
      scenery: null,
    },
    fire: Object.fromEntries(FIRE_KEYS.map((k) => [k, 0])),
    // (Bonfire Live's Clearing shot: its sway of ±0.3 rad over 4 bars is a sway at 0.85, clearing.js.)
    camera: { pos: [0, 2.2, 6.1], target: [0, 0.55, 0], fov: 32, roll: 0, move: { kind: 'sway', amount: 0.85, bars: 4 } },
    look: { name: 'ember', amount: 1, params: {} },
    layers: {},
    details: {},
    blends: {},
    drops: null,
    render: {
      pixelSize: DEFAULT_EFFECTS.render.pixelSize, palette: 'flame', dither: DEFAULT_EFFECTS.render.dither,
      ditherMatrix: DEFAULT_EFFECTS.render.ditherMatrix, outlines: 'on', vignette: DEFAULT_EFFECTS.render.vignette,
      exposure: DEFAULT_EFFECTS.render.exposure, fog: 'light', shadows: true, flameFps: DEFAULT_EFFECTS.fire.fps, xray: null,
    },
    knights: {
      count: 1, helmets: [null], dance: 'mix', formation: 'mix', moves: null, shine: 'mix', reactions: 'mix',
      finish: 'mix', seat: 'mix', glow: 'mix', rim: 0.5, style: null,
    },
    fireflies: { lit: DEFAULT_EFFECTS.fireflies.lit, show: 'mix', moves: null, speed: 1 },
  };
}

// Older versions, each step to the next: MIGRATIONS[v](scene) → a scene of version v + 1.
// (Version 1 is the first; the next change to the format adds MIGRATIONS[1].)
/** @type {Record<number, (s: any) => any>} */
const MIGRATIONS = {};
function migrate(raw) {
  let s = raw;
  let v = Number.isInteger(s.v) && s.v >= 1 ? s.v : 1;
  while (v < SCENE_VERSION && MIGRATIONS[v]) s = MIGRATIONS[v++](s);
  return s;
}

function normalize(raw, voidHex) {
  const d = defaultScene();
  if (!isObj(raw)) return d;
  const r = migrate(raw);
  const name = cleanName(r.name) || 'Untitled Scene';
  const id = typeof r.id === 'string' && ID_RE.test(r.id) && r.id.length <= ID_MAX ? r.id : uniqueSceneId(name);

  // Colors: the void darkest of the scenery's, the flame's hi readable on the void.
  const rc = isObj(r.colors) ? r.colors : {};
  const flame = fixGroup(T.FLAME, rc.flame, d.colors.flame);
  const scenery = isObj(rc.scenery) ? fixGroup(T.SCENE_COLORS, rc.scenery, DEFAULT_EFFECTS.colors) : null;
  if (scenery) {
    const darkest = Math.min(...BASE_COLORS.filter((k) => k !== 'void').map((k) => luminance(scenery[k])));
    if (luminance(scenery.void) > darkest) scenery.void = darkenTo(scenery.void, darkest);
  }
  flame.hi = readable(flame.hi, scenery?.void ?? siteVoid(voidHex));

  // The camera: inside the clearing, looking at something in front of it.
  const rcam = isObj(r.camera) ? r.camera : {};
  const asked = vec3(rcam.pos) ?? d.camera.pos;
  const kept = clearOf(asked);
  const pos = dist(kept, asked) > 1e-9 ? kept : asked; // (inside already: exactly as given)
  let target = inBox(vec3(rcam.target) ?? d.camera.target);
  if (dist(pos, target) < MIN_AIM) target = [...d.camera.target];
  const camera = {
    pos, target,
    fov: fixField(num('camera.fov'), rcam.fov) ?? d.camera.fov,
    roll: fixField(num('camera.roll'), rcam.roll) ?? d.camera.roll,
    move: fixGroup(T.MOVE, rcam.move, d.camera.move),
  };

  // The look and its own details (only this look's).
  const rl = isObj(r.look) ? r.look : {};
  const lookName = fixField(one(keys(LOOKS)), rl.name) ?? d.look.name;
  const params = {};
  for (const k of LOOK_PARAMS[lookName] ?? []) {
    const v = own(rl.params, k) ? fixDetail(k, rl.params[k]) : undefined;
    if (v !== undefined) params[k] = v;
  }
  const look = { name: lookName, amount: fixField(num('look.amount'), rl.amount) ?? d.look.amount, params };

  // Layers (missing: off), with Painterly and Watercolor never both always on.
  /** @type {Record<string, Mode>} */
  const layers = {};
  for (const k of keys(LAYERS)) {
    const m = own(r.layers, k) ? fixField(MODE, r.layers[k]) : undefined;
    if (m !== undefined) layers[k] = m;
  }
  if (layers.paint === 'on' && layers.wash === 'on') layers.wash = 'mix';
  const details = {};
  for (const k of DETAIL_KEYS) {
    const v = own(r.details, k) ? fixDetail(k, r.details[k]) : undefined;
    if (v !== undefined) details[k] = v;
  }
  const blends = {};
  for (const [k, list] of Object.entries(LAYER_BLENDS)) if (own(r.blends, k) && list.includes(r.blends[k])) blends[k] = r.blends[k];

  let drops = null;
  if (isObj(r.drops)) {
    const fx = {};
    for (const k of keys(DROP_FX)) {
      const m = own(r.drops.fx, k) ? fixField(MODE, r.drops.fx[k]) : undefined;
      if (m !== undefined) fx[k] = m;
    }
    drops = { fx, count: fixField(num('drops.count'), r.drops.count) ?? 2 };
  }

  // Knights: one helmet (or null: drawn) per knight.
  const knights = fixGroup(T.KNIGHTS, r.knights, d.knights);
  const rawHelmets = own(r.knights, 'helmets') && Array.isArray(r.knights.helmets) ? r.knights.helmets : [];
  knights.helmets = Array.from({ length: knights.count }, (_, i) => (Object.hasOwn(HELMET_NAMES, rawHelmets[i]) ? rawHelmets[i] : null));

  /** @type {Scene} */
  const out = {
    v: SCENE_VERSION, id, name,
    ...(r.hidden === true ? { hidden: true } : {}),
    music: fixField(one(keys(MUSIC)), r.music) ?? d.music,
    place: fixGroup(T.PLACE, r.place, d.place),
    colors: { flame, scenery },
    fire: fixGroup(T.FIRE, r.fire, d.fire),
    camera, look, layers, details, blends, drops,
    render: fixGroup(T.RENDER, r.render, d.render),
    knights,
    fireflies: fixGroup(T.FIREFLIES, r.fireflies, d.fireflies),
  };
  return out;
}

/**
 * Any value as a valid scene. Never throws: fills what's missing from defaultScene(),
 * clamps numbers into SCENE_RANGES, drops unknown keys and values, keeps the void the
 * darkest scenery color and the flame's hi readable on it (4.5:1; `voidHex`: the site's
 * void, for a scene on the site's own scenery colors), keeps the camera in the clearing,
 * and migrates an older version by its `v`.
 * @param {unknown} raw
 * @param {{ voidHex?: string }} [o]
 * @returns {Scene}
 */
export function normalizeScene(raw, { voidHex } = {}) {
  try {
    return normalize(raw, voidHex);
  } catch {
    return defaultScene();
  }
}

/**
 * Check a scene. `err(path, message)` gets paths under `base`, like `scene.look.name` (or
 * `scenes[1].look.name` from validateScenes). `voidHex`: the site's void, which a scene on
 * the site's own scenery colors is checked against.
 * @param {any} s
 * @param {(path: string, message: string) => void} err
 * @param {string} [base]
 * @param {{ voidHex?: string }} [o]
 */
export function validateScene(s, err, base = 'scene', { voidHex } = {}) {
  if (!isObj(s)) return err(base, 'Must be a group of fields.');
  const at = (p) => `${base}.${p}`;
  const unknown = (o, spec, p) => { for (const k of keys(o)) if (!Object.hasOwn(spec, k)) err(at(`${p}.${k}`), 'Unknown setting.'); };
  const field = (f, v, p) => {
    const bad = (msg) => err(at(p), msg);
    switch (f.kind) {
      case 'num': {
        const [min, max] = SCENE_RANGES[f.path];
        if (!isNum(v)) return bad('Must be a number.');
        if (v < min || v > max) return bad(`Between ${min} and ${max}.`);
        if (WHOLE.has(f.path) && !Number.isInteger(v)) bad('A whole number.');
        return;
      }
      case 'one': if (!f.list.includes(v)) bad(`One of: ${f.list.join(', ')}.`); return;
      case 'hex': if (typeof v !== 'string' || !HEX_RE.test(v)) bad('Use a color like #ff8800.'); return;
      case 'bool': if (typeof v !== 'boolean') bad('Must be on or off.'); return;
      case 'null': if (v !== null) field(f.of, v, p); return;
      case 'picks': {
        if (!Array.isArray(v)) return bad('Must be a list (or null: the show’s own).');
        if (!v.length) return bad('Pick at least one (or null: the show’s own).');
        v.forEach((k, i) => { if (!f.list.includes(k)) err(at(`${p}[${i}]`), `One of: ${f.list.join(', ')}.`); });
        if (new Set(v).size !== v.length) bad('Each one once.');
        return;
      }
      case 'palette': {
        if (typeof v === 'string') { if (!Object.hasOwn(PALETTES, v)) bad(`One of: ${keys(PALETTES).join(', ')}, or a list of palette slots.`); return; }
        if (!Array.isArray(v)) return bad('A palette name or a list of palette slots.');
        if (v.length < 2 || v.length > 4) return bad('2 to 4 palette slots.');
        if (!v.every((x) => Number.isInteger(x) && x >= 0 && x < PALETTE_SLOTS)) return bad(`Palette slots are 0 to ${PALETTE_SLOTS - 1}.`);
        if (v[0] !== 0) return bad('The first slot is 0 (the void: the outlines’ color).');
        if (new Set(v).size !== v.length) bad('Each slot once.');
        return;
      }
      default: return;
    }
  };
  const group = (key, spec, { nullable = false } = {}) => {
    const v = s[key];
    if (v === undefined) { err(at(key), 'Missing.'); return false; }
    if (v === null && nullable) return false;
    if (!isObj(v)) { err(at(key), 'Must be a group of fields.'); return false; }
    unknown(v, spec, key);
    for (const [k, f] of Object.entries(spec)) {
      if (!Object.hasOwn(v, k)) err(at(`${key}.${k}`), 'Missing.');
      else field(f, v[k], `${key}.${k}`);
    }
    return true;
  };
  const sub = (o, key, spec, p) => {
    if (!isObj(o[key])) return err(at(`${p}.${key}`), o[key] === undefined ? 'Missing.' : 'Must be a group of fields.');
    unknown(o[key], spec, `${p}.${key}`);
    for (const [k, f] of Object.entries(spec)) {
      if (!Object.hasOwn(o[key], k)) err(at(`${p}.${key}.${k}`), 'Missing.');
      else field(f, o[key][k], `${p}.${key}.${k}`);
    }
  };
  const modes = (o, p, names) => {
    if (!isObj(o)) return err(at(p), o === undefined ? 'Missing.' : 'Must be a group of fields.');
    for (const [k, v] of Object.entries(o)) {
      if (!Object.hasOwn(names, k)) err(at(`${p}.${k}`), 'Unknown setting.');
      else if (!MODE_IDS.includes(v)) err(at(`${p}.${k}`), `One of: ${MODE_IDS.join(', ')}.`);
    }
  };

  for (const k of keys(s)) if (!TOP_KEYS.includes(k)) err(at(k), 'Unknown setting.');
  if (s.v !== SCENE_VERSION) err(at('v'), isNum(s.v) && s.v > SCENE_VERSION ? 'Made by a newer Painter than this site knows.' : `Must be ${SCENE_VERSION}.`);
  if (typeof s.id !== 'string' || !ID_RE.test(s.id)) err(at('id'), 'Use lowercase letters, numbers and single dashes.');
  else if (s.id.length > ID_MAX) err(at('id'), `At most ${ID_MAX} characters.`);
  if (typeof s.name !== 'string' || !s.name.trim()) err(at('name'), 'Can’t be empty.');
  else if (chars(s.name) > NAME_MAX) err(at('name'), `At most ${NAME_MAX} characters.`);
  if (s.hidden !== undefined && typeof s.hidden !== 'boolean') err(at('hidden'), 'Must be on or off.');
  field(one(keys(MUSIC)), s.music, 'music');

  group('place', T.PLACE);
  group('fire', T.FIRE);
  group('render', T.RENDER);

  // Colors: hex, the void the darkest, the flame's hi readable on it.
  if (!isObj(s.colors)) err(at('colors'), s.colors === undefined ? 'Missing.' : 'Must be a group of fields.');
  else {
    const c = s.colors;
    unknown(c, { flame: 1, scenery: 1 }, 'colors');
    sub(c, 'flame', T.FLAME, 'colors');
    if (c.scenery !== null) sub(c, 'scenery', T.SCENE_COLORS, 'colors');
    const sc = isObj(c.scenery) && BASE_COLORS.every((k) => HEX_RE.test(c.scenery[k] ?? '')) ? c.scenery : null;
    if (sc) {
      const lighter = BASE_COLORS.filter((k) => k !== 'void' && luminance(sc[k]) < luminance(sc.void));
      if (lighter.length) err(at('colors.scenery.void'), `Must be the darkest scenery color (${lighter.join(', ')} ${lighter.length > 1 ? 'are' : 'is'} darker); it’s the outlines’ color.`);
    }
    const bg = sc ? sc.void : isObj(c.scenery) ? null : siteVoid(voidHex);
    const hi = c.flame?.hi;
    if (bg && typeof hi === 'string' && HEX_RE.test(hi) && contrast(hi, bg) < 4.5) {
      err(at('colors.flame.hi'), `Too dark for text on the background (${contrast(hi, bg).toFixed(1)}:1, needs 4.5:1). Lighten it.`);
    }
  }

  // The camera: in the clearing, looking at something in front of it.
  if (group('camera', { pos: 1, target: 1, fov: num('camera.fov'), roll: num('camera.roll'), move: 1 })) {
    const cam = s.camera;
    const pos = vec3(cam.pos);
    const target = vec3(cam.target);
    if (!pos) err(at('camera.pos'), 'Three numbers: x, y, z (m).');
    else if (dist(clearOf(pos), pos) > 1e-6) err(at('camera.pos'), 'Outside the clearing: keep it above the ground, out of the fire and in front of the ruins.');
    if (!target) err(at('camera.target'), 'Three numbers: x, y, z (m).');
    else if (dist(inBox(target), target) > 0) err(at('camera.target'), `Look at something near the fire (x and z within ${TARGET_BOX.x[1]} m, y ${TARGET_BOX.y[0]} to ${TARGET_BOX.y[1]} m).`);
    else if (pos && dist(pos, target) < MIN_AIM) err(at('camera.target'), 'Too close to the camera.');
    if (Object.hasOwn(cam, 'move')) sub(cam, 'move', T.MOVE, 'camera');
  }

  // The look: one of LOOKS, its own details only.
  if (group('look', { name: one(keys(LOOKS)), amount: num('look.amount'), params: 1 }) && s.look.params !== undefined) {
    const ps = s.look.params;
    if (!isObj(ps)) err(at('look.params'), 'Must be a group of fields.');
    else {
      // (A name straight from the file: only the tables' own keys, never what every object
      // inherits, like 'constructor'. An unknown look has its own error: its details are
      // only checked as details.)
      const name = s.look.name;
      const known = typeof name === 'string' && Object.hasOwn(LOOKS, name);
      const mine = known && Object.hasOwn(LOOK_PARAMS, name) ? LOOK_PARAMS[name] : [];
      for (const [k, v] of Object.entries(ps)) {
        if (!LOOK_PARAM_KEYS.includes(k)) err(at(`look.params.${k}`), 'Unknown setting.');
        else if (known && !mine.includes(k)) err(at(`look.params.${k}`), `Not a detail of the ${LOOKS[name]} look.`);
        else { const why = detailProblem(k, v); if (why) err(at(`look.params.${k}`), why); }
      }
    }
  }

  // Layers (Painterly and Watercolor not both always on), their details and blends.
  modes(s.layers, 'layers', LAYERS);
  if (isObj(s.layers) && s.layers.paint === 'on' && s.layers.wash === 'on') {
    err(at('layers.wash'), 'Painterly and Watercolor can’t both be Always (one repaints over the other): set one to In the mix or Off.');
  }
  if (!isObj(s.details)) err(at('details'), s.details === undefined ? 'Missing.' : 'Must be a group of fields.');
  else for (const [k, v] of Object.entries(s.details)) {
    if (!DETAIL_KEYS.includes(k)) err(at(`details.${k}`), 'Unknown setting.');
    else { const why = detailProblem(k, v); if (why) err(at(`details.${k}`), why); }
  }
  if (!isObj(s.blends)) err(at('blends'), s.blends === undefined ? 'Missing.' : 'Must be a group of fields.');
  else for (const [k, v] of Object.entries(s.blends)) {
    if (!Object.hasOwn(LAYER_BLENDS, k)) err(at(`blends.${k}`), 'Unknown setting.');
    else if (!LAYER_BLENDS[k].includes(v)) err(at(`blends.${k}`), `One of: ${LAYER_BLENDS[k].join(', ')}.`);
  }

  // Drops: null (the show's Drop Hits) or the scene's own.
  if (s.drops === undefined) err(at('drops'), 'Missing.');
  else if (s.drops !== null) {
    if (!isObj(s.drops)) err(at('drops'), 'Must be a group of fields (or null: the show’s own).');
    else {
      unknown(s.drops, { fx: 1, count: 1 }, 'drops');
      modes(s.drops.fx, 'drops.fx', DROP_FX);
      field(num('drops.count'), s.drops.count, 'drops.count');
    }
  }

  // Knights: one helmet (or null) per knight.
  if (group('knights', T.KNIGHTS)) {
    const { count, helmets } = s.knights;
    if (!Array.isArray(helmets)) err(at('knights.helmets'), 'A list: one helmet per knight (null: drawn).');
    else {
      if (isNum(count) && helmets.length !== count) err(at('knights.helmets'), `One helmet per knight (${count}); null: drawn.`);
      helmets.forEach((h, i) => { if (h !== null && !Object.hasOwn(HELMET_NAMES, h)) err(at(`knights.helmets[${i}]`), `One of: ${keys(HELMET_NAMES).join(', ')}, or null (drawn).`); });
    }
  }
  group('fireflies', T.FIREFLIES);
}

/**
 * Check a list of scenes (content.json's `scenes`): each scene, ids unique, at most
 * MAX_SCENES. Paths look like `scenes[1].look.name`.
 * @param {any} list
 * @param {(path: string, message: string) => void} err
 * @param {string} [base]
 * @param {{ voidHex?: string }} [o]
 */
export function validateScenes(list, err, base = 'scenes', o = {}) {
  if (!Array.isArray(list)) return err(base, 'Must be a list.');
  if (list.length > MAX_SCENES) err(base, `At most ${MAX_SCENES} scenes.`);
  const seen = new Map();
  list.forEach((s, i) => {
    const p = `${base}[${i}]`;
    validateScene(s, err, p, o);
    if (!isObj(s) || typeof s.id !== 'string' || !ID_RE.test(s.id)) return;
    if (seen.has(s.id)) err(`${p}.id`, `“${s.id}” is already used by ${seen.get(s.id)}.`);
    else seen.set(s.id, typeof s.name === 'string' && s.name.trim() ? `“${s.name.trim()}”` : 'another scene');
  });
}

/**
 * The Painter's export file.
 * @param {Scene[]} scenes
 */
export const sceneFile = (scenes) => ({ app: SCENE_APP, v: SCENE_VERSION, scenes });

const looksLikeScene = (o) => ['place', 'look', 'colors', 'camera', 'layers'].some((k) => Object.hasOwn(o, k));

/**
 * Scenes from a file's text or its parsed JSON: a Painter file ({ app, v, scenes }), a
 * list of scenes, or one bare scene (copied from the admin). Each is normalized, and ids
 * that repeat in it are made unique. `errors`: what couldn't be read, in words.
 * @param {unknown} json
 * @param {{ voidHex?: string }} [o]
 * @returns {{ scenes: Scene[], errors: string[] }}
 */
export function readSceneFile(json, { voidHex } = {}) {
  const errors = [];
  const NEWER = 'Made by a newer Painter: read as far as this one understands it.';
  /** @type {any} */
  let data = json;
  if (typeof json === 'string') {
    try { data = JSON.parse(json); } catch { return { scenes: [], errors: ['This isn’t JSON: use a file the Painter exported, or a scene’s JSON.'] }; }
  }
  let list;
  if (Array.isArray(data)) list = data;
  else if (isObj(data) && Array.isArray(data.scenes)) {
    if (data.app !== undefined && data.app !== SCENE_APP) return { scenes: [], errors: [`This is a “${String(data.app).slice(0, 40)}” file, not the Bonfire Painter’s.`] };
    if (isNum(data.v) && data.v > SCENE_VERSION) errors.push(NEWER);
    list = data.scenes;
  } else if (isObj(data) && looksLikeScene(data)) list = [data];
  else return { scenes: [], errors: ['No scenes in it.'] };

  const taken = new Set();
  const scenes = [];
  list.forEach((raw, i) => {
    if (!isObj(raw)) { errors.push(`Item ${i + 1} isn’t a scene; skipped.`); return; }
    if (isNum(raw.v) && raw.v > SCENE_VERSION && !errors.includes(NEWER)) errors.push(NEWER);
    const s = normalizeScene(raw, { voidHex });
    if (taken.has(s.id)) {
      const id = uniqueSceneId(s.name, taken);
      errors.push(`“${s.name}” had the id “${s.id}” like one before it; it’s now “${id}”.`);
      s.id = id;
    }
    taken.add(s.id);
    scenes.push(s);
  });
  return { scenes, errors };
}

/**
 * A one-line summary for a card: "Cathedral Altar · Kaleido + Glow, Grain · 2 knights
 * dancing · holds".
 * @param {unknown} scene
 */
export function sceneSummary(scene) {
  const s = normalizeScene(scene);
  const on = keys(LAYERS).filter((k) => s.layers[k] === 'on').map((k) => LAYERS[k]);
  const mixed = keys(LAYERS).filter((k) => s.layers[k] === 'mix').length;
  const look = `${LOOKS[s.look.name]}${on.length ? ` + ${on.join(', ')}` : ''}${mixed ? ` (${mixed} in the mix)` : ''}`;
  const n = s.knights.count;
  // (Not dancing: how they sit, when the scene says.)
  const seated = { resting: 'resting', watchful: 'on watch' }[s.knights.seat] ?? 'seated';
  const doing = { on: 'dancing', mix: 'dancing now and then', off: seated }[s.knights.dance];
  const style = s.knights.style === 'mix' ? ', styles in the mix' : s.knights.style ? ` in ${STYLE_NAMES[s.knights.style]}` : '';
  // (Their Edge Glow unless it's in the mix, as a new scene's is: always, or none at all.)
  const glow = s.knights.glow === 'off' || s.knights.rim <= 0 ? ', no edge glow' : s.knights.glow === 'on' ? ', edges aglow' : '';
  const knights = n ? `${n} knight${n > 1 ? 's' : ''} ${doing}${style}${glow}` : 'no knights';
  return [SCENERIES[s.place.scenery], look, knights, s.music === 'hold' ? 'holds' : 'opens the show'].join(' · ');
}

/**
 * The scene's colors for a card: the flame's ramp and shade, then the scenery's (when it
 * has its own).
 * @param {unknown} scene
 * @returns {string[]}
 */
export function sceneSwatches(scene) {
  const { colors } = normalizeScene(scene);
  return [...RAMP_KEYS.map((k) => colors.flame[k]), ...(colors.scenery ? BASE_COLORS.map((k) => colors.scenery[k]) : [])];
}

/**
 * A scene's reference across the apps: 'b:<id>' built-in (content.json), 'm:<id>' mine
 * (this browser's, sceneStore.js).
 * @param {'b'|'m'} source
 * @param {string} id
 */
export const sceneRef = (source, id) => `${source}:${id}`;

/**
 * A reference's parts. A bare id has no source; anything else is { source: null, id: '' }.
 * @param {unknown} ref
 * @returns {{ source: 'b'|'m'|null, id: string }}
 */
export function parseRef(ref) {
  const m = typeof ref === 'string' ? /^(?:([bm]):)?(.+)$/.exec(ref) : null;
  if (!m || !ID_RE.test(m[2]) || m[2].length > ID_MAX) return { source: null, id: '' };
  return { source: /** @type {'b'|'m'|null} */ (m[1] ?? null), id: m[2] };
}

/**
 * A scene for a URL's hash (#scene=…): base64url of its UTF-8 JSON.
 * @param {unknown} scene
 */
export function encodeSceneHash(scene) {
  const bytes = new TextEncoder().encode(JSON.stringify(scene));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A scene from encodeSceneHash's text (a leading '#' or 'scene=' is fine), normalized;
 * null when it isn't one.
 * @param {unknown} hash
 * @param {{ voidHex?: string }} [o]
 * @returns {Scene | null}
 */
export function decodeSceneHash(hash, { voidHex } = {}) {
  try {
    const t = String(hash ?? '').trim().replace(/^#/, '').replace(/^scene=/, '');
    if (!t || t.length > 200000 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
    const b64 = t.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(t.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return isObj(raw) ? normalizeScene(raw, { voidHex }) : null;
  } catch {
    return null;
  }
}
