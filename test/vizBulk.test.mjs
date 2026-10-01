// Many of Bonfire Live's settings at once (src/visualizer/settingsBulk.js): the bulk buttons
// over the grids (All Off, All In the Mix, All Always, Shuffle, Defaults) and the checklists
// (All, None, Defaults), Reset Section, and their Undo. Each is worked out as a plan before
// anything changes: the new values and the ones they replace, so the dialog makes it one
// change and its Undo puts every value back as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkPlan, sectionPlan, sectionKeys, applyValues, topKeys, changes, groupItems, getPath, setPath } from '../src/visualizer/settingsBulk.js';
import { defaults } from '../src/visualizer/settings.js';
import { LOOKS, LAYERS, DROP_FX } from '../src/visualizer/looks.js';
import { entriesFor } from '../src/settingsMap.js';

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('a grid’s bulk buttons set every switch; Ember has no Always, so All Always gives it In the Mix', () => {
  const s = defaults();
  const off = bulkPlan('looks', 'off', s);
  assert.deepEqual(Object.keys(off.values), Object.keys(LOOKS).map((id) => `looks.${id}`));
  assert.ok(Object.values(off.values).every((v) => v === 'off'));
  const on = bulkPlan('looks', 'on', s);
  assert.equal(on.values['looks.ember'], 'mix');
  assert.ok(Object.entries(on.values).every(([k, v]) => v === (k === 'looks.ember' ? 'mix' : 'on')));
  assert.ok(Object.values(bulkPlan('dropFx', 'mix', s).values).every((v) => v === 'mix'));
  // The layers are settings of their own (not a group object): their keys are the layers'.
  assert.deepEqual(Object.keys(bulkPlan('layers', 'off', s).values), Object.keys(LAYERS));
  // Shuffle rolls each one; Ember still never Always.
  const shuffled = bulkPlan('looks', 'shuffle', s, { rand: seq(0.95, 0.5, 0.1) });
  assert.ok(Object.values(shuffled.values).some((v) => v === 'on') && Object.values(shuffled.values).some((v) => v === 'off'));
  assert.notEqual(shuffled.values['looks.ember'], 'on');
  // Defaults: as they come.
  s.looks.glitch = 'off';
  s.dropFx.shatter = 'on';
  assert.equal(bulkPlan('looks', 'defaults', s).values['looks.glitch'], defaults().looks.glitch);
  assert.equal(bulkPlan('dropFx', 'defaults', s).values['dropFx.shatter'], defaults().dropFx.shatter);
});

test('a checklist’s bulk buttons: All, None (one stays on where one has to), Defaults', () => {
  const s = defaults();
  const none = bulkPlan('knightMoves', 'none', s);
  assert.equal(Object.values(none.values).filter(Boolean).length, 1, 'at least one dance move stays on');
  assert.equal(none.values['knightMoves.nod'], true, 'the first one that was on');
  s.elements = { fire: false, lightning: true, ice: false };
  assert.deepEqual(bulkPlan('elements', 'none', s).values, { 'elements.fire': false, 'elements.lightning': true, 'elements.ice': false });
  assert.ok(Object.values(bulkPlan('elements', 'all', s).values).every(Boolean));
  assert.deepEqual(bulkPlan('elements', 'defaults', s).values, { 'elements.fire': true, 'elements.lightning': true, 'elements.ice': true });
  assert.deepEqual(groupItems('xrayViews', s).map((i) => i.key), Object.keys(s.xrayViews).map((id) => `xrayViews.${id}`));
});

test('a plan applied as one change, and its Undo: every value back as it was', () => {
  const s = defaults();
  s.looks.echo = 'on';
  s.looks.kaleido = 'off';
  const before = structuredClone(s);
  const plan = bulkPlan('looks', 'off', s);
  assert.ok(changes(plan));
  applyValues(s, plan.values);
  assert.ok(Object.values(s.looks).every((v) => v === 'off'));
  assert.deepEqual(topKeys(plan.values), ['looks'], 'one setting changed, as onChange is told');
  applyValues(s, plan.before);
  assert.deepEqual(s, before, 'undone');
  // A plan that changes nothing says so (the dialog doesn't make it a change).
  assert.equal(changes(bulkPlan('looks', 'off', { ...defaults(), looks: Object.fromEntries(Object.keys(LOOKS).map((k) => [k, 'off'])) })), false);
  // The paths reach into a group.
  setPath(s, 'dropFx.iris', 'on');
  assert.equal(getPath(s, 'dropFx.iris'), 'on');
});

test('Reset Section: every setting in the section back to its default (a group as its items), and undone', () => {
  const d = defaults();
  for (const section of new Set(entriesFor('live').map((e) => e.section))) {
    const keys = sectionKeys(section);
    if (section === 'titles') { assert.deepEqual(keys, [], 'your title cards’ words aren’t reset'); continue; }
    assert.ok(keys.length > 0, `${section} has settings`);
    for (const k of keys) assert.notEqual(getPath(d, k), undefined, `${section}: ${k} is a setting`);
  }
  assert.deepEqual(sectionKeys('layers'), [...Object.keys(LAYERS), 'mirrors.horizontal', 'mirrors.vertical', 'mirrors.quarter']);
  assert.ok(sectionKeys('drop').includes('dropFx.iris') && Object.keys(DROP_FX).every((id) => sectionKeys('drop').includes(`dropFx.${id}`)));
  const s = defaults();
  Object.assign(s, { knightStyle: 'first', knightFinish: 'polished', knightGlow: 'off', knightRim: 0.1, knightShine: 'on' });
  const before = structuredClone(s);
  const plan = sectionPlan('armor', s);
  applyValues(s, plan.values);
  for (const k of ['knightStyle', 'knightFinish', 'knightGlow', 'knightRim', 'knightShine']) assert.deepEqual(s[k], d[k], k);
  applyValues(s, plan.before);
  assert.deepEqual(s, before);
  // The defaults are copies: changing one after a reset leaves the next reset's alone.
  const t = defaults();
  t.mirrors.quarter = false;
  applyValues(t, sectionPlan('layers', t).values);
  t.mirrors.quarter = false;
  assert.equal(sectionPlan('layers', t).values['mirrors.quarter'], true);
});
