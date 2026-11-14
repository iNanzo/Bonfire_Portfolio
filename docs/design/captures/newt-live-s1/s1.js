// S1, the pipeline spike (docs/design/invitation-live.md, Delivery plan › S1): NEWT, a letter
// and its petals, and the bonfire's fire, lightning and ice rings, drawn through the bonfire's
// own createFrame + createPixelPass on a page, as the NEWT world would draw them. Throwaway: it
// builds the minimum by hand (no director, no settings) and is driven frame by frame from
// shoot.mjs through window.__s1, so every capture is the same picture at the same moment.
//
// The letter is built from a copy of envelopeScene.js piece() and buildEnvelope() (not exported
// yet: task R2 exports them) and envelopeSeal.js buildSeal(), as it is today: sRGB tones and
// alpha 1.0, so the captures show what R2's look seam has to fix. NEWT is loadCharacter with
// pixel: false and his default toon. The rings are built as sceneModel.js builds them.
import * as THREE from 'three';
import { createFrame } from '../../../../src/bonfire/frame.js';
import { createParticleMaterial, createEffectMaterial, SHAPE } from '../../../../src/bonfire/flame.js';
import { createCurlField } from '../../../../src/bonfire/curl.js';
import { createChill } from '../../../../src/bonfire/chill.js';
import { createImpactFx, createSmokeMaterial } from '../../../../src/bonfire/impact.js';
import { createLightningRing } from '../../../../src/bonfire/lightningRing.js';
import { createIceRing } from '../../../../src/bonfire/ice.js';
import { loadCharacter } from '../../../../src/invitation/character.js';
import { buildSeal } from '../../../../src/invitation/envelopeSeal.js';
import { createPetalScene } from '../../../../src/invitation/petalScene.js';
import {
  DEPTH,
  IDS,
  LEAN,
  PAPER,
  PAPER_LIT,
  PETAL,
  TILT,
  PITCH,
  INK,
  envelopeLayout,
  shared,
  toon,
} from '../../../../src/invitation/envelopeLook.js';

const W = 320;
const H = 180;
const PD = 4;
const LAYERS = { solid: 0, fx: 1, ghost: 2 };

/** The pages: the paper, and the ink (palette[0]: the outline color) that reads on it. */
export const PAGES = {
  white: { page: 0xffffff, ink: INK, dark: false },
  cream: { page: 0xfdfaf4, ink: INK, dark: false },
  dusk: { page: 0x2d3447, ink: 0xe8dcc8, dark: true },
  night: { page: 0x14121a, ink: 0xe8dcc8, dark: true },
};
/** The fire ring's ramp (dark to light): wax to ember, the page palette's slots 5–8 by lightness. */
const RAMP = [0x5a0a12, 0x96151f, 0xd24b52, 0xffe7a0];

// ---- a copy of envelopeScene.js piece() and buildEnvelope() (see the header)
function piece(pts, mat, z) {
  const v = pts.map(([x, y]) => new THREE.Vector3(x, y, z));
  const tris = [];
  for (let i = 1; i < v.length - 1; i++) tris.push(v[0], v[i], v[i + 1]);
  return new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tris), mat);
}
function buildEnvelope(u) {
  const L = envelopeLayout();
  const { W: EW, H: EH, T } = L;
  const h = EH / 2;
  const group = new THREE.Group();
  const paper = (part) => toon(PAPER, u, IDS[part], { lean: LEAN[part], lit: PAPER_LIT });
  group.add(piece(L.parts.body, paper('body'), T / 2));
  group.add(piece(L.parts.inside, paper('inside'), T / 2 + DEPTH.inside));
  group.add(piece(L.parts.pocket, paper('pocket'), T / 2 + DEPTH.pocket));
  const hinge = new THREE.Group();
  hinge.position.set(0, h, T / 2 + 0.1);
  hinge.add(
    piece(
      L.parts.flap.map(([x, y]) => [x, y - h]),
      paper('flap'),
      0,
    ),
  );
  group.add(hinge);
  return { group, hinge, W: EW, H: EH, T, seal: L.seal };
}
// ----

