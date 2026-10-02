// The knight's gestures and dance moves (knightPose.js hands them out): Dark Souls' own, the
// helmet swap's hold and the site's dance (gesture), and the dance library, each move a pure
// function of the beat (dance), seated or on his feet, kept in the room he has for his arms.
import * as THREE from 'three';
import { TAU, clamp, clamp01, smooth } from '../math.js';
import { DEG, POSE, POSE_SIZE, newPose, DEFAULT_RIG, sideOf, legOf } from './knightRig.js';
import {
  joint,
  nudge,
  arm,
  leg,
  root,
  copy,
  lerpPose,
  mirrorPose,
  chestFrame,
  reframeArms,
  armRoom,
  armAt,
  hemArms,
  headAt,
  HELM_HOLD,
  headDir,
  aimHead,
  standingPose,
  standBy,
  seatOf,
  accent,
  env,
  fr,
  attend,
  RISE_TIME,
  rise,
  turnPose,
} from './knightBody.js';

/** Room on both sides (gesture()'s `room`). */
const FREE = [1, 1];

// --- gestures ------------------------------------------------------------------------------------
/** The site's dance: its tempo and length (beats), and how long each turn to the front takes (s). */
export const DANCE_BPM = 118;
const DANCE_BEATS = 8;
const DANCE_TURN = 0.4;
const DANCE_LEN = (DANCE_BEATS * 60) / DANCE_BPM;
const DANCE_EASE = 0.35; // (seated: into the dance and out of it, s)
/**
 * The gestures, and how long each lasts (s). 'helm' is the helmet swap's (both hands to it);
 * 'dance' is up from the seat, the Default Dance for two bars at DANCE_BPM, and back down.
 */
export const GESTURE_TIME = {
  praise: 2.3,
  wave: 2,
  bow: 2.2,
  point: 1.9,
  beckon: 2.1,
  shrug: 1.6,
  hurrah: 1.8,
  joy: 1.6,
  helm: 1.6,
  dance: 2 * RISE_TIME + 2 * DANCE_TURN + DANCE_LEN,
};
/**
 * The site's dance danced in his seat (gesture()'s `inPlace`: where the view has no room over
 * his seat for him to stand up in): how long it lasts (s), easing into the two bars and out.
 */
export const DANCE_SEATED_TIME = DANCE_LEN + 2 * DANCE_EASE;
export const GESTURES = ['praise', 'wave', 'bow', 'point', 'beckon', 'shrug', 'hurrah', 'joy', 'dance'];
/** Gestures that throw the arms up (or dance): a flinch or a lean over one would hide it. */
export const CHEERS = ['praise', 'hurrah', 'joy', 'dance'];
const gTarget = newPose();
const gStand = newPose();
const gWind = newPose();
const gRest = newPose();
const gFrom = new THREE.Quaternion();
const gLook = new THREE.Vector3();
/** How far a seated knight sits up for a gesture (a share of attend()). */
const SIT_UP = { praise: 1, wave: 0.8, bow: 0.7, point: 0.9, beckon: 0.7, shrug: 0.8, hurrah: 1, joy: 1, helm: 0.9 };
/** Gestures with a hand thrown out to his right: with no room there, he uses his left. */
const RIGHT_HANDED = new Set(['wave']);

/**
 * One gesture's pose at `t` into `g` (a copy of the pose it's over); returns its weight.
 * `seated` changes what the legs and hips do (they keep the seat) and a few gestures;
 * `room` [left, right] 0..1: how much room there is out to each side for an arm flung out
 * (a pillar beside him: less; the arm goes up more than out).
 */
