// The site's discoveries (src/ui/discoveries.js) as the rest menu lists them: each a title
// in Title Case (the menus' rule, src/text.js) with a hint written as a sentence, and the
// ones the menu's tools give pointing at the menu. (Counting them, and leaving out the
// knight's where he can't come, is in test/site.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveries } from '../src/ui/discoveries.js';
import { titleCase } from '../src/text.js';

const fixed = () => createDiscoveries().list.filter((d) => !d.id.startsWith('project:'));

test('discoveries: unique ids, Title Case names, sentence hints', () => {
  const list = createDiscoveries().list;
  assert.equal(new Set(list.map((d) => d.id)).size, list.length, 'ids are unique (they are what’s stored)');
  for (const d of fixed()) {
    assert.equal(titleCase(d.name), d.name, `${d.id}: "${d.name}" in Title Case`);
    assert.match(d.hint, /^[A-Z].*[.?!]$/, `${d.id}: the hint is a sentence`);
    assert.ok(d.hint.length <= 160, `${d.id}: a short hint`);
  }
  // (A project's is "Inspected <its name>": the name is the content's own.)
  assert.ok(list.filter((d) => d.id.startsWith('project:')).every((d) => d.name.startsWith('Inspected ')));
});

test('discoveries: the words match the menus (Living Weapon, How It’s Made, Flame Colors), and the render settings’ hint points at the menu', () => {
  const byId = Object.fromEntries(fixed().map((d) => [d.id, d]));
  assert.equal(byId.flourish.name, 'The Living Weapon');
  assert.equal(byId.breakdown.name, 'How It’s Made');
  assert.equal(byId.palettes.name, 'Every Flame Color');
  assert.match(byId.render.hint, /press P/i);
  assert.match(byId.render.hint, /menu/i, 'touch screens have no P: the menu has it');
  assert.match(byId.photo.hint, /menu/i);
});
