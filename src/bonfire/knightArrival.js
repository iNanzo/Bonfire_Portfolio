// The site's knight comes and goes (scene.js wires it up; knights.js places and poses him):
//   away      he isn't there: his summon sign glows on the ground in front of his seat
//             (summonSign.js), and a click on it (or the pack) summons him
//   arriving  the sign burns away and its soul becomes him, in the current element's own way:
//             the weapon swap's forge (forgeRun.js) with the sign as the old weapon and his
//             posed body as the new one. Fire: embers rise off the strokes in a ripple, wind
//             round him in a helix and build him from his boots up in ember edges. Lightning:
//             a bolt out of the sky strikes the sign, which strobes and crackles apart, arcs
//             leap from the charging cloud to the ground, he forms in five jumps, each a flash,
//             and a bolt strikes his helm. Ice: frost creeps up the sign and it shatters, a
//             slow hexagonal helix gathers the shards, he grows from his boots up inside a
//             cocoon of crystals that cracks off him. (~3.5 s, like a swap.)
//   resting   he rests by the fire a while (effects.knight.rest: [min, max] s, rolled on each
//             arrival; the visitor doing something with him tops it up to a minute at least:
//             extendRest), then, once he's done with whatever he's doing (a gesture, the dance,
//             a new helmet or style: `busy`; BUSY_HOLD s past the end of his rest at most),
//   leaving   he burns away into the sign, the same forge the other way: he's the old weapon,
//             the sign forms again under a helix winding down onto its strokes, and relights.
//             The pack can send him off sooner (dismiss).
// Arrival 'start' (effects.knight.arrival): he's there from the first frame, as before, and
// stays until sent off (no rest runs out). Reduced motion: he appears and goes at once. A new
// scenery while he's coming or going finishes that at once (he forms at the new seat, or is
// gone and the sign waits there). His own particles, lines and arcs (the weapon's may be
// busy forging), named for the breakdown's counts.
import * as THREE from 'three';
import { createForgeParticles } from './forgeParticles.js';
import { createForgeFx } from './forgeFx.js';
import { createBoltLines } from './bolts.js';
import { createForgeRun } from './forgeRun.js';

/** The forge's phases for him (s): a swap's, the form a little slower (there's more of him). */
export const ARRIVAL_TIMES = { dissolve: 1.2, swirl: 0.3, gather: 0.6, form: 1.15, hold: 0.4 };
/** How long he rests by default (s): [min, max], rolled on each arrival. */
export const REST = [180, 300];
/** How long (s) past the end of his rest he may stay to finish what he's doing (`busy`). */
export const BUSY_HOLD = 15;
/** The presence states, in order. */
export const PRESENCE = ['away', 'arriving', 'resting', 'leaving'];

/**
 * @param {object} o
 * @param {object} o.knights      createKnights(): knight 0 is the one who comes and goes
 * @param {object} o.sign         createSummonSign()
 * @param {THREE.Material} o.particleMaterial  the forge particles' material (and the lines')
 * @param {{ [element: string]: THREE.Material }} [o.materials]  the particles' material per element
 * @param {number} o.layerFx
 * @param {object} o.field        the bonfire's curl noise
 * @param {THREE.Vector3} o.anchor  the fire's anchor (the field's origin)
 * @param {number} o.count        particles (the weapon forge's count)
 * @param {boolean} [o.reducedMotion]
 * @param {() => { element: string, ramp: string[] }} o.now  the element and the flame's ramp now
 * @param {() => number[]} [o.rest]  [min, max] s he rests (read on each arrival; an end that
 *   isn't a number: REST's)
 * @param {() => boolean} [o.busy]  he's in the middle of something (a gesture, a new helmet):
 *   his rest running out waits for it to end (BUSY_HOLD s at most)
 * @param {object} [o.hooks]      onForgeStrike(weight), onFormed(which: 'knight' | 'sign')
 */
