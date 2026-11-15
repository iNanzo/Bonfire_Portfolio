// Renderer-free letter picture, extracted from envelopeScene.js. DOM/input stay there.
import * as THREE from 'three';
import { DISSOLVE, particleAt, sealBloom, shedParticles, turnRoll } from './envelope.js';
import { buildSeal, sealOnScreen } from './envelopeSeal.js';
import {
  BAYER,
  DEPTH,
  IDS,
  LEAN,
  PAPER,
  PAPER_LIT,
  PITCH,
  TILT,
  WAX,
  envelopeLayout,
  rgb,
  shared,
  toon,
} from './envelopeLook.js';
const DIST = 6;
/** Specks the letter sheds as it dissolves. */
const SPECKS = 220;
/** The specks' colours: paper (gold and charred), embers (hot and glowing), wax. */
const SPECK_TONES = {
  paper: [0xe4b85d, 0xd3983d, 0x7a4a24, 0x5a3418],
  ember: [0xffe7a0, 0xf59a32, 0xe8662a],
  wax: [WAX[1], WAX[2]],
};

/**
 * A flat polygon as a mesh (a fan from its first point; its points counter-clockwise), at depth
 * `z`.
 * @param {number[][]} pts  [x, y]
 * @param {THREE.Material} mat
 * @param {number} z
 */
function piece(pts, mat, z) {
  const v = pts.map(([x, y]) => new THREE.Vector3(x, y, z));
  const tris = [];
  for (let i = 1; i < v.length - 1; i++) tris.push(v[0], v[i], v[i + 1]);
  return new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tris), mat);
}

/**
 * The envelope's parts (envelopeLook.js envelopeLayout), built to a width of 2 (the group scales
 * it to the screen), each a flat piece a little in front of the last: the body, the inside of the
 * pocket where the flap opens, the pocket in one piece (a little way in front of the inside, so
 * petals pouring from inside it hide behind it until they rise out of its mouth), and the flap
 * hinged on the top edge. Each is one flat tone of the paper's three (LEAN).
 * @param {ReturnType<typeof shared>} u
 */
function buildEnvelope(u) {
  const L = envelopeLayout();
  const { W, H, T } = L;
  const h = H / 2;
  const group = new THREE.Group();
  const paper = (/** @type {keyof typeof LEAN} */ part) =>
    toon(PAPER, u, IDS[part], { lean: LEAN[part], lit: PAPER_LIT });
  group.add(piece(L.parts.body, paper('body'), T / 2));
  group.add(piece(L.parts.inside, paper('inside'), T / 2 + DEPTH.inside));
  group.add(piece(L.parts.pocket, paper('pocket'), T / 2 + DEPTH.pocket));
  // The flap, hinged on the top edge (its points from the hinge).
  const hinge = new THREE.Group();
  hinge.position.set(0, h, T / 2 + 0.1);
  hinge.add(
    piece(
      L.parts.flap.map(([x, y]) => [x, y - h]),
      paper('flap'),
      0,
    ),
  );
  group.add(hinge);
  return { group, hinge, W, H, T, tipY: L.tip[1], seal: L.seal };
}

/**
 * The specks as square points `size` texels across, each shown through a dither as it fades.
 * They're on layer 1, drawn after the letter is put together, with no line round them.
 */
