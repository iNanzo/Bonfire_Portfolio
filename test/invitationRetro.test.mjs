// The invitation toy's retro pass on its white page (src/invitation/retro.js), with three.js in
// Node and a stand-in renderer: the floor's ShadowMaterial drawn through the pass's catcher
// (white, its shadow's coverage beside the floor's id) only into the colour target and put back
// after, never on the canvas; and the paper, the shadow (colour, strength, softness, dithered
// tones) and the lines (on his edge or just outside it) taken from the look preset; his
// textures sampled a coarser mip by the preset’s bias, and the decals (the blob, the marker)
// drawn as flat pixel shapes, both only in the colour target; his materials can be moved onto
// the texel grid together (a shift of under half a texel that puts one point of him on a
// texel's centre), so his head draws the same texels while it only drifts within one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ID,
  MAX_SOFT,
  catcherMaterial,
  createRetro,
  decalMaterial,
  markId,
  snapShift,
} from '../src/invitation/retro.js';

const LOOK = { pixelSize: '2', dither: true, outlines: true, style: 'ds' };
/** A whole preset as the pass reads it (the presets' own values are tested on their own). */
const PRESET = {
  label: 'Test',
  levels: 63,
  dither: 0.3,
  outline: { darken: 0.4, tint: '#ffffff', depth: 0.002 },
  grade: { lift: 0, gamma: 1, saturation: 1, tint: '#ffffff', exposure: 1 },
  toon: [0.5, 0.8, 1],
  background: 0xfdfbf7,
  shadow: { type: 'basic', mapSize: 1024, bias: 0, normalBias: 0, color: 0x8c8aa8, opacity: 0.5 },
  sun: { dir: [0, 1, 0], color: '#ffffff', intensity: 1 },
  hemi: { sky: '#ffffff', ground: '#ffffff', intensity: 1 },
  blob: { opacity: 0.1, lifted: 0.3 },
  marker: { color: '#000000' },
  animFps: 0,
};
/** A hex colour's sRGB components, as the post shader takes them. */
const srgbOf = (hex) => ({ r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 });
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** A stand-in renderer that notes each draw: where, and the floor's material at the time. */
function standIn(scene, floor) {
  const calls = [];
  let where = 'canvas';
  return {
    calls,
    renderer: {
      setRenderTarget: (t) => (where = t ? 'target' : 'canvas'),
      setClearColor: () => {},
      clear: () => {},
      render: (s) => calls.push(s === scene ? `${where}: ${floor.material.type}` : `${where}: post`),
    },
  };
}

test('the floor’s ShadowMaterial is drawn through the catcher into the colour target only, then put back', () => {
  const scene = new THREE.Scene();
  const own = new THREE.ShadowMaterial({ opacity: 0.4 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), own);
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 80);
  const { calls, renderer } = standIn(scene, floor);
  const retro = createRetro(renderer);
  retro.setSize(192, 416);
  retro.setParams(PRESET, LOOK);
  retro.render(scene, camera);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^target: ShadowMaterial$/);
  assert.equal(calls[1], 'canvas: post');
  assert.equal(floor.material, own, 'its own material back after the colour pass');
  calls.length = 0;
  retro.setParams(PRESET, { ...LOOK, pixelSize: 'off' });
  retro.render(scene, camera);
  assert.deepEqual(calls, ['canvas: ShadowMaterial'], 'Pixel Size Off: the scene as it is, to the canvas');
  assert.equal(floor.material, own);
  assert.doesNotThrow(() => retro.dispose());
});

test('the catcher writes white and the shadow’s coverage beside the floor’s id, unblended, depth kept', () => {
  const m = catcherMaterial();
  assert.equal(m.isShadowMaterial, true, 'three’s lights and shadow map, whatever their type');
  assert.equal(m.blending, THREE.NoBlending);
  assert.equal(m.transparent, false);
  assert.equal(m.depthWrite, true);
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: THREE.ShaderLib.shadow.fragmentShader };
  m.onBeforeCompile(shader, null);
  assert.doesNotMatch(shader.fragmentShader, /vec4\( color, opacity/, 'three’s own output is replaced');
  assert.match(
    shader.fragmentShader,
    new RegExp(
      `gl_FragColor = vec4\\( 1\\.0, 1\\.0, 1\\.0, \\( ${ID.floor}\\.0 \\+ [0-9.]+ \\* \\( 1\\.0 - getShadowMask\\(\\) \\) \\) / 16\\.0 \\);`,
    ),
  );
  assert.equal(m.customProgramCacheKey(), 'invitation-shadow-catcher');
});

