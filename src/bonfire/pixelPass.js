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
//     negative, color cycling (the flame's ramp colors rotate, like old pixel-art
//     palette animation), a gradient map (brightness → three palette colors), a flicker;
//   how the layers blend — each overlay (echoes, the ghost trail, a warp over the plain
//     picture, ink, the negative, scanlines, glow, the gradient map) has a blend mode
//     (blendMode: normal, add, multiply, screen, overlay, soft light, difference, …).
//
// Stages: normally one pass builds each pixel and finishes it. The heavier effects need
// the finished scene around a pixel, so for them the scene is drawn once into its own
// image first (SCENE_ONLY), maybe repainted (styleShader: painterly strokes or a
// watercolor wash), with a fading ghost trail kept beside it (ghostShader); the final
// pass (SCENE_TEX) reads those instead: motion blur (each texel smeared along the way
// the camera moved it, from its depth), the ghost trail, and glow (from the scene
// image's blurred mipmaps).
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
  uniform float uFlash;            // 0..1: an impact flash, washing toward the flame's core color
  uniform float uTemp;             // -1..1: color temperature, warm (reds up) to cool (blues up)
  uniform float uBlackout;         // 0..1: the frame goes dark (the silent beat before a drop)
  uniform float uView;             // breakdown mode: 0 the final image, 1 normals + depth
                                   // (what the outlines are found from), 2 the lit color pass
                                   // alone, 3 the particle (fx) pass alone
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
  uniform float uGrad;             // 0..1: the gradient map
  uniform float uGradA;            // ...its palette slots, dark to light
  uniform float uGradB;
  uniform float uGradC;
  uniform float uFlicker;          // 0..1: how far the light dips
  uniform float uFlickerMode;      // 0 on the beat, 1 a rolling band, 2 film jitter, 3 a candle's waver
  // Blend modes (blendMode's numbers) for the layers.
  uniform float uFeedMode;
  uniform float uWarpMode;
  uniform float uWarpMix;          // 0..1: a warp over the plain picture (1: the warp alone)
  uniform float uInkMode;
  uniform float uInvertMode;       // 0: the negative; else the core color blended in
  uniform float uScanBlend;
  uniform float uGradMode;
  // The stages (SCENE_TEX only).
  uniform sampler2D tScene;        // the scene (maybe repainted), sRGB
  uniform sampler2D tSceneMip;     // the scene with mipmaps, for the glow
  uniform sampler2D tGhost;        // the ghost trail
  uniform float uGhost;            // 0..1: how much of it shows
  uniform float uGhostMode;
  uniform float uBlur;             // motion blur strength (0: off)
  uniform mat4 uInvProj;           // this frame's inverse projection
  uniform mat4 uPrevFromView;      // this frame's view space → last frame's clip space
  uniform float uGlow;             // how much light spills
  uniform float uGlowSize;         // from this mipmap level (bigger: wider)
  uniform float uGlowCut;          // only from what's brighter than this
  uniform float uGlowMode;

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

  // Layer f over b (both sRGB, 0..1). 0 normal, 1 add, 2 subtract, 3 multiply, 4 screen,
  // 5 darken, 6 lighten, 7 overlay, 8 hard light, 9 soft light, 10 difference, 11 exclusion.
  vec3 blendMode(vec3 b, vec3 f, float mode) {
    b = clamp(b, 0.0, 1.0);
    f = clamp(f, 0.0, 1.0);
    int m = int(mode + 0.5);
    if (m == 1) return min(b + f, 1.0);
    if (m == 2) return max(b - f, 0.0);
    if (m == 3) return b * f;
    if (m == 4) return 1.0 - (1.0 - b) * (1.0 - f);
    if (m == 5) return min(b, f);
    if (m == 6) return max(b, f);
    if (m == 7) return mix(2.0 * b * f, 1.0 - 2.0 * (1.0 - b) * (1.0 - f), step(0.5, b));
    if (m == 8) return mix(2.0 * b * f, 1.0 - 2.0 * (1.0 - b) * (1.0 - f), step(0.5, f));
    if (m == 9) {
      vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
      return mix(b - (1.0 - 2.0 * f) * b * (1.0 - b), b + (2.0 * f - 1.0) * (d - b), step(0.5, f));
    }
    if (m == 10) return abs(b - f);
    if (m == 11) return b + f - 2.0 * b * f;
    return f;
  }

  // The scene at a texel: built here, or read from the scene stage.
  vec3 sceneAt(vec2 px) {
  #ifdef SCENE_TEX
    return textureLod(tScene, (clamp(px, vec2(0.0), resolution - 1.0) + 0.5) / resolution, 0.0).rgb;
  #else
    return shade(px);
  #endif
  }

  #ifdef SCENE_TEX
  // Motion blur: where this texel's surface was on screen last frame (from its depth and
  // the two cameras), and the picture smeared along the way it moved.
  vec3 smear(vec2 src, vec3 col) {
    vec2 uv = (clamp(src, vec2(0.0), resolution - 1.0) + 0.5) / resolution;
    vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0);
    vec4 p = uPrevFromView * vec4(v.xyz / v.w, 1.0);
    if (p.w <= 0.0) return col;
    vec2 vel = (uv - (p.xy / p.w * 0.5 + 0.5)) * resolution * uBlur;
    float len = length(vel);
    if (len < 0.75) return col;
    vel *= min(1.0, 16.0 / len);
    vec3 acc = col;
    for (int i = 0; i < 6; i++) {
      vec2 at = src + vel * ((float(i) + 0.5) / 6.0 - 0.5);
      acc += textureLod(tScene, (clamp(at, vec2(0.0), resolution - 1.0) + 0.5) / resolution, 0.0).rgb;
    }
    return acc / 7.0;
  }
  #endif

  #ifdef SCENE_ONLY
  void main() { gl_FragColor = vec4(shade(floor(gl_FragCoord.xy)), 1.0); }
  #else
  void main() {
    vec2 px = floor(gl_FragCoord.xy);

    // Breakdown mode: one of the passes the final image is built from, as it is.
    if (uView > 0.5) {
      vec2 uv = (px + 0.5) / resolution;
      vec3 v;
      if (uView < 1.5) {
        vec4 nrm = texture2D(tNormal, uv);
        float d = linDepth(tNormalDepth, uv) / cameraFar;
        v = nrm.a > 0.5 ? mix(nrm.rgb, vec3(1.0 - d), 0.25) : vec3(0.02);
      } else if (uView < 2.5) v = toSRGB(texture2D(tColor, uv).rgb * exposure);
      else v = toSRGB(min(texture2D(tFx, uv).rgb * exposure, vec3(1.0)));
      gl_FragColor = vec4(v, 1.0);
      return;
    }

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

    vec3 col = sceneAt(src);
  #ifdef SCENE_TEX
    if (uBlur > 0.0) col = smear(src, col);
  #endif
    if (uSplit >= 1.0) {
      col.r = sceneAt(src + vec2(uSplit, 0.0)).r;
      col.b = sceneAt(src - vec2(uSplit, 0.0)).b;
    }
    // A warp as a layer: the warped picture blended over the plain one.
    if ((uWarpMix < 0.999 || uWarpMode > 0.5) && (src.x != px.x || src.y != px.y)) {
      vec3 plain = sceneAt(px);
      col = mix(plain, blendMode(plain, col, uWarpMode), uWarpMix);
    }
  #ifdef SCENE_TEX
    vec2 suv = (clamp(src, vec2(0.0), resolution - 1.0) + 0.5) / resolution;
    if (uGhost > 0.0) col = mix(col, blendMode(col, textureLod(tGhost, suv, 0.0).rgb, uGhostMode), uGhost);
  #endif
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
      col = blendMode(col, max(prev * uFeedback - 0.09, 0.0), uFeedMode);
    }
  #ifdef SCENE_TEX
    // Glow: light spilling from the bright parts (the scene's blurred mipmaps).
    if (uGlow > 0.0) {
      vec3 halo = 0.5 * (textureLod(tSceneMip, suv, uGlowSize).rgb + textureLod(tSceneMip, suv, uGlowSize + 1.0).rgb);
      float peak = max(halo.r, max(halo.g, halo.b));
      col = blendMode(col, halo * smoothstep(uGlowCut, uGlowCut + 0.3, peak) * uGlow, uGlowMode);
    }
  #endif
    // Gradient map: the picture's brightness through three palette colors.
    if (uGrad > 0.0) {
      float l = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
      int last = paletteSize - 1;
      vec3 ga = palette[min(int(uGradA), last)];
      vec3 gb = palette[min(int(uGradB), last)];
      vec3 gc = palette[min(int(uGradC), last)];
      vec3 gm = l < 0.5 ? mix(ga, gb, l * 2.0) : mix(gb, gc, l * 2.0 - 1.0);
      col = mix(col, blendMode(col, gm, uGradMode), uGrad);
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
      col = mix(col, blendMode(col, ink, uInkMode), uInk);
    }
    if (uScan > 0.0) {
      float line = uScanMode > 1.5 ? step(1.0, mod(px.x, 2.0)) : uScanMode > 0.5 ? step(2.0, mod(px.y, 4.0)) : step(1.0, mod(px.y, 2.0));
      // Dark lines (multiply), light ones (screen), or contrast lines (overlay).
      vec3 lines = abs(uScanBlend - 4.0) < 0.5 ? vec3(0.6 * uScan * line) : uScanBlend > 6.5 ? vec3(0.5 - 0.5 * uScan * line) : vec3(1.0 - uScan * line);
      col = blendMode(col, lines, uScanBlend);
    }
    if (uNoise > 0.0) col += (h21(px + floor(uTime * 24.0) * 17.0) - 0.5) * uNoise;
    if (uInvert > 0.0) col = mix(col, uInvertMode < 0.5 ? vec3(1.0) - col : blendMode(col, toSRGB(uCore), uInvertMode), uInvert);
    // Impact flash: the whole frame lifts toward the core color for a frame or two, still
    // quantized to the palette below so it reads as a pixel-art flash, not a white-out.
    if (uFlash > 0.0) col = mix(col, max(col, toSRGB(uCore)), uFlash);
    // Temperature: a gentle tilt before the palette snap, so bright music reads cooler
    // and dark music warmer by landing on neighboring palette colors.
    col *= vec3(1.0 - 0.07 * uTemp, 1.0 - 0.01 * abs(uTemp), 1.0 + 0.09 * uTemp);
    // Flicker: the light dips (on the beat: the amount itself pulses), a dark band rolls
    // down, film jitters frame to frame, or it wavers like a candle.
    if (uFlicker > 0.0) {
      float f = 1.0;
      if (uFlickerMode > 2.5) f = 0.5 + 0.5 * sin(uTime * 7.0 + 2.0 * sin(uTime * 2.3));
      else if (uFlickerMode > 1.5) f = h11(floor(uTime * 18.0));
      else if (uFlickerMode > 0.5) f = smoothstep(0.18, 0.0, abs(fract(px.y / resolution.y + uTime * 0.35) - 0.5));
      col *= 1.0 - uFlicker * f;
    }
    col *= 1.0 - uBlackout;

    float threshold = (ditherScale > 6.0 ? bayer8(px) : bayer4(px)) - 0.5;
    col += threshold * ditherStrength;
    gl_FragColor = vec4(quantize(col), 1.0);
  }
  #endif
