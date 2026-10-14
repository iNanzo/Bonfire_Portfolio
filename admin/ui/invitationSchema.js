// The admin's Invitation page (admin/ui/schema.js gathers it with the rest): how content.json's
// `invitation` shows, the invitation toy's (/invitation/) Default look, how often NEWT talks and
// what he says. Its labels and help, the toy's own lists as dropdowns (Pixel Size, the style
// it's built on, Motion, the Shader choices and Colors' steps), its ranges as sliders (the
// Shader's, each trigger's chance and cooldown, the quiet spell: speech.js SPEECH_RANGES), the
// triggers under the plan's kinds, a line's Add button, and a way to start each section from the
// toy's own built-in values when content.json has none yet (INVITATION_STARTERS: content from
// before the toy, or a fork, can be edited all the same). contentRules.js checks the content;
// the toy reads it through src/invitation/content.js. Each Shader option goes by the Look
// menu's own name (shader.js SHADER_CONTROLS), so a control added there shows here by itself.
import { INVITATION_STYLES } from '../../src/contentRules.js';
import { DEFAULT_LOOK, MOTIONS } from '../../src/invitation/look.js';
import { PRESETS } from '../../src/invitation/looks/index.js';
import { PIXEL_SIZES } from '../../src/invitation/pixels.js';
import { SHADER_CONTROLS, styleShader } from '../../src/invitation/shader.js';
import { LINE_MAX, LINES_MAX, SPEECH_DEFAULTS, SPEECH_RANGES, TRIGGERS } from '../../src/invitation/speech.js';
import { titleCase } from './text.js';