const stage = document.querySelector('[data-stage]');
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
stage.append(renderer.domElement);
renderer.domElement.style.width = `${W * PD}px`;
renderer.domElement.style.height = `${H * PD}px`;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 40);
camera.position.set(0.25, 1.15, 4.6);
camera.lookAt(0.25, 0.62, 0);
const voidColor = new THREE.Color(PAGES.white.page);
const keep = (r) => r;
const frame = createFrame({
  renderer,
  scene,
  camera,
  layers: LAYERS,
  voidColor,
  effects: true,
  own: keep,
  track: keep,
});
const pass = frame.pass;
frame.setSize(W, H, PD);

// The light: a hemisphere and a directional with a shadow, over a Lambert page.
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 1.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-2.5, 5, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 15 });
sun.shadow.bias = -0.002;
scene.add(hemi, sun);
const pageMat = new THREE.MeshLambertMaterial({ color: PAGES.white.page });
const plane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), pageMat);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
// (Not in the normals pass, so the page's far edge draws no outline, and no fog: fog on this
// pass drew a band of the ink across dark pages, ?fog=on to see it. NEWT is outlined as on the void.)
const PAGE_ON_GHOST = new URLSearchParams(location.search).get('page') !== 'solid';
plane.layers.set(PAGE_ON_GHOST ? LAYERS.ghost : LAYERS.solid);
scene.add(plane);
if (new URLSearchParams(location.search).get('fog') === 'on') scene.fog = new THREE.Fog(voidColor, 7, 16);

// The effects, as sceneModel.js builds them.
const particleMaterial = createParticleMaterial(frame.depthTexture, pass.uniforms.resolution.value);
const effectMaterial = createEffectMaterial(particleMaterial);
const crossMaterial = createEffectMaterial(particleMaterial, { shape: SHAPE.cross });
const diamondMaterial = createEffectMaterial(particleMaterial, { shape: SHAPE.diamond });
const smokeMaterial = createSmokeMaterial();
const field = createCurlField();
const feet = new THREE.Vector3(0, 0, 0);
const reach = () => 2.6;
const chill = createChill({ material: createSmokeMaterial(), field, origin: new THREE.Vector3(0, 0.3, 0) });
const fx = createImpactFx({
  fireMaterial: effectMaterial,
  smokeMaterial,
  origin: feet.clone(),
  reach,
  field,
  lights: 0,
});
fx.ring.layers.set(LAYERS.fx);
fx.embers.layers.set(LAYERS.fx);
fx.wave.layers.set(LAYERS.fx);
for (const o of [fx.haze, fx.puff, fx.flecks]) o.layers.set(LAYERS.ghost);
scene.add(fx.ring, fx.embers, fx.wave, fx.haze, fx.puff, fx.flecks);
const zap = createLightningRing({
  fxMaterial: effectMaterial,
  sparkMaterial: crossMaterial,
  origin: feet.clone(),
  field,
  reach,
  lights: 0,
});
const ice = createIceRing({
  fxMaterial: effectMaterial,
  glintMaterial: diamondMaterial,
  origin: feet.clone(),
  field,
  reach,
  chill,
  lights: 0,
});
for (const o of [...zap.objects, ...ice.objects, ...(chill.objects ?? [chill.points].filter(Boolean))]) {
  o.layers.set(LAYERS.fx);
  scene.add(o);
}
ice.solid.layers.set(LAYERS.solid);
for (const s of [fx, zap, ice]) s.setRamp(RAMP);

// The letter, floating up and to his right, and its petals.
const u = shared();
const outer = new THREE.Group();
const inner = new THREE.Group();
inner.rotation.z = TILT;
inner.rotation.x = PITCH;
outer.add(inner);
outer.position.set(0.95, 1.15, 0.1);
outer.scale.setScalar(0.32);
scene.add(outer);
const envl = buildEnvelope(u);
inner.add(envl.group);
const seal = buildSeal(u, envl.seal.r);
seal.group.position.set(envl.seal.x, envl.seal.y - envl.H / 2, 0.01);
envl.hinge.add(seal.group);
const petals = createPetalScene({ scene, seed: 16, uniforms: u, id: IDS.petal, unit: 0.64 });

