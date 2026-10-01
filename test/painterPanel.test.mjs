// The Bonfire Painter's panel, its search and the bar's tools (pure parts; the browser's are
// e2e/painter.spec.mjs and e2e/tips-painter.spec.mjs):
//   - its sections are the settings map's, in order, each row where its setting sits, every
//     part of a scene the map binds for the Painter placed once;
//   - every field edits a part of the scene the format keeps, and says what it does: a hint of
//     12–160 characters that isn't its label, a "?" a keyboard stop only where no field reads
//     it out; Title Case labels and choices; no native title tooltips;
//   - the three-way switches are radios (one keyboard stop each: Layers is 14, not 42);
//   - a bulk toolbar's button is one edit, so one undo step, and keeps the rules (Painterly
//     and Watercolor never both Always; a move list keeps one);
//   - a shape change draws again only its own section, the others' markup the same;
//   - the search finds every row by its label, words, choices and hint, and says how to
//     bring back one the scene's shape leaves out ("Glow Strength: turn on Glow in Layers…");
//   - the keys overlay lists every key the Painter answers; the render menu reads values the
//     way Bonfire Live does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  panelMarkup, panelShape, sectionMarkup, sectionShapes, getPath, withPath, slotColors, bulkEdit, SECTIONS, LOCK_TIPS,
} from '../src/painter/panel.js';
import { PANEL_SECTIONS, LAYOUT, OWN, PAINTER_ITEM_HINTS, groupsOf, rowText, rowShown, shownRule, sectionRows, choices, sectionOfRow } from '../src/painter/layout.js';
import { searchEntries, findInPanel, notesFor, PAINTER_SYNONYMS } from '../src/painter/panelSearch.js';
import { PAINTER_KEYS, TIPS, TOOLS, toolsMarkup } from '../src/painter/toolbar.js';
import { PAINTER_SECTIONS, SECTIONS as MAP_SECTIONS, SETTINGS, ITEM_HINTS, TRI_HELP, entriesFor } from '../src/settingsMap.js';
import { buildMatcher } from '../src/ui/settingsSearch.js';
import { titleCase } from '../src/text.js';
import { createHistory } from '../src/painter/history.js';
import { MAX_KNIGHTS, KNIGHT_MOVES } from '../src/visualizer/knightShow.js';
import { defaultScene, normalizeScene, DETAIL_KEYS } from '../src/scenes.js';
import { LAYERS, LAYER_BLENDS, LAYER_DETAILS, LOOK_PARAMS, DROP_FX } from '../src/visualizer/looks.js';

/** Every attribute value `name` in the markup. */
const attrs = (html, name) => [...html.matchAll(new RegExp(`(?<![\\w-])${name}="([^"]*)"`, 'g'))].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, '\''));
/** Markup with its generated ids (fields.js counts them up) made the same. */
const sameIds = (html) => html.replace(/viz-(tip|fld|tri|why)-\d+/g, 'viz-$1-#');
/** A scene with every optional part filled: its own place colors and drop hits, every layer on, details pinned, a few-color palette, four knights with moves. */
function fullScene() {
  const s = defaultScene('Everything');
  s.colors.scenery = { void: '#050608', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };
  s.drops = { fx: Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, 'mix'])), count: 3 };
  s.layers = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, 'mix']));
  s.details = { ghostKeep: 0.9, glowSize: 3, grad: [0, 6, 8], paintR: 3, scan: 1, mirror: 2, flicker: 1, chroma: 2 };
  s.look = { name: 'kaleido', amount: 1.2, params: { segments: 8 } };
  s.render.palette = [0, 6, 8];
  s.knights = { ...s.knights, count: 4, helmets: ['great', null, 'armet', null], moves: ['nod', 'defaultDance'], style: 'mix' };
  s.fireflies.moves = ['swing'];
  s.camera.move = { kind: 'push', amount: 0.5, bars: 8 };
  return normalizeScene(s);
}
const ctx = {
  weapons: { rapier: 'Rapier', greatsword: 'Greatsword' },
  elements: { fire: 'Fire', lightning: 'Lightning', ice: 'Ice' },
  flames: [{ key: 'ember', name: 'Ember Flame', colors: { lo: '#8c1d2f', mid: '#e0582a', hi: '#ffc76a', core: '#fff1d0', shade: '#2e1f1f', light: 0.34 } }],
  shots: [{ key: 'clearing', name: 'Clearing', camera: defaultScene().camera }],
};
const ALL_OPEN = SECTIONS.map(([id]) => id);
const SCENES = [['a new scene', () => normalizeScene(defaultScene())], ['a full scene', fullScene]];
/** Units and marks a choice keeps in lower case (a size, a rate). */
const UNITS = new Set(['px', 'fps']);
const isTitleCase = (text) => titleCase(text) === text || text.split(' ').every((w, i) => UNITS.has(w) || titleCase(w) === w || (i > 0 && ['a', 'an', 'the'].includes(w)));

