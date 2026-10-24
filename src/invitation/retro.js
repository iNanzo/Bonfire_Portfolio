// The invitation toy's retro pass: the scene drawn at texel size into a colour target with a
// depth texture, then one post shader to the canvas. The scene is NEWT on a white page: the
// background is the preset's paper colour and the floor is a shadow catcher (a ShadowMaterial)
// that only shows his shadows, so the post shader treats three kinds of texel:
//   - the paper (nothing drawn): exactly the preset's background, never graded or dithered, so
//     the floor never shows an edge or a horizon;
//   - the floor: the paper again, darkened toward the preset's shadow colour by his shadow (its
//     coverage softened over `shadow.soft` texels and dithered into `shadow.steps` tones, or
//     left hard), and by whatever is drawn over it (the blob shadow, the marker), never
//     quantized (Colors is his colour depth);
//   - NEWT: graded (exposure, lift, gamma, contrast, saturation, tint warmed or cooled), lined,
//     then quantized to `levels` a channel with the 4×4 Bayer dither.
// Every value comes from the look preset (lookPreset: the style with the user's Shader options
// written in), all of them uniforms, so moving a Shader option never builds a new program.
// Lines (Outlines) are only ever on or around NEWT: on his own edge texels where the surface or
// the depth changes (the DS's edge marking), or with `outline.outside` on the paper texels
// just outside his silhouette, as a darker shade of his colour there (a sprite's outline);
// `outline.darken` darker, and multiplied by `outline.tint` unless `outline.ink` is 'dark'.
// The floor, the shadow and the paper make none.
//
// The floor: drawn into the colour target, any ShadowMaterial in the scene is swapped for the
// pass's catcher, which writes the shadow's coverage into the colour's alpha beside the floor's
// surface id (ID.floor + SHADE_SPAN × coverage, over ID_SCALE) and white into the colour, so
// the post shader composes the shadow itself. Pixel Size Off skips the pass and draws the scene
// straight to the canvas at the screen's resolution, the ShadowMaterial as it is (the paper as
// the clear colour); Native keeps the pass, a texel a device pixel. The two paths draw with
// different programs (the canvas's sRGB output, the floor's own material), so once NEWT is in
// the page compiles the one not showing ahead (warm), and the first switch never stalls on
// shader links. The toon materials write
// their surface id into alpha too (markId), and in the colour target sample their textures a
// coarser mip by the preset's `texture.mipBias` (at a few hundred texels his shirt's pattern
// aliases into a grey patchwork; the toon bands should shade him, not the texture's noise).
// Things drawn over the floor (the blob, the marker) write no depth and keep the id under them
// (decalMaterial); in the colour target they're flat pixel shapes, their map's alpha cut at
// DECAL_CUT and drawn at the material's opacity, like his hard shadow (a smooth falloff reads
// as a smudge on the white page).
//
// Cost: the post shader runs on every texel of the stage, and two of its parts loop over
// neighbours: the ring just outside him (4 reads a texel) and the soft shadow's averaging (up to
// (2 MAX_SOFT + 1)² reads). Both only ever find something near NEWT, so the stage hands the pass
// two boxes in texels each frame (subjectBoxes: his bounding sphere on screen, and the floor his
// shadow can fall on, from the light), and outside them the loops are skipped. Outside a third,
// the area holding both and the decals (the blob, the marker), every texel is the paper: there
// the canvas is only cleared to it, and both the colour pass and the post pass draw inside that
// area alone (a scissor). The same picture, for a share of the texels: at Native on a phone
// three million texels drawn twice became the few hundred thousand round NEWT.
//
// The pointer on him (setHover, 0..1 as main.js eases it): a Bayer-dithered rim in HOVER_INK on
// his outermost texels that fills inward as it grows, and a halo a texel or two outside him (in
// the ring box only: it searches 12 neighbours a texel, and only while hovering). His grab
// (setBurst): a dither ring at the grip that grows out and thins away, an ALU test alone. Both
// mark their paper texels as a line, so they're quantized and dithered as his lines are. At
// Pixel Size Off the post pass is skipped, so his own materials take the hover instead: a Bayer
// tint on gl_FragCoord (markId), with no halo and no ring.
import * as THREE from 'three';
import { floorLook } from './floor.js';
import { BAYER4 } from './pixels.js';
import { warmthTint } from './shader.js';

