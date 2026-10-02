// The knight's summon sign (the site): while he's away, his mark lies on the ground in front
// of his seat, glowing like a Dark Souls summon sign, and a click on it brings him.
//
//   the glyph  the NH monogram (ui/logo.js LOGO_STROKES, the header's own strokes) as flat
//              glowing bars, SIGN_HEIGHT tall, its strokes SIGN_STROKE wide and wider the more
//              they lie across the view (the cameras see the ground at a low angle), turned to
//              read from the home view. Lit, it lies on the solid layer (in the depth the
//              outlines are found from, so the edges of the stones it lies across don't draw
//              through its letters; too flat to be outlined itself, and it casts no shadow);
//              in the forge it moves to the ghost layer like a dissolving weapon. A darker
//              halo a little wider rims each bar, so it reads as light on dark ground. Every tone is one of the flame's own (the bars its pale `hi`, the
//              halo its deep `lo`), divided by the exposure like the armor, so each lands on
//              the palette exactly and the sign re-colors with the flame.
//   breath     every few seconds a band of the flame's `core` rolls up the letters, stepped
//              at the fire's 12 fps, and a few faint motes drift up off the strokes: alive,
//              but calm enough not to pull the eye from the page.
//   hover      the cursor on it (scenePick.js hoverAt → 'sign'): the bars take the `core`, the
//              halo the `mid`, and every mote rises, faster: a click will summon him. An
//              effect, never a label.
//   the forge  it's a forge subject (forgeRun.js, knightArrival.js): arriving, the sign burns
//              away and its soul becomes the knight; leaving, he burns away into it and it
//              relights. Its dissolve is the weapons' (dissolve.js), its frost the ice swap's.
//              As a subject it stands up as a column over the sign (the helix winds round
//              it and collapses onto the strokes); its silhouette lies flat, so its echo grows
//              out along the ground.
// Reduced motion: no breath and no motes (the hover still lights it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { logoBars } from '../ui/logo.js';
import { DISSOLVE_CHUNK } from './dissolve.js';
import { createPoints, markDirty } from './points.js';
import { weaponSilhouette } from './forgeFx.js';

/** The monogram's height along the ground (m) and its strokes' width (m: at least 3 cm, a few texels at the home view). */
export const SIGN_HEIGHT = 0.58;
export const SIGN_STROKE = 0.032;
// The cameras see the ground at a low angle, so a stroke lying across the view (the crossbar)
// looks a third as wide as it is: strokes are drawn wider the more they lie across, so every
// stroke reads about as heavy as the upright stems (the gaps between the stems stay open).
const BOLD = 1.1;
const HALO = 0.014; // how much wider the halo is than a bar (m)
const THICK = 0.012; // the bars' thickness (m); the halo's is half
const COLUMN = 0.95; // the forge's column over the sign (m)
const MOTES = 18;
const BREATH = 5.5; // s between breaths
const hash = (n) => {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
};
/** The glyph's bars (ui/logo.js logoBars), each as wide as it needs to read from the cameras. */
const BARS = logoBars(SIGN_HEIGHT, SIGN_STROKE).map((b) => ({
  ...b,
  width: b.width * (1 + BOLD * Math.abs(Math.cos(b.angle))),
}));

/**
 * The glyph's bars (and their halo) in the sign's own space: x across the letters, y up out
 * of the ground, z toward the reader (the letters' tops point to −z). `aHalo` marks the halo.
 */
