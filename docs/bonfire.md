# The bonfire and the site: how it all behaves

The detailed behavior of the portfolio and its scene, moved out of the README (which is
now the short version). Design notes for the elements are in [elements.md](elements.md);
Bonfire Live's are in [design/visualizer.md](design/visualizer.md), the Painter's in
[painter.md](painter.md) and the knight's in [knight.md](knight.md).

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
  skills · `Enter` selects · `Esc` goes back (item → inventory → home) · `F` photo mode ·
  `B` how it's made · `I` the pack · `P` the render settings · `?` lists them all (the
  keyboard shortcuts, `src/ui/siteKeys.js` through the shared `src/ui/keysOverlay.js`).
  Shift with a letter is no shortcut (only `?`), and nothing fires while you type in a
  field (the shortcuts' filter, say).
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
Colors page); `src/palette.js` turns them into `base` and `flames`. The 3D renderer
quantizes every pixel to base + current ramp; the UI reads the same ramp as CSS
variables (`--accent-hi` for text — every `hi` must be ≥ 4.5:1 on the background, and
`src/contentRules.js` enforces it).

## The bonfire

| Piece | File |
| --- | --- |
| Blender scene (procedural) | `tools/bonfire.py` |
| The 23 weapons (procedural, planted point-first) | `tools/weapons.py` |
| Firefly model | `tools/bonfire.py` (`firefly()`) |
| Editable source | `assets/source/bonfire.blend` |
| Preview renders | `assets/source/bonfire-preview.png`, `assets/source/weapons-lineup.png` |
| Web model (Draco-compressed; only the one decoder the loader picks is ever downloaded) | `public/models/bonfire.glb` |
| Scene: the renderer and its passes, the flame, the elements, the flame's colors, the frame loop; `createBonfire` and its API | `src/bonfire/scene.js` |
| What the scene's parts share (`ctx`), the layers, the fire's place | `src/bonfire/sceneContext.js` |
| Lights | `src/bonfire/sceneLights.js` |
| The model's loading, and the weapons, fireflies and impact rings made from it | `src/bonfire/sceneModel.js` |
| The places around the fire and their height maps (built ahead in idle time) | `src/bonfire/sceneScenery.js`, `sceneIdle.js` |
| Hits (hit-stop, flash, debris, marks), stokes, impacts, beats, rings, the living blade | `src/bonfire/sceneFire.js` |
| Render options over the settings, the render size, the P menu's steps, the breakdown | `src/bonfire/sceneRender.js` |
| The per-frame update, the fire shadow's redraws, the frame (`renderFrame`) | `src/bonfire/sceneUpdate.js` |
| What's under the cursor, the hover, a click's gust, the scroll's sweep | `src/bonfire/scenePick.js` |
| The knights' style, the site's knight, `fire.knights` | `src/bonfire/sceneKnight.js` |
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
| The knight: loading, skinning, seats, reactions, the dancers (`fire.knights`) | `src/bonfire/knights.js` (the model's template: `knightMesh.js`; keeping clear of the scenery: `knightClear.js`, `colliders.js`; the plates' springs: `knightPlates.js`; the scene's side: `sceneKnight.js`) |
| Where the knights sit, rest, dance and walk (the seats, the dance ring, places, `planWalk`) | `src/bonfire/knightPlaces.js` |
| The knight's poses: IK, sitting and standing, gestures, reactions, the dance moves | `src/bonfire/knightPose.js` (re-exports `knightRig.js`, `knightSolve.js`, `knightBody.js`, `knightGestures.js`) |
| The knight's armor: his styles' shading, the fire's light and color on his plate | `src/bonfire/armor.js` |
| His styles (pixel-cel, pixel-painterly, pixel-chiaroscuro, gunmetal, blackgold, first) and finishes (the steel's colors) | `src/bonfire/knightStyles.js`, `src/bonfire/steel.js` |
| His comings and goings (away → arriving → resting → leaving) and his summon sign | `src/bonfire/knightArrival.js`, `src/bonfire/summonSign.js` |
| The element's forge run (the weapon swap's, reused for his arrival and leaving) | `src/bonfire/forgeRun.js` |
| The dissolve's shader helpers (weapons and knights) | `src/bonfire/dissolve.js` |
| Knight model (procedural) and its web model | `tools/knight.py` → `public/models/knight.glb` |
| The First Build style's own model: round 8's first build, frozen as it was exported (no tool writes it again; `test/knightModel.test.mjs` guards its rig), fetched only when that style is chosen | `public/models/knight-first.glb` |

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

**Render Settings** (`src/ui/renderMenu.js`): press **P** (or pick *Render Settings* in the
menu: the way in on a touch screen), then, under **Picture**, **1** Pixel Size (2, 3, 4, 6
or 8 px: `src/pixelSizes.js`, the same list as Bonfire Live's and the Painter's) · **2**
Palette · **3** Dither · **4** Dither Pattern (4×4 / 8×8) · **5** Outlines, and under
**Interaction** **6** Cursor (how the pointer stirs the fire) · **0** *Reset Render
Settings*, back to the site's look (the effects in `content.json`; not while a weapon is
being forged). Every row is a button too: a click steps it, a Shift+click steps it back;
each says what it does as its tooltip, and tells assistive tech its key
(`aria-keyshortcuts`). It shows as a HUD in the top-right corner, with a close button, or
inside the breakdown's panel while that's open (see below); the two hand over, so P means
the same thing in both (except on touch screens, where there's no P: closing the
breakdown just folds them away). Closed with focus in it, the HUD gives focus back to what
had it before (`src/ui/focus.js`). Only the cursor's pick is remembered (`fireInteraction`
in this browser, where `?lab` keeps its pick too; the reset forgets it): the rest is the
site's look again on a reload. The P key is listened for from the start and does nothing
until the scene is there.

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