/** Surface ids (written into the colour's alpha as id / ID_SCALE; 0 is nothing drawn). */
export const ID = { newt: 1, floor: 2 };
const ID_SCALE = 16;
/** The floor's alpha carries its shadow's coverage in this much of an id step above ID.floor. */
const SHADE_SPAN = 0.9;
/** The softest a shadow's edge may be spread, texels (the post shader's loop bound). */
export const MAX_SOFT = 3;
/**
 * Whether the ids are written (one uniform every marked material shares): only into the colour
 * target. Drawn straight to the canvas (Pixel Size Off) the alpha stays 1, or the page would
 * show through: three's canvas always has an alpha channel.
 */
const ID_ON = { value: 1 };
/** How many mip levels coarser his textures are sampled (one uniform every marked material shares). */
const MAP_BIAS = { value: 0 };
/** The pointer on NEWT, 0..1 (setHover; one uniform every marked material shares: the tint at Off). */
const HOVER = { value: 0 };
/** The hover's and the grab ring's ink (sRGB): a warm gold that reads on him and on the paper. */
export const HOVER_INK = 0xe0a53a;
/** A decal's map alpha under this is outside its shape (in the colour target). */
export const DECAL_CUT = 0.3;
/** A box that holds every texel (subjectBoxes' answer when it can't bound him). */
export const ALL = Object.freeze([-1e9, -1e9, 1e9, 1e9]);
/** Texels round his sphere's box for the ring (one, and the texel snap's half). */
const RING_MARGIN = 2;
/** Texels round the area past the boxes: the soft shadow's reads reach MAX_SOFT past its box. */
const AREA_MARGIN = MAX_SOFT + 1;

const corner = new THREE.Vector3();
const onFloor = new THREE.Vector3();

/**
 * The boxes the post shader keeps its loops to (texels on a w × h target, gl_FragCoord's: x
 * right, y up; [x0, y0, x1, y1]): `ring`, NEWT's bounding sphere (`center`, `radius`, world
 * units) on screen, for the ring just outside him; `shade`, the floor his shadow can fall on (that
 * sphere's box cast along `light`, the unit direction toward the light, onto the floor), with room
 * for a soft edge MAX_SOFT texels wide; and `area`, the two with the `extra` points (the decals'
 * corners) and room for the soft shadow's reads: outside it every texel is the paper, and the
 * pass draws inside it alone. They're bounded by projecting the corners of the sphere's box (a
 * cast along the light and the camera's projection keep a box's points inside its corners'
 * hull); a point behind the camera, or a light at the horizon, gives ALL.
 * @param {{center: any, radius: number, light: any, camera: any, w: number, h: number, extra?: any[]}} o
 * @returns {{ring: number[], shade: number[], area: number[]}}
 */
export function subjectBoxes({ center, radius, light, camera, w, h, extra = [] }) {
  const ring = [Infinity, Infinity, -Infinity, -Infinity];
  const shade = [Infinity, Infinity, -Infinity, -Infinity];
  const decals = [Infinity, Infinity, -Infinity, -Infinity];
  const all = () => ({ ring: [...ALL], shade: [...ALL], area: [...ALL] });
  const grow = (box, p) => {
    // (In front of the camera: its view-space z is negative, the clip w positive.)
    const z = corner.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
    if (!(z < -1e-6)) return false;
    p.project(camera);
    const x = ((p.x + 1) / 2) * w;
    const y = ((p.y + 1) / 2) * h;
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
    return true;
  };
  if (!(light.y > 0.05)) return all();
  for (let i = 0; i < 8; i++) {
    const cx = center.x + (i & 1 ? radius : -radius);
    const cy = center.y + (i & 2 ? radius : -radius);
    const cz = center.z + (i & 4 ? radius : -radius);
    const ok =
      grow(ring, onFloor.set(cx, cy, cz)) &&
      grow(shade, onFloor.set(cx - (light.x * cy) / light.y, 0, cz - (light.z * cy) / light.y));
    if (!ok) return all();
  }
  for (const p of extra) if (!grow(decals, onFloor.copy(p))) return all();
  const pad = (box, m) => [
    Math.floor(box[0] - m),
    Math.floor(box[1] - m),
    Math.ceil(box[2] + m),
    Math.ceil(box[3] + m),
  ];
  // (The shadow under his feet is in the ring box too: the shade box takes it in.)
  for (const k of [0, 1]) shade[k] = Math.min(shade[k], ring[k]);
  for (const k of [2, 3]) shade[k] = Math.max(shade[k], ring[k]);
  const out = { ring: pad(ring, RING_MARGIN), shade: pad(shade, MAX_SOFT + RING_MARGIN) };
  const area = [...out.shade];
  for (const k of [0, 1]) area[k] = Math.min(area[k], out.ring[k], Math.floor(decals[k] - RING_MARGIN));
  for (const k of [2, 3]) area[k] = Math.max(area[k], out.ring[k], Math.ceil(decals[k] + RING_MARGIN));
  return { ...out, area: pad(area, AREA_MARGIN) };
}

