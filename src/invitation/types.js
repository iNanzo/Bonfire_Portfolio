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
//   5. character.update(dt): restore the head's and the limbs' saved animation pose →
//      mixer.update → save it; then character.limp (while he's carried or falling, and easing
//      out once he's down: his arms and legs swing as springs on top of the clip, never his
//      chest, neck or head; only on a frame his pose stepped)
//   6. root.updateMatrixWorld → carry's tilt on the root → read the collar → move the root by
//      anchor − collar → root.updateMatrixWorld (only while held; the anchor is where the
//      cursor's ray meets the camera-facing plane he was grabbed on, plus the grab offset as it
//      eases out: carry.js offsetAt)
//   7. lookStep → character.applyLook (on top of the saved pose: it never adds up; his chest
//      joins in for big looks while he's on his feet, lookAt.js chestShare and torsoStep)
//   8. faceStep → character.setFace; character.accessories (his earrings swing on his head as
//      the look left it; Give Device's tablet at his palms); bubble.update (while a line is up): his head on screen
//      (character.screenShape; null while the open Look sheet covers it, bubble.js
//      speakerPoint), clear of the toolbar and the open sheet
//   9. stage.render: the shadow map once, the colour pass, the retro pass

/** @typedef {{x: number, z: number}} XZ */
/** @typedef {{x: number, y: number, z: number}} XYZ */
/**
 * @typedef {object} Bounds  where NEWT's root may go: the play area (area.js), whose edges are
 *   his walls. A box; with `round`, a box with corners of that radius; or a trapezoid, its sides
 *   minX/maxX at the front (maxZ) and minXBack/maxXBack at the back (minZ), straight lines
 *   between (steer.js xRange); or, with `r`, a disc of that radius around the box's centre (the
 *   box is its square: the toy's play area). With `turn`, any of them turned that many radians
 *   about its box's middle (+ toward +x: what's on screen, in the camera's frame, steer.js
 *   turnBounds). The play area carries `sight`, what's on screen now (camera.js orbitSight):
 *   wander goals keep inside it, and a flee to what it was as the flee began.
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 * @property {number} [minXBack]
 * @property {number} [maxXBack]
 * @property {number} [r]
 * @property {number} [round]
 * @property {number} [turn]
 * @property {Bounds} [sight]
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

/**
 * @typedef {'Wave'|'Spook'|'Sit'|'Run'|'Wander'|'Device'} ButtonName  Device: Give Device (each press
 *   sits him with the tablet, then lies him down with it, then gets him up); Spook and Wander
 *   stay brain inputs though the toolbar no longer shows them (a tap spooks; Wander is a setting)
 */

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
 * @property {DialogueIn|null} [dialogue]  while Play Intro's dialogue runs, the box up (brain.js's talk state)
 */
/**
 * @typedef {object} DialogueIn  the intro's box as the brain sees it
 * @property {number} seq  counts the boxes shown: a new one plays its animation
 * @property {string} animation  a DIALOGUE_CLIPS name or 'none'
 * @property {import('./clips.js').FaceName} face
 * @property {boolean} typing  its line is still typing out (Talk plays meanwhile)
 */
/**
 * @typedef {object} BrainOut
 * @property {string} state  idle, walk, react, flee, held, fall, land, sitDown, sit, standUp, talk,
 *   and Give Device's deviceSit, lieDown, deviceLie, getUp
 * @property {string} clip  'gait' (Idle/Walk/Run by speed) or a clip name
 * @property {boolean} restart  start `clip` from 0 this frame
 * @property {{mode: 'stay'|'goto'|'flee'|'face', goal: XZ|null, speed: number}} move  goal: where a goto goes, the camera's spot to face, or where a flee's threat was last seen (with no pointer); speed: the target speed (steer ramps to it)
 * @property {import('./clips.js').FaceName} face  the base face (faces.js adds blinks)
 * @property {import('./clips.js').BlinkMode} blink
 * @property {{mode: 'pointer'|'camera'|'forward'|'back', weight: number, ease?: number, at?: XZ|null, pitch?: number, up?: number, lift?: number}} look  ease:
 *   a slower look, seconds for it to come round (lookAt.js lookStep), as he's let go; at
 *   ('back'): who he runs from on the floor, for his glances back (null with no one); pitch:
 *   'ahead' at this pitch, radians (+ up), not the viewer's (held: his head hangs); up (held):
 *   0 his head hung over his own front, to 1 glancing up at the viewer, lift radians higher
 *   (play.js lookFront)
 * @property {boolean} faceCamera  turning to the camera first (a reaction)
 * @property {number} stress
 * @property {boolean} wander
 * @property {'Sit'|'Stand'} sitLabel
 * @property {boolean} buttonsEnabled
 * @property {'Wave'|'Spook'|null} reaction  the reaction under way (react only), turn included
 * @property {boolean} talkReady  the intro's talk state, in place: up, walked in and turned to the
 *   camera, so the box's line, face and gesture can begin (main.js holds the line until then)
 * @property {'sit'|'lie'|null} [device]  Give Device under way: sitting or lying with the tablet
 * @property {'Give Device'|'Lie Down'|'Get Up'} [deviceLabel]  what the Give Device button says
 *   (ui.js): what its next press does
 */

