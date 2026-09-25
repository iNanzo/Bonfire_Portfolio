// How the cursor moves the fire. Everything works in screen space (CSS px), so
// it behaves the same from every camera angle: each particle is projected to the
// screen, a flow velocity (px/s) is looked up there, and that flow is turned back
// into a world-space velocity at the particle's depth.
//
// Default — "ember": a blend tuned to feel like fire, not a force field.
//   • stir: a coarse fluid velocity grid (splat → advect → diffuse → decay, after
//     Stam's "Stable Fluids" / Dobryakov's WebGL fluid), so moving through the
//     fire leaves a flow that keeps swirling for a moment;
//   • part: the flame parts softly around the cursor itself;
//   • draw: a hovering cursor gently draws the plume toward it;
//   • slash: only at high speed, a blade-like cut along the swing. The cursor's
//     speed is smoothed with a fast attack and a velocity-dependent release, so
//     a hard swing carries through and eases out instead of stopping dead.
// Flow reaching the particles is also soft-clamped (tanh), so extreme flicks
// bend the fire rather than blasting it.
//
// The individual ingredients stay available for comparison (?lab, or P then 6).
import * as THREE from 'three';

export const MODES = {
  ember: { name: 'Ember', blurb: 'The mix: stir + a soft part + a gentle lean, with a slash only on fast swings.' },
  stir: { name: 'Stir', blurb: 'Fluid only: a smoke-like flow that keeps swirling after you stop.' },
  wake: { name: 'Wake', blurb: 'Moving the cursor sheds little whirlpools that curl the flames behind it.' },
  part: { name: 'Part', blurb: 'The flame parts gently around the cursor, then flows back together.' },
  draw: { name: 'Draw', blurb: 'The fire leans and reaches toward the cursor, like air being drawn in.' },
  slash: { name: 'Slash', blurb: 'The original: the cursor path knocks particles along the swing.' },
};

