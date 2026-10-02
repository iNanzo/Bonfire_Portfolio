// The site knight's comings and goings (src/bonfire/knightArrival.js) on a stand-in model:
// away at first with his sign lit; summoned, the sign burns into him through the forge
// (forgeRun.js) in each element's way; resting a rolled while; then he burns back into the
// sign. Reduced motion is at once; a new scenery finishes whatever was under way; the
// settings allow him or not, and 'start' keeps him. And the pieces it's made of: the
// monogram's strokes (ui/logo.js), the summon sign (summonSign.js), the forge on any subjects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKnights } from '../src/bonfire/knights.js';
import { createArmorShared } from '../src/bonfire/armor.js';
import { BONE_NODES, PARENT, DEFAULT_REST, GESTURE_TIME } from '../src/bonfire/knightPose.js';
import { SEATS } from '../src/bonfire/knightPlaces.js';
import { createSummonSign, SIGN_HEIGHT, SIGN_STROKE } from '../src/bonfire/summonSign.js';
import { createKnightArrival, ARRIVAL_TIMES, BUSY_HOLD } from '../src/bonfire/knightArrival.js';
import { createForgeRun, FORGE_TIMES } from '../src/bonfire/forgeRun.js';
import { createForgeParticles } from '../src/bonfire/forgeParticles.js';
import { LOGO_STROKES, LOGO_BOUNDS, logoBars, strokesOf } from '../src/ui/logo.js';

function standInModel() {
  const knight = new THREE.Group();
  knight.name = 'Knight';
  const nodes = {};
  for (const [bone, name] of Object.entries(BONE_NODES)) {
    const g = new THREE.Group();
    g.name = name;
    nodes[bone] = g;
  }
  const box = (mat) =>
    new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      Object.assign(new THREE.MeshStandardMaterial(), { name: mat }),
    );
  for (const [bone, g] of Object.entries(nodes)) {
    const par = PARENT[bone];
    const at = new THREE.Vector3(...DEFAULT_REST[bone]);
    if (par) at.sub(new THREE.Vector3(...DEFAULT_REST[par]));
    g.position.copy(at);
    (par ? nodes[par] : knight).add(g);
    const piece = box('K_Plate');
    piece.name = `${g.name}_Mesh`;
    g.add(piece);
  }
  for (const h of ['Great', 'Armet', 'Bascinet']) {
    const helm = new THREE.Group();
    helm.name = `K_Helm_${h}`;
    helm.add(box('K_Plate'));
    nodes.head.add(helm);
  }
  const root = new THREE.Group();
  root.add(knight);
  return root;
}
const fxMaterial = () =>
  new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } } });
const field = { fire: () => ({ x: 0, y: 0, z: 0 }), noise: { noise3d: () => 0 } };
const ground = (name) => ({
  height: () => 0,
  top: (x, z) => (Math.hypot(x - SEATS[name].x, z - SEATS[name].z) < 0.15 ? SEATS[name].top : 0),
});
const RAMP = ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'];

function make({ reducedMotion = false, rest = [2, 3], busy = null } = {}) {
  const knights = createKnights(standInModel(), {
    armor: createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 } }),
    max: 1,
    reducedMotion,
  });
  knights.setScenery('ruins', ground('ruins'));
  const mat = fxMaterial();
  const sign = createSummonSign({ layer: 2, layerFx: 1, moteMaterial: mat, exposure: { value: 1.45 }, reducedMotion });
  sign.setRamp(RAMP);
  let element = 'fire';
  const events = [];
  const hooks = { formed: [], strikes: 0 };
  const arrival = createKnightArrival({
    knights,
    sign,
    particleMaterial: mat,
    layerFx: 1,
    field,
    anchor: new THREE.Vector3(0.04, 0, 0.03),
    count: 200,
    reducedMotion,
    now: () => ({ element, ramp: RAMP }),
    rest: () => rest,
    // (As sceneKnight.js has it: he's busy mid-gesture, mid-swap.)
    busy: busy ?? (() => knights.busyAt(0)),
    hooks: { onFormed: (which) => hooks.formed.push(which), onForgeStrike: () => hooks.strikes++ },
  });
  arrival.onPresence((p) => events.push(p));
  arrival.setScenery({ ...SEATS.ruins.sign, y: 0 });
  const run = (s) => {
    for (let t = 0; t < s; t += 1 / 60) {
      knights.update(1 / 60);
      arrival.update(1 / 60);
    }
  };
  return {
    knights,
    sign,
    arrival,
    events,
    hooks,
    run,
    setElement: (e) => {
      element = e;
    },
  };
}
const total = Object.values(ARRIVAL_TIMES).reduce((a, b) => a + b, 0);

