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
 * @property {boolean} paintedLook  the Painter's: under reduced motion the look being painted still shows, held still (stillFx.js)
 * @property {boolean} lightTrails  the fireflies leave trails of light (Bonfire Live's Trails)
 * @property {boolean} fxLayer  the pixel pass's effects layer and stages (Bonfire Live and the Painter; not the site)
 * @property {(() => void) | undefined} onFormed  createBonfire's: a new weapon finished forming
 * @property {((flame: string, from: string, instant: boolean, selection: any) => void) | undefined} onImpact  createBonfire's: a weapon landed (or was set at once)
 * @property {((dt: number, t: number) => void) | undefined} onFrame  createBonfire's: the page's part of each drawn frame (Bonfire Live's director)
 * @property {(amount: number) => void} jolt  a jolt of the camera, if screen shake is on
 * @property {any} view  the camera's framing, sway and shake (view.js)
 * @property {boolean} coarse  a touch screen: the scaled-down counts
 * @property {any} P  effects.particles
 * @property {any} F  effects.fireflies
 * @property {(n: number) => number} pCount  a particle count for this device
 * @property {(n: number) => number} fCount  a firefly count for this device
 * @property {(n: number) => number} impactCount  an impact's particle count for this device
 * @property {boolean} siteKnight  the site's knight (sceneKnight.js); Bonfire Live (`fxLayer`) casts its own
 * @property {string | null} knightHelmet  createBonfire's: the helmet the visitor picked on an earlier visit (main.js)
 * @property {any[]} tinted  everything that burns in the flame's colors as they blend (the knights and the sign join)
 * @property {any} renderer  the THREE.WebGLRenderer
 * @property {HTMLCanvasElement} canvas  the renderer's (low resolution: sceneRender.js resize)
 * @property {any} scene
 * @property {any} camera
 * @property {any} pass  the pixel pass (pixelPass.js): its uniforms, palette and steel
 * @property {any} fireLight  the fire's light, the one that casts the shadow (sceneLights.js)
 * @property {any} particleMaterial  the flame's particles' material (flame.js), whose depth texture follows the size
 * @property {any} flowView  breakdown mode's flow field over the fire (flowView.js)
 * @property {any} interaction  how the cursor moves flames, sparks and fireflies (interaction.js)
 * @property {any} pointer  the cursor's path, and its ray (pointer.js)
 * @property {any} timer  the scene's clock (THREE.Timer: advanced once per drawn frame)
 * @property {any} FIRE_LIGHT_AT  where the fire's light hangs (sceneLights.js), and where it goes for the lightning ball:
 * @property {any} ballLightAt
 * @property {number} BALL_LIGHT_MIN_Y
 * @property {Record<string, number>} drive  live modulation from outside (Bonfire Live writes it every frame)
 * @property {Record<string, number>} glitch  the pixel pass's effects layer's values (Bonfire Live's looks)
 * @property {Record<string, number>} presence  each element eased in (1) and out (0)
 * @property {any} white  (a THREE.Color, never changed)
 * @property {any} lightBase  the cast light's color before the temperature
 * @property {any} lightWarm  ...and what a warm temperature leans it toward
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

/**
 * The fire's moments (sceneFire.js).
 * @typedef {object} FirePart
 * @property {() => number} ambient  how much of the background extras to keep (1 - busy, by the budget)
 * @property {(weight: number, o?: { freeze?: boolean, flash?: boolean, shake?: boolean }) => void} hit  a hit: a freeze, a flash, a jolt; the scene goes busy
 * @property {(x: number, z: number, size?: number, o?: { ring?: boolean }) => void} scar  a mark on the ground and debris, in the element's way
 * @property {() => boolean} stoke  true the first time
 * @property {(amount?: number) => void} puff
 * @property {(selection: any, weaponKey: string, stationary?: boolean) => void} impact  a weapon landed: the new flame and element
 * @property {(weaponKey: string, flame: string, o?: object) => Promise<any>} equip  swap weapon and flame (resolves at impact)
 * @property {(strength?: number, o?: { accent?: boolean, blink?: boolean }) => void} pulse  a beat
 * @property {(strength?: number, o?: { quiet?: boolean }) => void} ring  the element's ring
 * @property {(power?: number) => boolean} strikeFirefly  lightning reaches for the nearest firefly
 * @property {() => void} echo  an echo of the planted weapon's silhouette
 * @property {(plan: any) => Promise<boolean>} swing  the living blade's routine
 * @property {() => Promise<boolean>} flourish  the site's: a couple of moves and back in
 * @property {any} bladeState  where the blade is (filled in by weapons.blade)
 * @property {(g0: any, t0: any, g1: any, t1: any, dt: number) => void} bladeWake  flames near the moving blade knocked along
 * @property {(n?: number) => void} sparkle  a few sparks off the flame
 */

/**
 * What scene.js itself hands the parts.
 * @typedef {object} MainPart
 * @property {(key: string, instant?: boolean) => void} setElement  the fire's element (`instant`: no easing)
 * @property {() => void} applyFireParams  the flame's parameters from the settings, the element and the drive
 * @property {(f: { ramp: string[], shade: string }, mix: number) => void} applyColors  the flame's colors, everywhere they burn
 * @property {Promise<void>} loaded  the model is in and the shaders built: the scene's `ready`
 */

/**
 * How the picture is drawn (sceneRender.js).
 * @typedef {object} RenderPart
 * @property {{ pixelSize: number | null }} settings  the pixel size set over the settings' (null: theirs)
 * @property {Record<string, any>} renderOverride  render options set over the settings' (setRender)
 * @property {() => number} pixelSize  the pixel size in CSS px
 * @property {() => void} applyRender  the render options as the pass's uniforms (and the settings they write through to)
 * @property {(partial?: Record<string, any>) => void} setRender
 * @property {(p?: any) => void} setPalette
 * @property {(kind?: string) => void} setFog
 * @property {(on?: boolean) => void} setShadows
 * @property {(view?: string | null) => void} setXray
 * @property {(force?: boolean) => void} keepPalette  the palette set over the flame's kept up with it (every frame)
 * @property {() => void} resize  the render target sized to the container (and the knights' headroom)
 * @property {() => void} fitKnights  whether the site's knight has room over his seat to stand up in
 * @property {(what: string, dir?: number) => Record<string, string>} cycle  the P menu: step a setting
 * @property {() => Record<string, string>} describe  the P menu: what each setting is now
 * @property {(view?: string) => void} breakdown  one of the passes in place of the picture, or the flow field
 * @property {(objects: any[], name: string) => void} named  name point sets for the breakdown's counts
 * @property {() => any} stats  the draw calls, the size and each particle system's count
 */

/**
 * Every frame (sceneUpdate.js).
 * @typedef {object} UpdatePart
 * @property {(from: number, to: number, fs: number) => void} recolorGlows  glows[from…to) at flame step `fs`
 * @property {(dt: number) => void} renderFrame  a frame: the page's part, the update, the draw
 */

/**
 * What's under the cursor, and what a click or a scroll does (scenePick.js). Points are client px.
 * @typedef {object} PickPart
 * @property {(x: number, y: number) => boolean} weaponAt  the planted weapon is under the point
 * @property {(x: number, y: number) => number} knightAt  the knight under the point (his index), or -1
 * @property {(x: number, y: number) => boolean} signAt  the knight's summon sign is under the point
 * @property {(x: number, y: number, o?: { knight?: boolean }) => string | null} hoverAt  'weapon' | 'sign' | 'knight' | 'fire' | null, its effect shown
 * @property {() => void} hoverOff  the cursor left the scene
 * @property {(x: number, y: number) => void} flash  a click: the fireflies flash, a gust pushes the loose particles
 * @property {(dy: number) => void} scroll  the page scrolled by `dy` CSS px
 */

/**
 * The knights (sceneKnight.js).
 * @typedef {object} KnightPart
 * @property {Promise<void>} knightsIn  the knights are in (on the site, when he's away at load, a moment after the first frame)
 * @property {{ style: string | null, finish: string | null, rim: number | null }} armorOverride  Bonfire Live's style, finish and rim over the settings'
 * @property {() => void} applyArmor  the finish, the rim and the style, as set now
 * @property {(o?: { instant?: boolean }) => Promise<boolean>} applyStyle  the style as set now, on the shader and (its own model) the knights
 * @property {(file: string) => Promise<any>} prepareStyleModel  a style's model fetched and its template built in idle moments (once)
 * @property {(model: any, o?: { template?: any, attach?: boolean }) => any[]} addKnights  the knights, from their model
 * @property {(name: string) => { x: number, y: number, z: number, yaw: number }} signPlace  where the knight's sign lies in a place
 * @property {(name: string, o?: any) => Promise<boolean>} wearHelmet
 * @property {(first?: boolean) => void} applyKnight  the site's knight as effects.knight says
 * @property {(index?: number | string) => void} busyWithHim  the visitor did something with him: his rest topped up
 * @property {(o?: { instant?: boolean }) => boolean} summonKnight  the site's knight, from his sign
 * @property {Set<(presence: string) => void>} presenceListeners  told whenever the site's knight comes or goes
 * @property {() => boolean} reacts  whether the knights react (the site's setting, or Bonfire Live's)
 * @property {(kind: string, strength?: number, where?: any) => void} reactKnights  something happened at the fire, if the knights mind it
 */

/** @typedef {SceneGivens & SceneState & IdlePart & ModelPart & SceneryPart & FirePart & RenderPart & UpdatePart & PickPart & KnightPart & MainPart} SceneContext */
