// Pictures of the knight against the scenery, taken from the site on a dev server (driven
// through its dev hook, window.__fire, so it has to be the dev server, not a build): one
// already running on --port, or with --serve its own, started for the run from the folder
// it's run in (a worktree too) and stopped after:
//
//   node tools/capture-knight.mjs [--port 5173] [--serve] [--out .scratch/knight-shots] [--tag now]
//                                 [--only seats,gestures,moves,seq,home,views] [--sceneries ruins,cult]
//                                 [--helmet bascinet] [--style first] [--standing] [--seqs praise]
//                                 [--room 1,0]
//
//   seats     close-ups of him seated in each scenery, in both seat poses, from his left, from
//             his right and from above (what stands round his seat in view): <tag>-seats.png
//   pose      all of him seated, both seat poses, a row each: three-quarter on from in front,
//             from his left, from his right, and as the home view frames him (how a seated
//             pose reads, on a seat or on the ground): <tag>-pose-<scenery>.png
//   gestures  a contact sheet of every gesture in each scenery, seated (or, --standing, up in
//             front of his seat, as Bonfire Live's breakdown has him), at real-time moments:
//             <tag>-gestures-<scenery>.png
//   moves     the seated dance moves with the widest arms (the Default Dance, Sway, Fist Pump,
//             Headbang), real time: <tag>-moves-<scenery>.png
//   seq       real-speed sequences from the home camera, the page hidden: Praise the Sun,
//             shrug and hurrah seated, Praise standing at his seat, getting up and sitting
//             down, the site's dance: <tag>-seq-<scenery>-<name>.png (--seqs praise,dance
//             for some of them). Real speed: the frames are the page's own, as Chrome's
//             screencast hands them over, each labelled with when it was drawn.
//   home      the home view as a visitor sees it (the page on), 1920, 1280 and 390 wide, in
//             each scenery: <tag>-home-<width>.png
//   views     the other cameras that frame his seat, 1920 wide: the site's Journey and About
//             views (the page on), Bonfire Live's Pillar Side shot and the Moonlit Ruins
//             scene's camera (the page hidden), a row a scenery: <tag>-views.png
//
// --helmet and --style dress him first (knights.js HELMETS, knightStyles.js STYLES). --room
// gives him that much room for his left and right arm at his seat (0..1 each, as knights.js
// roomOf measures it), whatever stands there: how a gesture looks hemmed in, or not. Run it
// against two checkouts on two ports for a before and after.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PORT = Number(opt('port', '5173'));
const OUT = opt('out', '.scratch/knight-shots');
const TAG = opt('tag', `knight-${PORT}`);
const ONLY = opt('only', 'seats,gestures,moves,seq,home').split(',');
const SCENERIES = opt('sceneries', 'ruins,forge,shrine,cathedral,cult').split(',');
const HELMET = opt('helmet', null);
const STYLE = opt('style', null);
const STANDING = argv.includes('--standing');
const SEQ_NAMES = opt('seqs', null)?.split(',') ?? null;
const ROOM = opt('room', null)?.split(',').map(Number) ?? null;
fs.mkdirSync(OUT, { recursive: true });

// --serve: this folder's own dev server for the run. (Its node_modules may be linked from
// another checkout, as a worktree's is: Vite serves from there too.)
const server = argv.includes('--serve')
  ? await createServer({
      server: { port: PORT, strictPort: true, fs: { allow: [process.cwd(), fs.realpathSync('node_modules')] } },
      logLevel: 'error',
    })
  : null;
if (server) await server.listen();

