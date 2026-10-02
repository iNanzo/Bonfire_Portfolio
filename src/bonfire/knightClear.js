// Keeping the knights out of the scenery (knights.js): each solved pose's arms turned clear of
// the shapes near him (keepClear) and, at home, whatever of him would still go in eased back
// toward his resting pose there, as little as clears it, and let go of over a few steps
// (solveClear); with the checks they're made of (how near the points of a piece of a solved
// pose come to the scenery's shapes: colliders.js).
import * as THREE from 'three';
import { BONES, POSE, POSE_SIZE, newPose, lerpPose, GESTURE_TIME, RISE_TIME } from './knightPose.js';
import { distanceTo, outOf } from './colliders.js';
import { clamp01, smooth } from '../math.js';
import { ARM, BONE_INDEX, DEPTH } from './knightMesh.js';

// Keeping his arms out of the scenery (keepClear): a piece of an arm nearer a shape than
// CLEAR_MARGIN (m) turns the arm away from it (as far as takes it out to the margin, at most
// CLEAR_TURN), at most CLEAR_TRIES times an arm; only the shapes within CLEAR_NEAR (m) of
// where he stands are asked.
const CLEAR_MARGIN = 0.02;
const CLEAR_TURN = (10 * Math.PI) / 180;
const CLEAR_TRIES = 3;
export const CLEAR_NEAR = 1.4;
export const SIDES = ['L', 'R'];
// (Each side's arm pieces and shoulder socket, by bone index.)
const ARM_OF = { L: ARM.map((b) => BONE_INDEX[b + 'L']), R: ARM.map((b) => BONE_INDEX[b + 'R']) };
export const SHOULDER = { L: BONE_INDEX.upperArmL, R: BONE_INDEX.upperArmR };
// The ease is looked for from where it was the step before (it changes little from one step
// to the next): letting go of it as fast as it may, holding it, or further back (just
// touching something, halfway first), where the margins he's left with say the least that
// clears him lies, a little at a time where they can't say. At most EASE_SOLVES poses are
// solved a step, the first one asked for with them (round 9 solved one): a step costs a few
// of round 9's at most (test/knightClearance.test.mjs).
const EASE_SOLVES = 4;
// (What's clear is measured out to MARGIN (m) past what each piece may come to; easing back
// aims EASE_AIM clear, so the look lands clear.)
const MARGIN = CLEAR_MARGIN - DEPTH;
const EASE_AIM = 0.004;
// (Where nothing gets him clear, easing back has to get him at least this much (m) further out.)
const EASE_GAIN = 0.01;
// (Past what he was eased back from, he lets go of it this much of the way a step: over a
// quarter second, not at once. Where the margins can't say how much more he needs, a look
// goes at most this much further back than where he's still in: easeBack().)
const EASE_LET_GO = 0.25;
// (Which part each channel of a pose moves: 0 his body (how his hips, back, neck and head turn:
// a lean), 1 his left arm, 2 his right, 3 his legs (where his hips are and each foot goes: his
// footwork getting up and sitting down, over whatever he steps across).)
const PART_OF = Uint8Array.from({ length: POSE_SIZE }, (_, i) => (i < POSE.hips || i >= POSE.legL ? 3 : i >= POSE.armL && i < POSE.armL + 7 ? 1 : i >= POSE.armR && i < POSE.armR + 7 ? 2 : 0));
const PARTS = 4;
// (What's found in, as marginOf() has it: each part, then each pauldron's dome, left and right.)
const FLAGS = PARTS + 2;

