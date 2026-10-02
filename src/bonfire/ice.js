// The ice element.
//
//   crystals — the bonfire encased in ice, grown like a natural crystal cluster (a
//              druse): one dominant crystal rises around the weapon's blade, a few
//              medium ones fan out from the same root, and a spray of small ones
//              radiates low over the ash — all from one point, as crystals do when they
//              grow from a seed. They form in that order, each popping up out of the
//              ground with a small overshoot. A few loose shards drift above them, a
//              low banked fire still burns inside (the scene turns the flame down),
//              frost motes twinkle up through the cold air and a little chill seeps off
//              and rolls away along the ground. Leaving ice, it all sinks back.
//              For the visualizer, a beat sends a glow up through the crystals (and
//              brightens the light they cast), and an echo throws their outlines out:
//              crisp wireframes of the bigger crystals growing away and fading, like
//              the blade's silhouette echo.
//   tufts    — whenever the ice emits (an echo: its slow pulse, a stoke, a ring, a beat),
//              a few tufts of ice sprout from the ash around the cluster: each a little
//              fan of three to five crystals from one root, popping up with an overshoot,
//              flicking off a glint or two and a breath of chill, then sinking back.
//   ring     — a weapon landing sends a ring of ice out across the ground: as the front
//              passes each spot a small cluster of shards spikes up, holds and sinks
//              back, so a ring of spikes expands outward and retracts behind itself. It
//              stops at whatever is in the way, piling taller shards against it. A
//              frost line marks the front, ice chips fly off each cluster as it breaks
//              the ground, and a tuft of chill rolls off the slam and trails the ring.
//
// Crystals are solid geometry on the outlined layer — hexagonal prisms with a slightly
// irregular section and an off-center point — so the pixel pass draws their facets and
// outlines. Their material is ice: a little translucent (a screen-door dither lets the
// blade, logs and banked fire show through; faces seen edge-on are more opaque, as in
// real ice) with a subtle glow in the flame's ramp that's brightest on the tips and rims
// and deepens toward the root.
import * as THREE from 'three';
import { effects } from '../effects.js';
import { createBoltLines, seeded } from './bolts.js';
import { ringNoise } from './rings.js';
import { clamp01, easeOutBack, TAU } from '../math.js';
import { createPoints, rampColors, setRampColors } from './points.js';
import { iceGlint } from './signatures.js';

const UP = new THREE.Vector3(0, 1, 0);
/** How far ice overshoots as it pops up (easeOutBack's `c`). */
const OVERSHOOT = 1.9;

// A crystal: hexagonal prism, slightly irregular and tapering, with an off-center point.
// Radius ~1, base at y = −0.15, tip at y = 1.
const R6 = [1, 0.84, 1.06, 0.9, 1.02, 0.88];
const ring6 = (y, s) => R6.map((r, i) => { const a = (i / 6) * TAU + 0.3; return new THREE.Vector3(Math.cos(a) * r * s, y, Math.sin(a) * r * s); });
const CRYSTAL = { lo: ring6(-0.15, 1), hi: ring6(0.72, 0.86), apex: new THREE.Vector3(0.16, 1, -0.1) };
// Its outline: the six side edges, the shoulder and the point.
/** A crystal's outline edges ([from, to] in its own space: base ring at y −0.15, point at y 1). */
export const CRYSTAL_EDGES = [];
const EDGES = CRYSTAL_EDGES;
for (let i = 0; i < 6; i++) {
  const j = (i + 1) % 6;
  EDGES.push([CRYSTAL.lo[i], CRYSTAL.hi[i]], [CRYSTAL.hi[i], CRYSTAL.hi[j]], [CRYSTAL.hi[i], CRYSTAL.apex]);
}

