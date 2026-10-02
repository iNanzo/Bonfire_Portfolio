// Bonfire Live's knights (src/visualizer/knightShow.js) against a stand-in for the scene's
// fire.knights: they only come and go where it's hidden, leap into the dance on the drop's
// beat, sit for breakdowns and silence, dance in numbers that follow the budget, stand
// only on the clear sides of the ring and never on a knight sitting one out, dance only moves
// that have room at their places, sit still under reduced motion, and every switch's off /
// in the mix / always does what it says (Armor Shine
// and Reactions too); and through the director on a stand-in scene: a drop's new scenery
// first, Knight Cameras, the music taken away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sideArcs, ringPlaces, slotPlaces, dancersFor, cutArcs, ringAround, FRONT, APART, KNIGHT_MOVES, MOVE_CYCLE, HELMETS, FORMATIONS, KNIGHT_STYLES } from '../src/visualizer/knightShow.js';
import { DEFAULT_STYLE, STYLE_KEYS } from '../src/bonfire/knightStyles.js';
import { DEFAULT_SETTINGS } from '../src/visualizer/director.js';
import { hidesFire, SHOTS, KNIGHT_SHOTS } from '../src/visualizer/camera.js';
import { MOVES, MOVE_INFO, GESTURES } from '../src/bonfire/knightPose.js';
import { HELMETS as ENGINE_HELMETS } from '../src/bonfire/knights.js';
import { DANCE_RING, danceSlots, SCENERIES } from '../src/bonfire/scenery.js';
import { facingYaw } from '../src/bonfire/knightPlaces.js';
import { roomAround, reachFits } from '../src/bonfire/colliders.js';
import { readFile } from 'node:fs/promises';
import { PERIOD, showFor, play, dancesOf, ins, FRAME, directorFor } from './lib/fakeScene.mjs';

test('the moves, helmets and cycles are the engine’s', () => {
  assert.deepEqual(Object.keys(KNIGHT_MOVES).sort(), [...MOVES].sort());
  for (const m of MOVES) assert.equal(MOVE_CYCLE[m], MOVE_INFO[m].cycle, m);
  assert.deepEqual(Object.keys(HELMETS), ENGINE_HELMETS);
  assert.ok(['praise', 'hurrah', 'joy', 'point', 'wave'].every((g) => GESTURES.includes(g)));
  assert.equal(DEFAULT_SETTINGS.danceBars, 4);
  assert.deepEqual(Object.keys(DEFAULT_SETTINGS.knightMoves), MOVES);
});

test('presence only changes where it’s hidden: the start, a big drop, a new scenery (or by hand)', () => {
  for (let run = 0; run < 12; run++) {
    const { show, kn } = showFor({ knights: 'mix', knightCount: 'random' }, { seed: run * 13 + 1 });
    kn.moment = 'start';
    show.start(kn);
    kn.moment = 'phrase';
    let bar = 1;
    const sceneries = Object.keys(SCENERIES);
    for (let cycle = 0; cycle < 6; cycle++) {
      play(show, kn, 8, { from: bar, intensity: 0.5 + 0.1 * (cycle % 4) }); bar += 8;
      show.low(kn);
      play(show, kn, 6, { from: bar, low: true, groove: false, intensity: 0.2, strength: 0.1, budget: 0.4 }); bar += 6;
      for (const st of [1, 2, 3, 4]) show.stage(kn, st);
      play(show, kn, 2, { from: bar, low: true, groove: false, intensity: 0.2, strength: 0.1 });
      kn.moment = 'drop';
      show.drop(kn, 'big');
      kn.moment = 'phrase';
      bar = 1;
      play(show, kn, 12, { from: bar, budget: 1 - cycle * 0.1 }); bar += 12;
      show.drop(kn, 'small');
      play(show, kn, 4, { from: bar, intensity: 0.3 }); bar += 4;
      if (cycle % 2) {
        kn.moment = 'scenery';
        kn.scenery = sceneries[(cycle + run) % sceneries.length];
        show.update(kn, 0.016, { scenery: kn.scenery, period: PERIOD });
        kn.moment = 'phrase';
      }
    }
    const changes = ins(kn.log);
    const bad = changes.filter((e) => !['init', 'start', 'drop', 'scenery'].includes(e[2]));
    assert.deepEqual(bad, [], `run ${run}: presence changed mid-phrase`);
  }
});

test('in the mix, the knights come and go over a night; always, they stay; off, never there', () => {
  const tally = { in: 0, out: 0 };
  for (let run = 0; run < 8; run++) {
    const { show, kn } = showFor({ knights: 'mix' }, { seed: run + 100 });
    show.start(kn);
    for (let d = 0; d < 10; d++) {
      const before = kn.present;
      show.drop(kn, 'big');
      play(show, kn, 8);
      if (kn.present > before) tally.in++;
      if (!kn.present && before) tally.out++;
    }
  }
  assert.ok(tally.in > 3 && tally.out > 3, `they come and go (${JSON.stringify(tally)})`);

  const always = showFor({ knights: 'on', knightCount: 3 });
  always.show.start(always.kn);
  for (let d = 0; d < 20; d++) { always.show.drop(always.kn, 'big'); play(always.show, always.kn, 4); }
  assert.equal(ins(always.kn.log).filter((e) => e[0] === 'out').length, 0, 'always: nobody leaves');
  assert.equal(always.kn.present, 3);

  const off = showFor({ knights: 'off' });
  assert.equal(off.kn.present, 0, 'off: the resting knight goes too');
  off.show.start(off.kn);
  for (let d = 0; d < 5; d++) { off.show.drop(off.kn, 'big'); play(off.show, off.kn, 4); }
  assert.equal(off.kn.present, 0);
  assert.equal(dancesOf(off.kn.log).length, 0);
});

test('on the drop they leap straight into a big move, Praise the Sun and all', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2, knightSummon: 'on', knightGestures: 'on' });
  show.start(kn);
  play(show, kn, 4);
  const mark = kn.log.length;
  show.drop(kn, 'big');
  const now = dancesOf(kn.log, mark);
  assert.equal(new Set(now.map((e) => e[1])).size, 2, 'both dance at once, in the drop’s own call');
  assert.ok(now.every((e) => e[2].move === 'jump' && e[2].energy === 1), 'the leap: a jump at full energy');
  assert.equal(kn.log.slice(mark).filter((e) => e[0] === 'leap').length, 2, 'Summon on the Drop: up and in place in the flash');
  // Two bars of big moves (the drop's and the next), then the groove's.
  const moves = [];
  for (let b = 1; b <= 4; b++) { const m = kn.log.length; play(show, kn, 1, { from: b, budget: 1 }); moves.push(dancesOf(kn.log, m)[0]?.[2].move); }
  assert.ok(['jumpingJack', 'spin', 'praise', 'fistPump', 'headbang'].includes(moves[0]), `bar 1: another big move (${moves[0]})`);
  const gestures = kn.log.slice(mark).filter((e) => e[0] === 'gesture');
  assert.ok(gestures.length >= 1 && gestures.every((e) => ['praise', 'hurrah', 'joy', 'point'].includes(e[1])), 'a drop gesture');
  assert.equal(show.status.mode, 'dance');

  const walk = showFor({ knights: 'on', knightCount: 2, knightSummon: 'off', knightGestures: 'off' });
  walk.show.start(walk.kn);
  const m2 = walk.kn.log.length;
  walk.show.drop(walk.kn, 'big');
  assert.equal(walk.kn.log.slice(m2).filter((e) => e[0] === 'leap').length, 0, 'Summon off: they get up and walk over');
  assert.equal(dancesOf(walk.kn.log, m2).length, 2);
  assert.equal(walk.kn.log.slice(m2).filter((e) => e[0] === 'gesture').length, 0, 'Gestures off');
});

