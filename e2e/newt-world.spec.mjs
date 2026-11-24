import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { TUNE } from '../src/invitation/brain.js';
import { CLIPS } from '../src/invitation/clips.js';
import { PAGES } from '../src/visualizer/newt/pages.js';

const ready = async (page, path = '/visualizer/?world=newt&bench') => {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
};

const awayFromOrigin = async (page) => {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = window.__viz.fire.snapshot().newt?.root;
          return root ? Math.hypot(root.x, root.z) : 0;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0.2);
};

test('the URL world lasts one visit and another setting change does not save it', async ({ page }) => {
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__viz.settings.world)).toBe('newt');
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="page"]').selectOption('cream');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? 'null')?.page ?? null))
    .toBe('cream');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? 'null')?.world)).toBe('bonfire');

  await ready(page, '/visualizer/?bench');
  await expect.poll(() => page.evaluate(() => window.__viz.settings.world)).toBe('bonfire');
  expect(await page.evaluate(() => typeof window.__viz.fire.snapshot)).toBe('undefined');
});

test('the empty NEWT canvas is exactly one page color on every page', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  for (const [key, paper] of Object.entries(PAGES)) {
    await page.evaluate((pageKey) => localStorage.setItem('bonfire-live', JSON.stringify({ page: pageKey })), key);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => window.__viz.settings.world)).toBe('newt');
    await awayFromOrigin(page);
    const dataUrl = await page.evaluate(async () => {
      const blob = await window.__viz.fire.capture();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    });
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    // The page remains flat outside NEWT and his shadow. This corner is outside the
    // actor in the default framing; the projected-chest test below checks presence.
    const { width, height } = await sharp(png).metadata();
    const { data } = await sharp(png)
      .extract({
        left: 0,
        top: 0,
        width: Math.max(1, Math.floor(width / 10)),
        height: Math.max(1, Math.floor(height / 10)),
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const colors = new Set();
    for (let i = 0; i < data.length; i += 3) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    const expected = `${(paper.color >> 16) & 255},${(paper.color >> 8) & 255},${paper.color & 255}`;
    expect([...colors], key).toEqual([expected]);
  }
});

test('page and duck survive a held breakdown and drop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page);
  await page.click('[data-source="demo"]');
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.flame)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Night drop builds page effects and Dusk fire leaves a darker scorch', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded-night')) {
      localStorage.setItem('bonfire-live', JSON.stringify({ page: 'night', pageTurns: 'off' }));
      sessionStorage.setItem('seeded-night', 'yes');
    }
  });
  await ready(page);
  await page.click('[data-source="demo"]');
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().rings.marks)).toBeGreaterThan(0);
  await page.evaluate(() => localStorage.setItem('bonfire-live', JSON.stringify({ page: 'dusk', pageTurns: 'off' })));
  // A fresh visit avoids carrying the previous ring into the scorch comparison.
  await page.goto('/visualizer/?world=newt&bench');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const capture = async () => {
    const dataUrl = await page.evaluate(async () => {
      const blob = await window.__viz.fire.capture();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    });
    const { data } = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let i = 0; i < data.length; i += 3)
      if (
        data[i] + data[i + 1] + data[i + 2] <
        PAGES.dusk.color
          .toString(16)
          .match(/../g)
          .reduce((s, v) => s + parseInt(v, 16), 0) -
          20
      )
        dark++;
    return dark;
  };
  const before = await capture();
  await page.evaluate(() => window.__viz.fire.onEvent('dropfx', { names: ['ring'] }));
  await expect.poll(capture, { timeout: 15_000 }).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test('world hides bonfire controls and Page changes immediately without rebuilding', async ({ page }) => {
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-world', 'newt');
  await expect(page.locator('.viz-scene-chip')).toHaveCount(0);
  await expect(page.locator('.pack')).toBeHidden();
  await expect(page.locator('[data-act="combo"]')).toBeHidden();
  await expect(page.locator('[data-act="dance"]')).toBeHidden();
  await page.locator('canvas.bonfire-canvas').evaluate((canvas) => {
    canvas.dataset.sameWorld = 'yes';
  });
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="page"]').selectOption('cream');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().page.name)).toBe('Cream');
  await expect(page.locator('canvas.bonfire-canvas')).toHaveAttribute('data-same-world', 'yes');
  await page.locator('[data-set="world"]').selectOption('bonfire');
  await expect
    .poll(() => page.evaluate(() => typeof window.__viz.fire.snapshot), { timeout: 30_000 })
    .toBe('undefined');
  await expect(page.locator('html')).toHaveAttribute('data-world', 'bonfire');
  await expect(page.locator('.pack')).toBeVisible();
});

