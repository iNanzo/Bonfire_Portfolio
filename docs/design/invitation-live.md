# NEWT in Bonfire Live (design plan)

Status: **plan, nothing built** (2026-11-06; fourth revision). Source: Newton's ask for the
invitation as its own visual option in Bonfire Live:

- **separate from the bonfire:** no campfire, no living blade, no ruins; NEWT's world, built on
  the invitation's own structure (the page, NEWT, the petals, the envelope);
- **sharing where it makes sense:** every render effect, the knights' animations, the bonfire's
  fireflies, fire, lightning and ice, his existing lines with the behavior they go with;
- **visually impressive in the invitation's terms**, not a re-skinned bonfire;
- **the code consolidated** so the two don't carry needless copies;
- much of the work done by Codex.

## What's shared and what isn't

Bonfire Live splits cleanly into a part about the music and a part about the bonfire. The music
part is shared; each world has its own picture.

| Shared by both worlds | Bonfire only | NEWT only |
| --- | --- | --- |
| Listening: `analyser.js`, `tempo.js`, `sections.js` (drops, builds, breakdowns), Link, MIDI | the campfire and its flame | the page and its colors |
| The show's schedule: `looks.js`, `render.js`, `bars.js`, `colors.js`, `cameraEase.js` | the living blade, the forge, weapons | NEWT: his model, faces, clips, lines |
| The pixel pipeline and every render effect: `frame.js`, `pixelPass.js` | the ruins and other sceneries, the terrain | the envelope |
| Element effects: rings, fire impact, `lightningRing.js`, `bolts.js`, `ice.js`, `marks.js`, `debris.js` | the knights' armor, helmets, steel | the landing dust |
| Fireflies and their moves (`fireflies.js`, `fireflyMoves.js`, `fireflyShow.js`) | the bonfire's director (built round the blade) | NEWT's director |
| Rose petals (from the invitation) | | |
| Dance moves and the pose solver (from the knights); the knight show's scheduler | | |
| The UI: HUD, settings dialog, title cards, recording, the output window | | |

The music modules already depend only on `math.js`, and the element effects don't reach into
the bonfire's scene, so most of the sharing is importing, not rewriting.

## The NEWT world

### The picture

- **The page:** a plain page for the void and floor, with presets White (the toy's), Cream,
  Rose, Sky, Mint, Dusk and Night, *From the palette* (rolled from `colors.js`), *In the mix*,
  or a custom color. NEWT's shadow on it, one soft key light from above as in the toy.
- **Drawn by the shared pixel pipeline** (`frame.js` + `pixelPass.js`), so every look, layer,
  drop hit and render option works here as on the bonfire. Effects that glow (fire, sparks,
  fireflies, lightning) are *added* to the picture, which vanishes on a light page, so the fx
  layer's blend follows the page: added on dark pages, painted (normal or multiply, blend modes
  the pass already has) on light ones.
- **NEWT looks like himself:** his materials and face sheet, kept off the palette snapping where
  it would recolor him (as `setSteel` does for the knights' armor). Task 1 checks how close the
  shared pipeline gets to the toy's own look.

### The show, moment by moment

| Moment | What you see | Shared from | His lines |
| --- | --- | --- | --- |
| **Start** | The envelope floats in on the page, petals circling it, bobbing to the beat. On the first downbeat (or the first drop) the seal blooms and the letter burns away onto NEWT, who waves. The title card is written on the letter. | the invitation's envelope; the visualizer's title cards | `wave` |
| **Groove** | NEWT dances: the knights' 13 moves on his body, a new one every few bars; with *How Many* 2–4, several NEWTs in the knights' formations. Petals swirl round him with the fireflies' moves (bounce, dart, zigzag, compass) and pulse on and off with the music the way fireflies do. On dark pages, fireflies too. | knight moves and scheduler; firefly moves and show; petals | `walkTo` on a new move, `idle` |
| **Build** | The petal helix tightens and climbs round him; he bounces, double time at the last stage; the page darkens round him (the Spotlight layer). | knight show's build stages; looks | `flee` at the last stage |
| **Blackout** | Everything freezes for the 90 ms, petals hanging in the air, his face surprised. | the director's blackout | `spook` ("Eep!") |
| **Drop** | He leaps and lands (Praise the Sun on the way). Where he lands, the element bursts out across the page: a ring of fire leaving scorch marks on the paper, a lightning ring with bolts arcing to the petals as they do to fireflies, or an ice ring with crystals sprouting from the page. The toy's dust ring and screen shake, a petal burst, the drop hits and looks. On big drops the page itself burns away, as the envelope does, onto a new page color. | element rings, `marks.js`, `ice.js` sprouts, bolts; the dissolve; drop hits | `dropped` ("Wheee!"), `landed` ("Oof.") |
| **After the drop** | He glows at the edges in the element's color (the knights' edge glow), which fades over the 8 bars. | knight edge glow | |
| **Breakdown** | He sits (his own Sit clip), petals fall slowly over the whole page; in a long one he gets the tablet out. | his clips | `sitDown`, `sitting`, `device` |
| **Back in** | He gets up and starts dancing again. | | `standUp` |
| **Cameras** | Dancer shots, slow orbits, a close shot on his face when he speaks, cut on the show's rhythm and eased with the camera feels. | `cameraEase.js`; the dancer shots' framing | `spin`, `zoom` |

