import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createImpactFx, createSmokeMaterial } from '../src/bonfire/impact.js';
import { createLightningRing } from '../src/bonfire/lightningRing.js';
import { createIceRing, createCrystals } from '../src/bonfire/ice.js';
import { createChill } from '../src/bonfire/chill.js';
import { createDebris } from '../src/bonfire/debris.js';
import { createGroundMarks } from '../src/bonfire/marks.js';
import { createCurlField } from '../src/bonfire/curl.js';
import { pageLights } from '../src/visualizer/newt/elementRings.js';
import { createFireDuck } from '../src/visualizer/newt/fireDuck.js';
test('page factories step two seconds on flat ground with finite positions', () => {
  const material = new THREE.ShaderMaterial(),
    smokeMaterial = createSmokeMaterial(),
    field = createCurlField();
  const origin = () => new THREE.Vector3(0, 0, 0),
    reach = () => 7;
  const chill = createChill({ material: smokeMaterial, field, origin: origin(), count: 50 });
  chill.setGround(() => 0);
  const fire = createImpactFx({
    fireMaterial: material,
    smokeMaterial,
    field,
    origin: origin(),
    reach,
    lights: 0,
    flames: 100,
    haze: 50,
    smoke: 50,
    ash: 30,
    embers: 30,
    emitters: 16,
  });
  const lightning = createLightningRing({
    fxMaterial: material,
    field,
    origin: origin(),
    reach,
    source: () => ({ x: 0.2, y: 1.3, z: 0 }),
    lights: 0,
    emitters: 16,
    sparks: 50,
  });
  const ice = createIceRing({
    fxMaterial: material,
    field,
    origin: origin(),
    reach,
    chill,
    lights: 0,
    maxSites: 80,
    chips: 40,
    bins: 16,
  });
  const crystals = createCrystals({ fxMaterial: material, field, origin: origin(), chill });
  const debris = ['fire', 'ice', 'lightning'].map((kind) => createDebris({ kind, material, count: 30 }));
  for (const d of debris) {
    d.setGround(() => 0);
    d.throw(0, 0.08, 0, 10);
  }
  fire.burst();
  lightning.burst(1.3);
  ice.burst();
  crystals.setActive(true);
  crystals.burst(1);
  const objects = [
    fire.ring,
    fire.haze,
    fire.puff,
    fire.flecks,
    fire.embers,
    fire.wave,
    ...lightning.objects,
    ...ice.objects,
    ...crystals.objects,
    chill.points,
    ...debris.map((d) => d.points),
  ];
  for (let i = 0; i < 120; i++) {
    const dt = 1 / 60,
      t = (i + 1) * dt;
    fire.step(dt, t);
    lightning.step(dt, t);
    ice.step(dt);
    crystals.step(dt, t, 1);
    chill.step(dt, t);
    for (const d of debris) d.step(dt);
    for (const object of objects)
      object.traverse((o) => {
        for (const value of o.geometry?.attributes.position?.array ?? []) assert.ok(Number.isFinite(value));
        if (o.instanceMatrix) for (const value of o.instanceMatrix.array) assert.ok(Number.isFinite(value));
      });
  }
  assert.equal(fire.lights.length, 0);
  assert.equal(pageLights('white', lightning.lights).length, 0);
  assert.equal(pageLights('night', lightning.lights), lightning.lights);
  assert.equal(ice.lights.length, 0);
});
test('marks patch compiles on Lambert ground', { skip: typeof OffscreenCanvas === 'undefined' }, () => {
  const marks = createGroundMarks({ center: new THREE.Vector3() });
  const material = new THREE.MeshLambertMaterial();
  marks.patch(material);
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.tMarks, marks.uniforms.tMarks);
  assert.match(shader.vertexShader, /vMarkUv =/);
  assert.match(shader.fragmentShader, /vec4 markTint/);
  marks.dispose();
  material.dispose();
});
test('White substitutes ice before ring selection even for lightning equip', async () => {
  let selection;
  const duck = createFireDuck({
    page: 'white',
    onImpact: (_a, _b, _c, s) => {
      selection = s;
    },
  });
  await duck.equip('axe', 'ember', { element: 'lightning', instant: true });
  assert.equal(selection.element, 'ice');
});

