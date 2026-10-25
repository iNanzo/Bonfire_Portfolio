// Saving the campfire game (src/larp/store.js): the saved event round-trips exactly, older saved
// shapes migrate (the repo's "saved state never breaks" rule, A24), malformed or newer saves are
// refused with clear codes, the injected storage may be missing, blocked or full without anything
// throwing (U06), a backup moves an event to a fresh browser identically with its private notes
// (A18), and Export Results lists published scores and award reasons as correct CSV, never notes,
// drafts or who judged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_APP,
  MIGRATIONS,
  STORE_KEY,
  createStore,
  deserialize,
  exportBackup,
  exportResultsCsv,
  importBackup,
  migrate,
  serialize,
} from '../src/larp/store.js';
import { HOST_GM_ID, SCHEMA_VERSION } from '../src/larp/types.js';
import { memberTotals, teamTotals } from '../src/larp/scoring.js';
import { revealSteps } from '../src/larp/phases.js';
import { reduce } from '../src/larp/state.js';
import {
  T0,
  atRound,
  blankEvent,
  deepFreeze,
  eventWithTeams,
  fakeStorage,
  makeIds,
  withAwards,
  withPublished,
} from './lib/larpFixtures.mjs';

/** @typedef {import('../src/larp/types.js').LarpEvent} LarpEvent */

/**
 * An event in the middle of round 2 with everything a save must keep: a published round 1 with
 * team, individual, negative, zero and kept-duplicate awards (with private notes), round 2 drafts
 * and a discarded award, a public correction with a private note, a paused timer, history.
 * Totals: team-1 150, team-4 100 (correction), team-2 70, team-3 0; member m-2-1 25.
 * @returns {LarpEvent}
 */
function richEvent() {
  let e = eventWithTeams(4, { membersPerTeam: 2, gms: 2 });
  e = {
    ...e,
    teams: e.teams.map((t, i) =>
      i === 0 ? { ...t, name: 'Đội Thánh Phaolô, "Tông Đồ"', translation: 'Team Paul' } : t,
    ),
    roster: e.roster.map((m) => (m.id === 'm-2-1' ? { ...m, name: 'Nguyễn Thị Ánh' } : m)),
  };
  e = atRound(e, 0, 'review', {
    statuses: { 'team-1': 'complete', 'team-2': 'complete', 'team-3': 'passed', 'team-4': 'absent' },
  });
  e = withAwards(e, [
    { name: 'Sáng Tạo', translation: 'Creativity', points: 50, note: 'secret note: very loud', authorId: 'gm-1' },
    {
      recipientType: 'member',
      recipientId: 'm-2-1',
      name: 'Dẫn Đầu',
      translation: 'Leadership',
      points: 25,
      note: 'private: helped a shy teammate',
      authorId: 'gm-2',
    },
    { recipientId: 'team-2', name: '=SUM(A1:A9)', translation: 'Formula, "quoted"\nline', points: -30 },
    {
      recipientId: 'team-3',
      name: 'Ghi Nhận',
      translation: 'Recognition',
      points: 0,
      duplicateReason: 'kept on purpose, second skit',
    },
  ]);
  e = withPublished(e, 'round-faith', { publishedAt: T0 + 60_000 });
  e = atRound(e, 1, 'performances', {
    currentTurn: 1,
    timer: { kind: 'turn', status: 'paused', durationMs: 60_000, deadline: null, remainingMs: 41_234 },
  });
  e = withAwards(e, [
    { name: 'Draft Only', points: 40, recipientId: 'team-1' },
    { name: 'Thrown Away', points: 10, recipientId: 'team-4', status: 'discarded' },
  ]);
  return {
    ...e,
    revision: 42,
    updatedAt: T0 + 120_000,
    corrections: [
      {
        id: 'corr-1',
        recipientType: 'team',
        recipientId: 'team-4',
        recipientName: 'Đội 4',
        teamId: 'team-4',
        points: 100,
        reason: 'Scored late, sorry',
        translation: 'Điểm "trễ"\nxin lỗi',
        note: 'private correction note',
        roundId: 'round-faith',
        targetAdjustmentId: null,
        authorId: HOST_GM_ID,
        createdAt: T0 + 90_000,
      },
    ],
    seenCommandIds: ['cmd-1', 'cmd-2'],
    history: [
      { revision: 41, commandId: 'cmd-1', type: 'addAward', actorId: 'gm-1', mode: 'judge', at: T0, ids: ['adj-1'] },
      { revision: 42, commandId: 'cmd-2', type: 'nextTeam', actorId: HOST_GM_ID, mode: 'host', at: T0, ids: [] },
    ],
  };
}

