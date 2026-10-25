// The envelope's look (envelopeScene.js, envelopeSeal.js): the reference's palette (three tones a
// material), the toy's ink for its lines, the envelope's shape (envelopeLayout: a rectangle, a
// straight flap V to a tip under the seal's middle, and one pocket whose mouth is tucked under
// it, so closed its only lines are the outline and the V, and open the pocket's mouth shows), the
// parts' order for those lines (IDS), the light, and the one toon material
// everything on it is drawn with: flat-shaded in three tones (the paper one flat tone a face, each
// face lit as the rest pose has it (REST, paperLit) and leaning into the light by its LEAN, so it
// keeps one band through the sway and the letter's turn; the petals' band
// edges dithered), drawn either in its colours or as its part's id (the scene draws both and
// lines the borders between parts), and dissolving as the letter goes: a smooth noise and a
// screen-locked 4×4 Bayer dither over how far up the letter it is (envelope.js DISSOLVE runs the
// same sums), with a burning rim, hot to glowing to charred, at the edge, like a weapon's on the
// Bonfire site (copied, not imported: the page takes no shared modules). The wax seal's material
// draws its face from a texture, texel for texel on the screen (SEAL: envelopeSeal.js). PETAL is
// the petals' three reds (petalScene.js draws them with a material of its own).
import * as THREE from 'three';
import { DISSOLVE } from './envelope.js';

/**
 * sRGB hex as a vec3's components (the shaders write them as they are).
 * @param {number} hex
 */
export const rgb = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/** The reference's palette, three tones a material: light, mid, shade. */
export const PAPER = [0xf1d786, 0xe4b85d, 0xd3983d];
/** The paper's three a step brighter: how it shows at the hover's peak (envelope.js hoverLook). */
export const PAPER_LIT = [0xfbe9ac, 0xf0cd7a, 0xe2ad55];
export const WAX = [0xd24b52, 0x96151f, 0x5a0a12];
export const PETAL = [0xe44544, 0xac2e29, 0x851d1b];
/** The toy's ink (invitation.css --inv-ink): the lines round it and along the flap's V. */
export const INK = 0x3a332d;
/** The hover pulse's gold (retro.js HOVER_INK, NEWT's hover: copied, so it reads as the same). */
export const HOVER = 0xe0a53a;
/** The hover rim's shine on the letter's own edge: a warm white (the gold alone barely shows on the gold paper). */
export const SHINE = 0xfff4d6;
/** The hover's glow next to the letter's line: a brighter gold than HOVER, further out. */
export const GLOW = 0xffcf5a;
/** The burning rim as it dissolves: glowing, ember, charred (dark enough to read on the white page). */
const RIM = [0xffb43c, 0xe0582a, 0x5a3418];

/**
 * The parts, back to front: a line goes on the texels of a part that border one later in this
 * order (so on the paper round the silhouette, 0, and on the inside along the pocket's mouth).
 * The petals' shapes take `petal` and the two after it, so a line runs where two shapes overlap.
 */
export const IDS = { body: 1, inside: 2, pocket: 3, flap: 4, seal: 5, petal: 6 };

/** How the envelope leans, radians: clockwise (the reference's lean), and its top tipped back. */
export const TILT = -0.36;
export const PITCH = -0.12;

/**
 * The letter's rest pose (TILT and PITCH, as the scene turns it) as a rotation: the paper's flat
 * faces are lit as this pose has them (paperLit), so the sway and the letter's turn never change
 * their tones.
 */
export const REST = new THREE.Matrix3().setFromMatrix4(
  new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(PITCH, 0, TILT)),
);

/** The light (view space, a unit vector): from the upper left, in front. */
export const LIGHT = (() => {
  const [x, y, z] = [-0.5, 0.62, 0.6];
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
})();
/**
 * How lit a paper face is (its normal on the light, before its LEAN): its normal in the letter's
 * own frame (`n`, a unit vector), turned by the rest pose (REST). The toon material runs the same
 * sums for FLAT.
 * @param {THREE.Vector3} n
 */
