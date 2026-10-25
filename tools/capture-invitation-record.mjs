// The record and the frames of tools/capture-invitation.mjs's acts: the page's own record of an
// act (startRecord and stopRecord run in the page: its frame times, where NEWT is on screen, his
// states and faces), Chrome's screencast of the act (realTime), its frames resampled at a steady
// rate and fitted to the output size, kept raw, cropped into a sheet's tiles and laid out in
// labelled grids, and what the report reads from the record (frameTimes, inFrame). recorder()
// takes the tool's options (--lead, --fps, --scale, --crop and --raw: LEAD, FPS, SCALE, CROP and
// RAW below).
import sharp from 'sharp';
import fs from 'node:fs';

/** Tiles of one size into a grid, each with its label, written to `file` (capture-knight's). */
export async function grid(tiles, cols, file, labels) {
  const { width: w, height: h } = await sharp(tiles[0]).metadata();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const comp = tiles.flatMap((t, i) => [
    { input: t, left: (i % cols) * w, top: Math.floor(i / cols) * h },
    {
      input: Buffer.from(
        `<svg width="${w}" height="20"><rect width="100%" height="20" fill="black" opacity="0.65"/><text x="5" y="14" font-family="monospace" font-size="12" fill="white">${esc(labels[i] ?? '')}</text></svg>`,
      ),
      left: (i % cols) * w,
      top: Math.floor(i / cols) * h,
    },
  ]);
  await sharp({
    create: { width: w * cols, height: h * Math.ceil(tiles.length / cols), channels: 3, background: '#000' },
  })
    .composite(comp)
    .png()
    .toFile(file);
  console.log(`✓ ${file}`);
}

/**
 * Starts a record in the page, every frame (requestAnimationFrame, the toy's own cadence): the
 * time between frames, where he is on screen (his head and the middle of his body, client px),
 * and each change of his state, clip, reaction or being held, his face, his stress (in tenths) and
 * the line in his speech bubble. Times are performance.now() ms.
 */
