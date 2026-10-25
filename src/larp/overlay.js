// The campfire game's controls: the host's bar over the fire (Bonfire Live's HUD: it fades with
// the cursor after 3 s of a still mouse, unless the mouse is on it or it has the focus), the
// team picker a modifier opens (or points by hand, from a scoreboard row), and the keys. None
// of it is ever copied to the output window.
//
//   createOverlay(ctx) → { draw(game), pickFor(modId), pickPoints(teamId), wake(), handleKey(e) }
// What a click or key does goes through ctx: dispatch(action), award(teamId, modId | points),
// output(), setup(), keys(), dismissKnights(), note(text).
import { esc } from '../html.js';
import { typing, toggleFullscreen } from '../ui/shell.js';
import { isHelpKey } from '../ui/keysOverlay.js';
import { currentRound, gainText, signed, times } from './game.js';

/** Points by hand, from a scoreboard row. */
export const HAND_POINTS = Object.freeze([-10, -5, -1, 1, 5, 10]);
/** How long the controls wait for a still mouse before fading (ms). */
export const IDLE_MS = 3000;

/** What a modifier gives, for its button ("+10", "×2", "+50 ★"). @param {import('./game.js').Modifier} m */
export const modTag = (m) => `${gainText({ gain: m.points, mult: m.mult })}${m.special ? ' ★' : ''}`;

/**
 * The modifiers' buttons (the first nine numbered for their keys).
 * @param {import('./game.js').Game} game
 */
export function modsMarkup(game) {
  return game.modifiers
    .map((m, i) => {
      const key = i < 9 ? `<kbd>${i + 1}</kbd>` : '';
      const tip =
        `${m.subtitle ? `${m.subtitle}. ` : ''}${m.special ? 'Calls the knights in. ' : ''}${i < 9 ? `Key ${i + 1}.` : ''}`.trim();
      return `<button type="button" class="pix-btn larp-mod${m.special ? ' is-special' : ''}" data-act="mod" data-mod="${esc(m.id)}" data-tip-title="${esc(m.title)}" data-tip="${esc(tip || 'Give this to a team.')}">${key}<span class="larp-mod-title">${esc(m.title)}</span><span class="larp-mod-tag">${esc(modTag(m))}</span></button>`;
    })
    .join('');
}

/**
 * @param {{
 *   root: HTMLElement, game: () => import('./game.js').Game, dispatch: (a: import('./game.js').Action) => boolean,
 *   award: (teamId: string, what: { modId?: string, points?: number }) => void, output: () => void, setup: () => void,
 *   keys: () => void, keysOpen: () => boolean, setupOpen: () => boolean, dismissKnights: () => void, note: (text: string) => void,
 * }} ctx
 */