### The knight

A knight in steel plate comes to the fire in every scenery when he's summoned (see "The
knight comes when summoned" below; design notes and the model's rig: `docs/knight.md`).
His model is its own file, fetched alongside the scene's; if it fails to load the fire
burns without him (a console warning, not an error).

- **Where he sits.** Behind the fire on the left, facing it: on the ground in the ruins,
  the broken pillar a metre to his right (round 11), the cathedral's fallen nave drum, the
  cult's fallen standing stone, and a stump (the forge) or a resting stone (the shrine)
  added for him at the end of their builders (`SEATS` in `src/bonfire/knightPlaces.js`,
  re-exported by `scenery.js`). A raised seat's height is read from the scenery's height
  map when he sits; on the ground he sits on whatever lies under him. Two-bone IK puts his
  feet on the ground in front of him. The higher the seat, the deeper he slumps, which
  keeps his helmet under ~1.2 m (clear of the page's header on phones); on the ground he
  rests with one knee drawn up and the other leg stretched out (*Watchful*: both knees
  up). Nothing stands within his arms' reach at any seat (the anvil, the shrine's back
  lantern, the cathedral's nave and the cult's stones moved back in round 11), so his
  gestures go all the way: Praise the Sun is a full V.
- **One mesh.** Each knight is one rigidly skinned mesh (every vertex on its piece's
  bone) plus one for the helmets, geometry shared between knights: two draw calls. The
  helmets not worn are scaled to nothing. Tassets follow the thighs (the model says how
  far); the pauldrons ride the arms on their own joints, lag and settle on a spring, and
  never go into the helmet.
- **Sprite motion.** Poses step at the fire's 12 frames a second. The fire's shadow is
  redrawn only on steps with real motion (getting up, a gesture, a flinch, dancing),
  never for breathing or a glance.
- **At rest** he breathes, lets his head sink and lifts it, glances about, shifts now and
  then. **He reacts**: sits up and watches a weapon rise out of the fire (and the living
  blade in flight), flinches at the impact, leans away from a stoke with an arm up,
  lifts his feet as a ring passes. **Hovered**, his rim warms and he turns to look at you
  (`hoverAt` returns `'knight'`; `knightAt()` gives which one).
