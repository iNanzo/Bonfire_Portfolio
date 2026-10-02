// The visualizer's variety: made palettes and recolored scenery (colors.js), and a scene's
// registered flame and pinned scenery colors; looks, layers,
// blend modes, drop hits and every effect's off / in the mix / always switch (looks.js);
// firefly moves (fireflyMoves.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base, flames } from '../src/palette.js';
import { contrast } from '../src/contentRules.js';
import { createColors, colorName } from '../src/visualizer/colors.js';
import { createLooks, BLEND, DROP_FX, LAYERS, LOOKS, MIRRORS } from '../src/visualizer/looks.js';
import { createFireflyMoves, FLY_MOVES, anyDirection } from '../src/visualizer/fireflyMoves.js';

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

test('recolored scenery: any flame, new colors each landing, readable; off brings the site’s back', () => {
  const settings = { colors: 'site', scheme: 'auto', sceneColors: 'on' };
  const colors = createColors(settings);
  const site = { ...base };
  const settle = () => {
    while (colors.update(0.05));
  };
  const voids = new Set();
  for (const key of ['ember', 'ember', Object.keys(flames).find((k) => k !== 'ember')]) {
    colors.landed(key);
    settle();
    assert.ok(colors.scenery, `${key}: a site palette recolors the scenery too`);
    assert.equal(base.void, colors.scenery.void);
    assert.ok(contrast(flames[key].ramp[2], base.void) >= 4.5, 'the flame’s tips still read on the new background');
    voids.add(base.void);
  }
  assert.equal(voids.size, 3, 'a new set every landing, even for the same flame');
  assert.notEqual(base.stone, site.stone);
  settings.sceneColors = 'off';
  colors.landed('ember');
  settle();
  assert.equal(colors.scenery, null);
  assert.deepEqual({ ...base }, site);
  settings.sceneColors = 'mix';
  let recolored = 0;
  for (let i = 0; i < 60; i++) {
    colors.landed('ember');
    settle();
    if (colors.scenery) recolored++;
  }
  assert.ok(recolored > 12 && recolored < 48, `in the mix: some flames (${recolored}/60)`);
  settings.sceneColors = 'off';
  colors.landed('ember');
  settle();
});