`;

// Repaints the scene image (the stages): painterly strokes (in each brush-shaped patch
// around a texel, the brightness band most of it falls in, averaged) or a watercolor
// wash (a Kuwahara filter: the calmest of the four corners around it, with pigment
// pooling darker along the edges).
const styleShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 resolution;
  uniform float uStyle;        // 1 painterly, 2 watercolor
  uniform float uStyleR;       // brush size, texels (2..4)
  uniform float uStyleMix;     // 0..1
  uniform float uPaintAngle;   // the strokes' direction (radians)...
  uniform float uPaintAspect;  // ...and how long they are
  uniform float uWashEdge;     // 0..1: how dark the pigment pools at edges

  vec3 at(vec2 p) { return textureLod(tScene, (clamp(p, vec2(0.0), resolution - 1.0) + 0.5) / resolution, 0.0).rgb; }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  vec3 paint(vec2 px) {
    float count[8];
    vec3 sum[8];
    for (int i = 0; i < 8; i++) { count[i] = 0.0; sum[i] = vec3(0.0); }
    float ca = cos(uPaintAngle), sa = sin(uPaintAngle);
    float r2 = uStyleR * uStyleR + 0.5;
    for (int y = -4; y <= 4; y++) {
      for (int x = -4; x <= 4; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 q = vec2((ca * o.x + sa * o.y) / uPaintAspect, -sa * o.x + ca * o.y);
        if (dot(q, q) > r2) continue;
        vec3 c = at(px + o);
        int band = int(clamp(luma(c) * 8.0, 0.0, 7.0));
        count[band] += 1.0;
        sum[band] += c;
      }
    }
    int best = 0;
    float most = 0.0;
    for (int i = 0; i < 8; i++) if (count[i] > most) { most = count[i]; best = i; }
    return sum[best] / max(most, 1.0);
  }

  vec3 wash(vec2 px) {
    vec3 best = at(px);
    float calm = 1e9;
    for (int k = 0; k < 4; k++) {
      vec2 dir = vec2(k == 1 || k == 3 ? 1.0 : -1.0, k >= 2 ? 1.0 : -1.0);
      vec3 m = vec3(0.0), s = vec3(0.0);
      float n = 0.0;
      for (int y = 0; y <= 4; y++) {
        for (int x = 0; x <= 4; x++) {
          if (float(x) > uStyleR || float(y) > uStyleR) continue;
          vec3 c = at(px + dir * vec2(float(x), float(y)));
          m += c;
          s += c * c;
          n += 1.0;
        }
      }
      m /= n;
      vec3 v = abs(s / n - m * m);
      float spread = v.r + v.g + v.b;
      if (spread < calm) { calm = spread; best = m; }
    }
    return best * (1.0 - uWashEdge * 0.45 * smoothstep(0.002, 0.03, calm));
  }

  void main() {
    vec2 px = floor(gl_FragCoord.xy);
    vec3 orig = at(px);
    vec3 c = uStyle < 1.5 ? paint(px) : wash(px);
    gl_FragColor = vec4(mix(orig, c, uStyleMix), 1.0);
  }
`;

