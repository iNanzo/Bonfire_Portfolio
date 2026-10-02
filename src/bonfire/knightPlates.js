// The plates' springs (knights.js steps them with each knight's pose), and a plate a spring
// would swing into the scenery stopped where his pose has it (createPlateSprings).
import * as THREE from 'three';
import { BONE_INDEX, DEPTH } from './knightMesh.js';
import { place, within, nearestIn, _shapes } from './knightClear.js';

// His pose's steps a second: the fire's twelve frames, like a sprite (knights.js steps every
// knight's pose at them, and the plates' springs step with it).
export const STEP_FPS = 12;
// The plates on straps: the pauldrons (dome and lames, on the chest) and the tassets (on the
// hips) lag their pose a moment and overshoot a little before they settle. A spring each,
// stepped with the pose at twelve steps a second (in substeps, so it's steady; the same
// steps always swing the same way): `hz` its frequency, `damp` its damping ratio (0.38: a
// quarter's overshoot), `max` how far (rad) a plate may stray from its pose.
/** @type {[string, string, number][]} */
const SPRUNG = [
  ['shoulderL', 'chest', 0.1], ['pauldronL', 'chest', 0.13], ['shoulderR', 'chest', 0.1], ['pauldronR', 'chest', 0.13],
  ['tassetL', 'hips', 0.09], ['tassetR', 'hips', 0.09],
];
const SPRING = { hz: 2.6, damp: 0.38, substeps: 4 };

const sq = new THREE.Quaternion();
const tq = new THREE.Quaternion();
const dq = new THREE.Quaternion();
const ev = new THREE.Vector3();
const vt = new THREE.Vector3();
const tv = new THREE.Vector3();
const rel = new THREE.Vector3();
/** A unit quaternion as a rotation vector (axis × angle, the short way round), into `out`. */
function logQ(r, out) {
  const sgn = r.w < 0 ? -1 : 1;
  const half = Math.acos(Math.min(1, sgn * r.w)), sn = Math.sin(half);
  return sn < 1e-9 ? out.set(0, 0, 0) : out.set(r.x, r.y, r.z).multiplyScalar((sgn * 2 * half) / sn);
}
/** A rotation vector as a quaternion, into `out`. */
function expQ(v, out) {
  const a = v.length();
  return a < 1e-9 ? out.identity() : out.setFromAxisAngle(tv.copy(v).divideScalar(a), a);
}

/**
 * The plates' springs for one knights module's knights: the points they're checked at
 * (knightMesh.js probesOf: `probes` each arm piece's, `bodyProbes` his body's) and `nearOf(k)`,
 * the scenery's shapes near where knight k stands. Returns springPlates(k, s, snap).
 */
export function createPlateSprings({ probes, bodyProbes, nearOf }) {
  // (The sprung plates' points, SPRUNG's order, and how near a shape each may come: springPlates.)
  const SPRUNG_PROBES = SPRUNG.map(([bone]) => {
    const b = bodyProbes.find((q) => q.i === BONE_INDEX[bone]);
    return b ? { pc: b, depth: b.depth } : { pc: probes.get(BONE_INDEX[bone]), depth: DEPTH };
  });
  /**
   * The plates (SPRUNG) swung one pose step toward where the solver put them (`s.q`, turned
   * from their parents), written back into `s.q`; `snap` puts them there at once (he was just
   * placed somewhere, or sits still). The spring damps against how fast the pose itself
   * turns, so a plate moving steadily with him keeps up and only a stop or a jolt swings it.
   * A plate it would swing into the scenery stops where his pose has it (that's clear:
   * solveClear) and goes on from there. Returns whether any is still swinging (its shadow
   * wants redrawing).
   */
  function springPlates(k, s, snap) {
    const st = k.spring ??= SPRUNG.map(() => ({ q: new THREE.Quaternion(), v: new THREE.Vector3(), pose: new THREE.Quaternion(), set: false }));
    const cs = snap ? null : nearOf(k);
    if (cs?.length) place(k);
    const h = 1 / STEP_FPS / SPRING.substeps;
    const w0 = 2 * Math.PI * SPRING.hz;
    let swinging = false;
    SPRUNG.forEach(([bone, par, max], j) => {
      const i = BONE_INDEX[bone], pi = BONE_INDEX[par];
      const x = st[j];
      tq.copy(s.q[pi]).invert().multiply(s.q[i]);
      if (snap || !x.set) { x.q.copy(tq); x.pose.copy(tq); x.v.set(0, 0, 0); x.set = true; return; }
      logQ(dq.copy(tq).multiply(sq.copy(x.pose).invert()), vt).multiplyScalar(STEP_FPS);
      x.pose.copy(tq);
      for (let n = 0; n < SPRING.substeps; n++) {
        logQ(dq.copy(x.q).multiply(sq.copy(tq).invert()), ev);
        x.v.addScaledVector(ev, -w0 * w0 * h).addScaledVector(rel.copy(x.v).sub(vt), -2 * SPRING.damp * w0 * h);
        x.q.premultiply(expQ(rel.copy(x.v).multiplyScalar(h), dq)).normalize();
      }
      // (Never further than `max` from the pose: the strap holds.)
      const off = logQ(dq.copy(x.q).multiply(sq.copy(tq).invert()), ev).length();
      if (off > max) {
        x.q.copy(expQ(ev.multiplyScalar(max / off), dq)).multiply(tq);
        const out = x.v.dot(ev.normalize());
        if (out > 0) x.v.addScaledVector(ev, -out);
      }
      s.q[i].copy(s.q[pi]).multiply(x.q);
      // (Its lag or overshoot taking it into a shape: where his pose has it, moving with it.)
      const pr = SPRUNG_PROBES[j];
      if (cs?.length && within(s, i, pr.pc.r, pr.depth, cs).length && nearestIn(pr.pc, _shapes, pr.depth).col) {
        x.q.copy(tq);
        x.v.copy(vt);
        s.q[i].copy(s.q[pi]).multiply(tq);
        return;
      }
      if (off > 0.014 || rel.copy(x.v).sub(vt).length() > 0.3) swinging = true;
    });
    return swinging;
  }
  return springPlates;
}
