// Give Device's tablet in the invitation toy: a procedural three.js pad NEWT holds in both hands
// while he sits or lies with it (0 bytes to load, no glb change). clips.js DEVICE is its
// contract with tools/newt.py's arm IK: its size, where his palms are along each ForeArm, and
// per clip the tilt of its screen, how far his palms sit off its mid-plane and where they grip
// it (sitting its side edges; lying its near edge, so it sticks out past his face). A cream toon
// bezel (his gradient, his texel snap) and an unlit screen showing a 16×12 pixel game,
// nearest-filtered so it stays pixels, both marked as his (retro.js markId) so the retro pass
// outlines them with him. character.js places it each frame at his palms' midpoint (less the
// clip's lift along its screen's normal, moved its grip away from him along the screen), its
// width along the line from palm to palm, at the clips' tilt by their weights, and shows it
// while DeviceSit, LieDown and DeviceLie weigh 0.5 or more (it stays in his hands as he lies
// down), until he starts to get up (StandUp or GetUp).
// deviceFrame, deviceShown, deviceTilt and gameFrame are pure; createTablet builds the meshes.

import * as THREE from 'three';
import { DEVICE } from './clips.js';
import { ID, markId } from './retro.js';

/** @typedef {import('./types.js').XYZ} XYZ */

const DEG = Math.PI / 180;
/** The pad, model units: width, height (away from him), thickness, and the bezel round its screen. */
export const TABLET = { w: DEVICE.size[0], h: DEVICE.size[1], d: DEVICE.size[2], bezel: 0.1 };
/** The screen's pixels. */
export const SCREEN = { w: 16, h: 12 };
/** How far along each ForeArm bone his palm is, model units. */
export const PALM = DEVICE.palm;
/** The clips he holds it in: sitting with it, lying down with it, lying with it. */
export const DEVICE_CLIPS = Object.keys(DEVICE.clips);
/** Each clip's tilt of the screen from facing straight up toward his face, radians. */
export const DEVICE_TILT = Object.fromEntries(DEVICE_CLIPS.map((k) => [k, DEVICE.clips[k].tilt * DEG]));
/** Each clip's palms off the pad's mid-plane along its screen's normal, model units. */
export const DEVICE_LIFT = Object.fromEntries(DEVICE_CLIPS.map((k) => [k, DEVICE.clips[k].lift]));
/** Each clip's grip back toward him along the screen from its middle (0: by its sides), model units. */
export const DEVICE_GRIP = Object.fromEntries(DEVICE_CLIPS.map((k) => [k, DEVICE.clips[k].grip[1]]));
/** It shows once the clips he holds it in (HOLDING) weigh this much between them. */
export const SHOW_AT = 0.5;
/** The clips he holds it in (LieDown among them: it stays in his hands as he lies down). */
export const HOLDING = DEVICE_CLIPS;
/** The clips that get him up: from their first frame it's put away. */
export const RISING = ['StandUp', 'GetUp'];
/** The bezel's cream. */
const CREAM = 0xf6ecd2;
/** The game's frames a second. */
const GAME_FPS = 8;

/**
 * Whether the tablet shows: the clips he holds it in (HOLDING) weigh SHOW_AT or more between
 * them, and he isn't getting up (RISING: none of their weight).
 * @param {(clip: string) => number} weightOf
 */
export function deviceShown(weightOf) {
  const sum = (/** @type {string[]} */ ks) => ks.reduce((s, k) => s + Math.max(0, weightOf(k)), 0);
  return sum(HOLDING) >= SHOW_AT - 1e-9 && sum(RISING) <= 1e-6;
}

/**
 * A value per clip, mixed by their weights (DeviceSit's while neither weighs anything).
 * @param {Record<string, number>} per
 * @param {(clip: string) => number} weightOf
 */
function mixed(per, weightOf) {
  let sum = 0;
  let w = 0;
  for (const k of DEVICE_CLIPS) {
    const x = Math.max(0, weightOf(k));
    sum += per[k] * x;
    w += x;
  }
  return w > 0 ? sum / w : per[DEVICE_CLIPS[0]];
}

/** @param {(clip: string) => number} weightOf  the screen's tilt, radians */
export const deviceTilt = (weightOf) => mixed(DEVICE_TILT, weightOf);
/** @param {(clip: string) => number} weightOf  his palms off its mid-plane, model units */
export const deviceLift = (weightOf) => mixed(DEVICE_LIFT, weightOf);
/** @param {(clip: string) => number} weightOf  its grip back toward him along the screen, model units */
export const deviceGrip = (weightOf) => mixed(DEVICE_GRIP, weightOf);

/**
 * Where the tablet goes, from his palms: at their midpoint less `lift` along its screen's normal
 * and moved `grip` away from him along the screen (held by its near edge, it sticks out in front),
 * its width along the line from his left palm to his right, its screen tilted `tilt` radians
 * from facing straight up toward his face (`forward`: the way he faces; he's behind it).
 * @param {XYZ} pL  his left palm
 * @param {XYZ} pR  his right palm
 * @param {XYZ} forward
 * @param {number} tilt
 * @param {number} [lift]
 * @param {number} [grip]
 * @returns {{centre: XYZ, right: XYZ, normal: XYZ, forward: XYZ}}
 */
