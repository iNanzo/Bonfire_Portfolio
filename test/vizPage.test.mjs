// Bonfire Live's page, in the parts of it that are only strings: the markup (markup.js), with
// every control's tip read out as its description and every key a tip or a chip names a real
// shortcut (keys.js); the HUD's weapon line (hud.js wieldLabel); and what the start screen
// says when a source won't start (sources.js describeError).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageMarkup, HUD_TIPS } from '../src/visualizer/markup.js';
import { KEY_GROUPS } from '../src/visualizer/keys.js';
import { wieldLabel } from '../src/visualizer/hud.js';
import { describeError } from '../src/visualizer/sources.js';

const html = pageMarkup({
  base: '/base/',
  presets: '<i data-presets-here></i>',
  settingsDialog: '<i data-settings-here></i>',
});
/** Every opening tag's attributes, by tag. */
const tags = [...html.matchAll(/<([a-z]+)\b([^>]*)>/g)].map(([, tag, attrs]) => ({
  tag,
  attrs,
  attr: (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1],
}));
const unescape = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
/** Every key a shortcut row names ("Shift+K", "[", "]", "1"…), as people read them. */
const KEYS = new Set(KEY_GROUPS.flatMap((g) => g.keys.flatMap((row) => row.keys.join('+').split(' / '))));

test('the page’s markup: the parts main.js hands it in place, the home link on the site’s base, the four sources', () => {
  assert.match(html, /<i data-presets-here><\/i>/);
  assert.match(html, /<i data-settings-here><\/i>/);
  assert.ok(
    tags.some((t) => /\sdata-home-link\b/.test(t.attrs) && t.attr('href') === '/base/'),
    'the home link',
  );
  assert.deepEqual(
    tags.filter((t) => t.attr('data-source')).map((t) => t.attr('data-source')),
    ['input', 'capture', 'file', 'demo'],
  );
  const ids = tags.map((t) => t.attr('id')).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
});

test('the page’s markup: every control with a tip has it read out as its description, word for word', () => {
  const notes = new Map(
    [...html.matchAll(/<span class="visually-hidden" id="([^"]+)">([^<]*)<\/span>/g)].map(([, id, text]) => [
      id,
      unescape(text),
    ]),
  );
  const described = tags.filter((t) => t.attr('aria-describedby'));
  assert.ok(described.length >= 20, `${described.length} controls`);
  for (const t of described) {
    const id = t.attr('aria-describedby');
    assert.ok(notes.has(id), `${id} is on the page`);
    assert.equal(unescape(t.attr('data-tip') ?? ''), notes.get(id), `${id}: the tip and what's read out`);
  }
  // (Only the meter and the pips, which a screen reader skips, show a tip without one.)
  const silent = tags.filter((t) => t.attr('data-tip') && !t.attr('aria-describedby'));
  assert.deepEqual(
    silent.map((t) => t.attrs.includes('aria-hidden="true"')),
    silent.map(() => true),
  );
});

test('the HUD’s keys: each key a chip or a tip names is one of the shortcuts, and a chip’s key is its tip’s', () => {
  // The keys a tip names at its end: "(A)", "(K; Shift+K: they come or go)", "(F, or Esc)".
  const named = (tip) =>
    (/\(([^()]*)\)\.$/.exec(tip)?.[1] ?? '')
      .split(/[;,]/)
      .map((k) => k.split(':')[0].trim().replace(/^or /, ''))
      .filter(Boolean);
  for (const [id, tip] of Object.entries(HUD_TIPS)) {
    // (Esc backs out of anything, so it isn't a row of its own.)
    for (const k of named(tip)) assert.ok(KEYS.has(k) || k === 'Esc', `${id}: "${k}" is a shortcut`);
  }
  assert.deepEqual(named(HUD_TIPS.dance), ['K', 'Shift+K']);
  assert.deepEqual(named(HUD_TIPS.exitFullscreen), ['F', 'Esc']);
  // The buttons' chips: <kbd>A</kbd> on the one whose tip ends "(A)".
  const chips = [...html.matchAll(/<button [^>]*data-tip="([^"]*)"[^>]*><kbd>([^<]+)<\/kbd>/g)].map(([, tip, key]) => [
    unescape(tip),
    key,
  ]);
  assert.ok(chips.length >= 14, `${chips.length} chips`);
  for (const [tip, key] of chips) {
    assert.ok(KEYS.has(key), `${key} is a shortcut`);
    assert.ok(named(tip).includes(key), `"${tip}" names ${key}`);
  }
});

test('the HUD’s weapon line: the weapon’s name, and its flame in its element', () => {
  assert.equal(wieldLabel({ weapon: 'uchigatana', flame: 'ember', element: 'fire' }), 'Uchigatana · Ember Flame');
  assert.equal(wieldLabel({ weapon: 'uchigatana', flame: 'ember', element: 'ice' }), 'Uchigatana · Ember Frost');
  assert.equal(wieldLabel({ weapon: 'longsword', flame: 'blood' }), 'Longsword · Blood Flame', 'no element: fire');
  assert.equal(wieldLabel({ weapon: 'nope', flame: 'nope', element: 'fire' }), ' · ', 'nothing known: nothing named');
});

test('a source that won’t start says why: refused, missing, busy, a file it can’t play, or the error’s own words', () => {
  const err = (name, message = '') => Object.assign(new Error(message), { name });
  assert.equal(describeError(err('NotAllowedError'), 'capture'), 'Sharing was cancelled or blocked.');
  assert.match(
    describeError(err('NotAllowedError'), 'input'),
    /^The browser wasn’t allowed to use the microphone or line in\./,
  );
  assert.match(describeError(err('NotFoundError'), 'input'), /^No audio input was found\./);
  assert.match(describeError(err('NotReadableError'), 'input'), /^That input is busy or unavailable/);
  assert.match(
    describeError(err('NotSupportedError'), 'file'),
    /^That file couldn’t be played\. Try an MP3, WAV, AAC or FLAC file\.$/,
  );
  assert.equal(
    describeError(new Error('This browser can’t share tab or system audio.'), 'capture'),
    'This browser can’t share tab or system audio.',
  );
  assert.equal(describeError(undefined, 'demo'), 'Something went wrong starting the sound.');
});
