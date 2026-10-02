// Bonfire Live's settings: the store (src/visualizer/settings.js) and the dialog's markup
// (settingsDialog.js, settingsControls.js). Old saved settings and exported setups still load
// and take the new keys' defaults; Club is the defaults (and puts back whatever another preset
// changes); Frame Rate stays with this computer (never in a setup or a preset); saving waits for
// a burst of changes. The dialog is the settings map's: nine tabs, each setting once, in its tab
// and section, named and explained by the map (Title Case names, hints of at most 160
// characters that don't repeat them), every effect a three-way switch, every grid and
// checklist with its bulk buttons, every setting that can be off for now with its reason line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSettings,
  defaults,
  mergeInto,
  presetOf,
  applyPreset,
  PRESETS,
  scenesFrom,
  inLoop,
  setInLoop,
  saveSettings,
  flushSettings,
  SAVE_MS,
  snapshot,
  saveSetup,
  loadSetup,
  readSetups,
  importSetups,
  exportSetups,
  deleteSetup,
  LOCAL,
  frameCap,
  CHOICES,
  PAGE_DEFAULTS,
} from '../src/visualizer/settings.js';
import { settingsMarkup, sceneListMarkup } from '../src/visualizer/settingsDialog.js';
import { OPTIONS, kindOf } from '../src/visualizer/settingsControls.js';
import { DEFAULT_SETTINGS } from '../src/visualizer/director.js';
import { LAYERS, DROP_FX, LOOKS, createLooks } from '../src/visualizer/looks.js';
import { BAR_OPTIONS } from '../src/visualizer/bars.js';
import { FINISHES } from '../src/bonfire/steel.js';
import { STYLE_KEYS } from '../src/bonfire/knightStyles.js';
import { SEAT_POSES, KNIGHT_STYLES } from '../src/visualizer/knightShow.js';
import { TABS, SECTIONS, TRI_HELP, ITEM_HINTS, entriesFor, meta } from '../src/settingsMap.js';
import { titleCase } from '../src/text.js';
import { defaultScene } from '../src/scenes.js';
import { KEY_GROUPS, keyList } from '../src/visualizer/keys.js';

// A browser's storage, for the store: what it holds, and every write.
const store = new Map();
const writes = [];
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => {
    writes.push(k);
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
};

const html = settingsMarkup(defaults(), keyList());
/** The part of the dialog's markup for one tab. */
const tabOf = (id) => {
  const at = html.indexOf(`id="viz-tab-${id}"`);
  const next = html.indexOf('class="viz-tab-panel"', at);
  return html.slice(at, next < 0 ? html.indexOf('data-keys-results', at) : next);
};
/** A row's markup (the setting's wrapper, data-row="<key>"): up to the next row of its section's level. */
function rowOf(key) {
  const at = html.indexOf(`<div class="viz-setting`, html.lastIndexOf(`data-row="${key}"`) - 80);
  const open = html.indexOf(`data-row="${key}"`);
  assert.ok(open > 0, `${key} has a row`);
  const start = html.lastIndexOf('<div class="viz-setting', open);
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (!depth) return html.slice(start, m.index + 6);
  }
  return html.slice(at);
}
const attrs = (part, name) =>
  [...part.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) =>
    m[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  );
/** A select's choices, in order. */
const choicesOf = (key) => {
  const f = html.match(new RegExp(`<select data-set="${key}"[^>]*>([\\s\\S]*?)</select>`));
  return f ? [...f[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]) : null;
};
/** A three-way switch's choices (its radios' values). */
const triOf = (key) =>
  [
    ...html.matchAll(
      new RegExp(`<input type="radio" name="[^"]+" data-set="${key.replace('.', '\\.')}" value="([^"]+)"`, 'g'),
    ),
  ].map((m) => m[1]);
/**
 * Title Case as the shared rule has it (src/text.js), for text that may carry numbers and
 * units: the words that start with a letter are checked ("4 px (As On the Site)").
 */
