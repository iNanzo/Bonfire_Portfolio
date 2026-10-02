// The pack (src/ui/pack.js): its pixel icons (src/ui/pixelArt.js), the bonfire's items
// (the knight's too, where the page has him), whose lists follow what the fire is doing,
// and how a list is fitted inside the window (the browser check is e2e/smoke.spec.mjs).
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
  assert.deepEqual(
    items.map((i) => i.id),
    ['map', 'anvil', 'tome'],
  );

  assert.deepEqual(
    map.options().map((o) => o.id),
    Object.keys(SCENERIES),
  );
  assert.deepEqual(
    map
      .options()
      .filter((o) => o.current)
      .map((o) => o.id),
    ['forge'],
  );
  // The Anvil: the living weapon first, then every weapon (even ones out of the draw) by kind.
  const forge = anvil.options();
  assert.equal(forge[0].id, 'living');
  assert.equal(forge[0].label, 'Living Weapon');
  assert.equal(forge[0].disabled, false);
  assert.deepEqual(
    forge.filter((o) => o.heading).map((o) => o.label),
    ['Swords', 'Greatswords', 'Polearms', 'Axes & Hammers'],
  );
  assert.deepEqual(
    forge
      .filter((o) => !o.heading && o.id !== 'living')
      .map((o) => o.id)
      .sort(),
    Object.keys(weapons).sort(),
    'every weapon, once',
  );
  assert.deepEqual(
    forge.filter((o) => o.current).map((o) => o.id),
    ['katana'],
  );
  const swords = forge.slice(
    forge.findIndex((o) => o.label === 'Swords') + 1,
    forge.findIndex((o) => o.label === 'Greatswords'),
  );
  assert.ok(
    swords.some((o) => o.id === 'longsword') && !swords.some((o) => o.id === 'spear'),
    'a sword under Swords, not a spear',
  );

  const spells = tome.options();
  assert.equal(spells[0].label, 'Ring of Frost', 'the ring is named for the element');
  assert.ok(!spells.some((o) => o.id === 'living'), 'the living weapon moved to the Anvil');
  assert.deepEqual(
    spells.filter((o) => o.heading).map((o) => o.label),
    ['Elements', 'Flame Colors'],
  );
  assert.deepEqual(
    spells.filter((o) => o.current).map((o) => o.id),
    ['element:ice', `flame:${flameA}`],
  );
  assert.ok(
    spells.filter((o) => o.id?.startsWith('element:')).every((o) => !o.tip),
    'no word on what else an element does unless the page says',
  );
  const colors = spells.filter((o) => o.id?.startsWith('flame:'));
  assert.equal(colors.length, rotation().length, 'every flame color in rotation');
  assert.ok(
    colors.every((o) => /^#[0-9a-f]{6}$/i.test(o.swatch)),
    'each with a swatch',
  );
  assert.match(colors[0].label, /Frost$/, 'named for the element it burns as now');
  assert.equal(colors[0].swatch, flames[flameA].ramp[2]);
  busy = true;
  assert.equal(anvil.options().find((o) => o.id === 'living').disabled, true, 'no living weapon mid-forge');
  state = { ...state, element: 'lightning' };
  assert.equal(tome.options()[0].label, 'Ring of Lightning');

  map.pick('shrine');
  anvil.pick('spear');
  tome.pick('ring');
  anvil.pick('living');
  tome.pick('element:fire');
  tome.pick(`flame:${flameB}`);
  assert.deepEqual(calls, [
    ['scene', 'shrine'],
    ['weapon', 'spear'],
    ['ring'],
    ['living'],
    ['element', 'fire'],
    ['flame', flameB],
  ]);

  state = null; // (the scene hasn't loaded)
  for (const it of [map, anvil, tome])
    assert.ok(
      it
        .options()
        .filter((o) => !o.heading)
        .every((o) => o.disabled),
      `${it.id}: nothing to pick yet`,
    );
});

