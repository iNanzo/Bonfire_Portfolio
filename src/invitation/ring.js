// The invitation toy's floor ring, as stage.js draws it: the cursor marker where the pointer
// meets the floor, and the ring under NEWT while he's held (Ground Cues). Its shader
// (RING_FRAGMENT) draws it from each texel's distance to its centre, its rim RING.rim texels wide
// from that distance's screen derivative, so it's as crisp at 12° as at 70° and at any zoom,
// never a stretched texture's stair-steps: cut hard with the pixel look on, a texel's smooth
// edge at Pixel Size Off (ringCover is the same sum in JS, for the tests). Its centre is moved
// onto the texel grid (snapToTexel: it steps a whole texel at a time and keeps its shape as it
// goes), its radius is at least RING.minTexels texels where it is (ringRadius, texelSize: never
// a dot), and the cursor marker fades out as the view gets low over it (markerFade: below about
// 18°, where a ring flattens into a dash). Pure but for three's vectors.
import * as THREE from 'three';

const RAD = Math.PI / 180;

/**
 * rim: the rim's width, texels (along the distance's gradient on screen). minTexels: the
 * smallest radius on screen, texels. fadeFull/fadeGone: the cursor marker's strength by the
 * view's elevation over it, full from fadeFull up and none by fadeGone (radians).
 */
export const RING = { rim: 2, minTexels: 6, fadeFull: 18 * RAD, fadeGone: 10 * RAD };

/**
 * The ring's fragment code (after three's color_fragment, in retro.js decalMaterial's shader,
 * whose uIdOn is 1 with the pixel look on): vRingWorld is the fragment's world position,
 * uRingCentre the centre on the floor (x, z) and uRingRadius its outer radius, world units.
 */
export const RING_FRAGMENT = `
	float ringD = distance( vRingWorld.xz, uRingCentre );
	float ringG = max( length( vec2( dFdx( ringD ), dFdy( ringD ) ) ), 1e-6 );
	float ringIn = ( ringD - ( uRingRadius - ${RING.rim.toFixed(1)} * ringG ) ) / ringG;
	float ringOut = ( uRingRadius - ringD ) / ringG;
	float ringA = uIdOn > 0.5
		? step( 0.0, ringIn ) * ( 1.0 - step( ringOut, 0.0 ) )
		: clamp( ringIn + 0.5, 0.0, 1.0 ) * clamp( ringOut + 0.5, 0.0, 1.0 );
	if ( ringA <= 0.0 ) discard;
	diffuseColor.a = opacity * ringA;`;

/**
 * The ring's cover at distance `d` from its centre (the shader's sum): 1 on its rim, from
 * RING.rim texels inside `radius` to it, else 0; at Off (`smooth`) the edges fall off over a
 * texel. `g` is a texel's world size there (the distance's screen derivative).
 * @param {number} d
 * @param {number} g
 * @param {number} radius
 * @param {boolean} smooth
 */
export function ringCover(d, g, radius, smooth) {
  const inside = (d - (radius - RING.rim * g)) / g;
  const outside = (radius - d) / g;
  if (!smooth) return inside >= 0 && outside > 0 ? 1 : 0;
  const c = (/** @type {number} */ v) => Math.min(1, Math.max(0, v + 0.5));
  return c(inside) * c(outside);
}

/**
 * A texel's world size `far` from the camera: the view's height there over the texels down.
 * @param {number} far
 * @param {number} fov  the camera's vertical field of view, degrees
 * @param {number} rows  the texels down the target
 */
export function texelSize(far, fov, rows) {
  return (2 * far * Math.tan((fov * RAD) / 2)) / Math.max(1, rows);
}

/**
 * The ring's radius, world units: its own, or RING.minTexels texels where it is if that's more.
 * @param {number} radius
 * @param {number} texel  a texel's world size there (texelSize)
 */
export function ringRadius(radius, texel) {
  return Math.max(radius, RING.minTexels * texel);
}

/**
 * The cursor marker's strength at the view's elevation over it (radians): 1 from RING.fadeFull
 * up, easing to 0 by RING.fadeGone.
 * @param {number} elevation
 */
export function markerFade(elevation) {
  const k = Math.min(1, Math.max(0, (elevation - RING.fadeGone) / (RING.fadeFull - RING.fadeGone)));
  return k * k * (3 - 2 * k);
}

/**
 * The view's elevation over a spot on the floor, radians: how high the camera is over it.
 * @param {import('./types.js').XYZ} camera  the camera's position
 * @param {import('./types.js').XZ} spot
 */
export function elevationAt(camera, spot) {
  return Math.atan2(camera.y, Math.hypot(camera.x - spot.x, camera.z - spot.z));
}

const v = new THREE.Vector3();
const near = new THREE.Vector3();
const far = new THREE.Vector3();

/**
 * The spot moved onto the texel grid: the point on the floor (at height `y`) that shows at the
 * texel corner nearest where the spot shows, so the ring steps a whole texel at a time. A spot
 * off the screen or behind the camera is left as it is.
 * @param {import('./types.js').XZ} spot
 * @param {THREE.PerspectiveCamera} camera  its matrices up to date
 * @param {{w: number, h: number}} grid  the target's texels
 * @param {number} y
 * @returns {import('./types.js').XZ}
 */
export function snapToTexel(spot, camera, grid, y) {
  v.set(spot.x, y, spot.z).applyMatrix4(camera.matrixWorldInverse);
  if (v.z >= -camera.near) return spot;
  v.set(spot.x, y, spot.z).project(camera);
  if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return spot;
  const tx = Math.round(((v.x + 1) / 2) * grid.w);
  const ty = Math.round(((v.y + 1) / 2) * grid.h);
  // (Back through that corner: the ray from the near plane to the far one, met with the floor.)
  const nx = (tx / grid.w) * 2 - 1;
  const ny = (ty / grid.h) * 2 - 1;
  near.set(nx, ny, -1).unproject(camera);
  far.set(nx, ny, 1).unproject(camera);
  const dy = far.y - near.y;
  if (Math.abs(dy) < 1e-9) return spot;
  const k = (y - near.y) / dy;
  return { x: near.x + (far.x - near.x) * k, z: near.z + (far.z - near.z) * k };
}