test('sections: the settings map’s Painter sections, in order; every row placed once, where its setting sits', () => {
  assert.deepEqual(SECTIONS.map(([id]) => id), PAINTER_SECTIONS.map((s) => s.id));
  assert.deepEqual(SECTIONS.map(([, label]) => label), [
    'Place & Atmosphere', 'Colors', 'Fire', 'Pixel Art', 'Look', 'Layers', 'Camera', 'Knights', 'Fireflies', 'Show',
  ]);
  const html = panelMarkup(fullScene(), { ...ctx, open: ALL_OPEN });
  assert.deepEqual(attrs(html, 'data-sec'), SECTIONS.map(([id]) => id), 'drawn in order');
  // Every row of the layout belongs to one shared section that's in its Painter section.
  const placed = new Map();
  for (const sec of PANEL_SECTIONS) {
    for (const [g, rows] of sectionRows(sec.id)) {
      assert.ok(g.id === 'preview' || sec.from.includes(g.id), `${g.id} in ${sec.id}`);
      for (const r of rows) {
        assert.ok(!placed.has(r), `${r} placed twice`);
        placed.set(r, sec.id);
        assert.ok(rowText(r), `${r} has a label and a hint`);
        assert.equal(sectionOfRow(r), sec.id);
      }
    }
  }
  // Every part of a scene the map binds for the Painter is a row (the look's and the layers'
  // details are their items: param.*, detail.*), in the section its entry's in.
  for (const e of entriesFor('painter')) {
    if (e.id === 'lookDetails' || e.id === 'layerDetails') continue;
    assert.ok(placed.has(e.id), `${e.id} (${e.painter}) is placed`);
    const sec = PANEL_SECTIONS.find((s) => s.id === placed.get(e.id));
    assert.ok(sec.from.includes(e.section), `${e.id}: ${e.section} is in ${sec.id}`);
  }
  // Fire has the fire's shape (out of Colors); Show what a scene leaves to the music.
  assert.deepEqual(LAYOUT.fire, ['fireLevel', 'fireSize', 'fireHeight', 'fireTurbulence', 'fireGlow', 'windX', 'windZ']);
  assert.match(sectionMarkup('fire', defaultScene(), ctx), /data-scene="fire\.level"[\s\S]*data-scene="fire\.windZ"/);
  assert.doesNotMatch(sectionMarkup('colors', defaultScene(), ctx), /data-scene="fire\./);
  const show = sectionMarkup('show', fullScene(), ctx);
  const order = ['data-pick="music"', 'data-scene="place.weapon"', 'data-scene="place.element"', 'data-pick="drops"', 'data-bulk-group="drops.fx"', 'data-scene="drops.fx.shatter"', 'data-scene="drops.count"'];
  const at = order.map((a) => show.indexOf(a));
  assert.ok(at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]), `Show's order: ${at}`);
  // Knights: its groups under sub-headings (the first is the section's own heading), the
  // gestures last, a preview.
  assert.deepEqual(groupsOf('knights').map((g) => g.head), ['Knights', 'Armor', 'Dancing', 'Behavior', 'Try a Gesture (Preview, Not Saved)']);
  const knights = sectionMarkup('knights', fullScene(), ctx);
  assert.deepEqual([...knights.matchAll(/<h3 class="pnt-subhead"><span data-hl id="pnt-g-\w+">([^<]+)<\/span>/g)].map((m) => m[1]), ['Armor', 'Dancing', 'Behavior', 'Try a Gesture (Preview, Not Saved)']);
  assert.doesNotMatch(sectionMarkup('knights', normalizeScene(withPath(defaultScene(), 'knights.count', 0)), ctx), /pnt-subhead/, 'no knights: only the count, no headings');
  // The gestures' group is named by its heading's name alone (not its "?" and hidden hint too).
  assert.match(knights, /<span data-hl id="pnt-g-preview">Try a Gesture \(Preview, Not Saved\)<\/span> <button type="button" class="viz-tip"/);
  assert.match(knights, /role="group" aria-labelledby="pnt-g-preview"/);
});

