// A binary glTF (.glb) read in Node for the animation tests: the JSON and BIN chunks, any
// plain accessor decoded (FLOAT, the signed and unsigned 8/16-bit and 32-bit integers,
// normalized or not, interleaved by byteStride), the animations by name with each channel's
// key times and values and the name of the node it drives, and a small forward-kinematics
// helper that poses the node tree from its TRS (test/lib/glb.mjs reads meshes, not these).
//
//   const glb = readGlbAnim(new URL('../../public/models/newt.glb', import.meta.url));
//   glb.accessor(i)                  Float32Array (normalized ints as 0..1 / -1..1) or the int array
//   glb.animations.get('Walk')       { name, duration, channels: [{ node, path, times, values, size, interpolation }] }
//   glb.poseAt(anim, t)              Map node name -> { translation, rotation, scale } at t seconds
//   glb.world(pose)                  (name) => its world THREE.Matrix4 under that pose (rest where unposed)
//   glb.worldPos(pose, name)         [x, y, z] of a node's origin (a bone's head) in the world
//   skinnedMesh(glb, node)           a skinned mesh's triangles and its vertices posed by the skin
//   pointTriangleDistance(p, a, b, c) the closest a point comes to a triangle
//   nearestDistance(p, shells)       the closest a point comes to some posed meshes
import fs from 'node:fs';
import * as THREE from 'three';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const TYPES = {
  5120: [Int8Array, 'getInt8', 127],
  5121: [Uint8Array, 'getUint8', 255],
  5122: [Int16Array, 'getInt16', 32767],
  5123: [Uint16Array, 'getUint16', 65535],
  5125: [Uint32Array, 'getUint32', 4294967295],
  5126: [Float32Array, 'getFloat32', 0],
};

/** Split a .glb into its JSON and BIN chunks. */
export function readChunks(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'glTF') throw new Error(`${file}: not a binary glTF`);
  let at = 12;
  let json = null;
  let bin = null;
  while (at < buf.length) {
    const len = buf.readUInt32LE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'JSON') json = JSON.parse(body.toString('utf8'));
    else if (type === 'BIN\0') bin = body;
    at += 8 + len;
  }
  return { json, bin, bytes: buf.length };
}

