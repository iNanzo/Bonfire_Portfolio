# Changelog

Notable changes to the portfolio, Bonfire Live, the Bonfire Painter and the admin. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Round 11: the knight at home in every place, every module type-checked, and a cleanup for
what agents and test runs leave running. Round 10, below it: menus and search, the
knight's fixes, hygiene and performance.

### Admin deployment

- Add an automatic admin deployment workflow that publishes current main only after
  its existing Pages CI and deployment succeed. It rechecks main before publishing,
  serializes deployments, and recovers changes from earlier failed pushes. Activation
  requires the documented Cloudflare configuration; manual deployment remains available.

### The knight at home (round 11)

- In the ruins he rests on the ground, where round 9 had him, instead of hunched on a drum
  with his boots up on another: the broken pillar stands a metre to his right in the
  firelight, the drum fallen from it lies behind it, and no rubble lies where he sits
  (the ruins' model rebuilt; the seat drum built in code is gone).
- A new rest on the ground, after the Dark Souls and FFXIV bonfire rests. *Resting*: one
  knee drawn up with an arm hung over it and the gauntlet hanging limp, the other leg
  stretched out, his head bowed toward the knee. *Watchful*: sitting up with both knees
  drawn up, his forearms over them, turned to the fire. Bonfire Live's other knights rest
  the same way.
- All the room his arms want at every place: the forge's anvil, the shrine's back lantern,
  the cathedral's nave and the cult's standing stones moved back, so Praise the Sun is a
  full V wherever he sits, seated or stood up.
- Fixes sitting on the ground: a hand dropped to a knee or flung low stays off the floor
  and the feet lie flat; a tasset no longer swings round behind him into the ground when
  he kicks with a knee drawn up; Praise the Sun's seated wind-up no longer sweeps a hand
  through his belly; getting up, a stretched leg draws in instead of snapping, and his
  head lifts out of its bow instead of curling him into a ball.
- Bonfire Live: the knights resting round the fire sit back as far as their pose needs
  for a leg stretched toward it to stay out of the pit's stones (watchful, where round 10
  sat them, clear of the forge's hearth and the cathedral's pew), shifting as their pose
  changes, on the ground where they sit; and the *Pillar Side* shot looks from the front
  left at what stands by his seat, him and the fire, all three in frame in every place.

### Checks and tools (round 11)

- Every module in `src/` and `admin/` is type-checked, new ones too (`tsconfig.json` no
  longer lists them by hand). The 45 that don't check clean yet say so on their first
  line, with their error count, and a test keeps that number from growing.
- `npm run cleanup` lists the dev and preview servers, test browsers and scripts left
  running by agents and test runs, which hold files in `node_modules` (so `npm ci` fails
  half done) and keep ports taken; `-- --kill` stops them.
- `tools/capture-knight.mjs` serves itself (`--serve`: a dev server for the run, from the
  folder it's run in), shows all of a seated pose (`pose`), the other cameras that frame
  his seat (`views`: Journey, About, Pillar Side at either end of its sway, the Moonlit
  Ruins camera) and a gesture with his room set by hand (`--room L,R`).

### Menus, search and readability (round 10)

- One settings map (`src/settingsMap.js`) names, describes and places every setting for
  Bonfire Live, the Painter and the admin, so the same thing has the same name everywhere
  (Place, Flame Colors, Place Colors, Living Weapon, Edge Glow…). Labels are Title Case;
  hints are short sentences that say what a setting does, with longer notes under More.
- Search: Bonfire Live's settings (`/` or Ctrl+F; it finds synonyms like "strobe" or
  "brightness", shows advanced matches in the Simple view and goes to the one you pick),
  the Painter's panel (including fields the scene hides, with what turns them on) and the
  admin (Ctrl+K or `/`, any field on any page).
- One tooltip for every app: it stays on screen (it flips and shifts at any edge, above
  dialogs and scroll areas), shows on hover, keyboard focus and tap, and Esc hides it. The
  "?" is a button beside its label, so clicking it no longer toggles a checkbox.
- Bonfire Live's settings in 9 tabs (Sound, Show, Drops, Picture, Effects, Camera, Cast,
  Scenes & Cards, My Setups) with every setting where you'd look for it, three-way switches
  as Off / In the Mix / Always buttons, bulk All Off / All In the Mix / All Always /
  Shuffle / Defaults on every grid (All / None / Defaults on checklists), Reset Section,
  Undo, settings that do nothing right now greyed with the reason, a Keyboard Shortcuts
  list (`?`) and a Frame Rate setting (Display / 60 / 30). Every keyboard shortcut is the
  same.
