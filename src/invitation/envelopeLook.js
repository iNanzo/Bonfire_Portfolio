// The envelope's look (envelopeScene.js, envelopeSeal.js): the reference's palette, the toy's ink
// for its lines, the parts' order for those lines (IDS), and the one toon material everything on
// it is drawn with: flat-shaded in three tones with dithered band edges, drawn either in its
// colours or as its part's id (the scene draws both and lines the borders between parts), and
// dissolving as the letter goes: a smooth noise and a screen-locked 4×4 Bayer dither over how
// far up the letter it is (envelope.js DISSOLVE runs the same sums), with a burning rim, hot to
// glowing to charred, at the edge, like a weapon's on the Bonfire site (copied, not imported:
// the page takes no shared modules). The wax seal's material also stamps the monogram into it
// (SEAL: envelopeSeal.js).
import * as THREE from 'three';
import { DISSOLVE } from './envelope.js';

/**
 * sRGB hex as a vec3's components (the shaders write them as they are).
 * @param {number} hex
 */
export const rgb = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/** The reference's palette: light, mid, shade. */
export const PAPER = [0xf1d786, 0xe4b85d, 0xd3983d];
export const INSIDE = [0xc99a48, 0xb0803a, 0x8f6127];
export const WAX = [0xcd5e58, 0xa13a25, 0x6e1511];
export const PETAL = [0xe44544, 0xac2e29, 0x851d1b];
/** The toy's ink (invitation.css --inv-ink): the lines round it and down its folds. */
export const INK = 0x3a332d;
/** The burning rim as it dissolves: glowing, ember, charred (dark enough to read on the white page). */
const RIM = [0xffb43c, 0xe0582a, 0x5a3418];

/**
 * The parts, back to front: a line goes on the texels of a part that border one later in this
 * order (so on the paper round the silhouette, 0, and on the lower side of every fold).
 */
export const IDS = { body: 1, inside: 2, left: 3, right: 4, bottom: 5, flap: 6, seal: 7, petal: 8 };

export const BAYER = /* glsl */ `
  float bayer(vec2 p) {
    const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    ivec2 i = ivec2(mod(floor(p), 4.0));
    return (B[i.y * 4 + i.x] + 0.5) / 16.0;
  }
`;

/** envelope.js dissolveAt, in GLSL (the same hash, noise and sums). */
const DISSOLVE_GLSL = /* glsl */ `
  float eHash(vec2 p) { p = fract(p * 0.3183099 + 0.1) * 17.0; return fract(p.x * p.y * (p.x + p.y)); }
  float eNoise(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(eHash(i), eHash(i + vec2(1.0, 0.0)), f.x), mix(eHash(i + vec2(0.0, 1.0)), eHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float letterValue(vec2 q) {
    float h = clamp((q.y + q.x * ${DISSOLVE.lean.toFixed(4)}) / ${(1 + DISSOLVE.lean).toFixed(4)} * 0.5 + 0.5, 0.0, 1.0);
    return h * ${DISSOLVE.rise.toFixed(4)} + eNoise((q + vec2(1.3, 2.1)) * ${DISSOLVE.scale.toFixed(4)}) * ${(1 - DISSOLVE.rise).toFixed(4)};
  }
`;

/** The vec3 literal of an sRGB hex. */
const vec3Of = (hex) => {
  const c = rgb(hex);
  return `vec3(${c.x.toFixed(4)}, ${c.y.toFixed(4)}, ${c.z.toFixed(4)})`;
};

/**
 * The uniforms every part shares: the light (view space), the dissolve (0..1) and its edge
 * (DISSOLVE.edge of it), the world to the letter's own −1…1 units, and whether this pass draws
 * ids (1) or colours (0).
 */
export const shared = () => ({
  uLight: { value: new THREE.Vector3(-0.5, 0.62, 0.6).normalize() },
  uDissolve: { value: 0 },
  uEdge: { value: 0 },
  uToLetter: { value: new THREE.Matrix4() },
  uIdPass: { value: 0 },
});

/**
 * The toon material: three tones, flat-shaded, band edges dithered on the texel grid; drawn as
 * its colours or as `id`; dissolving with the letter. `extra` adds uniforms, `defines` (SEAL)
 * and GLSL for the seal's stamp.
 * @param {number[]} tones  light, mid, shade (sRGB hex)
 * @param {ReturnType<typeof shared>} u
 * @param {number} id  IDS
 * @param {{uniforms?: Record<string, {value: any}>, defines?: Record<string, string>, glsl?: string}} [extra]
 */
export function toon(tones, u, id, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uTones: { value: tones.map(rgb) }, uId: { value: id }, ...extra.uniforms },
    defines: extra.defines ?? {},
    vertexShader: /* glsl */ `
      uniform mat4 uToLetter;
      varying vec3 vView;
      varying vec2 vLetter;
      varying vec3 vLocal;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vLocal = position;
        vec4 w = modelMatrix * p;
        vLetter = (uToLetter * w).xy;
        vec4 mv = viewMatrix * w;
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTones[3];
      uniform vec3 uLight;
      uniform float uDissolve;
      uniform float uEdge;
      uniform float uIdPass;
      uniform float uId;
      varying vec3 vView;
      varying vec2 vLetter;
      varying vec3 vLocal;
      ${BAYER}
      ${DISSOLVE_GLSL}
      ${extra.glsl ?? ''}
      void main() {
        float b = bayer(gl_FragCoord.xy);
        #ifdef SEAL
        if (sealClipped(vLocal.xy)) discard;
        #endif
        float e = 1.0;
        if (uDissolve > 0.0) {
          e = letterValue(vLetter) + (b - 0.5) * ${DISSOLVE.dither.toFixed(4)} - uEdge;
          if (e < 0.0) discard;
        }
        if (uIdPass > 0.5) {
          // (Green marks the dissolving rim: no line goes round it.)
          gl_FragColor = vec4(uId / 255.0, uDissolve > 0.0 && e < 0.16 ? 1.0 : 0.0, 0.0, 1.0);
          return;
        }
        vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
        float v = dot(n, uLight) + (b - 0.5) * 0.06;
        vec3 c = v > 0.74 ? uTones[0] : v > 0.4 ? uTones[1] : uTones[2];
        #ifdef SEAL
        c = sealStamp(vLocal.xy, c);
        #endif
        if (uDissolve > 0.0) {
          if (e < 0.02) c = ${vec3Of(RIM[0])};
          else if (e < 0.045) c = ${vec3Of(RIM[1])};
          else if (e < 0.08) c = ${vec3Of(RIM[2])};
        }
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}
