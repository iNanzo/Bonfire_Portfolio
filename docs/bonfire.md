# The bonfire and the site: how it all behaves

The detailed behavior of the portfolio and its scene, moved out of the README (which is
now the short version). Design notes for the elements are in [elements.md](elements.md);
Bonfire Live's are in [visualizer.md](visualizer.md).

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
- **Weapon swap** (`src/bonfire/weapons.js`), in order:
  1. **Rise + ripple-dissolve (1.4 s):** the old weapon floats up out of the fire to the
     forge height, where the new one will appear, while it ripple-dissolves from the point
     up to the pommel. The dissolve is local-space noise plus a screen-locked Bayer
     dither, with a two-tone glowing edge (hot `hi` band, then `mid` band) and a faint echo
     contour ahead of it, all in the old flame's colors. Particles are shed from the
     dissolving edge as it passes, so they peel off bottom-up.
  2. **Helix: swirl (0.3 s) → gather (0.6 s):** shed particles drift out only a little
     before a rotating double helix around the new weapon's axis takes them over
     (1.5 turns, a spindle that's widest mid-blade). Each particle keeps its eventual
     target's height, so the helix spans the blade. Curl noise keeps a shimmer on it,
     and the color turns from the current flame's to the next. In the gather the helix
     tightens and spins faster as it collapses onto the new weapon's surface.
  3. **Double helix + ripple-form (0.9 s):**
     - **Helix:** once the particles' color has swapped (halfway through the color turn),
       two lines wrap the new weapon as a double helix with no rungs. They span exactly
       the blade's length and taper out toward both ends. One grows from the point up
       and one from the pommel down, each led by a bright core-colored head, and they
       meet as the form completes. They start on the particle helix. From the gather
       on, as the blade completes, they close in on the weapon itself. The helix
       becomes an oval about 2 texels (0.02) outside the weapon's real cross-section at
       every height (its width one way, its thickness the other), so the strands wrap
       the blade like a ribbon and pass behind it. A slow noise drifting along the
       strands thins them in patches (subtle dithered transparency), with a faint
       faster flicker on top.
     - **Form:** the ripple in reverse, pommel down to the point, edged in the new
       colors. Each particle fades out (dithered transparency, never dimming) as the edge
       reaches the spot it's holding, so the swarm melts into the solid weapon. The new
       color's glow comes in only after most of the blade has formed.
  4. **Formed → hold (0.25 s) → strike (0.13 s):** the form completing lands like a hit.
     One echo of the new weapon's own silhouette grows outward from it in its plane, to
     1.55× its size over 0.6 s. It's mostly scaled, so the outline keeps the weapon's
     exact shape, with only a slight outward push and a noise wobble, and it fades as
     it spreads. The helix fades, the camera jolts, the bonfire flares, and the weapon
     flashes before settling to its glow. Then it drives down (glow fading on the
     strike).
  - **Weapon profile raster:** built once per weapon on its first forge (about 3 ms).
    Its triangles are projected onto the blade's face plane and scan-filled into a
    grid. Marching squares traces the echo's contour. The same scan also records the
    exact cross-section at every row (width across the blade, thickness through it).
    Sampled at 64 heights and lightly blurred, that sets the helix's length and the
    oval it closes to.
- **Forge particles:** many fine specks, fewer mid-size ones, and rare large wisps (about
  60 / 30 / 10). Size and transparency vary with the fire's own simplex noise sampled
  where each particle is, so they vary in coherent pockets rather than per-particle
  static. Hot flickers are small and solid; cooler wisps are larger and fainter. They
  bloom when shed, tighten to fine points as they gather, and fade into the form.
  Transparency is ordered dither (`alpha` attribute → Bayer discard) because dimming a
  color walks it down the palette into other entries.
- **Impact:** the bonfire and fireflies take the new color and the fire erupts. A ring of
  fire in the new color races across the ground (`src/bonfire/impact.js`):
  - **Flame tongues** use the same size and transparency variation: young, hot tongues
    are small and solid, and older ones grow into larger, fainter wisps, with the curl
    turbulence swelling them in pockets.
  - **Shock ring:** a crisp two-strand line (a bright leading edge in `hi`, a dimmer
    trailing edge in `mid`) rides the fire front and fades as it spreads. It's never
    a clean circle: the front runs out in smooth lobes (emitter speed follows noise
    around the ring, different every impact), crawls in and out, licks up and down,
    the gap between strands breathes, and hot spots flicker along it in the core color.
    All of this uses the fire's own simplex noise (`src/bonfire/rings.js`).
  - **Collisions:** where the ring meets the pillar, wall, logs or rubble it stops just
    short of the surface, flares to the core color, throws a splash of embers up the
    obstacle and burns out, climbing a little up the surface while it flares. The line
    splits around the obstacle instead of passing through it, and the open arcs keep
    going until they fade at the clearing's edge.
    The tongues flare and climb there too.
  - It's trailed by a ring of smoke, with a billow of fine smoke, fluttering ash flakes
    and embers that cool as they fall.
- **Elements:** the bonfire can also be **lightning** or **ice**, in the current flame's
  colors (design notes: `docs/elements.md`). The element changes when a weapon lands.
  - **Lightning** (`src/bonfire/plasma.js`): a tesla ball with no glass, set down in the
    core of the bonfire (Ball Height moves it up above the logs), that keeps lashing out
    between the logs. Its cast light stays at the top of the logs so the clearing stays lit. Heavy bolts strike the ground, logs and stones around the fire, hold
    for a moment, then jump somewhere new. They're drawn as glowing ribbons with
    white-hot centers that taper as they go (`bolts.js`). Where one lands it flashes,
    throws sparks, lights the spot with its own point light and crawls away along the
    ground. Around the white-hot core, thinner filaments drift on the fire's noise: a
    filament whose path meets something strikes it, and one that meets nothing thins
    into fading dendrites. A few arcs crawl around the ball's surface, the filaments
    nearest the cursor reach for it, and the fire's cast light moves into the ball and
    strobes with the crackle. On impact (`lightningRing.js`) the whole scene flashes,
    heavy bolts crackle out of the bonfire into the scenery around it, and a thick ring
    of lightning tears across the ground in place of the fire ring. It splits around
    obstacles and climbs them, throwing forks, arcs and sparks, with strobing lights
    riding it. Whole-scene flashes happen only on an impact or a stoke, at most a
    couple a second, and reduced motion turns them off.
  - **Ice** (`src/bonfire/ice.js`): a crystal cluster grows up out of the ground around
    the blade, the way a druse grows from one seed. One dominant crystal forms first,
    then medium ones fanning out, then a spray of small ones low over the ash, with loose
    shards drifting above. The ice is a little translucent (a screen-door dither shows the
    blade, logs and a low banked fire inside) with a subtle glow. Frost motes twinkle up
    and chill seeps off. On impact, a ring of small crystal clusters spikes up as it
    expands and sinks back behind itself, behind a frost line. A tuft of chill
    (`chill.js`: cold mist that sinks and rolls along the ground) rolls off the slam and
    trails the ring.
- **Equipment:** the fire starts with the **longsword**, **ember flame** and **fire**
  element. Inspecting a project, or clicking the fire on any screen except the
  inventory, draws a random weapon and flame color (never the current pair) and an
  element, weighted by each element's chance. Home links and reloading put the starting
  equipment back. The fire's name follows the element: Azure Flame, Azure Lightning,
  Azure Frost.
- **Color changes** ease over ~1.2 s (`flameEase` in `src/palette.js`: an ease-in-out
  crossfade with a small damped wobble). The fire, the scene palette, the cast light and
  the UI's `--accent-*` colors all follow the same blend.
- **Keeping colors true:** where particles pile up past full brightness, the pixel pass
  scales the color back instead of clipping each channel (clipping washes blues,
  purples, pinks and yellows out to white). Only the bonfire's own dense heart burns
  white-hot, in the flame's pale core color — the same two-tone look for every flame.

## Brand

- **Logo:** an N and an H sharing one long crossbar, with the two inner stems rising high
  like a blade over its guard. It's line art only: no box or container, a transparent
  background, and strokes in `currentColor`, so it takes the flame's color and eases
  through every color change. Geometry and markup live in `src/ui/logo.js`: one path
  of separate butt-capped strokes, so the diagonal meets its stems in a fine wedge as
  in the drawn original. The viewBox is 58 × 80 around the crossbar's center.
- **Header mark** (top left): the inline SVG at 40 px tall. Strokes are fine and
  antialiased (2.4 of 80 units, about 1.2 px), never pixel-snapped: the mark is the one
  thing that isn't pixel art. It's drawn in `--accent-hi` with a soft `--accent` glow,
  and brightens to `--accent-core` on hover. There's no border around it.
- **Favicon:** `public/favicon.svg` is the static fallback (for the 404 page and before
  JS runs). After each color change the page redraws the icon in the current flame's
  `hi` color (debounced so a 1.2 s blend is one update). In a light browser theme it
  uses the flame's deep `lo` tone so it stays visible on a pale tab strip.

## UI motion

- **Inventory cursor:** one selection cursor made of four pixel corner brackets. It glides
  from slot to slot with a short overshoot, clamps onto the slot as it lands (a stepped
  squeeze in and back), then breathes 1 px while idle. The slot it lands on flashes its
  frame (core → accent), sheens once across the icon, pops the icon slightly and clears
  its dither veil. Hover, keyboard focus and inspecting all move the same cursor, and it
  rests on the first item by default. The inspected item keeps its bright frame and `E`
  badge.
- **Equip badge:** the `E` moves to the clicked item right away with a stepped pop. The
  weapon and flame labels ("Wields …") change when the weapon lands.
- **Accent sync:** nothing that uses an accent color transitions `color`. The flame blend
  updates the accents every frame, and a restarted stepped transition would hold the old
  color until the blend ends.
- **Skill slots:** the same corner brackets snap in on hover and focus, then breathe.
- **Reduced motion:** the cursor jumps without gliding; no breathing, sheen or pop.

## Round 5 additions (at a glance)

- **Hits have weight** (`effects.impact`, *Hits & impacts* in the admin): a freeze frame
  (hit-stop), an impact flash, camera trauma, debris that bounces off the scenery
  (`debris.js`), and marks on the ground — scorch, frost or branching burns — that fade
  (`marks.js`). Lightning leaves afterimages and strikes nearby fireflies; a fast blade
  leaves smear frames. Busy moments thin out the background extras.
- **Each element reads as itself** (`signatures.js`): fire's embers streak and twinkle,
  lightning's sparks flash as crosses and zig-zag, ice glints as diamonds. The particle
  shader draws shapes and motion streaks (`flame.js`).
- **The site:** a click on the planted weapon wakes it for a flourish; a click during a
  swap skips ahead; stoking throws the element's ring. *How it's made* (`B`) shows the
  render passes, the flow field and every particle system; *Photo mode* (`F`) frames the
  fire and saves a PNG; *Discoveries* counts the little secrets. Sounds per element and a
  forge hum through each swap. Projects get a *Result* line, links by the title and a
  full-size gallery.
- **Search and sharing:** each page is built with its own title, description, social
  image (1200×630, made from the cover) and structured data, plus `sitemap.xml` and
  `robots.txt` (`src/seoPages.js`, the build plugin in `vite.config.js`).
- **Hover effects (round 6):** no labels, the scene answers: over the planted weapon its
  rim glows (a click wakes it); over the fire it flares up — taller, brighter, throwing
  sparks and more light (a click stokes it, or skips ahead during a swap). The cursor
  turns to a pointer over both. The ice pulses slowly on its own (`effects.ice.pulse`).
- **Ableton Link:** `npm run link` with Carabiner running, then *Settings → Sound →
  Beat From: Ableton Link* in Bonfire Live (details in `tools/link-bridge.mjs`).

## Colors

The neutral base palette and the flame ramps (`[lo, mid, hi, core]` + a dark `shade` for
firelit stone) live in `src/content.json` under `effects` (edit them on the admin's
Effects page); `src/palette.js` turns them into `base` and `flames`. The 3D renderer
quantizes every pixel to base + current ramp; the UI reads the same ramp as CSS
variables (`--accent-hi` for text — every `hi` must be ≥ 4.5:1 on the background, and
`src/contentRules.js` enforces it).

## The bonfire

| Piece | File |
| --- | --- |
| Blender scene (procedural) | `tools/bonfire.py` |
| The 16 weapons (procedural, planted point-first) | `tools/weapons.py` |
| Firefly model | `tools/bonfire.py` (`firefly()`) |
| Editable source | `assets/source/bonfire.blend` |
| Preview renders | `assets/source/bonfire-preview.png`, `assets/source/weapons-lineup.png` |
| Web model (Draco-compressed; only the one decoder the loader picks is ever downloaded) | `public/models/bonfire.glb` |
| Scene, lights, passes, elements, the per-frame loop | `src/bonfire/scene.js` |
| Camera: points of view per screen, eased moves, sway, shake | `src/bonfire/povs.js`, `src/bonfire/view.js` |
| The cursor as the fire sees it (path, speed, ray) | `src/bonfire/pointer.js` |
| Curl-noise particle fire, sparks | `src/bonfire/flame.js` |
| Shared curl-noise field (bonfire, ring of fire, forge particles) | `src/bonfire/curl.js` |
| Cursor → fire interaction models | `src/bonfire/interaction.js` |
| Fireflies (navigation, landing, lit rotation, halos, lights) | `src/bonfire/fireflies.js` |
| Height map of the clearing (firefly steering, collision, wall spots) | `src/bonfire/terrain.js` |
| Impact effects: ring of fire, shock ring, smoke ring, smoke, ash, embers, collision splashes | `src/bonfire/impact.js` |
| Weapon swap (rise + dissolve → swirl → gather → ripple-form → glow → strike) + rim light | `src/bonfire/weapons.js` |
| Forge particles (shed, helix, gather; a held blade's aura and its fling) | `src/bonfire/forgeParticles.js` |
| Particle buffers and flame ramps as colors; shared math | `src/bonfire/points.js`, `src/math.js` |
| Particle shader: size by distance, dithered `alpha`, manual depth test | `src/bonfire/flame.js` |
| Line material for the shock ring and forge lines (dithered, depth-tested) + ring noise | `src/bonfire/rings.js` |
| Forge lines: double helix, weapon silhouette tracing + echo burst | `src/bonfire/forgeFx.js` |
| The frame's passes and buffers (and the visualizer's effect stages) | `src/bonfire/frame.js` |
| Pixel pass: outlines → fire → vignette → Bayer dither → palette (+ the visualizer's effects layer, `FX`) | `src/bonfire/pixelPass.js` |

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

Longsword, Broad Sword, Bastard Sword, Claymore, Katana, Uchigatana, Sabre, Rapier,
Estoc, Spear, Greatsword, Glaive, Naginata, Zweihander, Flamberge, Flamberge Zweihander,
and (round 6, after a reference chart) Winged Spear, Battle Axe, Flanged Mace, War Hammer,
Morning Star, Halberd and Lance; the longsword and broadsword were redone to the chart.
The hafted weapons are planted head-down like the swords, with long enough handles to
rise above the flames. The admin names them (*Weapon names*) and picks which ones a
random draw can pick (*Weapons in the draw*, at least 3); its Effects preview can forge
any one of them. Each keeps the same planted lean; every time one lands it spins to a random
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

## Round 7 additions (at a glance)

- **Swaps take after their element** (`weapons.js`, `forgeParticles.js`, `forgeFx.js`):
  the steps stay the same, and each element adds one habit per step. Lightning strikes
  the blade apart and re-forges it (a flickering white-hot edge with an arc crawling
  along it, crossed sparks that snap and blink, a broken jagged helix, a bolt into the
  pommel as it forms). Ice freezes and shatters it (a pale frost edge, chips that fall
  before a slower helix gathers them and glint as they freeze onto the new blade, a
  hexagonal helix, a cut-crystal echo growing in steps). Fire is as before.
- **Ice tufts** (`ice.js`): whenever the ice emits, little fans of crystals sprout from
  the ash around it, flick off a glint and sink back.
- **Two altars** (`scenery.js`): a cathedral's chancel (an altar on a stepped dais, a
  lancet window of stained glass under a pointed arch, candle stands, a nave column pair,
  a pew) and a cult's (a rune-carved slab on a round dais, ember bowls, black candles,
  hooded stone figures with glowing eyes, standing stones, a half ring of candles behind
  the fire). The forge and the shrine were rebuilt on the same rules, which removed their
  artifacts: faces stay flat (pieces lean as a whole instead of per-vertex jitter), block
  joints have a recessed core behind them (no dashed outlines), nothing is left open to
  see through, nothing is coplanar (glows draw a hair in front), nothing is sub-texel
  thin, and glows have kinds (a lamp's windows share one steady light instead of each
  flickering to its own color). The fire's shadow has a normal bias against acne on thin
  posts.
