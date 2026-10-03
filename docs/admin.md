# Editing content and the admin panel

How to change what the site says and shows, by hand or in the admin panel. The admin's
design decisions are in [design/admin-v2.md](design/admin-v2.md).

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
  headings and interface text (the pack's labels too, `ui.pack*`).
- **Projects:**
  - Add, edit or delete projects. **Move To…** on any project card moves it between
    Featured, Projects and Earlier Explorations (moving one into Featured swaps the old
    flagship out; moving the flagship out promotes the first visible project).
  - Upload images. They're converted to WebP in the browser (full size up to 1600 px, a
    720 px card, and small captures doubled with nearest-neighbor, like
    `tools/import-screenshots.mjs`). Reorder them (the first *visible* one is the
    inventory icon), hide one with ◉ (kept in the repo, off the site), and set alt text,
    caption and pixel art.
- **Look & Feel:** the site's effects (`effects` in `content.json`) on four pages, each
  with a **live preview** of the real site beside it (above it on narrower screens). The
  old address `#effects` opens Colors.
  - **Colors.** **Flame Colors** (the palettes every element burns in, stored as
    `effects.flames`): add, edit, reorder or delete them; ◉ takes one out of the random
    draw. Each palette's `hi` must stay readable as text (≥ 4.5:1), and at least 3 stay
    in rotation. **Place Colors** (`effects.colors`): the neutrals every frame is built
    from (void, shadow, stone, wood, bone).
    - **Palette tools** (`src/paletteGen.js`, shared with the visualizer): 🎲 a harmonious
      palette for one flame (any scheme, or one you pick: hue shift, analogous,
      monochrome, complementary, split complementary, triadic), a fully random one, or
      **suggestions built around a color** you pick (or one of the flame's own). There's
      also a set for every flame at once, with hues spread around the wheel, and the same
      tools for the place colors. Each one has Undo. The harmonies work in OKLCH. Each
      ramp step has its own lightness band, chroma is a share of what the gamut allows at
      that hue, and hues come from the scheme. Tips are lightened until they read as text.
  - **Fire & Elements.** Fire (brightness, size, rise speed, turbulence, flame life,
    Firelight, Flame Frame Rate, stoke flare); Elements (each one's name on the site,
    whether it's in rotation and its relative chance, with its share of the draws; **Try
    It** forges it in the preview); Lightning (ball size and height, filaments, ground
    strikes, bolt thickness, jaggedness, forking, crackle rate, drift, brightness, reach
    for the cursor, light strobe, ring speed and arcs); Ice (crystals, height, spread,
    thickness, translucency, glow, shimmer, fire inside, frost, freeze time, ring speed,
    shard height and hold); and Particles (counts, plus the touch-device scale).
  - **Picture.** **Pixel Art** (`effects.render`: Pixel Size and Pixel Size On Phones,
    picked from the sizes the menus offer, 2/3/4/6/8 px; Dither, Dither Pattern,
    Outlines; then Vignette and Exposure under Place & Atmosphere, Color Blend Time under
    Color Change, Screen Shake under Camera), **Hits** (`effects.impact`: Hit-Stop, Hit Flash,
    Debris, Ground Marks and the rest), Fireflies (how many, lit at rest, real lights,
    speed) and the Cursor effect and its strength.
  - **Knight** (`effects.knight`). He isn't there when a page opens: his summon sign
    (the NH monogram) glows on the ground by his seat, and a click on it or **Summon** in
    the pack calls him. He forms out of the sign in the fire's element, rests, then burns
    away into it again. The settings, in the order the page shows them (under Knight,
    Armor and Behavior):

    | Setting | Key | What it does |
    | --- | --- | --- |
    | Show the Knight | `show` | Off: no knight and no sign. The pack has no Knight item, and the scene description never mentions him. |
    | Arrival | `arrival` | **Summon Sign** (`sign`, the default): he waits to be summoned and leaves after his rest. **There From the Start** (`start`): he rests there from the first frame and stays until a visitor sends him off. |
    | Shortest Rest / Longest Rest | `restMin` / `restMax` | Minutes he rests before he burns away (1–30; each summons rolls between the two; default 3–5). |
    | Seat Pose | `seat` | **Resting** (slumped; on the ground in the ruins, one knee drawn up with an arm hung over it and the other leg stretched out) or **Watchful** (leaning in over his knees, forearms on them, head up at the fire; on the ground, sitting up with both knees drawn up). |
    | Helmet | `helmet` | **Random Each Summon** (a new one each time he comes), or the Great Helm, Armet or Bascinet. |
    | Style | `style` | How he's drawn (`src/bonfire/knightStyles.js`): Pixel Cel (the default), Pixel Painterly, Pixel Chiaroscuro, Smooth Steel (key `gunmetal`), Black & Gold, First Build. A change burns him away and forms him again in it. |
    | Finish | `finish` | His steel's color (`src/bonfire/steel.js`): Gunmetal, Blackened, Polished Steel or Burnished. Only for the styles that draw steel (all but Black & Gold and First Build). |
    | Edge Glow Strength | `rim` | 0–1: how strongly his edges catch the fire's color. |
    | Armor Shine | `shine` | The fire's reflection sweeping over his plate, now and then and when the fire flares. |
    | Gestures On Click | `gestures` | While he rests, a click on him gets a gesture back. |
    | Reactions | `reactions` | He watches a weapon rise, flinches, leans away from a stoke and lifts his feet for a ring. |

    Visitors can summon him, send him off and change his helmet, style and finish from the
    pack. Their picks are kept in their browser and win over these settings there; the
    preview always shows the draft's. Changing a setting here shows at once in the
    preview. The Home page's scene description (`hero.sceneLabel`) follows him: it adds
    his sentence (`hero.sceneKnight`) while he's there, his sign's (`hero.sceneSign`,
    optional) while he's away, and nothing where he can't come. Bonfire Live keeps knight
    settings of its own.
  - The preview updates as you drag. "Forge It" on a flame, **Stoke**, **Random Swap**
    and **Wake the Blade** play the effects. **Knight…** summons the knight or sends him
    off (his arrival and leaving in the fire's current element). **Helmet…** puts a helmet
    on him (the full swap, not saved) and **Gesture…** asks him for one. The messages are
    `nh:knight` (`do`: `summon` | `dismiss`), `nh:helmet` and `nh:gesture`. Nothing
    reaches visitors until you save.
  - **Reset Section** on each effects section puts it back to the site's defaults
    (`src/effectsDefaults.js`) at once, with **Undo** in the note that follows (Discard
    still brings back your saved values until you save). The focus goes to that Undo, and
    the note waits while it has the focus or the pointer; Undo, or Esc, brings the focus
    back to Reset Section. On Flame Colors it gives the
    built-in palettes their colors, names and rotation back (bringing back any you deleted)
    and keeps the palettes you made, unchanged, after them. Only the effects have Reset:
    the other pages have no defaults to go back to.
- **Scenes** (the Look & Feel page after Knight): Bonfire Live's built-in preset scenes
  (`content.json` `scenes`; the format is `src/scenes.js`), in the order it loops through
  them. They're made in the Bonfire Painter (`/painter/`), so a scene's card doesn't list
  its ~80 settings as fields. The site ships four: Cathedral Kaleidoscope, Frozen Shrine,
  Forge Rave and Moonlit Ruins (docs/bonfire-live.md has what each is).
  - **The card:** its colors as swatches (the flame's ramp, then its own scenery colors)
    and a one-line summary. Opened, it lists what the scene holds part by part (place,
    camera, look, drops, knights, fireflies, render). Its **Name**, **ID** and **With the
    Music** are fields. Keep a published scene's id: visitors' saved loops and `?scene=b:<id>`
    links use it.
  - **◉ Take Out of the Loop / Put Back in the Loop:** the scene stays in the list, marked
    **Out of the Loop** (`hidden: true`). Reorder by dragging ⋮⋮ or with ↑/↓.
  - **Open in Painter ↗** opens the scene in the Painter as it is here, saved or not (it
    rides in the link: `painter/#scene=<base64url JSON>`). **Copy JSON** copies it.
    **Replace From Painter…** puts the Painter's version in its place (a file, or pasted
    JSON), keeping its id and its place in the loop.
  - **The Painter** row above the list: **Import From Painter…** (a `bonfire-scenes.json`
    the Painter exported, or pasted JSON; a scene whose id is already here replaces that
    one if you confirm, else comes in as a copy with a new id), **Open the Painter ↗** and
    **Export All** (every scene here as `bonfire-scenes.json`, for the Painter's Import).
  - **Checks:** every scene is validated in full (`validateScenes`). The section is
    optional, holds up to 48 scenes, and ids must be unique. A problem deep inside a scene
    is listed on its card with where it is (`look.name: …`). The commit message says
    "edit scenes". There's no live preview for scenes; **Open in Painter** is the preview.
- **Hide / show** any entry (◉), and **reorder** any list by dragging ⋮⋮ or with ↑/↓.
- **Rename** any sidebar page or section heading with ✎ (empty resets it). Renames are
  stored in `content.admin.labels`, which the site ignores. Help that names another
  page or section ("Interface › Starting Equipment") follows the rename.
- **Search** (`admin/ui/search.js`): **Ctrl/⌘+K** or **/** opens the box at the top of
  the sidebar. It finds any field on any page by its label, its help, its search words
  (the shared settings use Bonfire Live's, from `src/settingsMap.js`), a dropdown's
  choices, a list entry's title (a project's or a flame's name) and the words in a short
  text field ("Fast Travel" finds the pack's Map action). Each result shows "Page › Group
  › Field" and a line of its help, what matched marked. ↑/↓ choose, **Enter** goes there:
  the cards on the way open, the page changes, the field scrolls into view below the
  sticky bars, takes the focus and glows for a moment. **Esc** clears the box, then closes
  it. A field that needs fixing is gone to the same way when Save refuses.
- **Names and help:** labels are in Title Case; the settings the site shares with Bonfire
  Live and the Painter carry the same names there (Flame Frame Rate, Firelight, Edge Glow
  Strength, Gestures On Click…). Each field's help sits under it, a sentence or two, and
  is what its input reads out to a screen reader; anything longer folds under **More**.
  Big sections are split under sub-headings: Interface Text into Header & Menu, Inventory
  & Projects, About, Render Settings, Pack and Key Prompts; Pixel Art; the Knight. A
  project's image fields (Alt Text, Caption, Pixel Art, Video Clip) and the featured
  project's fields go by the same names as any project's, on the page and in the search.
  Icon buttons
  and tools explain themselves in the shared tooltip (hover, or focus with the keyboard).
- **Live checks:** each field is checked as you type against `src/contentRules.js`: unsafe
  links, bad ids, missing alt text, glyphs that won't fit and so on. Save is refused
  until they're fixed; the sidebar counts problems per page.
- **One save = one commit:** content plus new images, and images nothing uses anymore
  are removed. The commit message summarizes the edit. The panel then follows the
  GitHub Pages deploy until it reports **Live on the site**. That takes about 13–15
  minutes: the deploy waits for the whole CI run (the build, five browser-test shards,
  then the deploy). It checks every 15 s for the first 5 minutes, then every 30 s; if
  the run still hasn't finished after 45 minutes it stops and says **Still deploying —
  check progress**, with a link to the run (`admin/ui/deployFollow.js`).
- **Safety nets:**
  - Unsaved edits survive a closed tab: they're kept in this browser, and the panel
    offers them back.
  - If the content changed elsewhere since you opened it, it asks before overwriting.
  - Ctrl/⌘+S saves.

**How it's built** (`admin/`)

| Piece | File |
| --- | --- |
| The page (vanilla JS, same palette as the site) | `admin/ui/` (`main.js` app, `form.js` generic editor, `el.js` its DOM builder, `paths.js` content paths, `schema.js` pages, labels, help, sub-groups, `search.js` the search, `reset.js` Reset, `deployFollow.js` how often it checks on a deploy, `images.js` WebP conversion, `preview.js` live preview, `text.js` Title Case, `paletteTools.js` the palette buttons (the generators are `src/paletteGen.js`), `sceneTools.js` the Scenes page's cards and Painter tools) |
| Effects defaults, ranges, runtime | `src/effectsDefaults.js`, `src/effects.js`, `src/elements.js` (design notes: `docs/design/admin-v2.md`, `docs/elements.md`) |
| The scene format (Painter, Bonfire Live, the Scenes page) | `src/scenes.js` (design notes: `docs/painter.md`, `docs/design/visualizer.md`) |
| API: session, content, save, deploy status, image thumbnails | `admin/server/api.js` |
| Sign-in check (Cloudflare Access JWT) | `admin/server/auth.js` |
| Content store on GitHub (one commit per save, Git Data API) | `admin/server/github.js` |
| Content store on disk (local mode) | `admin/server/fsStore.js` |
| Worker entry | `admin/worker.js`, `admin/wrangler.toml` |
| Security headers (the Worker's and `admin:preview`'s) | `admin/server/csp.js` |
| Local server + build | `admin/vite.config.js` |
| Tests (sign-in, GitHub store, API, effects, palettes, scenes, schema, search, the policy) | `admin/test/` (`npm run admin:test`); in a browser, `e2e/admin.spec.mjs` |

The editor is generic: it renders whatever is in `content.json`, so a new field shows
up without code. `admin/ui/schema.js` only adds labels, help text and grouping. The
exceptions are the cards that draw their own body: scenes (`sceneTools.js`).

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
- **Page hardening:** it ships a strict CSP (`admin/server/csp.js`) and can't be framed.
  The policy refuses inline styles, a `style=""` set by script included, so the page
  sets styles through the style object (`el()` takes `style` as an object) and keeps
  its fonts as files. Try it locally with `npm run admin:preview`.

**Use it locally (no setup)**

```bash
npm run admin        # http://127.0.0.1:5175
```

Local mode edits your working copy directly. Nothing is committed or deployed; commit
and push yourself. It has no sign-in, so it only listens on 127.0.0.1. Run `npm run
dev` alongside it to see changes live; the Look & Feel pages' preview loads that dev
site (`http://localhost:5173/`, or set `ADMIN_SITE_URL`).

```bash
npm run admin:preview   # the built admin under its production security headers, same API
```

`admin:preview` builds the admin and serves it the way the Worker does, with the
Content Security Policy and the other security headers, so anything the policy would
block shows up before a deploy (in the console). `ADMIN_READONLY=1` makes its API refuse
saves; the end-to-end tests (`e2e/admin.spec.mjs`) run it that way.

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
