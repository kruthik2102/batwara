import { tick } from './hlc.js';
import { newId, importPrivate, importPublic, signBytes, verifyBytes, utf8 } from './crypto.js';

/**
 * Every change is an immutable, signed event:
 * { id, hlc, g (group id), by (author uid), dev (device id), t (type), p (payload), sig }
 */
export const EVENT_TYPES = new Set([
  'group_created',
  'group_updated',
  'member_added',
  'member_removed',
  'device_key',
  'profile',
  'vpa_set',
  'expense_added',
  'expense_edited',
  'expense_deleted',
  'expense_restored',
  'comment_added',
  'settlement_proposed',
  'settlement_confirmed',
  'settlement_declined',
  'settlement_cancelled',
  'recurring_set',
  'recurring_stopped',
]);

/** Deterministic JSON: sorted keys, no whitespace, undefined dropped. */
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

export function signingBytes(ev) {
  return utf8(canonical({ id: ev.id, hlc: ev.hlc, g: ev.g, by: ev.by, dev: ev.dev, t: ev.t, p: ev.p }));
}

export function isEventShape(ev) {
  return (
    ev && typeof ev === 'object' &&
    typeof ev.id === 'string' && ev.id.length > 0 && ev.id.length <= 120 &&
    typeof ev.hlc === 'string' && /^\d{15}-\d{5}-[0-9a-z]+$/.test(ev.hlc) &&
    typeof ev.g === 'string' && ev.g.length > 0 && ev.g.length <= 64 &&
    typeof ev.by === 'string' && ev.by.length <= 64 &&
    typeof ev.dev === 'string' && ev.dev.length <= 64 &&
    EVENT_TYPES.has(ev.t) &&
    ev.p && typeof ev.p === 'object' && !Array.isArray(ev.p) &&
    typeof ev.sig === 'string'
  );
}

/** author: { uid, dev, priv (JWK) } */
export async function createEvent({ t, p, g, author, clock, id, now }) {
  const ev = { id: id || newId('e'), hlc: tick(clock, now), g, by: author.uid, dev: author.dev, t, p };
  ev.sig = await signBytes(await importPrivate(author.priv), signingBytes(ev));
  return ev;
}

export async function verifyEvent(pub, ev) {
  return verifyBytes(await importPublic(pub), ev.sig, signingBytes(ev));
}

export const byHlc = (a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