export function paperLit(n) {
  const r = n.clone().applyMatrix3(REST);
  return r.x * LIGHT[0] + r.y * LIGHT[1] + r.z * LIGHT[2];
}
/** The bands: a face lit more than `light` takes the light tone, more than `mid` the mid, else the shade. */
export const SHADES = { light: 0.74, mid: 0.4 };
/**
 * The band (0 light, 1 mid, 2 shade) of a face lit `v` (its normal on the light). The seal's
 * face (envelopeSeal.js) and the toon material run the same sums.
 * @param {number} v
 */
export const bandOf = (v) => (v > SHADES.light ? 0 : v > SHADES.mid ? 1 : 2);
/**
 * How far each paper face leans into the light, as drawn (added to its lighting): the paper's
 * faces are nearly flat to the screen, so each is given its tone (the flap light, the pocket mid,
 * the inside, in the pocket's shadow, shade) and keeps it, well inside its band, all through the
 * sway. The back of the paper (the flap's, once it's open) takes the inside's.
 */
export const LEAN = { body: -0.1, inside: -0.42, pocket: -0.1, flap: 0.2 };

/** The seal's radius, a share of the letter's width (big enough for its stamp to read). */
export const SEAL_SIZE = 0.2;

/** The envelope's shape: its aspect, the flap's depth and the pocket's mouth's (of its height). */
const SHAPE = { aspect: 1.45, flap: 0.58, mouth: 0.25 };

/**
 * How far in front of the paper's face (T / 2) the inside and the pocket sit, the layout's units:
 * the pocket a little way in front of the inside, so petals pouring between them (petals.js
 * LETTER_DEPTHS) show over the inside and hide behind the pocket till they rise out of its mouth.
 */
export const DEPTH = { inside: 0.004, pocket: 0.05 };

/**
 * The envelope's parts as flat polygons (each counter-clockwise, [x, y]), built to a width of 2
 * with the flap closed: the body; the inside of the pocket (it shows as the flap lifts); the
 * pocket, one piece, its mouth a shallow V from its top corners tucked under the flap; and the
 * flap, a straight V from the top corners to its `tip`. Closed, no line runs anywhere but the
 * outline and the flap's V (the user circled the folds' lines to go, 2026-10-25); open, the
 * pocket's mouth shows over the inside. The seal sits on the tip.
 */
