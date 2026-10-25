// The presentation adapter (the design's Round Moods and Scene Cues): game moments → scene calls on
// the display's bonfire (src/bonfire/scene.js createBonfire's stoke, pulse, sparkle, ring, equip,
// setScenery, setMaxFps and its knights). Game state never waits for it and every call is
// optional: a missing scene or method, or one that throws or rejects, does nothing. The prayer
// round is calm (no moments at all: no rings, flashes, gestures or sound; setMaxFps lowered);
// reduced motion drops rings, flashes, shake, gestures and dances. Flames resolve with palette.js
// flameOr(), loaded with the scene. It runs in the display window only, which loads three.js and
// the scene lazily (import()); the host console never loads them.
// Owner: the stage. cuesFor is pure; applyCue calls the scene it is handed; createStage owns the
// scene's lifetime.
//
//   cuesFor(prev, next, { reducedMotion }) → Cue[]   pure: what the scene should do for `next`
//       'state' cues (flame, scenery, frame cap, the knights' posture) whenever they differ from
//       `prev` (all of them when `prev` is null: a fresh scene or a reload), 'moment' cues (a
//       stoke, pulse, ring, gesture) only for a change within the same event
//   applyCue(scene, cue, { flameOr })      calls scene[cue.method] (or scene.knights[…]) if it exists
//   createStage({ container, reducedMotion, importScene, onFail }) → { apply, dispose, failed }
//
// What fires when (the design's table):
//   Welcome (Setup or the opening)  flame gilded; stoke() as each team is added; a wave when it starts
//   Faith Discovery                 pulse() as a team's turn starts
//   Dance                           sparkle() on turn start; two knights dance through the briefing only
//   Prayer / Sacred Song            calm: nothing but its flame and a lower frame cap
//   Bible Skit                      stoke() on turn start
//   Team Cheer                      ring() and a hurrah after each team's turn
//   Bonus banner                    a small pulse(); a deduction banner: nothing (neutral by design)
//   Round published                 one ring() and joy, when the reveal reaches the standings (or is skipped)
//   Final standings                 flame gilded; ring() and sparkle(); three knights dance round the fire
// Never 'praise' (a gesture or a dance move) anywhere.

/**
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {'state'|'moment'} CueKind
 * @typedef {{ method: string, args?: unknown[], target?: 'knights', kind?: CueKind }} Cue
 * @typedef {'seated'|'intro'|'final'} Posture
 */

/** The frame cap in the calm round (0: none, every other time). */
export const CALM_FPS = 24;

/** The flame outside a round: Welcome and the final standings. */
export const WELCOME_FLAME = 'gilded';

/** The only gestures the stage ever asks for (knights.js GESTURES, never 'praise'). */
export const STAGE_GESTURES = /** @type {const} */ (['wave', 'hurrah', 'joy']);

/** Dance moves for the Dance round's intro and the final standings (knightGestures MOVES, never 'praise'). */
export const INTRO_MOVES = /** @type {const} */ (['swayArms', 'clap']);
export const FINAL_MOVES = /** @type {const} */ (['clap', 'swayArms', 'stepTouch']);

/** Methods reduced motion never calls on the scene. */
const MOTION_METHODS = new Set(['ring', 'flash', 'shake']);
/** The knights' only calls under reduced motion: being there, sitting, and the dancers leaving. */
const CALM_KNIGHTS = new Set(['summonKnight', 'sit', 'dismiss']);

/** @param {string} method @param {unknown[]} [args] @param {CueKind} [kind] @returns {Cue} */
const scene = (method, args = [], kind = 'moment') => ({ kind, method, args });
/** @param {string} method @param {unknown[]} [args] @param {CueKind} [kind] @returns {Cue} */
const knights = (method, args = [], kind = 'moment') => ({ kind, target: 'knights', method, args });
/** @param {string} name */
const gesture = (name) => knights('gesture', [name, { index: 0 }]);

/** @param {Projection} p */
export const flameOf = (p) => (p.phase !== 'finished' && p.round?.flame) || WELCOME_FLAME;
/** @param {Projection} p */
const calm = (p) => p.phase === 'running' && !!p.round?.calm;
/** @param {Projection} p */
const fpsOf = (p) => (calm(p) ? CALM_FPS : 0);

/**
 * What the knights are doing: dancing round the fire at the end, two dancing through the Dance
 * round's briefing, or seated (always, under reduced motion).
 * @param {Projection} p
 * @param {boolean} reduced
 * @returns {Posture}
 */
