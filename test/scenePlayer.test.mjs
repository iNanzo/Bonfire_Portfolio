// A preset scene played on the show (src/visualizer/scenePlayer.js, and the director's hooks
// in director.js), on the shared stand-in scene (test/lib/fakeScene.mjs): every part lands
// in one moment (the overlay, the flame and scenery colors, the weapon, the place, the look,
// the camera, the render, the knights, the fireflies); the flashy clamp keeps what the user
// (Low Flash, Camera: Still, their Elements) or reduced motion has off, and reduced motion
// holds a scene's look still (the Painter's painted look aside); holding blocks the phrase
// swaps, the scenery mix and the cuts, and the swaps forge the scene's own flame; its
// registered flame outlives the made ones and its scenery colors outlive landings;
// releasing a setting lets the user win;
// an instant re-apply (the Painter) touches only the part that changed; Hold vs Base; the
// loop's changes land in a drop's strike or a phrase's impact, never in between (a blade
// held for the drop keeps a downbeat's scene for its strike); going back to the free show
// brings back the user's place and knights (at once: their look and framing too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOverrides, looksPin, cameraPin, sceneFlameKey, sceneElement, FLASHY, FLASHY_DROPS, FLASHY_LOOKS, MOVING_LAYERS, NO_OFFSETS } from '../src/visualizer/scenePlayer.js';
import { createDirector } from '../src/visualizer/director.js';
import { defaultScene, normalizeScene } from '../src/scenes.js';
import { LAYERS, LOOKS, DROP_FX } from '../src/visualizer/looks.js';
import { PRESETS, defaults, applyPreset } from '../src/visualizer/settings.js';
import { scenes as builtIn } from '../src/content.js';
import { flames, base as sceneryNow } from '../src/palette.js';
import { effects } from '../src/effects.js';
import { settingsWith, directorFor, bars, FRAME, ins, fakeKnights, fakeFire } from './lib/fakeScene.mjs';

/** A scene with everything set: the shrine in ice, kaleido with glow and grain, three knights. */
function shrine(o = {}) {
  const s = defaultScene('Frozen Shrine');
  s.place = { scenery: 'shrine', weapon: 'greatsword', element: 'ice' };
  s.colors.flame = { lo: '#12305a', mid: '#2a7fd4', hi: '#bfe8ff', core: '#f4fbff', shade: '#0b1830', light: 0.5 };
  s.colors.scenery = { void: '#05070d', shadow: '#0e1624', stone: '#27354a', wood: '#3a3a44', bone: '#b8c8d8' };
  s.fire = { ...NO_OFFSETS, height: 0.4, windX: -0.2 };
  s.camera = { pos: [1.2, 1.6, 4.4], target: [0, 0.7, 0], fov: 36, roll: 0.05, move: { kind: 'sway', amount: 0.6, bars: 8 } };
  s.look = { name: 'kaleido', amount: 1.2, params: { segments: 8 } };
  s.layers = { glow: 'on', grain: 'on', flicker: 'on', mirror: 'mix' };
  s.details = { glowSize: 2.4 };
  s.drops = { fx: { shatter: 'on', xray: 'on', ink: 'mix' }, count: 3 };
  s.render = { ...s.render, pixelSize: 6, palette: [0, 6, 8], fog: 'thick', xray: 'normals', outlines: 'on' };
  s.knights = { ...s.knights, count: 3, helmets: ['armet', null, 'bascinet'], dance: 'on', formation: 'line', shine: 'on', finish: 'blackened', seat: 'watchful', glow: 'on', rim: 0.8, style: 'blackgold' };
  s.fireflies = { lit: 5, show: 'chase', moves: ['bounce', 'dart'], speed: 1.5 };
  return normalizeScene({ ...s, ...o });
}
const LOW_FLASH = () => settingsWith(PRESETS.safe.values);
/** Every setting as a preset leaves them, from the defaults (the dialog's way). */
const presetUser = (id) => { const u = defaults(); applyPreset(u, id); return u; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('sceneOverrides: every part in the settings’ own terms; Base keeps the place, render, knights and fireflies only', () => {
  const s = shrine();
  const o = sceneOverrides(s, 'hold', settingsWith());
  assert.equal(o.scenery, 'shrine');
  assert.deepEqual([o.pixelSize, o.palette, o.fog, o.ditherMatrix, o.pixelShift, o.fewColors, o.xray, o.xrayView], [6, [0, 6, 8], 'thick', '4', 'off', 'off', 'off', 'normals']);
  assert.deepEqual([o.knights, o.knightCount, o.knightFormation, o.knightDance, o.knightFinish, o.knightSeat, o.knightRim, o.knightStyle], ['on', 3, 'line', 'on', 'blackened', 'watchful', 0.8, 'blackgold']);
  assert.deepEqual(o.knightHelmetOrder, ['armet', null, 'bascinet']);
  assert.equal(o.knightMoves, undefined, 'moves null: the show’s own');
  assert.equal(o.blink, true);
  assert.deepEqual(Object.keys(o.flyMoves).filter((k) => o.flyMoves[k]), ['bounce', 'dart']);
  assert.deepEqual([o.phraseBars, o.sceneColors, o.camera], [0, 'off', 'drift']);
  for (const k of Object.keys(LAYERS)) assert.equal(o[k], s.layers[k] ?? 'off', `layer ${k}`);
  assert.deepEqual(Object.keys(o.dropFx).sort(), Object.keys(DROP_FX).sort());
  assert.deepEqual([o.dropFx.shatter, o.dropFx.xray, o.dropFx.ink, o.dropFx.spiral, o.dropCount], ['on', 'on', 'mix', 'off', 2], 'its hits; its count up to the user’s (2)');
  assert.equal(sceneOverrides(s, 'hold', settingsWith({ dropCount: 3 })).dropCount, 3, 'its count of 3 when the user allows three');
  assert.equal(o.knightGlow, 'on', 'its Edge Glow as painted (Always: at its own strength)');
  for (const glow of ['off', 'mix', 'on']) {
    assert.equal(sceneOverrides(shrine({ knights: { ...s.knights, glow } }), 'base', settingsWith({ knightGlow: 'off' })).knightGlow, glow, `its Edge Glow ${glow}, whatever the user's`);
  }
  const b = sceneOverrides(s, 'base', settingsWith());
  for (const k of ['phraseBars', 'sceneColors', 'camera', 'dropFx', 'dropCount', ...Object.keys(LAYERS)]) assert.ok(!(k in b), `base leaves ${k} to the show`);
  for (const k of ['scenery', 'pixelSize', 'knights', 'knightCount', 'blink']) assert.ok(k in b, `base keeps ${k}`);
  // No knights: off; a still camera: still; no style: Bonfire Live's own.
  const none = sceneOverrides(shrine({ knights: { ...s.knights, count: 0, helmets: [], style: null }, camera: { ...s.camera, move: { kind: 'still', amount: 0, bars: 8 } } }), 'hold', settingsWith());
  assert.deepEqual([none.knights, 'knightCount' in none, 'knightStyle' in none, none.camera], ['off', false, false, 'still']);
  // The pins.
  const p = looksPin(s);
  assert.deepEqual([p.look, p.amount, p.params, p.details, p.layers.glow, p.layers.ghost], ['kaleido', 1.2, { segments: 8 }, { glowSize: 2.4 }, 'on', 'off']);
  assert.deepEqual(cameraPin(s), { pos: [1.2, 1.6, 4.4], target: [0, 0.7, 0], fov: 36, roll: 0.05, move: { kind: 'sway', amount: 0.6, bars: 8 } });
  assert.equal(sceneFlameKey(s, 'b:frozen-shrine'), 'scene-b-frozen-shrine');
  assert.equal(sceneFlameKey(s, 'm:frozen-shrine'), 'scene-m-frozen-shrine');
  assert.equal(sceneFlameKey(s), 'scene-p-frozen-shrine', 'the Painter’s, no ref');
});

test('a scene’s Edge Glow: Off none, Always at its strength, In the mix rolled round it at each arrival (the user’s own switch aside)', () => {
  // (Two scenes taking turns, so each arrival is a new scene: a hidden moment that rolls.)
  const rims = (glow, n = 40) => {
    const { director, kn } = directorFor({ knights: 'on', knightGlow: 'on', knightRim: 0.2 });
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = shrine({ id: `glow-${i % 2}`, name: `Glow ${i % 2}`, knights: { ...shrine().knights, glow, rim: 0.8 } });
      director.scene({ ref: `b:${s.id}`, scene: s }, { instant: true });
      out.push(kn.rim);
    }
    return out;
  };
  assert.ok(rims('off').every((r) => r === 0), 'Off: no glow (not the user’s Always)');
  assert.ok(rims('on').every((r) => r === 0.8), 'Always: its own strength (not the user’s 0.2)');
  const mix = rims('mix');
  const lit = mix.filter((r) => r > 0);
  assert.ok(lit.length > 0 && lit.length < mix.length, `In the mix: some arrivals glow, some don't (${mix.join(' ')})`);
  assert.ok(lit.every((r) => r >= 0.47 && r <= 1), `…each round its strength, 0.6× to 1.4× (${lit.join(' ')})`);
  assert.ok(new Set(lit).size > 2, 'rolled, not one strength');
});

