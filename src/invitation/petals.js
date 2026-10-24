// The rose petals round the envelope, as pure maths (envelopeScene.js draws them, instanced, in
// three toon reds with an ink edge): three shapes (rounded, cupped, curled) as small curved grids
// (petalGrid), a few sizes, and for each petal its own tumble (a spin axis and rate), flutter (a
// side-to-side sway with a rock to match) and drift, seeded so every visit is the same. The
// flows that launch them (FLOWS): a soft, staggered flurry as the letter appears; a stir of a few
// under a hover or a touch (held back if it comes too often); the seal blooming, a tight ring of
// petals that unfurl outward like a rose opening and lift away; a burst up out of the opened
// letter; a spill down on a skip; and while it floats a trickle of one now and then at most.
// Never more than POOL at once (the oldest go first), and none at all with reduced motion.
// Units: letter widths, x right, y up, z toward the camera, from the origin a flow is given.
import { createRng } from './rng.js';

/** The shapes, each its own instanced mesh in the scene. */
export const PETAL_SHAPES = /** @type {const} */ (['round', 'cupped', 'curled']);
/** @typedef {typeof PETAL_SHAPES[number]} PetalShape */
/** The sizes, as shares of PETAL_LEN. */
export const PETAL_SIZES = [0.75, 1, 1.3];
/** A petal's length at size 1, letter widths. */
export const PETAL_LEN = 0.085;
/** The most at once (a few dozen: the oldest go first). */
export const POOL = 40;
/** While it floats, a petal trickles every this many seconds (at most). */
export const TRICKLE_EVERY = 2.4;

/**
 * How many each flow launches; a stir is held back for `gap` seconds after the last.
 */
export const FLOWS = {
  spawn: { n: 14 },
  stir: { n: 3, gap: 0.3 },
  bloom: { n: 9 },
  burst: { n: 12 },
  spill: { n: 12 },
  trickle: { n: 1 },
};
/** @typedef {keyof typeof FLOWS} FlowKind */

/** Each shape's outline and curve (petalGrid). */
const SHAPES = {
  // Wide near the top, a little notch at the tip, a shallow cup.
  round: { w: 0.44, p: 0.55, bias: 1.5, start: 0.06, span: 0.88, notch: 0.07, cup: 0.1, bow: 0.06, curl: 0, twist: 0 },
  // Narrower and deep across, like a petal from the heart of the rose.
  cupped: { w: 0.36, p: 0.7, bias: 1.2, start: 0.06, span: 0.88, notch: 0.03, cup: 0.28, bow: 0.03, curl: 0, twist: 0 },
  // Long and pointed, its tip rolled back and a little twisted.
  curled: { w: 0.3, p: 0.85, bias: 1, start: 0.04, span: 0.96, notch: 0, cup: 0.08, bow: 0, curl: 0.45, twist: 0.35 },
};
const ROWS = 6;
const COLS = 4;

/**
 * A petal shape as a small curved grid of triangles, a unit long (y −0.5 at its base to 0.5 at
 * its tip), its face toward +z.
 * @param {PetalShape} shape
 * @returns {{positions: number[], index: number[]}}
 */
export function petalGrid(shape) {
  const s = SHAPES[shape];
  const positions = [];
  for (let j = 0; j <= ROWS; j++) {
    const u = j / ROWS;
    const half = s.w * Math.sin(Math.PI * (s.start + s.span * u ** s.bias)) ** s.p;
    for (let i = 0; i <= COLS; i++) {
      const across = (i / COLS) * 2 - 1;
      let x = across * half;
      let y = u - 0.5;
      if (j === ROWS) y -= s.notch * (1 - across * across);
      let z = s.cup * (x / s.w) ** 2 + s.bow * Math.sin(Math.PI * u) - s.curl * Math.max(0, u - 0.35) ** 2;
      if (s.twist) {
        const a = s.twist * u;
        const zx = z * Math.cos(a) - x * Math.sin(a) * 0.4;
        x = x * Math.cos(a * 0.3) + z * Math.sin(a) * 0.4;
        z = zx;
      }
      positions.push(x, y, z);
    }
  }
  const index = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i;
      const b = a + COLS + 1;
      index.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  return { positions, index };
}