test('pack items: the site’s elements say what else they do; reduced motion says why the ring and the living weapon are off', async () => {
  const { MOTION_OFF } = await import('../src/ui/pack.js');
  const base = {
    busy: () => false,
    onScene() {},
    onWeapon() {},
    onRing() {},
    onLiving() {},
    onElement() {},
    onFlame() {},
  };
  const state = () => ({ scenery: 'ruins', weapon: 'longsword', element: 'fire', flame: rotation()[0] });
  const [, anvil, tome] = bonfireItems({ ...base, state, elementTip: 'Also forges a new weapon.' });
  assert.ok(
    tome
      .options()
      .filter((o) => o.id?.startsWith('element:'))
      .every((o) => o.tip === 'Also forges a new weapon.'),
  );
  assert.ok(anvil.options()[0].tip, 'the living weapon says what it does');
  const [, stillAnvil, stillTome] = bonfireItems({ ...base, state, reducedMotion: true });
  for (const o of [stillAnvil.options()[0], stillTome.options()[0]]) {
    assert.equal(o.disabled, true, `${o.id}: motion`);
    assert.equal(o.tip, MOTION_OFF, `${o.id}: says why`);
  }
});

test('the Anvil’s groups: every weapon the model has is in exactly one, and each group has a heading in the content', async () => {
  const { WEAPON_GROUPS, WEAPON_KEYS, UI_HEADINGS } = await import('../src/contentRules.js');
  const { ui } = await import('../src/content.js');
  const all = Object.values(WEAPON_GROUPS).flat();
  assert.equal(all.length, new Set(all).size, 'no weapon in two groups');
  assert.deepEqual([...all].sort(), [...WEAPON_KEYS].sort(), 'every weapon in a group, and nothing else');
  const keys = { swords: 'packSwords', greatswords: 'packGreatswords', polearms: 'packPolearms', axes: 'packAxes' };
  assert.deepEqual(Object.keys(WEAPON_GROUPS), Object.keys(keys));
  for (const key of Object.values(keys)) {
    assert.ok(ui[key]?.trim(), `ui.${key} names its group`);
    assert.ok(UI_HEADINGS.includes(key), `ui.${key} can't be left blank`);
  }
});

test('pack lists: each heading’s group is labelled by it (not hidden from screen readers), with its note; options escaped, their tips read out; two columns counted by options', async () => {
  const { optionsHtml, packGroups } = await import('../src/ui/pack.js');
  const options = [
    { id: 'go', label: 'Go <now>' },
    { heading: true, label: 'Kinds & <Sorts>', note: 'Off: <reasons>.' },
    { id: 'a', label: 'A', current: true, tip: 'What "A" does' },
    { id: 'b', label: 'B', disabled: true },
    { heading: true, label: 'More' },
    { id: 'c', label: 'C', swatch: '#123456' },
  ];
  assert.deepEqual(
    packGroups(options).map((g) => [g.heading?.label ?? null, g.options.map((o) => o.id)]),
    [
      [null, ['go']],
      ['Kinds & <Sorts>', ['a', 'b']],
      ['More', ['c']],
    ],
  );
  const html = optionsHtml('anvil', options);
  assert.doesNotMatch(html, /aria-hidden="true">Kinds|class="pack-heading" aria-hidden/, 'headings are read out');
  assert.match(
    html,
    /<div class="pack-group" role="group" aria-labelledby="pack-anvil-g1" aria-describedby="pack-anvil-g1-why">\s*<p class="pack-heading" id="pack-anvil-g1">Kinds &amp; &lt;Sorts&gt;<\/p><p class="pack-why" id="pack-anvil-g1-why">Off: &lt;reasons&gt;.<\/p><ul class="pack-group-list" role="list">/,
  );
  assert.match(
    html,
    /<div class="pack-group" role="group" aria-labelledby="pack-anvil-g2">\s*<p class="pack-heading" id="pack-anvil-g2">More<\/p><ul/,
  );
  // An option's tip is its tooltip and, for a screen reader (the tooltip is aria-hidden), its description.
  assert.match(
    html,
    /data-pack-option="a"\s+aria-pressed="true" data-tip="What &quot;A&quot; does" aria-describedby="pack-anvil-tip1">[\s\S]*?<\/button><span id="pack-anvil-tip1" hidden>What &quot;A&quot; does<\/span><\/li>/,
  );
  assert.match(html, /data-pack-option="b"\s+aria-pressed="false" disabled>/);
  assert.ok(html.includes('Go &lt;now&gt;') && !html.includes('<now>'), 'labels escaped');
  assert.equal(
    (html.match(/<ul class="pack-group-list" role="list">/g) ?? []).length,
    3,
    'a list per group, the actions’ too',
  );
  // Two columns past 12 options, whatever the headings.
  const { isLong } = await import('../src/ui/pack.js');
  const opts = (n, headings) => [
    ...Array.from({ length: headings }, (_, i) => ({ heading: true, label: `H${i}` })),
    ...Array.from({ length: n }, (_, i) => ({ id: `o${i}`, label: `O${i}` })),
  ];
  assert.equal(isLong(opts(12, 4)), false, '12 options and 4 headings: one column');
  assert.equal(isLong(opts(13, 0)), true);
});

