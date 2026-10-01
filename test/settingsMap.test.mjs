// The settings map (src/settingsMap.js): every setting Bonfire Live keeps, every part of a
// scene the Painter edits and the effects the admin shares has its one entry; the bindings
// are the real saved keys, scene paths and content paths; a number keeps one range in every
// app; the copy keeps its rules (Title Case labels of at most 32 characters, hints of 12–160
// that don't repeat the label, no "In the mix:" boilerplate); every look, layer, drop hit
// and x-ray view has a hint of its own; the needs hold where they say. And the shared data
// tables' names are Title Case too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TABS, SECTIONS, PAINTER_SECTIONS, SETTINGS, ITEM_HINTS, TRI_HELP, SYNONYMS,
  entriesFor, meta, sectionsFor, adminLabels, adminHelp, sharedRange, conceptOf, blockedBy,
} from '../src/settingsMap.js';
import { defaults } from '../src/visualizer/settings.js';
import { LOOKS, LAYERS, DROP_FX, MIRRORS, PARAMS } from '../src/visualizer/looks.js';
import { PALETTES, FOGS, XRAY_VIEWS, PIXEL_SIZES } from '../src/visualizer/render.js';
import { HELMETS, KNIGHT_MOVES, FORMATIONS, SEAT_POSES, KNIGHT_STYLES } from '../src/visualizer/knightShow.js';
import { SHOTS, COMBO_SHOTS, KNIGHT_SHOTS, SWING_CAMS, HOLD_CAMS, TRANSITIONS, CAMERA_MODES } from '../src/visualizer/camera.js';
import { SWING_EASES } from '../src/visualizer/cameraEase.js';
import { COLOR_MODES, COLOR_SCHEMES } from '../src/visualizer/colors.js';
import { FLY_MOVES } from '../src/visualizer/fireflyMoves.js';
import { CAMERA_MOVES, FLY_SHOWS, KNIGHT_SEATS, MUSIC, SCENE_RANGES, defaultScene, normalizeScene } from '../src/scenes.js';
import { FINISH_NAMES } from '../src/bonfire/steel.js';
import { STYLE_KEYS, STYLE_NAMES } from '../src/bonfire/knightStyles.js';
import { HELMET_NAMES } from '../src/knightNames.js';
import { DEFAULT_EFFECTS, RANGES } from '../src/effectsDefaults.js';
import { panelMarkup, getPath, SECTIONS as PANEL_SECTIONS } from '../src/painter/panel.js';

// (Title Case is the admin's rule, shared from src/text.js once it moves there. Live's dialog
// markup comes from settingsDialog.js once the dialog moves out of the settings store.)
const { titleCase } = await import('../src/text.js').catch(() => import('../admin/ui/text.js'));
const { settingsMarkup } = await import('../src/visualizer/settingsDialog.js').catch(() => import('../src/visualizer/settings.js'));

const content = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8'));
/** Live's settings that are the page's own, not settings anyone picks in the dialog. */
const PAGE_LOCALS = ['deviceId', 'view', 'cards', 'sceneList'];
/** Live keys an entry stands for (the layers entry: the 14 layer keys). */
const liveKeys = (e) => (e.live === 'layers' ? Object.keys(LAYERS) : [e.live]);
const attrs = (html, name) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
const at = (obj, path) => path.replace(/\[\]/g, '.0').split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

/** A scene with every optional part filled (as test/painter.test.mjs paints one), its style its own. */
function fullScene() {
  const s = defaultScene('Everything');
  s.colors.scenery = { void: '#050608', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };
  s.drops = { fx: Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, 'mix'])), count: 3 };
  s.layers = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, 'mix']));
  s.details = { ghostKeep: 0.9, glowSize: 3, grad: [0, 6, 8], paintR: 3, scan: 1, mirror: 2, flicker: 1, chroma: 2 };
  s.blends = { feed: 'screen' };
  s.look = { name: 'kaleido', amount: 1.2, params: { segments: 8 } };
  s.render.palette = [0, 6, 8];
  s.render.xray = 'normals';
  s.knights = { ...s.knights, count: 4, helmets: ['great', null, 'armet', null], moves: ['nod', 'defaultDance'], style: 'mix' };
  s.fireflies.moves = ['swing'];
  s.camera.move = { kind: 'push', amount: 0.5, bars: 8 };
  return normalizeScene(s);
}
const panelCtx = {
  weapons: { rapier: 'Rapier' },
  flames: [{ key: 'ember', name: 'Ember Flame', colors: { lo: '#8c1d2f', mid: '#e0582a', hi: '#ffc76a', core: '#fff1d0', shade: '#2e1f1f', light: 0.34 } }],
  shots: [{ key: 'clearing', name: 'Clearing', camera: defaultScene().camera }],
  open: PANEL_SECTIONS.map(([id]) => id),
};

