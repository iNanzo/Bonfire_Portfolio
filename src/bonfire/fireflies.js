// @ts-nocheck: 27 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Fireflies: modeled bodies with glowing lanterns, a soft translucent halo
// (two additive spheres the pixel pass dithers into a stepped glow), and a pool
// of real point lights that follows the brightest ones.
//
// Lighting rules:
//   • `litCount` fly lit at rest. When one goes dark, the next lights only once
//     it has faded out, so the count never creeps over;
//   • a firefly that lands always lights up (a flying one fades out to make
//     room when it can, but landing may push past the limit);
//   • hovering near one lights it even past the limit (it flickers and shies away);
//   • when a new weapon slams down, each firefly pops on in the new flame color on
//     its own beat and darts off; once the color change is done the extras fade
//     out quickly until `litCount` remain.
//
// Flight: they roam between waypoints across the clearing, steering over and
// around the scenery with a height map (see terrain.js), and land on tops and
// walls: they hover in front of the spot, ease onto it along the surface normal,
// fold their wings, and take off the same way.
//
// Drawing: every part (body, lantern, wings, the halos) is one InstancedMesh for all
// the flies, four draws in all instead of five a fly. Each fly keeps a rig of its own
// (plain Object3Ds, out of the scene: its place, its turn, its wings' flap), and
// place(camera), just before the frame is drawn, writes the rigs into the instances:
// each part's view-space matrix (the camera's inverse times its world matrix, as
// three.js works out a mesh's modelViewMatrix), with the instanced meshes standing at
// the camera, so the GPU multiplies each vertex by exactly the matrix it used for the
// part's own mesh; the lantern's and halos' colors and the halos' opacity as a flat
// per-instance tint, so each texel comes out as it did; and the halos back to front,
// the order three.js drew them in (additive blending rounds after each one).
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { smooth, TAU } from '../math.js';
import { createPoints, markDirty } from './points.js';
import { RUINS } from './colliders.js';

const HOVER = 0.15; // hover distance off a surface before settling onto it
const REST = 0.014; // resting distance off a surface
const CLEAR = 0.2; // preferred flight clearance above the scenery
const MARGIN = 0.02; // hard floor above the (grown) scenery
const OUT_TIME = 0.45; // a lit firefly's fade out at rest (s)
const IN_TIME = 0.6; // an unlit one's fade in (s)

// Points of interest in world space (the fire is at the origin; the ruins' pieces where
// colliders.js RUINS has them).
const POIS = [
  [RUINS.at[0], 2.05, RUINS.at[1]], // top of the broken pillar
  [RUINS.at[0] + 0.25, 0.62, RUINS.at[1] + 0.25], // candles on the plinth
  [1.9, 1.7, -1.5], // top of the ruined wall
  [1.15, 0.35, -0.45], // spare logs
  [RUINS.drum.at[0], 0.45, RUINS.drum.at[2]], // fallen pillar drum
];

/**
 * @param {THREE.Object3D} template  the "Firefly" node from the model
 * @param {object} o
 * @param {THREE.Vector3} o.center     fire position on the ground
 * @param {number} o.layer             color-pass layer (no outlines)
 * @param {object} o.terrain           height map (terrain.js)
 * @param {(origin:THREE.Vector3, dir:THREE.Vector3, far:number)=>{point:THREE.Vector3, normal:THREE.Vector3}|null} o.raycast
 */
