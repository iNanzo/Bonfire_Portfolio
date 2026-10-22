// Rules every saved src/content.json must pass. The admin panel checks them as you
// edit and the admin API enforces them on save, so an edit can't publish something
// the site would choke on: an unsafe link (the renderer throws on those), a bad
// image path, a duplicate project id, a weapon the 3D model doesn't have.
import { isSafeUrl } from './html.js';
import {
  BASE_COLORS,
  CURSOR_MODES,
  DEFAULT_EFFECTS,
  DITHER_MATRICES,
  ELEMENT_IDS,
  KNIGHT_ARRIVALS,
  KNIGHT_FINISHES,
  KNIGHT_HELMETS,
  KNIGHT_SEATS,
  KNIGHT_STYLES,
  RANGES,
} from './effectsDefaults.js';
import { contrast, HEX_RE, ID_RE, isObj, WEAPON_KEYS } from './ruleBasics.js';
import { PIXEL_SIZES } from './pixelSizes.js';
import { validateScenes } from './scenes.js';
import { DIALOGUE_CLIPS, FACE_NAMES } from './invitation/clips.js';
import { LEGACY_SHADER, MOTIONS, STYLES } from './invitation/look.js';
import { PIXEL_SIZES as INVITATION_PIXEL_SIZES } from './invitation/pixels.js';
import { SHADER_CONTROLS } from './invitation/shader.js';
import { LINE_MAX, LINES_MAX, SPEECH_RANGES, TRIGGERS } from './invitation/speech.js';

// The basics moved to ruleBasics.js (so scenes.js can use them); re-exported for everyone
// who imports them from here.
export { contrast, HEX_RE, ID_RE, luminance, slugify, WEAPON_KEYS } from './ruleBasics.js';
// The weapons by kind (the pack's Anvil groups them so), next to the keys they group.
export { WEAPON_GROUPS } from './weaponGroups.js';

export const CONTENT_PATH = 'src/content.json';
export const SECTIONS = [
  'site',
  'screens',
  'weapons',
  'weaponDraw',
  'startingEquipment',
  'hero',
  'sections',
  'featured',
  'projects',
  'archive',
  'about',
  'experience',
  'leadership',
  'education',
  'skills',
  'contact',
  'ui',
  'notFound',
  'effects',
];
/** Screens are wired into the layout and camera; their ids can't change. */
const SCREEN_IDS = ['home', 'projects', 'experience', 'skills', 'about', 'contact'];
/** The fewest weapons a random draw may pick from. */
const MIN_WEAPONS = 3;
const flameIds = (c) => (Array.isArray(c?.effects?.flames) ? c.effects.flames.map((f) => f?.id) : []);
/** Flames a random draw can pick from: it skips the current and the starting flame. */
const MIN_ROTATION = 3;
export const KINDLED_SHOW = ['first', 'always', 'never'];
/** An image's `src`: public/<src>.webp and public/<src>-card.webp. */
export const IMAGE_RE = /^assets\/projects\/[a-z0-9-]+\/[a-z0-9-]+$/;
/** More slots than this and the inventory grid overflows its 4×4 box. */
const GRID_SLOTS = 16;
/** The `ui` texts that head a group in a menu (the pack's lists): each must say something. */
export const UI_HEADINGS = [
  'packSwords',
  'packGreatswords',
  'packPolearms',
  'packAxes',
  'packSpells',
  'packColors',
  'packGestures',
  'packHelmets',
  'packStyles',
  'packFinishes',
];

/** Every project-like entry, in inventory order. */
const inventoryEntries = (c) => [c.featured, ...(c.projects ?? []), ...(c.archive ?? [])].filter(Boolean);

/** A project's images the site shows (hidden ones stay in the repo, off the site). */
export const shownImages = (p) => (Array.isArray(p?.images) ? p.images.filter((im) => !im?.hidden) : []);

/** Every image src the content references. */
export function imageRefs(c) {
  const refs = new Set();
  for (const p of inventoryEntries(c))
    for (const im of Array.isArray(p.images) ? p.images : []) if (typeof im?.src === 'string') refs.add(im.src);
  return refs;
}

/**
 * Check the `effects` section. `err(path, message)` gets paths like
 * `effects.flames[2].hi`. Every number must sit inside RANGES.
 */
