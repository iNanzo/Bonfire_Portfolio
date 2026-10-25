// NEWT's earrings (src/invitation/earrings.js, hung by character.js) with three.js in Node, on
// the stand-in skeleton (test/lib/newtStandIn.mjs) and, for where they hang, newt.glb's own head
// mesh. On each earlobe, against the skin at its lowest edge, a black stud, and a Latin cross
// hanging from it on a chain: the stud and the cross are camera-facing pixel sprites (their art
// nearest-filtered, a whole number of texels to an art pixel, about the cross's size in the
// world; each anchored on a texel's centre, after his head's texel snap), the chain a one-texel
// line, all marked as his trim (no outline round them). The cross's art: one-pixel bars, square
// ends, a Latin cross. Each chain hangs straight down from its stud and swings back against his
// head's acceleration (the limp spring), then settles. At the coarse Pixel Sizes the cross takes
// smaller art (five, then three pixels tall), never drawn over half as big again as it is in the
// world, and under that it isn't drawn at all (stud, chain and cross).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter, EARLOBES, EARRING } from '../src/invitation/character.js';
import {
  ART_HOLD,
  CROSS_ART,
  EAR_ARTS,
  MAX_SCALE,
  SCALE_HOLD,
  STUD_ART,
  artTexture,
  earArt,
  earScale,
  spriteShift,
} from '../src/invitation/earrings.js';
import { frameView, newtTexels, texelGrid } from '../src/invitation/pixels.js';
import { ID } from '../src/invitation/retro.js';
import { BONES } from '../src/invitation/clips.js';
import { standIn } from './lib/newtStandIn.mjs';
import { readGlbAnim, skinnedMesh } from './lib/glbAnim.mjs';

const DT = 1 / 60;
const DOWN = new THREE.Vector3(0, -1, 0);
/** The angle between two rotations, radians (from the chord, so tiny angles hold up). */
function angle(a, b) {
  const u = a.clone().normalize();
  const v = b.clone().normalize();
  const d = (s) => Math.hypot(u.x - s * v.x, u.y - s * v.y, u.z - s * v.z, u.w - s * v.w);
  return 4 * Math.asin(Math.min(1, Math.min(d(1), d(-1)) / 2));
}
/**
 * The stand-in with its bones' axes turned from his model's as newt.glb's are (its hips turned a
 * quarter round about Y, everything under them where it was).
 */
function turnedStandIn() {
  const s = standIn();
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const back = turn.clone().invert();
  const hips = s.bones[BONES.hips];
  hips.quaternion.copy(turn);
  hips.traverse((b) => b !== hips && b.isBone && b.position.applyQuaternion(back));
  return s;
}

test('the cross’s art: a Latin cross of one-pixel bars with square ends (its arms two pixels each side, its top two over them, its foot four under); the stud two pixels square', () => {
  const n = CROSS_ART.length;
  assert.equal(n, 7);
  for (const row of CROSS_ART) assert.equal(row.length, n, 'square');
  const lit = CROSS_ART.map((row) => [...row].flatMap((c, x) => (c === '#' ? [x] : [])));
  const arm = lit.findIndex((xs) => xs.length > 1);
  assert.equal(arm, 2, 'the arms on the third row');
  assert.deepEqual(lit[arm], [1, 2, 3, 4, 5], 'one row thick, two pixels each side, square ends');
  lit.forEach((xs, y) => {
    if (y !== arm) assert.deepEqual(xs, [3], `row ${y}: one pixel, in the middle column`);
  });
  assert.ok(arm < n - 1 - arm, 'a Latin cross: its top shorter than its foot');
  assert.deepEqual([...STUD_ART], ['##', '##']);
  // As a texture: nearest-filtered, no mips, its rows bottom up.
  const t = artTexture(CROSS_ART);
  assert.equal(t.magFilter, THREE.NearestFilter);
  assert.equal(t.minFilter, THREE.NearestFilter);
  assert.equal(t.generateMipmaps, false);
  const alpha = (x, y) => t.image.data[((n - 1 - y) * n + x) * 4 + 3];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) assert.equal(alpha(x, y), CROSS_ART[y][x] === '#' ? 255 : 0, `${x},${y}`);
});

