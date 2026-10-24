// NEWT's brain in the invitation toy: a pure state machine (idle, walk, react, flee, held, fall,
// land, sitDown, sit, standUp, and Give Device's deviceSit, lieDown, deviceLie, getUp) that owns
// every timer and every change of state. Each frame it
// turns gestures and buttons into what he does, keeps his stress (taps, rough handling; it
// decays), and says which clip plays, how he moves, his face, where he looks and what the
// buttons show. A reaction first turns him to face the camera, so his face shows; a sit (by the
// button or by himself) and the tablet's sit and lie keep the way he faces. Held, he hangs his
// head (a light look aimed down, the sad face), glances up at you every TUNE.lookUpMin–lookUpMax
// s for TUNE.lookUpForMin–lookUpForMax s (BrainOut.look.up, eased in and out; never during a
// Thrash), and thrashes every TUNE.thrashMin–thrashMax s (sooner when he's shaken hard): Thrash
// once, then Held again on its own clock; held, falling and landing he keeps the way he faced
// when he was grabbed. Give Device (the button 'Device') alternates: sitting down with the
// tablet (SitDown, then DeviceSit; from Sit, DeviceSit where he sits), lying on his stomach with
// it (LieDown, then DeviceLie), getting up (GetUp); any other input gets him up from either first
// (StandUp from sitting, GetUp from lying), a grab picks him straight up. No three.js and no
// clock: time comes in as t, randomness from rng.js.
//
// Play Intro (BrainIn.dialogue, the box up while the intro runs) puts him in `talk`: he gets up
// if he's sitting, walks in toward the middle of the view when he's out past TUNE.talkNear, and
// turns to the camera, keeping his own face meanwhile; then he's in place (BrainOut.talkReady:
// main.js holds the line until it) and each new box sets his face (blinking on neutral only) and
// plays its animation, any clip (clips.js DIALOGUE_WAYS): a gesture once, then Talk while its
// line types and Idle once it's up; a loop (Talk, Think, Idle, Walk and Run in place, Held
// dangling) holds; Fall is a hop, then Land; Sit, Sit Down and the tablet's sit sit him down and
// hold it, Lie Down and the tablet's lie lie him down (sitting first) and hold it, and the next
// box that wants him up gets him up first (StandUp, GetUp); Stand Up and Get Up only get him up;
// none keeps what he's doing. The page stages Walk and Run in place and dangles Held, Thrash and
// Fall (talkPhase, dangleLift). He looks at the camera. Taps, grabs, floor taps, buttons,
// wandering and sitting by himself wait meanwhile; once the dialogue's gone he's back to play
// (standing up first if a box sat him down), not counted as alone all that time.

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
/** @typedef {NonNullable<BrainIn['dialogue']>} DialogueIn */
/**
 * @typedef {object} TalkState  dialogue mode (the `talk` state)
 * @property {'stand'|'walk'|'turn'|'on'} phase  getting up, walking in, turning to the camera, talking
 * @property {number} phaseAt  when the phase began
 * @property {number} seq  the box last acted on (-1: none yet)
 * @property {string|null} once  the one-shot under way (a gesture, or a way down or up)
 * @property {string|null} hold  the loop a box holds ('Idle', 'Talk', 'Think', 'Sit', 'DeviceLie'…),
 *   or null: Talk while the line types, else Idle
 * @property {string|null} then  the box's animation, waiting for the way down or up to end
 * @property {'stand'|'sit'|'lie'} pose  where the boxes have left him: on his feet, sat down, lying
 */

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
  /** A tap in this first share of a reaction only adds stress. */
  reactLock: 0.6,
  /** Fleeing from stress lasts at least this long. */
  fleeMin: 2.5,
  /** The Run button's flee. */
  runFor: 3,
  /**
   * With no pointer, the Run button's flee runs from a spot this far beside him, square to the
   * way to the camera (a side picked at random), so he runs across the view, not at the camera.
   */
  runFromGap: 1,
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
  /**
   * Let go, his look fades out this slowly, seconds (BrainOut.look.ease): over the fall and the
   * landing together, so a head turned round to the camera comes back as he lands, not in the
   * fall's first fifth of a second.
   */
  dropLookEase: 1,
  /** A walk has arrived within this distance of its goal. */
  arrive: 0.1,
  /** A walk gives up after its distance at walking speed × walkPatience + walkSlack s. */
  walkPatience: 1.5,
  walkSlack: 2,
  walkSpeed: GAIT.walk,
  runSpeed: GAIT.run,
  /** Play Intro: out past this from the play area's middle he walks in to it first, world units. */
  talkNear: 0.9,
  /** …then turns to the camera, until he faces it or for this long at most, seconds. */
  talkTurn: 1.2,
  /** Held: his look this light (the clip hangs his head), aimed this far down, radians. */
  heldLook: 0.15,
  heldPitch: -0.5,
  /**
   * Held, every lookUpMin–lookUpMax s (since he was grabbed, his last glance up or his last
   * thrash) he glances up at you for lookUpForMin–lookUpForMax s: BrainOut.look.up eases from 0
   * to 1 over lookUpEase s and back down, his look's weight with it up to lookUpWeight (the page
   * aims it toward the viewer as it comes up).
   */
  lookUpMin: 3,
  lookUpMax: 6,
  lookUpForMin: 0.8,
  lookUpForMax: 1.2,
  lookUpEase: 0.25,
  lookUpWeight: 0.85,
  /**
   * Held, he thrashes every thrashMin–thrashMax s, and within thrashShaken s of a hard shake, but
   * never before he's hung still thrashRest s (since he was grabbed, or his last thrash).
   */
  thrashMin: 3,
  thrashMax: 7,
  thrashShaken: 0.6,
  thrashRest: 1.5,
};

