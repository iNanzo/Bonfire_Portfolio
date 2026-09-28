// Other places for the fire (the visualizer's scenes): the model's Gothic ruins, a
// blacksmith's forge, or a hillside shrine. The fire pit, the ground and the flagstones
// stay; what stands around them changes. The new scenery is built here from low-poly
// primitives, jittered by hand-picked seeds for a hand-made look, in the model's own
// materials (so it outlines, lights and quantizes like the rest), and stands where the
// ruins do: its tops are where the fireflies like to land, and the rings of fire still
// break against it.
//
//   forge   back right, a stone hearth with glowing coals under a tapering chimney and
//           a bellows; back left, an anvil on a stump, a hammer, a quench barrel
//   shrine  back right, a torii gate over two steps; back left and front left, stone
//           lanterns with glowing paper windows; an offering stone roped round
//
// Glowing parts ("glows") pulse in the flame's colors like the coals in the ash pile.
import * as THREE from 'three';

export const SCENERIES = { ruins: 'Gothic Ruins', forge: 'The Forge', shrine: 'The Shrine' };

// Where the ruins stand (three.js coordinates: the model's +y is -z here).
const LEFT = new THREE.Vector3(-1.45, 0, -1.35);
const RIGHT = new THREE.Vector3(1.9, 0, -1.5);
const RIGHT_TURN = THREE.MathUtils.degToRad(-28);

/** A seeded random (the same scenery every time). */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
/** Nudge every vertex a little (a hand-cut look), keeping flat faces flat per triangle. */
function roughen(geo, amount, rand) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]);
    const [dx, dy, dz] = seen.get(key);
    p.setXYZ(i, p.getX(i) + dx, p.getY(i) + dy, p.getZ(i) + dz);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Build one scenery. `mat`: the model's materials by name (stone, pillar, wood, char, wax,
 * mortar), `glowMaterial()`: a new glowing material. Returns { group, glows, lights }:
 * `lights` are [{ at: Vector3, color, intensity, distance }] for small point lights.
 */