/**
 * @typedef {object} Petal  one petal in flight
 * @property {FlowKind} kind
 * @property {PetalShape} shape
 * @property {number} size  PETAL_SIZES
 * @property {-1|0|1} shade  lighter, as it is, or darker (a step through the three reds)
 * @property {number} born  seconds
 * @property {number} life  seconds
 * @property {number} x  where it starts
 * @property {number} y
 * @property {number} z
 * @property {number} vx  its launch, letter widths a second (it eases off: `drag`)
 * @property {number} vy
 * @property {number} vz
 * @property {number} drag  how fast the launch eases off, a second
 * @property {number} fall  how fast it settles down once it has (negative: it lifts)
 * @property {number} drift  across, letter widths a second (a light wind)
 * @property {number} sway  its flutter across, letter widths
 * @property {number} freq  its flutter's, radians a second
 * @property {number} phase
 * @property {number} rock  how far it rocks with its flutter, radians
 * @property {[number, number, number]} axis  its tumble's (a unit vector)
 * @property {number} rate  its tumble's, radians a second (either way round)
 * @property {number} spin  its tumble at birth, radians
 * @property {number} yaw  which way its tip points on the screen at birth, radians
 * @property {number} unfurl  its tilt toward the camera at birth, radians (a bloom's opens out)
 */

/** A shared clamp and ease. */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/**
 * A quaternion [x, y, z, w] about a unit `axis`.
 * @param {number[]} axis
 * @param {number} angle
 * @returns {[number, number, number, number]}
 */