function buildSpecks() {
  const specks = shedParticles(SPECKS);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SPECKS * 3);
  const col = new Float32Array(SPECKS * 3);
  const size = new Float32Array(SPECKS);
  const alpha = new Float32Array(SPECKS);
  specks.forEach((s, i) => {
    const tones = SPECK_TONES[s.kind];
    const c = rgb(tones[(i * 7) % tones.length]);
    col.set([c.x, c.y, c.z], i * 3);
    size[i] = s.size;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAlpha > 0.0 ? aSize : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      ${BAYER}
      void main() {
        if (bayer(gl_FragCoord.xy) >= vAlpha) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.layers.set(1);
  return { points, specks, pos, alpha, geo };
}

/** size supplies the current pass texels; no renderer or DOM is needed. */
export function createEnvelopeActor({ size = () => ({ tw: 1, th: 1 }), uniforms = shared() } = {}) {
  const u = uniforms;
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.z = TILT;
  inner.rotation.x = PITCH;
  outer.add(inner);

  const envl = buildEnvelope(u);
  inner.add(envl.group);
  const sealR = envl.seal.r;
  const seal = buildSeal(u, sealR);
  // (On the flap's tip.)
  // (On the flap's tip, a hair over it, so it moves with the flap as one: no parallax, and its
  // middle rounds to the screen's texels with the tip.)
  seal.group.position.set(envl.seal.x, envl.seal.y - envl.H / 2, 0.01);
  envl.hinge.add(seal.group);
  const specks = buildSpecks();
  outer.add(specks.points);
  seal.group.visible = false;
  const v = new THREE.Vector3();
  /** The letter's own units (−1…1 across and up its body), from the world. */
  const toLetter = new THREE.Matrix4();
  const letterScale = new THREE.Matrix4().makeScale(2 / envl.W, 2 / envl.H, 1);

  let sealAt = null;
  function placeSeal(camera) {
    const view = typeof size === 'function' ? size() : size;
    const at = sealOnScreen(seal.group, camera, sealR, view.tw ?? view.w, view.th ?? view.h);
    if (!seal.place(at.x, at.y, at.axes)) {
      sealAt = null;
      return false;
    }
    sealAt = { x: at.x, y: at.y, axes: at.axes };
    return true;
  }
  /**
   * The specks the letter sheds, `since` seconds into the fade: each where the edge reached it
   * (on the paper, in front of it), drifting from there.
   * @param {number} since
   */
  function specksAt(since) {
    specks.points.visible = since > 0;
    if (!(since > 0)) return;
    for (let i = 0; i < SPECKS; i++) {
      const s = specks.specks[i];
      const at = particleAt(s, since);
      specks.alpha[i] = at.alpha;
      if (!at.alpha) continue;
      v.set((s.x * envl.W) / 2, (s.y * envl.H) / 2, envl.T / 2 + 0.12).applyMatrix4(inner.matrix);
      specks.pos.set([v.x + at.x * envl.W, v.y + at.y * envl.W, v.z + at.z * envl.W], i * 3);
    }
    specks.geo.attributes.position.needsUpdate = true;
    specks.geo.attributes.aAlpha.needsUpdate = true;
  }

  return {
    toLetter,
    sealR,
    outer,
    inner,
    envl,
    seal,
    specks,
    uniforms: u,
    get sealAt() {
      return sealAt;
    },
    pose(p, { view, follow = { y: 0, lift: 0 }, turn = 0, reduced = false, lift, camera }) {
      sealAt = null;
      // The envelope.
      const pxToWorld = view.h / view.cssH;
      // (Settling in as it arrives: from a touch above, a touch small.)
      const arrive = (1 - p.arrive) * view.h * 0.04;
      // (Hovered, it lifts a little toward the camera in time with the pulse: envelope.js hoverLook.)
      outer.position.set(
        0,
        p.bob - follow.y * pxToWorld - p.drop * view.h * 0.9 + arrive,
        p.push * 0.6 + lift.toward * DIST,
      );
      outer.rotation.set(0, p.yaw + turn, -0.5 * p.drop + turnRoll(turn));
      outer.scale.setScalar(view.scale * (1 + 0.025 * p.pulse) * (0.94 + 0.06 * p.arrive) * lift.scale);
      envl.hinge.rotation.x = -p.flap;
      // The seal: whole, starting to open as a finger drags it up, then blooming into petals,
      // shrinking away to nothing before the flap moves. It leans, turns and narrows with the
      // letter, its face drawn for that (its stamp upright on the screen).
      const bloom = sealBloom(Math.max(p.bloom, (follow.lift / 0.45) * 0.14));
      seal.group.scale.setScalar(bloom.scale);
      seal.group.rotation.z = bloom.spin;
      outer.updateMatrixWorld(true);
      seal.group.visible = bloom.scale > 0 && !!placeSeal(camera);
      // The dissolve: the edge across the letter, in its own units.
      u.uToInner.value.copy(inner.matrixWorld).invert();
      toLetter.copy(u.uToInner.value).premultiply(letterScale);
      u.uToLetter.value.copy(toLetter);
      u.uEdge.value = DISSOLVE.edge(p.dissolve);
      u.uDissolve.value = p.dissolve;
      specksAt(p.since);
    },
  };
}
