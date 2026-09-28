// Particle fire driven by a curl-noise flow field.
//
// Each particle rises on buoyancy while being carried by the curl of a 3D noise
// potential (divergence-free, so it swirls like a fluid instead of jittering),
// and is gently pulled toward the fire's axis so the plume tapers into tongues.
// Color comes from each particle's "heat": young particles near the base use the
// ramp's core/hi colors, older ones cool to mid → lo. Particles are drawn as
// square points, additively, into the FX render target, so overlapping particles
// build a hot core that the palette pass then quantizes and dithers.
//
// The simulation runs at a fixed, stepped rate (FLAME_FPS) for a hand-animated
// pixel-art feel; sparks update every frame. Cursor interaction lives in
// interaction.js; the flame reads it through `ext` (an external flow velocity).
// Like real fire, flame that gets pushed around lifts (hot gas rises harder when
// stirred) and cools faster, so torn-off tongues rise and fade instead of
// sliding sideways.
//
// `params.spawn` / `params.sparks` (0..1) are the chance a burnt-out particle is
// reborn: other elements turn them down so the fire dies out (lightning) or banks
// low inside the ice, and back up to relight it.
import * as THREE from 'three';

// Point size is in render-target texels, scaled with distance so close-up
// camera angles keep the fire dense, and rounded to whole texels. Dead particles
// (size 0) are moved outside the clip volume: a point size of 0 isn't enough —
// some GPUs (Direct3D via ANGLE) still draw it as a single pixel.
const vertexShader = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  attribute float alpha;
  uniform float sizeScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = size <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
    gl_PointSize = size <= 0.0 ? 1.0 : clamp(floor(size * sqrt(sizeScale / -mv.z) + 0.5), 1.0, 4.0);
  }
`;

// Manual depth test against the solid geometry so logs, stones and the weapon
// correctly hide particles behind them. Alpha adds up how much *bonfire* light a
// pixel holds (uHot = 1 for the bonfire, 0 for other effects): the pixel pass
// lets only the bonfire's dense heart burn white-hot, while other effects keep
// their hue however densely they pile up.
// Transparency is ordered dither against a screen-locked Bayer matrix: dimming
// a particle instead would walk its color down the palette into other entries.
export const DITHER_GLSL = /* glsl */ `
  float pBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float pBayer4(vec2 a) { return pBayer2(0.5 * a) * 0.25 + pBayer2(a); }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float uHot;
  varying vec3 vColor;
  varying float vAlpha;
  ${DITHER_GLSL}
  void main() {
    float sceneDepth = texture2D(tDepth, gl_FragCoord.xy / resolution).x;
    if (gl_FragCoord.z > sceneDepth + 0.00002) discard;
    if (vAlpha < 0.999 && vAlpha <= pBayer4(gl_FragCoord.xy)) discard;
    gl_FragColor = vec4(vColor, uHot * max(vColor.r, max(vColor.g, vColor.b)));
  }
