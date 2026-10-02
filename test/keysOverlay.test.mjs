// The keyboard shortcuts overlay (src/ui/keysOverlay.js) and the page helpers it leans on
// (src/ui/shell.js): its markup (groups, a row per shortcut, the keys as <kbd> chips, all
// escaped), its filter (the settings search's matcher over what each does, its keys and its
// group), and `?` asking for it unless someone is typing; the shared typing rule (a slider,
// a checkbox, a radio or a button isn't typing), full screen, and the no-WebGL fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysOverlayMarkup, keyEntries, kbds, isHelpKey } from '../src/ui/keysOverlay.js';
import { buildMatcher } from '../src/ui/settingsSearch.js';
import { typing, toggleFullscreen, failScene, NO_WEBGL, q, qa } from '../src/ui/shell.js';

const GROUPS = [
  {
    title: 'Moments',
    keys: [
      { keys: ['Space'], label: 'Drop now' },
      { keys: ['X'], label: 'Living Weapon' },
    ],
  },
  {
    title: 'Show',
    keys: [
      { keys: ['Shift', 'K'], label: 'Knights come or go' },
      { keys: ['K'], label: 'Knights dance' },
    ],
  },
  {
    title: 'View <& Menus>',
    keys: [
      { keys: ['F'], label: 'Full Screen' },
      { keys: ['?'], label: 'These <keys>' },
    ],
  },
];

test('the overlay’s markup: a title, a close button, a filter, the groups and their rows, escaped', () => {
  const html = keysOverlayMarkup({ groups: GROUPS, id: 'k' });
  assert.match(html, /<h2 class="keys-overlay-title" id="k-title">Keyboard Shortcuts<\/h2>/);
  assert.match(html, /<button type="button" class="keys-overlay-close" data-keys-close aria-label="Close">/);
  assert.match(
    html,
    /<label class="visually-hidden" for="k-filter">Filter Shortcuts<\/label>\s*<input type="search" id="k-filter"[^>]*data-keys-filter>/,
  );
  assert.match(html, /role="status"/);
  assert.equal(
    [...html.matchAll(/<section class="keys-group" data-keys-group="\d" aria-labelledby="k-g\d">/g)].length,
    3,
  );
  assert.deepEqual(
    [...html.matchAll(/data-keys-row="([\d.]+)"/g)].map((m) => m[1]),
    ['0.0', '0.1', '1.0', '1.1', '2.0', '2.1'],
  );
  assert.match(
    html,
    /<dt><kbd>Shift<\/kbd><span class="keys-plus">\+<\/span><kbd>K<\/kbd><\/dt><dd>Knights come or go<\/dd>/,
  );
  assert.match(html, /View &lt;&amp; Menus&gt;/);
  assert.match(html, /<dd>These &lt;keys&gt;<\/dd>/);
  assert.doesNotMatch(html, /<keys>|<& /);
  assert.equal(kbds(['<']), '<kbd>&lt;</kbd>');
  assert.match(keysOverlayMarkup({ title: 'Painter Keys', groups: [] }), /Painter Keys/);
});

test('the filter: what a key does, its keys or its group', () => {
  const match = buildMatcher(keyEntries(GROUPS));
  const rows = (query) => match(query).map((h) => h.entry.id);
  assert.deepEqual(rows('full'), ['2.0']);
  assert.deepEqual(rows('knights'), ['1.0', '1.1']);
  assert.deepEqual(rows('shift k'), ['1.0']);
  assert.deepEqual(rows('moments'), ['0.0', '0.1']);
  assert.deepEqual(rows('space'), ['0.0']);
  assert.deepEqual(keyEntries(GROUPS)[2], {
    id: '1.0',
    label: 'Knights come or go',
    keywords: ['Shift K'],
    section: 'Show',
  });
});

/** A stand-in element for closest(): a tag, a type, an attribute or two. */
const el = (tag, attrs = {}) => ({
  tagName: tag.toUpperCase(),
  type: attrs.type ?? (tag === 'input' ? 'text' : undefined),
  closest(sel) {
    const ok = sel.split(',').some((s) => {
      const one = s.trim();
      if (one.startsWith('[contenteditable]')) return 'contenteditable' in attrs && attrs.contenteditable !== 'false';
      return one === tag;
    });
    return ok ? this : null;
  },
});

test('typing: text-like inputs, textareas, selects and editable text; not sliders, boxes, radios, buttons or colors', () => {
  for (const t of [
    el('input'),
    el('input', { type: 'search' }),
    el('input', { type: 'number' }),
    el('textarea'),
    el('select'),
    el('div', { contenteditable: '' }),
  ])
    assert.equal(typing(t), true, `${t.tagName} ${t.type ?? ''}`);
  for (const type of ['range', 'checkbox', 'radio', 'button', 'submit', 'color'])
    assert.equal(typing(el('input', { type })), false, type);
  assert.equal(typing(el('div', { contenteditable: 'false' })), false);
  assert.equal(typing(el('button')), false);
  assert.equal(typing(null), false);
  assert.equal(typing({}), false, 'not an element');
});

test('? asks for the keys, unless typing or with Ctrl, Alt or Cmd', () => {
  const key = (k, o = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: k === '?',
    target: el('body'),
    ...o,
  });
  assert.equal(isHelpKey(key('?')), true);
  assert.equal(isHelpKey(key('/')), false);
  assert.equal(isHelpKey(key('?', { target: el('input') })), false, 'typing a question mark');
  assert.equal(isHelpKey(key('?', { target: el('input', { type: 'range' }) })), true, 'on a slider: still the keys');
  assert.equal(isHelpKey(key('?', { ctrlKey: true })), false);
  assert.equal(isHelpKey(key('?', { altKey: true })), false);
});

test('shell: q and qa, full screen in and out, the scene that couldn’t start', () => {
  const root = { querySelector: (s) => `one ${s}`, querySelectorAll: (s) => new Set([`a ${s}`, `b ${s}`]) };
  assert.equal(q('.x', root), 'one .x');
  assert.deepEqual(qa('.x', root), ['a .x', 'b .x']);
  const calls = [];
  const doc = {
    fullscreenElement: null,
    exitFullscreen: () => {
      calls.push('exit');
      return Promise.resolve();
    },
  };
  const page = {
    ownerDocument: doc,
    requestFullscreen: () => {
      calls.push('enter');
      return Promise.reject(new Error('denied'));
    },
  };
  toggleFullscreen(page);
  doc.fullscreenElement = page;
  toggleFullscreen(page);
  assert.deepEqual(calls, ['enter', 'exit']);
  toggleFullscreen({ ownerDocument: { fullscreenElement: null } }); // (no Fullscreen API: nothing happens)
  const classes = new Set();
  const failDoc = { documentElement: { classList: { add: (c) => classes.add(c) } } };
  const line = { textContent: '', hidden: true };
  const warn = console.warn;
  const logged = [];
  console.warn = (...a) => logged.push(a);
  try {
    failScene(line, 'no context', { doc: failDoc });
    failScene(null, 'again', { doc: failDoc, log: 'Bonfire unavailable; showing the static portfolio.' });
  } finally {
    console.warn = warn;
  }
  assert.ok(classes.has('no-webgl'));
  assert.deepEqual(line, { textContent: NO_WEBGL, hidden: false });
  assert.match(NO_WEBGL, /^This browser couldn’t start WebGL, so the bonfire can’t render here\./);
  assert.deepEqual(logged, [
    ['Bonfire unavailable.', 'no context'],
    ['Bonfire unavailable; showing the static portfolio.', 'again'],
  ]);
});
