// The Live world's pure invitation brain, body and speech adapter; the caller supplies the collar and content.
import { createBrain } from '../../invitation/brain.js';
import { createBody, bodyStep } from '../../invitation/play.js';
import { createTalk } from '../../invitation/speech.js';
import { createRng } from '../../invitation/rng.js';
import { CLIPS } from '../../invitation/clips.js';
import { WANDER_BOUNDS } from './shots.js';

/** @param {{lines: import('../../invitation/speech.js').Lines, speech: import('../../invitation/speech.js').SpeechSettings, seed?:number}} options */
export function createNewtBrain({ lines, speech, seed = 87 }) {
  const bounds = WANDER_BOUNDS;
  const brain = createBrain({ seed, bounds, middle: { x: 0, z: 0 }, tune: { sitAfter: Infinity } });
  const body = createBody();
  const talk = createTalk({ lines, speech, rng: createRng(seed + 2) });
  let out = null,
    clipAt = 0,
    lastTalk = { say: null, trigger: null };
  const snapshot = () => ({
    state: out?.state ?? 'idle',
    clip: out?.clip ?? 'Idle',
    grounded: body.grounded,
    root: { ...body.root },
    talk: lastTalk,
    showing: !!talk.snapshot().showing,
  });
  return {
    body,
    get out() {
      return out;
    },
    snapshot,
    input(collar = { ...body.root, y: body.root.y + 0.78 }) {
      return { ...snapshot(), x: body.root.x, z: body.root.z, collar, showing: !!talk.snapshot().showing };
    },
    step({
      t,
      dt,
      moments,
      collar = { ...body.root, y: body.root.y + 0.78 },
      camera = { x: 0, z: 6 },
      clip = undefined,
      footOffset = 0,
    }) {
      const prev = out;
      const playing = out && out.clip !== 'gait' ? out.clip : null;
      const time = t - clipAt;
      out = brain.step({
        t,
        dt,
        events: moments.events ?? [],
        button: moments.button ?? null,
        pointer: null,
        newt: { x: body.root.x, z: body.root.z, yaw: body.body.yaw, grounded: body.grounded },
        clip:
          clip === undefined
            ? playing
              ? { name: playing, time, remaining: (CLIPS[playing]?.length ?? 1) - time }
              : null
            : clip,
        carry: null,
        camera,
      });
      if (out.clip !== prev?.clip || out.restart) clipAt = t;
      lastTalk = talk.step({
        t,
        dt,
        state: out,
        prevState: prev,
        events: moments.events ?? [],
        button: null,
        camera: { yaw: 0, zoom: 1 },
      });
      bodyStep(body, {
        state: out.state,
        move: out.move,
        pointer: null,
        bounds,
        dt,
        t,
        collar,
        target: moments.target,
        footOffset,
        released: moments.released,
      });
      if (body.mode === 'held' && body.carry) {
        body.root = {
          x: body.root.x + body.carry.anchor.x - collar.x,
          y: body.root.y + body.carry.anchor.y - collar.y,
          z: body.root.z + body.carry.anchor.z - collar.z,
        };
      }
      return snapshot();
    },
  };
}