test('pack items: the knight is there only where the page has one; his helmets and gestures', async () => {
  const { HELMET_NAMES, GESTURE_NAMES } = await import('../src/ui/pack.js');
  const { HELMETS, GESTURES } = await import('../src/bonfire/knights.js');
  assert.deepEqual(Object.keys(HELMET_NAMES), HELMETS, 'a name for every helmet the model has');
  assert.deepEqual(Object.keys(GESTURE_NAMES), GESTURES, 'a name for every gesture');

  const base = {
    busy: () => false,
    onScene() {},
    onWeapon() {},
    onRing() {},
    onLiving() {},
    onElement() {},
    onFlame() {},
  };
  let state = { scenery: 'ruins', weapon: 'longsword', element: 'fire', flame: rotation()[0], helmet: 'armet' };
  assert.deepEqual(
    bonfireItems({ ...base, state: () => state }).map((i) => i.id),
    ['map', 'anvil', 'tome'],
    'no onHelmet: no knight item',
  );

  const calls = [];
  const items = bonfireItems({
    ...base,
    state: () => state,
    onHelmet: (k) => calls.push(['helmet', k]),
    onGesture: (g) => calls.push(['gesture', g]),
  });
  assert.deepEqual(
    items.map((i) => i.id),
    ['map', 'anvil', 'tome', 'knight'],
  );
  const knight = items[3];
  assert.equal(knight.icon, 'helm');
  assert.equal(knight.name, 'Knight');
  const opts = knight.options();
  assert.deepEqual(
    opts.filter((o) => o.heading).map((o) => o.label),
    ['Gestures', 'Helmet'],
    'gestures first',
  );
  assert.deepEqual(
    opts.filter((o) => o.id?.startsWith('helm:')).map((o) => o.label),
    ['Great Helm', 'Armet', 'Bascinet'],
  );
  assert.deepEqual(
    opts.filter((o) => o.id?.startsWith('gesture:')).map((o) => o.id),
    GESTURES.map((g) => `gesture:${g}`),
  );
  assert.equal(opts.find((o) => o.id === 'gesture:praise').label, 'Praise the Sun');
  assert.deepEqual(
    opts.filter((o) => o.current).map((o) => o.id),
    ['helm:armet'],
    'the helmet he has on (or is putting on)',
  );
  assert.ok(opts.filter((o) => !o.heading).every((o) => !o.disabled));

  knight.pick('helm:bascinet');
  knight.pick('gesture:praise');
  assert.deepEqual(calls, [
    ['helmet', 'bascinet'],
    ['gesture', 'praise'],
  ]);

  state = { ...state, helmet: null }; // (no knight: hidden, or still loading)
  assert.ok(
    knight
      .options()
      .filter((o) => !o.heading)
      .every((o) => o.disabled),
    'nothing to pick without him',
  );
  state = null;
  assert.ok(
    knight
      .options()
      .filter((o) => !o.heading)
      .every((o) => o.disabled),
  );

  // Reduced motion: he sits still, so no gestures (and the list says why); helmets still swap (at once).
  const { MOTION_OFF } = await import('../src/ui/pack.js');
  state = { scenery: 'ruins', weapon: 'longsword', element: 'fire', flame: rotation()[0], helmet: 'great' };
  const still = bonfireItems({ ...base, reducedMotion: true, state: () => state, onHelmet() {} })[3].options();
  assert.ok(still.filter((o) => o.id?.startsWith('helm:')).every((o) => !o.disabled));
  assert.ok(still.filter((o) => o.id?.startsWith('gesture:')).every((o) => o.disabled && o.tip === MOTION_OFF));
  assert.equal(still.find((o) => o.heading && o.label === 'Gestures').note, MOTION_OFF);
  assert.ok(!opts.some((o) => o.note || o.tip), 'with motion, nothing to explain');
});