function gestureTarget(g, p, name, t, seated, room = FREE) {
  const T = GESTURE_TIME[name];
  const keepLegs = () => {
    if (seated) {
      for (let i = 0; i < 3; i++) g[i] = p[i];
      for (let i = POSE.legL; i < POSE_SIZE; i++) g[i] = p[i];
      g[POSE.hips] = p[POSE.hips];
    }
  };
  switch (name) {
    case 'praise': {
      // The arms fly up and out, the back arches, the feet plant wide (hemmed in on a side,
      // that arm goes up in front of him instead).
      arm(g, 'L', 8 + 70 * room[0], 58 - 2 * room[0], 1, 0, -20, 0);
      arm(g, 'R', 8 + 70 * room[1], 58 - 2 * room[1], 1, 0, -20, 0);
      joint(g, 'spine', -10);
      joint(g, 'chest', -10);
      joint(g, 'neck', -6);
      joint(g, 'head', -22);
      joint(g, 'hips', 0);
      root(g, 0, -0.01 + 0.05 * Math.sin(Math.PI * clamp01((t - 0.42) / 0.3)), 0);
      leg(g, 'L', 0.13, 0, 0.02, 0, 16);
      leg(g, 'R', 0.13, 0, 0.02, 0, 16);
      keepLegs();
      return env(t, 0.36, 0.34, T, 0.5);
    }
    case 'wave': {
      const sw = Math.sin(TAU * 2.2 * Math.max(0, t - 0.3)) * env(t, 0.25, 0.2, T - 0.3, 0.3);
      arm(g, 'R', 72 + 22 * sw, 48, 0.72, -15, -10, 0.1);
      nudge(g, 'head', 0, -8, -6);
      nudge(g, 'chest', 0, -8, -4);
      if (!seated) g[0] += 0.03;
      return env(t, 0, 0.3, T, 0.4);
    }
    case 'bow': {
      // A hand to the heart, the other out behind; seated, a nod of the chest and head.
      if (seated) {
        nudge(g, 'spine', 10);
        nudge(g, 'chest', 5);
        nudge(g, 'head', 14);
      } else {
        joint(g, 'hips', 8);
        nudge(g, 'spine', 24);
        nudge(g, 'chest', 10);
        nudge(g, 'head', 12);
      }
      arm(g, 'R', -40, -12, 0.36, 40, 20, 0.8);
      arm(g, 'L', seated ? 70 : 120, -50, 0.95, 0, 0, 0.6);
      if (!seated) {
        leg(g, 'R', 0.02, 0, -0.16, 0, 14);
        g[1] -= 0.04;
        g[2] -= 0.03;
      }
      keepLegs();
      return env(t, 0, 0.45, T, 0.55);
    }
    case 'point': {
      arm(g, 'R', 4, 6, 1, 0, 0, 0.6);
      arm(g, 'L', 80, -52, 0.5, -70, 20, 1);
      nudge(g, 'spine', 6);
      nudge(g, 'chest', 2, -6);
      nudge(g, 'head', -6, -4);
      if (!seated) {
        g[2] += 0.05;
        leg(g, 'R', 0.03, 0, 0.1, 0, 10);
      }
      return env(t, 0.05, 0.22, T, 0.4);
    }
    case 'beckon': {
      const c = Math.sin(TAU * 1.6 * Math.max(0, t - 0.3)) * env(t, 0.25, 0.15, T - 0.35, 0.2);
      arm(g, 'R', 26, -8 + 10 * c, 0.78 - 0.22 * c, 10, -30 - 40 * c, 0.2 + 0.5 * Math.max(0, c));
      nudge(g, 'spine', -5);
      nudge(g, 'head', -4, -6, -6);
      return env(t, 0, 0.3, T, 0.4);
    }
    case 'shrug': {
      arm(g, 'L', 70, -38, 0.5, -45, -45, 0);
      arm(g, 'R', 70, -38, 0.5, -45, -45, 0);
      nudge(g, 'neck', -6);
      nudge(g, 'head', 0, 0, 11);
      nudge(g, 'chest', -4);
      if (!seated) g[1] += 0.03;
      return env(t, 0.05, 0.25, T, 0.45);
    }
    case 'hurrah': {
      arm(g, 'R', 30, 80, 1, 0, 0, 1);
      arm(g, 'L', 58, -26 + 20 * Math.sin(TAU * 2.4 * t), 0.5, 20, 0, 1);
      nudge(g, 'spine', -8);
      nudge(g, 'chest', -4);
      nudge(g, 'head', -16);
      if (!seated) g[1] += 0.07 * Math.max(0, Math.sin(Math.PI * clamp01((t - 0.12) / 0.3)));
      return env(t, 0.05, 0.22, T, 0.45);
    }
    case 'joy': {
      // A crouch, a leap with the arms flung up, a landing (seated: a bounce on the seat, the
      // heels kicking up; the hips stay on the stone).
      const crouch = env(t, 0, 0.25, 0.42, 0.1) + env(t, 0.78, 0.06, 1.1, 0.25) * 0.6;
      const u = clamp01((t - 0.36) / 0.44);
      const air = t > 0.36 && t < 0.8 ? 4 * u * (1 - u) : 0;
      if (!seated) {
        g[1] = p[1] - 0.14 * crouch + 0.32 * air;
        for (const s of ['L', 'R']) {
          const o = legOf(s);
          g[o + 1] = p[o + 1] + 0.32 * air + 0.12 * air;
          g[o + 3] = 20 * DEG * air;
        }
        nudge(g, 'spine', 22 * crouch - 6 * air);
      } else {
        nudge(g, 'spine', 10 * crouch - 8 * air);
        for (const s of ['L', 'R']) {
          const o = legOf(s);
          g[o + 1] = p[o + 1] + 0.09 * air;
          g[o + 2] = p[o + 2] - 0.03 * air;
          g[o + 3] = p[o + 3] - 14 * DEG * air;
        }
      }
      const fling = clamp01((t - 0.3) / 0.14) * (1 - clamp01((t - 1.1) / 0.4));
      arm(g, 'L', 10 + (50 + 20 * crouch) * room[0], -70 + (125 + 10 * room[0]) * fling, 0.95, 0, 0, 0.3);
      arm(g, 'R', 10 + (50 + 20 * crouch) * room[1], -70 + (125 + 10 * room[1]) * fling, 0.95, 0, 0, 0.3);
      nudge(g, 'head', -18 * fling);
      return env(t, 0, 0.12, T, 0.3);
    }
    case 'helm': {
      // Both hands up to the helmet's sides, holding it while it changes: the elbows out
      // wide, the gauntlets upright beside the helm (never over its face).
      nudge(g, 'head', -4);
      nudge(g, 'chest', -3);
      const h = headAt(g);
      for (const [s, sg] of /** @type {[string, number][]} */ ([
        ['L', 1],
        ['R', -1],
      ])) {
        armAt(
          g,
          s,
          h.x + sg * HELM_HOLD[0],
          h.y + HELM_HOLD[1],
          h.z + HELM_HOLD[2],
          HELM_HOLD[3],
          HELM_HOLD[4],
          0.25,
          HELM_HOLD[5],
        );
      }
      return env(t, 0, 0.3, T, 0.35);
    }
    default:
      return 0;
  }
}

