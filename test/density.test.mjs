// How many particles Bonfire Live and the Bonfire Painter draw (src/visualizer/density.js):
// Normal is the site's own counts, More and Max grow every count, an unknown level is More
// (Bonfire Live's default, and the Painter's), and the site's counts are left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENSITY, densityCounts } from '../src/visualizer/density.js';
import { DEFAULT_SETTINGS } from '../src/visualizer/director.js';
import { effects } from '../src/effects.js';

const site = () => structuredClone({ particles: effects.particles, fireflies: effects.fireflies });

test('Normal is the site’s own counts; More and Max grow every one; the site’s are left alone', () => {
  const base = site();
  const before = JSON.stringify(base);
  const normal = densityCounts(base, 'normal');
  assert.deepEqual(normal.particles, { fire: base.particles.fire, sparks: base.particles.sparks, forge: base.particles.forge, impact: base.particles.impact });
  assert.deepEqual(normal.fireflies, { count: base.fireflies.count, lights: base.fireflies.lights });
  const more = densityCounts(base, 'more');
  const max = densityCounts(base, 'max');
  for (const k of ['fire', 'sparks', 'forge', 'impact']) {
    assert.ok(more.particles[k] > normal.particles[k] && max.particles[k] > more.particles[k], k);
  }
  assert.ok(max.fireflies.count > more.fireflies.count && more.fireflies.count > normal.fireflies.count);
  assert.equal(JSON.stringify(base), before, 'pure');
  for (const k of ['fire', 'sparks', 'forge']) assert.ok(Number.isInteger(more.particles[k]), `${k} is a count`);
});

test('an unknown level is More: Bonfire Live’s default, the Painter’s level', () => {
  const base = site();
  assert.equal(DEFAULT_SETTINGS.particles, 'more');
  assert.deepEqual(densityCounts(base, 'lots'), densityCounts(base, 'more'));
  assert.deepEqual(densityCounts(base), densityCounts(base, 'more'));
  assert.deepEqual(Object.keys(DENSITY), ['normal', 'more', 'max']);
});
