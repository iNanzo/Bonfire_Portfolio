# NEWT in Bonfire Live: the envelope's show

Status: **plan, nothing built** (2026-11-07; the checklist at the end tracks the tasks).
Source: Newton's ask (2026-11), eight points:

1. The invitation as its own visual option ("world") in Bonfire Live, separate from the
   bonfire: no campfire, no living blade or weapons, no ruins or other sceneries; built on
   the page (with several colors), NEWT, the rose petals, the envelope and letter, and his
   existing voice lines.
2. The envelope used through the show, not only as an intro: the envelope, the petals, the
   letter, NEWT and the lines are what make this world not the bonfire's.
3. Share what makes sense: every render effect (looks, layers, drop hits, render options),
   the knights' dance moves and gestures, the fireflies and the fire, lightning and ice
   effects, and NEWT's lines with the behavior they already go with (no new lines, no new
   triggers).
4. Impressive in the invitation's own terms: paper, ink, petals, a letter, a character who
   reacts and talks; not a re-skinned bonfire.
5. Consolidate without breaking either app; the invitation's tests keep passing.
6. Simple to build: import existing modules over building systems; defer what a first
   impressive version does not need.
7. Codex builds in parallel one-PR tasks with crisp finish lines while Newton reviews on a
   phone; Claude does the visual checks and reviews the PRs; Newton signs off on feel.
8. One design plan, this file, in this folder's form.

## Summary

The invitation becomes a second world in Bonfire Live, picked with a *World* setting or
`?world=newt`: its own scene drawn through the bonfire's `createFrame` + `createPixelPass`,
so every look, layer, drop hit and render option works unchanged, answering the director's
weapon protocol with letters: the breakdown's forged blade is a sealed letter floating in,
the build opens it, the drop burns it and the page turns behind the burn. NEWT is the toy's
real character, brain and talk, so his lines fire from the same behaviors as in the toy,
pressed by the show's moments. Petals come out of every letter and breathe with the kick.
The element rings, marks and fireflies import as they are, with small seams. The knights'
solver imports as is, but on his body only nod, stomp and beckon clear his head today; those
three ship first, the other ten wait for a `headRoom()` pass (Later). `director.js` is
untouched but for three default keys (`world`, `page`, `pageTurns`): the world is a duck for
`fire`.

Words: the *director* drives a *fire* (the scene object) with the bonfire's weapon
vocabulary: `equip(weapon, flame, { hold, pace, element, instant })` resolves at its
*impact*, `hold` keeps it *held* until `release()`, `holding`/`forging`/`weapon` report the
state, `swapTime` is the seconds from `equip()` to impact at pace 1, `onImpact(flameKey,
from, instant, selection)` the Live UI's callback. The *duck* (`fireDuck.js`) presents those
members; a *letter* is a `createEnvelope` appearance whose impact is the frame its burn
starts; a *moment* is one thing the music does, which `newtMoments.js` turns into letters,
petals and NEWT's buttons and gestures. The *page* is the paper; the HTML page is the *Live
UI*.

## Goals and non-goals

Goals: a world that reads as the invitation on a wall; the envelope as the show's structural
device, a letter for every change in the music; every render effect, element effect, the
fireflies and the knights' moves reused, not rebuilt; one PR per task with a runnable finish
line, and the invitation's suites (`test/invitation*.test.mjs`, `e2e/invitation*.spec.mjs`)
green on every PR, not only the ones touching `src/invitation/`.