/** @type {Record<string, [string, string]>} each trigger (speech.js TRIGGERS): [its name, the moment it is] */
const TRIGGER_NAMES = {
  wave: ['Tap: wave', 'When a tap, or the Wave button, makes him wave.'],
  spook: ['Tap: spook', 'When a tap, or the Spook button, startles him.'],
  flee: ['Runs off', 'When he runs away: tapped too often, or the Run button.'],
  caught: ['Caught mid-run', 'When he’s grabbed while running away.'],
  pickedUp: ['Picked up', 'When he’s picked up by the collar.'],
  shaken: ['Shaken', 'When he’s shaken hard while he’s held.'],
  dropped: ['Dropped', 'When he’s let go and falls.'],
  landed: ['Lands', 'When he lands after a fall.'],
  walkTo: ['Walks to a floor tap', 'When he walks to where the floor was tapped.'],
  wander: ['Wanders off', 'When he strolls off by himself (Wander on).'],
  sitDown: ['Sits down by himself', 'When he sits down after about 20 seconds alone (not the Sit button).'],
  sitting: ['Still sitting', 'While he sits, after each quiet spell.'],
  standUp: ['Stands up', 'When he gets up from sitting.'],
  idle: ['Idle', 'Standing about, after each quiet spell.'],
  spin: ['Camera spun round', 'When the camera is spun round more than a turn in a few seconds.'],
  zoom: ['Zoomed in close', 'When the camera is zoomed in very close to him.'],
};
/** The plan's kinds of moment, in its order; the speech's quiet spell goes with Passive. */
const TALK_KINDS = [
  { label: 'Reactions', keys: ['wave', 'spook'] },
  { label: 'Running', keys: ['flee', 'caught'] },
  { label: 'Carried', keys: ['pickedUp', 'shaken', 'dropped', 'landed'] },
  { label: 'Moving', keys: ['walkTo', 'wander'] },
  { label: 'Sitting', keys: ['sitDown', 'sitting', 'standUp'] },
  { label: 'Passive', keys: ['idle'] },
  { label: 'Camera', keys: ['spin', 'zoom'] },
];
/** Each Shader option's help (its name is the Look menu's, shader.js SHADER_CONTROLS). */
const SHADER_HELP = {
  levels: 'Levels in each color channel: fewer is more posterized; Full doesn’t quantize at all.',
  dither: 'How far the dither moves a color toward the next level. Off: none.',
  outline: 'How much darker NEWT’s outline is than what it’s drawn on. Off: no line.',
  ink: 'Dark lines, or lines tinted with the style’s ink color.',
  ring: 'Draws his line just outside his silhouette, like a sprite’s, instead of on his edge.',
  bands: 'Smooth light, or that many flat bands of it (toon shading).',
  highlight: 'White where the light falls straight on him.',
  pixelShirt: 'His shirt’s bold pixel plaid at the coarser sizes. Off: his real plaid at every size.',
  pixelFace: 'His face redrawn in pixels to fit his size. Off: his smooth face at every size.',
  edge: 'A crisp shadow, or one with a dithered, two-tone edge.',
  shadow: 'How dark his shadow on the floor is. Off: none.',
  turn: 'Turns the light round him, in degrees; it still turns with the camera too.',
  light: 'How strong the light on him is, against the style’s own.',
  saturation: 'The grade’s color: below 1 grayer, above 1 more vivid.',
  warmth: 'The grade toward warm (above 0) or cool (below 0).',
  exposure: 'The grade’s brightness: below 1 darker, above 1 lighter.',
  contrast: 'The grade’s contrast about mid gray: below 1 flatter, above 1 punchier.',
};
const shaderPath = (key) => `invitation.defaults.shader.${key}`;
/** The invitation's names: its sections, the default look's fields, every trigger in both lists. */
export const INVITATION_LABELS = {
  'invitation.defaults': 'Default look',
  'invitation.defaults.pixelSize': 'Pixel size',
  'invitation.defaults.dither': 'Dithering',
  'invitation.defaults.outlines': 'Outlines',
  'invitation.defaults.style': 'Built on',
  'invitation.defaults.motion': 'Motion',
  'invitation.defaults.shader': 'Shader',
  ...Object.fromEntries(SHADER_CONTROLS.map((c) => [shaderPath(c.key), c.label])),
  'invitation.speech': 'Speech',
  'invitation.speech.idleMin': 'Shortest quiet spell',
  'invitation.speech.idleMax': 'Longest quiet spell',
  'invitation.lines': 'Lines',
  ...Object.fromEntries(
    TRIGGERS.flatMap((k) => [
      [`invitation.speech.${k}`, TRIGGER_NAMES[k][0]],
      [`invitation.speech.${k}.chance`, 'Chance'],
      [`invitation.speech.${k}.cooldown`, 'Cooldown'],
      [`invitation.lines.${k}`, TRIGGER_NAMES[k][0]],
    ]),
  ),
};
export const INVITATION_HELP = {
  'invitation.defaults':
    'The Default style a first visit gets, before anyone touches the Look menu. Visitors’ own picks stay in their browser, over these.',
  'invitation.defaults.pixelSize':
    'NEWT’s sprite resolution: roughly that many pixels tall, rounded to whole screen pixels (Native where the screen has no more). Off is smooth.',
  'invitation.defaults.dither':
    'The Look menu’s Dithering switch: the checkered blend between colors (how strong: Dither Strength, under Shader).',
  'invitation.defaults.outlines':
    'The Look menu’s Outlines switch: the line round NEWT (how dark and its color: under Shader).',
  'invitation.defaults.style':
    'The style the Default look starts from: its own colors (the background, the ink) carry over, and the Shader values below set the rest.',
  'invitation.defaults.motion':
    'Smooth moves him every frame; Choppy steps his arms, legs and head 15 times a second, like stop motion.',
  'invitation.defaults.shader':
    'The Look menu’s Shader options as the Default style sets them; a visitor’s own change turns their Style to Custom.',
  ...Object.fromEntries(
    SHADER_CONTROLS.map((c) => [
      shaderPath(c.key),
      SHADER_HELP[c.key] ?? `The Default style’s ${c.label}, as the Look menu’s Shader section shows it.`,
    ]),
  ),
  'invitation.speech':
    'How often NEWT talks: each moment’s chance and cooldown, and how long a quiet spell lasts before an idle line.',
  'invitation.speech.idleMin':
    'Left alone, he says an idle line after a quiet spell between this and the longest (seconds); sitting, a still-sitting one.',
  'invitation.speech.idleMax':
    'The longest quiet spell before an idle line (seconds). Set it to the shortest for an exact wait.',
  'invitation.lines':
    'What NEWT says at each moment, one picked at random (never the line he just said). Short lines read best in his bubble.',
  ...Object.fromEntries(
    TRIGGERS.flatMap((k) => [
      [`invitation.speech.${k}`, TRIGGER_NAMES[k][1]],
      [`invitation.speech.${k}.chance`, 'How often he speaks when it happens: 0 never, 1 every time.'],
      [`invitation.speech.${k}.cooldown`, 'Seconds before this moment can speak again once it has.'],
      [`invitation.lines.${k}`, TRIGGER_NAMES[k][1]],
    ]),
  ),
};
/** The invitation's sliders: the Shader ranges (not Colors, a list of steps), the speech's. */
export const INVITATION_RANGES = {
  ...Object.fromEntries(
    SHADER_CONTROLS.filter((c) => c.kind === 'range' && !c.steps).map((c) => [
      shaderPath(c.key),
      c.key === 'turn' ? [c.min, c.max, c.step, '°'] : [c.min, c.max, c.step],
    ]),
  ),
  'invitation.speech.idleMin': SPEECH_RANGES.idle,
  'invitation.speech.idleMax': SPEECH_RANGES.idle,
  ...Object.fromEntries(
    TRIGGERS.flatMap((k) => [
      [`invitation.speech.${k}.chance`, SPEECH_RANGES.chance],
      [`invitation.speech.${k}.cooldown`, SPEECH_RANGES.cooldown],
    ]),
  ),
};

