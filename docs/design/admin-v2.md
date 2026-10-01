# Admin v2 — design doc

Status: **implemented and verified locally** (2026-09-25; see the checklist at the end).
Source of the requirements: Newton's request, re-pasted 2026-09-25 after the first pass
missed the effects editor.

## Requirements

| # | Ask | Where it lands |
| --- | --- | --- |
| R1 | Better admin UX/UI overall | [UX pass](#ux-pass) |
| R2 | Titles in Title Case (every word except articles capitalized) | `titleCase()` on every label, heading and nav item |
| R3 | Admin menu items / titles editable | Rename (✎) on page and section titles, saved in `content.admin.labels` |
| R4 | Featured Project starts collapsed | Featured is a normal collapsible card, closed by default |
| R5 | Move projects to any category | "Move to…" menu on every project card: Featured / Projects / Earlier Explorations |
| R6 | Hide option on project images | ◉ toggle per image → `images[].hidden`; the site skips hidden images |
| R7 | Editor for "everything on the page": cursor effect, rendering, particles, dithering, fireflies (count / lit / lights), flame intensity and size | New **Effects** page, backed by `content.effects` |
| R8 | Add and modify flame colors / palettes | `effects.flames` is an editable list (add, reorder, hide from rotation, delete); scene base colors editable too |
| R9 | "Admin tab that appears on the site when the admin is logged in" | Answered below: a **live preview** of the real site inside the admin, updated as you drag |

## Key decisions

### D1. Effects live in `content.json` as a new `effects` section

Alternatives: a separate `src/effects.json`, or keep constants in code.

- One file keeps saves atomic: one version (blob sha), one conflict check, one commit, one
  deploy. A second file would need a combined version and two-file conflict handling in
  `admin/server/api.js`, `github.js` and `fsStore.js` for no user-visible gain.
- The generic editor renders any section, so most of the Effects page is free; only sliders
  and color pickers are new controls.
- `src/effects.js` merges the saved values over `DEFAULT_EFFECTS`, so a missing key (older
  content, hand edits) falls back to today's look instead of breaking the scene.

### D2. Flames become data

`src/palette.js` no longer hard-codes the ten flames. It builds `flames` (same shape as before:
`{ [id]: { name, ramp: [lo, mid, hi, core], shade, light, hidden } }`) from `effects.flames`,
and **mutates that same object in place** when the preview sends new values, so every module
that imported `flames` sees the change without re-importing.

- `hidden: true` on a flame = *out of rotation*: never drawn at random, but still valid as
  the starting flame. Reuses the hide convention used everywhere else.
- `startingEquipment.flame` validates against the draft's flame ids (not a fixed list), and the
  admin's select lists them live.
- Palette budget: the pixel pass quantizes to ≤16 colors = 5 base + (4 ramp + shade) for the
  current flame + the same for the flame being forged = 15. So base colors are editable but
  their count is fixed at 5.

### D3. Validation (in `src/contentRules.js`, enforced in the browser and on save)

- Colors: `#rrggbb`.
- Numbers: each has a range (the same table drives the sliders, so the UI can't produce a
  value the server refuses).
- Flame ids: slug, unique. At least **3 flames in rotation** — a random draw excludes the
  current *and* the starting flame, so with fewer it would have nothing to pick.
- Legibility: every flame's `hi` must be ≥ 4.5:1 contrast on the `void` color (it's used for
  UI text) — the rule the README already states, now enforced.
- The starting flame must exist.

### D4. The "admin tab on the live site" → live preview in the admin (R9)

The site is on GitHub Pages (`nhoang.dev`), the admin on a Cloudflare Worker
(`*.workers.dev`) behind Cloudflare Access. Different origins: the site cannot see the admin's
sign-in cookie, and adding auth to a static site means a second auth system. And even if it
could, an overlay on the site would still need the admin's save pipeline to persist anything.

So the tab moves the other way: **the Effects page embeds the real site** in a preview pane and
streams the draft into it.

- Admin → site: `postMessage({ type: 'nh:effects', effects })` on every edit (throttled to a
  frame), plus `nh:flame` (forge a specific flame — plays the full swap animation), `nh:stoke`
  and `nh:roll` (random swap, to watch the impact effects).
- The site only listens when opened as `?preview` **inside a frame**, only accepts messages from
  its parent window, and runs every payload through `validateEffects` before applying it. The
  worst a hostile framer could do is recolor *its own* embedded copy — no persistence, no
  data. Nothing is saved until you press Save in the admin.
- Live vs rebuild: colors, fire behavior, render settings, cursor, lit-firefly count and the
  color-change speed apply instantly. Particle and firefly *counts* and light pools size GPU
  buffers, so changing them rebuilds the scene (the model is cached; ~½ s).