test('a build gets them up and bouncing at the third stage, faster at the fourth, and the drop keeps their places', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 3 });
  show.start(kn);
  play(show, kn, 4);
  show.low(kn);
  play(show, kn, 2, { low: true, groove: false, intensity: 0.2 });
  show.stage(kn, 2);
  assert.equal(show.status.mode, 'rest');
  const mark = kn.log.length;
  show.stage(kn, 3);
  const up = dancesOf(kn.log, mark);
  assert.equal(up.length, 3);
  assert.ok(up.every((e) => e[2].move === 'nod' && e[2].facing === 'fire'), 'bouncing, facing the fire');
  assert.equal(show.status.mode, 'ready');
  show.stage(kn, 4);
  const m2 = kn.log.length;
  play(show, kn, 1, { low: true, groove: false });
  const bounce = kn.log.slice(m2).filter((e) => e[0] === 'dance' && 'offset' in e[2] && e[2].offset < 0);
  assert.ok(bounce.length > 0, 'the last stretch: double-time bounce (a running offset)');
  const places = up.map((e) => e[2].position);
  const m3 = kn.log.length;
  show.drop(kn, 'big');
  const drop = dancesOf(kn.log, m3);
  assert.deepEqual(drop.map((e) => e[2].position), places, 'already up: they leap where they stood');
});

test('a breakdown stops the dance on the next downbeat (the first stands and watches, the rest sit where they are); silence sits them at once; a small drop is one cheer', () => {
  const { show, kn, settings } = showFor({ knights: 'on', knightCount: 2, knightGestures: 'on' });
  show.start(kn);
  show.drop(kn, 'big');
  play(show, kn, 3, { budget: 1 });
  assert.equal(show.status.mode, 'dance');
  show.low(kn);
  assert.equal(show.status.mode, 'dance', 'not in the middle of the bar');
  play(show, kn, 1, { low: true, groove: false });
  assert.equal(show.status.mode, 'watch');
  assert.deepEqual(kn.list.filter((e) => e.present).map((e) => e.state), ['standing', 'sitting']);
  assert.equal(show.status.text, 'the knights watch the blade');
  play(show, kn, 4, { low: true, groove: false });
  assert.equal(show.status.mode, 'watch', 'through the breakdown');
  play(show, kn, 1);
  assert.equal(show.status.mode, 'rest', 'the groove back with no drop: they sit');
  assert.ok(kn.list.filter((e) => e.present).every((e) => e.state === 'sitting'));

  show.drop(kn, 'big');
  play(show, kn, 2);
  show.silence(kn);
  assert.equal(show.status.mode, 'rest');
  assert.equal(show.status.dancing, 0);

  const m = kn.log.length;
  show.drop(kn, 'small');
  const cheers = kn.log.slice(m).filter((e) => e[0] === 'gesture');
  assert.equal(cheers.length, 1);
  assert.equal(cheers[0][2].index, 'all');
  assert.equal(dancesOf(kn.log, m).length, 0, 'no dance for a small drop');
  // Gestures on Drops: Off, no cheer either.
  settings.knightGestures = 'off';
  const m2 = kn.log.length;
  show.drop(kn, 'small');
  assert.equal(kn.log.slice(m2).filter((e) => e[0] === 'gesture').length, 0, 'Gestures on Drops off: no cheer');
});

test('they nod along seated on strong beats before any drop, and stop on weak ones', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2 });
  show.start(kn);
  play(show, kn, 1, { strength: 0.1 });
  assert.equal(kn.log.filter((e) => e[0] === 'dance').length, 0);
  play(show, kn, 1, { strength: 0.7 });
  const nods = kn.log.filter((e) => e[0] === 'dance' && e[2].seated && e[2].move === 'nod');
  assert.equal(nods.length, 2, 'both nod, seated');
  assert.equal(show.status.text, 'the knights nod along');
  play(show, kn, 1, { strength: 0.1 });
  assert.equal(show.status.text, '2 knights rest');
  assert.equal(dancesOf(kn.log).length, 0, 'no standing dance before a drop in the mix');
});

test('how many dance follows the budget, counted again on phrase lines', () => {
  assert.equal(dancersFor(4, 1), 4);
  assert.equal(dancersFor(4, 0), 2);
  assert.equal(dancersFor(1, 0), 1);
  assert.equal(dancersFor(3, 0.5), 2);
  const { show, kn } = showFor({ knights: 'on', knightCount: 4, knightDance: 'on' });
  show.start(kn);
  show.drop(kn, 'big', { budget: 1 });
  assert.equal(show.status.dancing, 4);
  play(show, kn, 3, { from: 1, budget: 0.1 });
  assert.equal(show.status.dancing, 4, 'not mid-phrase');
  play(show, kn, 6, { from: 4, budget: 0.1 }); // (through bar 8, a phrase line)
  assert.equal(show.status.dancing, dancersFor(4, 0.1));
  assert.equal(kn.list.filter((e) => e.present).length, 4, 'the rest stay, seated');
  assert.equal(show.status.text, `${dancersFor(4, 0.1)} of 4 knights dance`);
});

