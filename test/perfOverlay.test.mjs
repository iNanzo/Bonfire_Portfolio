// The stats overlay (src/ui/perfOverlay.js; ?perf, or the Stats Overlay setting): a drawn
// frame's parts on average, and the page's onTick (Bonfire Live's audio analysis, on every
// frame the display shows, drawn or not) as a part of its own, summed since the last drawn
// frame. A page without an onTick shows no tick. The particles and the show are asked for
// only when the text is built (twice a second), never per frame; the profiler's measure
// entries are ?perf's alone. It never takes the pointer and is hidden from screen readers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A stand-in element: its style, attributes and children. */
function element(tag) {
  const style = new Map();
  return {
    tag,
    style: { setProperty: (k, v) => style.set(k, v) },
    styles: style,
    attrs: new Map(),
    children: [],
    textContent: '',
    setAttribute(k, v) {
      this.attrs.set(k, v);
    },
    append(...c) {
      this.children.push(...c);
    },
    replaceChildren(...c) {
      this.children = c;
    },
    remove() {
      this.removed = true;
    },
  };
}
globalThis.document ??= /** @type {any} */ ({ createElement: element });
const { createPerfOverlay } = await import('../src/ui/perfOverlay.js');

/** An overlay on a stand-in page, and what it shows. */
function overlay(o = {}) {
  const shown = { el: null };
  const parent = /** @type {any} */ ({ append: (el) => (shown.el = el) });
  const info = { render: { calls: 120 }, programs: [1, 2], memory: { textures: 3, geometries: 4 } };
  const ov = createPerfOverlay({ info, parent, ...o });
  /** The Frames group's rows, { label: value }. */
  const frames = () => Object.fromEntries(ov.groups.find((g) => g.id === 'frames').rows.map((r) => [r.label, r.value]));
  return { o: ov, el: () => shown.el, frames };
}

test('stats overlay: the onTicks since each drawn frame are its tick, beside page, update and draw', () => {
  const { o, frames } = overlay({ measures: true });
  const at = performance.now();
  // Capped: two display frames' ticks (0.5 ms each), then a frame drawn; then one tick and a frame.
  o.tick(at, at + 0.5);
  o.tick(at + 8, at + 8.5);
  o.frame(at + 9, at + 9.25, at + 10, at + 12, false);
  o.tick(at + 600, at + 600.5);
  o.frame(at + 601, at + 601.25, at + 602, at + 604, true);
  // (Twice a second: this frame's end is past it, so the text is built.)
  assert.equal(frames().Parts, 'tick 0.75 · page 0.25 · update 0.75 · draw 2.00 ms');
  assert.equal(frames().Draws, '120 · 2 shadows/s');
  assert.equal(performance.getEntriesByName('bonfire: tick').length, 0, 'measures cleared as it shows');
  o.dispose();
});

test('stats overlay: a page without an onTick (the site, the Painter) shows no tick', () => {
  const { o, frames } = overlay();
  const at = performance.now();
  o.frame(at, at + 0.1, at + 1, at + 2, false);
  o.frame(at + 600, at + 600.1, at + 601, at + 602, false);
  assert.equal(frames().Parts, 'page 0.10 · update 0.90 · draw 1.00 ms');
  o.dispose();
});

test('stats overlay: the particles and the page’s part (the show) are asked for twice a second, not per frame', () => {
  let asked = 0;
  const particles = () => {
    asked++;
    return [{ name: 'Bonfire flames', live: 10, total: 20 }];
  };
  const page = () => ({
    show: {
      section: 'groove',
      sinceDrop: null,
      stage: 0,
      budget: 0.6,
      look: { names: ['Ember'], strength: 0.5, pinned: false },
      layers: [{ name: 'Glow', mode: 'on' }],
      xray: null,
      dropHits: null,
      knights: { present: 0, dancing: 0, mode: 'rest' },
      shot: 'Clearing',
      scene: null,
      loop: { mode: 'off', locked: false, next: null, when: null },
    },
  });
  const { o } = overlay({ particles, page });
  const at = performance.now();
  for (let i = 0; i < 125; i++)
    o.frame(at + i * 8.33, at + i * 8.33 + 0.1, at + i * 8.33 + 1, at + i * 8.33 + 2, false);
  assert.equal(asked, 2, '125 frames, a second at 120 fps: two builds');
  assert.deepEqual(
    o.groups.map((g) => g.id),
    ['frames', 'particles', 'show'],
  );
  o.dispose();
});

test('stats overlay: the setting’s overlay leaves the profiler alone (?perf’s measures only)', () => {
  performance.clearMeasures();
  const { o } = overlay({ measures: false });
  const at = performance.now();
  o.tick(at, at + 0.5);
  o.frame(at + 1, at + 1.25, at + 2, at + 4, false);
  assert.equal(performance.getEntriesByType('measure').length, 0);
  o.dispose();
});

test('stats overlay: it never takes the pointer, isn’t read out, and goes when disposed', () => {
  const { o, el } = overlay();
  const node = el();
  assert.equal(node.attrs.get('aria-hidden'), 'true');
  assert.equal(node.styles.get('pointer-events'), 'none');
  assert.equal(node.styles.get('position'), 'fixed');
  o.dispose();
  assert.equal(node.removed, true);
});

test('stats overlay: a page keeps it to the room it has and can put it away; held to no room, it draws nothing', () => {
  const { o, el } = overlay();
  const node = el();
  // (The page's variables, with the old defaults where a page sets none: the site's.)
  assert.match(node.styles.get('max-height'), /^var\(--stats-max-h, /);
  assert.match(node.styles.get('max-width'), /^var\(--stats-max-w, /);
  assert.match(node.styles.get('display'), /^var\(--stats-display, block\)$/);
  assert.equal(node.styles.get('overflow'), 'hidden');
  // Its padding is on what it holds and its edge inside, so a box held to no height shows nothing.
  assert.equal(node.styles.get('padding'), undefined);
  assert.match(node.styles.get('box-shadow'), /^inset /);
  assert.equal(node.children.length, 1);
  const [text] = node.children;
  assert.ok(text.styles.get('padding'));
  // The groups are drawn into it.
  const at = performance.now();
  o.frame(at, at + 0.1, at + 1, at + 2, false);
  o.frame(at + 600, at + 600.1, at + 601, at + 602, false);
  assert.equal(node.children.length, 1);
  assert.ok(text.children.length >= 1, 'the groups');
  o.dispose();
});
