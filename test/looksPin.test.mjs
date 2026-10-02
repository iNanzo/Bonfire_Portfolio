// A preset scene's look pinned (src/visualizer/looks.js pin()): it survives the show's
// turns, the settings and set(); each turn re-rolls only what it leaves to the dice (the
// details it doesn't pin, its layers in the mix), inside the dice's ranges; its layers
// follow its own switches; it shows at its painted strength in silence (update's `rest`,
// which the director passes) and still answers the beat; a turn-only pin hands back to
// the show; "Pin What You See" pins exactly what's on screen; under reduced motion nothing
// answers the beat; with `cycles` false (the user's Color Cycle Off) the palette never cycles,
// a pinned Echo look's steps and spins and the drop's Color Cycle hit alike. And the tables a
// scene and the Painter read (PARAMS, LOOK_PARAMS, LAYER_DETAILS) hold together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLooks,
  PARAMS,
  LOOK_PARAMS,
  LAYER_DETAILS,
  LAYER_BLENDS,
  LAYERS,
  LOOKS,
  BLEND,
  cleanParam,
} from '../src/visualizer/looks.js';
import { FRAME, directorFor } from './lib/fakeScene.mjs';

const every = (mode, names) => Object.fromEntries(Object.keys(names).map((k) => [k, mode]));
const SHOW = { looks: every('mix', LOOKS), ...every('mix', LAYERS) }; // (the user's settings: everything in the mix)
const frame = (looks, o = {}) =>
  looks.update(o.dt ?? 0, { amt: 1, build: 0, low: false, energy: 0.5, modes: SHOW, ...o });
const inRoll = (key, v) => {
  const p = PARAMS[key];
  if (p.bool) return typeof v === 'boolean';
  if (p.slots)
    return Array.isArray(v) && v.length === p.slots && v.every((n) => Number.isInteger(n) && n >= 0 && n < p.of);
  if (p.values) return (p.roll ?? p.values).includes(v);
  if (p.chance !== undefined && v === 0) return true;
  const [lo, hi] = p.roll;
  const m = p.signed ? Math.abs(v) : v;
  return m >= lo && m <= hi;
};

test('the tables: every detail has a range the dice roll inside, a Title Case label and a hint', () => {
  for (const [k, p] of Object.entries(PARAMS)) {
    assert.match(p.label, /^[A-Z][A-Za-z]*( [A-Za-z]+)*$/, `${k}: label`);
    assert.match(p.label, /^([A-Z][a-z]*|the|a|of|on|in|to)( ([A-Z][a-z]*|the|a|of|on|in|to))*$/, `${k}: Title Case`);
    // A hint that says what it does in a line, not the label again.
    assert.ok(p.hint.length >= 12 && p.hint.length <= 160, `${k}: a hint of 12–160 characters (${p.hint.length})`);
    assert.ok(!p.hint.toLowerCase().startsWith(p.label.toLowerCase()), `${k}: a hint that doesn't repeat its label`);
    if (p.range) {
      assert.ok(
        p.roll[0] >= p.range[0] - 1e-9 && p.roll[1] <= p.range[1] + 1e-9 && p.range[0] < p.range[1],
        `${k}: roll inside range`,
      );
      if (p.signed) assert.ok(-p.roll[1] >= p.range[0], `${k}: the other way too`);
    }
    if (p.values) {
      assert.ok(
        (p.roll ?? p.values).every((v) => p.values.includes(v)),
        `${k}: rolled values allowed`,
      );
      if (p.names) assert.equal(p.names.length, p.values.length, `${k}: a name each`);
    }
  }
  for (const keys of [...Object.values(LOOK_PARAMS), ...Object.values(LAYER_DETAILS)])
    for (const k of keys) assert.ok(PARAMS[k], `${k} is in PARAMS`);
  for (const k of Object.keys(LOOK_PARAMS)) assert.ok(LOOKS[k]);
  for (const k of Object.keys(LAYER_DETAILS)) assert.ok(LAYERS[k]);
  for (const list of Object.values(LAYER_BLENDS)) for (const b of list) assert.ok(b in BLEND);
  // cleanParam: what may be pinned, and nothing else.
  assert.equal(cleanParam('glowSize', 99), PARAMS.glowSize.range[1]);
  assert.equal(cleanParam('segments', 7), undefined);
  assert.deepEqual(cleanParam('grad', [0, 5, 9]), [0, 5, 9]);
  assert.equal(cleanParam('grad', [0, 5, 10]), undefined);
  assert.equal(cleanParam('zoomIn', 1), undefined);
  assert.equal(cleanParam('bogus', 1), undefined);
});

