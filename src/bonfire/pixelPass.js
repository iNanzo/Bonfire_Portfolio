// Final composite pass (low resolution):
//   solid geometry → outlines → + additive fire/spark layer → vignette →
//   ordered Bayer dither → quantize to the palette.
// The canvas is upscaled by CSS with nearest-neighbor filtering.
//
// Effects layer (the visualizer; all off on the site), all before the palette so every
// effect comes out in the scene's own colors:
//   where a pixel reads the scene from — a kaleidoscope, a mirror (horizontal: either
//     half copied onto the other; vertical: the top reflected down like a pool, or the
//     bottom up; or both, one quarter copied four ways), block crunch, a row
//     wave, a shockwave ripple out of the fire, rows torn sideways;
//   what's mixed in — an RGB split, echoes of the previous frame zooming out of (or into)
//     the fire, turning as they go for a spiral (feedback: they step down the palette as
//     they fade);
//   how it's framed — an iris around the fire, letterbox bars, scanlines (thin rows, thick
//     rows or columns), static;
//   how it's colored — a 1-bit ink flash (dithered to void and the flame's core), a
//     negative, and color cycling (the flame's ramp colors rotate, like old pixel-art
//     palette animation).
import * as THREE from 'three';

const MAX_COLORS = 16;

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  #include <packing>

  uniform sampler2D tColor;        // lit solid geometry (linear)
  uniform sampler2D tDepth;        // its depth
  uniform sampler2D tNormal;       // view-space normals, outlined geometry only
  uniform sampler2D tNormalDepth;  // depth, outlined geometry only
  uniform sampler2D tFx;           // additive fire + sparks (linear)
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;

  uniform vec3 palette[${MAX_COLORS}];
  uniform int paletteSize;
  uniform float ditherStrength;
  uniform float ditherScale;
  uniform float outlines;
  uniform float vignette;
  uniform float exposure;
  uniform vec3 uCore;              // the flame's pale core color (linear)

  // Glitch layer.
  uniform float uTime;
  uniform float uSlice;            // 0..1: how many rows tear sideways, and how far
  uniform float uSliceSeed;        // a new tear pattern per hit
  uniform float uSplit;            // RGB split, in texels
  uniform float uBlock;            // >= 1: pixels this many texels wide
  uniform float uWave;             // a sideways wave through the rows, in texels
  uniform float uMirror;           // x + 3y (0: off). x: 1 the left half copied right, 2 the right half left; y: 1 the top copied down, 2 the bottom up
  uniform float uScan;             // 0..1: how dark the scanlines are
  uniform float uScanMode;         // 0: every other row; 1: thick rows; 2: columns
  uniform float uNoise;            // 0..1: static
  uniform float uInvert;           // 0..1: the negative
  uniform sampler2D tPrev;         // the last frame (feedback)
  uniform float uFeedback;         // 0..1: how much of it echoes (0: off)
  uniform float uZoom;             // the echo zooms out of the fire by this much a frame (< 1: into it)
  uniform float uFeedRot;          // ...and turns by this much (radians a frame)
  uniform float uKaleido;          // mirrored segments (0: off)
  uniform float uKaleidoRot;
  uniform vec2 uCenter;            // the fire on screen, in texels
  uniform float uRippleR;          // shockwave radius, texels
  uniform float uRippleAmp;        // its push, texels (0: off)
  uniform float uIris;             // radius as a fraction of the height (>= 2: off)
  uniform float uLetterbox;        // bar height as a fraction of the height
  uniform float uInk;              // 0..1: the 1-bit look
  uniform float uCycle;            // 0..3: rotate the flame's ramp colors this many steps

  float linDepth(sampler2D t, vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(t, uv).x, cameraNear, cameraFar);
  }
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
  float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  vec3 toSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 toLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  float colorDist(vec3 a, vec3 b) {
    float rm = (a.r + b.r) * 0.5;
    vec3 d = a - b;
    return (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
  }
  vec3 quantize(vec3 c) {
    vec3 best = palette[0];
    float bestD = 1e9;
    int bestI = 0;
    for (int i = 0; i < ${MAX_COLORS}; i++) {
      if (i >= paletteSize) break;
      float d = colorDist(c, palette[i]);
      if (d < bestD) { bestD = d; best = palette[i]; bestI = i; }
    }
    // Color cycling: the flame's four ramp colors (palette 5–8) rotate.
    if (uCycle > 0.5 && bestI >= 5 && bestI <= 8) {
      int target = 5 + int(mod(float(bestI - 5) + floor(uCycle + 0.5), 4.0));
      for (int i = 5; i <= 8; i++) if (i == target) best = palette[i];
    }
    return best;
  }
  float normalEdge(vec3 n, vec3 nn, float d, float nd) {
    float normalIndicator = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0))), 0.0, 1.0);
    float depthIndicator = clamp(sign((nd - d) * 0.25 + 0.0025), 0.0, 1.0);
    return (1.0 - dot(n, nn)) * depthIndicator * normalIndicator;
  }

  // The scene at one texel: outlined geometry plus the fire, in sRGB (before vignette).
  vec3 shade(vec2 px) {
    vec2 texel = 1.0 / resolution;
    vec2 uv = (clamp(px, vec2(0.0), resolution - 1.0) + 0.5) * texel;

    vec3 col = toSRGB(texture2D(tColor, uv).rgb * exposure);

    vec4 nrm = texture2D(tNormal, uv);
    if (outlines > 0.5 && nrm.a > 0.5) {
      float d = linDepth(tNormalDepth, uv);
      float dMain = linDepth(tDepth, uv);
      if (dMain > d - 0.03 * d) {
        vec3 n = normalize(nrm.rgb * 2.0 - 1.0);
        vec2 offs[4];
        offs[0] = vec2(0.0, texel.y); offs[1] = vec2(0.0, -texel.y);
        offs[2] = vec2(texel.x, 0.0); offs[3] = vec2(-texel.x, 0.0);
        float depthEdge = 0.0;
        float nEdge = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 o = uv + offs[i];
          float nd = texture2D(tNormal, o).a > 0.5 ? linDepth(tNormalDepth, o) : cameraFar;
          depthEdge = max(depthEdge, nd - d);
          nEdge += normalEdge(n, normalize(texture2D(tNormal, o).rgb * 2.0 - 1.0), d, nd);
        }
        if (depthEdge > 0.06 + 0.02 * d) col = palette[0];
        else if (nEdge > 0.18) col = col * 1.45 + 0.035;
      }
    }

    // Fire + sparks add light on top of the (outlined) scene. Where they pile up
    // past full brightness, scale the whole color back instead of letting each
    // channel clip — clipping washes blues, purples, pinks and yellows out to
    // white; this keeps them their own color however dense the particles get.
    // The bonfire's own dense heart still burns white-hot (channels clip toward a
    // pale core: its two-tone look); fx alpha says how much of the light is bonfire.
    vec4 fx = texture2D(tFx, uv);
    vec3 lit = toLinear(col) + fx.rgb * exposure;
    float peak = max(lit.r, max(lit.g, lit.b));
    float heat = fx.a * exposure;
    if (peak > 1.0) lit = mix(lit / peak, min(lit, vec3(1.0)), smoothstep(0.5, 1.3, heat));
    // ...and its densest part glows in the flame's own core color, so every flame
    // gets the same two-tone look: body color below, a pale hot top.
    lit = mix(lit, max(lit, uCore), smoothstep(1.3, 2.6, heat) * 0.85);
    return toSRGB(lit);
  }

  void main() {
    vec2 px = floor(gl_FragCoord.xy);

    // Where this pixel reads the scene from.
    vec2 src = px;
    if (uKaleido > 0.5) {
      // Folded around the fire, from a wedge that looks up into the flames (zoomed in a little).
      vec2 p = src - uCenter;
      float seg = 6.2831853 / uKaleido;
      float a = mod(atan(p.y, p.x) + uKaleidoRot, seg);
      a = min(a, seg - a) + 1.5707963 - seg * 0.25;
      src = floor(uCenter + length(p) * 0.75 * vec2(cos(a), sin(a)));
    }
    if (uMirror > 0.5) {
      float m = floor(uMirror + 0.5);
      float mx = mod(m, 3.0);
      float my = floor(m / 3.0);
      if ((mx == 1.0 && src.x >= resolution.x * 0.5) || (mx == 2.0 && src.x < resolution.x * 0.5)) src.x = resolution.x - 1.0 - src.x;
      if ((my == 1.0 && src.y < resolution.y * 0.5) || (my == 2.0 && src.y >= resolution.y * 0.5)) src.y = resolution.y - 1.0 - src.y;
    }
    if (uBlock > 1.0) src = floor(src / uBlock) * uBlock + floor(uBlock * 0.5);
    if (uWave > 0.0) src.x += floor(sin(src.y * 0.11 + uTime * 7.0) * uWave + 0.5);
    float shock = 0.0;
    if (uRippleAmp > 0.0) {
      vec2 d = src - uCenter;
      float r = length(d);
      float w = r - uRippleR;
      shock = exp(-w * w / 60.0);
      src += (r > 0.5 ? d / r : vec2(0.0)) * shock * uRippleAmp * sin(w * 0.5);
      src = floor(src + 0.5);
    }
    if (uSlice > 0.0) {
      float rows = 2.0 + floor(h11(uSliceSeed) * 9.0);
      float band = floor(src.y / rows);
      if (h11(band * 1.37 + uSliceSeed) < uSlice * 0.7) {
        src.x += floor((h11(band * 7.1 + uSliceSeed * 3.3) - 0.5) * uSlice * resolution.x * 0.3);
      }
    }
    src.x = mod(src.x, resolution.x);

    vec3 col = shade(src);
    if (uSplit >= 1.0) {
      col.r = shade(src + vec2(uSplit, 0.0)).r;
      col.b = shade(src - vec2(uSplit, 0.0)).b;
    }
    // The shock front glows faintly in the flame's core color.
    if (shock > 0.0) col = mix(col, toSRGB(uCore), shock * min(0.35, uRippleAmp * 0.04));
    if (uFeedback > 0.0) {
      // Last frame, zoomed a touch out of the fire: echoes stream outward and fade.
      vec2 d = (px + 0.5 - uCenter) / uZoom;
      float cr = cos(uFeedRot), sr = sin(uFeedRot);
      vec2 f = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y) + uCenter;
      // (Minus a little each frame: dithering would otherwise hold dim echoes at the same
      // palette color forever. Only bright things streak.)
      vec3 prev = texture2D(tPrev, f / resolution).rgb;
      col = max(col, prev * uFeedback - 0.09);
    }

    vec2 v = ((px + 0.5) / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    col *= 1.0 - smoothstep(0.45, 1.05, length(v) * 1.15) * vignette;
    if (uIris < 1.99) {
      float edge = length(px - uCenter) / resolution.y - uIris;
      if (edge > 0.0 && edge * 25.0 > bayer4(px)) col = vec3(0.0);
    }
    if (uLetterbox > 0.0 && (px.y < resolution.y * uLetterbox || px.y >= resolution.y * (1.0 - uLetterbox))) col = vec3(0.0);
    if (uInk > 0.0) {
      float l = dot(col, vec3(0.3, 0.59, 0.11));
      vec3 ink = l > 0.18 + (bayer4(px) - 0.5) * 0.3 ? toSRGB(uCore) : vec3(0.0);
      col = mix(col, ink, uInk);
    }
    if (uScan > 0.0) {
      float line = uScanMode > 1.5 ? step(1.0, mod(px.x, 2.0)) : uScanMode > 0.5 ? step(2.0, mod(px.y, 4.0)) : step(1.0, mod(px.y, 2.0));
      col *= 1.0 - uScan * line;
    }
    if (uNoise > 0.0) col += (h21(px + floor(uTime * 24.0) * 17.0) - 0.5) * uNoise;
    col = mix(col, vec3(1.0) - col, uInvert);

    float threshold = (ditherScale > 6.0 ? bayer8(px) : bayer4(px)) - 0.5;
    col += threshold * ditherStrength;
    gl_FragColor = vec4(quantize(col), 1.0);
  }
