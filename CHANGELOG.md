# Changelog

Notable changes to the portfolio, Bonfire Live, the Bonfire Painter and the admin. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Round 10: menus and search, the knight's fixes, hygiene and performance.

### Menus, search and readability

- _To be written when round 10 lands._

### The knight

- _To be written when round 10 lands._

### Hygiene, coverage and performance

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
