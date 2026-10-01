// The settings fields (src/ui/fields.js), as markup: a field's "?" is a button beside its
// label, never inside it (a click on it mustn't tick a checkbox), not a keyboard stop of its
// own, and its input reads the hint out (aria-describedby); a "?" drawn on its own is a stop.
// The three-way radios carry their key and values, the grid's bulk toolbar its actions, and
// bulkValues works out what each action sets. fields.js leans only on html.js and modes.js
// (not on Bonfire Live), and the shared words are in Title Case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tip, range, number, text, check, checks, select, options, barOptions, mode, modeGrid, tri, triGrid, bulkBar, bulkValues, more, BULK_ACTIONS,
} from '../src/ui/fields.js';
import { MODES, modeOf, BAR_OPTIONS, RANDOM } from '../src/modes.js';
import * as looks from '../src/visualizer/looks.js';
import * as bars from '../src/visualizer/bars.js';
import { titleCase } from '../src/text.js';

/** The <label>…</label> elements in some markup (none nest). */
const labels = (html) => [...html.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => m[0]);
const described = (html) => html.match(/<(?:input|select)\b[^>]*aria-describedby="([^"]+)"/)?.[1];

test('a field with a hint: the "?" is a button beside the label, outside it, and the input reads the hint', () => {
  for (const html of [
    range('glitch', 'Effects Strength', 0, 2, 0.05, { hint: 'How strong every effect is.', unit: '×' }),
    select('fog', 'Fog', [['off', 'Off'], ['light', 'Light']], { hint: 'The dark closing in.' }),
    text('title', 'Title', { hint: 'The main card’s big line.' }),
    number('linkPort', 'Link Bridge Port', { hint: 'The port the bridge listens on.', min: 1024, max: 65535 }),
    check('shadows', 'Fire Shadows', { hint: 'The scenery casts the fire’s shadows.' }),
  ]) {
    const mark = html.match(/<button type="button" class="viz-tip"[^>]*>\?<\/button>/)?.[0];
    assert.ok(mark, `a "?" button: ${html}`);
    for (const l of labels(html)) assert.ok(!l.includes('class="viz-tip"'), `the "?" isn't in a label: ${l}`);
    assert.match(mark, /tabindex="-1"/, 'not a keyboard stop: focusing the field shows it');
    assert.match(mark, /aria-label="About [^"]+"/);
    const id = described(html);
    assert.ok(id, 'the input is described');
    assert.match(html, new RegExp(`<span class="visually-hidden" id="${id}">[^<]+</span>`), 'by the hidden hint');
    assert.match(mark, new RegExp(`aria-describedby="${id}"`), 'the "?" by the same one');
  }
  // The label names its input by id (a click on the label still reaches the input).
  const sel = select('fog', 'Fog', [['off', 'Off']], { hint: 'The dark closing in.' });
  const forId = sel.match(/<label for="([^"]+)">Fog<\/label>/)?.[1];
  assert.ok(forId);
  assert.match(sel, new RegExp(`<select data-set="fog" id="${forId}"`));
  // A checkbox: the box and its words in the label, the "?" after it.
  assert.match(check('shadows', 'Fire Shadows', { hint: 'Casts shadows.' }), /^<div class="viz-check"><label><input type="checkbox" data-set="shadows" aria-describedby="viz-tip-\d+"><span>Fire Shadows<\/span><\/label><button type="button" class="viz-tip"/);
  // The value and unit beside a slider's label.
  assert.match(range('glitch', 'Effects Strength', 0, 2, 0.05, { hint: 'x', unit: '×' }), /\?<\/button><span class="visually-hidden"[^>]*>x<\/span><output data-out="glitch"><\/output><span class="viz-unit">×<\/span>/);
  assert.match(number('linkPort', 'Port', { min: 1024, max: 65535 }), /<input type="number" data-set="linkPort" min="1024" max="65535" step="1" inputmode="numeric">/);
});

test('a field with no hint keeps its label wrapping its input (the Painter’s helmet rows rely on it)', () => {
  assert.match(select('knights.helmets.0', 'Knight 1', [['', 'Drawn at Random']]), /^\s*<label class="viz-field">\s*<span class="viz-field-label">Knight 1 <\/span>\s*<select data-set="knights\.helmets\.0">/);
  assert.equal(check('elements.fire', 'Fire', { group: 'viz-tip-9' }), '<label class="viz-check" data-group-tip><input type="checkbox" data-set="elements.fire" aria-describedby="viz-tip-9"><span>Fire</span></label>');
  assert.deepEqual(tip(''), { mark: '', ref: '', id: '' });
});

