// The admin's search (admin/ui/search.js): the index of every page's fields built from the
// draft, how results rank, the line shown under each, and what going to a result takes
// (its page, the cards to open). The box itself is tried in a browser: e2e/admin.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.document ??= /** @type {any} */ ({ createElement: () => { throw new Error('no DOM in these tests'); } });
const { buildIndex, crumbsOf, matcherFor, pageById, pageOf, revealPlan, snippetOf } = await import('../ui/search.js');
const { PAGES } = await import('../ui/schema.js');

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
const top = (draft, query, n = 1) => matcherFor(buildIndex(draft))(query).slice(0, n).map((h) => h.entry.admin.id);
const entry = (index, id) => index.find((e) => e.id === id);

test('the index holds every page’s sections, groups, entries and fields, each on its page', () => {
  const draft = content();
  const index = buildIndex(draft);
  const ids = new Set(index.map((e) => e.id));
  assert.equal(ids.size, index.length, 'one entry per path');
  for (const p of PAGES) for (const key of p.keys) if (draft[key.split('.')[0]] !== undefined) assert.ok(ids.has(key), `${key}: its section`);
  for (const e of index) assert.equal(pageOf(e.id).id, e.page, `${e.id} is on ${e.page}`);
  const dither = entry(index, 'effects.render.dither');
  assert.equal(dither.page, 'picture');
  assert.deepEqual(crumbsOf(dither), ['Picture', 'Pixel Art'], 'Page › Group (its sub-group repeats its section, so once)');
  assert.equal(dither.label, 'Dither');
  assert.ok(dither.keywords.includes('bayer'), 'the settings map’s search words');
  assert.deepEqual(crumbsOf(entry(index, 'effects.knight.style')), ['Knight', 'Armor']);
  assert.deepEqual(crumbsOf(entry(index, 'ui.packMapVerb')), ['Interface', 'Interface Text', 'Pack']);
  // A list entry by its title, and its fields under it.
  const i = draft.projects.findIndex((p) => p.problem);
  assert.equal(entry(index, `projects[${i}]`).label, draft.projects[i].name);
  assert.ok(crumbsOf(entry(index, `projects[${i}].problem`)).includes(draft.projects[i].name));
  // A scene's card: its name, id and music, not its ~80 settings.
  assert.ok(entry(index, 'scenes[0].name'));
  assert.equal(entry(index, 'scenes[0].look.name'), undefined);
  // Long text (a summary, a paragraph) isn't searched by its words; short text is.
  assert.equal(entry(index, 'ui.packMapVerb').value, 'Fast Travel');
  assert.equal(entry(index, 'about.paragraphs[0]').value, '');
});

test('fields go by the names their page shows: an image’s, the featured project’s, the weapons’', () => {
  const draft = content();
  const index = buildIndex(draft);
  const i = draft.projects.findIndex((p) => p.images?.length);
  assert.equal(entry(index, `projects[${i}].images[0].alt`).label, 'Alt Text (Describe It)');
  assert.equal(entry(index, `projects[${i}].images[0].pixel`).label, 'Pixel Art (Keep It Crisp)', 'a switch, on or off');
  assert.equal(entry(index, `projects[${i}].images[0].video`).label, 'Video Clip');
  assert.match(top(draft, 'alt text')[0], /\.images\[\d+\]\.alt$/);
  assert.match(top(draft, 'crisp')[0], /\.images\[\d+\]\.pixel$/);
  assert.match(top(draft, 'video clip')[0], /\.images\[\d+\]\.video$/);
  assert.equal(entry(index, 'featured.built').label, 'What I Built', 'the featured project’s fields named as any project’s');
  assert.equal(entry(index, 'weapons.flambergezwei').label, draft.weapons.flambergezwei);
  assert.equal(entry(index, 'site.links.linkedin').label, 'LinkedIn');
  assert.equal(entry(index, 'notFound.cta').label, 'Button Text');
});

test('results rank the label first: dither, Fast Travel, a typo, a choice, a renamed page', () => {
  const draft = content();
  assert.deepEqual(top(draft, 'dither', 2), ['effects.render.dither', 'effects.render.ditherMatrix']);
  assert.equal(top(draft, 'Fast Travel')[0], 'ui.packMapVerb', 'a short text value counts');
  assert.equal(top(draft, 'exposre')[0], 'effects.render.exposure', 'a letter off');
  assert.equal(top(draft, 'edge glow')[0], 'effects.knight.rim', 'the shared name');
  assert.equal(top(draft, 'smooth steel')[0], 'effects.knight.style', 'a dropdown’s choices');
  assert.equal(top(draft, 'brightness')[0], 'effects.fire.brightness');
  assert.ok(top(draft, 'strobe', 10).includes('effects.lightning.flicker'), 'a search word');
  assert.deepEqual(top(draft, ''), [], 'nothing typed, nothing found');
  assert.deepEqual(top(draft, 'zzqx'), []);
  const renamed = content();
  renamed.admin = { labels: { 'page:picture': 'Rendering', 'effects.render': 'The Pixels' } };
  const dither = entry(buildIndex(renamed, { labelOf: (k) => renamed.admin.labels[k] ?? (k === 'page:picture' ? 'Picture' : k) }), 'effects.render.dither');
  assert.equal(dither.pageLabel, 'Rendering', 'a page renamed with ✎ is found by its new name');
});

test('the line under a result: the value that matched, else the help, marked and escaped', () => {
  const draft = content();
  const index = buildIndex(draft);
  const [hit] = matcherFor(index)('fast travel');
  assert.equal(snippetOf(hit), '“<mark>Fast</mark> <mark>Travel</mark>”');
  const [d] = matcherFor(index)('dither');
  assert.match(snippetOf(d), /^How much/, 'the help when the value didn’t match');
  draft.projects[0].name = '<img src=x onerror=alert(1)>';
  draft.projects[0].kind = 'Unity & <b>C#</b>';
  const evil = matcherFor(buildIndex(draft))('img');
  assert.ok(evil.length);
  for (const h of evil) assert.doesNotMatch(snippetOf(h), /<(img|b)\b/, 'imported text is text');
  const kind = matcherFor(buildIndex(draft))('unity').find((h) => h.entry.admin.id === 'projects[0].kind');
  assert.match(snippetOf(kind), /^“<mark>Unity<\/mark> &amp; &lt;b&gt;C#&lt;\/b&gt;”$/);
});

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