const CELL = 24;          // stir grid cell size (px)
const VORTEX_CORE = 24;   // wake vortex core radius (px)
const VORTEX_LIFE = 0.9;  // seconds
const VORTEX_GAP = 22;    // px of cursor travel between vortex pairs

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createInteraction({ reducedMotion = false } = {}) {
  let mode = 'ember';
  const gain = reducedMotion ? 0.5 : 1;

  // --- camera projection ------------------------------------------------------------
  const vp = new THREE.Matrix4();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let e = vp.elements;
  let tanHalf = 1;
  let W = 1;
  let H = 1;
  let cur = null; // latest cursor state

  // --- smoothed swing velocity (fast attack, speed-dependent release) ----------------
  const sv = { x: 0, y: 0, mag: 0 };
  function smoothVelocity(c, dt) {
    const rx = c.moving ? c.vx : 0;
    const ry = c.moving ? c.vy : 0;
    const raw = Math.hypot(rx, ry);
    // Faster swings take longer to settle: ~60ms tail for a nudge, ~0.5s for a hard slash.
    const tau = raw > sv.mag ? 0.035 : 0.06 + sv.mag / 5200;
    const k = 1 - Math.exp(-dt / tau);
    sv.x += (rx - sv.x) * k;
    sv.y += (ry - sv.y) * k;
    sv.mag = Math.hypot(sv.x, sv.y);
  }

  // --- stir: coarse velocity grid ---------------------------------------------------
  let gw = 0, gh = 0, GX, GY, TX, TY;
  function ensureGrid() {
    const nw = Math.ceil(W / CELL) + 2, nh = Math.ceil(H / CELL) + 2;
    if (nw === gw && nh === gh) return;
    gw = nw; gh = nh;
    GX = new Float32Array(gw * gh); GY = new Float32Array(gw * gh);
    TX = new Float32Array(gw * gh); TY = new Float32Array(gw * gh);
  }
  function sampleGrid(A, x, y) {
    const fx = Math.min(gw - 1.001, Math.max(0, x / CELL));
    const fy = Math.min(gh - 1.001, Math.max(0, y / CELL));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const k = j * gw + i;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + gw] * (1 - u) + A[k + gw + 1] * u) * v;
  }
  function segDist(px, py, c) {
    const sx = c.bx - c.ax, sy = c.by - c.ay;
    const t = Math.max(0, Math.min(1, ((px - c.ax) * sx + (py - c.ay) * sy) / (sx * sx + sy * sy || 1)));
    return [px - (c.ax + sx * t), py - (c.ay + sy * t)];
  }
  function stepStir(c, dt, vx, vy, strength, R = 64) {
    ensureGrid();
    if (Math.abs(vx) + Math.abs(vy) > 20) {
      const sig2 = 2 * (R * 0.45) ** 2;
      const i0 = Math.max(0, Math.floor((Math.min(c.ax, c.bx) - R) / CELL)), i1 = Math.min(gw - 1, Math.ceil((Math.max(c.ax, c.bx) + R) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(c.ay, c.by) - R) / CELL)), j1 = Math.min(gh - 1, Math.ceil((Math.max(c.ay, c.by) + R) / CELL));
      const cx = Math.max(-2400, Math.min(2400, vx)), cy = Math.max(-2400, Math.min(2400, vy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const [dx, dy] = segDist(i * CELL, j * CELL, c);
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const w = Math.exp(-d2 / sig2) * strength;
        const k = j * gw + i;
        GX[k] += (cx - GX[k]) * w;
        GY[k] += (cy - GY[k]) * w;
      }
    }
    // Advect the field through itself (semi-Lagrangian), then diffuse and fade.
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const x = i * CELL - GX[k] * dt, y = j * CELL - GY[k] * dt;
      TX[k] = sampleGrid(GX, x, y);
      TY[k] = sampleGrid(GY, x, y);
    }
    const fade = Math.exp(-dt * 1.5);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const l = i > 0 ? k - 1 : k, r = i < gw - 1 ? k + 1 : k, u = j > 0 ? k - gw : k, d = j < gh - 1 ? k + gw : k;
      GX[k] = (TX[k] * 0.6 + (TX[l] + TX[r] + TX[u] + TX[d]) * 0.1) * fade;
      GY[k] = (TY[k] * 0.6 + (TY[l] + TY[r] + TY[u] + TY[d]) * 0.1) * fade;
    }
  }

  // --- wake: shed vortex pairs --------------------------------------------------------
  const vortices = [];
  let travel = 0;
  function stepWake(c, dt) {
    if (c.moving) {
      const sx = c.bx - c.ax, sy = c.by - c.ay;
      const len = Math.hypot(sx, sy);
      const speed = Math.min(2200, Math.hypot(c.vx, c.vy));
      const nx = -sy / (len || 1), ny = sx / (len || 1);
      const g = 2 * Math.PI * VORTEX_CORE * 0.55 * speed;
      let s = VORTEX_GAP - travel;
      while (s <= len) {
        const t = s / (len || 1);
        const x = c.ax + sx * t, y = c.ay + sy * t;
        vortices.push({ x: x + nx * 26, y: y + ny * 26, g, age: 0, dx: c.vx * 0.25, dy: c.vy * 0.25 });
        vortices.push({ x: x - nx * 26, y: y - ny * 26, g: -g, age: 0, dx: c.vx * 0.25, dy: c.vy * 0.25 });
        s += VORTEX_GAP;
      }
      travel = (travel + len) % VORTEX_GAP;
      while (vortices.length > 48) vortices.shift();
    }
    for (let i = vortices.length - 1; i >= 0; i--) {
      const v = vortices[i];
      v.age += dt;
      if (v.age > VORTEX_LIFE) { vortices.splice(i, 1); continue; }
      v.x += v.dx * dt;
      v.y += (v.dy - 40) * dt;
      v.dx *= 1 - dt * 3;
      v.dy *= 1 - dt * 3;
    }
  }

  // --- flow ingredients (screen px/s) ----------------------------------------------------
  function part(px, py, c, out, k = 1) {
    if (!c.moving) return;
    const speed = Math.min(1800, Math.hypot(c.vx, c.vy));
    const R = 36 + speed * 0.03;
    const [dx, dy] = segDist(px, py, c);
    const d = Math.hypot(dx, dy);
    if (d >= R) return;
    const f = (1 - d / R) ** 2 * k;
    const push = f * (160 + speed * 0.35);
    out[0] += (dx / (d || 1)) * push + c.vx * 0.12 * f;
    out[1] += (dy / (d || 1)) * push + c.vy * 0.12 * f;
  }
  function draw(px, py, c, out, k = 1, reach = 650) {
    if (!c.present) return;
    const dx = c.bx - px, dy = c.by - py;
    const d = Math.hypot(dx, dy) || 1;
    const r = Math.max(0, 1 - d / reach);
    const pull = Math.min(d, 260) * 0.75 * r * r * k;
    out[0] += (dx / d) * pull;
    out[1] += (dy / d) * pull;
  }
  // High-speed cut along the swing, using the smoothed velocity so it eases out.
  function slashFlow(px, py, c, out, k) {
    if (k <= 0) return 0;
    const R = 26 + sv.mag * 0.014;
    const [dx, dy] = segDist(px, py, c);
    const d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return 0;
    const f = (1 - Math.sqrt(d2) / R) ** 2 * k;
    out[0] += sv.x * f * 0.9;
    out[1] += sv.y * f * 0.9;
    return f;
  }

  const flow = [0, 0];
  let slashK = 0;
  let lastHit = 0;
  function flowAt(px, py, c) {
    flow[0] = 0; flow[1] = 0;
    lastHit = 0;
    if (mode === 'ember') {
      flow[0] = sampleGrid(GX, px, py);
      flow[1] = sampleGrid(GY, px, py);
      part(px, py, c, flow, 0.55);
      draw(px, py, c, flow, 0.22, 440);
      lastHit = slashFlow(px, py, c, flow, slashK);
    } else if (mode === 'stir') {
      flow[0] = sampleGrid(GX, px, py);
      flow[1] = sampleGrid(GY, px, py);
    } else if (mode === 'wake') {
      const c2 = VORTEX_CORE * VORTEX_CORE;
      for (const v of vortices) {
        const dx = px - v.x, dy = py - v.y;
        const r2 = dx * dx + dy * dy;
        if (r2 > 36 * c2) continue;
        const k = (v.g * (1 - v.age / VORTEX_LIFE) ** 1.5) / (2 * Math.PI * (r2 + c2));
        flow[0] += -dy * k;
        flow[1] += dx * k;
      }
    } else if (mode === 'part') {
      part(px, py, c, flow);
    } else if (mode === 'draw') {
      draw(px, py, c, flow);
      if (c.moving) {
        const d = Math.hypot(c.bx - px, c.by - py);
        const f = Math.max(0, 1 - d / 160) ** 2;
        flow[0] += c.vx * 0.2 * f;
        flow[1] += c.vy * 0.2 * f;
      }
    }
    return flow;
  }

  // --- the original slash (impulse-based) ----------------------------------------------
  function legacySlash(set, c) {
    const speed = Math.hypot(c.vx, c.vy);
    if (!c.moving || speed < 30) return false;
    const radius = 22 + Math.min(46, speed * 0.018);
    const cap = Math.min(1, 7000 / speed);
    const vx = c.vx * cap, vy = c.vy * cap;
    const { pos, vel, n } = set;
    let hit = false;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const x = pos[ix], y = pos[ix + 1], z = pos[ix + 2];
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (cw <= 0.01) continue;
      const px = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * W;
      const py = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * H;
      const [dx, dy] = segDist(px, py, c);
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const fall = (1 - Math.sqrt(d2) / radius) ** 2 * 0.55 * gain;
      const wpp = (2 * cw * tanHalf) / H;
      const kx = vx * wpp * fall, ky = -vy * wpp * fall;
      const wx = right.x * kx + up.x * ky, wy = right.y * kx + up.y * ky, wz = right.z * kx + up.z * ky;
      vel[ix] += wx; vel[ix + 1] += wy; vel[ix + 2] += wz;
      pos[ix] += wx * 0.03; pos[ix + 1] += wy * 0.03; pos[ix + 2] += wz * 0.03;
      hit = true;
    }
    return hit;
  }

  // Screen flow → world velocity at depth cw, soft-clamped to maxV (m/s).
  function toWorld(fx, fy, cw, maxV, out) {
    const wpp = ((2 * cw * tanHalf) / H) * gain;
    const kx = fx * wpp, ky = -fy * wpp;
    let wx = right.x * kx + up.x * ky, wy = right.y * kx + up.y * ky, wz = right.z * kx + up.z * ky;
    const m = Math.hypot(wx, wy, wz);
    if (m > 1e-6) {
      const s = (maxV * Math.tanh(m / maxV)) / m;
      wx *= s; wy *= s; wz *= s;
    }
    out[0] = wx; out[1] = wy; out[2] = wz;
    return out;
  }

  /**
   * Called every frame.
   * @param {object} c  cursor: ax,ay→bx,by (this frame's path, CSS px), vx,vy (px/s),
   *                    moving, present, width, height
   * @param {Array} sets  particle sets: { pos, vel, n, ext?, geo, maxV }
   *   `ext` (the flame) receives a smoothed world velocity that the stepped
   *   simulation adds to its flow field; other sets are carried directly.
   * @returns {Array} spark requests [{ x, y, z, vx, vy, vz }] where a fast slash
   *   tore through the flame
   */
  const w3 = [0, 0, 0];
  const sparks = [];
  function update(camera, c, sets, dt) {
    cur = c;
    W = c.width; H = c.height;
    vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    e = vp.elements;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    sparks.length = 0;

    smoothVelocity(c, dt);
    if (mode === 'slash') {
      for (const s of sets) {
        if (s.ext) s.ext.fill(0);
        if (legacySlash(s, c)) s.geo.attributes.position.needsUpdate = true;
      }
      return sparks;
    }
    if (mode === 'ember') {
      // Stir with the smoothed swing, so the flow follows through after a hard slash.
      stepStir(c, dt, sv.x, sv.y, 0.42, 58);
      slashK = smoothstep(900, 2600, sv.mag);
    } else if (mode === 'stir') {
      stepStir(c, dt, c.moving ? c.vx : 0, c.moving ? c.vy : 0, 0.5);
    } else if (mode === 'wake') {
      stepWake(c, dt);
    }

    for (const s of sets) {
      const { pos, n, ext } = s;
      const maxV = s.maxV ?? 3;
      let moved = false;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const x = pos[ix], y = pos[ix + 1], z = pos[ix + 2];
        const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
        let wx = 0, wy = 0, wz = 0;
        if (cw > 0.01) {
          const px = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * W;
          const py = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * H;
          const [fx, fy] = flowAt(px, py, c);
          if (fx || fy) {
            toWorld(fx, fy, cw, maxV, w3);
            wx = w3[0]; wy = w3[1]; wz = w3[2];
            // A fast cut through the flame throws off the odd spark.
            if (ext && lastHit > 0.5 && sparks.length < 6 && Math.random() < 0.02) {
              sparks.push({ x, y, z, vx: wx * 1.3, vy: wy * 1.3 + 0.4, vz: wz * 1.3 });
            }
          }
        }
        if (ext) {
          // Fast attack, slower release: the fire gives way quickly and recovers smoothly.
          const grow = wx * wx + wy * wy + wz * wz > ext[ix] ** 2 + ext[ix + 1] ** 2 + ext[ix + 2] ** 2;
          const k = Math.min(1, dt * (grow ? 16 : 5));
          ext[ix] += (wx - ext[ix]) * k;
          ext[ix + 1] += (wy - ext[ix + 1]) * k;
          ext[ix + 2] += (wz - ext[ix + 2]) * k;
        } else if (wx || wy || wz) {
          pos[ix] += wx * dt * 0.6; pos[ix + 1] += wy * dt * 0.6; pos[ix + 2] += wz * dt * 0.6;
          if (s.vel) { s.vel[ix] += wx * dt * 2; s.vel[ix + 1] += wy * dt * 2; s.vel[ix + 2] += wz * dt * 2; }
          moved = true;
        }
      }
      if (moved) s.geo.attributes.position.needsUpdate = true;
    }
    return sparks;
  }

  const pv = new THREE.Vector3();
  /** World-space cursor flow at a world point (used by the fireflies). */
  function flowWorld(x, y, z, out) {
    out.set(0, 0, 0);
    if (!cur || mode === 'slash') return out;
    const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (cw <= 0.01) return out;
    pv.set(x, y, z);
    const px = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * W;
    const py = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * H;
    const [fx, fy] = flowAt(px, py, cur);
    if (fx || fy) { toWorld(fx, fy, cw, 1.5, w3); out.set(w3[0], w3[1], w3[2]); }
    return out;
  }

  return {
    update,
    flowWorld,
    get mode() { return mode; },
    set mode(m) { if (Object.hasOwn(MODES, m)) mode = m; },
  };
}