export function postureOf(p, reduced) {
  if (reduced) return 'seated';
  if (p.phase === 'finished') return 'final';
  if (p.phase === 'running' && p.round?.category === 'dance' && p.roundPhase === 'briefing') return 'intro';
  return 'seated';
}

/** @param {readonly string[]} moves @returns {Cue[]} */
const dancers = (moves) =>
  moves.map((move, i) => knights('dance', [i, { move, slot: i, facing: 'fire', energy: 0.6 }], 'state'));

/**
 * The knights' calls from one posture to another (from 'seated' after a reload: he's summoned
 * at once, so there is someone to sit, gesture and dance).
 * @param {Posture|null} from null: a fresh scene
 * @param {Posture} to
 * @returns {Cue[]}
 */
function postureCues(from, to) {
  /** @type {Cue[]} */
  const out = [];
  if (from === null) out.push(knights('summonKnight', [{ instant: true }], 'state'));
  if (from === to) return out;
  const extra = { final: FINAL_MOVES.length, intro: INTRO_MOVES.length, seated: 1 };
  if (from && extra[from] > extra[to]) {
    for (let i = extra[from] - 1; i >= extra[to]; i--) out.push(knights('dismiss', [i], 'state'));
  }
  if (to === 'seated') {
    if (from && from !== 'seated') out.push(knights('sit', [0], 'state'));
  } else out.push(...dancers(to === 'final' ? FINAL_MOVES : INTRO_MOVES));
  return out;
}

/**
 * The scene's lasting look for `next` where it differs from `prev` (everything when `prev` is
 * null). A flame change lands with a forged swap, except at once on a fresh scene, a new event,
 * under reduced motion or into or out of the calm round.
 * @param {Projection|null} prev
 * @param {Projection} next
 * @param {boolean} reduced for `next`
 * @param {boolean} wasReduced for `prev`
 * @returns {Cue[]}
 */
function stateCues(prev, next, reduced, wasReduced) {
  /** @type {Cue[]} */
  const out = [];
  const flame = flameOf(next);
  if (!prev || flameOf(prev) !== flame) {
    const instant = !prev || reduced || prev.eventId !== next.eventId || calm(prev) || calm(next);
    out.push(scene('flame', [flame, { instant }], 'state'));
  }
  const scenery = next.config?.scenery;
  if (scenery && (!prev || prev.config?.scenery !== scenery)) out.push(scene('setScenery', [scenery], 'state'));
  if (!prev || fpsOf(prev) !== fpsOf(next)) out.push(scene('setMaxFps', [fpsOf(next)], 'state'));
  out.push(...postureCues(prev ? postureOf(prev, wasReduced) : null, postureOf(next, reduced)));
  return out;
}

/**
 * The reveal step `p` shows, or null.
 * @param {Projection|null} p
 */
const stepOf = (p) => (p?.reveal ? (p.revealSteps?.[p.reveal.step] ?? null) : null);

/**
 * A reveal award's points (0 when it can't be found).
 * @param {Projection} p
 * @param {string|null} adjustmentId
 */
function awardPoints(p, adjustmentId) {
  const result = p.results?.find((r) => r.roundId === p.reveal?.roundId);
  return result?.adjustments.find((a) => a.id === adjustmentId)?.points ?? 0;
}

/** The turn cue for each round as a team's turn starts (Team Cheer's comes after it). */
const TURN_CUES = Object.freeze({ faith: scene('pulse', [0.6]), dance: scene('sparkle', [4]), skit: scene('stoke') });

/** @param {Projection} p */
const atWelcome = (p) => p.phase !== 'finished' && !p.round;

/**
 * Welcome's moments and the end's: a stoke per team introduced, a wave as it starts, the final
 * ring and sparkles.
 * @param {Projection} prev
 * @param {Projection} next
 * @returns {Cue[]}
 */
function welcomeCues(prev, next) {
  /** @type {Cue[]} */
  const out = [];
  if (atWelcome(next) && atWelcome(prev) && next.teams.length > prev.teams.length) out.push(scene('stoke'));
  if (prev.phase === 'setup' && next.phase === 'running') out.push(gesture('wave'));
  if (prev.phase !== 'finished' && next.phase === 'finished') out.push(scene('ring', [1.2]), scene('sparkle', [6]));
  return out;
}

/**
 * The performances' moments within one round: the round's cue as a turn starts, the cheer's
 * ring and hurrah as one ends.
 * @param {Projection} prev
 * @param {Projection} next
 * @returns {Cue[]}
 */
