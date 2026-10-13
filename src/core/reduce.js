import { byHlc } from './events.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UID_RE = /^u[0-9a-z]{8,40}$/;
const isInt = (v) => Number.isInteger(v);
const posInt = (v) => Number.isInteger(v) && v > 0;
const str = (v, max) => typeof v === 'string' && v.length <= max;

function validMoneyMap(m, allowed) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const keys = Object.keys(m);
  if (!keys.length) return false;
  for (const k of keys) if (!allowed.has(k) || !posInt(m[k])) return false;
  return true;
}

function sum(m) {
  let s = 0;
  for (const k in m) s += m[k];
  return s;
}

export function validExpense(p, group) {
  if (!p || !str(p.id, 120) || !str(p.desc, 80) || !p.desc.trim()) return 'bad fields';
  if (!str(p.cat || '', 40) || !DATE_RE.test(p.date || '')) return 'bad date';
  if (!str(p.cur, 8) || !(typeof p.fx === 'number' && p.fx > 0)) return 'bad currency';
  if (!posInt(p.amt) || !posInt(p.base)) return 'bad amount';
  const allowed = new Set(group.everMembers);
  if (!validMoneyMap(p.paid, allowed) || !validMoneyMap(p.owed, allowed)) return 'bad shares';
  if (sum(p.paid) !== p.base || sum(p.owed) !== p.base) return 'shares do not add up';
  return null;
}

export function emptyState() {
  return { users: {}, devices: {}, groups: {}, expenses: {}, settlements: {}, comments: {}, recurring: {}, feed: [], rejected: [] };
}

/**
 * Fold the event log into the current picture. Events are applied in HLC order,
 * so a later edit always wins (last-writer-wins), on every phone, in the same way.
 */
export function reduce(events) {
  const st = emptyState();
  const list = events.slice().sort(byHlc);
  for (const ev of list) apply(st, ev);
  return st;
}

function reject(st, ev, reason) {
  st.rejected.push({ id: ev.id, t: ev.t, reason });
}

function feed(st, ev, extra) {
  st.feed.push({ id: ev.id, t: ev.t, g: ev.g, by: ev.by, hlc: ev.hlc, ...extra });
}

function user(st, uid) {
  let u = st.users[uid];
  if (!u) u = st.users[uid] = { uid, name: '', phone: '', vpa: '', selfName: false, selfVpa: false };
  return u;
}

