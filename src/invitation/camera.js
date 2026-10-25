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
// with it (orbitPan), the point it looks at kept to a region round the play area's middle
// (panRegion: a disc, the area's radius less what the view shows its narrower way at this zoom,
// more the closer it zooms): past it the pan gives like a rubber band
// (ORBIT.band, at most ORBIT.bandPx further) and, let go, eases back inside at ORBIT.bandBack.
// The wheel and a pinch zoom about the cursor or the fingers' middle (orbitZoom's `at`: the floor
// there stays there as the zoom eases, and the view is the user's from then on, a pan), the
// camera pad's Zoom In and Out about where it looks. The pad's turns and tilts (orbitNudge) go
// round 45° and up or down 12° at a press, eased at ORBIT.nudgeEase.
//
// The point it orbits sits at NEWT's middle height. The play area holds all the floor the
// default view shows, however it's turned (area.js), so at the default zoom and further out
// (areaFits) the view doesn't follow him at all: it stays on the area's middle, the same on a
// phone and a desktop, and a tap anywhere on the floor it shows walks him to where the finger
// was, the top of the screen too. It moves only once his feet would leave the screen (the clear
// space round where the point it looks at shows, ORBIT.slack CSS px past its edges: turned away
// from him, or he's tossed past an edge), and then only as far as keeps them on it, coming back
// to the middle as he walks back on. Zoomed in past that, its rest point (`base`) follows him
// softly, the zoom's share of the way (followShare: none at the default zoom, all at the
// closest), and keeps him on screen: while he's well inside the clear space (ORBIT.keepIn of
// it) it holds still, and as he nears its edge the rest point moves on with him, softly, never
// letting him past ORBIT.keepOut of it once he's on screen (orbitStep, from where screenOf puts
// him); zoomed back out to the default, it eases back to the middle. A pan holds the view where
// it was put while he walks about on the screen it shows; once he walks off it, the view moves
// on with him, his feet kept at its edge, until Follow NEWT or a grab or tap on him
// (orbitFollow) or Reset Camera ends it. A resize works the play area out again
// (orbitArea): the view eases onto its middle.
// While he's held (orbitHold) it holds still, so the point he's grabbed by stays under the
// cursor; let go out past where it keeps him (carried to the screen's edge), the view eases back
// round him at ORBIT.settle rather than snapping there in a frame. What's on screen
// (orbitSight, the floor where he shows whole) is the play area's `sight`: wander goals and a
// flee keep to it (steer.js). While the Look sheet is open it follows him all the way at any zoom (orbitFollowAll),
// so he stays in the clear space the sheet leaves. Reset Camera eases back to the default view,
// the short way round, and clears the pan. The light goes round with it (lightDir: the look's
// sun turned by the camera's yaw), so his shadow always falls the same way on screen, back and
// to one side. Angles in radians (yaw 0: the camera on the +z side, + toward +x), distances in
// world units, drags in CSS px.
//
// The intro's shots (orbitTalk, shotView, orbitShot): the view goes round to the front (the
// default view's yaw, the short way) and each chat box's camera eases there at SHOT.ease (or
// cuts, for reduced motion): close, his head and shoulders; medium, his whole body; wide, the
// default view's distance and tilt; keep, as it was. A shot fills SHOT[name].fill of the clear
// space over the chat box with him and shows him `raise` CSS px above where the point it looks at
// shows (the middle of that space), by aiming below his middle; the point it orbits stays on him.
// Nothing else moves it meanwhile (main.js sends no gestures); at the end it eases back to the
// view from before the intro, its pan and zoom included. With reduced motion the turn to the
// front and the way back cut too.

import { AREA_MARGIN, NEWT_HEIGHT, NEWT_RADIUS, playArea } from './area.js';
import { FOCUS_Y, VIEW } from './pixels.js';
import { centreOf, clampTo, turnBounds } from './steer.js';

/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').Bounds} Bounds */

const RAD = Math.PI / 180;
/** What's on screen (orbitSight) reaches no further back than this many times the view's distance. */
const SIGHT_REACH = 4;

