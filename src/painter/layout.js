// What the Painter's panel shows and where (pure: the panel draws it, the search indexes it,
// node's tests read it). Its sections are the settings map's (src/settingsMap.js
// PAINTER_SECTIONS), each gathering the shared sections in its `from`, so a part of a scene
// sits where Bonfire Live keeps the same setting; LAYOUT lists the rows of each shared
// section in the order the Painter shows them. A row is a setting from the map (its id
// there: its label, hint and More come from meta('painter', path)), a row of the Painter's
// own (OWN: an action, a part of a setting, a preview), or an item of a grid ("layer.glow",
// "dropFx.iris", "detail.glowSize", "param.segments", "blend.feed"), named and explained by
// looks.js and the map's ITEM_HINTS.
//
// Some rows only show while the scene has the shape for them (a layer's details while it's
// on, Movement Size while the camera moves…): SHOWN says when, and why not, so the search
// can say how to bring a hidden one back ("Glow Strength: turn on Glow in Layers to see
// this"). sectionShapes says what each section's layout depends on (not its values): a
// section is drawn again only when its own shape changes.
import { PAINTER_SECTIONS, SECTIONS as MAP_SECTIONS, SETTINGS, ITEM_HINTS, meta } from '../settingsMap.js';
import { DROP_FX, LAYER_BLENDS, LAYER_DETAILS, LAYERS, LOOK_PARAMS, LOOKS, PARAMS } from '../visualizer/looks.js';
import { FOGS, PALETTES, PIXEL_SIZES, FLAME_FPS, XRAY_VIEWS } from '../visualizer/render.js';
import { FORMATIONS, KNIGHT_MOVES } from '../visualizer/knightShow.js';
import { FLY_MOVES } from '../visualizer/fireflyMoves.js';
import { SCENERIES } from '../sceneries.js';
import { CAMERA_MOVES, FLY_SHOWS, KNIGHT_SEATS, MOVE_BARS, MUSIC } from '../scenes.js';
import { FINISH_NAMES, GESTURE_NAMES, HELMET_NAMES, STYLE_NAMES } from '../knightNames.js';
import { DEFAULT_EFFECTS, ELEMENT_IDS } from '../effectsDefaults.js';
import { modeOf } from '../modes.js';

/** The panel's sections, in order: { id, label, from } (the map's PAINTER_SECTIONS). */
export const PANEL_SECTIONS = PAINTER_SECTIONS.map(({ id, label, from }) => ({ id, label, from: [...from] }));

/**
 * The rows of each shared section, in the Painter's order. (Look Details and Layer Details
 * are the look's and the layers' items: drawn under the look and each layer that's on.)
 * @type {Record<string, string[]>}
 */
export const LAYOUT = {
  place: ['scenery', 'fog', 'exposure', 'vignette', 'shadows'],
  colors: ['colors', 'flameMake', 'flameSeed', 'flameRamp', 'flameLight', 'sceneColors', 'sceneSeed', 'sceneEdit', 'palette', 'paletteSlots'],
  fire: ['fireLevel', 'fireSize', 'fireHeight', 'fireTurbulence', 'fireGlow', 'windX', 'windZ'],
  pixels: ['pixelSize', 'dither', 'ditherMatrix', 'outlines', 'flameFps'],
  looks: ['looks', ...Object.values(LOOK_PARAMS).flat().map((k) => `param.${k}`)],
  strength: ['glitch'],
  xray: ['xrayView'],
  layers: ['pinAll', 'layers', ...Object.keys(LAYERS).map((k) => `layer.${k}`), 'blends'],
  camera: ['cameraDrag', 'shot', 'lens', 'tilt', 'camera', 'moveAmount', 'moveBars'],
  knights: ['knightCount', 'knightSeat', 'knightHelmets'],
  armor: ['knightStyle', 'knightFinish', 'knightGlow', 'knightRim', 'knightShine'],
  dancing: ['knightDance', 'knightFormation', 'knightMoves'],
  behavior: ['knightReactions'],
  preview: ['gestures'],
  fireflies: ['flyLit', 'flyShow', 'flyMoves', 'flySpeed'],
  presetScenes: ['sceneHold'],
  weapons: ['weapon', 'element'],
  drop: ['dropSource', 'dropFx', ...Object.keys(DROP_FX).map((k) => `dropFx.${k}`), 'dropCount'],
};

