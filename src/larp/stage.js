// The campfire game's bonfire: the site's scene full screen, with Bonfire Live's director over
// it in silence (as the Painter previews a scene with no music), so each round's preset scene
// plays as it was painted: its place, colors, framing, look, render and knights. A round with
// no scene keeps the site's own fire. Each banner's reaction (reactions.js) is played on it,
// and a Special banner brings the knights in through the director's own Knights setting
// (released from the round's scene, so the scene doesn't send them off again); Dismiss sends
// them away, and the next round's scene decides afresh.
//
//   createStage(ctx) → { ready, playRound(round), react(entry), dismissKnights(), knightsHere }
// Everything is optional: a scene that fails to load leaves the page's dark backdrop and the
// game goes on (the scoreboard, timer and banners are HTML).
import { effects } from '../effects.js';
import { scenes as builtInScenes, startingEquipment } from '../content.js';
import { elementOr } from '../elements.js';
import { base as baseColors } from '../palette.js';
import { normalizeScene, parseRef } from '../scenes.js';
import { createSceneStore } from '../sceneStore.js';
import { setAccentRamp } from '../ui/theme.js';
import { densityCounts } from '../visualizer/density.js';
import { silentFrame } from '../painter/beat.js';
import { rollReaction } from './reactions.js';

const voidHex = baseColors.void;
/** The built-in scenes (content.json). @returns {any[]} */
const builtIns = () => (Array.isArray(builtInScenes) ? builtInScenes : []);

/**
 * The scenes a round can play: the built-in ones (content.json) and this browser's own (the
 * Painter's My Scenes), as { ref, name }.
 * @param {ReturnType<typeof createSceneStore>} [store]
 * @returns {{ ref: string, name: string }[]}
 */
export function sceneChoices(store) {
  const own = builtIns().map((s) => ({ ref: `b:${s.id}`, name: String(s.name ?? s.id) }));
  try {
    return [...own, ...(store?.list() ?? []).map((s) => ({ ref: `m:${s.id}`, name: `${s.name} (Mine)` }))];
  } catch {
    return own;
  }
}

/**
 * A scene ref as a scene, or null (unknown, or none: the site's own fire).
 * @param {string|null} ref
 * @param {ReturnType<typeof createSceneStore>} [store]
 */
export function sceneFor(ref, store) {
  const { source, id } = parseRef(ref);
  if (!source) return null;
  try {
    const raw = source === 'm' ? store?.get(id) : builtIns().find((s) => s.id === id);
    return raw ? normalizeScene(raw, { voidHex }) : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ stage: HTMLElement, reducedMotion: () => boolean, onFail?: (e: unknown) => void, onImpact?: (flame: string) => void }} o
 */
