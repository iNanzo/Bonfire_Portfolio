// The shared tooltip (src/ui/tooltip.js): place() keeps a tip on screen and off its trigger
// (above if it fits, else below, else beside; shifted along an edge; clamped on a window too
// small for it), and installTooltips on a stand-in page: a pointer resting shows a tip after
// the delay (sooner right after another), leaving hides it after the grace (not while the
// pointer is on the tip), keyboard focus shows a field's tip at once, a tap toggles a "?",
// Esc closes the tip and not the dialog, and a tip moves into an open dialog, goes when its
// trigger goes or scrolls out of its box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { place, installTooltips, TIP_MAX } from '../src/ui/tooltip.js';

const VIEW = { width: 1280, height: 720 };
const box = (left, top, width = 14, height = 14) => ({ left, top, right: left + width, bottom: top + height });
const inside = (at, size, view, margin = 8) =>
  at.x >= margin &&
  at.y >= margin &&
  at.x + Math.min(size.width, TIP_MAX) <= view.width - margin &&
  at.y + size.height <= view.height - margin;
const overlaps = (at, size, a) =>
  at.x < a.right && at.x + size.width > a.left && at.y < a.bottom && at.y + size.height > a.top;

test('place: above the anchor, centered on it, when it fits', () => {
  const a = box(600, 400);
  const tip = { width: 200, height: 60 };
  const at = place(a, tip, VIEW);
  assert.equal(at.side, 'top');
  assert.equal(at.y, 400 - 8 - 60);
  assert.equal(at.x, Math.round(607 - 100));
  assert.ok(inside(at, tip, VIEW) && !overlaps(at, tip, a));
});

test('place: flips below near the top edge, beside when neither fits, and prefers what it is asked to', () => {
  const tip = { width: 240, height: 120 };
  const top = place(box(600, 20), tip, VIEW);
  assert.equal(top.side, 'bottom');
  assert.equal(top.y, 34 + 8);
  // A tall tip by a field mid-height in a short window: no room above or below, room to the right.
  const short = { width: 800, height: 300 };
  const beside = place(box(100, 140, 14, 20), { width: 200, height: 250 }, short);
  assert.equal(beside.side, 'right');
  assert.ok(
    inside(beside, { width: 200, height: 250 }, short) &&
      !overlaps(beside, { width: 200, height: 250 }, box(100, 140, 14, 20)),
  );
  // …and to the left when the anchor is at the right edge.
  const left = place(box(760, 140, 14, 20), { width: 200, height: 250 }, short);
  assert.equal(left.side, 'left');
  assert.ok(!overlaps(left, { width: 200, height: 250 }, box(760, 140, 14, 20)));
  assert.equal(place(box(600, 400), tip, VIEW, { prefer: 'bottom' }).side, 'bottom');
  assert.equal(place(box(600, 400), tip, VIEW, { prefer: 'right' }).side, 'right');
});

test('place: shifted along the edge to stay 8 px inside, at all four edges', () => {
  const tip = { width: 300, height: 80 };
  const cases = {
    left: box(0, 400), // a "?" hard against the left edge
    right: box(1270, 400), // …the right edge (the old tips ran off here)
    top: box(600, 0), // …the top (they opened upward into it)
    bottom: box(600, 706), // …the bottom
  };
  for (const [edge, a] of Object.entries(cases)) {
    const at = place(a, tip, VIEW);
    assert.ok(inside(at, tip, VIEW), `${edge}: inside the window (${JSON.stringify(at)})`);
    assert.ok(!overlaps(at, tip, a), `${edge}: off its trigger`);
  }
  assert.equal(place(cases.left, tip, VIEW).x, 8);
  assert.equal(place(cases.right, tip, VIEW).x, 1280 - 8 - 300);
  assert.equal(place(cases.bottom, tip, VIEW).side, 'top');
  // A wider tip counts as the widest a tip gets.
  assert.equal(place(cases.right, { width: 900, height: 80 }, VIEW).x, 1280 - 8 - TIP_MAX);
});

test('place: a window too small for the tip keeps it inside, clamped (covering the trigger if it must)', () => {
  const phone = { width: 320, height: 200 };
  const tip = { width: 400, height: 260 };
  const at = place(box(150, 90), tip, phone);
  assert.equal(at.x, 8, 'as wide as the window less the margins');
  assert.equal(at.y, 8, 'from the top margin, its overflow scrolls');
  assert.ok(['top', 'bottom'].includes(at.side));
  // A tiny window: never a negative position.
  const tiny = place(box(5, 5), { width: 50, height: 50 }, { width: 10, height: 10 });
  assert.ok(tiny.x >= 0 && tiny.y >= 0);
});

