// NEWT, the invitation toy's character: his glb dressed for the retro look, his clips on one
// mixer, his face and his look-at, in the Character shape types.js gives main.js.
//
//   loadCharacter(url, opts)       GLTFLoader and the two pixel images at once (the images never
//                                  wait for the glb), then createCharacter once the glb is in and
//                                  the images too (or TEXTURE_GRACE s more), so the first frame
//                                  already wears them; the dialogue faces' two sheets as well,
//                                  never waited for
//   createCharacter(gltf, opts)    any {scene, animations} (the tests pass a stand-in skeleton
//                                  and synthetic clips): scaled by SCALE; toon materials (the
//                                  map kept, a nearest gradient map with the preset's toon
//                                  ramp, shader.js toonRamp, rewritten in place by setStyle)
//                                  marking his surface id for the retro pass's lines; his
//                                  meshes cast shadows, never receive them, never get culled
//
// Clips: every clip in the glb plays all the time on one AnimationMixer, at the weight
// setWeights gives it (blend.js works the weights out: three's fades aren't used). Walk and
// Run follow the shared step phase (time = phase × length, their own clocks stopped); Idle and
// the rest run on the clock. A one-shot holds its last frame once it ends, until restart().
// Restarting a clip that still shows (a second Wave mid-wave) plays it from its start while
// the old one carries on as its twin, `Wave~` (play.js TWIN: a second action on the same
// keys), which play.js's mix fades out: the pose never pops. A glb without clips (the
// placeholder) or without some of them just has nothing to play.
//
// The look goes on top of the animation (types.js's frame order): update() puts back the
// chest's, neck's and head's saved animation pose before mixer.update and saves the new one
// after, because three's PropertyMixer skips writing a channel whose value didn't change (a
// clamped one-shot's, a held pose's): without the restore a look applied over it would add up
// frame after frame. applyLook(yaw, pitch, w, torso) turns his head by yaw (toward his +x, his
// left) and pitch (up), in his root's frame, exactly as asked whatever the bones' rolls: his
// Chest takes lookAt.js chestShare of a big look (times torso: main.js eases it out while he's
// off the floor, so his collar stays under the cursor), and Neck and Neck001 the rest, 30/70.
//
// The limp layer (limp(dt, on): main.js runs it after update and before the carry hangs him
// by the collar): while he's carried, and through the fall, his 12 arm and leg bones (LIMBS,
// parents first; never his chest, neck or head, which the look rebuilds) each swing a point
// mass at the limb's end (carry.js limbStep): sprung back to the clip's pose, pushed by gravity
// against the clip's upright pose and by the joint's acceleration, each in its cone, the bone
// aimed at it as a world turn (local = parent⁻¹ · turn · parent · local). update() restores
// these bones' saved animation pose before mixer.update too, so it never adds up. limp(0) does
// nothing (a frame Motion Choppy didn't step); off, it eases out over carry.js LIMP.ease.
//
// What he wears (accessories(dt, t): main.js runs it after the look): his earrings, a flat
// black stud on each earlobe (EARLOBES, measured from the glb's head mesh) with a thin black
// line and a Latin cross hanging from it (EARRING), on his head bone, toon and marked as his so
// they get his outlines, each swinging on the limp layer's spring about straight down, pushed
// by the stud's acceleration; and Give Device's tablet (device.js) at his palms while DeviceSit
// and DeviceLie weigh enough, its game moving on.
//
// Two Shader options say which of his own textures show under the pixel filter. Pixel Face (the
// preset's `texture.pixelFace`, on in every style): on, the pixel face sheets below; off, the
// glb's smooth sheet at every resolution, sampled sharper than three picks, the more the fewer
// texels it has, down to its own pixels at 32×32 and coarser (faceSharpen), so his eyes and mouth
// stay. Pixel Shirt (`texture.pixelShirt`, off in every style): on, the pixel atlas below at the
// coarser resolutions; off, the glb's own plaid at every resolution, at the preset's
// `texture.fineMipBias`, so its checks don't blur grey (under about 100 texels tall they're
// smaller than a texel, and any sample of them dithers to a mottled mix at a few colour levels,
// coarser mips no less).
//
// Faces: NEWT_Face's 2×2 sheet split into one clamped texture per cell (clips.js FACES), so
// swapping material.map never bleeds into the next cell as an offset would (the face's UVs reach
// a little past the cell). While the pixel filter is on, a pixel sheet from models/newt-face.png
// (tools/newt-face.mjs: one 2×2 sheet a cell size, faceSheets.js; nearest, no mipmaps) stands
// in for the 1024 sheet, which mipmaps down to a blank face at a dozen texels: the one whose
// cell is as many pixels as his half face covers texels, measured as his meshes are drawn
// (the camera, the target's texels, his face's span: faceSheets.js faceSpan) and held through
// small changes (pickFaceSize), so a 2-pixel eye stays 2 texels as he moves. Past the largest
// pixel sheet (zoomed in at the finest resolutions) the 1024 sheet shows again, as at Off, its
// mips as three picks them (his face takes none of the preset's mipBias: markId's `bias`). A
// size is picked by his texels whether the filter is on or not (faceSize); faceSheet says which
// sheet really shows ('smooth' at Off, whatever was picked).
//
// setFace takes any of clips.js FACE_NAMES. The dialogue's four (EXTRA_FACES: sad, angry, shy,
// smug) come from sheets of their own beside the glb (extraFaceUrls: the smooth 1024 one,
// tools/newt-face-smooth.mjs, and the pixel one laid out like newt-face.png, tools/newt-face.mjs),
// split the same way and shown by the same rules: the pixel cell at the size picked for his half
// face (so a face change never changes the sheet's size, and the hold that keeps it from
// flickering is the same for all eight), the smooth cell where his face is smooth. Until a sheet
// has come, or where an older cached one hasn't the size showing, the nearest of the first four
// stands in (faceSheets.js FACE_FALLBACK, in the same pixels or smooth sheet as the rest);
// faceShown says which face really shows.
//
// The texel snap (pixel filter on): as each of his meshes is drawn, the shift that puts his
// head's centre on a texel's centre is worked out (retro.js snapShift) and the materials of
// what rides on his head (face, hair, cap: onHead) move by it (markId's snap), so his head
// draws the same texels while it drifts within one, and steps a whole texel once it's clearly
// in the next, like a sprite's (held a quarter texel past the edge, so his breathing never
// steps it back and forth); the rest of him moves the same way by his feet, which stay put
// while he stands (snapped by his head, they bobbed a texel with each breath on a desktop).
//
// The pixel atlas (pixel filter on): models/newt-atlas-pixel.png beside the glb
// (tools/newt-atlas.mjs: his atlas in flat colours, the plaid redrawn in big black-and-white
// checks), nearest and no mipmaps, on his atlas material while he's under ORIGINAL_ATLAS_TEXELS
// tall in the default view (setResolution: main.js passes his texels at the Pixel Size's own
// grid, so neither the zoom nor the frame-time governor changes his shirt); from
// there, and at Off, the glb's own atlas, whose real plaid has enough texels to resolve. Under
// the pixel filter his atlas materials sample it the preset's `texture.mipBias` mip levels
// coarser (atlasBias: a fallback glb atlas at a low resolution would alias into a patchwork),
// `texture.fineMipBias` from ORIGINAL_ATLAS_TEXELS (less, or the checks blur into grey); none at Off.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BONES, CLIPS, DEVICE, EXTRA_FACES, FACES, SCALE } from './clips.js';
import { LIMP, limbStep, restLimb } from './carry.js';
import { PALM, createTablet, deviceFrame, deviceLift, deviceShown, deviceTilt } from './device.js';
import { FACE_FALLBACK, FACE_LAYOUT, faceSpan, layoutFor, pickFaceSize } from './faceSheets.js';
import { LOOKS, DEFAULT_LOOK } from './look.js';
import { SPLIT, chestShare } from './lookAt.js';
import { TWIN } from './play.js';
import { ID, markId, setToonGradient, snapShift, toonGradient } from './retro.js';
import { toonRamp } from './shader.js';

