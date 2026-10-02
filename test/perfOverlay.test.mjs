// The ?perf overlay (src/ui/perfOverlay.js): a drawn frame's parts on average, and the page's
// onTick (Bonfire Live's audio analysis, on every frame the display shows, drawn or not) as a
// part of its own, summed since the last drawn frame. A page without an onTick shows no tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ??= /** @type {any} */ ({
  createElement: () => ({ setAttribute() {}, style: { setProperty() {} }, textContent: '', remove() {} }),
});
const { createPerfOverlay } = await import('../src/ui/perfOverlay.js');

/** An overlay on a stand-in page, and what it shows. */
function overlay() {
  const shown = { el: null };
  const parent = /** @type {any} */ ({ append: (el) => (shown.el = el) });
  const info = { render: { calls: 120 }, programs: [1, 2], memory: { textures: 3, geometries: 4 } };
  const o = createPerfOverlay({ info, parent });
  return { o, lines: () => shown.el.textContent.split('\n') };
}

test('perf overlay: the onTicks since each drawn frame are its tick, beside page, update and draw', () => {
  const { o, lines } = overlay();
  const at = performance.now();
  // Capped: two display frames' ticks (0.5 ms each), then a frame drawn; then one tick and a frame.
  o.tick(at, at + 0.5);
  o.tick(at + 8, at + 8.5);
  o.frame(at + 9, at + 9.25, at + 10, at + 12, false);
  o.tick(at + 600, at + 600.5);
  o.frame(at + 601, at + 601.25, at + 602, at + 604, true);
  // (Twice a second: this frame's end is past it, so the text is drawn.)
  assert.match(lines()[1], /^tick 0\.75 {2}page 0\.25 {2}update 0\.75 {2}draw 2\.00 ms$/);
  assert.equal(performance.getEntriesByName('bonfire: tick').length, 0, 'measures cleared as it shows');
  o.dispose();
});

test('perf overlay: a page without an onTick (the site, the Painter) shows no tick', () => {
  const { o, lines } = overlay();
  const at = performance.now();
  o.frame(at, at + 0.1, at + 1, at + 2, false);
  o.frame(at + 600, at + 600.1, at + 601, at + 602, false);
  assert.match(lines()[1], /^page 0\.10 {2}update 0\.90 {2}draw 1\.00 ms$/);
  o.dispose();
});