`;

export function createPixelPass() {
  const uniforms = {
    tColor: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    tNormalDepth: { value: null },
    tFx: { value: null },
    uCore: { value: new THREE.Color('#fff1d0') },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 40 },
    palette: { value: Array.from({ length: MAX_COLORS }, () => new THREE.Vector3()) },
    paletteSize: { value: 1 },
    ditherStrength: { value: 0.16 },
    ditherScale: { value: 4 },
    outlines: { value: 1 },
    vignette: { value: 0.85 },
    exposure: { value: 1 },
    uTime: { value: 0 },
    uSlice: { value: 0 },
    uSliceSeed: { value: 0 },
    uSplit: { value: 0 },
    uBlock: { value: 1 },
    uWave: { value: 0 },
    uMirror: { value: 0 },
    uScan: { value: 0 },
    uScanMode: { value: 0 },
    uNoise: { value: 0 },
    uInvert: { value: 0 },
    tPrev: { value: null },
    uFeedback: { value: 0 },
    uZoom: { value: 1 },
    uFeedRot: { value: 0 },
    uKaleido: { value: 0 },
    uKaleidoRot: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uRippleR: { value: 0 },
    uRippleAmp: { value: 0 },
    uIris: { value: 2 },
    uLetterbox: { value: 0 },
    uInk: { value: 0 },
    uCycle: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const c = new THREE.Color();
  const rgb = { r: 0, g: 0, b: 0 };
  /** hexes are sRGB; quantization happens in sRGB space. */
  function setPalette(hexes) {
    hexes.slice(0, MAX_COLORS).forEach((hex, i) => {
      c.set(hex).getRGB(rgb, THREE.SRGBColorSpace);
      uniforms.palette.value[i].set(rgb.r, rgb.g, rgb.b);
    });
    uniforms.paletteSize.value = Math.min(hexes.length, MAX_COLORS);
  }

  return { scene, camera, uniforms, setPalette };
}