/** The clips that follow the step phase (blend.js gaitPhase); Idle breathes on its own clock. */
const PHASED = ['Walk', 'Run'];
/** His head's centre, from Neck001's head along the bone, and its radius (model units). */
const HEAD = { up: 1.0, r: 1.65 };
/** His body's capsule radius (model units), from between his feet to his collar. */
const BODY_R = 1.25;
/** A skinned mesh rides on his head when this share of its vertices are mostly on the head bone. */
const HEAD_SHARE = 0.6;
/** The least a part's radius may be on screen, CSS px (22 px across: a fingertip). */
const MIN_R = 11;

/**
 * @typedef {import('./types.js').Character & {
 *   setStyle(preset: import('./look.js').LookPreset, pixel: boolean): void,
 *   setResolution(texelsTall: number): void,
 *   atlas: 'pixel'|'original',
 *   weightOf(clip: string): number,
 *   timeOf(clip: string): number,
 *   face: import('./clips.js').FaceName,
 *   faceShown: import('./clips.js').FaceName,
 *   faceReady: Promise<void>,
 *   atlasReady: Promise<void>,
 *   faceSize: number|'smooth'|null,
 *   faceSheet: number|'smooth'|null,
 *   faceTexels: number,
 *   texelSnap: {head: {x: number, y: number}, body: {x: number, y: number}},
 *   pointOn(name: string, along: number, out: import('./types.js').XYZ): import('./types.js').XYZ,
 *   limp(dt: number, on: boolean): void,
 *   limpWeight: number,
 *   limpAngles(): Record<string, number>,
 *   accessories(dt: number, t: number): void,
 *   earrings: Array<{side: 'L'|'R', group: any, stud: any, pivot: any, line: any, cross: any[]}>,
 *   tablet: any,
 * }} PageCharacter
 */

/**
 * The pixel atlas's address: models/newt-atlas-pixel.png beside the glb at `url`.
 * @param {string} url
 */
