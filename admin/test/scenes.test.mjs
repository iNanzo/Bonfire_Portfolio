// content.json's `scenes` (Bonfire Live's built-in preset scenes, made in the Painter):
// optional like `admin`, checked in full when it's there, with paths the admin can show
// in place (scenes[1].look.name); and the API refuses a save with a bad scene (422).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTIONS, validateContent } from '../../src/contentRules.js';
import { defaultScene, MAX_SCENES } from '../../src/scenes.js';
import { handleApi } from '../server/api.js';
import { HttpError } from '../server/errors.js';
import { gitBlobSha, utf8 } from '../server/bytes.js';

const TEXT = readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8');
const content = () => JSON.parse(TEXT);
const scenePaths = (c) => validateContent(c).errors.map((e) => e.path).filter((p) => p.startsWith('scenes')).sort();
const withScenes = (...scenes) => ({ ...content(), scenes });

test('scenes are optional, and not a required section', () => {
  const c = content();
  delete c.scenes;
  assert.deepEqual(validateContent(c).errors, []);
  assert.equal(SECTIONS.includes('scenes'), false, 'not required, and out of the commit summary’s section list');
  assert.deepEqual(validateContent(withScenes()).errors, [], 'an empty list is fine');
  assert.deepEqual(validateContent(withScenes(defaultScene('Frozen Shrine'), { ...defaultScene('Forge Rave'), hidden: true })).errors, []);
});

test('a bad scene is reported at its path', () => {
  const two = defaultScene('Two');
  two.look.name = 'disco';
  two.camera.fov = 200;
  assert.deepEqual(scenePaths(withScenes(defaultScene('One'), two)), ['scenes[1].camera.fov', 'scenes[1].look.name']);
  const bad = defaultScene('Bad');
  bad.hidden = 'yes';
  bad.layers = { paint: 'on', wash: 'on' };
  bad.knights.count = 2;
  assert.deepEqual(scenePaths(withScenes(bad)), ['scenes[0].hidden', 'scenes[0].knights.helmets', 'scenes[0].layers.wash']);
  assert.deepEqual(scenePaths({ ...content(), scenes: { one: defaultScene() } }), ['scenes']);
  assert.deepEqual(scenePaths(withScenes('nope')), ['scenes[0]']);
});

test('ids are unique; at most MAX_SCENES', () => {
  const { errors } = validateContent(withScenes(defaultScene('Twin'), defaultScene('Other'), defaultScene('Twin')));
  assert.deepEqual(errors.map((e) => e.path), ['scenes[2].id']);
  assert.match(errors[0].message, /already used by “Twin”/);
  const many = Array.from({ length: MAX_SCENES + 1 }, (_, i) => defaultScene(`Scene ${i}`));
  assert.deepEqual(scenePaths(withScenes(...many)), ['scenes']);
  assert.deepEqual(scenePaths(withScenes(...many.slice(0, MAX_SCENES))), []);
});

test('a scene on the site’s own scenery colors reads against the site’s void', () => {
  const s = defaultScene('Grey');
  s.colors.flame.hi = '#8a8a8a';
  assert.deepEqual(scenePaths(withScenes(s)), []);
  const c = withScenes(s);
  c.effects.colors.void = '#4a4a4a';
  assert.deepEqual(scenePaths(c), ['scenes[0].colors.flame.hi']);
  // With colors of its own, its own void counts.
  s.colors.scenery = { void: '#000000', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };
  assert.deepEqual(scenePaths(c), []);
});

// The API, on an in-memory store holding the real content.json (as api.test.mjs).
function memoryStore() {
  const files = new Map([['src/content.json', utf8(TEXT)]]);
  const commits = [];
  return {
    files, commits, mode: 'test', label: 'memory',
    async read(p) { const b = files.get(p); if (!b) throw new HttpError(404, 'missing'); return { text: new TextDecoder().decode(b), sha: await gitBlobSha(b) }; },
    async readBytes(p) { const b = files.get(p); if (!b) throw new HttpError(404, 'missing'); return b; },
    async commit({ files: fs, deletes, message }) {
      commits.push({ files: fs.map((f) => f.path), deletes, message });
      for (const f of fs) files.set(f.path, f.bytes);
      return { commit: { sha: 'f'.repeat(40), url: 'u' }, contentSha: await gitBlobSha(files.get('src/content.json')) };
    },
    async deployStatus() { return { state: 'live' }; },
  };
}
const ORIGIN = 'https://admin.test';
const call = async (store, method, path, body) => {
  const res = await handleApi(new Request(ORIGIN + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Origin: ORIGIN } : {},
    body: body ? JSON.stringify(body) : undefined,
  }), { store, user: { email: 'me@gmail.com' }, siteUrl: 'https://site.test/' });
  return { status: res.status, data: await res.json() };
};

test('the API refuses a bad scene (422, with paths) and saves a good one', async () => {
  const store = memoryStore();
  const { content: c, sha } = (await call(store, 'GET', '/api/content')).data;
  const bad = defaultScene('Broken');
  bad.place.scenery = 'moon';
  c.scenes = [defaultScene('Fine'), bad];
  const refused = await call(store, 'POST', '/api/save', { baseSha: sha, content: c });
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.data.errors.map((e) => e.path), ['scenes[1].place.scenery']);
  assert.equal(store.commits.length, 0);

  c.scenes[1].place.scenery = 'shrine';
  const saved = await call(store, 'POST', '/api/save', { baseSha: sha, content: c, message: 'Edit scenes' });
  assert.equal(saved.status, 200);
  const stored = JSON.parse(new TextDecoder().decode(store.files.get('src/content.json')));
  assert.deepEqual(stored.scenes.map((s) => s.id), ['fine', 'broken']);
});