test('1,000 turns: every detail the dice roll lands inside PARAMS.roll', () => {
  const g = {};
  const looks = createLooks(g);
  for (let i = 0; i < 1000; i++) {
    looks.next(SHOW.looks);
    frame(looks);
    const d = looks.details;
    for (const [k, v] of Object.entries(d.p)) assert.ok(inRoll(k, v), `${k}: ${v}`);
    assert.ok(
      inRoll('zoomIn', d.zoomIn) && inRoll('turn', d.turn) && inRoll('crunch', d.crunch) && inRoll('scan', d.scan),
    );
    assert.ok(PARAMS.segments.values.includes(d.segments));
    assert.ok(PARAMS.mirror.values.includes(d.mirror));
  }
});

test('a pinned look survives next(), sync() and set(); next() is a new turn of it', () => {
  const g = {};
  const looks = createLooks(g);
  looks.pin({
    look: 'kaleido',
    amount: 1,
    params: { segments: 10 },
    layers: { glow: 'on' },
    details: { glowSize: 4.2 },
  });
  assert.equal(looks.look, 'kaleido');
  assert.deepEqual(looks.playing, ['kaleido'], 'a pinned look plays alone');
  for (let i = 0; i < 30; i++) {
    const turn = looks.turn;
    looks.next({ ...every('off', LOOKS), glitch: 'mix' });
    assert.equal(looks.turn, turn + 1, 'a new turn');
    looks.sync({ ...every('off', LOOKS), haze: 'mix' });
    looks.set('ripple');
    frame(looks, { modes: { ...SHOW, looks: { ...every('off', LOOKS), prism: 'on' } } });
    assert.equal(looks.look, 'kaleido');
    assert.equal(g.kaleido, 10, 'its pinned segments');
    assert.equal(g.glowSize, 4.2);
    assert.ok(g.glow > 0);
    assert.equal(g.split, 0, 'an always-on look of the settings stays out of the scene');
  }
  // Bursts still land, and the pinned segments come back after them.
  looks.bang(1);
  frame(looks);
  assert.equal(g.kaleido, 10);
  looks.pin(null);
  assert.equal(looks.pinned, null);
  looks.set('ripple');
  assert.equal(looks.look, 'ripple', 'unpinned, the show has it back');
});

test('pinned details stay put over 100 turns while the rest are rolled again', () => {
  const g = {};
  const looks = createLooks(g);
  const details = { glowSize: 2.5, glowCut: 0.2, glowAmt: 0.9, grad: [0, 6, 8], gradAmt: 0.6, scan: 2, mirror: 5 };
  looks.pin({
    look: 'echo',
    amount: 1,
    params: { zoomIn: true },
    layers: { glow: 'on', gradient: 'on', grain: 'on', scanlines: 'on', mirror: 'on' },
    details,
    blends: { glow: 'screen' },
  });
  const grains = new Set();
  for (let i = 0; i < 100; i++) {
    looks.next(SHOW.looks);
    frame(looks);
    assert.deepEqual(
      [g.glowSize, g.glowCut, [g.gradA, g.gradB, g.gradC], g.scanMode, g.mirror],
      [2.5, 0.2, [0, 6, 8], 2, 5],
    );
    assert.ok(g.zoom < 1, 'the echo falls inward (pinned)');
    grains.add(looks.details.p.grain.toFixed(4));
    assert.equal(looks.details.p.glowAmt, 0.9);
  }
  assert.ok(grains.size > 50, `the grain's own amount is rolled each turn (${grains.size})`);
  // Blends: the pinned one with Blend Modes on; the classic ways without it.
  looks.pin({ look: 'echo', layers: { glow: 'on', blend: 'on' }, blends: { glow: 'screen' } });
  frame(looks);
  assert.equal(g.glowMode, BLEND.screen);
  assert.equal(looks.details.blends.glow, 'screen');
  looks.pin({ look: 'echo', layers: { glow: 'on', blend: 'off' }, blends: { glow: 'screen' } });
  frame(looks);
  assert.equal(g.glowMode, BLEND.add, 'Blend Modes off: the classic way');
});

