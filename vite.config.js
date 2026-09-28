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
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemap(publicRoutes(), ['/visualizer/']));
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

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
  plugins: [routePages()],
  build: {
    // three.js is lazy-loaded for the hero only; its chunk is expected to be large.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
        visualizer: resolve(import.meta.dirname, 'visualizer/index.html'),
      },
    },
  },
});