- **The pack** (`src/ui/pack.js`, `src/ui/pixelArt.js`): a backpack in the bottom-right
  corner. Hover it, tap it or press I; its items rise out of it and each one's options
  fly out as a text list: the Map (swap the scene), the Anvil (swap the weapon), the
  Spell Tome (the element's ring, the living weapon, a new spell: forging a new blade in
  that element, and new bonfire colors, each with a swatch). The icons are 16×16 line-art pixel icons drawn from ASCII, animated in
  CSS. The same pack is in Bonfire Live.
- **Switching screens:** the old screen's panels dither away (the scene's own ordered
  dither, as a mask) as they slide off; the new ones slide in from the way you're going
  and dither in, corners flaring, the title's gem turning in and the title drawing left
  to right, then the panel's lines rise in one by one. The tabs sit in the header's true
  middle with an underline that glides between them, and the button prompts stay in one
  place (bottom center) on every screen.
- **Scrolling and clicks:** the wheel (or, on touch screens, the page's scroll) sweeps the
  loose particles and the fireflies a little the way the page moves; a click sends a soft
  gust out through the particles under it.
- **Content:** one headline everywhere (Full-Stack Developer & Game Maker), a Résumé
  button that appears once `public/resume.pdf` exists, a drafted Lyft case study (hidden
  until it has real details), clips in project galleries (`video: true` on an image plays
  its `.mp4`), and a link from Bonfire Live's page into this page's own breakdown.
