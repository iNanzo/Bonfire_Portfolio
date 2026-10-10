// The campfire display's presentation adapter (src/larp/stage.js, the design's Round Moods and
// Scene Cues): which scene calls each game moment asks for (the round's flame, the scenery, a
// stoke, pulse, sparkle or ring, the knights' few gestures and dances), the calm prayer round
// that asks for nothing but its flame and a lower frame cap, reduced motion without rings,
// flashes, shake or gestures, never 'praise'; every call optional and guarded; and the stage
// that builds the bonfire lazily, catches up once it is ready and never lets a failure through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALM_FPS,
  FINAL_MOVES,
  INTRO_MOVES,
  STAGE_GESTURES,
  WELCOME_FLAME,
  applyCue,
  createStage,
  cuesFor,
  flameOf,
  postureOf,
} from '../src/larp/stage.js';
import { GESTURES, MOVES } from '../src/bonfire/knightGestures.js';
import { flames } from '../src/palette.js';
import { ROUND_CATEGORIES } from '../src/larp/types.js';
import { createApp } from '../src/larp/app.js';
import { nextAction } from '../src/larp/host.js';
import { fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';

/** A round as the projection has it. @param {string} key */
const roundOf = (key, index = ROUND_CATEGORIES.findIndex((c) => c.key === key)) => {
  const c = ROUND_CATEGORIES.find((r) => r.key === key);
  return {
    id: `round-${key}`,
    index,
    category: key,
    vi: c.vi,
    en: c.en,
    prompt: c.prompt,
    promptTranslation: '',
    base: c.base,
    turnMs: c.turnMs,
    calm: c.calm,
    flame: c.flame,
  };
};

/** A projection with only what the stage reads. @param {any} [over] @returns {any} */
const proj = (over = {}) => ({
  eventId: 'event-1',
  revision: 1,
  now: 0,
  phase: 'setup',
  roundIndex: -1,
  roundPhase: null,
  roundCount: 5,
  config: { title: '', displayMode: 'bilingual', scenery: 'ruins', reducedMotion: false, sound: false },
  round: null,
  teams: [],
  members: [],
  queue: [],
  currentTeamId: null,
  nextTeamId: null,
  timer: null,
  timerRemainingMs: 0,
  reveal: null,
  revealSteps: [],
  results: [],
  corrections: [],
  standings: [],
  leaders: [],
  ...over,
});

/** In a round. @param {string} key @param {string} roundPhase @param {any} [over] */
const inRound = (key, roundPhase, over = {}) =>
  proj({ phase: 'running', roundIndex: roundOf(key).index, roundPhase, round: roundOf(key), ...over });

/** The next revision of `p` with `over`. @param {any} p @param {any} [over] */
const then = (p, over = {}) => ({ ...p, revision: p.revision + 1, ...over });

/** Cues as short strings: 'stoke()', 'knights.gesture(hurrah)', 'flame(ember,swap)'. @param {any[]} cues */
const names = (cues) =>
  cues.map((c) => {
    if (c.method === 'flame') return `flame(${c.args[0]},${c.args[1].instant ? 'instant' : 'swap'})`;
    const first = c.args?.[0];
    const arg = c.method === 'gesture' || c.method === 'setScenery' || c.method === 'setMaxFps' ? first : '';
    const dance = c.method === 'dance' ? `${first},${c.args[1].move}` : '';
    return `${c.target ? 'knights.' : ''}${c.method}(${dance || arg})`;
  });
/** Only the moments. @param {any[]} cues */
const moments = (cues) => names(cues.filter((c) => c.kind === 'moment'));

const TEAMS = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

test('nothing to show asks for nothing; a fresh scene gets the whole look at once and a seated knight', () => {
  assert.deepEqual(cuesFor(null, null), []);
  assert.deepEqual(cuesFor(null, null, []), []);
  assert.deepEqual(names(cuesFor(null, proj())), [
    'flame(gilded,instant)',
    'setScenery(ruins)',
    'setMaxFps(0)',
    'knights.summonKnight()',
  ]);
  assert.ok(cuesFor(null, proj()).every((c) => c.kind === 'state'));
  // A reload in the prayer round: its flame at once, the low frame cap, the shrine.
  assert.deepEqual(names(cuesFor(null, inRound('prayer', 'performances', { config: { scenery: 'shrine' } }))), [
    'flame(spirit,instant)',
    'setScenery(shrine)',
    `setMaxFps(${CALM_FPS})`,
    'knights.summonKnight()',
  ]);
  // A reload at the end: the knights are already dancing (no ring for a moment long gone).
  assert.deepEqual(names(cuesFor(null, proj({ phase: 'finished', roundIndex: 4 }))), [
    'flame(gilded,instant)',
    'setScenery(ruins)',
    'setMaxFps(0)',
    'knights.summonKnight()',
    'knights.dance(0,clap)',
    'knights.dance(1,swayArms)',
    'knights.dance(2,stepTouch)',
  ]);
  // A projection without a scenery (an older host) skips that call.
  assert.ok(!names(cuesFor(null, proj({ config: {} }))).includes('setScenery(undefined)'));
});

test('the flame follows the round (gilded at Welcome and the end) and changes with a forged swap', () => {
  assert.equal(flameOf(proj()), WELCOME_FLAME);
  assert.equal(flameOf(proj({ phase: 'running' })), 'gilded');
  for (const c of ROUND_CATEGORIES) {
    assert.equal(flameOf(inRound(c.key, 'briefing')), c.flame);
    assert.ok(Object.hasOwn(flames, c.flame), `${c.flame} is a palette flame`);
  }
  assert.equal(flameOf(proj({ phase: 'finished', round: roundOf('cheer') })), 'gilded');
  // An admin-edited flame is passed as is (applyCue resolves it with flameOr).
  assert.equal(flameOf(inRound('faith', 'briefing', { round: { ...roundOf('faith'), flame: 'gone' } })), 'gone');

  const welcome = proj({ phase: 'running', revision: 3 });
  const faith = then(welcome, inRound('faith', 'briefing'));
  assert.deepEqual(names(cuesFor(welcome, faith)), ['flame(ember,swap)']);
  const dance = then(faith, inRound('dance', 'briefing'));
  assert.ok(names(cuesFor(faith, dance)).includes('flame(rose,swap)'));
  // Into and out of the calm round, and under reduced motion: at once.
  const prayer = then(dance, inRound('prayer', 'briefing'));
  assert.deepEqual(names(cuesFor(dance, prayer)).slice(0, 2), ['flame(spirit,instant)', `setMaxFps(${CALM_FPS})`]);
  const skit = then(prayer, inRound('skit', 'briefing'));
  assert.deepEqual(names(cuesFor(prayer, skit)), ['flame(ember,instant)', 'setMaxFps(0)']);
  assert.deepEqual(names(cuesFor(welcome, faith, { reducedMotion: true })), ['flame(ember,instant)']);
  // The same flame twice (Faith → Skit are both ember): nothing.
  assert.deepEqual(cuesFor(inRound('faith', 'results'), then(inRound('skit', 'briefing'))), []);
  // A new event: its look at once, no moments from the old one.
  const other = proj({ eventId: 'event-2', revision: 1, phase: 'setup' });
  assert.deepEqual(names(cuesFor(faith, other)), ['flame(gilded,instant)']);
});

test('the scenery follows Setup; the frame cap is lowered only in the calm round', () => {
  const a = proj();
  assert.deepEqual(names(cuesFor(a, then(a, { config: { ...a.config, scenery: 'cathedral' } }))), [
    'setScenery(cathedral)',
  ]);
  const prayer = inRound('prayer', 'preparation');
  assert.deepEqual(names(cuesFor(prayer, then(prayer, { roundPhase: 'performances' }))), []);
  // Finished after the prayer round would be gilded and uncapped; Setup during a prayer round is not a thing.
  assert.ok(names(cuesFor(prayer, then(proj({ phase: 'finished' })))).includes('setMaxFps(0)'));
});

test('Welcome: a stoke as each team is introduced, and a wave as the event starts', () => {
  const none = proj();
  const one = then(none, { teams: [TEAMS[0]] });
  assert.deepEqual(moments(cuesFor(none, one)), ['stoke()']);
  // A removed or renamed team: no stoke.
  assert.deepEqual(moments(cuesFor(one, then(one, { teams: [] }))), []);
  assert.deepEqual(moments(cuesFor(one, then(one))), []);
  const started = then(one, { phase: 'running' });
  assert.deepEqual(moments(cuesFor(one, started)), ['knights.gesture(wave)']);
  // A team added at the opening (running, no round yet) is introduced too.
  assert.deepEqual(moments(cuesFor(started, then(started, { teams: TEAMS.slice(0, 2) }))), ['stoke()']);
  // In a round, a team added mid-game gets no stoke.
  const faith = inRound('faith', 'preparation', { teams: [TEAMS[0]] });
  assert.deepEqual(moments(cuesFor(faith, then(faith, { teams: TEAMS.slice(0, 2) }))), []);
});

test("each round's cue as a team's turn starts (and the cheer's after each turn)", () => {
  /** The moments as the turns go t1 → t2 → none → review. @param {string} key */
  const turns = (key) => {
    const prep = inRound(key, 'preparation');
    const perf = then(prep, { roundPhase: 'performances' });
    const t1 = then(perf, { currentTeamId: 't1' });
    const t2 = then(t1, { currentTeamId: 't2' });
    const after = then(t2, { currentTeamId: null });
    const review = then(after, { roundPhase: 'review' });
    return [
      [prep, perf],
      [perf, t1],
      [t1, t2],
      [t2, after],
      [after, review],
    ].map(([a, b]) => moments(cuesFor(a, b)));
  };
  assert.deepEqual(turns('faith'), [[], ['pulse()'], ['pulse()'], [], []]);
  assert.deepEqual(turns('dance'), [[], ['sparkle()'], ['sparkle()'], [], []]);
  assert.deepEqual(turns('prayer'), [[], [], [], [], []]);
  assert.deepEqual(turns('skit'), [[], ['stoke()'], ['stoke()'], [], []]);
  const hurrah = ['ring()', 'knights.gesture(hurrah)'];
  assert.deepEqual(turns('cheer'), [[], [], hurrah, hurrah, []]);
  // The last team goes straight to Review (no empty turn between): the cheer still lands.
  const last = inRound('cheer', 'performances', { currentTeamId: 't3' });
  assert.deepEqual(moments(cuesFor(last, then(last, { roundPhase: 'review', currentTeamId: null }))), hurrah);
  // A timer tick (same team, newer revision): nothing.
  assert.deepEqual(moments(cuesFor(last, then(last))), []);
  // The pulse is small; the faith one a little stronger than a banner's.
  const t = inRound('faith', 'performances');
  const pulse = cuesFor(t, then(t, { currentTeamId: 't1' })).find((c) => c.method === 'pulse');
  assert.deepEqual(pulse.args, [0.6]);
});

test('the Dance round: two knights dance through the briefing only, then sit back down', () => {
  const welcome = proj({ phase: 'running' });
  const faithResults = then(welcome, inRound('faith', 'results'));
  const briefing = then(faithResults, inRound('dance', 'briefing'));
  assert.deepEqual(names(cuesFor(faithResults, briefing)), [
    'flame(rose,swap)',
    'knights.dance(0,swayArms)',
    'knights.dance(1,clap)',
  ]);
  const prep = then(briefing, { roundPhase: 'preparation' });
  assert.deepEqual(names(cuesFor(briefing, prep)), ['knights.dismiss()', 'knights.sit()']);
  assert.deepEqual(
    cuesFor(briefing, prep).map((c) => c.args),
    [[1], [0]],
  );
  assert.equal(postureOf(briefing, false), 'intro');
  assert.equal(postureOf(briefing, true), 'seated');
  assert.equal(postureOf(prep, false), 'seated');
  assert.equal(postureOf(inRound('faith', 'briefing'), false), 'seated');
  // Skipped from the briefing straight to the next round's: they sit too.
  assert.deepEqual(names(cuesFor(briefing, then(briefing, inRound('prayer', 'briefing')))).slice(-2), [
    'knights.dismiss()',
    'knights.sit()',
  ]);
});

test('reveal banners: a small pulse for a bonus, nothing for a deduction, one ring and joy when published', () => {
  const steps = [
    { kind: 'team', teamId: 't1', adjustmentId: null },
    { kind: 'award', teamId: 't1', adjustmentId: 'a-plus' },
    { kind: 'award', teamId: 't1', adjustmentId: 'a-minus' },
    { kind: 'award', teamId: 't1', adjustmentId: 'a-unknown' },
    { kind: 'standings', teamId: null, adjustmentId: null },
  ];
  const results = [
    {
      roundId: 'round-faith',
      adjustments: [
        { id: 'a-plus', points: 25 },
        { id: 'a-minus', points: -25 },
      ],
    },
  ];
  const review = inRound('faith', 'review', { revealSteps: steps, results });
  const at = (/** @type {number} */ step, over = {}) =>
    then(review, {
      revision: review.revision + 1 + step,
      roundPhase: 'reveal',
      reveal: { roundId: 'round-faith', step, total: steps.length, paused: false, stepStartedAt: 0 },
      ...over,
    });
  const s = [0, 1, 2, 3, 4].map((i) => at(i));
  assert.deepEqual(moments(cuesFor(review, s[0])), []);
  assert.deepEqual(moments(cuesFor(s[0], s[1])), ['pulse()']);
  assert.deepEqual(cuesFor(s[0], s[1]).find((c) => c.method === 'pulse').args, [0.35]);
  assert.deepEqual(moments(cuesFor(s[1], s[2])), []);
  assert.deepEqual(moments(cuesFor(s[2], s[3])), []);
  assert.deepEqual(moments(cuesFor(s[3], s[4])), ['ring()', 'knights.gesture(joy)']);
  // Pausing or resuming on a banner plays nothing again.
  const paused = then(s[1], { reveal: { ...s[1].reveal, paused: true } });
  assert.deepEqual(moments(cuesFor(s[1], paused)), []);
  // Past the standings into Results: nothing more; skipped from a banner: published once.
  const results1 = then(s[4], { roundPhase: 'results', reveal: null });
  assert.deepEqual(moments(cuesFor(s[4], results1)), []);
  assert.deepEqual(moments(cuesFor(s[2], then(s[2], { roundPhase: 'results', reveal: null }))), [
    'ring()',
    'knights.gesture(joy)',
  ]);
  // A replay from Results starts again (the bonus pulses again as it comes round).
  const replay = then(results1, { roundPhase: 'reveal', reveal: { ...s[1].reveal } });
  assert.deepEqual(moments(cuesFor(results1, replay)), ['pulse()']);
  // A step past the list's end, or results that aren't there: nothing.
  assert.deepEqual(moments(cuesFor(s[0], at(9))), []);
  assert.deepEqual(moments(cuesFor(s[0], at(1, { results: [] }))), []);
  // The calm round's reveal stays calm.
  const calmReview = inRound('prayer', 'review', {
    revealSteps: steps,
    results: [{ ...results[0], roundId: 'round-prayer' }],
  });
  const calmAt = (/** @type {number} */ step) =>
    then(calmReview, {
      revision: calmReview.revision + 1 + step,
      roundPhase: 'reveal',
      reveal: { roundId: 'round-prayer', step, total: 5, paused: false, stepStartedAt: 0 },
    });
  assert.deepEqual(moments(cuesFor(calmAt(0), calmAt(1))), []);
  assert.deepEqual(moments(cuesFor(calmAt(3), calmAt(4))), []);
});

test('the final standings: gilded, a ring and sparkles, three knights dancing; a new event seats them', () => {
  const results = inRound('cheer', 'results');
  const finished = then(results, { phase: 'finished', roundPhase: null, round: null });
  // (Team Cheer already burns gilded: no new flame.)
  assert.deepEqual(names(cuesFor(results, finished)), [
    'knights.dance(0,clap)',
    'knights.dance(1,swayArms)',
    'knights.dance(2,stepTouch)',
    'ring()',
    'sparkle()',
  ]);
  // Deleting the data starts a new event in Setup: the dancers go, the first sits.
  const fresh = proj({ eventId: 'event-2' });
  assert.deepEqual(names(cuesFor(finished, fresh)), ['knights.dismiss()', 'knights.dismiss()', 'knights.sit()']);
  assert.deepEqual(
    cuesFor(finished, fresh).map((c) => c.args[0]),
    [2, 1, 0],
  );
});

test('moments only follow a newer revision of the same event', () => {
  const a = inRound('skit', 'performances', { revision: 5 });
  const b = { ...a, currentTeamId: 't1' };
  assert.deepEqual(moments(cuesFor(a, b)), []); // the same revision (a re-render)
  assert.deepEqual(moments(cuesFor(a, { ...b, revision: 4 })), []); // older (a restored backup)
  assert.deepEqual(moments(cuesFor(a, { ...b, revision: 6, eventId: 'event-9' })), []);
  assert.deepEqual(moments(cuesFor(a, { ...b, revision: 6 })), ['stoke()']);
});

test('reduced motion (the OS or Setup) drops rings, flashes, shake, gestures and dances, never the information', () => {
  const cheer = inRound('cheer', 'performances', { currentTeamId: 't1' });
  const next = then(cheer, { currentTeamId: 't2' });
  assert.deepEqual(moments(cuesFor(cheer, next, { reducedMotion: true })), []);
  const viaSetup = { ...next, config: { ...next.config, reducedMotion: true } };
  assert.deepEqual(moments(cuesFor(cheer, viaSetup)), []);
  // The quiet cues stay (the scene itself skips pulse and sparkle under reduced motion).
  const skit = inRound('skit', 'performances');
  assert.deepEqual(moments(cuesFor(skit, then(skit, { currentTeamId: 't1' }), { reducedMotion: true })), ['stoke()']);
  const results = inRound('cheer', 'results');
  const finished = then(results, { phase: 'finished', round: null });
  assert.deepEqual(names(cuesFor(results, finished, { reducedMotion: true })), ['sparkle()']);
  const welcome = proj({ teams: [TEAMS[0]] });
  assert.deepEqual(moments(cuesFor(welcome, then(welcome, { phase: 'running' }), { reducedMotion: true })), []);
  // Turning reduced motion on in Setup while they dance seats them.
  const dancing = proj({ phase: 'finished', revision: 9 });
  const still = then(dancing, { config: { ...dancing.config, reducedMotion: true } });
  assert.deepEqual(names(cuesFor(dancing, still)), ['knights.dismiss()', 'knights.dismiss()', 'knights.sit()']);
  // A fresh scene under reduced motion: a seated knight, never a dance.
  assert.deepEqual(names(cuesFor(null, dancing, { reducedMotion: true })).slice(-1), ['knights.summonKnight()']);
});

test('a whole five-round event: only known gestures and moves, never praise, the prayer round silent', () => {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('s') });
  app.newEvent();
  /** @type {any[]} */
  const all = [];
  let prev = null;
  const look = () => {
    const p = app.getProjection(clock.now());
    const cues = cuesFor(prev, p);
    all.push({ p, cues });
    prev = p;
  };
  look();
  for (const name of ['Đội Phaolô', 'Đội Giuse', 'Đội Maria']) {
    app.dispatch('addTeam', { name });
    look();
  }
  for (let guard = 0; guard < 200; guard++) {
    const next = nextAction(app.getEvent());
    if (next.id === 'exportResults') break;
    if (next.blocked && next.id === 'publish') {
      for (const teamId of app.getEvent().rounds[app.getEvent().roundIndex].order) {
        app.dispatch('setStatus', { teamId, status: 'complete' });
      }
      if (app.getEvent().roundIndex === 0) {
        const [t1, t2] = app.getEvent().teams;
        const award = { recipientType: 'team', name: 'Spirit', points: 25 };
        app.dispatch('addAward', { ...award, recipientIds: [t1.id] });
        app.dispatch('addAward', { ...award, name: 'Late', points: -10, recipientIds: [t2.id] });
      }
      continue;
    }
    assert.equal(app.dispatch(next.command.type, next.command.payload).error, null, next.label);
    clock.advance(1000);
    look();
  }
  assert.equal(app.getEvent().phase, 'finished');
  const cues = all.flatMap((x) => x.cues);
  const gestures = cues.filter((c) => c.method === 'gesture').map((c) => c.args[0]);
  const moves = cues.filter((c) => c.method === 'dance').map((c) => c.args[1].move);
  assert.ok(gestures.length && moves.length);
  for (const g of gestures) assert.ok(GESTURES.includes(g) && g !== 'praise', g);
  for (const m of moves) assert.ok(MOVES.includes(m) && m !== 'praise', m);
  for (const g of STAGE_GESTURES) assert.ok(GESTURES.includes(g) && g !== 'praise');
  for (const m of [...INTRO_MOVES, ...FINAL_MOVES]) assert.ok(MOVES.includes(m) && m !== 'praise');
  // Every flame asked for is a palette flame (the defaults).
  for (const c of cues.filter((x) => x.method === 'flame')) assert.ok(Object.hasOwn(flames, c.args[0]), c.args[0]);
  // The prayer round asks for no moments at all, only its look.
  const prayer = all.filter((x) => x.p.round?.calm);
  assert.ok(prayer.length > 5);
  assert.deepEqual(
    prayer.flatMap((x) => moments(x.cues)),
    [],
  );
  // The event's moments, in order of their kinds (each counted once).
  const kinds = [...new Set(cues.filter((c) => c.kind === 'moment').map((c) => names([c])[0]))];
  assert.deepEqual(kinds.sort(), [
    'knights.gesture(hurrah)',
    'knights.gesture(joy)',
    'knights.gesture(wave)',
    'pulse()',
    'ring()',
    'sparkle()',
    'stoke()',
  ]);
  // Faith's bonus pulsed during its reveal, its deduction didn't (one turn pulse per team, one bonus).
  const faithReveal = all.filter((x) => x.p.round?.category === 'faith' && x.p.roundPhase === 'reveal');
  assert.equal(faithReveal.flatMap((x) => moments(x.cues)).filter((n) => n === 'pulse()').length, 1);
});

