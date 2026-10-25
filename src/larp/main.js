// The campfire game (/larp/): a barebones game night on Bonfire Live's setup. One screen: the
// bonfire full screen with the scores, the round's timer and the banners over it, and the
// host's controls as an overlay that fades when the mouse rests. The projector gets the same
// picture without the controls through the output window (src/ui/output.js: the canvas
// streamed, the scoreboard, timer and banner copied across as they change).
//
//   game.js      teams, rounds, modifiers, the log and the timer (pure)
//   store.js     saved after every change (localStorage 'larp.game')
//   stage.js     the bonfire: each round's scene, each banner's reaction, the knights
//   show.js      the scoreboard and the clock;  banner.js  the banners
//   overlay.js   the host's bar, the team picker, the keys (keys.js lists them)
//   setup.js     the Setup dialog
// A modifier given: the log gets its entry, its banner comes up (the site's "Embers Kindled"
// banner with the points line) and the fire reacts as it does; a Special one calls the knights
// in. docs/campfire.md says how to run a night.
import '../styles.css';
import './larp.css';
import { applyCssPalette, base } from '../palette.js';
import { startingEquipment } from '../content.js';
import { installDitherPatterns } from '../ui/dither.js';
import { installTooltips } from '../ui/tooltip.js';
import { applyFlame, setAccentRate } from '../ui/theme.js';
import { createKeysOverlay } from '../ui/keysOverlay.js';
import { createOutputWindow } from '../ui/output.js';
import { NO_WEBGL } from '../ui/shell.js';
import { reduce, gainText } from './game.js';
import { loadGame, saveGame, gameFile, readGameFile, STORE_KEY } from './store.js';
import { pageMarkup } from './markup.js';
import { createShow } from './show.js';
import { createBanner, bannerLines } from './banner.js';
import { createOverlay } from './overlay.js';
import { createSetup } from './setup.js';
import { createStage } from './stage.js';
import { KEY_GROUPS } from './keys.js';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const env = {
  get now() {
    return Date.now();
  },
  newId: () =>
    globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
};
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.documentElement.classList.add('js');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);
installTooltips();
setAccentRate(125);

const root = /** @type {HTMLElement} */ (document.getElementById('larp'));
root.innerHTML = pageMarkup();
const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (root.querySelector(s));

const loaded = loadGame(storage, env);
let game = loaded.game;

// --- Saying things ----------------------------------------------------------------------------
const noteEl = $('[data-note]');
/** @type {ReturnType<typeof setTimeout> | undefined} */
let noteTimer;
/** @param {string} text @param {number} [seconds] */
function note(text, seconds = 2.5) {
  noteEl.textContent = text;
  noteEl.classList.add('is-on');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => noteEl.classList.remove('is-on'), seconds * 1000);
}
const live = $('[data-live]');

// --- The output window, the show and the banner ---------------------------------------------
const stageEl = $('[data-stage]');
const output = createOutputWindow({
  stage: stageEl,
  name: 'larp-output',
  title: `${game.title} — Output`,
  note,
  onChange: (open) => {
    $('[data-output-label]').textContent = open ? 'Output (Open)' : 'Output';
    if (open) mirrorAll();
  },
});
const show = createShow({ board: $('[data-board]'), clock: $('[data-clock]'), mirror: (el) => output.mirror(el) });
const banner = createBanner({ el: $('[data-banner]'), mirror: (el) => output.mirror(el) });
function mirrorAll() {
  for (const el of root.querySelectorAll('[data-mirror]')) output.mirror(el);
}

// --- The bonfire ----------------------------------------------------------------------------
const stage = createStage({
  stage: stageEl,
  reducedMotion: () => osReduced || game.reducedMotion,
  onFail: () => {
    stageEl.classList.add('is-failed');
    note(NO_WEBGL, 6);
  },
});
stage.ready.then((ok) => {
  if (!ok) return;
  output.stream();
  stage.playRound(game.rounds[game.roundIndex], { instant: true });
});

// --- Changing the game ----------------------------------------------------------------------
/**
 * Applies an action: saves, redraws, and plays what it means on the fire. Returns whether the
 * game changed.
 * @param {import('./game.js').Action} action
 */
