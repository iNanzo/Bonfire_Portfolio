// Bonfire Live's settings (src/visualizer/settings.js): old saved settings still load and
// take the new keys' defaults, Club is the defaults (and puts back whatever another preset
// changes), presets set scalars or some of a switch group's switches, and the dialog's every
// field points at a real setting (the Render, Scenes and Knights tabs' each with a hint).
// The Scenes tab's loop keeps its switches by scene ref (sceneList), cleaned like the cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, defaults, mergeInto, presetOf, applyPreset, settingsMarkup, PRESETS, sceneListMarkup, scenesFrom, inLoop, setInLoop } from '../src/visualizer/settings.js';
import { DEFAULT_SETTINGS } from '../src/visualizer/director.js';
import { LAYERS, DROP_FX, createLooks } from '../src/visualizer/looks.js';
import { BAR_OPTIONS } from '../src/visualizer/bars.js';
import { FINISHES } from '../src/bonfire/steel.js';
import { STYLE_KEYS } from '../src/bonfire/knightStyles.js';
import { SEAT_POSES, KNIGHT_STYLES } from '../src/visualizer/knightShow.js';
import { defaultScene } from '../src/scenes.js';

// The part of the dialog's markup for one tab.
const tabOf = (html, id) => {
  const at = html.indexOf(`id="viz-tab-${id}"`);
  const next = html.indexOf('class="viz-tab-panel"', at);
  return html.slice(at, next < 0 ? undefined : next);
};
// A select's choices, in order.
const choicesOf = (html, key) => {
  const f = html.match(new RegExp(`<select data-set="${key}"[^>]*>([\\s\\S]*?)</select>`));
  return f ? [...f[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]) : null;
};

// A browser's storage, for loadSettings.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

// Saved by the last round, before the Render tab: pixel size in the Look tab, the old
// on/off switches, no render keys.
const OLD = {
  sensitivity: 1.1, pixelSize: 6, scanlines: true, mirror: false, glitch: 0.8, looks: { ember: true, glitch: 'mix' },
  blur: 'off', flicker: 'on', sceneColors: 'mix', camera: 'drift', elements: { fire: true, lightning: false, ice: true },
};

test('settings saved before the Render tab load, and the new keys take their defaults', () => {
  store.set('bonfire-live', JSON.stringify(OLD));
  const s = loadSettings();
  assert.equal(s.pixelSize, 6, 'the saved pixel size carries over');
  assert.equal(s.scanlines, 'on');
  assert.equal(s.mirror, 'mix');
  assert.equal(s.flicker, 'on');
  for (const k of ['pixelShift', 'dither', 'ditherMatrix', 'outlines', 'palette', 'fewColors', 'vignette', 'exposure', 'fog', 'shadows', 'flameFps', 'colorChange', 'xray', 'hitStop', 'hitFlash', 'debris', 'marks', 'trails', 'grain', 'cinema', 'spotlight', 'chroma']) {
    assert.deepEqual(s[k], DEFAULT_SETTINGS[k], `${k}: the default`);
  }
  assert.deepEqual(s.xrayViews, { normals: true, lighting: true, particles: true, flow: true });
  store.clear();
});

