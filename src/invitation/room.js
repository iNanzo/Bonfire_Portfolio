// NEWT's room: a plain box with its front wall missing (the camera looks in through it), a floor,
// a back wall, two side walls and a baseboard, nothing else. Its depth and wall height are fixed
// (pixels.js ROOM); its width follows the screen (setWidth). Colours come from the look preset.
// Every surface is a toon material marking its own id, so the retro pass draws a line where the
// floor meets a wall; the walls and floor take NEWT's shadow and cast none.
//
//   roomBounds(width)  where NEWT's root may go: inside the walls and an invisible front edge
//                      kept clear of the toolbar, less his radius
import * as THREE from 'three';
import { ROOM } from './pixels.js';
import { ID, markId, toonGradient } from './retro.js';

/** NEWT's radius on the floor, world units. */
export const NEWT_RADIUS = 0.25;
/** The invisible front edge sits this far inside the floor's front (his toes stay on it). */
const FRONT_GAP = 0.1;
const BASEBOARD = { height: 0.07, depth: 0.03 };

/**
 * Where NEWT's root may go in a room `width` wide.
 * @param {number} width
 * @param {number} [radius]
 * @returns {import('./types.js').Bounds}
 */
export function roomBounds(width, radius = NEWT_RADIUS) {
  const half = ROOM.depth / 2;
  return {
    minX: -width / 2 + radius,
    maxX: width / 2 - radius,
    minZ: -half + radius,
    maxZ: half - radius - FRONT_GAP,
  };
}

/**
 * The room, as a group to add to the scene.
 * @param {import('./look.js').LookPreset} preset
 */
export function createRoom(preset) {
  const group = new THREE.Group();
  group.name = 'Room';
  let gradient = toonGradient(preset.toon);
  const surface = (id) => markId(new THREE.MeshToonMaterial({ gradientMap: gradient }), id);
  const mats = {
    floor: surface(ID.floor),
    wall: surface(ID.wall),
    side: surface(ID.side),
    baseboard: surface(ID.baseboard),
  };
  const plane = new THREE.PlaneGeometry(1, 1);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mesh = (geometry, material) => {
    const m = new THREE.Mesh(geometry, material);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const half = ROOM.depth / 2;
  const floor = mesh(plane, mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(1, ROOM.depth, 1);
  const back = mesh(plane, mats.wall);
  back.position.set(0, ROOM.wall / 2, -half);
  back.scale.set(1, ROOM.wall, 1);
  const sides = [-1, 1].map((s) => {
    const m = mesh(plane, mats.side);
    m.rotation.y = (-s * Math.PI) / 2;
    m.scale.set(ROOM.depth, ROOM.wall, 1);
    m.position.set(0, ROOM.wall / 2, 0);
    return m;
  });
  const backBoard = mesh(box, mats.baseboard);
  backBoard.position.set(0, BASEBOARD.height / 2, -half + BASEBOARD.depth / 2);
  const sideBoards = [-1, 1].map(() => {
    const m = mesh(box, mats.baseboard);
    m.scale.set(BASEBOARD.depth, BASEBOARD.height, ROOM.depth);
    m.position.set(0, BASEBOARD.height / 2, 0);
    return m;
  });
  let width = ROOM.minWidth;

  /** @param {number} w */
  function setWidth(w) {
    width = w;
    floor.scale.x = w;
    back.scale.x = w;
    backBoard.scale.set(w, BASEBOARD.height, BASEBOARD.depth);
    [-1, 1].forEach((s, i) => {
      sides[i].position.x = (s * w) / 2;
      sideBoards[i].position.x = s * (w / 2 - BASEBOARD.depth / 2);
    });
  }

  /** @param {import('./look.js').LookPreset} p */
  function setLook(p) {
    for (const k of /** @type {const} */ (['floor', 'wall', 'side', 'baseboard']))
      mats[k].color.setStyle(p.room[k], THREE.SRGBColorSpace);
    const next = toonGradient(p.toon);
    for (const m of Object.values(mats)) m.gradientMap = next;
    gradient.dispose();
    gradient = next;
  }

  setWidth(width);
  setLook(preset);
  return {
    group,
    setWidth,
    setLook,
    get width() {
      return width;
    },
    get bounds() {
      return roomBounds(width);
    },
    dispose() {
      plane.dispose();
      box.dispose();
      for (const m of Object.values(mats)) m.dispose();
      gradient.dispose();
    },
  };
}