export function validateEffects(e, err, base = 'effects') {
  if (!isObj(e)) return err(base, 'Must be a group of fields.');
  const at = (p) => `${base}.${p}`;
  const color = (v, p) => {
    if (typeof v !== 'string' || !HEX_RE.test(v)) err(at(p), 'Use a color like #ff8800.');
  };
  const num = (v, p, pattern = p) => {
    const [min, max] = RANGES[pattern];
    if (typeof v !== 'number' || !Number.isFinite(v)) err(at(p), 'Must be a number.');
    else if (v < min || v > max) err(at(p), `Between ${min} and ${max}.`);
  };
  const group = (key, check) => {
    if (e[key] === undefined) return;
    if (!isObj(e[key])) return err(at(key), 'Must be a group of fields.');
    for (const [k, v] of Object.entries(e[key])) {
      if (!(k in DEFAULT_EFFECTS[key])) err(at(`${key}.${k}`), 'Unknown setting.');
      else check(k, v, `${key}.${k}`);
    }
  };
  const bool = (v, p) => {
    if (typeof v !== 'boolean') err(at(p), 'Must be on or off.');
  };

  group('colors', (k, v, p) => color(v, p));
  const voidColor = HEX_RE.test(e.colors?.void ?? '') ? e.colors.void : DEFAULT_EFFECTS.colors.void;

  if (e.flames !== undefined) {
    if (!Array.isArray(e.flames)) err(at('flames'), 'Must be a list.');
    else {
      const seen = new Set();
      e.flames.forEach((f, i) => {
        const p = `flames[${i}]`;
        if (!isObj(f)) return err(at(p), 'Must be a group of fields.');
        if (typeof f.id !== 'string' || !ID_RE.test(f.id))
          err(at(`${p}.id`), 'Use lowercase letters, numbers and single dashes.');
        else if (seen.has(f.id)) err(at(`${p}.id`), `“${f.id}” is already used by another palette.`);
        else seen.add(f.id);
        if (typeof f.name !== 'string' || !f.name.trim()) err(at(`${p}.name`), 'Can’t be empty.');
        for (const k of ['lo', 'mid', 'hi', 'core', 'shade']) color(f[k], `${p}.${k}`);
        if (HEX_RE.test(f.hi ?? '') && contrast(f.hi, voidColor) < 4.5) {
          err(
            at(`${p}.hi`),
            `Too dark for text on the background (${contrast(f.hi, voidColor).toFixed(1)}:1, needs 4.5:1). Lighten it.`,
          );
        }
        if (f.light !== undefined) num(f.light, `${p}.light`, 'flames[].light');
        if (f.hidden !== undefined) bool(f.hidden, `${p}.hidden`);
      });
      const inRotation = e.flames.filter((f) => isObj(f) && !f.hidden).length;
      if (inRotation < MIN_ROTATION)
        err(
          at('flames'),
          `Keep at least ${MIN_ROTATION} palettes in rotation (not hidden), so a new one can always be drawn.`,
        );
    }
  }

  const numbers = (k, v, p) => num(v, p);
  group('fire', numbers);
  if (isObj(e.fire) && e.fire.lifeMin > e.fire.lifeMax) err(at('fire.lifeMax'), 'Must be at least the shortest life.');
  group('particles', numbers);
  group('fireflies', numbers);
  if (isObj(e.fireflies) && e.fireflies.lit > e.fireflies.count)
    err(at('fireflies.lit'), 'Can’t be more than the number of fireflies.');
  group('cursor', (k, v, p) => {
    if (k === 'mode') {
      if (!CURSOR_MODES.includes(v)) err(at(p), `One of: ${CURSOR_MODES.join(', ')}.`);
    } else num(v, p);
  });
  // (The pixel sizes are the ones every render menu steps through, src/pixelSizes.js.)
  group('render', (k, v, p) => {
    if (k === 'outlines' || k === 'shake') bool(v, p);
    else if (k === 'ditherMatrix') {
      if (!DITHER_MATRICES.includes(v)) err(at(p), `One of: ${DITHER_MATRICES.join(', ')}.`);
    } else if (k === 'pixelSize' || k === 'pixelSizeSmall') {
      if (!PIXEL_SIZES.includes(v)) err(at(p), `One of: ${PIXEL_SIZES.join(', ')} px.`);
    } else num(v, p);
  });
  group('elements', (id, el, p) => {
    if (!isObj(el)) return err(at(p), 'Must be a group of fields.');
    for (const [k, v] of Object.entries(el)) {
      if (k === 'name') {
        if (typeof v !== 'string' || !v.trim() || v.length > 24) err(at(`${p}.name`), 'A name up to 24 characters.');
      } else if (k === 'rotation') bool(v, `${p}.rotation`);
      else if (k === 'weight') num(v, `${p}.weight`);
      else err(at(`${p}.${k}`), 'Unknown setting.');
    }
  });
  if (isObj(e.elements) && ELEMENT_IDS.every((id) => e.elements[id]?.rotation === false)) {
    err(at('elements'), 'Keep at least one element in rotation.');
  }
  group('impact', (k, v, p) => (k === 'marks' ? bool(v, p) : num(v, p)));
  group('lightning', numbers);
  group('ice', numbers);
  // (The helmet, arrival, style, finish and seat are one of their lists; the rest and the edge
  // glow are numbers; show, shine, gestures and reactions are on or off.)
  const KNIGHT_CHOICES = {
    helmet: KNIGHT_HELMETS,
    arrival: KNIGHT_ARRIVALS,
    style: KNIGHT_STYLES,
    finish: KNIGHT_FINISHES,
    seat: KNIGHT_SEATS,
  };
  group('knight', (k, v, p) => {
    if (Object.hasOwn(KNIGHT_CHOICES, k)) {
      if (!KNIGHT_CHOICES[k].includes(v)) err(at(p), `One of: ${KNIGHT_CHOICES[k].join(', ')}.`);
    } else if (RANGES[p]) num(v, p);
    else bool(v, p);
  });
  if (isObj(e.knight) && e.knight.restMin > e.knight.restMax)
    err(at('knight.restMax'), 'Must be at least the shortest rest.');
  for (const k of Object.keys(e)) if (!(k in DEFAULT_EFFECTS)) err(at(k), 'Unknown section.');
  if (isObj(e.colors)) for (const k of BASE_COLORS) if (!(k in e.colors)) err(at(`colors.${k}`), 'Missing color.');
}