test('render settings: three-way switches take old on/off values, strings and numbers keep their type', () => {
  const s = mergeInto(defaults(), {
    outlines: false, xray: true, pixelShift: 'always?', fewColors: 'on', grain: 'mix',
    dither: '0.3', exposure: 1.2, palette: 'moonlit', fog: 'thick', shadows: 'no', xrayViews: { normals: false, bogus: true }, flameFps: 24,
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
  assert.deepEqual(s.xrayViews, { normals: false, lighting: true, particles: true, flow: true }, 'a group keeps only the views that exist');
  assert.equal(s.flameFps, 24);
});

test('Club is the defaults; the presets hold scalars (or some of a switch group) and give the render switches a character', () => {
  assert.equal(presetOf(defaults()), 'club');
  for (const [id, p] of Object.entries(PRESETS)) {
    for (const [k, v] of Object.entries(p.values)) {
      assert.ok(k in defaults(), `${id}.${k} is a setting`);
      if (typeof v === 'object') {
        // (A switch group, e.g. the drop hits: only the switches named, each a mode.)
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
      if (typeof v === 'object') for (const s of Object.keys(v)) assert.ok(s in PRESETS.club.values[k], `club sets ${k}.${s} back`);
    }
    const s = defaults();
    applyPreset(s, id);
    applyPreset(s, 'club');
    assert.deepEqual(s, defaults(), `${id}, then Club: the defaults again`);
  }
  // Low Flash is recognised with the drop hits as it left them, and not once one is changed.
  const safe = defaults();
  applyPreset(safe, 'safe');
  assert.equal(safe.dropFx.xray, 'off');
  assert.equal(safe.dropFx.shatter, 'mix', 'the other drop hits as they were');
  assert.equal(presetOf(safe), 'safe');
  const looks = createLooks({});
  for (let i = 0; i < 300; i++) {
    const hits = looks.drop(safe.dropFx, 3);
    assert.ok(!hits.includes(DROP_FX.xray) && !hits.includes(DROP_FX.ink), 'Low Flash: a drop never draws the X-Ray or Ink Flash hit');
  }
  assert.equal(safe.looks.ink, 'off');
  assert.equal(safe.looks.glitch, 'mix', 'the other looks as they were');
  assert.equal(safe.dropFx.cycle, 'off', 'Low Flash: no Color Cycle (the palette spinning at 16 Hz)');
  safe.dropFx.xray = 'mix';
  assert.equal(presetOf(safe), null);
});

test('Chill keeps its "no flashes" whatever preset came before: no Ink look, no Ink Flash, Color Cycle or X-Ray hit', () => {
  const looks = createLooks({});
  for (const before of [null, 'club', 'rave', 'safe']) {
    const s = defaults();
    if (before) applyPreset(s, before);
    applyPreset(s, 'chill');
    const from = before ?? 'the defaults';
    assert.equal(presetOf(s), 'chill', `Chill after ${from}`);
    assert.equal(s.looks.ink, 'off', `Chill after ${from}: no Ink look`);
    for (const hit of ['ink', 'cycle', 'xray']) assert.equal(s.dropFx[hit], 'off', `Chill after ${from}: no ${DROP_FX[hit]} hit`);
    assert.equal(s.flash, 'off');
    for (let i = 0; i < 200; i++) {
      const hits = looks.drop(s.dropFx, s.dropCount);
      assert.ok(![DROP_FX.ink, DROP_FX.cycle, DROP_FX.xray].some((h) => hits.includes(h)), `Chill after ${from}: a drop never flashes`);
    }
  }
});

test('Low Flash and Chill promise no palette cycling, and say so: Color Cycle off, which stills the Echo look’s palette steps too', () => {
  for (const id of ['safe', 'chill']) {
    const s = defaults();
    applyPreset(s, id);
    assert.equal(s.dropFx.cycle, 'off', `${id}: no Color Cycle`);
    assert.match(PRESETS[id].hint, /Echo look’s palette steps/, `${id}: the hint names the Echo look’s palette steps`);
  }
  assert.match(PRESETS.safe.hint, /palette swaps \(the drop’s Color Cycle/);
  assert.match(PRESETS.chill.hint, /no flashes \(negative, 1-bit ink, or a color cycle/);
  // The switches say what Off does: Color Cycle (Drop Hits) and the Echo look each have a hint of their own.
  const html = settingsMarkup(defaults(), [['P', 'Render menu']]);
  const item = (key) => [...html.matchAll(/<(label|div) class="viz-mode"[\s\S]*?<\/\1>/g)].map((m) => m[0]).find((l) => l.includes(`data-set="${key}"`))?.match(/data-tip="([^"]+)"/)?.[1];
  assert.match(item('dropFx.cycle') ?? '', /Off: no palette cycling at all, the Echo look’s downbeat color steps and spins too/);
  assert.match(item('looks.echo') ?? '', /unless Color Cycle \(Drop Hits\) is Off/);
});

test('the dialog: every field is a setting; the Render tab has one of each, each with a hint', () => {
  const s = defaults();
  const html = settingsMarkup(s, [['P', 'Render menu']]);
  const path = (key) => key.split('.').reduce((o, k) => o?.[k], s);
  const keys = [...html.matchAll(/data-set="([^"]+)"/g)].map((m) => m[1]);
  for (const k of keys) assert.notEqual(path(k), undefined, `${k} is a setting`);
  const panel = html.slice(html.indexOf('id="viz-tab-render"'), html.indexOf('id="viz-tab-effects"'));
  const render = [...panel.matchAll(/data-set="([^"]+)"/g)].map((m) => m[1]);
  for (const k of ['pixelSize', 'pixelShift', 'dither', 'ditherMatrix', 'outlines', 'palette', 'fewColors', 'exposure', 'vignette', 'fog', 'shadows', 'xray', 'flameFps', 'colorChange', 'trails', 'hitStop', 'hitFlash', 'debris', 'marks']) {
    assert.ok(render.includes(k), `${k} is in the Render tab`);
  }
  assert.ok(render.includes('xrayViews.normals'));
  assert.equal(keys.filter((k) => k === 'pixelSize').length, 1, 'the pixel size moved (it isn’t in the Look tab too)');
  // A hint on every field of the tab: one "?" per label (switch groups have one for the group).
  const fields = [...panel.matchAll(/<(label|div) class="viz-(?:field|check)"[\s\S]*?<\/\1>/g)].map((m) => m[0]).filter((f) => !/data-set="xrayViews\./.test(f));
  assert.ok(fields.length >= 19);
  for (const f of fields) assert.match(f, /data-tip="[^"]{20,}"/, `a hint: ${f.match(/data-set="([^"]+)"/)?.[1]}`);
  // The new layers are in the Layers grid, each with its hint.
  for (const k of ['grain', 'cinema', 'spotlight', 'chroma']) {
    assert.ok(k in LAYERS);
    assert.match(html, new RegExp(`>${LAYERS[k]}</label><button type="button" class="viz-tip"[^>]*data-tip="[^"]{20,}"`));
  }
});

test('the Knights tab: its settings load, keep their type and choices, and each has a hint', () => {
  const s = mergeInto(defaults(), {
    knights: true, knightDance: 'sometimes', knightCam: 'on', knightCount: 3, knightFormation: 'canon',
    knightMoves: { spin: false, moonwalk: true }, knightHelmets: { armet: false }, danceBars: 'random', knightSummon: false,
    knightShine: 'off', knightReactions: 'shiny',
  });
  assert.equal(s.knightShine, 'off');
  assert.equal(s.knightReactions, DEFAULT_SETTINGS.knightReactions, 'an unknown mode is ignored');
  assert.equal(DEFAULT_SETTINGS.knightShine, 'mix');
  assert.equal(DEFAULT_SETTINGS.knightReactions, 'mix');
  assert.equal(s.knights, 'on', 'an old on/off still counts');
  assert.equal(s.knightDance, DEFAULT_SETTINGS.knightDance, 'an unknown mode is ignored');
  assert.equal(s.knightCam, 'on');
  assert.equal(s.knightSummon, 'off');
  assert.equal(s.knightCount, 3);
  assert.equal(s.knightFormation, 'canon');
  assert.equal(s.knightMoves.spin, false);
  assert.ok(!('moonwalk' in s.knightMoves));
  assert.equal(s.knightHelmets.armet, false);
  assert.equal(s.danceBars, 'random', 'New Move Every takes Random');
  for (const [k, v] of [['knightCount', 'random'], ['knightCount', 7], ['knightCount', '2'], ['knightFormation', 'conga']]) {
    const t = mergeInto(defaults(), { [k]: v });
    assert.equal(t[k], v === 'random' ? 'random' : DEFAULT_SETTINGS[k], `${k}: ${v}`);
  }
  const html = settingsMarkup(defaults(), [['K', 'Dance']]);
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tabs[tabs.indexOf('flies') + 1], 'knights', 'Knights comes after Fireflies');
  const panel = html.slice(html.indexOf('id="viz-tab-knights"'), html.indexOf('id="viz-tab-titles"'));
  const keys = [...panel.matchAll(/data-set="([^"]+)"/g)].map((m) => m[1]);
  for (const k of ['knights', 'knightCount', 'knightDance', 'knightFormation', 'danceBars', 'knightCam', 'knightSummon', 'knightGestures', 'knightShine', 'knightReactions', 'knightMoves.praise', 'knightHelmets.bascinet']) assert.ok(keys.includes(k), `${k} is in the Knights tab`);
  const fields = [...panel.matchAll(/<(label|div) class="viz-field"[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  assert.ok(fields.length >= 10);
  // Every knight behavior has the three-way switch.
  for (const k of ['knights', 'knightDance', 'knightSummon', 'knightGestures', 'knightCam', 'knightShine', 'knightReactions', 'knightGlow']) {
    const f = fields.find((x) => x.includes(`data-set="${k}"`));
    assert.deepEqual([...f.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]), ['off', 'mix', 'on'], `${k}: Off / In the mix / Always`);
  }
  for (const f of fields) assert.match(f, /data-tip="[^"]{40,}"/, `a hint: ${f.match(/data-set="([^"]+)"/)?.[1]}`);
  assert.equal([...panel.matchAll(/<p class="viz-field-label">[^<]*<button type="button" class="viz-tip"/g)].length, 2, 'the move and helmet groups have a hint each');
  // Presets: Rave is four knights dancing whenever it's locked; Chill one, resting.
  const rave = defaults(); applyPreset(rave, 'rave');
  assert.deepEqual([rave.knights, rave.knightCount, rave.knightDance, rave.knightShine, rave.knightReactions], ['on', 4, 'on', 'on', 'on']);
  const chill = defaults(); applyPreset(chill, 'chill');
  assert.deepEqual([chill.knights, chill.knightCount, chill.knightDance, chill.knightShine, chill.knightReactions], ['on', 1, 'off', 'on', 'off']);
});

test('the scene settings: they load with their type and choices; the loop keeps only scene refs', () => {
  const d = defaults();
  for (const k of ['scenes', 'sceneFrom', 'sceneOrder', 'sceneBars', 'sceneHold', 'sceneList', 'sceneCards']) assert.ok(k in d, `${k} is a setting`);
  const s = mergeInto(defaults(), {
    scenes: 'on', sceneCards: true, sceneFrom: 'mine', sceneOrder: 'shuffle', sceneBars: 'random', sceneHold: 'base',
    sceneList: { 'b:cathedral-kaleido': false, 'm:my-scene-2': true, 'x:nope': false, 'b:Bad Id': false, 'm:ok': 'no', constructor: false },
  });
  assert.equal(s.scenes, 'on');
  assert.equal(s.sceneCards, 'on', 'an old on/off still counts');
  assert.equal(s.sceneFrom, 'mine');
  assert.equal(s.sceneOrder, 'shuffle');
  assert.equal(s.sceneBars, 'random', 'Change Every takes Random');
  assert.equal(s.sceneHold, 'base');
  assert.deepEqual(s.sceneList, { 'b:cathedral-kaleido': false, 'm:my-scene-2': true }, 'only refs with a switch');
  for (const [k, v] of [['scenes', 'sometimes'], ['sceneFrom', 'yours'], ['sceneOrder', 'random'], ['sceneHold', 'freeze'], ['sceneBars', '32'], ['sceneList', ['b:x']], ['sceneList', 'b:x']]) {
    const t = mergeInto(defaults(), { [k]: v });
    assert.deepEqual(t[k], DEFAULT_SETTINGS[k], `${k}: ${JSON.stringify(v)} is ignored`);
  }
  const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`m:scene-${i}`, false]));
  assert.equal(Object.keys(mergeInto(defaults(), { sceneList: many }).sceneList).length, 200, 'at most 200 kept');
  assert.deepEqual(defaults().sceneList, {}, 'every scene is in the loop to begin with');
});

test('the knight options: style, finish, edge glow and seat pose load with their choices, each a row with a hint', () => {
  const d = defaults();
  for (const k of ['knightStyle', 'knightFinish', 'knightGlow', 'knightRim', 'knightSeat']) assert.ok(k in d, `${k} is a setting`);
  for (const style of [...Object.keys(KNIGHT_STYLES), 'mix']) assert.equal(mergeInto(defaults(), { knightStyle: style }).knightStyle, style);
  assert.deepEqual(Object.keys(KNIGHT_STYLES), ['site', ...STYLE_KEYS], 'the site’s own, then every style');
  for (const finish of [...Object.keys(FINISHES), 'mix']) assert.equal(mergeInto(defaults(), { knightFinish: finish }).knightFinish, finish);
  for (const seat of [...Object.keys(SEAT_POSES), 'mix']) assert.equal(mergeInto(defaults(), { knightSeat: seat }).knightSeat, seat);
  for (const [k, v] of [['knightStyle', 'chrome'], ['knightStyle', 'constructor'], ['knightFinish', 'gold'], ['knightFinish', 'toString'], ['knightSeat', 'lying'], ['knightRim', '0.8'], ['knightRim', Number.NaN]]) {
    assert.deepEqual(mergeInto(defaults(), { [k]: v })[k], d[k], `${k}: ${String(v)} is ignored`);
  }
  assert.equal(mergeInto(defaults(), { knightRim: 0.8 }).knightRim, 0.8);
  assert.equal(mergeInto(defaults(), { knightRim: 3 }).knightRim, 1, 'Edge Glow is kept to 0..1');
  assert.equal(mergeInto(defaults(), { knightRim: -1 }).knightRim, 0);
  // Edge Glow: Off / In the mix / Always (in the mix by default); the slider is its strength.
  assert.equal(d.knightGlow, 'mix');
  for (const m of ['off', 'mix', 'on']) assert.equal(mergeInto(defaults(), { knightGlow: m }).knightGlow, m);
  assert.equal(mergeInto(defaults(), { knightGlow: true }).knightGlow, 'on', 'an on/off still counts');
  assert.equal(mergeInto(defaults(), { knightGlow: 'bright' }).knightGlow, 'mix', 'an unknown mode is ignored');
  // The Knights tab: a row for each, their choices the engine's own, each with a hint.
  const html = settingsMarkup(defaults(), [['K', 'Dance']]);
  const panel = tabOf(html, 'knights');
  assert.deepEqual(choicesOf(panel, 'knightStyle'), ['site', ...STYLE_KEYS, 'mix']);
  assert.deepEqual(choicesOf(panel, 'knightFinish'), [...Object.keys(FINISHES), 'mix']);
  assert.deepEqual(choicesOf(panel, 'knightSeat'), [...Object.keys(SEAT_POSES), 'mix']);
  assert.match(panel, /<input type="range" data-set="knightRim" min="0" max="1"/);
  assert.deepEqual(choicesOf(panel, 'knightGlow'), ['off', 'mix', 'on'], 'Edge Glow: Off / In the mix / Always');
  assert.ok(panel.indexOf('data-set="knightGlow"') < panel.indexOf('data-set="knightRim"'), 'the switch, then its strength');
  assert.match(panel, /<span class="viz-field-label"><label for="[^"]+">Edge Glow<\/label> [\s\S]*?data-set="knightGlow"/);
  assert.match(panel, /<span class="viz-field-label"><label for="[^"]+">Glow Strength<\/label> [\s\S]*?data-set="knightRim"/);
  for (const k of ['knightStyle', 'knightFinish', 'knightGlow', 'knightRim', 'knightSeat']) {
    const f = [...panel.matchAll(/<(label|div) class="viz-field"[\s\S]*?<\/\1>/g)].map((m) => m[0]).find((x) => x.includes(`data-set="${k}"`));
    assert.ok(f, `${k} is in the Knights tab`);
    assert.match(f, /data-tip="[^"]{60,}"/, `${k} has a hint`);
    assert.match(f, /<span class="viz-field-label"><label for="[^"]+">[A-Z][a-z]+( [A-Z][a-z]+)*(?: |<\/label>)/, `${k}: a Title Case label`);
  }
  // Default Dance is one of the moves (knightShow.js), so the Moves row has it.
  assert.match(panel, /data-set="knightMoves\.defaultDance"/);
  // The presets give the knights a character: Chill painterly and resting, Rave hard and watchful.
  const chill = defaults(); applyPreset(chill, 'chill');
  assert.deepEqual([chill.knightStyle, chill.knightSeat], ['pixel-painterly', 'resting']);
  const rave = defaults(); applyPreset(rave, 'rave');
  assert.deepEqual([rave.knightStyle, rave.knightFinish, rave.knightGlow, rave.knightRim, rave.knightSeat], ['pixel-chiaroscuro', 'polished', 'on', 1, 'watchful']);
  assert.deepEqual([chill.knightGlow, chill.knightRim], ['on', 0.7], 'Chill: his edges always catching the firelight');
  assert.match(PRESETS.chill.hint, /edges always catching the firelight/);
  for (const p of Object.values(PRESETS)) {
    if ('knightStyle' in p.values) assert.ok(['site', ...STYLE_KEYS, 'mix'].includes(p.values.knightStyle));
    if ('knightFinish' in p.values) assert.ok(p.values.knightFinish in FINISHES || p.values.knightFinish === 'mix');
  }
});

test('the Scenes tab: after Effects, its fields are real settings with hints, the loop is its own', () => {
  const html = settingsMarkup(defaults(), [['N', 'Next scene']], { base: '/site/' });
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tabs[tabs.indexOf('effects') + 1], 'scenes', 'Scenes comes after Effects');
  const panel = tabOf(html, 'scenes');
  const keys = [...panel.matchAll(/data-set="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), ['sceneBars', 'sceneCards', 'sceneFrom', 'sceneHold', 'sceneOrder', 'scenes']);
  const fields = [...panel.matchAll(/<(label|div) class="viz-field"[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  assert.equal(fields.length, 6);
  for (const f of fields) {
    assert.match(f, /data-tip="[^"]{60,}"/, `a hint: ${f.match(/data-set="([^"]+)"/)?.[1]}`);
    assert.match(f, /<span class="viz-field-label"><label for="[^"]+">[A-Z][a-z]+( [A-Z][a-z]+)*(?: |<\/label>)/, `a Title Case label: ${f.match(/data-set="([^"]+)"/)?.[1]}`);
  }
  assert.deepEqual(choicesOf(panel, 'scenes'), ['off', 'mix', 'on'], 'Scenes: Off / In the mix / Always');
  assert.deepEqual(choicesOf(panel, 'sceneCards'), ['off', 'mix', 'on'], 'Scene Cards: Off / In the mix / Always');
  assert.deepEqual(choicesOf(panel, 'sceneBars'), [...BAR_OPTIONS.sceneBars.map(([v]) => String(v)), 'random']);
  assert.deepEqual(choicesOf(panel, 'sceneHold'), ['scene', 'hold', 'base']);
  assert.match(panel, /<ol class="viz-scenes" data-scene-list>/);
  assert.match(panel, /href="\/site\/painter\/"[^>]*>Make a Scene in the Painter/);
});

test('the Scenes tab: the loop lists the library by ref (From picks whose), each switch in or out, Play Now and Edit in Painter', () => {
  const built = { ...defaultScene('Frozen Shrine'), id: 'frozen-shrine' };
  const mine = { ...defaultScene('My <Scene>'), id: 'my-scene' };
  const library = [{ ref: 'b:frozen-shrine', scene: built }, { ref: 'm:my-scene', scene: mine }];
  const s = defaults();
  const rows = (html) => [...html.matchAll(/data-scene-row="([^"]+)"/g)].map((m) => m[1]);
  let html = sceneListMarkup(library, s, { playing: 'm:my-scene', thumb: (ref) => (ref === 'm:my-scene' ? 'data:image/webp;base64,AAAA' : null), base: '/' });
  assert.deepEqual(rows(html), ['b:frozen-shrine', 'm:my-scene']);
  assert.ok(!/data-set=/.test(html), 'the loop’s switches aren’t settings fields');
  assert.equal([...html.matchAll(/data-scene-toggle="[^"]+" checked/g)].length, 2, 'both in the loop to begin with');
  assert.match(html, /My &lt;Scene&gt;/, 'names are escaped');
  assert.match(html, /<span class="viz-scene-badge">Built-In<\/span>/);
  assert.match(html, /<span class="viz-scene-badge is-mine">Mine<\/span>/);
  assert.match(html, /data-scene-row="m:my-scene"[^>]*aria-current="true"/, 'the one playing is marked');
  assert.match(html, /<img src="data:image\/webp;base64,AAAA"/, 'a thumbnail when there is one');
  assert.match(html, /data-scene-row="b:frozen-shrine"[\s\S]*?<span class="viz-scene-thumb" aria-hidden="true"><i style="background:#/, 'its colors when there isn’t');
  assert.match(html, /data-scene-play="b:frozen-shrine"/);
  assert.match(html, /href="\/painter\/\?scene=m:my-scene"/, 'Edit in Painter opens it there');
  setInLoop(s, 'm:my-scene', false);
  assert.deepEqual(s.sceneList, { 'm:my-scene': false });
  assert.equal(inLoop(s, 'm:my-scene'), false);
  html = sceneListMarkup(library, s);
  assert.match(html, /class="viz-scene-row is-out" data-scene-row="m:my-scene"/);
  assert.ok(!/data-scene-toggle="m:my-scene" checked/.test(html));
  setInLoop(s, 'm:my-scene', true);
  assert.deepEqual(s.sceneList, {}, 'back in: nothing kept');
  s.sceneFrom = 'builtin';
  assert.deepEqual(rows(sceneListMarkup(library, s)), ['b:frozen-shrine']);
  s.sceneFrom = 'mine';
  assert.deepEqual(rows(sceneListMarkup(library, s)), ['m:my-scene']);
  assert.match(sceneListMarkup([], s), /viz-scenes-empty[^>]*>No scenes of your own yet/);
  assert.deepEqual(scenesFrom(library, { sceneFrom: 'both' }).map((e) => e.ref), ['b:frozen-shrine', 'm:my-scene']);
});

test('the scene presets: Club is the defaults with the scenes in the mix, Chill holds them, Rave changes them faster', () => {
  const club = PRESETS.club.values;
  for (const k of ['scenes', 'sceneBars', 'sceneHold', 'knightStyle', 'knightFinish', 'knightGlow', 'knightRim', 'knightSeat']) {
    assert.ok(k in club, `Club sets ${k}`);
    assert.deepEqual(club[k], defaults()[k], `Club's ${k} is the default`);
  }
  const chill = defaults(); applyPreset(chill, 'chill');
  assert.deepEqual([chill.scenes, chill.sceneHold], ['on', 'hold']);
  assert.ok(chill.sceneBars > club.sceneBars, 'Chill holds each longer');
  const rave = defaults(); applyPreset(rave, 'rave');
  assert.ok(rave.sceneBars > 0 && rave.sceneBars < club.sceneBars, 'Rave changes them faster');
  assert.ok(!('scenes' in PRESETS.safe.values), 'Low Flash leaves the scenes (a scene never turns on what it has off)');
});

test('the hints: no "?" is a hidden keyboard stop; every setting reads its hint out, a group’s switches the group’s too', async () => {
  const { tip } = await import('../src/ui/fields.js');
  const html = settingsMarkup(defaults(), [['P', 'Render menu']]);
  const marks = [...html.matchAll(/<button type="button" class="viz-tip"[^>]*>/g)].map((m) => m[0]);
  assert.ok(marks.length > 50);
  for (const m of marks) assert.ok(/tabindex="-1"/.test(m), `a field's "?" isn't a stop (its input reads the hint out): ${m}`);
  // Every description points at a hint that's there.
  const hints = new Map([...html.matchAll(/<span class="visually-hidden" id="(viz-tip-\d+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]));
  const described = [...html.matchAll(/<(input|select)[^>]*data-set="([^"]+)"[^>]*>/g)].map((m) => [m[2], m[0].match(/aria-describedby="([^"]+)"/)?.[1].split(' ') ?? []]);
  for (const [key, ids] of described) for (const id of ids) assert.ok(hints.has(id), `${key}: ${id} is a hint`);
  const of = (key) => described.find(([k]) => k === key)?.[1] ?? [];
  // A field with its own hint; a group's switch (no hint of its own) reads the group's; a
  // grid's switch reads its own, then the grid's.
  assert.equal(of('knightCount').length, 1);
  assert.equal(of('knightMoves.praise').length, 1, 'a move’s switch reads out the Moves hint');
  assert.equal(hints.get(of('knightMoves.praise')[0]), hints.get(of('knightMoves.spin')[0]), 'the same group hint for each');
  assert.match(html, /<label class="viz-check" data-group-tip><input type="checkbox" data-set="knightMoves\.praise"/);
  assert.equal(of('grain').length, 2, 'a layer: its own hint, then the grid’s');
  for (const [key, ids] of described) assert.ok(ids.length > 0, `${key} reads a hint out`);
  // A "?" drawn on its own (no input stands for it) is a named stop, described by its hint.
  const lone = tip('What this does, at length.');
  assert.match(lone.mark, /tabindex="0" data-tip="[^"]+" aria-label="Hint" aria-describedby="viz-tip-\d+"/);
  assert.doesNotMatch(lone.mark, /aria-hidden/);
  assert.match(tip('x', { control: true }).mark, /^<button type="button" class="viz-tip" tabindex="-1" data-tip/);
});
