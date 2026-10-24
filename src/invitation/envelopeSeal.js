// The envelope's wax seal (envelopeScene.js): a lumpy round blob of red wax, as if pressed by
// hand, its outline wobbling with a few overtones, a raised and uneven rim round a softly domed
// face, and a few small beads of wax squeezed out at its edge. The NH monogram is stamped into the
// face (logo.js's strokes, copied: the page takes no shared modules): debossed, a darker recess
// with a lighter lip, one texel wide, on the wall that faces the light. It's one piece: opened,
// it blooms (envelope.js sealBloom), shrinking away while plain rose petals (petals.js) unfurl
// out of it, so the monogram never rides on a petal.
import * as THREE from 'three';
import { IDS, WAX, toon } from './envelopeLook.js';

/** The NH monogram's strokes (logo.js PATH, in its units: x −27.5…27.5 across, y 2…78 down). */
const STROKES = [
  [-15, 78, -15, 27],
  [-15, 27, -4.5, 68],
  [-4.5, 68, -4.5, 2],
  [4.5, 2, 4.5, 68],
  [15, 27, 15, 78],
  [-27.5, 47, 27.5, 47],
];

/**
 * The monogram's strokes `height` tall, centred, y up: [x0, y0, x1, y1] each.
 * @param {number} height
 * @returns {number[][]}
 */
export function monogramSegments(height) {
  const k = height / (78 - 2);
  const cy = (2 + 78) / 2;
  return STROKES.map(([ax, ay, bx, by]) => [ax * k, (cy - ay) * k, bx * k, (cy - by) * k]);
}

/** The monogram's height and its strokes' width, as shares of the seal's radius. */
export const STAMP = { height: 1.28, stroke: 0.07 };
/** The rings of the blob from its middle out: [share of the radius, height as a share of it]. */
const RINGS = [
  [0.3, 0.3],
  [0.55, 0.285],
  [0.68, 0.27],
  [0.78, 0.36],
  [0.87, 0.38],
  [0.95, 0.25],
  [1.0, 0.06],
];
/** Round the blob. */
const SIDES = 40;

/**
 * The seal's outline at angle `a`, as a share of its radius: round, wobbling with a few
 * overtones (never more than about 15% off).
 * @param {number} a
 */
export function sealEdge(a) {
  return 1 + 0.06 * Math.sin(3 * a + 0.4) + 0.045 * Math.sin(5 * a + 1.9) + 0.03 * Math.sin(8 * a + 0.7);
}

/**
 * The rim's unevenness at angle `a`, as a share of the radius (added to its height).
 * @param {number} a
 */
const rimLift = (a) => 0.06 * Math.sin(4 * a + 1.1) + 0.035 * Math.sin(7 * a + 2.6);

/**
 * The blob as a mesh's geometry, radius `r`, the face up +z: a fan in the middle and rings out to
 * the edge.
 * @param {number} r
 */
export function sealGeometry(r) {
  const pos = [0, 0, r * 0.31];
  for (const [rho, z] of RINGS) {
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const rim = rho >= 0.75 && rho < 1 ? rimLift(a) : 0;
      // (The rim's crest wanders in and out a little too.)
      const wob = rho >= 0.75 && rho < 1 ? 0.02 * Math.sin(6 * a + rho * 9) : 0;
      const k = r * (rho + wob) * sealEdge(a);
      pos.push(Math.cos(a) * k, Math.sin(a) * k, r * (z + rim * Math.min(1, (rho - 0.7) * 6)));
    }
  }
  const idx = [];
  for (let i = 0; i < SIDES; i++) idx.push(0, 1 + i, 1 + ((i + 1) % SIDES));
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    const a0 = 1 + ring * SIDES;
    const b0 = a0 + SIDES;
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES;
      idx.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** The stamp, in GLSL (the seal's material: toon's SEAL). */
const SEAL_GLSL = /* glsl */ `
  uniform vec4 uSeg[6];
  uniform float uStroke;
  uniform float uSealR;
  uniform float uTexelS;
  uniform vec3 uDeep;
  uniform vec3 uLip;
  // (A stroke as a box with square ends, like the logo's: negative inside.)
  float strokeAt(vec2 p, vec4 s) {
    vec2 d = s.zw - s.xy;
    float len = length(d);
    vec2 dir = d / len;
    vec2 q = p - s.xy;
    float along = dot(q, dir);
    float across = abs(dot(q, vec2(-dir.y, dir.x)));
    return max(across - uStroke * 0.5, max(-along, along - len) - uStroke * 0.5);
  }
  float monogram(vec2 p) {
    float d = 1e3;
    for (int i = 0; i < 6; i++) d = min(d, strokeAt(p, uSeg[i]));
    return d;
  }
  vec3 sealStamp(vec2 p, vec3 c) {
    if (monogram(p) >= 0.0) return c;
    // (The recess's wall away from the light faces it: a lighter lip there, one texel wide.)
    vec2 toLight = normalize(vec2(-0.5, 0.62));
    return monogram(p - toLight * uTexelS) >= 0.0 ? uLip : uDeep;
  }
`;

/**
 * The seal, radius `r`: `group` (to place), and `setTexel` (a texel in the seal's own units, for
 * the lip's width).
 * @param {ReturnType<typeof import('./envelopeLook.js').shared>} u
 * @param {number} r
 */
export function buildSeal(u, r) {
  const geo = sealGeometry(r);
  const segs = monogramSegments(r * STAMP.height).map(([a, b, c, d]) => new THREE.Vector4(a, b, c, d));
  const texel = { value: r * 0.03 };
  const stampUniforms = () => ({
    uSeg: { value: segs },
    uStroke: { value: r * STAMP.height * STAMP.stroke },
    uSealR: { value: r },
    uTexelS: texel,
    uDeep: { value: new THREE.Vector3(0x4a / 255, 0x0b / 255, 0x0a / 255) },
    uLip: { value: new THREE.Vector3(0xe3 / 255, 0x86 / 255, 0x78 / 255) },
  });
  const bead = toon(WAX, u, IDS.seal);
  const group = new THREE.Group();
  const mat = toon(WAX, u, IDS.seal, { uniforms: stampUniforms(), defines: { SEAL: '' }, glsl: SEAL_GLSL });
  group.add(new THREE.Mesh(geo, mat));
  // The beads squeezed out at the edge: small squashed lumps.
  for (const [a, size] of [
    [0.35, 0.15],
    [2.5, 0.11],
    [4.25, 0.18],
    [5.3, 0.09],
  ]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * size, 1), bead);
    const k = r * sealEdge(a) * (1.0 + size * 0.45);
    m.position.set(Math.cos(a) * k, Math.sin(a) * k, r * 0.04);
    m.scale.set(1.15, 0.9, 0.55);
    group.add(m);
  }
  return {
    group,
    /** @param {number} s  a texel, in the seal's units */
    setTexel(s) {
      texel.value = s;
    },
  };
}
