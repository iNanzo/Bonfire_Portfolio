// The stats overlay's text (src/ui/statsGroups.js): a snapshot of the frames, the particles
// and, in Bonfire Live and the Painter, the show (the director's status()) turned into short
// groups of rows. Frames first, then the particles (only the systems running, the fireflies as
// lit of all of them), then the show: the section, the budget, the look and its strength, the
// layers live now and whether each is in by In the Mix or Always, the drop hits while they
// fire, the knights, the shot and the preset scene with its loop. The Painter's group is the
// scene being painted. Pure: the overlay (src/ui/perfOverlay.js) draws what it hands back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statsGroups, DROP_HITS_FOR, FREE_SHOW } from '../src/ui/statsGroups.js';

const FRAMES = {
  fps: 143.6,
  cap: 0,
  p50: 6.94,
  p95: 9.71,
  draws: 190,
  shadows: 12,
  parts: { tick: 0.18, page: 0.08, update: 1.06, draw: 2.84 },
  gpu: { programs: 24, textures: 12, geometries: 104 },
};
const PARTICLES = [
  { name: 'Bonfire flames', live: 2400, total: 3000 },
  { name: 'Bonfire sparks', live: 0, total: 400 },
  { name: 'Lightning ball', live: 0, total: 1200 },
  { name: 'Forge (weapon swap)', live: 830, total: 1200 },
  { name: 'Fireflies', live: 12, total: 40, unit: 'lit' },
  { name: 'Bolts', live: 0, total: 3200, unit: 'segments' },
  { name: 'Knights', live: 3, total: 4, cast: true },
];
/** A status as the director's status() makes it: the groove, two layers in the mix and one always. */
const SHOW = {
  section: 'groove',
  sinceDrop: 12,
  stage: 0,
  budget: 0.853,
  look: { names: ['Echo', 'Haze'], strength: 0.82, pinned: false },
  layers: [
    { name: 'Glow', mode: 'mix' },
    { name: 'Ghosting', mode: 'mix' },
    { name: 'Scanlines', mode: 'on' },
  ],
  xray: null,
  dropHits: null,
  knights: { present: 3, dancing: 2, mode: 'dance' },
  shot: 'Clearing',
  scene: null,
  loop: { mode: 'mix', locked: false, next: null, when: null },
};
const groupsOf = (snap) => statsGroups(snap);
const group = (snap, id) => groupsOf(snap).find((g) => g.id === id);
/** A group's rows as { label: value }. */
const rows = (g) => Object.fromEntries((g?.rows ?? []).map((r) => [r.label, r.value]));

test('stats: Frames, then Particles, then the show, each a titled group of rows', () => {
  const gs = groupsOf({ frames: FRAMES, particles: PARTICLES, show: SHOW });
  assert.deepEqual(
    gs.map((g) => [g.id, g.title]),
    [
      ['frames', 'Frames'],
      ['particles', 'Particles'],
      ['show', 'Show'],
    ],
  );
  for (const g of gs)
    for (const r of g.rows) {
      assert.equal(typeof r.label, 'string');
      assert.ok(r.value.length > 0 && r.value.length <= 90, `${g.id} ${r.label}: "${r.value}"`);
    }
  // The site (?perf): no show of its own.
  assert.deepEqual(
    groupsOf({ frames: FRAMES, particles: PARTICLES }).map((g) => g.id),
    ['frames', 'particles'],
  );
});

test('stats: Frames reads at a glance (rate, frame time, draws), the parts and the GPU dimmed under them', () => {
  const g = group({ frames: FRAMES }, 'frames');
  assert.deepEqual(rows(g), {
    Rate: '144 fps',
    Frame: '6.9 ms · p95 9.7',
    Draws: '190 · 12 shadows/s',
    Parts: 'tick 0.18 · page 0.08 · update 1.06 · draw 2.84 ms',
    GPU: '24 programs · 12 textures · 104 geometries',
  });
  assert.deepEqual(
    g.rows.filter((r) => r.dim).map((r) => r.label),
    ['Parts', 'GPU'],
  );
  // A cap says so; a page with no onTick (the site, the Painter) has no tick.
  const capped = rows(
    group({ frames: { ...FRAMES, fps: 59.8, cap: 60, parts: { ...FRAMES.parts, tick: null } } }, 'frames'),
  );
  assert.equal(capped.Rate, '60 fps (cap 60)');
  assert.equal(capped.Parts, 'page 0.08 · update 1.06 · draw 2.84 ms');
});

