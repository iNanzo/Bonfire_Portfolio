// S2, the carry spike (docs/design/invitation-live.md, Delivery plan › S2): can Bonfire Live's
// NEWT world lift NEWT and drop him with no pointer, so the toy's own lines for being picked up,
// dropped and landing fire from the behaviors they go with?
//
// It runs the toy's real brain (brain.js), body (play.js bodyStep: the hold, the toss, the fall)
// and talk (speech.js, the lines and chances from content.json) in node, with no character and
// no DOM. The show's two moments are sent as the toy's own gesture events: a grab at build
// stage 4 (the open letter takes him by the collar and lifts him) and a release on the drop's
// strike (a short toss). His collar is his root plus COLLAR_Y (no skeleton here); while he's
// held his root follows the hold's anchor less that offset, as src/invitation/main.js moves it.
//
//   node docs/design/captures/newt-live-s1/s2-carry.mjs
//
// Prints one run frame by frame (state changes and lines) with every chance at 1, then the
// share of 2000 drops that get each line at content.json's real chances.
import { readFileSync } from 'node:fs';
import { createBrain } from '../../../../src/invitation/brain.js';
import { createBody, bodyStep } from '../../../../src/invitation/play.js';
import { createTalk, linesFrom, speechFrom } from '../../../../src/invitation/speech.js';
import { createRng } from '../../../../src/invitation/rng.js';
import { CLIPS } from '../../../../src/invitation/clips.js';

const content = JSON.parse(readFileSync(new URL('../../../../src/content.json', import.meta.url), 'utf8'));
const LINES = linesFrom(content.invitation.lines);
const SPEECH = content.invitation.speech;

/** His collar over his root, world units (he is about 1.0 tall, clips.js SCALE). */
const COLLAR_Y = 0.78;
const DT = 1 / 60;
const BOUNDS = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
const CAMERA = { x: 0, z: 6 };

/**
 * One drop. `stage4` s: the grab, then `lift` world units over `rise` s; `strike` s: the release
 * with `toss` as the velocity; `until`: the end.
 */
// eslint-disable-next-line complexity -- (a spike's one loop, kept in one place to read)
function run({
  seed = 1,
  speech = SPEECH,
  stage4 = 2,
  strike = 5.75,
  lift = 0.6,
  rise = 0.5,
  toss = { x: 0.4, y: 1.2, z: 0 },
  until = 9,
  log = false,
}) {
  const brain = createBrain({ seed, bounds: BOUNDS, middle: { x: 0, z: 0 } });
  const body = createBody({ x: 0, z: 0, yaw: 0 });
  const talk = createTalk({ lines: LINES, speech: speechFrom(speech), rng: createRng(seed + 2) });
  let out = null;
  let heard = null;
  let clip = null;
  let clipT0 = 0;
  let collar0 = null;
  let maxY = 0;
  const said = [];
  const states = [];
  for (let t = 0; t <= until + 1e-9; t += DT) {
    /** @type {any[]} */
    const events = [];
    const grabNow = t >= stage4 && t - DT < stage4;
    const releaseNow = t >= strike && t - DT < strike;
    const at = { x: 0, y: 0 };
    if (grabNow) events.push({ type: 'grab', on: 'newt', ...at, t });
    if (releaseNow) events.push({ type: 'release', on: 'newt', ...at, t });
    const playing = out && out.clip !== 'gait' ? out.clip : null;
    const time = playing ? t - clipT0 : 0;
    out = brain.step({
      t,
      dt: DT,
      events,
      button: null,
      pointer: null,
      newt: { x: body.root.x, z: body.root.z, yaw: body.body.yaw, grounded: body.grounded },
      clip: playing ? { name: playing, time, remaining: (CLIPS[playing]?.length ?? 1) - time } : null,
      carry: null,
      camera: CAMERA,
    });
    if (out.clip !== clip || out.restart) {
      clip = out.clip;
      clipT0 = t;
    }
    // The hold's target: his collar where he was grabbed, lifted `lift` over `rise` s.
    const collarNow = { x: body.root.x, y: body.root.y + COLLAR_Y, z: body.root.z };
    if (out.state === 'held' && !collar0) collar0 = collarNow;
    if (out.state !== 'held') collar0 = null;
    const k = collar0 ? Math.min(1, (t - stage4) / rise) : 0;
    const target = collar0 ? { x: collar0.x, y: collar0.y + lift * k, z: collar0.z } : null;
    bodyStep(body, {
      state: out.state,
      move: out.move,
      pointer: null,
      bounds: BOUNDS,
      dt: DT,
      t,
      collar: collarNow,
      target,
      footOffset: 0,
      released: releaseNow ? toss : null,
    });
    // (Held: the root hangs from the hold's anchor, as main.js moves it by anchor − collar.)
    if (body.mode === 'held' && body.carry)
      body.root = { x: body.carry.anchor.x, y: body.carry.anchor.y - COLLAR_Y, z: body.carry.anchor.z };
    maxY = Math.max(maxY, body.root.y);
    if (states.at(-1)?.state !== out.state) {
      states.push({ t: +t.toFixed(3), state: out.state, y: +body.root.y.toFixed(3) });
      if (log)
        console.log(
          `${t.toFixed(2).padStart(5)} s  ${out.state.padEnd(8)} root.y ${body.root.y.toFixed(2)}  clip ${out.clip}`,
        );
    }
    const line = talk.step({
      t,
      dt: DT,
      state: out,
      prevState: heard,
      events,
      button: null,
      camera: { yaw: 0, zoom: 1 },
    });
    heard = out;
    if (line.say) {
      said.push({ t: +t.toFixed(3), trigger: line.trigger ?? '?', say: line.say });
      if (log) console.log(`${t.toFixed(2).padStart(5)} s    says (${line.trigger ?? '?'}): "${line.say}"`);
    }
  }
  return { said, states, maxY, landed: body.landing };
}