test('a "?" on its own is a keyboard stop, named and described by its hint', () => {
  const lone = tip('What this does, at length.', { label: 'Make a Flame' });
  assert.match(lone.mark, /^<button type="button" class="viz-tip" tabindex="0" data-tip="What this does, at length\." aria-label="About Make a Flame" aria-describedby="(viz-tip-\d+)">\?<\/button><span class="visually-hidden" id="\1">/);
  assert.match(tip('x').mark, /aria-label="Hint"/, 'no label: "Hint"');
  assert.match(tip('a "quoted" <hint>').mark, /data-tip="a &quot;quoted&quot; &lt;hint&gt;"/, 'escaped');
  assert.match(tip('x', { label: 'Say “hi” <b>now</b>' }).mark, /aria-label="About Say “hi” now"/, 'the label as plain text');
});

test('groups: one "?" for a checklist or a grid, each switch reading out its own hint then the group’s', () => {
  const list = checks('elements', 'Elements', { fire: 'Fire', ice: 'Ice <Cold>' }, { hint: 'Which elements new weapons bring.' });
  const groupId = list.match(/<p class="viz-field-label">Elements <button[^>]*aria-describedby="(viz-tip-\d+)"/)?.[1];
  assert.ok(groupId);
  assert.equal([...list.matchAll(new RegExp(`aria-describedby="${groupId}"`, 'g'))].length, 3, 'the "?" and both boxes');
  assert.match(list, /<span>Ice &lt;Cold&gt;<\/span>/);
  assert.doesNotMatch(list, /class="bulk"/, 'no toolbar unless asked');
  const grid = modeGrid('Layers', [['grain', 'Grain', 'Film grain over the picture.'], ['cinema', 'Cinema Bars']], { hint: 'Effects over any look.' });
  const gridId = grid.match(/<p class="viz-field-label">Layers <button[^>]*aria-describedby="(viz-tip-\d+)"/)?.[1];
  const grain = grid.match(/<div class="viz-mode"><label for="([^"]+)">Grain<\/label><button[^>]*aria-describedby="(viz-tip-\d+)"[\s\S]*?<select data-set="grain" id="\1" aria-label="Grain" aria-describedby="\2 ([^"]+)">/);
  assert.ok(grain, 'its own "?" outside its label, then the grid’s');
  assert.equal(grain[3], gridId);
  assert.match(grid, new RegExp(`<label class="viz-mode" data-group-tip><span>Cinema Bars</span><select data-set="cinema" aria-label="Cinema Bars" aria-describedby="${gridId}">`), 'one without a hint of its own: the grid’s');
  assert.deepEqual([...grid.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].slice(0, 3).map((m) => [m[1], m[2]]), MODES);
  assert.doesNotMatch(modeGrid('Looks', [['looks.ember', 'Ember']], { noAlways: ['looks.ember'] }), /value="on"/, 'no Always where it adds nothing');
  assert.match(mode('sparks', 'Hi-Hat Sparks', { hint: 'Sparks on the hats.' }), /data-tip="Sparks on the hats\. In the Mix: /);
});

test('tri: three radios, one group, each with the key and its value', () => {
  const html = tri('knightGlow', 'Edge Glow', { hint: 'The armor’s edges catch the fire.' });
  assert.match(html, /^<fieldset class="tri" data-set-group="knightGlow" aria-describedby="(viz-tip-\d+)"><legend>Edge Glow<\/legend><button type="button" class="viz-tip" tabindex="-1"[^>]*aria-describedby="\1">\?<\/button>/);
  const radios = [...html.matchAll(/<input type="radio" name="([^"]+)" data-set="([^"]+)" value="([^"]+)">/g)];
  assert.deepEqual(radios.map((m) => m[3]), ['off', 'mix', 'on']);
  assert.ok(radios.every((m) => m[2] === 'knightGlow'), 'data-set on each');
  assert.equal(new Set(radios.map((m) => m[1])).size, 1, 'one name: one group, one tab stop');
  assert.deepEqual([...html.matchAll(/<span>([^<]+)<\/span><\/label>/g)].map((m) => m[1]), ['Off', 'In the Mix', 'Always']);
  for (const l of labels(html)) assert.ok(!l.includes('class="viz-tip"'), 'the "?" isn’t in a choice’s label');
  // No Always; a missing value's mark; advanced; more attributes per choice.
  const ember = tri('looks.ember', 'Ember', { noAlways: true, missing: 'mix', adv: true, attr: ' data-audition' });
  assert.match(ember, /^<fieldset class="tri" data-adv data-set-group="looks\.ember" data-no-always>/);
  assert.doesNotMatch(ember, /value="on"/);
  assert.match(ember, /<label class="tri-opt" data-audition><input type="radio" name="[^"]+" data-set="looks\.ember" value="mix" data-missing>/);
  assert.doesNotMatch(tri('x', 'X'), /aria-describedby|viz-tip/, 'no hint: no "?"');
  assert.notEqual(tri('a', 'A').match(/name="([^"]+)"/)[1], tri('a', 'A').match(/name="([^"]+)"/)[1], 'each its own group');
});

test('triGrid and the bulk toolbars: actions in Title Case, the grid named for its toolbar', () => {
  const grid = triGrid('Looks', [['looks.ember', 'Ember', 'The clean fire.'], ['looks.glitch', 'Glitch']], { hint: 'The picture’s styles.', noAlways: ['looks.ember'], bulk: 'looks' });
  const gridId = grid.match(/<p class="viz-field-label">Looks <button[^>]*aria-describedby="(viz-tip-\d+)"/)?.[1];
  assert.match(grid, /<div class="bulk" role="toolbar" aria-label="Set All Looks">/);
  assert.deepEqual([...grid.matchAll(/data-bulk="(\w+)" data-bulk-group="looks">([^<]+)</g)].map((m) => [m[1], m[2]]), BULK_ACTIONS.tri);
  assert.match(grid, /<div class="tri-grid" data-bulk-list="looks">/);
  assert.match(grid, new RegExp(`data-set-group="looks\\.ember" data-no-always aria-describedby="viz-tip-\\d+ ${gridId}"`), 'its own hint, then the grid’s');
  assert.match(grid, new RegExp(`data-set-group="looks\\.glitch" aria-describedby="${gridId}"`));
  assert.doesNotMatch(triGrid('Layers', [['grain', 'Grain']]), /class="bulk"/, 'no toolbar without a name');
  for (const [, label] of [...BULK_ACTIONS.tri, ...BULK_ACTIONS.checks]) assert.equal(titleCase(label), label);
  const list = bulkBar('elements', { kind: 'checks', minOne: true, label: 'Elements' });
  assert.deepEqual([...list.matchAll(/data-bulk="(\w+)"/g)].map((m) => m[1]), ['all', 'none', 'defaults']);
  assert.match(list, /data-bulk="none" data-bulk-group="elements" aria-disabled="true" data-tip="[^"]+">None</, 'at least one stays: None is out, and says why');
  assert.doesNotMatch(bulkBar('moves', { kind: 'checks' }), /aria-disabled/);
  assert.match(checks('moves', 'Attacks', { slash: 'Slash' }, { bulk: true }), /class="bulk"[\s\S]*<div class="viz-checks" data-bulk-list="moves">/);
});

test('bulkValues: every switch set, Always as In the Mix where there’s none, defaults back, shuffles rolled, at least one kept', () => {
  const items = ['looks.glitch', { key: 'looks.ember', noAlways: true }, 'looks.echo'];
  const current = { 'looks.glitch': 'off', 'looks.ember': 'mix', 'looks.echo': 'on', other: 42 };
  const defaults = { 'looks.glitch': 'mix', 'looks.ember': 'mix', 'looks.echo': 'mix' };
  assert.deepEqual(bulkValues('on', items, current, defaults), { 'looks.glitch': 'on', 'looks.ember': 'mix', 'looks.echo': 'on', other: 42 });
  assert.deepEqual(bulkValues('off', items, current, defaults), { 'looks.glitch': 'off', 'looks.ember': 'off', 'looks.echo': 'off', other: 42 });
  assert.deepEqual(bulkValues('mix', items, current, defaults), { ...defaults, other: 42 });
  assert.deepEqual(bulkValues('defaults', items, current, { 'looks.glitch': 'mix' }), { ...current, 'looks.glitch': 'mix' }, 'no default: as it was');
  const out = bulkValues('on', items, current, defaults);
  assert.notEqual(out, current, 'a new object');
  assert.equal(current['looks.glitch'], 'off', 'the old one untouched');
  // Shuffle: each switch any of its states, from the dice given.
  const rolls = [0, 0.99, 0.99];
  assert.deepEqual(bulkValues('shuffle', items, current, defaults, () => rolls.shift()), { 'looks.glitch': 'off', 'looks.ember': 'mix', 'looks.echo': 'on', other: 42 });
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(bulkValues('shuffle', ['a'], { a: 'off' }, {}, Math.random).a);
  assert.deepEqual([...seen].sort(), ['mix', 'off', 'on']);
  // Checklists: all, none (keeping one where one must stay), defaults, shuffle.
  const boxes = ['fire', 'lightning', 'ice'];
  const on = { fire: false, lightning: true, ice: true };
  assert.deepEqual(bulkValues('all', boxes, on, {}), { fire: true, lightning: true, ice: true });
  assert.deepEqual(bulkValues('none', boxes, on, {}), { fire: false, lightning: false, ice: false });
  assert.deepEqual(bulkValues('none', boxes, on, {}, Math.random, { minOne: true }), { fire: false, lightning: true, ice: false }, 'the first that was on stays');
  assert.deepEqual(bulkValues('none', boxes, { fire: false, lightning: false, ice: false }, {}, Math.random, { minOne: true }), { fire: true, lightning: false, ice: false });
  assert.deepEqual(bulkValues('shuffle', boxes, on, {}, () => 0, { minOne: true }), { fire: false, lightning: true, ice: false }, 'shuffled to none: the first that was on, back');
  assert.deepEqual(bulkValues('shuffle', boxes, on, {}, () => 0.9), { fire: true, lightning: true, ice: true });
  assert.deepEqual(bulkValues('off', ['a', 'b'], { a: 'on', b: 'mix' }, {}, Math.random, { minOne: true }), { a: 'on', b: 'off' }, 'a switch kept as it was');
  assert.deepEqual(bulkValues('dance', boxes, on, {}), on, 'an unknown action changes nothing');
});

test('more: the longer text folded away, escaped, a line or a list', () => {
  assert.equal(more('Each style <b>draws</b>.'), '<details class="viz-more" data-adv><summary>More</summary><p>Each style &lt;b&gt;draws&lt;/b&gt;.</p></details>');
  assert.equal(more(['One.', 'Two.'], { adv: false }), '<details class="viz-more"><summary>More</summary><ul><li>One.</li><li>Two.</li></ul></details>');
});

test('the shared words: MODES and the bar choices live in src/modes.js, in Title Case; Live reads the same ones', () => {
  assert.deepEqual(MODES, [['off', 'Off'], ['mix', 'In the Mix'], ['on', 'Always']]);
  for (const [, label] of MODES) assert.equal(titleCase(label), label);
  for (const list of Object.values(BAR_OPTIONS)) for (const [, label] of list) assert.equal(titleCase(label), label, label);
  assert.equal(looks.MODES, MODES, 'looks.js re-exports them');
  assert.equal(looks.modeOf, modeOf);
  assert.equal(bars.BAR_OPTIONS, BAR_OPTIONS, 'bars.js re-exports them');
  assert.equal(bars.barOptions, barOptions);
  assert.equal(modeOf(true), 'on');
  assert.equal(modeOf(true, 'mix'), 'mix');
  assert.equal(modeOf('mix'), 'mix');
  assert.equal(modeOf('nope'), 'off');
  assert.deepEqual(barOptions('ringBars').at(-1), [RANDOM, 'Random (1, 2, 4, 8 Bars)']);
  assert.equal(barOptions('comboBars').some(([v]) => v === RANDOM), false, 'comboBars has its own random');
  assert.deepEqual(options({ a: 'A' }, ['mix', 'A Mix']), [['mix', 'A Mix'], ['a', 'A']]);
});

test('fields.js leans only on html.js and modes.js (not on Bonfire Live)', () => {
  const src = readFileSync(new URL('../src/ui/fields.js', import.meta.url), 'utf8');
  const from = [...src.matchAll(/^(?:import|export)\b[^;]*?from '([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(from)].sort(), ['../html.js', '../modes.js']);
});