test('the flashy clamp: Low Flash (or reduced motion) keeps a flashy scene’s flicker, x-ray, drop flashes and armor shine off', () => {
  const s = shrine();
  const user = LOW_FLASH();
  user.dropFx = { ...user.dropFx, ink: 'off' };
  const o = sceneOverrides(s, 'hold', user);
  assert.deepEqual([o.flicker, o.xrayView, o.dropFx.xray, o.dropFx.ink, o.knightShine], ['off', null, 'off', 'off', 'off']);
  assert.equal(o.glow, 'on', 'the rest as painted');
  assert.equal(looksPin(s, user).layers.flicker, 'off', 'the pinned look too');
  const reduced = sceneOverrides(s, 'hold', settingsWith(), { reducedMotion: true });
  assert.deepEqual([reduced.flicker, reduced.xrayView, reduced.dropFx.xray, reduced.dropFx.ink, reduced.knightShine], ['off', null, 'off', 'off', 'off']);
  for (const k of FLASHY) if (k in o) assert.equal(o[k], 'off', k);
  // With the user’s switches on, the scene’s own.
  const free = sceneOverrides(s, 'hold', settingsWith());
  assert.deepEqual([free.flicker, free.knightShine, free.dropFx.xray], ['on', 'on', 'on']);
  // End to end: the director with Low Flash plays it safe.
  const { director } = directorFor(PRESETS.safe.values);
  director.scene({ ref: 'b:frozen-shrine', scene: s });
  const { looks, layers } = director.parts;
  assert.equal(layers.view.flicker, 'off');
  assert.equal(looks.pinned.layers.flicker, 'off');
  assert.equal(layers.view.knightShine, 'off');
  assert.equal(layers.view.xrayView, null);
  // The Ink look (1-bit flashes on the downbeats): Low Flash or reduced motion plays the clean look instead.
  const inked = shrine({ look: { name: 'ink', amount: 1.4, params: {} } });
  assert.deepEqual(FLASHY_LOOKS, ['ink']);
  assert.equal(looksPin(inked, settingsWith()).look, 'ink', 'the user’s Ink in the mix: the scene’s own');
  assert.equal(looksPin(inked, LOW_FLASH()).look, 'ember');
  assert.equal(looksPin(inked, settingsWith(), { reducedMotion: true }).look, 'ember');
  assert.equal(looksPin(inked, LOW_FLASH()).layers.glow, 'on', 'its layers as painted');
  director.scene({ ref: 'b:inked', scene: inked });
  assert.deepEqual(looks.playing, ['ember'], 'end to end');
  assert.equal(layers.view.dropFx.ink, 'off', 'and no Ink Flash at its drops');
});

test('a scene arrives in one moment: every part applied in the same call, the place before the knights', async () => {
  const { director, fire, kn, events, settings } = directorFor({ knights: 'on', knightCount: 1, scenery: 'ruins' });
  const { looks, camera, colors, layers, show } = director.parts;
  const s = shrine();
  kn.moment = 'scene';
  assert.equal(director.scene({ ref: 'b:frozen-shrine', scene: s }), true);
  const key = 'scene-b-frozen-shrine';
  assert.equal(layers.view.pixelSize, 6, 'the overlay');
  assert.equal(settings.pixelSize, 4, '...over the user’s, untouched');
  assert.ok(colors.registered.includes(key) && flames[key], 'the flame registered');
  assert.deepEqual(flames[key].ramp, ['#12305a', '#2a7fd4', '#bfe8ff', '#f4fbff']);
  assert.equal(colors.held, true, 'the scenery colors pinned');
  assert.deepEqual(colors.scenery, s.colors.scenery);
  assert.equal(fire.scenery, 'shrine', 'the place');
  assert.deepEqual(looks.playing, ['kaleido'], 'the look');
  assert.equal(looks.held, true);
  assert.deepEqual(camera.pinned.pos, s.camera.pos, 'the framing');
  assert.equal(camera.held, true);
  assert.deepEqual(kn.list.map((e) => e.present), [true, true, true, false], 'the knights');
  assert.deepEqual([kn.list[0].helmet, kn.list[2].helmet, kn.finish, kn.seatPose, kn.rim, kn.style], ['armet', 'bascinet', 'blackened', 'watchful', 0.8, 'blackgold']);
  assert.equal(show.pattern, 'chase', 'the fireflies’ show');
  assert.deepEqual(director.parts.player.offsets, s.fire);
  const moved = fire.calls.find((c) => c[0] === 'setScenery');
  const firstKnight = kn.log.findIndex((e) => e[2] === 'scene' || e[3] === 'scene');
  assert.ok(moved[2] <= firstKnight, 'the place changed before the knights were placed');
  assert.deepEqual(events.filter((e) => e[0] === 'scene').map((e) => e[1]), [{ name: 'Frozen Shrine', ref: 'b:frozen-shrine', mode: 'hold' }]);
  assert.equal(director.sceneName, 'Frozen Shrine');
  // The weapon, flame and element: its impact where it stands (a new weapon at once under it).
  await tick();
  assert.deepEqual([fire.weapon, fire.flame, fire.element], ['greatsword', key, 'ice']);
  assert.ok(fire.impacts.some((i) => i.flame === key && !i.instant), 'with an impact (its flash)');
  // Nothing arranged a second time a frame later.
  const mark = kn.log.length;
  kn.moment = 'later';
  for (let i = 0; i < 10; i++) director.update(FRAME, 0.016);
  assert.deepEqual(ins(kn.log.slice(mark)), [], 'no one comes or goes after the moment');
  assert.deepEqual(kn.log.slice(mark).filter((e) => ['finish', 'seat', 'rim', 'style', 'shine'].includes(e[0])), []);
});

