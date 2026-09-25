# Newton Hoang — Portfolio v2

A portfolio that plays like a game: an always-visible, pixel-art bonfire sits behind
every screen, the camera moves to a new point of view for each one, and projects
live in an inventory. Inspecting a project pulls the weapon out of the fire and
stabs in a new one, and the fire relights in a new color that also recolors the UI.

Vite + vanilla JS, Three.js, and a Blender-built model.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/
npm run preview    # serve the production build locally
```

## How it plays

| Screen | Route | Camera |
| --- | --- | --- |
| Home (title menu) | `#/` | wide shot, fire on the right |
| Project Inventory | `#/projects` | closer, fire between the item panel (left) and the inventory grid (right) |
| Item details | `#/projects/<id>` | close on the weapon |
| Journey | `#/experience` | toward the pillar and candles |
| Skills | `#/skills` | overhead |
| About | `#/about` | from the pillar side |
| Contact | `#/contact` | low and wide |

- **Keyboard:** `Q` / `E` switch screens · arrows or WASD move through menus, items and
  skills · `Enter` selects · `Esc` goes back (item → inventory → home).
- **The fire:** click it (or “Stoke the fire”) to stoke it. Moving the cursor through it
  bends and stirs the flames (see *Cursor interaction* below). Clicking any button or
  link makes the fire flare.
- **Fireflies:** 18 modeled fireflies roam the clearing, steering over and around the
  scenery (never through it), and land on tops and walls alike — the ground, stones,
  logs, the pillar's sides, the wall's face. They hover in front of a spot, ease onto it
  and fold their wings, and take off the same way. 9 fly lit at a time (one fades out
  fully before the next lights), each with a soft dithered halo and real light; a
  firefly that lands always lights up, and hovering lights one too (it flickers and shies
  away) — both can go past 9. A click makes them flash. When a new weapon slams down,
  each pops on in the new flame color on its own beat and darts off; the extras fade out
  quickly once the color change is done.
- **Weapon swap:** the old weapon ripple-dissolves into flame particles that swirl above the
  fire through the bonfire's curl noise, turning from the current flame's color to the
  next; they assemble into the new weapon's silhouette, the solid weapon forms inside it
  as they fade, and it glows in its new color before striking down (the glow fading on
  the strike). On impact the bonfire and fireflies take the new color, the fire erupts,
  and a ring of fire in the new color races across the ground — flaring and climbing where
  it meets the pillar, wall, logs and rubble — trailed by a ring of smoke, with a billow of
  fine smoke, fluttering ash flakes and embers that cool as they fall.
- **Equipment:** the fire starts with the **longsword** and **ember flame**. Inspecting a
  project, or clicking the fire on any screen except the inventory, draws a random weapon
  and flame color (never the current pair). Home links and reloading put the longsword
  and ember flame back.
- **Color changes** ease over ~1.2 s (`flameEase` in `src/palette.js`: an ease-in-out
  crossfade with a small damped wobble). The fire, the scene palette, the cast light and
  the UI's `--accent-*` colors all follow the same blend.
- **Keeping colors true:** where particles pile up past full brightness, the pixel pass
  scales the color back instead of clipping each channel (clipping washes blues,
  purples, pinks and yellows out to white). Only the bonfire's own dense heart burns
  white-hot, in the flame's pale core color — the same two-tone look for every flame.

## Editing content

All text lives in **`src/content.js`**: screens, hero copy, projects (`featured`,
`projects`, `archive`), experience, skills, contact and the 404 page. Items marked
`TODO` need confirming before you publish.

- **Add a project:** add an object to `projects` in `src/content.js`. Put its images in
  `public/assets/projects/<id>/` as `name.webp` (full size) and `name-card.webp` (~720px),
  then list them in `images` (the first is the inventory icon). To pull more captures from
  the old portfolio, add lines to `tools/import-screenshots.mjs` and run `npm run screenshots`.
- **Resume link:** drop a PDF in `public/` and set `site.resumeUrl`.
- **Weapons:** display names are in `weapons` in `src/content.js`.

## Colors

`src/palette.js` holds the neutral base palette and the ten flame ramps
(`[lo, mid, hi, core]` + a dark `shade` for firelit stone). The 3D renderer quantizes
every pixel to base + current ramp; the UI reads the same ramp as CSS variables
(`--accent-hi` for text — every `hi` is ≥ 4.5:1 on the background).

## The bonfire

