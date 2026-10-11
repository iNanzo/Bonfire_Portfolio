// The campfire game's Setup dialog (S): four tabs drawn from the game. Teams (a name and a
// color), Rounds (a name, how long, and the scene the bonfire plays), Modifiers (the banner's
// title and subtitle, points, a multiplier for the rest of the round, Special to call the
// knights in, and the fire's reaction), and the Game (its title, how long a banner holds, how
// many knights a Special banner calls, reduced motion; clearing the scores, a new game,
// export and import). Fields are the shared ones (src/ui/fields.js), each bound by
// data-set="<list>.<id>.<key>" or "game.<key>"; a typed change is dispatched as it's made, and a
// tab is drawn again only when its list changes shape (added, moved, removed), so typing keeps
// its place.
import { esc } from '../html.js';
import { check, number, select, text } from '../ui/fields.js';
import { BANNER_MS, LIMITS } from './game.js';
import { REACTIONS } from './reactions.js';
import { SETUP_TABS } from './markup.js';

const MIN = 60_000;
/** The multipliers a modifier offers. */
export const MULTS = Object.freeze([
  ['1', 'None'],
  ['1.5', '×1.5'],
  ['2', '×2'],
  ['3', '×3'],
  ['5', '×5'],
]);

/** @param {string} list @param {string} id @param {number} i @param {number} n */
const rowTools = (list, id, i, n) => `
  <div class="larp-row-tools" role="group" aria-label="Order">
    <button type="button" class="bulk-btn" data-move="${list}" data-id="${esc(id)}" data-by="-1" aria-label="Move Up" data-tip="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
    <button type="button" class="bulk-btn" data-move="${list}" data-id="${esc(id)}" data-by="1" aria-label="Move Down" data-tip="Move down"${i === n - 1 ? ' disabled' : ''}>↓</button>
    <button type="button" class="bulk-btn" data-remove="${list}" data-id="${esc(id)}" aria-label="Remove" data-tip="Remove this one">✕</button>
  </div>`;

/** @param {string} list @param {string} label @param {boolean} full */
const addButton = (list, label, full) =>
  `<button type="button" class="pix-btn larp-add" data-add="${list}"${full ? ' disabled' : ''}>${esc(label)}</button>`;

/**
 * A tab's markup for the game.
 * @param {string} tab
 * @param {import('./game.js').Game} game
 * @param {{ ref: string, name: string }[]} scenes
 */
