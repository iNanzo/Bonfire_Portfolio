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

Scenarios (`--scenarios A,B,…`; the default is `A,B,E,F,H`):

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
- **H** — deterministic: no music, and the page's clock and animation frames are virtual
  (nothing moves until the bench steps it), with the same seed on both sides. In each place
  four knights dance and a hard beat lands every 30 frames while 300 frames are stepped in
  a tight loop. It reports ms per frame on the wall clock and on the main thread's CPU
  clock (`stepped CPU ms/frame`), draw calls and shadow redraws per frame. Both sides draw
  exactly the same frames, so this is the one to trust on a busy machine.

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
else: one run each is easily off by 30% on a shared or thermally limited machine. The live
windows (A–G) also play a different show on each run (the music's timing decides which look,
element or weapon is up when), so compare their medians, and lean on H and on the counts
(draw calls, shadow redraws, GPU objects), which don't depend on either. Frame
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
- **Scenery drawn per material** — the forge, shrine, cathedral and cult were built from
  33–83 small meshes each, every one a draw in the normals pass, the color pass and each
  shadow face it falls in. `buildScenery` ends by merging a place's still pieces into one
  mesh per material, their transforms baked in (`src/bonfire/sceneryMerge.js`): 48 solid
  meshes become 5 in the forge, 61 become 5 in the cathedral. The glows stay apart (each is
  recolored), and the merged meshes cast and take shadows and stay the place's solids, so
  the fireflies' height map and raycasts see the same faces.
- **Fireflies instanced** — each part of a firefly (body, lantern, wings, halos) is one
  `InstancedMesh` for all of them: 4 draws instead of 5 a fly. `fireflies.place(camera)`
  writes them just before the draw: each part's view-space matrix with the meshes standing
  at the camera (so the GPU multiplies each vertex by the matrix it used for the part's own
  mesh), the lantern and halo colors and the halos' opacity as a flat per-instance tint, and
  the halos back to front the way three.js sorted them (additive blending rounds after each).
- **Render targets per pixel size** — a pixel-size shift swaps in the targets of a size used
  lately (the last three sizes, `src/bonfire/targetCache.js`) instead of freeing and
  allocating every target again; a shift back to a kept size makes no GL textures or
  framebuffers (6 and 4 before, on its frame).
- **Places built beforehand** — the other places and their height maps are built in idle
  moments once the fire is up (`prepareSceneries` in `scene.js`), with their materials set
  up for drawing, and every height map is drawn with one shared material (its shader built
  once): a first visit only puts the place in the scene. It takes about 4.5 MB of JS heap
  more per scene.
- **One matrix update a frame** — `frame.draw` brings the scene's world matrices up to date
  once for its three renders (three.js did it in each), a place's still pieces keep the
  matrices made when it's built, and a place not shown is out of the scene, not hidden.

### What that came to

Bonfire Live, dev server, GPU Chrome, 1920×1080, medians of interleaved runs (two a side for
A, B and D, five for H) on a machine busy with other work, so lean on the counts and on H.
"Round start" is `73412c4`, before any of it; "before tier B" has the first five bullets
above and not the last five:

| | round start | before tier B | after |
| --- | --- | --- | --- |
| H draws per frame (ruins / forge / shrine / cathedral / cult) | 282 / 436 / 371 / 463 / 416 | 194 / 300 / 251 / 307 / 297 | 123 / 136 / 129 / 135 / 163 |
| H CPU ms per frame (same order; five runs each) | 3.9 / 4.4 / 4.0 / 4.3 / 4.2 | 3.3 / 3.6 / 3.3 / 3.5 / 3.9 | 2.7 / 2.8 / 2.4 / 2.5 / 2.7 |
| H ms per frame at 4× CPU throttle (one run each) | | 20.0 / 27.7 / 20.9 / 23.1 / 24.0 | 16.7 / 15.7 / 15.0 / 15.3 / 16.0 |
| B busy ms per drawn frame (same order) | 5.2 / 6.5 / 7.1 / 7.2 / 6.3 | 5.6 / 5.8 / 6.6 / 5.7 / 6.1 | 4.5 / 4.8 / 5.3 / 4.6 / 5.2 |
| A, D busy ms per drawn frame | 4.7, 5.5 | 4.5, 4.4 | 4.0, 3.5 |
| First visit to a place (its frame, GPU finished, median) | | 34–40 ms (up to 59) | 8–9 ms (up to 28) |
| Scene-graph nodes visited per frame (4 dancers) | | 1690–2320 | 513–571 |
| WebGL programs / textures after 6 rebuilds | 161 / 85 | 23 / 15 | 26 / 24 |

(The three more programs are the instanced fireflies'; the textures are the kept render
target sets.) Frame-interval percentiles moved within the runs' noise: at 131 Hz the frames
were already on time almost always, and the spare time is what grew.

Where the time goes now (a CPU profile of the cult with four dancers): three.js's draw about
half of it (per-object uniform uploads and state, the shadow cube's redraws), the particle
sims' curl noise (`noise3d`) the biggest single piece of the update. The 40 point lights cost
three.js about 40 ms/s setting them up (`WebGLLights.setup`) on top of their uniforms: a pool
of about 18 would save part of that, but changing the light count changes every lit shader,
so it waits until it can be checked to the texel.

## Checking that the picture didn't change

Every change above was checked texel by texel against the commit before it: Bonfire Live
(and the site) opened on both sides with `Math.random` seeded and the clock and animation
frames virtual (as scenario H does), the same frames stepped and read back from the canvas
(`gl.readPixels` right after each draw), and compared. Two things make that work: the case
is set up after the reseed (a place built in the stepped run, not while the page's timers
run), and three.js's uuids (four `Math.random` calls for every object it makes) come from a
stream of their own, so a build that makes more or fewer objects doesn't shift every number
drawn after it. The cases: each place at rest, and with four dancers, beats and a weapon swap
moving the shadow; a tour of all five after a flame change; the living blade's flourish;
pixel-size shifts with the echo and the ghost trail on; the fireflies blinking and dancing.
Everything is identical except for the merged scenery, where at most one dithered texel in
a frame (of 129,600) differs from the branch start: a baked transform rounds a vertex a
float's last bit differently and tips one dither threshold.
