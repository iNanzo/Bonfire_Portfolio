import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, validateContent } from '../../src/contentRules.js';
import { DEFAULT_EFFECTS, RANGES } from '../../src/effectsDefaults.js';
import { resolveEffects } from '../../src/effects.js';
import { titleCase } from '../ui/text.js';

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
const paths = (c) => validateContent(c).errors.map((e) => e.path);

test('the saved content passes, and its effects are the defaults', () => {
  const c = content();
  assert.deepEqual(validateContent(c).errors, []);
  assert.deepEqual(resolveEffects(c.effects), DEFAULT_EFFECTS);
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

test('hidden images: a project needs at least one visible image', () => {
  const c = content();
  for (const im of c.projects[0].images) im.hidden = true;
  assert.deepEqual(paths(c), ['projects[0].images']);
  c.projects[0].images[1].hidden = false;
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
