// Settings search (src/ui/settingsSearch.js): text folded (accents, curly quotes, case);
// every word typed has to start a word of the setting; synonyms and a one-letter slip in a
// label word count; results best first (label, keywords, section or tab, choices, hint, key)
// and in the given order on a tie; the match marked in the label's own characters; marks
// escaped, so a name like <img onerror> stays text; and the box: the query after a pause,
// the count read out after a longer one (at once when nothing matches), Esc clearing first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, buildMatcher, highlight, oneEdit, createSearchBox, searchBoxMarkup, WEIGHTS } from '../src/ui/settingsSearch.js';

const ENTRIES = [
  { id: 'pixelSize', label: 'Pixel Size', section: 'Pixel Art', tab: 'Picture', options: ['2 px (Fine)', '4 px'], hint: 'How big each pixel of the picture is.', key: 'pixelSize' },
  { id: 'exposure', label: 'Exposure', keywords: ['brightness'], section: 'Place & Atmosphere', tab: 'Picture', hint: 'How bright the whole picture is.', key: 'exposure' },
  { id: 'flash', label: 'Negative Flash', section: 'The Drop', tab: 'Drops', hint: 'The picture inverts when the drop hits.', key: 'flash' },
  { id: 'flicker', label: 'Flicker', section: 'Layers', tab: 'Effects', hint: 'The light dips on the beat.', key: 'flicker' },
  { id: 'hitFlash', label: 'Hit Flash', section: 'Hits', tab: 'Drops', hint: 'A big hit lifts the frame toward the core color.', key: 'hitFlash' },
  { id: 'knightRim', label: 'Edge Glow Strength', section: 'Armor', tab: 'Cast', hint: 'How strongly the edges glow.', key: 'knightRim' },
  { id: 'budget', label: 'Follow the Song’s Shape', section: 'Reaction', tab: 'Show', hint: 'Calm in intros, busy in the groove.', key: 'budget' },
  { id: 'scenery', label: 'Place', section: 'Place & Atmosphere', tab: 'Picture', options: ['Gothic Ruins', 'Forge', 'Café Terrace'], hint: 'What stands around the fire.', key: 'scenery' },
];
const ids = (hits) => hits.map((h) => h.entry.id);

test('normalize: accents stripped, quotes straightened, lower case', () => {
  assert.equal(normalize('Café Résumé'), 'cafe resume');
  assert.equal(normalize('Song’s “Shape”'), 'song\'s "shape"');
  assert.equal(normalize('ﬁre'), 'fire', 'compatibility forms too');
});

test('every word must start a word somewhere; a blank query matches nothing', () => {
  const match = buildMatcher(ENTRIES);
  assert.deepEqual(ids(match('pix si')), ['pixelSize']);
  assert.deepEqual(ids(match('xel')), [], 'inside a word is no match');
  assert.deepEqual(ids(match('ixel')), [], 'nor a slip at its first letter');
  assert.deepEqual(ids(match('pixel glow')), [], 'every word has to be found');
  assert.deepEqual(match('   '), []);
  assert.deepEqual(ids(match('song’s')), ['budget'], 'an apostrophe inside a word, curly or straight');
  assert.deepEqual(ids(match("song's shape")), ['budget']);
  assert.deepEqual(ids(match('CAFE')), ['scenery'], 'a choice, accents and case aside');
  assert.deepEqual(ids(match('knight rim')), ['knightRim'], 'a key, split at its capitals');
});

