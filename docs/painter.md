# The Bonfire Painter

A scene editor for Bonfire Live, at **`/painter/`** (`npm run dev`, then
`http://localhost:5173/painter/`). You paint a *scene* (where the fire burns and what's in
it, its colors, the framing and its slow move, a look with its layers and their details,
the drops, the render, the knights, the fireflies), watch it play to a silent beat, save
it, and send it to Bonfire Live, which loops through preset scenes like it. The format is
`src/scenes.js`; how Bonfire Live plays and loops scenes is in [visualizer.md](visualizer.md)
and [bonfire-live.md](bonfire-live.md); the admin's Scenes page (the built-in scenes) is in
[admin.md](admin.md).

## Using it

**The layout.** The stage fills the window. Across the top: the home link, the scene's name
(click it to rename), a dot that says *Saved*, *Unsaved Changes* or *Built-In*, **Library**,
**Save**, undo and redo, the **Preview** (Still, Beat, Drop Loop, Demo Track, with the beat's
pips), **Play in Bonfire Live ↗** and **Hide Panel**. On the right, the panel: the scene in
sections that fold. The bar keeps every button on screen and the name clear of them at any
width: from 1700px it has everything; narrower, the beat's words go (its pips stay), then
the app's name and the long preview labels (*Drop*, *Demo*); below 1240px it's two rows
(the scene and its commands, then the preview and Play). On a phone the panel is a bottom
sheet with a strip of section tabs and the library fills the screen.

**Hover to audition.** Hover a flame, a look, a shot, a suggested palette or a layer's
*Off / In the Mix / Always* and the stage shows it at once; move off and the scene comes
back; click to keep it (one undo step). A look hovered bursts once as it comes on, so even
a look that lives on the beat (Glitch, Ripple, Mosaic…) shows in the Still preview. Every
field also has a "?" that says what it does; its hint always opens inside the panel (shifted
in from the right edge, or downward near the top).

**The sections**

- **Place:** the scenery (the ruins, the forge, the shrine, the cathedral's altar, the
  cult's circle; click only, a place takes a moment to build), the weapon and the element
  (or *Drawn by the Show*: a new one each time a drop forges one).
- **Fire & Colors:** the site's flames; *Harmonious* (in a scheme) or *Fully Random*; *From
  a Color* (pick any color: flames built round it, one per scheme); the flame's five colors
  by hand (the tips are kept readable as text and lightened if needed: a note says so) and
  its light; the scenery's colors (the site's own, harmonious, vivid, fully random, from a
  color, or by hand, the background kept the darkest); the fire's shape (level, size,
  height, turbulence, glow, wind), added to what the music does.
