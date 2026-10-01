// The knights by the fire: one sits resting at the bonfire on the site; in Bonfire Live a
// few can be summoned to dance round it (the visualizer schedules them through this API).
//
// The model (public/models/knight.glb, tools/knight.py) is rigid pieces on named empties
// (docs/knight.md). Each knight here is one rigidly skinned mesh for the body and one for
// each helmet (every vertex weighted 1 to its piece's bone), sharing their geometry with
// the other knights: two draw calls a knight, since only the helmet he wears is drawn. The
// armor role rides on each vertex, so the whole knight takes one material (armor.js). His
// meshes are culled by a fixed sphere round him (BOUNDS) that every pose stays inside.
//
// Poses come from knightPose.js: sitting at any seat height, standing, getting up and
// sitting down, walking, gestures, reactions and the dance moves. They step at the fire's
// twelve frames a second, like a sprite; the fire's shadow is redrawn only when a pose
// steps for real motion (a gesture, a dance, getting up), never for breathing, and once
// whenever what casts it changes (he forms, burns away, is placed somewhere new).
//
// Where he sits: every scenery has a seat (knightPlaces.js SEATS), checked against its
// height map when he's placed, so his feet meet the ground and he sits on the stone, not
// above it: each boot rests on whatever is under it where the seated pose puts it (one up
// on the seat's log, say). He stands up to a level, open spot in front of the seat (never
// up on the log or in the pit). At home he knows how much room he has for each arm, seated
// and standing up in front of his seat (roomOf, from the scenery's shapes: colliders.js), and
// every gesture and dance there keeps its arms within it (a pillar at his shoulder: the
// cheer goes up, not into it; a wave changes hands). Wherever he is, each solved pose's arms
// are then checked against the shapes near him and turned clear of them (keepClear).
// Dancers stand on a ring round the fire, in the arcs each scenery leaves clear
// (DANCE_RING); the others (Bonfire Live) are at home sitting on its clear sides, where the
// show rests them (restPlaces). He walks from place to place: straight, or round the fire
// when the straight way passes it, clear of the pit and of whatever the height map says he
// can't step over (planWalk); only a long or blocked way goes by ember (he burns away in
// ember edges and forms again there).
//
// He reacts (scene.js calls react()): sits up to watch a weapon rise or fly, flinches at
// an impact, leans away from a stoke, lifts his feet as a ring passes (a dancer on his
// feet, or one throwing his arms up in a cheer, doesn't flinch or lean: the drop's leap
// and Praise the Sun read whole; he still hops the ring); hovered, his rim warms and he
// looks at you.
//
// The API (scene.js hands it out as fire.knights; every method is safe with no model; the
// full table is in docs/knight.md):
//   ready                      resolves true once there are knights (scene.js)
//   count, present, max        knights in the cast, how many are showing, the most allowed
//   list                       [{ index, present, state, position, facing, helmet, move }]
//                              state: away, arriving, leaving, ember (going somewhere by
//                              ember), sitting, standing, dancing, or the act he's in (rise,
//                              lower, walk, turn, place)
//   positions                  where each present knight's head is (world): for cameras
//   helmet / setHelmet(name, { index, instant })  'great' | 'armet' | 'bascinet': hands to
//                              the helm, the old one burns away, the new one forms, a puff
//                              of sparks (1.6 s), or at once
//   setCast({ count, helmets, instant })  how many knights (summoned and dismissed to fit)
//                              and their helmets (a name, a list, or 'random')
//   summon(i, { instant }), dismiss(i, { instant })  forming from the feet up / burning away
//   sit(i), stand(i)           back to his seat (or the ground where he is), or up on his feet
//   dance(i, { move, energy, slot | position, facing, offset, seed, seated })  up, over to
//                              the slot, facing 'front' | 'fire' | 'out' | yaw, and dancing on
//                              the clock; called again it changes the move or energy in place
//   clock(beatPos, period)     the beat, every frame (without it he dances on at the last tempo)
//   gesture(name, { index })   GESTURES; lookAt(point | null, { index }) (e.g. the cursor)
//   headroom                   whether the view has room over his seat to stand up in (scene.js:
//                              not a phone's tall view); without it the site's dance is danced
//                              in his seat
//   busyAt(i)                  mid-gesture, mid-dance, mid-swap: knightArrival.js holds his leaving
//   adoptTemplate(t)           another style's model's template, built beforehand (templateSteps)
//   slots(scenery)             { center, radius, free: [[from°, to°], …], slots: [{ x, z, bearing }] }
//   fits(move, at, facing, scenery?)  whether a dance move has room at a place, facing that
//                              way (its reach clear of the scenery's shapes: colliders.js)
//   moving                     a pose stepped this frame, or he formed, burnt away or was
//                              placed somewhere new (the shadow needs redrawing)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createArmorMaterial, roleOf } from './armor.js';
import {
  BONES, BONE_NODES, PARENT, DEFAULT_REST, POSE, POSE_SIZE, measureRig, measurePlates, createSolver, newPose, lerpPose, seatedPose, standingPose, seatFeet, feetAt,
  idle, look, attend, flinch, shield, hop, rise, walk, gesture, dance, RISE_TIME, GESTURE_TIME, DANCE_SEATED_TIME, GESTURES, MOVES, CHEERS, SEAT_POSES,
} from './knightPose.js';
import { SEATS, danceSlots, ringOf, restPlaces, planWalk, facingYaw, FIRE_AT } from './knightPlaces.js';
import { collidersNear, distanceTo, outOf, createFits } from './colliders.js';
import { clamp01, smooth } from '../math.js';
import { weaponSilhouette } from './forgeFx.js';

export { GESTURES, MOVES, SEAT_POSES };
export const HELMETS = ['great', 'armet', 'bascinet'];
const HELM_NODES = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
const ALL_BONES = [...BONES, ...HELMETS.map((h) => 'helm_' + h)];
const NODE_BONE = Object.fromEntries([
  ...Object.entries(BONE_NODES).map(([b, n]) => [n, b]),
  ...HELMETS.map((h) => [HELM_NODES[h], 'helm_' + h]),
]);
const BONE_INDEX = Object.fromEntries(ALL_BONES.map((b, i) => [b, i]));
const PARENT_ALL = { ...PARENT, ...Object.fromEntries(HELMETS.map((h) => ['helm_' + h, 'head'])) };

const STEP_FPS = 12;
const FIRE = new THREE.Vector3(FIRE_AT.x, 0, FIRE_AT.z);
const FADE_TIME = 0.55;  // summoning or dismissing (s)
const HELM_TIME = 1.6;   // the helmet swap
const WALK_SPEED = 0.95; // m/s
const TURN_SPEED = 5;    // rad/s
const CROSSFADE = 0.2;
const STEP_OVER = 0.16; // m: what a walking knight steps over (a fire pit's stone, a spare log)
// His meshes' bounds (his own space: the ground under him, turned with him), for culling:
// every pose he takes stays inside with 0.1 m to spare (the farthest reach, 1.76 m from
// here, is a boot kicked out in the site's dance where he stands up to, to his right across
// the ruins' fallen drum; the leaps, Praise the Sun and the rest are inside too:
// test/knightsBounds.test.mjs, on the real model).
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 1.05, 0.15), 1.9);
// Gestures that throw the arms up (or dance): a flinch or a lean over one would hide it.
const CHEERING = new Set(CHEERS);
// The plates on straps: the pauldrons (dome and lames, on the chest) and the tassets (on the
// hips) lag their pose a moment and overshoot a little before they settle. A spring each,
// stepped with the pose at twelve steps a second (in substeps, so it's steady; the same
// steps always swing the same way): `hz` its frequency, `damp` its damping ratio (0.38: a
// quarter's overshoot), `max` how far (rad) a plate may stray from its pose.
const SPRUNG = [
  ['shoulderL', 'chest', 0.1], ['pauldronL', 'chest', 0.13], ['shoulderR', 'chest', 0.1], ['pauldronR', 'chest', 0.13],
  ['tassetL', 'hips', 0.09], ['tassetR', 'hips', 0.09],
];
const SPRING = { hz: 2.6, damp: 0.38, substeps: 4 };
// Room on both sides (gesture()'s and dance()'s `room`).
const FREE = [1, 1];
// Keeping his arms out of the scenery (keepClear): a piece of an arm nearer a shape than
// CLEAR_MARGIN (m) turns the arm away from it (as far as takes it out to the margin, at most
// CLEAR_TURN), at most CLEAR_TRIES times an arm; only the shapes within CLEAR_NEAR (m) of
// where he stands are asked.
const CLEAR_MARGIN = 0.02;
const CLEAR_TURN = (10 * Math.PI) / 180;
const CLEAR_TRIES = 3;
const CLEAR_NEAR = 1.4;
// The pieces that swing with the arm (the pauldron's lames, the arm, the gauntlet; not the
// dome, which stays on the shoulder). Each is checked at its farthest points in PROBE_DIRS
// (the 26 ways out of a cube) and at a point of its surface in every PROBE_CELL (m) it
// touches (GAUNTLET_CELL for the hand and fingers: small pieces, near what they reach for).
const ARM = ['pauldron', 'upperArm', 'forearm', 'hand', 'fingers'];
const SIDES = ['L', 'R'];
// (Each side's arm pieces and shoulder socket, by bone index.)
const ARM_OF = { L: ARM.map((b) => BONE_INDEX[b + 'L']), R: ARM.map((b) => BONE_INDEX[b + 'R']) };
const SHOULDER = { L: BONE_INDEX.upperArmL, R: BONE_INDEX.upperArmR };
const PROBE_DIRS = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => [x, y, z]))).filter((d) => d.some(Boolean));
const PROBE_CELL = 0.03;
const GAUNTLET_CELL = 0.02;
// (Each piece's points are kept in clumps PROBE_CLUMP (m) across, each with the ball round it:
// a clump whose ball can't come as near a shape as what's asked about is passed over whole.)
const PROBE_CLUMP = 0.06;
// At home, his body (all but those arm pieces, his helmet with it) is checked too, and his
// arms again once they're turned: whatever of him would still come nearer a shape near him
// than DEPTH (m; below 0, that far in) eases back toward his resting pose there, as little as
// keeps it out (a seated Praise arching back into a standing stone, a fist pumped into the
// stone at his side).
const BODY = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'tassetL', 'tassetR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
// (Which part of him each piece is, as the ease has them (PART_OF): his body and helmet 0, his
// left arm 1, his right 2, his legs 3. The pauldrons' domes ride up and out with their arm's
// swing: one in eases its arm back. His shins and boots go where his legs put them.)
const PART_OF_PIECE = { shoulderL: 1, shoulderR: 2, shinL: 3, shinR: 3, footL: 3, footR: 3 };
// (Its points are a few centimetres apart: kept 5 mm out, no point between them goes in far.)
const DEPTH = 0.005;
// (His boots and shins rest on what's under them, a seat's edge or a fallen drum: 1 cm in.)
const RESTING = new Set(['shinL', 'shinR', 'footL', 'footR']);
const DEPTH_RESTING = -0.01;
// The ease is looked for from where it was the step before (it changes little from one step
// to the next): letting go of it as fast as it may, holding it, or further back, where the
// margins he's left with say the least that clears him lies. At most EASE_SOLVES poses are
// solved a step, the first one asked for with them (round 9 solved one): a step costs a few
// of round 9's at most (test/knightClearance.test.mjs).
const EASE_SOLVES = 4;
// (What's clear is measured out to MARGIN (m) past what each piece may come to; easing back
// aims EASE_AIM clear, so the look lands clear.)
const MARGIN = CLEAR_MARGIN - DEPTH;
const EASE_AIM = 0.004;
// (Where nothing gets him clear, easing back has to get him at least this much (m) further out.)
const EASE_GAIN = 0.01;
// (Past what he was eased back from, he lets go of it this much of the way a step: over a
// quarter second, not at once.)
const EASE_LET_GO = 0.25;
// (Which part each channel of a pose moves: 0 his body (where he is, his hips, back, neck and
// head), 1 his left arm, 2 his right, 3 his legs (where each foot goes).)
const PART_OF = Uint8Array.from({ length: POSE_SIZE }, (_, i) => (i >= POSE.armL && i < POSE.armL + 7 ? 1 : i >= POSE.armR && i < POSE.armR + 7 ? 2 : i >= POSE.legL ? 3 : 0));
const PARTS = 4;
// (A seated foot's way to where he stands up to, checked at OVER_POINTS points for what it
// steps over: it passes OVER_CLEAR (m) over the scenery's shapes, lifted at most OVER_MOST;
// with more than OVER_CROSS to clear, he stands up over his feet first, then steps across.)
const OVER_POINTS = 17;
const OVER_CLEAR = 0.015;
const OVER_MOST = 0.5;
const OVER_CROSS = 0.06;
// (Where he stands up to in front of his seat, each boot this far (m) from the scenery's shapes,
// and his upper body (UPPER: his chest, head and pauldrons' domes) UPPER_CLEAR: room for a
// dome to ride up with a raised arm (the shrine's lantern roof is at his shoulder): standSpot.)
const STAND_CLEAR = 0.1;
const UPPER = new Set(['chest', 'neck', 'head', 'shoulderL', 'shoulderR'].map((b) => BONE_INDEX[b]));
const UPPER_CLEAR = 0.06;
// (Standing where he's placed, and the channels standing in front of his seat moves: his root
// and his feet, sideways, up to their ground and ahead.)
const STANDING = standingPose();
const STAND_OFFSET = [0, 2, POSE.legL, POSE.legL + 1, POSE.legL + 2, POSE.legR, POSE.legR + 1, POSE.legR + 2];

/**
 * Each plate's id (`aPiece`, 0..1 per vertex, armor.js: each plate a touch lighter or darker
 * than its neighbours): the connected parts of each joint's geometry, welded by position
 * across its materials (a plate and its raised rim are one part; two lames that only
 * overlap are two), a well-spread value from where each part sits. A step (yield) a joint.
 * @param {[string, THREE.BufferGeometry][]} list  [bone, non-indexed geometry] pairs
 */
function* markPlates(list) {
  const byBone = new Map();
  for (const [bone, g] of list) byBone.set(bone, [...(byBone.get(bone) ?? []), g]);
  for (const geos of byBone.values()) {
    const ids = new Map(); // welded position -> vertex id
    const parent = [];
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const at = geos.map((g) => {
      const p = g.attributes.position;
      const out = new Int32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const key = `${Math.round(p.getX(i) * 500)},${Math.round(p.getY(i) * 500)},${Math.round(p.getZ(i) * 500)}`;
        let id = ids.get(key);
        if (id === undefined) { id = parent.length; parent.push(id); ids.set(key, id); }
        out[i] = id;
      }
      for (let i = 0; i + 2 < p.count; i += 3) {
        const a = find(out[i]);
        for (const j of [out[i + 1], out[i + 2]]) { const b = find(j); if (b !== a) parent[b] = a; }
      }
      return out;
    });
    // (Each part's value from its centre: the same model always gets the same plates.)
    const sums = new Map();
    geos.forEach((g, k) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const r = find(at[k][i]);
        const s = sums.get(r) ?? [0, 0, 0, 0];
        s[0] += p.getX(i); s[1] += p.getY(i); s[2] += p.getZ(i); s[3]++;
        sums.set(r, s);
      }
    });
    const value = new Map([...sums].map(([r, [x, y, z, n]]) => {
      const h = Math.sin((x / n) * 127.1 + (y / n) * 311.7 + (z / n) * 74.7) * 43758.5453;
      return [r, h - Math.floor(h)];
    }));
    geos.forEach((g, k) => {
      const v = new Float32Array(g.attributes.position.count);
      for (let i = 0; i < v.length; i++) v[i] = value.get(find(at[k][i]));
      g.setAttribute('aPiece', new THREE.Float32BufferAttribute(v, 1));
    });
    yield;
  }
}

// A plate turns less than this across an edge: one smooth surface there (the pixel styles; the
// model's facets bend up to ~60° round a curve, its creases and box edges 70° and more).
const SMOOTH_COS = Math.cos((64 * Math.PI) / 180);
// How close two corners are to be the same point (Draco quantizes each material's positions
// on its own grid, so a plate's corners in two materials can be a hair apart).
const WELD = 0.0012;
// How far a smooth surface's corners on its crease turn toward the surface across it: every
// plate shades as a rounded shape (a flat crown rolls toward the fire at its front and away
// at its back), not a flat one with a hard band across it.
const PILLOW = 0.55;
// A surface this slight (m, twice its area over its perimeter: a strip's width, half a
// square's side) has a neighbour it merges into when it's small on screen (armor.js: no line
// between a finger's faces, a fauld's hoops, a visor's breaths), and how near that
// neighbour's corners must come (m): the pieces beside it, not only those it's welded to.
const MERGE_SIZE = 0.07;
const MERGE_NEAR = 0.02;
// (A grid cell's key, from its three integer coordinates: a hash; two cells sharing one only
// share a bucket, every lookup checks the distance.)
const cellKey = (x, y, z) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
const push = (map, key, v) => { const l = map.get(key); if (l) l.push(v); else map.set(key, [v]); };

/**
 * Each plate's smooth surfaces, for the pixel styles (armor.js): the faces of each joint's
 * pieces (welded by position across their materials) joined across every edge where they
 * turn less than 64°, each such surface a patch. Per corner:
 *   aSmooth  its normal averaged (by area) over its patch's faces round that corner, and at
 *            a crease turned a little toward the patches beyond (PILLOW), so a curved plate
 *            shades as one smooth, rounded surface and its edges roll
 *   aPatchN  the patch's own mean normal (the fire flashes in a plate as a whole)
 *   aPatch   x the patch's id, 0..63, different from every patch it touches (the pass draws a
 *            line wherever two ids meet on screen: every plate edge, crease and overlap; the
 *            ids start at a different place for each joint, so plates that only overlap
 *            rarely share one); y the id it takes when it's small on screen (a slight patch:
 *            the biggest one's of its joint's patches it merges with; else its own); z its
 *            size (m, MERGE_SIZE); w how flat it is (its face normals summed by area, over
 *            its area: 1 a flat plate, ~0.5 a pauldron's dome, ~0 a ring round a limb: the
 *            pixel styles shade a plate that isn't a ring across itself, armor.js)
 * A step (yield) a joint, and one for the merges.
 * @param {[string, THREE.BufferGeometry][]} list  [bone, non-indexed geometry] pairs
 */