/**
 * The styles the invitation toy's Default look can be built on: its presets (looks/), not a
 * Default style of its own (that's what the defaults make).
 */
export const INVITATION_STYLES = STYLES.filter((k) => k !== 'default');
/** A line this long (characters) still fits, but wraps a lot in NEWT's bubble: a warning. */
export const LINE_LONG = 80;

/** The triggers NEWT speaks on, as plain names (content keys). */
const TRIGGER_KEYS = /** @type {string[]} */ (TRIGGERS);

/**
 * The shots a chat box's camera takes (types.js DialogueShot): his head and shoulders, his whole
 * body, the default view, or the camera left as it was.
 */
export const INTRO_CAMERAS = ['close', 'medium', 'wide', 'keep'];
/** What a chat box has him do: one of his dialogue clips (clips.js DIALOGUE_CLIPS), or 'none' (as he was). */
export const INTRO_ANIMATIONS = ['none', ...DIALOGUE_CLIPS];
/** The longest line a chat box types out, in characters. */
export const INTRO_TEXT_MAX = 240;
/**
 * A line longer than this (characters) outgrows the chat box's three lines on a phone (measured at
 * 390×844: 100 fit, 110 take four), growing it up over NEWT: a warning.
 */
export const INTRO_TEXT_LONG = 100;
/** The most choices a box offers (types.js DialogueBox: 2–3 replies). */
export const INTRO_CHOICES_MAX = 3;
/** The fewest that make a choice: one reply alone is only a tap (a warning). */
export const INTRO_CHOICES_MIN = 2;
/** The longest choice, in characters: a button's worth. */
export const INTRO_LABEL_MAX = 60;
/** The longest name on the box's tab, in characters. */
export const INTRO_SPEAKER_MAX = 24;
/** A box's Auto wait in seconds, [min, max, step, unit]: 0 waits by the line's length. */
export const INTRO_AUTO = /** @type {[number, number, number, string]} */ ([0, 15, 0.5, 's']);
/** A chat box's fields, in the order the admin shows them; the first five every box needs. */
const BOX_KEYS = ['id', 'speaker', 'text', 'face', 'animation', 'camera', 'next', 'end', 'auto', 'choices'];
const BOX_NEEDS = ['id', 'text', 'face', 'animation', 'camera'];

/**
 * Check the invitation toy's section (content.json `invitation`): its default look (`defaults`:
 * the look as the toy stores it, src/invitation/look.js, with every Shader value within its
 * control, shader.js SHADER_CONTROLS), its speech settings (`speech`: the quiet spell before an
 * idle line, each trigger's chance and cooldown, speech.js SPEECH_RANGES), its lines (`lines`:
 * each trigger's list of text, at most LINES_MAX of at most LINE_MAX characters) and its intro
 * (`intro`: the chat Play Intro opens, types.js DialogueScript; invitationIntro). Every part is
 * optional, and so is every value outside the intro: the toy falls back on its own (speech.js
 * speechFrom, linesFrom; look.js validLook; content.js introFrom). `err(path, message)` gets
 * paths like `invitation.lines.wave[2]`; `warn` too.
 */
export function validateInvitation(inv, err, warn, base = 'invitation') {
  if (!isObj(inv)) return err(base, 'Must be a group of fields.');
  const at = (p) => `${base}.${p}`;
  const check = {
    at,
    err,
    warn,
    /** A group of fields, or an error. */
    group(v, p) {
      if (isObj(v)) return true;
      err(at(p), 'Must be a group of fields.');
      return false;
    },
    oneOf(v, list, p) {
      if (!list.includes(v)) err(at(p), `One of: ${list.join(', ')}.`);
    },
    bool(v, p) {
      if (typeof v !== 'boolean') err(at(p), 'Must be on or off.');
    },
    /** @param {unknown} v @param {Array<number|string>} range [min, max, …] @param {string} p */
    num(v, range, p) {
      const [min, max] = range;
      if (typeof v !== 'number' || !Number.isFinite(v)) err(at(p), 'Must be a number.');
      else if (v < Number(min) || v > Number(max)) err(at(p), `Between ${min} and ${max}.`);
    },
  };
  for (const k of Object.keys(inv))
    if (!['defaults', 'speech', 'lines', 'intro'].includes(k)) err(at(k), 'Unknown section.');
  if (inv.defaults !== undefined && check.group(inv.defaults, 'defaults')) invitationDefaults(inv.defaults, check);
  if (inv.speech !== undefined && check.group(inv.speech, 'speech')) invitationSpeech(inv.speech, check);
  if (inv.lines !== undefined && check.group(inv.lines, 'lines')) invitationLines(inv.lines, check);
  if (inv.intro !== undefined && check.group(inv.intro, 'intro')) invitationIntro(inv.intro, check);
}

/** The invitation's default look: the stored look's fields, each from its list or a switch. */
function invitationDefaults(d, check) {
  for (const [k, v] of Object.entries(d)) {
    const p = `defaults.${k}`;
    if (k === 'pixelSize') check.oneOf(v, INVITATION_PIXEL_SIZES, p);
    else if (k === 'dither' || k === 'outlines') check.bool(v, p);
    else if (k === 'style') check.oneOf(v, INVITATION_STYLES, p);
    else if (k === 'motion') check.oneOf(v, MOTIONS, p);
    else if (k === 'shader') {
      if (check.group(v, p))
        for (const [key, value] of Object.entries(v)) shaderValue(key, value, `${p}.${key}`, check);
    } else check.err(check.at(p), 'Unknown setting.');
  }
}