test('Live: every setting the dialog picks has exactly one entry, bound to a key the settings keep', () => {
  const d = defaults();
  const count = new Map();
  for (const e of entriesFor('live')) for (const k of liveKeys(e)) count.set(k, (count.get(k) ?? 0) + 1);
  for (const k of Object.keys(d).filter((k) => !PAGE_LOCALS.includes(k))) assert.equal(count.get(k), 1, `${k}: one entry`);
  // (Frame Rate is the page's own, coming with its control; every other binding is a setting.)
  for (const k of count.keys()) assert.ok(k in d || k === 'frameRate', `${k} is a setting`);
  for (const k of PAGE_LOCALS) assert.equal(count.get(k), undefined, `${k} is the page's own`);
  // Every field of the dialog (a group's item too: looks.echo, knightHelmets.armet) finds its entry.
  const html = settingsMarkup(d, [['P', 'Render Settings']]);
  for (const key of new Set(attrs(html, 'data-set'))) assert.ok(conceptOf('live', key), `${key} has an entry`);
});

test('Painter: every part of a scene the panel edits has an entry, and every binding is a part of a scene', () => {
  const scene = fullScene();
  for (const s of [scene, defaultScene()]) {
    const html = panelMarkup(s, panelCtx);
    const paths = new Set([...attrs(html, 'data-scene'), ...attrs(html, 'data-pick'), ...attrs(html, 'data-list')]);
    assert.ok(paths.size > 40, `${paths.size} paths`);
    for (const path of paths) assert.ok(conceptOf('painter', path), `${path} has an entry`);
  }
  for (const e of entriesFor('painter')) assert.notEqual(getPath(scene, e.painter), undefined, `${e.id}: ${e.painter} is in a scene`);
});

test('admin: every binding is an effects setting; its labels and help come out by content path', () => {
  const root = { effects: DEFAULT_EFFECTS };
  const labels = adminLabels();
  const help = adminHelp();
  for (const e of entriesFor('admin')) {
    assert.match(e.admin, /^effects\./, e.id);
    assert.notEqual(at(root, e.admin), undefined, `${e.id}: ${e.admin} is in DEFAULT_EFFECTS`);
    assert.equal(labels[e.admin], e.labels?.admin ?? e.label);
    assert.equal(help[e.admin], e.hints?.admin ?? e.hint);
  }
  assert.equal(labels['effects.fire.fps'], 'Flame Frame Rate');
  assert.equal(labels['effects.knight.rim'], 'Edge Glow Strength');
  assert.equal(labels['effects.fire.glow'], 'Firelight');
  assert.equal(labels['effects.knight.gestures'], 'Gestures On Click');
  assert.equal(labels['effects.flames'], 'Flame Colors');
  assert.equal(labels['effects.colors'], 'Place Colors');
});