test('dancers keep to the ring’s clear sides in every scenery, never in front of the fire or behind it', () => {
  const inFree = (b, free) => free.some(([a, c]) => (b >= a - 1e-6 && b <= c + 1e-6) || (b + 360 >= a - 1e-6 && b + 360 <= c + 1e-6));
  for (const name of Object.keys(SCENERIES)) {
    const ring = { center: { x: DANCE_RING.center[0], z: DANCE_RING.center[1] }, radius: DANCE_RING.radius, free: DANCE_RING.free(name), slots: danceSlots(name) };
    for (const [lo, hi] of sideArcs(ring.free)) assert.ok(hi > lo && lo >= 0, `${name}: arc ${lo}–${hi}`);
    for (let n = 1; n <= 4; n++) {
      const sets = [slotPlaces(ring, n)];
      // (Round the Fire only when there's room: the show falls back to the layouts otherwise.)
      for (let step = -8; step <= 8; step++) sets.push(ringPlaces(ring, n, step));
      for (let k = sets.length - 1; k > 0; k--) if (sets[k].some((p, i) => sets[k].some((q, j) => j > i && Math.hypot(p.x - q.x, p.z - q.z) < 0.5))) sets.splice(k, 1);
      for (const places of sets) {
        assert.equal(places.length, n, `${name}: room for ${n}`);
        for (const p of places) {
          assert.ok(inFree(p.bearing, ring.free), `${name}: ${p.bearing.toFixed(0)}° is on a clear arc`);
          const off = Math.min(p.bearing, 360 - p.bearing);
          assert.ok(off >= FRONT - 1e-6, `${name}: ${p.bearing.toFixed(0)}° is out of the corridor in front`);
          assert.ok(Math.abs(p.bearing - 180) >= 20 - 1e-6, `${name}: ${p.bearing.toFixed(0)}° isn’t hidden right behind the fire`);
          assert.ok(Math.abs(Math.hypot(p.x - ring.center.x, p.z - ring.center.z) - ring.radius) < 1e-6);
        }
        for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
          assert.ok(Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z) > 0.45, `${name}: ${n} dancers apart`);
        }
      }
    }
  }
  // Through the show: every formation, every scenery.
  for (const formation of [...Object.keys(FORMATIONS), 'mix']) {
    for (const name of Object.keys(SCENERIES)) {
      const { show, kn } = showFor({ knights: 'on', knightCount: 4, knightDance: 'on', knightFormation: formation });
      kn.scenery = name;
      show.update(kn, 0.016, { scenery: name, period: PERIOD });
      show.start(kn);
      show.drop(kn, 'big');
      play(show, kn, 24, { budget: 1 });
      const free = DANCE_RING.free(name);
      for (const e of dancesOf(kn.log)) {
        const p = e[2].position;
        if (!p) continue;
        const b = ((Math.atan2(p.x - DANCE_RING.center[0], p.z - DANCE_RING.center[1]) * 180) / Math.PI + 360) % 360;
        assert.ok(inFree(b, free), `${formation} in ${name}: ${b.toFixed(0)}°`);
      }
    }
  }
});

test('the others rest on the ring’s clear sides, not in front of the fire', () => {
  for (const name of Object.keys(SCENERIES)) {
    for (let n = 2; n <= 4; n++) {
      const { show, kn } = showFor({ knights: 'on', knightCount: n, knightDance: 'off' }, { scenery: name });
      show.start(kn);
      const placed = kn.log.filter((e) => e[0] === 'leap');
      assert.equal(placed.length, n - 1, `${name}: the others (${n - 1}) placed`);
      for (const [, , p] of placed) {
        const b = ((Math.atan2(p.x - DANCE_RING.center[0], p.z - DANCE_RING.center[1]) * 180) / Math.PI + 360) % 360;
        assert.ok(DANCE_RING.free(name).some(([a, c]) => (b >= a && b <= c) || (b + 360 >= a && b + 360 <= c)), `${name}: ${b.toFixed(0)}° is clear`);
        assert.ok(Math.min(b, 360 - b) >= FRONT, `${name}: ${b.toFixed(0)}° isn’t in front`);
      }
      assert.ok(kn.log.filter((e) => e[0] === 'sit').length >= n - 1, 'and sit down there');
    }
  }
});

test('formations: a line together, solo moves, a canon a step apart, round the fire stepping along', () => {
  const run = (formation) => {
    const { show, kn } = showFor({ knights: 'on', knightCount: 3, knightDance: 'on', knightFormation: formation, danceBars: 2 });
    show.start(kn);
    show.drop(kn, 'big');
    const mark = kn.log.length;
    play(show, kn, 8, { budget: 1 });
    return dancesOf(kn.log, mark);
  };
  const line = run('line');
  const byBar = (d) => Object.values(Object.groupBy(d, (e, i) => Math.floor(i / 3)));
  assert.ok(byBar(line).every((g) => new Set(g.map((e) => e[2].move)).size === 1 && g.every((e) => e[2].offset === 0 && e[2].facing === 'front')), 'line: one move, together, to the camera');
  const solo = run('solo');
  assert.ok(byBar(solo).some((g) => new Set(g.map((e) => e[2].move)).size > 1), 'solo: their own moves');
  const canon = run('canon');
  assert.ok(canon.every((e) => e[2].offset === e[1] * (MOVE_CYCLE[e[2].move] >= 4 ? 1 : 0.5)), 'canon: each a step behind');
  const ring = run('ring');
  assert.ok(new Set(ring.filter((e) => e[1] === 0).map((e) => `${e[2].position.x.toFixed(2)},${e[2].position.z.toFixed(2)}`)).size > 1, 'round the fire: they step along');
});

test('dance: off, they sit (no nods either); always, up whenever the groove is locked', () => {
  const off = showFor({ knights: 'on', knightCount: 2, knightDance: 'off' });
  off.show.start(off.kn);
  play(off.show, off.kn, 4);
  off.show.drop(off.kn, 'big');
  play(off.show, off.kn, 8);
  assert.equal(off.kn.log.filter((e) => e[0] === 'dance').length, 0);
  assert.equal(off.show.danceNow(off.kn), 'dance', 'K still makes them dance');

  const on = showFor({ knights: 'on', knightCount: 2, knightDance: 'on' });
  on.show.start(on.kn);
  play(on.show, on.kn, 1);
  assert.equal(on.show.status.mode, 'dance', 'up on the first locked bar, no drop needed');
  play(on.show, on.kn, 3, { locked: false, groove: false });
  assert.equal(on.show.status.mode, 'rest', 'the groove gone: they sit');

  const mix = showFor({ knights: 'on', knightCount: 2 });
  mix.show.start(mix.kn);
  play(mix.show, mix.kn, 16);
  assert.equal(mix.show.status.mode, 'rest', 'in the mix, not before the first drop');
});

test('in the mix a dance ends on a phrase line when the energy falls', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2 });
  show.start(kn);
  show.drop(kn, 'big');
  play(show, kn, 5, { from: 1, budget: 1 });
  play(show, kn, 2, { from: 6, intensity: 0.2 });
  assert.equal(show.status.mode, 'dance', 'waits for the phrase line');
  play(show, kn, 1, { from: 8, intensity: 0.2 });
  assert.equal(show.status.mode, 'rest');
});

test('K dances now or sits; Shift+K comes or goes, on the next drop if one is coming', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2 });
  show.start(kn);
  assert.equal(show.danceNow(kn), 'dance');
  assert.equal(show.status.mode, 'dance');
  assert.equal(show.danceNow(kn), 'sit');
  assert.equal(show.status.mode, 'rest');
  assert.equal(show.toggle(kn), 'out');
  assert.equal(kn.present, 0);
  assert.equal(show.toggle(kn, { holding: true }), 'in-next');
  assert.equal(kn.present, 0, 'not yet');
  show.drop(kn, 'big');
  assert.ok(kn.present > 0, 'in on the drop');
});

