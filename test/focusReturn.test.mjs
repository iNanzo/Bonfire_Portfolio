import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusedNow, holdsFocus, returnFocus } from '../src/ui/focus.js';

test('closing an overlay restores a visible opener and falls back when it cannot take focus', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const calls = [];
  const main = {
    focus: (options) => {
      calls.push(['main', options]);
      doc.activeElement = main;
    },
  };
  const doc = {
    body: {},
    documentElement: {},
    activeElement: null,
    getElementById: (id) => (id === 'main' ? main : null),
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  const opener = {
    isConnected: true,
    getClientRects: () => [{}],
    focus: (options) => {
      calls.push(['opener', options]);
      doc.activeElement = opener;
    },
  };
  const child = {};
  const overlay = { contains: (el) => el === child };
  for (const active of [null, doc.body, doc.documentElement]) {
    doc.activeElement = active;
    assert.equal(focusedNow(), null);
    assert.equal(holdsFocus(overlay), true);
  }
  doc.activeElement = child;
  assert.equal(focusedNow(), child);
  assert.equal(holdsFocus(overlay), true);
  returnFocus(opener);
  assert.equal(doc.activeElement, opener);
  assert.deepEqual(calls, [['opener', { preventScroll: true }]]);
  assert.equal(holdsFocus(overlay), false, 'do not steal focus moved outside the overlay');
  for (const target of [
    null,
    { ...opener, isConnected: false },
    { ...opener, getClientRects: () => [] },
    { ...opener, focus: () => {} },
  ]) {
    doc.activeElement = child;
    returnFocus(target);
    assert.equal(doc.activeElement, main, 'removed, hidden, or unfocusable opener falls back to main');
    assert.deepEqual(calls.at(-1), ['main', { preventScroll: true }]);
  }
  doc.getElementById = () => null;
  assert.doesNotThrow(() => returnFocus(null), 'pages without main tolerate fallback');
});
