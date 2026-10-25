// The 'bead' drag kind (design.md's candidate): his collar is a bead on the cursor's ray, so it is
// always exactly under the cursor, but its distance from the camera springs (BEAD.omega, .zeta)
// toward a level hold plane at holdY (standing up to face the camera as it comes down to the
// floor: beadPlane), so a quick flick up the screen lofts him toward the camera before he settles
// into the distance; the wheel or a second finger raise and lower holdY, straight up: his spot on
// the floor kept (`pin`) and the grab offset taking up the gap to the cursor, eased out over
// HOLD.offsetEase from the next move (the cursor's ray his once more). The bead and its goal
// are kept on the ray inside the play area and between his hang height and the ceiling (hold.js
// edgeClamp: the back wall a climb, the floor a skim at his hang height, a side wall across only).
// His body hangs on a one-sided Verlet rope from the collar (ropeStep: slack on a drop, a jolt as
// it pulls tight, kicked now and then and while he thrashes; his heading is never its own: main.js
// keeps the one he had as he was grabbed), and he's thrown in 3D: the collar's velocity, some of the rope's and a lob
// (beadThrow), the ring showing where he'd land while he's moving fast and where he will once
// he's let go (landingPoint). A wall faced more across the screen than in depth (sideWall) is a
// side wall even where the ray finds the inside past it: across only there, never a slide in
// depth. Pure: no three.js, no DOM.

import { CARRY, keepInside } from '../carry.js';
import { HOLD, along, cameraMoved, edgeClamp, levelAxes, rayHit, sampleAt, screenOffset } from '../hold.js';
import { clampTo } from '../steer.js';

/** @typedef {import('../types.js').XYZ} XYZ */
/** @typedef {import('../types.js').XZ} XZ */
/** @typedef {import('../types.js').Bounds} Bounds */
/** @typedef {import('../hold.js').Ray} Ray */
/** @typedef {import('../hold.js').Plane} Plane */
/** @typedef {import('../hold.js').HoldCamera} HoldCamera */

const RAD = Math.PI / 180;

/**
 * The bead: its spring along the ray (`omega` rad/s, `zeta` its damping ratio, at most `maxSpeed`
 * u/s), integrated in steps of `substep`, at most `maxSteps` a frame. The hold height: `hold0`
 * of his height over his hang height as he's grabbed (`touchHold0` by a finger, so the ring shows
 * over it; a finger's plane leant back so he goes `touchDepth` as far: beadPlane), eased in from his collar with a critically
 * damped `holdIn` s halflife for `holdInFor` s, then following its goal at `holdFollow`; never
 * more than `holdMost` of his height over his hang height; the wheel moves it `wheel` of his height
 * per CSS px, a second finger `finger`. The plane: level from `blendFrom` of elevation up, upright
 * by `blendTo`. The rope: `rope` long (collar to his middle), damped `ropeDamp` a second, under
 * `gravity`, its tilt soft-clamped to `tiltMax` (read as though his middle hung `tiltDown` of it
 * under the collar or more), turning at most `tiltRate` rad/s; kicked `kickMin`–`kickMax` u/s across the floor every `kickEvery` s,
 * and every `thrashEvery` s while he thrashes. The throw: the collar's
 * velocity plus `bob` of the rope's, `depth` of its part toward or away from the camera, at most
 * `maxLevel` u/s, lobbed by `lob` of its speed across over `lobFrom` u/s, `up`/`down` at most up
 * and down. The ring: where he'd land while he's carried faster than `ringSpeed` u/s across,
 * eased there with a `ringHalf` s halflife, else under his collar; In the Mix never under
 * `ringFloor` while he's held. A height change keeps his spot on the floor till the
 * pointer moves `pinMove` CSS px; its gap to the cursor then eases out over HOLD.offsetEase, or at
 * `pinRate` CSS px a second for a bigger one. The top band: the stage's top `band`, where the
 * mouse going up lifts his hold height up to `bandLift` of his height more (smoothly, from where
 * he was grabbed), so a plain drag lifts him with no hidden control (a finger has its second one). Once his collar has been
 * `floorGap` over his hang height it's kept there or higher, so his limp, swinging feet never brush it.
 */