/**
 * The groups of rows a Painter section is made of: its shared sections (`from`), and the
 * Painter's own preview after the knights'. `head`: the group's sub-heading, for a section
 * that has them (Knights: Knights, Armor, Dancing, Behavior, then the preview).
 * @param {string} id  a Painter section
 * @returns {{ id: string, head: string | null }[]}
 */
export function groupsOf(id) {
  const sec = PANEL_SECTIONS.find((s) => s.id === id);
  if (!sec) return [];
  const headed = id === 'knights';
  const groups = sec.from.map((g) => ({ id: g, head: headed ? MAP_SECTIONS.find((s) => s.id === g)?.label ?? null : null }));
  if (headed) groups.push({ id: 'preview', head: OWN.gestures.label });
  return groups;
}

/**
 * The Painter's own rows: what isn't one setting of a scene (an action, part of a setting,
 * a preview, a grid's toolbar), with its label and hint.
 * @type {Record<string, { label: string, hint: string, keywords?: string[] }>}
 */
export const OWN = {
  flameMake: { label: 'Make a Flame', hint: 'Harmonious builds five colors that go together, in the harmony picked beside it; Fully Random rolls any five, kept readable.', keywords: ['harmonious', 'random', 'generate'] },
  flameSeed: { label: 'Flame From a Color', hint: 'Pick any color and flames are built round it, one per harmony. Hover a suggestion to see it, click to use it.', keywords: ['seed', 'picker'] },
  flameRamp: { label: 'Each Flame Color', hint: 'Dark to light: the embers, the body, the tips (lightened if too dark to read), the white-hot core, and the shade firelit stone takes.', keywords: ['embers', 'body', 'tips', 'core', 'shade', 'ramp'] },
  sceneSeed: { label: 'Place From a Color', hint: 'Pick any color and place colors are built round it: its hue tints the stone, or it becomes the accent. Hover to see, click to use.', keywords: ['seed', 'scenery colors'] },
  sceneEdit: { label: 'Each Place Color', hint: 'The background (always the darkest: the outlines take it), the shadow, the stone, the wood and the bone, set by hand.', keywords: ['background', 'stone', 'wood', 'bone', 'scenery colors'] },
  paletteSlots: { label: 'Few Colors', hint: 'The colors the picture is drawn in, from this scene’s palette. The first, the background, is always in: the outlines take it.', keywords: ['slots', 'limited'] },
  cameraDrag: { label: 'Framing By Hand', hint: 'Drag the stage to orbit round what the camera looks at, Shift-drag (or right-drag) to slide it, the wheel to come nearer.', keywords: ['orbit', 'drag', 'pan', 'zoom', 'mouse'] },
  pinAll: { label: 'Pin What You See', hint: 'Copies every detail showing now, and which layers in the mix are on this turn, into the scene, pinned: the picture on the stage, kept.', keywords: ['pin', 'keep', 'freeze', 'lock'] },
  layers: { label: 'All Layers', hint: meta('painter', 'layers')?.hint ?? '', keywords: ['bulk', 'all off', 'shuffle'] },
  gestures: { label: 'Try a Gesture (Preview, Not Saved)', hint: 'Plays one on the stage now. Gestures aren’t part of a scene: the show throws them on drops.', keywords: ['praise the sun', 'wave', 'bow', 'dance'] },
};
/**
 * The items' hints as the Painter shows them: the map's ITEM_HINTS, the same as Bonfire
 * Live's, but for the few that speak of what only Live has (a key it answers, the looks
 * taking turns), said here for a scene.
 */
export const PAINTER_ITEM_HINTS = {
  looks: { ember: 'Just the fire, clean: no effect of its own, while the zoom punch and the shake still land on the beat.' },
  layers: { mirror: 'The picture folded onto itself: a half or a quarter copied over the rest (Mirror Kind picks which).' },
};
/**
 * A look's, layer's or drop hit's hint, as the Painter shows it.
 * @param {'looks' | 'layers' | 'dropFx'} group @param {string} key
 */
export const itemHint = (group, key) => PAINTER_ITEM_HINTS[group]?.[key] ?? ITEM_HINTS[group]?.[key] ?? '';
/** The fire's section says this once, over its sliders. */
export const FIRE_HELP = 'Each adds to what the music does to the fire, every frame: 0 leaves it to the music.';
/** With the Music: how the Painter previews it. */
export const MUSIC_HELP = 'The Painter always previews a scene held. One that starts the stretch opens like this in Bonfire Live, then the show takes over.';

