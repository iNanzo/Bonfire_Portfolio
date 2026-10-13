// The invitation toy's play area (src/invitation/area.js): with the room gone, NEWT may go
// wherever the floor shows on screen, over the toolbar and inset from the screen's edges, and
// those edges are his walls (walking, wandering, fleeing, carrying). It's worked out from the
// camera (pixels.js frameView) for each screen and toolbar, so it's checked here by projecting
// its corners back onto the screen: his feet stay over the toolbar and clear of the sides, his
// head stays under the top margin, the area reaches those limits (it's the most there is), and
// a screen too small for him still gives a spot to stand on, never NaN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEWT_HEIGHT, NEWT_RADIUS, playArea } from '../src/invitation/area.js';
import { DEFAULT_PIXEL, frameView, project, texelGrid } from '../src/invitation/pixels.js';
import { DEFAULT_LOOK, LOOKS } from '../src/invitation/look.js';

const SIZES = [
  [390, 844, 3],
  [412, 915, 2.625],
  [1280, 800, 1],
];
/** Where he must stay: under a top margin, over the toolbar, 24 px clear of the side edges. */
const INSETS = { top: 16, bottom: 72, left: 24, right: 24 };
const preset = LOOKS[DEFAULT_LOOK.style];

/** The camera for a screen, as the stage frames it. */
function viewFor(cssW, cssH, dpr, insets = INSETS) {
  const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize, texels: preset.texels });
  return frameView({ cssW, cssH, dpr, grid, insets, texels: preset.texels[DEFAULT_PIXEL] });
}

test('the play area is the floor on screen over the toolbar, inset from the edges, at 390x844@3, 412x915@2.625 and 1280x800@1', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const view = viewFor(cssW, cssH, dpr);
    const b = playArea(view, { cssW, cssH, insets: INSETS });
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) assert.ok(Number.isFinite(b[k]), `${at}: ${k} is ${b[k]}`);
    const r = NEWT_RADIUS;
    // His feet at the front corners, his body's edge included, stay over the toolbar and clear
    // of the sides; so does his head there (it leans out further on screen than his feet).
    for (const x of [b.minX, b.maxX]) {
      const side = Math.sign(x) || 1;
      for (const y of [0, NEWT_HEIGHT]) {
        const p = project(view, { x: x + side * r, y, z: b.maxZ });
        assert.ok(p.x >= INSETS.left - 0.5 && p.x <= cssW - INSETS.right + 0.5, `${at}: front corner x ${p.x}`);
      }
      const toes = project(view, { x, y: 0, z: b.maxZ + r });
      assert.ok(toes.y <= cssH - INSETS.bottom + 0.5, `${at}: his toes (${toes.y}) stay over the toolbar`);
    }
    // At the back, his head stays under the top margin.
    const head = project(view, { x: 0, y: NEWT_HEIGHT, z: b.minZ - r });
    assert.ok(head.y >= INSETS.top - 0.5, `${at}: his head at the back (${head.y}) stays on screen`);
    // The area reaches those limits: it's all the floor there is.
    const front = project(view, { x: 0, y: 0, z: b.maxZ + r });
    assert.ok(Math.abs(front.y - (cssH - INSETS.bottom)) < 1.5, `${at}: the front edge (${front.y}) is the toolbar's`);
    assert.ok(Math.abs(head.y - INSETS.top) < 1.5, `${at}: the back edge (${head.y}) is the top margin's`);
    const right = project(view, { x: b.maxX + r, y: NEWT_HEIGHT, z: b.maxZ });
    assert.ok(Math.abs(right.x - (cssW - INSETS.right)) < 1.5, `${at}: the right edge (${right.x}) is the margin's`);
    // Room to play: NEWT starts in it, and it's several of him wide and deep.
    assert.ok(b.minX < 0 && b.maxX > 0 && b.minZ < 0 && b.maxZ > 0, `${at}: he starts inside it`);
    assert.ok(b.maxX - b.minX >= 3, `${at}: ${(b.maxX - b.minX).toFixed(2)} wide`);
    assert.ok(b.maxZ - b.minZ >= 4, `${at}: ${(b.maxZ - b.minZ).toFixed(2)} deep`);
  }
});

test('the play area follows the toolbar and the safe areas: a taller toolbar brings the front edge back', () => {
  const [cssW, cssH, dpr] = SIZES[0];
  const view = viewFor(cssW, cssH, dpr);
  const low = playArea(view, { cssW, cssH, insets: INSETS });
  const tall = playArea(view, { cssW, cssH, insets: { ...INSETS, bottom: 160 } });
  assert.ok(tall.maxZ < low.maxZ - 0.5, `front ${tall.maxZ} < ${low.maxZ}`);
  assert.equal(tall.minZ, low.minZ, 'the back edge stays');
  const notch = playArea(view, { cssW, cssH, insets: { ...INSETS, left: 70 } });
  assert.ok(
    notch.minX > low.minX + 0.3 && Math.abs(notch.maxX - low.maxX) < 1e-9,
    'a wider left inset moves only the left edge',
  );
});

test('a screen too small for him still gives a spot to stand on, never NaN', () => {
  const view = viewFor(390, 844, 3);
  const b = playArea(view, { cssW: 390, cssH: 844, insets: { top: 500, bottom: 500, left: 300, right: 300 } });
  for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) assert.ok(Number.isFinite(b[k]), `${k} is ${b[k]}`);
  assert.ok(b.minX <= b.maxX && b.minZ <= b.maxZ, JSON.stringify(b));
  assert.ok(b.maxX - b.minX < 1e-9 && b.maxZ - b.minZ < 1e-9, 'a single spot');
});
