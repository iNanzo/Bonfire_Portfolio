import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// GitHub Pages *project* site (username.github.io/repo-name/): build with
//   BASE=repo-name npm run build
// (just the name, no slashes — Git Bash on Windows rewrites values that start with "/").
// User site (username.github.io) or a custom domain: plain `npm run build`.
const repo = (process.env.BASE ?? '').replace(/^\/+|\/+$/g, '');

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
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