function glyphGeometry() {
  const parts = [];
  for (const b of BARS) {
    for (const halo of [0, 1]) {
      const w = b.width + (halo ? HALO : 0),
        t = halo ? THICK * 0.5 : THICK;
      const g = new THREE.BoxGeometry(b.len + (halo ? HALO : 0), t, w).toNonIndexed();
      g.rotateY(b.angle);
      g.translate(b.u, t / 2, -b.v);
      g.setAttribute(
        'aHalo',
        new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(halo), 1),
      );
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  geo.computeBoundingSphere();
  return geo;
}

function signMaterial(uniforms) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  mat.polygonOffset = true; // (a hair in front of the ground it lies on)
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aHalo;\nvarying float vHalo;\nvarying vec3 vSign;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSign = position;\nvHalo = aHalo;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vHalo; varying vec3 vSign;
        uniform vec3 uRest; uniform vec3 uHot; uniform vec3 uLo; uniform vec3 uMid;
        uniform float uBreath; uniform float uLift; uniform float uGlow; uniform float uExposure;
        uniform float uDissolve; uniform vec3 uEdge; uniform vec3 uEdgeHot; uniform float uFlip;
        uniform float uFrost; uniform vec3 uFrostColor; uniform vec2 uSpanV;
        ${DISSOLVE_CHUNK}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          float h = clamp((-vSign.z - uSpanV.x) / (uSpanV.y - uSpanV.x), 0.0, 1.0); // (0 the letters' feet, 1 their tops)
          bool halo = vHalo > 0.5;
          vec3 col = halo ? (uLift > 0.5 ? uMid : uLo) : (uLift > 0.5 ? uHot : uRest);
          // The breath: a band of the core rolling up the letters.
          if (!halo && uBreath > -0.5 && abs(h - uBreath) < 0.1) col = uHot;
          // Forged: its glow (a flash of the edge color, the core at its height).
          if (uGlow > 0.001) col = halo ? mix(col, uEdge, min(1.0, uGlow)) : (uGlow > 0.5 ? uHot : mix(col, uEdge, uGlow * 1.4));
          // Frost (the ice forge): a pale glaze creeping up the letters, a bright ragged front.
          if (uFrost > 0.001) {
            float fr = uFrost * 1.15 - h + (wBayer4(gl_FragCoord.xy) - 0.5) * 0.1 + (wNoise(vSign * 14.0) - 0.5) * 0.14;
            if (fr > 0.0) col = fr < 0.06 ? uFrostColor : mix(col, uFrostColor, 0.7);
          }
          if (uDissolve > 0.001) {
            float hd = uFlip > 0.5 ? 1.0 - h : h;
            float dv = wNoise(vSign * 9.0) * 0.45 + wBayer4(gl_FragCoord.xy) * 0.25 + hd * 0.3;
            float e = dv - (uDissolve * 1.15 - 0.05);
            if (e < 0.0) discard;
            if (e < 0.05) col = uEdgeHot;
            else if (e < 0.12) col = uEdge;
          }
          gl_FragColor = vec4(col / max(uExposure, 0.05), 1.0);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'summon-sign-1';
  return mat;
}

/**
 * @param {object} o
 * @param {number} o.layer          the ghost layer (color only: no outline, no shadow): in the forge
 * @param {number} [o.layerSolid]   the solid layer: lit (default: the ghost layer)
 * @param {number} o.layerFx        the fx layer (its motes)
 * @param {THREE.Material} o.moteMaterial  the particles' material (additive, depth-tested)
 * @param {{ value: number }} o.exposure   the pixel pass's exposure (shared)
 * @param {boolean} [o.reducedMotion]      no breath, no motes
 */
