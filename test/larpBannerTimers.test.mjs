import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBanner, GAP_MS } from '../src/larp/banner.js';

test('banner native timers respect the display duration, gap and clearing queued awards', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const style = { setProperty() {}, removeProperty() {} };
  const nodes = {};
  const el = { style, hidden: true, querySelector: (key) => (nodes[key] ??= { style }) };
  // No projector attached: the default mirror must still allow the queue to progress.
  const banner = createBanner({ el });
  const lines = (title) => ({ title, subtitle: '', points: '+10' });
  banner.show(lines('First'), 1000);
  banner.show(lines('Second'), 2000);
  assert.equal(el.hidden, false);
  assert.equal(nodes['[data-banner-title]'].textContent, 'First');
  t.mock.timers.tick(999);
  assert.equal(el.hidden, false);
  t.mock.timers.tick(1);
  assert.equal(el.hidden, true);
  t.mock.timers.tick(GAP_MS);
  assert.equal(el.hidden, false);
  assert.equal(nodes['[data-banner-title]'].textContent, 'Second');
  banner.show(lines('Canceled'), 1000);
  banner.clear();
  t.mock.timers.tick(10000);
  assert.equal(el.hidden, true);
  assert.equal(banner.showing, false);
  assert.equal(banner.queued, 0);
  assert.equal(nodes['[data-banner-title]'].textContent, 'Second');
  banner.show(lines('Fresh'), 500);
  assert.equal(el.hidden, false);
  assert.equal(nodes['[data-banner-title]'].textContent, 'Fresh');
  t.mock.timers.tick(500);
  t.mock.timers.tick(GAP_MS);
  assert.equal(banner.showing, false);
});
