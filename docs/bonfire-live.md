# Bonfire Live: using it

How to run the visualizer at a show. Its design notes and the requirement log are in
[visualizer.md](visualizer.md).

## Bonfire Live (audio visualizer)

The bonfire as an audio-reactive visualizer for DJ sets, at **`/visualizer/`**
(`npm run dev`, then `http://localhost:5173/visualizer/`). It's the same scene, colors,
weapons and elements as the site, driven by the music instead of the cursor. Nothing on
the site links to it from its *Bonfire Live* project. Design notes: `docs/visualizer.md`.

**Sound sources** (the start screen):

- **Line In or Microphone:** an audio interface or the mixer's record/booth out works
  best. Pick the device in the list; echo cancelling, noise suppression and auto gain
  are off.
- **Tab or System Audio:** share a browser tab, or (Chrome/Edge on Windows) the whole
  screen with *Share system audio* ticked, to catch rekordbox, Serato or Traktor
  playing on the same computer.
- **Play an Audio File:** a mix from disk (or drop a file anywhere on the page).
- **Demo Track:** a synthesized 126 BPM loop with a breakdown and a drop.

**What the music does**

- **Kicks and bass:**
  - The fire swells and kicks on every beat, as hard as the kicks land. The ball
    crackles, the ice pulses, and the wind throws the flames one way, then the other.
  - The planted blade glows (and shudders on the hard ones), and each bar its
    silhouette echoes out. In ice, each beat sends a glow up through the crystals, and
    on bars and rings the bigger crystals' outlines burst out as crisp wireframes.
  - Hi-hats throw sparks. Every few bars the element's ring races out on its own.
- **Fireflies:** a light show. They sit dark and blink hard on and off with the music,
  hop and swing around the fire on the beat, and stay close to it. The pattern changes
  every 8 bars:
  - a random few on each beat;
  - each firefly's own flash signature;
  - a spark chasing around the fire;
  - twinkles on the hats.
  - In a breakdown a slow wave passes through them, and a random few swirl around a
    held blade.
  - Right after a drop they all strobe together.
  - They move to the beat too, a new move every 8 bars (`fireflyMoves.js`): swing
    around the fire, bounce like balls, dart and stop dead (up, down, left, right,
    toward, away), step round the compass together, zigzag, or scatter. Each keeps its
    own time (every half beat, beat or two, on or off the beat), so their speed follows
    the tempo.
- **The living blade** (`bladeMotion.js`): every 8 bars (and two bars after a big drop)
  the blade works itself loose, pulls out of the fire and fights on its own for 1, 2 or
  4 bars, like an enchanted weapon, then plunges back in on a downbeat, throwing the ring.
  - **Moves**, one landing on each beat: slashes (any angle, from the grip or flung from
    mid-blade, lunging through the hit), thrusts (drawn back trembling, driven along the
    blade, stopping dead and quivering, sometimes corkscrewing) and spins (a full turn
    or more, as a wheel or a flat whirl, after a rest).
  - **Procedurally sound:** each move winds up, accelerates into the hit (fastest right
    on the beat) and follows through at the same speed, overshooting a touch. The moves
    are chosen so each one's wind-up is near the last one's finish, like a combo, with
    glides, twirls and hovers between them and a flip or corkscrew on the way home.
    Nothing goes through the ground or the camera.
  - **Rhythm:** a move on every beat, or varied with rests and (at slow tempos) doubles.
  - **Trails:** rising embers, or falling frost glints; each hit throws a spray off
    the point. It knocks the flames along with it. In lightning the whole blade is
    electric (bolts crackling up both edges, arcs leaping off near the point) and each
    slash leaves a sheet of lightning, strongest at the tip and fading toward the guard,
    with sparks off the point only.
  - A blade held for the drop sways and turns as if looking about, trembling harder as
    the build rises.
- **Phrases:** every 16 bars (a setting) the fire takes a new weapon, flame and element.
  The swap is paced so its impact lands exactly on the next phrase's first beat.
