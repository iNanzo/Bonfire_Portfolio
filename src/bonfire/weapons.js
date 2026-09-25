// Weapon swap choreography:
//   dissolve — the planted weapon rises out of the fire to the forge height (where
//              the new weapon will appear) while it ripple-dissolves from the point
//              up: local-space noise + screen-locked Bayer dither with a two-tone
//              glowing edge in the OLD colors. Particles peel off the edge as it passes.
//              They drift out only a little before a rotating double helix around
//              the new weapon's axis takes them over.
//   swirl    — the helix turns, carried by the bonfire's curl noise, the color
//              turning from the current flame's to the next
//   gather   — the helix tightens and spins faster as it collapses onto the new
//              weapon's surface
//   form     — the same ripple in reverse (pommel down to the point) in the NEW
//              colors; each particle dither-fades as the edge reaches its spot.
//              From the moment the particles turn color, a double helix of lines
//              wraps the new weapon: one growing from the point up, one from the
//              pommel down, closing in to the blade's real width as it completes.
//   hold     — fully formed: an echo of its silhouette bursts outward from it
//              (onFormed), the helix fades, and it flashes, then glows
//   stab     — it drives down into the ashes, the glow fading as it strikes
//   impact   — callback (flame color, fire growth, ground flames, fireflies)
//   settle   — a short decaying wobble while the last of the glow fades
import * as THREE from 'three';
import { createForgeFx, weaponSilhouette, profileAt } from './forgeFx.js';

const DISSOLVE_CHUNK = /* glsl */ `
  float wBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float wBayer4(vec2 a) { return wBayer2(0.5 * a) * 0.25 + wBayer2(a); }
  float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float wNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

// The ripple's threshold field: dv = noise·0.45 + bayer·0.25 + height·0.3, visible
// where dv ≥ uDissolve·1.15 − 0.05. Rising uDissolve eats the weapon from the point
// up; falling uDissolve builds it from the pommel down. edgeAt() is the same field
// on average, so particles can shed / fade exactly where the edge is.
const edgeAt = (h, jitter) => THREE.MathUtils.clamp((0.3925 + 0.3 * h + jitter) / 1.15, 0, 1);

// Weapons also get a firelit rim in the flame's bright color (faces turned away
// from the camera catch it) plus a faint wash of that color, so silhouettes read
// against both the flames and the night sky. uGlow washes the whole weapon in a
// color while it's being forged. Each weapon has its own rim color, so the one
// being forged is rimmed in its new flame's color, not the old one.
function dissolveMaterial(src, uniforms, toRoot) {
  const mat = new THREE.MeshLambertMaterial({ color: src.color.clone(), flatShading: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uToRoot: { value: toRoot } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uToRoot;\nvarying vec3 vLPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLPos = (uToRoot * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLPos;\nuniform float uDissolve;\nuniform vec3 uEdge;\nuniform vec3 uEdgeHot;\nuniform vec3 uRim;\nuniform float uGlow;\nuniform vec2 uSpan;\n${DISSOLVE_CHUNK}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb += uRim * (pow(rimK, 2.2) * 0.9 + 0.1);
        if (uGlow > 0.001) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, uGlow * 0.55) + uEdge * uGlow * (0.25 + pow(rimK, 2.0) * 0.6);
        }
        if (uDissolve > 0.001) {
          float h = clamp((vLPos.y - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
          float dv = wNoise(vLPos * 9.0) * 0.45 + wBayer4(gl_FragCoord.xy) * 0.25 + h * 0.3;
          float e = dv - (uDissolve * 1.15 - 0.05);
          if (e < 0.0) discard;
          if (e < 0.05) gl_FragColor.rgb = uEdgeHot;
          else if (e < 0.12) gl_FragColor.rgb = uEdge;
          else if (e > 0.19 && e < 0.215) gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, 0.6);
        }`);
  };
  return mat;
}

