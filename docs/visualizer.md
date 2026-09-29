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
| Z8 | Settings in tabs, presets, simple / all | `settings.js`: eight tabs, a *Simple* view of the key settings, a hint (?) on every one; presets Chill, Club, Rave, Low Flash |
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
  - Reduced motion turns off flashes, shake and moving glitch.
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
  rebuilds the scene and keeps the current weapon, flame and element.