function qAxis(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {[number, number, number, number]}
 */
function qMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
const X = [1, 0, 0];
const Z = [0, 0, 1];

/**
 * @typedef {object} PetalPose
 * @property {boolean} visible
 * @property {number} x  letter widths
 * @property {number} y
 * @property {number} z
 * @property {[number, number, number, number]} q  its rotation (a unit quaternion)
 * @property {number} scale  its length, letter widths (0 when it isn't there)
 * @property {number} unfurl  its tilt toward the camera now, radians
 */

/** @type {PetalPose} */
const NOWHERE = { visible: false, x: 0, y: 0, z: 0, q: [0, 0, 0, 1], scale: 0, unfurl: 0 };

/**
 * A petal at `t`: its launch easing off into a settle (down, or up for a bloom's), its drift and
 * flutter across, its tumble and rock; growing in and shrinking out. A bloom's petals first
 * unfurl from the bud, then start to tumble.
 * @param {Petal} p
 * @param {number} t
 * @returns {PetalPose}
 */
export function petalAt(p, t) {
  const a = t - p.born;
  if (a < 0 || a >= p.life) return NOWHERE;
  const e = (1 - Math.exp(-p.drag * a)) / p.drag;
  const wave = p.freq * a + p.phase;
  const ramp = Math.min(1, a / 0.4);
  const x = p.x + p.vx * e + p.drift * a + p.sway * Math.sin(wave) * ramp;
  const y = p.y + p.vy * e - p.fall * (a - e);
  const z = p.z + p.vz * e;
  const bloom = p.kind === 'bloom';
  const tumble = bloom ? smooth((a - 0.2) / 0.4) : 1;
  const unfurl = bloom ? 0.25 + (p.unfurl - 0.25) * (1 - easeOut(a / 0.35)) : p.unfurl;
  const roll = p.rock * Math.cos(wave) * ramp * tumble;
  const q = qMul(qAxis(p.axis, (p.spin + p.rate * a) * tumble), qMul(qAxis(Z, p.yaw + roll), qAxis(X, unfurl)));
  const k = a / p.life;
  const grow = bloom ? 0.55 + 0.45 * easeOut(a / 0.3) : easeOut(a / 0.18);
  const shrink = 1 - smooth((k - 0.72) / 0.28);
  return { visible: true, x, y, z, q, scale: PETAL_LEN * p.size * grow * shrink, unfurl };
}

/**
 * @typedef {{x: number, y: number, z: number}} Point
 */

/**
 * The petals in flight and the flows that launch them; `t` is any clock in seconds that only
 * goes forward.
 * @param {{seed?: number, reduced?: boolean}} [o]
 */
export function createPetalFlow({ seed = 7, reduced = false } = {}) {
  const rng = createRng(seed);
  const r = (lo, hi) => lo + (hi - lo) * rng();
  const sign = () => (rng() < 0.5 ? -1 : 1);
  /** @type {Petal[]} */
  let petals = [];
  /** @type {Record<FlowKind, number>} */
  const emitted = { spawn: 0, stir: 0, bloom: 0, burst: 0, spill: 0, trickle: 0 };
  let lastStir = -Infinity;
  /** @type {number|null} */
  let lastTrickle = null;

  /** A tumble axis, leaning across the screen more than toward it (so it shows as a turn). */
  function axis() {
    const a = r(0, Math.PI * 2);
    const tilt = r(-0.6, 0.6);
    const v = [Math.cos(a) * Math.cos(tilt), Math.sin(a) * Math.cos(tilt), Math.sin(tilt)];
    const n = Math.hypot(...v);
    return /** @type {[number, number, number]} */ (v.map((c) => c / n));
  }
  /**
   * One petal's own look and motion, launched from `at` at `t` with `v`.
   * @param {FlowKind} kind
   * @param {number} t
   * @param {Point} at
   * @param {Partial<Petal>} o
   * @returns {Petal}
   */
  function make(kind, t, at, o) {
    const pick = rng();
    /** @type {-1|0|1} */
    const shade = pick < 0.3 ? -1 : pick < 0.72 ? 0 : 1;
    return {
      kind,
      shape: PETAL_SHAPES[Math.floor(rng() * PETAL_SHAPES.length)],
      size: PETAL_SIZES[Math.floor(rng() * PETAL_SIZES.length)],
      shade,
      born: t,
      life: 2,
      x: at.x,
      y: at.y,
      z: at.z,
      vx: 0,
      vy: 0,
      vz: 0,
      drag: 2,
      fall: 0.12,
      drift: r(-0.05, 0.015),
      sway: r(0.02, 0.045),
      freq: r(3, 5),
      phase: r(0, Math.PI * 2),
      rock: r(0.3, 0.7),
      axis: axis(),
      rate: sign() * r(1.5, 5),
      spin: r(0, Math.PI * 2),
      yaw: r(0, Math.PI * 2),
      unfurl: r(-0.8, 0.8),
      ...o,
    };
  }
  /**
   * Launch a flow's petals; how many (none with reduced motion).
   * @param {FlowKind} kind
   * @param {number} t
   * @param {Point} at  where: the letter's middle (spawn, burst, spill), the point (stir), the
   *   seal (bloom, trickle)
   * @param {{radius?: number}} [o]  the seal's radius (bloom), letter widths
   */
  function emit(kind, t, at, { radius = 0.09 } = {}) {
    if (reduced) return 0;
    const n = FLOWS[kind].n;
    for (let i = 0; i < n; i++) {
      /** @type {Petal} */
      let p;
      if (kind === 'spawn') {
        const x = r(-0.55, 0.55);
        p = make(
          kind,
          t + i * 0.04 + r(0, 0.03),
          { x: at.x + x, y: at.y + r(-0.15, 0.45), z: at.z + r(-0.2, 0.3) },
          {
            vx: Math.sign(x || 1) * r(0.1, 0.3),
            vy: r(0.02, 0.18),
            vz: r(0, 0.15),
            drag: 1.5,
            fall: r(0.12, 0.2),
            life: r(2.4, 3.2),
          },
        );
      } else if (kind === 'stir') {
        const a = r(0, Math.PI * 2);
        p = make(
          kind,
          t + i * 0.05,
          { x: at.x + Math.cos(a) * 0.03, y: at.y + Math.sin(a) * 0.03, z: at.z },
          {
            vx: Math.cos(a) * r(0.04, 0.12),
            vy: r(0.05, 0.15),
            vz: r(0.03, 0.12),
            fall: r(0.06, 0.1),
            life: r(1.4, 2),
            size: PETAL_SIZES[Math.floor(rng() * 2)],
          },
        );
      } else if (kind === 'bloom') {
        const a = ((i + r(-0.2, 0.2)) / n) * Math.PI * 2;
        const rr = radius * 0.35;
        p = make(
          kind,
          t,
          { x: at.x + Math.cos(a) * rr, y: at.y + Math.sin(a) * rr, z: at.z + r(0, 0.02) },
          {
            vx: Math.cos(a) * 0.3,
            vy: Math.sin(a) * 0.3,
            vz: r(0.15, 0.3),
            drag: 2.5,
            fall: -r(0.2, 0.3),
            life: r(1.4, 1.8),
            size: PETAL_SIZES[1 + Math.floor(rng() * 2)],
            // (Its tip points out from the middle, folded up toward the camera: the bud.)
            yaw: a - Math.PI / 2,
            unfurl: r(1.15, 1.35),
            spin: 0,
            drift: r(-0.03, 0.01),
          },
        );
      } else if (kind === 'burst') {
        const x = r(-0.4, 0.4);
        p = make(
          kind,
          t + r(0, 0.08),
          { x: at.x + x, y: at.y + r(-0.05, 0.1), z: at.z + r(0, 0.1) },
          {
            vx: x * r(0.6, 1.2),
            vy: r(0.45, 0.8),
            vz: r(0.1, 0.3),
            fall: r(0.18, 0.25),
            life: r(1.3, 1.8),
            rate: sign() * r(3, 6),
          },
        );
      } else if (kind === 'spill') {
        p = make(
          kind,
          t + r(0, 0.06),
          { x: at.x + r(-0.45, 0.45), y: at.y + r(-0.25, 0.25), z: at.z + r(0, 0.15) },
          {
            vx: r(-0.15, 0.15),
            vy: -r(0.3, 0.6),
            vz: r(0.1, 0.2),
            fall: r(0.5, 0.8),
            life: r(0.9, 1.2),
            rate: sign() * r(3.5, 6.5),
          },
        );
      } else {
        p = make(
          kind,
          t,
          { x: at.x + r(-0.04, 0.04), y: at.y, z: at.z },
          {
            vx: r(-0.05, 0.05),
            vy: r(-0.02, 0.05),
            vz: 0.05,
            fall: r(0.08, 0.12),
            life: r(3, 4),
          },
        );
      }
      petals.push(p);
    }
    if (petals.length > POOL) petals = petals.slice(petals.length - POOL);
    emitted[kind] += n;
    return n;
  }

  return {
    emit,
    /**
     * A stir at `at` (a hover or a touch), unless one was just now.
     * @param {number} t
     * @param {Point} at
     */
    stir(t, at) {
      if (reduced || t - lastStir < FLOWS.stir.gap) return 0;
      lastStir = t;
      return emit('stir', t, at);
    },
    /**
     * On to `t`: the petals that are done go; a trickle from `trickle` (while it floats) now
     * and then, none without it.
     * @param {number} t
     * @param {Point|null} trickle
     */
    step(t, trickle) {
      petals = petals.filter((p) => t - p.born < p.life);
      if (!trickle || reduced) {
        lastTrickle = null;
        return;
      }
      if (lastTrickle === null) lastTrickle = t;
      else if (t - lastTrickle >= TRICKLE_EVERY) {
        lastTrickle = t;
        emit('trickle', t, trickle);
      }
    },
    /**
     * The petals there at `t`, with their poses.
     * @param {number} t
     */
    at(t) {
      return petals.map((petal) => ({ petal, pose: petalAt(petal, t) })).filter((e) => e.pose.visible);
    },
    /**
     * How many are there at `t`.
     * @param {number} t
     */
    live(t) {
      return petals.reduce((n, p) => n + (petalAt(p, t).visible ? 1 : 0), 0);
    },
    /** The petals in flight (or still to be born). */
    get petals() {
      return petals;
    },
    /** How many each flow has launched. */
    get emitted() {
      return { ...emitted };
    },
  };
}
