// The campfire game's screen, without a browser: the banner's three lines and its queue (none
// cut short, each copied to the output window as it comes and goes), the scoreboard and the
// clock's parts, the Setup dialog's fields as the game's actions, the page's markup (what's
// mirrored and what never is), and the keys the overlay takes matching the list people read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, reduce } from '../src/larp/game.js';
import { bannerLines, createBanner, GAP_MS, MAX_QUEUE } from '../src/larp/banner.js';
import { boardMarkup, clockParts, LAST_MS } from '../src/larp/show.js';
import { fieldAction, fieldValue, panelMarkup } from '../src/larp/setup.js';
import { pageMarkup, SETUP_TABS } from '../src/larp/markup.js';
import { KEY_GROUPS } from '../src/larp/keys.js';
import { modTag, modsMarkup } from '../src/larp/overlay.js';
import { titleCase } from '../src/text.js';
import { readFileSync } from 'node:fs';

let n = 0;
const env = { now: 1_700_000_000_000, newId: () => `k${++n}` };

test('banner: the title, subtitle and "+50 · Team" line', () => {
  assert.deepEqual(bannerLines({ title: 'Brave', subtitle: 'Well done', gain: 50, mult: 1 }, { name: 'Owls' }), {
    title: 'Brave',
    subtitle: 'Well done',
    points: '+50 · Owls',
  });
  assert.equal(bannerLines({ title: 'x', subtitle: '', gain: -10, mult: 1 }, { name: 'Owls' }).points, '−10 · Owls');
  assert.equal(bannerLines({ title: 'x', subtitle: '', gain: 0, mult: 2 }, { name: 'Owls' }).points, '×2 · Owls');
  assert.equal(bannerLines({ title: 'x', subtitle: '', gain: 10, mult: 3 }, null).points, '+10 ×3');
});

/** A banner element with the three lines, enough DOM for createBanner. */
function fakeBanner() {
  const lines = {
    '[data-banner-title]': {},
    '[data-banner-sub]': {},
    '[data-banner-points]': { style: { setProperty() {}, removeProperty() {} } },
  };
  for (const l of Object.values(lines)) Object.assign(l, { textContent: '', hidden: false });
  return {
    hidden: true,
    offsetWidth: 1,
    style: { setProperty() {} },
    querySelector: (s) => lines[s],
    lines,
  };
}
/** Timers run by hand. */
function clock() {
  let t = 0;
  const due = [];
  return {
    set: (fn, ms) => (due.push({ at: t + ms, fn }), due.length),
    clear: () => {},
    run(ms) {
      const end = t + ms;
      for (;;) {
        due.sort((a, b) => a.at - b.at);
        if (!due.length || due[0].at > end) break;
        const next = due.shift();
        t = next.at;
        next.fn();
      }
      t = end;
    },
  };
}

test('banner: quick banners wait their turn, each held its full time and mirrored as it comes and goes', () => {
  const el = fakeBanner();
  const timers = clock();
  const mirrored = [];
  const shown = [];
  const b = createBanner({
    el,
    mirror: () => mirrored.push(el.hidden ? 'hide' : el.lines['[data-banner-title]'].textContent),
    timers,
  });
  b.show({ title: 'One', subtitle: '', points: '+1' }, 1000, { onShow: () => shown.push('One') });
  b.show({ title: 'Two', subtitle: 'sub', points: '+2' }, 1000, { onShow: () => shown.push('Two') });
  assert.equal(el.hidden, false);
  assert.equal(el.lines['[data-banner-title]'].textContent, 'One');
  assert.equal(el.lines['[data-banner-sub]'].hidden, true, 'no subtitle: its line hides');
  assert.deepEqual(shown, ['One'], 'the second waits, and so does its reaction');
  timers.run(999);
  assert.equal(el.lines['[data-banner-title]'].textContent, 'One');
  timers.run(1 + GAP_MS);
  assert.equal(el.lines['[data-banner-title]'].textContent, 'Two');
  assert.deepEqual(shown, ['One', 'Two']);
  timers.run(1000);
  assert.equal(el.hidden, true);
  timers.run(GAP_MS);
  assert.equal(b.showing, false);
  assert.deepEqual(mirrored, ['One', 'hide', 'Two', 'hide']);
  for (let i = 0; i < MAX_QUEUE + 3; i++) b.show({ title: `${i}`, subtitle: '', points: '' }, 10);
  assert.equal(b.queued, MAX_QUEUE, 'a pile-up is capped (the scores have them all)');
  b.clear();
  assert.equal(b.queued, 0);
  assert.equal(el.hidden, true);
});

test('show: the scoreboard by score with places, the clock with its state and the multipliers', () => {
  let g = newGame(env);
  const [red, blue] = g.teams;
  g = reduce(g, { type: 'award', teamId: blue.id, points: 30 }, env);
  g = reduce(g, { type: 'award', teamId: red.id, points: -5 }, env);
  const html = boardMarkup(g);
  assert.ok(html.indexOf(blue.name) < html.indexOf(red.name), 'highest first');
  assert.match(html, /−5</, 'a negative score with a real minus');
  assert.match(html, new RegExp(`--team: ${blue.color}`));
  g = reduce(g, { type: 'edit', list: 'teams', id: red.id, key: 'name', value: '<b>x</b>' }, env);
  assert.doesNotMatch(boardMarkup(g), /<b>/, 'names are escaped');

  const now = env.now;
  assert.deepEqual(clockParts(g, now).state, 'idle');
  assert.match(clockParts(g, now).round, /^Round 1 · 1 of 3$/);
  g = reduce(g, { type: 'timer', op: 'toggle' }, { ...env, now });
  assert.equal(clockParts(g, now + 1000).state, 'running');
  const len = g.timer.durationMs;
  assert.equal(clockParts(g, now + len - LAST_MS + 1).state, 'low');
  assert.equal(clockParts(g, now + len + 1).state, 'out');
  assert.equal(clockParts(g, now + len + 1).time, '0:00');
  const mod = g.modifiers.find((m) => m.mult > 1);
  g = reduce(g, { type: 'award', teamId: blue.id, modId: mod.id }, env);
  assert.deepEqual(clockParts(g, now).mults, [{ name: blue.name, color: blue.color, text: `×${mod.mult}` }]);
});

