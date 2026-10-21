// The Invitation page's Intro section (content.json `invitation.intro`, the chat Play Intro
// opens; admin/ui/invitationSchema.js through schema.js): the speaker, the start box and the
// chat boxes as a reorderable list, each with its Text (several lines), Face, Animation, Camera,
// Auto wait, Next box, Choices (up to 3, each a label and the box it leads to), End and a
// Speaker override, every field named and helped. Boxes are picked from a list of the boxes
// there are (one that's gone still shows, marked); a new box comes with every field and an id of
// its own; boxes and choices can't be hidden (the toy has no way to skip one); a box's card is
// titled by its line, with its id, face, move, shot and where it goes under it; the search finds
// a box's fields under its line. Rendered on a stand-in document. The words are the test's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INTRO_ANIMATIONS,
  INTRO_AUTO,
  INTRO_CAMERAS,
  INTRO_CHOICES_MAX,
  INTRO_CHOICES_MIN,
  validateContent,
} from '../../src/contentRules.js';
import { CLIPS, FACE_NAMES } from '../../src/invitation/clips.js';

// ---- a stand-in document: enough DOM for el() and the form ---------------------------------
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.id = '';
    this.value = '';
    const classes = () => this.className.split(' ').filter(Boolean);
    this.classList = {
      add: (...c) => {
        this.className = [...new Set([...classes(), ...c])].join(' ');
      },
      remove: (...c) => {
        this.className = classes()
          .filter((x) => !c.includes(x))
          .join(' ');
      },
      contains: (c) => classes().includes(c),
    };
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  append(...kids) {
    for (const k of kids) if (typeof k === 'object') this.children.push(k);
  }
  replaceChildren(...kids) {
    this.children = [];
    this.append(...kids);
  }
  *all() {
    for (const c of this.children) {
      yield c;
      yield* c.all();
    }
  }
  matches(sel) {
    return sel
      .split(',')
      .map((s) => s.trim().split(/\s+/).at(-1))
      .some((s) =>
        s.startsWith('[')
          ? this.attrs.has(s.slice(1, -1))
          : s.startsWith('.')
            ? this.classList.contains(s.slice(1))
            : this.tagName === s.toUpperCase(),
      );
  }
  querySelector(sel) {
    for (const n of this.all()) if (n.matches(sel)) return n;
    return null;
  }
  querySelectorAll(sel) {
    return [...this.all()].filter((n) => n.matches(sel));
  }
}
globalThis.document = /** @type {any} */ ({
  createElement: (tag) => new FakeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
});
globalThis.CSS ??= /** @type {any} */ ({ escape: (s) => s });

const { ADD_LABELS, HELP, LABELS, PAGES, SELECTS, STARTERS, TEMPLATES, hint, keywordsFor, rangeFor, resolveHelp } =
  await import('../ui/schema.js');
const { renderValue, titleOf } = await import('../ui/form.js');
const { buildIndex, crumbsOf, pageOf } = await import('../ui/search.js');
const { patternOf } = await import('../ui/paths.js');
const { titleCase } = await import('../ui/text.js');

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
/** A box as the admin stores one (the test's own words). */
const box = (id, o = {}) => ({
  id,
  speaker: '',
  text: `Line ${id}.`,
  face: 'neutral',
  animation: 'Talk',
  camera: 'keep',
  next: '',
  end: false,
  auto: 0,
  choices: [],
  ...o,
});
const intro = () => ({
  speaker: 'Tester',
  start: 'a',
  boxes: [
    box('a', { text: 'First of all.' }),
    box('b', {
      text: 'Pick one.',
      animation: 'Think',
      camera: 'close',
      choices: [
        { label: 'Left', next: 'c' },
        { label: 'Right', next: 'd' },
      ],
    }),
    box('c', { text: 'Left it is.', next: 'e' }),
    box('d', { text: 'Right it is.', face: 'smug' }),
    box('e', { text: 'The end.', face: 'happy', animation: 'Wave', camera: 'wide', end: true }),
  ],
});
/** content.json with this intro. */
const draftWith = (it = intro()) => {
  const c = content();
  c.invitation = { ...(c.invitation ?? {}), intro: it };
  return c;
};
const PATH = ['invitation', 'intro'];

