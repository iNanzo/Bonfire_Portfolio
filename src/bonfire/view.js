// The camera's framing: the site's points of view for each screen (povs.js), or poses
// of the visualizer's own, eased from one to the next; then, each frame, the camera
// placed there with a sway toward the cursor and any shake, snapped to whole texels at
// the focal distance so the image never swims between pixels.
import * as THREE from 'three';
import { getPov } from './povs.js';
import { easeInOut } from '../math.js';

const VIEW_AXIS = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const toPose = (p) => ({ pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target), fov: p.fov, sx: p.sx ?? 0, sy: p.sy ?? 0, roll: p.roll ?? 0 });
const clonePose = (p) => ({ pos: p.pos.clone(), target: p.target.clone(), fov: p.fov, sx: p.sx, sy: p.sy, roll: p.roll });

/** @param {THREE.PerspectiveCamera} camera  @param {object} o  `sway`: how far it leans toward the cursor (0: not at all) */
export function createView(camera, { reducedMotion = false, sway: swayAmount = 1 } = {}) {
  let layout = 'wide';
  const view = { name: 'home', cur: toPose(getPov('home', layout)), from: null, to: null, t: 1, dur: 1.25 };
  let shake = 0;
  const sway = { x: 0, y: 0 };
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const rollQ = new THREE.Quaternion();

  function moveTo(to, instant, duration) {
    if (instant || reducedMotion) {
      view.cur = to;
      view.t = 1;
    } else {
      view.from = clonePose(view.cur);
      view.to = to;
      view.t = 0;
      view.dur = duration;
    }
  }
  function setView(name, { instant = false } = {}) {
    view.name = name;
    moveTo(toPose(getPov(name, layout)), instant, 1.25);
  }

  return {
    setView,
    /**
     * A camera pose of your own ({ pos, target, fov, sx, sy, roll }, arrays for the
     * vectors), outside the site's per-screen points of view. It's kept through layout
     * changes. An instant pose is written in place (the visualizer sets one every frame).
     */
    setPose(p, { instant = false, duration = 1.25 } = {}) {
      view.name = null;
      if (!instant && !reducedMotion) { moveTo(toPose(p), false, duration); return; }
      const c = view.cur;
      c.pos.fromArray(p.pos);
      c.target.fromArray(p.target);
      c.fov = p.fov;
      c.sx = p.sx ?? 0;
      c.sy = p.sy ?? 0;
      c.roll = p.roll ?? 0;
      view.t = 1;
    },
    /** The camera's axes and position where it's headed (world): { right, up, toCam, pos }. */
    axes() {
      const { pos, target, roll } = view.to && view.t < 1 ? view.to : view.cur;
      const toCam = pos.clone().sub(target).normalize();
      const r = WORLD_UP.clone().cross(toCam);
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
      r.normalize();
      const u = new THREE.Vector3().crossVectors(toCam, r);
      if (roll) {
        const c = Math.cos(roll);
        const s = Math.sin(roll);
        const r0 = r.clone();
        r.multiplyScalar(c).addScaledVector(u, s);
        u.multiplyScalar(c).addScaledVector(r0, -s);
      }
      return { right: r, up: u, toCam, pos: pos.clone() };
    },
    /** 'wide' or 'tall': the site's points of view differ; the current one is re-applied. */
    set layout(next) {
      if (next === layout) return;
      layout = next;
      if (view.name) setView(view.name, { instant: true });
    },
    /** A jolt (0..~0.3 s of shaking). */
    shake(amount) { shake = Math.max(shake, amount); },
    /** Ease toward the pose it's headed for. */
    step(dt) {
      if (view.t >= 1) return;
      view.t = Math.min(1, view.t + dt / view.dur);
      const k = easeInOut(view.t);
      const { cur, from, to } = view;
      cur.pos.lerpVectors(from.pos, to.pos, k);
      cur.target.lerpVectors(from.target, to.target, k);
      cur.fov = THREE.MathUtils.lerp(from.fov, to.fov, k);
      cur.sx = THREE.MathUtils.lerp(from.sx, to.sx, k);
      cur.sy = THREE.MathUtils.lerp(from.sy, to.sy, k);
      cur.roll = THREE.MathUtils.lerp(from.roll, to.roll, k);
    },
    /**
     * Place the camera. `size`: the render target in texels ({ w, h }); `pointer.sx/sy`:
     * where the cursor is across the window (-1..1).
     */
    apply(dt, size, pointer) {
      const { pos, target, fov, sx, sy, roll } = view.cur;
      camera.fov = fov;
      camera.setViewOffset(size.w, size.h, -Math.round(sx * size.w), Math.round(sy * size.h), size.w, size.h);
      camera.updateProjectionMatrix();
      if (!reducedMotion) {
        sway.x += (pointer.sx * swayAmount - sway.x) * Math.min(1, dt * 2.5);
        sway.y += (pointer.sy * swayAmount - sway.y) * Math.min(1, dt * 2.5);
      }
      const dist = pos.distanceTo(target);
      const texel = (2 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / size.h;
      let ox = sway.x * 0.14;
      let oy = -sway.y * 0.08;
      if (shake > 0) {
        shake -= dt;
        ox += (Math.random() - 0.5) * texel * 4;
        oy += (Math.random() - 0.5) * texel * 4;
      }
      ox = Math.round(ox / texel) * texel;
      oy = Math.round(oy / texel) * texel;
      camera.position.copy(pos);
      camera.quaternion.setFromRotationMatrix(m4.lookAt(pos, target, camera.up));
      if (roll) camera.quaternion.multiply(rollQ.setFromAxisAngle(VIEW_AXIS, roll));
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, ox).addScaledVector(up, oy);
    },
  };
}
