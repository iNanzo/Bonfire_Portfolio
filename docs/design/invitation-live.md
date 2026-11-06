# NEWT in Bonfire Live (design plan)

Status: **plan, nothing built** (2026-11-06; third revision). Source: Newton's ask to bring the
invitation into the visualizer as its own visual option, with:

- every render effect Bonfire Live has (not just glitch);
- the knights' animations reused for NEWT;
- the invitation's rose petals, and the bonfire's fireflies, fire, lightning and ice;
- his existing lines, with the behavior they already go with;
- the code consolidated so the two don't carry needless copies of each other;
- simple to build, much of it by Codex.

## The decision: NEWT joins the bonfire's engine

The second draft put the toy into the visualizer and had NEWT stand in for the fire. That
can't give every render effect (most need the bonfire's own buffers: depth, normals, the
particle layer) nor the fire, fireflies, lightning and ice. So turn it round: **NEWT and his
petals go into the bonfire's engine**, as a new scenery and a new knight model. Everything
Bonfire Live already does (the director, every look, layer, drop hit and render option, the
cameras, the elements, the fireflies, the knight show, recording, scenes) works on him with no
change, because nothing about the engine changes.

The **NEWT** option is then a few settings pinned together: the *Paper* scenery, NEWT as the
dancers, petals on, his lines on. It sits beside Bonfire on the start screen and as *World* at
the top of the *Show* tab (`?world=newt`), and a scene can choose it like any other scenery.

## 1. The paper world: a new scenery, no campfire

`scenery.js` gains `paper` (`SCENERIES.paper: 'The Page'`): no ruins and **no campfire**, a plain
page for the void and floor, NEWT's shadow on it.

**No campfire.** The engine is built round the fire: it's the light, the place the knights sit
round, where the rings burst from, what the fireflies are leashed to and the cameras frame. So
the fire's *spot* stays, as an invisible centre everything still works round; only what's drawn
there goes:

- the flame and its embers and smoke aren't drawn (the flame's simulation idles);
- the fire's point light gives way to one soft key light from above, like the toy's (`camera.js`
  `lightDir`), still casting NEWT's shadow;
- what the director gives the flame (its size with the music, the sub-bass breathing, the beat
  pulses) goes to the petal swirl at the centre instead (section 4), so the middle still moves
  with the music;
- the forge and the planted blade's home are at the centre as before, so the living blade still
  rises, swings and plunges there;
- fire stays as an **element effect**: the fire ring, debris, swing trails and a fire weapon's
  flames, just no campfire.

**Page colors.** The page is a setting, *Page*, with presets (the hex values to be picked in
task 1):

