// NEWT, the invitation toy's character: his glb dressed for the retro look, his clips on one
// mixer, his face and his look-at, in the Character shape types.js gives main.js.
//
//   loadCharacter(url, opts)       GLTFLoader, then createCharacter
//   createCharacter(gltf, opts)    any {scene, animations} (the tests pass a stand-in skeleton
//                                  and synthetic clips): scaled by SCALE; toon materials (the
//                                  map kept, a nearest gradient map with the preset's bands)
//                                  marking his surface id for the retro pass's lines; his
//                                  meshes cast shadows, never receive them, never get culled
//
// Clips: every clip in the glb plays all the time on one AnimationMixer, at the weight
// setWeights gives it (blend.js works the weights out: three's fades aren't used). Walk and
// Run follow the shared step phase (time = phase × length, their own clocks stopped); Idle and
// the rest run on the clock. A one-shot holds its last frame once it ends, until restart().
// A glb without clips (the placeholder) or without some of them just has nothing to play.
//
// The look goes on top of the animation (types.js's frame order): update() puts back the
// head's saved animation pose before mixer.update and saves the new one after, because three's
// PropertyMixer skips writing a channel whose value didn't change (a clamped one-shot's, a held
// pose's): without the restore a look applied over it would add up frame after frame.
// applyLook(yaw, pitch, w) turns his head by yaw (toward his +x, his left) and pitch (up), in
// his root's frame, 30% at Neck and 70% at Neck001, exactly as asked whatever the bones' rolls.
//
// Faces: NEWT_Face's 2×2 sheet split into one clamped texture per cell (clips.js FACES), so
// swapping material.map never bleeds into the next cell as an offset would (the face's UVs reach
// a little past the cell). While the pixel filter is on, models/newt-face.png's pixel cells
// (tools/newt-face.mjs: nearest, no mipmaps) stand in for the 1024 sheet, which mipmaps down to
// a blank face at a dozen texels.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BONES, CLIPS, FACES, SCALE } from './clips.js';
import { LOOKS, DEFAULT_LOOK } from './look.js';
import { ID, markId, toonGradient } from './retro.js';

/** The clips that follow the step phase (blend.js gaitPhase); Idle breathes on its own clock. */
const PHASED = ['Walk', 'Run'];
/** How the look splits between Neck and Neck001 (lookAt.js SPLIT says the same). */
const SPLIT = [0.3, 0.7];
/** His head's centre, from Neck001's head along the bone, and its radius (model units). */
const HEAD = { up: 1.0, r: 1.65 };
/** His body's capsule radius (model units), from between his feet to his collar. */
const BODY_R = 1.25;
/** The least a part's radius may be on screen, CSS px (22 px across: a fingertip). */
const MIN_R = 11;

/**
 * @typedef {import('./types.js').Character & {
 *   setStyle(preset: import('./look.js').LookPreset, pixel: boolean): void,
 *   weightOf(clip: string): number,
 *   timeOf(clip: string): number,
 *   face: import('./clips.js').FaceName,
 *   faceReady: Promise<void>,
 * }} PageCharacter
 */

/**
 * Load the glb at `url` and dress it.
 * @param {string} url
 * @param {Parameters<typeof createCharacter>[1]} [opts]
 */
export async function loadCharacter(url, opts = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return createCharacter(gltf, opts);
}

/**
 * @param {{scene: any, animations?: any[]}} gltf
 * @param {{preset?: import('./look.js').LookPreset, pixel?: boolean, pixelFaceUrl?: string}} [opts]
 * @returns {PageCharacter}
 */
