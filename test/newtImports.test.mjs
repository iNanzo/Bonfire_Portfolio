import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const invitation = new Set(
  [
    'area',
    'blend',
    'body',
    'brain',
    'bubble',
    'carry',
    'character',
    'clips',
    'content',
    'cues',
    'envelope',
    'envelopeActor',
    'envelopeLook',
    'envelopeSeal',
    'face',
    'faceSheets',
    'floor',
    'look',
    'lookAt',
    'petalScene',
    'petals',
    'play',
    'rng',
    'speech',
  ].map((n) => `src/invitation/${n}.js`),
);
const bonfire = new Set(
  [
    'frame',
    'pixelPass',
    'view',
    'frameGate',
    'passWrites',
    'frameLoop',
    'resources',
    'sceneRender',
    'sceneUpdate',
    'stillFx',
    'impact',
    'flame',
    'curl',
    'lightningRing',
    'ice',
    'marks',
    'debris',
    'chill',
    'fireflies',
    'fireflyShow',
    'fireflyMoves',
    'field',
    'particles',
    'points',
    'knightPose',
    'knightRig',
    'knightSolve',
  ].map((n) => `src/bonfire/${n}.js`),
);
const shared = new Set([
  'src/effects.js',
  'src/effectsDefaults.js',
  'src/palette.js',
  'src/paletteGen.js',
  'src/math.js',
  'src/pixelSizes.js',
  'src/visualizer/camera.js',
  'src/visualizer/clearing.js',
  'src/visualizer/bars.js',
  'src/visualizer/looks.js',
  'src/ui/perfOverlay.js',
]);
const pure = new Set(['fireDuck.js', 'newtMoments.js', 'pages.js', 'newtDance.js']);
const imports = (code) =>
  [
    ...code.matchAll(
      /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g,
    ),
  ].map((m) => ({ spec: m[1] ?? m[2] ?? m[3], dynamic: !!m[3] }));
function violations(files) {
  const errors = [];
  for (const [file, code] of files)
    for (const { spec, dynamic } of imports(code)) {
      const to = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : spec;
      const own = file.startsWith('src/visualizer/newt/');
      if (own) {
        const allowed =
          to.startsWith('src/visualizer/newt/') ||
          invitation.has(to) ||
          bonfire.has(to) ||
          shared.has(to) ||
          spec === 'three' ||
          spec === 'three/examples/jsm/loaders/GLTFLoader.js';
        if (!allowed) errors.push(`${file}: forbidden import ${spec}`);
        if (to === 'src/invitation/content.js' && file !== 'src/visualizer/newt/world.js')
          errors.push(`${file}: content belongs in world.js`);
        if (pure.has(path.posix.basename(file)) && spec.startsWith('three'))
          errors.push(`${file}: pure module imports three`);
        if (to === 'src/visualizer/newt/fireflyModel.js' && !dynamic)
          errors.push(`${file}: firefly model must be lazy`);
      } else {
        if (
          !file.startsWith('src/invitation/') &&
          to.startsWith('src/invitation/') &&
          file !== 'src/contentRules.js' &&
          !(file === 'src/bonfire/bolts.js' && to === 'src/invitation/rng.js')
        )
          errors.push(`${file}: forbidden invitation crossing ${spec}`);
        if (to.startsWith('src/visualizer/newt/') && !(file === 'src/visualizer/main.js' && dynamic))
          errors.push(`${file}: world must be lazy from main.js`);
      }
    }
  return errors;
}
const files = new Map(
  readdirSync('src', { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.js'))
    .map((f) => {
      const name = path.join(f.parentPath, f.name).split(path.sep).join('/');
      return [name, readFileSync(name, 'utf8')];
    }),
);

test('NEWT imports only the planned modules and the invitation boundary has its mirror', () => {
  assert.ok(files.size > 100);
  assert.deepEqual(violations(files), []);
});
test('planted forbidden, reverse, eager and pure-module imports each fail the guard', () => {
  const plants = [
    ['src/visualizer/newt/world.js', "import '../../invitation/main.js';"],
    ['src/painter/main.js', "import '../invitation/rng.js';"],
    ['src/visualizer/main.js', "import './newt/world.js';"],
    ['src/visualizer/newt/newtMoments.js', "import * as THREE from 'three';"],
    ['src/visualizer/newt/newtMoments.js', "import '../../invitation/content.js';"],
    ['src/visualizer/newt/world.js', "import './fireflyModel.js';"],
    ['src/bonfire/bolts.js', "import '../invitation/character.js';"],
  ];
  for (const [file, code] of plants) {
    const planted = new Map(files);
    planted.set(file, `${planted.get(file) ?? ''}\n${code}`);
    assert.ok(violations(planted).length, `${file}: ${code} must fail`);
  }
  assert.deepEqual(violations(new Map([['src/visualizer/newt/world.js', "import('./fireflyModel.js');"]])), []);
});
