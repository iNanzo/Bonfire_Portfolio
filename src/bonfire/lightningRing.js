// What happens when a weapon lands while the bonfire is lightning: instead of a ring
// of fire, a ring of lightning crackles out across the ground.
//   • front   — a circle of emitters races outward (slowing as it goes, in lobes that
//               differ every impact) and stops where something is in the way, like
//               the fire ring (impact.js). Between neighbors a jagged bolt hugs the
//               ground; a dimmer strand trails it. Where neighbors are stopped at
//               different distances the line breaks, so it splits around obstacles.
//   • forks   — short bolts skitter off the front along the ground.
//   • arcs    — the odd bolt leaps up off the ring and lands a little further round.
//   • climbs  — where the front hits something it crawls up it while it flares.
//   • crackle — as the weapon lands, bolts crackle out of the bonfire and strike the
//               ground, stones and logs around it (and the spreading ring), re-striking
//               somewhere new on every crackle, each strike flashing and lighting its
//               spot. Stoking the ball throws a smaller crackle.
//   • sparks  — bright specks kicked up by the front, bouncing as they cool.
//   • lights  — a few point lights ride the ring, strobing with the crackle.
// Every bolt shape holds still between crackles (seeded) while the front moves on.
import * as THREE from 'three';
import { effects } from '../effects.js';
import { createBoltLines, hashSeed, seeded } from './bolts.js';
import { ringNoise } from './rings.js';
import { TAU } from '../math.js';
import { createPoints, rampColors, setRampColors } from './points.js';
import { arcJitter, arcHeat, ARC_FLASH } from './signatures.js';

const UP = new THREE.Vector3(0, 1, 0);
const STRIKE_LIGHTS = 4;

