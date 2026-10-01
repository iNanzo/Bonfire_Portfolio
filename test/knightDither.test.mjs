// The knight's dither (armor.js, knightStyles.js, pixelPass.js): the pixel styles dither their
// band edges in the pass's own Bayer pattern, by the style's amount times the Dither setting
// (shared with the pass by reference, so the render menu and Bonfire Live's slider move him
// too, and Off turns it off); the pass still adds no noise of its own over his flat tones, and
// keeps its terminator off the dither's lone dots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createArmorShared, createArmorMaterial } from '../src/bonfire/armor.js';
import { DISSOLVE_CHUNK } from '../src/bonfire/dissolve.js';
import { createPixelPass } from '../src/bonfire/pixelPass.js';
import { STYLES, STYLE_KEYS, CEL_LOOKS } from '../src/bonfire/knightStyles.js';

const fireAt = () => new THREE.Vector3(0, 0.95, 0.28);

// The Bayer matrices' formula (dissolve.js wBayer2/4/8, the pass's bayer2/4/8), in JS.
const fract = (x) => x - Math.floor(x);
const b2 = (x, y) => fract(Math.floor(x) / 2 + Math.floor(y) ** 2 * 0.75);
const b4 = (x, y) => b2(0.5 * x, 0.5 * y) * 0.25 + b2(x, y);
const b8 = (x, y) => b4(0.5 * x, 0.5 * y) * 0.25 + b2(x, y);

/** The armor's fragment shader, as three.js would build it (its chunks stubbed). */
function armorFragment() {
  const mat = createArmorMaterial(createArmorShared({ fireAt: fireAt(), exposure: { value: 1 } }));
  const lines = (...l) => l.map((x) => `#include <${x}>`).join('\n');
  const shader = { uniforms: {}, vertexShader: lines('common', 'defaultnormal_vertex', 'begin_vertex', 'project_vertex'), fragmentShader: lines('common', 'color_fragment', 'lights_phong_fragment', 'opaque_fragment', 'dithering_fragment') };
  mat.onBeforeCompile(shader);
  return shader;
}

test('the Dither setting reaches the armor: the pass uniforms shared by reference', () => {
  const dither = { value: 0.08 }, ditherScale = { value: 4 };
  const armor = createArmorShared({ fireAt: fireAt(), exposure: { value: 1.45 }, dither, ditherScale });
  assert.equal(armor.uniforms.uDither, dither, 'the strength is the pass uniform itself');
  assert.equal(armor.uniforms.uDitherScale, ditherScale, '...and so is the matrix');
  dither.value = 0;
  assert.equal(armor.uniforms.uDither.value, 0, 'Off reaches him at once');
  // (Without the pass, as in the other tests: the site's own strength and the 4x4 matrix.)
  const alone = createArmorShared({ fireAt: fireAt(), exposure: { value: 1 } });
  assert.equal(alone.uniforms.uDither.value, 0.08);
  assert.equal(alone.uniforms.uDitherScale.value, 4);
  // ...and the shader takes them.
  const { uniforms } = armorFragment();
  for (const u of ['uDither', 'uDitherScale', 'uCelDither']) assert.ok(uniforms[u], `the shader takes ${u}`);
});

test("each style's amount: the pixel styles dither, the rest don't; the armor takes the style's", () => {
  for (const k of STYLE_KEYS) {
    const { dither, look } = STYLES[k];
    assert.ok(Number.isFinite(dither) && dither >= 0 && dither <= 1, `${k}: an amount 0..1 (${dither})`);
    if (CEL_LOOKS[look]) assert.ok(dither > 0, `${k}: a pixel style, dithered`);
    else assert.equal(dither, 0, `${k}: not a pixel style, no band-edge dither`);
  }
  // (Chiaroscuro's hard light: less than the others.)
  assert.ok(STYLES['pixel-chiaroscuro'].dither < STYLES['pixel-cel'].dither);
  const armor = createArmorShared({ fireAt: fireAt(), exposure: { value: 1 } });
  for (const k of STYLE_KEYS) {
    armor.setStyle(k);
    assert.equal(armor.uniforms.uCelDither.value, STYLES[k].dither, `${k}: uCelDither is its amount`);
  }
});