/**
 * A gesture `t` s in, over the pose already in `p` (sitting or standing: `seated` keeps the
 * legs and hips where they are). Seated, he sits up first, and the arms and head go where
 * they would standing (in the room: an arm thrown up is thrown up however he was slumped;
 * the helmet swap's hands still hold the helmet where it is). `turn` (rad,
 * + his left) is for 'dance': where the front is, to face it while he dances; `stand` (a
 * pose) where he stands up to for it (standBy() in front of the seat if not given), and
 * `over` what his feet step over on the way (rise()'s).
 * `room` [left, right] 0..1: the room out to each side (knights.js, from the scenery's
 * shapes: a pillar beside him): an arm that would be flung into something goes up instead (every
 * gesture keeps its arms' swing out and back within it: hem), and a wave changes hands.
 * `inPlace` (seated, 'dance'): he dances it in his seat instead of getting up
 * (DANCE_SEATED_TIME long): the view has no room over him to stand up in.
 */
export function gesture(
  p,
  name,
  t,
  seated = false,
  seed = 0,
  { turn = 0, stand = null, room = FREE, inPlace = false, over = null } = {},
) {
  const T = GESTURE_TIME[name];
  if (!T || t < 0 || t >= T) return p;
  if (name === 'dance')
    return seated && inPlace
      ? seatedDanceGesture(p, t, seed, room)
      : danceGesture(p, t, seated, seed, turn, stand, room, over);
  // (The other hand, as his mirror image: the pose mirrored, gestured, mirrored back.)
  if (RIGHT_HANDED.has(name) && room[1] < 0.5 && room[0] > room[1]) {
    mirrorPose(p);
    gesture(p, name, t, seated, seed, { room: [room[1], room[0]] });
    return mirrorPose(p);
  }
  const up = seated ? env(t, 0, 0.25, T, 0.5) * (SIT_UP[name] ?? 0.8) : 0;
  // (His arms at rest, as the gesture finds them: hemmed in, what it adds is kept in the room.)
  const rest = copy(gRest, p);
  // Praise the Sun winds up first: the arms swing down and back, a dip, then the up-throw.
  if (name === 'praise') {
    const wind = copy(gWind, p);
    arm(wind, 'L', 20, -86, 0.8, 0, 0, 0.9);
    arm(wind, 'R', 20, -86, 0.8, 0, 0, 0.9);
    nudge(wind, 'spine', 10);
    nudge(wind, 'head', 10);
    if (seated) attend(wind, up);
    else wind[1] -= 0.06;
    if (seated) {
      const s = standingPose(gStand);
      nudge(s, 'spine', 10);
      gFrom.copy(chestFrame(s).q);
      reframeArms(wind, gFrom, chestFrame(wind).q);
    }
    hemArms(wind, room);
    const w = env(t, 0.36, 0.34, T, 0.5);
    lerpPose(p, p, wind, env(t, 0, 0.3, 0.7, 0.34) * (1 - w));
  }
  if (up > 0) attend(p, up);
  const g = copy(gTarget, p);
  const w = gestureTarget(g, p, name, t, seated, room);
  if (seated) {
    // Where the arms would point standing, in the room, now from his seated chest.
    const s = standingPose(gStand);
    gestureTarget(s, s, name, t, false, room);
    gFrom.copy(chestFrame(s).q);
    headDir(s, gLook);
    for (const side of ['L', 'R']) {
      const o = sideOf(side);
      for (let i = 0; i < 7; i++) g[o + i] = s[o + i];
    }
    reframeArms(g, gFrom, chestFrame(g).q);
    // …and the head looks where it would standing (up with a cheer, down in a bow), level.
    aimHead(g, gLook, 1);
    if (name === 'helm') {
      const h = headAt(g);
      for (const [side, sg] of /** @type {[string, number][]} */ ([
        ['L', 1],
        ['R', -1],
      ]))
        armAt(
          g,
          side,
          h.x + sg * HELM_HOLD[0],
          h.y + HELM_HOLD[1],
          h.z + HELM_HOLD[2],
          HELM_HOLD[3],
          HELM_HOLD[4],
          0.25,
          HELM_HOLD[5],
        );
    }
  }
  // (Hemmed in at a side: that arm keeps to the room it has, there and on its way there. Only
  // what the gesture adds: his arm at rest is clear where he sits, so it's left as it is (it
  // never jumps as a gesture starts or ends), and eased from there toward the hemmed one it
  // swings out no further than it hung at rest.)
  hemArms(g, room);
  lerpPose(p, p, g, w);
  hemArms(p, room, rest);
  if (seed < 0) return p; // (every knight gestures alike today; `seed` is for variations)
  return p;
}

