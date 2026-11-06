# NEWT in Bonfire Live: the invitation as a world of its own (design plan)

Status: **plan, nothing built** (2026-11-06). Source: Newton's ask to bring the invitation into
the visualizer "as its own separate visual option" (not a preset scene), sharing scripts and
assets both ways so the codebase gets sturdier and cleaner, reusing animations where possible,
with as much of the work as practical handed to Codex while he's away.

## Where things stand

- **The invitation is an island.** No module in `src/invitation/` imports anything from outside
  it, and nothing outside imports it (only `contentRules.js` names it). It has its own seeded
  randomness (`rng.js`), frame governor (`governor.js`), pixel grid (`pixels.js`), retro pass
  (`retro.js`), stage (`stage.js`), camera (`camera.js`) and look presets (`look.js`, `looks/`).
- **Bonfire Live drives one world, the bonfire.** `src/visualizer/` reads the music (`analyser.js`,
  `tempo.js`, `sections.js`) and the director turns it into calls on the bonfire: about 45
  members of `fire.*` (`knights` ×22, `holding` ×17, `weapon` ×15, `forging` ×14, `scenery`,
  `equip`, `flame`, `fireflies`, `pulse`, `ring`, `glitch`, `setRender`, `setPalette` …). Scenes
  (`src/scenes.js`) are presets of that world, so the invitation doesn't fit in as a scene.
