// NEWT's brain in the invitation toy: a pure state machine (idle, walk, react, flee, held, fall,
// land, sitDown, sit, standUp) that owns every timer and every change of state. Each frame it
// turns gestures and buttons into what he does, keeps his stress (taps, rough handling; it
// decays), and says which clip plays, how he moves, his face, where he looks and what the
// buttons show. A reaction and a sit (by the button or by himself) first turn him to face the
// camera, so his face shows; a sit's turn isn't sitting yet (a tap reacts, a floor tap walks,
// Stand calls it off). No three.js and no clock: time comes in as t, randomness from rng.js.

import { CLIPS, FACE_TRACK, GAIT } from './clips.js';
import { createRng, between } from './rng.js';
import { wanderGoal, clampTo, wrapAngle } from './steer.js';
import { fadeOutDue } from './blend.js';

/** @typedef {import('./types.js').BrainIn} BrainIn */
/** @typedef {import('./types.js').BrainOut} BrainOut */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').GestureEvent} GestureEvent */
/** @typedef {import('./types.js').ButtonName} ButtonName */
/** @typedef {'Wave'|'Spook'} Reaction */
/** @typedef {{do: 'react', which: Reaction} | {do: 'walk', goal: XZ} | {do: 'flee', for: number, fromThreat: boolean}} Pending */

/**
 * Every number the brain runs on (seconds, world units, CSS px); createBrain's `tune` overrides
 * any of them.
 */
export const TUNE = {
  /** Idle lasts this long (rolled) before a wander walk. */
  idleMin: 1.5,
  idleMax: 4,
  /** Alone this long, he sits down (from idle). */
  sitAfter: 20,
  /** The pointer moving this far (CSS px) counts as company. */
  aloneMove: 30,
  /**
   * A reaction first turns him to the camera, until he's within facedEnough radians of facing
   * it or for faceTurn s at most (he pivots on the spot at steer.js STEER.turnStill: a quarter
   * turn takes about 0.45 s).
   */
  faceTurn: 0.6,
  facedEnough: 0.15,
  /** Sitting down, he turns to face the camera first, until he does or for this long at most (a half turn). */
  sitTurnMax: 1,
  /** A tap in this first share of a reaction only adds stress. */
  reactLock: 0.6,
  /** Fleeing from stress lasts at least this long. */
  fleeMin: 2.5,
  /** The Run button's flee. */
  runFor: 3,
  /** Fleeing from stress with the pointer gone, he runs from where it was last seen this long ago (a lifted finger). */
  threatMemory: 2,
  /** Stress a tap adds; he flees at stressFlee and calms below stressCalm; it's capped at stressMax. */
  stressTap: 1,
  stressFlee: 4,
  stressCalm: 2,
  stressMax: 6,
  /** Stress decays at `decay` per second once `decayDelay` has passed since it last rose… */
  decay: 0.5,
  decayDelay: 1.2,
  /** …faster by decayFar with the pointer gone or over farDist away, by decayStill with it still for stillFor s. */
  decayFar: 0.5,
  decayStill: 0.25,
  farDist: 1.5,
  stillFor: 1,
  /** The pointer must move this far on the floor to count as moving. */
  stillMove: 0.02,
  /** Held: stress per unit dragged, and per (unit/s²)·s of shake over shakeSoft. */
  dragStress: 0.6,
  shakeSoft: 6,
  shakeStress: 0.08,
  /** A shake this hard surprises him again, for shakenFor s. */
  shakeHard: 14,
  shakenFor: 0.4,
  /** A fall lasts at least this long (a landing needs a frame of falling). */
  fallMin: 0.05,
  /** A walk has arrived within this distance of its goal. */
  arrive: 0.1,
  /** A walk gives up after its distance at walking speed × walkPatience + walkSlack s. */
  walkPatience: 1.5,
  walkSlack: 2,
  walkSpeed: GAIT.walk,
  runSpeed: GAIT.run,
};