function dispatch(action) {
  const prev = game;
  const next = reduce(prev, action, env);
  if (next === prev) return false;
  game = next;
  if (!saveGame(storage, game) && storage) note('This game can’t be saved in this browser', 4);
  draw();
  const round = next.rounds[next.roundIndex];
  if (next.roundIndex !== prev.roundIndex || round.scene !== prev.rounds[prev.roundIndex]?.scene) {
    stage.playRound(round);
    if (next.roundIndex !== prev.roundIndex) live.textContent = round.name;
  }
  if (action.type === 'replace' || action.type === 'clearScores') {
    banner.clear();
    setup.refresh();
  }
  if (next.title !== prev.title) document.title = next.title;
  return true;
}

/**
 * Gives a team a modifier (or points by hand): its banner comes up, and the fire reacts with it.
 * @param {string} teamId
 * @param {{ modId?: string, points?: number }} what
 */
function award(teamId, { modId, points }) {
  if (!dispatch({ type: 'award', teamId, modId: modId ?? null, points })) return;
  const entry = /** @type {import('./game.js').Entry} */ (game.log.at(-1));
  const team = game.teams.find((t) => t.id === teamId);
  const lines = bannerLines(entry, team);
  live.textContent = `${lines.title}. ${lines.points}`;
  const queued = banner.show(lines, game.bannerMs, {
    color: team?.color,
    onShow: () => stage.react(entry, game),
  });
  if (!queued) {
    stage.react(entry, game);
    note(`${entry.title}: ${gainText(entry)} for ${team?.name ?? ''}`);
  }
}

// --- Controls -------------------------------------------------------------------------------
const keysOverlay = createKeysOverlay({ title: 'Keyboard Shortcuts', groups: KEY_GROUPS });
const setup = createSetup(/** @type {HTMLDialogElement} */ ($('[data-setup]')), {
  game: () => game,
  dispatch,
  scenes: () => stage.sceneChoices(),
  exportGame,
  importGame,
});
const overlay = createOverlay({
  root,
  game: () => game,
  dispatch,
  award,
  output: () => {
    if (output.open()) mirrorAll();
  },
  setup: () => setup.open(),
  keys: () => keysOverlay.toggle(),
  keysOpen: () => keysOverlay.el.open,
  setupOpen: () => setup.el.open,
  dismissKnights: () => {
    if (stage.knightsHere() > 0 && stage.dismissKnights()) note('The knights leave the fire');
    else note('No knights by the fire');
  },
  note,
});

function exportGame() {
  try {
    const blob = new Blob([JSON.stringify(gameFile(game), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${game.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'campfire-game'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    note('The game couldn’t be exported', 4);
  }
}
/** @param {File} file */
function importGame(file) {
  file
    .text()
    .then((text) => {
      const g = readGameFile(text, env);
      if (!g) return note('That isn’t a campfire game file', 4);
      dispatch({ type: 'replace', game: g });
      note('Game imported');
    })
    .catch(() => note('That file couldn’t be read', 4));
}

// --- Drawing --------------------------------------------------------------------------------
function draw() {
  show.draw(game, Date.now());
  overlay.draw(game);
}
document.title = game.title;
draw();
// The clock ticks (the show draws only what changed, so this is cheap).
setInterval(() => show.draw(game, Date.now()), 250);
// Another tab saved the game (two windows on one laptop): follow it.
window.addEventListener('storage', (e) => {
  if (e.key !== STORE_KEY || e.newValue == null) return;
  const g = readGameFile(e.newValue, env);
  if (!g) return;
  const prev = game;
  game = g;
  draw();
  if (g.roundIndex !== prev.roundIndex) stage.playRound(g.rounds[g.roundIndex]);
});

if (loaded.from === 'old') note('Your game from the earlier version was carried over', 5);
if (loaded.from === 'unreadable')
  note('The saved game couldn’t be read. A new game started; the original is preserved.', 6);
if (loaded.from === 'new') setup.open('teams');

if (import.meta.env.DEV) {
  /** @type {any} */ (window).__larp = {
    get game() {
      return game;
    },
    dispatch,
    award,
    stage,
    banner,
    output,
  };
}
