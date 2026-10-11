// The director's status() (src/visualizer/director.js): what the show is doing, in one small
// read-only snapshot for the stats overlay (src/ui/statsGroups.js turns it into rows). Built
// only when asked, from what the show already keeps: asking draws no dice, so the show plays
// the same with the overlay on or off. On the shared stand-in scene (test/lib/fakeScene.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directorFor, bars, FRAME } from './lib/fakeScene.mjs';
import { LAYERS, DROP_FX } from '../src/visualizer/looks.js';
import { defaultScene, normalizeScene } from '../src/scenes.js';

/** Every layer off but Glow (Always) and Ghosting (In the Mix). */
const LAYERS_SET = { ...Object.fromEntries(Object.keys(LAYERS).map((k) => [k, 'off'])), glow: 'on', ghost: 'mix' };

test('director status: the section, from silence through the groove, a breakdown, a build and the drop', () => {
  const { director } = directorFor();
  director.update({ ...FRAME, state: 'silent', events: ['silence'] }, 0.016);
  assert.equal(director.status().section, 'silent');
  bars(director, 2, { first: ['start'] });
  let s = director.status();
  assert.equal(s.section, 'groove');
  bars(director, 2, { from: 3, state: 'breakdown', first: ['breakdown'] });
  assert.equal(director.status().section, 'breakdown');
  bars(director, 1, { from: 5, state: 'build', first: ['build'], level: 0.4 });
  assert.equal(director.status().section, 'build');
  bars(director, 1, { from: 6, first: ['drop'] });
  s = director.status();
  assert.equal(s.section, 'groove');
  assert.equal(s.sinceDrop, 0, 'the drop’s own bar');
  bars(director, 2, { from: 7 });
  assert.equal(director.status().sinceDrop, 2);
});

test('director status: the budget as the director has it (null with the budget off)', () => {
  const { director } = directorFor();
  bars(director, 2, { first: ['start'] });
  const b = director.status().budget;
  assert.ok(b > 0 && b <= 1, `${b}`);
  assert.equal(b, director.budget);
  const off = directorFor({ budget: false }).director;
  assert.equal(off.status().budget, null);
});

test('director status: the look and its strength; the layers live now, each with its switch’s mode', () => {
  // A clean picture (Effects Strength 0): no layer is live, whatever its switch says.
  const clean = directorFor({ ...LAYERS_SET, glitch: 0 }).director;
  bars(clean, 2, { first: ['start'] });
  assert.deepEqual(clean.status().layers, []);
  assert.equal(clean.status().look.strength, 0);
  const { director } = directorFor(LAYERS_SET);
  bars(director, 2, { first: ['start'] });
  const s = director.status();
  assert.ok(s.look.names.length >= 1 && s.look.names.every((n) => typeof n === 'string'));
  assert.ok(s.look.strength > 0, `${s.look.strength}`);
  assert.equal(s.look.pinned, false);
  assert.deepEqual(
    s.layers.find((l) => l.name === LAYERS.glow),
    { name: LAYERS.glow, mode: 'on' },
    'Glow is Always',
  );
  for (const l of s.layers)
    assert.ok(
      (l.name === LAYERS.glow && l.mode === 'on') || (l.name === LAYERS.ghost && l.mode === 'mix'),
      `${l.name} (${l.mode})`,
    );
});

test('director status: a drop’s hits, named, with how long ago they were thrown', () => {
  const { director } = directorFor();
  assert.equal(director.status().dropHits, null);
  bars(director, 2, { first: ['start'] });
  bars(director, 1, { from: 3, first: ['drop'] });
  const { dropHits } = director.status();
  assert.ok(dropHits?.names.length >= 1, 'a drop throws at least one');
  for (const n of dropHits.names) assert.ok(Object.values(DROP_FX).includes(n), n);
  assert.ok(dropHits.ago >= 0 && dropHits.ago < 1, `${dropHits.ago}`);
});

test('director status: the knights, the shot, the scene playing and the loop', () => {
  const { director } = directorFor({ knights: 'on', knightCount: 2 });
  bars(director, 2, { first: ['start'] });
  let s = director.status();
  assert.equal(typeof s.knights.present, 'number');
  assert.equal(typeof s.knights.dancing, 'number');
  assert.equal(typeof s.knights.mode, 'string');
  assert.ok(typeof s.shot === 'string' && s.shot.length > 0, s.shot);
  assert.equal(s.scene, null, 'the free show');
  assert.deepEqual(s.loop, { mode: 'mix', locked: false, next: null, when: null });
  director.scene(normalizeScene(defaultScene('Ash Garden')), { instant: true });
  s = director.status();
  assert.equal(s.scene.name, 'Ash Garden');
  assert.ok(['hold', 'base'].includes(s.scene.mode));
  assert.equal(directorFor({ scenes: 'off' }).director.status().loop.mode, 'off');
});

test('director status: asking draws no dice and changes nothing (the show plays the same with the overlay on)', () => {
  const { director } = directorFor(LAYERS_SET);
  bars(director, 2, { first: ['start'] });
  bars(director, 1, { from: 3, first: ['drop'] });
  const random = Math.random;
  let draws = 0;
  Math.random = () => {
    draws++;
    return random();
  };
  try {
    const a = director.status();
    const b = director.status();
    assert.equal(draws, 0);
    assert.deepEqual({ ...a, dropHits: null }, { ...b, dropHits: null });
  } finally {
    Math.random = random;
  }
});