export function buildScenery(name, mat, glowMaterial) {
  const group = new THREE.Group();
  group.name = `Scenery_${name}`;
  const glows = [];
  const lights = [];
  const rand = rng(name === 'forge' ? 7 : 11);
  const add = (geo, material, x, y, z, { rx = 0, ry = 0, rz = 0, parent = group, rough = 0.012 } = {}) => {
    const mesh = new THREE.Mesh(rough ? roughen(geo, rough, rand) : geo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r0, r1, h, seg = 8) => new THREE.CylinderGeometry(r1, r0, h, seg);
  const glow = (geo, x, y, z, o = {}) => { const m = add(geo, glowMaterial(), x, y, z, { rough: 0, ...o }); glows.push(m); return m; };

  if (name === 'forge') {
    // --- the hearth, back right
    const hearth = new THREE.Group();
    hearth.position.copy(RIGHT);
    hearth.rotation.y = RIGHT_TURN;
    group.add(hearth);
    // A stone base of blocks, with an opening for the coals.
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (row >= 1 && row <= 2 && (col === 1 || col === 2)) continue; // the opening
        const off = row % 2 ? 0.2 : 0;
        add(box(0.38, 0.22, 0.8), mat.pillar, -0.6 + col * 0.4 + off - 0.1, 0.11 + row * 0.23, 0, { parent: hearth });
      }
    }
    add(box(1.7, 0.12, 0.9), mat.stone, 0, 0.98, 0, { parent: hearth });                          // the hearth top
    add(box(0.9, 0.4, 0.7), mat.mortar, 0, 0.35, -0.05, { parent: hearth, rough: 0 });              // inside the opening
    glow(box(0.7, 0.14, 0.5), 0, 0.3, 0.05, { parent: hearth });                                     // the coals
    glow(box(0.5, 0.08, 0.3), 0.05, 0.4, 0.08, { parent: hearth });
    // The hood and a tapering chimney.
    add(cyl(0.62, 0.38, 0.5, 4), mat.pillar, 0, 1.28, 0, { parent: hearth, ry: Math.PI / 4 });
    add(cyl(0.3, 0.24, 1.6, 4), mat.pillar, 0, 2.3, -0.05, { parent: hearth, ry: Math.PI / 4 });
    // Bellows beside it: a leather wedge between two boards.
    add(box(0.5, 0.05, 0.34), mat.wood, 1.08, 0.5, 0.1, { parent: hearth, rz: -0.25 });
    add(box(0.5, 0.05, 0.34), mat.wood, 1.08, 0.36, 0.1, { parent: hearth });
    add(box(0.42, 0.12, 0.3), mat.char, 1.06, 0.43, 0.1, { parent: hearth, rz: -0.12 });
    lights.push({ at: new THREE.Vector3(0, 0.5, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), RIGHT_TURN).add(RIGHT), intensity: 1.4, distance: 2.6 });

    // --- the anvil, back left
    const smith = new THREE.Group();
    smith.position.copy(LEFT);
    smith.rotation.y = 0.5;
    group.add(smith);
    add(cyl(0.28, 0.25, 0.52, 9), mat.wood, 0, 0.26, 0, { parent: smith });                          // the stump
    add(box(0.26, 0.1, 0.2), mat.char, 0, 0.57, 0, { parent: smith, rough: 0.004 });                 // anvil foot
    add(box(0.14, 0.12, 0.12), mat.char, 0, 0.67, 0, { parent: smith, rough: 0.004 });               // waist
    add(box(0.42, 0.1, 0.16), mat.char, 0.02, 0.78, 0, { parent: smith, rough: 0.004 });             // face
    add(new THREE.ConeGeometry(0.07, 0.24, 6), mat.char, 0.34, 0.78, 0, { parent: smith, rz: -Math.PI / 2, rough: 0.004 }); // horn
    // A hammer lying on the face, and a quench barrel beside the stump.
    add(cyl(0.018, 0.018, 0.32, 5), mat.wood, -0.05, 0.85, 0.05, { parent: smith, rz: Math.PI / 2, ry: 0.4, rough: 0 });
    add(box(0.06, 0.06, 0.12), mat.stone, -0.2, 0.86, 0.1, { parent: smith, ry: 0.4, rough: 0 });
    add(cyl(0.26, 0.24, 0.6, 10), mat.wood, 0.62, 0.3, 0.3, { parent: smith });
    add(cyl(0.23, 0.23, 0.02, 10), mat.mortar, 0.62, 0.58, 0.3, { parent: smith, rough: 0 });       // the water
    // Stacked bar stock by the anvil.
    for (let i = 0; i < 4; i++) add(box(0.7, 0.04, 0.05), mat.char, -0.45, 0.03 + i * 0.045, 0.45 + i * 0.02, { parent: smith, ry: 0.3 + i * 0.05, rough: 0.003 });
  } else if (name === 'shrine') {
    // --- the torii, back right, over two steps
    const gate = new THREE.Group();
    gate.position.copy(RIGHT);
    gate.rotation.y = RIGHT_TURN;
    group.add(gate);
    add(box(2.4, 0.12, 1.1), mat.stone, 0, 0.06, 0, { parent: gate });
    add(box(2.0, 0.12, 0.8), mat.stone, 0, 0.18, -0.08, { parent: gate });
    for (const x of [-0.72, 0.72]) {
      add(cyl(0.1, 0.085, 2.1, 8), mat.wood, x, 1.29, -0.08, { parent: gate, rough: 0.006 });
      add(cyl(0.14, 0.14, 0.14, 8), mat.char, x, 0.31, -0.08, { parent: gate, rough: 0 });        // the footing
    }
    add(box(1.8, 0.1, 0.14), mat.wood, 0, 1.95, -0.08, { parent: gate });                           // nuki (tie beam)
    add(box(2.3, 0.12, 0.22), mat.wood, 0, 2.3, -0.08, { parent: gate });                           // shimaki
    add(box(2.6, 0.1, 0.26), mat.char, 0, 2.41, -0.08, { parent: gate, rough: 0.006 });            // kasagi (top)
    add(box(0.12, 0.34, 0.12), mat.wood, 0, 2.12, -0.08, { parent: gate });                         // gakuzuka
    // A paper lantern hanging from the tie beam lights the gate.
    add(cyl(0.008, 0.008, 0.3, 4), mat.char, 0, 1.75, -0.08, { parent: gate, rough: 0 });
    glow(cyl(0.12, 0.12, 0.28, 8), 0, 1.46, -0.08, { parent: gate });
    add(cyl(0.1, 0.1, 0.04, 8), mat.char, 0, 1.62, -0.08, { parent: gate, rough: 0 });
    add(cyl(0.1, 0.1, 0.04, 8), mat.char, 0, 1.3, -0.08, { parent: gate, rough: 0 });
    lights.push({ at: new THREE.Vector3(0, 1.4, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), RIGHT_TURN).add(RIGHT), intensity: 0.9, distance: 2.4 });
    // A small offering stone in front of the gate, roped round.
    add(new THREE.IcosahedronGeometry(0.22, 0), mat.stone, 0.2, 0.42, 0.25, { parent: gate, rough: 0.03 });
    add(new THREE.TorusGeometry(0.2, 0.025, 4, 10), mat.wax, 0.2, 0.44, 0.25, { parent: gate, rx: Math.PI / 2, rough: 0 });

    // --- stone lanterns (tōrō): back left, and one front left
    const lantern = (at, turn, scale = 1) => {
      const t = new THREE.Group();
      t.position.copy(at);
      t.rotation.y = turn;
      t.scale.setScalar(scale);
      group.add(t);
      add(box(0.5, 0.14, 0.5), mat.pillar, 0, 0.07, 0, { parent: t });                               // base
      add(cyl(0.1, 0.08, 0.8, 6), mat.pillar, 0, 0.54, 0, { parent: t });                            // post
      add(box(0.44, 0.1, 0.44), mat.pillar, 0, 0.98, 0, { parent: t });                              // platform
      add(box(0.32, 0.3, 0.32), mat.pillar, 0, 1.18, 0, { parent: t, rough: 0.006 });               // light box
      glow(box(0.2, 0.2, 0.34), 0, 1.18, 0, { parent: t });                                          // paper windows
      glow(box(0.34, 0.2, 0.2), 0, 1.18, 0, { parent: t });
      add(new THREE.ConeGeometry(0.38, 0.24, 4), mat.pillar, 0, 1.45, 0, { parent: t, ry: Math.PI / 4 }); // roof
      add(new THREE.SphereGeometry(0.06, 5, 4), mat.pillar, 0, 1.6, 0, { parent: t, rough: 0 });   // finial
      lights.push({ at: new THREE.Vector3(0, 1.18 * scale, 0).add(at), intensity: 0.7, distance: 2 });
    };
    lantern(LEFT, 0.3);
    lantern(new THREE.Vector3(-1.9, 0, 0.6), -0.2, 0.8);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = !glows.includes(o); o.receiveShadow = true; } });
  return { group, glows, lights };
}