const ease = {
  inQuad: (t) => t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Mesh → weapon-root transforms, in the root's own space (the root has no parent yet). */
function rootTransforms(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const out = new Map();
  root.traverse((o) => { if (o.isMesh) out.set(o, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); });
  return out;
}

/** Area-weighted random points on a weapon's surface, plus its vertical extent, in its own space. */
function sampleSurface(toRoot, n) {
  const tris = [];
  let total = 0;
  let yMin = Infinity, yMax = -Infinity;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [o, m] of toRoot) {
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      yMin = Math.min(yMin, a.y, b.y, c.y);
      yMax = Math.max(yMax, a.y, b.y, c.y);
      const area = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
      if (area <= 0) continue;
      total += area;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), cum: total });
    }
  }
  const points = new Float32Array(n * 3);
  const heights = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const r = Math.random() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].cum < r) lo = mid + 1; else hi = mid; }
    const t = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    points[k * 3] = t.a.x + (t.b.x - t.a.x) * u + (t.c.x - t.a.x) * v;
    points[k * 3 + 1] = t.a.y + (t.b.y - t.a.y) * u + (t.c.y - t.a.y) * v;
    points[k * 3 + 2] = t.a.z + (t.b.z - t.a.z) * u + (t.c.z - t.a.z) * v;
    heights[k] = (points[k * 3 + 1] - yMin) / Math.max(1e-4, yMax - yMin);
  }
  return { points, heights, span: new THREE.Vector2(yMin, yMax) };
}

/**
 * @param {THREE.Object3D} gltfRoot  loaded scene containing "Weapon_<key>" nodes
 * @param {object} o
 * @param {THREE.Vector3} o.anchor  where weapons enter the ground
 * @param {number} o.layerSolid     normal render layer (outlined)
 * @param {number} o.layerGhost     color-only layer used while dissolving
 * @param {number} o.layerFx        additive fx layer (forge particles)
 * @param {THREE.Material} o.particleMaterial
 */