const UNITS = new Set(['px', 'fps', 'ms', 's', 'x']);
const titled = (text) =>
  text
    .split(/\s+/)
    .filter((w, i) => /^\(?\p{L}/u.test(w) && !UNITS.has(w.toLowerCase()))
    .every((w) => titleCase(`X ${w}`).split(' ')[1] === w || titleCase(w) === w);

// Saved by an older round: pixel size in the Look tab, the old on/off switches, no render keys.
const OLD = {
  sensitivity: 1.1,
  pixelSize: 6,
  scanlines: true,
  mirror: false,
  glitch: 0.8,
  looks: { ember: true, glitch: 'mix' },
  blur: 'off',
  flicker: 'on',
  sceneColors: 'mix',
  camera: 'drift',
  elements: { fire: true, lightning: false, ice: true },
};

test('settings saved by older rounds load, and the new keys take their defaults', () => {
  store.set('bonfire-live', JSON.stringify(OLD));
  const s = loadSettings();
  assert.equal(s.pixelSize, 6, 'the saved pixel size carries over');
  assert.equal(s.scanlines, 'on');
  assert.equal(s.mirror, 'mix');
  assert.equal(s.flicker, 'on');
  assert.equal(s.looks.ember, 'mix', 'a look switched on comes back in the mix (Ember has no Always)');
  assert.deepEqual(s.elements, { fire: true, lightning: false, ice: true });
  for (const k of [
    'pixelShift',
    'dither',
    'ditherMatrix',
    'outlines',
    'palette',
    'fewColors',
    'vignette',
    'exposure',
    'fog',
    'shadows',
    'flameFps',
    'colorChange',
    'xray',
    'hitStop',
    'hitFlash',
    'debris',
    'marks',
    'trails',
    'grain',
    'cinema',
    'spotlight',
    'chroma',
  ]) {
    assert.deepEqual(s[k], DEFAULT_SETTINGS[k], `${k}: the default`);
  }
  assert.equal(s.frameRate, 'display', 'Frame Rate: every frame the display shows, to begin with');
  assert.deepEqual(s.xrayViews, { normals: true, lighting: true, particles: true, flow: true });
  // The scenery recolor's old "off" was its old default: it takes the new one.
  assert.equal(mergeInto(defaults(), { sceneColors: false }).sceneColors, DEFAULT_SETTINGS.sceneColors);
  store.clear();
});

test('render settings: three-way switches take old on/off values, strings and numbers keep their type', () => {
  const s = mergeInto(defaults(), {
    outlines: false,
    xray: true,
    pixelShift: 'always?',
    fewColors: 'on',
    grain: 'mix',
    dither: '0.3',
    exposure: 1.2,
    palette: 'moonlit',
    fog: 'thick',
    shadows: 'no',
    xrayViews: { normals: false, bogus: true },
    flameFps: 24,
  });
  assert.equal(s.outlines, 'off');
  assert.equal(s.xray, 'on');
  assert.equal(s.pixelShift, DEFAULT_SETTINGS.pixelShift, 'an unknown mode is ignored');
  assert.equal(s.fewColors, 'on');
  assert.equal(s.grain, 'mix');
  assert.equal(s.dither, DEFAULT_SETTINGS.dither, 'a number saved as text is ignored');
  assert.equal(s.exposure, 1.2);
  assert.equal(s.palette, 'moonlit');
  assert.equal(s.fog, 'thick');
  assert.equal(s.shadows, true, 'a boolean stays a boolean');
  assert.deepEqual(
    s.xrayViews,
    { normals: false, lighting: true, particles: true, flow: true },
    'a group keeps only the views that exist',
  );
  assert.equal(s.flameFps, 24);
});

test('Frame Rate: one of its choices, this computer’s own (never in a setup or a preset), as a cap', () => {
  assert.equal(PAGE_DEFAULTS.frameRate, 'display');
  assert.deepEqual(CHOICES.frameRate, ['display', '60', '30']);
  for (const [v, want] of [
    ['60', '60'],
    ['30', '30'],
    [60, 'display'],
    ['fast', 'display'],
    [null, 'display'],
  ]) {
    assert.equal(mergeInto(defaults(), { frameRate: v }).frameRate, want, `${JSON.stringify(v)}`);
  }
  assert.deepEqual([frameCap('display'), frameCap('60'), frameCap('30'), frameCap('nonsense')], [0, 60, 30, 0]);
  assert.ok(LOCAL.includes('frameRate'));
  const s = defaults();
  s.frameRate = '30';
  assert.ok(!('frameRate' in snapshot(s)), 'not in a setup');
  for (const id of Object.keys(PRESETS)) {
    assert.ok(!('frameRate' in PRESETS[id].values), `${id} leaves it`);
    applyPreset(s, id);
    assert.equal(s.frameRate, '30', `${id} keeps this computer's cap`);
  }
  // A setup saved here and loaded elsewhere leaves that computer's cap as it is.
  saveSetup(s, 'Thirty');
  const there = defaults();
  loadSetup(there, 'Thirty');
  assert.equal(there.frameRate, 'display');
  assert.ok(!('frameRate' in readSetups().Thirty));
  // A file from elsewhere that carries one (or the volume) changes neither here.
  importSetups(JSON.stringify({ app: 'bonfire-live', setups: { Odd: { frameRate: '30', volume: 0.1, glitch: 1.4 } } }));
  assert.deepEqual(loadSetup(there, 'Odd'), ['glitch']);
  assert.deepEqual([there.frameRate, there.volume, there.glitch], ['display', PAGE_DEFAULTS.volume, 1.4]);
  store.clear();
});

test('saving waits for a burst of changes to settle (one write), and flushSettings writes at once', async () => {
  writes.length = 0;
  const s = defaults();
  for (let i = 0; i < 20; i++) {
    s.glitch = i / 10;
    saveSettings(s);
  }
  assert.equal(writes.length, 0, 'nothing yet');
  await new Promise((r) => setTimeout(r, SAVE_MS + 60));
  assert.deepEqual(writes, ['bonfire-live'], 'once, after it settled');
  assert.equal(JSON.parse(store.get('bonfire-live')).glitch, 1.9, 'the last value');
  s.glitch = 0.3;
  saveSettings(s);
  flushSettings();
  assert.equal(writes.length, 2, 'a flush writes what was waiting at once');
  flushSettings();
  assert.equal(writes.length, 2, 'and nothing when nothing waits');
  saveSettings(s, { now: true });
  assert.equal(writes.length, 3);
  store.clear();
});

test('setups: saved without this computer’s own, loaded over the settings; old exports still import', () => {
  store.clear();
  const s = defaults();
  s.glitch = 1.7;
  s.volume = 0.2;
  assert.equal(saveSetup(s, '  '), 'Setup 1', 'a blank name is numbered');
  assert.equal(saveSetup(s, 'Friday'), 'Friday');
  const kept = readSetups().Friday;
  for (const k of LOCAL) assert.ok(!(k in kept), `${k} isn't in a setup`);
  // An export from an older round: the old on/off switches, names to be shown as text.
  const file = JSON.stringify({
    app: 'bonfire-live',
    setups: { 'Old <b>One</b>': { scanlines: true, glitch: 0.6, looks: { ink: false } }, Bad: 'nope', List: [1] },
  });
  assert.equal(importSetups(file), 1, 'only setups that are objects');
  const t = defaults();
  assert.deepEqual(loadSetup(t, 'Old <b>One</b>'), ['scanlines', 'glitch', 'looks']);
  assert.equal(t.scanlines, 'on');
  assert.equal(t.glitch, 0.6);
  assert.equal(t.looks.ink, 'off');
  assert.equal(loadSetup(t, 'Nobody'), null);
  assert.deepEqual(Object.keys(JSON.parse(exportSetups()).setups).sort(), ['Friday', 'Old <b>One</b>', 'Setup 1']);
  assert.equal(JSON.parse(exportSetups()).app, 'bonfire-live');
  deleteSetup('Friday');
  assert.ok(!('Friday' in readSetups()));
  assert.throws(() => importSetups('not json'));
  store.clear();
});

test('Club is the defaults; the presets hold scalars (or some of a switch group) and give the render switches a character', () => {
  assert.equal(presetOf(defaults()), 'club');
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.ok(
      p.hint.length >= 12 && p.hint.length <= 160,
      `${id}: a hint of at most 160 characters (${p.hint.length})`,
    );
    assert.equal(titleCase(p.name), p.name);
    for (const [k, v] of Object.entries(p.values)) {
      assert.ok(k in defaults(), `${id}.${k} is a setting`);
      if (typeof v === 'object') {
        assert.ok(['looks', 'dropFx'].includes(k), `${id}.${k}: only switch groups are objects`);
        for (const [s, m] of Object.entries(v)) {
          assert.ok(s in DEFAULT_SETTINGS[k], `${id}.${k}.${s} is a switch`);
          assert.ok(['off', 'mix', 'on'].includes(m), `${id}.${k}.${s} is a mode`);
        }
      }
    }
    const s = defaults();
    applyPreset(s, id);
    assert.equal(presetOf(s), id, `${id} is recognised once applied`);
    applyPreset(s, 'club');
    assert.equal(presetOf(s), 'club');
  }
  assert.equal(PRESETS.safe.values.xray, 'off', 'Low Flash: no x-ray flips');
  assert.equal(PRESETS.safe.values.dropFx.xray, 'off', 'Low Flash: no X-Ray drop hit either');
  assert.equal(PRESETS.safe.values.hitFlash, 'off');
  assert.equal(PRESETS.safe.values.knightShine, 'off', 'Low Flash: no light sweeping over the armor');
  assert.equal(PRESETS.safe.values.dropFx.ink, 'off', 'Low Flash: no Ink Flash drop hit (a 1-bit flash)');
  assert.equal(PRESETS.safe.values.looks.ink, 'off', 'Low Flash: no Ink look (1-bit flashes on the downbeats)');
  assert.equal(PRESETS.rave.values.xray, 'on');
  // Club puts back everything the others change, so going back to it is a real reset.
  for (const id of ['chill', 'rave', 'safe']) {
    for (const [k, v] of Object.entries(PRESETS[id].values)) {
      assert.ok(k in PRESETS.club.values, `club sets ${k} back`);
      if (typeof v === 'object')
        for (const s of Object.keys(v)) assert.ok(s in PRESETS.club.values[k], `club sets ${k}.${s} back`);
    }
    const s = defaults();
    applyPreset(s, id);
    applyPreset(s, 'club');
    assert.deepEqual(s, defaults(), `${id}, then Club: the defaults again`);
  }
  const safe = defaults();
  applyPreset(safe, 'safe');
  assert.equal(safe.dropFx.shatter, 'mix', 'the other drop hits as they were');
  const looks = createLooks({});
  for (let i = 0; i < 300; i++) {
    const hits = looks.drop(safe.dropFx, 3);
    assert.ok(
      !hits.includes(DROP_FX.xray) && !hits.includes(DROP_FX.ink),
      'Low Flash: a drop never draws the X-Ray or Ink Flash hit',
    );
  }
  assert.equal(safe.dropFx.cycle, 'off', 'Low Flash: no Color Cycle (the palette spinning at 16 Hz)');
  safe.dropFx.xray = 'mix';
  assert.equal(presetOf(safe), null);
});

