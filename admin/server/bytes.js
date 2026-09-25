// Byte helpers that behave the same on Cloudflare Workers and Node.

export const utf8 = (text) => new TextEncoder().encode(text);
export const fromUtf8 = (bytes) => new TextDecoder().decode(bytes);

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const base64url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromBase64url = (s) => fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

/** Git's blob id for some bytes: sha1("blob <len>\0" + bytes), hex. Lets a local store version files the way GitHub does. */
export async function gitBlobSha(bytes) {
  const head = utf8(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A WebP file starts with "RIFF" <size> "WEBP". */
export const isWebp = (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
  && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