test('ranking: label, then keywords, section or tab, choices, hint, key; ties keep the given order', () => {
  assert.ok(WEIGHTS.label > WEIGHTS.keywords && WEIGHTS.keywords > WEIGHTS.section && WEIGHTS.section === WEIGHTS.tab
    && WEIGHTS.tab > WEIGHTS.options && WEIGHTS.options > WEIGHTS.hint && WEIGHTS.hint > WEIGHTS.key);
  const match = buildMatcher([
    { id: 'byHint', label: 'Alpha', hint: 'glow in the hint' },
    { id: 'byKey', label: 'Beta', key: 'glowKey' },
    { id: 'byOption', label: 'Gamma', options: ['Glow'] },
    { id: 'bySection', label: 'Delta', section: 'Glow' },
    { id: 'byKeyword', label: 'Epsilon', keywords: ['glow'] },
    { id: 'byLabel', label: 'Glow Strength' },
    { id: 'byLabelToo', label: 'Glowing Edges' },
  ]);
  assert.deepEqual(ids(match('glow')), ['byLabel', 'byLabelToo', 'byKeyword', 'bySection', 'byOption', 'byHint', 'byKey']);
  // (A whole word typed ranks a label above one it only starts; otherwise the given order.)
  assert.deepEqual(ids(match('glowi')), ['byLabelToo']);
  const tie = buildMatcher([{ id: 'a', label: 'Flash One' }, { id: 'b', label: 'Flash Two' }]);
  assert.deepEqual(ids(tie('flash')), ['a', 'b']);
});

test('synonyms: a word stands for any of its synonyms, phrases too', () => {
  const match = buildMatcher(ENTRIES, { synonyms: { strobe: ['flash', 'flicker'], fps: ['frame rate'], bright: ['exposure'] } });
  assert.deepEqual(ids(match('strobe')).sort(), ['flash', 'flicker', 'hitFlash']);
  assert.deepEqual(ids(match('bright')), ['exposure']);
  const fps = buildMatcher([{ id: 'flameFps', label: 'Flame Frame Rate' }], { synonyms: { fps: ['frame rate'] } });
  assert.deepEqual(ids(fps('fps')), ['flameFps']);
});

test('a one-letter slip: only in label words of 5+ letters, from 4 letters typed, ranked under an exact match', () => {
  const match = buildMatcher(ENTRIES);
  assert.deepEqual(ids(match('exposre')), ['exposure'], 'a letter dropped');
  assert.deepEqual(ids(match('negaitve')), ['flash'], 'two swapped');
  assert.deepEqual(ids(match('flichr')), [], 'two letters off');
  assert.deepEqual(ids(match('fla')), ['flash', 'hitFlash'], 'short words: no slips (no Flicker)');
  assert.deepEqual(ids(match('inverst')), [], 'hint words: no slips');
  assert.ok(oneEdit('glow', 'glow') && oneEdit('glow', 'glew') && oneEdit('glow', 'glo') && oneEdit('glow', 'gloow') && oneEdit('glow', 'lgow'));
  assert.ok(!oneEdit('glow', 'gl') && !oneEdit('glow', 'wolg'));
  const ranked = buildMatcher([{ id: 'slip', label: 'Flicker' }, { id: 'exact', label: 'Other', hint: 'flickr' }]);
  assert.deepEqual(ids(ranked('flickr')), ['slip', 'exact'], 'a label with a slip still beats a hint');
});

test('ranges: what matched, in the label’s own characters (accents and all)', () => {
  const match = buildMatcher(ENTRIES);
  const [hit] = match('pix si');
  assert.deepEqual(hit.ranges, [[0, 3], [6, 8]]);
  assert.equal(highlight(hit.entry.label, hit.ranges), '<mark>Pix</mark>el <mark>Si</mark>ze');
  const [cafe] = buildMatcher([{ id: 'c', label: 'Café Terrace' }])('cafe');
  assert.deepEqual(cafe.ranges, [[0, 4]]);
  assert.equal(highlight('Café Terrace', cafe.ranges), '<mark>Café</mark> Terrace');
  const [other] = match('bright');
  assert.deepEqual(other.ranges, [], 'matched by a keyword: nothing in the label');
  assert.ok(other.fields.keywords.length);
});

