// NEWT's earrings in the invitation toy, as pixel art. On each earlobe (EARLOBES: the lobe's
// lowest edge on newt.glb's head mesh, the stud against its skin) a black stud, and hanging from
// it on a one-texel chain a Latin cross. The stud and the cross are flat sprites facing the
// camera, drawn in the colour target's own texels: their art (STUD_ART, CROSS_ART) is
// nearest-filtered, a whole number of texels to an art pixel (earScale: about the cross's size
// in the world, never under one), and each sprite's anchor is snapped to a texel's centre in the
// vertex shader (after his head's texel snap), so the cross's bars are crisp straight lines with
// square ends at Pixel Size 96 and 128, and the same art a few texels to a pixel at Native and
// Off. The chain is a GL line (one texel wide) from the stud to the cross's top, its ends snapped
// the same way. All of it is marked as his trim (retro.js ID.trim): drawn as he is, but with no
// outline round it, which would have tripled a one-texel line. character.js hangs each earring
// on his head bone and swings its chain on the limp spring (carry.js limbStep); spriteShift and
// earScale are pure.

import * as THREE from 'three';
import { ID, surfaceIdUniforms } from './retro.js';

/**
 * Where each earring's stud sits, in his head bone's space with its rest turn taken off (his
 * model's axes: +x his left, +z his front), model units: on the outside of each earlobe at its
 * lowest edge (newt.glb's Head mesh: the lobe's bottom edge runs from (±1.357, 4.360, −0.384) to
 * (±1.329, 4.367, −0.287), its outer face up to x ±1.39 by y 4.43; the head bone's head at y 3.981).
 * @type {Record<'L'|'R', [number, number, number]>}
 */
export const EARLOBES = { L: [1.36, 0.39, -0.34], R: [-1.36, 0.39, -0.34] };
/**
 * An earring, model units: the chain's length; the cross's height in the world (its art is fitted
 * to it); and how far the stud is drawn toward the camera for its depth test (on the lobe's skin,
 * a sprite's one depth would half sink it into the lobe).
 */
export const EARRING = { line: 0.18, cross: { h: 0.46 }, studLift: 0.06 };
/** The earrings' black. */
export const EAR_BLACK = 0x141418;

/**
 * The cross: a Latin cross one art pixel wide, its arms two pixels each side, its top two pixels
 * over them and its foot four under, square (seven by seven, the arms' columns padded), top row
 * first. The chain meets it at its top pixel (column 3).
 */
export const CROSS_ART = Object.freeze(['...#...', '...#...', '.#####.', '...#...', '...#...', '...#...', '...#...']);
/** The stud: two pixels square. */
export const STUD_ART = Object.freeze(['##', '##']);
/** The most texels an art pixel may take (the sprites stay well under any GPU's point size limit). */
export const MAX_SCALE = 8;
/** earScale keeps its scale until the ideal one is this far from it (no flicker as he moves). */
export const SCALE_HOLD = 0.75;

/**
 * Texels to an art pixel for a cross `texels` tall in the world (CROSS_ART's rows over that),
 * rounded, at least 1 and at most MAX_SCALE; `prev` (the last one, 0 for none) is kept while the
 * ideal is within SCALE_HOLD of it.
 * @param {number} texels
 * @param {number} [prev]
 */
export function earScale(texels, prev = 0) {
  const ideal = (Number.isFinite(texels) ? Math.max(0, texels) : 0) / CROSS_ART.length;
  if (prev >= 1 && Math.abs(ideal - prev) < SCALE_HOLD) return prev;
  return Math.min(MAX_SCALE, Math.max(1, Math.round(ideal)));
}

/**
 * From the texel centre its anchor snaps to, where a square sprite `size` texels across goes
 * (its centre, texels, x right, y up), so it covers whole texels: 'centre', the anchor's texel
 * at (or by) its middle; 'top', its top edge along the anchor texel's top, its middle column
 * over the anchor's (the cross hanging from its chain).
 * @param {number} size
 * @param {'centre'|'top'} at
 * @returns {{x: number, y: number}}
 */
export function spriteShift(size, at) {
  const half = size % 2 === 0 ? 0.5 : 0;
  return at === 'top' ? { x: half, y: 0.5 - size / 2 } : { x: half, y: -half };
}

/**
 * Lifts a point uLift toward the camera (for its depth test only: it projects to the same spot),
 * snaps it to its texel's centre (after his head's texel snap), then shifts it by uShift texels.
 */
const VERTEX = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uTexelSnap;
uniform vec2 uShift;
uniform float uSize;
uniform float uLift;
void main() {
  vec4 v = modelViewMatrix * vec4(position, 1.0);
  v.xyz += normalize(-v.xyz) * uLift;
  vec4 c = projectionMatrix * v;
  c.xy += uTexelSnap * c.w;
  vec2 p = (c.xy / c.w * 0.5 + 0.5) * uRes;
  p = floor(p) + 0.5 + uShift;
  c.xy = (p / uRes * 2.0 - 1.0) * c.w;
  gl_Position = c;
  gl_PointSize = uSize;
}
`;
/** Its colour where its art has a pixel (ART: a sprite's), its surface id in the alpha. */
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uSurfaceId;
uniform float uIdOn;
#ifdef ART
uniform sampler2D uArt;
#endif
void main() {
#ifdef ART
  if (texture2D(uArt, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)).a < 0.5) discard;
#endif
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.a = mix(1.0, uSurfaceId, uIdOn);
}
`;

