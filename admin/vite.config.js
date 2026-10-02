// The admin page: built into admin/dist for the Worker (`npm run admin:build`), or
// served locally with the same API writing straight to this repo's files
// (`npm run admin` → http://127.0.0.1:5175). Local mode has no sign-in, so it only
// listens on 127.0.0.1. ADMIN_CONTENT_ROOT points it at another copy of the site;
// ADMIN_SITE_URL is the dev site the live preview loads (default :5173).
//
// `npm run admin:preview` serves the built page the way the Worker does: the production
// security headers (admin/server/csp.js, whose style-src 'self' blocks style attributes),
// with the same local API. ADMIN_READONLY=1 makes that API refuse saves (the e2e tests run
// it so, against this repo's own content.json).
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { handleApi } from './server/api.js';
import { createFsStore } from './server/fsStore.js';
import { HttpError } from './server/errors.js';
import { securityHeaders } from './server/csp.js';

const here = import.meta.dirname;
const repo = resolve(here, '..');
const siteUrl = process.env.ADMIN_SITE_URL ?? 'http://localhost:5173/';

function store() {
  const files = createFsStore(process.env.ADMIN_CONTENT_ROOT ? resolve(process.env.ADMIN_CONTENT_ROOT) : repo);
  if (!process.env.ADMIN_READONLY) return files;
  return {
    ...files,
    async commit() {
      throw new HttpError(403, 'This admin is read-only (ADMIN_READONLY): nothing was saved.');
    },
  };
}

/** The API on a Node server (dev or preview): /api/* through handleApi, `extra` headers on its answers. */
function apiMiddleware(extra = {}) {
  const content = store();
  return async (req, res, next) => {
    if (!req.url.startsWith('/api/')) return next();
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers();
      for (const name of ['origin', 'sec-fetch-site', 'content-type'])
        if (req.headers[name]) headers.set(name, req.headers[name]);
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      const response = await handleApi(request, { store: content, user: { email: 'local' }, siteUrl });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      for (const [key, value] of Object.entries(extra)) res.setHeader(key, value);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      next(e);
    }
  };
}

function localApi() {
  return {
    name: 'admin-local-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware(securityHeaders(siteUrl)));
    },
  };
}

export default defineConfig({
  root: resolve(here, 'ui'),
  publicDir: false,
  plugins: [localApi()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [repo] } },
  preview: { host: '127.0.0.1', port: 5175, headers: securityHeaders(siteUrl) },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    // Fonts stay files: font-src 'self' refuses a font inlined as a data: URL (small
    // @fontsource subsets would be).
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
  },
});
