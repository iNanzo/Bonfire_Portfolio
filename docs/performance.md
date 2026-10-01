# Performance: measuring the bonfire

How to see where the time goes, in the page and from the command line, and how to compare
two versions. The art steps at 12 fps, but the scene is drawn at the display's rate (or a
cap: `fire.setMaxFps`), so lag shows as frames that take longer than the display allows.
Bonfire Live is the heaviest of the three front ends (more particles, the effects stages,
up to four knights); the tools below were built for it, and the overlay works everywhere.

## The `?perf` overlay

Add `?perf` to any page's address: the site (`/?perf`), Bonfire Live (`/visualizer/?perf`)
or the Painter (`/painter/?perf&scene=b:frozen-shrine`). `createBonfire` mounts a small
overlay in the bottom-left corner (`src/ui/perfOverlay.js`); it ignores the pointer and
updates twice a second:

```
fps 144   frame p50 6.9  p95 9.7 ms
page 0.36  update 1.06  draw 2.84 ms
draws 190  shadows 12/s
programs 24  textures 12  geometries 104
```

- **fps** — frames drawn per second, and the cap when one is set (`cap 60`).
- **frame p50 / p95** — the time between drawn frames, over the last 256.
- **page / update / draw** — a frame's parts on average: the page's own `onFrame` (Bonfire
  Live's analyser, director and HUD), the scene's update (the particle sims, knights,
  fireflies, lights), and the draw (three.js's passes, as the CPU sees them).
- **draws** — draw calls in the last frame, all passes together (`renderer.info`).
- **shadows** — how often the fire's shadow (a six-face cube map) was redrawn, per second.
- **programs / textures / geometries** — what the renderer holds on the GPU.

The same three parts are written as `performance.measure` entries (`bonfire: page`,
`bonfire: update`, `bonfire: draw`), so a recording in the browser's Performance panel
shows them on the timeline. Without `?perf` nothing is timed and the overlay's code isn't
loaded.

## The benchmark: `tools/bench-viz.mjs`

Bonfire Live on the demo track in a real Chrome with the GPU (`--use-angle=d3d11` on
Windows), at 1920×1080, `Math.random` seeded, preset scenes off so the place and the cast
stay put. Each scenario runs in a fresh browser context; each measured window records:

| Metric | What it is |
| --- | --- |
| fps, p50 / p95 / p99 / max | drawn frames and the time between them (ms) |
| % > 16.7 ms, % > 33 ms | frames slower than 60 or 30 fps would allow (5% slack for vsync jitter) |
| long tasks | count, total and longest (the browser's long-task entries, over 50 ms) |
| busy ms/s, script ms/s | the page's main thread: all work, and JavaScript alone (CDP Performance metrics) |
| draw calls | per frame, read from `renderer.info` every 30th frame |
| shadows/s | the fire shadow's redraws per second |
| alloc MB/s | allocation rate, with `--alloc N` (N seconds of heap sampling after the window) |
| top functions | with `--profile`: a CPU profile after the window, inclusive ms/s of `src/` functions |
| programs / textures / contexts | WebGL objects still alive (scenario E), per context; a lost context's go with it |

Scenarios (`--scenarios A,B,…`; the default is `A,B,E,F`):

- **A** — the ruins, the free show grooving to the demo.
- **B** — each of the five places (ruins, forge, shrine, cathedral, cult) with four knights
  dancing: a window per place.
- **C** — the forge: forge a weapon (`A`), strike it (`Space`), the living weapon (`X`), on a loop.
- **D** — pixel size 2 with the Painterly layer always on (the heaviest picture).
- **E** — six scene rebuilds (the Particles setting toggled): the long task each one
  costs, and the WebGL programs, textures and contexts alive after each. They should stay
  flat: before round 10 every rebuild left its context and ~23 programs behind.
- **F** — the settings: the P menu's digits pressed fast with the dialog closed, then a
  slider dragged back and forth in the open dialog.
- **G** — the frame cap (`fire.setMaxFps(--cap)`, 60 by default), where the build has it.

Run it against a server that's already up, or let it start Vite on a checkout:

```sh
# a running dev server (window.__viz is there in dev builds)
node tools/bench-viz.mjs --url http://localhost:5173 --label mine

# Vite started on a checkout (its own node_modules), dev mode
node tools/bench-viz.mjs --root ../other-checkout --port 5193 --label before

# a production build of this checkout, served by vite preview; the page is opened with
# ?bench, which exposes window.__viz in a build (src/visualizer/main.js)
node tools/bench-viz.mjs --root . --port 5183 --prod --label prod
```

Options: `--scenarios`, `--seconds 10` (each window), `--rounds 1`, `--throttle 4` (CPU
slowdown, as on a slower laptop), `--alloc 4`, `--profile`, `--cap 60`, `--seed 1`,
`--headed`, `--out test-results/perf`. The results go to `<out>/<label>.json`; with
`--root`, the checkout's commit is recorded too.

`--dev` runs work on any commit (the dev hooks have been there all along), which is what a
before/after needs. `--prod` needs a build that honors `?bench` (round 10 on).

## Comparing two runs: `tools/bench-compare.mjs`

```sh
node tools/bench-compare.mjs before mine
node tools/bench-compare.mjs before-1,before-2 mine-1,mine-2   # several runs: medians
node tools/bench-compare.mjs before mine --md                  # a Markdown table
```

Each side is a label (looked up in `test-results/perf/`, or `--dir`), a path to a JSON
file, or a comma-separated list of them. Every metric of every window is printed before →
after with the change and whether it's better; with several runs or rounds on a side, each
number is their median. Scenario E adds the GPU objects at the start and after six rebuilds.

**Interleave the runs** (before, after, before, after) when the machine is doing anything
else: one run each is easily off by 30% on a shared or thermally limited machine. Frame
times only mean something next to the display's own rate (`displayHz` in the JSON): on a
144 Hz display an uncapped frame is 6.9 ms at best, and a 60 cap draws every second or third
frame (13.9 or 20.8 ms apart), so its % > 16.7 ms is high by design.

## What was done about the lag (round 10)

Measured first with the tools above; each change says why in a comment where it's made.

- **Frame cap** — `fire.setMaxFps(fps)` (`src/bonfire/frameGate.js`): an accumulator over
  the display's frames, 1 ms of slack, no drift, no burst after a stall. Uncapped by
  default. The loop still runs at the display's rate and calls `onTick(dt)` on every frame
  (for the audio analysis), the scene's clock and the draw only on the frames it keeps.
- **Shadow** — a planted weapon's shudder on a hard beat redraws the fire's shadow at the
  art's 12 fps instead of every frame (`weapons.movingForShadow`); real motion (a swap, the
  living weapon) still redraws it every frame.
- **Rebuilds** — a scene's resources are disposed last-made first, so the renderer goes
  after the materials and textures that need it, and then its context is let go
  (`forceContextLoss`).
- **Per-frame work and garbage** — only the current place's glows are recolored, with the
  ramp parsed once a step; a few-color palette is set again only when it changes; the
  scenery colors are taken up only when a blend step changes them; `applyRenderSettings`
  stops early when nothing it reads changed; the looks' update, the onset detector (a ring
  of its history) and the fireflies' screen positions allocate nothing per frame; the scene
  image's mipmaps are made only while the glow reads them; the page's accent colors are
  written only when they change (`setAccentRate` sets how often during a blend).
- **Thumbnails** — `fire.captureThumb(w, h)` takes a scene's 192×108 picture straight from
  the canvas's texels, encoded by the browser off the page's thread.
