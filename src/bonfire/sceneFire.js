// The fire's moments: a stoke, a puff from the UI, a weapon's impact and its new flame, a
// beat, the element's ring racing out across the ground, lightning reaching for a firefly,
// the living blade's routines and the flames it knocks along; and what each feels like.
//
// Hits have weight (effects.impact): a big one freezes the simulation for a few frames
// (hit-stop, repaid afterwards so the music's timing holds), flashes the frame toward the
// core color, adds camera trauma (view.js), throws debris that bounces off the scenery
// (debris.js) and leaves a mark on the ground that fades (marks.js). While lots is going
// on, the background extras thin out (`busy`) so the main hit reads.
import * as THREE from 'three';
import { effects } from '../effects.js';
import { elementOr } from '../elements.js';
import { flames } from '../palette.js';
import { FIRE_ORIGIN, flameShare, lightMix } from './sceneContext.js';

/**
 * The fire's hits and moments.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneFire(ctx) {
  const { scope, reducedMotion, jolt, onImpact, view, fire, plasma, crystals, marks, debris, armor } = ctx;
  // --- Hit feel. `busy` (0..1) rises with every big moment and drains over a second or
  // so; `ambient()` is how much of the background extras to keep (see the header).
  ctx.busy = 0;
  ctx.hitStop = 0; // seconds of freeze left
  ctx.timeDebt = 0; // frozen time still to be repaid
  ctx.simT = 0; // the simulation's clock (real time minus the freezes still owed)
  ctx.flashAmt = 0; // the impact flash, 0..1
  let lastFlash = -1;
  ctx.strikeAt = -1; // (simulation time) a firefly strike waiting for the ball to grow in
  const ambient = () => 1 - ctx.busy * effects.impact.budget;
  /**
   * A hit: `weight` 0..1 (a flick ... a weapon landing). Freezes, flashes (at most a couple
   * a second), adds camera trauma and makes the scene busy.
   */
  function hit(weight, { freeze = true, flash = true, shake = true } = {}) {
    const I = effects.impact;
    ctx.busy = Math.min(1, ctx.busy + weight * 0.8);
    if (shake) jolt(0.3 * weight);
    if (reducedMotion) return;
    if (freeze && I.hitStop > 0) ctx.hitStop = Math.max(ctx.hitStop, I.hitStop * weight);
    const now = performance.now() / 1000;
    if (flash && I.flash > 0 && weight >= 0.5 && now - lastFlash > 0.45) {
      ctx.flashAmt = Math.max(ctx.flashAmt, I.flash * weight);
      lastFlash = now;
    }
  }
  const rampNow = () => ctx.currentRamp.map((h) => new THREE.Color(h));
  /** Mark the ground and throw debris for the current element at (x, z). `size` 0..1+. */
  function scar(x, z, size = 1, { ring = false } = {}) {
    if (!ctx.ready) return;
    const kind = ctx.elementKey;
    const colors = rampNow();
    marks.stamp(kind, x, z, ring ? 1.5 : 0.22 + 0.18 * size, colors, { strength: Math.min(1, 0.6 + 0.4 * size), ring });
    const n = Math.round((kind === 'lightning' ? 16 : 10) * size * effects.impact.debris);
    if (n > 0 && !ring) {
      const d = debris[kind];
      d.setRamp(colors);
      d.throw(x, (ctx.terrainTop?.(x, z) ?? 0) + 0.08, z, n, { power: 0.6 + 0.5 * size });
    }
  }

  // --- Fire level (stoking, UI puffs, weapon impacts)
  let firstStoke = true;
  function stoke() {
    fire.params.level = Math.min(2.4, fire.params.level + effects.fire.stoke);
    fire.burst(Math.min(1.5, effects.fire.stoke / 0.9));
    if (ctx.elementKey === 'lightning') {
      plasma.discharge(0.5);
      ctx.zap?.crackle(0.35, 3);
    }
    if (ctx.elementKey === 'ice') {
      crystals.burst(0.6);
      crystals.beat(0.8);
      crystals.echo();
    }
    // Every stoke throws a smaller ring of the element too (skipped under reduced motion).
    ring(0.6, { quiet: true });
    ctx.weapons?.beat(1); // the planted weapon shudders
    hit(0.4, { freeze: false });
    // Lightning reaches for the nearest firefly.
    if (ctx.elementKey === 'lightning') strikeFirefly(1);
    ctx.reactKnights('stoke');
    armor.flare(1); // (the flare's reflection sweeps across the knights' armor)
    const wasFirst = firstStoke;
    firstStoke = false;
    return wasFirst;
  }
  function puff(amount = 0.3) {
    fire.params.level = Math.min(2, fire.params.level + amount);
    fire.burst(amount * 0.5);
  }
  function impact(selection, weaponKey, stationary = false) {
    const nextFlame = selection.flame;
    const old = ctx.flameKey;
    ctx.flameKey = nextFlame ?? ctx.flameKey;
    ctx.blend = { from: old, to: ctx.flameKey, t: 0 };
    ctx.forgeFlame = null;
    const ramp = flames[ctx.flameKey].ramp;
    for (const r of [ctx.fx, ctx.zap, ctx.frostRing]) r.setRamp(ramp);
    ctx.weapons.setRim(ramp[2]); // the new weapon arrives rimmed in its new color
    // The bonfire takes the new element. The fire erupts (or the ball discharges,
    // or the ice flashes), a ring races across the ground — flame with a puff of
    // smoke and ash, lightning, or ice shards — and the fireflies scatter.
    ctx.setElement(selection.element ?? ctx.elementKey);
    fire.params.level = reducedMotion || stationary ? 2 : 3.2;
    ctx.targetLevel = 1;
    fire.burst((reducedMotion ? 0.8 : 1.7) * flameShare(ctx.elementKey));
    if (ctx.elementKey === 'lightning') {
      ctx.zap.burst(effects.lightning.height);
      plasma.discharge(1);
    } else if (ctx.elementKey === 'ice') {
      ctx.frostRing.burst();
      crystals.burst(1);
    } else ctx.fx.burst();
    ctx.fireflies.burst(flames[ctx.flameKey].ramp);
    ctx.reactKnights('impact', stationary ? 0.5 : 1);
    ctx.reactKnights('ring');
    armor.flare(1);
    hit(stationary ? 0.5 : 1);
    scar(FIRE_ORIGIN.x, FIRE_ORIGIN.z, 1.2);
    // The new ball needs a moment to grow in before it can reach for a firefly.
    if (ctx.elementKey === 'lightning') ctx.strikeAt = ctx.simT + 0.5;
    onImpact?.(ctx.flameKey, old, stationary, { ...selection, weapon: weaponKey });
  }

  /**
   * Swap weapon + flame color. Resolves at impact. `pace` and `hold` go to the swap
   * (see weapons.js): the visualizer times the impact to the beat, or holds the new
   * weapon over the fire until release().
   */
  function equip(
    weaponKey,
    key,
    { instant = false, item = null, element = ctx.elementKey, pace = 1, hold = false, rush = false } = {},
  ) {
    return ctx.loaded.then(() => {
      if (scope.disposed) return { status: 'cancelled' };
      if (!Object.hasOwn(flames, key)) throw new Error('Unknown flame: ' + key);
      const selection = { weapon: weaponKey, flame: key, item, element: elementOr(element) };
      if (instant) {
        ctx.weapons.set(weaponKey);
        ctx.setElement(selection.element, true);
        ctx.flameKey = key;
        ctx.blend = null;
        ctx.forgeFlame = null;
        ctx.applyColors(flames[key], lightMix(key));
        ctx.weapons.setRim(flames[key].ramp[2]);
        ctx.fireflies?.setRamp(flames[key].ramp);
        ctx.targetLevel = 1;
        onImpact?.(key, key, true, selection);
        return { status: 'applied' };
      }
      return ctx.weapons.swap(weaponKey, flames[ctx.flameKey].ramp, flames[key].ramp, selection, { pace, hold, rush });
    });
  }

  /**
   * A beat (the visualizer): the fire kicks up, the ball crackles, the ice pulses.
   * `strength` 0..1; `accent` marks a downbeat (a bigger hit); the fireflies blink along
   * unless `blink` is off.
   */
  function pulse(strength = 1, { accent = false, blink = true } = {}) {
    if (!ctx.ready || reducedMotion) return;
    const s = Math.min(1, Math.max(0, strength));
    fire.burst(0.45 * s * (accent ? 1.5 : 1) * flameShare(ctx.elementKey));
    if (ctx.elementKey === 'lightning') {
      ctx.zap.crackle(0.12 + 0.15 * s, Math.round(2 + 3 * s + (accent ? 3 : 0)));
      if (accent) {
        plasma.discharge(0.35 * s);
        if (Math.random() < effects.impact.fireflyStrikes) strikeFirefly(s);
      }
    } else if (ctx.elementKey === 'ice') {
      crystals.burst(0.4 * s * (accent ? 1.5 : 1));
      crystals.beat(s * (accent ? 1 : 0.7));
    }
    if (blink) ctx.fireflies.pulse(accent ? s : s * 0.45);
    ctx.weapons.beat(s * (accent ? 1 : 0.6));
    ctx.knights?.beat(s * (accent ? 1 : 0.6));
  }
  /**
   * The current element's ring, without a new weapon or colors: a ring of fire, of
   * lightning or of ice shards races out across the ground (the visualizer's extra hits).
   */
  function ring(strength = 1, { quiet = false } = {}) {
    if (!ctx.ready || reducedMotion) return;
    const s = Math.min(1.5, Math.max(0, strength));
    if (!quiet) hit(0.35 * s, { freeze: false, flash: false, shake: false });
    scar(FIRE_ORIGIN.x, FIRE_ORIGIN.z, s, { ring: true });
    if (ctx.elementKey === 'lightning') {
      ctx.zap.burst(effects.lightning.height);
      plasma.discharge(0.6 * s);
    } else if (ctx.elementKey === 'ice') {
      ctx.frostRing.burst();
      crystals.burst(0.8 * s);
      crystals.beat(1);
      crystals.echo();
    } else {
      ctx.fx.burst();
      fire.burst(0.9 * s);
    }
    fire.params.level = Math.max(fire.params.level, 1.6 + s);
    ctx.reactKnights('ring', s);
    armor.flare(0.45 + 0.4 * Math.min(1, s));
    jolt(0.12 * s);
  }
  /** Lightning jumps from the ball to the nearest firefly within reach, which flickers hot. */
  function strikeFirefly(power = 1) {
    if (!ctx.fireflies || ctx.elementKey !== 'lightning' || reducedMotion || effects.impact.fireflyStrikes <= 0)
      return false;
    const f = ctx.fireflies.nearest(plasma.center, 1.4 + effects.lightning.size * 2);
    if (!f || !plasma.jump(f.pos)) return false;
    ctx.fireflies.zap(f, plasma.center, power);
    return true;
  }
  /** An echo of the planted weapon's silhouette bursts out of it (and in ice, the crystals' outlines). */
  function echo() {
    if (!ctx.ready) return;
    ctx.weapons.echo(ctx.currentRamp, ctx.elementKey);
    if (ctx.elementKey === 'ice') crystals.echo();
  }
  /**
   * The living blade (the visualizer): the planted weapon leaves the fire for a routine of
   * moves and plunges back in. plan { hits: [s, …], plunge: s } in seconds from now, and
   * optionally { moves, alive, basis, onMove, onHit } (see weapons.swing). Each move takes
   * its plane from the camera (`basis`, by default where the camera is headed) as it
   * begins. Resolves when the blade is back in the fire (false if it can't swing).
   */
  ctx.swingDone = null;
  function swing(plan) {
    if (!ctx.ready || reducedMotion) return Promise.resolve(false);
    // (It fights clear of the knights: each move's shape avoids them where they are then.)
    const basis = plan.basis ?? view.axes;
    const clearOfKnights = () => Object.assign(basis(), { avoid: ctx.knights?.capsules() ?? [] });
    if (!ctx.weapons.swing({ ...plan, basis: clearOfKnights })) return Promise.resolve(false);
    return new Promise((resolve) => {
      ctx.swingDone = () => resolve(true);
    });
  }
  /** Where the blade is (world): { mid, tip, grip, normal, quat, len, swinging, free }, or null. */
  const bladeState = {
    mid: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    grip: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    len: 1,
    swinging: false,
    free: false,
  };
  /** Flames and sparks near the moving blade get knocked along with it. */
  function bladeWake(g0, t0, g1, t1, dt) {
    const inv = 1 / Math.max(dt, 1e-3);
    const vgx = (g1.x - g0.x) * inv,
      vgy = (g1.y - g0.y) * inv,
      vgz = (g1.z - g0.z) * inv;
    const vtx = (t1.x - t0.x) * inv,
      vty = (t1.y - t0.y) * inv,
      vtz = (t1.z - t0.z) * inv;
    const abx = t1.x - g1.x,
      aby = t1.y - g1.y,
      abz = t1.z - g1.z;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    const R = 0.3;
    for (const set of fire.sets) {
      const P = set.pos;
      const V = set.vel;
      for (let i = 0; i < set.n; i++) {
        const ix = i * 3;
        const px = P[ix] - g1.x,
          py = P[ix + 1] - g1.y,
          pz = P[ix + 2] - g1.z;
        const s = Math.min(1, Math.max(0, (px * abx + py * aby + pz * abz) / len2));
        const dx = px - abx * s,
          dy = py - aby * s,
          dz = pz - abz * s;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R * R) continue;
        const k = 0.45 * (1 - Math.sqrt(d2) / R);
        V[ix] = Math.max(-4, Math.min(4, V[ix] + (vgx + (vtx - vgx) * s) * k));
        V[ix + 1] = Math.max(-4, Math.min(4, V[ix + 1] + (vgy + (vty - vgy) * s) * k));
        V[ix + 2] = Math.max(-4, Math.min(4, V[ix + 2] + (vgz + (vtz - vgz) * s) * k));
      }
    }
  }
  /** A few sparks off the flame (hi-hats). */
  function sparkle(n = 3) {
    if (!ctx.ready || reducedMotion) return;
    fire.sparkle(Math.round(n * ambient()));
  }

  /**
   * The living blade's flourish (the site): the planted weapon pulls free, cuts a couple of
   * moves in the air and plunges back in. Resolves when it's back (false if it can't).
   */
  function flourish() {
    const moves = 2 + Math.floor(Math.random() * 2);
    const hits = Array.from({ length: moves }, (_, i) => 0.55 + i * 0.42);
    return swing({ hits, plunge: hits[hits.length - 1] + 0.6 });
  }
  return {
    ambient,
    hit,
    scar,
    stoke,
    puff,
    impact,
    equip,
    pulse,
    ring,
    strikeFirefly,
    echo,
    swing,
    flourish,
    bladeState,
    bladeWake,
    sparkle,
  };
}
