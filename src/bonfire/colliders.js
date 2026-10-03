// What the knights must keep out of: each scenery's solid pieces near his seat and the
// dancers' ring, as simple shapes (upright cylinders, turned boxes, drums lying on their
// sides). Pure (no three.js), so node can test it and the visualizer's knight show can ask
// it; knights.js measures the room he has for his arms against it and keeps him out of it,
// and the show leaves out a dance move too wide for a dancer's place.
//
// The shapes come from the same numbers that build the pieces: scenery.js imports its
// placements from here (where each group stands and turns, and each piece's size and place
// in it), so a piece can't move without its shape moving too. The ruins are the model's own
// (bonfire.glb, tools/bonfire.py): its pillar, plinth, fallen drum, candles and wall are
// tools/bonfire.py's numbers (test/knightClearance.test.mjs decodes the model and checks
// them). Only what an arm or a body could meet is here: nothing lower than a shin (steps,
// daises, bar stock, rubble, floor candles), and none of the seats (he sits on those).
//
//   cylinder  { kind: 'cyl', name, x, z, r0, r1, y0, y1 }: upright, radius r0 at y0 to r1
//             at y1 (a cone where r1 is 0); an n-sided prism by its corners' radius
//   box       { kind: 'box', name, c: [x, y, z], h: [hx, hy, hz], yaw, pitch, roll, m }: its
//             middle, half its size, and its turn (three.js 'YXZ' order; `m` the same as a
//             row-major 3×3 matrix, its own axes into the clearing's)
//   log       { kind: 'log', name, c: [x, y, z], r, r1?, half, yaw }: a round drum lying on its
//             side, its axis level, along (sin yaw, 0, cos yaw), `half` its length either side;
//             radius r at its back end to r1 at its front (a lying cone where r1 is 0)
// The shapes ignore the hand-set lean of each piece (scenery.js lean(): a centimetre or so).
// Coordinates are the clearing's (three.js: +x right, +y up, +z toward the cameras).

/**
 * @typedef {{ kind: 'cyl' | 'box' | 'log', name: string, x?: number, z?: number, r0?: number, r1?: number, y0?: number, y1?: number,
 *   c?: number[], h?: number[], yaw?: number, pitch?: number, roll?: number, m?: number[], r?: number, half?: number, ax?: number, az?: number, lip?: number }} Collider
 */

// --- where things stand ------------------------------------------------------------------
/**
 * The clearing's corners where each scenery's big pieces stand (world x, z): the ruins' wall
 * at the back right (turned `rightTurn`), and the front left. What stands at the back left,
 * by the knight's seat, has a place of its own (`at`: the ruins' pillar, the forge's anvil,
 * the shrine's back lantern, the cathedral's nave, the cult's stones), so each can move
 * clear of him without the others.
 */
export const CLEARING = {
  right: [1.9, -1.5],
  frontLeft: [-1.9, 0.6],
  rightTurn: -28 * (Math.PI / 180),
};

/**
 * The ruins (the model's own: tools/bonfire.py, in the clearing's coordinates). The broken
 * column on its plinth at the back left (`at`: tools/bonfire.py PX, PY; `pillar`: an 8-sided
 * shaft, by its corners' radius, its broken top no higher than `top`; the plinth's two
 * tiers), the drum fallen from it (an 8-sided drum lying aslant, `turn` its axis from +z:
 * DRUM_X, DRUM_Y), three candles on the plinth's corner, and the wall at the back right
 * (rows of blocks, broken away in steps).
 */
export const RUINS = {
  at: [-1.45, -1.35],
  pillar: { r0: 0.24, r1: 0.22, y0: 0.31, top: 2.02 },
  plinth: [
    { size: [0.78, 0.22, 0.78], y: 0.11 },
    { size: [0.62, 0.1, 0.62], y: 0.26 },
  ],
  drum: { at: [-0.75, 0.19, -0.95], r: 0.2, length: 0.42, turn: 35 * (Math.PI / 180) },
  candles: [
    [0.2, -0.22, 0.2],
    [0.28, -0.08, 0.13],
    [0.12, -0.28, 0.09],
  ], // [x, y, height] from the pillar (the model's axes: its y is the clearing's −z)
  wall: { block: [0.46, 0.26, 0.34], rows: 6, cols: 5 },
};

/** The forge: the hearth at the back right, the anvil on its stump at the back left. */
export const FORGE = {
  hearth: {
    half: 0.85,
    depth: 0.8,
    opening: 0.36,
    courses: [
      [0, 0.24],
      [0.24, 0.22],
      [0.46, 0.22],
      [0.68, 0.24],
    ], // [from y, height]
    slab: { size: [1.76, 0.12, 0.92], y: 0.975 },
    hood: { r: [0.62, 0.38], h: 0.5, y: 1.27 }, // (four-sided, its corners on the diagonals)
    chimney: { r: [0.3, 0.24], h: 1.6, y: 2.3, z: -0.05 },
  },
  anvil: {
    // (Turned 0.3 rad further than round 9's, its horn pointing back past the seated knight's
    // right shoulder instead of at it: a seated Praise goes all the way up there.)
    at: [-1.45, -1.35],
    turn: 0.8,
    stump: { r: [0.28, 0.25], h: 0.52 },
    foot: { size: [0.28, 0.1, 0.22], y: 0.565 },
    waist: { size: [0.15, 0.14, 0.13], y: 0.675 },
    face: { size: [0.44, 0.1, 0.18], at: [0.02, 0.785] },
    horn: { r: 0.075, length: 0.26, at: [0.35, 0.785] }, // (pointing out along +x)
    handle: { r: 0.022, length: 0.34, at: [-0.05, 0.853, 0.05], turn: 0.4 },
    head: { size: [0.07, 0.07, 0.13], at: [-0.2, 0.865, 0.1], turn: 0.4 },
  },
  barrel: { at: [-0.5, -0.35], r: [0.26, 0.24], h: 0.6, hoop: [0.262, 0.255] },
};

