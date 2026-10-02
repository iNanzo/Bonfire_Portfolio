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

test('render menu: the site steps and describes every row (bonfire/sceneRender.js)', () => {
  const src = fs.readFileSync(new URL('../src/bonfire/sceneRender.js', import.meta.url), 'utf8');
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

test('render menu: the site’s rows in two groups (the picture, then the cursor), Title Case, each with a hint', async () => {
  const { titleCase } = await import('../src/text.js');
  assert.deepEqual([...new Set(RENDER_ROWS.map((r) => r.group))], ['Picture', 'Interaction']);
  assert.deepEqual(
    RENDER_ROWS.filter((r) => r.group === 'Interaction').map((r) => r.id),
    ['interaction'],
  );
  for (const r of RENDER_ROWS) {
    assert.equal(titleCase(r.label), r.label, `${r.id}: Title Case`);
    assert.ok(r.hint && r.hint.length >= 12 && r.hint.length <= 160, `${r.id}: a hint of 12–160 characters`);
    assert.match(r.hint, /^[A-Z].*\.$/, `${r.id}: the hint is a sentence`);
    assert.ok(!r.hint.toLowerCase().startsWith(r.label.toLowerCase()), `${r.id}: the hint doesn't restate the label`);
  }
  // The site's shortcuts list names the same digits.
  const { SITE_KEYS } = await import('../src/ui/siteKeys.js');
  const listed = SITE_KEYS.flatMap((g) => g.keys.flatMap((k) => k.keys));
  assert.ok(
    listed.includes(`${RENDER_ROWS[0].key}–${RENDER_ROWS.at(-1).key}`) &&
      listed.includes('P') &&
      listed.includes('0') &&
      listed.includes('?'),
  );
});

test('render menu: a run of rows with a group is a labelled group under its heading; each row says its key', () => {
  const rows = [
    { key: '1', id: 'a', label: 'A', group: 'First <G>' },
    { key: '2', id: 'b', label: 'B', group: 'First <G>', hint: 'Says "what" B does.' },
    { key: '3', id: 'c', label: 'C', group: 'Second' },
  ];
  const html = rowsHtml(rows, {}, { id: 'm' });
  assert.match(
    html,
    /<div class="render-group" role="group" aria-labelledby="m-g0">\s*<p class="render-group-title" id="m-g0">First &lt;G&gt;<\/p>/,
  );
  assert.match(
    html,
    /<div class="render-group" role="group" aria-labelledby="m-g1">\s*<p class="render-group-title" id="m-g1">Second<\/p>/,
  );
  assert.equal((html.match(/class="render-group"/g) ?? []).length, 2, 'one group per run');
  for (const r of rows) assert.match(html, new RegExp(`data-render-row="${r.id}" aria-keyshortcuts="${r.key}"`));
  assert.match(
    html,
    /data-render-row="b" aria-keyshortcuts="2" data-tip="Says &quot;what&quot; B does\." aria-describedby="m-tip1">/,
  );
  assert.match(
    html,
    /<\/button><span id="m-tip1" hidden>Says &quot;what&quot; B does\.<\/span>/,
    'and a screen reader hears the hint (the tooltip is aria-hidden)',
  );
  assert.doesNotMatch(html, /data-render-row="a"[^>]*aria-describedby/, 'no hint, no description');
  assert.match(html, /<kbd>1<\/kbd>/, 'the digit is read out too (not aria-hidden)');
  assert.doesNotMatch(html, /<kbd aria-hidden/);
  // Rows without groups (Bonfire Live's, the Painter's): just the rows, as before.
  assert.doesNotMatch(rowsHtml([{ key: '1', id: 'a', label: 'A' }]), /render-group/);
});

test('render menu: titled Render Settings by default, a HUD has a close button, and the site’s reset is named for the menu', () => {
  const src = fs.readFileSync(new URL('../src/ui/renderMenu.js', import.meta.url), 'utf8');
  assert.match(src, /title = 'Render Settings'/);
  assert.match(
    src,
    /collapse === 'all' \? `<button class="render-menu-close" type="button" aria-label="Close \$\{esc\(title\)\}" data-tip="Close \(\$\{esc\(toggleKey\)\} or Esc\)" aria-keyshortcuts="\$\{esc\(toggleKey\)\} Escape"/,
    'its keys said too',
  );
  // The site's menu and its reset take their names from content.json (the admin can rename
  // them, so they aren't pinned here), with the same defaults.
  const site = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(site, /title: ui\.renderMenu \?\? 'Render Settings'/);
  assert.match(site, /label: ui\.renderReset \?\? 'Reset Render Settings'/);
});

test('render menu: one list of pixel sizes for the site, Bonfire Live and the Painter', async () => {
  const { PIXEL_SIZES } = await import('../src/pixelSizes.js');
  const { PIXEL_SIZES: live } = await import('../src/visualizer/render.js');
  assert.deepEqual(live, PIXEL_SIZES, 'visualizer/render.js offers the same sizes');
  const scene = fs.readFileSync(new URL('../src/bonfire/sceneRender.js', import.meta.url), 'utf8');
  assert.match(scene, /import \{ PIXEL_SIZES \} from '\.\.\/pixelSizes\.js';/);
  assert.doesNotMatch(scene, /const PIXEL_SIZES =/, 'no list of its own');
});

test('render menu: rows are buttons with their values, escaped', () => {
  const rows = [
    { key: '1', id: 'a', label: 'A <b>' },
    { key: '2', id: 'b', label: 'B' },
  ];
  const html = rowsHtml(rows, { a: '<img src=x>' });
  assert.equal((html.match(/<button /g) ?? []).length, 2);
  assert.match(html, /type="button" data-render-row="a"/);
  assert.ok(html.includes('A &lt;b&gt;') && html.includes('&lt;img src=x&gt;'), 'labels and values are escaped');
  assert.ok(!html.includes('<img'), 'no markup from a value');
  assert.ok(html.includes(`>${NO_VALUE}</b>`), 'a missing value shows as a dash');
  assert.match(rowsHtml(rows, { a: 0 }), />0<\/b>/, 'a zero is a value');
});
