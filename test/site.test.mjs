// The site shell: routes (src/routes.js), safe links and escaping (src/html.js), and the
// page templates (src/render.js) on the real content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routePath, readRoute, isEditing } from '../src/routes.js';
import { esc, isSafeUrl, assetUrl } from '../src/html.js';
import * as render from '../src/render.js';
import { screens, items, projects, featured } from '../src/content.js';

const HOME = { screen: 'home', item: null };

test('routes: every screen and shown project round-trips', () => {
  for (const blank of ['', '#', '#/', '/']) assert.deepEqual(parseRoute(blank), HOME);
  for (const { id } of screens) {
    const route = parseRoute(id);
    assert.equal(route.screen, id);
    assert.deepEqual(parseRoute(routePath(route).slice(1)), route);
    assert.deepEqual(parseRoute(`#/${id}/`), route, 'legacy hash links still work');
  }
  for (const { id } of items()) {
    const route = parseRoute(`projects/${id}`);
    assert.deepEqual(route, { screen: 'projects', item: id });
    assert.equal(routePath(route, '/repo/'), `/repo/projects/${id}/`);
  }
});

test('routes: anything else falls back safely', () => {
  assert.deepEqual(parseRoute('nowhere'), HOME);
  assert.deepEqual(parseRoute('projects/a/b'), HOME, 'too deep');
  assert.deepEqual(parseRoute('constructor'), HOME, 'no inherited object names');
  assert.deepEqual(parseRoute('projects/__proto__'), { screen: 'projects', item: null });
  assert.deepEqual(parseRoute('projects/not-a-project'), { screen: 'projects', item: null });
  const hidden = projects.find((p) => p.hidden);
  if (hidden) assert.equal(parseRoute(`projects/${hidden.id}`).item, null, 'hidden projects open the inventory');
  assert.deepEqual(parseRoute('about/extra'), { screen: 'about', item: null }, 'only projects take an item');
});

test('routes: reading the address bar', () => {
  assert.deepEqual(readRoute({ hash: '', pathname: '/repo/skills/' }, '/repo/'), { screen: 'skills', item: null });
  assert.deepEqual(readRoute({ hash: '', pathname: '/repo/index.html' }, '/repo/'), HOME);
  assert.deepEqual(
    readRoute({ hash: '#/contact', pathname: '/repo/' }, '/repo/'),
    { screen: 'contact', item: null },
    'a legacy hash wins once',
  );
  assert.deepEqual(
    readRoute({ hash: '#main', pathname: '/about/' }),
    { screen: 'about', item: null },
    'the skip link is not a route',
  );
  assert.deepEqual(
    readRoute({ hash: '#how-its-made', pathname: '/projects/portfolio/' }),
    { screen: 'projects', item: 'portfolio' },
    'the breakdown link is not a route',
  );
  assert.deepEqual(readRoute({ hash: '', pathname: '/elsewhere/skills/' }, '/repo/'), HOME, 'outside the base');
  const within = (sel) => ({ closest: (s) => (s.includes(sel) ? {} : null) });
  assert.equal(isEditing(within('input')), true);
  assert.equal(isEditing(within('nothing')), false);
  assert.equal(isEditing(null), false);
  const focused = (tagName, type) => ({ closest: () => ({ tagName, type }) });
  assert.equal(isEditing(focused('INPUT', 'text')), true);
  assert.equal(isEditing(focused('TEXTAREA', 'textarea')), true);
  for (const type of ['radio', 'checkbox', 'button'])
    assert.equal(
      isEditing(focused('INPUT', type)),
      false,
      `a focused ${type} keeps the page's keys (the breakdown's views)`,
    );
});

test('content: the Portfolio project takes this page apart (not Bonfire Live any more)', () => {
  const portfolio = items().find((p) => p.id === 'portfolio');
  assert.ok(portfolio, 'the Portfolio is in the inventory');
  assert.ok(
    portfolio.links.some((l) => l.href === '#how-its-made'),
    'its link opens the breakdown',
  );
  assert.ok(
    portfolio.images.length >= 1 && portfolio.images.every((im) => im.alt?.length >= 15),
    'screenshots with real alt text',
  );
  const live = items().find((p) => p.id === 'bonfire-live');
  assert.ok(!live.links.some((l) => l.href === '#how-its-made'), 'the breakdown moved off Bonfire Live');
  assert.equal(projects.at(-1).id, 'nba', 'nba stays last (admin/test/api.test.mjs)');
});