- **Breakdowns, builds and drops** (`sections.js`):
  - A breakdown is the kick gone for a bar and a half. A build is rising tension:
    risers, rolls speeding up, the bass thinned. Either forges a new blade that hangs
    over the fire in a vortex of particles. The vortex tightens with the build and
    takes after the blade's element.
  - The drop is scored on every frame, from four things:
    - the jump in bass, loudness and bass-over-highs balance;
    - the kick coming back;
    - landing on a downbeat or phrase;
    - the tension before it, or a silence gap.
  - Where a drop is expected it fires at once. Otherwise it's confirmed by the next
    beat's kick, so a lone boom doesn't count.
  - On the drop the blade strikes: the vortex is flung out, the ring races across the
    ground, and the camera punches, shakes and bursts in the current look. A short cut
    coming back (a small drop) throws a ring instead.
- **Camera** (`camera.js`): fourteen shots, each with its own move (sway, push in, spin,
  tilt, a crane up, a dolly zoom, a long lens). It cuts every 2 bars and every bar right
  after a drop, by a cut, a whip pan or a glide.
  - **The blade out of the fire:** close angles cut between moves, or rigs that follow
    it: *Follow* swings after the point with a lag, leaning into the swing; *Ride* is
    mounted off the blade's flat, so the world wheels behind it; *Track* stays put and
    turns and zooms to keep it framed; *Orbit* circles the fire. In the mix it changes
    rig mid-routine now and then.
  - **A held blade:** a close shot, a vertigo dolly zoom that deepens with the build,
    or an orbit.
- **Colors** (`colors.js`): each new flame is one of the site's palettes, or one made on
  the spot with the admin's palette generator (`src/paletteGen.js`): harmonious (any
  scheme, or the one picked) or fully random, named for its hue ("Cobalt Lightning").
  Any flame can recolor the scenery too (off, with some flames, with every flame): the
  stone, wood, shadows and background blend to colors made for it as it lands, a new set
  each time.
- **Looks** (`looks.js`): the picture's effects take turns, a new one every 16 bars and
  after each drop, each with its own burst for the big hits:
  - **Ember:** clean.
  - **Glitch:** torn rows, RGB split, crunch and static.
  - **Echo:** frames streaming out of the fire like a tunnel, with the flame's palette
    cycling on downbeats.
  - **Ripple:** shockwave rings out of the fire on each kick.
  - **Kaleido:** a kaleidoscope around the fire.
  - **Ink:** 1-bit flashes on downbeats.
  - **Vortex:** echoes turning as they stream out, a spiral flung faster on the kicks.
  - **Mosaic:** kicks crunch the picture into big pixels.
  - **Haze:** rows shimmering like heat over the fire.
  - **Prism:** the colors splitting apart on every beat.

  **Every effect has one switch: off, in the mix, or always.** Looks in the mix take
  turns; a look set to always stays on under whichever one is taking its turn. Layers go
  over any look: scanlines (thin, thick or columns), a mirror, **blend modes** (echoes in
  screen or difference, ink in overlay, a kaleidoscope ghosted over the plain picture…),
  ghosting, motion blur, glow, a gradient map, painterly strokes, a watercolor wash and a
  flicker. Each time a look comes round, the layers in the mix are rolled again (at most
  two heavy ones at once), each with new details: the echo's direction, the glow's size,
  the gradient's colors, the brush's angle. Mirrors come in three kinds, each switchable:
  horizontal (either half copied onto the other), vertical (the top reflected down like
  a pool, or the bottom up) and quarter (one quarter, four ways). Every drop also throws
  **drop hits**: those set to always, plus one to three drawn from the mix, never the
  same set twice running: shatter, shockwaves, an echo burst, a spiral, a kaleidoscope,
  mirror flips, a color cycle, an RGB burst, a crunch, an iris snap, a letterbox slam,
  an ink flash. Plus the negative flash on drops (at most one every 2 s). The director's
  own effects (sparks, the blade's echo, the zoom punch, color temperature, breathing,
  the pre-drop blackout) take the same three-way switch. Breakdowns letterbox and close
  an iris around the fire as the build rises; the drop snaps it open. It's all in the
  pixel pass before the palette, so every effect stays in the scene's colors. Reduced
  motion turns the moving ones off.