test('reduced motion: they sit (they still come and go)', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 3, knightDance: 'on', knightGestures: 'on' }, { reduced: true });
  show.start(kn);
  play(show, kn, 4);
  for (const st of [3, 4]) show.stage(kn, st);
  show.drop(kn, 'big');
  show.drop(kn, 'small');
  play(show, kn, 8);
  assert.equal(show.danceNow(kn), null);
  assert.equal(kn.log.filter((e) => e[0] === 'dance' || e[0] === 'gesture').length, 0);
  assert.equal(kn.present, 3);
});

test('a knight near the living blade flinches (now and then), with Reactions on', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 1, knightReactions: 'on' });
  assert.equal(show.near(kn, { x: -0.7, z: -0.8 }), true);
  assert.equal(show.near(kn, { x: 2, z: 2 }), false);
  assert.equal(kn.log.filter((e) => e[0] === 'react').length, 1);
  const off = showFor({ knights: 'on', knightCount: 1, knightReactions: 'off' });
  assert.equal(off.show.near(off.kn, { x: -0.7, z: -0.8 }), false, 'Reactions off: no flinch');
  assert.equal(off.kn.log.filter((e) => e[0] === 'react').length, 0);
});

test('Armor Shine and Reactions: off, always, and in the mix rolled apart, only where it’s hidden', () => {
  const last = (kn, what) => kn.log.filter((e) => e[0] === what).at(-1)?.[1];
  const off = showFor({ knightShine: 'off', knightReactions: 'off' });
  assert.deepEqual(last(off.kn, 'shine'), { rest: false, flares: false });
  assert.equal(last(off.kn, 'reactions'), false);
  const on = showFor({ knightShine: 'on', knightReactions: 'on' });
  on.show.start(on.kn);
  on.show.drop(on.kn, 'big');
  assert.deepEqual(last(on.kn, 'shine'), { rest: true, flares: true });
  assert.equal(last(on.kn, 'reactions'), true);
  assert.equal(on.show.reactions, true);
  // In the mix: rest and flares each come and go, on their own, and so do the reactions;
  // rolled at the start, a big drop's flash and a new scenery, never mid-phrase.
  const seen = new Set();
  let reacts = 0;
  let rolls = 0;
  const sceneries = Object.keys(SCENERIES);
  for (let run = 0; run < 6; run++) {
    const { show, kn } = showFor({ knights: 'on', knightCount: 2 }, { seed: 300 + run });
    kn.moment = 'start';
    show.start(kn);
    for (let d = 0; d < 8; d++) {
      kn.moment = 'phrase';
      play(show, kn, 8);
      kn.moment = 'drop';
      show.drop(kn, 'big');
      kn.moment = 'phrase';
      play(show, kn, 8);
      kn.moment = 'scenery';
      kn.setScenery(sceneries[(d + run) % sceneries.length]);
      show.update(kn, 0.016, { scenery: kn.scenery, period: PERIOD });
    }
    for (const e of kn.log.filter((x) => x[0] === 'shine' || x[0] === 'reactions')) {
      assert.ok(['init', 'start', 'drop', 'scenery'].includes(e[2]), `rolled at a hidden moment (${e[0]} at ${e[2]})`);
      if (e[0] === 'shine') { seen.add(`${e[1].rest}${e[1].flares}`); rolls++; } else if (e[1]) reacts++;
    }
  }
  assert.equal(seen.size, 4, `rest and flares rolled apart (${[...seen]})`);
  assert.ok(reacts > rolls * 0.4 && reacts < rolls * 0.95, `reactions come and go (${reacts}/${rolls})`);
  // Changed by hand: at once.
  const hand = showFor({ knightShine: 'on' });
  hand.settings.knightShine = 'off';
  hand.show.update(hand.kn, 0.016, { scenery: hand.kn.scenery });
  assert.deepEqual(last(hand.kn, 'shine'), { rest: false, flares: false });
  hand.settings.knightReactions = 'off';
  hand.show.update(hand.kn, 0.016, { scenery: hand.kn.scenery });
  assert.equal(last(hand.kn, 'reactions'), false);
});

test('dancers never stand on a knight sitting one out, and the first keeps to his own side (3 and 4 knights)', () => {
  const bearing = (p) => ((Math.atan2(p.x - DANCE_RING.center[0], p.z - DANCE_RING.center[1]) * 180) / Math.PI + 360) % 360;
  const check = (kn, what) => {
    const list = kn.list.filter((e) => e.present);
    const up = list.filter((e) => e.state === 'dancing');
    const seated = list.filter((e) => e.state === 'sitting');
    for (const d of up) {
      for (const s of seated) {
        const gap = Math.hypot(d.position.x - s.position.x, d.position.z - s.position.z);
        assert.ok(gap >= APART - 1e-6, `${what}: dancer ${d.index} ${gap.toFixed(2)} m from seated ${s.index}`);
      }
      if (d.index === 0) assert.ok(bearing(d.position) > 180, `${what}: the first on his own side (${bearing(d.position).toFixed(0)}°)`);
    }
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
      assert.ok(Math.hypot(up[i].position.x - up[j].position.x, up[i].position.z - up[j].position.z) >= APART - 1e-6, `${what}: dancers ${up[i].index} and ${up[j].index} apart`);
    }
    return up.length;
  };
  let mixed = 0;
  for (const n of [3, 4]) {
    for (const name of Object.keys(SCENERIES)) {
      for (const formation of [...Object.keys(FORMATIONS), 'mix']) {
        // (Edge Glow Always: nothing more is rolled at the hidden moments, so each seed's dance
        // after the drop runs as long as this was written for, past the phrase line at bar 8.)
        const over = { knights: 'on', knightCount: n, knightFormation: formation, knightGlow: 'on' };
        // K at a low and a middling budget: some dance, the rest nod along seated.
        for (const budget of [0.2, 0.6]) {
          const { show, kn } = showFor(over, { scenery: name, seed: n * 31 + budget * 10 });
          show.start(kn);
          show.danceNow(kn, { budget });
          const what = `${n} knights, ${name}, ${formation}, K at ${budget}`;
          if (check(kn, what) < n) mixed++;
          for (let b = 1; b <= 8; b++) { play(show, kn, 1, { from: b, budget }); check(kn, `${what}, bar ${b}`); }
        }
        // A drop (all of them), then the phrase line counts again at 0.7: one sits down.
        const { show, kn } = showFor(over, { scenery: name, seed: n * 17 });
        show.start(kn);
        show.drop(kn, 'big', { budget: 1 });
        const what = `${n} knights, ${name}, ${formation}, drop then 0.7`;
        assert.equal(check(kn, what), n);
        for (let b = 1; b <= 12; b++) { play(show, kn, 1, { from: b, budget: b >= 8 ? 0.7 : 1 }); check(kn, `${what}, bar ${b}`); }
        assert.equal(show.status.dancing, dancersFor(n, 0.7), `${what}: counted again`);
      }
    }
  }
  assert.ok(mixed > 20, `the mixed casts were tried (${mixed})`);
});

