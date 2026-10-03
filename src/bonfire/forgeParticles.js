// @ts-nocheck: 3 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The forge particles (weapons.js): the soul of the old weapon becoming the new one.
//
//   forge  shed by the old weapon's dissolving edge, they drift out a little, then a
//          rotating double helix around the new weapon's axis takes them over (each
//          particle keeps its target's height, so the helix spans the blade). In the
//          gather the helix tightens and spins faster as it collapses onto the new
//          weapon's surface; in the form each particle dither-fades as the forming edge
//          reaches it. Curl noise from the bonfire keeps a shimmer on all of it. Size and
//          transparency follow the fire's own simplex noise where each particle is
//          (coherent pockets, not per-particle static): hot flickers are small and solid,
//          cooler wisps larger and fainter.
//   aura   (the visualizer) while a formed weapon is held over the fire waiting for the
//          drop, the particles become a vortex around it: three strands winding up the
//          blade and turning together (a structure reads at pixel scale where a cloud
//          wouldn't), with sparks falling in from further out, as if it's drawing the
//          fire's energy in. The charge tightens and speeds it; a beat pushes it out for
//          a moment. It takes after the element the blade will strike with.
//   fling  on release the whole vortex is flung outward as the blade strikes.
//
// The forge takes after the element being forged (the swap's `element`): fire's
// particles drift and flicker as above; lightning's crackle, snapping about and blinking
// out, mostly white-hot; ice's fall like chips as they're shed, before the helix takes
// them, and each one glints as it freezes onto the new blade.
//
// forgeRun.js runs the choreography and hands each step what it needs (the phase's
// progress, the old and new subjects, their colors); weapons.js runs the aura and the
// fling. The weapons are its subjects, and so are the knight and his summon sign
// (knightArrival.js): anything with surface samples, their heights and a span to wind a
// helix round (a subject can have its own helix radius, `helixWide`).
import * as THREE from 'three';
import { smoothstep } from '../math.js';
import { createPoints, markDirty } from './points.js';
import { iceGlint } from './signatures.js';

/** Turns of the forge helix along the blade (the forge lines trace it too). */
export const HELIX_TURNS = 1.5;
/** The helix's radius at height s (0 point → 1 pommel): a spindle, widest mid-blade. */
export const helixWide = (s) => 0.19 + 0.15 * Math.sin(Math.PI * s);
const AURA_TURNS = 2.2;
const infalling = (i) => i % 4 === 0;

/**
 * @param {object} o
 * @param {number} o.count     particles (0: none, e.g. reduced motion)
 * @param {THREE.Material} o.material
 * @param {number} o.layer     render layer
 * @param {object} o.field     the bonfire's curl noise (curl.js)
 * @param {THREE.Vector3} o.anchor  where weapons enter the ground (the field's origin)
 */