test('re-applying the same scene does nothing; an instant edit touches only its part and keeps the rest of the rolls', () => {
  const { director, fire, kn } = directorFor({ knights: 'on' });
  const { looks, camera } = director.parts;
  const s = shrine();
  director.scene(s, { instant: true });
  const turn = looks.turn;
  const grain = looks.details.p.grain;
  const knightsLog = kn.log.length;
  const calls = fire.calls.length;
  assert.equal(director.scene(structuredClone(s), { instant: true }), false, 'the same scene again: nothing');
  assert.equal(fire.calls.length, calls);
  // The Glow Size slider moved.
  const edited = structuredClone(s);
  edited.details.glowSize = 3.6;
  const pin = camera.pinned;
  assert.equal(director.scene(edited, { instant: true }), true);
  assert.equal(looks.details.p.glowSize, 3.6, 'the edit');
  assert.equal(looks.details.p.grain, grain, 'the rolled grain kept');
  assert.equal(looks.turn, turn, 'no new turn');
  assert.equal(camera.pinned, pin, 'the camera left alone');
  assert.equal(kn.log.length, knightsLog, 'the knights left alone');
  assert.ok(!fire.calls.slice(calls).some((c) => c[0] === 'equip' || c[0] === 'setScenery'), 'no swap, no new place');
  // A new flame color: re-registered and on the fire at once (instant: no impact).
  const recolored = structuredClone(edited);
  recolored.colors.flame.mid = '#40a0ff';
  director.scene(recolored, { instant: true });
  assert.equal(flames[sceneFlameKey(recolored)].ramp[1], '#40a0ff');
  const eq = fire.calls.filter((c) => c[0] === 'equip').at(-1);
  assert.equal(eq[3].instant, true);
});

test('holding: no phrase swaps, no cuts or scenery mix, the look timer only re-rolls, the swaps forge the scene’s flame', async () => {
  const { director, fire, shots, settings } = directorFor({ phraseBars: 8, camera: 'cuts', cutBars: 1, scenery: 'mix', lookBars: 8, knights: 'off' });
  const { looks } = director.parts;
  const s = shrine({ place: { scenery: 'forge', weapon: null, element: null } });
  director.scene({ ref: 'm:forge', scene: s });
  await tick();
  const calls = fire.calls.length;
  shots.length = 0;
  bars(director, 40);
  const equips = fire.calls.slice(calls).filter((c) => c[0] === 'equip');
  assert.deepEqual(equips, [], 'no phrase swaps while it holds');
  assert.deepEqual(shots, [], 'no cuts');
  assert.deepEqual(looks.playing, ['kaleido'], 'its look');
  assert.ok(looks.turn > 1, 'new turns of it');
  // Drops: the scenery mix leaves the place alone; a hit forges in the scene’s colors.
  for (let i = 0; i < 4; i++) director.strike();
  assert.equal(fire.scenery, 'forge');
  director.hit();
  assert.equal(fire.calls.filter((c) => c[0] === 'equip').at(-1)[2], 'scene-m-forge', 'the scene’s flame');
  assert.equal(settings.phraseBars, 8, 'the user’s own untouched');
  // A breakdown forges the next blade in the scene’s flame (its weapon drawn).
  director.update({ ...FRAME, state: 'breakdown', events: ['breakdown'] }, 0.016);
  const armed = fire.calls.filter((c) => c[0] === 'equip').at(-1);
  assert.equal(armed[2], 'scene-m-forge');
  assert.equal(armed[3].hold, true);
});

test('the registered flame outlives 20 made palettes; the scene’s scenery colors outlive landings', () => {
  const { director } = directorFor({ colors: 'harmonious' });
  const { colors } = director.parts;
  const s = shrine();
  director.scene({ ref: 'b:frozen-shrine', scene: s }, { instant: true });
  for (let i = 0; i < 12; i++) colors.update(0.1);
  const key = 'scene-b-frozen-shrine';
  for (let i = 0; i < 20; i++) director.landed(colors.next('ember'));
  assert.ok(flames[key], 'still registered');
  assert.ok(Object.keys(flames).filter((k) => k.startsWith('live-')).length <= 6, 'the made ones pruned');
  for (let i = 0; i < 12; i++) colors.update(0.1);
  assert.equal(sceneryNow.stone, s.colors.scenery.stone, 'the scene’s colors held through the landings');
  // The free show again: the next landing recolors as the settings say.
  director.scene(null);
  assert.equal(colors.held, false);
  assert.ok(flames[key], 'never pruned');
});

test('release(): a setting the user touches is theirs again until the next scene', () => {
  const { director, settings } = directorFor({ pixelSize: 3, glow: 'off' });
  const { layers, looks, camera } = director.parts;
  const s = shrine();
  director.scene({ ref: 'b:frozen-shrine', scene: s }, { instant: true });
  assert.equal(layers.view.pixelSize, 6);
  assert.deepEqual([director.sceneSets('pixelSize'), director.sceneSets('glitch'), director.sceneHolds('camera'), director.sceneHolds('render')], [true, false, true, true]);
  director.releaseScene(['pixelSize', 'glow', 'shot']);
  assert.equal(director.sceneSets('pixelSize'), false, 'theirs again');
  assert.equal(layers.view.pixelSize, 3, 'the user’s pixel size');
  assert.equal(looks.pinned.layers.glow, 'off', 'the user’s glow in the pinned look');
  assert.equal(camera.held, false, 'the framing handed back');
  // Re-applying the same scene (an edit) keeps what they took back.
  const edited = structuredClone(s);
  edited.details.glowSize = 4;
  director.scene({ ref: 'b:frozen-shrine', scene: edited }, { instant: true });
  assert.equal(layers.view.pixelSize, 3);
  assert.equal(looks.pinned.layers.glow, 'off');
  // The next scene: the scene’s again.
  director.scene({ ref: 'm:other', scene: shrine({ id: 'other' }) }, { instant: true });
  assert.equal(layers.view.pixelSize, 6);
  assert.equal(settings.pixelSize, 3);
});

test('Hold vs Base: Base opens the stretch, then the show takes the look, the framing and the colors back', () => {
  const { director, fire, shots } = directorFor({ camera: 'cuts', cutBars: 1, lookBars: 8, phraseBars: 8, knights: 'off' });
  const { looks, camera, colors, layers } = director.parts;
  director.scene({ ref: 'b:frozen-shrine', scene: shrine() }, { mode: 'base' });
  assert.equal(director.sceneMode, 'base');
  assert.deepEqual(looks.playing, ['kaleido'], 'it opens with its look');
  assert.deepEqual(camera.pinned.pos, [1.2, 1.6, 4.4], '...its framing');
  assert.equal(fire.scenery, 'shrine', '...and its place');
  assert.deepEqual([looks.held, camera.held, colors.held], [false, false, false], 'none held');
  assert.equal(layers.view.phraseBars, 8, 'phrase swaps go on');
  shots.length = 0;
  const calls = fire.calls.length;
  bars(director, 24);
  assert.ok(shots.length > 0, 'the cuts take over');
  assert.equal(looks.pinned, null, 'the look’s turn handed back');
  assert.ok(fire.calls.slice(calls).some((c) => c[0] === 'equip'), 'the phrase swaps');
  assert.equal(layers.view.pixelSize, 6, 'its render stays');
  assert.equal(fire.scenery, 'shrine', 'its place stays');
  // With the Music set to Hold overrides a scene that says Base.
  const held = directorFor({ sceneHold: 'hold' });
  held.director.scene({ ref: 'b:x', scene: shrine({ music: 'base' }) });
  assert.equal(held.director.sceneMode, 'hold');
});