test('the ring less the places by a seated knight', () => {
  assert.deepEqual(cutArcs([[246, 456]], [[80, 100]]), [[246, 440]]);
  assert.deepEqual(cutArcs([[10, 60]], [[-10, 20]]), [[20, 60]]);
  assert.deepEqual(cutArcs([[10, 60]], [[20, 30], [40, 45]]), [[10, 20], [30, 40], [45, 60]]);
  const ring = { center: { x: DANCE_RING.center[0], z: DANCE_RING.center[1] }, radius: DANCE_RING.radius, free: DANCE_RING.free('ruins') };
  const at = (b, r = 1.2) => ({ x: ring.center.x + Math.sin((b * Math.PI) / 180) * r, z: ring.center.z + Math.cos((b * Math.PI) / 180) * r });
  const sitters = [at(80), at(157, 1.47)];
  const open = ringAround(ring, sitters);
  for (let n = 1; n <= 2; n++) {
    for (const p of ringPlaces(open, n)) {
      for (const s of sitters) assert.ok(Math.hypot(p.x - s.x, p.z - s.z) >= APART, `${n}: ${p.bearing.toFixed(0)}° clear`);
    }
  }
  assert.equal(ringAround(ring, [at(0, 0)]), null, 'one sitting in the fire leaves no ring');
});

test('nodding in their seats, they get up for the dance (K, or Dance Always), not dance sitting down', () => {
  for (const [how, over] of [['K', { knightDance: 'mix' }], ['Always', { knightDance: 'on' }]]) {
    const { show, kn } = showFor({ knights: 'on', knightCount: 3, ...over });
    show.start(kn);
    // Strong beats, not yet locked: they nod along seated.
    play(show, kn, 2, { locked: false });
    assert.ok(kn.log.some((e) => e[0] === 'dance' && e[2].seated), `${how}: nodding first`);
    if (how === 'K') show.danceNow(kn, { budget: 1 });
    else play(show, kn, 1, { from: 3 });
    assert.equal(show.status.mode, 'dance', how);
    const up = kn.list.filter((e) => e.present && e.state === 'dancing').length;
    assert.equal(up, show.status.dancing, `${how}: every dancer on his feet (${kn.list.map((e) => e.state)})`);
  }
});

test('K with Dance off: they dance their phrase, not sit on the next downbeat', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2, knightDance: 'off' });
  show.start(kn);
  assert.equal(show.danceNow(kn), 'dance');
  play(show, kn, 7, { from: 1 });
  assert.equal(show.status.mode, 'dance', 'still dancing seven bars on');
  assert.ok(dancesOf(kn.log).length > 2);
  play(show, kn, 1, { from: 8 });
  assert.equal(show.status.mode, 'rest', 'sat down on the phrase line');
});

test('How Many changed while they’re up for the drop: they stay up, at the new count’s places', () => {
  const { show, kn, settings } = showFor({ knights: 'on', knightCount: 2 });
  show.start(kn);
  play(show, kn, 2);
  show.low(kn);
  play(show, kn, 2, { low: true, groove: false, intensity: 0.2 });
  show.stage(kn, 3);
  show.stage(kn, 4);
  assert.equal(show.status.mode, 'ready');
  settings.knightCount = 3;
  show.update(kn, 0.016, { scenery: kn.scenery, period: PERIOD });
  assert.equal(show.status.mode, 'ready', 'still up for the drop');
  const present = kn.list.filter((e) => e.present);
  assert.equal(present.length, 3);
  assert.ok(present.every((e) => e.state === 'dancing'), `all three up (${present.map((e) => e.state)})`);
  const m = kn.log.length;
  play(show, kn, 1, { low: true, groove: false });
  assert.ok(kn.log.slice(m).some((e) => e[0] === 'dance' && e[2].offset < 0), 'the last stretch’s bounce goes on');
  // Watching the blade in a breakdown: How Many changes, the first keeps watching.
  const w = showFor({ knights: 'on', knightCount: 2 });
  w.show.start(w.kn);
  w.show.drop(w.kn, 'big');
  play(w.show, w.kn, 2, { budget: 1 });
  w.show.low(w.kn);
  play(w.show, w.kn, 1, { low: true, groove: false });
  assert.equal(w.show.status.mode, 'watch');
  w.settings.knightCount = 1;
  w.show.update(w.kn, 0.016, { scenery: w.kn.scenery, period: PERIOD });
  assert.equal(w.show.status.mode, 'watch');
  assert.deepEqual(w.kn.list.filter((e) => e.present).map((e) => e.state), ['standing']);
});

test('the music taken away mid-dance (a new source): they sit, and the next start leaves nobody up', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2 });
  show.start(kn);
  show.drop(kn, 'big');
  play(show, kn, 3, { budget: 1 });
  assert.equal(show.status.mode, 'dance');
  show.silence(kn);
  assert.ok(kn.list.filter((e) => e.present).every((e) => e.state === 'sitting'), 'all seated');
  show.start(kn);
  assert.equal(show.status.mode, 'rest');
  assert.ok(kn.list.filter((e) => e.present).every((e) => e.state === 'sitting'));
  // (And without the silence: the new start sits anyone still up.)
  const b = showFor({ knights: 'on', knightCount: 2 });
  b.show.start(b.kn);
  b.show.drop(b.kn, 'big');
  play(b.show, b.kn, 3, { budget: 1 });
  b.show.start(b.kn);
  assert.equal(b.show.status.dancing, 0);
  assert.ok(b.kn.list.filter((e) => e.present).every((e) => e.state === 'sitting'), `seated (${b.kn.list.map((e) => e.state)})`);
});

test('a show made while the music plays (a rebuild) starts on its first live frame', () => {
  const { show, kn } = showFor({ knights: 'on', knightCount: 2, knightDance: 'on' });
  for (let b = 1; b <= 4; b++) {
    for (let k = 0; k < 4; k++) { show.beat(kn, { strength: 0.7 }); show.update(kn, PERIOD, { beatPos: b * 4 + k, period: PERIOD, scenery: kn.scenery, live: true }); }
    show.bar(kn, { bar: b, budget: 0.8, intensity: 0.85, strength: 0.7, locked: true });
  }
  assert.equal(show.status.mode, 'dance', 'Dance Always: up with no start event');
});

test('a drop that brings a new scenery: the dancers take their places there, once', () => {
  for (const name of ['forge', 'shrine', 'cathedral', 'cult']) {
    const { show, kn } = showFor({ knights: 'on', knightCount: 3, knightFormation: 'line' });
    show.start(kn);
    play(show, kn, 2);
    kn.setScenery(name); // (the director changes it first, in the drop's flash)
    const m = kn.log.length;
    show.drop(kn, 'big', { budget: 1, scenery: name });
    const key = (e) => `${e[1]}:${e[2].position.x.toFixed(2)},${e[2].position.z.toFixed(2)}`;
    const first = dancesOf(kn.log, m).map(key);
    assert.equal(first.length, 3);
    show.update(kn, 0.016, { scenery: name, period: PERIOD });
    assert.deepEqual(dancesOf(kn.log, m).map(key), first, `${name}: no second arrangement on the next frame`);
    const places = slotPlaces(kn.slots(name), 3).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    assert.ok(first.every((f) => places.includes(f.split(':')[1])), `${name}: the new scenery’s places`);
  }
});