/**
 * The pass's own optional knobs a look preset may carry beside LookPreset's (looks/*.js type
 * themselves as LookPreset & RetroExtras).
 * @typedef {object} RetroExtras
 * @property {{soft?: number, steps?: number, dither?: number}} shadow  soft: texels the
 *   shadow's edge spreads over (0: hard); steps: tones it's dithered into (0: smooth);
 *   dither: how much the Bayer dither moves those steps, 0..1
 * @property {{outside?: boolean}} outline  lines on the paper just outside NEWT, not on his edge
 * @property {{mipBias?: number, fineMipBias?: number, pixelShirt?: boolean, pixelFace?: boolean}} [texture]
 *   pixelShirt: Pixel Shirt (a Shader option, off in every style), the bold pixel plaid at the
 *   coarser resolutions; pixelFace: Pixel Face (on in every style; on unless false), his face
 *   redrawn in pixels to fit his size (character.js); mipBias: how many mip levels
 *   coarser his textures are sampled with the pixel filter on (0: as three picks); fineMipBias:
 *   his atlas's once he's character.js ORIGINAL_ATLAS_TEXELS tall or more (the glb's plaid at a
 *   fine resolution; mipBias without it)
 */

/** The Bayer threshold of a device pixel, in 2×2 blocks (the hover's tint at Pixel Size Off). */
const HOVER_BAYER = `float hoverBayer(vec2 f) {
  const float B[16] = float[16](${BAYER4.map((v) => v.toFixed(5)).join(', ')});
  ivec2 i = ivec2(mod(floor(f / 2.0), 4.0));
  return B[i.y * 4 + i.x];
}`;
/** At Pixel Size Off (no ids written) NEWT's own texels take the hover as a dithered tint. */
const HOVER_TINT = `\tif (uIdOn < 0.5 && uHover > 0.0 && abs(uSurfaceId * ${ID_SCALE.toFixed(1)} - ${ID.newt.toFixed(1)}) < 0.5 && hoverBayer(gl_FragCoord.xy) < uHover * 0.25)
\t\tgl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${[16, 8, 0].map((sh) => (((HOVER_INK >> sh) & 255) / 255).toFixed(4)).join(', ')}), 0.5);`;

/**
 * Make a material write its surface id into the colour's alpha (for the retro pass's lines),
 * and sample its map MAP_BIAS mip levels coarser (0 unless the pass sets it), or by its own
 * `bias` uniform (his face's: 0, so the smooth face sheet stays sharp). With `snap`, its
 * vertices also move by that uniform's shift (NDC: clip space over w) after three projects
 * them: one shift all of his materials share (character.js sets it each frame from snapShift),
 * so all of him moves onto the texel grid together and a part that only drifts within a texel
 * (his head as he breathes) draws the same texels frame after frame.
 * @template T
 * @param {T} material  a built-in three.js material
 * @param {number} id  ID's
 * @param {{snap?: {value: {x: number, y: number}}, bias?: {value: number}}} [opts]
 * @returns {T}
 */
export function markId(material, id, opts = {}) {
  const m = /** @type {any} */ (material);
  const { snap, bias = MAP_BIAS } = opts;
  m.onBeforeCompile = (shader) => {
    if (snap) {
      shader.uniforms.uTexelSnap = snap;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform vec2 uTexelSnap;\nvoid main() {')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\n\tgl_Position.xy += uTexelSnap * gl_Position.w;',
        );
    }
    shader.uniforms.uSurfaceId = { value: id / ID_SCALE };
    shader.uniforms.uIdOn = ID_ON;
    shader.uniforms.uMapBias = bias;
    shader.uniforms.uHover = HOVER;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uMapBias;\nuniform float uSurfaceId;\nuniform float uIdOn;\nuniform float uHover;\n${HOVER_BAYER}\nvoid main() {`,
      )
      .replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n\tvec4 sampledDiffuseColor = texture2D( map, vMapUv, uMapBias );\n\tdiffuseColor *= sampledDiffuseColor;\n#endif',
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n\tgl_FragColor.a = mix(1.0, uSurfaceId, uIdOn);\n${HOVER_TINT}`,
      );
  };
  // (One program for every id: the id is a uniform. Without a key three would share the
  // material type's own program, which has no such uniform.)
  m.customProgramCacheKey = () => (snap ? 'invitation-surface-id-snap' : 'invitation-surface-id');
  return material;
}