/** The shrine: the torii at the back right, stone lanterns at the back left and front left. */
export const SHRINE = {
  torii: {
    posts: [-0.72, 0.72],
    z: -0.08,
    post: { r: [0.1, 0.085], h: 2.14, y: 1.3 },
    footing: { r: 0.14, h: 0.16, y: 0.31 },
    beams: [
      { size: [1.84, 0.1, 0.14], y: 1.95 },
      { size: [2.3, 0.12, 0.22], y: 2.3 },
      { size: [2.6, 0.11, 0.26], y: 2.4 },
      { size: [0.12, 0.36, 0.12], y: 2.12 },
    ],
    lamp: { r: 0.12, h: 0.28, y: 1.46, cord: { r: 0.016, h: 0.34, y: 1.76 }, caps: [1.61, 1.31] },
    offering: { r: 0.22, at: [0.2, 0.46, 0.25] },
  },
  lantern: {
    base: { size: [0.5, 0.15, 0.5], y: 0.075 },
    post: { r: [0.1, 0.08], h: 0.84, y: 0.56 },
    platform: { size: [0.44, 0.1, 0.44], y: 0.99 },
    box: { size: [0.32, 0.3, 0.32], y: 1.18, window: 0.345 },
    roof: { r: 0.38, h: 0.24, y: 1.44 }, // (four-sided, its corners on the diagonals)
    finial: { r: 0.06, y: 1.59 },
  },
  lanterns: [
    { name: 'back', at: [-1.45, -1.35], turn: 0.3, scale: 1 },
    { name: 'front', at: CLEARING.frontLeft, turn: -0.2, scale: 0.8 },
  ],
};

/** The cathedral: the chancel at the back right, the nave's columns at the back left, a pew at the front left. */
export const CATHEDRAL = {
  altar: {
    block: { size: [1.1, 0.5, 0.42], at: [0.52, -0.3] }, // at: [y, z]
    slab: { size: [1.3, 0.08, 0.56], at: [0.8, -0.3] },
    cloth: { size: [0.36, 0.42, 0.02], at: [0.53, -0.075] },
    candles: { x: [-0.46, 0.46], y: 0.835, z: -0.3, h: 0.2 },
    reliquary: { size: [0.2, 0.16, 0.13], at: [0.915, -0.34] },
  },
  window: {
    z: -0.66,
    shafts: [-0.8, 0.8],
    shaft: { r: [0.09, 0.08], h: 2.56, y: 1.47 },
    capital: { size: [0.26, 0.12, 0.26], y: 2.8 },
    mullion: { size: [0.07, 1.9, 0.07], y: 1.59, z: 0.02 },
    sill: { size: [1.56, 0.08, 0.1], y: 0.62 },
    rose: { r: 0.26, ring: 0.27, tube: 0.045, y: 2.82 },
  },
  walls: {
    at: [
      [-1.24, 2.5],
      [1.24, 1.7],
    ],
    width: 0.72,
    depth: 0.34,
  }, // at: [x, height]
  // The tall iron candle stands at the dais' corners.
  stands: {
    x: [-1.08, 1.08],
    z: 0.02,
    foot: { r: 0.12, h: 0.14, y: 0.17 },
    stem: { r: [0.026, 0.022], h: 1.26, y: 0.8 },
    dish: { r: [0.05, 0.08], h: 0.04, y: 1.44 },
    candle: { r: 0.036, h: 0.18, y: 1.455 },
  },
  nave: {
    // (The right column, with its half of the arch, stands 0.5 m further along the row than
    // round 9's: the knight's seat at its foot overlapped it, no seat clear of it kept him in
    // a phone's frame (knightPlaces.js SEATS), and his left arm needs the room for a seated
    // Praise.)
    at: [-1.45, -1.35],
    turn: 0.35,
    columns: [-0.58, 1.08],
    base: { size: [0.5, 0.16, 0.5], y: 0.08 },
    shaft: { r: [0.17, 0.15], h: 2.36, y: 1.33 },
    capital: { size: [0.46, 0.14, 0.46], y: 2.56 },
    arch: [
      { size: [0.8, 0.16, 0.22], at: [0.82, 2.78], roll: -0.62 },
      { size: [0.34, 0.16, 0.22], at: [-0.45, 2.7], roll: 0.62 },
    ],
    // A cluster of floor candles at the left column's foot: [x, z, height] about `at`.
    candles: {
      at: [-0.62, 0.46],
      list: [
        [0, 0, 0.3],
        [0.1, 0.06, 0.2],
        [-0.09, 0.08, 0.16],
        [0.05, -0.1, 0.24],
        [-0.12, -0.06, 0.12],
      ],
    },
  },
  pew: {
    seat: { size: [1.1, 0.06, 0.36], at: [0.44, 0] },
    back: { size: [1.1, 0.46, 0.06], at: [0.72, -0.17] },
    ends: { size: [0.06, 0.9, 0.42], x: [-0.56, 0.56], at: [0.45, -0.02] },
    kneeler: { size: [1.02, 0.06, 0.14], at: [0.14, 0.3] },
  },
};

