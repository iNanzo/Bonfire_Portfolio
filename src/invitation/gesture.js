// Pointer gestures for the invitation toy. One finger (or the mouse's left button): a short,
// still press is a tap (on NEWT or on the floor); a press on NEWT that moves more than moveTol
// CSS px or lasts longer than holdMs is a grab, then drags, then a release; a press on empty
// space that moves more than moveTol drags the camera (each move's dx, dy), then a release: a
// finger's orbits it, the mouse's left button pans it. The mouse's right button orbits wherever
// it's pressed (on NEWT too) and its middle one pans; neither grabs nor taps (a still right or
// middle click does nothing). A cancel (pointercancel or lostpointercapture) drops him and never
// taps. Two fingers pinch (the change in their spread) and, once their middle has strayed
// moveTol, pan with it too: a second finger landing on a press or an orbit turns it into a
// pinch, two-finger gestures never tap or grab, and once one lifts the other does nothing until
// it lifts too. While NEWT is held, other fingers are ignored, unless the page's `holdLift` says a
// second one lifts and lowers him (the hold's height: its vertical moves come as holdLift
// events, dy CSS px; it never pinches). Plus where a ray meets a level
// plane or any plane, and whether a point is on his screen shape (a head circle and a body
// capsule). Pure: CSS px and seconds in, events out; the page owns the DOM and pointer capture.

/** @typedef {import('./types.js').Ptr} Ptr */
/** @typedef {import('./types.js').GestureEvent} GestureEvent */

/**
 * moveTol: CSS px a press may wander and still be a tap; holdMs: how long a press on NEWT may
 * last and still be a tap; floorHoldMs: the same for a floor tap (a floor press is never a grab,
 * but a long one is no tap either).
 */
export const GESTURE = { moveTol: 10, holdMs: 280, floorHoldMs: 500 };
/** NEWT's pick shapes are at least this radius (22 CSS px across), however small he draws. */
export const PICK_MIN_R = 11;

/**
 * @param {{moveTol?: number, holdMs?: number, floorHoldMs?: number, holdLift?: () => boolean}} [opts]
 *   holdLift: whether a second finger while NEWT is held lifts and lowers him (asked as it lands)
 */