// The admin's Scenes page (schema.js, sceneTools.js): a page of its own, Title Case labels
// with hints, a new scene is the Painter's default one, and scenes from the Painter come in
// (new ones at the end; one with an id already here replaces it if you confirm, keeping its
// place and its loop switch, else comes in as a copy).
test('the Scenes page: its labels, hints, the With the Music choices and a new scene', async () => {
  const { PAGES, LABELS, HELP, SELECTS, TEMPLATES, ADD_LABELS, hint, moreFor } = await import('../ui/schema.js');
  const { titleCase } = await import('../ui/text.js');
  const { MUSIC, validateScene } = await import('../../src/scenes.js');
  const page = PAGES.find((p) => p.id === 'scenes');
  assert.deepEqual(page?.keys, ['scenes']);
  assert.equal(page.group, 'Look & feel');
  assert.equal(PAGES[PAGES.indexOf(page) - 1].id, 'knight', 'after the four effects pages');
  assert.ok(!page.preview, 'no live preview: Open in Painter is its preview');
  assert.match(page.blurb, /Painter/);
  assert.match(moreFor('scenes'), /Replace From Painter/, 'the longer story under More');
  for (const key of ['scenes', 'scenes[].name', 'scenes[].id', 'scenes[].music']) {
    assert.ok(LABELS[key], `${key}: a label`);
    assert.equal(LABELS[key], titleCase(LABELS[key]), `${key}: Title Case`);
    assert.ok(HELP[key]?.length >= 20 && HELP[key].length <= 160, `${key}: a hint, short`);
  }
  assert.deepEqual(SELECTS['scenes[].music']().map((o) => o.value), Object.keys(MUSIC));
  assert.deepEqual(SELECTS['scenes[].music']().map((o) => o.label), ['Hold the Scene', 'Start From the Scene']);
  assert.equal(ADD_LABELS.scenes, 'scene');
  const made = hint(TEMPLATES, 'scenes')();
  assert.equal(made.id, '', 'its id follows its name until you edit it');
  made.id = 'new-scene';
  const errs = [];
  validateScene(made, (p, m) => errs.push([p, m]));
  assert.deepEqual(errs, [], 'a new scene is a valid one');
});

test('importing from the Painter: new scenes join the loop, a same-id one replaces it or comes in as a copy', async () => {
  const { importScenes } = await import('../ui/sceneTools.js');
  const kept = { ...defaultScene('Frozen Shrine'), hidden: true };
  const ctx = { draft: { ...content(), scenes: [defaultScene('Forge Rave'), kept] } };
  const shrine = defaultScene('Frozen Shrine');
  shrine.place.scenery = 'shrine';
  const asks = [];
  // Replace: it takes the old one's place and stays out of the loop.
  let r = importScenes([shrine, defaultScene('Moonlit Ruins')], ctx, { confirm: (m) => { asks.push(m); return true; } });
  assert.deepEqual(r, { added: 1, replaced: 1 });
  assert.equal(asks.length, 1);
  assert.match(asks[0], /Frozen Shrine/);
  assert.deepEqual(ctx.draft.scenes.map((s) => s.id), ['forge-rave', 'frozen-shrine', 'moonlit-ruins']);
  assert.equal(ctx.draft.scenes[1].place.scenery, 'shrine');
  assert.equal(ctx.draft.scenes[1].hidden, true, 'the loop switch is the admin’s, kept');
  // Declined: it comes in as a copy with its own id.
  r = importScenes([defaultScene('Forge Rave')], ctx, { confirm: () => false });
  assert.deepEqual(r, { added: 1, replaced: 0 });
  assert.equal(ctx.draft.scenes.length, 4);
  assert.notEqual(ctx.draft.scenes[3].id, 'forge-rave');
  assert.deepEqual(validateContent(ctx.draft).errors, [], 'what came in validates');
  // No scenes yet: the list starts.
  const empty = { draft: content() };
  delete empty.draft.scenes;
  importScenes([defaultScene('One')], empty);
  assert.deepEqual(empty.draft.scenes.map((s) => s.id), ['one']);
});

test('a scene card says what the scene holds, part by part', async () => {
  const { sceneDetails, sceneMeta } = await import('../ui/sceneTools.js');
  const s = defaultScene('Frozen Shrine');
  s.place = { scenery: 'shrine', weapon: 'katana', element: 'ice' };
  s.camera.move = { kind: 'still', amount: 0, bars: 4 };
  s.layers = { glow: 'on', grain: 'mix' };
  const rows = Object.fromEntries(sceneDetails(s, { katana: 'Katana' }));
  assert.deepEqual(Object.keys(rows), ['Place', 'Camera', 'Look', 'Drops', 'Knights', 'Fireflies', 'Render']);
  assert.match(rows.Place, /Shrine · Katana · Ice/);
  assert.match(rows.Camera, /^Still · a 32° lens$/);
  assert.match(rows.Look, /with .*· .* in the mix/);
  assert.ok(Object.values(rows).every((v) => typeof v === 'string' && v.length > 2 && !/undefined|null/.test(v)));
  // The Render line names a fixed palette in the line's own case, the whole name.
  s.render = { ...s.render, pixelSize: 3, palette: 'ashen', fog: 'thick' };
  assert.equal(Object.fromEntries(sceneDetails(s)).Render, '3 px pixel size · ashen (3 colors) · thick fog');
  s.render.palette = 'flame';
  assert.match(Object.fromEntries(sceneDetails(s)).Render, /· the flame’s colors ·/);
  assert.match(sceneMeta(s), /The Shrine/);
  assert.equal(sceneMeta(null), sceneMeta(undefined), 'never throws on junk');
});
