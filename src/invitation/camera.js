// The invitation toy's orbit camera, in plain numbers (stage.js hands its pose to three.js).
// Pure: no three.js, no DOM, no clock.
//
// An orbit (a finger's drag on empty space, the mouse's right-drag anywhere) turns it: across,
// around the vertical axis (as far round as you like: the world turns with the finger, so the
// camera goes the other way; a drag across the whole stage is ORBIT.turn of a turn, so a phone
// and a desktop feel alike); down and up, its elevation between ORBIT.elevMin and elevMax
// (dragging down looks more from above; ORBIT.tilt for the stage's whole height). The mouse
// wheel and a two-finger pinch zoom between half and twice the default distance. The view eases
// toward where the input puts it (`goal`, damped, never overshooting) and a fling coasts a
// little once the finger lifts. A pan (the mouse's left-drag on empty space, or two fingers'
// middle) slides it across and up and down the screen at once, the floor under the cursor going
// with it (orbitPan), the point it looks at kept inside the play area (orbitArea) so the play
// area is never lost.
//
// The point it orbits sits at NEWT's middle height over its rest point (`base`, the play area's
// middle to begin with) and follows NEWT softly the closer it zooms, all the way at the closest;
// on a phone (pixels.js compactStage), where he's drawn bigger, ORBIT.phoneFollow of the way at
// the default zoom too. The play area is bigger than any view but the fully zoomed-out one
// (area.js), so the view keeps him on screen however it's turned: while he's well inside the
// clear space (ORBIT.keepIn of it round where the point it looks at shows) it holds still, and
// as he nears its edge the rest point moves on with him, softly, never letting him past
// ORBIT.keepOut of it once he's on screen (orbitStep, from where screenOf puts him). A pan
// stops all of that: the view stays where it was put until NEWT himself walks off the screen.
// While he's held (orbitHold) it holds still, so the point he's grabbed by stays under the
// cursor; let go out past ORBIT.keepOut (carried to the screen's edge), the view eases back
// round him at ORBIT.settle rather than snapping there in a frame. While the Look sheet is open it follows him all the way at any zoom (orbitFollowAll),
// so he stays in the clear space the sheet leaves. Reset Camera eases back to the default view,
// the short way round, and clears the pan. The light goes round with it (lightDir: the look's
// sun turned by the camera's yaw), so his shadow always falls the same way on screen, back and
// to one side. Angles in radians (yaw 0: the camera on the +z side, + toward +x), distances in
// world units, drags in CSS px.
//
// Play Intro's shots (orbitTalk, shotView, orbitShot): the view goes round to the front (the
// default view's yaw, the short way) and each chat box's camera eases there at SHOT.ease (or
// cuts, for reduced motion): close, his head and shoulders; medium, his whole body; wide, the
// default view's distance and tilt; keep, as it was. A shot fills SHOT[name].fill of the clear
// space over the chat box with him and shows him `raise` CSS px above where the point it looks at
// shows (the middle of that space), by aiming below his middle; the point it orbits stays on him.
// Nothing else moves it meanwhile (main.js sends no gestures); at the end it eases back to the
// view from before the intro, its pan and zoom included. With reduced motion the turn to the
// front and the way back cut too.

import { NEWT_HEIGHT, NEWT_RADIUS } from './area.js';
import { FOCUS_Y, VIEW, compactStage } from './pixels.js';
import { clampTo } from './steer.js';

/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').Bounds} Bounds */

const RAD = Math.PI / 180;

/**
 * elevMin/elevMax: radians up from the floor. zoomMin/zoomMax: the distance's range, × the
 * default. turn: the share of a whole turn for a drag across the stage's whole width; tilt:
 * radians for a drag down its whole height (π: the old feel on a 700 px stage). ease: seconds
 * the view takes to close most of the way to its goal (a time constant); resetEase: the same
 * for Reset Camera.
 * A fling: the drag's speed (at most spinMax rad/s) carries on when the finger lifts within
 * flingWindow s of its last move, slowing at `coast` per second. follow: the time constant of
 * the orbit's point following NEWT; phoneFollow: how much of the way it follows him at the
 * default zoom on a phone's stage. wheel: zoom per px of wheel (a factor of e^(px × wheel)).
 * keepIn: the share of the clear space round where the point it looks at shows that NEWT may
 * roam with the view holding still; keepOut: the share he's never let past once he's on screen;
 * settle: the time constant it brings him back inside keepOut at once he's let go out past it.
 */