export function createFireflies(
  template,
  {
    count = 18,
    litCount = 9,
    lightCount = 9,
    speed = 1,
    center,
    layer,
    terrain,
    raycast,
    reducedMotion = false,
    trailMaterial = null, // particle material for light trails (the visualizer); none on the site
  },
) {
  const noise = new SimplexNoise();
  const group = new THREE.Group();
  const flies = [];
  let pace = (reducedMotion ? 0.5 : 1) * speed;

  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);
  const tmp = new THREE.Vector3();
  const tmpO = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const lanternWorld = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const bx = new THREE.Vector3();
  const bz = new THREE.Vector3();

  const fromFire = (x, z) => Math.hypot(x - center.x, z - center.z);

  // --- where to go -----------------------------------------------------------
  function landingAt(point, normal) {
    const n = normal.clone().normalize();
    const hover = point.clone().addScaledVector(n, HOVER);
    if (n.y > 0.55) hover.y += 0.04; // come down onto tops from a little above
    return { point, normal: n, rest: point.clone().addScaledVector(n, REST), hover };
  }

  function randomXZ() {
    if (Math.random() < 0.35) {
      const poi = POIS[Math.floor(Math.random() * POIS.length)];
      return [poi[0] + (Math.random() - 0.5) * 0.6, poi[1], poi[2] + (Math.random() - 0.5) * 0.6];
    }
    const a = Math.random() * TAU;
    const r = 1.1 + Math.random() * 3.2;
    return [center.x + Math.cos(a) * r, 0.3 + Math.random() * 1.8, center.z + Math.sin(a) * r];
  }

  /** A top surface (ground, flagstones, stones, logs, pillar or wall tops). */
  function topLanding(x, z) {
    const hit = raycast(tmpO.set(x, 3.6, z), DOWN, 4);
    if (!hit || hit.normal.y < 0.6) return null;
    return landingAt(hit.point, hit.normal);
  }

  /** A vertical face (pillar, plinth, wall, big stones). */
  function wallLanding() {
    const spots = terrain.wallSpots;
    if (!spots.length) return null;
    const s = spots[Math.floor(Math.random() * spots.length)];
    if (fromFire(s.x, s.z) < 1.2) return null;
    const y = s.lo + 0.1 + Math.random() * Math.max(0, s.hi - s.lo - 0.18);
    tmpD.set(-s.nx, 0, -s.nz);
    const hit = raycast(tmpO.set(s.x + s.nx * 0.35, y, s.z + s.nz * 0.35), tmpD, 0.6);
    if (!hit || Math.abs(hit.normal.y) > 0.45) return null;
    return landingAt(hit.point, hit.normal);
  }

  /** Nothing solid along the straight line from a to b? */
  function clearPath(a, b, landing) {
    const steps = Math.ceil(a.distanceTo(b) / 0.12);
    for (let s = 1; s < steps; s++) {
      tmp.lerpVectors(a, b, s / steps);
      const final = landing && tmp.distanceTo(b) < 0.3;
      if (tmp.y < (final ? terrain.top(tmp.x, tmp.z) : terrain.solid(tmp.x, tmp.z)) + MARGIN) return false;
    }
    return true;
  }

  /** Next place to fly to: somewhere in the air, or a surface to land on. */
  function pickWaypoint(from) {
    let fallback = null;
    for (let tries = 0; tries < 14; tries++) {
      const r = Math.random();
      let wp = null;
      if (r < 0.2) {
        const land = wallLanding();
        if (land) wp = { pos: land.hover.clone(), land };
      } else if (r < 0.45) {
        const [x, , z] = randomXZ();
        const land = topLanding(x, z);
        if (land) wp = { pos: land.hover.clone(), land };
      } else {
        const [x, y, z] = randomXZ();
        wp = { pos: new THREE.Vector3(x, Math.max(y, terrain.solid(x, z) + CLEAR + 0.05), z), land: null };
      }
      if (!wp || fromFire(wp.pos.x, wp.pos.z) < 1.05) continue;
      if (wp.land && wp.pos.y < terrain.solid(wp.pos.x, wp.pos.z) + MARGIN) continue;
      if (from && wp.pos.distanceTo(from) < 1.0) continue;
      if (!from || clearPath(from, wp.pos, !!wp.land)) return wp;
      fallback = fallback ?? wp;
    }
    if (fallback) return fallback;
    const a = Math.random() * TAU;
    const x = center.x + Math.cos(a) * 2,
      z = center.z + Math.sin(a) * 2;
    return { pos: new THREE.Vector3(x, terrain.solid(x, z) + 0.8, z), land: null };
  }

  // --- the flies -------------------------------------------------------------
  // One InstancedMesh per part of the model's firefly (in the model's order: the body, the
  // lantern, the wings), and one for the halos: two nested translucent spheres round each
  // lantern (sizes in the firefly's local units, which are scaled ×1.6), drawn last, added on.
  const parts = [];
  template.traverse((o) => {
    if (o.isMesh) parts.push(o);
  });
  const kinds = parts.map((o) => {
    const lantern = o.name.includes('Lantern');
    const material = lantern
      ? tinted(new THREE.MeshBasicMaterial({ fog: false }))
      : new THREE.MeshLambertMaterial({ color: o.material.color.clone(), flatShading: true });
    return instanced(lantern ? withTint(o.geometry.clone(), count) : o.geometry, material, count);
  });
  const lanternKind = parts.findIndex((o) => o.name.includes('Lantern'));
  const haloMesh = instanced(
    withTint(sphere, count * 2),
    tinted(
      new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ),
    count * 2,
  );
  haloMesh.renderOrder = 2;
  for (const m of [...kinds, haloMesh]) group.add(m);
  sphere.computeBoundingSphere(); // (where three.js measures a halo's depth from, to sort it)

  /** An InstancedMesh of `n` that place() fills: on the flies' layer, never culled as a whole. */
  function instanced(geometry, material, n) {
    const m = new THREE.InstancedMesh(geometry, material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.layers.set(layer);
    m.frustumCulled = false;
    // (It stands where the camera is, set by place(): see the top of the file.)
    m.matrixAutoUpdate = false;
    m.matrixWorldAutoUpdate = false;
    return m;
  }
  /** A per-instance color and opacity (`tint`, rgba) on `geometry`. */
  function withTint(geometry, n) {
    const tint = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    tint.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('tint', tint);
    return geometry;
  }

  for (let i = 0; i < count; i++) {
    // The fly's rig: the model's firefly as bare Object3Ds (no mesh of its own: the parts'
    // instances follow it), with its two halos at the lantern.
    const rig = [];
    const bare = (o) => {
      const b = new THREE.Object3D().copy(o, false);
      if (o.isMesh) rig.push(b);
      for (const c of o.children) b.add(bare(c));
      return b;
    };
    const obj = bare(template);
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(1.6);
    const lantern = rig[lanternKind];
    const wings = rig.find((o) => o.name.includes('Wings')) ?? null;
    const halos = [0.035, 0.062].map((r) => {
      const h = new THREE.Object3D();
      h.scale.setScalar(r);
      h.position.copy(lantern.position);
      obj.add(h);
      return h;
    });

    const a = Math.random() * TAU;
    const r = 1.4 + Math.random() * 2.4;
    const pos = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
    pos.y = terrain.solid(pos.x, pos.z) + CLEAR + 0.2 + Math.random() * 1.2;
    const lit = i < litCount ? 1 : 0;
    flies.push({
      obj,
      rig,
      lantern,
      wings,
      halos,
      // What place() draws them in: the lantern's color, each halo's color and opacity, and
      // whether the halos show.
      lanternColor: new THREE.Color(0x3b3346),
      haloColor: [new THREE.Color(0xffc76a), new THREE.Color(0xffc76a)],
      haloOpacity: [0, 0],
      haloOn: true,
      seed: i * 13.7 + Math.random() * 5,
      pos,
      vel: new THREE.Vector3(),
      mode: 'fly', // fly → settle → rest → lift → fly
      modeT: 0,
      modeDur: 0,
      restLeft: 0,
      from: new THREE.Vector3(),
      fromVel: new THREE.Vector3(),
      fromQuat: new THREE.Quaternion(),
      landQuat: new THREE.Quaternion(),
      kick: null, // velocity to leave with once a lift ends
      wp: null,
      wpAge: 0,
      loiter: 0,
      startle: new THREE.Vector3(),
      inSet: lit === 1, // one of the `litCount` lit ones
      lit,
      litDelay: 0,
      fadeRate: 1 / IN_TIME,
      scatterIn: -1,
      dimIn: -1,
      flicker: 0,
      hovered: false,
      flash: 0,
      flashPower: 1,
      glow: lit,
      mix: 1, // color: 0 = previous flame, 1 = current
      mixing: false,
      // Set from outside (the visualizer's light show), null on the site:
      show: null, // target glow, in place of the lit set's (hover and flashes still add)
      heat: 0, // 0..1: color toward the flame's pale core
      zapT: 0, // seconds left of flickering after a lightning strike
      orbit: null, // { x, y, z, r, w, h }: circle this point (radius, rad/s, height band)
      leash: null, // { x, z, r }: roam, but drift back inside this radius
      dart: null, // { dir, dist, dur, t, bounce }: a dash (see dart())
      trailAt: 0,
    });
  }
  for (const f of flies) f.wp = pickWaypoint(f.pos);

  // Pool of real lights, assigned to the brightest fireflies each frame.
  const lights = Array.from({ length: lightCount }, () => {
    const l = new THREE.PointLight(0xffc76a, 0, 2.2, 2);
    group.add(l);
    return l;
  });
  const byGlow = flies.slice(); // (re-sorted in place each frame, brightest first)

  const hexes = (h) => h.map((c) => new THREE.Color(c));
  let rampOld = hexes(['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0']);
  let rampNew = rampOld;
  const tone = (f, k, out) => out.copy(rampOld[k]).lerp(rampNew[k], f.mix);
  const UNLIT = new THREE.Color('#3b3346');

  let burstLeft = 0; // > 0 while the post-impact burst is running
  let rotateIn = 2;
  const col = new THREE.Color();
  const colB = new THREE.Color();
  const desired = new THREE.Vector3();
  const drift = new THREE.Vector3(); // a gentle push on everyone in flight (the site's scrolling)
  const flow = new THREE.Vector3();
  const screen = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const look = new THREE.Vector3();
  const grad = new THREE.Vector3();
  const qTarget = new THREE.Quaternion();
  let step = -1;

  /** Where `p` (world) is on a w×h screen: `screen` set to (x px, y px, depth), and returned (no new array per fly). */
  function toScreen(p, camera, w, h) {
    screen.copy(p).project(camera);
    return screen.set(((screen.x + 1) / 2) * w, ((1 - screen.y) / 2) * h, screen.z);
  }

  const grounded = (f) => f.mode !== 'fly';

  // --- lighting ----------------------------------------------------------------
  function light(f, delay = 0, time = IN_TIME) {
    f.inSet = true;
    f.litDelay = delay;
    f.fadeRate = 1 / time;
  }
  function darken(f, time = OUT_TIME) {
    f.inSet = false;
    f.litDelay = 0;
    f.fadeRate = 1 / time;
  }
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /** Hold the lit set at `litCount`: rotate now and then, and rebalance after landings. */
  function manageLit(dt) {
    if (burstLeft > 0 || flies.some((f) => f.dimIn >= 0)) return;
    let n = flies.reduce((s, f) => s + (f.inSet ? 1 : 0), 0);
    // Too many (a landing lit one up): a flying one fades out, if there is one.
    while (n > litCount) {
      const out = flies.filter((f) => f.inSet && !grounded(f) && !f.hovered);
      if (!out.length) break;
      darken(pick(out));
      n--;
    }
    // Too few: a dark one fades in once the last one has faded out.
    while (n < litCount) {
      const inn = flies.filter((f) => !f.inSet);
      if (!inn.length) break;
      light(pick(inn), OUT_TIME + 0.05);
      n++;
    }
    rotateIn -= dt;
    if (rotateIn > 0) return;
    rotateIn = 1.4 + Math.random() * 1.8;
    const out = flies.filter((f) => f.inSet && !grounded(f) && f.lit >= 0.99 && !f.hovered);
    const inn = flies.filter((f) => !f.inSet && f.lit <= 0.01);
    if (!out.length || !inn.length) return;
    darken(pick(out));
    light(pick(inn), OUT_TIME + 0.05);
  }

  // --- landing and take-off ----------------------------------------------------
  /** Resting pose: back to the surface, head pointing along `heading` (up the wall on walls). */
  function restPose(n, heading, out) {
    bz.copy(n.y > 0.55 ? heading : UP).addScaledVector(n, -(n.y > 0.55 ? heading : UP).dot(n));
    if (bz.lengthSq() < 1e-4) bz.set(1, 0, 0).addScaledVector(n, -n.x);
    bz.normalize();
    if (n.y <= 0.55) bz.applyAxisAngle(n, (Math.random() - 0.5) * 1.4); // a little askew on walls
    bx.crossVectors(n, bz).normalize();
    basis.makeBasis(bx, n, bz);
    return out.setFromRotationMatrix(basis);
  }

  function beginSettle(f) {
    f.mode = 'settle';
    f.modeT = 0;
    f.modeDur = reducedMotion ? 0.45 : 0.65;
    f.from.copy(f.pos);
    f.fromVel.copy(f.vel);
    if (f.fromVel.length() > 0.25) f.fromVel.setLength(0.25);
    f.fromQuat.copy(f.obj.quaternion);
    tmp.copy(f.vel).setY(0);
    if (tmp.lengthSq() < 1e-4) tmp.set(Math.cos(f.seed), 0, Math.sin(f.seed));
    restPose(f.wp.land.normal, tmp.normalize(), f.landQuat);
    // Landing lights it up.
    if (!f.inSet) light(f, 0, 0.5);
  }

  function beginLift(f, quick = false) {
    if (f.mode === 'lift') return;
    f.mode = 'lift';
    f.modeT = 0;
    f.modeDur = quick ? 0.16 : 0.45;
    f.from.copy(f.pos);
    f.fromQuat.copy(f.obj.quaternion);
  }

  function endLift(f) {
    const n = f.wp.land.normal;
    f.mode = 'fly';
    f.wp = pickWaypoint(f.pos);
    f.wpAge = 0;
    f.loiter = 0;
    tmp.copy(f.wp.pos).sub(f.pos).setY(0);
    if (tmp.lengthSq() > 1e-6) tmp.normalize();
    f.vel
      .copy(n)
      .multiplyScalar(0.3 * pace)
      .addScaledVector(tmp, 0.2 * pace);
    if (f.kick) {
      f.vel.add(f.kick);
      f.kick = null;
    }
  }

  // --- per frame -----------------------------------------------------------------
  /**
   * @param {object} cursor  { bx, by, present, width, height } in canvas CSS px
   * @param {Function} flowAt  (x, y, z, out) → world velocity of the cursor flow
   */
  function update(dt, t, camera, cursor, flowAt) {
    const fs = Math.floor(t * 14);
    const newStep = fs !== step;
    step = fs;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    if (burstLeft > 0) {
      burstLeft -= dt;
      if (burstLeft <= 0) fadeToRest();
    }
    manageLit(dt);

    flies.forEach((f, i) => {
      // --- pop on in the new color and scatter, after a weapon lands
      if (f.scatterIn >= 0) {
        f.scatterIn -= dt;
        if (f.scatterIn < 0) {
          light(f, 0, 0.1);
          f.mixing = true;
          f.flash = 0.45;
          f.flashPower = 1.35;
          const out = tmp.copy(f.pos).sub(center).setY(0).normalize();
          const kick = out.multiplyScalar((1.1 + Math.random() * 1.1) * pace).addScaledVector(UP, 0.45 * pace);
          if (grounded(f)) {
            f.kick = kick.clone();
            if (f.mode === 'lift') f.modeDur = Math.min(f.modeDur, f.modeT + 0.16);
            else beginLift(f, true);
          } else {
            f.vel.add(kick);
            f.wp = pickWaypoint(f.pos);
            f.wpAge = 0;
            f.loiter = 0;
          }
        }
      }
      if (f.mixing) {
        f.mix = Math.min(1, f.mix + dt / 0.15);
        if (f.mix >= 1) f.mixing = false;
      }
      if (f.dimIn >= 0) {
        f.dimIn -= dt;
        if (f.dimIn < 0) darken(f, 0.35);
      }

      // --- hover: light up (even past the limit), flicker, and shy away
      f.hovered = false;
      if (cursor.present) {
        const { x: sx, y: sy, z: sz } = toScreen(f.pos, camera, cursor.width, cursor.height);
        const ddx = sx - cursor.bx,
          ddy = sy - cursor.by;
        if (sz < 1 && ddx * ddx + ddy * ddy < 36 * 36) {
          f.hovered = true;
          if (f.flicker <= 0) {
            const d = Math.hypot(ddx, ddy) || 1;
            if (f.mode === 'rest' || f.mode === 'settle') beginLift(f, true);
            f.startle.addScaledVector(right, (ddx / d) * 0.7).addScaledVector(up, (-ddy / d) * 0.5);
          }
          f.flicker = 0.7;
        }
      }
      f.flicker -= dt;

      // --- movement
      if (f.mode === 'settle') {
        // Ease onto the surface: a Hermite curve from the approach (keeping its
        // velocity) to the resting point, turning to the resting pose.
        f.modeT += dt;
        const s = Math.min(1, f.modeT / f.modeDur);
        const s2 = s * s,
          s3 = s2 * s;
        const d = f.modeDur;
        const land = f.wp.land;
        f.pos
          .set(0, 0, 0)
          .addScaledVector(f.from, 2 * s3 - 3 * s2 + 1)
          .addScaledVector(f.fromVel, (s3 - 2 * s2 + s) * d)
          .addScaledVector(land.rest, -2 * s3 + 3 * s2);
        f.obj.quaternion.slerpQuaternions(f.fromQuat, f.landQuat, smooth(Math.min(1, s * 1.25)));
        if (f.wings) f.wings.scale.x = s > 0.8 ? 0.25 : newStep ? ((fs + i) % 2 ? 1 : 0.35) : f.wings.scale.x;
        f.vel.set(0, 0, 0);
        if (s >= 1) {
          f.mode = 'rest';
          f.restLeft = 2.5 + Math.random() * 4.5;
        }
      } else if (f.mode === 'rest') {
        f.restLeft -= dt;
        f.pos.copy(f.wp.land.rest);
        if (f.wings) f.wings.scale.x = 0.25;
        if (f.restLeft <= 0) beginLift(f);
      } else if (f.mode === 'lift') {
        // Rise straight off the surface, then turn into flight.
        f.modeT += dt;
        const s = Math.min(1, f.modeT / f.modeDur);
        f.pos.lerpVectors(f.from, f.wp.land.hover, smooth(s));
        if (f.wings && newStep) f.wings.scale.x = (fs + i) % 2 ? 1 : 0.35;
        if (s >= 1) endLift(f);
      } else {
        flyStep(f, dt, t, flowAt);
        if (f.wings && newStep) f.wings.scale.x = (fs + i) % 2 ? 1 : 0.35; // wingbeat
      }
      f.startle.multiplyScalar(1 - Math.min(1, dt * 2.5));

      f.obj.position.copy(f.pos);
      if (f.mode === 'fly') {
        const hs = Math.hypot(f.vel.x, f.vel.z);
        if (hs > 0.02) {
          look.set(f.vel.x, THREE.MathUtils.clamp(f.vel.y, -hs, hs) * 0.7, f.vel.z).add(f.pos);
          basis.lookAt(look, f.pos, UP);
          qTarget.setFromRotationMatrix(basis);
          f.obj.quaternion.slerp(qTarget, 1 - Math.exp(-dt * 9));
        }
      }

      // --- glow: lit set, landing, burst, hover and click
      if (f.litDelay > 0) f.litDelay -= dt;
      else {
        const target = f.inSet ? 1 : 0;
        const d = dt * f.fadeRate;
        f.lit = target > f.lit ? Math.min(target, f.lit + d) : Math.max(target, f.lit - d);
      }
      let g = f.show ?? f.lit * (0.88 + 0.12 * Math.sin(t * 3.1 + f.seed));
      // Struck by lightning: a hot, erratic strobe that burns out over the zap.
      if (f.zapT > 0) {
        f.zapT = Math.max(0, f.zapT - dt);
        g = Math.random() < 0.55 ? 1.5 * Math.min(1, f.zapT * 2 + 0.3) : 0.1;
      }
      if (f.hovered || f.flicker > 0) g = (fs + i) % 3 === 0 ? Math.max(0.05, g * 0.3) : Math.max(g, 0.9);
      if (f.flash > 0) {
        f.flash = Math.max(0, f.flash - dt);
        g = Math.max(g, Math.sqrt(f.flash / 0.5) * f.flashPower);
      }
      f.glow +=
        (g - f.glow) * Math.min(1, dt * (f.zapT > 0 || f.flicker > 0 || f.flash > 0 || f.show != null ? 40 : 20));

      // Saturated flame colors (mid → hi), never washed out to white; a hot one leans to the core.
      const k = Math.min(1, f.glow);
      tone(f, 1, col).lerp(tone(f, 2, colB), smooth(k));
      const heat = Math.max(f.heat, Math.min(1, f.zapT * 1.5));
      if (heat > 0) col.lerp(tone(f, 3, colB), heat * 0.6);
      col.multiplyScalar(0.45 + f.glow * 0.7);
      f.lanternColor.copy(UNLIT).lerp(col, smooth(Math.min(1, k * 4)));
      tone(f, 2, f.haloColor[0]);
      f.haloOpacity[0] = Math.min(1.2, f.glow) * 0.22;
      tone(f, 1, f.haloColor[1]);
      f.haloOpacity[1] = Math.min(1.2, f.glow) * 0.08;
      f.haloOn = f.glow > 0.02;
    });

    if (trails) stepTrails(dt);

    // Point lights follow the brightest fireflies.
    byGlow.sort((a, b) => b.glow - a.glow);
    for (let j = 0; j < lights.length; j++) {
      const l = lights[j];
      const f = byGlow[j];
      f.lantern.getWorldPosition(lanternWorld);
      l.position.copy(lanternWorld);
      tone(f, 1, l.color).lerp(tone(f, 2, colB), 0.5);
      l.intensity = Math.min(1.3, f.glow) * 1.2;
    }
  }

  // --- drawing -------------------------------------------------------------------
  const meshes = [...kinds, haloMesh];
  const lanternTint = kinds[lanternKind].geometry.attributes.tint;
  const haloTint = haloMesh.geometry.attributes.tint;
  const modelView = new THREE.Matrix4();
  const projScreen = new THREE.Matrix4();
  const depth = new THREE.Vector4();
  // Every halo (two a fly), and the ones showing this frame, back to front.
  const haloSlots = flies.flatMap((f, i) => [0, 1].map((k) => ({ f, k, id: i * 2 + k, z: 0 })));
  const haloOrder = [];
  // (three.js's order for see-through meshes: farther first, and the one made first on a tie:
  // a fly's inner halo before its outer one.)
  const backToFront = (a, b) => (a.z !== b.z ? b.z - a.z : a.id - b.id);

  /**
   * Write the flies into their instances for the frame about to be drawn with `camera`
   * (sceneUpdate.js calls it once the camera has moved, right before the draw): see the top of
   * the file for why each part's matrix is in view space.
   */
  function place(camera) {
    camera.updateMatrixWorld();
    const toView = camera.matrixWorldInverse;
    projScreen.multiplyMatrices(camera.projectionMatrix, toView);
    for (const m of meshes) m.matrixWorld.copy(camera.matrixWorld);
    flies.forEach((f, i) => {
      f.obj.updateMatrixWorld(true);
      for (let p = 0; p < kinds.length; p++)
        kinds[p].setMatrixAt(i, modelView.multiplyMatrices(toView, f.rig[p].matrixWorld));
      const c = f.lanternColor;
      lanternTint.setXYZW(i, c.r, c.g, c.b, 1);
    });
    for (const m of kinds) m.instanceMatrix.needsUpdate = true;
    lanternTint.needsUpdate = true;
    // The halos showing, sorted the way three.js would sort them as meshes of their own (its
    // depth: the sphere's middle through the halo's world matrix, then the camera's).
    haloOrder.length = 0;
    for (const h of haloSlots) {
      if (!h.f.haloOn) continue;
      h.z = depth
        .copy(sphere.boundingSphere.center)
        .applyMatrix4(h.f.halos[h.k].matrixWorld)
        .applyMatrix4(projScreen).z;
      haloOrder.push(h);
    }
    haloOrder.sort(backToFront);
    for (let j = 0; j < haloOrder.length; j++) {
      const { f, k } = haloOrder[j];
      haloMesh.setMatrixAt(j, modelView.multiplyMatrices(toView, f.halos[k].matrixWorld));
      const c = f.haloColor[k];
      haloTint.setXYZW(j, c.r, c.g, c.b, f.haloOpacity[k]);
    }
    haloMesh.count = haloOrder.length;
    haloMesh.visible = haloOrder.length > 0;
    haloMesh.instanceMatrix.needsUpdate = true;
    haloTint.needsUpdate = true;
  }

  /**
   * Orbiting (the visualizer): circle a point at a radius and height band, steering
   * like flight (so it eases in and out), never through the scenery.
   */
  const orbitTo = new THREE.Vector3();
  function orbitStep(f, dt, t) {
    const o = f.orbit;
    const dx = f.pos.x - o.x;
    const dz = f.pos.z - o.z;
    const a = Math.atan2(dz, dx) + o.w * 0.35; // aim a little ahead along the circle
    const y = o.y + Math.sin(t * 1.3 + f.seed) * o.h;
    orbitTo.set(o.x + Math.cos(a) * o.r, y, o.z + Math.sin(a) * o.r);
    desired.copy(orbitTo).sub(f.pos).multiplyScalar(2.2);
    const sp = desired.length();
    const max = (0.6 + Math.abs(o.w) * o.r * 1.2) * pace;
    if (sp > max) desired.multiplyScalar(max / sp);
    desired.add(f.startle);
    f.vel.lerp(desired, 1 - Math.exp(-dt * 3));
    f.pos.addScaledVector(f.vel, dt);
    const fl = terrain.solid(f.pos.x, f.pos.z) + MARGIN;
    if (f.pos.y < fl) {
      f.pos.y = fl;
      f.vel.y = Math.max(0, f.vel.y);
    }
    f.pos.y = Math.min(f.pos.y, 2.5);
    f.wpAge = 0;
  }

  // Light trails (the visualizer): a lit firefly moving fast leaves specks of its light
  // that fade behind it, so darting and orbiting draw streaks.
  const trails = trailMaterial && !reducedMotion ? makeTrails(trailMaterial, Math.max(64, count * 14)) : null;
  const lanternNow = new THREE.Vector3();
  function makeTrails(material, n) {
    return {
      points: createPoints(n, material),
      n,
      age: new Float32Array(n).fill(1e3),
      life: new Float32Array(n).fill(1),
      base: new Float32Array(n * 3),
      next: 0,
    };
  }
  function stepTrails(dt) {
    const T = trails;
    const P = T.points.geometry.attributes.position.array;
    const C = T.points.geometry.attributes.color.array;
    const S = T.points.geometry.attributes.size.array;
    const A = T.points.geometry.attributes.alpha.array;
    for (const f of flies) {
      const speed = f.vel.length();
      if (f.glow < 0.35 || speed < 0.4) {
        f.trailAt = 0;
        continue;
      }
      f.trailAt += dt * speed * 22 * Math.min(1.2, f.glow); // specks per metre, brighter = denser
      f.lantern.getWorldPosition(lanternNow);
      while (f.trailAt >= 1) {
        f.trailAt -= 1;
        const j = T.next++ % T.n;
        P[j * 3] = lanternNow.x + (Math.random() - 0.5) * 0.02;
        P[j * 3 + 1] = lanternNow.y + (Math.random() - 0.5) * 0.02;
        P[j * 3 + 2] = lanternNow.z + (Math.random() - 0.5) * 0.02;
        tone(f, f.heat > 0.5 ? 3 : 2, col).lerp(tone(f, 1, colB), Math.random() * 0.5);
        T.base[j * 3] = col.r;
        T.base[j * 3 + 1] = col.g;
        T.base[j * 3 + 2] = col.b;
        T.age[j] = 0;
        T.life[j] = 0.3 + Math.random() * 0.35;
      }
    }
    for (let j = 0; j < T.n; j++) {
      T.age[j] += dt;
      const k = T.age[j] / T.life[j];
      if (k >= 1) {
        S[j] = 0;
        continue;
      }
      P[j * 3 + 1] -= dt * 0.05; // light specks sink a little as they fade
      const fade = (1 - k) * 0.9;
      C[j * 3] = T.base[j * 3] * fade;
      C[j * 3 + 1] = T.base[j * 3 + 1] * fade;
      C[j * 3 + 2] = T.base[j * 3 + 2] * fade;
      S[j] = k < 0.3 ? 1.4 : 1;
      A[j] = 1 - k;
    }
    markDirty(T.points);
  }

  /**
   * A dash (the visualizer): `dist` metres along `dir` over `dur` seconds, starting fast
   * and stopping dead; or with `bounce`, up and back down like a ball (the path of a
   * throw). The move is its velocity, steered hard, so the scenery still stops it.
   */
  const DIRS = { up: [0, 1, 0], down: [0, -1, 0] };
  function dart(f, dir, { dist = 0.3, dur = 0.25, bounce = false } = {}) {
    if (reducedMotion || f.orbit || f.mode !== 'fly') return false;
    const d = new THREE.Vector3();
    if (dir === 'left' || dir === 'right')
      d.copy(right)
        .setY(0)
        .normalize()
        .multiplyScalar(dir === 'left' ? -1 : 1);
    else if (dir === 'toward' || dir === 'away')
      d.copy(right)
        .cross(UP)
        .normalize()
        .multiplyScalar(dir === 'away' ? -1 : 1);
    else if (dir === 'in' || dir === 'out')
      d.set(f.pos.x - center.x, 0, f.pos.z - center.z)
        .normalize()
        .multiplyScalar(dir === 'in' ? -1 : 1);
    else if (DIRS[dir]) d.fromArray(DIRS[dir]);
    else d.copy(dir).normalize();
    f.dart = { dir: d, dist, dur: Math.max(0.05, dur), t: 0, bounce };
    f.loiter = 0;
    return true;
  }
  /** A dash's velocity: x(u) = 1 − (1 − u)³ (a dart), or 4u(1 − u) (a bounce). */
  function dartStep(f, dt) {
    const D = f.dart;
    D.t += dt;
    const u = Math.min(1, D.t / D.dur);
    const rate = D.bounce ? 4 - 8 * u : 3 * (1 - u) * (1 - u);
    desired.copy(D.dir).multiplyScalar((rate * D.dist) / D.dur);
    if (u >= 1) f.dart = null;
  }

  /** Flight: toward the waypoint, meandering, clear of the fire and the scenery. */
  function flyStep(f, dt, t, flowAt) {
    if (f.orbit) {
      f.dart = null;
      orbitStep(f, dt, t);
      return;
    }
    const land = f.wp.land;
    const toWp = tmp.copy(f.wp.pos).sub(f.pos);
    const dist = toWp.length();
    const final = land && !f.dart && dist < 0.45;
    f.wpAge += dt;
    if (f.dart) {
      dartStep(f, dt);
      f.vel.lerp(desired, 1 - Math.exp(-dt * 30));
      moveThrough(f, dt, false);
      return;
    }
    if (f.wpAge > 10 && f.loiter <= 0) {
      f.wp = pickWaypoint(f.pos);
      f.wpAge = 0;
      return;
    }
    if (f.loiter > 0) {
      f.loiter -= dt;
      const s = t * 1.3 + f.seed;
      desired.set(Math.cos(s) * 0.12, Math.sin(s * 1.7) * 0.06, Math.sin(s) * 0.12);
      if (f.loiter <= 0) {
        f.wp = pickWaypoint(f.pos);
        f.wpAge = 0;
      }
    } else if (land && dist < 0.05) {
      beginSettle(f);
      return;
    } else if (!land && dist < 0.22) {
      f.loiter = 0.5 + Math.random() * 1.6;
      desired.set(0, 0, 0);
    } else {
      const cruise = (0.32 + (noise.noise(t * 0.3, f.seed) + 1) * 0.12) * pace;
      // Slow into the hover spot in front of a landing; ease in to air waypoints.
      const speed = cruise * Math.min(1, dist / (land ? 0.5 : 0.6));
      desired.copy(toWp).multiplyScalar(Math.max(speed, land ? 0.06 : 0) / (dist || 1));
      const meander = land ? Math.min(1, dist / 0.6) : 1; // straight on the final approach
      desired.x += noise.noise(t * 0.7, f.seed + 11) * 0.18 * pace * meander;
      desired.z += noise.noise(t * 0.7, f.seed + 23) * 0.18 * pace * meander;
      desired.y += Math.sin(t * 2.4 + f.seed) * 0.06 * meander; // bob
    }
    // Keep out of the fire.
    const hx = f.pos.x - center.x,
      hz = f.pos.z - center.z;
    const hr = Math.hypot(hx, hz);
    if (hr < 0.95 && f.pos.y < 1.6) {
      desired.x += (hx / (hr || 1)) * 0.8;
      desired.z += (hz / (hr || 1)) * 0.8;
    }
    // Look ahead: climb over what's coming and veer away from tall things.
    if (!final) {
      const v = f.vel.lengthSq() > 1e-4 ? tmpD.copy(f.vel).normalize() : tmpD.copy(toWp).normalize();
      let ground = terrain.solid(f.pos.x, f.pos.z);
      for (const a of [0.2, 0.45]) ground = Math.max(ground, terrain.solid(f.pos.x + v.x * a, f.pos.z + v.z * a));
      const need = ground + CLEAR - f.pos.y;
      if (need > 0) {
        desired.y += Math.min(1.2, need * 4);
        terrain.slope(f.pos.x + v.x * 0.3, f.pos.z + v.z * 0.3, grad);
        if (grad.lengthSq() > 1e-4) desired.addScaledVector(grad.normalize(), -Math.min(0.5, need * 2));
      }
    }
    desired.add(f.startle);
    // Leashed (the visualizer): drift back in when roaming too far from the fire.
    if (f.leash) {
      const lx = f.pos.x - f.leash.x,
        lz = f.pos.z - f.leash.z;
      const ld = Math.hypot(lx, lz);
      if (ld > f.leash.r) {
        desired.x -= (lx / ld) * (ld - f.leash.r) * 1.5;
        desired.z -= (lz / ld) * (ld - f.leash.r) * 1.5;
      }
      if (land && Math.hypot(f.wp.pos.x - f.leash.x, f.wp.pos.z - f.leash.z) > f.leash.r + 0.6) {
        f.wp = pickWaypoint(f.pos);
        f.wpAge = 0;
      }
    }
    if (flowAt) desired.add(flowAt(f.pos.x, f.pos.y, f.pos.z, flow).multiplyScalar(0.35));
    if (!final) desired.add(drift);
    f.vel.lerp(desired, 1 - Math.exp(-dt * (final ? 4 : 1.8)));
    moveThrough(f, dt, final);
  }

  /** Move, never into the scenery: slide along what's in the way. */
  function moveThrough(f, dt, final) {
    const floor = (x, z) => (final ? terrain.top(x, z) : terrain.solid(x, z)) + MARGIN;
    const here = floor(f.pos.x, f.pos.z);
    const inside = f.pos.y < here;
    const nx = f.pos.x + f.vel.x * dt,
      ny = f.pos.y + f.vel.y * dt,
      nz = f.pos.z + f.vel.z * dt;
    const ok = (x, z) => {
      const fl = floor(x, z);
      return ny >= fl || (inside && fl <= here);
    };
    if (ok(nx, nz)) f.pos.set(nx, ny, nz);
    else if (ok(nx, f.pos.z)) {
      f.pos.set(nx, ny, f.pos.z);
      f.vel.z *= -0.2;
    } else if (ok(f.pos.x, nz)) {
      f.pos.set(f.pos.x, ny, nz);
      f.vel.x *= -0.2;
    } else {
      f.pos.y = ny;
      f.vel.x *= -0.2;
      f.vel.z *= -0.2;
      f.vel.y = Math.max(f.vel.y, 0.2);
    }
    const fl = floor(f.pos.x, f.pos.z);
    if (f.pos.y < fl) {
      f.pos.y = inside ? Math.min(fl, Math.max(f.pos.y, here - 0.001) + dt * 1.5) : fl;
      f.vel.y = Math.max(f.vel.y, 0);
    }
    f.pos.y = Math.min(f.pos.y, 2.5);
  }

  /** After the burst: keep `litCount` lit and quickly fade the rest out. */
  function fadeToRest() {
    const order = flies.slice().sort((a, b) => grounded(b) - grounded(a) || Math.random() - 0.5);
    order.forEach((f, j) => {
      f.dimIn = -1;
      if (j < litCount || grounded(f)) light(f, 0, 0.1);
      else f.dimIn = Math.random() * 0.45;
    });
    rotateIn = 2.5;
  }

  /**
   * A new weapon lands: each firefly pops on in the new flame's colors on its own
   * beat and darts off. `ramp` is the new [lo, mid, hi, core] (sRGB hexes).
   */
  function burst(ramp) {
    burstLeft = reducedMotion ? 0.8 : 1.3;
    rampOld = rampNew;
    rampNew = hexes(ramp);
    for (const f of flies) {
      f.mix = 0;
      f.mixing = false;
      f.dimIn = -1;
      f.scatterIn = reducedMotion ? 0 : Math.random() * 0.55;
    }
  }

  /** A beat: every firefly blinks together, like synchronous fireflies (no startle). `power` 0..1. */
  function pulse(power = 1) {
    for (const f of flies) {
      const busy = f.flash > 0.3;
      f.flash = Math.max(f.flash, 0.3);
      f.flashPower = Math.max(busy ? f.flashPower : 0, 0.6 + 0.6 * power);
    }
  }

  /**
   * A beat to dance to (the visualizer): flying fireflies hop and swing around the fire,
   * one way then the other (`dir`), never out toward the edges; a strong beat (`lift`
   * 0..1) takes a few resting ones off their perches.
   */
  function dance(power = 1, { dir = 1, lift = 0 } = {}) {
    if (reducedMotion) return;
    for (const f of flies) {
      if (f.mode === 'fly' && !f.orbit) {
        const hx = f.pos.x - center.x;
        const hz = f.pos.z - center.z;
        const hr = Math.hypot(hx, hz) || 1;
        const inward = hr > 1.8 ? -0.35 : 0; // those out wide swing back in
        f.startle.x += ((-hz / hr) * dir * 0.7 + (hx / hr) * inward) * power;
        f.startle.z += ((hx / hr) * dir * 0.7 + (hz / hr) * inward) * power;
        f.startle.y += power * (0.55 + 0.25 * Math.random()); // the hop
      } else if ((f.mode === 'rest' || f.mode === 'settle') && Math.random() < lift * 0.2) {
        beginLift(f, true);
      }
    }
  }

  /**
   * Lightning jumps to a firefly (the tesla ball): it flickers white-hot for a moment and
   * is knocked away from `from` (world). Returns the firefly struck, or null.
   */
  function zap(f, from, power = 1) {
    if (!f) return null;
    f.zapT = 0.5 + 0.5 * power;
    if (!reducedMotion) {
      const kick = tmp
        .copy(f.pos)
        .sub(from)
        .setY(0.25)
        .normalize()
        .multiplyScalar(0.8 * power);
      if (f.mode === 'fly') f.startle.add(kick);
      else if (f.mode === 'rest' || f.mode === 'settle') {
        f.kick = kick.clone();
        beginLift(f, true);
      }
    }
    return f;
  }
  /** The firefly nearest `p` (world) within `radius`, not already flickering from a strike. */
  function nearest(p, radius) {
    let best = null,
      bd = radius * radius;
    for (const f of flies) {
      if (f.zapT > 0) continue;
      const d = f.pos.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** Click: every firefly flashes; ones near the click flash hardest and dart off. */
  function flash(x, y, camera, width, height) {
    for (const f of flies) {
      const { x: sx, y: sy } = toScreen(f.pos, camera, width, height);
      const near = Math.hypot(sx - x, sy - y) < 160;
      f.flash = 0.5;
      f.flashPower = near ? 1.6 : 1.1;
      if (near && !reducedMotion) {
        if (f.mode === 'rest' || f.mode === 'settle') {
          f.kick = tmp.copy(f.pos).sub(center).setY(0.3).normalize().multiplyScalar(0.9).clone();
          beginLift(f, true);
        } else if (f.mode === 'fly') {
          f.startle.add(tmp.copy(f.pos).sub(center).setY(0.3).normalize().multiplyScalar(0.9));
          f.wp = pickWaypoint(f.pos);
          f.wpAge = 0;
          f.loiter = 0;
        }
      }
    }
  }

  return {
    group,
    flies,
    /** The fire on the ground (world): what they circle, and what a leash or a dart 'in' pulls toward. */
    center,
    update,
    /** Write the flies into their instances for the frame about to be drawn (see place()). */
    place,
    flash,
    zap,
    nearest,
    pulse,
    dance,
    dart,
    /** World m/s added to every firefly in flight (the scene eases it: the page's scrolling). */
    drift,
    burst,
    trails: trails?.points ?? null,
    /** Send resting ones (those `which` picks) up into the air. */
    lift(which = () => true) {
      for (const f of flies) if ((f.mode === 'rest' || f.mode === 'settle') && which(f)) beginLift(f, true);
    },
    /** Switch colors at once (initial load, instant equips). hexes: [lo, mid, hi, core] */
    setRamp(h) {
      rampNew = hexes(h);
      rampOld = rampNew;
      for (const f of flies) {
        f.mix = 1;
        f.mixing = false;
      }
    },
    /** How many fly lit at rest; the lit set rebalances toward it. */
    setLit(n) {
      litCount = Math.min(n, flies.length);
    },
    set speed(s) {
      pace = (reducedMotion ? 0.5 : 1) * s;
    },
    terrain,
    /** Counts for debugging/tests. */
    stats() {
      return {
        total: flies.length,
        set: flies.filter((f) => f.inSet).length,
        visible: flies.filter((f) => f.glow > 0.05).length,
        grounded: flies.filter(grounded).length,
        onWalls: flies.filter((f) => grounded(f) && Math.abs(f.wp.land.normal.y) < 0.5).length,
      };
    },
  };
}

/**
 * `material` takes its color and opacity from each instance's `tint` (rgba), flat across
 * the instance as a uniform is across a mesh. Made white and opaque, it draws the tint
 * exactly (1 × the tint), the way the material's own color and opacity drew before.
 */
function tinted(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'attribute vec4 tint;\nflat varying vec4 vTint;\nvoid main() {\n\tvTint = tint;',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'flat varying vec4 vTint;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor *= vTint;');
  };
  return material;
}
