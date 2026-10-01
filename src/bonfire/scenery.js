// Other places for the fire: the model's Gothic ruins, a blacksmith's forge, a hillside
// shrine, a cathedral's altar, or a cult's altar. The fire pit, the ground and the
// flagstones stay; what stands around them changes. The new scenery is built here from
// low-poly primitives in the model's own materials (so it outlines, lights and quantizes
// like the rest), and stands where the ruins do: its tops are where the fireflies like to
// land, and the rings of fire still break against it.
//
//   forge      back right, a stone hearth with a firebox of coals under a tapering chimney
//              and a bellows; back left, an anvil on a stump, a hammer, a quench barrel
//   shrine     back right, a torii gate over two steps; back left and front left, stone
//              lanterns with glowing paper windows; an offering stone roped round
//   cathedral  back right, the chancel: an altar on a stepped dais, candles, and a lancet
//              window of stained glass under a pointed arch between broken walls; back
//              left, a nave column pair with a broken arch; front left, a pew and a
//              cluster of floor candles
//   cult       back right, a slab altar on a round dais, carved with a glowing sigil (the
//              NH monogram, ui/logo.js), ember bowls and black candles, two hooded stone
//              figures behind it; back left, standing stones carved with the same sigil;
//              front left, a hooded watcher; a half ring of black candles behind the fire
//
// In every one there's a seat for the knight (knights.js) behind the fire on the left, well
// back from it (his boots clear of the ring stones and the flames), where the site's cameras
// see him three-quarter-on without him covering the fire, the weapon or the page: a drum
// fallen from the ruins' pillar (the one piece built here for the ruins), the cathedral's
// fallen nave drum, the cult's fallen standing stone, a stump by the forge's anvil, a
// resting stone at the shrine (SEATS, knightPlaces.js). His summon sign lies in front of it
// (summonSign.js). Dancers (Bonfire Live) stand on a ring round the
// fire, in the arcs each scenery leaves clear (DANCE_RING, danceSlots).
//
// Built so the pixel pass draws it cleanly (the rules the forge and shrine taught):
//   - faces stay flat: the hand-made look is a slight lean, twist and uneven scale of each
//     whole piece (an affine change), never per-vertex jitter on a quad, which bends a face
//     into two triangles and draws a seam across it (rocks, all triangles, can be jagged)
//   - no hair-thin gaps: courses of blocks have a recessed core behind them (like the ruins'
//     wall), so a joint shows a darker line a few centimetres back, not a dashed outline
//     of whatever is far behind it; nothing is left open to see through
//   - nothing coplanar: parts that meet overlap by a centimetre or so instead of touching
//     face to face, and glows are drawn a hair in front (polygon offset), so nothing
//     z-fights
//   - nothing thinner than a few texels at the usual distance (cords, handles, rope)
//   - glows have kinds (scene.js): embers flicker like the coals, lamps and candles hold a
//     steady light with an occasional dip, the same for every window of one lamp, stained
//     glass and runes keep their tone and breathe slowly
import * as THREE from 'three';
import { SEATS } from './knightPlaces.js';
import { CLEARING, FORGE, SHRINE, CATHEDRAL, CULT, HOODED } from './colliders.js';
import { logoBars } from '../ui/logo.js';
import { mergeStatic } from './sceneryMerge.js';

export { SCENERIES } from '../sceneries.js';
// The knights' seats and the dance ring live in knightPlaces.js (pure: the visualizer uses them too).
export { SEATS, DANCE_RING, danceSlots } from './knightPlaces.js';

// Where the ruins stand (three.js coordinates: the model's +y is -z here). These and each
// piece's size and place below come from colliders.js, which makes the knights' shapes of
// them from the same numbers.
const LEFT = new THREE.Vector3(CLEARING.left[0], 0, CLEARING.left[1]);
const RIGHT = new THREE.Vector3(CLEARING.right[0], 0, CLEARING.right[1]);
const FRONT_LEFT = new THREE.Vector3(CLEARING.frontLeft[0], 0, CLEARING.frontLeft[1]);
const RIGHT_TURN = CLEARING.rightTurn;
const UP = new THREE.Vector3(0, 1, 0);
const SEEDS = { forge: 7, shrine: 11, cathedral: 23, cult: 31 };
/**
 * The most small point lights (lamps) a scenery may have: scene.js keeps this many in a
 * fixed pool, so a new place changes no light count and no shader is rebuilt (it lights
 * only this many; test/knightPlaces.test.mjs checks no scenery has more).
 */