test('stats: Particles lists only the systems running, the fireflies lit of all, the total live in its note', () => {
  const g = group({ frames: FRAMES, particles: PARTICLES }, 'particles');
  assert.deepEqual(rows(g), {
    'Bonfire flames': '2,400 / 3,000',
    'Forge (weapon swap)': '830 / 1,200',
    Fireflies: '12 lit / 40',
  });
  assert.equal(g.note, '3,230 live', 'the particles alone (not the fireflies or bolts)');
  // Nothing shown for a system that isn't running: no sparks, no ball, no bolts, and the
  // knights are the show's, not particles.
  for (const name of ['Bonfire sparks', 'Lightning ball', 'Bolts', 'Knights']) assert.ok(!(name in rows(g)), name);
  const bolts = rows(
    group({ frames: FRAMES, particles: [{ name: 'Bolts', live: 1234, total: 3200, unit: 'segments' }] }, 'particles'),
  );
  assert.equal(bolts.Bolts, '1,234 / 3,200 segments');
  // None running at all: no group.
  assert.equal(group({ frames: FRAMES, particles: PARTICLES.map((p) => ({ ...p, live: 0 })) }, 'particles'), undefined);
});

test('stats: the show names the section, the budget, the look and its strength', () => {
  const r = rows(group({ frames: FRAMES, show: SHOW }, 'show'));
  assert.equal(r.Section, 'Groove');
  assert.equal(r.Budget, '85%');
  assert.equal(r.Look, 'Echo + Haze · 82%');
  assert.equal(r.Shot, 'Clearing');
  const section = (over) => rows(group({ frames: FRAMES, show: { ...SHOW, ...over } }, 'show')).Section;
  assert.equal(section({ section: 'silent' }), 'Silence');
  assert.equal(section({ section: 'groove', sinceDrop: 0 }), 'Drop · bar 1 of 8');
  assert.equal(section({ section: 'groove', sinceDrop: 7 }), 'Drop · bar 8 of 8');
  assert.equal(section({ section: 'groove', sinceDrop: 8 }), 'Groove');
  assert.equal(section({ section: 'groove', sinceDrop: null }), 'Groove');
  assert.equal(section({ section: 'breakdown', stage: 0 }), 'Breakdown');
  assert.equal(section({ section: 'build', stage: 2 }), 'Build · stage 2 of 4');
  const show = (over) => rows(group({ frames: FRAMES, show: { ...SHOW, ...over } }, 'show'));
  assert.equal(show({ budget: null }).Budget, 'Off');
  assert.equal(show({ look: { names: ['Ember'], strength: 0, pinned: false } }).Look, 'Ember · 0%');
  assert.equal(
    show({ look: { names: ['Kaleido'], strength: 1.2, pinned: true } }).Look,
    'Kaleido · 120% (the scene’s)',
  );
});

test('stats: the layers live now, each marked In the Mix or Always; none says so', () => {
  const r = rows(group({ frames: FRAMES, show: SHOW }, 'show'));
  assert.equal(r.Layers, 'Glow, Ghosting (In the Mix) · Scanlines (Always)');
  const only = (layers) => rows(group({ frames: FRAMES, show: { ...SHOW, layers } }, 'show')).Layers;
  assert.equal(only([{ name: 'Mirror', mode: 'on' }]), 'Mirror (Always)');
  assert.equal(only([{ name: 'Painterly', mode: 'mix' }]), 'Painterly (In the Mix)');
  assert.equal(only([]), 'None');
  // An x-ray flip shows while it's on.
  assert.equal(rows(group({ frames: FRAMES, show: { ...SHOW, xray: 'Normals' } }, 'show'))['X-Ray'], 'Normals');
  assert.ok(!('X-Ray' in r));
});

