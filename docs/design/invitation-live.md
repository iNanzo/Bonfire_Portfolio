# NEWT in Bonfire Live (design plan, simple version)

Status: **plan, nothing built** (2026-11-06, revised the same day: the first draft's refactors,
new triggers, scripts and retargeting were cut for this smaller one). Source: Newton's ask to
bring the invitation into the visualizer as its own visual option, reusing what's there (the
lines with the behavior they already go with, the glitch effects), kept simple to build while
still looking and feeling different from the bonfire.

## The idea in one line

Pick **NEWT** instead of **Bonfire** on the start screen and the show plays NEWT's toy instead
of the fire. The music presses his buttons the way a visitor would, so his own clips, faces,
lines, dust and petals happen as they already do in the toy. The visualizer's glitch layer
runs over the top.

## What makes it different from the bonfire

- **The world:** the toy's white page, NEWT, his shadow, rose petals. No fire, no blade, no
  knights, no ruins.
- **A character who reacts:** he waves when the music starts, sits out the breakdowns, gets
  dropped on the drop ("Wheee!" … "Oof.") and talks in his speech bubble. The bonfire never
  speaks.
- **The same rave layer:** the glitch effects, drop flashes, tempo, HUD, title cards, recording
  and the output window all stay, so it's still Bonfire Live.

## How it works

### 1. NEWT stands in for the fire (no director rewrite)

The director talks to the bonfire through `fire.*` (about 45 members). Instead of refactoring
the director, the NEWT world is an object with the **same members**:
`src/visualizer/newtWorld.js`.

- The few that mean something to NEWT do something (below): `pulse`, `ring`, `puff`, `shake`,
  `glitch`, `drive`, `knights` (the dance and gesture calls), `setPalette`, `setRender`'s pixel
  size, `captureThumb`, the frame-rate members.
- The rest are harmless stubs that report "nothing there": no weapon held, nothing forging, no
  scenery change, no fireflies.
- A test lists every `fire.` member the visualizer's modules use (a grep in node) and checks the
  NEWT world has each one, so a later director change can't break it silently.