test('the monogram’s strokes come from the header mark’s own path, and make bars of any size', () => {
  assert.equal(LOGO_STROKES.length, 6, 'six strokes: the N’s three, the H’s two stems, the long crossbar');
  assert.deepEqual(LOGO_STROKES[1], [-15, 27, -4.5, 68], 'the N’s diagonal');
  assert.deepEqual(LOGO_STROKES[5], [-27.5, 47, 27.5, 47], 'the crossbar');
  assert.deepEqual(LOGO_BOUNDS, [-27.5, 2, 27.5, 78]);
  assert.deepEqual(strokesOf('M0 0H10V5L2 3'), [
    [0, 0, 10, 0],
    [10, 0, 10, 5],
    [10, 5, 2, 3],
  ]);
  const bars = logoBars(0.76, 0.03);
  assert.equal(bars.length, 6);
  const tall = bars[2];
  assert.ok(
    Math.abs(tall.len - 0.66) < 1e-9 && Math.abs(Math.abs(tall.angle) - Math.PI / 2) < 1e-9,
    'the N’s inner stem, upright',
  );
  assert.ok(Math.abs(bars[5].len - 0.55) < 1e-9 && bars[5].angle === 0, 'the crossbar, level');
  for (const b of bars) assert.ok(Math.abs(b.u) <= 0.28 && Math.abs(b.v) <= 0.38 && b.width === 0.03);
});

test('the summon sign: flat on the ground in front of his seat, lit while he’s away, hit by a ray, a forge subject', () => {
  const sign = createSummonSign({
    layer: 2,
    layerSolid: 0,
    layerFx: 1,
    moteMaterial: fxMaterial(),
    exposure: { value: 1.45 },
  });
  assert.ok(SIGN_STROKE >= 0.03 && SIGN_HEIGHT >= 0.45, 'bars at least 3 cm wide, the glyph at least 0.45 m tall');
  assert.equal(sign.group.visible, false, 'nothing until it’s lit');
  sign.place({ x: -1, y: 0.02, z: -0.5, yaw: Math.PI });
  sign.mode = 'lit';
  assert.ok(sign.group.visible);
  // Lit, on the solid layer (the stones under it don't outline through it); in the forge, the ghost layer.
  sign.group.traverse((o) => {
    if (o.isMesh) assert.equal(o.layers.mask, 1 << 0, 'lit: on the solid layer');
  });
  sign.mode = 'forge';
  sign.group.traverse((o) => {
    if (o.isMesh) assert.equal(o.layers.mask, 1 << 2, 'forging: on the ghost layer');
  });
  sign.mode = 'lit';
  // A ray from above onto its middle hits it; one a metre off doesn't.
  const down = new THREE.Vector3(0, -1, 0);
  assert.ok(sign.hit(new THREE.Ray(new THREE.Vector3(-1, 3, -0.5), down)) > 0);
  assert.equal(sign.hit(new THREE.Ray(new THREE.Vector3(0, 3, -0.5), down)), -1);
  // The breath rolls up the letters now and then; hovered, it brightens and every mote rises.
  let breathed = false;
  for (let f = 0; f < 60 * 7; f++) {
    sign.update(1 / 60);
    if (sign.uniforms.uBreath.value >= 0) breathed = true;
  }
  assert.ok(breathed, 'it breathes');
  const motes = () => sign.motes.geometry.attributes.size.array.filter((s) => s > 0).length;
  const calm = motes();
  sign.hovered = true;
  for (let f = 0; f < 60; f++) sign.update(1 / 60);
  assert.equal(sign.uniforms.uLift.value, 1);
  assert.ok(motes() > calm, `hovered, more motes rise (${calm} → ${motes()})`);
  // As a forge subject: its samples on the strokes, at the ground; a column over it.
  const s = sign.subject(120);
  const w = new THREE.Vector3();
  for (let i = 0; i < 120; i++) {
    w.fromArray(s.samples, i * 3).applyMatrix4(s.matrixWorld);
    assert.ok(Math.abs(w.y - 0.032) < 0.01 && Math.hypot(w.x + 1, w.z + 0.5) < SIGN_HEIGHT * 0.65, 'on the glyph');
  }
  assert.ok(s.span.y > 0.5 && s.silhouette().segs.length > 20, 'a column to wind round; its outline lies flat');
  sign.mode = 'off';
  assert.equal(sign.hit(new THREE.Ray(new THREE.Vector3(-1, 3, -0.5), down)), -1, 'gone: no hit');
});

