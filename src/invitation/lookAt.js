// Where NEWT looks in the invitation toy: the yaw and pitch toward a target, clamped to what he can
// turn (REACH: yaw ±100°, pitch −30°…+80°, the last quarter of each eased in rather than a dead
// stop: softAim), eased by a critically damped spring (no overshoot). A look at a point (the
// viewer, the camera) keeps to his neck's own LIMIT (yaw ±70°, pitch −20°…+55°); the pointer's look
// goes further, his chest joining in for the big ones as Final IK and the Codrops character do
// (chestShare: none for small looks, up to 30° of twist and 25° of lean at the reach, so his neck
// never turns more than LIMIT from his chest), the rest split 30/70 between Neck and Neck001
// (SPLIT). The pointer's look (screenAim) is camera-relative, film's "performative gaze": his face
// turns from the viewer toward the cursor, round the line to the camera, so on screen his gaze
// points right at the cursor whatever the view, zoom or screen; the further the cursor is from his
// head on screen (in heads), the further round (none within a third of a head: he looks at the
// viewer; most two heads out to a side, three and a half straight up or down), up to LOOK.turnUp,
// turnSide or turnDown from the line to the camera by the way the cursor lies. A cursor below his
// head has him look down toward it, his chin lower the further below (his face under his cap far
// below him: the user's "follow it fully"), one above up, one to a side round toward it; one he
// can't turn to (round behind him) a profile on its side, chin up or down with the cursor, and his
// head keeps to the side it's turned to until the target is clearly round the other side (no flip
// from shoulder to shoulder). With no pointer for 1.5 s he looks ahead and glances about every
// 3–7 s. Running away he looks where he runs, chin level (against the Run clip's own lift), with a
// quick, brief look back over his shoulder every 1.4–2.4 s, his chest twisting with it, toward the
// pursuer's side when there is one. "Ahead" is otherwise the viewer (viewerAim): up at the camera,
// faded back to straight ahead as he turns away from it. Looking at a floor spot without a ray, his
// head is lifted by LOOK.floorBias so his cap leaves his face showing. A slower ease (the brain's,
// as he's let go) brings the look and its weight round over about a second instead of a fifth.
// Pure: time comes in as t, randomness from rng.js; the state object is updated in place.

import { between } from './rng.js';
import { wrapAngle } from './steer.js';

/** @typedef {import('./types.js').Aim} Aim */
/** @typedef {import('./types.js').LookState} LookState */
/** @typedef {import('./types.js').XYZ} XYZ */

const DEG = Math.PI / 180;
/**
 * How far his neck turns his head from his chest, radians: a look at a point (the viewer, the
 * camera: aimAngles) keeps to it, chest and all (with the camera above him nothing needs a deeper
 * look down).
 */
export const LIMIT = { yaw: 70 * DEG, pitchMin: -20 * DEG, pitchMax: 55 * DEG };
/**
 * The chest's share of a big look, radians (chestShare): as the look's yaw goes from yawFrom to
 * REACH's it twists up to `yaw`, as its pitch goes from upFrom to REACH's top it leans back up to
 * `up`, and from downFrom to REACH's bottom forward up to `down` (smoothsteps: nothing for the
 * looks he gives the viewer, no corner where it joins in).
 */
export const CHEST = {
  yaw: 30 * DEG,
  yawFrom: 30 * DEG,
  up: 25 * DEG,
  upFrom: 40 * DEG,
  down: 10 * DEG,
  downFrom: -10 * DEG,
};
/**
 * How far the whole look turns his head from the way his body faces, radians: his neck's LIMIT
 * with the chest's share on top (lookStep keeps every look inside it).
 */
