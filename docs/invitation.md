# The Invitation: playing with NEWT

A small toy at `/invitation/`: NEWT, Newton's low-poly chibi, stands in a plain white room seen
through its missing front wall, and you can play with him. It's made for a phone first and works
with a mouse too. It has its own look (off-white and warm greys, chunky buttons, pixel art drawn
like an old handheld's 3D), not the bonfire site's. The page is unlisted: nothing links to it
and search engines are asked not to index it.

## What You Can Do

- **Tap him** and he waves or gets startled (a jump, arms flung up). Tap him a lot and he gets
  stressed and runs away from your finger; he's never too fast to catch.
- **Drag him** to pick him up by the collar. He dangles and swings; let go and he falls, lands
  and gets back up.
- **Tap the floor** and he walks there. A ring on the floor shows where your finger or cursor is.
- **Point around the room** and he looks where you point.
- **Leave him alone** for about 20 seconds and he sits down.
- **The toolbar:** Wave, Spook, Sit (Stand once he's sitting), Run (he runs off for a few
  seconds), Wander (on: he strolls around by himself) and Look. The buttons rest while he's
  being held or falling.

(The page draws NEWT and his room now; tapping, carrying, walking and the buttons come with the
next step of the round.)

## The Look Menu

**Look** opens a sheet along the bottom. Every change shows right away and is kept for your next
visit (in this browser).

| Setting | Choices | What it does |
| --- | --- | --- |
| Pixel Size | Off, Fine, DS, Chunky | How big the pixels are: Fine about 270 across the short side of the screen, DS about 192, Chunky about 150 (Soft is chunkier). Off draws at the screen's own resolution, smooth. |
| Dithering | On, Off | The checkered blend between colours. |
| Outlines | On, Off | A one-pixel line around NEWT and where the walls meet the floor. |
| Style | DS, Soft | DS: crisp, many colours, a hard shadow. Soft: chunkier, fewer colours with a visible dither, pastel, warm outlines and a softer shadow. |

Dithering and outlines are part of the pixel look, so they rest while Pixel Size is Off.

## For Developers

- **Code** (`src/invitation/`): the page imports only three.js, its GLTFLoader and its own
  modules (a shared `src/` module would share a chunk with the portfolio's first load).
  - Browser-only and thin: `main.js` (boot, the loop, the wiring), `stage.js` (renderer at
    texel size, camera, lights and shadows, the blob shadow and the floor marker), `room.js`,
    `character.js` (NEWT's materials, clips, look-at and faces), `retro.js` (the pixel pass),
    `ui.js` (the toolbar and the Look sheet as markup, plus a thin binding), `invitation.css`.
  - Pure and unit-tested: `pixels.js` (the texel grid and the camera framing), `look.js` (the
    Look settings under `invitation.look.v1`, and the presets), `looks/ds.js` and
    `looks/soft.js` (every look value, as data: a designer edits these, never code).
  - The behaviour modules (`brain.js`, `blend.js`, `steer.js`, `carry.js`, `lookAt.js`,
    `faces.js`, `gesture.js`, `rng.js`) are pure too; `types.js` lists the shapes they pass
    and the order a frame runs in.
- **The clips contract:** `src/invitation/clips.js` names NEWT's clips (lengths, loops, fades),
  the face each shows, the bones by their three.js names and the step lengths. `tools/newt.py`
  makes the clips in Blender and `test/invitationModel.test.mjs` holds the glb to the contract.
- **The model:** `npm run model -- newt` rebuilds `public/models/newt.glb` from `tools/newt.py`
  with headless Blender (`$NEWT_BLEND` names the .blend; it defaults to the user's
  `NEWT_optimized.blend`, which is never overwritten).
- **The pixel face:** at the toy's pixel sizes his head is only a dozen or two texels wide, so
  `node tools/newt-face.mjs` redraws the glb's face sheet as `public/models/newt-face.png`,
  four small pixel cells with the features kept at least 2 px thick (`--cell`, `--min`,
  `--preview` to look at it). The page uses it while the pixel filter is on.
- **Tests:** `test/invitationCharacter.test.mjs` and `test/invitationLook.test.mjs` (with
  `invitationBrain`, `invitationMotion`, `invitationGesture` and `invitationModel`), and
  `e2e/invitation.spec.mjs` (`npm run e2e -- invitation`).
- **Test hooks:** `[data-stage].is-ready` once the first frame is drawn, `data-webgl="off"`
  without WebGL. `?test` adds `window.__invitation`: `snapshot()`, `screen('head'|'body')` (a
  point on him in client px, to tap) and `play(clip)`. `?seed=N` makes the randomness
  repeatable; `?calm` stops him wandering and sitting by himself.
- **Captures:** `node tools/capture-invitation.mjs` records real-speed clips of every clip and
  of taps, drags, buttons and floor taps at phone and desktop sizes (animated WebP plus a
  contact sheet; `--look`, `--pixel`, `--sizes`, `--acts`). One GPU capture at a time.
- **First load:** none of this reaches the portfolio's first load (`firstLoadGuard` in
  `vite.config.js`, `test/site.test.mjs` and the spec's last test check it).
- **Unlisted:** `noindex, nofollow`, left out of the sitemap and the README, and not
  Disallow'd in `robots.txt` (a Disallow is public and would hide the noindex from crawlers).
