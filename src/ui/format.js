import { decodeHlc } from '../core/hlc.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const hlcDate = (hlc) => new Date(decodeHlc(hlc).ms);

export function dateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, mon: MONTHS[m - 1], dow: DAYS[new Date(y, m - 1, d).getDay()] };
}

/** "12 Oct" or "12 Oct 2025" when not this year. */
export function shortDate(iso, now = new Date()) {
  const p = dateParts(iso);
  return p.y === now.getFullYear() ? `${p.d} ${p.mon}` : `${p.d} ${p.mon} ${p.y}`;
}

export function longDate(iso) {
  const p = dateParts(iso);
  return `${p.dow}, ${p.d} ${MONTHS_LONG[p.m - 1]} ${p.y}`;
}

export function monthTitle(ym, now = new Date()) {
  const [y, m] = ym.split('-').map(Number);
  return y === now.getFullYear() ? MONTHS_LONG[m - 1] : `${MONTHS_LONG[m - 1]} ${y}`;
}

export function dayTitle(date, now = new Date()) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][a.getDay()];
  return `${DAYS[a.getDay()]}, ${a.getDate()} ${MONTHS[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ' ' + a.getFullYear() : ''}`;
}

export function timeOf(date) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`;
  return shortDate(new Date(ms).toISOString().slice(0, 10));
}

export const firstName = (name) => (name || '').trim().split(/\s+/)[0] || name || '';

export function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0][0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] || '';
  return (a + b).toUpperCase();
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
