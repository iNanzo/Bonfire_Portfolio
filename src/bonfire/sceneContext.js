// What the bonfire's parts share. scene.js (createBonfire) makes one `ctx` and keeps on it
// every value that more than one part of the scene reads or changes, so each lives in one
// place: the hit's weight, the flame's colors, the weapons and the knights once they're in,
// the place the fire is in. Here: the constants and the small helpers more than one part
// uses, and the list of what's in `ctx` (typedefs only, for the reader and the type check).
import * as THREE from 'three';
import { effects } from '../effects.js';
import { flames } from '../palette.js';

// The passes' layers (frame.js): solid geometry (outlined: the normals and color passes),
// the additive particles (the fx pass), and the "ghost" emissives only the color pass draws.
export const LAYER_SOLID = 0;
export const LAYER_FX = 1;
export const LAYER_GHOST = 2;
export const FIRE_ORIGIN = new THREE.Vector3(0.02, 0.12, 0.02);
export const WEAPON_ANCHOR = new THREE.Vector3(0.04, 0, 0.03);

/** How much of the fire burns for an element: all of it, a banked glow in the ice, none in the ball. */
export const flameShare = (key) => (key === 'fire' ? 1 : key === 'ice' ? effects.ice.innerFire : 0);
// Keep the cast light less saturated than the flame so lit stone lands on the
// dark tinted shade, with the ramp's mid tone only in hot spots.
export const lightMix = (key) => flames[key]?.light ?? 0.34;
/** A drive value (a fraction added: scene.js `drive`) as a factor, never below 0.1. */
export const boost = (v) => Math.max(0.1, 1 + v);

/**
 * What createBonfire makes first and never replaces (a part may keep these from `ctx` as
 * it's made).
 * @typedef {object} SceneGivens
 * @property {any} scope  resources.js: everything the scene owns, given back when it's disposed
 * @property {HTMLElement} container  what the canvas fills
 * @property {boolean} reducedMotion
 * @property {boolean} lightTrails  the fireflies leave trails of light (Bonfire Live's Trails)
 * @property {boolean} fxLayer  the pixel pass's effects layer and stages (Bonfire Live and the Painter; not the site)
 * @property {(() => void) | undefined} onFormed  createBonfire's: a new weapon finished forming
 * @property {boolean} coarse  a touch screen: the scaled-down counts
 * @property {any} P  effects.particles
 * @property {any} F  effects.fireflies
 * @property {(n: number) => number} pCount  a particle count for this device
 * @property {(n: number) => number} fCount  a firefly count for this device
 * @property {(n: number) => number} impactCount  an impact's particle count for this device
 * @property {any} renderer  the THREE.WebGLRenderer
 * @property {any} scene
 * @property {any} frame  the passes and their buffers (frame.js)
 * @property {any} candleLight  the ruins' candle's light (sceneLights.js)
 * @property {any[]} lamps  the pool of lights the places' lamps take (sceneLights.js)
 * @property {any} effectMaterial  the loose particles' material (flame.js), and their two other shapes:
 * @property {any} crossMaterial  lightning's sparks
 * @property {any} diamondMaterial  ice's glints
 * @property {any} field  the curl noise the particles ride (curl.js)
 * @property {any} fire  the flame and its sparks (flame.js)
 * @property {any} plasma  the lightning ball (plasma.js)
 * @property {any} chill  the cold mist (chill.js)
 * @property {any} crystals  the ice's shards (ice.js)
 * @property {any} swingTrail  the living blade's trail of fire (swingTrail.js)
 * @property {any} marks  the marks hits leave on the ground (marks.js)
 * @property {Record<string, any>} debris  each element's bouncing debris (debris.js)
 * @property {any} smokeMaterial  the impacts' smoke
 * @property {any} armor  the knights' shared armor uniforms (armor.js)
 */

