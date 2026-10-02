// What's under the cursor (client px), for the site: the planted weapon (a click wakes it),
// else whichever is nearest of the knight's summon sign (a click summons him), a knight (a
// click greets him) and the fire (a click stokes it); the hover's effects in the scene itself;
// and what a click anywhere or the page's scrolling does to the loose particles and the
// fireflies.
import * as THREE from 'three';
import { FIRE_ORIGIN } from './sceneContext.js';

/**
 * Picking, hover, the click's gust and the scroll's sweep.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createScenePick(ctx) {
  const { reducedMotion, canvas, camera, armor } = ctx;
  /** Whether the planted weapon is under the point (client px): the site's flourish on click. */
  const pickRay = new THREE.Raycaster();
  const pickNdc = new THREE.Vector2();
  function weaponAt(clientX, clientY) {
    const w = ctx.weapons?.planted;
    if (!w) return false;
    const r = canvas.getBoundingClientRect();
    pickNdc.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2);
    pickRay.setFromCamera(pickNdc, camera);
    pickRay.params.Mesh = { threshold: 0 };
    return pickRay.intersectObject(w, true).length > 0;
  }
  const knightHit = { distance: Infinity };
  const fireHitAt = new THREE.Vector3();
  // The fire, for hover: a sphere around the flames (world).
  const fireBounds = new THREE.Sphere(new THREE.Vector3(FIRE_ORIGIN.x, 0.45, FIRE_ORIGIN.z), 0.55);
  /**
   * What's under the point (client px): the weapon, else a knight (index) or the fire,
   * whichever is nearer. `knight` false: the knights aren't looked for (a click isn't for
   * them), so the fire behind one counts as the fire.
   */
  function pickAt(clientX, clientY, { knight = true } = {}) {
    const onWeapon = weaponAt(clientX, clientY);
    let onFire = false;
    let onKnight = -1;
    let onSign = false;
    if (!onWeapon) {
      const r = canvas.getBoundingClientRect();
      pickNdc.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2);
      pickRay.setFromCamera(pickNdc, camera);
      onKnight = ctx.knights && knight ? ctx.knights.pick(pickRay.ray, knightHit) : -1;
      // (Whichever is nearest: the fire in front of him, him in front of the fire, or his sign.)
      const fireHit = pickRay.ray.intersectSphere(fireBounds, fireHitAt);
      const fireD = fireHit ? fireHit.distanceTo(pickRay.ray.origin) : Infinity;
      const knightD = onKnight >= 0 ? knightHit.distance : Infinity;
      const signHit = ctx.sign && ctx.knightsShown ? ctx.sign.hit(pickRay.ray) : -1;
      const signD = signHit >= 0 ? signHit : Infinity;
      const nearest = Math.min(fireD, knightD, signD);
      onFire = nearest < Infinity && nearest === fireD;
      onSign = !onFire && nearest < Infinity && nearest === signD;
      if (onFire || onSign) onKnight = -1;
    }
    return { onWeapon, onKnight, onFire, onSign };
  }
  /**
   * What's under the point (client px), for the site's hover effects: 'weapon' (the planted
   * weapon: a click wakes it), 'sign' (the knight's summon sign: a click summons him),
   * 'knight' (a click greets him), 'fire' (a click stokes it) or null. The effect shows in the
   * scene itself: the weapon's rim glows, the sign brightens and its motes rise, the knight's
   * rim warms and he looks at you, the fire flares. `knight` false (a click doesn't greet him:
   * the site's setting, reduced motion, he isn't resting there): he's never the hover, and
   * the fire behind him is.
   */
  function hoverAt(clientX, clientY, { knight = true } = {}) {
    const { onWeapon, onKnight, onFire, onSign } = pickAt(clientX, clientY, { knight });
    if (ctx.weapons) ctx.weapons.hovered = onWeapon;
    if (ctx.sign) ctx.sign.hovered = onSign;
    // A hovered knight's rim warms and he turns his head to you.
    if (ctx.knights) ctx.knights.hovered = onKnight;
    if (onFire && !ctx.hoverFlare) armor.flare(0.7); // (the fire rises to meet the cursor: its reflection sweeps the armor)
    ctx.hoverFlare = onFire ? 1 : 0;
    return onWeapon ? 'weapon' : onSign ? 'sign' : onKnight >= 0 ? 'knight' : onFire ? 'fire' : null;
  }
  /** Whether the knight's summon sign is under the point (client px), as hoverAt sees it: a click there summons him. */
  function signAt(clientX, clientY) {
    return !!ctx.sign && pickAt(clientX, clientY, { knight: false }).onSign;
  }
  /**
   * Which knight is under the point (client px): his index, or -1 (also when the weapon or
   * the fire is in front of him there, as hoverAt sees it: a click on those isn't for him).
   */
  function knightAt(clientX, clientY) {
    return ctx.knights ? pickAt(clientX, clientY).onKnight : -1;
  }
  /** The cursor left the scene: no hint. */
  function hoverOff() {
    if (ctx.weapons) ctx.weapons.hovered = false;
    if (ctx.sign) ctx.sign.hovered = false;
    if (ctx.knights) ctx.knights.hovered = -1;
    ctx.hoverFlare = 0;
  }

  /**
   * A click anywhere makes the fireflies flash (brightest near the click), and a soft gust
   * goes out from it: the loose particles near the line under the cursor are pushed away.
   */
  const gustRay = new THREE.Raycaster();
  const gustAt = new THREE.Vector3();
  function flash(clientX, clientY) {
    if (!ctx.fireflies) return;
    const r = canvas.getBoundingClientRect();
    ctx.fireflies.flash(clientX - r.left, clientY - r.top, camera, r.width, r.height);
    if (reducedMotion) return;
    pickNdc.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2);
    gustRay.setFromCamera(pickNdc, camera);
    const { origin: o, direction: d } = gustRay.ray;
    const R = 0.5;
    for (const set of ctx.sets) {
      const P = set.pos,
        V = set.vel;
      const cap = set.maxV ?? 2;
      for (let i = 0; i < set.n; i++) {
        const ix = i * 3;
        const px = P[ix] - o.x,
          py = P[ix + 1] - o.y,
          pz = P[ix + 2] - o.z;
        const along = px * d.x + py * d.y + pz * d.z;
        if (along <= 0) continue;
        gustAt.set(px - d.x * along, py - d.y * along, pz - d.z * along); // from the ray to the particle
        const dist = gustAt.length();
        if (dist > R || dist < 1e-4) continue;
        const k = (1.1 * (1 - dist / R) ** 2) / dist;
        V[ix] = Math.max(-cap, Math.min(cap, V[ix] + gustAt.x * k));
        V[ix + 1] = Math.max(-cap, Math.min(cap, V[ix + 1] + gustAt.y * k + 0.15 * (1 - dist / R)));
        V[ix + 2] = Math.max(-cap, Math.min(cap, V[ix + 2] + gustAt.z * k));
      }
    }
  }
  /** The page scrolled by `dy` CSS px (+ down): everything loose is swept a little the way the page moved. */
  function scroll(dy) {
    if (!ctx.ready || reducedMotion || !dy) return;
    ctx.sweep = Math.max(-1, Math.min(1, ctx.sweep + Math.max(-150, Math.min(150, dy)) / 420));
  }
  return { weaponAt, knightAt, signAt, hoverAt, hoverOff, flash, scroll };
}
