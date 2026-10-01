// The knight's steel (steel.js, armor.js, pixelPass.js): the finishes' ramps stay clean under
// the pass's dither, the lit tones lean toward the fire's light, the armor hands its ramp and
// rim to the pass, the light he's lit by is floored and smoothed, and the pass draws his
// steel in its own ramp only with the scene's own full palette (the scenery's untouched).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FINISHES, FINISH_NAMES, FINISH_LOOK, finishOr, litRamp, celRamp, CEL_TONES, CEL_STEEL } from '../src/bonfire/steel.js';
import { createArmorShared, createArmorMaterial, FIRE_FLOOR } from '../src/bonfire/armor.js';
import { createPixelPass } from '../src/bonfire/pixelPass.js';
import { base } from '../src/palette.js';

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luma = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

test('each finish: five hex greys, dark to light, spaced past the dither (about ±10 sRGB steps)', () => {
  assert.deepEqual(Object.keys(FINISHES), ['gunmetal', 'blackened', 'polished', 'burnished']);
  const voidL = luma(base.void);
  for (const [name, ramp] of Object.entries(FINISHES)) {
    assert.equal(ramp.length, 5, name);
    for (const h of ramp) assert.match(h, /^#[0-9a-f]{6}$/, `${name} ${h}`);
    assert.ok(luma(ramp[0]) - voidL >= 19, `${name}: its darkest ${ramp[0]} clear of the void`);
    for (let i = 1; i < 5; i++) assert.ok(luma(ramp[i]) - luma(ramp[i - 1]) >= 19, `${name}: ${ramp[i - 1]} -> ${ramp[i]} far enough apart`);
    // Greys: no channel far from the others (burnished leans warm, a brown steel).
    for (const h of ramp) { const [r, g, b] = rgb(h); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= (name === 'burnished' ? 36 : 22), `${name} ${h} is a grey`); }
    assert.ok(FINISH_LOOK[name] && Number.isFinite(FINISH_LOOK[name].bias) && FINISH_LOOK[name].polish > 0, `${name} look`);
    assert.match(FINISH_NAMES[name], /^[A-Z][a-z]+( [A-Z][a-z]+)*$/, `${name}: a Title Case name`);
  }
  assert.equal(finishOr('polished'), 'polished');
  assert.equal(finishOr('gold'), 'gunmetal');
  assert.equal(finishOr(undefined), 'gunmetal');
});

test("the lit tones lean toward the fire's light, the shadowed ones not at all", () => {
  const g = FINISHES.gunmetal;
  assert.deepEqual(litRamp('gunmetal'), g);
  assert.deepEqual(litRamp('nope', 'bad'), g);
  const warm = litRamp('gunmetal', '#ff8040');
  assert.deepEqual(warm.slice(0, 2), g.slice(0, 2));
  const [r0, , b0] = rgb(g[4]);
  const [r1, , b1] = rgb(warm[4]);
  assert.ok(r1 > r0 && b1 < b0, 'the top tone warms by an ember fire');
  assert.ok(Math.abs(luma(warm[4]) - luma(g[4])) < 12, '...a lean, not a new color');
});

test('the armor hands its ramp and rim to the pass; finishes and rim change them', () => {
  const calls = [];
  const armor = createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 }, style: 'gunmetal', onSteel: (steel, rim) => calls.push([steel, rim]) });
  assert.equal(armor.finish, 'gunmetal');
  assert.equal(armor.rim, 0.5);
  assert.deepEqual(calls.at(-1), [FINISHES.gunmetal, 0.5], 'the finish at once, by no light yet');
  armor.setRamp(['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'], { shade: '#5b4535', mix: 0.3 });
  assert.notDeepEqual(calls.at(-1)[0], FINISHES.gunmetal, 'the lit tones lean toward the ember light');
  assert.equal(armor.uniforms.uShade.value.getHexString(), '5b4535');
  const n = calls.length;
  armor.setRamp(['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0']); // (shade and mix kept)
  assert.equal(calls.length, n, 'the same light: nothing to hand on');
  armor.setFinish('polished');
  assert.equal(armor.finish, 'polished');
  assert.equal(calls.at(-1)[0].length, 5);
  assert.equal(armor.uniforms.uPolish.value, FINISH_LOOK.polished.polish);
  assert.deepEqual(armor.steel, calls.at(-1)[0]);
  armor.setFinish('gilt');
  assert.equal(armor.finish, 'gunmetal', 'an unknown finish is gunmetal');
  armor.setRim(2);
  assert.equal(armor.rim, 1);
  assert.equal(calls.at(-1)[1], 1);
  armor.setRim(-1);
  assert.equal(armor.rim, 0);
  // (Linear uniforms: what the shader divides by the exposure and the pass multiplies back.)
  const c = new THREE.Color(armor.steel[2]);
  assert.ok(Math.abs(armor.uniforms.uSteel.value[2].r - c.r) < 1e-6);
});