/** A .glb with its accessors, animations and a forward-kinematics helper. */
export function readGlbAnim(file) {
  const { json: gltf, bin, bytes } = readChunks(file);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

  /** Accessor `i` decoded; normalized integers come back as floats. */
  function accessor(i) {
    const acc = gltf.accessors[i];
    const n = COMPONENTS[acc.type];
    const [Type, get, max] = TYPES[acc.componentType];
    const size = Type.BYTES_PER_ELEMENT;
    const count = acc.count * n;
    const out = acc.normalized ? new Float32Array(count) : new Type(count);
    if (acc.bufferView == null) return out; // all zeros (sparse isn't used by Blender's exporter)
    const bv = gltf.bufferViews[acc.bufferView];
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = bv.byteStride ?? n * size;
    for (let e = 0; e < acc.count; e++)
      for (let c = 0; c < n; c++) {
        const v = view[get](base + e * stride + c * size, true);
        out[e * n + c] = acc.normalized ? Math.max(v / max, -1) : v;
      }
    return out;
  }

  const names = gltf.nodes.map((n) => n.name);
  const parent = new Map();
  gltf.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const index = new Map(names.map((n, i) => [n, i]));

  /** The rest TRS of node `i` (a matrix node is decomposed). */
  function restOf(i) {
    const n = gltf.nodes[i];
    if (n.matrix) {
      const t = new THREE.Vector3();
      const r = new THREE.Quaternion();
      const s = new THREE.Vector3();
      new THREE.Matrix4().fromArray(n.matrix).decompose(t, r, s);
      return { translation: t.toArray(), rotation: r.toArray(), scale: s.toArray() };
    }
    return {
      translation: n.translation ?? [0, 0, 0],
      rotation: n.rotation ?? [0, 0, 0, 1],
      scale: n.scale ?? [1, 1, 1],
    };
  }
  const rest = new Map(names.map((n, i) => [n, restOf(i)]));

  const SIZE = { translation: 3, rotation: 4, scale: 3, weights: 1 };
  /** @type {Map<string, {name: string, duration: number, channels: Array<{node: string, path: string, times: Float32Array, values: Float32Array, size: number, interpolation: string}>}>} */
  const animations = new Map();
  for (const a of gltf.animations ?? []) {
    const channels = a.channels.map((ch) => {
      const s = a.samplers[ch.sampler];
      return {
        node: names[ch.target.node],
        path: ch.target.path,
        times: Float32Array.from(accessor(s.input)),
        values: Float32Array.from(accessor(s.output)),
        size: SIZE[ch.target.path],
        interpolation: s.interpolation ?? 'LINEAR',
      };
    });
    const duration = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
    animations.set(a.name, { name: a.name, duration, channels });
  }

  /** A channel's value at t (clamped; slerp for rotations; a cubic spline's key values, linearly). */
  function sample(ch, t) {
    const { times, values, size } = ch;
    const cubic = ch.interpolation === 'CUBICSPLINE';
    const key = (k) => {
      const at = cubic ? (k * 3 + 1) * size : k * size;
      return Array.from(values.subarray(at, at + size));
    };
    const last = times.length - 1;
    if (t <= times[0]) return key(0);
    if (t >= times[last]) return key(last);
    let k = 0;
    while (times[k + 1] < t) k++;
    if (ch.interpolation === 'STEP') return key(k);
    const f = (t - times[k]) / (times[k + 1] - times[k]);
    const a = key(k);
    const b = key(k + 1);
    if (ch.path === 'rotation') return new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), f).toArray();
    return a.map((v, j) => v + (b[j] - v) * f);
  }

  /** Every animated node's TRS at t seconds. */
  function poseAt(anim, t) {
    const pose = new Map();
    for (const ch of anim.channels) {
      if (ch.path === 'weights') continue;
      const own = pose.get(ch.node) ?? { ...rest.get(ch.node) };
      own[ch.path] = sample(ch, t);
      pose.set(ch.node, own);
    }
    return pose;
  }

  /** A lookup of world matrices under `pose` (nodes it leaves out keep their rest TRS). */
  function world(pose = new Map()) {
    const cache = new Map();
    const of = (i) => {
      if (cache.has(i)) return cache.get(i);
      const trs = pose.get(names[i]) ?? rest.get(names[i]);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(...trs.translation),
        new THREE.Quaternion(...trs.rotation),
        new THREE.Vector3(...trs.scale),
      );
      if (parent.has(i)) m.premultiply(of(parent.get(i)));
      cache.set(i, m);
      return m;
    };
    return (name) => {
      if (!index.has(name)) throw new Error(`no node ${name}`);
      return of(index.get(name));
    };
  }

  return {
    gltf,
    bin,
    bytes,
    accessor,
    names,
    rest,
    animations,
    sample,
    poseAt,
    world,
    worldPos: (pose, name) => new THREE.Vector3().setFromMatrixPosition(world(pose)(name)).toArray(),
  };
}