- **Armor** (`armor.js`; docs/knight.md has the details): he's drawn in one of his
  styles (`knightStyles.js`): by default *Pixel Cel*, a hand-drawn sprite with ink lines on
  every plate edge and flat bands, whose lit plates wear the flame's colors; the other
  pixel styles, *Smooth Steel* (the `gunmetal` style: natural light on gunmetal steel), and round 8's looks (*Black
  & Gold*, *First Build*, its own model loaded when chosen). The steel styles take a
  finish (`steel.js`: Gunmetal, Blackened, Polished Steel, Burnished) and an edge glow in
  the fire's color. When the fire flares (a click that stokes it, the cursor coming onto
  it, a weapon forming or landing, a ring) its reflection sweeps across the whole armor,
  fading within a second; at rest a gentler sweep runs over him every few seconds. A beat
  (the visualizer's pulses) widens the reflection for a moment.
- **The living blade** plans its moves clear of the knights (capsules round them).
- **Photo mode** stops the camera 2.1 m from the fire, so it never ends up inside him.
- **Reduced motion:** he sits still: no idle motion, reactions, gestures or dancing, and
  a helmet change is instant.

`fire.knights` (safe before the model loads, and without it) is the API the site and
Bonfire Live drive: the cast (`setCast`, `summon`, `dismiss`), helmets (`setHelmet`, with
the swap animation), `sit`/`stand`, `gesture(name)`, `lookAt(point)`, `dance(i, {...})`
with a per-frame `clock(beatPos, period)`, `slots(scenery)` for where dancers can stand,
and `list`/`positions` for cameras. The full list is in the header of `knights.js` and in
`docs/knight.md`.

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
  fly out as a text list: the Map (*Fast Travel*: another place for the fire), the Anvil
  (*Swap Weapon*: the *Living Weapon* first, then the weapons by kind, *Swords*,
  *Greatswords*, *Polearms* and *Axes & Hammers*: `WEAPON_GROUPS` in `src/weaponGroups.js`,
  re-exported by `src/contentRules.js`, the headings `ui.packSwords` and so on), the Spell
  Tome (*Cast a Spell*: the element's ring, then *Elements*, a new spell, which on the site
  also forges a new blade in that element and says so as its tooltip, and *Flame Colors*,
  each with a swatch) and, since round 8, the Knight (*Summon & Tend*: his summons and
  send-off, then his gestures, helmet, style and finish; see "The knight comes when
  summoned"). Each heading names a group screen readers hear (`role="group"`, labelled by
  it); a long list (more than 12 options, headings aside) goes in two columns. An option
  that's off for a reason says why: under its heading and as its tooltip (a style that
  wears its own colors has no finish; reduced motion has no gestures, ring or living
  weapon). The icons are 16×16 line-art pixel icons drawn from ASCII, animated in CSS. The
  same pack is in Bonfire Live and the Painter (where it paints into the scene).
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
  its `.mp4`), and a link from Bonfire Live's page into this page's own breakdown (moved
  to the Portfolio's page in round 8).

## The Portfolio page and the breakdown (round 8)

- **The Portfolio is a project** (`portfolio` in `content.json`, just before Bonfire Live):
  what the site is and how it was built, with the breakdown's five views as its
  screenshots, plus a close view of the knight (`public/assets/projects/portfolio/`:
  final, normals, lighting, particles, flow, knight; captured from the scene at 4 px a
  texel and scaled with hard edges). Its *Take This
  Page Apart* opens the breakdown in place; Bonfire Live's page links here instead.
- **Links to the breakdown:** any link to `#how-its-made` opens it: in place, or on
  arrival once the scene has loaded (`/#how-its-made`, `/projects/portfolio/#how-its-made`;
  the address keeps its path and drops the hash).
- **Inside the breakdown** (`src/ui/breakdown.js`): the views, what the one picked shows,
  the render settings (folded; **P** opens them and puts the cursor on the first row, the
  digits step them, the heading is a button for the mouse), then the counts: what's in
  the fire (the scene, the weapon and the fire's name, which follow the pack's picks as
  they land), the frame's draw calls and size, and every particle system (idle ones
  dimmed). **B** or **Esc** closes it; **F** swaps it for photo mode. Closed, focus goes
  back to what opened it (the link, the Menu button), or to the page's main region; photo
  mode does the same (`src/ui/focus.js`).
