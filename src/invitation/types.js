// The shapes the invitation toy's modules pass each other (JSDoc only: nothing runs here), and
// the order a frame runs in. Units: world units (NEWT is about 1.0 tall), seconds, CSS pixels.
// The pure modules (brain, blend, steer, carry, lookAt, faces, gesture, rng, speech) import no
// three.js.
//
// A frame (main.js):
//   1. pointer and button input → gesture events (gesture.js), floor points by ray (stage)
//   2. brain.step(BrainIn) → BrainOut: the brain owns every timer and every state change; then
//      talk.step (speech.js TalkIn: this BrainOut and the last, the gestures, the button, the
//      camera) → a line to show goes to bubble.say
//   3. steer (walk, flee, face the camera) or carry (held, falling) moves NEWT's root
//   4. blendStep moves each clip's weight toward BrainOut's; gaitPhase advances the step phase
//   5. character.update(dt): restore the head's saved animation pose → mixer.update → save it
//   6. root.updateMatrixWorld → carry's tilt on the root → read the collar → move the root by
//      anchor − collar → root.updateMatrixWorld (only while held; the anchor is where the
//      cursor's ray meets the camera-facing plane he was grabbed on, plus the grab offset)
//   7. lookStep → character.applyLook (on top of the saved pose: it never adds up)
//   8. faceStep → character.setFace; bubble.update (while a line is up): his head on screen
//      (character.screenShape; null while the open Look sheet covers it, bubble.js
//      speakerPoint), clear of the toolbar and the open sheet
//   9. stage.render: the shadow map once, the colour pass, the retro pass

/** @typedef {{x: number, z: number}} XZ */
/** @typedef {{x: number, y: number, z: number}} XYZ */
/**
 * @typedef {object} Bounds  where NEWT's root may go: the play area (area.js), whose edges are
 *   his walls. A box; or a trapezoid, its sides minX/maxX at the front (maxZ) and
 *   minXBack/maxXBack at the back (minZ), straight lines between (steer.js xRange); or, with
 *   `r`, a disc of that radius around the box's centre (the box is its square): the toy's
 *   play area, a fixed disc on the floor.
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 * @property {number} [minXBack]
 * @property {number} [maxXBack]
 * @property {number} [r]
 */

/**
 * @typedef {{id: number, x: number, y: number, t: number, kind: string, buttons: number, button?: number}} Ptr  a
 *   pointer sample, client px and seconds; `button`, on a press: the one pressed (0 main, 1 middle, 2 right)
 */
/**
 * @typedef {object} GestureEvent
 * @property {'tap'|'grab'|'drag'|'release'|'cancel'|'hover'|'orbit'|'pan'|'pinch'} type  orbit: a
 *   finger's drag on empty space or the mouse's right-drag (it turns the camera); pan: the mouse's
 *   left- or middle-drag on empty space, or two fingers' middle (it slides the view); pinch: two
 *   fingers (they zoom it)
 * @property {'newt'|'floor'} on  what the press started on ('floor' for empty space and pinches)
 * @property {number} x  client px (a pinch: its fingers' middle)
 * @property {number} y
 * @property {number} t  seconds
 * @property {XZ|null} [floor]  where it meets the floor (filled in by the page)
 * @property {number} [dx]  an orbit's or a pan's move since its last, CSS px
 * @property {number} [dy]
 * @property {number} [scale]  a pinch's spread over its last (above 1: the fingers moved apart)
 */

/** @typedef {'Wave'|'Spook'|'Sit'|'Run'|'Wander'} ButtonName */

/**
 * @typedef {object} BrainIn
 * @property {number} t  seconds since the toy started
 * @property {number} dt
 * @property {GestureEvent[]} events
 * @property {ButtonName|null} button  pressed this frame
 * @property {XZ|null} pointer  the pointer on the floor, null when there's none
 * @property {{x: number, z: number, yaw: number, grounded: boolean}} newt
 * @property {{name: string, time: number, remaining: number}|null} clip  the playing one-shot or loop (not the gait)
 * @property {{dragSpeed: number, shake: number}|null} carry  while he's held (carry.js `carryFeel`)
 * @property {XZ|null} [camera]  the camera's spot on the floor: a reaction turns him toward it (without it, toward +z)
 */
