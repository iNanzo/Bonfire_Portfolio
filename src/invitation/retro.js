// The invitation toy's retro pass: the scene drawn at texel size into a colour target with a
// depth texture, then one post shader to the canvas. The scene is NEWT on a white page: the
// background is the preset's paper colour and the floor is a shadow catcher (a ShadowMaterial)
// that only shows his shadows, so the post shader treats three kinds of texel:
//   - the paper (nothing drawn): exactly the preset's background, never graded or dithered, so
//     the floor never shows an edge or a horizon;
//   - the floor: the paper again, darkened toward the preset's shadow colour by his shadow (its
//     coverage softened over `shadow.soft` texels and dithered into `shadow.steps` tones, or
//     left hard), and by whatever is drawn over it (the blob shadow, the marker);
//   - NEWT: graded (lift, gamma, saturation, tint, exposure), lined, then quantized to
//     `levels` a channel with the 4×4 Bayer dither.
// Lines (Outlines) are only ever on or around NEWT: on his own edge texels where the surface or
// the depth changes (the DS's edge marking), or with `outline.outside` on the paper texels
// just outside his silhouette, as a darker shade of his colour there (a sprite's outline).
// The floor, the shadow and the paper make none.
//
// The floor: drawn into the colour target, any ShadowMaterial in the scene is swapped for the
// pass's catcher, which writes the shadow's coverage into the colour's alpha beside the floor's
// surface id (ID.floor + SHADE_SPAN × coverage, over ID_SCALE) and white into the colour, so
// the post shader composes the shadow itself. Pixel Size Off skips the pass and draws the scene
// straight to the canvas at the screen's resolution, the ShadowMaterial as it is (the paper as
// the clear colour); Native keeps the pass, a texel a device pixel. The toon materials write their surface id into alpha too (markId), and in the colour
// target sample their textures a coarser mip by the preset's `texture.mipBias` (at a few hundred
// texels his shirt's pattern aliases into a grey patchwork; the toon bands should shade him, not
// the texture's noise). Things drawn over the floor (the blob, the marker) write no depth and
// keep the id under them (decalMaterial); in the colour target they're flat pixel shapes, their
// map's alpha cut at DECAL_CUT and drawn at the material's opacity, like his hard shadow (a
// smooth falloff reads as a smudge on the white page).
import * as THREE from 'three';
import { floorLook } from './floor.js';
import { BAYER4 } from './pixels.js';

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
/** A decal's map alpha under this is outside its shape (in the colour target). */
export const DECAL_CUT = 0.3;

/**
 * The pass's own optional knobs a look preset may carry beside LookPreset's (looks/*.js type
 * themselves as LookPreset & RetroExtras).
 * @typedef {object} RetroExtras
 * @property {{soft?: number, steps?: number, dither?: number}} shadow  soft: texels the
 *   shadow's edge spreads over (0: hard); steps: tones it's dithered into (0: smooth);
 *   dither: how much the Bayer dither moves those steps, 0..1
 * @property {{outside?: boolean}} outline  lines on the paper just outside NEWT, not on his edge
 * @property {{mipBias?: number, fineMipBias?: number}} [texture]  mipBias: how many mip levels
 *   coarser his textures are sampled with the pixel filter on (0: as three picks); fineMipBias:
 *   his atlas's once he's character.js ORIGINAL_ATLAS_TEXELS tall or more (the glb's plaid at a
 *   fine resolution; mipBias without it)
 */

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
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float uMapBias;\nuniform float uSurfaceId;\nuniform float uIdOn;\nvoid main() {',
      )
      .replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n\tvec4 sampledDiffuseColor = texture2D( map, vMapUv, uMapBias );\n\tdiffuseColor *= sampledDiffuseColor;\n#endif',
      )
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n\tgl_FragColor.a = mix(1.0, uSurfaceId, uIdOn);',
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