function crystalGeometry() {
  const { lo, hi, apex } = CRYSTAL;
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(lo[i], hi[i], lo[j]);
    tri(lo[j], hi[i], hi[j]);
    tri(hi[i], apex, hi[j]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

const vertexShader = /* glsl */ `
  attribute float aGlow;
  varying vec3 vWorld;
  varying float vH;
  varying float vGlow;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vH = position.y;
    vGlow = aGlow;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
// Flat facets from screen-space derivatives. Brightness from a soft key light, the
// height up the crystal, a rim toward the camera and a slow per-crystal breathing;
// the root glows deeper. Translucency is a screen-door dither locked to the pixel grid.
const fragmentShader = /* glsl */ `
  uniform vec3 uLo;
  uniform vec3 uMid;
  uniform vec3 uHi;
  uniform vec3 uCore;
  uniform float uGlow;
  uniform float uTime;
  uniform float uShimmer;
  uniform float uClarity;
  uniform float uBeat;             // a beat's glow (the visualizer), decaying
  uniform float uWave;             // ...rising through the crystals: 0 at the root, 1 at the tips
  varying vec3 vWorld;
  varying float vH;
  varying float vGlow;
  float iBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float iBayer4(vec2 a) { return iBayer2(0.5 * a) * 0.25 + iBayer2(a); }
  vec3 rampAt(float h) {
    h = clamp(h, 0.0, 1.0) * 3.0;
    vec3 c = mix(uLo, uMid, clamp(h, 0.0, 1.0));
    c = mix(c, uHi, clamp(h - 1.0, 0.0, 1.0));
    return mix(c, uCore, clamp(h - 2.0, 0.0, 1.0));
  }
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 v = normalize(cameraPosition - vWorld);
    if (dot(n, v) < 0.0) n = -n;
    float facing = max(0.0, dot(n, v));
    float rim = pow(1.0 - facing, 1.6);
    float y = clamp(vH, 0.0, 1.0);
    // Clear face-on, cloudier edge-on and at the frosted tips.
    float alpha = 1.0 - uClarity * (1.0 - rim) * (1.0 - 0.7 * smoothstep(0.72, 1.0, y));
    if (alpha < 0.999 && alpha <= iBayer4(gl_FragCoord.xy)) discard;
    float key = max(0.0, dot(n, normalize(vec3(-0.35, 0.85, 0.4))));
    float breathe = sin(uTime * 1.3 + vGlow * 6.2831) * 0.5 + 0.5;
    // A beat: the whole crystal brightens, most in a band sweeping up from the root.
    float wave = uBeat * exp(-pow((y - uWave + 0.2 * vGlow) * 5.0, 2.0));
    float h = 0.34 + 0.22 * key + 0.3 * rim + 0.14 * y + 0.08 * vGlow + uShimmer * 0.08 * breathe + 0.12 * uBeat + 0.3 * wave;
    vec3 col = mix(rampAt(h), rampAt(0.22), (1.0 - y) * (1.0 - y) * 0.45 * (1.0 - wave)); // the root glows deeper
    gl_FragColor = vec4(col * uGlow * (0.7 + 0.2 * vGlow + 0.15 * uShimmer * breathe) * (1.0 + 0.45 * uBeat + 0.8 * wave), 1.0);
  }
`;

function crystalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLo: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHi: { value: new THREE.Color() }, uCore: { value: new THREE.Color() },
      uGlow: { value: 1 }, uTime: { value: 0 }, uShimmer: { value: 0.5 }, uClarity: { value: 0.35 }, uBeat: { value: 0 }, uWave: { value: 0 },
    },
    vertexShader,
    fragmentShader,
  });
}

function crystalMesh(max) {
  const geo = crystalGeometry();
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGlow', glow);
  const mesh = new THREE.InstancedMesh(geo, crystalMaterial(), max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, glow: glow.array, glowAttr: glow };
}

function setRampUniforms(material, hexes) {
  const u = material.uniforms;
  u.uLo.value.set(hexes[0]); u.uMid.value.set(hexes[1]); u.uHi.value.set(hexes[2]); u.uCore.value.set(hexes[3]);
}

// Composing instance matrices.
const qLean = new THREE.Quaternion();
const qTwist = new THREE.Quaternion();
const axis = new THREE.Vector3();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const m4 = new THREE.Matrix4();
/** A crystal based at (x, y, z), tilted `tilt` rad toward heading `ang`, turned `twist` about its own axis. */
function place(mesh, slot, x, y, z, ang, tilt, twist, width, depth, height) {
  axis.set(Math.sin(ang), 0, -Math.cos(ang));
  qLean.setFromAxisAngle(axis, tilt);
  qTwist.setFromAxisAngle(UP, twist);
  qLean.multiply(qTwist);
  pos.set(x, y, z);
  scl.set(width, Math.max(1e-4, height), depth);
  mesh.setMatrixAt(slot, m4.compose(pos, qLean, scl));
}

// ---------------------------------------------------------------------------------
/**
 * The ice bonfire.
 * @param {object} o
 * @param {THREE.Material} o.fxMaterial  additive, no heat (frost motes)
 * @param {THREE.Vector3} o.origin       fire center on the ground
 * @param {object} o.field               shared curl noise (curl.js)
 * @param {object} o.chill               cold mist (chill.js)
 */
export function createCrystals({ fxMaterial, glintMaterial = fxMaterial, origin, field, chill, reducedMotion = false }) {
  const MAX = 40;
  const FLOATERS = 5;
  const MOTES = 200;
  const TUFTS = reducedMotion ? 0 : 10; // at once, at most
  const PER_TUFT = 5;
  const { mesh, glow, glowAttr } = crystalMesh(MAX + FLOATERS + TUFTS * PER_TUFT);
  const motes = createPoints(MOTES, glintMaterial); // diamond glints (signatures.js)
  const M = { pos: motes.geometry.attributes.position.array, col: motes.geometry.attributes.color.array, size: motes.geometry.attributes.size.array, alpha: motes.geometry.attributes.alpha.array };
  const mVel = new Float32Array(MOTES * 3);
  const mAge = new Float32Array(MOTES).fill(1);
  const mLife = new Float32Array(MOTES).fill(0);
  let mNext = 0;

  const ramp = rampColors(['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff']);
  const tmp = new THREE.Color();
  let ambientShare = 1; // 0..1: how many frost motes to keep (the scene's density budget)

  // Layout: seeded, so the same settings always grow the same cluster.
  const N = MAX + FLOATERS;
  const sx = new Float32Array(N), sy = new Float32Array(N), sz = new Float32Array(N), sAng = new Float32Array(N);
  const sH = new Float32Array(N), sW = new Float32Array(N), sD = new Float32Array(N);
  const sTilt = new Float32Array(N), sTwist = new Float32Array(N), sDelay = new Float32Array(N), sGlow = new Float32Array(N);
  let crystals = 0;
  let layoutKey = '';
  function layout(I) {
    const key = `${I.shards}|${I.spread}|${I.height}|${I.thickness}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const rng = seeded(1337);
    const n = Math.min(MAX, I.shards);
    const medium = Math.max(2, Math.round(n * 0.3));
    const small = Math.max(0, n - 1 - medium);
    const S = I.spread / 0.36; // the defaults are laid out for a 0.36 m spread
    let i = 0;
    const add = (a, r, tilt, h, thick, delay) => {
      sAng[i] = a;
      sx[i] = origin.x + Math.cos(a) * r * S;
      sy[i] = -0.03;
      sz[i] = origin.z + Math.sin(a) * r * S;
      sTilt[i] = tilt;
      sH[i] = h * I.height;
      sW[i] = thick * I.thickness * (0.88 + 0.24 * rng());
      sD[i] = thick * I.thickness * (0.88 + 0.24 * rng());
      sTwist[i] = rng() * TAU;
      sDelay[i] = delay;
      sGlow[i] = rng();
      i++;
    };
    // One dominant crystal around the blade, nearly upright.
    add(rng() * TAU, 0.02, 0.05 + 0.07 * rng(), 1, 0.17, 0);
    // A few medium ones fanning out from the same root.
    const o1 = rng() * TAU;
    for (let j = 0; j < medium; j++) add(o1 + ((j + (rng() - 0.5) * 0.5) / medium) * TAU, 0.07 + 0.08 * rng(), 0.38 + 0.38 * rng(), 0.5 + 0.3 * rng(), 0.08 + 0.035 * rng(), 0.12 + 0.2 * rng());
    // A spray of small ones radiating low over the ash.
    const o2 = rng() * TAU;
    for (let j = 0; j < small; j++) add(o2 + ((j + (rng() - 0.5) * 0.8) / small) * TAU, 0.14 + 0.18 * rng(), 0.8 + 0.45 * rng(), 0.2 + 0.22 * rng(), 0.045 + 0.028 * rng(), 0.3 + 0.35 * rng());
    crystals = i;
    // Loose shards drifting above the cluster.
    for (let j = 0; j < FLOATERS; j++) {
      const a = (j / FLOATERS) * TAU + rng();
      sAng[i] = a;
      sx[i] = origin.x + Math.cos(a) * (0.22 + 0.2 * rng()) * S;
      sy[i] = (0.8 + 0.4 * rng()) * I.height;
      sz[i] = origin.z + Math.sin(a) * (0.22 + 0.2 * rng()) * S;
      sTilt[i] = (rng() - 0.5) * 1.2;
      sH[i] = 0.08 + 0.07 * rng();
      sW[i] = sD[i] = 0.025 + 0.012 * rng();
      sTwist[i] = rng() * TAU;
      sDelay[i] = 0.7 + 0.2 * rng();
      sGlow[i] = 0.7 + 0.3 * rng();
      i++;
    }
  }

  let active = false;
  let grow = 0;       // 0 = in the ground, 1 = fully formed
  let pulse = 0;      // a stoke's flash, decaying
  let live = false;
  let seep = 0;       // chill seeping off at rest
  let beatGlow = 0;   // a beat's glow (the visualizer), decaying...
  let wave = 1;       // ...and how far up the crystals it has risen
  let pulseIn = 1.5;  // seconds to the next slow ambient pulse (effects.ice.pulse)
  let pulseT = 9;     // seconds into the current slow pulse (it swells and fades over SLOW)
  const SLOW = 1.6;
  const slowGlow = () => (pulseT < SLOW ? Math.sin((Math.PI * pulseT) / SLOW) * 0.45 : 0);
  const slotOf = new Int16Array(N).fill(-1); // each crystal's instance this frame

  // Tufts: { x, z, t, rise, hold, sink, kids: [{ ang, tilt, twist, h, w }], chipped }
  const tufts = [];
  const TUFT_RISE = 0.12;
  const TUFT_SINK = 0.3;
  /** `n` tufts sprout from the ash just beyond the cluster (none while it's still growing in). */
  function sprout(n) {
    if (!TUFTS || grow < 0.8) return;
    const I = effects.ice;
    const S = I.spread / 0.36;
    for (let j = 0; j < n && tufts.length < TUFTS; j++) {
      const a = Math.random() * TAU;
      const r = (0.42 + 0.4 * Math.random()) * S;
      const kids = [];
      const count = 3 + Math.floor(Math.random() * (PER_TUFT - 2));
      for (let c = 0; c < count; c++) {
        kids.push({
          ang: a + (c / count - 0.5) * 2.4 + (Math.random() - 0.5) * 0.4, // fanned around the way it faces
          tilt: c === 0 ? 0.1 + 0.15 * Math.random() : 0.35 + 0.55 * Math.random(),
          twist: Math.random() * TAU,
          h: (c === 0 ? 0.17 : 0.08 + 0.08 * Math.random()) * I.height,
          w: (c === 0 ? 0.04 : 0.024 + 0.012 * Math.random()) * I.thickness,
        });
      }
      tufts.push({ x: origin.x + Math.cos(a) * r, z: origin.z + Math.sin(a) * r, ang: a, t: -j * 0.07, hold: 0.45 + 0.35 * Math.random(), kids, chipped: false });
    }
  }
  /** Place the live tufts from instance `n` on; returns the next free instance. */
  function placeTufts(dt, n) {
    for (let j = tufts.length - 1; j >= 0; j--) {
      const tf = tufts[j];
      tf.t += dt;
      if (tf.t > TUFT_RISE + tf.hold + TUFT_SINK || !active) { tufts.splice(j, 1); continue; }
    }
    for (const tf of tufts) {
      if (tf.t <= 0) continue;
      const env = tf.t < TUFT_RISE ? easeOutBack(tf.t / TUFT_RISE, OVERSHOOT)
        : tf.t < TUFT_RISE + tf.hold ? 1
          : 1 - clamp01((tf.t - TUFT_RISE - tf.hold) / TUFT_SINK) ** 2;
      if (!tf.chipped) {
        tf.chipped = true;
        // A glint or two flicked off as it breaks the ash, and a breath of chill.
        for (let c = 0; c < 2; c++) {
          const i = mNext;
          mNext = (mNext + 1) % MOTES;
          const ix = i * 3;
          M.pos[ix] = tf.x; M.pos[ix + 1] = 0.08; M.pos[ix + 2] = tf.z;
          mVel[ix] = Math.cos(tf.ang) * (0.2 + Math.random() * 0.4);
          mVel[ix + 1] = 0.5 + Math.random() * 0.6;
          mVel[ix + 2] = Math.sin(tf.ang) * (0.2 + Math.random() * 0.4);
          mAge[i] = 0;
          mLife[i] = 0.5 + Math.random() * 0.5;
        }
        chill?.emit(tf.x, 0.05, tf.z, Math.cos(tf.ang) * 0.15, 0.02, Math.sin(tf.ang) * 0.15, 1.4, 0.3);
      }
      const fresh = Math.min(1, 0.5 + Math.max(0, 1 - tf.t / 0.35) * 0.6);
      for (const k of tf.kids) {
        place(mesh, n, tf.x, -0.02, tf.z, k.ang, k.tilt, k.twist, k.w, k.w * 0.9, k.h * env);
        glow[n++] = fresh;
      }
    }
    return n;
  }

  // Echoes: outlines of the bigger crystals growing away and fading.
  const outlines = reducedMotion ? null : createBoltLines(fxMaterial, 720);
  const echoes = []; // { t, frames: [Matrix4 per crystal], out: [Vector3 per crystal] }
  const ECHO_TIME = 0.7;
  const ea = new THREE.Vector3();
  const eb = new THREE.Vector3();
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  const CENTER = new THREE.Vector3(0, 0.4, 0);
  /** A point of crystal outline k of an echo, grown by `s` about the crystal's middle and pushed outward. */
  function echoPoint(e, k, v, s, push, out) {
    out.copy(v).sub(CENTER).multiplyScalar(s).add(CENTER).applyMatrix4(e.frames[k]);
    return out.addScaledVector(e.out[k], push);
  }
  function stepEchoes(dt) {
    if (!outlines) return;
    outlines.begin();
    for (let j = echoes.length - 1; j >= 0; j--) {
      const e = echoes[j];
      e.t += dt;
      const k = e.t / e.time;
      if (k >= 1) { echoes.splice(j, 1); continue; }
      const grown = 1 - (1 - k) ** 3;
      const s = 1 + 0.6 * grown;
      const push = 0.12 * grown;
      const alpha = (1 - k) ** 1.3;
      colA.copy(ramp[1]).lerp(ramp[2], 0.5 * (1 - k));
      colB.copy(ramp[3]).lerp(ramp[2], k);
      for (let c = 0; c < e.frames.length; c++) {
        for (const [a, b] of EDGES) {
          echoPoint(e, c, a, s, push, ea);
          echoPoint(e, c, b, s, push, eb);
          // Cooler toward the root, the ice's pale core at the shoulders and point.
          outlines.segment(ea.x, ea.y, ea.z, eb.x, eb.y, eb.z, a.y < 0.5 ? colA : colB, colB, alpha, alpha);
        }
      }
    }
    outlines.end();
  }

  function spawnMote(i, I, fast = 0) {
    const ix = i * 3;
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * (I.spread + 0.35);
    M.pos[ix] = origin.x + Math.cos(a) * r;
    M.pos[ix + 1] = 0.05 + Math.random() * (fast ? 0.5 : 1.2);
    M.pos[ix + 2] = origin.z + Math.sin(a) * r;
    mVel[ix] = Math.cos(a) * fast * (0.3 + Math.random() * 0.8);
    mVel[ix + 1] = 0.04 + Math.random() * 0.1 + fast * (0.4 + Math.random() * 0.8);
    mVel[ix + 2] = Math.sin(a) * fast * (0.3 + Math.random() * 0.8);
    mAge[i] = 0;
    mLife[i] = fast ? 0.8 + Math.random() * 1 : 2 + Math.random() * 3;
  }

  function step(dt, t, level) {
    const I = effects.ice;
    layout(I);
    const time = reducedMotion ? 0.2 : I.growTime;
    grow = clamp01(grow + (active ? dt / time : -dt / (time * 0.6)));
    const stoked = Math.max(0, Math.min(2.2, level - 1));
    pulse = Math.max(pulse * Math.exp(-dt * 3), stoked * 0.5);
    beatGlow *= Math.exp(-dt / 0.28);
    wave += dt / 0.35;
    stepEchoes(dt);
    pulseT += dt;
    // The slow ambient pulse: every few seconds the glow swells up through the crystals and
    // their outlines drift out, gently (on the site too, not only on a beat).
    if (active && grow > 0.9 && I.pulse > 0 && !reducedMotion) {
      pulseIn -= dt;
      if (pulseIn <= 0) {
        pulseIn = I.pulse * (0.85 + Math.random() * 0.3);
        pulseT = 0;
        wave = 0;
        echo(2.2);
      }
    }
    let anyMote = false;
    for (let i = 0; i < MOTES; i++) if (mAge[i] < mLife[i]) { anyMote = true; break; }
    if (grow <= 0 && !anyMote) {
      if (live) {
        mesh.count = 0;
        M.size.fill(0); motes.geometry.attributes.size.needsUpdate = true;
        live = false;
      }
      return;
    }
    live = true;

    // --- crystals: each pops up out of the ground in turn (and sinks back in reverse)
    let n = 0;
    for (let i = 0; i < crystals + FLOATERS; i++) {
      slotOf[i] = -1;
      const p = clamp01((grow - sDelay[i] * 0.6) / 0.45);
      if (p <= 0) continue;
      slotOf[i] = n;
      const g = active ? easeOutBack(p, OVERSHOOT) : p * p * (3 - 2 * p);
      if (i < crystals) {
        const h = sH[i] * g * (1 + pulse * 0.05);
        const w = 0.55 + 0.45 * Math.min(1, g);
        place(mesh, n, sx[i], sy[i], sz[i], sAng[i], sTilt[i], sTwist[i], sW[i] * w, sD[i] * w, h);
      } else {
        // Floaters bob and turn slowly; they shrink away rather than sink.
        const bob = reducedMotion ? 0 : Math.sin(t * 0.9 + i * 2.1) * 0.035;
        const s = Math.min(1, g);
        place(mesh, n, sx[i], sy[i] + bob, sz[i], sAng[i], sTilt[i] + (reducedMotion ? 0 : Math.sin(t * 0.5 + i) * 0.2), sTwist[i] + (reducedMotion ? 0 : t * 0.4), sW[i] * s, sD[i] * s, sH[i] * s);
      }
      glow[n] = sGlow[i];
      n++;
    }
    n = placeTufts(dt, n);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    glowAttr.needsUpdate = true;
    const u = mesh.material.uniforms;
    u.uTime.value = t;
    u.uShimmer.value = reducedMotion ? 0 : I.shimmer;
    u.uGlow.value = I.glow * (0.55 + 0.45 * grow) * (1 + pulse * 0.5);
    u.uClarity.value = I.clarity;
    u.uBeat.value = Math.max(beatGlow, slowGlow());
    u.uWave.value = Math.min(wave, 1.6);

    // --- chill seeping off the cluster and rolling away low
    if (active && grow > 0.6 && chill) {
      seep += dt * 5;
      while (seep >= 1) {
        seep -= 1;
        const a = Math.random() * TAU;
        const r = I.spread * (0.4 + Math.random() * 0.8);
        const s = 0.05 + Math.random() * 0.12;
        chill.emit(origin.x + Math.cos(a) * r, 0.06 + Math.random() * 0.15, origin.z + Math.sin(a) * r, Math.cos(a) * s, 0, Math.sin(a) * s, 3, 0.26);
      }
    }

    // --- frost motes: a slow twinkling drift, thrown up by a stoke
    const want = Math.round(I.frost * grow * ambientShare); // (fewer while a big hit is on screen)
    for (let i = 0; i < MOTES; i++) {
      const ix = i * 3;
      if (mAge[i] >= mLife[i]) {
        if (i < want && active && Math.random() < dt * 2) spawnMote(i, I);
        else { M.size[i] = 0; continue; }
      }
      mAge[i] += dt;
      const k = mAge[i] / mLife[i];
      const c = field.fire(M.pos[ix] - origin.x, M.pos[ix + 1] * 0.5, M.pos[ix + 2] - origin.z, t * 0.3);
      const drag = Math.exp(-dt * 1.5);
      mVel[ix] = mVel[ix] * drag + c.x * 0.05 * dt;
      mVel[ix + 1] = mVel[ix + 1] * drag + (0.03 + c.y * 0.03) * dt;
      mVel[ix + 2] = mVel[ix + 2] * drag + c.z * 0.05 * dt;
      M.pos[ix] += (mVel[ix] + c.x * 0.03) * dt;
      M.pos[ix + 1] += (mVel[ix + 1] + 0.04) * dt;
      M.pos[ix + 2] += (mVel[ix + 2] + c.z * 0.03) * dt;
      const tw = 0.5 + 0.5 * Math.sin(mAge[i] * 7 + i * 1.7);
      // Ice's signature: now and then a mote catches the light as a bright diamond.
      const glint = reducedMotion ? 0 : iceGlint(t, i);
      tmp.copy(i % 3 || glint ? ramp[3] : ramp[2]).multiplyScalar(glint ? 1.1 : 0.75);
      M.col[ix] = tmp.r; M.col[ix + 1] = tmp.g; M.col[ix + 2] = tmp.b;
      M.size[i] = glint ? 3 : tw > 0.97 ? 2 : 1;
      M.alpha[i] = glint ? 1 : Math.min(1, k * 5, (1 - k) * 3) * (0.35 + 0.65 * tw);
    }
    for (const k of ['position', 'color', 'size', 'alpha']) motes.geometry.attributes[k].needsUpdate = true;
  }

  /** Frost thrown up and a tuft of chill rolling off the base (stoke, weapon impact). */
  function burst(amount = 1) {
    if (reducedMotion) return;
    const I = effects.ice;
    const n = Math.round(22 * amount);
    for (let j = 0; j < n; j++) { spawnMote(mNext, I, 1); mNext = (mNext + 1) % MOTES; }
    chill?.puff(origin.x, origin.z, Math.round(140 * amount), { radius: I.spread, speed: 1.1 * amount, rise: 0.08, span: 2.4, alpha: 0.4 });
    pulse = Math.max(pulse, 0.6 * amount);
  }

  /** A beat (the visualizer): a glow rising up through the crystals. `strength` 0..1. */
  function beat(strength = 1) {
    if (reducedMotion) return;
    beatGlow = Math.max(beatGlow, strength);
    wave = 0;
  }
  /**
   * An echo: the bigger crystals' outlines grow away and fade, over `time` seconds (a quick
   * one on the visualizer's beats and rings; the slow ambient pulse takes longer).
   */
  function echo(time = ECHO_TIME) {
    if (!outlines || grow < 0.5 || echoes.length >= 3) return;
    // The slow pulse sends up a few more tufts than a beat's quick echo.
    sprout(time > 1 ? 3 : 1 + Math.floor(Math.random() * 2));
    mesh.updateMatrixWorld();
    const frames = [];
    const out = [];
    // The dominant crystal and the medium ones (the small spray would only clutter).
    const outlined = Math.min(crystals, 1 + Math.max(2, Math.round(Math.min(MAX, effects.ice.shards) * 0.3)));
    for (let i = 0; i < outlined; i++) {
      if (slotOf[i] < 0) continue;
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(slotOf[i], m);
      frames.push(m.premultiply(mesh.matrixWorld));
      out.push(new THREE.Vector3(sx[i] - origin.x, 0.4, sz[i] - origin.z).normalize());
    }
    if (frames.length) echoes.push({ t: 0, time, frames, out });
  }

  return {
    objects: outlines ? [mesh, motes, ...outlines.objects] : [mesh, motes],
    solid: mesh,
    step,
    burst,
    beat,
    echo,
    /** 0..1: the latest beat's glow (the scene brightens the ice's light with it). */
    get beatGlow() { return Math.max(beatGlow, slowGlow()); },
    setActive(on, instant = false) {
      active = on;
      if (instant) grow = on ? 1 : 0;
    },
    get amount() { return grow; },
    sets: [{ pos: M.pos, vel: mVel, n: MOTES, geo: motes.geometry, maxV: 1.2 }],
    /** 0..1: how much of the background frost to keep (the scene thins it during big hits). */
    set ambient(v) { ambientShare = v; },
    setRamp(hexes) {
      setRampColors(ramp, hexes);
      setRampUniforms(mesh.material, hexes);
    },
  };
}