// (The way out of a shape outOf() finds, reused: keepClear.)
const _rn = [0, 0, 0];
// (Where the knight being checked stands, and which way he's turned: place().)
let gx = 0, gy = 0, gz = 0, gc = 1, gs = 0;
/** Check knight k where he stands now (within(), nearestIn()). */
export function place(k) {
  ({ x: gx, y: gy, z: gz } = k.group.position);
  gc = Math.cos(k.yaw);
  gs = Math.sin(k.yaw);
}
// (Piece i of a solved pose in the world, where he stands: a point of it (its own space) at
// x, y, z goes to m[0]x + m[1]y + m[2]z + m[3], m[4]x + … + m[7], m[8]x + … + m[11]; reused.)
const _m = new Float64Array(12);
/** Piece i of a solved pose (`s`) into _m, where he stands (place()). */
function frameOf(s, i) {
  const { x, y, z, w } = s.q[i], o = s.p[i];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  // (The piece's turn, as three.js makes it from a quaternion, then his.)
  const r00 = 1 - (yy + zz), r01 = xy - wz, r02 = xz + wy;
  const r10 = xy + wz, r11 = 1 - (xx + zz), r12 = yz - wx;
  const r20 = xz - wy, r21 = yz + wx, r22 = 1 - (xx + yy);
  _m[0] = gc * r00 + gs * r20; _m[1] = gc * r01 + gs * r21; _m[2] = gc * r02 + gs * r22; _m[3] = gx + o.x * gc + o.z * gs;
  _m[4] = r10; _m[5] = r11; _m[6] = r12; _m[7] = gy + o.y;
  _m[8] = gc * r20 - gs * r00; _m[9] = gc * r21 - gs * r01; _m[10] = gc * r22 - gs * r02; _m[11] = gz - o.x * gs + o.z * gc;
}
export const _shapes = [];
/**
 * The shapes in `cs` that piece i of a solved pose (`s`; its points out to `r` from its joint)
 * may come nearer than `under` (m), where he stands (place()): reused. _m takes the piece's
 * place (frameOf). (A shape's distance changes no faster than its `lip` a metre: colliders.js.)
 */
export function within(s, i, r, under, cs) {
  frameOf(s, i);
  _shapes.length = 0;
  for (const col of cs) if (distanceTo(col, _m[3], _m[7], _m[11]) - col.lip * r < under) _shapes.push(col);
  return _shapes;
}
// (The nearest point nearestIn() found: how near, the shape, where (world), and which point.)
const found = { d: 0, col: null, x: 0, y: 0, z: 0, j: 0 };
/**
 * The nearest any of a piece's points (`pc`, placed by _m: within()) comes to `shapes`, if
 * that's nearer than `under` (m): into `found` (found.col null if none comes that near). A clump
 * of them whose ball can't come that near is passed over whole.
 */
export function nearestIn(pc, shapes, under) {
  found.d = under;
  found.col = null;
  const m = _m, P = pc.pts, C = pc.clumps;
  for (let q = 0; q < C.length; q += 6) {
    const ax = C[q], ay = C[q + 1], az = C[q + 2];
    const cx = m[0] * ax + m[1] * ay + m[2] * az + m[3], cy = m[4] * ax + m[5] * ay + m[6] * az + m[7], cz = m[8] * ax + m[9] * ay + m[10] * az + m[11];
    for (const col of shapes) {
      if (distanceTo(col, cx, cy, cz) - col.lip * C[q + 3] >= found.d) continue;
      for (let j = C[q + 4], end = C[q + 5]; j < end; j += 3) {
        const px = P[j], py = P[j + 1], pz = P[j + 2];
        const x = m[0] * px + m[1] * py + m[2] * pz + m[3], y = m[4] * px + m[5] * py + m[6] * pz + m[7], z = m[8] * px + m[9] * py + m[10] * pz + m[11];
        const d = distanceTo(col, x, y, z);
        if (d >= found.d) continue;
        found.d = d; found.col = col; found.x = x; found.y = y; found.z = z; found.j = j;
      }
    }
  }
  return found;
}
/**
 * How far piece i of a solved pose (`s`; its points `pc`) keeps from the shapes `cs` past
 * `depth` (m), as marginOf() has it: only nearer than `under` (m) past it matters (MARGIN
 * where it keeps further).
 */
function pieceMargin(s, i, pc, depth, under, cs) {
  const shapes = within(s, i, pc.r, under + depth, cs);
  if (!shapes.length || !nearestIn(pc, shapes, under + depth).col) return MARGIN;
  return found.d - depth;
}
/** Knight k is at home (his seat, or where he sits down on the ground), seated or up in front of it. */
const isHome = (k) => !!k.home && Math.hypot(k.group.position.x - k.home.x, k.group.position.z - k.home.z) < 0.05;
/**
 * How far up from his seat knight k is in the site's dance (0..1): seated at its ends,
 * standing for its middle, eased in and out as he gets up and sits down.
 */
