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
  shadow face it falls in. A place's still pieces are merged into one mesh per material,
  their transforms baked in (`src/bonfire/sceneryMerge.js`: `buildScenery` does it last, or
  `scene.js` a few pieces a step, `mergeSteps`, when it builds a place ahead): 48 solid
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
- **Places built beforehand** — in Bonfire Live and the Painter, the other places and their
  height maps are built ahead (`prepareSceneries` in `scene.js`), with their materials set
  up for drawing, and every height map is drawn with one shared material (its shader built
  once): a first visit only puts the place in the scene. It starts 4 s after the show is up
  (not in its first seconds, which have enough to do) and runs only in time the page has
  spare (`inIdle`: idle callbacks with no timeout, and a step starts only with the time it
  needs still left of the moment, at most 0.6 of the display's frame). The steps are a ms
  or less (a few pieces merged, `mergeSteps`; 64 rows of a height map, `heightSteps` in
  `terrain.js`; a map drawn) but for each place's own `buildScenery`, 3–10 ms, which starts
  at the start of an empty moment. A page with no spare time builds nothing ahead, and a
  visit before a place is done finishes its build there and then. The height maps are read
  back through a fence (`readTerrain`), not a blocking read, which waited for the GPU to
  finish the frame just drawn (75 ms a map in software rendering). It all takes about
  4.6 MB more of the JS heap (measured after a GC). The site doesn't: a visitor seldom
  changes place, so each is built on its first visit, as before.
- **One matrix update a frame** — `frame.draw` brings the scene's world matrices up to date
  once for its three renders (three.js did it in each), a place's still pieces keep the
  matrices made when it's built, and a place not shown is out of the scene, not hidden.

### What that came to

Bonfire Live, dev server, GPU Chrome, 1920×1080. The counts are exact (both sides draw the
same frames); the times are medians of interleaved runs on a machine busy with other work,
at times very busy, so they only point the way. "Round start" is `73412c4`, before any of
round 10; "before tier B" has the first five bullets above and not the last five. The
places in each row are in the order ruins / forge / shrine / cathedral / cult:

| | round start | before tier B | after |
| --- | --- | --- | --- |
| H draws per frame (four dancers) | 282 / 436 / 371 / 463 / 416 | 194 / 300 / 251 / 307 / 297 | 123 / 136 / 129 / 135 / 163 |
| … on a frame the fire's shadow is redrawn | (every frame, as above) | 285 / 432 / 365 / 457 / 420 | 211 / 238 / 224 / 233 / 255 |
| … on the other frames | | 174 / 261 / 215 / 263 / 273 | 100 / 109 / 105 / 112 / 139 |
| H CPU ms per frame, against before tier B (five runs a side) | | 3.8 / 4.1 / 3.5 / 3.4 / 3.7 | 2.9 / 2.5 / 2.7 / 2.5 / 2.4 |
| H CPU ms per frame, against round start (two runs a side, very busy) | 4.7 / 6.3 / 6.1 / 7.0 / 6.2 | | 3.9 / 3.5 / 3.4 / 3.4 / 3.6 |
| B busy ms per drawn frame (two runs a side) | | 5.0 / 5.7 / 5.7 / 5.9 / 6.3 | 4.1 / 3.7 / 4.6 / 4.8 / 5.4 |
| A, D busy ms per drawn frame | | 4.7, 5.2 | 3.9, 4.6 |
| First visit to a place, the places built ahead: its frame, GPU finished (median; main thread; over 50 ms; four runs, interleaved) | | 30 ms; 25 ms; 3 of 16 | 8.3 ms; 8.3 ms; 0 of 16 |
| A height map made in idle time, main thread (GPU; software rendering) | | 4.8 ms; 75 ms | 0.5 + 2.7 ms; 0.5 + 2.9 ms |
| The places built ahead, at 144 Hz (three runs): main-thread work; longest step; worst frame gap meanwhile | | (on each first visit) | 60–62 ms; 8.9–9.8 ms; 13.9 ms |
| A pixel-size shift back to a size used lately: GL textures, framebuffers made | | 6, 4 | 0, 0 |
| Scene-graph nodes visited per frame (four dancers) | | 1690–2320 | 513–571 |
| WebGL programs / textures after 6 rebuilds | 161 / 84–85 | 23 / 15–18 | 26 / 23–25 |
| JS heap after load and a GC (a still page) | | 48.6 MB | 53.2 MB |

Of the draws, the merged scenery saves 45–88 on a frame (75–160 when the shadow's six faces
are redrawn) and the instanced fireflies 63–75. (The three more programs are the
instanced fireflies'; the textures are the kept render target sets.) Frame-interval
percentiles mostly moved within the runs' noise: at 144 Hz the frames were already on time
almost always, and the spare time is what grew. A shift's frame took about as long as
before (its hitch was 2–3 ms either way on this GPU): what went is the allocation.

The places' first build ahead started as soon as the fire was up and ran on the idle
callbacks' 250 ms timeout, a whole place a step: in the same runs it did its 62–77 ms of
work 0.06–0.43 s in, in slices of up to 23 ms with up to 4 ms of idle time actually left,
and frames came up to 28 ms apart; with the CPU throttled 2× or 4× it forced 145–385 ms of
work through on timeouts, in slices of up to 101 ms. Now it waits 4 s and works only in
spare time: its frames are at most 13.9 ms apart (one late frame at 144 Hz, a place's
build), and with the CPU throttled, where Bonfire Live at 1080p already misses frames (at 4×
every one is a long task), it builds nothing ahead: the first visit builds the place, as
before tier B.

Where the time goes now (a CPU profile of the cult with four dancers): three.js's draw a
little under half of it (per-object uniform uploads and state, the shadow cube's redraws),
the particle sims' curl noise (`noise3d`, 150 ms/s) the biggest single piece of the
update. The 40 point lights cost three.js about 40 ms/s setting them up
(`WebGLLights.setup`), 5% of the busy time: a pool of about 18 would save part of that,
but changing the light count changes every lit shader, and the pool would have to cover
the most lights ever lit at once, so it waits until it can be checked to the texel.

## Checking that the picture didn't change

Every change above was checked texel by texel against the commit before it: Bonfire Live
(and the site) opened on both sides with `Math.random` seeded and the clock and animation
frames virtual (as scenario H does), the same frames stepped and read back from the canvas
(`gl.readPixels` right after each draw), and compared. Two things make that work: the case
is set up after the reseed (a place built in the stepped run, not while the page's timers
run), and three.js's uuids (four `Math.random` calls for every object it makes) come from a
stream of their own, so a build that makes more or fewer objects doesn't shift every number
drawn after it. The cases: each place at rest, and with four dancers, beats and a weapon swap
moving the shadow; a tour of all five after a flame change, and one with the ice element
stoked all the way; the living blade's flourish, and twice in the cult with four dancers and
a weapon swap; pixel-size shifts with the echo and the ghost trail on; the fireflies
blinking and dancing. The whole of it was then checked against the branch start the same
way at pixel sizes 4 and 2, with the places built on their first visit, and at size 4 again
with them built ahead in idle time first (texel for texel the same frames as built on the
visit). Everything is identical except where merged scenery is in view: at most 5 texels in
a frame differ (of 129,600, 0.004%) at size 4, and 15 (of 518,400, 0.003%) at size 2,
single texels scattered over the place, a dither cell on the stone or in the dark ground,
or a spark at the edge of the depth test. The worst frames are in the ice element's tour
(dither cells on the cathedral's pillars) and with the blade swinging by the fire (its
sparks). Baking a piece's transform into its vertices rounds them a float's last bit
differently, which moves the shadow's and the depth buffer's values by as much and tips a
threshold here and there (and 1–3 of the 102,400 height-map cells in the cathedral and the
cult by one 16-bit step, 0.06 mm). Everything after the merge matches it texel for texel at
both sizes.
