// NEWT's speech bubble in the invitation toy (src/invitation/bubble.js): where it goes (above his
// head, or beside it near the top, inside the stage, clear of the toolbar and the open Look sheet,
// its tail toward him), its
// timeline (typed at a readable pace, held, faded; all at once with prefers-reduced-motion, for
// as long), and the bubble itself on a stand-in DOM: it types the line out, tells a screen reader
// the whole line at once (a polite live region), follows the point it's given, hides when its
// time is up or when told, and leaves nothing behind; it points at his head unless something
// covers it (the open Look sheet over him: then it's out of sight). The page in a real browser: e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUBBLE, bubbleFrame, clearRegion, createBubble, placeBubble, speakerPoint } from '../src/invitation/bubble.js';
import { TALK, lineDuration } from '../src/invitation/speech.js';
import { createRng } from '../src/invitation/rng.js';

const PHONE = { left: 0, top: 0, right: 390, bottom: 844 };
const M = BUBBLE.margin;
const inside = (b, r, msg) =>
  assert.ok(
    b.x >= r.left - 1e-6 && b.y >= r.top - 1e-6 && b.x + b.w <= r.right + 1e-6 && b.y + b.h <= r.bottom + 1e-6,
    `${msg}: ${JSON.stringify(b)} inside ${JSON.stringify(r)}`,
  );

test('the space it may use: the stage less a margin, the toolbar and the open Look sheet', () => {
  assert.deepEqual(clearRegion(PHONE, []), { left: M, top: M, right: 390 - M, bottom: 844 - M });
  const toolbar = { left: 0, top: 760, right: 390, bottom: 844 };
  assert.deepEqual(clearRegion(PHONE, [toolbar]).bottom, 760 - M, 'above the toolbar');
  // A phone held upright: the sheet along the bottom, the toolbar under it.
  const sheet = { left: 0, top: 420, right: 390, bottom: 844 };
  assert.deepEqual(clearRegion(PHONE, [toolbar, sheet]), { left: M, top: M, right: 390 - M, bottom: 420 - M });
  // Held sideways: the sheet down the right side.
  const wide = { left: 0, top: 0, right: 844, bottom: 390 };
  const side = { left: 480, top: 0, right: 844, bottom: 390 };
  assert.deepEqual(clearRegion(wide, [side]), { left: M, top: M, right: 480 - M, bottom: 390 - M });
  // A desktop's toolbar, narrower than the stage: still above it (the bigger space).
  const desk = { left: 0, top: 0, right: 1280, bottom: 800 };
  const bar = { left: 340, top: 720, right: 940, bottom: 792 };
  assert.equal(clearRegion(desk, [bar]).bottom, 720 - M);
  assert.equal(clearRegion(desk, [bar]).right, 1280 - M);
  // A closed sheet (no size) or something off the stage changes nothing.
  const none = { left: 0, top: 0, right: 0, bottom: 0 };
  const off = { left: 0, top: 900, right: 390, bottom: 1000 };
  assert.deepEqual(clearRegion(PHONE, [none, off]), clearRegion(PHONE, []));
  // (A stage that doesn't start at 0: client coordinates throughout.)
  const shifted = clearRegion({ left: 100, top: 50, right: 490, bottom: 894 }, []);
  assert.deepEqual(shifted, { left: 100 + M, top: 50 + M, right: 490 - M, bottom: 894 - M });
});