export function danceUp(k) {
  const t = k.gestureT, T = GESTURE_TIME.dance;
  return smooth(clamp01(Math.min(t, T - t) / RISE_TIME));
}
const _rest = newPose();
/**
 * His resting pose at home now: seated, standing up in front of his seat, or on his way
 * between the two (getting up, sitting down, the site's dance up from his seat and back):
 * the one eased into the other as he goes, so what's eased back toward it moves on smoothly
 * with him.
 */
function restOf(k) {
  const a = k.act;
  let up = k.mode === 'sit' ? 0 : 1;
  if (a?.kind === 'rise' || a?.kind === 'lower') {
    const u = smooth(clamp01(a.t / a.dur));
    up = a.kind === 'rise' ? u : 1 - u;
  } else if (k.mode === 'sit' && k.gestureName === 'dance' && !k.danceInPlace) {
    up = danceUp(k);
  }
  return up <= 0 ? k.sit : up >= 1 ? k.stand : lerpPose(_rest, k.sit, k.stand, up);
}

/**
 * Keeping one knights module's knights out of the scenery, with its `solver` (knightPose.js
 * createSolver), the points they're checked at (knightMesh.js probesOf: `probes` each arm
 * piece's, `bodyProbes` his body's, `helmProbes` each helmet's) and `nearOf(k)`, the scenery's
 * shapes near where knight k stands. Returns solve(pose, ground, helmet), through which every
 * pose is solved (counted), and solveClear(k, moving): knight k's pose solved and kept clear.
 */