function turnCues(prev, next) {
  /** @type {Cue[]} */
  const out = [];
  const category = next.round?.category;
  const started =
    next.roundPhase === 'performances' && !!next.currentTeamId && next.currentTeamId !== prev.currentTeamId;
  if (started && TURN_CUES[category]) out.push({ ...TURN_CUES[category] });
  const ended =
    prev.roundPhase === 'performances' &&
    !!prev.currentTeamId &&
    (next.roundPhase !== 'performances' || next.currentTeamId !== prev.currentTeamId);
  if (ended && category === 'cheer') out.push(scene('ring', [0.8]), gesture('hurrah'));
  return out;
}

/**
 * The reveal's moments: a small pulse for a bonus banner (a deduction's is neutral), one ring and
 * joy as the round's standings come up, or as a skip goes straight to Results.
 * @param {Projection} prev
 * @param {Projection} next
 * @param {boolean} sameRound
 * @returns {Cue[]}
 */
function revealCues(prev, next, sameRound) {
  const published = [scene('ring', [1]), gesture('joy')];
  const step = stepOf(next);
  const moved =
    !!next.reveal && (prev.reveal?.roundId !== next.reveal.roundId || prev.reveal?.step !== next.reveal.step);
  if (moved && step?.kind === 'award') return awardPoints(next, step.adjustmentId) > 0 ? [scene('pulse', [0.35])] : [];
  if (moved && step?.kind === 'standings') return published;
  const skipped = prev.roundPhase === 'reveal' && next.roundPhase === 'results' && stepOf(prev)?.kind !== 'standings';
  return sameRound && skipped ? published : [];
}

/**
 * The one-off moments between two projections of the same event, in a round that isn't calm.
 * @param {Projection} prev
 * @param {Projection} next
 * @returns {Cue[]}
 */
function momentCues(prev, next) {
  const sameRound = !!next.round && prev.round?.id === next.round.id;
  return [...welcomeCues(prev, next), ...(sameRound ? turnCues(prev, next) : []), ...revealCues(prev, next, sameRound)];
}

/**
 * The scene calls for a new projection (pure). Moments only follow a newer revision of the same
 * event; the calm round has none; reduced motion (the OS setting or Setup's) drops rings,
 * flashes, shake and every gesture and dance.
 * @param {Projection|null} prev the projection shown before (null: none yet, a fresh scene)
 * @param {Projection|null} next the one just received
 * @param {{ reducedMotion?: boolean }|unknown[]} [opts]
 * @returns {Cue[]}
 */
export function cuesFor(prev, next, opts = {}) {
  if (!next) return [];
  const os = !Array.isArray(opts) && !!opts?.reducedMotion;
  const reduced = os || !!next.config?.reducedMotion;
  const out = stateCues(prev, next, reduced, os || !!prev?.config?.reducedMotion);
  const sameEvent = !!prev && prev.eventId === next.eventId && next.revision > prev.revision;
  if (sameEvent && !calm(next)) out.push(...momentCues(prev, next));
  if (!reduced) return out;
  return out.filter((c) => (c.target === 'knights' ? CALM_KNIGHTS.has(c.method) : !MOTION_METHODS.has(c.method)));
}

/**
 * Plays one cue on the scene; a missing scene, target or method, or one that throws (or returns
 * a promise that rejects), does nothing. 'flame' is the stage's own: the scene's equip() with
 * the weapon it holds and the flame resolved by `flameOr`, skipped when that flame already burns.
 * @param {any} sceneObj
 * @param {Cue} cue
 * @param {{ flameOr?: (key: string) => string }} [opts]
 * @returns {boolean} whether the call was made
 */
export function applyCue(sceneObj, cue, { flameOr = (k) => k } = {}) {
  try {
    if (cue.method === 'flame') {
      const [key, options] = /** @type {[string, object]} */ (cue.args ?? []);
      const flame = flameOr(key);
      if (typeof sceneObj?.equip !== 'function' || !sceneObj.weapon || sceneObj.flame === flame) return false;
      settle(sceneObj.equip(sceneObj.weapon, flame, options));
      return true;
    }
    const target = cue.target === 'knights' ? sceneObj?.knights : sceneObj;
    const fn = target?.[cue.method];
    if (typeof fn !== 'function') return false;
    settle(fn.apply(target, cue.args ?? []));
    return true;
  } catch {
    return false;
  }
}

/** A promise a scene call returned may reject: that's ignored too. @param {any} value */
function settle(value) {
  if (value && typeof value.then === 'function') value.then(undefined, () => {});
}