/** A hooded stone figure (the cult's): robe, shoulders, hood, the face in it, clasped sleeves. */
export const HOODED = {
  robe: { r: 0.36, h: 1.62 },
  shoulders: { r: 0.2, h: 0.5, at: [1.46, 0.02] },
  hood: { r: 0.2, y: 1.74, scale: [1, 1.2, 1.05] },
  face: { size: [0.18, 0.2, 0.08], at: [1.72, 0.2] },
  eyes: { x: 0.045, at: [1.75, 0.245] },
  sleeves: { size: [0.32, 0.13, 0.16], at: [1.02, 0.24] },
};
/**
 * The cult: the altar at the back right (a slab on a block between boulders, bowls of
 * embers, black candles, two hooded figures), standing stones at the back left, a hooded
 * watcher at the front left.
 */
export const CULT = {
  altar: {
    boulders: { r: 0.27, x: [-0.44, 0.44], y: 0.44 },
    block: { size: [0.56, 0.44, 0.38], y: 0.46 },
    slab: { size: [1.32, 0.17, 0.62], y: 0.74 },
    bowls: { r: [0.08, 0.13], h: 0.09, at: [0.87, 0.06] },
    candles: [
      [-0.18, 0.2],
      [0, 0.28],
      [0.2, 0.16],
    ],
    candleAt: [0.815, -0.2],
    figures: [
      [-0.98, -0.5, 0.25],
      [0.98, -0.5, -0.25],
    ],
  },
  stones: {
    at: [-1.45, -1.35],
    turn: 0.4,
    // [x, z, width, height, lean] in the stones' own space, each 0.26 deep. (Stone C stands
    // 0.3 m further along than round 9's, out of the seated knight's way, as the cathedral's
    // right column does.)
    list: [
      [-0.62, 0.12, 0.36, 1.55, 0.06],
      [0, -0.14, 0.42, 2.05, -0.02],
      [0.92, 0.12, 0.34, 1.35, -0.08],
    ],
    depth: 0.26,
    // (How each also turns and tips: scenery.js draws these from its seeded rng, after the
    // altar's pieces; the numbers it draws, checked by test/knightClearance.test.mjs.)
    drawn: [
      [-0.07272434919141232, 0.019595348332077264],
      [0.0227545827627182, 0.011384934764355422],
      [-0.12215971299447119, 0.01987953858450055],
    ],
  },
  watcher: { scale: 0.78 },
};

// --- shapes in groups ----------------------------------------------------------------------
// A frame: a group placed in the clearing (or in another group), as scenery.js place() puts it:
// its origin `o` (world), its turn `m` (row-major 3×3) and its scale `s`.
const rotX = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const mul = (A, B) =>
  Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3),
      c = i % 3;
    return A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  });
const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
/** A turn as three.js sets a mesh's rotation (Euler 'XYZ'). */
const euler = (x = 0, y = 0, z = 0) => mul(mul(rotX(x), rotY(y)), rotZ(z));
const ROOT = { o: [0, 0, 0], m: euler(), s: 1 };
/** A group in `parent` at local `at` ([x, y, z]), turned (Euler XYZ, as three.js) and scaled. */
function frame(parent, at, { x = 0, y = 0, z = 0, scale = 1 } = {}) {
  const w = apply(
    parent.m,
    at.map((v) => v * parent.s),
  );
  return {
    o: [parent.o[0] + w[0], parent.o[1] + w[1], parent.o[2] + w[2]],
    m: mul(parent.m, euler(x, y, z)),
    s: parent.s * scale,
  };
}
/** A frame's local point in the clearing. */
function world(f, p) {
  const w = apply(
    f.m,
    p.map((v) => v * f.s),
  );
  return [f.o[0] + w[0], f.o[1] + w[1], f.o[2] + w[2]];
}

/**
 * An upright cylinder in frame `f` (turned about the vertical only): its axis at local
 * (x, z), radius r0 at local y0 to r1 at y1.
 * @returns {Collider}
 */
function cyl(f, name, x, z, r0, r1, y0, y1) {
  const [wx, wy, wz] = world(f, [x, 0, z]);
  return { kind: 'cyl', name, x: wx, z: wz, r0: r0 * f.s, r1: r1 * f.s, y0: wy + y0 * f.s, y1: wy + y1 * f.s };
}
/**
 * A box in frame `f`: its middle at local `at`, `size` (full), turned by `rot` (Euler XYZ, as
 * three.js) in the frame.
 * @returns {Collider}
 */
function box(f, name, at, size, rot = {}) {
  const m = mul(f.m, euler(rot.x, rot.y, rot.z));
  // (The same turn as yaw, pitch and roll, 'YXZ': readable in a test's message.)
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m[5])));
  return {
    kind: 'box',
    name,
    c: world(f, at),
    h: size.map((v) => (v / 2) * f.s),
    yaw: Math.atan2(m[2], m[8]),
    pitch,
    roll: Math.atan2(m[3], m[4]),
    m,
  };
}
/** A group standing on the ground at `at` ([x, z], or a CLEARING corner's name), turned and scaled. */
const ground = (at, turn = 0, scale = 1) => {
  const [x, z] = typeof at === 'string' ? CLEARING[at] : at;
  return frame(ROOT, [x, 0, z], { y: turn, scale });
};