function* markPatches(list) {
  const byBone = new Map();
  for (const [bone, g] of list) push(byBone, bone, g);
  let boneNo = 0;
  const all = []; // every patch: { bone, id, area, size, flat, pts: [x, y, z, ...], faces }
  for (const [bone, geos] of byBone) {
    // Weld the corners: a grid of cells, each point matched to one within WELD nearby.
    const cells = new Map();
    const pts = [];
    const weld = (x, y, z) => {
      const cx = Math.floor(x / (WELD * 2)), cy = Math.floor(y / (WELD * 2)), cz = Math.floor(z / (WELD * 2));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const i of cells.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
          if (Math.abs(pts[i * 3] - x) < WELD && Math.abs(pts[i * 3 + 1] - y) < WELD && Math.abs(pts[i * 3 + 2] - z) < WELD) return i;
        }
      }
      const i = pts.length / 3;
      pts.push(x, y, z);
      push(cells, cellKey(cx, cy, cz), i);
      return i;
    };
    // Every face: its welded corners and its normal (length: twice its area).
    const faces = []; // { g, i (first corner), v: [a, b, c], n: [x, y, z], len }
    for (const g of geos) {
      const p = g.attributes.position;
      for (let i = 0; i + 2 < p.count; i += 3) {
        const v = [weld(p.getX(i), p.getY(i), p.getZ(i)), weld(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)), weld(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))];
        const ax = p.getX(i + 1) - p.getX(i), ay = p.getY(i + 1) - p.getY(i), az = p.getZ(i + 1) - p.getZ(i);
        const bx = p.getX(i + 2) - p.getX(i), by = p.getY(i + 2) - p.getY(i), bz = p.getZ(i + 2) - p.getZ(i);
        const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
        faces.push({ g, i, v, n, len: Math.hypot(n[0], n[1], n[2]) });
      }
    }
    const M = pts.length / 3 + 1; // (a pair of corners, or a patch and a corner, as one number)
    // Faces meeting across an edge at less than the smooth angle are one surface.
    const parent = faces.map((_, f) => f);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const edges = new Map(); // corner pair -> faces
    faces.forEach((f, fi) => {
      for (let e = 0; e < 3; e++) {
        const a = f.v[e], b = f.v[(e + 1) % 3];
        if (a !== b) push(edges, a < b ? a * M + b : b * M + a, fi);
      }
    });
    for (const fs of edges.values()) {
      if (fs.length !== 2) continue;
      const f = faces[fs[0]], g = faces[fs[1]];
      if (f.len < 1e-12 || g.len < 1e-12) continue;
      if ((f.n[0] * g.n[0] + f.n[1] * g.n[1] + f.n[2] * g.n[2]) / (f.len * g.len) > SMOOTH_COS) {
        const a = find(fs[0]), b = find(fs[1]);
        if (a !== b) parent[b] = a;
      }
    }
    // Each patch: its area, perimeter (the edges it doesn't share with itself) and mean normal.
    const patch = new Map(); // root -> { area, perim, n: [x, y, z], corners: Set, faces: [] }
    faces.forEach((f, fi) => {
      const r = find(fi);
      let P = patch.get(r);
      if (!P) patch.set(r, (P = { area: 0, perim: 0, n: [0, 0, 0], corners: new Set(), faces: [] }));
      P.area += f.len / 2;
      for (let k = 0; k < 3; k++) P.n[k] += f.n[k];
      for (const v of f.v) P.corners.add(v);
      P.faces.push(f);
    });
    for (const [key, fs] of edges) {
      const a = Math.floor(key / M), b = key % M;
      const l = Math.hypot(pts[a * 3] - pts[b * 3], pts[a * 3 + 1] - pts[b * 3 + 1], pts[a * 3 + 2] - pts[b * 3 + 2]);
      const roots = fs.map(find);
      for (const r of new Set(roots)) if (roots.filter((x) => x === r).length < 2) patch.get(r).perim += l;
    }
    // Each corner's smooth normal: its patch's faces round it, summed (by area)...
    const sums = new Map(); // patch * M + corner -> [x, y, z]
    faces.forEach((f, fi) => {
      const r = find(fi);
      for (const v of f.v) {
        const s = sums.get(r * M + v);
        if (s) { s[0] += f.n[0]; s[1] += f.n[1]; s[2] += f.n[2]; } else sums.set(r * M + v, [...f.n]);
      }
    });
    const unit = (s) => { const l = Math.hypot(s[0], s[1], s[2]); return l > 1e-12 ? [s[0] / l, s[1] / l, s[2] / l] : null; };
    // ...and at a crease, turned toward the patches across it (PILLOW).
    const touching = new Map(); // welded corner -> patches there
    for (const [r, P] of patch) for (const v of P.corners) push(touching, v, r);
    const smooth = new Map();
    for (const [key, s] of sums) {
      const r = Math.floor(key / M), v = key % M;
      const own = unit(s);
      if (!own) continue;
      const out = [...own];
      for (const o of touching.get(v)) {
        if (o === r) continue;
        const n = unit(sums.get(o * M + v));
        if (n) for (let k = 0; k < 3; k++) out[k] += PILLOW * n[k];
      }
      smooth.set(key, unit(out) ?? own);
    }
    // Each patch's id: the first not taken by a patch it touches (sharing a corner).
    const ids = new Map();
    const start = (boneNo++ * 23) % 64;
    let order = 0;
    faces.forEach((f, fi) => {
      const r = find(fi);
      if (ids.has(r)) return;
      const taken = new Set();
      for (const v of patch.get(r).corners) for (const o of touching.get(v)) if (ids.has(o)) taken.add(ids.get(o));
      let id = (start + order++ * 11) % 64;
      for (let k = 0; k < 64 && taken.has(id); k++) id = (id + 1) % 64;
      ids.set(r, id);
    });
    // Onto the corners (the merge ids come once every joint's patches are known).
    for (const g of geos) {
      const n = g.attributes.position.count;
      g.setAttribute('aSmooth', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aPatchN', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aPatch', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
    }
    for (const [r, P] of patch) {
      const mean = unit(P.n) ?? [0, 1, 0];
      const size = P.perim > 1e-9 ? (2 * P.area) / P.perim : Math.sqrt(P.area);
      // (How flat it is: its faces' normals summed by area over its area; 1 a flat plate,
      // about 0.5 a dome, near 0 a ring round a limb.)
      const flat = P.area > 1e-12 ? Math.min(1, Math.hypot(P.n[0], P.n[1], P.n[2]) / (2 * P.area)) : 1;
      const rec = { bone, id: ids.get(r), area: P.area, size, flat, pts: [], faces: P.faces };
      for (const v of P.corners) rec.pts.push(pts[v * 3], pts[v * 3 + 1], pts[v * 3 + 2]);
      for (const f of P.faces) {
        const sm = f.g.attributes.aSmooth, pn = f.g.attributes.aPatchN;
        f.v.forEach((v, k) => {
          const n = smooth.get(r * M + v) ?? (f.len > 1e-12 ? f.n.map((c) => c / f.len) : [0, 1, 0]);
          sm.setXYZ(f.i + k, n[0], n[1], n[2]);
          pn.setXYZ(f.i + k, mean[0], mean[1], mean[2]);
        });
      }
      all.push(rec);
    }
    yield;
  }
  // The merges: each slight patch joins the biggest patch of its joint whose corners come
  // near its own; a group of them takes its biggest one's id.
  const near = new Map(); // grid cell -> patches with a corner there
  const cell = (c) => Math.floor(c / MERGE_NEAR);
  all.forEach((P, pi) => {
    for (let j = 0; j < P.pts.length; j += 3) {
      const key = cellKey(cell(P.pts[j]), cell(P.pts[j + 1]), cell(P.pts[j + 2]));
      const l = near.get(key);
      if (!l) near.set(key, [pi]); else if (l[l.length - 1] !== pi) l.push(pi);
    }
  });
  const up = all.map((_, i) => i);
  const top = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  all.forEach((P, pi) => {
    if (P.size >= MERGE_SIZE) return;
    let best = -1;
    for (let j = 0; j < P.pts.length; j += 3) {
      const x = P.pts[j], y = P.pts[j + 1], z = P.pts[j + 2];
      const cx = cell(x), cy = cell(y), cz = cell(z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const o of near.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
          const Q = all[o];
          if (o === pi || Q.bone !== P.bone || (best >= 0 && Q.area <= all[best].area)) continue;
          for (let q = 0; q < Q.pts.length; q += 3) {
            if (Math.hypot(Q.pts[q] - x, Q.pts[q + 1] - y, Q.pts[q + 2] - z) < MERGE_NEAR) { best = o; break; }
          }
        }
      }
    }
    if (best >= 0) { const a = top(pi), b = top(best); if (a !== b) up[a] = b; }
  });
  const biggest = new Map(); // group root -> its biggest patch
  all.forEach((P, pi) => { const r = top(pi); if (!biggest.has(r) || all[biggest.get(r)].area < P.area) biggest.set(r, pi); });
  all.forEach((P, pi) => {
    const merge = all[biggest.get(top(pi))].id;
    for (const f of P.faces) for (let k = 0; k < 3; k++) f.g.attributes.aPatch.setXYZW(f.i + k, P.id, merge, P.size, P.flat);
  });
}

// Occlusion (the pixel styles): the model voxelized at VOX (m); from each corner, OCC_DIRS
// rays over its smooth normal's side, from OCC_FROM out to OCC_REACH (m), a hit counting
// the more the nearer it is.
const VOX = 0.015;
const OCC_FROM = 0.02;
const OCC_REACH = 0.1;
// (Cosine-weighted directions round +z: a spiral, the same every time; x, y, z each.)
const OCC_DIRS = Float32Array.from({ length: 12 * 3 }, (_, k) => {
  const i = Math.floor(k / 3), r = Math.sqrt((i + 0.5) / 12), a = i * 2.39996323;
  return [r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - r * r)][k % 3];
});

/**
 * How buried each corner is (`aOcc`, 0 open .. 1 buried: the pixel styles keep the fire out
 * of it and darken it; armor.js): the rays from it over its side of the plate that meet the
 * knight close by (under the helm, beneath the pauldrons, where plates overlap, between the
 * legs). Measured in the rest pose, so only against the pieces that stay put relative to
 * it: its own joint, its parent, its children and its siblings; the helmets count as the
 * head (the great helm for the body's own), a helmet against the head and the neck. A step
 * (yield) every few pieces voxelized, and every piece's rays.
 * @param {[string, THREE.BufferGeometry][]} list  [bone, non-indexed geometry] pairs (with aSmooth)
 */
function* markOcclusion(list) {
  const box = new THREE.Box3();
  for (const [, g] of list) { g.computeBoundingBox(); box.union(g.boundingBox); }
  box.expandByScalar(OCC_REACH + VOX);
  const ox = box.min.x, oy = box.min.y, oz = box.min.z;
  const nx = Math.ceil((box.max.x - ox) / VOX), ny = Math.ceil((box.max.y - oy) / VOX), nz = Math.ceil((box.max.z - oz) / VOX);
  // Two occupants a cell (the joint's index + 1); a third (at a joint) is left out.
  const cellA = new Uint8Array(nx * ny * nz), cellB = new Uint8Array(nx * ny * nz);
  const cellAt = (x, y, z) => {
    const i = Math.floor((x - ox) / VOX), j = Math.floor((y - oy) / VOX), k = Math.floor((z - oz) / VOX);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i;
  };
  const boneNo = (b) => BONE_INDEX[b] + 1;
  let piece = 0;
  for (const [bone, g] of list) {
    if (++piece % 8 === 0) yield;
    const p = g.attributes.position.array;
    const b = boneNo(bone);
    for (let i = 0; i + 8 < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2];
      const ux = p[i + 3] - ax, uy = p[i + 4] - ay, uz = p[i + 5] - az, wx = p[i + 6] - ax, wy = p[i + 7] - ay, wz = p[i + 8] - az;
      const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(ux, uy, uz), Math.hypot(wx, wy, wz)) / (VOX * 0.8)));
      for (let s = 0; s <= steps; s++) for (let t = 0; t <= steps - s; t++) {
        const c = cellAt(ax + (ux * s + wx * t) / steps, ay + (uy * s + wy * t) / steps, az + (uz * s + wz * t) / steps);
        if (c < 0 || cellA[c] === b || cellB[c] === b) continue;
        if (!cellA[c]) cellA[c] = b;
        else if (!cellB[c]) cellB[c] = b;
      }
    }
  }
  // Who can bury whom.
  const kin = (bone) => {
    const par = PARENT_ALL[bone];
    const out = new Set([bone, par]);
    for (const b of ALL_BONES) if (PARENT_ALL[b] === bone || (par && PARENT_ALL[b] === par)) out.add(b);
    const helm = bone.startsWith('helm_');
    if (helm) out.add('neck');
    else if (out.has('head')) out.add('helm_great');
    for (const h of HELMETS) if (out.has('helm_' + h) && 'helm_' + h !== bone && (helm || h !== 'great')) out.delete('helm_' + h);
    const mask = new Uint8Array(ALL_BONES.length + 1);
    for (const b of out) if (b && BONE_INDEX[b] !== undefined) mask[boneNo(b)] = 1;
    return mask;
  };
  const seen = new Map(); // (a hash of the corner and its normal) -> its occlusion
  const n3 = OCC_DIRS.length / 3, step = VOX * 0.7;
  for (const [bone, g] of list) {
    const mask = kin(bone);
    const p = g.attributes.position.array, sm = g.attributes.aSmooth.array;
    const occ = new Float32Array(p.length / 3);
    for (let v = 0; v < occ.length; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], nX = sm[v * 3], nY = sm[v * 3 + 1], nZ = sm[v * 3 + 2];
      const key = (cellKey(Math.round(x * 2000), Math.round(y * 2000), Math.round(z * 2000)) ^ cellKey(Math.round(nX * 50), Math.round(nY * 50) + 7, Math.round(nZ * 50) + 13) * 31 ^ boneNo(bone)) | 0;
      const had = seen.get(key);
      if (had !== undefined) { occ[v] = had; continue; }
      // (A frame round the normal.)
      const hx = Math.abs(nY) < 0.9 ? 0 : 1, hy = 1 - hx;
      let tx = hy * nZ, ty = -hx * nZ, tz = hx * nY - hy * nX;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const bx = nY * tz - nZ * ty, by = nZ * tx - nX * tz, bz = nX * ty - nY * tx;
      let hits = 0;
      for (let r = 0; r < n3; r++) {
        const a = OCC_DIRS[r * 3], b = OCC_DIRS[r * 3 + 1], c = OCC_DIRS[r * 3 + 2];
        const dx = tx * a + bx * b + nX * c, dy = ty * a + by * b + nY * c, dz = tz * a + bz * b + nZ * c;
        for (let t = OCC_FROM; t <= OCC_REACH; t += step) {
          const q = cellAt(x + dx * t, y + dy * t, z + dz * t);
          if (q >= 0 && (mask[cellA[q]] || mask[cellB[q]])) { hits += 1 - (t - OCC_FROM) / (OCC_REACH - OCC_FROM); break; }
        }
      }
      occ[v] = hits / n3;
      seen.set(key, occ[v]);
    }
    g.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
    yield;
  }
}

/**
 * The model's pieces, merged: the body's and each helmet's geometry in rest space, with bone,
 * role and plate per vertex (a template: createKnights builds his knights from it). A step at
 * a time: a generator that yields between its parts (each joint's plates and surfaces, the
 * occlusion's pieces: tens of ms in all on a desktop, several times that on a phone), so the
 * caller can spread it over idle moments (scene.js); its return value is the template
 * (`root`: the model it's from). buildTemplate() runs it through at once.
 * @param {THREE.Object3D} gltfRoot  a knight model's loaded scene
 */
export function* templateSteps(gltfRoot) {
  const knight = gltfRoot.getObjectByName('Knight') ?? gltfRoot.getObjectByName('K_Hips')?.parent ?? null;
  if (!knight) throw new Error('Model is missing required node: Knight');
  if (!knight.getObjectByName('K_Hips')) throw new Error('Model is missing required node: K_Hips');
  knight.updateMatrixWorld(true);
  const toKnight = knight.matrixWorld.clone().invert();
  const restPos = {};
  const restQuat = {};
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  knight.traverse((o) => {
    const b = NODE_BONE[o.name];
    if (!b) return;
    m.multiplyMatrices(toKnight, o.matrixWorld).decompose(pos, quat, scl);
    restPos[b] = pos.toArray();
    restQuat[b] = quat.clone();
  });
  for (const b of ALL_BONES) {
    if (restPos[b]) continue;
    // (A joint the model lacks: the default place, or a helmet on the head.)
    restPos[b] = b.startsWith('helm_') ? restPos.head ?? DEFAULT_REST.head : DEFAULT_REST[b];
    restQuat[b] = new THREE.Quaternion();
  }
  const body = [];
  const helm = Object.fromEntries(HELMETS.map((h) => ['helm_' + h, []]));
  const pieces = []; // [bone, geometry] (for markPlates)
  knight.traverse((o) => {
    if (!o.isMesh) return;
    let j = o;
    while (j && j !== knight && !NODE_BONE[j.name]) j = j.parent;
    const bone = j && NODE_BONE[j.name];
    if (!bone) return;
    const src = o.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(m.multiplyMatrices(toKnight, o.matrixWorld));
    if (!g.attributes.normal) g.computeVertexNormals();
    const flat = g.index ? g.toNonIndexed() : g;
    const n = flat.attributes.position.count;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const aRole = new Float32Array(n).fill(roleOf([o.material].flat()[0]?.name ?? ''));
    for (let i = 0; i < n; i++) { skinIndex[i * 4] = BONE_INDEX[bone]; skinWeight[i * 4] = 1; }
    flat.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    flat.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    flat.setAttribute('aRole', new THREE.Float32BufferAttribute(aRole, 1));
    (helm[bone] ?? body).push(flat);
    pieces.push([bone, flat]);
  });
  if (!body.length) throw new Error('Model has no knight pieces');
  yield;
  yield* markPlates(pieces);
  yield* markPatches(pieces);
  yield* markOcclusion(pieces);
  const merge = (list) => {
    const g = list.length ? mergeGeometries(list, false) : new THREE.BufferGeometry();
    for (const x of list) x.dispose();
    g.computeBoundingSphere?.();
    return g;
  };
  const bodyGeo = merge(body);
  const helmGeos = HELMETS.map((h) => merge(helm['helm_' + h]));
  /** The heights (rest space) the geometries span: [lo, hi], or the defaults. */
  const span = (list, lo, hi) => {
    const box = new THREE.Box3();
    for (const g of list) { g.computeBoundingBox?.(); if (g.boundingBox) box.union(g.boundingBox); }
    return Number.isFinite(box.min.y) ? [box.min.y, box.max.y] : [lo, hi];
  };
  const follow = knight.getObjectByName('K_Tasset_L')?.userData?.follow;
  // (The points he's checked at against the scenery: knights.js keepClear, solveClear.)
  const probes = yield* probesOf({ bodyGeo, helmGeos, restPos });
  return {
    root: gltfRoot,
    // (The dissolve runs over all three helmets' heights, so each burns the same way.)
    restPos, restQuat, bodyGeo, helmGeos, bodySpan: span([bodyGeo], 0, 1.72), helmSpan: span(helmGeos, 1.4, 1.75),
    tassetFollow: Number.isFinite(follow) ? follow : null,
    probes,
  };
}
/**
 * Points over a piece (its own space, from `o`; the triangles of `pos`, three corners each,
 * that `keep` keeps by their first corner): its farthest corners in PROBE_DIRS, and over its
 * surface one in every `cell` (m) it touches, in clumps (PROBE_CLUMP). With how far the
 * farthest is from `o`: { pts, clumps, r }.
 */
