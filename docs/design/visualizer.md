# Bonfire Live (audio visualizer): design notes

Status: **implemented and verified locally** (2026-09-27, all three rounds): unit and
end-to-end tests pass (`npm test`), and the demo track was run in the browser through
full groove → breakdown → drop cycles, with every camera rig, look, drop hit, color
mode and firefly move exercised.
Source: Newton's request for an audio-reactive visualizer for a DJ set built from the
bonfire's design, assets and code, then three rounds of feedback:

1. More impact and movement (bonfire particles, sword particles, the blade waiting for
   the drop, fireflies), more camera switching, glitch and rave effects, extra ring
   triggers.
2. A better drop recognizer, effects other than glitch, sword swings with fire trails
   and camera angles, and fireflies that flicker on and off with the music instead of
   staying lit. Mid-round they added:
   - Fireflies stay near the fire and a random few swirl around the blade.
   - Trails match the element.
3. Additions, with the code kept well factored: weapons that move like floating,
   enchanted living weapons, with procedurally sound swings and stabs (keeping the
   strike); cinematic cameras that follow the blade; a lighter lightning trail; random
   colors from the admin's palette tools, fully random included; a new firefly movement
   (bouncing and darting, in every direction, at tempo-based speeds); settings for all
   of it; "endless variations". Mid-round: scanlines and mirror join the looks'
   variations, and drops get varied effects (the negative flash kept).
4. After round 3 went live: vertical mirroring alongside horizontal and quarter; a bug
   (the weapon sometimes disappeared after a slam); a pulsing glow for the ice, with
   outline echoes; lightning over the whole blade with a slashing trail, strongest at
   the tip and fading near the guard.
5. Round 8 (2026-09-29): "more options in the visualizer settings (including rendering
   options)", with every effect off, in the mix or always. And the knight: "In the
   visualizer the knight has an additional dance behavior (at appropriate moments) and is
   sometimes not there at all to avoid clutter … maybe multiple knights can dance around
   the campfire"; the P render menu here too.
6. Round 9 (2026-09-30): "a new extension: /painter, a scene editor tool that utilizes
   effects from the visualizer to let the user craft a scene or visual. that can then
   export to a scene setting for the visualizer … we should add a major feature to the
   visualizer: Preset Scenes for it to loop through"; knight options (the style, the
   finish, the edge glow, the seat pose) in the Knights tab and in scenes; the Default
   Dance among the moves.

## Requirements