test('where it goes: above his head, its tail toward him, kept inside the space', () => {
  const region = clearRegion(PHONE, []);
  const size = { w: 200, h: 60 };
  const head = { x: 195, y: 400 };
  const b = placeBubble({ point: head, size, region });
  assert.equal(b.x, 195 - 100, 'centred over him');
  assert.equal(b.y + size.h, 400 - BUBBLE.gap - BUBBLE.tail, 'its tail’s length above his head');
  assert.equal(b.tail, 'down');
  assert.equal(b.tailX, 100, 'the tail under the middle');
  // Near the left edge: the bubble stops at the margin, the tail still points at him.
  const left = placeBubble({ point: { x: 30, y: 400 }, size, region });
  assert.equal(left.x, region.left);
  assert.equal(left.tailX, Math.max(30 - left.x, BUBBLE.corner + BUBBLE.tail));
  // Near the right edge.
  const right = placeBubble({ point: { x: 380, y: 400 }, size, region });
  assert.equal(right.x + size.w, region.right);
  assert.equal(right.tailX, size.w - BUBBLE.corner - BUBBLE.tail, 'as far over as its corner allows');
  // His head's radius: the tail stops that far above its middle.
  const round = placeBubble({ point: { x: 195, y: 400, r: 20 }, size, region });
  assert.equal(round.y + size.h, 400 - 20 - BUBBLE.gap - BUBBLE.tail);
  // His head near the top: no room above, so beside it (the side with room), its tail
  // pointing across at him, never over his face.
  const top = placeBubble({ point: { x: 120, y: 40, r: 20 }, size, region });
  assert.equal(top.tail, 'left', 'to his right, the tail on its left');
  assert.equal(top.x, 120 + 20 + BUBBLE.gap + BUBBLE.tail);
  assert.ok(top.y >= region.top);
  assert.equal(top.tailY, Math.max(40 - top.y, BUBBLE.corner + BUBBLE.tail), 'the tail level with his head');
  const topRight = placeBubble({ point: { x: 330, y: 40, r: 20 }, size, region });
  assert.equal(topRight.tail, 'right', 'no room to his right: to his left');
  assert.equal(topRight.x + size.w, 330 - 20 - BUBBLE.gap - BUBBLE.tail);
  // No room on either side either (a phone, a long line): under his head, its tail up at him.
  const narrow = clearRegion({ left: 0, top: 0, right: 260, bottom: 600 }, []);
  const under = placeBubble({ point: { x: 130, y: 30, r: 20 }, size, region: narrow });
  assert.equal(under.y, 30 + 20 + BUBBLE.gap + BUBBLE.tail);
  assert.equal(under.tail, 'up');
  // And with no room anywhere: over him, kept on screen, with no tail.
  const tiny = clearRegion({ left: 0, top: 0, right: 260, bottom: 110 }, []);
  const squeezed = placeBubble({ point: { x: 130, y: 40, r: 20 }, size, region: tiny });
  assert.equal(squeezed.y, tiny.top);
  assert.equal(squeezed.tail, 'none');
  // He's down behind the sheet: the bubble waits at its edge, tail down toward him.
  const sheet = { left: 0, top: 420, right: 390, bottom: 844 };
  const low = placeBubble({ point: { x: 195, y: 600 }, size, region: clearRegion(PHONE, [sheet]) });
  assert.equal(low.y + size.h, 420 - M);
  assert.equal(low.tail, 'down');
});

test('wherever he is, the bubble never leaves the space (when it fits)', () => {
  const rng = createRng(4);
  const sheet = { left: 0, top: 500, right: 390, bottom: 844 };
  for (const region of [clearRegion(PHONE, []), clearRegion(PHONE, [sheet])]) {
    for (let i = 0; i < 500; i++) {
      const size = { w: 60 + rng() * 180, h: 30 + rng() * 60 };
      const point = { x: -100 + rng() * 600, y: -100 + rng() * 1000, r: rng() * 40 };
      const b = placeBubble({ point, size, region });
      inside({ ...b, ...size }, region, `${i}`);
      assert.ok(b.tailX >= 0 && b.tailX <= size.w);
      assert.ok(b.tailY >= 0 && b.tailY <= size.h);
      // Never over his head with a tail (a tail always points out, at him).
      if (b.tail === 'down') assert.ok(b.y + size.h + BUBBLE.tail <= point.y - point.r + 0.5);
      if (b.tail === 'left') assert.ok(b.x >= point.x + point.r - 0.5);
      if (b.tail === 'right') assert.ok(b.x + size.w <= point.x - point.r + 0.5);
      if (b.tail === 'up') assert.ok(b.y - BUBBLE.tail >= point.y + point.r - 0.5);
    }
  }
});

/**
 * A line's size wrapped to at most `maxW` CSS px wide: 178 px of text in 24 px of padding and
 * border, 20 px a row and 20 px more (bubble.css's 16 px Pixelify Sans, near enough).
 */
const fitLine =
  (text = 178) =>
  (maxW) => {
    const w = Math.min(text + 24, Math.floor(maxW));
    return { w, h: 20 + 20 * Math.ceil(text / Math.max(1, w - 24)) };
  };