export function createKnightArrival({ knights, sign, particleMaterial, materials = null, layerFx, field, anchor, count, reducedMotion = false, now, rest = () => REST, busy = () => false, hooks = {} }) {
  const N = reducedMotion ? 0 : count;
  const forge = createForgeParticles({ count: N, material: particleMaterial, layer: layerFx, field, anchor });
  forge.points.name = 'Summoning (the knight)';
  const fx = N ? createForgeFx(particleMaterial, field.noise) : null;
  if (fx) fx.lines.layers.set(layerFx);
  const arcs = N ? createBoltLines(particleMaterial, 220, 96) : null;
  if (arcs) for (const o of arcs.objects) o.layers.set(layerFx);

  let clock = 0;
  let presence = 'away';
  let restLeft = 0;
  let resting = true;   // (whether his rest runs out: 'sign'; 'start' keeps him)
  let allowed = true;   // effects.knight.show
  const listeners = new Set();
  let signSubject = null;
  const anchorWorld = new THREE.Vector3();

  function set(p) {
    if (p === presence) return;
    presence = p;
    for (const fn of listeners) fn(p);
  }
  function rollRest() {
    // (Either end not given: the default's.)
    const [a, b] = (rest() ?? REST).map((v, i) => (Number.isFinite(v) ? v : REST[i]));
    const lo = Math.max(1, Math.min(a, b)), hi = Math.max(a, b);
    restLeft = lo + Math.random() * (hi - lo);
  }

  const run = createForgeRun({
    particles: forge, fx, arcs, materials, particleMaterial, times: ARRIVAL_TIMES, reducedMotion,
    clock: () => clock,
    groundPoint: (rng, out) => {
      anchorWorld.copy(anchor);
      const a = rng() * Math.PI * 2, r = 0.45 + rng() * 0.35;
      return out.set(anchorWorld.x + Math.cos(a) * r, 0.12 + rng() * 0.14, anchorWorld.z + Math.sin(a) * r);
    },
    hooks: {
      updateMatrices: () => { knights.group.updateMatrixWorld(true); sign.group.updateMatrixWorld(true); },
      onForgeStrike: (w) => hooks.onForgeStrike?.(w * 0.7),
      onFormed: () => hooks.onFormed?.(presence === 'arriving' ? 'knight' : 'sign'),
      // Formed: the sign flashes in the edge's color and settles (he's swept by the fire's
      // reflection instead: onFormed).
      onHold: (t) => {
        const k = Math.min(1, t / ARRIVAL_TIMES.hold);
        if (run.to.formGlow !== false) run.to.uniforms.uGlow.value = 1.2 * (1 - k) ** 2;
        if (t >= ARRIVAL_TIMES.hold) done();
      },
    },
  });

  /** The forge's end: he's here (resting), or gone and the sign lit (away). */
  function done() {
    run.finish();
    run.forget();
    if (presence === 'arriving') {
      knights.forged(0);
      sign.mode = 'off';
      if (resting) rollRest();
      set('resting');
    } else if (presence === 'leaving') {
      knights.forged(0);
      sign.mode = 'lit';
      set('away');
    }
  }
  /** Whatever the forge is doing, done now (a new scenery, a setting changed). */
  function finishNow() {
    if (presence !== 'arriving' && presence !== 'leaving') return;
    run.cancel();
    done();
  }

  /**
   * Bring him (he's away): through the forge from the sign, or at once (`instant`, reduced
   * motion). False if he isn't away or isn't allowed.
   */
  function summon({ instant = false } = {}) {
    if (presence !== 'away' || !allowed) return false;
    if (instant || !N) {
      knights.summon(0, { instant: true });
      sign.mode = 'off';
      if (resting) rollRest();
      set('resting');
      return true;
    }
    const { element, ramp } = now();
    if (!knights.summon(0, { forge: true })) return false;
    knights.group.updateMatrixWorld(true);
    signSubject ??= sign.subject(N);
    sign.mode = 'forge';
    set('arriving');
    run.begin({ from: signSubject, to: knights.forgeSubject(0, N), fromRamp: ramp, toRamp: ramp, element });
    run.start();
    return true;
  }
  /**
   * Send him off (he's resting; arriving, he finishes first): he burns away into the sign, or
   * goes at once (`instant`). False if he's away or leaving already.
   */
  function dismiss({ instant = false } = {}) {
    if (presence === 'away' || presence === 'leaving') return false;
    if (presence === 'arriving') finishNow();
    if (instant || !N) {
      knights.dismiss(0, { instant: true });
      sign.mode = allowed ? 'lit' : 'off';
      set('away');
      return true;
    }
    const { element, ramp } = now();
    knights.group.updateMatrixWorld(true);
    const him = knights.forgeSubject(0, N);
    knights.dismiss(0, { forge: true });
    signSubject ??= sign.subject(N);
    sign.mode = 'forge';
    sign.uniforms.uDissolve.value = 1; // (hidden until it forms)
    sign.uniforms.uGlow.value = 0;
    set('leaving');
    run.begin({ from: him, to: signSubject, fromRamp: ramp, toRamp: ramp, element });
    run.start();
    return true;
  }

  return {
    /** Everything to add to the scene (the fx layer): the particles, the lines, the arcs. */
    objects: [forge.points, ...(fx ? [fx.lines] : []), ...(arcs?.objects ?? [])],
    get presence() { return presence; },
    /** Seconds of his rest left (while resting and it runs out), else Infinity. */
    get restLeft() { return presence === 'resting' && resting ? restLeft : Infinity; },
    /** Call `fn(presence)` whenever it changes. Returns an unsubscribe. */
    onPresence(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    summon,
    dismiss,
    /** Whether he's allowed at all (effects.knight.show): not, he goes at once and the sign with him. */
    set allowed(on) {
      on = !!on;
      if (on === allowed) return;
      allowed = on;
      if (!on) { finishNow(); if (presence !== 'away') { knights.dismiss(0, { instant: true }); set('away'); } sign.mode = 'off'; }
      else if (presence === 'away') sign.mode = 'lit';
    },
    get allowed() { return allowed; },
    /** Whether his rest runs out ('sign': he leaves after it) or he stays until sent off ('start'). */
    set resting(on) {
      on = !!on;
      if (on === resting) return;
      resting = on;
      if (on && presence === 'resting') rollRest();
    },
    /** A new scenery (the sign's `place` there): whatever was under way finishes now. */
    setScenery(place) {
      finishNow();
      sign.place(place);
      sign.mode = presence === 'away' && allowed ? 'lit' : 'off';
    },
    /** Each frame (`dt` s of simulation time). */
    update(dt) {
      clock += dt;
      run.stepLines(dt);
      run.stepElement(dt);
      run.step(dt);
      sign.update(dt);
      // His rest over, he leaves once he's done with what he's doing (not mid-gesture).
      if (presence === 'resting' && resting && (restLeft -= dt) <= 0 && (restLeft < -BUSY_HOLD || !busy())) dismiss();
    },
    /** Shorten (or lengthen) the rest under way (s): for tests and the admin preview. */
    set restLeft(s) { restLeft = s; },
    /**
     * The visitor is doing something with him (a gesture from the pack, a click on him, a new
     * helmet): his rest under way is topped up to at least `s` seconds, so he doesn't leave
     * right after.
     */
    extendRest(s = 60) { if (presence === 'resting' && resting) restLeft = Math.max(restLeft, s); },
    /** Moving (the shadow's worth redrawing): he's being forged. */
    get busy() { return run.busy; },
  };
}
