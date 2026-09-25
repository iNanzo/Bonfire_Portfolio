// Weapon swap choreography:
//   dissolve — the planted weapon lifts slightly and ripple-dissolves (screen-
//              locked Bayer dither + noise, glowing edge in the OLD color); as it
//              goes, it sheds bright flame-like particles from its surface
//   swirl    — the particles circle above the fire through the bonfire's curl
//              noise, their color turning from the current flame's to the next
//   gather   — they assemble into the silhouette of the new weapon
//   form     — the solid weapon ripple-forms inside it while the particles fade
//   hold     — fully formed, it glows in its new color
//   stab     — it drives down into the ashes, the glow fading as it strikes
//   impact   — callback (flame color, fire growth, ground flames, fireflies)
//   settle   — a short decaying wobble while the last of the glow fades
import * as THREE from 'three';

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

// Weapons also get a firelit rim in the flame's bright color (faces turned away
// from the camera catch it) plus a faint wash of that color, so silhouettes read
// against both the flames and the night sky. uGlow washes the whole weapon in a
// color while it's being forged. Each weapon has its own rim color, so the one
// being forged is rimmed in its new flame's color, not the old one.
function dissolveMaterial(src, uniforms) {
  const mat = new THREE.MeshLambertMaterial({ color: src.color.clone(), flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = uniforms.uDissolve;
    shader.uniforms.uEdge = uniforms.uEdge;
    shader.uniforms.uGlow = uniforms.uGlow;
    shader.uniforms.uRim = uniforms.uRim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uDissolve;\nuniform vec3 uEdge;\nuniform vec3 uRim;\nuniform float uGlow;\n${DISSOLVE_CHUNK}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb += uRim * (pow(rimK, 2.2) * 0.9 + 0.1);
        if (uGlow > 0.001) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, uGlow * 0.55) + uEdge * uGlow * (0.25 + pow(rimK, 2.0) * 0.6);
        }
        if (uDissolve > 0.001) {
          float dv = wNoise(vWPos * 9.0) * 0.6 + wBayer4(gl_FragCoord.xy) * 0.4;
          float th = uDissolve * 1.15 - 0.05;
          if (dv < th) discard;
          if (dv < th + 0.09) gl_FragColor.rgb = uEdge;
        }`);
  };
  return mat;
}

const ease = {
  inQuad: (t) => t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

/** Area-weighted random points on a weapon's surface, in its own local space. */
function sampleSurface(root, n) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      const area = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
      if (area <= 0) continue;
      total += area;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), cum: total });
    }
  });
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const r = Math.random() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid].cum < r) lo = mid + 1; else hi = mid; }
    const t = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out[k * 3] = t.a.x + (t.b.x - t.a.x) * u + (t.c.x - t.a.x) * v;
    out[k * 3 + 1] = t.a.y + (t.b.y - t.a.y) * u + (t.c.y - t.a.y) * v;
    out[k * 3 + 2] = t.a.z + (t.b.z - t.a.z) * u + (t.c.z - t.a.z) * v;
  }
  return out;
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
  anchor, layerSolid, layerGhost, layerFx, particleMaterial, field, castShadows, reducedMotion, particles = 420, hooks,
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
  const items = {};
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
    const uniforms = { uDissolve: { value: 0 }, uEdge: { value: new THREE.Color() }, uGlow: { value: 0 }, uRim: { value: rimColor.clone() } };
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = dissolveMaterial(o.material, uniforms);
      o.castShadow = castShadows;
      o.receiveShadow = true;
    });
    obj.userData.uniforms = uniforms;
    obj.userData.key = key;
    obj.userData.samples = N ? sampleSurface(obj, N) : null;
    holder.add(obj);
  }

  // --- forge particles (the soul of the old weapon becoming the new one) ----------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, N) * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, N) * 3), 3));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(Math.max(1, N)), 1));
  const forge = new THREE.Points(geo, particleMaterial);
  forge.frustumCulled = false;
  forge.layers.set(layerFx);
  const FP = geo.attributes.position.array;
  const FC = geo.attributes.color.array;
  const FS = geo.attributes.size.array;
  const FV = new Float32Array(Math.max(1, N) * 3);
  const release = new Float32Array(Math.max(1, N));
  const state = new Uint8Array(Math.max(1, N)); // 0 idle, 1 free, 2 absorbed
  const heat = new Float32Array(Math.max(1, N));

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
  const edgeNew = new THREE.Color();
  const rampOld = [];
  const rampNew = [];

  const D = reducedMotion
    ? { dissolve: 0.35, swirl: 0, gather: 0, form: 0.35, hold: 0.1, stab: 0.01, settle: 0.6 }
    : { dissolve: 0.8, swirl: 0.3, gather: 0.6, form: 0.5, hold: 0.25, stab: 0.13, settle: 1.1 };
  const FORGE = D.dissolve + D.swirl + D.gather; // time over which the color turns old → new
  const HOVER = reducedMotion ? 0 : 0.5; // how high the new weapon forms above its planted spot

  /** Spin the blade about its own axis to a random angle (either face shown, never edge-on). */
  function spin(obj) {
    obj.rotation.set(0, (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() * 2 - 1) * 0.85, 0);
  }

  function clearForge() {
    FS.fill(0);
    state.fill(2);
    geo.attributes.size.needsUpdate = true;
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
    phase = 'idle';
    clearForge();
    show(key);
  }

  /**
   * Animate to a new weapon. `fromRamp`/`toRamp` are [lo, mid, hi, core] hex
   * ramps (old and new flame); `payload` is handed back to the swap hooks.
   * Resolves at impact.
   */
  function swap(key, fromRamp, toRamp, payload) {
    if (!items[key]) return Promise.resolve();
    // A new swap may cut the previous one's settle short.
    if (phase === 'settle') {
      current.rotation.z = 0;
      current.userData.uniforms.uGlow.value = 0;
      phase = 'idle';
    }
    if (phase !== 'idle') {
      queued = { key, fromRamp, toRamp, payload };
      return new Promise((r) => { queued.resolve = r; });
    }
    if (current && current.userData.key === key) return Promise.resolve();
    swapPayload = payload;
    edgeOld.set(fromRamp[1]);
    edgeNew.set(toRamp[1]);
    rampOld.length = 0; rampNew.length = 0;
    fromRamp.forEach((h) => rampOld.push(new THREE.Color(h)));
    toRamp.forEach((h) => rampNew.push(new THREE.Color(h)));
    incoming = items[key];
    incoming.userData.uniforms.uRim.value.set(toRamp[2]);
    // Place the incoming weapon now (still hidden) so its surface can be targeted.
    spin(incoming);
    incoming.position.set(0, HOVER, 0);
    phase = 'dissolve';
    t = 0;
    elapsed = 0;
    if (current) setLayer(current, layerGhost);
    for (let i = 0; i < N; i++) {
      state[i] = 0;
      release[i] = 0.04 + Math.random() * (D.dissolve * 0.85);
      heat[i] = Math.random();
      FS[i] = 0;
    }
    hooks.onSwapStart?.(payload);
    return new Promise((r) => { resolveSwap = r; });
  }

  const vA = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const vT = new THREE.Vector3();
  const col = new THREE.Color();

  function worldSample(obj, i, out) {
    const s = obj.userData.samples;
    return out.set(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]).applyMatrix4(obj.matrixWorld);
  }

  // Forge particles: shed by the old weapon, swirling above the fire through the
  // bonfire's curl-noise field, then assembling into the new weapon's silhouette,
  // which the solid weapon forms inside while the particles fade away.
  function stepForge(dt) {
    if (!N) return;
    holder.updateMatrixWorld(true);
    vC.copy(anchor).add(new THREE.Vector3(0, 1.25, 0));
    const k = phase === 'gather' ? Math.min(1, t / D.gather) : phase === 'form' ? 1 : 0;
    const fadeK = phase === 'form' ? Math.min(1, t / D.form) : 0;
    const p = Math.min(1, elapsed / FORGE);
    const blend = p * p * (3 - 2 * p); // current color → next color
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      if (state[i] === 0) {
        if (phase === 'dissolve' && t >= release[i] && current) {
          worldSample(current, i, vA);
          FP[ix] = vA.x; FP[ix + 1] = vA.y; FP[ix + 2] = vA.z;
          FV[ix] = (Math.random() - 0.5) * 0.9;
          FV[ix + 1] = 0.5 + Math.random() * 0.7;
          FV[ix + 2] = (Math.random() - 0.5) * 0.9;
          state[i] = 1;
        } else { FS[i] = 0; continue; }
      }
      if (state[i] === 2) { FS[i] = 0; continue; }
      const c = field.fire(FP[ix] - anchor.x, FP[ix + 1], FP[ix + 2] - anchor.z, totalT);
      if (phase === 'gather' || phase === 'form') {
        // Assemble onto points across the new weapon; a little flame-noise shimmer stays.
        worldSample(incoming, i, vT);
        const shimmer = 0.015 + 0.05 * (1 - k);
        vT.x += c.x * shimmer; vT.y += c.y * shimmer; vT.z += c.z * shimmer;
        const pull = 1 - Math.exp(-dt * (2 + 14 * k * k));
        FP[ix] += (vT.x - FP[ix]) * pull + FV[ix] * dt * (1 - k);
        FP[ix + 1] += (vT.y - FP[ix + 1]) * pull + FV[ix + 1] * dt * (1 - k);
        FP[ix + 2] += (vT.z - FP[ix + 2]) * pull + FV[ix + 2] * dt * (1 - k);
        const damp = 1 - Math.min(1, dt * 4);
        FV[ix] *= damp; FV[ix + 1] *= damp; FV[ix + 2] *= damp;
      } else {
        // Circle above the fire, carried by the same curl noise as the bonfire.
        const dx = FP[ix] - vC.x, dy = FP[ix + 1] - vC.y, dz = FP[ix + 2] - vC.z;
        FV[ix] += (-dx * 2.2 - dz * 2.6 + c.x * 1.4) * dt;
        FV[ix + 1] += (-dy * 2.2 + 0.4 + c.y * 0.8) * dt;
        FV[ix + 2] += (-dz * 2.2 + dx * 2.6 + c.z * 1.4) * dt;
        const drag = Math.exp(-dt * 1.3);
        FV[ix] *= drag; FV[ix + 1] *= drag; FV[ix + 2] *= drag;
        FP[ix] += FV[ix] * dt; FP[ix + 1] += FV[ix + 1] * dt; FP[ix + 2] += FV[ix + 2] * dt;
      }
      // Vibrant, flickering flame colors turning from the current flame to the next:
      // mostly the saturated body tone, with bright flickers. At the end they wink
      // out one by one at full color (dimming them instead would walk the color
      // down through other palette entries — often the old flame's).
      const flick = (Math.sin(totalT * 23 + heat[i] * 40) + 1) * 0.5;
      const tone = flick > 0.72 ? 2 : 1;
      col.copy(rampOld[tone]).lerp(rampNew[tone], blend).multiplyScalar(0.75 + flick * 0.25);
      FC[ix] = col.r; FC[ix + 1] = col.g; FC[ix + 2] = col.b;
      FS[i] = fadeK > 0.08 + heat[i] * 0.9 ? 0 : heat[i] > 0.75 ? 3 : 2;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }

  let totalT = 0;
  let elapsed = 0;
  function update(dt) {
    totalT += dt;
    if (phase === 'idle') return;
    t += dt;
    elapsed += dt;
    if (phase === 'dissolve') {
      const k = Math.min(1, t / D.dissolve);
      if (current) {
        current.position.y = ease.outCubic(k) * (reducedMotion ? 0 : 0.18);
        const u = current.userData.uniforms;
        u.uEdge.value.copy(edgeOld);
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
      // The solid weapon ripple-forms inside the particle silhouette, glowing in
      // its new color, while the particles fade out.
      const k = Math.min(1, t / D.form);
      const u = incoming.userData.uniforms;
      u.uDissolve.value = 1 - ease.inOut(k);
      u.uGlow.value = ease.outCubic(k);
      stepForge(dt);
      if (k >= 1) {
        u.uDissolve.value = 0;
        u.uGlow.value = 1;
        clearForge();
        next('hold');
      }
    } else if (phase === 'hold') {
      if (!reducedMotion) incoming.position.y = HOVER + ease.outCubic(Math.min(1, t / D.hold)) * 0.06;
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
        hooks.onImpact?.(swapPayload);
        resolveSwap?.();
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
    set,
    swap,
    update,
    setRim,
    keys: Object.keys(items),
    get busy() { return phase !== 'idle'; },
  };
}