test('lifted to the top of a phone, a line too wide to go beside his head narrows to fit the side with more room (wrapping onto more rows) rather than go over his body; with no room there either, it goes under his feet', () => {
  const toolbar = { left: 0, top: 774, right: 390, bottom: 844 };
  const region = clearRegion(PHONE, [toolbar]);
  const fit = fitLine();
  const size = fit(Infinity);
  assert.equal(size.w, 202, 'the line’s own width');
  // His head at the top (no room above), in the middle: 150 px or so each side, under 202.
  for (const head of [
    { x: 200, y: 44, r: 22 },
    { x: 195, y: 20, r: 16 },
    { x: 170, y: 70, r: 28 },
  ]) {
    const feet = head.y + 120;
    const b = placeBubble({ point: head, size, region, fit, under: feet });
    const at = `head at (${head.x}, ${head.y})`;
    assert.ok(b.tail === 'left' || b.tail === 'right', `${at}: beside him (${b.tail})`);
    assert.ok(b.w < size.w && b.h > size.h, `${at}: narrower and taller (${b.w}×${b.h})`);
    assert.equal(b.maxW, b.w, `${at}: the width it was wrapped to`);
    inside({ x: b.x, y: b.y, w: b.w, h: b.h }, region, at);
    // Clear of all of him: his head, and his body straight down under it to his feet.
    const clear = b.tail === 'left' ? b.x >= head.x + head.r : b.x + b.w <= head.x - head.r;
    assert.ok(clear, `${at}: off his head and body: ${JSON.stringify(b)}`);
  }
  // A short line still goes beside him as it is.
  const short = fitLine(40);
  const s = placeBubble({ point: { x: 200, y: 44, r: 22 }, size: short(Infinity), region, fit: short, under: 164 });
  assert.equal(s.w, 64);
  assert.equal(s.maxW, null, 'its own width');
  // A stage too narrow even for that: under his feet, its tail up at him, never over him.
  const narrow = clearRegion({ left: 0, top: 0, right: 260, bottom: 600 }, []);
  const u = placeBubble({ point: { x: 130, y: 30, r: 20 }, size, region: narrow, fit, under: 140 });
  assert.equal(u.tail, 'up');
  assert.equal(u.y, 140 + BUBBLE.gap + BUBBLE.tail, 'under his feet');
  // Without his feet it goes under his head, as before.
  assert.equal(
    placeBubble({ point: { x: 130, y: 30, r: 20 }, size, region: narrow }).y,
    30 + 20 + BUBBLE.gap + BUBBLE.tail,
  );
});

test('wherever he is, with the line wrapping to fit and his feet known, the bubble stays in the space and off him when it can', () => {
  const rng = createRng(7);
  const sheet = { left: 0, top: 500, right: 390, bottom: 844 };
  for (const region of [clearRegion(PHONE, []), clearRegion(PHONE, [sheet])]) {
    for (let i = 0; i < 500; i++) {
      const fit = fitLine(30 + rng() * 300);
      const size = fit(Infinity);
      const point = { x: rng() * 390, y: -60 + rng() * 600, r: 10 + rng() * 30 };
      const under = point.y + point.r + 40 + rng() * 200;
      const b = placeBubble({ point, size, region, fit, under });
      assert.ok(b.w <= size.w && b.w > 0 && b.h > 0, `${i}: its size`);
      if (b.tail !== 'none') inside({ x: b.x, y: b.y, w: b.w, h: b.h }, region, `${i}`);
      if (b.tail === 'down') assert.ok(b.y + b.h + BUBBLE.tail <= point.y - point.r + 0.5);
      if (b.tail === 'left') assert.ok(b.x >= point.x + point.r - 0.5);
      if (b.tail === 'right') assert.ok(b.x + b.w <= point.x - point.r + 0.5);
      if (b.tail === 'up') assert.ok(b.y - BUBBLE.tail >= under - 0.5, `${i}: under his feet`);
      if (b.maxW !== null) assert.ok(b.maxW >= BUBBLE.minW, `${i}: never narrower than ${BUBBLE.minW}`);
    }
  }
});

test('what it points at: his head, or nothing (out of sight) while something covers his head’s middle', () => {
  const head = { x: 195, y: 300, r: 14 };
  assert.equal(speakerPoint(head), head, 'nothing over him');
  assert.equal(speakerPoint(head, []), head);
  const sheet = { left: 0, top: 420, right: 390, bottom: 844 };
  assert.equal(speakerPoint(head, [sheet]), head, 'the sheet below him');
  assert.equal(speakerPoint({ ...head, y: 500 }, [sheet]), null, 'the sheet over his head');
  // Only his head's middle counts: the top of his head showing over the sheet still talks.
  assert.deepEqual(speakerPoint({ ...head, y: 410 }, [sheet]), { ...head, y: 410 });
  assert.equal(speakerPoint({ ...head, y: 420 }, [sheet]), null, 'on its edge');
  // A sheet down the side of a phone held sideways; a rect with no size, or none, is ignored.
  const side = { left: 450, top: 0, right: 844, bottom: 390 };
  assert.equal(speakerPoint({ x: 600, y: 200, r: 10 }, [side]), null);
  assert.deepEqual(speakerPoint({ x: 300, y: 200, r: 10 }, [side, null, { left: 0, top: 0, right: 0, bottom: 0 }]), {
    x: 300,
    y: 200,
    r: 10,
  });
  assert.equal(speakerPoint(null, [sheet]), null, 'no head (not loaded): nothing');
});

