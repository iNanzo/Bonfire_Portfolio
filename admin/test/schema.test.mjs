// How the admin names and groups things (admin/ui/schema.js): the Look & Feel pages the one
// long Effects page became, every Interface text's label, help short enough to read (the rest
// folded under More) and naming pages as they're named now, the sub-headings, the shared
// settings' names from the settings map, the pixel sizes the menus offer, and Reset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_EFFECTS } from '../../src/effectsDefaults.js';
import { validateContent } from '../../src/contentRules.js';
import { adminHelp, adminLabels } from '../../src/settingsMap.js';
import { PIXEL_SIZES } from '../../src/visualizer/render.js';
import {
  HELP, LABELS, PAGES, PAGE_ALIASES, SELECTS, SUBGROUPS, defaultLabel, moreFor, resolveHelp, subgroupsOf,
} from '../ui/schema.js';
import { titleCase } from '../ui/text.js';
import { resetMessage, resetSection } from '../ui/reset.js';

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
/** The pack's four weapon-group headings the site adds this round (content.json may not have them yet). */
const NEW_UI = ['packSwords', 'packGreatswords', 'packPolearms', 'packAxes'];

test('Look & Feel: Colors, Fire & Elements, Picture and Knight beside the preview, then Scenes; #effects still opens', () => {
  const look = PAGES.filter((p) => p.group === 'Look & feel');
  assert.deepEqual(look.map((p) => p.id), ['colors', 'fire', 'picture', 'knight', 'scenes']);
  assert.deepEqual(look.map((p) => titleCase(p.label)), ['Colors', 'Fire & Elements', 'Picture', 'Knight', 'Scenes']);
  assert.deepEqual(PAGES.find((p) => p.id === 'colors').keys, ['effects.flames', 'effects.colors']);
  assert.deepEqual(PAGES.find((p) => p.id === 'fire').keys, ['effects.fire', 'effects.elements', 'effects.lightning', 'effects.ice', 'effects.particles']);
  assert.deepEqual(PAGES.find((p) => p.id === 'picture').keys, ['effects.render', 'effects.impact', 'effects.fireflies', 'effects.cursor']);
  for (const p of look.slice(0, 4)) assert.equal(p.preview, true, `${p.id}: the live preview`);
  // Every effects section on exactly one page.
  const placed = PAGES.flatMap((p) => p.keys).filter((k) => k.startsWith('effects.')).map((k) => k.slice(8)).sort();
  assert.deepEqual(placed, Object.keys(DEFAULT_EFFECTS).sort());
  assert.equal(PAGE_ALIASES.effects, 'colors');
  assert.equal(new Set(PAGES.map((p) => p.id)).size, PAGES.length);
  assert.equal(LABELS['effects.render'], 'Pixel art');
  assert.equal(LABELS['effects.impact'], 'Hits');
  assert.equal(LABELS['effects.flames'], 'Flame Colors');
  assert.equal(LABELS['effects.colors'], 'Place Colors');
});

test('the shared settings carry the names and help Bonfire Live and the Painter use', () => {
  for (const [path, label] of Object.entries(adminLabels())) assert.equal(LABELS[path], label, path);
  for (const [path, help] of Object.entries(adminHelp())) assert.equal(HELP[path], help, path);
  assert.equal(LABELS['effects.fire.fps'], 'Flame Frame Rate');
  assert.equal(LABELS['effects.fire.glow'], 'Firelight');
  assert.equal(LABELS['effects.render.pixelSizeSmall'], 'Pixel Size On Phones');
});

test('every Interface text has a real name and its place, and a hint where it isn’t obvious', () => {
  const ui = [...Object.keys(content().ui), ...NEW_UI];
  for (const k of ui) {
    const label = LABELS[`ui.${k}`];
    assert.ok(label, `ui.${k}: a label of its own (not one made from its key)`);
  }
  const unhelped = ui.filter((k) => !HELP[`ui.${k}`]);
  assert.ok(unhelped.length <= 12, `most have help (none: ${unhelped.join(', ')})`);
  const groups = subgroupsOf('ui', ui);
  assert.deepEqual(groups.map((g) => g.label), ['Header & menu', 'Inventory & projects', 'Render settings', 'Pack', 'Key prompts'], 'nothing left for More');
  assert.ok(groups.find((g) => g.label === 'Pack').keys.includes('packSwords'));
  assert.ok(groups.find((g) => g.label === 'Pack').keys.includes('packMapVerb'));
  assert.deepEqual(groups.find((g) => g.label === 'Render settings').keys, ['renderMenu', 'renderReset']);
  const render = subgroupsOf('effects.render', Object.keys(DEFAULT_EFFECTS.render));
  assert.deepEqual(render.map((g) => g.label), SUBGROUPS['effects.render'].map((g) => g.label));
  assert.deepEqual(render.flatMap((g) => g.keys).sort(), Object.keys(DEFAULT_EFFECTS.render).sort());
});