/** Its longer explanations (folded under the help: "More"). */
export const INVITATION_MORE = {
  'invitation.defaults':
    'DS and Soft stay as they are: these values make the Default style, first in the Look menu’s Style row (Reset To Style brings them back).',
  'invitation.speech':
    'One bubble at a time: while a line is up, only a moment that matters more replaces it (being caught or shaken first, idle time last).\n' +
    'A moment whose chance doesn’t come up just passes; its cooldown starts only once it has spoken.',
  'invitation.lines': `Up to ${LINES_MAX} lines a moment, each up to ${LINE_MAX} characters (past 80 they wrap a lot in his bubble). A moment with no lines says nothing.`,
};

/** Extra words the search finds its sections by. */
export const INVITATION_KEYWORDS = {
  'invitation.defaults': ['newt', 'look menu', 'pixel size', 'default style'],
  'invitation.speech': ['newt', 'speech bubble', 'talk', 'chatty'],
  'invitation.lines': ['newt', 'speech bubble', 'talk', 'say', 'words'],
};

/** Its triggers by the plan's kinds (the quiet spell with Passive). */
export const INVITATION_SUBGROUPS = {
  'invitation.speech': TALK_KINDS.map((g) =>
    g.label === 'Passive' ? { ...g, keys: ['idleMin', 'idleMax', ...g.keys] } : g,
  ),
  'invitation.lines': TALK_KINDS,
};

/** Its dropdowns: (draft) → [{ value, label }]. */
export const INVITATION_SELECTS = {
  'invitation.defaults.pixelSize': () =>
    PIXEL_SIZES.map((v) => ({ value: v, label: /^\d+$/.test(v) ? `${v}×${v}` : titleCase(v) })),
  'invitation.defaults.style': () =>
    INVITATION_STYLES.map((k) => ({ value: k, label: PRESETS[k]?.label ?? titleCase(k) })),
  'invitation.defaults.motion': () => MOTIONS.map((v) => ({ value: v, label: titleCase(v) })),
  ...Object.fromEntries(
    SHADER_CONTROLS.filter((c) => c.kind === 'choice' || c.steps).map((c) => [
      shaderPath(c.key),
      () =>
        c.kind === 'choice'
          ? c.options.map((o) => ({ value: o.value, label: o.spoken ?? o.label }))
          : c.steps.map((v) => ({ value: v, label: c.text(v)[0] })),
    ]),
  ),
};

/** “+ Add …” on each trigger's lines. */
export const INVITATION_ADD_LABELS = Object.fromEntries(TRIGGERS.map((k) => [`invitation.lines.${k}`, 'line']));

/** The style the toy's built-in Default is built on (looks/default.js spreads Soft). */
const DEFAULT_BUILT_ON = 'soft';

/**
 * Each section from the toy's own built-in values, for a content.json without it (a fresh copy
 * each call): the Default look (the built-in Default style: Soft with the Default preset's
 * Shader values, at the built-in Pixel Size and Motion), the speech (speech.js SPEECH_DEFAULTS)
 * and every trigger's lines, none yet.
 * @type {Record<string, () => object>}
 */
export const INVITATION_STARTERS = {
  'invitation.defaults': () => ({
    pixelSize: DEFAULT_LOOK.pixelSize,
    dither: DEFAULT_LOOK.dither,
    outlines: DEFAULT_LOOK.outlines,
    style: DEFAULT_BUILT_ON,
    motion: DEFAULT_LOOK.motion,
    shader: styleShader(PRESETS.default),
  }),
  'invitation.speech': () => ({
    idleMin: SPEECH_DEFAULTS.idleEvery[0],
    idleMax: SPEECH_DEFAULTS.idleEvery[1],
    ...Object.fromEntries(TRIGGERS.map((k) => [k, { ...SPEECH_DEFAULTS.triggers[k] }])),
  }),
  'invitation.lines': () => Object.fromEntries(TRIGGERS.map((k) => [k, []])),
};
