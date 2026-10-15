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
  stressed and runs away from your finger, looking where he runs and glancing back over his
  shoulder at your finger every second or two, his chest twisting with it (with your finger
  straight behind him, over the shoulder nearer you, so you see him look back); he's never too
  fast to catch.
- **Drag him** to pick him up by the collar. The spot you grabbed stays right under your
  cursor (a finger carries him a little above itself, so it doesn't hide him, and near the top
  of the screen no higher than keeps his head on it): move up and he
  rises, high off the floor if you like; move across and he goes across. He dangles and swings;
  let go and he falls, lands and gets back up. Flick him and he flies a little; let go while
  pushing him against the edge of his patch and he just drops there. The camera holds still
  while you carry him.
- **Tap the floor** (or click it) and he walks there. A ring on the floor shows where your
  finger or cursor is.
- **Point anywhere** and he looks where you point (on a phone, while your finger is down; with
  a mouse, wherever the cursor is), and on screen his gaze points right at it from any angle or
  zoom: down when you point below his head, up when you point over him, round toward it off to
  a side, and a profile on its side when you point somewhere behind him he can't turn to. Close
  to his head (or on him) he looks at you, and the further away you point the further his face
  turns from you toward it: a little under his chin his eyes still peek out under his cap, and
  his chin keeps going down the further below you point (far below him his face goes under his
  cap); above him his head tips further back the higher you point, his chest leaning back with
  it; far round to a side his chest twists with his head. With the camera turned to his side he
  still looks down at a point below him (his head comes round to you first). Otherwise he looks
  at you.
- **Turn the camera:** with a finger, drag empty space; with a mouse, drag with the right
  button (anywhere, on him too; it never picks him up). Across goes round him (a drag across
  the whole screen goes about three quarters of the way round, on a phone or a computer alike),
  up and down looks from higher or lower. The right button shows no menu on the canvas, nor
  wherever a drag that started there ends (the toolbar, at the bottom of a drag down).
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
  seconds, across the screen to one side or the other, or away from the cursor), Wander (on:
  he strolls around by himself) and Look. The buttons rest while he's being held or falling.

## The Look Menu

**Look** opens a sheet along the bottom. NEWT moves into the space above it (beside it on a
phone held sideways) and the camera keeps him there, so every change shows on him right away;
each one is kept for your next visit (in this browser). While the sheet is open the toolbar's
buttons rest under it, Tab stays inside the sheet, and **Done** (always at its top as it
scrolls), **Look** again or **Escape** closes it; above it the camera still turns, slides and
zooms as it does without it.
A finger moves a slider only by going along it: a swipe up or down that starts on one scrolls
the sheet and leaves the slider as it was.