/** The blend modes' layers, as How Each Layer Blends names them (looks.js LAYER_BLENDS). */
export const BLEND_LABELS = { feed: 'Echoes', ghost: 'Ghost Trail', warp: 'Warps', ink: 'Ink', invert: 'Negative', scan: 'Scanlines', glow: 'Glow', gradient: 'Gradient Map' };
/** The blend modes, as the selects name them. */
export const BLEND_NAMES = {
  normal: 'Normal', add: 'Add', subtract: 'Subtract', multiply: 'Multiply', screen: 'Screen', darken: 'Darken', lighten: 'Lighten',
  overlay: 'Overlay', hardLight: 'Hard Light', softLight: 'Soft Light', difference: 'Difference', exclusion: 'Exclusion',
};
/** A blend select's hint. */
export const blendHint = (id) => `How ${BLEND_LABELS[id]} lies over the picture; Rolled Each Turn picks a new way each time the look comes round.`;

// --- The choices a row offers ----------------------------------------------------------
/** A scene's few-color palette, as Palette's last choice. */
export const FEW_COLORS = 'A Few Of the Scene’s Colors';
const DRAWN = 'Drawn By the Show';
const SITE_MARK = ' (The Site’s)';
const named = (id) => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * What a row offers, as [value, text] pairs (Title Case): a select's options, a row of chips'
 * names (the search reads these too). `ctx`: the page's lists (panelMarkup's): weapons and
 * elements by key, the site's flames, Bonfire Live's shots, the knights' styles, and the
 * site's own pixel size, dither pattern and flame frame rate (marked "The Site’s").
 * @param {string} id
 * @param {{ weapons?: Record<string, string>, elements?: Record<string, string>, styles?: Record<string, string>,
 *   flames?: { key: string, name: string }[], shots?: { key: string, name: string }[],
 *   site?: { pixelSize?: number, ditherMatrix?: number, flameFps?: number } }} [ctx]
 * @returns {[string, string][]}
 */
export function choices(id, ctx = {}) {
  const site = { pixelSize: DEFAULT_EFFECTS.render.pixelSize, ditherMatrix: DEFAULT_EFFECTS.render.ditherMatrix, flameFps: DEFAULT_EFFECTS.fire.fps, ...ctx.site };
  /** @type {Record<string, () => [string, string][]>} */
  const by = {
    scenery: () => Object.entries(SCENERIES),
    fog: () => Object.entries(FOGS),
    palette: () => [...Object.entries(PALETTES), ['few', FEW_COLORS]],
    pixelSize: () => PIXEL_SIZES.map((px) => [String(px), `${px} px${px === site.pixelSize ? SITE_MARK : ''}`]),
    ditherMatrix: () => [4, 8].map((n) => [String(n), `${n}×${n}${n === site.ditherMatrix ? SITE_MARK : n === 8 ? ' (Finer)' : ''}`]),
    flameFps: () => FLAME_FPS.map((f) => [String(f), `${f} fps${f === site.flameFps ? SITE_MARK : ''}`]),
    xrayView: () => [['', 'Off: the Finished Picture'], ...Object.entries(XRAY_VIEWS)],
    looks: () => Object.entries(LOOKS),
    camera: () => Object.entries(CAMERA_MOVES),
    moveBars: () => MOVE_BARS.map((b) => [String(b), `${b} Bars`]),
    knightSeat: () => Object.entries(KNIGHT_SEATS),
    knightHelmets: () => [['', 'Drawn At Random'], ...Object.entries(HELMET_NAMES)],
    knightStyle: () => [['', 'Bonfire Live’s Own'], ['mix', 'In the Mix'], ...Object.entries(ctx.styles ?? STYLE_NAMES)],
    knightFinish: () => [['mix', 'In the Mix'], ...Object.entries(FINISH_NAMES)],
    knightFormation: () => [...Object.entries(FORMATIONS), ['mix', 'A New One Each Dance']],
    knightMoves: () => Object.entries(KNIGHT_MOVES),
    gestures: () => Object.entries(GESTURE_NAMES),
    flyShow: () => Object.entries(FLY_SHOWS),
    flyMoves: () => Object.entries(FLY_MOVES),
    sceneHold: () => Object.entries(MUSIC),
    weapon: () => [['', DRAWN], ...Object.entries(ctx.weapons ?? {})],
    element: () => [['', DRAWN], ...ELEMENT_IDS.map((e) => /** @type {[string, string]} */ ([e, ctx.elements?.[e] ?? named(e)]))],
    dropSource: () => [['show', 'The Show’s Drop Hits'], ['own', 'This Scene’s Own']],
    dropCount: () => [['1', 'One'], ['2', 'Up To Two'], ['3', 'Up To Three']],
    colors: () => (ctx.flames ?? []).map((f) => [f.key, f.name]),
    shot: () => (ctx.shots ?? []).map((s) => [s.key, s.name]),
    flameMake: () => [['harmonious', 'Harmonious'], ['random', 'Fully Random']],
    sceneColors: () => [['site', 'The Site’s Own'], ['harmonious', 'Harmonious'], ['vivid', 'Vivid'], ['random', 'Fully Random']],
  };
  if (Object.hasOwn(by, id)) return by[id]();
  const [kind, key] = id.split('.');
  const spec = (kind === 'detail' || kind === 'param') && Object.hasOwn(PARAMS, key) ? PARAMS[key] : null;
  if (spec?.values) return spec.values.map((v, i) => [String(v), spec.names?.[i] ?? String(v)]);
  if (kind === 'blend' && LAYER_BLENDS[key]) return [['', 'Rolled Each Turn'], ...LAYER_BLENDS[key].map((b) => /** @type {[string, string]} */ ([b, BLEND_NAMES[b] ?? b]))];
  return [];
}