/** @param {(x:number, z:number)=>number} [o.ground]  height of the scenery at (x, z), for where strikes land */
export function createLightningRing({
  fxMaterial,
  sparkMaterial = fxMaterial,
  origin,
  field,
  reach,
  ground = () => 0,
  emitters = 96,
  sparks = 260,
  lights: lightCount = 6,
  reducedMotion = false,
}) {
  const bolts = createBoltLines(fxMaterial, emitters * 22 + 420, emitters * 8 + 900, {
    afterimage: () => (reducedMotion ? 0 : effects.impact.afterimages),
  });
  const kVel = new Float32Array(sparks * 3);
  const sparkPts = createPoints(sparks, sparkMaterial, { vel: kVel }); // cross-shaped flashes that streak (signatures.js)
  const g = sparkPts.geometry;
  const K = {
    pos: g.attributes.position.array,
    col: g.attributes.color.array,
    size: g.attributes.size.array,
    alpha: g.attributes.alpha.array,
  };
  const kAge = new Float32Array(sparks).fill(1);
  const kLife = new Float32Array(sparks).fill(0);
  let kNext = 0;

  const eAng = new Float32Array(emitters);
  const eR = new Float32Array(emitters);
  const eSpeed = new Float32Array(emitters);
  const eMax = new Float32Array(emitters);
  const eAge = new Float32Array(emitters).fill(1e3);
  const eLife = new Float32Array(emitters).fill(1);
  const eHit = new Float32Array(emitters);
  const eHeat = new Float32Array(emitters);
  const eAcc = new Float32Array(emitters);
  let active = false;
  let live = false;
  let seed = 0;
  let ballHeight = 0.58;
  // The crackle out of the bonfire: how long it lasts, how many bolts at a time.
  let crackleT = 1e3,
    crackleFor = 0,
    crackleBolts = 0,
    crackleStep = -1;
  const strikeLights = Array.from(
    { length: reducedMotion ? 0 : STRIKE_LIGHTS },
    () => new THREE.PointLight(0x8cc8ff, 0, 2.6, 2),
  );
  const targets = []; // this crackle's strike points: { x, y, z }

  const lights = Array.from(
    { length: reducedMotion ? 0 : lightCount },
    () => new THREE.PointLight(0x8cc8ff, 0, 2.6, 2),
  );
  const lightR = new Float32Array(lightCount);
  const lightHeat = new Float32Array(lightCount);
  const lc = new Float32Array(lightCount);
  const strobe = new Float32Array(lightCount).fill(1);
  let strobeStep = -1;

  const ramp = rampColors(['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff']);
  const white = new THREE.Color('#ffffff');
  const tmp = new THREE.Color();
  const sample = (h, out) => {
    const x = Math.min(0.999, Math.max(0, h)) * 3;
    const k = Math.floor(x);
    return out.copy(ramp[k]).lerp(ramp[k + 1], x - k);
  };

  const alive = (i) => eAge[i] >= 0 && eAge[i] <= eLife[i];
  const px = (i, dr = 0) => origin.x + Math.cos(eAng[i]) * Math.min(eR[i] + dr, eMax[i] - 0.03);
  const pz = (i, dr = 0) => origin.z + Math.sin(eAng[i]) * Math.min(eR[i] + dr, eMax[i] - 0.03);

  /** Bolts out of the bonfire for `duration` s, `count` at a time. */
  function crackle(duration = 0.5, count = 4, height = effects.lightning.height) {
    if (reducedMotion) return;
    ballHeight = height;
    crackleT = 0;
    crackleFor = duration;
    crackleBolts = count;
    crackleStep = -1;
  }

  function burst(height = effects.lightning.height) {
    if (reducedMotion) return;
    const L = effects.lightning;
    ballHeight = height;
    crackle(0.85, 8, height);
    active = true;
    seed = Math.random() * 100;
    for (let i = 0; i < emitters; i++) {
      const a = (i / emitters) * TAU + (Math.random() - 0.5) * 0.03;
      eAng[i] = a;
      eR[i] = 0.78 + Math.random() * 0.08;
      eSpeed[i] = (4.1 + 0.6 * ringNoise(field.noise, a, 1.3, 0, seed) + (Math.random() - 0.5) * 0.1) * L.ringSpeed;
      eMax[i] = reach ? reach(a) : 4.6;
      eAge[i] = -Math.random() * 0.05;
      eLife[i] = (1.25 + Math.random() * 0.5) / Math.sqrt(L.ringSpeed);
      eHit[i] = -1;
      eHeat[i] = 1;
      eAcc[i] = Math.random();
    }
  }

  function emitSpark(x, z, ang, heat, y = 0.03 + Math.random() * 0.05) {
    const i = kNext;
    kNext = (kNext + 1) % sparks;
    const ix = i * 3;
    K.pos[ix] = x;
    K.pos[ix + 1] = y;
    K.pos[ix + 2] = z;
    const out = (0.2 + Math.random() * 0.9) * (0.6 + heat * 0.5);
    const side = (Math.random() - 0.5) * 1.2;
    kVel[ix] = Math.cos(ang) * out - Math.sin(ang) * side;
    kVel[ix + 1] = 0.6 + Math.random() * 1.3 * heat;
    kVel[ix + 2] = Math.sin(ang) * out + Math.cos(ang) * side;
    kAge[i] = 0;
    kLife[i] = 0.25 + Math.random() * 0.5;
  }

  function step(dt, t) {
    const L = effects.lightning;
    crackleT += dt;
    const crackling = crackleT < crackleFor;
    let anySpark = false;
    // --- the front
    if (active) {
      let any = false;
      lightR.fill(0);
      lightHeat.fill(0);
      lc.fill(0);
      for (let i = 0; i < emitters; i++) {
        if (eAge[i] > eLife[i]) continue;
        any = true;
        eAge[i] += dt;
        if (eAge[i] < 0) continue;
        const k = Math.min(1, eAge[i] / eLife[i]);
        if (eHit[i] < 0) {
          eSpeed[i] *= Math.exp(-dt * 1.1);
          const next = eR[i] + eSpeed[i] * dt;
          if (next >= eMax[i]) {
            eR[i] = eMax[i];
            eHit[i] = 0;
            eLife[i] = Math.min(eLife[i], eAge[i] + 0.5 + Math.random() * 0.25);
          } else eR[i] = next;
        } else eHit[i] += dt;
        const flare = eHit[i] >= 0 ? Math.max(0, 1 - eHit[i] / 0.45) : 0;
        eHeat[i] = (1 - k) ** 1.1 + flare * 0.5;
        eAcc[i] += dt * 16 * eHeat[i];
        while (eAcc[i] >= 1) {
          eAcc[i] -= 1;
          emitSpark(px(i), pz(i), eAng[i], eHeat[i]);
        }
        if (lightCount) {
          const s = Math.floor((eAng[i] / TAU) * lightCount + lightCount) % lightCount;
          lightR[s] += eR[i];
          lightHeat[s] += eHeat[i];
          lc[s] += 1;
        }
      }
      if (!any) {
        active = false;
        for (const l of lights) l.intensity = 0;
      }
    }

    // --- the bolts: shapes re-roll on every crackle, positions follow the front
    const cs = Math.floor(t * Math.max(12, L.crackle));
    if (active || crackling) {
      live = true;
      bolts.begin();
      const jag = 0.1 + 0.4 * L.jag;
      for (let i = 0; i < emitters; i++) {
        const j = (i + 1) % emitters;
        if (!alive(i)) continue;
        const heat = Math.min(1, eHeat[i]);
        const flare = eHit[i] >= 0 ? Math.max(0, 1 - eHit[i] / 0.45) : 0;
        const rng = seeded(hashSeed(i, cs, 7));
        const fade = Math.min(1, eAge[i] * 12);
        if (alive(j) && Math.abs(eR[i] - eR[j]) < 0.25) {
          const hot = rng() < 0.25 ? 0.2 : 0;
          const k = (0.55 + 0.45 * heat) * fade;
          // The lead strand: a hot, glowing jagged line hugging the ground.
          bolts.bolt(px(i), 0.035, pz(i), px(j), 0.035, pz(j), {
            rng,
            depth: 2,
            jag,
            up: UP,
            width: 1 + 1.5 * heat,
            heat: 1.1,
            color: (tt, out) => sample(0.68 + hot + flare * 0.2, out).multiplyScalar(k),
          });
          // A dimmer strand trailing behind it.
          bolts.bolt(px(i, -0.07), 0.05, pz(i, -0.07), px(j, -0.07), 0.05, pz(j, -0.07), {
            rng,
            depth: 1,
            jag: jag * 1.3,
            up: UP,
            color: (tt, out) => sample(0.42, out).multiplyScalar(k * 0.6),
          });
        }
        // Forks skittering off along the ground.
        if (rng() < 0.16 * L.ringArcs * heat) {
          const a = eAng[i] + (rng() - 0.5) * 1.6 + (rng() < 0.3 ? Math.PI : 0);
          const len = 0.1 + rng() * 0.3;
          const x = px(i),
            z = pz(i);
          bolts.bolt(x, 0.03, z, x + Math.cos(a) * len, 0.02, z + Math.sin(a) * len, {
            rng,
            depth: 2,
            jag: jag * 1.2,
            up: UP,
            color: (tt, out) => sample(0.55 - tt * 0.25, out).multiplyScalar(0.8 * heat * fade),
          });
        }
        // An arc leaping off the ring and landing further round.
        if (rng() < 0.045 * L.ringArcs * heat) {
          const o = (i + 3 + Math.floor(rng() * 4)) % emitters;
          if (alive(o)) {
            const h = (0.1 + rng() * 0.25) * (0.6 + heat * 0.6);
            const mx = (px(i) + px(o)) / 2,
              mz = (pz(i) + pz(o)) / 2;
            const col = (tt, out) => sample(0.72, out).multiplyScalar(0.9 * heat);
            bolts.bolt(px(i), 0.03, pz(i), mx, h, mz, { rng, depth: 2, jag, color: col, width: 2 });
            bolts.bolt(mx, h, mz, px(o), 0.03, pz(o), { rng, depth: 2, jag, color: col, width: 2 });
          }
        }
        // Stopped by something: the lightning climbs it while it flares.
        if (flare > 0) {
          const x = px(i, -0.02),
            z = pz(i, -0.02);
          const h = 0.15 + 0.5 * flare * (0.6 + rng() * 0.6);
          bolts.bolt(x, 0.03, z, x - Math.cos(eAng[i]) * 0.03, h, z - Math.sin(eAng[i]) * 0.03, {
            rng,
            depth: 3,
            jag: jag * 0.8,
            width: (tt) => 2.5 - tt * 1.5,
            heat: 1.3,
            color: (tt, out) => sample(0.9 - tt * 0.35, out).multiplyScalar(0.7 + flare * 0.5),
          });
        }
      }
      // The crackle: bolts out of the bonfire, striking the scenery around it (and
      // the ring while it's close), somewhere new on every crackle.
      if (crackling) {
        const k = (1 - crackleT / crackleFor) ** 0.7;
        const rng = seeded(hashSeed(999, cs, 3));
        if (cs !== crackleStep) {
          crackleStep = cs;
          targets.length = 0;
          for (let s = 0; s < crackleBolts; s++) {
            const i = Math.floor(rng() * emitters);
            if (active && alive(i) && eR[i] < 2.4 && rng() < 0.45) {
              targets.push({ x: px(i), y: 0.03, z: pz(i), ang: eAng[i] });
            } else {
              const ang = rng() * TAU;
              const r = Math.min(0.45 + rng() * 1.5, (reach ? reach(ang) : 4.6) - 0.05);
              const x = origin.x + Math.cos(ang) * r,
                z = origin.z + Math.sin(ang) * r;
              targets.push({ x, y: ground(x, z) + 0.01, z, ang });
            }
            const tg = targets.at(-1);
            for (let j = 0; j < 5; j++) emitSpark(tg.x, tg.z, tg.ang + Math.PI, 1, tg.y + 0.01);
          }
        }
        const W = L.boltWidth;
        for (const tg of targets) {
          // A heavy bolt from the ball, tapering as it goes, forking on the way…
          bolts.bolt(origin.x, ballHeight, origin.z, tg.x, tg.y, tg.z, {
            rng,
            depth: 5,
            jag: 0.14 + 0.18 * L.jag,
            width: (tt) => (W + 1) * (1 - tt * 0.5),
            heat: 1.8,
            color: (tt, out) => sample(1 - tt * 0.3, out).multiplyScalar(k * 1.15),
            each: (x, y, z, tt) => {
              if (tt < 0.2 || rng() > 0.1 * L.ringArcs + 0.06) return;
              const len = 0.14 + rng() * 0.3;
              const a = rng() * TAU;
              bolts.bolt(
                x,
                y,
                z,
                x + Math.cos(a) * len,
                Math.max(ground(x, z) + 0.02, y - len * 0.6),
                z + Math.sin(a) * len,
                {
                  rng,
                  depth: 3,
                  jag: 0.3,
                  width: (t2) => Math.max(1, W * 0.6 * (1 - t2)),
                  heat: 1.2,
                  color: (t2, out) => sample(0.72 - t2 * 0.2, out).multiplyScalar(k * 0.8),
                  alpha: (t2) => 1 - t2 * t2,
                },
              );
            },
          });
          // …and where it lands it crawls away along the ground.
          for (let c = 0; c < 3; c++) {
            const h = tg.ang + (rng() - 0.5) * 2.2;
            const len = 0.2 + rng() * 0.4;
            const ex = tg.x + Math.cos(h) * len,
              ez = tg.z + Math.sin(h) * len;
            bolts.bolt(tg.x, tg.y + 0.01, tg.z, ex, ground(ex, ez) + 0.015, ez, {
              rng,
              depth: 3,
              jag: 0.32,
              up: UP,
              width: (t2) => 2.4 - t2 * 1.6,
              heat: 1.1,
              color: (t2, out) => sample(0.75 - t2 * 0.3, out).multiplyScalar(k * 0.9),
              alpha: (t2) => 1 - t2 * t2,
            });
          }
        }
        strikeLights.forEach((l, s) => {
          const tg = targets[s];
          if (!tg) {
            l.intensity = 0;
            return;
          }
          l.position.set(tg.x, tg.y + 0.15, tg.z);
          l.color.copy(ramp[2]).lerp(white, 0.4);
          l.intensity = 6 * k * (0.6 + 0.4 * seeded(hashSeed(s, cs, 9))());
        });
      } else {
        for (const l of strikeLights) l.intensity = 0;
      }
      bolts.end();
    } else if (live) {
      bolts.clear();
      for (const l of strikeLights) l.intensity = 0;
      live = false;
    }

    // --- lights: ride the ring, strobing with the crackle
    if (active && lightCount) {
      if (cs !== strobeStep) {
        strobeStep = cs;
        for (let s = 0; s < lightCount; s++) strobe[s] = 0.35 + Math.random() * (0.6 + L.flicker);
      }
      lights.forEach((l, s) => {
        if (!lc[s]) {
          l.intensity = 0;
          return;
        }
        const a = ((s + 0.5) / lightCount) * TAU;
        const r = lightR[s] / lc[s];
        l.position.set(origin.x + Math.cos(a) * r, 0.3, origin.z + Math.sin(a) * r);
        l.color.copy(ramp[2]).lerp(white, 0.35);
        const heat = lightHeat[s] / lc[s];
        l.intensity = Number.isFinite(heat) ? heat * 2.4 * strobe[s] : 0;
      });
    }

    // --- sparks: kicked up by the front, bouncing as they cool
    for (let i = 0; i < sparks; i++) {
      if (kAge[i] >= kLife[i]) {
        K.size[i] = 0;
        continue;
      }
      anySpark = true;
      kAge[i] += dt;
      const ix = i * 3;
      const drag = Math.exp(-dt * 1.6);
      if (!reducedMotion) arcJitter(kVel, ix, dt);
      kVel[ix] *= drag;
      kVel[ix + 1] = kVel[ix + 1] * drag - 3.2 * dt;
      kVel[ix + 2] *= drag;
      K.pos[ix] += kVel[ix] * dt;
      K.pos[ix + 1] += kVel[ix + 1] * dt;
      K.pos[ix + 2] += kVel[ix + 2] * dt;
      if (K.pos[ix + 1] < 0.02) {
        K.pos[ix + 1] = 0.02;
        kVel[ix + 1] *= -0.35;
        kVel[ix] *= 0.6;
        kVel[ix + 2] *= 0.6;
      }
      const k = Math.min(1, kAge[i] / kLife[i]);
      sample(0.9 - k * 0.6, tmp)
        .multiplyScalar(0.8)
        .lerp(white, arcHeat(kAge[i]));
      K.col[ix] = tmp.r;
      K.col[ix + 1] = tmp.g;
      K.col[ix + 2] = tmp.b;
      K.size[i] = kAge[i] < ARC_FLASH ? 3 : 1;
      K.alpha[i] = Math.min(1, (1 - k) * 2) * (0.6 + 0.4 * Math.sin(kAge[i] * 40 + i));
    }
    if (anySpark || active)
      for (const k of ['position', 'color', 'size', 'alpha', 'vel']) g.attributes[k].needsUpdate = true;
  }

  return {
    objects: [...bolts.objects, sparkPts],
    lights: [...lights, ...strikeLights],
    burst,
    crackle,
    step,
    sets: [{ pos: K.pos, vel: kVel, n: sparks, geo: g, maxV: 2 }],
    setRamp(hexes) {
      setRampColors(ramp, hexes);
    },
  };
}