/**
 * The display's bonfire: created on the first apply() (from the module `importScene` loads,
 * with the OS's or Setup's reduced motion; rebuilt if that changes), then every projection's
 * cues played on it. Until the scene (and later its knights) is ready the projections are only
 * kept; once it is, the latest one's look is applied at once. A failed import, a throwing
 * createBonfire or its onError marks it `failed` (calls `onFail` once): the display then shows
 * its still, and apply() does nothing more.
 * @param {{
 *   container: HTMLElement,
 *   reducedMotion?: boolean,
 *   importScene?: () => Promise<{ createBonfire: Function, flameOr?: (key: string) => string }>,
 *   onFail?: (error: unknown) => void,
 *   onReady?: (what: 'scene'|'knights') => void,
 * }} opts onReady: the scene has drawn its first frame ('scene'), then its knights are in
 *   ('knights'): everything it loads is loaded, so the network may go
 * @returns {{ apply(projection: Projection|null, prev?: Projection|null): void, dispose(): void, readonly failed: boolean }}
 */
export function createStage({ container, reducedMotion = false, importScene = loadScene, onFail, onReady }) {
  /** @type {any} */
  let fire = null;
  let ready = false;
  let loading = false;
  let failed = false;
  let disposed = false;
  let builtReduced = false;
  /** @type {(key: string) => string} */
  let flameOr = (k) => k;
  /** @type {Projection|null} */
  let latest = null;

  const fail = (/** @type {unknown} */ error) => {
    if (failed || disposed) return;
    failed = true;
    teardown();
    onFail?.(error);
  };
  const teardown = () => {
    const old = fire;
    fire = null;
    ready = false;
    try {
      old?.dispose?.();
    } catch {
      /* ignored: the scene is gone either way */
    }
  };
  /** @param {Cue[]} cues @param {any} which */
  const play = (cues, which) => {
    if (which !== fire) return;
    for (const cue of cues) applyCue(fire, cue, { flameOr });
  };
  const reducedFor = (/** @type {Projection|null} */ p) => !!reducedMotion || !!p?.config?.reducedMotion;

  const build = (/** @type {boolean} */ reduced) => {
    loading = true;
    builtReduced = reduced;
    Promise.resolve()
      .then(importScene)
      .then((mod) => {
        loading = false;
        if (disposed || failed) return;
        if (typeof mod?.flameOr === 'function') flameOr = mod.flameOr;
        const made = mod.createBonfire(container, { reducedMotion: reduced, onError: fail });
        fire = made;
        const mine = made;
        const whenReady = Promise.resolve(made?.ready);
        whenReady.then(() => {
          if (mine !== fire) return;
          ready = true;
          // The fire centred between the display's side columns (the site's home pose leans right).
          applyCue(mine, { kind: 'state', method: 'setPose', args: [STAGE_POSE, { instant: true }] });
          play(cuesFor(null, latest, { reducedMotion: builtReduced }), mine);
          onReady?.('scene');
          return Promise.resolve(mine?.knights?.ready).then(
            () => {
              if (mine !== fire) return;
              play(
                cuesFor(null, latest, { reducedMotion: builtReduced }).filter((c) => c.target === 'knights'),
                mine,
              );
              onReady?.('knights');
            },
            () => null, // (no knights: the fire goes on without them)
          );
        }, fail);
      })
      .catch((error) => {
        loading = false;
        fail(error);
      });
  };

  return {
    apply(projection, prev = latest) {
      if (disposed || failed || !projection) return;
      latest = projection;
      const reduced = reducedFor(projection);
      if (fire && reduced !== builtReduced) teardown();
      if (!fire && !loading) return build(reduced);
      if (!ready) return;
      play(cuesFor(prev, projection, { reducedMotion: reduced }), fire);
    },
    dispose() {
      disposed = true;
      teardown();
    },
    get failed() {
      return failed;
    },
  };
}

/** The display's camera: the site's home view, the fire centred in the frame. */
export const STAGE_POSE = Object.freeze({ pos: [0, 2.25, 6.2], target: [0, 0.5, 0], fov: 30, sx: 0, sy: 0 });

/** The scene and the palette's flameOr, loaded on demand (three.js stays out of the first load). */
function loadScene() {
  return Promise.all([import('../bonfire/scene.js'), import('../palette.js')]).then(([s, p]) => ({
    createBonfire: s.createBonfire,
    flameOr: p.flameOr,
  }));
}