/** How far past a texel's edge (texels) a held snap keeps to its texel (snapShift's `hold`). */
export const SNAP_HOLD = 0.25;

/**
 * The shift (NDC) that moves the point at NDC (x, y) onto the centre of the texel it's in, on
 * a w × h grid: at most half a texel each way (none without a grid). With `hold` (the texel
 * centres it snapped to last, kept between calls; NaN at first) it keeps to that texel until
 * the point is SNAP_HOLD past its edge: a point wobbling across an edge (his head as he
 * breathes) would otherwise step all of him back and forth a texel with every breath.
 * @param {number} x
 * @param {number} y
 * @param {number} w  texels across
 * @param {number} h  texels down
 * @param {{x: number, y: number}} [out]
 * @param {{x: number, y: number}|null} [hold]
 */
export function snapShift(x, y, w, h, out = { x: 0, y: 0 }, hold = null) {
  const shift = (ndc, n, axis) => {
    if (!(n > 0)) return 0;
    const p = ((ndc + 1) / 2) * n;
    let c = Math.floor(p) + 0.5;
    if (hold) {
      if (Math.abs(p - hold[axis]) <= 0.5 + SNAP_HOLD) c = hold[axis];
      else hold[axis] = c;
    }
    return ((c - p) * 2) / n;
  };
  out.x = shift(x, w, 'x');
  out.y = shift(y, h, 'y');
  return out;
}

/**
 * A material for what's drawn over the floor: blended, no depth written, the colour target's
 * alpha (the surface id under it) left as it was. In the colour target it's a flat pixel shape:
 * where its map's alpha reaches DECAL_CUT, at the material's opacity, nothing elsewhere (drawn
 * straight to the canvas, Pixel Size Off, its map's falloff stays).
 * @param {object} params  MeshBasicMaterial's
 */
export function decalMaterial(params) {
  const m = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...params,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uIdOn = ID_ON;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uIdOn;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n#ifdef USE_MAP\n\tif ( uIdOn > 0.5 ) {\n\t\tif ( sampledDiffuseColor.a < ${DECAL_CUT.toFixed(2)} ) discard;\n\t\tdiffuseColor.a = opacity;\n\t}\n#endif`,
      );
  };
  m.customProgramCacheKey = () => 'invitation-decal';
  return m;
}

/** The line in three's ShadowMaterial shader that the catcher rewrites. */
const SHADOW_OUT = 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );';

/**
 * The floor as the colour target wants it: a ShadowMaterial (three's lights and shadow map,
 * whatever their type) that writes white, and its shadow's coverage into the alpha beside the
 * floor's id, unblended.
 */
export function catcherMaterial() {
  const m = new THREE.ShadowMaterial({ transparent: false, depthWrite: true });
  m.blending = THREE.NoBlending;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      SHADOW_OUT,
      `gl_FragColor = vec4( 1.0, 1.0, 1.0, ( ${ID.floor.toFixed(1)} + ${SHADE_SPAN.toFixed(2)} * ( 1.0 - getShadowMask() ) ) / ${ID_SCALE.toFixed(1)} );`,
    );
  };
  m.customProgramCacheKey = () => 'invitation-shadow-catcher';
  return m;
}

/** A toon gradient's cells as RGBA bytes, each cell its value in every channel. */
function gradientBytes(bands) {
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((v, i) => data.fill(Math.round(Math.min(1, Math.max(0, v)) * 255), i * 4, i * 4 + 4));
  return data;
}

/**
 * The toon materials' gradient map: one texel a cell, nearest, so the light falls in steps.
 * @param {number[]} bands  dark to light, 0..1 (shader.js toonRamp)
 */