function apply(st, ev) {
  const p = ev.p || {};
  const g = st.groups[ev.g];

  if (ev.t === 'group_created') {
    if (g) return reject(st, ev, 'group exists');
    if (!str(p.name, 60) || !p.name.trim()) return reject(st, ev, 'bad name');
    st.groups[ev.g] = {
      id: ev.g,
      name: p.name.trim(),
      kind: str(p.kind, 20) ? p.kind : 'other',
      cur: str(p.cur, 8) ? p.cur : 'INR',
      simplify: p.simplify !== false,
      by: ev.by,
      hlc: ev.hlc,
      lastHlc: ev.hlc,
      members: [ev.by],
      everMembers: [ev.by],
    };
    feed(st, ev, {});
    return;
  }

  if (!g) return reject(st, ev, 'unknown group');
  if (!g.everMembers.includes(ev.by)) return reject(st, ev, 'author is not in the group');
  if (ev.hlc > g.lastHlc) g.lastHlc = ev.hlc;

  switch (ev.t) {
    case 'group_updated': {
      if (str(p.name, 60) && p.name.trim()) g.name = p.name.trim();
      if (str(p.kind, 20)) g.kind = p.kind;
      if (str(p.cur, 8)) g.cur = p.cur;
      if (typeof p.simplify === 'boolean') g.simplify = p.simplify;
      return;
    }
    case 'member_added': {
      if (!UID_RE.test(p.uid || '') || !str(p.phone, 20) || !str(p.name, 60)) return reject(st, ev, 'bad member');
      if (!g.everMembers.includes(p.uid)) g.everMembers.push(p.uid);
      if (!g.members.includes(p.uid)) g.members.push(p.uid);
      const u = user(st, p.uid);
      if (!u.selfName && p.name.trim()) u.name = p.name.trim();
      if (p.phone) u.phone = p.phone;
      if (p.uid !== ev.by) feed(st, ev, { uid: p.uid });
      return;
    }
    case 'member_removed': {
      g.members = g.members.filter((m) => m !== p.uid);
      feed(st, ev, { uid: p.uid });
      return;
    }
    case 'device_key': {
      if (p.uid !== ev.by || !str(p.x, 64) || !str(p.y, 64)) return reject(st, ev, 'bad device key');
      if (!st.devices[ev.dev]) st.devices[ev.dev] = { uid: p.uid, x: p.x, y: p.y, hlc: ev.hlc };
      return;
    }
    case 'profile': {
      const u = user(st, ev.by);
      if (str(p.name, 60) && p.name.trim()) { u.name = p.name.trim(); u.selfName = true; }
      if (typeof p.vpa === 'string' && p.vpa.length <= 120) { u.vpa = p.vpa.trim(); u.selfVpa = true; }
      if (str(p.phone, 20) && p.phone) u.phone = p.phone;
      return;
    }
    case 'vpa_set': {
      if (!g.everMembers.includes(p.uid) || !str(p.vpa, 120)) return reject(st, ev, 'bad upi id');
      const u = user(st, p.uid);
      if (!u.selfVpa || ev.by === p.uid) u.vpa = p.vpa.trim();
      return;
    }
    case 'expense_added': {
      if (st.expenses[p.id]) return reject(st, ev, 'expense exists');
      const bad = validExpense(p, g);
      if (bad) return reject(st, ev, bad);
      st.expenses[p.id] = { ...p, gid: g.id, by: ev.by, hlc: ev.hlc, editedBy: null, editedHlc: null, deleted: false, history: [{ t: 'added', by: ev.by, hlc: ev.hlc }] };
      feed(st, ev, { x: p.id });
      return;
    }
    case 'expense_edited': {
      const x = st.expenses[p.id];
      if (!x || x.gid !== g.id) return reject(st, ev, 'unknown expense');
      const bad = validExpense(p, g);
      if (bad) return reject(st, ev, bad);
      const keep = { gid: x.gid, by: x.by, hlc: x.hlc, deleted: x.deleted, deletedBy: x.deletedBy, deletedHlc: x.deletedHlc, history: x.history };
      st.expenses[p.id] = { ...p, ...keep, editedBy: ev.by, editedHlc: ev.hlc };
      x.history.push({ t: 'edited', by: ev.by, hlc: ev.hlc });
      feed(st, ev, { x: p.id });
      return;
    }
    case 'expense_deleted':
    case 'expense_restored': {
      const x = st.expenses[p.id];
      if (!x || x.gid !== g.id) return reject(st, ev, 'unknown expense');
      x.deleted = ev.t === 'expense_deleted';
      x.deletedBy = x.deleted ? ev.by : null;
      x.deletedHlc = x.deleted ? ev.hlc : null;
      x.history.push({ t: x.deleted ? 'deleted' : 'restored', by: ev.by, hlc: ev.hlc });
      feed(st, ev, { x: p.id });
      return;
    }
    case 'comment_added': {
      const x = st.expenses[p.x];
      if (!x || x.gid !== g.id || !str(p.text, 500) || !p.text.trim()) return reject(st, ev, 'bad comment');
      (st.comments[p.x] ||= []).push({ id: ev.id, by: ev.by, hlc: ev.hlc, text: p.text.trim() });
      feed(st, ev, { x: p.x });
      return;
    }
    case 'settlement_proposed': {
      if (st.settlements[p.id]) return reject(st, ev, 'payment exists');
      if (!str(p.id, 120) || p.from === p.to || !g.everMembers.includes(p.from) || !g.everMembers.includes(p.to) || !posInt(p.amt)) {
        return reject(st, ev, 'bad payment');
      }
      const method = ['upi', 'cash', 'other'].includes(p.method) ? p.method : 'other';
      st.settlements[p.id] = {
        id: p.id, gid: g.id, from: p.from, to: p.to, amt: p.amt, method,
        vpa: str(p.vpa, 120) ? p.vpa : '', ref: str(p.ref, 80) ? p.ref : '', app: str(p.app, 60) ? p.app : '',
        date: DATE_RE.test(p.date || '') ? p.date : null,
        by: ev.by, hlc: ev.hlc,
        // The person receiving the money is the only one who can confirm it, so their own record counts straight away.
        status: ev.by === p.to ? 'confirmed' : 'pending',
        statusBy: ev.by === p.to ? ev.by : null,
        statusHlc: ev.by === p.to ? ev.hlc : null,
      };
      feed(st, ev, { s: p.id });
      return;
    }
    case 'settlement_confirmed':
    case 'settlement_declined':
    case 'settlement_cancelled': {
      const s = st.settlements[p.id];
      if (!s || s.gid !== g.id) return reject(st, ev, 'unknown payment');
      if (s.status !== 'pending') return reject(st, ev, 'payment already settled');
      if (ev.t === 'settlement_cancelled') {
        if (ev.by !== s.by && ev.by !== s.from) return reject(st, ev, 'only the payer can cancel');
        s.status = 'cancelled';
      } else {
        if (ev.by !== s.to) return reject(st, ev, 'only the receiver can confirm');
        s.status = ev.t === 'settlement_confirmed' ? 'confirmed' : 'declined';
      }
      s.statusBy = ev.by;
      s.statusHlc = ev.hlc;
      feed(st, ev, { s: p.id });
      return;
    }
    case 'recurring_set': {
      if (!str(p.id, 80) || !['weekly', 'monthly'].includes(p.freq) || !DATE_RE.test(p.start || '') || !p.template) {
        return reject(st, ev, 'bad recurring rule');
      }
      const prev = st.recurring[p.id];
      st.recurring[p.id] = { id: p.id, gid: g.id, freq: p.freq, start: p.start, template: p.template, active: true, by: prev?.by || ev.by, hlc: prev?.hlc || ev.hlc, updatedHlc: ev.hlc };
      feed(st, ev, { r: p.id });
      return;
    }
    case 'recurring_stopped': {
      const r = st.recurring[p.id];
      if (!r || r.gid !== g.id) return reject(st, ev, 'unknown recurring rule');
      r.active = false;
      r.updatedHlc = ev.hlc;
      feed(st, ev, { r: p.id });
      return;
    }
    default:
      return reject(st, ev, 'unknown type');
  }
}

// ---- convenience views ------------------------------------------------------

export function groupList(st) {
  return Object.values(st.groups).sort((a, b) => (a.lastHlc < b.lastHlc ? 1 : -1));
}

export function groupExpenses(st, gid, { includeDeleted = false } = {}) {
  return Object.values(st.expenses)
    .filter((x) => x.gid === gid && (includeDeleted || !x.deleted))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.hlc < b.hlc ? 1 : -1));
}

export function groupSettlements(st, gid) {
  return Object.values(st.settlements).filter((s) => s.gid === gid).sort((a, b) => (a.hlc < b.hlc ? 1 : -1));
}

export function displayName(st, uid, me) {
  if (uid === me) return 'You';
  const u = st.users[uid];
  return u?.name || (u?.phone ? u.phone : 'Someone');
}