export const REACH = {
  yaw: LIMIT.yaw + CHEST.yaw,
  pitchMin: LIMIT.pitchMin - CHEST.down,
  pitchMax: LIMIT.pitchMax + CHEST.up,
};
/** The share of what the chest leaves that each neck bone takes. */
export const SPLIT = { neck: 0.3, head: 0.7 };
/**
 * omega: the spring's speed (rad/s; ~99% there in 6.6/omega s). idleAfter: seconds without a
 * pointer before he looks ahead. Idle glances: every glanceMin–glanceMax s, held
 * glanceHoldMin–glanceHoldMax s, up to glanceYaw of his neck's yaw limit. weightRate: the look's
 * weight eases at this much per second. The viewer: looked at fully while the camera is within
 * viewerFull of the way he faces, not at all past viewerNone (radians). floorBias: the pitch
 * added to a look at a floor spot (radians). soft: the share of each of REACH's limits taken as
 * asked, the rest eased into (softAim). torsoRate: how fast the chest's share comes and goes
 * (per second) as he leaves the floor and lands (torsoStep).
 *
 * The pointer (screenAim): headSize, his head's height (world units: Neck001's sphere, 1.65
 * model units across the radius at clips.js SCALE 0.16), the unit the cursor's distance from his
 * head on screen is counted in; within deadZone heads he looks at the viewer, and his face turns
 * from the viewer toward the cursor over the next `ramp` heads to a side, rampUpDown straight up
 * or down (blended by the way it lies; eased out), as far as turnUp, turnSide or turnDown from the
 * line to the camera for a cursor above, beside or below his head (radians, blended the same
 * way); any way round, his gaze no higher than upTop (well under the vertical), and his chin no
 * lower under the camera's line than straight below at that distance, while his gaze, turned as
 * far round as he can, is within gazeFull of the camera, fading out by gazeNone (radians: in
 * profile the pitch reads on screen as it is, and behind him there's no face to keep in sight).
 *
 * Running away (mode 'back'): runPitch, his chin there while he looks where he runs (the Run
 * clip lifts his head about 18° itself); a glance back every backEveryMin–backEveryMax s (the
 * first backFirstMin–backFirstMax s in), held backHold s, at backYaw of REACH's yaw toward the
 * pursuer's side (his chest twisting with it: over his shoulder; or straight at it, nearer than
 * that), its pitch toward the pursuer kept within backPitchMin–backPitchMax (radians); the look
 * turns at backOmega, quicker than omega, so a glance is a quick look back.
 * backSide: a target further round behind him than this (radians) keeps his head on the side
 * it's turned to; a pursuer that far round is glanced at over the shoulder nearer the camera
 * (play.js lookAim), so the viewer sees his face look back.
 */
