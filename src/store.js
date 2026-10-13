// App state: the persisted event log plus everything derived from it.
// Every change goes through emit(): sign → append → re-reduce → save → notify.

import { reduce, emptyState } from './core/reduce.js';
import { createEvent } from './core/events.js';
import { createClock, observe } from './core/hlc.js';
import { generateDeviceKey, newGroupKey, newId } from './core/crypto.js';
import { uidFromPhone, formatPhone } from './core/phone.js';
import { buildBundle, readBundle, openBundle, verifyIncoming, mergeEvents, groupEvents, bundleFileName } from './core/sync.js';
import { dueOccurrences, occurrenceId, todayISO, nextOccurrence } from './core/recurring.js';
import { buildSample } from './core/seed.js';
import { buildExpense } from './core/split.js';
import { groupNets } from './core/balances.js';
import { DEFAULT_INR_RATES, inrTableFromReference } from './core/fx.js';
import { formatMoney } from './core/money.js';
import { loadData, saveData, saveAttachment, loadAttachment, wipeAll } from './platform/storage.js';
import { scheduleReminders, fetchReferenceRates, haptic } from './platform/native.js';

export class UserError extends Error {}

const fresh = () => ({
  v: 1,
  profile: null,
  device: null,
  clock: { ms: 0, c: 0 },
  events: [],
  keys: {},
  sync: {},
  prefs: { theme: 'system', haptics: true, reminders: false },
  demo: null,
  fx: null,
  syncLog: [],
});

const maxHlc = (events) => events.reduce((m, e) => (e.hlc > m ? e.hlc : m), '');

class Store {
  constructor() {
    this.data = fresh();
    this.state = emptyState();
    this.listeners = new Set();
    this.version = 0;
    this.queue = Promise.resolve();
    this.saveTimer = null;
    this.clock = null;
  }

  async init() {
    const d = await loadData();
    if (d && d.v === 1) this.data = { ...fresh(), ...d, prefs: { ...fresh().prefs, ...(d.prefs || {}) } };
    if (!this.data.device) {
      const k = await generateDeviceKey();
      this.data.device = { id: newId('d', 6), priv: k.priv, pub: k.pub };
      await this.saveNow();
    }
    this.clock = createClock(this.data.device.id, this.data.clock);
    const latest = maxHlc(this.data.events);
    if (latest) observe(this.clock, latest);
    haptic.enable(this.data.prefs.haptics !== false);
    this.recompute();
  }

