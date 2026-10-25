// The Invitation page's intro preview (admin/ui/introPreview.js), on a stand-in document: the
// pane (the toy framed as /invitation/?preview with this page's origin, a box picker, Play,
// Replay, Next and a Desktop/Phone toggle, Title Case labels, help in sentences, no style or
// title attributes); what it sends (only once the toy says it's ready, only to the site's origin,
// the draft's intro and colours, the box picked, the size, restart only for Replay; the toy's own
// intro for a draft with none); what it takes (only the frame's answers at the site's origin: the
// box playing, where Next goes, done); the box being edited picked; edits to the intro played
// again once something has played, debounced, and edits elsewhere not. The words are the test's own.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// ---- a stand-in document: enough DOM for el() and the pane ---------------------------------
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.listeners = {};
    this.styles = [];
    this.style = { setProperty: (k, v) => this.styles.push([k, String(v)]) };
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this._value = '';
    if (tag === 'iframe') {
      this.sent = [];
      this.contentWindow = { postMessage: (msg, to) => this.sent.push([msg, to]) };
      this.src = '';
    }
  }
  get value() {
    if (this.tagName !== 'SELECT') return this._value;
    return this._value || this.children[0]?.getAttribute('value') || '';
  }
  set value(v) {
    this._value = v;
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
    if (k === 'value') this._value = String(v);
  }
  getAttribute(k) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type) {
    for (const fn of this.listeners[type] ?? []) fn({ target: this });
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
}
globalThis.document = /** @type {any} */ ({ createElement: (tag) => new FakeElement(tag) });

// (The toy's own names, from src/invitation/preview.js: content.js reads the virtual module.)
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'virtual:invitation-content')
    return { url: 'data:text/javascript,' + encodeURIComponent('export default {}'), shortCircuit: true };
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
const toy = await import('../../src/invitation/preview.js');
const {
  INTRO_PREVIEW_MESSAGE,
  INTRO_PREVIEW_STATE,
  INTRO_PREVIEW_SIZES,
  boxAt,
  createIntroPreview,
  previewBoxes,
  previewMessage,
} = await import('../ui/introPreview.js');
const { INVITATION_STARTERS } = await import('../ui/invitationSchema.js');
const { DEFAULT_TEXT_COLORS } = await import('../../src/invitation/markup.js');
const { titleCase } = await import('../ui/text.js');

const ADMIN = 'https://admin.example.dev';
const SITE = 'https://site.example.dev';
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
const draftOf = () => ({
  invitation: {
    text: { colors: [{ name: 'tint', color: '#2a9d4b' }] },
    speech: { idleMin: 8 },
    intro: {
      speaker: 'Tester',
      start: 'a',
      boxes: [
        box('a', { text: 'A first line that goes on for a good while longer than most.' }),
        box('b', {
          choices: [
            { label: 'Yes', next: 'c' },
            { label: 'No', next: 'a' },
          ],
        }),
        box('c', { end: true }),
        box('a', { text: 'A doubled id.' }),
        { text: 'no id' },
      ],
    },
  },
});

/** The pane on a stand-in window, with what it sent and a way to answer as the frame. */
function setup(draft = draftOf()) {
  const listeners = [];
  const win = {
    location: { href: `${ADMIN}/#invitation` },
    addEventListener: (type, fn) => type === 'message' && listeners.push(fn),
  };
  const p = createIntroPreview(`${SITE}/`, { draft: () => draft, win, settle: 300 });
  const nodes = [p.pane, ...p.pane.all()];
  const frame = nodes.find((n) => n.tagName === 'IFRAME');
  const picker = nodes.find((n) => n.tagName === 'SELECT');
  const buttons = Object.fromEntries(nodes.filter((n) => n.tagName === 'BUTTON').map((b) => [b.textContent, b]));
  const answer = (data, o = {}) => {
    for (const fn of listeners) fn({ source: frame.contentWindow, origin: SITE, data, ...o });
  };
  const state = (s, o = {}) => answer({ type: INTRO_PREVIEW_STATE, state: s, ...o });
  const sent = () =>
    frame.sent.map(([msg, to]) => {
      assert.equal(to, SITE, 'only to the site');
      return msg;
    });
  return { p, nodes, frame, picker, buttons, answer, state, sent, draft };
}

test('the names agree with the toy’s', () => {
  assert.equal(INTRO_PREVIEW_MESSAGE, toy.PREVIEW_MESSAGE);
  assert.equal(INTRO_PREVIEW_STATE, toy.PREVIEW_STATE);
  assert.deepEqual(Object.keys(INTRO_PREVIEW_SIZES), [...toy.PREVIEW_VIEWPORTS]);
});