/**
 * One Shader value: within its control's range or steps, one of its choices, or a switch; an old
 * switch that's been split (look.js LEGACY_SHADER: the toy still reads it) a switch too, with a
 * warning naming the ones to set instead.
 */
function shaderValue(key, value, p, check) {
  const c = SHADER_CONTROLS.find((x) => x.key === key);
  const split = Object.keys(LEGACY_SHADER).filter((k) => LEGACY_SHADER[k] === key);
  if (!c && split.length) {
    check.bool(value, p);
    const names = split.map((k) => SHADER_CONTROLS.find((x) => x.key === k)?.label ?? k);
    check.warn(check.at(p), `Split into ${names.join(' and ')}: set those instead.`);
  } else if (!c) check.err(check.at(p), 'Unknown setting.');
  else if (c.kind === 'switch') check.bool(value, p);
  else if (c.kind === 'choice')
    check.oneOf(
      value,
      c.options.map((o) => o.value),
      p,
    );
  else if (c.steps) check.oneOf(value, c.steps, p);
  else check.num(value, [c.min, c.max], p);
}

/** The invitation's speech: the quiet spell, then each trigger's chance and cooldown. */
function invitationSpeech(s, check) {
  for (const [k, v] of Object.entries(s)) {
    const p = `speech.${k}`;
    if (k === 'idleMin' || k === 'idleMax') check.num(v, SPEECH_RANGES.idle, p);
    else if (!TRIGGER_KEYS.includes(k)) check.err(check.at(p), 'Unknown trigger.');
    else if (check.group(v, p))
      for (const [key, value] of Object.entries(v)) {
        if (key === 'chance' || key === 'cooldown') check.num(value, SPEECH_RANGES[key], `${p}.${key}`);
        else check.err(check.at(`${p}.${key}`), 'Unknown setting.');
      }
  }
  if (typeof s.idleMin === 'number' && typeof s.idleMax === 'number' && s.idleMin > s.idleMax)
    check.err(check.at('speech.idleMax'), 'Must be at least the shortest quiet spell.');
}

/** The invitation's lines: each trigger's list of short text (a long one is a warning). */
function invitationLines(l, check) {
  for (const [k, list] of Object.entries(l)) {
    const p = `lines.${k}`;
    if (!TRIGGER_KEYS.includes(k)) check.err(check.at(p), 'Unknown trigger.');
    else if (!Array.isArray(list)) check.err(check.at(p), 'Must be a list.');
    else if (list.length > LINES_MAX) check.err(check.at(p), `At most ${LINES_MAX} lines.`);
    else list.forEach((line, i) => lineText(line, check.at(`${p}[${i}]`), check));
  }
}

/** One line: text, not empty, short enough for his bubble. */
function lineText(line, q, check) {
  const n = typeof line === 'string' ? Array.from(line.trim()).length : 0;
  if (typeof line !== 'string') check.err(q, 'Must be text.');
  else if (!n) check.err(q, 'Can’t be empty.');
  else if (n > LINE_MAX) check.err(q, `At most ${LINE_MAX} characters (it has to fit his bubble).`);
  else if (n > LINE_LONG) check.warn(q, `Over ${LINE_LONG} characters: it wraps a lot in his bubble.`);
}

/**
 * The invitation's intro (types.js DialogueScript): the speaker, the start and the chat boxes,
 * each with its id (unique), its line (up to INTRO_TEXT_MAX characters, a warning past
 * INTRO_TEXT_LONG), a face, an animation and
 * a camera from the toy's lists, and the optional speaker, Auto wait, Next, End and choices (at
 * most INTRO_CHOICES_MAX, each a label and the box it leads to; one alone is a warning); every
 * Next, choice and the start a box that's there. Then its flow as the toy plays it (introFlow): a
 * box nothing leads to, and a loop with no choice to leave, are warnings.
 */
function invitationIntro(it, check) {
  const { at, err } = check;
  for (const k of Object.keys(it))
    if (!['speaker', 'start', 'boxes'].includes(k)) err(at(`intro.${k}`), 'Unknown setting.');
  introText(it.speaker, 'intro.speaker', INTRO_SPEAKER_MAX, check);
  if (!Array.isArray(it.boxes)) {
    err(at('intro.boxes'), 'Must be a list of chat boxes.');
    if (typeof it.start !== 'string') err(at('intro.start'), 'Must be the id of a box.');
    return;
  }
  if (!it.boxes.length) err(at('intro.boxes'), 'Add at least one box.');
  /** Each id, at the first box that has it (the one the toy plays: content.js introFrom). */
  const ids = new Map();
  it.boxes.forEach((b, i) => {
    if (isObj(b) && typeof b.id === 'string' && b.id && !ids.has(b.id)) ids.set(b.id, i);
  });
  /** A box's id that has to be there (`pick`: what to say when it's empty), or may be empty. */
  const target = (v, p, pick = '') => {
    if (v === undefined && !pick) return;
    if (typeof v !== 'string') err(at(p), 'Must be the id of a box.');
    else if (!v) {
      if (pick) err(at(p), pick);
    } else if (!ids.has(v)) err(at(p), `No box has the id “${v}”.`);
  };
  target(it.start, 'intro.start', 'Pick the box it starts on.');
  it.boxes.forEach((b, i) => introBox(b, `intro.boxes[${i}]`, i, ids, target, check));
  introFlow(it.boxes, ids, it.start, check);
}