const always = Object.fromEntries(
  Object.entries(SPEECH).map(([k, v]) => [k, typeof v === 'object' ? { chance: 1, cooldown: 0 } : 0]),
);

console.log('— One drop, every chance 1: grab at 2.00 s (build stage 4), release at 5.75 s (the strike) —');
const one = run({ speech: always, log: true });
console.log(
  `highest root ${one.maxY.toFixed(2)} (lifted ${one.maxY.toFixed(2)} off the floor); landing ${one.landed ? `at ${one.landed.t.toFixed(2)} s, speed ${one.landed.speed.toFixed(2)}` : 'none'}`,
);

console.log('\n— The same drop with the release a frame after the grab (the old plan) —');
const quick = run({ speech: always, strike: 2 + DT * 1.5, log: true });
console.log(`lines: ${quick.said.map((s) => s.trigger).join(', ') || 'none'}`);

console.log("\n— 2000 drops at content.json's chances (seeds 1..2000) —");
const N = 2000;
const count = { pickedUp: 0, dropped: 0, landed: 0, both: 0, none: 0, fellAndLanded: 0 };
for (let seed = 1; seed <= N; seed++) {
  const r = run({ seed });
  const tr = new Set(r.said.map((s) => s.trigger));
  for (const k of ['pickedUp', 'dropped', 'landed']) if (tr.has(k)) count[k]++;
  if (tr.has('dropped') && tr.has('landed')) count.both++;
  if (![...tr].some((k) => ['pickedUp', 'dropped', 'landed'].includes(k))) count.none++;
  if (r.states.some((s) => s.state === 'fall') && r.states.some((s) => s.state === 'land')) count.fellAndLanded++;
}
const pc = (n) => `${((100 * n) / N).toFixed(1)} %`;
console.log(`held → fall → land in ${pc(count.fellAndLanded)} of drops`);
console.log(
  `pickedUp at the lift: ${pc(count.pickedUp)}; dropped at the strike: ${pc(count.dropped)}; landed: ${pc(count.landed)}; dropped and landed both: ${pc(count.both)}; no line at all: ${pc(count.none)}`,
);

console.log('\n— Hold length (stage 4 to the strike) against the lines, 2000 drops each at the real chances —');
for (const hold of [0.9, 1.9, 3.75, 7.5]) {
  const c = { pickedUp: 0, thrash: 0, drop: 0, none: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const r = run({ seed, strike: 2 + hold, until: 2 + hold + 4 });
    const tr = new Set(r.said.map((s) => s.trigger));
    if (tr.has('pickedUp')) c.pickedUp++;
    if (tr.has('thrash')) c.thrash++;
    if (tr.has('dropped') || tr.has('landed')) c.drop++;
    if (![...tr].some((k) => ['pickedUp', 'thrash', 'dropped', 'landed'].includes(k))) c.none++;
  }
  console.log(
    `hold ${hold.toFixed(2)} s (${(hold / (60 / 128) / 4).toFixed(1)} bars at 128 BPM): pickedUp ${pc(c.pickedUp)}, thrash ${pc(c.thrash)}, dropped or landed ${pc(c.drop)}, none of them ${pc(c.none)}`,
  );
}