export function panelMarkup(tab, game, scenes) {
  if (tab === 'teams')
    return `
    <p class="larp-help">Each team’s name and color show on the scoreboard and on its banners.</p>
    ${game.teams
      .map(
        (t, i) => `
      <fieldset class="larp-item larp-item-team" data-item="${esc(t.id)}">
        <legend class="visually-hidden">${esc(t.name)}</legend>
        ${text(`teams.${t.id}.name`, 'Name', { max: LIMITS.name })}
        <label class="viz-field larp-color"><span class="viz-field-label">Color</span><input type="color" data-set="teams.${esc(t.id)}.color"></label>
        ${rowTools('teams', t.id, i, game.teams.length)}
      </fieldset>`,
      )
      .join('')}
    ${addButton('teams', 'Add a Team', game.teams.length >= LIMITS.teams)}`;
  if (tab === 'rounds') {
    const opts = [['', 'The Site’s Own Fire'], ...scenes.map((s) => [s.ref, s.name])];
    return `
    <p class="larp-help">Each round plays its own scene: made in the Bonfire Painter, or one of the site’s.</p>
    ${game.rounds
      .map(
        (r, i) => `
      <fieldset class="larp-item larp-item-round" data-item="${esc(r.id)}">
        <legend class="visually-hidden">${esc(r.name)}</legend>
        ${text(`rounds.${r.id}.name`, 'Name', { max: LIMITS.name })}
        ${number(`rounds.${r.id}.minutes`, 'Minutes', { min: 0, max: 180, step: 0.5 })}
        ${select(`rounds.${r.id}.scene`, 'Scene', r.scene && !scenes.some((s) => s.ref === r.scene) ? [...opts, [r.scene, 'A Scene Not Here']] : opts)}
        ${rowTools('rounds', r.id, i, game.rounds.length)}
      </fieldset>`,
      )
      .join('')}
    ${addButton('rounds', 'Add a Round', game.rounds.length >= LIMITS.rounds)}`;
  }
  if (tab === 'modifiers')
    return `
    <p class="larp-help">The first nine are on keys 1–9. Special calls the knights in; they cheer every banner after it.</p>
    ${game.modifiers
      .map(
        (m, i) => `
      <fieldset class="larp-item larp-item-mod" data-item="${esc(m.id)}">
        <legend class="visually-hidden">${esc(m.title)}</legend>
        ${text(`modifiers.${m.id}.title`, 'Title', { max: LIMITS.title })}
        ${text(`modifiers.${m.id}.subtitle`, 'Subtitle', { max: LIMITS.subtitle })}
        ${number(`modifiers.${m.id}.points`, 'Points', { min: -LIMITS.points, max: LIMITS.points })}
        ${select(`modifiers.${m.id}.mult`, 'Multiplier', MULTS.some(([v]) => Number(v) === m.mult) ? [...MULTS] : [...MULTS, [String(m.mult), `×${m.mult}`]], { hint: 'Multiplies the team’s points from now to the end of the round.' })}
        ${select(`modifiers.${m.id}.reaction`, 'Fire', Object.entries(REACTIONS), { hint: 'What the bonfire does when its banner comes up. Random rolls a new one each time.' })}
        ${check(`modifiers.${m.id}.special`, 'Special')}
        ${rowTools('modifiers', m.id, i, game.modifiers.length)}
      </fieldset>`,
      )
      .join('')}
    ${addButton('modifiers', 'Add a Modifier', game.modifiers.length >= LIMITS.modifiers)}`;
  return `
    <div class="larp-game-grid">
      ${text('game.title', 'Game Title', { max: LIMITS.title, hint: 'The window’s title, and the export file’s name.' })}
      ${number('game.bannerSeconds', 'Banner Time', { min: BANNER_MS.min / 1000, max: BANNER_MS.max / 1000, step: 0.5, unit: 's', hint: 'How long each banner holds. Banners given quickly wait their turn.' })}
      ${number('game.knightCount', 'Knights', { min: 1, max: LIMITS.knights, hint: 'How many knights a Special banner calls to the fire.' })}
      ${check('game.reducedMotion', 'Reduced Motion', { hint: 'Banners still show, but the fire only stokes gently and the knights stay seated.' })}
    </div>
    <div class="larp-game-actions">
      <button type="button" class="pix-btn" data-game="export">Export the Game</button>
      <label class="pix-btn larp-import">Import a Game<input type="file" accept=".json,application/json" data-game="import" hidden></label>
      <button type="button" class="pix-btn" data-game="clear">Clear the Scores</button>
      <button type="button" class="pix-btn" data-game="new">New Game</button>
    </div>`;
}

/**
 * The value a field shows for the game.
 * @param {import('./game.js').Game} game
 * @param {string} key
 */
export function fieldValue(game, key) {
  const [list, id, prop] = key.split('.');
  if (list === 'game') {
    if (id === 'bannerSeconds') return game.bannerMs / 1000;
    return /** @type {any} */ (game)[id];
  }
  const item = /** @type {any} */ (game)[list]?.find((/** @type {any} */ x) => x.id === id);
  if (!item) return undefined;
  if (prop === 'minutes') return item.durationMs / MIN;
  if (prop === 'scene') return item.scene ?? '';
  if (prop === 'mult') return String(item.mult);
  return item[prop];
}

/**
 * A field's change as the game's action.
 * @param {string} key
 * @param {unknown} raw  the input's value (checked for a checkbox)
 * @returns {import('./game.js').Action | null}
 */
export function fieldAction(key, raw) {
  const [list, id, prop] = key.split('.');
  if (list === 'game') {
    if (id === 'bannerSeconds') return { type: 'set', key: 'bannerMs', value: Number(raw) * 1000 };
    if (id === 'title' || id === 'knightCount' || id === 'reducedMotion')
      return { type: 'set', key: id, value: id === 'knightCount' ? Number(raw) : raw };
    return null;
  }
  if (list !== 'teams' && list !== 'rounds' && list !== 'modifiers') return null;
  if (prop === 'minutes') return { type: 'edit', list, id, key: 'durationMs', value: Number(raw) * MIN };
  if (prop === 'scene') return { type: 'edit', list, id, key: 'scene', value: raw || null };
  if (prop === 'points' || prop === 'mult') return { type: 'edit', list, id, key: prop, value: Number(raw) };
  return { type: 'edit', list, id, key: prop, value: raw };
}

/**
 * Wires the dialog. `ctx`: { game(), dispatch(action), scenes(), exportGame(), importGame(file), note(text) }.
 * @param {HTMLDialogElement} dialog
 * @param {{ game: () => import('./game.js').Game, dispatch: (a: import('./game.js').Action) => boolean,
 *   scenes: () => { ref: string, name: string }[], exportGame: () => void, importGame: (file: File) => void,
 *   confirm?: (text: string) => boolean }} ctx
 */
