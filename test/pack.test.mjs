// The pack (src/ui/pack.js): its pixel icons (src/ui/pixelArt.js) and the bonfire's three
// items, whose lists follow what the fire is doing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, pixelSvg } from '../src/ui/pixelArt.js';
import { bonfireItems } from '../src/ui/pack.js';
import { weapons } from '../src/content.js';
import { SCENERIES } from '../src/sceneries.js';
import { flames, rotation } from '../src/palette.js';

test('pixel icons: every frame is 16×16 and draws line and accent pixels', () => {
  for (const [name, frames] of Object.entries(ICONS)) {
    for (const rows of frames) {
      assert.equal(rows.length, 16, `${name}: 16 rows`);
      for (const row of rows) assert.match(row, /^[.#+]{16}$/, `${name}: "${row}"`);
    }
    const svg = pixelSvg(frames);
    assert.match(svg, /class="px-line" d="M/, `${name} has line art`);
    assert.equal((svg.match(/<g class="px-f/g) ?? []).length, frames.length, `${name}: one group per frame`);
  }
  assert.throws(() => pixelSvg([['#'.repeat(15)]]), /15 wide/);
});

test('pack items: scenes, weapons and spells follow the fire', () => {
  const calls = [];
  const [flameA, flameB] = rotation();
  let state = { scenery: 'forge', weapon: 'katana', element: 'ice', flame: flameA };
  let busy = false;
  const items = bonfireItems({
    state: () => state,
    busy: () => busy,
    onScene: (k) => calls.push(['scene', k]),
    onWeapon: (k) => calls.push(['weapon', k]),
    onRing: () => calls.push(['ring']),
    onLiving: () => calls.push(['living']),
    onElement: (k) => calls.push(['element', k]),
    onFlame: (k) => calls.push(['flame', k]),
  });
  const [map, anvil, tome] = items;
  assert.deepEqual(items.map((i) => i.id), ['map', 'anvil', 'tome']);

  assert.deepEqual(map.options().map((o) => o.id), Object.keys(SCENERIES));
  assert.deepEqual(map.options().filter((o) => o.current).map((o) => o.id), ['forge']);
  assert.equal(anvil.options().length, Object.keys(weapons).length, 'every weapon, even ones out of the draw');
  assert.deepEqual(anvil.options().filter((o) => o.current).map((o) => o.id), ['katana']);

  const spells = tome.options();
  assert.equal(spells[0].label, 'Ring of Frost', 'the ring is named for the element');
  assert.equal(spells.find((o) => o.id === 'living').disabled, false);
  assert.deepEqual(spells.filter((o) => o.current).map((o) => o.id), ['element:ice', `flame:${flameA}`]);
  const colors = spells.filter((o) => o.id?.startsWith('flame:'));
  assert.equal(colors.length, rotation().length, 'every bonfire color in rotation');
  assert.ok(colors.every((o) => /^#[0-9a-f]{6}$/i.test(o.swatch)), 'each with a swatch');
  assert.match(colors[0].label, /Frost$/, 'named for the element it burns as now');
  assert.equal(colors[0].swatch, flames[flameA].ramp[2]);
  busy = true;
  assert.equal(tome.options().find((o) => o.id === 'living').disabled, true, 'no living weapon mid-forge');
  state = { ...state, element: 'lightning' };
  assert.equal(tome.options()[0].label, 'Ring of Lightning');

  map.pick('shrine'); anvil.pick('spear'); tome.pick('ring'); tome.pick('living'); tome.pick('element:fire'); tome.pick(`flame:${flameB}`);
  assert.deepEqual(calls, [['scene', 'shrine'], ['weapon', 'spear'], ['ring'], ['living'], ['element', 'fire'], ['flame', flameB]]);

  state = null; // (the scene hasn't loaded)
  assert.ok(map.options().every((o) => o.disabled) && tome.options().filter((o) => !o.heading).every((o) => o.disabled));
});