// --- When a row shows ------------------------------------------------------------------
const knights = (s) => s.knights.count > 0;
const layerOn = (s, k) => modeOf(s.layers?.[k]) !== 'off';
const moving = (s) => s.camera.move.kind !== 'still';
const ownDrops = (s) => s.drops !== null && s.drops !== undefined;
const NO_KNIGHTS = 'set Knights above 0 to see this';
const STILL = 'pick a Movement other than Still to see this';
const SHOW_DROPS = 'pick This Scene’s Own under Drop Hits to see this';
const or = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0]);

/**
 * Rows that show only while the scene has the shape for them: [shown(scene), how to bring
 * it back]. (Item rows' rules are made below: a layer's details, a look's own, the blends,
 * the scene's own drop hits.)
 * @type {Record<string, [(scene: any) => boolean, string]>}
 */
const SHOWN = {
  sceneEdit: [(s) => !!s.colors.scenery, 'pick Place Colors other than The Site’s Own to see this'],
  paletteSlots: [(s) => Array.isArray(s.render.palette), 'pick A Few Of the Scene’s Colors under Palette to see this'],
  moveAmount: [moving, STILL],
  moveBars: [moving, STILL],
  ...Object.fromEntries([...LAYOUT.knights.slice(1), ...LAYOUT.armor, ...LAYOUT.dancing, ...LAYOUT.behavior, ...LAYOUT.preview].map((id) => [id, [knights, NO_KNIGHTS]])),
  knightStyle: [(s) => knights(s) && 'style' in s.knights, NO_KNIGHTS],
  blends: [(s) => layerOn(s, 'blend'), `turn on ${LAYERS.blend} in Layers to see this`],
  dropFx: [ownDrops, SHOW_DROPS],
  dropCount: [ownDrops, SHOW_DROPS],
};
/** The layers a detail belongs to (styleMix: Painterly's and Watercolor's). */
const DETAIL_LAYERS = /* @__PURE__ */ (() => {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [layer, keys] of Object.entries(LAYER_DETAILS)) for (const k of keys) (out[k] ??= []).push(layer);
  return out;
})();
/** The looks a look detail belongs to. */
const PARAM_LOOKS = /* @__PURE__ */ (() => {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [look, keys] of Object.entries(LOOK_PARAMS)) for (const k of keys) (out[k] ??= []).push(look);
  return out;
})();

/**
 * When `id` shows ([shown(scene), how to bring it back]), or null for a row that always does.
 * @param {string} id
 * @returns {[(scene: any) => boolean, string] | null}
 */
