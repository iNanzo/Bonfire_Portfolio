// NEWT's lines in the invitation toy (src/invitation/speech.js), driven frame by frame the way
// main.js drives it: the brain's output each frame (state, clip, reaction, face), the gestures,
// the buttons and the camera. It checks every trigger of the plan's table (taps, running,
// carried, moving, sitting, idle time, the camera spun round or zoomed in close) speaks from its
// moment and only then, each trigger's chance and cooldown, no line twice in a row, one bubble at
// a time (a new line only over a lower one), the idle clock, the settings read from anything
// (content.json's, or missing), and how long a line stays up. The lines here are the test's own:
// the real ones are the admin's (content.json), never pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIORITY,
  SPEECH_DEFAULTS,
  SPEECH_RANGES,
  TALK,
  TRIGGERS,
  createTalk,
  lineDuration,
  linesFrom,
  speechFrom,
} from '../src/invitation/speech.js';
import { createRng } from '../src/invitation/rng.js';

const DT = 1 / 60;
const TAU = Math.PI * 2;

/**
 * Every trigger at chance 1 and no cooldown, so a test sees each moment; the idle clock far off
 * unless a test sets it (`idle`, seconds).
 */
function always(idle = [170, 180]) {
  return {
    idleEvery: idle,
    triggers: Object.fromEntries(TRIGGERS.map((k) => [k, { chance: 1, cooldown: 0 }])),
  };
}
/** Three lines a trigger, named for it. */
const LINES = Object.fromEntries(TRIGGERS.map((k) => [k, [`${k} one`, `${k} two`, `${k} three`]]));

/** What the brain says each frame (types.js BrainOut, the parts speech reads). */
function brain(state, more = {}) {
  return {
    state,
    clip: 'gait',
    restart: false,
    reaction: null,
    face: 'neutral',
    faceCamera: false,
    ...more,
  };
}
const react = (which, more = {}) => brain('react', { reaction: which, ...more });

/**
 * A stand-in page: steps the talk at 60 fps; `frame(state, extra)` runs one frame and returns
 * what it said. `wait(s, state)` runs frames with nothing new for s seconds and collects the
 * lines said.
 */
function page({ speech = always(), lines = LINES, seed = 1 } = {}) {
  const talk = createTalk({ lines, speech, rng: createRng(seed) });
  const p = {
    t: 0,
    prev: /** @type {any} */ (null),
    camera: { yaw: 0, zoom: 1 },
    talk,
    /** @param {any} state @param {{events?: any[], button?: string|null, camera?: any, dt?: number}} [o] */
    frame(state, { events = [], button = null, camera = undefined, dt = DT } = {}) {
      p.t += dt;
      if (camera) p.camera = camera;
      const out = talk.step({ t: p.t, dt, state, prevState: p.prev, events, camera: p.camera, button });
      p.prev = state;
      return out;
    },
    /** @param {number} s @param {any} state */
    wait(s, state) {
      const said = [];
      const n = Math.round(s / DT);
      for (let i = 0; i < n; i++) {
        const out = p.frame(state);
        if (out.say) said.push({ ...out, t: p.t });
      }
      return said;
    },
  };
  // (A first frame: nothing has changed yet, so nothing is said.)
  assert.deepEqual(p.frame(brain('idle')), { say: null, trigger: null }, 'the first frame says nothing');
  return p;
}
/** Past any bubble still up. */
const later = (p, state = brain('idle')) => p.wait(TALK.hold + 12, state);

