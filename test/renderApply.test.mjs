// applyRenderSettings' early-out (src/visualizer/render.js): the render show calls it every
// frame, and when nothing renderState reads has changed it stops before working anything out.
// It must still send every change: a setting, a roll of the render show, a palette slot
// changed in place, a scene that was forgotten; and it must watch everything renderState reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRenderSettings, forgetApplied, renderState, RENDER_READS, XRAY_VIEWS } from '../src/visualizer/render.js';
import { LOOKS } from '../src/visualizer/looks.js';

const every = (mode, names) => Object.fromEntries(Object.keys(names).map((k) => [k, mode]));
function fakeFire() {
  const calls = [];
  const fire = { calls };
  for (const name of ['setRender', 'setPalette', 'setFog', 'setShadows', 'setXray'])
    fire[name] = (v) => calls.push([name, v]);
  return fire;
}
const SETTINGS = () => ({
  pixelSize: 4,
  pixelShift: 'off',
  dither: 0.08,
  ditherMatrix: '4',
  outlines: 'on',
  palette: 'flame',
  fewColors: 'off',
  vignette: 0.85,
  exposure: 1.45,
  fog: 'light',
  shadows: true,
  flameFps: 12,
  colorChange: 0.34,
  xray: 'off',
  xrayView: null,
  xrayViews: every(true, XRAY_VIEWS),
  hitStop: 'on',
  hitFlash: 'on',
  debris: 'on',
  marks: 'on',
  looks: every('mix', LOOKS),
});
const LIVE = () => ({
  outlines: true,
  few: null,
  pixelSize: null,
  matrix: 4,
  fog: 'light',
  hitStop: true,
  hitFlash: true,
  debris: true,
  marks: true,
  xray: null,
});

/** The keys an object is read for while `fn` runs over it. */
function readsOf(obj, fn) {
  const keys = new Set();
  const proxy = new Proxy(obj, {
    get(t, k) {
      if (typeof k === 'string') keys.add(k);
      return t[k];
    },
  });
  fn(proxy);
  return keys;
}

test('renderState reads nothing the early-out doesn’t watch', () => {
  const variants = [
    [SETTINGS(), null],
    [SETTINGS(), LIVE()],
    [
      { ...SETTINGS(), palette: [0, 6, 8], fog: 'mix', ditherMatrix: 'mix', xrayView: 'normals' },
      { ...LIVE(), few: [0, 5, 7], xray: 'flow' },
    ],
    [
      { ...SETTINGS(), outlines: 'off', hitStop: 'mix' },
      { ...LIVE(), outlines: false, pixelSize: 3 },
    ],
  ];
  for (const [s, live] of variants) {
    const fromSettings = readsOf(s, (p) => renderState(p, live));
    for (const k of fromSettings) assert.ok(RENDER_READS.settings.includes(k), `settings.${k} is read but not watched`);
    if (live) {
      const fromLive = readsOf(live, (p) => renderState(s, p));
      for (const k of fromLive) assert.ok(RENDER_READS.live.includes(k), `live.${k} is read but not watched`);
    }
  }
});

test('the same inputs again: nothing is sent; any change is', () => {
  const fire = fakeFire();
  const s = SETTINGS();
  const live = LIVE();
  applyRenderSettings(fire, s, live);
  assert.ok(fire.calls.length > 0, 'a new scene gets everything');
  fire.calls.length = 0;
  for (let i = 0; i < 5; i++) applyRenderSettings(fire, s, live);
  assert.deepEqual(fire.calls, []);
  s.dither = 0.16;
  applyRenderSettings(fire, s, live);
  assert.deepEqual(fire.calls, [['setRender', { dither: 0.16 }]]);
  fire.calls.length = 0;
  live.fog = 'thick';
  s.fog = 'mix';
  applyRenderSettings(fire, s, live);
  assert.deepEqual(fire.calls, [['setFog', 'thick']]);
  fire.calls.length = 0;
  live.few = [0, 6, 8];
  applyRenderSettings(fire, s, live);
  assert.deepEqual(fire.calls, [['setPalette', [0, 6, 8]]]);
});

test('palette slots changed in place are seen; a forgotten scene gets everything again', () => {
  const fire = fakeFire();
  const s = { ...SETTINGS(), palette: [0, 6, 8] };
  applyRenderSettings(fire, s);
  fire.calls.length = 0;
  s.palette[2] = 7;
  applyRenderSettings(fire, s);
  assert.deepEqual(fire.calls, [['setPalette', [0, 6, 7]]]);
  fire.calls.length = 0;
  applyRenderSettings(fire, s);
  assert.deepEqual(fire.calls, []);
  forgetApplied(fire);
  applyRenderSettings(fire, s);
  assert.ok(fire.calls.some(([name]) => name === 'setRender') && fire.calls.some(([name]) => name === 'setPalette'));
});

test('with the render show’s rolls and without: switching between them is a change', () => {
  const fire = fakeFire();
  const s = { ...SETTINGS(), outlines: 'mix' };
  const live = { ...LIVE(), outlines: false };
  applyRenderSettings(fire, s, live);
  fire.calls.length = 0;
  applyRenderSettings(fire, s, null); // (resting: outlines in the mix rest on)
  assert.deepEqual(fire.calls, [['setRender', { outlines: true }]]);
});