/** GPU Chrome on the dev server's site, the knight there at rest (dressed as asked). */
async function open({ width = 1280, height = 800, hide = true, path = '/' } = {}) {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`http://localhost:${PORT}${path}`);
  await page.waitForFunction(() => window.__fire?.knights, null, { timeout: 120000 });
  await page.evaluate(() => window.__fire.knights.ready);
  if (hide)
    await page.addStyleTag({
      content: 'body * { visibility: hidden !important; } .stage, .stage * { visibility: visible !important; }',
    });
  await page.evaluate(
    async ([helmet, style]) => {
      const k = window.__fire.knights;
      // (Away when the page opens: here at once, for good.)
      k.summon(0, { instant: true });
      k.restLeft = Infinity;
      if (style) await k.setStyle(style, { instant: true });
      if (helmet) await k.setHelmet(helmet, { index: 0, instant: true });
    },
    [HELMET, STYLE],
  );
  await page.waitForTimeout(600);
  return { browser, page, errors };
}
/** The scenery `name`, the knight seated at its seat (or the seat pose `pose`). */
async function seatIn(page, name, pose = null) {
  await page.evaluate(
    ([name, pose, room]) => {
      const F = window.__fire;
      if (F.scenery !== name) F.setScenery(name);
      const k = F.debug.knights;
      if (pose) k.setSeatPose(pose);
      k.setScenery(name, k.terrain); // (formed at the seat at once, sitting)
      F.knights.summon(0, { instant: true });
      if (room) {
        // (The room he has at his seat, seated and stood up in front of it: --room.)
        const h = k.knights[0].home;
        h.room = [...room];
        h.roomUp = [...room];
        h.roomLess = null;
      }
    },
    [name, pose, ROOM],
  );
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const l = window.__fire.knights.list[0];
    return { x: l.position.x, y: l.position.y, z: l.position.z, yaw: l.facing };
  });
}
/** A camera `ahead` m in front of him, `left` m to his left (− right), `up` m high, looking at his middle (or `at` m up). */
const around = (k, ahead, left, up, at = 0.65) => ({
  pos: [
    k.x + Math.sin(k.yaw) * ahead + Math.cos(k.yaw) * left,
    up,
    k.z + Math.cos(k.yaw) * ahead - Math.sin(k.yaw) * left,
  ],
  target: [k.x + Math.sin(k.yaw) * 0.15, at, k.z + Math.cos(k.yaw) * 0.15],
});
const look = (page, cam, fov = 36) =>
  page.evaluate(([cam, fov]) => window.__fire.setPose({ ...cam, fov }, { instant: true }), [cam, fov]);