  // ---- plumbing -----------------------------------------------------------------
  get me() { return this.data.profile?.uid || null; }
  get profile() { return this.data.profile; }
  get prefs() { return this.data.prefs; }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.version++;
    for (const fn of [...this.listeners]) fn(this.version);
  }

  recompute() {
    this.state = reduce(this.data.events);
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  async saveNow() {
    clearTimeout(this.saveTimer);
    if (this.clock) this.data.clock = { ms: this.clock.ms, c: this.clock.c };
    await saveData(this.data).catch(() => {});
  }

  /** Mutations run one at a time so clocks and the log never interleave. */
  run(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }

  author() {
    return { uid: this.me, dev: this.data.device.id, priv: this.data.device.priv };
  }

  /** Events that introduce this phone to a group: its public key and my profile. */
  joinEvents(gid) {
    const dev = this.data.device.id;
    if (this.data.events.some((e) => e.g === gid && e.t === 'device_key' && e.dev === dev)) return [];
    const pr = this.data.profile;
    return [
      ['device_key', { uid: this.me, x: this.data.device.pub.x, y: this.data.device.pub.y }, gid],
      ['profile', { name: pr.name, vpa: pr.vpa || '', phone: pr.phone }, gid],
    ];
  }

  async append(list) {
    const evs = [];
    for (const [t, p, g, id] of list) evs.push(await createEvent({ t, p, g, author: this.author(), clock: this.clock, id }));
    this.data.events.push(...evs);
    this.recompute();
    this.persist();
    this.notify();
    return evs;
  }

  emit(t, p, g, id) {
    return this.run(async () => {
      const evs = await this.append([...this.joinEvents(g), [t, p, g, id]]);
      return evs[evs.length - 1];
    });
  }

  setPref(k, v) {
    this.data.prefs[k] = v;
    if (k === 'haptics') haptic.enable(v);
    this.persist();
    this.notify();
    if (k === 'reminders') this.refreshReminders();
  }

  // ---- session --------------------------------------------------------------------------
  async signIn({ phone, name, vpa }) {
    const uid = await uidFromPhone(phone);
    this.data.profile = { uid, phone, name: name.trim(), vpa: vpa || '', verifiedAt: Date.now() };
    await this.saveNow();
    this.recompute();
    this.notify();
  }

  async updateProfile(patch) {
    const pr = this.data.profile;
    if (patch.name !== undefined) pr.name = patch.name.trim();
    if (patch.vpa !== undefined) pr.vpa = patch.vpa;
    const mine = Object.values(this.state.groups).filter((g) => g.everMembers.includes(this.me));
    await this.run(() =>
      mine.length ? this.append(mine.map((g) => ['profile', { name: pr.name, vpa: pr.vpa || '', phone: pr.phone }, g.id])) : (this.persist(), this.notify()),
    );
  }

  async eraseEverything() {
    clearTimeout(this.saveTimer);
    await wipeAll();
    this.data = fresh();
    this.saveTimer = null;
  }

  // ---- groups ---------------------------------------------------------------------------------
  async createGroup({ name, kind, cur, simplify, members }) {
    const gid = newId('g');
    this.data.keys[gid] = newGroupKey();
    const list = [['group_created', { name: name.trim(), kind, cur, simplify }, gid], ...this.joinEvents(gid)];
    for (const m of members) list.push(['member_added', { uid: await uidFromPhone(m.phone), name: m.name.trim(), phone: m.phone }, gid]);
    await this.run(() => this.append(list));
    return gid;
  }

  updateGroup(gid, patch) {
    return this.emit('group_updated', patch, gid);
  }

  async addMember(gid, { name, phone }) {
    const uid = await uidFromPhone(phone);
    if (uid === this.me) throw new UserError('That’s your own number.');
    if (this.state.groups[gid].members.includes(uid)) throw new UserError(`${name.trim() || 'That person'} is already in this group.`);
    return this.emit('member_added', { uid, name: name.trim(), phone }, gid);
  }

  removeMember(gid, uid) {
    if (groupNets(this.state, gid)[uid]) throw new UserError('Settle their balance before removing them.');
    return this.emit('member_removed', { uid }, gid);
  }

  async forgetGroup(gid) {
    await this.run(async () => {
      this.data.events = this.data.events.filter((e) => e.g !== gid);
      delete this.data.keys[gid];
      delete this.data.sync[gid];
      if (this.data.demo) this.data.demo.groups = this.data.demo.groups.filter((g) => g !== gid);
      this.recompute();
      this.persist();
      this.notify();
    });
    this.refreshReminders();
  }

  setVpaFor(gid, uid, vpa) {
    return this.emit('vpa_set', { uid, vpa }, gid);
  }

  // ---- expenses ---------------------------------------------------------------------------------
  async addExpense(gid, payload, repeat = 'never') {
    const list = [];
    if (repeat === 'weekly' || repeat === 'monthly') {
      const rid = newId('r');
      const template = { ...payload };
      delete template.id;
      delete template.date;
      delete template.rc;
      list.push(['recurring_set', { id: rid, freq: repeat, start: payload.date, template }, gid]);
      const id = occurrenceId(rid, payload.date);
      list.push(['expense_added', { ...payload, id, rid }, gid, 'e.' + id]);
    } else {
      list.push(['expense_added', { ...payload, id: payload.id || newId('x') }, gid]);
    }
    await this.run(() => this.append([...this.joinEvents(gid), ...list]));
    if (repeat !== 'never') this.refreshReminders();
  }

  editExpense(gid, payload) {
    return this.emit('expense_edited', payload, gid);
  }

  deleteExpense(gid, id) {
    return this.emit('expense_deleted', { id }, gid);
  }

  restoreExpense(gid, id) {
    return this.emit('expense_restored', { id }, gid);
  }

  addComment(gid, x, text) {
    return this.emit('comment_added', { x, text: text.trim() }, gid);
  }

  async stopRecurring(gid, rid) {
    await this.emit('recurring_stopped', { id: rid }, gid);
    this.refreshReminders();
  }

  /** Fill in recurring expenses that came due while the app was closed. */
  async materializeRecurring() {
    if (!this.me) return 0;
    const due = dueOccurrences(this.state, todayISO()).filter(({ rule }) => this.state.groups[rule.gid]?.everMembers.includes(this.me));
    if (!due.length) return 0;
    await this.run(() =>
      this.append(due.map(({ rule, date, id }) => ['expense_added', { ...rule.template, id, date, rid: rule.id }, rule.gid, 'e.' + id])),
    );
    return due.length;
  }

  async refreshReminders() {
    if (!this.data.prefs.reminders) return scheduleReminders([]);
    const today = todayISO();
    const items = [];
    for (const r of Object.values(this.state.recurring)) {
      const g = this.state.groups[r.gid];
      if (!r.active || !g) continue;
      const next = nextOccurrence(r, today);
      if (!next) continue;
      const [y, m, d] = next.split('-').map(Number);
      let h = 0;
      for (const c of r.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      items.push({
        id: 1000 + (h % 1_000_000),
        title: `${r.template.desc} is due today`,
        body: `${formatMoney(r.template.base, g.cur)} will be added to ${g.name}.`,
        at: new Date(y, m - 1, d, 9, 0, 0),
      });
    }
    return scheduleReminders(items);
  }

  // ---- payments ---------------------------------------------------------------------------------------
  proposePayment({ gid, from, to, amt, method, vpa, app, ref }) {
    return this.emit('settlement_proposed', { id: newId('s'), from, to, amt, method, vpa: vpa || '', app: app || '', ref: ref || '', date: todayISO() }, gid);
  }

  confirmPayment(gid, id) {
    return this.emit('settlement_confirmed', { id }, gid);
  }

  declinePayment(gid, id) {
    return this.emit('settlement_declined', { id }, gid);
  }

  cancelPayment(gid, id) {
    return this.emit('settlement_cancelled', { id }, gid);
  }

  // ---- sync files -----------------------------------------------------------------------------------------
  async exportGroup(gid, invite) {
    const g = this.state.groups[gid];
    const events = groupEvents(this.data.events, gid);
    const attachments = {};
    for (const x of Object.values(this.state.expenses)) {
      if (x.gid === gid && x.rc && !x.deleted) {
        const v = await loadAttachment(x.rc);
        if (v) attachments[x.rc] = v;
      }
    }
    const text = await buildBundle({ gid, name: g.name, events, attachments, key: this.data.keys[gid], invite, from: { uid: this.me, name: this.profile.name } });
    const s = (this.data.sync[gid] ||= {});
    s.lastShared = { at: Date.now(), hlc: maxHlc(events), invite: !!invite };
    this.persist();
    this.notify();
    return { name: bundleFileName(g.name, invite ? 'invite' : 'update'), text, group: g };
  }

  /** My changes in this group that haven't gone out in a file yet. */
  unsharedCount(gid) {
    const last = this.data.sync[gid]?.lastShared?.hlc || '';
    let n = 0;
    for (const e of this.data.events) if (e.g === gid && e.by === this.me && e.hlc > last && e.t !== 'device_key' && e.t !== 'profile') n++;
    return n;
  }

  peekBundle(text) {
    const b = readBundle(text);
    return { kind: b.kind, gid: b.gid, name: b.name, from: b.from?.name || 'Someone', count: b.count || 0, known: !!this.data.keys[b.gid], canOpen: !!(b.key || this.data.keys[b.gid]) };
  }

  importBundle(text) {
    return this.run(async () => {
      const b = readBundle(text);
      const key = b.key || this.data.keys[b.gid];
      const who = b.from?.name || 'a member';
      if (!key) throw new UserError(`This is an update for “${b.name}”, but this phone hasn’t joined that group. Ask ${who} to send you an invite instead.`);
      const { events, attachments } = await openBundle(b, key);
      const { valid, rejected } = await verifyIncoming(events, this.state.devices, b.gid);
      const merged = mergeEvents(this.data.events, valid);
      const preview = reduce(merged.events);
      const g = preview.groups[b.gid];
      if (!g) throw new UserError('This file doesn’t include the group itself. Ask for a new invite.');
      if (!g.members.includes(this.me)) {
        throw new UserError(`Your number isn’t in “${g.name}”. Ask ${who} to add ${formatPhone(this.profile.phone)} to the group, then send a new invite.`);
      }
      const joined = !this.data.keys[b.gid];
      this.data.events = merged.events;
      this.data.keys[b.gid] = key;
      for (const e of valid) observe(this.clock, e.hlc);
      for (const [id, v] of Object.entries(attachments)) await saveAttachment(id, v);
      const entry = { gid: b.gid, from: b.from?.name || '', fromUid: b.from?.uid || '', kind: b.kind, added: merged.added.length + merged.replaced, rejected: rejected.length, at: Date.now(), joined };
      this.data.syncLog = [entry, ...this.data.syncLog].slice(0, 60);
      (this.data.sync[b.gid] ||= {}).lastImport = entry;
      this.recompute();
      const intro = this.joinEvents(b.gid);
      if (intro.length) await this.append(intro);
      else {
        this.persist();
        this.notify();
      }
      return { ...entry, name: this.state.groups[b.gid].name };
    }).then(async (r) => {
      await this.materializeRecurring();
      this.refreshReminders();
      return r;
    });
  }

  // ---- exchange rates ---------------------------------------------------------------------------------------
  fxTable() {
    return this.data.fx?.rates || DEFAULT_INR_RATES;
  }

  async updateRates() {
    const r = await fetchReferenceRates();
    if (!r?.rates) throw new UserError('Couldn’t get exchange rates. Check your connection and try again.');
    this.data.fx = { at: Date.now(), date: r.date || '', rates: { ...DEFAULT_INR_RATES, ...inrTableFromReference(r) } };
    this.persist();
    this.notify();
  }

  // ---- sample data and the one-phone demo ---------------------------------------------------------------------------
  async loadSample() {
    const pr = this.data.profile;
    const s = await buildSample({ me: { ...this.author(), pub: this.data.device.pub, name: pr.name, phone: pr.phone, vpa: pr.vpa } });
    await this.run(async () => {
      this.data.events.push(...s.events);
      Object.assign(this.data.keys, s.keys);
      this.data.demo = { users: s.demo, groups: Object.values(s.groups), n: 0 };
      for (const gid of Object.values(s.groups)) this.data.sync[gid] = { lastShared: { at: Date.now(), hlc: maxHlc(groupEvents(s.events, gid)), invite: false } };
      for (const e of s.events) observe(this.clock, e.hlc);
      this.recompute();
      this.persist();
      this.notify();
    });
    await this.materializeRecurring();
    return s.groups;
  }

  isSampleGroup(gid) {
    return !!this.data.demo?.groups.includes(gid);
  }

  /** Pretend a sample friend's phone sent us an update file, and import it through the real path. */
  async simulateFriendUpdate(gid) {
    const demo = this.data.demo;
    const g = this.state.groups[gid];
    if (!demo || !g) return null;
    const uid = g.members.find((u) => demo.users[u]);
    if (!uid) return null;
    const d = demo.users[uid];
    const clock = createClock(d.dev);
    observe(clock, maxHlc(this.data.events));
    const ideas = [
      ['Parasailing', 'fun', 3600],
      ['Breakfast at the café', 'food', 1240],
      ['Fuel for the scooters', 'transport', 900],
      ['Souvenirs', 'shopping', 1500],
      ['Water and snacks', 'groceries', 460],
    ];
    const pick = ideas[demo.n++ % ideas.length];
    const include = Object.fromEntries(g.members.map((u) => [u, true]));
    const r = buildExpense({ id: newId('x'), desc: pick[0], cat: pick[1], date: todayISO(), cur: g.cur, amount: String(pick[2]), pay: { mode: 'single', payer: uid }, type: 'equal', include }, g.members, g.cur);
    const ev = await createEvent({ t: 'expense_added', p: r.expense, g: gid, author: { uid, dev: d.dev, priv: d.priv }, clock });
    const text = await buildBundle({ gid, name: g.name, events: [...groupEvents(this.data.events, gid), ev], key: this.data.keys[gid], invite: false, from: { uid, name: d.name } });
    return this.importBundle(text);
  }

  /** The sample friend confirms a payment you marked as sent to them. */
  async simulateConfirm(sid) {
    const s = this.state.settlements[sid];
    const d = this.data.demo?.users[s?.to];
    if (!s || !d) return null;
    const clock = createClock(d.dev);
    observe(clock, maxHlc(this.data.events));
    const ev = await createEvent({ t: 'settlement_confirmed', p: { id: sid }, g: s.gid, author: { uid: s.to, dev: d.dev, priv: d.priv }, clock });
    const g = this.state.groups[s.gid];
    const text = await buildBundle({ gid: s.gid, name: g.name, events: [...groupEvents(this.data.events, s.gid), ev], key: this.data.keys[s.gid], invite: false, from: { uid: s.to, name: d.name } });
    return this.importBundle(text);
  }

  isSampleUser(uid) {
    return !!this.data.demo?.users[uid];
  }

  async removeSample() {
    for (const gid of [...(this.data.demo?.groups || [])]) await this.forgetGroup(gid);
    this.data.demo = null;
    this.persist();
    this.notify();
  }

  attachment(id) {
    return loadAttachment(id);
  }

  async saveReceipt(dataUrl) {
    const id = newId('a', 8);
    await saveAttachment(id, dataUrl);
    return id;
  }
}

export const store = new Store();