test('floating letter seal snapshots equal the half-texel values actually placed', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { hold: true });
  });
  const samples = [];
  for (let i = 0; i < 20; i++) {
    await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.seal ?? null)).not.toBeNull();
    samples.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const off = window.__viz.fire.onRendered(() => {
              off();
              resolve({ ...window.__viz.fire.snapshot().letter.seal, size: window.__viz.fire.snapshot().size });
            });
          }),
      ),
    );
  }
  for (const seal of samples) {
    for (const value of [seal.x, seal.y, ...seal.axes]) expect(Number.isInteger(value * 2)).toBe(true);
    expect(seal.placedAt.x).toBe(seal.x);
    expect(seal.placedAt.y).toBe(seal.y);
    expect(seal.placedAt.faceMatches).toBe(true);
    expect(seal.placedAt.radius).toBeCloseTo(
      Math.sqrt(Math.abs(seal.axes[0] * seal.axes[3] - seal.axes[1] * seal.axes[2])),
      5,
    );
    expect(seal.x).toBeGreaterThanOrEqual(0);
    expect(seal.x).toBeLessThan(seal.size.w);
    expect(seal.y).toBeGreaterThanOrEqual(0);
    expect(seal.y).toBeLessThan(seal.size.h);
  }
});

test('NEWT is ready on the page in Idle', async ({ page }) => {
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().newt?.clip)).toBe('Idle');
  expect(await page.evaluate(() => window.__viz.fire.snapshot().newt)).toMatchObject({
    state: 'idle',
    clip: 'Idle',
    grounded: true,
  });
});

test('a held letter at stage three emits a ring before release', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { hold: true });
  });
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  const before = await page.evaluate(() => window.__viz.fire.snapshot().rings.marks);
  await page.evaluate(() => window.__viz.fire.onEvent('stage', { stage: 3 }));
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().rings.marks)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
});

test('shot snapshots follow cuts and the held letter supplies the rig target', async ({ page }) => {
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().shot?.key)).toBe('clearing');
  const next = await page.evaluate(() => window.__viz.director.cut());
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().shot?.key)).toBe(next);
  expect(await page.evaluate(() => window.__viz.fire.snapshot().shot.name)).toBeTruthy();
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { hold: true });
  });
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.state)).toBe('floating');
  const target = await page.evaluate(() => {
    const f = window.__viz.fire,
      p = f.snapshot().letter.frame;
    return { mid: f.blade.mid.toArray(), letter: [p.x, p.y, p.z] };
  });
  expect(target.mid).toEqual(target.letter);
});

const pixels = async (page) => {
  const result = await page.evaluate(async () => {
    const fire = window.__viz.fire;
    let snapshot;
    const off = fire.onRendered(() => {
      snapshot = fire.snapshot();
      off();
    });
    const blob = await fire.capture();
    const url = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
    return { url, snapshot };
  });
  const png = Buffer.from(result.url.split(',')[1], 'base64');
  await test.info().attach('render', { body: png, contentType: 'image/png' });
  return { ...(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })), snapshot: result.snapshot };
};
const region = ({ data, info }, center, rx, ry, predicate) => {
  let count = 0,
    total = 0;
  for (
    let y = Math.max(0, Math.floor((center.y - ry) * info.height));
    y < Math.min(info.height, (center.y + ry) * info.height);
    y++
  )
    for (
      let x = Math.max(0, Math.floor((center.x - rx) * info.width));
      x < Math.min(info.width, (center.x + rx) * info.width);
      x++
    ) {
      const i = (y * info.width + x) * 3;
      count += +predicate(data[i], data[i + 1], data[i + 2]);
      total++;
    }
  return { count, total };
};