test('pack items: the site’s knight comes and goes: Summon while he’s away, Send Him Off, his styles and finishes while he rests', async () => {
  const { STYLE_NAMES, FINISH_NAMES } = await import('../src/ui/pack.js');
  const { STYLES } = await import('../src/bonfire/knightStyles.js');
  const { FINISHES } = await import('../src/bonfire/steel.js');
  assert.deepEqual(Object.keys(STYLE_NAMES), Object.keys(STYLES), 'a name for every style');
  assert.deepEqual(Object.keys(FINISH_NAMES), Object.keys(FINISHES), 'a name for every finish');
  // (The admin's seat poses are the poses': effects.knight.seat.)
  const { SEAT_POSES } = await import('../src/bonfire/knightPose.js');
  const { KNIGHT_SEATS } = await import('../src/effectsDefaults.js');
  assert.deepEqual(KNIGHT_SEATS, SEAT_POSES);
  const calls = [];
  const base = {
    busy: () => false,
    onScene() {},
    onWeapon() {},
    onRing() {},
    onLiving() {},
    onElement() {},
    onFlame() {},
  };
  const at = { scenery: 'ruins', weapon: 'longsword', element: 'fire', flame: rotation()[0] };
  let state = { ...at, helmet: null, presence: 'away', style: 'pixel-cel', finish: 'gunmetal' };
  const knight = bonfireItems({
    ...base,
    state: () => state,
    onHelmet: (k) => calls.push(['helmet', k]),
    onGesture: (g) => calls.push(['gesture', g]),
    onStyle: (k) => calls.push(['style', k]),
    onFinish: (k) => calls.push(['finish', k]),
    onSummon: () => calls.push(['summon']),
    onDismiss: () => calls.push(['dismiss']),
  }).find((i) => i.id === 'knight');
  const ids = () =>
    knight
      .options()
      .filter((o) => !o.heading)
      .map((o) => o.id);
  const enabled = () =>
    knight
      .options()
      .filter((o) => !o.heading && !o.disabled)
      .map((o) => o.id);

  // Away (his sign waits): only the summons, and the helm's eye slit is dark (the item's state).
  assert.deepEqual(knight.options(), [{ id: 'summon', label: 'Summon', disabled: false }]);
  assert.equal(knight.state(), 'away');
  knight.pick('summon');
  // Forming: everything he'll offer, nothing to pick yet (and no second summons).
  state = { ...state, presence: 'arriving', helmet: 'armet' };
  assert.ok(ids().includes('dismiss') && !ids().includes('summon'));
  assert.deepEqual(enabled(), []);
  // Resting: send him off, then his gestures (the Default Dance too), helmet, style and finish.
  state = { ...state, presence: 'resting' };
  const opts = knight.options();
  assert.deepEqual(
    opts.filter((o) => o.heading).map((o) => o.label),
    ['Gestures', 'Helmet', 'Style', 'Finish'],
  );
  assert.equal(opts[0].id, 'dismiss');
  assert.equal(opts[0].label, 'Send Him Off');
  assert.deepEqual(
    opts.filter((o) => o.id?.startsWith('style:')).map((o) => o.label),
    Object.values(STYLE_NAMES),
  );
  assert.equal(
    opts.find((o) => o.id === 'style:gunmetal').label,
    'Smooth Steel',
    'the gunmetal style isn’t the Gunmetal finish',
  );
  assert.ok(
    opts.filter((o) => o.id?.startsWith('style:')).every((o) => o.tip === STYLES[o.id.slice(6)].hint),
    'each style says what it looks like',
  );
  assert.deepEqual(
    opts.filter((o) => o.id?.startsWith('finish:')).map((o) => o.label),
    ['Gunmetal', 'Blackened', 'Polished Steel', 'Burnished'],
  );
  assert.equal(opts.find((o) => o.id === 'gesture:dance').label, 'Default Dance');
  assert.deepEqual(
    opts.filter((o) => o.current).map((o) => o.id),
    ['helm:armet', 'style:pixel-cel', 'finish:gunmetal'],
    'what he wears now',
  );
  assert.ok(opts.filter((o) => !o.heading).every((o) => !o.disabled));
  assert.equal(knight.state(), 'resting');
  knight.pick('style:gunmetal');
  knight.pick('finish:burnished');
  knight.pick('gesture:dance');
  knight.pick('dismiss');
  // A style that draws its own colors: no finishes to pick (and none marked as worn), and the
  // list says why, under the heading and as each one's tooltip.
  const { OWN_COLORS } = await import('../src/ui/pack.js');
  assert.equal(OWN_COLORS, 'Black & Gold and First Build wear their own colors.');
  assert.ok(
    !opts.some((o) => o.note) && !opts.some((o) => o.id?.startsWith('finish:') && o.tip),
    'a steel style: nothing to explain',
  );
  state = { ...state, style: 'blackgold' };
  const own = knight.options().filter((o) => o.id?.startsWith('finish:'));
  assert.ok(own.every((o) => o.disabled && !o.current && o.tip === OWN_COLORS));
  assert.equal(knight.options().find((o) => o.heading && o.label === 'Finish').note, OWN_COLORS);
  // Burning away into his sign: the summons again, not yet (he isn't gone).
  state = { ...state, presence: 'leaving' };
  assert.deepEqual(knight.options(), [{ id: 'summon', label: 'Summon', disabled: true }]);
  assert.deepEqual(calls, [
    ['summon'],
    ['style', 'gunmetal'],
    ['finish', 'burnished'],
    ['gesture', 'dance'],
    ['dismiss'],
  ]);

  // Without a summons to offer (Bonfire Live), no styles or finishes asked for: the knight's
  // helmets and gestures as before, whatever the presence says.
  const live = bonfireItems({ ...base, state: () => ({ ...at, helmet: 'great' }), onHelmet() {}, onGesture() {} }).find(
    (i) => i.id === 'knight',
  );
  assert.deepEqual(
    live
      .options()
      .filter((o) => o.heading)
      .map((o) => o.label),
    ['Gestures', 'Helmet'],
  );
  assert.ok(!live.options().some((o) => o.id === 'summon' || o.id === 'dismiss'));
});

