// Where the knights are: each scenery's seat and the summon sign in front of it, the ring
// round the fire where they dance and rest, the places on it for a few of them, and the way
// from one place to another. Pure (no three.js), so node can test it and the visualizer's
// knight show can use it without the scene; knights.js places and walks the knights by it,
// scenery.js builds the seats, summonSign.js lays the sign.
//
//   seats     one per scenery, behind the fire on the left, well back from it (SEATS): where
//             the site's cameras see him three-quarter-on without him covering the fire, the
//             weapon or the page, his boots clear of the ring stones and the flames, and he's
//             clear of the scenery round him (colliders.js) however he sits. He sits turned a
//             little from the fire toward the cameras (his front catches the light).
//   the sign  his summon sign (the NH monogram) lies on the ground in front of his seat, where
//             his boots will be, turned to read from the home view (SEATS[name].sign).
//   the ring  1.2 m round the fire; `blocked` holds the arcs where something stands on it
//             in each scenery (DANCE_RING.free gives the rest). The numbered slots
//             (danceSlots) are the engine's defaults; the visualizer places dancers itself.
//   places    on the ring's clear arcs, on the sides only: never in the corridor between the
//             fire and the cameras (within FRONT of 0°) or hidden right behind the fire
//             (sideArcs). Line, Solo and Canon use fixed layouts for 1–4 (slotPlaces), Round
//             the Fire spreads them along the arcs (ringPlaces), and while the first sits on
//             his seat the others rest at the layout's places less the one nearest him
//             (restPlaces): the knights' homes, and where the show seats them.
//   walks     straight where that's clear of the fire pit and of whatever stands in the way;
//             otherwise round the fire on an arc; too far or blocked, null (he goes by ember,
//             burning away and forming at the other end) (planWalk).
// Bearings are degrees round the fire: 0° toward the cameras (+z), 90° to +x.

/** The fire's center on the ground (world x, z). */
export const FIRE_AT = { x: 0.02, z: 0.02 };
/** Where the home view's camera stands (world x, z): the sign reads the right way up from it. */
const HOME_CAMERA = { x: 0, z: 6.2 };
/** How far he sits turned from facing the fire, toward the cameras (radians; + would be away). */
const TURN = -0.3;
/** How far in front of his hips the sign's middle lies (m): under his boots. */
const SIGN_OUT = 0.55;

/**
 * A seat: his hips' place (x, z), the seat's height (m), which way he faces (`yaw`: the fire,
 * turned `turn` toward the cameras) and his summon sign in front of it ({ x, z, yaw }: the
 * sign's letters read from the home camera): `signOut` along his way (between the seat and
 * the ring stones), or at `signAt` ({ x, z }) where something of the scenery's lies there.
 * knights.js checks the height against the scenery's height map when he sits, and rests his
 * feet on the ground in front of it (or on whatever lies there). `standAside` (m, + his
 * left): where he stands up to is looked for round that far to his side, not straight ahead
 * (knights.js standSpot: in the ruins, straight up he'd stand behind the flames; at the shrine
 * his gestures up there would cross the sword planted in them).
 */
function seat(x, z, top, { turn = TURN, signOut = SIGN_OUT, signAt = null, standAside = 0 } = {}) {
  const yaw = Math.atan2(FIRE_AT.x - x, FIRE_AT.z - z) + turn;
  const sx = signAt?.x ?? x + Math.sin(yaw) * signOut, sz = signAt?.z ?? z + Math.cos(yaw) * signOut;
  return { x, z, top, yaw, standAside, sign: { x: sx, z: sz, yaw: Math.atan2(sx - HOME_CAMERA.x, sz - HOME_CAMERA.z) } };
}

/**
 * The knight's seat in each scenery, behind the fire on the left, 1.69–1.78 m from its middle
 * (bearings 206–217°) so his boots stay well out of it (≥ 1.05 m: test/knights.test.mjs, on
 * the real model) and his legs leave the dance ring clear from 253° round the front. The
 * seats are low (0.21–0.23 m, knees up, like a knight resting at a Dark Souls bonfire): that
 * far back a higher one would lift his helmet into the page's header on phones, and further
 * round he'd leave a phone's frame (test/knights.test.mjs); further toward the flames, stood
 * up he'd stand behind them (test/knightClearance.test.mjs). Each keeps him at least 4 cm
 * clear of whatever stands round it (the ruins' pillar, the cathedral's columns, the cult's
 * standing stones, the anvil's horn) in either seat pose, his boots resting on what's under
 * them (test/knightClearance.test.mjs). His sign lies on open ground in front of it, clear
 * of the ring stones and in view of the home camera on wide screens and phones
 * (test/knightPlaces.test.mjs).
 */