export const LOOK = {
  omega: 10,
  idleAfter: 1.5,
  glanceMin: 3,
  glanceMax: 7,
  glanceHoldMin: 0.6,
  glanceHoldMax: 1.2,
  glanceYaw: 0.85,
  weightRate: 5,
  viewerFull: 100 * DEG,
  viewerNone: 150 * DEG,
  floorBias: 10 * DEG,
  soft: 0.75,
  torsoRate: 4,
  headSize: 0.53,
  deadZone: 0.3,
  ramp: 2,
  rampUpDown: 3.5,
  turnUp: 40 * DEG,
  turnSide: 65 * DEG,
  turnDown: 42 * DEG,
  upTop: 76 * DEG,
  gazeFull: 35 * DEG,
  gazeNone: 75 * DEG,
  runPitch: -12 * DEG,
  backFirstMin: 0.5,
  backFirstMax: 0.9,
  backEveryMin: 1.4,
  backEveryMax: 2.4,
  backHold: 0.35,
  backOmega: 14,
  backYaw: 0.8,
  backPitchMin: -10 * DEG,
  backPitchMax: 5 * DEG,
  backSide: 150 * DEG,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const AHEAD = Object.freeze({ yaw: 0, pitch: 0 });

/** @returns {LookState} */
export function createLook() {
  return {
    yaw: 0,
    pitch: 0,
    vyaw: 0,
    vpitch: 0,
    weight: 1,
    target: { yaw: 0, pitch: 0 },
    mode: null,
    lastAim: null,
    lastAimT: 0,
    glance: null,
    glanceUntil: 0,
    nextGlance: null,
    glances: 0,
  };
}

/**
 * An aim kept inside his neck's LIMIT (a look at a point).
 * @param {Aim} a
 * @returns {Aim}
 */
export function clampAim(a) {
  return { yaw: clamp(a.yaw, -LIMIT.yaw, LIMIT.yaw), pitch: clamp(a.pitch, LIMIT.pitchMin, LIMIT.pitchMax) };
}

/**
 * `v` as asked inside LOOK.soft of a limit, past it eased toward the limit (tanh: the same slope
 * where it starts, never reaching past it), so a look sweeping out to his neck's reach slows
 * into it instead of stopping dead.
 * @param {number} v
 * @param {number} lo  negative
 * @param {number} hi  positive
 */
function soften(v, lo, hi) {
  const k = LOOK.soft;
  if (v > hi * k) return hi * k + hi * (1 - k) * Math.tanh((v - hi * k) / (hi * (1 - k)));
  if (v < lo * k) return lo * k + lo * (1 - k) * Math.tanh((v - lo * k) / (lo * (1 - k)));
  return v;
}

/**
 * An aim kept inside REACH, softly: as asked within LOOK.soft of each limit, eased toward it past
 * that (lookStep's target).
 * @param {Aim} a
 * @returns {Aim}
 */
export function softAim(a) {
  return { yaw: soften(a.yaw, -REACH.yaw, REACH.yaw), pitch: soften(a.pitch, REACH.pitchMin, REACH.pitchMax) };
}

/** 0 below `lo`, 1 above `hi`, a smoothstep between (no corner at either end). */
function smooth(x, lo, hi) {
  const k = clamp((x - lo) / (hi - lo), 0, 1);
  return k * k * (3 - 2 * k);
}

/**
 * The chest's share of the look (yaw, pitch inside REACH), radians, as a turn of its own in his
 * root's frame: none for the looks he gives the viewer, twisting and leaning in smoothly for big
 * ones (CHEST), so his neck turns no more than LIMIT from his chest at the reach.
 * @param {number} yaw
 * @param {number} pitch
 * @returns {Aim}
 */
export function chestShare(yaw, pitch) {
  return {
    yaw: Math.sign(yaw) * CHEST.yaw * smooth(Math.abs(yaw), CHEST.yawFrom, REACH.yaw),
    pitch:
      pitch >= 0
        ? CHEST.up * smooth(pitch, CHEST.upFrom, REACH.pitchMax)
        : -CHEST.down * smooth(-pitch, -CHEST.downFrom, -REACH.pitchMin),
  };
}

/**
 * The chest's share eased in and out (0 to 1, LOOK.torsoRate a second): on while he's on his
 * feet, off while he's held or falling (his collar hangs from the cursor, and a chest turned
 * under it would move it).
 * @param {number} k  last frame's
 * @param {boolean} on
 * @param {number} dt
 */
export function torsoStep(k, on, dt) {
  const step = LOOK.torsoRate * dt;
  return on ? Math.min(1, k + step) : Math.max(0, k - step);
}

/**
 * The look toward `target` from his head, relative to the way his body faces, as it is (not
 * clamped: lookStep clamps it, keeping a target behind him on the side his head is turned to).
 * @param {XYZ} headPos
 * @param {number} bodyYaw  root.rotation.y (0 faces +z)
 * @param {XYZ} target
 * @param {number} [pitchBias]  added to the pitch (LOOK.floorBias for a floor spot)
 * @returns {Aim}
 */
export function aimAt(headPos, bodyYaw, target, pitchBias = 0) {
  const dx = target.x - headPos.x;
  const dy = target.y - headPos.y;
  const dz = target.z - headPos.z;
  return { yaw: wrapAngle(Math.atan2(dx, dz) - bodyYaw), pitch: Math.atan2(dy, Math.hypot(dx, dz)) + pitchBias };
}

/**
 * The look toward `target` from his head, relative to the way his body faces, clamped.
 * @param {XYZ} headPos
 * @param {number} bodyYaw  root.rotation.y (0 faces +z)
 * @param {XYZ} target
 * @param {number} [pitchBias]  added to the pitch before the clamp (LOOK.floorBias for the floor)
 * @returns {Aim}
 */
export function aimAngles(headPos, bodyYaw, target, pitchBias = 0) {
  return clampAim(aimAt(headPos, bodyYaw, target, pitchBias));
}

/**
 * The pointer's look: camera-relative ("performative gaze"). Seen from the camera, the cursor's
 * ray lies some way from his head (in heads: LOOK.headSize at his distance) in some direction φ
 * on screen; his face turns from the line to the camera by α toward φ, round that line, so on
 * screen his gaze points right at the cursor (a line through his head toward the camera and
 * turned toward φ shows along φ, at any view or zoom), and turned more the further the cursor
 * is: none within LOOK.deadZone heads (at the viewer), then eased out to LOOK.turnUp, turnSide
 * or turnDown (by φ) over LOOK.ramp heads to a side, rampUpDown straight up or down; any way
 * round no higher than LOOK.upTop (so his gaze never nears the vertical, where its yaw swings
 * round, nor tips over the top into a look backwards), straight down no lower than REACH's
 * bottom. Any way round
 * his chin goes no lower under the camera's line than it would for a cursor straight below at
 * the same distance, while his face is toward the camera (in profile the pitch reads as it is).
 * Round behind him past his reach he turns as far as he can on that side, his chin up or down
 * with the cursor: a profile. Not clamped (lookStep keeps a target behind him on the side his
 * head is turned to). Null when the ray points away from him or the camera is right over his
 * head.
 * @param {{o: XYZ, d: XYZ}} ray  the cursor's ray, from the camera
 * @param {XYZ} head  between his eyes
 * @param {number} bodyYaw
 * @param {XYZ} camera
 * @returns {Aim|null}
 */
export function screenAim({ d }, head, bodyYaw, camera) {
  // w: from the camera to his head; right and up: the screen's directions there.
  const wx0 = head.x - camera.x;
  const wy0 = head.y - camera.y;
  const wz0 = head.z - camera.z;
  const dist = Math.hypot(wx0, wy0, wz0);
  const flat = Math.hypot(wx0, wz0);
  const len = Math.hypot(d.x, d.y, d.z);
  if (!(dist > 1e-9) || !(flat > 1e-6 * dist) || !(len > 0)) return null;
  const w = { x: wx0 / dist, y: wy0 / dist, z: wz0 / dist };
  const right = { x: -w.z / (flat / dist), y: 0, z: w.x / (flat / dist) };
  const up = { x: -right.z * w.y, y: right.z * w.x - right.x * w.z, z: right.x * w.y };
  const along = (d.x * w.x + d.y * w.y + d.z * w.z) / len;
  if (!(along > 1e-6)) return null;
  // Where the cursor lies from his head as seen from the camera (tangents), and in heads.
  const sx = (d.x * right.x + d.z * right.z) / len / along;
  const sy = (d.x * up.x + d.y * up.y + d.z * up.z) / len / along;
  const heads = (Math.hypot(sx, sy) * dist) / LOOK.headSize;
  const phi = Math.atan2(sy, sx);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const s2 = sp * sp;
  /** How far round at this distance over a ramp of `r` heads (0 to 1, eased out). */
  const turn = (r) => {
    const k = clamp((heads - LOOK.deadZone) / r, 0, 1);
    return 1 - (1 - k) * (1 - k);
  };
  // (Straight down no lower than his reach: the camera's pitch from his head is asin(−w.y).)
  const camPitch = Math.asin(-w.y);
  const downMost = clamp(camPitch - REACH.pitchMin, 0, LOOK.turnDown);
  const most = LOOK.turnSide + ((sy > 0 ? LOOK.turnUp : downMost) - LOOK.turnSide) * s2;
  let a = turn(LOOK.ramp + (LOOK.rampUpDown - LOOK.ramp) * s2) * most;
  const gaze = (/** @type {number} */ t) => ({
    x: -w.x * Math.cos(t) + (right.x * cp + up.x * sp) * Math.sin(t),
    y: -w.y * Math.cos(t) + up.y * sp * Math.sin(t),
    z: -w.z * Math.cos(t) + (right.z * cp + up.z * sp) * Math.sin(t),
  });
  // (His gaze's height as he turns is −w.y·cos α + up.y·sin φ·sin α = R·cos(α − δ): rising to
  // its top at δ, then only ever falling. No higher than upTop: the α where it first reaches
  // that is as far as he turns, still along φ, so near straight up his gaze never nears the
  // vertical, where its yaw would swing round with the least move of the cursor.)
  const R = Math.hypot(-w.y, up.y * sp);
  const delta = Math.atan2(up.y * sp, -w.y);
  const top = Math.sin(LOOK.upTop);
  const highest = top < R ? delta - Math.acos(top / R) : -1;
  if (highest >= 0) a = Math.min(a, highest);
  // (Any way round, no lower under the camera's line than straight below at this distance: the
  // α past its top where it falls to that. Only while his face is toward the camera: by how far
  // his gaze, turned as far round as he can, is from it, full within gazeFull, none past
  // gazeNone.)
  const g0 = gaze(a);
  const yaw0 = clamp(wrapAngle(Math.atan2(g0.x, g0.z) - bodyYaw), -REACH.yaw, REACH.yaw);
  const gazeOff = Math.abs(wrapAngle(Math.atan2(-w.x, -w.z) - bodyYaw - yaw0));
  const facing = clamp((LOOK.gazeNone - gazeOff) / (LOOK.gazeNone - LOOK.gazeFull), 0, 1);
  const floor = Math.sin(camPitch - turn(LOOK.rampUpDown) * downMost);
  if (facing > 0 && floor > -R) {
    const lowest = delta + Math.acos(Math.min(1, floor / R));
    a = Math.min(a, lowest) * facing + a * (1 - facing);
  }
  const g = gaze(a);
  return aimAt(head, bodyYaw, { x: head.x + g.x, y: head.y + g.y, z: head.z + g.z });
}

/**
 * "Ahead": toward the viewer. The look at the camera (clamped), all of it while the camera is
 * within LOOK.viewerFull of the way he faces, fading to straight ahead by LOOK.viewerNone (he
 * doesn't crick his neck or look at the sky walking away).
 * @param {XYZ} headPos
 * @param {number} bodyYaw
 * @param {XYZ} camera
 * @returns {Aim}
 */
export function viewerAim(headPos, bodyYaw, camera) {
  const dx = camera.x - headPos.x;
  const dz = camera.z - headPos.z;
  const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - bodyYaw));
  const k = clamp((LOOK.viewerNone - off) / (LOOK.viewerNone - LOOK.viewerFull), 0, 1);
  if (k <= 0) return { yaw: 0, pitch: 0 };
  const a = aimAngles(headPos, bodyYaw, camera);
  return { yaw: a.yaw * k, pitch: a.pitch * k };
}

