import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { DITHER_GLSL } from '../src/bonfire/flame.js';
import { PAGES, elementPalette } from '../src/visualizer/newt/pages.js';

const ready = async (page, path = '/visualizer/?world=newt&bench') => {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
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
    // centered Idle actor in the default framing; the projected-chest test below checks presence.
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
  expect(await page.evaluate(() => window.__viz.fire.snapshot().newt)).toEqual({
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
  const shot = await pixels(page),
    projected = shot.snapshot.projected;
  for (const [point, minimum] of [
    [projected.chest, 0.6],
    [projected.legs, 0.35],
  ]) {
    const found = region(shot, point, 0.008, 0.012, (r, g, b) => ((r << 16) | (g << 8) | b) !== PAGES.dusk.color);
    console.log('newt-presence', minimum, found.count / found.total);
    expect(found.count / found.total).toBeGreaterThan(minimum);
  }
});

for (const key of ['dusk', 'white', 'cream'])
  test(`NEWT casts a dark contact shadow on ${key}`, async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem('bonfire-live', JSON.stringify({ page: key })), key);
    await ready(page);
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

for (const reducedMotion of [false, true]) {
  test(
    reducedMotion
      ? 'reduced-motion fading letter loses its outlined box without dissolving'
      : 'burning letter loses its ink box as the paper disappears',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
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
        (reduced) =>
          new Promise((resolve) => {
            const fire = window.__viz.fire;
            const off = fire.onRendered(() => {
              const snapshot = fire.snapshot();
              const pose = snapshot.letter?.pose;
              if (pose && (reduced ? pose.fade > 0.45 : pose.dissolve > 0.9)) {
                off();
                // Read this rendered frame before WebGL clears it; no host roundtrip can
                // advance the burn between the predicate, the image and the snapshot.
                resolve({ url: fire.canvas.toDataURL('image/png'), snapshot });
              }
            });
            fire.release();
          }),
        reducedMotion,
      );
      const png = Buffer.from(captured.url.split(',')[1], 'base64');
      await test.info().attach('burn', { body: png, contentType: 'image/png' });
      const burning = {
        ...(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
        snapshot: captured.snapshot,
      };
      expect(burning.snapshot.letter.state).toBe('fading');
      expect(burning.snapshot.letter.pose.dissolve).toBeLessThan(1);
      if (reducedMotion) {
        expect(burning.snapshot.letter.pose.dissolve).toBe(0);
        expect(burning.snapshot.letter.pose.fade).toBeGreaterThan(0.45);
        expect(burning.snapshot.letter.pose.fade).toBeLessThan(1);
      }

      const boundary = count(burning);
      console.log(
        'letter-edge',
        reducedMotion,
        boundary.inkPixels / boundary.perimeter,
        burning.snapshot.letter.pose.fade,
      );
      expect(boundary.inkPixels).toBeLessThan(before.inkPixels * 0.65);
      expect(boundary.inkPixels / boundary.perimeter).toBeLessThan(0.25);
    },
  );
}

test.describe('touch contact cue', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('NEWT has dark ground below his soles without shadow maps', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      window.__viz.fire.setPage('cream');
      window.__viz.fire.setRender({ outlines: false });
    });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
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

