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
//   cult       back right, a slab altar on a round dais, carved with glowing runes,
//              ember bowls and black candles, two hooded stone figures behind it; back
//              left, standing stones carved with runes; front left, a hooded watcher; a
//              half ring of black candles behind the fire
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

export { SCENERIES } from '../sceneries.js';

// Where the ruins stand (three.js coordinates: the model's +y is -z here).
const LEFT = new THREE.Vector3(-1.45, 0, -1.35);
const RIGHT = new THREE.Vector3(1.9, 0, -1.5);
const FRONT_LEFT = new THREE.Vector3(-1.9, 0, 0.6);
const RIGHT_TURN = THREE.MathUtils.degToRad(-28);
const SEEDS = { forge: 7, shrine: 11, cathedral: 23, cult: 31 };

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
 * Build one scenery. `mat`: the model's materials by name (stone, pillar, wood, char, wax,
 * mortar), `glowMaterial()`: a new glowing material. Returns { group, glows, lights }:
 * each glow carries userData.glow = { kind, id, tone }; `lights` are
 * [{ at: Vector3, intensity, distance }] for small point lights.
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
  if (name === 'forge') {
    // --- the hearth, back right: block courses round a firebox, a slab, a hood, a chimney
    const hearth = place(RIGHT, RIGHT_TURN);
    const D = 0.8;
    const whole = [[-0.85, 0.85]];
    const sides = [[-0.85, -0.36], [0.36, 0.85]]; // the firebox opening between them
    course(hearth, whole, 0, 0.24, D);
    course(hearth, sides, 0.24, 0.22, D, { offset: 0.2 });
    course(hearth, sides, 0.46, 0.22, D);
    course(hearth, whole, 0.68, 0.24, D, { offset: 0.2 });
    // The firebox: a sooty back wall and floor, a heap of coals and a glowing bed.
    add(box(0.74, 0.46, 0.08), mat.char, 0, 0.46, -0.32, { parent: hearth, rough: 0 });
    add(box(0.74, 0.03, 0.66), mat.char, 0, 0.245, -0.02, { parent: hearth, rough: 0 });
    glow(box(0.6, 0.03, 0.44), 0, 0.265, 0.02, { parent: hearth, kind: 'ember', tone: 1 });
    for (let i = 0; i < 9; i++) {
      glow(rock(0.045 + rand() * 0.035), -0.24 + rand() * 0.48, 0.29 + rand() * 0.03, -0.12 + rand() * 0.3, { parent: hearth, kind: 'ember', jagged: 0.02 });
    }
    add(box(1.76, 0.12, 0.92), mat.stone, 0, 0.975, 0, { parent: hearth, rough: 0.008 });           // the hearth slab
    add(cyl(0.62, 0.38, 0.5, 4), mat.pillar, 0, 1.27, 0, { parent: hearth, ry: Math.PI / 4 });        // the hood
    add(cyl(0.3, 0.24, 1.6, 4), mat.pillar, 0, 2.3, -0.05, { parent: hearth, ry: Math.PI / 4 });      // the chimney
    // Bellows beside it: a leather wedge between two boards.
    add(box(0.5, 0.05, 0.34), mat.wood, 1.14, 0.5, 0.1, { parent: hearth, rz: -0.25 });
    add(box(0.5, 0.05, 0.34), mat.wood, 1.14, 0.36, 0.1, { parent: hearth });
    add(box(0.44, 0.14, 0.3), mat.char, 1.12, 0.43, 0.1, { parent: hearth, rz: -0.12 });
    add(cyl(0.035, 0.035, 0.3, 6), mat.char, 0.82, 0.42, 0.1, { parent: hearth, rz: Math.PI / 2 });   // its nozzle
    light(hearth, [0, 0.5, 0.65], 1.4, 2.6);

    // --- the anvil, back left
    const smith = place(LEFT, 0.5);
    add(cyl(0.28, 0.25, 0.52, 9), mat.wood, 0, 0.26, 0, { parent: smith });                          // the stump
    add(box(0.28, 0.1, 0.22), mat.char, 0, 0.565, 0, { parent: smith, rough: 0.004 });               // anvil foot
    add(box(0.15, 0.14, 0.13), mat.char, 0, 0.675, 0, { parent: smith, rough: 0 });                  // waist
    add(box(0.44, 0.1, 0.18), mat.char, 0.02, 0.785, 0, { parent: smith, rough: 0.004 });            // face
    add(new THREE.ConeGeometry(0.075, 0.26, 6), mat.char, 0.35, 0.785, 0, { parent: smith, rz: -Math.PI / 2, rough: 0 }); // horn
    // A hammer lying on the face.
    add(cyl(0.022, 0.022, 0.34, 6), mat.wood, -0.05, 0.853, 0.05, { parent: smith, rz: Math.PI / 2, ry: 0.4, rough: 0 });
    add(box(0.07, 0.07, 0.13), mat.stone, -0.2, 0.865, 0.1, { parent: smith, ry: 0.4, rough: 0 });
    // A quench barrel, full to the brim (the barrel leans as one piece, water and all).
    const barrel = place(new THREE.Vector3(0.62, 0, 0.3), 0, { parent: smith });
    barrel.rotation.set((rand() - 0.5) * 0.04, rand(), (rand() - 0.5) * 0.04);
    add(cyl(0.26, 0.24, 0.6, 10), mat.wood, 0, 0.3, 0, { parent: barrel, rough: 0 });
    add(cyl(0.215, 0.215, 0.012, 10), mat.mortar, 0, 0.604, 0, { parent: barrel, rough: 0 });       // the water
    for (const y of [0.12, 0.48]) add(cyl(0.262, 0.255, 0.035, 10), mat.char, 0, y, 0, { parent: barrel, rough: 0 }); // hoops
    // Bar stock stacked by the anvil (each bar rests a little into the one below).
    for (let i = 0; i < 4; i++) add(box(0.7, 0.05, 0.06), mat.char, -0.45, 0.025 + i * 0.042, 0.45 + i * 0.02, { parent: smith, ry: 0.3 + i * 0.05, rough: 0.003 });

  // ------------------------------------------------------------------------------------
  } else if (name === 'shrine') {
    // --- the torii, back right, over two steps
    const gate = place(RIGHT, RIGHT_TURN);
    add(box(2.4, 0.12, 1.1), mat.stone, 0, 0.06, 0, { parent: gate, rough: 0.008 });
    add(box(2.0, 0.13, 0.8), mat.stone, 0, 0.18, -0.08, { parent: gate, rough: 0.008 });
    for (const x of [-0.72, 0.72]) {
      add(cyl(0.1, 0.085, 2.14, 8), mat.wood, x, 1.3, -0.08, { parent: gate, rough: 0.006 });
      add(cyl(0.14, 0.14, 0.16, 8), mat.char, x, 0.31, -0.08, { parent: gate, rough: 0 });        // the footing
    }
    add(box(1.84, 0.1, 0.14), mat.wood, 0, 1.95, -0.08, { parent: gate });                          // nuki (tie beam)
    add(box(2.3, 0.12, 0.22), mat.wood, 0, 2.3, -0.08, { parent: gate });                           // shimaki
    add(box(2.6, 0.11, 0.26), mat.char, 0, 2.4, -0.08, { parent: gate, rough: 0.006 });            // kasagi (top)
    add(box(0.12, 0.36, 0.12), mat.wood, 0, 2.12, -0.08, { parent: gate });                         // gakuzuka
    // A paper lantern hanging from the tie beam on a cord lights the gate.
    const lamp = lampId++;
    add(cyl(0.016, 0.016, 0.34, 5), mat.char, 0, 1.76, -0.08, { parent: gate, rough: 0 });
    glow(cyl(0.12, 0.12, 0.28, 8), 0, 1.46, -0.08, { parent: gate, kind: 'lamp', id: lamp });
    add(cyl(0.1, 0.1, 0.05, 8), mat.char, 0, 1.61, -0.08, { parent: gate, rough: 0 });
    add(cyl(0.1, 0.1, 0.05, 8), mat.char, 0, 1.31, -0.08, { parent: gate, rough: 0 });
    light(gate, [0, 1.4, 0.3], 0.9, 2.4);
    // A small offering stone in front of the gate, roped round.
    add(rock(0.22), mat.stone, 0.2, 0.46, 0.25, { parent: gate, jagged: 0.03 });
    add(new THREE.TorusGeometry(0.21, 0.035, 4, 10), mat.wax, 0.2, 0.47, 0.25, { parent: gate, rx: Math.PI / 2, rough: 0 });

    // --- stone lanterns (tōrō): back left, and one front left. Each lights its own stone
    // from just outside the window that faces the fire.
    const lantern = (at, turn, scale = 1) => {
      const t = place(at, turn, { scale });
      const id = lampId++;
      add(box(0.5, 0.15, 0.5), mat.pillar, 0, 0.075, 0, { parent: t });                              // base
      add(cyl(0.1, 0.08, 0.84, 6), mat.pillar, 0, 0.56, 0, { parent: t });                           // post
      add(box(0.44, 0.1, 0.44), mat.pillar, 0, 0.99, 0, { parent: t });                              // platform
      add(box(0.32, 0.3, 0.32), mat.pillar, 0, 1.18, 0, { parent: t, rough: 0 });                   // light box
      glow(box(0.2, 0.2, 0.345), 0, 1.18, 0, { parent: t, kind: 'lamp', id });                       // paper windows
      glow(box(0.345, 0.2, 0.2), 0, 1.18, 0, { parent: t, kind: 'lamp', id });
      add(new THREE.ConeGeometry(0.38, 0.24, 4), mat.pillar, 0, 1.44, 0, { parent: t, ry: Math.PI / 4, rough: 0 }); // roof
      add(new THREE.SphereGeometry(0.06, 5, 4), mat.pillar, 0, 1.59, 0, { parent: t, rough: 0 });  // finial
      const toFire = new THREE.Vector3(-at.x, 0, -at.z).normalize().multiplyScalar(0.34 * scale);
      lights.push({ at: new THREE.Vector3(at.x + toFire.x, 1.18 * scale, at.z + toFire.z), intensity: 0.7, distance: 2 });
    };
    lantern(LEFT, 0.3);
    lantern(FRONT_LEFT, -0.2, 0.8);

  // ------------------------------------------------------------------------------------
  } else if (name === 'cathedral') {
    // --- the chancel, back right: a stepped dais, the altar, a lancet window between walls
    const chancel = place(RIGHT, RIGHT_TURN);
    add(box(2.7, 0.1, 1.45), mat.stone, 0, 0.05, 0, { parent: chancel, rough: 0.006 });
    add(box(2.2, 0.11, 1.1), mat.stone, 0, 0.14, -0.12, { parent: chancel, rough: 0.006 });
    add(box(1.7, 0.11, 0.8), mat.stone, 0, 0.23, -0.24, { parent: chancel, rough: 0.006 });
    // The altar: a block with a slab on it and a pale frontal cloth.
    add(box(1.1, 0.5, 0.42), mat.pillar, 0, 0.52, -0.3, { parent: chancel, rough: 0.006 });
    add(box(1.3, 0.08, 0.56), mat.pillar, 0, 0.8, -0.3, { parent: chancel, rough: 0.004 });
    add(box(0.36, 0.42, 0.02), mat.wax, 0, 0.53, -0.075, { parent: chancel, rough: 0 });
    add(box(0.46, 0.05, 0.03), mat.wax, 0, 0.745, -0.08, { parent: chancel, rough: 0 });
    for (const x of [-0.46, 0.46]) candle(chancel, x, 0.835, -0.3, 0.2);
    // A gilded reliquary between them, its little window aglow.
    add(box(0.2, 0.16, 0.13), mat.wax, 0, 0.915, -0.34, { parent: chancel, rough: 0 });
    glow(box(0.08, 0.08, 0.14), 0, 0.915, -0.34, { parent: chancel, kind: 'glass', tone: 3 });
    // The window: two lancets of stained glass split by a mullion, a rose above, framed by
    // shafts and a pointed arch.
    const W = -0.66;
    for (const x of [-0.8, 0.8]) {
      add(cyl(0.09, 0.08, 2.56, 8), mat.pillar, x, 1.47, W, { parent: chancel, rough: 0 });         // from the dais up
      add(box(0.26, 0.12, 0.26), mat.pillar, x, 2.8, W, { parent: chancel, rough: 0.004 });         // capital
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
    add(box(0.07, 1.9, 0.07), mat.char, 0, 1.59, W + 0.02, { parent: chancel, rough: 0 });         // mullion
    add(box(1.46, 0.07, 0.07), mat.char, 0, 1.59, W + 0.02, { parent: chancel, rough: 0 });         // transom
    add(box(1.56, 0.08, 0.1), mat.pillar, 0, 0.62, W, { parent: chancel, rough: 0 });               // sill
    glow(cyl(0.26, 0.26, 0.02, 10), 0, 2.82, W - 0.02, { parent: chancel, kind: 'glass', tone: 3, rx: Math.PI / 2 }); // the rose
    add(new THREE.TorusGeometry(0.27, 0.045, 4, 10), mat.char, 0, 2.82, W + 0.01, { parent: chancel, rough: 0 });
    // Broken walls either side of the window, meeting its shafts.
    for (const [x, h] of [[-1.24, 2.5], [1.24, 1.7]]) {
      for (let y = 0, i = 0; y < h; i++) {
        const bh = Math.min(0.5 + rand() * 0.2, h - y);
        add(box(0.72 - i * 0.03, bh + 0.02, 0.34), mat.pillar, x + (rand() - 0.5) * 0.03, y + bh / 2, W, { parent: chancel, rough: 0.01 });
        y += bh;
      }
    }
    // Tall iron candle stands at the dais' corners.
    for (const x of [-1.08, 1.08]) {
      add(new THREE.ConeGeometry(0.12, 0.14, 6), mat.char, x, 0.17, 0.02, { parent: chancel, rough: 0 });
      add(cyl(0.026, 0.022, 1.26, 6), mat.char, x, 0.8, 0.02, { parent: chancel, rough: 0 });
      add(cyl(0.05, 0.08, 0.04, 8), mat.char, x, 1.44, 0.02, { parent: chancel, rough: 0 });
      candle(chancel, x, 1.455, 0.02, 0.18, { r: 0.036 });
    }
    light(chancel, [0, 1.15, 0.2], 1.2, 2.6);
    light(chancel, [0, 1.8, -0.35], 0.8, 2.2);

    // --- the nave, back left: two columns and a broken pointed arch, a fallen drum
    const nave = place(LEFT, 0.35);
    for (const x of [-0.58, 0.58]) {
      add(box(0.5, 0.16, 0.5), mat.pillar, x, 0.08, 0, { parent: nave, rough: 0.008 });
      add(cyl(0.17, 0.15, 2.36, 8), mat.pillar, x, 1.33, 0, { parent: nave, rough: 0.006 });
      add(box(0.46, 0.14, 0.46), mat.pillar, x, 2.56, 0, { parent: nave, rough: 0.008 });
    }
    add(box(0.8, 0.16, 0.22), mat.pillar, 0.32, 2.78, 0, { parent: nave, rz: -0.62, rough: 0.008 });  // the arch, broken off
    add(box(0.34, 0.16, 0.22), mat.pillar, -0.45, 2.7, 0, { parent: nave, rz: 0.62, rough: 0.008 });
    add(cyl(0.16, 0.16, 0.5, 8), mat.pillar, 0.15, 0.16, 0.6, { parent: nave, rz: Math.PI / 2, ry: 0.5, rough: 0.008 });
    for (let i = 0; i < 5; i++) add(rock(0.05 + rand() * 0.05), mat.pillar, -0.3 + rand() * 0.9, 0.04, 0.3 + rand() * 0.5, { parent: nave, jagged: 0.02 });
    // A cluster of floor candles at the columns' foot.
    const cluster = place(new THREE.Vector3(-0.1, 0, 0.4), 0, { parent: nave });
    const id = lampId++;
    for (const [x, z, h] of [[0, 0, 0.3], [0.1, 0.06, 0.2], [-0.09, 0.08, 0.16], [0.05, -0.1, 0.24], [-0.12, -0.06, 0.12]]) candle(cluster, x, 0, z, h, { id });
    light(nave, [-0.1, 0.45, 0.6], 0.8, 2);

    // --- a pew, front left, turned toward the altar
    const pew = place(FRONT_LEFT, Math.atan2(RIGHT.x - FRONT_LEFT.x, RIGHT.z - FRONT_LEFT.z));
    add(box(1.1, 0.06, 0.36), mat.wood, 0, 0.44, 0, { parent: pew });
    add(box(1.1, 0.46, 0.06), mat.wood, 0, 0.72, -0.17, { parent: pew });
    for (const x of [-0.56, 0.56]) add(box(0.06, 0.9, 0.42), mat.wood, x, 0.45, -0.02, { parent: pew });
    add(box(1.02, 0.06, 0.14), mat.wood, 0, 0.14, 0.3, { parent: pew });                              // the kneeler

  // ------------------------------------------------------------------------------------
  } else if (name === 'cult') {
    /** A hooded figure of stone: a robe, clasped sleeves, a hood with a dark face and glowing eyes. */
    const hooded = (g, x, z, turn, scale = 1) => {
      const f = place(new THREE.Vector3(x, 0, z), turn, { parent: g, scale });
      add(new THREE.ConeGeometry(0.36, 1.62, 7), mat.pillar, 0, 0.81, 0, { parent: f, rough: 0.008 });
      add(new THREE.ConeGeometry(0.2, 0.5, 7), mat.pillar, 0, 1.46, 0.02, { parent: f, rough: 0 });   // shoulders
      add(rock(0.2, 0), mat.pillar, 0, 1.74, 0, { parent: f, jagged: 0.02, scale: [1, 1.2, 1.05] });   // the hood
      add(box(0.18, 0.2, 0.08), mat.char, 0, 1.72, 0.2, { parent: f, rough: 0 });                    // the face, in shadow
      const eyes = lampId++;
      for (const ex of [-0.045, 0.045]) glow(box(0.035, 0.02, 0.02), ex, 1.75, 0.245, { parent: f, kind: 'rune', id: eyes, tone: 3 });
      add(box(0.32, 0.13, 0.16), mat.pillar, 0, 1.02, 0.24, { parent: f, rough: 0.006 });            // clasped sleeves
    };
    /** A rune on a face: a stave and two branches (ᛉ), glowing. */
    const rune = (g, x, y, z, size = 1, id = lampId++) => {
      const s = size * 0.13;
      glow(box(0.022, s * 1.3, 0.014), x, y, z, { parent: g, kind: 'rune', id, tone: 2 });
      for (const side of [-1, 1]) glow(box(0.02, s * 0.7, 0.014), x + side * s * 0.28, y + s * 0.38, z, { parent: g, kind: 'rune', id, tone: 2, rz: -side * 0.6 });
    };

    // --- the altar, back right: a round dais, a slab on boulders, bowls of embers
    const altar = place(RIGHT, RIGHT_TURN);
    add(cyl(1.16, 1.1, 0.14, 12), mat.stone, 0, 0.07, 0, { parent: altar, rough: 0.006 });
    add(cyl(0.8, 0.76, 0.13, 12), mat.stone, 0, 0.19, -0.05, { parent: altar, rough: 0.006 });
    for (const x of [-0.44, 0.44]) add(rock(0.27, 0), mat.stone, x, 0.44, 0, { parent: altar, jagged: 0.05, scale: [1, 1, 0.8] });
    add(box(0.56, 0.44, 0.38), mat.pillar, 0, 0.46, 0, { parent: altar, rough: 0.01 });
    add(box(1.32, 0.17, 0.62), mat.char, 0, 0.74, 0, { parent: altar, rough: 0.004 });
    for (const [x, s] of [[-0.42, 0.9], [0, 1.2], [0.42, 0.9]]) rune(altar, x, 0.74, 0.322, s * 0.9);
    for (const x of [-0.44, 0.44]) {
      add(cyl(0.08, 0.13, 0.09, 8), mat.char, x, 0.87, 0.06, { parent: altar, rough: 0 });
      for (let i = 0; i < 3; i++) glow(rock(0.045 + rand() * 0.02), x + (rand() - 0.5) * 0.1, 0.92, 0.06 + (rand() - 0.5) * 0.1, { parent: altar, kind: 'ember', jagged: 0.015 });
    }
    for (const [x, h] of [[-0.18, 0.2], [0, 0.28], [0.2, 0.16]]) candle(altar, x, 0.815, -0.2, h, { material: mat.char });
    hooded(altar, -0.98, -0.5, 0.25);
    hooded(altar, 0.98, -0.5, -0.25);
    light(altar, [0, 1.05, 0.4], 1.1, 2.6);

    // --- standing stones, back left, each carved with a rune
    const stones = place(LEFT, 0.4);
    for (const [x, z, w, h, t] of [[-0.62, 0.12, 0.36, 1.55, 0.06], [0, -0.14, 0.42, 2.05, -0.02], [0.62, 0.12, 0.34, 1.35, -0.08]]) {
      // (The stone leans as a whole, its rune with it, so the rune stays on its face.)
      const s = place(new THREE.Vector3(x, -0.04, z), (rand() - 0.5) * 0.3, { parent: stones });
      s.rotation.x = (rand() - 0.5) * 0.08;
      s.rotation.z = t;
      add(box(w, h, 0.26), mat.stone, 0, h / 2, 0, { parent: s, rough: 0 });
      rune(s, 0, h * 0.64, 0.14, 1.1);
    }
    add(box(0.9, 0.2, 0.3), mat.stone, 0.3, 0.1, 0.55, { parent: stones, ry: 0.5, rz: 0.08, rough: 0.03 });   // a fallen one
    light(stones, [0, 1.0, 0.5], 0.7, 2.2);

    // --- a hooded watcher, front left, turned toward the fire
    hooded(group, FRONT_LEFT.x, FRONT_LEFT.z, Math.atan2(-FRONT_LEFT.x, -FRONT_LEFT.z), 0.78);

    // --- a half ring of black candles behind the fire
    const ring = lampId++;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.18 + (i / 6) * 0.64);
      candle(group, Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, 0.08 + rand() * 0.1, { material: mat.char, id: ring + i, r: 0.035 });
    }
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = !glows.includes(o); o.receiveShadow = true; } });
  return { group, glows, lights };
}