export function createStage({ stage, reducedMotion, onFail = () => {}, onImpact = () => {} }) {
  /** @type {any} */
  let fire = null;
  /** @type {any} */
  let director = null;
  /** @type {import('./game.js').Round|null} */
  let wanted = null;
  let knightsCalled = false;
  /** @type {ReturnType<typeof setTimeout>[]} */
  let timers = [];
  let store = null;
  try {
    store = createSceneStore({ voidHex });
  } catch {
    store = null;
  }

  // The director's own settings under the scenes: Bonfire Live's defaults, without what would
  // change the picture by itself (phrase swaps, the scene loop, its own title cards), and no
  // knights until a scene or a Special banner brings them.
  /** @type {Record<string, any>} */
  let settings = {};

  const ready = (async () => {
    const [{ createBonfire }, { createDirector, DEFAULT_SETTINGS }] = await Promise.all([
      import('../bonfire/scene.js'),
      import('../visualizer/director.js'),
    ]);
    settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      combos: -1,
      phraseBars: 0,
      scenes: 'off',
      title: '',
      colors: 'site',
      sceneColors: 'off',
      knights: 'off',
    };
    const counts = densityCounts({ particles: effects.particles, fireflies: effects.fireflies }, settings.particles);
    Object.assign(effects.particles, counts.particles);
    Object.assign(effects.fireflies, counts.fireflies);
    const reduced = reducedMotion();
    const made = createBonfire(
      stage,
      /** @type {any} */ ({
        reducedMotion: reduced,
        sway: 0,
        effects: true,
        onRamp: setAccentRamp,
        onError: (/** @type {unknown} */ e) => fail(e),
        onImpact: (/** @type {string} */ flameKey) => {
          director?.landed(flameKey);
          onImpact(flameKey);
        },
        onFrame: (/** @type {number} */ dt) => {
          if (fire === made) director?.update(silentFrame(), dt);
        },
      }),
    );
    director = createDirector(made, { settings, reducedMotion: reduced });
    await made.ready;
    fire = made;
    await fire.equip(startingEquipment.weapon, startingEquipment.flame, {
      instant: true,
      element: elementOr(startingEquipment.element),
    });
    if (wanted) playRound(wanted, { instant: true });
    stage.classList.add('is-ready');
    return true;
  })().catch((e) => {
    fail(e);
    return false;
  });

  /** @param {unknown} e */
  function fail(e) {
    try {
      fire?.dispose();
    } catch {
      /* gone either way */
    }
    fire = null;
    director = null;
    onFail(e);
  }

  /**
   * Plays a round's scene (none: the site's own fire), held. The knights a Special banner
   * brought go with the old round; the new scene's own come in with it.
   * @param {import('./game.js').Round} round
   * @param {{ instant?: boolean }} [o]
   */
  function playRound(round, { instant = false } = {}) {
    wanted = round;
    if (!director) return;
    clearTimers();
    knightsCalled = false;
    settings.knights = 'off';
    const scene = sceneFor(round.scene, store ?? undefined);
    try {
      director.scene(scene, { ref: scene ? round.scene : null, mode: 'hold', instant, fresh: true });
    } catch {
      /* a scene that won't play: the fire as it was */
    }
  }

  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  /** How many knights are by the fire now. */
  const knightsHere = () => Number(fire?.knights?.present) || 0;

  /** @param {import('./reactions.js').Call} c */
  function play(c) {
    if (!fire) return;
    try {
      if (c.method === 'setCast') {
        const count = Math.max(
          1,
          Math.min(Number(fire.knights?.max) || 4, Number(/** @type {any} */ (c.args[0])?.count) || 2),
        );
        settings.knights = 'on';
        settings.knightCount = count;
        director?.releaseScene(['knights', 'knightCount']);
        knightsCalled = true;
        return;
      }
      if (c.method === 'gesture') {
        fire.knights?.gesture(...c.args);
        return;
      }
      if (c.method === 'flash') {
        const r = stage.getBoundingClientRect();
        fire.flash(r.left + r.width / 2, r.top + r.height * 0.6);
        return;
      }
      if (c.method === 'swapElement') {
        if (!fire.forging && fire.weapon && fire.flame)
          Promise.resolve(fire.equip(fire.weapon, fire.flame, { element: c.args[0] })).catch(() => {});
        return;
      }
      const fn = fire[c.method];
      if (typeof fn === 'function') fn.apply(fire, c.args);
    } catch {
      /* a call the scene can't make: nothing */
    }
  }

  /**
   * A banner came up: the fire (and the knights) answer it.
   * @param {import('./game.js').Entry} entry
   * @param {{ knightCount: number, reducedMotion: boolean }} game
   */
  function react(entry, game) {
    if (!fire) return null;
    const r = rollReaction(
      { points: entry.gain, mult: entry.mult, reaction: entry.reaction, special: entry.special },
      {
        reducedMotion: game.reducedMotion || reducedMotion(),
        knightsHere: knightsHere(),
        knightCount: game.knightCount,
        element: fire.element ?? null,
      },
    );
    for (const c of [...r.fire, ...r.knights]) {
      if (c.delayMs > 0) timers.push(setTimeout(() => play(c), c.delayMs));
      else play(c);
    }
    return r;
  }

  /** Sends the knights a Special banner brought (or the scene's) away. */
  function dismissKnights() {
    if (!director) return false;
    clearTimers();
    settings.knights = 'off';
    director.releaseScene(['knights', 'knightCount']);
    knightsCalled = false;
    return true;
  }

  return {
    ready,
    playRound,
    react,
    dismissKnights,
    knightsHere,
    sceneChoices: () => sceneChoices(store ?? undefined),
    get knightsCalled() {
      return knightsCalled;
    },
    get fire() {
      return fire;
    },
    get director() {
      return director;
    },
    /** A scene changed in the Painter (another tab): its rounds pick it up next time. */
    get store() {
      return store;
    },
  };
}