/** A stone lantern's pieces (SHRINE.lantern) in its frame. */
function lantern(f, name) {
  const L = SHRINE.lantern;
  const half = L.box.window / 2;
  return [
    box(f, `${name} base`, [0, L.base.y, 0], L.base.size),
    cyl(f, `${name} post`, 0, 0, L.post.r[0], L.post.r[1], L.post.y - L.post.h / 2, L.post.y + L.post.h / 2),
    box(f, `${name} platform`, [0, L.platform.y, 0], L.platform.size),
    // (The paper windows stand a little proud of the box.)
    box(f, `${name} light box`, [0, L.box.y, 0], [2 * half, L.box.size[1], 2 * half]),
    box(f, `${name} roof`, [0, L.roof.y, 0], [L.roof.r * Math.SQRT2, L.roof.h, L.roof.r * Math.SQRT2]),
    box(f, `${name} finial`, [0, L.finial.y, 0], [2 * L.finial.r, 2 * L.finial.r, 2 * L.finial.r]),
  ];
}
/** A hooded figure (HOODED) in its frame. */
function hooded(f, name) {
  const H = HOODED;
  const hoodR = H.hood.r * Math.max(H.hood.scale[0], H.hood.scale[2]) + 0.01,
    hoodH = H.hood.r * H.hood.scale[1] + 0.01;
  return [
    cyl(f, `${name} robe`, 0, 0, H.robe.r, 0, 0, H.robe.h),
    cyl(
      f,
      `${name} shoulders`,
      0,
      H.shoulders.at[1],
      H.shoulders.r,
      0,
      H.shoulders.at[0] - H.shoulders.h / 2,
      H.shoulders.at[0] + H.shoulders.h / 2,
    ),
    cyl(f, `${name} hood`, 0, 0, hoodR, hoodR, H.hood.y - hoodH, H.hood.y + hoodH),
    // (The face's box, out to the glowing eyes in front of it.)
    box(
      f,
      `${name} face`,
      [0, H.face.at[0], (H.face.at[1] - H.face.size[2] / 2 + H.eyes.at[1] + 0.01) / 2],
      [H.face.size[0], H.face.size[1], H.eyes.at[1] + 0.01 - (H.face.at[1] - H.face.size[2] / 2)],
    ),
    box(f, `${name} sleeves`, [0, H.sleeves.at[0], H.sleeves.at[1]], H.sleeves.size),
  ];
}