/**
 * What the scene is doing. Each value is set where its part of the scene says what it is
 * (scene.js, with the comment that explains it), and read from `ctx` whenever it's needed.
 * @typedef {object} SceneState
 * @property {((x: number, z: number) => number) | null} terrainTop  the scenery's height at (x, z), once the model has loaded
 * @property {number} busy  0..1: rises with every big moment and drains over a second or so (the hit feel)
 * @property {number} hitStop  seconds of freeze left
 * @property {number} timeDebt  frozen time still to be repaid
 * @property {number} simT  the simulation's clock (real time minus the freezes still owed)
 * @property {number} flashAmt  the impact flash, 0..1
 * @property {number} strikeAt  (simulation time) a firefly strike waiting for the ball to grow in
 * @property {string} elementKey  the fire's element: 'fire' | 'lightning' | 'ice'
 * @property {number} hoverFlare  1 while the cursor is on the fire (the site)
 * @property {number} hoverGlow  how far the fire has risen, brightened and started sparking to meet it (eased)
 * @property {number} sweep  the page's scrolling: an impulse that fades in a moment (-1..1, + up)
 * @property {any} fireflies  fireflies.js, once the model loads
 * @property {any} fx  ground flames, smoke and ash for weapon impacts (impact.js), once the model loads
 * @property {any} zap  the lightning ring (lightningRing.js), once the model loads
 * @property {any} frostRing  the ring of ice shards (ice.js), once the model loads
 * @property {any} weapons  weapons.js, once the model loads
 * @property {any} knights  knights.js, once theirs does
 * @property {string} flameKey  the flame (palette.js flames) the fire burns in, or is blending to
 * @property {{ from: string, to: string, t: number, fast?: boolean } | null} blend  an eased blend between two flames, under way
 * @property {number} blendMul  the light swelling and settling as a blend's color turns over
 * @property {number} debugPaletteIndex  the palette shown (0: the flame's own; else a debug palette's)
 * @property {boolean} fewStale  the palette was set since a few colors were last put over it
 * @property {string[]} currentRamp  the flame's colors as they are now (mid-blend too)
 * @property {string} currentShade
 * @property {number} currentMix  how far the cast light leans to white
 * @property {string | null} forgeFlame  the flame whose colors join the palette while a weapon is forged
 * @property {boolean} ready  the model is in: the scene can be drawn
 * @property {number} targetLevel  the level the fire eases toward (low while a weapon is forged)
 * @property {number} sharedGlows  how many of the glows are the model's own
 * @property {any} bundle  knightBundle.js, once loaded
 * @property {boolean} knightsShown  false while he and his sign are made but not yet in the scene
 * @property {string | null} helmetGoal  the helmet knight 0 has on or is putting on
 * @property {string | null} visitorHelmet  the helmet the visitor picked in the pack (it holds for the visit)
 * @property {any} sign  his summon sign (summonSign.js), on the site
 * @property {any} arrival  his comings and goings (knightArrival.js), on the site
 * @property {boolean} liveReactions  whether Bonfire Live's knights react
 * @property {string} sceneryKey  the place the fire is in (scenery.js SCENERIES)
 * @property {any[]} ruinsOnly  the ruins' own pieces (hidden in the other places)
 * @property {any[]} baseStatics  the model's ground and stones, in every place
 * @property {any[]} liveStatics  the solid pieces of the place shown (the fireflies' raycasts)
 * @property {(() => void) | null} swingDone  resolves the living blade's swing() when it's back in the fire
 * @property {any[]} sets  the particle sets the cursor moves (the rings join on load)
 * @property {{ w: number, h: number, pd: number }} size  the render target's size (texels) and its pixel size (device px)
 * @property {any} paletteOverride  null (the settings'), 'flame', a debug palette's name, or a few slots of the flame's
 * @property {string} fogKind  'light' | 'thick' | 'off'
 * @property {boolean} shadowsOn  the fire's shadow is on (where shadows are drawn at all)
 * @property {string | null} xrayView  one of the passes shown in place of the picture, or the flow field (null: the picture)
 * @property {number} flameStep  the flame's last step (its stepped frame rate)
 * @property {number} shadowFrames  frames the fire's shadow is still to be redrawn in
 * @property {any} perf  the ?perf overlay (ui/perfOverlay.js), or null
 */

/**
 * Building in idle moments (sceneIdle.js).
 * @typedef {object} IdlePart
 * @property {(steps: Generator) => Promise<any>} inSteps  a few ms at a time, never stalling the fire (a knight's template)
 * @property {(steps: Generator) => Promise<any>} inIdle  only in time the page has spare (the places built beforehand)
 */

/**
 * The model and what's made from it (sceneModel.js).
 * @typedef {object} ModelPart
 * @property {any[]} candleFlames  the ruins' candle flames ({ mesh, scale }), flickered each flame step
 * @property {any[]} glows  every glow recolored each flame step: the model's own first (sharedGlows), then each place's as it's first shown
 * @property {any} loader  the GLTF loader (with Draco), for the knight's styles' own models too
 * @property {Promise<any>} knightLoaded  the knight's model (his code with it), or null if either failed
 * @property {boolean} knightLater  the site's knight isn't there at load: he's built after the fire's first frame
 * @property {Promise<void>} modelLoaded  the model is in, everything made from it (scene.js draws then)
 */

/**
 * The places around the fire (sceneScenery.js).
 * @typedef {object} SceneryPart
 * @property {Record<string, any>} terrains  each place's height map, once made
 * @property {any} terrainMaterial  the one material every height map is drawn with
 * @property {Record<string, any>} sceneryMaterials  the model's materials, for the other places
 * @property {Record<string, any>} sceneries  each place's pieces, once built
 * @property {(name: string, o?: { flash?: boolean }) => boolean} setScenery  move the fire to another place
 * @property {() => Generator} prepareSceneries  every other place and its height map, a step at a time
 */

/** @typedef {SceneGivens & SceneState & IdlePart & ModelPart & SceneryPart} SceneContext */