/** The form for the draft's intro, and a way to find things in it. */
function render(draft) {
  const calls = [];
  const ctx = {
    draft,
    uploads: new Map(),
    open: new WeakSet(),
    fresh: new WeakSet(),
    drag: null,
    focus: null,
    siteUrl: '',
    preview: null,
    changed: (o) => calls.push(o),
    toast() {},
    busy() {},
    thumb: () => 'blob:x',
  };
  const root = renderValue(draft.invitation.intro, PATH, ctx);
  const nodes = [root, ...root.all()];
  const byPath = (key) => nodes.find((n) => n.getAttribute('data-path') === key);
  return { root, nodes, byPath, ctx, calls };
}
const options = (select) => select.children.map((o) => [o.getAttribute('value'), o.textContent]);
const fieldControl = (r, key, tag) => r.byPath(key).querySelector(tag);

// ---- the schema ------------------------------------------------------------------------------

test('the Invitation page ends with an Intro section, found on it', () => {
  const page = PAGES.find((p) => p.id === 'invitation');
  assert.equal(page.keys.at(-1), 'invitation.intro');
  assert.ok(page.blurb.length <= 160 && /intro/i.test(page.blurb), 'its blurb says so');
  assert.equal(titleCase(LABELS['invitation.intro']), 'Intro');
  assert.equal(pageOf('invitation.intro.boxes[3].face').id, 'invitation');
  assert.ok(keywordsFor('invitation.intro').includes('dialogue'), 'found by what it is');
});

/** Every path in the intro (groups and fields), as the editor walks it. */
function walk(v, path = PATH, out = []) {
  out.push(path);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i], out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, k], out);
  return out;
}

test('every field in it is named and helped, in a sentence that isn’t its name', () => {
  const it = intro();
  it.boxes[0].speaker = 'Mystery';
  for (const path of walk(it)) {
    if (typeof path.at(-1) === 'number') continue; // (an entry: its card is titled by what it says)
    const pattern = patternOf(path);
    const label = hint(LABELS, pattern);
    assert.ok(label && pattern in LABELS, `${pattern}: a label of its own`);
    assert.ok(titleCase(label).length <= 48, `${pattern}: a short label`);
    assert.ok(pattern in HELP, `${pattern}: help of its own (not another list’s)`);
    const help = resolveHelp(HELP[pattern], {});
    assert.ok(help.length >= 12 && help.length <= 160, `${pattern}: help a sentence long (${help.length})`);
    assert.notEqual(help.toLowerCase(), titleCase(label).toLowerCase(), `${pattern}: more than its label`);
  }
  for (const [k, word] of [
    ['invitation.intro.boxes', 'Box'],
    ['invitation.intro.boxes[].choices', 'Choice'],
  ])
    assert.equal(titleCase(hint(ADD_LABELS, k)), word, `+ Add ${word}`);
});

test('the boxes to go to are a list of the boxes there are; a box that’s gone still shows, marked', () => {
  const d = draftWith();
  const ids = d.invitation.intro.boxes.map((b) => b.id);
  const values = (pattern, path) => SELECTS[pattern](d, path).map((o) => o.value);
  const labelsOf = (pattern, path) => SELECTS[pattern](d, path).map((o) => o.label);
  assert.deepEqual(values('invitation.intro.start', [...PATH, 'start']), ids);
  assert.ok(
    labelsOf('invitation.intro.start', [...PATH, 'start']).every((l, i) => l.startsWith(ids[i])),
    'each by its id…',
  );
  assert.match(labelsOf('invitation.intro.start', [...PATH, 'start'])[0], /First of all/, '…and what it says');
  const next = [...PATH, 'boxes', 0, 'next'];
  assert.deepEqual(values('invitation.intro.boxes[].next', next), ['', ...ids], 'empty: the box after it');
  const choice = [...PATH, 'boxes', 1, 'choices', 0, 'next'];
  assert.deepEqual(values('invitation.intro.boxes[].choices[].next', choice), ids);
  // A box renamed or deleted: the field still shows what it holds, so it can be put right.
  d.invitation.intro.boxes[0].next = 'gone';
  d.invitation.intro.boxes[1].choices[0].next = '';
  const gone = SELECTS['invitation.intro.boxes[].next'](d, next);
  assert.deepEqual(
    gone.map((o) => o.value),
    ['', ...ids, 'gone'],
  );
  assert.match(gone.at(-1).label, /gone.*no such box/i);
  const blank = SELECTS['invitation.intro.boxes[].choices[].next'](d, choice);
  assert.deepEqual(
    blank.map((o) => o.value),
    ['', ...ids],
  );
  assert.match(blank[0].label, /pick/i);
  // Without a field's path, every box.
  assert.deepEqual(
    SELECTS['invitation.intro.boxes[].next'](d).map((o) => o.value),
    ['', ...ids],
  );
});

