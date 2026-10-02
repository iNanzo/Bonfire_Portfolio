// The living blade (the visualizer): a weapon that pulls itself out of the fire and
// fights on its own, as if enchanted, with no one holding it. A routine is planned on the
// beat grid: every hit is a move (a slash, a thrust or a spin) landing exactly on its
// beat, with glides, hovers and flourishes between them, then a plunge back into the fire.
//
// The motion is built to be physically sound:
//   • Rest to rest: every segment starts and ends still, so they join without a jolt
//     (glides ease with a C2 "smootherstep").
//   • Wind-up, strike, follow-through: a move cocks back, accelerates into the hit
//     (fastest exactly on the beat) and carries through. The follow-through leaves the
//     hit at the strike's speed and slows to a stop, overshooting a touch when it's fast.
//   • A slash leads with its edge (the flat faces the swing plane's normal), swinging
//     from a pivot anywhere from the grip (wielded) to mid-blade (flung), the pivot
//     itself lunging through the hit. A spin is a slash of a full turn or more from the
//     middle. A thrust drives along the blade's own axis, stops dead and quivers.
//   • Nothing passes through the ground, the camera or the knights: a move's random shape
//     is drawn again until its sampled path clears them all (the knights are capsules
//     that `basis()` hands over as `avoid`, where they are as the move begins).
// Shapes are random (the plane's angle and tilt, the side, the sweep, the pivot, a lunge,
// a corkscrew), so no two routines look alike. A move takes its plane from the camera as
// its glide begins (onMove fires first, so a cut can land before it), so it reads from
// wherever the camera is.
//
// Local frame: the blade runs along Y with the point at the low end, the width along X
// and the thickness along Z (Z is the flat's normal). Poses are { c, q }: the world
// position of the blade's middle and its world rotation.
import * as THREE from 'three';
import { clamp, clamp01, smoother, TAU } from '../math.js';

export const MOVES = { slash: 'Slash', thrust: 'Thrust', spin: 'Spin' };

const DEG = Math.PI / 180;
/** 0 at both ends (value and slope), 1 in the middle. */
const bump = (u) => 16 * u * u * (1 - u) * (1 - u);
/** A follow-through: leaves at slope m, stops at 1 (overshooting a touch when m > 3). */
const follow = (v, m) => v * (m + v * (3 - 2 * m + v * (m - 2)));
/** The least time a glide gets between moves (it turns the blade, so it needs room). */
const minGlide = (gap) => Math.max(0.08, 0.22 * gap);
const GLIDE_TURN = 22;   // rad/s: the fastest a glide should turn the blade (it takes longer when it can)

const LOCAL_X = new THREE.Vector3(1, 0, 0);
const LOCAL_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const _m = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
/** World rotation pointing the blade along d (grip → tip) with its flat facing n. */
function orient(d, n, out) {
  _by.copy(d).negate();
  _bz.copy(n).addScaledVector(d, -n.dot(d));
  if (_bz.lengthSq() < 1e-8) _bz.set(0, 0, 1).addScaledVector(d, -d.z);
  if (_bz.lengthSq() < 1e-8) _bz.set(1, 0, 0).addScaledVector(d, -d.x);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  return out.setFromRotationMatrix(_m.makeBasis(_bx, _by, _bz));
}

const newPose = () => ({ c: new THREE.Vector3(), q: new THREE.Quaternion() });
const copyPose = (from, to) => { to.c.copy(from.c); to.q.copy(from.q); return to; };

