// @ts-nocheck: 17 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
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
// Beside this module: knightMesh.js builds the model's template (its pieces merged and
// marked, the points he's checked at), knightClear.js keeps him out of the scenery
// (keepClear, the ease back) and knightPlates.js swings his plates on their springs.
//
// The API (scene.js hands it out as fire.knights; every method is safe with no model; the
// full table is in docs/knight.md):
//   ready                      resolves true once there are knights (scene.js)
//   count, present, max        knights in the cast, how many are showing, the most allowed
//   list                       [{ index, present, state, position, facing, helmet, move }]
//                              state: away, arriving, leaving, ember (going somewhere by
//                              ember), sitting, standing, dancing, or the act he's in (rise,
//                              lower, walk, turn, place)
//   positions                  where each present knight's head is (world): for cameras (one
//                              array, its vectors updated in place each read)
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
import { createArmorMaterial } from './armor.js';
import {
  BONES,
  POSE,
  measureRig,
  createSolver,
  newPose,
  lerpPose,
  seatedPose,
  floorArms,
  standingPose,
  seatFeet,
  feetAt,
  idle,
  look,
  attend,
  flinch,
  shield,
  hop,
  rise,
  walk,
  gesture,
  dance,
  RISE_TIME,
  GESTURE_TIME,
  DANCE_SEATED_TIME,
  GESTURES,
  MOVES,
  CHEERS,
  SEAT_POSES,
} from './knightPose.js';
import { SEATS, danceSlots, ringOf, restPlaces, planWalk, facingYaw, FIRE_AT, PIT } from './knightPlaces.js';
import { collidersNear, distanceTo, outOf, createFits } from './colliders.js';
import { weaponSilhouette } from './forgeFx.js';
import {
  HELMETS,
  ALL_BONES,
  BONE_INDEX,
  PARENT_ALL,
  templateSteps,
  probesOf,
  drain,
  buildTemplate,
  platesOf,
} from './knightMesh.js';
import { CLEAR_NEAR, SIDES, SHOULDER, danceUp, createClearance } from './knightClear.js';
import { STEP_FPS, createPlateSprings } from './knightPlates.js';

export { GESTURES, MOVES, SEAT_POSES };
export { HELMETS, templateSteps };

