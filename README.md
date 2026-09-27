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
npm run admin      # the admin panel, editing your local files: http://127.0.0.1:5175
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

## Roadmap & decisions

- **Hosting (live):** GitHub Pages via `.github/workflows/deploy.yml`, which builds on every
  push to `main`. The custom domain is `nhoang.dev` (`public/CNAME`); Porkbun DNS has four
  apex `A` records to GitHub Pages and a `www` `CNAME` to `iNanzo.github.io`, with HTTPS
  enforced.
- **Admin panel (built):** see [Admin panel](#admin-panel). It's a Cloudflare Worker
  behind Cloudflare Access (Google sign-in, limited to an allowlist of Gmail accounts),
  committing to this repo with a short-lived GitHub App token. Git stays the content
  database and the audit trail, and every save redeploys.
- **Inventory categories (planned):** a `category` on each item (Code, Photography, Art,
  Music), with tabs over the inventory grid.
- **Adaptive quality (planned):** quality tiers currently key off `pointer: coarse`. Add a
  frame-time monitor that drops slow, mouse-driven machines to the touch tier.

## Editing content

All text lives in **`src/content.json`**: screens, hero copy, projects (`featured`,
`projects`, `archive`), experience, skills, contact and the 404 page. The easy way to
edit it is the [admin panel](#admin-panel); editing the file by hand works too.
`src/content.js` re-exports it for the site (field notes are there), and
`src/contentRules.js` defines what a valid edit is. Entries with a `todo` note need
confirming before you publish.

- **Add a project:** add an object to `projects`. Put its images in
  `public/assets/projects/<id>/` as `name.webp` (full size) and `name-card.webp` (~720px),
  then list them in `images` (the first is the inventory icon). The admin panel does all
  of this for you, converting uploads. To pull more captures from the old portfolio, add
  lines to `tools/import-screenshots.mjs` and run `npm run screenshots`.
- **Hide something without deleting it:** add `hidden: true` to the entry (any project,
  archive item, experience org or role, leadership item, education row, skill group or
  skill, or contact link).
- **Reorder:** move the entry within its list; the site shows everything in file order.
- **Resume link:** drop a PDF in `public/` and set `site.resumeUrl`.
- **"Embers Kindled" banner:** edit `hero.kindled`:
  - `title` and `subtitle`
  - `show`: `'first'` (first stoke of a visit), `'always'` or `'never'`
  - `duration`: milliseconds on screen, fades included

  Its look is the "Checkpoint beat" block in `src/styles.css`. Open the site with
  `?kindled` (e.g. `http://localhost:5173/?kindled`) to hold the banner on screen while
  you edit it; click it or press Esc to dismiss.
- **Weapons:** display names are in `weapons` (the list itself is fixed by the 3D model).

## Admin panel

A form-based editor for everything in `src/content.json`, at `/admin`.

**What it does**

- **Text:** every section: projects, home, about, journey, skills, contact, screen
  headings and interface text.
- **Projects:**
  - Add, edit or delete projects. **Move To…** on any project card moves it between
    Featured, Projects and Earlier Explorations (moving one into Featured swaps the old
    flagship out; moving the flagship out promotes the first visible project).
  - Upload images. They're converted to WebP in the browser (full size up to 1600 px, a
    720 px card, and small captures doubled with nearest-neighbor, like
    `tools/import-screenshots.mjs`). Reorder them (the first *visible* one is the
    inventory icon), hide one with ◉ (kept in the repo, off the site), and set alt text,
    caption and pixel art.
- **Effects** (the Look & Feel page), with a **live preview** of the real site beside it:
  - Bonfire colors (the palettes every element burns in, stored as `effects.flames`):
    add, edit, reorder or delete them; ◉ takes one out of the random draw. Each
    palette's `hi` must stay readable as text (≥ 4.5:1), and at least 3 stay in rotation.
  - **Palette tools** (`admin/ui/palettes.js`): 🎲 a harmonious palette for one flame
    (any scheme, or one you pick: hue shift, analogous, monochrome, complementary, split
    complementary, triadic), a fully random one, or **suggestions built around a color**
    you pick (or one of the flame's own). There's also a set for every flame at once,
    with hues spread around the wheel, and the same tools for the scene colors. Each one
    has Undo. The harmonies work in OKLCH. Each ramp step has its own lightness band,
    chroma is a share of what the gamut allows at that hue, and hues come from the
    scheme. Tips are lightened until they read as text.
  - Elements: each one's name on the site, whether it's in rotation and its relative
    chance (with its share of the draws). **Try It** forges it in the preview.
  - Lightning (ball size and height, filaments, ground strikes, bolt thickness, jaggedness, forking, crackle rate,
    drift, brightness, reach for the cursor, light strobe, ring speed and arcs) and Ice
    (crystals, height, spread, thickness, translucency, glow, shimmer, fire inside,
    frost, freeze time, ring speed, shard height and hold).
  - Fire (intensity, size, height, turbulence, flame life, cast light, frame rate, stoke
    flare), fireflies (count, lit at rest, real lights, speed), the cursor effect and its
    strength, particle counts (plus the touch-device scale), rendering (pixel size,
    dither, outlines, vignette, exposure, color-change time, screen shake) and the scene's
    base colors. Every section has **Reset to Defaults**.
  - The preview updates as you drag. "Forge It" on a flame, **Stoke** and **Random
    Swap** play the effects. Nothing reaches visitors until you save.
- **Hide / show** any entry (◉), and **reorder** any list by dragging ⋮⋮ or with ↑/↓.
- **Rename** any sidebar page or section heading with ✎ (empty resets it). Renames are
  stored in `content.admin.labels`, which the site ignores.
- **Live checks:** each field is checked as you type against `src/contentRules.js`: unsafe
  links, bad ids, missing alt text, glyphs that won't fit and so on. Save is refused
  until they're fixed; the sidebar counts problems per page.
- **One save = one commit:** content plus new images, and images nothing uses anymore
  are removed. The commit message summarizes the edit. The panel then follows the
  GitHub Pages deploy until it reports **Live on the site** (about a minute).
- **Safety nets:**
  - Unsaved edits survive a closed tab: they're kept in this browser, and the panel
    offers them back.
  - If the content changed elsewhere since you opened it, it asks before overwriting.
  - Ctrl/⌘+S saves.

**How it's built** (`admin/`)

| Piece | File |
| --- | --- |
| The page (vanilla JS, same palette as the site) | `admin/ui/` (`main.js` app, `form.js` generic editor, `schema.js` labels/help/grouping, `images.js` WebP conversion, `preview.js` live preview, `text.js` Title Case, `palettes.js` palette generators, `paletteTools.js` their buttons) |
| Effects defaults, ranges, runtime | `src/effectsDefaults.js`, `src/effects.js`, `src/elements.js` (design notes: `docs/admin-v2.md`, `docs/elements.md`) |
| API: session, content, save, deploy status, image thumbnails | `admin/server/api.js` |
| Sign-in check (Cloudflare Access JWT) | `admin/server/auth.js` |
| Content store on GitHub (one commit per save, Git Data API) | `admin/server/github.js` |
| Content store on disk (local mode) | `admin/server/fsStore.js` |
| Worker entry + security headers | `admin/worker.js`, `admin/wrangler.toml` |
| Local server + build | `admin/vite.config.js` |
| Tests (sign-in, GitHub store, API) | `admin/test/` (`npm run admin:test`) |

The editor is generic: it renders whatever is in `content.json`, so a new field shows
up without code. `admin/ui/schema.js` only adds labels, help text and grouping.

**Security**

- **At the edge:** Cloudflare Access turns away everyone but your allowlisted Google
  accounts before a request reaches the Worker.
- **In the Worker:** it still verifies every request, the page included (Access
  signature, team, audience, expiry, email allowlist), so a misconfigured policy
  doesn't open it up.
- **GitHub:** the GitHub App token is minted per hour, limited to this repo (contents
  write, actions read), and never reaches the browser.
- **Requests:** saves must be same-origin JSON.
- **Every save is re-checked server-side:** content rules, WebP-only uploads, image paths
  locked to `public/assets/projects/<id>/`, and no path traversal.
- **Page hardening:** it ships a strict CSP and can't be framed.

**Use it locally (no setup)**

```bash
npm run admin        # http://127.0.0.1:5175
```

Local mode edits your working copy directly. Nothing is committed or deployed; commit
and push yourself. It has no sign-in, so it only listens on 127.0.0.1. Run `npm run
dev` alongside it to see changes live; the Effects preview loads that dev site
(`http://localhost:5173/`, or set `ADMIN_SITE_URL`).

The deployed admin's preview frames `SITE_URL` (its CSP allows only that origin), so it
shows the effects editor's changes once this version of the site is deployed. The site
only accepts preview messages when opened as `?preview` inside a frame, from its parent,
and validates them first; nothing is stored.

**Put it online (one-time setup)**

1. **GitHub App**
   - Go to GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.
   - Name it (e.g. `nhoang-admin`), set the homepage to `https://nhoang.dev`, and
     untick Webhook → Active.
   - Repository permissions: **Contents: Read and write** and **Actions: Read-only**.
     Choose "Only on this account", then create it.
   - Note the **App ID** and **Generate a private key** (it downloads a `.pem`).
   - **Install App** → Only select repositories → `Bonfire_Portfolio`. The number at
     the end of the installation page's URL is the **installation id**.
2. **Deploy the Worker:** run `npx wrangler login`, then `npm run admin:deploy`. This
   creates `https://nhoang-admin.<your-subdomain>.workers.dev`.
3. **Cloudflare Access** (free Zero Trust plan):
   - Zero Trust → Integrations → Identity providers → add **Google** as a login method.
     Google requires an OAuth client: in Google Cloud, create a project, configure
     Google Auth Platform with an **External** audience for personal Gmail accounts,
     and create a **Web application** client. Set its authorized redirect URI to
     `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback` (copy the exact
     callback shown by Cloudflare). Store the client ID and client secret in the
     Cloudflare Google login configuration, never in the repository. If the OAuth
     app is in **Testing**, add both permitted accounts under Audience → Test users.
   - Protect the Worker's hostname: Workers → `nhoang-admin` → Settings → Domains &
     Routes → workers.dev → **Enable Cloudflare Access**. Or add a self-hosted Access
     application for that hostname.
   - Set its policy to **Allow**, Include **Emails**: your Gmail addresses.
   - Copy the application's **Audience (AUD) tag** and your **team domain**
     (`https://<team>.cloudflareaccess.com`) into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`
     in `admin/wrangler.toml`.
4. **Secrets** (stored in Cloudflare, never in the repo):
   ```bash
   npx wrangler secret put ALLOWED_EMAILS --config admin/wrangler.toml          # you@gmail.com,other@gmail.com
   npx wrangler secret put GITHUB_APP_ID --config admin/wrangler.toml
   npx wrangler secret put GITHUB_APP_INSTALLATION_ID --config admin/wrangler.toml
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY --config admin/wrangler.toml < path/to/key.pem
   ```
   A fine-grained token for this repo (Contents read/write, Actions read) set as
   `GITHUB_TOKEN` also works instead of the app, but a leaked token lives longer.
5. Run `npm run admin:deploy` again. Then set the Worker's URL in the `admin-url` meta
   tag of `public/admin/index.html`, so `nhoang.dev/admin` forwards to it. If you ever
   move `nhoang.dev`'s DNS to Cloudflare, you can route the Worker at
   `nhoang.dev/admin*` directly instead.

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
| Web model (Draco-compressed) | `public/models/bonfire.glb` |
| Scene, lights, passes, camera, interaction | `src/bonfire/scene.js` |
| Camera points of view per screen | `src/bonfire/povs.js` |
| Curl-noise particle fire, sparks | `src/bonfire/flame.js` |
| Shared curl-noise field (bonfire, ring of fire, forge particles) | `src/bonfire/curl.js` |
| Cursor → fire interaction models | `src/bonfire/interaction.js` |
| Fireflies (navigation, landing, lit rotation, halos, lights) | `src/bonfire/fireflies.js` |
| Height map of the clearing (firefly steering, collision, wall spots) | `src/bonfire/terrain.js` |
| Impact effects: ring of fire, shock ring, smoke ring, smoke, ash, embers, collision splashes | `src/bonfire/impact.js` |
| Weapon swap (rise + dissolve → swirl → gather → ripple-form → glow → strike) + rim light | `src/bonfire/weapons.js` |
| Particle shader: size by distance, dithered `alpha`, manual depth test | `src/bonfire/flame.js` |
| Line material for the shock ring and forge lines (dithered, depth-tested) + ring noise | `src/bonfire/rings.js` |
| Forge lines: double helix, weapon silhouette tracing + echo burst | `src/bonfire/forgeFx.js` |
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
