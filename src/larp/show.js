// What the projector shows besides the fire and the banners: the scoreboard (teams by score,
// each with its color, ties sharing a place) and the round with its timer and this round's
// multipliers. Drawn as HTML over the canvas and copied to the output window whenever what it
// says changes (the timer at most once a second), never more.
//
//   boardMarkup(game) / clockParts(game, now)   pure: the tests read them
//   createShow({ board, clock, mirror }) → { draw(game, now) }
import { esc } from '../html.js';
import { activeMults, currentRound, standings, times } from './game.js';
import { clockText, expired, remaining } from './timer.js';

/** The last stretch of a round, when the clock turns to the fire's color (ms). */
export const LAST_MS = 10_000;

/** @param {number} n */
const score = (n) => (n < 0 ? `−${-n}` : String(n));

/**
 * The scoreboard: one row per team, highest first. Each row is a button: on the laptop it opens
 * points by hand for that team (overlay.js); on the projector it's only what it shows.
 * @param {import('./game.js').Game} game
 */
export function boardMarkup(game) {
  return standings(game)
    .map(
      ({ team, score: s, place }) =>
        `<button type="button" class="larp-row" data-act="team" data-team="${esc(team.id)}" style="--team: ${esc(team.color)}" data-tip="Points by hand for ${esc(team.name)}"><span class="larp-row-place">${place}</span><span class="larp-row-pip" aria-hidden="true"></span><span class="larp-row-name">${esc(team.name)}</span><span class="larp-row-score">${score(s)}</span></button>`,
    )
    .join('');
}

/**
 * The clock's parts: the round's name ("Round 2 of 5"), the time left, its state (idle,
 * running, paused, low: the last stretch, out: run out), and the multipliers.
 * @param {import('./game.js').Game} game
 * @param {number} now
 */
export function clockParts(game, now) {
  const t = game.timer;
  const left = remaining(t, now);
  const state = expired(t, now) ? 'out' : t.status === 'running' && left <= LAST_MS ? 'low' : t.status;
  return {
    round: `${currentRound(game).name} · ${game.roundIndex + 1} of ${game.rounds.length}`,
    time: clockText(left),
    state,
    mults: activeMults(game).map(({ team, mult }) => ({ name: team.name, color: team.color, text: times(mult) })),
  };
}

/**
 * @param {{ board: HTMLElement, clock: HTMLElement, mirror?: (el: HTMLElement) => void }} o
 */
export function createShow({ board, clock, mirror = () => {} }) {
  const roundEl = /** @type {HTMLElement} */ (clock.querySelector('[data-clock-round]'));
  const timeEl = /** @type {HTMLElement} */ (clock.querySelector('[data-clock-time]'));
  const multsEl = /** @type {HTMLElement} */ (clock.querySelector('[data-mults]'));
  let lastBoard = '';
  let lastClock = '';

  /**
   * Draws what changed; copies it to the output window if it did.
   * @param {import('./game.js').Game} game
   * @param {number} now
   */
  function draw(game, now) {
    const b = boardMarkup(game);
    if (b !== lastBoard) {
      lastBoard = b;
      board.innerHTML = b;
      mirror(board);
    }
    const c = clockParts(game, now);
    const key = JSON.stringify(c);
    if (key === lastClock) return;
    lastClock = key;
    roundEl.textContent = c.round;
    timeEl.textContent = c.time;
    clock.dataset.state = c.state;
    multsEl.innerHTML = c.mults
      .map((m) => `<span class="larp-mult" style="--team: ${esc(m.color)}">${esc(m.text)} ${esc(m.name)}</span>`)
      .join('');
    mirror(clock);
  }

  return { draw };
}
