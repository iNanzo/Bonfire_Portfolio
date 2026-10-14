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
  ALL,
  ID,
  MAX_SOFT,
  POST_SHADER,
  catcherMaterial,
  createRetro,
  decalMaterial,
  markId,
  snapShift,
  subjectBoxes,
} from '../src/invitation/retro.js';
import { LOOKS, lookPreset, validLook } from '../src/invitation/look.js';
import { warmthTint } from '../src/invitation/shader.js';

const LOOK = { pixelSize: '48', dither: true, outlines: true, style: 'ds' };
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

test('the Shader options reach the post shader: Colors, the dither, the lines’ strength, colour and ring, the shadow’s edge and strength, and the grade, all uniforms', () => {
  const scene = new THREE.Scene();
  const { renderer } = standIn(scene, new THREE.Mesh());
  const retro = createRetro(renderer);
  const u = retro.uniforms;
  const look = validLook({
    style: 'ds',
    shader: {
      levels: 8,
      dither: 0.9,
      outline: 0.3,
      ink: 'tinted',
      ring: true,
      edge: 'soft',
      shadow: 0.7,
      saturation: 1.5,
      warmth: 1,
      exposure: 1.2,
      contrast: 1.3,
    },
  });
  retro.setParams(lookPreset(look), look);
  assert.equal(u.uLevels.value, 8);
  assert.equal(u.uDither.value, 0.9);
  assert.equal(u.uDarken.value, 0.3);
  const tint = srgbOf(Number.parseInt(LOOKS.ds.outline.tint.slice(1), 16));
  assert.ok(near(u.uInk.value.r, tint.r) && near(u.uInk.value.b, tint.b), 'Tinted: the style’s ink');
  assert.equal(u.uOutside.value, 1, 'the ring outside him');
  assert.ok(u.uShadeSoft.value >= 1 && u.uShadeSteps.value >= 2, 'a soft, stepped shadow');
  assert.equal(u.uShadeAmount.value, 0.7);
  assert.equal(u.uSat.value, 1.5);
  assert.equal(u.uExposure.value, 1.2);
  assert.equal(u.uContrast.value, 1.3);
  const grade = srgbOf(Number.parseInt(LOOKS.ds.grade.tint.slice(1), 16));
  const [wr, wg, wb] = warmthTint(1);
  assert.ok(near(u.uTint.value.r, grade.r * wr), 'warm: the style’s tint, warmed');
  assert.ok(near(u.uTint.value.b, grade.b * wb) && u.uTint.value.b < u.uTint.value.g * (wg + 1e-6));
  // Dark lines: no tint, just darker.
  const dark = validLook({ style: 'soft', shader: { ink: 'dark' } });
  retro.setParams(lookPreset(dark), dark);
  assert.deepEqual([u.uInk.value.r, u.uInk.value.g, u.uInk.value.b], [1, 1, 1]);
  assert.equal(u.uContrast.value, 1, 'the style’s own contrast');
  // Full colours: every level an 8-bit channel has.
  const full = validLook({ style: 'ds', shader: { levels: 256 } });
  retro.setParams(lookPreset(full), full);
  assert.equal(u.uLevels.value, 256);
  retro.dispose();
});