const ringFrames = async (page, kind, times, scorchPage = null) => {
  await page.evaluate(async (kind) => {
    const fire = window.__viz.fire;
    await fire.equip('axe', 'ember', { instant: true, element: kind });
    fire.setRender({ outlines: false });
    await new Promise((resolve) => {
      const start = fire.snapshot().rings.time;
      const off = fire.onRendered(() => {
        if (fire.snapshot().rings.time - start > 1) {
          off();
          resolve();
        }
      });
    });
  }, kind);
  if (scorchPage) await page.evaluate((key) => window.__viz.fire.setPage(key), scorchPage);
  const captures = await page.evaluate(
    ({ times, scorchPage }) =>
      new Promise((resolve) => {
        const fire = window.__viz.fire,
          frames = [];
        let started;
        const off = fire.onRendered(() => {
          const now = scorchPage ? performance.now() / 1000 : fire.snapshot().rings.time;
          if (started === undefined) {
            frames.push({ url: fire.canvas.toDataURL(), snapshot: fire.snapshot(), elapsed: 0 });
            started = now;
            if (scorchPage) fire.setPage('dusk');
            fire.ring(1);
            if (scorchPage) fire.setPage(scorchPage);
            return;
          }
          const elapsed = now - started;
          if (elapsed >= times[frames.length - 1]) {
            frames.push({ url: fire.canvas.toDataURL(), snapshot: fire.snapshot(), elapsed });
            if (frames.length > times.length) {
              off();
              resolve(frames);
            }
          }
        });
      }),
    { times, scorchPage },
  );
  return Promise.all(
    captures.map(async (capture, i) => {
      const png = Buffer.from(capture.url.split(',')[1], 'base64');
      await test.info().attach(`${kind}-${i}-${capture.elapsed.toFixed(2)}s`, { body: png, contentType: 'image/png' });
      return {
        ...(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
        snapshot: capture.snapshot,
        elapsed: capture.elapsed,
      };
    }),
  );
};
const ringBand = (shot, predicate) => {
  const floor = shot.snapshot.projected.floor;
  let count = 0,
    total = 0;
  for (let y = 0; y < shot.info.height; y++)
    for (let x = 0; x < shot.info.width; x++) {
      const dx = x / shot.info.width - floor.x,
        dy = y / shot.info.height - floor.y;
      if (Math.abs(dx) < 0.035 || Math.abs(dx) > 0.16 || dy < -0.065 || dy > 0.07) continue;
      const i = (y * shot.info.width + x) * 3;
      total++;
      count += +predicate(shot.data[i], shot.data[i + 1], shot.data[i + 2], i);
    }
  return { count, total };
};
for (const pageKey of ['dusk', 'night']) {
  test(`a real-time fire ring draws flames around NEWT on ${pageKey}`, async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem('bonfire-live', JSON.stringify({ page: key, pageTurns: 'off' })),
      pageKey,
    );
    await ready(page);
    await page.evaluate(() => window.__viz.fire.setRender({ marks: false }));
    const shots = await ringFrames(page, 'fire', [0.12, 0.24]);
    const warm = new Set(PAGES[pageKey].palette.slice(2, 10));
    const flame = (r, g, b) => warm.has((r << 16) | (g << 8) | b);
    const before = ringBand(shots[0], flame).count;
    const peak = Math.max(...shots.slice(1).map((s) => ringBand(s, flame).count));
    console.log('fire-band', pageKey, { before, peak, times: shots.map((s) => s.elapsed) });
    expect(shots[1].elapsed).toBeLessThan(0.3);
    expect(peak - before).toBeGreaterThan(60);
  });
  test(`lightning bolts change between real rendered frames on ${pageKey}`, async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem('bonfire-live', JSON.stringify({ page: key, pageTurns: 'off' })),
      pageKey,
    );
    await ready(page);
    await page.evaluate(() => window.__viz.fire.setRender({ marks: false }));
    const shots = await ringFrames(page, 'lightning', [0.12, 0.24]);
    const change = ringBand(
      shots[2],
      (r, g, b, i) =>
        Math.abs(r - shots[1].data[i]) + Math.abs(g - shots[1].data[i + 1]) + Math.abs(b - shots[1].data[i + 2]) > 80,
    );
    console.log('lightning-band', pageKey, change);
    expect(change.count / change.total).toBeGreaterThan(0.05);
  });
}