/** Each scenery's shapes, built once. */
const BUILDERS = {
  ruins() {
    const R = RUINS;
    const [px, pz] = R.at;
    const out = [cyl(ROOT, 'pillar', px, pz, R.pillar.r0, R.pillar.r1, R.pillar.y0, R.pillar.top)];
    R.plinth.forEach((t, i) => out.push(box(ROOT, i ? 'plinth (top)' : 'plinth', [px, t.y, pz], t.size)));
    // (Its corners are jagged a centimetre or two either way: its own radius, as a boot resting
    // on it meets it.)
    out.push(
      /** @type {Collider} */ ({
        kind: 'log',
        name: 'fallen drum',
        c: [...R.drum.at],
        r: R.drum.r,
        half: R.drum.length / 2 + 0.01,
        yaw: R.drum.turn,
      }),
    );
    R.candles.forEach(([dx, dy, h], i) =>
      out.push(
        cyl(
          ROOT,
          `candle ${i + 1}`,
          px + dx,
          pz - dy,
          0.04,
          0.04,
          R.plinth[1].y + 0.05,
          R.plinth[1].y + 0.05 + h + 0.09,
        ),
      ),
    );
    // The wall's rows, each as wide as the blocks left in it (tools/bonfire.py: the higher
    // rows lose more on the left, the top one every other block).
    const W = ground('right', CLEARING.rightTurn);
    const [bw, bh, bd] = R.wall.block;
    for (let row = 0; row < R.wall.rows; row++) {
      const cols = [];
      for (let col = 0; col < R.wall.cols; col++)
        if (!(row > 1 && col < row - 1) && !(row === R.wall.rows - 1 && col % 2)) cols.push(col);
      const x = (col) => col * bw + (row % 2 ? bw / 2 : 0) - (R.wall.cols * bw) / 2;
      const x0 = x(cols[0]) - bw / 2 - 0.01,
        x1 = x(cols.at(-1)) + bw / 2 + 0.01;
      out.push(box(W, `wall row ${row + 1}`, [(x0 + x1) / 2, row * bh + bh / 2, 0], [x1 - x0, bh, bd + 0.03]));
    }
    return out;
  },
  forge() {
    const { hearth: H, anvil: A, barrel: B } = FORGE;
    const h = ground('right', CLEARING.rightTurn);
    const top = H.courses.at(-1)[0] + H.courses.at(-1)[1];
    const hood = (r) => r * Math.SQRT1_2 * 2; // (a four-sided cone turned 45°: a square)
    const s = ground(A.at, A.turn);
    const b = frame(s, [B.at[0], 0, B.at[1]]);
    return [
      box(h, 'hearth', [0, top / 2, 0], [2 * H.half, top, H.depth]),
      box(h, 'hearth slab', [0, H.slab.y, 0], H.slab.size),
      box(h, 'hood', [0, H.hood.y - H.hood.h / 4, 0], [hood(H.hood.r[0]), H.hood.h / 2, hood(H.hood.r[0])]),
      box(
        h,
        'hood (top)',
        [0, H.hood.y + H.hood.h / 4, 0],
        [hood((H.hood.r[0] + H.hood.r[1]) / 2), H.hood.h / 2, hood((H.hood.r[0] + H.hood.r[1]) / 2)],
      ),
      box(h, 'chimney', [0, H.chimney.y, H.chimney.z], [hood(H.chimney.r[0]), H.chimney.h, hood(H.chimney.r[0])]),
      cyl(s, 'anvil stump', 0, 0, A.stump.r[0], A.stump.r[1], 0, A.stump.h),
      box(s, 'anvil foot', [0, A.foot.y, 0], A.foot.size),
      box(s, 'anvil waist', [0, A.waist.y, 0], A.waist.size),
      box(s, 'anvil face', [A.face.at[0], A.face.at[1], 0], A.face.size),
      // (The horn's point aims out along the anvil's +x: a cone lying on its side.)
      {
        kind: 'log',
        name: 'anvil horn',
        c: world(s, [A.horn.at[0], A.horn.at[1], 0]),
        r: A.horn.r,
        r1: 0,
        half: A.horn.length / 2,
        yaw: A.turn + Math.PI / 2,
      },
      box(s, 'hammer', A.handle.at, [A.handle.length, 2 * A.handle.r, 2 * A.handle.r], { y: A.handle.turn }),
      box(s, 'hammer head', A.head.at, A.head.size, { y: A.head.turn }),
      cyl(b, 'quench barrel', 0, 0, B.hoop[0], B.hoop[0], 0, B.h + 0.01),
    ];
  },
  shrine() {
    const T = SHRINE.torii;
    const g = ground('right', CLEARING.rightTurn);
    const out = [];
    for (const x of T.posts) {
      out.push(
        cyl(
          g,
          `torii post ${x < 0 ? 'left' : 'right'}`,
          x,
          T.z,
          T.post.r[0],
          T.post.r[1],
          T.post.y - T.post.h / 2,
          T.post.y + T.post.h / 2,
        ),
      );
      out.push(
        cyl(
          g,
          `torii footing ${x < 0 ? 'left' : 'right'}`,
          x,
          T.z,
          T.footing.r,
          T.footing.r,
          T.footing.y - T.footing.h / 2,
          T.footing.y + T.footing.h / 2,
        ),
      );
    }
    // (A long beam's hand-set lean tips its ends a few centimetres.)
    T.beams.forEach((b, i) =>
      out.push(box(g, `torii beam ${i + 1}`, [0, b.y, T.z], [b.size[0], b.size[1] + 0.07, b.size[2] + 0.04])),
    );
    out.push(cyl(g, 'torii lamp', 0, T.z, T.lamp.r, T.lamp.r, T.lamp.caps[1] - 0.025, T.lamp.caps[0] + 0.025));
    out.push(
      cyl(
        g,
        'torii lamp cord',
        0,
        T.z,
        T.lamp.cord.r,
        T.lamp.cord.r,
        T.lamp.cord.y - T.lamp.cord.h / 2,
        T.lamp.cord.y + T.lamp.cord.h / 2,
      ),
    );
    const o = T.offering;
    out.push(
      cyl(g, 'offering stone', o.at[0], o.at[2], o.r + 0.03, o.r + 0.03, o.at[1] - o.r - 0.03, o.at[1] + o.r + 0.03),
    );
    for (const l of SHRINE.lanterns) out.push(...lantern(ground(l.at, l.turn, l.scale), `${l.name} lantern`));
    return out;
  },
  cathedral() {
    const C = CATHEDRAL;
    const ch = ground('right', CLEARING.rightTurn);
    const { altar: A, window: W, stands: S } = C;
    // (The altar's frontal cloth hangs on its front.)
    const front = A.cloth.at[1] + A.cloth.size[2] / 2,
      back = A.block.at[1] - A.block.size[2] / 2;
    const out = [
      box(ch, 'altar', [0, A.block.at[0], (front + back) / 2], [A.block.size[0], A.block.size[1], front - back]),
      box(ch, 'altar slab', [0, A.slab.at[0], A.slab.at[1]], A.slab.size),
      box(ch, 'reliquary', [0, A.reliquary.at[0], A.reliquary.at[1]], A.reliquary.size),
    ];
    // (Each candle with its flame.)
    for (const x of A.candles.x)
      out.push(cyl(ch, 'altar candle', x, A.candles.z, 0.035, 0.035, A.candles.y, A.candles.y + A.candles.h + 0.1));
    for (const x of W.shafts) {
      out.push(
        cyl(
          ch,
          'window shaft',
          x,
          W.z,
          W.shaft.r[0],
          W.shaft.r[1],
          W.shaft.y - W.shaft.h / 2,
          W.shaft.y + W.shaft.h / 2,
        ),
      );
      out.push(box(ch, 'window capital', [x, W.capital.y, W.z], W.capital.size));
    }
    // (The glass, its mullion, transom and sill, as one pane between the shafts, from the
    // sill up to the mullion's top; the rose over it.)
    const lo = W.sill.y - W.sill.size[1] / 2,
      hi = W.mullion.y + W.mullion.size[1] / 2;
    out.push(box(ch, 'window', [0, (lo + hi) / 2, W.z], [W.sill.size[0], hi - lo, 0.11]));
    const rose = W.rose.ring + W.rose.tube;
    out.push(box(ch, 'rose window', [0, W.rose.y, W.z], [2 * rose, 2 * rose, 0.11]));
    // (Each wall's blocks wander a centimetre or so either way.)
    for (const [x, h] of C.walls.at)
      out.push(box(ch, 'chancel wall', [x, h / 2, W.z], [C.walls.width + 0.03, h, C.walls.depth]));
    for (const x of S.x) {
      out.push(
        cyl(ch, 'candle stand foot', x, S.z, S.foot.r, S.foot.r, S.foot.y - S.foot.h / 2, S.foot.y + S.foot.h / 2),
      );
      out.push(
        cyl(ch, 'candle stand', x, S.z, S.stem.r[0], S.stem.r[1], S.stem.y - S.stem.h / 2, S.stem.y + S.stem.h / 2),
      );
      out.push(
        cyl(
          ch,
          'candle stand top',
          x,
          S.z,
          S.dish.r[1],
          S.dish.r[1],
          S.dish.y - S.dish.h / 2,
          S.candle.y + S.candle.h + 0.1,
        ),
      );
    }
    const N = C.nave;
    const nave = ground(N.at, N.turn);
    for (const x of N.columns) {
      out.push(box(nave, 'nave base', [x, N.base.y, 0], N.base.size));
      out.push(
        cyl(
          nave,
          'nave column',
          x,
          0,
          N.shaft.r[0],
          N.shaft.r[1],
          N.shaft.y - N.shaft.h / 2,
          N.shaft.y + N.shaft.h / 2,
        ),
      );
      out.push(box(nave, 'nave capital', [x, N.capital.y, 0], N.capital.size));
    }
    for (const a of N.arch) out.push(box(nave, 'nave arch', [a.at[0], a.at[1], 0], a.size, { z: a.roll }));
    // (The floor candles, flames and all, as one: round their middle, out to the farthest.)
    const far = Math.max(...N.candles.list.map(([x, z]) => Math.hypot(x, z))) + 0.04;
    out.push(
      cyl(
        nave,
        'floor candles',
        N.candles.at[0],
        N.candles.at[1],
        far,
        far,
        0,
        Math.max(...N.candles.list.map(([, , h]) => h)) + 0.1,
      ),
    );
    const P = C.pew;
    const [fx, fz] = CLEARING.frontLeft,
      [rx, rz] = CLEARING.right;
    const pew = ground('frontLeft', Math.atan2(rx - fx, rz - fz));
    out.push(box(pew, 'pew seat', [0, P.seat.at[0], P.seat.at[1]], P.seat.size));
    out.push(box(pew, 'pew back', [0, P.back.at[0], P.back.at[1]], P.back.size));
    for (const x of P.ends.x) out.push(box(pew, 'pew end', [x, P.ends.at[0], P.ends.at[1]], P.ends.size));
    return out;
  },
  cult() {
    const A = CULT.altar;
    const al = ground('right', CLEARING.rightTurn);
    const out = [];
    for (const x of A.boulders.x)
      out.push(
        box(
          al,
          'altar boulder',
          [x, A.boulders.y, 0],
          [2 * A.boulders.r + 0.05, 2 * A.boulders.r + 0.05, 1.6 * A.boulders.r + 0.05],
        ),
      );
    // (Its sigil stands a little proud of its face.)
    out.push(box(al, 'altar block', [0, A.block.y, 0], [A.block.size[0], A.block.size[1], A.block.size[2] + 0.04]));
    out.push(box(al, 'altar slab', [0, A.slab.y, 0], A.slab.size));
    for (const x of A.boulders.x)
      out.push(
        cyl(
          al,
          'ember bowl',
          x,
          A.bowls.at[1],
          A.bowls.r[1],
          A.bowls.r[1],
          A.bowls.at[0] - A.bowls.h / 2,
          A.bowls.at[0] + 0.12,
        ),
      );
    const [cy, cz] = A.candleAt;
    const xs = A.candles.map(([x]) => x),
      tall = Math.max(...A.candles.map(([, h]) => h));
    out.push(
      box(
        al,
        'black candles',
        [(Math.min(...xs) + Math.max(...xs)) / 2, cy + (tall + 0.1) / 2, cz],
        [Math.max(...xs) - Math.min(...xs) + 0.08, tall + 0.1, 0.08],
      ),
    );
    for (const [x, z, turn] of A.figures) out.push(...hooded(frame(al, [x, 0, z], { y: turn }), 'hooded figure'));
    const S = CULT.stones;
    const st = ground(S.at, S.turn);
    S.list.forEach(([x, z, w, h, lean], i) => {
      const [turn, tip] = S.drawn[i];
      const f = frame(st, [x, -0.04, z], { x: tip, y: turn, z: lean });
      // (Its sigil stands a little proud of its face.)
      out.push(box(f, `standing stone ${'ABC'[i]}`, [0, h / 2, 0], [w, h, S.depth + 0.035]));
    });
    const [fx, fz] = CLEARING.frontLeft;
    out.push(...hooded(ground('frontLeft', Math.atan2(-fx, -fz), CULT.watcher.scale), 'hooded watcher'));
    return out;
  },
};
/** @type {Map<string, readonly Collider[]>} */
const built = new Map();
/**
 * A scenery's shapes (the same frozen list every time; none for one it doesn't know).
 * @returns {readonly Collider[]}
 */