/**
 * elevMin/elevMax: radians up from the floor. zoomMin/zoomMax: the distance's range, × the
 * default. turn: the share of a whole turn for a drag across the stage's whole width; tilt:
 * radians for a drag down its whole height (π: the old feel on a 700 px stage). ease: seconds
 * the view takes to close most of the way to its goal (a time constant); resetEase: the same
 * for Reset Camera.
 * A fling: the drag's speed (at most spinMax rad/s) carries on when the finger lifts within
 * flingWindow s of its last move, slowing at `coast` per second. follow: the time constant of
 * the orbit's point easing to where it's wanted. wheel: zoom per px of wheel (a factor of
 * e^(px × wheel)). slack: CSS px past the clear space round where the point it looks at shows
 * that NEWT's feet may stand before the view moves, where the play area fits the screen or a
 * pan holds the view (no more than the toolbar's gap and the top margin). Zoomed in, keepIn:
 * the share of the clear space that NEWT may roam with the view holding still; keepOut: the
 * share he's never let past once he's on screen. settle: the time constant it brings him back
 * inside at once he's let go out past where it keeps him.
 * nudgeEase: the time constant of the camera pad's turns and tilts. A pan past its region gives
 * like a rubber band: `band` of the way at first, never more than bandPx CSS px past it, and once
 * let go it eases back inside with a time constant of bandBack s.
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
  wheel: 0.0015,
  slack: 8,
  keepIn: 0.6,
  keepOut: 0.94,
  settle: 0.25,
  nudgeEase: 0.25,
  band: 0.55,
  bandPx: 90,
  bandBack: 0.18,
};
export { FOCUS_Y };

/**
 * The intro's shots: `span` world units of him (from `mid` - span/2 to `mid` + span/2) fill `fill`
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
 * @property {boolean} followAll  it follows him all the way, at any zoom (the Look sheet open)
 * @property {{yaw: number, elevation: number}} spin  a fling's coast, rad/s
 * @property {{yaw: number, elevation: number, t: number}|null} drag  a drag under way: its speed and last move
 * @property {boolean} resetting  easing back to the default
 * @property {boolean} nudging  easing to a turn or tilt of the camera pad's
 * @property {XZ} base  the rest point: where the point it orbits goes when it isn't following him
 * @property {boolean} panned  the user's pan holds the view (until Follow NEWT, a grab or a tap on him, or Reset)
 * @property {boolean} panning  a pan under way
 * @property {XZ|null} raw  the pan under way's own rest point, before the rubber band
 * @property {XZ|null} panFrom  where the pan began (its region takes it in: a pan never starts with a jump)
 * @property {{at: {x: number, y: number}, floor: XZ}|null} anchor  a zoom about a point: the
 *   floor kept at `at` (CSS px from where the point it looks at shows) as it eases
 * @property {boolean} holding  NEWT held: the view holds still
 * @property {boolean} settling  let go out past keepOut: it eases him back inside, not at once
 * @property {Bounds|null} area  the play area: a pan keeps to a region inside it (panRegion)
 * @property {number} ch  the canvas's CSS height (the field of view spans it)
 * @property {{hw: number, hh: number}} frame  half the clear space round where the point it
 *   looks at shows, CSS px (it's shown in its middle: pixels.js frameView)
 * @property {boolean} seen  NEWT was on screen last frame: his feet on it (byFeet), or zoomed in
 *   inside ORBIT.keepOut of the clear space
 * @property {boolean} byFeet  last frame it kept only his feet on the screen (the play area fitting
 *   it, or a pan), not his body inside keepOut
 * @property {TalkView|null} [talk]  while the intro runs: the front it's seen from, the shot, the view before
 */
