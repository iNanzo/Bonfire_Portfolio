// The rose petals drawn (petals.js moves them), for the envelope's scene and the page's petal
// layer (petalLayer.js) alike: an instanced mesh a shape in its own toon material (the three
// reds, flat-shaded a facet, its band edges dithered on the texel grid, each petal's aShade
// stepping its band lighter or darker; never dissolved), drawn either in its colours or as its
// shape's id so the scene can ink the borders between them; createPetalScene wraps a petals.js
// flow in the scene's world units (one letter width = `unit`) and writes the petals up into their
// meshes each step. buildInk is the pass that puts a petals-only drawing together with a
// one-texel line in the toy's ink round every petal and where two shapes overlap (the envelope
// inks its petals in its own pass, with the letter).
import * as THREE from 'three';
import { BAYER, INK, LIGHT, PETAL, SHADES, rgb } from './envelopeLook.js';
import { PETAL_SHAPES, POOL, createPetalFlow, petalGrid } from './petals.js';

/**
 * @typedef {object} PetalUniforms  uniforms a petal shares with the scene it's in
 * @property {{value: number}} uIdPass  1 while the scene draws ids, 0 for colours
 * @property {{value: THREE.Vector3}} uLight  the light, view space (a unit vector)
 */

/**
 * A petal shape's toon material, its id `id` (1…255) in the id pass.
 * @param {number} id
 * @param {Partial<PetalUniforms>} [shared]
 */