test('Face, Animation and Camera are the toy’s own lists; Auto a slider in its range', () => {
  const d = draftWith();
  const sel = (k) => SELECTS[`invitation.intro.boxes[].${k}`](d);
  assert.deepEqual(
    sel('face').map((o) => o.value),
    FACE_NAMES,
  );
  assert.deepEqual(
    sel('animation').map((o) => o.value),
    INTRO_ANIMATIONS,
  );
  assert.deepEqual(
    sel('camera').map((o) => o.value),
    INTRO_CAMERAS,
  );
  for (const list of [sel('face'), sel('animation'), sel('camera')])
    for (const o of list) assert.equal(o.label, titleCase(o.label), `${o.value}: in Title Case`);
  // A gesture says it plays once; a loop that it keeps going.
  const anim = Object.fromEntries(sel('animation').map((o) => [o.value, o.label]));
  assert.match(anim.Nod, /once/i);
  assert.match(anim.Think, /loop/i);
  for (const k of INTRO_ANIMATIONS.filter((a) => a !== 'none'))
    assert.match(anim[k], CLIPS[k].loop ? /loop/i : /once/i, k);
  assert.deepEqual(rangeFor('invitation.intro.boxes[].auto'), INTRO_AUTO);
});

test('a new box comes with every field, an id of its own and its line to write; a new choice too', () => {
  const b = TEMPLATES['invitation.intro.boxes'](draftWith());
  assert.deepEqual(Object.keys(b).sort(), Object.keys(box('x')).sort(), 'every field, so the form shows each');
  assert.notEqual(TEMPLATES['invitation.intro.boxes'](), TEMPLATES['invitation.intro.boxes'](), 'a copy each time');
  assert.deepEqual(Object.keys(TEMPLATES['invitation.intro.boxes[].choices']()).sort(), ['label', 'next']);
  // Through the form: + Add Box gives it an id no box has.
  const d = draftWith();
  d.invitation.intro.boxes.push(box('box'));
  d.invitation.intro.boxes[3].next = 'box';
  const r = render(d);
  const add = r
    .byPath('invitation.intro.boxes')
    .querySelectorAll('button')
    .find((n) => n.textContent === '+ Add Box');
  assert.ok(add, '+ Add Box');
  add.listeners.click();
  const made = d.invitation.intro.boxes.at(-1);
  assert.equal(made.id, 'box-2', 'an id of its own (no project’s or scene’s in the way)');
  assert.deepEqual(r.calls.at(-1), { rerender: true });
  const errors = validateContent(d).errors.map((e) => e.path);
  assert.deepEqual(errors, ['invitation.intro.boxes[6].text'], 'only its line to write');
});

test('content without an intro: Start From the Toy’s Own gives every field of a short intro that passes', () => {
  const start = STARTERS['invitation.intro']();
  const c = content();
  delete c.invitation.intro;
  assert.deepEqual(validateContent(c).errors, [], 'no intro is fine');
  c.invitation.intro = start;
  const r = validateContent(c);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(
    r.warnings.filter((w) => w.path.startsWith('invitation.intro')),
    [],
  );
  for (const b of start.boxes) assert.deepEqual(Object.keys(b).sort(), Object.keys(box('x')).sort(), b.id);
});

