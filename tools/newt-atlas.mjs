// NEWT's pixel atlas for the invitation toy (public/models/newt-atlas-pixel.png), made from the
// atlas inside public/models/newt.glb. At the toy's pixel sizes his shirt's black-and-white
// plaid (many small checks with thin grid lines) blurs into grey-brown mush; this redraws it as
// fewer, bigger, high-contrast checks (about 3-4 across his shirt front, so each is a few
// texels on a phone at 2×) and keeps everything else (skin, hair, trousers, shoes, buttons) as
// flat clean colours. character.js puts it on his atlas material (nearest, no mipmaps) while
// the pixel filter is on; Off keeps the glb's atlas. Re-runnable:
//
//   node tools/newt-atlas.mjs [--glb public/models/newt.glb] [--out public/models/newt-atlas-pixel.png]
//        [--checks 3.5] [--pattern checker|gingham] [--tones 236,118,26]
//        [--islands <png>] [--mask <png>] [--preview <png>]
//
//   --checks   checks across his shirt front (its width at his chest over a check's size)
//   --pattern  checker: black and white squares (the default: at 2× on a phone they read as
//              checks, where gingham's grey bands fade into the black and white); gingham: white
//              where no band crosses, grey where one does, black where both do (his plaid's own
//              three tones)
//   --tones    the white, the grey (gingham's) and the black, 0-255 grey levels
//   --islands  write the atlas with every UV triangle outlined in its mesh's colour (to check
//              the mask against the islands)
//   --mask     write which texels it found plaid (white), flat (grey), uncovered (black)
//   --preview  write the old atlas beside the new one
//
// How: every atlas triangle of every mesh is rasterized in UV space (each texel gets the
// triangle's bind-pose position and normal there; the atlas is smart-projected and the mirrored
// halves share UVs, so the pattern is made symmetric about x = 0 and both halves agree). A
// triangle is plaid when the texels it covers are mostly the plaid's greys (its black, grid
// lines, mid grey and white, never the shirt's solid dark grey), its white and its mid grey
// both well represented (a solid black sleeve, a white logo or a light grey sole isn't), or
// when it's mostly those greys and shares a UV edge with a plaid triangle (one that fell on a
// single black check); its texels in the plaid's greys get the new checks,
// worked out in 3D (bands across the two axes of the plane the surface faces most, a check's
// size from his chest's width), so the checks run on across the islands' seams. The other
// covered texels snap to the nearest of the atlas's own main colours (its antialiasing and
// noise gone), and the uncovered ones take the colour of the covered texel nearest them (a
// nearest sample just past an island's edge never picks up the black background).
import fs from 'node:fs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const GLB = opt('glb', 'public/models/newt.glb');
const OUT = opt('out', 'public/models/newt-atlas-pixel.png');
const CHECKS = Number(opt('checks', '3.5'));
const PATTERN = opt('pattern', 'checker');
const TONES = opt('tones', '236,118,26').split(',').map(Number);
const ISLANDS = opt('islands', null);
const MASK = opt('mask', null);
const PREVIEW = opt('preview', null);
/**
 * The plaid's tones: greys (channels within GREY of each other) outside SOLID, the luma band
 * of the shirt's solid dark grey (#383438, a touch purple, the same lightness as nothing in
 * the plaid: its black, its grid lines, its mid grey and its white all sit outside it). Its
 * light tones are over LIGHT.
 */
const GREY = 8;
const SOLID = [0.17, 0.235];
const LIGHT = 0.33;
/** The plaid's white and its mid grey, as luma (the shoes' solid light grey is neither). */
const WHITE = 0.8;
const MID = [0.36, 0.47];
/**
 * A triangle seeds the plaid when this share of its texels is the plaid's tones, and the
 * second share each its white and its mid grey; a neighbour (sharing a UV edge, in the same
 * mesh) joins it with the first share alone (a triangle that fell on one black check).
 */
const PLAID_SHARE = [0.75, 0.08];
/** Main colours: 5-bit bins holding at least this share of the flat texels. */
const MAIN_SHARE = 0.002;