| Setting | Choices | What it does |
| --- | --- | --- |
| Pixel Size | 16×16 to 256×256, Native, Off | NEWT's sprite resolution: at 64×64 he's drawn roughly 64 pixels tall, more or fewer as each pixel rounds to a whole number of the screen's own (at the default 128×128, 105 to 191 across common screens). A slider, coarse to fine, then Native and Off at its fine end, with a button at each end; the line under it says how many pixels tall he really is on this screen. 128×128 is the default (on a 1280×800 desktop it draws as Native, the same pixels there). Each pixel is a whole number of the screen's own pixels, and two steps that would draw the same picture on a screen show as one there, reading as the one picked (128×128 on a 1429×1115 desktop, where it draws as 96×96 does). **Native** gives every one of the screen's own pixels a pixel, even a phone's three to a CSS pixel, with the pixel look still on (outlines, dithering, toon shading); a resolution that already reaches the screen's pixels shows as Native (256×256 on a phone, 128×128 and up on a 1280×800 desktop), so a 390-wide phone lists 7 resolutions and a 1280×800 desktop 5, then Native and Off. NEWT stays the same size on screen, so a coarser resolution only makes him chunkier, and zooming the camera in or out takes his pixels with him (bigger blocks zoomed in), so he keeps the resolution you chose at any zoom; Native and Off don't change with the zoom. His shirt shows its real plaid at every resolution unless Pixel Shirt (under Shader) is on, and his face is redrawn in pixels to fit his size unless Pixel Face is off. **Off** is the smooth picture without the pixel look, at the screen's resolution (at most two pixels to a CSS pixel). |
| Dithering | On, Off | The checkered blend between colours (how strong: Dither Strength, under Shader). |
| Outlines | On, Off | A one-pixel line around NEWT (none in his shadow; how dark, its colour and where: under Shader). |
| Style | Default, DS, Soft, Custom | Default (what a first visit shows, set in the admin's Invitation page; as shipped, Soft with 6 colours, a full-strength dither, full-strength tinted lines on the outer ring, two toon bands and the highlight). DS: like the old handheld, 15-bit colour with a fine dither, dark 1-pixel lines, a hard shadow. Soft: fewer colours, pastel, a warm ring outside him and a softer, dithered shadow. Each sets every Shader option; Custom shows once one of them is yours (it can't be picked: choose a style, or Reset To Style, to go back). |
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
| Pixel Shirt | On, Off | Off in every style: his real plaid at every resolution (under about 100 pixels tall its checks are smaller than a pixel, so it shows as a mottled mix of its colours). On: below 128 pixels tall his shirt shows bold pixel checks. |
| Pixel Face | On, Off | On in every style: his face redrawn in pixels to fit his size, drawn after his smooth face (the same eyes, brows, mouth and blush, scaled down; the smooth face again at the finest steps zoomed in). Off: the smooth face at every resolution (drawn sharper with the pixel look on, the more the fewer pixels he has, down to the sheet's own pixels at 32×32 and coarser, so his eyes and mouth stay). |
| Shadow | Hard, Soft | A crisp shadow, or one with a dithered, two-tone edge. |
| Shadow Strength | Off to 100% | How dark his shadow is. |
| Light Angle | -180° to 180° | Turns the light round him (it still turns with the camera too). |
| Light Strength | 25% to 200% | How strong the light is. |
| Saturation, Warmth, Brightness, Contrast | | The grade on him: colour, warm or cool, light, and contrast. |

Dithering, outlines, Colors, the shadow's edge and the grade are part of the pixel look, so they
rest while Pixel Size is Off (toon shading, the shadow's strength and the light still apply).

On a device that can't keep up, NEWT's pixels get a little chunkier for a while: when frames
stay slow for a second the page adds a screen pixel to every one of his pixels (up to four), and
takes them back once frames are quick again. It never draws finer than the Pixel Size you
picked, and a new Pixel Size starts it afresh. It leaves Off alone, and a screen that's slow for
another reason (one that only shows 30 frames a second) isn't made chunkier for nothing: after
one try of a second or so it keeps your Pixel Size. A device that's only quick enough a little
chunkier tries your own Pixel Size again less and less often.
**Reset Camera**, under the settings, eases the camera back to where it started.

## NEWT Talks

Now and then NEWT says something in a speech bubble over his head, in the page's own style
(cream, a dark outline, Pixelify Sans, a tail toward him):

| Kind | When |
| --- | --- |
| Reactions | a tap (or Wave, or Spook) makes him wave or startles him |
| Running | he runs off; he's caught mid-run |
| Carried | he's picked up, shaken, dropped; he lands |
| Moving | he walks to a floor tap; he wanders off by himself |
| Sitting | he sits down by himself (not with Sit); he's still sitting after a quiet spell; he stands up |
| Passive | standing about, after a quiet spell of 20 to 40 seconds |
| Camera | the camera is spun round more than a turn in a few seconds; it's zoomed in very close |

Each moment speaks at its own chance, once its cooldown is over, with one of its lines at
random, never the line he just said. There's one bubble at a time: while a line is up, only a
moment that matters more replaces it (being caught or shaken first, idle time last). A line
types out at about 30 characters a second, stays long enough to read, then fades; with
reduced motion it shows all at once. The bubble follows him and stays on screen, clear of the
toolbar and the open Look sheet (near the top it goes beside his head, on a phone narrowed to
fit there with the line on more rows, or else under his feet, never over his face or body), and
never takes a tap; a screen reader hears each line once, whole. His lines, how often
he talks and the look a first visit gets are edited in the admin's Invitation page
([admin.md](admin.md)).

## For Developers

- **Code** (`src/invitation/`): the page imports only three.js, its GLTFLoader and its own
  modules (a shared `src/` module would share a chunk with the portfolio's first load).
  - Browser-only and thin: `main.js` (boot, the loop, the wiring in `types.js`'s frame
    order), `stage.js` (renderer at texel size, the camera with its off-centre projection,
    lights and shadows, the blob shadow and the floor marker, and each frame the boxes round
    NEWT the retro pass keeps its work to; `setZoomScale(k)`, which main.js calls with the
    orbit's home distance over its distance, sizes the texel to the zoom, refitting the grid only
    when the block changes; the frame-time governor's level added to every texel, and `?perf`'s
    corner), `floor.js` (no room: an
    invisible floor that only catches his shadows, a `ShadowMaterial`, over the preset's
    background; and the shadow camera's fit), `character.js` (NEWT's materials, clips with
    twins for restarts, look-at and faces),
    `retro.js` (the pixel pass; `warm` compiles the path not showing once NEWT is in, so the
    first switch to Off or back doesn't stall; `subjectBoxes`: outside the area round NEWT, his
    shadow and the decals every texel is the paper, so the canvas is only cleared there and both
    passes draw inside it alone, and the neighbour loops (the outer ring, the soft shadow) run
    only in the boxes where they can find something: the same picture for a share of the
    texels), `ui.js` (the toolbar and the Look sheet as
    markup, plus a thin binding), `invitation.css`.
  - Pure and unit-tested: `pixels.js` (the texel grid: at sprite resolution N, `RESOLUTIONS` 16
    to 256, a texel is `max(1, round(NEWT's default height in device px / N))` device pixels,
    `blockFor`, so he's about N texels tall; Native, a texel a device pixel at the real DPR with
    no cap; Off, the screen's pixels with the DPR capped at `OFF_DPR` (2); `pixelSteps`, a
    screen's steps, one a block size, the resolutions that come to 1 px folded into Native;
    `shownPixel`, what the slider reads for a Pixel Size: itself on a step it shares;
    `DEFAULT_PIXEL`, the one line that sets the default, `'128'`; and the default view: 20° of
    view, 36° up, NEWT 0.195 of a desktop's short side tall with the whole play area in sight,
    or 0.255 of a phone's, a stage whose short side is under 600 CSS px (99 CSS px, and 149
    texels at the default 128×128, on a 390-wide phone), whatever the Pixel Size, the point it
    looks at shown in the middle of the space over the toolbar, or of the clear space above or
    beside the open Look sheet, `clearInsets`; and `blockAt`: zoomed by k, NEWT's size on screen
    over the default view's, a texel is `max(1, round(his height in device px × k / N))`, a block
    in use held until the zoom is `ZOOM_HOLD` past the next, so it never flickers at a boundary, and the default view always drawn on the Pixel Size's own grid),
    `camera.js` (the orbit camera: yaw all the way
    round, three quarters of a turn for a drag across the whole stage and half a turn of tilt
    down its whole height, 12° to 70° up, half to twice the default distance, eased with a
    little coast; `orbitPan` slides it at once, the floor under the cursor exactly under it,
    `floorUnder`, the point it looks at kept in the play area; the point it orbits rests where
    it is and follows NEWT as it zooms in, 0.8 of the way at the default zoom on a phone, all
    the way while the Look sheet is open, and moves on with him as he nears the edge of the
    clear space, `ORBIT.keepIn` (0.6) of it, never letting him past `keepOut` (0.94) once he's
    on screen, from where `screenOf` puts him; a pan holds it until he walks off the screen;
    `orbitHold` holds it still while he's held, and once he's let go out past `keepOut` (carried
    to the screen's edge) it eases him back inside at `ORBIT.settle` (0.25 s) rather than
    jumping there in a frame; `lightDir` turns the look's sun with the
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
    a copy, for the renderer), `motionStep`, Choppy's 15 fps clock, `installDefaults` (the
    admin's Default look, `content.js` `invitationDefaults()`, over the built-in one at boot, each
    value checked on its own: the style it's built on with its Shader values becomes the Default
    style, its Pixel Size, switches and Motion the first visit's; a stored look still wins, a
    value it lacks taking these), and the presets),
    `shader.js` (the Shader options as one table, `SHADER_CONTROLS`: each one's label, range or
    choices, value text and where it lives in a preset, which `ui.js` renders; `toonRamp`, the
    toon gradient from bands and a highlight; `warmthTint`), `looks/default.js` (Default: Soft with the user's values, spread from `soft.js`),
    `looks/ds.js` and `looks/soft.js` (every look value, as data: a designer edits these, never
    code; among them the background, the shadow's colour and strength, and the blob shadow), and
    `looks/index.js` (their order in the Style row and `DEFAULT_STYLE`, `'default'`).
  - `governor.js` (pure: the frame-time governor. Each second of frames is judged by its p90:
    over `GOVERN.slowMs` (20 ms) steps a level coarser, a run of `recover` seconds under
    `fastMs` (18 ms) a level finer, holding between; a coarser step that doesn't make frames
    faster is taken back, none tried for `block` seconds and none ever again while the slow
    seconds are as slow as the one that made it (within `same`, 15%), and a relapse after a
    finer step doubles the next run, up to `recoverMax` (4 minutes); a finer step that holds
    `calm` seconds, or a new Pixel Size, brings it back down. It's on for visitors, off under
    `?test` unless `?govern`, and `?govern=off` turns it
    off.)
  - The behaviour modules (`brain.js`, `blend.js`, `steer.js`, `carry.js`, `lookAt.js`,
    `faces.js`, `gesture.js`, `rng.js`) are pure too; `types.js` lists the shapes they pass
    and the order a frame runs in. `gesture.js` reads the mouse's buttons apart (left: tap,
    grab or pan; right: orbit; middle: pan) and two fingers' middle as a pan; `carry.js`
    drags him on the upright plane facing the camera through where he was grabbed
    (`dragPlane`, `gripFor`, `dragTarget`: the grab offset kept, from where the press began;
    his collar no lower than it was grabbed at, or his hang height once he's been lifted clear
    of the floor, so a still cursor never lifts him off it, and no higher than `CARRY.liftMax`,
    5), the anchor the pointer's spot with no lag and the swing driven by a smoothed follow of
    it; `lookAt.js` `screenAim` aims his look camera-relative (performative gaze): seen from
    the camera the cursor lies some heads (`LOOK.headSize`, 0.53) from his head in some
    direction on screen, and his face turns from the line to the camera toward that direction,
    round that line, so on screen his gaze points at the cursor; none within `LOOK.deadZone`
    (0.3 heads: at the viewer), then eased out over `LOOK.ramp` (2 heads) to a side and
    `rampUpDown` (3.5) straight up or down, to `turnSide` (65°), `turnDown` (42°) or `turnUp`
    (40°) from that line by the way the cursor lies, so his chin keeps going down as the
    cursor goes further below (15° under the camera's line a head below him, where his eyes
    still peek under his cap, about 40° by four heads, his face under his cap: the user's
    "follow it fully"); any way round his gaze goes no higher than `upTop` (76°, well short of
    the vertical, where its yaw would swing round), and no lower under the camera's line than
    for a cursor straight below at that distance while his face is toward the camera (his gaze,
    turned as far round as he can, within `gazeFull`, 35°, of it, fading out by `gazeNone`,
    75°: in profile the pitch reads on screen as it is). `REACH` is how far the whole look
    turns his head (yaw ±100°, pitch −30°…+80°, the last quarter eased in rather than a dead
    stop: `softAim`): his neck's own `LIMIT` (±70°, −20°…+55°, all a look at the viewer or the
    camera takes) with his chest's share on top, `chestShare` (`CHEST`: smoothsteps to 30° of
    twist past 30° of yaw and 25° of lean past 40° of pitch, 10° forward past −10°; none for
    the looks he gives the viewer), which `character.js` `applyLook` turns his Chest by before
    Neck and Neck001 split the rest 30/70; `torsoStep` eases it out over a quarter second while
    he's held or falling, so his collar stays under the cursor. A target behind him keeps to the
    side his head is turned to. Running away ('back'),
    "ahead" is where he runs, chin level (`LOOK.runPitch`, −12°, against the Run clip's own
    lift), and every 1.4–2.4 s he glances back over his shoulder for 0.35 s, quickly
    (`backOmega`), 80° round (`backYaw` of `REACH`'s yaw: his chest twists about 24° with it),
    toward the side of the pursuer (`BrainOut.look.at`: the pointer, or where it was last
    seen; either side with none); with it straight behind him (past `backSide`, 150°), which
    shoulder is a toss-up, so `play.js` `lookAim` takes it round the side nearer the camera,
    and you see his face look back. Held, he looks at the viewer with idle glances
    ('forward'). The Run button with no pointer runs him from a spot beside him square to the
    camera (`TUNE.runFromGap`), across the view. `floor.js` `fitShadow(…, at)` moves the
    shadow camera to wherever he is, by whole shadow texels.
- **Speech and content:** `speech.js` (pure: `createTalk({lines, speech, rng}).step(...)` reads
  the brain's output this frame and last, the gestures, the button pressed and the camera's yaw
  and zoom, and says the line to show and its trigger; `TRIGGERS`, `PRIORITY`, `SPEECH_RANGES`;
  `lineDuration`: typed at 30 characters a second, held 1.6 s plus 0.045 s a character, faded
  over 0.35 s; `speechFrom` and `linesFrom` read the admin's settings and lines from anything),
  `bubble.js` + `bubble.css` (the bubble: `createBubble({root, before, now}).say(text)`, on
  the toy's clock as talk is (`now`: main.js's frame steps, capped and paused with the tab), then
  `update(head, avoid, under)` each frame with his head's circle on screen, the toolbar's and
  open sheet's rects and his feet's bottom; `placeBubble` narrows it to fit beside his head
  (`BUBBLE.minW`, 110 px, measured wrapped in 8 px steps) before it would go under him;
  `speakerPoint` makes his head null, the bubble out of sight, while the open
  sheet covers it; `clearRegion`, `placeBubble`, `bubbleFrame` and `speakerPoint` are pure;
  `main.js` steps talk right after the brain and moves the bubble once he's posed) and `content.js`
  (content.json's `invitation`, which the admin edits, through `virtual:invitation-content`:
  `invitationContent` in `vite.config.js` inlines only that subtree, watches the file and leaves
  the subtree out of the other pages' copy of content.json; `invitationLines()`,
  `speechSettings()`, `invitationDefaults()`, each with its fallback). That module is the one
  import the page has beyond three.js, its loader, its font and its own modules
  (`test/invitationContent.test.mjs` holds it to that). Tests: `invitationSpeech`,
  `invitationBubble`, `invitationContent`, and `admin/test/invitation.test.mjs` (the content
  rules and the admin page).
- **The clips contract:** `src/invitation/clips.js` names NEWT's clips (lengths, loops, fades),
  the face each shows, the bones by their three.js names and the step lengths. `tools/newt.py`
  makes the clips in Blender and `test/invitationModel.test.mjs` holds the glb to the contract.
- **The model:** `npm run model -- newt` rebuilds `public/models/newt.glb` from `tools/newt.py`
  with headless Blender (`$NEWT_BLEND` names the .blend; it defaults to the user's
  `NEWT_optimized.blend`, which is never overwritten).
- **The pixel face and shirt** (the face only with Pixel Face on, the preset's
  `texture.pixelFace`, on in every style; the shirt only with Pixel Shirt on, `texture.pixelShirt`,
  off in every style; off, the glb's smooth face and own atlas show at every resolution; a look
  stored with the one switch they split from, `pixelArt`, sets both, `LEGACY_SHADER`, and the
  admin's content rules read it with a warning): at the coarser
  resolutions his head is only a dozen or two texels wide, so
  `node tools/newt-face.mjs` redraws the glb's face sheet as `public/models/newt-face.png`,
  his smooth face scaled down faithfully to each cell size: its design measured from the glb's
  sheet (`DESIGN`: the heavy dark upper lid with its turned-down end, the white, the grey iris
  and the dark pupil just under the lid, the lash, the brow; closed, a lid line; happy, an arc
  and a blush; surprised, the lid and brow raised, the eye wide and a small o; the small
  mouth) kept where it is in a cell and drawn in whole pixels, a line a pixel thick at least
  and every feature a pixel at least, the colours sampled from the sheet (`--preview` to look
  at it). Where a shape scaled down as it is would read wrong through the page's dither, it's
  drawn as the smooth face reads at that size: a bar of a pupil right under the lid, its bottom
  corners rounded, a row of grey, then a flat-topped band over the iris's bottom rows and white
  over the lash (a row of grey between the lid and the pupil at 16 to 23 px, where the two ran
  together); surprised, an oval pupil centred in its iris (the sheet shows 1.75 times taller on
  his head than it's drawn, so a pupil any flatter than these reads as a squint there); the brow in from the lid's inner end and short of its hook; a tiny
  ㅅ of a mouth, a smile, a round o with soft corners; the happy arc's steps joined along an edge
  (a ⌒ in the small cells, never a box) and a one-row blush; no stray pixel on the closed lid.
  The page uses it while the pixel filter is on (Native too), the sheet whose cell matches his
  half face in texels (3 px at 16×16 up to 62, his half face at Native on a phone); past 1.25
  times the largest (`SMOOTH_FACE_OVER`: zoomed in at Native or the finest resolutions) it
  shows the glb's smooth face again, as at Off. A copy of the image cached from before the
  ladder grew shows the sheets it has, and the smooth face past them (`layoutFor`). His shirt shows the bold pixel plaid (`newt-atlas-pixel.png`, `tools/newt-atlas.mjs`)
  until he's `ORIGINAL_ATLAS_TEXELS` (128) texels tall in the default view at the Pixel Size's
  own grid (stage.js hands main.js that grid as `home`: neither the zoom's bigger blocks nor the
  governor's coarser ones change his shirt), then the glb's own plaid, sampled at the preset's
  `texture.fineMipBias`. The face sheet and the pixel atlas are asked for at the same time as
  the glb, and the first frame waits (up to 3 s more) for each one whose switch is on, so NEWT
  never shows a blank face or the blurred atlas first; one whose switch is off never holds it
  up.
- **Tests:** `test/invitationCharacter.test.mjs`, `invitationLook`, `invitationLooks`,
  `invitationShader`, `invitationRetro`, `invitationGovernor`, `invitationAtlas`,
  `invitationFace`, `invitationArea`, `invitationCamera` and `invitationPlay` (with
  `invitationBrain`, `invitationMotion`, `invitationGesture` and `invitationModel`), the speech
  and content tests above, and `e2e/invitation.spec.mjs` (`npm run e2e -- invitation`).
- **Test hooks:** `[data-stage].is-ready` once the first frame is drawn, `data-webgl="off"`
  without WebGL. `?test` adds `window.__invitation`: `snapshot()` (his state, clip, face,
  position, head turn, the camera's yaw, elevation and distance, the states he went through,
  `pixelScale`: CSS px a texel, `resolution`: the Pixel Size's N (`'native'` where the slider
  shows Native, a resolution at 1 px a texel included; null at Off), `newtTexels`: his height in
  texels and `newtTall` in CSS px in the default view, `faceSheet`: the face sheet showing (a
  cell width, or `'smooth'`, as at Off), `faceTexels`, `atlas`: `'pixel'` or `'original'`,
  `shader`: every Shader option's value, `custom`: whether one is the user's, `pass`: what
  reached the renderer (the post shader's values, the light's strength and angle, the shadow's
  strength, `zoom`: the zoom the texels follow, `pd`: device px a texel as drawn, `governor`:
  whether it's on, its level and the last second's p90), and `warmed`: the pass's other path compiled),
  `screen('head'|'body'|'feet')` (a point on him in client px, to tap; the head's with its
  radius, `r`), `floorAt(x, y)` (the
  endless floor: null only above the horizon), `feet()` (his ankles, to measure foot slide),
  `bones()` (his bones from his root), `grabbed()` (while he's held, where the point he was
  grabbed by shows, client px), `say(text)` (a line in his bubble now, as talk would show it)
  and `play(clip)` (Walk and Run step in place at their own pace). The snapshot's `camera` has
  the point it looks at on the floor (`target`) and whether a pan holds it (`panned`), `area` is
  the play area, and `talk` is what he's saying (speech.js's snapshot: the line up and its
  trigger, when the idle clock comes round). `?seed=N` makes the randomness
  repeatable; `?calm` stops him wandering and sitting by himself; `?perf` shows the frame times
  (p50 and p90), the GPU's time a frame where the browser can measure it, the grid, the
  governor's level and the zoom in a corner; `?govern` turns the governor on under `?test`.
- **Captures:** `node tools/capture-invitation.mjs` records real-speed clips of every clip and
  of taps, drags, buttons, floor taps, a chase and the camera at phone and desktop sizes
  (animated WebP plus a contact sheet; `--look`, `--pixel` (a resolution such as `64` or
  `64x64`, `native` or `off`), `--motion`, `--sizes`, `--acts`); its `pan`, `lift` and
  `sweep` acts (`tools/capture-invitation-camera.mjs`) slide, turn and zoom the camera, carry
  him up high (the report says how far the grabbed point strayed from the cursor) and sweep the
  cursor, or a finger, over the whole screen to show where he looks. One GPU capture at a time.
- **First load:** none of this reaches the portfolio's first load (`firstLoadGuard` in
  `vite.config.js`, `test/site.test.mjs` and the spec's last test check it).
- **Unlisted:** `noindex, nofollow`, left out of the sitemap and the README, and not
  Disallow'd in `robots.txt` (a Disallow is public and would hide the noindex from crawlers).