export function petalMaterial(id, shared = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uIdPass: shared.uIdPass ?? { value: 0 },
      uLight: shared.uLight ?? { value: new THREE.Vector3(...LIGHT) },
      uTones: { value: PETAL.map(rgb) },
      uId: { value: id },
    },
    vertexShader: /* glsl */ `
      attribute float aShade;
      varying float vShade;
      varying vec3 vView;
      void main() {
        vShade = aShade;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vec4 mv = modelViewMatrix * p;
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTones[3];
      uniform vec3 uLight;
      uniform float uIdPass;
      uniform float uId;
      varying float vShade;
      varying vec3 vView;
      ${BAYER}
      void main() {
        if (uIdPass > 0.5) {
          gl_FragColor = vec4(uId / 255.0, 0.0, 0.0, 1.0);
          return;
        }
        vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
        float v = dot(n, uLight) + (bayer(gl_FragCoord.xy) - 0.5) * 0.06;
        float band = v > ${SHADES.light.toFixed(4)} ? 0.0 : v > ${SHADES.mid.toFixed(4)} ? 1.0 : 2.0;
        band = clamp(band + vShade, 0.0, 2.0);
        gl_FragColor = vec4(band < 0.5 ? uTones[0] : band < 1.5 ? uTones[1] : uTones[2], 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

/**
 * The petals' meshes: one instanced mesh a shape (petals.js petalGrid), POOL instances each, ids
 * `id` and the two after it.
 * @param {number} id
 * @param {Partial<PetalUniforms>} [shared]
 */
function buildPetals(id, shared) {
  return PETAL_SHAPES.map((shape, i) => {
    const grid = petalGrid(shape);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3));
    geo.setIndex(grid.index);
    const shade = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
    geo.setAttribute('aShade', shade);
    const mesh = new THREE.InstancedMesh(geo, petalMaterial(id + i, shared), POOL);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return { mesh, shade };
  });
}

/**
 * @typedef {object} PetalSceneOpts
 * @property {THREE.Scene|THREE.Group} scene  where the meshes go
 * @property {number} [unit]  world units a letter width (petals.js's unit; `unit` can change)
 * @property {number} [seed]
 * @property {boolean} [reduced]  reduced motion (or Rose Petals off): no petals at all
 * @property {Partial<PetalUniforms>} [uniforms]  the scene's own (the envelope's id pass)
 * @property {number} [id]  the first shape's id (the others follow)
 */

/**
 * The petals in a scene: a petals.js flow, in its world units.
 * @param {PetalSceneOpts} o
 */
export function createPetalScene({ scene, unit = 1, seed = 16, reduced = false, uniforms = {}, id = 1 }) {
  const flow = createPetalFlow({ seed, reduced });
  const meshes = buildPetals(id, uniforms);
  for (const m of meshes) scene.add(m.mesh);
  let L = unit;
  const tmp = new THREE.Object3D();
  const col = new THREE.Vector3();
  /**
   * A world point (or velocity) in letter widths.
   * @param {{x: number, y: number, z: number}} w
   */
  const units = (w) => ({ x: w.x / L, y: w.y / L, z: w.z / L });
  /**
   * Column `i` of `m`, a unit vector.
   * @param {THREE.Matrix4} m
   * @param {number} i
   */
  const axis = (m, i) => {
    col.setFromMatrixColumn(m, i).normalize();
    return { x: col.x, y: col.y, z: col.z };
  };

  /** Each petal up into its shape's mesh. */
  function draw() {
    const counts = meshes.map(() => 0);
    for (const { petal, pose } of flow.at()) {
      const k = PETAL_SHAPES.indexOf(petal.shape);
      const n = counts[k]++;
      tmp.position.set(pose.x * L, pose.y * L, pose.z * L);
      tmp.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
      tmp.scale.setScalar(pose.scale * L);
      tmp.updateMatrix();
      meshes[k].mesh.setMatrixAt(n, tmp.matrix);
      meshes[k].shade.setX(n, petal.shade);
    }
    meshes.forEach((m, k) => {
      m.mesh.count = counts[k];
      m.mesh.instanceMatrix.needsUpdate = true;
      m.shade.needsUpdate = true;
    });
  }

  return {
    flow,
    /** World units a letter width. */
    get unit() {
      return L;
    },
    set unit(u) {
      L = u > 0 ? u : L;
    },
    /**
     * Launch a flow (petals.js emit) at a world point; `v` a world velocity, a second.
     * @param {import('./petals.js').FlowKind} kind
     * @param {{x: number, y: number, z: number}} at
     * @param {{radius?: number, v?: {x: number, y: number, z: number}, n?: number}} [o]  radius
     *   in world units (bloom)
     */
    emit(kind, at, o = {}) {
      return flow.emit(kind, units(at), {
        ...o,
        ...(o.radius !== undefined ? { radius: o.radius / L } : {}),
        ...(o.v ? { v: units(o.v) } : {}),
      });
    },
    /**
     * The letter now (petals.js letter), from its world matrix (its local x across, y up, z out
     * of its face, its middle at the origin), each frame before `step`; null once it's gone.
     * @param {THREE.Matrix4|null} matrix
     * @param {{h: number, opening: number, floating: boolean}} [o]  its height, letter widths;
     *   how far its flap has lifted (0…1); whether it floats
     */
    letter(matrix, o = { h: 1, opening: 0, floating: false }) {
      if (!matrix) {
        flow.letter(null);
        return;
      }
      col.setFromMatrixPosition(matrix);
      flow.letter({
        c: units(col),
        right: axis(matrix, 0),
        up: axis(matrix, 1),
        fwd: axis(matrix, 2),
        h: o.h,
        opening: o.opening,
        floating: o.floating,
      });
    },
    /**
     * On `dt` seconds, and the petals written into their meshes.
     * @param {number} dt
     */
    step(dt) {
      flow.step(dt);
      draw();
    },
    /** @param {number} [within] */
    cut(within) {
      flow.cut(within);
    },
    /** How many are up now. */
    live() {
      return flow.live();
    },
    /** How many each flow has launched. */
    get emitted() {
      return flow.emitted;
    },
    dispose() {
      for (const m of meshes) {
        m.mesh.removeFromParent();
        m.mesh.geometry.dispose();
        /** @type {THREE.Material} */ (m.mesh.material).dispose();
        m.mesh.dispose();
      }
    },
  };
}

/**
 * The pass that puts a petals-only drawing together: its colours, and a line in the ink on each
 * texel that borders a part in front of it (a later id), so round every petal and where two shapes
 * overlap; clear elsewhere.
 */
export function buildInk() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: null },
      uId: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uInk: { value: rgb(INK) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uColor;
      uniform sampler2D uId;
      uniform vec2 uTexel;
      uniform vec3 uInk;
      varying vec2 vUv;
      float idAt(vec2 o) { return floor(texture2D(uId, vUv + o * uTexel).r * 255.0 + 0.5); }
      void main() {
        float me = idAt(vec2(0.0));
        float near = max(max(idAt(vec2(1.0, 0.0)), idAt(vec2(-1.0, 0.0))), max(idAt(vec2(0.0, 1.0)), idAt(vec2(0.0, -1.0))));
        // (Round the silhouette the corners count too, so the line closes up.)
        if (me < 0.5) near = max(near, max(max(idAt(vec2(1.0, 1.0)), idAt(vec2(-1.0, 1.0))), max(idAt(vec2(1.0, -1.0)), idAt(vec2(-1.0, -1.0)))));
        if (near > me + 0.5) { gl_FragColor = vec4(uInk, 1.0); return; }
        gl_FragColor = me < 0.5 ? vec4(0.0) : vec4(texture2D(uColor, vUv).rgb, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return {
    scene,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    /**
     * The drawing to put together, and its size in texels.
     * @param {THREE.Texture} color
     * @param {THREE.Texture} id
     * @param {number} tw
     * @param {number} th
     */
    set(color, id, tw, th) {
      mat.uniforms.uColor.value = color;
      mat.uniforms.uId.value = id;
      mat.uniforms.uTexel.value.set(1 / tw, 1 / th);
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
