// The campfire game's roles (src/larp/roles.js): the host may do everything, including adding an
// award "from" another GM and touching anyone's award at any time; a co-GM in Judge Mode may only
// add awards as themselves and edit or remove their own drafts, and only while judging is open
// (Preparation, Performances) in the current round (A03, A11); an unknown, removed or missing
// actor, a non-host claiming host mode and the display can do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_TYPES, HOST_GM_ID, ROUND_PHASES, VIEW_ACTIONS } from '../src/larp/types.js';
import { can, check } from '../src/larp/roles.js';
import { atRound, blankEvent, deepFreeze, eventWithTeams, makeAdjustment } from './lib/larpFixtures.mjs';

/** @typedef {import('../src/larp/types.js').LarpEvent} LarpEvent */
/** @typedef {import('../src/larp/types.js').RoleAction} RoleAction */

const HOST = { gmId: HOST_GM_ID, mode: /** @type {const} */ ('host') };
const JUDGE = { gmId: 'gm-1', mode: /** @type {const} */ ('judge') };
const OTHER_JUDGE = { gmId: 'gm-2', mode: /** @type {const} */ ('judge') };
const JUDGE_ACTIONS = ['addAward', 'editAward', 'removeAward'];
const ALL_ACTIONS = /** @type {RoleAction[]} */ ([...COMMAND_TYPES, ...VIEW_ACTIONS]);

const base = deepFreeze(eventWithTeams(4, { membersPerTeam: 2, gms: 2 }));
/** @param {import('../src/larp/types.js').RoundPhase} phase @param {number} [idx] */
const at = (phase, idx = 1) => deepFreeze(atRound(base, idx, phase));
const performances = at('performances');
const ROUND = performances.rounds[1].id;
const own = (over = {}) => makeAdjustment({ roundId: ROUND, authorId: 'gm-1', ...over });
const others = (over = {}) => makeAdjustment({ roundId: ROUND, authorId: 'gm-2', ...over });

/** @param {ReturnType<typeof check>} err */
const code = (err) => (err ? err.code : null);

test('the host may do every command and view action in every phase, on anyone’s award', () => {
  const events = [base, ...ROUND_PHASES.map((p) => at(p)), { ...base, phase: 'finished' }];
  const targets = [undefined, own(), others({ status: 'published' }), { authorId: 'gm-2' }];
  for (const event of events) {
    for (const action of ALL_ACTIONS) {
      for (const target of targets) {
        assert.equal(check(HOST, action, event, target), null, `${action} in ${event.roundPhase ?? event.phase}`);
        assert.equal(can(HOST, action, event, target), true);
      }
    }
  }
});

test('the host may add an award "from" any GM, and review, publish and correct', () => {
  for (const authorId of [HOST_GM_ID, 'gm-1', 'gm-2']) {
    assert.equal(check(HOST, 'addAward', at('review'), { authorId }), null);
  }
  for (const action of /** @type {RoleAction[]} */ (['beginReview', 'publishRound', 'addCorrection', 'revealSkip'])) {
    assert.ok(can(HOST, action, at('review')));
  }
});

test('A03: a co-GM in Judge Mode never reaches setup, phases, timers, statuses, review, publish, reveal or corrections', () => {
  const nonJudging = ALL_ACTIONS.filter((a) => !JUDGE_ACTIONS.includes(a) && a !== 'viewJudging');
  assert.ok(nonJudging.length >= 30, 'the table covers the whole catalogue');
  for (const event of [base, at('preparation'), performances, at('review')]) {
    for (const action of nonJudging) {
      const err = check(JUDGE, action, event);
      assert.equal(code(err), 'forbidden', `${action} in ${event.roundPhase ?? event.phase}`);
      assert.equal(can(JUDGE, action, event), false);
    }
  }
});

test('A03: a co-GM edits and removes only their own drafts; another GM’s entry is refused', () => {
  /** @type {[RoleAction, object, string|null][]} */
  const table = [
    ['editAward', own(), null],
    ['removeAward', own(), null],
    ['editAward', others(), 'not_own_award'],
    ['removeAward', others(), 'not_own_award'],
    ['editAward', own({ authorId: HOST_GM_ID }), 'not_own_award'],
    ['editAward', own({ status: 'published' }), 'not_draft'],
    ['removeAward', own({ status: 'discarded' }), 'not_draft'],
    ['editAward', others({ status: 'published' }), 'not_own_award'],
    ['editAward', undefined, 'not_own_award'],
    ['removeAward', {}, 'not_own_award'],
  ];
  for (const [action, target, expected] of table) {
    assert.equal(code(check(JUDGE, action, performances, target)), expected, `${action} ${JSON.stringify(target)}`);
  }
  // The same award is gm-2's own.
  assert.equal(check(OTHER_JUDGE, 'editAward', performances, others()), null);
});

