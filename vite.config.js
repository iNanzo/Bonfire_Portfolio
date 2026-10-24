import { defineConfig, normalizePath } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { screens, featured, projects, archive, items, site } from './src/content.js';
import { pageMeta, withMeta, publicRoutes, sitemap } from './src/seoPages.js';
import { esc } from './src/html.js';
import { gateScript } from './src/gate/check.js';
import { fromBase64, tokenOf } from './src/gate/crypto.js';
import { lockedPages, unlockConfig } from './src/gate/pages.js';

// GitHub Pages *project* site (username.github.io/repo-name/): build with
//   BASE=repo-name npm run build
// (just the name, no slashes — Git Bash on Windows rewrites values that start with "/").
// User site (username.github.io) or a custom domain: plain `npm run build`.
const repo = (process.env.BASE ?? '').replace(/^\/+|\/+$/g, '');

// Routes are real paths (/projects/, /projects/<id>/), and GitHub Pages has no
// rewrites: without a page at each path, a reload or a shared link lands on
// 404.html. Every route gets a copy of index.html; the app routes from there.
// Hidden projects get one too, so their links fall back to the inventory.
//
// Each copy carries its own metadata for crawlers and link previews (src/seoPages.js):
// title, description, canonical URL, a 1200×630 social image (made here from the
// project's cover, with its name on it) and structured data. Plus sitemap.xml and
// robots.txt.
function routePages() {
  let outDir = 'dist';
  let root = '.';
  return {
    name: 'route-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      root = config.root;
    },
    async closeBundle() {
      const template = readFileSync(resolve(outDir, 'index.html'), 'utf8');
      const ids = [featured, ...projects, ...archive.filter((a) => a.images?.length)].map((p) => p.id);
      const routes = [...screens.filter((s) => s.id !== 'home').map((s) => s.id), ...ids.map((id) => `projects/${id}`)];
      writeFileSync(resolve(outDir, 'index.html'), withMeta(template, pageMeta('home')));
      for (const route of routes) {
        mkdirSync(resolve(outDir, route), { recursive: true });
        // (A hidden project isn't meant to be found: its page is the inventory's.)
        const meta = pageMeta(route) ?? pageMeta('projects');
        writeFileSync(resolve(outDir, route, 'index.html'), withMeta(template, meta));
      }
      // Social images: the bonfire for the site, each project's cover with its name.
      mkdirSync(resolve(outDir, 'og'), { recursive: true });
      await socialImage(resolve(root, 'assets/source/bonfire-preview.png'), site.name, resolve(outDir, 'og/home.jpg'));
      for (const p of items()) {
        await socialImage(
          resolve(root, 'public', `${p.images[0].src}.webp`),
          p.name,
          resolve(outDir, `og/project-${p.id}.jpg`),
        );
      }
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemapFor(lockedPages(readGate())));
      writeFileSync(
        resolve(outDir, 'robots.txt'),
        `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /larp/\n\nSitemap: ${new URL('sitemap.xml', site.url).href}\n`,
      );
    },
  };
}

/**
 * sitemap.xml without the routes the lock covers (Google follows the lock's redirect to a
 * noindex page, so a locked route listed would only be a dead entry).
 * @param {string[]} locked  the locked pages (src/gate/pages.js lockedPages)
 */
export function sitemapFor(locked) {
  const open = (page) => !locked.includes(page);
  const extra = [open('live') && '/visualizer/', open('painter') && '/painter/'].filter(Boolean);
  return sitemap(open('portfolio') ? publicRoutes() : [], /** @type {string[]} */ (extra));
}

