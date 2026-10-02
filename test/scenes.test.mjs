// The preset scene format (src/scenes.js): a new scene is valid; the normalizer never
// throws and always hands back a valid scene (a fuzz over 500 random values); every rule
// has its error, at its path, and the validator never throws (names like 'constructor' or
// '__proto__' as values and keys); files, hashes and references round-trip (Unicode names
// too); the vocabularies match the engine's own tables; the basics moved to ruleBasics.js
// are still where contentRules.js exported them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMERA_MOVES,
  DETAIL_KEYS,
  FINISH_KEYS,
  FLY_SHOWS,
  KNIGHT_SEATS,
  KNIGHT_STYLE_KEYS,
  MAX_SCENES,
  MOVE_BARS,
  MUSIC,
  NAME_MAX,
  ID_MAX,
  SCENE_APP,
  SCENE_RANGES,
  SCENE_VERSION,
  TARGET_BOX,
  decodeSceneHash,
  defaultScene,
  encodeSceneHash,
  normalizeScene,
  parseRef,
  readSceneFile,
  sceneFile,
  sceneRef,
  sceneSummary,
  sceneSwatches,
  uniqueSceneId,
  validateScene,
  validateScenes,
} from '../src/scenes.js';
import * as basics from '../src/ruleBasics.js';
import * as rules from '../src/contentRules.js';
import { DEFAULT_EFFECTS, ELEMENT_IDS } from '../src/effectsDefaults.js';
import { SCENERIES } from '../src/sceneries.js';
import { DROP_FX, LAYER_BLENDS, LAYER_DETAILS, LAYERS, LOOK_PARAMS, LOOKS, PARAMS } from '../src/visualizer/looks.js';
import { FEW_PALETTES, PIXEL_SIZES } from '../src/visualizer/render.js';
import { FORMATIONS, KNIGHT_MOVES, SEAT_POSES } from '../src/visualizer/knightShow.js';
import { FLY_MOVES } from '../src/visualizer/fireflyMoves.js';
import { HELMET_NAMES } from '../src/knightNames.js';
import { keepInClearing, MOVE_KINDS, poseOnCycle } from '../src/visualizer/clearing.js';
import { FINISHES } from '../src/bonfire/steel.js';
import { STYLE_KEYS, STYLE_NAMES } from '../src/bonfire/knightStyles.js';

const content = () => JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8'));
/** The paths validateScene reports (sorted). */
const problems = (s, o) => {
  const out = [];
  validateScene(s, (path, message) => out.push({ path, message }), 'scene', o);
  return out;
};
const paths = (s, o) =>
  problems(s, o)
    .map((e) => e.path)
    .sort();
const clean = (s, o) => assert.deepEqual(problems(s, o), [], JSON.stringify(problems(s, o)));

// A seeded random (mulberry32), so a failing fuzz case can be found again.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('a new scene is valid, whatever it is called', () => {
  for (const name of [
    'New Scene',
    'Frozen Shrine',
    '  spaced out  ',
    'Été brûlant ✨',
    '火の祭壇',
    '🔥🔥',
    '',
    'x'.repeat(90),
  ]) {
    const s = defaultScene(name);
    clean(s);
    assert.equal(s.v, SCENE_VERSION);
    assert.ok([...s.name].length <= NAME_MAX && s.name.trim() === s.name && s.name.length > 0, s.name);
    assert.match(s.id, basics.ID_RE);
    assert.ok(s.id.length <= ID_MAX);
  }
  const s = defaultScene();
  assert.equal(s.colors.flame.mid, DEFAULT_EFFECTS.flames[0].mid, 'the ember flame');
  assert.equal(s.colors.scenery, null, 'the site’s own scenery colors');
  assert.equal(s.place.scenery, 'ruins');
  assert.deepEqual([s.knights.glow, s.knights.rim], ['mix', 0.5], 'the knights’ Edge Glow in the mix, round 0.5');
  assert.deepEqual(s.camera.pos, [0, 2.2, 6.1], 'the Clearing shot');
  // …swaying as the Clearing does (camera.js: ±0.3 rad over 16 beats).
  const quarter = poseOnCycle(s.camera, 0.25);
  const yaw = (p) => Math.atan2(p[0] - s.camera.target[0], p[2] - s.camera.target[2]);
  assert.ok(
    Math.abs(Math.abs(yaw(quarter.pos) - yaw(s.camera.pos)) - 0.3) < 0.01,
    `sways ±${Math.abs(yaw(quarter.pos)).toFixed(3)} rad`,
  );
  assert.equal(s.camera.move.bars * 4, 16);
  assert.deepEqual(normalizeScene(s), s, 'normalizing a valid scene changes nothing');
  assert.equal(normalizeScene(JSON.parse(JSON.stringify(s))).id, s.id);
});