export function deviceFrame(pL, pR, forward, tilt, lift = 0, grip = 0) {
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const unit = (a) => {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const right = unit({ x: pR.x - pL.x, y: pR.y - pL.y, z: pR.z - pL.z });
  // Up, made square to his palms' line; then his front, square to both.
  const k = right.y;
  const up = unit({ x: -right.x * k, y: 1 - right.y * k, z: -right.z * k });
  const f = dot(forward, right);
  const g = dot(forward, up);
  const ahead = unit({
    x: forward.x - right.x * f - up.x * g,
    y: forward.y - right.y * f - up.y * g,
    z: forward.z - right.z * f - up.z * g,
  });
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const normal = { x: up.x * c - ahead.x * s, y: up.y * c - ahead.y * s, z: up.z * c - ahead.z * s };
  // Along the screen away from him: its far edge rises as it tips toward his face.
  const away = { x: ahead.x * c + up.x * s, y: ahead.y * c + up.y * s, z: ahead.z * c + up.z * s };
  return {
    centre: {
      x: (pL.x + pR.x) / 2 - normal.x * lift + away.x * grip,
      y: (pL.y + pR.y) / 2 - normal.y * lift + away.y * grip,
      z: (pL.z + pR.z) / 2 - normal.z * lift + away.z * grip,
    },
    right,
    normal,
    forward: ahead,
  };
}

/** The game's colours (sRGB). */
const PAL = {
  sky: [26, 30, 70],
  star: [236, 236, 255],
  grass: [80, 190, 90],
  dirt: [52, 120, 60],
  dirtDark: [36, 86, 44],
  hero: [255, 210, 70],
  heroEye: [40, 30, 30],
  block: [235, 80, 80],
};
/** The runner's jump, rows up, a step at a time (GAME_FPS). */
const JUMP = [0, 1, 2, 3, 3, 3, 2, 1, 0, 0, 0, 0];

/**
 * The tablet's game at `t` seconds: a little runner hopping blocks that scroll by under a starry
 * sky, as RGBA rows from the bottom up (a DataTexture's way round), SCREEN.w × SCREEN.h.
 * @param {number} t
 * @param {Uint8Array} [out]
 * @returns {Uint8Array}
 */
export function gameFrame(t, out = new Uint8Array(SCREEN.w * SCREEN.h * 4)) {
  const { w: W, h: H } = SCREEN;
  const step = Math.max(0, Math.floor(t * GAME_FPS));
  /** @param {number} x @param {number} y  y from the top @param {number[]} c */
  const put = (x, y, c) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = ((H - 1 - y) * W + x) * 4;
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = 255;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const star = y < 7 && (x * 7 + y * 13 + Math.floor(step / 3)) % 19 === 0;
      put(x, y, star ? PAL.star : PAL.sky);
    }
  // The ground scrolls by: grass on top, dirt with a dark fleck every few pixels.
  for (let x = 0; x < W; x++) {
    put(x, 10, PAL.grass);
    put(x, 11, (x + step) % 4 === 0 ? PAL.dirtDark : PAL.dirt);
  }
  // Two blocks coming at him, a block 1 wide and 2 tall.
  for (const k of [0, 9]) {
    const bx = W - 1 - ((step + k) % (W + 2));
    put(bx, 8, PAL.block);
    put(bx, 9, PAL.block);
  }
  // The runner, 2 × 2 with an eye, hopping.
  const hop = JUMP[step % JUMP.length];
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    put(3 + dx, 8 + dy - hop, PAL.hero);
  put(4, 8 - hop, PAL.heroEye);
  return out;
}

/**
 * The tablet's meshes: its bezel (toon, in `gradient`, snapped with `snap`) and its screen (unlit,
 * the game), both marked as his. `update(t)` moves the game on (only as its frame changes).
 * @param {{snap?: {value: {x: number, y: number}}, gradient?: any, bias?: {value: number}}} [o]
 */
export function createTablet({ snap, gradient = null, bias } = {}) {
  const group = new THREE.Group();
  group.name = 'Tablet';
  group.visible = false;
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(TABLET.w, TABLET.d, TABLET.h),
    markId(new THREE.MeshToonMaterial({ name: 'Tablet', color: CREAM, gradientMap: gradient }), ID.newt, {
      snap,
      bias,
    }),
  );
  bezel.name = 'TabletBezel';
  const data = new Uint8Array(SCREEN.w * SCREEN.h * 4);
  const map = new THREE.DataTexture(data, SCREEN.w, SCREEN.h);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  // (Facing up off the bezel's face; its picture's top at the far edge from him, as he sees it.)
  const glass = new THREE.PlaneGeometry(TABLET.w - 2 * TABLET.bezel, TABLET.h - 2 * TABLET.bezel);
  glass.rotateX(-Math.PI / 2);
  const screen = new THREE.Mesh(
    glass,
    markId(new THREE.MeshBasicMaterial({ name: 'TabletScreen', map }), ID.newt, { snap, bias: { value: 0 } }),
  );
  screen.name = 'TabletScreen';
  screen.position.y = TABLET.d / 2 + 0.004;
  for (const m of [bezel, screen]) {
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
  }
  group.add(bezel, screen);
  let shown = -1;
  const tablet = {
    group,
    bezel,
    screen,
    /** @param {number} t  the toy's clock, seconds */
    update(t) {
      const step = Math.floor(t * GAME_FPS);
      if (step === shown) return;
      shown = step;
      gameFrame(t, data);
      map.needsUpdate = true;
    },
    dispose() {
      bezel.geometry.dispose();
      screen.geometry.dispose();
      bezel.material.dispose();
      screen.material.dispose();
      map.dispose();
    },
  };
  tablet.update(0);
  return tablet;
}
