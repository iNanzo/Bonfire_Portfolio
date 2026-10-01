// The knights against the scenery (src/bonfire/colliders.js). The shapes are the pieces
// scenery.js builds (every piece in a knight's reach inside them, to 2 cm) and the model's
// own in the ruins (public/models/bonfire.glb, decoded: its pillar's bounds to 2 cm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SEATS, FIRE_AT, ringOf, slotPlaces, ringPlaces } from '../src/bonfire/knightPlaces.js';
import { buildScenery } from '../src/bonfire/scenery.js';
import { CULT, MOVE_REACH, REACH_BANDS, collidersOf, distanceTo, clearanceTo, roomAround, reachFits } from '../src/bonfire/colliders.js';
import { loadGlb } from './lib/glb.mjs';

const NAMES = Object.keys(SEATS);
const material = () => new THREE.MeshLambertMaterial();
const MAT = { stone: material(), pillar: material(), wood: material(), char: material(), wax: material(), mortar: material() };
/** Every place the show stands a dancer on in a scenery (slotPlaces and ringPlaces, 1–4, steps -3..3). */
function placesOf(name) {
  const ring = ringOf(name);
  const seen = new Map();
  for (const n of [1, 2, 3, 4]) for (const p of [...slotPlaces(ring, n), ...[-3, -2, -1, 0, 1, 2, 3].flatMap((st) => ringPlaces(ring, n, st))]) seen.set(p.bearing.toFixed(1), p);
  return [...seen.values()];
}
/** The least distance from a point to a scenery's shapes. */
const nearestShape = (cs, x, y, z) => cs.reduce((m, c) => Math.min(m, distanceTo(c, x, y, z)), Infinity);

// --- the shapes ---------------------------------------------------------------------------------
test('every piece scenery.js builds in a knight’s reach is inside its shapes (to 2 cm), the stones leaning as it draws them', () => {
  for (const name of NAMES.filter((n) => n !== 'ruins')) {
    const s = buildScenery(name, MAT, () => new THREE.MeshBasicMaterial());
    s.group.updateMatrixWorld(true);
    const cs = collidersOf(name);
    const seat = SEATS[name];
    const near = [{ x: seat.x, z: seat.z }, ...placesOf(name)];
    const v = new THREE.Vector3();
    let pieces = 0;
    s.group.traverse((m) => {
      if (!m.isMesh) return;
      const box = new THREE.Box3().setFromObject(m);
      // (Above his shins, within an arm's reach of his seat or a dancer's place; the seat itself
      // and anything lower is his to rest on.)
      if (box.max.y < 0.3) return;
      const reach = Math.min(...near.map((p) => Math.hypot(Math.max(box.min.x - p.x, 0, p.x - box.max.x), Math.max(box.min.z - p.z, 0, p.z - box.max.z))));
      if (reach > 1.2) return;
      pieces++;
      const pos = m.geometry.attributes.position;
      let worst = 0, at = null;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const d = nearestShape(cs, v.x, v.y, v.z);
        if (d > worst) { worst = d; at = v.toArray(); }
      }
      assert.ok(worst <= 0.02, `${name}: a ${m.geometry.type} reaches ${worst.toFixed(3)} m out of the shapes at (${at?.map((q) => q.toFixed(2))})`);
    });
    assert.ok(pieces > 8, `${name}: ${pieces} pieces in reach`);
  }
  // The cult's standing stones turn and tip by the seeded draws colliders.js has written down.
  const s = buildScenery('cult', MAT, () => new THREE.MeshBasicMaterial());
  const stones = [];
  s.group.traverse((m) => { if (m.isMesh && m.geometry.type === 'BoxGeometry' && m.geometry.parameters.depth === CULT.stones.depth && m.geometry.parameters.height > 1) stones.push(m.parent); });
  assert.equal(stones.length, 3);
  stones.forEach((g, i) => {
    assert.equal(g.rotation.y, CULT.stones.drawn[i][0], `stone ${'ABC'[i]} turns as drawn`);
    assert.equal(g.rotation.x, CULT.stones.drawn[i][1], `stone ${'ABC'[i]} tips as drawn`);
  });
});