export function createGesture(opts = {}) {
  const moveTol = opts.moveTol ?? GESTURE.moveTol;
  const holdMs = opts.holdMs ?? GESTURE.holdMs;
  const floorHoldMs = opts.floorHoldMs ?? GESTURE.floorHoldMs;
  /**
   * The press being tracked. mode: 'press' (one finger), 'pinch' (two: `second` is the other),
   * 'spent' (a finger left over from a pinch: it does nothing). drag: what a drag on empty space
   * does ('orbit' or 'pan'); taps: whether a still press taps. ox, oy: a drag's last point (a
   * pinch's: its middle's, once it pans).
   * lifter: a second finger lifting and lowering him while he's held (holdLift), its last y.
   * @type {{id: number, on: 'newt'|'floor', mode: 'press'|'pinch'|'spent', drag: 'orbit'|'pan', taps: boolean, x0: number, y0: number, t0: number, x: number, y: number, ox: number, oy: number, grabbed: boolean, moved: boolean, second: {id: number, x: number, y: number}|null, spread: number, panning: boolean, lifter?: {id: number, y: number}|null}|null}
   */
  let press = null;

  /** @returns {GestureEvent} */
  const ev = (type, on, x, y, t, extra = {}) => ({ type, on, x, y, t, ...extra });
  // (A whisker of slack: 1.28 − 1 is 0.28000000000000025 in floats.)
  const outlasts = (t0, t, ms) => (t - t0) * 1000 > ms + 1e-6;
  const strays = (x0, y0, x, y) => Math.hypot(x - x0, y - y0) > moveTol;
  /** The pinch's fingers apart (at least a pixel) and their middle. */
  const spreadOf = (q) => Math.max(1, Math.hypot(q.second.x - q.x, q.second.y - q.y));
  const middle = (q) => ({ x: (q.x + q.second.x) / 2, y: (q.y + q.second.y) / 2 });
  /** @returns {GestureEvent} */
  const pinch = (q, scale, t) => {
    const m = middle(q);
    return ev('pinch', 'floor', m.x, m.y, t, { scale });
  };
  /**
   * The second finger lifting him moved: its move up or down as a holdLift.
   * @param {{id: number, y: number}} f
   * @param {Ptr} p
   * @returns {GestureEvent[]}
   */
  const liftMove = (f, p) => {
    const dy = p.y - f.y;
    f.y = p.y;
    return dy ? [ev('holdLift', 'newt', p.x, p.y, p.t, { dy })] : [];
  };
  /** One of a pinch's fingers lifts: the other is left, spent. */
  const lift = (id) => {
    const q = press;
    if (!q?.second) return;
    if (id === q.second.id) q.second = null;
    else if (id === q.id) {
      Object.assign(q, { id: q.second.id, x: q.second.x, y: q.second.y });
      q.second = null;
    } else return;
    q.mode = 'spent';
  };

  /**
   * A pointermove of the press's own finger, or a hover (move, less a lifting finger's).
   * @param {Ptr} p
   * @param {boolean} onNewt
   * @returns {GestureEvent[]}
   */
  const moveOne = (p, onNewt) => {
    if (!press) return p.kind !== 'touch' && !p.buttons ? [ev('hover', onNewt ? 'newt' : 'floor', p.x, p.y, p.t)] : [];
    if (press.mode === 'pinch') {
      const f = p.id === press.id ? press : p.id === press.second?.id ? press.second : null;
      if (!f) return [];
      f.x = p.x;
      f.y = p.y;
      const spread = spreadOf(press);
      const scale = spread / press.spread;
      press.spread = spread;
      const out = [pinch(press, scale, p.t)];
      // (The fingers' middle: once it strays moveTol from where the pinch began, it pans too.)
      const m = middle(press);
      if (!press.panning && strays(press.ox, press.oy, m.x, m.y)) press.panning = true;
      if (press.panning && (m.x !== press.ox || m.y !== press.oy)) {
        out.push(ev('pan', 'floor', m.x, m.y, p.t, { dx: m.x - press.ox, dy: m.y - press.oy }));
        press.ox = m.x;
        press.oy = m.y;
      }
      return out;
    }
    if (p.id !== press.id) return [];
    press.x = p.x;
    press.y = p.y;
    if (press.mode === 'spent') return [];
    const out = [];
    if (press.on === 'newt') {
      if (!press.grabbed && (strays(press.x0, press.y0, p.x, p.y) || outlasts(press.t0, p.t, holdMs))) {
        press.grabbed = true;
        out.push(ev('grab', 'newt', p.x, p.y, p.t));
      }
      if (press.grabbed) out.push(ev('drag', 'newt', p.x, p.y, p.t));
    } else {
      if (strays(press.x0, press.y0, p.x, p.y)) press.moved = true;
      if (press.moved) {
        out.push(ev(press.drag, 'floor', p.x, p.y, p.t, { dx: p.x - press.ox, dy: p.y - press.oy }));
        press.ox = p.x;
        press.oy = p.y;
      }
    }
    return out;
  };

  return {
    /**
     * A pointerdown; `onNewt` from the page's pick. A second finger on a press that isn't
     * holding NEWT starts a pinch. A mouse's (or pen's) button, `p.button`: the main one (0) is
     * a finger's press but pans on empty space; the right one (2) orbits wherever it's pressed;
     * the middle one (1) pans; no other starts anything.
     * @param {Ptr} p
     * @param {boolean} onNewt
     * @returns {GestureEvent[]}
     */
    down(p, onNewt) {
      if (press) {
        if (p.kind === 'touch' && press.grabbed && p.id !== press.id && !press.lifter && opts.holdLift?.())
          press.lifter = { id: p.id, y: p.y };
        if (p.kind !== 'touch' || press.mode === 'pinch' || press.grabbed || p.id === press.id) return [];
        press.mode = 'pinch';
        press.second = { id: p.id, x: p.x, y: p.y };
        press.spread = spreadOf(press);
        const m = middle(press);
        press.ox = m.x;
        press.oy = m.y;
        return [pinch(press, 1, p.t)];
      }
      const touch = p.kind === 'touch';
      const button = touch ? 0 : (p.button ?? 0);
      if (button !== 0 && button !== 1 && button !== 2) return [];
      press = {
        id: p.id,
        on: onNewt && button === 0 ? 'newt' : 'floor',
        mode: 'press',
        drag: touch || button === 2 ? 'orbit' : 'pan',
        taps: button === 0,
        x0: p.x,
        y0: p.y,
        t0: p.t,
        x: p.x,
        y: p.y,
        ox: p.x,
        oy: p.y,
        grabbed: false,
        moved: false,
        second: null,
        spread: 1,
        panning: false,
      };
      return [];
    },
    /**
     * A pointermove. Without a press, a mouse (or pen) with no button down hovers; `onNewt`
     * says whether it's over him.
     * @param {Ptr} p
     * @param {boolean} [onNewt]
     * @returns {GestureEvent[]}
     */
    move(p, onNewt = false) {
      // (A second finger lifting him while he's held: holdLift.)
      if (press?.lifter && p.id === press.lifter.id) return liftMove(press.lifter, p);
      return moveOne(p, onNewt);
    },
    /**
     * A pointerup.
     * @param {Ptr} p
     * @returns {GestureEvent[]}
     */
    up(p) {
      if (!press) return [];
      if (press.lifter && p.id === press.lifter.id) {
        press.lifter = null;
        return [];
      }
      if (press.mode === 'pinch') {
        lift(p.id);
        return [];
      }
      if (p.id !== press.id) return [];
      const q = press;
      press = null;
      if (q.mode === 'spent') return [];
      const far = strays(q.x0, q.y0, p.x, p.y);
      if (q.on === 'newt') {
        if (q.grabbed) return [ev('release', 'newt', p.x, p.y, p.t)];
        if (far || outlasts(q.t0, p.t, holdMs))
          return [ev('grab', 'newt', p.x, p.y, p.t), ev('release', 'newt', p.x, p.y, p.t)];
        return [ev('tap', 'newt', p.x, p.y, p.t)];
      }
      if (q.moved || far) return [ev('release', 'floor', p.x, p.y, p.t)];
      if (!q.taps || outlasts(q.t0, p.t, floorHoldMs)) return [];
      return [ev('tap', 'floor', p.x, p.y, p.t)];
    },
    /**
     * pointercancel or lostpointercapture: a drop, never a tap (in a pinch, a finger lifting).
     * @param {number} id
     * @param {number} t
     * @returns {GestureEvent[]}
     */
    cancel(id, t) {
      if (!press) return [];
      if (press.lifter && id === press.lifter.id) {
        press.lifter = null;
        return [];
      }
      if (press.mode === 'pinch') {
        lift(id);
        return [];
      }
      if (id !== press.id) return [];
      const q = press;
      press = null;
      return q.mode === 'spent' ? [] : [ev('cancel', q.on, q.x, q.y, t)];
    },
    /**
     * Each frame: a press on NEWT held still past holdMs becomes a grab.
     * @param {number} t
     * @returns {GestureEvent[]}
     */
    tick(t) {
      if (!press || press.mode !== 'press' || press.on !== 'newt' || press.grabbed || !outlasts(press.t0, t, holdMs))
        return [];
      press.grabbed = true;
      return [ev('grab', 'newt', press.x, press.y, t)];
    },
    /**
     * The press being tracked, or null: its first finger, what it started on, whether it holds
     * NEWT, orbits, pans (a two-finger pan too) or pinches, where it is (a pinch's middle) and
     * where its first finger pressed (x0, y0: a grab comes only once a press has strayed, so the
     * point he's held by is the one pressed, not the one it strayed to).
     */
    current() {
      if (!press) return null;
      const at = press.mode === 'pinch' ? middle(press) : { x: press.x, y: press.y };
      const dragging = press.mode === 'press' && press.on === 'floor' && press.moved;
      return {
        id: press.id,
        on: press.on,
        grabbed: press.grabbed,
        orbit: dragging && press.drag === 'orbit',
        pan: (dragging && press.drag === 'pan') || (press.mode === 'pinch' && press.panning),
        pinch: press.mode === 'pinch',
        x: at.x,
        y: at.y,
        x0: press.x0,
        y0: press.y0,
      };
    },
  };
}