const dBase = newPose();
const dStand = newPose();
const dMove = newPose();
const dRef = newPose();
/**
 * The site's dance, a gesture: seated, he gets up (his feet stepping out to `stand`), turns
 * toward the front (`turn`), dances the Default Dance for two bars at DANCE_BPM on his own
 * clock, turns back and sits down again; standing, he just dances. Pure in `t`, like the
 * others.
 */
function danceGesture(p, t, seated, seed, turn, standAt = null, room = FREE, over = null) {
  const base = copy(dBase, p);
  const stand = !seated
    ? copy(dStand, base)
    : standAt
      ? copy(dStand, standAt)
      : standBy(dStand, clamp(seatOf(base), 0, 0.6));
  const t0 = seated ? RISE_TIME + DANCE_TURN : 0;
  const t1 = t0 + DANCE_LEN;
  if (seated && t < RISE_TIME) return rise(p, base, stand, t, false, over);
  if (seated && t >= t1 + DANCE_TURN) return rise(p, base, stand, t - t1 - DANCE_TURN, true, over);
  if (!seated && t >= t1) return p;
  // On his feet: the dance over his standing pose, eased in and out over a quarter second.
  const period = 60 / DANCE_BPM;
  const m = standingPose(dMove);
  dance(m, 'defaultDance', clamp(t - t0, 0, DANCE_LEN) / period, { period, energy: 0.85, seed: seed & ~1, room });
  // (Moved from over the rest place to where he stands, feet and all.)
  const ref = standingPose(dRef);
  for (let i = 0; i < 3; i++) m[i] += stand[i] - ref[i];
  for (const o of [POSE.legL, POSE.legR]) for (let i = 0; i < 3; i++) m[o + i] += stand[o + i] - ref[o + i];
  const inOut = smooth(clamp01((t - t0) / 0.25)) * smooth(clamp01((t1 - t) / 0.25));
  lerpPose(p, stand, m, inOut);
  // (The dance's arms are hemmed in (dance()); eased from his standing ones, no further out.)
  hemArms(p, room, stand);
  // (Into the dance's stance and out of it with a little hop.)
  const hop = 0.04 * Math.sin(Math.PI * inOut);
  p[POSE.legL + 1] += hop;
  p[POSE.legR + 1] += hop;
  if (seated && turn) {
    // Round to the front before, and back after (each foot stepping round).
    const a = clamp(turn, -1.3, 1.3);
    const f = t < t0 ? (t - RISE_TIME) / DANCE_TURN : t > t1 ? 1 - (t - t1) / DANCE_TURN : 1;
    const u = clamp01(f);
    const first = t < t0 ? 0 : 1; // (which foot leads: the left going round, the right coming back)
    const fL = smooth(clamp01((u - (first ? 0.4 : 0)) / 0.6)),
      fR = smooth(clamp01((u - (first ? 0 : 0.4)) / 0.6));
    turnPose(p, a, fL, fR, stand[0], stand[2]);
  }
  return p;
}
const dSeat = newPose();
const dRest = newPose();
/**
 * The site's dance in his seat (gesture()'s `inPlace`): the Default Dance's seated version
 * (its arm swings and head bob over the seat, dance()'s `seated`) for the same two bars,
 * eased in from the pose he's in and back out to it. He leans in over his knees for it
 * instead of sitting up (SEATED_DANCE_UP, SEATED_DANCE_LEAN), so his helmet stays as low as
 * it sits: the view it's for frames his seat right under the page's header. Pure in `t`.
 */
function seatedDanceGesture(p, t, seed, room = FREE) {
  const period = 60 / DANCE_BPM;
  const m = copy(dSeat, p);
  nudge(m, 'spine', SEATED_DANCE_LEAN);
  dance(m, 'defaultDance', clamp(t - DANCE_EASE, 0, DANCE_LEN) / period, {
    period,
    energy: 0.85,
    seed: seed & ~1,
    seated: true,
    up: SEATED_DANCE_UP,
    room,
  });
  const w = smooth(clamp01(t / DANCE_EASE)) * smooth(clamp01((DANCE_SEATED_TIME - t) / DANCE_EASE));
  // (The dance's arms are hemmed in (dance()); eased from his resting ones, no further out.)
  const rest = copy(dRest, p);
  return hemArms(lerpPose(p, p, m, w), room, rest);
}

// --- dancing --------------------------------------------------------------------------------------
/**
 * The dance moves. Each is a pure function of the beat: `b` beats (fractional), `period`
 * seconds a beat, `energy` 0..1 (how big), `seed` (small variations, a mirrored side).
 * `cycle`: beats until it repeats; `seated`: it works sitting down too (the upper body).
 */
export const MOVE_INFO = {
  nod: { cycle: 2, seated: true },
  stepTouch: { cycle: 2, seated: false },
  fistPump: { cycle: 8, seated: true },
  headbang: { cycle: 2, seated: true },
  swayArms: { cycle: 2, seated: true },
  march: { cycle: 2, seated: false },
  spin: { cycle: 4, seated: false },
  jump: { cycle: 2, seated: false },
  jumpingJack: { cycle: 2, seated: false },
  clap: { cycle: 2, seated: true },
  stomp: { cycle: 2, seated: false },
  praise: { cycle: 1, seated: true },
  defaultDance: { cycle: 8, seated: true },
};
export const MOVES = Object.keys(MOVE_INFO);

