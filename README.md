# Newton Hoang: Portfolio v2

**[nhoang.dev](https://nhoang.dev)** · a portfolio that plays like a game.

![The pixel-art bonfire: a weapon planted in the flames among ruins](assets/source/bonfire-preview.png)

One engine, three apps:

- **[The portfolio](https://nhoang.dev)**: an always-visible, pixel-art bonfire burns
  behind every screen. The camera moves to a new point of view for each one, projects
  live in an inventory, and inspecting one pulls the weapon out of the fire and forges a
  new one, in a new color that recolors the whole page. A knight comes to rest by the
  fire when you click his summon sign.
- **[Bonfire Live](https://nhoang.dev/visualizer/)**: an audio-reactive visualizer for DJ
  sets. It hears the beat, the build-ups and the drops, forges a blade in the breakdown
  and slams it in on the drop, and loops through preset scenes.
- **[Bonfire Painter](https://nhoang.dev/painter/)**: a scene editor for Bonfire Live.
  Paint a scene (place, colors, framing, look, knights), watch it play to a silent beat,
  and send it to Bonfire Live.

Vite and plain JavaScript (type-checked through JSDoc), Three.js, Blender-built models,
and a content admin on a Cloudflare Worker. Node 22.12 or later.

```bash
npm install
npm run dev           # the site: http://localhost:5173 (Bonfire Live at /visualizer/, the Painter at /painter/)
npm run check         # lint, type check, every unit test (site, visualizer, admin)
npm run test:fast     # the unit tests minus the [slow] ones, while you work
npm run coverage      # the unit tests with coverage (see Testing and coverage)
npm run e2e           # the production build in a real browser (Playwright)
npm run bench         # Bonfire Live's frame times on the demo track, in GPU Chrome: add
                      # -- --url <a running dev server> (docs/performance.md)
npm run format        # Prettier, with .prettierrc.json's settings
npm run admin         # the admin panel, editing your local files: http://127.0.0.1:5175
npm run build         # outputs dist/
npm run model         # rebuild the scene in Blender (tools/*.py → public/models/bonfire.glb)
npm run model:knight  # rebuild the knight (tools/knight.py → public/models/knight.glb)
npm run screenshots   # pull captures from the old portfolio (tools/import-screenshots.mjs; docs/admin.md)
node tools/capture-painter.mjs  # the Bonfire Painter project's screenshots, from a running
                                # `npm run dev` (not a build): --base <url>, --only editor,live,
                                # --write editor=<png> to keep another candidate (its header)
```

## How it's built

```
src/content.json ──► content.js ──► render.js (HTML) ──► main.js (routes, keys, the pack)
                                                         │
  tools/*.py (Blender) ──► public/models/bonfire.glb ──► bonfire/scene.js ◄── visualizer/director.js
                                                         │     ▲                 ▲
                                                         │     │                 └── analyser, tempo, sections
                                                         ▼     │
                                                  bonfire/frame.js  ──► pixelPass.js (dither, palette)
```

- **One scene, three front ends.** `src/bonfire/` is the engine: the fire, the three
  elements (fire, lightning, ice), the fireflies, the weapon forge, the impacts, the
  knights. The site drives it from the page (`src/main.js`); Bonfire Live drives it
  from the music (`src/visualizer/`); the Painter (`src/painter/`) holds a scene on
  Bonfire Live's own director. The visualizer's extra effects compile in only when asked
  (`createBonfire({ effects: true })`), so the site ships a lean shader.
- **Pixel art from 3D.** Every frame is four low-resolution passes: normals, lit color,
  additive particles, then a pixel pass that draws outlines, orders a Bayer dither and
  snaps every pixel to the current flame's palette (`frame.js`, `pixelPass.js`).
- **Content is data.** All text, projects and effect settings live in `src/content.json`,
  checked by `src/contentRules.js`; the admin commits edits to this repo through a GitHub
  App, and every save redeploys.

## Things worth a look

| | Where |
| --- | --- |
| The weapon swap: a ripple dissolve, a helix of particles, the new blade forming, and each element's own take on it | `src/bonfire/weapons.js`, `forgeParticles.js`, `forgeFx.js` |
| Drop detection: kick-gone breakdowns, tension builds, a multi-cue drop score | `src/visualizer/sections.js`, `test/drops.test.mjs` |
| The living blade: procedural slashes, thrusts and spins on the beat | `src/bonfire/bladeMotion.js` |
| A low-poly knight, built in Blender by script and drawn like a 2D pixel-art sprite lit by the fire (six styles); summoned out of his NH sign in the element's own dissolve on the site, dancing in Bonfire Live | `tools/knight.py`, `src/bonfire/knights.js`, `armor.js`, `knightStyles.js`, `summonSign.js`, `src/visualizer/knightShow.js` |
| Preset scenes: one format for the Painter, Bonfire Live's loop and the admin, each change landing in a flash or an impact | `src/scenes.js`, `src/visualizer/scenePlayer.js`, `sceneLoop.js`, `src/painter/` |
| Fireflies that steer around the scenery and land on any surface | `src/bonfire/fireflies.js`, `terrain.js` |
| "How it's made": the page takes itself apart, render settings and all (B on the site, or *Take This Page Apart* on the Portfolio's own project page) | `src/ui/breakdown.js`, `src/ui/renderMenu.js` |
| Palettes generated in OKLCH that keep text readable | `src/paletteGen.js` |

## Testing and coverage

| Command | What it runs |
| --- | --- |
| `npm test` | the unit tests (`test/`) |
| `npm run admin:test` | the admin's tests (`admin/test/`) |
| `npm run test:all` | both at once; `npm run check` runs it after lint and types |
| `npm run test:fast` | both, minus the tests whose titles end in `[slow]` (the knight on his real model, the longest synthesized tracks) |
| `npm run coverage` | `test:all` under [c8](https://github.com/bcoe/c8), with a coverage report |
| `npm run e2e` | the production build in a real browser (`e2e/`, Playwright) |

The unit tests run in Node, with no browser: the engine's math and motion, the knight on
his real model, the audio analysis on synthesized tracks, settings, scenes and content
rules. The modules that need a page and WebGL (the three `main.js`, `scene.js`, the
particle systems) are exercised by the browser tests instead. Locally,
`PW_CHANNEL=chrome npm run e2e` uses your installed Chrome; `PW_PREBUILT=1` reuses the
`dist/` you already built, and `PW_PORT` picks another port than 4173.

**Coverage.** `npm run coverage` prints a table and writes `coverage/`: an HTML report
(`coverage/lcov-report/index.html`), `lcov.info` and `coverage-summary.json`. It counts
every file in `src/` and `admin/`, including those no unit test loads (at 0 %), so the
total is honest rather than flattering. It fails if lines, statements, functions or
branches drop under the thresholds in `.c8rc.json`; after adding tests,
`npm run coverage:ratchet` raises them to what the tests now reach (it never lowers them).
`node tools/coverage-summary.mjs` turns the last run into Markdown tables, by folder and
by file; CI shows them on each run's summary page and keeps `coverage/` as an artifact.

## Checks and deploys

Pull requests run `.github/workflows/checks.yml`, and pushes to `main` run `deploy.yml`.
Both call one reusable workflow, `ci.yml`, which runs side by side: lint and type checks;
the unit and admin tests with coverage, on Node 22 and 24; and the build, which the
browser tests then run against (`e2e/`: every screen, Bonfire Live and its preset scenes,
the Painter, the admin) in five shards, two of them for Bonfire Live's long tooltip
sweeps. `main` deploys to GitHub Pages only if all of it passes, and it ships the very
build the browser tests ran against. Dependabot proposes dependency and action updates
weekly (Three.js is updated by hand, since a new version can change the look). The admin
is a separate deploy: `npm run admin:deploy`.

How to make and commit a change: [CONTRIBUTING.md](CONTRIBUTING.md). What changed:
[CHANGELOG.md](CHANGELOG.md).

## Docs

- [docs/bonfire.md](docs/bonfire.md): how the site and the scene behave, in detail
- [docs/bonfire-live.md](docs/bonfire-live.md): running Bonfire Live at a show
- [docs/painter.md](docs/painter.md): the Bonfire Painter, making preset scenes
- [docs/admin.md](docs/admin.md): editing content, by hand or in the admin
- [docs/knight.md](docs/knight.md): the knight: model, rig, styles, poses, arrival, places and API
- [docs/performance.md](docs/performance.md): measuring the bonfire: the `?perf` overlay, the
  benchmark (`npm run bench`) and comparing two runs (`npm run bench:compare`)
- [docs/elements.md](docs/elements.md): design notes for the elements and the palette tools
- [docs/design/](docs/design/): the design logs, [Bonfire Live's](docs/design/visualizer.md)
  and [the admin's](docs/design/admin-v2.md)

## Accessibility and performance

Every screen works by keyboard (Q/E, arrows or WASD, Enter, Esc, I for the pack, B to
take the page apart, P for the render settings) and announces its changes to screen
readers. `prefers-reduced-motion` gets instant camera cuts and a calmer, still-dithered
fire. The scene renders at 3–4 CSS pixels a texel, pauses in a hidden tab, and uses fewer
particles and no shadows on touch devices; Three.js loads after the page content, and
fonts are served from the site itself. Add `?perf` to any page's address for a frame-time
overlay; `npm run bench` measures Bonfire Live on the demo track, and `npm run bench:compare`
puts two runs side by side ([docs/performance.md](docs/performance.md)).

## License

All rights reserved. The code, art, models and content are published to be seen, as a
portfolio; no license is granted to copy, modify, distribute or use them without written
permission ([LICENSE](LICENSE)). To report a security issue, see [SECURITY.md](SECURITY.md).