test('the band edges: an ordered Bayer dither on the pass grid, never the old checker seam', () => {
  const fs2 = armorFragment().fragmentShader;
  assert.doesNotMatch(fs2, /mod\(floor\(gl_FragCoord\.x\)/, 'no checker seam');
  assert.match(fs2, /wBayer8\(gl_FragCoord\.xy\)/);
  assert.match(fs2, /\(uDitherScale > 6\.0 \? wBayer8\(gl_FragCoord\.xy\) : wBayer4\(gl_FragCoord\.xy\)\) - 0\.5/, "the pass's pattern: 8x8 or 4x4");
  // The style's amount at the site's 0.08, twice it at most (Bonfire Live's slider goes to 0.4),
  // none at 0: then the bands are exactly the flat ones (no window, no offset at all).
  assert.match(fs2, /float dA = uCelDither \* clamp\(uDither \/ 0\.08, 0\.0, 2\.0\);/);
  assert.match(fs2, /if \(dA > 0\.0\) \{/);
  // A texel steps only toward its nearest edge, across it into the next band, never past that
  // band: the window is at most twice the band it steps into, and the threshold (less than
  // 0.5 from the middle) moves it under half the window.
  assert.match(fs2, /if \(up \? \(v >= e \|\| thr <= 0\.0\) : \(v < e \|\| thr >= 0\.0\)\) return 0\.0;/);
  assert.match(fs2, /min\(min\(a, 1\.0\) \* 2\.0 \* \(up \? wu : wd\), a \* reach \* vw\)/);
  let top = 0, bottom = 1;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { top = Math.max(top, b4(x, y), b8(x, y)); bottom = Math.min(bottom, b4(x, y), b8(x, y)); }
  assert.ok(2 * (top - 0.5) < 1 && 2 * (0.5 - bottom) <= 1, 'a texel lands in the band it steps into, never past it');
  // ...none from a band too thin on screen (it would break into dots), and a few texels at
  // most, fewer as he's drawn bigger (more of his bands dither there).
  assert.match(fs2, /smoothstep\(DITHER_MIN, DITHER_MIN \+ 1\.0, \(up \? wd : wu\) \/ vw\)/);
  const min = Number(fs2.match(/const float DITHER_MIN = ([\d.]+);/)?.[1]);
  const max = Number(fs2.match(/const float DITHER_MAX = ([\d.]+);/)?.[1]);
  assert.ok(min >= 2, `a band under ${min} texels gives up none (no speckle on a limb)`);
  assert.ok(max > 0 && max <= 5, `${max} texels at most at the style's full amount`);
  assert.match(fs2, /float celReach\(float px\) \{ return clamp\(DITHER_MAX \* DITHER_PX \/ max\(px, 1\.0\), 3\.4, DITHER_MAX\); \}/);
  assert.match(fs2, /float reach = celReach\(vPx\);/);
  // Only one side of an edge steps: the wider band's, and the lit bands always down into the
  // steel (so no lone lit texel: the pass's terminator would ring it).
  assert.match(fs2, /kv \+= celDither\(key, kw, e, wd, wu, e < 0\.7 && wd > wu, thr, dA, reach\);/);
  // (Its table of the key's edges is the bands' own thresholds, each with a band either side.)
  const edges = [...fs2.matchAll(/e = (-?[\d.]+), wd = [\d.]+, wu = [\d.]+;|e = (-?[\d.]+); wd = ([\d.]+); wu = ([\d.]+);/g)];
  assert.ok(edges.length >= 9, `the key's edges (${edges.length})`);
  for (const m of edges) {
    const e = m[1] ?? m[2];
    assert.ok(fs2.includes(`kv > ${e} ?`), `${e} is a band edge`);
    if (m[3]) assert.ok(Number(m[3]) > 0 && Number(m[4]) > 0, `the bands beside ${e}`);
  }
  // The lit bands, the far side's fill and turn, and a rounded plate's dark bands take it...
  assert.match(fs2, /b = kv > 0\.72 \? 4\.0 : kv > 0\.55 \? 3\.0 : kv > 0\.32 \? 2\.0 : fv > 0\.42 \? 2\.0 : \(fv > 0\.1 \|\| nv > -0\.3\) \? 1\.0 : 0\.0;/);
  assert.match(fs2, /if \(hard\) b = kv > 0\.76 \? 4\.0 : kv > 0\.38 \? 2\.0 : fv > 0\.45 \? 1\.0 : 0\.0;/);
  assert.match(fs2, /if \(curved > 0\.5 && kv <= 0\.32\) b = /);
  // ...the highlight, the lips and his own flash don't.
  assert.match(fs2, /\(key > \(hard \? 0\.6 : 0\.55\) && dot\(aN, aV\) < 0\.5\) \|\| spec > 0\.9 \|\| \(curved > 0\.5 && key > ROUND_HOT\)/);
  assert.match(fs2, /if \(role == 1 && key > \(look == 2 \? 0\.55 : 0\.68\)\) b = min\(5\.0, b \+ 1\.0\);/);
  assert.match(fs2, /if \(uLift > 0\.05\) b = max\(b, min\(nl > 0\.2 \? 5\.0 : 3\.0, b \+ floor\(uLift \* 2\.4 \+ 0\.2\)\)\);/);
});

test("the armor's Bayer matrices are the pass's own, texel for texel", () => {
  const pass = createPixelPass().materials.single.fragmentShader;
  for (const n of [2, 4, 8]) {
    const def = pass.match(new RegExp(`float bayer${n}\\(vec2 a\\) \\{[^}]*\\}`))?.[0];
    assert.ok(def, `the pass has bayer${n}`);
    assert.ok(DISSOLVE_CHUNK.replace(/wBayer/g, 'bayer').includes(def), `wBayer${n} is the pass's bayer${n}`);
  }
  // (The formula is a real Bayer matrix: each of 0..63 once in an 8x8 tile, the same at every
  // texel centre, which is what gl_FragCoord gives the armor and floor() the pass.)
  const seen = new Set();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    assert.equal(b8(x + 0.5, y + 0.5), b8(x, y));
    seen.add(Math.round(b8(x, y) * 64));
  }
  assert.equal(seen.size, 64);
});

test('the pass: still no dither of its own over his tones; no terminator round a lone lit dot', () => {
  const src = createPixelPass().materials.single.fragmentShader;
  assert.match(src, /if \(!celHere\) col \+= threshold \* ditherStrength;/);
  // (Only with the dither on: at 0 the terminator is exactly as it was.)
  assert.match(src, /if \(ditherStrength > 0\.0 && celLight\(uv \+ 2\.0 \* o, id\) != 1 && celLight\(uv \+ o \+ side, id\) != 1 && celLight\(uv \+ o - side, id\) != 1\) continue;/);
  assert.match(src, /if \(celLight\(uv - o, id\) != 0\) continue;/, 'and only where the dark goes on past it');
});

test("scene.js hands the armor the pass's dither uniforms", () => {
  const src = fs.readFileSync(new URL('../src/bonfire/scene.js', import.meta.url), 'utf8');
  const call = src.match(/createArmorShared\(\{[\s\S]*?\n {2}\}\);/)?.[0] ?? '';
  assert.match(call, /dither: pass\.uniforms\.ditherStrength/);
  assert.match(call, /ditherScale: pass\.uniforms\.ditherScale/);
  assert.match(call, /exposure: pass\.uniforms\.exposure/);
});
