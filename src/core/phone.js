import { sha256, base32 } from './crypto.js';

/** Indian mobile numbers only for now: returns "+91XXXXXXXXXX" or null. */
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? '+91' + d : null;
}

export function formatPhone(e164) {
  return /^\+91\d{10}$/.test(e164 || '') ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164 || '';
}

/** Group members know your number already; this is for places a stranger might glance at. */
export function maskPhone(e164) {
  return /^\+91\d{10}$/.test(e164 || '') ? `+91 ${e164.slice(3, 5)}••• ••${e164.slice(10)}` : e164 || '';
}

/** A person's id is derived from their verified number, so every phone computes the same id. */
export async function uidFromPhone(e164) {
  return 'u' + base32(await sha256('batwara:' + e164)).slice(0, 20);
}
