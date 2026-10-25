import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutputWindow } from '../src/ui/output.js';

function fixture(t) {
  const saved = ['document', 'window'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  t.after(() => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });
  const handlers = {},
    winHandlers = {},
    mirrors = [],
    classes = new Set();
  const hint = {},
    video = { srcObject: null },
    tracks = [];
  let canvas = {
    captureStream: (fps) => {
      assert.equal(fps, 60);
      const track = {
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      tracks.push(track);
      return { getTracks: () => [track] };
    },
  };
  let focused = 0,
    fullscreen = 0,
    blocked = false,
    quiet;
  const doc = {
    documentElement: {
      dataset: {},
      style: {},
      requestFullscreen() {
        fullscreen++;
      },
    },
    body: {
      innerHTML: '',
      append: (node) => mirrors.push(node),
      classList: { add: (k) => classes.add(k), remove: (k) => classes.delete(k) },
    },
    head: {
      replaceChildren: (...children) => {
        doc.styles = children;
      },
    },
    querySelector: (s) => (s === 'video' ? video : hint),
    querySelectorAll: () => mirrors,
    createElement: () => ({}),
    importNode: (node) => {
      const copy = {
        dataset: { ...node.dataset },
        textContent: node.textContent,
        replaceWith(next) {
          mirrors.splice(mirrors.indexOf(this), 1, next);
        },
      };
      return copy;
    },
    addEventListener: (name, fn) => {
      handlers[name] = fn;
    },
    exitFullscreen() {
      fullscreen--;
    },
  };
  const out = {
    document: doc,
    closed: false,
    focus: () => focused++,
    addEventListener: (name, fn) => {
      winHandlers[name] = fn;
    },
    setTimeout: (fn) => {
      quiet = fn;
      return 0;
    },
  };
  const source = {
    documentElement: { dataset: { flame: 'amber' }, style: { cssText: '--ink: #fff' } },
    querySelectorAll: () => [
      { tagName: 'LINK', href: 'https://example.test/style.css' },
      { tagName: 'STYLE', cloneNode: () => ({ textContent: 'body {}' }) },
    ],
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: source });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: () => (blocked ? null : out) } });
  const notes = [],
    changes = [];
  const api = createOutputWindow({
    stage: { querySelector: () => canvas },
    name: 'game-output',
    title: 'Game — Output',
    note: (msg) => notes.push(msg),
    onChange: (open) => changes.push(open),
  });
  return {
    api,
    doc,
    out,
    video,
    tracks,
    notes,
    changes,
    mirrors,
    classes,
    handlers,
    winHandlers,
    blocked: (v) => {
      blocked = v;
    },
    canvas: (v) => {
      canvas = v;
    },
    focus: () => focused,
    fullscreen: () => fullscreen,
    quiet: () => quiet(),
  };
}

test('output refuses unavailable capture and blocked popups without claiming it is open', (t) => {
  const h = fixture(t);
  h.blocked(true);
  assert.equal(h.api.open(), false);
  assert.match(h.notes.at(-1), /blocked/);
  assert.equal(h.api.isOpen(), false);
  assert.deepEqual(h.changes, []);
  h.canvas(null);
  assert.equal(h.api.open(), false);
  assert.match(h.notes.at(-1), /can’t send/);
  h.api.mirror({ dataset: { mirror: 'board' } });
  h.api.stream();
  assert.deepEqual(h.mirrors, []);
});

test('output mirrors scoreboard replacements, streams a rebuilt canvas and reuses its popup', (t) => {
  const h = fixture(t);
  assert.equal(h.api.open(), true);
  assert.equal(h.doc.title, 'Game — Output');
  assert.deepEqual(h.changes, [true]);
  assert.equal(h.doc.styles[0].href, 'https://example.test/style.css');
  assert.equal(h.doc.styles[1].textContent, 'body {}');
  assert.equal(h.tracks.length, 1);
  h.api.mirror({ dataset: { mirror: 'board' }, textContent: 'Owls 10' });
  h.api.mirror({ dataset: { mirror: 'clock' }, textContent: '4:00' });
  h.api.mirror({ dataset: { mirror: 'board' }, textContent: 'Owls 20' });
  assert.deepEqual(
    h.mirrors.map((n) => n.textContent),
    ['Owls 20', '4:00'],
  );
  assert.equal(h.doc.documentElement.dataset.flame, 'amber');
  assert.equal(h.doc.documentElement.style.cssText, '--ink: #fff');
  h.api.stream();
  assert.equal(h.tracks[0].stopped, true, 'old capture track released when scene changes');
  assert.equal(h.tracks[1].stopped, false);
  assert.equal(h.api.open(), true);
  assert.equal(h.focus(), 1);
  assert.equal(h.tracks.length, 2, 'focusing existing output does not restart its stream');
  h.handlers.dblclick();
  assert.equal(h.fullscreen(), 1);
  h.doc.fullscreenElement = {};
  h.handlers.dblclick();
  assert.equal(h.fullscreen(), 0);
  h.quiet();
  assert.equal(h.classes.has('quiet'), true);
  h.handlers.pointermove();
  assert.equal(h.classes.has('quiet'), false);
  h.out.closed = true;
  h.winHandlers.pagehide();
  assert.equal(h.api.isOpen(), false);
  assert.deepEqual(h.changes, [true, false]);
  h.api.mirror({ dataset: { mirror: 'board' }, textContent: 'Owls 30' });
  assert.equal(h.mirrors[0].textContent, 'Owls 20');
});