test('the triggers are the plan’s, each with a priority, a default chance and cooldown', () => {
  assert.deepEqual([...TRIGGERS].sort(), [
    'caught',
    'dropped',
    'flee',
    'idle',
    'landed',
    'pickedUp',
    'shaken',
    'sitDown',
    'sitting',
    'spin',
    'spook',
    'standUp',
    'walkTo',
    'wander',
    'wave',
    'zoom',
  ]);
  const [cMin, cMax] = SPEECH_RANGES.chance;
  const [dMin, dMax] = SPEECH_RANGES.cooldown;
  for (const k of TRIGGERS) {
    assert.equal(typeof PRIORITY[k], 'number', `${k}: a priority`);
    const d = SPEECH_DEFAULTS.triggers[k];
    assert.ok(d.chance >= cMin && d.chance <= cMax, `${k}: chance in range`);
    assert.ok(d.cooldown >= dMin && d.cooldown <= dMax, `${k}: cooldown in range`);
  }
  const [lo, hi] = SPEECH_DEFAULTS.idleEvery;
  assert.deepEqual([lo, hi], [20, 40], 'idle lines every 20 to 40 s');
  // Being caught or shaken outranks a tap's wave; idle time is the least.
  assert.ok(PRIORITY.caught > PRIORITY.flee && PRIORITY.shaken > PRIORITY.pickedUp);
  assert.ok(PRIORITY.spook >= PRIORITY.wave && PRIORITY.wave > PRIORITY.wander);
  assert.equal(Math.min(...TRIGGERS.map((k) => PRIORITY[k])), PRIORITY.idle);
});

test('a tap’s wave or spook speaks as the reaction starts, not again when its clip starts after the turn', () => {
  for (const which of ['Wave', 'Spook']) {
    const p = page();
    // (The reaction starts with a turn to the camera: no clip yet.)
    const out = p.frame(react(which, { faceCamera: true }));
    assert.equal(out.trigger, which.toLowerCase());
    assert.ok(LINES[out.trigger].includes(out.say), 'one of its lines');
    later(p, react(which, { faceCamera: true }));
    // (The turn done, the clip starts from 0: the same reaction.)
    assert.equal(p.frame(react(which, { clip: which, restart: true })).say, null, `${which}: once`);
  }
  // A reaction facing the camera already starts its clip at once; another tap restarts it.
  const p = page();
  assert.equal(p.frame(react('Wave', { clip: 'Wave', restart: true })).trigger, 'wave');
  later(p, react('Wave', { clip: 'Wave' }));
  assert.equal(p.frame(react('Spook', { clip: 'Spook', restart: true })).trigger, 'spook', 'a new reaction');
  later(p, react('Spook', { clip: 'Spook' }));
  assert.equal(p.frame(react('Spook', { clip: 'Spook', restart: true })).trigger, 'spook', 'the same, again');
  later(p, react('Spook', { clip: 'Spook' }));
  // Tapped while not facing the camera: the turn comes first, and that's the new reaction.
  assert.equal(p.frame(react('Wave', { faceCamera: true })).trigger, 'wave');
});

test('running, being carried, landing: each change of state speaks once', () => {
  const cases = [
    ['flee', [brain('idle'), brain('flee')]],
    ['caught', [brain('flee'), brain('held', { clip: 'Held', face: 'surprised' })]],
    ['pickedUp', [brain('idle'), brain('held', { clip: 'Held', face: 'surprised' })]],
    ['pickedUp', [brain('sit'), brain('held', { clip: 'Held', face: 'surprised' })]],
    ['dropped', [brain('held', { clip: 'Held' }), brain('fall', { clip: 'Fall', face: 'surprised' })]],
    ['landed', [brain('fall', { clip: 'Fall' }), brain('land', { clip: 'Land', face: 'surprised' })]],
    ['standUp', [brain('sit', { clip: 'Sit' }), brain('standUp', { clip: 'StandUp' })]],
  ];
  for (const [want, frames] of cases) {
    const p = page();
    // (The state before may speak too: its line comes down first.)
    for (const f of frames.slice(0, -1)) p.frame(f);
    later(p, frames.at(-2));
    const out = p.frame(frames.at(-1));
    assert.equal(out.trigger, want, `${frames.map((f) => f.state).join(' → ')}: ${want}`);
    assert.ok(LINES[want].includes(out.say));
    later(p, frames.at(-1));
    assert.equal(p.frame(frames.at(-1)).say, null, `${want}: not again while it lasts`);
  }
});

