// The weapons' choreography (src/bonfire/weapons.js) on a stand-in model: the living
// blade always comes home the right way up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/bonfire/weapons.js';

/** Two plain blades, modeled point-down like the real ones (the point just under the origin). */
function standInModel() {
  const root = new THREE.Group();
  for (const key of ['alpha', 'beta']) {
    const weapon = new THREE.Group();
    weapon.name = `Weapon_${key}`;
    weapon.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.02).translate(0, 0.56, 0), new THREE.MeshLambertMaterial()));
    root.add(weapon);
  }
  return root;
}

const camera = () => ({
  right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), toCam: new THREE.Vector3(0, 0, 1), pos: new THREE.Vector3(0, 1.2, 3.4),
});

test('a held swap: particles shed, gather and form, an aura while held, flung on the strike', () => {
  const fxMaterial = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } } });
  const impacts = [];
  const w = createWeapons(standInModel(), {
    anchor: new THREE.Vector3(0.04, 0, 0.03), layerSolid: 0, layerGhost: 2, layerFx: 1,
    particleMaterial: fxMaterial, field: { fire: () => ({ x: 0, y: 0, z: 0 }), noise: { noise3d: () => 0 } },
    particles: 200, castShadows: false, reducedMotion: false,
    hooks: { onImpact: (payload, key) => impacts.push(key) },
  });
  const sizes = w.forge.geometry.attributes.size.array;
  const shown = () => sizes.filter((s) => s > 0).length;
  const run = (seconds) => { for (let f = 0; f < seconds * 60; f++) { w.update(1 / 60); w.holder.updateMatrixWorld(true); } };
  w.set('alpha');
  w.holder.updateMatrixWorld(true);
  const ramp = ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'];
  w.swap('beta', ramp, ramp, {}, { hold: true });
  run(1);
  assert.ok(shown() > 50, `the dissolving edge sheds particles (${shown()})`);
  run(2.2);
  assert.ok(w.holding && w.busy, 'formed, and held');
  assert.equal(w.holder.children.find((o) => o.visible)?.userData.key, 'beta');
  run(0.5);
  assert.ok(w.forge.visible && shown() > 150, `the aura swirls round the held blade (${shown()})`);
  const at = new THREE.Vector3();
  w.forge.geometry.attributes.position.array.slice(0, 3).forEach((v, i) => at.setComponent(i, v));
  assert.ok(at.distanceTo(new THREE.Vector3(0.04, 1, 0.03)) < 1.2, 'close around the blade');
  assert.ok(w.release(3), 'it strikes');
  run(1);
  assert.equal(shown(), 0, 'the flung aura burns out');
  assert.deepEqual(impacts, ['beta']);
  run(2);
  assert.equal(w.busy, false, 'planted');
});

test('after a routine, the blade is planted exactly as before, however it was turned', () => {
  const w = createWeapons(standInModel(), {
    anchor: new THREE.Vector3(0.04, 0, 0.03), layerSolid: 0, layerGhost: 2, layerFx: 1,
    particleMaterial: null, field: {}, particles: 0, castShadows: false, reducedMotion: false, hooks: {},
  });
  const worldQuat = () => { w.holder.updateMatrixWorld(true); return w.holder.children.find((o) => o.visible).getWorldQuaternion(new THREE.Quaternion()); };
  const pointsDown = () => {
    const b = w.blade({ mid: new THREE.Vector3(), tip: new THREE.Vector3(), grip: new THREE.Vector3(), normal: new THREE.Vector3(), quat: new THREE.Quaternion() });
    return b.tip.y < b.grip.y && b.mid.y > 0.2;
  };
  for (let i = 0; i < 40; i++) {
    w.set(i % 2 ? 'alpha' : 'beta'); // a random turn about its own axis, either face shown
    w.holder.updateMatrixWorld(true);
    const planted = worldQuat();
    assert.ok(w.swing({ hits: [0.5, 0.97, 1.44], plunge: 1.9, basis: camera }), 'it swings');
    for (let f = 0; f < 60 * 4 && w.busy; f++) { w.update(1 / 60); w.holder.updateMatrixWorld(true); }
    assert.equal(w.busy, false, 'the routine and the settle end');
    // Hard beats make a planted blade shudder; it must shudder in place.
    for (let f = 0; f < 30; f++) { if (f % 10 === 0) w.beat(1); w.update(1 / 60); }
    w.holder.updateMatrixWorld(true);
    assert.ok(worldQuat().angleTo(planted) < 0.08, `run ${i}: back in the fire at the same angle (off by ${worldQuat().angleTo(planted).toFixed(2)} rad)`);
    assert.ok(pointsDown(), `run ${i}: point down in the ashes, not upside down`);
  }
});

test('a click skips ahead: a hurried swap lands sooner, and a rushed repeat plays quicker', () => {
  const fxMaterial = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } } });
  const make = () => {
    const impacts = [];
    const w = createWeapons(standInModel(), {
      anchor: new THREE.Vector3(0.04, 0, 0.03), layerSolid: 0, layerGhost: 2, layerFx: 1,
      particleMaterial: fxMaterial, field: { fire: () => ({ x: 0, y: 0, z: 0 }), noise: { noise3d: () => 0 } },
      particles: 50, castShadows: false, reducedMotion: false,
      hooks: { onImpact: (payload, key) => impacts.push({ key, at: w.t }) },
    });
    w.set('alpha');
    w.holder.updateMatrixWorld(true);
    w.t = 0;
    return { w, impacts };
  };
  const ramp = ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'];
  const run = (w, seconds) => { for (let f = 0; f < seconds * 60; f++) { w.update(1 / 60); w.t += 1 / 60; } };

  const plain = make();
  plain.w.swap('beta', ramp, ramp, {});
  run(plain.w, 6);
  const hurried = make();
  hurried.w.swap('beta', ramp, ramp, {});
  run(hurried.w, 0.5);
  assert.ok(hurried.w.hurry(), 'there was a swap to hurry');
  run(hurried.w, 6);
  assert.ok(hurried.impacts[0].at < plain.impacts[0].at - 1, `sooner (${hurried.impacts[0].at.toFixed(2)} s vs ${plain.impacts[0].at.toFixed(2)} s)`);

  const rushed = make();
  rushed.w.swap('beta', ramp, ramp, {});
  run(rushed.w, 0.5);
  rushed.w.swap('alpha', ramp, ramp, {}, { rush: true });
  run(rushed.w, 10);
  assert.deepEqual(rushed.impacts.map((i) => i.key), ['beta', 'alpha'], 'both land, in order');
  assert.ok(rushed.impacts[1].at < plain.impacts[0].at * 2, 'the pair takes less than two plain swaps');
  assert.equal(rushed.w.hurry(), false, 'nothing left to hurry');
});