test('White equip bursts ice while retaining lights and an unmarked transparent page', async () => {
  const { createElementRings } = await import('../src/visualizer/newt/elementRings.js');
  const { createResourceScope } = await import('../src/bonfire/resources.js');
  const previous = globalThis.document;
  // Canvas painting belongs to the browser spec; these textures only need a canvas handle.
  globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
  const scope = createResourceScope();
  try {
    const scene = new THREE.Scene();
    const frame = {
      depthTexture: new THREE.DepthTexture(1, 1),
      pass: { uniforms: { resolution: { value: new THREE.Vector2(320, 180) } } },
    };
    let page = 'white';
    const rings = createElementRings({ scene, frame, scope, page: () => page });
    const duck = createFireDuck({
      page: 'white',
      onImpact: (flame, _old, _instant, selection) => rings.impact(selection.element, flame),
    });
    const calls = [];
    for (const kind of ['fire', 'lightning', 'ice']) rings[kind].burst = () => calls.push(kind);
    const before = rings.marks.count;
    const done = duck.equip('axe', 'ember', { element: 'lightning' });
    // The envelope owns arrival/open/burn timing after W2a; wait for its impact.
    for (let i = 0; i < 600 && duck.forging; i++) duck.step(1 / 60);
    assert.equal(duck.forging, false, 'the letter applies its selection within ten seconds');
    await done;
    assert.equal(rings.element, 'ice');
    assert.deepEqual(calls, ['ice']);
    assert.ok(rings.marks.count > before);
    calls.length = 0;
    assert.equal(rings.ice.solid.layers.mask, 1);
    assert.equal(rings.crystals.solid.layers.mask, 1);
    assert.ok(scene.children.filter((o) => o.isPointLight).length > 0);
    assert.ok(scene.children.filter((o) => o.isPointLight).every((o) => o.intensity === 0));
    assert.equal(rings.surface.material.transparent, true);
    assert.match(rings.surface.material.fragmentShader, /if\(coverage<=0\.\) discard/);
    page = 'night';
    for (const kind of ['fire', 'lightning', 'ice']) {
      rings.setElement(kind, 'ember');
      rings.ring(0.5);
    }
    assert.deepEqual(calls, ['fire', 'lightning', 'ice']);
    rings.setElement('fire', 'ember');
    page = 'cream';
    calls.length = 0;
    rings.ring(0.5);
    assert.deepEqual(calls, ['ice']);
    assert.equal(calls.at(-1), 'ice');
    assert.equal(rings.element, 'ice');
    duck.dispose();
  } finally {
    scope.dispose();
    globalThis.document = previous;
  }
});

import { createElementRings } from '../src/visualizer/newt/elementRings.js';
import { createResourceScope } from '../src/bonfire/resources.js';
import { effects } from '../src/effects.js';
import { seeded } from './lib/fakeScene.mjs';

function ringScene(t, options = {}) {
  const previous = globalThis.document;
  const context = new Proxy(
    {},
    { get: (_target, key) => (key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) },
  );
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const scope = createResourceScope(),
    scene = new THREE.Scene();
  const frame = {
    depthTexture: new THREE.DepthTexture(1, 1),
    pass: { uniforms: { resolution: { value: new THREE.Vector2(320, 200) } } },
  };
  const state = { page: options.page ?? 'dusk' };
  const rings = createElementRings({ scene, frame, scope, ...options, page: () => state.page });
  t.after(() => {
    scope.dispose();
    globalThis.document = previous;
  });
  return { rings, scene, frame, state };
}

test('every element material follows a resized frame depth target', (t) => {
  const { rings, scene } = ringScene(t);
  const depth = new THREE.DepthTexture(320, 200);
  rings.setDepth(depth);
  const materials = new Set();
  scene.traverse((o) => {
    if (o.material?.uniforms?.tDepth) materials.add(o.material);
  });
  assert.ok(materials.size >= 3);
  for (const material of materials) assert.equal(material.uniforms.tDepth.value, depth);
});

test('ice retains its cool ramp even when the selection flame is ember', (t) => {
  const { rings } = ringScene(t);
  rings.setElement('ice', 'ember');
  let colors;
  t.mock.method(rings.marks, 'stamp', (_kind, _x, _z, _radius, ramp) => {
    colors = ramp;
  });
  rings.ring();
  assert.ok(colors[2].b > colors[2].r, 'ice marks retain the same cold ramp');
  for (const solid of [rings.ice.solid, rings.crystals.solid]) {
    const color = solid.material.uniforms.uHi.value;
    assert.ok(color.b > color.r && color.b > color.g, 'ice highlights stay blue');
  }
});

test('light-page construction retains lights for a later dark page and suppresses their intensity', (t) => {
  const { rings, scene, state } = ringScene(t, { page: 'white' });
  const lights = scene.children.filter((o) => o.isPointLight);
  assert.ok(lights.length > 0);
  rings.setElement('fire', 'ember');
  rings.ring();
  rings.step(0.1);
  assert.ok(lights.every((l) => l.intensity === 0));
  state.page = 'night';
  rings.setElement('fire', 'ember');
  rings.ring();
  rings.step(0.1);
  assert.ok(lights.some((l) => l.intensity > 0));
  state.page = 'cream';
  rings.step(0.02);
  assert.ok(lights.every((l) => l.intensity === 0));
});

test('phone impact particles use the configured impact and touch scales', (t) => {
  const previous = { ...effects.particles };
  Object.assign(effects.particles, { impact: 0.5, touchScale: 0.6 });
  t.after(() => Object.assign(effects.particles, previous));
  const { rings } = ringScene(t, { coarse: true });
  const count = (n) => Math.max(1, Math.round(n * effects.particles.impact * effects.particles.touchScale));
  assert.equal(rings.fire.ring.geometry.attributes.position.count, count(3200));
  assert.equal(rings.fire.haze.geometry.attributes.position.count, count(1500));
  assert.equal(rings.ice.sets[0].n, count(320));
  assert.equal(rings.lightning.sets[0].n, count(260));
  for (const debris of Object.values(rings.debris))
    assert.equal(debris.points.geometry.attributes.position.count, count(120));
});

