// Final composite pass (low resolution):
//   solid geometry → outlines → + additive fire/spark layer → vignette →
//   ordered Bayer dither → quantize to the palette.
// The canvas is upscaled by CSS with nearest-neighbor filtering.
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

  float linDepth(sampler2D t, vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(t, uv).x, cameraNear, cameraFar);
  }
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

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
    for (int i = 0; i < ${MAX_COLORS}; i++) {
      if (i >= paletteSize) break;
      float d = colorDist(c, palette[i]);
      if (d < bestD) { bestD = d; best = palette[i]; }
    }
    return best;
  }
  float normalEdge(vec3 n, vec3 nn, float d, float nd) {
    float normalIndicator = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0))), 0.0, 1.0);
    float depthIndicator = clamp(sign((nd - d) * 0.25 + 0.0025), 0.0, 1.0);
    return (1.0 - dot(n, nn)) * depthIndicator * normalIndicator;
  }

  void main() {
    vec2 px = floor(gl_FragCoord.xy);
    vec2 texel = 1.0 / resolution;
    vec2 uv = (px + 0.5) * texel;

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
    col = toSRGB(lit);

    vec2 v = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    col *= 1.0 - smoothstep(0.45, 1.05, length(v) * 1.15) * vignette;

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