/** A 1200×630 preview: the image cropped to fill, a dark band along the bottom, the title on it. */
async function socialImage(src, title, out) {
  const band = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#07070b" stop-opacity="0"/><stop offset="1" stop-color="#07070b" stop-opacity="0.92"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <text x="56" y="560" font-family="Georgia, 'DejaVu Serif', serif" font-size="64" fill="#e9e3d2">${esc(title)}</text>
    <text x="58" y="598" font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="22" fill="#b9b3a4" letter-spacing="3">${esc(new URL(site.url).host.toUpperCase())}</text>
  </svg>`;
  await sharp(src)
    .resize(1200, 630, { fit: 'cover', kernel: 'nearest' })
    .composite([{ input: Buffer.from(band) }])
    .jpeg({ quality: 84 })
    .toFile(out);
}

// The portfolio's first load (index.html's script and its modulepreloads) is the site's
// alone. Bonfire Live's and the Painter's modules (the scene format, the looks, the scene
// store, the palette maker), the campfire game's (src/larp/), the invitation toy's
// (src/invitation/) and the lock page's (src/gate/) only ever reach it through a static import
// from the site: the pages are built together, and Rolldown puts a module every page reaches
// into the chunk they share, so one `import` in src/main.js of something that imports scenes.js
// (contentRules.js does) adds ~20 kB gzip to every visit. The site imports those lazily
// (`import()`); this check says so at build time if one comes back. (The other way round, a
// page importing one of the site's own modules shares a chunk with its first load too: the
// invitation toy imports only three.js, GLTFLoader and its own modules, and the lock page only
// src/gate/ and the tokens, which a build that breaks that refuses: unlockLoad.)
export const SHOW_ONLY =
  /[\\/]src[\\/]((scenes|sceneStore|paletteGen)\.js|visualizer[\\/]|painter[\\/]|larp[\\/]|invitation[\\/]|gate[\\/])/;
const shortId = (id) =>
  id
    .split('\\')
    .join('/')
    .replace(/^.*?\/src\//, 'src/');
/**
 * The chunks a page's entry chunk loads before it runs: the chunk and every chunk it imports
 * statically, all the way down (their file names).
 * @param {Record<string, any>} bundle  Rolldown's output bundle
 * @param {string} entry  the entry chunk's name (an `input` key)
 */
function firstLoadChunks(bundle, entry) {
  const start = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry && c.name === entry);
  const seen = new Set();
  const stack = start ? [start.fileName] : [];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || bundle[file]?.type !== 'chunk') continue;
    seen.add(file);
    stack.push(...bundle[file].imports);
  }
  return [...seen];
}
/**
 * The modules (with code in the bundle) a page's entry chunk loads before it runs.
 * @param {Record<string, any>} bundle  Rolldown's output bundle
 * @param {string} entry  the entry chunk's name (an `input` key)
 */
export function firstLoadModules(bundle, entry) {
  return firstLoadChunks(bundle, entry).flatMap((file) =>
    Object.entries(bundle[file].modules)
      .filter(([, m]) => m.renderedLength > 0)
      .map(([id]) => id),
  );
}
/** What the lock page must never load: content.json and what reads it, the renderer, three.js. */
const UNLOCK_NEVER =
  /[\\/]src[\\/](content\.json|content\.js|render\.js|palette\.js|effects\.js|ui[\\/]theme\.js)$|[\\/]node_modules[\\/]three[\\/]/;
/** The lock page's JS and CSS, at most (gzip; fonts aside). */
const UNLOCK_MAX = 10 * 1024;
/**
 * The lock page's first load: what it loads that it never should, and its JS and CSS gzipped.
 * @param {Record<string, any>} bundle  Rolldown's output bundle
 * @returns {{ stray: string[], gzip: number }}
 */
export function unlockLoad(bundle) {
  const stray = firstLoadModules(bundle, 'unlock').filter((id) => UNLOCK_NEVER.test(id));
  let gzip = 0;
  for (const file of firstLoadChunks(bundle, 'unlock')) {
    const chunk = bundle[file];
    gzip += gzipSync(chunk.code ?? '').length;
    for (const css of chunk.viteMetadata?.importedCss ?? []) gzip += gzipSync(bundle[css]?.source ?? '').length;
  }
  return { stray, gzip };
}
function firstLoadGuard() {
  return {
    name: 'first-load-guard',
    apply: 'build',
    generateBundle(_, bundle) {
      const stray = firstLoadModules(bundle, 'main').filter((id) => SHOW_ONLY.test(id));
      if (stray.length)
        this.warn(
          `The portfolio's first load carries Bonfire Live / Painter / campfire game / invitation toy / lock page modules: ${stray.map(shortId).join(', ')}. Import what pulls them in lazily (import()) from the site.`,
        );
      const lock = unlockLoad(bundle);
      if (lock.stray.length)
        this.error(
          `The lock page (/unlock/) loads ${lock.stray.map(shortId).join(', ')}: it imports only src/gate/, tokens.css and the fonts.`,
        );
      if (lock.gzip > UNLOCK_MAX)
        this.warn(`The lock page's JS and CSS are ${(lock.gzip / 1024).toFixed(1)} kB gzip: keep them under 10.`);
    },
  };
}

// The sitewide password lock (content.json `gate`, the admin's Access page; docs/admin.md).
// A build with the lock on and a key puts the check (src/gate/check.js) first in the head of
// each locked page: before Vite's own tags, the model preloads and the entry module, so a
// visitor without the cookie never loads them. The portfolio's route copies are made from the
// built index.html, so they carry it too; the Reliquary game is a file of public/ (no HTML
// transform), so it gets the check once it's written. The lock page (/unlock/) gets its config
// inline (unlockConfig: the words and the key, nothing else), in dev too. The lock is off, and
// costs nothing, while it's off or has no key; a dev server is never locked. 404, the admin,
// /assets and /models are never locked, and the invitation only if its switch is turned on.
const GATE_HTML = {
  '/index.html': 'portfolio',
  '/visualizer/index.html': 'live',
  '/painter/index.html': 'painter',
  '/larp/index.html': 'larp',
  '/invitation/index.html': 'invitation',
};
const UNLOCK_HTML = '/unlock/index.html';
const CONTENT_FILE = resolve(import.meta.dirname, 'src/content.json');
/** content.json's gate, read now (an edit in the admin changes the next build). */
const readGate = (file = CONTENT_FILE) => JSON.parse(readFileSync(file, 'utf8')).gate;
/**
 * @param {string} [file]  content.json
 * @returns {import('vite').Plugin & { configResolved: Function, closeBundle: Function, transformIndexHtml: { order: 'post', handler: Function } }}
 */
