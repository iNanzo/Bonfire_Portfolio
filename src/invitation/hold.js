// How NEWT is held by the collar in the invitation toy: the interface the bead hold
// (holds/bead.js, the only carry) implements for main.js (Hold: start, step, release, grabbedAt,
// onWheel and onSecondFinger) and the solve helpers it's built on: the ray through the cursor
// meeting a plane with grazing and backward rays turned away (rayHit), the part of the ray inside
// the play area and the height limits (rayInterval) and the edge clamp on it (edgeClamp: the
// nearest inside point along the ray within HOLD.reach, so the collar stays exactly under the
// cursor, the back wall a climb and the front one the floor; with none, a side wall: across only
// along the camera's level-right axis, never sliding in depth, and the push recorded for the
// toss), whether the camera moved (cameraMoved), the grab offset easing out in screen px
// (screenOffset), the solved collar's path between its samples (sampleAt: the release window,
// HOLD.lead and .span), the squash and stretch (squash), and the camera's level axes (levelAxes,
// depthAlong). Pure: no three.js, no DOM.

import { CARRY, keepInside, lineSpan } from './carry.js';
import { rayPlane } from './gesture.js';
import { clampTo } from './steer.js';

/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').CarryState} CarryState */
/** @typedef {{o: XYZ, d: XYZ}} Ray  a ray: its origin and direction (unit, or any length where said) */
/** @typedef {{point: XYZ, normal: XYZ}} Plane */
/** @typedef {{x: number, y: number}} Px  client px */
/** @typedef {'off'|'mix'|'always'} CueMode  a Bonfire-style effect's Off / In the Mix / Always */

/**
 * grazing: a ray meeting a plane at a cosine under this is turned away (rayHit); reach: how far
 * along the ray, world units, an edge clamp looks for an inside point; steps: the bisection's;
 * offsetEase: seconds the grab offset eases out over (screenOffset); turnEps, zoomEps: the least
 * change in the camera's angles (radians) and distance (share) that counts as a move
 * (cameraMoved). The release: its window ends `lead` s before letting go and spans `span` s
 * (holds/bead.js beadThrow reads it). The squash and
 * stretch: `stretch` tall over `stretchTime` s as he's lifted; landing, `squashY` tall and
 * `squashXZ` wide over `squashTime` s, back over `recover` s.
 */
