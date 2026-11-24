# NEWT’s Dusk camera review

Open [index.html](index.html) through a local web server to play each before/after pair
at real speed. The selector covers all fourteen shots at desktop (1280 × 720) and
phone (390 × 844) viewports. Both sides use the same seeded settings and a floating
held letter on Dusk. The phone context enables touch, including the contact shadow.

These captures are produced by Codex for issue #86. They are not a claim of Claude’s
review or Newton’s approval. The application source is unchanged by this capture pass.

## Method

- Before: main `6c46a54ac1a00aea4ee037150e485cbd322c8c68`, including #83’s visual fixes.
- After: PR90 `66031518ea02e179de38afc5ab027a2dafae0a29`.
- Chrome’s native `canvas.captureStream(30)` and MediaRecorder capture 8.2 seconds of
  real rendering per shot as VP9 WebM. The shot runs through the application’s own
  director and camera, with drift enabled and no audio track. The idle camera period
  is 0.5 seconds: each clip covers sixteen beats. No virtual clock or debug camera.
- Each clip reloads with random seed 86. The held letter is allowed to arrive and
  anchors settle before recording. The camera is centered via the normal framing API.
- The JSON files log actual `onRendered` timestamps, dimensions, source commit and
  final world state. This exposes stalls; it does not imply every rendered frame is
  encoded, because the video stream samples at up to 30 FPS.
- Overview PNGs show the live view immediately after each recording. Rows follow the
  shot selector’s order, four columns per row. They supplement the real-speed clips.

The captures show the current stationary character with a held letter. Centre/rim
wander bounds and held/unheld framing are separately covered by the projection tests;
these videos do not claim to show the future W2b wandering behavior.

## Regression found by the first capture pass

The initial W6 recordings exposed a real defect that the upright-box projection test
missed: a tilted letter corner left Vertigo's frame (projected screen y = 1.0817 on
desktop). The Letter also came too close to the edge. The lens now fits the actor's
actual transformed paper corners, using the same helper as the rendered-state snapshot.
A tilted-corner unit test and a browser test of actual paper corners cover this case;
the browser samples the first rendered cut frame and the complete eight-second move.
Both regressions fail when the corresponding fix is removed. The browser wiring
mutation fails on The Letter's actual bottom corner crossing its two-percent margin.
The superseded initial recordings are retained
only in ignored scratch evidence, not presented as the final result here.

## Reproduce

Run from the PR worktree with its Node 22 dependencies installed. Close other capture,
benchmark and browser-test jobs first. Port 5336 must be free. The script starts and
stops its own Vite server with a unique cache directory.

```powershell
node docs/design/captures/newt-live-shots/capture.mjs --tag before --root ../newt-r3-86-base
node docs/design/captures/newt-live-shots/capture.mjs --tag after
```

The base checkout must be clean at the recorded main commit and have dependencies.
The script reads its own checkout’s gate cookie and records the actual source hash.
To review locally, serve this directory over HTTP and open `index.html`; playback is
always 1×, and Play Both From Start restarts both recordings together.





## Capture validation

All 56 recordings are present: fourteen shots × two viewports × before/after.
The complete gallery is approximately 33.3 MB. After clips record 1,173–1,182 actual
render callbacks over 8.2 seconds; the largest callback gap is 34.7 ms. The baseline's
largest gap is 55.9 ms. Videos sample at up to 30 FPS and play at real speed.

At the final desktop Vertigo frame, the lowest actual paper corner is at screen
y = 0.9346, inside the frame; the superseded capture measured y = 1.0817. The overview
sheets show the letter's complete silhouette in the letter-focused shots and NEWT's
head and feet in his close shots. Cropping the held letter in NEWT-only shots, or
cropping NEWT in letter-only shots, follows issue #86's per-shot subject contract.

Validation on the recorded source: `npm run check` (1,496 passed, one skipped), all
19 NEWT browser tests with retries disabled, and `npm run coverage` (73.65% lines,
90.38% branches, 86.75% functions). Coverage thresholds are unchanged. The new unit
and browser regressions each fail with their respective corner fix removed.

