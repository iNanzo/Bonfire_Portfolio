// The dissolve's shader helpers, shared by everything that burns away and forms again in
// ember edges (the weapons' swap, the knights' summoning and helmet swaps): a screen-locked
// Bayer dither and a smooth value noise in object space. Pasted into a fragment shader.
export const DISSOLVE_CHUNK = /* glsl */ `
  float wBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float wBayer4(vec2 a) { return wBayer2(0.5 * a) * 0.25 + wBayer2(a); }
  float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float wNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;
