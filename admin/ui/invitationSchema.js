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
//
// The Intro (`invitation.intro`, the chat the envelope and Replay Intro open: types.js DialogueScript): the
// speaker, the start box and the chat boxes. The start, each box's Next and each choice's box
// are picked from the boxes there are (one that's gone still shows, marked, so it can be put
// right), the lists remade as a box is renamed (INVITATION_OPTIONS_FROM); Face, Animation and
// Camera from the toy's lists; Auto as a slider. A new box comes with every field
// (INVITATION_TEMPLATES), and a box without some shows them all the same (INVITATION_FIELDS:
// a hand-written box can be filled in), boxes and choices can't
// be hidden (INVITATION_NO_HIDING: the toy has no way to skip one), a box has at most 3 choices
// (INVITATION_MAX_ENTRIES), and each card says under its line what the box does
// (INVITATION_CARD_META: its id, face, move, shot and where it goes).
//
// Text Effects (`invitation.text`): the colours a line's tags name ({red,wave|…}: markup.js), a
// list of name and colour started from the toy's own (DEFAULT_TEXT_COLORS); its help shows the
// tags. Each chat box's text and each line has a live preview under it (INVITATION_PREVIEWS:
// form.js draws it with markup.js and the draft's colours, previewPalette).
import {
  INTRO_ANIMATIONS,
  INTRO_AUTO,
  INTRO_CAMERAS,
  INTRO_CHOICES_MAX,
  INTRO_CHOICES_MIN,
  INTRO_TEXT_LONG,
  INTRO_TEXT_MAX,
  INVITATION_STYLES,
} from '../../src/contentRules.js';
import { DIALOGUE_WAYS, FACE_NAMES, dialogueHolds } from '../../src/invitation/clips.js';
import { DEFAULT_LOOK, MOTIONS } from '../../src/invitation/look.js';
import { PRESETS } from '../../src/invitation/looks/index.js';
import { PIXEL_SIZES } from '../../src/invitation/pixels.js';
import { SHADER_CONTROLS, styleShader } from '../../src/invitation/shader.js';
import { DEFAULT_TEXT_COLORS, paletteOf } from '../../src/invitation/markup.js';
import { LINE_MAX, LINES_MAX, SPEECH_DEFAULTS, SPEECH_RANGES, TRIGGERS } from '../../src/invitation/speech.js';
import { getAt } from './paths.js';
import { titleCase } from './text.js';

/** A chat box's pattern, and a choice's; a text effects colour's. */
const BOX = 'invitation.intro.boxes[]';
const CHOICE = `${BOX}.choices[]`;
const COLOR = 'invitation.text.colors[]';