// NEWT.
let newt = null;
const ready = loadCharacter('/models/newt.glb', { pixel: false }).then((c) => {
  newt = c;
  scene.add(c.root);
  c.root.position.set(-0.15, 0, 0);
  c.root.rotation.y = 0.35;
  c.root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  c.setWeights({ Idle: 1 }, 0);
  c.update(0.6);
  return true;
});

let t = 0;
function paletteFor(name, newtTones) {
  const p = PAGES[name];
  return [p.ink, p.page, ...PAPER, 0x5a0a12, 0x96151f, 0xd24b52, PETAL[0], PETAL[2], ...newtTones].slice(0, 16);
}
let tones = [];

/** One fixed step of everything, then a draw. */
function step(dt) {
  t += dt;
  fx.step(dt, t);
  zap.step(dt, t);
  ice.step(dt, t);
  chill.step?.(dt, t);
  outer.updateMatrixWorld(true);
  petals.letter(envl.group.matrixWorld, { h: envl.H / envl.W, opening: 0, floating: true, time: t });
  petals.step(dt);
  if (newt) newt.update(dt);
  pass.uniforms.uTime.value = t;
  const c = new THREE.Vector3(0, 0.55, 0).project(camera);
  pass.uniforms.uCenter.value.set((c.x * 0.5 + 0.5) * W, (c.y * 0.5 + 0.5) * H);
  frame.draw({ shadows: true });
}

/**
 * Plain three.js render into a target, no pass: NEWT's own colors, for picking his palette
 * slots. With `withNewt` false he's hidden, so the caller can keep only the texels he changes.
 */
const rawRT = new THREE.WebGLRenderTarget(W, H);
rawRT.texture.colorSpace = THREE.SRGBColorSpace; // (so the read is sRGB, as setPalette takes)
function raw(withNewt = true) {
  const hide = [fx.ring, fx.embers, fx.wave, ...zap.objects, ...ice.objects, outer, ...(petals.meshes ?? [])];
  for (const o of hide) o.visible = false;
  if (newt) newt.root.visible = withNewt;
  camera.layers.enableAll();
  scene.updateMatrixWorld();
  renderer.setRenderTarget(rawRT);
  renderer.setClearColor(voidColor, 1);
  renderer.clear();
  renderer.render(scene, camera);
  const out = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rawRT, 0, 0, W, H, out);
  renderer.setRenderTarget(null);
  for (const o of hide) o.visible = true;
  if (newt) newt.root.visible = true;
  return Array.from(out);
}

window.__s1 = {
  ready,
  setPage(name) {
    const p = PAGES[name];
    voidColor.set(p.page);
    pageMat.color.set(p.page);
    hemi.groundColor.set(p.dark ? 0x101018 : 0xd8cfc0);
    hemi.intensity = p.dark ? 0.9 : 1.6;
    pass.setPalette(paletteFor(name, tones));
    pass.uniforms.uCore.value.set(RAMP[3]);
  },
  setTones(hexes) {
    tones = hexes;
  },
  /** Glitch-bag values straight onto the pass's uniforms (a look, held still). */
  setLook(values) {
    for (const [k, v] of Object.entries(values)) {
      const uu = pass.uniforms[k];
      if (!uu) throw new Error(`no uniform ${k}`);
      if (uu.value?.set && Array.isArray(v)) uu.value.set(...v);
      else uu.value = v;
    }
  },
  burst(kind) {
    if (kind === 'fire') fx.burst();
    if (kind === 'lightning') zap.burst(1.2);
    if (kind === 'ice') ice.burst();
  },
  emit(kind) {
    petals.emit(kind, { x: 0.95, y: 1.15, z: 0.1 });
  },
  advance(seconds, dt = 1 / 60) {
    for (let k = 0; k < Math.round(seconds / dt); k++) step(dt);
  },
  raw,
  size: { W, H, PD },
};