export function envelopeLayout() {
  const W = 2;
  const H = W / SHAPE.aspect;
  const w = W / 2;
  const h = H / 2;
  const tip = [0, h - H * SHAPE.flap];
  const meet = h - H * SHAPE.mouth;
  return {
    W,
    H,
    T: 0.03,
    tip,
    seal: { x: tip[0], y: tip[1], r: SEAL_SIZE * W },
    parts: {
      body: [
        [-w, -h],
        [w, -h],
        [w, h],
        [-w, h],
      ],
      inside: [
        [-w, h],
        [0, meet - H * 0.05],
        [w, h],
      ],
      // (A fan from its mouth's foot: the scene's pieces are fans from their first point.)
      pocket: [
        [0, meet],
        [-w, h],
        [-w, -h],
        [w, -h],
        [w, h],
      ],
      flap: [[-w, h], tip, [w, h]],
    },
  };
}

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
 * (DISSOLVE.edge of it), the world to the letter's own −1…1 units, the world to the letter's own
 * frame (unscaled: the paper's normals are taken there), and whether this pass draws ids (1) or
 * colours (0).
 */
export const shared = () => ({
  uLight: { value: new THREE.Vector3(...LIGHT) },
  uDissolve: { value: 0 },
  uEdge: { value: 0 },
  uToLetter: { value: new THREE.Matrix4() },
  uToInner: { value: new THREE.Matrix4() },
  uIdPass: { value: 0 },
  uBright: { value: 0 },
});

/**
 * The toon material: three tones, flat-shaded, band edges dithered on the texel grid; drawn as
 * its colours or as `id`; dissolving with the letter. `extra` adds uniforms, `defines` (SEAL)
 * and GLSL (the seal's sealFace(): its colour, alpha 0 off the wax); `lean` makes it the
 * paper's: FLAT, one tone a face and no dither, leaning into the light by that much (LEAN), and
 * lit as the rest pose has it (paperLit: its normal in the letter's own frame, turned by REST).
 * @param {number[]} tones  light, mid, shade (sRGB hex)
 * @param {ReturnType<typeof shared>} u
 * @param {number} id  IDS
 * @param {{uniforms?: Record<string, {value: any}>, defines?: Record<string, string>, glsl?: string, lean?: number, lit?: number[]}} [extra]
 */
export function toon(tones, u, id, extra = {}) {
  const flat = extra.lean !== undefined;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...u,
      uTones: { value: tones.map(rgb) },
      uId: { value: id },
      ...(flat
        ? { uLean: { value: extra.lean }, uRest: { value: REST }, uLit: { value: (extra.lit ?? tones).map(rgb) } }
        : {}),
      ...extra.uniforms,
    },
    defines: { ...(flat ? { FLAT: '' } : {}), ...extra.defines },
    vertexShader: /* glsl */ `
      uniform mat4 uToLetter;
      varying vec3 vView;
      varying vec2 vLetter;
      #ifdef FLAT
      uniform mat4 uToInner;
      varying vec3 vInner;
      #endif
      void main() {
        vec4 p = vec4(position, 1.0);
        vec4 w = modelMatrix * p;
        vLetter = (uToLetter * w).xy;
        #ifdef FLAT
        vInner = (uToInner * w).xyz;
        #endif
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
      uniform float uBright;
      #ifdef FLAT
      uniform float uLean;
      uniform mat3 uRest;
      uniform vec3 uLit[3];
      varying vec3 vInner;
      #endif
      varying vec3 vView;
      varying vec2 vLetter;
      ${BAYER}
      ${DISSOLVE_GLSL}
      ${extra.glsl ?? ''}
      void main() {
        float b = bayer(gl_FragCoord.xy);
        float e = 1.0;
        if (uDissolve > 0.0) {
          e = letterValue(vLetter) + (b - 0.5) * ${DISSOLVE.dither.toFixed(4)} - uEdge;
          if (e < 0.0) discard;
        }
        #ifdef SEAL
        vec4 face = sealFace();
        if (face.a < 0.5) discard;
        #endif
        if (uIdPass > 0.5) {
          // (Green marks the dissolving rim: no line goes round it.)
          gl_FragColor = vec4(uId / 255.0, uDissolve > 0.0 && e < 0.16 ? 1.0 : 0.0, 0.0, 1.0);
          return;
        }
        #ifdef FLAT
        // (Its normal in the letter's own frame, lit as the rest pose has it: the sway and the
        // turn never change its tone. The paper's back, once the flap's open, takes the inside's.)
        vec3 n = uRest * normalize(cross(dFdx(vInner), dFdy(vInner)));
        float v = dot(n, uLight) + (gl_FrontFacing ? uLean : ${LEAN.inside.toFixed(4)});
        #else
        vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
        float v = dot(n, uLight) + (b - 0.5) * 0.06;
        #endif
        float band = v > ${SHADES.light.toFixed(4)} ? 0.0 : v > ${SHADES.mid.toFixed(4)} ? 1.0 : 2.0;
        vec3 c = band < 0.5 ? uTones[0] : band < 1.5 ? uTones[1] : uTones[2];
        #ifdef FLAT
        // (The hover's peak: each tone a step brighter, dithered in.)
        if (uBright > 0.0 && b < uBright) c = band < 0.5 ? uLit[0] : band < 1.5 ? uLit[1] : uLit[2];
        #endif
        #ifdef SEAL
        c = face.rgb;
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