/** How a box's own fields are checked, each when it's there (its id, Next and choices aside). */
const BOX_CHECKS = {
  text: (v, p, check) => {
    introText(v, p, INTRO_TEXT_MAX, check);
    const n = typeof v === 'string' ? Array.from(v.trim()).length : 0;
    if (n > INTRO_TEXT_LONG && n <= INTRO_TEXT_MAX)
      check.warn(check.at(p), `Over ${INTRO_TEXT_LONG} characters: on a phone it outgrows the box’s three lines.`);
  },
  face: (v, p, check) => check.oneOf(v, FACE_NAMES, p),
  animation: (v, p, check) => check.oneOf(v, INTRO_ANIMATIONS, p),
  camera: (v, p, check) => check.oneOf(v, INTRO_CAMERAS, p),
  speaker: (v, p, check) => introText(v, p, INTRO_SPEAKER_MAX, check, false),
  auto: (v, p, check) => check.num(v, INTRO_AUTO, p),
  end: (v, p, check) => check.bool(v, p),
};

/** One chat box: its fields, then what its choices or End make of its Next (introOverrides). */
function introBox(b, p, i, ids, target, check) {
  const { at, err } = check;
  if (!isObj(b)) return err(at(p), 'Must be a group of fields.');
  for (const k of Object.keys(b)) if (!BOX_KEYS.includes(k)) err(at(`${p}.${k}`), 'Unknown setting.');
  for (const k of BOX_NEEDS) if (b[k] === undefined) err(at(`${p}.${k}`), 'Missing.');
  if (b.id !== undefined) {
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) err(at(`${p}.id`), 'Lowercase letters, numbers and dashes.');
    else if (ids.get(b.id) !== i) err(at(`${p}.id`), 'Another box already has this id.');
  }
  for (const [k, checkField] of Object.entries(BOX_CHECKS))
    if (b[k] !== undefined) checkField(b[k], `${p}.${k}`, check);
  target(b.next, `${p}.next`);
  if (Array.isArray(b.choices)) {
    if (b.choices.length > INTRO_CHOICES_MAX) err(at(`${p}.choices`), `At most ${INTRO_CHOICES_MAX} choices.`);
    b.choices.forEach((c, j) => introChoice(c, `${p}.choices[${j}]`, target, check));
  } else if (b.choices !== undefined) err(at(`${p}.choices`), 'Must be a list.');
  introOverrides(b, p, i, check);
}

/**
 * A box's Next or End that does nothing (warnings): choices lead on first, then End. And a single
 * reply (a warning): a tap that looks like a choice.
 */
function introOverrides(b, p, i, check) {
  const name = typeof b.id === 'string' && b.id ? `Box “${b.id}”` : `Box ${i + 1}`;
  const hasNext = typeof b.next === 'string' && b.next !== '';
  const warn = (k, why) =>
    check.warn(check.at(`${p}.${k}`), `${name}: ${why}, so ${k === 'end' ? 'End' : 'Next'} does nothing.`);
  if (Array.isArray(b.choices) && b.choices.length && b.choices.length < INTRO_CHOICES_MIN)
    check.warn(check.at(`${p}.choices`), `${name}: one reply is just a tap; add another, or use Next instead.`);
  if (Array.isArray(b.choices) && b.choices.length) {
    if (b.end === true) warn('end', 'its choices lead on');
    if (hasNext) warn('next', 'its choices lead on');
  } else if (b.end === true && hasNext) warn('next', 'the intro ends there');
}

/** One choice: its words and the box it leads to. */
function introChoice(c, p, target, check) {
  const { at, err } = check;
  if (!isObj(c)) return err(at(p), 'Must be a group of fields.');
  for (const k of Object.keys(c)) if (k !== 'label' && k !== 'next') err(at(`${p}.${k}`), 'Unknown setting.');
  if (c.label === undefined) err(at(`${p}.label`), 'Missing.');
  else introText(c.label, `${p}.label`, INTRO_LABEL_MAX, check);
  target(c.next, `${p}.next`, 'Pick the box it leads to.');
}

/** Text up to `max` characters (not UTF-16 units), not empty unless it may be. */
function introText(v, p, max, check, required = true) {
  const n = typeof v === 'string' ? Array.from(v.trim()).length : 0;
  if (typeof v !== 'string') check.err(check.at(p), 'Must be text.');
  else if (!n && required) check.err(check.at(p), 'Can’t be empty.');
  else if (n > max) check.err(check.at(p), `At most ${max} characters.`);
}

/**
 * The intro's flow, as the toy plays it (content.js introFrom: the boxes it keeps, each going on
 * by its choices, else its End, else its Next, else the box after it; from the start, or the
 * first box): a warning for each box nothing leads to, and for each loop of boxes with no choice
 * on the way (tapping on would never end it), at the Next that closes it.
 */