- **The pack stays:** on wide screens it steps aside to the panel's left (its lists still
  fly out to the left, over the scene); on phones the panel is a sheet along the bottom
  and the pack sits on its top edge. **I** opens it as anywhere else, and Esc inside it
  closes only the pack.
- **Pack lists always fit** (`fitList` in `src/ui/pack.js`, everywhere, not only here):
  measured as they open (and on resize, and when the pack moves), a list too wide for the
  room left of its item drops to one column and then narrows; one too tall slides down,
  as far as the window's bottom, then scrolls. They stay below the header. The e2e test
  opens every list at 390×844, 768×1024, 844×390, 1024×768, 1280×800 and 1920×1080 with
  the breakdown open and closed.
- **Without WebGL** there's nothing to take apart: *Take This Page Apart* is hidden, the
  rest menu drops Photo Mode, How It's Made and Render Settings, and `#how-its-made`
  links do nothing.
- **Keys with a view picked:** the views are radio buttons, and a focused radio no longer
  counts as typing (`typing` in `src/ui/shell.js`; the breakdown's own keys ask `isEditing`
  in `src/routes.js`, which agrees), so B, F, P and I work at once.

## The knight comes when summoned (round 9)

He isn't there when a page opens: the user found him too distracting on first load. On
the site (`src/main.js`, `src/bonfire/sceneKnight.js`, `src/bonfire/knightArrival.js`):

- **His summon sign** (`summonSign.js`): the NH monogram (the logo's own strokes,
  `LOGO_STROKES` in `src/ui/logo.js`) glows on the ground in front of his seat in every
  scenery, breathing slowly. **Hovered**, it brightens and its motes rise (the scene's own
  effect; `hoverAt` returns `'sign'`; the page only turns the cursor into a pointer,
  `.stage[data-hover='sign']` in `styles.css`). **A click on it summons him**; so does
  **Summon** in the pack (the keyboard's way).
- **Arriving and leaving** use the weapon swap's own dissolve in the current element's way
  (`forgeRun.js`): fire rises off the sign's strokes and spirals round him as he forms from
  the feet up; lightning strikes him in; ice glazes, shatters and cracks off a cocoon. ~3 s.
  After a long rest (`effects.knight` `restMin`–`restMax` minutes, rolled on each summons,
  3–5 by default) he burns away into the sign the same way and it relights. Reduced motion:
  he appears and goes at once.
- **Presence:** `fire.knights.presence` is `'away'` (the sign waits), `'arriving'`,
  `'resting'` or `'leaving'`; `onPresence(fn)` follows it. The page follows too
  (`knightChanged` in main.js): the scene's screen-reader description adds his sentence
  (`hero.sceneKnight`) while he's there and his sign's (`hero.sceneSign`) while he's away;
  the pack redraws its Knight item; a click on him greets him only while he rests.
- **A new helmet each summons** (`effects.knight.helmet` `random`, the default), unless the
  admin fixed one or the visitor picked one in the pack (that one, from then on).
- **The pack's Knight item** (*Summon & Tend*). While he's away it offers only **Summon**,
  and its helm icon's eye slit is dark (it kindles in steps as you reach for it; the item's
  `data-state`, set from `state()` in `bonfireItems`). While he rests: **Send Him Off**
  (he burns away into his sign), then **Gestures** (Praise the Sun, Wave, Bow, Point
  Forward, Beckon, Shrug, Hurrah, Joy and the **Default Dance**: he stands, dances two bars
  and sits back down; off under reduced motion, which the list says), **Helmet**, **Style**
  (the six, each saying what it looks like as its tooltip; the `gunmetal` style shows as
  *Smooth Steel*; a change burns him away and forms him again in it, ~1.2 s, the first
  build's model fetched first) and **Finish** (the steel's color; off for the styles with
  their own colors: "Black & Gold and First Build wear their own colors."). Forming or burning away, there's
  nothing to pick. A visitor's helmet, style and finish are remembered in this browser
  (`knightHelmet`, `knightStyle`, `knightFinish`) and put on him as the scene loads (not in
  the admin's preview, which shows the draft's settings).
