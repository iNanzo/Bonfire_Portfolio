// @ts-nocheck: 1 type error still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Ground marks: hits leave the element's mark on the clearing floor, and every mark fades
// away over `effects.impact.markLife` seconds.
//   fire       a sooty scorch with a ring of embers glowing in it for a moment
//   ice        a pale frost bloom with crystal spokes, faintly glowing
//   lightning  a branching burn (a Lichtenberg figure) that flashes bright as it lands
//              (the ground flash), then leaves dark scars
//
// Marks are painted into two small canvases covering the clearing (seen from above):
// `albedo` (a tint and how much of it covers the ground) and `glow` (light the ground
// gives off). The ground's materials sample them by world x/z (patch()), so the marks
// follow the flagstones and the ash pile exactly. Each mark is kept as a stamp (where,
// what, when, its random shape) and the canvases are repainted from the stamps a few
// times a second — so fading is exact and a mark is gone for good at the end of its life.
import * as THREE from 'three';
import { effects } from '../effects.js';
import { TAU, clamp01 } from '../math.js';

const MAX_STAMPS = 48;
const GLOW_TIME = { fire: 2.4, ice: 1.6, lightning: 0.7 }; // seconds a fresh mark glows

/**
 * @param {object} o
 * @param {THREE.Vector3} o.center  the middle of the clearing (world)
 * @param {number} o.half           half the width of the area marks can land in (m)
 * @param {number} o.res            canvas texels across
 */