test('shaken: his face going surprised again while he’s held (after the grab’s own surprise)', () => {
  const p = page();
  p.frame(brain('held', { clip: 'Held', face: 'surprised' }));
  later(p, brain('held', { clip: 'Held', face: 'surprised' }));
  assert.equal(p.frame(brain('held', { clip: 'Held', face: 'neutral' })).say, null);
  const out = p.frame(brain('held', { clip: 'Held', face: 'surprised' }));
  assert.equal(out.trigger, 'shaken');
  // Running's surprised face, or a landing's, isn't a shake.
  const q = page();
  q.frame(brain('flee', { face: 'surprised' }));
  later(q, brain('idle'));
  q.frame(brain('land', { face: 'neutral' }));
  later(q, brain('land', { face: 'neutral' }));
  assert.notEqual(q.frame(brain('land', { face: 'surprised' })).trigger, 'shaken');
});

test('walking: to a floor tap (also after getting up first) or wandering off by himself', () => {
  const tap = { type: 'tap', on: 'floor', x: 100, y: 200, t: 0, floor: { x: 1, z: 0 } };
  let p = page();
  assert.equal(p.frame(brain('walk'), { events: [tap] }).trigger, 'walkTo');
  later(p, brain('walk'));
  // Another floor tap while he walks: a new goal, the same state.
  assert.equal(p.frame(brain('walk'), { events: [tap] }).trigger, 'walkTo');
  later(p, brain('idle'));
  assert.equal(p.frame(brain('walk')).trigger, 'wander', 'no tap: he wandered');
  // Sitting, a floor tap gets him up first; the walk that follows is still the tap's. (Getting
  // up says nothing here, so its line isn't up over the walk's.)
  const quietUp = always();
  quietUp.triggers.standUp = { chance: 0, cooldown: 0 };
  p = page({ speech: quietUp });
  p.frame(brain('sit', { clip: 'Sit' }));
  later(p, brain('sit', { clip: 'Sit' }));
  assert.equal(p.frame(brain('standUp', { clip: 'StandUp' }), { events: [tap] }).say, null);
  p.wait(1.4, brain('standUp', { clip: 'StandUp' }));
  assert.equal(p.frame(brain('walk')).trigger, 'walkTo');
  // A tap long gone doesn't make a later wander his.
  p = page();
  p.frame(brain('idle'), { events: [tap] });
  p.wait(TALK.walkWindow + 1, brain('idle'));
  assert.equal(p.frame(brain('walk')).trigger, 'wander');
  // A tap on NEWT himself isn't a floor tap.
  p = page();
  assert.equal(p.frame(brain('walk'), { events: [{ ...tap, on: 'newt' }] }).trigger, 'wander');
});

test('sitting down by himself speaks; the Sit button doesn’t', () => {
  let p = page();
  assert.equal(p.frame(brain('sitDown', { faceCamera: true })).trigger, 'sitDown');
  p = page();
  assert.equal(p.frame(brain('sitDown', { faceCamera: true }), { button: 'Sit' }).say, null);
  // (The button a moment before the brain turns him counts too.)
  p = page();
  p.frame(brain('idle'), { button: 'Sit' });
  assert.equal(p.frame(brain('sitDown', { faceCamera: true })).say, null);
});

test('idle time: a line every 20 to 40 s while he stands about; still sitting has its own', () => {
  const speech = always([20, 40]);
  const p = page({ speech });
  const said = p.wait(120, brain('idle'));
  assert.ok(said.length >= 2, `${said.length} idle lines in two minutes`);
  for (const s of said) assert.equal(s.trigger, 'idle');
  const [lo, hi] = [20, 40];
  // (Counted from the first frame; then from when the last line came down.)
  assert.ok(said[0].t >= lo && said[0].t <= hi + 2 * DT, `the first at ${said[0].t.toFixed(1)} s`);
  for (let i = 1; i < said.length; i++) {
    const gap = said[i].t - said[i - 1].t - lineDuration(said[i - 1].say);
    assert.ok(gap >= lo - DT && gap <= hi + 2 * DT, `then ${gap.toFixed(1)} s after it came down`);
  }
  const q = page({ speech });
  q.frame(brain('sit', { clip: 'Sit' }));
  const sat = q.wait(90, brain('sit', { clip: 'Sit' }));
  assert.ok(sat.length >= 1);
  for (const s of sat) assert.equal(s.trigger, 'sitting', 'still sitting a while');
  // Busy (held, running), the idle clock waits.
  const r = page({ speech });
  assert.deepEqual(
    r.wait(60, brain('held', { clip: 'Held' })).map((s) => s.trigger),
    ['pickedUp'],
    'nothing idle while he’s held',
  );
});

