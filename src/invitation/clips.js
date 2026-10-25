// NEWT's clips: the contract between tools/newt.py (which makes them in Blender), the page's
// animation blend and the brain. Names are the glb's animation names; lengths are seconds at
// 24 fps (the glb's own are what play; test/invitationModel.test.mjs holds the two together).

/** @typedef {'neutral'|'blink'|'happy'|'surprised'|'sad'|'angry'|'shy'|'smug'} FaceName */
/** @typedef {'normal'|'slow'|'none'} BlinkMode */
/**
 * @typedef {object} ClipSpec
 * @property {boolean} loop
 * @property {number} length  seconds
 * @property {number} fadeIn  seconds to reach full weight once it's the target
 */

export const FPS = 24;
/** Model units to world units: NEWT is 6.26 model units tall, about 1.0 here. */
export const SCALE = 0.16;

/** @type {Record<string, ClipSpec>} */
export const CLIPS = {
  Idle: { loop: true, length: 48 / FPS, fadeIn: 0.25 },
  Walk: { loop: true, length: 20 / FPS, fadeIn: 0.25 },
  Run: { loop: true, length: 14 / FPS, fadeIn: 0.15 },
  Wave: { loop: false, length: 36 / FPS, fadeIn: 0.15 },
  Spook: { loop: false, length: 20 / FPS, fadeIn: 0.08 },
  Held: { loop: true, length: 36 / FPS, fadeIn: 0.12 },
  Fall: { loop: true, length: 12 / FPS, fadeIn: 0.1 },
  Land: { loop: false, length: 14 / FPS, fadeIn: 0.05 },
  SitDown: { loop: false, length: 24 / FPS, fadeIn: 0.2 },
  Sit: { loop: true, length: 72 / FPS, fadeIn: 0.15 },
  StandUp: { loop: false, length: 24 / FPS, fadeIn: 0.15 },
  // (Round 15's talking gestures for the dialogue: tools/newt.py makes them; each starts and
  // ends on the Idle pose. Talk loops: small hand moves while he speaks.)
  Talk: { loop: true, length: 48 / FPS, fadeIn: 0.25 },
  Nod: { loop: false, length: 18 / FPS, fadeIn: 0.12 },
  Shrug: { loop: false, length: 24 / FPS, fadeIn: 0.15 },
  Point: { loop: false, length: 30 / FPS, fadeIn: 0.15 },
  Think: { loop: true, length: 48 / FPS, fadeIn: 0.2 },
  Cheer: { loop: false, length: 30 / FPS, fadeIn: 0.12 },
  // (Round 16: Thrash kicks and flails while he's held, pinned by the collar like Held, from and
  // back to Held's first frame; Give Device sits him with a tablet (DeviceSit), then lies him on
  // his stomach with it (LieDown from the sitting pose, DeviceLie), and GetUp ends on Idle.)
  Thrash: { loop: false, length: 28 / FPS, fadeIn: 0.1 },
  DeviceSit: { loop: true, length: 72 / FPS, fadeIn: 0.2 },
  LieDown: { loop: false, length: 36 / FPS, fadeIn: 0.2 },
  DeviceLie: { loop: true, length: 48 / FPS, fadeIn: 0.2 },
  GetUp: { loop: false, length: 30 / FPS, fadeIn: 0.15 },
};
/**
 * Give Device's tablet (round 16): the page draws it in his hands (device.js) and tools/newt.py's
 * arm IK holds it. `size` is [width (palm to palm), height, thickness] in model units; `palm` is
 * how far along each ForeArm bone his palm is (its tip). Per clip: `centre` is where the tablet's
 * middle sits, `tilt` how many degrees its screen tips from facing straight up toward his face,
 * and `lift` how far his palms sit above its mid-plane along the screen's normal (0: held by its
 * sides; lying, the palms rest on top of its edges). The palms are at centre ± (width / 2, 0, 0)
 * + lift × normal, within 0.08 on every frame (test/invitationModel.test.mjs), so the page can
 * put the tablet at the palms' midpoint less lift × normal, its width along the palm-to-palm line.
 *
 * Coordinates are Blender armature space, as newt.py poses him: +X his left, −Y his front, +Z up,
 * the origin on the floor between his feet. In three.js (his model's own space, glTF) a point
 * (x, y, z) is (x, z, −y) and the normal (0, sin tilt, cos tilt) is (0, cos tilt, −sin tilt);
 * world units are model units × SCALE from his root.
 */
export const DEVICE = {
  size: [1.6, 1.2, 0.08],
  palm: 0.9,
  clips: {
    DeviceSit: { centre: [0, -0.85, 1.45], tilt: 12, lift: 0 },
    DeviceLie: { centre: [0, -2.15, 0.04], tilt: 0, lift: 0.3 },
  },
};
export const CLIP_NAMES = Object.keys(CLIPS);
/** The clips a dialogue box may play (the admin lists these): every clip (DIALOGUE_WAYS, brain.js talk). */
export const DIALOGUE_CLIPS = [...CLIP_NAMES];
/**
 * How a box plays the clips that don't simply play there as themselves (brain.js talk): Walk
 * and Run step in place at their own pace; Held, Thrash and Fall dangle him from an unseen
 * hand, his root lifted till his lowest sole clears the floor (Fall a short hop, then Land).
 * The rest: Sit Down and Lie Down sit or lie him down and hold it (as Sit and Device Lie do),
 * Stand Up and Get Up only get him up (on his feet, nothing), and the tablet's sit and lie hold
 * with their way down and up.
 * @type {Record<string, 'inPlace'|'dangling'>}
 */