/** The glb's JSON and a reader for its accessors (plain, any stride). */
function readGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const bin = 20 + jsonLen + 8;
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const READ = {
    5126: (o) => buf.readFloatLE(o),
    5125: (o) => buf.readUInt32LE(o),
    5123: (o) => buf.readUInt16LE(o),
    5121: (o) => buf.readUInt8(o),
  };
  const BYTES = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 };
  /** @param {number} index  an accessor's: its values, flat */
  const accessor = (index) => {
    const a = gltf.accessors[index];
    const view = gltf.bufferViews[a.bufferView];
    const n = SIZE[a.type];
    const stride = view.byteStride ?? n * BYTES[a.componentType];
    const at = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = new Float64Array(a.count * n);
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < n; k++) out[i * n + k] = READ[a.componentType](at + i * stride + k * BYTES[a.componentType]);
    return out;
  };
  /** @param {number} index  an image's bytes */
  const image = (index) => {
    const view = gltf.bufferViews[gltf.images[index].bufferView];
    const at = bin + (view.byteOffset ?? 0);
    return buf.subarray(at, at + view.byteLength);
  };
  return { gltf, accessor, image };
}

const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** What a pixel is to the plaid: 'l' one of its light tones, 'd' one of its dark ones, '' neither. */
function plaidTone(r, g, b) {
  if (Math.max(r, g, b) - Math.min(r, g, b) > GREY) return '';
  const l = luma(r, g, b);
  if (l >= SOLID[0] && l <= SOLID[1]) return '';
  return l > LIGHT ? 'l' : 'd';
}

const { gltf, accessor, image } = readGlb(GLB);
const atlasMaterial = gltf.materials.findIndex((m) => m.name === 'NEWT_Atlas');
if (atlasMaterial < 0) throw new Error(`${GLB}: no NEWT_Atlas material`);
const texture = gltf.textures[gltf.materials[atlasMaterial].pbrMetallicRoughness.baseColorTexture.index];
const src = await sharp(image(texture.extensions?.EXT_texture_webp?.source ?? texture.source))
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = src.info.width;
const H = src.info.height;
const px = src.data;

// --- Every atlas triangle, rasterized in UV space.
/** @type {Array<{mesh: number, p: number[][], n: number[][], uv: number[][]}>} */
const tris = [];
gltf.meshes.forEach((mesh, mi) => {
  for (const prim of mesh.primitives) {
    if (prim.material !== atlasMaterial) continue;
    const pos = accessor(prim.attributes.POSITION);
    const nor = accessor(prim.attributes.NORMAL);
    const uv = accessor(prim.attributes.TEXCOORD_0);
    const idx = prim.indices !== undefined ? accessor(prim.indices) : Float64Array.from(pos.map((_, i) => i));
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const v = [idx[t], idx[t + 1], idx[t + 2]];
      tris.push({
        mesh: mi,
        p: v.map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]),
        n: v.map((i) => [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]]),
        uv: v.map((i) => [uv[i * 2] * W, uv[i * 2 + 1] * H]),
      });
    }
  }
});

/** Each texel's triangle (index into tris, -1 uncovered) and its bind-pose position and normal there. */
const owner = new Int32Array(W * H).fill(-1);
const where = new Float32Array(W * H * 3);
const facing = new Float32Array(W * H * 3);
/** Calls `fn(x, y, [a, b, c])` for each texel centre inside the triangle (barycentric weights). */
function raster(uv, fn) {
  const [[x0, y0], [x1, y1], [x2, y2]] = uv;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-9) return;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const b = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / det;
      const c = ((x0 - cx) * (y1 - cy) - (x1 - cx) * (y0 - cy)) / det;
      const a = 1 - b - c;
      if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) fn(x, y, [a, b, c]);
    }
}
tris.forEach((t, ti) =>
  raster(t.uv, (x, y, w) => {
    const o = y * W + x;
    owner[o] = ti;
    for (let k = 0; k < 3; k++) {
      where[o * 3 + k] = w[0] * t.p[0][k] + w[1] * t.p[1][k] + w[2] * t.p[2][k];
      facing[o * 3 + k] = w[0] * t.n[0][k] + w[1] * t.n[1][k] + w[2] * t.n[2][k];
    }
  }),
);

