// A binary glTF (.glb) decoded in Node for the tests: its node tree and each mesh's
// positions and triangles. Meshes may be Draco-compressed (three.js' own asm.js decoder runs
// here without a Worker) or plain accessors.
//
//   const glb = await loadGlb(new URL('../../public/models/bonfire.glb', import.meta.url));
//   glb.nodes.get('Static_Pillar')   { name, translation, rotation, scale, parent, children, mesh }
//   glb.primitives(meshIndex)        [{ pos: Float32Array, idx: Uint32Array, material }] (its own space)
//   glb.matrix('Static_Pillar')      its world matrix (a THREE.Matrix4: the node and its parents)
//   glb.worldPoints('Static_Pillar') its vertices in the world, [[x, y, z], …]
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';

const DECODER = new URL('../../node_modules/three/examples/jsm/libs/draco/draco_decoder.js', import.meta.url);

let draco = null;
/** The decoder module (Emscripten's; `require` and a script dir handed in, as Node would). */
async function decoder() {
  if (draco) return draco;
  const src = fs.readFileSync(DECODER, 'utf8');
  const require = createRequire(import.meta.url);
  const make = new Function(
    'module',
    'exports',
    'require',
    '__dirname',
    '__filename',
    `${src};return DracoDecoderModule;`,
  );
  draco = await make(undefined, undefined, require, '.', 'draco_decoder.js')({});
  return draco;
}

const loaded = new Map();
/** Decode a .glb (a file URL or path) once. */
export async function loadGlb(file) {
  const key = String(file);
  if (loaded.has(key)) return loaded.get(key);
  const M = await decoder();
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const bin = buf.subarray(20 + jsonLen + 8);
  const dec = new M.Decoder();
  /** @type {Map<string, { name: string, translation: number[], rotation: number[], scale: number[], parent: string | null, children: string[], mesh?: number }>} */
  const nodes = new Map();
  gltf.nodes.forEach((n) =>
    nodes.set(n.name, {
      name: n.name,
      translation: n.translation ?? [0, 0, 0],
      rotation: n.rotation ?? [0, 0, 0, 1],
      scale: n.scale ?? [1, 1, 1],
      parent: null,
      children: (n.children ?? []).map((c) => gltf.nodes[c].name),
      mesh: n.mesh,
    }),
  );
  for (const n of nodes.values()) for (const c of n.children) nodes.get(c).parent = n.name;
  /** A plain accessor's values. */
  const read = (a) => {
    const acc = gltf.accessors[a];
    const view = gltf.bufferViews[acc.bufferView];
    const n = acc.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] ?? 1);
    const at = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[acc.componentType];
    return new Type(bin.buffer.slice(bin.byteOffset + at, bin.byteOffset + at + n * Type.BYTES_PER_ELEMENT));
  };
  const cache = new Map();
  /** A mesh's primitives, decoded: [{ pos: Float32Array, idx: Uint32Array, material }]. */
  function primitives(meshIndex) {
    if (cache.has(meshIndex)) return cache.get(meshIndex);
    const out = [];
    for (const prim of gltf.meshes[meshIndex].primitives) {
      const material = gltf.materials?.[prim.material]?.name ?? '';
      const ext = prim.extensions?.KHR_draco_mesh_compression;
      if (!ext) {
        const pos = Float32Array.from(read(prim.attributes.POSITION));
        const idx =
          prim.indices != null
            ? Uint32Array.from(read(prim.indices))
            : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        out.push({ pos, idx, material });
        continue;
      }
      const view = gltf.bufferViews[ext.bufferView];
      const data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const db = new M.DecoderBuffer();
      db.Init(new Int8Array(data.buffer, data.byteOffset, data.byteLength), data.byteLength);
      const g = new M.Mesh();
      if (!dec.DecodeBufferToMesh(db, g).ok()) throw new Error(`Draco decode failed: mesh ${meshIndex}`);
      const att = dec.GetAttributeByUniqueId(g, ext.attributes.POSITION);
      const n = g.num_points();
      const arr = new M.DracoFloat32Array();
      dec.GetAttributeFloatForAllPoints(g, att, arr);
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) pos[i] = arr.GetValue(i);
      const faces = g.num_faces();
      const tri = new M.DracoInt32Array();
      const idx = new Uint32Array(faces * 3);
      for (let f = 0; f < faces; f++) {
        dec.GetFaceFromMesh(g, f, tri);
        idx[f * 3] = tri.GetValue(0);
        idx[f * 3 + 1] = tri.GetValue(1);
        idx[f * 3 + 2] = tri.GetValue(2);
      }
      M.destroy(tri);
      M.destroy(arr);
      M.destroy(g);
      M.destroy(db);
      out.push({ pos, idx, material });
    }
    cache.set(meshIndex, out);
    return out;
  }
  /** A node's world matrix (its own and its parents' translation, rotation and scale). */
  function matrix(name) {
    const m = new THREE.Matrix4();
    for (let n = nodes.get(name); n; n = n.parent ? nodes.get(n.parent) : null) {
      const own = new THREE.Matrix4().compose(
        new THREE.Vector3(...n.translation),
        new THREE.Quaternion(...n.rotation),
        new THREE.Vector3(...n.scale),
      );
      m.premultiply(own);
    }
    return m;
  }
  const glb = {
    gltf,
    nodes,
    primitives,
    matrix,
    /** A node's mesh's vertices in the world ([] for a node without one). */
    worldPoints(name) {
      const n = nodes.get(name);
      if (n?.mesh == null) return [];
      const m = matrix(name);
      const v = new THREE.Vector3();
      const out = [];
      for (const { pos } of primitives(n.mesh))
        for (let i = 0; i < pos.length; i += 3)
          out.push(
            v
              .set(pos[i], pos[i + 1], pos[i + 2])
              .applyMatrix4(m)
              .toArray(),
          );
      return out;
    },
  };
  loaded.set(key, glb);
  return glb;
}