The element follows the same rolls as the bonfire's (the user's elements, a new one per drop),
without a weapon to carry it.

### NEWT's director

A new, small `newtDirector.js` reads the shared listening modules (sections, tempo, the drop
score) and the shared schedules (looks, render, colors), and drives the moments above. The
bonfire's `director.js` is left as it is. The few parts both need that live inside
`director.js` today (the effects budget, the build stages, the blackout's timing) are moved out
into a pure `showClock.js` that both directors use; nothing else in the bonfire's director moves.

## Reusing the animations

- **The knights' dance moves and gestures** are pure functions of the beat that write a pose,
  turned into bone turns by a solver built from a rig's measurements. NEWT gets his own rig
  (his rest positions, mapped onto the knight's bone names: hips → `Bone`, spine → `Bone.001`,
  chest → `Chest`, neck → `Neck`, head → `Neck.001`, the arms' `Shoulder` / `Bicep` / `ForeArm`,
  the legs' `Thigh` / `Calf` / `Foot`; no hand, finger, tasset or pauldron bones, so those
  channels are dropped), and his big head keeps the hands clear of it.
- **His own clips** stay for what they do best (Sit, Wave, Spook, Land, the tablet).
  `character.js` gains a pose layer after his clip blend, the way his look-at and limp limbs
  already work, so a dance fades in over Idle and out into Sit without a pop.
- **The knight show's scheduler** (`knightShow.js`, pure) picks when to dance, what move, how
  many get up and where they stand, with NEWT's places on the page instead of round the fire.
- Expect a few moves to need tuning for his chibi proportions.

The same layer lets the toy use the dances later (a *Dance* button), at no extra cost.

## His lines

The lines stay content.json's `invitation.lines` with their chances and cooldowns (edited in
the admin). `speech.js`'s line picking (chance, cooldown, priority, never the same line twice)
is split out so the toy feeds it from his brain and the NEWT world from its moments (the table
above). `bubble.js` shows the line over his head, `markup.js` draws its text effects.

## Consolidation

| Duplicate today | What to do |
| --- | --- |
| The envelope's burn-away (`envelopeScene.js`) is a copy of the bonfire's weapon dissolve (`bonfire/dissolve.js`) | **One** shared `src/fx/dissolve.js`; the envelope, the weapons, the knights and the page's burn use it |
| Bayer matrices in the toy's retro pass, `pixelPass.js` and `ui/dither.js` | **One** `src/dither.js` matrix, pasted into each shader and the CSS patterns |
| Seeded randomness: `invitation/rng.js` vs `math.js` | **One** `src/rng.js` |
| Petals live in the invitation | **Move** to `src/fx/petals/`; the toy imports them |
| The pose format, dance moves and solver live in the knight's files | **Move** to `src/pose/`; the knights import them |
| NEWT's loading and face dressing are inside the toy's `character.js` | **Split** them out so the toy and the NEWT world share them |
| The line picking is inside the toy's `speech.js` | **Split** it out (`src/speech/`) |
| Element effects and fireflies assume the bonfire's terrain | Give them a **flat-floor** collider, so they work on the page without the terrain |
| The toy's pixel pipeline (`retro.js`, `stage.js`) beside the bonfire's | **Keep both for now.** The NEWT world uses the bonfire's; moving the toy onto it is a project of its own, worth it only if the toy should get the effects too |
| `invitation/governor.js` (resolution) and `bonfire/frameGate.js` (frame rate) | **Not duplicates**: different jobs; say so in each header |

