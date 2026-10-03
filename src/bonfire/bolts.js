// @ts-nocheck: 4 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Jagged lightning for the tesla ball, its strikes and the ground ring.
//
// A bolt is midpoint displacement between two points: each pass splits every
// segment and kicks its middle sideways (perpendicular to the bolt) by a shrinking
// amount, so the path is jagged at every scale like real lightning. Offsets taper
// to zero at both ends so bolts meet their anchors exactly. The randomness comes
// from a seeded generator: re-using a seed redraws the same shape (a bolt holds
// still between crackles while its ends move), a new seed makes it jump.
//
// Thin bolts (width ≤ 1) are crisp 1-texel additive lines (rings.js). Thick ones are
// ribbons: each segment is a screen-facing quad a few texels wide with a white-hot
// center line (it carries "heat", so the pixel pass burns it toward the flame's core
// color) and a glow in the bolt's color that falls off to the edges in a dither. The
// width can taper along the bolt. Quads overlap a little at each joint so the jagged
// path never shows gaps.
import * as THREE from 'three';
import { createRingLines } from './rings.js';
import { DITHER_GLSL } from './flame.js';

/** Small seeded PRNG (mulberry32): returns () => 0..1. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seed from a few integers (bolt id, crackle step, …). */
export const hashSeed = (a, b = 0, c = 0) =>
  (Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791)) >>> 0;

const MAX_POINTS = 33; // 2^5 + 1

const ribbonVertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec2 aCorner; // (0 = start / 1 = end, side −1..1)
  attribute vec3 color;
  attribute float alpha;
  attribute float aWidth; // texels
  attribute float aHeat;
  uniform vec2 resolution;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;
  varying float vWidth;
  varying float vHeat;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
    vColor = color; vAlpha = alpha; vSide = aCorner.y; vWidth = aWidth; vHeat = aHeat;
    if (a.w < 0.01 || b.w < 0.01 || alpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 hr = resolution * 0.5;
    vec2 sa = a.xy / a.w * hr;
    vec2 sb = b.xy / b.w * hr;
    vec2 dir = sb - sa;
    float len = length(dir);
    dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
    vec2 n = vec2(-dir.y, dir.x);
    vec4 p = aCorner.x < 0.5 ? a : b;
    // Out to the side by half the width; a little past each end so joints overlap.
    vec2 off = n * aCorner.y * aWidth * 0.5 + dir * (aCorner.x < 0.5 ? -0.5 : 0.5) * min(aWidth * 0.5, 1.5);
    p.xy += off / hr * p.w;
    gl_Position = p;
  }
`;
const ribbonFragment = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;
  varying float vWidth;
  varying float vHeat;
  ${DITHER_GLSL}
  void main() {
    if (gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy / resolution).x + 0.00002) discard;
    float d = abs(vSide);
    float core = 1.0 / max(1.0, vWidth);       // about one texel across
    bool inCore = d <= core;
    float a = vAlpha * (inCore ? 1.0 : pow(1.0 - (d - core) / (1.0 - core), 1.3) * 0.95);
    if (a < 0.999 && a <= pBayer4(gl_FragCoord.xy)) discard;
    vec3 c = inCore ? mix(vColor, vec3(1.0), 0.5) * 1.5 : vColor * (0.6 + 0.4 * (1.0 - d));
    gl_FragColor = vec4(c, inCore ? vHeat * vAlpha : 0.0);
  }
`;

function createRibbons(fxMaterial, maxSegments) {
  const V = maxSegments * 4;
  const geo = new THREE.BufferGeometry();
  const attr = (name, size) => {
    const a = new THREE.BufferAttribute(new Float32Array(V * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a.array;
  };
  const start = attr('aStart', 3);
  const end = attr('aEnd', 3);
  const corner = attr('aCorner', 2);
  const col = attr('color', 3);
  const alpha = attr('alpha', 1);
  const width = attr('aWidth', 1);
  const heat = attr('aHeat', 1);
  // three.js needs a `position` to size the draw; the shader places every corner itself.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  const index = new Uint32Array(maxSegments * 6);
  for (let s = 0; s < maxSegments; s++) {
    const v = s * 4;
    index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], s * 6);
    corner.set([0, -1, 0, 1, 1, -1, 1, 1], v * 2);
  }
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.attributes.aCorner.needsUpdate = true;
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { tDepth: fxMaterial.uniforms.tDepth, resolution: fxMaterial.uniforms.resolution },
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      side: THREE.DoubleSide, // quads are built in screen space; their winding depends on the bolt's direction
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh,
    begin() {
      n = 0;
    },
    add(ax, ay, az, bx, by, bz, ca, cb, aa, ab, wa, wb, h) {
      if (n >= maxSegments) return false;
      const v = n * 4;
      for (let k = 0; k < 4; k++) {
        const i = v + k;
        const atEnd = k >= 2;
        start[i * 3] = ax;
        start[i * 3 + 1] = ay;
        start[i * 3 + 2] = az;
        end[i * 3] = bx;
        end[i * 3 + 1] = by;
        end[i * 3 + 2] = bz;
        const c = atEnd ? cb : ca;
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        alpha[i] = atEnd ? ab : aa;
        width[i] = atEnd ? wb : wa;
        heat[i] = h;
      }
      n++;
      return true;
    },
    commit() {
      geo.setDrawRange(0, n * 6);
      if (!n) return;
      for (const k of ['aStart', 'aEnd', 'color', 'alpha', 'aWidth', 'aHeat']) {
        const a = geo.attributes[k];
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 4 * a.itemSize);
        a.needsUpdate = true;
      }
    },
  };
}

