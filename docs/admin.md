# Editing content and the admin panel

How to change what the site says and shows, by hand or in the admin panel. The admin's
design decisions are in [admin-v2.md](admin-v2.md).

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
  - **Palette tools** (`src/paletteGen.js`, shared with the visualizer): 🎲 a harmonious palette for one flame
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
| The page (vanilla JS, same palette as the site) | `admin/ui/` (`main.js` app, `form.js` generic editor, `schema.js` labels/help/grouping, `images.js` WebP conversion, `preview.js` live preview, `text.js` Title Case, `paletteTools.js` the palette buttons; the generators are `src/paletteGen.js`) |
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
5. **Deploys on merge:** in Cloudflare → My Profile → API Tokens → **Create Token**, use
   the **Edit Cloudflare Workers** template, limited to this account. In GitHub → the
   repo → Settings → Secrets and variables → Actions, add it as `CLOUDFLARE_API_TOKEN`.
   From then on every push to `main` that passes the checks redeploys the Worker
   alongside the site (`deploy.yml`, job `admin`). Without the secret that job skips
   with a warning. `npm run admin:deploy` still deploys by hand.
6. Run `npm run admin:deploy` again. Then set the Worker's URL in the `admin-url` meta
   tag of `public/admin/index.html`, so `nhoang.dev/admin` forwards to it. If you ever
   move `nhoang.dev`'s DNS to Cloudflare, you can route the Worker at
   `nhoang.dev/admin*` directly instead.