/** @type {Record<string, [string, string]>} each trigger (speech.js TRIGGERS): [its name, the moment it is] */
const TRIGGER_NAMES = {
  wave: ['Tap: wave', 'When a tap, or the Wave button, makes him wave.'],
  spook: ['Tap: spook', 'When a tap, or the Spook button, startles him.'],
  flee: ['Runs off', 'When he runs away: tapped too often, or the Run button.'],
  caught: ['Caught mid-run', 'When he’s grabbed while running away.'],
  pickedUp: ['Picked up', 'When he’s picked up by the collar.'],
  shaken: ['Shaken', 'When he’s shaken hard while he’s held.'],
  thrash: ['Thrashes', 'When he kicks and flails while he’s held, every few seconds (sooner when he’s shaken).'],
  dropped: ['Dropped', 'When he’s let go and falls.'],
  landed: ['Lands', 'When he lands after a fall.'],
  walkTo: ['Walks to a floor tap', 'When he walks to where the floor was tapped.'],
  wander: ['Wanders off', 'When he strolls off by himself (Wander on).'],
  sitDown: ['Sits down by himself', 'When he sits down after about 20 seconds alone (not the Sit button).'],
  sitting: ['Still sitting', 'While he sits, after each quiet spell.'],
  standUp: ['Stands up', 'When he gets up from sitting, or from lying with the device.'],
  device: ['Gets the device', 'When Screen Time sits him down with the tablet in his hands.'],
  lieDown: ['Lies down with it', 'When Screen Time lies him down on his stomach with the tablet.'],
  idle: ['Idle', 'Standing about, after each quiet spell.'],
  spin: ['Camera spun round', 'When the camera is spun round more than a turn in a few seconds.'],
  zoom: ['Zoomed in close', 'When the camera is zoomed in very close to him.'],
};
/** The plan's kinds of moment, in its order; the speech's quiet spell goes with Passive. */
const TALK_KINDS = [
  { label: 'Reactions', keys: ['wave', 'spook'] },
  { label: 'Running', keys: ['flee', 'caught'] },
  { label: 'Carried', keys: ['pickedUp', 'shaken', 'thrash', 'dropped', 'landed'] },
  { label: 'Moving', keys: ['walkTo', 'wander'] },
  { label: 'Sitting', keys: ['sitDown', 'sitting', 'standUp', 'device', 'lieDown'] },
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
  'invitation.intro': 'Intro',
  'invitation.intro.speaker': 'Speaker',
  'invitation.intro.start': 'Start box',
  'invitation.intro.boxes': 'Chat boxes',
  [`${BOX}.id`]: 'ID',
  [`${BOX}.speaker`]: 'Speaker override',
  [`${BOX}.text`]: 'Text',
  [`${BOX}.face`]: 'Face',
  [`${BOX}.animation`]: 'Animation',
  [`${BOX}.camera`]: 'Camera',
  [`${BOX}.next`]: 'Next box',
  [`${BOX}.end`]: 'Ends the intro',
  [`${BOX}.auto`]: 'Auto wait',
  [`${BOX}.choices`]: 'Choices',
  [`${CHOICE}.label`]: 'Label',
  [`${CHOICE}.next`]: 'Leads to',
  'invitation.text': 'Text effects',
  'invitation.text.colors': 'Colors',
  [`${COLOR}.name`]: 'Name',
  [`${COLOR}.color`]: 'Color',
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
    'What NEWT says at each moment, one picked at random (never the line he just said). Tags style them (Text Effects).',
  ...Object.fromEntries(
    TRIGGERS.flatMap((k) => [
      [`invitation.speech.${k}`, TRIGGER_NAMES[k][1]],
      [`invitation.speech.${k}.chance`, 'How often he speaks when it happens: 0 never, 1 every time.'],
      [`invitation.speech.${k}.cooldown`, 'Seconds before this moment can speak again once it has.'],
      [`invitation.lines.${k}`, TRIGGER_NAMES[k][1]],
    ]),
  ),
  'invitation.intro':
    'The chat the envelope and Replay Intro open: NEWT talks to the visitor box by box, with a face, a move and a shot for each line.',
  'invitation.intro.speaker':
    'The name on the tab at the top left of every chat box (a box’s Speaker Override changes it for that box).',
  'invitation.intro.start':
    'The box the intro opens on, from the envelope or Replay Intro. It starts here every time: nothing is kept from the last.',
  'invitation.intro.boxes':
    'One line each, in this order: a tap goes on to the box after it unless the box says otherwise. Drag ⋮⋮ or use ↑/↓ to reorder.',
  [`${BOX}.id`]:
    'How Next and the choices point to this box. Lowercase letters, numbers and dashes, and no other box’s.',
  [`${BOX}.speaker`]:
    'Another name on the tab for this box alone, such as ??? before he’s said his. Empty: the intro’s Speaker.',
  [`${BOX}.text`]: `What he says, typed out; {red,wave|tags} style it (Text Effects). Up to ${INTRO_TEXT_MAX} letters; past ${INTRO_TEXT_LONG} it outgrows a phone’s box.`,
  [`${BOX}.face`]: 'His face while he says it. He still blinks on Neutral.',
  [`${BOX}.animation`]:
    'As the line starts: Once plays, then he talks; Loops keeps on. In Place walks on the spot; Dangling holds him up. Down, he gets up first. None: as he was.',
  [`${BOX}.camera`]:
    'The shot for this line, eased there: Close is his head and shoulders (too tight for a Cheer on a phone), Medium his whole body, Wide the usual view.',
  [`${BOX}.next`]: 'Where a tap goes after this line: another box, or the box after it in the list.',
  [`${BOX}.end`]: 'The intro ends after this line, whatever comes after it in the list, and he’s free to play again.',
  [`${BOX}.auto`]:
    'With Auto on, the seconds to wait once the line is typed before going on. 0: as long as it takes to read.',
  [`${BOX}.choices`]: `${INTRO_CHOICES_MIN} or ${INTRO_CHOICES_MAX} replies the visitor picks from instead of a tap, each leading to a box of its own.`,
  [`${CHOICE}.label`]: 'The reply on its button, in the visitor’s words. Keep it short.',
  [`${CHOICE}.next`]: 'The box this reply goes to. Boxes after different replies can lead back to the same one.',
  'invitation.text':
    'Style words in his lines and the intro with tags: {red|word} colors it; {wave|…}, {shake|…}, {bold|…} and {big|…} add an effect.',
  'invitation.text.colors':
    'The color names a tag can use, like {gold|this}. A tag also takes a hex color itself: {#e44544|this}.',
  [`${COLOR}.name`]: 'What a tag calls it: lowercase letters, numbers and dashes, like {red|word}.',
  [`${COLOR}.color`]: 'The color its letters show in, in the chat box and his bubble.',
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
  [`${BOX}.auto`]: INTRO_AUTO,
};