export function createForgeParticles({ count, material, layer, field, anchor }) {
  const N = count;
  const M = Math.max(1, N);
  const points = createPoints(M, material);
  points.layers.set(layer);
  const attrs = points.geometry.attributes;
  const FP = attrs.position.array;
  const FC = attrs.color.array;
  const FS = attrs.size.array;
  const FA = attrs.alpha.array;
  const FV = new Float32Array(M * 3);
  const release = new Float32Array(M); // when the dissolving edge sheds it
  const fadeAt = new Float32Array(M); // uDissolve at which the forming edge reaches its target
  const born = new Float32Array(M);
  const state = new Uint8Array(M); // 0 idle, 1 free, 2 absorbed
  const heat = new Float32Array(M); // flicker phase
  const grain = new Float32Array(M); // base size: many fine specks, some mid, rare wisps
  const hAng = new Float32Array(M); // helix: strand angle + jitter
  const hRad = new Float32Array(M); // helix: radial jitter (strand thickness)
  const auraS = new Float32Array(M); // aura: height along the blade, 0..1
  const auraR = new Float32Array(M); // aura: radius
  let auraOn = false;
  let auraSpin = 0;
  let flingT = -1;

  const vA = new THREE.Vector3();
  const vH = new THREE.Vector3();
  const vT = new THREE.Vector3();
  const col = new THREE.Color();

  /** Sample i of a forge subject (forgeRun.js ForgeSubject), in world space. */
  function worldSample(subject, i, out) {
    const s = subject.samples;
    return out.set(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]).applyMatrix4(subject.matrixWorld);
  }
  /** Particle i's slot on the double helix around the subject's axis (world). */
  function helixSlot(to, i, spin, shrink, out) {
    const span = to.span;
    const s = to.heights[i];
    const len = span.y - span.x;
    const a = hAng[i] + s * HELIX_TURNS * Math.PI * 2 + spin;
    const r = ((to.helixWide ?? helixWide)(s) + hRad[i]) * (1 - shrink);
    return out.set(Math.cos(a) * r, span.x + s * len, Math.sin(a) * r).applyMatrix4(to.matrixWorld);
  }

  /** Hide them all and stop the aura and a fling. */
  function clear() {
    auraOn = false;
    flingT = -1;
    FS.fill(0);
    state.fill(2);
    attrs.size.needsUpdate = true;
  }

  return {
    points,
    /** The aura is running. */
    get aura() {
      return auraOn;
    },
    clear,
    /**
     * A swap begins: when each particle is shed (by the old weapon's dissolving edge,
     * point first, over `dissolveTime`), where the forming edge fades it, and its look.
     * `oldHeights`/`newHeights`: each surface sample's height up its weapon (0..1).
     * `releaseAt(i)`: when particle i is shed instead (ice: all at once, as the blade
     * shatters); `flipNew`: the new weapon forms from its point up (ice), not its pommel down.
     */
    begin(oldHeights, newHeights, dissolveTime, edgeAt, { releaseAt = null, flipNew = false } = {}) {
      clear();
      for (let i = 0; i < N; i++) {
        state[i] = 0;
        const u = edgeAt(oldHeights ? oldHeights[i] : Math.random(), (Math.random() - 0.5) * 0.4);
        release[i] = releaseAt ? releaseAt(i) : dissolveTime * (0.08 + 0.92 * u);
        fadeAt[i] = edgeAt(flipNew ? 1 - newHeights[i] : newHeights[i], (Math.random() - 0.5) * 0.4);
        heat[i] = Math.random();
        const g = Math.random();
        grain[i] = g < 0.6 ? 0.72 : g < 0.9 ? 1.25 : 1.85;
        hAng[i] = (i & 1) * Math.PI + (Math.random() - 0.5) * 0.35;
        hRad[i] = (Math.random() - 0.5) * 0.08;
      }
    },
    /**
     * The forge (dissolve → swirl → gather → form). c: { shedUntil (the dissolve's time,
     * or -1 once it's over), gather 0..1 (the helix collapsing), forming, formU (the
     * forming edge), pulling (gather or form: the helix grips harder), blend 0..1 (old
     * colors → new), spin (the helix's turn), from, to (forge subjects, forgeRun.js: their
     * samples, heights, span and world matrix), time, colorsFrom, colorsTo ([lo, mid, hi,
     * core] colors), element ('fire' | 'lightning' | 'ice') }.
     */
    step(dt, c) {
      if (!N) return;
      const zap = c.element === 'lightning';
      const ice = c.element === 'ice';
      const k = c.gather;
      const shrink = 0.85 * smoothstep(0, 1, k);
      const onSurface = smoothstep(0.25, 1, k);
      const rate = c.pulling ? 4 + 14 * k * k : 5;
      const shimmer = 0.015 + 0.04 * (1 - k);
      const time = c.time;
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        if (state[i] === 0) {
          if (c.shedUntil >= release[i] && c.from) {
            worldSample(c.from, i, vA);
            FP[ix] = vA.x;
            FP[ix + 1] = vA.y;
            FP[ix + 2] = vA.z;
            if (ice) {
              // A shard of the shattered blade: flung out from its axis, up a little, then falling.
              vT.setFromMatrixPosition(c.from.matrixWorld);
              const ox = vA.x - vT.x,
                oz = vA.z - vT.z;
              const ol = Math.hypot(ox, oz) || 1;
              const sp = 0.8 + Math.random() * 1.4;
              FV[ix] = (ox / ol) * sp + (Math.random() - 0.5) * 0.6;
              FV[ix + 1] = 0.3 + Math.random() * 0.9;
              FV[ix + 2] = (oz / ol) * sp + (Math.random() - 0.5) * 0.6;
            } else {
              FV[ix] = (Math.random() - 0.5) * 0.5;
              FV[ix + 1] = 0.2 + Math.random() * 0.3;
              FV[ix + 2] = (Math.random() - 0.5) * 0.5;
            }
            born[i] = time;
            state[i] = 1;
          } else {
            FS[i] = 0;
            continue;
          }
        }
        if (state[i] === 2) {
          FS[i] = 0;
          continue;
        }
        const fade = c.forming ? smoothstep(fadeAt[i] - 0.06, fadeAt[i] + 0.1, c.formU) : 1;
        if (fade <= 0.01) {
          state[i] = 2;
          FS[i] = 0;
          continue;
        }
        const n = field.fire(FP[ix] - anchor.x, FP[ix + 1], FP[ix + 2] - anchor.z, time);
        // A subtle drift from where it was shed (ice: a chip's fall)...
        const drag = Math.exp(-dt * (ice ? 1.2 : 2.2));
        FV[ix] = (FV[ix] + n.x * 0.5 * dt) * drag;
        FV[ix + 1] = (FV[ix + 1] + n.y * 0.3 * dt) * drag - (ice ? 3.4 * dt : 0);
        FV[ix + 2] = (FV[ix + 2] + n.z * 0.5 * dt) * drag;
        FP[ix] += FV[ix] * dt;
        FP[ix + 1] += FV[ix + 1] * dt;
        FP[ix + 2] += FV[ix + 2] * dt;
        // ...until the helix takes it (fully by ~0.65 s after it was shed), collapsing onto
        // the new weapon's surface through the gather.
        helixSlot(c.to, i, c.spin, shrink, vH);
        if (onSurface > 0) vH.lerp(worldSample(c.to, i, vT), onSurface);
        vH.x += n.x * shimmer;
        vH.y += n.y * shimmer;
        vH.z += n.z * shimmer;
        // (Ice shards fly and fall for a moment before the helix catches them.)
        const grip = k > 0 ? 1 : ice ? smoothstep(0.45, 1.05, time - born[i]) : smoothstep(0.12, 0.65, time - born[i]);
        const pull = (1 - Math.exp(-dt * rate)) * grip;
        FP[ix] += (vH.x - FP[ix]) * pull;
        FP[ix + 1] += (vH.y - FP[ix + 1]) * pull;
        FP[ix + 2] += (vH.z - FP[ix + 2]) * pull;
        // Lightning: a spark snaps sideways now and then (the helix pulls it back in).
        if (zap && Math.random() < dt * 14) {
          FP[ix] += (Math.random() - 0.5) * 0.06;
          FP[ix + 1] += (Math.random() - 0.5) * 0.04;
          FP[ix + 2] += (Math.random() - 0.5) * 0.06;
        }
        // Vibrant, flickering flame colors turning from the current flame to the next:
        // mostly the saturated body tone, with bright flickers (lightning: mostly white-hot;
        // ice: pale, with a glint now and then).
        const flick = (Math.sin(time * 23 + heat[i] * 40) + 1) * 0.5;
        const glint = ice && (iceGlint(time * 3, i) || (c.forming && fade < 0.9));
        const hot = zap ? flick > 0.35 : ice ? glint : flick > 0.72;
        const lo = zap || ice ? 2 : 1;
        col
          .copy(c.colorsFrom[hot ? lo + 1 : lo])
          .lerp(c.colorsTo[hot ? lo + 1 : lo], c.blend)
          .multiplyScalar((ice ? 0.6 : 0.75) + flick * 0.25);
        FC[ix] = col.r;
        FC[ix + 1] = col.g;
        FC[ix + 2] = col.b;

        const age = time - born[i];
        const pocket =
          0.5 + 0.5 * field.noise.noise3d(FP[ix] * 2.8, FP[ix + 1] * 2.8 - time * 1.1, FP[ix + 2] * 2.8 + heat[i] * 5);
        // Blooms as it's shed, tightens to fine points as the silhouette gathers.
        let size =
          grain[i] * (0.7 + 0.6 * pocket) * Math.min(1, 0.4 + age * 2.5) * (1 - 0.35 * k) * (0.75 + 0.25 * fade);
        let alpha = (0.35 + 0.65 * pocket) * Math.min(1, age * 6) * (0.75 + 0.25 * k);
        if (hot) {
          size *= 0.75;
          alpha = Math.max(alpha, 0.9);
        }
        if (glint)
          size = 2.2; // freezing onto the blade: a diamond's flash
        else if (ice && k === 0) size *= 1.35; // shards, not motes
        FS[i] = zap && Math.random() < 0.25 ? 0 : size; // lightning blinks
        FA[i] = alpha * fade;
      }
      markDirty(points);
    },
    /** The aura begins around a held weapon (`time`: the weapons' clock). */
    startAura(time) {
      auraOn = true;
      for (let i = 0; i < N; i++) {
        auraS[i] = Math.random();
        auraR[i] = infalling(i) ? 0.35 + Math.random() * 0.4 : 0.1 + Math.random() * 0.05;
        // Orbiters: which of the three strands (plus a little spread); infallers: anywhere.
        hAng[i] = infalling(i)
          ? Math.random() * Math.PI * 2
          : ((i % 3) * Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.4;
        heat[i] = Math.random();
        born[i] = time - Math.random();
        state[i] = 1;
      }
    },
    /** c: { blade (the held weapon), time, charge 0..1, kick 0..1 (a beat), element, colors }. */
    stepAura(dt, c) {
      if (!N || !c.blade) return;
      const span = c.blade.userData.uniforms.uSpan.value;
      const len = span.y - span.x;
      const { charge, kick, time } = c;
      const zap = c.element === 'lightning';
      const ice = c.element === 'ice';
      auraSpin += dt * (2 + 6 * charge + 10 * kick) * (ice ? 0.45 : 1);
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        const infall = infalling(i);
        if (infall) {
          // Falling in from further out, faster the harder it charges.
          auraR[i] -= dt * (0.12 + 0.5 * charge) * (0.5 + heat[i]);
          auraS[i] += (0.5 - auraS[i]) * dt * 0.3;
          if (auraR[i] < 0.04) {
            auraR[i] = 0.4 + Math.random() * 0.4;
            auraS[i] = Math.random();
            born[i] = time;
          }
          hAng[i] += (dt * (1.5 + 4 * charge)) / Math.max(0.3, auraR[i] * 6);
        } else {
          // Spiraling up the blade from the point, starting over when it reaches the top.
          auraS[i] += dt * (0.12 + 0.45 * charge) * (0.6 + heat[i] * 0.8);
          if (auraS[i] > 1) {
            auraS[i] -= 1;
            born[i] = time;
          }
        }
        const s = auraS[i];
        const a = infall ? hAng[i] : hAng[i] + s * AURA_TURNS * Math.PI * 2 + auraSpin;
        let r =
          (infall ? auraR[i] : auraR[i] * (1 - 0.35 * charge) * (0.75 + 0.45 * Math.sin(Math.PI * s))) +
          kick * (infall ? 0.05 : 0.2);
        if (zap) r += (Math.random() - 0.5) * 0.05; // lightning: the strands crackle
        vH.set(
          Math.cos(a) * r,
          span.x + s * len + (zap ? (Math.random() - 0.5) * 0.03 : 0),
          Math.sin(a) * r,
        ).applyMatrix4(c.blade.matrixWorld);
        const n = field.fire(vH.x - anchor.x, vH.y, vH.z - anchor.z, time);
        FP[ix] = vH.x + n.x * 0.03;
        FP[ix + 1] = vH.y + n.y * 0.03;
        FP[ix + 2] = vH.z + n.z * 0.03;
        const flick = (Math.sin(time * 23 + heat[i] * 40) + 1) * 0.5;
        const hot = flick > 0.7 || kick > 0.5 * heat[i] + 0.3;
        // Fire: flickering body and bright tones. Lightning: white-hot, blinking. Frost: pale glints.
        const tone = zap ? (hot || flick > 0.4 ? 3 : 2) : ice ? (flick > 0.8 ? 3 : 2) : hot ? 3 : flick > 0.35 ? 2 : 1;
        col.copy(c.colors[tone]).multiplyScalar((ice ? 0.45 + 0.4 * flick : 0.6 + 0.4 * flick) + 0.4 * kick);
        FC[ix] = col.r;
        FC[ix + 1] = col.g;
        FC[ix + 2] = col.b;
        const ends = Math.min(1, s * 6, (1 - s) * 5) * Math.min(1, (time - born[i]) * 4);
        FS[i] =
          zap && Math.random() < 0.3
            ? 0
            : grain[i] * (hot ? 0.8 : 1.1) * (1 + kick * 0.6) * (ice && flick > 0.8 ? 1.4 : 1);
        FA[i] = (0.45 + 0.55 * flick) * (infall ? 0.7 : 1) * Math.max(0, ends);
      }
      markDirty(points);
    },
    /** The blade strikes: every aura particle flies outward from its axis (`frame`: its world matrix). */
    fling(frame) {
      auraOn = false;
      flingT = 0;
      const axis = vT.set(0, 1, 0).transformDirection(frame);
      const center = vA.setFromMatrixPosition(frame);
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        vH.set(FP[ix] - center.x, FP[ix + 1] - center.y, FP[ix + 2] - center.z);
        vH.addScaledVector(axis, -vH.dot(axis)); // away from the blade's axis
        if (vH.lengthSq() < 1e-6) vH.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        vH.normalize().multiplyScalar(1.6 + Math.random() * 2.6);
        FV[ix] = vH.x;
        FV[ix + 1] = vH.y + (Math.random() - 0.2) * 1.2;
        FV[ix + 2] = vH.z;
      }
    },
    /** A fling in progress: out, falling, burning away over 0.7 s. */
    stepFling(dt) {
      if (flingT < 0) return;
      flingT += dt;
      const k = flingT / 0.7;
      if (k >= 1 || !N) {
        flingT = -1;
        FS.fill(0);
        attrs.size.needsUpdate = true;
        return;
      }
      const drag = Math.exp(-dt * 3);
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        FV[ix] *= drag;
        FV[ix + 1] = FV[ix + 1] * drag - dt * 1.5;
        FV[ix + 2] *= drag;
        FP[ix] += FV[ix] * dt;
        FP[ix + 1] += FV[ix + 1] * dt;
        FP[ix + 2] += FV[ix + 2] * dt;
        FA[i] = (1 - k) * (0.5 + 0.5 * heat[i]);
        FS[i] = grain[i] * (1.3 - 0.5 * k);
      }
      attrs.position.needsUpdate = true;
      attrs.size.needsUpdate = true;
      attrs.alpha.needsUpdate = true;
    },
  };
}