test('NEWT fills his projected chest and trousers on Dusk with outlines off', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__viz.fire.setRender({ outlines: false }));
  await awayFromOrigin(page);
  const shot = await pixels(page),
    projected = shot.snapshot.projected;
  for (const point of [projected.chest, projected.hips]) {
    const found = region(shot, point, 0.008, 0.012, (r, g, b) => ((r << 16) | (g << 8) | b) !== PAGES.dusk.color);
    expect(found.count / found.total).toBeGreaterThan(0.6);
  }
});

for (const key of ['dusk', 'white', 'cream'])
  test(`NEWT casts a dark contact shadow on ${key}`, async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem('bonfire-live', JSON.stringify({ page: key })), key);
    await ready(page);
    await awayFromOrigin(page);
    const shot = await pixels(page),
      floor = shot.snapshot.projected.floor;
    // Only the ground beside the soles, opposite the sun; never his dark clothes.
    const color = PAGES[key].color,
      sum = (color >> 16) + ((color >> 8) & 255) + (color & 255);
    const found = region(
      shot,
      { x: floor.x + 0.045, y: floor.y - 0.035 },
      0.015,
      0.01,
      (r, g, b) => r + g + b < sum - 20,
    );
    expect(found.count).toBeGreaterThan(12);
  });

test('failed NEWT model load disposes its candidate canvas', async ({ page }) => {
  await page.route('**/models/newt.glb', (route) => route.abort());
  await page.goto('/visualizer/?world=newt&bench');
  await expect(page.locator('[data-error]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-stage] canvas')).toHaveCount(0);
});

test('burning letter loses its ink box as the paper disappears', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('bonfire-live', JSON.stringify({ page: 'cream', pageTurns: 'off' })),
  );
  await ready(page);
  await page.evaluate(() => window.__viz.fire.setRender({ outlines: true }));
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { hold: true });
  });
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.pose.arrive)).toBe(1);
  await page.evaluate(() => window.__viz.fire.onEvent('stage', { stage: 4 }));
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.state)).toBe('waiting');
  const ink = PAGES.cream.ink;
  const count = (shot) => {
    const { data, info, snapshot } = shot;
    const points = snapshot.projected.paper.map((p) => ({ x: p.x * info.width, y: p.y * info.height }));
    const seen = new Set();
    let inkPixels = 0,
      perimeter = 0;
    // The upper half of the left paper edge stays clear of NEWT and the impact ring.
    // Count only its visible perimeter, including when the phone view crops its top.
    for (const [a, b] of [[3, 0]]) {
      const from = points[a],
        to = points[b];
      const length = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
      for (let step = 0; step <= length / 2; step++) {
        const x = Math.round(from.x + ((to.x - from.x) * step) / length);
        const y = Math.round(from.y + ((to.y - from.y) * step) / length);
        if (x >= 0 && y >= 0 && x < info.width && y < info.height) perimeter++;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const px = x + dx,
              py = y + dy;
            if (px < 0 || py < 0 || px >= info.width || py >= info.height) continue;
            const index = py * info.width + px;
            if (seen.has(index)) continue;
            seen.add(index);
            const i = index * 3;
            inkPixels += +(((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === ink);
          }
      }
    }
    return { inkPixels, perimeter };
  };
  const before = count(await pixels(page));
  expect(before.inkPixels).toBeGreaterThan(20);
  const captured = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const fire = window.__viz.fire;
        const off = fire.onRendered(() => {
          const snapshot = fire.snapshot();
          if (snapshot.letter?.pose.dissolve > 0.9) {
            off();
            // Read this rendered frame before WebGL clears it; no host roundtrip can
            // advance the burn between the predicate, the image and the snapshot.
            resolve({ url: fire.canvas.toDataURL('image/png'), snapshot });
          }
        });
        fire.release();
      }),
  );
  const png = Buffer.from(captured.url.split(',')[1], 'base64');
  await test.info().attach('burn', { body: png, contentType: 'image/png' });
  const burning = {
    ...(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
    snapshot: captured.snapshot,
  };
  expect(burning.snapshot.letter.state).toBe('fading');
  expect(burning.snapshot.letter.pose.dissolve).toBeLessThan(1);

  expect(count(burning).inkPixels).toBeLessThan(before.inkPixels * 0.65);
  expect(count(burning).inkPixels / count(burning).perimeter).toBeLessThan(0.25);
});

