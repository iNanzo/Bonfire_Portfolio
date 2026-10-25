// The rose petals, as pure maths (petalScene.js draws them, instanced, in three toon reds with an
// ink edge, for the envelope and for the page's petal layer): three shapes (rounded, cupped,
// curled) as small curved grids (petalGrid), a few sizes, and a stepped simulation of each petal
// in flight: its position and velocity, a drag easing it into the air (a gentle wind, a slow fall
// and its own smooth noise), and on top, as drawn, its tumble and flutter. It steps at a fixed
// STEP whatever the frame rate, seeded, so every visit (and every test) is the same. The flows
// (FLOWS): a soft flurry as the letter appears; a slow helix swirl round it while it floats (a
// few strands on an ellipse round the letter, climbing, every fourth spiralling in from further
// out, each petal pulled to its slot, the back half behind the letter), flung outward as it
// opens; a pour up out of its inside as the flap lifts; the seal blooming into a ring of petals
// that unfurl and lift; a burst ring at a click; a cursor trail (createTrail spaces it, caps its
// rate and keeps a held finger going); petals off the letter's trailing edge as it moves (the
// wake); a spill down on a skip. Never more than POOL at once (the oldest go first, the swirl
// kept), and none at all with reduced motion. Units: letter widths, x right, y up, z toward the
// camera.
import { createRng } from './rng.js';

/** The shapes, each its own instanced mesh in the scene. */
export const PETAL_SHAPES = /** @type {const} */ (['round', 'cupped', 'curled']);
/** @typedef {typeof PETAL_SHAPES[number]} PetalShape */
/** The sizes, as shares of PETAL_LEN. */
export const PETAL_SIZES = [0.75, 1, 1.3];
/** A petal's length at size 1, letter widths. */
export const PETAL_LEN = 0.1;
/** A bloom's petals are bigger (a share of PETAL_LEN): a few of them make up the seal. */
export const BLOOM_SIZE = [1.5, 1.9];
/** The most at once (the oldest go first, the swirl kept). */
export const POOL = 120;
/** The simulation's fixed step, seconds: 30 or 60 frames a second step it the same. */
export const STEP = 1 / 60;
/**
 * The envelope's inside and pocket faces, letter widths in front of its middle (envelopeLook.js
 * DEPTH): where the pour starts, behind the pocket, when its LetterFrame doesn't say.
 */
export const LETTER_DEPTHS = { inside: 0.0095, pocket: 0.0325 };

/** How many each flow launches (a ring rolls its count; a trail step comes in 1–3). */
export const FLOWS = {
  spawn: { n: 14 },
  swirl: { n: 24 },
  pour: { n: 16 },
  ring: { n: [10, 14] },
  trail: { n: [1, 3] },
  wake: { n: 1 },
  bloom: { n: 9 },
  spill: { n: 12 },
};
/** @typedef {keyof typeof FLOWS} FlowKind */

/**
 * The swirl round the floating letter, the forge's held-blade aura on the Bonfire site but
 * slower: `strands` helix strands a third of a turn apart on an ellipse `rx` across and `rz` deep
 * (letter widths; its radius swelling in the middle of the climb), seen from a little above (its
 * back raised and its front lowered by `tilt` of its depth, so from the front it reads as a loop,
 * not a line), `span` of the letter's height tall, `turns` round it bottom to top; it spins
 * `spin` radians a second and each petal climbs `climb` of the way a second (the slow end of the
 * forge's). It fills in `delay` seconds after the letter floats, one petal
 * every `every`, each strand's in a run `gap` of the climb apart (a ribbon winding up round it, all
 * of a strand climbing alike, so the strands stay apart and read as a helix); every fourth starts
 * `outer` times further out and falls in at `fall` a second.
 * `pull` is how hard a petal is drawn to its slot.
 */
export const SWIRL = {
  strands: 3,
  rx: 0.7,
  rz: 0.3,
  tilt: 0.45,
  span: 1.3,
  turns: 2.2,
  spin: [0.5, 0.6],
  climb: [0.04, 0.06],
  delay: 0.5,
  every: 0.12,
  gap: 0.035,
  outer: [1.5, 2.1],
  fall: 0.25,
  pull: 7,
};
/**
 * The cursor trail (createTrail): a step every `gap` px (rolled each time), `perStep` petals a
 * step, at most `rate` a second (with `burst` in hand); a press held still `still` seconds keeps
 * `hold` a second coming. Each petal goes at `vel` of the pointer's velocity (at most
 * `maxLaunch` letter widths a second) and lives `life` seconds.
 */
export const TRAIL = {
  gap: [14, 30],
  perStep: [1, 3],
  rate: 20,
  burst: 4,
  hold: 5,
  still: 0.12,
  vel: [0.2, 0.4],
  maxLaunch: 1.6,
  life: [0.9, 2.2],
};
/**
 * The wake: an edge moving faster than `min` letter widths a second (across the screen; toward or
 * away from the camera counts half) sheds petals, `per` more a second for each letter width a
 * second over it, at most `rate` a second. Its bob and sway as it floats stay under `min`.
 */
