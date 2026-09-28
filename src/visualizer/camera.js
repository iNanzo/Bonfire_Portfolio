// The camera (the visualizer): shots around the clearing, and rigs that follow the blade
// when it leaves the fire.
//
//   shots    fixed framings, each with its own move: a sway (yaw), a slow turn (spin), a
//            push in, a tilt (roll), a crane (rising through the shot), a dolly zoom
//            (vertigo: pushing in while the lens widens, so the fire keeps its size and
//            the world stretches behind it). A held blade raises the framing to keep it
//            all in view. The close combo angles also turn to keep the blade in frame.
//   rigs     follow the blade (fire.blade: its middle, point, grip and rotation):
//              follow   swings with the point: pans after it with a lag and drifts to its
//                       side, the horizon leaning into the swing
//              ride     mounted off the blade's flat, lagging its turns: the blade holds
//                       still while the world wheels behind it
//              track    one spot, the lens following the blade and widening to fit it
//              orbit    circling the fire, looking at the blade
//              vertigo  a dolly zoom on a held blade, deeper as the build rises
//   moves    cut, whip (a fast swing to the new framing, leaning as it goes) or glide.
// Every framing stays in the clearing: above the ground, out of the fire, in front of the
// ruins.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ease = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
const easeVec = (v, target, tau, dt) => v.lerp(target, 1 - Math.exp(-dt / tau));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const FIRE = new THREE.Vector3(0.02, 0, 0.02);
const UP = new THREE.Vector3(0, 1, 0);

// Shots (the fire at the origin; the broken pillar back-left, the wall back-right).
//   yaw    sway around the target (radians either side), over 16 beats
//   spin   keep turning (radians per beat) instead
//   push   dolly in by this fraction over the shot
//   roll   a tilt (radians)
//   crane  rise by this much (m) over the shot
//   dolly  a dolly zoom: push in by this fraction while the lens widens to match
export const SHOTS = {
  clearing: { name: 'Clearing', pos: [0, 2.2, 6.1], target: [0, 0.55, 0], fov: 32, yaw: 0.3 },
  hearth: { name: 'Hearth', pos: [0.35, 1.25, 3.3], target: [0, 0.85, 0], fov: 38, yaw: 0.35, push: 0.12 },
  low: { name: 'Low', pos: [0.15, 0.5, 3.6], target: [0, 1.05, 0], fov: 46, yaw: 0.25 },
  above: { name: 'Above', pos: [0.3, 5.6, 2.3], target: [0, 0.05, 0], fov: 40, spin: 0.05 },
  pillar: { name: 'Pillar Side', pos: [-2.5, 1.35, 3.3], target: [0.15, 0.7, -0.3], fov: 34, yaw: 0.2, push: 0.1 },
  wall: { name: 'Wall Side', pos: [2.3, 1.5, 3.6], target: [-0.2, 0.7, -0.3], fov: 34, yaw: 0.2, push: 0.1 },
  blade: { name: 'Blade', pos: [0.3, 1.2, 2.2], target: [0, 1.0, 0], fov: 36, yaw: 0.45, push: 0.18 },
  embers: { name: 'Embers', pos: [0.9, 0.2, 2.5], target: [0, 0.6, 0], fov: 50, yaw: 0.3, roll: -0.08 },
  circle: { name: 'Circling', pos: [2.4, 2.6, 3.3], target: [0, 0.35, 0], fov: 36, spin: 0.035 },
  dutch: { name: 'Dutch', pos: [-0.6, 1.1, 3.0], target: [0, 0.8, 0], fov: 40, yaw: 0.2, roll: 0.14 },
  vertigo: { name: 'Vertigo', pos: [0.2, 1.05, 4.6], target: [0, 0.75, 0], fov: 22, dolly: 0.5, yaw: 0.1 },
  crane: { name: 'Crane', pos: [0.6, 0.35, 3.4], target: [0, 0.75, 0], fov: 40, crane: 2.1, yaw: 0.15 },
  tele: { name: 'Long Lens', pos: [0.5, 1.35, 5.4], target: [0, 0.75, 0], fov: 17, yaw: 0.15 },
  sweep: { name: 'Sweep', pos: [0, 1.5, 3.6], target: [0, 0.7, 0], fov: 38, yaw: 1.15 },
};
// Close angles for the blade out of the fire (high over it); not in the usual rotation.
// `track`: how far the lens turns to follow the blade.
export const COMBO_SHOTS = {
  duelLow: { name: 'Hero', pos: [0.9, 0.35, 2.4], target: [0, 1.35, 0], fov: 52, roll: -0.06, yaw: 0.15, track: 0.6 },
  duelSide: { name: 'Side', pos: [2.5, 1.3, 0.7], target: [0, 1.2, 0], fov: 44, yaw: 0.15, track: 0.6 },
  duelHigh: { name: 'Over', pos: [-1.3, 2.7, 2.1], target: [0, 1.05, 0], fov: 46, roll: 0.05, yaw: 0.15, track: 0.6 },
  duelFront: { name: 'Face', pos: [0.05, 1.3, 2.7], target: [0, 1.25, 0], fov: 48, yaw: 0.2, track: 0.6 },
  duelUnder: { name: 'Under', pos: [-0.7, 0.3, 1.9], target: [0, 1.5, 0], fov: 58, roll: 0.1, track: 0.7 },
};
export const CLOSE = ['blade', 'hearth', 'low'];
export const WIDE = ['clearing', 'above', 'circle', 'tele', 'sweep'];
/** How the camera covers the blade out of the fire. */
export const SWING_CAMS = { angles: 'Close Angles', follow: 'Follow the Blade', ride: 'Ride the Blade', track: 'Tracking', orbit: 'Orbit' };
/** ...and a blade held for the drop. */
export const HOLD_CAMS = { close: 'Close Shot', vertigo: 'Vertigo', orbit: 'Orbit' };
export const TRANSITIONS = { cut: 'Cut', whip: 'Whip Pan', glide: 'Glide' };