export const MAX_LAMPS = 3;

/** A seeded random (the same scenery every time). */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * A hand-set look that keeps every face flat: the whole piece leans and turns a little and
 * its sides differ slightly in size. `amount` ~0.01 is a careful mason, 0.03 a rough one.
 */
function lean(geo, amount, rand) {
  const k = amount / 0.012;
  const r = () => (rand() - 0.5) * k;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r() * 0.05, r() * 0.08, r() * 0.05));
  m.scale(new THREE.Vector3(1 + r() * 0.05, 1 + r() * 0.04, 1 + r() * 0.05));
  geo.applyMatrix4(m);
  return geo;
}
/** Jagged: every vertex nudged on its own. Only for shapes made of triangles (rocks, cones). */
function jag(geo, amount, rand) {
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]);
    const [dx, dy, dz] = seen.get(key);
    p.setXYZ(i, p.getX(i) + dx, p.getY(i) + dy, p.getZ(i) + dz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build one scenery (for 'ruins', the model's own, only the knight's seat). `mat`: the model's
 * materials by name (stone, pillar, wood, char, wax, mortar), `glowMaterial()`: a new glowing
 * material. Returns { group, glows, lights }:
 * each glow carries userData.glow = { kind, id, tone }; `lights` are
 * [{ at: Vector3, intensity, distance }] for small point lights (MAX_LAMPS at most).
 */
export function buildScenery(name, mat, glowMaterial) {
  const group = new THREE.Group();
  group.name = `Scenery_${name}`;
  const glows = [];
  const lights = [];
  const rand = rng(SEEDS[name] ?? 5);
  let lampId = 0;

  /** A mesh: `rough` leans the piece (lean()), `jagged` roughens a rock (jag()). */
  const add = (geo, material, x, y, z, { rx = 0, ry = 0, rz = 0, parent = group, rough = 0.012, jagged = 0, scale = null } = {}) => {
    if (jagged) jag(geo, jagged, rand);
    else if (rough) lean(geo, rough, rand);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    if (scale) mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  };
  /** A glowing part: drawn a hair in front of anything it touches. kind: ember | lamp | flame | glass | rune. */
  const glow = (geo, x, y, z, { kind = 'ember', id = 0, tone = 2, ...o } = {}) => {
    const material = glowMaterial();
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const m = add(geo, material, x, y, z, { rough: 0, ...o });
    m.userData.glow = { kind, id, tone };
    glows.push(m);
    return m;
  };
  /** A group placed in the clearing (or inside `parent`), turned `turn` about the vertical. */
  const place = (at, turn = 0, { parent = group, scale = 1 } = {}) => {
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = turn;
    g.scale.setScalar(scale);
    parent.add(g);
    return g;
  };
  /** A point light at local `p` of group `g` (world, for the scene). */
  const light = (g, p, intensity, distance) => {
    g.updateMatrixWorld(true);
    lights.push({ at: new THREE.Vector3(...p).applyMatrix4(g.matrixWorld), intensity, distance });
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r0, r1, h, seg = 8) => new THREE.CylinderGeometry(r1, r0, h, seg);
  const rock = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
  /** A candle of height h (its flame on top): wax, or black for the cult. */
  const candle = (g, x, y, z, h, { r = 0.032, material = mat.wax, id = lampId++ } = {}) => {
    add(cyl(r, r * 0.92, h, 6), material, x, y + h / 2, z, { parent: g, rough: 0.006 });
    glow(new THREE.SphereGeometry(1, 5, 4), x, y + h + 0.045, z, { parent: g, kind: 'flame', id, scale: [0.022, 0.05, 0.022] });
  };
  /**
   * A course of blocks over `spans` ([[x0, x1], …]: a gap between spans is an opening), from
   * y0, height h, depth d, with small joints and a core behind them set back a few
   * centimetres, so a joint never shows what's far behind it. Each core is inset a little
   * differently, so the cores of courses above and below never share a face.
   */
  const course = (g, spans, y0, h, d, { blockW = 0.4, offset = 0, material = mat.pillar, core = mat.mortar } = {}) => {
    for (const [x0, x1] of spans) {
      let x = x0 - offset;
      while (x < x1 - 0.05) {
        let w = blockW * (0.88 + rand() * 0.24);
        if (x1 - (x + w) < 0.12) w = x1 - x; // (no sliver at the end)
        const a = Math.max(x, x0), b = Math.min(x + w, x1);
        if (b - a > 0.1) add(box(b - a - 0.02, h - 0.016, d), material, (a + b) / 2, y0 + h / 2, 0, { parent: g, rough: 0.006 });
        x += w;
      }
      const inset = 0.01 + rand() * 0.02;
      if (core) add(box(x1 - x0 - inset * 2, h + 0.012, d - 0.1), core, (x0 + x1) / 2, y0 + h / 2, 0, { parent: g, rough: 0 });
    }
  };

  // ------------------------------------------------------------------------------------
  if (name === 'ruins') {
    // The ruins are the model's own; only the knight's seat is built here (scene.js adds it to
    // the model's pieces): a drum fallen from the pillar, lying by its plinth, half sunk in
    // the ground (a low seat), across his way to the fire.
    const seat = SEATS.ruins;
    add(cyl(0.16, 0.155, 0.52, 8), mat.pillar, seat.x, seat.top - 0.16, seat.z, { rz: Math.PI / 2, ry: Math.atan2(seat.x, seat.z) + 0.2, rough: 0.01 });

  // ------------------------------------------------------------------------------------
  } else if (name === 'forge') {
    // --- the hearth, back right: block courses round a firebox, a slab, a hood, a chimney
    const H = FORGE.hearth;
    const hearth = place(RIGHT, RIGHT_TURN);
    const D = H.depth;
    const whole = [[-H.half, H.half]];
    const sides = [[-H.half, -H.opening], [H.opening, H.half]]; // the firebox opening between them
    course(hearth, whole, ...H.courses[0], D);
    course(hearth, sides, ...H.courses[1], D, { offset: 0.2 });
    course(hearth, sides, ...H.courses[2], D);
    course(hearth, whole, ...H.courses[3], D, { offset: 0.2 });
    // The firebox: a sooty back wall and floor, a heap of coals and a glowing bed.
    add(box(0.74, 0.46, 0.08), mat.char, 0, 0.46, -0.32, { parent: hearth, rough: 0 });
    add(box(0.74, 0.03, 0.66), mat.char, 0, 0.245, -0.02, { parent: hearth, rough: 0 });
    glow(box(0.6, 0.03, 0.44), 0, 0.265, 0.02, { parent: hearth, kind: 'ember', tone: 1 });
    for (let i = 0; i < 9; i++) {
      glow(rock(0.045 + rand() * 0.035), -0.24 + rand() * 0.48, 0.29 + rand() * 0.03, -0.12 + rand() * 0.3, { parent: hearth, kind: 'ember', jagged: 0.02 });
    }
    add(box(...H.slab.size), mat.stone, 0, H.slab.y, 0, { parent: hearth, rough: 0.008 });           // the hearth slab
    add(cyl(...H.hood.r, H.hood.h, 4), mat.pillar, 0, H.hood.y, 0, { parent: hearth, ry: Math.PI / 4 });        // the hood
    add(cyl(...H.chimney.r, H.chimney.h, 4), mat.pillar, 0, H.chimney.y, H.chimney.z, { parent: hearth, ry: Math.PI / 4 });      // the chimney
    // Bellows beside it: a leather wedge between two boards.
    add(box(0.5, 0.05, 0.34), mat.wood, 1.14, 0.5, 0.1, { parent: hearth, rz: -0.25 });
    add(box(0.5, 0.05, 0.34), mat.wood, 1.14, 0.36, 0.1, { parent: hearth });
    add(box(0.44, 0.14, 0.3), mat.char, 1.12, 0.43, 0.1, { parent: hearth, rz: -0.12 });
    add(cyl(0.035, 0.035, 0.3, 6), mat.char, 0.82, 0.42, 0.1, { parent: hearth, rz: Math.PI / 2 });   // its nozzle
    light(hearth, [0, 0.5, 0.65], 1.4, 2.6);

    // --- the anvil, back left
    const A = FORGE.anvil, B = FORGE.barrel;
    const smith = place(LEFT, A.turn);
    add(cyl(...A.stump.r, A.stump.h, 9), mat.wood, 0, 0.26, 0, { parent: smith });                          // the stump
    add(box(...A.foot.size), mat.char, 0, A.foot.y, 0, { parent: smith, rough: 0.004 });               // anvil foot
    add(box(...A.waist.size), mat.char, 0, A.waist.y, 0, { parent: smith, rough: 0 });                  // waist
    add(box(...A.face.size), mat.char, ...A.face.at, 0, { parent: smith, rough: 0.004 });            // face
    add(new THREE.ConeGeometry(A.horn.r, A.horn.length, 6), mat.char, ...A.horn.at, 0, { parent: smith, rz: -Math.PI / 2, rough: 0 }); // horn
    // A hammer lying on the face.
    add(cyl(A.handle.r, A.handle.r, A.handle.length, 6), mat.wood, ...A.handle.at, { parent: smith, rz: Math.PI / 2, ry: A.handle.turn, rough: 0 });
    add(box(...A.head.size), mat.stone, ...A.head.at, { parent: smith, ry: A.head.turn, rough: 0 });
    // A quench barrel, full to the brim (the barrel leans as one piece, water and all).
    // (behind the anvil, clear of the knight's seat)
    const barrel = place(new THREE.Vector3(B.at[0], 0, B.at[1]), 0, { parent: smith });
    barrel.rotation.set((rand() - 0.5) * 0.04, rand(), (rand() - 0.5) * 0.04);
    add(cyl(...B.r, B.h, 10), mat.wood, 0, 0.3, 0, { parent: barrel, rough: 0 });
    add(cyl(0.215, 0.215, 0.012, 10), mat.mortar, 0, 0.604, 0, { parent: barrel, rough: 0 });       // the water
    for (const y of [0.12, 0.48]) add(cyl(...B.hoop, 0.035, 10), mat.char, 0, y, 0, { parent: barrel, rough: 0 }); // hoops
    // Bar stock stacked by the anvil (each bar rests a little into the one below).
    for (let i = 0; i < 4; i++) add(box(0.7, 0.05, 0.06), mat.char, -0.45, 0.025 + i * 0.042, 0.45 + i * 0.02, { parent: smith, ry: 0.3 + i * 0.05, rough: 0.003 });

    // --- the knight's seat: a stump by the anvil, sawn flat (last, so nothing above moves)
    const seat = SEATS.forge;
    add(cyl(0.18, 0.16, seat.top, 9), mat.wood, seat.x, seat.top / 2, seat.z, { ry: 0.4 });
    add(cyl(0.145, 0.145, 0.014, 9), mat.char, seat.x, seat.top + 0.002, seat.z, { ry: 0.4, rough: 0 }); // its cut face

  // ------------------------------------------------------------------------------------
  } else if (name === 'shrine') {
    // --- the torii, back right, over two steps
    const T = SHRINE.torii;
    const gate = place(RIGHT, RIGHT_TURN);
    add(box(2.4, 0.12, 1.1), mat.stone, 0, 0.06, 0, { parent: gate, rough: 0.008 });
    add(box(2.0, 0.13, 0.8), mat.stone, 0, 0.18, -0.08, { parent: gate, rough: 0.008 });
    for (const x of T.posts) {
      add(cyl(...T.post.r, T.post.h, 8), mat.wood, x, T.post.y, T.z, { parent: gate, rough: 0.006 });
      add(cyl(T.footing.r, T.footing.r, T.footing.h, 8), mat.char, x, T.footing.y, T.z, { parent: gate, rough: 0 });        // the footing
    }
    const [nuki, shimaki, kasagi, gakuzuka] = T.beams;
    add(box(...nuki.size), mat.wood, 0, nuki.y, T.z, { parent: gate });                          // nuki (tie beam)
    add(box(...shimaki.size), mat.wood, 0, shimaki.y, T.z, { parent: gate });                           // shimaki
    add(box(...kasagi.size), mat.char, 0, kasagi.y, T.z, { parent: gate, rough: 0.006 });            // kasagi (top)
    add(box(...gakuzuka.size), mat.wood, 0, gakuzuka.y, T.z, { parent: gate });                         // gakuzuka
    // A paper lantern hanging from the tie beam on a cord lights the gate.
    const lamp = lampId++;
    add(cyl(T.lamp.cord.r, T.lamp.cord.r, T.lamp.cord.h, 5), mat.char, 0, T.lamp.cord.y, T.z, { parent: gate, rough: 0 });
    glow(cyl(T.lamp.r, T.lamp.r, T.lamp.h, 8), 0, T.lamp.y, T.z, { parent: gate, kind: 'lamp', id: lamp });
    for (const y of T.lamp.caps) add(cyl(0.1, 0.1, 0.05, 8), mat.char, 0, y, T.z, { parent: gate, rough: 0 });
    light(gate, [0, 1.4, 0.3], 0.9, 2.4);
    // A small offering stone in front of the gate, roped round.
    add(rock(T.offering.r), mat.stone, ...T.offering.at, { parent: gate, jagged: 0.03 });
    add(new THREE.TorusGeometry(0.21, 0.035, 4, 10), mat.wax, T.offering.at[0], 0.47, T.offering.at[2], { parent: gate, rx: Math.PI / 2, rough: 0 });

    // --- stone lanterns (tōrō): back left, and one front left. Each lights its own stone
    // from just outside the window that faces the fire.
    const L = SHRINE.lantern;
    const lantern = (at, turn, scale = 1) => {
      const t = place(at, turn, { scale });
      const id = lampId++;
      add(box(...L.base.size), mat.pillar, 0, L.base.y, 0, { parent: t });                              // base
      add(cyl(...L.post.r, L.post.h, 6), mat.pillar, 0, L.post.y, 0, { parent: t });                           // post
      add(box(...L.platform.size), mat.pillar, 0, L.platform.y, 0, { parent: t });                              // platform
      add(box(...L.box.size), mat.pillar, 0, L.box.y, 0, { parent: t, rough: 0 });                   // light box
      glow(box(0.2, 0.2, L.box.window), 0, L.box.y, 0, { parent: t, kind: 'lamp', id });                       // paper windows
      glow(box(L.box.window, 0.2, 0.2), 0, L.box.y, 0, { parent: t, kind: 'lamp', id });
      add(new THREE.ConeGeometry(L.roof.r, L.roof.h, 4), mat.pillar, 0, L.roof.y, 0, { parent: t, ry: Math.PI / 4, rough: 0 }); // roof
      add(new THREE.SphereGeometry(L.finial.r, 5, 4), mat.pillar, 0, L.finial.y, 0, { parent: t, rough: 0 });  // finial
      const toFire = new THREE.Vector3(-at.x, 0, -at.z).normalize().multiplyScalar(0.34 * scale);
      lights.push({ at: new THREE.Vector3(at.x + toFire.x, 1.18 * scale, at.z + toFire.z), intensity: 0.7, distance: 2 });
    };
    const AT = { left: LEFT, frontLeft: FRONT_LEFT };
    for (const l of SHRINE.lanterns) lantern(AT[l.at], l.turn, l.scale);

    // --- the knight's seat: a flat resting stone (last, so nothing above moves)
    const seat = SEATS.shrine;
    add(cyl(0.23, 0.2, seat.top, 7), mat.stone, seat.x, seat.top / 2, seat.z, { ry: 0.3, rough: 0.02 });

  // ------------------------------------------------------------------------------------
  } else if (name === 'cathedral') {
    // --- the chancel, back right: a stepped dais, the altar, a lancet window between walls
    const chancel = place(RIGHT, RIGHT_TURN);
    add(box(2.7, 0.1, 1.45), mat.stone, 0, 0.05, 0, { parent: chancel, rough: 0.006 });
    add(box(2.2, 0.11, 1.1), mat.stone, 0, 0.14, -0.12, { parent: chancel, rough: 0.006 });
    add(box(1.7, 0.11, 0.8), mat.stone, 0, 0.23, -0.24, { parent: chancel, rough: 0.006 });
    // The altar: a block with a slab on it and a pale frontal cloth.
    const C = CATHEDRAL;
    add(box(...C.altar.block.size), mat.pillar, 0, ...C.altar.block.at, { parent: chancel, rough: 0.006 });
    add(box(...C.altar.slab.size), mat.pillar, 0, ...C.altar.slab.at, { parent: chancel, rough: 0.004 });
    add(box(...C.altar.cloth.size), mat.wax, 0, ...C.altar.cloth.at, { parent: chancel, rough: 0 });
    add(box(0.46, 0.05, 0.03), mat.wax, 0, 0.745, -0.08, { parent: chancel, rough: 0 });
    for (const x of C.altar.candles.x) candle(chancel, x, C.altar.candles.y, C.altar.candles.z, C.altar.candles.h);
    // A gilded reliquary between them, its little window aglow.
    add(box(...C.altar.reliquary.size), mat.wax, 0, ...C.altar.reliquary.at, { parent: chancel, rough: 0 });
    glow(box(0.08, 0.08, 0.14), 0, 0.915, -0.34, { parent: chancel, kind: 'glass', tone: 3 });
    // The window: two lancets of stained glass split by a mullion, a rose above, framed by
    // shafts and a pointed arch.
    const WIN = C.window;
    const W = WIN.z;
    for (const x of WIN.shafts) {
      add(cyl(...WIN.shaft.r, WIN.shaft.h, 8), mat.pillar, x, WIN.shaft.y, W, { parent: chancel, rough: 0 });         // from the dais up
      add(box(...WIN.capital.size), mat.pillar, x, WIN.capital.y, W, { parent: chancel, rough: 0.004 });         // capital
    }
    const rise = 0.55, half = 0.8, spring = 2.84;
    const arcLen = Math.hypot(half, rise) + 0.12;
    const arcAng = Math.atan2(rise, half);
    add(box(arcLen, 0.14, 0.18), mat.pillar, -half / 2, spring + rise / 2, W, { parent: chancel, rz: arcAng, rough: 0 });
    add(box(arcLen, 0.14, 0.18), mat.pillar, half / 2, spring + rise / 2, W, { parent: chancel, rz: -arcAng, rough: 0 });
    // The panes run in behind the shafts, the mullion, the transom and the sill, so no slit of
    // background shows between them.
    const panes = [[-0.38, 1.11, 0.94, 1], [0.38, 1.11, 0.94, 2], [-0.38, 2.02, 0.84, 2], [0.38, 2.02, 0.84, 1]];
    for (const [x, y, h, tone] of panes) glow(box(0.7, h, 0.02), x, y, W - 0.02, { parent: chancel, kind: 'glass', tone });
    add(box(...WIN.mullion.size), mat.char, 0, WIN.mullion.y, W + WIN.mullion.z, { parent: chancel, rough: 0 });         // mullion
    add(box(1.46, 0.07, 0.07), mat.char, 0, 1.59, W + 0.02, { parent: chancel, rough: 0 });         // transom
    add(box(...WIN.sill.size), mat.pillar, 0, WIN.sill.y, W, { parent: chancel, rough: 0 });               // sill
    glow(cyl(WIN.rose.r, WIN.rose.r, 0.02, 10), 0, WIN.rose.y, W - 0.02, { parent: chancel, kind: 'glass', tone: 3, rx: Math.PI / 2 }); // the rose
    add(new THREE.TorusGeometry(WIN.rose.ring, WIN.rose.tube, 4, 10), mat.char, 0, WIN.rose.y, W + 0.01, { parent: chancel, rough: 0 });
    // Broken walls either side of the window, meeting its shafts.
    for (const [x, h] of C.walls.at) {
      for (let y = 0, i = 0; y < h; i++) {
        const bh = Math.min(0.5 + rand() * 0.2, h - y);
        add(box(C.walls.width - i * 0.03, bh + 0.02, C.walls.depth), mat.pillar, x + (rand() - 0.5) * 0.03, y + bh / 2, W, { parent: chancel, rough: 0.01 });
        y += bh;
      }
    }
    // Tall iron candle stands at the dais' corners.
    const S = C.stands;
    for (const x of S.x) {
      add(new THREE.ConeGeometry(S.foot.r, S.foot.h, 6), mat.char, x, S.foot.y, S.z, { parent: chancel, rough: 0 });
      add(cyl(...S.stem.r, S.stem.h, 6), mat.char, x, S.stem.y, S.z, { parent: chancel, rough: 0 });
      add(cyl(...S.dish.r, S.dish.h, 8), mat.char, x, S.dish.y, S.z, { parent: chancel, rough: 0 });
      candle(chancel, x, S.candle.y, S.z, S.candle.h, { r: S.candle.r });
    }
    light(chancel, [0, 1.15, 0.2], 1.2, 2.6);
    light(chancel, [0, 1.8, -0.35], 0.8, 2.2);

    // --- the nave, back left: two columns and a broken pointed arch, a fallen drum (the
    // knight's seat: SEATS.cathedral, in the nave's own space)
    const N = C.nave;
    const nave = place(LEFT, N.turn);
    const drum = new THREE.Vector3(SEATS.cathedral.x, 0, SEATS.cathedral.z).sub(LEFT).applyAxisAngle(UP, -N.turn);
    for (const x of N.columns) {
      add(box(...N.base.size), mat.pillar, x, N.base.y, 0, { parent: nave, rough: 0.008 });
      add(cyl(...N.shaft.r, N.shaft.h, 8), mat.pillar, x, N.shaft.y, 0, { parent: nave, rough: 0.006 });
      add(box(...N.capital.size), mat.pillar, x, N.capital.y, 0, { parent: nave, rough: 0.008 });
    }
    for (const a of N.arch) add(box(...a.size), mat.pillar, ...a.at, 0, { parent: nave, rz: a.roll, rough: 0.008 });  // the arch, broken off
    add(cyl(0.16, 0.16, 0.5, 8), mat.pillar, drum.x, SEATS.cathedral.top - 0.16, drum.z, { parent: nave, rz: Math.PI / 2, ry: 0.5, rough: 0.008 }); // (half sunk: a low seat)
    // (Rubble behind the drum, clear of where his boots go.)
    for (let i = 0; i < 5; i++) add(rock(0.05 + rand() * 0.05), mat.pillar, -0.55 + rand() * 0.5, 0.04, -0.05 + rand() * 0.35, { parent: nave, jagged: 0.02 });
    // A cluster of floor candles at the left column's foot.
    const cluster = place(new THREE.Vector3(N.candles.at[0], 0, N.candles.at[1]), 0, { parent: nave });
    const id = lampId++;
    for (const [x, z, h] of N.candles.list) candle(cluster, x, 0, z, h, { id });
    light(nave, [-0.62, 0.45, 0.66], 0.8, 2);

    // --- a pew, front left, turned toward the altar
    const P = C.pew;
    const pew = place(FRONT_LEFT, Math.atan2(RIGHT.x - FRONT_LEFT.x, RIGHT.z - FRONT_LEFT.z));
    add(box(...P.seat.size), mat.wood, 0, ...P.seat.at, { parent: pew });
    add(box(...P.back.size), mat.wood, 0, ...P.back.at, { parent: pew });
    for (const x of P.ends.x) add(box(...P.ends.size), mat.wood, x, ...P.ends.at, { parent: pew });
    add(box(...P.kneeler.size), mat.wood, 0, ...P.kneeler.at, { parent: pew });                              // the kneeler

  // ------------------------------------------------------------------------------------
  } else if (name === 'cult') {
    /** A hooded figure of stone: a robe, clasped sleeves, a hood with a dark face and glowing eyes. */
    const hooded = (g, x, z, turn, scale = 1) => {
      const f = place(new THREE.Vector3(x, 0, z), turn, { parent: g, scale });
      const H = HOODED;
      add(new THREE.ConeGeometry(H.robe.r, H.robe.h, 7), mat.pillar, 0, 0.81, 0, { parent: f, rough: 0.008 });
      add(new THREE.ConeGeometry(H.shoulders.r, H.shoulders.h, 7), mat.pillar, 0, ...H.shoulders.at, { parent: f, rough: 0 });   // shoulders
      add(rock(H.hood.r, 0), mat.pillar, 0, H.hood.y, 0, { parent: f, jagged: 0.02, scale: H.hood.scale });   // the hood
      add(box(...H.face.size), mat.char, 0, ...H.face.at, { parent: f, rough: 0 });                    // the face, in shadow
      const eyes = lampId++;
      for (const ex of [-H.eyes.x, H.eyes.x]) glow(box(0.035, 0.02, 0.02), ex, ...H.eyes.at, { parent: f, kind: 'rune', id: eyes, tone: 3 });
      add(box(...H.sleeves.size), mat.pillar, 0, ...H.sleeves.at, { parent: f, rough: 0.006 });            // clasped sleeves
    };
    /**
     * A sigil carved in a face: the NH monogram (ui/logo.js), `tall` m tall, in 3 cm strokes
     * (tall enough that its two inner stems keep a gap between them from the cameras), glowing.
     */
    const sigil = (g, x, y, z, tall, id = lampId++) => {
      for (const b of logoBars(tall, 0.03)) glow(box(b.len, b.width, 0.014), x + b.u, y + b.v, z, { parent: g, kind: 'rune', id, tone: 2, rz: b.angle });
    };

    // --- the altar, back right: a round dais, a slab on boulders, bowls of embers
    const A = CULT.altar;
    const altar = place(RIGHT, RIGHT_TURN);
    add(cyl(1.16, 1.1, 0.14, 12), mat.stone, 0, 0.07, 0, { parent: altar, rough: 0.006 });
    add(cyl(0.8, 0.76, 0.13, 12), mat.stone, 0, 0.19, -0.05, { parent: altar, rough: 0.006 });
    for (const x of A.boulders.x) add(rock(A.boulders.r, 0), mat.stone, x, A.boulders.y, 0, { parent: altar, jagged: 0.05, scale: [1, 1, 0.8] });
    add(box(...A.block.size), mat.pillar, 0, A.block.y, 0, { parent: altar, rough: 0.01 });
    add(box(...A.slab.size), mat.char, 0, A.slab.y, 0, { parent: altar, rough: 0.004 });
    // (One sigil on the block under the slab, between the boulders: the old three runes' lamp
    // ids are kept, so every later lamp still flickers as it did.)
    lampId += 2;
    sigil(altar, 0, 0.46, 0.2, 0.38);
    for (const x of A.boulders.x) {
      add(cyl(...A.bowls.r, A.bowls.h, 8), mat.char, x, ...A.bowls.at, { parent: altar, rough: 0 });
      for (let i = 0; i < 3; i++) glow(rock(0.045 + rand() * 0.02), x + (rand() - 0.5) * 0.1, 0.92, 0.06 + (rand() - 0.5) * 0.1, { parent: altar, kind: 'ember', jagged: 0.015 });
    }
    for (const [x, h] of A.candles) candle(altar, x, A.candleAt[0], A.candleAt[1], h, { material: mat.char });
    for (const [x, z, turn] of A.figures) hooded(altar, x, z, turn);
    light(altar, [0, 1.05, 0.4], 1.1, 2.6);

    // --- standing stones, back left, each carved with the sigil
    const stones = place(LEFT, CULT.stones.turn);
    for (const [x, z, w, h, t] of CULT.stones.list) {
      // (The stone leans as a whole, its sigil with it, so the sigil stays on its face.)
      const s = place(new THREE.Vector3(x, -0.04, z), (rand() - 0.5) * 0.3, { parent: stones });
      s.rotation.x = (rand() - 0.5) * 0.08;
      s.rotation.z = t;
      add(box(w, h, CULT.stones.depth), mat.stone, 0, h / 2, 0, { parent: s, rough: 0 });
      sigil(s, 0, h * 0.62, 0.14, Math.min(0.55, (w - 0.05) / 0.72)); // (as wide as the stone allows)
    }
    // A fallen one (the knight's seat: SEATS.cult, in the stones' own space).
    const fallen = new THREE.Vector3(SEATS.cult.x, 0, SEATS.cult.z).sub(LEFT).applyAxisAngle(UP, -CULT.stones.turn);
    add(box(0.9, 0.2, 0.3), mat.stone, fallen.x, 0.1, fallen.z, { parent: stones, ry: 0.5, rz: 0.08, rough: 0.03 });
    light(stones, [0, 1.0, 0.5], 0.7, 2.2);

    // --- a hooded watcher, front left, turned toward the fire
    hooded(group, FRONT_LEFT.x, FRONT_LEFT.z, Math.atan2(-FRONT_LEFT.x, -FRONT_LEFT.z), CULT.watcher.scale);

    // --- a half ring of black candles behind the fire (the two nearest the knight's seat stand
    // past it, so his boots go between them)
    const ring = lampId++;
    for (let i = 0; i < 7; i++) {
      const a = i < 2 ? Math.PI * (1.05 - i * 0.107) : Math.PI * (1.18 + (i / 6) * 0.64);
      candle(group, Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, 0.08 + rand() * 0.1, { material: mat.char, id: ring + i, r: 0.035 });
    }
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = !glows.includes(o); o.receiveShadow = true; } });
  // The still pieces drawn as one mesh per material (sceneryMerge.js): a draw or two a
  // material instead of one a block, the same picture. The glows stay as they are.
  mergeStatic(group, glows);
  return { group, glows, lights };
}