test('the paper, the shadow and the lines come from the preset; Dithering off leaves the shadow’s tones', () => {
  const scene = new THREE.Scene();
  const { renderer } = standIn(scene, new THREE.Mesh());
  const retro = createRetro(renderer);
  const u = retro.uniforms;
  retro.setParams(PRESET, LOOK);
  const paper = srgbOf(PRESET.background);
  assert.ok(near(u.uPaper.value.r, paper.r) && near(u.uPaper.value.b, paper.b), 'the paper, in sRGB');
  const shade = srgbOf(PRESET.shadow.color);
  assert.ok(near(u.uShade.value.g, shade.g), 'the shadow’s colour, in sRGB');
  assert.equal(u.uShadeAmount.value, 0.5);
  assert.equal(u.uShadeSoft.value, 0, 'hard unless the preset softens it');
  assert.equal(u.uShadeSteps.value, 0, 'smooth unless the preset steps it');
  assert.equal(u.uOutside.value, 0, 'lines on his edge unless the preset puts them outside');
  const soft = {
    ...PRESET,
    background: 0xffffff,
    shadow: { ...PRESET.shadow, soft: 9, steps: 2.4, dither: 0.8 },
    outline: { ...PRESET.outline, outside: true },
  };
  retro.setParams(soft, LOOK);
  assert.equal(u.uShadeSoft.value, MAX_SOFT, 'softness capped at the shader’s reach');
  assert.equal(u.uShadeSteps.value, 2);
  assert.equal(u.uShadeDither.value, 0.8);
  assert.equal(u.uOutside.value, 1);
  assert.deepEqual([u.uPaper.value.r, u.uPaper.value.g, u.uPaper.value.b], [1, 1, 1], 'white stays exactly white');
  retro.setParams(soft, { ...LOOK, dither: false });
  assert.equal(u.uShadeDither.value, 0, 'Dithering off: undithered');
  assert.equal(u.uDither.value, 0);
  assert.equal(u.uShadeSteps.value, 2, '…but the shadow keeps its tones');
  retro.setParams(soft, { ...LOOK, outlines: false });
  assert.equal(u.uOutline.value, 0);
  retro.dispose();
});

/** A material's fragment shader as onBeforeCompile leaves it (`lib`: three's ShaderLib entry). */
function compiled(material, lib) {
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: THREE.ShaderLib[lib].fragmentShader };
  material.onBeforeCompile(shader, null);
  return shader;
}