export const ORBIT = {
  elevMin: 12 * RAD,
  elevMax: 70 * RAD,
  zoomMin: 0.5,
  zoomMax: 2,
  turn: 0.75,
  tilt: Math.PI,
  ease: 0.1,
  resetEase: 0.3,
  spinMax: 3,
  flingWindow: 0.08,
  coast: 6,
  follow: 0.5,
  phoneFollow: 0.8,
  wheel: 0.0015,
  keepIn: 0.6,
  keepOut: 0.94,
  settle: 0.25,
};
export { FOCUS_Y };

/**
 * Play Intro's shots: `span` world units of him (from `mid` - span/2 to `mid` + span/2) fill `fill`
 * of the clear space's height, seen `elevation` radians up; `ease`, the time constant the view
 * eases to a shot at, seconds.
 */
export const SHOT = {
  close: { span: 0.62, mid: 0.72, fill: 0.78, elevation: 9 * RAD },
  medium: { span: 1.1, mid: 0.52, fill: 0.7, elevation: 16 * RAD },
  ease: 0.45,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
/** The stage's clear space round where the point it looks at shows, when nothing says (a top margin, a toolbar, side edges). */
const frameOf = (w, h) => ({ hw: Math.max(1, w / 2 - 24), hh: Math.max(1, (h - 88) / 2) });

/**
 * @typedef {object} OrbitState  updated in place by the functions below
 * @property {number} yaw  the view now
 * @property {number} elevation
 * @property {number} distance
 * @property {XYZ} target  the point it orbits now
 * @property {{yaw: number, elevation: number, distance: number}} goal  where the input put it
 * @property {{yaw: number, elevation: number, distance: number}} home  the default view
 * @property {XZ} centre  the play area's centre
 * @property {{w: number, h: number}} span  the stage, CSS px (a drag's turn and tilt scale by it)
 * @property {number} followHome  how much the orbit follows NEWT at the default zoom (a phone's
 *   stage: ORBIT.phoneFollow; else 0)
 * @property {boolean} followAll  it follows him all the way, at any zoom (the Look sheet open)
 * @property {{yaw: number, elevation: number}} spin  a fling's coast, rad/s
 * @property {{yaw: number, elevation: number, t: number}|null} drag  a drag under way: its speed and last move
 * @property {boolean} resetting  easing back to the default
 * @property {XZ} base  the rest point: where the point it orbits goes when it isn't following him
 * @property {boolean} panned  the user's pan holds the view (until NEWT walks off the screen)
 * @property {boolean} panning  a pan under way
 * @property {boolean} holding  NEWT held: the view holds still
 * @property {boolean} settling  let go out past keepOut: it eases him back inside, not at once
 * @property {Bounds|null} area  the play area: a pan keeps the point it looks at inside it
 * @property {number} ch  the canvas's CSS height (the field of view spans it)
 * @property {{hw: number, hh: number}} frame  half the clear space round where the point it
 *   looks at shows, CSS px (it's shown in its middle: pixels.js frameView)
 * @property {boolean} seen  NEWT was inside ORBIT.keepOut of the clear space last frame
 * @property {TalkView|null} [talk]  while Play Intro runs: the front it's seen from, the shot, the view before
 */
/** @typedef {{yaw: number, elevation: number, distance: number, lookY: number}} ShotView  a shot's view: lookY, the height it aims at */
/**
 * @typedef {object} TalkView
 * @property {number} yaw  the front, the short way round from where it was
 * @property {ShotView|null} view  the shot under way (null: none yet)
 * @property {{yaw: number, elevation: number, distance: number, base: XZ, panned: boolean}} saved  the view before
 */

/**
 * @param {{distance: number, elevation?: number, yaw?: number, centre?: XZ, span?: {w: number, h: number}}} o
 *   the default view (elevation: VIEW's by default) over the play area's centre, and the stage
 *   it's dragged on (CSS px: the 1280×800 desktop by default)
 * @returns {OrbitState}
 */
export function createOrbit({
  distance,
  elevation = VIEW.elevation * RAD,
  yaw = 0,
  centre = { x: 0, z: 0 },
  span = { w: 1280, h: 800 },
}) {
  const home = { yaw, elevation, distance };
  const w = span.w > 0 ? span.w : 1280;
  const h = span.h > 0 ? span.h : 800;
  return {
    yaw,
    elevation,
    distance,
    target: { x: centre.x, y: FOCUS_Y, z: centre.z },
    goal: { ...home },
    home,
    centre: { x: centre.x, z: centre.z },
    span: { w, h },
    followHome: compactStage(w, h) ? ORBIT.phoneFollow : 0,
    followAll: false,
    spin: { yaw: 0, elevation: 0 },
    drag: null,
    resetting: false,
    base: { x: centre.x, z: centre.z },
    panned: false,
    panning: false,
    holding: false,
    settling: false,
    area: null,
    ch: h,
    frame: frameOf(w, h),
    seen: true,
  };
}

/**
 * Radians a CSS px dragged across turns it, on this stage.
 * @param {OrbitState} s
 */
export const turnPerPx = (s) => (ORBIT.turn * 2 * Math.PI) / s.span.w;
/**
 * Radians a CSS px dragged down tilts it, on this stage.
 * @param {OrbitState} s
 */
export const tiltPerPx = (s) => ORBIT.tilt / s.span.h;

/**
 * World units a CSS px covers at the distance of the point it looks at.
 * @param {OrbitState} s
 */
export const worldPerPx = (s) => (2 * s.distance * Math.tan((VIEW.fov * RAD) / 2)) / s.ch;
/** CSS px a unit at a depth of one covers (the camera's focal length on the canvas). */
const focal = (s) => s.ch / 2 / Math.tan((VIEW.fov * RAD) / 2);

/**
 * The stage's new size, CSS px (a resize): drags turn and tilt by it from now on, and on a
 * phone's stage the orbit follows NEWT at the default zoom too; `ch`, the canvas's CSS height
 * (the field of view's: a pan's and screenOf's scale), the stage's by default; `hw`, `hh`, half
 * the clear space round where the point it looks at shows (keeping him on screen), the stage's
 * less a margin and a toolbar by default. A size that isn't one (0 or less, not a number) keeps
 * the last.
 * @param {OrbitState} s
 * @param {{w: number, h: number, ch?: number, hw?: number, hh?: number}} span
 */
export function orbitSpan(s, { w, h, ch, hw, hh }) {
  if (w > 0) s.span.w = w;
  if (h > 0) s.span.h = h;
  s.followHome = compactStage(s.span.w, s.span.h) ? ORBIT.phoneFollow : 0;
  s.ch = ch && ch > 0 ? ch : s.span.h;
  const f = frameOf(s.span.w, s.span.h);
  s.frame = { hw: hw && hw > 0 ? hw : f.hw, hh: hh && hh > 0 ? hh : f.hh };
}

/**
 * The play area (area.js viewArea): a pan keeps the point it looks at inside it.
 * @param {OrbitState} s
 * @param {Bounds|null} area
 */
export function orbitArea(s, area) {
  s.area = area;
  if (area && s.panned) {
    const c = clampTo(area, s.base);
    s.target.x += c.x - s.base.x;
    s.target.z += c.z - s.base.z;
    s.base = c;
  }
}

/**
 * Where the floor shows at a point on screen, `p` CSS px from where the point it looks at shows
 * (screenOf's inverse at the floor), or null where there's no floor (at or above the horizon).
 * @param {OrbitState} s
 * @param {{x: number, y: number}} p
 * @returns {XZ|null}
 */
export function floorUnder(s, p) {
  const ce = Math.cos(s.elevation);
  const se = Math.sin(s.elevation);
  const sy = Math.sin(s.yaw);
  const cy = Math.cos(s.yaw);
  const a = p.x / focal(s);
  const b = p.y / focal(s);
  // (Forward, plus `a` of the screen's right, less `b` of its up.)
  const d = { x: -sy * ce + a * cy + b * sy * se, y: -se - b * ce, z: -cy * ce - a * sy + b * cy * se };
  if (d.y > -1e-6) return null;
  const c = {
    x: s.target.x + s.distance * sy * ce,
    y: s.target.y + s.distance * se,
    z: s.target.z + s.distance * cy * ce,
  };
  const t = -c.y / d.y;
  return { x: c.x + t * d.x, z: c.z + t * d.z };
}

/**
 * A pan, `dx`, `dy` CSS px, ending `at` (CSS px from where the point it looks at shows; that
 * point itself by default): the view slides with the cursor across and up and down the screen,
 * at once, the floor that was under the cursor staying under it (or, with no floor under it,
 * the floor as far off as the point it looks at), as fast as six times that at most (near the
 * horizon); the point it looks at stays at NEWT's middle height and inside the play area. The
 * view then stays where it's put (no following) until NEWT walks off the screen.
 * @param {OrbitState} s
 * @param {number} dx
 * @param {number} dy
 * @param {{x: number, y: number}} [at]
 */
export function orbitPan(s, dx, dy, at = { x: 0, y: 0 }) {
  if (!s.panned) s.base = { x: s.target.x, z: s.target.z };
  s.panned = true;
  s.panning = true;
  if (!dx && !dy) return;
  // (Whether he's on screen is the next frame's to say: a pan that takes him off it, even one
  // let go before a frame is drawn, is never him walking off it.)
  s.seen = false;
  const k = worldPerPx(s);
  const was = floorUnder(s, { x: at.x - dx, y: at.y - dy });
  const now = floorUnder(s, at);
  let move;
  if (was && now) move = { x: was.x - now.x, z: was.z - now.z };
  else {
    // (Across: the screen's right on the floor; down the screen: away from the camera, a floor
    // step showing sin(elevation) as tall as it is long.)
    const deep = k / Math.max(0.2, Math.sin(s.elevation));
    move = {
      x: -dx * k * Math.cos(s.yaw) - dy * deep * Math.sin(s.yaw),
      z: dx * k * Math.sin(s.yaw) - dy * deep * Math.cos(s.yaw),
    };
  }
  const most = 6 * k * Math.hypot(dx, dy);
  const len = Math.hypot(move.x, move.z);
  if (len > most) move = { x: (move.x * most) / len, z: (move.z * most) / len };
  let next = { x: s.base.x + move.x, z: s.base.z + move.z };
  if (s.area) next = clampTo(s.area, next);
  s.target.x += next.x - s.base.x;
  s.target.z += next.z - s.base.z;
  s.base = next;
}

/**
 * NEWT held (`on`): the view holds still, so the point he's grabbed by stays under the cursor;
 * let go, it follows him again (from out past keepOut, easing him back inside: followStep).
 * @param {OrbitState} s
 * @param {boolean} on
 */
export function orbitHold(s, on) {
  if (s.holding && !on) s.settling = true;
  s.holding = on;
}

/**
 * A drag's move on empty space, `dx`, `dy` CSS px at `t` seconds: across turns, down tilts up.
 * @param {OrbitState} s
 * @param {number} dx
 * @param {number} dy
 * @param {number} t
 */
export function orbitDrag(s, dx, dy, t) {
  const before = { yaw: s.goal.yaw, elevation: s.goal.elevation };
  s.goal.yaw -= dx * turnPerPx(s);
  s.goal.elevation = clamp(s.goal.elevation + dy * tiltPerPx(s), ORBIT.elevMin, ORBIT.elevMax);
  s.spin = { yaw: 0, elevation: 0 };
  s.resetting = false;
  const d = s.drag;
  const span = d ? t - d.t : 0;
  if (d && span > 1e-4) {
    // (The drag's speed, smoothed over about 50 ms of moves.)
    const k = Math.min(1, span / 0.05);
    d.yaw += ((s.goal.yaw - before.yaw) / span - d.yaw) * k;
    d.elevation += ((s.goal.elevation - before.elevation) / span - d.elevation) * k;
    d.t = t;
  } else if (!d) s.drag = { yaw: 0, elevation: 0, t };
}

/**
 * The finger lifts: a drag still moving within ORBIT.flingWindow coasts on.
 * @param {OrbitState} s
 * @param {number} t
 */
export function orbitRelease(s, t) {
  const d = s.drag;
  s.drag = null;
  if (!d || t - d.t > ORBIT.flingWindow) return;
  s.spin = {
    yaw: clamp(d.yaw, -ORBIT.spinMax, ORBIT.spinMax),
    elevation: clamp(d.elevation, -ORBIT.spinMax, ORBIT.spinMax),
  };
}

/**
 * Zoom by `factor`: above 1 closer (fingers spreading), below 1 further, within the range.
 * @param {OrbitState} s
 * @param {number} factor
 */
export function orbitZoom(s, factor) {
  if (!(factor > 0)) return;
  const h = s.home.distance;
  s.goal.distance = clamp(s.goal.distance / factor, h * ORBIT.zoomMin, h * ORBIT.zoomMax);
  s.resetting = false;
}

/**
 * The mouse wheel, `deltaY` px (positive: toward you, further away).
 * @param {OrbitState} s
 * @param {number} deltaY
 */
export function orbitWheel(s, deltaY) {
  orbitZoom(s, Math.exp(-deltaY * ORBIT.wheel));
}

/**
 * The frame's gestures (gesture.js): an orbit turns it, a pan slides it, a pinch zooms it, a
 * drag letting go (a release or cancel on the floor) may fling an orbit and ends a pan; taps and
 * NEWT's own gestures leave it be. `shownAt`: where the point it looks at shows, in the events'
 * client px (a pan keeps the floor under the cursor; without it, under where that point shows).
 * @param {OrbitState} s
 * @param {import('./types.js').GestureEvent[]} events
 * @param {{x: number, y: number}|null} [shownAt]
 */
export function orbitEvents(s, events, shownAt = null) {
  for (const e of events) {
    if (e.type === 'orbit') orbitDrag(s, e.dx ?? 0, e.dy ?? 0, e.t);
    else if (e.type === 'pan')
      orbitPan(s, e.dx ?? 0, e.dy ?? 0, shownAt ? { x: e.x - shownAt.x, y: e.y - shownAt.y } : undefined);
    else if (e.type === 'pinch' && e.scale && e.scale !== 1) orbitZoom(s, e.scale);
    else if (e.on === 'floor' && (e.type === 'release' || e.type === 'cancel')) {
      orbitRelease(s, e.t);
      s.panning = false;
    }
  }
}

/**
 * Reset Camera: ease back to the default view, the short way round, and clear the pan (the rest
 * point back on the play area's middle; keeping NEWT on screen may hold it nearer him).
 * @param {OrbitState} s
 */
export function orbitReset(s) {
  s.goal = {
    yaw: s.yaw + wrap(s.home.yaw - s.yaw),
    elevation: s.home.elevation,
    distance: s.home.distance,
  };
  s.spin = { yaw: 0, elevation: 0 };
  s.drag = null;
  s.resetting = true;
  s.base = { x: s.centre.x, z: s.centre.z };
  s.panned = false;
  s.panning = false;
}

/**
 * A new default distance (the screen resized): the zoom stays what it was.
 * @param {OrbitState} s
 * @param {number} distance
 */
export function orbitHome(s, distance) {
  if (!(distance > 0)) return;
  const k = distance / s.home.distance;
  s.home.distance = distance;
  s.goal.distance *= k;
  s.distance *= k;
  if (s.talk) s.talk.saved.distance *= k;
}

/**
 * Play Intro begins (`on`): the view turns round to the front, the short way, and waits for the
 * boxes' shots; or it's over: the view eases back to where it was before, its pan included.
 * `cut` (reduced motion): there at once, the way back looking where it did (`focus`: NEWT, whom
 * the point it looks at follows as it would).
 * @param {OrbitState} s
 * @param {boolean} on
 * @param {{cut?: boolean, focus?: XZ|null}} [o]
 */
export function orbitTalk(s, on, { cut = false, focus = null } = {}) {
  if (on) {
    if (s.talk) return;
    s.talk = {
      yaw: s.yaw + wrap(s.home.yaw - s.yaw),
      view: null,
      saved: {
        yaw: s.goal.yaw,
        elevation: s.goal.elevation,
        distance: s.goal.distance,
        base: { ...s.base },
        panned: s.panned,
      },
    };
    s.spin = { yaw: 0, elevation: 0 };
    s.drag = null;
    s.resetting = false;
    s.holding = false;
    s.goal.yaw = s.talk.yaw;
    if (cut) s.yaw = s.talk.yaw;
    return;
  }
  const t = s.talk;
  if (!t) return;
  s.talk = null;
  // (Back the short way to the yaw it had, from wherever the shots left it.)
  s.goal = { yaw: s.yaw + wrap(t.saved.yaw - s.yaw), elevation: t.saved.elevation, distance: t.saved.distance };
  s.base = { ...t.saved.base };
  s.panned = t.saved.panned;
  s.panning = false;
  s.resetting = true;
  // (Close in, he's past the clear space's edge: not walked off it, so a pan holds until he's back in.)
  s.seen = false;
  if (!cut) return;
  s.yaw = s.goal.yaw;
  s.elevation = s.goal.elevation;
  s.distance = s.goal.distance;
  s.resetting = false;
  const want = wanted(s, focus);
  s.target = { x: want.x, y: FOCUS_Y, z: want.z };
}

/**
 * A shot's view while Play Intro runs (null for keep, or with no intro under way): from the
 * front, at the distance that makes SHOT[shot].span fill its share of the clear space's height
 * `clear.h` (CSS px), aimed low enough that his middle shows `clear.raise` px above where the
 * point it looks at shows; wide, the default view's distance and tilt.
 * @param {OrbitState} s
 * @param {import('./types.js').DialogueShot} shot
 * @param {{h: number, raise: number}} [clear]
 * @returns {ShotView|null}
 */
export function shotView(s, shot, clear = { h: s.span.h * 0.6, raise: 0 }) {
  if (!s.talk || shot === 'keep') return null;
  const f = focal(s);
  const raise = Number.isFinite(clear.raise) ? clear.raise : 0;
  const lower = (mid, distance, elevation) => mid - (raise * distance) / (f * Math.cos(elevation));
  if (shot === 'wide') {
    const { elevation, distance } = s.home;
    return { yaw: s.talk.yaw, elevation, distance, lookY: lower(FOCUS_Y, distance, elevation) };
  }
  const spec = SHOT[shot];
  if (!spec) return null;
  const h = Math.max(80, clear.h);
  const distance = (spec.span * Math.cos(spec.elevation) * f) / (spec.fill * h);
  return { yaw: s.talk.yaw, elevation: spec.elevation, distance, lookY: lower(spec.mid, distance, spec.elevation) };
}

/**
 * Go to a shot (shotView's; null keeps the view as it is): eased at SHOT.ease, or there at once
 * (`cut`, for reduced motion; `focus`: NEWT, whom the point it looks at goes onto).
 * @param {OrbitState} s
 * @param {ShotView|null} view
 * @param {{cut?: boolean, focus?: XZ|null}} [o]
 */
export function orbitShot(s, view, { cut = false, focus = null } = {}) {
  if (!s.talk || !view) return;
  s.talk.view = view;
  s.goal = { yaw: view.yaw, elevation: view.elevation, distance: view.distance };
  if (!cut) return;
  s.yaw = view.yaw;
  s.elevation = view.elevation;
  s.distance = view.distance;
  if (focus) {
    s.target.x = focus.x;
    s.target.z = focus.z;
  }
  s.target.y = view.lookY;
}

/**
 * Follow NEWT all the way at any zoom (`on`: the Look sheet is open, and he stays in the clear
 * space it leaves), or as far as the zoom says again. The orbit's point eases there either way.
 * @param {OrbitState} s
 * @param {boolean} on
 */
export function orbitFollowAll(s, on) {
  s.followAll = on;
}

/**
 * How much the orbit follows NEWT at this zoom: `followHome` at the default distance or
 * further (0 but on a phone), 1 at the closest, a straight line between; 1 at any zoom while it
 * follows him all the way (orbitFollowAll).
 * @param {OrbitState} s
 */
export function followShare(s) {
  if (s.followAll) return 1;
  const h = s.home.distance;
  const span = h * (1 - ORBIT.zoomMin);
  const closer = span > 0 ? clamp((h - s.distance) / span, 0, 1) : 0;
  return s.followHome + (1 - s.followHome) * closer;
}

/**
 * Where a world point shows with the camera where `s` has it (looking at `target`, its own by
 * default): CSS px from where the point it looks at shows (+x right, +y down), and its depth
 * along the view, world units; null behind the camera.
 * @param {OrbitState} s
 * @param {XYZ} p
 * @param {XYZ} [target]
 * @returns {{x: number, y: number, depth: number}|null}
 */
export function screenOf(s, p, target = s.target) {
  const f = focal(s);
  const ce = Math.cos(s.elevation);
  const se = Math.sin(s.elevation);
  const sy = Math.sin(s.yaw);
  const cy = Math.cos(s.yaw);
  const vx = p.x - (target.x + s.distance * sy * ce);
  const vy = p.y - (target.y + s.distance * se);
  const vz = p.z - (target.z + s.distance * cy * ce);
  const depth = -(vx * sy * ce + vy * se + vz * cy * ce);
  if (depth <= 1e-6) return null;
  const across = vx * cy - vz * sy;
  const up = -vx * sy * se + vy * ce - vz * cy * se;
  return { x: (across / depth) * f, y: (-up / depth) * f, depth };
}

/**
 * NEWT standing at `n` (his feet at `n.y`, 0 on the floor) on screen, looking at `target`: his
 * body's extremes, CSS px from where it shows, and his depth; null when he's behind the camera.
 * @param {OrbitState} s
 * @param {{x: number, z: number, y?: number}} n
 * @param {XYZ} target
 */
function newtBox(s, n, target) {
  const y = n.y ?? 0;
  const feet = screenOf(s, { x: n.x, y, z: n.z }, target);
  const head = screenOf(s, { x: n.x, y: y + NEWT_HEIGHT, z: n.z }, target);
  if (!feet || !head) return null;
  const f = focal(s);
  const rf = (NEWT_RADIUS * f) / feet.depth;
  const rh = (NEWT_RADIUS * f) / head.depth;
  return {
    left: Math.min(feet.x - rf, head.x - rh),
    right: Math.max(feet.x + rf, head.x + rh),
    top: head.y - rh,
    bottom: feet.y + rf,
    depth: feet.depth,
  };
}

/**
 * How far NEWT's box is past `share` of the clear space, CSS px (+x: past its right, +y: past its
 * bottom; a box wider than it, its middle), or null when it's inside.
 * @param {OrbitState} s
 * @param {NonNullable<ReturnType<typeof newtBox>>} box
 * @param {number} share
 */
function past(s, box, share) {
  const w = s.frame.hw * share;
  const h = s.frame.hh * share;
  const over = (lo, hi, m) => {
    if (lo < -m && hi > m) return (lo + hi) / 2;
    if (hi > m) return hi - m;
    if (lo < -m) return lo + m;
    return 0;
  };
  const x = over(box.left, box.right, w);
  const y = over(box.top, box.bottom, h);
  return x || y ? { x, y } : null;
}

/**
 * The floor step that moves the point it looks at so something `by` CSS px off, at `depth`,
 * shows that much nearer the middle.
 * @param {OrbitState} s
 * @param {{x: number, y: number}} by
 * @param {number} depth
 * @returns {XZ}
 */
function stepFor(s, by, depth) {
  const k = (depth * 2 * Math.tan((VIEW.fov * RAD) / 2)) / s.ch;
  const deep = k / Math.max(0.2, Math.sin(s.elevation));
  // (Across: along the screen's right; down the screen: toward the camera.)
  return {
    x: by.x * k * Math.cos(s.yaw) + by.y * deep * Math.sin(s.yaw),
    z: -by.x * k * Math.sin(s.yaw) + by.y * deep * Math.cos(s.yaw),
  };
}

/**
 * Where the point it orbits should be this frame, on the floor, given NEWT at `focus` (null:
 * not in yet): the rest point, followed toward him by the zoom's share, the rest point moved on
 * so he's inside ORBIT.keepIn of the clear space there; the rest point alone while a pan holds
 * the view; him while the Look sheet is open. Moves `s.base` with him as it must.
 * @param {OrbitState} s
 * @param {{x: number, z: number, y?: number}|null} focus
 * @returns {XZ}
 */
function wanted(s, focus) {
  if (!focus) return s.base;
  if (s.followAll) return { x: focus.x, z: focus.z };
  if (s.panned) return s.base;
  const share = followShare(s);
  const want = { x: s.base.x + (focus.x - s.base.x) * share, z: s.base.z + (focus.z - s.base.z) * share };
  for (let i = 0; i < 3; i++) {
    const box = newtBox(s, focus, { x: want.x, y: FOCUS_Y, z: want.z });
    const by = box && past(s, box, ORBIT.keepIn);
    if (!box || !by) break;
    const d = stepFor(s, by, box.depth);
    want.x += d.x;
    want.z += d.z;
  }
  s.base =
    share < 0.999
      ? { x: (want.x - share * focus.x) / (1 - share), z: (want.z - share * focus.z) / (1 - share) }
      : { x: focus.x, z: focus.z };
  return want;
}

/**
 * Whether the view is still turning: dragged, a fling still coasting, or its yaw or tilt still
 * easing toward the goal (within a thousandth of a radian counts as there). Read by ?test, so
 * a browser spec waits on the view coming to rest rather than on a still moment between polls.
 * @param {OrbitState} s
 */
export function orbitTurning(s) {
  return (
    Boolean(s.drag) ||
    s.spin.yaw !== 0 ||
    s.spin.elevation !== 0 ||
    Math.abs(s.goal.yaw - s.yaw) > 1e-3 ||
    Math.abs(s.goal.elevation - s.elevation) > 1e-3
  );
}

/**
 * One frame: a fling coasts, the view eases toward its goal, and the orbit's point eases toward
 * where it's wanted (NEWT at `focus`, his spot on the floor and how high his feet are: the rest
 * point, the zoom's share of the way to him, keeping him on screen), never letting him past
 * ORBIT.keepOut of the clear space once he's on screen; held still while he's held, and while a
 * pan holds the view until he walks off the screen.
 * @param {OrbitState} s
 * @param {number} dt
 * @param {{x: number, z: number, y?: number}|null} focus
 */
export function orbitStep(s, dt, focus) {
  if (!(dt > 0)) return;
  if (!s.drag && (s.spin.yaw || s.spin.elevation)) {
    s.goal.yaw += s.spin.yaw * dt;
    const e = s.goal.elevation + s.spin.elevation * dt;
    s.goal.elevation = clamp(e, ORBIT.elevMin, ORBIT.elevMax);
    if (s.goal.elevation !== e) s.spin.elevation = 0;
    const slow = Math.exp(-ORBIT.coast * dt);
    s.spin.yaw = Math.abs(s.spin.yaw * slow) < 1e-3 ? 0 : s.spin.yaw * slow;
    s.spin.elevation = Math.abs(s.spin.elevation * slow) < 1e-3 ? 0 : s.spin.elevation * slow;
  }
  const k = 1 - Math.exp(-dt / (s.talk ? SHOT.ease : s.resetting ? ORBIT.resetEase : ORBIT.ease));
  s.yaw += (s.goal.yaw - s.yaw) * k;
  s.elevation += (s.goal.elevation - s.elevation) * k;
  s.distance += (s.goal.distance - s.distance) * k;
  // (Yaw goes round and round: both are kept within half a turn of zero together.)
  const turns = s.yaw - wrap(s.yaw);
  if (turns) {
    s.yaw -= turns;
    s.goal.yaw -= turns;
  }
  if (
    s.resetting &&
    Math.abs(s.goal.yaw - s.yaw) < 1e-4 &&
    Math.abs(s.goal.elevation - s.elevation) < 1e-4 &&
    Math.abs(s.goal.distance - s.distance) < 1e-3 * s.home.distance
  )
    s.resetting = false;
  followStep(s, dt, focus);
}

/**
 * The orbit's point this frame (orbitStep's second half): toward where it's wanted, softly,
 * never letting NEWT past ORBIT.keepOut of the clear space once he's on screen (just let go out
 * past it, carried there: eased back inside at ORBIT.settle, so the view never jumps).
 * @param {OrbitState} s
 * @param {number} dt
 * @param {{x: number, z: number, y?: number}|null} focus
 */
function followStep(s, dt, focus) {
  if (s.talk) {
    // (Play Intro: on him, at the shot's height, eased as the shot is.)
    const k = 1 - Math.exp(-dt / SHOT.ease);
    if (focus) {
      s.target.x += (focus.x - s.target.x) * k;
      s.target.z += (focus.z - s.target.z) * k;
    }
    s.target.y += ((s.talk.view?.lookY ?? s.target.y) - s.target.y) * k;
    s.seen = true;
    return;
  }
  if (s.holding) {
    s.seen = true;
    return;
  }
  const want = wanted(s, focus);
  const f = 1 - Math.exp(-dt / ORBIT.follow);
  s.target.x += (want.x - s.target.x) * f;
  s.target.z += (want.z - s.target.z) * f;
  // (Back to his middle height after the intro's shots aimed higher or lower.)
  if (s.target.y !== FOCUS_Y)
    s.target.y = Math.abs(FOCUS_Y - s.target.y) < 1e-6 ? FOCUS_Y : s.target.y + (FOCUS_Y - s.target.y) * f;
  if (!focus) return;
  const box = newtBox(s, focus, s.target);
  const out = box ? past(s, box, ORBIT.keepOut) : null;
  if (!out) s.settling = false;
  if (s.panned) {
    // (Walked off the screen by himself, not panned off it: the follow takes him again, from the
    // edge he went out by.)
    if (out && s.seen && !s.panning) s.panned = false;
    else {
      s.seen = !out;
      return;
    }
  }
  if (out && box && s.seen && !s.followAll) {
    const k = s.settling ? 1 - Math.exp(-dt / ORBIT.settle) : 1;
    const d = stepFor(s, { x: out.x * k, y: out.y * k }, box.depth);
    s.target.x += d.x;
    s.target.z += d.z;
    const share = followShare(s);
    if (share < 0.999) {
      s.base.x += d.x / (1 - share);
      s.base.z += d.z / (1 - share);
    }
    s.seen = true;
  } else s.seen = !out;
}

/**
 * Where the camera is and what it looks at.
 * @param {OrbitState} s
 * @returns {{position: XYZ, target: XYZ}}
 */
export function orbitPose(s) {
  const c = Math.cos(s.elevation);
  const t = s.target;
  return {
    position: {
      x: t.x + s.distance * Math.sin(s.yaw) * c,
      y: t.y + s.distance * Math.sin(s.elevation),
      z: t.z + s.distance * Math.cos(s.yaw) * c,
    },
    target: { x: t.x, y: t.y, z: t.z },
  };
}

/**
 * The camera's spot on the floor (BrainIn.camera: a reaction turns him toward it).
 * @param {OrbitState} s
 * @returns {XZ}
 */
export function orbitSpot(s) {
  const { position } = orbitPose(s);
  return { x: position.x, z: position.z };
}

/**
 * The light turned with the camera: the look's sun direction (`dir`, toward the light, as at the
 * default view's yaw 0) turned round the vertical axis by the camera's yaw, so his shadow falls
 * the same way on screen however far round the camera has gone.
 * @param {number[]} dir  [x, y, z]
 * @param {number} yaw
 * @returns {XYZ}
 */
export function lightDir(dir, yaw) {
  const [x, y, z] = dir;
  if (!yaw) return { x, y, z };
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, y, z: z * c - x * s };
}