// Random values: of every type, and (half the time) a valid scene with junk dropped into it.
function junk(rng, depth = 0) {
  const r = rng();
  if (r < 0.1) return null;
  if (r < 0.2) return undefined;
  if (r < 0.3) return rng() < 0.5;
  if (r < 0.45)
    return (
      [NaN, Infinity, -Infinity, -1e9, 1e9, 0, -0, 0.5, 3, 8, 14, 80, 1.75, -2][Math.floor(rng() * 14)] ??
      rng() * 20 - 10
    );
  if (r < 0.6) {
    const words = [
      'on',
      'off',
      'mix',
      'hold',
      'base',
      'kaleido',
      'glow',
      'ruins',
      '#ff00ff',
      '#FFF',
      '#12345',
      '#0a0a0a',
      'nope',
      '',
      ' ',
      '__proto__',
      'constructor',
      'b:x',
      '🔥',
    ];
    return words[Math.floor(rng() * words.length)];
  }
  if (depth > 3) return rng();
  if (r < 0.75) return Array.from({ length: Math.floor(rng() * 5) }, () => junk(rng, depth + 1));
  const o = {};
  const ks = [
    'v',
    'id',
    'name',
    'place',
    'colors',
    'camera',
    'look',
    'layers',
    'details',
    'knights',
    'pos',
    'fov',
    'glow',
    'paint',
    'wash',
    'helmets',
    'count',
    'flame',
    'scenery',
    'void',
    'hi',
    '__proto__',
    'params',
  ];
  for (let i = Math.floor(rng() * 6); i > 0; i--) o[ks[Math.floor(rng() * ks.length)]] = junk(rng, depth + 1);
  return o;
}
function mutate(rng, s) {
  const out = JSON.parse(JSON.stringify(s));
  for (let n = 1 + Math.floor(rng() * 6); n > 0; n--) {
    let at = out;
    for (;;) {
      const ks = Object.keys(at);
      if (!ks.length) break;
      const k = ks[Math.floor(rng() * ks.length)];
      if (at[k] && typeof at[k] === 'object' && rng() < 0.6) {
        at = at[k];
        continue;
      }
      at[k] = junk(rng);
      break;
    }
  }
  return out;
}
// Valid values from the vocabularies, so the fuzz also walks the good paths.
function plausible(rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const s = defaultScene(pick(['Moonlit Ruins', 'Forge Rave', '', 'Élan']));
  s.place = {
    scenery: pick(Object.keys(SCENERIES)),
    weapon: rng() < 0.5 ? null : pick(basics.WEAPON_KEYS),
    element: rng() < 0.5 ? null : pick(ELEMENT_IDS),
  };
  s.look = {
    name: pick(Object.keys(LOOKS)),
    amount: rng() * 3 - 0.5,
    params: { segments: pick([4, 6, 7, 10]), zoomIn: rng() < 0.5, turn: rng() * 4 - 2, crunch: pick([1, 2, 3]) },
  };
  for (const k of Object.keys(LAYERS)) if (rng() < 0.5) s.layers[k] = pick(['off', 'mix', 'on', true, 'maybe']);
  for (const k of Object.keys(PARAMS)) if (rng() < 0.4) s.details[k] = rng() < 0.8 ? rng() * 4 - 1 : [1, 2, 3];
  for (const k of Object.keys(LAYER_BLENDS)) if (rng() < 0.4) s.blends[k] = pick(['normal', 'screen', 'add', 'nope']);
  s.drops = rng() < 0.5 ? null : { fx: { shatter: 'on', ink: 'mix', nope: 'on' }, count: pick([0, 1, 2, 3, 9]) };
  s.render.palette = pick(['flame', 'ashen', 'moonlit', 'rainbow', [0, 6, 8], [6, 8], [0], [0, 0, 9, 10, 3]]);
  s.render.ditherMatrix = pick([4, 8, '8', 6]);
  s.knights = {
    count: pick([0, 1, 2, 3, 4, 7]),
    helmets: [pick(['great', 'armet', null, 'tophat']), 'bascinet'],
    dance: pick(['on', 'mix']),
    formation: pick([...Object.keys(FORMATIONS), 'mix', 'blob']),
    moves: rng() < 0.5 ? null : [pick(Object.keys(KNIGHT_MOVES)), 'moonwalk'],
    shine: 'on',
    reactions: 'off',
    finish: pick([...FINISH_KEYS, 'mix', 'gold']),
    seat: pick(Object.keys(KNIGHT_SEATS)),
    glow: pick(['off', 'mix', 'on', true, 'glowing']),
    rim: rng() * 2,
  };
  s.colors.flame = {
    lo: '#101010',
    mid: pick(['#e0582a', 'red']),
    hi: pick(['#ffc76a', '#202020', '#07070b']),
    core: '#ffffff',
    shade: '#333333',
    light: rng() * 2,
  };
  s.colors.scenery =
    rng() < 0.5
      ? null
      : {
          void: pick(['#07070b', '#ffffff', '#808080']),
          shadow: '#15131d',
          stone: pick(['#2c2a3a', '#000000']),
          wood: '#5b4535',
          bone: '#e9e3d2',
        };
  s.camera = {
    pos: [rng() * 20 - 10, rng() * 10 - 2, rng() * 20 - 10],
    target: rng() < 0.2 ? null : [rng() * 12 - 6, rng() * 6 - 1, rng() * 12 - 6],
    fov: rng() * 100,
    roll: rng() * 2 - 1,
    move: { kind: pick([...Object.keys(CAMERA_MOVES), 'zoom']), amount: rng() * 2, bars: pick([...MOVE_BARS, 3]) },
  };
  return s;
}