export function createSetup(dialog, ctx) {
  const confirmIt = ctx.confirm ?? ((t) => window.confirm(t));
  const tabs = /** @type {HTMLButtonElement[]} */ ([...dialog.querySelectorAll('[data-tab]')]);
  const panels = /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll('[data-tab-panel]')]);
  let current = 'teams';

  /** Draws a tab and fills its fields. @param {string} tab */
  function draw(tab) {
    const panel = panels.find((p) => p.dataset.tabPanel === tab);
    if (!panel) return;
    panel.innerHTML = panelMarkup(tab, ctx.game(), ctx.scenes());
    fill(panel);
  }
  /** @param {HTMLElement} root */
  function fill(root) {
    const game = ctx.game();
    for (const el of /** @type {NodeListOf<HTMLInputElement>} */ (root.querySelectorAll('[data-set]'))) {
      const v = fieldValue(game, el.dataset.set ?? '');
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v == null ? '' : String(v);
    }
  }
  /** @param {string} tab */
  function show(tab) {
    current = SETUP_TABS.some((t) => t.id === tab) ? tab : 'teams';
    for (const t of tabs) {
      const on = t.dataset.tab === current;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    for (const p of panels) p.hidden = p.dataset.tabPanel !== current;
    draw(current);
  }

  dialog.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button, [data-setup-close]');
    if (e.target === dialog) return dialog.close();
    if (!el) return;
    const b = /** @type {HTMLElement} */ (el);
    if (b.dataset.tab) return show(b.dataset.tab);
    if (b.hasAttribute('data-setup-close')) return dialog.close();
    if (b.dataset.add) {
      if (ctx.dispatch({ type: 'add', list: /** @type {any} */ (b.dataset.add) })) {
        draw(current);
        /** @type {HTMLElement|null} */ (dialog.querySelector('.larp-item:last-of-type input'))?.focus();
      }
      return;
    }
    if (b.dataset.move) {
      ctx.dispatch({
        type: 'move',
        list: /** @type {any} */ (b.dataset.move),
        id: b.dataset.id ?? '',
        by: Number(b.dataset.by),
      });
      return draw(current);
    }
    if (b.dataset.remove) {
      if (b.dataset.remove === 'teams' && !confirmIt('Remove this team and its points?')) return;
      ctx.dispatch({ type: 'remove', list: /** @type {any} */ (b.dataset.remove), id: b.dataset.id ?? '' });
      return draw(current);
    }
    if (b.dataset.game === 'export') return ctx.exportGame();
    if (b.dataset.game === 'clear') {
      if (confirmIt('Clear every team’s points and go back to the first round?')) ctx.dispatch({ type: 'clearScores' });
      return;
    }
    if (b.dataset.game === 'new') {
      if (confirmIt('Start a new game? The teams, rounds, modifiers and scores go back to the start.')) {
        ctx.dispatch({ type: 'replace', game: null });
        draw(current);
      }
    }
  });
  // Arrow keys between the tabs (the tablist pattern).
  dialog.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
    const ke = /** @type {KeyboardEvent} */ (e);
    if (ke.key !== 'ArrowLeft' && ke.key !== 'ArrowRight') return;
    const i = SETUP_TABS.findIndex((t) => t.id === current);
    const next = SETUP_TABS[(i + (ke.key === 'ArrowRight' ? 1 : SETUP_TABS.length - 1)) % SETUP_TABS.length].id;
    show(next);
    tabs.find((t) => t.dataset.tab === next)?.focus();
    ke.preventDefault();
  });
  /** @param {Event} e */
  const onField = (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.game === 'import') {
      const file = el.files?.[0];
      if (file) ctx.importGame(file);
      el.value = '';
      return;
    }
    const key = el.dataset.set;
    if (!key) return;
    // (Text is sent as it's typed; numbers, choices and colors once they're set.)
    if (e.type === 'input' && el.type !== 'text') return;
    const action = fieldAction(key, el.type === 'checkbox' ? el.checked : el.value);
    if (action) ctx.dispatch(action);
    if (e.type === 'change') fill(/** @type {HTMLElement} */ (el.closest('[data-tab-panel]')));
  };
  dialog.addEventListener('input', onField);
  dialog.addEventListener('change', onField);

  return {
    /** Opens the dialog on `tab` (the one last open by default). @param {string} [tab] */
    open(tab = current) {
      show(tab);
      if (!dialog.open) dialog.showModal();
    },
    /** The game changed from elsewhere (a key, an import): the open tab shows it. */
    refresh() {
      if (dialog.open) draw(current);
    },
    get el() {
      return dialog;
    },
  };
}