- **Discoveries:** *Summoned the Knight* (the sign or the pack), *Greeted the Knight*, *A
  New Helm* and *A New Style* (a style or a finish). Where he can't come (no model,
  switched off, no WebGL) they leave the count. The Painter's own, *The Fire, Painted*, is
  found on `/painter/`.
- **The admin** (its Knight page): Show, Arrival (Summon Sign / There From
  the Start: resting from the first frame, staying until sent off), Shortest and Longest
  Rest, Helmet, Style, Armor Finish, Edge Glow, Armor Shine, Seat Pose (Resting /
  Watchful), Answers a Click, Reactions (docs/admin.md has the table). `applyArmor` and
  `applyKnight` in sceneKnight.js apply them as they change; the preview's **Knight…** menu
  summons him or sends him off (`nh:knight`).
- **The breakdown's** *Knight* row says where he is: away (his sign waits), or his helmet,
  style and what he's doing (forming, resting, burning away).

## The knight on the site (round 8)

The knight rests by the fire on every page once summoned (the scene side is "The knight"
above and `docs/knight.md`). On the site (`src/main.js`, `src/bonfire/scenePick.js`, `sceneKnight.js`):

- **Hover** (mouse and pen): his rim warms and he turns his head up to you. That's the
  scene's own effect (`hoverAt` returns `'knight'`, whichever of him and the fire is
  nearer); the page only turns the cursor into a pointer (`.stage[data-hover='knight']`).
  No label. The hover check also runs once more where the pointer comes to rest, so
  stopping on him always shows it. Only while a click greets him: otherwise the page asks
  `fire.hoverAt(x, y, { knight: false })`, which looks past him (no rim, no look, and the
  fire behind him flares as the fire).
- **Click (or tap) on him:** a greeting. He answers with a gesture: Praise the Sun the
  first time and most often after that (four times the others' chance), never the same
  one twice running (`greeting()` in `src/knightNames.js`). The click is his: it
  doesn't stoke the fire or draw a new weapon (a click while a weapon is being forged
  still hurries it, and one on the planted weapon still wakes it). The first greeting is
  a discovery, *Greeted the Knight*; a gesture from the pack counts too (the keyboard's
  way to it), but only one he really starts (not mid-swap). With
  `effects.knight.gestures` off, or reduced motion (he sits still), he isn't a click
  target: no hover, no pointer, and a click stokes as anywhere else.
- **The pack's Knight item** (round 9 added Summon, Send Him Off, the Style and Finish
  groups and the Default Dance, above; the helm icon: the great helm with its lit eye slit;
  on hover it swaps with the pointed bascinet): **Helmet** (Great Helm, Armet, Bascinet:
  hands to the helm, the old one burns away in ember edges, the new one forms in a flash
  and a puff of sparks, 1.6 s, with a shimmer sound as it forms) and **Gestures** (Praise
  the Sun, Wave, Bow, Point Forward, Beckon, Shrug, Hurrah, Joy). The gem marks the helmet
  he has on or is putting on. Nothing can be picked while he's away for a moment
  (forming, burning away); gestures are off for reduced motion, where a helmet change is
  instant. The
  first swap is a discovery, *A New Helm*. The pick is remembered in this browser
  (`knightHelmet`) and he wears it whenever he comes.