test('pack items: the knight item is left out while there is no knight (hasKnight)', () => {
  const base = {
    busy: () => false,
    onScene() {},
    onWeapon() {},
    onRing() {},
    onLiving() {},
    onElement() {},
    onFlame() {},
    onHelmet() {},
  };
  const state = () => ({
    scenery: 'ruins',
    weapon: 'longsword',
    element: 'fire',
    flame: rotation()[0],
    helmet: 'great',
  });
  let here = true;
  const items = bonfireItems({ ...base, state, hasKnight: () => here });
  const knight = items.find((i) => i.id === 'knight');
  assert.equal(knight.available(), true);
  here = false;
  assert.equal(knight.available(), false, 'no model, or the admin has him off: no item');
  assert.ok(
    items.filter((i) => i.id !== 'knight').every((i) => !i.available),
    'the map, anvil and tome are always there',
  );
  assert.equal(
    bonfireItems({ ...base, state }).find((i) => i.id === 'knight').available,
    undefined,
    'without hasKnight (Bonfire Live): always there',
  );
});

test('pack lists stay inside the window: one too wide narrows, one too tall slides down, then scrolls', async () => {
  const { fitList } = await import('../src/ui/pack.js');
  const room = { left: 8, top: 72, right: 382, bottom: 836 }; // (390×844, below a 64 px header)
  // Fits: nothing changes.
  assert.deepEqual(fitList({ left: 40, top: 300, right: 320, bottom: 600 }, room), {
    maxWidth: null,
    maxHeight: null,
    shift: 0,
  });
  // Off the top (a phone, the pack on the breakdown's sheet): slides down just enough.
  assert.deepEqual(fitList({ left: 40, top: -162, right: 322, bottom: 298 }, room), {
    maxWidth: null,
    maxHeight: null,
    shift: 234,
  });
  // Off the left (a tablet, the pack beside the panel): narrower, keeping its right edge.
  assert.equal(fitList({ left: -109, top: 300, right: 311, bottom: 600 }, room).maxWidth, 303);
  // Taller than the whole window (a landscape phone): as tall as it can be, then scrolls.
  const low = { left: 8, top: 72, right: 836, bottom: 382 };
  const r = fitList({ left: 100, top: -300, right: 380, bottom: 216 }, low);
  assert.equal(r.maxHeight, 310);
  assert.equal(216 + r.shift, 382, 'its bottom at the window’s');
  // Off the bottom: lifted.
  assert.equal(fitList({ left: 40, top: 700, right: 320, bottom: 900 }, room).shift, -64);
  // Whatever it's handed, the result is inside.
  for (const box of [
    { left: -500, top: -900, right: 200, bottom: 50 },
    { left: 20, top: 820, right: 60, bottom: 1400 },
  ]) {
    const f = fitList(box, room);
    const h = Math.min(f.maxHeight ?? Infinity, box.bottom - box.top);
    const bottom = box.bottom + f.shift;
    assert.ok(bottom <= room.bottom && bottom - h >= room.top, JSON.stringify({ box, f }));
    assert.ok(box.right - (f.maxWidth ?? box.right - box.left) >= room.left);
  }
});