test.describe('touch contact cue', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('NEWT has dark ground below his soles without shadow maps', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      window.__viz.fire.setPage('cream');
      window.__viz.fire.setRender({ outlines: false });
    });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await awayFromOrigin(page);
    const captured = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const fire = window.__viz.fire;
          const off = fire.onRendered(() => {
            off();
            resolve({ url: fire.canvas.toDataURL(), snapshot: fire.snapshot() });
          });
        }),
    );
    const png = Buffer.from(captured.url.split(',')[1], 'base64');
    await test.info().attach('touch-ground', { body: png, contentType: 'image/png' });
    const shot = {
        ...(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
        snapshot: captured.snapshot,
      },
      floor = shot.snapshot.projected.floor;
    const found = region(shot, { x: floor.x, y: floor.y + 0.015 }, 0.08, 0.008, (r, g, b) => r + g + b < 700);
    expect(found.count).toBeGreaterThan(12);
  });
});
test('switching a playing Bonfire scene to NEWT clears the scene and its chips', async ({ page }) => {
  await ready(page, '/visualizer/?bench');
  const chip = page.locator('[data-scene-chip]').first();
  const ref = await chip.getAttribute('data-scene-chip');
  await chip.click();
  await expect.poll(() => page.evaluate(() => window.__viz.director.sceneRef)).toBe(ref);
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="world"]').selectOption('newt');
  await expect.poll(() => page.evaluate(() => typeof window.__viz.fire.snapshot), { timeout: 30_000 }).toBe('function');
  await expect(page.locator('.viz-scene-chip')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__viz.director.sceneRef)).toBeNull();
  await page.locator('[data-tab="scenes"]').click();
  await page.locator('[data-scene-play]').first().click();
  await expect(page.locator('[data-settings]')).toBeVisible();
  expect(await page.evaluate(() => window.__viz.director.sceneRef)).toBeNull();
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="world"]').selectOption('bonfire');
  await expect
    .poll(() => page.evaluate(() => typeof window.__viz.fire.snapshot), { timeout: 30_000 })
    .toBe('undefined');
  expect(await page.evaluate(() => window.__viz.director.sceneRef)).toBeNull();
});

test('a live Cream page change paints the corner and the whole frame in its palette', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="page"]').selectOption('cream');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().page.name)).toBe('Cream');
  const url = await page.evaluate(async () => {
    const blob = await window.__viz.fire.capture();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
  const png = Buffer.from(url.split(',')[1], 'base64');
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const palette = new Set(PAGES.cream.palette);
  const unexpected = new Set();
  const corner = new Set();
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (!palette.has(color)) unexpected.add(color);
      if (x < Math.floor(info.width / 10) && y < Math.floor(info.height / 10)) corner.add(color);
    }
  expect([...corner]).toEqual([PAGES.cream.color]);
  expect([...unexpected]).toEqual([]);
});