test('each binding belongs to one entry, and finds it (a group item, a list entry, a layer key)', () => {
  for (const app of ['live', 'painter', 'admin']) {
    const seen = new Set();
    for (const e of entriesFor(app)) {
      assert.ok(!seen.has(e[app]), `${app}: ${e[app]} is bound twice`);
      seen.add(e[app]);
      assert.equal(conceptOf(app, e[app]), e.id);
    }
  }
  assert.equal(meta('live', 'looks.echo').id, 'looks');
  assert.equal(meta('live', 'glow').id, 'layers');
  assert.equal(meta('live', 'knightHelmets.armet').id, 'knightHelmets');
  assert.equal(meta('painter', 'knights.helmets.2').id, 'knightHelmets');
  assert.equal(meta('painter', 'details.glowSize').id, 'layerDetails');
  assert.equal(meta('painter', 'colors.flame.lo').id, 'colors');
  assert.equal(meta('painter', 'colors.flame.light').id, 'flameLight');
  assert.equal(meta('painter', 'camera.fov').id, 'lens');
  assert.equal(meta('painter', 'camera').id, 'shot');
  assert.equal(meta('admin', 'effects.flames[3].light').id, 'flameLight');
  for (const [app, b] of [['live', 'deviceId'], ['live', 'nope'], ['painter', 'camera.nope'], ['admin', 'effects.lightning.size'], ['nope', 'glitch']]) {
    assert.equal(meta(/** @type {any} */ (app), b), null, `${app}: ${b}`);
  }
  // The same thing has the same name in every app, unless it means something else there.
  assert.equal(meta('live', 'flameFps').label, meta('painter', 'render.flameFps').label);
  assert.equal(meta('live', 'knightRim').label, 'Edge Glow Strength');
  assert.equal(meta('painter', 'knights.rim').label, 'Edge Glow Strength');
  assert.equal(meta('painter', 'look.amount').label, 'Strength');
  assert.equal(meta('painter', 'knights.count').label, 'Knights');
  assert.equal(meta('live', 'knightCount').label, 'How Many');
  assert.equal(meta('live', 'scenery').label, 'Place');
  // Only in All Settings: whatever isn't in Simple view.
  assert.equal(meta('live', 'dither').adv, true);
  assert.equal(meta('live', 'pixelSize').adv, false);
  assert.equal(meta('painter', 'render.dither').adv, false);
});

test('one range per number, the same in Bonfire Live, the Painter and the admin', () => {
  const html = settingsMarkup(defaults(), []);
  const live = Object.fromEntries([...html.matchAll(/<input[^>]*type="(?:range|number)"[^>]*>/g)].map(([tag]) => {
    const a = (n) => tag.match(new RegExp(`${n}="([^"]*)"`))?.[1];
    return [a('data-set'), [a('min'), a('max'), a('step')].map(Number)];
  }));
  // (A Painter slider that adds to the music's drive, or a count up to the site's own, keeps
  // its range of its own; so does the admin's pixel size, a slider where the menus list sizes.)
  const OWN = { painter: ['fireGlow', 'flyLit', 'dropCount'], admin: ['fireGlow', 'pixelSize', 'pixelSizeSmall'] };
  for (const [id, e] of Object.entries(SETTINGS)) {
    const r = sharedRange(id);
    if (e.live && live[e.live]) {
      assert.ok(r, `${id}: a slider in Live needs its range`);
      assert.deepEqual(live[e.live], r.slice(0, 3), `${id}: Live's slider`);
    }
    if (e.painter && SCENE_RANGES[e.painter] && !OWN.painter.includes(id)) assert.deepEqual(SCENE_RANGES[e.painter], r, `${id}: the Painter's`);
    const pattern = e.admin?.slice('effects.'.length);
    if (pattern && RANGES[pattern] && !OWN.admin.includes(id)) assert.deepEqual(RANGES[pattern], r, `${id}: the admin's`);
    if (r) {
      assert.ok(r[0] < r[1] && r[2] > 0 && r[2] <= r[1] - r[0], `${id}: ${r}`);
      // The defaults and the site's tuned values sit inside it.
      if (e.live && typeof defaults()[e.live] === 'number') assert.ok(defaults()[e.live] >= r[0] && defaults()[e.live] <= r[1], `${id}: Live's default`);
      if (pattern) {
        for (const root of [{ effects: DEFAULT_EFFECTS }, content]) {
          const v = at(root, e.admin);
          if (typeof v === 'number') assert.ok(v >= r[0] && v <= r[1], `${id}: ${v} in ${r}`);
        }
      }
    }
  }
  assert.deepEqual(sharedRange('dither'), [0, 0.4, 0.02]);
  assert.deepEqual(sharedRange('exposure'), [0.5, 2, 0.05, '×']);
  assert.equal(sharedRange('nope'), undefined);
  const r = sharedRange('dither');
  r[1] = 9;
  assert.equal(sharedRange('dither')[1], 0.4, 'a copy');
  // The site's tuned dither and exposure (0.08, 1.45) still pass the admin's rules.
  assert.ok(content.effects.render.dither <= RANGES['render.dither'][1] && content.effects.render.exposure >= RANGES['render.exposure'][0]);
});

