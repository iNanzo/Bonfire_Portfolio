// The Painter's panel: every part of a scene as a field, in sections that fold (Place, Fire
// & Colors, Camera, Look, Layers, Drops, Render, Knights, Fireflies, With the Music).
//
// panelMarkup(scene) draws it (pure: the tests read it in node); bindPanel wires it. Every
// input names the part of the scene it edits by its path (`data-scene="details.glowSize"`,
// `knights.helmets.1`), the same way Bonfire Live's dialog names a setting (the fields are
// src/ui/fields.js, with `data-set` renamed), so one handler does them all:
//
//   fields     sliders, selects, checkboxes and colors: `data-scene` paths, each with a
//              Title Case label and a "?" hint.
//   chips      a choice drawn as a button (`data-pick` + `data-value`, JSON): the scenery,
//              a look, a flame, a shot, a layer's Off / In the Mix / Always. Hovering one
//              with `data-audition` shows it on the stage at once (an audition); leaving puts
//              the scene back; a click keeps it (an undo step). The hover is the effect:
//              no text pops up.
//   locks      each detail a look or layer rolls can be pinned (it stays as painted) or
//              left to the dice (rolled again each time the look comes round: the endless
//              variations). A rolled one shows what's on screen now, dimmed; moving its
//              slider pins it.
//   actions    buttons that do more than set one path (`data-paint-act`): a new harmonious
//              or random flame, the scenery's colors, Pin What You See, a gesture to
//              preview. The page (painter/main.js) does those.
// The panel is drawn again only when its shape changes (a layer turned on shows its
// details, a move that isn't Still shows how big it is); otherwise fill() just sets the
// values (and shows as many helmet rows as there are knights, so dragging Knights by the
// Fire never swaps the slider out from under the pointer). A redraw keeps the keyboard's
// place (the focused field, chip, lock or button is focused again), and one that would
// come mid-drag waits for the drag to end. fill() leaves the field under the user's hand
// alone (a slider being dragged or just moved), unless undo or redo forces it.
//
// The "?" hints open inside the panel: from one near its right edge they're shifted left,
// and from one near its top they open downward (the panel clips what's outside it).
import { esc } from '../html.js';
import { range, select, check, tip } from '../ui/fields.js';
import { DROP_FX, LAYER_BLENDS, LAYER_DETAILS, LAYERS, LOOK_PARAMS, LOOKS, MODES, PARAMS } from '../visualizer/looks.js';
import { FOGS, PALETTES, PIXEL_SIZES, FLAME_FPS, XRAY_VIEWS } from '../visualizer/render.js';
import { FORMATIONS, KNIGHT_MOVES, MAX_KNIGHTS } from '../visualizer/knightShow.js';
import { FLY_MOVES } from '../visualizer/fireflyMoves.js';
import { SCENERIES } from '../sceneries.js';
import { CAMERA_MOVES, FIRE_KEYS, FLY_SHOWS, KNIGHT_SEATS, MOVE_BARS, MUSIC, SCENE_RANGES } from '../scenes.js';
import { FINISH_NAMES, GESTURE_NAMES, HELMET_NAMES, STYLE_NAMES } from '../knightNames.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { SCHEMES } from '../paletteGen.js';

/** The panel's sections, in order: [id, name]. */
export const SECTIONS = [
  ['place', 'Place'], ['colors', 'Fire & Colors'], ['camera', 'Camera'], ['look', 'Look'], ['layers', 'Layers'],
  ['drops', 'Drops'], ['render', 'Render'], ['knights', 'Knights'], ['flies', 'Fireflies'], ['music', 'With the Music'],
];

// --- paths ------------------------------------------------------------------------------
const parts = (path) => path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
/** The value at a dotted path ("knights.helmets.1"), or undefined. */
export function getPath(obj, path) {
  let o = obj;
  for (const p of parts(path)) {
    if (o === null || typeof o !== 'object') return undefined;
    o = o[p];
  }
  return o;
}
/**
 * A copy of `obj` with the value at `path` set (`undefined`: taken out, e.g. a detail back
 * to the dice). Groups on the way are made as needed.
 */
export function withPath(obj, path, value) {
  const out = structuredClone(obj);
  const ps = parts(path);
  let o = out;
  for (let i = 0; i < ps.length - 1; i++) {
    const p = ps[i];
    if (o[p] === null || typeof o[p] !== 'object') o[p] = typeof ps[i + 1] === 'number' ? [] : {};
    o = o[p];
  }
  const last = ps.at(-1);
  if (value === undefined) {
    if (Array.isArray(o)) o[/** @type {number} */ (last)] = null;
    else delete o[last];
  } else o[last] = structuredClone(value);
  return out;
}