export const DIALOGUE_WAYS = {
  Walk: 'inPlace',
  Run: 'inPlace',
  Held: 'dangling',
  Thrash: 'dangling',
  Fall: 'dangling',
};
/**
 * Whether a box's animation holds while the box is up (a loop, or a way down that stays down)
 * rather than playing once (then Talk while its line types).
 * @param {string} name
 */
export const dialogueHolds = (name) =>
  name === 'SitDown' || name === 'LieDown' || (name !== 'Fall' && Boolean(CLIPS[name]?.loop));

/** Idle, Walk and Run play as one blend by speed, on one shared step phase (blend.js). */
export const GAIT_CLIPS = ['Idle', 'Walk', 'Run'];
/**
 * World units per second at which Walk, then Run, has the whole weight: each clip's own pace
 * (STRIDE over its length: Walk 0.59 in 0.83 s, Run 1.22 in 0.58 s), so neither plays fast.
 */
export const GAIT = { walk: 0.7, run: 1.9 };
/**
 * World units covered by one cycle at timeScale 1 (measured from the clips by forward
 * kinematics; tools/newt.py's author keeps these true, the model test checks them).
 */
export const STRIDE = { Walk: 0.59, Run: 1.22 };

/** Fades that differ from the target clip's own `fadeIn`, keyed `from>to`. */
export const FADE_OVERRIDES = { 'Land>Idle': 0.3, 'Fall>Land': 0.05 };

/**
 * Seconds to fade from one clip to another.
 * @param {string|null} from
 * @param {string} to
 */
export function fadeFor(from, to) {
  return FADE_OVERRIDES[`${from}>${to}`] ?? CLIPS[to]?.fadeIn ?? 0.2;
}

/**
 * The face each clip shows, its blinking, and changes `at` seconds after the clip (or the
 * state that loops it) began. The brain picks the base face from here; faces.js adds blinks.
 * @type {Record<string, {face: FaceName, blink: BlinkMode, at?: Array<[number, FaceName]>}>}
 */
export const FACE_TRACK = {
  Idle: { face: 'neutral', blink: 'normal' },
  Walk: { face: 'neutral', blink: 'normal' },
  Run: { face: 'surprised', blink: 'none' },
  Wave: { face: 'happy', blink: 'none' },
  Spook: { face: 'surprised', blink: 'none', at: [[0.5, 'neutral']] },
  // (Hanging in defeat: sad; the brain shows surprised while he's shaken hard.)
  Held: { face: 'sad', blink: 'slow' },
  Fall: { face: 'surprised', blink: 'none' },
  Land: { face: 'surprised', blink: 'none', at: [[0.45, 'neutral']] },
  SitDown: { face: 'happy', blink: 'slow' },
  Sit: { face: 'happy', blink: 'slow' },
  StandUp: { face: 'neutral', blink: 'normal' },
  Thrash: { face: 'angry', blink: 'none' },
  DeviceSit: { face: 'happy', blink: 'slow' },
  LieDown: { face: 'happy', blink: 'slow' },
  DeviceLie: { face: 'happy', blink: 'slow' },
  GetUp: { face: 'neutral', blink: 'normal' },
};

/** Where each face sits on NEWT_Face's 2×2 sheet (texture offset, glTF's flipY = false). */
export const FACES = { neutral: [0, 0], blink: [0.5, 0], happy: [0, 0.5], surprised: [0.5, 0.5] };
/**
 * Round 15's dialogue faces, on a second 2×2 sheet laid out like the first (tools/newt-face-smooth.mjs
 * draws the smooth one from his own face; tools/newt-face.mjs the pixel ones).
 */
export const EXTRA_FACES = { sad: [0, 0], angry: [0.5, 0], shy: [0, 0.5], smug: [0.5, 0.5] };
/** Every face by name, in the order the admin lists them. */
export const FACE_NAMES = ['neutral', 'happy', 'surprised', 'sad', 'angry', 'shy', 'smug', 'blink'];

/**
 * The bones by their three.js names (GLTFLoader drops the dots Blender's names have:
 * `Neck.001` loads as `Neck001`). Look them up with `skeleton.getBoneByName`.
 */
export const BONES = {
  hips: 'Bone',
  spare: 'Bone001',
  chest: 'Chest',
  neck: 'Neck',
  head: 'Neck001',
  shoulderL: 'ShoulderL',
  bicepL: 'BicepL',
  forearmL: 'ForeArmL',
  shoulderR: 'ShoulderR',
  bicepR: 'BicepR',
  forearmR: 'ForeArmR',
  thighL: 'ThighL',
  calfL: 'CalfL',
  footL: 'FootL',
  thighR: 'ThighR',
  calfR: 'CalfR',
  footR: 'FootR',
};
/** The same 17 bones by their Blender (and glb JSON) names. */
export const BLENDER_BONES = [
  'Bone',
  'Bone.001',
  'Chest',
  'Neck',
  'Neck.001',
  'Shoulder.L',
  'Bicep.L',
  'ForeArm.L',
  'Shoulder.R',
  'Bicep.R',
  'ForeArm.R',
  'Thigh.L',
  'Calf.L',
  'Foot.L',
  'Thigh.R',
  'Calf.R',
  'Foot.R',
];
/** He's held by the collar: the head of the Neck bone. */
export const COLLAR = BONES.neck;
/** The ankle (a Foot bone's head) sits this far over the sole, in model units. */
export const ANKLE_HEIGHT = 0.417;