test('every look, layer, drop hit and x-ray view has a hint of its own', () => {
  assert.deepEqual(Object.keys(ITEM_HINTS.looks).sort(), Object.keys(LOOKS).sort());
  assert.deepEqual(Object.keys(ITEM_HINTS.layers).sort(), Object.keys(LAYERS).sort());
  assert.deepEqual(Object.keys(ITEM_HINTS.dropFx).sort(), Object.keys(DROP_FX).sort());
  assert.deepEqual(Object.keys(ITEM_HINTS.xrayViews).sort(), Object.keys(XRAY_VIEWS).sort());
  const all = Object.values(ITEM_HINTS).flatMap((group) => Object.values(group));
  assert.equal(new Set(all).size, all.length, 'no two the same');
});

/** Every hint people read: the entries' (and their per-app ones), the items', the intros, the details'. */
function hints() {
  const out = [];
  for (const [id, e] of Object.entries(SETTINGS)) {
    // (An app's own hint shows beside its own label; the shared one beside every other.)
    const own = Object.entries(e.labels ?? {}).filter(([app]) => !e.hints?.[app]).map(([, l]) => l);
    out.push([id, e.hint, [e.label, ...own]]);
    for (const [app, h] of Object.entries(e.hints ?? {})) out.push([`${id} (${app})`, h, [e.labels?.[app] ?? e.label]]);
  }
  const names = { looks: LOOKS, layers: LAYERS, dropFx: DROP_FX, xrayViews: XRAY_VIEWS };
  for (const [group, items] of Object.entries(ITEM_HINTS)) for (const [k, h] of Object.entries(items)) out.push([`${group}.${k}`, h, [names[group][k]]]);
  for (const s of SECTIONS.filter((x) => x.intro)) out.push([`section ${s.id}`, s.intro, [s.label]]);
  for (const [k, p] of Object.entries(PARAMS)) out.push([`detail ${k}`, p.hint, [p.label]]);
  for (const [k, e] of Object.entries(SWING_EASES)) out.push([`feel ${k}`, e.hint, [e.name]]);
  return out;
}

test('the copy: Title Case labels of at most 32 characters, hints that say what they do', () => {
  const labels = [
    ...TABS.map((t) => t.label), ...SECTIONS.map((s) => s.label), ...PAINTER_SECTIONS.map((s) => s.label),
    ...Object.values(SETTINGS).flatMap((e) => [e.label, ...Object.values(e.labels ?? {})]),
    ...Object.values(PARAMS).map((p) => p.label),
  ];
  for (const label of labels) {
    assert.equal(titleCase(label), label, `"${label}" in Title Case`);
    assert.ok(label.length <= 32 && label.trim() === label, `"${label}": at most 32 characters`);
  }
  for (const [where, hint, own] of [...hints(), ['TRI_HELP', TRI_HELP, []]]) {
    assert.ok(hint.length >= 12 && hint.length <= 160, `${where}: ${hint.length} characters`);
    assert.match(hint, /^[A-Z0-9(“‘]/, `${where}: a sentence`);
    assert.match(hint, /[.!?…)]$/, `${where}: ends like a sentence`);
    assert.doesNotMatch(hint, /in the mix:|\(it comes and goes|rolled again each time the look comes round\)?\.?$/i, `${where}: no boilerplate`);
    for (const label of own) {
      assert.notEqual(hint.toLowerCase(), label.toLowerCase(), `${where}: more than its label`);
      assert.ok(!hint.toLowerCase().startsWith(`${label.toLowerCase()} `) && !hint.toLowerCase().startsWith(`${label.toLowerCase()}:`), `${where}: doesn't start with "${label}"`);
    }
  }
  // The long explanations: each line a sentence, under a "More".
  for (const [id, e] of Object.entries(SETTINGS).filter(([, x]) => x.more)) {
    for (const line of e.more.split('\n')) assert.ok(line.length >= 12 && line.length <= 200 && /[.)]$/.test(line), `${id}: "${line}"`);
  }
  // Each style, finish and camera feel has its line (the gunmetal style is Smooth Steel to people).
  const styleLines = SETTINGS.knightStyle.more.split('\n');
  for (const k of STYLE_KEYS) {
    const name = k === 'gunmetal' ? 'Smooth Steel' : STYLE_NAMES[k];
    assert.ok(styleLines.some((l) => l.startsWith(`${name}: `)), `a line for ${name}`);
  }
  assert.equal(styleLines.length, STYLE_KEYS.length);
  assert.deepEqual(SETTINGS.knightFinish.more.split('\n').map((l) => l.split(':')[0]), Object.values(FINISH_NAMES));
  assert.deepEqual(SETTINGS.swingEase.more.split('\n'), Object.values(SWING_EASES).map((e) => `${e.name}: ${e.hint}`), 'the feels as cameraEase.js has them');
});

