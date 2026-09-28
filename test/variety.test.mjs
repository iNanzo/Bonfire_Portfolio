// The visualizer's variety: made palettes (colors.js), drop hits (looks.js) and firefly
// moves (fireflyMoves.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base, flames } from '../src/palette.js';
import { contrast } from '../src/contentRules.js';
import { createColors, colorName } from '../src/visualizer/colors.js';
import { createLooks, DROP_FX } from '../src/visualizer/looks.js';
import { createFireflyMoves, FLY_MOVES } from '../src/visualizer/fireflyMoves.js';

// colors.update() writes the page's CSS palette when a scenery blend ends.
globalThis.document ??= { documentElement: { style: { setProperty() {} } } };

test('made palettes: readable, named for their hue, kept to a few', () => {
  const settings = { colors: 'harmonious', scheme: 'auto', sceneColors: false };
  const colors = createColors(settings);
  const made = new Set();
  let key = Object.keys(flames)[0];
  for (let i = 0; i < 30; i++) {
    settings.colors = i % 2 ? 'wild' : 'harmonious';
    key = colors.next(key);
    made.add(key);
    const f = flames[key];
    assert.match(key, /^live-\d+$/);
    assert.ok(f.hidden, 'made palettes stay out of the site’s rotation');
    assert.ok(contrast(f.ramp[2], base.void) >= 4.5, `${key}: its tips must read as text on the background`);
    assert.match(f.name, /^[A-Z][a-z]+ Flame$/);
  }
  const live = Object.keys(flames).filter((k) => k.startsWith('live-'));
  assert.ok(live.length <= 6, `only the last few are kept (${live.length})`);
  assert.ok(live.includes(key), 'the one burning is kept');
  assert.equal(colorName('#808080'), 'Ashen');
  assert.equal(colorName('#2050ff'), 'Cobalt');
});

test('site colors, arrow steps, and the mix', () => {
  const settings = { colors: 'site', scheme: 'auto', sceneColors: false };
  const colors = createColors(settings);
  const site = Object.keys(flames).filter((k) => !k.startsWith('live-'));
  for (let i = 0; i < 20; i++) {
    const k = colors.next(site[0]);
    assert.ok(site.includes(k) && k !== site[0]);
  }
  assert.equal(colors.next(site[0], 1), site[1]);
  assert.equal(colors.next(site[0], -1), site.at(-1));
  settings.colors = 'mix';
  const kinds = new Set();
  for (let i = 0; i < 60; i++) kinds.add(colors.next(site[0]).startsWith('live-') ? 'made' : 'site');
  assert.deepEqual([...kinds].sort(), ['made', 'site']);
});

test('recolored scenery blends in with a made palette and back out with a site one', () => {
  const settings = { colors: 'harmonious', scheme: 'triadic', sceneColors: true };
  const colors = createColors(settings);
  const site = { ...base };
  const key = colors.next('ember');
  colors.landed(key);
  for (let i = 0; i < 100; i++) colors.update(0.02);
  assert.equal(base.void, flames[key].scene.void);
  assert.notEqual(base.stone, site.stone);
  colors.landed('ember');
  while (colors.update(0.05));
  assert.deepEqual({ ...base }, site);
});

test('drops draw a different set of hits each time, only from those switched on', () => {
  const g = {};
  const looks = createLooks(g);
  const enabled = Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, true]));
  let last = null;
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const names = looks.drop(enabled, 3);
    assert.ok(names.length >= 1 && names.length <= 3);
    assert.equal(new Set(names).size, names.length);
    const set = names.slice().sort().join();
    assert.notEqual(set, last, 'never the same set twice running');
    last = set;
    names.forEach((n) => seen.add(n));
    looks.update(1, { amt: 1, build: 0, low: false, energy: 0.5 });
  }
  assert.equal(seen.size, Object.keys(DROP_FX).length, 'every hit comes up');
  const only = { shock: true, iris: true };
  for (let i = 0; i < 20; i++) assert.ok(looks.drop(only, 2).every((n) => n === DROP_FX.shock || n === DROP_FX.iris));
  assert.deepEqual(looks.drop({}, 2), []);
});

test('a drop hit shows up in the pixel pass, then clears', () => {
  const g = {};
  const looks = createLooks(g);
  const frame = () => looks.update(1 / 60, { amt: 1, build: 0, low: false, energy: 0.5, mirror: 'off', scanlines: 'off' });
  frame();
  looks.drop({ iris: true }, 1);
  frame();
  assert.ok(g.iris < 0.5, 'the iris snaps shut...');
  for (let i = 0; i < 60; i++) frame();
  assert.equal(g.iris, 2, '...and opens');
  looks.drop({ spiral: true }, 1);
  frame();
  assert.ok(g.feedback > 0.5 && g.feedRot !== 0, 'a spiral turns the echoes');
});

test('mirror and scanlines: off, in the mix, always', () => {
  const g = {};
  const looks = createLooks(g);
  const counts = { off: 0, mix: 0, on: 0 };
  for (let i = 0; i < 200; i++) {
    looks.next(Object.fromEntries(['ember', 'glitch', 'haze'].map((k) => [k, true])));
    for (const mode of ['off', 'mix', 'on']) {
      looks.update(0, { amt: 1, build: 0, low: false, energy: 0, mirror: mode, scanlines: mode });
      if (g.mirror > 0) counts[mode]++;
      if (mode === 'on') assert.ok(g.mirror >= 1 && g.mirror <= 4 && g.scan > 0);
      if (mode === 'off') assert.equal(g.scan, 0);
    }
  }
  assert.equal(counts.off, 0);
  assert.equal(counts.on, 200);
  assert.ok(counts.mix > 30 && counts.mix < 100, `some looks roll a mirror (${counts.mix}/200)`);
});

test('firefly moves: each keeps its own time, on the beat grid', () => {
  const darts = [];
  const flies = Array.from({ length: 12 }, (_, i) => ({ mode: 'fly', orbit: null, pos: { x: Math.cos(i), y: 1, z: Math.sin(i) } }));
  const fl = {
    flies, center: { x: 0, z: 0 },
    dart: (f, dir, o) => { darts.push({ i: flies.indexOf(f), dir, ...o }); return true; },
    dance() { darts.push({ dance: true }); },
    lift() {},
  };
  const moves = createFireflyMoves();
  const period = 0.5;
  const run = (from, to) => { for (let b = from; b < to; b += 0.05) moves.update(fl, { beatPos: b, period, energy: 0.5 }); };
  for (const name of Object.keys(FLY_MOVES).filter((k) => k !== 'swing')) {
    moves.set(name);
    darts.length = 0;
    run(0, 8);
    assert.ok(darts.length > 10, `${name} moves them`);
    assert.ok(darts.every((d) => d.dur > 0 && d.dur <= 2 * period && d.dist > 0), `${name}: dashes fit the beat`);
    if (name === 'compass') {
      const dirs = [...new Set(darts.map((d) => d.dir))];
      assert.deepEqual(dirs.sort(), ['down', 'left', 'right', 'up']);
    }
    if (name === 'bounce') assert.ok(darts.every((d) => d.dir === 'up' && d.bounce));
  }
  // Swing is the hop on the beat, not dashes.
  moves.set('swing');
  darts.length = 0;
  run(0, 4);
  assert.equal(darts.length, 0);
  moves.beat(1, true, fl, 1);
  assert.deepEqual(darts, [{ dance: true }]);
});