export const SEATS = {
  // A drum fallen from the pillar, lying across his way (scenery.js), clear of the pillar at
  // his right shoulder; his boots rest up on the model's own fallen drum in front of him. He
  // stands up to his right, across that drum, in front of the pillar's plinth, left of the
  // flames from the cameras; his sign lies just beyond (the open ground nearer his seat is
  // under the drum or behind the flames).
  ruins: seat(-0.75, -1.53, 0.21, { signAt: { x: -1.16, z: -0.58 }, standAside: -0.35 }),
  // A stump by the anvil (scenery.js).
  forge: seat(-0.8, -1.52, 0.21),
  // A resting stone (scenery.js). He stands up a little to his right, out of the line between
  // the cameras and the sword planted in the fire (his standing gestures stay left of it) and
  // a little further from the back lantern.
  shrine: seat(-0.9, -1.5, 0.21, { signOut: 0.57, standAside: -0.1 }),
  // The fallen nave drum, in front of the columns (scenery.js; the right one stands back,
  // clear of him: colliders.js CATHEDRAL.nave); the sign a little to his left, clear of the
  // drum and the ring stones.
  cathedral: seat(-1.0, -1.35, 0.22, { signAt: { x: -0.94, z: -0.75 } }),
  // The fallen standing stone, his back to the others, clear of them (stone C stands out of
  // his way: colliders.js CULT.stones): a low seat, knees up (scenery.js); the sign to his
  // left, clear of the ring stones.
  cult: seat(-1.0, -1.33, 0.23, { signAt: { x: -1.04, z: -0.59 } }),
};

/**
 * The ring dancers stand on (Bonfire Live): centered on the fire, 1.2 m out, each dancer
 * needing about 0.35 m. `blocked`: the arcs (degrees) where something stands on it in each
 * scenery (measured on the height maps, a dancer's feet 1.0–1.4 m out and ±0.18 m aside,
 * with a few degrees to spare): the spare logs everywhere, then each scenery's own pieces,
 * and the seated knight's legs, either seat pose (his seat is well back, but his boots reach
 * the ring), and in the ruins where he stands up to. The arc from 253° through 0° to 96° is
 * clear everywhere.
 */
export const DANCE_RING = {
  center: [FIRE_AT.x, FIRE_AT.z],
  radius: 1.2,
  blocked: {
    ruins: [[96, 142], [192, 252]],      // (his legs, the model's fallen drum, and where he stands up to)
    forge: [[96, 142], [184, 244]],
    shrine: [[96, 142], [186, 247]],
    cathedral: [[96, 142], [190, 253]],
    cult: [[96, 142], [190, 253]],
  },
  /** The clear arcs of a scenery, [[from°, to°], …] going round (to° may pass 360). */
  free(name) {
    const b = [...(DANCE_RING.blocked[name] ?? DANCE_RING.blocked.ruins)].sort((x, y) => x[0] - y[0]);
    return b.map(([, end], i) => [end, i + 1 < b.length ? b[i + 1][0] : b[0][0] + 360]).filter(([a, c]) => c - a >= 8);
  },
};
const RAD = Math.PI / 180;
// The slots: 1 (270°) nearest the seat, 2 (310°) and 3 (50°) either side of the front, 4
// (88°) across the fire, 5 (168°) behind it (partly hidden; not in the cult).
const SLOT_BEARINGS = [270, 310, 50, 88, 168];
/** Where dancers stand in a scenery: [{ x, z, bearing }] for slots 1–4 (5 where it's clear). */
export function danceSlots(name) {
  const [cx, cz] = DANCE_RING.center;
  const r = DANCE_RING.radius;
  return SLOT_BEARINGS.filter((b, i) => i < 4 || name !== 'cult').map((b) => ({ x: cx + Math.sin(b * RAD) * r, z: cz + Math.cos(b * RAD) * r, bearing: b }));
}
/**
 * Which way someone standing at (x, z) faces (a yaw: 0 toward +z, the cameras): `facing` a
 * yaw as it is, 'fire' toward the fire's middle, 'out' away from it, or 'front' toward where
 * the cameras usually are, turned a little toward the fire. (knights.js turns dancers by it;
 * the show asks colliders.js about a dance move's room facing that way.)
 */
export function facingYaw(x, z, facing) {
  if (typeof facing === 'number') return facing;
  const fire = Math.atan2(FIRE_AT.x - x, FIRE_AT.z - z);
  if (facing === 'fire') return fire;
  if (facing === 'out') return fire + Math.PI;
  return Math.atan2(0 - x, 5 - z) * 0.75 + fire * 0.25;
}
/** The ring as the knights hand it out (knights.js slots()). */
export const ringOf = (name) => ({ center: { x: DANCE_RING.center[0], z: DANCE_RING.center[1] }, radius: DANCE_RING.radius, free: DANCE_RING.free(name), slots: danceSlots(name) });