test('sections: every entry sits in one, each Live one in a tab, each Painter one in a Painter section', () => {
  const ids = SECTIONS.map((s) => s.id);
  const tabs = TABS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(tabs, ['sound', 'show', 'drops', 'picture', 'effects', 'camera', 'cast', 'scenes', 'setups']);
  for (const s of SECTIONS) assert.ok(s.tab === null || tabs.includes(s.tab), `${s.id}: ${s.tab}`);
  // Live's sections come tab by tab, in the tabs' order.
  const order = SECTIONS.filter((s) => s.tab).map((s) => tabs.indexOf(s.tab));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  for (const tab of tabs) assert.ok(SECTIONS.some((s) => s.tab === tab), `${tab} has a section`);
  const painterFrom = PAINTER_SECTIONS.flatMap((s) => s.from);
  for (const id of painterFrom) assert.ok(ids.includes(id), id);
  assert.equal(new Set(painterFrom).size, painterFrom.length, 'each shared section in one Painter section');
  assert.equal(PAINTER_SECTIONS.length, 10);
  for (const [id, e] of Object.entries(SETTINGS)) {
    const s = SECTIONS.find((x) => x.id === e.section);
    assert.ok(s, `${id}: ${e.section}`);
    if (e.live) assert.ok(s.tab, `${id}: a Live setting in a Live tab`);
    if (e.painter) assert.ok(painterFrom.includes(e.section), `${id}: in a Painter section`);
    assert.ok(e.live || e.painter || e.admin, `${id}: bound somewhere`);
  }
  // The entries come in their sections' order.
  const at = (e) => ids.indexOf(e.section);
  const seq = Object.values(SETTINGS).map(at);
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b), 'SETTINGS in the sections’ order');
  // sectionsFor: Live's tabbed ones, the Painter's own, the admin's that hold its entries.
  assert.deepEqual(sectionsFor('live').map((s) => s.id), SECTIONS.filter((s) => s.tab).map((s) => s.id));
  assert.deepEqual(sectionsFor('painter').map((s) => s.id), PAINTER_SECTIONS.map((s) => s.id));
  for (const s of sectionsFor('admin')) assert.ok(entriesFor('admin').some((e) => e.section === s.id), s.id);
  // Simple view: the settings that matter most in each tab, the rest a search or a click away.
  const simple = Object.fromEntries(tabs.map((t) => [t, entriesFor('live').filter((e) => e.simple && SECTIONS.find((s) => s.id === e.section).tab === t).length]));
  assert.deepEqual(simple, { sound: 4, show: 6, drops: 4, picture: 10, effects: 3, camera: 3, cast: 9, scenes: 8, setups: 0 });
  assert.equal(SETTINGS.layers.simple, undefined, 'the 14 layers are in All Settings');
  assert.equal(SETTINGS.frameRate.simple, true);
});

test('search words: lowercase, each with somewhere to go', () => {
  for (const [word, terms] of Object.entries(SYNONYMS)) {
    assert.equal(word, word.toLowerCase());
    assert.ok(Array.isArray(terms) && terms.length > 0, word);
    for (const t of terms) assert.equal(t, t.toLowerCase(), `${word}: ${t}`);
  }
  for (const [word, to] of [['brightness', 'exposure'], ['strobe', 'flash'], ['strobe', 'flicker'], ['fps', 'frame rate'], ['bpm', 'beat'], ['colour', 'color'], ['resolution', 'pixel size']]) {
    assert.ok(SYNONYMS[word].includes(to), `${word} → ${to}`);
  }
  for (const e of Object.values(SETTINGS)) for (const k of e.keywords ?? []) assert.equal(k, k.toLowerCase(), k);
});