// --- a stand-in page -----------------------------------------------------------------------
// Just enough DOM for installTooltips: elements with attributes, a tree, boxes, a few
// selectors, listeners on the document, and a clock run by hand (timers and frames).
function page({ popover = true } = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();
  const listeners = new Map();
  const parts = (one) => {
    const m = one.trim().match(/^([a-z]*)((?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)*)$/);
    if (!m) throw new Error(`selector: ${one}`);
    return { tag: m[1], bits: [...m[2].matchAll(/\.([\w-]+)|\[([\w-]+)(?:([~]?=)"([^"]*)")?\]|:([\w-]+)/g)] };
  };
  class El {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.attrs = { ...attrs };
      this.children = [];
      this.parentNode = null;
      this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      this.style = {
        props: {},
        setProperty(k, v) {
          this.props[k] = v;
        },
      };
      this.dataset = {};
      this.hidden = false;
      this.textContent = '';
      this.focusVisible = false;
      this.overflow = 'visible';
      this.vars = {}; // (custom properties its style gives it: --tip-side)
      this.open = false;
      if (popover) {
        this.showPopover = () => {
          this.open = true;
        };
        this.hidePopover = () => {
          this.open = false;
        };
      }
    }
    get className() {
      return this.attrs.class ?? '';
    }
    set className(v) {
      this.attrs.class = v;
    }
    getAttribute(n) {
      return this.attrs[n] ?? null;
    }
    setAttribute(n, v) {
      this.attrs[n] = String(v);
    }
    hasAttribute(n) {
      return n in this.attrs;
    }
    append(...kids) {
      for (const k of kids) {
        k.remove();
        k.parentNode = this;
        this.children.push(k);
      }
      return this;
    }
    remove() {
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    contains(o) {
      for (let n = o; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    get isConnected() {
      return doc.documentElement.contains(this);
    }
    get parentElement() {
      return this.parentNode instanceof El ? this.parentNode : null;
    }
    matches(sel) {
      return sel.split(',').some((one) => {
        const { tag, bits } = parts(one);
        if (tag && this.tagName !== tag.toUpperCase()) return false;
        return bits.every(([, cls, attr, op, val, pseudo]) => {
          if (cls) return this.className.split(/\s+/).includes(cls);
          if (pseudo) return pseudo === 'focus-visible' ? this.focusVisible : false;
          if (!this.hasAttribute(attr)) return false;
          if (!op) return true;
          return op === '=' ? this.attrs[attr] === val : this.attrs[attr].split(/\s+/).includes(val);
        });
      });
    }
    closest(sel) {
      for (let n = this; n instanceof El; n = n.parentNode) if (n.matches(sel)) return n;
      return null;
    }
    getBoundingClientRect() {
      return { ...this.rect };
    }
    at(left, top, width, height) {
      this.rect = { left, top, width, height, right: left + width, bottom: top + height };
      return this;
    }
  }
  const all = (n) => [n, ...n.children.flatMap(all)];
  const win = {
    performance: { now: () => now },
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(fn) {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    getComputedStyle: (el) => ({
      overflowX: el.overflow,
      overflowY: el.overflow,
      getPropertyValue: (n) => el.vars[n] ?? '',
    }),
    CSS: { escape: (s) => s },
    addEventListener() {},
    removeEventListener() {},
  };
  const doc = {
    defaultView: win,
    documentElement: new El('html'),
    createElement: (tag) => new El(tag),
    querySelector(sel) {
      return all(doc.documentElement).find((n) => n.matches(sel)) ?? null;
    },
    addEventListener(type, fn) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };
  doc.documentElement.clientWidth = 1280;
  doc.documentElement.clientHeight = 720;
  doc.body = new El('body').at(0, 0, 1280, 720);
  doc.documentElement.append(doc.body);
  // An event through the document's listeners; what the page saw of it comes back.
  const fire = (type, props = {}) => {
    const e = {
      type,
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      ...props,
    };
    for (const fn of [...(listeners.get(type) ?? [])]) fn(e);
    return e;
  };
  const tick = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = until;
  };
  const frame = () => {
    const fns = [...frames.values()];
    frames.clear();
    for (const fn of fns) fn();
  };
  // A field: a "?" (data-tip, described by the hint) and its input reading the hint out.
  let fields = 0;
  const field = (parent = doc.body, { left = 100, top = 300 } = {}) => {
    const id = `hint-${++fields}`;
    const mark = new El('button', {
      class: 'viz-tip',
      'data-tip': `What field ${fields} does.`,
      'aria-describedby': id,
      tabindex: '-1',
    }).at(left, top, 14, 14);
    const input = new El('select', { 'aria-describedby': id }).at(left, top + 20, 200, 30);
    parent.append(mark, input);
    return { mark, input };
  };
  const tip = () => all(doc.documentElement).find((n) => n.className === 'ui-tip');
  const shown = () => {
    const t = tip();
    return !!t && (popover ? t.open : !t.hidden);
  };
  return { El, doc, win, fire, tick, frame, field, tip, shown, listeners };
}

test('installTooltips: a pointer resting on a "?" shows its tip after the delay, placed on screen, as text', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const { mark } = p.field();
  mark.attrs['data-tip-title'] = 'Field <b>1</b>';
  p.fire('pointerover', { target: mark, pointerType: 'mouse' });
  p.tick(399);
  assert.equal(p.shown(), false, 'not before the delay');
  p.tick(1);
  assert.equal(p.shown(), true);
  const tip = p.tip();
  assert.equal(tip.attrs.role, 'tooltip');
  assert.equal(tip.attrs['aria-hidden'], 'true');
  assert.equal(tip.attrs.popover, 'manual');
  assert.equal(tip.parentNode, p.doc.body);
  assert.equal(tip.children[1].textContent, 'What field 1 does.');
  assert.equal(tip.children[0].textContent, 'Field <b>1</b>', 'the title as text, never markup');
  assert.equal(tip.children[0].hidden, false);
  assert.match(tip.style.props.left, /^\d+px$/);
  assert.match(tip.style.props.top, /^\d+px$/);
  assert.equal(tip.style.props['max-width'], `${TIP_MAX}px`);
  assert.equal(tip.dataset.side, 'top');
  // A trigger can ask for another side (an item in a list: beside it).
  const item = new p.El('button', { 'data-tip': 'Starts it.', 'data-tip-side': 'right' }).at(40, 500, 200, 30);
  p.doc.body.append(item);
  p.fire('pointerover', { target: item, pointerType: 'mouse' });
  p.tick(100);
  assert.equal(tip.dataset.side, 'right');
  // Or its CSS can (--tip-side: a kind of trigger, per window width); the attribute wins.
  const styled = new p.El('button', { 'data-tip': 'Listens.' }).at(40, 560, 200, 30);
  styled.vars['--tip-side'] = ' bottom';
  p.doc.body.append(styled);
  p.fire('pointerover', { target: styled, pointerType: 'mouse' });
  p.tick(100);
  assert.equal(tip.dataset.side, 'bottom');
  item.vars['--tip-side'] = 'left';
  p.fire('pointerover', { target: item, pointerType: 'mouse' });
  p.tick(100);
  assert.equal(tip.dataset.side, 'right');
});

test('installTooltips: leaving hides after the grace, not while the pointer is on the tip; the next one comes quick', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const a = p.field();
  const b = p.field(p.doc.body, { top: 400 });
  p.fire('pointerover', { target: a.mark, pointerType: 'mouse' });
  p.tick(400);
  const tip = p.tip();
  p.fire('pointerout', { target: a.mark, relatedTarget: tip, pointerType: 'mouse' });
  p.fire('pointerover', { target: tip, pointerType: 'mouse' });
  p.tick(1000);
  assert.equal(p.shown(), true, 'on the tip: it stays');
  p.fire('pointerout', { target: tip, relatedTarget: p.doc.body, pointerType: 'mouse' });
  p.tick(149);
  assert.equal(p.shown(), true, 'the grace');
  p.tick(1);
  assert.equal(p.shown(), false);
  // Straight on to another "?": the warm delay.
  p.fire('pointerover', { target: b.mark, pointerType: 'mouse' });
  p.tick(100);
  assert.equal(p.shown(), true, 'a moment after the last: quick');
  assert.equal(tip.children[1].textContent, 'What field 2 does.');
  // A pointer passing over without resting shows nothing.
  p.fire('pointerout', { target: b.mark, relatedTarget: p.doc.body, pointerType: 'mouse' });
  p.tick(1000);
  p.fire('pointerover', { target: a.mark, pointerType: 'mouse' });
  p.tick(200);
  p.fire('pointerout', { target: a.mark, relatedTarget: p.doc.body, pointerType: 'mouse' });
  p.tick(1000);
  assert.equal(p.shown(), false);
});

test('installTooltips: leaving one tip across a gap for another in its grace, the other still comes', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const a = p.field();
  const b = p.field(p.doc.body, { top: 400 });
  p.fire('pointerover', { target: a.mark, pointerType: 'mouse' });
  p.tick(400);
  const tip = p.tip();
  assert.equal(tip.children[1].textContent, 'What field 1 does.');
  // Off it over the page (the picture between two buttons), then onto the other 60 ms on:
  // the first tip's grace ends before the second one's warm delay does.
  p.fire('pointerout', { target: a.mark, relatedTarget: p.doc.body, pointerType: 'mouse' });
  p.tick(60);
  p.fire('pointerover', { target: b.mark, pointerType: 'mouse' });
  p.tick(90);
  assert.equal(p.shown(), false, 'the first one gone at the end of its grace');
  p.tick(10);
  assert.equal(p.shown(), true, 'the second one still on its way, and here');
  assert.equal(tip.children[1].textContent, 'What field 2 does.');
});

test('installTooltips: keyboard focus on a field shows its "?"’s tip at once, beside both; a click’s focus doesn’t', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const { input } = p.field();
  input.focusVisible = true;
  p.fire('focusin', { target: input });
  assert.equal(p.shown(), true);
  const at = { y: parseInt(p.tip().style.props.top, 10) };
  assert.ok(at.y < 300, 'above the "?", clear of the field under it');
  p.fire('focusout', { target: input, relatedTarget: null });
  assert.equal(p.shown(), false, 'focus gone: tip gone');
  input.focusVisible = false;
  p.fire('focusin', { target: input });
  assert.equal(p.shown(), false, 'no focus ring (a click): no tip');
});

test('installTooltips: a tap on a "?" toggles its tip (touch has no hover); a tap elsewhere closes it', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const { mark } = p.field();
  p.fire('pointerover', { target: mark, pointerType: 'touch' });
  p.tick(1000);
  assert.equal(p.shown(), false, 'no hover on touch');
  p.fire('pointerdown', { target: mark, pointerType: 'touch' });
  p.fire('click', { target: mark });
  assert.equal(p.shown(), true);
  p.fire('pointerout', { target: mark, relatedTarget: null, pointerType: 'touch' });
  p.tick(1000);
  assert.equal(p.shown(), true, 'the finger lifting doesn’t close it');
  p.fire('click', { target: mark });
  assert.equal(p.shown(), false, 'a second tap closes it');
  p.fire('click', { target: mark });
  p.fire('pointerdown', { target: p.doc.body, pointerType: 'touch' });
  assert.equal(p.shown(), false, 'a tap elsewhere closes it');
});