export function createOverlay(ctx) {
  const { root } = ctx;
  const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (root.querySelector(s));
  const hud = q('[data-hud]');
  const picker = q('[data-picker]');
  const pickerTitle = q('[data-picker-title]');
  const pickerList = q('[data-picker-list]');
  const mods = q('[data-mods]');
  const roundEl = q('[data-hud-round]');
  const timerLabel = q('[data-timer-label]');
  /** @type {{ modId?: string, teamId?: string } | null} */
  let picking = null;
  /** @type {HTMLElement | null} */
  let pickerFrom = null;
  let lastMods = '';

  /** @param {import('./game.js').Game} game */
  function draw(game) {
    const m = modsMarkup(game);
    if (m !== lastMods) {
      lastMods = m;
      mods.innerHTML = m;
    }
    roundEl.textContent = currentRound(game).name;
    timerLabel.textContent =
      game.timer.status === 'running' ? 'Pause' : game.timer.status === 'paused' ? 'Resume' : 'Start';
    // (A picker for a modifier or team that's gone closes.)
    if (picking?.modId && !game.modifiers.some((x) => x.id === picking?.modId)) closePicker();
    if (picking?.teamId && !game.teams.some((x) => x.id === picking?.teamId)) closePicker();
  }

  /** @param {string} title @param {string} items */
  function openPicker(title, items) {
    pickerFrom = /** @type {HTMLElement|null} */ (document.activeElement);
    pickerTitle.textContent = title;
    pickerList.innerHTML = items;
    picker.hidden = false;
    /** @type {HTMLElement|null} */ (pickerList.querySelector('button'))?.focus();
    wake();
  }
  function closePicker() {
    if (picker.hidden) return;
    picker.hidden = true;
    picking = null;
    pickerFrom?.isConnected && pickerFrom.focus();
    pickerFrom = null;
  }

  /**
   * A modifier was chosen: with one team it goes straight to it, otherwise the picker asks which.
   * @param {string} modId
   */
  function pickFor(modId) {
    const game = ctx.game();
    const mod = game.modifiers.find((m) => m.id === modId);
    if (!mod) return;
    if (game.teams.length === 1) return ctx.award(game.teams[0].id, { modId });
    picking = { modId };
    openPicker(
      `${mod.title} (${modTag(mod)}): Which Team?`,
      game.teams
        .map(
          (t, i) =>
            `<button type="button" class="pix-btn larp-pick" data-act="pick" data-team="${esc(t.id)}" style="--team: ${esc(t.color)}">${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}<span class="larp-row-pip" aria-hidden="true"></span>${esc(t.name)}</button>`,
        )
        .join(''),
    );
  }

  /**
   * Points by hand for a team (a scoreboard row).
   * @param {string} teamId
   */
  function pickPoints(teamId) {
    const team = ctx.game().teams.find((t) => t.id === teamId);
    if (!team) return;
    picking = { teamId };
    openPicker(
      `Points for ${team.name}`,
      HAND_POINTS.map(
        (n) =>
          `<button type="button" class="pix-btn larp-pick" data-act="hand" data-points="${n}">${signed(n)}</button>`,
      ).join(''),
    );
  }

  root.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-act]'));
    if (!el || el.closest('[data-setup]')) return;
    const act = el.dataset.act;
    const game = ctx.game();
    if (act === 'mod') return pickFor(el.dataset.mod ?? '');
    if (act === 'team') return pickPoints(el.dataset.team ?? '');
    if (act === 'pick' && picking?.modId) {
      const modId = picking.modId;
      closePicker();
      return ctx.award(el.dataset.team ?? '', { modId });
    }
    if (act === 'hand' && picking?.teamId) {
      const teamId = picking.teamId;
      closePicker();
      return ctx.award(teamId, { points: Number(el.dataset.points) });
    }
    if (act === 'pick-cancel') return closePicker();
    if (act === 'prev') return void ctx.dispatch({ type: 'round', index: game.roundIndex - 1 });
    if (act === 'next') return void ctx.dispatch({ type: 'round', index: game.roundIndex + 1 });
    if (act === 'timer') return void ctx.dispatch({ type: 'timer', op: 'toggle' });
    if (act === 'add') return void ctx.dispatch({ type: 'timer', op: 'add', ms: 60_000 });
    if (act === 'reset') return void ctx.dispatch({ type: 'timer', op: 'reset' });
    if (act === 'undo') return undo();
    if (act === 'knights') return ctx.dismissKnights();
    if (act === 'output') return ctx.output();
    if (act === 'setup') return ctx.setup();
    if (act === 'keys') return ctx.keys();
  });

  function undo() {
    const last = ctx.game().log.at(-1);
    if (!last) return ctx.note('Nothing to undo');
    ctx.dispatch({ type: 'undo' });
    ctx.note(`Undone: ${last.title} (${last.mult > 1 && !last.gain ? times(last.mult) : signed(last.gain)})`);
  }

  /** The single keys (keys.js lists them all). @type {Record<string, (game: import('./game.js').Game) => void>} */
  const byKey = {
    ' ': () => ctx.dispatch({ type: 'timer', op: 'toggle' }),
    '+': () => ctx.dispatch({ type: 'timer', op: 'add', ms: 60_000 }),
    '=': () => ctx.dispatch({ type: 'timer', op: 'add', ms: 60_000 }),
    ArrowLeft: (game) => ctx.dispatch({ type: 'round', index: game.roundIndex - 1 }),
    ArrowRight: (game) => ctx.dispatch({ type: 'round', index: game.roundIndex + 1 }),
    r: () => ctx.dispatch({ type: 'timer', op: 'reset' }),
    z: () => undo(),
    k: () => ctx.dismissKnights(),
    o: () => ctx.output(),
    f: () => toggleFullscreen(),
    h: () => document.body.classList.toggle('hud-off'),
    s: () => ctx.setup(),
  };

  /**
   * The keys (keys.js lists them). Returns whether it took the key.
   * @param {KeyboardEvent} e
   */
  function handleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return false;
    if (ctx.setupOpen() || ctx.keysOpen()) return false;
    if (isHelpKey(e)) {
      ctx.keys();
      return true;
    }
    const game = ctx.game();
    // The picker open: 1–9 picks, Esc closes; nothing else gets past it.
    if (!picker.hidden) {
      if (e.key === 'Escape') closePicker();
      else if (/^Digit[1-9]$/.test(e.code)) {
        const btns = /** @type {HTMLElement[]} */ ([...pickerList.querySelectorAll('button')]);
        btns[Number(e.code.slice(5)) - 1]?.click();
      } else return false;
      return true;
    }
    if (/^Digit[1-9]$/.test(e.code) && !e.shiftKey) {
      const mod = game.modifiers[Number(e.code.slice(5)) - 1];
      if (mod) pickFor(mod.id);
      return true;
    }
    const run = byKey[e.key] ?? byKey[e.key.toLowerCase()];
    if (!run) return false;
    run(game);
    return true;
  }
  window.addEventListener('keydown', (e) => {
    if (handleKey(e)) {
      e.preventDefault();
      wake();
    }
  });

  // Idle: the controls and the cursor fade when the mouse rests (Bonfire Live's hud.js).
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let idleTimer = 0;
  function wake() {
    document.body.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (
        ctx.setupOpen() ||
        ctx.keysOpen() ||
        !picker.hidden ||
        hud.matches(':hover') ||
        hud.contains(document.activeElement)
      )
        return;
      document.body.classList.add('is-idle');
    }, IDLE_MS);
  }
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  hud.addEventListener('focusin', wake);
  wake();

  return { draw, pickFor, pickPoints, wake, handleKey, closePicker };
}