test("the light he's lit by: a forge's dip is floored and eased, a stoke comes up at once", () => {
  const armor = createArmorShared({ fireAt: new THREE.Vector3(), exposure: { value: 1 }, reducedMotion: true });
  const u = armor.uniforms;
  const run = (fire, s) => { u.uFire.value = fire; for (let t = 0; t < s; t += 1 / 60) armor.step(1 / 60); return u.uFireLit.value; };
  run(1, 1);
  assert.ok(Math.abs(u.uFireLit.value - 1) < 0.01);
  const early = run(0.5, 0.1); // the forge's dip
  assert.ok(early > 0.93, `eases down (${early.toFixed(3)} after 0.1 s)`);
  const late = run(0.5, 4);
  assert.ok(Math.abs(late - FIRE_FLOOR) < 0.01, `never below the floor (${late.toFixed(3)})`);
  const up = run(1.5, 0.25);
  assert.ok(up > 1.4, `a stoke lights him at once (${up.toFixed(3)} after 0.25 s)`);
});

test("the pass draws his steel in its ramp only with the scene's own palette", () => {
  const pass = createPixelPass();
  const u = pass.uniforms;
  pass.setSteel(FINISHES.gunmetal, { rim: 0.7 });
  assert.equal(u.steelSize.value, 0, 'no palette yet: off');
  assert.equal(u.steelRim.value, 0.7);
  pass.setPalette(['#07070b', '#15131d', '#2c2a3a', '#5b4535', '#e9e3d2', '#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0', '#5b4535'], { steel: true });
  assert.equal(u.steelSize.value, 5, "the scene's palette: on");
  assert.equal(u.paletteSize.value, 10, 'the palette itself is untouched (no steel in it)');
  assert.ok(Math.abs(u.steel.value[0].x - rgb(FINISHES.gunmetal[0])[0] / 255) < 1e-4, 'sRGB, like the palette');
  pass.setPalette(['#07070b', '#e0582a', '#e9e3d2']);
  assert.equal(u.steelSize.value, 0, 'a few colors: off');
  pass.setSteel(FINISHES.polished);
  assert.equal(u.steelSize.value, 0, 'a new ramp keeps it off...');
  pass.setPalette(['#07070b', '#15131d', '#2c2a3a', '#5b4535', '#e9e3d2', '#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0', '#5b4535'], { steel: true });
  assert.equal(u.steelSize.value, 5, '...until the palette is the scene\'s again');
  // The shader: his steel only (marked below ARMOR_MARK), never in the x-ray; the rim uses
  // the flame's own slots, only with a full palette.
  const src = pass.materials.single.fragmentShader;
  assert.match(src, /steelHere \? quantizeSteel\(col\) : quantize\(col\)/);
  assert.match(src, /mark > STEEL_MARK && mark < ARMOR_MARK/);
  assert.match(src, /paletteSize >= 10/);
});