for (const [name, make] of SCENES) {
  test(`panel (${name}): every field edits a part of the scene the format keeps`, () => {
    const scene = make();
    const html = panelMarkup(scene, { ...ctx, open: ALL_OPEN });
    const paths = attrs(html, 'data-scene');
    assert.ok(paths.length > 40, `${paths.length} fields`);
    for (const path of paths) {
      const detail = /^details\.(\w+)/.exec(path)?.[1];
      const param = /^look\.params\.(\w+)/.exec(path)?.[1];
      const blend = /^blends\.(\w+)$/.exec(path)?.[1];
      const helmet = /^knights\.helmets\.(\d)$/.exec(path)?.[1];
      const item = /^(layers|drops\.fx)\.(\w+)$/.exec(path);
      if (detail) { assert.ok(DETAIL_KEYS.includes(detail), path); continue; } // (a detail: pinned, or rolled)
      if (blend) { assert.ok(Object.hasOwn(LAYER_BLENDS, blend), path); continue; }
      if (param) { assert.ok(LOOK_PARAMS[scene.look.name].includes(param), path); continue; }
      if (item) { assert.ok(Object.hasOwn(item[1] === 'layers' ? LAYERS : DROP_FX, item[2]), path); continue; } // (missing: Off)
      // (Every knight's helmet row is drawn; those past the count wait, hidden.)
      if (helmet && Number(helmet) >= scene.knights.count) { assert.match(html, new RegExp(`data-helmet="${helmet}" hidden`)); continue; }
      assert.notEqual(getPath(scene, path), undefined, `${path} is in the scene`);
    }
    // Chips pick values the format keeps as they are; a switch's radios its three modes.
    for (const [path, value] of attrs(html, 'data-pick').map((p, i) => [p, attrs(html, 'data-value')[i]])) {
      const v = JSON.parse(value);
      const next = normalizeScene(withPath(scene, path, v));
      assert.deepEqual(getPath(next, path), v, `${path} = ${value}`);
    }
    for (const m of html.matchAll(/<input type="radio"[^>]*data-scene="([^"]+)" value="([^"]+)"/g)) {
      assert.equal(getPath(normalizeScene(withPath(scene, m[1], m[2])), m[1]), m[2], `${m[1]} = ${m[2]}`);
    }
    // Every row the scene's shape shows is drawn, and none it doesn't.
    const rows = new Set(attrs(html, 'data-row'));
    for (const id of Object.values(LAYOUT).flat()) assert.equal(rows.has(id), rowShown(id, scene), id);
  });

  test(`panel (${name}): every field and group says what it does, in a hint that isn't its label`, () => {
    const html = panelMarkup(make(), { ...ctx, open: ALL_OPEN });
    // Every hint people can open: 12–160 characters, a sentence, not the label it sits by.
    for (const m of html.matchAll(/<(?:p|span|legend|h3|div)[^>]*>(?:<span[^>]*>)*(?:<label[^>]*>)?(?:<span data-hl>)?([^<]*)(?:<\/span>)?(?:<\/label>)?\s*(?:<\/span>)?\s*<button type="button" class="viz-tip"[^>]*data-tip="([^"]*)"/g)) {
      const [label, hint] = [m[1].trim(), m[2].replace(/&amp;/g, '&')];
      if (!label) continue;
      const [h, l] = [hint.toLowerCase(), label.toLowerCase()];
      assert.ok(h !== l && !h.startsWith(`${l} `) && !h.startsWith(`${l}:`), `"${hint.slice(0, 40)}…" is its label "${label}" again`);
    }
    for (const hint of attrs(html, 'data-tip')) {
      assert.ok(hint.length >= 12 && hint.length <= 160, `${hint.length} characters: "${hint.slice(0, 50)}…"`);
      assert.match(hint, /^[A-Z“‘(]/, `a sentence: "${hint.slice(0, 40)}"`);
      assert.doesNotMatch(hint, /In the mix:|\(it comes and goes|Pinned, it stays as painted; left to the dice/, 'no boilerplate');
    }
    // Every input bound to the scene reads a hint out (a switch's radios, their fieldset's)…
    for (const m of html.matchAll(/<(input|select)[^>]*data-scene="([^"]+)"[^>]*>/g)) {
      if (/type="radio"/.test(m[0])) continue;
      assert.match(m[0], /aria-describedby="viz-tip-\d+"/, `${m[2]} has no hint`);
    }
    for (const m of html.matchAll(/<fieldset class="tri"[^>]*data-set-group="([^"]+)"[^>]*>/g)) assert.match(m[0], /aria-describedby="viz-tip-\d+/, `${m[1]}`);
    // …and a "?" is a keyboard stop of its own only when no field reads its hint out.
    const ids = new Set([...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]));
    const hintText = new Map([...html.matchAll(/<span class="visually-hidden" id="([^"]+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]));
    const stops = new Set([...html.matchAll(/<button type="button" class="viz-tip" tabindex="0"[^>]*aria-describedby="([^"]+)"/g)].map((m) => m[1]));
    const read = new Set();
    for (const m of html.matchAll(/<(input|select|textarea|button|fieldset)\b(?![^>]*class="viz-tip")[^>]*aria-describedby="([^"]+)"/g)) {
      for (const id of m[2].split(/\s+/)) {
        assert.ok(ids.has(id), `${m[0].slice(0, 60)}… points at a missing hint (${id})`);
        if (m[1] !== 'button') assert.ok(!stops.has(id), `${m[0].slice(0, 60)}… reads out a hint whose "?" is a stop too`);
        read.add(hintText.get(id));
      }
    }
    assert.ok(stops.size > 0 && read.size > 20, `(stops ${stops.size}, hints read out ${read.size})`);
    // Title Case labels, headings and choices (units stay as they're written: 4 px, 12 fps).
    const texts = [
      ...[...html.matchAll(/<span data-hl>([^<]+)<\/span>/g)].map((m) => m[1]),
      ...[...html.matchAll(/<option value="[^"]*">([^<]+)<\/option>/g)].map((m) => m[1]),
      ...[...html.matchAll(/<button type="button" class="(?:pix-btn|pnt-chip[^"]*|bulk-btn)"[^>]*>(?:<span class="pnt-sw"[\s\S]*?<\/span>)?(?:<span>)?([^<]+)</g)].map((m) => m[1]),
      ...[...html.matchAll(/<label class="viz-check"><input[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1]),
    ].map((t) => t.replace(/&amp;/g, '&').trim()).filter(Boolean);
    assert.ok(texts.length > 150, `${texts.length} texts`);
    for (const t of texts) assert.ok(isTitleCase(t), `"${t}" isn't Title Case`);
    // No native tooltips: the shared one shows every hint, on hover, focus and a tap.
    assert.doesNotMatch(html, /\stitle="/);
  });
}

