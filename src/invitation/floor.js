// NEWT's floor in the invitation toy: there's no room, just the look preset's background and a
// floor that catches his shadows. The floor itself never shows: it's a ShadowMaterial (only the
// shadow is drawn, in the preset's shadow colour and strength, over the background the retro
// pass clears to), far wider than the play area his shadow falls in, so no edge or horizon
// shows: the floor is endless (main.js finds where a ray meets it with no edge at all). It
// writes no depth and leaves the colour target's alpha (the surface id) alone, so the retro
// pass draws no line where it meets the background and none in the shadows: the lines stay on
// NEWT.
//
//   floorLook(preset)   the preset's background, shadow {color, opacity} and blob {opacity,
//                       lifted} as numbers, with fallbacks for a preset that lacks them (one
//                       still carrying the room's colours, or nothing at all)
//   createFloor(preset) the floor mesh, setLook(preset), dispose()
//   fitShadow(sun, bounds, top, at)  the light's shadow camera fitted, in the light's view, to
//                       `bounds` (his reach past its edge) up to `top`, the highest he's lifted,
//                       and to the floor his shadow falls on from up there; with `at`, moved
//                       to there (where NEWT is in the play area) by whole shadow texels, so
//                       his shadow keeps its texels as he goes and never shimmers
//   shadowTop(lift, base)  how high that box reaches: `base`, or over his head carried higher
import * as THREE from 'three';
import { NEWT_HEIGHT, rimPoints } from './area.js';

/** World units across: far wider than any view of the floor. */
export const FLOOR_SIZE = 200;
const FALLBACK = { background: 0xffffff, shadow: 0x5a5048, opacity: 0.3, blob: 0.16 };

/** A colour as a number: a number kept, '#rrggbb' read, anything else null. */
function hex(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(0xffffff, Math.max(0, Math.round(v)));
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return Number.parseInt(v.slice(1), 16);
  return null;
}
/** A number in [0, 1], or the fallback. */
const unit = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/**
 * The scene's colours from a look preset: `background` (a hex number), `shadow` {color,
 * opacity} and `blob` {opacity, lifted}; the blob takes the shadow's colour. A preset without
 * them falls back on its room's background and blob colours (strings), then on white and a
 * warm grey shadow.
 * @param {any} preset  a LookPreset (looks/*.js)
 * @returns {{background: number, shadow: {color: number, opacity: number}, blob: {color: number, opacity: number, lifted: number}}}
 */
export function floorLook(preset) {
  const p = preset ?? {};
  const color = hex(p.shadow?.color) ?? hex(p.blob?.color) ?? FALLBACK.shadow;
  const opacity = unit(p.blob?.opacity, FALLBACK.blob);
  return {
    background: hex(p.background) ?? hex(p.room?.background) ?? FALLBACK.background,
    shadow: { color, opacity: unit(p.shadow?.opacity, FALLBACK.opacity) },
    blob: { color, opacity, lifted: Math.max(opacity, unit(p.blob?.lifted, Math.min(1, opacity * 1.9))) },
  };
}

/**
 * The floor, a mesh to add to the scene.
 * @param {any} preset  a LookPreset
 */
export function createFloor(preset) {
  const material = new THREE.ShadowMaterial({
    transparent: true,
    depthWrite: false,
    // (Its colour blends over the background; the target's alpha, the surface id, stays.)
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const geometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Floor';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  /** @param {any} p  a LookPreset */
  function setLook(p) {
    const { shadow } = floorLook(p);
    material.color.setHex(shadow.color, THREE.SRGBColorSpace);
    material.opacity = shadow.opacity;
  }

  setLook(preset);
  return {
    mesh,
    setLook,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** How far past his root his shadow's caster reaches (his arms, the swing while he's held). */
const REACH = 0.7;

/**
 * How high the shadow camera reaches with his root `lift` over the floor: `base` (the highest
 * he's lifted most of the time: the box his shadow's texels were tuned for) while that covers
 * the top of his head, else over it in half-unit steps (so the box, and his shadow's texels,
 * change only now and then while he's carried up high).
 * @param {number} lift
 * @param {number} base
 */
export function shadowTop(lift, base) {
  const head = lift + NEWT_HEIGHT + 0.25;
  return head <= base ? base : Math.ceil(head * 2) / 2;
}

/**
 * Fit `sun`'s shadow camera (orthographic, looking from the light at its target) around
 * `bounds`, `REACH` past its edge, from the floor up to `top`, and the floor its shadows fall on
 * from up there; with `at`, that box moved so the bounds' middle is at `at` (NEWT, wherever he
 * is in the play area: as big a box as round the middle, so his shadow is as fine), by whole
 * texels of the shadow map, so its texels stay put on the floor as he moves.
 * @param {any} sun  a THREE.DirectionalLight (its position and target's set)
 * @param {import('./types.js').Bounds} bounds
 * @param {number} top  world units
 * @param {{x: number, z: number}|null} [at]
 */
export function fitShadow(sun, bounds, top, at = null) {
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const f = new THREE.Vector3().subVectors(sun.target.position, sun.position).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f);
  // (A point `top` high throws its shadow this far along the floor, away from the light.)
  const throwX = (f.x / Math.max(1e-3, -f.y)) * top;
  const throwZ = (f.z / Math.max(1e-3, -f.y)) * top;
  const box = { l: Infinity, r: -Infinity, b: Infinity, t: -Infinity, n: Infinity, f: -Infinity };
  const p = new THREE.Vector3();
  const add = (x, y, z) => {
    p.set(x, y, z).sub(sun.position);
    box.l = Math.min(box.l, p.dot(r));
    box.r = Math.max(box.r, p.dot(r));
    box.b = Math.min(box.b, p.dot(u));
    box.t = Math.max(box.t, p.dot(u));
    box.n = Math.min(box.n, p.dot(f));
    box.f = Math.max(box.f, p.dot(f));
  };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  for (const q of rimPoints(bounds, 48)) {
    // (Out from the middle by his reach: a disc's rim grows, a box's corners move out.)
    const d = Math.hypot(q.x - cx, q.z - cz) || 1;
    const x = q.x + ((q.x - cx) / d) * REACH * (bounds.r === undefined ? Math.SQRT2 : 1);
    const z = q.z + ((q.z - cz) / d) * REACH * (bounds.r === undefined ? Math.SQRT2 : 1);
    add(x, 0, z);
    add(x, top, z);
    add(x + throwX, 0, z + throwZ);
  }
  if (at) {
    // (The move in the light's view: across and up by whole texels, along it as it comes.)
    const m = new THREE.Vector3(at.x - cx, 0, at.z - cz);
    const tx = (box.r - box.l) / Math.max(1, sun.shadow.mapSize.x);
    const ty = (box.t - box.b) / Math.max(1, sun.shadow.mapSize.y);
    const across = Math.round(m.dot(r) / tx) * tx;
    const up = Math.round(m.dot(u) / ty) * ty;
    const along = m.dot(f);
    box.l += across;
    box.r += across;
    box.b += up;
    box.t += up;
    box.n += along;
    box.f += along;
  }
  const cam = sun.shadow.camera;
  Object.assign(cam, { left: box.l, right: box.r, bottom: box.b, top: box.t, near: box.n - 0.5, far: box.f + 0.5 });
  cam.updateProjectionMatrix();
}