**Keeping it that way:**

- **The rule:** code moves to a shared folder when a second place needs it, not before.
- **Shared folders:** `src/fx/`, `src/pose/`, `src/speech/`, `src/rng.js`, `src/dither.js`,
  beside the existing `src/math.js`, `src/paletteGen.js` and `src/ui/`.
- **Lint:** `no-restricted-imports` in `eslint.config.js` so the toy and the bonfire never
  import each other, only shared folders, which import neither.
- **CI:** a copy-paste check (`jscpd`) over `src/`, started at today's figure and ratcheted down
  like the coverage.

## Tasks

Each one pull request. Codex has the ones with a clear finish line; the ones that need looking
at go to Claude (screenshots and clips in a cloud session) and Newton.

| # | Task | Who | Finish line |
| --- | --- | --- | --- |
| 0 | `AGENTS.md`: CONTRIBUTING in brief, the commands, the sharing rule | Claude | merged |
| 1 | Spike: NEWT and petals on a page through the shared pixel pipeline, on White, Rose, Dusk and Night, with one ring of each element and a few looks, beside the toy's own look | Claude | screenshots and clips; Newton picks |
| 2 | Consolidation moves: dissolve, dither, rng, petals, pose, NEWT's model and faces, line picking; lint boundaries; jscpd baseline | Codex | `npm run check` + e2e green; no behavior change; the toy's e2e untouched |
| 3 | Element effects and fireflies on a flat floor (no terrain) | Codex | tests per effect on a flat collider; bonfire unchanged |
| 4 | NEWT's rig, the retarget, the pose layer in `character.js` | Codex | every move and gesture on his rig: no NaNs, hands out of his head; the toy unchanged |
| 5 | `showClock.js` out of `director.js` (budget, build stages, blackout) | Codex | the bonfire's director produces the same calls on a recorded trace before and after |
| 6 | The NEWT world: the page, NEWT(s), `newtDirector.js`, the knight show's scheduling, lazy loading, `?world=newt` | Codex (scaffold) | it loads and plays the demo track with no console errors |
| 7 | The moments table: the envelope opening, the element rings and marks, the page burn, the edge glow, petals with firefly moves, lines and bubbles | Codex, then Claude | unit tests on a fake show; screenshots |
| 8 | Settings: *World* (Bonfire / NEWT), *Page*, NEWT's tabs (Dancers, Petals, Elements, Page), the bonfire's tabs hidden, the render and effects tabs shared | Codex | `vizSettings` tests; `e2e/newt-world.spec.mjs` |
| 9 | Feel pass: moves on his proportions, petal amounts, effects on each page, line chances | Claude + Newton | Newton's sign-off |
| 10 | Docs: `docs/bonfire-live.md`, `docs/invitation.md`, this file's status | Codex | merged |

Order: 0 and 1 first; 2 alongside them; 3, 4 and 5 after 2 (side by side); 6 after 3–5; 7 and 8
after 6; 9 after 7; 10 last.

### Briefing Codex

- One task per run, this file's path, its row's finish line, "no behavior change" for 2, 3 and 5.
- The checks: `npm run check` always, `npm run e2e` (or the named spec) for anything on a page.
  If its container can't run Playwright, CI (`.github/workflows/checks.yml`) does; a PR isn't
  done until CI is green.
- Every moved symbol listed old path → new in the PR description, for a quick review on a phone.

## Risks

- **NEWT through the shared pipeline** may not look like the toy's NEWT. Task 1 shows it before
  anything is built on it; if it falls short, the fallback is the toy's own pipeline with the
  screen-space effects only.
- **Effects on light pages** (the blend switch) are untried; also task 1.
- **The knight code assumes armor**; the retarget's tests (task 4) cover every move on his rig.
- **Weight:** `newt.glb` (754 KB) and the NEWT world's code load only when it's chosen.

## Later, if wanted

The toy on the shared pipeline (one renderer for everything); dances in the toy; lines written
for the music; viewers playing with him during the show; the envelope as a request card.