test('the art’s scale: a whole number of texels to a pixel, about the cross’s size in the world, never under 1 (crisp at 96 and 128), held near a step so it never flickers', () => {
  assert.equal(earScale(0), 1);
  assert.equal(earScale(4.5), 1, '96: a little bigger than the world’s, still one texel lines');
  assert.equal(earScale(6), 1, '128');
  assert.equal(earScale(14), 2, 'Native on a desktop');
  assert.equal(earScale(21), 3);
  assert.equal(earScale(1e4), MAX_SCALE);
  assert.equal(earScale(Number.NaN), 1);
  // Held: near 1.5 it keeps what it had.
  assert.equal(earScale(7 * 1.6, 1), 1);
  assert.equal(earScale(7 * 1.6, 0), 2);
  assert.equal(earScale(7 * (1 + SCALE_HOLD + 0.01), 1), 2);
  assert.equal(earScale(7 * 1.4, 2), 2);
  assert.equal(earScale(7 * (2 - SCALE_HOLD - 0.01), 2), 1);
});

test('the smaller crosses: five pixels tall (arms one each side, top one, foot three), then three (a plus), each square, its top pixel in the column the chain meets; with them a one-pixel stud', () => {
  const [big, small, tiny] = EAR_ARTS;
  assert.equal(big.cross, CROSS_ART);
  assert.equal(big.stud, STUD_ART);
  assert.deepEqual(small.cross, ['..#..', '.###.', '..#..', '..#..', '..#..']);
  assert.deepEqual(tiny.cross, ['.#.', '###', '.#.']);
  for (const a of [small, tiny]) {
    assert.deepEqual(a.stud, ['#']);
    for (const row of a.cross) assert.equal(row.length, a.cross.length, 'square');
    // (The chain meets the top pixel: spriteShift 'top' puts an odd sprite's middle column under it.)
    assert.equal(a.cross[0].indexOf('#'), (a.cross.length - 1) / 2);
  }
  assert.ok(big.from > small.from && small.from > tiny.from, 'biggest first');
});

test('which art for the cross’s size in the world: never drawn over 1.5 times as tall, hidden under the smallest’s step, and held near a step so it never flickers', () => {
  /** Drawn texels tall for a cross `texels` tall in the world (0: hidden). */
  const drawn = (texels) => {
    const a = earArt(texels);
    return a < 0 ? 0 : a === 0 ? CROSS_ART.length * earScale(texels) : EAR_ARTS[a].cross.length;
  };
  for (let h = 0; h <= 10; h += 0.01) {
    const d = drawn(h);
    assert.ok(d === 0 || d <= 1.5 * h + 1e-9, `${h.toFixed(2)} texels: drawn ${d}`);
    if (h >= EAR_ARTS.at(-1).from) assert.ok(d > 0, `${h.toFixed(2)} texels: shown`);
  }
  assert.equal(earArt(0), -1);
  assert.equal(earArt(Number.NaN), -1);
  assert.equal(earArt(1.26), -1, 'Pixel Size 16: hidden');
  assert.equal(earArt(2.5), 2, 'Pixel Size 32: the plus');
  assert.equal(earArt(4.2), 1, 'Pixel Size 48: five tall');
  assert.equal(earArt(6.3), 0, 'Pixel Size 64 on a desktop: the whole cross');
  // (Held near a step: kept a little past it either way, and the kept one still within 1.5 times.)
  for (let a = 0; a < EAR_ARTS.length; a++) {
    const lo = EAR_ARTS[a].from;
    assert.equal(earArt(lo - ART_HOLD + 0.01, a), a, `art ${a} kept just under its step`);
    assert.equal(earArt(lo - ART_HOLD - 0.01, a), a + 1 < EAR_ARTS.length ? a + 1 : -1, `art ${a} left under it`);
    assert.ok(EAR_ARTS[a].cross.length <= 1.5 * (lo - ART_HOLD) + 1e-9, `art ${a} kept within 1.5 times`);
    if (a > 0) {
      const up = EAR_ARTS[a - 1].from;
      assert.equal(earArt(up + ART_HOLD - 0.01, a), a, `art ${a} kept just over the next one’s step`);
      assert.equal(earArt(up + ART_HOLD + 0.01, a), a - 1);
    }
  }
  assert.equal(earArt(EAR_ARTS.at(-1).from + ART_HOLD - 0.01, -1), -1, 'hidden kept just over its step');
});