export const BEAD = {
  omega: 14,
  zeta: 0.65,
  maxSpeed: 8,
  substep: 1 / 120,
  maxSteps: 8,
  hold0: 0.45,
  touchHold0: 0.15,
  touchDepth: 0.6,
  holdIn: 0.06,
  holdInFor: 0.3,
  holdFollow: 0.08,
  holdMost: 2.4,
  wheel: 0.001,
  finger: 0.008,
  blendFrom: 35 * RAD,
  blendTo: 12 * RAD,
  rope: 0.55,
  ropeDamp: 2.5,
  gravity: 9.8,
  tiltMax: 1.1,
  tiltDown: 0.3,
  tiltRate: 15,
  kickMin: 0.6,
  kickMax: 1,
  kickEvery: /** @type {readonly [number, number]} */ ([2.5, 6]),
  thrashEvery: 0.3,
  bob: 0.3,
  depth: 0.3,
  lob: 0.35,
  lobFrom: 1,
  maxLevel: 4,
  up: 3,
  down: -3,
  ringSpeed: 1,
  ringHalf: 0.06,
  ringFloor: 0.35,
  pinMove: 1,
  floorGap: 0.06,
  band: 0.18,
  bandLift: 1.6,
  pinRate: 300,
};

/** His height, world units (area.js NEWT_HEIGHT). */
const H = 1;
/** His soles under his hang height (main.js HANG_GAP): the rope's length to his feet. */
const HANG_GAP = 0.06;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (u) => u * u * (3 - 2 * u);
/** How far along a unit ray a point is. */
const sOf = (ray, p) => (p.x - ray.o.x) * ray.d.x + (p.y - ray.o.y) * ray.d.y + (p.z - ray.o.z) * ray.d.z;
/** Steps of at most BEAD.substep over `dt`, at most BEAD.maxSteps. */
const stepsOf = (dt) => Math.min(BEAD.maxSteps, Math.max(1, Math.ceil(dt / BEAD.substep - 1e-9)));

/**
 * The exact critically damped step of `x` (going at `v`) toward `goal` over `dt` with a `half` s
 * halflife (Holden's form).
 * @param {number} x
 * @param {number} v
 * @param {number} goal
 * @param {number} half
 * @param {number} dt
 * @returns {[number, number]}
 */
export function damp(x, v, goal, half, dt) {
  const y = (2 * Math.LN2) / Math.max(1e-6, half);
  const j0 = x - goal;
  const j1 = v + j0 * y;
  const e = Math.exp(-y * dt);
  return [e * (j0 + j1 * dt) + goal, e * (v - j1 * y * dt)];
}

/**
 * The plane the bead springs toward: level at `holdY` with the camera BEAD.blendFrom up or more,
 * stood up to face it (its normal the level way toward the camera) by BEAD.blendTo, smoothly
 * between, through `through`'s spot on the floor at `holdY`. For a finger (`touch`), leant back
 * further, so a move up the screen carries him BEAD.touchDepth as far away (a phone's px are a
 * long way across the floor) and lifts him a little: from a plane at θ from level a move goes
 * 1 / (1 + cot β tan θ) as far as from a level one, β the camera's elevation.
 * @param {HoldCamera} camera
 * @param {XZ} through
 * @param {number} holdY
 * @param {boolean} [touch]
 * @returns {Plane}
 */