export function createClearance(solver, { probes, bodyProbes, helmProbes, nearOf }) {
  // (Every pose is solved through here, counted: k.solves is how many his last step took,
  // test/knightClearance.test.mjs holds it to EASE_SOLVES.)
  let solves = 0;
  const solve = (pose, ground = null, helmet = null) => { solves++; return solver.solve(pose, ground, helmet); };
  const _kn = new THREE.Vector3();
  const _kx = new THREE.Vector3();
  const _karm = new THREE.Vector3();
  const WAYS = [_kn, _kx]; // (keepClear's two ways to turn an arm: out of the shape, in to his middle)
  const near = { d: 0, hit: null, at: [0, 0, 0], arm: new THREE.Vector3() };
  /**
   * The piece of side `side`'s arm (as solved: `s`) nearest a shape in `cs`, if it's nearer
   * than CLEAR_MARGIN: into `near` ({ d, hit: the shape, at: the point (world), arm: from the
   * shoulder to it, his own space }); `near.hit` null if none.
   */
  function nearest(k, s, cs, side) {
    place(k);
    near.d = CLEAR_MARGIN;
    near.hit = null;
    let piece = -1, at = 0;
    for (const i of ARM_OF[side]) {
      const pc = probes.get(i);
      const shapes = within(s, i, pc.r, near.d, cs);
      if (!shapes.length || !nearestIn(pc, shapes, near.d).col) continue;
      near.d = found.d; near.hit = found.col;
      near.at[0] = found.x; near.at[1] = found.y; near.at[2] = found.z;
      piece = i; at = found.j;
    }
    if (near.hit) near.arm.fromArray(probes.get(piece).pts, at).applyQuaternion(s.q[piece]).add(s.p[piece]).sub(s.p[SHOULDER[side]]);
    return near;
  }
  // (How near each arm, [left, right], comes to the scenery as keepClear() left it, out to
  // CLEAR_MARGIN: marginOf() has it from there.)
  const armNear = [0, 0];
  /**
   * His arms as just solved (`s`), out of the scenery: an arm with a piece in (or within
   * CLEAR_MARGIN of) a shape near him turns about its shoulder, as far as takes that piece out
   * to the margin (at most CLEAR_TURN: an arm breathing at the edge of a pillar eases off it,
   * it doesn't jump), and is checked again, at most CLEAR_TRIES times. It turns toward the way
   * out of the shape there, or if that doesn't help (another part of the gauntlet goes in
   * deeper), inward, toward his middle; a turn that helps neither way is taken back. The same
   * pose always ends the same way.
   */
  function keepClear(k, s) {
    const cs = nearOf(k);
    armNear[0] = armNear[1] = CLEAR_MARGIN;
    if (!cs.length) return;
    const c = Math.cos(k.yaw), sn = Math.sin(k.yaw);
    const mid = s.p[BONE_INDEX.chest];
    let swung = false;
    for (let j = 0; j < 2; j++) {
      const side = SIDES[j];
      let n = nearest(k, s, cs, side);
      // (An arm that came near is looked at again once it's done: a turn taken back leaves `n` behind.)
      if (n.hit) armNear[j] = NaN;
      for (let tries = 0; tries < CLEAR_TRIES && n.hit; tries++) {
        const before = n.d;
        // Out of the shape there (in his own space), or in toward his middle at that height.
        outOf(n.hit, n.at[0], n.at[1], n.at[2], _rn);
        _kn.set(_rn[0] * c - _rn[2] * sn, _rn[1], _rn[0] * sn + _rn[2] * c);
        _kx.set(mid.x - n.arm.x - s.p[SHOULDER[side]].x, 0, 0);
        const arm = _karm.copy(n.arm);
        let helped = false;
        for (const way of WAYS) {
          const axis = way.cross(arm);
          const lever = axis.length();
          if (lever < 1e-5) continue;
          axis.divideScalar(-lever);
          const angle = Math.min(CLEAR_TURN, (CLEAR_MARGIN - before) / lever);
          solver.swingArm(side, axis, angle);
          n = nearest(k, s, cs, side);
          if (!n.hit || n.d >= before + 0.002) { helped = true; swung = true; break; }
          solver.swingArm(side, axis, -angle);
        }
        if (!helped) break;
      }
    }
    // (Its pauldron rode the turned arm: out of the helmet's way again, once, and both arms
    // looked at again.)
    if (swung) solver.clampPlates(k.helmet);
    for (let j = 0; j < 2; j++) if (swung || Number.isNaN(armNear[j])) armNear[j] = nearest(k, s, cs, SIDES[j]).d;
  }
  /**
   * How far knight k (as solved: `s`, his arms as keepClear() left them) keeps from the shapes
   * `cs` past what each piece of him may come to (DEPTH; DEPTH_RESTING for what rests on things),
   * out to MARGIN (m; below 0, that far in), and what of him is in (into `out`: FLAGS).
   */
  function marginOf(k, s, cs, out) {
    out.fill(false);
    place(k);
    let most = MARGIN;
    for (let j = 0; j < 2; j++) {
      const m = armNear[j] - DEPTH;
      if (m < 0) out[1 + j] = true;
      most = Math.min(most, m);
    }
    for (const b of bodyProbes) {
      const m = pieceMargin(s, b.i, b, b.depth, Math.max(most, 0), cs);
      if (m < 0) {
        out[b.part] = true;
        if (b.dome) out[PARTS + b.dome - 1] = true;
      }
      most = Math.min(most, m);
    }
    const helm = helmProbes[k.helmet];
    if (helm) {
      const m = pieceMargin(s, BONE_INDEX.head, helm, DEPTH, Math.max(most, 0), cs);
      if (m < 0) out[0] = true;
      most = Math.min(most, m);
    }
    return most;
  }
  const _eased = newPose();
  const _bad = new Array(FLAGS).fill(false);
  const _now = new Array(FLAGS).fill(false);
  // (The poses looked at this step, each as solved and kept clear: the ease may end on one
  // before the last, and the solver holds only the last.)
  const looked = Array.from({ length: EASE_SOLVES }, () => ({
    f: NaN, pose: newPose(), q: BONES.map(() => new THREE.Quaternion()), p: BONES.map(() => new THREE.Vector3()), knee: [0, 0], elbow: [0, 0],
  }));
  let nLooked = 0;
  let budget = 0; // (the solves count this step's may reach)
  /** Note _eased, eased by `f`, as just solved (`s`). */
  function note(f, s) {
    const o = looked[nLooked++];
    o.f = f;
    o.pose.set(_eased);
    for (let i = 0; i < o.q.length; i++) { o.q[i].copy(s.q[i]); o.p[i].copy(s.p[i]); }
    o.knee[0] = s.knee[0]; o.knee[1] = s.knee[1]; o.elbow[0] = s.elbow[0]; o.elbow[1] = s.elbow[1];
  }
  /** k.work with the parts in _bad eased toward `base` by `f` (into _eased), solved and kept clear (noted): how clear (marginOf; _now the parts in). */
  function easeTo(k, base, cs, f) {
    for (let i = 0; i < POSE_SIZE; i++) _eased[i] = _bad[PART_OF[i]] ? k.work[i] + (base[i] - k.work[i]) * f : k.work[i];
    const s = solve(_eased, null, k.helmet);
    keepClear(k, s);
    note(f, s);
    return marginOf(k, s, cs, _now);
  }
  /** The pose eased by `f` that was looked at this step (the last such) back in the solver (`s`), and k.work takes it. */
  function take(k, s, f) {
    let j = nLooked - 1;
    while (j > 0 && looked[j].f !== f) j--;
    const o = looked[j];
    if (j < nLooked - 1) {
      for (let i = 0; i < o.q.length; i++) { s.q[i].copy(o.q[i]); s.p[i].copy(o.p[i]); }
      s.knee[0] = o.knee[0]; s.knee[1] = o.knee[1]; s.elbow[0] = o.elbow[0]; s.elbow[1] = o.elbow[1];
    }
    k.work.set(o.pose);
  }
  /**
   * Knight k's pose (k.work) solved, his arms kept out of the scenery (keepClear) and, at home,
   * all of him: whatever would still go into a piece of it (his body, an arm, his legs) eases
   * back toward his resting pose there (restOf), as little as clears it (easeBack), so he
   * slides along what he meets instead of jumping back from it; past it, he lets go over a few
   * steps (letGo) instead of snapping on (k.work takes the pose he ends in). Never more than
   * EASE_SOLVES poses solved (k.solves: how many). `moving` false (sitting or standing at rest,
   * his idle at most): nothing to check, his seat keeps him clear of everything
   * (test/knightClearance.test.mjs).
   */
  function solveClear(k, moving) {
    const held = (k.ease ??= { f: 0, parts: new Array(PARTS).fill(false) });
    const from = solves;
    budget = from + EASE_SOLVES;
    nLooked = 0;
    const s = solve(k.work, null, k.helmet);
    let f = 0;
    if (moving) keepClear(k, s);
    const cs = moving && isHome(k) ? nearOf(k) : null;
    if (cs?.length) {
      const m0 = marginOf(k, s, cs, _bad);
      if (m0 < 0 || held.f > 0) {
        // (Still letting go of what he was eased back from: those parts too.)
        for (let j = 0; j < PARTS; j++) _bad[j] ||= held.f > 0 && held.parts[j];
        _eased.set(k.work);
        note(0, s);
        const base = restOf(k);
        f = m0 < 0 ? easeBack(k, base, cs, held.f, m0) : letGo(k, base, cs, held.f);
        take(k, s, f);
        for (let j = 0; j < PARTS; j++) held.parts[j] = _bad[j];
      }
    }
    held.f = f;
    k.solves = solves - from;
    return s;
  }
  /**
   * Letting go of an ease back (`was`, the step before's) where he's clear without it: as fast
   * as he may (EASE_LET_GO a step), else holding it (an arm eased part of the way back to its
   * rest can pass through what the arm going on its way misses: a hand swinging down past the
   * ruins' plinth), else half as far as he may, else all of it.
   */
  function letGo(k, base, cs, was) {
    const floor = was - EASE_LET_GO;
    if (floor <= 0) return 0;
    if (easeTo(k, base, cs, floor) >= 0) return floor;
    if (easeTo(k, base, cs, was) >= 0) return was;
    return easeTo(k, base, cs, floor / 2) >= 0 ? floor / 2 : 0;
  }
  /**
   * The least ease back toward `base` (0..1) of the parts in _bad that clears knight k of
   * `cs`, where he's in by `m0` (m) without it, from `was` (the step before's): that or as much
   * less as he may let go if that clears him; just touching something (nothing eased the step
   * before), halfway back first; else all the way back (and if even that doesn't, with
   * whatever easing brings in: an arm still in all the way back, the body leaning it there
   * eases with it; the body, his legs); then between there and where he's in, where the
   * margins say the least that clears him lies (where they can't say, a little further than
   * where he's in, as far as how fast he was coming out there says), as near as the looks
   * left this step get it.
   * Where even all the way back doesn't clear him (his rest is no way out: a boot by a drum it
   * stands by), as far back as that if it gets him out further (EASE_GAIN), else as he was (no
   * snapping back for nothing).
   */
  function easeBack(k, base, cs, was, m0) {
    let a = 0, ma = m0, b = 1, mb = NaN;
    // (The look before a, where he was in too: with a's, how fast he comes out there.)
    let a0 = NaN, ma0 = NaN;
    const inAt = (f, m) => { a0 = a; ma0 = ma; a = f; ma = m; };
    // (Where he'd stay, and how far in that leaves him.)
    let stay = 0, mStay = m0;
    if (was > 0) {
      const mw = easeTo(k, base, cs, was);
      if (mw >= 0) {
        b = was;
        mb = mw;
        const floor = was - EASE_LET_GO;
        if (floor > 0) {
          const mf = easeTo(k, base, cs, floor);
          if (mf >= 0) return floor;
          inAt(floor, mf);
        }
      } else {
        inAt(was, mw);
        stay = was;
        mStay = mw;
      }
    } else {
      // (Just touching something, a little ease is usually enough: all the way back first
      // would leave the looks left between all and nothing, the arm thrown back toward its
      // rest in one step.)
      const mh = easeTo(k, base, cs, 0.5);
      if (mh >= 0) { b = 0.5; mb = mh; } else inAt(0.5, mh);
    }
    if (Number.isNaN(mb)) {
      mb = easeTo(k, base, cs, 1);
      if (mb < 0 && solves < budget && more()) {
        a = 0;
        ma = m0;
        a0 = ma0 = NaN;
        mb = easeTo(k, base, cs, 1);
      }
      if (mb < 0) return mb > mStay + EASE_GAIN ? 1 : stay;
    }
    // (Between a, where he's in, and b, where he's clear, where the margins put the least
    // ease. The margin is the nearest piece's, and past some ease another piece may be the
    // nearest: where b is barely clear, the line to it says nothing. Then the two looks he
    // was still in at say how fast he was coming out (the same piece nearest), and the look
    // goes as far on as that says, at most halfway to b and EASE_LET_GO past a: the least
    // ease is mostly a little past a, and a look halfway to all the way back would leave an
    // arm thrown back toward its rest whenever a little more was enough.)
    while (solves < budget) {
      const r = (EASE_AIM - ma) / (mb - ma);
      let f;
      if (r <= 0.85) f = a + (b - a) * Math.max(r, 0.15);
      else {
        const on = ma > ma0 ? ((EASE_AIM - ma) / (ma - ma0)) * (a - a0) : Infinity;
        f = a + Math.min(Math.max(on, 0.1 * (b - a)), (b - a) / 2, EASE_LET_GO);
      }
      const m = easeTo(k, base, cs, f);
      if (m >= 0) { b = f; mb = m; } else inAt(f, m);
    }
    return b;
  }
  /**
   * Into the ease whatever is still in all the way back (_now): with an arm the body that
   * leans it there, with the body his legs, with a pauldron's dome its arm (raised, it lifts
   * the dome). Whether that's more than it had (_bad).
   */
  function more() {
    let added = false;
    for (let j = 0; j < PARTS; j++) {
      const want = _now[j] || (j === 0 && (_now[1] || _now[2])) || (j === 3 && _now[0]) || ((j === 1 || j === 2) && _now[PARTS + j - 1]);
      if (want && !_bad[j]) _bad[j] = added = true;
    }
    return added;
  }
  return { solve, solveClear };
}