**Keys:** `Space` drop (strike the held blade, or recolor now) · `A` forge and hold ·
`B` swap on the beat · `R` ring · `X` the blade leaves the fire · `G` burst the look ·
`L` next look · `M` mirror (in the mix, always, off) · `P` colors (site, harmonious,
fully random, a mix) · `1` `2` `3` hit with
flame, lightning or frost · `←` `→` previous/next colors · `T` tap tempo (first tap is
beat 1) · `C` cut · `H` hide the controls · `F` full screen · `S` settings. The
controls and cursor hide when the mouse rests.

**Settings** (kept in the browser): sensitivity, visual lead (to make up for projector
lag), reactivity, particle density, sparks, auto drops, how often weapons change and
rings fire, which elements are drawn; the living blade (how often and how long it's out,
its moves, rhythm, and whether it's alive); colors (the mode, the harmony scheme, the
scenery); fireflies (their moves and how often they change); the camera (mode, cut
length, transitions, how it covers the blade out and held, zoom punch, shot, pixel
size); effects amount and, in the Effects tab, every look, layer and drop hit (off, in
the mix, always), how often the look changes, which kinds of mirror, the negative
flash, how many drop hits; and a
title card (a DJ name in the site's checkpoint band, shown when the music starts and
on drops).

| Piece | File |
| --- | --- |
| Page, sources, HUD, keys | `visualizer/index.html`, `src/visualizer/main.js`, `src/visualizer/visualizer.css` |
| Settings: stored in the browser, the dialog | `src/visualizer/settings.js` |
| Bands, onsets | `src/visualizer/analyser.js` |
| Sections: groove, breakdown, build, drop, silence | `src/visualizer/sections.js` |
| Tempo, beat grid, bars, tap tempo | `src/visualizer/tempo.js` |
| Music → fire, the blade, looks, colors | `src/visualizer/director.js` |
| Camera shots, blade rigs, transitions | `src/visualizer/camera.js` |
| Colors: site or made palettes, scenery | `src/visualizer/colors.js` (the generator: `src/paletteGen.js`) |
| Firefly light show; firefly moves | `src/visualizer/fireflyShow.js`, `src/visualizer/fireflyMoves.js` |
| Looks (effects that take turns), drop hits | `src/visualizer/looks.js` |
| The living blade's moves | `src/bonfire/bladeMotion.js` |
| Blade trail and hits (per element) | `src/bonfire/swingTrail.js` |
| Demo track (synthesized) | `src/visualizer/demo.js` |
| Scene hooks: `drive`, `glitch`, `pulse`, `ring`, `echo`, `swing`, `setPose`, held swaps | `src/bonfire/scene.js`, `weapons.js`, `pixelPass.js`, `flame.js`, `fireflies.js` |
| Tests: the tracker on synthetic onsets; the analysis and ten drop shapes (and non-drops) on synthesized tracks; the blade's moves (smooth, on the beat, clear of the ground and camera) and its return to the fire (`weapons.js` on a stand-in model); made palettes, drop hits, mirror kinds and mixes, firefly moves; a held swap's forge particles; the site's routes, links and templates | `test/` (`npm test`) |

## New this round

- **Feel:** pick a preset (Chill, Club, Rave, Low Flash) on the start screen or at the top
  of the settings; fine-tune in the tabs.
- **MIDI:** Settings → Sound → MIDI Controller. Connect, press Learn beside an action,
  then the pad. Mappings stay on this computer.
- **The pack (I):** swap the scene, forge a chosen weapon, cast the element's ring, send
  the blade into a swing, or hit with another element.
- **Record (V):** a clip of the picture and the sound, saved as MP4 when you stop. For the
  portfolio page, save one as `public/assets/projects/bonfire-live/clip.mp4` with a
  `clip.webp` still beside it and add it as the first image with *Video Clip* on.
