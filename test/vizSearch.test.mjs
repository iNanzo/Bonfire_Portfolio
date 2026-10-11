// Search in Bonfire Live's settings (src/visualizer/settingsSearchUi.js): every row of the
// dialog is an entry (a setting, each item of a grid or checklist, a section's block) with its
// row in the markup; the rows that change are read at each query; a query's plan shows the
// rows found, a group's items only where they were found (all of them when the group was), and
// counts each tab's finds; names found are marked, escaped (an imported setup's name is text);
// nothing found suggests words that would find something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  staticEntries,
  dynamicEntries,
  planSearch,
  suggestFor,
  matcherFor,
} from '../src/visualizer/settingsSearchUi.js';
import { highlight } from '../src/ui/settingsSearch.js';
import { entriesFor } from '../src/settingsMap.js';
import { defaults, PRESETS } from '../src/visualizer/settings.js';
import { settingsMarkup } from '../src/visualizer/settingsDialog.js';
import { keyList } from '../src/visualizer/keys.js';
import { LOOKS } from '../src/visualizer/looks.js';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const statics = staticEntries(defaults());
const html = settingsMarkup(defaults(), keyList());
const rows = new Set([...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]));
/** Search the dialog as it stands with these changing rows: the hits and the plan. */
function search(query, dyn = {}) {
  const extra = dynamicEntries({ presets: PRESETS, keys: keyList(), ...dyn });
  const hits = [...matcherFor(statics)(query), ...matcherFor(extra)(query)];
  return { hits, plan: planSearch(hits, [...statics, ...extra]), ids: hits.map((h) => h.entry.id) };
}

test('every row the dialog always has is an entry, and every entry has its row', () => {
  const ids = statics.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'one entry per row');
  for (const id of ids) assert.ok(rows.has(id), `${id} has a row in the dialog`);
  const always = [...rows].filter((r) => !/^(preset|key|scene|card|setup|midi):/.test(r));
  for (const r of always) assert.ok(ids.includes(r), `${r} is searchable`);
  // Each setting's entry has its tab and section, its hint and More, its choices.
  const frame = statics.find((e) => e.id === 'frameRate');
  assert.deepEqual([frame.tab, frame.section, frame.label], ['Picture', 'Performance', 'Frame Rate']);
  assert.deepEqual(frame.options, ['Display', '60 fps', '30 fps']);
  assert.match(statics.find((e) => e.id === 'knightStyle').hint, /Pixel Painterly:/, 'its More is searched too');
  assert.equal(statics.filter((e) => e.parent === 'looks').length, Object.keys(LOOKS).length);
  assert.ok(entriesFor('live').every((e) => ids.includes(e.live)));
});

test('"strobe" finds Negative Flash, Flicker and Hit Flash, and the tabs count them', () => {
  const { ids, plan } = search('strobe');
  for (const id of ['flash', 'flicker', 'hitFlash']) assert.ok(ids.includes(id), `${id} found`);
  // (The synonyms find names, not every hint that mentions a drop's flash.)
  for (const id of ['knights', 'knightSummon', 'sceneBars']) assert.ok(!ids.includes(id), `not ${id}`);
  assert.ok(search('flash').ids.includes('knightSummon'), 'the word itself still finds hints');
  assert.ok(plan.counts.drops >= 2, 'Drops: Negative Flash and Hit Flash');
  assert.ok(plan.counts.effects >= 1, 'Effects: Flicker');
  assert.equal(plan.counts.setups, 0);
  assert.ok(plan.partly.has('layers'), 'the Layers grid shows, for Flicker');
  assert.ok(!plan.whole.has('layers'), 'only Flicker of it');
});

test('a group found shows whole and counts once; its items found alone show alone', () => {
  let { plan } = search('looks');
  assert.ok(plan.whole.has('looks'));
  const counted = plan.counts.effects;
  assert.ok(
    counted < Object.keys(LOOKS).length,
    `the Looks grid counts once, not its ${Object.keys(LOOKS).length} looks (${counted})`,
  );
  ({ plan } = search('kaleido'));
  assert.ok(plan.found.has('looks.kaleido') && plan.found.has('dropFx.kaleido'), 'the look and the drop hit');
  assert.ok(plan.partly.has('looks') && plan.partly.has('dropFx'));
  assert.ok(!plan.found.has('looks.echo'));
  // An advanced setting is found like any other (the dialog shows it in Simple view, badged).
  ({ plan } = search('dither pattern'));
  assert.ok(plan.found.has('ditherMatrix'));
  // A word a letter off still finds a name.
  assert.ok(search('exposre').plan.found.has('exposure'));
});

test('the rows that change are found too: scenes, cards, setups, MIDI actions, presets, keys', () => {
  const dyn = {
    scenes: [{ ref: 'b:frozen-shrine', name: 'Frozen Shrine', summary: 'The shrine in ice' }],
    cards: [
      { title: 'Next: DJ Ember', subtitle: '' },
      { title: '', subtitle: '' },
    ],
    setups: ['Friday Residency'],
    midi: { drop: 'Drop', combo: 'Living Weapon' },
  };
  assert.ok(search('frozen', dyn).ids.includes('scene:b:frozen-shrine'));
  assert.ok(search('ember', dyn).ids.includes('card:0'));
  assert.ok(search('card 3', dyn).ids.includes('card:1'), 'an untitled card by its number');
  assert.ok(search('friday', dyn).ids.includes('setup:Friday Residency'));
  assert.ok(search('living weapon', dyn).ids.includes('midi:combo'));
  assert.ok(search('low flash', dyn).ids.includes('preset:safe'));
  const full = search('full screen').ids.filter((id) => id.startsWith('key:'));
  assert.equal(full.length, 1, 'F');
  assert.ok(search('shift k').ids.some((id) => id.startsWith('key:')));
  // Each counts where it is: a scene in Scenes & Cards, a setup in My Setups; the presets and
  // keys belong to no tab.
  const { plan } = search('friday', dyn);
  assert.equal(plan.counts.setups, 1);
});

test('names are marked escaped: an imported setup named like markup stays text', () => {
  const name = '<img src=x onerror="window.__xss=1">';
  const { hits } = search('img', { setups: [name] });
  const hit = hits.find((h) => h.entry.id === `setup:${name}`);
  assert.ok(hit, 'found by its name');
  const marked = highlight(name, hit.ranges);
  assert.doesNotMatch(marked, /<img/);
  assert.match(marked, /&lt;<mark>img<\/mark> src=x onerror=&quot;window.__xss=1&quot;&gt;/);
});

test('nothing found: words near the query that find something, or a few that always do', () => {
  assert.deepEqual(search('zzzz').ids, []);
  const near = suggestFor('strobbing');
  assert.ok(near.includes('flash') && near.includes('flicker'), near.join());
  assert.ok(suggestFor('brightnes').includes('exposure'));
  assert.deepEqual(suggestFor('qqqq'), ['flash', 'frame rate', 'knights', 'colors']);
  for (const word of suggestFor('qqqq')) assert.ok(search(word).ids.length > 0, `${word} finds something`);
});

test('the Stats Overlay is found by the words people use for it: info, statistics, an fps counter', () => {
  for (const q of ['info', 'statistics', 'fps counter', 'diagnostics', 'stats', 'fps']) {
    const { ids, plan } = search(q);
    assert.ok(ids.includes('stats'), `${q}: ${ids.join(', ')}`);
    assert.ok(plan.counts.picture >= 1, `${q}: counted in Picture`);
  }
});
