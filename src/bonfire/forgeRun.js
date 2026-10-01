// The forge, in each element's style, on any two "subjects": the weapon swap's dissolve →
// swirl → gather → form → hold (weapons.js), and the knight's arrival and leaving between
// him and his summon sign (knightArrival.js). One subject burns away and its soul becomes
// the other:
//   dissolve  `from` ripple-dissolves in a two-tone edge; particles peel off the edge as it
//             passes, drift a little, and a rotating double helix round `to` takes them
//   swirl     the helix turns (the bonfire's curl noise on it), the color turning old → new
//   gather    the helix tightens and spins faster, collapsing onto `to`'s surface
//   form      the same ripple in reverse builds `to` in the new colors (each particle
//             dither-fades as the edge reaches its spot); a double helix of lines wraps it
//             from the moment the particles have turned, closing in to its real width
//   hold      formed: an echo of its silhouette bursts out, the helix fades; the owner says
//             when the hold ends (a held weapon waits for the drop)
// Each element keeps those steps and adds its own big moves, readable in the first half
// second:
//   fire       embers off a steady two-tone edge, a smooth shimmering helix
//   lightning  a bolt out of the sky into `from`, which strobes and crackles apart (a
//              white-hot flickering edge, an arc crawling along it); arcs leap between the
//              charging cloud and the ground; the helix crackles in broken strands; `to`
//              forms in five jumps, each a flash and an arc to the ground; then a bolt out of
//              the sky into it
//   ice        frost creeps up `from` and it shatters all at once, its shards flung out and
//              falling before a slow hexagonal helix gathers them; `to` grows inside a cocoon
//              of crystals, each shard glinting as it freezes on, and when it's whole the
//              cocoon cracks off and a cut-crystal echo grows out in steps
// Big moments land like small hits (hooks.onForgeStrike: a flash and a jolt).
//
// A subject is what the forge needs of a thing, whatever it is (a weapon, the knight's
// posed body, the sign on the ground): see ForgeSubject below. Its own space is where its
// samples, heights and span are; a helix turns about its y axis. The owner (weapons.js,
// knightArrival.js) keeps its own phases around the forge's (the weapon's strike and
// settle, its hold over the fire), moves its subjects, and draws its own lines into the
// same line buffer through `stepLines`' `extra`.
import * as THREE from 'three';
import { weaponSilhouette, profileAt } from './forgeFx.js';
import { seeded, hashSeed } from './bolts.js';
import { CRYSTAL_EDGES } from './ice.js';
import { HELIX_TURNS, helixWide } from './forgeParticles.js';
import { smoothstep } from '../math.js';

/**
 * What the forge needs of a subject.
 * @typedef {object} ForgeSubject
 * @property {THREE.Matrix4} matrixWorld  its own space → world (read every frame)
 * @property {Float32Array} samples       surface points in its own space (x, y, z each; as many as the particles)
 * @property {Float32Array} heights       each sample's height up it, 0 (bottom, a blade's point) → 1
 * @property {THREE.Vector2} span         its heights in its own space (y), bottom → top
 * @property {() => object} silhouette    its side profile (forgeFx.js weaponSilhouette), built on first use
 * @property {THREE.Matrix4} [silMatrix]  where the silhouette lies (world), if not matrixWorld (the sign's lies flat)
 * @property {() => { y0: number, y1: number, rx: Float32Array, rz: Float32Array }} [profile]
 *   its width at each height for the helix to close in on and the cocoon to grow from (default: the silhouette's)
 * @property {(s: number) => number} [helixWide]  the helix's radius at height s (default: a blade's)
 * @property {boolean} [formsUp]          forms from the bottom up (default: only in ice)
 * @property {boolean} [formGlow]         glows in the new color as it forms and is formed (default
 *   true; false: it forms in its own tones, lightning's jumps flashing it up its own ramp through
 *   uniforms.uLift if it has one: a knight in his own steel, never a flat cut-out of the edge's color)
 * @property {number} [cloud]             the lightning cloud's radius round it (default 0.24)
 * @property {{ n: number, size: number, spread: number, out: number }} [cocoon]  ice's crystals round it
 * @property {(s: number, out: THREE.Vector3) => THREE.Vector3} [strikePoint]  where a bolt at height s lands (world)
 * @property {(rng: () => number, out: THREE.Vector3) => THREE.Vector3} [ground]  a spot for a ground arc (world)
 * @property {object} uniforms  its dissolve's ({ value }): uDissolve, uEdge, uEdgeHot, uGlow, uFlip, uFrost, uFrostColor
 *   (and uLift, a flash in its own tones, where formGlow is false)
 * @property {(on: boolean) => void} show   shown or hidden (the lightning's strobe; hidden once it's gone)
 * @property {(on: boolean) => void} ghost  on the ghost layer (no outline or shadow of its holes) or solid
 */