// --- places on the ring ----------------------------------------------------------------------
// Where dancers may stand on the ring: its clear arcs less a margin at each end, and only on
// the sides, never in the corridor between the fire and the cameras (within FRONT of 0°) or
// hidden right behind the fire (within BACK of 180°).
export const FRONT = 50;
const BACK = 20;
const MARGIN = 8;
const WINDOWS = [[FRONT, 180 - BACK], [180 + BACK, 360 - FRONT]];
const STEP = 10; // Round the Fire: degrees a step (every two bars)
// Line, Solo, Canon: where 1–4 dancers stand (bearings), the first layout that's clear in
// the scenery. Seen from the cameras in front, two on one side stand one behind the
// other, so a third goes behind the fire and to its right, where his head and shoulders
// show over the flames.
const LAYOUTS = [
  [[275], [285], [80]],
  [[275, 80], [270, 300], [60, 86]],
  [[275, 80, 157], [270, 305, 75], [272, 305, 62]],
  [[262, 300, 80, 157], [268, 304, 58, 86], [270, 306, 60, 87]],
];
const wrap360 = (a) => ((a % 360) + 360) % 360;

/**
 * The ring's arcs dancers may use: its free arcs ([[from°, to°], …], `to` may pass 360),
 * each less MARGIN at both ends, cut to the sides. Sorted by where they start (0–360).
 * @param {number[][]} free
 */
export function sideArcs(free) {
  const out = [];
  const arcs = free?.length ? free.map(([a, b]) => [a + MARGIN, b - MARGIN]) : [[0, 360]];
  for (const [a, b] of arcs) {
    if (b - a < 4) continue;
    for (const [w0, w1] of WINDOWS) {
      for (const k of [0, 360, 720]) {
        const lo = Math.max(a, w0 + k);
        const hi = Math.min(b, w1 + k);
        if (hi - lo >= 6) out.push([lo, hi]);
      }
    }
  }
  return out.map(([lo, hi]) => { const s = Math.floor(lo / 360) * 360; return [lo - s, hi - s]; }).sort((p, q) => p[0] - q[0]);
}

/** A point on the ring at a bearing (degrees). */
function onRing(ring, bearing) {
  const a = bearing * RAD;
  return { x: ring.center.x + Math.sin(a) * ring.radius, z: ring.center.z + Math.cos(a) * ring.radius, bearing: wrap360(bearing) };
}

/**
 * Round the Fire: `n` dancers shared out over the ring's side arcs by their length, spread
 * evenly along each, all shifted `step` steps along it (kept inside each one's share).
 * @param {{ center: { x: number, z: number }, radius: number, free: number[][] }} ring
 * @param {number} n
 * @param {number} [step]
 */
export function ringPlaces(ring, n, step = 0) {
  const arcs = sideArcs(ring.free);
  if (!arcs.length || n < 1) return [];
  const total = arcs.reduce((s, [a, b]) => s + b - a, 0);
  const want = arcs.map(([a, b]) => (n * (b - a)) / total);
  const got = want.map((w) => Math.floor(w));
  let left = n - got.reduce((s, v) => s + v, 0);
  for (const i of [...want.keys()].sort((p, q) => (want[q] - got[q]) - (want[p] - got[p]))) if (left > 0) { got[i]++; left--; }
  const out = [];
  arcs.forEach(([a, b], i) => {
    const share = (b - a) / Math.max(1, got[i]);
    const shift = Math.max(-share * 0.35, Math.min(share * 0.35, step * STEP));
    for (let j = 0; j < got[i]; j++) out.push(onRing(ring, a + share * (j + 0.5) + shift));
  });
  return out;
}

/**
 * Line, Solo, Canon: places for `n` dancers (1–4) from LAYOUTS, the first whose every
 * bearing is on the ring's side arcs (else spread over them).
 * @param {{ center: { x: number, z: number }, radius: number, free: number[][] }} ring
 * @param {number} n
 */
export function slotPlaces(ring, n) {
  const arcs = sideArcs(ring.free);
  const ok = (b) => arcs.some(([lo, hi]) => (b >= lo && b <= hi) || (b + 360 >= lo && b + 360 <= hi));
  const layout = (LAYOUTS[Math.min(4, Math.max(1, n)) - 1] ?? []).find((l) => l.every(ok));
  return layout ? layout.map((b) => onRing(ring, b)) : ringPlaces(ring, n, 0);
}
/**
 * Where the others rest while the first sits on his seat (`seat`: where he is, world
 * { x, z }): the layout for all `n` less the place nearest the seat on its own side of the
 * fire (his, when he gets up to dance). On the ground, on the ring's clear sides, so nobody
 * sits in front of the fire.
 * @param {{ center: { x: number, z: number }, radius: number, free: number[][] }} ring
 * @param {number} n
 * @param {{ x: number, z: number } | null} [seat]
 */