const EMBER = { ramp: ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'], shade: '#5b4535', light: '#e98b67' };
const AZURE = { ramp: ['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff'], shade: '#1d2b45', light: '#6da5e9' };
const sat = (h) => { const c = rgb(h); return Math.max(...c) - Math.min(...c); };

test("the pixel styles' tones: cool steel darks and mids, the flame's colors only where it lights", () => {
  assert.deepEqual(CEL_TONES, ['deep', 'shadow', 'mid', 'steel', 'body', 'highlight', 'terminator', 'ink']);
  for (const look of ['cel', 'painterly', 'chiaroscuro']) {
    for (const finish of Object.keys(FINISHES)) {
      const t = celRamp(look, finish, EMBER);
      assert.equal(t.length, CEL_TONES.length, `${look} ${finish}`);
      for (const h of t) assert.match(h, /^#[0-9a-f]{6}$/, `${look} ${h}`);
      // The six bands step up clearly (the pass snaps to them without a dither of its own; the
      // armor dithers their edges, a band's texels stepping into the next, knightDither.test.mjs).
      for (let i = 1; i < 6; i++) assert.ok(luma(t[i]) - luma(t[i - 1]) >= 12, `${look} ${finish}: ${t[i - 1]} -> ${t[i]} a clear step up`);
      assert.equal(new Set(t.slice(0, 6)).size, 6, `${look}: six different bands`);
      assert.ok(luma(t[5]) > 180, `${look}: the highlight near cream (${t[5]})`);
      assert.ok(luma(t[0]) < 30, `${look}: the deepest near black (${t[0]})`);
      assert.ok(luma(t[6]) < luma(t[4]), `${look}: the terminator darker than the lit band`);
      assert.ok(luma(t[7]) < 70, `${look}: the ink dark (${t[7]})`);
    }
    // Gunmetal stays in the darks and mids, as steel (no pink clay); the lit band and the
    // highlight wear the flame's color and recolor with it.
    const e = celRamp(look, 'gunmetal', EMBER), a = celRamp(look, 'gunmetal', AZURE);
    // (Leaning a touch toward the flame's tips, the light steel on the turn a little more;
    // painterly's hue-shifted toward its shade, still greys.)
    const most = (i) => (look === 'painterly' ? 40 : i === 3 ? 28 : 20);
    for (const i of [1, 2, 3]) assert.ok(sat(e[i]) <= most(i) && sat(a[i]) <= most(i), `${look}: tone ${i} is steel (${e[i]}, ${a[i]})`);
    for (const i of [4, 5, 6]) assert.notEqual(e[i], a[i], `${look}: tone ${i} follows the flame`);
    const [er, , eb] = rgb(e[4]), [ar, , ab] = rgb(a[4]);
    assert.ok(er > eb + 60, `${look}: an ember fire's lit band is warm (${e[4]})`);
    assert.ok(ab > ar + 60, `${look}: an azure one's is blue (${a[4]})`);
    assert.ok(sat(e[4]) > 90 && sat(a[4]) > 90, `${look}: ...and clearly the fire's color, not a tint`);
    assert.ok(rgb(e[6])[0] > rgb(e[6])[2] + 40 && sat(e[6]) > 60, `${look}: the terminator is the flame's dark, saturated shade (${e[6]})`);
  }
  // Painterly's shadows lean toward the flame's shade but stay as dark; chiaroscuro's darks
  // are deeper and its ink the void; painterly's ink is the lightest.
  const cel = celRamp('cel', 'gunmetal', EMBER), paint = celRamp('painterly', 'gunmetal', EMBER), chiar = celRamp('chiaroscuro', 'gunmetal', EMBER);
  assert.notEqual(paint[1], celRamp('painterly', 'gunmetal', AZURE)[1]);
  assert.ok(Math.abs(luma(paint[1]) - luma(cel[1])) < 6, 'painterly shadows as dark as cel');
  assert.ok(luma(chiar[0]) < luma(cel[0]));
  assert.equal(chiar[7], '#07070b');
  assert.ok(luma(paint[7]) > luma(cel[7]) && luma(cel[7]) > luma(chiar[7]));
  // A missing flame falls back to steel, never to bad hexes.
  for (const h of celRamp('cel', 'nope', {})) assert.match(h, /^#[0-9a-f]{6}$/);
});

test('the styles: the armor draws each and hands the pass its colors, rim, lines and terminator', () => {
  const calls = [];
  const armor = createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1 }, onSteel: (steel, rim, o) => calls.push([steel, rim, o]) });
  const u = armor.uniforms;
  armor.setRamp(EMBER.ramp, { shade: EMBER.shade, mix: 0.3 });
  for (const [name, look, n, lines, terminator] of [['pixel-cel', 1, 8, 1, 0], ['pixel-painterly', 2, 8, 1, 1], ['pixel-chiaroscuro', 3, 8, 1, 1], ['gunmetal', 0, 5, 0, 0], ['blackgold', 4, 0, 0, 0], ['first', 5, 0, 0, 0]]) {
    armor.setStyle(name);
    assert.equal(armor.style, name);
    assert.equal(u.uLook.value, look, `${name}: the shader's look`);
    const [steel, rim, o] = calls.at(-1);
    assert.equal(steel.length, n, `${name}: ${n} tones for the pass`);
    assert.deepEqual(o, { lines, terminator }, `${name}: its line art`);
    assert.equal(rim, look >= 4 ? 0 : armor.rim, `${name}: the fire rim ${look >= 4 ? 'off (round 8 had none)' : 'on'}`);
    if (n === 8) {
      assert.deepEqual(steel, armor.steel);
      const c = new THREE.Color(steel[4]);
      assert.ok(Math.abs(u.uCel.value[4].g - c.g) < 1e-6, `${name}: the shader's tones are the pass's`);
    }
  }
  armor.setStyle('nonsense');
  assert.equal(armor.style, 'pixel-cel', 'an unknown style is the default');
  // The pixel styles' tones follow the flame as it changes.
  const before = armor.steel;
  armor.setRamp(AZURE.ramp, { shade: AZURE.shade });
  assert.notDeepEqual(armor.steel, before);
  assert.deepEqual(calls.at(-1)[0], armor.steel);
});