// The ripple's threshold field (dissolve.js): dv = noise·0.45 + bayer·0.25 + height·0.3,
// visible where dv ≥ uDissolve·1.15 − 0.05. Rising uDissolve eats the subject from the
// bottom up; falling uDissolve builds it from the top down. edgeAt() is the same field on
// average, so particles can shed / fade exactly where the edge is.
export const edgeAt = (h, jitter) => THREE.MathUtils.clamp((0.3925 + 0.3 * h + jitter) / 1.15, 0, 1);
/** Where the edge is on a subject (0 bottom → 1 top) at dissolve amount `u` (see edgeAt). */
export const edgeHeight = (u) => THREE.MathUtils.clamp((1.15 * u - 0.3925) / 0.3, 0, 1);

export const ease = {
  inQuad: (t) => t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

/** How far each of lightning's jumps lifts a subject that forms in its own tones (formGlow false: uLift). */
const JUMP_LIFT = 0.85;
/** The phases' lengths (s): the weapon swap's, and under reduced motion. */
export const FORGE_TIMES = { dissolve: 1.4, swirl: 0.3, gather: 0.6, form: 0.9, hold: 0.25 };
export const FORGE_TIMES_REDUCED = { dissolve: 0.35, swirl: 0, gather: 0, form: 0.35, hold: 0.1 };

const SNUG = 0.02; // how far outside the subject's surface the closed-in helix sits (~2 texels up close)
const UP = new THREE.Vector3(0, 1, 0);
const COCOON = { n: 6, size: 0.1, spread: 0.06, out: 0.18 };

/**
 * @param {object} o
 * @param {object} o.particles   createForgeParticles(): the pool the forge runs on
 * @param {object|null} o.fx     createForgeFx() (the helix and echo lines), or null
 * @param {object|null} o.arcs   createBoltLines() (lightning's arcs and strikes, ice's cocoon), or null
 * @param {{ [element: string]: THREE.Material }} [o.materials]  the particles' material per element
 * @param {THREE.Material} [o.particleMaterial]  ...and otherwise
 * @param {typeof FORGE_TIMES} o.times  each phase's length (s)
 * @param {boolean} o.reducedMotion  no bolts, strobes or flashes (only the frost and the colors)
 * @param {() => number} o.clock     the owner's clock (s): flickers and arcs step on it
 * @param {(rng: () => number, out: THREE.Vector3) => THREE.Vector3} o.groundPoint  a spot for a ground arc (world), unless the subject has its own
 * @param {object} [o.hooks]
 *   updateMatrices()        bring the subjects' world matrices up to date
 *   onForgeStrike(weight)   a big moment: a flash and a jolt
 *   onFormed()              `to` is whole
 *   onDissolve(k)           each dissolve step (0..1), for the owner's own motion
 *   onFormBegin()           the form starts (`to` has just been shown)
 *   onHold(t, dt)           each hold step (t: s into the hold); the owner ends it (finish())
 *   holdSpin(dt)            how fast the helix turns in the hold (rad/s; default 10)
 *   holdAlpha(t)            the helix lines' strength in the hold (default: fading over it)
 */
export function createForgeRun({ particles, fx, arcs, materials = null, particleMaterial = null, times: D, reducedMotion, clock, groundPoint, hooks = {} }) {
  const FORGE = D.dissolve + D.swirl + D.gather;  // time over which the color turns old → new
  const TURNED = FORGE * 0.5;                      // the particles' color has swapped: the helix lines start
  const FORMED = FORGE + D.form;                   // ...and meet here
  const TIGHTEN_FROM = D.dissolve + D.swirl;       // the gather: the particles start collapsing
  // Ice: the frozen subject shatters this far into the dissolve (s).
  const SHATTER = Math.min(0.6, D.dissolve * 0.43);

  let phase = 'idle'; // dissolve | swirl | gather | form | hold | idle
  let t = 0;
  let elapsed = 0;
  let element = 'fire'; // the element the forge under way takes after
  /** @type {ForgeSubject|null} */ let from = null;
  /** @type {ForgeSubject|null} */ let to = null;
  const edgeOld = new THREE.Color();
  const edgeOldHot = new THREE.Color();
  const edgeNew = new THREE.Color();
  const edgeNewHot = new THREE.Color();
  const rampOld = [];
  const rampNew = [];
  let helixSpin = 0; // the helix's turn (the particles and the lines share it)
  let shattered = false;
  let formSteps = 0;   // lightning: the form's jumps so far...
  let stepGlow = 0;    // ...each one flashes it...
  let groundArcT = -1; // ...and throws an arc to the ground for a moment
  let cocoonT = -1;    // ice: the cocoon's burst (s), or -1 while it grows
  let strikeT = -1;    // a strike's age (s), or -1
  let strikeLen = 0.16;
  const strikeTop = new THREE.Vector3();
  const strikeEnd = new THREE.Vector3();
  const cocoon = [];   // ice: { s (up it from the bottom), a (around it), tilt, size, twist }
  let burstT = -1;
  let burstSil = null;
  let burstEl = 'fire'; // the element the echo takes after
  const burstMatrix = new THREE.Matrix4();
  let flickerStep = -1;
  const arcA = new THREE.Vector3();
  const arcB = new THREE.Vector3();
  const arcCol = new THREE.Color();
  const cA = new THREE.Vector3();
  const cB = new THREE.Vector3();
  const cDir = new THREE.Vector3();
  const cQ = new THREE.Quaternion();
  const cTwist = new THREE.Quaternion();
  const cM = new THREE.Matrix4();
  const cS = new THREE.Vector3();
  const cBase = new THREE.Vector3();
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  const lineLead = new THREE.Color();
  const lineTrail = new THREE.Color();
  const lineHot = new THREE.Color();
  const profileOf = (s) => s.profile?.() ?? s.silhouette().profile;
  const silMatrixOf = (s) => s.silMatrix ?? s.matrixWorld;
  const updateMatrices = () => hooks.updateMatrices?.();

  /** Lightning: the forge edge (dissolving or forming) flickers white-hot at ~20 Hz. */
  function flickerEdge(u, ramp) {
    const f = Math.floor(clock() * 20);
    if (f === flickerStep) return;
    flickerStep = f;
    const hot = Math.random() < 0.55;
    u.uEdgeHot.value.copy(ramp[hot ? 3 : 2]);
    u.uEdge.value.copy(ramp[hot ? 2 : 1]);
  }
  /** A surface sample of `s` near height `h` (world, into `out`), or null. */
  function sampleNear(s, h, out) {
    const hs = s.heights;
    if (!hs?.length) return null;
    for (let tries = 0; tries < 24; tries++) {
      const i = Math.floor(Math.random() * hs.length);
      if (Math.abs(hs[i] - h) > 0.07) continue;
      const p = s.samples;
      return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(s.matrixWorld);
    }
    return null;
  }
  /** A point `r` from `s`'s axis at height `h` (0 bottom → 1 top), turned `a` round it (world). */
  function axisPoint(s, h, a, r, out) {
    const span = s.span;
    return out.set(Math.cos(a) * r, span.x + h * (span.y - span.x), Math.sin(a) * r).applyMatrix4(s.matrixWorld);
  }

  /** Ice: the crystals that will encase the new subject. */
  function buildCocoon() {
    cocoon.length = 0;
    const c = to.cocoon ?? COCOON;
    for (let i = 0; i < c.n; i++) {
      cocoon.push({
        s: 0.1 + (i / (c.n - 1)) * 0.74 + (Math.random() - 0.5) * 0.06,
        a: i * 2.4 + Math.random() * 0.8,
        tilt: 0.9 + Math.random() * 0.45,
        size: c.size + Math.random() * c.spread,
        twist: Math.random() * Math.PI,
      });
    }
  }
  /**
   * Ice: each crystal grows out of the subject as the forming front passes it (from the
   * bottom up); once it's formed they crack off, flung outward as they fade.
   */
  function drawCocoon(dt) {
    const profile = profileOf(to);
    if (!profile) return;
    const burst = cocoonT >= 0 ? Math.min(1, (cocoonT += dt) / 0.45) : 0;
    if (burst >= 1) { cocoonT = -1; return; }
    const front = phase === 'form' ? 1 - edgeHeight(to.uniforms.uDissolve.value) : 1;
    const len = profile.y1 - profile.y0;
    const out = (to.cocoon ?? COCOON).out;
    for (const c of cocoon) {
      const grow = phase === 'form' ? smoothstep(c.s - 0.04, c.s + 0.16, front) : 1;
      if (grow <= 0.01) continue;
      const rx = profileAt(profile.rx, c.s), rz = profileAt(profile.rz, c.s);
      cDir.set(Math.cos(c.a) * Math.sin(c.tilt), Math.cos(c.tilt), Math.sin(c.a) * Math.sin(c.tilt));
      cBase.set(Math.cos(c.a) * rx, profile.y0 + c.s * len, Math.sin(c.a) * rz).addScaledVector(cDir, out * ease.outCubic(burst));
      cQ.setFromUnitVectors(UP, cDir).multiply(cTwist.setFromAxisAngle(UP, c.twist));
      const size = c.size * grow * (1 + 0.8 * ease.outCubic(burst));
      cM.compose(cBase, cQ, cS.set(size, size * 1.9, size)).premultiply(to.matrixWorld);
      const alpha = (1 - burst) ** 1.3 * (0.7 + 0.3 * grow);
      colA.copy(rampNew[2]);
      colB.copy(rampNew[3]);
      for (const [p, q] of CRYSTAL_EDGES) {
        cA.copy(p).applyMatrix4(cM);
        cB.copy(q).applyMatrix4(cM);
        arcs.segment(cA.x, cA.y, cA.z, cB.x, cB.y, cB.z, p.y > 0.5 ? colB : colA, q.y > 0.5 ? colB : colA, alpha, alpha);
      }
    }
  }

  /** A bolt out of the sky, from above and a little to the side, down to height `s` of `subject`. */
  function strike(subject, s = 1, len = 0.3) {
    if (!arcs) return;
    if (subject.strikePoint) subject.strikePoint(s, strikeEnd);
    else axisPoint(subject, s, 0, 0, strikeEnd);
    const a = Math.random() * Math.PI * 2;
    strikeTop.set(strikeEnd.x + Math.cos(a) * 0.4, strikeEnd.y + 3, strikeEnd.z + Math.sin(a) * 0.4);
    strikeT = 0;
    strikeLen = len;
  }

  /** Lightning's arcs and strikes, ice's cocoon (every frame, before the step). */
  function stepElement(dt) {
    if (!arcs || !(element !== 'fire' || strikeT >= 0 || cocoonT >= 0)) return;
    const time = clock();
    arcs.begin();
    updateMatrices();
    const zap = element === 'lightning';
    // Lightning: an arc crawling along the forge edge, dissolving and then forming...
    const obj = phase === 'dissolve' ? from : phase === 'form' ? to : null;
    const ramp = phase === 'dissolve' ? rampOld : rampNew;
    if (zap && obj) {
      const h = edgeHeight(obj.uniforms.uDissolve.value);
      const frame = Math.floor(time * 16); // a new arc ~16 times a second, one or two at a time
      const rng = seeded(hashSeed(frame, 11));
      const count = 1 + (rng() < 0.4 ? 1 : 0);
      for (let j = 0; j < count; j++) {
        if (!sampleNear(obj, h, arcA) || !sampleNear(obj, h, arcB) || arcA.distanceToSquared(arcB) < 0.0009) continue;
        arcs.bolt(arcA.x, arcA.y, arcA.z, arcB.x, arcB.y, arcB.z, {
          rng, depth: 3, jag: 0.35, alpha: 0.9,
          color: (s, out) => out.copy(ramp[3]).lerp(ramp[2], Math.abs(s - 0.5) * 2),
        });
      }
    }
    // ...arcs leaping between the charging particle cloud and the ground (and at each of the
    // form's jumps)...
    if (zap && to && (phase === 'swirl' || phase === 'gather' || groundArcT >= 0)) {
      const rng = seeded(hashSeed(Math.floor(time * 12), 17));
      const n = phase === 'gather' ? 2 : 1;
      for (let j = 0; j < n; j++) {
        axisPoint(to, 0.15 + rng() * 0.7, rng() * Math.PI * 2, phase === 'form' ? 0.02 : to.cloud ?? 0.24, arcA);
        (to.ground ?? groundPoint)(rng, arcB);
        arcs.bolt(arcA.x, arcA.y, arcA.z, arcB.x, arcB.y, arcB.z, {
          rng, depth: 4, jag: 0.28, width: (s) => 2.2 - 1.2 * s, heat: 1.3, alpha: 0.95,
          color: (s, out) => out.copy(rampNew[3]).lerp(rampNew[2], s),
        });
      }
      if (groundArcT >= 0 && (groundArcT -= dt) < 0) groundArcT = -1;
    }
    // ...and the strikes out of the sky (into the old subject, then into the new one).
    if (strikeT >= 0) {
      strikeT += dt;
      if (strikeT < strikeLen) {
        const rng = seeded(hashSeed(Math.floor(strikeT / 0.04), 29)); // it jumps shape a few times
        const k = strikeT / strikeLen;
        arcCol.copy(rampNew[3]);
        arcs.bolt(strikeTop.x, strikeTop.y, strikeTop.z, strikeEnd.x, strikeEnd.y, strikeEnd.z, {
          rng, depth: 5, jag: 0.14, width: (s) => 1.5 + 4 * s * (1 - k * 0.7), heat: 1.7,
          alpha: (s) => (1 - k * 0.5) * Math.min(1, 0.35 + s * 1.5),
          color: (s, out) => out.copy(rampNew[2]).lerp(arcCol, s),
          each: (x, y, z, s) => {
            if (s > 0.2 && s < 0.7 && rng() < 0.22) {
              arcs.bolt(x, y, z, x + (rng() - 0.5) * 0.7, y - 0.2 - rng() * 0.35, z + (rng() - 0.5) * 0.7, {
                rng, depth: 2, jag: 0.4, alpha: (b) => (1 - b) * 0.7, color: (b, out) => out.copy(rampNew[2]),
              });
            }
          },
        });
      } else strikeT = -1;
    }
    // Ice: the cocoon of crystals round the forming subject.
    if (element === 'ice' && to && (phase === 'form' || cocoonT >= 0)) drawCocoon(dt);
    arcs.end();
  }

  // The double helix: from the moment the particles' color has swapped, two lines trace the
  // particle helix round `to`, one growing from the bottom up and one from the top down. They
  // span exactly its height and, as it completes, close in on it: an oval just outside its
  // real cross-section at every height (its width one way, its thickness the other), so they
  // wrap it like a ribbon, passing behind it. They meet as the form completes and fade
  // through the hold; both taper out toward the ends.
  // The burst: once formed, one echo of its own silhouette grows out from it in its plane,
  // wobbling with noise as it fades.
  let tighten = 0;
  let lineProfile = null;
  let lineWide = helixWide;
  const closeIn = (table, s) => {
    const snug = profileAt(table, s) + SNUG;
    const wide = Math.max(snug, lineWide(s));
    return wide + (snug - wide) * tighten;
  };
  const lineRX = (s) => closeIn(lineProfile.rx, s);
  const lineRZ = (s) => closeIn(lineProfile.rz, s);
  /** The helix and the echo (every frame, before the step); `extra()` draws the owner's own lines into the same buffer. */
  function stepLines(dt, extra = null) {
    if (!fx) return;
    const time = clock();
    fx.begin();
    if (to && phase !== 'idle') {
      const growth = smoothstep(0, 1, (elapsed - TURNED) / (FORMED - TURNED));
      if (growth > 0) {
        if (phase === 'hold') helixSpin += dt * (hooks.holdSpin ? hooks.holdSpin(dt) : 10);
        lineProfile = profileOf(to);
        lineWide = to.helixWide ?? helixWide;
        tighten = smoothstep(0.2, 1, (elapsed - TIGHTEN_FROM) / (FORMED - TIGHTEN_FROM));
        // Ice's lines are frost-pale; lightning's burn white-hot.
        const pale = element !== 'fire';
        lineLead.copy(rampNew[pale ? 3 : 2]);
        if (element === 'ice') lineLead.lerp(rampNew[2], 0.4);
        lineTrail.copy(rampNew[pale ? 2 : 1]).multiplyScalar(0.65);
        lineHot.copy(rampNew[3]);
        fx.helix({
          matrix: to.matrixWorld, y0: lineProfile.y0, y1: lineProfile.y1, spin: helixSpin, turns: HELIX_TURNS,
          growth, alpha: phase === 'hold' ? (hooks.holdAlpha ? hooks.holdAlpha(t) : 1 - Math.min(1, t / D.hold)) : 1, radiusX: lineRX, radiusZ: lineRZ,
          lead: lineLead, trail: lineTrail, head: lineHot, t: time, style: element,
        });
      }
    }
    if (burstT >= 0) {
      burstT += dt;
      const k = burstT / 0.6;
      if (k < 1) {
        // Fire's echo grows smoothly; ice's grows out in steps, cut like crystal; lightning's flickers.
        const grown = burstEl === 'ice' ? ease.outCubic(Math.ceil(k * 4) / 4) : ease.outCubic(k);
        const on = burstEl !== 'lightning' || Math.random() < 0.75;
        const pale = burstEl !== 'fire';
        lineLead.copy(rampNew[3]).lerp(rampNew[pale ? 3 : 2], k);
        lineTrail.copy(rampNew[pale ? 2 : 1]).multiplyScalar(0.7);
        lineHot.copy(rampNew[3]);
        fx.outline({
          sil: burstSil, matrix: burstMatrix, dilate: 0.02 + 0.07 * grown, scale: 1 + 0.55 * grown,
          wobble: burstEl === 'ice' ? 0 : 0.01 + 0.025 * k, alpha: on ? (1 - k) ** 1.2 : 0,
          lead: lineLead, trail: lineTrail, hot: lineHot, t: time, seed: 3, facet: burstEl === 'ice' ? 0.03 : 0,
        });
      } else burstT = -1;
    }
    extra?.();
    fx.end();
  }

  /** A step of the particles through the dissolve, swirl, gather and form. */
  function stepForge(dt) {
    updateMatrices();
    const k = phase === 'gather' ? Math.min(1, t / D.gather) : phase === 'form' ? 1 : 0;
    helixSpin += dt * 3.2 * (1 + 2.2 * k) * (element === 'ice' ? 0.55 : 1); // ice turns slow
    const p = Math.min(1, elapsed / FORGE);
    particles.step(dt, {
      shedUntil: phase === 'dissolve' ? t : -1,
      gather: k,
      forming: phase === 'form',
      formU: phase === 'form' ? to.uniforms.uDissolve.value : 1,
      pulling: phase === 'gather' || phase === 'form',
      blend: p * p * (3 - 2 * p), // current color → next color
      spin: helixSpin, from, to, time: clock(), colorsFrom: rampOld, colorsTo: rampNew,
      element,
    });
  }

  function beginForm() {
    to.show(true);
    to.ghost(true);
    hooks.onFormBegin?.();
    const u = to.uniforms;
    u.uEdge.value.copy(edgeNew);
    u.uEdgeHot.value.copy(edgeNewHot);
    u.uDissolve.value = 1;
    u.uGlow.value = 0;
  }
  // Each phase starts with the time the last one overran by, so the end lands exactly when
  // it should (the visualizer puts a weapon's impact on a beat).
  function next(p, carry = 0) {
    phase = p;
    t = Math.max(0, carry);
    if (p === 'form') beginForm();
  }

  /**
   * Advance the forge by `dt` (the owner's, already at its pace). The hold runs until the
   * owner calls finish().
   */
  function step(dt) {
    if (phase === 'idle') return;
    t += dt;
    elapsed += dt;
    const zap = element === 'lightning';
    if (phase === 'dissolve') {
      const k = Math.min(1, t / D.dissolve);
      if (from) {
        hooks.onDissolve?.(k);
        const u = from.uniforms;
        u.uEdge.value.copy(edgeOld);
        u.uEdgeHot.value.copy(edgeOldHot);
        if (element === 'ice') {
          // Frozen from the bottom up, then it shatters all at once (its shards fly: forgeParticles).
          u.uFrost.value = Math.min(1, t / (SHATTER * 0.9));
          u.uDissolve.value = t < SHATTER ? 0 : Math.min(1, (t - SHATTER) / 0.12);
          if (!shattered && t >= SHATTER) {
            shattered = true;
            if (fx) { burstT = 0; burstEl = 'ice'; burstSil = from.silhouette(); burstMatrix.copy(silMatrixOf(from)); }
            hooks.onForgeStrike?.(0.45);
          }
        } else {
          u.uDissolve.value = Math.max(0, (k - 0.08) / 0.92);
        }
        if (zap) {
          flickerEdge(u, rampOld);
          if (!reducedMotion) from.show(t > 0.4 || Math.floor(t * 26) % 2 === 0); // struck: it strobes (never under reduced motion)
        }
      }
      stepForge(dt);
      if (k >= 1) {
        if (from) from.show(false);
        next(D.swirl > 0 ? 'swirl' : D.gather > 0 ? 'gather' : 'form', t - D.dissolve);
      }
    } else if (phase === 'swirl') {
      stepForge(dt);
      if (t >= D.swirl) next('gather', t - D.swirl);
    } else if (phase === 'gather') {
      stepForge(dt);
      if (t >= D.gather) next('form', t - D.gather);
    } else if (phase === 'form') {
      // The ripple runs in reverse; the new color's glow comes in once most of it has
      // formed, so it doesn't wash the edge out.
      const k = Math.min(1, t / D.form);
      const u = to.uniforms;
      let kk = k;
      if (zap && !reducedMotion) {
        // It forms in five jumps, each a flash and an arc to the ground.
        flickerEdge(u, rampNew);
        const jump = Math.ceil(k * 5);
        kk = Math.min(1, jump / 5);
        if (jump > formSteps) { formSteps = jump; stepGlow = 1; groundArcT = 0.09; }
      }
      stepGlow *= Math.exp(-dt / 0.08);
      const glows = to.formGlow !== false;
      u.uDissolve.value = 1 - ease.inOut(kk);
      // (Each of lightning's jumps flashes it: a weapon in the new color's glow; a subject that
      // forms in its own tones (formGlow false: the knight) up its own ramp instead (uLift), never
      // washed flat in the edge's color.)
      u.uGlow.value = glows ? Math.max(smoothstep(0.55, 1, k), stepGlow * 0.9) : 0;
      if (!glows && u.uLift) u.uLift.value = stepGlow * JUMP_LIFT;
      stepForge(dt);
      if (k >= 1) {
        u.uDissolve.value = 0;
        u.uGlow.value = glows ? 1 : 0;
        if (!glows && u.uLift) u.uLift.value = 0;
        particles.clear();
        if (fx) { burstT = 0; burstEl = element; burstSil = to.silhouette(); burstMatrix.copy(silMatrixOf(to)); }
        updateMatrices();
        if (zap) { strike(to, 1, 0.3); hooks.onForgeStrike?.(0.8); }
        if (element === 'ice') { cocoonT = 0; hooks.onForgeStrike?.(0.4); } // the cocoon cracks off
        hooks.onFormed?.();
        next('hold', t - D.form);
      }
    } else if (phase === 'hold') {
      hooks.onHold?.(t, dt);
    }
  }

  return {
    /** Where the forge is: dissolve | swirl | gather | form | hold | idle. */
    get phase() { return phase; },
    /** Seconds into the phase. */
    get t() { return t; },
    get from() { return from; },
    get to() { return to; },
    get element() { return element; },
    /** The new colors ([lo, mid, hi, core] THREE.Colors): a held weapon's aura burns in them. */
    get colorsTo() { return rampNew; },
    /** Seconds from begin() to the end of the form, at pace 1. */
    formedAt: FORGE + D.form,
    /**
     * Set up: `from` (or null: nothing burns away) becomes `to`, after `element`'s ways, in
     * `fromRamp` → `toRamp`'s colors ([lo, mid, hi, core] sRGB hexes). Then the owner places
     * `to` (its own random draws come first) and calls start().
     */
    begin({ from: a, to: b, fromRamp, toRamp, element: el = 'fire' }) {
      element = el;
      from = a;
      to = b;
      // Ice's edge is frost (the ramp's pale end); fire's and lightning's burn in the body and bright tones.
      const e = element === 'ice' ? 2 : 1;
      edgeOld.set(fromRamp[e]);
      edgeOldHot.set(fromRamp[e + 1]);
      edgeNew.set(toRamp[e]);
      edgeNewHot.set(toRamp[e + 1]);
      particles.points.material = materials?.[element] ?? particleMaterial ?? particles.points.material;
      strikeT = -1;
      rampOld.length = 0; rampNew.length = 0;
      fromRamp.forEach((h) => rampOld.push(new THREE.Color(h)));
      toRamp.forEach((h) => rampNew.push(new THREE.Color(h)));
      return this;
    },
    /** Go: the dissolve begins. `onStart` runs just before lightning's opening strike (the owner's own start hook). */
    start({ onStart = null } = {}) {
      const up = to.formsUp ?? element === 'ice';
      to.uniforms.uFlip.value = up ? 1 : 0;
      to.uniforms.uFrost.value = 0;
      if (from) {
        from.uniforms.uFrost.value = 0;
        from.uniforms.uFrostColor.value.copy(rampNew[3]);
      }
      phase = 'dissolve';
      t = 0;
      elapsed = 0;
      burstT = -1;
      fx?.clear();
      shattered = false;
      formSteps = 0;
      cocoonT = -1;
      if (from) from.ghost(true);
      particles.begin(from?.heights, to.heights, D.dissolve, edgeAt, {
        // Ice: everything breaks off at once when the frozen subject shatters.
        releaseAt: element === 'ice' ? () => SHATTER + Math.random() * 0.06 : null,
        flipNew: up,
      });
      helixSpin = Math.random() * Math.PI * 2;
      if (element === 'ice') buildCocoon();
      onStart?.();
      // Lightning opens with a bolt out of the sky into the old subject.
      if (element === 'lightning' && from) {
        updateMatrices();
        strike(from, 0.55, 0.22);
        hooks.onForgeStrike?.(0.6);
      }
    },
    step,
    stepElement,
    stepLines,
    /** The hold is over (the owner's call): the forge is idle, its echo and a strike finish on their own. */
    finish() { phase = 'idle'; },
    /** Done with the subjects (the weapon has landed): nothing more is drawn round them. */
    forget() { from = null; to = null; },
    /** Stop everything at once. */
    cancel() {
      phase = 'idle';
      particles.clear();
      burstT = -1;
      fx?.clear();
      strikeT = -1;
      cocoonT = -1;
      groundArcT = -1;
      arcs?.clear();
      from = null;
      to = null;
    },
    /** Clear the lines (the helix and any echo). */
    clearLines() { burstT = -1; fx?.clear(); },
    /** Lines still drawing (an echo) or arcs (a strike, the cocoon cracking off). */
    get busy() { return phase !== 'idle' || burstT >= 0 || strikeT >= 0 || cocoonT >= 0; },
    /** An echo of `subject`'s silhouette bursts out of it, in `ramp`'s colors, after `el`'s ways. */
    echo(subject, ramp, el = 'fire') {
      burstEl = el;
      const sil = subject.silhouette();
      rampNew.length = 0;
      ramp.forEach((h) => rampNew.push(new THREE.Color(h)));
      updateMatrices();
      burstT = 0;
      burstSil = sil;
      burstMatrix.copy(silMatrixOf(subject));
    },
    /** A bolt out of the sky into `subject` at height `s` (lightning's), `len` s long. */
    strike,
    /** A subject's silhouette from triangles in its own space ([mesh, matrix] pairs: forgeFx.js). */
    silhouetteOf: (toRoot, cell) => weaponSilhouette(toRoot, cell),
  };
}