test('setup: every field shows the game’s value and turns a change into the game’s action', () => {
  let g = newGame(env);
  const r = g.rounds[0];
  assert.equal(fieldValue(g, `rounds.${r.id}.minutes`), 5);
  assert.deepEqual(fieldAction(`rounds.${r.id}.minutes`, '2.5'), {
    type: 'edit',
    list: 'rounds',
    id: r.id,
    key: 'durationMs',
    value: 150_000,
  });
  assert.deepEqual(fieldAction(`rounds.${r.id}.scene`, ''), {
    type: 'edit',
    list: 'rounds',
    id: r.id,
    key: 'scene',
    value: null,
  });
  assert.deepEqual(fieldAction('game.bannerSeconds', '4'), { type: 'set', key: 'bannerMs', value: 4000 });
  assert.equal(fieldAction('nope.x.y', 1), null);
  assert.equal(fieldAction('game.nope', 1), null);
  for (const tab of SETUP_TABS) {
    const html = panelMarkup(tab.id, g, [{ ref: 'b:one', name: 'One' }]);
    for (const [, key] of html.matchAll(/data-set="([^"]+)"/g)) {
      assert.notEqual(fieldValue(g, key), undefined, `${tab.id}: ${key} has a value`);
      const raw = String(fieldValue(g, key));
      const action = fieldAction(key, key.endsWith('.special') || key.endsWith('Motion') ? false : raw);
      assert.ok(action, `${key} acts`);
      g = reduce(g, action, env);
    }
    // Labels in Title Case (the house rule): every field label and button.
    for (const [, label] of html.matchAll(/class="viz-field-label">([^<]+)</g))
      assert.equal(label.trim(), titleCase(label.trim()));
    for (const [, label] of html.matchAll(/class="pix-btn[^"]*"[^>]*>([^<]+)</g))
      assert.equal(label.trim(), titleCase(label.trim()), label);
  }
  assert.deepEqual(g, normalizeLike(g), 'the round trip leaves a valid game');
});
const normalizeLike = (g) => JSON.parse(JSON.stringify(g));

test('page: the projector’s pieces are mirrored, the controls never are; no title= tooltips', () => {
  const html = pageMarkup();
  const mirrored = [...html.matchAll(/data-mirror="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(mirrored.sort(), ['banner', 'board', 'clock']);
  for (const control of ['data-hud', 'data-picker', 'data-setup']) {
    const at = html.indexOf(control);
    assert.ok(at > 0);
    assert.doesNotMatch(html.slice(html.lastIndexOf('<', at), at), /data-mirror/);
  }
  assert.doesNotMatch(html, /\stitle=/);
  for (const [, tab] of html.matchAll(/role="tab"[^>]*>([^<]+)</g)) assert.equal(tab, titleCase(tab));
});

test('overlay: modifier buttons are numbered for keys 1–9 and say what they give', () => {
  let g = newGame(env);
  for (let i = 0; i < 8; i++) g = reduce(g, { type: 'add', list: 'modifiers' }, env);
  const html = modsMarkup(g);
  assert.equal([...html.matchAll(/<kbd>/g)].length, 9, 'only the first nine have keys');
  assert.equal(modTag({ points: 50, mult: 1, special: true }), '+50 ★');
  assert.equal(modTag({ points: 0, mult: 2, special: false }), '×2');
  assert.doesNotMatch(html, /\stitle=/);
});

test('keys: the list people read and the keys the overlay takes are the same', () => {
  const src = readFileSync(new URL('../src/larp/overlay.js', import.meta.url), 'utf8');
  const table = src.slice(src.indexOf('const byKey = {'), src.indexOf('};', src.indexOf('const byKey = {')));
  const handled = new Set([...table.matchAll(/^\s+(?:'([^']*)'|(\w+)):/gm)].map((m) => m[1] ?? m[2]));
  const listed = KEY_GROUPS.flatMap((g) => g.keys.flatMap((r) => r.keys));
  const expected = {
    Space: [' '],
    '+': ['+'],
    R: ['r'],
    '← / →': ['ArrowLeft', 'ArrowRight'],
    Z: ['z'],
    K: ['k'],
    O: ['o'],
    F: ['f'],
    H: ['h'],
    S: ['s'],
  };
  for (const key of listed) {
    if (key === '1–9' || key === 'Esc' || key === '?') continue; // (the picker's and the help key's, before the table)
    assert.ok(expected[key], `${key} is listed: the test knows it`);
    for (const k of expected[key]) assert.ok(handled.has(k), `${key} is handled (${k})`);
  }
  for (const k of handled) {
    if (k === '=') continue; // (= is + unshifted)
    assert.ok(Object.values(expected).flat().includes(k), `${k} is handled: it's listed`);
  }
  assert.match(src, /isHelpKey\(e\)/);
  assert.match(src, /e\.key === 'Escape'/);
  assert.match(src, /Digit\[1-9\]/);
  for (const g of KEY_GROUPS) assert.equal(g.title, titleCase(g.title));
});