test("the pass: the pixel styles' marks, line art, terminator and no dither over them", () => {
  const pass = createPixelPass();
  const u = pass.uniforms;
  pass.setPalette(['#07070b', '#15131d', '#2c2a3a', '#5b4535', '#e9e3d2', ...EMBER.ramp, EMBER.shade], { steel: true });
  pass.setSteel(celRamp('painterly', 'gunmetal', EMBER), { rim: 0.5, lines: 1, terminator: 1 });
  assert.equal(u.steelSize.value, 8, 'all eight tones');
  assert.equal(u.celLines.value, 1);
  assert.equal(u.celTerm.value, 1);
  pass.setSteel([], { rim: 0 });
  assert.equal(u.steelSize.value, 0, 'the black-and-gold styles: no ramp');
  assert.equal(u.celTerm.value, 1, '(the line art kept until handed new)');
  const src = pass.materials.single.fragmentShader;
  assert.match(src, /#define ARMOR_MARK 0\.9/);
  assert.match(src, /bool isCel\(float mark\)/);
  assert.match(src, /if \(!celHere\) col \+= threshold \* ditherStrength;/);
  assert.match(src, /else if \(nEdge > 0\.18 && !cel\)/, 'no facet creases over the pixel styles');
});

test("each finish is a clearly different plate: in the steel ramp and in the pixel styles' darks and mids", () => {
  const warmth = (h) => { const [r, , b] = rgb(h); return r - b; };
  const top = (n) => luma(FINISHES[n][4]);
  // The steel ramp (the Gunmetal style): blackened a good step darker, polished brighter,
  // burnished the warmest.
  assert.ok(top('blackened') < top('gunmetal') - 20, `blackened's top is darker (${FINISHES.blackened[4]})`);
  assert.ok(top('polished') > top('gunmetal') + 30, `polished's top is brighter (${FINISHES.polished[4]})`);
  for (const n of ['gunmetal', 'blackened', 'polished']) assert.ok(warmth(FINISHES.burnished[3]) > warmth(FINISHES[n][3]) + 12, `burnished is warmer than ${n}`);
  // The pixel styles: the shadow, mid and light steel bands (most of him) far apart between
  // any two finishes, by every flame; gunmetal's are its ramp's, as the judges chose them.
  assert.deepEqual(CEL_STEEL.gunmetal.slice(0, 2), FINISHES.gunmetal.slice(0, 2));
  const names = Object.keys(FINISHES);
  const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  for (const look of ['cel', 'painterly', 'chiaroscuro']) {
    for (const flame of [EMBER, AZURE]) {
      const t = Object.fromEntries(names.map((n) => [n, celRamp(look, n, flame)]));
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const a = t[names[i]], b = t[names[j]];
        const d = dist(a[1], b[1]) + dist(a[2], b[2]) + dist(a[3], b[3]);
        assert.ok(d >= 45, `${look}: ${names[i]} and ${names[j]} are different plates (${d.toFixed(0)}: ${a.slice(1, 4)} vs ${b.slice(1, 4)})`);
      }
      const mids = (n) => luma(t[n][2]) + luma(t[n][3]);
      assert.ok(mids('blackened') < mids('gunmetal') - 40 && mids('polished') > mids('gunmetal') + 40, `${look}: blackened darker, polished brighter`);
      // (The lit bands stay the flame's, whatever the finish.)
      for (const n of names) assert.ok(sat(t[n][4]) > 90, `${look} ${n}: the lit band is the fire's color`);
    }
  }
});

