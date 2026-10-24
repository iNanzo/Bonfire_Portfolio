// The password lock in the admin: Settings › Access (admin/ui/schema.js), content.json `gate`.
// Its page sits after Interface with every field named and helped, the help saying plainly what
// the lock keeps out and what it doesn't; content from before the lock starts from the defaults
// (off, no key). Set Password (admin/ui/gateTools.js) is write-only: two new-password boxes,
// hashed in the browser (PBKDF2-SHA256, 600k iterations, a 16-byte salt) into `gate.key` and
// nothing else, the boxes cleared after, the typed text never in the draft (which the admin
// keeps in localStorage `nh-admin-draft`); a short password is warned about; the rules refuse
// one stored as text, so a save can't commit it. The words here are the test's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateContent } from '../../src/contentRules.js';
import { GATE_LOCK, GATE_PAGES, gateDefaults } from '../../src/gate/pages.js';

// ---- a stand-in document with events: enough for el(), the form and the password boxes -------
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
    this.disabled = false;
    this.classList = {
      add: (...c) => (this.className = [...new Set([...this.className.split(' '), ...c])].filter(Boolean).join(' ')),
      remove: (...c) =>
        (this.className = this.className
          .split(' ')
          .filter((x) => x && !c.includes(x))
          .join(' ')),
      contains: (c) => this.className.split(' ').includes(c),
      toggle: (c, on) => (on ? this.classList.add(c) : this.classList.remove(c)),
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
  hasAttribute(k) {
    return this.attrs.has(k);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Run the listeners for `type`; their results (promises, for the async ones). */
  fire(type) {
    return (this.listeners[type] ?? []).map((fn) => fn({ type, target: this, preventDefault() {} }));
  }
  append(...kids) {
    for (const k of kids) if (typeof k === 'object') this.children.push(k);
  }
  replaceChildren(...kids) {
    this.children = [];
    this.append(...kids);
  }
  focus() {}
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
      .some((s) => {
        const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(s);
        if (attr) return attr[2] === undefined ? this.attrs.has(attr[1]) : this.attrs.get(attr[1]) === attr[2];
        return s.startsWith('.') ? this.classList.contains(s.slice(1)) : this.tagName === s.toUpperCase();
      });
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

const { FIELDS, HELP, LABELS, PAGES, STARTERS, SUBGROUPS, moreFor, resolveHelp } = await import('../ui/schema.js');
const { getAt, renderValue } = await import('../ui/form.js');
const { SHORT_PASSWORD, gateKeyField, setPassword } = await import('../ui/gateTools.js');
const { titleCase } = await import('../ui/text.js');

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
/** The page's ctx, on this draft, keeping what it was told. */
const ctxOn = (draft) => {
  const said = { changed: [], toasts: [], busy: [] };
  return {
    said,
    draft,
    uploads: new Map(),
    open: new WeakSet(),
    fresh: new WeakSet(),
    drag: null,
    focus: null,
    siteUrl: 'https://site.test/',
    preview: null,
    changed: (o) => said.changed.push(o ?? {}),
    toast: (msg, kind) => said.toasts.push([msg, kind]),
    busy: (on) => said.busy.push(on),
    thumb: () => 'blob:x',
    labelOf: (k) => k,
  };
};
const tree = (root) => [root, ...root.all()];

test('Settings › Access: the lock’s own page, right after Interface', () => {
  const i = PAGES.findIndex((p) => p.id === 'access');
  assert.ok(i > 0, 'there is an Access page');
  const page = PAGES[i];
  assert.equal(page.group, 'Settings');
  assert.equal(page.label, 'Access');
  assert.deepEqual(page.keys, ['gate']);
  assert.equal(PAGES[i - 1].id, 'interface');
  assert.ok(page.blurb.length > 20 && page.blurb.length <= 160);
});

test('every lock field has a name and help; the help says it keeps visitors out, not the public code', () => {
  const paths = [
    'gate',
    'gate.on',
    'gate.key',
    'gate.remember',
    'gate.pages',
    ...Object.keys(GATE_PAGES).map((k) => `gate.pages.${k}`),
    'gate.lock',
    ...Object.keys(GATE_LOCK).map((k) => `gate.lock.${k}`),
  ];
  for (const p of paths) {
    assert.ok(LABELS[p], `${p}: a name of its own`);
    const help = resolveHelp(HELP[p], {});
    assert.ok(help.length >= 12 && help.length <= 160, `${p}: help in a sentence or two (${help.length})`);
  }
  assert.equal(titleCase(LABELS['gate.on']), 'Lock the Site');
  assert.equal(titleCase(LABELS['gate.pages.live']), 'Bonfire Live');
  const plain = `${HELP.gate} ${moreFor('gate')}`;
  assert.match(plain, /search engines/i, 'what it keeps out');
  assert.match(plain, /public/i, 'and that the code is public');
  assert.match(moreFor('gate'), /Cloudflare|private/i, 'the stronger path');
  // (That a new password locks everyone out again is said once, by the password's own control.)
  assert.match(resolveHelp(HELP['gate.key'], {}), /hash/i, 'kept only as a hash');
  assert.match(resolveHelp(HELP['gate.key'], {}), /passphrase/i, 'a long one is safest');
  assert.ok(SUBGROUPS['gate.lock'], 'the lock page’s words in groups');
  assert.deepEqual(SUBGROUPS['gate.lock'].flatMap((g) => g.keys).sort(), Object.keys(GATE_LOCK).sort());
  assert.deepEqual(
    Object.keys(FIELDS.gate()),
    ['on', 'key', 'remember', 'pages', 'lock'],
    'every field shows, the password too',
  );
  assert.deepEqual(FIELDS['gate.pages'](), GATE_PAGES, 'a missing switch shows its default');
});

test('content from before the lock starts from the defaults: off, no key, passing the rules', () => {
  const start = STARTERS.gate(content());
  assert.deepEqual(start, gateDefaults());
  const c = content();
  c.gate = start;
  assert.deepEqual(
    validateContent(c).errors.filter((e) => e.path.startsWith('gate')),
    [],
  );
});

test('Set Password writes only gate.key: a salted PBKDF2-SHA256 hash; the typed text is nowhere in the draft', async () => {
  const draft = content();
  draft.gate = gateDefaults();
  const before = structuredClone(draft);
  const ctx = ctxOn(draft);
  const pw = 'ember-walks-the-long-night';
  const r = await setPassword(ctx, pw, pw);
  assert.equal(r.ok, true, r.message);
  const key = draft.gate.key;
  assert.deepEqual(Object.keys(key).sort(), ['alg', 'hash', 'iter', 'salt', 'set']);
  assert.equal(key.alg, 'PBKDF2-SHA256');
  assert.equal(key.iter, 600000);
  assert.equal(Buffer.from(key.salt, 'base64').length, 16);
  assert.match(key.set, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(
    Buffer.from(key.hash, 'base64'),
    pbkdf2Sync(pw, Buffer.from(key.salt, 'base64'), 600000, 32, 'sha256'),
    'the hash the lock page checks against',
  );
  const text = JSON.stringify(draft);
  assert.ok(!text.includes(pw), 'no plaintext in the draft');
  delete draft.gate.key;
  assert.deepEqual(draft, before, 'nothing else touched');
  assert.equal(ctx.said.changed.length, 1, 'one edit');
  assert.deepEqual(ctx.said.busy, [true, false], 'busy while it hashes');
  draft.gate.key = key;
  assert.deepEqual(validateContent(draft).errors, [], 'a key the rules take');
});

test('Set Password: both boxes must match and not be empty; under 12 characters it warns, and still sets', async () => {
  const draft = { gate: gateDefaults() };
  const ctx = ctxOn(draft);
  for (const [a, b] of [
    ['', ''],
    ['one', 'two'],
    ['long enough passphrase', 'long enough passphras'],
  ]) {
    const r = await setPassword(ctx, a, b);
    assert.equal(r.ok, false, `${a}/${b}`);
    assert.ok(r.message.length > 10);
    assert.equal(draft.gate.key, undefined, 'nothing written');
  }
  assert.equal(SHORT_PASSWORD, 12);
  const short = await setPassword(ctx, 'abc12345', 'abc12345');
  assert.equal(short.ok, true);
  assert.equal(short.short, true);
  assert.match(short.message, /12/, 'says how short');
  assert.ok(draft.gate.key);
  const long = await setPassword(ctx, 'a much longer passphrase', 'a much longer passphrase');
  assert.equal(long.short, false);
  assert.match(long.message, /save/i, 'says it takes a save');
});

test('the Access page renders: the switches, the lock page’s words, and the write-only password boxes', async () => {
  const draft = content();
  draft.gate = gateDefaults();
  const ctx = ctxOn(draft);
  const root = renderValue(getAt(draft, ['gate']), ['gate'], ctx);
  const nodes = tree(root);
  const at = (path) => nodes.find((n) => n.getAttribute('data-path') === path);
  for (const k of Object.keys(GATE_PAGES)) assert.ok(at(`gate.pages.${k}`)?.querySelector('input'), `${k}: a switch`);
  for (const k of Object.keys(GATE_LOCK)) assert.ok(at(`gate.lock.${k}`), `${k}: its words`);
  assert.ok(at('gate.on') && at('gate.remember'));
  const field = at('gate.key');
  assert.ok(field, 'the password field shows with no key yet');
  const boxes = field.querySelectorAll('input');
  assert.equal(boxes.length, 2, 'two boxes');
  for (const b of boxes) {
    assert.equal(b.getAttribute('type'), 'password');
    assert.equal(b.getAttribute('autocomplete'), 'new-password');
  }
  assert.ok(
    field.querySelectorAll('button').some((b) => b.textContent === 'Set Password'),
    'Set Password',
  );
  for (const n of nodes) assert.equal(n.attrs.has('title'), false, 'no title (data-tip shows hints)');
});

test('the password boxes: Set Password hashes, clears both boxes, and shows the day it was set', async () => {
  const draft = { gate: gateDefaults() };
  const ctx = ctxOn(draft);
  const field = gateKeyField(undefined, ['gate', 'key'], ctx);
  assert.ok(
    tree(field).some((n) => /no password/i.test(n.textContent)),
    'says there’s none yet',
  );
  const [a, b] = field.querySelectorAll('input');
  const button = field.querySelectorAll('button').find((x) => x.textContent === 'Set Password');
  a.value = 'night falls over the ruins';
  b.value = 'night falls over the ruins';
  await Promise.all(button.fire('click'));
  assert.equal(a.value, '', 'first box cleared');
  assert.equal(b.value, '', 'second box cleared');
  assert.ok(draft.gate.key?.hash, 'the key written');
  assert.ok(!JSON.stringify(draft).includes('night falls'), 'no plaintext');
  assert.ok(ctx.said.toasts.length, 'a word on what happened');
  const shown = gateKeyField(draft.gate.key, ['gate', 'key'], ctx);
  assert.ok(
    tree(shown).some((n) => n.textContent.includes(`Password set ${draft.gate.key.set}`)),
    'Password set <date>',
  );
  assert.ok(
    tree(shown).some((n) => /locks? out/i.test(n.textContent)),
    'that a new one locks everyone out again',
  );
  // Mismatched: nothing written, the boxes kept for another try.
  const key = draft.gate.key;
  const [c, d] = shown.querySelectorAll('input');
  c.value = 'one thing';
  d.value = 'another';
  await Promise.all(
    shown
      .querySelectorAll('button')
      .find((x) => x.textContent === 'Set Password')
      .fire('click'),
  );
  assert.equal(draft.gate.key, key, 'the old key kept');
});

test('a password stored as text can’t be saved: the rules refuse it wherever it is', () => {
  const c = content();
  c.gate = { ...gateDefaults(), password: 'hunter2' };
  assert.ok(validateContent(c).errors.some((e) => e.path.startsWith('gate') && /password/i.test(e.message)));
});