test('content: the Bonfire Painter has its own project, next to Bonfire Live, and they link each other', async () => {
  const { existsSync } = await import('node:fs');
  const painter = items().find((p) => p.id === 'bonfire-painter');
  assert.ok(painter, 'the Painter is in the inventory');
  const at = projects.findIndex((p) => p.id === 'bonfire-painter');
  assert.equal(projects[at - 1]?.id, 'bonfire-live', 'right after Bonfire Live');
  assert.ok(
    painter.links.some((l) => l.href === 'painter/'),
    'it opens the Painter',
  );
  assert.ok(
    painter.links.some((l) => l.href === 'projects/bonfire-live/'),
    'and links Bonfire Live’s project',
  );
  assert.ok(painter.images.length >= 3, 'real screenshots');
  for (const im of painter.images) {
    assert.ok(im.alt?.length >= 15 && im.caption, `${im.src}: alt text and a caption`);
    for (const file of [`${im.src}.webp`, `${im.src}-card.webp`])
      assert.ok(existsSync(new URL(`../public/${file}`, import.meta.url)), `${file} is there`);
  }
  const live = items().find((p) => p.id === 'bonfire-live');
  assert.ok(
    live.links.some((l) => l.href === 'projects/bonfire-painter/'),
    'Bonfire Live links the Painter’s project',
  );
  assert.match(live.built, /Preset Scenes/, 'and says what the Painter makes for it');
  assert.equal(projects.at(-1).id, 'nba', 'nba stays last (admin/test/api.test.mjs)');
});

test('first load: the site’s static imports carry none of Bonfire Live’s, the Painter’s or the admin’s code', async () => {
  // (What main.js reaches through static imports is what every visitor downloads before the
  // page shows: the bonfire's scene and the admin preview's content rules load on demand.
  // The content rules bring the scene format, which brings Bonfire Live's looks and tables.)
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const seen = new Set();
  const walk = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = await readFile(file, 'utf8');
    for (const m of code.matchAll(
      /^[ \t]*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|^[ \t]*import\s*['"](\.[^'"]+)['"]/gm,
    )) {
      const spec = m[1] ?? m[2];
      if (spec.endsWith('.js')) await walk(path.resolve(path.dirname(file), spec));
    }
  };
  await walk(path.join(src, 'main.js'));
  const files = [...seen].map((f) => path.relative(src, f).replaceAll('\\', '/'));
  assert.ok(files.includes('render.js') && files.includes('ui/pack.js'), 'the walk follows the site’s imports');
  for (const f of files) {
    assert.ok(!/^(visualizer|painter|larp)\//.test(f), `${f}: Bonfire Live’s, the Painter’s or the campfire game’s`);
    assert.ok(
      !['scenes.js', 'contentRules.js', 'sceneStore.js', 'scenePlayer.js'].includes(f),
      `${f}: the scene format or the content rules`,
    );
  }
});

test('html: escaping, safe links, asset paths', () => {
  assert.equal(esc(`<a href="x">Tom's & co</a>`), '&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; co&lt;/a&gt;');
  for (const ok of ['https://example.com/a?b=c', 'mailto:me@example.com', 'projects/gamex', 'assets/cv.pdf'])
    assert.ok(isSafeUrl(ok), ok);
  for (const bad of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,x',
    '//evil.com',
    '/root',
    '../up',
    'a/./b',
    'https://user:pw@example.com',
    'has space',
    'quote"d',
    '%2e%2e/x',
    'vbscript:x',
    '',
    null,
  ])
    assert.equal(isSafeUrl(bad), false, String(bad));
  assert.equal(assetUrl('assets/projects/nba/cover', '/repo/', true), '/repo/assets/projects/nba/cover-card.webp');
  assert.throws(() => assetUrl('../secrets'));
});

test('templates: every screen renders, with only safe links and escaped text', () => {
  const pages = [
    'renderChrome',
    'renderHome',
    'renderProjects',
    'renderExperience',
    'renderSkills',
    'renderAbout',
    'renderContact',
  ].map((name) => [name, render[name]()]);
  for (const [name, html] of pages) {
    assert.ok(html.length > 200, `${name} renders`);
    assert.doesNotMatch(html, /javascript:|<script/i, `${name}: nothing executable`);
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      const raw = href.replace(/&amp;/g, '&');
      assert.ok(raw.startsWith('/') || isSafeUrl(raw), `${name}: unsafe link ${href}`);
    }
  }
  const chrome = pages[0][1];
  for (const s of screens) assert.ok(chrome.includes(esc(s.label)), `the menu lists ${s.label}`);
  const inventory = render.renderProjects();
  for (const p of items()) assert.ok(inventory.includes(esc(p.name)), `the inventory shows ${p.name}`);
  assert.ok(
    render.renderHome().includes(esc(featured.name)) || inventory.includes(esc(featured.name)),
    'the featured project appears',
  );
});