// ---- the form --------------------------------------------------------------------------------

test('the form: the speaker, a list for the start box, and a card per box with each field', () => {
  const d = draftWith();
  const r = render(d);
  assert.ok(fieldControl(r, 'invitation.intro.speaker', 'input'), 'the speaker: a line of text');
  const start = fieldControl(r, 'invitation.intro.start', 'select');
  assert.deepEqual(
    options(start).map(([v]) => v),
    d.invitation.intro.boxes.map((b) => b.id),
  );
  assert.equal(start.value, 'a');
  const cards = r.nodes.filter(
    (n) => n.matches('.card') && /^invitation\.intro\.boxes\[\d+\]$/.test(n.getAttribute('data-path')),
  );
  assert.equal(cards.length, 5, 'a card per box');
  const k = (i, f) => `invitation.intro.boxes[${i}].${f}`;
  assert.ok(fieldControl(r, k(1, 'text'), 'textarea'), 'Text: several lines');
  for (const f of ['face', 'animation', 'camera', 'next']) assert.ok(fieldControl(r, k(1, f), 'select'), f);
  assert.equal(fieldControl(r, k(1, 'face'), 'select').value, 'neutral');
  assert.equal(fieldControl(r, k(1, 'camera'), 'select').value, 'close');
  assert.ok(
    r
      .byPath(k(1, 'auto'))
      .querySelectorAll('input')
      .some((n) => n.getAttribute('type') === 'range'),
    'Auto: a slider',
  );
  assert.equal(fieldControl(r, k(4, 'end'), 'input').getAttribute('type'), 'checkbox', 'End: a switch');
  assert.ok(fieldControl(r, k(0, 'speaker'), 'input'), 'a box’s speaker');
  assert.equal(fieldControl(r, k(1, 'choices[0].next'), 'select').value, 'c', 'a choice leads to a box');
  assert.ok(fieldControl(r, k(1, 'choices[0].label'), 'input'), 'a choice’s label');
});

test('the cards: titled by the line, its id and the rest under it; reorder and delete, never hide', () => {
  const d = draftWith();
  const r = render(d);
  const card = (key) => r.nodes.find((n) => n.matches('.card') && n.getAttribute('data-path') === key);
  const head = (key) => card(key).children[0];
  const b1 = 'invitation.intro.boxes[1]';
  assert.equal(head(b1).querySelector('.card-title').textContent, 'Pick one.');
  const meta = head(b1).querySelector('.card-meta').textContent;
  for (const part of ['b', 'Neutral', 'Think', 'Close', '2 Choices'])
    assert.ok(meta.includes(part), `${meta}: ${part}`);
  assert.match(head('invitation.intro.boxes[0]').querySelector('.card-meta').textContent, /→ b\b/, 'where it goes');
  assert.match(head('invitation.intro.boxes[4]').querySelector('.card-meta').textContent, /Ends/);
  assert.equal(titleOf(d.invitation.intro.boxes[2], 2), 'Left it is.');
  const c0 = `${b1}.choices[0]`;
  assert.equal(head(c0).querySelector('.card-title').textContent, 'Left');
  assert.match(head(c0).querySelector('.card-meta').textContent, /→ c\b/);
  for (const key of [b1, c0]) {
    const actions = head(key)
      .querySelectorAll('button')
      .map((n) => n.getAttribute('aria-label'));
    assert.ok(actions.includes('Move up') && actions.includes('Move down') && actions.includes('Delete'), key);
    assert.ok(!head(key).querySelector('.eye'), `${key}: no hide button (the toy can’t skip one)`);
  }
  // (Other lists keep theirs.)
  const flames = renderValue(d.effects.flames, ['effects', 'flames'], render(d).ctx);
  assert.ok(flames.querySelector('.eye'));
});