test('a sprite covers whole texels from the texel its anchor snaps to: odd sizes centred on a texel, even ones on an edge; the cross’s top along the anchor texel’s top, its middle column over it', () => {
  // The texels a sprite `size` across covers along an axis, centred at c (texel centres at k + 0.5).
  const span = (c, size) => [c - size / 2, c + size / 2];
  for (const size of [2, 4, 6, 7, 14, 21, 28]) {
    for (const at of /** @type {const} */ (['centre', 'top'])) {
      const s = spriteShift(size, at);
      const [x0, x1] = span(0.5 + s.x, size);
      const [y0, y1] = span(0.5 + s.y, size);
      for (const v of [x0, x1, y0, y1])
        assert.ok(Math.abs(v - Math.round(v)) < 1e-9, `${size} ${at}: on texel edges (${v})`);
      assert.ok(x0 <= 0 && x1 >= 1, `${size} ${at}: over the anchor’s column`);
      if (at === 'top') assert.equal(y1, 1, `${size}: its top along the anchor texel’s top`);
      else assert.ok(y0 <= 0 && y1 >= 1, `${size}: over the anchor`);
    }
  }
  // The cross's middle column (its bar) over the anchor at every scale.
  for (let k = 1; k <= MAX_SCALE; k++) {
    const size = CROSS_ART.length * k;
    const left = 0.5 + spriteShift(size, 'top').x - size / 2;
    const [b0, b1] = [left + 3 * k, left + 4 * k];
    assert.ok(b0 <= 0 && b1 >= 1, `scale ${k}: the bar [${b0}, ${b1}] over the anchor`);
  }
});

test('his earrings: on his head bone at each earlobe, a stud and a cross as pixel sprites and a one-texel chain, black, marked as his trim, snapped with his head', () => {
  for (const make of [standIn, turnedStandIn]) {
    const { gltf, bones } = make();
    const ch = createCharacter(gltf);
    assert.equal(ch.earrings.length, 2);
    ch.root.updateMatrixWorld(true);
    for (const e of ch.earrings) {
      assert.equal(e.group.parent, bones[BONES.head], `${e.side}: on his head bone`);
      // (EARLOBES are from his head bone's head in his model's axes, model units.)
      const at = ch.root.worldToLocal(e.group.getWorldPosition(new THREE.Vector3()));
      const from = ch.root.worldToLocal(bones[BONES.head].getWorldPosition(new THREE.Vector3()));
      at.sub(from)
        .toArray()
        .forEach((x, k) => assert.ok(Math.abs(x - EARLOBES[e.side][k]) < 1e-6, `${e.side}: at the earlobe`));
      assert.ok(e.stud.isPoints && e.cross.isPoints, 'sprites');
      assert.ok(e.line.isLineSegments, 'a line');
      // The chain: from the stud (the pivot, at the lobe) down EARRING.line to the cross.
      const p = e.line.geometry.getAttribute('position');
      assert.deepEqual(
        [p.getX(0), p.getY(0), p.getZ(0), p.getX(1), p.getY(1), p.getZ(1)],
        [0, 0, 0, 0, Math.fround(-EARRING.line), 0],
      );
      assert.equal(e.cross.parent, e.pivot);
      assert.equal(e.cross.position.y, -EARRING.line, 'the cross at its end');
      for (const part of [e.stud, e.line, e.cross]) {
        const u = part.material.uniforms;
        const c = u.uColor.value;
        assert.ok(c.r + c.g + c.b < 0.1, `${part.name}: black`);
        assert.equal(u.uSurfaceId.value, ID.trim / 16, `${part.name}: his trim`);
        assert.equal(u.uTexelSnap.value, ch.texelSnap.head, `${part.name}: snapped with his head`);
        assert.equal(part.castShadow, false);
        assert.equal(typeof part.onBeforeRender, 'function', `${part.name}: fitted to the frame’s texels`);
      }
      assert.equal(e.stud.material.uniforms.uArt.value.image.width, STUD_ART.length);
      assert.equal(e.cross.material.uniforms.uArt.value.image.width, CROSS_ART.length);
    }
  }
});