test('seo: every page has its own title, description, preview and structured data; hidden ones stay out of the sitemap', async () => {
  const { pageMeta, withMeta, publicRoutes, sitemap } = await import('../src/seoPages.js');
  const template =
    '<html><head><title>x</title><meta name="description" content="x" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:type" content="website" /></head><body></body></html>';
  const titles = new Set();
  for (const route of publicRoutes()) {
    const meta = pageMeta(route);
    assert.ok(meta, `${route} has metadata`);
    assert.ok(meta.title && meta.description, `${route}: title and description`);
    titles.add(meta.title);
    const html = withMeta(template, meta);
    assert.match(html, /<link rel="canonical" href="https:\/\//, `${route}: canonical`);
    assert.match(html, /og:image" content="https:\/\/[^"]+\.jpg"/, `${route}: social image`);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)) JSON.parse(json);
    assert.doesNotMatch(html.replace(/<script type="application\/ld\+json">[^<]*<\/script>/g, ''), /<script/);
  }
  assert.equal(titles.size, publicRoutes().length, 'no two pages share a title');
  const xml = sitemap(publicRoutes());
  for (const p of projects.filter((x) => x.hidden)) assert.ok(!xml.includes(`/projects/${p.id}/`), `${p.id} is hidden`);
  for (const p of items()) assert.ok(xml.includes(`/projects/${p.id}/`), `${p.id} is listed`);
  assert.equal(pageMeta('projects/not-a-project'), null);
});

test('clips: an image entry with video plays <src>.mp4, checked like any image path', async () => {
  const { videoUrl } = await import('../src/html.js');
  assert.equal(videoUrl('assets/projects/bonfire-live/clip', '/'), '/assets/projects/bonfire-live/clip.mp4');
  assert.throws(() => videoUrl('../secret', '/'));
});

test('the knight on the site: described for screen readers, greeted with gestures, counted as discoveries', async () => {
  const { hero } = await import('../src/content.js');
  const { sceneLabel, renderHome } = await import('../src/render.js');
  assert.match(sceneLabel(true), /knight/i, 'the scene description mentions him while he’s there');
  assert.ok(sceneLabel(true).startsWith(hero.sceneLabel) && sceneLabel(true).endsWith(hero.sceneKnight));
  assert.ok(
    sceneLabel('sign').endsWith(hero.sceneSign) && /sign/i.test(sceneLabel('sign')),
    'his summon sign while he’s away',
  );
  assert.doesNotMatch(sceneLabel(false), /knight/i, 'and not when he can’t come (no model, or switched off)');
  assert.equal(sceneLabel(false), hero.sceneLabel);
  assert.match(renderHome(), new RegExp(`id="scene-label">${hero.sceneLabel.slice(0, 30)}[^<]*</p>`));
  assert.doesNotMatch(renderHome().match(/id="scene-label">([^<]*)/)[1], /knight/i, 'he isn’t there on first load');
  assert.doesNotMatch(`${hero.sceneKnight} ${hero.sceneSign}`, /black|gilt/i, 'a knight in steel plate');
  const { greeting, GESTURE_NAMES, HELMET_NAMES } = await import('../src/knightNames.js');
  assert.equal(greeting(null), 'praise', 'Praise the Sun the first time');
  let last = 'praise';
  const seen = {};
  for (let i = 0; i < 2000; i++) {
    const g = greeting(last, () => (i * 0.618034) % 1);
    assert.notEqual(g, last, 'never the same twice running');
    assert.ok(g in GESTURE_NAMES);
    seen[g] = (seen[g] ?? 0) + 1;
    last = g;
  }
  assert.deepEqual(
    Object.keys(seen).sort(),
    Object.keys(GESTURE_NAMES)
      .filter((g) => g !== 'dance')
      .sort(),
    'every gesture comes up (the Default Dance is the pack’s)',
  );
  assert.equal(GESTURE_NAMES.dance, 'Default Dance');
  assert.ok(
    Object.entries(seen).every(([g, n]) => g === 'praise' || n < seen.praise),
    'Praise the Sun most often',
  );
  assert.deepEqual(Object.keys(HELMET_NAMES), ['great', 'armet', 'bascinet']);
  const { createDiscoveries } = await import('../src/ui/discoveries.js');
  const ids = createDiscoveries().list.map((d) => d.id);
  for (const id of ['summon', 'knight', 'helm', 'style', 'painter']) assert.ok(ids.includes(id), `a discovery: ${id}`);
});

