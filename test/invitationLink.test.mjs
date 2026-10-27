// The invitation toy's link button (src/invitation/link.js, ui.js linkHtml): the admin's
// invitation.link (where it goes and its name) as the toy reads it (the label "Link" when it has
// none, capped at LINK_LABEL_MAX letters), the same safe-link rule as the site's (src/html.js
// isSafeUrl: the toy imports nothing from src/, so link.js keeps a copy and this holds the two
// together), its markup (a real link in the toolbar's squircle look: Phosphor's bold link icon and
// its label as its own text, no title=; a new tab for every link but a mailto:, a site path from
// the site's root; hidden, with no href, when it's empty or not safe), the corner each scene puts
// it in (the top left while the envelope is up or the intro runs, else the top right), and its
// plain fade between them (the CSS's quicker than the script's swap, none with reduced motion,
// and in at the top right only once what sat there has gone). Its icon is checked with the rest in test/invitationIcons.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSafeUrl } from '../src/html.js';
import {
  LINK_CLEAR_MS,
  LINK_FADE,
  LINK_LABEL,
  LINK_LABEL_MAX,
  linkCorner,
  linkFrom,
  linkTarget,
  safeHref,
} from '../src/invitation/link.js';
import { ICONS, ICON_SOURCES, iconSvg } from '../src/invitation/icons.js';
import { linkHtml } from '../src/invitation/ui.js';

test('the link as the toy reads it: an href (trimmed) and a label, "Link" when it has none, at most 24 letters', () => {
  assert.equal(LINK_LABEL, 'Link');
  assert.equal(LINK_LABEL_MAX, 24);
  for (const raw of [undefined, null, 'x', 3, [], {}, { href: 5, label: 7 }])
    assert.deepEqual(linkFrom(raw), { href: '', label: 'Link' }, JSON.stringify(raw));
  assert.deepEqual(linkFrom({ href: ' https://example.com/a ', label: '  My Site  ' }), {
    href: 'https://example.com/a',
    label: 'My Site',
  });
  assert.deepEqual(linkFrom({ href: 'mailto:hi@example.com', label: '   ' }), {
    href: 'mailto:hi@example.com',
    label: 'Link',
  });
  // (Letters, not UTF-16 units: an emoji is one.)
  const long = 'A'.repeat(30);
  assert.equal(linkFrom({ label: long }).label, 'A'.repeat(24));
  const emoji = '🔥'.repeat(30);
  assert.equal(Array.from(linkFrom({ label: emoji }).label).length, 24);
  assert.equal(linkFrom({ label: emoji }).label, '🔥'.repeat(24));
});

test('its safe-link rule is the site’s own (src/html.js isSafeUrl), copied: the toy imports nothing from src/', () => {
  const cases = [
    'https://example.com',
    'https://example.com/a/b?c=1&d=2#e',
    'http://example.com',
    'HTTPS://EXAMPLE.COM',
    'mailto:hi@example.com',
    'mailto:a@b@c',
    'visualizer/',
    'games/x.html',
    'about#me',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<b>x</b>',
    'vbscript:x',
    'file:///etc/passwd',
    '//evil.example',
    '/abs/path',
    '../up',
    'a/../b',
    './here',
    'a%2e%2e/b',
    'https://user:pw@example.com',
    'https://',
    'https://exa mple.com',
    'https://example.com/"x',
    "https://example.com/'x",
    'https://example.com/<x>',
    'https://example.com\\x',
    ' https://example.com',
    '',
    'tel:123',
  ];
  for (const v of cases) assert.equal(safeHref(v), isSafeUrl(v), JSON.stringify(v));
  for (const v of [undefined, null, 3, {}, []]) assert.equal(safeHref(v), false, String(v));
});

test('where it goes: a site path from the site’s root, a new tab for all but a mailto:, nothing when empty or unsafe', () => {
  assert.deepEqual(linkTarget('https://example.com/x', '/'), { url: 'https://example.com/x', newTab: true });
  assert.deepEqual(linkTarget('http://example.com', '/'), { url: 'http://example.com', newTab: true });
  assert.deepEqual(linkTarget('mailto:hi@example.com', '/'), { url: 'mailto:hi@example.com', newTab: false });
  assert.deepEqual(linkTarget('visualizer/', '/'), { url: '/visualizer/', newTab: true });
  assert.deepEqual(linkTarget('visualizer/', '/sub/'), { url: '/sub/visualizer/', newTab: true });
  for (const bad of ['', 'javascript:alert(1)', 'data:text/html,x', '//evil.example', '/abs', '../up', 'tel:1'])
    assert.equal(linkTarget(bad, '/'), null, bad);
});

test('its markup: a real link in the toolbar’s squircle look, the link icon and its label its own text, no tooltip', () => {
  const at = linkHtml({ href: 'https://example.com/x', label: 'My Site' }, { base: '/' });
  assert.match(at, /^<a [^>]*class="inv-btn inv-tool inv-link"/, 'a link, in the toolbar’s look');
  assert.match(at, /\sid="inv-link"/, 'its id (the modal layers own it while it’s in their corner)');
  assert.match(at, /\sdata-link(\s|>|=)/);
  assert.match(at, /\shref="https:\/\/example\.com\/x"/);
  assert.match(at, /\starget="_blank"/, 'a new tab: the toy keeps its state');
  assert.match(at, /\srel="noopener noreferrer"/);
  assert.match(at, /\sdraggable="false"/, 'a mouse drag never carries it off as a link');
  assert.doesNotMatch(at, /\shidden/);
  assert.ok(at.includes(iconSvg('link')), 'Phosphor’s bold link icon');
  assert.match(at, /<span class="inv-btn-label">My Site<\/span><\/a>$/, 'its label, its own text: its name');
  assert.doesNotMatch(at, /\stitle=|aria-label=|data-tip/, 'no tooltip: the label names it');
  // (A corner to begin with: the top right unless it's asked for the left.)
  assert.match(at, /\sdata-corner="right"/);
  assert.match(linkHtml({ href: 'visualizer/', label: 'Live' }, { base: '/', corner: 'left' }), /\sdata-corner="left"/);
});

