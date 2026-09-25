// Camera points of view, one per screen. The fire sits at the origin; the
// broken pillar is back-left, the wall back-right.
//
//   pos / target  world-space camera position and look-at point
//   fov           vertical field of view (degrees)
//   sx, sy        where the look-at point lands on screen, as a fraction of the
//                 viewport from center (+sx = right, +sy = up) — this keeps the
//                 fire in the space each screen's layout leaves open.
//
// "wide" = desktop layouts with side panels; "tall" = phones/tablets where the
// panel sits below the scene.

const wide = {
  home: { pos: [0, 2.25, 6.2], target: [0, 0.5, 0], fov: 30, sx: 0.18, sy: 0 },
  projects: { pos: [0.35, 1.55, 4.4], target: [0, 0.8, 0], fov: 34, sx: 0, sy: 0.02 },
  inspect: { pos: [0.3, 1.25, 3.3], target: [0, 0.95, 0], fov: 38, sx: 0.06, sy: 0 },
  experience: { pos: [1.9, 1.7, 4.1], target: [-0.55, 0.62, -0.55], fov: 32, sx: -0.22, sy: 0 },
  skills: { pos: [0.4, 5.4, 2.6], target: [0, 0.1, 0], fov: 34, sx: 0.22, sy: 0 },
  about: { pos: [-2.4, 1.3, 3.4], target: [0.2, 0.7, -0.4], fov: 32, sx: -0.22, sy: 0 },
  contact: { pos: [0.2, 0.75, 4.4], target: [0, 0.95, 0], fov: 36, sx: 0.22, sy: 0 },
};

export function getPov(name, layout) {
  const p = wide[name] ?? wide.home;
  if (layout === 'wide') return p;
  // Tall: center horizontally, lift the fire into the top of the screen, widen.
  return {
    ...p,
    fov: p.fov + 16,
    sx: 0,
    sy: 0.27,
  };
}

export const POV_NAMES = Object.keys(wide);
