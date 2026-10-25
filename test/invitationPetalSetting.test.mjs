// The Rose Petals setting (src/invitation/look.js, ui.js): On or Off in Settings, On by default,
// kept with the rest of the look in invitation.look.v1; left out until it's picked, so every look
// stored before it reads the same, and anything else stored there is dropped, never a break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOOK, LOOK_KEY, loadLook, petalsOn, saveLook, validLook } from '../src/invitation/look.js';
import { sheetHtml } from '../src/invitation/ui.js';

/** A storage holding one value. */
function memory() {
  /** @type {Record<string, string>} */
  const data = {};
  return {
    data,
    getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test('Rose Petals: On by default, Off once it is switched off, and kept for the next visit', () => {
  assert.equal(petalsOn(DEFAULT_LOOK), true, 'on by default');
  assert.equal(petalsOn(validLook(null)), true);
  assert.equal(petalsOn(validLook({ petals: false })), false);
  assert.equal(petalsOn(validLook({ petals: true })), true);
  const s = memory();
  saveLook(validLook({ ...DEFAULT_LOOK, petals: false }), s);
  assert.equal(JSON.parse(s.data[LOOK_KEY]).petals, false, 'stored with the look');
  assert.equal(petalsOn(loadLook(s)), false, 'read back');
  saveLook(validLook({ ...loadLook(s), petals: true }), s);
  assert.equal(petalsOn(loadLook(s)), true);
});

test('a look stored before Rose Petals reads as it did, with petals on; a bad value is dropped', () => {
  const old = { pixelSize: '128', dither: true, outlines: false, style: 'soft', motion: 'smooth', shader: {} };
  assert.deepEqual(validLook(old), validLook({ ...old }), 'unchanged');
  assert.equal(Object.hasOwn(validLook(old), 'petals'), false, 'left out until it is picked');
  for (const bad of ['off', 0, 1, null, {}, []]) {
    const l = validLook({ ...old, petals: bad });
    assert.equal(Object.hasOwn(l, 'petals'), false, `${JSON.stringify(bad)} dropped`);
    assert.equal(petalsOn(l), true);
  }
  const s = memory();
  s.setItem(LOOK_KEY, JSON.stringify({ ...old, petals: 'nope' }));
  assert.equal(petalsOn(loadLook(s)), true, 'never a break');
});

test('Settings has a Rose Petals switch, on unless it was switched off', () => {
  const on = sheetHtml(DEFAULT_LOOK);
  assert.match(on, /<input type="checkbox" role="switch" data-look="petals" checked>/);
  assert.match(on, /Rose Petals/);
  const off = sheetHtml(validLook({ ...DEFAULT_LOOK, petals: false }));
  assert.match(off, /<input type="checkbox" role="switch" data-look="petals">/);
  const hint = /data-look="petals"[^]*?<p class="inv-hint">([^<]*)<\/p>/.exec(on)?.[1] ?? '';
  assert.ok(hint.length > 0 && hint.length <= 160 && /\.$/.test(hint), `a hint in a sentence: ${hint}`);
});