- The Painter: sections in the same order and words as Bonfire Live, the fire's shape in
  its own section, bulk tools, a Tools menu (Render Settings, Pack, Capture, Full Screen,
  Keys), tooltips on its icon buttons, open sections remembered, and only the section that
  changed redrawn.
- The admin: Effects split into Colors, Fire & Elements, Picture and Knight; every
  Interface text named; Reset Section with Undo (your own palettes kept). Its color
  swatches and table layout work under its security policy again.
- The site: the Menu at every width (Discoveries can be reached on a desktop), Go To and
  Tools groups, the pack's weapons grouped (Swords, Greatswords, Polearms, Axes & Hammers)
  with the Living Weapon on the Anvil, the render settings grouped and openable from the
  menu, and a Keyboard Shortcuts list.

### The knight (round 10)

- He no longer goes through the scenery: the seats in the ruins, cathedral and cult moved
  clear (and the cathedral's right column, the cult's third stone and the forge's anvil
  moved back a little), each place has collision shapes, and every arm movement at his
  seat keeps out of them, with a test over every action at every seat. He stays left of
  the fire and the sword, inside a phone's frame, and as smooth as before.
- His dither shows: his shading bands' edges take the scene's Bayer dither and follow the
  Dither setting (Off turns it off), while flat plates stay clean.
- The style "Gunmetal" is shown as "Smooth Steel" (the Gunmetal finish keeps its name).

### Hygiene, coverage and performance (round 10)

- Bonfire Live's lag: the fire's shadow no longer redraws on every beat, scene rebuilds
  stop leaking WebGL programs and contexts, still scenery is drawn one mesh per material,
  the fireflies are instanced, render targets are kept per pixel size, places are built
  ahead in spare time (no freeze on a first visit), and per-frame garbage and DOM writes
  are gone. A benchmark (`npm run bench`) and a `?perf` overlay measure it
  ([docs/performance.md](docs/performance.md)).
- Big files split into modules along their sections: `scene.js`, `knights.js`,
  `knightPose.js` and Bonfire Live's `main.js`; shared helpers in `src/ui/shell.js` and
  `src/math.js`; unused exports and code removed.
- Coverage for every file in `src/` and `admin/` (`npm run coverage`), with thresholds that
  only go up (`npm run coverage:ratchet`) and a summary on each CI run.
- A fast test lane (`npm run test:fast`) that skips the tests tagged `[slow]`.
- Stricter lint (`prefer-const`, `eqeqeq`, `no-var`, plus size and complexity warnings) and
  more modules type-checked, with Vite's client types.
- CI as one reusable workflow: lint and types, unit tests on Node 22 and 24, and the
  browser tests side by side, with Playwright's browsers cached; the deploy ships the
  build the browser tests ran against. Dependabot proposes updates weekly.
- Prettier (one reformat commit, skipped by blame; checked in CI and by a pre-commit hook),
  EditorConfig and `.nvmrc`; a license (all rights reserved), contributing
  guide, security policy, pull request template and code owners.
- The design logs moved to `docs/design/`.

## [2.0.0] - 2026-10-01

The state of the site before round 10: one Three.js engine behind three apps, and an
admin.

### The portfolio

- An always-visible pixel-art bonfire behind every screen, rendered from 3D in four
  low-resolution passes with outlines, Bayer dither and a palette snap. The camera moves
  to a new point of view for each screen.
- Projects live in an inventory. Inspecting one pulls the weapon out of the fire and forges
  a new one in a new flame color that recolors the whole page; three elements (fire,
  lightning, ice) each forge in their own way.
- A low-poly knight, drawn as a 2D pixel-art sprite in six styles, comes to rest by the fire
  when you click his summon sign.
- Keyboard play throughout, a pack (I), "How It's Made" (B) and the render settings (P).

### Bonfire Live

- An audio-reactive visualizer for DJ sets: it hears the beat, build-ups and drops, forges
  a blade in the breakdown and slams it in on the drop.
- Looks, layers and drop hits, each with an Off / In the Mix / Always switch; camera moves
  and cuts; dancing knights and fireflies; saved Setups and MIDI control.
- Preset scenes, played and looped on the music.

### Bonfire Painter

- A scene editor for Bonfire Live: paint a scene (place, colors, framing, look, knights),
  watch it play to a silent beat, save it and send it to Bonfire Live.

### Admin

- A form-based editor for `src/content.json` on a Cloudflare Worker behind Cloudflare
  Access. Every save is one commit through a GitHub App, and the site redeploys.
- Effects pages with a live preview, palette tools and a Scenes page for the built-in
  scenes.

[Unreleased]: https://github.com/iNanzo/Bonfire_Portfolio/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/iNanzo/Bonfire_Portfolio/tree/v2.0.0