// --- Which triangles are plaid: their texels mostly the plaid's tones, a fair share light;
// then their neighbours that are mostly its tones too, until none joins.
const counts = tris.map(() => ({ n: 0, l: 0, d: 0, white: 0, mid: 0 }));
for (let o = 0; o < W * H; o++) {
  if (owner[o] < 0) continue;
  const c = counts[owner[o]];
  c.n++;
  const [r, g, b] = [px[o * 3], px[o * 3 + 1], px[o * 3 + 2]];
  const tone = plaidTone(r, g, b);
  if (!tone) continue;
  c[tone]++;
  const l = luma(r, g, b);
  if (l > WHITE) c.white++;
  else if (l > MID[0] && l < MID[1]) c.mid++;
}
const toned = (c) => c.n > 0 && (c.l + c.d) / c.n >= PLAID_SHARE[0];
const plaid = counts.map((c) => toned(c) && c.white / c.n >= PLAID_SHARE[1] && c.mid / c.n >= PLAID_SHARE[1]);
{
  /** @type {Map<string, number[]>} each UV edge's triangles (by its two ends, rounded) */
  const edges = new Map();
  const key = ([x0, y0], [x1, y1]) => {
    const a = `${x0.toFixed(2)},${y0.toFixed(2)}`;
    const b = `${x1.toFixed(2)},${y1.toFixed(2)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  tris.forEach((t, ti) => {
    for (let k = 0; k < 3; k++) {
      const e = `${t.mesh}:${key(t.uv[k], t.uv[(k + 1) % 3])}`;
      edges.set(e, [...(edges.get(e) ?? []), ti]);
    }
  });
  for (let grew = true; grew;) {
    const joining = [...edges.values()]
      .filter((list) => list.some((ti) => plaid[ti]))
      .flat()
      .filter((ti) => !plaid[ti] && toned(counts[ti]));
    for (const ti of joining) plaid[ti] = true;
    grew = joining.length > 0;
  }
}
/** A texel the new plaid covers: in a plaid triangle, one of the plaid's tones (not the solid grey beside it). */
const isPlaid = (o) => owner[o] >= 0 && plaid[owner[o]] && plaidTone(px[o * 3], px[o * 3 + 1], px[o * 3 + 2]) !== '';

// --- The check's size: his shirt front's width at the chest (the plaid texels facing +z, in
// the band of heights where it's widest), over CHECKS.
let chest = { width: 0, y: 0 };
{
  const rows = new Map();
  for (let o = 0; o < W * H; o++) {
    if (!isPlaid(o) || facing[o * 3 + 2] < 0.7) continue;
    const y = Math.round(where[o * 3 + 1] * 10) / 10;
    const r = rows.get(y) ?? { min: Infinity, max: -Infinity };
    r.min = Math.min(r.min, where[o * 3]);
    r.max = Math.max(r.max, where[o * 3]);
    rows.set(y, r);
  }
  for (const [y, r] of rows) if (r.max - r.min > chest.width) chest = { width: r.max - r.min, y };
}
const CHECK = chest.width / CHECKS;
console.log(
  `shirt front ${chest.width.toFixed(2)} units wide at y ${chest.y}; a check ${CHECK.toFixed(3)} units (${CHECKS} across)`,
);

/** The new plaid's grey at a bind-pose point facing `n`: bands across the plane it faces most. */
function check(p, n) {
  const [ax, ay, az] = n.map(Math.abs);
  // (Across his body, |x|: the mirrored halves share texels, and a band sits centred on x = 0.)
  const x = Math.abs(p[0]) / CHECK + 0.5;
  const y = p[1] / CHECK;
  const z = p[2] / CHECK + 0.5;
  const [u, v] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [z, y] : [x, z];
  const bu = Math.floor(u) & 1;
  const bv = Math.floor(v) & 1;
  if (PATTERN === 'checker') return bu ^ bv ? TONES[2] : TONES[0];
  return TONES[[0, 1, 2][bu + bv]];
}

// --- The main colours of the rest, for snapping.
const bins = new Map();
let flat = 0;
for (let o = 0; o < W * H; o++) {
  if (owner[o] < 0 || isPlaid(o)) continue;
  flat++;
  const key = ((px[o * 3] >> 3) << 10) | ((px[o * 3 + 1] >> 3) << 5) | (px[o * 3 + 2] >> 3);
  const b = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
  b.n++;
  b.r += px[o * 3];
  b.g += px[o * 3 + 1];
  b.b += px[o * 3 + 2];
  bins.set(key, b);
}
/** @type {number[][]} */
const main = [];
for (const b of [...bins.values()].sort((a, c) => c.n - a.n)) {
  if (b.n < flat * MAIN_SHARE) break;
  const c = [b.r / b.n, b.g / b.n, b.b / b.n].map(Math.round);
  // (Two bins of one colour, split by a bin's edge, are one main colour.)
  if (!main.some((m) => Math.hypot(m[0] - c[0], m[1] - c[1], m[2] - c[2]) < 12)) main.push(c);
}
const nearest = (r, g, b) =>
  main.reduce((best, m) =>
    Math.hypot(m[0] - r, m[1] - g, m[2] - b) < Math.hypot(best[0] - r, best[1] - g, best[2] - b) ? m : best,
  );
console.log(
  `${main.length} main colours: ${main.map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`).join(' ')}`,
);

// --- The new atlas.
const out = Buffer.alloc(W * H * 3);
const done = new Uint8Array(W * H);
for (let o = 0; o < W * H; o++) {
  if (owner[o] < 0) continue;
  let c;
  if (isPlaid(o)) {
    const g = check(
      [where[o * 3], where[o * 3 + 1], where[o * 3 + 2]],
      [facing[o * 3], facing[o * 3 + 1], facing[o * 3 + 2]],
    );
    c = [g, g, g];
  } else c = nearest(px[o * 3], px[o * 3 + 1], px[o * 3 + 2]);
  out.set(c, o * 3);
  done[o] = 1;
}
// The uncovered texels: the nearest covered colour, grown out a texel a pass.
for (let pass = 0; pass < 64; pass++) {
  const next = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = y * W + x;
      if (done[o]) continue;
      const from = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].find(([nx, ny]) => nx >= 0 && ny >= 0 && nx < W && ny < H && done[ny * W + nx]);
      if (from) next.push([o, from[1] * W + from[0]]);
    }
  if (!next.length) break;
  for (const [o, from] of next) {
    out.copyWithin(o * 3, from * 3, from * 3 + 3);
    done[o] = 1;
  }
}
await sharp(out, { raw: { width: W, height: H, channels: 3 } })
  .png({ compressionLevel: 9, palette: true, colours: Math.min(256, main.length + TONES.length), dither: 0 })
  .toFile(OUT);
