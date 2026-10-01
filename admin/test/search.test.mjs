// Going to a field (admin/ui/search.js): its page, and the cards to open on the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageById, revealPlan } from '../ui/search.js';

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));

test('going to a result: its page, and every card on the way opened', () => {
  const draft = content();
  const i = draft.projects.findIndex((p) => p.images?.length);
  const plan = revealPlan(draft, `projects[${i}].images[0].alt`);
  assert.equal(plan.page.id, 'projects');
  assert.ok(plan.opens.includes(draft.projects[i]), 'its project’s card');
  assert.ok(plan.opens.includes(draft.projects[i].images[0]));
  assert.equal(revealPlan(draft, 'effects.render.dither').page.id, 'picture');
  assert.equal(revealPlan(draft, 'effects.flames[2].hi').page.id, 'colors');
  assert.ok(revealPlan(draft, 'effects.flames[2].hi').opens.includes(draft.effects.flames[2]), 'the flame’s card');
  assert.equal(revealPlan(draft, 'effects.knight.style').page.id, 'knight');
  assert.equal(revealPlan(draft, 'ui.packMapVerb').page.id, 'interface');
  assert.equal(revealPlan(draft, 'scenes[1].music').page.id, 'scenes');
  assert.equal(revealPlan(draft, 'effects.bogus').page.id, 'colors', 'an effects path no page names');
  assert.equal(pageById('effects').id, 'colors', '#effects still opens (on Colors)');
  assert.equal(pageById('nope'), null);
});
