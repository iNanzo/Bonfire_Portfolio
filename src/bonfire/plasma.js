// The lightning bonfire: a tesla (plasma) ball with no glass around it, throwing
// lightning at everything around it.
//
//   core      — a white-hot knot around the weapon's blade (the "electrode") inside a
//               big dithered glow, drawn hot so the pixel pass burns its heart into the
//               flame's core color.
//   strikes   — the violent part: a few heavy bolts (glowing ribbons with white-hot
//               centers, tapering as they go) lash out of the core and hit the ground,
//               logs and stones around the fire. Each holds for a moment, crackling,
//               then jumps somewhere new. Where one lands it flashes, lights the spot,
//               throws sparks and crawls away along the ground in smaller bolts.
//   filaments — thinner bolts reaching out from the core. Each drifts on the fire's
//               simplex noise (hot plasma creeps upward), bends with the cursor's flow and
//               re-crackles at `crackle` Hz. With nothing in the way it thins into a
//               spray of fading dendrites; if its path meets something solid it strikes
//               it instead, ending right there with a flash and a light.
//   arcs      — a couple of bolts crawl around the ball's surface, fading at both ends,
//               so it reads as a sphere with nothing holding it.
//   touch     — like a real plasma globe, the filaments nearest the cursor reach for it.
//   light     — the scene moves the fire's cast light into the ball and strobes it with
//               the crackle; point lights sit on the strongest strikes; `flash` tells the
//               scene when a strike lands, for a brief swell of light.
//
// Colors come from the flame's ramp. `level` (the fire's stoke level) makes the whole
// ball flare: more strikes, reaching further, brighter, forking more.
import * as THREE from 'three';
import { effects } from '../effects.js';
import { createBoltLines, hashSeed, seeded } from './bolts.js';
import { DITHER_GLSL } from './flame.js';

const MAX_FILAMENTS = 32;
const MAX_STRIKES = 8;
const CORE = 110;
const SPARKS = 160;
const FLASH = MAX_FILAMENTS * 3;
const CONTACT_LIGHTS = 4;
const IMPACT_GLOWS = 6;
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function points(n, material, withAlpha) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (withAlpha) g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  return p;
}

// A glow: a camera-facing disc, depth-tested like the particles, stepping inner → mid
// → outer with a dithered falloff. Its middle carries "heat" so the pixel pass burns
// it white-hot like the fire's heart.
const glowVertex = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    mv.z += uSize * 0.5; // toward the camera, so it wraps what it sits on
    gl_Position = projectionMatrix * mv;
  }
`;
const glowFragment = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform vec3 uInner;
  uniform vec3 uMid;
  uniform vec3 uOuter;
  uniform float uStrength;
  uniform float uHeat;
  varying vec2 vUv;
  ${DITHER_GLSL}
  void main() {
    if (gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy / resolution).x + 0.00002) discard;
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = pow(1.0 - r, 1.7) * uStrength;
    if (a < 0.999 && a <= pBayer4(gl_FragCoord.xy)) discard;
    vec3 c = r < 0.22 ? uInner : r < 0.5 ? uMid : uOuter;
    gl_FragColor = vec4(c * (r < 0.22 ? 1.0 : 0.7), uHeat * pow(max(0.0, 1.0 - r * 3.0), 2.0));
  }
`;
function glowSprite(fxMaterial) {
  const uniforms = {
    tDepth: fxMaterial.uniforms.tDepth, resolution: fxMaterial.uniforms.resolution,
    uInner: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uOuter: { value: new THREE.Color() },
    uSize: { value: 0.3 }, uStrength: { value: 1 }, uHeat: { value: 2.4 },
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms, vertexShader: glowVertex, fragmentShader: glowFragment,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true,
  }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, u: uniforms };
}