/**
 * @typedef {'arrow'|'point'|'open'|'grab'|'turn'} CursorKind  the stage's pixel cursor
 *   (cursor.js): the arrow; the pointing hand over buttons; an open hand over NEWT; a closed hand
 *   while he's held or the view is panned; the turn glyph while the camera orbits
 */
/**
 * @typedef {'floating'|'opening'|'waiting'|'fading'|'gone'|'skipped'} EnvelopeState  the
 *   envelope that opens the page (envelope.js): floating until opened (a tap, a swipe up, Enter)
 *   or skipped (a swipe down, Escape, Skip Intro); waiting when it's open before NEWT is in
 */

/**
 * @typedef {{x: number, z: number, yaw: number, speed: number, run?: XZ, fence?: Bounds}} Body  NEWT's
 *   root on the floor; `run`, while he flees: the way he runs (a unit direction, smoothed:
 *   steer.js); `fence`, while he flees: what was on screen as it began, which he keeps inside
 */
/** @typedef {typeof import('./brain.js').TUNE} Tune  the brain's numbers (createBrain's `tune` overrides any of them) */

/**
 * @typedef {object} CarryState  carry.js: NEWT held by the collar (holdStep updates it in place)
 * @property {number} t0  when he was grabbed
 * @property {number} t  the last step
 * @property {XYZ} anchor  where the collar goes this frame (world): the pointer's spot on the
 *   plane he's dragged on plus the grab offset as it eases out (carry.js dragTarget), inside the
 *   play area along the plane's line across the floor
 * @property {XYZ} drive  a critically damped follow of the anchor: the swing and the feel read it
 * @property {XYZ} vel  the drive's velocity
 * @property {{x: number, z: number}} tilt  the root's swing in radians: root.rotation.x and .z (positive z puts his feet toward +x, positive x toward −z)
 * @property {{x: number, z: number}} tiltVel
 * @property {Array<{t: number, x: number, y: number, z: number}>} samples  the anchor over the last ~80 ms
 * @property {number} dragSpeed  the drive's speed, world units/s
 * @property {number} shake  the drive's acceleration, smoothed, world units/s²
 * @property {XZ|null} push  while the pointer's spot is out past the play area's edge: the way
 *   it pushes him, out through the edge (unit length; let go then, he's tossed with nothing across)
 * @property {{point: XYZ, normal: XYZ}|null} [plane]  the plane he's dragged on (main.js keeps it
 *   here): at the play area's edge he stops along its line
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
 * @property {(yaw: number, pitch: number, weight: number, torso?: number) => void} applyLook  torso:
 *   how much of lookAt.js chestShare his chest takes (1 on his feet, eased to 0 off the floor)
 * @property {(face: import('./clips.js').FaceName) => void} setFace
 * @property {(name: string, out: XYZ) => XYZ} bonePos  world position of a bone's head
 * @property {(camera: any, rect: {left: number, top: number, width: number, height: number}) => {head: {x: number, y: number, r: number}, body: {a: {x: number, y: number}, b: {x: number, y: number}, r: number}}} screenShape
 * @property {() => void} dispose
 */

/** @typedef {'close'|'medium'|'wide'|'keep'} DialogueShot  a box's camera: head and shoulders, his whole body, the default view, or as it was */
/**
 * @typedef {object} DialogueChoice  a reply the visitor can tap
 * @property {string} label
 * @property {string} next  the id of the box it leads to
 */
/**
 * @typedef {object} DialogueBox  one chat box of the intro (content.json invitation.intro.boxes[])
 * @property {string} id  unique within the script
 * @property {string} [speaker]  the name tab (the script's speaker when missing)
 * @property {string} text  the line, typed out
 * @property {import('./clips.js').FaceName} face
 * @property {string} animation  a DIALOGUE_CLIPS name, or 'none' to keep what he's doing
 * @property {DialogueShot} camera
 * @property {number} [auto]  seconds Auto waits after the line is typed (default by its length)
 * @property {string} [next]  the id of the box after this one (default: the following box)
 * @property {DialogueChoice[]} [choices]  2–3 replies instead of a tap to go on
 * @property {boolean} [end]  the intro ends after this box
 */
/**
 * @typedef {object} DialogueScript  content.json invitation.intro
 * @property {string} speaker  the default name tab
 * @property {string} start  the first box's id
 * @property {DialogueBox[]} boxes
 */

export {};