const sStand = newPose();
const sRef = new THREE.Quaternion();
const sLook = new THREE.Vector3();
/** How much of a standing move's torso a seated dancer keeps, and how far he sits up for it. */
const SEATED_TORSO = 0.6;
const SEATED_UP = 1;
/**
 * ...and for the site's dance in his seat (seatedDanceGesture): he doesn't sit up, he leans
 * in over his knees (°) and grooves there, so his helmet stays as low as it sits.
 */
const SEATED_DANCE_UP = 0;
const SEATED_DANCE_LEAN = 14;

/**
 * A dance move at beat `b` over the pose in `p` (a standing or seated base): writes the
 * move into `p`. Unknown moves nod. `seated`: the upper body of the move over the seat — he
 * sits up (`up` 0..1 how far: all the way by default), keeps part of the move's lean and
 * sway, and his arms and head go where they would standing (the head level); the legs and
 * hips keep the seat (the nod drums on his knees). `room` [left, right] 0..1: hemmed in at a
 * side, that arm's swing out and back keeps within it (as for gesture()).
 */
export function dance(
  p,
  move,
  b,
  { period = 0.5, energy = 0.7, seed = 0, seated = false, up = SEATED_UP, room = FREE } = {},
) {
  const info = MOVE_INFO[move] ?? MOVE_INFO.nod;
  if (!MOVE_INFO[move] || (seated && !info.seated)) move = 'nod';
  if (!seated) return hemArms(danceOn(p, move, b, period, energy, seed, false), room);
  // The move standing, for its torso and where its arms go.
  const s = danceOn(standingPose(sStand), move, b, period, energy, seed, true);
  const ref = standingPose(dMove);
  sRef.copy(chestFrame(s).q);
  headDir(s, sLook);
  attend(p, up);
  for (const j of ['spine', 'chest']) {
    const o = POSE[j];
    for (let i = 0; i < 3; i++) p[o + i] += (s[o + i] - ref[o + i]) * SEATED_TORSO;
  }
  for (const side of ['L', 'R']) {
    const o = sideOf(side);
    for (let i = 0; i < 7; i++) p[o + i] = s[o + i];
  }
  reframeArms(p, sRef, chestFrame(p).q);
  // The head looks where it would standing (nodding, banging), level.
  aimHead(p, sLook, 1);
  if (move === 'nod') drum(p, b, 0.8 + 0.45 * clamp01(energy));
  return hemArms(p, room);
}
/**
 * Seated nodding along: the forearms drumming on the knees, bent at the elbow, one hand
 * then the other (knight space, whatever the chest does).
 */
function drum(p, b, A) {
  const pat = (s) => Math.max(0, Math.sin(Math.PI * (b + s)));
  for (const [s, off] of /** @type {[string, number][]} */ ([
    ['L', 0],
    ['R', 1],
  ])) {
    const h = pat(off) * A;
    armRoom(p, s, 14, -34 + 16 * h, 0.64 - 0.05 * h, 30, 10 - 20 * h, 0.9);
  }
}