test('installTooltips: a trigger that asks for it (data-tip-tap: the site’s skills) toggles on a tap too; others don’t', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const skill = new p.El('button', {
    class: 'slot',
    'data-tip': 'The common tongue.',
    'data-tip-title': 'JavaScript',
    'data-tip-tap': '',
  }).at(300, 300, 120, 40);
  const action = new p.El('button', { 'data-tip': 'Does a thing.' }).at(300, 400, 120, 40);
  p.doc.body.append(skill, action);
  p.fire('pointerdown', { target: skill, pointerType: 'touch' });
  p.fire('click', { target: skill });
  assert.equal(p.shown(), true);
  assert.equal(p.tip().children[0].textContent, 'JavaScript');
  p.fire('click', { target: skill });
  assert.equal(p.shown(), false, 'a second tap closes it');
  p.fire('click', { target: action });
  assert.equal(p.shown(), false, 'a tap on a button that does something just does it');
});

test('installTooltips: Esc closes the tip and stops the dialog closing on that same Esc, once', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const dialog = new p.El('dialog', { open: '' }).at(100, 100, 900, 500);
  p.doc.body.append(dialog);
  const { mark } = p.field(dialog);
  p.fire('click', { target: mark });
  assert.equal(p.tip().parentNode, dialog, 'in the open dialog (outside it, a modal makes it inert)');
  const key = p.fire('keydown', { key: 'Escape', target: mark });
  assert.equal(p.shown(), false);
  assert.ok(key.defaultPrevented && key.stopped);
  assert.equal(p.fire('cancel', { target: dialog }).defaultPrevented, true, 'the dialog stays open');
  p.fire('keyup', { key: 'Escape' });
  assert.equal(p.fire('keydown', { key: 'Escape', target: mark }).defaultPrevented, false, 'no tip: Esc is the page’s');
  assert.equal(p.fire('cancel', { target: dialog }).defaultPrevented, false, 'and the dialog closes');
  // The dialog closing takes an open tip with it.
  p.fire('click', { target: mark });
  p.fire('close', { target: dialog });
  assert.equal(p.shown(), false);
});