test('a co-GM adds awards only as themselves', () => {
  assert.equal(check(JUDGE, 'addAward', performances), null);
  assert.equal(check(JUDGE, 'addAward', performances, { authorId: 'gm-1' }), null);
  assert.equal(check(JUDGE, 'addAward', performances, { roundId: ROUND }), null);
  for (const authorId of [HOST_GM_ID, 'gm-2', 'gm-ghost', '']) {
    assert.equal(code(check(JUDGE, 'addAward', performances, { authorId })), 'forbidden', authorId);
  }
});

test('A11: judging is open only in Preparation and Performances; Review locks Judge Mode with a reason', () => {
  const open = new Set(['preparation', 'performances']);
  for (const phase of ROUND_PHASES) {
    const event = at(phase);
    for (const action of JUDGE_ACTIONS) {
      const err = check(JUDGE, /** @type {RoleAction} */ (action), event, action === 'addAward' ? undefined : own());
      assert.equal(code(err), open.has(phase) ? null : 'judging_closed', `${action} in ${phase}`);
    }
  }
  const err = check(JUDGE, 'editAward', at('review'), own());
  assert.ok(err && err.message.length > 0, 'the lock carries a message');
  // Setup, Welcome and Finished are closed too.
  const welcome = deepFreeze({ ...base, phase: /** @type {const} */ ('running') });
  const finished = deepFreeze({ ...performances, phase: /** @type {const} */ ('finished'), roundPhase: null });
  for (const event of [base, welcome, finished]) {
    assert.equal(code(check(JUDGE, 'addAward', event)), 'judging_closed');
  }
  // The host still may (handed-in awards are entered at Review), and reopening reopens it.
  assert.equal(check(HOST, 'editAward', at('review'), own()), null);
  assert.equal(check(JUDGE, 'editAward', at('performances'), own()), null);
});

test('a co-GM’s award actions apply to the current round only', () => {
  const lastRound = own({ roundId: performances.rounds[0].id });
  assert.equal(code(check(JUDGE, 'editAward', performances, lastRound)), 'judging_closed');
  assert.equal(code(check(JUDGE, 'addAward', performances, { roundId: performances.rounds[2].id })), 'judging_closed');
  assert.equal(check(HOST, 'editAward', performances, lastRound), null);
});

test('a co-GM sees the judging queue of the current round only', () => {
  assert.equal(check(JUDGE, 'viewJudging', performances), null);
  assert.equal(check(JUDGE, 'viewJudging', performances, { roundId: ROUND }), null);
  assert.equal(code(check(JUDGE, 'viewJudging', performances, { roundId: 'round-faith' })), 'forbidden');
  assert.equal(code(check(JUDGE, 'viewJudging', base)), 'forbidden');
  assert.equal(check(HOST, 'viewJudging', performances, { roundId: 'round-faith' }), null);
});

test('an unknown or removed GM, a co-GM claiming host mode, a bad mode and the display can do nothing', () => {
  const removed = deepFreeze({ ...performances, gms: performances.gms.filter((g) => g.id !== 'gm-1') });
  const actors = /** @type {any[]} */ ([
    { gmId: 'gm-ghost', mode: 'judge' },
    { gmId: 'gm-ghost', mode: 'host' },
    { gmId: 'gm-1', mode: 'host' },
    { gmId: HOST_GM_ID, mode: 'display' },
    { gmId: HOST_GM_ID },
    { mode: 'host' },
    null,
    undefined,
    'gm-host',
  ]);
  for (const action of ALL_ACTIONS) {
    for (const actor of actors) {
      assert.equal(code(check(actor, action, performances, own())), 'forbidden', `${JSON.stringify(actor)} ${action}`);
      assert.equal(can(actor, action, performances, own()), false);
    }
    assert.equal(code(check(JUDGE, action, removed, own())), 'forbidden', `removed gm-1 ${action}`);
  }
});

test('the host in Judge Mode is held to Judge Mode’s rules', () => {
  const hostJudge = { gmId: HOST_GM_ID, mode: /** @type {const} */ ('judge') };
  assert.equal(code(check(hostJudge, 'publishRound', at('review'))), 'forbidden');
  assert.equal(code(check(hostJudge, 'editAward', performances, others())), 'not_own_award');
  assert.equal(check(hostJudge, 'addAward', performances), null);
});

test('an unknown action is refused even for the host; inputs are never mutated', () => {
  assert.equal(code(check(HOST, /** @type {any} */ ('deleteEverything'), performances)), 'forbidden');
  assert.equal(code(check(JUDGE, /** @type {any} */ ('toString'), performances)), 'forbidden');
  const target = deepFreeze(own());
  assert.doesNotThrow(() => check(JUDGE, 'editAward', performances, target));
  assert.doesNotThrow(() => check(HOST, 'addAward', blankEvent(), deepFreeze({ authorId: 'gm-1' })));
});
