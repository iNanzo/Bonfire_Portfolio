// What the knights hand out every frame, made without garbage: knights.positions (the heads
// for the cameras, read by the director each frame) is one array of the same vectors, filled
// in place; the Knights settings the show compares each frame (knightShow.js knightSettings,
// through memoOn) are made again only when a setting they're made from changes, in place too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKnights } from '../src/bonfire/knights.js';
import { createArmorShared } from '../src/bonfire/armor.js';
import { BONES, BONE_NODES, PARENT, DEFAULT_REST } from '../src/bonfire/knightPose.js';
import { SEATS } from '../src/bonfire/scenery.js';
import { memoOn } from '../src/visualizer/knightShow.js';
import { showFor, play } from './lib/fakeScene.mjs';

/** The rig as plain groups with a box on every joint and three helmets (as knights.test.mjs has it). */
function standInModel() {
  const knight = new THREE.Group();
  knight.name = 'Knight';
  const nodes = {};
  const box = () =>
    new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      Object.assign(new THREE.MeshStandardMaterial(), { name: 'K_Plate' }),
    );
  for (const [bone, name] of Object.entries(BONE_NODES)) nodes[bone] = Object.assign(new THREE.Group(), { name });
  for (const [bone, g] of Object.entries(nodes)) {
    const par = PARENT[bone];
    const at = new THREE.Vector3(...DEFAULT_REST[bone]);
    if (par) at.sub(new THREE.Vector3(...DEFAULT_REST[par]));
    g.position.copy(at);
    (par ? nodes[par] : knight).add(g);
    g.add(box());
  }
  for (const h of ['Great', 'Armet', 'Bascinet'])
    nodes.head.add(Object.assign(new THREE.Group(), { name: `K_Helm_${h}` }).add(box()));
  return new THREE.Group().add(knight);
}
const armor = () => createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 } });
const flat = {
  height: () => 0.02,
  top: (x, z) => (Math.hypot(x - SEATS.ruins.x, z - SEATS.ruins.z) < 0.15 ? SEATS.ruins.top : 0.02),
};
/** Where knight k's head is (world), as positions used to build it: a new vector from his solved pose. */
const headOf = (k) =>
  k.solved.p[BONES.indexOf('head')]
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), k.yaw)
    .add(k.group.position);

test('positions: the present knights’ heads, one array of the same vectors, filled in place each read', () => {
  const kn = createKnights(standInModel(), { armor: armor(), max: 3 });
  kn.setScenery('ruins', flat);
  kn.setCast({ count: 3, instant: true });
  kn.dance(1, { move: 'jump', slot: 2, facing: 'fire' });
  for (let f = 0; f < 40; f++) {
    kn.clock(f / 30, 0.5);
    kn.update(1 / 60);
  }
  const a = kn.positions;
  assert.equal(a.length, 3);
  assert.equal(a[0].constructor, THREE.Vector3);
  kn.knights.forEach((k, i) => assert.ok(a[i].distanceTo(headOf(k)) < 1e-9, `knight ${i}'s head`));
  const vecs = [...a];
  const held = a.map((v) => v.clone());
  // (Read again with nothing stepped: the same array, the same vectors, the same values.)
  const b = kn.positions;
  assert.equal(b, a, 'the same array');
  b.forEach((v, i) => {
    assert.equal(v, vecs[i], 'the same vector');
    assert.ok(v.equals(held[i]));
  });
  // (Stepped on: the same vectors, each with his head where it is now.)
  for (let f = 40; f < 70; f++) {
    kn.clock(f / 30, 0.5);
    kn.update(1 / 60);
  }
  const c = kn.positions;
  assert.equal(c, a);
  kn.knights.forEach((k, i) => {
    assert.equal(c[i], vecs[i]);
    assert.ok(c[i].distanceTo(headOf(k)) < 1e-9);
  });
  assert.ok(!c[1].equals(held[1]), 'the dancer moved: his vector was updated in place');
  // (One sent away: the array shortens to the others, each still in his own vector.)
  kn.dismiss(1, { instant: true });
  const d = kn.positions;
  assert.equal(d.length, 2);
  assert.equal(d[0], vecs[0]);
  assert.equal(d[1], vecs[2], 'knight 2 keeps his vector');
  assert.ok(d[1].distanceTo(headOf(kn.knights[2])) < 1e-9);
  // (None there: empty.)
  kn.setCast({ count: 0, instant: true });
  assert.equal(kn.positions.length, 0);
});

test('memoOn: the same value while every input noted is the same; made again when one changes, in place too', () => {
  let made = 0;
  const s = { a: 1, list: ['x', 'y'], on: { p: true } };
  const get = memoOn(
    (note) => {
      note(s.a);
      note(s.list?.length);
      for (let i = 0; i < (s.list?.length ?? 0); i++) note(s.list[i]);
      note(s.on.p);
    },
    () => ({ n: ++made, a: s.a, list: (s.list ?? []).join(), p: s.on.p }),
  );
  const first = get();
  assert.deepEqual(first, { n: 1, a: 1, list: 'x,y', p: true });
  for (let i = 0; i < 5; i++) assert.equal(get(), first, 'nothing changed: the same object, nothing made');
  assert.equal(made, 1);
  s.a = 2;
  const second = get();
  assert.notEqual(second, first);
  assert.deepEqual(second, { n: 2, a: 2, list: 'x,y', p: true });
  assert.equal(get(), second);
  s.list[1] = 'z'; // (changed in place)
  assert.deepEqual(get(), { n: 3, a: 2, list: 'x,z', p: true });
  s.list.push('w'); // (one more input)
  assert.equal(get().list, 'x,z,w');
  s.list = null; // (fewer inputs)
  assert.equal(get().list, '');
  s.on.p = false; // (a member of an object, in place)
  assert.equal(get().p, false);
  s.list = []; // (null and empty notes differently, so it's made again: the same value)
  assert.deepEqual({ ...get(), n: 0 }, { n: 0, a: 2, list: '', p: false });
  const n = made;
  for (let i = 0; i < 5; i++) get();
  assert.equal(made, n, 'and then the same again');
  // (NaN is NaN: Object.is.)
  s.a = NaN;
  get();
  const m = made;
  get();
  assert.equal(made, m);
});

test('the show still acts on Knights settings changed in place (a helmet switched off, a place in the helmet order)', () => {
  const { show, kn, settings } = showFor(
    { knights: 'on', knightCount: 3, knightHelmetOrder: ['armet', 'armet', 'armet'] },
    { seed: 5 },
  );
  kn.moment = 'start';
  show.start(kn);
  play(show, kn, 2);
  assert.deepEqual(
    kn.list.slice(0, 3).map((e) => e.helmet),
    ['armet', 'armet', 'armet'],
  );
  settings.knightHelmetOrder[1] = 'bascinet';
  play(show, kn, 1);
  assert.equal(kn.list[1].helmet, 'bascinet', 'the order changed in place: acted on');
  settings.knightHelmetOrder = null;
  settings.knightHelmets.great = false;
  settings.knightHelmets.armet = false;
  play(show, kn, 1);
  assert.deepEqual(
    kn.list.slice(0, 3).map((e) => e.helmet),
    ['bascinet', 'bascinet', 'bascinet'],
    'the switches changed in place: acted on',
  );
});
