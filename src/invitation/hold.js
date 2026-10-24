// How NEWT is held by the collar in the invitation toy: the drag kinds (DRAG_KINDS, ?drag= and
// Settings' Drag: 'today' the default, 'level', 'tilt' and 'bead' to compare), the interface each
// kind implements (Hold: start, step, release, grabbedAt, and optionally onWheel and
// onSecondFinger; holds/index.js createHold makes one by name), 'today' through it (createTodayHold:
// the camera-facing upright plane through where he was grabbed, carry.js dragPlane, gripFor and
// dragTarget as they were), and the solve helpers every kind shares: the ray through the cursor
// meeting a plane with grazing and backward rays turned away (rayHit), a level height on the ray
// (rayAtY), the part of the ray inside the play area and the height limits (rayInterval) and the
// edge clamp on it (edgeClamp: the nearest inside point along the ray within HOLD.reach, so the
// collar stays exactly under the cursor, the back wall a climb and the front one the floor; with
// none, a side wall: across only along the camera's level-right axis, never sliding in depth, and
// the push recorded for the toss), re-anchoring after the camera moves (reanchor: the closest point
// on the new ray), the grab offset easing out in screen px (screenOffset), the release velocity
// from the solved collar over [t - 70 ms, t - 20 ms] (releaseVelocity), the squash and stretch
// (squash), and the camera's level axes (levelAxes, depthAlong). Pure: no three.js, no DOM.

import { CARRY, dragPlane, dragTarget, gripFor, keepInside, lineSpan, offsetAt } from './carry.js';
import { rayPlane } from './gesture.js';
import { clampTo } from './steer.js';

/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').CarryState} CarryState */
/** @typedef {{o: XYZ, d: XYZ}} Ray  a ray: its origin and direction (unit, or any length where said) */
/** @typedef {{point: XYZ, normal: XYZ}} Plane */
/** @typedef {{x: number, y: number}} Px  client px */
/** @typedef {'today'|'level'|'tilt'|'bead'} DragKind */
/** @typedef {'off'|'mix'|'always'} CueMode  a Bonfire-style effect's Off / In the Mix / Always */

/** The drag kinds, in Settings' order. @type {readonly DragKind[]} */
export const DRAG_KINDS = Object.freeze(['today', 'level', 'tilt', 'bead']);
/** The kind he's held with unless ?drag= or Settings' Drag says otherwise. */
export const DEFAULT_DRAG = /** @type {DragKind} */ ('today');
/** Settings' Drag labels. */
export const DRAG_LABELS = Object.freeze({ today: 'Today', level: 'Level', tilt: 'Tilt', bead: 'Bead' });

/**
 * A drag kind from anything: one of DRAG_KINDS, or DEFAULT_DRAG.
 * @param {unknown} v
 * @returns {DragKind}
 */
export const dragKind = (v) =>
  DRAG_KINDS.includes(/** @type {any} */ (v)) ? /** @type {DragKind} */ (v) : DEFAULT_DRAG;

/**
 * grazing: a ray meeting a plane at a cosine under this is turned away (rayHit); reach: how far
 * along the ray, world units, an edge clamp looks for an inside point; steps: the bisection's;
 * offsetEase: seconds the grab offset eases out over (screenOffset); reanchorMax: the most a
 * re-anchor should ever move the anchor in a frame (world units: a check, reanchor reports it);
 * turnEps, zoomEps: the least change in the camera's angles (radians) and distance (share) that
 * counts as a move (cameraMoved). The release: its window ends `lead` s before letting go and spans
 * `span` s, capped at `maxLevel` u/s across the floor and `up`/`down` up and down. The squash and
 * stretch: `stretch` tall over `stretchTime` s as he's lifted; landing, `squashY` tall and
 * `squashXZ` wide over `squashTime` s, back over `recover` s.
 */
