# The Invitation: playing with NEWT

A small toy at `/invitation/`: NEWT, Newton's low-poly chibi, stands on a plain white
background, on a floor you can't see that only shows his shadow, and you can play with him. He
stays inside a round patch of that floor, about as wide as a phone shows; its edge is his wall.
You can turn the camera round him and zoom in and out. It's made for a phone first and works
with a mouse too. It has its own look (off-white and warm greys, chunky
buttons, pixel art drawn like an old handheld's 3D), not the bonfire site's. The page is
unlisted: nothing links to it and search engines are asked not to index it.

## What You Can Do

- **Tap him** and he waves or gets startled (a jump, arms flung up). Tap him a lot and he gets
  stressed and runs away from your finger; he's never too fast to catch.
- **Drag him** to pick him up by the collar. He dangles and swings; let go and he falls, lands
  and gets back up. Flick him and he flies a little; let go while pushing him against the edge
  of his patch and he just drops there.
- **Tap the floor** and he walks there. A ring on the floor shows where your finger or cursor is.
- **Point anywhere on the floor** and he looks where you point (on a phone, while your finger
  is down; with a mouse, wherever the cursor is). Otherwise he looks at you.
- **Drag empty space** to turn the camera: across to go round him (a drag across the whole
  screen goes about three quarters of the way round, on a phone or a computer alike), up and
  down to look from higher or lower. **Pinch** with two fingers, or use the mouse wheel, to zoom.
  The light turns with the camera, so his shadow always falls behind him and to one side.
- **On a phone** he's drawn about 30% bigger than on a computer, so the camera follows him
  softly, and he never runs off the screen. Zoomed in, it follows him on a computer too.
- **Leave him alone** for about 20 seconds and he turns to face you and sits down (the Sit
  button turns him to you first too, so you see his happy face).
- **The toolbar:** Wave, Spook, Sit (Stand once he's sitting), Run (he runs off for a few
  seconds), Wander (on: he strolls around by himself) and Look. The buttons rest while he's
  being held or falling.

## The Look Menu

**Look** opens a sheet along the bottom. NEWT moves into the space above it (beside it on a
phone held sideways) and the camera keeps him there, so every change shows on him right away;
each one is kept for your next visit (in this browser). While the sheet is open the toolbar
rests under it, Tab stays inside the sheet, and **Done** or **Escape** closes it; dragging empty
space still turns the camera.

| Setting | Choices | What it does |
| --- | --- | --- |
| Pixel Size | 16×16 to 256×256, Off | NEWT's sprite resolution: at 64×64 he's drawn about 64 pixels tall, on any screen. A slider, coarse to fine, with Off at its fine end and a button at each end; the line under it says how many pixels tall he really is on this screen. 48×48 is the default (the old 2× look on a phone). Each pixel is a whole number of the screen's own pixels, so the finest steps reach the screen's resolution; two steps that would draw the same picture on a screen show as one there (a 390-wide phone lists 9 steps, a 1280×800 desktop 6). NEWT stays the same size on screen, so a coarser resolution only makes him chunkier. From 128 pixels tall his shirt shows its real plaid (bolder pixel checks below that), and at the finest steps zoomed in his face is the smooth one. Off draws at the screen's own resolution, smooth. |
| Dithering | On, Off | The checkered blend between colours. |
| Outlines | On, Off | A one-pixel line around NEWT (none in his shadow). |
| Style | DS, Soft | DS: crisp, many colours, a hard shadow. Soft: fewer colours with a visible dither, pastel, warm outlines and a softer shadow. |
| Motion | Smooth, Choppy | Smooth (the default) moves NEWT every frame. Choppy moves his arms, legs and head 15 times a second, like stop motion, while the camera and his walking about stay smooth. |

Dithering and outlines are part of the pixel look, so they rest while Pixel Size is Off.
**Reset Camera**, under the settings, eases the camera back to where it started.

## For Developers

- **Code** (`src/invitation/`): the page imports only three.js, its GLTFLoader and its own
  modules (a shared `src/` module would share a chunk with the portfolio's first load).
  - Browser-only and thin: `main.js` (boot, the loop, the wiring in `types.js`'s frame
    order), `stage.js` (renderer at texel size, the camera with its off-centre projection,
    lights and shadows, the blob shadow and the floor marker), `floor.js` (no room: an
    invisible floor that only catches his shadows, a `ShadowMaterial`, over the preset's
    background; and the shadow camera's fit), `character.js` (NEWT's materials, clips with
    twins for restarts, look-at and faces),
    `retro.js` (the pixel pass), `ui.js` (the toolbar and the Look sheet as markup, plus a thin
    binding), `invitation.css`.
  - Pure and unit-tested: `pixels.js` (the texel grid: at sprite resolution N, `RESOLUTIONS`
    16 to 256, a texel is `max(1, round(NEWT's default height in device px / N))` device pixels,
    `blockFor`, so he's about N texels tall; `pixelSteps`, a screen's steps, one a block size;
    `DEFAULT_PIXEL`, the one line that sets the default; and the default view: 20° of view, 36° up, NEWT 0.195 of a desktop's short
    side tall with the whole play area in sight, or 0.255 of a phone's, a stage whose short side
    is under 600 CSS px (99 CSS px, and 50 texels at 48×48, on a 390-wide phone), whatever the Pixel Size,
    the point it looks at shown in the middle of the space over the toolbar, or of the clear
    space above or beside the open Look sheet, `clearInsets`), `camera.js` (the
    orbit camera: yaw all the way round, three quarters of a turn for a drag across the whole
    stage and half a turn of tilt down its whole height, 12° to 70° up, half to twice the
    default distance, eased with a little coast, following NEWT as it zooms in, and 0.8 of the
    way at the default zoom on a phone, all the way while the Look sheet is open; `lightDir`
    turns the look's sun with the camera's yaw),
    `area.js` (the play area: a fixed disc of radius 2.0 round the middle), `play.js` (the
    frame's decisions: who moves his root, the clip mix, where he looks), `look.js` (the Look
    settings under `invitation.look.v1`, Pixel Size stored as `'16'` to `'256'` or `'off'` (an
    old `'2'`, `'3'` or `'4'` loads as 48, 32 or 24, what each looked like on a phone), Motion as `'smooth'` or `'choppy'` (a look stored before Motion loads as Smooth),
    `motionStep`, Choppy's 15 fps clock, and the presets), `looks/ds.js` and `looks/soft.js`
    (every look value, as data: a
    designer edits these, never code; among them the background, the shadow's colour and
    strength, and the blob shadow).
  - The behaviour modules (`brain.js`, `blend.js`, `steer.js`, `carry.js`, `lookAt.js`,
    `faces.js`, `gesture.js`, `rng.js`) are pure too; `types.js` lists the shapes they pass
    and the order a frame runs in.
- **The clips contract:** `src/invitation/clips.js` names NEWT's clips (lengths, loops, fades),
  the face each shows, the bones by their three.js names and the step lengths. `tools/newt.py`
  makes the clips in Blender and `test/invitationModel.test.mjs` holds the glb to the contract.
- **The model:** `npm run model -- newt` rebuilds `public/models/newt.glb` from `tools/newt.py`
  with headless Blender (`$NEWT_BLEND` names the .blend; it defaults to the user's
  `NEWT_optimized.blend`, which is never overwritten).
- **The pixel face:** at the coarser resolutions his head is only a dozen or two texels wide, so
  `node tools/newt-face.mjs` redraws the glb's face sheet as `public/models/newt-face.png`,
  four small pixel cells with the features kept at least 2 px thick (`--cell`, `--min`,
  `--preview` to look at it). The page uses it while the pixel filter is on, the sheet whose cell
  matches his half face in texels (3 px at 16×16 up to 34); past 1.25 times the largest
  (`SMOOTH_FACE_OVER`: 256×256 on a phone, or zoomed in) it shows the glb's smooth face again, as
  at Off. His shirt shows the bold pixel plaid (`newt-atlas-pixel.png`, `tools/newt-atlas.mjs`)
  until he's `ORIGINAL_ATLAS_TEXELS` (128) texels tall in the default view, then the glb's own
  plaid, sampled at the preset's `texture.fineMipBias`. It and the pixel
  atlas (`newt-atlas-pixel.png`) are asked for at the same time as the glb, and the first frame
  waits for them (up to 3 s more), so NEWT never shows the blurred atlas and a blank face first.
- **Tests:** `test/invitationCharacter.test.mjs`, `invitationLook`, `invitationArea`,
  `invitationCamera` and `invitationPlay` (with `invitationBrain`, `invitationMotion`,
  `invitationGesture` and `invitationModel`), and
  `e2e/invitation.spec.mjs` (`npm run e2e -- invitation`).
- **Test hooks:** `[data-stage].is-ready` once the first frame is drawn, `data-webgl="off"`
  without WebGL. `?test` adds `window.__invitation`: `snapshot()` (his state, clip, face,
  position, head turn, the camera's yaw, elevation and distance, the states he went through,
  `pixelScale`: CSS px a texel, `resolution`: the Pixel Size's N (null at Off), `newtTexels`:
  his height in texels and `newtTall` in CSS px in the default view, `faceSheet`: the face sheet
  showing (a cell width, or `'smooth'`), `faceTexels`, and `atlas`: `'pixel'` or `'original'`),
  `screen('head'|'body'|'feet')` (a point on him in client px, to tap), `floorAt(x, y)`,
  `feet()` (his ankles, to measure foot slide), `bones()` (his bones from his root) and
  `play(clip)` (Walk and Run step in place at their own pace). `?seed=N` makes the randomness
  repeatable; `?calm` stops him wandering and sitting by himself.
- **Captures:** `node tools/capture-invitation.mjs` records real-speed clips of every clip and
  of taps, drags, buttons, floor taps, a chase and the camera at phone and desktop sizes (animated WebP plus a
  contact sheet; `--look`, `--pixel` (a resolution such as `64` or `64x64`, or `off`), `--motion`,
  `--sizes`, `--acts`). One GPU capture at a time.
- **First load:** none of this reaches the portfolio's first load (`firstLoadGuard` in
  `vite.config.js`, `test/site.test.mjs` and the spec's last test check it).
- **Unlisted:** `noindex, nofollow`, left out of the sitemap and the README, and not
  Disallow'd in `robots.txt` (a Disallow is public and would hide the noindex from crawlers).