export function createSummonSign({
  layer,
  layerSolid = layer,
  layerFx,
  moteMaterial,
  exposure,
  reducedMotion = false,
}) {
  const group = new THREE.Group();
  group.name = 'Summon sign';
  const uniforms = {
    uRest: { value: new THREE.Color() },
    uHot: { value: new THREE.Color() },
    uLo: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uBreath: { value: -1 },
    uLift: { value: 0 },
    uGlow: { value: 0 },
    uExposure: exposure,
    uDissolve: { value: 0 },
    uEdge: { value: new THREE.Color() },
    uEdgeHot: { value: new THREE.Color() },
    uFlip: { value: 0 },
    uFrost: { value: 0 },
    uFrostColor: { value: new THREE.Color() },
    uSpanV: { value: new THREE.Vector2(-SIGN_HEIGHT / 2, SIGN_HEIGHT / 2) },
  };
  const geometry = glyphGeometry();
  const material = signMaterial(uniforms);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Summon sign glyph';
  mesh.layers.set(layer);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  group.visible = false;

  // --- motes: a few faint sparks drifting up off the strokes (deterministic, no Math.random)
  const bars = BARS;
  const barArea = bars.map((b) => b.len * b.width);
  const areaSum = barArea.reduce((a, b) => a + b, 0);
  /** A point on the strokes' tops (sign space) for u1, u2, u3 in 0..1, and its height up the letters. */
  function onStrokes(u1, u2, u3, out) {
    let r = u1 * areaSum,
      i = 0;
    while (i < bars.length - 1 && r > barArea[i]) {
      r -= barArea[i];
      i++;
    }
    const b = bars[i];
    const along = (u2 - 0.5) * b.len,
      across = (u3 - 0.5) * b.width;
    const c = Math.cos(b.angle),
      s = Math.sin(b.angle);
    const u = b.u + along * c - across * s,
      v = b.v + along * s + across * c;
    out.set(u, THICK, -v);
    return (v + SIGN_HEIGHT / 2) / SIGN_HEIGHT;
  }
  const motes = createPoints(MOTES, moteMaterial);
  motes.name = 'Summon sign';
  motes.layers.set(layerFx);
  const MP = motes.geometry.attributes.position.array;
  const MC = motes.geometry.attributes.color.array;
  const MS = motes.geometry.attributes.size.array;
  const MA = motes.geometry.attributes.alpha.array;
  const ramp = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const v3 = new THREE.Vector3();

  let mode = 'off'; // 'lit' (he's away: it glows), 'forge' (the forge drives it), 'off'
  let hovered = false;
  let lift = 0; // the hover, eased (the motes)
  let clock = 0;
  let placed = null; // { x, y, z, yaw }

  function stepMotes(dt) {
    const on = mode === 'lit' && !reducedMotion;
    for (let i = 0; i < MOTES; i++) {
      // At rest only every third one drifts up; hovered, all of them, faster.
      const active = on && (i % 3 === 0 || lift > 0.05);
      if (!active) {
        MS[i] = 0;
        continue;
      }
      const period = 2.4 + hash(i) * 1.8;
      const speed = 1 + 1.2 * lift;
      const k0 = (clock * speed) / period + hash(i + 17);
      const cycle = Math.floor(k0);
      const k = k0 - cycle;
      onStrokes(hash(i * 7.1 + cycle * 3.3), hash(i * 3.7 + cycle * 5.9), hash(i * 5.3 + cycle * 1.7), v3);
      const rise = (0.22 + 0.35 * hash(i + cycle * 11.1)) * (1 - (1 - k) ** 2) * (1 + 0.6 * lift);
      v3.y += rise;
      v3.x += Math.sin(clock * 1.3 + i) * 0.03 * k;
      v3.applyMatrix4(group.matrixWorld);
      MP[i * 3] = v3.x;
      MP[i * 3 + 1] = v3.y;
      MP[i * 3 + 2] = v3.z;
      const hot = hash(i * 1.3 + cycle) > 0.6 || lift > 0.5;
      const c = ramp[hot ? 3 : 2];
      MC[i * 3] = c.r;
      MC[i * 3 + 1] = c.g;
      MC[i * 3 + 2] = c.b;
      MS[i] = (0.8 + 0.5 * hash(i * 9.9)) * (1 + 0.3 * lift);
      MA[i] = Math.sin(Math.PI * k) * (0.35 + 0.5 * lift);
    }
    markDirty(motes);
  }

  // --- the forge subject (knightArrival.js): a column over the sign, its samples on the strokes
  const silGeo = (() => {
    // (The glyph in its own plane: x across, y up the letters, z out of the ground.)
    const g = geometry.clone();
    g.applyMatrix4(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, -1, 0),
      ),
    );
    return g;
  })();
  const toSil = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, 0),
  );
  let silhouette = null;
  const silMatrix = new THREE.Matrix4();
  const radius = new Float32Array(64).fill(0.2);
  const profile = { y0: 0, y1: COLUMN, rx: radius, rz: radius };
  /**
   * The sign as the forge sees it (forgeRun.js ForgeSubject), with `n` samples on its strokes.
   * @param {number} n
   */
  function subject(n) {
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const samples = new Float32Array(n * 3);
    const heights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      heights[i] = onStrokes(rng(), rng(), rng(), v3);
      samples[i * 3] = v3.x;
      samples[i * 3 + 1] = v3.y;
      samples[i * 3 + 2] = v3.z;
    }
    return {
      get matrixWorld() {
        return group.matrixWorld;
      },
      get silMatrix() {
        return silMatrix.multiplyMatrices(group.matrixWorld, toSil);
      },
      samples,
      heights,
      span: new THREE.Vector2(0, COLUMN),
      silhouette: () => (silhouette ??= weaponSilhouette(new Map([[{ geometry: silGeo }, new THREE.Matrix4()]]), 0.01)),
      profile: () => profile,
      helixWide: (s) => 0.28 + 0.08 * Math.sin(Math.PI * s),
      cloud: 0.3,
      cocoon: { n: 7, size: 0.07, spread: 0.04, out: 0.16 },
      strikePoint: (s, out) => out.set(0, THICK, 0).applyMatrix4(group.matrixWorld),
      ground: (rng2, out) => {
        const a = rng2() * Math.PI * 2,
          r = 0.3 + rng2() * 0.25;
        return out.set(Math.cos(a) * r, 0.03, Math.sin(a) * r).applyMatrix4(group.matrixWorld);
      },
      uniforms,
      show(on) {
        mesh.visible = on;
      },
      ghost(on) {
        mesh.layers.set(on ? layer : layerSolid);
      },
    };
  }

  return {
    group,
    motes,
    /** Lay it at { x, y, z } (world: y the ground's height there), its letters' tops pointing `yaw` (the way from the home camera). */
    place({ x, y = 0, z, yaw }) {
      placed = { x, y, z, yaw };
      group.position.set(x, y, z);
      group.rotation.set(0, yaw + Math.PI, 0);
      group.updateMatrixWorld(true);
    },
    get placed() {
      return placed;
    },
    /** The flame's ramp, [lo, mid, hi, core] (sRGB hex): it glows in its tones. */
    setRamp(r) {
      r.forEach((h, i) => ramp[i].set(h));
      uniforms.uLo.value.copy(ramp[0]);
      uniforms.uMid.value.copy(ramp[1]);
      uniforms.uRest.value.copy(ramp[2]);
      uniforms.uHot.value.copy(ramp[3]);
    },
    /**
     * 'lit' (he's away: it glows, breathes and answers the cursor), 'forge' (the forge
     * drives its dissolve: shown, the breath stops) or 'off' (gone).
     */
    get mode() {
      return mode;
    },
    set mode(m) {
      mode = m;
      group.visible = m !== 'off';
      mesh.layers.set(m === 'lit' ? layerSolid : layer);
      if (m === 'lit') {
        mesh.visible = true;
        uniforms.uDissolve.value = 0;
        uniforms.uFrost.value = 0;
        uniforms.uFlip.value = 0;
      }
      if (m !== 'lit') {
        uniforms.uBreath.value = -1;
        uniforms.uLift.value = 0;
      }
      if (m === 'off' || reducedMotion) {
        MS.fill(0);
        markDirty(motes);
      }
    },
    /** The cursor is on it: it brightens and its motes rise. */
    set hovered(v) {
      hovered = !!v;
    },
    get hovered() {
      return hovered && mode === 'lit';
    },
    /** Each frame (`dt` s): the breath, the hover, the motes; the glow a formed sign settles from. */
    update(dt) {
      clock += dt;
      lift += ((hovered && mode === 'lit' ? 1 : 0) - lift) * Math.min(1, dt * 8);
      if (mode === 'lit') {
        uniforms.uLift.value = hovered ? 1 : 0;
        const st = Math.floor(clock * 12) / 12; // (stepped at the fire's 12 fps)
        const b = (st % BREATH) / 1.3;
        uniforms.uBreath.value = reducedMotion || b > 1.2 ? -1 : b * 1.2 - 0.1;
        if (uniforms.uGlow.value > 0.001) uniforms.uGlow.value *= Math.exp(-dt / 0.35);
        else uniforms.uGlow.value = 0;
      }
      if (!reducedMotion) stepMotes(dt);
    },
    /** Where a ray meets the sign (with a hand's margin round it): its distance, or -1. */
    hit(ray) {
      if (mode !== 'lit' || !group.visible) return -1;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -group.position.y - THICK);
      const at = ray.intersectPlane(plane, new THREE.Vector3());
      if (!at) return -1;
      const local = group.worldToLocal(at.clone());
      const w = SIGN_HEIGHT * 0.36 + 0.1,
        hgt = SIGN_HEIGHT / 2 + 0.1;
      return Math.abs(local.x) < w && Math.abs(local.z) < hgt ? at.distanceTo(ray.origin) : -1;
    },
    subject,
    /** Its world matrix is kept up to date by place(); the forge reads it. */
    get uniforms() {
      return uniforms;
    },
    geometries: [geometry, silGeo],
    materials: [material],
  };
}