export function shownRule(id) {
  if (Object.hasOwn(SHOWN, id)) return SHOWN[id];
  const [kind, key] = id.split('.');
  if (kind === 'detail' && DETAIL_LAYERS[key]) {
    const layers = DETAIL_LAYERS[key];
    return [(s) => layers.some((l) => layerOn(s, l)), `turn on ${or(layers.map((l) => LAYERS[l]))} in Layers to see this`];
  }
  if (kind === 'param' && PARAM_LOOKS[key]) {
    const looks = PARAM_LOOKS[key];
    return [(s) => looks.includes(s.look.name), `pick the ${or(looks.map((l) => LOOKS[l]))} look to see this`];
  }
  if (kind === 'blend') return [SHOWN.blends[0], `turn on ${LAYERS.blend} in Layers to see how it blends`];
  if (kind === 'dropFx') return SHOWN.dropFx;
  return null;
}
/**
 * Whether row `id` shows for `scene`.
 * @param {string} id @param {any} scene
 */
export const rowShown = (id, scene) => shownRule(id)?.[0](scene) ?? true;

/**
 * What row `id` is called and says: { label, hint, more, keywords, path } (path: the part of
 * the scene it edits, when it's one), or null for an id that isn't a row.
 * @param {string} id
 * @returns {{ label: string, hint: string, more: string, keywords: string[], path: string } | null}
 */
export function rowText(id) {
  const [kind, key] = id.split('.');
  if (key !== undefined) {
    if (kind === 'layer' && LAYERS[key]) return { label: LAYERS[key], hint: itemHint('layers', key), more: '', keywords: [], path: `layers.${key}` };
    if (kind === 'dropFx' && DROP_FX[key]) return { label: DROP_FX[key], hint: itemHint('dropFx', key), more: '', keywords: [], path: `drops.fx.${key}` };
    if (kind === 'detail' && PARAMS[key]) return { label: PARAMS[key].label, hint: PARAMS[key].hint, more: '', keywords: [], path: `details.${key}` };
    if (kind === 'param' && PARAMS[key]) return { label: PARAMS[key].label, hint: PARAMS[key].hint, more: '', keywords: [], path: `look.params.${key}` };
    if (kind === 'blend' && BLEND_LABELS[key]) return { label: BLEND_LABELS[key], hint: blendHint(key), more: '', keywords: ['blend modes'], path: `blends.${key}` };
    return null;
  }
  if (Object.hasOwn(OWN, id)) return { label: OWN[id].label, hint: OWN[id].hint, more: '', keywords: OWN[id].keywords ?? [], path: '' };
  const e = Object.hasOwn(SETTINGS, id) ? SETTINGS[id] : null;
  if (!e?.painter) return null;
  const m = meta('painter', e.painter);
  return { label: m.label, hint: m.hint, more: m.more, keywords: m.keywords, path: e.painter };
}

/**
 * Every row of a Painter section, by its groups, in order: [group, row ids].
 * @param {string} id
 * @returns {[{ id: string, head: string | null }, string[]][]}
 */
export const sectionRows = (id) => groupsOf(id).map((g) => [g, LAYOUT[g.id] ?? []]);

/** Which Painter section a row is in (its id), or null. */
export function sectionOfRow(row) {
  for (const s of PANEL_SECTIONS) if (sectionRows(s.id).some(([, rows]) => rows.includes(row))) return s.id;
  return null;
}

/**
 * What each section's layout depends on (not its values), as text: a section is drawn again
 * only when its own changes. (How many knights isn't: every helmet row is drawn, the ones past
 * the count hidden, so a drag on the count keeps its slider; whether a layer is In the Mix or
 * Always isn't either, only whether it's on: its radios show which.)
 * @param {any} scene
 * @returns {Record<string, string>}
 */
export function sectionShapes(scene) {
  const on = Object.keys(LAYERS).filter((k) => layerOn(scene, k));
  const parts = {
    place: [],
    colors: [!!scene.colors.scenery, Array.isArray(scene.render.palette)],
    fire: [],
    pixels: [],
    look: [scene.look.name, Object.keys(scene.look.params).sort()],
    layers: [on, Object.keys(scene.details).sort()],
    camera: [moving(scene)],
    knights: [knights(scene), Array.isArray(scene.knights.moves), 'style' in scene.knights],
    fireflies: [Array.isArray(scene.fireflies.moves)],
    show: [ownDrops(scene)],
  };
  return Object.fromEntries(PANEL_SECTIONS.map((s) => [s.id, JSON.stringify(parts[s.id] ?? [])]));
}
