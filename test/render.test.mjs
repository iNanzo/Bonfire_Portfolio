// Bonfire Live's Render tab (src/visualizer/render.js): what the scene is sent, only what
// changed; the render switches (outlines, few colors, pixel shifts, x-ray flips, how hits
// land) off, in the mix and always through the looks' turns; flips on the beat and never
// on a drop's own bar; and the steps a render menu walks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLooks, LOOKS, CHANCE } from '../src/visualizer/looks.js';
import {
  applyRenderSettings, createRenderShow, renderState, shiftSize, stepRender, renderText, forgetApplied,
  FEW_PALETTES, PIXEL_SIZES, XRAY_VIEWS, RENDER_STEPS,
} from '../src/visualizer/render.js';

const every = (mode, names) => Object.fromEntries(Object.keys(names).map((k) => [k, mode]));
/** A stand-in scene: records what it's sent. */
function fakeFire() {
  const calls = [];
  const fire = { calls };
  for (const name of ['setRender', 'setPalette', 'setFog', 'setShadows', 'setXray']) fire[name] = (v) => calls.push([name, v]);
  return fire;
}
const SETTINGS = () => ({
  pixelSize: 4, pixelShift: 'off', dither: 0.08, ditherMatrix: '4', outlines: 'on', palette: 'flame', fewColors: 'off',
  vignette: 0.85, exposure: 1.45, fog: 'light', shadows: true, flameFps: 12, colorChange: 0.34,
  xray: 'off', xrayViews: every(true, XRAY_VIEWS), hitStop: 'on', hitFlash: 'on', debris: 'on', marks: 'on',
  looks: every('mix', LOOKS),
});

test('render settings: everything once for a new scene, then only what changed', () => {
  const fire = fakeFire();
  const s = SETTINGS();
  applyRenderSettings(fire, s);
  const names = fire.calls.map(([n]) => n).sort();
  assert.deepEqual(names, ['setFog', 'setPalette', 'setRender', 'setShadows', 'setXray']);
  const partial = fire.calls.find(([n]) => n === 'setRender')[1];
  assert.deepEqual(partial, { pixelSize: 4, dither: 0.08, ditherMatrix: 4, outlines: true, vignette: 0.85, exposure: 1.45, colorChange: 0.34, flameFps: 12, hitStop: true, hitFlash: true, debris: true, marks: true });
  fire.calls.length = 0;
  applyRenderSettings(fire, s);
  assert.deepEqual(fire.calls, [], 'nothing changed: nothing sent');
  s.dither = 0.4;
  s.fog = 'thick';
  s.shadows = false;
  applyRenderSettings(fire, s);
  assert.deepEqual(fire.calls, [['setRender', { dither: 0.4 }], ['setFog', 'thick'], ['setShadows', false]]);
  // Another scene (a rebuild) gets everything again.
  const other = fakeFire();
  applyRenderSettings(other, s);
  assert.equal(other.calls.length, 5);
});

test('render state: unknown saved values fall back; switches in the mix rest where the site is', () => {
  const s = { ...SETTINGS(), palette: 'bogus', fog: 'soup', ditherMatrix: 'mix', outlines: 'mix', hitStop: 'mix', xray: 'on' };
  const r = renderState(s);
  assert.equal(r.palette, 'flame');
  assert.equal(r.fog, 'light');
  assert.equal(r.ditherMatrix, 4);
  assert.equal(r.outlines, true);
  assert.equal(r.hitStop, true);
  assert.equal(r.xray, null, 'no x-ray without the show');
  assert.equal(renderState({ ...s, ditherMatrix: '8' }).ditherMatrix, 8);
  assert.equal(renderState({ ...s, outlines: 'off', hitStop: false }).outlines, false);
  assert.equal(renderState({ ...s, fog: 'mix' }, { fog: 'thick' }).fog, 'thick');
  assert.deepEqual(renderState(s, { few: [0, 6, 8] }).palette, [0, 6, 8]);
});

test('every render switch in the mix has a chance per look', () => {
  for (const k of ['outlines', 'fewColors', 'pixelShift', 'xray', 'hitStop', 'hitFlash', 'debris', 'marks']) {
    assert.ok(CHANCE[k] > 0 && CHANCE[k] < 1, `${k} has a CHANCE`);
  }
});

/** The show over `turns` looks, `bars` bars each (period 0.5 s). Returns what each turn had. */
function runShow(settings, { turns = 60, bars = 4, reducedMotion = false, onBar = null } = {}) {
  const fire = fakeFire();
  const looks = createLooks({});
  const show = createRenderShow(fire, settings, { looks, reducedMotion });
  const period = 0.5;
  let t = 0;
  const seen = [];
  show.update(t);
  for (let i = 0; i < turns; i++) {
    looks.next(settings.looks);
    show.update(t);
    seen.push({ ...show.live });
    for (let b = 0; b < bars * 8; b++) {
      if (b % 8 === 0) { show.bar(t, { period, sinceDrop: 4, budget: 1 }); onBar?.(show, t); }
      t += period / 2;
      show.update(t);
      if (show.live.xray) seen.at(-1).flipped = show.live.xray;
    }
  }
  return { fire, seen, show };
}