test('Chill keeps its "no flashes" whatever preset came before; Low Flash and Chill say so', () => {
  const looks = createLooks({});
  for (const before of [null, 'club', 'rave', 'safe']) {
    const s = defaults();
    if (before) applyPreset(s, before);
    applyPreset(s, 'chill');
    assert.equal(presetOf(s), 'chill');
    assert.equal(s.looks.ink, 'off');
    for (const hit of ['ink', 'cycle', 'xray'])
      assert.equal(s.dropFx[hit], 'off', `Chill after ${before}: no ${DROP_FX[hit]} hit`);
    for (let i = 0; i < 200; i++)
      assert.ok(![DROP_FX.ink, DROP_FX.cycle, DROP_FX.xray].some((h) => looks.drop(s.dropFx, s.dropCount).includes(h)));
  }
  assert.match(PRESETS.chill.hint, /no flashes/);
  assert.match(PRESETS.safe.hint, /palette spins/);
  assert.match(PRESETS.safe.hint, /sensitive rooms/);
  // What Off does is the switches' own: Color Cycle's and the Echo look's hints say so.
  assert.ok(attrs(html, 'data-tip').includes(ITEM_HINTS.dropFx.cycle));
  assert.ok(attrs(html, 'data-tip').includes(ITEM_HINTS.looks.echo));
  assert.match(ITEM_HINTS.dropFx.cycle, /Echo look’s steps/);
});

