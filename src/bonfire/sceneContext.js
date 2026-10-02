// What the bonfire's parts share. scene.js (createBonfire) makes one `ctx` and keeps on it
// every value that more than one part of the scene reads or changes, so each lives in one
// place: the hit's weight, the flame's colors, the weapons and the knights once they're in,
// the place the fire is in. Nothing here runs: it's the list of what's in `ctx`, for the
// reader and the type check.

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

/** @typedef {SceneState} SceneContext */

export {};