/**
 * Plan a routine.
 * @param {object} o
 * @param {{ grip: THREE.Vector3, tip: THREE.Vector3, len: number }} o.blade  local points
 * @param {{ pos: THREE.Vector3, quat: THREE.Quaternion }} o.home  the planted weapon (world)
 * @param {THREE.Vector3} o.center  where it fights: over the fire (world)
 * @param {() => { right, up, toCam, pos, avoid? }} o.basis  the camera's axes and position
 *   (world), and optionally capsules to stay out of: [{ a, b, r }] (the knights)
 * @param {number[]} o.hits   seconds from now, rising
 * @param {number} o.plunge   seconds from now, after the last hit
 * @param {{ slash?: boolean, thrust?: boolean, spin?: boolean }} [o.moves]
 * @param {boolean} [o.alive]  flourishes: twirls, flips, trembling
 * @param {(k: number, kind: string) => void} [o.onMove]  move k is about to take its plane
 * @param {() => number} [o.rng]
 * @param {number} [o.ground]  the lowest the tip may go (world y)
 */
export function createRoutine({
  blade, home, center, basis, hits, plunge, moves = { slash: true, thrust: true, spin: true }, alive = true, onMove, rng = Math.random, ground = 0.22,
}) {
  const grip = blade.grip.clone();
  const tip = blade.tip.clone();
  const mid = grip.clone().lerp(tip, 0.5);
  const len = blade.len;
  const fire = new THREE.Vector3(center.x, 0, center.z);

  // Scratch.
  const tq = new THREE.Quaternion();
  const tv = new THREE.Vector3();
  const tw = new THREE.Vector3();
  const td = new THREE.Vector3();
  const seg = new THREE.Vector3();
  const tq2 = new THREE.Vector3();
  const sample = newPose();

  const worldPoint = (p, local, out) => out.copy(local).sub(mid).applyQuaternion(p.q).add(p.c);
  /** The pose with `local` (a point on the blade) at world `at`, rotated by q. */
  function fromPivot(at, q, local, out) {
    out.q.copy(q);
    out.c.copy(mid).sub(local).applyQuaternion(q).add(at);
    return out;
  }

  // --- home and the plunge ------------------------------------------------------------
  const homePose = newPose();
  homePose.q.copy(home.quat);
  homePose.c.copy(mid).applyQuaternion(home.quat).add(home.pos);
  const homeDir = tip.clone().sub(grip).normalize().applyQuaternion(home.quat); // grip → tip, planted: pointing down
  const homeTip = worldPoint(homePose, tip, new THREE.Vector3());
  const lift = (tipY) => Math.max(0.2, (tipY - homeTip.y) / Math.max(0.3, -homeDir.y));
  /** The planted pose drawn up along its own axis until the tip is at `tipY`. */
  const drawnUp = (tipY) => { const p = copyPose(homePose, newPose()); p.c.addScaledVector(homeDir, -lift(tipY)); return p; };

  // --- the moves ----------------------------------------------------------------------
  const list = [];
  // A spin winds up through the beat before it, so it needs a rest (or a slow beat) ahead of it.
  const pickKind = (gapPrev, gapNext) => {
    const recent = list.slice(-2).map((m) => m.kind);
    const pool = Object.keys(MOVES).filter((k) => moves[k] && !(k === 'spin' && (gapPrev < 0.6 || gapNext < 0.35)));
    const fresh = recent.length === 2 && recent[0] === recent[1] ? pool.filter((k) => k !== recent[0]) : pool;
    const from = fresh.length ? fresh : pool.length ? pool : ['slash'];
    const weight = { slash: 3, thrust: 2, spin: 1 };
    let r = rng() * from.reduce((s, k) => s + weight[k], 0);
    for (const k of from) { r -= weight[k]; if (r < 0) return k; }
    return from.at(-1);
  };
  hits.forEach((hit, k) => {
    const gapPrev = k ? hit - hits[k - 1] : hit;
    const gapNext = (k < hits.length - 1 ? hits[k + 1] : plunge) - hit;
    const kind = pickKind(gapPrev, gapNext);
    list.push(kind === 'thrust' ? thrustMove(hit, gapPrev, gapNext) : arcMove(kind, hit, gapPrev, gapNext));
  });

  /** A slash or a spin: its timing and the parts of its shape that don't need the camera. */
  function arcMove(kind, hit, gapPrev, gapNext) {
    const spin = kind === 'spin';
    const p = spin ? 1.6 : 2 + rng() * 0.6;                          // how sharply it accelerates into the hit
    const d1 = (spin ? 300 + rng() * 90 : 95 + rng() * 50) * DEG;    // the strike's sweep
    const dc = (spin ? 10 + rng() * 15 : 15 + rng() * 25) * DEG;     // the cock back
    const T1 = spin ? clamp(0.5 * gapPrev, 0.3, 0.5) : clamp(0.34 * gapPrev, 0.09, 0.2);
    const Tc = clamp(0.2 * gapPrev, 0.05, 0.16);
    const m = 2.4 + rng() * 1.6;
    const vHit = (p * d1) / T1;
    const d2 = clamp((vHit * clamp(0.28 * gapNext, 0.06, 0.24)) / m, 40 * DEG, (spin ? 160 : 200) * DEG);
    return {
      kind, hit, p, d1, dc, m, d2,
      T: { T1, Tc, T2: (m * d2) / vHit, Tq: 0 },
      pivot: spin ? 0.42 + rng() * 0.13 : rng() * 0.3,   // along grip → tip
      arm: spin ? 0 : rng() * 0.1,                         // the grip leaning against the blade
      lunge: spin ? rng() * 0.1 : rng() * 0.3,             // the pivot flying through the hit
      whirl: spin && rng() < 0.5,                          // a flat whirl rather than a wheel
    };
  }
  /** A thrust. */
  function thrustMove(hit, gapPrev, gapNext) {
    const p = 2 + rng();
    const L = 0.4 + rng() * 0.35;   // the lunge
    const T1 = clamp(0.22 * gapPrev, 0.07, 0.14);
    const m = 2 + rng();
    // It stops in a few hundredths of a second, carried further the faster it went.
    const T2 = clamp(0.07 * gapNext, 0.025, 0.045);
    return {
      kind: 'thrust', hit, p, L, m,
      o: ((p * L) / T1) * T2 / m,
      b: 0.1 + rng() * 0.15,        // the draw back
      T: { T1, Tc: clamp(0.3 * gapPrev, 0.08, 0.24), T2, Tq: clamp(0.22 * gapNext, 0.06, 0.15) },
      twist: alive && rng() < 0.4 ? (rng() < 0.5 ? -1 : 1) * Math.PI : 0, // a corkscrew as it drives in
    };
  }

  // Fit the timeline: each move keeps its shape but plays faster (all its durations scaled
  // alike, so its speed through the hit still matches) until every glide has room.
  const pre = (mv) => mv.T.T1 + mv.T.Tc;
  const post = (mv) => mv.T.T2 + mv.T.Tq;
  for (const mv of list) mv.s = 1;
  list.forEach((mv, k) => {
    const room = k ? mv.hit - list[k - 1].hit - minGlide(mv.hit - list[k - 1].hit) : mv.hit - 0.2;
    const need = mv.s * pre(mv) + (k ? list[k - 1].s * post(list[k - 1]) : 0);
    if (need > room) {
      const f = Math.max(0.2, room / need);
      mv.s *= f;
      if (k) list[k - 1].s *= f;
    }
  });
  const last = list.at(-1);
  const tail = plunge - last.hit - 0.2;
  if (last.s * post(last) > tail) last.s = Math.max(0.2, tail / post(last));
  for (const mv of list) {
    const T = mv.T;
    mv.Ts = { T1: T.T1 * mv.s, Tc: T.Tc * mv.s, T2: T.T2 * mv.s, Tq: T.Tq * mv.s };
    mv.strike = mv.hit - mv.Ts.T1;
    mv.cock = mv.strike - mv.Ts.Tc;
    mv.settled = mv.hit + mv.Ts.T2;
    mv.end = mv.settled + mv.Ts.Tq;
    mv.geo = null;
  }
  const stab = Math.min(0.14, (plunge - last.end) * 0.4);
  const raiseEnd = plunge - stab;

  // --- shapes (taken from the camera when a move is first needed) ---------------------
  // Of a dozen random shapes that clear, the one whose wind-up is nearest to where the
  // blade already is: the follow-through of one move flows into the next, like a combo.
  function prepare(k) {
    const mv = list[k];
    if (mv.geo) return mv;
    const from = k ? prepare(k - 1).done : pulled;
    onMove?.(k, mv.kind);
    const b = basis();
    let best = null;
    let bestScore = Infinity;
    for (let tries = 0, found = 0; tries < 40 && found < 12; tries++) {
      mv.geo = (mv.kind === 'thrust' ? thrustShape : arcShape)(mv, b, tries >= 30);
      if (!clears(mv, b)) continue;
      found++;
      poseAt(mv, mv.cock, sample);
      const score = sample.q.angleTo(from.q) + 1.5 * sample.c.distanceTo(from.c);
      if (score < bestScore) { bestScore = score; best = mv.geo; }
    }
    mv.geo = best ?? mv.geo;
    mv.ready = poseAt(mv, mv.cock, newPose());
    mv.done = poseAt(mv, mv.end, newPose());
    // A big turn to get there: take time from the wind-up (its pose doesn't change, only its pace).
    if (k) {
      const want = (1.9 * mv.ready.q.angleTo(from.q)) / GLIDE_TURN;
      const have = mv.cock - list[k - 1].end;
      const take = Math.min(Math.max(0, want - have), mv.Ts.Tc * 0.5);
      mv.Ts.Tc -= take;
      mv.cock += take;
    }
    return mv;
  }
  /** Where a move fights: near the fire, moved about a little each time. */
  function spot(b) {
    const C = center.clone()
      .addScaledVector(b.right, (rng() - 0.5) * 0.6)
      .addScaledVector(WORLD_UP, rng() * 0.25 - 0.05)
      .addScaledVector(b.toCam.clone().setY(0).normalize(), (rng() - 0.3) * 0.4);
    tv.set(C.x - fire.x, 0, C.z - fire.z);
    if (tv.length() > 0.9) C.addScaledVector(tv, 0.9 / tv.length() - 1);
    return C;
  }
  function arcShape(mv, b, safe) {
    let a, u;
    if (safe || mv.whirl) {
      // A flat whirl, tilted a little: never near the ground.
      const beta = rng() * TAU;
      a = new THREE.Vector3(Math.cos(beta), 0, Math.sin(beta));
      u = new THREE.Vector3().crossVectors(WORLD_UP, a).negate();
      u.applyAxisAngle(a, (rng() * 2 - 1) * (safe ? 0.15 : 0.35));
    } else {
      const phi = rng() * TAU;
      const tau = (rng() * 2 - 1) * 0.45;
      a = b.right.clone().multiplyScalar(Math.cos(phi)).addScaledVector(b.up, Math.sin(phi));
      u = b.right.clone().multiplyScalar(-Math.sin(phi)).addScaledVector(b.up, Math.cos(phi))
        .multiplyScalar(Math.cos(tau)).addScaledVector(b.toCam, Math.sin(tau));
      u.addScaledVector(a, -u.dot(a)).normalize();
    }
    const n = new THREE.Vector3().crossVectors(a, u).normalize();
    const s = rng() < 0.5 ? 1 : -1;
    const thHit = rng() * TAU;
    const thR = thHit - s * (mv.d1 - mv.dc);
    const tHit = a.clone().multiplyScalar(-Math.sin(thHit)).addScaledVector(u, Math.cos(thHit)).multiplyScalar(s);
    return { a, u, n, s, thR, tHit, C: safe ? center.clone() : spot(b), pivotL: grip.clone().lerp(tip, mv.pivot) };
  }
  function thrustShape(mv, b, safe) {
    const side = rng() < 0.5 ? -1 : 1;
    const A = b.right.clone().multiplyScalar(side * (0.55 + 0.45 * rng()))
      .addScaledVector(b.up, safe ? 0 : -0.45 + 0.7 * rng())
      .addScaledVector(b.toCam, safe ? -0.1 : -0.25 + 0.8 * rng()).normalize();
    const n = (rng() < 0.5 ? WORLD_UP : b.toCam).clone().applyAxisAngle(A, (rng() * 2 - 1) * 0.6);
    const C = safe ? center.clone() : spot(b);
    const cocked = C.clone().addScaledVector(A, -(mv.L / 2 + 0.45 * len));
    const W = new THREE.Vector3().crossVectors(A, n).normalize();
    if (W.lengthSq() < 1e-6) W.set(0, 1, 0);
    return { A, n, cocked, W, jitter: new THREE.Vector3().crossVectors(A, WORLD_UP).normalize() };
  }
  /** How far p is from a capsule's axis, less its radius (< 0: inside). */
  const outside = (p, c) => {
    seg.subVectors(c.b, c.a);
    const u = clamp01(tq2.subVectors(p, c.a).dot(seg) / Math.max(1e-6, seg.lengthSq()));
    return p.distanceTo(tq2.copy(c.a).addScaledVector(seg, u)) - c.r;
  };
  /** Sample a move's path: the tip and grip stay above the ground, in the clearing, off the camera and out of the knights. */
  function clears(mv, b) {
    const avoid = b.avoid ?? [];
    for (let i = 0; i <= 24; i++) {
      poseAt(mv, mv.cock + ((mv.end - mv.cock) * i) / 24, sample);
      const t = worldPoint(sample, tip, tv);
      if (t.y < ground || Math.hypot(t.x - fire.x, t.z - fire.z) > 2.6 || t.distanceTo(b.pos) < 0.8) return false;
      const g = worldPoint(sample, grip, tw);
      if (g.y < ground + 0.1 || g.distanceTo(b.pos) < 0.8 || sample.c.distanceTo(b.pos) < 0.8) return false;
      for (const c of avoid) if (outside(t, c) < 0.05 || outside(g, c) < 0.05 || outside(sample.c, c) < 0.05) return false;
    }
    return true;
  }

  // --- poses --------------------------------------------------------------------------
  /** How far a slash has turned from its ready angle (signed along its swing). */
  function arcAngle(mv, t) {
    const { T1, Tc, T2 } = mv.Ts;
    if (t < mv.strike) return -mv.dc * smoother(clamp01((t - mv.cock) / Tc));
    if (t < mv.hit) return -mv.dc + mv.d1 * ((t - mv.strike) / T1) ** mv.p;
    return -mv.dc + mv.d1 + mv.d2 * follow(clamp01((t - mv.hit) / T2), mv.m);
  }
  function poseAt(mv, t, out) {
    return mv.kind === 'thrust' ? thrustPose(mv, t, out) : arcPose(mv, t, out);
  }
  function arcPose(mv, t, out) {
    const g = mv.geo;
    const ang = arcAngle(mv, t);
    const th = g.thR + g.s * ang;
    td.copy(g.a).multiplyScalar(Math.cos(th)).addScaledVector(g.u, Math.sin(th));
    orient(td, g.n, tq);
    const prog = (ang - (mv.d1 - mv.dc)) / (mv.d1 + mv.d2); // 0 at the hit
    tw.copy(g.C).addScaledVector(g.tHit, mv.lunge * prog).addScaledVector(td, -mv.arm);
    return fromPivot(tw, tq, g.pivotL, out);
  }
  function thrustPose(mv, t, out) {
    const g = mv.geo;
    const { T1, Tc, T2 } = mv.Ts;
    let x;
    let twist = 0;
    tw.copy(g.cocked);
    if (t < mv.hit) twist = mv.twist * smoother(clamp01((t - mv.cock) / (Tc + T1)));
    if (t < mv.strike) {
      const u = clamp01((t - mv.cock) / Tc);
      x = mv.b * (1 - smoother(u));
      // Trembling as it gathers itself.
      if (alive) tw.addScaledVector(g.jitter, Math.sin(Math.PI * u) * 0.006 * Math.sin(t * 97));
    } else if (t < mv.hit) {
      x = mv.L * ((t - mv.strike) / T1) ** mv.p;
    } else {
      x = mv.L + mv.o * follow(clamp01((t - mv.hit) / T2), mv.m);
      twist = mv.twist;
    }
    tw.addScaledVector(g.A, x);
    orient(g.A, g.n, tq);
    if (twist) tq.multiply(out.q.setFromAxisAngle(LOCAL_Y, twist));
    if (t > mv.hit) {
      // It stops dead and quivers, dying away by the time the move ends.
      const since = t - mv.hit;
      const fade = 1 - smoother(clamp01((t - (mv.end - 0.06)) / 0.06));
      const a = 0.1 * smoother(clamp01(since / 0.02)) * Math.exp(-since / 0.07) * Math.sin(TAU * 16 * since) * fade;
      tq.premultiply(out.q.setFromAxisAngle(g.W, a));
    }
    return fromPivot(tw, tq, grip, out);
  }

  // --- glides between moves -----------------------------------------------------------
  const glides = new Map(); // key → { from, to, t0, t1, bulge, twirl, flip, flipAxis, hover }
  /** A glide from `from` to `to` over [t0, t1], with an arc, and maybe a twirl or a hover. */
  function makeGlide(from, to, t0, t1, { flip = false } = {}) {
    const T = t1 - t0;
    const b = basis();
    const bulge = WORLD_UP.clone().multiplyScalar((0.06 + 0.12 * rng()) * Math.min(1, T / 0.4))
      .addScaledVector(b.right, (rng() - 0.5) * 0.12 * Math.min(1, T / 0.4));
    const gl = { from, to, t0, t1, bulge, twirl: 0, flip: 0, flipAxis: b.right.clone(), hover: null };
    if (alive && T >= 0.3) {
      const r = rng();
      if (flip && r < 0.35) gl.flip = (rng() < 0.5 ? -1 : 1) * TAU;
      else if (r < (flip ? 0.65 : 0.3)) gl.twirl = (rng() < 0.5 ? -1 : 1) * TAU;
    }
    if (T > 0.6 && !flip) {
      // Time to spare: it hangs in the air, breathing, its point turned toward the camera.
      const tilt = 0.25 + 0.35 * rng();
      const d = WORLD_UP.clone().negate().multiplyScalar(Math.cos(tilt))
        .addScaledVector(b.toCam, Math.sin(tilt) * 0.7).addScaledVector(b.right, Math.sin(tilt) * (rng() - 0.5)).normalize();
      const at = spot(b);
      at.y += 0.1;
      gl.hover = { pose: { c: at, q: orient(d, b.toCam, new THREE.Quaternion()) }, a: t0 + Math.min(0.28, T * 0.3), b: t1 - Math.min(0.28, T * 0.3) };
      gl.twirl = 0;
    }
    // A turn between two poses can swing the point down through the fire: arc higher.
    for (let pass = 0; pass < 3; pass++) {
      let low = Infinity;
      let at = 0.5;
      for (let i = 1; i < 16; i++) {
        const y = worldPoint(glidePose(gl, t0 + (T * i) / 16, sample), tip, tv).y;
        if (y < low) { low = y; at = i / 16; }
      }
      if (low >= ground + 0.05) break;
      gl.bulge.y = Math.min(1, gl.bulge.y + (ground + 0.05 - low) / Math.max(0.3, bump(at))); // (at most a metre higher)
    }
    return gl;
  }
  function blend(from, to, u, gl, out) {
    const s = smoother(u);
    out.c.lerpVectors(from.c, to.c, s).addScaledVector(gl.bulge, bump(u));
    out.q.slerpQuaternions(from.q, to.q, s);
    if (gl.twirl) out.q.multiply(tq.setFromAxisAngle(LOCAL_Y, gl.twirl * s));
    if (gl.flip) out.q.premultiply(tq.setFromAxisAngle(gl.flipAxis, gl.flip * s));
    return out;
  }
  function glidePose(gl, t, out) {
    if (!gl.hover) return blend(gl.from, gl.to, clamp01((t - gl.t0) / (gl.t1 - gl.t0)), gl, out);
    const h = gl.hover;
    if (t < h.a) return blend(gl.from, h.pose, clamp01((t - gl.t0) / (h.a - gl.t0)), gl, out);
    if (t > h.b) return blend(h.pose, gl.to, clamp01((t - h.b) / (gl.t1 - h.b)), gl, out);
    // Hovering: a slow bob and the point wandering, easing in and out.
    const u = (t - h.a) / (h.b - h.a);
    const e = Math.min(1, u * 4, (1 - u) * 4);
    const env = e * e * (3 - 2 * e);
    copyPose(h.pose, out);
    out.c.y += Math.sin((t - h.a) * 5.3) * 0.035 * env;
    out.q.multiply(tq.setFromAxisAngle(LOCAL_X, Math.sin((t - h.a) * 3.1) * 0.12 * env));
    out.q.multiply(tq.setFromAxisAngle(LOCAL_Z, Math.sin((t - h.a) * 2.3 + 1) * 0.1 * env));
    return out;
  }
  function glide(key, make) {
    if (!glides.has(key)) glides.set(key, make());
    return glides.get(key);
  }

  // --- the rise out of the fire -------------------------------------------------------
  const first = list[0];
  const riseT = first.cock;
  const wiggle = alive && riseT >= 0.4 ? Math.min(0.16, 0.2 * riseT) : 0;
  const pullEnd = wiggle + (riseT - wiggle) * 0.4;
  const pulled = drawnUp(0.55);
  function risePose(t, out) {
    if (t < wiggle) {
      // Working itself loose.
      const u = t / wiggle;
      copyPose(homePose, out);
      out.q.multiply(tq.setFromAxisAngle(LOCAL_Z, 0.07 * Math.sin(TAU * 2 * u) * Math.sin(Math.PI * u)));
      return out;
    }
    if (t < pullEnd) {
      const s = smoother(clamp01((t - wiggle) / (pullEnd - wiggle)));
      out.q.copy(homePose.q);
      out.c.lerpVectors(homePose.c, pulled.c, s);
      return out;
    }
    prepare(0);
    return glidePose(glide('rise', () => makeGlide(pulled, first.ready, pullEnd, riseT)), t, out);
  }

  // --- the plunge ----------------------------------------------------------------------
  const raised = drawnUp(alive && rng() < 0.35 ? 1.25 : 0.9);
  function plungePose(t, out) {
    if (t < raiseEnd) return glidePose(glide('raise', () => makeGlide(prepare(list.length - 1).done, raised, last.end, raiseEnd, { flip: true })), t, out);
    const u = clamp01((t - raiseEnd) / Math.max(1e-3, stab));
    out.q.copy(homePose.q);
    out.c.lerpVectors(raised.c, homePose.c, u * u);
    return out;
  }

  const outPose = newPose();
  /** The weapon's world position (its local origin) and rotation at `t` s into the routine. */
  function pose(t, outPos, outQuat) {
    let p;
    if (t < riseT) p = risePose(Math.max(0, t), outPose);
    else if (t >= plunge) p = copyPose(homePose, outPose);
    else if (t >= last.end) p = plungePose(t, outPose);
    else {
      let k = 0;
      while (t >= list[k].end) k++;
      const mv = prepare(k);
      if (t >= mv.cock) p = poseAt(mv, t, outPose);
      else {
        const prev = prepare(k - 1);
        p = glidePose(glide(k, () => makeGlide(prev.done, mv.ready, prev.end, mv.cock)), t, outPose);
      }
    }
    outQuat.copy(p.q);
    outPos.copy(mid).applyQuaternion(p.q).negate().add(p.c);
  }

  return {
    pose,
    /** The hits: { t, kind }. */
    hits: list.map((mv) => ({ t: mv.hit, kind: mv.kind })),
    /** When it's back in the fire. */
    end: plunge,
  };
}
