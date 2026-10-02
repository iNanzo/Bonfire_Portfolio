// Crisp 1-texel additive lines (the ground shock ring on impact, the forge helix and
// silhouette echoes on a weapon swap), drawn in the fx pass with the particles'
// manual depth test and dithered transparency. Their wobble and flicker come from
// the fire's own simplex noise; ringNoise samples it seamlessly around a ring.
import * as THREE from 'three';
import { DITHER_GLSL } from './flame.js';

const vertexShader = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  varying vec3 vColor;
  varying float vAlpha;
  ${DITHER_GLSL}
  void main() {
    if (gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy / resolution).x + 0.00002) discard;
    if (vAlpha <= pBayer4(gl_FragCoord.xy)) discard;
    gl_FragColor = vec4(vColor, 0.0);
  }
`;

/** A LineSegments buffer of `vertices` points (pairs) on the fx layer's additive, depth-tested material. */
export function createRingLines(fxMaterial, vertices) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(vertices), 1));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { tDepth: fxMaterial.uniforms.tDepth, resolution: fxMaterial.uniforms.resolution },
      vertexShader,
      fragmentShader,
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
  lines.frustumCulled = false;
  return {
    lines,
    pos: geo.attributes.position.array,
    col: geo.attributes.color.array,
    alpha: geo.attributes.alpha.array,
    commit() {
      for (const a of ['position', 'color', 'alpha']) geo.attributes[a].needsUpdate = true;
    },
    clear() {
      geo.attributes.alpha.array.fill(0);
      geo.attributes.alpha.needsUpdate = true;
    },
  };
}

/** Seamless simplex noise around a ring (angle a), scrolled by t: −1..1. */
export const ringNoise = (noise, a, freq, t, seed = 0) =>
  noise.noise3d(Math.cos(a) * freq + seed, Math.sin(a) * freq - seed, t);