test('choices: + Add Choice until there are 3; one alone is a warning, its help says 2 or 3', () => {
  const d = draftWith();
  const r = render(d);
  const addIn = (key) =>
    r
      .byPath(key)
      .querySelectorAll('button')
      .filter((n) => n.textContent === '+ Add Choice');
  assert.equal(addIn('invitation.intro.boxes[1].choices').length, 1, 'two choices: room for one more');
  assert.equal(addIn('invitation.intro.boxes[0].choices').length, 1, 'none yet');
  d.invitation.intro.boxes[1].choices.push({ label: 'Up', next: 'e' });
  assert.equal(d.invitation.intro.boxes[1].choices.length, INTRO_CHOICES_MAX);
  const full = render(d);
  assert.equal(
    full
      .byPath('invitation.intro.boxes[1].choices')
      .querySelectorAll('button')
      .filter((n) => n.textContent === '+ Add Choice').length,
    0,
    'three: no more',
  );
  // (One reply is only a tap: the help asks for 2 or 3, and one gets a warning, at its Choices.)
  const help = resolveHelp(HELP['invitation.intro.boxes[].choices'], {});
  assert.ok(help.includes(`${INTRO_CHOICES_MIN} or ${INTRO_CHOICES_MAX}`), help);
  const one = draftWith();
  one.invitation.intro.boxes[1].choices.pop();
  const r1 = validateContent(one);
  assert.deepEqual(
    r1.errors.filter((e) => e.path.startsWith('invitation.intro')),
    [],
  );
  assert.ok(r1.warnings.some((w) => w.path === 'invitation.intro.boxes[1].choices'));
});

test('renaming a box, or rewriting its line, updates every list of boxes on the page as you type', () => {
  const d = draftWith();
  const r = render(d);
  // (The stand-in document finds what the form rendered.)
  const before = globalThis.document.querySelectorAll;
  globalThis.document.querySelectorAll = (sel) => r.root.querySelectorAll(sel);
  try {
    const id = fieldControl(r, 'invitation.intro.boxes[4].id', 'input');
    id.value = 'finale';
    id.listeners.input();
    assert.equal(d.invitation.intro.boxes[4].id, 'finale');
    const next = fieldControl(r, 'invitation.intro.boxes[2].next', 'select');
    assert.deepEqual(
      options(next).map(([v]) => v),
      ['', 'a', 'b', 'c', 'd', 'finale', 'e'],
      'the new id to pick, and the one it held, marked',
    );
    assert.match(options(next).at(-1)[1], /no such box/i);
    assert.equal(next.value, 'e', 'still showing what it holds');
    const start = fieldControl(r, 'invitation.intro.start', 'select');
    assert.ok(
      options(start).some(([v]) => v === 'finale'),
      'the start box’s list too',
    );
    const choice = fieldControl(r, 'invitation.intro.boxes[1].choices[1].next', 'select');
    assert.ok(
      options(choice).some(([v]) => v === 'finale'),
      'and each choice’s',
    );
    // Picking it there: the list keeps up, the marked one gone.
    next.value = 'finale';
    next.listeners.change();
    assert.equal(d.invitation.intro.boxes[2].next, 'finale');
    assert.deepEqual(
      options(next).map(([v]) => v),
      ['', 'a', 'b', 'c', 'd', 'finale'],
    );
    const text = fieldControl(r, 'invitation.intro.boxes[0].text', 'textarea');
    text.value = 'A brand new first line.';
    text.listeners.input();
    assert.match(options(start).find(([v]) => v === 'a')[1], /A brand new first line/, 'each box by its line');
  } finally {
    globalThis.document.querySelectorAll = before;
  }
});

test('the search finds a box’s fields under its line, and its words', () => {
  const d = draftWith();
  const index = buildIndex(d);
  const at = (id) => index.find((e) => e.id === id);
  const face = at('invitation.intro.boxes[1].face');
  assert.equal(face.page, 'invitation');
  assert.deepEqual(crumbsOf(face), ['Invitation', 'Intro', titleCase(LABELS['invitation.intro.boxes']), 'Pick one.']);
  assert.ok(face.options.includes(SELECTS['invitation.intro.boxes[].face'](d)[0].label), 'its choices');
  assert.equal(at('invitation.intro.boxes[2].text').value, 'Left it is.', 'found by what he says');
  assert.ok(at('invitation.intro.boxes[1].choices[0].next'), 'a choice’s box');
});
