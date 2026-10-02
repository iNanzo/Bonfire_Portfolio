import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, HEX_RE } from '../../src/contentRules.js';
import {
  FLAME_KEYS,
  SCENE_KEYS,
  SCHEMES,
  flameSet,
  harmoniousFlame,
  harmoniousScene,
  hexToOklch,
  makeFlame,
  oklchToHex,
  slotFor,
  suggestFlames,
  suggestScenes,
  wildFlame,
  wildScene,
} from '../../src/paletteGen.js';

const VOID = '#07070b';
/** A repeatable random stream, so failures reproduce. */
const stream =
  (seed = 42) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
const L = (hex) => hexToOklch(hex).L;

test('OKLCH round-trips sRGB colors', () => {
  for (const hex of ['#e0582a', '#07070b', '#ffffff', '#2f7fe0', '#4fbf3a']) {
    const { L: l, C, h } = hexToOklch(hex);
    assert.equal(oklchToHex(l, C, h), hex);
  }
});

test('harmonious flames climb in lightness, keep text readable, and every scheme works', () => {
  const rng = stream();
  for (const s of [...SCHEMES.map((x) => x.id), 'auto']) {
    for (let i = 0; i < 25; i++) {
      const { colors } = harmoniousFlame(rng, { voidHex: VOID, scheme: s });
      for (const k of FLAME_KEYS) assert.match(colors[k], HEX_RE, `${s} ${k}`);
      assert.ok(
        L(colors.lo) < L(colors.mid) && L(colors.mid) < L(colors.hi) && L(colors.hi) < L(colors.core),
        `${s}: ${JSON.stringify(colors)}`,
      );
      assert.ok(contrast(colors.hi, VOID) >= 4.5, `${s} hi ${colors.hi}`);
    }
  }
});

test('the hue-shift recipe lands near the hand-tuned Ember flame', () => {
  const f = makeFlame({ hue: 45, scheme: 'shift', vivid: 1, shift: 30, voidHex: VOID });
  const ember = { lo: '#8c1d2f', mid: '#e0582a', hi: '#ffc76a', core: '#fff1d0' };
  for (const k of ['lo', 'mid', 'hi', 'core']) {
    const [a, b] = [hexToOklch(f[k]), hexToOklch(ember[k])];
    assert.ok(Math.abs(a.L - b.L) < 0.06, `${k} lightness ${f[k]} vs ${ember[k]}`);
    if (b.C > 0.05) assert.ok(Math.abs(((a.h - b.h + 540) % 360) - 180) < 20, `${k} hue ${f[k]} vs ${ember[k]}`);
  }
});

test('fully random flames are only fixed up where text would be unreadable', () => {
  const rng = stream(7);
  for (let i = 0; i < 50; i++) {
    const f = wildFlame(rng, { voidHex: VOID });
    for (const k of FLAME_KEYS) assert.match(f[k], HEX_RE);
    assert.ok(contrast(f.hi, VOID) >= 4.5);
  }
});

test('a flame set spreads its hues around the wheel', () => {
  const set = flameSet(10, stream(3), { voidHex: VOID });
  const hues = set.map((f) => hexToOklch(f.mid).h).sort((a, b) => a - b);
  const gaps = hues.map((h, i) => (i + 1 < hues.length ? hues[i + 1] : hues[0] + 360) - h);
  assert.ok(Math.max(...gaps) < 90, `largest hue gap ${Math.max(...gaps).toFixed(0)}°`);
});

test('suggestions keep the picked color exactly, in the step its lightness suits', () => {
  for (const [hex, slot] of [
    ['#e0582a', 'mid'],
    ['#3a1566', 'lo'],
    ['#ffe066', 'hi'],
    ['#fbfbf0', 'core'],
  ]) {
    assert.equal(slotFor(hex), slot, hex);
    const list = suggestFlames(hex, { voidHex: VOID });
    assert.ok(list.length >= 2, hex);
    for (const s of list) {
      assert.equal(s.colors[slot], hex, `${hex} ${s.scheme}`);
      assert.ok(
        L(s.colors.lo) < L(s.colors.mid) &&
          L(s.colors.mid) < L(s.colors.hi) &&
          L(s.colors.hi) <= L(s.colors.core) + 1e-9,
        `${hex} ${s.scheme} ${JSON.stringify(s.colors)}`,
      );
      assert.ok(contrast(s.colors.hi, VOID) >= 4.5);
    }
  }
  assert.deepEqual(suggestFlames('orange', { voidHex: VOID }), []);
});

test('scene palettes stay in lightness order and keep every flame readable', () => {
  const flames = [{ hi: '#ffc76a' }, { hi: '#8cc8ff' }, { hi: '#7874d9' }];
  const rng = stream(11);
  const all = [
    ...Array.from({ length: 20 }, () => harmoniousScene(rng, { flames })),
    ...Array.from({ length: 20 }, () => wildScene(rng, { flames })),
    ...suggestScenes('#2f7fe0', { flames }).map((s) => s.colors),
  ];
  for (const s of all) {
    for (const k of SCENE_KEYS) assert.match(s[k], HEX_RE);
    const ls = SCENE_KEYS.map((k) => L(s[k]));
    assert.deepEqual(
      [...ls].sort((a, b) => a - b),
      ls,
      JSON.stringify(s),
    );
    for (const f of flames) assert.ok(contrast(f.hi, s.void) >= 4.5, `${f.hi} on ${s.void}`);
  }
});
