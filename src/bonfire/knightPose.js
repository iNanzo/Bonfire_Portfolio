// The knight's body language, as pure functions: no scene, no DOM, no clock of its own
// (knights.js drives it and puts the result on the bones).
//
// A pose is a flat array of numbers (POSE_SIZE), so any two blend with a lerp:
//   root         where the hips are, as an offset from their rest place (knight space, m)
//   hips…head    each joint's turn (yaw), nod (pitch) and tilt (roll), in degrees' radians
//   arms         where each hand is, seen from its shoulder in the chest's frame: yaw (0
//                forward, + out to that side), pitch (−90 down … +90 up) and reach (0..1 of
//                the arm's length); which way the elbow points; the wrist; the fist
//   legs         where each ankle is, as an offset from its rest place (x + out to that side,
//                y up, z forward; knight space); the foot's pitch; how far the knee turns out
// Limbs are written by side ("out" is +x for the left, −x for the right), so a pose mirrors
// by swapping its sides. solve() turns a pose into each bone's rotation with two-bone IK for
// the arms and legs: feet stay flat on the ground and meet it at any seat height, and hands
// go where they're put. The tassets follow the thighs most of the way; the pauldrons ride
// the arms like plates on straps (see "the pauldrons" below). Arm and head targets that
// mean something in the room (a hand on a knee, a look at the camera, an arm thrown up while
// seated) are written in knight space and turned into the chest's frame here, so a slumped
// chest never bends them down.
//
// On top of the base poses (standing; seated at any height, resting or watchful; sitting on
// the ground) come:
//   transitions  sitting down and standing up (~1.2 s): a lean, a push-off, a settle, the feet
//                moving in small lifted steps (they never skate)
//   idle         breathing, the head sinking slowly and lifting, glances, a shift of weight
//                now and then (the knights module never redraws shadows for these)
//   reactions    a flinch, leaning away from a stoke, lifting the feet (or a hop) as a ring
//                passes, and look(), which aims the head at a point, level, whatever the
//                chest is doing
//   gestures     Dark Souls' own: Praise the Sun, wave, bow, point, beckon, shrug, hurrah,
//                joy (a jump); 'helm', both hands to the helmet's sides (the helmet swap); and
//                'dance', the site's: up, the Default Dance for two bars, and back down (or,
//                `inPlace`, the two bars in his seat, leaning in: a phone's view has no room
//                over him). Seated, he sits up first and the arms go where they would standing.
//   moves        the dance library: pure functions of (beatPos, period, energy, seed), so
//                a dancer stays on the beat through hit-stops and tempo jumps. Every move is
//                periodic on the beat (its `cycle`, in beats) and big enough to read at a
//                hundred texels tall: weight shifts, follow-through, the head reacting.
//                Seated, the upper body of the move plays over the seat, a little sat up.
//
// The pauldrons. Each is a dome on the shoulder joint (K_Shoulder_*) over two lames on their
// own node (K_Pauldron_*); a third lame rides the upper arm. The dome and lames take a share
// of the arm's swing away from hanging (swing only: the arm's twist about itself never turns
// them), more of a raise out to the side than forward (PAULDRON); above level they lift and
// roll outward, riding up over the shoulder. Given the model's helmets (measurePlates), a
// dome or lame is never pushed further into the helmet he wears than the model sits at rest:
// a head tilted onto a shoulder, or an arm swinging the plates up against it, shoves the
// pauldron out from the neck instead (clampPlates). knights.js adds a spring on top (they
// lag and overshoot a little) and clamps again.
//
// Room for the arms. Hemmed in at a side (`room`, knights.js: a pillar at his shoulder, a
// standing stone, a lantern; 0..1 a side), every gesture and dance move keeps that arm's swing
// out to the side and back behind him within it (hem): the arm goes up or forward instead.
// knights.js then checks the solved arm against the scenery's shapes and turns it clear
// (swingArm).
//
// It lives in four modules, each on those before it only; this one hands all of it out:
//   knightRig.js       the pose layout, the rig, the plates' collision data (measureRig)
//   knightSolve.js     solving a pose: the IK, the tassets, the pauldrons (createSolver)
//   knightBody.js      writing poses, aiming the arms and head, the base poses, idle, looking,
//                      the reactions, getting up, sitting down and walking
//   knightGestures.js  the gestures and the dance moves
export {
  POSE, POSE_SIZE, newPose, BONES, PARENT, BONE_NODES, DEFAULT_REST, SEAT_DEPTH, TASSET_FOLLOW, PAULDRON, SEAT_POSES, measurePlates, measureRig, DEFAULT_RIG,
} from './knightRig.js';
export { createSolver } from './knightSolve.js';
export {
  lerpPose, mirrorPose, standingPose, seatFeet, feetAt, standBy, seatedPose, accent, idle, look, attend, flinch, shield, hop, RISE_TIME, rise, walk,
} from './knightBody.js';
export { DANCE_BPM, GESTURE_TIME, DANCE_SEATED_TIME, GESTURES, CHEERS, gesture, MOVE_INFO, MOVES, dance } from './knightGestures.js';