// --- hints: every field says what it does (and the Painter's own words for a scene) ---------
const DETAIL_ROLLED = 'Pinned, it stays as painted; left to the dice, it’s rolled again each time the look comes round.';
const MODE_HINT = 'Off, In the Mix (it comes and goes: rolled again each time the look comes round, so a held scene keeps finding new pictures) or Always.';
export const HINTS = {
  'place.scenery': 'What stands round the fire: the Gothic ruins, the forge, the hillside shrine, the cathedral’s altar or the cult’s circle. Click to move there.',
  'place.weapon': 'The weapon planted in the fire. Drawn by the Show: a new one each time a drop forges one, as Bonfire Live does.',
  'place.element': 'What the fire is made of: flame, a lightning ball or ice. Drawn by the Show: each drop draws one from those Bonfire Live allows.',
  'colors.flames': 'The site’s own palettes. Hover one to see it on the fire, click to use it (its colors are copied into the scene, so it keeps them).',
  'colors.make': 'Harmonious: colors made to go together, in the scheme picked beside it. Fully Random: five random colors (the tips kept readable).',
  'colors.scheme': 'How a harmonious flame’s colors relate on the color wheel: embers and tips leaning apart, neighbors, one hue, opposites…',
  'colors.seed': 'Pick any color: flames are built round it, one per color scheme. Hover a suggestion to see it, click to use it.',
  'colors.ramp': 'The flame’s five colors, dark to light: the embers, the body, the tips (kept readable as text: lightened if too dark), the white-hot core, and the shade firelit stone takes.',
  'colors.flame.light': 'How far the light the fire casts is washed toward white: low keeps the flame’s own color on everything it lights.',
  'colors.scenery': 'The stone, wood, shadows and background. The Site’s Own: as on the site. Or made for this scene: harmonious, vivid, fully random, or from a color.',
  'colors.scenery.seed': 'Pick any color: scenery palettes built round it (its hue tints the stone, or it becomes the accent). Hover to see, click to use.',
  'colors.scenery.edit': 'The scenery’s five colors: the background (always the darkest: it’s the outlines’ color), shadow, stone, wood and bone.',
  'fire.level': 'Added to how high the fire burns, on top of what the music does to it.',
  'fire.size': 'Added to how wide the flames are, on top of the music’s swell.',
  'fire.height': 'Added to how tall the flames reach, on top of the kicks’ punches.',
  'fire.turbulence': 'Added to how much the flames churn and flicker.',
  'fire.glow': 'Added to how brightly the fire lights everything round it.',
  'fire.windX': 'A steady wind across the fire: negative blows the flames left, positive right.',
  'fire.windZ': 'A steady wind toward the camera (positive) or away from it (negative).',
  'camera.drag': 'Drag the stage to orbit round what the camera looks at, Shift-drag (or right-drag) to slide it, the wheel to come nearer. Q and E tilt, [ and ] change the lens.',
  'camera.shots': 'Bonfire Live’s own framings. Hover one to see it, click to start from it, then drag the stage to make it yours.',
  'camera.fov': 'The lens: narrow (a long lens, flat and close) to wide (everything, stretched at the edges). In degrees.',
  'camera.roll': 'Tilts the horizon: a Dutch angle, negative one way, positive the other.',
  'camera.move.kind': 'How the framing moves while the scene holds, in time with the music: a sway, a long sweep, a push in and out, a crane up and down, or a vertigo dolly zoom.',
  'camera.move.amount': 'How big the move is. It’s kept inside the clearing: near the edge it swings the other way only.',
  'camera.move.bars': 'How many bars one cycle of the move takes; it comes back to your framing at the end of each.',
  'look.name': 'The picture’s style for this scene. Hover a look to see it on the stage, click to paint with it.',
  'look.amount': 'How strong the look is, even when the music is quiet (the beat still pulses and bursts it on top).',
  'layers.pin': 'Copies every detail showing now (and which layers in the mix are on this turn) into the scene, pinned: the picture on the stage, kept.',
  'layers.blends': 'With Blend Modes on: how each layer lies over the picture. Rolled Each Turn: a new way each time the look comes round.',
  'drops.kind': 'What a drop throws in this scene: the show’s own Drop Hits (Bonfire Live’s settings), or the scene’s own set.',
  'drops.fx': 'The extra effects a drop throws while this scene plays. In the mix: drawn at random; Always: every drop.',
  'drops.count': 'How many drop hits land at once (those set to Always come on top).',
  'render.pixelSize': 'How big each pixel of the picture is: small is fine detail, big is chunky.',
  'render.palette': 'The colors everything snaps to: the flame’s own, Ashen’s three, Moonlit’s four, or a few of this scene’s own colors (pick them below).',
  'render.slots': 'The few colors the picture is drawn in, from this scene’s palette. The first (the background) is always in: it’s the outlines’ color.',
  'render.dither': 'How much colors are dithered where they meet: 0 is flat bands, more is a finer checkered blend.',
  'render.ditherMatrix': 'The dither’s grid: 4×4 is the classic crosshatch, 8×8 a finer one with more steps.',
  'render.outlines': `Dark outlines round everything solid, and the bright creases between facets. ${MODE_HINT}`,
  'render.vignette': 'How much the corners darken.',
  'render.exposure': 'How bright the whole picture is, before its colors snap to the palette.',
  'render.fog': 'The dark closing in: off (the far scenery clear), light (as on the site) or thick (only what’s near the fire shows).',
  'render.shadows': 'The scenery and the weapon throw shadows from the fire.',
  'render.flameFps': 'How many times a second the flames move on: few is choppy, hand-drawn animation; 60 is smooth.',
  'render.xray': 'Holds the picture in one of the passes it’s built from, in its own colors, for the whole scene. Off: the finished picture.',
  'knights.count': 'How many knights are by the fire in this scene (0: the fire burns alone). Touch screens show two at most.',
  'knights.helmets': 'Each knight’s helmet: Drawn at Random (a new one each time the scene comes round), or one of the three.',
  'knights.style': 'How the knights are drawn: a hand-drawn pixel sprite (cel, painterly, chiaroscuro), gunmetal plate, black and gold, or the first boxy build. Bonfire Live’s Own: its Knights tab decides; In the Mix: rolled each time the scene comes round.',
  'knights.finish': 'The steel their armor is made of (one for the whole cast). In the mix: rolled each time the scene comes round.',
  'knights.glow': 'The edges of their armor catch the fire’s color, fading toward their backs. Off: plain steel edges. In the Mix: rolled each time the scene comes round (and at each big drop): some stretches glow, each at a strength rolled round the Glow Strength, some don’t. Always: at the Glow Strength.',
  'knights.rim': 'How strongly the edges glow: 0 none, 1 a bright rim along every edge that faces the fire. With Edge Glow Always, this strength; in the mix, the strength the rolls land round.',
  'knights.seat': 'How they sit by the fire: Resting (slumped over their knees, heads sunk), or Watchful (leaning in over their knees, forearms on them, heads up at the fire). In the mix: rolled each time.',
  'knights.dance': `Whether they get up and dance with the music. ${MODE_HINT}`,
  'knights.formation': 'Round the Fire, a Line facing you, Solo (each his own move), a Canon (each a step behind), or a new one each dance.',
  'knights.moves': 'The dance moves they may do in this scene. The Show’s Moves: whatever Bonfire Live’s Knights tab allows.',
  'knights.shine': `The fire’s reflection sweeping over their armor. ${MODE_HINT}`,
  'knights.reactions': `They flinch when a blade lands, lean from a flare, lift their feet as a ring passes. ${MODE_HINT}`,
  'knights.gestures': 'Try a gesture on the stage (a preview: gestures aren’t part of the scene; the show throws them on drops).',
  'fireflies.lit': 'How many fireflies are glowing round the fire.',
  'fireflies.show': 'Their light show: blinking patterns, one kind each (species), chasing round, twinkling, breathing, strobing, or a mix that changes.',
  'fireflies.moves': 'The dances they may do on the beat. The Show’s Moves: whatever Bonfire Live allows.',
  'fireflies.speed': 'How fast they fly, on top of what the music does.',
  music: 'Hold: everything painted here stays for the scene’s stretch; the music only pulses and drops it. Start From: the scene opens the stretch (its place, colors, framing and look), then the show plays on.',
};
/** A detail's hint (looks.js PARAMS) with what its lock does. */
const detailHint = (key) => `${PARAMS[key].hint} ${DETAIL_ROLLED}`;
const LAYER_HINTS = {
  scanlines: 'CRT-style lines over the picture.', mirror: 'The picture folded onto itself.',
  blend: 'The layers blend in new ways (screen, difference, overlay…) instead of their classic ones.',
  ghost: 'Everything that moves leaves a fading trail.', blur: 'The camera’s moves smear the picture.',
  glow: 'Light spills from the bright parts, swelling on the kicks.', gradient: 'The picture recolored by brightness through three colors.',
  paint: 'The picture repainted in brush strokes.', wash: 'The picture washed into flat watercolor patches.',
  flicker: 'The light dips on the beat, a band rolls down, film jitters, or it wavers like a candle.',
  grain: 'Film grain over the picture.', cinema: 'Black bars slide in top and bottom.',
  spotlight: 'A dithered circle of light round the fire, the rest dark.', chroma: 'The color channels drift apart like a cheap lens.',
};
const LOOK_HINTS = {
  ember: 'Clean: just the fire.', glitch: 'Torn rows, an RGB split on the kick, static.', echo: 'The last frame echoes out of the fire like a tunnel.',
  ripple: 'A shockwave ring on every kick.', kaleido: 'A kaleidoscope round the fire.', ink: 'Downbeats flash to 1-bit over scanlines.',
  vortex: 'Echoes turning as they stream out: a spiral.', mosaic: 'Kicks crunch the picture into big pixels.',
  haze: 'Rows shimmer like heat over the fire.', prism: 'The colors split apart on every beat.',
};
/** The fire's shape sliders: [key, label]. */
const FIRE_LABELS = { level: 'Fire Level', size: 'Flame Size', height: 'Flame Height', turbulence: 'Turbulence', glow: 'Glow on the Scene', windX: 'Wind Across', windZ: 'Wind Toward You' };
/** The flame's colors: [key, label]. */
export const RAMP_LABELS = { lo: 'Embers', mid: 'Body', hi: 'Tips', core: 'Core', shade: 'Shade' };
export const SCENE_LABELS = { void: 'Background', shadow: 'Shadow', stone: 'Stone', wood: 'Wood', bone: 'Bone' };
/** The scene palette's slots (palette.js scenePalette), as the slot picker and the gradient name them. */
export const SLOT_NAMES = ['Background', 'Shadow', 'Stone', 'Wood', 'Bone', 'Embers', 'Body', 'Tips', 'Core', 'Shade'];