It's built from the toy's own modules, imported, never copied: `stage.js` (the paper, the shadow
floor, the retro pass, the governor), `character.js`, `brain.js`, `blend.js`, `steer.js`,
`carry.js`, `faces.js`, `speech.js` + `bubble.js` (with `content.js`'s lines and settings),
`dust.js` + `dustLayer.js`, `petalLayer.js`, `camera.js`. `src/invitation/main.js` already shows
the order they run in each frame; the world follows it, without the envelope, intro, toolbar
and Look sheet. It loads only when picked (a dynamic `import()`, `newt.glb` with it).

### 2. The music presses his buttons

The brain already takes buttons (`Wave`, `Spook`, `Sit`, `Device`, `Run`, `Wander`) and gesture
events (`tap`, `grab`, `release`). The world sends them at the show's moments, and the toy's
existing triggers then say the matching existing lines, at their existing chances and cooldowns
(content.json `invitation.lines` / `invitation.speech`, still edited in the admin):

| Show moment (what the director already calls) | What the world sends | What happens (all existing) | Lines it brings |
| --- | --- | --- | --- |
| music starts | `Wave` | he waves at the camera | `wave` |
| groove, beat | Idle/Walk sped to the tempo; every few bars `Wander` | he steps about in time | `wander`, `walkTo` |
| build, stage 3–4 | `Run` | he runs about, faster at stage 4 | `flee` ("Nope, nope, nope!") |
| blackout before the drop | `Spook` | he jumps, arms up | `spook` ("Eep!") |
| drop | a `grab`, lifted, then `release` on the strike | he dangles, falls, lands in a dust ring; a big drop lifts him higher, so the toy's own screen shake comes too | `pickedUp`, `dropped`, `landed` |
| a small drop | a `tap` | a wave or a startle | `wave` / `spook` |
| breakdown | `Sit` | he sits down and stays sat | `sitDown`, `sitting` |
| long breakdown, or the music quiet | `Device` | Screen Time: the tablet, then lying down with it | `device`, `lieDown` |
| breakdown ends | any other button gets him up | StandUp / GetUp | `standUp` |
| camera orbit shots / close shots | (the camera does it) | | `spin`, `zoom` |
| nothing for a while | (the brain's own idle clock) | | `idle` |

The invisible hand on the drop is the toy's `carry.js`: the world moves the anchor up and lets
go, as a finger would. How high it lifts him follows the drop's size, so only big drops shake
the screen.

Petals: a burst ring at his feet on each drop and ring (`petalLayer.js`'s click burst, placed
at his feet on screen), and the cursor trail stays on. With Low Flash or reduced motion, no
petals (as in the toy).

### 3. The glitch layer, shared

The glitch layer (torn rows, RGB split, crunch, wave, scanlines, static, mirror, the negative
flash) is screen-space: it only needs the finished picture. Move its GLSL out of `pixelPass.js`
into `src/bonfire/glitchChunk.js` (the shader code and its uniform list), include it from
`pixelPass.js` (no change to the bonfire) and at the end of the toy's retro pass
(`retro.js`), off unless the world turns it on, so the toy itself is unchanged. The NEWT world's
`glitch` is the same uniform bag the director already fills, so every glitch roll, drop hit and
setting works as it does on the bonfire.

**Kept bonfire-only** (they need the bonfire's extra buffers): x-ray, motion blur, ghosting,
glow, painterly, watercolor, echo, outlines, the palette and fog render options. In the NEWT
world those settings are hidden and the looks that need them play as Glitch.

### 4. The settings

- A _World_ choice (Bonfire / NEWT) on the start screen and at the top of the _Show_ tab, and
  `?world=newt`. Switching only while stopped (or it reloads the page while playing), kept with
  the settings.
- In the NEWT world the tabs and rows that can't apply are hidden: Blade, Knights, Fireflies,
  Scenes, the bonfire-only render rows and effects, the pack. A list in `settingsControls.js`
  (`BONFIRE_ONLY`) says which.
- His look (Default, DS, Soft), Rose Petals and Pixel Size come from the toy's saved look, so
  what's set in the toy carries over.

## What gets shared

- `glitchChunk.js`: one glitch shader for both renderers.
- The toy's modules, imported by the visualizer as they are (nothing duplicated). Where a toy
  module reaches into the DOM or the toy's page in a way the world can't use, split the pure part
  out rather than copying it.

That's all. No `src/core/`, no World interface, no director split; they can come later if a
third world ever does.

## Tasks

Each is one pull request. Codex can take 1–5; the feel (6) needs someone to look at it.

| # | Task | Who | Finish line |
| --- | --- | --- | --- |
| 0 | `AGENTS.md`: the CONTRIBUTING rules in brief, the commands, "import the toy's modules, never copy them" | Claude | merged |
| 1 | `glitchChunk.js` out of `pixelPass.js`, included by `pixelPass.js` and (off) by `retro.js` | Codex | `npm run check` + `npm run e2e` green; bonfire screenshots unchanged |
| 2 | `newtWorld.js`: the toy's stage and NEWT behind the `fire.*` members, stubs for the rest, the coverage test | Codex | `check` green; `?world=newt` shows NEWT idling with the HUD working |
| 3 | The button table above, the drop's lift and drop, tempo-synced gait, petal bursts | Codex | unit tests on a fake show (each moment sends what the table says); `check` green |
| 4 | The _World_ setting, start-screen choice, hidden tabs and rows, the glitch uniforms wired | Codex | `test/vizSettings.test.mjs` extended; a new `e2e/newt-world.spec.mjs` (it loads, a drop drops him, a line shows) |
| 5 | Docs: `docs/bonfire-live.md`, `docs/invitation.md`, this file's status | Codex | merged |
| 6 | Feel pass: lift heights, how often he wanders, line chances in this world, glitch strength over white | Claude (screenshots, recordings) + Newton | Newton's sign-off |

1 and 2 can run side by side; 3 and 4 need 2; 4's glitch wiring needs 1.

### Briefing Codex

- One task per run, this file's path, its row's finish line.
- The checks: `npm run check` always, `npm run e2e` for anything that touches a page. If its
  container can't run Playwright, CI (`.github/workflows/checks.yml`) does; the PR isn't done
  until CI is green.
- Claude in a cloud session can watch the PRs, fix CI and do task 6's screenshots and clips.

## Risks

- **The director assumes a bonfire.** Stubs that report "nothing held, nothing forging" should
  keep it on its plain paths, but some call may expect a real object back. The coverage test
  catches missing members; task 2 also runs the demo track through a full groove → breakdown →
  drop cycle with the NEWT world and checks there are no errors in the console.
- **Glitch over white.** Effects tuned on a dark scene may look harsh on paper (the negative
  flash turns the page black). Task 6 may tone some down for this world.
- **Two pages' worth of code on one.** The toy's modules come with the NEWT world's chunk only;
  check the visualizer's first load is unchanged.

## Later, if wanted

Not part of this plan: knight dance moves retargeted onto NEWT, lines written for the music,
beat-typed text, scripted sets, the tablet as a deck, the envelope as a request card, letting
viewers play with him during the show. Each could build on this without changing it.
