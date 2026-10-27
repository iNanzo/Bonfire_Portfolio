// The invitation toy's link button in the admin: content.json `invitation.link` ({href, label})
// checked by src/contentRules.js (the href empty, which hides the button, or a link the site
// can use: src/html.js isSafeUrl, so javascript:, data: and the like are errors; the label up
// to 24 letters, and a warning when there's an href but no label, the button then named Link),
// content without it still passing; and its Link Button section on the Invitation page
// (admin/ui/schema.js): before the Intro, named and helped, found by the search, and started
// from the toy's own (no link, the label Link). The addresses here are the test's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateContent } from '../../src/contentRules.js';
import { LINK_LABEL, LINK_LABEL_MAX } from '../../src/invitation/link.js';
import { HELP, LABELS, PAGES, STARTERS, hint, keywordsFor, moreFor, resolveHelp } from '../ui/schema.js';
import { titleCase } from '../ui/text.js';

globalThis.document ??= /** @type {any} */ ({
  createElement: () => {
    throw new Error('no DOM in these tests');
  },
});
const { pageOf } = await import('../ui/search.js');

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
/** The content with this invitation section (the rest as content.json has it). */
const withInvitation = (inv) => ({ ...content(), invitation: inv });
const problems = (inv) => validateContent(withInvitation(inv));
const errorsAt = (inv) =>
  problems(inv)
    .errors.map((e) => e.path)
    .sort();
const warningsAt = (inv) =>
  problems(inv)
    .warnings.map((e) => e.path)
    .sort();
const link = (o) => ({ link: { href: '', label: 'Link', ...o } });

test('content.json’s link passes (an href and a label, as the admin writes them), and content without it still does', () => {
  const c = content();
  const own = c.invitation?.link;
  assert.ok(own && typeof own === 'object', 'content.json has its link');
  assert.deepEqual(Object.keys(own).sort(), ['href', 'label']);
  assert.equal(typeof own.href, 'string');
  assert.equal(typeof own.label, 'string');
  assert.deepEqual(validateContent(c).errors, []);
  const old = content();
  delete old.invitation.link;
  assert.deepEqual(validateContent(old).errors, [], 'no invitation.link');
  assert.deepEqual(problems({ link: {} }).errors, [], 'every field optional');
  assert.deepEqual(problems(link({})).warnings, [], 'no link at all: nothing to warn of');
});

test('the href: empty hides the button; https, http, mailto: and a site path pass; javascript:, data: and the like are errors', () => {
  for (const href of [
    '',
    'https://example.com',
    'https://example.com/a?b=1#c',
    'http://example.com',
    'mailto:hi@example.com',
    'visualizer/',
    'games/x.html',
  ])
    assert.deepEqual(errorsAt(link({ href })), [], href);
  for (const href of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<b>x</b>',
    'vbscript:x',
    'file:///x',
    '//evil.example',
    '/abs',
    '../up',
    'https://user:pw@example.com',
    'https://example.com/"x',
    ' https://example.com',
    'tel:123',
  ])
    assert.deepEqual(errorsAt(link({ href })), ['invitation.link.href'], href);
  assert.deepEqual(errorsAt(link({ href: 3 })), ['invitation.link.href'], 'text');
  const msg = problems(link({ href: 'javascript:alert(1)' })).errors[0].message;
  assert.match(msg, /https:\/\/|mailto:/, `says what works: ${msg}`);
});

test('the label: text up to 24 letters (an emoji one), and an href with no label is a warning: the button is named Link', () => {
  assert.equal(LINK_LABEL_MAX, 24);
  assert.equal(LINK_LABEL, 'Link');
  assert.deepEqual(errorsAt(link({ label: 'A'.repeat(LINK_LABEL_MAX) })), []);
  assert.deepEqual(errorsAt(link({ label: '🔥'.repeat(LINK_LABEL_MAX) })), [], 'letters, not UTF-16 units');
  assert.deepEqual(errorsAt(link({ label: 'A'.repeat(LINK_LABEL_MAX + 1) })), ['invitation.link.label']);
  assert.deepEqual(errorsAt(link({ label: 7 })), ['invitation.link.label']);
  assert.deepEqual(warningsAt(link({ href: 'https://example.com', label: '' })), ['invitation.link.label']);
  assert.deepEqual(warningsAt(link({ href: 'https://example.com', label: '   ' })), ['invitation.link.label']);
  const warning = problems(link({ href: 'https://example.com', label: '' })).warnings[0].message;
  assert.match(warning, /Link/, `says what it falls back to: ${warning}`);
  assert.deepEqual(warningsAt(link({ href: '', label: '' })), [], 'no button: nothing to name');
  assert.deepEqual(problems(link({ href: 'https://example.com', label: 'Portfolio' })).warnings, []);
});

test('the section: a group with only its href and its label', () => {
  assert.deepEqual(errorsAt({ link: [] }), ['invitation.link']);
  assert.deepEqual(errorsAt({ link: 'https://example.com' }), ['invitation.link']);
  assert.deepEqual(errorsAt({ link: { href: '', label: 'Link', target: '_self' } }), ['invitation.link.target']);
});

test('Link Button is on the Invitation page before the Intro, named, helped and found, and starts from the toy’s own', () => {
  const page = PAGES.find((p) => p.id === 'invitation');
  assert.ok(page?.keys.includes('invitation.link'));
  assert.ok(page.keys.indexOf('invitation.link') < page.keys.indexOf('invitation.intro'), 'before the Intro');
  assert.equal(page.keys.at(-1), 'invitation.intro');
  assert.ok(page.blurb.length <= 160 && /link/i.test(page.blurb), 'its blurb says so');
  for (const pattern of ['invitation.link', 'invitation.link.href', 'invitation.link.label']) {
    const label = hint(LABELS, pattern);
    assert.ok(label && titleCase(label).length <= 48, `${pattern}: a short label`);
    const help = resolveHelp(hint(HELP, pattern), {});
    assert.ok(help.length >= 12 && help.length <= 160, `${pattern}: help a sentence long (${help.length})`);
    assert.equal(pageOf(pattern).id, 'invitation', `${pattern}: found on it`);
  }
  assert.equal(titleCase(LABELS['invitation.link']), 'Link Button');
  // (What goes in the address, and that empty hides it; the name's for hover and screen readers.)
  const href = HELP['invitation.link.href'];
  for (const shown of ['https://', 'mailto:', 'path', 'mpty']) assert.ok(href.includes(shown), `its help: ${shown}`);
  assert.match(HELP['invitation.link.label'], /hover/i);
  assert.match(HELP['invitation.link.label'], /screen reader/i);
  assert.match(HELP['invitation.link.label'], new RegExp(`${LINK_LABEL_MAX}`));
  assert.match(`${HELP['invitation.link']} ${moreFor('invitation.link')}`, /new tab/i);
  assert.ok(keywordsFor('invitation.link').includes('url'), 'found by what it is');
  const start = STARTERS['invitation.link']();
  assert.deepEqual(start, { href: '', label: LINK_LABEL });
  assert.notEqual(STARTERS['invitation.link'](), start, 'a copy each time');
  assert.deepEqual(problems({ link: start }).errors, []);
  assert.deepEqual(problems({ link: start }).warnings, []);
});
