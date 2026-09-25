// The admin panel on Cloudflare: every request (the page itself included) must
// carry a valid Cloudflare Access sign-in for an allowed email, then /api/* goes to
// the API (saving to GitHub) and everything else to the built admin page.
import { handleApi } from './server/api.js';
import { verifyAccess } from './server/auth.js';
import { createGitHubStore } from './server/github.js';
import { HttpError } from './server/errors.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'", "img-src 'self' blob: data:", "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com', "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const blocked = (status, message) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Admin</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#07070b;color:#e9e3d2;font:16px/1.5 system-ui,sans-serif">
<main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px;color:#ffc76a">${status === 403 ? 'Not allowed' : 'Sign in needed'}</h1>
<p>${esc(message)}</p>${status === 403 ? '<p><a style="color:#ffc76a" href="/cdn-cgi/access/logout">Sign out and use another account</a></p>' : ''}</main>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS } },
);

export default {
  async fetch(request, env) {
    let user;
    try {
      user = await verifyAccess(request, env);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      return blocked(e.status ?? 500, e.message ?? 'Sign-in check failed.');
    }
    const url = new URL(request.url);
    let res;
    if (url.pathname.startsWith('/api/')) {
      try {
        res = await handleApi(request, { store: createGitHubStore(env), user, siteUrl: env.SITE_URL ?? '' });
      } catch (e) { // store misconfiguration
        const status = e instanceof HttpError ? e.status : 500;
        res = new Response(JSON.stringify({ error: e.message }), { status, headers: { 'Content-Type': 'application/json' } });
      }
    } else {
      res = await env.ASSETS.fetch(request);
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    return out;
  },
};
