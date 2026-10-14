# The Invitation: playing with NEWT

A small toy at `/invitation/`: NEWT, Newton's low-poly chibi, stands on a plain white
background, on a floor you can't see that only shows his shadow, and you can play with him. The
floor is endless: he stays inside the patch of it the screen shows with the camera zoomed all
the way out (from where it starts), and that patch's edges are his walls. You can turn the
camera round him, slide it about and zoom in and out. It's made for a phone first and works
with a mouse too. It has its own look (off-white and warm greys, chunky
buttons, pixel art drawn like an old handheld's 3D), not the bonfire site's. The page is
unlisted: nothing links to it and search engines are asked not to index it.

## What You Can Do

- **Tap him** and he waves or gets startled (a jump, arms flung up). Tap him a lot and he gets
  stressed and runs away from your finger; he's never too fast to catch.
- **Drag him** to pick him up by the collar. The spot you grabbed stays right under your
  cursor (a finger carries him a little above itself, so it doesn't hide him): move up and he
  rises, high off the floor if you like; move across and he goes across. He dangles and swings;
  let go and he falls, lands and gets back up. Flick him and he flies a little; let go while
  pushing him against the edge of his patch and he just drops there. The camera holds still
  while you carry him.
- **Tap the floor** (or click it) and he walks there. A ring on the floor shows where your
  finger or cursor is.
- **Point anywhere** and he looks where you point (on a phone, while your finger is down; with
  a mouse, wherever the cursor is): up when you point high over him, round to show his face
  when you point in front of him, and no further round than side on when you point behind him.
  Otherwise he looks at you.
- **Turn the camera:** with a finger, drag empty space; with a mouse, drag with the right
  button (anywhere, on him too; it never picks him up). Across goes round him (a drag across
  the whole screen goes about three quarters of the way round, on a phone or a computer alike),
  up and down looks from higher or lower. The canvas shows no menu for the right button.
- **Slide the camera:** with a mouse, drag empty space with the left button (or the middle
  one); with fingers, drag two of them together. The floor under your cursor stays under it.
  You can't slide his patch off the screen altogether.
- **Zoom:** pinch with two fingers, or use the mouse wheel. The light turns with the camera, so
  his shadow always falls behind him and to one side.
- **He stays on screen:** the camera holds still while he's well inside the screen and moves on
  with him as he nears an edge, however it's turned. On a phone he's drawn about 30% bigger than
  on a computer and the camera follows him softly too; zoomed in, it follows him everywhere.
  Once you've slid the camera it stays where you put it until he walks off the screen himself;
  **Reset Camera** (in the Look menu) clears the slide and the zoom.
- **Leave him alone** for about 20 seconds and he turns to face you and sits down (the Sit
  button turns him to you first too, so you see his happy face).
- **The toolbar:** Wave, Spook, Sit (Stand once he's sitting), Run (he runs off for a few
  seconds), Wander (on: he strolls around by himself) and Look. The buttons rest while he's
  being held or falling.

## The Look Menu

**Look** opens a sheet along the bottom. NEWT moves into the space above it (beside it on a
phone held sideways) and the camera keeps him there, so every change shows on him right away;
each one is kept for your next visit (in this browser). While the sheet is open the toolbar's
buttons rest under it, Tab stays inside the sheet, and **Done** (always at its top as it
scrolls), **Look** again or **Escape** closes it; dragging empty space still turns the camera.
A finger moves a slider only by going along it: a swipe up or down that starts on one scrolls
the sheet and leaves the slider as it was.

| Setting | Choices | What it does |
| --- | --- | --- |
| Pixel Size | 16×16 to 256×256, Native, Off | NEWT's sprite resolution: at 64×64 he's drawn about 64 pixels tall, on any screen. A slider, coarse to fine, then Native and Off at its fine end, with a button at each end; the line under it says how many pixels tall he really is on this screen. 96×96 is the default (on a 1280×800 desktop it draws as 64×64, the same pixels there). Each pixel is a whole number of the screen's own pixels, and two steps that would draw the same picture on a screen show as one there. **Native** gives every one of the screen's own pixels a pixel, even a phone's three to a CSS pixel, with the pixel look still on (outlines, dithering, toon shading); a resolution that already reaches the screen's pixels shows as Native (256×256 on a phone, 128×128 and up on a 1280×800 desktop), so a 390-wide phone lists 7 resolutions and a 1280×800 desktop 5, then Native and Off. NEWT stays the same size on screen, so a coarser resolution only makes him chunkier. From 128 pixels tall his shirt shows its real plaid (bolder pixel checks below that), and at the finest steps zoomed in his face is the smooth one. **Off** is the smooth picture without the pixel look, at the screen's resolution (at most two pixels to a CSS pixel). |
| Dithering | On, Off | The checkered blend between colours (how strong: Dither Strength, under Shader). |
| Outlines | On, Off | A one-pixel line around NEWT (none in his shadow; how dark, its colour and where: under Shader). |
| Style | DS, Soft, Custom | DS: like the old handheld, 15-bit colour with a fine dither, dark 1-pixel lines, a hard shadow. Soft: fewer colours, pastel, a warm ring outside him and a softer, dithered shadow. Each sets every Shader option; Custom shows once one of them is yours (it can't be picked: choose DS or Soft, or Reset To Style, to go back). |
| Motion | Smooth, Choppy | Smooth (the default) moves NEWT every frame. Choppy moves his arms, legs and head 15 times a second, like stop motion, while the camera and his walking about stay smooth. |

**Shader** lays out the pixel look's own values, which the Style sets; any change shows at once
and turns the Style to Custom, and **Reset To Style** puts the style's values back.

| Option | Range | What it does |
| --- | --- | --- |
| Colors | 4 to 64, Full | Levels in each colour channel (Full: no quantizing). |
| Dither Strength | Off to 100% | How far the dither moves a colour toward the next level. |
| Outline Strength | Off to 100% | How much darker the lines are. |
| Outline Color | Dark, Tinted | Dark lines, or lines tinted with the style's ink. |
| Outer Ring | On, Off | Lines just outside his outline, like a sprite's, instead of on his edge. |
| Toon Shading | Smooth, 2, 3, 4 | Smooth light, or that many flat bands of it. |
| Highlight | On, Off | White where the light falls straight on him. |
| Shadow | Hard, Soft | A crisp shadow, or one with a dithered, two-tone edge. |
| Shadow Strength | Off to 100% | How dark his shadow is. |
| Light Angle | -180° to 180° | Turns the light round him (it still turns with the camera too). |
| Light Strength | 25% to 200% | How strong the light is. |
| Saturation, Warmth, Brightness, Contrast | | The grade on him: colour, warm or cool, light, and contrast. |

Dithering, outlines, Colors, the shadow's edge and the grade are part of the pixel look, so they
rest while Pixel Size is Off (toon shading, the shadow's strength and the light still apply).
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
    `retro.js` (the pixel pass; `warm` compiles the path not showing once NEWT is in, so the
    first switch to Off or back doesn't stall), `ui.js` (the toolbar and the Look sheet as
    markup, plus a thin binding), `invitation.css`.
  - Pure and unit-tested: `pixels.js` (the texel grid: at sprite resolution N, `RESOLUTIONS` 16
    to 256, a texel is `max(1, round(NEWT's default height in device px / N))` device pixels,
    `blockFor`, so he's about N texels tall; Native, a texel a device pixel at the real DPR with
    no cap; Off, the screen's pixels with the DPR capped at `OFF_DPR` (2); `pixelSteps`, a
    screen's steps, one a block size, the resolutions that come to 1 px folded into Native;
    `DEFAULT_PIXEL`, the one line that sets the default, `'96'`; and the default view: 20° of
    view, 36° up, NEWT 0.195 of a desktop's short side tall with the whole play area in sight,
    or 0.255 of a phone's, a stage whose short side is under 600 CSS px (99 CSS px, and 99
    texels at the default 96×96, on a 390-wide phone), whatever the Pixel Size, the point it
    looks at shown in the middle of the space over the toolbar, or of the clear space above or
    beside the open Look sheet, `clearInsets`), `camera.js` (the orbit camera: yaw all the way
    round, three quarters of a turn for a drag across the whole stage and half a turn of tilt
    down its whole height, 12° to 70° up, half to twice the default distance, eased with a
    little coast; `orbitPan` slides it at once, the floor under the cursor exactly under it,
    `floorUnder`, the point it looks at kept in the play area; the point it orbits rests where
    it is and follows NEWT as it zooms in, 0.8 of the way at the default zoom on a phone, all
    the way while the Look sheet is open, and moves on with him as he nears the edge of the
    clear space, `ORBIT.keepIn` (0.6) of it, never letting him past `keepOut` (0.94) once he's
    on screen, from where `screenOf` puts him; a pan holds it until he walks off the screen;
    `orbitHold` holds it still while he's held; `lightDir` turns the look's sun with the
    camera's yaw), `area.js` (`viewArea`, the play area: the floor the default view shows at
    twice its distance, yaw 0, inside the clear space with him whole 8 px in, `AREA_MARGIN`, a
    trapezoid widening toward the back; worked out again on a resize, never moved by the camera
    or the Look sheet; and `AREA_RADIUS`, the 2.0 disc a desktop's default view keeps in sight),
    `play.js` (the frame's decisions: who moves his root, the clip mix, where he looks),
    `look.js` (the Look settings under `invitation.look.v1`, Pixel Size stored as `'16'` to
    `'256'`, `'native'` or `'off'` (an old `'2'`, `'3'` or `'4'` loads as 48, 32 or 24, what
    each looked like on a phone), Motion as `'smooth'` or `'choppy'` (a look stored before
    Motion loads as Smooth), `shader`, only the user's changes to the Shader options (each
    snapped or dropped on its own, a style's own value dropped; a look stored before them loads
    as its style), `isCustom`, `shaderOf`, `lookPreset` (the style with the changes written into
    a copy, for the renderer), `motionStep`, Choppy's 15 fps clock, and the presets),
    `shader.js` (the Shader options as one table, `SHADER_CONTROLS`: each one's label, range or
    choices, value text and where it lives in a preset, which `ui.js` renders; `toonRamp`, the
    toon gradient from bands and a highlight; `warmthTint`), `looks/ds.js` and `looks/soft.js`
    (every look value, as data: a designer edits these, never code; among them the background,
    the shadow's colour and strength, and the blob shadow).
  - The behaviour modules (`brain.js`, `blend.js`, `steer.js`, `carry.js`, `lookAt.js`,
    `faces.js`, `gesture.js`, `rng.js`) are pure too; `types.js` lists the shapes they pass
    and the order a frame runs in. `gesture.js` reads the mouse's buttons apart (left: tap,
    grab or pan; right: orbit; middle: pan) and two fingers' middle as a pan; `carry.js`
    drags him on the upright plane facing the camera through where he was grabbed
    (`dragPlane`, `gripFor`, `dragTarget`: the grab offset kept, his collar between his hang
    height and `CARRY.liftMax`, 3.4), the anchor the pointer's spot with no lag and the swing
    driven by a smoothed follow of it; `lookAt.js` `pointerTarget` aims his look where the
    pointer's ray first meets the floor or the upright plane through his head facing the
    camera, brought 0.6 toward the camera along the ray (pitch up to 55°), and keeps a target
    behind him on the side his head is turned to; `floor.js` `fitShadow(…, at)` moves the
    shadow camera to wherever he is, by whole shadow texels.
- **The clips contract:** `src/invitation/clips.js` names NEWT's clips (lengths, loops, fades),
  the face each shows, the bones by their three.js names and the step lengths. `tools/newt.py`
  makes the clips in Blender and `test/invitationModel.test.mjs` holds the glb to the contract.
- **The model:** `npm run model -- newt` rebuilds `public/models/newt.glb` from `tools/newt.py`
  with headless Blender (`$NEWT_BLEND` names the .blend; it defaults to the user's
  `NEWT_optimized.blend`, which is never overwritten).
- **The pixel face:** at the coarser resolutions his head is only a dozen or two texels wide, so
  `node tools/newt-face.mjs` redraws the glb's face sheet as `public/models/newt-face.png`,
  four small pixel cells with the features kept at least 2 px thick (`--cell`, `--min`,
  `--preview` to look at it). The page uses it while the pixel filter is on (Native too), the
  sheet whose cell matches his half face in texels (3 px at 16×16 up to 34); past 1.25 times
  the largest (`SMOOTH_FACE_OVER`: Native on a phone, or zoomed in) it shows the glb's smooth
  face again, as at Off. His shirt shows the bold pixel plaid (`newt-atlas-pixel.png`, `tools/newt-atlas.mjs`)
  until he's `ORIGINAL_ATLAS_TEXELS` (128) texels tall in the default view, then the glb's own
  plaid, sampled at the preset's `texture.fineMipBias`. It and the pixel
  atlas (`newt-atlas-pixel.png`) are asked for at the same time as the glb, and the first frame
  waits for them (up to 3 s more), so NEWT never shows the blurred atlas and a blank face first.
- **Tests:** `test/invitationCharacter.test.mjs`, `invitationLook`, `invitationShader`,
  `invitationArea`, `invitationCamera` and `invitationPlay` (with `invitationBrain`,
  `invitationMotion`, `invitationGesture` and `invitationModel`), and `e2e/invitation.spec.mjs`
  (`npm run e2e -- invitation`).
- **Test hooks:** `[data-stage].is-ready` once the first frame is drawn, `data-webgl="off"`
  without WebGL. `?test` adds `window.__invitation`: `snapshot()` (his state, clip, face,
  position, head turn, the camera's yaw, elevation and distance, the states he went through,
  `pixelScale`: CSS px a texel, `resolution`: the Pixel Size's N (`'native'` where the slider
  shows Native, a resolution at 1 px a texel included; null at Off), `newtTexels`: his height in
  texels and `newtTall` in CSS px in the default view, `faceSheet`: the face sheet showing (a
  cell width, or `'smooth'`, as at Off), `faceTexels`, `atlas`: `'pixel'` or `'original'`,
  `shader`: every Shader option's value, `custom`: whether one is the user's, `pass`: what
  reached the renderer (the post shader's values, the light's strength and angle, the shadow's
  strength), and `warmed`: the pass's other path compiled),
  `screen('head'|'body'|'feet')` (a point on him in client px, to tap), `floorAt(x, y)` (the
  endless floor: null only above the horizon), `feet()` (his ankles, to measure foot slide),
  `bones()` (his bones from his root), `grabbed()` (while he's held, where the point he was
  grabbed by shows, client px) and `play(clip)` (Walk and Run step in place at their own
  pace). The snapshot's `camera` has the point it looks at on the floor (`target`) and whether
  a pan holds it (`panned`), and `area` is the play area. `?seed=N` makes the randomness
  repeatable; `?calm` stops him wandering and sitting by himself.
- **Captures:** `node tools/capture-invitation.mjs` records real-speed clips of every clip and
  of taps, drags, buttons, floor taps, a chase and the camera at phone and desktop sizes
  (animated WebP plus a contact sheet; `--look`, `--pixel` (a resolution such as `64` or
  `64x64`, `native` or `off`), `--motion`, `--sizes`, `--acts`). One GPU capture at a time.
- **First load:** none of this reaches the portfolio's first load (`firstLoadGuard` in
  `vite.config.js`, `test/site.test.mjs` and the spec's last test check it).
- **Unlisted:** `noindex, nofollow`, left out of the sitemap and the README, and not
  Disallow'd in `robots.txt` (a Disallow is public and would hide the noindex from crawlers).