export function beadPlane(camera, through, holdY, touch = false) {
  let w = smooth(clamp((BEAD.blendFrom - camera.elevation) / (BEAD.blendFrom - BEAD.blendTo), 0, 1));
  if (touch && w < 1) {
    const tb = Math.tan(clamp(camera.elevation, 5 * RAD, 85 * RAD));
    const tm = w / (1 - w);
    const tt = ((1 + tm / tb) / BEAD.touchDepth - 1) * tb;
    w = tt / (1 + tt);
  }
  const { toward } = levelAxes(camera.yaw);
  const n = { x: toward.x * w, y: 1 - w, z: toward.z * w };
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  return { point: { x: through.x, y: holdY, z: through.z }, normal: { x: n.x / len, y: n.y / len, z: n.z / len } };
}

/**
 * How far into the stage's top band (its top BEAD.band) client y `y` is: 0 at its lower edge and
 * under, 1 at the stage's top, smoothly between; 0 with no stage.
 * @param {number} y
 * @param {{top: number, height: number}|undefined} stage
 */
export function bandShare(y, stage) {
  if (!stage || !(stage.height > 0)) return 0;
  const h = BEAD.band * stage.height;
  return smooth(clamp((stage.top + h - y) / h, 0, 1));
}

/**
 * @typedef {object} Bead  the bead on the cursor's ray
 * @property {number} s  how far along it from the camera, world units
 * @property {number} v  how fast that changes
 */

/**
 * The bead's spring over `dt` toward `goal` (a distance along the ray) at BEAD.omega and .zeta, at
 * most BEAD.maxSpeed, kept within [lo, hi] (stopped there: nothing moving on into the limit).
 * Updates `b`.
 * @param {Bead} b
 * @param {number} goal
 * @param {number} lo
 * @param {number} hi
 * @param {number} dt
 * @returns {Bead}
 */
export function beadStep(b, goal, lo, hi, dt) {
  if (!(dt > 0)) return b;
  const n = stepsOf(dt);
  const h = dt / n;
  const w = BEAD.omega;
  for (let i = 0; i < n; i++) {
    b.v = clamp(b.v + (w * w * (goal - b.s) - 2 * BEAD.zeta * w * b.v) * h, -BEAD.maxSpeed, BEAD.maxSpeed);
    b.s += b.v * h;
    if (b.s < lo) {
      b.s = lo;
      b.v = Math.max(0, b.v);
    } else if (b.s > hi) {
      b.s = hi;
      b.v = Math.min(0, b.v);
    }
  }
  return b;
}

/**
 * @typedef {object} Rope  his body on a rope from the collar
 * @property {XYZ} bob  his middle
 * @property {XYZ} prev  where it was a step ago (Verlet: its velocity)
 * @property {XYZ} top  the collar it hangs from
 * @property {number} h  the last step, s
 */

/**
 * A rope hanging still from `collar`.
 * @param {XYZ} collar
 * @returns {Rope}
 */
export function hangRope(collar) {
  const bob = { x: collar.x, y: collar.y - BEAD.rope, z: collar.z };
  return { bob, prev: { ...bob }, top: { ...collar }, h: BEAD.substep };
}

/**
 * The rope over `dt`, its top moved straight from where it was to `collar`: Verlet steps (at most
 * BEAD.substep, BEAD.maxSteps a frame) damped BEAD.ropeDamp, under BEAD.gravity, the bob never
 * further than BEAD.rope from the top (one-sided: a drop lets it go slack, and it jolts as it
 * pulls tight). Updates `r`.
 * @param {Rope} r
 * @param {XYZ} collar
 * @param {number} dt
 * @returns {Rope}
 */
export function ropeStep(r, collar, dt) {
  if (dt > 0) {
    const n = stepsOf(dt);
    const h = dt / n;
    const keep = 1 - BEAD.ropeDamp * h;
    const from = r.top;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const tx = from.x + (collar.x - from.x) * k;
      const ty = from.y + (collar.y - from.y) * k;
      const tz = from.z + (collar.z - from.z) * k;
      const b = r.bob;
      let x = b.x + (b.x - r.prev.x) * keep;
      let y = b.y + (b.y - r.prev.y) * keep - BEAD.gravity * h * h;
      let z = b.z + (b.z - r.prev.z) * keep;
      const len = Math.hypot(x - tx, y - ty, z - tz);
      if (len > BEAD.rope) {
        const s = BEAD.rope / len;
        x = tx + (x - tx) * s;
        y = ty + (y - ty) * s;
        z = tz + (z - tz) * s;
      }
      r.prev = b;
      r.bob = { x, y, z };
    }
    r.h = h;
  }
  r.top = { x: collar.x, y: collar.y, z: collar.z };
  return r;
}