test('the forge runs on any two subjects: dissolve, swirl, gather, form, hold, in order, with each element’s strikes', () => {
  const box = (y) => {
    const u = {
      uDissolve: { value: 0 },
      uEdge: { value: new THREE.Color() },
      uEdgeHot: { value: new THREE.Color() },
      uGlow: { value: 0 },
      uFlip: { value: 0 },
      uFrost: { value: 0 },
      uFrostColor: { value: new THREE.Color() },
    };
    const m = new THREE.Matrix4().makeTranslation(0, y, 0);
    const n = 100;
    return {
      matrixWorld: m,
      samples: Float32Array.from({ length: n * 3 }, (_, i) => (i % 3 === 1 ? i / 3 / n : 0.05)),
      heights: Float32Array.from({ length: n }, (_, i) => i / n),
      span: new THREE.Vector2(0, 1),
      silhouette: () => ({
        verts: new Float32Array([0, 0, 1, 0, 1, 1]),
        normals: new Float32Array(6),
        segs: new Uint32Array([0, 1, 1, 2]),
        useX: true,
        depth: 0,
        center: [0.5, 0.5],
        profile: { y0: 0, y1: 1, rx: new Float32Array(64).fill(0.1), rz: new Float32Array(64).fill(0.1) },
      }),
      uniforms: u,
      shown: true,
      show(on) {
        this.shown = on;
      },
      ghost() {},
    };
  };
  for (const element of ['fire', 'lightning', 'ice']) {
    const particles = createForgeParticles({
      count: 100,
      material: fxMaterial(),
      layer: 1,
      field,
      anchor: new THREE.Vector3(),
    });
    const calls = [];
    let clock = 0;
    const r = createForgeRun({
      particles,
      fx: null,
      arcs: null,
      times: FORGE_TIMES,
      reducedMotion: false,
      clock: () => clock,
      groundPoint: (rng, out) => out.set(0, 0, 0),
      hooks: {
        onFormed: () => calls.push('formed'),
        onForgeStrike: (w) => calls.push(`strike ${w}`),
        onHold: (t) => {
          if (t > FORGE_TIMES.hold) {
            r.finish();
            calls.push('done');
          }
        },
      },
    });
    const a = box(0),
      b = box(2);
    r.begin({ from: a, to: b, fromRamp: RAMP, toRamp: RAMP, element });
    r.start();
    const phases = [];
    for (let f = 0; f < 60 * 5; f++) {
      clock += 1 / 60;
      r.step(1 / 60);
      if (phases.at(-1) !== r.phase) phases.push(r.phase);
    }
    assert.deepEqual(phases, ['dissolve', 'swirl', 'gather', 'form', 'hold', 'idle'], element);
    assert.equal(a.uniforms.uDissolve.value, 1, `${element}: the old one burnt away`);
    assert.equal(a.shown, false);
    assert.equal(b.uniforms.uDissolve.value, 0, `${element}: the new one whole`);
    assert.equal(calls.filter((c) => c === 'formed').length, 1);
    if (element === 'fire') assert.ok(!calls.some((c) => c.startsWith('strike')), 'fire: no strikes');
    // (Strikes need the arcs: without them lightning's bolts aren't drawn, but its flashes still land.)
    if (element === 'ice')
      assert.deepEqual(
        calls.filter((c) => c.startsWith('strike')),
        ['strike 0.45', 'strike 0.4'],
        'ice: the shatter, the cocoon cracking off',
      );
    if (element === 'ice') assert.equal(b.uniforms.uFlip.value, 1, 'ice grows it from the bottom up');
  }
});

