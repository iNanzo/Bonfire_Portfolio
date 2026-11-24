// Capture W6's own cameras at real speed; run from the repository root (see README).
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gateStateFor } from '../../../../e2e/lib/gateSetup.mjs';
import { NEWT_SHOTS } from '../../../../src/visualizer/newt/shots.js';
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const root = resolve(option('--root', '.'));
const tag = option('--tag', 'after');
const out = resolve(option('--out', 'docs/design/captures/newt-live-shots'));
const port = 5336;
const url = `http://127.0.0.1:${port}`;
const source = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await mkdir(out, { recursive: true });
const server = await createServer({
  root,
  cacheDir: resolve(root, '.scratch/vite-capture-5336'),
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, resolve('node_modules')] } },
  logLevel: 'warn',
});
await server.listen();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const records = [];
try {
  for (const [layout, viewport, tile] of [
    ['desktop', { width: 1280, height: 720 }, [480, 270]],
    ['phone', { width: 390, height: 844 }, [234, 506]],
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      hasTouch: layout === 'phone',
      storageState: await gateStateFor(root, url),
    });
    await context.addInitScript(() => {
      let s = 86;
      Math.random = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      localStorage.setItem(
        'bonfire-live',
        JSON.stringify({ world: 'newt', page: 'dusk', camera: 'drift', shot: 'clearing', pageTurns: -1 }),
      );
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const overview = [];
    for (const [key, shot] of Object.entries(NEWT_SHOTS)) {
      await page.goto(`${url}/visualizer/?world=newt&bench`);
      await page.locator('[data-stage].is-ready').waitFor({ timeout: 30000 });
      await page.addStyleTag({
        content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }',
      });
      await page.evaluate(async () => {
        const v = window.__viz;
        v.director.frame(0, 0, { instant: true });
        void v.fire.equip('axe', 'ember', { hold: true });
      });
      await page.waitForFunction(() => window.__viz.fire.snapshot().letter?.state === 'floating');
      await page.waitForTimeout(800);
      const clip = await page.evaluate(async (k) => {
        const canvas = document.querySelector('[data-stage] canvas');
        const stream = canvas.captureStream(30);
        const chunks = [],
          times = [];
        const mimeType = 'video/webm;codecs=vp9';
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1500000 });
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        const stopped = new Promise((done) => {
          recorder.onstop = done;
        });
        const start = performance.now();
        const off = window.__viz.fire.onRendered(() => times.push(performance.now() - start));
        window.__viz.director.setShot(k);
        recorder.start();
        await new Promise((done) => setTimeout(done, 8200));
        recorder.stop();
        await stopped;
        off();
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: mimeType });
        const data = await new Promise((done) => {
          const reader = new FileReader();
          reader.onload = () => done(reader.result);
          reader.readAsDataURL(blob);
        });
        return {
          data,
          times,
          durationMs: performance.now() - start,
          canvas: { width: canvas.width, height: canvas.height },
        };
      }, key);
      const snapshot = await page.evaluate(() => ({
        shot: window.__viz.director.shot,
        state: window.__viz.fire.snapshot(),
      }));
      if (snapshot.shot !== key || errors.length) throw new Error(JSON.stringify({ key, errors, snapshot }));
      const file = `${tag}-${layout}-${key}.webm`;
      await writeFile(resolve(out, file), Buffer.from(clip.data.split(',')[1], 'base64'));
      const still = await sharp(await page.screenshot())
        .resize(...tile, { kernel: 'nearest', fit: 'fill' })
        .png()
        .toBuffer();
      overview.push({
        input: still,
        left: (overview.length % 4) * tile[0],
        top: Math.floor(overview.length / 4) * tile[1],
      });
      const gaps = clip.times.slice(1).map((t, i) => t - clip.times[i]);
      const record = {
        key,
        name: shot.name,
        layout,
        file,
        viewport,
        canvas: clip.canvas,
        durationMs: clip.durationMs,
        renderedFrames: clip.times.length,
        maxFrameGapMs: Math.max(...gaps),
        times: clip.times.map((t) => Math.round(t)),
        source,
        snapshot,
      };
      records.push(record);
      await writeFile(resolve(out, `${tag}.json`), JSON.stringify(records, null, 2) + '\n');
      console.log(
        `${tag} ${layout} ${key}: ${record.renderedFrames} rendered frames; max gap ${Math.round(record.maxFrameGapMs)}ms`,
      );
    }
    await sharp({ create: { width: tile[0] * 4, height: tile[1] * 4, channels: 3, background: '#171320' } })
      .composite(overview)
      .png()
      .toFile(resolve(out, `${tag}-${layout}-overview.png`));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