/**
 * A synthetic pre-release (schemaVersion 0) save: no corrections, history, seen ids or reveal,
 * teams without admittedRound, rounds without admittedTeams, awards without batchId or
 * duplicateReason, config without showMembers or hostPin, and the old timer
 * { running, endsAt, remainingMs }.
 */
function v0Save() {
  const e = withPublished(
    withAwards(
      atRound(eventWithTeams(2, { membersPerTeam: 1 }), 0, 'review', {
        statuses: { 'team-1': 'complete', 'team-2': 'passed' },
      }),
      [{ name: 'Sáng Tạo', translation: 'Creativity', points: 50, note: 'old published note' }],
    ),
    'round-faith',
  );
  /** @param {Record<string, any>} a an award as v0 kept it: no batchId or duplicateReason */
  const v0Award = (a) => omit(a, 'batchId', 'duplicateReason');
  return {
    ...omit(e, 'corrections', 'history', 'seenCommandIds', 'reveal'),
    schemaVersion: 0,
    config: omit(e.config, 'showMembers', 'hostPin'),
    teams: e.teams.map((t) => omit(t, 'admittedRound')),
    rounds: e.rounds.map((r) => omit(r, 'admittedTeams')),
    results: e.results.map((r) => ({ ...r, adjustments: r.adjustments.map(v0Award) })),
    adjustments: [
      ...e.adjustments.map(v0Award),
      {
        id: 'adj-old',
        roundId: 'round-dance',
        recipientType: 'team',
        recipientId: 'team-2',
        name: 'Tinh Thần',
        translation: 'Spirit',
        points: 20,
        authorId: HOST_GM_ID,
        note: 'old note',
        status: 'draft',
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    timer: { kind: 'turn', running: true, endsAt: T0 + 30_000, remainingMs: null, durationMs: 60_000 },
  };
}

/**
 * A copy of `obj` without `keys`.
 * @param {Record<string, any>} obj
 * @param {...string} keys
 */
function omit(obj, ...keys) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

/** A small RFC 4180 reader (quoted fields, doubled quotes, newlines inside quotes, '\r\n' rows). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') ((cell += '"'), i++);
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\r' && text[i + 1] === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''), i++);
    else cell += c;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows;
}

/** The CSV's rows as objects keyed by the header. */
function csvRecords(text) {
  const [header, ...rows] = parseCsv(text);
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// ── serialize / deserialize ──────────────────────────────────────────────────────────────────

test('serialize → deserialize gives back the identical event, and never mutates it', () => {
  const event = deepFreeze(richEvent());
  const text = serialize(event);
  assert.equal(JSON.parse(text).schemaVersion, SCHEMA_VERSION);
  const back = deserialize(text);
  assert.equal(back.ok, true);
  assert.deepEqual(back.ok && back.event, event);
  assert.notEqual(back.ok && back.event, event);
  // A running timer comes back as the same deadline: a reload never restarts it.
  const running = {
    ...richEvent(),
    timer: { kind: 'turn', status: 'running', durationMs: 60_000, deadline: T0 + 45_000, remainingMs: null },
  };
  const again = deserialize(serialize(running));
  assert.deepEqual(again.ok && again.event.timer, running.timer);
});

test('deserialize refuses text that is not JSON with bad_json', () => {
  for (const text of ['', '{', 'undefined', '{"id": "e",}', "{'id': 'e'}"]) {
    const r = deserialize(text);
    assert.equal(r.ok, false, text);
    assert.equal(!r.ok && r.reason, 'bad_json', text);
  }
  const notText = deserialize(/** @type {any} */ (null));
  assert.equal(!notText.ok && notText.reason, 'bad_json');
});

test('deserialize refuses JSON that is not a whole, consistent event with bad_backup', () => {
  const good = richEvent();
  /** @type {Array<[string, any]>} */
  const cases = [
    ['null', null],
    ['an array', [good]],
    ['a number', 7],
    ['an empty object', {}],
    ['no teams', { ...good, teams: undefined }],
    ['teams not a list', { ...good, teams: { 'team-1': good.teams[0] } }],
    ['a team without a name', { ...good, teams: [{ ...good.teams[0], name: 42 }, ...good.teams.slice(1)] }],
    ['two teams with one id', { ...good, teams: [good.teams[0], good.teams[0]] }],
    ['points as text', { ...good, adjustments: [{ ...good.adjustments[0], points: '50' }] }],
    ['fractional points', { ...good, adjustments: [{ ...good.adjustments[0], points: 12.5 }] }],
    ['points past the safe range', { ...good, corrections: [{ ...good.corrections[0], points: 2 ** 53 }] }],
    ['an unknown phase', { ...good, phase: 'paused' }],
    ['an unknown round phase', { ...good, roundPhase: 'intermission' }],
    ['a round index past the rounds', { ...good, roundIndex: 9 }],
    [
      'an unknown status',
      { ...good, rounds: [{ ...good.rounds[0], statuses: { 'team-1': 'won' } }, ...good.rounds.slice(1)] },
    ],
    ['two results for one round', { ...good, results: [good.results[0], good.results[0]] }],
    ['a result score as text', { ...good, results: [{ ...good.results[0], teamRoundScores: { 'team-1': '150' } }] }],
    ['two host GMs', { ...good, gms: [...good.gms, { id: 'gm-x', name: 'X', host: true }] }],
    ['no host GM', { ...good, gms: good.gms.filter((g) => !g.host) }],
    ['a broken timer', { ...good, timer: { status: 'ticking' } }],
    ['a broken reveal', { ...good, reveal: { roundId: 'round-faith' } }],
    ['no config', { ...good, config: null }],
    ['an unknown display mode', { ...good, config: { ...good.config, displayMode: 'loud' } }],
  ];
  for (const [label, raw] of cases) {
    const r = deserialize(JSON.stringify(raw));
    assert.equal(r.ok, false, label);
    assert.equal(!r.ok && r.reason, 'bad_backup', label);
    assert.equal(typeof (!r.ok && r.message), 'string', label);
  }
});

test('load and import refuse published results whose scores are unsafe or disagree with their parts', () => {
  const good = richEvent();
  const [result] = good.results;
  /** @param {(r: any) => any} change */
  const withResult = (change) => ({ ...good, results: [change(structuredClone(result))] });
  const max = Number.MAX_SAFE_INTEGER;
  /** @type {Array<[string, any]>} */
  const cases = [
    [
      'two rounds scored at the safe maximum',
      {
        ...good,
        rounds: good.rounds.map((r, i) =>
          i === 1 ? { ...r, order: ['team-1'], statuses: { 'team-1': 'passed' } } : r,
        ),
        results: [
          ...withResult((r) => {
            r.adjustments = [{ ...r.adjustments[0], points: max - 100 }, ...r.adjustments.slice(1)];
            r.teamRoundScores['team-1'] = max;
            return r;
          }).results,
          {
            ...structuredClone(result),
            roundId: 'round-dance',
            roundIndex: 1,
            base: 200,
            completion: { 'team-1': { status: 'passed', points: 0 } },
            adjustments: [{ ...result.adjustments[0], id: 'adj-big', roundId: 'round-dance', points: max }],
            teamRoundScores: { 'team-1': max },
          },
        ],
        adjustments: good.adjustments.filter((a) => a.roundId !== 'round-dance'),
      },
    ],
    [
      'a correction past the safe range',
      { ...good, corrections: [{ ...good.corrections[0], recipientId: 'team-1', teamId: 'team-1', points: max }] },
    ],
    [
      'completion points that are not the base',
      withResult((r) => ((r.completion['team-1'].points = 12345), (r.teamRoundScores['team-1'] = 12395), r)),
    ],
    ['points for a team that passed', withResult((r) => ((r.completion['team-3'].points = 100), r))],
    ['a round score that is not completion + team awards', withResult((r) => ((r.teamRoundScores['team-1'] = 151), r))],
    ['a round score for a team with no completion', withResult((r) => ((r.teamRoundScores['team-9'] = 0), r))],
    ['a team with completion but no round score', withResult((r) => (delete r.teamRoundScores['team-2'], r))],
    ['a result for no round', withResult((r) => ((r.roundId = 'round-nope'), r))],
    [
      'a result for a skipped round',
      { ...good, rounds: good.rounds.map((r, i) => (i === 0 ? { ...r, skipped: true } : r)) },
    ],
    ['Reveal with no reveal', { ...good, roundPhase: 'reveal', reveal: null }],
    [
      'a reveal outside Reveal',
      { ...good, reveal: { roundId: 'round-faith', step: 0, total: 3, paused: false, stepStartedAt: T0 } },
    ],
  ];
  for (const [label, raw] of cases) {
    const r = deserialize(JSON.stringify(raw));
    assert.equal(!r.ok && r.reason, 'bad_backup', label);
    const imported = importBackup(exportBackup(raw));
    assert.equal(!imported.ok && imported.reason, 'bad_backup', label);
    const storage = fakeStorage();
    storage.setItem(STORE_KEY, serialize(raw));
    const loaded = createStore({ storage }).load();
    assert.equal(!loaded.ok && loaded.reason, 'bad_backup', label);
  }
  // A real mid-reveal event loads.
  const revealing = {
    ...atRound(good, 0, 'reveal'),
    adjustments: good.adjustments.filter((a) => a.roundId === 'round-faith'),
  };
  const total = revealSteps(revealing, 'round-faith').length;
  const ok = deserialize(
    JSON.stringify({
      ...revealing,
      reveal: { roundId: 'round-faith', step: 2, total, paused: true, stepStartedAt: T0 },
    }),
  );
  assert.equal(ok.ok, true, !ok.ok ? ok.message : '');
});

test('deserialize refuses a save from a newer build with newer_version, and nonsense versions as bad_backup', () => {
  const newer = deserialize(JSON.stringify({ ...richEvent(), schemaVersion: SCHEMA_VERSION + 1 }));
  assert.equal(!newer.ok && newer.reason, 'newer_version');
  for (const v of [-1, 1.5, '1', null]) {
    const r = deserialize(JSON.stringify({ ...richEvent(), schemaVersion: v }));
    assert.equal(!r.ok && r.reason, 'bad_backup', String(v));
  }
});

test('imported text is only ever data: __proto__ keys are dropped and code-like strings stay strings', () => {
  const good = richEvent();
  const text = JSON.stringify({
    ...good,
    teams: [{ ...good.teams[0], name: '(() => { globalThis.pwned = 1 })()' }, ...good.teams.slice(1)],
  }).replace('{"id":"event-1"', '{"__proto__":{"polluted":true},"id":"event-1"');
  assert.match(text, /__proto__/);
  const r = deserialize(text);
  assert.equal(r.ok, true);
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
  assert.equal(Object.hasOwn(r.ok && r.event, '__proto__'), false);
  assert.equal(Object.getPrototypeOf(r.ok && r.event), Object.prototype);
  assert.equal(r.ok && r.event.teams[0].name, '(() => { globalThis.pwned = 1 })()');
  assert.equal(/** @type {any} */ (globalThis).pwned, undefined);
});

// ── migrations (A24) ─────────────────────────────────────────────────────────────────────────

test('every older schema version has a migration step, so no saved shape is stranded', () => {
  for (let v = 0; v < SCHEMA_VERSION; v++) assert.equal(typeof MIGRATIONS[v], 'function', `MIGRATIONS[${v}]`);
  assert.equal(MIGRATIONS[SCHEMA_VERSION], undefined);
});

test('a v0 save migrates to the current shape without losing a point, a draft or a note', () => {
  const old = deepFreeze(v0Save());
  const m = migrate(old);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(m.corrections, []);
  assert.deepEqual(m.history, []);
  assert.deepEqual(m.seenCommandIds, []);
  assert.equal(m.reveal, null);
  assert.equal(m.config.showMembers, false);
  assert.equal(m.config.hostPin, null);
  assert.deepEqual(
    m.teams.map((t) => t.admittedRound),
    [0, 0],
  );
  assert.deepEqual(
    m.rounds.map((r) => r.admittedTeams),
    [[], [], [], [], []],
  );
  // The old running timer becomes a deadline (never restarted); the draft keeps its note.
  assert.deepEqual(m.timer, {
    kind: 'turn',
    status: 'running',
    durationMs: 60_000,
    deadline: T0 + 30_000,
    remainingMs: null,
  });
  assert.deepEqual(
    m.adjustments,
    old.adjustments.map((/** @type {any} */ a) => ({ ...a, batchId: `batch-${a.id}`, duplicateReason: null })),
  );
  // Published awards get the same fields; everything else in a result (and so every score) is kept.
  assert.deepEqual(
    m.results,
    old.results.map((/** @type {any} */ r) => ({
      ...r,
      adjustments: r.adjustments.map((/** @type {any} */ a) => ({
        ...a,
        batchId: `batch-${a.id}`,
        duplicateReason: null,
      })),
    })),
  );
  assert.equal(m.results[0].adjustments[0].note, 'old published note');

  const loaded = deserialize(JSON.stringify(old));
  assert.equal(loaded.ok, true, !loaded.ok ? loaded.message : '');
  assert.deepEqual(loaded.ok && loaded.event, m);
  assert.deepEqual(teamTotals(m), { 'team-1': 150, 'team-2': 0 });
});

test('a v0 save made mid-reveal migrates with its reveal rebuilt from the start, and plays on', () => {
  const old = deepFreeze({ ...v0Save(), roundPhase: 'reveal', timer: null, updatedAt: T0 + 5000 });
  const m = migrate(old);
  const total = revealSteps(m, 'round-faith').length;
  assert.equal(total, 2 + 1 + 1);
  assert.deepEqual(m.reveal, { roundId: 'round-faith', step: 0, total, paused: false, stepStartedAt: T0 + 5000 });
  const loaded = deserialize(JSON.stringify(old));
  assert.equal(loaded.ok, true, !loaded.ok ? loaded.message : '');
  const ctx = { now: T0 + 10_000, newId: makeIds('m') };
  const host = (/** @type {LarpEvent} */ event, /** @type {any} */ type, n) =>
    reduce(event, { id: `after-${n}`, type, actorId: HOST_GM_ID, mode: 'host', payload: {} }, ctx);
  let event = /** @type {LarpEvent} */ (loaded.ok && loaded.event);
  const before = teamTotals(event);
  for (const [n, type] of /** @type {const} */ (['revealAdvance', 'revealSkip', 'nextRound']).entries()) {
    const r = host(event, type, n);
    assert.equal(r.error, null, `${type}: ${JSON.stringify(r.error)}`);
    event = r.event;
  }
  assert.deepEqual([event.roundIndex, event.roundPhase], [1, 'briefing']);
  assert.deepEqual(teamTotals(event), before);
});

test('the old timer shapes: paused keeps its remaining time, stopped becomes idle', () => {
  const paused = migrate({
    ...v0Save(),
    timer: { kind: 'preparation', running: false, endsAt: null, remainingMs: 12_000, durationMs: 90_000 },
  });
  assert.deepEqual(paused.timer, {
    kind: 'preparation',
    status: 'paused',
    durationMs: 90_000,
    deadline: null,
    remainingMs: 12_000,
  });
  const none = migrate({ ...v0Save(), timer: null });
  assert.deepEqual(none.timer, { kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null });
  const idle = migrate({
    ...v0Save(),
    timer: { kind: 'turn', running: false, endsAt: null, remainingMs: null, durationMs: 45_000 },
  });
  assert.deepEqual(idle.timer, {
    kind: 'turn',
    status: 'idle',
    durationMs: 45_000,
    deadline: null,
    remainingMs: 45_000,
  });
});

test('a save without schemaVersion reads as version 1; a current save passes through unchanged', () => {
  const bare = omit(richEvent(), 'schemaVersion');
  assert.equal(migrate(bare), bare);
  const current = richEvent();
  assert.equal(migrate(current), current);
  const r = deserialize(JSON.stringify(bare));
  assert.equal(r.ok, true);
});

// ── createStore over injected storage (U06) ──────────────────────────────────────────────────

test("save, load and clear under the game's own key, touching nothing else", () => {
  const storage = fakeStorage();
  storage.setItem('bonfire.live.settings', '{"keep":true}');
  const store = createStore({ storage });
  assert.equal(store.key, STORE_KEY);
  assert.deepEqual(store.load(), { ok: true, event: null });
  const event = richEvent();
  assert.deepEqual(store.save(event), { ok: true });
  assert.deepEqual([...storage.map.keys()].sort(), ['bonfire.live.settings', 'larp.event']);
  const loaded = store.load();
  assert.deepEqual(loaded, { ok: true, event });
  assert.deepEqual(store.clear(), { ok: true });
  assert.deepEqual(store.load(), { ok: true, event: null });
  assert.equal(storage.getItem('bonfire.live.settings'), '{"keep":true}');
});

test('a custom key stays inside the larp. prefix', () => {
  const storage = fakeStorage();
  assert.equal(createStore({ storage, key: 'larp.rehearsal' }).key, 'larp.rehearsal');
  const odd = createStore({ storage, key: 'rehearsal' });
  assert.equal(odd.key, 'larp.rehearsal');
  odd.save(blankEvent());
  assert.deepEqual([...storage.map.keys()], ['larp.rehearsal']);
});

test('no storage at all (null, undefined, or not storage-like) fails softly with storage_unavailable', () => {
  for (const storage of [null, undefined, /** @type {any} */ ({}), /** @type {any} */ ({ getItem: 1 })]) {
    const store = createStore({ storage });
    for (const r of [store.save(blankEvent()), store.load(), store.clear()]) {
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.reason, 'storage_unavailable');
    }
  }
});

test('a full storage refuses the write with storage_failed and the previous save survives', () => {
  const small = blankEvent();
  const storage = fakeStorage({ capacity: serialize(small).length + STORE_KEY.length + 10 });
  const store = createStore({ storage });
  assert.deepEqual(store.save(small), { ok: true });
  const big = richEvent();
  const r = store.save(big);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'storage_failed');
  assert.match(!r.ok ? (r.message ?? '') : '', /Quota/);
  assert.deepEqual(store.load(), { ok: true, event: small });
});

test('a storage that throws on every write (private window) never throws out of save', () => {
  const store = createStore({ storage: fakeStorage({ failFrom: 1 }) });
  let r;
  assert.doesNotThrow(() => (r = store.save(richEvent())));
  assert.equal(r.reason, 'storage_failed');
});

test('blocked reads give storage_unavailable; a failing remove gives storage_failed', () => {
  const blocked = createStore({ storage: fakeStorage({ failReads: true }) });
  const r = blocked.load();
  assert.equal(!r.ok && r.reason, 'storage_unavailable');
  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  const c = createStore({ storage }).clear();
  assert.equal(!c.ok && c.reason, 'storage_failed');
});

test('a corrupt or newer save loads as a failure and is left in place, never overwritten by load', () => {
  const storage = fakeStorage();
  storage.setItem(STORE_KEY, '{"id": "event-1", truncated');
  const store = createStore({ storage });
  const r = store.load();
  assert.equal(!r.ok && r.reason, 'bad_json');
  assert.equal(storage.getItem(STORE_KEY), '{"id": "event-1", truncated');
  storage.setItem(STORE_KEY, JSON.stringify({ ...richEvent(), schemaVersion: SCHEMA_VERSION + 3 }));
  const n = store.load();
  assert.equal(!n.ok && n.reason, 'newer_version');
});

test('a v0 save in storage loads migrated and plays on', () => {
  const storage = fakeStorage();
  storage.setItem(STORE_KEY, JSON.stringify(v0Save()));
  const store = createStore({ storage });
  const r = store.load();
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.event?.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(store.save(/** @type {LarpEvent} */ (r.ok && r.event)), { ok: true });
  assert.equal(JSON.parse(storage.getItem(STORE_KEY) ?? '{}').schemaVersion, SCHEMA_VERSION);
});

// ── backups (A18) ────────────────────────────────────────────────────────────────────────────

test('a backup exported here and imported on a fresh browser is the identical event, private notes included', () => {
  const event = deepFreeze(richEvent());
  const text = exportBackup(event);
  const file = JSON.parse(text);
  assert.equal(file.app, BACKUP_APP);
  assert.equal(file.schemaVersion, SCHEMA_VERSION);
  assert.equal(file.exportedAt, event.updatedAt);
  assert.match(text, /secret note: very loud/);
  assert.match(text, /private correction note/);
  assert.match(text, /kept on purpose/);

  const fresh = createStore({ storage: fakeStorage() });
  const r = importBackup(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.event, event);
  assert.deepEqual(fresh.save(/** @type {LarpEvent} */ (r.ok && r.event)), { ok: true });
  assert.deepEqual(fresh.load(), { ok: true, event });
  assert.deepEqual(r.ok && r.summary, {
    title: event.config.title,
    teams: 4,
    members: 8,
    gms: 3,
    roundsPublished: 1,
    phase: 'running',
    roundIndex: 1,
    roundPhase: 'performances',
    updatedAt: T0 + 120_000,
  });
});

test('import also takes a bare saved event, and migrates an old one inside a backup', () => {
  const bare = importBackup(serialize(richEvent()));
  assert.equal(bare.ok, true);
  assert.deepEqual(bare.ok && bare.event, richEvent());
  const old = importBackup(JSON.stringify({ app: BACKUP_APP, schemaVersion: 0, exportedAt: T0, event: v0Save() }));
  assert.equal(old.ok, true);
  assert.equal(old.ok && old.event.schemaVersion, SCHEMA_VERSION);
  assert.equal(old.ok && old.summary.roundsPublished, 1);
});

test('import refuses malformed, foreign and future files with clear codes', () => {
  const event = richEvent();
  /** @type {Array<[string, string, string]>} */
  const cases = [
    ['not JSON', 'Lửa Trại', 'bad_json'],
    ['empty', '', 'bad_json'],
    ['another app', JSON.stringify({ app: 'painter', schemaVersion: 1, event }), 'bad_backup'],
    ['no event', JSON.stringify({ app: BACKUP_APP, schemaVersion: 1 }), 'bad_backup'],
    [
      'a broken event',
      JSON.stringify({ app: BACKUP_APP, schemaVersion: 1, event: { ...event, rounds: 'five' } }),
      'bad_backup',
    ],
    ['a newer backup', JSON.stringify({ app: BACKUP_APP, schemaVersion: SCHEMA_VERSION + 1, event }), 'newer_version'],
    [
      'a newer event in an old envelope',
      JSON.stringify({ app: BACKUP_APP, schemaVersion: 1, event: { ...event, schemaVersion: SCHEMA_VERSION + 1 } }),
      'newer_version',
    ],
    ['a list', JSON.stringify([event]), 'bad_backup'],
  ];
  for (const [label, text, reason] of cases) {
    const r = importBackup(text);
    assert.equal(r.ok, false, label);
    assert.equal(!r.ok && r.reason, reason, label);
  }
});

// ── Export Results ───────────────────────────────────────────────────────────────────────────

test('Export Results lists standings, round scores, published awards, corrections and member totals', () => {
  const event = richEvent();
  const csv = exportResultsCsv(deepFreeze(event));
  const records = csvRecords(csv);
  const header = parseCsv(csv)[0];
  assert.deepEqual(header, [
    'Section',
    'Place',
    'Team',
    'Team Translation',
    'Member',
    'Round',
    'Detail',
    'Name',
    'Translation',
    'Points',
  ]);
  for (const r of parseCsv(csv)) assert.equal(r.length, header.length);

  const standings = records.filter((r) => r.Section === 'Standing');
  const totals = teamTotals(event);
  assert.deepEqual(
    standings.map((r) => [r.Place, r.Team, r.Points]),
    [
      ['1', 'Đội Thánh Phaolô, "Tông Đồ"', String(totals['team-1'])],
      ['2', 'Đội 4', '100'],
      ['3', 'Đội 2', '70'],
      ['4', 'Đội 3', '0'],
    ],
  );
  assert.equal(standings[0]['Team Translation'], 'Team Paul');

  const scores = records.filter((r) => r.Section === 'Round Score');
  assert.equal(scores.length, 4);
  assert.ok(scores.every((r) => r.Round.includes('Faith Discovery') && r.Round.includes('Khám Phá Đức Tin')));
  assert.deepEqual(
    scores.map((r) => [r.Team, r.Detail, r.Points]),
    [
      ['Đội Thánh Phaolô, "Tông Đồ"', 'Complete', '150'],
      ['Đội 2', 'Complete', '70'],
      ['Đội 3', 'Passed', '0'],
      ['Đội 4', 'Absent', '0'],
    ],
  );

  const awards = records.filter((r) => r.Section === 'Award');
  assert.deepEqual(
    awards.map((r) => [r.Team, r.Member, r.Detail, r.Name, r.Points]),
    [
      ['Đội Thánh Phaolô, "Tông Đồ"', '', 'Team Award', 'Sáng Tạo', '50'],
      ['Đội 2', 'Nguyễn Thị Ánh', 'Individual Award', 'Dẫn Đầu', '25'],
      ['Đội 2', '', 'Team Award', "'=SUM(A1:A9)", '-30'],
      ['Đội 3', '', 'Team Award', 'Ghi Nhận', '0'],
    ],
  );
  assert.equal(awards[2].Translation, 'Formula, "quoted"\nline');

  const corrections = records.filter((r) => r.Section === 'Correction');
  assert.deepEqual(
    corrections.map((r) => [r.Team, r.Detail, r.Name, r.Translation, r.Points]),
    [['Đội 4', 'Team Correction', 'Scored late, sorry', 'Điểm "trễ"\nxin lỗi', '100']],
  );
  assert.ok(corrections[0].Round.includes('Faith Discovery'));

  const members = records.filter((r) => r.Section === 'Member Total');
  assert.equal(members.length, 8);
  assert.deepEqual(
    [members[0].Place, members[0].Member, members[0].Team, members[0].Points],
    ['1', 'Nguyễn Thị Ánh', 'Đội 2', '25'],
  );
  assert.equal(members[0].Points, String(memberTotals(event)['m-2-1']));
  assert.ok(members.slice(1).every((r) => r.Place === '2' && r.Points === '0'));
});

test('Export Results never includes private notes, duplicate reasons, drafts, discarded awards or who judged', () => {
  const csv = exportResultsCsv(richEvent());
  for (const secret of [
    'secret note',
    'helped a shy teammate',
    'private correction note',
    'kept on purpose',
    'Draft Only',
    'Thrown Away',
    'Anh 1',
    'Anh 2',
    'gm-1',
    HOST_GM_ID,
  ]) {
    assert.equal(csv.includes(secret), false, secret);
  }
});

test('Export Results quotes per RFC 4180: commas, quotes and newlines quoted, quotes doubled, rows end \\r\\n', () => {
  const csv = exportResultsCsv(richEvent());
  assert.ok(csv.startsWith('Section,Place,Team,'));
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('"Đội Thánh Phaolô, ""Tông Đồ"""'));
  assert.ok(csv.includes('"Formula, ""quoted""\nline"'));
  assert.ok(csv.includes('"Điểm ""trễ""\nxin lỗi"'));
  // Plain cells stay unquoted, and Vietnamese is kept as it is (no escaping of diacritics).
  assert.ok(csv.includes(',Đội 2,'));
  assert.ok(csv.includes('Nguyễn Thị Ánh'));
  // Every line break outside quotes is a row break: no bare '\n' between rows.
  const outside = csv.replace(/"(?:[^"]|"")*"/g, '');
  assert.equal(outside.replace(/\r\n/g, '').includes('\n'), false);
});