test('panel: labels, hints and More come from the settings map; every look, layer and drop hit has its own hint', () => {
  const html = panelMarkup(fullScene(), { ...ctx, open: ALL_OPEN });
  const tips = new Set(attrs(html, 'data-tip'));
  for (const id of ['exposure', 'fog', 'knightRim', 'flameLight', 'fireGlow', 'glitch', 'camera']) {
    const e = SETTINGS[id];
    const label = e.labels?.painter ?? e.label;
    assert.match(html, new RegExp(`<span data-hl>${label.replace(/[&]/g, '&amp;')}</span>`), `${id}: "${label}"`);
    assert.ok(tips.has(e.hints?.painter ?? e.hint), `${id}: its hint`);
  }
  // The Painter's names for the same thing as Live's: Firelight, Strength, Edge Glow Strength.
  assert.match(html, /<span data-hl>Firelight<\/span>/);
  assert.match(html, /<span data-hl>Edge Glow Strength<\/span>/);
  assert.match(html, /<span data-hl>Strength<\/span>/);
  assert.doesNotMatch(html, /Light Toward White|Glow on the Scene|Knights by the Fire|Look Strength/);
  // Each layer and drop hit its own hint (no shared one, no appended boilerplate).
  for (const k of Object.keys(LAYERS)) assert.ok(tips.has(PAINTER_ITEM_HINTS.layers[k] ?? ITEM_HINTS.layers[k]), `layer ${k}`);
  for (const k of Object.keys(DROP_FX)) assert.ok(tips.has(ITEM_HINTS.dropFx[k]), `drop hit ${k}`);
  assert.equal(new Set(Object.keys(DROP_FX).map((k) => ITEM_HINTS.dropFx[k])).size, Object.keys(DROP_FX).length);
  // The Painter's own words only where the shared one speaks of Live's own (a key, looks taking turns).
  for (const [group, items] of Object.entries(PAINTER_ITEM_HINTS)) {
    for (const [k, h] of Object.entries(items)) {
      assert.ok(Object.hasOwn(ITEM_HINTS[group], k), `${group}.${k}`);
      assert.ok(h.length >= 12 && h.length <= 160);
      assert.doesNotMatch(h, /\bM switches\b|In the Mix it takes its turn/);
    }
  }
  // The look's own hint under the looks; the More for the long ones, folded.
  assert.match(html, new RegExp(`data-look-hint>${PAINTER_ITEM_HINTS.looks.kaleido ?? ITEM_HINTS.looks.kaleido}<`));
  for (const id of ['knightStyle', 'knightGlow', 'knightShine', 'sceneHold']) {
    const first = (SETTINGS[id].mores?.painter ?? SETTINGS[id].more).split('\n')[0];
    assert.ok(html.includes(`<li>${first.replace(/&/g, '&amp;')}</li>`), `${id}'s More`);
  }
  assert.match(html, /<details class="viz-more"><summary>More<\/summary>/, 'not only in a Simple / All view');
  // Each Painter row of its own: Title Case, its hint a sentence that isn't it.
  for (const [id, o] of Object.entries(OWN)) {
    assert.equal(titleCase(o.label), o.label, id);
    assert.ok(o.hint.length >= 12 && o.hint.length <= 160 && !o.hint.startsWith(o.label), `${id}: "${o.hint}"`);
  }
});

test('panel: the pin/die lock says what it does in its own tooltip', () => {
  const html = sectionMarkup('layers', fullScene(), ctx);
  assert.match(html, new RegExp(`data-lock="details\\.glowSize" aria-pressed="true" data-tip="${LOCK_TIPS.pinned}" aria-label="Glow Size: pinned, stays as painted"`));
  assert.match(html, new RegExp(`data-lock="details\\.glowCut" aria-pressed="false" data-tip="${LOCK_TIPS.rolled}" aria-label="Glow Threshold: rolled each time, click to pin"`));
  assert.deepEqual(LOCK_TIPS, { pinned: 'Pinned: stays as painted', rolled: 'Rolled each time: click to pin' });
});

test('panel: Off / In the Mix / Always are radios, one keyboard stop a switch (Layers 14, not 42)', () => {
  const html = sectionMarkup('layers', normalizeScene(defaultScene()), ctx);
  const sets = [...html.matchAll(/<fieldset class="tri"[^>]*data-set-group="([^"]+)"[\s\S]*?<\/fieldset>/g)];
  assert.equal(sets.length, Object.keys(LAYERS).length);
  for (const [field, key] of sets) {
    const radios = [...field.matchAll(/<input type="radio" name="([^"]+)" data-scene="([^"]+)" value="(\w+)"( data-missing)?/g)];
    assert.deepEqual(radios.map((r) => r[3]), ['off', 'mix', 'on'], key);
    assert.equal(new Set(radios.map((r) => r[1])).size, 1, `${key}: one group (one stop, the arrows move along it)`);
    assert.ok(radios.every((r) => r[2] === key));
    assert.deepEqual(radios.filter((r) => r[4]).map((r) => r[3]), ['off'], `${key}: missing is Off`);
    assert.match(field, /<label class="tri-opt" data-audition>/, `${key}: its choices audition`);
  }
  // No chip-button switches left; the drop hits, outlines and the knights' switches too.
  assert.doesNotMatch(panelMarkup(fullScene(), { ...ctx, open: ALL_OPEN }), /pnt-seg|pnt-mode/);
  const all = panelMarkup(fullScene(), { ...ctx, open: ALL_OPEN });
  for (const key of ['render.outlines', 'knights.glow', 'knights.dance', 'knights.shine', 'knights.reactions', 'drops.fx.iris']) assert.match(all, new RegExp(`data-set-group="${key.replace(/\./g, '\\.')}"`), key);
  assert.match(all, /data-scene="render\.outlines" value="on" data-missing/, 'outlines: missing is Always');
  assert.match(all, /data-scene="knights\.glow" value="mix" data-missing/, 'edge glow: missing is In the Mix');
  // What the three mean, said once in each section that has them, over its first switch (and
  // nowhere else: no hint repeats it).
  const help = `<p class="pnt-help" data-tri-help>${TRI_HELP}</p>`;
  for (const [id] of SECTIONS) {
    const body = sectionMarkup(id, fullScene(), ctx);
    const switches = body.indexOf('<fieldset class="tri"');
    assert.equal(body.split(help).length - 1, switches >= 0 ? 1 : 0, id);
    if (switches >= 0) assert.ok(body.indexOf(help) < switches, `${id}: over the first`);
  }
  assert.doesNotMatch(sectionMarkup('show', normalizeScene(defaultScene()), ctx), /data-tri-help/, 'the show’s drop hits: no switches, no line');
});

