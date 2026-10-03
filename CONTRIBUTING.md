# Working on this repo

The code, art and content here are all rights reserved ([LICENSE](LICENSE)), so changes
come from the owner or with his permission. This is how a change is made, tested and
committed.

## Setup

Node 22.12 or later (`.nvmrc` says 22, so `nvm use` picks it), then:

```bash
npm ci
npm run dev     # the site at http://localhost:5173, Bonfire Live at /visualizer/, the Painter at /painter/
npm run admin   # the admin, editing your working copy: http://127.0.0.1:5175
```

The [README](README.md) lists every script; [docs/](docs/) has how each app behaves.

## Tests

| Command | When |
| --- | --- |
| `npm run test:fast` | While you work: the unit and admin tests, minus the slow ones. |
| `npm run check` | Before every commit: lint, types, then every unit and admin test (`test:all`). |
| `npm run e2e` | Before a pull request: the production build in a real browser. |
| `npm run coverage` | When you've added tests: `test:all` under c8, with the coverage report. |

- **Slow tests (the slow lane).** A test that takes more than about 2.5 s ends its title
  with `[slow]`, as in `test('… stay out of the helmet [slow]', …)`. `test:fast` skips
  those; `test:all`, `check`, `coverage` and CI run them. Time a file on its own
  (`node --test --test-reporter=spec test/<file>`): files run side by side slow each
  other down.
- **Coverage.** `npm run coverage` counts every file in `src/` and `admin/`, the ones no test
  loads included, and fails if it drops under the thresholds in `.c8rc.json`. When new
  tests raise it, run `npm run coverage:ratchet` and commit the raised thresholds with
  them. The report is in `coverage/` (open `coverage/lcov-report/index.html`).
- **Types.** `npm run typecheck` checks every module in `src/` and `admin/`, a new one too:
  nothing to list. A module that doesn't check clean yet says so on its first line
  (`// @ts-nocheck: N type errors still to fix`); fixing one means deleting that line and
  lowering `MOST` in `test/typecheckDebt.test.mjs`, which keeps the count from growing.
- **Content wording.** Tests must not pin `src/content.json` wording: the admin edits it and a
  save deploys only if the tests pass, so read the text from the content (`src/content.js`,
  `e2e/lib/content.mjs`) or set it on the test's own fixture.
- **Browser tests.** They need WebGL. Locally, `PW_CHANNEL=chrome npm run e2e` (or `msedge`)
  uses your installed browser instead of downloading Playwright's. `PW_PREBUILT=1` serves the
  `dist/` you already built instead of building again; `PW_PORT=4180` moves the preview
  server off 4173, so two checkouts can test at once.
- **Browser test shards.** The whole run is about 15 minutes with two workers. CI splits it
  into five shards on one build (`.github/workflows/ci.yml`): Bonfire Live's tooltip sweeps
  (`e2e/tips-live.spec.mjs`) in two, every other spec in three. To run a part locally, name
  a file (`npm run e2e -- tips-site`), or repeat a CI shard with its own arguments:
  `npm run e2e -- --grep-invert tips-live --shard=1/3` (all but Live tips, 1 of 3) or
  `npm run e2e -- tips-live --shard=1/2` (Live tips, 1 of 2). A spec whose tests each open
  their own page can say `test.describe.configure({ mode: 'parallel' })`, so its tests run
  side by side and shard one by one, as tips-live and tips-painter do.

## Formatting

Prettier's settings are in `.prettierrc.json` (120 columns, single quotes, semicolons,
trailing commas); `npm run format` applies them and `npm run format:check` lists what
differs (`npm run check` and CI run it). `.editorconfig` sets the basics for any editor.

A pre-commit hook (simple-git-hooks, installed by `npm install`) runs lint-staged:
`eslint --fix`, then Prettier, on the files you're committing (in that order, so a fix that
lengthens a line is formatted before it's committed). The one commit that formatted
the whole repo is listed in `.git-blame-ignore-revs`; to have `git blame` skip it locally,
run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once (GitHub already does).

`src/content.json` is never formatted: the admin writes it with `JSON.stringify` on every
save, so hand-formatting would only be undone. Edit it through the admin
([docs/admin.md](docs/admin.md)) when you can. Markdown is wrapped by hand. The root
`index.html` is formatted like the rest: the build copies it for every page and swaps in
that page's description and preview tags (`withMeta` in `src/seoPages.js`), which finds
each `<meta>` tag however its attributes are wrapped; `test/site.test.mjs` checks it on
a Prettier-wrapped copy.

## Rules that keep things working

- **Saved state never breaks.** People keep Bonfire Live settings (localStorage) and export
  Setups as JSON, save Painter scenes (format `v: 1`), and the admin edits
  `src/content.json`. Never rename a stored key or path without a migration that still
  reads the old one (Bonfire Live's is `mergeInto` in `src/visualizer/settings.js`, scenes
  step through `MIGRATIONS` in `src/scenes.js`), and add a test that loads the old shape.
- **A change to the content's shape** (a key added, renamed or removed in
  `src/content.json` or `admin/ui/schema.js`) needs `npm run admin:deploy` after it merges,
  so the deployed admin knows the new shape. The pull request template has a box for it.
- **Every Bonfire Live effect is optional.** Each one gets the three-way switch: Off, In the
  Mix, Always. The aim is endless variations, so nothing is forced on.
- **Look at it at real speed.** An effect has to read at normal speed from the site's own
  cameras, not just in a paused frame or a close-up. Compare before and after side by side.
  The knight is judged as a 2D pixel-art sprite.
- **Labels in Title Case, hints in sentences.** Tabs, headings, labels, buttons and options
  capitalize every word except articles (the `titleCase()` rule); tooltips and descriptions
  are plain sentences.

## Commits and pull requests

- One logical change per commit. The subject is imperative and at most 72 characters
  ("Cache Playwright's browsers in CI"); the body says why. Moving code between files is a
  commit of its own, with nothing else changed in it.
- Pull requests fill in the template: captures for anything visible, what happens to saved
  state, and the checks you ran. CI (`.github/workflows/ci.yml`) runs lint and types, the
  unit tests with coverage on Node 22 and 24, and the browser tests (five shards on one
  build); `main` deploys only when all of it passes.
