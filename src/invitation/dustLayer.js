// The dust NEWT raises when he lands, drawn (dust.js moves it; stage.js owns this, on its decal
// layer: rays and the shadow pass leave it out). One instanced quad a puff, each turned to face
// the camera (a billboard in view space) and sized to its radius, its middle never lower than its
// radius so no corner dips under the floor. Like the blob and the marker it writes no depth and
// leaves the colour target's alpha (the surface id under it) as it was, so the retro pass draws
// it as part of the floor (or of NEWT, where a puff is in front of him) and it takes no lines;
// his depth still hides the puffs behind him. In the colour target a puff is a pixel shape: each
// texel is in where its cover (the puff's strength, full in its core and thinning to its rim)
// beats the texel's 4×4 Bayer threshold (pixels.js BAYER4), so it fades by dithering away, in the
// retro look, drawn in the look's warm marker colour at DUST_INK.opacity over the paper. Drawn
// straight to the canvas (Pixel Size Off), its cover is a smooth alpha instead. The mesh stays in
// the scene with no puffs to draw (instanceCount 0), so the retro pass's warm-up compiles its
// programs before the first landing ever needs them.
import * as THREE from 'three';
import { BAYER4 } from './pixels.js';

/** The most puffs it draws (dust.js DUST.max keeps to it). */
export const DUST_PUFFS = 32;
/** How strong a puff's texels are over the paper, 0..1. */
export const DUST_INK = { opacity: 0.85 };

const VERTEX = /* glsl */ `
  attribute vec4 aPuff;
  attribute float aCover;
  varying vec2 vAt;
  varying float vCover;
  void main() {
    vAt = position.xy * 2.0;
    vCover = aCover;
    vec4 mv = viewMatrix * vec4(aPuff.xyz, 1.0);
    mv.xy += position.xy * 2.0 * aPuff.w;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPixel;
  uniform float uBayer[16];
  varying vec2 vAt;
  varying float vCover;
  float bayer(vec2 p) {
    ivec2 i = ivec2(mod(floor(p), 4.0));
    return uBayer[i.y * 4 + i.x];
  }
  void main() {
    float r = length(vAt);
    if (r > 1.0) discard;
    float cover = vCover * (1.0 - smoothstep(0.45, 1.0, r));
    if (uPixel > 0.5) {
      if (bayer(gl_FragCoord.xy) >= cover) discard;
      gl_FragColor = vec4(uColor, uOpacity);
    } else {
      gl_FragColor = vec4(uColor, uOpacity * cover);
    }
    #include <colorspace_fragment>
  }
`;

/**
 * The dust's mesh (add it to the scene on `layer`) and set(puffs) each frame.
 * @param {number} layer  the stage's decal layer
 */
export function createDustLayer(layer) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute('position', quad.getAttribute('position'));
  const puffs = new THREE.InstancedBufferAttribute(new Float32Array(DUST_PUFFS * 4), 4);
  const cover = new THREE.InstancedBufferAttribute(new Float32Array(DUST_PUFFS), 1);
  puffs.setUsage(THREE.DynamicDrawUsage);
  cover.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPuff', puffs);
  geometry.setAttribute('aCover', cover);
  geometry.instanceCount = 0;
  const uniforms = {
    uColor: { value: new THREE.Color(0x6f6457) },
    uOpacity: { value: DUST_INK.opacity },
    uPixel: { value: 1 },
    uBayer: { value: BAYER4 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // (Its colour over what's there; the target's alpha, the surface id, stays.)
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Dust';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.layers.set(layer);
  /** How many puffs it drew last, for ?test. */
  let shown = 0;

  return {
    mesh,
    /**
     * This frame's puffs (dust.js dustPuffs), the first DUST_PUFFS of them.
     * @param {readonly {x: number, y: number, z: number, r: number, a: number}[]} list
     */
    set(list) {
      const n = Math.min(DUST_PUFFS, list.length);
      for (let i = 0; i < n; i++) {
        const p = list[i];
        puffs.setXYZW(i, p.x, Math.max(p.y, p.r), p.z, p.r);
        cover.setX(i, p.a);
      }
      if (n || shown) {
        puffs.needsUpdate = true;
        cover.needsUpdate = true;
      }
      geometry.instanceCount = n;
      shown = n;
    },
    /**
     * The look's colour for it (the marker's warm grey, sRGB).
     * @param {string|number} color
     */
    setColor(color) {
      if (typeof color === 'number') uniforms.uColor.value.setHex(color, THREE.SRGBColorSpace);
      else uniforms.uColor.value.setStyle(color, THREE.SRGBColorSpace);
    },
    /**
     * Whether it's drawn into the retro pass's colour target (dithered) or straight to the canvas
     * (Pixel Size Off: a smooth alpha).
     * @param {boolean} on
     */
    setPixel(on) {
      uniforms.uPixel.value = on ? 1 : 0;
    },
    /** How many puffs it drew last. */
    get count() {
      return shown;
    },
    dispose() {
      quad.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