test('camera: knight shots aren’t in the rotation, and a cut skips a shot with a knight in front of the fire', () => {
  for (const k of Object.keys(KNIGHT_SHOTS)) assert.ok(!(k in SHOTS));
  const head = (x, z) => ({ x, y: 1.5, z });
  const [cx, , cz] = SHOTS.clearing.pos;
  assert.equal(hidesFire(SHOTS.clearing.pos, [head(cx * 0.5, cz * 0.5)]), true, 'right between');
  for (const s of danceSlots('ruins').slice(0, 4)) assert.equal(hidesFire(SHOTS.clearing.pos, [head(s.x, s.z)]), false, `slot at ${s.bearing}°`);
  assert.equal(hidesFire(SHOTS.clearing.pos, []), false);
});


test('the director: a drop that lands somewhere new changes the scenery first, and the dancers take its places', () => {
  const { kn, fire, director } = directorFor({ knights: 'on', knightCount: 3, knightFormation: 'line', scenery: 'mix' });
  director.strike();
  director.update(FRAME, 0.016);
  const mark = kn.log.length;
  director.strike(); // (every other big drop: a new place)
  const moved = fire.calls.find((c) => c[0] === 'setScenery');
  assert.ok(moved, 'a new scenery');
  assert.ok(moved[2] <= mark, 'changed before the knights were told of the drop');
  const places = slotPlaces(kn.slots(moved[1]), 3).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  const key = (e) => `${e[2].position.x.toFixed(2)},${e[2].position.z.toFixed(2)}`;
  const first = dancesOf(kn.log, mark);
  assert.equal(first.length, 3);
  assert.ok(first.every((e) => places.includes(key(e))), `${moved[1]}: its own places`);
  director.update(FRAME, 0.016);
  assert.equal(dancesOf(kn.log, mark).length, 3, 'and no second arrangement a frame later');
});

test('the director: with Knight Cameras off a drop never cuts to the dancers’ wide; on, now and then', () => {
  for (const [cam, some] of [['off', false], ['on', true]]) {
    const { director, shots } = directorFor({ knights: 'on', knightCount: 2, knightDance: 'on', knightCam: cam });
    for (let i = 0; i < 60; i++) director.strike();
    assert.equal(shots.includes(KNIGHT_SHOTS.dancersWide.name), some, `Knight Cameras ${cam}: ${shots.filter((s) => s === KNIGHT_SHOTS.dancersWide.name).length} of 60`);
  }
});

test('the director: the music taken away (silence()) sits the dancers at once', () => {
  const { kn, director } = directorFor({ knights: 'on', knightCount: 2 });
  director.strike();
  assert.ok(kn.list.some((e) => e.state === 'dancing'));
  director.silence();
  assert.equal(director.phase, 'rest');
  assert.ok(kn.list.filter((e) => e.present).every((e) => e.state === 'sitting'));
  assert.equal(director.knights.dancing, 0);
});

// --- hidden moments take the settings as they stand; a scene's retake; the options ------------
const OPTION_LOG = ['in', 'out', 'finish', 'seat', 'rim', 'shine', 'reactions'];
const frames = (show, kn, n = 12) => { for (let i = 0; i < n; i++) show.update(kn, 0.016, { scenery: kn.scenery, period: PERIOD }); };

test('retake (a scene arriving): the count, each knight’s helmet and the options in one moment, nothing more a frame later', () => {
  const { settings, show, kn } = showFor({ knights: 'on', knightCount: 1 });
  show.start(kn);
  frames(show, kn);
  // (As a scene's overlay sets them: its Edge Glow Always, at its own strength.)
  Object.assign(settings, { knightCount: 3, knightHelmetOrder: ['armet', 'bascinet', 'great'], knightFinish: 'blackened', knightSeat: 'watchful', knightGlow: 'on', knightRim: 0.8 });
  kn.moment = 'retake';
  show.retake(kn);
  assert.deepEqual(kn.list.map((e) => e.present), [true, true, true, false]);
  assert.deepEqual(kn.list.slice(0, 3).map((e) => e.helmet), ['armet', 'bascinet', 'great'], 'each knight the scene’s helmet');
  assert.deepEqual([kn.finish, kn.seatPose, kn.rim], ['blackened', 'watchful', 0.8]);
  const mark = kn.log.length;
  const helmets = kn.list.map((e) => e.helmet);
  kn.moment = 'later';
  frames(show, kn);
  assert.deepEqual(kn.log.slice(mark).filter((e) => OPTION_LOG.includes(e[0])), [], 'no second arrangement');
  assert.deepEqual(kn.list.map((e) => e.helmet), helmets);
  // A new order by hand (the Painter's helmet picker): at once, only the one that changed.
  settings.knightHelmetOrder = ['armet', 'great', 'great'];
  frames(show, kn, 1);
  assert.deepEqual(kn.list.slice(0, 3).map((e) => e.helmet), ['armet', 'great', 'great']);
  // Knights off in the scene: gone in its moment.
  settings.knights = 'off';
  kn.moment = 'retake2';
  show.retake(kn, { instant: true });
  assert.equal(kn.list.filter((e) => e.present).length, 0);
  const after = kn.log.length;
  frames(show, kn);
  assert.equal(kn.log.slice(after).filter((e) => OPTION_LOG.includes(e[0])).length, 0);
});

test('retake with a new scenery: they take its places in that moment, and no second one for the scenery a frame later', () => {
  const { settings, show, kn } = showFor({ knights: 'on', knightCount: 3 });
  show.start(kn);
  frames(show, kn);
  settings.knightCount = 2;
  kn.setScenery('shrine');
  kn.moment = 'retake';
  show.retake(kn, { scenery: 'shrine' });
  const mark = kn.log.length;
  kn.moment = 'later';
  frames(show, kn);
  assert.deepEqual(kn.log.slice(mark).filter((e) => OPTION_LOG.includes(e[0]) || e[0] === 'sit' || e[0] === 'leap'), []);
  assert.equal(kn.list.filter((e) => e.present).length, 2);
});

test('retake with Dance Always and the groove on: up and dancing in the same moment', () => {
  const { settings, show, kn } = showFor({ knights: 'on', knightCount: 2, knightDance: 'off' });
  show.start(kn);
  play(show, kn, 2);
  Object.assign(settings, { knightDance: 'on', knightCount: 3, knightFormation: 'line' });
  kn.moment = 'retake';
  show.retake(kn, { groove: true, budget: 1 });
  assert.equal(show.dancing, 3, 'all three up');
  assert.ok(kn.list.filter((e) => e.present).every((e) => e.state === 'dancing'));
  const mark = kn.log.length;
  frames(show, kn);
  assert.deepEqual(kn.log.slice(mark).filter((e) => OPTION_LOG.includes(e[0]) || e[0] === 'dance'), []);
});