test('a mailto: opens in place (no new tab), and a site path from the site’s root', () => {
  const mail = linkHtml({ href: 'mailto:hi@example.com', label: 'Write' }, { base: '/' });
  assert.match(mail, /\shref="mailto:hi@example\.com"/);
  assert.doesNotMatch(mail, /\starget=/, 'no target for a mailto:');
  const path = linkHtml({ href: 'visualizer/', label: 'Live' }, { base: '/b/' });
  assert.match(path, /\shref="\/b\/visualizer\/"/);
  assert.match(path, /\starget="_blank"/);
});

test('hidden entirely when it’s empty or not safe: no href (so no focus), hidden from everyone, nothing of it in the markup', () => {
  for (const href of [
    '',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    '//evil.example',
    ' ',
    'https://user:pw@x.com',
  ]) {
    const at = linkHtml({ href, label: 'Link' }, { base: '/' });
    assert.match(at, /^<a [^>]*\shidden(\s|>)/, `${JSON.stringify(href)}: hidden`);
    assert.doesNotMatch(at, /\shref=/, `${JSON.stringify(href)}: no href`);
    assert.doesNotMatch(at, /\starget=|javascript|data:text/, `${JSON.stringify(href)}: nothing of it`);
  }
  assert.match(linkHtml(null, { base: '/' }), /\shidden/, 'no link at all (the admin’s preview)');
});

test('its label is escaped, and so is its address', () => {
  const at = linkHtml({ href: 'https://example.com/?a=1&b=2', label: '<b>Tom & Jerry</b>' }, { base: '/' });
  assert.match(at, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(at, /<span class="inv-btn-label">&lt;b&gt;Tom &amp; Jerry&lt;\/b&gt;<\/span>/);
});

test('its corner: the top left while the envelope is up or the intro runs (or is about to), else the top right', () => {
  assert.equal(linkCorner({ envelope: true, intro: false }), 'left');
  assert.equal(linkCorner({ envelope: false, intro: true }), 'left');
  assert.equal(linkCorner({ envelope: true, intro: true }), 'left');
  assert.equal(linkCorner({ envelope: false, intro: false }), 'right');
  assert.equal(linkCorner({}), 'right');
});

test('at the top right it waits for what sat there to go (the envelope’s Skip Intro, the intro’s top row), at most a moment', async () => {
  const { LEAVE_MS } = await import('../src/invitation/dialogueUi.js');
  const css = readFileSync(new URL('../src/invitation/envelope.css', import.meta.url), 'utf8');
  const at = css.indexOf('.inv-envelope-skip {');
  assert.ok(at >= 0, 'Skip Intro is styled');
  const fade = /opacity ([\d.]+)(m?s)/.exec(css.slice(at, css.indexOf('}', at)));
  assert.ok(fade, 'Skip Intro fades as the envelope goes');
  const skipMs = Number(fade[1]) * (fade[2] === 's' ? 1000 : 1);
  assert.ok(LINK_CLEAR_MS > skipMs, `after Skip Intro's fade (${skipMs} ms): ${LINK_CLEAR_MS} ms`);
  assert.ok(LINK_CLEAR_MS > LEAVE_MS, `after the intro's (${LEAVE_MS} ms): ${LINK_CLEAR_MS} ms`);
  assert.ok(LINK_CLEAR_MS <= 1500, `never long: ${LINK_CLEAR_MS} ms at the most`);
});

test('its move between corners: a short plain fade, out then in (the CSS’s done before the script swaps it), none with reduced motion', () => {
  assert.ok(LINK_FADE.ms >= 80 && LINK_FADE.ms <= 200, `${LINK_FADE.ms} ms each way`);
  const css = readFileSync(new URL('../src/invitation/invitation.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `${sel} is styled`);
    return css.slice(at, css.indexOf('}', at));
  };
  const link = rule('.inv-link');
  const fade = /transition:([^;]*);/.exec(link)?.[1] ?? '';
  const ms = /opacity (\d+)ms/.exec(fade);
  assert.ok(ms, 'its opacity fades');
  assert.ok(Number(ms[1]) < LINK_FADE.ms, `the fade (${ms[1]} ms) ends before the swap (${LINK_FADE.ms} ms)`);
  assert.doesNotMatch(
    fade,
    /\b(left|right|top|bottom|inset|translate|all)\b/,
    'no slide across (its press may still go down)',
  );
  assert.match(rule('.inv-link.is-moving'), /opacity: 0/);
  assert.doesNotMatch(rule('.inv-link.is-moving'), /background-image|--inv-dv/, 'no dither');
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.inv-link[^{]*\{[^}]*transition: none/, 'reduced motion: at once');
  // (It sits over the envelope (3) and the petals over it (4).)
  const z = /z-index: (\d+)/.exec(link);
  assert.ok(z && Number(z[1]) > 4, 'over the envelope and its petals');
});

test('its icon: Phosphor’s bold link, its own glyph', () => {
  assert.equal(ICON_SOURCES.link, 'link');
  assert.match(ICONS.link, /^M117\.18,188\.74/, 'Phosphor’s path data, as vendored');
});