test('his textures sample a coarser mip by the preset’s bias in the colour target, none at Off', () => {
  // (At a few hundred texels his shirt's pattern aliases into a grey patchwork: a coarser mip
  // flattens it, so the toon bands shade him, not the texture's noise.)
  const a = compiled(markId(new THREE.MeshToonMaterial(), ID.newt), 'toon');
  const b = compiled(markId(new THREE.MeshToonMaterial(), ID.newt), 'toon');
  assert.doesNotMatch(a.fragmentShader, /#include <map_fragment>/, 'three’s own map sampling is replaced');
  assert.match(a.fragmentShader, /texture2D\( map, vMapUv, uMapBias \)/);
  assert.match(a.fragmentShader, /uniform float uMapBias;/);
  assert.equal(a.uniforms.uMapBias, b.uniforms.uMapBias, 'one bias every marked material shares');
  const scene = new THREE.Scene();
  const { renderer } = standIn(scene, new THREE.Mesh());
  const retro = createRetro(renderer);
  retro.setParams({ ...PRESET, texture: { mipBias: 1.5 } }, LOOK);
  assert.equal(a.uniforms.uMapBias.value, 1.5);
  retro.setParams({ ...PRESET, texture: { mipBias: 1.5 } }, { ...LOOK, pixelSize: 'off' });
  assert.equal(a.uniforms.uMapBias.value, 0, 'Pixel Size Off: his textures as they are');
  retro.setParams(PRESET, LOOK);
  assert.equal(a.uniforms.uMapBias.value, 0, 'no bias unless the preset asks');
  retro.dispose();
});

test('decals: a flat pixel shape in the colour target (their map’s alpha cut, the material’s opacity), smooth at Off', () => {
  const map = new THREE.DataTexture(new Uint8Array(4).fill(255), 1, 1);
  const decal = decalMaterial({ map, opacity: 0.3 });
  const s = compiled(decal, 'basic');
  assert.match(s.fragmentShader, /uniform float uIdOn;\s*void main\(\) \{/);
  assert.match(
    s.fragmentShader,
    /#include <map_fragment>[\s\S]*if \( uIdOn > 0\.5 \) \{\s*if \( sampledDiffuseColor\.a < [0-9.]+ \) discard;\s*diffuseColor\.a = opacity;/,
    'in the colour target: inside the shape at the material’s opacity, nothing outside it',
  );
  assert.equal(decal.customProgramCacheKey(), 'invitation-decal');
  // The switch is the pass's own: on while it draws into the colour target, off straight to the canvas.
  const scene = new THREE.Scene();
  const { renderer } = standIn(scene, new THREE.Mesh());
  const retro = createRetro(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 80);
  retro.setSize(64, 64);
  retro.setParams(PRESET, LOOK);
  retro.render(scene, camera);
  assert.equal(s.uniforms.uIdOn.value, 1);
  retro.setParams(PRESET, { ...LOOK, pixelSize: 'off' });
  retro.render(scene, camera);
  assert.equal(s.uniforms.uIdOn.value, 0, 'Pixel Size Off: the blob’s soft falloff as it is');
  retro.dispose();
});

test('the texel snap: a shift of at most half a texel putting a point on its texel’s centre', () => {
  const w = 195;
  const h = 422;
  for (const [x, y] of [
    [0, 0],
    [0.1234, -0.5],
    [-0.99, 0.731],
    [0.5, 0.25],
  ]) {
    const s = snapShift(x, y, w, h);
    const px = ((x + s.x + 1) / 2) * w;
    const py = ((y + s.y + 1) / 2) * h;
    assert.ok(Math.abs(px - Math.floor(px) - 0.5) < 1e-6, `(${x}, ${y}): on a texel's centre across (${px})`);
    assert.ok(Math.abs(py - Math.floor(py) - 0.5) < 1e-6, `(${x}, ${y}): and down (${py})`);
    assert.ok(Math.abs(s.x) <= 1 / w + 1e-9 && Math.abs(s.y) <= 1 / h + 1e-9, 'half a texel at most');
  }
  const out = { x: 9, y: 9 };
  assert.equal(snapShift(0, 0, 0, 0, out), out, 'into the object given');
  assert.deepEqual(out, { x: 0, y: 0 }, 'no grid: no shift');
});

test('his materials move together by the snap uniform they share, in clip space, after three projects them', () => {
  const snap = { value: new THREE.Vector2(0.01, -0.02) };
  const vertex = (m) => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.toon.vertexShader,
      fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    };
    m.onBeforeCompile(shader, null);
    return shader;
  };
  const a = markId(new THREE.MeshToonMaterial(), ID.newt, { snap });
  const b = markId(new THREE.MeshToonMaterial(), ID.newt, { snap });
  const sa = vertex(a);
  const sb = vertex(b);
  assert.match(sa.vertexShader, /#include <project_vertex>\s*gl_Position\.xy \+= uTexelSnap \* gl_Position\.w;/);
  assert.match(sa.vertexShader, /uniform vec2 uTexelSnap;\s*void main\(\) \{/);
  assert.equal(sa.uniforms.uTexelSnap, snap, 'the uniform given');
  assert.equal(sa.uniforms.uTexelSnap, sb.uniforms.uTexelSnap, 'one shift for all of him');
  assert.match(sa.fragmentShader, /uSurfaceId/, 'still marking his surface id');
  assert.notEqual(a.customProgramCacheKey(), markId(new THREE.MeshToonMaterial(), ID.newt).customProgramCacheKey());
  // Without one, nothing moves.
  const plain = vertex(markId(new THREE.MeshToonMaterial(), ID.newt));
  assert.doesNotMatch(plain.vertexShader, /uTexelSnap/);
});