test('highlight: every piece escaped, so an imported name can’t inject markup', () => {
  const name = '<img src=x onerror="alert(1)"> & “Friday”';
  const [hit] = buildMatcher([{ id: 'setup', label: name }])('img');
  const html = highlight(name, hit.ranges);
  assert.equal(html, '&lt;<mark>img</mark> src=x onerror=&quot;alert(1)&quot;&gt; &amp; “Friday”');
  assert.doesNotMatch(html, /<img/);
  assert.equal(highlight('a<b>c', []), 'a&lt;b&gt;c');
  assert.equal(highlight('abcdef', [[2, 4], [3, 5], [0, 1], [10, 12]]), '<mark>a</mark>b<mark>cde</mark>f', 'overlaps joined, past the end ignored');
});

// --- the box, on a stand-in input and clock -------------------------------------------------
function box() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const on = new Map();
  const docOn = new Map();
  const win = {
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const doc = {
    defaultView: win,
    addEventListener: (t, fn) => docOn.set(t, fn),
    removeEventListener: (t) => docOn.delete(t),
  };
  const input = {
    value: '',
    ownerDocument: doc,
    addEventListener: (t, fn) => on.set(t, fn),
    removeEventListener: (t) => on.delete(t),
  };
  const status = { textContent: '' };
  const tick = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = until;
  };
  const type = (text) => { input.value = text; on.get('input')(); };
  const key = (k) => { const e = { key: k, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }; on.get('keydown')(e); return e; };
  const cancel = () => { const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; docOn.get('cancel')?.(e); return e; };
  return { input, status, tick, type, key, cancel, on, docOn, keyup: (k) => on.get('keyup')({ key: k }) };
}

test('the search box: the query after a pause, the count read out after a longer one, none at once', () => {
  const b = box();
  const queries = [];
  const match = buildMatcher(ENTRIES);
  createSearchBox({ input: b.input, status: b.status, onQuery: (q) => { queries.push(q); return match(q); } });
  b.type('fl');
  b.tick(40);
  b.type('fla');
  b.tick(79);
  assert.deepEqual(queries, [], 'still typing');
  b.tick(1);
  assert.deepEqual(queries, ['fla']);
  assert.equal(b.status.textContent, '', 'the count waits for typing to stop');
  b.tick(500);
  assert.equal(b.status.textContent, '2 settings found');
  b.type('zzz');
  b.tick(80);
  assert.equal(b.status.textContent, 'No settings match “zzz”', 'nothing found: said at once');
  b.type('pixel');
  b.tick(80 + 500);
  assert.equal(b.status.textContent, '1 setting found');
});

test('the search box: Esc clears it first (the dialog stays), then is left to the page', () => {
  const b = box();
  const queries = [];
  const sb = createSearchBox({ input: b.input, status: b.status, onQuery: (q) => { queries.push(q); return q ? 3 : 0; } });
  b.type('glow');
  b.tick(80);
  const first = b.key('Escape');
  assert.equal(b.input.value, '');
  assert.equal(queries.at(-1), '', 'cleared: everything shows again');
  assert.equal(b.status.textContent, '');
  assert.ok(first.defaultPrevented && first.stopped);
  assert.equal(b.cancel().defaultPrevented, true, 'the dialog doesn’t close on the clearing Esc');
  b.keyup('Escape');
  const second = b.key('Escape');
  assert.equal(second.defaultPrevented, false, 'nothing to clear: the page’s Esc');
  assert.equal(b.cancel().defaultPrevented, false);
  assert.equal(sb.clear(), false);
  b.input.value = 'x';
  assert.equal(sb.clear(), true);
  sb.destroy();
  assert.equal(b.on.size, 0);
  assert.equal(b.docOn.size, 0);
});

test('the search box markup: labelled, a note, the status line there from the start', () => {
  const html = searchBoxMarkup({ id: 'viz-search', label: 'Search Settings' });
  assert.match(html, /^\s*<search class="settings-search">/);
  assert.match(html, /<label class="visually-hidden" for="viz-search">Search Settings<\/label>/);
  assert.match(html, /<input type="search" id="viz-search"[^>]*aria-describedby="viz-search-note"/);
  assert.match(html, /<p class="settings-search-status" role="status" data-search-status><\/p>/);
});