export function createCharacter(gltf, opts = {}) {
  const root = gltf.scene;
  root.scale.setScalar(SCALE);
  let preset = opts.preset ?? LOOKS[DEFAULT_LOOK.style];
  let pixel = opts.pixel ?? true;
  let gradient = toonGradient(preset.toon);
  /** @type {Map<any, any>} the glb's materials → his toon ones */
  const made = new Map();
  const textures = new Set();
  let skeleton = null;
  let faceMaterial = null;

  const toon = (src) => {
    if (made.has(src)) return made.get(src);
    const m = markId(
      new THREE.MeshToonMaterial({
        name: src?.name ?? '',
        map: src?.map ?? null,
        color: src?.color ? src.color.clone() : new THREE.Color(1, 1, 1),
        gradientMap: gradient,
      }),
      ID.newt,
    );
    if (src?.map) textures.add(src.map);
    if (src?.name === 'NEWT_Face') faceMaterial = m;
    src?.dispose?.();
    made.set(src, m);
    return m;
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    o.receiveShadow = false;
    if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton;
    o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material);
  });

  /** A bone by its three.js name (never a mesh that shares it: the glb's "Neck"). */
  const bone = (name) => {
    const b = skeleton?.getBoneByName(name);
    if (b) return b;
    let found = null;
    root.traverse((o) => {
      if (!found && o.isBone && o.name === name) found = o;
    });
    return found;
  };
  const neck = [bone(BONES.neck), bone(BONES.head)];
  const saved = neck.map((b) => (b ? b.quaternion.clone() : new THREE.Quaternion()));

  // --- Clips.
  const mixer = new THREE.AnimationMixer(root);
  /** @type {Map<string, any>} */
  const actions = new Map();
  for (const clip of gltf.animations ?? []) {
    const action = mixer.clipAction(clip);
    if (CLIPS[clip.name] && !CLIPS[clip.name].loop) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    if (PHASED.includes(clip.name)) action.timeScale = 0;
    action.play();
    action.setEffectiveWeight(0);
    actions.set(clip.name, action);
  }

  // --- Faces.
  /** @type {Record<string, any>|null} */
  let sheetFaces = null;
  /** @type {Record<string, any>|null} */
  let pixelFaces = null;
  /** @type {import('./clips.js').FaceName} */
  let face = 'neutral';
  const showFace = () => {
    const set = pixel && pixelFaces ? pixelFaces : sheetFaces;
    if (faceMaterial && set) faceMaterial.map = set[face];
  };
  if (faceMaterial?.map?.image && typeof document !== 'undefined') {
    sheetFaces = splitSheet(faceMaterial.map.image, false);
    faceMaterial.map.image.close?.(); // (an ImageBitmap: its pixels are in the cells now)
    faceMaterial.map.dispose();
    textures.delete(faceMaterial.map);
    showFace();
  }
  const faceReady =
    faceMaterial && opts.pixelFaceUrl && typeof document !== 'undefined'
      ? new THREE.TextureLoader()
          .loadAsync(opts.pixelFaceUrl)
          .then((t) => {
            pixelFaces = splitSheet(t.image, true);
            t.dispose();
            showFace();
          })
          .catch(() => {}) // (without it the 1024 sheet stays: a softer face, still his)
      : Promise.resolve();

  // --- Scratch.
  const v = new THREE.Vector3();
  const w2 = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qRoot = new THREE.Quaternion();
  const qTotal = new THREE.Quaternion();
  const qPart = new THREE.Quaternion();
  const ident = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const SIDE = new THREE.Vector3(-1, 0, 0);

  /** A world point on screen, client px. */
  function toScreen(p, camera, rect) {
    w2.copy(p).project(camera);
    return { x: rect.left + ((w2.x + 1) / 2) * rect.width, y: rect.top + ((1 - w2.y) / 2) * rect.height };
  }
  /** A world radius `r` at world point `p`, on screen (px). */
  function screenRadius(p, r, camera, rect) {
    const a = toScreen(p, camera, rect);
    v.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(r).add(p);
    const b = toScreen(v, camera, rect);
    return Math.max(MIN_R, Math.hypot(b.x - a.x, b.y - a.y));
  }

  return {
    root,
    has: (clip) => actions.has(clip),
    clipLength: (clip) => actions.get(clip)?.getClip().duration ?? 0,
    setWeights(weights, phase) {
      const f = phase - Math.floor(phase);
      for (const [name, action] of actions) {
        action.setEffectiveWeight(weights[name] ?? 0);
        if (PHASED.includes(name)) action.time = f * action.getClip().duration;
      }
    },
    restart(clip) {
      actions.get(clip)?.reset().play();
    },
    update(dt) {
      neck.forEach((b, i) => b?.quaternion.copy(saved[i]));
      mixer.update(dt);
      neck.forEach((b, i) => b && saved[i].copy(b.quaternion));
    },
    applyLook(yaw, pitch, weight) {
      if (!weight) {
        neck.forEach((b, i) => b?.quaternion.copy(saved[i]));
        return;
      }
      // The whole turn in the world: yaw about his root's up, pitch about his root's side.
      root.getWorldQuaternion(qRoot);
      qTotal
        .setFromAxisAngle(UP, yaw)
        .multiply(qa.setFromAxisAngle(SIDE, pitch))
        .premultiply(qRoot)
        .multiply(qb.copy(qRoot).invert());
      // Each bone takes its share as a world turn: local = parent⁻¹ · turn · parent · saved.
      neck.forEach((b, i) => {
        if (!b) return;
        qPart.slerpQuaternions(ident, qTotal, SPLIT[i] * weight);
        b.parent.getWorldQuaternion(qa);
        b.quaternion.copy(qa).invert().multiply(qPart).multiply(qa).multiply(saved[i]);
      });
    },
    setFace(name) {
      if (!FACES[name]) return;
      face = name;
      showFace();
    },
    get face() {
      return face;
    },
    faceReady,
    setStyle(next, pixelOn) {
      preset = next;
      pixel = pixelOn;
      const g = toonGradient(preset.toon);
      for (const m of made.values()) m.gradientMap = g;
      gradient.dispose();
      gradient = g;
      showFace();
    },
    bonePos(name, out) {
      const b = bone(name);
      if (b) b.getWorldPosition(v);
      else root.getWorldPosition(v);
      out.x = v.x;
      out.y = v.y;
      out.z = v.z;
      return out;
    },
    screenShape(camera, rect) {
      camera.updateMatrixWorld();
      const head = bone(BONES.head);
      const footL = bone(BONES.footL);
      const footR = bone(BONES.footR);
      const collar = bone(BONES.neck);
      root.updateWorldMatrix(true, true);
      const c = head ? head.localToWorld(new THREE.Vector3(0, HEAD.up, 0)) : root.getWorldPosition(new THREE.Vector3());
      const a = new THREE.Vector3();
      if (footL && footR)
        a.copy(footL.getWorldPosition(new THREE.Vector3())).add(footR.getWorldPosition(v)).multiplyScalar(0.5);
      else root.getWorldPosition(a);
      const top = collar ? collar.getWorldPosition(new THREE.Vector3()) : c.clone();
      const at = toScreen(c, camera, rect);
      return {
        head: { x: at.x, y: at.y, r: screenRadius(c, HEAD.r * root.scale.x, camera, rect) },
        body: {
          a: toScreen(a, camera, rect),
          b: toScreen(top, camera, rect),
          r: screenRadius(a.clone().lerp(top, 0.5), BODY_R * root.scale.x, camera, rect),
        },
      };
    },
    weightOf: (clip) => actions.get(clip)?.getEffectiveWeight() ?? 0,
    timeOf: (clip) => actions.get(clip)?.time ?? 0,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.traverse((o) => o.geometry?.dispose());
      for (const m of made.values()) m.dispose();
      for (const t of textures) t.dispose();
      for (const set of [sheetFaces, pixelFaces]) for (const t of Object.values(set ?? {})) t.dispose();
      gradient.dispose();
    },
  };
}

/**
 * The face sheet's four cells as their own textures (clips.js FACES: a cell's texture offset
 * on the sheet, glTF's flipY = false, so v runs down the image). Each repeats ×2 so the face's
 * UVs (one cell's worth) span it, clamped at its edges.
 * @param {any} image  an ImageBitmap, image or canvas
 * @param {boolean} nearest  pixel cells: nearest, no mipmaps
 */
function splitSheet(image, nearest) {
  const w = Math.floor(image.width / 2);
  const h = Math.floor(image.height / 2);
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, [u, vv]] of Object.entries(FACES)) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(image, u * 2 * w, vv * 2 * h, w, h, 0, 0, w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(2, 2);
    if (nearest) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
    }
    out[name] = t;
  }
  return out;
}