function pointsOf(pos, keep, o, cell) {
  const best = PROBE_DIRS.map(() => ({ d: -Infinity, v: null }));
  const cells = new Map();
  const corner = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let j = 0; pos && j + 2 < pos.count; j += 3) {
    if (!keep(j)) continue;
    for (let q = 0; q < 3; q++) {
      const c = corner[q];
      c[0] = pos.getX(j + q) - o[0]; c[1] = pos.getY(j + q) - o[1]; c[2] = pos.getZ(j + q) - o[2];
      // (A piece's farthest point in any way is one of its corners.)
      for (let k = 0; k < PROBE_DIRS.length; k++) {
        const [dx, dy, dz] = PROBE_DIRS[k];
        const d = c[0] * dx + c[1] * dy + c[2] * dz;
        if (d > best[k].d) best[k] = { d, v: [...c] };
      }
    }
    const [a, b, c] = corner;
    const n = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2])) / cell));
    for (let u = 0; u <= n; u++) {
      for (let w = 0; w <= n - u; w++) {
        const f = u / n, g = w / n, e = 1 - f - g;
        const x = a[0] * e + b[0] * f + c[0] * g, y = a[1] * e + b[1] * f + c[1] * g, z = a[2] * e + b[2] * f + c[2] * g;
        // (Cells of a few centimetres a piece, keyed exactly: a piece is well under 10 m.)
        const key = (Math.floor(x / cell) + 512) * 1048576 + (Math.floor(y / cell) + 512) * 1024 + Math.floor(z / cell) + 512;
        if (!cells.has(key)) cells.set(key, [x, y, z]);
      }
    }
  }
  const all = new Map([...best.filter((e) => e.v).map((e) => e.v), ...cells.values()].map((v) => [v.join(), v]));
  // (Each clump's points together in `pts` (x, y, z, …), and in `clumps` each clump's middle,
  // the radius of the ball round it from there, and where its points are in `pts`: cx, cy, cz,
  // r, from, to, ….)
  const byClump = new Map();
  for (const v of all.values()) {
    const key = (Math.floor(v[0] / PROBE_CLUMP) + 512) * 1048576 + (Math.floor(v[1] / PROBE_CLUMP) + 512) * 1024 + Math.floor(v[2] / PROBE_CLUMP) + 512;
    if (!byClump.has(key)) byClump.set(key, []);
    byClump.get(key).push(v);
  }
  const pts = [], clumps = [];
  for (const list of byClump.values()) {
    const c = [0, 1, 2].map((a) => list.reduce((sum, v) => sum + v[a], 0) / list.length);
    const ball = Math.max(...list.map((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2])));
    clumps.push(...c, ball, pts.length, pts.length + 3 * list.length);
    for (const v of list) pts.push(...v);
  }
  let r = 0;
  for (let j = 0; j < pts.length; j += 3) r = Math.max(r, Math.hypot(pts[j], pts[j + 1], pts[j + 2]));
  return { pts: Float32Array.from(pts), clumps: Float32Array.from(clumps), r };
}
/**
 * The points a knight is checked at against the scenery, from a template's pieces: each arm
 * piece's (`arms`, by bone index: its rim, its cop, its knuckles and fingertips, and its
 * surface a few centimetres apart, a gauntlet's closer), his body's (`body`, by bone, with
 * how near a shape each may come) and each helmet's on the head (`helms`). A step (yield) a
 * few pieces.
 * @param {{ bodyGeo: THREE.BufferGeometry, helmGeos: THREE.BufferGeometry[], restPos: Record<string, number[]> }} T
 */