test('bulk: a toolbar’s button is one edit (one undo step) that keeps the scene’s rules', () => {
  const s = normalizeScene(defaultScene());
  const html = sectionMarkup('layers', s, ctx);
  assert.deepEqual(attrs(html, 'data-bulk'), ['off', 'mix', 'on', 'shuffle', 'defaults']);
  // All Always: every layer on, but Painterly and Watercolor never both always (normalizeScene).
  const on = bulkEdit(s, 'layers', 'on');
  assert.equal(on.path, 'layers');
  const h = createHistory();
  h.push(s, null);
  const next = normalizeScene(withPath(s, on.path, on.value));
  assert.equal(h.size, 1, 'one undo step');
  assert.ok(Object.keys(LAYERS).every((k) => (next.layers[k] ?? 'off') !== 'off'));
  assert.equal(next.layers.paint, 'on');
  assert.equal(next.layers.wash, 'mix');
  assert.deepEqual(h.undo(next), s, 'undo puts every layer back at once');
  // All Off and Defaults: a new scene's (nothing kept), In the Mix every one; Shuffle rolls each.
  assert.deepEqual(bulkEdit(next, 'layers', 'off').value, {});
  assert.deepEqual(bulkEdit(next, 'layers', 'defaults').value, {});
  assert.deepEqual(bulkEdit(s, 'layers', 'mix').value, Object.fromEntries(Object.keys(LAYERS).map((k) => [k, 'mix'])));
  const rolls = [0.1, 0.5, 0.9];
  let i = 0;
  const shuffled = bulkEdit(s, 'layers', 'shuffle', () => rolls[i++ % 3]).value;
  assert.deepEqual(Object.values(shuffled).slice(0, 2), ['mix', 'on'], 'rolled (Off ones left out)');
  // The scene's own drop hits: only while it has them.
  assert.equal(bulkEdit(s, 'drops.fx', 'on'), null);
  const own = normalizeScene({ ...s, drops: { fx: {}, count: 2 } });
  assert.deepEqual(bulkEdit(own, 'drops.fx', 'on').value, Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, 'on'])));
  assert.match(sectionMarkup('show', own, ctx), /data-bulk-group="drops\.fx"/);
  // A move list: All, Defaults back to the show's; None is there but marked unavailable, with
  // why (a list keeps at least one move: the panel's click does nothing on it).
  const moves = normalizeScene({ ...s, knights: { ...s.knights, moves: ['nod'] } });
  assert.deepEqual(bulkEdit(moves, 'knights.moves', 'all').value, Object.keys(KNIGHT_MOVES));
  assert.equal(bulkEdit(moves, 'knights.moves', 'defaults').value, null);
  const list = sectionMarkup('knights', moves, ctx);
  assert.deepEqual(attrs(list, 'data-bulk'), ['all', 'none', 'defaults']);
  assert.match(list, /data-bulk="none" data-bulk-group="knights\.moves" aria-disabled="true" data-tip="At least one has to stay on\."/);
  assert.equal(bulkEdit(s, 'nope', 'on'), null);
});