test('outlines and few colors: off never, always every look, in the mix some looks', () => {
  for (const [key, field] of [['outlines', 'outlines'], ['fewColors', 'few']]) {
    const count = (mode) => runShow({ ...SETTINGS(), [key]: mode }, { bars: 0 }).seen.filter((l) => (field === 'few' ? l.few !== null : l[field])).length;
    assert.equal(count('off'), 0, `${key} off`);
    assert.equal(count('on'), 60, `${key} always`);
    const mix = count('mix');
    assert.ok(mix > 3 && mix < 57, `${key} in the mix comes and goes (${mix}/60)`);
  }
  const few = runShow({ ...SETTINGS(), fewColors: 'on' }, { bars: 0 }).seen.map((l) => String(l.few));
  assert.ok(new Set(few).size >= 5, 'a new few each time, from the list');
  assert.ok(few.every((p) => FEW_PALETTES.some((f) => String(f) === p)));
  for (let i = 1; i < few.length; i++) assert.notEqual(few[i], few[i - 1], 'never the same few twice running');
});

test('few colors in the mix: never on the opening look (the start screen and the intro), then some looks', () => {
  let opening = 0;
  let next = 0;
  for (let i = 0; i < 400; i++) {
    const looks = createLooks({});
    const show = createRenderShow(fakeFire(), { ...SETTINGS(), fewColors: 'mix' }, { looks });
    show.update(0);
    if (show.live.few !== null) opening++;
    looks.next(every('mix', LOOKS));
    show.update(0.1);
    if (show.live.few !== null) next++;
  }
  assert.equal(opening, 0, 'the opening look keeps the flame’s colors');
  assert.ok(next > 30 && next < 160, `from the next look, some (${next}/400)`);
  const always = createRenderShow(fakeFire(), { ...SETTINGS(), fewColors: 'on' }, { looks: createLooks({}) });
  always.update(0);
  assert.notEqual(always.live.few, null, 'always: the opening look too');
});

test('pixel shifts: a rolled size with each look, a jump on drops, the size set when off', () => {
  const { seen } = runShow({ ...SETTINGS(), pixelShift: 'on' }, { bars: 0 });
  assert.ok(seen.every((l) => l.pixelSize !== 4 && l.pixelSize >= 2 && l.pixelSize <= 8), 'always: never the size set');
  assert.ok(new Set(seen.map((l) => l.pixelSize)).size >= 3);
  assert.ok(seen.every((l) => PIXEL_SIZES.includes(l.pixelSize)));
  const s = { ...SETTINGS(), pixelShift: 'on' };
  const looks = createLooks({});
  const show = createRenderShow(fakeFire(), s, { looks });
  show.update(0);
  looks.next(s.looks);
  show.update(0);
  for (let i = 0; i < 20; i++) {
    const was = show.live.pixelSize;
    show.drop();
    show.update(0);
    assert.notEqual(show.live.pixelSize, was, 'a drop jumps');
  }
  s.pixelShift = 'off';
  show.update(0);
  assert.equal(show.live.pixelSize, null, 'off: the size set');
  assert.equal(renderState(s, show.live).pixelSize, 4);
  assert.equal(runShow({ ...SETTINGS(), pixelShift: 'on' }, { bars: 0, reducedMotion: true }).seen.filter((l) => l.pixelSize).length, 0, 'none under reduced motion');
  for (let i = 0; i < 200; i++) {
    const n = shiftSize(2);
    assert.ok([3, 4].includes(n), 'half to twice the size set');
  }
});