/**
 * The rope's bob velocity (its last step's), u/s.
 * @param {Rope} r
 * @returns {XYZ}
 */
export const ropeVelocity = (r) => ({
  x: (r.bob.x - r.prev.x) / r.h,
  y: (r.bob.y - r.prev.y) / r.h,
  z: (r.bob.z - r.prev.z) / r.h,
});

/**
 * A kick: `speed` u/s added to the bob along the level way `dir` (unit). Updates `r`.
 * @param {Rope} r
 * @param {XZ} dir
 * @param {number} speed
 */
export function kickRope(r, dir, speed) {
  r.prev = { x: r.prev.x - dir.x * speed * r.h, y: r.prev.y, z: r.prev.z - dir.z * speed * r.h };
}

/**
 * His root's tilt from the rope (root.rotation, as carry.js's swing: tilt.z positive puts his feet
 * toward +x, tilt.x positive toward −z), the whole lean soft-clamped to BEAD.tiltMax. Read as
 * though his middle hung at least BEAD.tiltDown of the rope under the collar: on a fast drop the
 * rope goes slack and his middle can ride up level with the collar or over it, where a tilt read
 * from it would flip him from one side to the other in a frame.
 * @param {Rope} r
 * @returns {XZ}
 */
export function ropeTilt(r) {
  const down = Math.max(r.top.y - r.bob.y, BEAD.tiltDown * BEAD.rope);
  const x = Math.atan2(-(r.bob.z - r.top.z), down);
  const z = Math.atan2(r.bob.x - r.top.x, down);
  const a = Math.hypot(x, z);
  const k = a > 1e-9 ? (BEAD.tiltMax * Math.tanh(a / BEAD.tiltMax)) / a : 1;
  return { x: x * k, z: z * k };
}

/**
 * Where a throw lands: from `feet` (his lowest point) at `v` under carry.js's fall gravity, down
 * to the floor, kept inside `bounds` (a throw at an edge drops by it: carry.js fallStep).
 * @param {XYZ} feet
 * @param {XYZ} v
 * @param {Bounds|null} [bounds]
 * @returns {XZ}
 */
export function landingPoint(feet, v, bounds = null) {
  const g = CARRY.fallGravity;
  const y0 = Math.max(0, feet.y - CARRY.floorY);
  const t = (v.y + Math.sqrt(v.y * v.y + 2 * g * y0)) / g;
  const p = { x: feet.x + v.x * t, z: feet.z + v.z * t };
  return bounds ? clampTo(bounds, p) : p;
}

/**
 * Whether `p` is out past a side wall: the way out through the nearest edge (steer.js clampTo)
 * is at least as much across the screen (`right`) as toward or away from the camera (`toward`),
 * within a few degrees of the diagonal. Null when it's inside.
 * @param {XYZ} p
 * @param {Bounds|null} bounds
 * @param {{toward: XZ, right: XZ}} axes
 * @returns {boolean|null}
 */
export function sideWall(p, bounds, { toward, right }) {
  if (!bounds) return null;
  const q = clampTo(bounds, p);
  const nx = p.x - q.x;
  const nz = p.z - q.z;
  if (Math.hypot(nx, nz) <= 1e-7) return null;
  return Math.abs(nx * right.x + nz * right.z) >= 0.8 * Math.abs(nx * toward.x + nz * toward.z);
}