test('the camera: spun round a lot, or zoomed in very close', () => {
  let p = page();
  // A slow turn (a quarter a second) never counts; a fast spin does.
  for (let i = 0; i < 240; i++) {
    const out = p.frame(brain('idle'), { camera: { yaw: (i * DT * TAU) / 4, zoom: 1 } });
    assert.notEqual(out.trigger, 'spin', 'a slow turn');
  }
  p = page();
  let spun = null;
  for (let i = 0; i < 120 && !spun; i++) {
    const out = p.frame(brain('idle'), { camera: { yaw: i * DT * TAU, zoom: 1 } });
    if (out.trigger === 'spin') spun = (i * DT * TAU) / TAU;
  }
  assert.ok(spun !== null && spun >= TALK.spinTurns * 0.9, `spun after ${spun?.toFixed(2)} turns`);
  // Wrapping round ±π is still the same way.
  p = page();
  let wrapped = false;
  for (let i = 0; i < 120 && !wrapped; i++) {
    const yaw = Math.atan2(Math.sin(-i * DT * TAU), Math.cos(-i * DT * TAU));
    if (p.frame(brain('idle'), { camera: { yaw, zoom: 1 } }).trigger === 'spin') wrapped = true;
  }
  assert.ok(wrapped, 'a spin the other way, wrapping');
  // Zoom: in close speaks once; back out and in again speaks again.
  p = page();
  assert.equal(p.frame(brain('idle'), { camera: { yaw: 0, zoom: 0.8 } }).say, null, 'a little closer');
  assert.equal(p.frame(brain('idle'), { camera: { yaw: 0, zoom: TALK.zoomClose - 0.02 } }).trigger, 'zoom');
  later(p);
  assert.equal(p.frame(brain('idle'), { camera: { yaw: 0, zoom: 0.5 } }).say, null, 'still close: once');
  p.frame(brain('idle'), { camera: { yaw: 0, zoom: 1 } });
  later(p);
  assert.equal(p.frame(brain('idle'), { camera: { yaw: 0, zoom: 0.5 } }).trigger, 'zoom');
});

test('chance: 0 never speaks, 1 always, between about that share', () => {
  const run = (chance, n = 400) => {
    const speech = always();
    speech.triggers.flee = { chance, cooldown: 0 };
    const p = page({ speech, seed: 7 });
    let said = 0;
    for (let i = 0; i < n; i++) {
      p.frame(brain('idle'));
      if (p.frame(brain('flee')).say) said++;
      p.wait(lineDuration('flee three') + 0.1, brain('flee'));
      p.frame(brain('idle'));
    }
    return said / n;
  };
  assert.equal(run(0), 0);
  assert.equal(run(1), 1);
  const half = run(0.5);
  assert.ok(half > 0.4 && half < 0.6, `about half: ${half}`);
});

test('cooldown: a trigger that just spoke waits its cooldown out', () => {
  const speech = always();
  speech.triggers.wave = { chance: 1, cooldown: 20 };
  const p = page({ speech });
  assert.equal(p.frame(react('Wave', { faceCamera: true })).trigger, 'wave');
  p.wait(10, brain('idle'));
  assert.equal(p.frame(react('Wave', { faceCamera: true })).say, null, '10 s on: still cooling down');
  p.wait(10.5, brain('idle'));
  assert.equal(p.frame(react('Wave', { faceCamera: true })).trigger, 'wave', 'after 20 s');
  // (Another trigger isn't held back by wave's.)
  later(p);
  assert.equal(p.frame(react('Spook', { faceCamera: true })).trigger, 'spook');
});