/**
 * The toon materials' gradient map: one texel a band, nearest, so the light falls in steps.
 * @param {number[]} bands  dark to light, 0..1
 */
export function toonGradient(bands) {
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((v, i) =>
    data.set(
      [1, 1, 1, 1].map((k) => Math.round(Math.min(1, Math.max(0, v * k)) * 255)),
      i * 4,
    ),
  );
  const t = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
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
const fragmentShader = /* glsl */ `
  #include <packing>
  #define ID_SCALE ${ID_SCALE.toFixed(1)}
  #define NEWT ${ID.newt.toFixed(1)}
  #define FLOOR ${ID.floor.toFixed(1)}
  #define SPAN ${SHADE_SPAN.toFixed(2)}
  #define MAX_SOFT ${MAX_SOFT}
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
  uniform vec3 uTint;
  uniform vec3 uPaper;
  uniform vec3 uShade;
  uniform float uShadeAmount;
  uniform float uShadeSoft;
  uniform float uShadeSteps;
  uniform float uShadeDither;

  const vec2 STEPS[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));

  vec4 at(vec2 p) { return texture2D(tColor, p / uRes); }
  bool inside(vec2 p) { return p.x >= 0.0 && p.y >= 0.0 && p.x < uRes.x && p.y < uRes.y; }
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
  // The floor's shadow coverage around p, averaged over the floor texels of a disc uShadeSoft
  // texels in radius (its own coverage when that's 0).
  float softShade(vec2 p, float own) {
    if (uShadeSoft < 0.5) return own;
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
      gl_FragColor = vec4(quantize(col, d * uDither), 1.0);
      return;
    }
    // The paper, or the floor: the paper under his shadow and what's drawn over it, quantized
    // without the dither (the shadow's flat tones stay flat as the camera turns: a screen-space
    // pattern over them would crawl), or a line just outside him, dithered as he is.
    vec3 col = uPaper;
    bool marked = false;
    float dd = 0.0;
    float own = shadeOf(src);
    if (own >= 0.0) {
      float amount = softShade(p, own);
      if (uShadeSteps > 0.5)
        amount = clamp(floor(amount * uShadeSteps + 0.5 + d * uShadeDither) / uShadeSteps, 0.0, 1.0);
      col = mix(col * toSRGB(src.rgb), uShade, amount * uShadeAmount);
      marked = amount > 0.0 || any(lessThan(src.rgb, vec3(1.0)));
    }
    if (uOutline > 0.5 && uOutside > 0.5)
      for (int k = 0; k < 4; k++) {
        vec2 n = p + STEPS[k];
        if (!isNewt(n)) continue;
        col = grade(at(n).rgb) * uInk * (1.0 - uDarken);
        marked = true;
        dd = d * uDither;
        break;
      }
    // (Untouched paper stays exactly the paper.)
    gl_FragColor = vec4(marked ? quantize(col, dd) : col, 1.0);
  }
`;

/**
 * The pass, on `renderer`: setSize(w, h) in texels, setParams(preset, look), render(scene,
 * camera) (the colour pass into the target, the post pass to the canvas; Pixel Size Off: the
 * scene straight to the canvas), dispose().
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
      uTint: { value: new THREE.Color(1, 1, 1) },
      uPaper: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0, 0, 0) },
      uShadeAmount: { value: 0.3 },
      uShadeSoft: { value: 0 },
      uShadeSteps: { value: 0 },
      uShadeDither: { value: 1 },
    },
    vertexShader,
    fragmentShader,
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
    u.uInk.value.copy(srgb(preset.outline.tint));
    u.uLift.value = preset.grade.lift;
    u.uGamma.value = preset.grade.gamma;
    u.uSat.value = preset.grade.saturation;
    u.uExposure.value = preset.grade.exposure;
    u.uTint.value.copy(srgb(preset.grade.tint));
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
    renderer.render(post, postCamera);
  }

  return {
    setSize,
    setParams,
    render,
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