/** Its longer explanations (folded under the help: "More"). */
export const INVITATION_MORE = {
  'invitation.defaults':
    'DS and Soft stay as they are: these values make the Default style, first in the Look menu’s Style row (Reset To Style brings them back).',
  'invitation.speech':
    'One bubble at a time: while a line is up, only a moment that matters more replaces it (being caught or shaken first, idle time last).\n' +
    'A moment whose chance doesn’t come up just passes; its cooldown starts only once it has spoken.',
  'invitation.lines': `Up to ${LINES_MAX} lines a moment, each up to ${LINE_MAX} characters (past 80 they wrap a lot in his bubble). A moment with no lines says nothing.`,
  'invitation.intro':
    'A tap anywhere goes on: the first finishes the typing, the next goes to the next box. Space or Enter goes on too; Escape offers to skip it.\n' +
    'Auto goes on by itself after each line’s wait, Next jumps to the next choice or the end, and Log lists the lines so far.\n' +
    'While it plays he stays put, facing you; once it ends, the camera eases back and he plays as before.',
  'invitation.text':
    'Combine them with commas: {red,wave|Hey!}. A tag can hold one more: {gold|a {wave|big} deal}, but no deeper.\n' +
    'Write \\{ or \\} for a brace; *, ** and ~ are only text. An emoji counts as one letter.\n' +
    'The typing, Auto’s wait and the length limits count only the letters that show. A preview under each line shows it as the toy does.',
  'invitation.intro.boxes':
    'Choices come first, then End, then Next: with choices, a box waits for a reply; with none of the three, a tap goes to the box after it, and the last box ends the intro.\n' +
    'A box nothing leads to, or boxes that go round with no choice to leave, get a warning.',
};

/** Extra words the search finds its sections by. */
export const INVITATION_KEYWORDS = {
  'invitation.defaults': ['newt', 'look menu', 'pixel size', 'default style'],
  'invitation.speech': ['newt', 'speech bubble', 'talk', 'chatty'],
  'invitation.lines': ['newt', 'speech bubble', 'talk', 'say', 'words'],
  'invitation.intro': ['newt', 'dialogue', 'chat', 'play intro', 'story', 'cutscene', 'uma musume'],
  'invitation.text': ['newt', 'color', 'colour', 'wave', 'shake', 'bold', 'big', 'tags', 'markup', 'style'],
};

/** Its triggers by the plan's kinds (the quiet spell with Passive). */
export const INVITATION_SUBGROUPS = {
  'invitation.speech': TALK_KINDS.map((g) =>
    g.label === 'Passive' ? { ...g, keys: ['idleMin', 'idleMax', ...g.keys] } : g,
  ),
  'invitation.lines': TALK_KINDS,
};

/** A face's name in the list, where the face's own needs a word more. */
const FACE_LABELS = { shy: 'Shy (Blushing)', blink: 'Blink (Eyes Closed)' };
/** Each shot in the list: what it shows. */
const CAMERA_LABELS = {
  close: 'Close: Head & Shoulders',
  medium: 'Medium: Whole Body',
  wide: 'Wide: Default View',
  keep: 'Keep: As It Was',
};
/** The clips whose names aren't words as they are (the rest go as named). */
const CLIP_LABELS = {
  SitDown: 'Sit Down',
  StandUp: 'Stand Up',
  LieDown: 'Lie Down',
  GetUp: 'Get Up',
  DeviceSit: 'Sit With Device',
  DeviceLie: 'Lie With Device',
};
/**
 * What a box has him do, in the list: none, or a clip and how a box plays it (clips.js
 * DIALOGUE_WAYS: in place, or dangling from an unseen hand; then whether it holds or plays once).
 */