/**
 * The throw: the solved collar's velocity over the shared window (hold.js HOLD.lead and .span
 * before `t`, as releaseVelocity reads it), plus BEAD.bob of the rope's; while he's pushed out
 * against an edge, none across (today's rule); BEAD.depth of its part toward or away from the
 * camera (`toward`, its level way toward it: a px up the screen is about 1.8 times the world one
 * across is, and the bead runs along the ray faster still as it lofts, so a flick up would throw
 * him much further than the same flick across); no faster than BEAD.maxLevel in any direction (a
 * flick up the screen throws him up and away, not as far as one across), lobbed by BEAD.lob of
 * its speed across over BEAD.lobFrom, and BEAD.up/down at most up and down.
 * @param {Array<{t: number, x: number, y: number, z: number}>} samples  the solved collar's
 * @param {number} t
 * @param {XYZ} bob  the rope's velocity
 * @param {XZ|null} push
 * @param {XZ} [toward]  the camera's level way toward it (hold.js levelAxes); left out, no
 *   depth share
 * @returns {XYZ}
 */
export function beadThrow(samples, t, bob, push, toward) {
  let x = 0;
  let y = 0;
  let z = 0;
  if (samples.length >= 2) {
    const t1 = Math.min(t - HOLD.lead, samples[samples.length - 1].t);
    const t0 = Math.max(t1 - HOLD.span, samples[0].t);
    if (t1 - t0 > 1e-4) {
      const a = sampleAt(samples, t0);
      const b = sampleAt(samples, t1);
      x = (b.x - a.x) / (t1 - t0);
      y = (b.y - a.y) / (t1 - t0);
      z = (b.z - a.z) / (t1 - t0);
    }
  }
  x = push ? 0 : x + BEAD.bob * bob.x;
  z = push ? 0 : z + BEAD.bob * bob.z;
  y += BEAD.bob * bob.y;
  if (toward) {
    const d = (1 - BEAD.depth) * (x * toward.x + z * toward.z);
    x -= d * toward.x;
    z -= d * toward.z;
  }
  const speed = Math.hypot(x, y, z);
  if (speed > BEAD.maxLevel) {
    const k = BEAD.maxLevel / speed;
    x *= k;
    y *= k;
    z *= k;
  }
  const level = Math.hypot(x, z);
  const lob = level > BEAD.lobFrom ? BEAD.lob * level : 0;
  return { x, y: clamp(y + lob, BEAD.down, BEAD.up), z };
}

/**
 * @typedef {object} BeadState  the bead hold as it is, for the tests
 * @property {number} s
 * @property {number} v
 * @property {number} goal
 * @property {number} holdY
 * @property {number} holdGoal
 * @property {Rope} rope
 * @property {XZ|null} ring
 */

/**
 * The bead hold.
 * @param {import('./index.js').HoldDeps} [deps]
 * @returns {import('../hold.js').Hold & {readonly state: BeadState}}
 */