test('discoveries that can’t be found here now (no knight) leave the count, unless found before', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  try {
    const { createDiscoveries } = await import('../src/ui/discoveries.js');
    const news = [];
    const d = createDiscoveries({ onNew: (x, n, total) => news.push([x.id, n, total]) });
    const all = d.total;
    d.discover('helm');
    d.setOut(['knight', 'helm']); // (his model didn't load)
    assert.equal(d.total, all - 1, 'the unfound one leaves the total; the one found before stays');
    assert.ok(!d.list.some((x) => x.id === 'knight') && d.list.some((x) => x.id === 'helm'));
    assert.equal(d.discover('knight'), false, 'and can’t be found meanwhile');
    assert.ok(d.count <= d.total);
    d.setOut([]); // (he's back)
    assert.equal(d.total, all);
    assert.equal(d.discover('knight'), true);
    assert.deepEqual(news.at(-1), ['knight', 2, all]);
    assert.deepEqual(JSON.parse(store.get('discoveries')).sort(), ['helm', 'knight']);
  } finally {
    delete globalThis.localStorage;
  }
});

// --- Round 10: the menus, their tooltips, and the build's page metadata -----------------------

/** A tag's attribute value, however the tag is wrapped. */
const metaValue = (html, attr, name) =>
  html.match(new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`))?.[1] ?? null;

test('seo: withMeta updates every tag in the real index.html, and in a copy Prettier has wrapped', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { pageMeta, withMeta } = await import('../src/seoPages.js');
  const file = new URL('../index.html', import.meta.url);
  const source = await readFile(file, 'utf8');
  const prettier = await import('prettier');
  const formatted = await prettier.format(source, {
    ...(await prettier.resolveConfig(fileURLToPath(file))),
    parser: 'html',
  });
  // (By hand too: every attribute on its own line, whatever Prettier decides to wrap.)
  const split = source.replace(/<meta (name|property)=("[^"]*") content=/g, '<meta\n      $1=$2\n      content=');
  assert.notEqual(split, source);
  const meta = pageMeta(`projects/${items()[0].id}`);
  for (const [name, html] of [
    ['index.html', source],
    ['formatted', formatted],
    ['split', split],
  ]) {
    const out = withMeta(html, meta);
    assert.equal(out.match(/<title>([^<]*)<\/title>/)?.[1], esc(meta.title), `${name}: title`);
    assert.equal(metaValue(out, 'name', 'description'), esc(meta.description), `${name}: description`);
    assert.equal(metaValue(out, 'property', 'og:title'), esc(meta.title), `${name}: og:title`);
    assert.equal(metaValue(out, 'property', 'og:description'), esc(meta.description), `${name}: og:description`);
    assert.equal(metaValue(out, 'property', 'og:type'), 'article', `${name}: og:type`);
    assert.match(out, /<link rel="canonical" href="https:\/\/[^"]+\/projects\//, `${name}: the page's own tags added`);
    for (const [attr, tag] of [
      ['name', 'description'],
      ['property', 'og:title'],
      ['property', 'og:description'],
      ['property', 'og:type'],
    ]) {
      assert.notEqual(metaValue(out, attr, tag), metaValue(html, attr, tag), `${name}: ${tag} changed`);
    }
  }
  // A "$" in the text is just a dollar sign (not a replacement pattern).
  const odd = 'Cost $1 & $& or $' + "' and $" + '`';
  const dollars = withMeta(source, { ...meta, title: odd, description: odd });
  assert.equal(dollars.match(/<title>([^<]*)<\/title>/)?.[1], esc(odd));
  assert.equal(metaValue(dollars, 'name', 'description'), esc(odd));
});