// ---------------------------------------------------------------------------------
/**
 * The ice impact: a ring of small crystal clusters that spike up as it expands and
 * sink back behind itself, with a tuft of chill.
 * @param {(angle:number)=>number} o.reach  distance to the first obstacle along a heading
 * @param {object} o.chill                  cold mist (chill.js)
 */
export function createIceRing({ fxMaterial, glintMaterial = fxMaterial, origin, field, reach, chill, maxSites = 900, chips = 320, bins = 96, lights: lightCount = 6, reducedMotion = false }) {
  const PER = 3; // crystals per cluster, at most
  const { mesh, glow, glowAttr } = crystalMesh(maxSites * PER);
  const frost = createBoltLines(fxMaterial, bins * 2);
  const kVel = new Float32Array(chips * 3);
  const chipPts = createPoints(chips, glintMaterial, { vel: kVel }); // shards that streak and glint as diamonds
  const K = { pos: chipPts.geometry.attributes.position.array, col: chipPts.geometry.attributes.color.array, size: chipPts.geometry.attributes.size.array, alpha: chipPts.geometry.attributes.alpha.array };
  const kAge = new Float32Array(chips).fill(1);
  const kLife = new Float32Array(chips).fill(0);
  let kNext = 0;

  const ramp = rampColors(['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff']);
  const white = new THREE.Color('#ffffff');
  const tmp = new THREE.Color();
  const lights = Array.from({ length: reducedMotion ? 0 : lightCount }, () => new THREE.PointLight(0x8cc8ff, 0, 2.4, 2));

  // Sites: where a cluster will break the ground, and when the front gets there.
  // Each cluster: a main crystal plus up to two smaller ones splayed off its root.
  const S = {
    x: new Float32Array(maxSites), z: new Float32Array(maxSites), ang: new Float32Array(maxSites),
    at: new Float32Array(maxSites), h: new Float32Array(maxSites), w: new Float32Array(maxSites),
    tilt: new Float32Array(maxSites), twist: new Float32Array(maxSites), hold: new Float32Array(maxSites),
    glow: new Float32Array(maxSites), up: new Uint8Array(maxSites), kids: new Uint8Array(maxSites),
    kidAng: new Float32Array(maxSites * 2), kidTilt: new Float32Array(maxSites * 2), kidH: new Float32Array(maxSites * 2),
  };
  let sites = 0;
  // The front per heading bin: r(t) = r0 + v/k·(1 − e^(−kt)), stopped at the obstacle.
  const R0 = 0.8;
  const DECAY = 1.1;
  const bV = new Float32Array(bins);
  const bMax = new Float32Array(bins);
  const frontAt = (b, time) => Math.min(R0 + (bV[b] / DECAY) * (1 - Math.exp(-DECAY * time)), bMax[b] - 0.03);
  const binOf = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * bins) % bins;
  let since = 1e3;
  let active = false;
  let live = false;
  let duration = 0;

  function burst() {
    if (reducedMotion) return;
    const I = effects.ice;
    const seed = Math.random() * 100;
    for (let b = 0; b < bins; b++) {
      const a = (b / bins) * TAU;
      bV[b] = (3.7 + 0.6 * ringNoise(field.noise, a, 1.3, 0, seed)) * I.ringSpeed;
      bMax[b] = reach ? reach(a) : 4.6;
    }
    sites = 0;
    duration = 0;
    const spacing = 0.32;
    for (let r = R0 + 0.1; r < 4.6 && sites < maxSites; r += spacing * (0.85 + Math.random() * 0.3)) {
      const count = Math.max(10, Math.round((TAU * r) / 0.3));
      const offset = Math.random();
      for (let j = 0; j < count && sites < maxSites; j++) {
        if (Math.random() < 0.15) continue; // gaps, so it's a ragged ring, not a fence
        const a = ((j + offset + (Math.random() - 0.5) * 0.5) / count) * TAU;
        const b = binOf(a);
        const rr = r + (Math.random() - 0.5) * 0.08;
        const far = R0 + bV[b] / DECAY; // where this heading's front runs out
        if (rr > bMax[b] - 0.06 || rr > far - 0.12) continue;
        const wall = bMax[b] < 4.2 && rr + spacing > bMax[b] - 0.06; // the last spot before an obstacle
        const at = -Math.log(1 - ((rr - R0) * DECAY) / bV[b]) / DECAY;
        const falloff = Math.max(0.25, 1 - (rr - R0) / 3.4);
        const i = sites++;
        S.x[i] = origin.x + Math.cos(a) * rr;
        S.z[i] = origin.z + Math.sin(a) * rr;
        S.ang[i] = a;
        S.at[i] = at;
        S.h[i] = (0.08 + 0.24 * falloff) * I.ringHeight * (0.6 + 0.65 * Math.random()) * (wall ? 1.8 : 1);
        S.w[i] = (0.028 + 0.03 * Math.random()) * (0.7 + 0.5 * falloff) * (wall ? 1.3 : 1);
        S.tilt[i] = wall ? 0.1 + Math.random() * 0.2 : 0.25 + Math.random() * 0.4;
        S.twist[i] = Math.random() * TAU;
        S.hold[i] = I.ringHold * (wall ? 2 : 1) + (wall ? 0.3 : 0) + Math.random() * 0.05;
        S.glow[i] = Math.random();
        S.up[i] = 0;
        S.kids[i] = Math.random() < 0.25 ? 0 : Math.random() < 0.55 ? 1 : 2;
        for (let c = 0; c < 2; c++) {
          S.kidAng[i * 2 + c] = a + (c ? -1 : 1) * (0.35 + Math.random() * 0.5);
          S.kidTilt[i * 2 + c] = S.tilt[i] + 0.3 + Math.random() * 0.45;
          S.kidH[i * 2 + c] = 0.4 + Math.random() * 0.3;
        }
        duration = Math.max(duration, at + 0.1 + S.hold[i] + 0.25);
      }
    }
    // The slam: a tuft of chill rolling out from the fire.
    chill?.puff(origin.x, origin.z, 340, { radius: 0.5, speed: 1.4, rise: 0.1, span: 2.6, alpha: 0.42 });
    since = 0;
    active = true;
  }

  function chip(x, y, z, ang) {
    const i = kNext;
    kNext = (kNext + 1) % chips;
    const ix = i * 3;
    K.pos[ix] = x; K.pos[ix + 1] = y; K.pos[ix + 2] = z;
    const out = 0.3 + Math.random() * 0.7;
    const side = (Math.random() - 0.5) * 0.8;
    kVel[ix] = Math.cos(ang) * out - Math.sin(ang) * side;
    kVel[ix + 1] = 0.8 + Math.random() * 1.2;
    kVel[ix + 2] = Math.sin(ang) * out + Math.cos(ang) * side;
    kAge[i] = 0;
    kLife[i] = 0.5 + Math.random() * 0.6;
  }

  const lightR = new Float32Array(lightCount);
  const lc = new Float32Array(lightCount);

  function step(dt) {
    const I = effects.ice;
    let anyChip = false;
    if (active) {
      since += dt;
      live = true;
      // --- clusters: rise fast (with a small overshoot), hold, sink back
      let n = 0;
      lightR.fill(0); lc.fill(0);
      for (let i = 0; i < sites; i++) {
        const tau = since - S.at[i];
        if (tau <= 0) continue;
        const RISE = 0.07, SINK = 0.16;
        let env;
        if (tau < RISE) env = easeOutBack(tau / RISE, OVERSHOOT);
        else if (tau < RISE + S.hold[i]) env = 1;
        else env = 1 - clamp01((tau - RISE - S.hold[i]) / SINK) ** 2;
        if (env <= 0.001) continue;
        if (!S.up[i]) {
          S.up[i] = 1;
          if (Math.random() < 0.7) chip(S.x[i], S.h[i] * 0.6, S.z[i], S.ang[i]);
          // Chill trails the ring, shed low as each cluster breaks the ground.
          if (chill) for (let c = 0; c < 2; c++) {
            const s = 0.15 + Math.random() * 0.35;
            chill.emit(S.x[i] + (Math.random() - 0.5) * 0.1, 0.04 + Math.random() * 0.08, S.z[i] + (Math.random() - 0.5) * 0.1, Math.cos(S.ang[i]) * s, 0.03 + Math.random() * 0.05, Math.sin(S.ang[i]) * s, 1.5, 0.38);
          }
        }
        const fresh = Math.min(1, 0.35 + S.glow[i] * 0.3 + Math.max(0, 1 - tau / 0.4) * 0.6);
        place(mesh, n, S.x[i], -0.02, S.z[i], S.ang[i], S.tilt[i], S.twist[i], S.w[i], S.w[i] * 0.9, S.h[i] * env);
        glow[n++] = fresh;
        for (let c = 0; c < S.kids[i]; c++) {
          const k = i * 2 + c;
          place(mesh, n, S.x[i], -0.02, S.z[i], S.kidAng[k], S.kidTilt[k], S.twist[i] + c * 2, S.w[i] * 0.6, S.w[i] * 0.55, S.h[i] * S.kidH[k] * env);
          glow[n++] = fresh * 0.9;
        }
        if (lightCount && tau < RISE + 0.15) {
          const s = Math.floor((S.ang[i] / TAU) * lightCount + lightCount) % lightCount;
          lightR[s] += Math.hypot(S.x[i] - origin.x, S.z[i] - origin.z); lc[s] += 1;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      glowAttr.needsUpdate = true;
      const u = mesh.material.uniforms;
      u.uGlow.value = I.glow;
      u.uShimmer.value = 0;
      u.uClarity.value = I.clarity;

      // --- the frost line along the front, fading as it slows
      frost.begin();
      const fade = clamp01(1 - since / Math.max(0.3, duration * 0.8));
      for (let b = 0; b < bins; b++) {
        const c = (b + 1) % bins;
        const ra = frontAt(b, since), rb = frontAt(c, since);
        if (Math.abs(ra - rb) > 0.2 || ra >= bMax[b] - 0.035 || rb >= bMax[c] - 0.035) continue;
        const a0 = (b / bins) * TAU, a1 = (c / bins) * TAU;
        tmp.copy(ramp[2]).lerp(ramp[3], 0.4).multiplyScalar(0.9 * fade);
        frost.segment(origin.x + Math.cos(a0) * ra, 0.02, origin.z + Math.sin(a0) * ra, origin.x + Math.cos(a1) * rb, 0.02, origin.z + Math.sin(a1) * rb, tmp, tmp, fade);
      }
      frost.end();

      lights.forEach((l, s) => {
        if (!lc[s]) { l.intensity = 0; return; }
        const a = ((s + 0.5) / lightCount) * TAU;
        const r = lightR[s] / lc[s];
        l.position.set(origin.x + Math.cos(a) * r, 0.35, origin.z + Math.sin(a) * r);
        l.color.copy(ramp[2]).lerp(white, 0.5);
        l.intensity = 1.8 * fade;
      });
      if (since > duration) {
        active = false;
        mesh.count = 0;
        frost.clear();
        for (const l of lights) l.intensity = 0;
      }
    } else if (live) {
      mesh.count = 0;
      frost.clear();
      live = false;
    }

    // --- chips: thrown up and out, glinting as they tumble and settle
    for (let i = 0; i < chips; i++) {
      if (kAge[i] >= kLife[i]) { K.size[i] = 0; continue; }
      anyChip = true;
      kAge[i] += dt;
      const ix = i * 3;
      const drag = Math.exp(-dt * 1.2);
      kVel[ix] *= drag; kVel[ix + 1] = kVel[ix + 1] * drag - 3.5 * dt; kVel[ix + 2] *= drag;
      K.pos[ix] += kVel[ix] * dt; K.pos[ix + 1] += kVel[ix + 1] * dt; K.pos[ix + 2] += kVel[ix + 2] * dt;
      let bounced = false;
      if (K.pos[ix + 1] < 0.02) { K.pos[ix + 1] = 0.02; bounced = kVel[ix + 1] < -0.4; kVel[ix + 1] *= -0.25; kVel[ix] *= 0.5; kVel[ix + 2] *= 0.5; }
      const k = kAge[i] / kLife[i];
      tmp.copy(i & 1 || bounced ? ramp[3] : ramp[2]).multiplyScalar(bounced ? 1.1 : 0.8);
      K.col[ix] = tmp.r; K.col[ix + 1] = tmp.g; K.col[ix + 2] = tmp.b;
      K.size[i] = bounced ? 3 : 1; // a shard glints as it hits the ground
      K.alpha[i] = Math.min(1, (1 - k) * 2.5) * (0.55 + 0.45 * Math.sin(kAge[i] * 30 + i));
    }
    if (anyChip || active) for (const k of ['position', 'color', 'size', 'alpha', 'vel']) chipPts.geometry.attributes[k].needsUpdate = true;
  }

  return {
    objects: [mesh, ...frost.objects, chipPts],
    solid: mesh,
    lights,
    burst,
    step,
    sets: [{ pos: K.pos, vel: kVel, n: chips, geo: chipPts.geometry, maxV: 1.6 }],
    setRamp(hexes) {
      setRampColors(ramp, hexes);
      setRampUniforms(mesh.material, hexes);
    },
  };
}