- **The knights' dances are pure maths.** `knightGestures.js` `dance(p, move, beat, {period,
  energy, seed, seated})` writes one of 13 moves into a 44-channel pose (`knightRig.js` `POSE`);
  `knightSolve.js` `createSolver(rig)` turns a pose into bone turns for a measured rig. Nothing
  in a move knows about the knight's mesh.
- **NEWT's animations are baked clips.** 23 clips in `newt.glb` (`clips.js`), made by
  `tools/newt.py`, on 17 bones, blended by hand (`blend.js`). `character.js` already does work on
  the bones after `mixer.update` (look-at, limp limbs), so a procedural layer has a place to go.
  There is no dance among the clips.
- **Weight.** `newt.glb` is 754 KB (`bonfire.glb` is 221 KB). It must load only when the
  invitation world is picked.

## The shape of it

```
src/core/          shared, world-agnostic, mostly pure (moved here when a 2nd user appears)
  rng.js             seeded mulberry32 (from invitation/rng.js; bonfire's pure modules can use it)
  governor.js        frame-time governor (from invitation/governor.js)
  pose/              the pose format + dance library + solver (from bonfire/knight*.js)
  screenFx/          screen-space effects as GLSL chunks (from pixelPass.js): mirror, RGB split,
                     torn rows, scanlines, negative flash, grain, cinema bars, chroma split
src/visualizer/
  show.js            NEW: music → show events (beat, bar, phrase, build stage, blackout, drop,
                     breakdown, energy, budget), split out of director.js
  worlds/
    index.js         NEW: the World contract + registry ({ bonfire, newt }), lazy imports
    bonfire.js       NEW: the director's existing fire.* code, behind the contract
    newt.js          NEW: the invitation world (below)
src/invitation/    the toy, now importing from src/core/ instead of keeping its own copies
```

### The World contract

A world is what Bonfire Live points the show at. Keep it small and event-shaped, so the
bonfire's 45-member surface stays *inside* `worlds/bonfire.js` rather than becoming the
contract:

```js
/** @typedef {object} World
 * @property {string} key                         'bonfire' | 'newt'
 * @property {(canvas, opts) => Promise<void>} mount
 * @property {(dt: number, music: MusicFrame) => void} frame   energy, bands, beat phase, budget
 * @property {(e: ShowEvent) => void} cue           beat | bar | phrase | build(stage) | blackout | drop(size) | breakdown | groove
 * @property {(colors: PaletteColors) => void} setPalette
 * @property {(r: RenderSettings) => void} setRender  pixel size, dither, outlines … (what it supports)
 * @property {Set<string>} supports                 'scenes', 'knights', 'weapons', 'screenFx', 'record', …
 * @property {() => HTMLCanvasElement} canvas       for record.js and output.js (captureStream)
 * @property {() => void} dispose
 */
```

UI parts (settings tabs, HUD rows, the pack, MIDI actions) ask `world.supports` and hide what
doesn't apply. Record, the output window, title cards, the HUD, tempo, Link and MIDI work for
any world because they only need a canvas and the show events.

**The rule for the refactor:** the bonfire world must behave identically after it. Step one moves
code without changing it (director → `show.js` + `worlds/bonfire.js`), checked by the existing
unit tests, `e2e/scenes.spec.mjs`, `e2e/live-settings.spec.mjs` and a `npm run bench:compare`
before/after.

### The NEWT world (`worlds/newt.js`)

Built from the invitation's own parts: `stage.js` (paper, shadow floor, retro pass, governor),
`character.js` (NEWT, faces, earrings), `petals.js` + `petalScene.js`, `dust.js` + `dustLayer.js`,
`camera.js`. None of the toy's interaction (tap, drag, carry, brain, dialogue) comes along.

| Show event | NEWT world |
| --- | --- |
| groove | dances: knight moves retargeted (below), a new move every *New Move Every* bars |
| beat | head bob / step on the beat; petals pulse in the swirl |
| build (1–4) | stage 1 Idle with a nod, 2 bouncing, 3 Run in place, 4 double time; the petal helix tightens and climbs |
| blackout | the face goes `surprised`; petals freeze |
| drop | Cheer (or a jump move) on the first beat, face `happy`, a petal burst ring + dust ring, screen shake, a camera cut |
| breakdown | sits (SitDown → Sit), face `neutral`/`shy`, a slow petal swirl, wide camera |
| intro | the envelope as the intro title card: it opens on the first drop (or on the music's start) |

Optional extras once the base works: two or three NEWTs (clones via `SkeletonUtils.clone`,
watch the frame budget), the invitation's look presets (`looks/default`, `ds`, `soft`) as the
world's *Look* setting, music-colored petals from `colors.js`.

**Effects.** The bonfire's looks live in `pixelPass.js` and lean on the bonfire's buffers
(depth, normals, particle layers, palette snapping), so they can't all run on NEWT's world. The
screen-space ones can: pull them into `src/core/screenFx/` as GLSL chunks with their uniforms,
include them from both `pixelPass.js` (no visual change) and `retro.js` (a new final step that
leaves the paper texels alone unless a mirror or flash is on). V1 of the NEWT world gets
mirror, RGB split, torn rows, scanlines, negative flash, grain, cinema bars and chroma split; the
buffer-hungry ones (x-ray, painterly, motion blur, glow) stay bonfire-only and are hidden by
`supports`.

**Camera.** The visualizer's shots are framed around the clearing. The NEWT world gets its own
short list built on the invitation camera's orbit (front, low, high, three-quarter, close on
the face, wide), cut on the same rhythm the director uses (every 2 bars, every bar after a
drop) and eased with `cameraEase.js` (already pure, so it's shared as is).

**Picking it.** A *World* setting at the top of the *Show* tab and a choice on the start screen
(Bonfire / NEWT), `?world=newt` in the URL. Switching happens only at a hidden moment, as
scenes do: on a blackout, or at once while stopped. Scenes and the scene loop stay bonfire-only
(`supports` has no `'scenes'` for NEWT); a scene can't name the NEWT world in v1.

## Reusing animations

**Knight dances on NEWT: yes, and this is the best reuse in the plan.** The 13 dance moves
(`nod`, `stepTouch`, `fistPump`, `headbang`, `swayArms`, `march`, `spin`, `jump`, `jumpingJack`,
`clap`, `stomp`, `praise`, `defaultDance`) are pure functions of the beat writing into the pose
format. What's needed:

1. **Move the pose format out of the knight.** `knightRig.js` `POSE`/`newPose`, `knightBody.js`
   helpers and `knightGestures.js` `dance`/`MOVES` into `src/core/pose/` (re-exported from the old
   paths so nothing else changes). `test/knightPose.test.mjs` must pass unchanged.
2. **A NEWT rig.** `measureRig`-style measurements for NEWT's 17 bones (`clips.js` `BONES`,
   `BLENDER_BONES`): arm and leg lengths, shoulder and hip places, read from the glb in node
   (`test/invitationModel.test.mjs` already loads it).
3. **A retarget.** `newtPose.js`: a pose → NEWT's bone turns, via `createSolver(newtRig)`. NEWT has
   no hand, finger, tasset or pauldron bones, so those channels are dropped (the palm is the
   ForeArm's tip, `clips.js` `PALM`); the head is huge, so moves that bring the hands near the
   head (`clap` overhead, `headbang`, `praise`) need clamps from the head's bounds, the way the
   knight's helmets keep out of the arms.
4. **A layer in `character.js`.** After `mixer.update`, blend the procedural pose over the clip
   pose with a weight (0 = clips only), the way look-at and the limp limbs already work, so
   Idle/Walk can sit underneath and a dance fades in and out without a pop.

Done that way the toy can use it too: a *Dance* option in the invitation (round-trip reuse), and
any move added later dances for both.

**NEWT's clips on the knights: possible, low value.** They're baked keyframes on a different
skeleton; playing them on a knight means sampling each clip into the pose format (an inverse
of the retarget, lossy) or a bone-name retarget with rest-pose fixes. Wave, Cheer and Spook
already have knight equivalents (`wave`, `hurrah`, the flinch). Leave it out unless a specific
clip is wanted.

**New NEWT clips** (a real dance, a bow) belong in `tools/newt.py` with their entry in
`clips.js`, checked by `test/invitationModel.test.mjs`. That's Blender work and needs a person
(or Claude with Blender) at the end to look at it; Codex shouldn't try it.

## Other sharing worth doing (cleanup)

- `src/core/rng.js` (from `invitation/rng.js`) for the bonfire's pure schedulers that take a
  seed; `math.js` `pick`/`shuffle` keep `Math.random` for the impure callers.
- `src/core/governor.js`: the invitation's governor, compared against the bonfire's own frame
  gating (`frameGate.js`, `setMaxFps`). Merge only if they really do the same job; otherwise
  leave both and say why in each header.
- Palettes: the NEWT world takes `colors.js`/`paletteGen.js` colors for the petals and an accent,
  never for the paper or NEWT himself (his look stays his).
- Petals are a candidate for the bonfire too (a drop hit), *after* v1: `petals.js` is pure and
  `petalScene.js` draws them instanced.

## Making it NEWT's own, not a second bonfire

The bonfire's show is spectacle: weapons, elements, glitch, cameras, no one to talk to. NEWT's
should be a *character* at the party: he hears the music, has opinions about it, says so, and
can still be played with. Nearly all of it reuses the toy's own machinery, which is already
pure and tested.

**What exists to build on.** His lines are text in a speech bubble (no recorded voice): 19
triggers in `speech.js` (`TRIGGERS`, `PRIORITY`, a chance and cooldown each from content.json
`invitation.speech`), 5–12 lines each in `invitation.lines`, picked at random, never the same
twice running, edited on the admin's Invitation page. Lines carry text effects (`markup.js`:
`{red,wave,shake,big,bold|…}`). The intro is a 28-box script (`dialogue.js`), each box with a
face, an animation and a camera shot (`{"text": "Hi everyone! It's Newton :3", "face": "shy",
"animation": "Wave", "camera": "medium", "auto": 0, …}`), run on an injected clock.

### 1. Lines for the music (the music's own triggers)

A second trigger set, `LIVE_TRIGGERS`, run by the same `createTalk` logic but stepped by the
show events instead of the brain:

| Trigger | When | Example tone |
| --- | --- | --- |
| `musicStart` | the first beats | "Oh? Oh! We're doing this?" |
| `build` | build stage 2–3 | "It's building… it's building…" |
| `blackout` | the 90 ms before the drop (shown just ahead, from stage 4) | "{shake\|wait for it}" |
| `drop` | a big drop's first beat | "{big,bold,wave\|LET'S GO}" |
| `smallDrop` | a small drop | "Ooh, nice" |
| `breakdown` | a breakdown settles | "Okay, breather." |
| `longGroove` | 64+ bars without a drop | "My legs are tired :3" |
| `fast` / `slow` | the tempo past 150 / under 90 BPM | "TOO FAST" / "Is this a lullaby" |
| `quiet` / `stopped` | the music drops out / stops | "…hello?" |
| `tapped`, `pickedUp`, `dropped`… | the toy's own, when the audience plays with him (below) | "Put me down, this is my favourite part!" |

Content: `invitation.live.lines` and `invitation.live.speech` (chance, cooldown), with their own
section on the admin's Invitation page, checked by `contentRules.js` like the toy's. Priorities:
`drop` > `blackout` > `build` > the rest; lines never cover a title card; cooldowns long by
default (a line every 30–60 s at most outside drops), so it stays charming rather than chatty.

### 2. Text that moves to the beat

- **Typed on the beat.** In the live world the bubble types a word per beat (or per half beat
  over 140 BPM) instead of `DIALOGUE.cps`, so a line lands like a call-out on the rhythm and
  its last word on the downbeat. `lineDuration` and `bubble.js` take a `beatClock`.
- **Effects in time.** `markup.css`'s wave and shake read a `--beat` custom property the world
  sets each frame: waves crest on the beat, shakes hit on kicks, `big` letters pulse.

### 3. Scripted moments: an MC script on the music's clock

The intro's dialogue format, run on bars instead of taps: a **set script**, boxes with `at`
(a bar number, `drop:N`, `breakdown:N`) instead of `next`. Each box already carries a face, an
animation and a camera shot, so a script is a cue sheet for the whole world: "bar 1: Wave,
medium, *Welcome to the party*", "drop 1: Cheer, close, *{big|HERE WE GO}*". It comes in the
Uma Musume box (`dialogueUi.js`) for the opening and the big moments and in the bubble for the
rest. The visualizer's *Title Cards* become, in this world, the opening box's text, so the
DJ's name and the night's title are said by NEWT rather than stamped on screen.

### 4. He DJs on his tablet

Screen Time's tablet (`device.js`, held by `DeviceSit`/`DeviceLie`) becomes his deck: in
breakdowns he sits with it, its screen showing the analyser's bands as a small pixel
spectrum (a canvas texture from `analyser.js`), tapping along; at the build he stands, and on
the drop he flings it up (a petal burst where it goes). No new model, no new clip.

### 5. The audience can still play with him

Unlike the bonfire, which nobody touches, the NEWT world keeps the toy's gestures (`gesture.js`,
the brain's react / held / fall / land) under a *Hands On* setting (on for a phone or a stream
where viewers can reach it, off for a projector). A tap gets a wave on the beat, a grab picks
him up and he keeps dancing in the air (the dance layer over `Held`), a drop on the drop gets
the biggest dust ring and a line. The brain gains one state, `dance`, which the show events drive
and any gesture interrupts.

### 6. Moods instead of glitch

- **Faces** follow the energy: `neutral` → `happy` in the groove, `surprised` on the blackout,
  `smug` after a drop, `shy` when it goes quiet, `sad` when the music stops; the blink rate
  speeds up with the tempo (`faces.js` `normal`/`slow`).
- **Looks:** the toy's own presets (Default, DS, Soft) take the turns the bonfire's looks do, a
  new one on phrase lines; the screen effects (mirror, flash) come only on drops, sparingly.
- **Petals:** the colors follow the visualizer's palette; the swirl's speed is the tempo; a drop
  is a burst ring at his feet; a breakdown is a slow fall over the whole screen.
- **The envelope as a request card:** a key (or MIDI pad) sends an envelope in with a
  shout-out; it floats, bobbing on the beat, and opens on the next drop, NEWT reading it out.

### 7. Live MC control

A *Say* field and key in the HUD: the DJ types a line (text effects and all) and NEWT says it on
the next beat. MIDI pads can each fire a trigger's line (`drop`, `build`…) or a fixed line,
learned like the existing actions (`midi.js`).

**Kept out:** a spoken voice. A babble (syllable blips, Animal Crossing-style) suits the toy,
but in the visualizer it would play over the DJ's own mix; if it's wanted, it's the toy's, off
by default.

**Back the other way:** the toy can take the live triggers in a small way too: with a *Listen*
toggle (the visualizer's microphone source, `sources.js`), NEWT dances to the room's music and
says the music's lines.

## Phases and who does what

Each task is one pull request, small enough to review on a phone. Codex gets the work that has
a clear, testable finish line (moves, contracts, pure maths, plumbing, tests). The work that
has to be *looked at* (feel, timing, camera framing, how a dance reads on a chibi) is for
Newton, or for Claude in a cloud session, which can run the app in Chromium and screenshot it.

| # | Task | Who | Finish line |
| --- | --- | --- | --- |
| 0 | `AGENTS.md` at the root: the CONTRIBUTING rules in brief, the commands, the comment style, "no behavior change" for refactors | Claude | merged |
| 1 | `src/core/rng.js`, `src/core/governor.js`: move, re-export from the old paths | Codex | `npm run check` green, no other diffs |
| 2 | `src/core/pose/`: move the pose format, body helpers and dance library; re-export | Codex | `check` green; `knightPose`/`knightShow` tests unchanged |
| 3 | `show.js` split out of `director.js`: show events as data; director consumes them | Codex | `check` + `e2e/live-settings`, `e2e/scenes` green; bench within noise |
| 4 | `worlds/index.js` + `worlds/bonfire.js`: the contract, the bonfire behind it; `supports` drives UI hiding | Codex | as 3; `test/worlds.test.mjs` for the contract |
| 5 | `src/core/screenFx/`: screen-space effects as GLSL chunks used by `pixelPass.js` | Codex, then a visual check by Claude | `check` + e2e green; before/after screenshots match |
| 6 | NEWT rig measurements + `newtPose.js` retarget, node tests (every move, every beat: no NaNs, bones inside limits, hands out of the head) | Codex | new tests green |
| 7 | The procedural layer in `character.js` (weight 0 by default: the toy unchanged) | Codex | invitation tests and e2e unchanged |
| 8 | `worlds/newt.js` v1: mount the stage and NEWT, the show-event table above, lazy load | Codex (scaffold), Claude (tuning) | `?world=newt` plays the demo track; `e2e/newt-world.spec.mjs` |
| 9 | *World* setting, start-screen choice, `supports`-based hiding, settings migration | Codex | `test/vizSettings.test.mjs` extended; e2e |
| 10 | Screen FX in `retro.js` for the NEWT world | Codex, then Claude | screenshots |
| 11 | Feel pass: dance picks per section, petal amounts, camera cuts, face timing | Claude + Newton | Newton's sign-off |
| 13 | `LIVE_TRIGGERS` in `speech.js` driven by show events; `invitation.live` content, rules and the admin's section | Codex | unit tests per trigger (priority, cooldown, no repeats); admin tests |
| 14 | Beat-locked typing and `--beat` text effects (`bubble.js`, `markup.css`) | Codex, then Claude | `invitationBubble` tests extended; a screenshot at the beat |
| 15 | The set script: `at` boxes on the music clock in `dialogue.js`; title cards as the opening box | Codex | dialogue tests on a fake bar clock |
| 16 | The tablet as a deck: the spectrum texture on `device.js`'s screen | Codex, then Claude | screenshot |
| 17 | *Hands On*: the toy's gestures in the world; the brain's `dance` state | Codex | brain tests for every interruption |
| 18 | Faces, looks, petals and the envelope card on show events | Codex (wiring), Claude (feel) | e2e + screenshots |
| 19 | *Say* field and MIDI line pads | Codex | `midi` tests; e2e |
| 20 | Writing the lines and the first set script | **Newton** | his voice: nobody else should write NEWT's jokes |
| 12 | Docs: `docs/bonfire-live.md` and `docs/invitation.md` updated; this file's status | Codex | merged |

Tasks 1, 2 and 6 can run in parallel; 3 → 4 in order; 5 is independent; 7 needs 2; 8 needs 4,
6 and 7; 9 needs 4; 10 needs 5 and 8; 13–19 need 8 (13, 15 and 17 can start on fake show events once 3 lands); 20 can start any time. Docs (12) go last.

### Briefing Codex

- Give it one task row per run, this file's path, and the finish line. Say "move, don't change"
  outright for tasks 1–5.
- Tell it the checks: `npm run check` always; `npm run e2e` (or the named spec) for anything that
  touches a page. If its container can't run Playwright, CI does (`.github/workflows/checks.yml`);
  the PR isn't done until CI is green.
- Ask for the PR description to list every moved symbol with old → new path, so the review on
  a phone is a skim.
- Claude in this cloud session can watch the PRs (`subscribe_pr_activity`), review them, fix
  CI, and do the visual checks (5, 8, 10, 11) with screenshots, so the parts that need eyes don't
  wait for Newton to get back.

## Risks

- **Task 3 is the big one.** `director.js` is 1,274 lines and timing-sensitive (build stages, the
  90 ms blackout, hit-stop repaying its time). Mitigation: move code as is, add a test that runs a
  recorded analyser trace through the old and new director and compares the `fire.*` call log.
- **Proportions.** Knight moves were tuned for a tall armored body; on a chibi some will read
  badly. Expect to drop or retune two or three moves (that's task 11, not a blocker).
- **Two WebGL pipelines on one page.** Only one world is mounted at a time; switching disposes the
  old one's renderer (the envelope already handles a refused second context).
- **Payload.** The NEWT world's chunk plus `newt.glb` load only on demand; check the
  visualizer's first load in `docs/performance.md` terms before and after.