test('Base: the scene’s own flame landing (its arrival) keeps its scenery colors on; the show’s next flame recolors them', () => {
  const { director } = directorFor({ sceneColors: 'on', knights: 'off' });
  const { colors } = director.parts;
  const s = shrine({ music: 'base' });
  const settle = () => { for (let i = 0; i < 20; i++) colors.update(0.1); };
  director.scene({ ref: 'b:frozen-shrine', scene: s });
  assert.deepEqual([director.sceneMode, colors.held], ['base', false]);
  // Its flame lands where it stands (the arrival's impact): its colors stay, they aren't rolled anew.
  director.landed('scene-b-frozen-shrine');
  settle();
  assert.deepEqual([sceneryNow.void, sceneryNow.stone], [s.colors.scenery.void, s.colors.scenery.stone], 'the scene’s own colors');
  // The show plays on: its next flame brings colors of its own (Recolor the Scenery: every flame).
  director.landed(colors.next('ember'));
  settle();
  assert.notEqual(sceneryNow.stone, s.colors.scenery.stone, 'the show’s colors now');
  // The user took the colors back: the scene's flame landing recolors as the settings say.
  director.scene({ ref: 'm:other', scene: shrine({ id: 'other', music: 'base' }) });
  director.releaseScene(['sceneColors']);
  director.landed('scene-m-other');
  settle();
  assert.notEqual(sceneryNow.stone, s.colors.scenery.stone, 'theirs');
});

test('the loop at a drop: the breakdown forges the next scene’s blade, the scene lands in the strike, the knights in its places', async () => {
  const A = shrine();
  const B = shrine({ id: 'forge-rave', name: 'Forge Rave', place: { scenery: 'forge', weapon: 'warhammer', element: 'lightning' }, knights: { ...A.knights, count: 2, helmets: [null, null], dance: 'on', formation: 'line' } });
  const lib = [{ ref: 'b:frozen-shrine', scene: A }, { ref: 'b:forge-rave', scene: B }];
  const { director, fire, kn, events } = directorFor({ scenes: 'on', sceneBars: 0, knights: 'on', knightCount: 1, knightDance: 'on' }, { scenes: () => lib });
  bars(director, 1, { first: ['start'] });
  assert.equal(director.sceneName, 'Frozen Shrine', 'the first at the start');
  await tick();
  bars(director, 4, { from: 2 });
  // The breakdown: the next scene’s weapon, flame and element forged and held.
  director.update({ ...FRAME, state: 'breakdown', events: ['breakdown'] }, 0.016);
  const armed = fire.calls.filter((c) => c[0] === 'equip').at(-1);
  assert.deepEqual([armed[1], armed[2], armed[3].element, armed[3].hold], ['warhammer', 'scene-b-forge-rave', 'lightning', true]);
  assert.equal(director.sceneName, 'Frozen Shrine', 'not yet');
  bars(director, 4, { state: 'breakdown' });
  assert.equal(director.sceneName, 'Frozen Shrine', 'still not: it waits for the drop');
  // The drop: it strikes, the scene lands in its flash, the dancers in its places.
  kn.moment = 'drop';
  const mark = kn.log.length;
  director.update({ ...FRAME, state: 'groove', drop: 'big', events: ['drop'] }, 0.016);
  assert.equal(director.sceneName, 'Forge Rave');
  assert.equal(fire.scenery, 'forge');
  const moved = fire.calls.filter((c) => c[0] === 'setScenery').at(-1);
  assert.equal(moved[2], mark, 'the place before the knights heard of the drop');
  assert.equal(kn.list.filter((e) => e.present).length, 2, 'its cast');
  const landing = fire.land();
  director.landed(landing);
  assert.equal(landing, 'scene-b-forge-rave');
  const after = kn.log.length;
  kn.moment = 'later';
  for (let i = 0; i < 10; i++) director.update(FRAME, 0.016);
  assert.deepEqual(ins(kn.log.slice(after)), [], 'no second arrangement');
  assert.deepEqual(events.filter((e) => e[0] === 'scene').map((e) => e[1].name), ['Frozen Shrine', 'Forge Rave']);
});

test('the loop on a phrase line: the swap is forged to land on the downbeat, the scene arrives with its impact', async () => {
  const A = shrine({ place: { scenery: 'shrine', weapon: null, element: null } });
  const B = shrine({ id: 'moonlit', name: 'Moonlit Ruins', place: { scenery: 'ruins', weapon: null, element: null } });
  const lib = [{ ref: 'm:a', scene: A }, { ref: 'm:b', scene: B }];
  const { director, fire } = directorFor({ scenes: 'on', sceneBars: 16, knights: 'off' }, { scenes: () => lib });
  bars(director, 1, { from: 0, first: ['start'] });
  await tick();
  const calls = fire.calls.length;
  bars(director, 13, { from: 1 });
  assert.equal(director.sceneName, 'Frozen Shrine');
  assert.ok(!fire.forging, 'nothing forging before the phrase’s swap is due');
  // At 126 BPM a swap takes about 8 beats: it starts two bars before the line.
  bars(director, 1, { from: 14 });
  const forged = fire.calls.slice(calls).filter((c) => c[0] === 'equip');
  assert.equal(forged.length, 1);
  assert.equal(forged[0][2], 'scene-m-b', 'forged in the next scene’s flame');
  assert.ok(forged[0][3].pace > 0, 'paced to land on the line');
  assert.equal(director.sceneName, 'Frozen Shrine', 'the scene waits for the impact');
  bars(director, 1, { from: 15 });
  assert.equal(director.sceneName, 'Frozen Shrine');
  director.landed(fire.land());
  assert.equal(director.sceneName, 'Moonlit Ruins', 'it arrives with the impact');
  assert.equal(fire.scenery, 'ruins');
});

/** Three scenes with their own weapons (so every change forges), for the loop's timing tests. */
function trio() {
  const A = shrine({ place: { scenery: 'shrine', weapon: 'greatsword', element: 'ice' } });
  const B = shrine({ id: 'moonlit', name: 'Moonlit Ruins', place: { scenery: 'ruins', weapon: 'warhammer', element: 'fire' } });
  const C = shrine({ id: 'forge-rave', name: 'Forge Rave', place: { scenery: 'forge', weapon: 'katana', element: 'lightning' } });
  return [{ ref: 'm:a', scene: A }, { ref: 'm:b', scene: B }, { ref: 'm:c', scene: C }];
}
const BREAKDOWN = { ...FRAME, state: 'breakdown', events: ['breakdown'] };
const DROP = { ...FRAME, state: 'groove', drop: 'big', events: ['drop'] };

