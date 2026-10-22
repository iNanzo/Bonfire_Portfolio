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
};
/** The clips a dialogue box may play (the admin lists these): his gestures, the reactions, sitting. */
export const DIALOGUE_CLIPS = ['Idle', 'Talk', 'Nod', 'Shrug', 'Point', 'Think', 'Cheer', 'Wave', 'Spook', 'Sit'];
export const CLIP_NAMES = Object.keys(CLIPS);

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
  Held: { face: 'surprised', blink: 'slow', at: [[0.6, 'neutral']] },
  Fall: { face: 'surprised', blink: 'none' },
  Land: { face: 'surprised', blink: 'none', at: [[0.45, 'neutral']] },
  SitDown: { face: 'happy', blink: 'slow' },
  Sit: { face: 'happy', blink: 'slow' },
  StandUp: { face: 'neutral', blink: 'normal' },
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