function* probesOf(T) {
  const pos = T.bodyGeo.attributes.position, bone = T.bodyGeo.attributes.skinIndex;
  const piece = (b, cell) => {
    const i = BONE_INDEX[b];
    return bone ? pointsOf(pos, (j) => bone.getX(j) === i, T.restPos[b], cell) : { pts: new Float32Array(0), clumps: new Float32Array(0), r: 0 };
  };
  const arms = new Map();
  for (const side of ['L', 'R']) {
    for (const b of ARM) {
      arms.set(BONE_INDEX[b + side], piece(b + side, b === 'hand' || b === 'fingers' ? GAUNTLET_CELL : PROBE_CELL));
      yield;
    }
  }
  const body = [];
  for (const b of BODY) {
    body.push({ i: BONE_INDEX[b], depth: RESTING.has(b) ? DEPTH_RESTING : DEPTH, part: PART_OF_PIECE[b] ?? 0, ...piece(b, PROBE_CELL) });
    if (body.length % 3 === 0) yield;
  }
  const helms = {};
  for (const [j, h] of HELMETS.entries()) {
    helms[h] = pointsOf(T.helmGeos[j]?.attributes.position, () => true, T.restPos.head, PROBE_CELL);
    yield;
  }
  return { arms, body, helms };
}
/** Run a generator of steps through at once: its value. */
function drain(steps) {
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** A knight model's template (templateSteps), built at once. */
function buildTemplate(gltfRoot) {
  return drain(templateSteps(gltfRoot));
}

/**
 * The pauldrons' collision data (knightPose.js measurePlates) from the model: each helmet's
 * pieces (the bascinet's mail aventail too: a dome may sit in it no deeper than the model
 * has it at rest) in the head's space, and the left dome's and lames' triangles in their
 * joints' space; null when the model has no dome.
 * `lamesNode`: the lames are on their own node (K_Pauldron_*), not riding the dome.
 */
function platesOf(T) {
  const tris = (g, keep, o) => {
    const p = g.attributes.position;
    const out = [];
    if (!p) return out;
    for (let i = 0; i + 2 < p.count; i += 3) {
      if (!keep(i)) continue;
      for (let j = i; j < i + 3; j++) out.push(p.getX(j) - o[0], p.getY(j) - o[1], p.getZ(j) - o[2]);
    }
    return out;
  };
  const bone = T.bodyGeo.attributes.skinIndex;
  const on = (b) => (i) => bone.getX(i) === BONE_INDEX[b];
  const dome = tris(T.bodyGeo, on('shoulderL'), T.restPos.shoulderL);
  if (!dome.length) return null;
  const lames = tris(T.bodyGeo, on('pauldronL'), T.restPos.pauldronL);
  const helmets = Object.fromEntries(HELMETS.map((h, j) => [h, tris(T.helmGeos[j], () => true, T.restPos.head)]));
  return { plates: measurePlates({ helmets, dome, lames }), lamesNode: lames.length > 0 };
}

/**
 * @param {THREE.Object3D} gltfRoot  the loaded knight.glb scene (a "Knight" node with the K_ joints)
 * @param {object} o
 * @param {number} o.layerSolid, o.layerGhost
 * @param {boolean} o.castShadows
 * @param {object} o.armor           createArmorShared(): the shared uniforms
 * @param {number} [o.max]           the most knights (4; 2 on touch devices)
 * @param {boolean} [o.reducedMotion]  sitting still: no idle motion, reactions or dancing
 * @param {(list: {x,y,z,vx,vy,vz}[]) => void} [o.onSparks]  throw sparks (world)
 * @param {object} [o.template]      the model's template, built beforehand (templateSteps: in
 *   idle moments); without it, it's built here at once
 */
export function createKnights(gltfRoot, { layerSolid = 0, layerGhost = 2, castShadows = true, armor, max = 4, reducedMotion = false, onSparks = null, template = null } = {}) {
  // The template he's built from now: the knight's own, or another style's model on the same
  // rig (setStyle). The rig, the solver and the plates' collision data are the knight's own.
  let T = template?.root === gltfRoot ? template : buildTemplate(gltfRoot);
  const T0 = T;
  const templates = new Map([[gltfRoot, T]]);
  const armorPlates = platesOf(T);
  const rig = measureRig(T.restPos, {
    ...(T.tassetFollow ? { tassetFollow: T.tassetFollow } : {}),
    plates: armorPlates?.plates ?? null, lamesNode: armorPlates?.lamesNode ?? false,
  });
  const solver = createSolver(rig);
  // (Every pose is solved through here, counted: k.solves is how many his last step took,
  // test/knightClearance.test.mjs holds it to EASE_SOLVES.)
  let solves = 0;
  const solve = (pose, ground = null, helmet = null) => { solves++; return solver.solve(pose, ground, helmet); };
  // The points his arms and body are checked at against the scenery (keepClear, solveClear):
  // the template's, built in its steps (or here, at once). Every style's model is moved onto
  // this one's joints, so its points serve them all.
  const { arms: probes, body: bodyProbes, helms: helmProbes } = T.probes ?? drain(probesOf(T));
  const FEET = [bodyProbes.find((b) => b.i === BONE_INDEX.footL), bodyProbes.find((b) => b.i === BONE_INDEX.footR)];
  const restPos = ALL_BONES.map((b) => new THREE.Vector3(...T.restPos[b]));
  const restQuat = ALL_BONES.map((b) => T.restQuat[b]);
  const restLocalPos = ALL_BONES.map((b, i) => {
    const par = PARENT_ALL[b];
    if (!par) return restPos[i].clone();
    const pi = BONE_INDEX[par];
    return restPos[i].clone().sub(restPos[pi]).applyQuaternion(restQuat[pi].clone().invert());
  });
  const boneInverses = ALL_BONES.map((b, i) => new THREE.Matrix4().compose(restPos[i], restQuat[i], new THREE.Vector3(1, 1, 1)).invert());
  const root = new THREE.Group();
  root.name = 'Knights';
  const materials = [];

  // --- one knight ------------------------------------------------------------------------------
  function makeKnight(index) {
    const bones = ALL_BONES.map((b, i) => {
      const bone = new THREE.Bone();
      bone.name = b;
      bone.position.copy(restLocalPos[i]);
      const par = PARENT_ALL[b];
      bone.quaternion.copy(par ? restQuat[BONE_INDEX[par]].clone().invert().multiply(restQuat[i]) : restQuat[i]);
      return bone;
    });
    ALL_BONES.forEach((b, i) => { const par = PARENT_ALL[b]; if (par) bones[BONE_INDEX[par]].add(bones[i]); });
    const skeleton = new THREE.Skeleton(bones, boneInverses.map((mm) => mm.clone()));
    const bodyMat = createArmorMaterial(armor, { span: T.bodySpan });
    const helmMat = createArmorMaterial(armor, { span: T.helmSpan });
    materials.push(bodyMat, helmMat);
    const group = new THREE.Group();
    group.name = `Knight_${index}`;
    group.add(bones[0]);
    const parts = [[T.bodyGeo, bodyMat, 'Body'], ...HELMETS.map((h, j) => [T.helmGeos[j], helmMat, `Helm_${h}`])];
    const meshes = parts.map(([g, mat, part]) => {
      const mesh = new THREE.SkinnedMesh(g, mat);
      mesh.name = `Knight_${index}_${part}`;
      // (Culled by the sphere every pose stays inside: its own bounds would come from
      // whatever pose it had first.)
      mesh.boundingSphere = BOUNDS.clone();
      mesh.castShadow = castShadows;
      mesh.receiveShadow = true;
      mesh.layers.set(layerSolid);
      mesh.bind(skeleton, new THREE.Matrix4());
      group.add(mesh);
      return mesh;
    });
    group.visible = false;
    root.add(group);
    const helms = Object.fromEntries(HELMETS.map((h, j) => [h, meshes[j + 1]]));
    return {
      index, group, bones, skeleton, body: meshes[0], helms, meshes, bodyMat, helmMat,
      pose: newPose(), from: newPose(), blend: 1, sit: newPose(), stand: newPose(), work: newPose(),
      present: false, fade: null, ghost: false,
      forging: null,     // 'in' | 'out': the forge is summoning or sending him off (forgeSubject)
      mode: 'sit', act: null, queue: [],
      home: null,        // where he sits: { x, z, yaw, h, feet: [gL, gR], y } (world)
      yaw: 0, lastStep: -1, clock: 0,
      react: { flinch: -9, flinchK: 0, stoke: -9, hop: -9 },
      lookAt: null, lookW: 0, lookYaw: 0, lookPitch: 0, attn: 0, attnMoving: false,
      helmet: 'great', swap: null,
      dancing: null,     // { move, energy, offset, seed, seated }: the dance he's doing
      nextDance: null,   // ...or the one he's on his way to
      danceAt: null,     // where he dances: { x, z, yaw, seated }
      seed: index * 7 + 3,
      wasBig: false,     // (his last pose step was real motion)
      solves: 0,         // (how many poses his last step solved: solveClear)
      solved: null,      // his solved pose's joints (knight space): { p: [Vector3 by BONES index] }
      own: { p: BONES.map(() => new THREE.Vector3()) }, // (his own copy: the solver's is shared)
    };
  }
  const knights = Array.from({ length: Math.max(1, max) }, (_, i) => makeKnight(i));
  let cast = 1;
  let sceneryName = 'ruins';
  let terrain = null;
  let moving = false;
  // What casts his shadow changed (he formed, burnt away, was placed somewhere new, changed
  // helmets at once): the next update() says `moving`, so the shadow is redrawn once.
  let shadowDirty = false;
  let hovered = -1;
  let seatStyle = 'resting'; // how they sit (SEAT_POSES; a knight can have his own: k.seatPose)
  // Whether the view has room over a seat for him to stand up in (scene.js: not a phone's tall
  // view, which frames his seat right under the page's header): without it the site's dance
  // (gesture 'dance') is danced in his seat.
  let headroom = true;
  let beat = { pos: 0, period: 0.5, at: -1 };
  let simT = 0;
  const fitsAt = createFits(); // (the room round each place fits() was asked about, until a new scenery)

  // --- placement --------------------------------------------------------------------------------
  const heightAt = (x, z) => terrain?.height(x, z) ?? 0;
  const topAt = (x, z) => terrain?.top(x, z) ?? 0;
  const faceFire = (x, z) => Math.atan2(FIRE.x - x, FIRE.z - z);
  /** Something he can't step over stands at (x, z): a seat, a wall, a pile of logs (the height map). */
  const blocked = (x, z) => topAt(x, z) > STEP_OVER;

  /** Where knight i rests in this scenery: the scenery's seat (the first), or the ground at a ring slot. */
  function homeFor(i) {
    const seat = SEATS[sceneryName];
    if (i === 0 && seat) {
      const yaw = seat.yaw ?? faceFire(seat.x, seat.z);
      // The seat's real height from the height map (the highest cell under him), and the
      // ground where each foot lands.
      let top = 0;
      for (let a = 0; a < 7; a++) {
        const r = a ? 0.07 : 0;
        top = Math.max(top, topAt(seat.x + Math.sin(a) * r, seat.z + Math.cos(a) * r));
      }
      if (!terrain || Math.abs(top - seat.top) > 0.1) top = seat.top;
      // (Each foot's ground: his left is +x in his own space.)
      const ground = (side) => {
        const p = new THREE.Vector3(side * 0.17, 0, seatFeet(top)).applyAxisAngle(Y_AXIS, yaw);
        return heightAt(seat.x + p.x, seat.z + p.z);
      };
      const gL = ground(1), gR = ground(-1);
      const y = Math.max(0, Math.min(gL, gR));
      return { x: seat.x, z: seat.z, yaw, h: Math.max(0.15, top - y), feet: [gL - y, gR - y], y, seat: true, aside: seat.standAside ?? 0 };
    }
    // The others sit on the ground where the visualizer rests them (knightPlaces.js
    // restPlaces: the ring's clear sides, never in front of the fire), their feet on the ring.
    const place = restPlaces(ringOf(sceneryName), Math.max(cast, i + 1), seat)[i - 1] ?? danceSlots(sceneryName)[slotOf(i)];
    const out = Math.hypot(place.x - FIRE.x, place.z - FIRE.z) || 1;
    const back = seatFeet(0) - 0.03;
    const x = place.x + ((place.x - FIRE.x) / out) * back, z = place.z + ((place.z - FIRE.z) / out) * back;
    return { x, z, yaw: faceFire(x, z), h: 0, feet: [0, 0], y: Math.max(0, heightAt(x, z)), seat: false };
  }
  /** Put knight k seated at home now. */
  function seatNow(k) {
    k.home = homeFor(k.index);
    k.group.position.set(k.home.x, k.home.y, k.home.z);
    k.yaw = k.home.yaw;
    k.group.rotation.y = k.yaw;
    seatPoseOf(k);
    standAtSeat(k);
    k.mode = 'sit';
    k.act = null;
    k.queue.length = 0;
    k.dancing = k.nextDance = k.danceAt = null;
    k.pose.set(k.sit);
    k.blend = 1;
    k.lastStep = -1;
    shadowDirty = true;
  }
  /** Put knight k standing at `to` ({ x, z }) now, turned to `facing` (see facingFor). */
  function standAt(k, to, facing) {
    k.group.position.set(to.x, Math.max(0, heightAt(to.x, to.z)), to.z);
    k.yaw = facingFor(to.x, to.z, facing);
    k.group.rotation.y = k.yaw;
    standingPose(k.stand);
    k.mode = 'stand';
    k.pose.set(k.stand);
    k.lastStep = -1;
    shadowDirty = true;
  }
  // --- the ground round his seat (his feet, standing up, room for his arms) ----------------------
  const _hw = new THREE.Vector3();
  /** A place in his own space at `home` ({ x, z, yaw }: x his left, z ahead), in the world (reused). */
  const atHome = (home, x, z) => { _hw.set(x, 0, z).applyAxisAngle(Y_AXIS, home.yaw); _hw.x += home.x; _hw.z += home.z; return _hw; };
  /** The ground at a place in his own space at `home`, above the ground he's placed on (m). */
  const groundUnder = (home, x, z) => { const w = atHome(home, x, z); return THREE.MathUtils.clamp(heightAt(w.x, w.z) - home.y, -0.1, 0.42); };
  /**
   * The ground a seated boot rests on at a place in his own space at `home` (its ankle at x, z):
   * the highest under its sole from the ankle to the pointed toe (0.3 m ahead), so the toe
   * never sinks into whatever it reaches over (the ruins' fallen drum: he rests his foot up on
   * it). (Not the heel's: a foot drawn in tucks its heel under the seat's edge.)
   */
  const soleUnder = (home, x, z) => {
    let g = -Infinity;
    for (const dz of [0, 0.1, 0.2, 0.28]) for (const dx of [-0.05, 0.05]) g = Math.max(g, groundUnder(home, x + dx, z + dz));
    return g;
  };
  /** What stands at a place in his own space at `home` (its top), above the ground he's placed on (m). */
  const topUnder = (home, x, z) => { const w = atHome(home, x, z); return topAt(w.x, w.z) - home.y; };
  /**
   * His seated pose at home (into k.sit), each foot on the ground where the pose rests it
   * (a foot up on the seat's log, or down a slope), and the room he has for his arms.
   */
  function seatPoseOf(k, style = k.seatPose ?? seatStyle) {
    const h = k.home;
    seatedPose(k.sit, h.h, rig, style);
    const [fl, fr] = feetAt(k.sit, rig);
    h.feet = [soleUnder(h, fl[0], fl[1]), soleUnder(h, fr[0], fr[1])];
    seatedPose(k.sit, h.h, rig, style, h.feet);
    h.room = roomOf(h, k.sit);
    h.roomLess = null;
    return k.sit;
  }
  const _rn = [0, 0, 0];
  /**
   * How much room he has for each arm at home in a pose (`pose`: seated, or standing up in
   * front of his seat), [left, right] 0..1 (gesture()'s and dance()'s `room`): from each
   * shoulder to the nearest of the scenery's shapes near him (colliders.js), out to that side,
   * behind him or in front, at any height (not one across on his other side): 0.12 m or less
   * leaves none, 0.57 m or more all of it. A pillar at his shoulder leaves little, and a cheer
   * goes up instead of out.
   */
  function roomOf(h, pose) {
    const cs = collidersNear(sceneryName, h.x, h.z, CLEAR_NEAR + 0.2);
    if (!cs.length) return FREE;
    const s = solve(pose);
    const hipsX = s.p[BONE_INDEX.hips].x;
    const c = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    return ['L', 'R'].map((side, i) => {
      const sg = i ? -1 : 1;
      const at = s.p[SHOULDER[side]];
      const wx = h.x + at.x * c + at.z * sn, wy = h.y + at.y, wz = h.z - at.x * sn + at.z * c;
      let d = Infinity;
      for (const col of cs) {
        const e = distanceTo(col, wx, wy, wz);
        if (e >= d) continue;
        if (e > 0) {
          // (Where it's nearest, in his own space: across on his other side, it isn't in this arm's way.)
          outOf(col, wx, wy, wz, _rn);
          const lx = (wx - _rn[0] * e - h.x) * c - (wz - _rn[2] * e - h.z) * sn;
          if ((lx - hipsX) * sg < -0.05) continue;
        }
        d = e;
      }
      return THREE.MathUtils.clamp((d - 0.12) / 0.45, 0, 1);
    });
  }
  /**
   * The room he has for his arms now: at home (his seat, or where he sat down on the ground)
   * the room there, seated or standing up in front of it (the less of the two while he gets
   * up, sits down or dances the site's dance up from it); elsewhere all of it (a dancer's
   * place is picked with room for its moves: fits()). keepClear() catches the rest.
   */
  function roomNow(k) {
    const h = k.home;
    if (!h?.room || Math.hypot(k.group.position.x - h.x, k.group.position.z - h.z) > 0.05) return FREE;
    const a = k.act?.kind;
    const up = h.roomUp ?? h.room;
    if (k.mode === 'sit' && !a && !(k.gestureName === 'dance' && !k.danceInPlace)) return h.room;
    if (k.mode === 'stand' && !a) return up;
    return (h.roomLess ??= [Math.min(h.room[0], up[0]), Math.min(h.room[1], up[1])]);
  }
  /**
   * How far up from his seat knight k is in the site's dance (0..1): seated at its ends,
   * standing for its middle, eased in and out as he gets up and sits down.
   */
  function danceUp(k) {
    const t = k.gestureT, T = GESTURE_TIME.dance;
    return smooth(clamp01(Math.min(t, T - t) / RISE_TIME));
  }
  /**
   * Where he stands up to in front of his seat (his own space, the hips over it): a stride
   * in front, or the nearest place there with both feet on level, open ground (not up on
   * the seat's log, not in the fire's pit) so he can walk or dance off from it. Kept with
   * his home.
   */
  function standSpot(h) {
    const z0 = seatFeet(h.h) - 0.03;
    if (!h.seat || !terrain) return { x: 0, z: z0 };
    const fx = rig.pos.footL.x + 0.03, fz = rig.pos.footL.z + 0.02;
    const cs = collidersNear(sceneryName, h.x, h.z, CLEAR_NEAR);
    const upper = upperBody();
    /** Whether his upper body standing at (x, z), the ground `g` up, keeps UPPER_CLEAR from the shapes. */
    const roomAbove = (x, z, g) => {
      for (let j = 0; j < upper.length; j += 3) {
        const w = atHome(h, x + upper[j], z + upper[j + 2]);
        for (const c of cs) if (distanceTo(c, w.x, h.y + g + upper[j + 1], w.z) < UPPER_CLEAR) return false;
      }
      return true;
    };
    /**
     * The ground under a boot there if it's level and open (nothing on it, out of the fire, a
     * hand's breadth from the scenery's shapes: room for the dance's steps), else NaN.
     */
    const level = (x, z) => {
      let lo = Infinity, hi = -Infinity;
      // (Its sole, heel to its pointed toe and either side; the boot, toe aside, out of the fire.)
      for (const [dx, dz] of [[0, 0], [0.07, 0], [-0.07, 0], [0, 0.12], [0, 0.24], [0.06, 0.18], [-0.06, 0.18], [0, -0.06]]) {
        const g = groundUnder(h, x + dx, z + dz);
        const w = atHome(h, x + dx, z + dz);
        if (topUnder(h, x + dx, z + dz) - g > 0.05 || (dz <= 0.12 && Math.hypot(w.x - FIRE.x, w.z - FIRE.z) < 1.05)) return NaN;
        for (const c of cs) if (distanceTo(c, w.x, h.y + g + 0.05, w.z) < STAND_CLEAR || distanceTo(c, w.x, h.y + g + 0.3, w.z) < STAND_CLEAR) return NaN;
        lo = Math.min(lo, g); hi = Math.max(hi, g);
      }
      return hi - lo < 0.05 ? (lo + hi) / 2 : NaN;
    };
    let best = null;
    // (Round the seat's own way aside, if it has one: SEATS standAside.)
    const aside = h.aside ?? 0;
    for (let dz = 0; dz < 0.36; dz += 0.05) {
      for (let dx = 0; dx < 0.41; dx += 0.05) {
        for (const x of dx ? [aside - dx, aside + dx] : [aside]) {
          const score = Math.abs(x - aside) + 0.8 * dz;
          if (best && score >= best.score) continue;
          const gl = level(x + fx, z0 + dz + fz), gr = level(x - fx, z0 + dz + fz);
          // (Both boots level with each other, not up on anything or down a hole; room above.)
          if (Math.abs(gl - gr) < 0.04 && gl > -0.12 && gl < 0.06 && roomAbove(x, z0 + dz, (gl + gr) / 2)) best = { x, z: z0 + dz, score };
        }
      }
    }
    return best ?? { x: 0, z: z0 };
  }
  let upperPts = null;
  /** His upper body's points (UPPER) standing where he's placed, in his own space: x, y, z, … (once). */
  function upperBody() {
    if (upperPts) return upperPts;
    const s = solve(standingPose(newPose()));
    const out = [], v = new THREE.Vector3();
    for (const b of bodyProbes) {
      if (!UPPER.has(b.i)) continue;
      for (let j = 0; j < b.pts.length; j += 3) { v.fromArray(b.pts, j).applyQuaternion(s.q[b.i]).add(s.p[b.i]); out.push(v.x, v.y, v.z); }
    }
    return (upperPts = Float32Array.from(out));
  }
  /** His standing pose in front of his seat (standSpot), over his feet, each on its ground. */
  function standAtSeat(k) {
    standingPose(k.stand);
    const h = k.home;
    const s = h ? (h.stand ??= standSpot(h)) : { x: 0, z: 0 };
    k.stand[0] = s.x;
    k.stand[2] = s.z;
    k.stand[32] += s.x; k.stand[37] -= s.x; // (legs: x is out to each side)
    k.stand[32 + 2] = s.z + 0.02;
    k.stand[37 + 2] = s.z + 0.02;
    if (h) {
      const [fl, fr] = feetAt(k.stand, rig);
      k.stand[33] += groundUnder(h, fl[0], fl[1]);
      k.stand[38] += groundUnder(h, fr[0], fr[1]);
      if (!h.roomUp) { h.roomUp = roomOf(h, k.stand); h.roomLess = null; }
    }
    return k.stand;
  }
  const _feet = new Float64Array(8);
  /** A pose's feet (feetAt: x his left, z ahead) into _feet from `j`: left x, z, right x, z. */
  function feetInto(p, j) {
    const L = rig.pos.footL, R = rig.pos.footR;
    _feet[j] = L.x + p[POSE.legL]; _feet[j + 1] = L.z + p[POSE.legL + 2];
    _feet[j + 2] = R.x - p[POSE.legR]; _feet[j + 3] = R.z + p[POSE.legR + 2];
  }
  /**
   * Whether a foot comes nearer any of the scenery's shapes `cs` than `under` (m) with its joint
   * at (x, y, z) in his own space at his home `h`, level (its points: `foot`; a clump of them
   * that can't come that near passed over whole).
   */
  function footIn(h, foot, x, y, z, cs, under) {
    const c = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    const gx = h.x + x * c + z * sn, gy = h.y + y, gz = h.z - x * sn + z * c;
    const P = foot.pts, C = foot.clumps;
    for (const col of cs) {
      if (distanceTo(col, gx, gy, gz) - col.lip * foot.r >= under) continue;
      for (let q = 0; q < C.length; q += 6) {
        if (distanceTo(col, gx + C[q] * c + C[q + 2] * sn, gy + C[q + 1], gz - C[q] * sn + C[q + 2] * c) - col.lip * C[q + 3] >= under) continue;
        for (let j = C[q + 4], end = C[q + 5]; j < end; j += 3) {
          if (distanceTo(col, gx + P[j] * c + P[j + 2] * sn, gy + P[j + 1], gz - P[j] * sn + P[j + 2] * c) < under) return true;
        }
      }
    }
    return false;
  }
  /**
   * How much higher each foot has to go on its way between where it rests seated and where
   * it stands up to (rise()'s `over`, at OVER_POINTS points along the straight way from the
   * seated end): as much as keeps it OVER_CLEAR clear of the scenery's shapes there (his boot
   * resting up on the ruins' fallen drum steps up and off it, not down through it), and
   * whether either has more than OVER_CROSS to clear (`cross`: he stands up over his feet
   * first, then steps). Kept with him until his seat, his seat pose or where he stands up to
   * changes; null away from a seat.
   */
  function overOf(k) {
    const h = k.home;
    if (!h?.seat) return null;
    const o = (k.over ??= { L: new Float32Array(OVER_POINTS), R: new Float32Array(OVER_POINTS), cross: false, key: new Float64Array(8), home: null });
    // (Each foot's place seated, then standing, as feetAt has them: x his left, z ahead.)
    feetInto(k.sit, 0);
    feetInto(k.stand, 4);
    let same = o.home === h;
    for (let i = 0; i < 8; i++) if (o.key[i] !== _feet[i]) same = false;
    if (same) return o;
    o.key.set(_feet);
    o.home = h;
    const cs = nearOf(k);
    for (let f = 0; f < 2; f++) {
      const out = f ? o.R : o.L;
      out.fill(0);
      if (!cs.length) continue;
      const foot = FEET[f], leg = f ? POSE.legR : POSE.legL;
      const ax = _feet[2 * f], az = _feet[2 * f + 1], bx = _feet[4 + 2 * f], bz = _feet[5 + 2 * f];
      const ay = k.sit[leg + 1] + rig.ankleY, by = k.stand[leg + 1] + rig.ankleY;
      for (let i = 1; i < OVER_POINTS - 1; i++) {
        const e = i / (OVER_POINTS - 1);
        const x = ax + (bx - ax) * e, y = ay + (by - ay) * e, z = az + (bz - az) * e;
        if (!footIn(h, foot, x, y, z, cs, OVER_CLEAR)) continue;
        // (As little higher as clears it, to a centimetre.)
        let lo = 0, hi = OVER_MOST;
        while (hi - lo > 0.01) {
          const m = (lo + hi) / 2;
          if (!footIn(h, foot, x, y + m, z, cs, OVER_CLEAR)) hi = m;
          else lo = m;
        }
        out[i] = hi;
      }
    }
    // (Something to step over on the way, not just a step down: he stands up first, rise().)
    o.cross = Math.max(...o.L, ...o.R) > OVER_CROSS;
    return o;
  }

  // --- presence (the dissolve) --------------------------------------------------------------------
  function setGhost(k, on) {
    if (k.ghost === on) return;
    k.ghost = on;
    for (const mesh of k.meshes) { mesh.layers.set(on ? layerGhost : layerSolid); mesh.castShadow = castShadows && !on; }
    shadowDirty = true;
  }
  /** Shown or hidden (his group), and the shadow redrawn for it. */
  function setShown(k, on) {
    if (k.group.visible !== on) shadowDirty = true;
    k.group.visible = on;
  }
  /**
   * Gone: hidden, solid again for next time, nothing left of his dance; a helmet he was
   * changing into is his at once (as for any knight who isn't there).
   */
  function vanish(k) {
    clearActs(k);
    k.present = false;
    k.fade = null;
    endForge(k);
    setShown(k, false);
    if (k.swap) { const s = k.swap; k.swap = null; wear(k, s.to); s.resolve(true); }
    k.gestureName = null;
    setGhost(k, false);
    setHelmGhost(k, false);
    for (const m of [k.bodyMat, k.helmMat]) m.userData.uniforms.uDissolve.value = 0;
    k.dancing = k.nextDance = k.danceAt = null;
  }
  /** Burning away for good (not just going somewhere else by ember), or sent off by the forge. */
  const leaving = (k) => (!!k.fade && k.fade.to >= 1 && !k.fade.done) || k.forging === 'out';
  /** The cast is as many as the highest knight who's here and staying (setCast sets it outright). */
  function recount() {
    cast = 0;
    knights.forEach((k, i) => { if (k.present && !leaving(k)) cast = i + 1; });
  }
  /** Burn away (to 1) or form (to 0) over FADE_TIME, with an ember edge; then `done`. */
  function fade(k, to, done = null) {
    const from = k.fade ? k.fade.v : to === 0 ? 1 : 0;
    k.fade = { v: from, to, done };
    for (const mat of [k.bodyMat, k.helmMat]) {
      mat.userData.uniforms.uFlip.value = to === 0 ? 1 : 0; // forms from the feet up; burns from the feet up
      mat.userData.uniforms.uDissolve.value = from;
    }
    setShown(k, true);
    setGhost(k, true);
  }
  function stepFade(k, dt) {
    const f = k.fade;
    if (!f) return;
    f.v += Math.sign(f.to - f.v) * Math.min(Math.abs(f.to - f.v), dt / FADE_TIME);
    for (const mat of [k.bodyMat, k.helmMat]) mat.userData.uniforms.uDissolve.value = f.v;
    if (Math.random() < 0.8) sparksFrom(k, 2);
    if (f.v !== f.to) return;
    k.fade = null;
    // (Gone, unless he's only going somewhere else: `done` brings him back.)
    if (f.to >= 1 && !f.done) vanish(k);
    else if (f.to < 1) { setGhost(k, false); flash(k, 0.7); }
    f.done?.();
  }
  // A flash over him (formed, or a new helmet), fading: in his own tones (the armor's uLift),
  // never a wash of the edge color (that turns him into a flat cut-out of one color).
  function flash(k, amount, helmOnly = false) { k.glow = { v: amount, helmOnly }; }

  // --- summoned and sent off by the forge (the site's knight: knightArrival.js) ----------------
  // summon(i, { forge: true }) seats him burnt away on the ghost layer and leaves his dissolve
  // to the forge (forgeRun.js), which builds him from forgeSubject(i): his posed body, skinned
  // here on the CPU. dismiss(i, { forge: true }) hands him over the other way. forged(i) ends
  // it: whole and solid again, or gone. Meanwhile his helmet burns with his body (its dissolve
  // runs over his whole height, not the helmet's own) and nothing else touches his dissolve.
  function beginForge(k, dir) {
    if (k.swap) { const s = k.swap; k.swap = null; wear(k, s.to); s.resolve(true); }
    k.fade = null;
    k.glow = null;
    for (const m of [k.bodyMat, k.helmMat]) m.userData.uniforms.uLift.value = 0;
    k.forging = dir;
    k.helmMat.userData.uniforms.uSpan.value.set(T.bodySpan[0], T.bodySpan[1]);
    setHelmGhost(k, false);
  }
  function endForge(k) {
    if (!k.forging) return;
    k.forging = null;
    k.helmMat.userData.uniforms.uSpan.value.set(T.helmSpan[0], T.helmSpan[1]);
    for (const m of [k.bodyMat, k.helmMat]) { m.userData.uniforms.uFrost && (m.userData.uniforms.uFrost.value = 0); }
  }
  /**
   * Knight i as the forge sees him (forgeRun.js ForgeSubject), posed as he is now: `n` points
   * spread over his body and helmet by area (skinned on the CPU), their heights up him (the
   * armor dissolve's own: rest height over his body's span, so particles shed and land where
   * his burning edge is), his silhouette from the front, and his dissolve's uniforms (both
   * materials at once).
   */
  function forgeSubject(i, n) {
    const k = knights[i];
    settle(k);
    k.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(k.group.matrixWorld).invert();
    const M = k.bones.map((b, j) => new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld).multiply(boneInverses[j]));
    const geos = [T.bodyGeo, T.helmGeos[HELMETS.indexOf(k.helmet)]].filter((g) => g?.attributes.position);
    let count = 0;
    for (const g of geos) count += g.attributes.position.count;
    const posed = new Float32Array(count * 3);
    const restY = new Float32Array(count);
    const v = new THREE.Vector3();
    let o = 0;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const g of geos) {
      const p = g.attributes.position, s = g.attributes.skinIndex;
      for (let j = 0; j < p.count; j++, o++) {
        v.fromBufferAttribute(p, j);
        restY[o] = v.y;
        v.applyMatrix4(M[s.getX(j)]);
        posed[o * 3] = v.x; posed[o * 3 + 1] = v.y; posed[o * 3 + 2] = v.z;
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
    }
    // (His own axis: the middle of him from above, so the helix winds round all of him.)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let j = 0; j < count; j++) { posed[j * 3] -= cx; posed[j * 3 + 2] -= cz; }
    const [lo, hi] = T.bodySpan;
    const tris = count / 3;
    const cum = new Float32Array(tris);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let total = 0;
    for (let t = 0; t < tris; t++) {
      a.fromArray(posed, t * 9); b.fromArray(posed, t * 9 + 3); c.fromArray(posed, t * 9 + 6);
      total += b.sub(a).cross(c.sub(a)).length() / 2;
      cum[t] = total;
    }
    const samples = new Float32Array(n * 3);
    const heights = new Float32Array(n);
    for (let s = 0; s < n; s++) {
      const r = Math.random() * total;
      let l = 0, h = tris - 1;
      while (l < h) { const mid = (l + h) >> 1; if (cum[mid] < r) l = mid + 1; else h = mid; }
      let u = Math.random(), w = Math.random();
      if (u + w > 1) { u = 1 - u; w = 1 - w; }
      for (let d = 0; d < 3; d++) samples[s * 3 + d] = posed[l * 9 + d] + (posed[l * 9 + 3 + d] - posed[l * 9 + d]) * u + (posed[l * 9 + 6 + d] - posed[l * 9 + d]) * w;
      const y = restY[l * 3] + (restY[l * 3 + 1] - restY[l * 3]) * u + (restY[l * 3 + 2] - restY[l * 3]) * w;
      heights[s] = THREE.MathUtils.clamp((y - lo) / (hi - lo), 0, 1);
    }
    const frame = new THREE.Matrix4();
    const offset = new THREE.Matrix4().makeTranslation(cx, 0, cz);
    const matrixWorld = () => frame.multiplyMatrices(k.group.matrixWorld, offset);
    let silhouette = null;
    const A = k.bodyMat.userData.uniforms, B = k.helmMat.userData.uniforms;
    const both = (name, k = 1) => ({ get value() { return A[name].value / k; }, set value(x) { A[name].value = x * k; B[name].value = x * k; } });
    const bothColor = (name) => ({ value: { copy(x) { A[name].value.copy(x); B[name].value.copy(x); return A[name].value; } } });
    // (The armor's frost glaze if it has one; otherwise the frost washes him in the edge's
    // pale tone, the dissolve's glow.)
    let frost = 0;
    const frosty = A.uFrost ? both('uFrost') : { get value() { return frost; }, set value(x) { frost = x; A.uGlow.value = B.uGlow.value = x * 0.85; } };
    const head = new THREE.Vector3();
    return {
      get matrixWorld() { return matrixWorld(); },
      samples, heights,
      span: new THREE.Vector2(lo, hi),
      silhouette: () => (silhouette ??= weaponSilhouette(new Map([[{ geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(posed, 3)) }, new THREE.Matrix4()]]), 0.02)),
      helixWide: (s) => 0.42 + 0.16 * Math.sin(Math.PI * s),
      formsUp: true, // (from his boots up, whatever the element)
      formGlow: false, // (in his own steel behind the burning edge: see uGlow)
      cloud: 0.5,
      cocoon: { n: 10, size: 0.14, spread: 0.1, out: 0.34 },
      strikePoint(s, out) {
        // (High up: the bolt into his helm; lower: into his chest.)
        const bone = s > 0.8 ? k.bones[BONE_INDEX.head] : k.bones[BONE_INDEX.chest];
        bone.getWorldPosition(head);
        return out.copy(head).setY(head.y + (s > 0.8 ? 0.3 : 0));
      },
      ground(rng, out) {
        const ang = rng() * Math.PI * 2, r = 0.45 + rng() * 0.35;
        return out.set(Math.cos(ang) * r, 0.05, Math.sin(ang) * r).applyMatrix4(matrixWorld());
      },
      uniforms: {
        // (He never glows in the edge's color: a blade forms glowing, but a whole knight washed
        // in it reads as a flat cut-out, not as him. He forms in his own steel behind the
        // burning edge, each of the lightning's jumps flashing him up his own ramp (uLift, as a
        // new helmet does); formed, the fire's reflection sweeps him: scene.js.)
        uDissolve: both('uDissolve'), uGlow: both('uGlow', 0.5), uFlip: both('uFlip'), uLift: both('uLift'),
        uEdge: bothColor('uEdge'), uEdgeHot: bothColor('uEdgeHot'),
        uFrost: frosty, uFrostColor: A.uFrostColor ? bothColor('uFrostColor') : { value: new THREE.Color() },
      },
      // (A ghost casts no shadow: the lightning's strobe needn't redraw it.)
      show(on) { if (k.ghost) k.group.visible = on; else setShown(k, on); },
      ghost(on) { setGhost(k, on); },
    };
  }
  /**
   * Whatever knight k is changing into (a helmet, a style) is his at once: the forge takes
   * him as he'll be drawn (sent off mid-swap, he burns away whole in the new one).
   */
  function settle(k) {
    if (k.swap) {
      const s = k.swap;
      k.swap = null;
      wear(k, s.to);
      setHelmGhost(k, false);
      k.helmMat.userData.uniforms.uFlip.value = k.bodyMat.userData.uniforms.uFlip.value;
      s.resolve(true);
    }
    if (restyle?.ks.includes(k)) endRestyle(true);
  }
  /** The forge is done with knight i: whole and solid (summoned), or gone (dismissed). */
  function forged(i) {
    if (!valid(i)) return false;
    const k = knights[i];
    if (!k.forging) return false;
    if (k.forging === 'out') { vanish(k); recount(); return true; }
    const glow = k.bodyMat.userData.uniforms.uGlow.value;
    endForge(k);
    k.group.visible = true;
    setShown(k, true);
    setGhost(k, false);
    // (The forge's wash ends as he stands whole; what's left of it flashes in his own tones.)
    for (const m of [k.bodyMat, k.helmMat]) { m.userData.uniforms.uDissolve.value = 0; m.userData.uniforms.uFlip.value = 0; m.userData.uniforms.uGlow.value = 0; }
    if (glow > 0.02) flash(k, Math.min(1, glow));
    shadowDirty = true;
    return true;
  }

  const sparkAt = new THREE.Vector3();
  function sparksFrom(k, n, bone = null) {
    if (!onSparks || reducedMotion || !k.group.visible) return;
    const list = [];
    for (let j = 0; j < n; j++) {
      const b = bone ?? Math.floor(Math.random() * BONES.length);
      k.bones[b].getWorldPosition(sparkAt);
      list.push({ x: sparkAt.x + (Math.random() - 0.5) * 0.15, y: sparkAt.y + (Math.random() - 0.3) * 0.12, z: sparkAt.z + (Math.random() - 0.5) * 0.15, vx: (Math.random() - 0.5) * 0.5, vy: 0.5 + Math.random() * 0.9, vz: (Math.random() - 0.5) * 0.5 });
    }
    onSparks(list);
  }

  // --- the style (knightStyles.js) ------------------------------------------------------------------
  // How the armor draws him (armor.js setStyle) and which model he's built from. Another
  // model's template sits on this rig: each piece moved from its joint's rest place there to
  // this one's (the rigs have no rest rotations). Swapping the style on knights who are here
  // burns them away from the top and forms them again in the new one (~1.2 s, the helmet
  // swap's dissolve over the whole body), all at once; knights who aren't here just change.
  const RESTYLE_BURN = 0.45;
  const RESTYLE_GAP = 0.1;
  const RESTYLE_TIME = 1.2;
  let restyle = null; // { t, name, T, switched, flashed, resolve, ks }
  /** The template for a model's scene (null: the knight's own), built once (or beforehand: adopt). */
  function templateOf(root) {
    if (!root) return T0;
    if (templates.has(root)) return templates.get(root);
    return adopt(buildTemplate(root));
  }
  /** Another model's template (templateSteps), onto this rig: each piece moved to this one's joints. */
  function adopt(t) {
    if (templates.has(t.root)) return templates.get(t.root);
    for (const g of [t.bodyGeo, ...t.helmGeos]) {
      const p = g.attributes.position, si = g.attributes.skinIndex;
      if (!p || !si) continue;
      for (let i = 0; i < p.count; i++) {
        const b = ALL_BONES[si.getX(i)];
        const from = t.restPos[b], to = T0.restPos[b];
        p.setXYZ(i, p.getX(i) + to[0] - from[0], p.getY(i) + to[1] - from[1], p.getZ(i) + to[2] - from[2]);
      }
      p.needsUpdate = true;
      g.computeBoundingSphere();
    }
    const out = { ...T0, root: t.root, bodyGeo: t.bodyGeo, helmGeos: t.helmGeos, bodySpan: t.bodySpan, helmSpan: t.helmSpan };
    templates.set(t.root, out);
    return out;
  }
  /** The style's shader now, and its model's geometry on every knight. */
  function switchStyle(name, next) {
    armor.setStyle?.(name);
    if (next === T) return;
    T = next;
    for (const k of knights) {
      k.body.geometry = T.bodyGeo;
      HELMETS.forEach((h, j) => { k.helms[h].geometry = T.helmGeos[j]; });
      k.bodyMat.userData.uniforms.uSpan.value.set(T.bodySpan[0], T.bodySpan[1]);
      const hs = k.forging || restyle?.ks.includes(k) ? T.bodySpan : T.helmSpan;
      k.helmMat.userData.uniforms.uSpan.value.set(hs[0], hs[1]);
    }
    shadowDirty = true;
  }
  /** The swap ends (`ok`: it ran its course): the new style in place, each knight whole again. */
  function endRestyle(ok) {
    const r = restyle;
    if (!r) return;
    restyle = null;
    if (!r.switched) switchStyle(r.name, r.T);
    for (const k of r.ks) {
      k.helmMat.userData.uniforms.uSpan.value.set(...(k.forging ? T.bodySpan : T.helmSpan));
      if (k.fade || k.forging || !k.present) continue;
      for (const m of [k.bodyMat, k.helmMat]) m.userData.uniforms.uDissolve.value = 0;
      setGhost(k, false);
      setHelmGhost(k, false);
    }
    r.resolve(ok);
  }
  /**
   * The style `name` (armor.js reads it), built from the model `model` (its loaded scene;
   * null: the knight's own). Resolves true once it shows (false if another took over).
   */
  function setStyle(name, { model = null, instant = false } = {}) {
    const next = templateOf(model);
    if (restyle) endRestyle(false);
    const ks = knights.filter((k) => k.present && !k.fade && !k.forging);
    if (instant || reducedMotion || !ks.length || (armor.style === name && next === T)) {
      switchStyle(name, next);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      restyle = { t: 0, name, T: next, switched: false, flashed: false, resolve, ks };
      for (const k of ks) {
        // (A helmet swap in the way is done at once: the whole of him burns now.)
        if (k.swap) { const s = k.swap; k.swap = null; wear(k, s.to); s.resolve(true); }
        k.helmMat.userData.uniforms.uSpan.value.set(T.bodySpan[0], T.bodySpan[1]);
        setGhost(k, true);
      }
    });
  }
  function stepRestyle(dt) {
    const r = restyle;
    if (!r) return;
    r.t += dt;
    const t = r.t;
    const burning = t < RESTYLE_BURN;
    const d = burning ? t / RESTYLE_BURN : t < RESTYLE_BURN + RESTYLE_GAP ? 1 : Math.max(0, 1 - (t - RESTYLE_BURN - RESTYLE_GAP) / RESTYLE_BURN);
    if (!r.switched && !burning) {
      r.switched = true;
      switchStyle(r.name, r.T);
    }
    const formed = t >= 2 * RESTYLE_BURN + RESTYLE_GAP;
    for (const k of r.ks) {
      if (k.fade || k.forging || !k.present) continue;
      for (const m of [k.bodyMat, k.helmMat]) {
        m.userData.uniforms.uFlip.value = burning ? 1 : 0;
        m.userData.uniforms.uDissolve.value = formed ? 0 : d;
      }
      if (!formed && Math.random() < 0.6) sparksFrom(k, 1);
      if (formed && !r.flashed) { setGhost(k, false); setHelmGhost(k, false); flash(k, 0.9); sparksFrom(k, 14); }
    }
    if (formed) r.flashed = true;
    if (t >= RESTYLE_TIME) endRestyle(true);
  }

  // --- helmets --------------------------------------------------------------------------------------
  /** Only the helmet he wears is drawn. */
  function wear(k, name) {
    if (k.helmet !== name) shadowDirty = true;
    k.helmet = name;
    for (const h of HELMETS) k.helms[h].visible = h === name;
  }
  function setHelmetOf(k, name, instant) {
    if (!HELMETS.includes(name)) return Promise.resolve(false);
    if (k.swap) { k.swap.resolve(false); k.swap = null; setHelmGhost(k, false); }
    if (name === k.helmet && !k.swap) return Promise.resolve(true);
    if (instant || reducedMotion || !k.present || k.fade) { wear(k, name); return Promise.resolve(true); }
    return new Promise((resolve) => {
      k.swap = { t: 0, from: k.helmet, to: name, switched: false, resolve };
      // (Dancing, he changes it without stopping: the helm burns and forms on its own.)
      if (k.gestureName !== 'dance') { k.gestureName = 'helm'; k.gestureT = 0; }
    });
  }
  function setHelmGhost(k, on) {
    const cast = castShadows && !on && !k.ghost;
    for (const h of HELMETS) {
      const m = k.helms[h];
      m.layers.set(on || k.ghost ? layerGhost : layerSolid);
      if (m.castShadow !== cast && m.visible) shadowDirty = true;
      m.castShadow = cast;
    }
    if (!on) k.helmMat.userData.uniforms.uDissolve.value = k.fade ? k.fade.v : 0;
  }
  function stepSwap(k, dt) {
    const s = k.swap;
    if (!s) return;
    s.t += dt;
    const u = k.helmMat.userData.uniforms;
    if (s.t < 0.3) return;
    if (s.t < 1.2) setHelmGhost(k, true);
    if (s.t < 0.75) { u.uFlip.value = 1; u.uDissolve.value = (s.t - 0.3) / 0.45; if (Math.random() < 0.6) sparksFrom(k, 1, BONE_INDEX.head); return; }
    if (!s.switched) { s.switched = true; wear(k, s.to); u.uFlip.value = 0; }
    if (s.t < 1.2) { u.uDissolve.value = 1 - (s.t - 0.75) / 0.45; return; }
    if (!s.puffed) { s.puffed = true; u.uDissolve.value = 0; setHelmGhost(k, false); flash(k, 0.9, true); sparksFrom(k, 14, BONE_INDEX.head); }
    if (s.t >= HELM_TIME) { k.swap = null; s.resolve(true); }
  }

  // --- actions ----------------------------------------------------------------------------------------
  // A knight runs one action at a time (getting up, walking, turning, sitting down, settling
  // onto his seat, starting a dance); what he was asked to do next waits in his queue.
  function startCrossfade(k, dur = CROSSFADE) { k.from.set(k.pose); k.blend = 0; k.blendRate = 1 / dur; }
  function run(k) {
    while (!k.act && k.queue.length) {
      const next = k.queue.shift();
      k.act = next.start?.() === false ? null : next;
      if (k.act) k.act.t = 0;
    }
  }
  function enqueue(k, ...acts) { k.queue.push(...acts); run(k); }
  function clearActs(k) { k.act = null; k.queue.length = 0; }
  /** Asked for something new halfway through an ember walk: he forms again where he is. */
  function stayPut(k) { if (k.fade?.done) fade(k, 0); }

  const act = {
    rise: (k) => ({ kind: 'rise', dur: RISE_TIME, start: () => { if (k.mode !== 'sit') return false; standAtSeat(k); }, end: () => { k.mode = 'stand'; } }),
    lower: (k) => ({ kind: 'lower', dur: RISE_TIME, start: () => { if (k.mode === 'sit') return false; }, end: () => { k.mode = 'sit'; k.dancing = null; } }),
    /**
     * Walk to x, z (knightPlaces.js planWalk): straight, or round the fire when the straight
     * way passes it; too far or blocked, he burns away and forms there.
     */
    go: (k, x, z) => ({
      kind: 'walk', dur: 0,
      start() {
        reroot(k);
        const p = k.group.position;
        if (Math.hypot(x - p.x, z - p.z) < 0.05) return false;
        const path = reducedMotion ? null : planWalk(p, { x, z }, { blocked });
        this.teleport = !path;
        this.from = p.clone();
        this.to = new THREE.Vector3(x, Math.max(0, heightAt(x, z)), z);
        // (The walk's corners, each with how far along it he reaches it.)
        this.pts = [this.from];
        this.at = [0];
        for (const q of path ?? []) {
          const prev = this.pts[this.pts.length - 1];
          this.pts.push(new THREE.Vector3(q.x, Math.max(0, heightAt(q.x, q.z)), q.z));
          this.at.push(this.at[this.at.length - 1] + Math.hypot(q.x - prev.x, q.z - prev.z));
        }
        this.length = this.at[this.at.length - 1];
        this.dur = this.teleport ? 2 * FADE_TIME + 0.05 : this.length / WALK_SPEED;
        this.heading = this.teleport ? k.yaw : Math.atan2(this.pts[1].x - p.x, this.pts[1].z - p.z);
        k.mode = 'stand';
        if (this.teleport) fade(k, 1, () => { k.group.position.copy(this.to); fade(k, 0); });
      },
      /** Where he is `s` m along the walk (into `out`), and which way it goes there. */
      along(s, out) {
        let i = 1;
        while (i < this.pts.length - 1 && this.at[i] < s) i++;
        const a = this.pts[i - 1], b = this.pts[i];
        const u = Math.min(1, Math.max(0, (s - this.at[i - 1]) / Math.max(1e-6, this.at[i] - this.at[i - 1])));
        out.lerpVectors(a, b, u);
        this.heading = Math.atan2(b.x - a.x, b.z - a.z);
        return out;
      },
      end() { if (!this.teleport) k.group.position.copy(this.to); },
    }),
    turn: (k, yaw) => ({
      kind: 'turn', dur: 0,
      start() {
        reroot(k);
        let d = (yaw - k.yaw) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 0.08) { k.yaw = yaw; return false; }
        this.from = k.yaw; this.d = d; this.dur = Math.abs(d) / TURN_SPEED + 0.15;
      },
      end() { k.yaw = this.from + this.d; },
    }),
  };
  /** Move where he's placed without moving him: his pose takes up the difference. */
  function shiftPlace(k, to) {
    const d = new THREE.Vector3().subVectors(k.group.position, to).applyAxisAngle(Y_AXIS, -k.yaw);
    k.group.position.copy(to);
    for (const p of [k.pose, k.from, k.work]) {
      p[0] += d.x; p[1] += d.y; p[2] += d.z;
      p[32] += d.x; p[33] += d.y; p[34] += d.z; // (legs: x is outward, so the right one's goes the other way)
      p[37] -= d.x; p[38] += d.y; p[39] += d.z;
    }
  }
  /**
   * Pose `p` moved by `sign` times how far knight k's standing pose (k.stand) is from
   * standing where he's placed (standingPose): his root and his feet, each on its ground.
   */
  function standOffset(p, k, sign) {
    for (const i of STAND_OFFSET) p[i] += sign * (k.stand[i] - STANDING[i]);
  }
  /** Standing up in front of his seat, his pose is offset from where he's placed: move the place under him instead. */
  function reroot(k) {
    const x = k.stand[0], z = k.stand[2];
    if (Math.abs(x) < 1e-4 && Math.abs(z) < 1e-4) return;
    const to = new THREE.Vector3(x, 0, z).applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position);
    to.y = Math.max(0, heightAt(to.x, to.z));
    shiftPlace(k, to);
    standingPose(k.stand);
  }

  // --- evaluating a pose ------------------------------------------------------------------------------
  const lookDir = new THREE.Vector3();
  const headAt = new THREE.Vector3();
  const invQ = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  /** The pose now (into k.work), and whether it's real motion (the shadow's worth redrawing). */
  function evaluate(k) {
    const p = k.work;
    let big = false;
    const a = k.act;
    const seated = k.mode === 'sit';
    const dt = Math.min(0.5, Math.max(0, k.clock - (k.evalAt ?? k.clock)));
    k.evalAt = k.clock;
    if (a?.kind === 'rise' || a?.kind === 'lower') {
      rise(p, k.sit, k.stand, a.t, a.kind === 'lower', overOf(k));
      big = true;
    } else if (a?.kind === 'walk' && !a.teleport) {
      const moved = Math.min(a.length, a.t * WALK_SPEED);
      walk(p, standingPose(k.stand), moved / 0.56, 0.28);
      big = true;
    } else if (a?.kind === 'turn') {
      walk(p, standingPose(k.stand), a.t * 2.2, 0);
      big = true;
    } else if (k.dancing && !a) {
      const d = k.dancing;
      p.set(d.seated ? k.sit : standingPose(k.stand));
      const b = beatNow() - d.offset;
      // (The show sets the energy every beat: it eases from beat to beat instead of stepping.)
      k.energy = k.energy == null ? d.energy : k.energy + (d.energy - k.energy) * Math.min(1, dt * 2.5);
      dance(p, d.move, b, { period: beat.period, energy: k.energy, seed: d.seed, seated: d.seated, room: roomNow(k) });
      big = true;
    } else {
      k.energy = null;
      p.set(seated ? k.sit : k.stand);
      if (!reducedMotion) idle(p, k.clock, k.seed, seated, (k.seatPose ?? seatStyle) === 'watchful' ? 1 : 0);
    }
    // A gesture over whatever he's doing (the site's dance faces the front: the cameras;
    // with no headroom when it started, he dances it in his seat).
    if (k.gestureName) {
      const inPlace = k.gestureName === 'dance' && k.danceInPlace;
      const T = inPlace ? DANCE_SEATED_TIME : GESTURE_TIME[k.gestureName] ?? 1.5;
      if (k.gestureT >= T) k.gestureName = null;
      else {
        const rising = k.gestureName === 'dance' && seated && !inPlace;
        const front = facingFor(k.group.position.x, k.group.position.z, 'front') - k.yaw;
        // (Up in front of his seat, his standing pose is offset from where he's placed (reroot):
        // the gesture is made over it moved back under him, then moved out again, so one
        // that plants his feet plants them where he stands, not back at his seat.)
        const offset = !seated && !k.dancing?.seated && k.gestureName !== 'dance';
        if (offset) standOffset(p, k, -1);
        gesture(p, k.gestureName, k.gestureT, seated || !!k.dancing?.seated, k.seed, {
          turn: rising ? Math.atan2(Math.sin(front), Math.cos(front)) : 0,
          // (Up from his seat to the level spot in front of it; the room he has for his arms.)
          stand: rising && k.home ? standAtSeat(k) : null,
          over: rising ? overOf(k) : null,
          room: roomNow(k),
          inPlace,
        });
        if (offset) standOffset(p, k, 1);
        big = true;
      }
    }
    // Reactions.
    if (!reducedMotion) {
      const t = k.clock;
      if (t - k.react.flinch < 1.4) { flinch(p, t - k.react.flinch, k.react.flinchK, seated); big = true; }
      if (t - k.react.stoke < 1.3) { shield(p, t - k.react.stoke, 1, seated); big = true; }
      if (t - k.react.hop >= 0 && t - k.react.hop < 0.6) { hop(p, t - k.react.hop, 1, seated); big = true; }
    }
    // Watching something: he straightens up and turns to it. Hovered (seated, at rest), he
    // sits up a little to look at you.
    const hover = hovered === k.index && seated && !k.gestureName && !k.dancing && !a ? 1 : 0;
    k.hoverUp = (k.hoverUp ?? 0) + (hover - (k.hoverUp ?? 0)) * Math.min(1, dt * 4);
    const up = Math.max(k.attn, 0.45 * k.hoverUp);
    if (up > 0.01) attend(p, up, seated);
    if (k.attnMoving || Math.abs(hover - k.hoverUp) > 0.03) big = true;
    if (k.lookW > 0.01) look(p, k.lookYaw, k.lookPitch, k.lookW);
    // Crossfading from where he was.
    if (k.blend < 1) { lerpPose(p, k.from, p, k.blend); big = true; }
    return big;
  }
  // --- the plates' spring ---------------------------------------------------------------------------
  const sq = new THREE.Quaternion();
  const tq = new THREE.Quaternion();
  const dq = new THREE.Quaternion();
  const ev = new THREE.Vector3();
  const vt = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const rel = new THREE.Vector3();
  /** A unit quaternion as a rotation vector (axis × angle, the short way round), into `out`. */
  function logQ(r, out) {
    const sgn = r.w < 0 ? -1 : 1;
    const half = Math.acos(Math.min(1, sgn * r.w)), sn = Math.sin(half);
    return sn < 1e-9 ? out.set(0, 0, 0) : out.set(r.x, r.y, r.z).multiplyScalar((sgn * 2 * half) / sn);
  }
  /** A rotation vector as a quaternion, into `out`. */
  function expQ(v, out) {
    const a = v.length();
    return a < 1e-9 ? out.identity() : out.setFromAxisAngle(tv.copy(v).divideScalar(a), a);
  }
  /**
   * The plates (SPRUNG) swung one pose step toward where the solver put them (`s.q`, turned
   * from their parents), written back into `s.q`; `snap` puts them there at once (he was just
   * placed somewhere, or sits still). The spring damps against how fast the pose itself
   * turns, so a plate moving steadily with him keeps up and only a stop or a jolt swings it.
   * Returns whether any is still swinging (its shadow wants redrawing).
   */
  function springPlates(k, s, snap) {
    const st = k.spring ??= SPRUNG.map(() => ({ q: new THREE.Quaternion(), v: new THREE.Vector3(), pose: new THREE.Quaternion(), set: false }));
    const h = 1 / STEP_FPS / SPRING.substeps;
    const w0 = 2 * Math.PI * SPRING.hz;
    let swinging = false;
    SPRUNG.forEach(([bone, par, max], j) => {
      const i = BONE_INDEX[bone], pi = BONE_INDEX[par];
      const x = st[j];
      tq.copy(s.q[pi]).invert().multiply(s.q[i]);
      if (snap || !x.set) { x.q.copy(tq); x.pose.copy(tq); x.v.set(0, 0, 0); x.set = true; return; }
      logQ(dq.copy(tq).multiply(sq.copy(x.pose).invert()), vt).multiplyScalar(STEP_FPS);
      x.pose.copy(tq);
      for (let n = 0; n < SPRING.substeps; n++) {
        logQ(dq.copy(x.q).multiply(sq.copy(tq).invert()), ev);
        x.v.addScaledVector(ev, -w0 * w0 * h).addScaledVector(rel.copy(x.v).sub(vt), -2 * SPRING.damp * w0 * h);
        x.q.premultiply(expQ(rel.copy(x.v).multiplyScalar(h), dq)).normalize();
      }
      // (Never further than `max` from the pose: the strap holds.)
      const off = logQ(dq.copy(x.q).multiply(sq.copy(tq).invert()), ev).length();
      if (off > max) {
        x.q.copy(expQ(ev.multiplyScalar(max / off), dq)).multiply(tq);
        const out = x.v.dot(ev.normalize());
        if (out > 0) x.v.addScaledVector(ev, -out);
      }
      if (off > 0.014 || rel.copy(x.v).sub(vt).length() > 0.3) swinging = true;
      s.q[i].copy(s.q[pi]).multiply(x.q);
    });
    return swinging;
  }

  // --- keeping his arms out of the scenery -----------------------------------------------------------
  /** The scenery's shapes near where knight k stands (kept until he moves). */
  function nearOf(k) {
    const { x, z } = k.group.position;
    const n = k.near;
    if (n && n.scenery === sceneryName && Math.abs(n.x - x) < 0.05 && Math.abs(n.z - z) < 0.05) return n.list;
    k.near = { scenery: sceneryName, x, z, list: collidersNear(sceneryName, x, z, CLEAR_NEAR) };
    return k.near.list;
  }
  // (Where the knight being checked stands, and which way he's turned: place().)
  let gx = 0, gy = 0, gz = 0, gc = 1, gs = 0;
  /** Check knight k where he stands now (within(), nearestIn()). */
  function place(k) {
    ({ x: gx, y: gy, z: gz } = k.group.position);
    gc = Math.cos(k.yaw);
    gs = Math.sin(k.yaw);
  }
  // (Piece i of a solved pose in the world, where he stands: a point of it (its own space) at
  // x, y, z goes to m[0]x + m[1]y + m[2]z + m[3], m[4]x + … + m[7], m[8]x + … + m[11]; reused.)
  const _m = new Float64Array(12);
  /** Piece i of a solved pose (`s`) into _m, where he stands (place()). */
  function frameOf(s, i) {
    const { x, y, z, w } = s.q[i], o = s.p[i];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    // (The piece's turn, as three.js makes it from a quaternion, then his.)
    const r00 = 1 - (yy + zz), r01 = xy - wz, r02 = xz + wy;
    const r10 = xy + wz, r11 = 1 - (xx + zz), r12 = yz - wx;
    const r20 = xz - wy, r21 = yz + wx, r22 = 1 - (xx + yy);
    _m[0] = gc * r00 + gs * r20; _m[1] = gc * r01 + gs * r21; _m[2] = gc * r02 + gs * r22; _m[3] = gx + o.x * gc + o.z * gs;
    _m[4] = r10; _m[5] = r11; _m[6] = r12; _m[7] = gy + o.y;
    _m[8] = gc * r20 - gs * r00; _m[9] = gc * r21 - gs * r01; _m[10] = gc * r22 - gs * r02; _m[11] = gz - o.x * gs + o.z * gc;
  }
  const _shapes = [];
  /**
   * The shapes in `cs` that piece i of a solved pose (`s`; its points out to `r` from its joint)
   * may come nearer than `under` (m), where he stands (place()): reused. _m takes the piece's
   * place (frameOf). (A shape's distance changes no faster than its `lip` a metre: colliders.js.)
   */
  function within(s, i, r, under, cs) {
    frameOf(s, i);
    _shapes.length = 0;
    for (const col of cs) if (distanceTo(col, _m[3], _m[7], _m[11]) - col.lip * r < under) _shapes.push(col);
    return _shapes;
  }
  // (The nearest point nearestIn() found: how near, the shape, where (world), and which point.)
  const found = { d: 0, col: null, x: 0, y: 0, z: 0, j: 0 };
  /**
   * The nearest any of a piece's points (`pc`, placed by _m: within()) comes to `shapes`, if
   * that's nearer than `under` (m): into `found` (found.col null if none comes that near). A clump
   * of them whose ball can't come that near is passed over whole.
   */
  function nearestIn(pc, shapes, under) {
    found.d = under;
    found.col = null;
    const m = _m, P = pc.pts, C = pc.clumps;
    for (let q = 0; q < C.length; q += 6) {
      const ax = C[q], ay = C[q + 1], az = C[q + 2];
      const cx = m[0] * ax + m[1] * ay + m[2] * az + m[3], cy = m[4] * ax + m[5] * ay + m[6] * az + m[7], cz = m[8] * ax + m[9] * ay + m[10] * az + m[11];
      for (const col of shapes) {
        if (distanceTo(col, cx, cy, cz) - col.lip * C[q + 3] >= found.d) continue;
        for (let j = C[q + 4], end = C[q + 5]; j < end; j += 3) {
          const px = P[j], py = P[j + 1], pz = P[j + 2];
          const x = m[0] * px + m[1] * py + m[2] * pz + m[3], y = m[4] * px + m[5] * py + m[6] * pz + m[7], z = m[8] * px + m[9] * py + m[10] * pz + m[11];
          const d = distanceTo(col, x, y, z);
          if (d >= found.d) continue;
          found.d = d; found.col = col; found.x = x; found.y = y; found.z = z; found.j = j;
        }
      }
    }
    return found;
  }
  const _kn = new THREE.Vector3();
  const _kx = new THREE.Vector3();
  const _karm = new THREE.Vector3();
  const WAYS = [_kn, _kx]; // (keepClear's two ways to turn an arm: out of the shape, in to his middle)
  const near = { d: 0, hit: null, at: [0, 0, 0], arm: new THREE.Vector3() };
  /**
   * The piece of side `side`'s arm (as solved: `s`) nearest a shape in `cs`, if it's nearer
   * than CLEAR_MARGIN: into `near` ({ d, hit: the shape, at: the point (world), arm: from the
   * shoulder to it, his own space }); `near.hit` null if none.
   */
  function nearest(k, s, cs, side) {
    place(k);
    near.d = CLEAR_MARGIN;
    near.hit = null;
    let piece = -1, at = 0;
    for (const i of ARM_OF[side]) {
      const pc = probes.get(i);
      const shapes = within(s, i, pc.r, near.d, cs);
      if (!shapes.length || !nearestIn(pc, shapes, near.d).col) continue;
      near.d = found.d; near.hit = found.col;
      near.at[0] = found.x; near.at[1] = found.y; near.at[2] = found.z;
      piece = i; at = found.j;
    }
    if (near.hit) near.arm.fromArray(probes.get(piece).pts, at).applyQuaternion(s.q[piece]).add(s.p[piece]).sub(s.p[SHOULDER[side]]);
    return near;
  }
  // (How near each arm, [left, right], comes to the scenery as keepClear() left it, out to
  // CLEAR_MARGIN: marginOf() has it from there.)
  const armNear = [0, 0];
  /**
   * His arms as just solved (`s`), out of the scenery: an arm with a piece in (or within
   * CLEAR_MARGIN of) a shape near him turns about its shoulder, as far as takes that piece out
   * to the margin (at most CLEAR_TURN: an arm breathing at the edge of a pillar eases off it,
   * it doesn't jump), and is checked again, at most CLEAR_TRIES times. It turns toward the way
   * out of the shape there, or if that doesn't help (another part of the gauntlet goes in
   * deeper), inward, toward his middle; a turn that helps neither way is taken back. The same
   * pose always ends the same way.
   */
  function keepClear(k, s) {
    const cs = nearOf(k);
    armNear[0] = armNear[1] = CLEAR_MARGIN;
    if (!cs.length) return;
    const c = Math.cos(k.yaw), sn = Math.sin(k.yaw);
    const mid = s.p[BONE_INDEX.chest];
    let swung = false;
    for (let j = 0; j < 2; j++) {
      const side = SIDES[j];
      let n = nearest(k, s, cs, side);
      // (An arm that came near is looked at again once it's done: a turn taken back leaves `n` behind.)
      if (n.hit) armNear[j] = NaN;
      for (let tries = 0; tries < CLEAR_TRIES && n.hit; tries++) {
        const before = n.d;
        // Out of the shape there (in his own space), or in toward his middle at that height.
        outOf(n.hit, n.at[0], n.at[1], n.at[2], _rn);
        _kn.set(_rn[0] * c - _rn[2] * sn, _rn[1], _rn[0] * sn + _rn[2] * c);
        _kx.set(mid.x - n.arm.x - s.p[SHOULDER[side]].x, 0, 0);
        const arm = _karm.copy(n.arm);
        let helped = false;
        for (const way of WAYS) {
          const axis = way.cross(arm);
          const lever = axis.length();
          if (lever < 1e-5) continue;
          axis.divideScalar(-lever);
          const angle = Math.min(CLEAR_TURN, (CLEAR_MARGIN - before) / lever);
          solver.swingArm(side, axis, angle);
          n = nearest(k, s, cs, side);
          if (!n.hit || n.d >= before + 0.002) { helped = true; swung = true; break; }
          solver.swingArm(side, axis, -angle);
        }
        if (!helped) break;
      }
    }
    // (Its pauldron rode the turned arm: out of the helmet's way again, once, and both arms
    // looked at again.)
    if (swung) solver.clampPlates(k.helmet);
    for (let j = 0; j < 2; j++) if (swung || Number.isNaN(armNear[j])) armNear[j] = nearest(k, s, cs, SIDES[j]).d;
  }

  /** Knight k is at home (his seat, or where he sits down on the ground), seated or up in front of it. */
  const isHome = (k) => !!k.home && Math.hypot(k.group.position.x - k.home.x, k.group.position.z - k.home.z) < 0.05;
  /**
   * How far knight k (as solved: `s`, his arms as keepClear() left them) keeps from the shapes
   * `cs` past what each piece of him may come to (DEPTH; DEPTH_RESTING for what rests on things),
   * out to MARGIN (m; below 0, that far in), and which parts of him are in (into `out`, as
   * PART_OF numbers them).
   */
  function marginOf(k, s, cs, out) {
    out.fill(false);
    place(k);
    let most = MARGIN;
    for (let j = 0; j < 2; j++) {
      const m = armNear[j] - DEPTH;
      if (m < 0) out[1 + j] = true;
      most = Math.min(most, m);
    }
    for (const b of bodyProbes) most = pieceMargin(s, b.i, b, b.depth, b.part, most, cs, out);
    const helm = helmProbes[k.helmet];
    if (helm) most = pieceMargin(s, BONE_INDEX.head, helm, DEPTH, 0, most, cs, out);
    return most;
  }
  /** The less of `most` and how far piece i (its points `pc`) keeps from `cs` past `depth`: marginOf() (its `part` into `out` if it's in). */
  function pieceMargin(s, i, pc, depth, part, most, cs, out) {
    // (Only nearer than the least so far matters, or in at all.)
    const under = Math.max(most, 0) + depth;
    const shapes = within(s, i, pc.r, under, cs);
    if (!shapes.length || !nearestIn(pc, shapes, under).col) return most;
    if (found.d < depth) out[part] = true;
    return Math.min(most, found.d - depth);
  }
  const _rest = newPose();
  /**
   * His resting pose at home now: seated, standing up in front of his seat, or on his way
   * between the two (getting up, sitting down, the site's dance up from his seat and back):
   * the one eased into the other as he goes, so what's eased back toward it moves on smoothly
   * with him.
   */
  function restOf(k) {
    const a = k.act;
    let up = k.mode === 'sit' ? 0 : 1;
    if (a?.kind === 'rise' || a?.kind === 'lower') {
      const u = smooth(clamp01(a.t / a.dur));
      up = a.kind === 'rise' ? u : 1 - u;
    } else if (k.mode === 'sit' && k.gestureName === 'dance' && !k.danceInPlace) {
      up = danceUp(k);
    }
    return up <= 0 ? k.sit : up >= 1 ? k.stand : lerpPose(_rest, k.sit, k.stand, up);
  }
  const _eased = newPose();
  const _bad = new Array(PARTS).fill(false);
  const _now = new Array(PARTS).fill(false);
  // (The poses looked at this step, each as solved and kept clear: the ease may end on one
  // before the last, and the solver holds only the last.)
  const looked = Array.from({ length: EASE_SOLVES }, () => ({
    f: NaN, pose: newPose(), q: BONES.map(() => new THREE.Quaternion()), p: BONES.map(() => new THREE.Vector3()), knee: [0, 0], elbow: [0, 0],
  }));
  let nLooked = 0;
  let budget = 0; // (the solves count this step's may reach)
  /** Note _eased, eased by `f`, as just solved (`s`). */
  function note(f, s) {
    const o = looked[nLooked++];
    o.f = f;
    o.pose.set(_eased);
    for (let i = 0; i < o.q.length; i++) { o.q[i].copy(s.q[i]); o.p[i].copy(s.p[i]); }
    o.knee[0] = s.knee[0]; o.knee[1] = s.knee[1]; o.elbow[0] = s.elbow[0]; o.elbow[1] = s.elbow[1];
  }
  /** k.work with the parts in _bad eased toward `base` by `f` (into _eased), solved and kept clear (noted): how clear (marginOf; _now the parts in). */
  function easeTo(k, base, cs, f) {
    for (let i = 0; i < POSE_SIZE; i++) _eased[i] = _bad[PART_OF[i]] ? k.work[i] + (base[i] - k.work[i]) * f : k.work[i];
    const s = solve(_eased, null, k.helmet);
    keepClear(k, s);
    note(f, s);
    return marginOf(k, s, cs, _now);
  }
  /** The pose eased by `f` that was looked at this step (the last such) back in the solver (`s`), and k.work takes it. */
  function take(k, s, f) {
    let j = nLooked - 1;
    while (j > 0 && looked[j].f !== f) j--;
    const o = looked[j];
    if (j < nLooked - 1) {
      for (let i = 0; i < o.q.length; i++) { s.q[i].copy(o.q[i]); s.p[i].copy(o.p[i]); }
      s.knee[0] = o.knee[0]; s.knee[1] = o.knee[1]; s.elbow[0] = o.elbow[0]; s.elbow[1] = o.elbow[1];
    }
    k.work.set(o.pose);
  }
  /**
   * Knight k's pose (k.work) solved, his arms kept out of the scenery (keepClear) and, at home,
   * all of him: whatever would still go into a piece of it (his body, an arm, his legs) eases
   * back toward his resting pose there (restOf), as little as clears it (easeBack), so he
   * slides along what he meets instead of jumping back from it; past it, he lets go over a few
   * steps (letGo) instead of snapping on (k.work takes the pose he ends in). Never more than
   * EASE_SOLVES poses solved (k.solves: how many). `moving` false (sitting or standing at rest,
   * his idle at most): nothing to check, his seat keeps him clear of everything
   * (test/knightClearance.test.mjs).
   */
  function solveClear(k, moving) {
    const held = (k.ease ??= { f: 0, parts: new Array(PARTS).fill(false) });
    const from = solves;
    budget = from + EASE_SOLVES;
    nLooked = 0;
    const s = solve(k.work, null, k.helmet);
    let f = 0;
    if (moving) keepClear(k, s);
    const cs = moving && isHome(k) ? nearOf(k) : null;
    if (cs?.length) {
      const m0 = marginOf(k, s, cs, _bad);
      if (m0 < 0 || held.f > 0) {
        // (Still letting go of what he was eased back from: those parts too.)
        for (let j = 0; j < PARTS; j++) _bad[j] ||= held.f > 0 && held.parts[j];
        _eased.set(k.work);
        note(0, s);
        const base = restOf(k);
        f = m0 < 0 ? easeBack(k, base, cs, held.f, m0) : letGo(k, base, cs, held.f);
        take(k, s, f);
        for (let j = 0; j < PARTS; j++) held.parts[j] = _bad[j];
      }
    }
    held.f = f;
    k.solves = solves - from;
    return s;
  }
  /**
   * Letting go of an ease back (`was`, the step before's) where he's clear without it: as fast
   * as he may (EASE_LET_GO a step), else holding it (an arm eased part of the way back to its
   * rest can pass through what the arm going on its way misses: a hand swinging down past the
   * ruins' plinth), else half as far as he may, else all of it.
   */
  function letGo(k, base, cs, was) {
    const floor = was - EASE_LET_GO;
    if (floor <= 0) return 0;
    if (easeTo(k, base, cs, floor) >= 0) return floor;
    if (easeTo(k, base, cs, was) >= 0) return was;
    return easeTo(k, base, cs, floor / 2) >= 0 ? floor / 2 : 0;
  }
  /**
   * The least ease back toward `base` (0..1) of the parts in _bad that clears knight k of
   * `cs`, where he's in by `m0` (m) without it, from `was` (the step before's): that or as much
   * less as he may let go if that clears him; else all the way back (and if even that doesn't,
   * with whatever easing brings in: an arm still in all the way back, the body leaning it there
   * eases with it; the body, his legs); then between there and where he's in, where the
   * margins say the least that clears him lies, as near as the looks left this step get it.
   * Where even all the way back doesn't clear him (his rest is no way out: a boot by a drum it
   * stands by), as far back as that if it gets him out further (EASE_GAIN), else as he was (no
   * snapping back for nothing).
   */
  function easeBack(k, base, cs, was, m0) {
    let a = 0, ma = m0, b = 1, mb = NaN;
    // (Where he'd stay, and how far in that leaves him.)
    let stay = 0, mStay = m0;
    if (was > 0) {
      const mw = easeTo(k, base, cs, was);
      if (mw >= 0) {
        b = was;
        mb = mw;
        const floor = was - EASE_LET_GO;
        if (floor > 0) {
          const mf = easeTo(k, base, cs, floor);
          if (mf >= 0) return floor;
          a = floor;
          ma = mf;
        }
      } else {
        a = stay = was;
        ma = mStay = mw;
      }
    }
    if (Number.isNaN(mb)) {
      mb = easeTo(k, base, cs, 1);
      if (mb < 0 && solves < budget && more()) {
        a = 0;
        ma = m0;
        mb = easeTo(k, base, cs, 1);
      }
      if (mb < 0) return mb > mStay + EASE_GAIN ? 1 : stay;
    }
    // (Between a, where he's in, and b, where he's clear.)
    while (solves < budget) {
      const f = a + (b - a) * THREE.MathUtils.clamp((EASE_AIM - ma) / (mb - ma), 0.15, 0.85);
      const m = easeTo(k, base, cs, f);
      if (m >= 0) { b = f; mb = m; } else { a = f; ma = m; }
    }
    return b;
  }
  /**
   * Into the ease whatever is still in all the way back (_now), and with an arm the body that
   * leans it there, with the body his legs: whether that's more than it had (_bad).
   */
  function more() {
    let added = false;
    for (let j = 0; j < PARTS; j++) {
      const want = _now[j] || (j === 0 && (_now[1] || _now[2])) || (j === 3 && _now[0]);
      if (want && !_bad[j]) _bad[j] = added = true;
    }
    return added;
  }

  const lp = new THREE.Vector3();
  /**
   * The solved pose onto the bones (the plates swung on their springs, clear of the helmet), and
   * out of the scenery if he's `moving` (solveClear).
   */
  function apply(k, moving = true) {
    // (Each foot's ground is in the pose itself: seatPoseOf, standAtSeat.)
    const s = solveClear(k, moving);
    k.settling = springPlates(k, s, k.lastStep < 0 || reducedMotion);
    solver.clampPlates(k.helmet);
    // (The solver's output is reused for every knight: keep his own joints.)
    for (let i = 0; i < k.own.p.length; i++) k.own.p[i].copy(s.p[i]);
    k.solved = k.own;
    const n = BONES.length;
    for (let i = 0; i < n; i++) {
      const par = PARENT_ALL[ALL_BONES[i]];
      // world = delta · rest; local = parent's world⁻¹ · world
      q.copy(s.q[i]).multiply(restQuat[i]);
      if (par) {
        const pi = BONE_INDEX[par];
        invQ.copy(s.q[pi]).multiply(restQuat[pi]).invert();
        k.bones[i].quaternion.copy(invQ).multiply(q);
        // (…and where it is from its parent: a pauldron lifted or shoved out moves off its rest place.)
        k.bones[i].position.copy(lp.copy(s.p[i]).sub(s.p[pi]).applyQuaternion(invQ));
      } else k.bones[i].quaternion.copy(q);
    }
    k.bones[0].position.copy(s.p[0]);
    k.pose.set(k.work);
  }

  // --- the beat -----------------------------------------------------------------------------------------
  const beatNow = () => beat.pos;

  // --- per frame --------------------------------------------------------------------------------------------
  /**
   * Advance by `dt` s of simulation time. `ctx`: { lookAt: Vector3 | null (what everyone
   * glances at: a rising weapon, the living blade), cameraAt: Vector3 (for the hovered one) }.
   */
  function update(dt, ctx = {}) {
    simT += dt;
    armor.uniforms.uGlint.value *= Math.exp(-dt / 0.12);
    armor.uniforms.uTime.value = simT;
    armor.step?.(dt); // (the fire's reflection sweeping over the armor)
    stepRestyle(dt);  // (a style swap burning through them)
    // Without a clock from outside, the beat runs on at its last tempo.
    if (beat.at < 0 || simT - beat.at > 0.5) beat.pos += dt / beat.period;
    moving = false;
    const step = Math.floor(simT * STEP_FPS);
    for (const k of knights) {
      if (!k.present && !k.fade) continue;
      k.clock += dt;
      if (k.gestureName) k.gestureT += dt;
      stepFade(k, dt);
      stepSwap(k, dt);
      if (k.glow) {
        k.glow.v *= Math.exp(-dt / 0.2);
        const g = k.glow.v > 0.02 ? k.glow.v : 0;
        k.helmMat.userData.uniforms.uLift.value = g;
        k.bodyMat.userData.uniforms.uLift.value = k.glow.helmOnly ? 0 : g;
        if (!g) k.glow = null;
      }
      const hu = k.bodyMat.userData.uniforms.uHover;
      hu.value += ((hovered === k.index ? 1 : 0) - hu.value) * Math.min(1, dt * 10);
      k.helmMat.userData.uniforms.uHover.value = hu.value;
      if (k.act) {
        k.act.t += dt;
        const a = k.act;
        if (a.kind === 'walk' && !a.teleport) {
          a.pos = a.along(Math.min(a.length, a.t * WALK_SPEED), a.pos ?? new THREE.Vector3());
          let d = a.heading - k.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          k.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * TURN_SPEED);
        } else if (a.kind === 'turn') {
          k.yaw = a.from + a.d * Math.min(1, a.t / Math.max(1e-3, a.dur - 0.15));
        }
        if (a.t >= a.dur) { a.end?.(); k.act = null; startCrossfade(k); run(k); }
      }
      if (k.blend < 1) k.blend = Math.min(1, k.blend + dt * (k.blendRate ?? 1 / CROSSFADE));
      // Where he looks: the cursor on him (the camera), what he was asked to, or the moment's
      // attention (a rising or flying weapon).
      const target = hovered === k.index ? ctx.cameraAt : k.lookAt ?? (reducedMotion ? null : ctx.lookAt);
      k.lookW += ((target ? 1 : 0) - k.lookW) * Math.min(1, dt * 5);
      // The moment's attention (a weapon in flight) sits him up; a glance (the cursor) doesn't.
      const attn = target && target === ctx.lookAt ? 1 : 0;
      k.attnMoving = Math.abs(attn - k.attn) > 0.04;
      k.attn += (attn - k.attn) * Math.min(1, dt * 4);
      if (target && k.solved) {
        headAt.copy(k.solved.p[BONE_INDEX.head]).applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position);
        lookDir.copy(target).sub(headAt).applyAxisAngle(Y_AXIS, -k.yaw);
        k.lookYaw = Math.atan2(lookDir.x, lookDir.z);
        k.lookPitch = -Math.atan2(lookDir.y, Math.hypot(lookDir.x, lookDir.z));
      }
      // Step the pose at the fire's frame rate. (Not while the forge sends him off: he's held
      // as it took him, so what burns off him is where he is.)
      if (step === k.lastStep || k.forging === 'out') continue;
      k.lastStep = step;
      const big = evaluate(k);
      apply(k, big);
      const pos = k.act?.kind === 'walk' && !k.act.teleport && k.act.pos ? k.act.pos : null;
      if (pos) k.group.position.copy(pos);
      k.group.rotation.y = k.yaw;
      // (Real motion redraws the shadow, and plates still swinging from it; so does the step
      // it ends on, so it rests right.)
      if ((big || k.settling || k.wasBig) && !k.ghost) moving = true;
      k.wasBig = big || k.settling;
      // (The armor's reflection of the fire is seen from his chest.)
      const c = k.bodyMat.userData.uniforms.uCenter.value;
      c.copy(k.solved.p[BONE_INDEX.chest]).applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position);
      k.helmMat.userData.uniforms.uCenter.value.copy(c);
    }
    // (Changes since the last frame, or in this one, to what casts his shadow.)
    if (shadowDirty) { moving = true; shadowDirty = false; }
  }

  // --- the API -------------------------------------------------------------------------------------------------
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < knights.length;
  /**
   * Bring knight i (forming out of embers, feet first): seated at his seat, or standing at
   * `at` ({ x, z }; `standing` alone: at his slot) turned to `facing`. `forge`: seated and
   * burnt away, for the forge to build (forgeSubject, forged).
   */
  function summon(i, { instant = false, standing = false, at = null, facing = null, forge = false } = {}) {
    if (!valid(i)) return false;
    const k = knights[i];
    if (k.forging) return k.forging === 'in';
    // (Here already, or only going somewhere by ember: he forms there on his own.)
    if (k.present && (!k.fade || k.fade.done)) return true;
    if (!k.present) {
      seatNow(k);
      if (standing || at) standAt(k, at ?? placeFor(i), facing ?? 'front');
    }
    k.present = true;
    setShown(k, true);
    k.work.set(k.mode === 'sit' ? k.sit : k.stand);
    apply(k);
    if (instant || reducedMotion) { k.fade = null; setGhost(k, false); for (const m of [k.bodyMat, k.helmMat]) m.userData.uniforms.uDissolve.value = 0; }
    else if (forge) {
      beginForge(k, 'in');
      setGhost(k, true);
      for (const m of [k.bodyMat, k.helmMat]) { m.userData.uniforms.uDissolve.value = 1; m.userData.uniforms.uGlow.value = 0; }
    } else fade(k, 0);
    cast = Math.max(cast, i + 1);
    return true;
  }
  /** Send knight i away: burning away (from the feet up), at once, or (`forge`) handed to the forge (forged). */
  function dismiss(i, { instant = false, forge = false } = {}) {
    if (!valid(i)) return false;
    const k = knights[i];
    if (!k.present) return true;
    if (k.forging === 'out' && !instant) return true;
    if (k.forging) endForge(k);
    clearActs(k);
    // (Nothing of his dance is left for a new scenery or a later dance() to bring back.)
    k.dancing = k.nextDance = k.danceAt = null;
    if (instant || reducedMotion) vanish(k);
    else if (forge) beginForge(k, 'out');
    else fade(k, 1);
    recount();
    return true;
  }
  function sit(i) {
    if (!valid(i) || !knights[i].present) return false;
    const k = knights[i];
    stayPut(k);
    clearActs(k);
    k.dancing = k.nextDance = k.danceAt = null;
    startCrossfade(k);
    if (k.mode === 'sit') return true;
    const home = homeFor(i);
    // Back in front of the seat (or down where he stands, for a knight with no seat).
    if (home.seat) {
      k.home = home;
      seatPoseOf(k);
      const spot = home.stand ??= standSpot(home);
      const front = new THREE.Vector3(spot.x, 0, spot.z).applyAxisAngle(Y_AXIS, home.yaw);
      enqueue(k, act.go(k, home.x + front.x, home.z + front.z), act.turn(k, home.yaw), {
        kind: 'place', dur: 0, start() { shiftPlace(k, new THREE.Vector3(home.x, home.y, home.z)); standAtSeat(k); },
      }, act.lower(k));
    } else {
      const p = k.group.position;
      k.home = { x: p.x, z: p.z, yaw: faceFire(p.x, p.z), h: 0, feet: [0, 0], y: p.y, seat: false };
      seatPoseOf(k);
      enqueue(k, act.turn(k, k.home.yaw), {
        kind: 'place', dur: 0,
        start() {
          // (He sits down where he stands: his seat is a step behind his feet.)
          const back = new THREE.Vector3(0, 0, -(seatFeet(0) - 0.03)).applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position);
          shiftPlace(k, back);
          k.home.x = back.x; k.home.z = back.z;
          standAtSeat(k);
        },
      }, act.lower(k));
    }
    return true;
  }
  function stand(i) {
    if (!valid(i) || !knights[i].present) return false;
    const k = knights[i];
    stayPut(k);
    clearActs(k);
    k.dancing = k.nextDance = k.danceAt = null;
    startCrossfade(k);
    if (k.mode === 'sit') enqueue(k, act.rise(k));
    return true;
  }
  /** Each knight's own slot (by index into danceSlots) for the cast's size: 1; 1 and 4; 1–3; 1–4. */
  const slotOf = (i) => ([[0], [0, 3], [0, 1, 2], [0, 1, 2, 3]][Math.min(3, Math.max(0, cast - 1))][i] ?? i) % 4;
  /** A place for a dancer: a slot number (1–5) or index, a position, or the dancer's own slot. */
  function placeFor(i, { slot = null, position = null } = {}) {
    if (position) return { x: position.x, z: position.z };
    const slots = danceSlots(sceneryName);
    const s = slot == null ? slots[slotOf(i)] : slots[(slot - 1 + slots.length) % slots.length];
    return { x: s.x, z: s.z };
  }
  /** Which way to face at (x, z): a yaw, or 'fire', 'out' or 'front' (knightPlaces.js facingYaw). */
  function facingFor(x, z, facing) { return facingYaw(x, z, facing); }
  function danceFn(i, opts = {}) {
    if (!valid(i) || reducedMotion) return false;
    const k = knights[i];
    const prev = k.nextDance ?? k.dancing;
    const seated = opts.seated ?? prev?.seated ?? false;
    const next = {
      move: opts.move ?? prev?.move ?? 'nod', energy: opts.energy ?? prev?.energy ?? 0.7,
      offset: opts.offset ?? prev?.offset ?? 0, seed: opts.seed ?? prev?.seed ?? k.seed, seated,
    };
    const where = opts.slot != null || opts.position ? placeFor(i, opts) : null;
    // Burning away, or on an ember walk: he comes back (forming where he is) and goes to
    // dance from there.
    if (leaving(k)) summon(i);
    else stayPut(k);
    // Not here yet: he forms right there, on his feet and dancing (or seated, to dance sitting).
    if (!k.present) {
      const to = seated ? null : where ?? placeFor(i);
      summon(i, seated ? {} : { at: to, facing: opts.facing ?? 'front' });
      k.dancing = k.nextDance = next;
      k.danceAt = seated ? { seated } : { x: to.x, z: to.z, yaw: k.yaw, seated };
      return true;
    }
    // Dancing (or on his way to dance) there already: a new move crossfades in; the energy
    // and the offset just change. (The visualizer can call this every bar.)
    const at = k.danceAt;
    if (at && at.seated === seated) {
      const same = seated || ((!where || Math.hypot(where.x - at.x, where.z - at.z) < 0.05)
        && (opts.facing == null || Math.abs(Math.sin((facingFor(at.x, at.z, opts.facing) - at.yaw) / 2)) < 0.03));
      if (same) {
        if (k.dancing && k.dancing.move !== next.move) startCrossfade(k);
        if (k.dancing) k.dancing = next;
        k.nextDance = next;
        return true;
      }
    }
    // Somewhere else: sit (to dance seated), or get up, go there, turn, and dance. (The dance
    // is noted before anything is queued: when he's already up, there and turned, the queue
    // runs straight through to `start` at once, which takes up whatever is noted.)
    const start = { kind: 'dance', dur: 0, start() { k.mode = seated ? 'sit' : 'stand'; k.dancing = k.nextDance; return false; } };
    if (seated) {
      if (k.mode !== 'sit') { sit(i); k.nextDance = next; k.danceAt = { seated }; enqueue(k, start); }
      else { clearActs(k); startCrossfade(k, 0.5); k.dancing = k.nextDance = next; k.danceAt = { seated }; }
      return true;
    }
    clearActs(k);
    startCrossfade(k);
    k.dancing = null;
    const to = where ?? (at && !at.seated ? at : k.mode === 'sit' ? placeFor(i) : { x: k.group.position.x, z: k.group.position.z });
    const yaw = facingFor(to.x, to.z, opts.facing ?? 'front');
    k.nextDance = next;
    k.danceAt = { x: to.x, z: to.z, yaw, seated };
    enqueue(k, act.rise(k), act.go(k, to.x, to.z), act.turn(k, yaw), start);
    return true;
  }
  function setCast({ count = cast, helmets = null, instant = false } = {}) {
    const n = Math.max(0, Math.min(knights.length, Math.round(count)));
    cast = n; // (first: the others' homes depend on how many there are)
    knights.forEach((k, i) => {
      if (i < n) summon(i, { instant });
      else dismiss(i, { instant });
      if (i < n && helmets) {
        const h = helmets === 'random' ? HELMETS[Math.floor(Math.random() * HELMETS.length)] : Array.isArray(helmets) ? helmets[i % helmets.length] : helmets;
        setHelmetOf(k, h, instant || !k.present);
      }
    });
  }
  function setHelmet(name, { index = null, instant = false } = {}) {
    const list = index == null ? knights.filter((k) => k.present || k.index < cast) : valid(index) ? [knights[index]] : [];
    return Promise.all(list.map((k) => setHelmetOf(k, name, instant))).then((r) => r.every(Boolean));
  }
  /**
   * A gesture; true if anyone started it (a knight changing helmets has his hands full, and
   * one dancing the site's dance finishes it).
   */
  function gestureFn(name, { index = 0 } = {}) {
    if (!GESTURE_TIME[name] || reducedMotion) return false;
    const ks = index === 'all' ? knights.filter((k) => k.present) : valid(index) && knights[index].present ? [knights[index]] : [];
    let n = 0;
    for (const k of ks) {
      if (k.swap || k.gestureName === 'dance') continue;
      k.gestureName = name;
      k.gestureT = 0;
      // (The site's dance: in his seat when there's no room over him to stand, for all of it.)
      k.danceInPlace = name === 'dance' && !headroom && k.mode === 'sit' && !k.act;
      n++;
    }
    return n > 0;
  }
  /**
   * How they sit: 'resting' (the Dark Souls rest) or 'watchful' (leaning in, forearms on the
   * knees, looking into the fire); every knight, or `index`'s alone. A seated knight eases
   * into it (under a second); the others take it the next time they sit.
   */
  function setSeatPose(name, { index = null } = {}) {
    if (!SEAT_POSES.includes(name)) return false;
    if (index == null) seatStyle = name;
    for (const k of index == null ? knights : valid(index) ? [knights[index]] : []) {
      k.seatPose = index == null ? null : name;
      if (!k.home) continue;
      seatPoseOf(k, name);
      if (k.present && k.mode === 'sit' && !k.act) startCrossfade(k, 0.9);
    }
    return true;
  }
  /**
   * The scenery changed: every knight is back where he belongs there, forming out of embers.
   * (One being sent away is gone at once: he isn't brought back to dance there.)
   */
  function setScenery(name, heights) {
    sceneryName = name;
    terrain = heights;
    fitsAt.clear();
    let left = false;
    for (const k of knights) {
      if (leaving(k)) { vanish(k); left = true; }
    }
    if (left) recount();
    for (const k of knights) {
      if (!k.present) continue;
      endForge(k); // (being summoned by the forge: he forms at the new seat at once instead)
      const dancing = k.nextDance ?? k.dancing;
      const at = k.danceAt;
      seatNow(k);
      if (dancing && !dancing.seated && at) {
        // (A dancer keeps his place on the ring and his move.)
        standAt(k, at, at.yaw);
        k.dancing = k.nextDance = dancing;
        k.danceAt = at;
      } else if (dancing?.seated) {
        k.dancing = k.nextDance = dancing;
        k.danceAt = at;
      }
      k.work.set(k.mode === 'sit' ? k.sit : k.stand);
      apply(k);
      if (!reducedMotion) fade(k, 0);
    }
  }
  const up = new THREE.Vector3();
  /** Capsules round the present knights (world): { a, b, r }, for things that mustn't pass through them. */
  function capsules() {
    const out = [];
    for (const k of knights) {
      if (!k.present || !k.solved) continue;
      const feet = k.group.position.clone();
      const head = k.solved.p[BONE_INDEX.head].clone().applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position);
      up.copy(k.solved.p[0]).applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position);
      feet.x = feet.x * 0.5 + up.x * 0.5; feet.z = feet.z * 0.5 + up.z * 0.5; feet.y += 0.25;
      head.y += 0.12;
      out.push({ a: feet, b: head, r: 0.32, index: k.index });
    }
    return out;
  }
  const hit = new THREE.Vector3();
  const seg = new THREE.Vector3();
  /** The knight a ray passes through (index), or -1; `out.distance` how far along the ray he is. */
  function pick(ray, out = null) {
    let best = -1, bestD = Infinity;
    for (const c of capsules()) {
      const d = ray.distanceSqToSegment(c.a, c.b, hit, seg);
      if (d < c.r * c.r * 0.7) {
        const along = hit.distanceTo(ray.origin);
        if (along < bestD) { bestD = along; best = c.index; }
      }
    }
    if (out) out.distance = bestD;
    return best;
  }
  /**
   * Dancing on his feet (or on his way to), or cheering: a flinch or a lean would bury the
   * move (the drop's leap, Praise the Sun), so he doesn't. He still hops a ring.
   */
  const performing = (k) => !!((k.nextDance ?? k.dancing) && !(k.nextDance ?? k.dancing).seated) || CHEERING.has(k.gestureName);
  /**
   * Something happened: 'impact' (a weapon lands; strength 0..1), 'stoke', 'ring' (a ring
   * races out). With `at` ({ x, z }) it happened there (the living blade swinging close):
   * only knights within `radius` react, and a dancer flinches too, a little less.
   */
  function react(kind, strength = 1, { at = null, radius = 1.1 } = {}) {
    if (reducedMotion) return;
    for (const k of knights) {
      if (!k.present) continue;
      const near = !!at;
      if (near && Math.hypot(k.group.position.x - at.x, k.group.position.z - at.z) > radius) continue;
      if (kind === 'impact') {
        if (near || !performing(k)) { k.react.flinch = k.clock + Math.random() * 0.05; k.react.flinchK = Math.min(1, strength) * (near && performing(k) ? 0.6 : 1); }
      }
      else if (kind === 'stoke') { if (!performing(k)) k.react.stoke = k.clock; }
      else if (kind === 'ring') {
        // The ring's front reaches him a moment later (about 4 m/s).
        const r = Math.hypot(k.group.position.x - FIRE.x, k.group.position.z - FIRE.z);
        k.react.hop = k.clock + Math.max(0, r - 0.3) / 4;
      }
    }
  }
  /** The flame's ramp ([lo, mid, hi, core]; `o`: its shade and light, armor.js setRamp). */
  function setRamp(ramp, o) {
    armor.setRamp(ramp, o);
    for (const k of knights) {
      for (const m of [k.bodyMat, k.helmMat]) {
        m.userData.uniforms.uEdge.value.set(ramp[1]);
        m.userData.uniforms.uEdgeHot.value.set(ramp[3]);
      }
    }
  }

  // Start: the first knight at his seat, in the great helm.
  for (const k of knights) wear(k, 'great');
  const helmPos = new THREE.Vector3();

  return {
    group: root,
    materials,
    /** Every template's geometry (the knight's own and any other style's model built since). */
    get geometries() { return [...templates.values()].flatMap((t) => [t.bodyGeo, ...t.helmGeos]); },
    skeletons: knights.map((k) => k.skeleton),
    rig,
    update,
    setRamp,
    /** The armor's finish (steel.js FINISHES) and the fire's rim on his edges (0..1): armor.js. */
    setFinish: (name) => armor.setFinish?.(name),
    get finish() { return armor.finish ?? 'gunmetal'; },
    setRim: (v) => armor.setRim?.(v),
    get rim() { return armor.rim ?? 0.5; },
    /**
     * The style (knightStyles.js): its shader, from the model `model` (its loaded scene; null
     * the knight's own). Knights who are here burn away and form again in it (~1.2 s;
     * `instant`: at once). Resolves true once it shows.
     */
    setStyle,
    get style() { return armor.style; },
    /** A style swap is burning through them. */
    get restyling() { return !!restyle; },
    /**
     * Another style's model, its template built beforehand (templateSteps over its scene, in
     * idle moments: scene.js): setStyle() with it then needn't build it on the spot.
     */
    adoptTemplate(t) { if (t?.root) adopt(t); },
    /** Whether a model's template is built yet (null: the knight's own, always). */
    hasTemplate: (root) => !root || templates.has(root),
    /**
     * Knight i is in the middle of something (a gesture or the site's dance, a dance, getting
     * up or sitting down, a new helmet or style burning through him): knightArrival.js holds
     * his leaving till he's done.
     */
    busyAt(i) {
      if (!valid(i) || !knights[i].present) return false;
      const k = knights[i];
      return !!(k.gestureName || k.swap || k.act || k.queue.length || k.dancing || k.nextDance || restyle?.ks.includes(k));
    },
    setScenery,
    react,
    capsules,
    pick,
    summon, dismiss, sit, stand, dance: danceFn, setCast, setHelmet, gesture: gestureFn,
    setSeatPose,
    /** How they sit (setSeatPose): 'resting' | 'watchful'. */
    get seatPose() { return seatStyle; },
    /**
     * Whether the view has room over his seat for him to stand up in (scene.js sets it: not
     * on a phone's tall view, which frames his seat right under the page's header). Without
     * it, the site's dance (gesture 'dance') is danced in his seat; one under way keeps its way.
     */
    get headroom() { return headroom; },
    set headroom(on) { headroom = !!on; },
    /** The forge's side of summon/dismiss({ forge: true }): his posed body as a forge subject, and the end. */
    forgeSubject, forged,
    /** The beat (every frame, from the music): `beatPos` in beats, `period` s a beat. */
    clock(beatPos, period = beat.period) { beat = { pos: beatPos, period: Math.max(0.2, period), at: simT }; },
    lookAt(point, { index = null } = {}) {
      for (const k of index == null ? knights : valid(index) ? [knights[index]] : []) k.lookAt = point ? new THREE.Vector3().copy(point) : null;
    },
    slots: (name = sceneryName) => ringOf(name),
    /**
     * Whether a dance move (MOVES) has room at a place on the ground ({ x, z }) facing `facing`
     * (as dance() takes it) in a scenery (this one by default): its reach (colliders.js
     * MOVE_REACH) clear of the scenery's shapes there, with 5 cm to spare. The show leaves out
     * one that doesn't.
     */
    fits: (move, at, facing = 'fire', name = sceneryName) => fitsAt.fits(name, move, at.x, at.z, facingFor(at.x, at.z, facing)),
    /** A beat (0..1): the armor glints, a step up the ramp for a moment. */
    beat(s = 1) { if (!reducedMotion) armor.uniforms.uGlint.value = Math.max(armor.uniforms.uGlint.value, 0.25 * s); },
    set hovered(i) { hovered = valid(i) && knights[i].present ? i : -1; },
    get hovered() { return hovered; },
    get moving() { return moving; },
    get count() { return cast; },
    get present() { return knights.filter((k) => k.present).length; },
    max: knights.length,
    get helmet() { return knights[0].helmet; },
    set helmet(name) { setHelmet(name); },
    get list() {
      return knights.map((k) => ({
        index: k.index, present: k.present,
        state: !k.present ? 'away' : k.forging ? (k.forging === 'in' ? 'arriving' : 'leaving')
          : k.fade ? (k.fade.done ? 'ember' : k.fade.to ? 'leaving' : 'arriving')
          : k.act?.kind ?? (k.dancing ? 'dancing' : k.mode === 'sit' ? 'sitting' : 'standing'),
        position: k.group.position.clone(), facing: k.yaw, helmet: k.helmet, move: k.dancing?.move ?? null,
      }));
    },
    get positions() {
      return knights.filter((k) => k.present && k.solved).map((k) => helmPos.copy(k.solved.p[BONE_INDEX.head]).applyAxisAngle(Y_AXIS, k.yaw).add(k.group.position).clone());
    },
    /** (Internals, for tests and debugging.) */
    knights,
    get terrain() { return terrain; },
  };
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