const animationLabel = (v) => {
  if (v === 'none') return titleCase('None (Keep What He’s Doing)');
  const way = { inPlace: 'In Place, ', dangling: 'Dangling, ' }[DIALOGUE_WAYS[v]] ?? '';
  return titleCase(`${CLIP_LABELS[v] ?? v} (${way}${dialogueHolds(v) ? 'Loops' : 'Once'})`);
};
/** The start of a line, for a list: up to 28 characters. */
const snippet = (text) => {
  const s = Array.from(String(text ?? '').trim());
  return s.length > 28 ? `${s.slice(0, 27).join('')}…` : s.join('');
};
/** The draft's chat boxes (none when it has no intro). */
const introBoxes = (d) => {
  const boxes = d?.invitation?.intro?.boxes;
  return Array.isArray(boxes) ? boxes.filter((b) => b && typeof b === 'object') : [];
};

/**
 * The boxes a field can go to, each by its id and how its line starts; `empty`: what an empty
 * one means there (left out where it has to name a box). What the field at `path` holds stays
 * in the list when no box has it (a box renamed or deleted), marked, so it shows and can be put
 * right; empty there, it asks for a pick.
 * @param {any} d @param {(string|number)[] | undefined} path @param {string} [empty]
 */
function boxOptions(d, path, empty) {
  const out = empty ? [{ value: '', label: empty }] : [];
  for (const b of introBoxes(d))
    if (typeof b.id === 'string' && b.id && !out.some((o) => o.value === b.id))
      out.push({ value: b.id, label: snippet(b.text) ? `${b.id}: ${snippet(b.text)}` : b.id });
  const current = path ? getAt(d, path) : undefined;
  if (typeof current === 'string' && !out.some((o) => o.value === current)) {
    if (current) out.push({ value: current, label: `${current} (No Such Box)` });
    else out.unshift({ value: '', label: '(Pick a Box)' });
  }
  return out;
}

/** Its dropdowns: (draft, the field's path) → [{ value, label }]. */
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
  'invitation.intro.start': (d, path) => boxOptions(d, path),
  [`${BOX}.next`]: (d, path) => boxOptions(d, path, 'The Box After It'),
  [`${CHOICE}.next`]: (d, path) => boxOptions(d, path),
  [`${BOX}.face`]: () => FACE_NAMES.map((v) => ({ value: v, label: titleCase(FACE_LABELS[v] ?? v) })),
  [`${BOX}.animation`]: () => INTRO_ANIMATIONS.map((v) => ({ value: v, label: animationLabel(v) })),
  [`${BOX}.camera`]: () => INTRO_CAMERAS.map((v) => ({ value: v, label: titleCase(CAMERA_LABELS[v] ?? v) })),
};
/**
 * The dropdowns made from the chat boxes, by the list they're made from: an edit in it (a box
 * renamed, its line rewritten) remakes them as it's typed.
 */
export const INVITATION_OPTIONS_FROM = {
  'invitation.intro.start': 'invitation.intro.boxes',
  [`${BOX}.next`]: 'invitation.intro.boxes',
  [`${CHOICE}.next`]: 'invitation.intro.boxes',
};

/** “+ Add …” on each trigger's lines, the chat boxes and a box's choices. */
export const INVITATION_ADD_LABELS = {
  ...Object.fromEntries(TRIGGERS.map((k) => [`invitation.lines.${k}`, 'line'])),
  'invitation.intro.boxes': 'box',
  [`${BOX}.choices`]: 'choice',
  'invitation.text.colors': 'color',
};

/** A chat box as content.json keeps it: every field, the optional ones empty (`o` sets some). */
const introBox = (o) => ({
  id: '',
  speaker: '',
  text: '',
  face: 'neutral',
  animation: 'Talk',
  camera: 'keep',
  next: '',
  end: false,
  auto: 0,
  choices: [],
  ...o,
});

/**
 * What “+ Add” makes on the Intro: a box with every field (the form shows only the fields an
 * entry has; the form gives it an id no box has), and a choice with its label and box to pick.
 */