for (const pageKey of ['dusk', 'white', 'cream']) {
  test(`a fire scorch remains darker than ${pageKey} after five seconds and during fade`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(
      (key) => localStorage.setItem('bonfire-live', JSON.stringify({ page: key, pageTurns: 'off' })),
      pageKey,
    );
    await ready(page);
    // Fire cannot be selected on a light page. Stamp on Dusk, then turn the paper;
    // the existing scorch must still darken White and Cream.
    if (pageKey !== 'dusk') await page.evaluate(() => window.__viz.fire.setPage('dusk'));
    const shots = await ringFrames(page, 'fire', [5.2, 5.5, 10, 14], pageKey);
    const paper = PAGES[pageKey].color;
    const sum = ((paper >> 16) & 255) + ((paper >> 8) & 255) + (paper & 255);
    const band = (shot) => {
      let dark = 0,
        bright = 0,
        total = 0;
      const floor = shot.snapshot.projected.ringCenter;
      const arc = shot.snapshot.projected.ring;
      const front = Math.max(...arc.map((p) => p.y)),
        back = Math.min(...arc.map((p) => p.y));
      const left = Math.min(...arc.map((p) => p.x)),
        right = Math.max(...arc.map((p) => p.x));
      const padding = (front - back) * 0.2;
      for (let y = 0; y < shot.info.height; y++)
        for (let x = 0; x < shot.info.width; x++) {
          const dy = y / shot.info.height - floor.y;
          if (
            x / shot.info.width < left - padding ||
            x / shot.info.width > right + padding ||
            dy < (front - floor.y) * 0.45 ||
            y / shot.info.height > front + padding
          )
            continue;
          const i = (y * shot.info.width + x) * 3,
            value = shot.data[i] + shot.data[i + 1] + shot.data[i + 2];
          dark += +(value < sum - 20);
          bright += +(value > sum + 20);
          total++;
        }
      return { dark, bright, total };
    };
    const counts = shots.map(band);
    console.log('scorch-band', pageKey, counts);
    expect(shots[1].elapsed).toBeGreaterThanOrEqual(5);
    for (const [i, count] of counts.entries())
      if (i) {
        expect(shots[i].snapshot.rings.marks).toBeGreaterThan(0);
        expect(count.dark - counts[0].dark).toBeGreaterThan(30);
        expect(count.bright - counts[0].bright).toBeLessThanOrEqual(2);
      }
  });
}

test('a held lightning drop emits only the selected impact ring', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('bonfire-live', JSON.stringify({ page: 'dusk', pageTurns: 'off' })),
  );
  await ready(page);
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { element: 'lightning', hold: true });
  });
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.pose.arrive)).toBe(1);
  await page.evaluate(() => window.__viz.fire.onEvent('stage', { stage: 4 }));
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.state)).toBe('waiting');
  const before = await page.evaluate(() => window.__viz.fire.snapshot().rings.marks);
  await page.evaluate(() => {
    const f = window.__viz.fire;
    f.onEvent('dropfx', { names: ['ring'] });
    f.release();
  });
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.state)).toBe('fading');
  const rings = await page.evaluate(() => window.__viz.fire.snapshot().rings);
  expect(rings.element).toBe('lightning');
  expect(rings.marks - before).toBe(2); // One impact scar and one ring stamp.
});

test('the mark surface draws colored glow with zero tint and discards empty texels', async ({ page }) => {
  // Render the actual surface fragment shader against controlled texture samples.
  // This distinguishes visible glow from merely retaining a glow-only fragment.
  const source = readFileSync(new URL('../src/visualizer/newt/elementRings.js', import.meta.url), 'utf8');
  const fragment = source.match(/fragmentShader: `([\s\S]*?)`/)[1].replace('${DITHER_GLSL}', DITHER_GLSL);
  const samples = await page.evaluate((fragment) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const gl = canvas.getContext('webgl');
    const shader = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(
      program,
      shader(
        gl.VERTEX_SHADER,
        'attribute vec2 position;varying vec2 vMarkUv;void main(){vMarkUv=vec2(.5);gl_Position=vec4(position,0.,1.);}',
      ),
    );
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision highp float;' + fragment));
    gl.linkProgram(program);
    gl.useProgram(program);
    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    const texture = (slot, name, rgba) => {
      gl.activeTexture(gl.TEXTURE0 + slot);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.uniform1i(gl.getUniformLocation(program, name), slot);
      return t;
    };
    texture(0, 'tMarks', [0, 0, 0, 0]);
    const glow = texture(1, 'tMarkGlow', [255, 180, 0, 255]);
    const sample = () => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const rgba = new Uint8Array(4);
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return [...rgba];
    };
    const lit = sample();
    gl.bindTexture(gl.TEXTURE_2D, glow);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const empty = sample();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { lit, empty };
  }, fragment);
  expect(samples.lit[0]).toBeGreaterThan(100);
  expect(samples.lit[1]).toBeGreaterThan(50);
  expect(samples.lit[2]).toBeLessThan(20);
  expect(samples.empty).toEqual([0, 0, 0, 0]);
});