/**
 * Where a ray meets a plane (`point` on it, `normal` across it), or null when it never does
 * (parallel, or the plane behind the ray's origin).
 * @param {import('./types.js').XYZ} o  origin
 * @param {import('./types.js').XYZ} d  direction (any length)
 * @param {{point: import('./types.js').XYZ, normal: import('./types.js').XYZ}} plane
 * @returns {import('./types.js').XYZ|null}
 */
export function rayPlane(o, d, { point, normal }) {
  const along = d.x * normal.x + d.y * normal.y + d.z * normal.z;
  if (Math.abs(along) < 1e-9) return null;
  const s = ((point.x - o.x) * normal.x + (point.y - o.y) * normal.y + (point.z - o.z) * normal.z) / along;
  if (s < 0) return null;
  return { x: o.x + s * d.x, y: o.y + s * d.y, z: o.z + s * d.z };
}

/**
 * Where a ray meets the level plane at height `y`, or null when it never does.
 * @param {import('./types.js').XYZ} o  origin
 * @param {import('./types.js').XYZ} d  direction (any length)
 * @param {number} y
 * @returns {import('./types.js').XZ|null}
 */
export function rayPlaneY(o, d, y) {
  if (Math.abs(d.y) < 1e-9) return null;
  const s = (y - o.y) / d.y;
  if (s < 0) return null;
  return { x: o.x + s * d.x, z: o.z + s * d.z };
}

/**
 * Whether a point (CSS px) is on NEWT: his head circle or his body capsule, each at least
 * PICK_MIN_R in radius, grown by `slop`.
 * @param {{x: number, y: number}} p
 * @param {{x: number, y: number, r: number}|null} head
 * @param {{a: {x: number, y: number}, b: {x: number, y: number}, r: number}|null} body
 * @param {number} [slop]
 */
export function pickScreen(p, head, body, slop = 0) {
  if (head && Math.hypot(p.x - head.x, p.y - head.y) <= Math.max(head.r, PICK_MIN_R) + slop) return true;
  if (body && segmentDistance(p, body.a, body.b) <= Math.max(body.r, PICK_MIN_R) + slop) return true;
  return false;
}

/** @param {{x: number, y: number}} p @param {{x: number, y: number}} a @param {{x: number, y: number}} b */
function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const s = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + s * dx), p.y - (a.y + s * dy));
}
