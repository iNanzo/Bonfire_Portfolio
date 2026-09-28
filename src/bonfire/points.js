// Particle buffers: a THREE.Points with the attributes the particle materials read
// (position, color, size and, for most, alpha), and the flame ramp as colors.
import * as THREE from 'three';

/**
 * `n` particles (all size 0, so hidden, until written). Always drawn: particles fly far
 * from where they start, so frustum culling by the initial bounds would drop them.
 * `vel`: the simulation's own velocity array (n × 3, world m/s), shared as the `vel`
 * attribute so the particles draw as motion streaks (see flame.js); flag it with
 * `markDirty` or `streaks(points)` each frame it changes.
 */
export function createPoints(n, material, { alpha = true, vel = null } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (alpha) geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (vel) geo.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}

/** Upload every attribute of `points` this frame. */
export function markDirty(points) {
  const a = points.geometry.attributes;
  for (const k in a) a[k].needsUpdate = true;
}

/** A flame ramp ([lo, mid, hi, core] sRGB hexes) as colors. */
export const rampColors = (hexes) => hexes.map((h) => new THREE.Color(h));
/** Set a ramp's colors in place (color blends call this every frame: no new objects). */
export function setRampColors(colors, hexes) {
  for (let i = 0; i < colors.length; i++) colors[i].set(hexes[i]);
  return colors;
}
