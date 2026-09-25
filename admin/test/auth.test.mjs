// Cloudflare Access token checks: real RS256 tokens signed with a generated key,
// served through a fake /cdn-cgi/access/certs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccess } from '../server/auth.js';
import { base64url, utf8 } from '../server/bytes.js';

const TEAM = 'https://team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAILS: 'me@gmail.com, second@gmail.com' };

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' };
let certFetches = 0;
const fetchImpl = async (url) => {
  certFetches++;
  assert.equal(url, `${TEAM}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [jwk] }));
};

async function token(claims = {}, { key = pair.privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(utf8(JSON.stringify({ alg, kid, typ: 'JWT' })));
  const body = base64url(utf8(JSON.stringify({ iss: TEAM, aud: [AUD], email: 'me@gmail.com', iat: now, exp: now + 3600, ...claims })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(`${head}.${body}`)));
  return `${head}.${body}.${base64url(sig)}`;
}
const req = (headers) => new Request('https://admin.example/api/session', { headers });
const status = async (p) => { try { await p; return 200; } catch (e) { return e.status; } };

test('accepts an allowed user (header or cookie), case-insensitively', async () => {
  assert.deepEqual(await verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token() }), env, { fetchImpl }), { email: 'me@gmail.com' });
  const t = await token({ email: 'Second@Gmail.com' });
  assert.deepEqual(await verifyAccess(req({ Cookie: `a=b; CF_Authorization=${t}` }), env, { fetchImpl }), { email: 'second@gmail.com' });
});

test('refuses missing, forged, expired and misdirected tokens', async () => {
  assert.equal(await status(verifyAccess(req({}), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': 'not.a.token' }), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({}, { key: other.privateKey }) }), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({ exp: Math.floor(Date.now() / 1000) - 5 }) }), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({ aud: ['someone-else'] }) }), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({ iss: 'https://evil.cloudflareaccess.com' }) }), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({}, { alg: 'HS256' }) }), env, { fetchImpl })), 401);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({}, { kid: 'unknown' }) }), env, { fetchImpl })), 401);
});

test('a valid sign-in that isn’t on the allowlist is forbidden', async () => {
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token({ email: 'stranger@gmail.com' }) }), env, { fetchImpl })), 403);
});

test('refuses to run unconfigured', async () => {
  const t = await token();
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': t }), { ...env, ACCESS_AUD: '' }, { fetchImpl })), 500);
  assert.equal(await status(verifyAccess(req({ 'Cf-Access-Jwt-Assertion': t }), { ...env, ALLOWED_EMAILS: ' ' }, { fetchImpl })), 500);
});

test('signing keys are cached', async () => {
  const before = certFetches;
  await verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token() }), env, { fetchImpl });
  await verifyAccess(req({ 'Cf-Access-Jwt-Assertion': await token() }), env, { fetchImpl });
  assert.equal(certFetches, before);
});