export function collidersOf(name) {
  if (!built.has(name)) {
    const list = BUILDERS[name]?.() ?? [];
    // (Pieces of a kind numbered, so a test's message says which.)
    const seen = new Map();
    for (const c of list) seen.set(c.name, (seen.get(c.name) ?? 0) + 1);
    const n = new Map();
    for (const c of list)
      if (seen.get(c.name) > 1) {
        n.set(c.name, (n.get(c.name) ?? 0) + 1);
        c.name = `${c.name} ${n.get(c.name)}`;
      }
    // (A drum's axis, worked out once: distanceTo() runs thousands of times a knight's step.
    // And how fast its distance can change, m a metre (`lip`: 1 for a box; for a cylinder or a
    // drum, more by its taper): what's within r of a point is no nearer than the point's
    // distance less r × lip.)
    for (const c of list) {
      if (c.kind === 'log') {
        c.ax = Math.sin(c.yaw);
        c.az = Math.cos(c.yaw);
      }
      c.lip =
        1 +
        (c.kind === 'cyl'
          ? Math.abs(c.r1 - c.r0) / (c.y1 - c.y0)
          : c.kind === 'log' && c.r1 != null
            ? Math.abs(c.r1 - c.r) / (2 * c.half)
            : 0);
    }
    built.set(name, Object.freeze(list.map((c) => Object.freeze(c))));
  }
  return built.get(name);
}