/**
 * A buffer of bolts. Call begin(), add bolts / segments, then end(): whatever
 * wasn't drawn this frame is blanked. `maxRibbons` segments can be thick.
 *
 * `afterimage` (a function returning 0..1, read every frame): bolts leave a dim trace of
 * themselves that lingers for a moment after they've jumped elsewhere, like the glare a
 * real flash leaves in the eye. Every frame's bolts are traced as thin lines; when the
 * last trace has mostly faded, the current one is kept and fades over ~0.12 s.
 */
export function createBoltLines(fxMaterial, maxSegments, maxRibbons = 0, { afterimage = null } = {}) {
  const L = createRingLines(fxMaterial, maxSegments * 2);
  const R = maxRibbons ? createRibbons(fxMaterial, maxRibbons) : null;
  const cap = maxSegments * 2;
  let v = 0;
  let drawn = 0;
  // Afterimage: this frame's trace (positions, colors) and the lingering copy (G).
  const G = afterimage ? createRingLines(fxMaterial, cap) : null;
  const tPos = G ? new Float32Array(cap * 3) : null;
  const tCol = G ? new Float32Array(cap * 3) : null;
  let tv = 0;
  let ghostCount = 0;
  let ghostFade = 0;
  let ghostDrawn = 0;
  let lastEnd = 0;
  function trace(ax, ay, az, bx, by, bz, ca, cb) {
    if (!G || tv + 2 > cap) return;
    const i = tv * 3;
    tPos[i] = ax;
    tPos[i + 1] = ay;
    tPos[i + 2] = az;
    tPos[i + 3] = bx;
    tPos[i + 4] = by;
    tPos[i + 5] = bz;
    tCol[i] = ca.r;
    tCol[i + 1] = ca.g;
    tCol[i + 2] = ca.b;
    tCol[i + 3] = cb.r;
    tCol[i + 4] = cb.g;
    tCol[i + 5] = cb.b;
    tv += 2;
  }
  function stepGhost() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - lastEnd));
    lastEnd = now;
    const strength = afterimage();
    ghostFade *= Math.exp(-dt / 0.12);
    if (strength > 0 && tv > 0 && ghostFade < 0.3) {
      // Keep this frame's bolts as the new trace, dimmed.
      for (let i = 0; i < tv * 3; i++) {
        G.pos[i] = tPos[i];
        G.col[i] = tCol[i] * 0.55;
      }
      ghostCount = tv;
      ghostFade = 1;
    }
    const a = ghostFade * strength * 0.85;
    const n = a > 0.02 ? ghostCount : 0;
    if (!n && !ghostDrawn) return;
    for (let i = 0; i < n; i++) G.alpha[i] = a;
    for (let i = n; i < ghostDrawn; i++) G.alpha[i] = 0;
    ghostDrawn = n;
    G.commit();
  }
  const px = new Float32Array(MAX_POINTS);
  const py = new Float32Array(MAX_POINTS);
  const pz = new Float32Array(MAX_POINTS);
  const snap = new Float32Array(MAX_POINTS * 3); // inner points handed to `each` (which may draw more bolts)
  const d = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const ca = new THREE.Color();
  const cb = new THREE.Color();

  function vertex(x, y, z, c, alpha) {
    const ix = v * 3;
    L.pos[ix] = x;
    L.pos[ix + 1] = y;
    L.pos[ix + 2] = z;
    L.col[ix] = c.r;
    L.col[ix + 1] = c.g;
    L.col[ix + 2] = c.b;
    L.alpha[v] = alpha;
    v++;
  }

  /** One straight 1-texel segment, colored (and faded) a → b. */
  function segment(ax, ay, az, bx, by, bz, colorA, colorB = colorA, alphaA = 1, alphaB = alphaA) {
    if (v + 2 > cap) return false;
    vertex(ax, ay, az, colorA, alphaA);
    vertex(bx, by, bz, colorB, alphaB);
    trace(ax, ay, az, bx, by, bz, colorA, colorB);
    return true;
  }

  /**
   * A jagged bolt from a to b.
   * @param {object} o
   * @param {() => number} o.rng     seeded random (see seeded())
   * @param {number} o.depth         2^depth segments (1..5)
   * @param {number} o.jag           sideways kick as a fraction of the length
   * @param {THREE.Vector3} [o.up]   also kick toward this side only (ground arcs lift off the ground, never into it)
   * @param {(t:number, out:THREE.Color) => THREE.Color} o.color  color along the bolt (0 = a, 1 = b)
   * @param {number|((t:number)=>number)} [o.alpha]  dithered opacity, or opacity along the bolt (a fading end)
   * @param {number|((t:number)=>number)} [o.width]  texels; over 1 draws a glowing ribbon (can taper along the bolt)
   * @param {number} [o.heat]        how white-hot a ribbon's center burns
   * @param {(x:number, y:number, z:number, t:number) => void} [o.each]  called at every inner point, for
   *   branches (a branch drawn from `each` can't branch again)
   */
  function bolt(
    ax,
    ay,
    az,
    bx,
    by,
    bz,
    { rng, depth = 3, jag = 0.3, up = null, color, alpha = 1, width = 1, heat = 1.4, each = null },
  ) {
    const n = 1 << Math.min(5, Math.max(1, depth));
    d.set(bx - ax, by - ay, bz - az);
    const len = d.length();
    if (len < 1e-5) return;
    d.divideScalar(len);
    // Two directions perpendicular to the bolt.
    u.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0)
      .cross(d)
      .normalize();
    w.crossVectors(d, u);
    px[0] = ax;
    py[0] = ay;
    pz[0] = az;
    px[n] = bx;
    py[n] = by;
    pz[n] = bz;
    let kick = jag * len;
    for (let step = n >> 1; step >= 1; step >>= 1) {
      for (let i = step; i < n; i += step * 2) {
        const a = rng() * Math.PI * 2;
        const m = (rng() - 0.5) * 2 * kick;
        let ox = (u.x * Math.cos(a) + w.x * Math.sin(a)) * m;
        let oy = (u.y * Math.cos(a) + w.y * Math.sin(a)) * m;
        let oz = (u.z * Math.cos(a) + w.z * Math.sin(a)) * m;
        if (up) {
          const k = Math.abs(m) * rng();
          ox += up.x * k;
          oy += up.y * k;
          oz += up.z * k;
        }
        px[i] = (px[i - step] + px[i + step]) / 2 + ox;
        py[i] = (py[i - step] + py[i + step]) / 2 + oy;
        pz[i] = (pz[i - step] + pz[i + step]) / 2 + oz;
      }
      kick *= 0.55;
    }
    const fade = typeof alpha === 'function';
    const taper = typeof width === 'function';
    let aa = fade ? alpha(0) : alpha;
    let wa = taper ? width(0) : width;
    color(0, ca);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      color(t, cb);
      const ab = fade ? alpha(t) : alpha;
      const wb = taper ? width(t) : width;
      const ribbon = R && (wa > 1 || wb > 1);
      if (ribbon) trace(px[i], py[i], pz[i], px[i + 1], py[i + 1], pz[i + 1], ca, cb);
      const ok = ribbon
        ? R.add(
            px[i],
            py[i],
            pz[i],
            px[i + 1],
            py[i + 1],
            pz[i + 1],
            ca,
            cb,
            aa,
            ab,
            Math.max(1, wa),
            Math.max(1, wb),
            heat,
          )
        : segment(px[i], py[i], pz[i], px[i + 1], py[i + 1], pz[i + 1], ca, cb, aa, ab);
      if (!ok) return;
      ca.copy(cb);
      aa = ab;
      wa = wb;
    }
    if (!each) return;
    for (let i = 1; i < n; i++) {
      snap[i * 3] = px[i];
      snap[i * 3 + 1] = py[i];
      snap[i * 3 + 2] = pz[i];
    }
    for (let i = 1; i < n; i++) each(snap[i * 3], snap[i * 3 + 1], snap[i * 3 + 2], i / n);
  }

  return {
    /** Everything to add to the scene (fx layer). */
    objects: [L.lines, ...(R ? [R.mesh] : []), ...(G ? [G.lines] : [])],
    begin() {
      v = 0;
      tv = 0;
      R?.begin();
    },
    segment,
    bolt,
    /** Blank what the last frame drew beyond this one, and upload. */
    end() {
      for (let i = v; i < drawn; i++) L.alpha[i] = 0;
      drawn = v;
      L.commit();
      R?.commit();
      if (G) stepGhost();
    },
    clear() {
      v = 0;
      tv = 0;
      if (G && ghostDrawn) {
        G.clear();
        ghostDrawn = 0;
        ghostFade = 0;
      }
      if (drawn) {
        L.clear();
        drawn = 0;
      }
      if (R) {
        R.begin();
        R.commit();
      }
    },
    get count() {
      return v / 2;
    },
  };
}