export function startRecord() {
  const rec = { on: true, raf: [], pos: [], line: [], faces: [], stress: [], says: [] };
  /** @type {any} */ (window).__capture = rec;
  let last = -1;
  let prev = '';
  let face = '';
  let stress = -1;
  /** @type {string|null} */
  let said = null;
  const tick = (now) => {
    if (!rec.on) return;
    if (last >= 0) rec.raf.push([now, now - last]);
    last = now;
    const inv = /** @type {any} */ (window).__invitation;
    const s = inv?.snapshot();
    if (s?.ready) {
      const h = inv.screen('head');
      const b = inv.screen('body');
      const f = inv.screen('feet');
      const r3 = (v) => Math.round(v * 1000) / 1000;
      // (Client px: head, middle, feet; then the camera's yaw, radians, his root on the floor, and
      // his heading and head's look, yaw and pitch, radians: heading 0 and a look of 0 face the
      // camera's starting yaw.)
      rec.pos.push([
        now,
        Math.round(h.x),
        Math.round(h.y),
        Math.round(b.x),
        Math.round(b.y),
        Math.round(f.x),
        Math.round(f.y),
        r3(s.camera.yaw),
        r3(s.pos.x),
        r3(s.pos.z),
        r3(s.heading),
        r3(s.headYaw),
        r3(s.headPitch),
      ]);
      const key = `${s.state}|${s.clip}|${s.reaction}|${s.held}`;
      if (key !== prev) {
        prev = key;
        rec.line.push({ t: now, state: s.state, clip: s.clip, reaction: s.reaction, held: s.held });
      }
      if (s.face !== face) {
        face = s.face;
        rec.faces.push({ t: now, face });
      }
      const tenths = Math.round((s.stress ?? 0) * 10) / 10;
      if (tenths !== stress) {
        stress = tenths;
        rec.stress.push({ t: now, stress });
      }
      const box = document.querySelector('.inv-bubble');
      const text = box && !box.hidden ? (box.querySelector('.inv-bubble-text')?.textContent ?? null) : null;
      // (A line as it types in: kept once it's whole, or as far as it got.)
      if (text && text !== said && !(said && text.startsWith(said) && rec.says.length)) rec.says.push({ t: now, text });
      else if (text && said && text.startsWith(said) && rec.says.length) rec.says.at(-1).text = text;
      said = text;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
export function stopRecord() {
  const rec = /** @type {any} */ (window).__capture;
  rec.on = false;
  const bar = document.querySelector('.inv-toolbar')?.getBoundingClientRect();
  const view = { w: innerWidth, h: innerHeight, toolbar: bar && bar.height > 0 ? Math.round(bar.top) : innerHeight };
  return {
    raf: rec.raf,
    pos: rec.pos,
    line: rec.line,
    faces: rec.faces,
    stress: rec.stress,
    says: rec.says,
    view,
    grip: rec.grip ?? null,
    end: window.__invitation?.snapshot() ?? null,
  };
}

/**
 * --raw: an act's frames as the page drew them, at the device's pixels (before fit scales them
 * to the CSS size), one PNG a drawn frame in `dir`; each resampled frame's time, when it was
 * drawn, and its file.
 */
export function keepRaw(dir, shot) {
  fs.mkdirSync(dir, { recursive: true });
  const files = new Map();
  for (const f of shot)
    if (!files.has(f.drawn)) {
      const file = `${dir}/${String(files.size).padStart(3, '0')}.png`;
      fs.writeFileSync(file, f.data);
      files.set(f.drawn, file);
    }
  return { dir, frames: shot.map((f) => ({ t: f.t, drawn: f.drawn, file: files.get(f.drawn) })) };
}

/** The record's last entry at or before `t` (ms), or its first. */
export const latest = (list, t) => list.filter((e) => (Array.isArray(e) ? e[0] : e.t) <= t).at(-1) ?? list[0];

/** Frame times, ms: the median, the 95th percentile, the longest, and how many took over 20 ms. */
export function frameTimes(raf) {
  if (!raf.length) return null;
  const s = [...raf].sort((a, b) => a - b);
  const q = (p) => Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1));
  return {
    frames: s.length,
    median: q(0.5),
    p95: q(0.95),
    max: Number(s.at(-1).toFixed(1)),
    over20: s.filter((d) => d > 20).length,
  };
}

/**
 * Where he was on screen over an act (from the act's start), from the record: the closest his
 * head, middle and feet came to the stage's left, right and top and to the toolbar's top, CSS px
 * (negative: off the screen or behind the toolbar), the farthest his root went from the play
 * area's middle, world units, and how far the camera turned, degrees (`turned`: last minus
 * first; `widest`: the farthest it got from where it began).
 */
export function inFrame(pos, view) {
  const live = pos.filter(([t]) => t >= 0);
  if (!live.length || !view) return null;
  const xs = live.flatMap((p) => [p[1], p[3], p[5]]);
  // (The page keeps the yaw within half a turn of zero: it's unwound here, frame to frame.)
  let yaw = 0;
  const yaws = live.map((p, i) => (yaw += i ? halfTurn(p[7] - live[i - 1][7]) : 0));
  return {
    left: least(xs),
    right: view.w - most(xs),
    top: least(live.map((p) => p[2])),
    toolbar: view.toolbar - most(live.map((p) => p[6])),
    farthest: Number(most(live.map((p) => Math.hypot(p[8], p[9]))).toFixed(2)),
    turned: Math.round((yaws.at(-1) * 180) / Math.PI),
    widest: Math.round((most(yaws.map(Math.abs)) * 180) / Math.PI),
  };
}
// (A long act, like the whole intro, has more frames than Math.min(...xs) takes as arguments.)
export const least = (xs) => xs.reduce((a, x) => Math.min(a, x), Infinity);
export const most = (xs) => xs.reduce((a, x) => Math.max(a, x), -Infinity);
/** An angle, radians, brought within half a turn of zero. */
export const halfTurn = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * The act's frames and their tiles, with the tool's options: `lead` (--lead, LEAD), `fps`
 * (--fps, FPS), `scale` (--scale, SCALE), `crop` (--crop, CROP) and `raw` (--raw, RAW); `sleep`
 * waits.
 * @param {{lead: number, fps: number, scale: number, crop: number, raw: boolean, sleep: (ms: number) => Promise<unknown>}} o
 */
export function recorder({ lead: LEAD, fps: FPS, scale: SCALE, crop: CROP, raw: RAW, sleep }) {
  /**
   * The page's own frames while `act` runs (Chrome's screencast, capture-knight's realTime),
   * each with when it was drawn (ms after the act began, from --lead ms before it), and the
   * page's record over the same time (startRecord, in the same ms); null when the act says it
   * can't run (returns false: a clip the glb doesn't have).
   */
  async function realTime(page, act, tail = 400) {
    const cdp = await page.context().newCDPSession(page);
    const frames = [];
    cdp.on('Page.screencastFrame', (f) => {
      frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    // (Chrome hands over frames at the CSS size unless asked for more: --raw asks for the device's pixels.)
    const asked = RAW
      ? await page.evaluate(() => ({
          maxWidth: Math.round(innerWidth * devicePixelRatio),
          maxHeight: Math.round(innerHeight * devicePixelRatio),
        }))
      : {};
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, ...asked });
    await page.evaluate(startRecord);
    await sleep(Math.max(300, LEAD));
    const p0 = await page.evaluate(() => performance.now());
    const t0 = Date.now();
    const ran = await act();
    if (ran === false) {
      await cdp.send('Page.stopScreencast');
      await cdp.detach();
      await page.evaluate(stopRecord);
      return null;
    }
    await sleep(tail);
    const t1 = Date.now();
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    const rec = await page.evaluate(stopRecord);
    const at = (t) => Math.round(t - p0);
    return {
      frames: frames.map((f) => ({ t: f.t - t0, data: f.data })),
      length: t1 - t0,
      raf: rec.raf.filter(([t]) => t >= p0).map(([, d]) => d),
      pos: rec.pos.map(([t, ...p]) => [at(t), ...p]),
      line: rec.line.map((l) => ({ ...l, t: at(l.t) })),
      faces: rec.faces.map((f) => ({ ...f, t: at(f.t) })),
      stress: rec.stress.map((f) => ({ ...f, t: at(f.t) })),
      says: rec.says.map((f) => ({ ...f, t: at(f.t) })),
      view: rec.view,
      grip: rec.grip,
      end: rec.end,
    };
  }

  /** The frames at `FPS` from --lead ms before the act to its `length` (the latest drawn by each moment), as PNG buffers. */
  function resample({ frames, length }) {
    const out = [];
    for (let t = -LEAD; t <= length; t += 1000 / FPS) {
      const shown = frames.filter((f) => f.t <= t).at(-1) ?? frames[0];
      if (shown) out.push({ t: Math.round(t), drawn: Math.round(shown.t), data: Buffer.from(shown.data, 'base64') });
    }
    return out;
  }

  /** A device-pixel frame at the output size (the page's CSS size × SCALE), nearest. */
  const fit = (size, buf) =>
    sharp(buf)
      .resize(Math.round(size.w * SCALE), Math.round(size.h * SCALE), { kernel: 'nearest', fit: 'fill' })
      .png()
      .toBuffer();

  /**
   * One tile of an act's sheet: a `CROP` CSS px square around him (where he was when the frame was
   * drawn), 2 px a CSS px, nearest; or the whole frame `full`, 480 px tall.
   */
  async function tile(size, buf, pos, full) {
    if (full || !pos)
      return sharp(await fit(size, buf))
        .resize({ height: 480, kernel: 'nearest' })
        .png()
        .toBuffer();
    const { width } = await sharp(buf).metadata();
    const k = width / size.w;
    const side = Math.min(CROP, size.w, size.h);
    const cx = (pos[1] + pos[3]) / 2;
    const cy = (pos[2] + pos[4]) / 2;
    const left = Math.max(0, Math.min(size.w - side, cx - side / 2));
    const top = Math.max(0, Math.min(size.h - side, cy - side / 2));
    return sharp(buf)
      .extract({
        left: Math.round(left * k),
        top: Math.round(top * k),
        width: Math.round(side * k),
        height: Math.round(side * k),
      })
      .resize(side * 2, side * 2, { kernel: 'nearest' })
      .png()
      .toBuffer();
  }

  return { realTime, resample, fit, tile };
}