export function gate(file = CONTENT_FILE) {
  let command = 'serve';
  let outDir = 'dist';
  let base = '/';
  /** The check for one of the build's pages, or null when it stays open. @param {string} page */
  const checkFor = async (page) => {
    const g = readGate(file);
    if (command !== 'build' || !lockedPages(g).includes(page)) return null;
    return gateScript(await tokenOf(fromBase64(g.key.hash)), base);
  };
  return {
    name: 'gate',
    configResolved(config) {
      command = config.command;
      outDir = resolve(config.root, config.build.outDir);
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      async handler(_html, ctx) {
        if (ctx.path === UNLOCK_HTML) {
          const json = JSON.stringify(unlockConfig(readGate(file))).replace(/</g, '\\u003c');
          return [
            { tag: 'script', attrs: { type: 'application/json', id: 'gate-config' }, children: json, injectTo: 'head' },
          ];
        }
        const page = GATE_HTML[ctx.path];
        const code = page ? await checkFor(page) : null;
        if (!code) return undefined;
        return [{ tag: 'script', attrs: { 'data-gate': true }, children: code, injectTo: 'head-prepend' }];
      },
    },
    async closeBundle() {
      const reliquary = resolve(outDir, 'games', 'reliquary.html');
      const code = await checkFor('games');
      if (!code || !existsSync(reliquary)) return;
      const html = readFileSync(reliquary, 'utf8');
      if (html.includes('<script data-gate>')) return;
      writeFileSync(
        reliquary,
        html.replace(/<head>/i, (head) => `${head}<script data-gate>${code}</script>`),
      );
    },
  };
}

// The invitation toy's editable content (content.json `invitation`, the admin's) as a module of
// its own, `virtual:invitation-content`: read from the file at build and dev time with only that
// subtree inlined, so the toy never imports content.json (whose chunk the portfolio's first load
// shares); the file is watched, so an edit reloads the toy in dev. The other way round, the
// pages that import content.json itself (the portfolio, Bonfire Live, the Painter) get it
// without that subtree: NEWT's lines in every visit would be weight for nothing.
const INVITATION_CONTENT = 'virtual:invitation-content';
/**
 * @param {string} [file]  content.json
 * @returns {import('vite').Plugin & {resolveId: Function, load: Function, transform: Function}}
 */
export function invitationContent(file = resolve(import.meta.dirname, 'src/content.json')) {
  const resolved = `\0${INVITATION_CONTENT}`;
  const target = normalizePath(file);
  return {
    name: 'invitation-content',
    enforce: 'pre',
    resolveId(id) {
      return id === INVITATION_CONTENT ? resolved : null;
    },
    load(id) {
      if (id !== resolved) return null;
      this.addWatchFile(file);
      const c = JSON.parse(readFileSync(file, 'utf8'));
      return `export default ${JSON.stringify(c?.invitation ?? {})};\n`;
    },
    transform(code, id) {
      if (normalizePath(id.split('?')[0]) !== target) return null;
      const c = JSON.parse(code);
      if (!c || typeof c !== 'object' || !('invitation' in c)) return null;
      delete c.invitation;
      return { code: JSON.stringify(c), map: null };
    },
  };
}

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
  plugins: [routePages(), firstLoadGuard(), invitationContent(), gate()],
  build: {
    // The largest chunk is three.js's renderer (~410 kB, lazy-loaded with the fire); the
    // bonfire's own code is a chunk of its own beside it (~320 kB). More than this is
    // something new to split.
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
        visualizer: resolve(import.meta.dirname, 'visualizer/index.html'),
        painter: resolve(import.meta.dirname, 'painter/index.html'),
        // The campfire game (/larp/): noindex, left out of the sitemap, Disallow'd in robots.txt.
        larp: resolve(import.meta.dirname, 'larp/index.html'),
        // The invitation toy (/invitation/): unlisted, so noindex and left out of the sitemap,
        // but not Disallow'd (a Disallow is public, and would hide the noindex from crawlers).
        invitation: resolve(import.meta.dirname, 'invitation/index.html'),
        // The lock page (/unlock/): noindex, left out of the sitemap, never locked itself.
        unlock: resolve(import.meta.dirname, 'unlock/index.html'),
      },
      output: {
        codeSplitting: {
          groups: [
            // three.js's renderer and the loaders from its examples, in a chunk of their own:
            // it changes only when three.js does (the browser keeps it across deploys), and
            // the bonfire's code (src/bonfire/scene.js and the rest) stays a chunk of its
            // own size. three's core, which Bonfire Live and the Painter load up front, is
            // left out of the group (and its dependencies with it): it stays where Rolldown
            // puts it, shared.
            {
              name: 'three',
              test: /[\\/]node_modules[\\/]three[\\/](build[\\/]three\.module\.js|examples[\\/])/,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
});