export function createBeadHold(deps = {}) {
  const rng = deps.rng ?? Math.random;
  let off0 = { x: 0, y: 0 };
  let t0 = 0;
  /** @type {Bead} */
  const bead = { s: 0, v: 0 };
  let goal = 0;
  let holdY = 1;
  let holdV = 0;
  let holdGoal = 1;
  let low = 0.6;
  let from = 0.6;
  let clear = false;
  /** @type {Plane|null} */
  let plane = null;
  /** @type {XZ} */
  let through = { x: 0, z: 0 };
  /** @type {HoldCamera|null} */
  let view = null;
  /** @type {XYZ} */
  let anchor = { x: 0, y: 0, z: 0 };
  let rope = hangRope(anchor);
  /** @type {XZ} his root's tilt as drawn */
  let tilt = { x: 0, z: 0 };
  let kickAt = Infinity;
  let thrashAt = Infinity;
  /** @type {XZ|null} */
  let ring = null;
  /** @type {XZ|null} */
  let landing = null;
  let wasSide = false;
  /** @type {Bounds|null} */
  let area = null;
  /** Grabbed by a finger. */
  let touch = false;
  /**
   * A height change under way: his spot on the floor kept, his collar `y0` plus how far the hold
   * height has moved since `h0`, till the pointer leaves `px`.
   * @type {{x: number, z: number, y0: number, h0: number, px: {x: number, y: number}}|null}
   */
  let pin = null;
  /** The pin's gap to the cursor, CSS px: the grab offset taking it up, eased out from `exAt`. */
  let extra = { x: 0, y: 0 };
  let exAt = -Infinity;
  let exFor = HOLD.offsetEase;
  /** @type {{x: number, y: number}|null} */
  let lastPx = null;
  /** The top band's share where he was grabbed (null till the first frame). */
  /** @type {number|null} */
  let band0 = null;
  /** The pin's gap as it eases out: all of it while pinned. */
  const extraAt = (t) => (pin ? extra : screenOffset(extra, exAt, t, exFor));

  const nextKick = (t) => t + BEAD.kickEvery[0] + (BEAD.kickEvery[1] - BEAD.kickEvery[0]) * rng();
  const kick = () => {
    const a = rng() * 2 * Math.PI;
    kickRope(rope, { x: Math.cos(a), z: Math.sin(a) }, BEAD.kickMin + (BEAD.kickMax - BEAD.kickMin) * rng());
  };
  /** His soles: down the rope from the collar, as far as he hangs. */
  const feet = () => {
    const k = Math.max(0.3, low - HANG_GAP) / BEAD.rope;
    return {
      x: anchor.x + (rope.bob.x - anchor.x) * k,
      y: anchor.y + (rope.bob.y - anchor.y) * k,
      z: anchor.z + (rope.bob.z - anchor.z) * k,
    };
  };
  const lift = (dh) => {
    holdGoal = clamp(holdGoal + dh, low + BEAD.floorGap, low + BEAD.holdMost * H);
    if (!pin && lastPx) pin = { x: anchor.x, z: anchor.z, y0: anchor.y, h0: holdY, px: { ...lastPx } };
  };

  return {
    kind: 'bead',
    feel: { groundCues: 'mix', squash: true, fingerLift: 80, secondFinger: true },
    get plane() {
      return plane;
    },
    get state() {
      return { s: bead.s, v: bead.v, goal, holdY, holdGoal, rope, ring };
    },
    get landing() {
      return landing;
    },
    start({ t, collar, press, collarPx, rayAt, camera, low: hang, bounds, touch: byFinger }) {
      t0 = t;
      touch = Boolean(byFinger);
      area = bounds;
      off0 = { x: collarPx.x - press.x, y: collarPx.y - press.y };
      bead.s = Math.max(0, sOf(rayAt(collarPx.x, collarPx.y), collar));
      bead.v = 0;
      goal = bead.s;
      low = hang;
      from = collar.y;
      clear = collar.y >= hang - 1e-6;
      holdY = collar.y;
      holdV = 0;
      holdGoal = hang + (touch ? BEAD.touchHold0 : BEAD.hold0) * H;
      through = { x: collar.x, z: collar.z };
      view = camera;
      plane = beadPlane(camera, through, holdY, touch);
      anchor = { x: collar.x, y: collar.y, z: collar.z };
      rope = hangRope(collar);
      tilt = { x: 0, z: 0 };
      kickAt = nextKick(t);
      thrashAt = Infinity;
      ring = null;
      landing = null;
      wasSide = false;
      pin = null;
      extra = { x: 0, y: 0 };
      exAt = -Infinity;
      lastPx = null;
      band0 = null;
    },
    step({ t, dt, px, rayAt, camera, low: hang, bounds, carry, clip, project, stage }) {
      low = hang;
      area = bounds;
      // (The pointer away from a height change: the cursor's ray his again, the gap easing out.)
      const unpinned = pin !== null && Math.hypot(px.x - pin.px.x, px.y - pin.px.y) > BEAD.pinMove;
      if (unpinned) {
        pin = null;
        exAt = t;
        exFor = Math.max(HOLD.offsetEase, Math.hypot(extra.x, extra.y) / BEAD.pinRate);
      }
      lastPx = { x: px.x, y: px.y };
      const off0t = screenOffset(off0, t0, t);
      const ex = extraAt(t);
      const off = { x: off0t.x + ex.x, y: off0t.y + ex.y };
      const ray = rayAt(px.x + off.x, px.y + off.y);
      if (unpinned) {
        bead.s = Math.max(0, sOf(ray, anchor));
        bead.v = 0;
      }
      // (A user orbit or zoom: the bead onto the new ray where it's nearest him, the plane through him.)
      if (view && cameraMoved(view, camera)) {
        bead.s = Math.max(0, sOf(ray, anchor));
        through = { x: anchor.x, z: anchor.z };
      }
      view = camera;
      // (The hold height: eased in from his collar as he's grabbed, then following its goal.)
      // (Up into the stage's top band, the hold height lifts: the most he's lifted there over where
      // he was grabbed. Not for a finger: it has a second finger, and its plane lifts him already.)
      const u = touch ? 0 : bandShare(px.y, stage);
      if (band0 === null) band0 = u;
      const goalY = clamp(
        holdGoal + BEAD.bandLift * H * Math.max(0, u - band0),
        low + BEAD.floorGap,
        low + BEAD.holdMost * H,
      );
      [holdY, holdV] = damp(holdY, holdV, goalY, t - t0 < BEAD.holdInFor ? BEAD.holdIn : BEAD.holdFollow, dt);
      plane = beadPlane(camera, through, holdY, touch);
      // (The floor: BEAD.floorGap over his hang height once he's been there; before, no lower than
      // he was grabbed.)
      if (anchor.y >= low + BEAD.floorGap - 1e-6) clear = true;
      const floorY = clear ? low + BEAD.floorGap : Math.min(from, low);
      const axes = levelAxes(camera.yaw);
      const edges = { bounds, low: floorY, high: CARRY.liftMax, toward: axes.toward };
      // (The goal: where the ray meets the plane, a grazing ray keeping the last, kept inside along
      // the ray; the bead sprung toward it between the floor and the ceiling. Past a side wall,
      // across only: there, never along the ray.)
      /** @type {{p: XYZ, clamp: string, push?: XZ|null}} */
      let at;
      if (pin) {
        // (A height change: straight up or down over his spot on the floor.)
        at = { p: { x: pin.x, y: clamp(pin.y0 + holdY - pin.h0, floorY, CARRY.liftMax), z: pin.z }, clamp: 'none' };
        bead.v = 0;
      } else {
        const hit = rayHit(ray, plane);
        if (hit) goal = sOf(ray, hit);
        const want = along(ray, goal);
        const kept = edgeClamp(ray, want, edges);
        const across = kept.clamp !== 'none' && sideWall(want, bounds, axes) === true;
        const g = kept.clamp === 'side' || across ? goal : sOf(ray, kept.p);
        const ys =
          Math.abs(ray.d.y) > 1e-9 ? [(CARRY.liftMax - ray.o.y) / ray.d.y, (floorY - ray.o.y) / ray.d.y] : null;
        const lo = ys ? Math.max(0, Math.min(ys[0], ys[1])) : 0;
        const hi = ys ? Math.max(ys[0], ys[1]) : Infinity;
        beadStep(bead, g, lo, Math.max(lo, hi), dt);
        // (On the ray, inside; a wall along the ray stops the bead there; with nothing inside near
        // enough on the ray, a side wall: across only, a gap allowed.)
        at = edgeClamp(ray, along(ray, bead.s), edges);
        if (across && bounds) {
          const k = keepInside(bounds, want, { normal: { x: axes.toward.x, y: 0, z: axes.toward.z } });
          const out = Math.hypot(want.x - k.x, want.z - k.z);
          at = {
            p: { x: k.x, y: clamp(want.y, floorY, CARRY.liftMax), z: k.z },
            clamp: 'side',
            push: out > 1e-9 ? { x: (want.x - k.x) / out, z: (want.z - k.z) / out } : null,
          };
        } else if (at.clamp === 'ray') {
          const s = sOf(ray, at.p);
          if ((s - bead.s) * bead.v < 0) bead.v = 0;
          bead.s = s;
        }
      }
      anchor = at.p;
      // (Pinned, the grab offset takes up the gap to the cursor.)
      if (pin && project) {
        const on = project(anchor);
        extra = { x: on.x - px.x - off0t.x, y: on.y - px.y - off0t.y };
      }
      const side = at.clamp === 'side';
      const pulse = side && !wasSide;
      wasSide = side;
      // (The rope from the collar, kicked now and then, and while he thrashes.)
      if (t >= kickAt) {
        kick();
        kickAt = nextKick(t);
      }
      if (clip === 'Thrash') {
        if (t >= thrashAt || thrashAt === Infinity) {
          kick();
          thrashAt = t + BEAD.thrashEvery;
        }
      } else thrashAt = Infinity;
      ropeStep(rope, anchor, dt);
      // (His tilt toward the rope's, never faster than BEAD.tiltRate: a slack rope's bob passing
      // close under the collar would turn him over in a frame.)
      const want = ropeTilt(rope);
      const dx = want.x - tilt.x;
      const dz = want.z - tilt.z;
      const turn = Math.hypot(dx, dz);
      const most = BEAD.tiltRate * Math.max(0, dt);
      const share = turn > most ? most / turn : 1;
      tilt = { x: tilt.x + dx * share, z: tilt.z + dz * share };
      const vel = carry?.vel ?? { x: 0, y: 0, z: 0 };
      const speed = Math.hypot(vel.x, vel.z);
      // (The ring: where he'd land if let go now while he's moving fast, else under his collar
      // (eased, so not his swinging hips: a still let-go lands him there, release).)
      const fast = speed > BEAD.ringSpeed;
      const spot =
        carry && fast
          ? landingPoint(feet(), beadThrow(carry.samples, t, ropeVelocity(rope), carry.push, axes.toward), bounds)
          : anchor;
      const k = dt > 0 ? 1 - Math.pow(0.5, dt / BEAD.ringHalf) : 0;
      ring = ring
        ? { x: ring.x + (spot.x - ring.x) * k, z: ring.z + (spot.z - ring.z) * k }
        : { x: anchor.x, z: anchor.z };
      return {
        anchor: { ...anchor },
        plane: null,
        push: side ? at.push : null,
        holdY,
        tilt: { ...tilt },
        cues: { ring: { ...ring }, floor: BEAD.ringFloor, pulse },
      };
    },
    grabbedAt(t, collar, project) {
      const c = project(collar);
      const o = screenOffset(off0, t0, t);
      const ex = extraAt(t);
      return { x: c.x - o.x - ex.x, y: c.y - o.y - ex.y };
    },
    release(carry, t) {
      const v = beadThrow(
        carry.samples,
        t,
        ropeVelocity(rope),
        carry.push,
        view ? levelAxes(view.yaw).toward : undefined,
      );
      const f = feet();
      // (Let go still: he falls to the ring, under his collar, wherever his swing had his feet.)
      if (ring && Math.hypot(carry.vel.x, carry.vel.z) <= BEAD.ringSpeed) {
        const y0 = Math.max(0, f.y - CARRY.floorY);
        const g = CARRY.fallGravity;
        const fall = (v.y + Math.sqrt(v.y * v.y + 2 * g * y0)) / g;
        if (fall > 1e-3) {
          const p = landingPoint(f, v);
          v.x += (ring.x - p.x) / fall;
          v.z += (ring.z - p.z) / fall;
        }
      }
      landing = landingPoint(f, v, area);
      return v;
    },
    onWheel(dy) {
      lift(-dy * BEAD.wheel * H);
      return true;
    },
    onSecondFinger(dy) {
      lift(-dy * BEAD.finger * H);
    },
  };
}