function introFlow(boxes, ids, start, check) {
  const kept = boxes.flatMap((b, i) => (ids.get(b?.id) === i ? [{ b, i }] : []));
  const pos = new Map(kept.map(({ b }, k) => [b.id, k]));
  /** @type {Array<{ choices?: number[], to?: number | null }>} */
  const flow = kept.map(({ b }, k) => {
    const choices = (Array.isArray(b.choices) ? b.choices : [])
      .filter((c) => isObj(c) && typeof c.label === 'string' && c.label.trim() && pos.has(c.next))
      .slice(0, INTRO_CHOICES_MAX)
      .map((c) => pos.get(c.next));
    if (choices.length) return { choices };
    if (b.end === true) return { to: null };
    if (pos.has(b.next)) return { to: pos.get(b.next) };
    return { to: k + 1 < kept.length ? k + 1 : null };
  });
  const reached = new Set();
  const todo = kept.length ? [pos.get(start) ?? 0] : [];
  while (todo.length) {
    const k = todo.pop();
    if (reached.has(k)) continue;
    reached.add(k);
    todo.push(...(flow[k].choices ?? (flow[k].to === null ? [] : [flow[k].to])));
  }
  kept.forEach(({ b, i }, k) => {
    if (!reached.has(k))
      check.warn(check.at(`intro.boxes[${i}]`), `Box “${b.id}” is never reached: no box or choice leads to it.`);
  });
  // Loops: follow each box's one way on (a box with choices is a way out) until it comes round.
  const state = kept.map(() => 0); // 0 not yet, 1 on this walk, 2 done
  for (let k = 0; k < kept.length; k++) {
    const walk = [];
    let n = k;
    while (n !== null && state[n] === 0 && !flow[n].choices) {
      state[n] = 1;
      walk.push(n);
      n = flow[n].to;
    }
    if (n !== null && state[n] === 1) {
      const loop = walk.slice(walk.indexOf(n));
      const names = [...loop, n].map((m) => `“${kept[m].b.id}”`).join(' → ');
      // (The latest box in it closes it, by its Next: the box after that one isn't in the loop.)
      const last = kept[Math.max(...loop)];
      check.warn(
        check.at(`intro.boxes[${last.i}].next`),
        `Boxes ${names} go round with no choice to leave: the intro would never end.`,
      );
    }
    for (const m of walk) state[m] = 2;
  }
}

/**
 * Check a whole content object. Returns [{ path, message }] (empty when it's fine);
 * paths look like `projects[2].images[0].alt`. `warnings` are allowed through.
 */