- **No knight** (his model didn't load, the admin has him off, or no WebGL): the page
  doesn't mention him. The pack leaves the Knight item out (`hasKnight` in
  `bonfireItems`), the scene's description drops his sentence, and *Greeted the Knight*
  and *A New Helm* leave the discoveries' count (unless found before; for reduced
  motion, *Greeted the Knight* is out too: `setOut` in `src/ui/discoveries.js`). All of
  it comes back if the admin turns him on again.
- **Settings** (`effects.knight`, the admin's Knight page; every key with
  its range and default is in [docs/admin.md](admin.md)'s knight table): `show`,
  `arrival` (`sign`: his summon sign waits and a click calls him; `start`: there from the
  start), `restMin` / `restMax` (how long he rests before he burns away, minutes),
  `helmet` (`random`: a new one each summons since round 9, or a fixed one), `style`
  (how he's drawn: one of the six styles, `knightStyles.js`), `finish` (his steel's color:
  gunmetal, blackened, polished, burnished; the styles that draw steel), `rim` (*Edge
  Glow*: how strongly his edges catch the fire's color), `seat` (`resting` or
  `watchful`), `gestures` (clicks get gestures), `reactions` (watching a weapon rise,
  flinching, leaning away from a stoke, lifting his feet for a ring), `shine` (*Armor
  Shine*: the fire's reflection sweeping over his plate, now and then and when the fire
  flares; sceneKnight.js `applyKnight` sets `armor.setShine`). The visitor's own picks (helmet,
  style, finish) win over the settings; a changed setting shows at once in the admin
  preview, and **Helmet…** / **Gesture…** there try them (`nh:helmet`, `nh:gesture`).
  Bonfire Live (`effects: true`) casts its own knights with its own Knights tab and
  ignores these, except `style`: its style *The Site’s Own* follows `effects.knight.style`.
- **The breakdown** has a *Knight* row (his helmet and what he's doing: resting,
  forming, burning away…), and its Normals and Lighting texts say what the armor does
  there (the knight's parts only while he's there). The scene's screen-reader
  description is `hero.sceneLabel` plus his sentence, `hero.sceneKnight`, while he's there
  (worded for any seat and either arrival: he may have been there from the start), or
  `hero.sceneSign` while his sign waits (`sceneLabel()` in `src/render.js`).