test('Export Results: ties share a place and skip (1, 1, 3); skipped rounds are listed; nothing published is just standings at 0', () => {
  let e = atRound(eventWithTeams(3), 0, 'review', {
    statuses: { 'team-1': 'complete', 'team-2': 'complete', 'team-3': 'absent' },
  });
  e = withPublished(e, 'round-faith');
  e = { ...e, rounds: e.rounds.map((r) => (r.id === 'round-dance' ? { ...r, skipped: true } : r)) };
  const records = csvRecords(exportResultsCsv(e));
  assert.deepEqual(
    records.filter((r) => r.Section === 'Standing').map((r) => [r.Place, r.Team, r.Points]),
    [
      ['1', 'Đội 1', '100'],
      ['1', 'Đội 2', '100'],
      ['3', 'Đội 3', '0'],
    ],
  );
  const skipped = records.filter((r) => r.Section === 'Skipped Round');
  assert.equal(skipped.length, 1);
  assert.ok(skipped[0].Round.includes('Dance'));
  assert.equal(skipped[0].Detail, 'Skipped');

  const setup = csvRecords(exportResultsCsv(eventWithTeams(2)));
  assert.deepEqual(
    setup.map((r) => [r.Section, r.Place, r.Points]),
    [
      ['Standing', '1', '0'],
      ['Standing', '1', '0'],
    ],
  );
  assert.equal(exportResultsCsv(blankEvent()).split('\r\n').length, 2);
});
