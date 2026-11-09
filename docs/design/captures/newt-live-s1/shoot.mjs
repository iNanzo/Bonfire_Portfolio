// Drives s1.html (the S1 spike) through Playwright and writes the captures beside it.
//   npx vite --port 5199 &   then   node docs/design/captures/newt-live-s1/shoot.mjs
// 1. NEWT alone, drawn by plain three.js (no pass), for his own colors: k-means over his texels
//    picks the tones for palette slots 10–15 and reports how far off 4, 6, 8 and 10 tones are.
// 2. Each page (White, Cream, Dusk, Night): the letter floating with its swirl, then a fire,
//    a lightning and an ice ring bursting at his feet.
// 3. Five looks on White and on Night.
import process from 'node:process';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const URL = process.env.S1_URL ?? 'http://localhost:5199/docs/design/captures/newt-live-s1/s1.html';
const browser = await chromium.launch({
  executablePath: process.env.S1_CHROME ?? undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL);
await page.waitForFunction(() => window.__s1?.ready, null, { timeout: 60000 });
await page.evaluate(() => window.__s1.ready);
const shot = async (name) => {
  const buf = await page.locator('canvas').screenshot();
  writeFileSync(join(here, `${name}.png`), buf);
  return buf.length;
};

// 1. His own colors: the texels a render with him differs from one without him (sRGB: the
// target is read as the renderer wrote it; three writes sRGB to an 8-bit target).
const [withHim, without] = await page.evaluate(() => {
  const s = window.__s1;
  s.setPage('white');
  s.advance(0.1);
  return [s.raw(true), s.raw(false)];
});
const px = [];
for (let i = 0; i < withHim.length; i += 4) {
  const d =
    Math.abs(withHim[i] - without[i]) +
    Math.abs(withHim[i + 1] - without[i + 1]) +
    Math.abs(withHim[i + 2] - without[i + 2]);
  if (d > 24) px.push([withHim[i], withHim[i + 1], withHim[i + 2]]);
}
function kmeans(k, iters = 30) {
  let cs = Array.from({ length: k }, (_, i) => px[Math.floor(((i + 0.5) * px.length) / k)]);
  let err = 0;
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    err = 0;
    for (const p of px) {
      let best = 0;
      let bd = Infinity;
      cs.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) [bd, best] = [d, j];
      });
      err += Math.sqrt(bd);
      const s = sum[best];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    }
    cs = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cs[j]));
  }
  return { cs, err: err / px.length };
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const fits = {};
for (const k of [4, 6, 8, 10]) fits[k] = kmeans(k);
const six = fits[6].cs.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
const tones = six.map((c) => parseInt(hex(c).slice(1), 16));

// 2. The pages.
const sizes = {};
for (const name of ['white', 'cream', 'dusk', 'night']) {
  await page.evaluate(
    ([n, t]) => {
      const s = window.__s1;
      s.setTones(t);
      s.setPage(n);
      s.setLook({ uInk: 0, uMirror: 0, uSplit: 0, uSlice: 0, uStyle: 0, uGlow: 0 });
      s.advance(3.5);
    },
    [name, tones],
  );
  sizes[`${name}-letter`] = await shot(`${name}-1-letter`);
  for (const [kind, after] of [
    ['fire', 0.5],
    ['lightning', 0.25],
    ['ice', 0.9],
  ]) {
    await page.evaluate(
      ([k, a]) => {
        window.__s1.burst(k);
        window.__s1.advance(a);
      },
      [kind, after],
    );
    sizes[`${name}-${kind}`] = await shot(`${name}-${kind === 'fire' ? 2 : kind === 'lightning' ? 3 : 4}-${kind}`);
    await page.evaluate(() => window.__s1.advance(2.5));
  }
}

// 3. Looks, held still.
const LOOKS = {
  ink: { uInk: 1 },
  mirror: { uMirror: 1 },
  glitch: { uSplit: 3, uSlice: 0.35, uSliceSeed: 7 },
  painterly: { uStyle: 1, uStyleR: 3, uStyleMix: 1 },
  glow: { uGlow: 0.9, uGlowSize: 3, uGlowCut: 0.55 },
};
for (const name of ['white', 'night']) {
  for (const [look, values] of Object.entries(LOOKS)) {
    await page.evaluate(
      ([n, v]) => {
        const s = window.__s1;
        s.setPage(n);
        s.setLook({ uInk: 0, uMirror: 0, uSplit: 0, uSlice: 0, uStyle: 0, uGlow: 0 });
        s.setLook(v);
        s.advance(0.2);
      },
      [name, values],
    );
    sizes[`${name}-look-${look}`] = await shot(`${name}-5-look-${look}`);
  }
}

await browser.close();
const report = {
  texelsOfNewt: px.length,
  meanError: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, +f.err.toFixed(1)])),
  tones: six.map(hex),
  bytes: sizes,
  errors,
};
writeFileSync(join(here, 's1-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