test('x-ray flips: on the beat, a beat, two or a bar, from the views switched on, never on a drop’s bar', () => {
  const flips = [];
  const s = { ...SETTINGS(), xray: 'on', xrayViews: { normals: true, lighting: false, particles: true, flow: false } };
  const fire = fakeFire();
  const looks = createLooks({});
  const show = createRenderShow(fire, s, { looks });
  const period = 0.5;
  let t = 0;
  let on = null;
  show.update(t);
  looks.next(s.looks);
  show.update(t);
  for (let bar = 0; bar < 400; bar++) {
    show.bar(t, { period, sinceDrop: 3, budget: 1 });
    for (let k = 0; k < 64; k++) { // 4 beats in 1/16ths
      show.update(t);
      if (show.live.xray && !on) on = { view: show.live.xray, from: t };
      if (!show.live.xray && on) { flips.push({ ...on, to: t }); on = null; }
      t += period / 16;
    }
  }
  assert.ok(flips.length > 30, `flips happen now and then (${flips.length} in 400 bars)`);
  assert.ok(flips.length < 300, 'but not every bar');
  const beats = (x) => x / period;
  for (const f of flips) {
    assert.ok(Math.abs(beats(f.from) - Math.round(beats(f.from))) < 0.07, 'starts on a beat');
    const len = Math.round(beats(f.to - f.from));
    assert.ok([1, 2, 4].includes(len) && Math.abs(beats(f.to - f.from) - len) < 0.07, `lasts a beat, two or a bar (${beats(f.to - f.from)})`);
    assert.ok(['normals', 'particles'].includes(f.view), 'only the views switched on');
  }
  // Not on the drop's bar; a drop clears one; the drop's own X-Ray hit lasts a beat.
  for (let i = 0; i < 50; i++) show.bar(t, { period, sinceDrop: 0, budget: 1 });
  show.update(t);
  assert.equal(show.live.xray, null);
  show.xrayHit(t, period);
  show.update(t);
  assert.ok(show.live.xray);
  show.update(t + period * 0.9);
  assert.ok(show.live.xray, 'still in it just before the next beat');
  show.update(t + period * 1.01);
  assert.equal(show.live.xray, null, 'and out on it');
  show.xrayHit(t, period);
  show.drop();
  show.update(t);
  assert.equal(show.live.xray, null, 'a drop brings the picture back');
  // Off: never; reduced motion: never.
  assert.equal(runShow({ ...SETTINGS(), xray: 'off' }, { turns: 20 }).seen.filter((l) => l.flipped).length, 0);
  assert.equal(runShow({ ...SETTINGS(), xray: 'on' }, { turns: 20, reducedMotion: true }).seen.filter((l) => l.flipped).length, 0);
  // In the mix: some looks flip, some don't.
  const mixed = runShow({ ...SETTINGS(), xray: 'mix' }, { turns: 80, bars: 16 }).seen.filter((l) => l.flipped).length;
  assert.ok(mixed > 5 && mixed < 70, `in the mix: some looks (${mixed}/80)`);
});

test('hits: hit-stop, flash, debris and marks switch off, always, or in the mix', () => {
  for (const k of ['hitStop', 'hitFlash', 'debris', 'marks']) {
    const count = (mode) => runShow({ ...SETTINGS(), [k]: mode }, { turns: 60, bars: 0 }).seen.filter((l) => l[k]).length;
    assert.equal(count('off'), 0);
    assert.equal(count('on'), 60);
    const mix = count('mix');
    assert.ok(mix > 10 && mix < 58, `${k} in the mix (${mix}/60)`);
  }
});

test('a render menu steps each setting through its values and shows it as text', () => {
  const s = SETTINGS();
  assert.equal(stepRender(s, 'pixelSize'), 6);
  assert.equal(stepRender(s, 'pixelSize', -1), 4);
  s.dither = 0.1;
  assert.equal(stepRender(s, 'dither'), 0.16, 'from between two steps, the next one up');
  s.dither = 0.5;
  assert.equal(stepRender(s, 'dither'), 0, 'past the last: round to the first');
  for (const key of Object.keys(RENDER_STEPS)) {
    const seen = new Set();
    for (let i = 0; i < RENDER_STEPS[key].length; i++) seen.add(String(stepRender(s, key)));
    assert.equal(seen.size, RENDER_STEPS[key].length, `${key} reaches every step`);
    assert.ok(renderText(s, key).length > 0);
  }
  assert.equal(renderText({ palette: 'moonlit' }, 'palette'), 'Moonlit (4 colors)');
  assert.equal(renderText({ xray: 'mix' }, 'xray'), 'in the mix');
  assert.equal(renderText({ dither: 0 }, 'dither'), 'off');
});

test('a scene’s render: a few slots of the palette, one x-ray view held, and forgetApplied re-sends everything', () => {
  const fire = fakeFire();
  const s = { ...SETTINGS(), palette: [0, 6, 8] };
  assert.deepEqual(renderState(s).palette, [0, 6, 8]);
  applyRenderSettings(fire, s);
  assert.deepEqual(fire.calls.find(([n]) => n === 'setPalette')[1], [0, 6, 8]);
  for (const bad of [[0], [0, 12], ['0', 6], [0.5, 6]]) assert.equal(renderState({ ...s, palette: bad }).palette, 'flame', `${bad}: not slots`);
  assert.equal(renderText(s, 'palette'), 'A scene’s 3 colors');
  // The show's own roll still wins while it's live (a few colors in the mix).
  assert.equal(renderState(s, { few: 'ashen' }).palette, 'ashen');
  // A held x-ray view (a scene's xrayView), under any flip of the show's.
  assert.equal(renderState({ ...s, xrayView: 'normals' }).xray, 'normals');
  assert.equal(renderState({ ...s, xrayView: 'bogus' }).xray, null);
  assert.equal(renderState({ ...s, xrayView: 'normals' }, { xray: 'flow' }).xray, 'flow');
  // Something reset the scene behind the cache (its applyEffects): forget, and it all goes again.
  fire.calls.length = 0;
  applyRenderSettings(fire, s);
  assert.deepEqual(fire.calls, []);
  forgetApplied(fire);
  applyRenderSettings(fire, s);
  assert.equal(fire.calls.length, 5);
  forgetApplied(null);
});