/** The angle between two quaternions, in radians (sign-blind). */
export function quatAngle(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

/** The distance between two quaternions, sign-blind: min(|a − b|, |a + b|). */
export function quatDistance(a, b) {
  let minus = 0;
  let plus = 0;
  for (let i = 0; i < 4; i++) {
    minus += (a[i] - b[i]) ** 2;
    plus += (a[i] + b[i]) ** 2;
  }
  return Math.sqrt(Math.min(minus, plus));
}

/**
 * How far one cycle of an in-place gait would carry him: the mean backward speed of a planted
 * foot (an ankle within `contact` of the lowest ankle height in the clip, not moving forward)
 * times the cycle's length, in model units. Forward is glTF +Z (Blender's −Y). Only a foot lying
 * flat counts: one rocking onto its heel or peeling off over its toe lifts its ankle, and its
 * ankle then moves slower than the sole that stays put. Flight phases don't count either, so a
 * run's stride is what keeps its planted feet from sliding.
 */
export function footStride(glb, anim, { feet = ['Foot.L', 'Foot.R'], contact = 0.02, rate = 240 } = {}) {
  const n = Math.round(anim.duration * rate);
  const track = feet.map(() => []);
  for (let k = 0; k <= n; k++) {
    const pose = glb.poseAt(anim, (k / n) * anim.duration);
    feet.forEach((f, i) => track[i].push(glb.worldPos(pose, f)));
  }
  const low = Math.min(...track.flatMap((t) => t.map((p) => p[1])));
  let travel = 0;
  let time = 0;
  for (const t of track)
    for (let k = 0; k < n; k++)
      if (t[k][1] < low + contact && t[k + 1][1] < low + contact && t[k][2] - t[k + 1][2] > -1e-5) {
        travel += t[k][2] - t[k + 1][2];
        time += anim.duration / n;
      }
  return time > 0 ? (travel / time) * anim.duration : 0;
}

/**
 * A skinned mesh node's triangles (vertex indices, every primitive's in one list), each
 * vertex's weight on some joints, and `at(pose)`: its vertices as the skin poses them, world
 * space (glTF's linear blend skinning: joint world matrix times inverse bind matrix).
 * @param {ReturnType<typeof readGlbAnim>} glb
 * @param {string} node  the mesh node's name
 */
export function skinnedMesh(glb, node) {
  const { gltf } = glb;
  const n = gltf.nodes.find((x) => x.name === node);
  if (!n || n.mesh == null || n.skin == null) throw new Error(`${node} is not a skinned mesh`);
  const skin = gltf.skins[n.skin];
  const joints = skin.joints.map((j) => gltf.nodes[j].name);
  const ibm = glb.accessor(skin.inverseBindMatrices);
  const inverseBind = joints.map((_, j) => new THREE.Matrix4().fromArray(ibm, j * 16));
  const pos = [];
  const jnt = [];
  const wts = [];
  const tris = [];
  for (const p of gltf.meshes[n.mesh].primitives) {
    const base = pos.length / 3;
    const P = glb.accessor(p.attributes.POSITION);
    pos.push(...P);
    jnt.push(...glb.accessor(p.attributes.JOINTS_0));
    wts.push(...glb.accessor(p.attributes.WEIGHTS_0));
    const idx = p.indices != null ? glb.accessor(p.indices) : Array.from({ length: P.length / 3 }, (_, i) => i);
    for (let i = 0; i < idx.length; i += 3) tris.push([base + idx[i], base + idx[i + 1], base + idx[i + 2]]);
  }
  const count = pos.length / 3;
  /** The weight vertex `v` gives the named joints. */
  const weightOn = (v, names) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (names.includes(joints[jnt[v * 4 + k]])) w += wts[v * 4 + k];
    return w;
  };
  /** Every vertex posed: [x, y, z] each. */
  const at = (pose) => {
    const w = glb.world(pose);
    const skinMats = joints.map((name, j) => w(name).clone().multiply(inverseBind[j]));
    const v = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < count; i++) {
      const sum = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const weight = wts[i * 4 + k];
        if (!weight) continue;
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(skinMats[jnt[i * 4 + k]]);
        sum[0] += v.x * weight;
        sum[1] += v.y * weight;
        sum[2] += v.z * weight;
      }
      out.push(sum);
    }
    return out;
  };
  return { count, tris, weightOn, at };
}

const tri = new THREE.Triangle();
const query = new THREE.Vector3();
const closest = new THREE.Vector3();
/** The closest point `p` comes to triangle abc (each [x, y, z]). */
export function pointTriangleDistance(p, a, b, c) {
  tri.a.set(a[0], a[1], a[2]);
  tri.b.set(b[0], b[1], b[2]);
  tri.c.set(c[0], c[1], c[2]);
  query.set(p[0], p[1], p[2]);
  return tri.closestPointToPoint(query, closest).distanceTo(query);
}

/**
 * The closest point `p` comes to any of `shells` (each { v: posed vertices, tris }), skipping a
 * shell whose bounding box is already further than the closest so far.
 * @param {number[]} p
 * @param {Array<{v: number[][], tris: number[][], box?: {min: number[], max: number[]}}>} shells
 */
export function nearestDistance(p, shells) {
  let d = Infinity;
  for (const s of shells) {
    if (!s.box) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const v of s.v)
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], v[i]);
          max[i] = Math.max(max[i], v[i]);
        }
      s.box = { min, max };
    }
    const out = [0, 1, 2].map((i) => Math.max(s.box.min[i] - p[i], 0, p[i] - s.box.max[i]));
    if (Math.hypot(...out) >= d) continue;
    for (const [a, b, c] of s.tris) {
      // (a degenerate triangle, as Body has, measures NaN: `<` skips it where Math.min wouldn't)
      const x = pointTriangleDistance(p, s.v[a], s.v[b], s.v[c]);
      if (x < d) d = x;
    }
  }
  return d;
}