`;

export function createParticleMaterial(depthTexture, resolution) {
  return new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: depthTexture }, resolution: { value: resolution }, sizeScale: { value: 6 }, uHot: { value: 1 } },
    // Point sets without an `alpha` attribute (the bonfire, sparks) draw fully opaque.
    defaultAttributeValues: { color: [1, 1, 1], uv: [0, 0], uv1: [0, 0], alpha: [1] },
    vertexShader,
    fragmentShader,
    // Purely additive in color and alpha (alpha carries the bonfire's heat).
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

/** The same particles for effects other than the bonfire (forge, ring of fire, embers): no heat. */
export function createEffectMaterial(fireMaterial) {
  const m = fireMaterial.clone();
  m.uniforms = { ...fireMaterial.uniforms, uHot: { value: 0 } };
  return m;
}

function makePoints(count, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1));
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}

/**
 * @param {object} o
 * @param {number} o.count      flame particles
 * @param {number} o.sparks     spark particles
 * @param {THREE.Material} o.material
 * @param {THREE.Vector3} o.origin  base of the fire (world)
 */
export function createFlame({ count, sparks: sparkCount, material, origin, field, reducedMotion }) {
  const flame = makePoints(count, material);
  const spark = makePoints(sparkCount, material);

  const P = flame.geometry.attributes.position.array;
  const C = flame.geometry.attributes.color.array;
  const S = flame.geometry.attributes.size.array;
  const V = new Float32Array(count * 3);
  const EXT = new Float32Array(count * 3); // external flow from the cursor (world m/s)
  const age = new Float32Array(count);
  const life = new Float32Array(count);

  const SP = spark.geometry.attributes.position.array;
  const SC = spark.geometry.attributes.color.array;
  const SS = spark.geometry.attributes.size.array;
  const SV = new Float32Array(sparkCount * 3);
  const sAge = new Float32Array(sparkCount);
  const sLife = new Float32Array(sparkCount);

  // Ramp in linear space: [lo, mid, hi, core].
  let ramp = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const tmp = new THREE.Color();

  const params = {
    level: 1,          // stoke level (1 = resting)
    rise: 0.62,
    curlAmp: 0.42,
    curlFreq: 2.6,
    radius: 0.27,
    lifeMin: 0.55,
    lifeMax: 1.25,
    brightness: 0.3,
    spawn: 1,          // chance a dead flame particle is reborn
    sparks: 1,         // same, for sparks
  };

  const wind = new THREE.Vector3();

  // Curl noise from the shared field (see curl.js), so the ground flames and the
  // weapon forge move with the same undulation as the bonfire.
  const curlAt = field.curl;

  function spawn(i, burst = 0) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * params.radius * (0.8 + params.level * 0.2 + burst * 0.4);
    P[i * 3] = origin.x + Math.cos(a) * r;
    P[i * 3 + 1] = origin.y + Math.random() * 0.12;
    P[i * 3 + 2] = origin.z + Math.sin(a) * r;
    V[i * 3] = Math.cos(a) * burst * 0.6;
    V[i * 3 + 1] = params.rise * (0.6 + Math.random() * 0.5) + burst * 1.4;
    V[i * 3 + 2] = Math.sin(a) * burst * 0.6;
    age[i] = 0;
    life[i] = (params.lifeMin + Math.random() * (params.lifeMax - params.lifeMin)) * (0.85 + params.level * 0.15);
  }
  for (let i = 0; i < count; i++) { spawn(i); age[i] = Math.random() * life[i]; }

  function spawnSpark(i, burst = 0) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.18;
    SP[i * 3] = origin.x + Math.cos(a) * r;
    SP[i * 3 + 1] = origin.y + 0.35 + Math.random() * 0.4;
    SP[i * 3 + 2] = origin.z + Math.sin(a) * r;
    const out = burst ? 0.5 + Math.random() * 1.1 : 0.08;
    SV[i * 3] = Math.cos(a) * out * Math.random();
    SV[i * 3 + 1] = (reducedMotion ? 0.15 : 0.22 + Math.random() * 0.3) + burst * (0.7 + Math.random() * 1.1);
    SV[i * 3 + 2] = Math.sin(a) * out * Math.random();
    sAge[i] = 0;
    // Resting fire: only a few sparks drift up at a time.
    sLife[i] = burst ? 0.9 + Math.random() * 1.2 : Math.random() < 0.4 ? 0.7 + Math.random() * 1.1 : 0.0001;
  }
  for (let i = 0; i < sparkCount; i++) { spawnSpark(i); sAge[i] = Math.random() * sLife[i]; }

  function sampleRamp(heat, out) {
    // heat 0..1 → lo..core (piecewise linear)
    const h = Math.min(0.999, Math.max(0, heat)) * 3;
    const k = Math.floor(h);
    return out.copy(ramp[k]).lerp(ramp[k + 1], h - k);
  }

  // --- simulation step (fixed rate) -------------------------------------------
  function stepFlame(dt, t) {
    const f = params.curlFreq;
    const amp = params.curlAmp * (0.85 + params.level * 0.15);
    const rise = params.rise * (0.8 + params.level * 0.3);
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const push = Math.hypot(EXT[ix], EXT[ix + 2]);
      age[i] += dt * (1 + Math.min(1.5, push * 0.5)); // stirred flame burns out sooner
      if (age[i] >= life[i]) {
        if (Math.random() >= params.spawn) { S[i] = 0; continue; }
        spawn(i);
      }
      const x = P[ix], y = P[ix + 1], z = P[ix + 2];
      const lx = x - origin.x, ly = y - origin.y, lz = z - origin.z;
      const k = age[i] / life[i];

      // Flow field: buoyancy that grows as the gas heats and rises, curl noise
      // that is calm at the base and turbulent toward the tips, and a pull
      // toward the axis that tapers the plume into tongues.
      const c = curlAt(lx * f, ly * f - t * 1.35, lz * f + t * 0.25);
      const turb = amp * Math.min(1, 0.25 + ly * 1.6);
      const taper = 2.2 * Math.min(1, ly * 1.6);
      // Speed decays over each particle's life: quick off the coals, slowing as it cools.
      const slow = 1 - 0.45 * k;
      const fx = (c.x * turb - lx * taper + wind.x) * slow + EXT[ix];
      const fy = (rise * (1.05 - 0.2 * k) + c.y * turb * 0.5) * slow + EXT[ix + 1] + push * 0.4;
      const fz = (c.z * turb - lz * taper + wind.z) * slow + EXT[ix + 2];

      // Particle velocity relaxes toward the field (keeps impulses fluid).
      V[ix] += (fx - V[ix]) * 0.45;
      V[ix + 1] += (fy - V[ix + 1]) * 0.35;
      V[ix + 2] += (fz - V[ix + 2]) * 0.45;
      P[ix] += V[ix] * dt;
      P[ix + 1] += V[ix + 1] * dt;
      P[ix + 2] += V[ix + 2] * dt;

      // Heat: hottest when young and near the axis.
      const axis = Math.min(1, Math.sqrt(lx * lx + lz * lz) / (params.radius * 1.5));
      const heat = Math.min(1, (1 - k) ** 1.4 * (1 - axis * 0.6) * (0.9 + params.level * 0.1));
      // Fade decay: the last third of a particle's life dims smoothly to nothing.
      const fade = Math.min(1, (1 - k) * 3);
      sampleRamp(heat, tmp).multiplyScalar(params.brightness * (0.4 + heat) * fade * fade);
      C[ix] = tmp.r; C[ix + 1] = tmp.g; C[ix + 2] = tmp.b;
      S[i] = fade < 0.08 ? 0 : heat > 0.5 ? 2 : 1;
    }
    flame.geometry.attributes.position.needsUpdate = true;
    flame.geometry.attributes.color.needsUpdate = true;
    flame.geometry.attributes.size.needsUpdate = true;
  }

  function stepSparks(dt, t) {
    for (let i = 0; i < sparkCount; i++) {
      sAge[i] += dt;
      const ix = i * 3;
      if (sAge[i] >= sLife[i]) {
        if (Math.random() >= params.sparks) { SS[i] = 0; continue; }
        spawnSpark(i);
      }
      const sdrag = 1 - dt * 0.9; // sparks slow as they rise
      SV[ix] *= sdrag; SV[ix + 1] *= sdrag; SV[ix + 2] *= sdrag;
      const c = curlAt(SP[ix] * 1.2, SP[ix + 1] * 1.2 - t * 0.6, SP[ix + 2] * 1.2);
      SP[ix] += (SV[ix] + c.x * 0.25 + wind.x * 0.6) * dt;
      SP[ix + 1] += SV[ix + 1] * dt;
      SP[ix + 2] += (SV[ix + 2] + c.z * 0.25 + wind.z * 0.6) * dt;
      const k = sAge[i] / sLife[i];
      tmp.copy(ramp[k < 0.3 ? 3 : k < 0.6 ? 2 : k < 0.85 ? 1 : 0]).multiplyScalar(Math.min(1, (1 - k) * 4));
      SC[ix] = tmp.r; SC[ix + 1] = tmp.g; SC[ix + 2] = tmp.b;
      SS[i] = sLife[i] < 0.01 ? 0 : k < 0.15 ? 2 : 1;
    }
    spark.geometry.attributes.position.needsUpdate = true;
    spark.geometry.attributes.color.needsUpdate = true;
    spark.geometry.attributes.size.needsUpdate = true;
  }

  /** Particle sets the cursor interaction acts on. */
  const sets = [
    { pos: P, vel: V, ext: EXT, n: count, geo: flame.geometry, maxV: 1.7 },
    { pos: SP, vel: SV, n: sparkCount, geo: spark.geometry, maxV: 2.2 },
  ];

  /** Throw sparks from where a fast cut tore through the flame. */
  let sparkCursor = 0;
  function emitSparks(list) {
    for (const s of list) {
      const i = sparkCursor++ % sparkCount;
      spawnSpark(i, 1);
      SP[i * 3] = s.x; SP[i * 3 + 1] = s.y; SP[i * 3 + 2] = s.z;
      SV[i * 3] = s.vx; SV[i * 3 + 1] = s.vy; SV[i * 3 + 2] = s.vz;
      sLife[i] = 0.5 + Math.random() * 0.6;
    }
  }

  return {
    flame,
    spark,
    sets,
    emitSparks,
    params,
    wind,
    stepFlame,
    stepSparks,

    /** hexes: [lo, mid, hi, core] (sRGB) */
    setRamp(hexes) {
      ramp = hexes.map((h) => new THREE.Color(h));
    },
    burst(amount = 1) {
      const n = Math.floor(count * 0.35 * amount * params.spawn);
      for (let j = 0; j < n; j++) spawn(Math.floor(Math.random() * count), amount);
      const s = Math.floor(sparkCount * 0.7 * Math.min(1, amount) * params.sparks);
      for (let j = 0; j < s; j++) spawnSpark(Math.floor(Math.random() * sparkCount), 1);
    },
    /** A few sparks thrown up out of the flame (the visualizer's hi-hats). */
    sparkle(n = 4) {
      const s = Math.round(n * params.sparks);
      for (let j = 0; j < s; j++) spawnSpark(Math.floor(Math.random() * sparkCount), 0.5);
    },
    /** Put every particle out at once (an instant switch to another element). */
    extinguish() {
      age.set(life);
      sAge.set(sLife);
    },
  };
}