test('16 bars: a scene landing on the line where the breakdown begins gives way at its drop, 8 bars on', async () => {
  const lib = trio();
  const { director, fire } = directorFor({ scenes: 'on', sceneBars: 16, knights: 'off' }, { scenes: () => lib });
  bars(director, 1, { from: 0, first: ['start'] });
  await tick();
  bars(director, 16, { from: 1 });
  director.landed(fire.land()); // (the phrase swap's impact, on bar 16)
  assert.equal(director.sceneName, 'Moonlit Ruins', 'arrived on the line');
  // The breakdown starts right there: the blade is the next scene's (half a stretch by the drop).
  director.update(BREAKDOWN, 0.016);
  const armed = fire.calls.filter((c) => c[0] === 'equip').at(-1);
  assert.deepEqual([armed[1], armed[2], armed[3].hold], ['katana', 'scene-m-c', true], 'the next scene’s blade, held');
  assert.equal(director.upNext.ref, 'm:c');
  bars(director, 7, { from: 17, state: 'breakdown' });
  assert.equal(director.sceneName, 'Moonlit Ruins', 'it waits for the drop');
  director.update(DROP, 0.016);
  assert.equal(director.sceneName, 'Forge Rave', 'the drop at bar 24 brings it');
  assert.equal(fire.scenery, 'forge');
  director.landed(fire.land());
  assert.equal(fire.flame, 'scene-m-c', 'its own flame, from its own blade');
  // A breakdown that turns out short (2 bars after an arrival): the drop doesn't end the scene.
  director.update(BREAKDOWN, 0.016);
  assert.equal(fire.calls.filter((c) => c[0] === 'equip').at(-1)[2], 'scene-m-a', 'the forecast forges the next one’s blade');
  bars(director, 2, { from: 1, state: 'breakdown' });
  director.update(DROP, 0.016);
  assert.equal(director.sceneName, 'Forge Rave', 'two bars in: it stays');
  assert.equal(director.upNext.ref, 'm:a', 'the next one stays next');
  director.landed(fire.land());
  assert.deepEqual([fire.weapon, fire.flame, fire.element], ['katana', 'scene-m-c', 'lightning'], 'the struck blade takes the playing scene’s own weapon, flame and element');
});

test('Only on Drops: a breakdown that ends with no drop brings no scene (the blade strikes in the playing scene’s colors); the real drop does', async () => {
  const lib = trio();
  const { director, fire, events } = directorFor({ scenes: 'on', sceneBars: 0, knights: 'off' }, { scenes: () => lib });
  bars(director, 1, { from: 0, first: ['start'] });
  await tick();
  bars(director, 8, { from: 1 });
  assert.equal(director.sceneName, 'Frozen Shrine');
  // A build read where the bass comes in (the demo track's bar 8): the next scene's blade is forged...
  director.update({ ...FRAME, state: 'build', events: ['build'] }, 0.016);
  assert.equal(fire.calls.filter((c) => c[0] === 'equip').at(-1)[2], 'scene-m-b');
  bars(director, 1, { from: 9, state: 'build' });
  // ...then the energy creeps back with no drop: the blade strikes on the next downbeat, the scene stays.
  director.update({ ...FRAME, state: 'groove', events: ['return'] }, 0.016);
  bars(director, 2, { from: 10 });
  assert.equal(fire.holding, false, 'struck on the downbeat');
  assert.equal(director.sceneName, 'Frozen Shrine', 'no drop, no scene (bar 11)');
  director.landed(fire.land());
  assert.deepEqual([fire.weapon, fire.flame, fire.element], ['greatsword', 'scene-m-a', 'ice'], 'its own weapon, flame and element back with the impact');
  assert.equal(director.upNext.ref, 'm:b', 'the one forged for is still next');
  // No phrase lines either.
  bars(director, 20, { from: 12 });
  assert.equal(director.sceneName, 'Frozen Shrine');
  // A short cut's small drop strikes a held blade too, and brings no scene either.
  director.update({ ...FRAME, state: 'build', events: ['build'] }, 0.016);
  bars(director, 1, { from: 32, state: 'build' });
  director.update({ ...FRAME, state: 'groove', drop: 'small', events: ['drop'] }, 0.016);
  assert.equal(fire.holding, false, 'struck');
  assert.equal(director.sceneName, 'Frozen Shrine', 'a small drop: no scene');
  director.landed(fire.land());
  assert.equal(fire.flame, 'scene-m-a');
  // The real breakdown and drop: it comes.
  director.update(BREAKDOWN, 0.016);
  bars(director, 8, { from: 16, state: 'breakdown' });
  director.update(DROP, 0.016);
  assert.equal(director.sceneName, 'Moonlit Ruins');
  assert.deepEqual(events.filter((e) => e[0] === 'scene').map((e) => e[1].name), ['Frozen Shrine', 'Moonlit Ruins']);
});

test('a blade forged for a scene that didn’t come never shows its colors: a Base scene (or the free show) takes the show’s next flame', async () => {
  const [a, b] = trio();
  const lib = [{ ...a, scene: { ...a.scene, music: 'base' } }, b];
  const { director, fire } = directorFor({ scenes: 'on', sceneBars: 0, knights: 'off' }, { scenes: () => lib });
  bars(director, 1, { from: 0, first: ['start'] });
  await tick();
  assert.equal(director.sceneMode, 'base');
  bars(director, 4, { from: 1 });
  director.update({ ...FRAME, state: 'build', events: ['build'] }, 0.016);
  assert.equal(fire.calls.filter((c) => c[0] === 'equip').at(-1)[2], 'scene-m-b', 'forged for the next');
  director.update({ ...FRAME, state: 'groove', events: ['return'] }, 0.016);
  bars(director, 1, { from: 5 });
  director.landed(fire.land());
  assert.equal(director.sceneName, 'Frozen Shrine');
  assert.ok(!fire.flame.startsWith('scene-'), `the show’s own flame, not the skipped scene’s (${fire.flame})`);
  assert.equal(fire.weapon, 'greatsword', 'the Base scene’s weapon');
});

test('a phrase line with the same weapon (or the forge busy) lands on the downbeat with a flash; N on the next downbeat', async () => {
  const A = shrine({ place: { scenery: 'shrine', weapon: 'greatsword', element: null } });
  const B = shrine({ id: 'b2', name: 'Same Blade', place: { scenery: 'cathedral', weapon: 'greatsword', element: null } });
  const C = shrine({ id: 'c3', name: 'Third', place: { scenery: 'cult', weapon: null, element: null } });
  const lib = [{ ref: 'm:a', scene: A }, { ref: 'm:b2', scene: B }, { ref: 'm:c3', scene: C }];
  const { director, fire } = directorFor({ scenes: 'on', sceneBars: 16, knights: 'off' }, { scenes: () => lib });
  bars(director, 1, { from: 0, first: ['start'] });
  await tick();
  assert.equal(fire.weapon, 'greatsword');
  bars(director, 15, { from: 1 });
  assert.equal(director.sceneName, 'Frozen Shrine', 'not before the line');
  const calls = fire.calls.length;
  bars(director, 1, { from: 16 });
  assert.equal(director.sceneName, 'Same Blade', 'on the phrase line’s downbeat');
  await tick();
  assert.ok(fire.calls.slice(calls).some((c) => c[0] === 'equip' && !c[3].instant && c[1] === 'greatsword'), 'an impact where it stands: its flash');
  // N: the next on the next downbeat.
  const next = director.nextScene();
  assert.equal(next.ref, 'm:c3');
  assert.equal(director.sceneName, 'Same Blade', 'waiting for the downbeat');
  bars(director, 1, { from: 17 });
  assert.equal(director.sceneName, 'Third');
});