export function createWeapons(gltfRoot, {
  anchor, layerSolid, layerGhost, layerFx, particleMaterial, field, castShadows, reducedMotion, particles = 640, hooks,
}) {
  const holder = new THREE.Group();
  holder.position.copy(anchor);
  // The holder sets the usual planted lean; its origin is where the weapon
  // enters the ash. Each weapon then spins about its own long axis (below).
  holder.rotation.set(0.07, 0.16, -0.05);
  // Weapons are modeled at their final size and planting depth in tools/weapons.py.

  // Multi-material weapons load as a group with "<name>_N" child meshes; the
  // traversal visits parents first, so the first match per key is the root.
  const rimColor = new THREE.Color('#ffc76a'); // the settled flame's rim color
  const items = Object.create(null);
  gltfRoot.traverse((o) => {
    const m = /^Weapon_([a-z]+)/.exec(o.name);
    if (m && !items[m[1]]) items[m[1]] = o;
  });
  const N = reducedMotion ? 0 : particles;
  for (const [key, obj] of Object.entries(items)) {
    obj.removeFromParent();
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.visible = false;
    const toRoot = rootTransforms(obj);
    const surface = sampleSurface(toRoot, N);
    const uniforms = {
      uDissolve: { value: 0 }, uEdge: { value: new THREE.Color() }, uEdgeHot: { value: new THREE.Color() },
      uGlow: { value: 0 }, uRim: { value: rimColor.clone() }, uSpan: { value: surface.span },
    };
    for (const [o, m] of toRoot) {
      o.material = dissolveMaterial(o.material, uniforms, m);
      o.castShadow = castShadows;
      o.receiveShadow = true;
    }
    obj.userData.uniforms = uniforms;
    obj.userData.key = key;
    obj.userData.samples = surface.points;
    obj.userData.heights = surface.heights;
    obj.userData.toRoot = toRoot;
    holder.add(obj);
  }

  // --- forge particles (the soul of the old weapon becoming the new one) ----------
  const M = Math.max(1, N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(M), 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(M), 1));
  const forge = new THREE.Points(geo, particleMaterial);
  forge.frustumCulled = false;
  forge.layers.set(layerFx);
  const FP = geo.attributes.position.array;
  const FC = geo.attributes.color.array;
  const FS = geo.attributes.size.array;
  const FA = geo.attributes.alpha.array;
  const FV = new Float32Array(M * 3);
  const release = new Float32Array(M); // when the dissolving edge sheds it
  const fadeAt = new Float32Array(M);  // uDissolve at which the forming edge reaches its target
  const born = new Float32Array(M);
  const state = new Uint8Array(M);     // 0 idle, 1 free, 2 absorbed
  const heat = new Float32Array(M);    // flicker phase
  const grain = new Float32Array(M);   // base size: many fine specks, some mid, rare wisps
  const hAng = new Float32Array(M);    // helix: strand angle + jitter
  const hRad = new Float32Array(M);    // helix: radial jitter (strand thickness)

  // --- forge lines: the double helix, then the silhouette burst ---------------------
  const fx = N ? createForgeFx(particleMaterial, field.noise) : null;
  if (fx) fx.lines.layers.set(layerFx);
  let burstT = -1;
  let burstSil = null;
  const burstMatrix = new THREE.Matrix4();
  const lineLead = new THREE.Color();
  const lineTrail = new THREE.Color();
  const lineHot = new THREE.Color();

  function setLayer(obj, layer) {
    obj.traverse((o) => { if (o.isMesh) { o.layers.set(layer); o.castShadow = castShadows && layer === layerSolid; } });
  }

  let current = null;
  let incoming = null;
  let phase = 'idle';
  let t = 0;
  let queued = null;
  let resolveSwap = null;
  let swapPayload = null;
  const edgeOld = new THREE.Color();
  const edgeOldHot = new THREE.Color();
  const edgeNew = new THREE.Color();
  const edgeNewHot = new THREE.Color();
  const rampOld = [];
  const rampNew = [];

  const D = reducedMotion
    ? { dissolve: 0.35, swirl: 0, gather: 0, form: 0.35, hold: 0.1, stab: 0.01, settle: 0.6 }
    : { dissolve: 1.4, swirl: 0.3, gather: 0.6, form: 0.9, hold: 0.25, stab: 0.13, settle: 1.1 };
  const FORGE = D.dissolve + D.swirl + D.gather; // time over which the color turns old → new
  const TURNED = FORGE * 0.5;                     // the particles' color has swapped: the helix lines start
  const FORMED = FORGE + D.form;                  // ...and meet here
  const HOVER = reducedMotion ? 0 : 0.5; // the forge height: the old weapon rises to it, the new one forms there

  /** Spin the blade about its own axis to a random angle (either face shown, never edge-on). */
  function spin(obj) {
    obj.rotation.set(0, (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() * 2 - 1) * 0.85, 0);
  }

  function clearForge() {
    FS.fill(0);
    state.fill(2);
    geo.attributes.size.needsUpdate = true;
  }
  function clearLines() {
    burstT = -1;
    fx?.clear();
  }

  function show(key) {
    for (const [k, o] of Object.entries(items)) o.visible = k === key;
    current = items[key];
    current.position.set(0, 0, 0);
    spin(current);
    current.userData.uniforms.uDissolve.value = 0;
    current.userData.uniforms.uGlow.value = 0;
    setLayer(current, layerSolid);
  }

  /** Instantly place a weapon (initial load / deep links). */
  function set(key) {
    if (!Object.hasOwn(items, key)) throw new Error('Unknown weapon: ' + key);
    cancel();
    phase = 'idle';
    clearForge();
    show(key);
  }

  /**
   * Animate to a new weapon. `fromRamp`/`toRamp` are [lo, mid, hi, core] hex
   * ramps (old and new flame); `payload` is handed back to the swap hooks.
   * Resolves at impact.
   */
  // A transition already forging finishes; only the newest waiting request survives.
  // Canceled promises resolve explicitly so callers never wait forever.
  function cancelQueued() {
    queued?.resolve({ status: 'cancelled' });
    queued = null;
  }
  function cancel() {
    cancelQueued();
    resolveSwap?.({ status: 'cancelled' });
    resolveSwap = null;
    incoming = null;
    phase = 'idle';
    clearForge();
    clearLines();
  }
  function swap(key, fromRamp, toRamp, payload) {
    if (!Object.hasOwn(items, key)) return Promise.reject(new Error('Unknown weapon: ' + key));
    // A new swap may cut the previous one's settle short.
    if (phase === 'settle') {
      cancelQueued();
      current.rotation.z = 0;
      current.userData.uniforms.uGlow.value = 0;
      phase = 'idle';
    }
    if (phase !== 'idle') {
      cancelQueued();
      queued = { key, fromRamp, toRamp, payload };
      return new Promise((r) => { queued.resolve = r; });
    }
    if (current && current.userData.key === key) {
      // The geometry can stay put while the scene applies a new flame or item.
      hooks.onImpact?.(payload, key, true);
      return Promise.resolve({ status: 'applied' });
    }
    swapPayload = payload;
    edgeOld.set(fromRamp[1]);
    edgeOldHot.set(fromRamp[2]);
    edgeNew.set(toRamp[1]);
    edgeNewHot.set(toRamp[2]);
    rampOld.length = 0; rampNew.length = 0;
    fromRamp.forEach((h) => rampOld.push(new THREE.Color(h)));
    toRamp.forEach((h) => rampNew.push(new THREE.Color(h)));
    incoming = items[key];
    incoming.userData.uniforms.uRim.value.set(toRamp[2]);
    if (fx) incoming.userData.silhouette ??= weaponSilhouette(incoming.userData.toRoot);
    // Place the incoming weapon now (still hidden) so its surface can be targeted.
    spin(incoming);
    incoming.position.set(0, HOVER, 0);
    phase = 'dissolve';
    t = 0;
    elapsed = 0;
    clearLines();
    if (current) setLayer(current, layerGhost);
    const hOld = current?.userData.heights;
    const hNew = incoming.userData.heights;
    for (let i = 0; i < N; i++) {
      state[i] = 0;
      const u = edgeAt(hOld ? hOld[i] : Math.random(), (Math.random() - 0.5) * 0.4);
      release[i] = D.dissolve * (0.08 + 0.92 * u);
      fadeAt[i] = edgeAt(hNew[i], (Math.random() - 0.5) * 0.4);
      heat[i] = Math.random();
      const g = Math.random();
      grain[i] = g < 0.6 ? 0.72 : g < 0.9 ? 1.25 : 1.85;
      hAng[i] = (i & 1) * Math.PI + (Math.random() - 0.5) * 0.35;
      hRad[i] = (Math.random() - 0.5) * 0.08;
      FS[i] = 0;
    }
    helixSpin = Math.random() * Math.PI * 2;
    hooks.onSwapStart?.(payload);
    return new Promise((r) => { resolveSwap = r; });
  }

  const vA = new THREE.Vector3();
  const vH = new THREE.Vector3();
  const vT = new THREE.Vector3();
  const col = new THREE.Color();
  const HELIX_TURNS = 1.5;
  const helixWide = (s) => 0.19 + 0.15 * Math.sin(Math.PI * s); // the particle helix: a spindle, widest mid-blade
  let helixSpin = 0;

  function worldSample(obj, i, out) {
    const s = obj.userData.samples;
    return out.set(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]).applyMatrix4(obj.matrixWorld);
  }

  /** Particle i's slot on the double helix around the new weapon's axis (world). */
  function helixSlot(i, shrink, out) {
    const span = incoming.userData.uniforms.uSpan.value;
    const s = incoming.userData.heights[i];
    const len = span.y - span.x;
    const a = hAng[i] + s * HELIX_TURNS * Math.PI * 2 + helixSpin;
    const r = (helixWide(s) + hRad[i]) * (1 - shrink);
    return out.set(Math.cos(a) * r, span.x + s * len, Math.sin(a) * r).applyMatrix4(incoming.matrixWorld);
  }

  // Forge particles: shed by the old weapon's dissolving edge, they drift out a
  // little, then a rotating double helix around the new weapon's axis takes them
  // over (each particle keeps its target's height, so the helix spans the blade).
  // In the gather the helix tightens and spins faster as it collapses onto the new
  // weapon's surface; in the form each particle dither-fades as the forming edge
  // reaches it. Curl noise from the bonfire keeps a shimmer on all of it.
  // Size and transparency follow the fire's own simplex noise where each particle
  // is (coherent pockets, not per-particle static): hot flickers are small and
  // solid, cooler wisps larger and fainter.
  function stepForge(dt) {
    if (!N) return;
    holder.updateMatrixWorld(true);
    const k = phase === 'gather' ? Math.min(1, t / D.gather) : phase === 'form' ? 1 : 0;
    const formU = phase === 'form' ? incoming.userData.uniforms.uDissolve.value : 1;
    const p = Math.min(1, elapsed / FORGE);
    const blend = p * p * (3 - 2 * p); // current color → next color
    const shrink = 0.85 * smooth(0, 1, k);
    helixSpin += dt * 3.2 * (1 + 2.2 * k);
    const onSurface = smooth(0.25, 1, k);
    const rate = phase === 'gather' || phase === 'form' ? 4 + 14 * k * k : 5;
    const shimmer = 0.015 + 0.04 * (1 - k);
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      if (state[i] === 0) {
        if (phase === 'dissolve' && t >= release[i] && current) {
          worldSample(current, i, vA);
          FP[ix] = vA.x; FP[ix + 1] = vA.y; FP[ix + 2] = vA.z;
          FV[ix] = (Math.random() - 0.5) * 0.5;
          FV[ix + 1] = 0.2 + Math.random() * 0.3;
          FV[ix + 2] = (Math.random() - 0.5) * 0.5;
          born[i] = totalT;
          state[i] = 1;
        } else { FS[i] = 0; continue; }
      }
      if (state[i] === 2) { FS[i] = 0; continue; }
      const fade = phase === 'form' ? smooth(fadeAt[i] - 0.06, fadeAt[i] + 0.1, formU) : 1;
      if (fade <= 0.01) { state[i] = 2; FS[i] = 0; continue; }
      const c = field.fire(FP[ix] - anchor.x, FP[ix + 1], FP[ix + 2] - anchor.z, totalT);
      // A subtle drift from where it was shed...
      const drag = Math.exp(-dt * 2.2);
      FV[ix] = (FV[ix] + c.x * 0.5 * dt) * drag;
      FV[ix + 1] = (FV[ix + 1] + c.y * 0.3 * dt) * drag;
      FV[ix + 2] = (FV[ix + 2] + c.z * 0.5 * dt) * drag;
      FP[ix] += FV[ix] * dt; FP[ix + 1] += FV[ix + 1] * dt; FP[ix + 2] += FV[ix + 2] * dt;
      // ...until the helix takes it (fully by ~0.65 s after it was shed), collapsing
      // onto the new weapon's surface through the gather.
      helixSlot(i, shrink, vH);
      if (onSurface > 0) vH.lerp(worldSample(incoming, i, vT), onSurface);
      vH.x += c.x * shimmer; vH.y += c.y * shimmer; vH.z += c.z * shimmer;
      const grip = k > 0 ? 1 : smooth(0.12, 0.65, totalT - born[i]);
      const pull = (1 - Math.exp(-dt * rate)) * grip;
      FP[ix] += (vH.x - FP[ix]) * pull;
      FP[ix + 1] += (vH.y - FP[ix + 1]) * pull;
      FP[ix + 2] += (vH.z - FP[ix + 2]) * pull;
      // Vibrant, flickering flame colors turning from the current flame to the next:
      // mostly the saturated body tone, with bright flickers.
      const flick = (Math.sin(totalT * 23 + heat[i] * 40) + 1) * 0.5;
      const hot = flick > 0.72;
      col.copy(rampOld[hot ? 2 : 1]).lerp(rampNew[hot ? 2 : 1], blend).multiplyScalar(0.75 + flick * 0.25);
      FC[ix] = col.r; FC[ix + 1] = col.g; FC[ix + 2] = col.b;

      const age = totalT - born[i];
      const pocket = 0.5 + 0.5 * field.noise.noise3d(FP[ix] * 2.8, FP[ix + 1] * 2.8 - totalT * 1.1, FP[ix + 2] * 2.8 + heat[i] * 5);
      // Blooms as it's shed, tightens to fine points as the silhouette gathers.
      let size = grain[i] * (0.7 + 0.6 * pocket) * Math.min(1, 0.4 + age * 2.5) * (1 - 0.35 * k) * (0.75 + 0.25 * fade);
      let alpha = (0.35 + 0.65 * pocket) * Math.min(1, age * 6) * (0.75 + 0.25 * k);
      if (hot) { size *= 0.75; alpha = Math.max(alpha, 0.9); }
      FS[i] = size;
      FA[i] = alpha * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }

  // The double helix: from the moment the particles' color has swapped, two lines
  // trace the particle helix around the new weapon, one growing from the point up
  // and one from the pommel down. They span exactly the blade's length and, as the
  // blade completes, close in on the weapon itself: an oval just outside its real
  // cross-section at every height (its width one way, its thickness the other), so
  // they wrap the blade like a ribbon, passing behind it. They meet as the form
  // completes and fade through the hold; both taper out toward the ends.
  // The burst: once formed, one echo of the weapon's own silhouette grows out from
  // it in its plane, wobbling with noise as it fades.
  const TIGHTEN_FROM = D.dissolve + D.swirl; // the gather: the particles start collapsing
  const SNUG = 0.02; // how far outside the weapon's surface the closed-in helix sits (~2 texels up close)
  let tighten = 0;
  let lineProfile = null;
  const closeIn = (table, s) => {
    const snug = profileAt(table, s) + SNUG;
    const wide = Math.max(snug, helixWide(s));
    return wide + (snug - wide) * tighten;
  };
  const lineRX = (s) => closeIn(lineProfile.rx, s);
  const lineRZ = (s) => closeIn(lineProfile.rz, s);
  function stepLines(dt) {
    if (!fx) return;
    fx.begin();
    if (incoming && (phase === 'dissolve' || phase === 'swirl' || phase === 'gather' || phase === 'form' || phase === 'hold')) {
      const growth = smooth(0, 1, (elapsed - TURNED) / (FORMED - TURNED));
      if (growth > 0) {
        if (phase === 'hold') helixSpin += dt * 10;
        lineProfile = incoming.userData.silhouette.profile;
        tighten = smooth(0.2, 1, (elapsed - TIGHTEN_FROM) / (FORMED - TIGHTEN_FROM));
        lineLead.copy(rampNew[2]);
        lineTrail.copy(rampNew[1]).multiplyScalar(0.65);
        lineHot.copy(rampNew[3]);
        fx.helix({
          matrix: incoming.matrixWorld, y0: lineProfile.y0, y1: lineProfile.y1, spin: helixSpin, turns: HELIX_TURNS,
          growth, alpha: phase === 'hold' ? 1 - Math.min(1, t / D.hold) : 1, radiusX: lineRX, radiusZ: lineRZ,
          lead: lineLead, trail: lineTrail, head: lineHot, t: totalT,
        });
      }
    }
    if (burstT >= 0) {
      burstT += dt;
      const k = burstT / 0.6;
      if (k < 1) {
        lineLead.copy(rampNew[3]).lerp(rampNew[2], k);
        lineTrail.copy(rampNew[1]).multiplyScalar(0.7);
        lineHot.copy(rampNew[3]);
        fx.outline({
          sil: burstSil, matrix: burstMatrix, dilate: 0.02 + 0.07 * ease.outCubic(k), scale: 1 + 0.55 * ease.outCubic(k),
          wobble: 0.01 + 0.025 * k, alpha: (1 - k) ** 1.2, lead: lineLead, trail: lineTrail, hot: lineHot, t: totalT, seed: 3,
        });
      } else burstT = -1;
    }
    fx.end();
  }

  let totalT = 0;
  let elapsed = 0;
  function update(dt) {
    totalT += dt;
    stepLines(dt);
    if (phase === 'idle') return;
    t += dt;
    elapsed += dt;
    if (phase === 'dissolve') {
      const k = Math.min(1, t / D.dissolve);
      if (current) {
        current.position.y = ease.inOut(k) * HOVER;
        const u = current.userData.uniforms;
        u.uEdge.value.copy(edgeOld);
        u.uEdgeHot.value.copy(edgeOldHot);
        u.uDissolve.value = Math.max(0, (k - 0.08) / 0.92);
      }
      stepForge(dt);
      if (k >= 1) {
        if (current) current.visible = false;
        next(D.swirl > 0 ? 'swirl' : D.gather > 0 ? 'gather' : 'form');
      }
    } else if (phase === 'swirl') {
      stepForge(dt);
      if (t >= D.swirl) next('gather');
    } else if (phase === 'gather') {
      stepForge(dt);
      if (t >= D.gather) next('form');
    } else if (phase === 'form') {
      // The ripple runs in reverse; the new color's glow comes in once most of
      // the blade has formed, so it doesn't wash the edge out.
      const k = Math.min(1, t / D.form);
      const u = incoming.userData.uniforms;
      u.uDissolve.value = 1 - ease.inOut(k);
      u.uGlow.value = smooth(0.55, 1, k);
      stepForge(dt);
      if (k >= 1) {
        u.uDissolve.value = 0;
        u.uGlow.value = 1;
        clearForge();
        if (fx) { burstT = 0; burstSil = incoming.userData.silhouette; burstMatrix.copy(incoming.matrixWorld); }
        hooks.onFormed?.(swapPayload);
        next('hold');
      }
    } else if (phase === 'hold') {
      const k = Math.min(1, t / D.hold);
      if (!reducedMotion) incoming.position.y = HOVER + ease.outCubic(k) * 0.06;
      incoming.userData.uniforms.uGlow.value = 1 + 0.6 * (1 - k) ** 2; // the flash as it forms, settling to the glow
      if (t >= D.hold) next('stab');
    } else if (phase === 'stab') {
      const k = Math.min(1, t / D.stab);
      if (!reducedMotion) incoming.position.y = (HOVER + 0.06) * (1 - ease.inQuad(k));
      incoming.userData.uniforms.uGlow.value = 1 - k * 0.35; // the glow starts fading on the strike
      if (k >= 1) {
        incoming.position.y = 0;
        current = incoming;
        incoming = null;
        setLayer(current, layerSolid);
        next('settle');
        hooks.onImpact?.(swapPayload, current.userData.key, false);
        resolveSwap?.({ status: 'applied' });
        resolveSwap = null;
      }
    } else if (phase === 'settle') {
      const k = Math.min(1, t / D.settle);
      if (!reducedMotion) current.rotation.z = Math.sin(t * 60) * 0.035 * Math.max(0, 1 - k * 3);
      current.userData.uniforms.uGlow.value = 0.65 * (1 - ease.outCubic(k));
      if (k >= 1) {
        current.rotation.z = 0;
        current.userData.uniforms.uGlow.value = 0;
        phase = 'idle';
        if (queued) {
          const q = queued;
          queued = null;
          swap(q.key, q.fromRamp, q.toRamp, q.payload).then(q.resolve);
        }
      }
    }
  }

  function next(p) {
    phase = p;
    t = 0;
    if (p === 'form') beginForm();
  }

  function beginForm() {
    for (const o of Object.values(items)) if (o !== incoming) o.visible = false;
    incoming.visible = true;
    setLayer(incoming, layerGhost);
    incoming.position.set(0, HOVER, 0);
    const u = incoming.userData.uniforms;
    u.uEdge.value.copy(edgeNew);
    u.uEdgeHot.value.copy(edgeNewHot);
    u.uDissolve.value = 1;
    u.uGlow.value = 0;
  }

  /** Rim color follows the flame (sRGB hex); a weapon being forged keeps its new one. */
  function setRim(hex) {
    rimColor.set(hex);
    for (const o of Object.values(items)) if (o !== incoming) o.userData.uniforms.uRim.value.copy(rimColor);
  }

  return {
    holder,
    forge,
    lines: fx?.lines ?? null,
    set,
    swap,
    update,
    setRim,
    cancel,
    get currentKey() { return current?.userData.key ?? null; },
    keys: Object.keys(items),
    get busy() { return phase !== 'idle'; },
  };
}