| Page | Kind |
| --- | --- |
| White (the toy's own, the default) | light |
| Cream | light |
| Rose | light |
| Sky | light |
| Mint | light |
| Dusk (deep blue-grey) | dark |
| Night (near-black) | dark |
| From the palette: a page color rolled from the visualizer's palette tools (`colors.js`), new on drops like the scenery colors | either |

plus *In the mix* (a new page on scenery changes) and a custom color. A scene stores its page
color like its other colors.

**Effects on any page.** The fire, sparks, fireflies and lightning are *added* to the picture
(the fx pass is additive): that glows on a dark page and vanishes on a light one. So the fx
layer's blend follows the page's brightness: added on dark pages, painted (a normal or
multiply blend, which `pixelPass.js`'s blend modes already have) on light ones, so flames read as
color and ink on paper. Task 1's spike checks both on White, Rose, Dusk and Night, with
screenshots.

The scene's palette rules (`scenes.js` `normalizeScene`: the void darkest) get a page exception,
and NEWT's own colors stay off the palette snapping where they'd go wrong (as `setSteel` already
does for the knights' armor).

## 2. Reusing the knights' animations: NEWT as a knight model

The knights' moves are pure functions of the beat that write a 44-channel pose
(`knightGestures.js` `dance`, `gesture`), turned into bone turns by a solver built from a
rig's measurements (`knightSolve.js` `createSolver(rig)`, `knightRig.js` `measureRig(rest)`,
which takes rest positions by bone name and fills any it isn't given). So NEWT becomes a
**knight model** the way `first` is one (`knightStyles.js`: a style names its model):

- **A bone map** from the knight's names to NEWT's (`clips.js` `BLENDER_BONES`): hips → `Bone`,
  spine → `Bone.001`, chest → `Chest`, neck → `Neck`, head → `Neck.001`, shoulder / upper arm /
  forearm → `Shoulder` / `Bicep` / `ForeArm`, thigh / shin / foot → `Thigh` / `Calf` / `Foot`.
  The knight's hand, fingers, tassets and pauldrons have no NEWT bone: their channels are
  dropped (his palm is the forearm's tip, `clips.js` `PALM`).
- **His rig:** `measureRig` from his rest positions, so arm reach and leg length are his.
- **What the knight code skips for him:** helmets, plates, pauldron clearance, armor shading
  and the steel finishes. He keeps his own materials and face sheet (`character.js`'s dressing,
  shared, below). His head is big: moves that bring the hands up by it get a clearance from his
  head's bounds, the way the knight's arms keep clear of his helmet.

That gives NEWT, unchanged, everything `knightShow.js` does: sitting by the fire, nodding before
a drop, up and bouncing in the build, the leap and Praise the Sun on the drop, the 13 dance
moves, gestures (wave, bow, point, beckon, shrug, hurrah, joy), the flinch when the living blade
swings close, one to four of him in formations round the fire, the dancer cameras, In / Out on
hidden moments. The Knights tab works for him as it is (helmets, finish and armor shine hidden).

His own baked clips (Wave, Spook, Cheer…) aren't needed here; the knight gestures cover them.
Expect two or three moves to need a tweak for chibi proportions (task 7).

## 3. His lines, with the behavior they go with

The lines stay content.json's `invitation.lines` (edited in the admin), with their chances and
cooldowns (`invitation.speech`). The knight show's events stand in for the brain's:

| What NEWT does (knightShow) | Lines |
| --- | --- |
| arrives (In), or the wave gesture | `wave` |
| the flinch when the blade swings close | `spook` ("Eep!") |
| up and running about in the build's double time | `flee` |
| the drop's leap / landing | `dropped` ("Wheee!") / `landed` ("Oof.") |
| sits down / still sitting / gets up | `sitDown` / `sitting` / `standUp` |
| a new dance move | `walkTo` |
| the camera's orbit shots / close dancer shots | `spin` / `zoom` |
| nothing for a while | `idle` |

`speech.js` is split so its line picking (a trigger's chance, cooldown, priority, never the same
line twice) is a small pure piece both the toy and the visualizer call; the toy feeds it from
its brain as now, the visualizer from the knight show. `bubble.js` shows the line over the
speaking NEWT's head (with several, one at a time), and `markup.js` draws its text effects.

## 4. Rose petals, and the bonfire's own effects

**Petals become a bonfire effect.** `petals.js` (the simulation, pure) and `petalScene.js` (drawn
instanced, three reds, an ink edge) move to `src/fx/petals/`, drawn in the bonfire's solid layer
so they're pixelated, outlined, dithered and recolored like everything else. In the bonfire they
take the flame's colors; in the paper world the toy's reds. Uses, each Off / In the mix / Always
like every effect:

- **A drop hit, Petal Burst:** a ring of petals bursting from the fire.
- **The ring:** with petals on, the element's ring also throws a petal ring.
- **An ambient swirl:** the envelope's helix of petals circling the fire (in the paper world, in
  place of half the fireflies).
- **The pack:** a Petals action in the Spell Tome.

**Fireflies, fire, lightning and ice need nothing:** they're the engine's. In the paper world
the fireflies dance round the centre and swirl round the blade, the rings of fire, lightning and
ice burst across the page, ice crystals sprout from the floor, and NEWT flinches from the living
blade like the knights do. With no campfire, the petal swirl is the centrepiece: it takes the
flame's share of the music (its size, breathing and beat pulses).

## 5. Consolidation: what's duplicated, and what to do about it

The invitation shares nothing with the rest today. Going through it module by module:

| Duplication | Decision |
| --- | --- |
| Two pixel pipelines: the toy's (`stage.js`, `retro.js`, `pixels.js`) and the bonfire's (`frame.js`, `pixelPass.js`) | **Keep both for now.** The visualizer only uses the bonfire's (this plan adds no third). The toy's look is specified to the texel (the paper never dithered, …); moving it onto the bonfire's pipeline is a project of its own, worth doing only if the toy is to get the visualizer's effects too. |
| Petals: the toy's | **Move** to `src/fx/petals/`; the toy imports them from there. |
| NEWT's loading and dressing (`character.js`, `faceSheets.js`, `faces.js`) | **Split** the model and face part out so the toy and the knight model share it; the toy keeps the clip blending and his interaction. |
| Lines (`speech.js`'s picking, `bubble.js`, `markup.js`) | **Move** to `src/speech/`, shared. |
| Seeded randomness: `invitation/rng.js` vs `math.js` `pick`/`shuffle` (Math.random) | **One** `src/rng.js`; `math.js` keeps its Math.random helpers as thin calls into it. |
| Frame time: `invitation/governor.js` (steps the resolution) vs `bonfire/frameGate.js` (caps the frame rate) | **Not duplicates**: different jobs. Leave them; say so in each header. |
| Landing dust (`invitation/dust.js`) vs the bonfire's `debris.js` and impact puffs | **Check in task 2**; likely different (a ring of puffs vs bouncing bits). Merge only if one can do the other's job. |
| Dither: the toy's retro pass, `pixelPass.js`'s Bayer, `ui/dither.js` (CSS patterns) | Share the **matrix** (one `src/dither.js` constant both shaders and the CSS use); the shaders stay separate. |

**Keeping it that way:**

- **The rule:** code moves to a shared folder when a second place needs it, not before.
- **Shared folders:** `src/fx/`, `src/speech/`, `src/rng.js`, beside the existing shared
  `src/math.js`, `src/paletteGen.js`, `src/ui/`.
- **Boundaries in lint:** `eslint.config.js` `no-restricted-imports` so `src/invitation/` and
  `src/bonfire/` never import from each other, only from shared folders, which import neither.
- **A duplicate check in CI:** `jscpd` over `src/` (copy-paste detection) with a threshold,
  started at today's figure and ratcheted down, like the coverage ratchet.

## Tasks

Each one pull request. Codex has the clear-finish ones; anything that has to be looked at goes
to Claude (screenshots and clips in a cloud session) and Newton.

| # | Task | Who | Finish line |
| --- | --- | --- | --- |
| 0 | `AGENTS.md`: CONTRIBUTING in brief, the commands, the sharing rule | Claude | merged |
| 1 | Spike: the paper scenery without the campfire, the fx blend on White, Rose, Dusk and Night | Claude | screenshots and clips; Newton picks the page colors |
| 2 | Consolidation moves: `src/rng.js`, `src/fx/petals/`, `src/speech/`, NEWT's model/face split, `src/dither.js`; the lint boundaries; jscpd's baseline in CI | Codex | `npm run check` + e2e green; no behavior change; the toy's e2e untouched |
| 3 | `paper` scenery, built from the spike's choice; its palette and the scene rules' exception | Codex | scenery and scene tests; `e2e/scenes.spec.mjs` |
| 4 | NEWT as a knight model: the bone map, his rig, skipping helmets and plates, head clearance | Codex | `knightPose`/`knights` tests extended: every move and gesture on his rig, no NaNs, hands out of his head |
| 5 | Petals in the bonfire: Petal Burst, the petal ring, the swirl, the pack action, settings | Codex | `variety`/`vizSettings` tests; e2e |
| 6 | Lines from the knight show; the bubble over the speaker; the *World* option and `?world=newt` | Codex | unit tests per trigger; `e2e/newt-world.spec.mjs` (it loads, a drop, a line shows) |
| 7 | Feel pass: moves on chibi proportions, line chances, petals vs fireflies, effects on paper | Claude + Newton | Newton's sign-off |
| 8 | Docs: `docs/bonfire-live.md`, `docs/invitation.md`, `docs/painter.md`, this file's status | Codex | merged |

Order: 0 and 1 first; 2 alongside 1; 3 needs 1; 4 and 5 need 2; 6 needs 2–4; 7 after 6.

### Briefing Codex

- One task per run, this file's path, its row's finish line, "no behavior change" for task 2.
- The checks: `npm run check` always, `npm run e2e` (or the named spec) for anything on a page.
  If its container can't run Playwright, CI (`.github/workflows/checks.yml`) does; a PR isn't
  done until CI is green.
- Ask for every moved symbol, old path → new, in the PR description, so the review on a phone
  is a skim.

## Risks

- **Effects on paper** (section 1) are the unknown, hence the spike before anything else.
- **The knights' code assumes armor.** `knights.js` is large and helmets run through it; the
  NEWT model needs clean "no helmet, no plates" paths. Task 4's tests cover every move on his rig.
- **Weight.** `newt.glb` (754 KB) loads only when NEWT is chosen, as the `first` model loads
  only when its style is.

## Later, if wanted

The toy on the bonfire's pipeline (one renderer for everything); knight dance moves in the toy
(a *Dance* button, now cheap, since he's a knight model); NEWT's baked clips played in the
visualizer as gestures; lines written for the music.