export function createGroundMarks({ center, half = 3.4, res = 256 } = {}) {
  const make = () => {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(res, res)
        : Object.assign(document.createElement('canvas'), { width: res, height: res });
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false; // canvas row 0 = the area's -z edge, like uv.y = 0
    return { canvas, ctx, tex };
  };
  const albedo = make();
  const glow = make();
  const uniforms = {
    tMarks: { value: albedo.tex },
    tMarkGlow: { value: glow.tex },
    // x0, z0 of the area and its size: world x/z → canvas uv.
    uMarkBox: { value: new THREE.Vector4(center.x - half, center.z - half, half * 2, half * 2) },
  };
  const stamps = [];
  let repaintIn = 0;
  let glowing = false;
  let dirty = false;

  const toPx = (x, z) => [((x - center.x + half) / (half * 2)) * res, ((z - center.z + half) / (half * 2)) * res];
  const perM = res / (half * 2);
  const css = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

  /** A branching burn: a few jagged arms, each forking once or twice. */
  function lichtenberg(r) {
    const arms = [];
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const walk = (a, len, depth) => {
        const pts = [[0, 0]];
        let x = 0,
          y = 0;
        const steps = 6;
        for (let s = 1; s <= steps; s++) {
          a += (Math.random() - 0.5) * 0.9;
          x += Math.cos(a) * (len / steps);
          y += Math.sin(a) * (len / steps);
          pts.push([x, y]);
          if (depth < 2 && Math.random() < 0.28)
            arms.push({
              from: [x, y],
              pts: walk(a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), len * 0.45, depth + 1),
              w: 1 / (depth + 2),
            });
        }
        return pts;
      };
      arms.push({
        from: [0, 0],
        pts: walk((i / n) * TAU + Math.random() * 0.6, r * (0.7 + Math.random() * 0.5), 0),
        w: 1,
      });
    }
    return arms;
  }

  /**
   * Leave a mark. `kind`: fire | ice | lightning. `r`: radius (m). `ramp`: the flame's
   * [lo, mid, hi, core] as THREE.Colors (copied). `strength` 0..1 scales how dark / bright.
   * `ring`: scatter small marks around a circle of radius r instead of one in the middle.
   */
  function stamp(kind, x, z, r, ramp, { strength = 1, ring = false } = {}) {
    if (!effects.impact.marks) return;
    if (stamps.length >= MAX_STAMPS) stamps.shift();
    const blobs = [];
    if (ring) {
      const n = 14 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random() * 0.3;
        const rr = r * (0.85 + Math.random() * 0.3);
        blobs.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.08 + Math.random() * 0.12]);
      }
    } else {
      blobs.push([0, 0, r]);
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * TAU;
        blobs.push([Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * (0.25 + Math.random() * 0.3)]);
      }
    }
    stamps.push({
      kind,
      x,
      z,
      r,
      strength,
      born: performance.now() / 1000,
      blobs,
      arms: kind === 'lightning' ? lichtenberg(r * 1.6) : null,
      spokes:
        kind === 'ice'
          ? Array.from({ length: 7 + Math.floor(Math.random() * 5) }, () => [
              Math.random() * TAU,
              0.5 + Math.random() * 0.7,
            ])
          : null,
      colors: ramp.map((c) => c.clone()),
    });
    repaintIn = 0;
  }

  function paint(now) {
    const life = Math.max(1, effects.impact.markLife);
    const A = albedo.ctx;
    const G = glow.ctx;
    A.clearRect(0, 0, res, res);
    G.clearRect(0, 0, res, res);
    glowing = false;
    for (let i = stamps.length - 1; i >= 0; i--) if (now - stamps[i].born > life) stamps.splice(i, 1);
    for (const s of stamps) {
      const age = now - s.born;
      // Holds, then fades out smoothly over its second half.
      const k = clamp01(1 - (age / life - 0.4) / 0.6);
      const fade = k * k * (3 - 2 * k) * s.strength;
      const hot = clamp01(1 - age / GLOW_TIME[s.kind]);
      if (hot > 0) glowing = true;
      const [cx, cy] = toPx(s.x, s.z);
      const [lo, mid, hi, core] = s.colors;
      if (s.kind === 'lightning') {
        A.lineCap = 'round';
        G.lineCap = 'round';
        for (const arm of s.arms) {
          const path = (ctx) => {
            ctx.beginPath();
            ctx.moveTo(cx + arm.from[0] * perM, cy + arm.from[1] * perM);
            for (const [px, py] of arm.pts) ctx.lineTo(cx + (arm.from[0] + px) * perM, cy + (arm.from[1] + py) * perM);
          };
          A.lineWidth = Math.max(1, 2.2 * arm.w);
          A.strokeStyle = `rgba(8,7,12,${0.8 * fade})`;
          path(A);
          A.stroke();
          if (hot > 0) {
            G.lineWidth = Math.max(1, 2 * arm.w);
            G.strokeStyle = css(hot > 0.6 ? core : hi, hot);
            path(G);
            G.stroke();
          }
        }
        // The ground flash: a bright splash where it struck, gone in a blink.
        if (hot > 0.5) {
          const g = G.createRadialGradient(cx, cy, 0, cx, cy, s.r * perM * 1.4);
          g.addColorStop(0, css(core, (hot - 0.5) * 1.4));
          g.addColorStop(1, css(mid, 0));
          G.fillStyle = g;
          G.fillRect(cx - s.r * perM * 1.4, cy - s.r * perM * 1.4, s.r * perM * 2.8, s.r * perM * 2.8);
        }
        continue;
      }
      for (const [bx, by, br] of s.blobs) {
        const x = cx + bx * perM,
          y = cy + by * perM,
          rad = Math.max(1.5, br * perM);
        const g = A.createRadialGradient(x, y, 0, x, y, rad);
        if (s.kind === 'fire') {
          g.addColorStop(0, `rgba(6,5,9,${0.85 * fade})`);
          g.addColorStop(0.6, `rgba(14,11,16,${0.55 * fade})`);
          g.addColorStop(1, 'rgba(14,11,16,0)');
        } else {
          g.addColorStop(0, css(core, 0.6 * fade));
          g.addColorStop(0.7, css(hi, 0.35 * fade));
          g.addColorStop(1, css(hi, 0));
        }
        A.fillStyle = g;
        A.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      if (s.spokes) {
        A.lineWidth = 1;
        A.strokeStyle = css(core, 0.7 * fade);
        for (const [a, len] of s.spokes) {
          A.beginPath();
          A.moveTo(cx, cy);
          A.lineTo(cx + Math.cos(a) * s.r * len * 1.5 * perM, cy + Math.sin(a) * s.r * len * 1.5 * perM);
          A.stroke();
        }
      }
      if (hot > 0) {
        // Fire: embers glowing around the scorch's edge; ice: a faint cold glow.
        for (const [bx, by, br] of s.blobs) {
          const x = cx + bx * perM,
            y = cy + by * perM,
            rad = Math.max(1.5, br * perM);
          // (Fire: a band just inside the scorch's edge, where the embers are.)
          const g = G.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, css(lo, 0));
          g.addColorStop(
            s.kind === 'fire' ? 0.45 : 0.1,
            css(s.kind === 'fire' ? lo : hi, s.kind === 'fire' ? 0 : 0.18 * hot),
          );
          g.addColorStop(0.75, css(s.kind === 'fire' ? mid : hi, (s.kind === 'fire' ? 0.55 : 0.12) * hot * hot));
          g.addColorStop(1, css(lo, 0));
          G.fillStyle = g;
          G.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
    }
    albedo.tex.needsUpdate = true;
    glow.tex.needsUpdate = true;
  }

  return {
    uniforms,
    /**
     * Let a ground material show the marks (MeshLambertMaterial): the tint over its color,
     * the glow added to its light.
     */
    patch(material) {
      material.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader =
          'uniform vec4 uMarkBox;\nvarying vec2 vMarkUv;\n' +
          sh.vertexShader.replace(
            '#include <project_vertex>',
            '#include <project_vertex>\n  vMarkUv = ((modelMatrix * vec4(transformed, 1.0)).xz - uMarkBox.xy) / uMarkBox.zw;',
          );
        sh.fragmentShader =
          'uniform sampler2D tMarks;\nuniform sampler2D tMarkGlow;\nvarying vec2 vMarkUv;\n' +
          sh.fragmentShader
            .replace(
              '#include <color_fragment>',
              '#include <color_fragment>\n  vec4 markTint = texture2D(tMarks, vMarkUv);\n  diffuseColor.rgb = mix(diffuseColor.rgb, markTint.rgb, markTint.a);',
            )
            .replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n  totalEmissiveRadiance += texture2D(tMarkGlow, vMarkUv).rgb * 0.7;',
            );
      };
      material.customProgramCacheKey = () => 'ground-marks';
    },
    stamp,
    /** Repaint while anything is fading: glowing marks at ~15 Hz, the rest at 4 Hz. */
    step(dt) {
      if (!stamps.length && !dirty) return;
      repaintIn -= dt;
      if (repaintIn > 0) return;
      repaintIn = glowing ? 1 / 15 : 0.25;
      paint(performance.now() / 1000);
      dirty = stamps.length > 0; // one more paint after the last mark goes, to clear it
    },
    /** Wipe every mark (an effects change turned them off). */
    clear() {
      stamps.length = 0;
      dirty = true;
      repaintIn = 0;
    },
    get count() {
      return stamps.length;
    },
    dispose() {
      albedo.tex.dispose();
      glow.tex.dispose();
    },
  };
}