test('the dialog: nine tabs from the map, each setting once, in its tab and section, named by the map', () => {
  assert.deepEqual(
    attrs(html, 'data-tab'),
    TABS.map((t) => t.id),
  );
  assert.deepEqual(
    TABS.map((t) => t.label),
    ['Sound', 'Show', 'Drops', 'Picture', 'Effects', 'Camera', 'Cast', 'Scenes & Cards', 'My Setups'],
  );
  const s = defaults();
  const path = (key) => key.split('.').reduce((o, k) => o?.[k], s);
  for (const k of new Set(attrs(html, 'data-set'))) assert.notEqual(path(k), undefined, `${k} is a setting`);
  for (const e of entriesFor('live')) {
    const section = SECTIONS.find((x) => x.id === e.section);
    const panel = tabOf(section.tab);
    assert.equal(attrs(html, 'data-row').filter((r) => r === e.live).length, 1, `${e.live}: one row`);
    assert.ok(panel.includes(`data-row="${e.live}"`), `${e.live} is in ${section.tab}`);
    const sec = panel.slice(panel.indexOf(`data-section="${e.section}"`));
    assert.ok(
      sec.indexOf(`data-row="${e.live}"`) >= 0 &&
        sec.indexOf(`data-row="${e.live}"`) < sec.indexOf('data-section=', 20) >>> 0,
      `${e.live} is in ${e.section}`,
    );
    const row = rowOf(e.live);
    assert.match(
      row,
      new RegExp(
        `<span data-name>${meta('live', e.live)
          .label.replace(/[&’]/g, (c) => (c === '&' ? '&amp;' : c))
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`,
      ),
      `${e.live}: the map's label`,
    );
    assert.equal(
      / data-adv/.test(row.slice(0, row.indexOf('>'))),
      !e.simple,
      `${e.live}: ${e.simple ? 'Simple' : 'All Settings'} view`,
    );
  }
  // Appendix A, spot checks: the 14 layers are All Settings only, Frame Rate in Picture › Performance.
  assert.match(rowOf('layers').slice(0, 120), / data-adv/);
  for (const k of Object.keys(LAYERS))
    assert.match(tabOf('effects'), new RegExp(`data-row="${k}"`), `${k} is in the Layers grid`);
  assert.match(tabOf('picture'), /data-section="performance"[\s\S]*data-row="frameRate"/);
  assert.deepEqual(choicesOf('frameRate'), ['display', '60', '30']);
  assert.match(
    rowOf('linkPort'),
    /<input type="number" data-set="linkPort" min="1024" max="65535" step="1"/,
    'the Link port is typed in',
  );
  assert.ok(!/\stitle="/.test(html), 'no native title tooltips');
});

test('every effect is a three-way switch (Off / In the Mix / Always), every grid and checklist has its bulk buttons', () => {
  for (const e of entriesFor('live')) {
    const kind = kindOf(e.live);
    if (kind === 'tri') assert.deepEqual(triOf(e.live), ['off', 'mix', 'on'], `${e.live}: Off / In the Mix / Always`);
  }
  for (const id of Object.keys(LOOKS))
    assert.deepEqual(triOf(`looks.${id}`), id === 'ember' ? ['off', 'mix'] : ['off', 'mix', 'on'], `looks.${id}`);
  for (const id of Object.keys(DROP_FX)) assert.deepEqual(triOf(`dropFx.${id}`), ['off', 'mix', 'on']);
  for (const k of Object.keys(LAYERS)) assert.deepEqual(triOf(k), ['off', 'mix', 'on']);
  for (const group of ['looks', 'layers', 'dropFx']) {
    assert.deepEqual(
      attrs(rowOf(group), 'data-bulk'),
      ['off', 'mix', 'on', 'shuffle', 'defaults'],
      `${group}: All Off · All In the Mix · All Always · Shuffle · Defaults`,
    );
  }
  for (const group of ['moves', 'knightMoves', 'flyMoves', 'knightHelmets', 'xrayViews', 'mirrors', 'elements']) {
    const row = rowOf(group);
    assert.deepEqual(attrs(row, 'data-bulk'), ['all', 'none', 'defaults'], `${group}: All · None · Defaults`);
    assert.match(row, /data-bulk="none"[^>]*aria-disabled="true"/, `${group}: None unavailable (one stays on)`);
  }
  // Each look, layer, drop hit and x-ray view says what it is, in its own "?".
  for (const [group, hints] of Object.entries(ITEM_HINTS))
    for (const [id, hint] of Object.entries(hints))
      assert.ok(attrs(html, 'data-tip').includes(hint), `${group}.${id} has its hint`);
  // The three-way words, once per tab that has them; in the Simple view only where one shows
  // (Show's are all in All Settings).
  const sectionTab = Object.fromEntries(SECTIONS.map((x) => [x.id, x.tab]));
  for (const t of TABS) {
    const panel = tabOf(t.id);
    const has = /type="radio" name="viz-tri/.test(panel);
    assert.equal(
      (panel.match(/class="viz-help viz-tri-help"/g) ?? []).length,
      has ? 1 : 0,
      `${t.id}: what Off, In the Mix and Always mean`,
    );
    if (!has) continue;
    const simple = entriesFor('live').some(
      (e) => sectionTab[e.section] === t.id && e.simple && ['tri', 'grid'].includes(kindOf(e.live)),
    );
    assert.equal(
      /class="viz-help viz-tri-help" data-adv/.test(panel),
      !simple,
      `${t.id}: the words in the Simple view only with a switch there`,
    );
  }
  assert.match(tabOf('show'), /class="viz-help viz-tri-help" data-adv/);
  assert.ok(html.includes(TRI_HELP));
});

test('the copy: Title Case names, choices and buttons; hints of 12–160 characters that don’t repeat the name', () => {
  // Every dropdown's choices (numbers and units aside).
  for (const [key, opts] of Object.entries(OPTIONS))
    for (const [, text] of opts) assert.ok(titled(text), `${key}: "${text}"`);
  // Buttons, tabs and legends.
  const texts = [
    ...[...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]),
    ...[...html.matchAll(/<legend>([\s\S]*?)<\/legend>/g)].map((m) => m[1]),
  ]
    .map((t) =>
      t
        .replace(
          /<span class="viz-tab-count"[\s\S]*?<\/span>|<kbd>[^<]*<\/kbd>|<span class="viz-crumb">[^<]*<\/span>|<span class="visually-hidden"[^>]*>[^<]*<\/span>|<span id="[^"]*-hint">[^<]*<\/span>/g,
          '',
        )
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/[?✕↗+›]/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  for (const t of texts) assert.ok(titled(t), `"${t}" in Title Case`);
  // Every hint: a sentence of 12 to 160 characters that isn't its name again.
  const fields = [
    ...html.matchAll(/<button type="button" class="viz-tip"[^>]*data-tip="([^"]*)" aria-label="About ([^"]*)"/g),
  ].map((m) => [m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'), m[2]]);
  assert.ok(fields.length > 100);
  for (const [hint, name] of fields) {
    assert.ok(hint.length >= 12 && hint.length <= 160, `${name}: ${hint.length} characters`);
    assert.ok(!hint.toLowerCase().startsWith(name.toLowerCase()), `${name}: doesn't start with its name`);
    assert.doesNotMatch(hint, /In the mix: it comes and goes/i, `${name}: no boilerplate`);
  }
  // Longer explanations are folded under "More" (All Settings), one line each.
  for (const key of ['knightStyle', 'xray', 'knightGlow', 'scenes', 'swingEase'])
    assert.match(rowOf(key), /<details class="viz-more" data-adv><summary>More<\/summary><ul>/, `${key} has its More`);
  // The camera feels are names only (each one's line is in More).
  assert.deepEqual(
    OPTIONS.swingEase.map(([, t]) => t),
    ['Smooth', 'Spring', 'Bouncy', 'Heavy', 'Snappy', 'A Mix, Changing Between Attacks'],
  );
});

test('settings that can do nothing as the others stand each have a line saying why, tied to the field', () => {
  for (const e of entriesFor('live').filter((x) => x.needs?.live)) {
    const row = rowOf(e.live);
    assert.match(
      row,
      new RegExp(`<p class="viz-why" id="viz-why-${e.live}" data-why hidden></p>`),
      `${e.live}: its reason line`,
    );
  }
  // Each section with settings can be reset (Title Cards' words are yours: none there).
  for (const s of SECTIONS.filter((x) => x.tab)) {
    const has = entriesFor('live').some((e) => e.section === s.id) && s.id !== 'titles';
    assert.equal(html.includes(`data-reset-section="${s.id}"`), has, `${s.id}: Reset Section`);
  }
  // Simple view: each section says how many more All Settings has; one that shows nothing
  // there names what All Settings has, and keeps its Reset Section for All Settings.
  const reaction = entriesFor('live').filter((e) => e.section === 'reaction' && !e.simple).length;
  assert.match(html, new RegExp(`data-show-all="reaction">${reaction} More In All Settings<`));
  assert.match(html, /data-show-all="layers">Only In All Settings: Layers, Mirror Kinds</);
  assert.match(html, /data-reset-section="layers" aria-label="Reset Section: Layers" data-adv>/);
  assert.doesNotMatch(
    html,
    /data-reset-section="reaction"[^>]*data-adv/,
    'a section with something in Simple resets there',
  );
  // (The loop shows its scenes in Simple: it counts its settings like the others.)
  assert.match(html, /data-show-all="loop">2 More In All Settings</);
});

test('the Cast tab: the knights’ settings load, keep their type and choices', () => {
  const s = mergeInto(defaults(), {
    knights: true,
    knightDance: 'sometimes',
    knightCam: 'on',
    knightCount: 3,
    knightFormation: 'canon',
    knightMoves: { spin: false, moonwalk: true },
    knightHelmets: { armet: false },
    danceBars: 'random',
    knightSummon: false,
    knightShine: 'off',
    knightReactions: 'shiny',
  });
  assert.equal(s.knightShine, 'off');
  assert.equal(s.knightReactions, DEFAULT_SETTINGS.knightReactions, 'an unknown mode is ignored');
  assert.equal(s.knights, 'on', 'an old on/off still counts');
  assert.equal(s.knightDance, DEFAULT_SETTINGS.knightDance);
  assert.equal(s.knightCam, 'on');
  assert.equal(s.knightSummon, 'off');
  assert.equal(s.knightCount, 3);
  assert.equal(s.knightFormation, 'canon');
  assert.equal(s.knightMoves.spin, false);
  assert.ok(!('moonwalk' in s.knightMoves));
  assert.equal(s.knightHelmets.armet, false);
  assert.equal(s.danceBars, 'random');
  for (const [k, v] of [
    ['knightCount', 'random'],
    ['knightCount', 7],
    ['knightCount', '2'],
    ['knightFormation', 'conga'],
  ]) {
    assert.equal(mergeInto(defaults(), { [k]: v })[k], v === 'random' ? 'random' : DEFAULT_SETTINGS[k], `${k}: ${v}`);
  }
  for (const style of [...Object.keys(KNIGHT_STYLES), 'mix'])
    assert.equal(mergeInto(defaults(), { knightStyle: style }).knightStyle, style);
  for (const finish of [...Object.keys(FINISHES), 'mix'])
    assert.equal(mergeInto(defaults(), { knightFinish: finish }).knightFinish, finish);
  for (const seat of [...Object.keys(SEAT_POSES), 'mix'])
    assert.equal(mergeInto(defaults(), { knightSeat: seat }).knightSeat, seat);
  assert.equal(mergeInto(defaults(), { knightRim: 3 }).knightRim, 1, 'Edge Glow Strength is kept to 0..1');
  assert.equal(mergeInto(defaults(), { knightGlow: true }).knightGlow, 'on');
  const cast = tabOf('cast');
  for (const k of [
    'knights',
    'knightCount',
    'knightSeat',
    'knightStyle',
    'knightFinish',
    'knightGlow',
    'knightRim',
    'knightShine',
    'knightDance',
    'knightFormation',
    'danceBars',
    'knightSummon',
    'knightReactions',
    'knightGestures',
    'blink',
    'flyBars',
    'trails',
    'knightMoves.praise',
    'knightMoves.defaultDance',
    'knightHelmets.bascinet',
    'flyMoves.swing',
  ]) {
    assert.match(cast, new RegExp(`data-set="${k.replace('.', '\\.')}"`), `${k} is in the Cast tab`);
  }
  assert.deepEqual(choicesOf('knightStyle'), ['site', ...STYLE_KEYS, 'mix']);
  assert.deepEqual(choicesOf('knightFinish'), [...Object.keys(FINISHES), 'mix']);
  assert.ok(
    cast.indexOf('data-row="knightGlow"') < cast.indexOf('data-row="knightRim"'),
    'the switch, then its strength',
  );
  assert.match(rowOf('knightStyle'), /Smooth Steel/, 'the gunmetal style is Smooth Steel to people');
});

test('Scenes & Cards: the preset scenes, the loop and the title cards', () => {
  const panel = tabOf('scenes');
  const keys = attrs(panel, 'data-set');
  for (const k of [
    'scenes',
    'sceneBars',
    'sceneHold',
    'sceneCards',
    'sceneOrder',
    'sceneFrom',
    'title',
    'subtitle',
    'intro',
    'titleOnDrop',
  ])
    assert.ok(keys.includes(k), `${k} is in Scenes & Cards`);
  assert.deepEqual(triOf('scenes'), ['off', 'mix', 'on']);
  assert.deepEqual(triOf('sceneCards'), ['off', 'mix', 'on']);
  assert.deepEqual(choicesOf('sceneBars'), [...BAR_OPTIONS.sceneBars.map(([v]) => String(v)), 'random']);
  assert.deepEqual(choicesOf('sceneHold'), ['scene', 'hold', 'base']);
  assert.match(panel, /<ol class="viz-scenes" data-scene-list>/);
  assert.match(
    settingsMarkup(defaults(), [], { base: '/site/' }),
    /href="\/site\/painter\/"[^>]*><span data-name>Make a Scene In the Painter/,
  );
  const d = defaults();
  const s = mergeInto(defaults(), {
    scenes: 'on',
    sceneCards: true,
    sceneFrom: 'mine',
    sceneOrder: 'shuffle',
    sceneBars: 'random',
    sceneHold: 'base',
    sceneList: { 'b:cathedral-kaleido': false, 'x:nope': false },
  });
  assert.deepEqual(
    [s.scenes, s.sceneCards, s.sceneFrom, s.sceneOrder, s.sceneBars, s.sceneHold],
    ['on', 'on', 'mine', 'shuffle', 'random', 'base'],
  );
  assert.deepEqual(s.sceneList, { 'b:cathedral-kaleido': false });
  assert.deepEqual(d.sceneList, {});
});

test('the loop lists the library by ref (Scenes From picks whose), each switch in or out, names escaped', () => {
  const built = { ...defaultScene('Frozen Shrine'), id: 'frozen-shrine' };
  const mine = { ...defaultScene('My <Scene>'), id: 'my-scene' };
  const library = [
    { ref: 'b:frozen-shrine', scene: built },
    { ref: 'm:my-scene', scene: mine },
  ];
  const s = defaults();
  const rows = (h) => [...h.matchAll(/data-scene-row="([^"]+)"/g)].map((m) => m[1]);
  let h = sceneListMarkup(library, s, {
    playing: 'm:my-scene',
    thumb: (ref) => (ref === 'm:my-scene' ? 'data:image/webp;base64,AAAA' : null),
    base: '/',
  });
  assert.deepEqual(rows(h), ['b:frozen-shrine', 'm:my-scene']);
  assert.ok(!/data-set=/.test(h), 'the loop’s switches aren’t settings fields');
  assert.match(h, /data-row="scene:m:my-scene"/, 'each row is the search’s');
  assert.match(h, /My &lt;Scene&gt;/, 'names are escaped');
  assert.match(h, /<span class="viz-scene-badge">Built-In<\/span>/);
  assert.match(h, /data-scene-row="m:my-scene"[^>]*aria-current="true"/);
  assert.match(h, /<img src="data:image\/webp;base64,AAAA"/);
  assert.match(h, /href="\/painter\/\?scene=m:my-scene"[^>]*>Edit In Painter/);
  setInLoop(s, 'm:my-scene', false);
  assert.equal(inLoop(s, 'm:my-scene'), false);
  h = sceneListMarkup(library, s);
  assert.match(h, /class="viz-scene-row is-out" data-scene-row="m:my-scene"/);
  setInLoop(s, 'm:my-scene', true);
  assert.deepEqual(s.sceneList, {});
  s.sceneFrom = 'mine';
  assert.deepEqual(rows(sceneListMarkup(library, s)), ['m:my-scene']);
  assert.match(sceneListMarkup([], s), /viz-scenes-empty[^>]*>No scenes of your own yet/);
  assert.deepEqual(
    scenesFrom(library, { sceneFrom: 'builtin' }).map((e) => e.ref),
    ['b:frozen-shrine'],
  );
});

test('the hints: a field’s "?" isn’t a keyboard stop of its own (its input reads the hint out)', () => {
  const marks = [...html.matchAll(/<button type="button" class="viz-tip"[^>]*>/g)].map((m) => m[0]);
  // (A grid or checklist whose items have hints of their own keeps its "?" a stop: focusing an
  // item shows the item's.)
  const stops = marks.filter((m) => /tabindex="0"/.test(m)).map((m) => m.match(/aria-label="([^"]+)"/)[1]);
  assert.deepEqual(stops, ['About Drop Hits', 'About Looks', 'About Layers', 'About X-Ray Views']);
  const hints = new Map(
    [...html.matchAll(/<span class="visually-hidden" id="(viz-tip-\d+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]),
  );
  const described = [...html.matchAll(/<(input|select|fieldset)[^>]*data-set(?:-group)?="([^"]+)"[^>]*>/g)].map((m) => [
    m[2],
    m[0].match(/aria-describedby="([^"]+)"/)?.[1].split(' ') ?? [],
  ]);
  for (const [key, ids] of described) {
    if (/type="radio"/.test(key)) continue;
    for (const id of ids) assert.ok(hints.has(id), `${key}: ${id} is a hint`);
  }
  const of = (key) => described.find(([k]) => k === key)?.[1] ?? [];
  assert.equal(of('knightCount').length, 1);
  assert.equal(of('grain').length, 2, 'a layer: its own hint, then the grid’s');
  assert.equal(
    hints.get(of('knightMoves.praise')[0]),
    hints.get(of('knightMoves.spin')[0]),
    'a checklist’s items read the group’s hint',
  );
});

test('the keyboard shortcuts: the same keys as ever, in four groups, plus ? and /', () => {
  assert.deepEqual(
    KEY_GROUPS.map((g) => g.title),
    ['Moments', 'Beat', 'Show', 'View & Menus'],
  );
  const keys = keyList()
    .map(([k]) => k)
    .sort();
  const before = [
    'Space',
    'A',
    'B',
    'R',
    'X',
    'G',
    'L',
    'M',
    'P',
    'Shift+P',
    'N',
    'Shift+N',
    'K',
    'Shift+K',
    '1 / 2 / 3',
    '← / →',
    'T',
    'D',
    '[ / ]',
    'Shift+1…9',
    'O',
    'V',
    'C',
    'H',
    'F',
    'S',
    'I',
  ];
  assert.deepEqual(keys, [...before, '?', '/'].sort());
  for (const g of KEY_GROUPS)
    for (const row of g.keys)
      assert.ok(row.label.length <= 120 && !/blade/i.test(row.label), `${row.keys}: "${row.label}"`);
  assert.match(html, /data-row="key:\d+"/, 'the search finds them');
});

test('the keyboard shortcuts: Shift+7 is title card 7 in the show even where it types / or ?; / and ? still work', async () => {
  // The page's keydown (src/visualizer/actions.js) on a stand-in page: what each press did.
  const did = [];
  let onKey = null;
  const node = () => ({ addEventListener() {}, open: false, focus() {} });
  const saved = { document: globalThis.document, window: globalThis.window };
  const body = { dataset: { mode: 'live' }, classList: { toggle() {}, remove() {} } };
  globalThis.document = /** @type {any} */ ({ addEventListener() {}, querySelector: node, body });
  globalThis.window = /** @type {any} */ ({
    addEventListener: (type, fn) => {
      if (type === 'keydown') onKey = fn;
    },
  });
  try {
    const { createActions } = await import('../src/visualizer/actions.js');
    createActions(
      /** @type {any} */ ({
        settings: {},
        fire: {},
        renderMenu: { handleKey: () => false, isOpen: false },
        keysOverlay: { el: { open: false } },
        openKeys: () => did.push('keys'),
        openSettings: (tab, o) => did.push(o?.search ? 'search' : 'settings'),
        showCard: (i) => did.push(`card ${i + 1}`),
        wake() {},
      }),
    );
    const press = (key, code, shiftKey = false) => {
      did.length = 0;
      onKey({ key, code, shiftKey, target: null, preventDefault() {} });
      return [...did];
    };
    assert.deepEqual(press('&', 'Digit7', true), ['card 7'], 'US: Shift+7 types &');
    assert.deepEqual(press('/', 'Digit7', true), ['card 7'], 'German, Spanish, Italian: Shift+7 types /');
    assert.deepEqual(press('?', 'Digit7', true), ['card 7'], 'Russian: Shift+7 types ?');
    assert.deepEqual(press('/', 'Slash'), ['search']);
    assert.deepEqual(press('?', 'Slash', true), ['keys']);
    assert.deepEqual(press('?', 'Minus', true), ['keys'], 'German: ? is Shift+ß');
    // Before the show (the start screen) there are no cards: / and ? are the search and the list.
    body.dataset.mode = 'start';
    assert.deepEqual(press('/', 'Digit7', true), ['search']);
    assert.deepEqual(press('?', 'Digit7', true), ['keys']);
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
  }
});