test('a pinned scene’s layers: on always, off never, in the mix per turn (not the settings’)', () => {
  const g = {};
  const looks = createLooks(g);
  looks.pin({ look: 'ember', layers: { glow: 'on', blur: 'off', ghost: 'mix' } });
  let ghosts = 0;
  for (let i = 0; i < 200; i++) {
    looks.next(SHOW.looks);
    frame(looks, { modes: { ...SHOW, ...every('on', LAYERS) } }); // (the user's all on: the scene's win)
    assert.ok(g.glow > 0, 'glow always');
    assert.equal(g.blur, 0, 'blur off');
    assert.equal(g.grad, 0, 'a layer the scene leaves out is off');
    if (g.ghost > 0) ghosts++;
  }
  assert.ok(ghosts > 20 && ghosts < 120, `ghosting in the mix comes and goes (${ghosts}/200)`);
});

test('in silence a pinned look shows at its painted strength (rest), and still answers the beat', () => {
  const g = {};
  const looks = createLooks(g);
  looks.pin({
    look: 'kaleido',
    amount: 1,
    layers: { glow: 'on', gradient: 'on' },
    details: { glowAmt: 1, gradAmt: 0.8 },
  });
  const silent = (rest) => looks.update(1 / 60, { amt: 0, build: 0, low: false, energy: 0, modes: SHOW, rest });
  silent(0);
  assert.equal(g.glow, 0, 'rest 0: silent means clean');
  assert.equal(g.kaleido, 0);
  silent(1);
  assert.ok(g.glow > 0.6 && g.kaleido > 0 && g.grad > 0.7, 'at its painted strength');
  const calm = g.glow;
  looks.beat(1, true, 0.5);
  silent(1);
  assert.ok(g.glow > calm, 'the kick swells it');
  looks.pin({ look: 'kaleido', amount: 0.5, layers: { glow: 'on' }, details: { glowAmt: 1 } });
  silent(1);
  assert.ok(g.glow > 0.3 && g.glow < calm, 'half strength');
  // Unpinned, rest changes nothing.
  looks.pin(null);
  silent(1);
  assert.equal(g.glow, 0);
  assert.equal(g.kaleido, 0);
});

test('the director passes rest: a pinned look shows with no music, and Effects Strength 0 is still clean', () => {
  const { director, fire } = directorFor({ glitch: 1 });
  director.parts.looks.pin({ look: 'kaleido', amount: 1, layers: { glow: 'on' } });
  const silent = { ...FRAME, state: 'silent', level: 0 };
  for (let i = 0; i < 120; i++) director.update(silent, 1 / 60);
  assert.ok(fire.glitch.glow > 0 && fire.glitch.kaleido > 0, 'painted strength in silence');
  const off = directorFor({ glitch: 0 });
  off.director.parts.looks.pin({ look: 'kaleido', amount: 1, layers: { glow: 'on' } });
  for (let i = 0; i < 10; i++) off.director.update(silent, 1 / 60);
  assert.equal(off.fire.glitch.glow, 0);
  assert.equal(off.fire.glitch.kaleido, 0);
});

test('hold: false lasts the turn, then the show carries on', () => {
  const looks = createLooks({});
  looks.pin({ look: 'vortex', layers: {} }, { hold: false });
  assert.equal(looks.held, false);
  looks.sync({ ...every('off', LOOKS), glitch: 'mix' });
  assert.equal(looks.look, 'vortex', 'the turn stays the scene’s');
  looks.next({ ...every('off', LOOKS), glitch: 'mix' });
  assert.equal(looks.pinned, null);
  assert.equal(looks.look, 'glitch');
});

test('fresh: false (the scene edited) keeps the rolls; a new scene rolls again', () => {
  const g = {};
  const looks = createLooks(g);
  const pin = { look: 'haze', layers: { glow: 'on', grain: 'on' }, details: { glowSize: 2 } };
  looks.pin(pin);
  const grain = looks.details.p.grain;
  const turn = looks.turn;
  looks.pin({ ...pin, details: { glowSize: 3.5 } }, { fresh: false });
  frame(looks);
  assert.equal(g.glowSize, 3.5, 'the edit shows');
  assert.equal(looks.details.p.grain, grain, 'the rolled grain stays');
  assert.equal(looks.turn, turn, 'no new turn');
  looks.pin(pin);
  assert.equal(looks.turn, turn + 1);
});

