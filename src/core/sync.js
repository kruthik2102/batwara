// Serverless sync. A group's whole event log travels as one encrypted file that people pass around
// however they like (WhatsApp, Quick Share, Bluetooth, email). Importing merges logs; merging is a set
// union by event id, so the order files arrive in never matters and importing twice changes nothing.

import { isEventShape, verifyEvent, byHlc } from './events.js';
import { encrypt, decrypt, gzip, gunzip, canCompress, utf8, fromUtf8 } from './crypto.js';

export const BUNDLE_FORMAT = 'batwara.group';
export const BUNDLE_VERSION = 1;
const aadFor = (gid) => `${BUNDLE_FORMAT}/${BUNDLE_VERSION}/${gid}`;
const MAX_ATTACHMENT = 3_000_000;

export class BundleError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Keep only the fields an event is allowed to have. */
export function cleanEvent(e) {
  return { id: e.id, hlc: e.hlc, g: e.g, by: e.by, dev: e.dev, t: e.t, p: e.p, sig: e.sig };
}

/**
 * kind "update": readable only by phones that already joined the group.
 * kind "invite": carries the group key, so the person who opens it can join.
 */
export async function buildBundle({ gid, name, events, attachments, key, invite, from, now = new Date() }) {
  const body = utf8(JSON.stringify({ events: events.map(cleanEvent), attachments: attachments || {} }));
  const z = canCompress ? 1 : 0;
  const { iv, ct } = await encrypt(key, z ? await gzip(body) : body, aadFor(gid));
  const out = {
    format: BUNDLE_FORMAT,
    v: BUNDLE_VERSION,
    kind: invite ? 'invite' : 'update',
    gid,
    name,
    from: { uid: from.uid, name: from.name },
    at: now.toISOString(),
    count: events.length,
    z,
    iv,
    ct,
  };
  if (invite) out.key = key;
  return JSON.stringify(out);
}

export function readBundle(text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    throw new BundleError('This file isn’t a Batwara group file.', 'format');
  }
  if (!b || b.format !== BUNDLE_FORMAT) throw new BundleError('This file isn’t a Batwara group file.', 'format');
  if (b.v !== BUNDLE_VERSION) throw new BundleError('This file was made by a newer version of Batwara. Update the app, then open it again.', 'version');
  if (typeof b.gid !== 'string' || typeof b.iv !== 'string' || typeof b.ct !== 'string') {
    throw new BundleError('This group file is incomplete. Ask for it to be sent again.', 'format');
  }
  return b;
}

export async function openBundle(b, key) {
  let bytes;
  try {
    bytes = await decrypt(key, b.iv, b.ct, aadFor(b.gid));
  } catch {
    throw new BundleError('This file couldn’t be unlocked. It may be damaged, or it was made for a different group.', 'decrypt');
  }
  try {
    if (b.z) bytes = await gunzip(bytes);
    const body = JSON.parse(fromUtf8(bytes));
    const events = Array.isArray(body.events) ? body.events : [];
    const attachments = {};
    if (body.attachments && typeof body.attachments === 'object') {
      for (const [id, v] of Object.entries(body.attachments)) {
        if (typeof v === 'string' && v.startsWith('data:image/') && v.length < MAX_ATTACHMENT && /^[a-z0-9]{4,40}$/.test(id)) attachments[id] = v;
      }
    }
    return { events, attachments };
  } catch {
    throw new BundleError('This file is damaged. Ask for it to be sent again.', 'damaged');
  }
}

/**
 * Accept an incoming event only if it has the right shape, belongs to this group and carries a valid
 * signature from a device key bound to its author. `known` is the device map from the local log.
 */
export async function verifyIncoming(incoming, known, gid) {
  const keys = { ...known };
  const rejected = [];
  const keyEvents = incoming.filter((e) => isEventShape(e) && e.t === 'device_key' && e.g === gid).sort(byHlc);
  for (const e of keyEvents) {
    const p = e.p;
    if (p.uid !== e.by || typeof p.x !== 'string' || typeof p.y !== 'string') continue;
    if (!(await verifyEvent({ x: p.x, y: p.y }, e))) continue;
    const k = keys[e.dev];
    if (k && (k.x !== p.x || k.y !== p.y || k.uid !== p.uid)) continue; // a known device can't be re-keyed
    keys[e.dev] = { uid: p.uid, x: p.x, y: p.y };
  }
  const valid = [];
  for (const raw of incoming) {
    if (!isEventShape(raw)) { rejected.push({ id: raw?.id, reason: 'malformed' }); continue; }
    const e = cleanEvent(raw);
    if (e.g !== gid) { rejected.push({ id: e.id, reason: 'other group' }); continue; }
    const k = keys[e.dev];
    if (!k) { rejected.push({ id: e.id, reason: 'unknown device' }); continue; }
    if (k.uid !== e.by) { rejected.push({ id: e.id, reason: 'device belongs to someone else' }); continue; }
    if (e.t === 'device_key' && (e.p.x !== k.x || e.p.y !== k.y)) { rejected.push({ id: e.id, reason: 'key mismatch' }); continue; }
    if (!(await verifyEvent(k, e))) { rejected.push({ id: e.id, reason: 'bad signature' }); continue; }
    valid.push(e);
  }
  return { valid, rejected };
}

/**
 * Set union by id. If two different events share an id (two phones filled in the same recurring
 * expense), every phone keeps the one with the earlier timestamp, so they all end up identical.
 */
export function mergeEvents(local, incoming) {
  const map = new Map(local.map((e) => [e.id, e]));
  const added = [];
  let replaced = 0;
  for (const e of incoming) {
    const cur = map.get(e.id);
    if (!cur) {
      map.set(e.id, e);
      added.push(e);
    } else if (cur.sig !== e.sig && (e.hlc < cur.hlc || (e.hlc === cur.hlc && e.dev < cur.dev))) {
      map.set(e.id, e);
      replaced++;
    }
  }
  return { events: [...map.values()].sort(byHlc), added, replaced };
}

export const groupEvents = (events, gid) => events.filter((e) => e.g === gid);

export function bundleFileName(name, kind) {
  const slug = String(name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'group';
  return `batwara-${slug}-${kind}.json`;
}
