// The invitation toy's retro pass: the scene drawn at texel size into a colour target with a
// depth texture, then one post shader to the canvas:
//   1. a 1-texel line where the depth jumps (on the nearer surface: a second difference of 1/z,
//      so a plane seen at a slant never makes one) or where the surface id changes (the toon
//      materials write it into the colour's alpha, markId: no normals pass, which would line
//      every facet), drawn as a darker shade of the pixel (the preset's darken and tint);
//   2. a light grade (lift, gamma, saturation, tint, exposure) in sRGB;
//   3. per-channel quantization to `levels` with the 4×4 Bayer dither (strength).
// Every value comes from the look preset (looks/*.js) and the Look settings: Dithering and
// Outlines switch their parts off; Pixel Size Off skips the pass and draws the scene straight
// to the canvas at native size. Things drawn over the floor (the blob shadow, the marker) write
// no depth and keep the id (decalMaterial), so they make no lines.
import * as THREE from 'three';
import { BAYER4 } from './pixels.js';

/** Surface ids (written into the colour's alpha as id / ID_SCALE; 0 is nothing drawn). */
export const ID = { newt: 1, floor: 2, wall: 3, side: 4, baseboard: 5 };
const ID_SCALE = 16;
/**
 * Whether the ids are written (one uniform every marked material shares): only into the colour
 * target. Drawn straight to the canvas (Pixel Size Off) the alpha stays 1, or the page would
 * show through: three's canvas always has an alpha channel.
 */
const ID_ON = { value: 1 };

/**
 * Make a material write its surface id into the colour's alpha (for the retro pass's lines).
 * @template T
 * @param {T} material  a built-in three.js material
 * @param {number} id  ID's
 * @returns {T}
 */
export function markId(material, id) {
  const m = /** @type {any} */ (material);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceId = { value: id / ID_SCALE };
    shader.uniforms.uIdOn = ID_ON;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSurfaceId;\nuniform float uIdOn;\nvoid main() {')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n\tgl_FragColor.a = mix(1.0, uSurfaceId, uIdOn);',
      );
  };
  // (One program for every id: the id is a uniform. Without a key three would share the
  // material type's own program, which has no such uniform.)
  m.customProgramCacheKey = () => 'invitation-surface-id';
  return material;
}

/**
 * A material for what's drawn over the floor: blended, no depth written, the colour target's
 * alpha (the surface id under it) left as it was.
 * @param {object} params  MeshBasicMaterial's
 */
export function decalMaterial(params) {
  return new THREE.MeshBasicMaterial({
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

/** A hex colour as a linear THREE.Color's sRGB components (the grade works in sRGB). */
const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace).convertLinearToSRGB();

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const fragmentShader = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float uLevels;
  uniform float uDither;
  uniform float uBayer[16];
  uniform float uOutline;
  uniform float uEdgeDepth;
  uniform float uDarken;
  uniform vec3 uInk;
  uniform float uLift;
  uniform float uGamma;
  uniform float uSat;
  uniform float uExposure;
  uniform vec3 uTint;

  // 1 / view depth: on a plane it changes linearly across the screen, so a second difference
  // of it is ~0 anywhere but where the depth jumps.
  float invDepth(vec2 p) {
    return -1.0 / perspectiveDepthToViewZ(texture2D(tDepth, p / uRes).x, cameraNear, cameraFar);
  }
  float surfaceId(vec2 p) { return floor(texture2D(tColor, p / uRes).a * ${ID_SCALE.toFixed(1)} + 0.5); }
  vec3 toSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float bayer(vec2 p) {
    ivec2 i = ivec2(mod(floor(p), 4.0));
    return uBayer[i.y * 4 + i.x];
  }
  // Whether this texel takes a line: a neighbour sits further than the surface through this
  // texel and the opposite one predicts (by more than uEdgeDepth of it), or it's a different
  // surface and this one's the nearer (the higher id on a tie).
  bool edge(vec2 p) {
    float w = invDepth(p);
    float id = surfaceId(p);
    vec2 steps[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));
    for (int k = 0; k < 4; k++) {
      vec2 n = p + steps[k];
      vec2 o = p - steps[k];
      if (n.x < 0.0 || n.y < 0.0 || n.x > uRes.x || n.y > uRes.y) continue;
      float wn = invDepth(n);
      float wo = (o.x < 0.0 || o.y < 0.0 || o.x > uRes.x || o.y > uRes.y) ? w : invDepth(o);
      if ((2.0 * w - wo) - wn > uEdgeDepth * w) return true;
      float idn = surfaceId(n);
      if (idn != id && (w > wn || (w == wn && id > idn))) return true;
    }
    return false;
  }

  void main() {
    vec2 p = gl_FragCoord.xy;
    vec3 col = toSRGB(texture2D(tColor, p / uRes).rgb * uExposure);
    col = uLift + col * (1.0 - uLift);
    col = pow(max(col, 0.0), vec3(1.0 / uGamma));
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uSat) * uTint;
    if (uOutline > 0.5 && edge(p)) col *= uInk * (1.0 - uDarken);
    float d = (bayer(p) - 0.5) * uDither;
    col = floor(clamp(col, 0.0, 1.0) * (uLevels - 1.0) + 0.5 + d) / (uLevels - 1.0);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
      uEdgeDepth: { value: 0.002 },
      uDarken: { value: 0.4 },
      uInk: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: 0 },
      uGamma: { value: 1 },
      uSat: { value: 1 },
      uExposure: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
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
  /** @type {any} */
  let target = null;
  let pixel = true;
  const background = new THREE.Color();

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
   * @param {import('./look.js').LookPreset} preset
   * @param {import('./look.js').Look} look
   */
  function setParams(preset, look) {
    pixel = look.pixelSize !== 'off';
    u.uLevels.value = preset.levels;
    u.uDither.value = look.dither ? preset.dither : 0;
    u.uOutline.value = look.outlines ? 1 : 0;
    u.uEdgeDepth.value = preset.outline.depth;
    u.uDarken.value = preset.outline.darken;
    u.uInk.value.copy(srgb(preset.outline.tint));
    u.uLift.value = preset.grade.lift;
    u.uGamma.value = preset.grade.gamma;
    u.uSat.value = preset.grade.saturation;
    u.uExposure.value = preset.grade.exposure;
    u.uTint.value.copy(srgb(preset.grade.tint));
    background.setStyle(preset.room.background, THREE.SRGBColorSpace);
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
    renderer.render(scene, camera);
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
      quad.geometry.dispose();
    },
  };
}