test('no line twice in a row: every line comes up, never the one just said', () => {
  const p = page({ seed: 3 });
  const said = [];
  for (let i = 0; i < 200; i++) {
    const out = p.frame(react(i % 2 ? 'Wave' : 'Spook', { faceCamera: true }));
    if (out.say) said.push(out.say);
    p.wait(lineDuration('spook three') + 0.1, brain('idle'));
    p.frame(brain('idle'));
  }
  assert.ok(said.length >= 190);
  for (let i = 1; i < said.length; i++) assert.notEqual(said[i], said[i - 1], `line ${i}`);
  for (const l of [...LINES.wave, ...LINES.spook]) assert.ok(said.includes(l), `“${l}” came up`);
  // With one line, it never follows itself (it waits for another first).
  const solo = page({ lines: { ...LINES, flee: ['only one'] } });
  assert.equal(solo.frame(brain('flee')).say, 'only one');
  later(solo, brain('idle'));
  assert.equal(solo.frame(brain('flee')).say, null, 'not twice running');
  later(solo, brain('idle'));
  assert.ok(solo.frame(react('Wave', { faceCamera: true })).say);
  later(solo, brain('idle'));
  assert.equal(solo.frame(brain('flee')).say, 'only one', 'fine once something else was said');
});

test('one bubble at a time: a new line replaces it only when it matters more', () => {
  const p = page();
  assert.equal(p.frame(react('Wave', { faceCamera: true })).trigger, 'wave');
  assert.equal(p.frame(brain('walk')).say, null, 'wandering matters less: the wave stays up');
  assert.equal(p.frame(brain('idle')).say, null);
  assert.equal(p.frame(react('Wave', { faceCamera: true })).say, null, 'the same priority waits too');
  assert.equal(p.frame(brain('flee')).trigger, 'flee', 'running from you outranks a wave');
  assert.equal(p.frame(brain('held', { clip: 'Held' })).trigger, 'caught', 'and being caught outranks that');
  const up = p.talk.snapshot().showing;
  assert.equal(up.trigger, 'caught');
  assert.ok(Math.abs(up.until - (p.t + lineDuration(up.line))) < 1e-6, 'up for its line’s time');
  // Once it's down, anything may speak.
  p.wait(lineDuration(up.line) + 0.05, brain('held', { clip: 'Held' }));
  assert.equal(p.talk.snapshot().showing, null);
  assert.equal(p.frame(brain('fall', { clip: 'Fall' })).trigger, 'dropped');
  // Two at once: the one that matters more.
  const q = page();
  q.frame(brain('flee'));
  later(q, brain('flee'));
  const both = q.frame(brain('held', { clip: 'Held' }), { camera: { yaw: 0, zoom: 0.5 } });
  assert.equal(both.trigger, 'caught');
});

test('no lines for a trigger: he stays quiet then, and nothing breaks', () => {
  const p = page({ lines: { wave: ['hello'] } });
  assert.equal(p.frame(brain('flee')).say, null);
  assert.equal(p.frame(react('Wave', { faceCamera: true })).say, 'hello');
  const q = page({ lines: {} });
  assert.deepEqual(q.wait(60, brain('idle')), []);
  // (No state yet, as before NEWT is in: nothing.)
  const r = createTalk({ lines: LINES, speech: always(), rng: createRng(1) });
  assert.deepEqual(r.step({ t: 0, dt: 0, state: null, events: [], camera: null }), { say: null, trigger: null });
  assert.deepEqual(r.step({ t: 1, dt: 1, state: brain('flee'), events: [], camera: null }).trigger, null);
  assert.deepEqual(r.step({ t: 2, dt: 1, state: brain('idle'), events: [], camera: null }).trigger, null);
});

test('the same seed says the same lines', () => {
  const run = (seed) => {
    const p = page({ seed, speech: SPEECH_DEFAULTS });
    const out = [];
    for (let i = 0; i < 60; i++) {
      out.push(p.frame(react(i % 3 ? 'Wave' : 'Spook', { faceCamera: true })).say);
      out.push(...p.wait(3, brain('idle')).map((s) => s.say));
      p.frame(brain('flee'));
      out.push(...p.wait(2, brain('flee')).map((s) => s.say));
    }
    return out;
  };
  assert.deepEqual(run(5), run(5));
  assert.notDeepEqual(run(5), run(6));
});