- The Worker's CSP gains `frame-src <SITE_URL origin>`. Locally the pane loads
  `http://localhost:5173/` (override with `ADMIN_SITE_URL`).
- Caveat: the deployed admin previews the *deployed* site code, so the pane works once this
  change is live on nhoang.dev.

### D5. Admin label overrides (R3)

`content.admin.labels` — `{ [key]: "Custom Name" }` where key is `page:<id>` for sidebar items
or a section key (`featured`, `effects.flames`, …) for headings. Optional; the site ignores it.
Stored in content so renames sync across both allowed accounts and show in Git history. Empty =
back to the default. (The *site's* own menu labels were already editable under
Interface → Screens.)

## Effects schema

Defaults are today's hard-coded values (`src/effectsDefaults.js`). "Touch" = `pointer: coarse`
devices, which get scaled-down counts.

```jsonc
"effects": {
  "colors":    { "void", "shadow", "stone", "wood", "bone" },            // scene base palette
  "flames": [ { "id", "name", "lo", "mid", "hi", "core", "shade", "light", "hidden"? } ],
  "fire": {
    "brightness": 0.3,  "size": 0.27, "height": 0.62,                   // intensity, radius, rise
    "turbulence": 0.42, "swirl": 2.6,                                   // curl amplitude, frequency
    "lifeMin": 0.55, "lifeMax": 1.25,                                   // seconds
    "glow": 9,          "fps": 12,                                      // cast light, stepped sim rate
    "stoke": 0.9                                                        // flare per click
  },
  "particles": { "fire": 2200, "sparks": 48, "forge": 640, "impact": 1, "touchScale": 0.5 },
  "fireflies": { "count": 18, "lit": 9, "lights": 9, "speed": 1, "touchScale": 0.67 },
  "cursor":    { "mode": "ember", "strength": 1 },
  "render": {
    "pixelSize": 4, "pixelSizeSmall": 3, "dither": 0.16, "ditherMatrix": 4,
    "outlines": true, "vignette": 0.85, "exposure": 1, "colorChange": 1.25, "shake": true
  }
}
```

## Admin UX pass (R1) {#ux-pass}

Problems in v1: every field full-width in one long column; the featured card open and
dominating the Projects page; no sense of where you are on long pages; plain number boxes for
values that want a feel; no visual for colors.

- **Sidebar** grouped: *Content* (Projects, Home & Site, About, Journey, Skills, Contact),
  *Look & Feel* (Effects), *Settings* (Screen Headings, Interface). Error counts stay.
- **Page header**: editable title, one-line description, and jump links to each section.
- **Compact fields**: short fields (id, year, kind, status, dates, location, glyph, label…)
  sit in a responsive grid instead of stacking full-width.
- **Cards**: collapsed by default with a meta line (kind · year · status), labelled
  "Move to…" menu, image count; clearer hover and focus states.
- **Sliders** for ranged numbers (slider + exact number box + unit), **color pickers** (swatch
  + hex box) for colors, and a **ramp strip** on each flame card so the palette reads at a
  glance while collapsed.
- **Reset to defaults** per Effects section (undoable with Discard until you save).
- **Preview pane** on the Effects page: sticky on wide screens, toggleable on narrow ones; its
  toolbar picks the screen and triggers Stoke / Random swap; each flame card has "Preview".

## Files touched

| Area | Files |
| --- | --- |
| Effects data + runtime | `src/effectsDefaults.js` (new), `src/effects.js` (new), `src/palette.js`, `src/content.json` |
| Validation | `src/contentRules.js` |
| Scene | `src/bonfire/scene.js`, `fireflies.js`, `interaction.js` |
| Site wiring + preview + hidden images | `src/main.js`, `src/content.js`, `src/ui/theme.js`, `vite.config.js` |
| Admin UI | `admin/ui/main.js`, `form.js`, `schema.js`, `admin.css`, `preview.js` (new), `text.js` (new) |
| Admin server | `admin/worker.js` (CSP), `admin/vite.config.js` (local site URL) |
| Tests | `admin/test/effects.test.mjs` (new) |

## Checklist

- [x] R1 UX pass · [x] R2 Title Case · [x] R3 rename labels · [x] R4 featured collapsed
- [x] R5 move anywhere · [x] R6 hide images · [x] R7 effects editor · [x] R8 flame palettes
- [x] R9 live preview

## Later (not in this pass)

- Per-flame overrides of fire behavior (e.g. a taller Spirit flame).
- Content preview (text edits) in the same pane — the message channel already exists.
- Adaptive quality from frame time (README roadmap) could reuse `touchScale`.
