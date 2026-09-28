# Bonfire Live (audio visualizer): design notes

Status: **implemented and verified locally** (2026-09-27): unit and end-to-end analysis
tests pass (`npm test`), and the demo track was run in the browser through a full
groove → breakdown → drop cycle.
Source: Newton's request for an audio-reactive visualizer for a DJ set built from the
bonfire's design, assets and code, then two rounds of feedback:

1. More impact and movement (bonfire particles, sword particles, the blade waiting for
   the drop, fireflies), more camera switching, glitch and rave effects, extra ring
   triggers.
2. A better drop recognizer, effects other than glitch, sword swings with fire trails
   and camera angles, and fireflies that flicker on and off with the music instead of
   staying lit. Mid-round they added:
   - Fireflies stay near the fire and a random few swirl around the blade.
   - Trails match the element.

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

## Key decisions

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
- **Swings are poses, not animations.** A combo is keyframes built from beat times:
  - **Each slash** is an arc of the blade's direction in a plane taken from the camera
    as that slash begins. The flat faces the viewer (local Z is the flat's normal) and
    the edge leads. It accelerates into the hit (fastest on the beat) and eases out.
  - **The grip** hangs over the fire, high enough for the tip to clear the ground. The
    world pose is converted into the holder's space each frame.
  - **The fire reacts:** flames and sparks within 30 cm of the blade get its velocity.
  - **The plunge** restores the rest pose and throws the ring.
- **Looks are one pass.** Kaleidoscope, ripple, feedback, iris, letterbox, ink and color
  cycling all live in the existing pixel pass. Feedback is a ping-pong pair of low-res
  targets plus a copy, used only while an echo is on. Its echoes lose a little each
  frame, because dithering would otherwise hold dim ones at the same palette color
  forever.
- **Density is a rebuild.** Particle counts size GPU buffers, so changing *Particles*
  rebuilds the scene and keeps the current weapon, flame and element.