const plaidTris = plaid.filter(Boolean).length;
console.log(`✓ ${OUT}: ${W}×${H}, ${plaidTris} of ${tris.length} triangles plaid`);

if (MASK) {
  const m = Buffer.alloc(W * H);
  for (let o = 0; o < W * H; o++) m[o] = owner[o] < 0 ? 0 : isPlaid(o) ? 255 : 110;
  await sharp(m, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toFile(MASK);
  console.log(`✓ ${MASK}`);
}
if (ISLANDS) {
  const COLOURS = ['#ff3b30', '#34c759', '#007aff', '#ff9500', '#af52de', '#00c7be', '#ffcc00', '#ff2d55', '#5ac8fa'];
  const lines = tris
    .map((t) => {
      const pts = t.uv.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="${COLOURS[t.mesh % COLOURS.length]}" stroke-width="0.6"/>`;
    })
    .join('');
  const legend = gltf.meshes
    .map(
      (m, i) =>
        `<text x="8" y="${18 + i * 16}" font-size="14" fill="${COLOURS[i % COLOURS.length]}" font-family="monospace">${m.name}</text>`,
    )
    .join('');
  await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${lines}${legend}</svg>`), left: 0, top: 0 }])
    .png()
    .toFile(ISLANDS);
  console.log(`✓ ${ISLANDS}`);
}
if (PREVIEW) {
  await sharp({ create: { width: W * 2 + 16, height: H, channels: 3, background: '#808080' } })
    .composite([
      {
        input: await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 3 } })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
      {
        input: await sharp(out, { raw: { width: W, height: H, channels: 3 } })
          .png()
          .toBuffer(),
        left: W + 16,
        top: 0,
      },
    ])
    .png()
    .toFile(PREVIEW);
  console.log(`✓ ${PREVIEW}`);
}