/** The moves themselves, over a standing base (`forSeat`: the seated version's upper body). */
function danceOn(p, move, b, period, energy, seed, forSeat) {
  const A = 0.8 + 0.45 * clamp01(energy);
  const mirror = seed % 2 === 1;
  if (mirror) mirrorPose(p);
  const hipsY = p[1];
  const ph = fr(b);
  const beat = Math.floor(b);
  const d = accent(ph);
  const lag = accent(fr(b - 0.07)); // the head and arms follow through a moment late
  const seated = forSeat;
  switch (move) {
    case 'nod': {
      const sway = Math.sin(Math.PI * b);
      p[0] += 0.04 * sway * A;
      p[1] += -0.075 * d * A;
      nudge(p, 'hips', 0, 0, 7 * sway);
      leg(p, 'L', 0.07, 0, 0.02, 0, 22);
      leg(p, 'R', 0.07, 0, 0.02, 0, 22);
      arm(p, 'L', 40 + 18 * sway, -58 + 16 * lag, 0.7, 20, 10, 1);
      arm(p, 'R', 40 - 18 * sway, -58 + 16 * lag, 0.7, 20, 10, 1);
      nudge(p, 'spine', 4 + 10 * d * A);
      nudge(p, 'chest', 5 * d * A, 0, -4 * sway);
      nudge(p, 'head', -6 + (seated ? 20 : 30) * lag * A, 0, -7 * sway);
      break;
    }
    case 'stepTouch': {
      // Step out to one side on the beat, the other foot closing to touch; clap as it touches.
      const side = beat % 2 === 0 ? 1 : -1; // 1: his right, this beat
      const moving = smooth(clamp01((ph - 0.45) / 0.45)); // over to the other side before the next beat
      const cx = -0.13 * A * side * (1 - 2 * moving);
      p[0] = cx;
      p[1] = hipsY - 0.06 * d * A - 0.03;
      const lead = side > 0 ? 'R' : 'L',
        trail = side > 0 ? 'L' : 'R';
      // The lead foot holds wide; the trailing one touches beside it, then both swap roles.
      const wide = 0.16 * A,
        touch = -0.02;
      const liftT = Math.sin(Math.PI * clamp01((ph - 0.45) / 0.45));
      leg(p, lead, wide - (wide - touch) * moving, 0.08 * liftT * (moving > 0.5 ? 1 : 0), 0.02, 0, 16);
      leg(
        p,
        trail,
        touch + (wide - touch) * moving,
        0.1 * liftT * (moving <= 0.5 ? 1 : 0) + 0.03 * (1 - moving) * (ph < 0.45 ? 1 : 0),
        0.04,
        18 * (ph < 0.45 ? 1 : 0),
        16,
      );
      // Arms swing open between beats and clap together on the touch.
      const open = 1 - d;
      arm(p, 'L', -4 + 60 * open, -8 - 18 * open, 0.62, 20, 0, 0.2);
      arm(p, 'R', -4 + 60 * open, -8 - 18 * open, 0.62, 20, 0, 0.2);
      nudge(p, 'hips', 0, 8 * side, -9 * side * (1 - 2 * moving));
      nudge(p, 'chest', 4 * d, -6 * side, 5 * side * (1 - 2 * moving));
      nudge(p, 'head', 8 * lag, 8 * side, 7 * side * (1 - 2 * moving));
      break;
    }
    case 'fistPump': {
      // One fist pumps the sky on every beat (four with the right, four with the left); the other on the hip.
      const s = Math.floor(fr(b / 8) * 2) === 0 ? 'R' : 'L';
      const o = s === 'R' ? 'L' : 'R';
      const up = accent(fr(b + 0.03));
      arm(p, s, 18, 8 + 74 * up * A, 0.45 + 0.55 * up, 30 - 20 * up, 0, 1);
      arm(p, o, 82, -54, 0.52, -65, 25, 1);
      nudge(p, 'chest', -9 * up, s === 'R' ? 6 : -6, (s === 'R' ? 5 : -5) * up);
      nudge(p, 'head', -16 * up + 8 * (1 - lag), 0, (s === 'R' ? -9 : 9) * up); // (the head kept clear of the fist's arm)
      p[1] += -0.07 * (1 - up) * A + 0.02;
      leg(p, 'L', 0.09, 0, 0.02, 0, 20);
      leg(p, 'R', 0.09, 0, 0.02, 0, 20);
      nudge(p, 'hips', 0, 0, s === 'R' ? -6 : 6);
      break;
    }
    case 'headbang': {
      // The whole upper body slams down on the beat; air guitar or both fists down.
      const guitar = Math.floor(seed / 2) % 2 === 0;
      nudge(p, 'spine', 6 + 14 * d * A);
      nudge(p, 'chest', 22 * d * A);
      nudge(p, 'neck', 18 * lag * A);
      nudge(p, 'head', -18 + 46 * lag * A);
      if (guitar) {
        arm(p, 'L', 22, -6, 0.86, 45, -20, 0.9);
        arm(p, 'R', -18, -34 + 36 * (1 - d), 0.6, 30, 10, 1);
      } else {
        arm(p, 'L', 28, -38 - 30 * d, 0.72, 10, 0, 1);
        arm(p, 'R', 28, -38 - 30 * d, 0.72, 10, 0, 1);
      }
      p[1] += -0.09 * d * A;
      leg(p, 'L', 0.12, 0, 0, 0, 26);
      leg(p, 'R', 0.12, 0, 0, 0, 26);
      break;
    }
    case 'swayArms': {
      // Arms high in a V, swaying from side to side over two beats, the hips going the other way.
      const s = Math.cos(Math.PI * b); // + to his left on even beats
      arm(p, 'L', 72 + 28 * s, 62 - 16 * s, 0.97, 10, -10, 0.1);
      arm(p, 'R', 72 - 28 * s, 62 + 16 * s, 0.97, 10, -10, 0.1);
      nudge(p, 'spine', 0, 0, -9 * s * A);
      nudge(p, 'chest', -4, 0, -8 * s * A);
      nudge(p, 'head', -12, 0, -7 * Math.cos(Math.PI * (b - 0.12)) * A);
      p[0] = -0.07 * s * A;
      p[1] += -0.05 * d;
      leg(p, 'L', 0.1, 0, 0, 0, 16);
      leg(p, 'R', 0.1, 0, 0, 0, 16);
      nudge(p, 'hips', 0, 0, 7 * s);
      break;
    }
    case 'march': {
      // Knees high, one each beat, the opposite arm swinging forward.
      for (const [s, off] of /** @type {[string, number][]} */ ([
        ['L', 0],
        ['R', 1],
      ])) {
        const v = fr((b + off) / 2); // this foot is up in the first half of its two beats
        const lift = v < 0.5 ? Math.sin((Math.PI * v) / 0.5) : 0;
        leg(p, s, 0.04, 0.26 * lift * A, 0.1 * lift, 22 * lift, 14);
      }
      const sw = Math.sin(Math.PI * b); // + : left leg up → right arm forward
      arm(p, 'R', sw > 0 ? 25 : 160, -84 + 58 * Math.abs(sw), 0.8, 0, 0, 1);
      arm(p, 'L', sw < 0 ? 25 : 160, -84 + 58 * Math.abs(sw), 0.8, 0, 0, 1);
      p[1] += 0.02 * Math.abs(sw) - 0.04 * d;
      nudge(p, 'hips', 0, 6 * sw, -6 * sw);
      nudge(p, 'chest', -3, -10 * sw);
      nudge(p, 'head', -6 + 8 * lag);
      break;
    }
    case 'spin': {
      // A full turn over a bar, stepping round on each beat, arms flung out.
      const turn = TAU * (b / 4);
      nudge(p, 'hips', 0, turn / DEG, 0);
      const cs = Math.cos(turn),
        sn = Math.sin(turn);
      for (const [s, off] of /** @type {[string, number][]} */ ([
        ['L', 0],
        ['R', 0.5],
      ])) {
        const sg = s === 'L' ? 1 : -1;
        const v = fr(b + off);
        const lift = Math.max(0, Math.sin(TAU * v)) * 0.09;
        // The feet go round with him: a stance ±0.14 m about the hips, turned.
        const lx = sg * 0.14;
        const wx = lx * cs,
          wz = -lx * sn;
        const rest = sg * DEFAULT_RIG.pos.footL.x;
        leg(p, s, sg * (wx - rest), lift, wz, (10 * lift) / 0.09, 10);
      }
      arm(p, 'L', 88, 4 + 26 * d, 1, 0, 0, 0.3);
      arm(p, 'R', 88, 4 + 26 * d, 1, 0, 0, 0.3);
      p[1] += -0.05 * d;
      nudge(p, 'head', -8, 0, 8);
      break;
    }
    case 'jump': {
      // A leap every beat (every other beat when it's fast), landing on the beat.
      const n = period < 0.42 ? 2 : 1;
      const u = fr(b / n);
      const s = clamp01((u - 0.18) / 0.72);
      const air = u > 0.18 && u < 0.9 ? 4 * s * (1 - s) : 0;
      const crouch = Math.exp(-u * 9) + Math.exp(-(1 - u) * 26) * 0.7;
      p[1] += 0.22 * air * A - 0.12 * crouch;
      for (const side of ['L', 'R']) {
        const o = legOf(side);
        p[o + 1] = (0.22 * A + 0.1) * air;
        p[o + 3] = 18 * DEG * air;
        p[o] = 0.06;
        p[o + 4] = 18 * DEG;
      }
      arm(p, 'L', 50, -60 + 130 * air, 0.95, 0, 0, 1);
      arm(p, 'R', 50, -60 + 130 * air, 0.95, 0, 0, 1);
      nudge(p, 'spine', 16 * crouch - 4 * air);
      nudge(p, 'head', 10 * crouch - 14 * air);
      break;
    }
    case 'jumpingJack': {
      // Out on one beat (feet wide, arms up), in on the next, hopping between.
      const out = beat % 2 === 0;
      const m = smooth(clamp01((ph - 0.5) / 0.45));
      const k = out ? 1 - m : m; // 1: out
      const hopY = Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5)) * 0.12 * A;
      p[1] += hopY - 0.05 * d;
      leg(p, 'L', -0.04 + 0.24 * k * A, hopY + 0.05 * Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5)), 0, 0, 20);
      leg(p, 'R', -0.04 + 0.24 * k * A, hopY + 0.05 * Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5)), 0, 0, 20);
      arm(p, 'L', 88, -84 + 158 * k, 1, 0, 0, 0.2);
      arm(p, 'R', 88, -84 + 158 * k, 1, 0, 0, 0.2);
      nudge(p, 'head', -10 * k);
      break;
    }
    case 'clap': {
      // Hands meet high overhead on the beat (a low clap in front on the second, for some).
      const low = seed % 4 >= 2 && beat % 2 === 1;
      const open = 1 - accent(fr(b + 0.02));
      if (low) {
        arm(p, 'L', 2 + 50 * open, 6, 0.62, 30, 0, 0);
        arm(p, 'R', 2 + 50 * open, 6, 0.62, 30, 0, 0);
      } else {
        arm(p, 'L', -4 + 52 * open, 70 - 10 * open, 0.92, 20, 0, 0);
        arm(p, 'R', -4 + 52 * open, 70 - 10 * open, 0.92, 20, 0, 0);
      }
      nudge(p, 'chest', -6 * d);
      nudge(p, 'head', -18 + 6 * lag);
      p[1] += -0.07 * d * A;
      leg(p, 'L', 0.07, 0, 0, 0, 20);
      leg(p, 'R', 0.07, 0, 0, 0, 20);
      break;
    }
    case 'stomp': {
      // A knee comes up high off the beat and the foot slams down on it, the body dropping into it.
      const s = (beat + 1) % 2 === 0 ? 'R' : 'L'; // the foot that lands on the next beat
      const up = ph < 0.3 ? 0 : ph < 0.78 ? smooth((ph - 0.3) / 0.48) : 1 - ((ph - 0.78) / 0.22) ** 2;
      const other = s === 'R' ? 'L' : 'R';
      leg(p, s, 0.1, 0.3 * up * A, 0.08 * up, 25 * up, 22);
      leg(p, other, 0.1, 0, 0, 0, 18);
      p[1] += -0.1 * d * A + 0.03 * up;
      p[0] = (s === 'R' ? 0.035 : -0.035) * up;
      nudge(p, 'spine', 8 + 16 * d);
      nudge(p, 'chest', 10 * d);
      nudge(p, 'head', -8 + 22 * lag);
      arm(p, 'L', 40, -40 - 40 * d, 0.62, 20, 0, 1);
      arm(p, 'R', 40, -40 - 40 * d, 0.62, 20, 0, 1);
      nudge(p, 'hips', 0, 0, (s === 'R' ? 8 : -8) * up);
      break;
    }
    case 'praise': {
      // Praise the Sun, held (for a drop), breathing on the beat.
      arm(p, 'L', 78, 56 + 5 * d, 1, 0, -20, 0);
      arm(p, 'R', 78, 56 + 5 * d, 1, 0, -20, 0);
      joint(p, 'spine', -10);
      joint(p, 'chest', -9 - 3 * d);
      joint(p, 'neck', -6);
      joint(p, 'head', -22);
      root(p, 0, -0.01 - 0.02 * d, 0);
      leg(p, 'L', 0.13, 0, 0.02, 0, 16);
      leg(p, 'R', 0.13, 0, 0.02, 0, 16);
      joint(p, 'hips', 0);
      break;
    }
    case 'defaultDance': {
      defaultDance(p, b, A, d, lag, hipsY);
      break;
    }
  }
  if (mirror) mirrorPose(p);
  return p;
}