test('redraw: a shape change draws only its own section again; the others’ markup stays the same', () => {
  const s = normalizeScene(defaultScene());
  const ctxOpen = { ...ctx };
  const changes = {
    layers: (x) => withPath(x, 'layers.glow', 'on'),
    look: (x) => withPath(x, 'look.name', 'kaleido'),
    show: (x) => withPath(x, 'drops', { fx: {}, count: 2 }),
    knights: (x) => withPath(x, 'knights.count', 0),
    camera: (x) => withPath(x, 'camera.move.kind', 'still'),
    colors: (x) => withPath(x, 'render.palette', [0, 6, 8]),
    fireflies: (x) => withPath(x, 'fireflies.moves', ['swing']),
  };
  const before = sectionShapes(s);
  for (const [section, change] of Object.entries(changes)) {
    const next = normalizeScene(change(s));
    const after = sectionShapes(next);
    assert.deepEqual(Object.keys(after).filter((id) => after[id] !== before[id]), [section], `${section} alone`);
    for (const [id] of SECTIONS.filter(([other]) => other !== section)) {
      assert.equal(sameIds(sectionMarkup(id, next, ctxOpen)), sameIds(sectionMarkup(id, s, ctxOpen)), `${id} is drawn the same after a ${section} change`);
    }
    assert.notEqual(sameIds(sectionMarkup(section, next, ctxOpen)), sameIds(sectionMarkup(section, s, ctxOpen)));
  }
  // Values don't redraw: a slider moved, a layer from In the Mix to Always (its radios say so),
  // the knights' count from 1 to 4 (every helmet row is there, the extra ones hidden).
  assert.equal(panelShape(normalizeScene(withPath(s, 'fire.level', 0.5))), panelShape(s));
  assert.equal(panelShape(normalizeScene(withPath(s, 'knights.count', 4))), panelShape(s));
  assert.equal(sectionShapes(normalizeScene(withPath(s, 'layers.glow', 'on'))).layers, sectionShapes(normalizeScene(withPath(s, 'layers.glow', 'mix'))).layers);
  const four = sectionMarkup('knights', normalizeScene(withPath(s, 'knights.count', 2)), ctx);
  for (let k = 0; k < MAX_KNIGHTS; k++) assert.match(four, new RegExp(`data-helmet="${k}"${k < 2 ? '>' : ' hidden>'}`));
  // The whole panel is the sections' bodies, each in its section.
  const whole = panelMarkup(s, { ...ctx, open: ALL_OPEN });
  for (const [id] of SECTIONS) assert.ok(sameIds(whole).includes(sameIds(sectionMarkup(id, s, ctx))), `${id}'s body`);
});

test('panel: the few colors’ slots are the scene’s palette slots, pressed as picked', () => {
  const s = normalizeScene(withPath(defaultScene(), 'render.palette', [0, 6, 8]));
  const html = sectionMarkup('colors', s, ctx);
  const cols = slotColors(s);
  const slots = [...html.matchAll(/data-slot="(\d)" aria-pressed="(true|false)"[^>]*><i style="--c:([^"]+)"/g)];
  assert.equal(slots.length, 10);
  for (const [, n, pressed, c] of slots) {
    assert.equal(pressed === 'true', [0, 6, 8].includes(Number(n)), `slot ${n}`);
    assert.equal(c, cols[Number(n)]);
  }
});

test('panel: every layer with details lists them (looks.js LAYER_DETAILS) when it is on', () => {
  const html = sectionMarkup('layers', fullScene(), ctx);
  for (const [layer, keys] of Object.entries(LAYER_DETAILS)) {
    for (const k of keys) {
      if (k === 'grad') assert.match(html, /data-scene="details\.grad\.0"/, layer);
      else assert.match(html, new RegExp(`data-scene="details\\.${k}"`), `${layer}: ${k}`);
      assert.match(html, new RegExp(`data-row="detail\\.${k}"`));
    }
  }
  assert.doesNotMatch(sectionMarkup('layers', normalizeScene(defaultScene()), ctx), /data-scene="details\./);
});

test('choices: Title Case, the site’s own marked, every select’s', () => {
  for (const id of Object.values(LAYOUT).flat()) {
    for (const [, text] of choices(id, ctx)) assert.ok(isTitleCase(text), `${id}: "${text}"`);
  }
  assert.deepEqual(choices('pixelSize').find(([v]) => v === '4'), ['4', '4 px (The Site’s)']);
  assert.deepEqual(choices('pixelSize', { site: { pixelSize: 3 } }).find(([v]) => v === '3'), ['3', '3 px (The Site’s)']);
  assert.deepEqual(choices('weapon', ctx)[0], ['', 'Drawn By the Show']);
  assert.deepEqual(choices('dropCount').map(([, t]) => t), ['One', 'Up To Two', 'Up To Three']);
});

// --- the search -----------------------------------------------------------------------------
const entries = searchEntries(ctx);
const match = buildMatcher(entries, { synonyms: PAINTER_SYNONYMS });
const find = (q, scene = normalizeScene(defaultScene())) => findInPanel(match, q, scene);

test('search: the index has every row (a layer’s details, the blends), each with its label, section and hint', () => {
  const ids = entries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'once each');
  for (const id of Object.values(LAYOUT).flat()) assert.ok(ids.includes(id), id);
  for (const k of new Set(Object.values(LAYER_DETAILS).flat())) assert.ok(ids.includes(`detail.${k}`), k);
  for (const k of Object.keys(LAYER_BLENDS)) assert.ok(ids.includes(`blend.${k}`), k);
  for (const e of entries) {
    assert.ok(e.label && e.section && e.hint, e.id);
    assert.ok(PAINTER_SECTIONS.some((s) => s.label === e.section), `${e.id}: ${e.section}`);
  }
  // Sub-headings count as where a row is: "armor" finds the Armor group.
  assert.ok(find('armor').rows.has('knightFinish'));
  assert.ok(MAP_SECTIONS.find((s) => s.id === 'armor'));
});

