// NEWT's pixel face sheet (public/models/newt-face.png, made by tools/newt-face.mjs): the 2×2
// layout clips.js FACES reads, cells about as many pixels as his half face covers texels on a
// phone (so nearest sampling neither drops nor doubles a feature), no lone dark pixel and every
// feature at least 2 px each way (it survives a texel's rounding), solid eyes in the open
// faces, and four faces that differ from each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../public/models/newt-face.png', import.meta.url));
const CELLS = { neutral: [0, 0], blink: [1, 0], happy: [0, 1], surprised: [1, 1] };
const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

async function cells() {
  const { data, info } = await sharp(FILE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width / 2;
  const h = info.height / 2;
  /** @type {Record<string, {dark: boolean[], px: number[][], w: number, h: number}>} */
  const out = {};
  for (const [name, [cx, cy]] of Object.entries(CELLS)) {
    const px = [];
    const dark = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((cy * h + y) * info.width + cx * w + x) * 4;
        const c = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        px.push(c);
        dark.push(luma(c[0], c[1], c[2]) < 0.3);
      }
    out[name] = { dark, px, w, h };
  }
  return { out, info };
}

test('the pixel face: a 2×2 sheet of cells sized to his half face on a phone, opaque', async () => {
  const { out, info } = await cells();
  assert.ok(info.width % 2 === 0 && info.height % 2 === 0, 'two cells each way');
  const { w, h } = out.neutral;
  assert.ok(w >= 6 && w <= 14, `cell ${w} px wide: his half face is ~6–8 texels wide`);
  assert.ok(h >= 10 && h <= 24, `cell ${h} px tall: his face is ~11–14 texels tall`);
  for (const [name, c] of Object.entries(out))
    assert.ok(
      c.px.every((p) => p[3] === 255),
      `${name}: opaque`,
    );
});

test('the pixel face: no lone dark pixel, every feature at least 2 px each way; eyes in each; four different faces', async () => {
  const { out } = await cells();
  for (const [name, { dark, w, h }] of Object.entries(out)) {
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x];
    const seen = new Set();
    let n = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!on(x, y)) continue;
        n++;
        assert.ok(on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1), `${name}: (${x}, ${y}) alone`);
        if (seen.has(y * w + x)) continue;
        // The feature it's part of: at least 2 px across and 2 down (it survives a texel's rounding).
        const box = { l: x, r: x, t: y, b: y };
        const stack = [[x, y]];
        seen.add(y * w + x);
        while (stack.length) {
          const [px, py] = stack.pop();
          Object.assign(box, {
            l: Math.min(box.l, px),
            r: Math.max(box.r, px),
            t: Math.min(box.t, py),
            b: Math.max(box.b, py),
          });
          for (const [nx, ny] of [
            [px + 1, py],
            [px - 1, py],
            [px, py + 1],
            [px, py - 1],
          ])
            if (on(nx, ny) && !seen.has(ny * w + nx)) {
              seen.add(ny * w + nx);
              stack.push([nx, ny]);
            }
        }
        assert.ok(box.r > box.l && box.b > box.t, `${name}: the feature at (${x}, ${y}) is 2 px each way`);
      }
    assert.ok(n >= 4, `${name}: an eye's worth of dark pixels (${n})`);
  }
  const key = (c) => c.dark.map(Number).join('');
  const keys = Object.values(out).map(key);
  assert.equal(new Set(keys).size, 4, 'neutral, blink, happy and surprised each look different');
  // Open eyes are solid at this size: the eye's whites turned to ink (a white texel reads as noise).
  const ink = (c) => c.dark.filter(Boolean).length;
  assert.ok(ink(out.neutral) > ink(out.blink), 'an open eye holds more ink than a closed one');
  assert.ok(ink(out.surprised) >= ink(out.neutral), 'a surprised eye is at least as big as a neutral one');
});
