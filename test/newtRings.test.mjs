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

test('White equip selects the ice facade and attaches no lights or opaque page', async () => {
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
    const rings = createElementRings({ scene, frame, scope, page: () => 'white' });
    const duck = createFireDuck({
      page: 'white',
      onImpact: (flame, _old, _instant, selection) => rings.impact(selection.element, flame),
    });
    const done = duck.equip('axe', 'ember', { element: 'lightning' });
    duck.step(1.41);
    await done;
    assert.equal(rings.element, 'ice');
    assert.equal(rings.ice.solid.layers.mask, 1);
    assert.equal(rings.crystals.solid.layers.mask, 1);
    assert.equal(scene.children.filter((o) => o.isPointLight).length, 0);
    assert.equal(rings.surface.material.transparent, true);
    assert.match(rings.surface.material.fragmentShader, /if\(mark\.a<=0\.\) discard/);
    duck.dispose();
  } finally {
    scope.dispose();
    globalThis.document = previous;
  }
});