test('the ruins’ shapes are the model’s own (bonfire.glb): the pillar’s bounds to 2 cm, every piece in reach inside them', async () => {
  const glb = await loadGlb(new URL('../public/models/bonfire.glb', import.meta.url));
  const cs = collidersOf('ruins');
  const pillar = cs.find((c) => c.name === 'pillar');
  // The broken shaft: Static_Pillar's points round its axis, above the plinth.
  const pts = glb.worldPoints('Static_Pillar');
  const shaft = pts.filter(([x, y, z]) => y > pillar.y0 - 0.005 && Math.hypot(x - pillar.x, z - pillar.z) < 0.3);
  assert.ok(shaft.length > 16, `the shaft's corners (${shaft.length})`);
  const lo = [0, 1, 2].map((k) => Math.min(...shaft.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...shaft.map((p) => p[k])));
  const r = Math.max(pillar.r0, pillar.r1);
  const want = { lo: [pillar.x - r, pillar.y0, pillar.z - r], hi: [pillar.x + r, pillar.y1, pillar.z + r] };
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(lo[k] - want.lo[k]) <= 0.02 && Math.abs(hi[k] - want.hi[k]) <= 0.02, `the shaft's ${'xyz'[k]} ${lo[k].toFixed(3)}..${hi[k].toFixed(3)} (its shape's ${want.lo[k].toFixed(3)}..${want.hi[k].toFixed(3)})`);
  }
  // Every piece of the model's pillar (plinth, shaft, fallen drum, wall) and its candles above
  // the rubble, within reach of his seat or a dancer, inside the shapes to 2 cm.
  const near = [{ x: SEATS.ruins.x, z: SEATS.ruins.z }, ...placesOf('ruins')];
  let checked = 0;
  for (const node of ['Static_Pillar', 'Static_Wax', 'CandleFlame_0', 'CandleFlame_1', 'CandleFlame_2']) {
    for (const [x, y, z] of glb.worldPoints(node)) {
      if (y < 0.2 || Math.min(...near.map((p) => Math.hypot(x - p.x, z - p.z))) > 1.2) continue;
      checked++;
      const d = nearestShape(cs, x, y, z);
      assert.ok(d <= 0.02, `${node}: (${[x, y, z].map((q) => q.toFixed(2))}) is ${d.toFixed(3)} m out of the shapes`);
    }
  }
  assert.ok(checked > 200, `${checked} points of the model checked`);
});

test('the room round a place: all of it in the open, less toward a piece, and a move fits only with its reach clear of it', () => {
  // Out on the open ground in front of the fire: nothing in reach.
  const open = roomAround('shrine', 0, 1.6, Math.PI);
  assert.ok(open.every((band) => band.every((r) => r >= 1.2 - 1e-9)), 'all the room there is');
  for (const move of Object.keys(MOVE_REACH)) assert.ok(reachFits(move, open), `${move} fits in the open`);
  // Beside the shrine's front lantern, facing the fire (it at his back and to his right):
  // less room behind him there than in front, at the light box's height.
  const [fx, fz] = [-1.9 + 0.62, 0.6 - 0.1];
  const yaw = Math.atan2(FIRE_AT.x - fx, FIRE_AT.z - fz);
  const room = roomAround('shrine', fx, fz, yaw);
  const band = REACH_BANDS.findIndex((y, i) => i && y > 1.0) - 1;
  assert.ok(room[band][2] < room[band][0], `behind him ${room[band][2].toFixed(2)} m, in front ${room[band][0].toFixed(2)} m`);
  assert.ok(!reachFits('spin', room), 'a spin’s arms all round don’t fit by the lantern');
  // The shapes' distances: inside a cylinder, its depth; out from a box, the distance.
  const pillar = collidersOf('ruins').find((c) => c.name === 'pillar');
  assert.ok(Math.abs(distanceTo(pillar, pillar.x, 1, pillar.z) + pillar.r0 - (pillar.r0 - pillar.r1) * ((1 - pillar.y0) / (pillar.y1 - pillar.y0))) < 1e-9);
  assert.ok(Math.abs(clearanceTo(pillar, pillar.x + 1, pillar.z) - (1 - pillar.r0)) < 0.01);
});