/** The clip each state plays ('gait': Idle/Walk/Run by speed; react picks its own). */
const STATE_CLIP = {
  idle: 'gait',
  walk: 'gait',
  flee: 'gait',
  react: 'gait',
  held: 'Held',
  fall: 'Fall',
  land: 'Land',
  sitDown: 'SitDown',
  sit: 'Sit',
  standUp: 'StandUp',
};
/** The FACE_TRACK entry for the gait states (sitDown: while he turns to the camera first). */
const GAIT_FACE = { idle: 'Idle', walk: 'Walk', flee: 'Run', sitDown: 'SitDown' };
const SITTING = new Set(['sitDown', 'sit']);
const EPS = 1e-9;

/**
 * @param {{seed?: number, calm?: boolean, bounds?: Bounds|null, tune?: Partial<typeof TUNE>}} [opts]
 *   calm: no wandering at first and never sitting by himself (?calm)
 */
export function createBrain({ seed = 1, calm = false, bounds = null, tune = {} } = {}) {
  const T = { ...TUNE, ...tune };
  const rng = createRng(seed);
  const m = {
    started: false,
    t: 0,
    state: 'idle',
    since: 0,
    clip: 'gait',
    clipStart: 0,
    restart: false,
    turning: false,
    /** @type {Reaction|null} */
    reaction: null,
    /** @type {Reaction[]} */
    history: [],
    /** @type {Pending|null} */
    pending: null,
    stress: 0,
    raisedAt: 0,
    wander: !calm,
    idleFor: between(rng, T.idleMin, T.idleMax),
    aloneSince: 0,
    /** @type {{x: number, y: number}|null} */
    anchorPx: null,
    /** @type {XZ|null} */
    goal: null,
    wanderWalk: false,
    walkUntil: 0,
    fleeUntil: 0,
    fleeFromThreat: false,
    /** @type {{x: number, z: number, t: number}|null} */
    threat: null,
    shakenUntil: 0,
    /** @type {XZ|null} */
    lastPointer: null,
    pointerMovedAt: 0,
    /** @type {BrainIn|null} */
    input: null,
  };

  // ---- changes of state ---------------------------------------------------------------------

  function enter(state) {
    m.state = state;
    m.since = m.t;
    m.turning = false;
    m.clip = STATE_CLIP[state];
    m.clipStart = m.t;
    m.restart = m.clip !== 'gait';
    if (state !== 'react') m.reaction = null;
    if (state === 'idle') m.idleFor = between(rng, T.idleMin, T.idleMax);
  }

  /** Wave or Spook at random, never the same three times running. */
  function pick() {
    const h = m.history;
    const n = h.length;
    if (n >= 2 && h[n - 1] === h[n - 2]) return h[n - 1] === 'Wave' ? 'Spook' : 'Wave';
    return rng() < 0.5 ? 'Wave' : 'Spook';
  }

  /** The way he faces the camera: toward its spot, or +z. */
  function cameraYaw() {
    const c = m.input?.camera;
    const n = m.input?.newt;
    return c && n ? Math.atan2(c.x - n.x, c.z - n.z) : 0;
  }

  /** Whether he faces the camera, within facedEnough. */
  function facingCamera() {
    const yaw = m.input?.newt?.yaw ?? 0;
    return Math.abs(wrapAngle(yaw - cameraYaw())) <= T.facedEnough;
  }

  /** @param {Reaction} which */
  function react(which) {
    m.history.push(which);
    if (m.history.length > 4) m.history.shift();
    enter('react');
    m.reaction = which;
    if (!facingCamera()) m.turning = true;
    else startClip(which);
  }

  /** Sit down, turned to the camera first unless he faces it already (so his happy face shows). */
  function sitDown() {
    enter('sitDown');
    if (facingCamera()) return;
    m.turning = true;
    m.clip = 'gait';
    m.restart = false;
  }

  /** Sitting, or on the way down or up (a sit's turn to the camera isn't: he still stands). */
  function seated() {
    const st = m.state;
    return st === 'sit' || st === 'standUp' || (st === 'sitDown' && !m.turning);
  }

  function startClip(name) {
    m.turning = false;
    m.clip = name;
    m.clipStart = m.t;
    m.restart = true;
  }

  /** @param {XZ} goal @param {boolean} wandering */
  function walk(goal, wandering) {
    const g = bounds ? clampTo(bounds, goal) : { x: goal.x, z: goal.z };
    enter('walk');
    m.goal = g;
    m.wanderWalk = wandering;
    const n = m.input?.newt;
    const d = n ? Math.hypot(g.x - n.x, g.z - n.z) : 0;
    m.walkUntil = m.t + (d / T.walkSpeed) * T.walkPatience + T.walkSlack;
  }

  /**
   * @param {number} minFor
   * @param {boolean} fromThreat  stress: from the pointer, or where it was last seen; the Run
   *   button: from the pointer, or the play area's centre
   */
  function flee(minFor, fromThreat) {
    if (m.state === 'flee') {
      m.fleeUntil = Math.max(m.fleeUntil, m.t + minFor);
      m.fleeFromThreat ||= fromThreat;
      return;
    }
    enter('flee');
    m.fleeUntil = m.t + minFor;
    m.fleeFromThreat = fromThreat;
  }

  /** Gets him up first when he's sitting, then does `p`. */
  function afterStanding(/** @type {Pending|null} */ p) {
    m.pending = p;
    if (m.state !== 'standUp') enter('standUp');
  }

  /** @param {Pending|null} p */
  function doPending(p) {
    if (!p) enter('idle');
    else if (p.do === 'react') react(p.which);
    else if (p.do === 'walk') walk(p.goal, false);
    else flee(p.for, p.fromThreat);
  }

  // ---- input ---------------------------------------------------------------------------------

  function company() {
    m.aloneSince = m.t;
    m.anchorPx = null;
  }

  function addStress(n) {
    m.stress = Math.min(T.stressMax, m.stress + n);
    m.raisedAt = m.t;
  }

  /** Pointer travel in CSS px: past aloneMove from where it was, it's company. */
  function pointerPx(x, y) {
    if (!m.anchorPx) m.anchorPx = { x, y };
    else if (Math.hypot(x - m.anchorPx.x, y - m.anchorPx.y) > T.aloneMove) {
      company();
      m.anchorPx = { x, y };
    }
  }

  function onTap() {
    const st = m.state;
    if (st === 'fall' || st === 'land' || st === 'held') return;
    addStress(T.stressTap);
    if (m.stress >= T.stressFlee && st !== 'flee') {
      if (seated()) afterStanding({ do: 'flee', for: T.fleeMin, fromThreat: true });
      else flee(T.fleeMin, true);
      return;
    }
    if (st === 'flee') return;
    if (st === 'react') {
      if (!m.turning && reactProgress() >= T.reactLock) react(pick());
      return;
    }
    if (seated()) afterStanding({ do: 'react', which: pick() });
    else react(pick());
  }

  /** @param {XZ|null|undefined} floor */
  function onFloorTap(floor) {
    if (!floor) return;
    const st = m.state;
    if (seated()) afterStanding({ do: 'walk', goal: { x: floor.x, z: floor.z } });
    else if (st === 'idle' || st === 'walk' || st === 'sitDown') walk(floor, false);
  }

  /** @param {GestureEvent} e */
  function onEvent(e) {
    if (e.floor) m.threat = { x: e.floor.x, z: e.floor.z, t: m.t };
    switch (e.type) {
      case 'grab':
        company();
        if (e.on !== 'floor' && m.state !== 'held') {
          m.pending = null;
          enter('held');
        }
        break;
      case 'release':
      case 'cancel':
        company();
        if (m.state === 'held') enter('fall');
        break;
      case 'tap':
        company();
        if (e.on === 'floor') onFloorTap(e.floor);
        else onTap();
        break;
      case 'drag':
      case 'hover':
      case 'orbit':
        pointerPx(e.x, e.y);
        break;
      case 'pinch':
        company();
        break;
    }
  }

  /** @param {ButtonName} name */
  function onButton(name) {
    const st = m.state;
    if (st === 'held' || st === 'fall') return;
    company();
    const sitting = seated();
    switch (name) {
      case 'Wave':
      case 'Spook':
        if (sitting) afterStanding({ do: 'react', which: name });
        else react(name);
        break;
      case 'Sit':
        if (st === 'sitDown' && m.turning) enter('idle');
        else if (SITTING.has(st)) afterStanding(null);
        else sitDown();
        break;
      case 'Run':
        if (sitting) afterStanding({ do: 'flee', for: T.runFor, fromThreat: false });
        else flee(T.runFor, false);
        break;
      case 'Wander':
        m.wander = !m.wander;
        if (!m.wander && st === 'walk' && m.wanderWalk) enter('idle');
        break;
    }
  }

  // ---- each frame ----------------------------------------------------------------------------

  /** @param {BrainIn} input */
  function watchPointer(input) {
    const p = input.pointer;
    if (!p) {
      m.lastPointer = null;
      return;
    }
    m.threat = { x: p.x, z: p.z, t: m.t };
    if (!m.lastPointer || Math.hypot(p.x - m.lastPointer.x, p.z - m.lastPointer.z) > T.stillMove) {
      m.lastPointer = { x: p.x, z: p.z };
      m.pointerMovedAt = m.t;
    }
  }

  /** @param {BrainIn} input */
  function stressStep(input) {
    const dt = input.dt;
    const c = input.carry;
    if (m.state === 'held' && c) {
      const add = (c.dragSpeed * T.dragStress + Math.max(0, c.shake - T.shakeSoft) * T.shakeStress) * dt;
      m.stress = Math.min(T.stressMax, m.stress + add);
      if (dt > 0 && add / dt > T.decay) m.raisedAt = m.t;
      if (c.shake >= T.shakeHard) m.shakenUntil = m.t + T.shakenFor;
    }
    if (m.t - m.raisedAt < T.decayDelay - EPS) return;
    const p = input.pointer;
    const n = input.newt;
    const far = !p || !n || Math.hypot(p.x - n.x, p.z - n.z) > T.farDist;
    const still = !p || m.t - m.pointerMovedAt >= T.stillFor;
    const rate = T.decay + (far ? T.decayFar : 0) + (still ? T.decayStill : 0);
    m.stress = Math.max(0, m.stress - rate * dt);
  }

  /** The playing clip's time: the page's report when it's this clip's, else the brain's own count. */
  function clipTime() {
    const own = m.t - m.clipStart;
    const len = CLIPS[m.clip]?.length ?? 0;
    const c = m.input?.clip;
    if (c && c.name === m.clip && !m.restart && c.time <= own + 0.1)
      return { elapsed: c.time, length: c.time + c.remaining, remaining: c.remaining };
    return { elapsed: own, length: len, remaining: len - own };
  }

  function reactProgress() {
    const { elapsed, length } = clipTime();
    return length > 0 ? elapsed / length : 1;
  }

  /** What each state's timers do, given his age in the state and where he is. */
  const TIMERS = {
    /** @param {number} age @param {BrainIn['newt']} n */
    idle(age, n) {
      if (!calm && m.t - m.aloneSince >= T.sitAfter - EPS) sitDown();
      else if (m.wander && bounds && n && age >= m.idleFor - EPS) walk(wanderGoal(rng, bounds, n), true);
    },
    /** @param {number} age @param {BrainIn['newt']} n */
    walk(age, n) {
      const there = !n || !m.goal || Math.hypot(m.goal.x - n.x, m.goal.z - n.z) <= T.arrive;
      if (there || m.t >= m.walkUntil) enter('idle');
    },
    /** @param {number} age */
    react(age) {
      if (m.turning) {
        if (facingCamera() || age >= T.faceTurn - EPS) startClip(m.reaction);
      } else if (fadeOutDue(m.clip, clipTime().remaining, 'Idle')) enter('idle');
    },
    flee() {
      if (m.t >= m.fleeUntil - EPS && m.stress < T.stressCalm) enter('idle');
    },
    /** @param {number} age @param {BrainIn['newt']} n */
    fall(age, n) {
      if (n?.grounded && age >= T.fallMin - EPS) enter('land');
    },
    land() {
      const stressed = m.stress >= T.stressFlee;
      if (!fadeOutDue('Land', clipTime().remaining, stressed ? 'Run' : 'Idle')) return;
      if (stressed) flee(T.fleeMin, true);
      else enter('idle');
    },
    /** @param {number} age */
    sitDown(age) {
      if (m.turning) {
        if (facingCamera() || age >= T.sitTurnMax - EPS) startClip('SitDown');
      } else if (fadeOutDue('SitDown', clipTime().remaining, 'Sit')) enter('sit');
    },
    sit() {},
    held() {},
    standUp() {
      const p = m.pending;
      const next = !p ? 'Idle' : p.do === 'react' ? p.which : p.do === 'walk' ? 'Walk' : 'Run';
      if (!fadeOutDue('StandUp', clipTime().remaining, next)) return;
      m.pending = null;
      doPending(p);
    },
  };

  /** The base face and blinking from FACE_TRACK, measured from the clip's (or state's) start. */
  function face() {
    const st = m.state;
    const name = st === 'react' ? m.reaction : m.clip === 'gait' ? GAIT_FACE[st] : m.clip;
    const since = m.turning ? 0 : m.t - m.clipStart;
    const tr = FACE_TRACK[name] ?? FACE_TRACK.Idle;
    let f = tr.face;
    for (const [at, g] of tr.at ?? []) if (since >= at - EPS) f = g;
    if (st === 'held' && m.t < m.shakenUntil) f = 'surprised';
    return { face: f, blink: f === 'surprised' ? 'none' : tr.blink };
  }

  /** @returns {BrainOut['look']} */
  function look() {
    const st = m.state;
    if (st === 'fall' || st === 'land' || (st === 'react' && m.reaction === 'Spook'))
      return { mode: 'forward', weight: 0 };
    if (st === 'held' || (st === 'react' && m.reaction === 'Wave')) return { mode: 'camera', weight: 1 };
    if (st === 'flee') return { mode: 'back', weight: 1 };
    return { mode: 'pointer', weight: 1 };
  }

  /** @returns {BrainOut['move']} */
  function move() {
    switch (m.state) {
      case 'walk':
        return { mode: 'goto', goal: { x: m.goal.x, z: m.goal.z }, speed: T.walkSpeed };
      case 'flee': {
        const th = m.threat;
        const recent = m.fleeFromThreat && !m.input?.pointer && th && m.t - th.t <= T.threatMemory + EPS;
        return { mode: 'flee', goal: recent ? { x: th.x, z: th.z } : null, speed: T.runSpeed };
      }
      case 'react':
      case 'sitDown': {
        const c = m.input?.camera;
        return { mode: 'face', goal: c ? { x: c.x, z: c.z } : null, speed: 0 };
      }
      default:
        return { mode: 'stay', goal: null, speed: 0 };
    }
  }

  /** @returns {BrainOut} */
  function output() {
    const st = m.state;
    const { face: f, blink } = face();
    return {
      state: st,
      clip: m.clip,
      restart: m.restart,
      move: move(),
      face: /** @type {import('./clips.js').FaceName} */ (f),
      blink: /** @type {import('./clips.js').BlinkMode} */ (blink),
      look: look(),
      faceCamera: m.turning,
      stress: m.stress,
      wander: m.wander,
      sitLabel: SITTING.has(st) ? 'Stand' : 'Sit',
      buttonsEnabled: st !== 'held' && st !== 'fall',
      reaction: st === 'react' ? m.reaction : null,
    };
  }

  return {
    /**
     * One frame: events, then the button, then stress, then the timers.
     * @param {BrainIn} input
     * @returns {BrainOut}
     */
    step(input) {
      m.input = input;
      m.t = input.t;
      if (!m.started) {
        m.started = true;
        m.since = m.clipStart = m.aloneSince = m.pointerMovedAt = m.t;
        m.raisedAt = m.t - T.decayDelay;
      }
      m.restart = false;
      watchPointer(input);
      for (const e of input.events ?? []) onEvent(e);
      if (input.button) onButton(input.button);
      stressStep(input);
      TIMERS[m.state](m.t - m.since, input.newt);
      return output();
    },
    /** A plain copy of what the brain is doing (for ?test and the specs). */
    snapshot() {
      return {
        t: m.t,
        state: m.state,
        since: m.since,
        clip: m.clip,
        clipStart: m.clipStart,
        turning: m.turning,
        reaction: m.reaction,
        history: [...m.history],
        pending: m.pending ? JSON.parse(JSON.stringify(m.pending)) : null,
        stress: m.stress,
        wander: m.wander,
        calm,
        aloneFor: m.t - m.aloneSince,
        goal: m.goal ? { x: m.goal.x, z: m.goal.z } : null,
        fleeUntil: m.fleeUntil,
        idleFor: m.idleFor,
      };
    },
  };
}
