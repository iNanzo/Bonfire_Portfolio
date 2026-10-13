// NEWT's floor in the invitation toy: there's no room, just the look preset's background and a
// floor that catches his shadows. The floor itself never shows: it's a ShadowMaterial (only the
// shadow is drawn, in the preset's shadow colour and strength, over the background the retro
// pass clears to), far wider than any view, so no edge or horizon shows. It writes no depth and
// leaves the colour target's alpha (the surface id) alone, so the retro pass draws no line
// where it meets the background and none in the shadows: the lines stay on NEWT.
//
//   floorLook(preset)   the preset's background, shadow {color, opacity} and blob {opacity,
//                       lifted} as numbers, with fallbacks for a preset that lacks them (one
//                       still carrying the room's colours, or nothing at all)
//   createFloor(preset) the floor mesh, setLook(preset), dispose()
import * as THREE from 'three';

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