const ddA = newPose();
const ddB = newPose();
/**
 * Fortnite's Default Dance, eight beats. Beats 0–3, the arm swing: both forearms level
 * across the chest, swinging together to one side on the beat and the other on the next
 * (the elbows bent, one arm across the chest and the other out), bouncing on the knees,
 * the chest twisting against the arms and the head bobbing. Beats 4–7, the kicks: a hop on
 * one foot as the other heel kicks out in front, both arms thrown down and out, the other
 * leg on the next beat. Each half eases into the other over the last half beat before it.
 */
function defaultDance(p, b, A, d, lag, hipsY) {
  const base = p;
  const a = copy(ddA, base),
    k = copy(ddB, base);
  // The arm swing.
  {
    const c = Math.cos(Math.PI * b); // +1 on even beats: swung to his left
    const s = Math.sign(c) * Math.abs(c) ** 0.65;
    arm(a, 'L', 22 + 62 * s, -14 + 12 * d, 0.56, 70 - 20 * s, -10, 1);
    arm(a, 'R', 22 - 62 * s, -14 + 12 * d, 0.56, 70 + 20 * s, -10, 1);
    a[1] = hipsY - 0.11 * d * A - 0.02;
    a[0] = 0.035 * s * A;
    leg(a, 'L', 0.09, 0, 0.02, 0, 22);
    leg(a, 'R', 0.09, 0, 0.02, 0, 22);
    nudge(a, 'hips', 0, 10 * s, 4 * s);
    nudge(a, 'spine', 5 + 6 * d * A, 0, -3 * s);
    nudge(a, 'chest', 3 * d, -14 * s * A, -4 * s);
    nudge(a, 'head', -2 + 16 * lag * A, 6 * s, 0);
  }
  // The kicks: the right heel on beats 4 and 6, the left on 5 and 7. Each snaps out on its
  // beat, holds a moment and comes back as the other leg winds up for the next.
  {
    const kick = Math.floor(b) % 2 === 0 ? 'R' : 'L';
    const next = kick === 'R' ? 'L' : 'R';
    const ph = fr(b);
    const out = ph < 0.4 ? 1 : ph < 0.82 ? 1 - smooth((ph - 0.4) / 0.42) : 0;
    const pre = ph > 0.84 ? smooth((ph - 0.84) / 0.16) : 0;
    const hopY = 0.05 * A * Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5));
    k[1] = hipsY + hopY - 0.07 * d;
    // (Out on the diagonal and up, the heel leading: it reads from the front as well as aside.)
    const kickLeg = (s, e) => leg(k, s, 0.16 * e + 0.05, 0.2 * e * A + hopY, 0.3 * e * A, -32 * e, 14);
    kickLeg(kick, out);
    kickLeg(next, pre);
    const sgn = kick === 'R' ? 1 : -1;
    nudge(k, 'hips', 0, -8 * sgn * out, 4 * sgn * out);
    nudge(k, 'spine', -6 * out + 4, 0, 0);
    // Both arms thrown down and out with the kick, swinging back in front between.
    const fling = Math.max(out, pre);
    arm(k, 'L', 12 + 62 * fling, -74 + 36 * fling, 0.96, 0, 0, 1);
    arm(k, 'R', 12 + 62 * fling, -74 + 36 * fling, 0.96, 0, 0, 1);
    nudge(k, 'chest', -4 * fling, 6 * sgn * out, 0);
    nudge(k, 'head', -4 + 14 * lag * A, -6 * sgn * out, 0);
  }
  const u = fr(b / 8) * 8; // 0..8
  const m = u < 3.5 ? 0 : u < 4 ? smooth((u - 3.5) / 0.5) : u < 7.5 ? 1 : smooth((8 - u) / 0.5);
  lerpPose(p, a, k, m);
  // (From one half to the other his feet change stance with a hop, never a slide.)
  const hop = 0.045 * Math.sin(Math.PI * m);
  p[1] += hop * 0.6;
  p[POSE.legL + 1] += hop;
  p[POSE.legR + 1] += hop;
  return p;
}