// --- pieces -------------------------------------------------------------------------------
/** A field from src/ui/fields.js, bound to a scene path instead of a setting. */
const sc = (html) => html.replace(/ data-set="/g, ' data-scene="');
const numeric = (html) => html.replace('<select ', '<select data-num ');
const unset = (html) => html.replace('<select ', '<select data-unset ');
const hintOf = (path) => HINTS[path] ?? '';
const rangeAt = (path, label, o = {}) => {
  const [min, max, step, unit] = SCENE_RANGES[path];
  return sc(range(path, label, min, max, step, { hint: hintOf(path), unit: unit ?? '', ...o }));
};
const selectAt = (path, label, opts, o = {}) => sc(select(path, label, opts, { hint: hintOf(path), ...o }));

/** A small pixel icon (the lock's pin or die, the section fold's arrow). */
const ICONS = {
  pin: '<svg viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges"><path d="M2 0h3v1H2zM1 1h5v3H1zM3 4h1v3H3z"/></svg>',
  die: '<svg viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 0h7v7H0z" fill-opacity=".35"/><path d="M1 1h1v1H1zM5 1h1v1H5zM3 3h1v1H3zM1 5h1v1H1zM5 5h1v1H5z"/></svg>',
  fold: '<svg viewBox="0 0 5 5" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 1h5v1H0zM1 2h3v1H1zM2 3h1v1H2z"/></svg>',
};

/** Swatches (a few colors side by side). */
export const swatches = (colors) => `<span class="pnt-sw" aria-hidden="true">${colors.map((c) => `<i style="--c:${esc(c)}"></i>`).join('')}</span>`;

/**
 * A choice as a button: picking it sets `path` to `value`. `audition`: hovering it shows it
 * on the stage.
 * @param {string} path @param {unknown} value @param {string} label
 * @param {{ audition?: boolean, colors?: string[] | null, cls?: string, pressedWhenMissing?: boolean }} [o]
 */
export function chip(path, value, label, { audition = true, colors = null, cls = '', pressedWhenMissing = false } = {}) {
  return `<button type="button" class="pnt-chip${cls ? ` ${cls}` : ''}" data-pick="${esc(path)}" data-value="${esc(JSON.stringify(value))}"${audition ? ' data-audition' : ''}${pressedWhenMissing ? ' data-missing' : ''} aria-pressed="false">${colors ? swatches(colors) : ''}<span>${esc(label)}</span></button>`;
}
/** A field's label with its "?" (for groups of chips, which have no single input). */
const groupHead = (label, hint) => {
  const t = tip(hint);
  return `<p class="viz-field-label">${esc(label)} ${t.mark}</p>`;
};
/**
 * A row of color inputs under one label, and one hint that each reads out: the "?" is only
 * for the eye (not a stop of its own), lit while any of them has the keyboard's focus.
 */
function colorRow(label, hint, base, labels) {
  const t = tip(hint, { control: true });
  return `<div data-tip-group><p class="viz-field-label">${esc(label)} ${t.mark}</p>
      <div class="pnt-ramp">${Object.entries(labels).map(([key, name]) => `<label class="pnt-swatch" data-group-tip><input type="color" data-scene="${base}.${key}" aria-label="${esc(name)}"${t.ref}><span>${esc(name)}</span></label>`).join('')}</div></div>`;
}
/** Off / In the Mix / Always as three chips. `missing`: the mode a missing value means. */
function modeChips(path, label, hint, { audition = true, missing = 'off' } = {}) {
  const t = tip(hint);
  return `<div class="pnt-mode" role="group" aria-label="${esc(label)}">
    <span class="pnt-mode-name">${esc(label)} ${t.mark}</span>
    <span class="pnt-seg">${MODES.map(([id, name]) => chip(path, id, name === 'In the mix' ? 'In the Mix' : name, { audition, pressedWhenMissing: id === missing, cls: 'pnt-seg-btn' })).join('')}</span>
  </div>`;
}
/**
 * Each knight's helmet, under one label and one hint that each select reads out: the "?"
 * is only for the eye (not a stop of its own), lit while any of them has the keyboard's
 * focus. Every row is drawn; those past `count` wait, hidden.
 */
function helmetRows(count) {
  const t = tip(HINTS['knights.helmets'], { control: true });
  const opts = [['', 'Drawn at Random'], ...Object.entries(HELMET_NAMES)];
  return `<div class="pnt-helmets" data-tip-group><p class="viz-field-label">Helmets ${t.mark}</p>
      ${Array.from({ length: MAX_KNIGHTS }, (_, i) => `<div class="pnt-helmet" data-helmet="${i}"${i < count ? '' : ' hidden'}>${
    sc(select(`knights.helmets.${i}`, `Knight ${i + 1}`, opts)).replace('<label class="viz-field"', '<label class="viz-field" data-group-tip').replace('<select ', `<select${t.ref} `)
  }</div>`).join('')}</div>`;
}
/** A detail a look or a layer rolls, with its lock. */
function detailField(key, path, scene) {
  const spec = PARAMS[key];
  const pinned = getPath(scene, path) !== undefined;
  const lock = `<button type="button" class="pnt-lock" data-lock="${esc(path)}" aria-pressed="${pinned}" aria-label="${esc(spec.label)}: ${pinned ? 'pinned (click to leave it to the dice)' : 'rolled each turn (click to pin it)'}">${pinned ? ICONS.pin : ICONS.die}</button>`;
  let field;
  if (spec.slots) {
    const t = tip(detailHint(key), { control: true }); // (each slot reads it out: the "?" is only for the eye)
    field = `<div class="viz-field"><span class="viz-field-label">${esc(spec.label)} ${t.mark}</span><span class="pnt-slots3">${
      Array.from({ length: spec.slots }, (_, i) => `<select data-scene="${esc(path)}.${i}" data-num aria-label="${esc(spec.label)} ${i + 1}"${t.ref}>${SLOT_NAMES.map((n, s) => `<option value="${s}">${esc(n)}</option>`).join('')}</select>`).join('')
    }</span></div>`;
  } else if (spec.bool) field = sc(check(path, esc(spec.label), { hint: detailHint(key) }));
  else if (spec.values) field = numeric(sc(select(path, spec.label, spec.values.map((v, i) => [String(v), spec.names?.[i] ?? String(v)]), { hint: detailHint(key) })));
  else field = sc(range(path, spec.label, spec.range[0], spec.range[1], spec.step ?? 0.01, { hint: detailHint(key) }));
  return `<div class="pnt-detail${pinned ? '' : ' is-rolled'}" data-detail="${esc(path)}">${field}${lock}</div>`;
}
/** A checklist of names for a list the scene may leave to the show (null). */
function pickList(path, label, names, hint, list) {
  const t = tip(hint);
  const own = Array.isArray(list);
  return `<div class="pnt-list" data-list="${esc(path)}">
    <p class="viz-field-label">${esc(label)} ${t.mark}</p>
    <label class="viz-check"><input type="checkbox" data-list-show="${esc(path)}"${own ? '' : ' checked'}><span>The Show’s Moves</span></label>
    ${own ? `<div class="viz-checks">${Object.entries(names).map(([id, name]) => `<label class="viz-check"><input type="checkbox" data-list-item="${esc(id)}"${list.includes(id) ? ' checked' : ''}><span>${esc(name)}</span></label>`).join('')}</div>` : ''}
  </div>`;
}
/** A folding section of the panel. */
function section(id, name, body, open) {
  return `<section class="pnt-sec" data-sec="${id}"${open ? ' data-open' : ''} aria-labelledby="pnt-h-${id}">
    <h2 class="pnt-sec-head"><button type="button" id="pnt-h-${id}" data-sec-toggle="${id}" aria-expanded="${open}" aria-controls="pnt-b-${id}"><span>${esc(name)}</span>${ICONS.fold}</button></h2>
    <div class="pnt-sec-body" id="pnt-b-${id}"${open ? '' : ' hidden'}>${body}</div>
  </section>`;
}

/**
 * Chips for flames (the site's, or ones suggested from a color): each shows its ramp,
 * hovers onto the fire, and sets the scene's flame colors when clicked.
 * @param {{ label: string, colors: { lo: string, mid: string, hi: string, core: string, shade: string, light?: number } }[]} list
 * @param {number} [light]  the light the flames take (the scene's own when they have none)
 */
export function flameChips(list, light = 0.34) {
  return list.map(({ label, colors }) => {
    const flame = { lo: colors.lo, mid: colors.mid, hi: colors.hi, core: colors.core, shade: colors.shade, light: colors.light ?? light };
    return chip('colors.flame', flame, label, { colors: [flame.lo, flame.mid, flame.hi, flame.core] });
  }).join('');
}
/** Chips for scenery palettes (suggested from a color): hover onto the scene, click to use. */
export function sceneryChips(list) {
  return list.map(({ label, colors }) => chip('colors.scenery', colors, label, { colors: [colors.void, colors.shadow, colors.stone, colors.wood, colors.bone] })).join('');
}

/**
 * The scene's palette slots' colors (palette.js scenePalette: the scenery's five, the
 * flame's ramp and shade), for the slot picker and the gradient's swatches.
 * @param {any} scene
 * @param {Record<string, string>} siteBase  the site's scenery colors (for a scene on its own)
 */
export function slotColors(scene, siteBase = SITE_BASE) {
  const s = scene.colors.scenery ?? siteBase;
  const f = scene.colors.flame;
  return [s.void, s.shadow, s.stone, s.wood, s.bone, f.lo, f.mid, f.hi, f.core, f.shade];
}
/** The site's scenery colors when the page doesn't say (palette.js base). */
const SITE_BASE = { void: '#07070b', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };

/**
 * What the panel's layout depends on (not its values): when this changes it's drawn again.
 * (How many knights isn't: every helmet row is drawn, the ones past the count hidden, so
 * a drag on the count keeps its slider.)
 * @param {any} scene
 */
export function panelShape(scene) {
  return JSON.stringify([
    scene.look.name, Object.keys(scene.look.params).sort(), scene.layers, Object.keys(scene.details).sort(),
    !!scene.colors.scenery, scene.drops === null, Array.isArray(scene.render.palette), scene.knights.count > 0,
    Array.isArray(scene.knights.moves), Array.isArray(scene.fireflies.moves), 'style' in scene.knights,
    scene.camera.move.kind === 'still',
  ]);
}

/**
 * The panel's markup for `scene`.
 * @param {any} scene
 * @param {{
 *   weapons?: Record<string, string>, elements?: Record<string, string>,
 *   flames?: { key: string, name: string, colors: { lo: string, mid: string, hi: string, core: string, shade: string, light?: number } }[],
 *   shots?: { key: string, name: string, camera: object }[],
 *   siteBase?: Record<string, string>, open?: Iterable<string>, styles?: Record<string, string>,
 * }} [ctx]  the page's lists (weapons by key, the site's flames, Bonfire Live's shots), the
 *   site's scenery colors, and which sections are open (default: Place)
 */
export function panelMarkup(scene, ctx = {}) {
  const open = new Set(ctx.open ?? ['place']);
  const weapons = ctx.weapons ?? {};
  const elementNames = ctx.elements ?? Object.fromEntries(ELEMENT_IDS.map((id) => [id, id]));
  const siteBase = ctx.siteBase ?? SITE_BASE;
  const k = scene.knights;
  const body = {};

  body.place = `
    <div>${groupHead('Scenery', HINTS['place.scenery'])}
      <div class="pnt-chips">${Object.entries(SCENERIES).map(([id, name]) => chip('place.scenery', id, name, { audition: false, cls: 'pnt-place' })).join('')}</div></div>
    ${selectAt('place.weapon', 'Weapon', [['', 'Drawn by the Show'], ...Object.entries(weapons)])}
    ${selectAt('place.element', 'Element', [['', 'Drawn by the Show'], ...ELEMENT_IDS.map((id) => [id, elementNames[id] ?? id])])}`;

  const flameList = (ctx.flames ?? []).map((f) => ({ label: f.name, colors: f.colors }));
  // (The scheme reads its hint out; the "?" beside Make a Flame is the one for the eye.)
  const schemeTip = tip(HINTS['colors.scheme'], { control: true });
  body.colors = `
    <div>${groupHead('The Site’s Flames', HINTS['colors.flames'])}
      <div class="pnt-chips pnt-flames">${flameChips(flameList, scene.colors.flame.light)}</div></div>
    <div class="pnt-make">${groupHead('Make a Flame', HINTS['colors.make'])}
      <div class="pnt-row">
        <button type="button" class="pix-btn" data-paint-act="flame-harmonious">Harmonious</button>
        <button type="button" class="pix-btn" data-paint-act="flame-random">Fully Random</button>
        <label class="pnt-inline"><span class="visually-hidden">Scheme</span><select data-flame-scheme aria-label="Color scheme"${schemeTip.ref}>${[['auto', 'Any Scheme'], ...SCHEMES.map((s) => [s.id, s.label])].map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label><span class="visually-hidden" id="${schemeTip.id}">${esc(HINTS['colors.scheme'])}</span>
      </div></div>
    <div>${groupHead('From a Color', HINTS['colors.seed'])}
      <div class="pnt-row"><input type="color" class="pnt-color" data-seed="flame" aria-label="A color to build flames round" value="${esc(scene.colors.flame.mid)}"></div>
      <div class="pnt-chips pnt-flames" data-suggest="flame"></div></div>
    <div>${colorRow('The Flame’s Colors', HINTS['colors.ramp'], 'colors.flame', RAMP_LABELS)}
      <p class="pnt-note" data-readable hidden>The tips were lightened to stay readable.</p></div>
    ${rangeAt('colors.flame.light', 'Light Toward White')}
    <div>${groupHead('Scenery Colors', HINTS['colors.scenery'])}
      <div class="pnt-chips">
        ${chip('colors.scenery', null, 'The Site’s Own', { colors: [siteBase.void, siteBase.shadow, siteBase.stone, siteBase.wood, siteBase.bone] })}
        <button type="button" class="pix-btn" data-paint-act="scenery-harmonious">Harmonious</button>
        <button type="button" class="pix-btn" data-paint-act="scenery-vivid">Vivid</button>
        <button type="button" class="pix-btn" data-paint-act="scenery-random">Fully Random</button>
      </div></div>
    <div>${groupHead('Scenery From a Color', HINTS['colors.scenery.seed'])}
      <div class="pnt-row"><input type="color" class="pnt-color" data-seed="scenery" aria-label="A color to build scenery colors round" value="${esc((scene.colors.scenery ?? siteBase).stone)}"></div>
      <div class="pnt-chips" data-suggest="scenery"></div></div>
    ${scene.colors.scenery ? `<div>${colorRow('The Scenery’s Colors', HINTS['colors.scenery.edit'], 'colors.scenery', SCENE_LABELS)}
      <p class="pnt-note" data-darkest hidden>The background was darkened: it’s the darkest color (the outlines’).</p></div>` : ''}
    <div class="pnt-sub">${groupHead('The Fire’s Shape', 'Added to what the music does to the fire, every frame: 0 leaves it to the music.')}
      ${FIRE_KEYS.map((key) => rangeAt(`fire.${key}`, FIRE_LABELS[key])).join('')}</div>`;

  body.camera = `
    <p class="pnt-help">${esc(HINTS['camera.drag'])}</p>
    <div>${groupHead('Start From a Shot', HINTS['camera.shots'])}
      <div class="pnt-chips">${(ctx.shots ?? []).map((s) => chip('camera', s.camera, s.name)).join('')}</div></div>
    ${rangeAt('camera.fov', 'Lens')}
    ${rangeAt('camera.roll', 'Tilt')}
    ${selectAt('camera.move.kind', 'Move', Object.entries(CAMERA_MOVES))}
    ${scene.camera.move.kind === 'still' ? '' : `${rangeAt('camera.move.amount', 'Move Amount')}
    ${numeric(selectAt('camera.move.bars', 'One Cycle Takes', MOVE_BARS.map((b) => [String(b), `${b} bars`])))}`}`;

  const lookParams = LOOK_PARAMS[scene.look.name] ?? [];
  body.look = `
    <div>${groupHead('Look', HINTS['look.name'])}
      <div class="pnt-chips pnt-looks">${Object.entries(LOOKS).map(([id, name]) => chip('look.name', id, name, { cls: 'pnt-look' })).join('')}</div>
      <p class="pnt-help" data-look-hint>${esc(LOOK_HINTS[scene.look.name] ?? '')}</p></div>
    ${lookParams.map((key) => detailField(key, `look.params.${key}`, scene)).join('')}
    ${rangeAt('look.amount', 'Look Strength')}`;

  const blendOn = (scene.layers.blend ?? 'off') !== 'off';
  body.layers = `
    <div class="pnt-row pnt-pin-all"><button type="button" class="pix-btn" data-paint-act="pin-all">Pin What You See</button>${tip(HINTS['layers.pin']).mark}</div>
    ${Object.entries(LAYERS).map(([id, name]) => {
      const m = scene.layers[id] ?? 'off';
      const details = m === 'off' ? [] : LAYER_DETAILS[id];
      return `<div class="pnt-layer${m === 'off' ? '' : ' is-on'}" data-layer="${id}">
        ${modeChips(`layers.${id}`, name, `${LAYER_HINTS[id]} ${MODE_HINT}`)}
        ${details.length ? `<div class="pnt-details">${details.map((key) => detailField(key, `details.${key}`, scene)).join('')}</div>` : ''}
      </div>`;
    }).join('')}
    ${blendOn ? `<div class="pnt-sub">${groupHead('How Each Layer Blends', HINTS['layers.blends'])}
      ${Object.entries(LAYER_BLENDS).map(([id, list]) => unset(sc(select(`blends.${id}`, BLEND_LABELS[id], [['', 'Rolled Each Turn'], ...list.map((b) => [b, BLEND_NAMES[b] ?? b])], { hint: `How the ${BLEND_LABELS[id].toLowerCase()} lies over the picture. ${HINTS['layers.blends']}` })))).join('')}</div>` : ''}`;

  body.drops = `
    <div>${groupHead('Drop Hits', HINTS['drops.kind'])}
      <div class="pnt-chips">${chip('drops', null, 'The Show’s Drop Hits', { audition: false })}<button type="button" class="pnt-chip" data-paint-act="drops-own" aria-pressed="${scene.drops !== null}"><span>The Scene’s Own</span></button></div></div>
    ${scene.drops ? `<div class="pnt-sub">${Object.entries(DROP_FX).map(([id, name]) => modeChips(`drops.fx.${id}`, name, `${HINTS['drops.fx']}`, { audition: false })).join('')}
      ${numeric(selectAt('drops.count', 'Hits per Drop', [['1', 'One'], ['2', 'Up to Two'], ['3', 'Up to Three']]))}</div>` : ''}`;

  const slots = slotColors(scene, siteBase);
  const few = Array.isArray(scene.render.palette);
  body.render = `
    ${numeric(selectAt('render.pixelSize', 'Pixel Size', PIXEL_SIZES.map((px) => [String(px), `${px} px${px === 4 ? ' (the site)' : ''}`])))}
    ${selectAt('render.palette', 'Palette', [...Object.entries(PALETTES), ['few', 'A Few of the Scene’s Colors']])}
    ${few ? `<div>${groupHead('The Few Colors', HINTS['render.slots'])}
      <div class="pnt-slots">${slots.map((c, i) => `<button type="button" class="pnt-slot" data-slot="${i}" aria-pressed="${scene.render.palette.includes(i)}"${i === 0 ? ' disabled' : ''} aria-label="${esc(SLOT_NAMES[i])}"><i style="--c:${esc(c)}"></i></button>`).join('')}</div></div>` : ''}
    ${rangeAt('render.dither', 'Dither')}
    ${numeric(selectAt('render.ditherMatrix', 'Dither Pattern', [['4', '4×4 (as on the site)'], ['8', '8×8 (finer)']]))}
    ${modeChips('render.outlines', 'Outlines', HINTS['render.outlines'], { missing: 'on' })}
    ${rangeAt('render.vignette', 'Vignette')}
    ${rangeAt('render.exposure', 'Exposure')}
    ${selectAt('render.fog', 'Fog', Object.entries(FOGS))}
    ${sc(check('render.shadows', 'The Fire Casts Shadows', { hint: HINTS['render.shadows'] }))}
    ${numeric(selectAt('render.flameFps', 'Flame Frame Rate', FLAME_FPS.map((f) => [String(f), `${f} fps`])))}
    ${selectAt('render.xray', 'X-Ray View', [['', 'Off: the Finished Picture'], ...Object.entries(XRAY_VIEWS)])}`;

  const styleNames = ctx.styles ?? STYLE_NAMES;
  body.knights = `
    ${rangeAt('knights.count', 'Knights by the Fire')}
    ${k.count ? `
    ${helmetRows(k.count)}
    ${'style' in k ? selectAt('knights.style', 'Style', [['', 'Bonfire Live’s Own'], ['mix', 'In the Mix'], ...Object.entries(styleNames)]) : ''}
    ${selectAt('knights.finish', 'Armor Finish', [['mix', 'In the Mix'], ...Object.entries(FINISH_NAMES)])}
    ${modeChips('knights.glow', 'Edge Glow', HINTS['knights.glow'], { audition: false, missing: 'mix' })}
    ${rangeAt('knights.rim', 'Glow Strength')}
    ${selectAt('knights.seat', 'Seat Pose', Object.entries(KNIGHT_SEATS))}
    ${modeChips('knights.dance', 'Dance', HINTS['knights.dance'], { audition: false })}
    ${selectAt('knights.formation', 'Formation', [...Object.entries(FORMATIONS), ['mix', 'A New One Each Dance']])}
    ${pickList('knights.moves', 'Moves', KNIGHT_MOVES, HINTS['knights.moves'], k.moves)}
    ${modeChips('knights.shine', 'Armor Shine', HINTS['knights.shine'], { audition: false })}
    ${modeChips('knights.reactions', 'Reactions', HINTS['knights.reactions'], { audition: false })}
    <div>${groupHead('Try a Gesture', HINTS['knights.gestures'])}
      <div class="pnt-chips">${Object.entries(GESTURE_NAMES).map(([id, name]) => `<button type="button" class="pix-btn" data-paint-act="gesture" data-gesture="${esc(id)}">${esc(name)}</button>`).join('')}</div></div>` : ''}`;

  body.flies = `
    ${rangeAt('fireflies.lit', 'Fireflies Lit')}
    ${selectAt('fireflies.show', 'Light Show', Object.entries(FLY_SHOWS))}
    ${pickList('fireflies.moves', 'Moves', FLY_MOVES, HINTS['fireflies.moves'], scene.fireflies.moves)}
    ${rangeAt('fireflies.speed', 'Speed')}`;

  body.music = `
    <div>${groupHead('With the Music', HINTS.music)}
      <div class="pnt-chips">${Object.entries(MUSIC).map(([id, name]) => chip('music', id, name, { audition: false })).join('')}</div>
      <p class="pnt-help">The Painter always previews a scene held. A scene that starts the stretch opens like this in Bonfire Live, then the show takes over.</p></div>`;

  return `
    <nav class="pnt-tabs" aria-label="Panel sections">${SECTIONS.map(([id, name]) => `<button type="button" data-sec-tab="${id}" aria-pressed="${open.has(id)}">${esc(name)}</button>`).join('')}</nav>
    ${SECTIONS.map(([id, name]) => section(id, name, body[id], open.has(id))).join('')}`;
}
const BLEND_LABELS = { feed: 'Echoes', ghost: 'Ghost Trail', warp: 'Warps', ink: 'Ink', invert: 'Negative', scan: 'Scanlines', glow: 'Glow', gradient: 'Gradient Map' };
const BLEND_NAMES = {
  normal: 'Normal', add: 'Add', subtract: 'Subtract', multiply: 'Multiply', screen: 'Screen', darken: 'Darken', lighten: 'Lighten',
  overlay: 'Overlay', hardLight: 'Hard Light', softLight: 'Soft Light', difference: 'Difference', exclusion: 'Exclusion',
};

// --- binding ----------------------------------------------------------------------------
const decimals = (step) => { const s = String(step); return s.includes('.') ? s.split('.')[1].length : 0; };
/** What names a focusable thing in the panel (so a redraw can focus it again). */
const FOCUS_ATTRS = ['data-scene', 'data-pick', 'data-value', 'data-lock', 'data-sec-toggle', 'data-sec-tab', 'data-paint-act', 'data-gesture', 'data-slot',
  'data-list-show', 'data-list-item', 'data-seed', 'data-flame-scheme', 'data-tip'];
/** How long a field stays "under the hand" after the user moves it (ms): fill() leaves it be. */
const HAND_MS = 300;
/** A "?" hint's margin inside the panel (px). */
const TIP_PAD = 8;

/**
 * Wire a panel drawn by panelMarkup into `root`.
 * @param {HTMLElement} root
 * @param {{
 *   get: () => any,
 *   edit: (path: string, value: unknown, o?: { key?: string | null }) => void,
 *   audition: (scene: any | null) => void,
 *   act: (name: string, el: HTMLElement) => void,
 *   live?: () => any,
 *   ctx: () => object,
 *   onSection?: (id: string, open: boolean) => void,
 * }} o
 *   `get` the scene; `edit` changes one path (`key`: which field, for undo's merging);
 *   `audition` shows a scene on the stage for a moment (null: back to the scene); `act` an
 *   action button; `live` what the look is doing now (looks.js details); `ctx` panelMarkup's.
 */
export function bindPanel(root, { get, edit, audition, act, live = () => null, ctx, onSection = () => {} }) {
  let shape = '';
  const open = new Set(['place']);
  let auditioning = null;
  let dragging = null;    // the slider a pointer is down on (a redraw waits for it)
  let drawLater = false;  // a redraw that waited
  let handAt = 0;         // when the focused field was last moved by the user (performance.now)

  /**
   * What the focused element in the panel is, as a selector that finds it again in a fresh
   * drawing (its path, its chip's value, its lock, its button), or null.
   */
  function focusKey() {
    const el = /** @type {HTMLElement | null} */ (document.activeElement);
    if (!el || el === root || !root.contains(el)) return null;
    const own = FOCUS_ATTRS.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
    if (!own) return null;
    // (A move in a list is named by its list: the knights' and the fireflies' share ids.)
    const list = /** @type {HTMLElement | null} */ (el.closest('[data-list]'));
    return list && el.hasAttribute('data-list-item') ? `[data-list="${CSS.escape(list.dataset.list)}"] ${own}` : own;
  }

  function draw() {
    const scene = get();
    const scroll = root.scrollTop;
    const focus = focusKey();
    root.innerHTML = panelMarkup(scene, { ...ctx(), open });
    shape = panelShape(scene);
    drawLater = false;
    root.scrollTop = scroll;
    if (focus) /** @type {HTMLElement | null} */ (root.querySelector(focus))?.focus({ preventScroll: true });
    fill({ force: true });
  }

  /**
   * Every value from the scene (and the rolled details from what's on screen). The field
   * under the user's hand (focused, and dragged or moved in the last moment) keeps what it
   * shows, unless `force` (undo and redo: the scene went back, the field goes with it).
   * @param {{ force?: boolean }} [o]
   */
  function fill({ force = false } = {}) {
    const scene = get();
    if (panelShape(scene) !== shape) {
      if (!dragging) { draw(); return; }
      drawLater = true; // (the drag ends first: its slider stays under the pointer)
    }
    const now = live();
    const busy = (input) => !force && input === document.activeElement && input.type !== 'checkbox' && input.tagName !== 'SELECT'
      && (input === dragging || performance.now() - handAt < HAND_MS);
    for (const el of root.querySelectorAll('[data-scene]')) {
      const input = /** @type {HTMLInputElement} */ (el);
      const path = input.dataset.scene;
      let v = getPath(scene, path);
      const rolled = v === undefined && /^(details|look\.params)\./.test(path);
      if (rolled) v = liveValue(now, path);
      if (path === 'render.palette') v = Array.isArray(v) ? 'few' : v;
      if (!busy(input)) { // (not under the user's hand; its number follows it all the same)
        if (input.type === 'checkbox') input.checked = !!v;
        else input.value = v === null || v === undefined ? '' : String(v);
      }
      const out = root.querySelector(`[data-out="${CSS.escape(path)}"]`);
      if (out && typeof v === 'number') out.textContent = v.toFixed(decimals(input.step || '0.01'));
    }
    for (const b of root.querySelectorAll('[data-pick]')) {
      const btn = /** @type {HTMLElement} */ (b);
      const v = getPath(scene, btn.dataset.pick);
      const pressed = v === undefined ? btn.hasAttribute('data-missing') : JSON.stringify(v) === btn.dataset.value;
      btn.setAttribute('aria-pressed', String(pressed));
    }
    // As many helmet rows as knights.
    for (const row of root.querySelectorAll('[data-helmet]')) /** @type {HTMLElement} */ (row).hidden = Number(/** @type {HTMLElement} */ (row).dataset.helmet) >= scene.knights.count;
    // The few colors: which are picked, in the scene's colors now.
    if (Array.isArray(scene.render.palette)) {
      const cols = slotColors(scene, /** @type {any} */ (ctx()).siteBase);
      for (const b of root.querySelectorAll('[data-slot]')) {
        const i = Number(/** @type {HTMLElement} */ (b).dataset.slot);
        b.setAttribute('aria-pressed', String(scene.render.palette.includes(i)));
        /** @type {HTMLElement} */ (b.firstElementChild)?.style.setProperty('--c', cols[i]);
      }
    }
    // (The page says when the rules moved a color: the tips lightened, the background darkened.)
    const readable = /** @type {HTMLElement | null} */ (root.querySelector('[data-readable]'));
    if (readable) readable.hidden = !root.dataset.lightened;
    const darkest = /** @type {HTMLElement | null} */ (root.querySelector('[data-darkest]'));
    if (darkest) darkest.hidden = !root.dataset.darkened;
  }
  // A slider held: a redraw its edits call for waits until it's let go.
  root.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches?.('input[type="range"]')) dragging = t;
  });
  const letGo = () => {
    if (!dragging) return;
    dragging = null;
    handAt = performance.now();
    if (drawLater) fill();
  };
  window.addEventListener('pointerup', letGo);
  window.addEventListener('pointercancel', letGo);

  /**
   * Keep a "?" hint's box inside the panel: shifted left when it hangs from a mark near the
   * right edge, opened downward when there's no room above. (A field's hint spans its field,
   * visualizer.css: it only ever needs the flip.)
   * @param {HTMLElement} mark
   */
  function placeTip(mark) {
    const box = root.getBoundingClientRect();
    const own = getComputedStyle(mark).position !== 'static'; // (else it hangs from its field)
    const anchor = own ? mark : /** @type {HTMLElement} */ (mark.offsetParent ?? mark);
    const at = anchor.getBoundingClientRect();
    const after = getComputedStyle(mark, '::after');
    const h = parseFloat(after.height) || 90;
    if (own) {
      const w = parseFloat(after.width) || 270;
      const right = box.right - (root.offsetWidth - root.clientWidth) - TIP_PAD; // (inside the scrollbar)
      const left = Math.max(box.left + TIP_PAD, Math.min(at.left - 10, right - w));
      mark.style.setProperty('--tip-x', `${Math.round(left - at.left)}px`);
    }
    const above = at.top - box.top - TIP_PAD;
    const below = box.bottom - at.bottom - TIP_PAD;
    mark.toggleAttribute('data-tip-below', above < h + 8 && below > above);
  }
  // (Placed as it's about to show: the "?" hovered or focused, or its field focused.)
  const tipOf = (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const own = t.closest?.('.viz-tip');
    // (Focused: its field's "?"; a row of a group, data-group-tip, shows the group's.)
    const field = own || e.type !== 'focusin' ? null
      : t.closest?.('[data-group-tip]') ? t.closest('[data-tip-group]') : t.closest?.('.viz-field, .viz-check, .viz-mode, .pnt-mode, [data-tip-group]');
    return /** @type {HTMLElement | null} */ (own ?? field?.querySelector('.viz-tip') ?? null);
  };
  root.addEventListener('pointerover', (e) => { const m = tipOf(e); if (m) placeTip(m); });
  root.addEventListener('focusin', (e) => { const m = tipOf(e); if (m) placeTip(m); });
  /** What a rolled detail is on screen now (looks.js details), for its dimmed field. */
  function liveValue(now, path) {
    if (!now) return undefined;
    const key = path.split('.').pop();
    const at = path.match(/^details\.grad\.(\d)$/);
    if (at) return now.p?.grad?.[Number(at[1])];
    if (path.startsWith('look.params.')) return now[key];
    if (key === 'scan' || key === 'mirror') return now[key];
    return now.p?.[key];
  }
  /** Just the rolled details' values (they change with each look's turn). */
  function refreshLive() {
    const now = live();
    if (!now) return;
    for (const d of root.querySelectorAll('.pnt-detail.is-rolled [data-scene]')) {
      const input = /** @type {HTMLInputElement} */ (d);
      if (input === document.activeElement) continue;
      const v = liveValue(now, input.dataset.scene);
      if (v === undefined) continue;
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = String(v);
      const out = root.querySelector(`[data-out="${CSS.escape(input.dataset.scene)}"]`);
      if (out && typeof v === 'number') out.textContent = v.toFixed(decimals(input.step || '0.01'));
    }
  }

  /** An input's value as the scene keeps it. */
  function read(input) {
    const path = input.dataset.scene;
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'range' || input.type === 'number') return Number(input.value);
    const v = input.value;
    if (input.tagName === 'SELECT') {
      if (v === '') return input.hasAttribute('data-unset') ? undefined : null;
      if (input.hasAttribute('data-num')) return Number(v);
      if (path === 'render.palette' && v === 'few') {
        const cur = get().render.palette;
        return Array.isArray(cur) ? cur : [0, 6, 8];
      }
    }
    return v;
  }
  /** Set one path; a rolled detail's slot of the gradient pins the whole gradient first. */
  function editInput(input) {
    const path = input.dataset.scene;
    const grad = path.match(/^details\.grad\.(\d)$/);
    if (grad && getPath(get(), 'details.grad') === undefined) {
      const now = live()?.p?.grad ?? [0, 6, 8];
      const g = [...now];
      g[Number(grad[1])] = Number(input.value);
      edit('details.grad', g, { key: 'details.grad' });
      return;
    }
    edit(path, read(input), { key: path });
  }
  root.addEventListener('input', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    handAt = performance.now();
    if (input.dataset?.scene && input.type !== 'checkbox' && input.tagName !== 'SELECT') editInput(input);
    else if (input.dataset?.seed) act(`seed-${input.dataset.seed}`, input);
  });
  root.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input === dragging) letGo();
    if (input.dataset?.scene && (input.type === 'checkbox' || input.tagName === 'SELECT')) editInput(input);
    else if (input.dataset?.scene) edit(input.dataset.scene, read(input), { key: null }); // (a drag ended: the next is a step of its own)
    else if (input.hasAttribute?.('data-list-show')) {
      const path = input.dataset.listShow;
      edit(path, input.checked ? null : Object.keys(path.startsWith('knights') ? KNIGHT_MOVES : FLY_MOVES), { key: null });
    } else if (input.hasAttribute?.('data-list-item')) {
      const list = /** @type {HTMLElement} */ (input.closest('[data-list]'));
      const path = list.dataset.list;
      const picked = [...list.querySelectorAll('[data-list-item]')].filter((c) => /** @type {HTMLInputElement} */ (c).checked).map((c) => /** @type {HTMLElement} */ (c).dataset.listItem);
      if (!picked.length) { input.checked = true; return; } // (at least one)
      edit(path, picked, { key: null });
    } else if (input.hasAttribute?.('data-flame-scheme')) act('flame-scheme', input);
  });
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const pick = /** @type {HTMLElement} */ (t.closest('[data-pick]'));
    if (pick) {
      auditioning = null;
      edit(pick.dataset.pick, JSON.parse(pick.dataset.value), { key: null });
      return;
    }
    const lock = /** @type {HTMLElement} */ (t.closest('[data-lock]'));
    if (lock) {
      const path = lock.dataset.lock;
      const cur = getPath(get(), path);
      if (cur !== undefined) edit(path, undefined, { key: null });
      else {
        const v = path === 'details.grad' ? live()?.p?.grad : liveValue(live(), path);
        const input = /** @type {HTMLInputElement} */ (root.querySelector(`[data-scene="${CSS.escape(path)}"]`));
        edit(path, v ?? (input ? read(input) : undefined), { key: null });
      }
      return;
    }
    const slot = /** @type {HTMLElement} */ (t.closest('[data-slot]'));
    if (slot) {
      const i = Number(slot.dataset.slot);
      const cur = get().render.palette;
      if (!Array.isArray(cur) || i === 0) return;
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].slice(0, 4);
      if (next.length >= 2) edit('render.palette', [0, ...next.filter((x) => x !== 0)], { key: null });
      return;
    }
    const toggle = /** @type {HTMLElement} */ (t.closest('[data-sec-toggle]'));
    if (toggle) { setOpen(toggle.dataset.secToggle, !open.has(toggle.dataset.secToggle)); return; }
    const tab = /** @type {HTMLElement} */ (t.closest('[data-sec-tab]'));
    if (tab) {
      // (Phones: one section at a time.)
      for (const id of [...open]) if (id !== tab.dataset.secTab) setOpen(id, false);
      setOpen(tab.dataset.secTab, true);
      return;
    }
    const a = /** @type {HTMLElement} */ (t.closest('[data-paint-act]'));
    if (a) act(a.dataset.paintAct, a);
  });
  // Hover = audition: the chip's scene on the stage while the pointer is on it.
  root.addEventListener('pointerover', (e) => {
    const c = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-audition]'));
    if (!c || c === auditioning || e.pointerType === 'touch') return;
    auditioning = c;
    audition(withPath(get(), c.dataset.pick, JSON.parse(c.dataset.value)));
  });
  root.addEventListener('pointerout', (e) => {
    if (!auditioning) return;
    const to = /** @type {HTMLElement} */ (e.relatedTarget);
    if (to && auditioning.contains(to)) return;
    auditioning = null;
    audition(null);
  });

  function setOpen(id, on) {
    if (on) open.add(id); else open.delete(id);
    const sec = root.querySelector(`[data-sec="${id}"]`);
    if (!sec) return;
    sec.toggleAttribute('data-open', on);
    /** @type {HTMLElement} */ (sec.querySelector('.pnt-sec-body')).hidden = !on;
    sec.querySelector('[data-sec-toggle]').setAttribute('aria-expanded', String(on));
    root.querySelector(`[data-sec-tab="${id}"]`)?.setAttribute('aria-pressed', String(on));
    onSection(id, on);
  }

  draw();
  return {
    fill,
    draw,
    refreshLive,
    /** Open a section (and scroll to it). */
    show(id) { setOpen(id, true); root.querySelector(`[data-sec="${id}"]`)?.scrollIntoView({ block: 'nearest' }); },
    get open() { return [...open]; },
    /** Suggestions for a seed color: chips drawn into the section (flame or scenery). */
    suggest(kind, html) { const el = root.querySelector(`[data-suggest="${kind}"]`); if (el) el.innerHTML = html; },
    /** Whether a hover audition is showing. */
    get auditioning() { return !!auditioning; },
    /** End an audition without waiting for the pointer (a key, a click elsewhere). */
    endAudition() { if (auditioning) { auditioning = null; audition(null); } },
  };
}