/**
 * The page's staging of the clips a box dangles him for (clips.js DIALOGUE_WAYS): his lowest sole
 * at least `gap` over the floor (world units), and Fall a hop `hop` high at its top.
 */
export const DANGLE = { gap: 0.03, hop: 0.14, clips: ['Held', 'Thrash', 'Fall'] };

/**
 * The step phase of Walk or Run held in a box, in place: on by dt over the clip's length (he
 * has no speed to step it on by), as ?test's play() does.
 * @param {number} phase  [0, 1)
 * @param {number} dt
 * @param {number} length  the clip's, seconds (0: held)
 */
export function talkPhase(phase, dt, length) {
  if (!(length > 0)) return phase;
  const next = (phase + dt / length) % 1;
  return next < 0 ? next + 1 : next;
}

/**
 * How far to lift his root while a box dangles him: his lowest sole up to DANGLE.gap over the
 * floor by the share Held, Thrash and Fall have (`hang`), and Fall's hop (by its share, over
 * its time `fallU` from 0 to 1: up and back down).
 * @param {{hang: number, sole: number, fall?: number, fallU?: number}} o  sole: his lowest
 *   sole's height with his root on the floor, world units
 */
export function dangleLift({ hang, sole, fall = 0, fallU = 0 }) {
  const k = Math.min(1, Math.max(0, hang));
  const u = Math.min(1, Math.max(0, fallU));
  return Math.max(0, DANGLE.gap - sole) * k + Math.min(1, Math.max(0, fall)) * DANGLE.hop * 4 * u * (1 - u);
}

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
  talk: 'gait',
  deviceSit: 'DeviceSit',
  lieDown: 'LieDown',
  deviceLie: 'DeviceLie',
  getUp: 'GetUp',
};
/** The FACE_TRACK entry for the gait states. */
const GAIT_FACE = { idle: 'Idle', walk: 'Walk', flee: 'Run' };
/** Sitting (Stand gets him up), and lying with the tablet. */
const SITTING = new Set(['sitDown', 'sit', 'deviceSit']);
const LYING = new Set(['lieDown', 'deviceLie']);
/** The states Give Device's tablet goes through (entering any other puts it away). */
const DEVICE_STATES = new Set(['sitDown', 'deviceSit', 'lieDown', 'deviceLie']);
/** A box's animation as the talk plays it: where its hold leaves him, and the ones that alias another. */
const TALK_POSE = { Sit: 'sit', DeviceSit: 'sit', DeviceLie: 'lie' };
const TALK_ALIAS = { SitDown: 'Sit', LieDown: 'DeviceLie' };
const EPS = 1e-9;