/**
 * The look split between his chest (chestShare) and the two neck bones (SPLIT of what the chest
 * leaves), as angles that add up to it (character.js applyLook composes the same turns exactly).
 * @param {number} yaw
 * @param {number} pitch
 */
export function splitLook(yaw, pitch) {
  const chest = chestShare(yaw, pitch);
  const y = yaw - chest.yaw;
  const p = pitch - chest.pitch;
  return {
    chest,
    neck: { yaw: y * SPLIT.neck, pitch: p * SPLIT.neck },
    head: { yaw: y * SPLIT.head, pitch: p * SPLIT.head },
  };
}

/**
 * One frame of looking, kept inside REACH (eased into its last quarter: softAim).
 * - 'camera': at `aim` (the page aims at the camera), `ahead` when it's null.
 * - 'pointer': at `aim` (screenAim, or the camera when the pointer is on him); when it goes, the
 *   last aim for LOOK.idleAfter, then `ahead` with idle glances.
 * - 'forward': `ahead` with idle glances around it.
 * - 'back': `ahead` (where he runs, chin level: play.js lookAim), with a glance back over a
 *   shoulder every LOOK.backEveryMin–backEveryMax s, toward `aim` (the pursuer) when there is
 *   one; the look turns at LOOK.backOmega's quicker pace.
 * @param {LookState} s
 * @param {'pointer'|'camera'|'forward'|'back'} mode  BrainOut.look.mode
 * @param {Aim|null} aim
 * @param {number} dt
 * @param {number} t
 * @param {() => number} rng
 * @param {number} [weight]  BrainOut.look.weight; s.weight eases toward it
 * @param {Aim} [ahead]  where "ahead" is (viewerAim; straight ahead by default)
 * @param {number} [ease]  BrainOut.look.ease: a slower look, seconds for it (and its weight) to
 *   come about 95% of the way round; LOOK.omega's and LOOK.weightRate's pace without it
 * @returns {LookState}
 */