test('stats: the drop hits show while they fire, then go', () => {
  const hits = (ago) =>
    rows(group({ frames: FRAMES, show: { ...SHOW, dropHits: { names: ['Shatter', 'Spiral'], ago } } }, 'show'))[
      'Drop Hits'
    ];
  assert.equal(hits(0.2), 'Shatter, Spiral');
  assert.equal(hits(DROP_HITS_FOR - 0.1), 'Shatter, Spiral');
  assert.equal(hits(DROP_HITS_FOR + 0.1), undefined);
  assert.equal(
    rows(group({ frames: FRAMES, show: { ...SHOW, dropHits: { names: [], ago: 0 } } }, 'show'))['Drop Hits'],
    undefined,
  );
});

test('stats: the knights here and what they do (none: no row)', () => {
  const knights = (k) => rows(group({ frames: FRAMES, show: { ...SHOW, knights: k } }, 'show')).Knights;
  assert.equal(knights({ present: 3, dancing: 2, mode: 'dance' }), '3 · 2 dancing');
  assert.equal(knights({ present: 4, dancing: 4, mode: 'dance' }), '4 · dancing');
  assert.equal(knights({ present: 1, dancing: 0, mode: 'rest' }), '1 · resting');
  assert.equal(knights({ present: 2, dancing: 0, mode: 'watch' }), '2 · watching the blade');
  assert.equal(knights({ present: 2, dancing: 0, mode: 'ready' }), '2 · up');
  assert.equal(knights({ present: 0, dancing: 0, mode: 'rest' }), undefined);
});

test('stats: the preset scene playing (or the free show) and the loop, with what comes next', () => {
  const r = rows(group({ frames: FRAMES, show: SHOW }, 'show'));
  // (By the name the HUD's Scene line gives it, beside the overlay on the same screen.)
  assert.equal(r.Scene, 'The Free Show');
  assert.equal(r.Scene, FREE_SHOW);
  const hud = readFileSync(new URL('../src/visualizer/scenesUi.js', import.meta.url), 'utf8');
  assert.ok(hud.includes(`'${FREE_SHOW}'`), 'the HUD’s Scene line says the same');
  assert.equal(r.Loop, 'In the Mix');
  const show = (over) => rows(group({ frames: FRAMES, show: { ...SHOW, ...over } }, 'show'));
  assert.equal(show({ scene: { name: 'Frozen Shrine', mode: 'hold' } }).Scene, 'Frozen Shrine (Hold)');
  assert.equal(show({ scene: { name: 'Ember Rain', mode: 'base' } }).Scene, 'Ember Rain (Base)');
  assert.equal(show({ loop: { mode: 'off', locked: false, next: null, when: null } }).Loop, 'Off');
  assert.equal(show({ loop: { mode: 'on', locked: true, next: null, when: null } }).Loop, 'Always · solo');
  assert.equal(
    show({ loop: { mode: 'mix', locked: false, next: 'Forge Night', when: 'drop' } }).Loop,
    'In the Mix · next: Forge Night, at the drop',
  );
  assert.equal(
    show({ loop: { mode: 'on', locked: false, next: null, when: 'beat' } }).Loop,
    'Always · next: The Free Show, on the downbeat',
  );
});

test('stats: the Painter’s group is the scene being painted: its name and what’s live in it, no loop', () => {
  // (The Painter's look is always the scene's, pinned: it isn't marked as such there.)
  const painted = { ...SHOW, look: { ...SHOW.look, pinned: true } };
  const gs = groupsOf({ frames: FRAMES, particles: PARTICLES, show: painted, painting: 'Ash Garden' });
  assert.deepEqual(
    gs.map((g) => [g.id, g.title]),
    [
      ['frames', 'Frames'],
      ['particles', 'Particles'],
      ['show', 'Scene'],
    ],
  );
  const g = gs[2];
  assert.equal(g.rows[0].label, 'Painting');
  assert.equal(g.rows[0].value, 'Ash Garden');
  const r = rows(g);
  assert.equal(r.Layers, 'Glow, Ghosting (In the Mix) · Scanlines (Always)');
  assert.equal(r.Look, 'Echo + Haze · 82%', 'its own look, not marked as a scene’s');
  for (const k of ['Scene', 'Loop']) assert.ok(!(k in r), k);
});