- **Render settings:** the dither and dither-pattern rows now step from the value on
  screen (the site's 0.08 goes to 0.16, 0.26, then off), not from a fixed first level.

`bonfireItems` (`src/ui/pack.js`) is shared with Bonfire Live: pass `onHelmet` (and
`onGesture`) to get the Knight item, `helmet` in `state()` (null while there's no
knight), and `hasKnight` to leave the item out while there's none at all. Since round 9:
`onSummon` / `onDismiss` with `presence` in `state()` give the summons and the send-off
(without `onSummon`, as in Bonfire Live, he's there whenever he has a helmet), and
`onStyle` / `onFinish` with `style` / `finish` in `state()` give his styles and finishes.
The display names are in `src/knightNames.js` (`HELMET_NAMES`, `GESTURE_NAMES`, and
`STYLE_NAMES` / `FINISH_NAMES` from knightStyles.js and steel.js), apart from the 3D code.

Since round 10: the Anvil offers `onLiving` (the *Living Weapon*, first), the weapons in
`WEAPON_GROUPS`; `elementTip` is what else a new element does on the page (the site's
"Also forges a new weapon."; Bonfire Live's recolors the weapon there, so it passes none).
An option's `tip` is its tooltip and a heading's `note` says why its group is off.
`optionsHtml()` draws a list (pure, tested), `isLong()` decides its two columns.

## Menus and tooltips (round 10)

- **The Menu button shows at every width** (Discoveries, How It's Made, Photo Mode and
  Render Settings had no way in on a desktop but their keys, and Discoveries none at all).
  The rest menu (`renderRestMenu` in `src/render.js`, `src/ui/restMenu.js`) has two
  labelled groups (`role="group"`, `aria-labelledby` its heading): **Go To**, the screens
  and the Résumé (hidden from 900 px up, where the header's tabs do it), and **Tools**:
  Photo Mode `F` · How It’s Made `B` · Render Settings `P` · Discoveries (found / total) ·
  Keyboard Shortcuts `?` · Sound, each saying what it does as its tooltip. Then Close.
  Focus starts on the first item that shows, and the arrows skip what's hidden
  (`listNav` in `src/ui/spatial.js`). A phone sees all of it without scrolling; on touch
  screens the key chips, the keys line and Keyboard Shortcuts go (a list of keys a phone
  has none of). On a window too short for it, the menu's insides scroll within its frame
  (`.rest-menu-scroll`; the frame's corners sit a pixel outside it). Discoveries opens with
  focus on Close but the list at its top, its title and count in sight. From 900 to
  1099 px the header's Sound is its icon alone (and its tooltip), so the tabs keep one
  line beside the Menu button.
- **Keyboard Shortcuts (`?`)**: the shared overlay (`createKeysOverlay`), with the site's
  keys from `src/ui/siteKeys.js` (Getting Around, Tools, Render Settings) and a filter.
  The page's keys ignore Shift (only `?` takes it), the breakdown's and photo mode's
  ignore typing and any open dialog (Esc closes the dialog, not the breakdown or photo
  mode: `?` opens over both), and P is listened for from the start.
- **Tooltips** are the shared one (`src/ui/tooltip.js`): no `title=` is left on the site.
  The Q / E keys, Sound, the pack's button, the menu's tools, the render settings' rows
  and close button, the photo toolbar, the project viewer's arrows and thumbnails, and the
  pack's options that need a word carry `data-tip` (beside a list's item, not over the one
  before: `--tip-side` in `styles.css`). A skill's slot shows its name over its flavor
  (`data-tip-title`, `data-tip`; the flavor is its description for screen readers, and a
  tap opens it too, `data-tip-tap`); the old hand-placed skill tooltip is gone. The tip
  itself is aria-hidden, so every hint is its trigger's description as well
  (`aria-describedby`, a hidden span beside it: `src/ui/describedTip.js`), unless it only
  says the trigger's name and key (Q / E, the pack's button, the render settings' close,
  which say their keys with `aria-keyshortcuts`).
- **Photo mode on a touch screen** says "Drag to orbit · Pinch to zoom · Tap to stoke",
  and a pinch zooms (two fingers, at the wheel's own rate). Its Element button names the
  elements as the pack does (the content's names: Flame, Lightning, Frost).
- **Render Settings' reset** sits apart from the groups (a rule above it): it puts back
  every group, not just the last.
- **Words** follow the round's casing: Title Case for labels, headings and options (the
  menus, the pack's headings, the render rows, the breakdown's views and counts, the
  discoveries' names), sentences for tooltips. The content's `ui` texts were recased
  (`Photo Mode`, `How It’s Made`, `Render Settings`, `Reset Render Settings`, `Elements`,
  `Flame Colors`, `Helmet`, `Style`, `Finish`…), and the pack's group headings can't be
  left blank (`UI_HEADINGS` in `src/contentRules.js`).
- **Tests:** `test/pack.test.mjs` (the groups, the Living Weapon in the Anvil, every weapon
  in one group, headings read out, why an option is off), `test/renderMenu.test.mjs`
  (groups, keys, the shared pixel sizes), `test/site.test.mjs` (the menu's groups, no
  `title=`, the skills' tips, `withMeta` on the real and a Prettier-wrapped `index.html`),
  `test/discoveries.test.mjs`; in the browser `e2e/site-menus.spec.mjs` and
  `e2e/tips-site.spec.mjs` (every tip at 1280×720 and on a 390×844 touch screen: shown by
  hover, focus or tap, 8 px inside the window, off its trigger, and heard: a description
  or its trigger's name). `test/site.test.mjs` checks every tip in the templates, the
  photo toolbar, the render rows and the pack's lists is read out too.