export function lookStep(s, mode, aim, dt, t, rng, weight = 1, ahead = AHEAD, ease = 0) {
  if (mode !== s.mode) {
    s.mode = mode;
    s.glance = null;
    s.nextGlance = null;
  }
  let target;
  if (mode === 'camera') target = aim ?? ahead;
  else if (mode === 'pointer' && aim) {
    s.lastAim = { yaw: aim.yaw, pitch: aim.pitch };
    s.lastAimT = t;
    s.glance = null;
    s.nextGlance = null;
    target = aim;
  } else if (mode === 'pointer' && s.lastAim && t - s.lastAimT < LOOK.idleAfter) target = s.lastAim;
  else if (mode === 'back') target = backGlance(s, t, rng, ahead, aim);
  else target = idleGlance(s, t, rng, ahead);
  s.target = softAim(sided(target, s.yaw));
  // (A critically damped spring is 95% of the way at omega × t = 4.74.)
  const pace = mode === 'back' ? LOOK.backOmega : LOOK.omega;
  const omega = ease > 0 ? Math.min(pace, 4.74 / ease) : pace;
  [s.yaw, s.vyaw] = spring(s.yaw, s.vyaw, s.target.yaw, dt, omega);
  [s.pitch, s.vpitch] = spring(s.pitch, s.vpitch, s.target.pitch, dt, omega);
  s.yaw = clamp(s.yaw, -REACH.yaw, REACH.yaw);
  s.pitch = clamp(s.pitch, REACH.pitchMin, REACH.pitchMax);
  const step = (ease > 0 ? Math.min(LOOK.weightRate, 1 / ease) : LOOK.weightRate) * dt;
  s.weight = s.weight < weight ? Math.min(weight, s.weight + step) : Math.max(weight, s.weight - step);
  return s;
}