- **Camera:** drag the stage to orbit round what the camera looks at, Shift-drag (or
  right-drag) to slide it, the wheel (or a pinch) to come nearer; *Start From a Shot*
  (Bonfire Live's framings); the lens, the tilt, and the move: still, sway, sweep, push in
  and out, crane or vertigo, how big, and how many bars a cycle takes (a move picked after
  Still with no size gets a new scene's, so it moves at once). The camera is kept
  in the clearing (above the ground, out of the fire, in front of the ruins), the same rule
  Bonfire Live plays it under.
- **Look:** the ten looks, the look's own detail (the kaleidoscope's segments, the echo
  falling inward, the vortex's turn, the mosaic's crunch) and its strength.
- **Layers:** every layer's switch; a layer that's on shows its details, each with a
  **lock**: pinned (a pin: it stays as painted) or left to the dice (a die: rolled again
  each time the look comes round; the field shows what's on screen now, dimmed, and moving
  it pins it). *Pin What You See* copies everything on the stage now into the scene. With
  Blend Modes on, how each layer blends (or rolled each turn).
- **Drops:** the show's own drop hits, or the scene's own set and how many at once.
- **Render:** pixel size, palette (the flame's, Ashen, Moonlit, or a few of the scene's own
  colors picked from its ten), dither and its pattern, outlines, vignette, exposure, fog,
  shadows, the flame's frame rate, an x-ray view held for the scene.
- **Knights:** how many (0 to 4), each one's helmet (or drawn at random), their style
  (the pixel sprites, gunmetal, black and gold, the first build; or Bonfire Live's own, or
  in the mix), armor finish, Edge Glow (off, in the mix: rolled round its Glow Strength
  each time they come round, or always at it), seat pose, dance, formation, moves (the Default
  Dance among them), armor shine and reactions; *Try a Gesture* plays one on the stage
  (a preview: gestures aren't part of a scene).
- **Fireflies:** how many glow, their light show, their moves, their speed.
- **With the Music:** *Hold the Scene* (everything stays for its stretch; the music only
  pulses and drops it) or *Start From the Scene* (it opens the stretch, then the show plays
  on). The Painter always previews a scene held.

**The preview**

- **Still:** silence. The look at its painted strength, the framing as painted (the move
  paused), the knights resting. The one it starts on with reduced motion, where the look
  being painted still shows (on the stage and in its thumbnail), held still: no palette
  cycling, flashes, flicker, tearing or ripples, the kaleidoscope not turning; in the
  moving previews too, the look answers no beat (it doesn't pulse or jolt with the music).
- **Beat:** a silent 124 BPM groove, the scene as it plays on the music. Space toggles it.
- **Drop Loop:** a silent 16 bars: 8 of groove, 4 of breakdown, 4 of build, then the drop,
  and round again. The beat's pips show the bar and the section. The drop re-forges the
  scene's own weapon in its own colors, as Bonfire Live does.
- **Demo Track:** Bonfire Live's demo track, with sound.

**Saving and the library.** The scene autosaves as a draft (a moment after each change, and
at once when the tab is closed, reloaded or put in the background), so it's there when you
come back: a reload, or a link to the scene you were painting, brings back its unsaved
changes (a note says so). A link to *another* scene (`?scene=`, the admin's `#scene=`)
doesn't lose them either: the unsaved draft is set aside and a banner offers **Restore
“…”** (what's on the stage then goes aside in its place, if it's unsaved) or **Discard
It**, until you pick one. **Save** (Ctrl+S) keeps it in *My Scenes* in this browser, with a
thumbnail of the stage (taken round the part the panel leaves showing, where the fire is
framed, a couple of frames on: nothing moves for it); a scene saved the first time
takes its id from its name. The **Library** (L) lists My Scenes and Bonfire Live's built-in
ones: open, play in Bonfire Live, duplicate, rename, export, delete (asked twice, on the
card), plus New Scene, Import (a file the Painter exported, or a scene's JSON from the admin;
a scene whose id is taken comes in as a copy) and Export All (`bonfire-scenes.json`).
Opening a scene or starting a new one over unsaved changes asks first, in place (*Discard
and Open* / *Keep Painting*). Built-in scenes open read-only: paint on one and it becomes a
copy (the address stops naming the built-in; Save keeps it in My Scenes). If the browser's
storage is full, Save says so.

**The built-in scenes** were painted here: *Cathedral Kaleidoscope* (the kaleidoscope
pinned at six segments over the cathedral, an amethyst flame made *From a Color*, a slow
sweep), *Frozen Shrine* (ice, the echo, a spotlight and grain, a still, low framing),
*Forge Rave* (lightning, Glitch with its layers in the mix, a push, four knights; *Start
From the Scene*) and *Moonlit Ruins* (the Moonlit palette, thick fog, Haze, a crane, the
knight in Black & Gold). Open one from the library's *Built-In Scenes* to see how it's
made; paint on it to make it your own. They reach Bonfire Live through the admin: the
Painter's *Export All*, then the Scenes page's *Import From Painter*
([bonfire-live.md](bonfire-live.md) has what each one is).

**Play in Bonfire Live** plays a saved scene, or a built-in as it came, by its ref (nothing
is saved for it); one with changes, or never saved, is saved first. It asks a Bonfire Live
tab that's already open first: if one answers (within `ANSWER_MS`, 300 ms, `sceneStore.js`
play()), it plays the scene at once and no tab is opened, not even for a moment. Only if
none answers does it open one playing only it (`visualizer/?scene=<ref>&solo`, in a tab
named `bonfire-live` that the next Play finds again). If the browser blocks that tab (a
popup opened after the wait may be), the note says so with an *Open Bonfire Live ↗* link.
A built-in played as it is also gets its library thumbnail.

**Opening a scene from a link:** `painter/?scene=m:<id>` (one of mine), `?scene=b:<id>` (a
built-in), or `#scene=<base64url>`: the admin's *Open in Painter*. That one shows a banner:
*Save to My Scenes*, or *Copy JSON for the Admin* (paste it into the admin's Scenes page
with *Import From Painter*).

**Keys** (not while typing in a field)

| Key | |
|---|---|
| Drag, Shift-drag, wheel | orbit, slide, zoom (the stage) |
| ← → ↑ ↓ (Shift) | orbit a step (slide) |
| + − | nearer, further |
| Q E | tilt the horizon |
| [ ] | narrow or widen the lens |
| Space | Beat on or off (Still), from the stage (on a focused button, Space presses it) |
| D | a drop (on the beat's next frame; in Still, at once) |
| C | save a picture of the stage (PNG) |
| Ctrl+Z, Ctrl+Shift+Z (Ctrl+Y) | undo, redo |
| Ctrl+S | save |
| H | hide or show the panel |
| L | the library (L or Esc closes it, wherever the focus is) |
| P | the render menu, bound to the scene's render (its digits step it) |
| I | the pack: it paints into the scene (scenery, weapon, element, flame, the first knight's helmet, the knights' style and finish); its gestures are previews |
| F | full screen |

## Design notes

- **One engine.** The Painter runs the same `createBonfire({ effects: true })` and
  `createDirector` as Bonfire Live, and holds the scene through the director's own scene
  player (`director.scene(scene, { mode: 'hold', instant: true })`,
  `src/visualizer/scenePlayer.js`). What's painted is what plays. The show's own settings
  under the scene are Bonfire Live's defaults without what would take the painting away
  (the living blade, phrase swaps, the scene loop), with Bonfire Live's default particle
  density.
- **Edits touch only what changed.** Every edit is a new normalized scene
  (`normalizeScene`: the same rules the admin and Bonfire Live apply); the player diffs it
  part by part, so moving Glow Size keeps the rolled grain, and a color doesn't re-seat
  the knights. A scene opened (the library, a link) is applied fresh: every part anew, the
  knights brought in at once. The stage is updated at most once a frame.
- **Endless variations.** A detail left to the dice is rolled each time the look comes
  round, and a layer *In the Mix* comes and goes; the Painter shows that happening (Beat
  and Drop Loop turn the look over every 16 bars), and the locks and *Pin What You See*
  decide what stays.
- **Hover is an effect.** Chips audition on the stage, lift and glow; library cards lift
  with a dithered glow in their own flame's color; the scenery's chips glow but don't
  audition. No text tooltip is the affordance (the "?" hints are the fields' help).
- **The silent beat** (`src/painter/beat.js`) gives the director exactly what the analyser
  would: bands, level, kicks and hats, beats on a locked grid (early by the Visual Lead),
  sections and their events, the bar count starting again at each drop.
- **The camera by hand** (`cameraRig.js`) orbits with photo mode's math (`src/ui/orbit.js`,
  shared), through the clearing's clamp, pausing the scene's move while you drag. The panel
  keeps the fire centered in the part of the stage you can see (`director.frame`), and the
  thumbnail is cut round that part (`thumbs.js` `thumbCrop`), so saving never moves it.
- **Undo** (`history.js`) merges a drag on one field into one step (edits of the same path
  within 600 ms), keeps 150 steps, and a new edit drops what could have been redone. Undo
  and redo move the panel's fields too, the one under your hand included.
- **The panel keeps your place.** It's drawn again only when its shape changes; a redraw
  focuses the same field, chip, lock or button again, and one that a slider's drag calls
  for waits for the drag to end (every knight's helmet row is drawn, the extra ones hidden,
  so dragging *Knights by the Fire* never swaps its slider out). The field under your hand
  keeps what it shows while you move it; its number follows it.
- **Storage** is `src/sceneStore.js` (shared with Bonfire Live): My Scenes and their
  thumbnails (the first to go when the storage is full), a draft of its own
  (`bonfire-painter-draft`: the scene, its ref, the ref it was opened from, and whether it
  has unsaved changes), the draft a link set aside (`bonfire-painter-draft-aside`), and a
  BroadcastChannel to hand a scene to an open Bonfire Live.

**Modules** (`src/painter/`): `main.js` (the page: the stage, the bar, editing, saving,
keys), `panel.js` (pure `panelMarkup` + `bindPanel`; fields from `src/ui/fields.js` bound by
`data-scene` paths), `cameraRig.js`, `library.js`, `history.js` (pure), `beat.js` (pure),
`thumbs.js`, `painter.css`. The page is `painter/index.html` (a Vite input; `/painter/` is in
the sitemap). Finding it is one of the site's discoveries (`painter`). Dev builds expose
`window.__painter`. Tests: `test/painter.test.mjs`, `e2e/painter.spec.mjs`.

**The build** (`vite.config.js`) makes the four pages together (the site, 404, Bonfire Live,
the Painter). The site's first load stays the site's: Bonfire Live's and the Painter's
modules (the scene format, the looks, the scene store) only reach it through a static
import from the site, and the site imports those lazily; the build warns
(`first-load-guard`) naming them if one comes back. three.js's renderer and loaders are a
chunk of their own beside the bonfire's code, so no chunk passes the 500 kB warning.

## Screenshots

The Bonfire Painter project's four pictures on the site (`content.json`'s `bonfire-painter`
item: the editor, a finished scene, the library, Bonfire Live playing one) are taken from
the real Painter and Bonfire Live by `tools/capture-painter.mjs`. It drives the Painter
through `window.__painter`, so it needs the dev server, not a build:

```
npm run dev                                         # in one terminal
node tools/capture-painter.mjs                      # all four
node tools/capture-painter.mjs --only editor,live   # some of them
node tools/capture-painter.mjs --base http://localhost:5174/   # another dev server
node tools/capture-painter.mjs --write editor=.scratch/painter-shots/editor-4.png
```

It uses GPU Chrome at 1600×1000 CSS px and a 0.9 device scale, so each picture is 1440×900
with the stage's pixels exact 4×4 squares. Each one is a burst of candidates kept with a
contact sheet in `.scratch/painter-shots/` (`--raw` for another folder); the default pick is
written at once to `public/assets/projects/bonfire-painter/<name>.webp` and
`<name>-card.webp` (720×450). Look at the sheets, and if another moment reads better, write
it with `--write <name>=<png>` without capturing again. The tool's header has the details.

## Requirement log

| Asked (the user's words) | Where |
|---|---|
| "a new extension: /painter — a scene editor tool that utilizes effects from the visualizer to let the user craft a scene or visual" | `/painter/` on Bonfire Live's own engine and director; every part of a scene has a field |
| "…that can then export to a scene setting for the visualizer" | Save (My Scenes, shared with Bonfire Live), Export (`bonfire-scenes.json`), Play in Bonfire Live, Copy JSON for the admin |
| "Preset Scenes for it to loop through (and it can link to the painter for scene creation)" | Bonfire Live's Scenes tab links here (`painter/?scene=…`); the admin's *Open in Painter* (`#scene=`) |
| "Can we add the fortnite default dance to dance options?" | Knights: Moves includes the Default Dance; *Try a Gesture* plays it |
| "knight options overall for the portfolio and visualizer" / "knight model version options" | Knights: style, finish, edge glow, seat pose, helmets per knight |
| Standing: every effect Off / In the Mix / Always with rolled parameters ("endless variations") | every layer, drop hit and switch has the three; every detail has a pin/dice lock |
| Standing: hover affordances are effects, never text labels | hover auditions on the stage; lifts and glows |
| Standing: Title Case labels, a "?" on every setting | every field and group (tested in `test/painter.test.mjs`) |
| The plan: starter scenes made in the Painter | the four built-in scenes (above), painted, saved and exported here; `e2e/scenes.spec.mjs` opens them in the Painter and Bonfire Live |