test('the pane renders: the toy framed as ?preview with this origin, a picker, Play, Replay, Next, the sizes', () => {
  const { p, nodes, frame, picker, buttons } = setup();
  p.open();
  const src = new URL(frame.src);
  assert.equal(src.origin, SITE);
  assert.equal(src.pathname, '/invitation/');
  assert.ok(src.searchParams.has('preview'));
  assert.equal(src.searchParams.get('admin'), ADMIN, 'told the admin’s origin');
  assert.ok(frame.getAttribute('aria-label'), 'the frame is named');
  assert.equal(nodes.find((n) => n.tagName === 'H2').textContent, 'Intro Preview');
  // (The boxes the toy can play: the first of a doubled id, none without one; each by its line's start.)
  assert.deepEqual(
    picker.children.map((o) => o.getAttribute('value')),
    ['a', 'b', 'c'],
  );
  assert.equal(picker.children[0].textContent, 'a: A first line that goes on f…');
  assert.equal(picker.getAttribute('aria-label'), 'Box');
  assert.deepEqual(Object.keys(buttons), ['Play', 'Replay', 'Next', 'Desktop', 'Phone']);
  assert.equal(buttons.Next.disabled, true, 'Next waits for the toy to say where');
  assert.equal(buttons.Desktop.getAttribute('aria-pressed'), 'true');
  assert.equal(buttons.Phone.getAttribute('aria-pressed'), 'false');
  for (const n of nodes) {
    assert.ok(!n.attrs.has('style') && !n.attrs.has('title'), `${n.tagName}: no style or title attribute`);
    const label = n.tagName === 'BUTTON' || n.tagName === 'H2' ? n.textContent : null;
    if (label) assert.equal(label, titleCase(label), `${label}: Title Case`);
    const tip = n.getAttribute('data-tip');
    if (tip) assert.ok(tip.length >= 12 && tip.length <= 160, `${tip}: a sentence`);
  }
  const help = nodes.find((n) => n.className === 'help').textContent;
  assert.ok(help.length <= 160 && /draft/i.test(help) && /saved/i.test(help), help);
  // (Sized through the style object, the frame at a desktop's size.)
  assert.deepEqual(frame.styles.slice(0, 2), [
    ['width', '1280px'],
    ['height', '800px'],
  ]);
});