/**
 * @typedef {object} BrainOut
 * @property {string} state  idle, walk, react, flee, held, fall, land, sitDown, sit, standUp
 * @property {string} clip  'gait' (Idle/Walk/Run by speed) or a clip name
 * @property {boolean} restart  start `clip` from 0 this frame
 * @property {{mode: 'stay'|'goto'|'flee'|'face', goal: XZ|null, speed: number}} move  goal: where a goto goes, the camera's spot to face, or where a flee's threat was last seen (with no pointer); speed: the target speed (steer ramps to it)
 * @property {import('./clips.js').FaceName} face  the base face (faces.js adds blinks)
 * @property {import('./clips.js').BlinkMode} blink
 * @property {{mode: 'pointer'|'camera'|'forward'|'back', weight: number, ease?: number, at?: XZ|null}} look  ease:
 *   a slower look, seconds for it to come round (lookAt.js lookStep), as he's let go; at
 *   ('back'): who he runs from on the floor, for his glances back (null with no one)
 * @property {boolean} faceCamera  turning to the camera first (a reaction, or sitting down)
 * @property {number} stress
 * @property {boolean} wander
 * @property {'Sit'|'Stand'} sitLabel
 * @property {boolean} buttonsEnabled
 * @property {'Wave'|'Spook'|null} reaction  the reaction under way (react only), turn included
 */

/**
 * @typedef {{x: number, z: number, yaw: number, speed: number, run?: XZ}} Body  NEWT's root on the
 *   floor; `run`, while he flees: the way he runs (a unit direction, smoothed: steer.js)
 */
/** @typedef {typeof import('./brain.js').TUNE} Tune  the brain's numbers (createBrain's `tune` overrides any of them) */

/**
 * @typedef {object} CarryState  carry.js: NEWT held by the collar (holdStep updates it in place)
 * @property {number} t0  when he was grabbed
 * @property {number} t  the last step
 * @property {XYZ} anchor  where the collar goes this frame (world): the pointer's spot on the
 *   plane he's dragged on plus the grab offset (carry.js dragTarget), inside the play area
 * @property {XYZ} drive  a critically damped follow of the anchor: the swing and the feel read it
 * @property {XYZ} vel  the drive's velocity
 * @property {{x: number, z: number}} tilt  the root's swing in radians: root.rotation.x and .z (positive z puts his feet toward +x, positive x toward −z)
 * @property {{x: number, z: number}} tiltVel
 * @property {Array<{t: number, x: number, y: number, z: number}>} samples  the anchor over the last ~80 ms
 * @property {number} dragSpeed  the drive's speed, world units/s
 * @property {number} shake  the drive's acceleration, smoothed, world units/s²
 * @property {XZ|null} push  while the pointer's spot is out past the play area's edge: the way
 *   it pushes him, out through the edge (unit length; let go then, he's tossed with nothing across)
 */

/** @typedef {{yaw: number, pitch: number}} Aim  radians from his body's facing: yaw + turns toward +x when he faces +z (like root.rotation.y), pitch + looks up */
/**
 * @typedef {object} LookState  lookAt.js (lookStep updates it in place)
 * @property {number} yaw  the eased look, radians
 * @property {number} pitch
 * @property {number} vyaw
 * @property {number} vpitch
 * @property {number} weight  eased toward the brain's look weight
 * @property {Aim} target  what it's easing toward this frame
 * @property {string|null} mode
 * @property {Aim|null} lastAim  the pointer's last aim
 * @property {number} lastAimT
 * @property {Aim|null} glance  a glance under way
 * @property {number} glanceUntil
 * @property {number|null} nextGlance
 * @property {number} glances  how many glances so far
 */

/**
 * @typedef {object} FaceState  faces.js (faceStep updates it in place)
 * @property {string|null} mode  the blink mode last seen
 * @property {number|null} next  when the next blink starts
 * @property {number} until  the blink on now ends
 * @property {number|null} again  a double blink's second one starts
 */

/**
 * @typedef {object} Character  what character.js hands main.js
 * @property {any} root  the THREE.Object3D to move
 * @property {(clip: string) => boolean} has
 * @property {(clip: string) => number} clipLength  seconds, 0 when it's missing
 * @property {(weights: Record<string, number>, phase: number) => void} setWeights
 * @property {(clip: string) => boolean} restart  play it from its start: true when it still showed, its old start fading out as its twin (play.js TWIN)
 * @property {(dt: number) => void} update
 * @property {(yaw: number, pitch: number, weight: number) => void} applyLook
 * @property {(face: import('./clips.js').FaceName) => void} setFace
 * @property {(name: string, out: XYZ) => XYZ} bonePos  world position of a bone's head
 * @property {(camera: any, rect: {left: number, top: number, width: number, height: number}) => {head: {x: number, y: number, r: number}, body: {a: {x: number, y: number}, b: {x: number, y: number}, r: number}}} screenShape
 * @property {() => void} dispose
 */

export {};