const newPose = () => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40, roll: 0 });
const copyPose = (from, to) => { to.pos.copy(from.pos); to.target.copy(from.target); to.fov = from.fov; to.roll = from.roll; return to; };

/** The roll that turns a camera at `pos` looking at `target` so `up` points up on screen. */
function rollFor(pos, target, up) {
  const z = pos.clone().sub(target).normalize();
  const x = UP.clone().cross(z);
  if (x.lengthSq() < 1e-6) return 0;
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return Math.atan2(-up.dot(x), up.dot(y));
}

/** Keep a camera position in the clearing: above the ground, out of the fire, in front of the ruins. */
function keepInClearing(p) {
  const dx = p.x - FIRE.x;
  const dz = p.z - FIRE.z;
  let r = Math.hypot(dx, dz);
  let a = Math.atan2(dx, dz); // 0: straight in front
  if (Math.abs(a) > 1.75) a = Math.sign(a) * 1.75;
  r = Math.min(6.5, p.y < 1.7 ? Math.max(0.9, r) : r);
  p.x = FIRE.x + Math.sin(a) * r;
  p.z = FIRE.z + Math.cos(a) * r;
  p.y = clamp(p.y, 0.25, 6.5);
  return p;
}

export function createCamera(fire, settings, { reducedMotion = false, onShot = () => {} } = {}) {
  let shot = SHOTS[settings.shot] ? settings.shot : 'clearing';
  let rig = null;       // { name, t, … } while a rig runs
  let shotT = 0;        // seconds into the current shot
  let shotLen = 8;      // how long it's expected to run (for pushes, cranes and dolly zooms)
  let driftT = 0;
  let holdEase = 0;     // 1 while a blade is held: static shots rise to keep it all in frame
  let trackEase = 0;    // 1 while the blade is out: the close angles turn to follow it
  let trans = null;     // { from, t, dur, kind, lean }
  let lastPeriod = 0.5;
  const framing = { sx: 0, sy: 0, toX: 0, toY: 0 }; // where the fire sits on screen (the start menu pushes it aside)
  const want = newPose();  // this frame's framing, before the move between shots
  const shown = newPose(); // what's on screen
  const from = newPose();
  let started = false;
  const out = { pos: [0, 0, 0], target: [0, 0, 0], fov: 32, sx: 0, sy: 0, roll: 0 };
  const fallbackBlade = { mid: new THREE.Vector3(0.02, 0.8, 0.02), tip: new THREE.Vector3(0.02, 0.2, 0.02), grip: new THREE.Vector3(0.02, 1.2, 0.02), quat: new THREE.Quaternion(), normal: new THREE.Vector3(0, 0, 1), len: 1, free: false };
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();

  function moveFor(kind) {
    if (reducedMotion || !started) return 'cut';
    const k = kind ?? settings.transition;
    if (k !== 'mix') return k;
    const r = Math.random();
    return r < 0.5 ? 'cut' : r < 0.85 ? 'whip' : 'glide';
  }
  function begin(kind) {
    const k = moveFor(kind);
    trans = k === 'cut' ? null : { from: copyPose(shown, from), t: 0, dur: k === 'whip' ? 0.24 : 0.9, kind: k, lean: (Math.random() < 0.5 ? -1 : 1) * 0.14 };
  }

  /**
   * Go to a shot (SHOTS or COMBO_SHOTS; none: another of SHOTS) or a rig (follow, ride,
   * track, orbit, vertigo). `bars`: how long it's expected to run. `move`: cut, whip or
   * glide (default: the setting).
   */
  function cut(name, { bars = settings.cutBars || 8, move } = {}) {
    begin(move);
    shotT = 0;
    shotLen = Math.max(2, bars * 4 * lastPeriod);
    driftT = Math.random() * 100;
    if (RIGS[name]) {
      rig = { name, t: 0 };
      RIGS[name].start(rig, blade());
      onShot(RIGS[name].name);
      return name;
    }
    rig = null;
    const names = Object.keys(SHOTS).filter((n) => n !== shot);
    shot = name && name !== shot && (SHOTS[name] || COMBO_SHOTS[name]) ? name : pick(names);
    onShot((SHOTS[shot] ?? COMBO_SHOTS[shot]).name);
    return shot;
  }

  const blade = () => fire.blade ?? fallbackBlade;

  // --- rigs --------------------------------------------------------------------------
  const RIGS = {
    follow: {
      name: 'Follow',
      start(st, b) {
        st.toCam = shown.pos.clone().sub(shown.target).setY(0);
        if (st.toCam.lengthSq() < 1e-4) st.toCam.set(0, 0, 1);
        st.toCam.normalize().setY(0.25).normalize();
        st.right = UP.clone().cross(st.toCam).normalize();
        st.up = new THREE.Vector3().crossVectors(st.toCam, st.right);
        st.r = 1.9 + Math.random() * 0.5;
        st.c = b.mid.clone();
        st.look = b.mid.clone();
        st.raw = 0; st.acc = 0; st.ang = 0; st.lean = 0;
      },
      pose(st, b, dt, o) {
        v.subVectors(b.tip, b.mid);
        const a = Math.atan2(v.dot(st.up), v.dot(st.right));
        const d = ((a - st.raw + Math.PI * 3) % TAU) - Math.PI;
        st.raw = a;
        st.acc += d;
        const before = st.ang;
        st.ang = ease(st.ang, st.acc, 0.14, dt);
        st.lean = ease(st.lean, clamp(-(st.ang - before) / Math.max(dt, 1e-3) * 0.012, -0.35, 0.35), 0.1, dt);
        easeVec(st.c, b.mid, 0.2, dt);
        easeVec(st.look, w.lerpVectors(b.mid, b.tip, 0.45), 0.07, dt);
        o.pos.copy(st.c).addScaledVector(st.toCam, st.r)
          .addScaledVector(st.right, Math.cos(st.ang) * 0.4 * st.r).addScaledVector(st.up, Math.sin(st.ang) * 0.4 * st.r);
        o.target.copy(st.look);
        o.fov = 46;
        o.roll = st.lean;
      },
    },
    ride: {
      name: 'Ride',
      start(st, b) {
        st.q = b.quat.clone();
        st.side = Math.sign(b.normal.dot(v.subVectors(shown.pos, b.mid))) || 1;
        st.roll = 0;
      },
      pose(st, b, dt, o) {
        st.q.slerp(b.quat, 1 - Math.exp(-dt / 0.16));
        o.pos.set(0.12, 0.3 * b.len, st.side * 1.05).applyQuaternion(st.q).add(b.mid);
        o.target.set(0, -0.25 * b.len, 0).applyQuaternion(st.q).add(b.mid);
        // The pommel stays up on screen, so the world turns instead of the blade.
        const r = clamp(rollFor(o.pos, o.target, w.set(0, 1, 0).applyQuaternion(st.q)), -1.4, 1.4);
        st.roll = ease(st.roll, r, 0.12, dt);
        o.fov = 54;
        o.roll = st.roll;
      },
    },
    track: {
      name: 'Tracking',
      start(st, b) {
        const s = COMBO_SHOTS[pick(Object.keys(COMBO_SHOTS))];
        st.pos = new THREE.Vector3(...s.pos).multiplyScalar(1.15);
        st.look = b.mid.clone();
        st.fov = 44;
      },
      pose(st, b, dt, o) {
        easeVec(st.look, w.lerpVectors(b.mid, b.tip, 0.3), 0.09, dt);
        o.pos.copy(st.pos);
        o.pos.x += Math.sin(st.t * 0.9) * 0.04; // a hand-held drift
        o.pos.y += Math.sin(st.t * 1.3 + 1) * 0.03;
        o.target.copy(st.look);
        // The lens widens to keep the whole blade in frame.
        v.subVectors(o.target, o.pos).normalize();
        let half = 0;
        for (const p of [b.tip, b.grip, b.mid]) half = Math.max(half, v.angleTo(w.subVectors(p, o.pos)));
        st.fov = ease(st.fov, clamp((half * 2 * 1.35 * 180) / Math.PI + 6, 28, 72), 0.25, dt);
        o.fov = st.fov;
        o.roll = 0;
      },
    },
    orbit: {
      name: 'Orbit',
      start(st, b) {
        st.a0 = clamp(Math.atan2(shown.pos.x - FIRE.x, shown.pos.z - FIRE.z), -0.8, 0.8);
        st.dir = Math.random() < 0.5 ? -1 : 1;
        st.look = b.mid.clone();
        st.r = 2.3 + Math.random() * 0.6;
      },
      pose(st, b, dt, o) {
        const beat = lastPeriod;
        const a = st.a0 + st.dir * 0.95 * Math.sin((TAU * st.t) / (beat * 16));
        const h = 1.2 + 0.4 * Math.sin((TAU * st.t) / (beat * 8));
        o.pos.set(FIRE.x + Math.sin(a) * st.r, h, FIRE.z + Math.cos(a) * st.r);
        easeVec(st.look, b.mid, 0.12, dt);
        o.target.copy(st.look);
        o.fov = 42;
        o.roll = 0.05 * Math.sin((TAU * st.t) / (beat * 8));
      },
    },
    vertigo: {
      name: 'Vertigo',
      start(st, b) {
        st.dir = shown.pos.clone().sub(b.mid).setY(0);
        if (st.dir.lengthSq() < 1e-4) st.dir.set(0, 0, 1);
        st.dir.normalize().setY(0.18).normalize();
        st.look = b.mid.clone();
        st.k = 0;
      },
      pose(st, b, dt, o, c) {
        st.k = ease(st.k, Math.max(c.build, Math.min(0.8, st.t / 12)), 0.5, dt);
        const d0 = 3.6;
        const d = d0 * (1 - 0.55 * st.k);
        easeVec(st.look, b.mid, 0.15, dt);
        o.pos.copy(st.look).addScaledVector(st.dir, d);
        o.target.copy(st.look);
        o.fov = (2 * Math.atan((Math.tan((32 * Math.PI) / 360) * d0) / d) * 180) / Math.PI;
        o.roll = 0;
      },
    },
  };

  // --- shots --------------------------------------------------------------------------
  function shotPose(o, dt, c) {
    const s = SHOTS[shot] ?? COMBO_SHOTS[shot] ?? SHOTS.clearing;
    const beat = lastPeriod;
    let yaw = 0;
    let k = 0;
    const moving = settings.camera !== 'still' && !reducedMotion;
    if (moving) {
      yaw = s.spin ? (shotT / beat) * s.spin : Math.sin((driftT / (beat * 16)) * TAU) * (s.yaw ?? 0.25);
      k = Math.min(1, shotT / shotLen);
      k = k * k * (3 - 2 * k);
    }
    const push = (s.push ?? 0) * k + (s.dolly ?? 0) * k;
    const [tx, ty0, tz] = s.target;
    const ty = ty0 + 0.45 * holdEase; // the held blade hangs high over the fire
    const dx = (s.pos[0] - tx) * (1 - push);
    const dy = (s.pos[1] - ty0) * (1 - push) + 0.15 * holdEase + (s.crane ?? 0) * k;
    const dz = (s.pos[2] - tz) * (1 - push);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    o.pos.set(tx + dx * cy - dz * sy, ty + dy, tz + dx * sy + dz * cy);
    o.target.set(tx, ty, tz);
    // The close angles turn to keep the blade in frame while it's out of the fire.
    if (s.track && trackEase > 0.001) o.target.lerp(blade().mid, s.track * trackEase);
    const dolly = s.dolly ? (2 * Math.atan(Math.tan((s.fov * Math.PI) / 360) / (1 - s.dolly * k)) * 180) / Math.PI : s.fov;
    o.fov = dolly + 7 * holdEase;
    o.roll = moving ? (s.roll ?? 0) + Math.sin(driftT * 0.7) * 0.02 : 0;
  }

  /** This frame's framing (no move between shots): a rig's or the shot's. */
  function frameWanted(dt, c) {
    if (rig && !reducedMotion && settings.camera !== 'still') {
      rig.t += dt;
      RIGS[rig.name].pose(rig, blade(), dt, want, c);
    } else shotPose(want, dt, c);
    keepInClearing(want.pos);
  }

  /**
   * Per frame. c: { period, punch 0..1, holding, build 0..1 }.
   */
  function update(dt, c) {
    if (c.period) lastPeriod = c.period;
    if (settings.camera !== 'still' && !reducedMotion) { driftT += dt; shotT += dt; }
    holdEase = ease(holdEase, c.holding ? 1 : 0, 0.6, dt);
    trackEase = ease(trackEase, fire.blade?.free ? 1 : 0, 0.3, dt);
    frameWanted(dt, c);
    copyPose(want, shown);
    if (trans) {
      trans.t += dt;
      const u = Math.min(1, trans.t / trans.dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      shown.pos.lerpVectors(trans.from.pos, want.pos, e);
      shown.target.lerpVectors(trans.from.target, want.target, e);
      shown.fov = trans.from.fov + (want.fov - trans.from.fov) * e;
      shown.roll = trans.from.roll + (want.roll - trans.from.roll) * e + (trans.kind === 'whip' ? trans.lean * Math.sin(Math.PI * u) : 0);
      if (u >= 1) trans = null;
    }
    started = true;
    framing.sx = ease(framing.sx, framing.toX, 0.5, dt);
    framing.sy = ease(framing.sy, framing.toY, 0.5, dt);
    shown.pos.toArray(out.pos);
    shown.target.toArray(out.target);
    // The zoom punch narrows the view for a moment on each kick.
    out.fov = shown.fov * (1 - (settings.punch && !reducedMotion ? 0.09 * c.punch : 0));
    out.roll = shown.roll;
    out.sx = framing.sx;
    out.sy = framing.sy;
    fire.setPose(out, { instant: true });
  }

  return {
    cut,
    update,
    /** The rig running, or null. */
    get rig() { return rig?.name ?? null; },
    get shot() { return rig ? rig.name : shot; },
    /**
     * Where the camera is headed (world): { right, up, toCam, pos }. The blade takes each
     * move's plane from it, so a move reads from the framing it's cut to.
     */
    axes() {
      frameWanted(0, { build: 0 });
      const toCam = want.pos.clone().sub(want.target).normalize();
      const right = UP.clone().cross(toCam);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(toCam, right);
      const r = right.clone();
      right.multiplyScalar(Math.cos(want.roll)).addScaledVector(up, Math.sin(want.roll));
      up.multiplyScalar(Math.cos(want.roll)).addScaledVector(r, -Math.sin(want.roll));
      return { right, up, toCam, pos: want.pos.clone() };
    },
    /** Where the fire sits on screen, as a fraction of the view from center (+x right, +y up). */
    frame(sx = 0, sy = 0) { framing.toX = sx; framing.toY = sy; },
    setShot(name) { if (SHOTS[name] && !rig) { shot = name; shotT = 0; } },
  };
}