test('Scenes switched off: the loop’s scene gives way to the free show on a downbeat; a hand-picked one stays', () => {
  const lib = [{ ref: 'm:a', scene: shrine() }];
  const { director, settings, fire } = directorFor({ scenes: 'on', sceneBars: 16, knights: 'off', scenery: 'ruins' }, { scenes: () => lib });
  bars(director, 1, { from: 0, first: ['start'] });
  assert.equal(director.sceneName, 'Frozen Shrine');
  settings.scenes = 'off';
  bars(director, 1, { from: 1 });
  assert.equal(director.sceneName, null);
  assert.equal(fire.scenery, 'ruins', 'the user’s own place again');
  director.scene(lib[0]);
  bars(director, 4, { from: 2 });
  assert.equal(director.sceneName, 'Frozen Shrine', 'picked by hand: it stays');
});

test('the Painter’s way: no library, the scene held by hand survives the music’s start, breakdowns and drops', async () => {
  const { director, fire } = directorFor({ scenes: 'mix', knights: 'off' });
  const s = shrine({ place: { scenery: 'cathedral', weapon: null, element: 'fire' } });
  director.scene(s, { mode: 'hold', instant: true });
  bars(director, 2, { from: 0, first: ['start'] });
  assert.equal(director.sceneName, 'Frozen Shrine');
  director.update({ ...FRAME, state: 'breakdown', events: ['breakdown'] }, 0.016);
  const armed = fire.calls.filter((c) => c[0] === 'equip').at(-1);
  assert.equal(armed[2], 'scene-p-frozen-shrine', 'the drop forged in its flame');
  assert.equal(armed[3].element, 'fire');
  director.update({ ...FRAME, state: 'groove', drop: 'big', events: ['drop'] }, 0.016);
  assert.equal(director.sceneName, 'Frozen Shrine');
  assert.equal(fire.scenery, 'cathedral');
});

test('fire offsets are added to the drive, in silence too; the fireflies fly at the scene’s speed and count', () => {
  const { director, fire } = directorFor({ knights: 'off' });
  const flies = { flies: Array.from({ length: effects.fireflies.count }, () => ({})), lit: null, speed: 1, setLit(n) { flies.lit = n; } };
  fire.fireflies = flies;
  for (let i = 0; i < 60; i++) director.update({ ...FRAME, state: 'silent' }, 0.016);
  const before = { ...fire.drive };
  director.scene(shrine(), { instant: true });
  director.update({ ...FRAME, state: 'silent' }, 0.016);
  assert.ok(Math.abs(fire.drive.height - before.height - 0.4) < 0.05, `height ${before.height} → ${fire.drive.height}`);
  assert.ok(fire.drive.windX < before.windX, 'wind');
  assert.equal(flies.lit, 5);
  assert.equal(flies.speed, 1.5 * effects.fireflies.speed);
  director.scene(null);
  director.update({ ...FRAME, state: 'silent' }, 0.016);
  assert.equal(flies.speed, effects.fireflies.speed);
  assert.equal(flies.lit, effects.fireflies.lit, 'the site’s own count back');
});

test('reduced motion: a scene’s look holds still (Ember, no layer that moves, no kicks); the Painter’s plays as painted', () => {
  const s = shrine({
    look: { name: 'kaleido', amount: 1.2, params: { segments: 8 } },
    layers: { ghost: 'on', blur: 'on', flicker: 'on', chroma: 'on', grain: 'on', glow: 'on', gradient: 'on', spotlight: 'on' },
    details: { chroma: 2, chromaKick: 4, grain: 0.2, grainKick: 0.3, spotBreath: 0.2, glowAmt: 1 },
  });
  // The pin and the overlay: the clean look, no layer that moves, the still ones as painted.
  const pin = looksPin(s, settingsWith(), { reducedMotion: true });
  assert.equal(pin.look, 'ember');
  for (const k of MOVING_LAYERS) assert.equal(pin.layers[k], 'off', k);
  assert.deepEqual([pin.layers.chroma, pin.layers.grain, pin.layers.glow, pin.layers.gradient], ['on', 'on', 'on', 'on']);
  const o = sceneOverrides(s, 'hold', settingsWith(), { reducedMotion: true });
  for (const k of MOVING_LAYERS) assert.equal(o[k], 'off', k);
  for (const name of Object.keys(LOOKS)) {
    assert.equal(looksPin(shrine({ look: { name, amount: 1, params: {} } }), settingsWith(), { reducedMotion: true }).look, 'ember', `${name}: every look moves`);
  }
  // (The Painter: the look it's painting, as painted; only the flashes clamped.)
  const painted = looksPin(s, settingsWith(), { reducedMotion: true, paintedLook: true });
  assert.deepEqual([painted.look, painted.layers.ghost, painted.layers.blur, painted.layers.flicker], ['kaleido', 'on', 'on', 'off']);

  // End to end, through the start, beats, a breakdown and a drop: nothing that moves shows,
  // and the still layers hold steady (no kick, no breath).
  const { director, fire } = directorFor({ knights: 'off' }, { reducedMotion: true });
  const g = fire.glitch;
  director.scene({ ref: 'b:spin', scene: s }, { instant: true });
  const seen = [];
  const update = director.update;
  director.update = (f, dt) => {
    update(f, dt);
    seen.push({ ...g });
  };
  bars(director, 2, { first: ['start'] });
  director.update(BREAKDOWN, 0.016);
  bars(director, 2, { from: 3, state: 'breakdown' });
  director.update(DROP, 0.016);
  director.glitchHit();
  bars(director, 2, { from: 5 });
  const moving = ['kaleido', 'feedback', 'ghost', 'blur', 'flicker', 'slice', 'rippleAmp', 'cycle', 'ink', 'invert', 'wave'];
  for (const k of moving) assert.ok(seen.every((f) => !f[k]), `${k} stays 0 (${[...new Set(seen.map((f) => f[k]))].join(', ')})`);
  assert.ok(seen.every((f) => f.block === 1), 'no crunch');
  const steady = (k) => [...new Set(seen.slice(2).map((f) => f[k]))];
  assert.deepEqual(steady('split'), [2], 'the chroma’s split, painted and steady');
  assert.deepEqual(steady('noise'), [0.2], 'the grain, steady');
  assert.equal(steady('glow').length, 1, 'the glow doesn’t pulse (its strength pinned: a new turn would roll it)');
  assert.ok(seen.at(-1).glow > 0 && seen.at(-1).grad > 0, 'the still layers show as painted');
  // The free show under reduced motion stays clean: its Echo look's palette cycle doesn't flash on the downbeats either.
  const echoOnly = { ...Object.fromEntries(Object.keys(LOOKS).map((k) => [k, 'off'])), echo: 'on' };
  const cycles = (reducedMotion) => {
    const d = directorFor({ knights: 'off', looks: echoOnly }, { reducedMotion });
    const out = [];
    const upd = d.director.update;
    d.director.update = (f, dt) => { upd(f, dt); out.push(d.fire.glitch.cycle); };
    bars(d.director, 4, { first: ['start'] });
    return out;
  };
  assert.ok(cycles(true).every((c) => !c), 'no color cycle');
  assert.ok(cycles(false).some((c) => c > 0), '(without reduced motion it cycles)');
  // The Painter (paintedLook): the look being painted shows, even with reduced motion.
  const pf = fakeFire(fakeKnights());
  const painter = createDirector(pf, { settings: settingsWith({ knights: 'off' }), reducedMotion: true, paintedLook: true });
  painter.scene(s, { mode: 'hold', instant: true });
  for (let i = 0; i < 10; i++) painter.update({ ...FRAME, state: 'silent' }, 0.016);
  assert.equal(pf.glitch.kaleido, 8, 'its kaleidoscope, painted');
  assert.ok(pf.glitch.ghost > 0, 'its ghosting');
  assert.equal(pf.glitch.flicker ?? 0, 0, 'still no flicker');
  // …but its palette never cycles under reduced motion: an Echo look painted with the Color
  // Cycle hit Always, through the Beat and Drop previews' music (downbeats, a breakdown, drops).
  const echo = shrine({ look: { name: 'echo', amount: 1.2, params: {} }, drops: { fx: { cycle: 'on', shatter: 'on' }, count: 3 } });
  const paintedRun = (reducedMotion) => {
    const d = directorFor({ knights: 'off' }, { reducedMotion, paintedLook: true });
    d.director.scene(echo, { mode: 'hold', instant: true });
    const seen = { frames: 0, cycled: 0, echoed: 0 };
    const upd = d.director.update;
    d.director.update = (f, dt) => {
      upd(f, dt);
      seen.frames++;
      if (d.fire.glitch.cycle) seen.cycled++;
      if (d.fire.glitch.feedback > 0) seen.echoed++;
    };
    bars(d.director, 4, { first: ['start'] });
    d.director.update(BREAKDOWN, 0.016);
    bars(d.director, 3, { from: 5, state: 'breakdown', level: 0.2 });
    for (let i = 0; i < 2; i++) {
      d.director.update(DROP, 0.016);
      bars(d.director, 2, { from: 1 });
      d.director.glitchHit();
    }
    seen.look = d.director.parts.looks.playing.join();
    return seen;
  };
  const still = paintedRun(true);
  assert.equal(still.look, 'echo', 'the Painter under reduced motion: the Echo look being painted');
  assert.ok(still.echoed > still.frames / 2, `its echo shows (${still.echoed} of ${still.frames} frames)`);
  assert.equal(still.cycled, 0, `no palette cycling (${still.cycled} of ${still.frames} frames)`);
  const free = paintedRun(false);
  assert.ok(free.cycled > 10, `(without reduced motion its palette steps: ${free.cycled} frames)`);
});