test('drawn, each sprite takes the frame’s texel grid and its scale: one texel to a pixel with a small cross, more when it’s big on screen', () => {
  const { gltf } = standIn();
  const ch = createCharacter(gltf);
  ch.root.updateMatrixWorld(true);
  const e = ch.earrings[0];
  const lobe = e.group.getWorldPosition(new THREE.Vector3());
  const draw = (texelsTall, dist) => {
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.copy(lobe).add(new THREE.Vector3(0, 0, dist));
    camera.lookAt(lobe);
    camera.updateMatrixWorld(true);
    const renderer = { getCurrentViewport: (v) => v.set(0, 0, texelsTall * 0.6, texelsTall) };
    for (const o of [e.stud, e.line, e.cross]) o.onBeforeRender(renderer, null, camera);
    return e;
  };
  // (The cross's height in texels: EARRING.cross.h, scaled with him, over the view's height there.)
  const tall = (texels, dist) =>
    (EARRING.cross.h * ch.root.scale.y * texels) / (2 * dist * Math.tan((15 * Math.PI) / 180));
  // (Far enough that the cross is six texels tall: the whole cross, one texel to a pixel.)
  const far = (EARRING.cross.h * ch.root.scale.y * 128) / (2 * 6 * Math.tan((15 * Math.PI) / 180));
  draw(128, far);
  assert.ok(Math.abs(tall(128, far) - 6) < 1e-9);
  assert.equal(e.scale, earScale(tall(128, far)));
  assert.equal(e.scale, 1);
  assert.deepEqual(e.stud.material.uniforms.uRes.value.toArray(), [128 * 0.6, 128]);
  assert.equal(e.cross.material.uniforms.uSize.value, CROSS_ART.length);
  assert.equal(e.stud.material.uniforms.uSize.value, STUD_ART.length);
  // (The stud lifted toward the camera for its depth test, so the lobe never half hides it.)
  assert.ok(Math.abs(e.stud.material.uniforms.uLift.value - EARRING.studLift * ch.root.scale.y) < 1e-9);
  assert.equal(e.cross.material.uniforms.uLift.value, 0);
  const near = (EARRING.cross.h * ch.root.scale.y * 1000) / (2 * 21 * Math.tan((15 * Math.PI) / 180));
  draw(1000, near);
  assert.equal(e.scale, 3);
  assert.equal(e.cross.material.uniforms.uSize.value, 3 * CROSS_ART.length);
  const s = spriteShift(3 * CROSS_ART.length, 'top');
  assert.deepEqual(e.cross.material.uniforms.uShift.value.toArray(), [s.x, s.y]);
});

/**
 * One earring drawn in the toy's own default framing at a Pixel Size (pixels.js texelGrid and
 * frameView): the cross's height in the world, and as drawn (0: hidden), in texels.
 */