test('moving the shared origin relocates subsequent fire particles without moving the marks box', (t) => {
  t.mock.method(Math, 'random', seeded(84));
  const { rings } = ringScene(t);
  const box = rings.marks.uniforms.uMarkBox.value.clone();
  rings.setOrigin(3, -2);
  rings.setElement('fire', 'ember');
  rings.ring();
  rings.step(0.05);
  const { position, size } = rings.fire.ring.geometry.attributes;
  let active = 0;
  for (let i = 0; i < size.count; i++)
    if (size.array[i] > 0) {
      active++;
      assert.ok(Math.abs(position.getX(i) - 3) < 1.5);
      assert.ok(Math.abs(position.getZ(i) + 2) < 1.5);
    }
  assert.ok(active > 0);
  assert.deepEqual(rings.marks.uniforms.uMarkBox.value, box);
});

test('a pending letter owns its one drop burst in the newly selected element', (t) => {
  const { rings } = ringScene(t);
  const calls = [];
  for (const kind of ['fire', 'lightning', 'ice']) t.mock.method(rings[kind], 'burst', () => calls.push(kind));
  rings.setElement('fire', 'ember');
  rings.drop('lightning', 'ember', true, 1);
  assert.deepEqual(calls, []);
  rings.impact('lightning', 'ember');
  assert.deepEqual(calls, ['lightning']);
  rings.drop('fire', 'ember', false, 1);
  assert.deepEqual(calls, ['lightning', 'fire']);
});

test('ice stays below the knees and close to a moved NEWT origin', (t) => {
  t.mock.method(Math, 'random', seeded(84));
  const { rings, scene } = ringScene(t);
  rings.setOrigin(3, -2);
  rings.setElement('ice', 'ember');
  rings.ring();
  for (let i = 0; i < 30; i++) rings.step(1 / 60);
  scene.updateMatrixWorld(true);
  for (const mesh of [rings.ice.solid, rings.crystals.solid]) {
    assert.ok(mesh.count > 0);
    const bounds = new THREE.Box3().setFromObject(mesh);
    assert.ok(bounds.max.y < 0.36, `crystal top ${bounds.max.y}`);
    assert.ok(
      bounds.min.x > 1.5 && bounds.max.x < 4.5,
      `${mesh === rings.ice.solid ? 'ring' : 'core'} ${JSON.stringify(bounds)}`,
    );
    assert.ok(bounds.min.z > -3.5 && bounds.max.z < -0.5);
  }
});

test('the crystal layout follows a moved shared origin after its first layout', (t) => {
  t.mock.method(Math, 'random', seeded(84));
  const { rings, scene } = ringScene(t);
  rings.setElement('ice', 'ember');
  rings.ring();
  for (let i = 0; i < 20; i++) rings.step(1 / 60);
  const fixed = Array.from(rings.crystals.solid.instanceMatrix.array);
  rings.step(0);
  assert.deepEqual(Array.from(rings.crystals.solid.instanceMatrix.array), fixed);
  rings.setOrigin(3, -2);
  rings.ring();
  for (let i = 0; i < 20; i++) rings.step(1 / 60);
  scene.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(rings.crystals.solid).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x - 3) < 0.2, `center x ${center.x}`);
  assert.ok(Math.abs(center.z + 2) < 0.2, `center z ${center.z}`);
});

test('ice adds cold quantizer slots while preserving paper, seal and NEWT tones', async () => {
  const { elementPalette, PAGES } = await import('../src/visualizer/newt/pages.js');
  for (const page of Object.values(PAGES)) {
    const ice = elementPalette(page, 'ice');
    assert.equal(ice.length, 16);
    for (const slot of [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15]) assert.equal(ice[slot], page.palette[slot]);
    for (const color of ice.slice(5, 8)) assert.ok((color & 255) > ((color >> 16) & 255), 'cold blue wins over red');
    if (!page.light) assert.deepEqual(elementPalette(page, 'fire'), page.palette);
    else assert.deepEqual(elementPalette(page, 'fire'), ice);
  }
});

test('phone cold mist shares the ring compression around a moved origin', (t) => {
  const { rings, scene } = ringScene(t, { coarse: true });
  rings.setOrigin(3, -2);
  rings.chill.emit(4, 0.1, -2, 0, 0, 0, 2, 0.8);
  rings.chill.step(0, 0);
  scene.updateMatrixWorld(true);
  const point = new THREE.Vector3()
    .fromBufferAttribute(rings.chill.points.geometry.attributes.position, 0)
    .applyMatrix4(rings.chill.points.matrixWorld);
  assert.equal(point.x, 3.5);
  assert.equal(point.z, -2);
});