| Piece | File |
| --- | --- |
| Blender scene (procedural) | `tools/bonfire.py` |
| The 16 weapons (procedural, planted point-first) | `tools/weapons.py` |
| Firefly model | `tools/bonfire.py` (`firefly()`) |
| Editable source | `assets/source/bonfire.blend` |
| Preview renders | `assets/source/bonfire-preview.png`, `assets/source/weapons-lineup.png` |
| Web model (Draco-compressed) | `public/models/bonfire.glb` |
| Scene, lights, passes, camera, interaction | `src/bonfire/scene.js` |
| Camera points of view per screen | `src/bonfire/povs.js` |
| Curl-noise particle fire, sparks | `src/bonfire/flame.js` |
| Shared curl-noise field (bonfire, ring of fire, forge particles) | `src/bonfire/curl.js` |
| Cursor → fire interaction models | `src/bonfire/interaction.js` |
| Fireflies (navigation, landing, lit rotation, halos, lights) | `src/bonfire/fireflies.js` |
| Height map of the clearing (firefly steering, collision, wall spots) | `src/bonfire/terrain.js` |
| Impact effects: ring of fire, smoke ring, smoke, ash, embers | `src/bonfire/impact.js` |
| Weapon swap (dissolve → swirl → gather → form → glow → strike) + rim light | `src/bonfire/weapons.js` |
| Pixel pass: outlines → fire → vignette → Bayer dither → palette | `src/bonfire/pixelPass.js` |

Rebuild the model after editing the Python files:

```bash
npm run model
# or point at a specific Blender install:
BLENDER_PATH="D:/SteamLibrary/steamapps/common/Blender/blender.exe" npm run model
```

If you edit `bonfire.blend` by hand, export **File → Export → glTF 2.0** (GLB, Draco on,
normals on) to `public/models/bonfire.glb`. Keep the names `Weapon_<key>`,
`CandleFlame_*` and `Glow_*` — the site finds them by name. In the `.blend`, the weapons
stand in a row in front of the scene; the site places them in the fire.

**Render debug:** press **P**, then **1** pixel size · **2** palette · **3** dither
strength · **4** Bayer 4×4/8×8 · **5** outlines · **6** cursor interaction.

### Weapons

Longsword, Broad Sword (backsword), Bastard Sword, Claymore, Katana, Uchigatana, Sabre,
Rapier, Estoc, Spear, Greatsword, Glaive, Naginata, Zweihander, Flamberge, Flamberge
Zweihander. Each keeps the same planted lean; every time one lands it spins to a random
angle about its own axis. Dark, worn and simple: blackened fittings, wrapped grips,
chipped edges; blades use three flat tones (edge / steel / fuller) for a sprite-like read.
Each is modeled at final size and planted by `plant()` in `tools/weapons.py`.

### Cursor interaction

The default, **Ember**, blends a fluid "stir" field with a soft part around the cursor
and a gentle lean toward it; a blade-like slash only joins in on fast swings, and the
swing's speed is smoothed with a velocity-dependent release so hard swings follow
through and ease out. Stirred flame lifts and cools faster, like real fire, and fast cuts
throw sparks. The individual ingredients can be compared with `?lab` (e.g.
`http://localhost:5173/?lab`) or **P** then **6**:

| Mode | Feel |
| --- | --- |
| Ember | default: the mix above |
| Slash | the original: the cursor path knocks particles along the swing |
| Stir | fluid: a smoke-like flow field you stir; keeps swirling after you stop |
| Wake | the moving cursor sheds little vortices that curl the flames behind it |
| Part | the flame parts gently around the cursor and flows back together |
| Draw | the plume leans and reaches toward the cursor |

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. Build with the right base path:
   - User site (`username.github.io`) or custom domain: `npm run build`
   - Project site (`username.github.io/repo-name/`): `BASE=repo-name npm run build`
     (PowerShell: `$env:BASE='repo-name'; npm run build`)
3. Publish `dist/` — push it to a `gh-pages` branch (`npx gh-pages -d dist`), or use a
   GitHub Actions workflow with `actions/upload-pages-artifact` + `actions/deploy-pages`.
4. In **Settings → Pages**, pick that branch or "GitHub Actions" as the source.

Routes use the URL hash (`#/projects`), so deep links work on GitHub Pages without
server rewrites. `404.html` is built alongside and served automatically.

## Accessibility & performance

- Every screen is reachable by keyboard, links, and the menu; focus moves to each
  screen's heading on navigation and changes are announced to screen readers.
- `prefers-reduced-motion`: instant camera cuts, weapons dissolve in place, no screen
  shake or sway, a calmer fire, no UI animations.
- The scene renders at low resolution (one texel = 3–4 CSS pixels), pauses when the tab
  is hidden, uses fewer particles and no shadows on touch devices, and Three.js is only
  loaded after the page content.
- Sound is off by default and fully synthesized (no audio files).