test('search: "glow" finds the Glow layer and Edge Glow; what the scene leaves out says how to bring it back', () => {
  const s = normalizeScene(defaultScene());
  const glow = find('glow', s);
  for (const id of ['layer.glow', 'knightGlow', 'knightRim', 'fireGlow']) assert.ok(glow.rows.has(id), id);
  // Glow off: its details aren't drawn, so they're listed with what to do.
  assert.ok(!glow.rows.has('detail.glowAmt'));
  assert.ok(glow.hidden.some((h) => h.note === 'Glow Strength: turn on Glow in Layers to see this'), glow.hidden.map((h) => h.note).join(' / '));
  // Glow on: they're rows like the rest.
  const on = find('glow', normalizeScene(withPath(s, 'layers.glow', 'mix')));
  for (const id of ['detail.glowSize', 'detail.glowCut', 'detail.glowAmt']) assert.ok(on.rows.has(id), id);
  assert.ok(!on.hidden.some((h) => h.id.startsWith('detail.glow')));
  // The label's matched letters, for the mark.
  assert.deepEqual(on.rows.get('layer.glow'), { ranges: [[0, 4]], label: 'Glow' });
  // Other shapes: no knights, a still camera, the show's own drop hits, a look's own detail.
  const none = normalizeScene(withPath(s, 'knights.count', 0));
  assert.ok(find('helmet', none).hidden.some((h) => h.note === 'Helmets: set Knights above 0 to see this'));
  assert.ok(find('movement size', normalizeScene(withPath(s, 'camera.move.kind', 'still'))).hidden.some((h) => h.note.startsWith('Movement Size: pick a Movement other than Still')));
  assert.ok(find('iris', s).hidden.some((h) => h.note === 'Iris Snap: pick This Scene’s Own under Drop Hits to see this'));
  assert.ok(find('segments', s).hidden.some((h) => h.note === 'Segments: pick the Kaleido look to see this'));
  assert.ok(find('segments', normalizeScene(withPath(s, 'look.name', 'kaleido'))).rows.has('param.segments'));
  // Every rule's note says how, and names rows that do it (rows of the panel, in sight
  // whenever the hidden one isn't, so it's one click from the note).
  const ids = new Set(entries.map((e) => e.id));
  for (const id of ids) {
    const rule = shownRule(id);
    if (!rule) continue;
    assert.match(rule[1], /^(turn on|pick|set) .+ to see this$/, `${id}: "${rule[1]}"`);
    assert.ok(rule[2].length && rule[2].every((r) => ids.has(r) && !shownRule(r)), `${id}: brought back by ${rule[2]}`);
  }
  // The row that brings a hidden one back shows beside its note (not counted as found), and
  // the panel scrolls to it: "iris" with the show's drop hits shows Drop Hits' own choice.
  const iris = find('iris', s);
  assert.deepEqual(iris.hidden.map((h) => h.id), ['dropFx.iris']);
  assert.deepEqual([...iris.rows.keys()], ['dropSource']);
  assert.deepEqual([...iris.via], ['dropSource']);
  assert.equal(iris.first, 'dropSource');
  assert.deepEqual(iris.rows.get('dropSource').ranges, [], 'nothing marked in it: it wasn’t found');
  assert.ok(glow.rows.has('layer.glow') && !glow.via.has('layer.glow'), 'Glow found, as well as bringing its details back');
  assert.equal(glow.first, 'layer.glow', 'the best found first, wherever it sits in the panel');
  // The blends' rows are named apart from their layers': "Glow Blend", not a second "Glow".
  assert.ok(on.hidden.some((h) => h.note === 'Glow Blend: turn on Blend Modes in Layers to see this'));
  assert.equal(rowText('blend.feed').hint, 'How the Echoes layer lies over the picture; Rolled Each Turn picks a new way each time the look comes round.');
});

test('search: a row found only in its hint gives way to rows found by name; a group’s name finds its rows', () => {
  const s = normalizeScene(defaultScene());
  // "drop": Drop Hits' rows (by their names, their words, The Drop), not every hint that
  // mentions a drop (the knights' reactions, their edge glow…).
  const drop = find('drop', s);
  for (const id of ['dropSource']) assert.ok(drop.rows.has(id), id);
  for (const id of ['knightGlow', 'knightShine', 'knightReactions', 'knightCount', 'weapon', 'gestures']) {
    assert.ok(!drop.rows.has(id) && !drop.hidden.some((h) => h.id === id), `${id} only mentions a drop`);
  }
  assert.ok(drop.hidden.some((h) => h.id === 'dropFx.iris'), 'the scene’s own hits, by their group');
  assert.equal(drop.first, 'dropSource');
  // Many left out for one reason share a line under the box; a few keep one each.
  assert.deepEqual(notesFor(drop.hidden), [`Hits Per Drop, This Scene’s Hits, Shatter and ${drop.hidden.length - 3} more: pick This Scene’s Own under Drop Hits to see this`]);
  assert.deepEqual(notesFor(find('glow', s).hidden).slice(0, 3), ['Glow Size: turn on Glow in Layers to see this', 'Glow Threshold: turn on Glow in Layers to see this', 'Glow Strength: turn on Glow in Layers to see this']);
  assert.equal(entries.find((e) => e.id === 'dropFx.iris').tab, 'The Drop');
  // "fire": the Fire section's sliders and what's named for the fire, not every hint.
  const fire = find('fire', s);
  for (const id of ['fireLevel', 'fireSize', 'windX', 'fireGlow']) assert.ok(fire.rows.has(id), id);
  for (const id of ['fog', 'vignette', 'knightSeat', 'dropFx.shock']) assert.ok(!fire.rows.has(id) && !fire.hidden.some((h) => h.id === id), id);
  // With nothing found by name, the hints still find it.
  const hintOnly = find('outlines take', s);
  assert.ok(hintOnly.rows.size + hintOnly.hidden.length > 0);
  for (const h of [...hintOnly.rows.keys()]) assert.ok(rowText(h)?.hint.toLowerCase().includes('outlines take') || hintOnly.via.has(h), h);
});