| # | Ask | Where it lands |
| --- | --- | --- |
| V1 | A visualizer for a DJ set, from the bonfire's design, assets and code | `/visualizer/`: the real scene (`src/bonfire/`) with the site's palette, fonts and UI pieces |
| V2 | Reacts to the music | `src/visualizer/analyser.js` (bands, onsets, sections), `tempo.js` (beat grid), `director.js` (music → fire) |
| V3 | More impact: bonfire effects and particles | Bigger drive and beat hits, wind thrown on alternate beats, more particles (`particles` setting) |
| V4 | Sword particles; the blade waiting for the drop | The held blade's vortex, fling on release (`weapons.js`); a beat glow and silhouette echo on the planted blade |
| V5 | Fireflies | They blink together, dance around the fire on the beat and speed up with the volume (`fireflies.js` `dance`) |
| V6 | More camera switching | Ten shots with their own moves; cuts every 2 bars, every bar after a drop; a zoom punch on kicks |
| V7 | Glitch filters, rave flavor | Glitch layer in `pixelPass.js`: torn rows, RGB split, crunch, wave, scanlines, static, mirror, negative flash |
| V8 | Extra ring triggers | `scene.ring()`: every N bars, on `R`, on small drops, and when a combo plunges |
| W1 | Better drop recognition | `sections.js`: kick-gone breakdowns, tension builds, a multi-cue drop score with an expectation gate and confirmation (`test/drops.test.mjs`) |
| W2 | Effects that aren't always glitch | `looks.js` + `pixelPass.js`: ember, glitch, echo, ripple, kaleido, ink; breakdown letterbox and iris |
| W3 | Weapon swings with fire trails and camera angles | `weapons.js` (swing phase), `swingTrail.js`, combo shots in `director.js` |
| W4 | Fireflies flicker on and off with the music, dance, glow and light effects | `fireflyShow.js`, `fireflies.js` (`show`, `heat`, `orbit`, `leash`, `dance`, trails) |
| W5 | Fireflies not pushed to the edges; a random number swirl around the blade | a leash, a dance with no outward push, no scatter on extra rings; roles dealt randomly each breakdown |
| W6 | Trails match the element | `swingTrail.js` (embers, sparks and bolts, frost glints) and the held-blade vortex |
| X1 | Floating, enchanted living weapons with procedurally sound swings and stabs | `bladeMotion.js`: slashes, thrusts, spins, glides, hovers, flourishes, the plunge (`test/bladeMotion.test.mjs`); the held blade's sway and trembling, a planted blade's shudder (`weapons.js`) |
| X2 | Keep the strike | The hold and strike are unchanged; the plunge home keeps the straight drive, now sometimes after a flip or corkscrew |
| X3 | Cinematic cameras that follow the blade, a shot following the swing | `camera.js`: follow, ride, track, orbit, vertigo; close angles that track the blade; whip and glide transitions; new shots (crane, dolly zoom, long lens, sweep) |
| X4 | The lightning swing: only the lightning and the tip's particles | `swingTrail.js`: the bolt along the point's path, sparks off the point only, no mid-blade ribbon |
| X5 | Random colors from the admin's palette tools, fully random included | `colors.js` over `src/paletteGen.js` (moved from `admin/ui/palettes.js`): site, harmonious (any scheme), fully random, a mix; scenery colors optional |
| X6 | Fireflies that bounce or dart, in every direction, at tempo-based speeds | `fireflyMoves.js` + `fireflies.dart()`: bounce, dart, compass, zigzag, scatter, alongside the swing |
| X7 | Endless variation, settings for all of it | Random shapes and rolls everywhere (moves, camera rigs, look details, drop hits, palettes, firefly timing); Living Blade, Colors, Fireflies, Camera and Rave FX settings |
| X8 | Scanlines and mirror in the looks' variations; varied drop effects | `looks.js`: off / in the mix / always, three scanline styles; twelve drop hits, one to three per drop |
| Y1 | Vertical mirroring alongside horizontal and quarter | `pixelPass.js` mirrors x and y independently (eight modes); `looks.js` MIRRORS kinds, a *Mirror Kinds* setting |
| Y2 | The weapon disappeared after a slam | `weapons.js` restores the planted Euler angles, not the quaternion (see below); `test/weapons.test.mjs` |
| Y3 | Ice: a pulsing glow and outline emission | `ice.js`: a beat's glow rising through the crystals (and their light), wireframe echoes of the bigger crystals on bars and rings |
| Y4 | Lightning over the whole blade, a slash trail strongest at the tip | `swingTrail.js`: edge bolts along the blade, a five-band sheet of trails and cross bolts fading toward the guard |
| Z1 | More ways for the swing camera to ease, as variations per combo and per move | `cameraEase.js`: smooth (the original lag), spring, bouncy, heavy, snappy; rigs chase with a lag or a damped spring, moves between framings use the feel's curve; *Blade Camera Feel* (a mix re-rolls between moves); `test/cameraEase.test.mjs` |
| Z2 | A randomizer for the "every N bars" settings | `bars.js`: *Random* picks one of the setting's own intervals and rolls again each time it fires (still on multiples, so on phrase lines); `test/bars.test.mjs` |
| Z3 | An intro title card, and more title cards | *Title Cards* tab: the main card as the intro and on drops; up to 8 more, each on drops (taking turns), every 32 bars, or on its key (Shift+1…9) |
| Z4 | Brightness → color temperature; sub-bass breathing | `director.js` → `glitch.temp` (a pre-palette tilt in `pixelPass.js` and the cast light) and `breath` (fire size, the camera's field of view) |
| Z5 | Staged build-ups, a silent frame before the drop | four stages (pulses, look bursts, a ring, sparks and tremors); after a build a 90 ms blackout, then the drop lands out of it |
| Z6 | A section-based effects budget | `budget` in `director.js`: calm intros and breakdowns, busy grooves, everything in the 8 bars after a drop; scales look strength, drop hits, sparks, extra rings |
| Z7 | The start panel off the fire; each source explained | descriptions under each source; the fire framed to the side on landscape screens, above the panel on tall ones |
| Z8 | Settings in tabs, presets, simple / all | `settings.js`: eleven tabs (Sound, Show, Blade, Look, Render, Effects, Camera, Fireflies, Knights, Title Cards, My Setups), a *Simple* view of the key settings, a hint (?) on every one; presets Chill, Club, Rave, Low Flash |
| Z9 | A grouped HUD | What it hears · Beat (BPM, set BPM, nudges, beat 1, tap) · Moments · View |
| Z10 | Saved setups | named snapshots in this browser, load / delete, export to and import from a file |
| Z11 | A separate output window for a projector | the canvas streamed (`captureStream`) into a pop-up that can go full screen on another display |
| Z12 | More scenes: a forge, a shrine | `src/bonfire/scenery.js`, built from primitives in the model's materials where the ruins stand; *Scene* setting, or a new place every other drop |
| Z13 | An Ableton Link helper | `tools/link-bridge.mjs` (`npm run link`): Carabiner → a local WebSocket → `link.js` → `tempo.external()`; *Beat From: Ableton Link*; `test/link.test.mjs` |
| Z14 | Manual BPM and a phase nudge | a BPM field (holds until cleared), `[` `]` nudge 10 ms, `D` makes this beat beat 1; `tempo.js` `setManual`, `nudge`, `clearManual` |
| AA1 | Off / In the mix / Always for every effect, existing ones included; endless variations | `looks.js` `MODES`, `active()`: looks (always ones stay on under the look taking its turn), drop hits (always ones come with every drop), layers, and the director's sparks, blade echo, zoom punch, temperature, breathing, blackout and negative flash. In the mix re-rolls with every look, each time with new details. A new *Effects* tab; old on/off settings carry over (`settings.js` `mergeInto`); `test/variety.test.mjs` |
| AA2 | Layer blending (from the Pixel3D study) | `pixelPass.js` `blendMode`: twelve modes. Echoes, the ghost trail, a warp over the plain picture, ink, the negative, scanlines, glow and the gradient map each blend their own way; *Blend Modes* rolls new ones per look (off: the classic ways) |
| AA3 | Ghosting, motion blur, flicker | a half-float ghost trail (so faint trails fade instead of sticking on a palette color); motion blur from each texel's depth and last frame's camera (cuts reset it); flicker on the beat, a rolling band, film jitter or a candle's waver, kept faint |
| AA4 | Painterly and watercolor | `pixelPass.js` `styleShader`: brush strokes (the main brightness band in a rotated, stretched brush) or a Kuwahara wash with pigment pooling at edges; brush size, angle and length rolled each time |
| AA5 | Glow and a gradient map | glow from the scene image's mipmaps, swelling on kicks; the gradient map recolors by brightness through three palette slots, rolled |
| AA6 | Recolored scenery that works, with more variety | `colors.js` + `paletteGen.js` `vividScene`: any flame (the site's too), two to four times the tint, around the flame's hue or any hue, sometimes fully random, a new set every landing; off / with some flames / with every flame |
| AB1 | Fireflies that dart in ANY direction | `fireflyMoves.js` `anyDirection`: a new move, *Dart Any Way*, dashing along a uniform direction on the sphere (every heading, every tilt), leaned back in past 1.9 m from the fire and upward near the ground; `test/variety.test.mjs` |
| AB2 | Ice tufts when the ice emits | `ice.js` `sprout`: every echo (the slow pulse, a stoke, a ring, a beat) sends up tufts of three to five crystals from one root around the cluster, with a glint and a breath of chill, in the cluster's own instanced mesh |
| AB3 | Weapon swaps that take after their element, uncluttered | `weapons.js`, `forgeParticles.js`, `forgeFx.js`: one habit per step. Lightning: a flickering white-hot edge with an arc crawling along it, crossed sparks that snap and blink, a broken jagged helix, a bolt striking the pommel as it forms. Ice: a frost edge, chips that fall before a slower helix gathers them and glint as they freeze on, a hexagonal helix, a crystal echo growing in steps. Fire: unchanged |
| AB4 | The pack, in the visualizer too | `src/ui/pack.js` (shared with the site): Map (scene), Anvil (weapon, forged in the current colors), Spell Tome (the element's ring, the living blade, a new element at once, new bonfire colors); I opens it; it sits above the HUD and fades with it |
| AB5 | A way back to the portfolio | the name and mark top left on the start screen (hidden while live) |
| AB6 | Clips of a set | `record.js`: V records the picture (scaled up by a whole number to about 1080 lines, hard edges) with the sound it hears, saved as MP4 (WebM where MP4 can't be recorded); `test/record.test.mjs` |
| AB7 | The site doesn't carry the visualizer's weight | `frame.js`: the effects layer and its six extra buffers exist only with `createBonfire({ effects: true })` |
| AB8 | Presets as the main controls | `settings.js` `presetButtons`, `presetOf`: the presets lead the settings dialog (above the tabs) and the start screen (*Feel*), the one in use marked; the per-effect switches stay in the tabs |
| AB10 | Altar scenes, and the forge and shrine without artifacts | `scenery.js`: *Cathedral Altar* and *Cult Altar* join the Scene setting and the mix; every scenery is built flat-faced, gap-free and non-coplanar, with glows by kind (`scene.js`) |
| AC1 | More settings, rendering options among them | A *Render* tab (`settings.js`, `render.js`): pixel size, dither and its pattern, outlines, palette, few colors, exposure, vignette, fog, shadows, x-ray, the flame's frame rate, color change time, firefly trails, how hits land (hit-stop, hit flash, debris, ground marks); a hint on each; presets and setups carry them; `test/render.test.mjs`, `test/vizSettings.test.mjs` |
| AC2 | Render options without touching the site | `scene.js` render overrides: `setRender` (merged over `effects.render`, standing through `applyEffects`; the flame's frame rate, color change and hit settings written through and put back), `setPalette` (the flame's, Ashen, Moonlit, or slots of the scene palette that follow the flame), `setFog`, `setShadows` (the fire light's shadow, no rebuild), `setXray`; `fire.render` reads them back. Unset, the site's uniforms, fog and shader are as before |
| AC3 | Every render effect off / in the mix / always, endless variations | `render.js` `createRenderShow`: outlines, few colors (rolled from nine), pixel size shifts (with looks and on drops), x-ray flips, hit-stop, hit flash, debris and marks roll with each look (`looks.js` `CHANCE`, `turn`); the dither pattern and fog take a mix |
| AC4 | An x-ray of the passes as part of the show | `pixelPass.js` `uXray` (the effects layer only): the normals (each facing in a palette color of its own), the lighting alone, the particles alone, or the flow field, carried on through the effects and the palette. Flips land on a beat and last a beat, two or a bar, never on a drop's own bar; the *X-Ray* drop hit lands the drop in one for a beat |
| AC5 | More layers | `looks.js`: *Grain*, *Cinema Bars*, *Spotlight* (a dithered iris round the fire, breathing with the music) and *Chroma Split*, each off / in the mix / always with rolled amounts, combined with the looks' and the breakdown's own (the tightest framing wins) |
| AC6 | Settings a menu can drive | every render option is a saved setting; `render.js` `RENDER_STEPS`, `stepRender`, `renderText` and `applyRenderSettings(fire, settings)` (only what changed is sent) for the P render menu |
| AD1 | The knight dances at the right moments | `knightShow.js` (a pure scheduler, like the fireflies' show) driving `fire.knights`: seated nods on strong beats before a drop, still and watching the forged blade in breakdowns, up and bouncing at the build's third stage (double time at the fourth), a leap and Praise the Sun on the drop's first beat, two bars of big moves, then the groove's, a new move every *New Move Every* bars, sitting again on a phrase line when the energy falls (and at once when the music stops or the source changes); a cheer for a small drop (with *Gestures on Drops*); a flinch when the living blade swings close (with *Reactions*); `test/knightShow.test.mjs` |
| AD2 | Sometimes not there at all, to avoid clutter | presence *In the mix* is rolled only where a change is hidden (the start, a big drop's blackout and flash, a new scenery), with how many and their helmets; never mid-phrase (tested) |
| AD3 | Several knights dancing round the fire | 1–4 (*How Many*, or Random); how many get up follows the budget, `max(1, round(n·(0.4+0.6·budget)))`, recounted on phrase lines; formations Round the Fire, Line, Solo, Canon, a mix; places on the ring's clear arcs per scenery, 50° or more off the cameras' side, extras resting at side places (not the knights module's front slots), and the dancers 0.5 m or more from anyone sitting one out (the cast's layout less the sitters' places; Round the Fire spread over the ring less their arcs) |
| AD4 | A Knights tab, every behavior three ways | Knights, Dance, Summon on the Drop, Gestures on Drops, Knight Cameras, Armor Shine (`fire.knights.setShine`: rest and flare sweeps rolled apart in the mix), Reactions (`fire.knights.setReactions`: flinches, leans, hops, eyes on the blade) (off / in the mix / always, rolled where it's hidden); How Many, Formation, Moves, Helmets, New Move Every (`bars.js` `danceBars`, with Random); Rave: four, dancing whenever locked, shining and reacting; Chill: one, resting, shining, no reactions; Low Flash: no shine; Club is the defaults |
| AD5 | Cameras for the dancers | `camera.js` `KNIGHT_SHOTS` (*Dancers Low*, *Round the Fire*, *Dancers Wide*, widened on tall screens) and the *Dancer* rig; about one cut in three while they dance (*Knight Cameras*); `hidesFire`: no cut to a shot with a knight between the lens and the fire |
| AD6 | The P render menu in Bonfire Live | `src/ui/renderMenu.js` (the site's), rows for the Render tab's switches (`render.js` `stepRender`, `renderText`), a reset row; on the start screen too; Colors moves to Shift+P; digits go to the menu before the element hits |
| AD7 | Keys, MIDI, the pack | K dance now / sit, Shift+K in or out (on the next drop if a blade is held, else at once); a Dance button in *Moments*, the knights on the state line; MIDI *Knights Dance*, *Knights In / Out*; the pack's *Knight* (helmets, gestures) |
| AE1 | Preset scenes to loop through | `sceneLoop.js` (pure): Scenes off / in the mix (stretches of the free show between scenes) / always; from built-in + mine, built-in or mine; in turn or a shuffled deck (every scene before a repeat, never the same one twice running); a new one every *Change Every* bars (16–128, Random, or only on drops; a drop brings one only if it's a big one, once a quarter of the stretch has played); The Loop's in/out switches and the admin's hidden ones stay out; N the next one, `?scene=…&solo` only one; `test/sceneLoop.test.mjs` |
| AE2 | A scene is a whole picture the show plays | `scenePlayer.js`: a scene (`src/scenes.js`) laid over the settings (`layered.js`) and pinned in the looks, the camera and the colors, applied in one moment and part by part (the Painter's edits touch only their part); Hold (everything for the stretch) or Base (it opens the stretch, then the show plays on); `test/scenePlayer.test.mjs` |
| AE3 | Scene changes never pop | a scene changes only in a hidden moment: the music's start, a drop's strike (the breakdown forges its weapon in its flame and element), a phrase line's impact (the swap forged with its equipment, landing on the downbeat) or a flash on the downbeat (the forge busy, the same weapon, N); verified frame by frame at real speed |
| AE4 | Every scene effect optional, and safe | the flashy clamp: a scene can't turn back on what the user (Low Flash, Chill) or reduced motion keeps off (flicker, x-rays, the drop's X-Ray, Ink Flash and Color Cycle, the Ink look, played as Ember, the Echo look's palette steps, armor shine) or throw more drop hits than theirs, nor bring a camera move over *Camera: Still* or an element the user has unchecked; under reduced motion a scene's look plays as Ember with only its still layers, held still (the Painter's `paintedLook` aside); anything a scene leaves out (a detail, a layer in the mix, the weapon, the element, a helmet) is rolled each time it comes round; `test/scenePlayer.test.mjs` |
| AE5 | Knight options | `knightShow.js`: *Style* (the site's own, one of `knightStyles.js`'s, or in the mix, leaning to the site's default), *Armor Finish*, *Edge Glow* (off / in the mix / always, `knightGlow`: in the mix some stretches glow at a strength rolled round *Glow Strength*, `knightRim`; always at it), *Seat Pose*; rolled at the hidden moments, by hand at once (a new style burns them away and forms them in it); a scene may set each (its Edge Glow too: off, in the mix round its strength, or always at it; `knights.glow`, new scenes in the mix); the Default Dance in *Moves* |
| AE6 | Preset scenes that ship with the site (the plan: 4 starter scenes made in the Painter) | content.json `scenes`: Cathedral Kaleidoscope, Frozen Shrine, Forge Rave, Moonlit Ruins, painted in the Painter, exported and imported like the admin does; `e2e/scenes.spec.mjs` |
| AB9 | Manual control for live shows | `midi.js`: Web MIDI with learn (Settings → Sound → MIDI Controller): drop, forge/strike, ring, swing, next shot, next look, a look burst, a hit per element, record; the mapping is kept per computer; `test/midi.test.mjs` |

## Key decisions

- **Stages only when needed.** The heavier layers (motion blur, ghosting, glow, painterly,
  watercolor) need the finished scene around each pixel, so for them the scene is drawn
  into its own image first and the final pass reads it. With none of them on (always, on
  the site) the single pass runs as before. Everything still snaps to the palette at the
  end, so any blend mode comes out in the scene's own colors.
- **In the mix stays readable.** At most two heavy layers come in at once, and only one
  repaint. Layers set to Always don't count toward that limit.

- **Link through a bridge, not in the browser.** Link is UDP multicast, which pages can't
  do. Carabiner (a small free app) joins the session and speaks plain text over TCP; the
  bridge turns that into a WebSocket on 127.0.0.1 and stamps each message with the beat
  *now*, so the page places it on its own clock. The tracker lets go after 2 s without
  word, so a closed bridge falls back to listening.
- **Hit-stop repays its time.** A freeze holds most of its time back from the simulation
  and pays it back a little faster afterwards, so a blade routine timed to the beat still
  plunges on the beat.
- **The output window streams the canvas** instead of running a second renderer: one
  simulation, one set of decisions, pixel-exact on both screens.

- **A page of its own, same scene.** `visualizer/index.html` is a second Vite entry
  (deployed as `/visualizer/`, unlinked). It creates the bonfire with `createBonfire`
  like the site does. Everything it needs from the scene is an additive hook that is
  neutral by default, so the site renders exactly as before:
  - `drive` and `glitch`: live modulation objects, all zeros on the site.
  - `onFrame`, `setPose` (with `roll`), `pulse`, `sparkle`, `ring`, `echo` and `shake`.
  - Held and paced swaps.
- **Web Audio `AnalyserNode`, float spectrum, no smoothing** (the node MDN's
  visualization guide draws from). Onsets are spectral flux, as a rate so 60 and 144 Hz
  displays agree, over an adaptive threshold. Magnitudes are compressed relative to the
  input's running peak (a slow 25 s decay), so a quiet line in and a hot master behave
  the same. Tested at 0 and −24 dB.
- **Beats come from a predicted grid, not from onsets.**
  - The tempo comes from autocorrelating the onset envelope, with a prior around
    125 BPM (at 174 it settles on 87, half time).
  - The phase comes from a comb over the envelope.
  - The grid is re-based onto the latest beat before every correction. Without that, a
    tempo nudge was multiplied by the number of beats since the lock and the loop went
    unstable at slow tempos.
  - Beats go out `offset` ms early (default 40) to make up for render and display lag.
  - Pulse strength is how hard kicks have recently landed on the grid, so pulses fade in
    a breakdown and return with the kick.
- **Breakdowns keep time.** In a breakdown the grid free-runs, with no retuning or phase
  jumps. Tunes don't change tempo there, and what's left (pads, risers, a snare roll on
  every 8th) is ambiguous: an 8th-note roll once pulled the grid half a beat off.
- **Sections from several cues, not one** (`sections.js`). The music is summed per beat
  against the tune's own full-energy reference:
  - **Breakdown:** the kick gone for 1.5 bars, with a kick present before it (an ambient
    intro isn't one). This catches sub-pad breakdowns, which a bass-level rule missed.
  - **Build:** tension from risers (the highs' slope), accelerating flux (rolls, which
    onset counts saturate on) and thinned bass.
  - **The drop's score** combines:
    - jumps in bass, loudness and bass-over-highs balance;
    - the kick returning, a downbeat, a phrase boundary;
    - prior tension, and a silence gap (a whole quiet beat).
  - **Instant or confirmed:** a drop fires at once only where one is expected (a phrase,
    a build or a gap). Otherwise the next beat's kick confirms it, so a lone boom
    doesn't count.
  - **Kicks:** onsets must reach the kick band's level (−24 dB of recent peaks) within
    50 ms, so pads and risers in long breakdowns don't read as kicks.
  - **Tempo switches** re-derive the bar count from the last anchor, so phrases survive
    an octave change.
  - **Tested** on ten drop shapes and non-drops, all within 80 ms of the bar line.
  - Silence is 2.5 s under −64 dBFS.
- **Swaps land on beats.** A phrase swap starts on a downbeat and is paced to the time
  actually left until the target beat. Weapon phases now carry their overrun into the
  next phase, so a swap takes exactly its length (the site's 3.58 s swap included).
- **Forge in the breakdown, strike on the drop.** The swap has a `hold` mode: the new
  blade forms and hangs over the fire, and a `release` strikes at 3× speed (about
  40 ms). A swap still landing when the breakdown starts delays the forge instead of
  losing it. A blade held more than 50 s strikes on the next downbeat.
- **Glitch before the palette.** The glitch layer changes where each pixel reads the
  scene, then the usual quantize runs, so tears and splits stay pixel art in the
  flame's colors.
- **Flashes stay safe.**
  - Beat exposure pulses are gentle (≤10 %).
  - Whole-scene flashes still come only from the lightning ball's discharges (at most
    about 2 a second).
  - The negative flash happens only on drops, at most one every 2 s, and has its own
    setting.
  - Reduced motion turns off flashes, shake and moving glitch: the free show's looks are
    off, the looks answer no beat, hat or hit (`createLooks({ reducedMotion })`: no ripple,
    spin, ink or Echo color cycle on the downbeats), and a scene's look plays its still parts
    only (see the flashy clamp below).
- **Fireflies blink; they don't glow.** In the show a firefly is either lit or out:
  - **Patterns:** blink (a random handful per beat), species signatures, a chase,
    twinkle on hats, a breathe wave in breakdowns, a strobe after drops.
  - **Glow:** speed no longer adds glow, only the color's heat.
  - **Movement:** the beat is a hop plus a swing around the fire, with no outward push.
    A leash pulls roamers back within 2.1 m, and extra rings don't scatter them.
  - **Breakdown roles** are dealt at random each time: two to about 40% swirl around a
    held blade, some ring the fire, the rest roam.
- **The living blade is closed-form motion, not keyframes or physics** (`bladeMotion.js`).
  A routine is planned from the beat times; its pose at any time is a pure function, so
  hits land exactly on the beat whatever the frame rate, and it's unit-tested at 480 Hz.
  - **Rest to rest.** Every segment (the rise, each move, each glide, the plunge) starts
    and ends still, so they join without a jolt; glides ease with a C2 smootherstep, and
    anything added on top (a bulge in the path, a twirl, a hover's bob) is zero with zero
    slope at both ends.
  - **Wind-up, strike, follow-through.** A slash cocks back (smootherstep), strikes with
    θ ∝ uᵖ (fastest at the hit), and follows through on a Hermite curve that leaves at
    the strike's speed and stops, overshooting when its slope is above 3. A thrust's
    follow-through lasts a few hundredths of a second and carries as far as its speed
    takes it, then it quivers (a damped 16 Hz rotation from the grip).
  - **Shapes are random, then filtered.** A move's plane, side, sweep, pivot and lunge
    are drawn from the camera when its glide begins; a dozen candidates are sampled, those
    whose tip dips under 0.22 m, strays from the clearing or comes within 0.8 m of the
    camera are dropped, and the one whose wind-up is nearest the blade's current pose
    wins, so moves flow like a combo. A big turn still needed takes time from the
    wind-up.
  - **Timing fits the tempo.** Durations are fractions of the beat, clamped; when a beat
    is too short, a move's durations shrink together (so its speed through the hit
    still matches) until each glide has room. Spins need a rest before them.
  - **Cuts land before planes.** `onMove` fires before a move takes its plane, and the
    plane comes from where the camera is headed (`camera.axes()`), so a whip pan or a
    cut to a new angle is already accounted for.
  - The world pose is converted into the holder's space each frame; flames and sparks
    within 30 cm of the blade get its velocity; the plunge restores the rest pose and
    throws the ring.
- **The planted angle is kept as Euler angles.** The shudder and the settle wobble write
  `rotation.z`, a wobble only while x and z are 0. A routine used to put the weapon back
  by copying its quaternion, which makes three.js re-derive the angles: for a blade
  turned past 90° (either face is shown at random) they can come back as (π, π − y, π),
  and writing z then planted it upside down, underground. The next routine started
  from that pose and flung the blade metres up. Now the Euler angles are restored, and
  a glide's safety arc is capped at a metre.
- **Cameras are rigs over a shot list** (`camera.js`, moved out of the director). Each
  frame a shot or a rig makes the framing it wants; a transition (cut, a 0.24 s whip with
  a lean, a 0.9 s glide) blends from what was on screen; then every framing is kept in
  the clearing (above 0.25 m, out of the fire, in front of the ruins). Rigs follow the
  blade through `fire.blade` (its middle, point, grip and rotation), with springs so they
  lag and whip. The dolly zoom keeps the subject's size by widening the lens as
  `tan(fov/2) · distance` stays constant.
- **Made palettes are ordinary flames.** `colors.js` adds them to `palette.js`'s flames
  as hidden `live-N` entries (the scene needs no change), keeps the last six (at most
  three can be in use: burning, blending out, forging), and names them for their hue
  (`flameTitle` then says "Cobalt Lightning"). The generator moved to `src/paletteGen.js`
  so the site and the admin share one copy; its text-contrast rule still holds. Scenery
  colors blend in `base` and the scene re-reads them (`refreshScene`).
- **Firefly moves are dashes on the flight model.** `fireflies.dart()` overrides a
  firefly's steering for a moment with the velocity of a closed-form path, a dart
  x = 1 − (1 − u)³ (fast start, dead stop) or a bounce x = 4u(1 − u) (a thrown ball),
  still sliding along the scenery. Each firefly has its own period (a half, one or two
  beats), offset and length, so a move is a texture, not a drill (the compass is the
  exception: all together).
- **Looks roll their details.** Mirror (four modes), scanlines (three styles), the echo's
  direction and the spiral's turn are rolled each time a look comes round; *in the mix*
  gives a look a 30% chance of each. Drop hits are timers layered over whatever look is
  on (each parameter takes the larger of the look's and the hit's), drawn one to three
  at a time, never the same set twice running.
- **Looks are one pass.** Kaleidoscope, ripple, feedback, iris, letterbox, ink and color
  cycling all live in the existing pixel pass. Feedback is a ping-pong pair of low-res
  targets plus a copy, used only while an echo is on. Its echoes lose a little each
  frame, because dithering would otherwise hold dim ones at the same palette color
  forever.
- **Density is a rebuild.** Particle counts size GPU buffers, so changing *Particles*
  (or the fireflies' *Light Trails*, made with the scene) rebuilds the scene and keeps
  the current weapon, flame and element (`dialogs.js` `REBUILD`).
- **Render options are overrides, not settings edits.** The Render tab never writes the
  site's `effects`; the scene keeps its own overrides over them and clears back to them.
  Three values the scene reads where they're used (the flame's frame rate, the color
  change time, the hit settings) are written through while overridden and put back after.
  Shadows toggle the fire light's `castShadow`, which recompiles the lit materials once
  instead of rebuilding the scene.
- **The x-ray goes through the palette.** The breakdown shows the passes as they are; the
  show's x-ray replaces the scene with a pass and carries on (effects, dither, palette),
  so a flip stays pixel art in the current colors. Raw normals are pale and snapped to
  bone, so the x-ray's normals give each facing a palette color of its own instead.
- **The knights' show is a scheduler over the scene's API.** `knightShow.js` has no
  three.js: every call takes `fire.knights` (safe with no model), and it keeps its own
  record of what it asked each knight to do. The director hands it the moments, a beat
  and a bar at a time; the beat position the knights dance to is sampled every frame
  (`beatCount + (now + lead − beatAt) / period`), eased over 80 ms through nudges and
  taken at once modulo 8 beats (every move's cycle divides 8) when the grid restarts.
- **Places are chosen for the cameras in front.** From the front, two dancers on one side
  of a 1.2 m ring stand one behind the other, and the knights module's slots at 310° and
  50° are diagonally in front of the fire. So the show's own layouts put the second
  dancer across the fire and the third behind it to its right (clear everywhere but the
  cult), and the knights resting on the ground go to those side places too.
- **Dancers keep off the knights sitting one out.** With fewer dancers than knights the
  layouts for the dancers' own count share bearings with the rest layout, so a dancer
  could be sent onto a seated knight (0.3 m off). The dancers now take the whole cast's
  layout less every place within 0.5 m of a sitter (where he sits, or where he'll be
  brought to rest): on a phrase line's recount they keep their places, and the first
  takes the one the rest layout left by his seat, never the far side. Round the Fire
  spreads them over the ring less the arcs by the sitters; if a sitter is somewhere the
  layout doesn't expect, a layout or a spread round him (`ringAround`, `cutArcs`).
- **Some moments have no event of their own.** Changing the source resets the analyser
  to silent without a *silence* event, so `stopSource()` calls `director.silence()`; a
  rebuild (Particles, Trails) makes a new director while the music plays, with no *start*
  event, so the knights take the first live frame as their start; a drop that brings a
  new scenery changes it before the knights are told, and hands them its name, so they
  take their places there once instead of arranging twice.
- **A dance stays seated unless told.** The knights module keeps `seated` from the dance
  before (so a new move can be handed over in place), and knights nodding along in their
  seats kept dancing sitting down when the show got them up (K, or Dance Always). The
  show now says `seated: false` whenever it puts them on their feet.
- **A breakdown stops the dance without sending the first knight home.** His standing
  spot before his seat is inside the knights module's no-walk ring round the fire, so any
  walk from it is an ember walk (burning away and forming again); sitting down for the
  breakdown and getting up for the build meant two of them in three bars. He stands and
  watches; the others sit where they are. (Round 8, phase 3: the knights module now walks
  him from his seat round the fire, `knightPlaces.js` planWalk, so that walk is a real one;
  the watching stance stays.)
- **Echoes dissolve in a few colors.** With a palette of a few colors, an echo's fade
  can't take it down a step (the next color is too far), so the echo stuck on the screen
  and whited it out. With fewer than seven colors the echoes also lose a random scatter
  of pixels each frame.

### Preset scenes (round 9)

- **A scene is mostly settings.** Every part of the show already reads the director's
  settings live, every frame (the render show, the colors, the knights, the camera, the
  bar clock, the director's own switches). So a scene is a layer of settings over the
  user's (`layered.js`: a Proxy; reads take the scene's first, writes go to the user's,
  so saving, My Setups and the presets never see it). `scenePlayer.js` `sceneOverrides`
  turns a scene into that vocabulary. Only what settings can't say gets a pin of its own:
  - **the look** (`looks.js` `pin`): its look alone, its layers' switches, the details
    and blends it pins; each of the look timer's turns re-rolls only what it leaves to the
    dice and its layers in the mix, so a held scene keeps finding new combinations. It
    shows at its painted strength in silence (`update`'s `rest`); the beat pulses it.
  - **the framing** (`camera.js` `pin`, `clearing.js` `movePose`): a painted framing and
    a periodic, beat-locked move (sway, sweep, push, crane, vertigo) that starts and ends
    on the framing and is shrunk until its whole cycle stays in the clearing. Held, the
    show's cuts, rigs and `setShot` are refused; `letGo()` hands it to the next cut.
  - **the colors** (`colors.js` `register`, `pinScenery`): the flame registered under its
    own key (`scene-b-<id>`, `scene-m-<id>`, `scene-p-<id>` for the Painter's unsaved
    one), hidden from the site's rotation and never pruned like the made ones; the
    scenery's colors pinned, so a landing leaves them alone while the scene holds.
- **One moment, in order.** `apply()` lays the overlay, registers the flame and pins the
  scenery colors, puts the weapon and element in (unless a swap just brought them), moves
  to the scene's place, pins the look and the framing, sends the render in the same frame
  and seats the knights (`knightShow.js` `retake`, told the new place so it doesn't arrange
  them a second time a frame later). The flame comes in with an impact where the weapon
  stands (a same-weapon swap lands at once, with its hit flash); another weapon is there at
  once under that flash.
- **Part by part.** Each part is compared with the last one applied (as JSON). Re-applying
  the same scene does nothing, and re-applying an edited one (the Painter: a slider moved)
  touches only that part: the look re-pinned without a new turn (`fresh: false`), so the
  grain it rolled stays; the knights' show acts on the changed settings itself.
- **Hold and Base.** Holding, the overlay adds no phrase swaps, no recolored scenery, the
  camera's move (held still when the user's *Camera* is *Still*) and no cuts, the layers
  and the scene's drop hits; `nextFlame`, `nextWeapon` and `nextElement` return the scene's
  (a weapon or element left to the show, or an element the user has unchecked in
  *Elements*: `sceneElement`, is drawn as usual), so every re-forge is in its colors; the
  scenery mix leaves the place alone; the fireflies keep its show; its fire shape is added
  to the drive. Base opens the
  stretch with the place, colors, framing and look, then the show plays on: the look for
  its first turn (the show's next look change takes over), the framing until the show's
  first cut, and the scenery colors until the show's first own flame lands. The scene's own
  flame landing with its arrival keeps them (`keepsScenery`: without it, that landing would
  roll the show's colors over the scene's before they'd shown). The render, the knights and
  the fireflies stay the scene's. A scene that just arrived keeps its framing for a bar and a half before the
  show's cuts may take over.
- **Scene changes ride the fire's own swaps** (director.js):
  - the music's start: the loop's opening scene (one picked by hand plays on) with the
    start's puff, before the knights start, so they start from it;
  - a drop: when half a stretch will have played by the drop (a forecast, nothing dealt
    yet), the breakdown forges the next scene's weapon in its flame and element and holds
    it; a big drop (the music's, D or MIDI) deals that scene once the one playing has had a
    quarter of its stretch, and the strike applies it in its flash before the knights hear
    of the drop (the knights' drop is the scene's hidden moment for them). A blade that
    strikes with no big drop (the energy creeping back, a small drop, held too long) deals
    nothing: the scene forged for stays next, and the blade takes the playing scene's
    flame, weapon and element with its impact (a Base scene or the free show: the show's
    next flame), so the skipped scene's colors don't stay on the fire;
  - a phrase line: the swap is started so its impact lands on the line's downbeat, forged
    with the next scene's equipment; `landed()` applies the scene with that impact. With
    the forge busy or the same weapon as the one in the fire (a same-weapon swap would
    land at once, early), it lands on that downbeat with a flash instead (the swap's
    impact where it stands); with a blade held for the drop, in the drop's strike (below);
  - by hand (N, Play Now): on the next downbeat with a flash while the music plays, at
    once otherwise; the loop carries on from it; Scenes switched off hands a looped scene
    back to the free show on a downbeat.

  With a blade held for the drop, nothing lands on a downbeat: a scene waiting for one (N
  or Play Now in a breakdown, a phrase line's) lands in the drop's strike instead, the
  struck blade taking its weapon and flame at the impact (the page reads `sceneWhen`:
  'drop', and N's note says so: "Next scene: X, at the drop"). Landing on the downbeat would re-equip the fire and cut the held
  blade down, leaving the drop nothing to strike.
  A scene holding a weapon the same as the one in the fire has nothing to forge in a
  breakdown: its drops recolor on the spot (`hit()`), which still lands in the drop's flash.
- **The flashy clamp.** A scene may never turn back on what the user keeps off: Flicker,
  the x-ray (its held view too), the drop's X-Ray, Ink Flash and Color Cycle
  (`FLASHY_DROPS`), Armor Shine (and the negative flash, the blackout and the hit flash,
  which scenes don't set); a scene painted in the Ink look plays it as Ember
  (`FLASHY_LOOKS`), the rest of its look as painted, when the user has Ink off. A scene
  never throws more drop hits at once than the user's *Hits per Drop* (`dropCount`: the
  lower of the two; the Painter shows its own). The palette cycles only while the user's
  own Color Cycle isn't Off (the director's `cycles`, looks.js `update`): with it Off, an
  Echo look (a scene's too) plays its echo with no downbeat color steps and no spins on
  big hits. Low Flash and Chill set all of those off, so a flashy scene plays safe there
  (Frozen Shrine, a held Echo scene, keeps its echo with the palette still); reduced
  motion does the same. The user's other Offs hold too: *Camera: Still*
  keeps the scene's framing still (its move doesn't play), and an element unchecked in
  *Elements* isn't the scene's to bring (lightning's discharges are the show's only
  whole-scene flash). Reduced motion goes further: every look moves with the music, so a
  scene's plays as Ember, the layers that move (`MOVING_LAYERS`: Ghosting, Motion Blur,
  Flicker) stay off, and the still ones (scanlines, a gradient map, a repaint, glow, grain,
  a steady chroma split, bars, a spotlight that doesn't breathe) show at their painted
  strength, answering no beat. The Painter creates its director and its bonfire with
  `paintedLook`: there the look is what's being painted, so it plays as painted, on the
  stage and in its thumbnail, held still: the palette never cycles, and the pass keeps off
  only what flashes or jitters (the negative, the ink flash, the blackout, the flicker, torn
  rows, the RGB split, the ripple) and holds the kaleidoscope's turn and its own clock
  (grain and shimmer still pictures; `src/bonfire/stillFx.js`). Bonfire Live and the site
  keep only the still effects (`STILL` there).
- **Back to the free show.** Leaving a scene (`apply(null)`) brings back the user's own
  place and their knights in the same moment, whatever the way out. At once (`instant`:
  the start screen's chip picked again, Scenes switched off with no music) the look and
  the framing go too, the show's look takes a turn of its own and the fire takes the
  show's next flame and one of the user's elements (a live return's recolor does the same
  on its downbeat); live (a flash on a downbeat, a drop) the look and framing stay, no
  longer held, until the show's next look turn or cut, so nothing jumps.
- **The user's hand wins.** `releaseScene(keys)`: a setting the user touches (the dialog,
  the P menu) is theirs again until the next scene: the key leaves the overlay, the camera
  keys hand the framing back, a layer's switch goes back to theirs in the pinned look, the
  color keys let the scenery's colors go.
- **The loop is pure.** `sceneLoop.js` knows the library (a function the page gives the
  director), the settings and the bar clock, and answers when (`due(bar)` on phrase lines
  that are multiples of Change Every, once half a stretch has played; at a drop in two
  steps: `dropDue(ahead)`, the breakdown's forecast that half a stretch will have played
  by the drop, and `dropReady()` at the drop itself, once a quarter has really played;
  every big drop with "only on drops") and what (`peek`, `advance`: in turn, a shuffled
  deck, or in the mix now and then 'free'); `start`, `next` (N), `jump` (a scene picked by
  hand) and `lock` (solo).
- **The built-in scenes** (content.json `scenes`, made in the Painter and imported through
  the admin's Scenes page): *Cathedral Kaleidoscope*, *Frozen Shrine*, *Forge Rave* and
  *Moonlit Ruins* ([bonfire-live.md](../bonfire-live.md) has what each is). Between them they cover the
  format's range, each judged at real speed in the Painter's Still, Beat and Drop Loop
  and in Bonfire Live: a pinned look detail (the kaleidoscope's six segments) under a
  sweep that turns what it folds; a still framing with a spotlight, grain and the echo;
  layers in the mix over the Glitch look with a push, four knights and Base (the show
  plays on); a few-color palette (Moonlit) with thick fog, Haze and a crane. Their own
  flames and scenery colors, drop hits, knights (styles, seats, counts) and fireflies
  differ too. `e2e/scenes.spec.mjs` opens them in Bonfire Live (the start screen's chips,
  the Scenes tab, `?scene=b:`, the demo track) and in the Painter (its Built-In list,
  read-only).