/** Part of a screenshot (fractions of its width and height), scaled to `w`×`h` (nearest). */
async function crop(buf, [u0, v0, u1, v1], w, h) {
  const { width, height } = await sharp(buf).metadata();
  const left = Math.round(u0 * width),
    top = Math.round(v0 * height);
  return sharp(buf)
    .extract({ left, top, width: Math.round((u1 - u0) * width), height: Math.round((v1 - v0) * height) })
    .resize(w, h, { fit: 'contain', kernel: 'nearest', background: '#000' })
    .png()
    .toBuffer();
}
/** Tiles of one size into a grid, each with its label, written to `file`. */
async function grid(tiles, cols, file, labels) {
  const { width: w, height: h } = await sharp(tiles[0]).metadata();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const comp = tiles.flatMap((t, i) => [
    { input: t, left: (i % cols) * w, top: Math.floor(i / cols) * h },
    {
      input: Buffer.from(
        `<svg width="${w}" height="20"><rect width="100%" height="20" fill="black" opacity="0.65"/><text x="5" y="14" font-family="monospace" font-size="13" fill="white">${esc(labels[i] ?? '')}</text></svg>`,
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
 * Frames at real speed, `times` (ms) after `act` (an expression) runs in the page: the page's
 * own frames as it draws them (Chrome's screencast; a screenshot each would hold the page up
 * for a while, and come late), the nearest to each time. `when` gets the time each was drawn.
 */
async function realTime(page, act, times, shoot, when = []) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(300);
  // (The page's clock, the screencast's: when it ran.)
  const t0 = await page.evaluate(`(() => { const t = Date.now(); ${act}; return t; })()`);
  await page.waitForTimeout(Math.max(...times) + 250);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const out = [];
  for (const t of times) {
    const f = frames.reduce((best, fr) => (Math.abs(fr.t - t0 - t) < Math.abs(best.t - t0 - t) ? fr : best), frames[0]);
    when.push(Math.round(f.t - t0));
    out.push(await shoot(Buffer.from(f.data, 'base64'), t));
  }
  return out;
}
const every = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

// --- seats ---------------------------------------------------------------------------------------
async function seats() {
  const { browser, page, errors } = await open();
  const tiles = [],
    labels = [];
  for (const name of SCENERIES) {
    for (const pose of ['resting', 'watchful']) {
      const k = await seatIn(page, name, pose);
      for (const [view, cam] of [
        ['his left', around(k, 0.5, 2.0, 0.85)],
        ['his right', around(k, 1.3, -1.5, 1.0)],
        ['above', around(k, 1.1, 0.3, 2.7, 0.3)],
      ]) {
        await look(page, cam);
        await page.waitForTimeout(450);
        tiles.push(await crop(await page.screenshot(), [0.2, 0.05, 0.8, 0.95], 380, 380));
        labels.push(`${name} ${pose}: ${view}`);
      }
    }
  }
  await page.evaluate(() => window.__fire.debug.knights.setSeatPose('resting'));
  await grid(tiles, 6, `${OUT}/${TAG}-seats.png`, labels);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

// --- all of him seated, as a pose reads ---------------------------------------------------------------
async function pose() {
  const { browser, page, errors } = await open({ width: 1280, height: 800 });
  for (const name of SCENERIES) {
    const tiles = [],
      labels = [];
    for (const seatPose of ['resting', 'watchful']) {
      const k = await seatIn(page, name, seatPose);
      for (const [view, cam, fov] of [
        ['front', around(k, 2.1, 0.9, 0.95, 0.45), 34],
        ['his left', around(k, 0.25, 2.2, 0.75, 0.45), 34],
        ['his right', around(k, 0.25, -2.2, 0.75, 0.45), 34],
      ]) {
        await look(page, cam, fov);
        await page.waitForTimeout(450);
        tiles.push(await crop(await page.screenshot(), [0.25, 0, 0.75, 1], 380, 380));
        labels.push(`${name} ${seatPose}: ${view}`);
      }
      // (As the home view frames him: round his seat, the page hidden.)
      await page.evaluate(() => window.__fire.setView('home', { instant: true }));
      await page.waitForTimeout(600);
      tiles.push(await crop(await page.screenshot(), [0.3, 0.05, 0.62, 0.55], 380, 380));
      labels.push(`${name} ${seatPose}: home view`);
    }
    await grid(tiles, 4, `${OUT}/${TAG}-pose-${name}.png`, labels);
  }
  await page.evaluate(() => window.__fire.debug.knights.setSeatPose('resting'));
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

// --- gestures and moves ------------------------------------------------------------------------------
async function sheet(kind) {
  const { browser, page, errors } = await open();
  const acts =
    kind === 'gestures'
      ? ['praise', 'wave', 'bow', 'point', 'beckon', 'shrug', 'hurrah', 'joy']
      : ['defaultDance', 'swayArms', 'fistPump', 'headbang'];
  const times = kind === 'gestures' ? [300, 600, 900, 1200, 1500] : [250, 750, 1250, 1750, 2250, 2750];
  for (const name of SCENERIES) {
    const k = await seatIn(page, name, 'resting');
    if (kind === 'gestures' && STANDING) {
      await page.evaluate(() => window.__fire.knights.stand(0));
      await page.waitForTimeout(1800);
    }
    // (From in front of him and a little to his left, his seat and what stands by it in view.)
    await look(page, around(k, 2.6, 0.9, 1.3, 0.85), 40);
    await page.waitForTimeout(500);
    const tiles = [],
      labels = [];
    for (const act of acts) {
      const go =
        kind === 'gestures'
          ? `window.__fire.knights.gesture('${act}', { index: 0 })`
          : `window.__fire.knights.dance(0, { move: '${act}', energy: 1, seated: true })`;
      tiles.push(...(await realTime(page, go, times, (buf) => crop(buf, [0.22, 0, 0.78, 1], 230, 330))));
      labels.push(...times.map((t) => `${act} ${t} ms`));
      if (kind === 'moves') await page.evaluate(() => window.__fire.knights.sit(0));
      await page.waitForTimeout(kind === 'gestures' ? 1100 : 900);
    }
    if (kind === 'gestures' && STANDING) await page.evaluate(() => window.__fire.knights.sit(0));
    await grid(
      tiles,
      times.length,
      `${OUT}/${TAG}-${kind}${kind === 'gestures' && STANDING ? '-standing' : ''}-${name}.png`,
      labels,
    );
  }
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

// --- real-speed sequences from the home camera ----------------------------------------------------------
async function seq() {
  const { browser, page, errors } = await open({ width: 1920, height: 1080 });
  const SEQS = {
    praise: { act: `window.__fire.knights.gesture('praise', { index: 0 })`, at: every(0, 2400, 120) },
    shrug: { act: `window.__fire.knights.gesture('shrug', { index: 0 })`, at: every(0, 1680, 120) },
    hurrah: { act: `window.__fire.knights.gesture('hurrah', { index: 0 })`, at: every(0, 1800, 120) },
    'standing-praise': {
      act: `(() => { const k = window.__fire.knights; k.stand(0); setTimeout(() => k.gesture('praise', { index: 0 }), 1500); })()`,
      at: every(1500, 3900, 120),
    },
    sitstand: {
      act: `(() => { const k = window.__fire.knights; k.stand(0); setTimeout(() => k.sit(0), 1700); })()`,
      at: every(0, 3360, 120),
    },
    dance: { act: `window.__fire.knights.gesture('dance', { index: 0 })`, at: every(0, 7200, 240) },
  };
  for (const name of SCENERIES) {
    await seatIn(page, name, 'resting');
    await page.evaluate(() => window.__fire.setView('home', { instant: true }));
    await page.waitForTimeout(900);
    // (Round his seat on the home view: him, the fire and what stands by his seat, wide
    // enough for any round's seat and where he stands up to, his arms thrown up.)
    const region = [0.26, 0.0, 0.82, 0.66];
    for (const [nm, s] of Object.entries(SEQS).filter(([nm]) => !SEQ_NAMES || SEQ_NAMES.includes(nm))) {
      const when = [];
      const tiles = await realTime(page, s.act, s.at, (buf) => crop(buf, region, 380, 240), when);
      await grid(
        tiles,
        10,
        `${OUT}/${TAG}-seq-${name}-${nm}.png`,
        when.map((t) => `${name} ${nm} ${t} ms`),
      );
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__fire.knights.sit(0));
      await page.waitForTimeout(1600);
    }
  }
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

// --- the home view, as a visitor sees it ---------------------------------------------------------------
async function home() {
  for (const [w, h] of [
    [1920, 1080],
    [1280, 800],
    [390, 844],
  ]) {
    const { browser, page, errors } = await open({ width: w, height: h, hide: false });
    const tiles = [];
    for (const name of SCENERIES) {
      await seatIn(page, name, null);
      await page.evaluate(() => window.__fire.setView('home', { instant: true }));
      await page.waitForTimeout(1200);
      const buf = await page.screenshot();
      tiles.push(
        await sharp(buf)
          .resize(w > 1000 ? 640 : 390, null, { kernel: 'nearest' })
          .png()
          .toBuffer(),
      );
    }
    // (Each the same size: the phone's top half, the rest whole.)
    const sized = await Promise.all(
      tiles.map((t) =>
        w > 1000 ? t : sharp(t).extract({ left: 0, top: 0, width: 390, height: 460 }).png().toBuffer(),
      ),
    );
    await grid(
      sized,
      w > 1000 ? 3 : 5,
      `${OUT}/${TAG}-home-${w}.png`,
      SCENERIES.map((n) => `${n} ${w}×${h}`),
    );
    if (errors.length) console.log(errors.join('\n'));
    await browser.close();
  }
}

// --- the other cameras that frame his seat ----------------------------------------------------------------
async function views() {
  const VIEWS = [
    ['Journey', { view: 'experience' }],
    ['About', { view: 'about' }],
    // (Bonfire Live's shot, visualizer/camera.js SHOTS.pillar, and the built-in scene's camera.)
    ['Pillar Side', { pose: { pos: [-2.5, 1.35, 3.3], target: [0.15, 0.7, -0.3], fov: 34 } }],
    ['Moonlit Ruins', { pose: { pos: [-0.6, 0.7, 2.6], target: [-0.85, 0.9, -1.3], fov: 40 } }],
  ];
  const tiles = [],
    labels = [];
  // (The site's views on their own pages, as a visitor sees them; the others, the page hidden.)
  for (const [path, hide, list] of [
    ...VIEWS.filter(([, v]) => v.view).map((view) => [`/${view[1].view}/`, false, [view]]),
    ['/', true, VIEWS.filter(([, v]) => v.pose)],
  ]) {
    const { browser, page, errors } = await open({ width: 1920, height: 1080, hide, path });
    for (const name of SCENERIES) {
      await seatIn(page, name, null);
      for (const [label, v] of list) {
        if (v.view) await page.evaluate((view) => window.__fire.setView(view, { instant: true }), v.view);
        else await look(page, v.pose, v.pose.fov);
        await page.waitForTimeout(1200);
        tiles.push({
          at: `${name} ${label}`,
          buf: await sharp(await page.screenshot())
            .resize(640, null, { kernel: 'nearest' })
            .png()
            .toBuffer(),
        });
      }
    }
    if (errors.length) console.log(errors.join('\n'));
    await browser.close();
  }
  // (A row a scenery, the views in order.)
  const order = SCENERIES.flatMap((name) => VIEWS.map(([label]) => `${name} ${label}`));
  const sorted = order.map((at) => tiles.find((t) => t.at === at));
  labels.push(...order);
  await grid(
    sorted.map((t) => t.buf),
    VIEWS.length,
    `${OUT}/${TAG}-views.png`,
    labels,
  );
}

for (const part of ONLY) {
  if (part === 'seats') await seats();
  else if (part === 'pose') await pose();
  else if (part === 'gestures') await sheet('gestures');
  else if (part === 'moves') await sheet('moves');
  else if (part === 'seq') await seq();
  else if (part === 'home') await home();
  else if (part === 'views') await views();
}
await server?.close();