test('picking a box sends it, once the toy is ready, to the site only; Replay restarts, Phone sizes', () => {
  const { picker, buttons, state, sent, frame, draft } = setup();
  picker.value = 'c';
  picker.fire('change');
  assert.equal(sent().length, 0, 'nothing before the toy is ready');
  state('ready');
  assert.equal(sent().length, 1, 'then the box asked for');
  assert.deepEqual(sent()[0], {
    type: INTRO_PREVIEW_MESSAGE,
    script: draft.invitation.intro,
    palette: draft.invitation.text.colors,
    box: 'c',
    viewport: 'desktop',
    restart: false,
  });
  assert.notEqual(sent()[0].script, draft.invitation.intro, 'a copy, not the draft itself');
  buttons.Replay.fire('click');
  assert.equal(sent().at(-1).restart, true);
  assert.equal(sent().at(-1).box, 'c');
  buttons.Phone.fire('click');
  assert.equal(buttons.Phone.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(frame.styles.slice(-3, -1), [
    ['width', '390px'],
    ['height', '780px'],
  ]);
  picker.value = 'a';
  picker.fire('change');
  assert.deepEqual([sent().at(-1).box, sent().at(-1).viewport, sent().at(-1).restart], ['a', 'phone', false]);
  buttons.Play.fire('click');
  assert.equal(sent().at(-1).restart, false);
});

test('it follows the toy: the box playing, Next where it goes, done; other origins and frames ignored', () => {
  const { picker, buttons, state, answer, sent, nodes } = setup();
  const chip = nodes.find((n) => n.className === 'preview-state');
  state('ready');
  buttons.Play.fire('click');
  state('playing', { box: 'b', next: null, choices: true });
  assert.equal(picker.value, 'b', 'the picker follows a tap or a reply in the frame');
  assert.equal(buttons.Next.disabled, true, 'a box with replies: pick one');
  assert.match(chip.textContent, /Playing b/);
  state('playing', { box: 'a', next: 'b', choices: false });
  assert.equal(buttons.Next.disabled, false);
  const before = sent().length;
  buttons.Next.fire('click');
  assert.equal(sent().length, before + 1);
  assert.equal(sent().at(-1).box, 'b', 'Next plays the box it goes on to');
  // (Answers from elsewhere change nothing.)
  answer(
    { type: INTRO_PREVIEW_STATE, state: 'playing', box: 'c', next: null },
    { origin: 'https://elsewhere.example' },
  );
  answer({ type: INTRO_PREVIEW_STATE, state: 'playing', box: 'c', next: null }, { source: {} });
  answer({ type: 'nh:ready' });
  assert.equal(picker.value, 'b');
  state('done');
  assert.equal(buttons.Next.disabled, true);
  assert.equal(chip.textContent, 'Done');
  // (Loaded again, it says ready again: the box picked plays again.)
  state('ready');
  assert.equal(sent().at(-1).box, 'b');
});

test('the box being edited is picked; edits to the intro play it again, debounced, once something has', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { p, picker, buttons, state, sent, draft } = setup();
    state('ready');
    p.edit('invitation.intro.boxes[2].text');
    assert.equal(picker.value, 'c', 'its box');
    p.edit('invitation.speech.idleMin');
    assert.equal(picker.value, 'c', 'a field outside the boxes: no change');
    mock.timers.tick(1000);
    assert.equal(sent().length, 0, 'nothing plays by itself before Play');
    draft.invitation.intro.boxes[2].text = 'Edited.';
    p.update();
    mock.timers.tick(1000);
    assert.equal(sent().length, 0);
    buttons.Play.fire('click');
    assert.equal(sent().length, 1);
    // (Typing: one play once it settles, with the new words.)
    draft.invitation.intro.boxes[2].text = 'Edited again';
    p.update();
    draft.invitation.intro.boxes[2].text = 'Edited again.';
    p.update();
    mock.timers.tick(299);
    assert.equal(sent().length, 1);
    mock.timers.tick(1);
    assert.equal(sent().length, 2);
    assert.equal(sent().at(-1).script.boxes[2].text, 'Edited again.');
    // (The colours too; an edit elsewhere on the page plays nothing.)
    draft.invitation.text.colors[0].color = '#123456';
    p.update();
    mock.timers.tick(300);
    assert.equal(sent().at(-1).palette[0].color, '#123456');
    const n = sent().length;
    draft.invitation.speech.idleMin = 9;
    p.update();
    mock.timers.tick(1000);
    assert.equal(sent().length, n, 'not the speech');
    // (Editing another box, once armed, plays that one.)
    p.edit('invitation.intro.boxes[0].face');
    mock.timers.tick(300);
    assert.equal(sent().at(-1).box, 'a');
    // (A box renamed: the picker has the new id.)
    draft.invitation.intro.boxes[0].id = 'first';
    p.update();
    assert.ok(picker.children.some((o) => o.getAttribute('value') === 'first'));
  } finally {
    mock.timers.reset();
  }
});

test('a draft with no intro plays the toy’s own, in its own colours; one with no boxes says so', () => {
  const msg = previewMessage({}, 'hi');
  assert.deepEqual(msg.script, INVITATION_STARTERS['invitation.intro']());
  assert.deepEqual(msg.palette, DEFAULT_TEXT_COLORS);
  assert.deepEqual(
    previewBoxes({}).map((b) => b.id),
    INVITATION_STARTERS['invitation.intro']().boxes.map((b) => b.id),
  );
  assert.equal(boxAt(draftOf(), 'invitation.intro.boxes[1].choices[0].label'), 'b');
  assert.equal(boxAt(draftOf(), 'invitation.intro.boxes[4].text'), null, 'a box with no id');
  assert.equal(boxAt(draftOf(), 'invitation.intro.start'), null);
  const { buttons, nodes } = setup({ invitation: { intro: { speaker: 'x', start: '', boxes: [] } } });
  assert.equal(buttons.Play.disabled, true);
  assert.equal(nodes.find((n) => n.className === 'preview-state').textContent, 'No Boxes Yet');
});

test('the Invitation page has it, beside the page; the docs say how it works', () => {
  const schema = readFileSync(new URL('../ui/schema.js', import.meta.url), 'utf8');
  assert.ok(/id: 'invitation',[\s\S]*?introPreview: true/.test(schema), 'the page asks for it');
  const main = readFileSync(new URL('../ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /createIntroPreview\(/);
  assert.match(main, /introPreview\.edit\(/, 'it hears which box is being edited');
  assert.match(main, /introPreview\.update\(/, 'and of every change to the draft');
  const docs = readFileSync(new URL('../../docs/admin.md', import.meta.url), 'utf8');
  assert.match(docs, /\*\*Intro Preview\*\*/);
  assert.match(readFileSync(new URL('../../docs/invitation.md', import.meta.url), 'utf8'), /\?preview/);
});
