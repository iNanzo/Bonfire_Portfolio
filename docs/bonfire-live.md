# Bonfire Live: using it

How to run the visualizer at a show. Its design notes and the requirement log are in
[design/visualizer.md](design/visualizer.md).

## Bonfire Live (audio visualizer)

The bonfire as an audio-reactive visualizer for DJ sets, at **`/visualizer/`**
(`npm run dev`, then `http://localhost:5173/visualizer/`). It's the same scene, colors,
weapons and elements as the site, driven by the music instead of the cursor. The site
links to it from its *Bonfire Live* project (which links to the Painter too). Design
notes: `docs/design/visualizer.md`.

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
  - The planted weapon glows (and shudders on the hard ones), and each bar its
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
    held weapon.
  - Right after a drop they all strobe together.
  - They move to the beat too, a new move every 8 bars (`fireflyMoves.js`): swing
    around the fire, bounce like balls, dart and stop dead (up, down, left, right,
    toward, away), step round the compass together, zigzag, or scatter. Each keeps its
    own time (every half beat, beat or two, on or off the beat), so their speed follows
    the tempo.
- **The living weapon** (`bladeMotion.js`): every 8 bars (and two bars after a big drop)
  the weapon works itself loose, pulls out of the fire and fights on its own for 1, 2 or
  4 bars, like an enchanted weapon, then plunges back in on a downbeat, throwing the ring.
  - **Moves**, one landing on each beat: slashes (any angle, from the grip or flung from
    the middle, lunging through the hit), thrusts (drawn back trembling, driven along the
    weapon, stopping dead and quivering, sometimes corkscrewing) and spins (a full turn
    or more, as a wheel or a flat whirl, after a rest).
  - **Procedurally sound:** each move winds up, accelerates into the hit (fastest right
    on the beat) and follows through at the same speed, overshooting a touch. The moves
    are chosen so each one's wind-up is near the last one's finish, like a combo, with
    glides, twirls and hovers between them and a flip or corkscrew on the way home.
    Nothing goes through the ground or the camera.
  - **Rhythm:** a move on every beat, or varied with rests and (at slow tempos) doubles.
  - **Trails:** rising embers, or falling frost glints; each hit throws a spray off
    the point. It knocks the flames along with it. In lightning the whole weapon is
    electric (bolts crackling up both edges, arcs leaping off near the point) and each
    slash leaves a sheet of lightning, strongest at the tip and fading toward the guard,
    with sparks off the point only.
  - A weapon held for the drop sways and turns as if looking about, trembling harder as
    the build rises.