export function validateContent(c) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  const text = (v, path, required = false) => {
    if (typeof v !== 'string') err(path, 'Must be text.');
    else if (required && !v.trim()) err(path, 'Can’t be empty.');
  };
  const texts = (obj, path, keys, required = false) => {
    for (const k of keys) text(obj?.[k], `${path}.${k}`, required);
  };
  const list = (v, path, each) => {
    if (!Array.isArray(v)) return err(path, 'Must be a list.');
    v.forEach((x, i) => each(x, `${path}[${i}]`));
  };
  const obj = (v, path) => {
    if (!isObj(v)) {
      err(path, 'Must be a group of fields.');
      return false;
    }
    return true;
  };
  const flag = (v, path) => {
    if (v !== undefined && typeof v !== 'boolean') err(path, 'Must be on or off.');
  };
  const optional = (o, path, keys) => {
    for (const k of keys) if (o[k] !== undefined) text(o[k], `${path}.${k}`);
  };
  const link = (href, path) => {
    if (!isSafeUrl(href)) err(path, 'Not a link the site can use (https://…, mailto:…, or a path like games/x.html).');
  };
  const links = (v, path) =>
    list(v, path, (l, p) => {
      if (!obj(l, p)) return;
      text(l.label, `${p}.label`, true);
      link(l.href, `${p}.href`);
      flag(l.hidden, `${p}.hidden`);
    });

  if (!isObj(c)) return { errors: [{ path: '', message: 'Content must be an object.' }], warnings };
  for (const key of SECTIONS) if (!(key in c)) err(key, 'Missing section.');
  if (errors.length) return { errors, warnings };

  // site
  if (obj(c.site, 'site')) {
    texts(c.site, 'site', ['name', 'title', 'description'], true);
    if (c.site.url !== undefined && !/^https:\/\//.test(c.site.url ?? '')) err('site.url', 'Must start with https://.');
    if (c.site.email !== undefined) text(c.site.email, 'site.email');
    if (c.site.resumeUrl !== undefined && c.site.resumeUrl !== null && c.site.resumeUrl !== '')
      link(c.site.resumeUrl, 'site.resumeUrl');
    if (c.site.links !== undefined && obj(c.site.links, 'site.links'))
      for (const [k, v] of Object.entries(c.site.links)) link(v, `site.links.${k}`);
  }

  // screens: fixed ids, editable labels, any order
  list(c.screens, 'screens', (s, p) => {
    if (obj(s, p)) text(s.label, `${p}.label`, true);
  });
  if (Array.isArray(c.screens)) {
    const ids = c.screens.map((s) => s?.id);
    if (ids.length !== SCREEN_IDS.length || SCREEN_IDS.some((id) => !ids.includes(id)))
      err('screens', `Screens must be exactly: ${SCREEN_IDS.join(', ')}.`);
  }

  // weapons + starting equipment
  if (obj(c.weapons, 'weapons')) {
    const keys = Object.keys(c.weapons);
    if (keys.length !== WEAPON_KEYS.length || WEAPON_KEYS.some((k) => !keys.includes(k)))
      err('weapons', 'The weapon list is fixed by the 3D model; only names can change.');
    for (const k of keys) text(c.weapons[k], `weapons.${k}`, true);
  }
  // Which weapons a random draw can pick (a missing one counts as on).
  if (c.weaponDraw !== undefined && obj(c.weaponDraw, 'weaponDraw')) {
    for (const [k, v] of Object.entries(c.weaponDraw)) {
      if (!WEAPON_KEYS.includes(k)) err(`weaponDraw.${k}`, 'Not one of the weapons.');
      else flag(v, `weaponDraw.${k}`);
    }
    const on = WEAPON_KEYS.filter((k) => c.weaponDraw[k] !== false).length;
    if (on < MIN_WEAPONS)
      err('weaponDraw', `Keep at least ${MIN_WEAPONS} weapons in the draw, so a new one can always be picked.`);
  }
  if (obj(c.startingEquipment, 'startingEquipment')) {
    if (!WEAPON_KEYS.includes(c.startingEquipment.weapon)) err('startingEquipment.weapon', 'Pick one of the weapons.');
    if (!flameIds(c).includes(c.startingEquipment.flame))
      err('startingEquipment.flame', 'Pick one of the bonfire palettes.');
    if (c.startingEquipment.element !== undefined && !ELEMENT_IDS.includes(c.startingEquipment.element))
      err('startingEquipment.element', 'Pick one of the elements.');
  }

  validateEffects(c.effects, err);

  // admin panel's own label overrides (the site ignores them)
  if (
    c.admin !== undefined &&
    obj(c.admin, 'admin') &&
    c.admin.labels !== undefined &&
    obj(c.admin.labels, 'admin.labels')
  ) {
    for (const [k, v] of Object.entries(c.admin.labels)) {
      if (typeof v !== 'string' || v.length > 60) err(`admin.labels.${k}`, 'Text up to 60 characters.');
    }
  }

  // Bonfire Live's preset scenes (made in the Painter): optional like `admin`, but checked
  // in full when it's there (scenes.js), against the site's own void when a scene keeps
  // the site's scenery colors.
  if (c.scenes !== undefined) validateScenes(c.scenes, err, 'scenes', { voidHex: c.effects?.colors?.void });

  // The invitation toy (/invitation/): optional too (content from before it has none), checked
  // in full when it's there.
  if (c.invitation !== undefined) validateInvitation(c.invitation, err, warn);

  // hero
  if (obj(c.hero, 'hero')) {
    texts(c.hero, 'hero', ['eyebrow', 'value', 'menuLabel', 'stokeLabel', 'sceneLabel', 'sceneKnight']);
    optional(c.hero, 'hero', ['sceneSign']); // (his summon sign, while he's away)
    if (obj(c.hero.stokeHint, 'hero.stokeHint')) texts(c.hero.stokeHint, 'hero.stokeHint', ['pointer', 'touch']);
    if (obj(c.hero.kindled, 'hero.kindled')) {
      texts(c.hero.kindled, 'hero.kindled', ['title', 'subtitle']);
      if (!KINDLED_SHOW.includes(c.hero.kindled.show))
        err('hero.kindled.show', `Must be one of: ${KINDLED_SHOW.join(', ')}.`);
      const d = c.hero.kindled.duration;
      if (typeof d !== 'number' || !Number.isFinite(d) || d < 500 || d > 20000)
        err('hero.kindled.duration', 'Between 500 and 20000 ms.');
    }
  }

  // screen headings
  if (obj(c.sections, 'sections'))
    for (const [k, s] of Object.entries(c.sections)) {
      if (!obj(s, `sections.${k}`)) continue;
      text(s.title, `sections.${k}.title`, true);
      optional(s, `sections.${k}`, ['flavor', 'intro']);
    }

  // projects: featured, projects, archive
  const seen = new Map();
  const project = (p, path, { needsImages }) => {
    if (!obj(p, path)) return;
    if (typeof p.id !== 'string' || !ID_RE.test(p.id))
      err(`${path}.id`, 'Use lowercase letters, numbers and single dashes (it becomes the page address).');
    else if (seen.has(p.id)) err(`${path}.id`, `“${p.id}” is already used by ${seen.get(p.id)}.`);
    else seen.set(p.id, p.name || p.id);
    text(p.name, `${path}.name`, true);
    optional(p, path, [
      'kind',
      'year',
      'status',
      'summary',
      'outcome',
      'problem',
      'built',
      'role',
      'flavor',
      'note',
      'todo',
    ]);
    flag(p.hidden, `${path}.hidden`);
    if (p.tech !== undefined) list(p.tech, `${path}.tech`, (t, tp) => text(t, tp, true));
    if (p.links !== undefined) links(p.links, `${path}.links`);
    if (p.href !== undefined) link(p.href, `${path}.href`);
    if (p.images !== undefined) {
      list(p.images, `${path}.images`, (im, ip) => {
        if (!obj(im, ip)) return;
        if (typeof im.src !== 'string' || !IMAGE_RE.test(im.src))
          err(`${ip}.src`, 'Image path must look like assets/projects/<folder>/<name>.');
        text(im.alt, `${ip}.alt`, true);
        // Alt text is read aloud in place of the screenshot: it should say what's in it.
        if (typeof im.alt === 'string' && im.alt.trim()) {
          const alt = im.alt.trim();
          if (alt.length < 15 || /^(image|screenshot|picture|photo|img)\b/i.test(alt) || alt === im.caption) {
            warn(
              `${ip}.alt`,
              'Describe what the screenshot shows (what’s on screen, not “screenshot of…”), in a sentence.',
            );
          }
        }
        if (im.caption !== undefined) text(im.caption, `${ip}.caption`);
        flag(im.pixel, `${ip}.pixel`);
        flag(im.video, `${ip}.video`);
        flag(im.hidden, `${ip}.hidden`);
      });
    }
    const imageCount = shownImages(p).length;
    if (needsImages && !imageCount)
      err(`${path}.images`, 'Add at least one visible image (the first visible one is the inventory icon).');
    if (!needsImages && !imageCount && !p.href) warn(path, 'With no images and no link, this won’t appear anywhere.');
  };
  project(c.featured, 'featured', { needsImages: true });
  list(c.projects, 'projects', (p, path) => project(p, path, { needsImages: true }));
  list(c.archive, 'archive', (p, path) => project(p, path, { needsImages: false }));
  const slots = inventoryEntries(c).filter((p) => isObj(p) && !p.hidden && shownImages(p).length).length;
  if (slots > GRID_SLOTS)
    warn('projects', `${slots} visible items; the inventory grid holds ${GRID_SLOTS} before it grows past its box.`);

  // about
  if (obj(c.about, 'about')) {
    list(c.about.paragraphs, 'about.paragraphs', (t, p) => text(t, p, true));
    list(c.about.stats, 'about.stats', (row, p) => {
      if (!Array.isArray(row) || row.length !== 2) return err(p, 'Each stat is a label and a value.');
      text(row[0], `${p}[0]`, true);
      text(row[1], `${p}[1]`, true);
    });
  }

  // journey
  list(c.experience, 'experience', (org, p) => {
    if (!obj(org, p)) return;
    text(org.org, `${p}.org`, true);
    text(org.location, `${p}.location`);
    flag(org.hidden, `${p}.hidden`);
    list(org.roles, `${p}.roles`, (r, rp) => {
      if (!obj(r, rp)) return;
      text(r.title, `${rp}.title`, true);
      text(r.dates, `${rp}.dates`);
      flag(r.hidden, `${rp}.hidden`);
      list(r.bullets, `${rp}.bullets`, (b, bp) => text(b, bp, true));
    });
  });
  if (obj(c.leadership, 'leadership')) {
    text(c.leadership.title, 'leadership.title', true);
    text(c.leadership.flavor, 'leadership.flavor');
    list(c.leadership.items, 'leadership.items', (it, p) => {
      if (!obj(it, p)) return;
      text(it.org, `${p}.org`, true);
      texts(it, p, ['role', 'dates', 'text']);
      flag(it.hidden, `${p}.hidden`);
    });
  }
  list(c.education, 'education', (e, p) => {
    if (!obj(e, p)) return;
    text(e.name, `${p}.name`, true);
    texts(e, p, ['org', 'dates']);
    flag(e.hidden, `${p}.hidden`);
  });

  // skills
  list(c.skills, 'skills', (g, p) => {
    if (!obj(g, p)) return;
    text(g.group, `${p}.group`, true);
    flag(g.hidden, `${p}.hidden`);
    list(g.items, `${p}.items`, (s, sp) => {
      if (!obj(s, sp)) return;
      text(s.name, `${sp}.name`, true);
      text(s.flavor, `${sp}.flavor`);
      flag(s.hidden, `${sp}.hidden`);
      if (typeof s.glyph !== 'string' || !s.glyph.trim()) err(`${sp}.glyph`, 'Can’t be empty.');
      else if ([...s.glyph].length > 3) err(`${sp}.glyph`, 'At most 3 characters (it has to fit the slot).');
    });
  });

  // contact
  if (obj(c.contact, 'contact')) {
    texts(c.contact, 'contact', ['heading', 'body', 'footer', 'backToTop']);
    optional(c.contact, 'contact', ['todo']);
    list(c.contact.links, 'contact.links', (l, p) => {
      if (!obj(l, p)) return;
      text(l.label, `${p}.label`, true);
      text(l.value, `${p}.value`);
      link(l.href, `${p}.href`);
      flag(l.hidden, `${p}.hidden`);
    });
  }

  // interface text (a menu's group headings can't be blank: a group with no name reads out
  // as nothing to a screen reader, and shows as a bare line)
  if (obj(c.ui, 'ui'))
    for (const [k, v] of Object.entries(c.ui)) {
      if (k !== 'prompts') {
        text(v, `ui.${k}`, UI_HEADINGS.includes(k));
        continue;
      }
      list(v, 'ui.prompts', (row, p) => {
        if (!Array.isArray(row) || row.length !== 3)
          return err(p, 'Each prompt is: key, second key (or empty), label.');
        text(row[0], `${p}[0]`, true);
        if (row[1] !== null) text(row[1], `${p}[1]`);
        text(row[2], `${p}[2]`, true);
      });
    }
  if (obj(c.notFound, 'notFound')) texts(c.notFound, 'notFound', ['title', 'flavor', 'body', 'cta']);

  return { errors, warnings };
}