export const HOLD = {
  grazing: 0.12,
  reach: 1,
  steps: 16,
  offsetEase: CARRY.offsetEase,
  turnEps: (0.1 * Math.PI) / 180,
  zoomEps: 1e-3,
  lead: 0.02,
  span: 0.05,
  stretch: 1.08,
  stretchTime: 0.08,
  squashY: 0.88,
  squashXZ: 1.08,
  squashTime: 0.07,
  recover: 0.2,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (u) => u * u * (3 - 2 * u);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * A ray with a unit direction (the same ray).
 * @param {Ray} ray
 * @returns {Ray}
 */
export function unitRay(ray) {
  const n = Math.hypot(ray.d.x, ray.d.y, ray.d.z) || 1;
  return { o: ray.o, d: { x: ray.d.x / n, y: ray.d.y / n, z: ray.d.z / n } };
}

/**
 * The point `s` along a ray (a unit one: `s` world units from its origin).
 * @param {Ray} ray
 * @param {number} s
 * @returns {XYZ}
 */
export const along = (ray, s) => ({ x: ray.o.x + ray.d.x * s, y: ray.o.y + ray.d.y * s, z: ray.o.z + ray.d.z * s });

/**
 * Where a ray meets a plane, or null when it grazes it (the cosine between them under
 * `grazing`) or the plane is behind it.
 * @param {Ray} ray
 * @param {Plane} plane
 * @param {number} [grazing]
 * @returns {XYZ|null}
 */
export function rayHit(ray, plane, grazing = HOLD.grazing) {
  const r = unitRay(ray);
  const n = plane.normal;
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  if (Math.abs(dot(r.d, n)) / len < grazing) return null;
  return rayPlane(r.o, r.d, plane);
}

/**
 * How far along a unit ray a point is (its projection onto it).
 * @param {Ray} ray
 * @param {XYZ} p
 */
const sOf = (ray, p) => (p.x - ray.o.x) * ray.d.x + (p.y - ray.o.y) * ray.d.y + (p.z - ray.o.z) * ray.d.z;

/**
 * The span of a ray (made unit) that's inside the play area (the floor under it inside `bounds`:
 * carry.js lineSpan along its level direction) and between the heights `low` and `high`, as
 * [lo, hi] distances along it from its origin (never behind it), or null when there's none.
 * @param {Ray} ray
 * @param {Bounds|null} bounds
 * @param {number} low
 * @param {number} high
 * @returns {[number, number]|null}
 */
export function rayInterval(ray, bounds, low, high) {
  const r = unitRay(ray);
  let lo = 0;
  let hi = Infinity;
  if (Math.abs(r.d.y) < 1e-12) {
    if (r.o.y < low || r.o.y > high) return null;
  } else {
    const a = (low - r.o.y) / r.d.y;
    const b = (high - r.o.y) / r.d.y;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (bounds) {
    const level = Math.hypot(r.d.x, r.d.z);
    if (level < 1e-9) {
      const q = clampTo(bounds, { x: r.o.x, z: r.o.z });
      if (Math.hypot(q.x - r.o.x, q.z - r.o.z) > 1e-9) return null;
    } else {
      const span = lineSpan(bounds, { x: r.o.x, z: r.o.z }, { x: r.d.x / level, z: r.d.z / level });
      if (!span) return null;
      lo = Math.max(lo, span[0] / level);
      hi = Math.min(hi, span[1] / level);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * Whether a point is inside: the play area's (steer.js clampTo leaves it be) and within the heights.
 * @param {XYZ} p
 * @param {Bounds|null} bounds
 * @param {number} low
 * @param {number} high
 */
export function insideHold(p, bounds, low, high) {
  if (p.y < low - 1e-9 || p.y > high + 1e-9) return false;
  if (!bounds) return true;
  const q = clampTo(bounds, p);
  return Math.hypot(q.x - p.x, q.z - p.z) <= 1e-7;
}

/**
 * @typedef {object} EdgeClamp
 * @property {XYZ} p  where the collar goes
 * @property {'none'|'ray'|'side'} clamp  none: `p` was inside; ray: moved along the cursor's ray
 *   (the collar stays exactly under it: a back wall climbs, the front wall and the floor drop him
 *   onto the floor's height, the ceiling holds him there); side: no inside point on the ray near
 *   enough, so across only (along the camera's level-right axis), the height clamped, a gap allowed
 * @property {XZ|null} push  side: the way the cursor pushes him out through the wall (unit), as
 *   carry.js holdStep keeps it for the toss
 */

/**
 * The shared edge clamp: `p` (a point on `ray`, solved on the hold's surface) kept inside the play
 * area and between `low` and `high`. Inside, as it is. Under `low` or over `high`, onto that
 * height along the ray, however far (no gap on a down drag). Out past a wall, the nearest
 * inside point along the ray within HOLD.reach (rayInterval, then HOLD.steps of bisection with
 * clampTo as the inside test, so it's inside by steer's own rule). With none, a side wall: carry.js
 * keepInside along the camera's level-right axis (`toward`: the level way to the camera), never
 * deeper or nearer, the height clamped.
 * @param {Ray} ray
 * @param {XYZ} p
 * @param {{bounds: Bounds|null, low: number, high: number, toward: XZ, reach?: number}} o
 * @returns {EdgeClamp}
 */
export function edgeClamp(ray, p, { bounds, low, high, toward, reach = HOLD.reach }) {
  if (insideHold(p, bounds, low, high)) return { p: { ...p }, clamp: 'none', push: null };
  const r = unitRay(ray);
  // (The floor and the ceiling first, always on the ray: a down drag never leaves a gap.)
  const heights = rayInterval(r, null, low, high);
  const s0 = sOf(r, p);
  const sy = heights ? clamp(s0, heights[0], heights[1]) : s0;
  const q = heights ? along(r, sy) : { x: p.x, y: clamp(p.y, low, high), z: p.z };
  if (insideHold(q, bounds, low, high)) return { p: q, clamp: 'ray', push: null };
  // (Then the walls: the nearest inside point along the ray within reach, bisected from the
  // span's end toward where he was asked to go so it ends on steer's own edge.)
  const span = heights ? rayInterval(r, bounds, low, high) : null;
  if (span) {
    const near = clamp(sy, span[0], span[1]);
    if (Math.abs(near - sy) <= reach) {
      const inward = near + (sy < near ? 1 : -1) * Math.min(1e-6, (span[1] - span[0]) / 2);
      let a = insideHold(along(r, inward), bounds, low, high) ? inward : near;
      let b = sy;
      for (let i = 0; i < HOLD.steps; i++) {
        const m = (a + b) / 2;
        if (insideHold(along(r, m), bounds, low, high)) a = m;
        else b = m;
      }
      return { p: along(r, a), clamp: 'ray', push: null };
    }
  }
  // (A side wall: across only, the height as clamped.)
  const kept = bounds ? keepInside(bounds, q, { normal: { x: toward.x, y: 0, z: toward.z } }) : { x: q.x, z: q.z };
  const px = q.x - kept.x;
  const pz = q.z - kept.z;
  const out = Math.hypot(px, pz);
  return {
    p: { x: kept.x, y: clamp(q.y, low, high), z: kept.z },
    clamp: 'side',
    push: out > 1e-9 ? { x: px / out, z: pz / out } : null,
  };
}

/**
 * @typedef {object} HoldCamera  the camera as the hold reads it
 * @property {XYZ} position
 * @property {number} yaw  radians (camera.js: 0 looks toward −z)
 * @property {number} elevation  radians up
 * @property {number} distance
 * @property {XZ} [target]  the point it looks at on the floor
 */

/**
 * Whether the camera moved between `a` and `b` by more than HOLD.turnEps (yaw, elevation) or
 * HOLD.zoomEps of its distance, or its point slid.
 * @param {HoldCamera} a
 * @param {HoldCamera} b
 */
export function cameraMoved(a, b) {
  const turn = Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
  if (turn > HOLD.turnEps || Math.abs(b.elevation - a.elevation) > HOLD.turnEps) return true;
  if (Math.abs(b.distance - a.distance) > HOLD.zoomEps * Math.max(1e-9, a.distance)) return true;
  if (a.target && b.target && Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z) > 1e-6) return true;
  return false;
}

/**
 * The camera's level axes at `yaw`: `toward`, the level way toward the camera ((sin ψ, cos ψ):
 * camera.js puts it at +z at yaw 0), and `right`, the level way right on screen.
 * @param {number} yaw
 * @returns {{toward: XZ, right: XZ}}
 */
export function levelAxes(yaw) {
  const toward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  return { toward, right: { x: toward.z, z: -toward.x } };
}

/**
 * How far `p` is from the camera along its level axis, away positive (only differences mean
 * anything: it's measured from the world's origin).
 * @param {XZ} p
 * @param {number} yaw
 */
export const depthAlong = (p, yaw) => -(p.x * Math.sin(yaw) + p.z * Math.cos(yaw));

/**
 * The grab offset in screen px at `t`: all of `off0` at the grab (`t0`), eased out (smoothstep)
 * over HOLD.offsetEase, none from then on. The hold casts its ray through the pointer plus this.
 * @param {Px} off0  his collar on screen less the point pressed, as he's grabbed
 * @param {number} t0
 * @param {number} t
 * @param {number} [ease]
 * @returns {Px}
 */
export function screenOffset(off0, t0, t, ease = HOLD.offsetEase) {
  const u = ease > 0 ? clamp((t - t0) / ease, 0, 1) : 1;
  const k = 1 - smooth(u);
  return k > 0 ? { x: off0.x * k, y: off0.y * k } : { x: 0, y: 0 };
}

/**
 * The samples' path at `t`, straight between the two either side (the ends held past them).
 * @param {Array<{t: number, x: number, y: number, z: number}>} samples  in time order
 * @param {number} t
 * @returns {XYZ}
 */
export function sampleAt(samples, t) {
  const first = samples[0];
  if (t <= first.t) return { x: first.x, y: first.y, z: first.z };
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    if (t <= b.t) {
      const a = samples[i - 1];
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  const last = samples[samples.length - 1];
  return { x: last.x, y: last.y, z: last.z };
}

/**
 * The squash and stretch on his root's scale: a stretch to HOLD.stretch tall over
 * HOLD.stretchTime as he's lifted (`sinceGrab` seconds ago, there and back), and as he lands
 * (`sinceLand` seconds ago) a squash to HOLD.squashY tall and HOLD.squashXZ wide over
 * HOLD.squashTime, back to 1 over HOLD.recover. Null times: none.
 * @param {number|null} sinceGrab
 * @param {number|null} sinceLand
 * @returns {{y: number, xz: number}}
 */
export function squash(sinceGrab, sinceLand) {
  let y = 1;
  let xz = 1;
  if (sinceGrab !== null && sinceGrab >= 0 && sinceGrab < HOLD.stretchTime) {
    const k = Math.sin((Math.PI * sinceGrab) / HOLD.stretchTime);
    y *= 1 + (HOLD.stretch - 1) * k;
    xz *= 1 / Math.sqrt(1 + (HOLD.stretch - 1) * k);
  }
  if (sinceLand !== null && sinceLand >= 0 && sinceLand < HOLD.squashTime + HOLD.recover) {
    const k =
      sinceLand < HOLD.squashTime
        ? smooth(sinceLand / HOLD.squashTime)
        : 1 - smooth((sinceLand - HOLD.squashTime) / HOLD.recover);
    y *= 1 + (HOLD.squashY - 1) * k;
    xz *= 1 + (HOLD.squashXZ - 1) * k;
  }
  return { y, xz };
}

/**
 * @typedef {object} HoldStart  what the hold gets the frame he's grabbed
 * @property {number} t
 * @property {XYZ} collar  his collar now, world units (the Neck bone's head)
 * @property {Px} press  where the press began, client px (the point grabbed)
 * @property {Px} collarPx  his collar on screen, client px
 * @property {(x: number, y: number) => Ray} rayAt  the ray through a client point (a unit one)
 * @property {HoldCamera} camera
 * @property {number} low  his hang height: the lowest his collar is carried once he's clear
 * @property {Bounds|null} bounds  the play area
 * @property {boolean} [touch]  grabbed by a finger
 */
/**
 * @typedef {object} HoldFrame  what the hold gets each frame he's held
 * @property {number} t
 * @property {number} dt
 * @property {Px} px  the pointer, client px (a finger's lifted over itself already)
 * @property {(x: number, y: number) => Ray} rayAt
 * @property {HoldCamera} camera
 * @property {number} low
 * @property {Bounds|null} bounds
 * @property {CarryState|null} carry  the carry as last stepped (null on the first frame)
 * @property {string} [clip]  the clip he's showing (the brain's: 'Held', 'Thrash')
 * @property {(p: XYZ) => Px} [project]  a world point onto the screen, client px
 * @property {{top: number, height: number}} [stage]  the stage's top and height, client px
 */
/**
 * @typedef {object} HoldCues  what the hold tells the cues (main.js, cues.js) this frame (In the
 *   Mix shows the ring and the drop line as cues.js mixWants has it)
 * @property {XZ|null} [ring]  where the ring sits (left out: under his hips)
 * @property {boolean} [line]  false: no drop line In the Mix (Always still shows it: cues.js
 *   lineMode)
 * @property {boolean} [pulse]  a wall clamp this frame: the ring pulses to full
 * @property {number} [floor]  In the Mix, the ring's least strength while he's held (cues.js
 *   ringFloor)
 */
/**
 * @typedef {object} HoldStep  the hold's frame
 * @property {XYZ} anchor  where his collar goes (carry.js holdStep keeps it inside)
 * @property {Plane|null} plane  the line across the floor holdStep keeps him inside along (null:
 *   the nearest spot inside: a hold that clamped already is left as it is)
 * @property {XZ|null} [push]  set: the push holdStep keeps for the toss (the hold's side clamp)
 * @property {number|null} holdY  the height the hold holds him at (null: none of its own)
 * @property {XZ} [tilt]  set: his root's tilt this frame in place of carry.js's swing (the hold's own
 *   body: root.rotation.x and .z). There's no heading: the hold never turns him (main.js keeps the one
 *   he had as he was grabbed, the user's rule).
 * @property {HoldCues} cues
 */
/**
 * @typedef {object} HoldFeel  the hold's own settings for main.js (Ground Cues' default is cues.js
 *   CUE_DEFAULT)
 * @property {boolean} squash  the squash and stretch on his root
 * @property {number|null} fingerLift  CSS px a finger carries him above itself (null: the page's)
 * @property {boolean} secondFinger  a second finger while he's held goes to onSecondFinger
 */
/**
 * @typedef {object} Hold  how he's held, made by holds/bead.js createBeadHold for each grab
 * @property {HoldFeel} feel
 * @property {(s: HoldStart) => void} start
 * @property {(f: HoldFrame) => HoldStep} step
 * @property {(t: number, collar: XYZ, project: (p: XYZ) => Px) => Px} grabbedAt  where the point
 *   he was grabbed by shows now, client px
 * @property {(c: CarryState, t: number) => XYZ|null} release  the velocity he's let go with (null:
 *   carry.js toss)
 * @property {Plane|null} plane  the surface he's dragged on now, for ?test (null before a grab)
 * @property {XZ|null} [landing]  once he's let go, where the hold says he'll land: the ring
 *   stays there until he does
 * @property {((dy: number) => boolean)} [onWheel]  the wheel while he's held (CSS px; true: taken,
 *   no zoom)
 * @property {((dy: number) => void)} [onSecondFinger]  a second finger's move while he's held, CSS px
 */