test('tilted held paper stays inside The Letter and Vertigo throughout their moves', async ({ page }) => {
  test.setTimeout(90000);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.evaluate(() => {
      window.__viz.settings.camera = 'drift';
      window.__viz.director.frame(0, 0, { instant: true });
      void window.__viz.fire.equip('axe', 'ember', { hold: true });
    });
    await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.state)).toBe('floating');
    for (const key of ['blade', 'vertigo']) {
      const samples = await page.evaluate(async (shot) => {
        const { director, fire } = window.__viz;
        director.setShot(shot);
        return new Promise((resolve) => {
          const start = performance.now(),
            result = [];
          let last = 0;
          const off = fire.onRendered(() => {
            const elapsed = performance.now() - start;
            if (!result.length || elapsed - last > 100) {
              result.push(fire.snapshot().projected.paper);
              last = elapsed;
            }
            if (elapsed >= 8100) {
              off();
              resolve(result);
            }
          });
        });
      }, key);
      expect(samples.length).toBeGreaterThan(20);
      for (const corners of samples)
        for (const corner of corners) {
          expect(corner.x, `${key} ${viewport.width} paper x`).toBeGreaterThan(0.02);
          expect(corner.x, `${key} ${viewport.width} paper x`).toBeLessThan(0.98);
          expect(corner.y, `${key} ${viewport.width} paper y`).toBeGreaterThan(0.02);
          expect(corner.y, `${key} ${viewport.width} paper y`).toBeLessThan(0.98);
        }
    }
  }
});

test('NEWT actually walks across the page with a moving projected body', async ({ page }) => {
  await ready(page);
  const before = await page.evaluate(() => window.__viz.fire.snapshot());
  await expect
    .poll(() => page.evaluate(() => window.__viz.fire.snapshot().newt?.clip), { timeout: 20_000 })
    .toBe('Walk');
  await expect
    .poll(
      () =>
        page.evaluate((start) => {
          const now = window.__viz.fire.snapshot();
          return Math.hypot(now.projected.chest.x - start.x, now.projected.chest.y - start.y);
        }, before.projected.chest),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0.02);
  const after = await page.evaluate(() => window.__viz.fire.snapshot());
  expect(after.newt.grounded).toBe(true);
  expect(after.newt.root.y).toBe(0);
  expect(Math.hypot(after.newt.root.x, after.newt.root.z)).toBeGreaterThan(0.1);
  expect(Math.hypot(after.newt.root.x, after.newt.root.z)).toBeLessThanOrEqual(2.01);
});

test('the carried model hangs below the letter over its moving root', async ({ page }) => {
  await ready(page);
  await awayFromOrigin(page);
  await page.evaluate(() => {
    const fire = window.__viz.fire;
    const hear = fire.hear;
    fire.setMaxFps(4);
    fire.hear = (f) => hear({ ...f, state: 'breakdown', build: 0.95 });
    void fire.equip('axe', 'ember', { hold: true });
  });
  // The frame loop caps simulation steps at 0.1 s. At 4 fps, Run's three seconds
  // take at least 7.5 wall seconds; judge the transition on the rendered letter clock.
  const carried = await page.evaluate(
    (budget) =>
      new Promise((resolve) => {
        const fire = window.__viz.fire;
        let started;
        const off = fire.onRendered(() => {
          const s = fire.snapshot();
          started ??= s.letter.time;
          if (s.newt.state === 'held' || s.letter.time - started >= budget) {
            off();
            resolve(s.newt.state);
          }
        });
      }),
    TUNE.runFor + 0.3,
  );
  expect(carried).toBe('held');
  await expect
    .poll(() => page.evaluate(() => window.__viz.fire.snapshot().newt.root.y), { timeout: 10_000 })
    .toBeGreaterThan(0.4);
  const samples = await page.evaluate(
    (cycle) =>
      new Promise((resolve) => {
        const fire = window.__viz.fire,
          started = fire.snapshot().letter.time,
          samples = [];
        const off = fire.onRendered(() => {
          const s = fire.snapshot();
          samples.push({
            letter: s.letter.frame,
            root: s.newt.root,
            headTop: s.projected.headTop,
            paper: s.projected.paper,
          });
          if (samples.length >= 60 && s.letter.time - started >= cycle) {
            off();
            resolve(samples);
          }
        });
      }),
    CLIPS.Held.length + 0.1,
  );
  for (const { letter, root, headTop, paper } of samples) {
    expect(Math.hypot(letter.x - root.x, letter.z - root.z)).toBeLessThan(0.1);
    // The rig's projected head bound includes the stylized hair; a collar-height estimate does not.
    expect(Math.max(...paper.map((p) => p.y))).toBeLessThan(headTop);
  }
});