for (const [pageKey, width] of [
  ['dusk', 1280],
  ['white', 1280],
  ['white', 390],
]) {
  test(`ice stays cold and inside the ${width}px ${pageKey} default shot`, async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: { width, height: width === 390 ? 844 : 800 },
      hasTouch: width === 390,
      storageState: test.info().project.use.storageState,
    });
    const page = await context.newPage();
    try {
      await page.addInitScript(
        (key) => localStorage.setItem('bonfire-live', JSON.stringify({ page: key, pageTurns: 'off' })),
        pageKey,
      );
      await ready(page);
      const shots = await ringFrames(page, 'ice', width === 390 ? [0.3, 0.6, 1] : [0.6]);
      const cold = new Set(elementPalette(PAGES[pageKey], 'ice').slice(5, 8));
      const bounds = (shot) => {
        let count = 0,
          minX = shot.info.width,
          maxX = -1;
        for (let y = 0; y < shot.info.height; y++)
          for (let x = 0; x < shot.info.width; x++) {
            const i = (y * shot.info.width + x) * 3;
            if (!cold.has((shot.data[i] << 16) | (shot.data[i + 1] << 8) | shot.data[i + 2])) continue;
            count++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
        return { count, minX, maxX };
      };
      const before = bounds(shots[0]);
      for (const shot of shots.slice(1)) {
        const after = bounds(shot);
        console.log('ice-band', pageKey, width, shot.elapsed, { before, after });
        expect(after.count - before.count).toBeGreaterThan(20);
        expect(after.minX).toBeGreaterThan(0);
        expect(after.maxX).toBeLessThan(shot.info.width - 1);
      }
    } finally {
      await context.close();
    }
  });
}

test('rendering and page/frame snapshot reads do not verify seal rasters', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sealChecks = 0;
    const set = WeakMap.prototype.set;
    window.__sealMapSet = set;
    WeakMap.prototype.set = function (key, value) {
      if (key?.isDataTexture && typeof value?.key === 'string' && typeof value?.matches === 'boolean')
        window.__sealChecks++;
      return set.call(this, key, value);
    };
  });
  try {
    await ready(page);
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const fire = window.__viz.fire;
          let frames = 0;
          const off = fire.onRendered(() => {
            if (++frames < 60) return;
            off();
            const automatic = window.__sealChecks;
            const snapshot = fire.snapshot();
            const pageName = snapshot.page.name,
              position = snapshot.letter.frame;
            const afterPosition = window.__sealChecks;
            const requested = JSON.parse(JSON.stringify(snapshot));
            resolve({
              automatic,
              afterPosition,
              afterRequested: window.__sealChecks,
              pageName,
              position,
              seal: requested.letter.seal,
            });
          });
          void fire.equip('axe', 'ember', { hold: true });
        }),
    );
    console.log('seal-verification', result.automatic, result.afterPosition, result.afterRequested);
    expect(result.automatic).toBe(0);
    expect(result.afterPosition).toBe(0);
    expect(result.pageName).toBeTruthy();
    expect(Number.isFinite(result.position.x)).toBe(true);
    expect(result.afterRequested).toBeGreaterThan(0);
    expect(result.seal.placedAt.faceMatches).toBe(true);
  } finally {
    await page.evaluate(() => {
      WeakMap.prototype.set = window.__sealMapSet;
      delete window.__sealMapSet;
    });
  }
});
