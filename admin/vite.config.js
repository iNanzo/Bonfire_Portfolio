// The admin page: built into admin/dist for the Worker (`npm run admin:build`), or
// served locally with the same API writing straight to this repo's files
// (`npm run admin` → http://127.0.0.1:5175). Local mode has no sign-in, so it only
// listens on 127.0.0.1. ADMIN_CONTENT_ROOT points it at another copy of the site.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { handleApi } from './server/api.js';
import { createFsStore } from './server/fsStore.js';

const here = import.meta.dirname;
const repo = resolve(here, '..');

function localApi() {
  return {
    name: 'admin-local-api',
    configureServer(server) {
      const store = createFsStore(process.env.ADMIN_CONTENT_ROOT ? resolve(process.env.ADMIN_CONTENT_ROOT) : repo);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers();
          for (const name of ['origin', 'sec-fetch-site', 'content-type']) if (req.headers[name]) headers.set(name, req.headers[name]);
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const response = await handleApi(request, { store, user: { email: 'local' }, siteUrl: 'http://localhost:5173/' });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  root: resolve(here, 'ui'),
  publicDir: false,
  plugins: [localApi()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [repo] } },
  preview: { host: '127.0.0.1', port: 5175 },
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true },
});