function drawnAt(screen, pixelSize) {
  const { gltf } = standIn();
  const ch = createCharacter(gltf);
  ch.root.updateMatrixWorld(true);
  const grid = texelGrid({ ...screen, pixelSize });
  const view = frameView({
    cssW: screen.cssW,
    cssH: screen.cssH,
    grid,
    insets: { top: 0, right: 0, bottom: 64, left: 0 },
  });
  const camera = new THREE.PerspectiveCamera(view.fov, view.aspect, view.near, view.far);
  camera.position.set(view.position.x, view.position.y, view.position.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const renderer = { getCurrentViewport: (v) => v.set(0, 0, grid.w, grid.h) };
  const e = ch.earrings[0];
  for (const o of [e.stud, e.line, e.cross]) o.onBeforeRender(renderer, null, camera);
  const at = e.group.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
  const perUnit = (camera.projectionMatrix.elements[5] * grid.h) / 2 / -at.z;
  const world = EARRING.cross.h * e.group.getWorldScale(new THREE.Vector3()).y * perUnit;
  const on = [e.stud, e.line, e.cross].map((o) => o.material.uniforms.uOn.value);
  return { newt: newtTexels(view, grid), world, drawn: e.cross.material.uniforms.uSize.value, on, e };
}

for (const screen of [
  { name: 'a desktop, 1280×800', cssW: 1280, cssH: 800, dpr: 1 },
  { name: 'a phone, 390×844 at 3×', cssW: 390, cssH: 844, dpr: 3 },
]) {
  test(`on ${screen.name}, at every coarse Pixel Size the cross is drawn at most 1.5 times its size in the world, or not at all (stud and chain too); from 32 up it shows`, () => {
    for (const p of ['16', '24', '32', '48', '64']) {
      const r = drawnAt(screen, p);
      const where = `Pixel Size ${p}: drawn ${r.drawn} texels vs ${r.world.toFixed(2)} in the world (his ${r.newt.toFixed(1)})`;
      assert.ok(r.drawn === 0 || r.drawn <= 1.5 * r.world, where);
      if (r.drawn === 0) assert.deepEqual(r.on, [0, 0, 0], `${where}: stud and chain hidden with it`);
      else assert.deepEqual(r.on, [1, 1, 1], where);
      if (Number(p) >= 32) assert.ok(r.drawn > 0, `${where}: shown`);
      // (The stud with it: never bigger than the cross's art allows.)
      if (r.drawn) assert.ok(r.e.stud.material.uniforms.uSize.value <= Math.max(1, (2 / 7) * r.drawn + 1e-9), where);
    }
  });
}

test('his earrings sit on his earlobes as newt.glb’s head mesh has them: at the lobe’s lowest edge, against its skin, on its outside', () => {
  const glb = readGlbAnim(new URL('../public/models/newt.glb', import.meta.url));
  const pose = new Map();
  const head = glb.worldPos(pose, 'Neck.001');
  const verts = skinnedMesh(glb, 'Head').at(pose);
  for (const [side, sign] of /** @type {const} */ ([
    ['L', 1],
    ['R', -1],
  ])) {
    // His ear: the head mesh out past his hair at that side; its lobe's bottom edge, between its
    // two lowest corners.
    const ear = verts.filter((p) => sign * p[0] > 1.25).sort((a, b) => a[1] - b[1]);
    assert.ok(ear.length > 10, `${side}: an ear`);
    const a = ear[0];
    const b = ear.find((p) => Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]) > 0.02);
    const at = EARLOBES[side].map((v, k) => v + head[k]);
    const ab = [0, 1, 2].map((k) => b[k] - a[k]);
    const u = Math.max(
      0,
      Math.min(1, [0, 1, 2].reduce((s, k) => s + (at[k] - a[k]) * ab[k], 0) / ab.reduce((s, v) => s + v * v, 0)),
    );
    const near = [0, 1, 2].map((k) => a[k] + ab[k] * u);
    const gap = Math.hypot(...[0, 1, 2].map((k) => at[k] - near[k]));
    assert.ok(gap < 0.03, `${side}: ${gap.toFixed(3)} from the lobe’s bottom edge (against its skin)`);
    assert.ok(at[1] >= a[1] - 0.005 && at[1] <= a[1] + 0.03, `${side}: at the lobe’s lowest (y ${at[1]} by ${a[1]})`);
    assert.ok(sign * at[0] >= sign * near[0] - 0.005, `${side}: on its outside`);
  }
});

test('each earring hangs straight down from its stud, swings back against his head’s acceleration and settles, whichever way he faces', () => {
  for (const make of [standIn, turnedStandIn]) {
    const { gltf } = make();
    const ch = createCharacter(gltf);
    const hang = (e) => {
      const top = e.pivot.getWorldPosition(new THREE.Vector3());
      const end = e.cross.getWorldPosition(new THREE.Vector3());
      return end.sub(top).normalize();
    };
    const frame = () => {
      ch.update(DT);
      ch.root.updateMatrixWorld(true);
      ch.accessories(DT, 0);
      ch.root.updateMatrixWorld(true);
    };
    for (const yaw of [0, 1.2, -2.5]) {
      ch.root.rotation.y = yaw;
      ch.root.position.set(0, 0, 0);
      for (let i = 0; i < 240; i++) frame();
      for (const e of ch.earrings) assert.ok(hang(e).angleTo(DOWN) < 0.02, `yaw ${yaw}: ${e.side} hangs straight down`);
    }
    // His head jerked along +z: they swing back (−z), then settle again.
    let v = 0;
    for (let i = 0; i < 12; i++) {
      v += 15 * DT;
      ch.root.position.z += v * DT;
      frame();
    }
    for (const e of ch.earrings) assert.ok(hang(e).z < -0.1, `${e.side} swings back: ${hang(e).z}`);
    for (let i = 0; i < 300; i++) frame();
    for (const e of ch.earrings) assert.ok(hang(e).angleTo(DOWN) < 0.02, `${e.side} settled`);
    // A frame his pose didn't step (Motion Choppy): they don't move.
    const was = ch.earrings.map((e) => e.pivot.quaternion.clone());
    ch.root.position.x += 0.5;
    ch.root.updateMatrixWorld(true);
    ch.accessories(0, 0);
    ch.earrings.forEach((e, k) => assert.ok(angle(e.pivot.quaternion, was[k]) < 1e-6));
  }
});