// --- distances ---------------------------------------------------------------------------
/**
 * How far a point is from a shape's surface (m): + outside, − inside (how deep).
 * (The cylinder's sides are measured straight out from its axis: for its gentle tapers that's
 * within a few per cent of the true distance.)
 */
export function distanceTo(c, x, y, z) {
  // (Square roots, not Math.hypot: this is the knights' innermost loop, and hypot is slow.)
  if (c.kind === 'log') {
    const dx = x - c.c[0],
      dy = y - c.c[1],
      dz = z - c.c[2];
    const ax = c.ax ?? Math.sin(c.yaw),
      az = c.az ?? Math.cos(c.yaw);
    const w = dx * ax + dz * az;
    const r = c.r1 == null ? c.r : c.r + (c.r1 - c.r) * Math.min(1, Math.max(0, (w + c.half) / (2 * c.half)));
    const ox = dx - w * ax,
      oz = dz - w * az;
    const side = Math.sqrt(ox * ox + dy * dy + oz * oz) - r;
    const end = Math.abs(w) - c.half;
    const ps = Math.max(side, 0),
      pe = Math.max(end, 0);
    return Math.sqrt(ps * ps + pe * pe) + Math.min(Math.max(side, end), 0);
  }
  if (c.kind === 'cyl') {
    const rx = x - c.x,
      rz = z - c.z;
    const rho = Math.sqrt(rx * rx + rz * rz);
    const t = Math.min(1, Math.max(0, (y - c.y0) / (c.y1 - c.y0)));
    const side = rho - (c.r0 + (c.r1 - c.r0) * t);
    const end = Math.max(c.y0 - y, y - c.y1);
    if (side <= 0 && end <= 0) return Math.max(side, end);
    const ps = Math.max(side, 0),
      pe = Math.max(end, 0);
    return Math.sqrt(ps * ps + pe * pe);
  }
  const m = c.m,
    dx = x - c.c[0],
    dy = y - c.c[1],
    dz = z - c.c[2];
  // (Into the box's own axes: its turn's transpose.)
  const qx = Math.abs(m[0] * dx + m[3] * dy + m[6] * dz) - c.h[0];
  const qy = Math.abs(m[1] * dx + m[4] * dy + m[7] * dz) - c.h[1];
  const qz = Math.abs(m[2] * dx + m[5] * dy + m[8] * dz) - c.h[2];
  const px = Math.max(qx, 0),
    py = Math.max(qy, 0),
    pz = Math.max(qz, 0);
  return Math.sqrt(px * px + py * py + pz * pz) + Math.min(Math.max(qx, qy, qz), 0);
}
/** The way out of a shape at a point (unit, the clearing's axes): where its distance grows fastest. */
export function outOf(c, x, y, z, out = [0, 0, 0]) {
  const e = 0.002;
  out[0] = distanceTo(c, x + e, y, z) - distanceTo(c, x - e, y, z);
  out[1] = distanceTo(c, x, y + e, z) - distanceTo(c, x, y - e, z);
  out[2] = distanceTo(c, x, y, z + e) - distanceTo(c, x, y, z - e);
  const l = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}
/**
 * How far a place on the ground (x, z) is from a shape, over the heights a standing knight's
 * arms and body take (`from`..`to` m): the room round him there, from his middle.
 */
export function clearanceTo(c, x, z, { from = 0.6, to = 2.4 } = {}) {
  let d = Infinity;
  for (let y = from; y <= to + 1e-9; y += 0.1) d = Math.min(d, distanceTo(c, x, y, z));
  return d;
}
/** A scenery's shapes within `r` m of a place on the ground (anywhere from the ground up). */
export function collidersNear(name, x, z, r) {
  return collidersOf(name).filter((c) => clearanceTo(c, x, z, { from: 0, to: 2.6 }) < r);
}

// --- how far the dances reach --------------------------------------------------------------
/** The height bands (m, from the ground up) MOVE_REACH and roomAround() are measured in. */
export const REACH_BANDS = [0.4, 0.8, 1.2, 1.6, 2.0, 2.6];
/**
 * How far each dance move reaches out from a dancer's place (m, over the ground), danced on
 * his feet at full energy, either way round (every seed): in each height band (REACH_BANDS),
 * [in front of him (within 45° of the way he faces), to his sides, behind him]. Measured on
 * the real model, rounded up to the centimetre; test/knightClearance.test.mjs checks they
 * still hold. (A spin's arms reach all round; a jump's and a jumping jack's out to the sides.)
 */
