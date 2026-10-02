// Who's asking? Cloudflare Access signs in the user (Google, limited to your
// allowlist) before a request ever reaches the Worker, and attaches a signed JWT
// (the Cf-Access-Jwt-Assertion header and the CF_Authorization cookie). Access has
// already turned everyone else away at the edge; verifying the token here as well
// means the admin never trusts a request that skipped the gate (a misconfigured
// policy, a route added later): signature against Access's published keys, the
// team (issuer), this application (audience), expiry, and the email allowlist.
import { HttpError } from './errors.js';
import { fromBase64url, fromUtf8, utf8 } from './bytes.js';

const KEY_TTL = 60 * 60 * 1000;
let keyCache = { url: '', at: 0, keys: [] };

async function signingKeys(teamDomain, fetchImpl, fresh = false) {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (!fresh && keyCache.url === url && Date.now() - keyCache.at < KEY_TTL) return keyCache.keys;
  const res = await fetchImpl(url);
  if (!res.ok) throw new HttpError(503, 'Couldn’t load the Access signing keys.');
  const { keys = [] } = await res.json();
  keyCache = { url, at: Date.now(), keys };
  return keys;
}

function readToken(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1] ?? null;
}

const decode = (part) => JSON.parse(fromUtf8(fromBase64url(part)));

/** Resolves to { email } for an allowed, signed-in user; throws HttpError(401/403/500) otherwise. */
export async function verifyAccess(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const team = (env.ACCESS_TEAM_DOMAIN ?? '').replace(/\/+$/, '');
  if (!team || !env.ACCESS_AUD)
    throw new HttpError(500, 'The admin isn’t configured: set ACCESS_TEAM_DOMAIN and ACCESS_AUD.');
  const allowed = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) throw new HttpError(500, 'The admin isn’t configured: set ALLOWED_EMAILS.');

  const token = readToken(request);
  if (!token) throw new HttpError(401, 'Not signed in.');
  const parts = token.split('.');
  let header, payload;
  try {
    if (parts.length !== 3) throw new Error();
    header = decode(parts[0]);
    payload = decode(parts[1]);
  } catch {
    throw new HttpError(401, 'Malformed sign-in token.');
  }
  if (header.alg !== 'RS256') throw new HttpError(401, 'Unexpected token algorithm.');

  let jwk = (await signingKeys(team, fetchImpl)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(team, fetchImpl, true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) throw new HttpError(401, 'Token signed with an unknown key.');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    fromBase64url(parts[2]),
    utf8(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new HttpError(401, 'Bad token signature.');

  const t = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= t)
    throw new HttpError(401, 'Your session expired. Reload to sign in again.');
  if (typeof payload.nbf === 'number' && payload.nbf > t + 60) throw new HttpError(401, 'Token not valid yet.');
  if (payload.iss !== team) throw new HttpError(401, 'Token from a different Access team.');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) throw new HttpError(401, 'Token for a different application.');
  const email = String(payload.email ?? '').toLowerCase();
  if (!email || !allowed.includes(email)) throw new HttpError(403, 'This account isn’t allowed to edit the site.');
  return { email };
}