/** A fake scene that logs its calls; `ready` and `knights.ready` resolve when told. */
function fakeScene({ weapon = 'sword', flame = 'none' } = {}) {
  const log = [];
  let readyNow;
  let knightsNow;
  const scene = {
    log,
    weapon,
    flame,
    ready: new Promise((r) => (readyNow = r)),
    resolveReady: () => readyNow(),
    resolveKnights: () => knightsNow(true),
    equip: (w, f, o) => {
      log.push(['equip', w, f, o]);
      scene.flame = f;
      return Promise.reject(new Error('cancelled'));
    },
    setScenery: (n) => log.push(['setScenery', n]),
    setMaxFps: (n) => log.push(['setMaxFps', n]),
    stoke: () => log.push(['stoke']),
    ring: (s) => log.push(['ring', s]),
    sparkle: () => log.push(['sparkle']),
    pulse: () => {
      throw new Error('no pulse today');
    },
    dispose: () => log.push(['dispose']),
    knights: {
      ready: new Promise((r) => (knightsNow = r)),
      summonKnight: () => log.push(['summonKnight']),
      gesture: (g) => log.push(['gesture', g]),
      dance: (i, o) => log.push(['dance', i, o.move]),
      sit: (i) => log.push(['sit', i]),
      dismiss: (i) => log.push(['dismiss', i]),
    },
  };
  return scene;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('applyCue: guarded calls on the scene and its knights; the flame resolved and swapped with the held weapon', () => {
  const s = fakeScene({ flame: 'ember' });
  assert.equal(applyCue(s, { method: 'stoke' }), true);
  assert.equal(applyCue(s, { method: 'pulse', args: [1] }), false); // throws
  assert.equal(applyCue(s, { method: 'flash' }), false); // missing
  assert.equal(applyCue(null, { method: 'stoke' }), false);
  assert.equal(applyCue(s, { target: 'knights', method: 'gesture', args: ['joy'] }), true);
  assert.equal(applyCue({}, { target: 'knights', method: 'gesture', args: ['joy'] }), false);
  // The flame: resolved, the weapon kept, a rejected swap ignored; the same flame is skipped.
  const flameOr = (/** @type {string} */ k) => (k === 'gone' ? 'ember' : k);
  assert.equal(applyCue(s, { method: 'flame', args: ['gone', { instant: true }] }, { flameOr }), false);
  assert.equal(applyCue(s, { method: 'flame', args: ['rose', { instant: false }] }, { flameOr }), true);
  assert.equal(applyCue(s, { method: 'flame', args: ['rose', { instant: false }] }), false);
  assert.equal(applyCue({ ...s, weapon: null }, { method: 'flame', args: ['azure', {}] }), false);
  assert.equal(applyCue({}, { method: 'flame', args: ['azure', {}] }), false);
  assert.equal(applyCue(s, { method: 'flame' }), true);
  assert.deepEqual(s.log, [
    ['stoke'],
    ['gesture', 'joy'],
    ['equip', 'sword', 'rose', { instant: false }],
    ['equip', 'sword', undefined, undefined],
  ]);
});

test('the stage builds the bonfire on the first projection, catches up once ready and plays later cues', async () => {
  const s = fakeScene();
  const made = [];
  const container = /** @type {any} */ ({ id: 'stage' });
  const readied = [];
  const stage = createStage({
    container,
    importScene: async () => ({
      createBonfire: (c, o) => (made.push([c, o.reducedMotion, typeof o.onError]), s),
      flameOr: (k) => k,
    }),
    onReady: (what) => readied.push(what),
  });
  assert.equal(stage.failed, false);
  stage.apply(null); // nothing yet
  await tick();
  assert.equal(made.length, 0);
  const welcome = proj({ teams: [TEAMS[0]] });
  stage.apply(welcome);
  await tick();
  assert.deepEqual(made, [[container, false, 'function']]);
  // Before the scene is ready the projections are only kept (no moment is played late).
  const started = then(welcome, { phase: 'running' });
  stage.apply(started);
  stage.apply(then(started, inRound('faith', 'briefing')));
  assert.deepEqual(s.log, []);
  s.resolveReady();
  await tick();
  assert.deepEqual(s.log, [
    ['equip', 'sword', 'ember', { instant: true }],
    ['setScenery', 'ruins'],
    ['setMaxFps', 0],
    ['summonKnight'],
  ]);
  assert.deepEqual(readied, ['scene']);
  s.resolveKnights();
  await tick();
  assert.deepEqual(s.log.slice(4), [['summonKnight']]);
  assert.deepEqual(readied, ['scene', 'knights'], 'everything it loads is in: the network may go');
  s.log.length = 0;
  // From now on each projection plays its cues against the one before.
  const faith = inRound('skit', 'performances', { revision: 5 });
  const skit = then(faith, { currentTeamId: 't1' });
  stage.apply(skit, faith);
  assert.deepEqual(s.log, [['stoke']]);
  const cheer = then(skit, inRound('cheer', 'performances', { currentTeamId: 't1' }));
  stage.apply(cheer);
  stage.apply(then(cheer, { currentTeamId: 't2' }));
  assert.deepEqual(s.log.slice(1), [
    ['equip', 'sword', 'gilded', { instant: false }],
    ['ring', 0.8],
    ['gesture', 'hurrah'],
  ]);
  stage.dispose();
  assert.deepEqual(s.log.at(-1), ['dispose']);
  stage.apply(then(cheer, { revision: 99, currentTeamId: 't3' }));
  assert.equal(s.log.at(-1)[0], 'dispose');
});

test('the stage rebuilds the scene when reduced motion changes, and plays nothing on a scene it replaced', async () => {
  const scenes = [fakeScene(), fakeScene()];
  const built = [];
  const stage = createStage({
    container: /** @type {any} */ ({}),
    reducedMotion: false,
    importScene: async () => ({
      createBonfire: (_c, o) => {
        built.push(o.reducedMotion);
        return scenes[built.length - 1];
      },
    }),
  });
  const a = proj();
  stage.apply(a);
  await tick();
  scenes[0].resolveReady();
  await tick();
  const b = then(a, { config: { ...a.config, reducedMotion: true } });
  stage.apply(b);
  assert.deepEqual(scenes[0].log.at(-1), ['dispose']);
  await tick();
  assert.deepEqual(built, [false, true]);
  scenes[1].resolveReady();
  await tick();
  assert.deepEqual(scenes[1].log[0], ['equip', 'sword', 'gilded', { instant: true }]);
  // The OS setting alone builds it reduced too.
  const os = [];
  const st = createStage({
    container: /** @type {any} */ ({}),
    reducedMotion: true,
    importScene: async () => ({ createBonfire: (_c, o) => (os.push(o.reducedMotion), fakeScene()) }),
  });
  st.apply(proj());
  await tick();
  assert.deepEqual(os, [true]);
  st.dispose();
});

test('a failed import, a throwing createBonfire, onError or a rejected ready marks the stage failed, once', async () => {
  /** @param {() => Promise<any>} importScene */
  const run = async (importScene, after = async (/** @type {any} */ _s) => {}) => {
    const fails = [];
    const stage = createStage({ container: /** @type {any} */ ({}), importScene, onFail: (e) => fails.push(e) });
    stage.apply(proj());
    await tick();
    await after(stage);
    await tick();
    return { stage, fails };
  };
  const a = await run(() => Promise.reject(new Error('offline')));
  assert.equal(a.stage.failed, true);
  assert.equal(a.fails.length, 1);
  a.stage.apply(proj({ revision: 2 })); // nothing more
  assert.equal(a.fails.length, 1);

  const b = await run(async () => ({
    createBonfire: () => {
      throw new Error('no WebGL');
    },
  }));
  assert.equal(b.stage.failed, true);

  let onError;
  const s = fakeScene();
  const c = await run(
    async () => ({ createBonfire: (_c, o) => ((onError = o.onError), s) }),
    async () => {
      onError(new Error('WebGL context lost'));
      onError(new Error('again'));
    },
  );
  assert.equal(c.stage.failed, true);
  assert.equal(c.fails.length, 1);
  assert.deepEqual(s.log, [['dispose']]);

  const bad = { ...fakeScene(), ready: Promise.reject(new Error('model failed')), dispose: () => {} };
  const d = await run(async () => ({ createBonfire: () => bad }));
  assert.equal(d.stage.failed, true);

  // Disposed while the scene was loading: it is never built.
  let builtLate = false;
  const stage = createStage({
    container: /** @type {any} */ ({}),
    importScene: async () => ({ createBonfire: () => ((builtLate = true), fakeScene()) }),
  });
  stage.apply(proj());
  stage.dispose();
  await tick();
  assert.equal(builtLate, false);
  assert.equal(stage.failed, false);
  // A scene without ready (or with a throwing dispose) still works.
  const plain = {
    ...fakeScene(),
    ready: undefined,
    dispose: () => {
      throw new Error('x');
    },
  };
  const st = createStage({
    container: /** @type {any} */ ({}),
    importScene: async () => ({ createBonfire: () => plain }),
  });
  st.apply(proj());
  await tick();
  await tick();
  assert.deepEqual(plain.log.slice(0, 2), [
    ['equip', 'sword', 'gilded', { instant: true }],
    ['setScenery', 'ruins'],
  ]);
  st.dispose();
});