test('search: synonyms, typos, choices and keywords find their rows', () => {
  assert.ok(find('bloom').rows.has('layer.glow'));
  assert.ok(find('exposre').rows.has('exposure'), 'a typo');
  assert.ok(find('fov').rows.has('lens'));
  assert.ok(find('armet').rows.has('knightHelmets'), 'a choice');
  assert.ok(find('praise').rows.has('gestures'));
  assert.ok(find('scenery').rows.has('scenery'));
  assert.ok(find('kaleidoscope').rows.has('looks'));
  // The Painter's own: "firefly" (not the start of "fireflies") finds the Fireflies section.
  assert.ok(find('firefly speed').rows.has('flySpeed'));
  for (const id of ['flyLit', 'flyShow', 'flyMoves', 'flySpeed']) assert.ok(find('firefly').rows.has(id), id);
  assert.equal(find('').rows.size, 0, 'nothing for nothing');
  assert.equal(find('zzqx').rows.size + find('zzqx').hidden.length, 0);
});

// --- the bar ---------------------------------------------------------------------------------
test('keys: the overlay lists every key the Painter answers (none changed); Tools reaches the key-only ones', () => {
  const listed = PAINTER_KEYS.flatMap((g) => g.keys.map((r) => r.keys.join('+')));
  for (const k of ['Ctrl+S', 'Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+Y', 'H', 'L', 'I', 'F', 'C', 'Space', 'D', 'P', '1–8', '0', 'Arrow Keys', 'Shift+Arrow Keys', '+', '-', 'Q', 'E', '[', ']', '?', '/']) {
    assert.ok(listed.includes(k), `${k} is listed`);
  }
  for (const g of PAINTER_KEYS) assert.equal(titleCase(g.title), g.title);
  // (The page answers them: main.js's keys, the camera's.)
  const main = readFileSync(new URL('../src/painter/main.js', import.meta.url), 'utf8');
  for (const k of ['h', 'l', 'i', 'f', 'c', 'd']) assert.match(main, new RegExp(`k === '${k}'`), k);
  assert.match(main, /isHelpKey\(e\)/);
  assert.match(main, /e\.key === '\/'/);
  // Tools: Render Settings P, Pack I, Capture C, Full Screen F, Keyboard Shortcuts ?.
  assert.deepEqual(TOOLS.map((t) => `${t.label} ${t.key}`), ['Render Settings P', 'Pack I', 'Capture C', 'Full Screen F', 'Keyboard Shortcuts ?']);
  const html = toolsMarkup();
  assert.match(html, /data-cmd="tools" aria-label="Tools" aria-haspopup="menu" aria-expanded="false"/);
  assert.equal([...html.matchAll(/role="menuitem"/g)].length, TOOLS.length);
  assert.match(html, /aria-keyshortcuts="Shift\+\?"/);
  assert.doesNotMatch(html, /\stitle="/);
});

test('the bar: icon and preview buttons carry the shared tooltip; the render menu reads values as Bonfire Live does', () => {
  const main = readFileSync(new URL('../src/painter/main.js', import.meta.url), 'utf8');
  // Each icon or bar button: a name, and a tip that's read out too (the shared tip is hidden
  // from screen readers): its data-tip and the hidden text its aria-describedby names.
  for (const [cmd, key] of [['undo', 'undo'], ['redo', 'redo'], ['banner-close', 'close'], ['play', 'play']]) {
    assert.match(main, new RegExp(`data-cmd="${cmd}"[^>]*aria-label="[^"]+"[^>]*\\$\\{TIPS\\.${key}\\.attrs\\}[^>]*>.*?</button>\\$\\{TIPS\\.${key}\\.note\\}`), cmd);
    const [, text, id] = TIPS[key].attrs.match(/^data-tip="([^"]+)" aria-describedby="([^"]+)"$/) ?? [];
    assert.ok(text?.length >= 12 && text.length <= 160, `${cmd}: "${text}"`);
    assert.equal(TIPS[key].note, `<span class="visually-hidden" id="${id}">${text}</span>`, `${cmd}: read out`);
  }
  assert.match(main, /data-preview="\$\{id\}"[^>]*aria-label="\$\{esc\(name\)\}" aria-describedby="pnt-pv-\$\{id\}" data-tip="\$\{esc\(hint\)\}"/);
  // Tools: its tip read out the same way.
  assert.match(toolsMarkup(), /data-cmd="tools"[^>]*aria-describedby="pnt-tools-menu-tip" data-tip="([^"]+)"[\s\S]*<span class="visually-hidden" id="pnt-tools-menu-tip">\1<\/span>/);
  assert.ok(!/\stitle="/.test(main), 'no native title tooltips');
  // Render Settings, its reset row, the values in renderText's words (no lowercase off).
  assert.match(main, /title: 'Render Settings'/);
  assert.match(main, /label: 'Reset Render Settings'/);
  assert.match(main, /renderText\(r, id\)/);
  assert.ok(!/SWITCH_TEXT|'in the mix'|xray: r\.xray \? XRAY_VIEWS\[r\.xray\] : 'off'/.test(main), 'no lowercase switch words');
});