export const WAKE = { min: 0.065, per: 20, rate: 18 };
/** The air: a light wind across, and its gusts. */
const AIR = { wind: -0.025, gust: 0.02 };

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
 * A hash of an integer to −1…1 (no state: the noise never draws on the seeded generator).
 * @param {number} i
 */
function hash(i) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
/**
 * A smooth value noise in −1…1 (a smoothstep between hashed integers).
 * @param {number} x
 */
export function valueNoise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i);
  return a + (hash(i + 1) - a) * f * f * (3 - 2 * f);
}

/**
 * @typedef {{x: number, y: number, z: number}} Point
 */
/**
 * @typedef {object} LetterFrame  the letter as it is now (petalScene.js reads it off its matrix)
 * @property {Point} c  its middle
 * @property {Point} right  its axes, unit vectors: across, up its face, out of its face (toward
 *   the camera at rest)
 * @property {Point} up
 * @property {Point} fwd
 * @property {number} h  its height, letter widths
 * @property {number} opening  how far its flap has lifted, 0 shut … 1 open
 * @property {boolean} floating  it floats (the swirl goes round it), not yet opened or skipped
 * @property {number} [inside]  how far in front of its middle its inside's face is, letter widths
 *   (the pour starts just in front of it; LETTER_DEPTHS without one)
 * @property {number} [pocket]  and its pocket's face (the pour stays behind it, so the pocket hides
 *   it, till it has risen out of the mouth)
 */
/**
 * @typedef {object} SwirlSlot  a petal's place in the swirl
 * @property {number} strand  which strand (0 … SWIRL.strands − 1)
 * @property {number} s  how far up it has climbed, 0 … 1
 * @property {number} r  its radius, a share of the ellipse (1 on it; more while it falls in)
 * @property {number} climb  how fast it climbs, a second
 * @property {boolean} outer  one of every fourth, that starts further out
 * @property {boolean} infall  it's falling in from further out now
 */
/**
 * @typedef {object} Petal  one petal in flight
 * @property {FlowKind} kind
 * @property {PetalShape} shape
 * @property {number} size  PETAL_SIZES (a bloom's: BLOOM_SIZE)
 * @property {-1|0|1} shade  lighter, as it is, or darker (a step through the three reds)
 * @property {number} born  seconds (the flow's clock)
 * @property {number} life  seconds (Infinity while it's in the swirl)
 * @property {number} fade  how long it shrinks out at the end of its life, seconds
 * @property {number} x  where it is now
 * @property {number} y
 * @property {number} z
 * @property {number} vx  its velocity now, letter widths a second
 * @property {number} vy
 * @property {number} vz
 * @property {Point} start  where it was launched
 * @property {Point} launch  its velocity at launch
 * @property {number} drag  how fast it eases into the air, a second
 * @property {number} fall  the air's settle down (negative: it lifts), letter widths a second
 * @property {number} drift  its own wind across, letter widths a second
 * @property {number} noise  how far its noise pushes it, letter widths a second
 * @property {number} seed  its noise's own offset
 * @property {number} sway  its flutter across, letter widths
 * @property {number} freq  its flutter's, radians a second
 * @property {number} phase
 * @property {number} rock  how far it rocks with its flutter, radians
 * @property {[number, number, number]} axis  its tumble's (a unit vector)
 * @property {number} rate  its tumble's, radians a second (either way round)
 * @property {number} spin  its tumble at birth, radians
 * @property {number} yaw  which way its tip points on the screen at birth, radians
 * @property {number} unfurl  its tilt toward the camera at birth, radians (a bloom's opens out)
 * @property {SwirlSlot|null} slot  its place in the swirl (null: free)
 * @property {number} ends  its size as it left the swirl (the swirl's ends draw it small)
 * @property {number} cut  when it was told to go (Infinity: it lives its life), seconds
 * @property {number} cutFor  how long it takes to go once it's cut, seconds
 */

