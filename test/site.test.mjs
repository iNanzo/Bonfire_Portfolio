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
  assert.deepEqual(readRoute({ hash: '#/contact', pathname: '/repo/' }, '/repo/'), { screen: 'contact', item: null }, 'a legacy hash wins once');
  assert.deepEqual(readRoute({ hash: '#main', pathname: '/about/' }), { screen: 'about', item: null }, 'the skip link is not a route');
  assert.deepEqual(readRoute({ hash: '', pathname: '/elsewhere/skills/' }, '/repo/'), HOME, 'outside the base');
  const within = (sel) => ({ closest: (s) => (s.includes(sel) ? {} : null) });
  assert.equal(isEditing(within('input')), true);
  assert.equal(isEditing(within('nothing')), false);
  assert.equal(isEditing(null), false);
});

test('html: escaping, safe links, asset paths', () => {
  assert.equal(esc(`<a href="x">Tom's & co</a>`), '&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; co&lt;/a&gt;');
  for (const ok of ['https://example.com/a?b=c', 'mailto:me@example.com', 'projects/gamex', 'assets/cv.pdf']) assert.ok(isSafeUrl(ok), ok);
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.com', '/root', '../up', 'a/./b', 'https://user:pw@example.com',
    'has space', 'quote"d', '%2e%2e/x', 'vbscript:x', '', null]) assert.equal(isSafeUrl(bad), false, String(bad));
  assert.equal(assetUrl('assets/projects/nba/cover', '/repo/', true), '/repo/assets/projects/nba/cover-card.webp');
  assert.throws(() => assetUrl('../secrets'));
});

test('templates: every screen renders, with only safe links and escaped text', () => {
  const pages = ['renderChrome', 'renderHome', 'renderProjects', 'renderExperience', 'renderSkills', 'renderAbout', 'renderContact'].map((name) => [name, render[name]()]);
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
  assert.ok(render.renderHome().includes(esc(featured.name)) || inventory.includes(esc(featured.name)), 'the featured project appears');
});

test('seo: every page has its own title, description, preview and structured data; hidden ones stay out of the sitemap', async () => {
  const { pageMeta, withMeta, publicRoutes, sitemap } = await import('../src/seoPages.js');
  const template = '<html><head><title>x</title><meta name="description" content="x" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:type" content="website" /></head><body></body></html>';
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