test('installTooltips: outside a dialog, Esc closes the tip and the page’s own Esc still runs on that press', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  // (Photo mode's Save Picture, focused on entry: its tip shows, and one Esc leaves photo mode.)
  const save = new p.El('button', { 'data-tip': 'Save this frame as a PNG.' }).at(600, 650, 120, 40);
  p.doc.body.append(save);
  save.focusVisible = true;
  p.fire('focusin', { target: save });
  assert.equal(p.shown(), true);
  const key = p.fire('keydown', { key: 'Escape', target: save });
  assert.equal(p.shown(), false, 'the tip goes');
  assert.ok(!key.defaultPrevented && !key.stopped, 'and the key goes on to the page');
  // Nor is the next dialog's cancel stopped by it.
  p.fire('keyup', { key: 'Escape' });
  const dialog = new p.El('dialog', { open: '' }).at(100, 100, 900, 500);
  p.doc.body.append(dialog);
  assert.equal(p.fire('cancel', { target: dialog }).defaultPrevented, false);
});

test('installTooltips: a tip goes when its trigger is drawn over, or scrolls out of the box it is in', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const panel = new p.El('div').at(800, 50, 400, 600);
  panel.overflow = 'auto';
  p.doc.body.append(panel);
  const { mark } = p.field(panel, { left: 900, top: 300 });
  p.fire('click', { target: mark });
  assert.equal(p.shown(), true);
  p.fire('scroll', { target: panel });
  p.frame();
  assert.equal(p.shown(), true, 'still in view: placed again');
  mark.at(900, 20, 14, 14); // (scrolled up past the panel's top)
  p.fire('scroll', { target: panel });
  p.frame();
  assert.equal(p.shown(), false, 'out of its box: gone');
  p.fire('click', { target: mark });
  mark.at(900, 300, 14, 14);
  mark.remove(); // (the panel redrawn)
  p.frame();
  assert.equal(p.shown(), false, 'its trigger gone: gone');
});

