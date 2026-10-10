// @ts-nocheck: 6 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
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
//
// Every swap takes after the element it forges into, keeping the steps above; each
// element has its own big moves, readable in the first half second:
//   fire       as above: embers rising off a steady two-tone edge, a smooth shimmering
//              helix, the blade forming from the pommel down
//   lightning  struck apart and re-forged: a bolt out of the sky hits the old blade, which
//              strobes as if electrocuted and crackles apart (a white-hot flickering edge,
//              an arc crawling along it, crossed sparks that snap and blink); while the
//              particles gather, arcs leap between them and the ground; the helix crackles
//              in broken jagged strands; the new blade forms in five jumps, each a flash
//              and an arc to the ground; then a bolt out of the sky into its pommel
//   ice        frozen, shattered, grown back: frost creeps up the old blade from its point
//              and it shatters all at once, its shards flung out and falling before a slow
//              hexagonal helix gathers them; the new blade grows from its point up inside a
//              cocoon of crystals, each glinting shard freezing onto it, and when it's
//              whole the cocoon cracks off and a cut-crystal echo grows out in steps
// Their big moments land like small hits (hooks.onForgeStrike: a flash and a jolt).
// The dissolve, swirl, gather and form, each element's moves among them, are forgeRun.js's
// (the knight's arrival runs the same forge): the weapon is its subject, and this file adds
// the rise to the forge height, the hold, the stab and the settle.
import * as THREE from 'three';
import { createForgeFx, weaponSilhouette } from './forgeFx.js';
import { createBoltLines } from './bolts.js';
import { createRoutine } from './bladeMotion.js';
import { createForgeParticles } from './forgeParticles.js';
import { createForgeRun, ease, FORGE_TIMES, FORGE_TIMES_REDUCED } from './forgeRun.js';
import { smoothstep } from '../math.js';
import { DISSOLVE_CHUNK } from './dissolve.js';

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
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvLPos = (uToRoot * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vLPos;\nuniform float uDissolve;\nuniform vec3 uEdge;\nuniform vec3 uEdgeHot;\nuniform vec3 uRim;\nuniform float uGlow;\nuniform vec2 uSpan;\nuniform float uFrost;\nuniform vec3 uFrostColor;\nuniform float uFlip;\n${DISSOLVE_CHUNK}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb += uRim * (pow(rimK, 2.2) * 0.9 + 0.1);
        if (uGlow > 0.001) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, uGlow * 0.55) + uEdge * uGlow * (0.25 + pow(rimK, 2.0) * 0.6);
        }
        // Frost (the ice swap): a pale glaze creeping up from the point, a bright ragged front.
        if (uFrost > 0.001) {
          float hf = clamp((vLPos.y - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
          float fr = uFrost * 1.15 - hf + (wBayer4(gl_FragCoord.xy) - 0.5) * 0.1 + (wNoise(vLPos * 14.0) - 0.5) * 0.14;
          if (fr > 0.0) gl_FragColor.rgb = fr < 0.06 ? uFrostColor * 1.25 : mix(gl_FragColor.rgb, uFrostColor, 0.7) + uFrostColor * 0.15 * pow(rimK, 2.0);
        }
        if (uDissolve > 0.001) {
          float h = clamp((vLPos.y - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
          if (uFlip > 0.5) h = 1.0 - h; // (ice forms from the point up)
          float dv = wNoise(vLPos * 9.0) * 0.45 + wBayer4(gl_FragCoord.xy) * 0.25 + h * 0.3;
          float e = dv - (uDissolve * 1.15 - 0.05);
          if (e < 0.0) discard;
          if (e < 0.05) gl_FragColor.rgb = uEdgeHot;
          else if (e < 0.12) gl_FragColor.rgb = uEdge;
          else if (e > 0.19 && e < 0.215) gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, 0.6);
        }`,
      );
  };
  return mat;
}

/** Mesh → weapon-root transforms, in the root's own space (the root has no parent yet). */
function rootTransforms(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const out = new Map();
  root.traverse((o) => {
    if (o.isMesh) out.set(o, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
  });
  return out;
}

/** Area-weighted random points on a weapon's surface, plus its vertical extent, in its own space. */
function sampleSurface(toRoot, n) {
  const tris = [];
  let total = 0;
  let yMin = Infinity,
    yMax = -Infinity;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (const [o, m] of toRoot) {
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i,
        ib = idx ? idx.getX(i + 1) : i + 1,
        ic = idx ? idx.getX(i + 2) : i + 2;
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
    let lo = 0,
      hi = tris.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tris[mid].cum < r) lo = mid + 1;
      else hi = mid;
    }
    const t = tris[lo];
    let u = Math.random(),
      v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
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
export function createWeapons(
  gltfRoot,
  {
    anchor,
    layerSolid,
    layerGhost,
    layerFx,
    particleMaterial,
    materials = null,
    field,
    castShadows,
    reducedMotion,
    particles = 640,
    hooks,
  },
) {
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
      uDissolve: { value: 0 },
      uEdge: { value: new THREE.Color() },
      uEdgeHot: { value: new THREE.Color() },
      uGlow: { value: 0 },
      uRim: { value: rimColor.clone() },
      uSpan: { value: surface.span },
      uFrost: { value: 0 },
      uFrostColor: { value: new THREE.Color() },
      uFlip: { value: 0 },
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
    obj.userData.subject = subjectOf(obj);
    holder.add(obj);
  }

  // --- forge particles (forgeParticles.js): the soul of the old weapon becoming the new one
  const forge = createForgeParticles({ count: N, material: particleMaterial, layer: layerFx, field, anchor });

  // --- forge lines: the double helix, then the silhouette burst ---------------------
  const fx = N ? createForgeFx(particleMaterial, field.noise) : null;
  if (fx) fx.lines.layers.set(layerFx);
  // Lightning's arcs along the forge edge and its strike into the formed blade.
  const arcs = N ? createBoltLines(particleMaterial, 220, 96) : null;
  if (arcs) for (const o of arcs.objects) o.layers.set(layerFx);
  // Smear frames: a fast swing leaves outlines of the blade at the poses it just passed
  // through (the last SMEAR frames), fading with age — the pixel-art way to sell speed.
  const SMEAR = 3;
  const smearMats = Array.from({ length: SMEAR }, () => new THREE.Matrix4());
  let smearCount = 0;
  let smearSpeed = 0;
  const smearLead = new THREE.Color();
  const smearTrail = new THREE.Color();

  function setLayer(obj, layer) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.layers.set(layer);
        o.castShadow = castShadows && layer === layerSolid;
      }
    });
  }
  /** A weapon as the forge sees it (forgeRun.js ForgeSubject). */
  function subjectOf(obj) {
    return {
      get matrixWorld() {
        return obj.matrixWorld;
      },
      samples: obj.userData.samples,
      heights: obj.userData.heights,
      span: obj.userData.uniforms.uSpan.value,
      silhouette: () => (obj.userData.silhouette ??= weaponSilhouette(obj.userData.toRoot)),
      uniforms: obj.userData.uniforms,
      show(on) {
        obj.visible = on;
      },
      ghost(on) {
        setLayer(obj, on ? layerGhost : layerSolid);
      },
    };
  }

  let current = null;
  let incoming = null;
  // idle | forge (forgeRun.js: dissolve, swirl, gather, form, hold) | stab | settle | swing
  let phase = 'idle';
  let t = 0;
  let queued = null;
  let resolveSwap = null;
  let swapPayload = null;

  const D = reducedMotion
    ? { ...FORGE_TIMES_REDUCED, stab: 0.01, settle: 0.6 }
    : { ...FORGE_TIMES, stab: 0.13, settle: 1.1 };
  const HOVER = reducedMotion ? 0 : 0.5; // the forge height: the old weapon rises to it, the new one forms there

  /** A spot on the logs and ash around the fire for an arc to land on (world). */
  const anchorWorld = new THREE.Vector3();
  function groundPoint(rng, out) {
    holder.getWorldPosition(anchorWorld);
    const a = rng() * Math.PI * 2;
    const r = 0.45 + rng() * 0.35;
    return out.set(
      anchorWorld.x + Math.cos(a) * r,
      anchorWorld.y + 0.12 + rng() * 0.14,
      anchorWorld.z + Math.sin(a) * r,
    );
  }

  // --- the forge (forgeRun.js): the old weapon rises to the forge height as it dissolves; the
  // new one forms there and hangs for the hold (a held one waits for the drop: stepHold).
  const run = createForgeRun({
    particles: forge,
    fx,
    arcs,
    materials,
    particleMaterial,
    times: D,
    reducedMotion,
    clock: () => totalT,
    groundPoint,
    hooks: {
      updateMatrices: () => holder.updateMatrixWorld(true),
      onForgeStrike: (w) => hooks.onForgeStrike?.(w),
      onFormed: () => hooks.onFormed?.(swapPayload),
      onDissolve: (k) => {
        current.position.y = ease.inOut(k) * HOVER;
      },
      onFormBegin: () => {
        for (const o of Object.values(items)) if (o !== incoming) o.visible = false;
        incoming.position.set(0, HOVER, 0);
      },
      onHold: stepHold,
      // (A held weapon's helix comes back and pulses with the beat and the build-up.)
      holdSpin: () => (holding ? 4 + 9 * charge + 20 * auraKick : 10),
      holdAlpha: (th) =>
        Math.max(
          1 - Math.min(1, th / D.hold),
          holding ? (0.3 + 0.4 * charge + 0.5 * auraKick) * smoothstep(D.hold, D.hold + 0.8, th) : 0,
        ),
    },
  });

  /** Spin the blade about its own axis to a random angle (either face shown, never edge-on). */
  function spin(obj) {
    obj.rotation.set(0, (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() * 2 - 1) * 0.85, 0);
  }

  function show(key) {
    for (const [k, o] of Object.entries(items)) o.visible = k === key;
    current = items[key];
    current.position.set(0, 0, 0);
    spin(current);
    const u = current.userData.uniforms;
    u.uDissolve.value = 0;
    u.uGlow.value = 0;
    u.uFrost.value = 0;
    u.uFlip.value = 0;
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
    run.cancel();
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
      if (rush) {
        hurry(2.2);
        swapPace = Math.max(swapPace, 1.6);
      }
      queued = { key, fromRamp, toRamp, payload, opts: { pace: swapPace, hold } };
      return new Promise((r) => {
        queued.resolve = r;
      });
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
    incoming = items[key];
    run.begin({
      from: current?.userData.subject ?? null,
      to: incoming.userData.subject,
      fromRamp,
      toRamp,
      element: payload?.element ?? 'fire',
    });
    incoming.userData.uniforms.uRim.value.set(toRamp[2]);
    if (fx) incoming.userData.subject.silhouette();
    // Place the incoming weapon now (still hidden) so its surface can be targeted. (Ice
    // grows the new blade from the point up and freezes the old one first; the others form
    // it from the pommel down: forgeRun.js.)
    spin(incoming);
    incoming.position.set(0, HOVER, 0);
    phase = 'forge';
    run.start({ onStart: () => hooks.onSwapStart?.(payload) });
    return new Promise((r) => {
      resolveSwap = r;
    });
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

  let auraKick = 0; // a beat's push on a held weapon's aura (and its glow and lines)
  let auraElement = 'fire'; // the element the held blade will strike with: the aura takes after it

  /** The weapon's own lines, drawn with the forge's: a swinging blade's smear. */
  function drawSmear() {
    if (phase === 'swing' && current?.userData.silhouette && smearSpeed > 3) {
      const k = Math.min(1, (smearSpeed - 3) / 6);
      smearLead.copy(current.userData.uniforms.uRim.value);
      smearTrail.copy(smearLead).multiplyScalar(0.5);
      for (let j = 0; j < smearCount; j++) {
        fx.outline({
          sil: current.userData.silhouette,
          matrix: smearMats[j],
          dilate: 0,
          scale: 1,
          wobble: 0.004,
          alpha: k * (1 - (j + 1) / (smearCount + 1)) * 0.8,
          lead: smearLead,
          trail: smearTrail,
          hot: smearLead,
          t: totalT,
          seed: 7 + j,
        });
      }
    }
  }

  /**
   * The hold (the forge's last phase; `th` s into it): the new weapon hangs there, formed. A
   * held one bobs a little and glows with the build-up until release(); then it strikes.
   */
  function stepHold(th, dt) {
    const k = Math.min(1, th / D.hold);
    const bob = holding && !reducedMotion ? Math.sin((th - D.hold) * 2.4) * 0.012 * k : 0;
    if (!reducedMotion) incoming.position.y = HOVER + ease.outCubic(k) * 0.06 + bob;
    incoming.userData.uniforms.uGlow.value =
      1 + 0.6 * (1 - k) ** 2 + (holding ? (0.5 * charge + 0.6 * auraKick) * k : 0); // the flash as it forms, settling to the glow
    if (holding && th >= D.hold * 0.5) {
      if (!forge.aura) forge.startAura(totalT);
      holder.updateMatrixWorld(true);
      auraKick *= Math.exp(-dt / 0.16);
      forge.stepAura(dt, {
        blade: incoming,
        time: totalT,
        charge,
        kick: auraKick,
        element: auraElement,
        colors: run.colorsTo,
      });
    }
    // Alive (the visualizer): it sways and turns as if looking about, and trembles harder
    // as the build rises, straining to strike.
    if (holding && alive && !reducedMotion) {
      const on = smoothstep(D.hold, D.hold + 1.5, th);
      const tremble = (0.003 + 0.03 * charge * charge) * on;
      incoming.rotation.x = Math.sin(totalT * 0.9) * 0.05 * on + Math.sin(totalT * 71) * tremble;
      incoming.rotation.z = Math.sin(totalT * 0.7 + 1.3) * 0.06 * on + Math.sin(totalT * 83 + 2) * tremble;
    }
    if (th >= D.hold && !holding) {
      if (forge.aura) {
        holder.updateMatrixWorld(true);
        forge.fling(incoming.matrixWorld);
      }
      run.finish();
      next('stab', Math.min(th - D.hold, 0.05)); // (a released hold starts the strike fresh)
    }
  }

  let totalT = 0;
  let pace = 1;
  let holding = false;
  let charge = 0; // 0..1: how hard a held weapon glows (the visualizer feeds it the build-up)
  let glowKick = 0; // a beat's glow on the planted weapon
  let quiver = 0; // a hard beat's shudder through the planted weapon
  let alive = true; // (the visualizer) the blade moves as if alive: it shudders, sways, trembles
  let hovered = false; // the cursor is on the planted weapon (the site): its rim glows
  let hoverGlow = 0;
  function update(dt) {
    totalT += dt;
    // Hovered, the planted weapon's rim brightens: a click will wake it.
    hoverGlow += ((hovered && phase === 'idle' ? 1 : 0) - hoverGlow) * Math.min(1, dt * 10);
    if (current && phase === 'idle' && glowKick <= 0.005) current.userData.uniforms.uGlow.value = hoverGlow * 0.55;
    forge.stepFling(dt);
    // A beat's glow on the planted weapon (the visualizer).
    if (glowKick > 0.005) {
      glowKick *= Math.exp(-dt / 0.2);
      if (current && phase === 'idle') current.userData.uniforms.uGlow.value = glowKick > 0.005 ? glowKick * 0.8 : 0;
      else if (current && phase === 'settle')
        current.userData.uniforms.uGlow.value = Math.max(current.userData.uniforms.uGlow.value, glowKick * 0.8);
    }
    // ...and a hard one shudders through it.
    if (quiver > 0.002 && current && phase === 'idle') {
      quiver *= Math.exp(-dt / 0.16);
      current.rotation.z = quiver > 0.002 ? Math.sin(totalT * 55) * 0.03 * quiver : 0;
    }
    if (phase !== 'idle' && phase !== 'settle') dt *= pace;
    run.stepLines(dt, drawSmear);
    run.stepElement(dt);
    if (phase === 'idle') return;
    if (phase === 'forge') {
      run.step(dt);
      return;
    }
    t += dt;
    if (phase === 'swing') {
      stepSwing(dt);
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
        run.forget();
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
      home: {
        pos: current.getWorldPosition(new THREE.Vector3()),
        quat: current.getWorldQuaternion(new THREE.Quaternion()),
      },
      center,
      basis: plan.basis,
      hits: plan.hits,
      plunge: plan.plunge,
      moves: plan.moves,
      alive: plan.alive ?? alive,
      onMove: plan.onMove,
      rng: plan.rng,
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
    /** More fx-layer objects for the scene (lightning's forge arcs and its strike). */
    extras: arcs?.objects ?? [],
    set,
    swap,
    update,
    setRim,
    cancel,
    swing,
    hurry,
    /** The cursor is on the planted weapon: its rim glows (the site's hover hint). */
    set hovered(v) {
      hovered = !!v;
    },
    /** The planted weapon (for picking it with the cursor), or null mid-swap. */
    get planted() {
      return phase === 'idle' ? current : null;
    },
    get swinging() {
      return phase === 'swing';
    },
    /** (The visualizer) the blade moves as if alive: flourishes, a shudder on hard beats, a held one's sway. */
    set alive(v) {
      alive = !!v;
    },
    /**
     * Where the blade is (world, as of the last frame): its middle, point and grip, the
     * flat's normal and its rotation, and whether it's out of the fire (swinging or held).
     * For cameras that follow it.
     */
    blade(out) {
      const obj =
        incoming && ((phase === 'forge' && (run.phase === 'form' || run.phase === 'hold')) || phase === 'stab')
          ? incoming
          : current;
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
    set auraElement(key) {
      auraElement = key;
    },
    /** Let a held weapon strike, at `strikePace` × the usual speed. False if nothing is held. */
    release(strikePace = 1) {
      if (!holding) return false;
      holding = false;
      pace = strikePace;
      return true;
    },
    get currentKey() {
      return current?.userData.key ?? null;
    },
    /** A weapon is moving this frame. */
    get moving() {
      return phase !== 'idle' || quiver > 0.002;
    },
    /**
     * ...enough for its shadow to need redrawing every frame: moving, but not just a planted
     * one's shudder on a hard beat (±0.03 rad at most, fading in a second: sceneUpdate.js
     * shadowNeedsUpdate redraws that at the art's 12 fps).
     */
    get movingForShadow() {
      return phase !== 'idle';
    },
    keys: Object.keys(items),
    get busy() {
      return phase !== 'idle';
    },
    get holding() {
      return holding;
    },
    /** A beat (the visualizer): a held weapon's aura kicks out; a planted one glows. 0..1. */
    beat(strength = 1) {
      if (reducedMotion) return;
      auraKick = Math.max(auraKick, strength);
      glowKick = Math.max(glowKick, strength);
      if (alive) quiver = Math.max(quiver, (strength - 0.5) * 2);
    },
    /** An echo of the planted weapon's silhouette bursts out of it, in `ramp`'s colors, after `element`'s ways. */
    echo(ramp, element = 'fire') {
      if (!fx || !current || (phase !== 'idle' && phase !== 'settle')) return;
      run.echo(current.userData.subject, ramp, element);
    },
    set charge(v) {
      charge = Math.min(1, Math.max(0, v));
    },
    /** Seconds from swap() to impact at pace 1 (not counting a hold). */
    impactTime: D.dissolve + D.swirl + D.gather + D.form + D.hold + D.stab,
  };
}