- **The knights** (`knightShow.js`, driving the scene's `fire.knights`): the site's
  resting knight, and up to three more, 1 to 4 (touch screens: 2).
  - **Before the first drop** they rest by the fire and nod along to the strong beats,
    drumming on their thighs.
  - **In a breakdown** they're still and watch the weapon forged over the fire. Dancers
    stop on its next downbeat: the others sit down where they are, the first stays on his
    feet (he'll be up again for the build).
  - **The build:** at its third stage they get up and take their places round the fire,
    bouncing, facing it; at the last stretch they bounce twice as fast.
  - **The drop:** on its first beat they leap. With *Summon On the Drop* they're already
    in place in its flash; otherwise they spring up and hurry over, and knights joining
    form out of embers where they'll dance. *Gestures On Drops* throws Praise the Sun (or
    a hurrah, a jump for joy, a point), all together or going round them a beat apart.
    Two bars of big moves (jumps, jumping jacks, spins, Praise the Sun, fist pumps,
    headbangs), then the groove's, a new move every 4 bars (*New Dance Move Every*). They sit
    back down on a phrase line when the energy falls or after 8 to 24 bars (rolled), at
    once when the music stops or the source changes. A small drop gets one cheer (with
    *Gestures On Drops*).
  - **How many dance** follows the song: `max(1, round(n × (0.4 + 0.6 × budget)))`,
    counted again on phrase lines; the rest nod along in their seats, and the dancers keep
    clear of them (at least 0.5 m): *Line*, *Solo* and *Canon* take the whole cast's
    layout less the sitters' places, so when the count drops the dancers keep theirs and
    the first takes the place by his seat; *Round the Fire* spreads them over the ring
    less the sitters' arcs.
  - **Formations:** *Round the Fire* (spread over the clear sides of the ring, stepping
    along it every two bars and turning back each phrase, facing the fire or the room),
    *Line* (together, facing the camera), *Solo* (each his own move), *Canon* (the same
    move, each half a beat or a beat behind the one before), or a mix. Places are 1.2 m
    out on the ring's clear arcs in each scenery, never within 50° of the cameras'
    side (between the fire and the lens) or right behind it; two on one side stand one
    behind the other from the front, so a third goes behind the fire to its right.
  - **Coming and going** (*Knights*: In the mix): only where it's hidden: as the music
    starts, in a big drop's blackout and flash, and when the scenery changes (they form
    there out of embers anyway). How many (with *How Many*: Random) and each one's
    helmet are rolled at the same moments. Never mid-phrase.
  - **Reactions** (*Reactions*): they flinch when a weapon lands, lean from a flare, lift
    their feet as a ring passes, follow the living weapon with their eyes, and flinch when
    it swings close (the weapon already plans its moves clear of them).
  - **Armor Shine** (*Armor Shine*): the fire's reflection sweeping over their plate, a
    gentle band now and then at rest and a bright one when the fire flares. In the mix
    the rest sweeps and the flare sweeps are rolled apart, and the reactions on their
    own, at the same hidden moments as presence.
  - Their moves are pure functions of the beat: the director hands them the grid's
    position every frame (with the visual lead, so they hit with the fire's pulses),
    eased through nudges and taken at once, modulo 8 beats, when the grid restarts. They
    only dance while the tempo holds. Reduced motion: they sit.
- **Phrases:** every 16 bars (a setting) the fire takes a new weapon, flame and element.
  The swap is paced so its impact lands exactly on the next phrase's first beat.
- **Breakdowns, builds and drops** (`sections.js`):
  - A breakdown is the kick gone for a bar and a half. A build is rising tension:
    risers, rolls speeding up, the bass thinned. Either forges a new weapon that hangs
    over the fire in a vortex of particles. The vortex tightens with the build and
    takes after the weapon's element.
  - The drop is scored on every frame, from four things:
    - the jump in bass, loudness and bass-over-highs balance;
    - the kick coming back;
    - landing on a downbeat or phrase;
    - the tension before it, or a silence gap.
  - Where a drop is expected it fires at once. Otherwise it's confirmed by the next
    beat's kick, so a lone boom doesn't count.
  - On the drop the weapon strikes: the vortex is flung out, the ring races across the
    ground, and the camera punches, shakes and bursts in the current look. A short cut
    coming back (a small drop) throws a ring instead.
- **Camera** (`camera.js`): fourteen shots, each with its own move (sway, push in, spin,
  tilt, a crane up, a dolly zoom, a long lens). It cuts every 2 bars and every bar right
  after a drop, by a cut, a whip pan or a glide.
  - **The weapon out of the fire:** close angles cut between moves, or rigs that follow
    it: *Follow* swings after the point with a lag, leaning into the swing; *Ride* is
    mounted off the weapon's flat, so the world wheels behind it; *Track* stays put and
    turns and zooms to keep it framed; *Orbit* circles the fire. In the mix it changes
    rig mid-routine now and then.
  - **A held weapon:** a close shot, a vertigo dolly zoom that deepens with the build,
    or an orbit.
  - **The knights dancing** (*Knight Shots*, Camera › Cuts): about one cut in three goes to them:
    *Dancers Low*, *Round the Fire* (circling), *Dancers Wide*, or the *Dancer* rig
    (out past one knight from the fire, the fire behind him, drifting round him on the
    beat). On a tall screen these widen to keep the ring in. The drop's wide cut skips
    the long lens while they dance, and takes *Dancers Wide* only with Knight Shots on
    for that dance.
  - A cut never picks a shot with a knight standing between the lens and the fire.
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
  ghosting, motion blur, glow, a gradient map, painterly strokes, a watercolor wash, a
  flicker, film grain, cinema bars, a spotlight round the fire and a chroma split. Each
  time a look comes round, the layers in the mix are rolled again (at most two heavy ones
  at once), each with new details: the echo's direction, the glow's size, the gradient's
  colors, the brush's angle, the grain's amount, the bars' height, the spotlight's size. Mirrors come in three kinds, each switchable:
  horizontal (either half copied onto the other), vertical (the top reflected down like
  a pool, or the bottom up) and quarter (one quarter, four ways). Every drop also throws
  **drop hits**: those set to always, plus one to three drawn from the mix, never the
  same set twice running: shatter, shockwaves, an echo burst, a spiral, a kaleidoscope,
  mirror flips, a color cycle (with Color Cycle Off, no palette cycling at all: the Echo
  look's downbeat color steps and spins stay still too), an RGB burst, a crunch, an iris snap, a letterbox slam,
  an ink flash, an x-ray (the drop lands in one of the picture's passes for a beat). Plus
  the negative flash on drops (at most one every 2 s). The director's
  own effects (sparks, the weapon's echo, the zoom punch, color temperature, breathing,
  the pre-drop blackout) and the render switches (below) take the same three-way switch. Breakdowns letterbox and close
  an iris around the fire as the build rises; the drop snaps it open. It's all in the
  pixel pass before the palette, so every effect stays in the scene's colors. Reduced
  motion turns the moving ones off.

**Keys** (`?` lists them all, in four groups: `src/visualizer/keys.js` and the shared
keys overlay; the HUD's **Keys** button opens it too, and in Settings `?` or the footer's
**Keyboard Shortcuts** opens it over them):

- **Moments:** `Space` drop (strike the held weapon, or recolor now) · `A` forge and hold ·
  `B` swap on the beat · `R` ring · `X` the living weapon leaves the fire · `G` burst the
  look · `1` `2` `3` hit with flame, lightning or frost (while Render Settings is open,
  digits step its rows instead) · `←` `→` previous/next colors.
- **Beat:** `T` tap tempo (first tap is beat 1) · `D` this beat is beat 1 · `[` `]` nudge
  the beat 10 ms.
- **Show:** `L` next look · `M` mirror (In the Mix, Always, Off) · `N` the next preset
  scene (on the next downbeat, in a flash; with a weapon held for the drop, in its strike,
  the note saying "…, at the drop"; at once on the start screen) · `Shift+N` preset scenes
  In the Mix, Always, Off · `K` the knights dance now (for a phrase, with *Dance* off too),
  or sit back down · `Shift+K` the knights come or go (on the next drop's flash if a weapon
  is held for one, otherwise at once) · `Shift+P` Flame Colors (site, harmonious, fully
  random, a mix) · `Shift+1…9` a title card.
- **View & Menus:** `P` Render Settings (below) · `C` cut · `H` hide the controls (`Esc`
  brings them back) · `F` full screen · `O` the output window · `V` record · `S` settings ·
  `/` the settings' search · `I` the pack · `U` the stats overlay (below; on the start
  screen too) · `?` the shortcuts.

The controls and cursor hide when the mouse rests on the picture (not while it rests on the
controls, so a tooltip stays to be read). The HUD's *Moments* have **Living
Weapon** (X) and a **Dance** button (K), and its state line says what the knights are
doing ("In the groove · 3 knights dance"). Under it, **Scene: Name** names the preset
scene playing ("The Free Show" between them); a click opens Scenes & Cards, and pointing
at it pulses the name in the flame's colors. Every HUD button says what it does in the
shared tooltip (on hover, keyboard focus or a tap); Forge / Strike, Dance / Sit and Full
Screen / Exit Full Screen change their tip with their label.

**Render Settings (P)**, the site's menu (`src/ui/renderMenu.js`), top right, on the start
screen too: the Picture tab's switches, one row each, stepped by a click (Shift+click:
back) or its digit: `1` Pixel Size, `2` Palette, `3` Few Colors, `4` Dither, `5` Dither
Pattern, `6` Outlines, `7` Fog, `8` X-Ray Flips, `9` Pixel Size Shifts, and `0` Reset
Render Settings puts those back to the defaults. A switch in the mix shows what it's doing
now ("In the Mix · On Now", "4 px · 6 px Now"), and a row a preset scene sets shows the
scene's value, marked "· Scene". Each step is saved with the settings and applied at once
(the show goes on as it was); stepping a row the scene sets takes it back from the scene,
from the scene's value, until the next scene. `P` or `Esc` closes it; it fades with the HUD
when the mouse rests.

**Settings** (kept in the browser; `S`, or the HUD's Settings button). The dialog
(`settingsDialog.js`) is laid out by the shared settings map (`src/settingsMap.js`): its
tabs, their sections, each setting's name, hint and "More", and its place, the same names
the Painter and the admin use. The header stays put as the tab scrolls: the search box,
*Simple* / *All Settings*, a close button, the four presets, then the tabs.

| Tab | Sections |
| --- | --- |
| Sound | Source (sensitivity, visual lead, playback volume) · Beat (Beat From, the Link bridge's port and its setup) · MIDI Controller |
| Show | Reaction (reactivity, the song's shape, build-ups in stages, hi-hat sparks, color temperature, sub-bass breathing) · Weapons (forge and strike on drops, how often a new weapon comes, its elements, extra rings, the outline burst) · Living Weapon (how often it comes out and for how long, its attacks, its rhythm, alive between attacks) |
| Drops | The Drop (the black beat, the negative flash, the drop hits, how many at once) · Hits (hit-stop, hit flash, debris, ground marks) |
| Picture | Place & Atmosphere (place, fog, exposure, vignette, fire shadows) · Colors (flame colors, harmony, place colors, blend time, palette, few colors) · Pixel Art (below) · Performance (**Frame Rate**, particles, **Stats Overlay**) |
| Effects | Strength & Pace (effects strength, how often the look changes) · Looks · Layers (all 14, and the mirror kinds) · X-Ray (the flips and their views) |
| Camera | Camera (movement, starting shot, zoom punch & shake) · Cuts (cut every, between shots, knight shots) · Weapon Shots (while it fights, camera feel, while it's held) |
| Cast | Knights · Armor · Dancing · Behavior (below) · Fireflies (blink and dance on the beat, their dances and how often they change, light trails) |
| Scenes & Cards | Preset Scenes · The Loop (below) · Title Cards (a DJ name in the site's checkpoint band, shown when the music starts and on drops) · More Cards |
| My Setups | Save everything as it is under a name; load, delete, export and import |

- **Simple** shows the settings that matter most; each section says how many more *All
  Settings* has ("3 More In All Settings", a click shows them and goes to the first), or,
  where Simple shows none of it, what it has ("Only In All Settings: Layers, Mirror Kinds",
  with no Reset Section there). A tab with three-way switches says once at its top what
  Off, In the Mix and Always mean (in Simple, only where one shows). On a phone or a short
  screen the presets are names only, with a note under them (beside them on a short screen
  wide enough for two lines there to hold it) saying what the one in use, or the one pointed
  at or focused from the keyboard, does: whole, since a touch screen has no tip to read.
- **Every effect is a three-way switch**, three radio buttons (one keyboard stop, the arrow
  keys move along it). Every grid of them (Looks, Layers, Drop Hits) has **All Off · All In
  the Mix · All Always · Shuffle · Defaults** over it, and every checklist (Attacks, Dance
  Moves, Firefly Dances, Helmets, X-Ray Views, Mirror Kinds, Elements) **All · None ·
  Defaults** (None is unavailable where one has to stay on, and its tip says why). Each
  section has **Reset Section**. A bulk button, Reset Section, Reset To Defaults, a preset
  and a setup are each one change (saved once) with an **Undo** in the footer (a setup
  deleted has one too); after an Undo the focus goes back to the button that made the
  change.
- **A setting that does nothing as the others stand** is disabled, with a line saying why
  (Edge Glow Strength while Edge Glow is Off, the Link port unless the beat comes from Link,
  Dither Pattern at Dither 0, Harmony without made flame colors, Cut Every without cuts,
  Knight Shots with a still camera, Change Every with Preset Scenes Off, the firefly dances
  with their light show and the preset scenes Off, the X-Ray Views with the flips and the
  X-Ray drop hit Off).
- **Hints** are the "?" beside each setting (and each look, layer, drop hit and x-ray view):
  the shared tooltip shows it on hover, on keyboard focus (the field's focus shows its "?"),
  or a tap, placed inside the window, never covering what opened it; `Esc` hides it and
  leaves the dialog open. Longer explanations fold under **More** (All Settings).
- **Search** (`settingsSearchUi.js`): `/` on the page opens the settings with the box
  focused, `/` or `Ctrl+F` in the dialog goes to it. Typing filters every tab in place: each
  section headed "Tab › Section", what doesn't match hidden, the tab buttons counting their
  finds (0 greyed), a row from All Settings shown in Simple view with an *All Settings*
  badge, the words found marked in the names. It searches the names, hints and More, search
  words and synonyms ("strobe" finds Negative Flash, Flicker and Hit Flash; "fps" Frame Rate
  and Flame Frame Rate), the choices, the scenes in the loop, the title cards, the setups,
  the MIDI actions, the presets and the keyboard shortcuts. `↓` goes to the first result
  and `↓` / `↑` from one to the next (the row itself, so stepping never changes a setting;
  `Tab` or `Enter` goes into it; a shortcut's opens the shortcuts, and one with nothing to go
  into, off for now or a MIDI action's, shows in its place; `↑` from the first goes back to
  the box). `Enter` in the box reveals the only result, or the one named just as
  typed ("frame rate": Frame Rate, not Flame Frame Rate): its tab, scrolled to, focused, a
  short flash unless motion is reduced; with several it goes to the first. `Esc` clears the
  search, a second `Esc` closes the dialog. Nothing found suggests words that would find
  something.
- **Frame Rate** (Picture › Performance): *Display* (every frame the screen shows, the
  default), *60 fps* or *30 fps*, for a busy computer. On a 144 Hz screen 60 can't be paced
  evenly (it draws every second or third frame the screen shows) and on a 120 Hz one it's
  half the screen's rate, so it can look less smooth than Display, though it's lighter on
  the computer. It stays with this computer (not in a setup or a preset, like the volume).
  The sound is still analysed on every frame the display shows, so beats land as precisely
  when it's capped (`createBonfire`'s `onTick`; what's heard between drawn frames reaches
  the director with the next one: `tickBatch.js`).
- **Stats Overlay** (Picture › Performance, or `U`): a readout in the top left corner of
  what the picture costs and what the show is doing, updated twice a second. Off to begin
  with; like Frame Rate it stays with this computer (not in a setup or a preset). It sits
  where nothing else is (the HUD is along the bottom, the pack bottom right, Render Settings
  top right; on the start screen, top right, and where the start menu reaches across under
  it, on a phone or a narrow window, only what fits above the menu), under everything but
  the picture: where Render Settings opens over it (the start screen, a phone) it steps down
  under the menu while that's open. It stays when the HUD fades, never takes the pointer and
  isn't read out. It's HTML over the picture, so it isn't in the output window or a recorded
  clip. Smaller on a phone, without the dimmed rows. Three groups:
  - **Frames:** frames a second (and the cap), the time between them (median and p95), the
    draw calls and the shadow's redraws a second; dimmed, the frame's parts (tick, page,
    update, draw) and the GPU's programs, textures and geometries (`docs/performance.md`).
  - **Particles:** each particle system running, live of how many it has (the flames,
    sparks, ash and smoke, the forge's particles during a swap, debris, the cold mist, the
    blade's trail, the rings…), the fireflies lit of all of them and the lightning's bolts
    (segments). A system with nothing live isn't listed; the heading has the total live.
  - **Show:** the section (Silence, Groove, Breakdown, Build with its stage, Drop and the bar
    of the 8 after it), the budget (as the director has it; Off with Follow the Song’s
    Shape off), the look playing and its strength (a preset scene's says so), the layers live
    now, each marked *(In the Mix)* or *(Always)*, an x-ray flip while it's on, a drop's
    hits while they fire, the knights here and what they're doing, the shot, and the preset
    scene playing (or the free show) with its loop (In the Mix, Always, Off, solo, and the
    scene waiting for its moment).

  `?perf` in the address shows the same overlay whatever the setting says (and writes the
  frame's parts for the browser's profiler). With the overlay on, a frame costs no more
  (measured on the demo track: `docs/performance.md`).
- Saving waits for a burst of changes to settle (300 ms: a slider dragged writes once) and
  is done at once as the page is hidden or left, and for a preset, a setup or a reset.

**Picture › Pixel Art and the other render settings** (`render.js`): how the picture itself
is drawn. Everything applies at once through the scene's render overrides (`setRender`,
`setPalette`, `setFog`, `setShadows`, `setXray` in `sceneRender.js`), which the site never sets.
The switches in the mix are rolled again with every look, each time with new details.

| Setting | What it does | Values (default first) |
| --- | --- | --- |
| Pixel Size | How big each pixel is | 4 px (the site's size) · 2 · 3 · 6 · 8 |
| Pixel Size Shifts | The size jumps with a new look and again when a drop lands, to one from half to twice the one set | In the Mix · Off · Always |
| Dither | How much colors are dithered where they meet | the site's (0.08) · 0 to 0.4 |
| Dither Pattern | The ordered dither's grid | 4×4 · 8×8 · a mix (new each look) |
| Outlines | The dark outlines and bright facet creases | In the Mix (most looks) · Off · Always |
| Palette (Colors) | The colors everything snaps to | The flame's colors · Ashen (3) · Moonlit (4) |
| Few Colors (Colors) | The palette drops to a few: Ashen, Moonlit, or two to four of the flame's own (they change with it), a new few each time | In the Mix · Off · Always |
| Exposure, Vignette (Place & Atmosphere) | The picture's brightness; how much the corners darken | the site's (1.45, 0.85) |
| Fog (Place & Atmosphere) | The dark closing in | Light (the site's) · Off · Thick · a mix |
| Fire Shadows (Place & Atmosphere) | The scenery and the weapon throw the fire's shadow (off is lighter) | on |
| X-Ray Flips (Effects › X-Ray) | Now and then, on the beat, the picture flips for a beat, two or a bar to one of its passes, in its own colors: the normals, the lighting alone, the particles alone, the flow field. Never on a drop's own bar | In the Mix · Off · Always |
| X-Ray Views (Effects › X-Ray) | Which of those passes it may show (the X-Ray drop hit too) | all four |
| Flame Frame Rate | How often the flames move on (few: choppy, hand-drawn) | the site's (12) · 8 · 24 · 60 |
| Color Blend Time (Colors) | How long a new flame's colors take to blend in | the site's (0.34 s) · 0.2 to 4 s |
| Light Trails (Cast › Fireflies) | The fireflies' trails (changing it restarts the scene) | on |
| Hit-Stop, Hit Flash, Debris, Ground Marks (Drops › Hits) | How big hits land: a freeze, the frame lifting toward the core color, bits of the element thrown, a mark on the ground | Always · Off · In the Mix |

Presets set the render switches too: Chill keeps the outlines, thick fog, no flips,
shifts or hit-stop, and no flashes whatever preset came before (no negative flash, no Ink
look, no Ink Flash, Color Cycle or X-Ray drop hit, so no Echo palette steps either); Rave has pixel shifts and x-ray flips
every look; Low Flash turns off the x-ray (the drop's X-Ray hit too), pixel shifts, few
colors, the hit flash, the 1-bit Ink (the Ink look and the drop's Ink Flash) and the drop's
Color Cycle (the flame's palette spinning at 16 Hz; with it Off the Echo look's palette
steps and spins stay still too, a scene's Echo included); Club is the defaults, and puts back
whatever the others changed. Every render
setting lives in the saved settings, so the render menu (P) reads and steps them
(`render.js` `RENDER_STEPS`, `stepRender`, `renderText`) and applies them all with
`applyRenderSettings(fire, settings)`. In the mix, the opening look (the start screen and
the intro) keeps the flame's own colors; Few Colors comes in from the next look.

**Scenes & Cards: preset scenes.** A preset scene sets everything at once: a place, a
flame and its colors (the scenery's too, if it has its own), a framing and its move, a
look and its layers (their details pinned, or rolled each time it comes round), the drop
hits, the render, the knights and the fireflies. They're made in the **Painter**
(`/painter/`, [painter.md](painter.md)): the site's built-in ones come from the admin
(content.json `scenes`; one taken out of the loop there is left out here), yours are kept
in this browser (`src/sceneStore.js`, `bonfire-scenes`), shared with the Painter. Bonfire
Live loops through them (the director's scene loop and player,
[design/visualizer.md](design/visualizer.md)): a scene arrives on the music's start, in a drop's
flash, or on a phrase line as a new weapon lands in its colors, never mid-phrase.

**The built-in scenes** (made in the Painter, `content.json` `scenes`), in loop order:

| Scene | What it is | With the music |
| --- | --- | --- |
| Cathedral Kaleidoscope | The cathedral's altar folded into a six-way kaleidoscope round an amethyst flame (a flamberge in fire), so its lancet windows become a ring of stained-glass panels, a rose window; a soft glow, trails now and then, a slow sweep that turns the rose; two knights dancing in Pixel Painterly, folded into the pattern as they wheel through it after the drops; the kaleidoscope drop hit | Hold |
| Frozen Shrine | The shrine seen low past its lantern and gate: ice under an uchigatana, an icy harmonious flame on blue-grey stone, the echo streaming out of the fire, a spotlight and fine grain, the camera still; one knight sitting watchful in Pixel Cel; the drop shatters | Hold |
| Forge Rave | The forge in lightning: a magenta, cyan and acid-yellow flame, the Glitch look with chroma split and scanlines in the mix, the camera pushing in and out every 4 bars, four knights dancing in Pixel Chiaroscuro and polished steel, a chasing firefly show; shatter, shockwaves and more on the drops | Start from the scene |
| Moonlit Ruins | The ruins in the Moonlit palette's four colors under thick fog, a zweihander in a low fire, the Haze look shimmering the pillar, a slow crane up and down; one knight resting in Black & Gold by the pillar, the fire's reflection sweeping over his plate now and then (Armor Shine), many fireflies twinkling | Hold |

Each leaves something to the dice (a layer in the mix, the details it doesn't pin, the
show's own drop hits where it has none), so it plays a little differently every time.

| Setting | What it does | Values (default first) |
| --- | --- | --- |
| Preset Scenes | In the Mix they come and go, with stretches of the free show between them; Always: one after another. `Shift+N` switches it (Off goes back to the free show at once) | In the mix · Off · Always |
| Change Every | How often the next one comes: on a phrase line (as a weapon lands), or a big drop's flash once half the stretch has played by it (the breakdown forges the next scene's weapon); only on drops: every big drop's flash. A breakdown that ends without a big drop brings none | 32 bars · only on drops · 16 · 64 · 128 · Random |
| With the Music | *Hold*: everything the scene sets stays for its stretch, the music only pulses and drops it (drops re-forge its own weapon in its colors). *Start from the scene*: it opens the stretch with its place, colors, framing and look, then the show takes over (its render, knights and fireflies stay). *Each scene's own*: as saved in the Painter | Each scene's own · Hold · Start from the scene |
| Scene Name Cards | A smaller title card with the scene's name as it arrives (it waits for one of your own cards that's showing) | Off · In the mix (some scenes) · Always |
| Order (The Loop) | *In Turn*: the loop's order; *Shuffled*: each once before any comes again, never the same twice running | In Turn · Shuffled |
| Scenes From (The Loop) | Which scenes it loops through | Built-In And Mine · Built-In · Mine |

*The Loop* lists the scenes (Scenes From picks whose), each with its switch (in or out:
`settings.sceneList`, by ref, `b:<id>` built-in or `m:<id>` mine; only the ones left out
are kept), its picture (a Painter thumbnail; a built-in one's is taken the first time it
plays here with the music on, the scene it opens on too) or its colors, its name and a one-line summary, *Built-In* or *Mine*,
**Play Now** (closes the settings and plays it) and **Edit In Painter ↗**
(`painter/?scene=<ref>`); **Make a Scene In the Painter ↗** opens a new one. The one
playing is marked; pointing at a row lights it in the scene's flame color.

- **The start screen** has a row of scene chips (up to 8, the loop's first, then *All
  Scenes…*): a click plays it behind the menu at once, and it opens the show when the
  music starts; a second click goes back to the free show. Pointing at a chip makes its
  colors shimmer. `N` there steps through them at once.
- **From the Painter:** `?scene=<ref>` opens on that scene (the start screen's backdrop,
  then the show's first); `&solo` plays only it this visit ("Playing “X” from the
  Painter. N: back to the loop." for one of yours, `m:<id>`; "Playing “X” on its own."
  for a built-in, `b:<id>`; the HUD's scene line says the same). The Painter's *Play in Bonfire Live* hands a scene to
  an open Bonfire Live tab (`store.onPlay`), which plays it in a flash (at once on the
  start screen), or opens one with `?scene=m:<id>&solo`. A scene saved or deleted in a
  Painter tab shows in the loop at once.
- **Your hand wins:** what you change while a scene plays (a setting in the dialog, a row
  of the P menu, a preset, the pack's map) takes over from the scene for that setting
  until the next one. While a scene holds, changing other settings leaves its place and
  framing alone. A rebuilt scene (Particles, trails) carries on with the scene playing.
- **Low Flash** (and Chill) stays safe with any scene: a scene never turns on a flashy
  effect the settings have off (the drop's X-Ray, Ink Flash and Color Cycle hits among
  them), never throws more drop hits at once than the settings' *Hits per Drop*, a scene
  painted in the Ink look plays it as Ember, and one in the Echo look plays its echo with
  the palette still (no downbeat color steps or spins while Color Cycle is Off).
- **Presets:** Chill holds each scene 64 bars (Always, Hold); Rave brings a new one every
  16; Club (the defaults) has them in the mix every 32, each as it was saved.

**The Cast tab** (`knightShow.js`): Knights, Armor, Dancing and Behavior. Every behavior
has the three-way switch (Knights, Dance, Summon On the Drop, Gestures On Drops, Armor
Shine, Reactions; Knight Shots sits in Camera › Cuts),
with its details rolled each time (the formation, which way they face, the moves and
their mirror images, how long a dance runs, each knight's helmet, how many with Random,
which gesture and whether it goes round, the camera shots, the armor's rest and flare
sweeps apart). The armor's options (Style, Finish, Seat Pose) are a fixed pick or a mix
rolled at the same hidden moments, one for the whole cast; Edge Glow has the three-way
switch too, with its Edge Glow Strength beside it. *Simple* shows Knights, How Many, Seat
Pose, Style, Finish, Edge Glow and its Edge Glow Strength, and Dance.

| Setting | What it does | Values (default first) |
| --- | --- | --- |
| Knights | Knights by the fire. In the mix they come and go where it's hidden (the start, a big drop's flash, a new scenery) | In the mix · Off · Always |
| How Many | How many come to the fire: the first takes the seat, the others sit on the ground round it. How many get up to dance follows the song | Random (1–4, one or two more often) · 1 · 2 · 3 · 4 |
| Helmets | The helmets they may wear; each knight draws one as he arrives, some again at a new scenery | the great helm, the armet, the bascinet |
| Seat Pose | How they sit: *Resting* (the bonfire rest, slumped over the knees, dozing now and then) or *Watchful* (leaning in over his knees, forearms on them, head up at the fire) (`fire.knights.setSeatPose`) | a mix (rolled where it's hidden) · Resting · Watchful |
| Style | How they're drawn (`src/bonfire/knightStyles.js`, `fire.knights.setStyle`): the site's own (the admin's pick), Pixel Cel, Pixel Painterly, Pixel Chiaroscuro, Smooth Steel (the `gunmetal` style), Black & Gold or First Build (the boxy original model, loaded when it's first picked). A new style at a hidden moment is there in the flash | The Site's Own · each style · a mix |
| Finish | The steel's color for the styles that draw steel (`src/bonfire/steel.js`, `fire.knights.setFinish`): Gunmetal, Blackened, Polished Steel, Burnished | a mix (leaning to gunmetal) · each finish |
| Edge Glow | The armor's edges catching the fire's color, fading toward their backs (`fire.knights.setRim`). In the mix, rolled where it's hidden: some stretches glow, each at a strength rolled round the Edge Glow Strength (0.6× to 1.4× of it), some don't. Always: at the Edge Glow Strength. A scene's knights glow as it's painted (its own Edge Glow switch and strength) | In the mix · Off · Always |
| Edge Glow Strength | How strongly the edges glow (disabled while Edge Glow is Off): Always's strength, and the one the mix rolls round | 0.5 · 0 to 1 |
| Dance | In the mix: nods before the first drop, up for the build, the leap on the drop, dancing while the energy holds. Always: whenever the beat is locked in the groove. Off: they sit | In the mix · Off · Always |
| Formation | Round the Fire, Line, Solo, Canon | a mix (new each dance) |
| Dance Moves | Which dance moves they may do (the big ones take the first two bars after a drop), the Default Dance among the groove's | all thirteen |
| New Dance Move Every | How often the dancers change moves | 4 bars · 2 · 8 · 16 · Random |
| Summon On the Drop | On a big drop they're up and in place in its flash, already leaping (off: they get up and hurry over, a few beats late) | In the mix · Off · Always |
| Gestures On Drops | Praise the Sun and the like on a big drop, together or going round; a cheer on a small drop | In the mix · Off · Always |
| Knight Shots (Camera › Cuts) | About one cut in three goes to the dancers (with the camera cutting), and the drop's wide may be theirs (disabled with a still camera) | In the mix (some dances) · Off · Always |
| Armor Shine | The fire's reflection sweeping over their plate: now and then at rest, and whenever the fire flares (`fire.knights.setShine`) | In the mix (rest and flares rolled apart, where it's hidden) · Off · Always |
| Reactions | They flinch when a weapon lands, lean from a flare, hop as a ring passes, watch the living weapon and flinch when it swings close (`fire.knights.setReactions`) | In the mix (rolled where it's hidden) · Off · Always |

Presets: Rave has four watchful knights in Pixel Chiaroscuro and polished steel with a
full edge glow (Always, at 1), dancing whenever the groove is locked, their armor always shining and
reacting to everything; Chill has one, resting, in Pixel Painterly and burnished steel,
his edges always catching the firelight (at 0.7), unbothered by the weapon (Reactions off); Low Flash
turns the armor's shine off; Club (the defaults) puts them all back: the site's own
style, the finish, seat and edge glow in the mix (the glow round 0.5).

| Piece | File |
| --- | --- |
| Page, start screen, sources, HUD | `visualizer/index.html`, `src/visualizer/main.js` (wires the parts below together), `markup.js`, `start.js`, `sources.js`, `hud.js`, `src/visualizer/visualizer.css` |
| Keys and buttons, dialogs, title cards, output window, pack, MIDI (the page's parts) | `src/visualizer/actions.js`, `dialogs.js`, `cards.js`, `output.js`, `packUi.js`, `midiUi.js` (their shared state: `context.js`) |
| Keyboard shortcuts (the ? list) | `src/visualizer/keys.js` (shown by `src/ui/keysOverlay.js`) |
| Settings: the values, saving, presets and setups | `src/visualizer/settings.js` |
| The settings dialog: its layout and what its controls do; each setting's control; the search; bulk buttons and Reset Section (names, hints and places: `src/settingsMap.js`; the fields and "?" hints: `src/ui/fields.js`, shared with the Painter; the tooltip: `src/ui/tooltip.js`) | `src/visualizer/settingsDialog.js`, `settingsControls.js`, `settingsSearchUi.js`, `settingsBulk.js` |
| Frame Rate: what's heard between drawn frames | `src/visualizer/tickBatch.js` (the cap: `scene.js` `setMaxFps`) |
| Stats Overlay: the overlay, its words, the show's snapshot | `src/ui/perfOverlay.js`, `src/ui/statsGroups.js`, the director's `status()` (`src/visualizer/director.js`); the scene's `setStats` and `stats()` (`scene.js`, `sceneRender.js`) |
| Preset scenes: the format, the browser's own, the loop and the player | `src/scenes.js`, `src/sceneStore.js`, `src/visualizer/sceneLoop.js`, `src/visualizer/scenePlayer.js`, `src/visualizer/layered.js` (the loop in Scenes & Cards and the HUD line: `settingsControls.js`, `scenesUi.js`) |
| Bands, onsets | `src/visualizer/analyser.js` |
| Sections: groove, breakdown, build, drop, silence | `src/visualizer/sections.js` |
| Tempo, beat grid, bars, tap tempo | `src/visualizer/tempo.js` |
| Music → fire, the weapon, looks, colors | `src/visualizer/director.js` |
| Camera shots, weapon rigs, transitions | `src/visualizer/camera.js` |
| Colors: site or made palettes, scenery | `src/visualizer/colors.js` (the generator: `src/paletteGen.js`) |
| Firefly light show; firefly moves | `src/visualizer/fireflyShow.js`, `src/visualizer/fireflyMoves.js` |
| The knights: presence, dancing, formations, the Cast tab's switches | `src/visualizer/knightShow.js` (the scene's side: `src/bonfire/knights.js`, `knightPose.js`; `docs/knight.md`) |
| Render Settings (P) | `src/ui/renderMenu.js` (shared with the site), rows in `src/visualizer/renderUi.js` |
| Looks (effects that take turns), drop hits | `src/visualizer/looks.js` |
| The render settings: render options, few colors, pixel size shifts, x-ray flips | `src/visualizer/render.js` (the scene's side: `sceneRender.js` render overrides, `pixelPass.js` `uXray`) |
| The living weapon's moves | `src/bonfire/bladeMotion.js` |
| Weapon trail and hits (per element) | `src/bonfire/swingTrail.js` |
| Demo track (synthesized) | `src/visualizer/demo.js` |
| Scene hooks: `drive`, `glitch`, `pulse`, `ring`, `echo`, `swing`, `setPose`, held swaps | `src/bonfire/scene.js` (drive, glitch, setPose), `sceneFire.js` (pulse, ring, echo, swing), `weapons.js`, `pixelPass.js`, `flame.js`, `fireflies.js` |
| Tests: the tracker on synthetic onsets; the analysis and ten drop shapes (and non-drops) on synthesized tracks; the weapon's moves (smooth, on the beat, clear of the ground and camera) and its return to the fire (`weapons.js` on a stand-in model); made palettes, drop hits, mirror kinds and mixes, the new layers, firefly moves; the render switches (off, in the mix, always), few colors kept off the opening look, x-ray flips on the beat, what the scene is sent; the knights (presence only where it's hidden, the drop's leap, breakdowns and silence, dancers by budget, places on the clear arcs and never on a seated knight, formations, the switches with Armor Shine and Reactions, K with Dance off, How Many changed mid-build, a new source mid-dance, a rebuild, a drop's new scenery, reduced motion) and a cut never picking a shot with a knight before the fire; old saved settings, presets (Club putting back what the others change, Low Flash's drop hits) and the dialog's fields; a held swap's forge particles; the site's routes, links and templates | `test/` (`npm test`) |

## New this round

- **Presets:** pick one (Chill, Club, Rave, Low Flash) on the start screen or at the top
  of the settings; fine-tune in the tabs.
- **MIDI:** Settings › Sound › MIDI Controller. Connect, press Learn beside an action,
  then the pad. Mappings stay on this computer. *Knights Dance* and *Knights In / Out*
  are K and Shift+K; *Next Scene* is N.
- **The pack (I):** *Fast Travel* to another place, forge a chosen weapon, cast the element's ring, send
  the weapon into a swing, or hit with another element; and while knights are by the
  fire, the *Knight*: a new helmet for every one of them (hands to the helm), their
  style and the color of their steel (for them all; with Style or Finish in the mix, the
  next hidden moment rolls again), or a gesture from all of them.
- **Record (V):** a clip of the picture and the sound, saved as MP4 when you stop. For the
  portfolio page, save one as `public/assets/projects/bonfire-live/clip.mp4` with a
  `clip.webp` still beside it and add it as the first image with *Video Clip* on.