Non-goals (v1): no campfire, flame, living blade or weapons, ruins, other sceneries or
terrain mesh; no new line content and no new speech triggers (the 19 triggers in
`invitation.lines` with `invitation.speech`'s chances and cooldowns, nothing else); no
director rewrite (no `newtDirector.js`, `showClock.js` or World interface); no new settings
tabs; no formations or several NEWTs (`character.js` has no clone path), no `knightShow.js`
adapter, no NEWT shots table in `camera.js`, no title card written on the letter, no bolts to
petals, no edge glow (an armor shader), no petals on the fireflies' moves, no page from the
show's palette; scene files, the Painter and the admin's Scenes page stay bonfire-side; the
Bayer, dissolve-chunk and `math.js` merges are deferred.

## Requirements

| #   | Ask                                                      | Where it lands                                                                                                                                                                                              | Tasks        |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| N1  | Its own world: no campfire, blade or sceneries           | `src/visualizer/newt/world.js`, its own scene over `createFrame` + `createPixelPass`; `fireDuck.js` presents the `fire` members the Live UI and the director call; `?world=newt`, *World* in the Show tab   | W1, W3       |
| N2  | The envelope used through the show                       | `newtMoments.js` owns a `createEnvelope` per letter: the opening and closing letters, the held letter, the quick letters, the page turn ([The envelope's roles](#the-envelopes-roles))                      | W2a          |
| N3  | Every render effect, the fireflies, fire, lightning, ice | the pass unchanged; `impact.js`, `lightningRing.js`, `ice.js`, `marks.js`, `debris.js`, `chill.js` on a Lambert page (`newt/elementRings.js`); `fireflies.js` with the flat `terrain` stub on dark pages    | W4a, W4b, R6 |
| N4  | The knights' dance moves and gestures                    | `knightRig.js`/`knightSolve.js` on a NEWT rest map, a pose layer in `character.js`, `newt/newtDance.js` for the three that clear his head ([The knights' animations on NEWT](#the-knights-animations-on-newt)) | D1, D2, D3   |
| N5  | His lines with the behavior they go with, nothing new    | the real `createBrain` + `createTalk` run in the world; the moments press the toy's buttons and send its gesture events ([Lines](#lines))                                                                   | W2b, W5      |
| N6  | Page color options                                       | `page` and `pageTurns` settings; `newt/pages.js` (color, ink, 16 slots per page); the page is `voidColor` plus a Lambert plane, never palette[0] ([Page colors](#page-colors))                               | W1, W3       |
| N7  | Consolidate without breaking either app                  | real duplicates only: the rng, the envelope actor, the pass writes and frame loop; the rest imported in place; the toy's tests stay green, only an added petal test (R5) changes, no assertion loosened       | R1–R6, G1    |
| N8  | Simple, one PR a task, crisp finish lines, Codex-ready   | [Delivery plan](#delivery-plan): seams first, named tests and specs, "no behavior change" marked, Briefing Codex                                                                                            | all          |
| N9  | Impressive in the invitation's own terms                 | [The show, moment by moment](#the-show-moment-by-moment); S1 and F1 judge it at real speed from the show's own cameras, as CONTRIBUTING asks                                                                 | S1, F1       |

## Key decisions

- **K1. Its own scene, not a mode of `createBonfire`.** Alternative: a "page" scenery with
  the flame and lights off. Why: the GLB's ground, stones and pit are shown in every place
  and the flame is never removed (`sceneModel.js:239-257`; `scene.js:254,353-355`).
- **K2. The director stays whole, on a duck** that implements every `fire` member reached
  across `src/visualizer`, as `test/lib/fakeScene.mjs fakeFire` does. Alternative: a smaller
  `newtDirector.js` + `showClock.js`. Why: the Live UI calls ~30 director members unguarded,
  and the weapon protocol gives the letters their timing for free.
- **K3. One pixel pipeline, the bonfire's; NEWT in the spare slots first** (the toy keeps its
  retro pass, 17 tests pin it; his six tones fill palette slots 10–15). Second: the pass's
  cel path (a mark in the cel band, `CEL_MARK` 0.61 .. `ARMOR_MARK` 0.9, gets undithered
  flat bands over `setSteel`'s up-to-eight tones, `pixelPass.js:205-224,948-966`; his `dress`
  material would write it). Last: a NEWT-mark branch in `pixelPass.js` (per-channel quantize
  where the mark is his, ~20–30 lines under `#ifdef FX`). Why: no shader branch until S1
  shows he is not himself in six slots; `setSteel` is a ramp redirect, not an exemption.
- **K4. The envelope is drawn by the world's renderer**: its picture moves into
  `src/invitation/envelopeActor.js` (a Group driven by `createEnvelope.pose()`), which the
  toy's `createEnvelopeScene` then uses too. Why: that scene is a modal DOM layer with a
  white backdrop, document-level key capture (colliding with `actions.js:149`) and a WebGL
  context per appearance (`envelopeScene.js:343-374,538-657,898-920`); DOM reaches neither
  the recorder nor the projector window's stream.
- **K5. The page is `voidColor` plus a Lambert plane, never palette[0]**, which is the
  outline color, the clear color, the fog and the few-color palettes' first slot
  (`pixelPass.js:387`; `render.js:27-33`; `scene.js:142-143`): a white slot 0 draws white
  outlines.
- **K6. Page turns ride hidden moments only, from a fixed list**: the next page under a
  burning held letter on a big drop (`pageTurns: 'drops'`); never under a quick letter, never
  from `fire.setScenery` (called on every settings change, `dialogs.js:55`). Why: a flash
  every 16–32 bars on a phone makes the small letter outrank the held one; a page from the
  show's palette is new color math for an ask seven fixed pages already answer.
- **K7. The held letter opens at build stage 4, burns on the strike frame.** Why:
  `createEnvelope` dissolves only from `waiting`, 0.85 s after `open()`
  (`envelope.js:566-578`): opening at the strike lands the burn late, and an open, pulsing
  letter is the right picture for the top of a build.
- **K8. The letter machine has one owner.** `newtMoments.js` owns every `createEnvelope`,
  decides open/ready/skip and says when a letter is gone; `fireDuck.js` only translates
  (`equip`/`release`/`holding`/`forging`/`swapTime`/`blade` become moment inputs and read
  moment outputs; it calls the Live UI's `onImpact`). W1 ships the duck with a letterless
  stub (an impact timer); W2a replaces it. Why: two Codex PRs would otherwise both build it.
- **K9. The drop's lines come from a grab and a release at the strike; Spook only when
  nothing is held.** Why: `onButton` returns while he is held or falling (`brain.js:735`),
  90 ms of hold is no visible lift, and `spook`, `pickedUp`, `dropped`, `landed` share
  priority 3 (`speech.js:78-86`; a line up is only replaced by a higher one, `:428`), so a
  Spook at the blackout would silence the fall's lines. The carrier (C1) waits for a spike.
- **K10. Dances in two steps.** Nod and stomp (moves) and beckon (a gesture) ship with the
  pose layer (D3); the other eleven moves and nine gestures wait for `headRoom()` (Later, on
  Newton's word). Why: measured intrusions in 11 of 13 moves and 9 of 10 gestures.
- **K11. No new tabs.** `world`, `page` and `pageTurns` join the Show tab; bonfire-only rows
  are disabled with a reason through a `worlds` field on their entries. Why: nine tab labels
  are pinned (`test/vizSettings.test.mjs:403-411`, `e2e/tips-live.spec.mjs:28`) and nothing
  hides a tab per world (`settingsDialog.js:120-179`).
- **K12. The seeded rng: `bolts.js` imports the toy's** `createRng` from
  `src/invitation/rng.js` (the allowed direction: the admin and `src/contentRules.js` import
  the toy today) and keeps exporting `seeded` and `hashSeed` for its five importers.
  Alternative: a new `src/rng.js` both import, with a shim and a boundary-test exception.
  Why: one line, no new file, no boundary change; the mirror guard (G1) names this one
  crossing; either way a tiny shared chunk, which the first-load guard shows.
- **K13. Imports in place, moves only with shims; copy first, extract after.** Petals, speech,
  character and the pose modules are imported from where they live; W1 copies the bonfire's
  frame loop and pass writes (~80 + ~60 lines, headers naming the source) and R3 extracts
  them after W1 ships, the copy as the bit-for-bit oracle. Why: the toy may import nothing
  outside `src/invitation/` (`test/invitationContent.test.mjs:92-117`), tests pin symbols by
  path and identity, 34 files import the pose modules, and a split of three bonfire-core
  files (1,662 lines) whose only judge is the 30–40 min e2e does not belong on W1's path.

## Architecture

**Shared**, unchanged unless named: the listening layer (`analyser.js`, `tempo.js`,
`sections.js`, `tickBatch.js`, `link.js`, `midi.js`); the show (`director.js` whole,
`looks.js`, `bars.js`, `render.js`, `colors.js`, `camera.js`, `cameraEase.js`, `clearing.js`,
`cards.js`, `record.js`, `output.js`, `hud.js`, `settings*.js`); drawing (`frame.js`,
`pixelPass.js`, `view.js`, `resources.js`, `frameGate.js`, `flame.js`'s particle material,
`points.js`, `curl.js`; after R3 `passWrites.js` and `frameLoop.js`, new); the effects named
in N3 with `bolts.js`, `fireflyShow.js` and `fireflyMoves.js`; the pose modules
(`knightRig.js`, `knightSolve.js`, `knightGestures.js`, `knightBody.js`, standing moves);
`src/invitation/rng.js` (K12). **Bonfire only**: the rest of `src/bonfire/` (the scene,
model, lights, fire, render setters, sceneries, terrain, weapons, forge, blade, plasma, armor,
steel and knight-body modules), `knightShow.js`, the scene files and loop, the Painter, the
admin's Scenes page. **NEWT only**: `src/visualizer/newt/world.js`, `fireDuck.js`,
`newtMoments.js`, `elementRings.js` (named apart from `src/bonfire/rings.js`), `pages.js`,
`newtDance.js`, `newtRig.js`, `fireflyModel.js`, and the toy's envelope, petal, character,
brain, speech, bubble, blend, play, lookAt and content modules, imported in place.

### Choosing and loading the world

`main.js startScene()` picks `settings.world === 'newt' ? (await
import('./newt/world.js')).createWorld : (await import('../bonfire/scene.js')).createBonfire`;
both take `(stage, opts)` with the options `main.js:222-238` passes (the world ignores
`sway`, `lightTrails` and `onRamp`) and resolve `ready`. `onTick(dt)` stays the analyser's
hook; `hear(f, dt)` is the one new line, in `main.js onFrame` after `ctx.director.update(f,
dt)` (`:183-188`), and `onEvent` relays the director's events: `ctx.fire.onEvent?.(type,
data)`. A `world` change re-runs `startScene()` as `particles` does (`dialogs.js:25`,
`REBUILD` gains `world`). The director is built with `scenes: () => []` (never `null`: the
loop calls `library()`, `sceneLoop.js:86`), an inert loop; `ctx.loopLibrary` returns `[]` in
this world, so the start screen's chips go with it (W3). `?world=newt` wins for the session;
`?scene=` and the Painter's Play imply the bonfire. `newt.glb` (754,456 bytes), the toy's
modules and the world's code sit behind that dynamic import (G1 guards it). The start screen
gets a *World* switch beside its presets (`start.js:97-104`), showing the page it opens on.
`src/invitation/content.js` resolves `virtual:invitation-content` through Vite only
(`vite.config.js:264-294`): `world.js` imports it; `newtMoments.js`, `fireDuck.js`, `pages.js`
and `newtDance.js` never do and import no three.js, so node tests can import them. The
world disposes as the bonfire does: a `createResourceScope()` of its own (`scene.js:109-139`),
so `startScene`'s generation guard (`candidate.dispose()`) and the context-loss handler work
unchanged.

### Drawing

`world.js` owns a renderer on a canvas inside `stage` (the output window streams
`stage.querySelector('canvas')`, `src/ui/output.js:33-36`), a scene, a camera and `createView`
(for `camera.js`'s `fire.setPose` and `fire.shake`), then `createFrame({ renderer, scene,
camera, layers, voidColor: page, effects: true, own: scope.own, track: scope.trackTree })`
(`frame.js:38-52`) and its `createPixelPass`. The per-frame pass writes (the glitch-to-uniform
table, `uTime`, the ripple, `uCenter` at NEWT's chest on screen) are copied from
`sceneUpdate.js:69-125,376-386` in W1 and come from `passWrites.js` after R3; the frame loop,
gate, stats, capture and teardown likewise from `scene.js:104-139,549-626,735-779`, then
`frameLoop.js`. The world's `glitch` object starts with every key of `GLITCH_UNIFORMS` at its
idle value, or the pass gets `undefined` uniforms; `uCore` (the ramp's lightest,
`scene.js:419`) is written by `pages.js` with `setPalette`. The render setters are the world's
own: `setRender` writes the pass uniforms and the `WRITE_THROUGH` keys as `sceneRender.js
applyRender` does (`:76-110`, an accepted copy); `setPalette(p)` answers `render.js`'s shapes
(`null`/`'flame'` → the page's 16 colors; `'ashen'`/`'moonlit'` → the pass's debug palettes;
`[slots]` → those slots of the page palette, `render.js:27-43,158`); `setXray` writes
`pass.uniforms.uXray` only; `setFog` is a no-op; `setShadows` toggles the world's light.
`sceneRender.js`'s own setters stay bonfire-side (the flame palette machine, scene fog, fire
light, flow view).

Light and page: a hemisphere plus a fitted directional with a shadow over a
`MeshLambertMaterial` plane (the toy's `fitShadow` copied, `floor.js:122-171`); the plane
takes `marks.patch` (`marks.js:252-259`) so scorches darken the paper. Shadows on on desktop,
off on touch as the bonfire does (`scene.js:118`; on touch NEWT stands on the toy's blob
shadow); `frame.warm` pre-builds point-light shadow materials only (`frame.js:245-262`), so
the world renders one shadow frame before `ready`. The fx composite stays additive and
unchanged in v1 (`pixelPass.js:485-492`): on light pages the world leans on what is
normal-blended (petals, scorch marks, crystals, ring smoke and ash, chill mist); the glowing
effects (ring flames, embers, bolts, sparks, firefly halos) are for Dusk and Night. S1 shows
whether anything additive reads on White; the ink mode (`uFxMode`, one uniform, bonfire
unchanged at 0) is Later, not a dependency.

NEWT is `loadCharacter`/`createCharacter` with `pixel: false` (the snap-off that exists,
`character.js:270,602-609`; the snap breaks outlines under the normals pass, `:594-619`) and
a `dress` option (R4: a material factory, default the toy's `markId` toon, `:336-361`), wired
as `src/invitation/main.js` step 4 and `finish()` do (`blend`, `play`, `setWeights`,
`applyLook` mode `'camera'`). His tones go into palette slots 10–15 (K3). The tablet
(`device.js:200,218`) keeps `markId`: its alpha 0.0625 is below every band of the pass
(`pixelPass.js:84-91`), harmless; S1 confirms, and it takes `dress` only if it looks wrong.
The envelope is `createEnvelopeActor` in the scene; petals are `createPetalScene({ scene,
unit, seed, tones, mark, linear })`. Under this pass the material tones written into the
color buffer must be linear (it reads the buffer as linear and applies `toSRGB`,
`pixelPass.js:364`; the toy's `rgb()` writes sRGB as is, `envelopeLook.js:23`) and the alpha
a mark below `STEEL_MARK` 0.285 (alpha 1.0 today, which the pass reads as scenery and
creases, `:392-402`): R5 gives the petals `tones` (linear) and `mark`, R2 gives the actor's
`toon()`/`shared()` materials and `buildSpecks` the same (`envelopeLook.js:300` writes alpha
1.0 too). `pages.js` converts with `toLinear` exported from `src/paletteGen.js:27` (R1).

The bubble is `bubble.js` mounted over the canvas, fed `screenShape` each frame. It is DOM:
the recorder (canvas-only, `record.js:70-96`) does not capture it, and that stays so in v1;
the projector window gets it the way the title card does, `win.mirror(el, key)`
(`src/ui/output.js:51`; `cards.js:54`) on every `say` and when it hides. It scales with the
canvas: `world.js` sets `--bubble-scale` = canvas height / 540 on resize (1 on the toy, ~2 at
1080p, 4 at 4K) and `bubble.css` reads it in `font-size`, `max-width`, `padding` and `border`
(16 px and 240 px today, `bubble.css:19-27`).

### The music

The duck's members: `pulse` (the letter's kick, the swirl's breath), `ring` (petal ring plus a
small element ring), `puff` (`spawn`), `sparkle` (trail), `shake` (`view.shake`),
`equip`/`release`/`holding`/`forging`/`swapTime`/`weapon` (the letters), `flame`, `element`,
`scenery`, `swinging` (always false: no combo here), `echo`, `refreshScene`, `setScenery`
(false on no change, never turns the page), `setRender`/`setPalette`/`setFog`/`setShadows`/
`setXray`, `setPose`, `knights: null` (`knightShow.js` guards every entry with `ready(kn)`,
`:349`; the director optional-chains `:810,917`; the one unguarded reach, the pack's helmet
button, `packUi.js:64`, W3 hides), `fireflies` (dark pages, else null), `glitch` (read by the
world for the blackout), `drive` (read for `exposure`), `blade` (the letter's frame while one
is on the page, else his chest, in the shape `camera.js:166-175` reads: `mid`, `tip`, `grip`,
`quat`, `normal`, `len`, `free`), `alive` and `charge` as writable properties
(`director.js:687,887`), `canvas` (inside `stage`), `onRendered(fn) → unsubscribe` (the
recorder copies `scene().canvas` on it, `record.js:49,67,83`), `ready` (a Promise), `dispose`,
`setMaxFps`/`maxFps`, `setStats`/`statsShown`, `fps`, `capture`/`captureThumb`, `hear`,
`onEvent` and `snapshot()` → `{ letter, newt, page, holding }` for the specs.
`test/lib/fakeScene.mjs fakeFire` (`:212-266`) is the shape to copy. No-ops: `setFog`, `echo`,
`refreshScene`, `setScenery`, `knights.*` (the breakdown's `knights.low` and the drop's
`knights.drop` have no NEWT equivalent in v1 beyond the Sit and the toss), `fireflies` on
light pages.

The letters, as the director sees them. `equip` returns a Promise and `release` a boolean
(`director.js:358,384,416`). `forging` is true from `equip` to the letter's impact, held
letters included, as `fakeFire` keeps it (`fakeScene.mjs:233-238`; `director.js:446`'s
`forging && !holding` is written for that): `arm()`, `forgeIn` and `hit()` check it first
(`:357,382,482`), so letters never stack and no `equip` reaches a held letter from the
director; if one does (`instant` from elsewhere), the duck skips the held one first.
`holding` is true from a held `equip` to `release`. A same-weapon or `instant: true` `equip`
lands at once, as the bonfire's recolor and `fakeFire` do (`sceneFire.js:141-152`): the duck
resolves `{ status: 'applied' }` and calls `onImpact` with `instant` true. The duck keeps
`weapon` = the last equipped name, so `nextWeapon()` always differs (`:330`) and `arm()`
never returns early (`:381`). A letter's impact is the frame its burn starts (`waiting` →
`fading`, when the page turn lands): `swapTime` = `TIMES.arrive + TIMES.opening` = 0.55 +
0.85 = 1.40 s (the bloom runs inside the opening, `envelope.js:58-72,566-578`; the bonfire's
is 3.58 s, `scene.js:861-863`), four `swapBeats` at 128 BPM (`:489-497`). A quick letter's
`pace` (0.55–1.8, `:484`) is honored by stepping it on a scaled clock, `env.step(t0 + (t −
t0)·pace)`, never by touching `TIMES`; a held letter is not paced. `onImpact(flameKey, from,
instant, { weapon, flame, item: null, element })` is called with the four arguments
`main.js:158-164` reads (it dereferences `selection.element` and `selection.weapon` before
`director.landed`): `instant` false for a letter that burned or was skipped, true for a
same-weapon or `instant` equip; `from` the previous flame key. The flame keys are the site's
(`colors.next` returns keys, `colors.js:116-129`); the element is kept on the duck between
`equip({ element })` and the drop's `elementRings.js` call.

The world reads `f` itself in `hear(f, dt)` (`start`, `silence`, `breakdown`, `build`,
`return`, `drop`, `f.build`, `f.locked`, `f.beats`, `breakdownFor`) and `onEvent` for `arm`,
`stage`, `dropfx`, `look` and `bar` (emitted at `director.js:390,897,468,981,923`), and
turns them into envelope calls, petal emits, buttons and gestures in `newtMoments.js`: a
pure `step(in) → { button, events, envelope, petals, page }` command stream on a fake clock,
the shape of `fireflyShow.js`, node-tested without three.js; `world.js` stays thin. NEWT's
brain has one entry point, `step(input)` (`brain.js:1054-1073`; `onButton` is private,
`:733`). The world builds a `BrainIn` each frame as the toy's `main.js` does
(`types.js:82-92`): `t`, `dt`, `newt: { x, z, yaw, grounded }` from `bodyStep`'s root,
`camera` the view's spot on the floor (without it a reaction turns him toward +z,
`brain.js:357-364`), `events` the synthetic `GestureEvent`s, `button` the moment's press or
null, `pointer` and `carry` null, `clip` from the character. The talk gets `{ t, dt, state,
prevState, events, button: null, camera: { yaw, zoom } }` (`src/invitation/main.js:1446-1451`):
`null` for the button, so a Sit reads as his own idea (`speech.js:315`); `zoom` = the view's
distance to his chest over the Wide shot's.

### The knights' animations on NEWT

The solver and the standing moves import as they are; the body does not fit yet. Measured on
`newt.glb`: 17 bones under `Hip`; `Bone.001` is a leaf beside `Chest`, not a spine; a T-pose
rest; 1.00 m tall after SCALE 0.16; a 0.43 m head ball. Every move (16 beats × 2 seeds) and
gesture solves with 0 NaN inside the knight tests' joint limits, but a hand or forearm enters
the head ball in 11 of 13 moves and 9 of 10 gestures (clap −0.32 m, hurrah −0.29, fistPump
−0.28, swayArms −0.24, jump −0.22; praise unmeasured); only nod, stomp and beckon clear, and
no hand-vs-head clearance exists in the knight code (`clampPlates` is pauldron-vs-helmet,
`knightClear.js` arm-vs-scenery). In order: (a) a NEWT rest map for `measureRig` (a virtual
spine folded into `Chest`, the hand rest at the forearm tip, K = 1.72/6.255, the shoulder's
52 % share overridden, `knightSolve.js:159-185`), the world deltas applied by the 15-line
`knights.js apply()` formula (`:1798-1821`), ~40 lines; (b) a pose layer in `character.js`:
extend `update()`'s saved sets (`:743-749`, the 3 look and 12 limb bones restored before
`mixer.update` and saved after) with `Bone` (the hips, quaternion and position) and
`Bone.001`, then apply the solved deltas after the restore, slerped by a weight, before
`limp()`/`applyLook` (`:828-848`), ~30 lines, weight 0 bit for bit the toy; (c)
`newtDance.js` (~40 lines): on `onEvent('look')` (every `lookBars` and two bars after a drop,
`director.js:977-981`) pick nod or stomp through `dance()` or beckon through `gesture()`
(`knightGestures.js:440-455,68,268,478`) for four bars; `fire.pulse(s)` advances the beat;
fade in over Idle, out into Sit. Later: a `headRoom()` post-pass beside `floorArms`
(`knightBody.js:229-256`) pushing a hand out along the shoulder→hand ray, then a feel pass
over the eleven intruding moves and nine gestures, with leave to drop any. Skipped: seated
paths, `helm`, the praise wind-up (they use `DEFAULT_RIG` through defaults), `spin`'s stance
(`DEFAULT_RIG.pos.footL.x`, `knightGestures.js:665`), formations.

## The show, moment by moment

`start`, `silence`, `breakdown`, `build`, `return` and `drop` are in `f.events`
(`director.js:712-761`); `arm`, `stage`, `dropfx`, `look` and `bar` come through `onEvent`.
Letters need Auto Drops on (`wantArm = settings.autoDrops && !fire.holding`, `:714,724`);
`phraseBars` (`settingsMap.js:247`, default 16) is the quick letters' cadence knob. The code
behind each moment is in [The music](#the-music) and the roles below; here, what you see and
the line it fires.

1. **No music.** NEWT idle on the paper, wandering (Wander on, `bounds` = the page, `play.js
   bodyStep`). Line: `idle`, `wander`.
2. **Music start.** A sealed letter floats in at the page's centre; 14 petals flurry, 24
   swirl round it; NEWT walks in from the page's edge: he starts at a side spot and a floor
   tap at the centre (a `GestureEvent` with `floor`, `brain.js:697-702`) walks him there; no
   fade exists (the toy reveals him with a DOM backdrop this world drops). Line: `walkTo`.
3. **First downbeat** (`f.locked` and beat 0; else 4 s after start: a downbeat exists only
   once the tempo locks, `tempo.js:26-31`). The seal glints and blooms into 9 petals, the flap
   lifts, 30 petals pour out; a downbeat later the letter burns (220 specks) and the swirl
   flings; NEWT waves at the camera (`brain.step({ …, button: 'Wave' })`). Line: `wave`.
4. **Groove.** He wanders; the swirl goes round him and petals wake off him; on every kick
   the swirl breathes in (radius scaled by 1 − 0.2·s, easing back over a beat: `fire.pulse` →
   `petals.setSwirlScale`, R5); on accents a small ring of petals at his feet. Line: `idle`.
5. **Phrase line** (every `phraseBars`, in the groove, nothing held, once the tempo locks:
   `director.js:988-995` runs with `period` and `groove`; an unlocked track keeps the start
   and breakdown letters only). A quick letter lands within his reach, opens on the beat the
   director timed, spills petals at his feet, burns. Line: none (a walk to a side spot is
   Later).
6. **Breakdown.** A sealed letter floats in and stays (`arm()` → `equip({ hold: true })`),
   bobbing on the beat (`p.bob` replaced by the beat phase; the scene only adds it,
   `envelopeScene.js:737-747`); the swirl leaves him for it; he sits (Sit) and watches; the
   camera holds. Line: `sitDown`, then `sitting` on the 20–40 s clock.
7. **Long breakdown** (`breakdownFor` ≥ 8 bars × the locked period). He gets the tablet out
   (Device; from sitting: `deviceSit`, `brain.js:401-403`). Line: `device`.
8. **Build stages 1–2.** The letter lifts toward the camera and brightens on each kick
   (`hoverLook`, `uBright`); the seal glints (`sealGloss`); at stage 2 he stands: Sit again,
   only while `out.state` is seated (`SITTING`/`LYING`, `brain.js:238-239`; Sit is a toggle,
   `:745-747`). Line: `standUp`.
9. **Build stage 3.** The seal cracks ahead of the drop (`sealBloom(max(p.bloom,
   lift·0.14/0.45))`, `lift` = `f.build`, no second `emit('bloom')`); a ring of petals round
   the letter (`fire.ring(0.5)`); he runs across the view (Run runs him from a spot beside
   him, square to the camera, `brain.js:445-458`; running from the letter would be a stress
   flee with the letter's spot as `floor`, `:695`, an alternative for F1). Line: `flee`.
10. **Build stage 4** (or `f.build` ≥ 0.9). The letter opens and hangs open, pulsing (opening
    0.85 s → waiting, the 0.9 s pulse); sparks are petals off his trail. Line: none.
11. **Blackout** (90 ms, big drop after stage ≥ 2, not under reduced motion,
    `director.js:726`). Everything hangs: `glitch.blackout` → `petals.step(0)` and
    `character.update(0)`, new behavior on an existing flag. No button (K9). Line: none.
12. **Drop, big, letter held.** The letter burns on the strike frame (`release(3)` → `ready`
    → fading; a letter still floating or opening is opened first and burns 0.85 s late,
    Risks); the page turns to the next color behind the burn edge (`pageTurns: 'drops'`); the
    element bursts at his feet (a fire ring scorching the paper, a lightning ring crackling
    off the letter on dark pages, or ice with crystals); drop hits and a look burst; he is
    lifted and tossed, lands (a grab then a release `GestureEvent` one frame apart with a
    toss, `bodyStep`'s `released`, `collar`/`target` supplied; `grounded` from `bodyStep`;
    brain held → fall → land, `brain.js:703-713`). Line: `pickedUp`, `dropped`, `landed`.
13. **Drop, big, nothing held.** On the strike frame the element bursts at his feet, a ring
    of petals, drop hits; he startles (Spook); the page keeps its color; a quick letter
    arrives after the bar and opens on arrival (it cannot open and burn within a bar: arrive
    0.55 + opening 0.85 + dissolve 0.9 s against a 1.875 s bar at 128 BPM). `hit()`'s
    same-weapon `equip` is answered at once with `instant` true, the letter played as a
    picture. Line: `spook`.
14. **Drop, small.** A ring of petals, a small element ring, a `tap` `GestureEvent` on him: a
    wave or a startle; four close small drops and he flees for a moment (a tap adds stress 1,
    at 4 he runs, `brain.js:93-97,676-679`; a tap inside a reaction's first 0.6 s is ignored,
    `:684`: on character, not a bug). Line: `wave` or `spook`; `flee` after four.
15. **After the drop** (8 bars). Looks at full strength; the swirl re-forms round him; he
    dances (D3). Line: none.
16. **Back in** (`return`, no drop). The held letter drops off the page on the next downbeat
    (the director sets `heldSince = 0`, `:742`, and strikes on the next bar; the world saw
    `return` first and marks the letter dismissed, so `release` calls `env.skip(t)`, 0.45 s,
    which works from floating, opening and waiting, `envelope.js:558-566`, with `onImpact(…,
    false, …)` when it is gone); he stands up (Sit again only while seated). Line: `standUp`.
17. **The end** (`silence`). Petals shrink away (`petals.cut(0.35)`); he lies down with the
    tablet: Device once (from standing: `sitDown` with the tablet → `deviceSit`, the `device`
    line on arrival, `brain.js:394-410`), Device again once `deviceSit` is reached and the
    bubble is down (`lieDown` shares priority 2 with `device`, `speech.js:85-86`; one of the
    two is accepted if the track ends sooner); a sealed letter floats in and stays, and the
    next track's `start` finds it. Line: `device`, `lieDown`.
18. **Camera.** The bonfire's shots, rigs and transitions as they are: the origin is where he
    and the letter stand; rigs that follow `fire.blade` follow the letter while one is on the
    page, else his chest; close shots make him talk (`talk.step({ camera: { yaw, zoom } })`
    from the view). Line: `zoom` (`spin` needs 1.25 turns in 3 s, `speech.js:157,347-355`;
    the shots turn 0.035–0.05 rad a beat, `camera.js:81,86`: unreachable, left out).

Reduced motion: the director skips the blackout (`director.js:726`), the letters take
`createEnvelope`'s `reduced` path (`envelope.js:513-523`), the toss is a short drop with no
arc, the petals step as the toy's do. Letter cadence: one letter at the start, one per
breakdown, one per phrase line in the groove and one at the end; `forging` keeps them from
stacking. F1 judges whether that is too many on a phone and may raise this world's
`phraseBars`; on a 16:9 phone canvas the letter is small at the toy's scale, so F1 also sets
its world size against NEWT's height on the Wide shot.

### The envelope's roles

Four roles are the envelope's; the fifth is NEWT's. (1) **The opening and the closing**:
`start` (opened on the first downbeat, a 4 s fallback) and `silence` (a sealed one floats in
and stays); the toy's intro on the world's page, seen from the back, the monogram seal placed
on the pass's texel grid (`sealOnScreen` with the pass's `size.w/h`, `envelopeSeal.js:341-353`;
off the grid it shimmers, the 5028c51 bug); on each kick the floating letter lifts and
brightens a little (`hoverLook`), its glint on the accent (`sealGloss`); ~30 new lines in
`newtMoments.js`. (2) **The held letter**, a breakdown's promise: `arm()` → `equip({ hold:
true })`; sealed, bobbing on the beat, the swirl round it, the seal cracking at stage 3, open
and pulsing from stage 4, burning on the strike frame; the held and dismissed paths, ~50 new
lines; if a build never reaches stage 4, `release` calls `open()` and the burn lands 0.85 s
late (Risks). (3) **The quick letter**, phrase lines and un-held drops: `forgeIn` and `hit()`;
within his reach, opening on the timed beat (or on arrival after an un-held drop), spilling
at his feet and burning; the same machine on the paced clock, ~15 new lines. (4) **The page
turn**: a held letter burning on a big drop while `pageTurns` is On Big Drops, never a phrase
line, an un-held drop or `setScenery`; the next page in the list appears behind the burn
edge, nothing else moves: a `TIMES.clear`-length crossfade of `voidColor`, the plane's color
and the palette, ~20 new lines in `pages.js`. (5) **The thing NEWT reacts to**: he walks in to
the first one, looks at every letter while it floats (`applyLook`), sits for it, stands for
it, runs at stage 3, is tossed when it burns; no new behavior.

### Page colors

`page`: White (the toy's), Cream, Rose, Sky, Mint, Dusk, Night. `pageTurns`: Off / On Big
Drops. The default page is a venue choice: White on a phone, Dusk or Night on a wall, where
the glowing effects and the fireflies live; the start screen's World switch shows the page,
so a VJ sets it before the set; S1 picks the shipped default. Each entry in `newt/pages.js`
gives the page color, the ink for palette[0] (`INK` 0x3a332d on light pages, a pale ink on
Dusk and Night: it is the outline color, `pixelPass.js:387`) and the 16 slots, laid out on
the bonfire's meaning so the looks keep theirs (`render.js:29-43`; Color Cycling rotates
slots 5–8, `pixelPass.js:193-197`; `quantizeSteel` and the few-color rolls read 5–8 as the
ramp and 9 as its shade): [0] ink, [1] page, [2–4] `PAPER`, [5–8] a four-step red ramp (the
three `WAX` plus `PETAL[0]`, `uCore` the lightest), [9] the reds' shade (`PETAL[2]`), [10–15]
NEWT's six tones; the element's accents come from the fx layer. The Cycle look then turns the
wax, never him; the few-color rolls read as ink, red and paper; the gradient tables index
slots 1–9. The palette goes to `setPalette` as sRGB hexes, as the bonfire's does
(`pixelPass.js:932-937` converts; quantization is in sRGB, `:364`; it takes up to `MAX_COLORS`
16, where the bonfire writes 10). Fireflies only on Dusk and Night; effect `lights` 0 on
light pages (31 point lights buy nothing on a Lambert page). On light pages the duck
substitutes the element: `equip(w, flame, { element: 'lightning' })` becomes fire or ice
(lightning has no normal-blended part, `bolts.js:126`); lightning returns on Dusk and Night,
or with the ink mode (Later). S1 counts whether he reads in six slots; if not, K3's next
choices.

### Lines

All 19 triggers stay in `invitation.lines`, with their chances and cooldowns in
`invitation.speech` (`speech.js:204-243`), read through `src/invitation/content.js` (never
`content.json`); a trigger fires from the same BrainOut transition as in the toy
(`speech.js:284-338`):

| Trigger                         | Behavior in the toy                  | What does it in the world                                                                     |
| ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `wave`                          | Wave button, or a tap on him         | Wave as the opening letter burns; a tap on small drops                                        |
| `spook`                         | Spook button, or a tap               | Spook on an un-held big drop's strike; a tap on small drops                                   |
| `flee`                          | Run button; stress                   | Run at build stage 3; four taps in a row on small drops                                       |
| `pickedUp`, `dropped`, `landed` | grab, release, the fall, the landing | a grab then a release `GestureEvent` at a held letter's strike, `bodyStep` reports `grounded` |
| `walkTo` / `wander`             | a floor tap within 4 s / Wander on   | the floor tap at the start that walks him in; Wander on in the groove                         |
| `sitDown` / `sitting`           | Sit by himself / the 20–40 s clock   | Sit at a breakdown, `null` to `talk.step`                                                     |
| `standUp`                       | standing from Sit                    | Sit again at stage 2 and on `return`, only while seated                                       |
| `device`, `lieDown`             | Device once, Device twice            | Device in a long breakdown; twice at silence (the second once the first line is down)         |
| `idle`                          | the clock in the groove              | nothing to do                                                                                 |
| `zoom`                          | within 0.62 of home                  | `camera.zoom` = the view's distance to his chest over the Wide shot's; close shots reach it   |
| `spin`                          | 1.25 turns in 3 s                    | unreachable from the show's cameras (0.035–0.05 rad a beat, `camera.js:81-106`); left out     |
| `caught`, `shaken`, `thrash`    | a pointer's hold                     | only if the carrier (C1) ships                                                                |

## Consolidation

Code moves when a second place needs it and the move is a real duplicate. The toy imports
nothing outside `src/invitation/`; the other direction is open and used
(`admin/ui/invitationSchema.js`, `src/contentRules.js`). "No behavior change", for every R
task, means: the named tests green with no assertion loosened; every moved symbol listed old
path → new in the PR; a re-export shim wherever a test pins the old path; the move as a
commit of its own with nothing else in it (CONTRIBUTING › Commits); the named e2e specs green
in CI. `math.js` has no seeded rng; the rng's twin is in `bolts.js`.

| Duplicate                                                                          | Action                                                                                                                                                                                                                                                                                         | Path                              | Effort | Risk                                                                                                                                           | Evidence                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `invitation/rng.js createRng` ↔ `bonfire/bolts.js seeded()` (identical mulberry32) | `bolts.js` imports `createRng`, re-exports `seeded = (seed = 0) => createRng(seed)` and keeps `hashSeed` (K12)                                                                                                                                                                                 | `src/bonfire/bolts.js`            | small  | low: `test/rng.test.mjs` proves the same sequence bit for bit; `scenery.js:76-83` and `summonSign.js:285` keep their LCGs (different sequences) | `bolts.js:21-31`; `rng.js:9-18`; `plasma.js`, `swingTrail.js`, `lightningRing.js`, `forgeRun.js`, `ice.js` import from `bolts.js` |
| JS sRGB → linear (`paletteGen.js toLinear`, `ruleBasics.js`)                       | export `toLinear`/`toGamma` from `paletteGen.js`; `pages.js` imports it                                                                                                                                                                                                                        | `src/paletteGen.js`               | small  | none                                                                                                                                           | `paletteGen.js:27-28`; `ruleBasics.js:60`                                                                                         |
| The envelope's picture would be copied into the world                              | extract the actor: the Group, `piece`, `buildEnvelope`, `buildSpecks` and the envelope half of `frame()`/`placeSeal()`; it imports `buildSeal`/`sealOnScreen` from `envelopeSeal.js` as the scene does; the scene keeps the DOM, `buildCompose`, the ink, the drag, cues, backdrop and input | `src/invitation/envelopeActor.js` | medium | low: the toy's envelope unit tests and `e2e/invitationEnvelope.spec.mjs` unchanged                                                              | `envelopeScene.js:123-213,713-775,815-872`; `envelopeSeal.js:341,413`                                                             |
| The pass's per-frame writes in `sceneUpdate.js`                                    | after W1: split the glitch-to-uniform table, `uTime`, ripple, `uCenter` from a point; W1's copy is the oracle                                                                                                                                                                                   | `src/bonfire/passWrites.js`       | small  | low: `test/passWrites.test.mjs` on a fake pass                                                                                                  | `sceneUpdate.js:69-125,376-386`                                                                                                   |
| The frame loop, gate, stats, capture and teardown in `scene.js`                    | after W1: split; `scene.js` and `world.js` call it                                                                                                                                                                                                                                             | `src/bonfire/frameLoop.js`        | small  | low-medium: `test/frameLoop.test.mjs` on a fake loop; the `smoke` and `scenes` e2e shards judge it                                               | `scene.js:104-139,549-626,735-779`                                                                                                |
| Not duplicates, left alone, headers say so                                         | `dust.js` ↔ the impact puff (closed-form seeded vs stepped random); `governor.js` ↔ `frameGate.js` (+ `record.js frameEvery`); `retro.js` ↔ `pixelPass.js` (different rules, 17 tests); `invitation/camera.js` ↔ `ui/orbit.js`; the shake sines in `camera.js` and `view.js`; both `markup.js` and both `render.js` (name clashes: tasks spell full paths); the world's `setRender` copy of `applyRender` |                                   | none   | none                                                                                                                                           | the accepted-copy pattern: a test holding two copies together, `test/invitationLink.test.mjs:1-10`                                 |
| Deferred                                                                           | Bayer (seven definition sites in two conventions 1/32 apart, no test catches a dither shift); the dissolve GLSL chunk (same noise family, different sums and rims, a JS twin pinned by e2e); the toy's one-liners (`clamp`, `clamp01`, `smooth`, `lerp`, `TAU`, `wrap`: 20 definitions in 11 files; an in-toy `src/invitation/math.js` with a bit-for-bit test like `test/math.test.mjs:1-24` when a PR touches them) and a `worldPerPixel` (nine sites; `invitationRing.test.mjs:97` first); jscpd; `no-restricted-imports` |                                   |        |                                                                                                                                                |                                                                                                                                   |

Guards (G1): `test/newtImports.test.mjs`, modelled on `invitationContent.test.mjs`, lists
what `src/visualizer/newt/*` may import (and that `main.js` reaches `newt/` only through
`import()`, and `world.js` reaches `fireflyModel.js` only through `import()`), and its mirror:
nothing under `src/` other than `src/visualizer/newt/`, `src/contentRules.js` and
`src/bonfire/bolts.js` (`rng.js` only) imports `src/invitation/` (today only
`contentRules.js`, the admin and tools do; `src/painter/`, `src/scenes.js` and
`src/sceneStore.js` are inside the rule). It runs in `npm run check`. The chunk guard is the
repo's existing pattern, a build plugin: a `liveLoad(bundle)` beside `unlockLoad` in
`vite.config.js`, called from `firstLoadGuard` (`:162-181`) with `this.error` when the
`visualizer` entry's first load (`firstLoadModules(bundle, 'visualizer')`) names a
`src/invitation/` or `src/visualizer/newt/` module; `test/newtChunk.test.mjs` checks
`liveLoad` on a fake bundle the way `test/gate.test.mjs:455-489` checks `unlockLoad`. The
real check runs in CI's build job on every PR (`npm run check` never builds).

## Delivery plan

One PR each, at most ~12 files and ~400 changed lines with tests. On every PR: `npm run
check`; `npm run coverage` (CI runs it on Node 22 and 24 over every file, `.c8rc.json` `all:
true`: lines and statements 70.4 %, functions 85.8 %, branches 90.2 %; PR #41 failed at
70.27 %; a PR adding a module no unit test can load, `world.js`, lowers a threshold by hand
in the same commit and says why, `tools/coverage-ratchet.mjs:1-4`; when coverage rises,
`npm run coverage:ratchet` and commit); no new `@ts-nocheck` (45 of 45 used); the named spec
where the Live UI changes; "no behavior change" where marked, as
[Consolidation](#consolidation) defines it. Codex cannot run Playwright (PRs #37, #25): CI's
five shards are the e2e signal, one 30–40 min round trip per PR, so the seams are small; until
CI runs, the node tests stand in (`vizPage` for the HUD's markup, `vizSettings`/`settingsMap`
for the dialog, `newtWorld` for `smoke`, `invitation*` for the toy's specs). Each task's
scope is the section its block names; its finish line is what Codex pastes.

| #   | Task                                                      | Who            | Days | Depends on  |
| --- | --------------------------------------------------------- | -------------- | ---- | ----------- |
| S1  | Pipeline spike                                            | Claude         | 1    |             |
| S2  | Carry spike                                               | Claude         | 0.5  |             |
| R1  | The rng and `toLinear` (no behavior change)               | Codex          | 0.5  |             |
| R2  | `envelopeActor.js` and the look seam (no behavior change) | Codex          | 2    |             |
| R3  | `passWrites.js` and `frameLoop.js` (no behavior change)   | Codex          | 1    | W1          |
| R4  | `character.js` `dress` (no behavior change)               | Codex          | 0.5  |             |
| R5  | Petal seams (no behavior change in the toy)               | Codex          | 1    |             |
| R6  | Firefly and lightning seams (no behavior change)          | Codex          | 0.5  |             |
| W1  | The world scaffold                                        | Codex          | 2    | S1, R4      |
| W2a | The letters                                               | Codex          | 2    | W1, R2, R5  |
| W2b | NEWT's reactions                                          | Codex          | 1.5  | W2a, S2     |
| W3  | Settings, start screen, HUD                               | Codex          | 1.5  | W1          |
| W4a | Element rings and marks                                   | Codex          | 1    | W1, R6      |
| W4b | Fireflies on dark pages                                   | Codex          | 1    | W4a         |
| W5  | The bubble and the lines                                  | Codex          | 1    | W2b         |
| G1  | The guards                                                | Codex          | 0.5  | W1          |
| D1  | NEWT's rest map and the retarget harness                  | Codex          | 1    |             |
| D2  | The pose layer (no behavior change at weight 0)           | Codex          | 1    | D1          |
| D3  | `newtDance.js`: the three that clear                      | Codex          | 1    | W2b, D2     |
| C1  | Optional: the carrier                                     | Codex          | 2    | W2b, S2     |
| P1  | Optional: the page burn                                   | Codex          | 1    | W4a         |
| L1  | Optional: the lock gate                                   | Codex          | 0.5  | W3          |
| F1  | Feel pass                                                 | Claude, Newton | 1    | W3, W4a, W5 |
| X1  | Docs                                                      | Codex          | 0.5  | F1          |

**S1** (Claude; it copies `buildEnvelope`/`buildSeal` into a scratch script, so R2 is no
dependency): what Verification lists, on White, Cream, Dusk and Night, with
`painter/beat.js`'s silent 16-bar loop for the clip. Finish line: screenshots committed under
`docs/design/captures/newt-live-s1/` (PNG only, ≤ 200 kB each; a new folder, the first
captures in `docs/`), clips attached to the S1 issue as the PR template asks, a note with the
slot counts; Newton picks K3's branch, the ink per page and the default page.

**S2** (Claude): a node script over `createBrain` + `play.js bodyStep` with a supplied
`collar`/`target` and no pointer (`play.js:110-125`): does a grab, a release with `released`
and `grounded` fire `pickedUp`, `dropped`, `landed`; does a held target above him read as a
lift. Finish line: the script and its printout in the S1 folder.

**R1** (K12; `src/paletteGen.js` exports `toLinear`/`toGamma`, `:27-28`). Finish line:
`test/rng.test.mjs` (new): same seed, same sequence from both callers, bit for bit; `seeded()`
with no seed still seeds 0; `test/invitationContent.test.mjs` unchanged; `npm run check`.

**R2** (the actor row of the Consolidation table, the actor driven by `pose(t)`, the hover
look, the bloom and the dissolve fraction, running without a renderer; the `mark`/`linear`
seam of Drawing on `envelopeLook.js toon()`/`shared()` and `buildSpecks`, defaults 1.0 and
off). Finish line: `test/invitationEnvelopeActor.test.mjs` (new, three.js in node, no WebGL):
`createEnvelopeActor({ size })` builds the same part count and ids as before; `pose(t)` from
`createEnvelope` places the group and the seal on the texel grid (`sealOnScreen(tw, th)`)
with the same numbers `envelopeScene.js frame()` wrote; `invitationEnvelope`,
`invitationEnvelopeShape`, `invitationEnvelopeSeal`, `invitationLook` green;
`window.__invitation.envelope()`'s snapshot shape (state, pose, seal first/last, petals)
unchanged, which `e2e/invitationEnvelope.spec.mjs` waits on; `npm run check`; `npm run
coverage`; `npm run e2e -- invitationEnvelope invitationPetals`; every moved symbol listed
old → new in the PR.

**R3** (after W1, whose copies are the oracle; the two split rows of the Consolidation table;
`sceneRender.js` is not split). Finish line: `test/passWrites.test.mjs` (new): on a fake pass
(`{ uniforms }`) a recorded `glitch` object and `size` write the same uniform values the copy
did; `test/frameLoop.test.mjs` (new): on a fake animation loop the gate (`frameGate.js`)
skips the same frames, `onTick` runs every loop frame and `onFrame` only drawn ones, teardown
unsubscribes; `npm run check`; `npm run coverage`; `npm run e2e -- smoke live-settings scenes
newt-world` is the behavior proof.

**R4** (`createCharacter` takes `dress`, a material factory, default the toy's `markId` toon;
`pixel: false` is the snap-off, nothing new; `device.js` and `earrings.js` keep `markId`).
Finish line: `invitationCharacter*`, `invitationModel`, `invitationDevice`,
`invitationEarrings` green; a test in `test/invitationCharacter.test.mjs` on
`test/lib/newtStandIn.mjs` that the default dress builds the same materials; `npm run
check`; `npm run e2e -- invitation`.

**R5** (`petalScene.js` takes `tones`, `mark`, `linear`, defaults `PETAL`, 1.0, off;
`petals.js` takes `setSwirlScale(k)`, default 1, read by `swirlSlot`, `:91-106,337-341`, and
resets `pourAt`/`emitted.pour`, `:423,752,887`, when a new floating frame arrives). Finish
line: `invitationPetals`, `invitationPetalLayer` green; new tests in
`test/invitationPetals.test.mjs`: two letters, two pours; scale 1 bit for bit the old swirl;
`npm run check`; `npm run e2e -- invitationPetals`.

**R6** (`fireflies.js`: a `pois` option, default the ruins' `POIS`, `:44-50`; `terrain` and
`raycast` are already options, `:62-76`; `lightningRing.js`: a `source` option for the
crackle bolts' start, default `(origin.x, ballHeight, origin.z)` with `ballHeight` from
`effects.lightning.height` as today, `:71,106-122,301`). Finish line:
`test/fireflyInstances.test.mjs` extended: `pois` given replaces the ruins' points, omitted
the same five; `test/lightningRing.test.mjs` (new): with no `source` the first crackle bolt
starts at `(origin.x, effects.lightning.height, origin.z)`, with `source: () => Vector3` at
that point, default sequences bit for bit on a fixed rng; `npm run check`; `npm run e2e --
smoke`.

**W1** (after S1, R4; `world.js` and `pages.js` as Drawing and Page colors say; `fireDuck.js`
with every member The music lists and a letterless stub: `equip` resolves and calls the
four-argument `onImpact` after `swapTime`, at once for a same-weapon or `instant` equip,
`release` returns `holding`; `main.js` as Choosing and loading says; `world`, `page`,
`pageTurns` in `DEFAULT_SETTINGS` (`director.js:111-204`) and `CHOICES` (`settings.js:110-120`),
`world` in `LOCAL` (`:122`)). Finish line: `test/newtWorld.test.mjs` (new): `fireDuck.js`
imports no three.js (its specifiers read as `invitationContent.test.mjs:88-90` does); every
member reached as `fire.`, `ctx.fire?.` or `candidate.` across `src/visualizer/*.js` (not
`newt/`), found by regex at run time, plus `canvas` and `onRendered`, exists on the duck;
`createDirector(duck, { settings: settingsWith({ world: 'newt' }), scenes: () => [], onEvent
})` then `bars(director, 64, …)` from `test/lib/fakeScene.mjs`, `bars(…, { state:
'breakdown' })`, `bars(…, { state: 'build' })` and one `director.update({ ...FRAME, events:
['drop'], drop: 'big', locked: true, bpm }, 0.016)`: no throw, `equip` with `hold: true` then
`release` on the duck's call log, `onImpact` called with four arguments and `main.js
onImpact` run on them with no throw; `test/vizSettings.test.mjs`: a save with `world: 'x'`
and one with no `world` both load as `'bonfire'`. `e2e/newt-world.spec.mjs` (new):
`goto('/visualizer/?world=newt&bench')` (`?bench` puts `window.__viz` on the page; nothing
reads `?test` in `src/visualizer`); wait on `[data-stage].is-ready`; click
`[data-source="demo"]`; press `A` then `Space`; poll `window.__viz.fire.snapshot()` with
`expect.poll` for `holding` true then false (states, never durations);
`document.documentElement.dataset.flame` set; no `pageerror`/console errors
(`smoke.spec.mjs`'s `watch()`). `npm run check`; `npm run coverage` (lower a threshold by hand
for `world.js` if it must, and say why).

**W2a** (after W1, R2, R5; `newtMoments.js` owns the letters as The envelope's roles says,
with the petal emits and the four-argument `onImpact` when a letter is gone; `fireDuck.js`
loses its stub; `world.js` binds the actor and the petal scene). Finish line:
`test/newtMoments.test.mjs` (new) on a fake clock: start opens on the first downbeat and
after 4 s unlocked; a breakdown holds a letter; stages lift and crack it; stage 4 opens it;
the strike burns on its frame and the page turns when `pageTurns` is on, never on an un-held
drop; `return` skips it (after stage 2 as well); silence leaves a sealed one; a phrase-line
letter in the groove opens on the timed beat and never comes while one is `forging`; two
letters, two pours. `e2e/newt-world.spec.mjs` extended: two frames of a floating letter one
tick apart, the seal's texels identical (the 5028c51 check). `npm run check`; `npm run
coverage`.

**W2b** (after W2a, S2; the real brain and talk in `world.js`; `newtMoments.js` emits the
buttons and gestures of moments 2–3, 6–9, 12–14, 16–17 and the blackout freeze). Finish
line: `test/newtMoments.test.mjs` scenarios: each press and event on the right frame;
`return` after stage 2 presses nothing; the blackout freezes; the strike's grab and release
drive the brain held → fall → land (`brain.js:703-713`) with `bodyStep` given
`collar`/`target` and `released` a short toss. Fallback written in, if S2 shows even that
does not hold: the drop has no line in v1 and this block says so (a Land clip restarted
without the brain passing `fall` fires nothing: `landed` needs `land` after `fall`,
`speech.js:313-314`). `npm run check`; `npm run coverage`. This is the first clip (below).

**W3** (after W1, rebasing on it: both touch `main.js`, `settings.js`, `dialogs.js`).
`src/settingsMap.js` (imports nothing: page and world names are literals there): the `world`,
`page` and `pageTurns` rows in Show (Title Case labels, hints 12–160 chars); a `worlds?:
('bonfire'|'newt')[]` field on entries (default both); `blockedBy` (`:1696`) returns
"Bonfire only" when the entry's `worlds` excludes `settings.world`, before the entry's own
`needs` (one `Need` per entry, `:30-34`); bonfire-only: the Weapons group (with one weapon
enabled `nextWeapon()` has nothing to draw, `director.js:330`), the Cast and Scenes tabs'
rows, Scenery, Fog, Edge Glow; the Auto Drops hint says letters need it. `start.js`: the
World switch beside the presets (`:97-104`). A `data-world` attribute on `<html>`; CSS hides
the Living Weapon button, the Dance button (until D3) and the pack in the newt world
(`markup.js:137-153`; `packUi.js:18-30,64`); no relabels, no keys variant (A floats a letter,
Space strikes it; the weapon label shows the letter's name). `main.js`: `ctx.loopLibrary`
returns `[]` while `settings.world === 'newt'` (`scenesUi.js:43,115-132`; `main.js:242,373`).
Finish line: `vizSettings`, `vizPage`, `vizSearch`, `settingsMap` tests (every bonfire-only
key named above carries `worlds: ['bonfire']`); `npm run e2e -- tips-live live-settings` (the
nine tab ids unchanged); `e2e/newt-world.spec.mjs` extended: no `.viz-scene-chip`, the pack
hidden; `npm run check`.

**W4a** (after W1, R6; the `page` key exists since W1, so W3 is not needed for the Night
e2e). `newt/elementRings.js`: the N3 factories (`createLightningRing` with `source` the
letter's frame; `createGroundMarks` on the Lambert page), each with an owned origin Vector3
at his feet, `reach = () => pageHalf`, lights 0 on light pages; `ring()`/`scar()` bodies
copied from `sceneFire.js:49-61,163-206` (ctx-bound, not importable) into a ~60-line facade
the duck's `ring` and the drop's `dropfx` call. Finish line: `test/newtRings.test.mjs` (new):
each factory on its default flat ground (`createImpactFx` has no ground option,
`impact.js:80-94,237`; `createLightningRing`'s `ground` is a function defaulting to `() =>
0`, `lightningRing.js:31-42`; `createDebris`/`createChill` take theirs through their setter,
`debris.js:43`, `chill.js:27`), an owned origin at his feet and `reach = () => pageHalf`,
stepped 2 s with no NaN in their positions; `marks.patch` loads on a `MeshLambertMaterial`
(`marks.js:252-259`; it needs `OffscreenCanvas`, skipped where node has none); on White,
`equip(…, { element: 'lightning' })` builds a fire or ice ring. `e2e/newt-world.spec.mjs`
extended with a drop on Night (the `page` key seeded through `localStorage['bonfire-live']`
as `tips-live.spec.mjs:33-36` does). `npm run check`; `npm run coverage`.

**W4b** (after W4a; droppable to Later if S1 shows the halos do not read).
`newt/fireflyModel.js` loads `bonfire.glb` lazily on the first dark page with `GLTFLoader`
and returns its `Firefly` node only (`sceneModel.js:176-177`; nothing else from the GLB
enters the scene), behind a dynamic import; `createFireflies` with the flat `terrain` stub
from `test/fireflyInstances.test.mjs:25-43`, `raycast: () => null`, `pois` on the page's
corners and the letter, `center` = NEWT; `fireflyShow.js`/`fireflyMoves.js` as they are.
Finish line: `fireflyInstances` green; `test/newtImports.test.mjs` asserts `world.js`
reaches `fireflyModel.js` only through `import()`; `e2e/newt-world.spec.mjs`'s Night drop
shows `snapshot().fireflies` true; `npm run check`.

**W5** (after W2b; the bubble as Drawing says, `output.js` exposing `mirror(el, key)` on
`ctx`; the lines through `content.js`). Finish line: `test/newtLines.test.mjs` (new): the
real brain and talk on a fixed seed over W2b's scripted show, with a fixture `speech` whose
every chance is 1, every cooldown 0 and the quiet spell 0, lines two per trigger from the
fixture (never `content.json`), the expected order asserted as a subsequence in the order
W2b's script produces them (`walkTo`, `wave`, `sitDown`, `device`, `standUp`, `flee`,
`pickedUp` or `dropped`, `landed`, `spook` on an un-held drop, `lieDown`), `sitting` and
`idle` excluded (they ride the 20–40 s clock); `invitationBubble` green with a
`getComputedStyle` test that scale 1 leaves the toy's sizes; `e2e/newt-world.spec.mjs`
extended: open the output window and see `[data-mirror="bubble"]` appear on a line and go;
`npm run check`.

**G1** (after W1; Consolidation › Guards). Finish line: `test/newtImports.test.mjs` and
`test/newtChunk.test.mjs` (both new, both in `npm run check`) each failing on a planted
import; a planted static import of `src/invitation/content.js` from `main.js` fails `npm run
build`; `npm run check`.

**D1** (step (a) of The knights' animations, in `newt/newtRig.js`, pure). Finish line:
`test/newtRig.test.mjs` (new, `[slow]` in its title: `test:fast` skips it, `check` and CI run
it): NEWT's rig from `newt.glb` through `test/lib/glbAnim.mjs`; `assertSound`/`assertLimits`
moved into `test/lib/poseChecks.mjs` taking `{ solver, rig }` (a move,
`knightPose.test.mjs:52-99` unchanged in behavior); a `clearanceOf(pose)` of its own that
applies the solved world deltas to the stand-in's bones (the `knights.js apply()` formula)
and measures hands and sleeves against the skinned head meshes with
`skinnedMesh`/`nearestDistance` moved from `invitationModel.test.mjs:238-257` into
`test/lib/` (its `clearance()` is private and samples glb clips, not poses); every move and
gesture 0 NaN inside the limits; nod, stomp, beckon ≥ 0.1 model units from the head; the
rest named in a `KNOWN_INTRUDING` set the test asserts against, so the later head pass flips
them one by one; `npm run check`.

**D2** (after D1; step (b) in `character.js`, ~30 lines). Finish line: in
`test/invitationCharacter.test.mjs` on `test/lib/newtStandIn.mjs`: weight 0 leaves every bone
bit for bit over a clip; weight 1 applies a solved delta; `invitationCharacter*` green; `npm
run check`; `npm run e2e -- invitation invitationCarry`.

**D3** (after W2b, D2; step (c) and its binding in `world.js`; the Dance button shown again
in this world). Finish line: `test/newtDance.test.mjs` (new): the real director's
`onEvent('look')` over `bars()` picks a move for four bars and `pulse` advances it; fades in
over Idle and out into Sit; `npm run check`; a clip from Claude.

**C1** (optional, on Newton's call after S2; after W2b): the held letter lifts him by the
collar from stage 4, swings him, drops him on the strike. Finish line: `newtMoments` test
extended; `caught`/`shaken`/`thrash` reachable in `newtLines`; a clip from Claude. **P1**
(optional, on Newton's call after S1; after W4a): a page-sized quad in the toon FLAT
material, `uToLetter` over the page (`envelopeLook.js:232-243`), in place of the crossfade.
Finish line: a shader-text test; `newt-world.spec.mjs` two-frame comparison; a clip. **L1**
(optional, if Newton wants the world unlisted; after W3): a `?world` gate on the lock page
(`vite.config.js:195-201`). Finish line: `e2e/gate.spec.mjs` and `test/gate.test.mjs`
extended: `/visualizer/?world=newt` locked while the invitation's switch is on,
`/visualizer/` open.

**F1** (Claude, then Newton; after W3, W4a, W5): the default page, petal amounts, the
letter's size against NEWT on the Wide shot, letter cadence (`phraseBars` for this world),
line chances, the pour's size, Run across the view or from the letter. Finish line: Newton's
sign-off on a demo-track clip and a `painter/beat.js` loop clip, before and after side by
side, at real speed from the show's own cameras. **X1** (after F1). Finish line:
`docs/bonfire-live.md` gets a "Worlds" section (how to pick, `?world=newt`, the Page and Page
Turns settings), `docs/invitation.md` an "In Bonfire Live" note on the shared seams (`dress`,
`envelopeActor.js`, the look seam, the pour reset, the swirl scale), this file's Status to
built; hand-wrapped at ~90 columns; `npm run check`.

### The first clip, order and merge queue

The smallest show Newton can judge on a phone comes after W2b: a letter walks him in at the
start, a held letter per breakdown that he sits for and that burns on the drop and tosses
him, quick letters in the groove, a sealed one at the end, petals from every letter, the page
turning under a held burn; no settings UI beyond `?world=newt&page=…`, no element rings, no
bubble, no dances. Claude records it on the demo track and on `painter/beat.js`'s loop before
W3–W5 and the D track start, so the feel is judged before the polish is built. S1, S2, R1,
R2, R4, R5, R6 and D1 run side by side (different files); W1 after S1 and R4; then W3, W4a,
G1 and R3 side by side; W2a after W1, R2 and R5; W2b after W2a and S2; W4b after W4a; W5 and
D3 after W2b (D3 also after D2); C1, P1 and L1 only on Newton's word; F1 after W3, W4a and
W5; X1 last. PRs merge one at a time in this order; a PR that touches `main.js`,
`settings.js`, `settingsMap.js` or `dialogs.js` rebases on what merged before it (W3 on W1;
W2a on W3 if W3 merged first). Claude merges after review; Newton merges F1.

### Briefing Codex

- One task per run: this file's path, the task's block above (scope and finish line
  verbatim), "no behavior change" where the block says so, full paths
  (`src/visualizer/markup.js` is not `src/invitation/markup.js`, `src/render.js` is not
  `src/visualizer/render.js`).
- Setup: Node 22 (`.nvmrc`), `npm ci` (`node_modules` may be absent); `npm run cleanup --
  --kill` before `npm ci` if servers linger; `npm run test:fast` while working, `npm run
  cleanup` after. Nothing in `AGENTS.md`/`.codex/` reaches the repo (git-ignored). The named
  spec for anything in the Live UI, reached through `?world=newt&bench`; if the container
  cannot run Playwright, CI does, and a PR is not done until CI is green.
- Commits: a move is a commit of its own, nothing else changed in it; subject imperative
  ≤ 72 chars. The PR fills `.github/pull_request_template.md` (What and why; Captures for
  anything visible; Saved state; Checks run). Every moved symbol listed old path → new; a
  shim where a test pins the old path. Tests never pin `content.json` wording.
- Tests over ~2.5 s end their title with `[slow]` (`test:fast` skips them; `check` and CI run
  them). Harnesses: `test/lib/fakeScene.mjs` (the director in node), `test/lib/newtStandIn.mjs`
  (NEWT's skeleton in node), `test/lib/glbAnim.mjs` (`newt.glb` read).
- `src/settingsMap.js` imports nothing: page and world names are literals there. New settings
  rows: Title Case labels, hints 12–160 chars, each new effect Off / In the Mix / Always. New
  string keys go in `DEFAULT_SETTINGS` and `CHOICES`, with an old-shape `mergeInto` test.
  `src/invitation/content.js` is Vite-only: only `world.js` imports it.

An example brief, R1: "Repo: Bonfire_Portfolio, branch from `main`. Read
`docs/design/invitation-live.md`, then do task R1 only, as its block says: scope and finish
line verbatim. No behavior change: the named tests green with no assertion loosened, every
moved symbol listed old → new in the PR, the move its own commit. Setup: Node 22, `npm ci`.
Run `npm run check` and `npm run coverage` before opening the PR; fill
`.github/pull_request_template.md`. Do not touch any other task's files."

Claude's review of each PR: the scope matches the block and nothing more; the moved-symbol
list is complete and the shims are there; no new `@ts-nocheck`; the coverage output is in
the PR and no threshold was lowered without a reason; the named spec is green in CI; the PR
template is filled, with a capture for anything visible.

## Verification

- **Spikes**: S1 settles the K3 branch, whether anything additive reads on White or the
  default page is Cream or Dusk, whether the pass's depth edges ink the envelope's fans (they
  sit 0.004–0.05 apart) and whether they crease at alpha 1.0 (the look seam, R2), the slot
  count per page and the tablet under the pass; S2 settles whether `bodyStep` holds and drops
  him with no pointer and fires `pickedUp`, `dropped`, `landed`, deciding W2b's drop path and
  whether C1 is offered.
- **Unit**: `test/lib/fakeScene.mjs` (`createDirector`, `bars()`, `FRAME`) drives the real
  director over the duck; `Math.random` is replaced globally for the trace (the director
  draws it at `:322,598,602,622-624,906-907,1024`; `looks.js` and `colors.js` draw it too);
  `newtMoments.js` runs on a fake clock; the lines test runs the real brain and talk on a
  fixed seed with a fixture speech. Node tests never import `world.js`.
- **Browser**: `e2e/newt-world.spec.mjs` loads `?world=newt&bench`, waits on states through
  `window.__viz.fire.snapshot()`, drives an arm → strike cycle and, from W2a, a breakdown →
  drop, asserts no console errors and (from W3) no scene chips; the toy's `invitation*` specs
  stay green on every PR.
- **Visual**: Claude records with V (`record.js`) on the demo track and on `painter/beat.js`'s
  loop through start → breakdown → build → drop → silence on each page, at real speed, before
  and after side by side; judged as pixel art from the show's own cameras.

## Risks and open questions

- **The fx composite on light pages** reads two ways (a pastel wash, or nothing). S1 on White
  first; the fallback is a Cream or Dusk default and the glowing effects on dark pages only;
  lightning is substituted on light pages either way.
- **The 16-color budget** is exactly full. S1 counts; the cel path and the mark branch are
  the fallbacks (K3).
- **The duck lies to the director** in paths nobody traced (`pending` scenes, `recolor`,
  `fire.blade` in the rigs, the HUD's weapon label). W1's contract and trace tests, `scenes:
  () => []`, the W3 hides and the e2e's arm → strike cycle cover the known ones; unknown ones
  show as console errors.
- **The grab and release** needs `bodyStep` to hold him with no pointer. S2 answers; W2b's
  fallback is a drop with no line, said in its block.
- **A build that never reaches stage 4** leaves the held letter sealed at the strike:
  `release` opens it and the burn lands 0.85 s late. Accepted for v1; F1 judges it.
- **The 90 ms blackout as a freeze** of petals and his mixer is new behavior on an existing
  flag (`director.js:689-695` only sets `g.blackout`), not reuse.
- **The swirl is the only petal formation** and follows one frame at a time
  (`petals.js:336-347`): the held letter has it in a breakdown, NEWT in the groove; POOL 120
  caps every scene. The pour needs R5's reset or every letter after the first pours nothing.
- **The seal off the texel grid shimmers** (the 5028c51 bug). The actor takes the pass's
  `size.w/h`; W2a's e2e compares two frames.
- **Head clearance**: clap, hurrah, fistPump, swayArms and jump are 22–32 cm inside; praise
  is unmeasured. The head pass (Later) may drop moves from his list rather than force them;
  Newton decides which stay.
- **The public route**: `/visualizer/` is open while `/invitation/` is locked
  (`vite.config.js:195-201,312-314`); the world shows NEWT, the letter and his lines to
  anyone. Newton decides before W3 merges; L1 is the few-line gate.
- **Chunk weight**: nothing measures the visualizer's first load today; G1's `liveLoad` and
  W4b's dynamic `fireflyModel.js` (`bonfire.glb`, 221 KB) keep the world and the GLB behind
  their imports; the rng crossing (K12) may make a tiny shared chunk the first-load guard
  shows.
- **Shadows on phones**: off on touch as the bonfire does, with the toy's blob shadow under
  him. Open: whether Newton wants the shadow map on for this world on phones.
- **`marks.patch` on the world's page material**: it replaces `<color_fragment>` and
  `<emissivemap_fragment>` on a Lambert; verified by reading, not run. W4a's test loads it.
- **Letter cadence and page turns**: how many letters a four-minute track should carry and
  whether a page turn on every big drop is too much. F1, on the demo track, Newton's call.
- **`world` as a LOCAL key** (so a setup never switches worlds) and the precedence of
  `?world=`, `?scene=`, the Painter's Play and the saved setting (`?world` wins the session;
  `?scene=` implies the bonfire): W1 writes the rule in `settings.js`; Newton confirms.
- **The Dance button in this world** is hidden until D3 ships; the Living Weapon button and
  the pack stay hidden (nothing answers them).
- **Codex and Playwright**: every PR that touches the Live UI is one CI round trip; the seams
  are small for that reason.

## Files touched

| Area                     | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The world (new)          | `src/visualizer/newt/world.js`, `fireDuck.js`, `newtMoments.js`, `elementRings.js`, `pages.js`, `newtDance.js`, `newtRig.js`, `fireflyModel.js`                                                                                                                                                                                                                                                                                                                                        |
| Live UI                  | `src/visualizer/main.js` (the import switch, `hear`, the `onEvent` relay, `loopLibrary` in this world), `director.js` (`DEFAULT_SETTINGS` keys only), `settings.js` (`CHOICES`, `LOCAL`), `dialogs.js` (`REBUILD` + `world`), `src/settingsMap.js` (rows, `worlds`), `src/visualizer/markup.js` (`data-world`), `packUi.js`, `output.js` (`mirror` on `ctx`), `start.js` (the World switch), `visualizer.css` (the hides)                                                             |
| Bonfire seams and splits | `src/bonfire/bolts.js` (imports the toy's rng), `fireflies.js` (`pois`), `lightningRing.js` (`source`); after W1: `passWrites.js` (new), `frameLoop.js` (new), `sceneUpdate.js`, `scene.js`                                                                                                                                                                                                                                                                                            |
| Invitation seams         | `src/invitation/envelopeActor.js` (new), `envelopeScene.js` (uses the actor), `envelopeLook.js` (`mark`, `linear`), `character.js` (`dress`, the pose layer), `petalScene.js` (`tones`, `mark`, `linear`), `petals.js` (the pour reset, the swirl scale), `bubble.js` and `bubble.css` (`--bubble-scale`)                                                                                                                                                                             |
| Shared                   | `src/paletteGen.js` (`toLinear`/`toGamma` exported)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Build                    | `vite.config.js` (`liveLoad` in `firstLoadGuard`; the `?world` gate, L1)                                                                                                                                                                                                                                                                                                                                                                                                               |
| Tests                    | `test/newtWorld.test.mjs`, `newtMoments.test.mjs`, `newtLines.test.mjs`, `newtRings.test.mjs`, `newtRig.test.mjs`, `newtDance.test.mjs`, `rng.test.mjs`, `lightningRing.test.mjs`, `passWrites.test.mjs`, `frameLoop.test.mjs`, `invitationEnvelopeActor.test.mjs`, `newtImports.test.mjs`, `newtChunk.test.mjs` (new); `test/lib/poseChecks.mjs` (new, moved helpers); `fireflyInstances.test.mjs`, `vizSettings.test.mjs`, `settingsMap.test.mjs`, `invitationPetals.test.mjs`, `invitationCharacter.test.mjs`, `invitationBubble.test.mjs`, `knightPose.test.mjs` and `invitationModel.test.mjs` (helpers moved), `gate.test.mjs` (L1) |
| Browser tests            | `e2e/newt-world.spec.mjs` (new); `tips-live.spec.mjs` and `live-settings.spec.mjs` for the new rows; `gate.spec.mjs` (L1)                                                                                                                                                                                                                                                                                                                                                             |
| Docs                     | `docs/bonfire-live.md`, `docs/invitation.md`, this file; `docs/design/captures/newt-live-s1/` (S1's screenshots)                                                                                                                                                                                                                                                                                                                                                                     |

## Checklist

- [ ] S1 pipeline spike, the K3 branch and the default page picked · [ ] S2 carry spike
- [ ] R1 rng and `toLinear` · [ ] R2 envelope actor and look seam · [ ] R4 character dress ·
      [ ] R5 petal seams · [ ] R6 firefly and lightning seams
- [ ] W1 the world loads and survives a breakdown → drop · [ ] W2a the letters · [ ] W2b
      NEWT's reactions (the first clip) · [ ] W3 settings, start screen, HUD · [ ] W4a element
      rings and marks · [ ] W4b fireflies · [ ] W5 bubble and lines · [ ] G1 guards · [ ] R3
      pass writes and frame loop
- [ ] D1 rest map and harness · [ ] D2 pose layer · [ ] D3 three moves
- [ ] C1, P1, L1 as Newton decides · [ ] F1 feel pass signed off · [ ] X1 docs

## Later, if wanted

- `headRoom()` and the eleven intruding moves and nine gestures (D1's `KNOWN_INTRUDING`
  list), on Newton's word after F1; the seated nod and spin on his rig.
- The carrier as the default drop (once C1 has shipped and read well on a phone).
- A walk to a side spot for the quick letters (a floor tap at the spot, ~30 lines).
- The bubble in the recording (in-canvas text).
- An fx ink mode (`uFxMode`) so the glowing effects, lightning among them, read on light paper.
- The page burn (P1) under the quick letters too, if F1 wants page turns on phrase lines; a
  page from the show's palette (`colors.next` for a flame key, its `flames[key].ramp[1]`
  lightened).
- A `fakeKnights` adapter so `knightShow.js` schedules him; a NEWT shots table in
  `camera.js`, if the bonfire's framings look wrong in F1.
- Bolts from the letter to petals (a petal strike on `bolts.js bolt()`, ~40 lines); petals on
  the fireflies' moves (a petal duck over the fixed-step sim).
- The Bayer, dissolve-chunk, in-toy `math.js` and `worldPerPixel` merges, with bit-for-bit
  tests; jscpd.
- A Dance button in the toy (`ButtonName` is a closed union; brain, toolbar and e2e).
- Scene files for this world (a sibling format, a world filter on `loopEntries`), the Painter
  as a NEWT editor, the admin's Scenes page; several NEWTs (a clone path in `character.js`).