export const MOVE_REACH = {
  nod: [
    [0.39, 0.46, 0.19],
    [0.47, 0.53, 0.19],
    [0.47, 0.41, 0.13],
    [0.31, 0.21, 0.08],
    [0, 0, 0],
  ],
  stepTouch: [
    [0.44, 0.56, 0.2],
    [0.6, 0.73, 0.22],
    [0.57, 0.69, 0.2],
    [0.28, 0.27, 0.13],
    [0, 0, 0],
  ],
  fistPump: [
    [0.38, 0.43, 0.17],
    [0.44, 0.59, 0.17],
    [0.45, 0.58, 0.2],
    [0.28, 0.29, 0.22],
    [0, 0, 0],
  ],
  headbang: [
    [0.67, 0.65, 0.17],
    [0.73, 0.6, 0.16],
    [0.72, 0.63, 0.11],
    [0.33, 0.19, 0.1],
    [0, 0, 0],
  ],
  swayArms: [
    [0.37, 0.44, 0.19],
    [0.24, 0.4, 0.18],
    [0.23, 0.74, 0.22],
    [0.28, 0.74, 0.21],
    [0, 0.35, 0],
  ],
  march: [
    [0.52, 0.48, 0.16],
    [0.61, 0.61, 0.61],
    [0.58, 0.58, 0.55],
    [0.2, 0.23, 0.21],
    [0, 0, 0],
  ],
  spin: [
    [0.39, 0.4, 0.4],
    [0.4, 0.4, 0.4],
    [0.92, 0.92, 0.92],
    [0.83, 0.83, 0.83],
    [0, 0, 0],
  ],
  jump: [
    [0.4, 0.5, 0.18],
    [0.39, 0.78, 0.17],
    [0.43, 0.77, 0.15],
    [0.28, 0.75, 0.21],
    [0.08, 0.58, 0],
  ],
  jumpingJack: [
    [0.41, 0.56, 0.16],
    [0.27, 0.78, 0.17],
    [0.23, 0.75, 0.14],
    [0.23, 0.87, 0.15],
    [0, 0.63, 0],
  ],
  clap: [
    [0.38, 0.42, 0.17],
    [0.45, 0.54, 0.17],
    [0.54, 0.66, 0.22],
    [0.43, 0.54, 0.18],
    [0, 0, 0],
  ],
  stomp: [
    [0.52, 0.53, 0.18],
    [0.51, 0.55, 0.26],
    [0.54, 0.39, 0.1],
    [0.33, 0.26, 0.04],
    [0, 0, 0],
  ],
  praise: [
    [0.4, 0.38, 0.16],
    [0.23, 0.28, 0.21],
    [0.14, 0.49, 0.44],
    [0, 0.63, 0.37],
    [0, 0, 0],
  ],
  defaultDance: [
    [0.76, 0.7, 0.21],
    [0.56, 0.72, 0.2],
    [0.56, 0.64, 0.19],
    [0.3, 0.28, 0.2],
    [0, 0, 0],
  ],
};
/**
 * The room round a place on the ground for someone there facing `yaw` (m, at most `most`):
 * in each height band (REACH_BANDS), [in front of him, to his sides, behind him] (as
 * MOVE_REACH), how far he can reach before meeting one of the scenery's shapes: level rays
 * out from where he stands every 10°, at each band's bottom, middle and top.
 */
export function roomAround(name, x, z, yaw, most = 1.2) {
  const cs = collidersNear(name, x, z, most);
  return REACH_BANDS.slice(1).map((top, b) => {
    const room = [most, most, most];
    if (!cs.length) return room;
    const low = REACH_BANDS[b];
    for (let a = -180; a < 180; a += 10) {
      const way = Math.abs(a) <= 45 ? 0 : Math.abs(a) < 135 ? 1 : 2;
      const dx = Math.sin(yaw + (a * Math.PI) / 180),
        dz = Math.cos(yaw + (a * Math.PI) / 180);
      for (const y of [low + 0.05, (low + top) / 2, top - 0.05]) {
        // (Out along the ray, a step at a time as far as the nearest shape allows.)
        let t = 0;
        while (t < room[way]) {
          let d = Infinity;
          for (const c of cs) d = Math.min(d, distanceTo(c, x + dx * t, y, z + dz * t));
          if (d < 0.005) break;
          t += Math.max(d, 0.01);
        }
        room[way] = Math.min(room[way], t);
      }
    }
    return room;
  });
}
/** Whether a move's reach (MOVE_REACH) fits in a place's room (roomAround), with `spare` (m) to spare. */
export const reachFits = (move, room, spare = 0.05) =>
  (MOVE_REACH[move] ?? []).every((band, b) => band.every((r, w) => !r || r <= room[b][w] - spare));
/**
 * Whether dance moves fit at places, the room round each place kept (roomAround casts a few
 * hundred rays; a show's places are a handful per scenery): fits(scenery, move, x, z, yaw).
 * clear() forgets them (a new scenery); past `most` places it starts over.
 */
export function createFits(most = 64) {
  const rooms = new Map();
  return {
    fits(name, move, x, z, yaw) {
      const key = `${name} ${x} ${z} ${yaw}`;
      let room = rooms.get(key);
      if (!room) {
        if (rooms.size >= most) rooms.clear();
        room = roomAround(name, x, z, yaw);
        rooms.set(key, room);
      }
      return reachFits(move, room);
    },
    clear() {
      rooms.clear();
    },
  };
}
