import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, validateContent } from '../../src/contentRules.js';
import { DEFAULT_EFFECTS, RANGES } from '../../src/effectsDefaults.js';
import { resolveEffects } from '../../src/effects.js';
import { drawElement, elements, flameTitle } from '../../src/elements.js';
import { titleCase } from '../ui/text.js';

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
const paths = (c) => validateContent(c).errors.map((e) => e.path);

/** Every setting's path in an effects object (flames count as one list). */
const shape = (o, at = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? shape(v, `${at}${k}.`) : [`${at}${k}`])).sort();

test('the saved content passes, and its effects spell out every setting', () => {
  const c = content();
  assert.deepEqual(validateContent(c).errors, []);
  // Tuned in the admin, so the values differ from the defaults, but nothing is missing.
  assert.deepEqual(shape(c.effects), shape(DEFAULT_EFFECTS));
});

test('every default flame keeps its text color readable', () => {
  for (const f of DEFAULT_EFFECTS.flames) assert.ok(contrast(f.hi, DEFAULT_EFFECTS.colors.void) >= 4.5, f.id);
});

test('flame rules: colors, contrast, unique ids, enough in rotation', () => {
  const c = content();
  c.effects.flames[0].hi = '#302020';
  c.effects.flames[1].mid = 'orange';
  c.effects.flames[2].id = c.effects.flames[3].id;
  assert.deepEqual(paths(c).sort(), ['effects.flames[0].hi', 'effects.flames[1].mid', 'effects.flames[3].id'].sort());

  const d = content();
  d.effects.flames.forEach((f, i) => { if (i > 1) f.hidden = true; });
  assert.deepEqual(paths(d), ['effects.flames']);
});

test('the starting flame must exist; a hidden one is fine', () => {
  const c = content();
  c.startingEquipment.flame = 'nope';
  assert.deepEqual(paths(c), ['startingEquipment.flame']);
  const d = content();
  d.effects.flames.find((f) => f.id === d.startingEquipment.flame).hidden = true;
  assert.deepEqual(paths(d), []);
});

test('numbers stay inside their ranges; unknown settings are refused', () => {
  const c = content();
  c.effects.fire.size = RANGES['fire.size'][1] + 1;
  c.effects.fireflies.lit = c.effects.fireflies.count + 1;
  c.effects.render.ditherMatrix = 5;
  c.effects.cursor.mode = 'laser';
  c.effects.fire.bogus = 1;
  assert.deepEqual(paths(c).sort(), ['effects.cursor.mode', 'effects.fire.bogus', 'effects.fire.size', 'effects.fireflies.lit', 'effects.render.ditherMatrix'].sort());
});

test('missing effect settings fall back to the defaults', () => {
  const e = resolveEffects({ fire: { size: 0.4 } });
  assert.equal(e.fire.size, 0.4);
  assert.equal(e.fire.height, DEFAULT_EFFECTS.fire.height);
  assert.deepEqual(e.flames, DEFAULT_EFFECTS.flames);
});

test('element rules: known elements, names, chances, at least one in rotation, a real starting element', () => {
  const c = content();
  c.effects.elements.plasma = { name: 'Plasma', rotation: true, weight: 1 };
  c.effects.elements.ice.weight = 9;
  c.effects.elements.lightning.name = '';
  c.effects.ice.clarity = 2;
  c.startingEquipment.element = 'wind';
  assert.deepEqual(paths(c).sort(), ['effects.elements.ice.weight', 'effects.elements.lightning.name', 'effects.elements.plasma', 'effects.ice.clarity', 'startingEquipment.element'].sort());

  const d = content();
  for (const el of Object.values(d.effects.elements)) el.rotation = false;
  assert.deepEqual(paths(d), ['effects.elements']);

  const e = content();
  delete e.startingEquipment.element; // older content: fire
  assert.deepEqual(paths(e), []);
});

test('a partial element setting keeps the rest of its defaults', () => {
  const e = resolveEffects({ elements: { ice: { weight: 3 } }, lightning: { size: 0.5 } });
  assert.equal(e.elements.ice.weight, 3);
  assert.equal(e.elements.ice.name, DEFAULT_EFFECTS.elements.ice.name);
  assert.deepEqual(e.elements.fire, DEFAULT_EFFECTS.elements.fire);
  assert.equal(e.lightning.size, 0.5);
  assert.equal(e.lightning.filaments, DEFAULT_EFFECTS.lightning.filaments);
});

test('the fire is named for its flame color and element', () => {
  assert.equal(flameTitle('Azure Flame', 'fire'), 'Azure Flame');
  assert.equal(flameTitle('Azure Flame', 'lightning'), 'Azure Lightning');
  assert.equal(flameTitle('Ember Flame', 'ice'), 'Ember Frost');
  assert.equal(flameTitle('Moonlight', 'fire'), 'Moonlight');
  assert.equal(flameTitle('Moonlight', 'ice'), 'Moonlight Frost');
  assert.equal(flameTitle('Azure Flame', 'nope'), 'Azure Flame');
});

test('element draws follow the weights and skip elements out of rotation', () => {
  const saved = structuredClone(elements);
  try {
    Object.assign(elements.fire, { rotation: true, weight: 1 });
    Object.assign(elements.lightning, { rotation: true, weight: 3 });
    Object.assign(elements.ice, { rotation: false, weight: 5 });
    const counts = { fire: 0, lightning: 0, ice: 0 };
    for (let i = 0; i < 400; i++) counts[drawElement('fire', () => (i + 0.5) / 400)]++;
    assert.deepEqual(counts, { fire: 100, lightning: 300, ice: 0 });
    for (const id of ['fire', 'lightning']) elements[id].rotation = false;
    assert.equal(drawElement('ice'), 'ice'); // nothing in rotation: the fallback
  } finally {
    for (const id of Object.keys(saved)) elements[id] = saved[id];
  }
});

test('hidden images: a project needs at least one visible image', () => {
  const c = content();
  const i = c.projects.findIndex((p) => p.images.length > 1); // (one with two or more to switch between)
  for (const im of c.projects[i].images) im.hidden = true;
  assert.deepEqual(paths(c), [`projects[${i}].images`]);
  c.projects[i].images[1].hidden = false;
  assert.deepEqual(paths(c), []);
});

test('admin label overrides are short text', () => {
  const c = content();
  c.admin = { labels: { 'page:effects': 'Fire & Effects', featured: 'x'.repeat(61) } };
  assert.deepEqual(paths(c), ['admin.labels.featured']);
});

test('title case capitalizes every word except articles', () => {
  assert.equal(titleCase('leadership & earlier work'), 'Leadership & Earlier Work');
  assert.equal(titleCase('the problem with a plan'), 'The Problem With a Plan');
  assert.equal(titleCase('pixel size (small screens)'), 'Pixel Size (Small Screens)');
  assert.equal(titleCase('convert to WebP'), 'Convert To WebP');
});