test('fuzz: normalizeScene never throws, and what it returns always validates', () => {
  const rng = seeded(20260930);
  const makers = [
    () => junk(rng),
    () => mutate(rng, defaultScene()),
    () => plausible(rng),
    () => mutate(rng, plausible(rng)),
  ];
  for (let i = 0; i < 500; i++) {
    const raw = makers[i % makers.length]();
    let s;
    assert.doesNotThrow(() => {
      s = normalizeScene(raw);
    }, `case ${i}`);
    const found = problems(s);
    assert.deepEqual(found, [], `case ${i}: ${JSON.stringify(raw)?.slice(0, 400)} → ${JSON.stringify(found)}`);
    assert.deepEqual(normalizeScene(s), s, `case ${i}: normalizing twice changes nothing`);
    // It survives JSON (what storage and files do to it).
    assert.deepEqual(problems(JSON.parse(JSON.stringify(s))), [], `case ${i} after JSON`);
  }
  // Values that throw when read still give a scene.
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error('no');
      },
      ownKeys() {
        throw new Error('no');
      },
    },
  );
  clean(normalizeScene(hostile));
  for (const v of [null, undefined, 3, 'scene', [], [1, 2], true, () => {}]) clean(normalizeScene(v));
});

test('fuzz: names every object inherits (constructor, __proto__…) are reported, never thrown, as values and as keys', () => {
  const PROTO = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype', 'isPrototypeOf'];
  /** An own property, even '__proto__' (as JSON.parse makes one). */
  const setOwn = (o, k, v) =>
    Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  const base = () => {
    const d = defaultScene('Proto');
    d.drops = { fx: {}, count: 2 };
    return d;
  };
  // Every field that must be one of a list (and the list fields' items).
  const ONE = [
    'music',
    'place.scenery',
    'place.weapon',
    'place.element',
    'camera.move.kind',
    'camera.move.bars',
    'look.name',
    'render.pixelSize',
    'render.palette',
    'render.ditherMatrix',
    'render.outlines',
    'render.fog',
    'render.flameFps',
    'render.xray',
    'knights.dance',
    'knights.formation',
    'knights.shine',
    'knights.reactions',
    'knights.finish',
    'knights.seat',
    'knights.glow',
    'knights.style',
    'fireflies.show',
    'layers.glow',
    'drops.fx.shatter',
    'blends.glow',
  ];
  const check = (sc, where) => {
    let found;
    assert.doesNotThrow(() => {
      found = problems(sc);
    }, where);
    assert.doesNotThrow(() => validateScenes([sc], () => {}), `${where}: in a list`);
    assert.ok(found.length > 0, `${where}: reported`);
    clean(normalizeScene(sc));
    return found.map((e) => e.path);
  };
  for (const name of PROTO) {
    for (const path of ONE) {
      const sc = base();
      const keys = path.split('.');
      const parent = keys.slice(0, -1).reduce((o, k) => o[k], sc);
      setOwn(parent, keys.at(-1), name);
      assert.ok(check(sc, `${path} = ${name}`).includes(`scene.${path}`), `${path} = ${name}: at its path`);
    }
    // The look's name with details of its own asked for.
    const looked = base();
    looked.look = { name, amount: 1, params: { segments: 6 } };
    assert.deepEqual(check(looked, `look.name = ${name}`), ['scene.look.name'], 'one error: the name');
    // List items.
    for (const [path, list] of [
      ['knights.helmets', (sc) => sc.knights.helmets],
      ['knights.moves', null],
      ['fireflies.moves', null],
    ]) {
      const sc = base();
      if (list) list(sc)[0] = name;
      else {
        const [g, k] = path.split('.');
        sc[g][k] = [name];
      }
      assert.ok(check(sc, `${path}[0] = ${name}`).includes(`scene.${path}[0]`), `${path}[0] = ${name}`);
    }
    // As keys: every group of fields.
    for (const group of [
      null,
      'place',
      'fire',
      'render',
      'camera',
      'camera.move',
      'look',
      'look.params',
      'layers',
      'details',
      'blends',
      'drops',
      'drops.fx',
      'knights',
      'fireflies',
      'colors',
      'colors.flame',
    ]) {
      const sc = base();
      const at = group ? group.split('.').reduce((o, k) => o[k], sc) : sc;
      setOwn(at, name, 'on');
      const where = group ? `${group}.${name}` : name;
      assert.ok(check(sc, `key ${where}`).includes(`scene.${where}`), `key ${where}: at its path`);
    }
  }
});

