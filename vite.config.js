import { defineConfig } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { screens, featured, projects, archive, items, site } from './src/content.js';
import { pageMeta, withMeta, publicRoutes, sitemap } from './src/seoPages.js';
import { esc } from './src/html.js';

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
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); root = config.root; },
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
        await socialImage(resolve(root, 'public', `${p.images[0].src}.webp`), p.name, resolve(outDir, `og/project-${p.id}.jpg`));
      }
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemap(publicRoutes(), ['/visualizer/', '/painter/']));
      writeFileSync(resolve(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${new URL('sitemap.xml', site.url).href}\n`);
    },
  };
}

/** A 1200×630 preview: the image cropped to fill, a dark band along the bottom, the title on it. */
async function socialImage(src, title, out) {
  const band = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#07070b" stop-opacity="0"/><stop offset="1" stop-color="#07070b" stop-opacity="0.92"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <text x="56" y="560" font-family="Georgia, 'DejaVu Serif', serif" font-size="64" fill="#e9e3d2">${esc(title)}</text>
    <text x="58" y="598" font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="22" fill="#b9b3a4" letter-spacing="3">${esc(new URL(site.url).host.toUpperCase())}</text>
  </svg>`;
  await sharp(src).resize(1200, 630, { fit: 'cover', kernel: 'nearest' })
    .composite([{ input: Buffer.from(band) }])
    .jpeg({ quality: 84 }).toFile(out);
}

// The portfolio's first load (index.html's script and its modulepreloads) is the site's
// alone. Bonfire Live's and the Painter's modules (the scene format, the looks, the scene
// store, the palette maker) only ever reach it through a static import from the site: the
// four pages are built together, and Rolldown puts a module every page reaches into the
// chunk they share, so one `import` in src/main.js of something that imports scenes.js
// (contentRules.js does) adds ~20 kB gzip to every visit. The site imports those lazily
// (`import()`); this check says so at build time if one comes back.
const SHOW_ONLY = /[\\/]src[\\/]((scenes|sceneStore|paletteGen)\.js|visualizer[\\/]|painter[\\/])/;
const shortId = (id) => id.split('\\').join('/').replace(/^.*?\/src\//, 'src/');
/**
 * The modules (with code in the bundle) a page's entry chunk loads before it runs: the
 * chunk and every chunk it imports statically, all the way down.
 * @param {Record<string, any>} bundle  Rolldown's output bundle
 * @param {string} entry  the entry chunk's name (an `input` key)
 */
export function firstLoadModules(bundle, entry) {
  const start = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry && c.name === entry);
  const seen = new Set();
  const stack = start ? [start.fileName] : [];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || bundle[file]?.type !== 'chunk') continue;
    seen.add(file);
    stack.push(...bundle[file].imports);
  }
  return [...seen].flatMap((file) => Object.entries(bundle[file].modules).filter(([, m]) => m.renderedLength > 0).map(([id]) => id));
}
function firstLoadGuard() {
  return {
    name: 'first-load-guard',
    apply: 'build',
    generateBundle(_, bundle) {
      const stray = firstLoadModules(bundle, 'main').filter((id) => SHOW_ONLY.test(id));
      if (stray.length) this.warn(`The portfolio's first load carries Bonfire Live / Painter modules: ${stray.map(shortId).join(', ')}. Import what pulls them in lazily (import()) from the site.`);
    },
  };
}

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
  plugins: [routePages(), firstLoadGuard()],
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
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/](build[\\/]three\.module\.js|examples[\\/])/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
});