test('Colors quantizes NEWT and the lines round him, never the paper or his shadow on the floor (at a few levels its lavender turned blue)', () => {
  const main = POST_SHADER.slice(POST_SHADER.indexOf('void main()'));
  assert.equal([...main.matchAll(/quantize\(/g)].length, 2, 'two places: his texels, and a line outside him');
  assert.match(main, /gl_FragColor = vec4\(quantize\(col, d \* uDither\), 1\.0\);\s*return;/, 'his texels');
  assert.match(main, /line = true;/, 'a line just outside him is marked as one');
  assert.match(
    main,
    /gl_FragColor = vec4\(line \? quantize\(col, dd\) : col, 1\.0\);/,
    'and only it is quantized there',
  );
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

test('the texel snap holds on to its texel while the point wobbles across an edge, and moves once it’s clearly in the next', () => {
  const w = 100;
  const h = 100;
  /** NDC for texel coordinate t on a 100-texel axis. */
  const ndc = (t) => (t / w) * 2 - 1;
  const hold = { x: Number.NaN, y: Number.NaN };
  const at = (t) => {
    const s = snapShift(ndc(t), ndc(t), w, h, { x: 0, y: 0 }, hold);
    return ((ndc(t) + s.x + 1) / 2) * w; // (where it's drawn, in texels)
  };
  const first = at(40.05);
  assert.ok(Math.abs(first - 40.5) < 1e-6, `first, its own texel's centre (${first})`);
  // His breathing: back and forth across the edge at 40, a fifth of a texel each way.
  for (const t of [39.85, 40.2, 39.8, 40.15, 39.9]) assert.ok(Math.abs(at(t) - 40.5) < 1e-6, `${t}: held at 40.5`);
  assert.ok(Math.abs(at(41.3) - 41.5) < 1e-6, 'a texel and more on: the next texel');
  assert.ok(Math.abs(at(40.8) - 41.5) < 1e-6, 'and held there on the way back');
  for (const t of [41.3, 39.0, 40.6]) {
    const s = snapShift(ndc(t), ndc(t), w, h, { x: 0, y: 0 }, hold);
    assert.ok(Math.abs(s.x) <= (2 / w) * 0.75 + 1e-9, `${t}: never more than three quarters of a texel off`);
  }
});

test('the pass bounds its costly texel work to where it can matter: the ring checks near NEWT, the soft shadow’s averaging where his shadow can fall, and the same picture everywhere else', () => {
  // (In the post shader: outside the ring box no texel has NEWT beside it, outside the shade box
  // no floor texel within MAX_SOFT has any of his shadow, so skipping the loops there is exact.)
  assert.match(POST_SHADER, /uniform vec4 uRingBox;/);
  assert.match(POST_SHADER, /uniform vec4 uShadeBox;/);
  assert.match(POST_SHADER, /if \(uShadeSoft < 0\.5 \|\| !inBox\(p, uShadeBox\)\) return own;/);
  assert.match(POST_SHADER, /uOutline > 0\.5 && uOutside > 0\.5 && inBox\(p, uRingBox\)/);
  // The boxes from a camera, his bounding sphere and the light: texels, y up (gl_FragCoord's).
  const camera = new THREE.PerspectiveCamera(20, 390 / 844, 1, 120);
  camera.position.set(0, 0.5 + 24 * Math.sin((36 * Math.PI) / 180), 24 * Math.cos((36 * Math.PI) / 180));
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld();
  const [w, h] = [390, 844];
  const center = new THREE.Vector3(0, 0.5, 0);
  const light = new THREE.Vector3(-0.6, 1, 0.9).normalize();
  const boxes = subjectBoxes({ center, radius: 0.8, light, camera, w, h });
  const texel = (p) => {
    const v = p.clone().project(camera);
    return [((v.x + 1) / 2) * w, ((v.y + 1) / 2) * h];
  };
  const inside = (b, [x, y]) => x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
  // Every point of his sphere is in the ring box, and every floor point under its shadow in the shade box.
  for (let i = 0; i < 200; i++) {
    const d = new THREE.Vector3(Math.sin(i * 1.3), Math.cos(i * 0.7), Math.sin(i * 2.1)).normalize();
    const p = center.clone().addScaledVector(d, 0.8);
    assert.ok(inside(boxes.ring, texel(p)), `his sphere at ${p.toArray()}`);
    const shade = p.clone().addScaledVector(light, -p.y / light.y);
    assert.ok(inside(boxes.shade, texel(shade)), `his shadow at ${shade.toArray()}`);
  }
  // With room for the line round him and the shadow's softened edge.
  const c = texel(center);
  assert.ok(boxes.ring[0] < c[0] - 2 && boxes.ring[2] > c[0] + 2);
  assert.ok(boxes.shade[2] - boxes.shade[0] > boxes.ring[2] - boxes.ring[0] - 1, 'his shadow reaches further');
  // A small share of the stage: most texels skip the loops.
  const area = (b) =>
    Math.max(0, Math.min(w, b[2]) - Math.max(0, b[0])) * Math.max(0, Math.min(h, b[3]) - Math.max(0, b[1]));
  assert.ok(area(boxes.ring) + area(boxes.shade) < 0.5 * w * h, 'well under the whole stage');
  // Behind the camera (or no camera): the whole target, as before.
  const behind = subjectBoxes({ center: new THREE.Vector3(0, 0.5, 40), radius: 0.8, light, camera, w, h });
  assert.deepEqual(behind.ring, [-1e9, -1e9, 1e9, 1e9]);
  assert.deepEqual(behind.shade, [-1e9, -1e9, 1e9, 1e9]);
  // The pass takes them as uniforms (none set: the whole target).
  const retro = createRetro({ setRenderTarget() {}, setClearColor() {}, clear() {}, render() {} });
  assert.deepEqual(retro.uniforms.uRingBox.value.toArray(), [-1e9, -1e9, 1e9, 1e9]);
  retro.setBoxes(boxes);
  assert.deepEqual(retro.uniforms.uRingBox.value.toArray(), boxes.ring);
  assert.deepEqual(retro.uniforms.uShadeBox.value.toArray(), boxes.shade);
  retro.setBoxes(null);
  assert.deepEqual(retro.uniforms.uShadeBox.value.toArray(), [-1e9, -1e9, 1e9, 1e9]);
});

test('outside the area round NEWT, his shadow and the decals, the canvas is the paper: the pass clears it to the paper and draws both its passes only inside that area (a scissor), the same picture for a fraction of the texels', () => {
  const camera = new THREE.PerspectiveCamera(20, 390 / 844, 1, 120);
  camera.position.set(0, 0.5 + 24 * Math.sin((36 * Math.PI) / 180), 24 * Math.cos((36 * Math.PI) / 180));
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld();
  const [w, h] = [390, 844];
  const light = new THREE.Vector3(-0.6, 1, 0.9).normalize();
  const marker = new THREE.Vector3(1.5, 0, 1.2);
  const b = subjectBoxes({ center: new THREE.Vector3(0, 0.5, 0), radius: 0.8, light, camera, w, h, extra: [marker] });
  const holds = (outer, inner) =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
  assert.ok(holds(b.area, b.ring) && holds(b.area, b.shade), 'the area holds both boxes');
  const m = marker.clone().project(camera);
  const mx = ((m.x + 1) / 2) * w;
  const my = ((m.y + 1) / 2) * h;
  assert.ok(b.area[0] <= mx && b.area[2] >= mx && b.area[1] <= my && b.area[3] >= my, 'and the decals');
  // (Room for the soft shadow's reads past the shade box.)
  assert.ok(b.area[0] <= b.shade[0] - MAX_SOFT && b.area[3] >= b.shade[3] + MAX_SOFT);
  const behind = subjectBoxes({
    center: new THREE.Vector3(0, 0.5, 0),
    radius: 0.8,
    light,
    camera,
    w,
    h,
    extra: [new THREE.Vector3(0, 0, 40)],
  });
  assert.deepEqual(behind.area, [...ALL], 'a decal behind the camera: the whole target');
  // The pass: the canvas cleared to the paper, then both passes only inside the area.
  const calls = [];
  const renderer = {
    setRenderTarget: (t) =>
      calls.push(t ? `target ${t.scissorTest ? t.scissor.toArray().join(',') : 'whole'}` : 'canvas'),
    setClearColor: (_c, a) => calls.push(`clear colour alpha ${a}`),
    clear: () => calls.push('clear'),
    render: (s) => calls.push(s.isScene && s.children.length === 1 ? 'post' : 'scene'),
    setScissor: (x, y, sw, sh) => calls.push(`scissor ${[x, y, sw, sh].join(',')}`),
    setScissorTest: (on) => calls.push(`scissor ${on ? 'on' : 'off'}`),
  };
  const retro = createRetro(renderer);
  retro.setSize(w, h);
  retro.setParams(PRESET, LOOK);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  retro.setBoxes(b);
  retro.render(scene, camera);
  const [x0, y0, x1, y1] = b.area.map((v, i) => Math.min(i % 2 ? h : w, Math.max(0, v)));
  const rect = [x0, y0, x1 - x0, y1 - y0].join(',');
  assert.deepEqual(calls, [
    `target ${rect}`,
    'clear colour alpha 0',
    'clear',
    'scene',
    'canvas',
    'scissor off',
    'clear colour alpha 1',
    'clear',
    `scissor ${rect}`,
    'scissor on',
    'post',
    'scissor off',
  ]);
  // No area (nothing to bound, or no NEWT yet): the whole target, as before.
  calls.length = 0;
  retro.setBoxes(null);
  retro.render(scene, camera);
  assert.deepEqual(calls, ['target whole', 'clear colour alpha 0', 'clear', 'scene', 'canvas', 'post']);
});