/**
 * A target round behind him past his reach (further than LOOK.backSide) on the other side from
 * where his head is turned (`yaw`) is taken on this side: his head stays put rather than flip
 * over to the other shoulder, until the target is clearly round that side.
 * @param {Aim} a
 * @param {number} yaw
 * @returns {Aim}
 */
function sided(a, yaw) {
  if (Math.abs(a.yaw) <= LOOK.backSide || Math.abs(yaw) < 0.1 || Math.sign(a.yaw) === Math.sign(yaw)) return a;
  return { yaw: -a.yaw, pitch: a.pitch };
}

/**
 * The exact critically damped step toward a still target: from rest it never overshoots.
 * @returns {[number, number]}
 */
function spring(x, v, target, dt, w = LOOK.omega) {
  const e = x - target;
  const k = Math.exp(-w * dt);
  const j = (v + w * e) * dt;
  return [target + (e + j) * k, (v - w * j) * k];
}

/**
 * `ahead`, with a glance to one side every glanceMin–glanceMax s (s.glance: the glance's turn
 * away from `ahead`, toward the side with room for it).
 */
function idleGlance(s, t, rng, ahead) {
  if (s.nextGlance == null) s.nextGlance = t + between(rng, LOOK.glanceMin, LOOK.glanceMax);
  if (s.glance && t >= s.glanceUntil) s.glance = null;
  if (!s.glance && t >= s.nextGlance) {
    let side = rng() < 0.5 ? -1 : 1;
    const yaw = between(rng, 0.3, LOOK.glanceYaw) * LIMIT.yaw;
    if (Math.abs(ahead.yaw + side * yaw) > LIMIT.yaw) side = -side;
    s.glance = { yaw: side * yaw, pitch: between(rng, -0.15, 0.25) };
    s.glanceUntil = t + between(rng, LOOK.glanceHoldMin, LOOK.glanceHoldMax);
    s.nextGlance = t + between(rng, LOOK.glanceMin, LOOK.glanceMax);
    s.glances++;
  }
  return s.glance ? { yaw: ahead.yaw + s.glance.yaw, pitch: ahead.pitch + s.glance.pitch } : ahead;
}

/**
 * Where he runs (`ahead`), with a look back over one shoulder every backEveryMin–backEveryMax s
 * (the first backFirstMin–backFirstMax s in), held backHold s: toward the pursuer's side (`at`,
 * its aim from his head) at LOOK.backYaw of REACH's yaw, or right at it when it's nearer round
 * than that, his chin toward it within backPitchMin–backPitchMax; either side, level, with no
 * pursuer. Never toward the viewer for its own sake: the camera only settles the side for a
 * pursuer straight behind him (play.js lookAim hands it round the camera's side then, its yaw
 * past half a turn).
 * @param {LookState} s
 * @param {number} t
 * @param {() => number} rng
 * @param {Aim} ahead
 * @param {Aim|null} at
 * @returns {Aim}
 */
function backGlance(s, t, rng, ahead, at) {
  if (s.nextGlance == null) s.nextGlance = t + between(rng, LOOK.backFirstMin, LOOK.backFirstMax);
  if (s.glance && t >= s.glanceUntil) s.glance = null;
  if (!s.glance && t >= s.nextGlance) {
    const reach = LOOK.backYaw * REACH.yaw;
    const side = at && Math.abs(at.yaw) > 1e-3 ? Math.sign(at.yaw) : rng() < 0.5 ? -1 : 1;
    s.glance = {
      yaw: side * (at ? Math.min(Math.abs(at.yaw), reach) : reach),
      pitch: at ? clamp(at.pitch, LOOK.backPitchMin, LOOK.backPitchMax) : 0,
    };
    s.glanceUntil = t + LOOK.backHold;
    s.nextGlance = t + between(rng, LOOK.backEveryMin, LOOK.backEveryMax);
    s.glances++;
  }
  return s.glance ? { yaw: s.glance.yaw, pitch: s.glance.pitch } : { yaw: ahead.yaw, pitch: ahead.pitch };
}
