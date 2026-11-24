// Camera hook regressions: unchanged Bonfire poses, first frames, transitions and rigs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, SHOTS } from '../src/visualizer/camera.js';
import { seeded } from './lib/fakeScene.mjs';
const tick = (c) => c.update(1 / 60, { period: 0.5, punch: 0, holding: false, build: 0, breath: 0 });
function setup(shot, frameShot, transition = 'cut') {
  const poses = [];
  return {
    poses,
    c: createCamera(
      { blade: null, frameShot, setPose: (p) => poses.push(structuredClone(p)) },
      { shot, camera: 'drift', transition },
    ),
  };
}
test('optional framing leaves all Bonfire shots identical over 64 bars [slow]', () => {
  const random = Math.random;
  try {
    for (const key of Object.keys(SHOTS)) {
      Math.random = seeded(123);
      const a = setup(key);
      for (let i = 0; i < 7680; i++) tick(a.c);
      let calls = 0;
      Math.random = seeded(123);
      const b = setup(key, () => {
        calls++;
      });
      for (let i = 0; i < 7680; i++) tick(b.c);
      assert.deepEqual(a.poses, b.poses);
      assert.equal(calls, 7680);
    }
  } finally {
    Math.random = random;
  }
});
test('hook frames initial and setShot poses on their first frame', () => {
  const hook = (o) => {
    o.pos.x += 2;
    o.target.x += 2;
  };
  const a = setup('clearing', hook);
  tick(a.c);
  assert.equal(a.poses.at(-1).target[0], 2);
  a.c.setShot('low');
  tick(a.c);
  assert.equal(a.poses.at(-1).target[0], 2);
});
test('glides blend framed targets continuously and rigs bypass the hook', () => {
  let calls = 0;
  const a = setup(
    'clearing',
    (o, k) => {
      calls++;
      o.target.x = k === 'low' ? 2 : 0;
      o.pos.x += o.target.x;
    },
    'glide',
  );
  tick(a.c);
  assert.equal(a.poses.at(-1).target[0], 0);
  a.c.cut('low');
  for (let i = 0; i < 180; i++) tick(a.c);
  assert.equal(a.poses.at(-1).target[0], 2);
  for (let i = 1; i < a.poses.length; i++)
    assert.ok(Math.hypot(...a.poses[i].target.map((v, j) => v - a.poses[i - 1].target[j])) < 0.2);
  for (const rig of ['follow', 'ride', 'track', 'orbit', 'vertigo', 'dancer']) {
    a.c.cut(rig);
    const before = calls;
    for (let i = 0; i < 120; i++) tick(a.c);
    assert.equal(calls, before, rig);
  }
});