export function toonGradient(bands) {
  const t = new THREE.DataTexture(gradientBytes(bands), bands.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Rewrite a gradient map's cells with as many new ones (shader.js toonRamp always gives
 * TOON_CELLS), uploaded again on its next use: the materials keep their texture and program.
 * @param {any} texture  a toonGradient
 * @param {number[]} bands  as many as it has cells
 */
export function setToonGradient(texture, bands) {
  texture.image.data.set(gradientBytes(bands).subarray(0, texture.image.data.length));
  texture.needsUpdate = true;
}

/**
 * A colour (a hex number, or a CSS string) as a THREE.Color holding its sRGB components, as
 * they are (the post shader works in sRGB; a round trip through linear would move white).
 * @param {number|string} c
 */
const srgb = (c) => {
  const n =
    typeof c === 'number' ? c : new THREE.Color().setStyle(c, THREE.SRGBColorSpace).getHex(THREE.SRGBColorSpace);
  return new THREE.Color().setRGB(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    THREE.LinearSRGBColorSpace,
  );
};

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
/** The post shader (exported for the tests: which texels it quantizes). */
export const POST_SHADER = /* glsl */ `
  #include <packing>
  #define ID_SCALE ${ID_SCALE.toFixed(1)}
  #define NEWT ${ID.newt.toFixed(1)}
  #define FLOOR ${ID.floor.toFixed(1)}
  #define SPAN ${SHADE_SPAN.toFixed(2)}
  #define MAX_SOFT ${MAX_SOFT}
  #define HOVER_FILL 0.1
  #define BURST_WIDTH 2.0
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float uLevels;
  uniform float uDither;
  uniform float uBayer[16];
  uniform float uOutline;
  uniform float uOutside;
  uniform float uEdgeDepth;
  uniform float uDarken;
  uniform vec3 uInk;
  uniform float uLift;
  uniform float uGamma;
  uniform float uSat;
  uniform float uExposure;
  uniform float uContrast;
  uniform vec3 uTint;
  uniform vec3 uPaper;
  uniform vec3 uShade;
  uniform float uShadeAmount;
  uniform float uShadeSoft;
  uniform float uShadeSteps;
  uniform float uShadeDither;
  uniform vec4 uRingBox;
  uniform vec4 uShadeBox;
  uniform float uHover;
  uniform vec3 uHoverInk;
  uniform vec4 uBurst;

  const vec2 STEPS[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));
  // The hover halo's neighbours: the four beside, the four corners, then two out along each axis.
  const vec2 HALO[12] = vec2[12](
    vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0),
    vec2(1.0, 1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, -1.0),
    vec2(2.0, 0.0), vec2(-2.0, 0.0), vec2(0.0, 2.0), vec2(0.0, -2.0)
  );

  vec4 at(vec2 p) { return texture2D(tColor, p / uRes); }
  bool inside(vec2 p) { return p.x >= 0.0 && p.y >= 0.0 && p.x < uRes.x && p.y < uRes.y; }
  bool inBox(vec2 p, vec4 b) { return p.x >= b.x && p.y >= b.y && p.x <= b.z && p.y <= b.w; }
  float idOf(vec4 c) { return floor(c.a * ID_SCALE + 0.02); }
  bool isNewt(vec2 p) { return inside(p) && abs(idOf(at(p)) - NEWT) < 0.5; }
  // The floor's shadow coverage, 0..1; -1 off the floor.
  float shadeOf(vec4 c) {
    float a = c.a * ID_SCALE;
    return abs(floor(a + 0.02) - FLOOR) < 0.5 ? clamp((a - FLOOR) / SPAN, 0.0, 1.0) : -1.0;
  }
  // 1 / view depth: on a plane it changes linearly across the screen, so a second difference
  // of it is ~0 anywhere but where the depth jumps.
  float invDepth(vec2 p) {
    return -1.0 / perspectiveDepthToViewZ(texture2D(tDepth, p / uRes).x, cameraNear, cameraFar);
  }
  vec3 toSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float bayer(vec2 p) {
    ivec2 i = ivec2(mod(floor(p), 4.0));
    return uBayer[i.y * 4 + i.x];
  }
  vec3 grade(vec3 rgb) {
    vec3 col = toSRGB(rgb * uExposure);
    col = uLift + col * (1.0 - uLift);
    col = pow(max(col, 0.0), vec3(1.0 / uGamma));
    col = (col - 0.5) * uContrast + 0.5;
    return mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uSat) * uTint;
  }
  vec3 quantize(vec3 col, float d) {
    return clamp(floor(clamp(col, 0.0, 1.0) * (uLevels - 1.0) + 0.5 + d) / (uLevels - 1.0), 0.0, 1.0);
  }
  // Whether one of NEWT's texels takes a line: a neighbour that isn't NEWT (his silhouette,
  // unless the lines go outside it), or one further than the surface through this texel and
  // the opposite one predicts, by more than uEdgeDepth of it (an arm over his body).
  bool edgeOnNewt(vec2 p) {
    float w = invDepth(p);
    for (int k = 0; k < 4; k++) {
      vec2 n = p + STEPS[k];
      if (!inside(n)) continue;
      if (!isNewt(n)) {
        if (uOutside < 0.5) return true;
        continue;
      }
      vec2 o = p - STEPS[k];
      float wo = isNewt(o) ? invDepth(o) : w;
      if ((2.0 * w - wo) - invDepth(n) > uEdgeDepth * w) return true;
    }
    return false;
  }
  // Whether one of NEWT's texels is within two of his silhouette (a texel one or two along
  // isn't him): the hover's rim.
  bool rimOf(vec2 p) {
    for (int k = 0; k < 4; k++) {
      if (inside(p + STEPS[k]) && !isNewt(p + STEPS[k])) return true;
      if (inside(p + 2.0 * STEPS[k]) && !isNewt(p + 2.0 * STEPS[k])) return true;
    }
    return false;
  }
  // Whether the grab ring covers p: within BURST_WIDTH of its circle, dithered by its strength.
  bool burstAt(vec2 p) {
    if (uBurst.w <= 0.0) return false;
    return abs(length(p - uBurst.xy) - uBurst.z) < BURST_WIDTH && bayer(p) < uBurst.w;
  }
  // The floor's shadow coverage around p, averaged over the floor texels of a disc uShadeSoft
  // texels in radius (its own coverage when that's 0).
  float softShade(vec2 p, float own) {
    if (uShadeSoft < 0.5 || !inBox(p, uShadeBox)) return own;
    float sum = 0.0;
    float n = 0.0;
    float r2 = uShadeSoft * uShadeSoft + uShadeSoft;
    for (int y = -MAX_SOFT; y <= MAX_SOFT; y++)
      for (int x = -MAX_SOFT; x <= MAX_SOFT; x++) {
        vec2 o = vec2(float(x), float(y));
        if (dot(o, o) > r2 || !inside(p + o)) continue;
        float s = shadeOf(at(p + o));
        if (s >= 0.0) {
          sum += s;
          n += 1.0;
        }
      }
    return n > 0.0 ? sum / n : own;
  }

  void main() {
    vec2 p = gl_FragCoord.xy;
    vec4 src = at(p);
    float d = bayer(p) - 0.5;
    if (abs(idOf(src) - NEWT) < 0.5) {
      vec3 col = grade(src.rgb);
      if (uOutline > 0.5 && edgeOnNewt(p)) col *= uInk * (1.0 - uDarken);
      // (The pointer on him: a two-texel rim, dithered in as it grows, and a sprinkle further in;
      // the grab ring over him.)
      bool edge = uHover > 0.0 && rimOf(p);
      if (uHover > 0.0 && bayer(p) < uHover * (edge ? 1.0 : HOVER_FILL)) col = mix(col, uHoverInk, 0.6);
      if (burstAt(p)) col = uHoverInk;
      gl_FragColor = vec4(quantize(col, d * uDither), 1.0);
      return;
    }
    // The paper, or the floor: the paper under his shadow and what's drawn over it, never
    // dithered (the shadow's flat tones stay flat as the camera turns: a screen-space pattern
    // over them would crawl) nor quantized (Colors is his colour depth: at a few levels the
    // shadow's lavender turned blue); or a line just outside him, quantized and dithered as he is.
    vec3 col = uPaper;
    bool line = false;
    float dd = 0.0;
    float own = shadeOf(src);
    if (own >= 0.0) {
      float amount = softShade(p, own);
      if (uShadeSteps > 0.5)
        amount = clamp(floor(amount * uShadeSteps + 0.5 + d * uShadeDither) / uShadeSteps, 0.0, 1.0);
      col = mix(col * toSRGB(src.rgb), uShade, amount * uShadeAmount);
    }
    if (uOutline > 0.5 && uOutside > 0.5 && inBox(p, uRingBox))
      for (int k = 0; k < 4; k++) {
        vec2 n = p + STEPS[k];
        if (!isNewt(n)) continue;
        col = grade(at(n).rgb) * uInk * (1.0 - uDarken);
        line = true;
        dd = d * uDither;
        break;
      }
    // (The hover's halo a texel or two outside him (past his outside line, when there's one),
    // and the grab ring: in the ink, marked as a line.)
    if (uHover > 0.0 && !line && inBox(p, uRingBox))
      for (int k = 0; k < 12; k++) {
        if (!isNewt(p + HALO[k])) continue;
        if (bayer(p) < uHover * (k < 4 ? 1.0 : 0.6)) {
          col = uHoverInk;
          line = true;
          dd = d * uDither;
        }
        break;
      }
    if (burstAt(p)) {
      col = uHoverInk;
      line = true;
      dd = d * uDither;
    }
    // (Untouched paper stays exactly the paper.)
    gl_FragColor = vec4(line ? quantize(col, dd) : col, 1.0);
  }
`;

/**
 * The pass, on `renderer`: setSize(w, h) in texels, setParams(preset, look), render(scene,
 * camera) (the colour pass into the target, the post pass to the canvas; Pixel Size Off: the
 * scene straight to the canvas), warm(scene, camera) (the other path's programs compiled ahead),
 * dispose().
 * @param {any} renderer  a THREE.WebGLRenderer
 */
export function createRetro(renderer) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 1 },
      cameraFar: { value: 80 },
      uLevels: { value: 64 },
      uDither: { value: 0 },
      uBayer: { value: BAYER4 },
      uOutline: { value: 1 },
      uOutside: { value: 0 },
      uEdgeDepth: { value: 0.002 },
      uDarken: { value: 0.4 },
      uInk: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: 0 },
      uGamma: { value: 1 },
      uSat: { value: 1 },
      uExposure: { value: 1 },
      uContrast: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uPaper: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0, 0, 0) },
      uShadeAmount: { value: 0.3 },
      uShadeSoft: { value: 0 },
      uShadeSteps: { value: 0 },
      uShadeDither: { value: 1 },
      uRingBox: { value: new THREE.Vector4(...ALL) },
      uShadeBox: { value: new THREE.Vector4(...ALL) },
      uHover: { value: 0 },
      uHoverInk: { value: srgb(HOVER_INK) },
      uBurst: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    vertexShader,
    fragmentShader: POST_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  const u = material.uniforms;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const catcher = catcherMaterial();
  /** @type {any} */
  let target = null;
  let pixel = true;
  const background = new THREE.Color();
  /** The shadow catchers swapped for this frame's colour pass: mesh, its material, mesh, … */
  const swapped = [];
  /** Where the passes draw, texels [x0, y0, x1, y1] (setBoxes; the whole target by default). */
  const area = [...ALL];

  function setSize(w, h) {
    if (target && target.width === w && target.height === h) return;
    target?.depthTexture?.dispose();
    target?.dispose();
    target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(w, h),
    });
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
    u.tColor.value = target.texture;
    u.tDepth.value = target.depthTexture;
    u.uRes.value.set(w, h);
  }

  /**
   * @param {import('./look.js').LookPreset & RetroExtras} preset
   * @param {import('./look.js').Look} look
   */
  function setParams(preset, look) {
    pixel = look.pixelSize !== 'off';
    const shadow = preset.shadow;
    // (The page's colours as floor.js reads them: a hex number each, with its fallbacks.)
    const scene = floorLook(preset);
    u.uLevels.value = preset.levels;
    u.uDither.value = look.dither ? preset.dither : 0;
    u.uOutline.value = look.outlines ? 1 : 0;
    u.uOutside.value = preset.outline.outside ? 1 : 0;
    u.uEdgeDepth.value = preset.outline.depth;
    u.uDarken.value = preset.outline.darken;
    // (Dark lines are just darker; tinted ones take the style's ink too.)
    u.uInk.value.copy(srgb(preset.outline.ink === 'dark' ? 0xffffff : preset.outline.tint));
    u.uLift.value = preset.grade.lift;
    u.uGamma.value = preset.grade.gamma;
    u.uSat.value = preset.grade.saturation;
    u.uExposure.value = preset.grade.exposure;
    u.uContrast.value = preset.grade.contrast ?? 1;
    const [wr, wg, wb] = warmthTint(preset.grade.warmth ?? 0);
    const tint = srgb(preset.grade.tint);
    u.uTint.value.setRGB(tint.r * wr, tint.g * wg, tint.b * wb, THREE.LinearSRGBColorSpace);
    u.uPaper.value.copy(srgb(scene.background));
    u.uShade.value.copy(srgb(scene.shadow.color));
    u.uShadeAmount.value = scene.shadow.opacity;
    u.uShadeSoft.value = Math.min(MAX_SOFT, Math.max(0, shadow.soft ?? 0));
    // (Dithering off: the steps stay, undithered, so the shadow keeps its tones.)
    u.uShadeSteps.value = Math.max(0, Math.round(shadow.steps ?? 0));
    u.uShadeDither.value = look.dither ? (shadow.dither ?? 1) : 0;
    MAP_BIAS.value = pixel ? Math.max(0, preset.texture?.mipBias ?? 0) : 0;
    background.setHex(scene.background, THREE.SRGBColorSpace);
  }

  /** Swap every ShadowMaterial in `scene` for the catcher, for this frame's colour pass. */
  function swapCatchers(scene) {
    scene.traverse((o) => {
      if (!o.material?.isShadowMaterial || o.material === catcher) return;
      swapped.push(o, o.material);
      o.material = catcher;
    });
  }
  function restoreCatchers() {
    for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    swapped.length = 0;
  }

  /**
   * @param {any} scene
   * @param {any} camera
   */
  function render(scene, camera) {
    ID_ON.value = pixel && target ? 1 : 0;
    if (!pixel || !target) {
      renderer.setRenderTarget(null);
      renderer.setClearColor(background, 1);
      renderer.clear();
      renderer.render(scene, camera);
      return;
    }
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    // (Inside the area alone, when there's one smaller than the target: outside it, the paper.)
    const x0 = Math.max(0, Math.min(target.width, area[0]));
    const y0 = Math.max(0, Math.min(target.height, area[1]));
    const x1 = Math.max(x0, Math.min(target.width, area[2]));
    const y1 = Math.max(y0, Math.min(target.height, area[3]));
    const part = x0 > 0 || y0 > 0 || x1 < target.width || y1 < target.height;
    target.scissorTest = part;
    if (part) target.scissor.set(x0, y0, x1 - x0, y1 - y0);
    renderer.setRenderTarget(target);
    renderer.setClearColor(background, 0);
    renderer.clear();
    swapCatchers(scene);
    try {
      renderer.render(scene, camera);
    } finally {
      restoreCatchers();
    }
    renderer.setRenderTarget(null);
    if (part) {
      renderer.setScissorTest(false);
      renderer.setClearColor(background, 1);
      renderer.clear();
      renderer.setScissor(x0, y0, x1 - x0, y1 - y0);
      renderer.setScissorTest(true);
    }
    renderer.render(post, postCamera);
    if (part) renderer.setScissorTest(false);
  }

  /**
   * Compile the programs of the path the pass isn't drawing now, without stalling a frame (three's
   * compileAsync, KHR_parallel_shader_compile where the browser has it): while the pixels show,
   * the canvas's (its sRGB output, the floor's own ShadowMaterial); at Off, the colour target's
   * (the catcher in) and the post shader's. Without it the first switch either way linked them
   * mid-drag (about 95 ms on a phone with a cold program cache). Resolves once they're ready.
   * @param {any} scene
   * @param {any} camera
   * @returns {Promise<void>}
   */
  function warm(scene, camera) {
    if (typeof renderer.compileAsync !== 'function' || !target) return Promise.resolve();
    const was = renderer.getRenderTarget();
    /** @type {Promise<unknown>[]} */
    const jobs = [];
    try {
      if (pixel) {
        renderer.setRenderTarget(null);
        jobs.push(renderer.compileAsync(scene, camera));
      } else {
        renderer.setRenderTarget(target);
        swapCatchers(scene);
        try {
          jobs.push(renderer.compileAsync(scene, camera));
        } finally {
          restoreCatchers();
        }
        renderer.setRenderTarget(null);
        jobs.push(renderer.compileAsync(post, postCamera));
      }
    } finally {
      renderer.setRenderTarget(was);
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /**
   * The boxes the post shader keeps its loops to (subjectBoxes), or null: the whole target.
   * @param {{ring: number[], shade: number[], area?: number[]}|null} boxes
   */
  function setBoxes(boxes) {
    u.uRingBox.value.fromArray(boxes?.ring ?? ALL);
    u.uShadeBox.value.fromArray(boxes?.shade ?? ALL);
    for (let i = 0; i < 4; i++) area[i] = (boxes?.area ?? ALL)[i];
  }

  /**
   * The pointer on NEWT: 0 off to 1 full (main.js eases it), here and in his materials (Off).
   * @param {number} k
   */
  function setHover(k) {
    const v = Math.min(1, Math.max(0, Number(k) || 0));
    u.uHover.value = v;
    HOVER.value = v;
  }

  /**
   * The grab ring: where (client px, as the canvas shows), its radius (texels) and strength (0
   * gone to 1 full); none until the pass has a target and the canvas a size.
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @param {number} k
   */
  function setBurst(x, y, r, k) {
    const b = u.uBurst.value;
    const rect = renderer.domElement?.getBoundingClientRect?.();
    if (!target || !rect || !(rect.width > 0) || !(rect.height > 0) || !(k > 0)) {
      b.w = 0;
      return;
    }
    // (gl_FragCoord's texel centres, y up.)
    const tx = Math.floor(((x - rect.left) / rect.width) * target.width) + 0.5;
    const ty = Math.floor((1 - (y - rect.top) / rect.height) * target.height) + 0.5;
    b.set(tx, ty, Math.max(0, r), Math.min(1, k));
  }

  return {
    setSize,
    setParams,
    setBoxes,
    setHover,
    setBurst,
    render,
    warm,
    get pixel() {
      return pixel;
    },
    /** The post shader's uniforms (for the tests and a look at them in the console). */
    get uniforms() {
      return u;
    },
    dispose() {
      target?.depthTexture?.dispose();
      target?.dispose();
      material.dispose();
      catcher.dispose();
      quad.geometry.dispose();
    },
  };
}