test('the start and a big drop take the Knights settings as they stand: nothing is arranged again a frame later', () => {
  for (const moment of ['start', 'drop']) {
    const { settings, show, kn } = showFor({ knights: 'on', knightCount: 2, knightDance: 'off', knightFinish: 'gunmetal' });
    if (moment === 'drop') { show.start(kn); play(show, kn, 2); }
    Object.assign(settings, { knightCount: 4, knightHelmets: { great: false, armet: true, bascinet: false }, knightFinish: 'polished', knightShine: 'off', knightSeat: 'resting' });
    kn.moment = moment;
    if (moment === 'start') show.start(kn);
    else show.drop(kn, 'big', { budget: 1 });
    assert.equal(kn.list.filter((e) => e.present).length, 4, `${moment}: the new count`);
    assert.ok(kn.list.every((e) => !e.present || e.helmet === 'armet'), `${moment}: the helmets switched on`);
    assert.deepEqual([kn.finish, kn.seatPose], ['polished', 'resting']);
    const mark = kn.log.length;
    kn.moment = 'later';
    frames(show, kn);
    assert.deepEqual(kn.log.slice(mark).filter((e) => OPTION_LOG.includes(e[0])), [], `${moment}: nothing a frame later`);
  }
});

test('knight options: Armor Finish and Seat Pose in the mix roll only at the hidden moments; by hand, at once', () => {
  const { settings, show, kn } = showFor({ knights: 'on', knightCount: 2, knightFinish: 'mix', knightSeat: 'mix', knightGlow: 'on', knightRim: 0.3 }, { seed: 5 });
  assert.ok(['gunmetal', 'blackened', 'polished', 'burnished'].includes(kn.finish), 'a finish from the start');
  assert.ok(['resting', 'watchful'].includes(kn.seatPose));
  assert.equal(kn.rim, 0.3);
  kn.moment = 'start';
  show.start(kn);
  const mark = kn.log.length;
  kn.moment = 'song';
  play(show, kn, 24);
  assert.equal(kn.log.slice(mark).filter((e) => e[0] === 'finish' || e[0] === 'seat').length, 0, 'never mid-song');
  const finishes = new Set();
  const seats = new Set();
  for (let i = 0; i < 40; i++) {
    kn.moment = 'drop';
    show.drop(kn, 'big', { budget: 1 });
    finishes.add(kn.finish);
    seats.add(kn.seatPose);
    kn.moment = 'song';
    play(show, kn, 3, { from: 1 });
  }
  assert.equal(finishes.size, 4, 'every finish comes round');
  assert.equal(seats.size, 2);
  const rolled = kn.log.filter((e) => e[0] === 'finish' || e[0] === 'seat');
  assert.ok(rolled.every((e) => ['init', 'start', 'drop'].includes(e[2])), `only at hidden moments (${[...new Set(rolled.map((e) => e[2]))]})`);
  // By hand: at once, and then it holds.
  Object.assign(settings, { knightFinish: 'burnished', knightSeat: 'watchful', knightRim: 0.9 });
  kn.moment = 'hand';
  frames(show, kn, 1);
  assert.deepEqual([kn.finish, kn.seatPose, kn.rim], ['burnished', 'watchful', 0.9]);
  for (let i = 0; i < 6; i++) show.drop(kn, 'big', { budget: 1 });
  assert.deepEqual([kn.finish, kn.seatPose], ['burnished', 'watchful']);
  // Engines without the options (an older knights module) are fine.
  const bare = showFor({ knights: 'on' });
  delete bare.kn.setFinish; delete bare.kn.setRim; delete bare.kn.setSeatPose;
  bare.show.start(bare.kn);
  bare.show.drop(bare.kn, 'big');
});

test('Edge Glow: Off none, Always the Glow Strength, In the mix some stretches at a strength rolled round it, at the hidden moments only; by hand, at once', () => {
  for (const [glow, want] of [['off', 0], ['on', 0.8]]) {
    const { show, kn } = showFor({ knights: 'on', knightGlow: glow, knightRim: 0.8 });
    assert.equal(kn.rim, want, `${glow}: from the start`);
    show.start(kn);
    for (let i = 0; i < 12; i++) show.drop(kn, 'big', { budget: 1 });
    assert.equal(kn.rim, want, `${glow}: every drop`);
  }
  // In the mix (the default).
  assert.equal(DEFAULT_SETTINGS.knightGlow, 'mix');
  const { settings, show, kn } = showFor({ knights: 'on', knightCount: 2, knightRim: 0.5 }, { seed: 21 });
  kn.moment = 'start';
  show.start(kn);
  const mark = kn.log.length;
  kn.moment = 'song';
  play(show, kn, 24);
  assert.equal(kn.log.slice(mark).filter((e) => e[0] === 'rim').length, 0, 'never mid-song');
  const seen = [];
  for (let i = 0; i < 60; i++) {
    kn.moment = 'drop';
    show.drop(kn, 'big', { budget: 1 });
    seen.push(kn.rim);
    kn.moment = 'song';
    play(show, kn, 2, { from: 1 });
  }
  const lit = seen.filter((v) => v > 0);
  assert.ok(lit.length > 30 && lit.length < 60, `some stretches glow, some don't (${lit.length} of 60)`);
  assert.ok(new Set(lit).size > 8, `each at a strength of its own (${[...new Set(lit)].length})`);
  assert.ok(lit.every((v) => v >= 0.3 - 1e-9 && v <= 0.7 + 1e-9), `round the Glow Strength set (${Math.min(...lit)} to ${Math.max(...lit)})`);
  assert.equal(show.rim, kn.rim, 'the show says what it rolled');
  const rolled = kn.log.filter((e) => e[0] === 'rim');
  assert.ok(rolled.every((e) => ['init', 'start', 'drop'].includes(e[2])), `only at hidden moments (${[...new Set(rolled.map((e) => e[2]))]})`);
  // By hand: at once, whichever of the two is moved.
  Object.assign(settings, { knightGlow: 'on', knightRim: 0.9 });
  kn.moment = 'hand';
  frames(show, kn, 1);
  assert.equal(kn.rim, 0.9);
  settings.knightGlow = 'off';
  frames(show, kn, 1);
  assert.equal(kn.rim, 0);
  settings.knightGlow = 'on';
  settings.knightRim = 0.2;
  frames(show, kn, 1);
  assert.equal(kn.rim, 0.2);
  // A settings object from before the switch (no knightGlow): the strength, as it was.
  const old = showFor({ knights: 'on', knightRim: 0.6 });
  delete old.settings.knightGlow;
  old.show.retake(old.kn);
  assert.equal(old.kn.rim, 0.6);
});

