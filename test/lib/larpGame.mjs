// A driver for the campfire game's reducer tests (src/larp/state.js): it holds the current event,
// a hand-moved clock and a readable id generator, builds commands (as the host or a co-GM in
// Judge Mode) and applies them through reduce(), asserting each one is accepted (ok) or refused
// with a given code and the event left untouched (refuse). Every input event is deep-frozen
// first, so a reducer that mutated what it was given would throw.
import assert from 'node:assert/strict';
import { reduce } from '../../src/larp/state.js';
import { commander, deepFreeze, makeClock, makeIds } from './larpFixtures.mjs';

/**
 * @typedef {import('../../src/larp/types.js').LarpEvent} LarpEvent
 * @typedef {import('../../src/larp/types.js').Command} Command
 * @typedef {import('../../src/larp/types.js').CommandType} CommandType
 * @typedef {import('../../src/larp/types.js').ErrorCode} ErrorCode
 * @typedef {import('../../src/larp/types.js').ReduceResult} ReduceResult
 */

/**
 * @param {LarpEvent} event
 * @param {{ clock?: ReturnType<typeof makeClock>, ids?: (kind?: string) => string, commandPrefix?: string }} [opts]
 *   commandPrefix: host() and judge() commands get ids '<prefix>-<n>' instead of the commander's
 *   'cmd-<n>' (for a game resumed from an event whose history already used those)
 */
export function game(event, { clock = makeClock(), ids = makeIds('g'), commandPrefix } = {}) {
  const base = commander({ clock });
  let sent = 0;
  /** @param {Partial<Command>} [extra] */
  const withId = (extra = {}) => (commandPrefix ? { id: `${commandPrefix}-${++sent}`, ...extra } : extra);
  const cmd = {
    /** @param {CommandType} type @param {any} [payload] @param {Partial<Command>} [extra] */
    host: (type, payload, extra) => base.host(type, payload, withId(extra)),
    /** @param {string} gmId @param {CommandType} type @param {any} [payload] @param {Partial<Command>} [extra] */
    judge: (gmId, type, payload, extra) => base.judge(gmId, type, payload, withId(extra)),
  };
  const g = {
    event: deepFreeze(event),
    clock,
    cmd,
    /** The reducer context at the clock's current time. */
    ctx: () => ({ now: clock.now(), newId: ids }),
    /**
     * Applies a command; an accepted one replaces the held event.
     * @param {Command} command
     * @returns {ReduceResult}
     */
    apply(command) {
      const result = reduce(g.event, command, g.ctx());
      if (!result.error) g.event = deepFreeze(result.event);
      return result;
    },
    /**
     * Applies a command that must be accepted.
     * @param {Command} command
     */
    ok(command) {
      const result = g.apply(command);
      assert.equal(result.error, null, `${command.type} was refused: ${JSON.stringify(result.error)}`);
      return result;
    },
    /**
     * Applies a command that must be refused with `code`, leaving the event as it was.
     * @param {Command} command
     * @param {ErrorCode} code
     */
    refuse(command, code) {
      const before = g.event;
      const result = reduce(before, command, g.ctx());
      assert.equal(result.error?.code, code, `${command?.type}: expected ${code}, got ${JSON.stringify(result.error)}`);
      assert.equal(result.event, before, 'a refused command returns the input event');
      assert.deepEqual(result.events, []);
      return result;
    },
    /** @param {CommandType} type @param {any} [payload] @param {Partial<Command>} [extra] */
    host: (type, payload, extra) => g.ok(cmd.host(type, payload, extra)),
    /** @param {string} gmId @param {CommandType} type @param {any} [payload] @param {Partial<Command>} [extra] */
    judge: (gmId, type, payload, extra) => g.ok(cmd.judge(gmId, type, payload, extra)),
    /** The current round. */
    round: () => g.event.rounds[g.event.roundIndex],
    /**
     * Plays the current round's performances: prep ends, every queued team takes its turn.
     */
    perform() {
      g.host('startPreparation');
      clock.advance(g.round().prepMs);
      g.host('endPreparation');
      for (let i = 0; i < g.round().order.length; i++) {
        g.host('nextTeam');
        clock.advance(g.round().turnMs);
      }
    },
    /**
     * Sets every queued team's status ('complete' unless listed), reviews, publishes and skips the
     * reveal to Results.
     * @param {Record<string, import('../../src/larp/types.js').CompletionStatus>} [statuses]
     */
    publish(statuses = {}) {
      if (g.event.roundPhase === 'performances') g.host('beginReview');
      for (const teamId of g.round().order) {
        if (!Object.hasOwn(g.round().statuses, teamId) || statuses[teamId]) {
          g.host('setStatus', { teamId, status: statuses[teamId] ?? 'complete' });
        }
      }
      g.host('publishRound', { roundId: g.round().id });
    },
  };
  return g;
}

/**
 * The ids of the event's adjustments that match `pred`.
 * @param {LarpEvent} event
 * @param {(a: import('../../src/larp/types.js').Adjustment) => boolean} pred
 */
export const adjIds = (event, pred) => event.adjustments.filter(pred).map((a) => a.id);
