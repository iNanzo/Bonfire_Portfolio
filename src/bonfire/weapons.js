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
// The visualizer adds a hold (the new weapon hangs over the fire until the drop), a
// swing (the planted weapon leaves the fire for a routine of moves, bladeMotion.js) and
// signs of life: a shudder on hard beats, a held blade's sway and trembling.
import * as THREE from 'three';
import { createForgeFx, weaponSilhouette, profileAt } from './forgeFx.js';
import { createRoutine } from './bladeMotion.js';
import { createForgeParticles, HELIX_TURNS, helixWide } from './forgeParticles.js';
import { smoothstep } from '../math.js';

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

  // --- forge particles (forgeParticles.js): the soul of the old weapon becoming the new one
  const forge = createForgeParticles({ count: N, material: particleMaterial, layer: layerFx, field, anchor });

  // --- forge lines: the double helix, then the silhouette burst ---------------------
  const fx = N ? createForgeFx(particleMaterial, field.noise) : null;
  if (fx) fx.lines.layers.set(layerFx);
  let burstT = -1;
  let burstSil = null;
  const burstMatrix = new THREE.Matrix4();
  const lineLead = new THREE.Color();
  const lineTrail = new THREE.Color();
  const lineHot = new THREE.Color();
  // Smear frames: a fast swing leaves outlines of the blade at the poses it just passed
  // through (the last SMEAR frames), fading with age — the pixel-art way to sell speed.
  const SMEAR = 3;
  const smearMats = Array.from({ length: SMEAR }, () => new THREE.Matrix4());
  let smearCount = 0;
  let smearSpeed = 0;
  const smearLead = new THREE.Color();
  const smearTrail = new THREE.Color();

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
    pace = 1;
    holding = false;
    endSwing();
    forge.clear();
    clearLines();
  }
  // `pace` plays the whole choreography faster or slower (the visualizer fits it to a
  // whole number of beats); `hold` keeps the new weapon hovering, formed, until
  // release() (the visualizer forges in a breakdown and strikes on the drop). `rush`
  // (the site): asked for while another swap is running, that one speeds up and this
  // one plays quicker too, so clicking through projects never feels like waiting.
  function swap(key, fromRamp, toRamp, payload, { pace: swapPace = 1, hold = false, rush = false } = {}) {
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
      if (rush) { hurry(2.2); swapPace = Math.max(swapPace, 1.6); }
      queued = { key, fromRamp, toRamp, payload, opts: { pace: swapPace, hold } };
      return new Promise((r) => { queued.resolve = r; });
    }
    pace = swapPace;
    holding = hold;
    quiver = 0;
    if (current) current.rotation.z = 0;
    forge.clear(); // (they're needed again, even mid-fling)
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
    forge.begin(current?.userData.heights, incoming.userData.heights, D.dissolve, edgeAt);
    helixSpin = Math.random() * Math.PI * 2;
    hooks.onSwapStart?.(payload);
    return new Promise((r) => { resolveSwap = r; });
  }

  /**
   * Play the running swap faster (at least `factor` × its pace) up to the impact: a click
   * on the fire skips ahead. A held weapon and a swinging blade aren't hurried. True if
   * there was a swap to hurry.
   */
  function hurry(factor = 4) {
    if (phase === 'idle' || phase === 'settle' || phase === 'swing' || holding) return false;
    pace = Math.max(pace, factor);
    return true;
  }

  let helixSpin = 0; // the forge helix's turn (the particles and the lines share it)
  /** A step of the forge particles through the dissolve, swirl, gather and form. */
  function stepForge(dt) {
    holder.updateMatrixWorld(true);
    const k = phase === 'gather' ? Math.min(1, t / D.gather) : phase === 'form' ? 1 : 0;
    helixSpin += dt * 3.2 * (1 + 2.2 * k);
    const p = Math.min(1, elapsed / FORGE);
    forge.step(dt, {
      shedUntil: phase === 'dissolve' ? t : -1,
      gather: k,
      forming: phase === 'form',
      formU: phase === 'form' ? incoming.userData.uniforms.uDissolve.value : 1,
      pulling: phase === 'gather' || phase === 'form',
      blend: p * p * (3 - 2 * p), // current color → next color
      spin: helixSpin, from: current, to: incoming, time: totalT, colorsFrom: rampOld, colorsTo: rampNew,
    });
  }

  let auraKick = 0; // a beat's push on a held weapon's aura (and its glow and lines)
  let auraElement = 'fire'; // the element the held blade will strike with: the aura takes after it

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
  // The lines fade through the hold, unless the weapon is held: then they come back
  // and pulse with the beat and the build-up.
  const heldLineAlpha = () => Math.max(1 - Math.min(1, t / D.hold),
    holding ? (0.3 + 0.4 * charge + 0.5 * auraKick) * smoothstep(D.hold, D.hold + 0.8, t) : 0);
  const lineRZ = (s) => closeIn(lineProfile.rz, s);
  function stepLines(dt) {
    if (!fx) return;
    fx.begin();
    if (incoming && (phase === 'dissolve' || phase === 'swirl' || phase === 'gather' || phase === 'form' || phase === 'hold')) {
      const growth = smoothstep(0, 1, (elapsed - TURNED) / (FORMED - TURNED));
      if (growth > 0) {
        if (phase === 'hold') helixSpin += dt * (holding ? 4 + 9 * charge + 20 * auraKick : 10);
        lineProfile = incoming.userData.silhouette.profile;
        tighten = smoothstep(0.2, 1, (elapsed - TIGHTEN_FROM) / (FORMED - TIGHTEN_FROM));
        lineLead.copy(rampNew[2]);
        lineTrail.copy(rampNew[1]).multiplyScalar(0.65);
        lineHot.copy(rampNew[3]);
        fx.helix({
          matrix: incoming.matrixWorld, y0: lineProfile.y0, y1: lineProfile.y1, spin: helixSpin, turns: HELIX_TURNS,
          growth, alpha: phase === 'hold' ? heldLineAlpha() : 1, radiusX: lineRX, radiusZ: lineRZ,
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
    if (phase === 'swing' && current?.userData.silhouette && smearSpeed > 3) {
      const k = Math.min(1, (smearSpeed - 3) / 6);
      smearLead.copy(current.userData.uniforms.uRim.value);
      smearTrail.copy(smearLead).multiplyScalar(0.5);
      for (let j = 0; j < smearCount; j++) {
        fx.outline({
          sil: current.userData.silhouette, matrix: smearMats[j], dilate: 0, scale: 1, wobble: 0.004,
          alpha: k * (1 - (j + 1) / (smearCount + 1)) * 0.8, lead: smearLead, trail: smearTrail, hot: smearLead, t: totalT, seed: 7 + j,
        });
      }
    }
    fx.end();
  }

  let totalT = 0;
  let elapsed = 0;
  let pace = 1;
  let holding = false;
  let charge = 0; // 0..1: how hard a held weapon glows (the visualizer feeds it the build-up)
  let glowKick = 0; // a beat's glow on the planted weapon
  let quiver = 0;   // a hard beat's shudder through the planted weapon
  let alive = true; // (the visualizer) the blade moves as if alive: it shudders, sways, trembles
  function update(dt) {
    totalT += dt;
    forge.stepFling(dt);
    // A beat's glow on the planted weapon (the visualizer).
    if (glowKick > 0.005) {
      glowKick *= Math.exp(-dt / 0.2);
      if (current && phase === 'idle') current.userData.uniforms.uGlow.value = glowKick > 0.005 ? glowKick * 0.8 : 0;
      else if (current && phase === 'settle') current.userData.uniforms.uGlow.value = Math.max(current.userData.uniforms.uGlow.value, glowKick * 0.8);
    }
    // ...and a hard one shudders through it.
    if (quiver > 0.002 && current && phase === 'idle') {
      quiver *= Math.exp(-dt / 0.16);
      current.rotation.z = quiver > 0.002 ? Math.sin(totalT * 55) * 0.03 * quiver : 0;
    }
    if (phase !== 'idle' && phase !== 'settle') dt *= pace;
    stepLines(dt);
    if (phase === 'idle') return;
    t += dt;
    elapsed += dt;
    if (phase === 'swing') {
      stepSwing(dt);
    } else if (phase === 'dissolve') {
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
        next(D.swirl > 0 ? 'swirl' : D.gather > 0 ? 'gather' : 'form', t - D.dissolve);
      }
    } else if (phase === 'swirl') {
      stepForge(dt);
      if (t >= D.swirl) next('gather', t - D.swirl);
    } else if (phase === 'gather') {
      stepForge(dt);
      if (t >= D.gather) next('form', t - D.gather);
    } else if (phase === 'form') {
      // The ripple runs in reverse; the new color's glow comes in once most of
      // the blade has formed, so it doesn't wash the edge out.
      const k = Math.min(1, t / D.form);
      const u = incoming.userData.uniforms;
      u.uDissolve.value = 1 - ease.inOut(k);
      u.uGlow.value = smoothstep(0.55, 1, k);
      stepForge(dt);
      if (k >= 1) {
        u.uDissolve.value = 0;
        u.uGlow.value = 1;
        forge.clear();
        if (fx) { burstT = 0; burstSil = incoming.userData.silhouette; burstMatrix.copy(incoming.matrixWorld); }
        hooks.onFormed?.(swapPayload);
        next('hold', t - D.form);
      }
    } else if (phase === 'hold') {
      const k = Math.min(1, t / D.hold);
      // A held weapon hangs there, bobbing a little and glowing with the build-up.
      const bob = holding && !reducedMotion ? Math.sin((t - D.hold) * 2.4) * 0.012 * k : 0;
      if (!reducedMotion) incoming.position.y = HOVER + ease.outCubic(k) * 0.06 + bob;
      incoming.userData.uniforms.uGlow.value = 1 + 0.6 * (1 - k) ** 2 + (holding ? (0.5 * charge + 0.6 * auraKick) * k : 0); // the flash as it forms, settling to the glow
      if (holding && t >= D.hold * 0.5) {
        if (!forge.aura) forge.startAura(totalT);
        holder.updateMatrixWorld(true);
        auraKick *= Math.exp(-dt / 0.16);
        forge.stepAura(dt, { blade: incoming, time: totalT, charge, kick: auraKick, element: auraElement, colors: rampNew });
      }
      // Alive (the visualizer): it sways and turns as if looking about, and trembles harder
      // as the build rises, straining to strike.
      if (holding && alive && !reducedMotion) {
        const on = smoothstep(D.hold, D.hold + 1.5, t);
        const tremble = (0.003 + 0.03 * charge * charge) * on;
        incoming.rotation.x = Math.sin(totalT * 0.9) * 0.05 * on + Math.sin(totalT * 71) * tremble;
        incoming.rotation.z = Math.sin(totalT * 0.7 + 1.3) * 0.06 * on + Math.sin(totalT * 83 + 2) * tremble;
      }
      if (t >= D.hold && !holding) {
        if (forge.aura) { holder.updateMatrixWorld(true); forge.fling(incoming.matrixWorld); }
        next('stab', Math.min(t - D.hold, 0.05)); // (a released hold starts the strike fresh)
      }
    } else if (phase === 'stab') {
      const k = Math.min(1, t / D.stab);
      if (!reducedMotion) incoming.position.y = (HOVER + 0.06) * (1 - ease.inQuad(k));
      incoming.rotation.x *= 1 - k; // (straightening from any sway as it drives in)
      incoming.rotation.z *= 1 - k;
      incoming.userData.uniforms.uGlow.value = 1 - k * 0.35; // the glow starts fading on the strike
      if (k >= 1) {
        incoming.position.y = 0;
        incoming.rotation.x = 0;
        incoming.rotation.z = 0;
        current = incoming;
        incoming = null;
        setLayer(current, layerSolid);
        next('settle', t - D.stab);
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
          swap(q.key, q.fromRamp, q.toRamp, q.payload, q.opts).then(q.resolve);
        }
      }
    }
  }

  // --- The living blade (the visualizer) ----------------------------------------------
  // The planted weapon pulls itself out of the fire and fights on its own: a routine of
  // slashes, thrusts and spins on the beat (bladeMotion.js), then it plunges back in.
  // The routine gives the weapon's world pose each frame; it's converted into the
  // holder's space. The fire reacts through the hooks: a trail and a wake every frame,
  // a burst at each hit, the ring when it plunges.
  let routine = null;
  let swingPlan = null;
  let hitIndex = 0;
  const restPos = new THREE.Vector3();
  // The planted rotation, kept as the Euler angles spin() set: the shudder and the settle
  // write rotation.z, which is only a wobble while x and z are 0. (Restoring the
  // quaternion instead lets three.js re-derive the angles, and for a blade turned more
  // than 90° it can come back as (π, π − y, π): writing z then plants it upside down.)
  const restRot = new THREE.Euler();
  const gripL = new THREE.Vector3();
  const tipL = new THREE.Vector3();
  const sP = new THREE.Vector3();
  const sQ = new THREE.Quaternion();
  const sM = new THREE.Matrix4();
  const sInv = new THREE.Matrix4();
  const sScale = new THREE.Vector3();
  const lastGrip = new THREE.Vector3();
  const lastTip = new THREE.Vector3();
  const nowGrip = new THREE.Vector3();
  const nowTip = new THREE.Vector3();
  const hitDir = new THREE.Vector3();
  /** A weapon's grip and point, in its own space. */
  function bladeLocal(obj, grip, tip) {
    const span = obj.userData.uniforms.uSpan.value;
    const len = span.y - span.x;
    grip.set(0, span.y - 0.12 * len, 0);
    tip.set(0, span.x, 0);
    return len;
  }

  /**
   * Start a routine. plan: { hits: [s, …] and plunge (s from now), basis: () => the camera's
   * { right, up, toCam, pos }, moves, alive, onMove(k, kind), onHit(k, kind), rng }.
   */
  function swing(plan) {
    if (phase !== 'idle' || !current || reducedMotion || !plan.hits.length) return false;
    const len = bladeLocal(current, gripL, tipL);
    quiver = 0;
    current.rotation.z = 0;
    current.updateMatrixWorld(true);
    restPos.copy(current.position);
    restRot.copy(current.rotation);
    holder.updateMatrixWorld(true);
    const center = holder.getWorldPosition(new THREE.Vector3());
    center.y = Math.max(1.05, 0.35 + 0.6 * len);
    routine = createRoutine({
      blade: { grip: gripL, tip: tipL, len },
      home: { pos: current.getWorldPosition(new THREE.Vector3()), quat: current.getWorldQuaternion(new THREE.Quaternion()) },
      center, basis: plan.basis, hits: plan.hits, plunge: plan.plunge, moves: plan.moves, alive: plan.alive ?? alive, onMove: plan.onMove, rng: plan.rng,
    });
    swingPlan = plan;
    hitIndex = 0;
    smearCount = 0;
    smearSpeed = 0;
    if (fx) current.userData.silhouette ??= weaponSilhouette(current.userData.toRoot); // (for the smear, ready before it's needed)
    lastGrip.copy(gripL).applyMatrix4(current.matrixWorld);
    lastTip.copy(tipL).applyMatrix4(current.matrixWorld);
    pace = 1;
    phase = 'swing';
    t = 0;
    return true;
  }

  function stepSwing(dt) {
    routine.pose(t, sP, sQ);
    // World pose → the weapon's transform under the holder.
    sM.compose(sP, sQ, sScale.set(1, 1, 1));
    sInv.copy(holder.matrixWorld).invert();
    sM.premultiply(sInv);
    sM.decompose(current.position, current.quaternion, sScale);
    current.updateMatrixWorld(true);
    nowGrip.copy(gripL).applyMatrix4(current.matrixWorld);
    nowTip.copy(tipL).applyMatrix4(current.matrixWorld);
    const tipSpeed = nowTip.distanceTo(lastTip) / Math.max(dt, 1e-3);
    // Remember this pose for the smear (newest first).
    for (let j = SMEAR - 1; j > 0; j--) smearMats[j].copy(smearMats[j - 1]);
    smearMats[0].copy(current.matrixWorld);
    smearCount = Math.min(SMEAR, smearCount + 1);
    smearSpeed = tipSpeed;
    current.userData.uniforms.uGlow.value = 0.35 + Math.min(1.1, tipSpeed / 7);
    hooks.onSwingFrame?.(lastGrip, lastTip, nowGrip, nowTip, dt, tipSpeed);
    while (hitIndex < routine.hits.length && t >= routine.hits[hitIndex].t) {
      const { kind } = routine.hits[hitIndex];
      hitDir.subVectors(nowTip, lastTip);
      if (hitDir.lengthSq() < 1e-8) hitDir.subVectors(nowTip, nowGrip);
      hooks.onSwingHit?.(kind, nowTip, hitDir.normalize());
      swingPlan.onHit?.(hitIndex, kind);
      hitIndex++;
    }
    lastGrip.copy(nowGrip);
    lastTip.copy(nowTip);
    if (t >= routine.end) {
      current.position.copy(restPos);
      current.rotation.copy(restRot);
      routine = null;
      swingPlan = null;
      next('settle');
      hooks.onSwingImpact?.();
    }
  }
  function endSwing() {
    if (!routine || !current) return;
    current.position.copy(restPos);
    current.rotation.copy(restRot);
    current.userData.uniforms.uGlow.value = 0;
    routine = null;
    swingPlan = null;
  }

  // Each phase starts with the time the last one overran by, so the impact lands
  // exactly impactTime after the swap began (the visualizer puts it on a beat).
  function next(p, carry = 0) {
    phase = p;
    t = Math.max(0, carry);
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
    forge: forge.points,
    lines: fx?.lines ?? null,
    set,
    swap,
    update,
    setRim,
    cancel,
    swing,
    hurry,
    /** The planted weapon (for picking it with the cursor), or null mid-swap. */
    get planted() { return phase === 'idle' ? current : null; },
    get swinging() { return phase === 'swing'; },
    /** (The visualizer) the blade moves as if alive: flourishes, a shudder on hard beats, a held one's sway. */
    set alive(v) { alive = !!v; },
    /**
     * Where the blade is (world, as of the last frame): its middle, point and grip, the
     * flat's normal and its rotation, and whether it's out of the fire (swinging or held).
     * For cameras that follow it.
     */
    blade(out) {
      const obj = incoming && (phase === 'form' || phase === 'hold' || phase === 'stab') ? incoming : current;
      if (!obj) return null;
      out.len = bladeLocal(obj, out.grip, out.tip);
      out.grip.applyMatrix4(obj.matrixWorld);
      out.tip.applyMatrix4(obj.matrixWorld);
      out.mid.lerpVectors(out.grip, out.tip, 0.5);
      out.normal.set(0, 0, 1).transformDirection(obj.matrixWorld);
      obj.matrixWorld.decompose(sP, out.quat, sScale);
      out.swinging = phase === 'swing';
      out.free = phase === 'swing' || obj === incoming;
      return out;
    },
    /** The element a held blade will strike with (its vortex takes after it). */
    set auraElement(key) { auraElement = key; },
    /** Let a held weapon strike, at `strikePace` × the usual speed. False if nothing is held. */
    release(strikePace = 1) {
      if (!holding) return false;
      holding = false;
      pace = strikePace;
      return true;
    },
    get currentKey() { return current?.userData.key ?? null; },
    /** A weapon is moving this frame (so its shadow needs redrawing). */
    get moving() { return phase !== 'idle' || quiver > 0.002; },
    keys: Object.keys(items),
    get busy() { return phase !== 'idle'; },
    get holding() { return holding; },
    /** A beat (the visualizer): a held weapon's aura kicks out; a planted one glows. 0..1. */
    beat(strength = 1) {
      if (reducedMotion) return;
      auraKick = Math.max(auraKick, strength);
      glowKick = Math.max(glowKick, strength);
      if (alive) quiver = Math.max(quiver, (strength - 0.5) * 2);
    },
    /** An echo of the planted weapon's silhouette bursts out of it, in `ramp`'s colors. */
    echo(ramp) {
      if (!fx || !current || (phase !== 'idle' && phase !== 'settle')) return;
      current.userData.silhouette ??= weaponSilhouette(current.userData.toRoot);
      rampNew.length = 0;
      ramp.forEach((h) => rampNew.push(new THREE.Color(h)));
      holder.updateMatrixWorld(true);
      burstT = 0;
      burstSil = current.userData.silhouette;
      burstMatrix.copy(current.matrixWorld);
    },
    set charge(v) { charge = Math.min(1, Math.max(0, v)); },
    /** Seconds from swap() to impact at pace 1 (not counting a hold). */
    impactTime: D.dissolve + D.swirl + D.gather + D.form + D.hold + D.stab,
  };
}