/** @typedef {{yaw: number, elevation: number, distance: number, lookY: number}} ShotView  a shot's view: lookY, the height it aims at */
/**
 * @typedef {object} TalkView
 * @property {number} yaw  the front, the short way round from where it was
 * @property {ShotView|null} view  the shot under way (null: none yet)
 * @property {{yaw: number, elevation: number, distance: number, base: XZ, panned: boolean, panFrom: XZ|null}} saved  the view before
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
    followAll: false,
    spin: { yaw: 0, elevation: 0 },
    drag: null,
    resetting: false,
    nudging: false,
    base: { x: centre.x, z: centre.z },
    panned: false,
    panning: false,
    raw: null,
    panFrom: null,
    anchor: null,
    holding: false,
    settling: false,
    area: null,
    ch: h,
    frame: frameOf(w, h),
    seen: true,
    byFeet: false,
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
 * The stage's new size, CSS px (a resize): drags turn and tilt by it from now on; `ch`, the
 * canvas's CSS height
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
  s.ch = ch && ch > 0 ? ch : s.span.h;
  const f = frameOf(s.span.w, s.span.h);
  s.frame = { hw: hw && hw > 0 ? hw : f.hw, hh: hh && hh > 0 ? hh : f.hh };
}

/**
 * The play area (area.js viewArea): its middle is the orbit's centre (where the view rests while
 * the area fits the screen, easing there after a resize, and Reset Camera's rest point), and a
 * pan keeps to a region inside it (panRegion; a pan left outside it, the area smaller after a
 * resize, eases back in as a rubber band does). A resize is never NEWT walking off the screen:
 * left off the smaller one, the view moves round to show his feet softly, not in a jump.
 * @param {OrbitState} s
 * @param {Bounds|null} area
 */
export function orbitArea(s, area) {
  s.area = area;
  s.seen = false;
  if (area) s.centre = centreOf(area);
}

/**
 * Where a pan keeps the point it looks at: round the play area's middle, the area's radius (a
 * box's half) less what the view shows its narrower way at this zoom (more the closer it zooms,
 * the same however it's turned), so at its edge the area's edge shows at the clear space's: a
 * disc for the toy's disc, a square for a box; taking in where the pan under way began. Null
 * with no play area.
 * @param {OrbitState} s
 * @returns {Bounds|null}
 */
export function panRegion(s) {
  const a = s.area;
  if (!a) return null;
  const c = centreOf(a);
  const half = a.r ?? Math.min(a.maxX - a.minX, a.maxZ - a.minZ) / 2;
  const k = worldPerPx(s);
  const shows = Math.min(s.frame.hw * k, (s.frame.hh * k) / Math.max(0.2, Math.sin(s.elevation)));
  const l = Math.max(0, half - shows);
  const f = s.panFrom;
  if (a.r !== undefined) return playArea(Math.max(l, f ? Math.hypot(f.x - c.x, f.z - c.z) : 0), c);
  const r = { minX: c.x - l, maxX: c.x + l, minZ: c.z - l, maxZ: c.z + l };
  if (f) {
    r.minX = Math.min(r.minX, f.x);
    r.maxX = Math.max(r.maxX, f.x);
    r.minZ = Math.min(r.minZ, f.z);
    r.maxZ = Math.max(r.maxZ, f.z);
  }
  return r;
}

/**
 * A pan's rest point `p` as the rubber band lets it be: inside the pan's region as it is; past
 * it, only part of the way past (ORBIT.band at first, never ORBIT.bandPx CSS px or more).
 * @param {OrbitState} s
 * @param {XZ} p
 * @returns {XZ}
 */
function banded(s, p) {
  const r = panRegion(s);
  if (!r) return { x: p.x, z: p.z };
  const c = clampTo(r, p);
  const ox = p.x - c.x;
  const oz = p.z - c.z;
  const over = Math.hypot(ox, oz);
  if (over < 1e-12) return { x: p.x, z: p.z };
  const most = ORBIT.bandPx * worldPerPx(s);
  const give = most * (1 - 1 / (1 + (ORBIT.band * over) / most));
  return { x: c.x + (ox / over) * give, z: c.z + (oz / over) * give };
}

/**
 * A pan let go past its region: the view eases back inside, a frame's share of the way.
 * @param {OrbitState} s
 * @param {number} dt
 */
function bandBack(s, dt) {
  const r = panRegion(s);
  if (!r) return;
  const c = clampTo(r, s.base);
  const dx = c.x - s.base.x;
  const dz = c.z - s.base.z;
  if (Math.abs(dx) + Math.abs(dz) < 1e-12) return;
  const k = 1 - Math.exp(-dt / ORBIT.bandBack);
  const near = Math.hypot(dx, dz) * (1 - k) < 1e-6;
  const mx = near ? dx : dx * k;
  const mz = near ? dz : dz * k;
  s.base = { x: s.base.x + mx, z: s.base.z + mz };
  s.target.x += mx;
  s.target.z += mz;
}