/**
 * @param {object} o
 * @param {THREE.Material} o.fxMaterial   additive, no heat (bolts, sparks)
 * @param {THREE.Material} o.hotMaterial  additive with heat (the core)
 * @param {object} o.field                shared noise (curl.js)
 * @param {THREE.Vector3} o.origin        fire center on the ground
 */
export function createPlasma({ fxMaterial, hotMaterial, field, origin, reducedMotion = false }) {
  const bolts = createBoltLines(fxMaterial, MAX_FILAMENTS * 70 + 400, 1600);
  const core = points(CORE, hotMaterial, false);
  const sparks = points(SPARKS, fxMaterial, true);
  const flashes = points(FLASH, fxMaterial, true);
  const C = { pos: core.geometry.attributes.position.array, col: core.geometry.attributes.color.array, size: core.geometry.attributes.size.array };
  const S = { pos: sparks.geometry.attributes.position.array, col: sparks.geometry.attributes.color.array, size: sparks.geometry.attributes.size.array, alpha: sparks.geometry.attributes.alpha.array };
  const Fl = { pos: flashes.geometry.attributes.position.array, col: flashes.geometry.attributes.color.array, size: flashes.geometry.attributes.size.array, alpha: flashes.geometry.attributes.alpha.array };
  const sVel = new Float32Array(SPARKS * 3);
  const sAge = new Float32Array(SPARKS).fill(1);
  const sLife = new Float32Array(SPARKS).fill(0);
  let sNext = 0;

  const glow = glowSprite(fxMaterial);
  const impacts = Array.from({ length: IMPACT_GLOWS }, () => glowSprite(fxMaterial));
  for (const g of impacts) g.u.uHeat.value = 1.8;
  const lights = Array.from({ length: reducedMotion ? 0 : CONTACT_LIGHTS }, () => new THREE.PointLight(0x8cc8ff, 0, 2.4, 2));

  let ramp = ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'].map((h) => new THREE.Color(h));
  const white = new THREE.Color('#ffffff');
  const tmp = new THREE.Color();
  const sample = (h, out) => {
    const x = Math.min(0.999, Math.max(0, h)) * 3;
    const k = Math.floor(x);
    return out.copy(ramp[k]).lerp(ramp[k + 1], x - k);
  };

  let active = false;
  let amount = 0;     // 0 = gone, 1 = full ball (eased in and out)
  let live = false;   // anything still drawn
  let coreStep = -1;
  let lightFlicker = 1;
  let lastSnap = -1;  // when the cast light last snapped bright (kept to a few a second)
  let flash = 0;      // a discharge: the scene swells its light with this
  let lastFlash = -1e3;
  let ground = null;  // (x, z) → height of the scenery there, once the model has loaded
  const groundAt = (x, z) => (ground ? ground(x, z) : 0);

  // --- filament layout: even directions on a sphere, nudged upward -------------------
  const base = Array.from({ length: MAX_FILAMENTS }, () => new THREE.Vector3());
  const dirs = Array.from({ length: MAX_FILAMENTS }, () => new THREE.Vector3());
  const touch = new Float32Array(MAX_FILAMENTS); // how hard the cursor is pulling each one
  const struck = new Int32Array(MAX_FILAMENTS).fill(-1); // crackle step of each filament's last strike
  let laidOut = 0;
  function layout(n) {
    laidOut = n;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - ((i + 0.5) / n) * 2;
      const r = Math.sqrt(1 - y * y);
      base[i].set(Math.cos(i * golden) * r, y * 0.8 + 0.2, Math.sin(i * golden) * r).normalize();
    }
  }

  // --- strikes: where each heavy bolt is landing, and until when ---------------------
  const strikes = Array.from({ length: MAX_STRIKES }, (_, i) => ({ x: 0, y: 0, z: 0, until: -1, born: 0, on: false, seed: i }));

  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const flowV = new THREE.Vector3();
  const pull = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const contacts = []; // this frame's strikes, strongest first: { x, y, z, k, glow }

  function emitSpark(x, y, z, dx, dy, dz, burst) {
    const i = sNext;
    sNext = (sNext + 1) % SPARKS;
    const ix = i * 3;
    S.pos[ix] = x; S.pos[ix + 1] = y; S.pos[ix + 2] = z;
    const sp = (0.5 + Math.random() * 0.9) * (1 + burst);
    sVel[ix] = dx * sp + (Math.random() - 0.5) * 0.9;
    sVel[ix + 1] = dy * sp + Math.random() * 0.9;
    sVel[ix + 2] = dz * sp + (Math.random() - 0.5) * 0.9;
    sAge[i] = 0;
    sLife[i] = 0.15 + Math.random() * 0.4 * (1 + burst * 0.5);
  }

  /**
   * Where a straight reach from the core first lands on the scenery, or null. The
   * height map only knows top surfaces (the core hangs inside the logs' teepee, which
   * it reads as solid), so a reach only strikes after it has been in open air.
   */
  function contactAlong(dir, from, to, out) {
    if (!ground) return null;
    const STEPS = 12;
    let prev = from;
    let clear = false;
    for (let k = 1; k <= STEPS; k++) {
      const s = from + ((to - from) * k) / STEPS;
      q.copy(center).addScaledVector(dir, s);
      const below = q.y <= ground(q.x, q.z) + 0.015;
      if (!below) { clear = true; prev = s; continue; }
      if (clear) {
        // Settle on the surface between the last clear step and this one.
        let lo = prev, hi = s;
        for (let r = 0; r < 4; r++) {
          const m = (lo + hi) / 2;
          q.copy(center).addScaledVector(dir, m);
          if (q.y <= ground(q.x, q.z) + 0.015) hi = m; else lo = m;
        }
        return out.copy(center).addScaledVector(dir, hi);
      }
      prev = s;
    }
    return null;
  }

  /** Smaller bolts crawling away along the ground from where a strike lands. */
  function crawl(x, y, z, heading, k, rng, n, reach) {
    for (let c = 0; c < n; c++) {
      const h = heading + (rng() - 0.5) * 1.8;
      const len = reach * (0.45 + rng() * 0.55);
      const ex = x + Math.cos(h) * len, ez = z + Math.sin(h) * len;
      bolts.bolt(x, y + 0.01, z, ex, groundAt(ex, ez) + 0.015, ez, {
        rng, depth: 3, jag: 0.32, up: UP, width: (t) => 2.2 - t * 1.4, heat: 1.1,
        color: (t, out) => sample(0.72 - t * 0.3, out).multiplyScalar(k * 0.85), alpha: (t) => 1 - t * t,
      });
    }
  }

  /**
   * @param {number} level  the fire's stoke level (1 = resting)
   * @param {object} o
   * @param {THREE.Ray|null} o.ray  the cursor's ray into the scene (null when it's away)
   * @param {(x,y,z,out:THREE.Vector3)=>THREE.Vector3} [o.flow]  cursor flow at a world point
   */
  function step(dt, t, level, { ray = null, flow = null } = {}) {
    const L = effects.lightning;
    amount = Math.min(1, Math.max(0, amount + (active ? dt / 0.55 : -dt / 0.35)));
    flash *= Math.exp(-dt * 10);
    let anySpark = false;
    for (let i = 0; i < SPARKS; i++) if (sAge[i] < sLife[i]) { anySpark = true; break; }
    if (amount <= 0 && !anySpark) {
      if (live) {
        bolts.clear();
        for (const [pts, arr] of [[core, C.size], [sparks, S.size], [flashes, Fl.size]]) { arr.fill(0); pts.geometry.attributes.size.needsUpdate = true; }
        glow.mesh.visible = false;
        for (const g of impacts) g.mesh.visible = false;
        for (const l of lights) l.intensity = 0;
        live = false;
      }
      return;
    }
    live = true;
    const stoked = Math.max(0, Math.min(2.2, level - 1)); // 0 at rest, up to 2.2 on an impact
    const grow = easeOutBack(amount);
    const R = L.size * grow * (1 + stoked * 0.08);
    const crackle = reducedMotion ? Math.min(6, L.crackle) : L.crackle;
    const cs = Math.floor(t * crackle);
    const drift = t * 0.35 * L.drift * (reducedMotion ? 0.4 : 1);
    const W = L.boltWidth;
    center.set(origin.x, L.height, origin.z);

    // --- where each filament points: drift + flow + the cursor's pull
    const n = L.filaments;
    if (n !== laidOut) layout(n);
    const shown = amount >= 1 ? n : Math.ceil(n * Math.min(1, amount * 1.3));
    for (let i = 0; i < n; i++) {
      const s = i * 7.31;
      v.set(field.noise.noise3d(s, drift, 0.5), field.noise.noise3d(s + 40, drift, 2.5) * 0.7 + 0.2, field.noise.noise3d(s + 80, drift, 4.5));
      dirs[i].copy(base[i]).addScaledVector(v, 0.8).normalize();
    }
    touch.fill(0);
    if (ray && L.cursorPull > 0) {
      // The ray's nearest approach to the ball: the closer the cursor, the harder
      // the nearest filaments reach for it.
      ray.closestPointToPoint(center, closest);
      const dist = closest.distanceTo(center);
      const strength = L.cursorPull * smoothstep(2.6 * L.size, 0.7 * L.size, dist) * amount;
      if (strength > 0.01 && dist > 1e-4) {
        pull.subVectors(closest, center).normalize();
        let best = -1, second = -1, bd = -2, sd = -2;
        for (let i = 0; i < n; i++) {
          const d = dirs[i].dot(pull);
          if (d > bd) { second = best; sd = bd; best = i; bd = d; } else if (d > sd) { second = i; sd = d; }
        }
        for (const [i, k] of [[best, strength], [second, strength * 0.45]]) {
          if (i < 0) continue;
          dirs[i].lerp(pull, k).normalize();
          touch[i] = k;
        }
      }
    }

    bolts.begin();
    contacts.length = 0;
    const jag = 0.06 + 0.3 * L.jag;
    const bright = L.brightness * Math.min(1, amount * 1.5) * (1 + stoked * 0.35);

    // --- strikes: heavy bolts lashing out to the scenery around the fire
    const nStrikes = active && amount > 0.3 ? Math.min(MAX_STRIKES, Math.round(L.strikes * (1 + stoked * 0.6))) : 0;
    for (let s = 0; s < MAX_STRIKES; s++) {
      const st = strikes[s];
      if (s >= nStrikes) { st.until = -1; continue; }
      if (t >= st.until) {
        // Jump: somewhere new around the fire, for a moment (sometimes a gap first).
        const rng = seeded(hashSeed(900 + s, cs, st.seed++));
        const ang = rng() * TAU;
        const r = (0.6 + rng() * 1.4) * (1 + stoked * 0.3);
        st.x = origin.x + Math.cos(ang) * r;
        st.z = origin.z + Math.sin(ang) * r;
        st.y = groundAt(st.x, st.z) + 0.01;
        st.born = t;
        st.until = t + 0.1 + rng() * (reducedMotion ? 1.2 : 0.45);
        st.on = rng() < 0.82;
        if (st.on && !reducedMotion) {
          for (let j = 0; j < 7; j++) emitSpark(st.x, st.y + 0.02, st.z, Math.cos(ang) * 0.5, 0.9, Math.sin(ang) * 0.5, 0.5 + stoked * 0.3);
        }
      }
      if (!st.on) continue;
      const rng = seeded(hashSeed(700 + s, cs));
      const fresh = t - st.born < 0.06 ? 1.35 : 1; // brightest the instant it lands
      const k = bright * fresh * (0.85 + rng() * 0.3);
      v.set(st.x - center.x, st.y - center.y, st.z - center.z).normalize();
      a.copy(center).addScaledVector(v, R * 0.12);
      bolts.bolt(a.x, a.y, a.z, st.x, st.y, st.z, {
        rng, depth: 5, jag: 0.16 + 0.14 * L.jag, width: (tt) => W * (1 - tt * 0.45), heat: 1.7,
        color: (tt, out) => sample(0.98 - tt * 0.3, out).multiplyScalar(k),
        each: (x, y, z, tt) => {
          // Forks: a few, thinning and fading away from the main channel.
          if (tt < 0.15 || rng() > 0.1 + 0.1 * L.branches) return;
          p.set(rng() - 0.5, rng() - 0.6, rng() - 0.5).normalize().multiplyScalar(0.9).add(v).normalize();
          const blen = (0.12 + rng() * 0.3) * (1 - tt * 0.5);
          const ey = Math.max(groundAt(x + p.x * blen, z + p.z * blen) + 0.015, y + p.y * blen);
          bolts.bolt(x, y, z, x + p.x * blen, ey, z + p.z * blen, {
            rng, depth: 3, jag: 0.3, width: (t2) => Math.max(1, W * 0.55 * (1 - t2)), heat: 1.2,
            color: (t2, out) => sample(0.72 - t2 * 0.25, out).multiplyScalar(k * 0.8), alpha: (t2) => 1 - t2 * t2,
          });
        },
      });
      crawl(st.x, st.y, st.z, Math.atan2(st.z - origin.z, st.x - origin.x), k, rng, 2 + (rng() < 0.6 ? 1 : 0), 0.55 + stoked * 0.2);
      contacts.push({ x: st.x, y: st.y, z: st.z, k: k * 1.4, glow: 0.18 * fresh });
    }

    // --- filaments: strike what they meet, or thin out into the air
    for (let i = 0; i < shown; i++) {
      const rng = seeded(hashSeed(i, cs));
      const hold = touch[i] > 0.3; // a touched filament steadies and brightens
      const flick = hold ? 1 : 0.6 + rng() * 0.4;
      const k = bright * flick * (1 + touch[i] * 0.5);
      // Filaments reach different lengths, breathing slowly; stoking stretches them.
      const len = R * (0.9 + 0.65 * (0.5 + 0.5 * field.noise.noise3d(i * 5.1, drift * 0.8, 13))) * (1 + stoked * 0.3 + touch[i] * 0.3);
      const r0 = R * 0.1;
      a.copy(center).addScaledVector(dirs[i], r0);
      const hit = contactAlong(dirs[i], r0, len, b);
      if (!hit) b.copy(center).addScaledVector(dirs[i], len);
      // Bend the body sideways on the noise (and the cursor's flow) so it snakes.
      const s = i * 3.7 + 11;
      v.set(field.noise.noise3d(s, drift * 1.7, 7), field.noise.noise3d(s + 20, drift * 1.7, 9), field.noise.noise3d(s + 40, drift * 1.7, 11));
      v.addScaledVector(dirs[i], -v.dot(dirs[i]));
      const reach = a.distanceTo(b);
      mid.lerpVectors(a, b, 0.5).addScaledVector(v, reach * 0.3 * (1 - touch[i]));
      if (flow) mid.addScaledVector(flow(mid.x, mid.y, mid.z, flowV), 0.1);
      const boost = touch[i] * 0.15;
      // Hot and solid near the core; a free end fades away over its last stretch.
      const colorAt = (tt, out) => sample((tt < 0.18 ? 1 - (tt / 0.18) * 0.34 : 0.66 - (tt - 0.18) * 0.32) + boost + (hit && tt > 0.9 ? 0.25 : 0), out).multiplyScalar(k);
      const fadeAt = hit ? () => 1 : (tt) => (tt < 0.6 ? 1 : Math.max(0, 1 - (tt - 0.6) / 0.4) ** 1.2);
      const fw = Math.max(1, W * 0.6); // filaments: thick at the core, a single texel by the end
      bolts.bolt(a.x, a.y, a.z, mid.x, mid.y, mid.z, {
        rng, depth: 3, jag, width: (tt) => fw - (fw - 1) * tt * (hit || hold ? 0.5 : 1), heat: 1.2,
        color: (tt, out) => colorAt(tt * 0.5, out), alpha: (tt) => fadeAt(tt * 0.5),
      });
      // Branches off the outer half: a fork or two, and on a free end, a spray of
      // dendrites that fade out with it.
      const forks = (rng() < L.branches ? (rng() < L.branches * 0.6 ? 2 : 1) : 0) + (hit ? 0 : 1 + Math.round(rng() * 2 * L.branches));
      const picks = new Set(Array.from({ length: forks }, () => 2 + Math.floor(rng() * 6)));
      let inner = 0;
      bolts.bolt(mid.x, mid.y, mid.z, b.x, b.y, b.z, {
        rng, depth: 3, jag, color: (tt, out) => colorAt(0.5 + tt * 0.5, out), alpha: (tt) => fadeAt(0.5 + tt * 0.5),
        width: hit || hold ? (fw + 1) / 2 : 1, heat: 1.2,
        each: forks ? (x, y, z, tt) => {
          inner++;
          if (!picks.has(inner)) return;
          const at = 0.5 + tt * 0.5;
          const start = fadeAt(at);
          if (start < 0.05) return;
          p.set(rng() - 0.5, rng() - 0.35, rng() - 0.5).normalize().multiplyScalar(0.9).add(dirs[i]).normalize();
          const blen = reach * (0.15 + rng() * 0.25);
          if (ground && y + p.y * blen < ground(x + p.x * blen, z + p.z * blen)) p.y = Math.abs(p.y); // don't fork into the ground
          bolts.bolt(x, y, z, x + p.x * blen, y + p.y * blen, z + p.z * blen, {
            rng, depth: 2, jag: jag * 1.2, color: (t2, out) => sample(0.5 - t2 * 0.2, out).multiplyScalar(k * 0.75),
            alpha: (t2) => start * (1 - t2) ** 1.2,
          });
        } : null,
      });
      if (hit) {
        contacts.push({ x: b.x, y: b.y, z: b.z, k, glow: 0.07 });
        // A fresh strike throws a few sparks off the surface.
        if (struck[i] !== cs && !reducedMotion && active) {
          struck[i] = cs;
          if (rng() < 0.5 + stoked * 0.3) for (let j = 0; j < 2; j++) emitSpark(b.x, b.y + 0.01, b.z, -dirs[i].x * 0.4, 0.6, -dirs[i].z * 0.4, stoked * 0.3);
        }
      } else if (!reducedMotion && active && Math.random() < dt * (0.8 + stoked * 6 + touch[i] * 8)) {
        emitSpark(b.x, b.y, b.z, dirs[i].x, dirs[i].y, dirs[i].z, stoked * 0.4);
      }
    }

    // --- arcs crawling around the ball's surface, fading at both ends
    for (let j = 0; j < 2; j++) {
      const rng = seeded(hashSeed(500 + j, cs));
      if (rng() > 0.7) continue;
      p.set(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize();
      q.set(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize();
      const rs = R * (0.6 + rng() * 0.25);
      const SEG = 5;
      let px0 = 0, py0 = 0, pz0 = 0, pa = 0;
      for (let s = 0; s <= SEG; s++) {
        const u = s / SEG;
        v.copy(p).lerp(q, u).normalize(); // close enough to a great circle for short arcs
        const x = center.x + v.x * rs, y = center.y + v.y * rs, z = center.z + v.z * rs;
        const al = Math.sin(Math.PI * u) * 0.9;
        if (s) {
          bolts.bolt(px0, py0, pz0, x, y, z, {
            rng, depth: 1, jag: 0.35, color: (tt, out) => sample(0.62, out).multiplyScalar(bright * 0.8),
            alpha: (tt) => pa + (al - pa) * tt,
          });
        }
        px0 = x; py0 = y; pz0 = z; pa = al;
      }
    }
    bolts.end();

    // --- where bolts land: a bright spot each, glows and lights on the strongest
    let f = 0;
    for (const c of contacts) {
      for (let j = 0; j < 3 && f < FLASH; j++, f++) {
        const fx = f * 3;
        Fl.pos[fx] = c.x + (j ? (Math.random() - 0.5) * 0.05 : 0);
        Fl.pos[fx + 1] = c.y + 0.012 + (j ? Math.random() * 0.03 : 0);
        Fl.pos[fx + 2] = c.z + (j ? (Math.random() - 0.5) * 0.05 : 0);
        sample(j ? 0.7 : 0.95, tmp).multiplyScalar(c.k);
        Fl.col[fx] = tmp.r; Fl.col[fx + 1] = tmp.g; Fl.col[fx + 2] = tmp.b;
        Fl.size[f] = j ? 1 : 2;
        Fl.alpha[f] = j ? 0.7 : 1;
      }
    }
    for (let j = f; j < FLASH; j++) Fl.size[j] = 0;
    for (const k of ['position', 'color', 'size', 'alpha']) flashes.geometry.attributes[k].needsUpdate = true;
    impacts.forEach((g, j) => {
      const c = contacts[j];
      g.mesh.visible = !!c && c.glow > 0.1;
      if (!g.mesh.visible) return;
      g.mesh.position.set(c.x, c.y + 0.03, c.z);
      g.u.uSize.value = c.glow * (0.9 + 0.3 * Math.random());
      g.u.uStrength.value = Math.min(1.3, 0.8 * c.k);
      g.u.uInner.value.copy(ramp[3]); g.u.uMid.value.copy(ramp[2]); g.u.uOuter.value.copy(ramp[1]);
    });
    lights.forEach((l, j) => {
      const c = contacts[j];
      if (!c) { l.intensity = 0; return; }
      l.position.set(c.x, c.y + 0.12, c.z);
      l.color.copy(ramp[2]).lerp(white, 0.35);
      l.intensity = 4.5 * c.k * (0.6 + 0.4 * seeded(hashSeed(800 + j, cs))()) * amount;
    });

    // --- core and its glow: re-scattered on every crackle, hotter when stoked
    glow.mesh.visible = amount > 0.02;
    glow.mesh.position.copy(center);
    glow.u.uSize.value = R * (0.7 + stoked * 0.2 + flash * 0.3);
    glow.u.uInner.value.copy(ramp[3]);
    glow.u.uMid.value.copy(ramp[2]);
    glow.u.uOuter.value.copy(ramp[1]);
    if (cs !== coreStep) {
      coreStep = cs;
      glow.u.uStrength.value = Math.min(1.5, (0.85 + Math.random() * 0.2 + stoked * 0.25) * bright);
      glow.u.uHeat.value = 2.6 * bright;
      const rc = (0.05 + stoked * 0.02) * grow;
      for (let i = 0; i < CORE; i++) {
        const ix = i * 3;
        const r = Math.cbrt(Math.random()) * rc;
        v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        C.pos[ix] = center.x + v.x * r; C.pos[ix + 1] = center.y + v.y * r; C.pos[ix + 2] = center.z + v.z * r;
        sample(0.8 + Math.random() * 0.2, tmp).multiplyScalar(0.45 * bright);
        C.col[ix] = tmp.r; C.col[ix + 1] = tmp.g; C.col[ix + 2] = tmp.b;
        C.size[i] = amount < 0.05 ? 0 : r < rc * 0.5 ? 2 : 1;
      }
      for (const k of ['position', 'color', 'size']) core.geometry.attributes[k].needsUpdate = true;
      // Cast light strobes with the crackle. Bright snaps are kept to about three a
      // second: fast, large flashes are hard on photosensitive eyes.
      let snap = 0;
      if (!reducedMotion && t - lastSnap > 0.33 && Math.random() < 0.35) { snap = 0.5 + Math.random() * 0.6; lastSnap = t; }
      lightFlicker = 0.85 + (snap + (Math.random() - 0.5) * (reducedMotion ? 0.05 : 0.2)) * L.flicker;
    }

    // --- sparks: quick, falling, bouncing, cooling hi → mid → lo
    for (let i = 0; i < SPARKS; i++) {
      if (sAge[i] >= sLife[i]) { S.size[i] = 0; continue; }
      sAge[i] += dt;
      const ix = i * 3;
      const drag = Math.exp(-dt * 2.2);
      sVel[ix] *= drag; sVel[ix + 1] = sVel[ix + 1] * drag - 2.4 * dt; sVel[ix + 2] *= drag;
      S.pos[ix] += sVel[ix] * dt; S.pos[ix + 1] += sVel[ix + 1] * dt; S.pos[ix + 2] += sVel[ix + 2] * dt;
      const floor = groundAt(S.pos[ix], S.pos[ix + 2]) + 0.015;
      if (S.pos[ix + 1] < floor) { S.pos[ix + 1] = floor; sVel[ix + 1] *= -0.35; sVel[ix] *= 0.6; sVel[ix + 2] *= 0.6; }
      const k = Math.min(1, sAge[i] / sLife[i]);
      sample(0.95 - k * 0.6, tmp).multiplyScalar(0.9);
      S.col[ix] = tmp.r; S.col[ix + 1] = tmp.g; S.col[ix + 2] = tmp.b;
      S.size[i] = k < 0.25 ? 2 : 1;
      S.alpha[i] = Math.min(1, (1 - k) * 2.5);
    }
    for (const k of ['position', 'color', 'size', 'alpha']) sparks.geometry.attributes[k].needsUpdate = true;
  }

  /** A jolt of sparks off every filament, and every strike jumps at once (weapon impacts, stokes). */
  function discharge(strength = 1) {
    for (const st of strikes) st.until = -1;
    if (reducedMotion) return;
    // A whole-scene flash, at most a couple a second however fast the fire is clicked.
    const now = performance.now();
    if (now - lastFlash > 450) { flash = Math.max(flash, strength); lastFlash = now; }
    const L = effects.lightning;
    center.set(origin.x, L.height, origin.z);
    const n = Math.min(laidOut || L.filaments, MAX_FILAMENTS);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2 * strength; j++) {
        const d = dirs[i].lengthSq() ? dirs[i] : base[i];
        emitSpark(center.x + d.x * L.size * 0.8, center.y + d.y * L.size * 0.8, center.z + d.z * L.size * 0.8, d.x, d.y, d.z, strength);
      }
    }
  }

  return {
    objects: [...bolts.objects, glow.mesh, ...impacts.map((g) => g.mesh), core, flashes, sparks],
    lights,
    step,
    discharge,
    /** Turn the ball on (grows in) or off (collapses); `instant` skips the ease. */
    setActive(on, instant = false) {
      active = on;
      if (instant) amount = on ? 1 : 0;
    },
    /** The scenery's height at (x, z): bolts strike what they meet. */
    setGround(fn) { ground = fn; },
    get amount() { return amount; },
    /** Multiplier for the fire's cast light while the ball is lit. */
    get lightFlicker() { return lightFlicker; },
    /** 0..1: the ball just discharged (decays fast); the scene flashes with it. */
    get flash() { return flash; },
    sets: [{ pos: S.pos, vel: sVel, n: SPARKS, geo: sparks.geometry, maxV: 2 }],
    setRamp(hexes) { ramp = hexes.map((h) => new THREE.Color(h)); },
  };
}