test('knight options: Style (the site’s own, one of the styles, in the mix) rolls at the hidden moments, at once there; by hand, a restyle', () => {
  const { settings, show, kn } = showFor({ knights: 'on', knightCount: 2, knightStyle: 'site' }, { seed: 9 });
  assert.equal(kn.style, null, 'the site’s own: null to the engine');
  assert.equal(show.style, null);
  settings.knightStyle = 'mix';
  kn.moment = 'start';
  show.start(kn);
  const styles = new Set([kn.style]);
  const mark = kn.log.length;
  kn.moment = 'song';
  play(show, kn, 16);
  assert.equal(kn.log.slice(mark).filter((e) => e[0] === 'style').length, 0, 'never mid-song');
  const counts = {};
  for (let i = 0; i < 120; i++) {
    kn.moment = 'drop';
    show.drop(kn, 'big', { budget: 1 });
    styles.add(kn.style);
    counts[kn.style] = (counts[kn.style] ?? 0) + 1;
  }
  assert.deepEqual([...styles].sort(), [...STYLE_KEYS].sort(), 'every style comes round');
  assert.ok(counts[DEFAULT_STYLE] > Math.max(...STYLE_KEYS.filter((k) => k !== DEFAULT_STYLE).map((k) => counts[k] ?? 0)), `leaning to the site’s default: ${JSON.stringify(counts)}`);
  const rolled = kn.log.filter((e) => e[0] === 'style');
  assert.ok(rolled.every((e) => ['init', 'start', 'drop'].includes(e[2])), 'only at hidden moments');
  assert.ok(rolled.filter((e) => e[2] !== 'init').every((e) => e[3] === 'instant'), 'there at once, in the flash');
  // By hand: a restyle (they burn away and form again), then it holds. (A style other than
  // the one the last drop rolled, or there'd be nothing to change.)
  const byHand = kn.style === 'first' ? STYLE_KEYS.find((k) => k !== 'first') : 'first';
  settings.knightStyle = byHand;
  kn.moment = 'hand';
  frames(show, kn, 1);
  assert.equal(kn.style, byHand);
  assert.deepEqual(kn.log.filter((e) => e[0] === 'style').at(-1), ['style', byHand, 'hand', ''], 'by hand: the dissolve, not at once');
  for (let i = 0; i < 6; i++) show.drop(kn, 'big', { budget: 1 });
  assert.equal(kn.style, byHand);
  const calls = kn.log.filter((e) => e[0] === 'style').length;
  settings.knightStyle = 'site';
  frames(show, kn, 1);
  assert.equal(kn.style, null, 'back to the site’s own');
  frames(show, kn, 3);
  assert.equal(kn.log.filter((e) => e[0] === 'style').length, calls + 1, 'told once');
  assert.deepEqual(Object.keys(KNIGHT_STYLES), ['site', ...STYLE_KEYS]);
  assert.ok(Object.values(KNIGHT_STYLES).every((l) => /^[A-Z]/.test(l)), 'Title Case labels');
});

test('a move too wide for a dancer’s place (fire.knights.fits) gives way to one that fits there, or he turns to the fire for one', () => {
  // A stand-in for the engine's fits(): facing the cameras only the nod has room; facing the
  // fire, everything but the spin.
  const fits = (move, place, facing) => (facing === 'fire' ? move !== 'spin' : move === 'nod');
  let danced = 0;
  for (const formation of ['line', 'solo', 'ring', 'canon']) {
    for (let seed = 1; seed <= 6; seed++) {
      const { show, kn } = showFor({ knights: 'on', knightCount: 3, knightDance: 'on', knightFormation: formation, knightSummon: 'on' }, { seed: seed * 7 });
      kn.fits = (move, place, facing) => { assert.ok(place && Number.isFinite(place.x), 'asked about a place'); return fits(move, place, facing); };
      show.start(kn);
      const mark = kn.log.length;
      show.drop(kn, 'big');
      play(show, kn, 16, { budget: 1 });
      for (const e of dancesOf(kn.log, mark)) {
        danced++;
        assert.ok(fits(e[2].move, e[2].position, e[2].facing), `${formation}: ${e[2].move} facing the ${e[2].facing} fits`);
      }
    }
  }
  assert.ok(danced > 40, `they danced (${danced})`);
});

test('without fire.knights.fits (a scene that doesn’t pass it on), the show asks the scenery’s shapes itself: every move danced has room at its place', () => {
  let danced = 0, swapped = 0;
  for (const scenery of ['cult', 'shrine', 'cathedral']) {
    for (const formation of ['line', 'solo', 'ring', 'canon']) {
      for (let seed = 1; seed <= 4; seed++) {
        const { show, kn } = showFor({ knights: 'on', knightCount: 4, knightDance: 'on', knightFormation: formation, knightSummon: 'on' }, { seed: seed * 5, scenery });
        assert.equal(kn.fits, undefined, 'the stand-in scene has no fits()');
        show.start(kn, { scenery });
        const mark = kn.log.length;
        show.drop(kn, 'big');
        play(show, kn, 16, { budget: 1 });
        for (const e of dancesOf(kn.log, mark)) {
          const { move, position: at, facing } = e[2];
          if (!at) continue;
          danced++;
          const room = roomAround(scenery, at.x, at.z, facingYaw(at.x, at.z, facing));
          assert.ok(reachFits(move, room), `${scenery} ${formation}: ${move} facing the ${facing} at (${at.x.toFixed(2)}, ${at.z.toFixed(2)}) has room`);
          if (!reachFits('spin', room)) swapped++;
        }
      }
    }
  }
  assert.ok(danced > 100, `they danced (${danced})`);
  assert.ok(swapped > 0, `some places are too tight for a spin (${swapped}): the filter had work to do`);
});

test('the scene passes the engine’s fits() on in its knights API (sceneKnight.js; the show’s move filter asks it)', async () => {
  const src = await readFile(new URL('../src/bonfire/sceneKnight.js', import.meta.url), 'utf8');
  const api = src.slice(src.indexOf('slots: (name) => ctx.knights?.slots('), src.indexOf('// --- Debug HUD'));
  const line = 'fits: (move, at, facing, name) => ctx.knights?.fits(move, at, facing, name ?? ctx.sceneryKey) ?? true,';
  assert.ok(api.includes(line), `the knights API has \`${line}\` after \`slots\``);
});

test('the Default Dance is one of the groove’s moves (8 beats a cycle)', () => {
  assert.equal(KNIGHT_MOVES.defaultDance, 'Default Dance');
  assert.equal(MOVE_CYCLE.defaultDance, 8);
  const { show, kn } = showFor({ knights: 'on', knightCount: 2, knightDance: 'on', knightMoves: Object.fromEntries(Object.keys(KNIGHT_MOVES).map((m) => [m, m === 'defaultDance'])) });
  show.start(kn);
  show.drop(kn, 'big', { budget: 1 });
  play(show, kn, 6, { from: 1 });
  const moves = new Set(dancesOf(kn.log).map((e) => e[2].move).filter(Boolean));
  assert.deepEqual([...moves], ['defaultDance'], 'the only move switched on');
});