/**
 * The view is the user's from here (a pan, or a zoom about a point): it stays where it's put.
 * @param {OrbitState} s
 */
function holdView(s) {
  if (s.panned) return;
  s.base = { x: s.target.x, z: s.target.z };
  s.panFrom = { ...s.base };
  s.panned = true;
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
 * horizon); the point it looks at stays at NEWT's middle height and inside the pan's region,
 * past which it gives like a rubber band. The view then stays where it's put (no following)
 * until Follow NEWT, a grab or a tap on him, or Reset Camera.
 * @param {OrbitState} s
 * @param {number} dx
 * @param {number} dy
 * @param {{x: number, y: number}} [at]
 */
export function orbitPan(s, dx, dy, at = { x: 0, y: 0 }) {
  holdView(s);
  if (!s.panning) s.raw = null;
  s.panning = true;
  s.anchor = null;
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
  const raw = s.raw ?? s.base;
  s.raw = { x: raw.x + move.x, z: raw.z + move.z };
  const next = banded(s, s.raw);
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
 * Zoom by `factor`: above 1 closer (fingers spreading), below 1 further, within the range. With
 * `at` (CSS px from where the point it looks at shows: the cursor, the fingers' middle), about
 * that point: the floor there stays there all the while the zoom eases, and the view is the
 * user's from then on (a pan: it stays put); without it, or at that point itself, about where it
 * looks, the pan as it was.
 * @param {OrbitState} s
 * @param {number} factor
 * @param {{x: number, y: number}|null} [at]
 */
export function orbitZoom(s, factor, at = null) {
  if (!(factor > 0)) return;
  const h = s.home.distance;
  s.goal.distance = clamp(s.goal.distance / factor, h * ORBIT.zoomMin, h * ORBIT.zoomMax);
  s.resetting = false;
  if (!at || Math.hypot(at.x, at.y) < 0.5) return;
  const floor = floorUnder(s, at);
  if (!floor) return;
  holdView(s);
  s.anchor = { at: { x: at.x, y: at.y }, floor };
}

/**
 * The mouse wheel, `deltaY` px (positive: toward you, further away), about the cursor (`at`, as
 * orbitZoom takes it).
 * @param {OrbitState} s
 * @param {number} deltaY
 * @param {{x: number, y: number}|null} [at]
 */
export function orbitWheel(s, deltaY, at = null) {
  orbitZoom(s, Math.exp(-deltaY * ORBIT.wheel), at);
}

/**
 * The camera pad's turn or tilt: round by `yaw` and up by `elevation` (radians; within
 * ORBIT.elevMin to elevMax), eased at ORBIT.nudgeEase from where it's going; a fling or a drag
 * under way stops. The pan and the zoom stay.
 * @param {OrbitState} s
 * @param {{yaw?: number, elevation?: number}} by
 */
export function orbitNudge(s, { yaw = 0, elevation = 0 }) {
  s.goal.yaw += yaw;
  s.goal.elevation = clamp(s.goal.elevation + elevation, ORBIT.elevMin, ORBIT.elevMax);
  s.spin = { yaw: 0, elevation: 0 };
  s.drag = null;
  s.resetting = false;
  s.nudging = true;
}

/**
 * The fingers or the button that panned it let go (a pinch's pan ends without a release, so
 * main.js says so once the gesture no longer pans): a pan past its region eases back now.
 * @param {OrbitState} s
 */
export function orbitPanEnd(s) {
  s.panning = false;
  s.raw = null;
}

/**
 * The user's pan is over (a grab or a tap on NEWT, or Follow NEWT): the view takes him again,
 * from where it is (where the play area fits the screen, back to its middle); with `at` (Follow
 * NEWT: him), its rest point goes onto him too, so zoomed in it eases round to him.
 * @param {OrbitState} s
 * @param {XZ|null} [at]
 */
export function orbitFollow(s, at = null) {
  s.panned = false;
  s.panning = false;
  s.raw = null;
  s.panFrom = null;
  s.anchor = null;
  if (at) s.base = { x: at.x, z: at.z };
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
    else if (e.type === 'pinch' && e.scale && e.scale !== 1)
      orbitZoom(s, e.scale, shownAt ? { x: e.x - shownAt.x, y: e.y - shownAt.y } : null);
    else if (e.on === 'floor' && (e.type === 'release' || e.type === 'cancel')) {
      orbitRelease(s, e.t);
      orbitPanEnd(s);
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
  s.nudging = false;
  s.base = { x: s.centre.x, z: s.centre.z };
  orbitFollow(s);
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
 * The intro begins (`on`, from the envelope or Replay Intro): the view turns round to the front, the short way, and waits for the
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
        panFrom: s.panFrom && { ...s.panFrom },
      },
    };
    s.spin = { yaw: 0, elevation: 0 };
    s.drag = null;
    s.resetting = false;
    s.nudging = false;
    s.anchor = null;
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
  s.panFrom = t.saved.panFrom;
  s.panning = false;
  s.raw = null;
  s.resetting = true;
  // (Close in, he's past the clear space's edge: not walked off it.)
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
 * A shot's view while the intro runs (null for keep, or with no intro under way): from the
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
 * Whether the play area fits the screen at this zoom: the default distance or further out (it
 * holds all the floor the default view shows, area.js viewArea), so the view needn't follow
 * NEWT to reach any of it.
 * @param {OrbitState} s
 */
export function areaFits(s) {
  return s.distance >= s.home.distance * (1 - 1e-3);
}

/**
 * How much the orbit follows NEWT at this zoom: none at the default distance or further (the
 * play area fits the screen), all of the way at the closest, a straight line between; all of
 * it at any zoom while it follows him all the way (orbitFollowAll).
 * @param {OrbitState} s
 */
export function followShare(s) {
  if (s.followAll) return 1;
  const h = s.home.distance;
  const span = h * (1 - ORBIT.zoomMin);
  return span > 0 ? clamp((h - s.distance) / span, 0, 1) : 0;
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
 * What's on screen now (the play area's `sight`, for wander goals and a flee's fence: steer.js):
 * the floor where NEWT shows whole inside the clear space round where the point it looks at
 * shows (s.frame), AREA_MARGIN CSS px in from its edges, at the view as it is (turned, tilted,
 * zoomed or slid): his toes at its bottom on the front edge, the top of his head at its top on
 * the back edge, his head's side (further out than his feet) at its sides. A trapezoid in the
 * camera's frame widening toward the back, turned with it (Bounds.turn); never further back
 * than SIGHT_REACH view distances (its top over the horizon); null where the clear space can't
 * hold him.
 * @param {OrbitState} s
 * @returns {Bounds|null}
 */
export function orbitSight(s) {
  const hw = s.frame.hw - AREA_MARGIN;
  const hh = s.frame.hh - AREA_MARGIN;
  if (hw < 2 || hh < 2) return null;
  // (Worked out with the camera at yaw 0 round the point it looks at, then turned with it.)
  const flat = { ...s, yaw: 0 };
  const t = s.target;
  const far = t.z - s.distance * SIGHT_REACH;
  const near = t.z + s.distance * Math.cos(s.elevation) * 0.9;
  const down = (/** @type {XYZ} */ p) => screenOf(flat, p)?.y ?? Infinity;
  const minZ = solveUp(far, near, (z) => down({ x: t.x, y: NEWT_HEIGHT, z: z - NEWT_RADIUS }), -hh);
  const maxZ = solveUp(far, near, (z) => down({ x: t.x, y: 0, z: z + NEWT_RADIUS }), hh);
  /** His root's x range at depth `z`: his head's side inside the clear space's sides. */
  const sides = (/** @type {number} */ z) => {
    const at = (/** @type {number} */ x) => screenOf(flat, { x, y: NEWT_HEIGHT, z })?.x ?? 0;
    const a = at(t.x);
    const per = at(t.x + 1) - a;
    if (!(per > 1e-9)) return [t.x, t.x];
    return [t.x + (-hw - a) / per + NEWT_RADIUS, t.x + (hw - a) / per - NEWT_RADIUS];
  };
  const [minX, maxX] = sides(maxZ);
  const [minXBack, maxXBack] = sides(minZ);
  if (!(maxZ > minZ && maxX > minX && maxXBack > minXBack)) return null;
  return turnBounds({ minX, maxX, minZ, maxZ, minXBack, maxXBack }, s.yaw, { x: t.x, z: t.z });
}

/**
 * The `z` in [lo, hi] where `f(z)`, increasing, reaches `want` (lo or hi past either end).
 * @param {number} lo
 * @param {number} hi
 * @param {(z: number) => number} f
 * @param {number} want
 */
function solveUp(lo, hi, f, want) {
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
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
 * The least floor step of the point it looks at (from `target`) that shows NEWT's feet (at `n`,
 * `n.y` up) on the screen, the clear space grown by ORBIT.slack: {x: 0, z: 0} while they're on
 * it, null behind the camera. Solved exactly, an axis at a time: a step along the floor away
 * from the camera moves them only up the screen (and nearer it), then one across only across.
 * @param {OrbitState} s
 * @param {{x: number, z: number, y?: number}} n
 * @param {XYZ} target
 * @returns {XZ|null}
 */
function feetShift(s, n, target) {
  const f = focal(s);
  const ce = Math.cos(s.elevation);
  const se = Math.sin(s.elevation);
  const sy = Math.sin(s.yaw);
  const cy = Math.cos(s.yaw);
  const vx = n.x - (target.x + s.distance * sy * ce);
  const vy = (n.y ?? 0) - (target.y + s.distance * se);
  const vz = n.z - (target.z + s.distance * cy * ce);
  let depth = -(vx * sy * ce + vy * se + vz * cy * ce);
  if (depth <= 1e-6) return null;
  const across = vx * cy - vz * sy;
  const up = -vx * sy * se + vy * ce - vz * cy * se;
  const w = s.frame.hw + ORBIT.slack;
  const h = s.frame.hh + ORBIT.slack;
  // (Up the screen: a step `t` away from the camera takes t·sin(e) off `up` and t·cos(e) off the depth.)
  const y = (-up / depth) * f;
  let t = 0;
  if (Math.abs(y) > h) {
    const edge = Math.sign(y) * h;
    const per = se * f + edge * ce;
    if (per > 1e-6 * f) t = (edge * depth + up * f) / per;
    depth -= t * ce;
    if (depth <= 1e-6) return null;
  }
  // (Across: a step `u` to the screen's right takes u off `across`.)
  const x = (across / depth) * f;
  const u = Math.abs(x) > w ? across - (Math.sign(x) * w * depth) / f : 0;
  return { x: -t * sy + u * cy, z: -t * cy - u * sy };
}

/**
 * The point it orbits at `from`, moved on just so far that NEWT's feet (at `n`) show on the
 * screen.
 * @param {OrbitState} s
 * @param {{x: number, z: number, y?: number}} n
 * @param {XZ} from
 * @returns {XZ}
 */
function feetIn(s, n, from) {
  const d = feetShift(s, n, { x: from.x, y: FOCUS_Y, z: from.z });
  return d ? { x: from.x + d.x, z: from.z + d.z } : { x: from.x, z: from.z };
}

/**
 * Where the point it orbits should be this frame, on the floor, given NEWT at `focus` (null:
 * not in yet): him while the Look sheet is open; the rest point while a pan holds the view;
 * where the play area fits the screen, its middle (the rest point goes back there), moved on
 * only as far as keeps his feet on the screen; zoomed in, the rest point followed toward him by
 * the zoom's share and moved on so he's inside ORBIT.keepIn of the clear space there. Moves
 * `s.base` as it must.
 * @param {OrbitState} s
 * @param {{x: number, z: number, y?: number}|null} focus
 * @returns {XZ}
 */
function wanted(s, focus) {
  if (focus && s.followAll) return { x: focus.x, z: focus.z };
  if (s.panned) return s.base;
  if (areaFits(s)) {
    s.base = { x: s.centre.x, z: s.centre.z };
    return focus ? feetIn(s, focus, s.base) : s.base;
  }
  if (!focus) return s.base;
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
  const ease = s.talk ? SHOT.ease : s.resetting ? ORBIT.resetEase : s.nudging ? ORBIT.nudgeEase : ORBIT.ease;
  const k = 1 - Math.exp(-dt / ease);
  s.yaw += (s.goal.yaw - s.yaw) * k;
  s.elevation += (s.goal.elevation - s.elevation) * k;
  s.distance += (s.goal.distance - s.distance) * k;
  if (s.anchor) {
    // (A zoom about a point: the floor that was there stays there as it eases.)
    const now = floorUnder(s, s.anchor.at);
    if (now) {
      const mx = s.anchor.floor.x - now.x;
      const mz = s.anchor.floor.z - now.z;
      s.target.x += mx;
      s.target.z += mz;
      s.base = { x: s.base.x + mx, z: s.base.z + mz };
    }
    if (Math.abs(s.goal.distance - s.distance) < 1e-3 * s.home.distance) s.anchor = null;
  }
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
  if (s.nudging && Math.abs(s.goal.yaw - s.yaw) < 1e-4 && Math.abs(s.goal.elevation - s.elevation) < 1e-4)
    s.nudging = false;
  followStep(s, dt, focus);
}

/**
 * The orbit's point this frame (orbitStep's second half): toward where it's wanted, softly,
 * never letting NEWT's feet off the screen where the play area fits it or a pan holds the view
 * (keepFeet), and zoomed in never letting him past ORBIT.keepOut of the clear space once he's on
 * screen (just let go out past it, carried there: eased back inside at ORBIT.settle, so the
 * view never jumps).
 * @param {OrbitState} s
 * @param {number} dt
 * @param {{x: number, z: number, y?: number}|null} focus
 */
function followStep(s, dt, focus) {
  if (s.talk) {
    // (The intro: on him, at the shot's height, eased as the shot is.)
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
  // (A pan let go past its region eases back inside, once any zoom about a point has arrived.)
  if (s.panned && !s.panning && !s.anchor) bandBack(s, dt);
  const want = wanted(s, focus);
  const f = 1 - Math.exp(-dt / ORBIT.follow);
  s.target.x += (want.x - s.target.x) * f;
  s.target.z += (want.z - s.target.z) * f;
  // (Back to his middle height after the intro's shots aimed higher or lower.)
  if (s.target.y !== FOCUS_Y)
    s.target.y = Math.abs(FOCUS_Y - s.target.y) < 1e-6 ? FOCUS_Y : s.target.y + (FOCUS_Y - s.target.y) * f;
  if (!focus) return;
  if (!s.followAll && (s.panned || areaFits(s))) {
    s.byFeet = true;
    keepFeet(s, dt, focus);
    return;
  }
  if (s.byFeet) {
    // (Just zoomed in from keeping only his feet on the screen: no push until he's inside
    // keepOut again; the soft follow brings him in, no jump.)
    s.byFeet = false;
    s.seen = false;
  }
  const box = newtBox(s, focus, s.target);
  const out = box ? past(s, box, ORBIT.keepOut) : null;
  if (!out) s.settling = false;
  if (s.panned) {
    // (The user's view, with the Look sheet open: it stays put; he's seen again once back in view.)
    s.seen = !out;
    return;
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
 * Where the play area fits the screen or a pan holds the view: once NEWT's feet go past the
 * screen's edge (walked, run or tossed there from on it, or the view turned past him), the view
 * moves on with them at once (eased at ORBIT.settle just after he's let go there), a pan's rest
 * point with it; a view the user slides or zooms off him leaves him off it until he's back on it.
 * @param {OrbitState} s
 * @param {number} dt
 * @param {{x: number, z: number, y?: number}} focus
 */
function keepFeet(s, dt, focus) {
  const d = feetShift(s, focus, s.target);
  if (d && !d.x && !d.z) {
    s.settling = false;
    s.seen = true;
    return;
  }
  if (!d || !s.seen || s.panning || s.anchor) {
    s.seen = false;
    return;
  }
  const k = s.settling ? 1 - Math.exp(-dt / ORBIT.settle) : 1;
  s.target.x += d.x * k;
  s.target.z += d.z * k;
  if (s.panned) {
    s.base.x += d.x * k;
    s.base.z += d.z * k;
  }
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
