// NEWT's framings reuse the show's moves; only their anchors, scale and lens change.
import { keepInClearing } from '../clearing.js';
import { playArea } from '../../invitation/area.js';
/** @typedef {{x:number,y:number,z:number}} Point */
/** @typedef {{pos:Point,target:Point,fov:number,roll:number}} Pose */
export const WANDER_BOUNDS = playArea();
const entry = (name, anchor, scale, target) => ({ name, anchor, scale, target });
export const NEWT_SHOTS = {
  clearing: entry('The Page', 'page', 0.75, [0, 0.55, 0]),
  hearth: entry('Two-Shot', 'pair', 1.3, [0, 0.85, 0]),
  low: entry('Low', 'newt', 0.55, [0, 1.05, 0]),
  above: entry('Above', 'page', 0.85, [0, 0.05, 0]),
  pillar: entry('Left Two-Shot', 'pair', 1, [-0.55, 0.8, -0.2]),
  wall: entry('Right Two-Shot', 'pair', 1, [-0.2, 0.7, -0.3]),
  blade: entry('The Letter', 'letter', 0.9, [0, 1, 0]),
  embers: entry('Petals Low', 'newt', 0.6, [0, 0.6, 0]),
  circle: entry('Circling', 'newt', 0.6, [0, 0.35, 0]),
  dutch: entry('Dutch', 'newt', 0.6, [0, 0.8, 0]),
  vertigo: entry('Vertigo', 'letter', 0.6, [0, 0.75, 0]),
  crane: entry('Crane', 'newt', 0.6, [0, 0.75, 0]),
  tele: entry('Long Lens', 'newt', 0.6, [0, 0.75, 0]),
  sweep: entry('Sweep', 'pair', 1.2, [0, 0.7, 0]),
};
export const createShotFrame = () => ({
  newt: { x: 0, y: 0.55, z: 0 },
  letter: { x: 0, y: 1.35, z: 0 },
  aspect: 16 / 9,
});
/** The caller supplies actors' world positions, never their input poses. */
export function pickLetter(letters, chest) {
  return (letters.find((l) => l.kind === 'held') ?? letters.at(-1))?.frame ?? chest;
}
/** Only the world's frame clock advances the anchors, not axes() or frameShot(). */
export function easeAnchors(state, chest, letter, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) / 0.3);
  for (const axis of ['x', 'y', 'z']) {
    state.newt[axis] += (chest[axis] - state.newt[axis]) * k;
    state.letter[axis] += (letter[axis] - state.letter[axis]) * k;
  }
}
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (p) => {
  const n = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / n, y: p.y / n, z: p.z / n };
};
/** Fit the subjects after the same clearing clamp the camera applies after its hook. */
function fitLens(o, points, aspect) {
  const pos = keepInClearing({ ...o.pos });
  const forward = unit(minus(o.target, pos));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const c = Math.cos(o.roll),
    s = Math.sin(o.roll);
  let tangent = Math.tan((o.fov * Math.PI) / 360);
  for (const p of points) {
    const d = minus(p, pos),
      depth = dot(d, forward);
    const x = dot(d, right),
      y = dot(d, up);
    tangent = Math.max(
      tangent,
      (1.15 * Math.abs(x * c + y * s)) / (Math.max(0.01, depth) * aspect),
      (1.15 * Math.abs(y * c - x * s)) / Math.max(0.01, depth),
    );
  }
  o.fov = (2 * Math.atan(tangent) * 180) / Math.PI;
}
/** @param {Pose} o @param {string} key @param {ReturnType<typeof createShotFrame>} state */
export function reframeShot(o, key, state) {
  const s = NEWT_SHOTS[key];
  if (!s) return null;
  const anchor =
    s.anchor === 'page'
      ? { x: 0, y: 0.55, z: 0 }
      : s.anchor === 'newt'
        ? state.newt
        : s.anchor === 'letter'
          ? state.letter
          : middle(state.newt, state.letter);
  for (const [i, axis] of ['x', 'y', 'z'].entries()) {
    o.pos[axis] = anchor[axis] + (o.pos[axis] - s.target[i]) * s.scale;
    o.target[axis] = anchor[axis] + (o.target[axis] - s.target[i]) * s.scale;
  }
  const points = [];
  if (s.anchor !== 'letter') for (const dy of [-0.55, 0.45]) points.push({ ...state.newt, y: state.newt.y + dy });
  if (s.anchor !== 'newt')
    for (const dx of [-0.55, 0.55])
      for (const dy of [-0.38, 0.38])
        points.push({ x: state.letter.x + dx, y: state.letter.y + dy, z: state.letter.z });
  fitLens(o, points, state.aspect);
  return { ...anchor };
}