test('its timeline: typed at a readable pace, held, faded, as long as speech.js counts it', () => {
  const text = 'Hi! I’m NEWT.';
  const n = Array.from(text).length;
  const typed = n / TALK.typeCps;
  const total = lineDuration(text);
  assert.deepEqual(bubbleFrame(text, 0, false), { shown: 0, phase: 'type' });
  assert.equal(bubbleFrame(text, typed / 2, false).shown, Math.floor(n / 2));
  assert.deepEqual(bubbleFrame(text, typed + 0.01, false), { shown: n, phase: 'hold' });
  assert.equal(bubbleFrame(text, total - TALK.fade / 2, false).phase, 'fade');
  assert.equal(bubbleFrame(text, total - TALK.fade / 2, false).shown, n);
  assert.equal(bubbleFrame(text, total + 0.01, false).phase, 'done');
  // Reduced motion: the whole line at once, up just as long.
  assert.deepEqual(bubbleFrame(text, 0, true), { shown: n, phase: 'hold' });
  assert.equal(bubbleFrame(text, total - TALK.fade / 2, true).phase, 'fade');
  assert.equal(bubbleFrame(text, total + 0.01, true).phase, 'done');
});

// ---- the bubble on a stand-in DOM ------------------------------------------------------------

/** Just enough of an element for bubble.js. */
class El {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.className = '';
    this.hidden = false;
    this._text = '';
    this.props = {};
    this.style = {
      transform: '',
      setProperty: (k, v) => (this.props[k] = v),
    };
    const el = this;
    this.classList = {
      add: (...c) => (el.className = [...new Set([...el.className.split(' ').filter(Boolean), ...c])].join(' ')),
      remove: (...c) =>
        (el.className = el.className
          .split(' ')
          .filter((x) => x && !c.includes(x))
          .join(' ')),
      toggle: (c, on) => (on ? el.classList.add(c) : el.classList.remove(c)),
      contains: (c) => el.className.split(' ').includes(c),
    };
    this.dataset = {};
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  append(...kids) {
    for (const k of kids) {
      k.parentNode = this;
      this.children.push(k);
    }
  }
  insertBefore(k, ref) {
    k.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(k);
    else this.children.splice(i, 0, k);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  querySelector(sel) {
    const cls = sel.replace(/^\./, '');
    for (const c of this.children) {
      if (c.classList.contains(cls)) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
  get offsetWidth() {
    return this.classList.contains('inv-bubble') ? 180 : 0;
  }
  get offsetHeight() {
    return this.classList.contains('inv-bubble') ? 48 : 0;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 };
  }
}
/** The letters showing in the bubble: the typed ones (the rest keep their place, unseen). */
function showing(box) {
  const out = [];
  const walk = (e) => {
    for (const c of e.children)
      if (!c.classList.contains('inv-fx')) walk(c);
      else if (!c.classList.contains('is-unseen')) out.push(c.textContent);
  };
  walk(box.querySelector('.inv-bubble-typed'));
  return out.join('');
}
/** Every letter span in the bubble, in order. */
function letters(box) {
  const out = [];
  const walk = (e) => {
    for (const c of e.children) c.classList.contains('inv-fx') ? out.push(c) : walk(c);
  };
  walk(box.querySelector('.inv-bubble-typed'));
  return out;
}
function stage() {
  const doc = { createElement: (tag) => new El(tag, doc) };
  const root = new El('div', doc);
  const hud = new El('div', doc);
  hud.className = 'inv-hud';
  root.append(hud);
  return { root, hud };
}

test('the bubble: types the line out, tells a screen reader all of it at once, follows him, hides', () => {
  const { root, hud } = stage();
  let now = 10;
  const b = createBubble({ root, before: hud, now: () => now, reducedMotion: () => false });
  const box = root.querySelector('.inv-bubble');
  const live = root.querySelector('.inv-bubble-live');
  assert.ok(box && live, 'its box and its live region');
  assert.equal(root.children.indexOf(box) < root.children.indexOf(hud), true, 'under the toolbar and sheet');
  assert.equal(box.getAttribute('aria-hidden'), 'true', 'the typed text isn’t read letter by letter');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(box.hidden, true, 'nothing up yet');
  b.update({ x: 195, y: 400 }, []);
  assert.equal(box.hidden, true);

  const text = 'Hello there, friend!';
  const total = b.say(text);
  assert.equal(total, lineDuration(text));
  assert.equal(b.text, text);
  assert.match(live.textContent, /Hello there, friend!/, 'the whole line for a screen reader');
  assert.equal(box.hidden, false);
  b.update({ x: 195, y: 400 }, []);
  assert.equal(showing(box), '', 'typing starts empty');
  assert.equal(box.querySelector('.inv-bubble-typed').textContent, text, 'the rest holds its place');
  const pos = placeBubble({ point: { x: 195, y: 400 }, size: { w: 180, h: 48 }, region: clearRegion(PHONE, []) });
  assert.equal(box.style.transform, `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`);
  assert.equal(box.dataset.tail, 'down');
  assert.equal(box.props['--tail-x'], `${Math.round(pos.tailX)}px`);
  assert.equal(box.props['--tail-y'], `${Math.round(pos.tailY)}px`);
  now += 5 / TALK.typeCps + 0.001;
  b.update({ x: 195, y: 400 }, []);
  assert.equal(showing(box), text.slice(0, 5));
  assert.equal(box.querySelector('.inv-bubble-typed').textContent, text);
  // It follows him.
  b.update({ x: 120, y: 300 }, []);
  const moved = placeBubble({ point: { x: 120, y: 300 }, size: { w: 180, h: 48 }, region: clearRegion(PHONE, []) });
  assert.equal(box.style.transform, `translate(${Math.round(moved.x)}px, ${Math.round(moved.y)}px)`);
  // No point (he's not drawn yet): out of sight, its time still running.
  b.update(null, []);
  assert.ok(box.classList.contains('is-away'));
  b.update({ x: 120, y: 300 }, []);
  assert.ok(!box.classList.contains('is-away'));
  // Fading, then gone.
  now = 10 + total - TALK.fade / 2;
  b.update({ x: 120, y: 300 }, []);
  assert.ok(box.classList.contains('is-fading'));
  now = 10 + total + 0.01;
  b.update({ x: 120, y: 300 }, []);
  assert.equal(box.hidden, true);
  assert.equal(b.text, null);
  // A new line over one that's up starts afresh.
  b.say('One.');
  now += 0.5;
  b.update({ x: 195, y: 400 }, []);
  b.say('Two!');
  b.update({ x: 195, y: 400 }, []);
  assert.equal(showing(box), '');
  assert.ok(!box.classList.contains('is-fading'));
  assert.match(live.textContent, /Two!/);
  b.hide();
  assert.equal(box.hidden, true);
  b.dispose();
  assert.equal(root.children.includes(box), false);
  assert.equal(root.children.includes(live), false);
});

test('reduced motion: the whole line at once', () => {
  const { root } = stage();
  const b = createBubble({ root, now: () => 0, reducedMotion: () => true });
  b.say('Hi!');
  b.update({ x: 195, y: 400 }, []);
  const box = root.querySelector('.inv-bubble');
  assert.equal(showing(box), 'Hi!');
  assert.ok(box.classList.contains('is-still'), 'no fade either');
});

test('a styled line: typed and timed by the letters that show, read out plain, each letter styled', () => {
  const { root } = stage();
  let now = 0;
  const palette = new Map([['red', '#c8323c']]);
  const b = createBubble({ root, now: () => now, reducedMotion: () => false, palette });
  const styled = '{red,wave|Hey} you 👋🏽';
  const plain = 'Hey you 👋🏽';
  assert.equal(b.say(styled), lineDuration(plain), 'on screen as long as its plain text');
  assert.equal(lineDuration(styled), lineDuration(plain));
  const live = root.querySelector('.inv-bubble-live');
  assert.equal(live.textContent, `NEWT: ${plain}`, 'a screen reader hears it plain');
  const box = root.querySelector('.inv-bubble');
  const spans = letters(box);
  assert.equal(spans.length, 9, 'a span a letter (the emoji is one)');
  assert.deepEqual(
    spans.slice(0, 3).map((l) => [l.textContent, l.style.color, l.props['--i']]),
    [
      ['H', '#c8323c', '0'],
      ['e', '#c8323c', '1'],
      ['y', '#c8323c', '2'],
    ],
  );
  assert.ok(spans[0].classList.contains('inv-fx-wave') && spans[0].classList.contains('inv-fx-moves'));
  assert.ok(!spans[4].classList.contains('inv-fx-wave'), '“you” as written');
  now = 3 / TALK.typeCps + 0.001;
  b.update({ x: 195, y: 400 }, []);
  assert.equal(showing(box), 'Hey');
  assert.deepEqual(bubbleFrame(styled, 99 / TALK.typeCps, false).shown, 9);
});