test("the pass: Edge Glow steps up clearly from 0 to 1; the line art skips slivers and specks", () => {
  const src = createPixelPass().materials.single.fragmentShader;
  // (Its levels: up to 0.35 the flame's dark on the fire's side, to 0.65 the default's subtle
  // rim, to 0.85 two texels and a backlit edge, above three and the outline in the flame's lo.)
  assert.match(src, /steelRim > 0\.85 \? 3 : steelRim > 0\.65 \? 2 : 1/);
  assert.match(src, /outlined && cel && steelSize > 6 && steelRim > 0\.85 && paletteSize >= 10 && fireRim && depthEdgeHere\(uv\)\) col = palette\[5\]/);
  assert.match(src, /for \(int w = 0; w < 3; w\+\+\)/);
  // Lines only where both surfaces are two texels thick across the edge and one of them more
  // (no ladder between two thin strips), and every stroke five texels long as it shows, or
  // running on to his outline (no short dashes in his lap).
  assert.match(src, /#define CEL_THICK 2/);
  assert.match(src, /if \(ta < CEL_THICK \|\| tb < CEL_THICK \|\| \(ta <= CEL_THICK && tb <= CEL_THICK\)\) continue;/);
  assert.match(src, /#define STROKE_MIN 5/);
  assert.match(src, /!outlined && celLine\(uv\) && longStroke\(uv, inkShows\(col\)\)\)/);
  assert.match(src, /if \(behindHim\(o, here\)\) return true;/, 'a stroke running on to his outline is kept, however short');
  assert.match(src, /if \(seen \|\| !celLine\(o\) \|\| \(shown && !inkShows\(toSRGB\(n4\.rgb \* exposure\)\)\)\) continue;/, 'measured as it shows');
});

test("the armor: rounded plates shaded across themselves, a flash in his own tones", () => {
  const shared = createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1 } });
  const mat = createArmorMaterial(shared);
  assert.equal(mat.userData.uniforms.uLift.value, 0, 'a flash in his own tones (uLift), off');
  const lines = (...l) => l.map((x) => `#include <${x}>`).join('\n');
  const shader = { uniforms: {}, vertexShader: lines('common', 'defaultnormal_vertex', 'begin_vertex', 'project_vertex'), fragmentShader: lines('common', 'color_fragment', 'lights_phong_fragment', 'opaque_fragment', 'dithering_fragment') };
  mat.onBeforeCompile(shader);
  const fs = shader.fragmentShader;
  assert.ok(shader.uniforms.uLift, 'the shader takes uLift');
  assert.match(shader.vertexShader, /attribute vec4 aPatch;/, "the patch's flatness rides in aPatch.w");
  // The rounded plates: not a ring round a limb, big enough on screen for bands; steeper light
  // about a pivot, darker where they mirror the sky; their flashes keep the curve.
  assert.match(fs, /float curved = smoothstep\(0\.2, 0\.35, vPatch\.w\) \* smoothstep\(5\.0, 8\.0, vPatch\.z \* vPx\);/);
  assert.match(fs, /pivot \+ ROUND_GAIN \* \(key - pivot\) - ROUND_SKY \* sky/);
  // The flash never turns him into a flat cut-out: every style lifts its own tones.
  assert.match(fs, /t \+= 2\.0 \* uLift;/);
  assert.match(fs, /if \(uLift > 0\.05\) b = max\(b, min\(nl > 0\.2 \? 5\.0 : 3\.0, b \+ floor\(uLift \* 2\.4 \+ 0\.2\)\)\);/);
  assert.match(fs, /if \(uLift > 0\.35\) tone = min\(2\.0, tone \+ 1\.0\);/);
});