export const INVITATION_TEMPLATES = {
  'invitation.intro.boxes': () => introBox({}),
  [`${BOX}.choices`]: () => ({ label: '', next: '' }),
  'invitation.text.colors': () => ({ name: '', color: '#3a7bd5' }),
};
/**
 * Every field an entry shows, whatever it holds: a box written by hand or copied (content.js
 * FALLBACK_INTRO leaves its optional fields out) shows the ones it lacks too, each as the toy
 * plays it, blank where the rules want a pick (its face, animation and camera), so it can be
 * filled in. The draft changes only once one is edited.
 */
export const INVITATION_FIELDS = {
  [BOX]: () => ({ ...introBox({}), face: '', animation: '', camera: '' }),
};
/** Lists whose entries can't be hidden (◉): the toy has no way to skip a box, a choice or a color. */
export const INVITATION_NO_HIDING = ['invitation.intro.boxes', `${BOX}.choices`, 'invitation.text.colors'];
/** The most entries a list takes: “+ Add” goes once it has them. */
export const INVITATION_MAX_ENTRIES = { [`${BOX}.choices`]: INTRO_CHOICES_MAX };

/** Where a box goes on: its choices, the end, or a box (its own Next, else the one after it). */
function flowOf(b, list, i) {
  const choices = Array.isArray(b.choices) ? b.choices.length : 0;
  if (choices) return titleCase(`${choices} choice${choices === 1 ? '' : 's'}`);
  if (b.end === true) return 'Ends';
  const next = typeof b.next === 'string' && b.next ? b.next : list[i + 1]?.id;
  return next ? `→ ${next}` : 'Ends';
}
/**
 * The line under a card's title (its line, for a box; its words, for a choice): (entry, its list,
 * its index) → text. A box: its id, face, move, shot and where it goes; a choice: its box; a
 * text color: its hex (form.js shows its swatch too).
 */
export const INVITATION_CARD_META = {
  'invitation.intro.boxes': (b, list, i) =>
    [
      b.id,
      titleCase(b.face ?? ''),
      b.animation === 'none' ? 'As He Was' : b.animation,
      titleCase(b.camera ?? ''),
      flowOf(b, list, i),
    ]
      .filter(Boolean)
      .join(' · '),
  [`${BOX}.choices`]: (c) => `→ ${c.next || '?'}`,
  'invitation.text.colors': (c) => (typeof c.color === 'string' ? c.color : ''),
};

/** The style the toy's built-in Default is built on (looks/default.js spreads Soft). */
const DEFAULT_BUILT_ON = 'soft';

/**
 * Each section from the toy's own built-in values, for a content.json without it (a fresh copy
 * each call): the Default look (the built-in Default style: Soft with the Default preset's
 * Shader values, at the built-in Pixel Size and Motion), the speech (speech.js SPEECH_DEFAULTS),
 * every trigger's lines, none yet, and the intro: the toy's own short one (content.js
 * FALLBACK_INTRO, which the toy can't hand the admin: it reads its content through Vite;
 * test/invitationIntro.test.mjs holds the two together), every field in place.
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
  'invitation.intro': () => ({
    speaker: 'NEWT',
    start: 'hi',
    boxes: [
      introBox({ id: 'hi', text: 'Oh, hi! I’m NEWT.', face: 'happy', animation: 'Wave', camera: 'medium' }),
      introBox({
        id: 'soon',
        text: 'Something’s on its way to you. Keep an eye out!',
        face: 'smug',
        animation: 'Point',
        camera: 'close',
      }),
      introBox({
        id: 'bye',
        text: 'Until then, poke me all you like.',
        face: 'happy',
        animation: 'Cheer',
        camera: 'wide',
        end: true,
      }),
    ],
  }),
  'invitation.text': () => ({ colors: DEFAULT_TEXT_COLORS.map((c) => ({ ...c })) }),
};

/** The fields with a live preview under them (form.js): each chat box's text and each line. */
export const INVITATION_PREVIEWS = new Set([`${BOX}.text`, ...TRIGGERS.map((k) => `invitation.lines.${k}[]`)]);
/**
 * The text effects' colours the preview draws with: the draft's (as the toy reads them,
 * content.js), else the toy's own.
 * @param {any} d
 */
export const previewPalette = (d) => {
  const colors = d?.invitation?.text?.colors;
  return paletteOf(Array.isArray(colors) ? colors : DEFAULT_TEXT_COLORS);
};