test('how long a line stays up: typed at a readable pace, held, faded', () => {
  const short = lineDuration('Hi!');
  const long = lineDuration('Okay, okay, I get it, you can spin the camera around. Wow.');
  assert.ok(short >= 2 && short <= 3.5, `a short line: ${short.toFixed(2)} s`);
  assert.ok(long > short && long <= 8, `a long one: ${long.toFixed(2)} s`);
  const n = 'Okay, okay, I get it, you can spin the camera around. Wow.'.length;
  assert.ok(Math.abs(long - (n / TALK.typeCps + TALK.hold + n * TALK.holdPerChar + TALK.fade)) < 1e-6);
  assert.ok(TALK.typeCps >= 20 && TALK.typeCps <= 45, 'typed at a readable pace');
  // (Characters, not UTF-16 units: an emoji is one.)
  assert.equal(lineDuration('🦎'), lineDuration('a'));
});

test('settings from anything: content’s, partly missing, broken, or none', () => {
  assert.deepEqual(speechFrom(undefined), SPEECH_DEFAULTS);
  assert.deepEqual(speechFrom(null), SPEECH_DEFAULTS);
  assert.deepEqual(speechFrom('nope'), SPEECH_DEFAULTS);
  const s = speechFrom({
    idleMin: 30,
    idleMax: 50,
    wave: { chance: 0.25, cooldown: 4 },
    spook: { chance: 'often', cooldown: -3 },
    flee: 'loud',
    shaken: { chance: 2 },
    mystery: { chance: 1, cooldown: 1 },
  });
  assert.deepEqual(s.idleEvery, [30, 50]);
  assert.deepEqual(s.triggers.wave, { chance: 0.25, cooldown: 4 });
  assert.deepEqual(
    s.triggers.spook,
    { chance: SPEECH_DEFAULTS.triggers.spook.chance, cooldown: 0 },
    'a bad chance falls back; a cooldown below 0 is 0',
  );
  assert.deepEqual(s.triggers.flee, SPEECH_DEFAULTS.triggers.flee, 'not a group: the default');
  assert.deepEqual(
    s.triggers.shaken,
    { chance: 1, cooldown: SPEECH_DEFAULTS.triggers.shaken.cooldown },
    'clamped into range, the rest kept',
  );
  assert.equal(s.triggers.mystery, undefined, 'unknown triggers dropped');
  assert.deepEqual(speechFrom({ idleMin: 50, idleMax: 30 }).idleEvery, [30, 50], 'the wrong way round, swapped');
  assert.deepEqual(speechFrom({ idleMin: 1 }).idleEvery, [SPEECH_RANGES.idle[0], 40], 'clamped');
});

test('lines from anything: trimmed, the empty and the non-text dropped, at most 20 a trigger', () => {
  assert.deepEqual(linesFrom(undefined), {});
  assert.deepEqual(linesFrom([]), {});
  const many = Array.from({ length: 30 }, (_, i) => `line ${i}`);
  const l = linesFrom({
    wave: ['  hi  ', '', 7, null, 'hello'],
    spook: 'boo',
    flee: many,
    landed: ['x'.repeat(121), 'ok'],
    mystery: ['who?'],
  });
  assert.deepEqual(l.wave, ['hi', 'hello']);
  assert.equal(l.spook, undefined, 'not a list');
  assert.equal(l.flee.length, 20);
  assert.deepEqual(l.landed, ['ok'], 'too long for the bubble: left out');
  assert.equal(l.mystery, undefined);
  assert.deepEqual(linesFrom(l), l, 'idempotent');
});

test('after a quiet spell he wasn’t stepped through (the intro), rest() restarts the idle clock: no idle line the moment he’s back', () => {
  const p = page({ speech: always([20, 40]) });
  p.wait(5, brain('idle'));
  // (The intro: 50 s in which the page doesn't step the talk at all.)
  p.t += 50;
  p.talk.rest(p.t);
  const soon = p.wait(19, brain('idle'));
  assert.deepEqual(soon, [], `nothing in the first 19 s back (said ${soon.map((x) => x.say).join(', ')})`);
  const after = p.wait(22, brain('idle'));
  assert.ok(
    after.some((x) => x.trigger === 'idle'),
    'an idle line 20 to 40 s after he’s back',
  );
});