test('"Pin What You See": pinning the details on screen reproduces the picture', () => {
  for (let run = 0; run < 40; run++) {
    const g = {};
    const looks = createLooks(g);
    looks.next(SHOW.looks);
    const modes = { ...SHOW, blend: 'on' };
    frame(looks, { modes });
    const before = { ...g };
    const d = looks.details;
    const params = Object.fromEntries(LOOK_PARAMS[d.look]?.map((k) => [k, d[k]]) ?? []);
    const layers = Object.fromEntries(Object.entries(d.on).map(([k, on]) => [k, on ? 'on' : 'off']));
    // (Painterly and Watercolor both on: the one showing wins.)
    if (d.on.paint && d.on.wash) layers[before.style === 1 ? 'wash' : 'paint'] = 'off';
    looks.pin({
      look: d.look,
      amount: 1,
      params,
      layers,
      details: { ...d.p, scan: d.scan, mirror: d.mirror },
      blends: d.blends,
    });
    frame(looks, { modes });
    for (const k of [
      'glow',
      'glowSize',
      'glowCut',
      'grad',
      'gradA',
      'gradB',
      'gradC',
      'ghost',
      'ghostKeep',
      'blur',
      'style',
      'styleR',
      'styleMix',
      'paintAngle',
      'washEdge',
      'mirror',
      'scan',
      'scanMode',
      'feedMode',
      'glowMode',
      'gradMode',
      'warpMix',
      'noise',
      'split',
      'zoom',
      'kaleido',
    ]) {
      assert.deepEqual(g[k], before[k], `${d.look}: ${k}`);
    }
  }
});

test('reduced motion: the looks answer no beat, hat or hit, and the spotlight doesn’t breathe', () => {
  const g = {};
  const looks = createLooks(g, { reducedMotion: true });
  looks.pin({
    look: 'echo',
    amount: 1,
    layers: { glow: 'on', spotlight: 'on', chroma: 'on' },
    details: { glowAmt: 1, spot: 0.4, spotBreath: 0.25, chroma: 1, chromaKick: 6 },
  });
  const at = (energy) => looks.update(1 / 60, { amt: 0, build: 0, low: false, energy, modes: SHOW, rest: 1 });
  for (let i = 0; i < 120; i++) at(0);
  const calm = { ...g };
  looks.beat(1, true, 0.5);
  looks.hat(1);
  looks.bang(1, { flash: true });
  assert.deepEqual(looks.drop({ shatter: 'on', shock: 'on', ink: 'on' }, 3), [], 'no drop hits');
  for (let i = 0; i < 120; i++) at(1);
  for (const k of ['glow', 'split', 'cycle', 'invert', 'rippleAmp', 'slice', 'iris'])
    assert.ok(Math.abs(g[k] - calm[k]) < 1e-4, `${k} holds still (${calm[k]} → ${g[k]})`);
  assert.ok(g.glow > 0 && g.split === 1 && g.iris < 2, 'the still layers show');
  // Without it, the same beat moves them.
  const h = {};
  const moving = createLooks(h);
  moving.pin({
    look: 'echo',
    amount: 1,
    layers: { glow: 'on', spotlight: 'on', chroma: 'on' },
    details: { glowAmt: 1, spot: 0.4, spotBreath: 0.25, chroma: 1, chromaKick: 6 },
  });
  moving.update(1 / 60, { amt: 0, build: 0, low: false, energy: 0, modes: SHOW, rest: 1 });
  const before = { ...h };
  moving.beat(1, true, 0.5);
  moving.update(1 / 60, { amt: 0, build: 0, low: false, energy: 1, modes: SHOW, rest: 1 });
  assert.ok(h.glow > before.glow && h.split > before.split && h.cycle > 0, '(the kick swells, splits and cycles)');
});

test('cycles false (the user’s Color Cycle Off): a pinned Echo plays its echo with the palette still, through downbeats, big hits and a Color Cycle drop', () => {
  const runs = {};
  for (const cycles of [false, true]) {
    const g = {};
    const looks = createLooks(g);
    looks.pin({ look: 'echo', amount: 1, layers: {} });
    let cycled = 0,
      echoed = 0;
    const step = () => {
      looks.update(1 / 60, { amt: 1, build: 0, low: false, energy: 0.6, modes: SHOW, rest: 1, cycles });
      if (g.cycle) cycled++;
      if (g.feedback > 0) echoed++;
    };
    for (let beat = 0; beat < 32; beat++) {
      looks.beat(0.9, beat % 4 === 0, 0.48);
      if (beat % 8 === 4) looks.bang(1, { flash: true });
      if (beat === 16) looks.drop({ cycle: 'on' }, 1);
      for (let f = 0; f < 29; f++) step();
    }
    runs[String(cycles)] = { cycled, echoed };
  }
  assert.equal(runs.false.cycled, 0, 'never a palette step or spin');
  assert.ok(runs.false.echoed > 800, 'the echo itself plays on');
  assert.ok(runs.true.cycled > 20, `(with it, the palette steps and spins: ${runs.true.cycled} frames)`);
});
