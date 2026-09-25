import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { screens, featured, projects, archive } from './src/content.js';

// GitHub Pages *project* site (username.github.io/repo-name/): build with
//   BASE=repo-name npm run build
// (just the name, no slashes — Git Bash on Windows rewrites values that start with "/").
// User site (username.github.io) or a custom domain: plain `npm run build`.
const repo = (process.env.BASE ?? '').replace(/^\/+|\/+$/g, '');

// Routes are real paths (/projects/, /projects/<id>/), and GitHub Pages has no
// rewrites: without a page at each path, a reload or a shared link lands on
// 404.html. Every route gets a copy of index.html; the app routes from there.
// Hidden projects get one too, so their links fall back to the inventory.
function routePages() {
  let outDir = 'dist';
  return {
    name: 'route-pages',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const ids = [featured, ...projects, ...archive.filter((a) => a.images)].map((p) => p.id);
      const routes = [...screens.filter((s) => s.id !== 'home').map((s) => s.id), ...ids.map((id) => `projects/${id}`)];
      for (const route of routes) {
        mkdirSync(resolve(outDir, route), { recursive: true });
        copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, route, 'index.html'));
      }
    },
  };
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
      },
    },
  },
});