test('a scene due on a downbeat while a blade is held for the drop lands in its strike, never cutting the blade down', () => {
  const mk = (id, name, weapon) => normalizeScene({ ...defaultScene(name), id, place: { scenery: 'ruins', weapon, element: null } });
  // N in a breakdown.
  const lib = [{ ref: 'b:a', scene: mk('a', 'A', 'katana') }, { ref: 'b:b', scene: mk('b', 'B', 'mace') }];
  const { director, fire } = directorFor({ scenes: 'off', autoDrops: true, knights: 'off' }, { scenes: () => lib });
  bars(director, 2, { first: ['start'] });
  if (fire.forging && !fire.holding) fire.land();
  bars(director, 2, { from: 3, state: 'breakdown', first: ['breakdown'], level: 0.2 });
  assert.equal(fire.holding, true, 'a blade held for the drop');
  const calls = fire.calls.length;
  assert.equal(director.nextScene().ref, 'b:a');
  assert.equal(director.sceneWhen, 'drop', 'the page can say it plays at the drop');
  bars(director, 3, { from: 5, state: 'breakdown', level: 0.2 });
  assert.deepEqual([fire.holding, director.sceneName], [true, null], 'the downbeats pass; the blade stays held');
  assert.deepEqual(fire.calls.slice(calls).filter((c) => c[0] === 'equip'), [], 'nothing equipped under it');
  director.update(DROP, 0.016);
  assert.equal(fire.holding, false, 'the drop strikes it');
  assert.equal(director.sceneName, 'A', 'the scene lands in the strike');
  director.landed(fire.land());
  assert.deepEqual([fire.weapon, fire.flame], ['katana', 'scene-b-a'], 'the struck blade takes its weapon and flame at the impact');
  assert.equal(director.sceneWhen, null);
  // The loop's own: a phrase line's scene (the same weapon: due on the downbeat) with a breakdown begun a bar before it.
  const lib2 = [{ ref: 'b:a', scene: mk('a', 'A', null) }, { ref: 'b:b', scene: mk('b', 'B', 'longsword') }];
  const two = directorFor({ scenes: 'on', sceneBars: 16, autoDrops: true, knights: 'off' }, { scenes: () => lib2 });
  bars(two.director, 1, { first: ['start'] });
  if (two.fire.forging && !two.fire.holding) two.fire.land();
  bars(two.director, 13, { from: 2 });
  assert.deepEqual([two.director.parts.pending?.how, two.director.parts.pending?.at], ['beat', 16]);
  bars(two.director, 1, { from: 15, state: 'breakdown', first: ['breakdown'], level: 0.2 });
  assert.equal(two.fire.holding, true);
  bars(two.director, 2, { from: 16, state: 'breakdown', level: 0.2 });
  assert.deepEqual([two.fire.holding, two.director.sceneName], [true, 'A'], 'the line passes; the blade stays held');
  two.director.update(DROP, 0.016);
  assert.equal(two.director.sceneName, 'B', 'it lands with the drop');
  two.director.landed(two.fire.land());
  assert.deepEqual([two.fire.weapon, two.fire.flame], ['longsword', 'scene-b-b']);
});

test('back to the free show: the user’s place and knights come back with it; at once (the start screen), their look and framing too', () => {
  const s = shrine({ place: { scenery: 'shrine', weapon: null, element: null } });
  const { director, fire, kn } = directorFor({ scenery: 'ruins', knights: 'on', knightCount: 1 });
  const { looks, camera } = director.parts;
  director.scene({ ref: 'b:frozen-shrine', scene: s }, { instant: true });
  assert.deepEqual([fire.scenery, looks.pinned?.look, !!camera.pinned, kn.present], ['shrine', 'kaleido', true, 3]);
  // The chip picked again (or Scenes switched off) with no music: at once.
  director.scene(null, { instant: true });
  for (let i = 0; i < 120; i++) director.update(FRAME, 0.016);
  assert.equal(director.sceneName, null);
  assert.equal(fire.scenery, 'ruins', 'the user’s own place');
  assert.equal(kn.present, 1, 'their knights');
  assert.equal(looks.pinned, null, 'the look let go');
  assert.notEqual(looks.look, 'kaleido', 'the show’s own turn, not the scene’s look');
  assert.equal(camera.pinned, null, 'the framing let go');
  assert.ok(!fire.flame.startsWith('scene-'), `the fire in the show’s own colors (${fire.flame})`);
  // Live (a flash on a downbeat): the place and knights at once, the look and framing unheld
  // until the show's next turn or cut (no jump).
  director.scene({ ref: 'b:frozen-shrine', scene: s }, { instant: true });
  director.scene(null);
  assert.deepEqual([fire.scenery, kn.present], ['ruins', 1]);
  assert.deepEqual([looks.held, camera.held, !!camera.pinned, !!looks.pinned], [false, false, true, true]);
});