test('he isn’t there at first: his sign is; summoned he forms out of it, rests a rolled while, and burns back into it', () => {
  const { knights, sign, arrival, events, hooks, run } = make({ rest: [2, 3] });
  assert.equal(arrival.presence, 'away');
  assert.equal(knights.list[0].state, 'away');
  assert.equal(sign.mode, 'lit', 'the sign glows while he’s away');
  assert.ok(arrival.summon());
  assert.equal(arrival.presence, 'arriving');
  assert.equal(sign.mode, 'forge');
  assert.equal(knights.list[0].state, 'arriving');
  assert.equal(arrival.summon(), false, 'once is enough');
  run(1.3);
  assert.ok(sign.uniforms.uDissolve.value > 0.9, 'the sign has burnt away');
  run(total - 1.3 + 0.2);
  assert.equal(arrival.presence, 'resting');
  assert.equal(knights.list[0].state, 'sitting');
  assert.equal(sign.mode, 'off');
  assert.deepEqual(hooks.formed, ['knight']);
  assert.ok(
    arrival.restLeft >= 1.5 && arrival.restLeft <= 3,
    `his rest is rolled in [2, 3] s (${arrival.restLeft.toFixed(2)} left)`,
  );
  run(3.2);
  assert.equal(arrival.presence, 'leaving', 'his rest is over: he goes');
  assert.equal(knights.list[0].state, 'leaving');
  run(total + 0.3);
  assert.equal(arrival.presence, 'away');
  assert.equal(knights.list[0].state, 'away');
  assert.equal(sign.mode, 'lit', 'the sign relit');
  assert.equal(sign.uniforms.uDissolve.value, 0);
  assert.deepEqual(hooks.formed, ['knight', 'sign']);
  assert.deepEqual(events, ['arriving', 'resting', 'leaving', 'away']);
});

test('his rest running out waits for what he’s doing (the dance, a new style), BUSY_HOLD s at most; a visit tops it up', () => {
  // Mid-dance: he finishes it, then goes.
  const s = make({ rest: [1, 1] });
  s.arrival.summon();
  s.run(total + 0.2);
  assert.ok(s.knights.gesture('dance', { index: 0 }));
  s.run(1.5);
  assert.equal(s.arrival.presence, 'resting', 'his rest is over mid-dance: he dances on');
  assert.equal(s.knights.knights[0].gestureName, 'dance');
  s.run(GESTURE_TIME.dance);
  assert.equal(s.arrival.presence, 'leaving', 'the dance done, he goes');
  // Mid-style-swap: it runs its course (no pop back to whole mid-burn), then the forge takes him.
  const r = make({ rest: [100, 100] });
  r.arrival.summon();
  r.run(total + 0.2);
  r.knights.setStyle('pixel-painterly');
  r.run(0.3);
  r.arrival.restLeft = 0.01;
  const u = r.knights.knights[0].bodyMat.userData.uniforms.uDissolve;
  let last = u.value,
    pop = 0;
  for (let i = 0; i < 150; i++) {
    r.run(1 / 60);
    pop = Math.max(pop, last - u.value);
    last = u.value;
  }
  assert.ok(pop < 0.1, `his dissolve never snaps back (the most in a frame: ${pop.toFixed(2)})`);
  assert.equal(r.knights.restyling, false);
  assert.equal(r.arrival.presence, 'leaving');
  // Busy for good (hovered, say): he goes BUSY_HOLD s after his rest is over, not never.
  const h = make({ rest: [1, 1], busy: () => true });
  h.arrival.summon();
  h.run(total + 0.2);
  h.run(1 + BUSY_HOLD - 0.5);
  assert.equal(h.arrival.presence, 'resting');
  h.run(1);
  assert.equal(h.arrival.presence, 'leaving');
  // The visitor doing something with him tops his rest up to a minute (only while he rests).
  const e = make({ rest: [2, 2] });
  e.arrival.extendRest(60);
  assert.equal(e.arrival.restLeft, Infinity, 'away: nothing to top up');
  e.arrival.summon();
  e.run(total + 0.2);
  e.arrival.extendRest(60);
  assert.ok(e.arrival.restLeft > 59, `topped up (${e.arrival.restLeft.toFixed(1)} s)`);
  e.arrival.extendRest(10);
  assert.ok(e.arrival.restLeft > 59, 'never shortened');
});

test('sent off mid-helmet-swap, he burns away whole in the new helmet, held as the forge took him', () => {
  const s = make({ rest: [100, 100] });
  s.arrival.summon();
  s.run(total + 0.2);
  const n = s.knights.knights[0];
  s.knights.setHelmet('bascinet', { index: 0 });
  s.run(0.5);
  assert.ok(n.swap, 'mid-swap');
  s.knights.gesture('wave', { index: 0 });
  assert.ok(s.arrival.dismiss());
  assert.equal(n.swap, null);
  assert.equal(n.helmet, 'bascinet');
  assert.equal(n.helms.bascinet.visible, true);
  const q = n.bones[0].quaternion.clone(),
    hand = n.bones.find((b) => b.name === 'handR').getWorldPosition(new THREE.Vector3());
  s.run(0.6);
  assert.ok(
    n.bones[0].quaternion.angleTo(q) < 1e-9 &&
      n.bones
        .find((b) => b.name === 'handR')
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(hand) < 1e-9,
    'held still while he burns away',
  );
  s.run(total);
  assert.equal(s.arrival.presence, 'away');
});