test('labels in Title Case; help a sentence or two that isn’t the label, longer text under More', () => {
  for (const [k, label] of Object.entries(LABELS)) assert.ok(titleCase(label).length <= 48, `${k}: a short label (“${label}”)`);
  for (const [k, text] of Object.entries(HELP)) {
    const help = resolveHelp(text, {});
    assert.ok(help.length >= 12 && help.length <= 160, `${k}: ${help.length} characters (“${help.slice(0, 60)}…”)`);
    assert.doesNotMatch(help, /\{\{|\}\}/, `${k}: every name filled in`);
    if (LABELS[k]) assert.notEqual(help.toLowerCase(), titleCase(LABELS[k]).toLowerCase(), `${k}: more than its label`);
  }
  for (const k of ['effects.knight', 'effects.knight.style', 'effects.lightning', 'effects.ice', 'effects.elements', 'scenes', 'weaponDraw', 'effects.cursor.mode']) {
    assert.ok(moreFor(k).length > 40, `${k}: its longer explanation under More`);
  }
  assert.match(moreFor('effects.knight.style'), /Smooth Steel/);
});

test('help naming another page or section follows a rename; values come from the draft', () => {
  const renamed = { 'page:interface': 'Site Text', startingEquipment: 'Loadout', 'page:knight': 'The Knight', 'effects.knight.show': 'Knight On' };
  const labelOf = (k) => renamed[k] ?? defaultLabel(k);
  assert.match(resolveHelp(moreFor('effects.elements'), { labelOf }), /\(Site Text › Loadout\)/);
  assert.match(resolveHelp(moreFor('effects.elements'), {}), /\(Interface › Starting Equipment\)/, 'the default names');
  assert.match(resolveHelp(HELP['hero.sceneKnight'], { labelOf }), /The Knight › Knight On/);
  const draft = content();
  draft.effects.elements.ice.name = 'Rime';
  assert.match(resolveHelp(HELP['effects.elements.ice.name'], { draft }), /Azure Rime/);
  assert.match(resolveHelp(HELP['effects.elements.ice.name'], {}), new RegExp(`Azure ${DEFAULT_EFFECTS.elements.ice.name}`));
});

test('pixel sizes are the ones the menus offer (2, 3, 4, 6, 8), plus content’s own if it’s another', () => {
  const d = content();
  for (const key of ['pixelSize', 'pixelSizeSmall']) {
    assert.deepEqual(SELECTS[`effects.render.${key}`](d).map((o) => o.value), PIXEL_SIZES, key);
    assert.deepEqual(SELECTS[`effects.render.${key}`](d).map((o) => o.label), PIXEL_SIZES.map((n) => `${n} px`));
  }
  d.effects.render.pixelSize = 5;
  const odd = SELECTS['effects.render.pixelSize'](d);
  assert.deepEqual(odd.map((o) => o.value), [2, 3, 4, 5, 6, 8], 'an older 5 still shows');
  assert.match(odd.find((o) => o.value === 5).label, /not in the menus/);
});

test('Reset: a section back to the defaults; Flame Colors keeps the palettes you made', () => {
  const c = content();
  const own = c.effects.flames.filter((f) => !DEFAULT_EFFECTS.flames.some((d) => d.id === f.id));
  assert.ok(own.length >= 1, 'the content has palettes of its own');
  c.effects.flames[0].mid = '#123456';
  c.effects.flames.splice(1, 1); // a built-in deleted
  const r = resetSection('flames', c.effects.flames, DEFAULT_EFFECTS.flames);
  assert.deepEqual(r.value.slice(0, DEFAULT_EFFECTS.flames.length), DEFAULT_EFFECTS.flames, 'the built-ins as shipped, the deleted one back');
  assert.deepEqual(r.value.slice(DEFAULT_EFFECTS.flames.length), own, 'yours kept, unchanged, after them');
  assert.equal(r.kept, own.length);
  assert.notEqual(r.value[0], DEFAULT_EFFECTS.flames[0], 'a copy, not the defaults themselves');
  c.effects.flames = r.value;
  assert.deepEqual(validateContent(c).errors, [], 'still valid: the starting colors are still there');
  assert.match(resetMessage('Flame Colors', r), new RegExp(`Your ${own.length} own palette`));
  const fire = resetSection('fire', { ...DEFAULT_EFFECTS.fire, size: 0.6 }, DEFAULT_EFFECTS.fire);
  assert.deepEqual(fire.value, DEFAULT_EFFECTS.fire);
  assert.equal(resetMessage('Fire', fire), '“Fire” is back to the defaults.');
});
