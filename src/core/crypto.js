// WebCrypto helpers. Works in the Android WebView (https://localhost is a secure context) and in Node 20+.

const subtle = () => globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);

export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

// ---- base64url -------------------------------------------------------------
export function b64u(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s) {
  const str = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- ids -------------------------------------------------------------------
const B32 = '0123456789abcdefghjkmnpqrstvwxyz';
export function base32(bytes) {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
    val &= 0xff;
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

export function newId(prefix = '', bytes = 10) {
  return prefix + base32(randomBytes(bytes));
}

export async function sha256(data) {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return new Uint8Array(await subtle().digest('SHA-256', bytes));
}

// ---- device signing keys (ECDSA P-256) ------------------------------------
const EC = { name: 'ECDSA', namedCurve: 'P-256' };
const SIG = { name: 'ECDSA', hash: 'SHA-256' };

export async function generateDeviceKey() {
  const kp = await subtle().generateKey(EC, true, ['sign', 'verify']);
  const priv = await subtle().exportKey('jwk', kp.privateKey);
  return { priv: { kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d }, pub: { x: priv.x, y: priv.y } };
}

const privCache = new Map();
export async function importPrivate(jwk) {
  const k = jwk.d;
  if (privCache.has(k)) return privCache.get(k);
  const key = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, EC, false, ['sign']);
  privCache.set(k, key);
  return key;
}

const pubCache = new Map();
export async function importPublic(pub) {
  const k = pub.x + '.' + pub.y;
  if (pubCache.has(k)) return pubCache.get(k);
  const key = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, ext: true }, EC, false, ['verify']);
  pubCache.set(k, key);
  return key;
}

export async function signBytes(privKey, bytes) {
  return b64u(new Uint8Array(await subtle().sign(SIG, privKey, bytes)));
}

export async function verifyBytes(pubKey, sig, bytes) {
  try {
    return await subtle().verify(SIG, pubKey, fromB64u(sig), bytes);
  } catch {
    return false;
  }
}

// ---- group keys (AES-256-GCM) ---------------------------------------------
export function newGroupKey() {
  return b64u(randomBytes(32));
}

async function aesKey(keyB64) {
  return subtle().importKey('raw', fromB64u(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(keyB64, bytes, aad) {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, await aesKey(keyB64), bytes);
  return { iv: b64u(iv), ct: b64u(new Uint8Array(ct)) };
}

export async function decrypt(keyB64, iv, ct, aad) {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: utf8(aad) }, await aesKey(keyB64), fromB64u(ct));
  return new Uint8Array(pt);
}

// ---- compression -------------------------------------------------------------
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const canCompress = typeof globalThis.CompressionStream === 'function';

export async function gzip(bytes) {
  return canCompress ? pipe(bytes, new CompressionStream('gzip')) : bytes;
}

export async function gunzip(bytes) {
  return pipe(bytes, new DecompressionStream('gzip'));
}