test('the rest menu: Go To and Tools as labelled groups, the tools with their keys and tooltips', async () => {
  const { MENU_TEXT } = render;
  const { titleCase } = await import('../src/text.js');
  const { ui } = await import('../src/content.js');
  const chrome = render.renderChrome();
  const start = chrome.indexOf('<dialog class="rest-menu" data-menu');
  const dialog = chrome.slice(start, chrome.indexOf('</dialog>', start));
  const groups = [
    ...dialog.matchAll(
      /<div class="menu-group[^"]*" role="group" aria-labelledby="([^"]+)">\s*<p class="menu-group-title" id="([^"]+)">([^<]+)<\/p>/g,
    ),
  ];
  assert.deepEqual(
    groups.map((m) => m[3]),
    [MENU_TEXT.goTo, MENU_TEXT.tools],
  );
  assert.ok(
    groups.every((m) => m[1] === m[2]),
    'each group is labelled by its heading',
  );
  const [goTo, tools] = dialog.split(/<div class="menu-group" role="group"/);
  for (const s of screens) assert.ok(goTo.includes(`>${esc(s.label)}</a>`), `Go To: ${s.label}`);
  assert.match(goTo, /class="menu-group menu-go-to"/, 'Go To hides where the header has tabs (styles.css)');
  const actions = [...tools.matchAll(/data-menu-action="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(actions, ['photo', 'breakdown', 'render', 'discoveries', 'keys'], 'the tools, in order');
  assert.match(tools, /data-sound/, 'and Sound');
  for (const [action, key, kbd] of [
    ['photo', 'F', 'F'],
    ['breakdown', 'B', 'B'],
    ['render', 'P', 'P'],
    ['keys', 'Shift\\+\\?', '\\?'],
  ]) {
    assert.match(
      tools,
      new RegExp(`data-menu-action="${action}" aria-keyshortcuts="${key}"[^>]*>[^<]+ <kbd>${kbd}</kbd>`),
      `${action}: its key`,
    );
  }
  assert.match(tools, new RegExp(`>${esc(ui.renderMenu)} <kbd>P</kbd>`));
  for (const label of [
    MENU_TEXT.goTo,
    MENU_TEXT.tools,
    MENU_TEXT.keys,
    ui.photo,
    ui.breakdown,
    ui.renderMenu,
    ui.discoveries,
  ]) {
    assert.equal(titleCase(label), label, `"${label}" in Title Case`);
  }
  assert.equal((tools.match(/data-tip="/g) ?? []).length, 6, 'every tool says what it does');
  assert.match(dialog, /data-menu-close>/, 'and Close');
  assert.match(
    chrome,
    /class="pix-btn menu-toggle" type="button" data-menu-open/,
    'the Menu button (shown at every width: styles.css)',
  );
});

test('no native title tooltips on the site: the shared tooltip shows data-tip on hover, focus and tap', async () => {
  const { readFile } = await import('node:fs/promises');
  const pages = [
    'renderChrome',
    'renderHome',
    'renderProjects',
    'renderExperience',
    'renderSkills',
    'renderAbout',
    'renderContact',
  ].map((name) => render[name]());
  for (const html of pages) assert.doesNotMatch(html, /\stitle="/);
  for (const f of [
    'main.js',
    'render.js',
    'ui/pack.js',
    'ui/photo.js',
    'ui/renderMenu.js',
    'ui/breakdown.js',
    'ui/inventory.js',
    'ui/restMenu.js',
  ]) {
    const code = await readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /\stitle="|\.title = |setAttribute\('title'/, `${f}: no title attribute`);
  }
  const chrome = render.renderChrome();
  assert.match(
    chrome,
    /data-step="-1" data-tip="[^"]+\(Q\)"[^>]*aria-label="[^"]+" aria-keyshortcuts="Q"/,
    'Q: a tooltip, a name, its key',
  );
  assert.match(chrome, /class="pix-btn sound-toggle"[^>]*data-tip="/, 'Sound');
  assert.doesNotMatch(chrome, /data-tooltip|class="tooltip"/, 'the old skill tooltip is gone');
});

/**
 * Every tooltip trigger in `html` is heard as well as seen (the shared tip is aria-hidden):
 * its aria-describedby names a span with its words, or its words are just its name
 * (aria-label) and its key (aria-keyshortcuts says that).
 */
function assertTipsReadOut(html, where) {
  const words = new Map(
    [...html.matchAll(/<span (?:class="visually-hidden" )?id="([^"]+)"(?: hidden)?>([^<]*)<\/span>/g)].map(
      ([, id, text]) => [id, text],
    ),
  );
  const triggers = [...html.matchAll(/<(?:button|a)\b([^>]*\sdata-tip="([^"]*)"[^>]*)>/g)];
  assert.ok(triggers.length, `${where}: has tips`);
  for (const [, attrs, tip] of triggers) {
    const ids = attrs.match(/\saria-describedby="([^"]+)"/)?.[1].split(/\s+/) ?? [];
    if (ids.length) {
      assert.ok(
        ids.some((id) => words.get(id) === tip),
        `${where}: "${tip}" is its trigger’s description`,
      );
      continue;
    }
    const name = attrs.match(/\saria-label="([^"]*)"/)?.[1] ?? '';
    const said =
      name === tip ||
      (!!name && name.startsWith(tip.replace(/\s*\([^)]*\)$/, '')) && /\saria-keyshortcuts="/.test(attrs));
    assert.ok(said, `${where}: "${tip}" is said by its trigger’s name ("${name}")`);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `${where}: ids are unique`);
}

test('every tooltip on the site is read out too: the header, the menu, the photo toolbar, the render settings, the pack’s lists', async () => {
  assertTipsReadOut(render.renderChrome(), 'the header and the menu');
  assertTipsReadOut(render.renderProjects(), 'the projects');
  assertTipsReadOut(render.renderSkills(), 'the skills');
  const { photoBarHtml, elementHint } = await import('../src/ui/photo.js');
  for (const touch of [false, true])
    assertTipsReadOut(photoBarHtml({ touch }), `the photo toolbar${touch ? ' (touch)' : ''}`);
  // (Its Element button names the elements as the pack does: the content's names.)
  const { elements } = await import('../src/elements.js');
  assert.equal(
    elementHint(),
    `The next element, in turn: ${elements.fire.name}, ${elements.lightning.name}, ${elements.ice.name}`,
  );
  const { rowsHtml, RENDER_ROWS } = await import('../src/ui/renderMenu.js');
  assertTipsReadOut(rowsHtml(RENDER_ROWS, {}, { id: 'render-menu-x' }), 'the render settings');
  // The pack's lists: what the living weapon does, what else an element does, each style's
  // look, and (a style in its own colors) why the finishes are off.
  const { bonfireItems, optionsHtml } = await import('../src/ui/pack.js');
  const { rotation } = await import('../src/palette.js');
  const state = () => ({
    scenery: 'ruins',
    weapon: 'longsword',
    element: 'fire',
    flame: rotation()[0],
    helmet: 'great',
    presence: 'resting',
    style: 'blackgold',
    finish: 'gunmetal',
  });
  const pack = bonfireItems({
    state,
    busy: () => false,
    elementTip: 'Also forges a new weapon.',
    onScene() {},
    onWeapon() {},
    onRing() {},
    onLiving() {},
    onElement() {},
    onFlame() {},
    onHelmet() {},
    onGesture() {},
    onStyle() {},
    onFinish() {},
    onSummon() {},
    onDismiss() {},
  });
  for (const it of pack.filter((i) => i.id !== 'map'))
    assertTipsReadOut(optionsHtml(it.id, it.options()), `the pack’s ${it.id}`);
});

test('skills: each slot’s flavor is its tooltip (under its name) and its description for screen readers', async () => {
  const { skills, shown } = await import('../src/content.js');
  const html = render.renderSkills();
  const slots = [
    ...html.matchAll(
      /<button class="slot" type="button" data-skill="([^"]*)" data-tip-title="([^"]*)" data-tip="([^"]*)" data-tip-tap aria-describedby="([^"]+)">/g,
    ),
  ];
  const all = shown(skills)
    .filter((g) => shown(g.items).length)
    .flatMap((g) => shown(g.items));
  assert.equal(slots.length, all.length, 'every skill');
  for (const [, name, title, tip, id] of slots) {
    assert.equal(title, name);
    assert.ok(
      html.includes(`<span class="visually-hidden" id="${id}">${tip}</span>`),
      `${name}: described by its flavor`,
    );
  }
  assert.equal(new Set(slots.map((m) => m[4])).size, slots.length, 'ids are unique');
});

test('content: a menu group’s heading can’t be blank', async () => {
  const { readFile } = await import('node:fs/promises');
  const { validateContent, UI_HEADINGS } = await import('../src/contentRules.js');
  const content = JSON.parse(await readFile(new URL('../src/content.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateContent(content).errors, []);
  for (const key of UI_HEADINGS) assert.ok(typeof content.ui[key] === 'string' && content.ui[key].trim(), `ui.${key}`);
  const blank = structuredClone(content);
  blank.ui.packSwords = ' ';
  assert.deepEqual(
    validateContent(blank).errors.map((e) => e.path),
    ['ui.packSwords'],
  );
  const other = structuredClone(content);
  other.ui.menuFlavor = '';
  assert.deepEqual(validateContent(other).errors, [], 'other interface text may be empty, as before');
});
