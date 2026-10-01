// The render menu (src/ui/renderMenu.js): its rows, the keys that step them, and the HTML
// it draws them with. The site's rows must be settings the scene can step and describe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RENDER_ROWS, NO_VALUE, keyOf, rowForKey, rowsHtml } from '../src/ui/renderMenu.js';

test('render menu: one row per setting, each on its own digit', () => {
  assert.ok(RENDER_ROWS.length >= 6);
  assert.equal(new Set(RENDER_ROWS.map((r) => r.id)).size, RENDER_ROWS.length, 'ids are unique');
  assert.equal(new Set(RENDER_ROWS.map((r) => r.key)).size, RENDER_ROWS.length, 'keys are unique');
  for (const r of RENDER_ROWS) {
    assert.match(r.key, /^[1-9]$/, `${r.id}: a digit (0 is the reset)`);
    assert.ok(r.label.trim(), `${r.id}: a label`);
  }
});

test('render menu: the site steps and describes every row (bonfire/scene.js)', () => {
  const src = fs.readFileSync(new URL('../src/bonfire/scene.js', import.meta.url), 'utf8');
  const describe = src.slice(src.indexOf('function describe()'));
  const body = describe.slice(0, describe.indexOf('\n  }'));
  for (const { id } of RENDER_ROWS) {
    assert.ok(src.includes(`what === '${id}'`), `cycle('${id}') steps it`);
    assert.match(body, new RegExp(`\\b${id}:`), `describe() says what ${id} is`);
  }
});

test('render menu: keys find their row, by the digit wherever the layout puts it', () => {
  assert.equal(rowForKey(RENDER_ROWS, '3')?.id, 'dither');
  assert.equal(rowForKey(RENDER_ROWS, '0'), null, '0 is not a row');
  assert.equal(rowForKey(RENDER_ROWS, 'p'), null);
  assert.equal(keyOf({ key: '3', code: 'Digit3' }), '3');
  assert.equal(keyOf({ key: '"', code: 'Digit3' }), '3', 'a layout that types a symbol there');
  assert.equal(keyOf({ key: '5', code: 'Numpad5' }), '5');
  assert.equal(keyOf({ key: 'p', code: 'KeyP' }), 'p');
  assert.equal(keyOf({ key: 'p' }), 'p', 'no code (a synthetic event)');
});

test('render menu: rows are buttons with their values, escaped', () => {
  const rows = [{ key: '1', id: 'a', label: 'A <b>' }, { key: '2', id: 'b', label: 'B' }];
  const html = rowsHtml(rows, { a: '<img src=x>' });
  assert.equal((html.match(/<button /g) ?? []).length, 2);
  assert.match(html, /type="button" data-render-row="a"/);
  assert.ok(html.includes('A &lt;b&gt;') && html.includes('&lt;img src=x&gt;'), 'labels and values are escaped');
  assert.ok(!html.includes('<img'), 'no markup from a value');
  assert.ok(html.includes(`>${NO_VALUE}</b>`), 'a missing value shows as a dash');
  assert.match(rowsHtml(rows, { a: 0 }), />0<\/b>/, 'a zero is a value');
});