export const HOLD = {
  grazing: 0.12,
  reach: 1,
  steps: 16,
  offsetEase: CARRY.offsetEase,
  reanchorMax: 0.15,
  turnEps: (0.1 * Math.PI) / 180,
  zoomEps: 1e-3,
  lead: 0.02,
  span: 0.05,
  maxLevel: 4,
  up: 2.5,
  down: -3,
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
 * Where a ray reaches height `y`, or null when it never does (level, or the height behind it).
 * @param {Ray} ray
 * @param {number} y
 * @returns {XYZ|null}
 */
export function rayAtY(ray, y) {
  const r = unitRay(ray);
  if (Math.abs(r.d.y) < 1e-9) return null;
  const s = (y - r.o.y) / r.d.y;
  return s >= 0 ? along(r, s) : null;
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
 * The shared edge clamp: `p` (a point on `ray`, solved on a kind's surface) kept inside the play
 * area and between `low` and `high`. Inside, as it is. Under `low` or over `high`, onto that
 * height along the ray, however far (rayAtY: no gap on a down drag). Out past a wall, the nearest
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
 * The closest point on a ray to `p` (never behind it).
 * @param {Ray} ray
 * @param {XYZ} p
 * @returns {XYZ}
 */
export function closestOnRay(ray, p) {
  const r = unitRay(ray);
  return along(r, Math.max(0, sOf(r, p)));
}

/**
 * After the camera moves mid-hold (a user orbit or zoom): the anchor onto the new cursor ray,
 * the closest point on it to where it was (a kind rebuilds its surface through `point`), and how
 * far that moved it (a frame's orbit keeps it under HOLD.reanchorMax).
 * @param {Ray} ray
 * @param {XYZ} anchor
 * @returns {{point: XYZ, jump: number}}
 */
export function reanchor(ray, anchor) {
  const point = closestOnRay(ray, anchor);
  return { point, jump: Math.hypot(point.x - anchor.x, point.y - anchor.y, point.z - anchor.z) };
}

/**
 * @typedef {object} HoldCamera  the camera as a kind reads it
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
 * over HOLD.offsetEase, none from then on. A kind casts its ray through the pointer plus this.
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
 * The velocity he's let go with, world space: the solved collar's samples (CarryState.samples)
 * from `t` − HOLD.lead − HOLD.span to `t` − HOLD.lead (the last frames before a release are often
 * the finger slowing as it lifts), capped at HOLD.maxLevel across the floor and HOLD.up/down up
 * and down; while the cursor pushes him out through a wall (`push`), none across (today's rule).
 * @param {Array<{t: number, x: number, y: number, z: number}>} samples
 * @param {number} t  the release
 * @param {{push?: XZ|null, lead?: number, span?: number}} [o]
 * @returns {XYZ}
 */
export function releaseVelocity(samples, t, { push = null, lead = HOLD.lead, span = HOLD.span } = {}) {
  if (samples.length < 2) return { x: 0, y: 0, z: 0 };
  const t1 = Math.min(t - lead, samples[samples.length - 1].t);
  const t0 = Math.max(t1 - span, samples[0].t);
  if (!(t1 - t0 > 1e-4)) return { x: 0, y: 0, z: 0 };
  const a = sampleAt(samples, t0);
  const b = sampleAt(samples, t1);
  const dt = t1 - t0;
  let x = (b.x - a.x) / dt;
  let z = (b.z - a.z) / dt;
  const level = Math.hypot(x, z);
  if (level > HOLD.maxLevel) {
    x *= HOLD.maxLevel / level;
    z *= HOLD.maxLevel / level;
  }
  if (push) {
    x = 0;
    z = 0;
  }
  return { x, y: clamp((b.y - a.y) / dt, HOLD.down, HOLD.up), z };
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
 * @typedef {object} HoldStart  what a kind gets the frame he's grabbed
 * @property {number} t
 * @property {XYZ} collar  his collar now, world units (the Neck bone's head)
 * @property {Px} press  where the press began, client px (the point grabbed)
 * @property {Px} collarPx  his collar on screen, client px
 * @property {(x: number, y: number) => Ray} rayAt  the ray through a client point (a unit one)
 * @property {HoldCamera} camera
 * @property {number} low  his hang height: the lowest his collar is carried once he's clear
 * @property {Bounds|null} bounds  the play area
 * @property {number} [yaw]  his heading as he's grabbed (his root's rotation.y)
 */
/**
 * @typedef {object} HoldFrame  what a kind gets each frame he's held
 * @property {number} t
 * @property {number} dt
 * @property {Px} px  the pointer, client px (a finger's lifted over itself already)
 * @property {(x: number, y: number) => Ray} rayAt
 * @property {HoldCamera} camera
 * @property {number} low
 * @property {Bounds|null} bounds
 * @property {CarryState|null} carry  the carry as last stepped (null on the first frame)
 * @property {string} [clip]  the clip he's showing (the brain's: 'Held', 'Thrash')
 */
/**
 * @typedef {object} HoldCues  what a kind tells the shared cues (main.js, cues.js) this frame
 * @property {boolean} [mix]  whether In the Mix shows the ring and the drop line now (left out:
 *   cues.js mixWants, the shared rule)
 * @property {XZ|null} [ring]  where the ring sits (left out: under his hips)
 * @property {boolean} [line]  false: no drop line, whatever the setting
 * @property {boolean} [pulse]  a wall clamp this frame: the ring pulses to full
 */
/**
 * @typedef {object} HoldStep  a kind's frame
 * @property {XYZ} anchor  where his collar goes (carry.js holdStep keeps it inside)
 * @property {Plane|null} plane  the line across the floor holdStep keeps him inside along (null:
 *   the nearest spot inside: a kind that clamped already is left as it is)
 * @property {XZ|null} [push]  set: the push holdStep keeps for the toss (a kind's side clamp)
 * @property {number|null} holdY  the height a kind holds him at (null: none of its own)
 * @property {XZ} [tilt]  set: his root's tilt this frame in place of carry.js's swing (a kind's own
 *   body: root.rotation.x and .z)
 * @property {number} [yaw]  set: his heading this frame (his root's rotation.y)
 * @property {HoldCues} cues
 */
/**
 * @typedef {object} HoldFeel  a kind's own defaults for the shared layer
 * @property {CueMode} groundCues  the Ground Cues setting's default (the ring and the drop line)
 * @property {boolean} squash  the squash and stretch on his root
 * @property {number|null} fingerLift  CSS px a finger carries him above itself (null: the page's)
 * @property {boolean} secondFinger  a second finger while he's held goes to onSecondFinger
 */
/**
 * @typedef {object} Hold  a drag kind, made by holds/index.js createHold
 * @property {DragKind} kind
 * @property {HoldFeel} feel
 * @property {(s: HoldStart) => void} start
 * @property {(f: HoldFrame) => HoldStep} step
 * @property {(t: number, collar: XYZ, project: (p: XYZ) => Px) => Px} grabbedAt  where the point
 *   he was grabbed by shows now, client px
 * @property {(c: CarryState, t: number) => XYZ|null} release  the velocity he's let go with (null:
 *   carry.js toss)
 * @property {Plane|null} plane  the surface he's dragged on now, for ?test (null before a grab)
 * @property {XZ|null} [landing]  once he's let go, where the kind says he'll land: the ring
 *   stays there until he does
 * @property {((dy: number) => boolean)} [onWheel]  the wheel while he's held (CSS px; true: taken,
 *   no zoom)
 * @property {((dy: number) => void)} [onSecondFinger]  a second finger's move while he's held, CSS px
 */

/**
 * Today's hold: dragged on the upright plane through his collar facing the camera (carry.js
 * dragPlane), the grab offset in world units easing out (gripFor, offsetAt), up lifts and across
 * moves (dragTarget), kept inside along the plane's line across the floor (holdStep), tossed with
 * carry.js toss.
 * @returns {Hold}
 */
export function createTodayHold() {
  /** @type {import('./carry.js').Grip|null} */
  let grip = null;
  return {
    kind: 'today',
    feel: { groundCues: 'off', squash: false, fingerLift: null, secondFinger: false },
    get plane() {
      return grip?.plane ?? null;
    },
    start({ t, collar, press, rayAt, camera }) {
      grip = gripFor(rayAt(press.x, press.y), dragPlane(camera.position, collar), collar, t);
    },
    step({ t, px, rayAt, low }) {
      const g = /** @type {import('./carry.js').Grip} */ (grip);
      const anchor = dragTarget(g, rayAt(px.x, px.y), low, t);
      return { anchor, plane: g.plane, holdY: null, cues: {} };
    },
    grabbedAt(t, collar, project) {
      const o = grip ? offsetAt(grip, t) : { x: 0, y: 0, z: 0 };
      return project({ x: collar.x - o.x, y: collar.y - o.y, z: collar.z - o.z });
    },
    release: () => null,
  };
}