test('the user’s Camera: Still and unchecked Elements win over a Hold scene’s move and element', async () => {
  const cam = { pos: [2.5, 1.2, 3.5], target: [0, 0.8, 0], fov: 50, roll: 0, move: { kind: 'sweep', amount: 1, bars: 4 } };
  const s = shrine({ place: { scenery: 'shrine', weapon: 'greatsword', element: 'lightning' }, camera: cam });
  const user = settingsWith({ camera: 'still', elements: { fire: true, ice: true, lightning: false } });
  assert.equal(sceneOverrides(s, 'hold', user).camera, 'still');
  assert.equal(sceneOverrides(s, 'hold', settingsWith()).camera, 'drift', 'the scene’s move otherwise');
  assert.deepEqual([sceneElement(s, user), sceneElement(s, settingsWith()), sceneElement(null)], [null, 'lightning', null]);
  const { director, fire } = directorFor({ camera: 'still', knights: 'off', elements: { fire: true, ice: true, lightning: false } });
  director.scene({ ref: 'b:sweep', scene: s }, { instant: true });
  await tick();
  assert.equal(director.parts.layers.view.camera, 'still');
  assert.equal(fire.weapon, 'greatsword', 'its weapon');
  assert.notEqual(fire.element, 'lightning', 'not the element the user unchecked');
  // Its framing holds its painted pose through the music.
  const pose = () => fire.calls.filter((c) => c[0] === 'setPose').at(-1)[1];
  bars(director, 1, { first: ['start'] });
  const at = [...pose().pos];
  bars(director, 4, { from: 2 });
  assert.deepEqual(pose().pos, at, 'no sweep');
  // Its recolors draw from the user's elements.
  const mark = fire.impacts.length;
  for (let i = 0; i < 24; i++) director.hit();
  const drawn = new Set(fire.impacts.slice(mark).map((i) => i.element));
  assert.ok(drawn.size && !drawn.has('lightning'), [...drawn].join());
  // With lightning on, the scene's own element and move.
  const on = directorFor({ knights: 'off' });
  on.director.scene({ ref: 'b:sweep', scene: s }, { instant: true });
  await tick();
  assert.equal(on.fire.element, 'lightning');
  assert.equal(on.director.parts.layers.view.camera, 'drift');
});

test('Low Flash and Chill keep their promises with a scene playing: no Color Cycle hit, no more hits at once than theirs, an Echo look without its palette steps', () => {
  const s = shrine({ look: { name: 'echo', amount: 1.2, params: {} }, drops: { fx: { cycle: 'on', shatter: 'on', burst: 'mix' }, count: 3 } });
  assert.ok(FLASHY_DROPS.includes('cycle'), 'the Color Cycle is a flashy drop hit');
  for (const id of ['safe', 'chill']) {
    const user = presetUser(id);
    assert.equal(user.dropFx.cycle, 'off', `${id}: Color Cycle off`);
    const o = sceneOverrides(s, 'hold', user);
    assert.equal(o.dropFx.cycle, 'off', `${id}: the scene can't turn the Color Cycle hit back on`);
    assert.equal(o.dropFx.shatter, 'on', `${id}: its other hits as painted`);
    assert.equal(o.dropCount, user.dropCount, `${id}: never more hits at once than the user's ${user.dropCount}`);
  }
  // The user's count caps the scene's whatever it is (a scene may ask for fewer); the Painter shows it as painted.
  assert.deepEqual([1, 2, 3].map((n) => sceneOverrides(s, 'hold', settingsWith({ dropCount: n })).dropCount), [1, 2, 3]);
  assert.equal(sceneOverrides(shrine({ drops: { fx: { shatter: 'on' }, count: 1 } }), 'hold', settingsWith({ dropCount: 3 })).dropCount, 1);
  assert.equal(sceneOverrides(s, 'hold', settingsWith({ dropCount: 1 }), { paintedLook: true }).dropCount, 3, 'the Painter: as painted');
  assert.equal(sceneOverrides(s, 'hold', settingsWith()).dropFx.cycle, 'on', 'the user’s Color Cycle in the mix: the scene’s own');
  assert.equal(looksPin(s, presetUser('chill')).look, 'echo', 'the Echo look itself isn’t a flash: it plays');

  // End to end, through the music: the start, the groove, a breakdown, the drop, rings and G.
  // Counts the frames the palette is cycled (fire.glitch.cycle), and the echo's.
  const run = (user, scene) => {
    const { director, fire } = directorFor({ ...user, knights: 'off' });
    if (scene) director.scene({ ref: `b:${scene.id}`, scene }, { instant: true });
    const seen = { frames: 0, cycled: 0, echoed: 0, drops: 0 };
    const update = director.update;
    director.update = (f, dt) => {
      update(f, dt);
      seen.frames++;
      if (fire.glitch.cycle) seen.cycled++;
      if (fire.glitch.feedback > 0) seen.echoed++;
    };
    bars(director, 4, { first: ['start'] });
    director.update(BREAKDOWN, 0.016);
    bars(director, 3, { from: 5, state: 'breakdown', level: 0.2 });
    for (let i = 0; i < 4; i++) {
      director.update(DROP, 0.016);
      bars(director, 2, { from: 1 });
      director.ring();
      director.glitchHit();
      bars(director, 2, { from: 3 });
    }
    seen.look = director.parts.looks.playing.join();
    return seen;
  };
  const shrineScene = builtIn.map((sc) => normalizeScene(sc)).find((sc) => sc.id === 'frozen-shrine');
  assert.equal(shrineScene?.look.name, 'echo', 'Frozen Shrine, a built-in held Echo scene');
  const echoOnly = { ...Object.fromEntries(Object.keys(LOOKS).map((k) => [k, 'off'])), echo: 'on' };
  for (const id of ['safe', 'chill']) {
    for (const [what, scene, over] of [['an Echo scene', s, {}], ['Frozen Shrine', shrineScene, {}], ['the free show’s Echo', null, { looks: echoOnly }]]) {
      const seen = run({ ...presetUser(id), ...over }, scene);
      assert.equal(seen.look, 'echo', `${id}, ${what}: the Echo look plays`);
      assert.ok(seen.echoed > seen.frames / 2, `${id}, ${what}: its echo shows (${seen.echoed} of ${seen.frames} frames)`);
      assert.equal(seen.cycled, 0, `${id}, ${what}: no palette cycling (${seen.cycled} of ${seen.frames} frames)`);
    }
  }
  // (With the user's Color Cycle in the mix, Club's, the same scene cycles its palette.)
  const club = run(presetUser('club'), s);
  assert.ok(club.cycled > 10, `Club cycles (${club.cycled} frames)`);
});