test('normalizing: fills, clamps, drops unknown keys, fixes colors and the camera', () => {
  const raw = JSON.parse(
    '{"__proto__": {"polluted": true}, "name": " Frozen\\nShrine ", "bogus": 1, "hidden": true, "fire": {"level": 5, "extra": 1}, "layers": {"paint": "on", "wash": "on", "glow": true, "nope": "on"}, "look": {"name": "kaleido", "amount": 9, "params": {"segments": 8, "zoomIn": true, "turn": 1}}, "details": {"glowSize": 99, "grad": [0, 6, 8], "styleFlip": true, "segments": 4, "wat": 1}, "knights": {"count": 3, "helmets": ["armet", "tophat"]}, "render": {"ditherMatrix": "8", "palette": [8, 6, 8, 0, 2, 3]}}',
  );
  const s = normalizeScene(raw);
  clean(s);
  assert.equal({}.polluted, undefined, 'no prototype pollution');
  assert.equal(s.name, 'Frozen Shrine');
  assert.equal(s.id, 'frozen-shrine');
  assert.equal(s.hidden, true);
  assert.equal('bogus' in s, false);
  assert.deepEqual(s.fire, { level: 1, size: 0, height: 0, turbulence: 0, glow: 0, windX: 0, windZ: 0 });
  assert.deepEqual(s.layers, { glow: 'on', paint: 'on', wash: 'mix' }, 'Painterly and Watercolor never both Always');
  assert.deepEqual(s.look, { name: 'kaleido', amount: 2, params: { segments: 8 } }, 'only the look’s own details');
  assert.deepEqual(
    s.details,
    { glowSize: PARAMS.glowSize.range[1], grad: [0, 6, 8] },
    'only what a pinned look takes (no styleFlip)',
  );
  assert.deepEqual(s.knights.helmets, ['armet', null, null], 'one helmet per knight, null where it’s drawn');
  assert.equal(s.render.ditherMatrix, 8);
  assert.deepEqual(s.render.palette, [0, 8, 6, 2], 'slots: the void first, each once, at most 4');
  assert.equal(normalizeScene({ hidden: false }).hidden, undefined, 'only hidden: true is kept');

  // The void darkest, the flame's hi readable on it.
  const c = normalizeScene({
    colors: {
      flame: { hi: '#303030' },
      scenery: { void: '#ffffff', shadow: '#101010', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' },
    },
  });
  assert.ok(basics.luminance(c.colors.scenery.void) <= basics.luminance('#101010'));
  assert.ok(basics.contrast(c.colors.flame.hi, c.colors.scenery.void) >= 4.5);
  const light = normalizeScene({ colors: { flame: { hi: '#303030' } } }, { voidHex: '#9a9a9a' });
  assert.ok(basics.contrast(light.colors.flame.hi, '#9a9a9a') >= 4.5, 'on a light site void the hi turns dark enough');
  clean(light, { voidHex: '#9a9a9a' });

  // The camera: into the clearing; a target on top of it goes back to the fire.
  const cam = normalizeScene({
    camera: {
      pos: [0.02, 0.1, 0.02],
      target: [0.02, 0.25, 0.1],
      fov: 200,
      roll: -3,
      move: { kind: 'push', amount: 0.5, bars: 8 },
    },
  }).camera;
  assert.ok(
    Math.hypot(cam.pos[0] - 0.02, cam.pos[2] - 0.02) >= 0.9 - 1e-9 && cam.pos[1] >= 0.25,
    'out of the fire, above the ground',
  );
  assert.deepEqual([cam.fov, cam.roll], [80, -0.6]);
  assert.deepEqual(cam.move, { kind: 'push', amount: 0.5, bars: 8 });
  const behind = normalizeScene({ camera: { pos: [0, 1.2, -5] } }).camera.pos;
  assert.ok(Math.abs(Math.atan2(behind[0] - 0.02, behind[2] - 0.02)) <= 1.75 + 1e-9, 'never behind the ruins');

  // Versions: a missing v is the first; a newer one is read as far as it goes.
  assert.equal(normalizeScene({ name: 'Old' }).v, SCENE_VERSION);
  assert.equal(normalizeScene({ v: 99, name: 'Future', look: { name: 'ink' } }).look.name, 'ink');
});

test('every rule has its error, at its path', () => {
  const base = () => defaultScene('Rules');
  const cases = [
    [
      (s) => {
        s.colors.flame.mid = 'orange';
      },
      ['scene.colors.flame.mid'],
    ],
    [
      (s) => {
        s.colors.flame.hi = '#303030';
      },
      ['scene.colors.flame.hi'],
    ],
    [
      (s) => {
        s.colors.scenery = { ...DEFAULT_EFFECTS.colors, void: '#2c2a3a', shadow: '#000000' };
        s.colors.flame.hi = '#ffffff';
      },
      ['scene.colors.scenery.void'],
    ],
    [
      (s) => {
        s.colors.scenery = { ...DEFAULT_EFFECTS.colors };
        delete s.colors.scenery.bone;
      },
      ['scene.colors.scenery.bone'],
    ],
    [
      (s) => {
        s.colors.flame.light = 2;
      },
      ['scene.colors.flame.light'],
    ],
    [
      (s) => {
        s.look.name = 'disco';
      },
      ['scene.look.name'],
    ],
    [
      (s) => {
        s.look.params = { segments: 8 };
      },
      ['scene.look.params.segments'],
    ],
    [
      (s) => {
        s.look.name = 'kaleido';
        s.look.params = { segments: 7 };
      },
      ['scene.look.params.segments'],
    ],
    [
      (s) => {
        s.look.params = { sparkle: 1 };
      },
      ['scene.look.params.sparkle'],
    ],
    [
      (s) => {
        s.layers.strobe = 'on';
      },
      ['scene.layers.strobe'],
    ],
    [
      (s) => {
        s.layers.glow = true;
      },
      ['scene.layers.glow'],
    ],
    [
      (s) => {
        s.layers.paint = 'on';
        s.layers.wash = 'on';
      },
      ['scene.layers.wash'],
    ],
    [
      (s) => {
        s.details.glowSize = 99;
      },
      ['scene.details.glowSize'],
    ],
    [
      (s) => {
        s.details.grad = [0, 6];
      },
      ['scene.details.grad'],
    ],
    [
      (s) => {
        s.details.segments = 6;
      },
      ['scene.details.segments'],
    ],
    [
      (s) => {
        s.blends.glow = 'multiply';
      },
      ['scene.blends.glow'],
    ],
    [
      (s) => {
        s.blends.sparkle = 'add';
      },
      ['scene.blends.sparkle'],
    ],
    [
      (s) => {
        s.drops = { fx: { shatter: 'on', confetti: 'on' }, count: 4 };
      },
      ['scene.drops.count', 'scene.drops.fx.confetti'],
    ],
    [
      (s) => {
        s.place.scenery = 'moon';
      },
      ['scene.place.scenery'],
    ],
    [
      (s) => {
        s.place.weapon = 'lightsaber';
      },
      ['scene.place.weapon'],
    ],
    [
      (s) => {
        s.place.element = 'water';
      },
      ['scene.place.element'],
    ],
    [
      (s) => {
        s.camera.fov = 5;
      },
      ['scene.camera.fov'],
    ],
    [
      (s) => {
        s.camera.roll = 1;
      },
      ['scene.camera.roll'],
    ],
    [
      (s) => {
        s.camera.pos = [0, 1.2, -5];
      },
      ['scene.camera.pos'],
    ],
    [
      (s) => {
        s.camera.pos = [0.02, 0.5, 0.3];
      },
      ['scene.camera.pos'],
    ],
    [
      (s) => {
        s.camera.pos = [0, 1];
      },
      ['scene.camera.pos'],
    ],
    [
      (s) => {
        s.camera.target = [0, 9, 0];
      },
      ['scene.camera.target'],
    ],
    [
      (s) => {
        s.camera.target = [...s.camera.pos];
      },
      ['scene.camera.target'],
    ],
    [
      (s) => {
        s.camera.move = { kind: 'zoom', amount: 2, bars: 3 };
      },
      ['scene.camera.move.amount', 'scene.camera.move.bars', 'scene.camera.move.kind'],
    ],
    [
      (s) => {
        s.knights.count = 2;
      },
      ['scene.knights.helmets'],
    ],
    [
      (s) => {
        s.knights.helmets = ['tophat'];
      },
      ['scene.knights.helmets[0]'],
    ],
    [
      (s) => {
        s.knights.count = 5;
        s.knights.helmets = [null, null, null, null, null];
      },
      ['scene.knights.count'],
    ],
    [
      (s) => {
        s.knights.count = 1.5;
      },
      ['scene.knights.count', 'scene.knights.helmets'],
    ],
    [
      (s) => {
        s.knights.moves = [];
      },
      ['scene.knights.moves'],
    ],
    [
      (s) => {
        s.knights.moves = ['nod', 'moonwalk'];
      },
      ['scene.knights.moves[1]'],
    ],
    [
      (s) => {
        s.knights.finish = 'gold';
      },
      ['scene.knights.finish'],
    ],
    [
      (s) => {
        s.knights.seat = 'lounging';
      },
      ['scene.knights.seat'],
    ],
    [
      (s) => {
        s.knights.formation = 'blob';
      },
      ['scene.knights.formation'],
    ],
    [
      (s) => {
        s.knights.rim = 3;
      },
      ['scene.knights.rim'],
    ],
    [
      (s) => {
        s.knights.glow = 'bright';
      },
      ['scene.knights.glow'],
    ],
    [
      (s) => {
        delete s.knights.glow;
      },
      ['scene.knights.glow'],
    ],
    [
      (s) => {
        s.knights.style = 'gold-leaf';
      },
      ['scene.knights.style'],
    ],
    [
      (s) => {
        delete s.knights.style;
      },
      ['scene.knights.style'],
    ],
    [
      (s) => {
        s.render.palette = [6, 8];
      },
      ['scene.render.palette'],
    ],
    [
      (s) => {
        s.render.palette = [0, 12];
      },
      ['scene.render.palette'],
    ],
    [
      (s) => {
        s.render.palette = [0];
      },
      ['scene.render.palette'],
    ],
    [
      (s) => {
        s.render.palette = 'rainbow';
      },
      ['scene.render.palette'],
    ],
    [
      (s) => {
        s.render.pixelSize = 5;
      },
      ['scene.render.pixelSize'],
    ],
    [
      (s) => {
        s.render.xray = 'bones';
      },
      ['scene.render.xray'],
    ],
    [
      (s) => {
        s.render.shadows = 'yes';
      },
      ['scene.render.shadows'],
    ],
    [
      (s) => {
        s.fireflies.lit = 40;
      },
      ['scene.fireflies.lit'],
    ],
    [
      (s) => {
        s.fireflies.show = 'disco';
      },
      ['scene.fireflies.show'],
    ],
    [
      (s) => {
        s.fire.level = -2;
      },
      ['scene.fire.level'],
    ],
    [
      (s) => {
        s.fire.heat = 1;
      },
      ['scene.fire.heat'],
    ],
    [
      (s) => {
        s.music = 'loud';
      },
      ['scene.music'],
    ],
    [
      (s) => {
        s.id = 'Not An Id';
      },
      ['scene.id'],
    ],
    [
      (s) => {
        s.name = '   ';
      },
      ['scene.name'],
    ],
    [
      (s) => {
        s.name = 'x'.repeat(NAME_MAX + 1);
      },
      ['scene.name'],
    ],
    [
      (s) => {
        s.hidden = 'yes';
      },
      ['scene.hidden'],
    ],
    [
      (s) => {
        s.v = 2;
      },
      ['scene.v'],
    ],
    [
      (s) => {
        s.sparkle = true;
      },
      ['scene.sparkle'],
    ],
    [
      (s) => {
        s.place.constructor = 'x';
        s.fire.toString = 1;
      },
      ['scene.fire.toString', 'scene.place.constructor'],
    ],
    [
      (s) => {
        delete s.render;
      },
      ['scene.render'],
    ],
    [
      (s) => {
        delete s.fireflies.speed;
      },
      ['scene.fireflies.speed'],
    ],
  ];
  for (const [edit, want] of cases) {
    const s = base();
    edit(s);
    assert.deepEqual(paths(s), want.sort(), edit.toString());
    assert.deepEqual(paths(normalizeScene(s)), [], `normalizing fixes it: ${edit}`);
  }
  assert.deepEqual(paths('scene?'), ['scene']);
  // The messages say what to do.
  const [unreadable] = problems({
    ...base(),
    colors: { flame: { ...base().colors.flame, hi: '#303030' }, scenery: null },
  });
  assert.match(unreadable.message, /4\.5:1/);
  // A scene on the site's own scenery colors is checked against the site's void.
  const s = base();
  s.colors.flame.hi = '#8a8a8a';
  clean(s);
  assert.deepEqual(paths(s, { voidHex: '#5a5a5a' }), ['scene.colors.flame.hi']);
});

test('lists: ids unique, at most MAX_SCENES, paths like scenes[1].look.name', () => {
  const list = [defaultScene('One'), defaultScene('Two'), defaultScene('One')];
  list[1].look.name = 'disco';
  const out = [];
  validateScenes(list, (path, message) => out.push({ path, message }));
  assert.deepEqual(
    out.map((e) => e.path),
    ['scenes[1].look.name', 'scenes[2].id'],
  );
  assert.match(out[1].message, /“One”/);
  const many = Array.from({ length: MAX_SCENES + 1 }, (_, i) => defaultScene(`Scene ${i}`));
  const over = [];
  validateScenes(many, (path) => over.push(path));
  assert.deepEqual(over, ['scenes']);
  const notList = [];
  validateScenes({}, (path) => notList.push(path));
  assert.deepEqual(notList, ['scenes']);
});

test('files: a Painter file, a list or one bare scene; repeated ids made unique', () => {
  const a = defaultScene('Cathedral Kaleidoscope');
  a.look = { name: 'kaleido', amount: 1.2, params: { segments: 8 } };
  a.layers = { glow: 'on', grain: 'mix' };
  const b = defaultScene('Frozen Shrine ❄ 雪');
  b.place = { scenery: 'shrine', weapon: 'katana', element: 'ice' };
  const file = sceneFile([a, b]);
  assert.deepEqual(Object.keys(file), ['app', 'v', 'scenes']);
  assert.equal(file.app, SCENE_APP);
  assert.deepEqual(readSceneFile(file), { scenes: [a, b], errors: [] });
  assert.deepEqual(readSceneFile(JSON.stringify(file, null, 2)), { scenes: [a, b], errors: [] }, 'the file’s text');
  assert.deepEqual(readSceneFile([a]).scenes, [a], 'a list');
  assert.deepEqual(readSceneFile(JSON.stringify(b)).scenes, [b], 'one bare scene (copied from the admin)');

  const twice = readSceneFile([a, a, 'nope']);
  assert.deepEqual(
    twice.scenes.map((s) => s.id),
    ['cathedral-kaleidoscope', 'cathedral-kaleidoscope-2'],
  );
  assert.equal(twice.errors.length, 2);
  assert.deepEqual(readSceneFile('{not json').scenes, []);
  assert.equal(readSceneFile('{not json').errors.length, 1);
  assert.match(readSceneFile({ app: 'bonfire-live', setups: {}, scenes: [] }).errors[0], /bonfire-live/);
  assert.deepEqual(readSceneFile({ hello: 1 }), { scenes: [], errors: ['No scenes in it.'] });
  const newer = readSceneFile({
    app: SCENE_APP,
    v: SCENE_VERSION + 1,
    scenes: [{ ...a, v: SCENE_VERSION + 1, sparkle: 1 }],
  });
  assert.equal(newer.scenes.length, 1);
  assert.equal(newer.errors.length, 1);
  clean(newer.scenes[0]);
});

test('hashes: base64url of UTF-8 JSON, Unicode names round-trip', () => {
  for (const name of ['Plain', 'Été brûlant', '火の祭壇 🔥', 'Tab\there', '"quotes" & <tags>']) {
    const s = normalizeScene(defaultScene(name));
    const h = encodeSceneHash(s);
    assert.match(h, /^[A-Za-z0-9_-]+$/, 'safe in a URL');
    assert.deepEqual(decodeSceneHash(h), s);
    assert.deepEqual(decodeSceneHash(`#scene=${h}`), s, 'with the hash’s own prefix');
  }
  for (const bad of ['', '#', 'scene=', '!!!', 'abc', encodeSceneHash([1, 2]), encodeSceneHash('text'), null, 42])
    assert.equal(decodeSceneHash(bad), null, String(bad));
  const partial = decodeSceneHash(encodeSceneHash({ name: 'Just a Name', look: { name: 'ink' } }));
  assert.equal(partial.look.name, 'ink');
  clean(partial);
});

test('references, ids, summaries and swatches', () => {
  assert.equal(sceneRef('b', 'frozen-shrine'), 'b:frozen-shrine');
  assert.deepEqual(parseRef('m:forge-rave'), { source: 'm', id: 'forge-rave' });
  assert.deepEqual(parseRef('forge-rave'), { source: null, id: 'forge-rave' });
  for (const bad of ['x:forge', 'b:', 'b:Bad Id', 'm:a--b', 42, null, `b:${'a'.repeat(ID_MAX + 1)}`])
    assert.deepEqual(parseRef(bad), { source: null, id: '' }, String(bad));

  assert.equal(uniqueSceneId('Frozen Shrine'), 'frozen-shrine');
  assert.equal(uniqueSceneId('Frozen Shrine', new Set(['frozen-shrine', 'frozen-shrine-2'])), 'frozen-shrine-3');
  assert.equal(uniqueSceneId('🔥'), 'scene');
  const long = uniqueSceneId('word '.repeat(30), new Set([uniqueSceneId('word '.repeat(30))]));
  assert.ok(long.length <= ID_MAX && basics.ID_RE.test(long) && long.endsWith('-2'), long);

  const s = defaultScene('Cathedral Kaleidoscope');
  s.place.scenery = 'cathedral';
  s.look.name = 'kaleido';
  s.layers = { glow: 'on', grain: 'on', chroma: 'mix' };
  s.knights = { ...s.knights, count: 2, helmets: [null, 'armet'], dance: 'on' };
  assert.equal(sceneSummary(s), 'Cathedral Altar · Kaleido + Glow, Grain (1 in the mix) · 2 knights dancing · holds');
  s.knights.style = 'blackgold';
  assert.equal(
    sceneSummary(s),
    `Cathedral Altar · Kaleido + Glow, Grain (1 in the mix) · 2 knights dancing in ${STYLE_NAMES.blackgold} · holds`,
  );
  s.knights.style = 'mix';
  assert.match(sceneSummary(s), /2 knights dancing, styles in the mix · holds$/);
  // Not dancing: how they sit (the seat pose), or just seated when it's in the mix.
  s.knights = { ...s.knights, dance: 'off', seat: 'watchful', style: null };
  assert.match(sceneSummary(s), / · 2 knights on watch · /);
  s.knights.seat = 'resting';
  assert.match(sceneSummary(s), / · 2 knights resting · /);
  s.knights.seat = 'mix';
  assert.match(sceneSummary(s), / · 2 knights seated · /);
  // Their Edge Glow, unless it's in the mix (a new scene's): always, or none.
  s.knights.glow = 'on';
  assert.match(sceneSummary(s), / · 2 knights seated, edges aglow · /);
  s.knights.glow = 'off';
  assert.match(sceneSummary(s), / · 2 knights seated, no edge glow · /);
  s.knights = { ...s.knights, glow: 'mix', rim: 0 };
  assert.match(sceneSummary(s), / · 2 knights seated, no edge glow · /, 'in the mix at no strength: none');
  s.knights.rim = 0.5;
  s.music = 'base';
  s.knights = { ...s.knights, count: 0, helmets: [] };
  assert.match(sceneSummary(s), /no knights · opens the show$/);
  assert.equal(typeof sceneSummary('junk'), 'string', 'any value gets a summary');

  const f = s.colors.flame;
  assert.deepEqual(sceneSwatches(s), [f.lo, f.mid, f.hi, f.core, f.shade]);
  s.colors.scenery = { ...DEFAULT_EFFECTS.colors };
  assert.equal(sceneSwatches(s).length, 10);
  assert.ok(sceneSwatches(s).every((c) => basics.HEX_RE.test(c)));
});

test('the vocabularies are the engine’s own', () => {
  // Every layer's details (and the looks' own) have a PARAMS entry, the dice inside what may be pinned.
  for (const [layer, list] of Object.entries(LAYER_DETAILS)) {
    assert.ok(LAYERS[layer], layer);
    for (const k of list) {
      const p = PARAMS[k];
      assert.ok(p, `${layer}.${k} has a PARAMS entry`);
      assert.ok(DETAIL_KEYS.includes(k), `${k} can be pinned`);
      if (p.range && p.roll)
        assert.ok(p.roll[0] >= p.range[0] && p.roll[1] <= p.range[1], `${k}: the roll inside the range`);
      if (p.values && p.roll)
        assert.ok(
          p.roll.every((v) => p.values.includes(v)),
          `${k}: the rolled values allowed`,
        );
      assert.ok(p.label && p.hint?.length >= 20, `${k}: a label and a hint`);
    }
  }
  for (const [look, list] of Object.entries(LOOK_PARAMS)) {
    assert.ok(LOOKS[look], look);
    for (const k of list) assert.ok(PARAMS[k] && !DETAIL_KEYS.includes(k), `${look}.${k} is the look’s own`);
  }
  // Every pinnable detail round-trips at both ends of its range.
  for (const k of DETAIL_KEYS) {
    const p = PARAMS[k];
    const ends = p.range
      ? p.range
      : p.values
        ? [p.values[0], p.values.at(-1)]
        : p.bool
          ? [false, true]
          : [Array(p.slots).fill(0), Array(p.slots).fill(p.of - 1)];
    for (const v of ends) {
      const s = defaultScene();
      s.details[k] = v;
      clean(s);
      assert.deepEqual(normalizeScene(s).details[k], v, k);
    }
  }
  // Few-color palettes the render show rolls are valid scene palettes.
  for (const p of FEW_PALETTES) {
    const s = defaultScene();
    s.render.palette = p;
    clean(s);
  }
  for (const px of PIXEL_SIZES) {
    const s = defaultScene();
    s.render.pixelSize = px;
    clean(s);
  }
  // Every mode switch takes Off / In the mix / Always.
  for (const k of Object.keys(LAYERS))
    for (const m of ['off', 'mix', 'on']) {
      const s = defaultScene();
      s.layers[k] = m;
      clean(s);
    }
  const drops = defaultScene();
  drops.drops = { fx: Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, 'mix'])), count: 3 };
  clean(drops);
  const all = defaultScene();
  all.knights = { ...all.knights, count: 3, helmets: Object.keys(HELMET_NAMES), moves: Object.keys(KNIGHT_MOVES) };
  all.fireflies = { ...all.fireflies, moves: Object.keys(FLY_MOVES) };
  clean(all);
  for (const finish of ['mix', ...FINISH_KEYS]) {
    const s = defaultScene();
    s.knights.finish = finish;
    clean(s);
  }
  for (const glow of ['off', 'mix', 'on']) {
    const s = defaultScene();
    s.knights.glow = glow;
    clean(s);
    assert.equal(normalizeScene(s).knights.glow, glow);
  }
  {
    const s = defaultScene();
    delete s.knights.glow;
    assert.equal(normalizeScene(s).knights.glow, 'mix', 'a scene without one: in the mix');
  }
  for (const style of [null, 'mix', ...STYLE_KEYS]) {
    const s = defaultScene();
    s.knights.style = style;
    clean(s);
    assert.equal(normalizeScene(s).knights.style, style);
  }
  assert.deepEqual(KNIGHT_STYLE_KEYS, [...STYLE_KEYS, 'mix'], 'the knights’ styles are knightStyles.js’s');
  for (const show of Object.keys(FLY_SHOWS)) {
    const s = defaultScene();
    s.fireflies.show = show;
    clean(s);
  }
  for (const music of Object.keys(MUSIC)) {
    const s = defaultScene();
    s.music = music;
    clean(s);
  }
  // The camera's moves, the finishes, the seats, the pinnable details and the fireflies'
  // shows are the engine's; the clearing is the show's own.
  assert.deepEqual(Object.keys(CAMERA_MOVES), MOVE_KINDS);
  assert.deepEqual(FINISH_KEYS, Object.keys(FINISHES));
  assert.deepEqual(Object.keys(KNIGHT_SEATS), [...Object.keys(SEAT_POSES), 'mix']);
  assert.deepEqual(DETAIL_KEYS, [...new Set(Object.values(LAYER_DETAILS).flat())], 'exactly what looks.pin() keeps');
  const flyShow = readFileSync(new URL('../src/visualizer/fireflyShow.js', import.meta.url), 'utf8');
  for (const show of Object.keys(FLY_SHOWS).filter((k) => k !== 'off' && k !== 'mix'))
    assert.match(flyShow, new RegExp(`case '${show}'`), `fireflyShow.js plays ${show}`);
  const rng = seeded(7);
  for (let i = 0; i < 300; i++) {
    const pos = [rng() * 16 - 8, rng() * 8 - 1, rng() * 16 - 8];
    const kept = keepInClearing({ x: pos[0], y: pos[1], z: pos[2] });
    const inside = Math.hypot(kept.x - pos[0], kept.y - pos[1], kept.z - pos[2]) < 1e-9;
    const s = defaultScene();
    s.camera.pos = pos;
    s.camera.target = [0, 0.55, 0];
    if (Math.hypot(pos[0], pos[1] - 0.55, pos[2]) < 0.2) continue;
    assert.equal(
      !paths(s).includes('scene.camera.pos'),
      inside,
      `${pos}: valid exactly when the show keeps it where it is`,
    );
  }
  // Ranges are [min, max, step]; the target box holds the fire.
  for (const [k, [min, max, step]] of Object.entries(SCENE_RANGES)) assert.ok(min < max && step > 0, k);
  assert.ok(TARGET_BOX.y[0] <= 0.55 && TARGET_BOX.y[1] >= 0.55);
});

test('content.json’s scenes (when there are any) are valid', () => {
  const c = content();
  if (c.scenes === undefined) return;
  const out = [];
  validateScenes(c.scenes, (path, message) => out.push(`${path}: ${message}`), 'scenes', {
    voidHex: c.effects.colors.void,
  });
  assert.deepEqual(out, []);
  for (const s of c.scenes)
    assert.deepEqual(normalizeScene(s, { voidHex: c.effects.colors.void }), s, `${s.id} is stored normalized`);
});

test('the basics moved to ruleBasics.js are still exported by contentRules.js', () => {
  for (const k of ['HEX_RE', 'ID_RE', 'WEAPON_KEYS', 'contrast', 'luminance', 'slugify'])
    assert.equal(rules[k], basics[k], k);
  assert.equal(basics.slugify('  Frozen Shrine!  '), 'frozen-shrine');
  assert.equal(basics.slugify('Café Été'), 'cafe-ete');
  assert.ok(Math.abs(basics.contrast('#000000', '#ffffff') - 21) < 1e-9);
  assert.equal(basics.WEAPON_KEYS.length, 23);
});