/** A shared clamp and ease. */
const clamp01 = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
const easeOut = (/** @type {number} */ v) => 1 - (1 - clamp01(v)) ** 3;
const smooth = (/** @type {number} */ v) => {
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
 * The swirl's radius, a share of its ellipse, `s` of the way up: drawn in at the ends, swelling in
 * the middle (the forge aura's).
 * @param {number} s
 */
export const swirlRadius = (s) => 0.8 + 0.35 * Math.sin(Math.PI * clamp01(s));

/**
 * A swirl slot's place round the letter `L` with the swirl spun `spin` radians: on its strand's
 * helix, on the ellipse SWIRL.rx across and SWIRL.rz deep (times its radius), tipped by
 * SWIRL.tilt, `s` of the way up.
 * @param {LetterFrame} L
 * @param {Pick<SwirlSlot, 'strand'|'s'|'r'>} slot
 * @param {number} spin
 * @returns {Point}
 */
export function swirlSlot(L, slot, spin) {
  const a = (slot.strand * 2 * Math.PI) / SWIRL.strands + slot.s * SWIRL.turns * 2 * Math.PI + spin;
  const r = swirlRadius(slot.s) * slot.r;
  const across = Math.cos(a) * SWIRL.rx * r;
  const deep = Math.sin(a) * SWIRL.rz * r;
  const up = (slot.s - 0.5) * SWIRL.span * L.h - deep * SWIRL.tilt;
  return {
    x: L.c.x + L.right.x * across + L.up.x * up + L.fwd.x * deep,
    y: L.c.y + L.right.y * across + L.up.y * up + L.fwd.y * deep,
    z: L.c.z + L.right.z * across + L.up.z * up + L.fwd.z * deep,
  };
}

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
 * A petal as drawn at `t`: where it is, with its flutter across on top; its tumble and rock;
 * growing in and shrinking out (and small at the swirl's ends). A bloom's and a ring's first
 * unfurl from the bud, then start to tumble.
 * @param {Petal} p
 * @param {number} t
 * @returns {PetalPose}
 */
export function petalAt(p, t) {
  const a = t - p.born;
  if (a < 0 || a >= p.life || t >= p.cut + p.cutFor) return NOWHERE;
  const wave = p.freq * a + p.phase;
  const ramp = Math.min(1, a / 0.4);
  const x = p.x + p.sway * Math.sin(wave) * ramp;
  const bud = p.kind === 'bloom' || p.kind === 'ring';
  const tumble = bud ? smooth((a - 0.2) / 0.4) : 1;
  const unfurl = bud ? 0.25 + (p.unfurl - 0.25) * (1 - easeOut(a / 0.35)) : p.unfurl;
  const roll = p.rock * Math.cos(wave) * ramp * tumble;
  const q = qMul(qAxis(p.axis, (p.spin + p.rate * a) * tumble), qMul(qAxis(Z, p.yaw + roll), qAxis(X, unfurl)));
  const grow = p.kind === 'bloom' ? 0.55 + 0.45 * easeOut(a / 0.3) : easeOut(a / (bud ? 0.12 : 0.18));
  const left = p.life - a;
  const shrink = (1 - smooth((p.fade - left) / p.fade)) * (1 - smooth((t - p.cut) / p.cutFor));
  const ends = p.slot ? clamp01(Math.min(p.slot.s * 6, (1 - p.slot.s) * 5)) : p.ends;
  return { visible: true, x, y: p.y, z: p.z, q, scale: PETAL_LEN * p.size * grow * shrink * ends, unfurl };
}

/**
 * The petals in flight and the flows that launch them, on the flow's own clock (`time`, seconds),
 * which `step` moves on.
 * @param {{seed?: number, reduced?: boolean}} [o]
 */
export function createPetalFlow({ seed = 7, reduced = false } = {}) {
  const rng = createRng(seed);
  const r = (/** @type {number} */ lo, /** @type {number} */ hi) => lo + (hi - lo) * rng();
  const sign = () => (rng() < 0.5 ? -1 : 1);
  /** @type {Petal[]} */
  let petals = [];
  /** @type {Record<FlowKind, number>} */
  const emitted = { spawn: 0, swirl: 0, pour: 0, ring: 0, trail: 0, wake: 0, bloom: 0, spill: 0 };
  let t = 0;
  let acc = 0;
  /** The letter now, and as it was at the last call (its wake: how fast its edges move). */
  /** @type {LetterFrame|null} */
  let L = null;
  /** @type {LetterFrame|null} */
  let prev = null;
  let prevAt = 0;
  let wakeDue = 0;
  /** The swirl: its spin and how fast, since when it floats, when the next one comes, how many made. */
  let spin = 0;
  const spinRate = r(SWIRL.spin[0], SWIRL.spin[1]);
  /**
   * The swirl's climb (every strand's alike, so they keep their places), and where each strand's
   * run starts: a whole turn up from the last, so the runs are spread up the letter and still a
   * third of a turn apart round it.
   */
  const climb = r(SWIRL.climb[0], SWIRL.climb[1]);
  const strandBase = Array.from({ length: SWIRL.strands }, (_, k) => ((k / SWIRL.turns) % 1) + r(0, 0.02));
  /** @type {number|null} */
  let floatingSince = null;
  let nextSwirl = 0;
  let made = 0;
  /** A ring's turn (rolled for each). */
  let ringBase = 0;

  /** A tumble axis, leaning across the screen more than toward it (so it shows as a turn). */
  function axis() {
    const a = r(0, Math.PI * 2);
    const tilt = r(-0.6, 0.6);
    const v = [Math.cos(a) * Math.cos(tilt), Math.sin(a) * Math.cos(tilt), Math.sin(tilt)];
    const n = Math.hypot(...v);
    return /** @type {[number, number, number]} */ (v.map((c) => c / n));
  }
  /**
   * One petal's own look and motion, launched from `at` at `born` with `o`'s velocity.
   * @param {FlowKind} kind
   * @param {number} born
   * @param {Point} at
   * @param {Partial<Petal>} o
   * @returns {Petal}
   */
  function make(kind, born, at, o) {
    const pick = rng();
    /** @type {-1|0|1} */
    const shade = pick < 0.3 ? -1 : pick < 0.72 ? 0 : 1;
    /** @type {Petal} */
    const p = {
      kind,
      shape: PETAL_SHAPES[Math.floor(rng() * PETAL_SHAPES.length)],
      size: PETAL_SIZES[Math.floor(rng() * PETAL_SIZES.length)],
      shade,
      born,
      life: 2,
      fade: 0,
      x: at.x,
      y: at.y,
      z: at.z,
      vx: 0,
      vy: 0,
      vz: 0,
      start: { x: 0, y: 0, z: 0 },
      launch: { x: 0, y: 0, z: 0 },
      drag: 2,
      fall: 0.12,
      drift: r(-0.03, 0.01),
      noise: r(0.04, 0.07),
      seed: r(0, 997),
      sway: r(0.02, 0.045),
      freq: r(3, 5),
      phase: r(0, Math.PI * 2),
      rock: r(0.3, 0.7),
      axis: axis(),
      rate: sign() * r(1.5, 5),
      spin: r(0, Math.PI * 2),
      yaw: r(0, Math.PI * 2),
      unfurl: r(-0.8, 0.8),
      slot: null,
      ends: 1,
      cut: Infinity,
      cutFor: 1,
      ...o,
    };
    p.start = { x: p.x, y: p.y, z: p.z };
    p.launch = { x: p.vx, y: p.vy, z: p.vz };
    if (!p.fade) p.fade = Number.isFinite(p.life) ? p.life * 0.28 : 1;
    return p;
  }
  /**
   * Room for one more: the oldest free petal goes (the swirl's only when nothing else is up).
   * @param {Petal} p
   */
  function add(p) {
    petals.push(p);
    while (petals.length > POOL) {
      const i = petals.findIndex((q) => !q.slot);
      petals.splice(i < 0 ? 0 : i, 1);
    }
  }
  /**
   * A point on the letter `F` (across, up, out of its face), in the flow's units.
   * @param {LetterFrame} F
   * @param {number} a
   * @param {number} u
   * @param {number} d
   * @returns {Point}
   */
  const local = (F, a, u, d) => ({
    x: F.c.x + F.right.x * a + F.up.x * u + F.fwd.x * d,
    y: F.c.y + F.right.y * a + F.up.y * u + F.fwd.y * d,
    z: F.c.z + F.right.z * a + F.up.z * u + F.fwd.z * d,
  });

  /**
   * One petal of a flow `emit` launches; null for one it doesn't.
   * @param {FlowKind} kind
   * @param {number} i  which of the flow's
   * @param {number} n  of how many
   * @param {Point} at
   * @param {{radius?: number, v?: Point}} o
   * @returns {Petal|null}
   */
  function one(kind, i, n, at, o) {
    if (kind === 'spawn') {
      const x = r(-0.55, 0.55);
      return make(
        kind,
        t + i * 0.04 + r(0, 0.03),
        { x: at.x + x, y: at.y + r(-0.15, 0.45), z: at.z + r(-0.2, 0.3) },
        {
          vx: Math.sign(x || 1) * r(0.1, 0.3),
          vy: r(-0.04, 0.1),
          vz: r(0, 0.15),
          drag: 1.5,
          fall: r(0.14, 0.22),
          life: r(2.4, 3.2),
        },
      );
    }
    if (kind === 'bloom' || kind === 'ring') {
      const bloom = kind === 'bloom';
      const a = ((i + r(-0.2, 0.2)) / n) * Math.PI * 2 + (bloom ? 0 : ringBase);
      const rr = bloom ? (o.radius ?? 0.09) * 0.35 : 0.02;
      const v = bloom ? 0.3 : r(0.7, 0.95);
      return make(
        kind,
        t,
        { x: at.x + Math.cos(a) * rr, y: at.y + Math.sin(a) * rr, z: at.z + r(0, 0.02) },
        {
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          vz: bloom ? r(0.15, 0.3) : r(0.05, 0.15),
          drag: bloom ? 2.5 : 3.5,
          fall: bloom ? -r(0.2, 0.3) : r(0.05, 0.12),
          noise: r(0.02, 0.035),
          life: bloom ? r(1.4, 1.8) : r(0.85, 1.15),
          ...(bloom ? { size: r(BLOOM_SIZE[0], BLOOM_SIZE[1]) } : {}),
          // (Its tip points out from the middle, folded up toward the camera: the bud.)
          yaw: a - Math.PI / 2,
          unfurl: bloom ? r(1.15, 1.35) : r(0.9, 1.2),
          spin: 0,
        },
      );
    }
    if (kind === 'trail') {
      const v = o.v ?? { x: 0, y: 0, z: 0 };
      const sp = Math.hypot(v.x, v.y);
      let vx;
      let vy;
      if (sp < 1e-6) {
        // (Held still: a soft puff any way.)
        const a = r(0, Math.PI * 2);
        const k = r(0.1, 0.28);
        vx = Math.cos(a) * k;
        vy = Math.sin(a) * k;
      } else {
        const k = Math.min(r(TRAIL.vel[0], TRAIL.vel[1]), TRAIL.maxLaunch / sp);
        const side = sign() * r(0.05, 0.3);
        vx = v.x * k - (v.y / sp) * side;
        vy = v.y * k + (v.x / sp) * side;
      }
      return make(
        kind,
        t,
        { x: at.x + r(-0.012, 0.012), y: at.y + r(-0.012, 0.012), z: at.z + r(-0.03, 0.03) },
        {
          vx,
          vy,
          vz: r(0, 0.1),
          drag: r(2.2, 3.2),
          fall: r(0.08, 0.2),
          noise: r(0.05, 0.09),
          life: r(TRAIL.life[0], TRAIL.life[1]),
        },
      );
    }
    if (kind === 'wake') {
      const v = o.v ?? { x: 0, y: 0, z: 0 };
      const k = r(0.3, 0.6);
      const sp = Math.hypot(v.x, v.y, v.z) * k;
      const cap = sp > 1.2 ? 1.2 / sp : 1;
      return make(
        kind,
        t,
        { ...at },
        {
          vx: v.x * k * cap + r(-0.04, 0.04),
          vy: v.y * k * cap + r(-0.04, 0.04),
          vz: v.z * k * cap + r(0, 0.05),
          drag: 1.5,
          fall: r(0.06, 0.12),
          life: r(1.2, 2),
        },
      );
    }
    if (kind === 'spill') {
      return make(
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
    }
    return null;
  }

  /**
   * Launch a flow's petals; how many (none with reduced motion). The swirl and the pour come of
   * themselves with `letter`.
   * @param {FlowKind} kind
   * @param {Point} at  where: the letter's middle (spawn, spill), the seal (bloom), the pointer
   *   (ring, trail), an edge of the letter (wake)
   * @param {{radius?: number, v?: Point, n?: number}} [o]  the seal's radius (bloom), letter widths;
   *   the pointer's or the edge's velocity (trail, wake), letter widths a second; how many (trail)
   */
  function emit(kind, at, o = {}) {
    if (reduced || kind === 'swirl' || kind === 'pour') return 0;
    let n = 1;
    if (kind === 'ring') n = Math.round(r(FLOWS.ring.n[0] - 0.49, FLOWS.ring.n[1] + 0.49));
    else if (kind === 'trail') n = Math.max(1, Math.round(o.n ?? 1));
    else if (kind === 'spawn' || kind === 'bloom' || kind === 'spill') n = FLOWS[kind].n;
    ringBase = r(0, Math.PI * 2);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const p = one(kind, i, n, at, o);
      if (!p) continue;
      add(p);
      k++;
    }
    emitted[kind] += k;
    return k;
  }

  /**
   * A petal joins the swirl round `F`, the `i`th made.
   * @param {LetterFrame} F
   * @param {number} i
   */
  function joinSwirl(F, i) {
    const per = FLOWS.swirl.n / SWIRL.strands;
    const outer = i % 4 === 0;
    const strand = i % SWIRL.strands;
    /** @type {SwirlSlot} */
    const slot = {
      strand,
      s: (strandBase[strand] + (Math.floor(i / SWIRL.strands) % per) * SWIRL.gap + r(0, 0.008)) % 1,
      r: outer ? r(SWIRL.outer[0], SWIRL.outer[1]) : r(0.97, 1.03),
      climb,
      outer,
      infall: outer,
    };
    const at = swirlSlot(F, slot, spin);
    add(make('swirl', t, at, { slot, life: Infinity, fade: 1, drag: 1.5, fall: r(0.08, 0.15) }));
    emitted.swirl++;
  }
  /**
   * The swirl lets go, flung outward from round the letter (`F`: where it was).
   * @param {LetterFrame|null} F
   */
  function fling(F) {
    for (const p of petals) {
      if (!p.slot) continue;
      p.ends = clamp01(Math.min(p.slot.s * 6, (1 - p.slot.s) * 5));
      p.slot = null;
      const left = r(1.2, 1.8);
      p.life = t - p.born + left;
      p.fade = left * 0.7;
      if (!F) continue;
      const d = { x: p.x - F.c.x, y: p.y - F.c.y, z: p.z - F.c.z };
      const a = d.x * F.right.x + d.y * F.right.y + d.z * F.right.z;
      const b = d.x * F.fwd.x + d.y * F.fwd.y + d.z * F.fwd.z;
      const m = Math.hypot(a, b) || 1;
      const out = r(0.6, 1);
      const up = r(0.05, 0.25);
      p.vx += ((F.right.x * a + F.fwd.x * b) / m) * out + F.up.x * up;
      p.vy += ((F.right.y * a + F.fwd.y * b) / m) * out + F.up.y * up;
      p.vz += ((F.right.z * a + F.fwd.z * b) / m) * out + F.up.z * up;
    }
  }
  /**
   * One petal poured up out of the letter's inside (below its mouth, just in front of the inside's
   * face and behind the pocket's, so the pocket hides it till it rises out).
   * @param {LetterFrame} F
   */
  function pourOne(F) {
    const a = r(-0.42, 0.42);
    const down = r(0.02, 0.06 + (0.42 - Math.abs(a)) * 0.5 * F.h);
    const inside = F.inside ?? LETTER_DEPTHS.inside;
    const pocket = F.pocket ?? LETTER_DEPTHS.pocket;
    const at = local(F, a, F.h / 2 - down, inside + (pocket - inside) * r(0.05, 0.15));
    const up = r(0.55, 0.95);
    const out = r(0.06, 0.12);
    const side = a * r(0.4, 0.9);
    add(
      make('pour', t + r(0, 0.02), at, {
        vx: F.up.x * up + F.fwd.x * out + F.right.x * side,
        vy: F.up.y * up + F.fwd.y * out + F.right.y * side,
        vz: F.up.z * up + F.fwd.z * out + F.right.z * side,
        drag: r(1.2, 1.6),
        fall: r(0.12, 0.2),
        life: r(1.6, 2.4),
      }),
    );
    emitted.pour++;
  }
  /**
   * The letter's wake from `F` (now) against `P` (`dt` ago): off its trailing edge, at a rate
   * tied to how fast that edge moves.
   * @param {LetterFrame} F
   * @param {LetterFrame} P
   * @param {number} dt
   */
  function wake(F, P, dt) {
    /** @type {{score: number, at: Point, v: Point, n: Point, along: Point, other: number}|null} */
    let best = null;
    for (const [ax, along, half, other] of /** @type {const} */ ([
      ['right', 'up', 0.5, F.h / 2],
      ['up', 'right', F.h / 2, 0.5],
    ]))
      for (const s of [1, -1]) {
        const n = F[ax];
        const was = P[ax];
        const at = { x: F.c.x + n.x * half * s, y: F.c.y + n.y * half * s, z: F.c.z + n.z * half * s };
        const v = {
          x: (at.x - P.c.x - was.x * half * s) / dt,
          y: (at.y - P.c.y - was.y * half * s) / dt,
          z: (at.z - P.c.z - was.z * half * s) / dt,
        };
        // (The trailing edge, moving away from its outward side, counts most.)
        const score = Math.hypot(v.x, v.y, v.z * 0.5) - 0.5 * (n.x * v.x + n.y * v.y + n.z * v.z * 0.5) * s;
        if (!best || score > best.score)
          best = { score, at, v, n: { x: n.x * s, y: n.y * s, z: n.z * s }, along: F[along], other };
      }
    if (!best) return;
    const rate = Math.min(WAKE.rate, Math.max(0, (best.score - WAKE.min) * WAKE.per));
    if (!rate) {
      wakeDue = 0;
      return;
    }
    wakeDue += rate * dt;
    while (wakeDue >= 1) {
      wakeDue -= 1;
      const k = r(-0.8, 0.8) * best.other;
      const at = {
        x: best.at.x + best.along.x * k + best.n.x * 0.02,
        y: best.at.y + best.along.y * k + best.n.y * 0.02,
        z: best.at.z + best.along.z * k + best.n.z * 0.02,
      };
      const p = one('wake', 0, 1, at, { v: best.v });
      if (!p) continue;
      add(p);
      emitted.wake++;
    }
  }

  /**
   * On one STEP: the swirl fills in round a floating letter and spins; each petal born moves (the
   * swirl's drawn to its slot, the rest eased into the air); the ones that are done go.
   * @param {number} h
   */
  function tick(h) {
    if (L && L.floating) {
      floatingSince ??= t;
      spin += spinRate * h;
      const slots = petals.reduce((k, p) => k + (p.slot ? 1 : 0), 0);
      if (slots < FLOWS.swirl.n && t >= Math.max(floatingSince + SWIRL.delay, nextSwirl)) {
        joinSwirl(L, made++);
        nextSwirl = t + SWIRL.every;
      }
    } else floatingSince = null;
    const wind = AIR.wind + AIR.gust * valueNoise(t * 0.15 + 5.3);
    const follow = 1 - Math.exp(-12 * h);
    for (const p of petals) {
      if (t < p.born) continue;
      const nx = valueNoise(p.seed + t * 0.8 + p.x * 1.7);
      const ny = valueNoise(p.seed + 31.7 + t * 0.8 + p.y * 1.7);
      const nz = valueNoise(p.seed + 63.1 + t * 0.6);
      if (p.slot && L) {
        const s = p.slot;
        const at = swirlSlot(L, s, spin);
        s.s += s.climb * h;
        if (s.infall) {
          s.r = Math.max(1, s.r - SWIRL.fall * h);
          s.infall = s.r > 1;
        }
        if (s.s >= 1) {
          // (Over the top it starts again at the bottom, unseen: the ends draw it at nothing.)
          s.s -= 1;
          if (s.outer) {
            s.r = r(SWIRL.outer[0], SWIRL.outer[1]);
            s.infall = true;
          }
          const back = swirlSlot(L, s, spin);
          p.x = back.x;
          p.y = back.y;
          p.z = back.z;
          continue;
        }
        const next = swirlSlot(L, s, spin + spinRate * h);
        p.vx += ((next.x - at.x) / h + (at.x - p.x) * SWIRL.pull + nx * 0.03 - p.vx) * follow;
        p.vy += ((next.y - at.y) / h + (at.y - p.y) * SWIRL.pull + ny * 0.03 - p.vy) * follow;
        p.vz += ((next.z - at.z) / h + (at.z - p.z) * SWIRL.pull + nz * 0.02 - p.vz) * follow;
      } else {
        const k = 1 - Math.exp(-p.drag * h);
        p.vx += (wind + p.drift + nx * p.noise - p.vx) * k;
        p.vy += (-p.fall + ny * p.noise * 0.6 - p.vy) * k;
        p.vz += (nz * p.noise * 0.4 - p.vz) * k;
      }
      p.x += p.vx * h;
      p.y += p.vy * h;
      p.z += p.vz * h;
    }
    t += h;
    petals = petals.filter((p) => t - p.born < p.life && t < p.cut + p.cutFor);
  }

  return {
    emit,
    /**
     * The letter as it is now, each frame before `step` (null once it's gone): the swirl follows
     * it while it floats and is flung out once it doesn't; the pour rises out of it as its flap
     * lifts; it sheds its wake as it moves.
     * @param {LetterFrame|null} F
     */
    letter(F) {
      if (reduced) return;
      if (L?.floating && !F?.floating) fling(F ?? L);
      if (F && prev && t > prevAt && t - prevAt < 0.25) wake(F, prev, t - prevAt);
      if (F && F.opening > 0) {
        const due = Math.round(FLOWS.pour.n * Math.min(1, F.opening / 0.85));
        while (emitted.pour < due) pourOne(F);
      }
      L = F && { ...F, c: { ...F.c }, right: { ...F.right }, up: { ...F.up }, fwd: { ...F.fwd } };
      // (The wake measures from where it was a step ago or more: on a fast screen several frames
      // fall within one STEP, and the clock moves only by whole steps.)
      if (!L || !prev || t > prevAt) {
        prev = L;
        prevAt = t;
      }
    },
    /**
     * On `dt` seconds (at most a tenth: a stall holds them, never throws them), in STEPs.
     * @param {number} dt
     */
    step(dt) {
      acc += Math.min(0.1, Math.max(0, dt));
      while (acc >= STEP - 1e-9) {
        acc -= STEP;
        tick(STEP);
      }
    },
    /**
     * Every petal up (or still to come) shrinks away over `within` seconds (a skip: out of the
     * way of the toy); the ones launched after are untouched.
     * @param {number} [within]
     */
    cut(within = 0.35) {
      for (const p of petals) {
        if (p.cut <= t) continue;
        p.cut = t;
        p.cutFor = within;
      }
    },
    /** The petals there now, with their poses. */
    at() {
      return petals.map((petal) => ({ petal, pose: petalAt(petal, t) })).filter((e) => e.pose.visible);
    },
    /** How many are there now. */
    live() {
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
    /** The flow's clock, seconds. */
    get time() {
      return t;
    },
    /** The swirl's spin now, radians (swirlSlot). */
    get swirlSpin() {
      return spin;
    },
  };
}

/**
 * @typedef {object} TrailStep  petals due on the trail: where (px), how many, and the pointer's
 *   velocity then (px a second)
 * @property {number} x
 * @property {number} y
 * @property {number} n
 * @property {number} vx
 * @property {number} vy
 */

/**
 * The cursor trail, in CSS px and seconds: a step every TRAIL.gap px moved (rolled each time, put
 * just where the distance came up), TRAIL.perStep petals a step, at most TRAIL.rate a second (a
 * step with none in hand is skipped); a press that holds (a finger), kept still, keeps TRAIL.hold
 * a second coming where it is. A move after a pause (or after lift(): it left the page) starts
 * afresh where it is, shedding nothing along a jump it never made.
 * @param {{seed?: number}} [o]
 */
export function createTrail({ seed = 1 } = {}) {
  const rng = createRng(seed);
  const roll = () => TRAIL.gap[0] + (TRAIL.gap[1] - TRAIL.gap[0]) * rng();
  /** 1, 2 or 3 (mostly 1). */
  const count = () => (rng() < 0.42 ? (rng() < 0.3 ? 3 : 2) : 1);
  /** @type {{x: number, y: number, t: number}|null} */
  let last = null;
  let pressed = false;
  let holds = false;
  let gap = roll();
  let dist = 0;
  let vx = 0;
  let vy = 0;
  let fresh = true;
  let tokens = TRAIL.burst;
  /** @type {number|null} */
  let tokenAt = null;
  let stillSince = 0;
  /** @type {number|null} */
  let heldAt = null;
  let heldDue = 0;
  /** @param {number} t */
  const refill = (t) => {
    if (tokenAt !== null) tokens = Math.min(TRAIL.burst, tokens + Math.max(0, t - tokenAt) * TRAIL.rate);
    tokenAt = t;
  };
  /** @param {number} n */
  const take = (n) => {
    const k = Math.min(n, Math.floor(tokens));
    tokens -= k;
    return k;
  };
  return {
    /**
     * A press at (x, y); `hold`: keeping it still keeps petals coming (a finger).
     * @param {number} t
     * @param {number} x
     * @param {number} y
     * @param {boolean} hold
     * @returns {TrailStep[]}
     */
    down(t, x, y, hold) {
      pressed = true;
      holds = hold;
      last = { x, y, t };
      dist = 0;
      fresh = true;
      stillSince = t;
      heldAt = t;
      heldDue = 0;
      refill(t);
      return [];
    },
    /**
     * The pointer moved to (x, y): the steps it passed.
     * @param {number} t
     * @param {number} x
     * @param {number} y
     * @returns {TrailStep[]}
     */
    move(t, x, y) {
      /** @type {TrailStep[]} */
      const out = [];
      if (!last) {
        last = { x, y, t };
        stillSince = t;
        return out;
      }
      const from = last;
      const dx = x - from.x;
      const dy = y - from.y;
      const d = Math.hypot(dx, dy);
      const dt = t - from.t;
      if (dt > 0.3) {
        // (A pause, or the mouse back from outside the window somewhere else: start afresh here.)
        last = { x, y, t };
        dist = 0;
        fresh = true;
        if (d > 0) {
          stillSince = t;
          heldDue = 0;
        }
        refill(t);
        return out;
      }
      if (dt > 0 && d > 0) {
        if (fresh) {
          vx = dx / dt;
          vy = dy / dt;
          fresh = false;
        } else {
          const k = 1 - Math.exp(-dt / 0.04);
          vx += (dx / dt - vx) * k;
          vy += (dy / dt - vy) * k;
        }
      }
      refill(t);
      if (d > 0) {
        let along = 0;
        let left = d;
        while (dist + left >= gap) {
          const need = gap - dist;
          along += need;
          left -= need;
          dist = 0;
          gap = roll();
          const n = take(count());
          if (n) out.push({ x: from.x + (dx * along) / d, y: from.y + (dy * along) / d, n, vx, vy });
        }
        dist += left;
        stillSince = t;
        heldDue = 0;
      }
      last = { x, y, t };
      return out;
    },
    /** The press let go (or lost). */
    up() {
      pressed = false;
      fresh = true;
    },
    /** The pointer left the page (or the window lost focus): its next move starts afresh there. */
    lift() {
      last = null;
      dist = 0;
      fresh = true;
    },
    /** Whether a press is down now. */
    get pressed() {
      return pressed;
    },
    /**
     * Each frame: a press held still keeps a few coming where it is.
     * @param {number} t
     * @returns {TrailStep[]}
     */
    hold(t) {
      const dt = heldAt === null ? 0 : Math.max(0, t - heldAt);
      heldAt = t;
      if (!pressed || !holds || !last || t - stillSince < TRAIL.still) return [];
      heldDue += dt * TRAIL.hold;
      refill(t);
      /** @type {TrailStep[]} */
      const out = [];
      while (heldDue >= 1) {
        heldDue -= 1;
        const n = take(1);
        if (n) out.push({ x: last.x, y: last.y, n, vx: 0, vy: 0 });
      }
      return out;
    },
  };
}