/**
 * Pixel art as a nearest-filtered texture, its rows bottom up (a DataTexture's way round): a
 * pixel's alpha 255 where the art has '#'.
 * @param {readonly string[]} art  square, top row first
 */
export function artTexture(art) {
  const n = art.length;
  const data = new Uint8Array(n * n * 4);
  art.forEach((row, y) => {
    for (let x = 0; x < n; x++) {
      const i = ((n - 1 - y) * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = row[x] === '#' ? 255 : 0;
    }
  });
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * One earring's material: the black, its texel snap (`snap`, his head's, shared) and the frame's
 * texel grid (`res`, shared), and with `art` a sprite's texture, size and shift.
 * @param {{snap: {value: any}, res: {value: any}, art?: any}} o
 */
function earMaterial({ snap, res, art }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uRes: res,
      uTexelSnap: snap,
      uShift: { value: new THREE.Vector2() },
      uSize: { value: 1 },
      uLift: { value: 0 },
      uColor: { value: new THREE.Color(EAR_BLACK) },
      ...surfaceIdUniforms(ID.trim),
      ...(art ? { uArt: { value: art } } : {}),
    },
    defines: art ? { ART: '' } : {},
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  return m;
}

/**
 * An earring for his `side`, at EARLOBES[side]: its group (to go on his head bone, its rest turn
 * taken off), the stud's sprite at the lobe, and a pivot there holding the chain (a line down
 * its −y, EARRING.line long) and the cross's sprite at its end (character.js turns the pivot
 * so its −y is the swing). Before each draw its sprites take the frame's texel grid and their
 * scale (earScale of the cross's height in texels there) and shift (spriteShift).
 * @param {'L'|'R'} side
 * @param {{value: any}} snap  his head's texel snap (NDC, shared with his materials)
 */
export function makeEarring(side, snap) {
  const res = { value: new THREE.Vector2(1, 1) };
  const textures = [artTexture(STUD_ART), artTexture(CROSS_ART)];
  const group = new THREE.Group();
  group.name = `Earring${side}`;
  group.position.fromArray(EARLOBES[side]);
  const point = (/** @type {number[]} */ at) =>
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(at, 3));
  const stud = new THREE.Points(point([0, 0, 0]), earMaterial({ snap, res, art: textures[0] }));
  stud.name = `Earring${side}Stud`;
  const pivot = new THREE.Group();
  pivot.name = `Earring${side}Swing`;
  const line = new THREE.LineSegments(point([0, 0, 0, 0, -EARRING.line, 0]), earMaterial({ snap, res }));
  line.name = `Earring${side}Line`;
  const cross = new THREE.Points(point([0, 0, 0]), earMaterial({ snap, res, art: textures[1] }));
  cross.position.y = -EARRING.line;
  cross.name = `Earring${side}Cross`;
  for (const o of [stud, line, cross]) {
    o.frustumCulled = false;
    o.castShadow = false;
    o.receiveShadow = false;
    o.renderOrder = 1;
  }
  pivot.add(line, cross);
  group.add(stud, pivot);
  const e = {
    side,
    group,
    stud,
    pivot,
    line,
    cross,
    /** Texels to an art pixel, as last drawn (0: not drawn yet). */
    scale: 0,
    /** @type {import('./carry.js').Limb|null} */
    m: null,
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    frames: 0,
    dispose() {
      for (const o of [stud, line, cross]) {
        o.geometry.dispose();
        o.material.dispose();
      }
      for (const t of textures) t.dispose();
    },
  };
  const viewport = new THREE.Vector4();
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  /** @param {any} renderer @param {any} _scene @param {any} camera */
  const beforeDraw = (renderer, _scene, camera) => {
    renderer.getCurrentViewport(viewport);
    res.value.set(viewport.z, viewport.w);
    // Texels a world unit at the stud: the projection's vertical scale over the depth there.
    group.getWorldPosition(at);
    const depth = camera.isOrthographicCamera ? 1 : -at.applyMatrix4(camera.matrixWorldInverse).z;
    if (!(depth > 0)) return;
    const perUnit = (camera.projectionMatrix.elements[5] * viewport.w) / 2 / depth;
    e.scale = earScale(EARRING.cross.h * group.getWorldScale(scale).y * perUnit, e.scale);
    fit(stud, STUD_ART.length * e.scale, 'centre');
    stud.material.uniforms.uLift.value = EARRING.studLift * scale.y;
    fit(cross, CROSS_ART.length * e.scale, 'top');
  };
  /** @param {any} o @param {number} size @param {'centre'|'top'} where */
  const fit = (o, size, where) => {
    o.material.uniforms.uSize.value = size;
    const s = spriteShift(size, where);
    o.material.uniforms.uShift.value.set(s.x, s.y);
  };
  for (const o of [stud, line, cross]) o.onBeforeRender = beforeDraw;
  return e;
}