test('installTooltips: once per page; destroy takes it all away; without the Popover API it still shows', () => {
  const p = page();
  const one = installTooltips({ doc: p.doc });
  assert.equal(installTooltips({ doc: p.doc }), one, 'a second install is the first');
  one.destroy();
  assert.ok(
    [...p.listeners.values()].every((s) => s.size === 0),
    'no listeners left',
  );
  const { mark } = p.field();
  p.fire('click', { target: mark });
  assert.equal(p.tip(), undefined);
  const old = page({ popover: false });
  installTooltips({ doc: old.doc });
  const f = old.field();
  old.fire('click', { target: f.mark });
  assert.equal(old.shown(), true);
  assert.equal(old.tip().attrs.popover, undefined);
  old.fire('keydown', { key: 'Escape', target: f.mark });
  assert.equal(old.tip().hidden, true);
});

test('installTooltips: pressing a button that has a tip drops its tip, on the way or showing (a "?" toggles as before)', () => {
  const p = page();
  installTooltips({ doc: p.doc });
  const button = new p.El('button', { 'data-tip': 'Opens a menu under it.' }).at(400, 10, 80, 30);
  p.doc.body.append(button);
  // Pressed before its tip came: it doesn't come after (over the menu the press opened).
  p.fire('pointerover', { target: button, pointerType: 'mouse' });
  p.tick(200);
  p.fire('pointerdown', { target: button, pointerType: 'mouse' });
  p.tick(1000);
  assert.equal(p.shown(), false);
  // Pressed while it shows: it goes.
  p.fire('pointerout', { target: button, relatedTarget: p.doc.body, pointerType: 'mouse' });
  p.fire('pointerover', { target: button, pointerType: 'mouse' });
  p.tick(400);
  assert.equal(p.shown(), true);
  p.fire('pointerdown', { target: button, pointerType: 'mouse' });
  assert.equal(p.shown(), false);
  // A "?" hovered then clicked: its tip stays, now the click's.
  const { mark } = p.field();
  p.fire('pointerover', { target: mark, pointerType: 'mouse' });
  p.tick(400);
  p.fire('pointerdown', { target: mark, pointerType: 'mouse' });
  p.fire('click', { target: mark });
  assert.equal(p.shown(), true);
  p.fire('pointerout', { target: mark, relatedTarget: p.doc.body, pointerType: 'mouse' });
  p.tick(1000);
  assert.equal(p.shown(), true, 'opened by the click: it stays');
});