export function restPlaces(ring, n, seat = null) {
  if (n <= 1) return [];
  const all = slotPlaces(ring, n);
  const s = seat ?? onRing(ring, 225);
  const d = (p) => Math.hypot(p.x - s.x, p.z - s.z);
  const left = (p) => wrap360(Math.atan2(p.x - ring.center.x, p.z - ring.center.z) / RAD) > 180;
  const mine = all.some((p) => left(p) === left(s)) ? (p) => left(p) === left(s) : () => true;
  let skip = -1;
  all.forEach((p, j) => { if (mine(p) && (skip < 0 || d(p) < d(all[skip]))) skip = j; });
  return all.filter((_, j) => j !== skip);
}

// --- walks -------------------------------------------------------------------------------------
/** The fire pit's stones reach about this far from its center (m): no walk goes inside. */
export const PIT = 0.72;
/** A walk passing the fire keeps this far from it, unless it starts or ends nearer (his seat). */
export const CLEAR = 0.85;
/** Walks longer than this (m) go by ember. */
export const MAX_WALK = 2.4;
const ENDS = 0.16; // (m round each end where `blocked` isn't asked: his seat, the step he stands on)

const fireDist = (x, z) => Math.hypot(x - FIRE_AT.x, z - FIRE_AT.z);
/** How near the segment a→b comes to the fire. */
function nearest(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((FIRE_AT.x - a.x) * dx + (FIRE_AT.z - a.z) * dz) / l2)) : 0;
  return fireDist(a.x + dx * t, a.z + dz * t);
}
/** Whether a→b is clear: of the fire (see CLEAR) and of `blocked`, every 5 cm, a hand either side. */
function clearLeg(a, b, blocked, from, to) {
  const near = Math.min(CLEAR, Math.min(fireDist(from.x, from.z), fireDist(to.x, to.z)) - 0.02);
  if (nearest(a, b) < Math.max(PIT, near)) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const n = Math.ceil(len / 0.05);
  const sx = len > 1e-6 ? -dz / len : 0, sz = len > 1e-6 ? dx / len : 0;
  for (let i = 0; i <= n; i++) {
    const x = a.x + (dx * i) / Math.max(1, n), z = a.z + (dz * i) / Math.max(1, n);
    if (Math.hypot(x - from.x, z - from.z) < ENDS || Math.hypot(x - to.x, z - to.z) < ENDS) continue;
    for (const s of [0, -0.1, 0.1]) if (blocked(x + sx * s, z + sz * s)) return false;
  }
  return true;
}
const legLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

/**
 * A walk from `from` to `to` (world { x, z }): the points to walk through after `from`,
 * ending at `to`, or null when it's too far (`max`, m) or blocked, and he should go by ember.
 * Straight when that's clear of the fire and of `blocked(x, z)` (something he can't step
 * over); otherwise round the fire on an arc (the shorter way first), stepping out to it and
 * in again from it.
 * @param {{ x: number, z: number }} from
 * @param {{ x: number, z: number }} to
 * @param {{ blocked?: (x: number, z: number) => boolean, max?: number }} [o]
 * @returns {{ x: number, z: number }[] | null}
 */
export function planWalk(from, to, { blocked = () => false, max = MAX_WALK } = {}) {
  const straight = [from, { x: to.x, z: to.z }];
  if (legLength(straight) > max) return null;
  if (clearLeg(from, to, blocked, from, to)) return [{ x: to.x, z: to.z }];
  // Round the fire: from the one end's distance to the other's as it goes round (never into
  // the pit), in steps of at most 15°. (From his seat's step, near the pit, he keeps close
  // to the fire at first and swings out as he goes, clear of the seat behind him.)
  const r0 = fireDist(from.x, from.z), r1 = fireDist(to.x, to.z);
  const b0 = Math.atan2(from.x - FIRE_AT.x, from.z - FIRE_AT.z) / RAD;
  const d = wrap360(Math.atan2(to.x - FIRE_AT.x, to.z - FIRE_AT.z) / RAD - b0);
  for (const sweep of d <= 180 ? [d, d - 360] : [d - 360, d]) {
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / 15));
    const pts = [from];
    for (let i = 1; i < steps; i++) {
      const u = i / steps;
      const b = (b0 + sweep * u) * RAD;
      const r = Math.max(PIT + 0.08, r0 + (r1 - r0) * u);
      pts.push({ x: FIRE_AT.x + Math.sin(b) * r, z: FIRE_AT.z + Math.cos(b) * r });
    }
    pts.push({ x: to.x, z: to.z });
    if (legLength(pts) > max) continue;
    if (pts.every((p, i) => !i || clearLeg(pts[i - 1], p, blocked, from, to))) return pts.slice(1);
  }
  return null;
}
