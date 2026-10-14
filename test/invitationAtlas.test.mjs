// NEWT's pixel atlas (public/models/newt-atlas-pixel.png, made by tools/newt-atlas.mjs from the
// atlas inside public/models/newt.glb): the same size as the glb's, opaque, a handful of flat
// colours; his shirt's plaid redrawn as big high-contrast black-and-white checks (greys only,
// far fewer changes along a row than the glb's small checks and grid lines), the solid areas
// (skin, his jacket's dark grey) one clean colour each, close to the glb's; and the tool
// re-runnable, making the same image again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'public/models/newt-atlas-pixel.png');
const GLB = path.join(ROOT, 'public/models/newt.glb');

/** The glb's atlas, RGB. */
async function glbAtlas() {
  const buf = fs.readFileSync(GLB);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const material = gltf.materials.find((m) => m.name === 'NEWT_Atlas');
  const texture = gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const view = gltf.bufferViews[gltf.images[texture.extensions?.EXT_texture_webp?.source ?? texture.source].bufferView];
  const at = 20 + jsonLen + 8 + (view.byteOffset ?? 0);
  return sharp(buf.subarray(at, at + view.byteLength))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}
const rgb = (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
/** The [r, g, b] of each texel of a rectangle [x, y, w, h] of an image. */
function rect({ data, info }, [x0, y0, w, h]) {
  const out = [];
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * info.width + x) * info.channels;
      out.push([data[i], data[i + 1], data[i + 2]]);
    }
  return out;
}
/** How often the colour changes from one texel to the next along the rows of a rectangle (a share). */
function changes(img, [x0, y0, w, h]) {
  const px = rect(img, [x0, y0, w, h]);
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 1; x < w; x++) {
      const a = px[y * w + x - 1];
      const b = px[y * w + x];
      if (Math.max(...a.map((v, k) => Math.abs(v - b[k]))) > 24) n++;
    }
  return n / (h * (w - 1));
}
/** Plaid in the glb's atlas: inside the shirt's islands (its front, a sleeve's cuff, its back). */
const PLAID = [
  [690, 125, 50, 90],
  [780, 125, 50, 90],
  [20, 800, 50, 120],
];
/** Solid areas: his face's skin, his jacket's dark grey. */
const SOLID = [
  [620, 270, 100, 110],
  [470, 370, 90, 110],
];

test('the pixel atlas: the glb’s size, opaque, a handful of flat colours', async () => {
  const img = await rgb(FILE);
  const src = await glbAtlas();
  assert.equal(img.info.width, src.info.width);
  assert.equal(img.info.height, src.info.height);
  const colours = new Set();
  for (let i = 0; i < img.data.length; i += 4) {
    assert.equal(img.data[i + 3], 255, 'opaque');
    colours.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  }
  assert.ok(colours.size <= 16, `${colours.size} colours: flat, no antialiasing or noise`);
});

test('the pixel atlas: his plaid as big high-contrast black-and-white checks', async () => {
  const img = await rgb(FILE);
  const src = await glbAtlas();
  for (const r of PLAID) {
    const px = rect(img, r);
    for (const [cr, cg, cb] of px) assert.ok(cr === cg && cg === cb, `${r}: greys only (${cr},${cg},${cb})`);
    const greys = px.map(([v]) => v);
    assert.ok(Math.max(...greys) >= 220, `${r}: a white (${Math.max(...greys)})`);
    assert.ok(Math.min(...greys) <= 40, `${r}: a black (${Math.min(...greys)})`);
    const now = changes(img, r);
    const before = changes(src, r);
    assert.ok(
      now <= before / 3,
      `${r}: a change every ${(1 / now).toFixed(0)} texels, the glb's every ${(1 / before).toFixed(0)}`,
    );
  }
});

test('the pixel atlas: a solid area is one clean colour, close to the glb’s', async () => {
  const img = await rgb(FILE);
  const src = await glbAtlas();
  for (const r of SOLID) {
    const px = rect(img, r);
    assert.equal(new Set(px.map(String)).size, 1, `${r}: one colour`);
    const mid = (list, k) => list.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const was = rect(src, r);
    for (let k = 0; k < 3; k++)
      assert.ok(Math.abs(px[0][k] - mid(was, k)) <= 8, `${r}: channel ${k} ${px[0][k]}, the glb's ${mid(was, k)}`);
  }
});

test('the atlas tool is re-runnable: it makes the same image again', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'newt-atlas-')), 'atlas.png');
  execFileSync(process.execPath, ['tools/newt-atlas.mjs', '--out', out], { cwd: ROOT, stdio: 'pipe' });
  const a = await rgb(FILE);
  const b = await rgb(out);
  assert.ok(a.data.equals(b.data), 'the same texels');
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
});
