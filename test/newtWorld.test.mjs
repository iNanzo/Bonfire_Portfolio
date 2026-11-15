import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createFireDuck } from '../src/visualizer/newt/fireDuck.js';
import { pageOf, PAGES } from '../src/visualizer/newt/pages.js';
import { createDirector } from '../src/visualizer/director.js';
import { bars, FRAME, settingsWith, seeded } from './lib/fakeScene.mjs';

test('duck imports no three and implements every Live scene member, including swing', () => {
  const source = readFileSync('src/visualizer/newt/fireDuck.js', 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(imports.every((s) => !s.includes('three')));
  const members = new Set(['canvas', 'onRendered']);
  for (const file of readdirSync('src/visualizer').filter((f) => f.endsWith('.js'))) {
    const js = readFileSync(`src/visualizer/${file}`, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    for (const match of js.matchAll(/\b(?:fire|candidate)\s*\??\.\s*(\w+)/g)) members.add(match[1]);
  }
  assert.ok(members.has('swing'));
  const duck = createFireDuck();
  for (const member of members) assert.ok(member in duck, member);
});

test('letterless equip timing, hold, pace, instant, release and cancellation', async () => {
  const impacts = [];
  const duck = createFireDuck({ onImpact: (...args) => impacts.push(args) });
  const held = duck.equip('axe', 'azure', { hold: true, element: 'lightning' });
  duck.step(10);
  assert.equal(duck.holding, true);
  assert.equal(duck.forging, true);
  assert.equal(impacts.length, 0);
  assert.equal(duck.release(), true);
  duck.step(duck.swapTime);
  assert.deepEqual(await held, { status: 'applied' });
  assert.equal(impacts[0].length, 4);
  assert.deepEqual(impacts[0], [
    'azure',
    'ember',
    false,
    { weapon: 'axe', flame: 'azure', item: null, element: 'lightning' },
  ]);
  assert.equal(duck.release(), false);
  await duck.equip('axe', 'ember');
  assert.equal(impacts.at(-1)[2], true);
  const paced = duck.equip('spear', 'azure', { pace: 2 });
  duck.step(0.69);
  assert.equal(duck.forging, true);
  duck.step(0.02);
  await paced;
  const cancelled = duck.equip('axe', 'ember');
  await duck.equip('spear', 'azure', { instant: true });
  assert.deepEqual(await cancelled, { status: 'cancelled' });
  const disposed = duck.equip('axe', 'ember');
  duck.dispose();
  assert.deepEqual(await disposed, { status: 'cancelled' });
  assert.equal(await duck.swing(), false);
});

test('real director runs 64 bars, breakdown, build and drop over duck', () => {
  const random = Math.random;
  Math.random = seeded(123);
  try {
    const impacts = [];
    const duck = createFireDuck({ onImpact: (...args) => impacts.push(args) });
    const director = createDirector(duck, {
      settings: settingsWith({ world: 'newt', scenes: 'off' }),
      scenes: () => [],
      onEvent() {},
    });
    bars(director, 64);
    duck.step(100);
    bars(director, 4, { from: 65, state: 'breakdown', first: ['breakdown'] });
    assert.ok(duck.calls.some(([name, , , o]) => name === 'equip' && o.hold));
    assert.equal(duck.holding, true);
    bars(director, 4, { from: 69, state: 'build', first: ['build'] });
    director.update({ ...FRAME, events: ['drop'], drop: 'big', locked: true, bpm: 126 }, 0.016);
    assert.ok(duck.calls.some(([name]) => name === 'release'));
    assert.equal(duck.holding, false);
    duck.step(100);
    assert.ok(impacts.length > 0);
    // Execute main.js's actual impact callback with a minimal DOM/director fixture.
    const main = readFileSync('src/visualizer/main.js', 'utf8');
    const callback = main.match(/function onImpact\([^]*?\n\}/)[0];
    const document = { documentElement: { dataset: {} } };
    const wield = {};
    const impact = new Function(
      'document',
      'q',
      'elementOr',
      'wieldLabel',
      'applyFlame',
      'ctx',
      `${callback}; return onImpact;`,
    )(
      document,
      () => wield,
      (v) => v,
      (v) => v.weapon,
      () => {},
      { director },
    );
    for (const args of impacts) {
      assert.equal(args.length, 4);
      assert.doesNotThrow(() => impact(...args));
    }
    assert.ok(document.documentElement.dataset.flame);
  } finally {
    Math.random = random;
  }
});

test('paper palettes have sixteen slots and light pages substitute ice', async () => {
  assert.equal(pageOf('unknown'), PAGES.dusk);
  for (const [key, page] of Object.entries(PAGES)) {
    assert.equal(page.palette.length, 16);
    assert.equal(page.palette[0], page.ink);
    assert.equal(page.palette[1], page.color);
    const duck = createFireDuck({ page: key });
    await duck.equip('axe', 'ember', { instant: true, element: 'lightning' });
    assert.equal(duck.element, page.light ? 'ice' : 'lightning');
    assert.equal(duck.snapshot().page.name, page.name);
  }
});