export const pixelAtlasUrl = (url) => url.replace(/[^/?#]*([?#].*)?$/, 'newt-atlas-pixel.png');

/**
 * The dialogue faces' sheets' addresses, beside the glb at `url`: the smooth 1024 sheet and the
 * pixel sheets.
 * @param {string} url
 */
export const extraFaceUrls = (url) => ({
  smooth: url.replace(/[^/?#]*([?#].*)?$/, 'newt-face-smooth-extra.png'),
  pixel: url.replace(/[^/?#]*([?#].*)?$/, 'newt-face-extra.png'),
});

/**
 * NEWT's height in texels in the default view from which his shirt shows the glb's own plaid
 * rather than the pixel atlas's bold checks (which read at low resolutions but look crude once
 * there are texels enough for the real plaid's checks to resolve).
 */
export const ORIGINAL_ATLAS_TEXELS = 128;

/**
 * Pixel Face off, under the pixel filter: the smooth face sheet is sampled this many mip
 * levels sharper than three picks, so his eyes and mouth stay at the coarser resolutions (three's
 * own mip blurs a dozen-texel face into skin); from FACE_CRISP face texels down, sharper still
 * (faceSharpen).
 */
export const FACE_SHARPEN = -1.5;
/** His half face in texels from which down the smooth sheet is sampled sharper than FACE_SHARPEN. */
export const FACE_CRISP = 18;
/**
 * …and from which down it's sampled at its own pixels (mip 0): at 32×32 (7 face texels) and
 * coarser, any mip averages his grey iris and black pupil with the white and skin round them
 * into an olive smudge, so his eyes are gone; its own pixels keep their dark.
 */
export const FACE_POINT = 8;
/** A cell of the glb's 1024 face sheet, pixels (his half face across one). */
export const FACE_CELL = 512;

/**
 * The mip bias the smooth face sheet takes with Pixel Face off, under the pixel filter,
 * for his half face `texels` across a sheet cell `cell` px wide: FACE_SHARPEN from FACE_CRISP up,
 * mip 0 (its own pixels) from FACE_POINT down, the mip level eased between (three picks about
 * log2(cell / texels)).
 * @param {number} texels
 * @param {number} [cell]
 */
export function faceSharpen(texels, cell = FACE_CELL) {
  if (!(texels > 0)) return FACE_SHARPEN;
  const picked = Math.log2(cell / texels);
  const k = Math.min(1, Math.max(0, (FACE_CRISP - texels) / (FACE_CRISP - FACE_POINT)));
  return Math.min(FACE_SHARPEN, (picked + FACE_SHARPEN) * (1 - k) - picked);
}

/** Seconds the first frame waits for the pixel images once the glb is in (then they come in late). */
export const TEXTURE_GRACE = 3;

/**
 * Whether a preset shows his pixel face (Pixel Face: on unless it says false) and his shirt's
 * bold pixel plaid (Pixel Shirt: off unless it says true), the pixel filter on.
 * @param {any} preset  a LookPreset
 */
export const pixelParts = (preset) => ({
  face: preset?.texture?.pixelFace !== false,
  shirt: Boolean(preset?.texture?.pixelShirt),
});

/**
 * A texture from `url`, or null when it fails (or there's no url).
 * @param {string|undefined} url
 * @returns {Promise<any>}
 */
const loadTexture = (url) => (url ? new THREE.TextureLoader().loadAsync(url).catch(() => null) : Promise.resolve(null));

/**
 * Load the glb at `url` and dress it: the pixel atlas (from beside it, unless opts name one) and
 * the pixel face are asked for at the same time as the glb, not after it (on a slow phone the
 * first frames showed the glb's blurred atlas and a blank face, then swapped), and, while the
 * look shows one (the pixel filter on, and Pixel Face for the face, Pixel Shirt for the atlas),
 * it's dressed once that one's in too, or TEXTURE_GRACE s after the glb (a slower one goes on
 * when it comes); one the look doesn't show never holds him up, and goes on him whenever it
 * comes, ready for its switch. The dialogue faces' sheets (from beside the glb, unless opts name
 * them) are asked for too and never waited for: until they come their faces show the nearest of
 * the first four.
 * @param {string} url
 * @param {{preset?: import('./look.js').LookPreset, pixel?: boolean, pixelFaceUrl?: string, pixelAtlasUrl?: string, extraFaceUrl?: string, pixelExtraFaceUrl?: string}} [opts]
 */
export async function loadCharacter(
  url,
  {
    pixelAtlasUrl: atlasUrl = pixelAtlasUrl(url),
    pixelFaceUrl,
    extraFaceUrl = extraFaceUrls(url).smooth,
    pixelExtraFaceUrl = extraFaceUrls(url).pixel,
    ...rest
  } = {},
) {
  const atlas = loadTexture(atlasUrl);
  const face = loadTexture(pixelFaceUrl);
  const opts = { ...rest, extraFace: loadTexture(extraFaceUrl), pixelExtraFace: loadTexture(pixelExtraFaceUrl) };
  const gltf = await new GLTFLoader().loadAsync(url);
  const parts = pixelParts(opts.preset ?? LOOKS[DEFAULT_LOOK.style]);
  if (opts.pixel === false || !(parts.face || parts.shirt))
    return createCharacter(gltf, { ...opts, pixelAtlas: atlas, pixelFace: face });
  /** @type {Promise<null>} */
  const grace = new Promise((done) => setTimeout(() => done(null), TEXTURE_GRACE * 1000));
  // (A texture in time goes on before the first frame; a late one, as its promise settles, and so
  // does one the look doesn't show, never waited for.)
  const late = Symbol('late');
  /** @param {Promise<any>} p @param {boolean} shown */
  const wait = (p, shown) => (shown ? Promise.race([p, grace.then(() => late)]) : Promise.resolve(late));
  const [a, f] = await Promise.all([wait(atlas, parts.shirt), wait(face, parts.face)]);
  return createCharacter(gltf, { ...opts, pixelAtlas: a === late ? atlas : a, pixelFace: f === late ? face : f });
}

const DEG = Math.PI / 180;
/**
 * The limp layer's bones, parents first (the arms from his chest, the legs from his hips), each
 * with what its limb reaches to (the next bone's joint, or how far along it its end is, model
 * units: a palm, his toes) and its cone (a shoulder's short bone only a little).
 */
export const LIMBS = [
  { bone: BONES.shoulderL, tip: BONES.bicepL, cone: 15 * DEG },
  { bone: BONES.bicepL, tip: BONES.forearmL, cone: LIMP.cone },
  { bone: BONES.forearmL, reach: DEVICE.palm, cone: LIMP.cone },
  { bone: BONES.shoulderR, tip: BONES.bicepR, cone: 15 * DEG },
  { bone: BONES.bicepR, tip: BONES.forearmR, cone: LIMP.cone },
  { bone: BONES.forearmR, reach: DEVICE.palm, cone: LIMP.cone },
  { bone: BONES.thighL, tip: BONES.calfL, cone: LIMP.cone },
  { bone: BONES.calfL, tip: BONES.footL, cone: LIMP.cone },
  { bone: BONES.footL, reach: 0.7, cone: LIMP.cone },
  { bone: BONES.thighR, tip: BONES.calfR, cone: LIMP.cone },
  { bone: BONES.calfR, tip: BONES.footR, cone: LIMP.cone },
  { bone: BONES.footR, reach: 0.7, cone: LIMP.cone },
];
/**
 * Where each earring's stud sits, in his head bone's space, model units: on the outside of each
 * earlobe, the lowest part of the ear that pokes out past his hair (newt.glb's Head mesh: ear
 * vertices at |x| 1.33–1.48 from y 4.36 up, z about −0.38…0.38; the head bone's head at y 3.98).
 * @type {Record<'L'|'R', [number, number, number]>}
 */
export const EARLOBES = { L: [1.42, 0.42, -0.3], R: [-1.42, 0.42, -0.3] };
/**
 * An earring, model units: the stud's width (a flat disc) and thickness; the line's length and
 * thickness; the Latin cross about 2.5 times the stud's width, its long arm below.
 */
export const EARRING = {
  stud: 0.13,
  studDepth: 0.03,
  line: 0.18,
  lineWide: 0.022,
  cross: { w: 0.325, h: 0.46, bar: 0.07, depth: 0.04, armAt: 0.12 },
};
/** An earring's swing about straight down: a pendulum about the stud (ω from its length), lightly damped. */
const EAR_SWING = {
  omega: Math.sqrt(LIMP.gravity / ((EARRING.line + EARRING.cross.h / 2) * SCALE)),
  zeta: 0.12,
  cone: 1.2,
  substep: LIMP.substep,
};
/** The earrings' black. */
const EAR_BLACK = 0x141418;

/**
 * An earring for his `side` (EARRING's sizes, at EARLOBES[side]): the stud facing out, and from
 * its foot a pivot holding the line and the cross under it (accessories swings the pivot), each
 * part made by `mesh(geometry, name)`.
 * @param {'L'|'R'} side
 * @param {(geometry: any, name: string) => any} mesh
 */
function makeEarring(side, mesh) {
  const sign = side === 'L' ? 1 : -1;
  const group = new THREE.Group();
  group.name = `Earring${side}`;
  group.position.fromArray(EARLOBES[side]);
  const disc = new THREE.CylinderGeometry(EARRING.stud / 2, EARRING.stud / 2, EARRING.studDepth, 12);
  disc.rotateZ(Math.PI / 2);
  const stud = mesh(disc, `Earring${side}Stud`);
  stud.position.x = (sign * EARRING.studDepth) / 2;
  const pivot = new THREE.Group();
  pivot.name = `Earring${side}Swing`;
  pivot.position.set(sign * EARRING.studDepth, -EARRING.stud / 2 + 0.01, 0);
  const line = mesh(new THREE.BoxGeometry(EARRING.lineWide, EARRING.line, EARRING.lineWide), `Earring${side}Line`);
  line.position.y = -EARRING.line / 2;
  const c = EARRING.cross;
  const bar = mesh(new THREE.BoxGeometry(c.bar, c.h, c.depth), `Earring${side}Cross`);
  bar.position.y = -EARRING.line - c.h / 2;
  const arm = mesh(new THREE.BoxGeometry(c.w, c.bar, c.depth), `Earring${side}CrossArm`);
  arm.position.y = -EARRING.line - c.armAt;
  pivot.add(line, bar, arm);
  group.add(stud, pivot);
  return {
    side,
    group,
    stud,
    pivot,
    line,
    cross: [bar, arm],
    /** @type {import('./carry.js').Limb|null} */
    m: null,
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    frames: 0,
  };
}

/**
 * @param {{scene: any, animations?: any[]}} gltf
 * @param {{preset?: import('./look.js').LookPreset, pixel?: boolean, pixelAtlas?: any, pixelFace?: any, extraFace?: any, pixelExtraFace?: any}} [opts]
 *   pixelAtlas: the pixel atlas and pixelFace: the pixel face sheet (models/newt-face.png),
 *   extraFace and pixelExtraFace: the dialogue faces' smooth and pixel sheets, each a texture (on
 *   him at once), a promise of one (on him when it settles; null: none) or nothing
 * @returns {PageCharacter}
 */
export function createCharacter(gltf, opts = {}) {
  const root = gltf.scene;
  root.scale.setScalar(SCALE);
  let preset = opts.preset ?? LOOKS[DEFAULT_LOOK.style];
  let pixel = opts.pixel ?? true;
  // (A new toon shading, a Shader option, only rewrites the gradient map's texels.)
  let gradient = toonGradient(toonRamp(preset.toon));
  /** @type {Map<any, Record<string, any>>} the glb's materials → his toon ones, one a part (PARTS) */
  const made = new Map();
  /** @type {any[]} every toon material of his */
  const toons = [];
  const textures = new Set();
  let skeleton = null;
  let faceMaterial = null;
  /** @type {any} the mesh his face is drawn on */
  let faceMesh = null;
  /**
   * Each part's texel snap (NDC; retro.js markId), shared by its materials, and the texel it
   * holds to: what's on his head by his head's centre, the rest of him by his feet.
   */
  const snaps = { head: { value: new THREE.Vector2() }, body: { value: new THREE.Vector2() } };
  const holds = { head: { x: Number.NaN, y: Number.NaN }, body: { x: Number.NaN, y: Number.NaN } };
  /** @type {Array<{material: any, map: any}>} his atlas materials and the glb's map on each */
  const atlased = [];
  /** @type {any} */
  let pixelAtlas = null;
  /** His height in texels in the default view (0: not measured yet). */
  let tall = 0;
  /** The mip bias his materials other than the face sample their maps at (markId's `bias`). */
  const atlasBias = { value: 0 };
  /**
   * His face's (the smooth sheet: faceSharpen's with Pixel Face off, sharper the fewer texels his
   * face has; else as three picks).
   */
  const faceBias = { value: 0 };
  /** His half face in texels as last drawn (0: not drawn yet). */
  let faceTexels = 0;
  /** A cell of the smooth face sheet, pixels (the glb's: FACE_CELL). */
  let faceCell = FACE_CELL;
  /**
   * atlasBias and faceBias for the preset, the pixel filter and his height in texels (with Pixel
   * Shirt off, the glb's plaid at fineMipBias at every height: at mipBias it blurred grey; with
   * Pixel Face off, the smooth face sharper: faceSharpen).
   */
  const setBias = () => {
    const t = /** @type {import('./look.js').LookPreset & import('./retro.js').RetroExtras} */ (preset).texture ?? {};
    const parts = pixelParts(preset);
    const fine = !parts.shirt || tall >= ORIGINAL_ATLAS_TEXELS ? (t.fineMipBias ?? t.mipBias) : t.mipBias;
    atlasBias.value = pixel ? Math.max(0, fine ?? 0) : 0;
    faceBias.value = pixel && !parts.face ? faceSharpen(faceTexels, faceCell) : 0;
  };
  setBias();
  /** @type {any[]} every mesh of his */
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    o.receiveShadow = false;
    if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton;
    meshes.push(o);
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
  const headBone = bone(BONES.head);

  /**
   * @param {any} src  a glb material
   * @param {'head'|'body'} part
   */
  const toon = (src, part) => {
    const parts = made.get(src) ?? {};
    if (parts[part]) return parts[part];
    const m = markId(
      new THREE.MeshToonMaterial({
        name: src?.name ?? '',
        map: src?.map ?? null,
        color: src?.color ? src.color.clone() : new THREE.Color(1, 1, 1),
        gradientMap: gradient,
      }),
      ID.newt,
      // (His face: no coarser mip, so the smooth sheet stays sharp where it shows: faceBias.)
      { snap: snaps[part], bias: src?.name === 'NEWT_Face' ? faceBias : atlasBias },
    );
    if (src?.map) textures.add(src.map);
    if (src?.name === 'NEWT_Face') faceMaterial = m;
    else if (src?.map) atlased.push({ material: m, map: src.map });
    parts[part] = m;
    made.set(src, parts);
    toons.push(m);
    return m;
  };
  /**
   * A toon material of his own making (not the glb's), marked and snapped as his `part`.
   * @param {{name: string, color: any}} o
   * @param {'head'|'body'} part
   */
  const toonPart = ({ name, color }, part) => {
    const m = markId(new THREE.MeshToonMaterial({ name, color, gradientMap: gradient }), ID.newt, {
      snap: snaps[part],
      bias: atlasBias,
    });
    toons.push(m);
    return m;
  };
  for (const o of meshes) {
    const part = onHead(o, headBone) ? 'head' : 'body';
    o.material = Array.isArray(o.material) ? o.material.map((m) => toon(m, part)) : toon(o.material, part);
    if (faceMaterial && !faceMesh && [o.material].flat().includes(faceMaterial)) faceMesh = o;
  }
  for (const src of made.keys()) src?.dispose?.();

  /** The bones the look turns: his chest, then his neck's two (lookAt.js SPLIT shares them). */
  const looking = [bone(BONES.chest), bone(BONES.neck), bone(BONES.head)];
  const shares = [1, SPLIT.neck, SPLIT.head];
  const saved = looking.map((b) => (b ? b.quaternion.clone() : new THREE.Quaternion()));
  /** The limp layer's bones (LIMBS), their saved animation pose, and each one's mass. */
  const limbs = LIMBS.map((l) => ({
    ...l,
    /** The limb whose end this one hangs from (-1: his chest or hips). */
    parent: LIMBS.findIndex((o) => o.tip === l.bone),
    /** Its parent's tip off upright, then its own turn on top: what its child limb hangs by. */
    tipped: new THREE.Quaternion(),
    b: bone(l.bone),
    end: l.tip ? bone(l.tip) : null,
    /** @type {import('./carry.js').Limb|null} */
    m: null,
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    frames: 0,
    angle: 0,
  }));
  const limbSaved = limbs.map((l) => (l.b ? l.b.quaternion.clone() : new THREE.Quaternion()));
  let limpWeight = 0;

  // --- What he wears: his earrings, and Give Device's tablet.
  /** @param {any} geometry @param {string} name */
  const blackMesh = (geometry, name) => {
    const m = new THREE.Mesh(geometry, toonPart({ name, color: new THREE.Color(EAR_BLACK) }, 'head'));
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    return m;
  };
  // (His head bone's own axes are turned from his model's: the glb's hips turn their children a
  // quarter round. Each earring's group takes that rest turn off, so EARLOBES and EARRING are in
  // his model's axes: +x his left, +z his front.)
  root.updateMatrixWorld(true);
  const headRest = headBone
    ? root
        .getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(headBone.getWorldQuaternion(new THREE.Quaternion()))
        .invert()
    : new THREE.Quaternion();
  const earrings = /** @type {const} */ (['L', 'R']).map((side) => {
    const e = makeEarring(side, blackMesh);
    e.group.quaternion.copy(headRest);
    e.group.position.applyQuaternion(headRest);
    headBone?.add(e.group);
    return e;
  });
  const tablet = createTablet({ snap: snaps.body, gradient, bias: atlasBias });
  root.add(tablet.group);
  toons.push(tablet.bezel.material);

  // --- Clips.
  const mixer = new THREE.AnimationMixer(root);
  /** @type {Map<string, any>} */
  const actions = new Map();
  /** @type {Map<string, any>} each restarted clip's twin: the old start, fading out */
  const twins = new Map();
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
  /** @type {any} newt-face.png, once loaded (its sheets are split as they're first shown) */
  let pixelImage = null;
  /** @type {import('./faceSheets.js').FaceSheet[]} the sheets in it */
  let pixelLayout = FACE_LAYOUT;
  /** @type {Map<number, Record<string, any>>} each shown size's cells */
  const pixelSets = new Map();
  /** @type {Record<string, any>|null} the dialogue faces' smooth cells, once their sheet is in */
  let extraFaces = null;
  /** @type {any} newt-face-extra.png, once loaded */
  let extraImage = null;
  /** @type {import('./faceSheets.js').FaceSheet[]} the sheets in it */
  let extraLayout = [];
  /** @type {Map<number, Record<string, any>>} each shown size's dialogue cells */
  const extraSets = new Map();
  /** @type {import('./clips.js').FaceName} */
  let face = 'neutral';
  /** @type {import('./clips.js').FaceName} the face really showing (FACE_FALLBACK's, until its sheet is in) */
  let faceShown = 'neutral';
  /**
   * The pixel sheet's size for his half face ('smooth': past the largest, the 1024 sheet; null
   * until he's drawn); that measure in texels is faceTexels.
   * @type {number|'smooth'|null}
   */
  let faceSize = null;
  /**
   * The sheet on his face: a pixel sheet's cell width, or 'smooth' for the glb's own 1024 sheet
   * (null: he has no face material).
   * @type {number|'smooth'|null}
   */
  let faceSheet = faceMaterial ? 'smooth' : null;
  /** His face's width across one cell at the eyes, model units (0: no face to measure). */
  const span = faceMesh ? spanOf(faceMesh.geometry) : 0;
  /**
   * The pixel sheet at `size` (the nearest the image has before he's measured).
   * @param {number|null} size
   */
  const pixelSheetAt = (size) =>
    pixelLayout.find((s) => s.w === size) ?? pixelLayout.find((s) => s.w >= 8) ?? pixelLayout[0];
  /**
   * A pixel sheet's cells, split from the image the first time it shows.
   * @param {import('./faceSheets.js').FaceSheet} sheet
   */
  const pixelFacesOf = (sheet) => {
    if (!pixelSets.has(sheet.w)) pixelSets.set(sheet.w, splitSheet(pixelImage, true, sheet));
    return pixelSets.get(sheet.w);
  };
  /** Pixel Face (a Shader option, on in every style) under the pixel filter: the pixel sheets at all. */
  const pixelFaceOn = () => pixel && pixelParts(preset).face;
  /** Pixel Shirt (a Shader option, off in every style) under the pixel filter: the bold plaid at all. */
  const pixelShirtOn = () => pixel && pixelParts(preset).shirt;
  /**
   * The dialogue faces' cells for the pixel sheet `sheet` (null: none that size in the image
   * there is, or no image yet), split the first time they show.
   * @param {import('./faceSheets.js').FaceSheet} sheet
   */
  const extraFacesOf = (sheet) => {
    const at = extraImage && extraLayout.find((s) => s.w === sheet.w && s.h === sheet.h);
    if (!at) return null;
    if (!extraSets.has(at.w)) extraSets.set(at.w, splitSheet(extraImage, true, at, EXTRA_FACES));
    return extraSets.get(at.w);
  };
  const showFace = () => {
    const sheet = pixelFaceOn() && pixelImage && faceSize !== 'smooth' ? pixelSheetAt(faceSize) : null;
    const base = sheet ? pixelFacesOf(sheet) : sheetFaces;
    const extra = face in EXTRA_FACES ? (sheet ? extraFacesOf(sheet) : extraFaces) : null;
    if (!faceMaterial || !base) return;
    faceShown = face in EXTRA_FACES && !extra ? FACE_FALLBACK[face] : face;
    faceMaterial.map = (extra ?? base)[faceShown];
    faceSheet = sheet ? sheet.w : 'smooth';
  };
  /**
   * Whether his shirt shows the pixel atlas's bold plaid (the pixel filter and Pixel Shirt on, him
   * under ORIGINAL_ATLAS_TEXELS tall).
   */
  const pixelPlaid = () => pixelShirtOn() && Boolean(pixelAtlas) && !(tall >= ORIGINAL_ATLAS_TEXELS);
  const showAtlas = () => {
    setBias();
    const bold = pixelPlaid();
    for (const { material, map } of atlased) material.map = bold ? pixelAtlas : map;
  };
  /** @param {any} t  the pixel atlas */
  const usePixelAtlas = (t) => {
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    if (atlased[0]) {
      t.wrapS = atlased[0].map.wrapS;
      t.wrapT = atlased[0].map.wrapT;
    }
    t.needsUpdate = true;
    pixelAtlas = t;
    textures.add(t);
    showAtlas();
  };
  /** A texture now, or a promise of one later (null: none). */
  const isPromise = (t) => typeof t?.then === 'function';
  if (opts.pixelAtlas && !isPromise(opts.pixelAtlas)) usePixelAtlas(opts.pixelAtlas);
  // (Without it the glb's atlas stays, its mip a little coarser.)
  const atlasReady = isPromise(opts.pixelAtlas)
    ? opts.pixelAtlas.then((t) => t && atlased.length && usePixelAtlas(t)).catch(() => {})
    : Promise.resolve();
  if (faceMaterial?.map?.image && typeof document !== 'undefined') {
    sheetFaces = splitSheet(faceMaterial.map.image, false);
    faceCell = Math.floor(faceMaterial.map.image.width / 2) || FACE_CELL;
    faceMaterial.map.image.close?.(); // (an ImageBitmap: its pixels are in the cells now)
    faceMaterial.map.dispose();
    textures.delete(faceMaterial.map);
    showFace();
  }
  /** @param {any} t  the pixel face sheet */
  const usePixelFace = (t) => {
    if (!t || !faceMaterial || !t.image) return;
    pixelImage = t.image;
    // (An older image cached: the sheets it has, layoutFor.)
    pixelLayout = layoutFor(pixelImage.width, pixelImage.height);
    t.dispose();
    showFace();
  };
  /** @param {any} t  the dialogue faces' smooth sheet */
  const useExtraFace = (t) => {
    if (!t || !faceMaterial || !t.image || typeof document === 'undefined') return;
    extraFaces = splitSheet(t.image, false, undefined, EXTRA_FACES);
    t.image.close?.();
    t.dispose();
    showFace();
  };
  /** @param {any} t  the dialogue faces' pixel sheets */
  const usePixelExtraFace = (t) => {
    if (!t || !faceMaterial || !t.image) return;
    extraImage = t.image;
    extraLayout = layoutFor(extraImage.width, extraImage.height);
    t.dispose();
    showFace();
  };
  /** A texture now (`use` it at once), or a promise of one (when it settles); never a failure. */
  const take = (t, use) => {
    if (t && !isPromise(t)) use(t);
    return isPromise(t) ? t.then(use).catch(() => {}) : Promise.resolve();
  };
  // (Without the pixel face the 1024 sheet stays: a softer face, still his. Without the dialogue
  // faces' sheets their faces show the nearest of the first four.)
  const faceReady = Promise.all([
    take(opts.pixelFace, usePixelFace),
    take(opts.extraFace, useExtraFace),
    take(opts.pixelExtraFace, usePixelExtraFace),
  ]).then(() => {});

  // --- Scratch.
  const v = new THREE.Vector3();
  const w2 = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qRoot = new THREE.Quaternion();
  const qTotal = new THREE.Quaternion();
  const qChest = new THREE.Quaternion();
  const qRest = new THREE.Quaternion();
  const qPart = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const qTurn = new THREE.Quaternion();
  const joint = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const rest = new THREE.Vector3();
  const restDir = new THREE.Vector3();
  const aimed = new THREE.Vector3();
  const force = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const gAuth = new THREE.Vector3();
  const down = new THREE.Vector3();
  const front = new THREE.Vector3();
  const across = new THREE.Vector3();
  const palmL = new THREE.Vector3();
  const palmR = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const ident = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const SIDE = new THREE.Vector3(-1, 0, 0);
  /**
   * `out` as a turn in the world: `yaw` about his root's up, then `pitch` about its side (qRoot
   * read first).
   * @param {THREE.Quaternion} out
   * @param {number} yaw
   * @param {number} pitch
   */
  const worldTurn = (out, yaw, pitch) =>
    out
      .setFromAxisAngle(UP, yaw)
      .multiply(qa.setFromAxisAngle(SIDE, pitch))
      .premultiply(qRoot)
      .multiply(qb.copy(qRoot).invert());
  const viewport = new THREE.Vector4();
  const centre = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const scale = new THREE.Vector3();

  /**
   * As each of his meshes is drawn (onBeforeRender: the camera and the target it's drawn into
   * are the frame's): the texel snaps (his head's centre for what's on his head, his feet for
   * the rest), and the face sheet for his half face in texels at his head.
   * @param {any} renderer
   * @param {any} _scene
   * @param {any} camera
   */
  function beforeDraw(renderer, _scene, camera) {
    renderer.getCurrentViewport(viewport);
    for (const part of /** @type {const} */ (['head', 'body'])) {
      if (part === 'head' && headBone) headBone.localToWorld(centre.set(0, HEAD.up, 0));
      else root.getWorldPosition(centre);
      ndc.copy(centre).project(camera);
      if (pixel) snapShift(ndc.x, ndc.y, viewport.z, viewport.w, snaps[part].value, holds[part]);
      else snaps[part].value.set(0, 0);
    }
    if (headBone) headBone.localToWorld(centre.set(0, HEAD.up, 0));
    if (!span || !faceMesh) return;
    // Texels a world unit at his head: the projection's vertical scale over the depth there.
    const depth = camera.isOrthographicCamera ? 1 : -ndc.copy(centre).applyMatrix4(camera.matrixWorldInverse).z;
    if (!(depth > 0)) return;
    const perUnit = (camera.projectionMatrix.elements[5] * viewport.w) / 2 / depth;
    faceTexels = span * faceMesh.getWorldScale(scale).x * perUnit;
    // (The smooth sheet sharper the fewer texels his face has, with Pixel Face off: faceSharpen.)
    if (pixel && !pixelFaceOn()) faceBias.value = faceSharpen(faceTexels, faceCell);
    const sizes = pixelLayout.map((s) => s.w);
    const next = pickFaceSize(faceTexels, faceSize, sizes);
    if (next !== faceSize) {
      faceSize = next;
      showFace();
    }
  }
  for (const o of meshes) o.onBeforeRender = beforeDraw;

  /** A clip's twin by its name (`Wave~`), or undefined. */
  const twinOf = (name) => (name.endsWith(TWIN) ? twins.get(name.slice(0, -TWIN.length)) : undefined);
  /** A clip's weight in the mix (its twin's by `Wave~`). @param {string} clip */
  const weightOf = (clip) => (actions.get(clip) ?? twinOf(clip))?.getEffectiveWeight() ?? 0;

  /**
   * A point's acceleration in the world from its last two steps (none for its first two: from
   * rest), at most LIMP.accelMax, into `out`; `k` keeps its last position and velocity.
   * @param {{prev: THREE.Vector3, vel: THREE.Vector3, frames: number}} k
   * @param {THREE.Vector3} at
   * @param {number} dt
   * @param {THREE.Vector3} out
   */
  function accelOf(k, at, dt, out) {
    out.set(0, 0, 0);
    if (k.frames > 0) {
      v.copy(at).sub(k.prev).divideScalar(dt);
      if (k.frames > 1) out.copy(v).sub(k.vel).divideScalar(dt);
      k.vel.copy(v);
    }
    k.prev.copy(at);
    k.frames++;
    if (out.length() > LIMP.accelMax) out.setLength(LIMP.accelMax);
    return out;
  }

  /**
   * Give Device's tablet: shown while its clips weigh enough, at his palms (his root's space,
   * model units: device.js deviceFrame), its game moved on to `t`.
   * @param {number} t
   */
  function placeTablet(t) {
    const g = tablet.group;
    g.visible = deviceShown(weightOf);
    if (!g.visible) return;
    const l = bone(BONES.forearmL);
    const r = bone(BONES.forearmR);
    if (!l || !r) return;
    l.localToWorld(palmL.set(0, PALM, 0));
    r.localToWorld(palmR.set(0, PALM, 0));
    root.worldToLocal(palmL);
    root.worldToLocal(palmR);
    const f = deviceFrame(palmL, palmR, { x: 0, y: 0, z: 1 }, deviceTilt(weightOf), deviceLift(weightOf));
    g.position.set(f.centre.x, f.centre.y, f.centre.z);
    across.set(f.right.x, f.right.y, f.right.z);
    down.set(f.normal.x, f.normal.y, f.normal.z);
    front.crossVectors(across, down);
    basis.makeBasis(across, down, front);
    g.quaternion.setFromRotationMatrix(basis);
    g.updateMatrixWorld(true);
    tablet.update(t);
  }

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
      for (const [name, twin] of twins) twin.setEffectiveWeight(weights[`${name}${TWIN}`] ?? 0);
    },
    /**
     * Play `clip` from its start; true when it still showed, its old start now playing on as
     * its twin (whose weight setWeights reads as `clip` + TWIN).
     * @param {string} clip
     */
    restart(clip) {
      const action = actions.get(clip);
      if (!action) return false;
      if (!(action.getEffectiveWeight() > 0)) {
        action.reset().play();
        return false;
      }
      let twin = twins.get(clip);
      if (!twin) {
        const copy = action.getClip().clone();
        copy.name = `${clip}${TWIN}`;
        twin = mixer.clipAction(copy);
        twin.setLoop(action.loop, action.repetitions);
        twin.clampWhenFinished = action.clampWhenFinished;
        twin.timeScale = action.timeScale;
        twin.play();
      }
      // (The two swap: the old start keeps its clock as the twin, the twin starts afresh.)
      twins.set(clip, action);
      actions.set(clip, twin);
      twin.reset().play();
      twin.setEffectiveWeight(0);
      return true;
    },
    update(dt) {
      looking.forEach((b, i) => b?.quaternion.copy(saved[i]));
      limbs.forEach((l, i) => l.b?.quaternion.copy(limbSaved[i]));
      mixer.update(dt);
      looking.forEach((b, i) => b && saved[i].copy(b.quaternion));
      limbs.forEach((l, i) => l.b && limbSaved[i].copy(l.b.quaternion));
    },
    limp(dt, on) {
      if (!(dt > 0)) return;
      limpWeight = on ? 1 : Math.max(0, limpWeight - dt / LIMP.ease);
      if (!(limpWeight > 0)) {
        for (const l of limbs) {
          l.m = null;
          l.frames = 0;
          l.angle = 0;
        }
        return;
      }
      root.updateMatrixWorld(true);
      root.getWorldQuaternion(qRoot);
      for (const l of limbs) {
        if (!l.b) continue;
        l.b.getWorldPosition(joint);
        if (l.end) l.end.getWorldPosition(tip);
        else l.b.localToWorld(tip.set(0, l.reach ?? 0, 0));
        rest.copy(tip).sub(joint);
        accelOf(l, joint, dt, accel);
        // How far this limb's parent is tipped off the clip's upright pose (his root's swing and
        // the turns its parent limbs took): gravity as the clip has it, against gravity now.
        const up = l.parent >= 0 ? limbs[l.parent].tipped : qRoot;
        gAuth.set(0, -LIMP.gravity, 0).applyQuaternion(up);
        restDir.copy(rest).normalize();
        // Each limb alike whatever its length: hang of that tip back toward the floor, and sway
        // of the joint's acceleration over gravity, as angles once it settles.
        const k = (LIMP.omega * LIMP.omega * rest.length()) / LIMP.gravity;
        force
          .set(0, -LIMP.gravity, 0)
          .sub(gAuth)
          .multiplyScalar(LIMP.hang * k);
        force.addScaledVector(accel, -LIMP.sway * k);
        l.m ??= restLimb(rest);
        limbStep(l.m, rest, force, dt, { omega: LIMP.omega, zeta: LIMP.zeta, cone: l.cone, substep: LIMP.substep });
        aimed.set(l.m.at.x, l.m.at.y, l.m.at.z).normalize();
        qTurn.setFromUnitVectors(restDir, aimed);
        qPart.slerpQuaternions(ident, qTurn, limpWeight);
        l.angle = 2 * Math.acos(Math.min(1, Math.abs(qPart.w)));
        l.tipped.copy(qPart).multiply(up);
        l.b.parent.getWorldQuaternion(qa);
        l.b.quaternion.premultiply(qb.copy(qa).premultiply(qPart).premultiply(qc.copy(qa).invert()));
        l.b.updateMatrixWorld(true);
      }
    },
    get limpWeight() {
      return limpWeight;
    },
    limpAngles: () => Object.fromEntries(limbs.map((l) => [l.bone, l.angle])),
    accessories(dt, t) {
      root.updateMatrixWorld(true);
      if (dt > 0 && headBone) {
        for (const e of earrings) {
          e.group.getWorldQuaternion(qa);
          e.pivot.getWorldPosition(joint);
          accelOf(e, joint, dt, accel);
          const len = (EARRING.line + EARRING.cross.h / 2) * root.scale.x;
          rest.set(0, -len, 0);
          e.m ??= restLimb(rest);
          limbStep(e.m, rest, force.copy(accel).negate(), dt, EAR_SWING);
          // Its line along the swing, the cross's face to his front (square to the line).
          down.set(e.m.at.x, e.m.at.y, e.m.at.z).normalize().negate();
          front.set(0, 0, 1).applyQuaternion(qa);
          front.addScaledVector(down, -front.dot(down));
          if (front.lengthSq() < 1e-8) front.set(0, 0, 1);
          front.normalize();
          across.crossVectors(down, front);
          basis.makeBasis(across, down, front);
          qTurn.setFromRotationMatrix(basis);
          e.pivot.parent.getWorldQuaternion(qb);
          e.pivot.quaternion.copy(qb.invert().multiply(qTurn));
          e.pivot.updateMatrixWorld(true);
        }
      }
      placeTablet(t);
    },
    earrings,
    tablet: tablet.group,
    applyLook(yaw, pitch, weight, torso = 1) {
      if (!weight) {
        looking.forEach((b, i) => b?.quaternion.copy(saved[i]));
        return;
      }
      // The whole turn and the chest's in the world (yaw about his root's up, pitch about his
      // root's side), and what the chest leaves the neck: whole · chest⁻¹.
      root.getWorldQuaternion(qRoot);
      const chest = chestShare(yaw, pitch);
      const k = looking[0] ? torso : 0;
      worldTurn(qTotal, yaw, pitch);
      worldTurn(qChest, chest.yaw * k, chest.pitch * k);
      qRest.copy(qTotal).multiply(qb.copy(qChest).invert());
      // Each bone takes its share as a world turn: local = parent⁻¹ · turn · parent · saved.
      looking.forEach((b, i) => {
        if (!b) return;
        qPart.slerpQuaternions(ident, i ? qRest : qChest, shares[i] * weight);
        b.parent.getWorldQuaternion(qa);
        b.quaternion.copy(qa).invert().multiply(qPart).multiply(qa).multiply(saved[i]);
      });
    },
    setFace(name) {
      if (!FACES[name] && !EXTRA_FACES[name]) return;
      face = name;
      showFace();
    },
    get face() {
      return face;
    },
    /** The face really showing: `face`, or the nearest of the first four until its sheet is in. */
    get faceShown() {
      return faceShown;
    },
    faceReady,
    atlasReady,
    /** The face sheet size picked for his half face in texels (whether or not it shows). */
    get faceSize() {
      return faceSize;
    },
    /** The face sheet showing: a pixel sheet's cell width, or 'smooth' (Off, past the largest, no pixel image). */
    get faceSheet() {
      return faceSheet;
    },
    get faceTexels() {
      return faceTexels;
    },
    /** The atlas on his shirt: the bold pixel plaid, or the glb's own. */
    get atlas() {
      return pixelPlaid() ? 'pixel' : 'original';
    },
    setResolution(texelsTall) {
      tall = texelsTall > 0 ? texelsTall : 0;
      showAtlas();
    },
    get texelSnap() {
      return { head: snaps.head.value, body: snaps.body.value };
    },
    setStyle(next, pixelOn) {
      preset = next;
      pixel = pixelOn;
      gradient = retoon(gradient, preset.toon, toons);
      for (const part of /** @type {const} */ (['head', 'body'])) {
        if (!pixel) snaps[part].value.set(0, 0);
        holds[part].x = Number.NaN;
        holds[part].y = Number.NaN;
      }
      showFace();
      showAtlas();
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
    /**
     * A world point `along` model units down a bone (its +Y: Blender's bones point that way), as
     * posed: his palm at a ForeArm's end, his toes along a Foot.
     * @param {string} name
     * @param {number} along
     * @param {import('./types.js').XYZ} out
     */
    pointOn(name, along, out) {
      const b = bone(name);
      if (b) b.localToWorld(v.set(0, along, 0));
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
    weightOf,
    timeOf: (clip) => (actions.get(clip) ?? twinOf(clip))?.time ?? 0,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.traverse((o) => o.geometry?.dispose());
      for (const m of toons) m.dispose();
      tablet.dispose();
      for (const t of textures) t.dispose();
      for (const set of [sheetFaces, extraFaces, ...pixelSets.values(), ...extraSets.values()])
        for (const t of Object.values(set ?? {})) t.dispose();
      gradient.dispose();
    },
  };
}

/**
 * His toon shading changed: the ramp's cells written into his gradient map (the same texture
 * and program), or, for another number of cells (an older preset's own bands), a new map of
 * that size on `toons`. Returns the map they wear.
 * @param {any} gradient  retro.js toonGradient
 * @param {import('./shader.js').ToonSpec|number[]} toon
 * @param {any[]} toons  his toon materials
 */
function retoon(gradient, toon, toons) {
  const bands = toonRamp(toon);
  if (bands.length === gradient.image.width) {
    setToonGradient(gradient, bands);
    return gradient;
  }
  const g = toonGradient(bands);
  for (const m of toons) m.gradientMap = g;
  gradient.dispose();
  return g;
}

/**
 * Whether a mesh of his rides on his head: under the head bone, or skinned with most of its
 * vertices on it (his face, hair and cap; his body, hands and neck aren't).
 * @param {any} o
 * @param {any} head  the head bone
 */
function onHead(o, head) {
  if (!head) return false;
  if (!o.isSkinnedMesh) {
    for (let p = o.parent; p; p = p.parent) if (p === head) return true;
    return false;
  }
  const at = o.skeleton.bones.indexOf(head);
  const index = o.geometry.attributes.skinIndex;
  const weight = o.geometry.attributes.skinWeight;
  if (at < 0 || !index || !weight) return false;
  let n = 0;
  for (let i = 0; i < index.count; i++) {
    let k = 0;
    for (let j = 1; j < 4; j++) if (weight.getComponent(i, j) > weight.getComponent(i, k)) k = j;
    if (index.getComponent(i, k) === at) n++;
  }
  return n >= HEAD_SHARE * index.count;
}

/**
 * His face's width across one cell at the eyes (faceSheets.js faceSpan), from its geometry.
 * @param {any} geometry
 */
function spanOf(geometry) {
  const pos = geometry?.attributes?.position;
  const uv = geometry?.attributes?.uv;
  if (!pos || !uv) return 0;
  const p = [];
  const t = [];
  for (let i = 0; i < pos.count; i++) p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let i = 0; i < uv.count; i++) t.push(uv.getX(i), uv.getY(i));
  const index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  return faceSpan(p, t, index);
}

/**
 * A face sheet's four cells as their own textures (clips.js FACES, or EXTRA_FACES for the
 * dialogue's sheet: a cell's texture offset on the sheet, glTF's flipY = false, so v runs down the
 * image). Each repeats ×2 so the face's UVs (one cell's worth) span it, clamped at its edges.
 * @param {any} image  an ImageBitmap, image or canvas
 * @param {boolean} nearest  pixel cells: nearest, no mipmaps
 * @param {{w: number, h: number, x: number, y: number}} [sheet]  where the sheet is in the
 *   image (a cell w × h): the whole image by default
 * @param {Record<string, number[]>} [cells]  the faces on it, by their offsets
 */
function splitSheet(image, nearest, sheet, cells = FACES) {
  const w = sheet?.w ?? Math.floor(image.width / 2);
  const h = sheet?.h ?? Math.floor(image.height / 2);
  const x0 = sheet?.x ?? 0;
  const y0 = sheet?.y ?? 0;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, [u, vv]] of Object.entries(cells)) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(image, x0 + u * 2 * w, y0 + vv * 2 * h, w, h, 0, 0, w, h);
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