test('needs: a setting is blocked only while its master leaves it nothing to do', () => {
  const d = defaults();
  for (const e of entriesFor('live').filter((x) => x.needs)) {
    const n = e.needs.live;
    assert.ok(n.key in d, `${e.id}: needs ${n.key}, a setting`);
    assert.equal(typeof n.when, 'function');
    assert.ok(n.reason.length >= 8 && n.reason.length <= 60, `${e.id}: "${n.reason}"`);
    // (The Link bridge's port waits for Ableton Link, Harmony for made flames; the rest work as they come.)
    assert.equal(!!blockedBy(e.live, d), ['linkPort', 'scheme'].includes(e.id), `${e.id}: as it comes`);
  }
  const with_ = (o) => ({ ...defaults(), ...o });
  assert.equal(blockedBy('knightRim', with_({ knightGlow: 'off' })), 'Edge Glow is Off');
  assert.equal(blockedBy('knightRim', with_({ knightGlow: 'mix' })), null);
  assert.equal(blockedBy('knightRim', with_({ knightGlow: true })), null, 'an old on/off counts');
  assert.ok(blockedBy('linkPort', with_({ beatFrom: 'music' })));
  assert.equal(blockedBy('linkPort', with_({ beatFrom: 'link' })), null);
  assert.ok(blockedBy('ditherMatrix', with_({ dither: 0 })));
  assert.equal(blockedBy('ditherMatrix', with_({ dither: 0.08 })), null);
  assert.ok(blockedBy('scheme', with_({ colors: 'site' })));
  assert.equal(blockedBy('scheme', with_({ colors: 'mix' })), null, 'a mix makes harmonious flames too');
  // X-ray views: only when neither the flips nor the drop's hit can show one.
  assert.equal(blockedBy('xrayViews.flow', with_({ xray: 'off' })), null, 'the drop’s X-Ray hit still flips');
  assert.ok(blockedBy('xrayViews.flow', with_({ xray: 'off', dropFx: { ...defaults().dropFx, xray: 'off' } })));
  assert.ok(blockedBy('cutBars', with_({ camera: 'drift' })));
  // Knight Shots: a drop's wide shot visits the dancers whenever the camera moves at all.
  assert.equal(blockedBy('knightCam', with_({ camera: 'drift' })), null);
  assert.ok(blockedBy('knightCam', with_({ camera: 'still' })));
  // Firefly dances: a preset scene with a light show of its own brings them back.
  assert.equal(blockedBy('flyMoves.swing', with_({ blink: false })), null);
  assert.ok(blockedBy('flyBars', with_({ blink: false, scenes: 'off' })));
  assert.ok(blockedBy('sceneBars', with_({ scenes: 'off' })));
  assert.equal(blockedBy('sceneHold', with_({ scenes: 'off' })), null, 'N still plays a scene by hand');
});

test('the map imports nothing (the site, the admin and node load it as it is)', () => {
  const src = readFileSync(new URL('../src/settingsMap.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\b|\bimport\(|\brequire\(/m);
});

test('the shared tables name things in Title Case, the same names everywhere', () => {
  const tables = {
    LOOKS, DROP_FX, LAYERS, MIRRORS, PALETTES, FOGS, XRAY_VIEWS, HELMETS, KNIGHT_MOVES, FORMATIONS, SEAT_POSES, KNIGHT_STYLES,
    SWING_CAMS, HOLD_CAMS, TRANSITIONS, CAMERA_MODES, COLOR_MODES, COLOR_SCHEMES, FLY_MOVES, CAMERA_MOVES, FLY_SHOWS, KNIGHT_SEATS, MUSIC, FINISH_NAMES,
    SHOTS: Object.fromEntries(Object.entries({ ...SHOTS, ...COMBO_SHOTS, ...KNIGHT_SHOTS }).map(([k, s]) => [k, s.name])),
    FEELS: Object.fromEntries(Object.entries(SWING_EASES).map(([k, e]) => [k, e.name])),
    DETAIL_NAMES: Object.fromEntries(Object.entries(PARAMS).flatMap(([k, p]) => (p.names ?? []).map((n, i) => [`${k}${i}`, n]))),
  };
  for (const [table, names] of Object.entries(tables)) {
    for (const [k, name] of Object.entries(names)) assert.equal(titleCase(name), name, `${table}.${k}: "${name}"`);
  }
  assert.equal(HELMETS, HELMET_NAMES, 'one list of helmet names');
  assert.equal(DROP_FX.kaleido, 'Kaleido Burst', 'not the Kaleido look’s name');
  assert.ok(!Object.values(SWING_EASES).some((e) => /original/.test(e.hint)));
  assert.deepEqual(PIXEL_SIZES, [2, 3, 4, 6, 8]);
  assert.deepEqual(Object.keys(CAMERA_MODES), ['still', 'drift', 'cuts']);
  assert.ok(Object.keys(CAMERA_MODES).includes(defaults().camera));
});