test('lightning’s jumps flash him in his own tones (uLift), never washed flat in the edge’s color (uGlow)', () => {
  const { knights, arrival, run, setElement } = make({ rest: [100, 100] });
  setElement('lightning');
  arrival.summon();
  const u = knights.knights[0].bodyMat.userData.uniforms;
  let glow = 0,
    lift = 0,
    flashes = 0,
    was = 0;
  for (let t = 0; t < total + 0.2; t += 1 / 60) {
    run(1 / 60);
    glow = Math.max(glow, u.uGlow.value);
    lift = Math.max(lift, u.uLift.value);
    if (u.uLift.value > 0.5 && was <= 0.5) flashes++;
    was = u.uLift.value;
  }
  assert.equal(glow, 0, 'no wash of the edge color over him');
  assert.ok(lift > 0.6, `each jump lifts him up his own ramp (${lift.toFixed(2)})`);
  assert.equal(flashes, 5, 'five jumps, five flashes');
  assert.equal(arrival.presence, 'resting');
  assert.equal(u.uLift.value, 0, 'formed: nothing left of them');
});

test('each element’s own arrival: lightning strikes the sign and his helm, ice shatters the sign and cocoons him', () => {
  for (const element of ['lightning', 'ice']) {
    const { arrival, hooks, run, setElement } = make();
    setElement(element);
    arrival.summon();
    run(total + 0.2);
    assert.equal(arrival.presence, 'resting', element);
    assert.ok(hooks.strikes >= 2, `${element}: its big moments land (${hooks.strikes})`);
  }
});

test('sent off early, arriving or resting; reduced motion comes and goes at once; a new scenery finishes it', () => {
  const a = make({ rest: [100, 100] });
  a.arrival.summon();
  a.run(0.5);
  assert.ok(a.arrival.dismiss(), 'sent off while arriving: he finishes forming, then goes');
  assert.equal(a.arrival.presence, 'leaving');
  a.run(total + 0.3);
  assert.equal(a.arrival.presence, 'away');
  assert.equal(a.arrival.dismiss(), false, 'nobody to send off');
  // Reduced motion: at once, both ways.
  const r = make({ reducedMotion: true, rest: [1, 1] });
  assert.ok(r.arrival.summon());
  assert.equal(r.arrival.presence, 'resting');
  assert.equal(r.knights.list[0].state, 'sitting');
  assert.equal(r.sign.mode, 'off');
  r.run(1.1);
  assert.equal(r.arrival.presence, 'away');
  assert.equal(r.sign.mode, 'lit');
  // A new scenery mid-arrival: he forms there at once; mid-leaving: he's gone, the sign moved.
  const s = make({ rest: [1, 1] });
  s.arrival.summon();
  s.run(1);
  s.arrival.setScenery({ ...SEATS.forge.sign, y: 0 });
  s.knights.setScenery('forge', ground('forge'));
  assert.equal(s.arrival.presence, 'resting');
  s.run(1.5);
  assert.equal(s.arrival.presence, 'leaving');
  s.arrival.setScenery({ ...SEATS.shrine.sign, y: 0 });
  s.knights.setScenery('shrine', ground('shrine'));
  assert.equal(s.arrival.presence, 'away');
  assert.equal(s.knights.list[0].state, 'away');
  assert.equal(s.sign.mode, 'lit');
  assert.ok(Math.abs(s.sign.group.position.x - SEATS.shrine.sign.x) < 1e-9, 'the sign lies at the new seat');
});

test('the settings: not allowed, he goes at once and the sign with him; “there from the start” never runs out', () => {
  const { arrival, sign, knights, run } = make({ rest: [0.5, 0.5] });
  arrival.resting = false; // ('start')
  arrival.summon({ instant: true });
  run(3);
  assert.equal(arrival.presence, 'resting', 'he stays');
  assert.equal(arrival.restLeft, Infinity);
  arrival.allowed = false;
  assert.equal(arrival.presence, 'away');
  assert.equal(knights.list[0].state, 'away');
  assert.equal(sign.mode, 'off', 'no sign either');
  assert.equal(arrival.summon(), false, 'and he can’t be summoned');
  arrival.allowed = true;
  assert.equal(sign.mode, 'lit');
});