// The ghost trail (the stages): this frame's scene over the trail so far, the older
// part fading by uGhostKeep a frame. Kept in half floats, so faint trails fade out
// instead of sticking on a palette color.
const ghostShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tGhost;
  uniform vec2 resolution;
  uniform float uGhostKeep;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    gl_FragColor = vec4(mix(textureLod(tScene, uv, 0.0).rgb, textureLod(tGhost, uv, 0.0).rgb, uGhostKeep), 1.0);
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
    uFlash: { value: 0 },
    uTemp: { value: 0 },
    uBlackout: { value: 0 },
    uView: { value: 0 },
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
    uGrad: { value: 0 },
    uGradA: { value: 0 },
    uGradB: { value: 6 },
    uGradC: { value: 8 },
    uFlicker: { value: 0 },
    uFlickerMode: { value: 0 },
    uFeedMode: { value: 6 },
    uWarpMode: { value: 0 },
    uWarpMix: { value: 1 },
    uInkMode: { value: 0 },
    uInvertMode: { value: 0 },
    uScanBlend: { value: 3 },
    uGradMode: { value: 0 },
    tScene: { value: null },
    tSceneMip: { value: null },
    tGhost: { value: null },
    uGhost: { value: 0 },
    uGhostKeep: { value: 0.9 },
    uGhostMode: { value: 0 },
    uBlur: { value: 0 },
    uInvProj: { value: new THREE.Matrix4() },
    uPrevFromView: { value: new THREE.Matrix4() },
    uGlow: { value: 0 },
    uGlowSize: { value: 2 },
    uGlowCut: { value: 0.2 },
    uGlowMode: { value: 1 },
    uStyle: { value: 0 },
    uStyleR: { value: 3 },
    uStyleMix: { value: 1 },
    uPaintAngle: { value: 0 },
    uPaintAspect: { value: 1 },
    uWashEdge: { value: 0 },
  };
  // One uniforms object for every stage (each reads what it needs).
  const make = (shader, defines = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: shader, defines, depthTest: false, depthWrite: false });
  const materials = {
    single: make(fragmentShader),
    scene: make(fragmentShader, { SCENE_ONLY: '' }),
    style: make(styleShader),
    ghost: make(ghostShader),
    final: make(fragmentShader, { SCENE_TEX: '' }),
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.single);
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

  /** Which stage the next render of `scene` draws: single (all in one), scene, style, ghost, final. */
  function use(stage) { quad.material = materials[stage]; }

  return { scene, camera, uniforms, setPalette, materials, use };
}