/**
 * @param {{seed?: number, calm?: boolean, bounds?: Bounds|null, middle?: XZ|null, tune?: Partial<typeof TUNE>}} [opts]
 *   calm: no wandering at first and never sitting by himself (?calm); middle: the floor point the
 *   default view looks at (Play Intro walks him in toward it; the play area box's middle by default)
 */
export function createBrain({ seed = 1, calm = false, bounds = null, middle = null, tune = {} } = {}) {
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
    /** @type {XZ|null} the Run button's spot to run from (runFromGap) */
    runFrom: null,
    /** @type {{x: number, z: number, t: number}|null} */
    threat: null,
    shakenUntil: 0,
    /** @type {XZ|null} */
    lastPointer: null,
    pointerMovedAt: 0,
    /** @type {BrainIn|null} */
    input: null,
    /** @type {TalkState|null} */
    talk: null,
    /** Give Device under way: the sit down is the tablet's, and lies on down once he's sat. */
    device: false,
    lieAfter: false,
    /** Held: when he thrashes next, and since when he's hung still (grabbed, or his last thrash over). */
    thrashAt: Infinity,
    hungSince: 0,
    /** Held: when he next glances up, and the glance under way ({from, until}), or null. */
    lookUpAt: Infinity,
    /** @type {{from: number, until: number}|null} */
    lookUp: null,
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
    m.lookUp = null;
    if (state === 'held') {
      m.thrashAt = m.t + between(rng, T.thrashMin, T.thrashMax);
      m.hungSince = m.t;
      m.lookUpAt = m.t + between(rng, T.lookUpMin, T.lookUpMax);
    }
    if (!DEVICE_STATES.has(state)) {
      m.device = false;
      m.lieAfter = false;
    }
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

  /** Sit down, the way he faces. */
  function sitDown() {
    m.device = false;
    m.lieAfter = false;
    enter('sitDown');
  }

  /** Sitting, or on the way down or up. */
  function seated() {
    const st = m.state;
    return st === 'sit' || st === 'deviceSit' || st === 'standUp' || st === 'sitDown';
  }

  /** Lying with the tablet, or on the way down or up. */
  function lyingDown() {
    return LYING.has(m.state) || m.state === 'getUp';
  }

  /** Down: sitting or lying, so anything else gets him up first. */
  function down() {
    return seated() || lyingDown();
  }

  /** Give Device: sat down with the tablet, then lying with it, then up again (BrainOut.device). */
  function giveDevice() {
    const st = m.state;
    if (st === 'deviceSit') lieDown();
    else if (st === 'sitDown' && m.device) {
      // (Pressed again on his way down: he lies on down once he's sat; a third press, up again.)
      if (!m.lieAfter) m.lieAfter = true;
      else afterStanding(null);
    } else if (LYING.has(st)) afterStanding(null);
    else if (st === 'sit') {
      enter('deviceSit');
      m.device = true;
    } else {
      sitDown();
      m.device = true;
    }
  }

  /** Down onto his stomach with the tablet, the way he faces. */
  function lieDown() {
    enter('lieDown');
    m.device = true;
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
    m.runFrom = fromThreat ? null : besideHim();
  }

  /**
   * A spot TUNE.runFromGap beside him, square to the way to the camera (toward +z without one),
   * on a side picked at random: the Run button runs him away from it, across the view.
   * @returns {XZ|null}
   */
  function besideHim() {
    const n = m.input?.newt;
    if (!n) return null;
    const a = cameraYaw();
    const side = rng() < 0.5 ? -1 : 1;
    return { x: n.x + side * Math.cos(a) * T.runFromGap, z: n.z - side * Math.sin(a) * T.runFromGap };
  }

  /** Gets him up first when he's down (StandUp from sitting, GetUp from lying), then does `p`. */
  function afterStanding(/** @type {Pending|null} */ p) {
    m.pending = p;
    if (m.state === 'standUp' || m.state === 'getUp') return;
    enter(lyingDown() ? 'getUp' : 'standUp');
  }

  /** @param {Pending|null} p */
  function doPending(p) {
    if (!p) enter('idle');
    else if (p.do === 'react') react(p.which);
    else if (p.do === 'walk') walk(p.goal, false);
    else flee(p.for, p.fromThreat);
  }

  // ---- dialogue mode (Play Intro) -------------------------------------------------------------

  /** @param {TalkState['phase']} phase */
  function setTalkPhase(phase) {
    const k = /** @type {TalkState} */ (m.talk);
    k.phase = phase;
    k.phaseAt = m.t;
    m.turning = phase === 'turn';
  }

  /** The intro begins: up first if he's down, then in toward the middle if he's far out, then the turn. */
  function beginTalk() {
    const sitting = seated();
    const lying = lyingDown();
    m.pending = null;
    m.stress = 0;
    company();
    enter('talk');
    m.talk = { phase: 'turn', phaseAt: m.t, seq: -1, once: null, hold: null, then: null, pose: 'stand' };
    if (sitting || lying) {
      setTalkPhase('stand');
      playOnce(lying ? 'GetUp' : 'StandUp');
    } else walkInOrTurn();
  }

  /** In toward the middle (createBrain's `middle`: where the default view looks) when he's out past talkNear, else the turn to the camera. */
  function walkInOrTurn() {
    const n = m.input?.newt;
    const c = middle ?? (bounds ? { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } : null);
    const d = n && c ? Math.hypot(n.x - c.x, n.z - c.z) : 0;
    if (n && c && d > T.talkNear) {
      const k = (T.talkNear * 0.8) / d;
      m.goal = { x: c.x + (n.x - c.x) * k, z: c.z + (n.z - c.z) * k };
      m.walkUntil = m.t + ((d - T.talkNear * 0.8) / T.walkSpeed) * T.walkPatience + T.walkSlack;
      setTalkPhase('walk');
    } else setTalkPhase('turn');
    m.clip = 'gait';
    m.restart = false;
  }

  /** @param {string} name  a one-shot, from its start */
  function playOnce(name) {
    const k = /** @type {TalkState} */ (m.talk);
    k.once = name;
    m.clip = name;
    m.clipStart = m.t;
    m.restart = true;
  }

  /**
   * A box's animation now: a loop held, or a gesture once; one that sits or lies him down gets
   * him there first (SitDown, then LieDown) and holds, and one that wants him on his feet gets
   * him up first (StandUp, GetUp); Stand Up and Get Up only get him up; Fall is a hop, then Land.
   * 'none' keeps what he does.
   * @param {string} name
   */
  function talkAnimation(name) {
    const k = /** @type {TalkState} */ (m.talk);
    if (name === 'none' || !name) return;
    const a = TALK_ALIAS[name] ?? name;
    if (a === 'StandUp' || a === 'GetUp') {
      if (k.pose !== 'stand') getUpTalking(null);
      return;
    }
    const pose = TALK_POSE[a] ?? 'stand';
    if (pose === k.pose) {
      k.then = null;
      if (pose !== 'stand') k.hold = a;
      else if (CLIPS[a]?.loop && a !== 'Fall') {
        k.once = null;
        k.hold = a;
      } else {
        k.hold = null;
        playOnce(a);
        if (a === 'Fall') k.then = 'Land';
      }
      return;
    }
    // The way there first, then the box's animation.
    if (k.pose === 'stand') {
      k.pose = 'sit';
      k.hold = pose === 'sit' ? a : null;
      k.then = pose === 'sit' ? null : a;
      playOnce('SitDown');
    } else if (k.pose === 'sit' && pose === 'lie') {
      k.pose = 'lie';
      k.hold = a;
      k.then = null;
      playOnce('LieDown');
    } else getUpTalking(a);
  }

  /** In a box: up from sitting (StandUp) or lying (GetUp), then `then` (null: Talk or Idle). */
  function getUpTalking(/** @type {string|null} */ then) {
    const k = /** @type {TalkState} */ (m.talk);
    playOnce(k.pose === 'lie' ? 'GetUp' : 'StandUp');
    k.pose = 'stand';
    k.hold = null;
    k.then = then;
  }

  /**
   * The clip while he talks: the one-shot under way until it fades out, then the box's loop, or
   * Talk while the line types and Idle once it's up.
   * @param {DialogueIn} d
   */
  function talkClip(d) {
    const k = /** @type {TalkState} */ (m.talk);
    const after = () => k.hold ?? (d.typing ? 'Talk' : 'Idle');
    if (k.once) {
      if (!fadeOutDue(k.once, clipTime().remaining, k.then ?? after())) return;
      k.once = null;
      if (k.then) {
        const a = k.then;
        k.then = null;
        talkAnimation(a);
        if (k.once) return;
      }
    }
    const want = after() === 'Idle' ? 'gait' : after();
    if (want === m.clip) return;
    m.clip = want;
    m.clipStart = m.t;
    m.restart = want !== 'gait';
  }

  /** A frame of the intro: the phases, then each new box's animation and the clip. */
  function talkStep() {
    const k = /** @type {TalkState} */ (m.talk);
    const d = m.input?.dialogue;
    company();
    if (!d) return;
    if (k.phase === 'stand') {
      if (!fadeOutDue(k.once ?? 'StandUp', clipTime().remaining, 'Idle')) return;
      k.once = null;
      walkInOrTurn();
      return;
    }
    if (k.phase === 'walk') {
      const n = m.input?.newt;
      const there = !n || !m.goal || Math.hypot(m.goal.x - n.x, m.goal.z - n.z) <= T.arrive;
      if (there || m.t >= m.walkUntil) setTalkPhase('turn');
      return;
    }
    if (k.phase === 'turn') {
      if (!(facingCamera() || m.t - k.phaseAt >= T.talkTurn - EPS)) return;
      setTalkPhase('on');
    }
    if (d.seq !== k.seq) {
      k.seq = d.seq;
      talkAnimation(d.animation);
    }
    talkClip(d);
  }

  /** The intro's over: back to play, getting up first if a box sat or laid him down (or he's getting up). */
  function endTalk() {
    const k = /** @type {TalkState} */ (m.talk);
    const c = m.clip;
    const lying = k.pose === 'lie' || c === 'LieDown' || c === 'DeviceLie';
    const getUp = lying || k.pose === 'sit' || c === 'SitDown' || c === 'Sit' || c === 'DeviceSit';
    const rising = c === 'StandUp' || c === 'GetUp';
    m.talk = null;
    m.turning = false;
    company();
    if (rising) {
      // (Already on his way up: the same StandUp or GetUp plays on.)
      m.state = c === 'GetUp' ? 'getUp' : 'standUp';
      m.since = m.t;
      m.pending = null;
    } else if (getUp) {
      m.pending = null;
      enter(lying ? 'getUp' : 'standUp');
    } else enter('idle');
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
      if (down()) afterStanding({ do: 'flee', for: T.fleeMin, fromThreat: true });
      else flee(T.fleeMin, true);
      return;
    }
    if (st === 'flee') return;
    if (st === 'react') {
      if (!m.turning && reactProgress() >= T.reactLock) react(pick());
      return;
    }
    if (down()) afterStanding({ do: 'react', which: pick() });
    else react(pick());
  }

  /** @param {XZ|null|undefined} floor */
  function onFloorTap(floor) {
    if (!floor) return;
    const st = m.state;
    if (down()) afterStanding({ do: 'walk', goal: { x: floor.x, z: floor.z } });
    else if (st === 'idle' || st === 'walk') walk(floor, false);
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
      case 'pan':
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
    const sitting = down();
    switch (name) {
      case 'Wave':
      case 'Spook':
        if (sitting) afterStanding({ do: 'react', which: name });
        else react(name);
        break;
      case 'Sit':
        if (SITTING.has(st) || LYING.has(st)) afterStanding(null);
        else sitDown();
        break;
      case 'Device':
        giveDevice();
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
      if (c.shake >= T.shakeHard) {
        m.shakenUntil = m.t + T.shakenFor;
        // (Shaken hard, he thrashes sooner.)
        if (m.clip !== 'Thrash')
          m.thrashAt = Math.min(m.thrashAt, Math.max(m.t + T.thrashShaken, m.hungSince + T.thrashRest));
      }
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
    sitDown() {
      // (With the tablet: DeviceSit, or on down to lie with it when pressed again meanwhile.)
      const next = !m.device ? 'Sit' : m.lieAfter ? 'LieDown' : 'DeviceSit';
      if (!fadeOutDue('SitDown', clipTime().remaining, next)) return;
      if (next === 'Sit') enter('sit');
      else if (next === 'LieDown') lieDown();
      else enter('deviceSit');
    },
    sit() {},
    deviceSit() {},
    lieDown() {
      if (fadeOutDue('LieDown', clipTime().remaining, 'DeviceLie')) enter('deviceLie');
    },
    deviceLie() {},
    held() {
      // Thrash now and then: once from its start, then Held again on its own clock.
      if (m.clip === 'Thrash') {
        if (!fadeOutDue('Thrash', clipTime().remaining, 'Held')) return;
        m.clip = 'Held';
        m.restart = false;
        m.hungSince = m.t;
        m.thrashAt = m.t + between(rng, T.thrashMin, T.thrashMax);
        m.lookUpAt = Math.max(m.lookUpAt, m.t + between(rng, T.lookUpMin, T.lookUpMax));
      } else if (m.t >= m.thrashAt - EPS) {
        startClip('Thrash');
        m.lookUp = null;
      } else lookUpStep();
    },
    talk() {
      talkStep();
    },
    standUp() {
      gettingUp('StandUp');
    },
    getUp() {
      gettingUp('GetUp');
    },
  };

  /** Held, hanging (not thrashing): a glance up when it's due, over when its time is up. */
  function lookUpStep() {
    if (m.lookUp && m.t >= m.lookUp.until - EPS) {
      m.lookUp = null;
      m.lookUpAt = m.t + between(rng, T.lookUpMin, T.lookUpMax);
    } else if (!m.lookUp && m.t >= m.lookUpAt - EPS)
      m.lookUp = { from: m.t, until: m.t + between(rng, T.lookUpForMin, T.lookUpForMax) };
  }

  /** How far up his glance is, 0 to 1: eased in from its start and out to its end (smoothstep). */
  function lookUpK() {
    const g = m.lookUp;
    if (!g) return 0;
    const ease = (/** @type {number} */ x) => {
      const u = Math.min(1, Math.max(0, x / T.lookUpEase));
      return u * u * (3 - 2 * u);
    };
    return Math.min(ease(m.t - g.from), ease(g.until - m.t));
  }

  /** Up (`clip`: StandUp or GetUp), then what waited for it. */
  function gettingUp(/** @type {string} */ clip) {
    const p = m.pending;
    const next = !p ? 'Idle' : p.do === 'react' ? p.which : p.do === 'walk' ? 'Walk' : 'Run';
    if (!fadeOutDue(clip, clipTime().remaining, next)) return;
    m.pending = null;
    doPending(p);
  }

  /** The base face and blinking from FACE_TRACK, measured from the clip's (or state's) start. */
  function face() {
    const st = m.state;
    const d = m.input?.dialogue;
    // (The box's face comes with its line, once he's in place: getting there he keeps his own.)
    if (st === 'talk' && d && m.talk?.phase === 'on')
      return { face: d.face, blink: d.face === 'neutral' ? 'normal' : 'none' };
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
    if (st === 'talk') return { mode: 'camera', weight: 1 };
    if (st === 'fall' || st === 'land') return { mode: 'forward', weight: 0, ease: T.dropLookEase };
    if (st === 'react' && m.reaction === 'Spook') return { mode: 'forward', weight: 0 };
    if (st === 'react' && m.reaction === 'Wave') return { mode: 'camera', weight: 1 };
    // (Held: his head hangs in defeat, the clip's; a light look aimed down, glancing about, and
    // now and then up at you: `up`.)
    if (st === 'held') {
      const up = lookUpK();
      return { mode: 'forward', weight: T.heldLook + (T.lookUpWeight - T.heldLook) * up, pitch: T.heldPitch, up };
    }
    // (With the tablet: at it, as the clips look.)
    if (st === 'deviceSit' || LYING.has(st)) return { mode: 'forward', weight: 0 };
    if (st === 'flee') return { mode: 'back', weight: 1, at: pursuer() };
    return { mode: 'pointer', weight: 1 };
  }

  /**
   * Who he runs from, on the floor: the pointer, or where it (or the tap that sent him off) was
   * last seen, while he remembers it; null for the Run button with no pointer.
   * @returns {XZ|null}
   */
  function pursuer() {
    const p = m.input?.pointer;
    if (p) return { x: p.x, z: p.z };
    const th = m.threat;
    return th && m.t - th.t <= T.threatMemory + EPS ? { x: th.x, z: th.z } : null;
  }

  /** @returns {BrainOut['move']} */
  function move() {
    switch (m.state) {
      case 'walk':
        return { mode: 'goto', goal: { x: m.goal.x, z: m.goal.z }, speed: T.walkSpeed };
      case 'flee': {
        const th = m.threat;
        const recent = m.fleeFromThreat && !m.input?.pointer && th && m.t - th.t <= T.threatMemory + EPS;
        const from = recent ? { x: th.x, z: th.z } : m.fleeFromThreat ? null : m.runFrom;
        return { mode: 'flee', goal: from ? { x: from.x, z: from.z } : null, speed: T.runSpeed };
      }
      case 'talk':
        if (m.talk?.phase === 'walk' && m.goal)
          return { mode: 'goto', goal: { x: m.goal.x, z: m.goal.z }, speed: T.walkSpeed };
      // falls through: he faces the camera
      case 'react': {
        const c = m.input?.camera;
        return { mode: 'face', goal: c ? { x: c.x, z: c.z } : null, speed: 0 };
      }
      default:
        return { mode: 'stay', goal: null, speed: 0 };
    }
  }

  /** Give Device under way: sitting with the tablet (or on his way down with it), or lying with it. */
  function deviceNow() {
    const st = m.state;
    if (st === 'deviceSit') return 'sit';
    if (LYING.has(st)) return 'lie';
    if (st === 'sitDown' && m.device) return m.lieAfter ? 'lie' : 'sit';
    return null;
  }

  /** @returns {BrainOut} */
  function output() {
    const st = m.state;
    const { face: f, blink } = face();
    const device = deviceNow();
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
      sitLabel: SITTING.has(st) || LYING.has(st) ? 'Stand' : 'Sit',
      buttonsEnabled: st !== 'held' && st !== 'fall' && st !== 'talk',
      reaction: st === 'react' ? m.reaction : null,
      talkReady: st === 'talk' && m.talk?.phase === 'on',
      device,
      deviceLabel: device === 'sit' ? 'Lie Down' : device === 'lie' ? 'Get Up' : 'Give Device',
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
      const d = input.dialogue ?? null;
      if (d && m.state !== 'talk' && m.state !== 'held' && m.state !== 'fall') beginTalk();
      else if (!d && m.state === 'talk') endTalk();
      // (While he talks, the gestures and buttons wait: main.js sends none, and any that come do nothing.)
      if (m.state !== 'talk') {
        for (const e of input.events ?? []) onEvent(e);
        if (input.button) onButton(input.button);
      }
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
        talk: m.talk ? { ...m.talk } : null,
      };
    },
  };
}