const FIRE = new THREE.Vector3(FIRE_AT.x, 0, FIRE_AT.z);
const FADE_TIME = 0.55; // summoning or dismissing (s)
const HELM_TIME = 1.6; // the helmet swap
const WALK_SPEED = 0.95; // m/s
const TURN_SPEED = 5; // rad/s
const CROSSFADE = 0.2;
const STEP_OVER = 0.16; // m: what a walking knight steps over (a fire pit's stone, a spare log)
// m: how low a wrist may go over the ground round him, sitting on the ground (his gauntlet
// hangs up to 18 cm below it, limp and open; at rest his wrists are 32 cm up or more, so rest
// is untouched)
const FLOOR_HANDS = 0.19;
// (Where a seated boot's sole is looked at for what it rests on: [m ahead of its ankle, m either
// side of it], inside the model's sabaton, which is 16 cm across to 0.2 m ahead, then narrows
// to its pointed toe (TOE_REACH): 4 cm across at 0.28. Sitting on the ground, back past its heel
// too: soleUnder. A look 5 cm aside at the toe reached past it, onto a stone it never touches:
// a ring knight's boot hung 9 cm over the ground, propped on the pit's rim beside its toe.)
const SOLE = [
  [0, 0.05],
  [0.1, 0.05],
  [0.2, 0.05],
  [0.28, 0.015],
];
// (How far a boot's pointed toe reaches past its ankle, m: the model's sabatons, seated. Until
// round 11 turned a boot in, NEAR_FIRE took 0.28 straight ahead: the rest's hips' turn made up
// the difference.)
const TOE_REACH = 0.3;
const SOLE_ON_GROUND = [[-0.12, 0.05], [-0.06, 0.05], ...SOLE];
// (How far under the ground he sits on a seated boot may rest, m. On a seat, 10 cm; sitting on
// the ground, as far as a step he sits on can drop away in front of him: the leg he stretches
// out resting reaches the ground 15.3 cm below the step he sits on at the cult's ring place for
// three, its knee still bent 28° (19° at 20 cm). Held to 10 cm, that boot hung 5 cm up.)
const SEAT_REACH = 0.1;
const GROUND_REACH = 0.16;
// (A boot's sole from its heel to its ankle, inside the sabaton: what it rests on there, propOf.
// Sitting on the ground, a boot whose ground is more than PROPPED (m) over that rests on
// something under its front alone, level, its heel in the air: the ring knight by the ruins'
// pit with four out had his stretched boot's toe on a pit stone and its heel 4.7 cm up. He
// sits back from the fire, BACK_STEP (m) at a time, BACK_MOST at most, till it isn't: settleOn.)
const HEEL_ON_GROUND = [
  [-0.06, 0.05],
  [0, 0.05],
];
const PROPPED = 0.015;
const BACK_STEP = 0.02;
const BACK_MOST = 0.2;
// (A standing boot's sole, m from its ankle: across it, and from its heel to its pointed toe.)
const STAND_SOLE = [
  [-0.07, 0, 0.07],
  [-0.08, 0, 0.1, 0.2, 0.29],
];
// His meshes' bounds (his own space: the ground under him, turned with him), for culling:
// every pose he takes stays inside with room to spare (the farthest reach, 1.51 m from
// here, is the boot of the leg he stretches out resting on the ground in the ruins; the
// leaps, Praise the Sun and the rest are inside too: test/knightsBounds.test.mjs, on the
// real model). Round 10 grew it from 1.6 m for a boot kicked out across the ruins' old
// seat; at 1.6 m the stretched boot would leave 9 cm, under the 10 the test asks for.
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 1.05, 0.15), 1.9);
// Gestures that throw the arms up (or dance): a flinch or a lean over one would hide it.
const CHEERING = new Set(CHEERS);
// Room on both sides (gesture()'s and dance()'s `room`).
const FREE = [1, 1];
// A seated ring lifts each foot at most this high over its hip joint (m; at the seats round
// 9's came to 7 cm): one already up near there (on a stone, say) lifts less, or not
// at all. From about 18 cm up the ankle comes round to where the knee bends toward and the
// knee folds down under the leg for a step (round 9's knights sitting on the ground, their
// feet up level with their hips, did on every ring). hop(), riseOf().
const HOP_TOP = 0.12;
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
// (A knight resting on the ground with no seat (Bonfire Live's others, on the ring) rests only
// where he'd sit as every seat has him, this far (m) from the scenery's shapes sitting still:
// clearAt. Elsewhere he sits watchful.)
const SIT_CLEAR = 0.04;
const UPPER = new Set(['chest', 'neck', 'head', 'shoulderL', 'shoulderR'].map((b) => BONE_INDEX[b]));
const UPPER_CLEAR = 0.06;
// (What of him rests on the ground, sitting on it: groundHome's seatPatch.)
const SEAT_PIECES = new Set(['hips', 'thighL', 'thighR', 'tassetL', 'tassetR'].map((b) => BONE_INDEX[b]));
// (Standing where he's placed, and the channels standing in front of his seat moves: his root
// and his feet, sideways, up to their ground and ahead.)
const STANDING = standingPose();
const STAND_OFFSET = [0, 2, POSE.legL, POSE.legL + 1, POSE.legL + 2, POSE.legR, POSE.legR + 1, POSE.legR + 2];

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
export function createKnights(
  gltfRoot,
  {
    layerSolid = 0,
    layerGhost = 2,
    castShadows = true,
    armor,
    max = 4,
    reducedMotion = false,
    onSparks = null,
    template = null,
  } = {},
) {
  // The template he's built from now: the knight's own, or another style's model on the same
  // rig (setStyle). The rig, the solver and the plates' collision data are the knight's own.
  let T = template?.root === gltfRoot ? template : buildTemplate(gltfRoot);
  const T0 = T;
  const templates = new Map([[gltfRoot, T]]);
  const armorPlates = platesOf(T);
  const rig = measureRig(T.restPos, {
    ...(T.tassetFollow ? { tassetFollow: T.tassetFollow } : {}),
    plates: armorPlates?.plates ?? null,
    lamesNode: armorPlates?.lamesNode ?? false,
  });
  const solver = createSolver(rig);
  // The points his arms and body are checked at against the scenery (keepClear, solveClear):
  // the template's, built in its steps (or here, at once). Every style's model is moved onto
  // this one's joints, so its points serve them all.
  const { arms: probes, body: bodyProbes, helms: helmProbes } = T.probes ?? drain(probesOf(T));
  // Every pose solved and kept out of the scenery (knightClear.js), and the plates' springs
  // (knightPlates.js), with this knight's rig and points.
  const { solve, solveClear, keepsFrom } = createClearance(solver, { probes, bodyProbes, helmProbes, nearOf });
  const springPlates = createPlateSprings({ probes, bodyProbes, nearOf });
  const FEET = [bodyProbes.find((b) => b.i === BONE_INDEX.footL), bodyProbes.find((b) => b.i === BONE_INDEX.footR)];
  const restPos = ALL_BONES.map((b) => new THREE.Vector3(...T.restPos[b]));
  const restQuat = ALL_BONES.map((b) => T.restQuat[b]);
  const restLocalPos = ALL_BONES.map((b, i) => {
    const par = PARENT_ALL[b];
    if (!par) return restPos[i].clone();
    const pi = BONE_INDEX[par];
    return restPos[i].clone().sub(restPos[pi]).applyQuaternion(restQuat[pi].clone().invert());
  });
  const boneInverses = ALL_BONES.map((b, i) =>
    new THREE.Matrix4().compose(restPos[i], restQuat[i], new THREE.Vector3(1, 1, 1)).invert(),
  );
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
    ALL_BONES.forEach((b, i) => {
      const par = PARENT_ALL[b];
      if (par) bones[BONE_INDEX[par]].add(bones[i]);
    });
    const skeleton = new THREE.Skeleton(
      bones,
      boneInverses.map((mm) => mm.clone()),
    );
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
      index,
      group,
      bones,
      skeleton,
      body: meshes[0],
      helms,
      meshes,
      bodyMat,
      helmMat,
      pose: newPose(),
      from: newPose(),
      blend: 1,
      sit: newPose(),
      stand: newPose(),
      work: newPose(),
      present: false,
      fade: null,
      ghost: false,
      forging: null, // 'in' | 'out': the forge is summoning or sending him off (forgeSubject)
      mode: 'sit',
      act: null,
      queue: [],
      home: null, // where he sits: { x, z, yaw, h, feet: [gL, gR], y } (world)
      yaw: 0,
      lastStep: -1,
      clock: 0,
      react: { flinch: -9, flinchK: 0, stoke: -9, hop: -9 },
      lookAt: null,
      lookW: 0,
      lookYaw: 0,
      lookPitch: 0,
      attn: 0,
      attnMoving: false,
      helmet: 'great',
      swap: null,
      dancing: null, // { move, energy, offset, seed, seated }: the dance he's doing
      nextDance: null, // ...or the one he's on his way to
      danceAt: null, // where he dances: { x, z, yaw, seated }
      seed: index * 7 + 3,
      wasBig: false, // (his last pose step was real motion)
      solves: 0, // (how many poses his last step solved: solveClear)
      solved: null, // his solved pose's joints (knight space): { p: [Vector3 by BONES index] }
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

  // The nearest the fire's middle a knight sits on the ground facing it (m; his hips), in each
  // seat pose: each boot's pointed toe (TOE_REACH past its ankle, the way the boot points: his
  // hips' turn and its toe-in) a hand's breadth out of the pit's stones. (Resting, he
  // stretches a leg out toward the fire, its boot turned in: 1.66 m. Watchful, 1.50: about
  // where round 10 sat them, clear of what stands behind, which the resting pose's distance
  // isn't everywhere: the forge's hearth, the cathedral's pew. Each pose sits at its own, and
  // he shifts between them as his pose changes where he sits: rehome.)
  const NEAR_FIRE = Object.fromEntries(
    SEAT_POSES.map((style) => [
      style,
      Math.max(
        ...feetAt(seatedPose(newPose(), 0, rig, style), rig).map(([x, z, turn]) => {
          const tx = x + TOE_REACH * Math.sin(turn);
          return z + TOE_REACH * Math.cos(turn) + Math.sqrt(Math.max(0, (PIT + 0.08) ** 2 - tx * tx));
        }),
      ),
    ]),
  );
  /** How knight k sits (SEAT_POSES): his own, or everyone's. */
  const styleOf = (k) => k.seatPose ?? seatStyle;
  /**
   * How he sits at home `h` asked to sit `style`: so, unless it's on the ground with no seat and
   * he's resting where that would meet the scenery (groundHome: watchful there instead).
   */
  const sitsAs = (h, style) => (h && !h.seat && h.want === style ? h.style : style);
  /**
   * Sitting down on the ground with no seat where he stands at (x, z) (Bonfire Live's others,
   * on the ring, or a dancer sat down where he danced): his home there in seat pose `style`
   * (settleOn). Resting, only where he'd sit as a seat has him, clear of the scenery, his boots
   * on the ground: where his rest would meet something (the cathedral's pew, by its place for
   * four) or has nowhere clear to lie on the ground, he sits watchful there. `want` keeps the
   * pose asked for, `style` the one he sits in.
   */
  function groundHome(x, z, style) {
    const h = settleOn(x, z, style) ?? settleOn(x, z, 'watchful');
    h.want = style;
    return h;
  }
  /**
   * His home on the ground at (x, z) in seat pose `style`: sat back from the fire as far as the
   * pose needs (onGround), and further where a boot of his would rest on something under its
   * front alone, its heel in the air (a pit stone under its toe: propOf), till it lies on the
   * ground (BACK_STEP at a time, BACK_MOST at most) where he sits as a seat has him (clearAt).
   * Resting, only where he sits as a seat has him (null where nowhere is); watchful, where he'd
   * sit if no further back is clear.
   */
  function settleOn(x, z, style) {
    const first = onGround(x, z, style);
    if (propOf(first, style) <= PROPPED) return style !== 'resting' || clearAt(first, style) ? first : null;
    for (let more = BACK_STEP; more < BACK_MOST + 1e-6; more += BACK_STEP) {
      const h = onGround(x, z, style, more);
      if (propOf(h, style) <= PROPPED && clearAt(h, style)) return h;
    }
    return style === 'resting' ? null : first;
  }
  /**
   * His home on the ground with no seat where he stands at (x, z): a step back from it, away
   * from the fire, as far as seat pose `style` needs (and `more`), on the ground there (a low
   * dais or step under him is what he sits on). `from` and `style` keep where he sat down from
   * and how, for rehome.
   */
  function onGround(x, z, style, more = 0) {
    const out = Math.hypot(x - FIRE.x, z - FIRE.z) || 1;
    const back = Math.max(seatFeet(0) - 0.03, NEAR_FIRE[style] - out) + more;
    const hx = x + ((x - FIRE.x) / out) * back,
      hz = z + ((z - FIRE.z) / out) * back;
    const yaw = faceFire(hx, hz);
    // (On the highest of the ground where his seat rests on it: a flagstone under a thigh
    // lifts him, as a seat would, instead of the thigh sinking into it.)
    const c = Math.cos(yaw),
      sn = Math.sin(yaw);
    let y = 0;
    for (const [sx, sz] of seatPatch(style)) y = Math.max(y, heightAt(hx + sx * c + sz * sn, hz - sx * sn + sz * c));
    return { x: hx, z: hz, yaw, h: 0, feet: [0, 0], y, seat: false, from: { x, z }, style };
  }
  const propP = newPose();
  /**
   * How far up seat pose `style` at home `h` on the ground would rest a boot on something under
   * its front alone (m): its ground over the ground under its heel and ankle, the more of either.
   */
  function propOf(h, style) {
    seatedPose(propP, h.h, rig, style);
    let most = 0;
    for (const f of feetAt(propP, rig)) most = Math.max(most, soleUnder(h, ...f) - soleUnder(h, ...f, HEEL_ON_GROUND));
    return most;
  }
  const patches = {};
  /**
   * Where his seat rests on the ground sitting on it in seat pose `style` (his own space: [x,
   * z] every 5 cm under his hips, thighs and tassets where they come within 4 cm of it; once
   * each).
   */
  function seatPatch(style) {
    if (patches[style]) return patches[style];
    const s = solve(seatedPose(newPose(), 0, rig, style));
    const cells = new Map(),
      v = new THREE.Vector3();
    for (const b of bodyProbes) {
      if (!SEAT_PIECES.has(b.i)) continue;
      for (let j = 0; j < b.pts.length; j += 3) {
        v.fromArray(b.pts, j).applyQuaternion(s.q[b.i]).add(s.p[b.i]);
        if (v.y < 0.04) cells.set(`${Math.round(v.x / 0.05)},${Math.round(v.z / 0.05)}`, [v.x, v.z]);
      }
    }
    return (patches[style] = [[0, 0], ...cells.values()]);
  }
  const clearP = newPose();
  /**
   * Whether he'd sit at home `h` on the ground in seat pose `style` as a seat has him (every
   * seat: test/knightClearance.test.mjs): sitting still, his boots on the ground under them,
   * nothing of him nearer the scenery's shapes than SIT_CLEAR, his boots and shins resting on
   * what's under them. (A solve and the shapes near him: about 0.1 ms.)
   */
  function clearAt(h, style) {
    const cs = collidersNear(sceneryName, h.x, h.z, CLEAR_NEAR);
    return !cs.length || keepsFrom(solve(seatOn(clearP, h, style)), h, cs, SIT_CLEAR);
  }
  /** Where knight i rests in this scenery: the scenery's seat (the first), or the ground at a ring slot. */
  function homeFor(i) {
    const seat = SEATS[sceneryName];
    if (i === 0 && seat) {
      const yaw = seat.yaw ?? faceFire(seat.x, seat.z);
      // The seat's real height from the height map (the highest cell under him), and the
      // ground where each foot lands. (On the ground: the ground under him, a flagstone and
      // all, is his seat; he sits on it, h 0, his feet on what's in front of him.)
      let top = 0;
      for (let a = 0; a < 7; a++) {
        const r = a ? 0.07 : 0;
        const x = seat.x + Math.sin(a) * r,
          z = seat.z + Math.cos(a) * r;
        top = Math.max(top, seat.ground ? heightAt(x, z) : topAt(x, z));
      }
      if (seat.ground) {
        const y = Math.max(0, top);
        const ground = (side) => {
          const p = new THREE.Vector3(side * 0.17, 0, seatFeet(0)).applyAxisAngle(Y_AXIS, yaw);
          return heightAt(seat.x + p.x, seat.z + p.z) - y;
        };
        return { x: seat.x, z: seat.z, yaw, h: 0, feet: [ground(1), ground(-1)], y, seat: true, aside: 0 };
      }
      if (!terrain || Math.abs(top - seat.top) > 0.1) top = seat.top;
      // (Each foot's ground: his left is +x in his own space.)
      const ground = (side) => {
        const p = new THREE.Vector3(side * 0.17, 0, seatFeet(top)).applyAxisAngle(Y_AXIS, yaw);
        return heightAt(seat.x + p.x, seat.z + p.z);
      };
      const gL = ground(1),
        gR = ground(-1);
      const y = Math.max(0, Math.min(gL, gR));
      return {
        x: seat.x,
        z: seat.z,
        yaw,
        h: Math.max(0.15, top - y),
        feet: [gL - y, gR - y],
        y,
        seat: true,
        aside: seat.standAside ?? 0,
      };
    }
    // The others sit on the ground where the visualizer rests them (knightPlaces.js
    // restPlaces: the ring's clear sides, never in front of the fire), their feet on the ring
    // (or out of the fire, a leg stretched out toward it).
    const place =
      restPlaces(ringOf(sceneryName), Math.max(cast, i + 1), seat)[i - 1] ?? danceSlots(sceneryName)[slotOf(i)];
    return groundHome(place.x, place.z, styleOf(knights[i]));
  }
  /** Put knight k seated at home now. */
  function seatNow(k) {
    k.home = homeFor(k.index);
    k.group.position.set(k.home.x, k.home.y, k.home.z);
    k.yaw = k.home.yaw;
    k.group.rotation.y = k.yaw;
    seatPoseOf(k);
    standAtSeat(k);
    // (His feet's way up over what's in front of his seat, worked out now: not in the step he
    // gets up on, the site's first click away.)
    overOf(k);
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
  const atHome = (home, x, z) => {
    _hw.set(x, 0, z).applyAxisAngle(Y_AXIS, home.yaw);
    _hw.x += home.x;
    _hw.z += home.z;
    return _hw;
  };
  /** The ground at a place in his own space at `home`, above the ground he's placed on (m; `reach` at most under it). */
  const groundUnder = (home, x, z, reach = SEAT_REACH) => {
    const w = atHome(home, x, z);
    return THREE.MathUtils.clamp(heightAt(w.x, w.z) - home.y, -reach, 0.42);
  };
  /**
   * The ground a seated boot rests on at a place in his own space at `home` (its ankle at x, z,
   * its toe turned `turn` from straight ahead, + toward his left: feetAt): the highest under
   * its sole from the ankle to the pointed toe (0.3 m ahead), so the toe never sinks into
   * whatever it reaches over (a stone or a log he rests his foot up on).
   * Sitting on the ground, from behind its heel too (12 cm behind the ankle: its heel is 9 cm
   * back, and his idle's shift of weight steps it 2.5 back): a leg stretched out along the ground
   * rests its heel on whatever lies there (the spare log by the fire, for one of Bonfire Live's
   * knights resting on the ring), and down off a step he sits on (GROUND_REACH). On a seat,
   * not the heel's: a foot drawn in tucks its heel under the seat's edge.
   */
  const soleUnder = (home, x, z, turn = 0, sole = null) => {
    const c = Math.cos(turn),
      sn = Math.sin(turn);
    const onGround = home.h < 0.12,
      reach = onGround ? GROUND_REACH : SEAT_REACH;
    let g = -Infinity;
    for (const [dz, w] of sole ?? (onGround ? SOLE_ON_GROUND : SOLE))
      for (const dx of [-w, w]) g = Math.max(g, groundUnder(home, x + dx * c + dz * sn, z - dx * sn + dz * c, reach));
    return g;
  };
  /**
   * The highest ground within his arms' reach low down round `home` (m over the ground he's
   * placed on): a flagstone or a stone by him, not anything taller (a hand goes round that).
   */
  function floorOf(home) {
    let g = 0;
    for (let x = -0.6; x <= 0.61; x += 0.1)
      for (let z = -0.3; z <= 0.71; z += 0.1) if (x * x + z * z < 0.5) g = Math.max(g, groundUnder(home, x, z));
    return Math.min(g, 0.1);
  }
  /**
   * The ground a standing boot rests on at a place in his own space at `home` (its ankle at x,
   * z): the highest under its sole, heel to pointed toe and either side (STAND_SOLE), so none
   * of it sinks into a flagstone it stands half on (the ground under the ankle alone left the
   * toe 5 cm into one, stood up in front of the ruins' seat).
   */
  const standUnder = (home, x, z) => {
    let g = -Infinity;
    for (const dz of STAND_SOLE[1]) for (const dx of STAND_SOLE[0]) g = Math.max(g, groundUnder(home, x + dx, z + dz));
    return g;
  };
  /** What stands at a place in his own space at `home` (its top), above the ground he's placed on (m). */
  const topUnder = (home, x, z) => {
    const w = atHome(home, x, z);
    return topAt(w.x, w.z) - home.y;
  };
  /** Seat pose `style` at home `h` into `p`, each foot on the ground under its sole there (into h.feet). */
  function seatOn(p, h, style) {
    seatedPose(p, h.h, rig, style);
    const [fl, fr] = feetAt(p, rig);
    h.feet = [soleUnder(h, ...fl), soleUnder(h, ...fr)];
    return seatedPose(p, h.h, rig, style, h.feet);
  }
  /**
   * His seated pose at home (into k.sit), each foot on the ground where the pose rests it
   * (a foot up on the seat's log, or down a slope), and the room he has for his arms. (Asked
   * to rest where his home on the ground has no room for it, watchful: sitsAs.)
   */
  function seatPoseOf(k, style = styleOf(k)) {
    const h = k.home;
    seatOn(k.sit, h, sitsAs(h, style));
    h.room = roomOf(h, k.sit);
    h.roomLess = null;
    h.rise = riseOf(k.sit);
    return k.sit;
  }
  /** How far each foot of a seated pose may lift when a ring passes under him (hop()'s `rise`), [left, right] (m): up to HOP_TOP over its hip joint. */
  function riseOf(pose) {
    const s = solve(pose);
    return SIDES.map((side) =>
      Math.max(0, HOP_TOP - (s.p[BONE_INDEX['foot' + side]].y - s.p[BONE_INDEX['thigh' + side]].y)),
    );
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
    const c = Math.cos(h.yaw),
      sn = Math.sin(h.yaw);
    return ['L', 'R'].map((side, i) => {
      const sg = i ? -1 : 1;
      const at = s.p[SHOULDER[side]];
      const wx = h.x + at.x * c + at.z * sn,
        wy = h.y + at.y,
        wz = h.z - at.x * sn + at.z * c;
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
   * up or sits down; the site's dance up from his seat has that on its way up and down, and
   * the room up there while he's up: danceUp); elsewhere all of it (a dancer's place is picked
   * with room for its moves: fits()). keepClear() catches the rest.
   */
  function roomNow(k) {
    const h = k.home;
    if (!h?.room || Math.hypot(k.group.position.x - h.x, k.group.position.z - h.z) > 0.05) return FREE;
    const a = k.act?.kind;
    const up = h.roomUp ?? h.room;
    const less = (h.roomLess ??= [Math.min(h.room[0], up[0]), Math.min(h.room[1], up[1])]);
    if (k.mode === 'sit' && !a) {
      if (k.gestureName !== 'dance' || k.danceInPlace) return h.room;
      const u = danceUp(k),
        r = (k.roomNow ??= [0, 0]);
      for (let j = 0; j < 2; j++) r[j] = less[j] + (up[j] - less[j]) * u;
      return r;
    }
    if (k.mode === 'stand' && !a) return up;
    return less;
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
    const fx = rig.pos.footL.x + 0.03,
      fz = rig.pos.footL.z + 0.02;
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
      let lo = Infinity,
        hi = -Infinity;
      // (Its sole, heel to its pointed toe and either side; the boot, toe aside, out of the fire.)
      for (const [dx, dz] of [
        [0, 0],
        [0.07, 0],
        [-0.07, 0],
        [0, 0.12],
        [0, 0.24],
        [0.06, 0.18],
        [-0.06, 0.18],
        [0, -0.06],
      ]) {
        const g = groundUnder(h, x + dx, z + dz);
        const w = atHome(h, x + dx, z + dz);
        if (topUnder(h, x + dx, z + dz) - g > 0.05 || (dz <= 0.12 && Math.hypot(w.x - FIRE.x, w.z - FIRE.z) < 1.05))
          return NaN;
        for (const c of cs)
          if (
            distanceTo(c, w.x, h.y + g + 0.05, w.z) < STAND_CLEAR ||
            distanceTo(c, w.x, h.y + g + 0.3, w.z) < STAND_CLEAR
          )
            return NaN;
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
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
          const gl = level(x + fx, z0 + dz + fz),
            gr = level(x - fx, z0 + dz + fz);
          // (Both boots level with each other, not up on anything or down a hole; room above.)
          if (Math.abs(gl - gr) < 0.04 && gl > -0.12 && gl < 0.06 && roomAbove(x, z0 + dz, (gl + gr) / 2))
            best = { x, z: z0 + dz, score };
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
    const out = [],
      v = new THREE.Vector3();
    for (const b of bodyProbes) {
      if (!UPPER.has(b.i)) continue;
      for (let j = 0; j < b.pts.length; j += 3) {
        v.fromArray(b.pts, j).applyQuaternion(s.q[b.i]).add(s.p[b.i]);
        out.push(v.x, v.y, v.z);
      }
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
    k.stand[32] += s.x;
    k.stand[37] -= s.x; // (legs: x is out to each side)
    k.stand[32 + 2] = s.z + 0.02;
    k.stand[37 + 2] = s.z + 0.02;
    if (h) {
      const [fl, fr] = feetAt(k.stand, rig);
      k.stand[33] += standUnder(h, fl[0], fl[1]);
      k.stand[38] += standUnder(h, fr[0], fr[1]);
      if (!h.roomUp) {
        h.roomUp = roomOf(h, k.stand);
        h.roomLess = null;
      }
    }
    return k.stand;
  }
  const _feet = new Float64Array(8);
  /** A pose's feet (feetAt: x his left, z ahead) into _feet from `j`: left x, z, right x, z. */
  function feetInto(p, j) {
    const L = rig.pos.footL,
      R = rig.pos.footR;
    _feet[j] = L.x + p[POSE.legL];
    _feet[j + 1] = L.z + p[POSE.legL + 2];
    _feet[j + 2] = R.x - p[POSE.legR];
    _feet[j + 3] = R.z + p[POSE.legR + 2];
  }
  /**
   * Whether a foot comes nearer any of the scenery's shapes `cs` than `under` (m) with its joint
   * at (x, y, z) in his own space at his home `h`, level (its points: `foot`; a clump of them
   * that can't come that near passed over whole).
   */
  function footIn(h, foot, x, y, z, cs, under) {
    const c = Math.cos(h.yaw),
      sn = Math.sin(h.yaw);
    const gx = h.x + x * c + z * sn,
      gy = h.y + y,
      gz = h.z - x * sn + z * c;
    const P = foot.pts,
      C = foot.clumps;
    for (const col of cs) {
      if (distanceTo(col, gx, gy, gz) - col.lip * foot.r >= under) continue;
      for (let q = 0; q < C.length; q += 6) {
        if (
          distanceTo(col, gx + C[q] * c + C[q + 2] * sn, gy + C[q + 1], gz - C[q] * sn + C[q + 2] * c) -
            col.lip * C[q + 3] >=
          under
        )
          continue;
        for (let j = C[q + 4], end = C[q + 5]; j < end; j += 3) {
          if (distanceTo(col, gx + P[j] * c + P[j + 2] * sn, gy + P[j + 1], gz - P[j] * sn + P[j + 2] * c) < under)
            return true;
        }
      }
    }
    return false;
  }
  /**
   * How much higher each foot has to go on its way between where it rests seated and where
   * it stands up to (rise()'s `over`, at OVER_POINTS points along the straight way from the
   * seated end): as much as keeps it OVER_CLEAR clear of the scenery's shapes there (a boot
   * resting up on something steps up and off it, not down through it), and
   * whether either has more than OVER_CROSS to clear (`cross`: he stands up over his feet
   * first, then steps). Kept with him until his seat, his seat pose or where he stands up to
   * changes; null away from a seat.
   */
  function overOf(k) {
    const h = k.home;
    if (!h?.seat) return null;
    const o = (k.over ??= {
      L: new Float32Array(OVER_POINTS),
      R: new Float32Array(OVER_POINTS),
      cross: false,
      key: new Float64Array(8),
      home: null,
    });
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
      const foot = FEET[f],
        leg = f ? POSE.legR : POSE.legL;
      const ax = _feet[2 * f],
        az = _feet[2 * f + 1],
        bx = _feet[4 + 2 * f],
        bz = _feet[5 + 2 * f];
      const ay = k.sit[leg + 1] + rig.ankleY,
        by = k.stand[leg + 1] + rig.ankleY;
      for (let i = 1; i < OVER_POINTS - 1; i++) {
        const e = i / (OVER_POINTS - 1);
        const x = ax + (bx - ax) * e,
          y = ay + (by - ay) * e,
          z = az + (bz - az) * e;
        if (!footIn(h, foot, x, y, z, cs, OVER_CLEAR)) continue;
        // (As little higher as clears it, to a centimetre.)
        let lo = 0,
          hi = OVER_MOST;
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
    for (const mesh of k.meshes) {
      mesh.layers.set(on ? layerGhost : layerSolid);
      mesh.castShadow = castShadows && !on;
    }
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
    if (k.swap) {
      const s = k.swap;
      k.swap = null;
      wear(k, s.to);
      s.resolve(true);
    }
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
    knights.forEach((k, i) => {
      if (k.present && !leaving(k)) cast = i + 1;
    });
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
    else if (f.to < 1) {
      setGhost(k, false);
      flash(k, 0.7);
    }
    f.done?.();
  }
  // A flash over him (formed, or a new helmet), fading: in his own tones (the armor's uLift),
  // never a wash of the edge color (that turns him into a flat cut-out of one color).
  function flash(k, amount, helmOnly = false) {
    k.glow = { v: amount, helmOnly };
  }

  // --- summoned and sent off by the forge (the site's knight: knightArrival.js) ----------------
  // summon(i, { forge: true }) seats him burnt away on the ghost layer and leaves his dissolve
  // to the forge (forgeRun.js), which builds him from forgeSubject(i): his posed body, skinned
  // here on the CPU. dismiss(i, { forge: true }) hands him over the other way. forged(i) ends
  // it: whole and solid again, or gone. Meanwhile his helmet burns with his body (its dissolve
  // runs over his whole height, not the helmet's own) and nothing else touches his dissolve.
  function beginForge(k, dir) {
    if (k.swap) {
      const s = k.swap;
      k.swap = null;
      wear(k, s.to);
      s.resolve(true);
    }
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
    for (const m of [k.bodyMat, k.helmMat]) {
      m.userData.uniforms.uFrost && (m.userData.uniforms.uFrost.value = 0);
    }
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
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const g of geos) {
      const p = g.attributes.position,
        s = g.attributes.skinIndex;
      for (let j = 0; j < p.count; j++, o++) {
        v.fromBufferAttribute(p, j);
        restY[o] = v.y;
        v.applyMatrix4(M[s.getX(j)]);
        posed[o * 3] = v.x;
        posed[o * 3 + 1] = v.y;
        posed[o * 3 + 2] = v.z;
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        z0 = Math.min(z0, v.z);
        z1 = Math.max(z1, v.z);
      }
    }
    // (His own axis: the middle of him from above, so the helix winds round all of him.)
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    for (let j = 0; j < count; j++) {
      posed[j * 3] -= cx;
      posed[j * 3 + 2] -= cz;
    }
    const [lo, hi] = T.bodySpan;
    const tris = count / 3;
    const cum = new Float32Array(tris);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    let total = 0;
    for (let t = 0; t < tris; t++) {
      a.fromArray(posed, t * 9);
      b.fromArray(posed, t * 9 + 3);
      c.fromArray(posed, t * 9 + 6);
      total += b.sub(a).cross(c.sub(a)).length() / 2;
      cum[t] = total;
    }
    const samples = new Float32Array(n * 3);
    const heights = new Float32Array(n);
    for (let s = 0; s < n; s++) {
      const r = Math.random() * total;
      let l = 0,
        h = tris - 1;
      while (l < h) {
        const mid = (l + h) >> 1;
        if (cum[mid] < r) l = mid + 1;
        else h = mid;
      }
      let u = Math.random(),
        w = Math.random();
      if (u + w > 1) {
        u = 1 - u;
        w = 1 - w;
      }
      for (let d = 0; d < 3; d++)
        samples[s * 3 + d] =
          posed[l * 9 + d] +
          (posed[l * 9 + 3 + d] - posed[l * 9 + d]) * u +
          (posed[l * 9 + 6 + d] - posed[l * 9 + d]) * w;
      const y = restY[l * 3] + (restY[l * 3 + 1] - restY[l * 3]) * u + (restY[l * 3 + 2] - restY[l * 3]) * w;
      heights[s] = THREE.MathUtils.clamp((y - lo) / (hi - lo), 0, 1);
    }
    const frame = new THREE.Matrix4();
    const offset = new THREE.Matrix4().makeTranslation(cx, 0, cz);
    const matrixWorld = () => frame.multiplyMatrices(k.group.matrixWorld, offset);
    let silhouette = null;
    const A = k.bodyMat.userData.uniforms,
      B = k.helmMat.userData.uniforms;
    const both = (name, k = 1) => ({
      get value() {
        return A[name].value / k;
      },
      set value(x) {
        A[name].value = x * k;
        B[name].value = x * k;
      },
    });
    const bothColor = (name) => ({
      value: {
        copy(x) {
          A[name].value.copy(x);
          B[name].value.copy(x);
          return A[name].value;
        },
      },
    });
    // (The armor's frost glaze if it has one; otherwise the frost washes him in the edge's
    // pale tone, the dissolve's glow.)
    let frost = 0;
    const frosty = A.uFrost
      ? both('uFrost')
      : {
          get value() {
            return frost;
          },
          set value(x) {
            frost = x;
            A.uGlow.value = B.uGlow.value = x * 0.85;
          },
        };
    const head = new THREE.Vector3();
    return {
      get matrixWorld() {
        return matrixWorld();
      },
      samples,
      heights,
      span: new THREE.Vector2(lo, hi),
      silhouette: () =>
        (silhouette ??= weaponSilhouette(
          new Map([
            [
              { geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(posed, 3)) },
              new THREE.Matrix4(),
            ],
          ]),
          0.02,
        )),
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
        const ang = rng() * Math.PI * 2,
          r = 0.45 + rng() * 0.35;
        return out.set(Math.cos(ang) * r, 0.05, Math.sin(ang) * r).applyMatrix4(matrixWorld());
      },
      uniforms: {
        // (He never glows in the edge's color: a blade forms glowing, but a whole knight washed
        // in it reads as a flat cut-out, not as him. He forms in his own steel behind the
        // burning edge, each of the lightning's jumps flashing him up his own ramp (uLift, as a
        // new helmet does); formed, the fire's reflection sweeps him: scene.js.)
        uDissolve: both('uDissolve'),
        uGlow: both('uGlow', 0.5),
        uFlip: both('uFlip'),
        uLift: both('uLift'),
        uEdge: bothColor('uEdge'),
        uEdgeHot: bothColor('uEdgeHot'),
        uFrost: frosty,
        uFrostColor: A.uFrostColor ? bothColor('uFrostColor') : { value: new THREE.Color() },
      },
      // (A ghost casts no shadow: the lightning's strobe needn't redraw it.)
      show(on) {
        if (k.ghost) k.group.visible = on;
        else setShown(k, on);
      },
      ghost(on) {
        setGhost(k, on);
      },
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
    if (k.forging === 'out') {
      vanish(k);
      recount();
      return true;
    }
    const glow = k.bodyMat.userData.uniforms.uGlow.value;
    endForge(k);
    k.group.visible = true;
    setShown(k, true);
    setGhost(k, false);
    // (The forge's wash ends as he stands whole; what's left of it flashes in his own tones.)
    for (const m of [k.bodyMat, k.helmMat]) {
      m.userData.uniforms.uDissolve.value = 0;
      m.userData.uniforms.uFlip.value = 0;
      m.userData.uniforms.uGlow.value = 0;
    }
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
      list.push({
        x: sparkAt.x + (Math.random() - 0.5) * 0.15,
        y: sparkAt.y + (Math.random() - 0.3) * 0.12,
        z: sparkAt.z + (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.5 + Math.random() * 0.9,
        vz: (Math.random() - 0.5) * 0.5,
      });
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
      const p = g.attributes.position,
        si = g.attributes.skinIndex;
      if (!p || !si) continue;
      for (let i = 0; i < p.count; i++) {
        const b = ALL_BONES[si.getX(i)];
        const from = t.restPos[b],
          to = T0.restPos[b];
        p.setXYZ(i, p.getX(i) + to[0] - from[0], p.getY(i) + to[1] - from[1], p.getZ(i) + to[2] - from[2]);
      }
      p.needsUpdate = true;
      g.computeBoundingSphere();
    }
    const out = {
      ...T0,
      root: t.root,
      bodyGeo: t.bodyGeo,
      helmGeos: t.helmGeos,
      bodySpan: t.bodySpan,
      helmSpan: t.helmSpan,
    };
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
      HELMETS.forEach((h, j) => {
        k.helms[h].geometry = T.helmGeos[j];
      });
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
        if (k.swap) {
          const s = k.swap;
          k.swap = null;
          wear(k, s.to);
          s.resolve(true);
        }
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
    const d = burning
      ? t / RESTYLE_BURN
      : t < RESTYLE_BURN + RESTYLE_GAP
        ? 1
        : Math.max(0, 1 - (t - RESTYLE_BURN - RESTYLE_GAP) / RESTYLE_BURN);
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
      if (formed && !r.flashed) {
        setGhost(k, false);
        setHelmGhost(k, false);
        flash(k, 0.9);
        sparksFrom(k, 14);
      }
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
    if (k.swap) {
      k.swap.resolve(false);
      k.swap = null;
      setHelmGhost(k, false);
    }
    if (name === k.helmet && !k.swap) return Promise.resolve(true);
    if (instant || reducedMotion || !k.present || k.fade) {
      wear(k, name);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      k.swap = { t: 0, from: k.helmet, to: name, switched: false, resolve };
      // (Dancing, he changes it without stopping: the helm burns and forms on its own.)
      if (k.gestureName !== 'dance') {
        k.gestureName = 'helm';
        k.gestureT = 0;
      }
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
    if (s.t < 0.75) {
      u.uFlip.value = 1;
      u.uDissolve.value = (s.t - 0.3) / 0.45;
      if (Math.random() < 0.6) sparksFrom(k, 1, BONE_INDEX.head);
      return;
    }
    if (!s.switched) {
      s.switched = true;
      wear(k, s.to);
      u.uFlip.value = 0;
    }
    if (s.t < 1.2) {
      u.uDissolve.value = 1 - (s.t - 0.75) / 0.45;
      return;
    }
    if (!s.puffed) {
      s.puffed = true;
      u.uDissolve.value = 0;
      setHelmGhost(k, false);
      flash(k, 0.9, true);
      sparksFrom(k, 14, BONE_INDEX.head);
    }
    if (s.t >= HELM_TIME) {
      k.swap = null;
      s.resolve(true);
    }
  }

  // --- actions ----------------------------------------------------------------------------------------
  // A knight runs one action at a time (getting up, walking, turning, sitting down, settling
  // onto his seat, starting a dance); what he was asked to do next waits in his queue.
  function startCrossfade(k, dur = CROSSFADE) {
    k.from.set(k.pose);
    k.blend = 0;
    k.blendRate = 1 / dur;
  }
  function run(k) {
    while (!k.act && k.queue.length) {
      const next = k.queue.shift();
      k.act = next.start?.() === false ? null : next;
      if (k.act) k.act.t = 0;
    }
  }
  function enqueue(k, ...acts) {
    k.queue.push(...acts);
    run(k);
  }
  function clearActs(k) {
    k.act = null;
    k.queue.length = 0;
  }
  /** Asked for something new halfway through an ember walk: he forms again where he is. */
  function stayPut(k) {
    if (k.fade?.done) fade(k, 0);
  }

  const act = {
    rise: (k) => ({
      kind: 'rise',
      dur: RISE_TIME,
      start: () => {
        if (k.mode !== 'sit') return false;
        standAtSeat(k);
      },
      end: () => {
        k.mode = 'stand';
      },
    }),
    lower: (k) => ({
      kind: 'lower',
      dur: RISE_TIME,
      start: () => {
        if (k.mode === 'sit') return false;
      },
      end: () => {
        k.mode = 'sit';
        k.dancing = null;
        // (His seat pose changed as he sat down: he eases over to where it sits.)
        if (rehome(k)) {
          startCrossfade(k, 0.9);
          seatPoseOf(k);
        }
      },
    }),
    /**
     * Walk to x, z (knightPlaces.js planWalk): straight, or round the fire when the straight
     * way passes it; too far or blocked, he burns away and forms there.
     */
    go: (k, x, z) => ({
      kind: 'walk',
      dur: 0,
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
        if (this.teleport)
          fade(k, 1, () => {
            k.group.position.copy(this.to);
            fade(k, 0);
          });
      },
      /** Where he is `s` m along the walk (into `out`), and which way it goes there. */
      along(s, out) {
        let i = 1;
        while (i < this.pts.length - 1 && this.at[i] < s) i++;
        const a = this.pts[i - 1],
          b = this.pts[i];
        const u = Math.min(1, Math.max(0, (s - this.at[i - 1]) / Math.max(1e-6, this.at[i] - this.at[i - 1])));
        out.lerpVectors(a, b, u);
        this.heading = Math.atan2(b.x - a.x, b.z - a.z);
        return out;
      },
      end() {
        if (!this.teleport) k.group.position.copy(this.to);
      },
    }),
    turn: (k, yaw) => ({
      kind: 'turn',
      dur: 0,
      start() {
        reroot(k);
        let d = (yaw - k.yaw) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        else if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 0.08) {
          k.yaw = yaw;
          return false;
        }
        this.from = k.yaw;
        this.d = d;
        this.dur = Math.abs(d) / TURN_SPEED + 0.15;
      },
      end() {
        k.yaw = this.from + this.d;
      },
    }),
  };
  /**
   * Move where he's placed without moving him: his pose takes up the difference. (His pose is
   * stepped again at once, not at the fire's next frame: till then his bones would be posed
   * as before, from the new place.)
   */
  function shiftPlace(k, to) {
    const d = new THREE.Vector3().subVectors(k.group.position, to).applyAxisAngle(Y_AXIS, -k.yaw);
    k.group.position.copy(to);
    k.lastStep = -1;
    shadowDirty = true;
    for (const p of [k.pose, k.from, k.work]) {
      p[0] += d.x;
      p[1] += d.y;
      p[2] += d.z;
      p[32] += d.x;
      p[33] += d.y;
      p[34] += d.z; // (legs: x is outward, so the right one's goes the other way)
      p[37] -= d.x;
      p[38] += d.y;
      p[39] += d.z;
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
    const x = k.stand[0],
      z = k.stand[2];
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
      if (!reducedMotion) idle(p, k.clock, k.seed, seated, sitsAs(k.home, styleOf(k)) === 'watchful' ? 1 : 0);
    }
    // A gesture over whatever he's doing (the site's dance faces the front: the cameras;
    // with no headroom when it started, he dances it in his seat).
    if (k.gestureName) {
      const inPlace = k.gestureName === 'dance' && k.danceInPlace;
      const T = inPlace ? DANCE_SEATED_TIME : (GESTURE_TIME[k.gestureName] ?? 1.5);
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
      if (t - k.react.flinch < 1.4) {
        flinch(p, t - k.react.flinch, k.react.flinchK, seated);
        big = true;
      }
      if (t - k.react.stoke < 1.3) {
        shield(p, t - k.react.stoke, 1, seated);
        big = true;
      }
      if (t - k.react.hop >= 0 && t - k.react.hop < 0.6) {
        hop(p, t - k.react.hop, 1, seated, k.home?.rise);
        big = true;
      }
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
    if (k.blend < 1) {
      lerpPose(p, k.from, p, k.blend);
      big = true;
    }
    // Sitting on the ground at home (the ruins' seat, the others' places in Bonfire Live), and
    // sitting down onto it: his gestures and moves were made for a seat, and so was the way he
    // lowers himself (his hands dropped to his knees on the way down), so a hand dropped low is
    // kept off the floor. (Sitting down he's still 'stand' till he's down, but already placed
    // at home.)
    const h = k.home;
    if (
      (seated || a?.kind === 'lower') &&
      h &&
      h.h < 0.12 &&
      Math.hypot(k.group.position.x - h.x, k.group.position.z - h.z) < 0.05
    )
      floorArms(p, FLOOR_HANDS + (h.floor ??= floorOf(h)), rig);
    return big;
  }

  // --- keeping his arms out of the scenery -----------------------------------------------------------
  // (knightClear.js does it, createClearance above; the shapes it's asked about are this scenery's.)
  /** The scenery's shapes near where knight k stands (kept until he moves). */
  function nearOf(k) {
    const { x, z } = k.group.position;
    const n = k.near;
    if (n && n.scenery === sceneryName && Math.abs(n.x - x) < 0.05 && Math.abs(n.z - z) < 0.05) return n.list;
    k.near = { scenery: sceneryName, x, z, list: collidersNear(sceneryName, x, z, CLEAR_NEAR) };
    return k.near.list;
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
    stepRestyle(dt); // (a style swap burning through them)
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
        if (a.t >= a.dur) {
          a.end?.();
          k.act = null;
          startCrossfade(k);
          run(k);
        }
      }
      if (k.blend < 1) k.blend = Math.min(1, k.blend + dt * (k.blendRate ?? 1 / CROSSFADE));
      // Where he looks: the cursor on him (the camera), what he was asked to, or the moment's
      // attention (a rising or flying weapon).
      const target = hovered === k.index ? ctx.cameraAt : (k.lookAt ?? (reducedMotion ? null : ctx.lookAt));
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
    if (shadowDirty) {
      moving = true;
      shadowDirty = false;
    }
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
    if (instant || reducedMotion) {
      k.fade = null;
      setGhost(k, false);
      for (const m of [k.bodyMat, k.helmMat]) m.userData.uniforms.uDissolve.value = 0;
    } else if (forge) {
      beginForge(k, 'in');
      setGhost(k, true);
      for (const m of [k.bodyMat, k.helmMat]) {
        m.userData.uniforms.uDissolve.value = 1;
        m.userData.uniforms.uGlow.value = 0;
      }
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
    // Back in front of his seat; with none, down on the ground where he stands, a step behind
    // his feet or more by the fire (groundHome). (Up in front of where he sat, he's placed
    // where he sat: his place is moved under his feet first, or he'd sit down a step further
    // back each time.)
    reroot(k);
    const p = k.group.position;
    const home = (k.home = i === 0 && SEATS[sceneryName] ? homeFor(i) : groundHome(p.x, p.z, styleOf(k)));
    seatPoseOf(k);
    const spot = (home.stand ??= standSpot(home));
    const front = new THREE.Vector3(spot.x, 0, spot.z).applyAxisAngle(Y_AXIS, home.yaw);
    enqueue(
      k,
      ...(home.seat ? [act.go(k, home.x + front.x, home.z + front.z)] : []),
      act.turn(k, home.yaw),
      {
        kind: 'place',
        dur: 0,
        start() {
          shiftPlace(k, new THREE.Vector3(home.x, home.y, home.z));
          standAtSeat(k);
        },
      },
      act.lower(k),
    );
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
  function facingFor(x, z, facing) {
    return facingYaw(x, z, facing);
  }
  function danceFn(i, opts = {}) {
    if (!valid(i) || reducedMotion) return false;
    const k = knights[i];
    const prev = k.nextDance ?? k.dancing;
    const seated = opts.seated ?? prev?.seated ?? false;
    const next = {
      move: opts.move ?? prev?.move ?? 'nod',
      energy: opts.energy ?? prev?.energy ?? 0.7,
      offset: opts.offset ?? prev?.offset ?? 0,
      seed: opts.seed ?? prev?.seed ?? k.seed,
      seated,
    };
    const where = opts.slot != null || opts.position ? placeFor(i, opts) : null;
    // Burning away, or on an ember walk: he comes back (forming where he is) and goes to
    // dance from there.
    if (leaving(k)) summon(i);
    else stayPut(k);
    // Not here yet: he forms right there, on his feet and dancing (or seated, to dance sitting).
    if (!k.present) {
      const to = seated ? null : (where ?? placeFor(i));
      summon(i, seated ? {} : { at: to, facing: opts.facing ?? 'front' });
      k.dancing = k.nextDance = next;
      k.danceAt = seated ? { seated } : { x: to.x, z: to.z, yaw: k.yaw, seated };
      return true;
    }
    // Dancing (or on his way to dance) there already: a new move crossfades in; the energy
    // and the offset just change. (The visualizer can call this every bar.)
    const at = k.danceAt;
    if (at && at.seated === seated) {
      const same =
        seated ||
        ((!where || Math.hypot(where.x - at.x, where.z - at.z) < 0.05) &&
          (opts.facing == null || Math.abs(Math.sin((facingFor(at.x, at.z, opts.facing) - at.yaw) / 2)) < 0.03));
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
    const start = {
      kind: 'dance',
      dur: 0,
      start() {
        k.mode = seated ? 'sit' : 'stand';
        k.dancing = k.nextDance;
        return false;
      },
    };
    if (seated) {
      if (k.mode !== 'sit') {
        sit(i);
        k.nextDance = next;
        k.danceAt = { seated };
        enqueue(k, start);
      } else {
        clearActs(k);
        startCrossfade(k, 0.5);
        k.dancing = k.nextDance = next;
        k.danceAt = { seated };
      }
      return true;
    }
    clearActs(k);
    startCrossfade(k);
    k.dancing = null;
    const to =
      where ??
      (at && !at.seated ? at : k.mode === 'sit' ? placeFor(i) : { x: k.group.position.x, z: k.group.position.z });
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
        const h =
          helmets === 'random'
            ? HELMETS[Math.floor(Math.random() * HELMETS.length)]
            : Array.isArray(helmets)
              ? helmets[i % helmets.length]
              : helmets;
        setHelmetOf(k, h, instant || !k.present);
      }
    });
  }
  function setHelmet(name, { index = null, instant = false } = {}) {
    const list =
      index == null ? knights.filter((k) => k.present || k.index < cast) : valid(index) ? [knights[index]] : [];
    return Promise.all(list.map((k) => setHelmetOf(k, name, instant))).then((r) => r.every(Boolean));
  }
  /**
   * A gesture; true if anyone started it (a knight changing helmets has his hands full, and
   * one dancing the site's dance finishes it).
   */
  function gestureFn(name, { index = 0 } = {}) {
    if (!GESTURE_TIME[name] || reducedMotion) return false;
    const ks =
      index === 'all'
        ? knights.filter((k) => k.present)
        : valid(index) && knights[index].present
          ? [knights[index]]
          : [];
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
      // (Only a change eases him over, where he sits: on the ground with no seat, to where the
      // new pose sits. Getting up or down, he's re-placed when he's down: act.lower.)
      if (k.present && k.mode === 'sit' && !k.act) startCrossfade(k, 0.9);
      if (!k.act) rehome(k);
      seatPoseOf(k, name);
    }
    return true;
  }
  /**
   * Knight k on the ground with no seat, whose home was made for another seat pose than he's
   * asked to sit in now: his home where this one sits (groundHome, from where he sat down
   * from). Sat there, he's moved to it, his pose kept where it was (shiftPlace): eased over by
   * the pose's crossfade, he shifts back (or forward) as he changes how he sits. Whether he
   * was moved.
   */
  function rehome(k) {
    const h = k.home,
      style = styleOf(k);
    if (!h || h.seat || !h.from || h.want === style) return false;
    const there = Math.hypot(k.group.position.x - h.x, k.group.position.z - h.z) < 0.05;
    k.home = groundHome(h.from.x, h.from.z, style);
    if (there) shiftPlace(k, new THREE.Vector3(k.home.x, k.home.y, k.home.z));
    return there;
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
      if (leaving(k)) {
        vanish(k);
        left = true;
      }
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
      feet.x = feet.x * 0.5 + up.x * 0.5;
      feet.z = feet.z * 0.5 + up.z * 0.5;
      feet.y += 0.25;
      head.y += 0.12;
      out.push({ a: feet, b: head, r: 0.32, index: k.index });
    }
    return out;
  }
  const hit = new THREE.Vector3();
  const seg = new THREE.Vector3();
  /** The knight a ray passes through (index), or -1; `out.distance` how far along the ray he is. */
  function pick(ray, out = null) {
    let best = -1,
      bestD = Infinity;
    for (const c of capsules()) {
      const d = ray.distanceSqToSegment(c.a, c.b, hit, seg);
      if (d < c.r * c.r * 0.7) {
        const along = hit.distanceTo(ray.origin);
        if (along < bestD) {
          bestD = along;
          best = c.index;
        }
      }
    }
    if (out) out.distance = bestD;
    return best;
  }
  /**
   * Dancing on his feet (or on his way to), or cheering: a flinch or a lean would bury the
   * move (the drop's leap, Praise the Sun), so he doesn't. He still hops a ring.
   */
  const performing = (k) =>
    !!((k.nextDance ?? k.dancing) && !(k.nextDance ?? k.dancing).seated) || CHEERING.has(k.gestureName);
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
        if (near || !performing(k)) {
          k.react.flinch = k.clock + Math.random() * 0.05;
          k.react.flinchK = Math.min(1, strength) * (near && performing(k) ? 0.6 : 1);
        }
      } else if (kind === 'stoke') {
        if (!performing(k)) k.react.stoke = k.clock;
      } else if (kind === 'ring') {
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
  // (positions, read every frame for the cameras: one array, a vector a knight, filled in
  // place each read instead of built anew.)
  const heads = knights.map(() => new THREE.Vector3());
  const headList = [];

  return {
    group: root,
    materials,
    /** Every template's geometry (the knight's own and any other style's model built since). */
    get geometries() {
      return [...templates.values()].flatMap((t) => [t.bodyGeo, ...t.helmGeos]);
    },
    skeletons: knights.map((k) => k.skeleton),
    rig,
    update,
    setRamp,
    /** The armor's finish (steel.js FINISHES) and the fire's rim on his edges (0..1): armor.js. */
    setFinish: (name) => armor.setFinish?.(name),
    get finish() {
      return armor.finish ?? 'gunmetal';
    },
    setRim: (v) => armor.setRim?.(v),
    get rim() {
      return armor.rim ?? 0.5;
    },
    /**
     * The style (knightStyles.js): its shader, from the model `model` (its loaded scene; null
     * the knight's own). Knights who are here burn away and form again in it (~1.2 s;
     * `instant`: at once). Resolves true once it shows.
     */
    setStyle,
    get style() {
      return armor.style;
    },
    /** A style swap is burning through them. */
    get restyling() {
      return !!restyle;
    },
    /**
     * Another style's model, its template built beforehand (templateSteps over its scene, in
     * idle moments: scene.js): setStyle() with it then needn't build it on the spot.
     */
    adoptTemplate(t) {
      if (t?.root) adopt(t);
    },
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
      return !!(
        k.gestureName ||
        k.swap ||
        k.act ||
        k.queue.length ||
        k.dancing ||
        k.nextDance ||
        restyle?.ks.includes(k)
      );
    },
    setScenery,
    react,
    capsules,
    pick,
    summon,
    dismiss,
    sit,
    stand,
    dance: danceFn,
    setCast,
    setHelmet,
    gesture: gestureFn,
    setSeatPose,
    /** How they sit (setSeatPose): 'resting' | 'watchful'. */
    get seatPose() {
      return seatStyle;
    },
    /**
     * Whether the view has room over his seat for him to stand up in (scene.js sets it: not
     * on a phone's tall view, which frames his seat right under the page's header). Without
     * it, the site's dance (gesture 'dance') is danced in his seat; one under way keeps its way.
     */
    get headroom() {
      return headroom;
    },
    set headroom(on) {
      headroom = !!on;
    },
    /** The forge's side of summon/dismiss({ forge: true }): his posed body as a forge subject, and the end. */
    forgeSubject,
    forged,
    /** The beat (every frame, from the music): `beatPos` in beats, `period` s a beat. */
    clock(beatPos, period = beat.period) {
      beat = { pos: beatPos, period: Math.max(0.2, period), at: simT };
    },
    lookAt(point, { index = null } = {}) {
      for (const k of index == null ? knights : valid(index) ? [knights[index]] : [])
        k.lookAt = point ? new THREE.Vector3().copy(point) : null;
    },
    slots: (name = sceneryName) => ringOf(name),
    /**
     * Whether a dance move (MOVES) has room at a place on the ground ({ x, z }) facing `facing`
     * (as dance() takes it) in a scenery (this one by default): its reach (colliders.js
     * MOVE_REACH) clear of the scenery's shapes there, with 5 cm to spare. The show leaves out
     * one that doesn't.
     */
    fits: (move, at, facing = 'fire', name = sceneryName) =>
      fitsAt.fits(name, move, at.x, at.z, facingFor(at.x, at.z, facing)),
    /** A beat (0..1): the armor glints, a step up the ramp for a moment. */
    beat(s = 1) {
      if (!reducedMotion) armor.uniforms.uGlint.value = Math.max(armor.uniforms.uGlint.value, 0.25 * s);
    },
    set hovered(i) {
      hovered = valid(i) && knights[i].present ? i : -1;
    },
    get hovered() {
      return hovered;
    },
    get moving() {
      return moving;
    },
    get count() {
      return cast;
    },
    get present() {
      return knights.filter((k) => k.present).length;
    },
    max: knights.length,
    get helmet() {
      return knights[0].helmet;
    },
    set helmet(name) {
      setHelmet(name);
    },
    get list() {
      return knights.map((k) => ({
        index: k.index,
        present: k.present,
        state: !k.present
          ? 'away'
          : k.forging
            ? k.forging === 'in'
              ? 'arriving'
              : 'leaving'
            : k.fade
              ? k.fade.done
                ? 'ember'
                : k.fade.to
                  ? 'leaving'
                  : 'arriving'
              : (k.act?.kind ?? (k.dancing ? 'dancing' : k.mode === 'sit' ? 'sitting' : 'standing')),
        position: k.group.position.clone(),
        facing: k.yaw,
        helmet: k.helmet,
        move: k.dancing?.move ?? null,
      }));
    },
    /**
     * Where each present knight's head is (world), in knight order. The same array each read,
     * and the same vector for each knight, updated in place: good until the next read (the
     * director reads it once a frame for the cameras); copy what you keep longer.
     */
    get positions() {
      let n = 0;
      for (const k of knights) {
        if (k.present && k.solved)
          headList[n++] = heads[k.index]
            .copy(k.solved.p[BONE_INDEX.head])
            .applyAxisAngle(Y_AXIS, k.yaw)
            .add(k.group.position);
      }
      headList.length = n;
      return headList;
    },
    /** (Internals, for tests and debugging.) */
    knights,
    get terrain() {
      return terrain;
    },
  };
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
