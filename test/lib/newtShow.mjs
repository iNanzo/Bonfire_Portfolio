// The same director -> hear -> step order as Live, on one controlled clock.
import { createDirector } from '../../src/visualizer/director.js';
import { createFireDuck } from '../../src/visualizer/newt/fireDuck.js';
import { FRAME, settingsWith, seeded } from './fakeScene.mjs';

export function newtShow(test, { reduced = false, ...over } = {}) {
  let time = 0;
  test.mock.method(performance, 'now', () => time * 1000);
  test.mock.method(Math, 'random', seeded(83));
  const settings = settingsWith({
    world: 'newt',
    page: 'dusk',
    pageTurns: 'drops',
    scenes: 'off',
    blackout: 'on',
    offset: 0,
    ...over,
  });
  const impacts = [],
    events = [];
  const duck = createFireDuck({ settings, reduced, onImpact: (...args) => impacts.push({ time, args }) });
  const director = createDirector(duck, {
    settings,
    scenes: () => [],
    reducedMotion: reduced,
    onEvent(type, data) {
      events.push({ time, type, data });
      duck.onEvent(type, data);
    },
  });
  const step = (f = {}, dt = 1 / 120) => {
    time += dt;
    const frame = { ...FRAME, time, locked: true, bpm: 120, ...f };
    director.update(frame, dt);
    duck.hear(frame);
    return duck.step(dt);
  };
  const advance = (seconds, f = {}) => {
    let picture;
    for (let i = 0; i < Math.round(seconds * 120); i++) picture = step(f);
    return picture;
  };
  test.after(() => {
    duck.dispose();
  });
  return {
    duck,
    director,
    impacts,
    events,
    step,
    advance,
    get time() {
      return time;
    },
  };
}