test('a scene’s flame: registered, hidden, never pruned; its scenery colors held through landings', () => {
  const settings = { colors: 'harmonious', scheme: 'auto', sceneColors: 'on' };
  const colors = createColors(settings);
  const site = { ...base };
  const settle = () => {
    while (colors.update(0.05));
  };
  const ramp = { lo: '#1a3050', mid: '#3070b0', hi: '#90d0ff', core: '#f0faff', shade: '#202838', light: 0.3 };
  const key = colors.register('scene-b-frozen', ramp);
  assert.equal(key, 'scene-b-frozen');
  assert.deepEqual(flames[key].ramp, ['#1a3050', '#3070b0', '#90d0ff', '#f0faff']);
  assert.ok(flames[key].hidden, 'out of the site’s rotation');
  assert.match(flames[key].name, /^[A-Z][a-z]+ Flame$/);
  let k = key;
  for (let i = 0; i < 20; i++) k = colors.next(k);
  assert.ok(flames[key], 'still there after 20 made palettes');
  assert.deepEqual(colors.registered, [key]);
  settings.colors = 'site';
  const siteKeys = Object.keys(flames).filter((f) => !f.startsWith('live-') && f !== key);
  let at = siteKeys[0];
  for (let i = 0; i < siteKeys.length + 2; i++) {
    at = colors.next(at, 1);
    assert.notEqual(at, key, 'the arrows walk the site’s palettes only');
  }
  // Pinned scenery colors: held, a landing leaves them be; released, the next landing recolors.
  const scene = { void: '#05060a', shadow: '#10141c', stone: '#28303c', wood: '#3a3028', bone: '#d8e0e8' };
  colors.pinScenery(scene);
  settle();
  assert.deepEqual({ ...base }, { ...site, ...scene });
  assert.equal(colors.held, true);
  colors.landed('ember');
  settle();
  assert.equal(base.stone, scene.stone, 'a landing leaves the scene’s colors alone');
  colors.release();
  colors.landed('ember');
  settle();
  assert.notEqual(base.stone, scene.stone, 'released: the next landing recolors');
  // null: the site's own, held.
  colors.pinScenery(null, { seconds: 0.1 });
  settle();
  assert.deepEqual({ ...base }, site);
  colors.landed('ember');
  settle();
  assert.deepEqual({ ...base }, site);
  colors.release();
  colors.unregister(key);
  assert.equal(flames[key], undefined);
  settings.sceneColors = 'off';
  colors.landed('ember');
  settle();
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
  const frame = () =>
    looks.update(1 / 60, { amt: 1, build: 0, low: false, energy: 0.5, mirror: 'off', scanlines: 'off' });
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

const every = (mode, names) => Object.fromEntries(Object.keys(names).map((k) => [k, mode]));
const offLayers = every('off', LAYERS);
const frame = (looks, modes, dt = 0) =>
  looks.update(dt, { amt: 1, build: 0, low: false, energy: 0.5, modes: { ...offLayers, ...modes } });

test('mirror and scanlines: off, in the mix, always', () => {
  const g = {};
  const looks = createLooks(g);
  const counts = { off: 0, mix: 0, on: 0 };
  const turns = { ember: 'mix', glitch: 'mix', haze: 'mix' };
  for (let i = 0; i < 200; i++) {
    looks.next(turns);
    for (const mode of ['off', 'mix', 'on']) {
      frame(looks, { looks: turns, mirror: mode, scanlines: mode });
      if (g.mirror > 0) counts[mode]++;
      if (mode === 'on') assert.ok(g.mirror >= 1 && g.mirror <= 8 && g.scan > 0);
      if (mode === 'off') assert.equal(g.scan, 0);
    }
  }
  assert.equal(counts.off, 0);
  assert.equal(counts.on, 200);
  assert.ok(counts.mix > 30 && counts.mix < 100, `some looks roll a mirror (${counts.mix}/200)`);
});

test('mirror kinds: horizontal, vertical and quarter, only those switched on', () => {
  const g = {};
  const looks = createLooks(g);
  const MODES = { horizontal: [1, 2], vertical: [3, 6], quarter: [4, 5, 7, 8] };
  const turns = { ember: 'mix', glitch: 'mix', haze: 'mix' };
  const seenAll = new Set();
  for (const kind of Object.keys(MIRRORS)) {
    const mirrors = Object.fromEntries(Object.keys(MIRRORS).map((k) => [k, k === kind]));
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      looks.next(turns);
      frame(looks, { looks: turns, mirror: 'on', mirrors });
      seen.add(g.mirror);
      seenAll.add(g.mirror);
    }
    assert.deepEqual([...seen].sort(), MODES[kind], `${kind} mirrors`);
  }
  assert.equal(seenAll.size, 8);
  // The drop's mirror flips keep to the kinds switched on too.
  looks.drop({ flips: 'mix' }, 1);
  for (let i = 0; i < 40; i++) {
    looks.beat(1, false, 0.5);
    frame(looks, { mirror: 'off', mirrors: { vertical: true } }, 0.01);
    assert.ok([3, 6].includes(g.mirror));
  }
});

test('looks: in the mix they take turns, always ones stay on under them, off never plays', () => {
  const g = {};
  const looks = createLooks(g);
  const modes = { ...every('off', LOOKS), glitch: 'mix', echo: 'mix', kaleido: 'on' };
  const turns = new Set();
  for (let i = 0; i < 60; i++) {
    looks.next(modes);
    frame(looks, { looks: modes });
    turns.add(looks.look);
    assert.ok(g.kaleido > 0, 'the kaleidoscope, always on, plays under every turn');
    assert.deepEqual(looks.playing, [looks.look, 'kaleido']);
  }
  assert.deepEqual([...turns].sort(), ['echo', 'glitch'], 'only looks in the mix take turns');
  // None in the mix: the clean fire takes the turn, the always ones still play.
  const none = { ...every('off', LOOKS), prism: 'on' };
  looks.sync(none);
  frame(looks, { looks: none });
  assert.equal(looks.look, 'ember');
  assert.deepEqual(looks.playing, ['prism']);
  // A look switched out of the mix hands its turn on.
  const moved = { ...every('off', LOOKS), haze: 'mix' };
  looks.sync(moved);
  assert.equal(looks.look, 'haze');
});

test('drop hits set to always come with every drop', () => {
  const looks = createLooks({});
  const modes = { ...every('mix', DROP_FX), iris: 'on', shock: 'off' };
  for (let i = 0; i < 40; i++) {
    const names = looks.drop(modes, 3);
    assert.ok(names.includes(DROP_FX.iris));
    assert.ok(!names.includes(DROP_FX.shock));
    assert.ok(names.length >= 2 && names.length <= 3, 'always ones plus at least one from the mix, up to the count');
  }
  assert.deepEqual(looks.drop({ ...every('off', DROP_FX), slam: 'on', ink: 'on' }, 1), [DROP_FX.slam, DROP_FX.ink]);
});

test('layers: off, always, and a mix that re-rolls with each look, at most two heavy at once', () => {
  const g = {};
  const looks = createLooks(g);
  const turns = { ...every('mix', LOOKS) };
  const heavy = { ghost: 'ghost', blur: 'blur', glow: 'glow', gradient: 'grad', flicker: 'flicker' };
  const on = (k) =>
    k === 'paint'
      ? g.style === 1
      : k === 'wash'
        ? g.style === 2
        : k === 'flicker'
          ? g.flickerMode >= 0 && g.flicker > 0
          : g[heavy[k]] > 0;
  // Always: on every turn (the beat dip flicker needs a beat).
  for (let i = 0; i < 20; i++) {
    looks.next(turns);
    looks.beat(1, true);
    frame(looks, { looks: turns, ...every('on', LAYERS), paint: 'off' });
    for (const k of ['ghost', 'blur', 'glow', 'gradient', 'wash', 'flicker']) assert.ok(on(k), `${k} always on`);
  }
  // Off: never.
  for (let i = 0; i < 20; i++) {
    looks.next(turns);
    frame(looks, { looks: turns });
    assert.ok(!g.ghost && !g.blur && !g.glow && !g.grad && !g.style && !g.flicker);
  }
  // In the mix: each comes and goes; never more than two of the heavy ones.
  const seen = Object.fromEntries(['ghost', 'blur', 'glow', 'gradient', 'paint', 'wash'].map((k) => [k, 0]));
  for (let i = 0; i < 300; i++) {
    looks.next(turns);
    frame(looks, { looks: turns, ...every('mix', LAYERS), flicker: 'off' });
    const lit = Object.keys(seen).filter(on);
    lit.forEach((k) => seen[k]++);
    assert.ok(lit.length <= 2, `at most two heavy layers (${lit})`);
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 15 && n < 200, `${k} comes and goes (${n}/300)`);
  // The details change from turn to turn.
  const sizes = new Set();
  for (let i = 0; i < 10; i++) {
    looks.next(turns);
    frame(looks, { looks: turns, glow: 'on' });
    sizes.add(g.glowSize.toFixed(3));
  }
  assert.ok(sizes.size > 5);
});

test('blend modes: classic when off, rolled when on', () => {
  const g = {};
  const looks = createLooks(g);
  const turns = { ...every('mix', LOOKS) };
  for (let i = 0; i < 10; i++) {
    looks.next(turns);
    frame(looks, { looks: turns, blend: 'off' });
    assert.deepEqual(
      [g.feedMode, g.ghostMode, g.warpMode, g.warpMix, g.inkMode, g.invertMode, g.scanBlend, g.glowMode],
      [BLEND.lighten, BLEND.normal, BLEND.normal, 1, BLEND.normal, BLEND.normal, BLEND.multiply, BLEND.add],
    );
  }
  const feeds = new Set();
  const warps = new Set();
  for (let i = 0; i < 80; i++) {
    looks.next(turns);
    frame(looks, { looks: turns, blend: 'on' });
    feeds.add(g.feedMode);
    warps.add(g.warpMode);
    assert.ok(
      [BLEND.lighten, BLEND.screen, BLEND.difference, BLEND.exclusion].includes(g.feedMode),
      'echoes only blend where black changes nothing',
    );
    assert.ok(g.warpMix > 0.4 && g.warpMix < 1);
  }
  assert.ok(feeds.size >= 3 && warps.size >= 4);
});

test('the director’s effect switches: off, in the mix, always', () => {
  const looks = createLooks({});
  let rolled = 0;
  for (let i = 0; i < 200; i++) {
    looks.next({ ember: 'mix', glitch: 'mix' });
    assert.equal(looks.active('sparks', 'on'), true);
    assert.equal(looks.active('sparks', 'off'), false);
    assert.equal(looks.active('sparks', true), true, 'an old saved "on" still counts');
    if (looks.active('flash', 'mix')) rolled++;
  }
  assert.ok(rolled > 60 && rolled < 140, `a flash in the mix comes with some looks (${rolled}/200)`);
});

test('firefly moves: each keeps its own time, on the beat grid', () => {
  const darts = [];
  const flies = Array.from({ length: 12 }, (_, i) => ({
    mode: 'fly',
    orbit: null,
    pos: { x: Math.cos(i), y: 1, z: Math.sin(i) },
  }));
  const fl = {
    flies,
    center: { x: 0, z: 0 },
    dart: (f, dir, o) => {
      darts.push({ i: flies.indexOf(f), dir, ...o });
      return true;
    },
    dance() {
      darts.push({ dance: true });
    },
    lift() {},
  };
  const moves = createFireflyMoves();
  const period = 0.5;
  const run = (from, to) => {
    for (let b = from; b < to; b += 0.05) moves.update(fl, { beatPos: b, period, energy: 0.5 });
  };
  for (const name of Object.keys(FLY_MOVES).filter((k) => k !== 'swing')) {
    moves.set(name);
    darts.length = 0;
    run(0, 8);
    assert.ok(darts.length > 10, `${name} moves them`);
    assert.ok(
      darts.every((d) => d.dur > 0 && d.dur <= 2 * period && d.dist > 0),
      `${name}: dashes fit the beat`,
    );
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

test('firefly darts any way: every direction on the sphere, leaned back in when they stray', () => {
  const center = { x: 0, z: 0 };
  let up = 0,
    down = 0,
    diagonal = 0;
  const headings = new Set();
  for (let i = 0; i < 2000; i++) {
    const d = anyDirection({ x: 0.5, y: 1, z: 0.3 }, center);
    assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9, 'unit length');
    if (d.y > 0.5) up++;
    if (d.y < -0.5) down++;
    if (Math.abs(d.y) > 0.3 && Math.abs(d.y) < 0.8) diagonal++;
    headings.add(Math.floor(((Math.atan2(d.z, d.x) + Math.PI) / (2 * Math.PI)) * 16));
  }
  assert.ok(up > 300 && down > 300, `up ${up} and down ${down}, not only level`);
  assert.ok(diagonal > 400, 'tilted ways too, not just the six cardinal ones');
  assert.equal(headings.size, 16, 'every heading round');
  // Far out, it never heads further out; near the ground, never further down.
  for (let i = 0; i < 500; i++) {
    const far = anyDirection({ x: 2.5, y: 1, z: 0 }, center);
    assert.ok(far.x <= 0.01, 'a stray one comes back toward the fire');
    const low = anyDirection({ x: 0, y: 0.2, z: 0 }, center);
    assert.ok(low.y > 0, 'a low one heads up');
  }
});

test('grain, cinema bars, spotlight and chroma split: off, always, in the mix, each rolled anew', () => {
  const g = {};
  const looks = createLooks(g);
  const turns = { ...every('mix', LOOKS), glitch: 'off', prism: 'off' }; // (their own tears and splits aside)
  const NEW = ['grain', 'cinema', 'spotlight', 'chroma'];
  const settle = (modes) => {
    for (let i = 0; i < 90; i++) frame(looks, { looks: turns, ...modes }, 1 / 30);
  };
  const lit = {
    grain: () => g.noise > 0.05,
    cinema: () => g.letterbox > 0.05,
    spotlight: () => g.iris < 1,
    chroma: () => g.split >= 1,
  };
  for (const k of NEW) {
    looks.next(turns);
    settle({ [k]: 'on' });
    assert.ok(lit[k](), `${k} always: on`);
    settle({ [k]: 'off' });
    assert.ok(!lit[k](), `${k} off: gone again`);
  }
  // In the mix: some looks' turns.
  const seen = Object.fromEntries(NEW.map((k) => [k, 0]));
  const details = { cinema: new Set(), spotlight: new Set() };
  for (let i = 0; i < 120; i++) {
    looks.next(turns);
    settle(every('mix', { grain: 1, cinema: 1, spotlight: 1, chroma: 1 }));
    for (const k of NEW) if (lit[k]()) seen[k]++;
    if (lit.cinema()) details.cinema.add(g.letterbox.toFixed(3));
    if (lit.spotlight()) details.spotlight.add(g.iris.toFixed(2));
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 6 && n < 110, `${k} comes and goes (${n}/120)`);
  assert.ok(details.cinema.size > 3 && details.spotlight.size > 3, 'their size is rolled each time');
});

test('the new framing layers keep the breakdown’s bars and the drop’s snaps', () => {
  const g = {};
  const looks = createLooks(g);
  const turns = { ...every('mix', LOOKS) };
  looks.next(turns);
  for (let i = 0; i < 90; i++)
    looks.update(1 / 30, { amt: 1, build: 0.9, low: true, energy: 0.5, modes: { ...offLayers, looks: turns } });
  const barsOnly = g.letterbox;
  assert.ok(barsOnly > 0.05 && g.iris < 1, 'a breakdown frames itself');
  for (let i = 0; i < 90; i++)
    looks.update(1 / 30, {
      amt: 1,
      build: 0.9,
      low: true,
      energy: 0.5,
      modes: { ...offLayers, looks: turns, cinema: 'on', spotlight: 'on' },
    });
  assert.ok(g.letterbox >= barsOnly - 1e-9, 'whichever bars are taller win');
  looks.drop({ iris: 'on' }, 1);
  looks.update(1 / 60, {
    amt: 1,
    build: 0,
    low: false,
    energy: 0.5,
    modes: { ...offLayers, looks: turns, spotlight: 'on' },
  });
  assert.ok(g.iris < 0.2, 'the drop’s iris snap still shuts it');
});

test('the X-Ray drop hit is drawn like any other, with no timer of its own here', () => {
  const looks = createLooks({});
  const turn = looks.turn;
  for (let i = 0; i < 20; i++) assert.deepEqual(looks.drop({ xray: 'on' }, 1), [DROP_FX.xray]);
  looks.update(1, { amt: 1, build: 0, low: false, energy: 0.5 });
  assert.equal(looks.turn, turn, 'a drop hit doesn’t roll a new turn');
  looks.next({ ember: 'mix', glitch: 'mix' });
  assert.equal(looks.turn, turn + 1, 'a new look does');
});
