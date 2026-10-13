import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvent, verifyEvent } from '../src/core/events.js';
import { generateDeviceKey, newGroupKey } from '../src/core/crypto.js';
import { createClock, observe, tick, decodeHlc } from '../src/core/hlc.js';
import { reduce } from '../src/core/reduce.js';
import { groupNets, simplifyDebts, pairwiseDebts, friendBalances, myTotals } from '../src/core/balances.js';
import { buildExpense } from '../src/core/split.js';
import { uidFromPhone } from '../src/core/phone.js';
import { buildSample } from '../src/core/seed.js';
import { dueOccurrences, occurrencesUntil, monthlyAt } from '../src/core/recurring.js';

async function person(phone, name) {
  const k = await generateDeviceKey();
  const uid = await uidFromPhone(phone);
  return { uid, dev: 'd' + uid.slice(1, 9), priv: k.priv, pub: k.pub, name, phone, clock: null };
}

test('hlc orders local and remote events', () => {
  const a = createClock('da');
  const t1 = tick(a, 1000);
  const t2 = tick(a, 1000);
  assert.ok(t1 < t2);
  const b = createClock('db');
  observe(b, t2, 500);
  const t3 = tick(b, 500);
  assert.ok(t3 > t2, `${t3} should sort after ${t2}`);
  assert.equal(decodeHlc(t3).ms, 1000);
});

test('signed events verify and tampering is caught', async () => {
  const me = await person('+919876543210', 'Me');
  const ev = await createEvent({ t: 'profile', p: { name: 'Me' }, g: 'g1', author: me, clock: createClock(me.dev) });
  assert.ok(await verifyEvent(me.pub, ev));
  const forged = { ...ev, p: { name: 'Someone else' } };
  assert.equal(await verifyEvent(me.pub, forged), false);
});

test('reduce: edits win by time, deletes restore, only the receiver confirms', async () => {
  const me = await person('+919876543210', 'Me');
  const you = await person('+919812345678', 'You');
  const cm = createClock(me.dev);
  const cy = createClock(you.dev);
  const g = 'gtest';
  const evs = [];
  const add = async (a, c, t, p, now) => { const e = await createEvent({ t, p, g, author: a, clock: c, now }); evs.push(e); return e; };
  await add(me, cm, 'group_created', { name: 'Test', kind: 'trip', cur: 'INR' }, 1000);
  await add(me, cm, 'member_added', { uid: you.uid, name: 'You', phone: you.phone }, 1001);
  const members = [me.uid, you.uid];
  const x = buildExpense({ id: 'x1', desc: 'Lunch', date: '2026-10-01', cur: 'INR', amount: '500', pay: { mode: 'single', payer: me.uid }, type: 'equal', include: { [me.uid]: true, [you.uid]: true } }, members, 'INR').expense;
  await add(me, cm, 'expense_added', x, 1002);
  const edit = buildExpense({ id: 'x1', desc: 'Lunch (edited)', date: '2026-10-01', cur: 'INR', amount: '800', pay: { mode: 'single', payer: me.uid }, type: 'equal', include: { [me.uid]: true, [you.uid]: true } }, members, 'INR').expense;
  await add(you, cy, 'expense_edited', edit, 1003);
  let st = reduce(evs);
  assert.equal(st.expenses.x1.desc, 'Lunch (edited)');
  assert.equal(groupNets(st, g)[you.uid], -40000);

  await add(me, cm, 'expense_deleted', { id: 'x1' }, 1004);
  st = reduce(evs);
  assert.equal(groupNets(st, g)[you.uid], 0);
  await add(you, cy, 'expense_restored', { id: 'x1' }, 1005);
  st = reduce(evs);
  assert.equal(st.expenses.x1.deleted, false);

  // you pay me; I'm the receiver, so only I can confirm
  await add(you, cy, 'settlement_proposed', { id: 's1', from: you.uid, to: me.uid, amt: 40000, method: 'upi' }, 1006);
  await add(you, cy, 'settlement_confirmed', { id: 's1' }, 1007);
  st = reduce(evs);
  assert.equal(st.settlements.s1.status, 'pending');
  assert.ok(st.rejected.some((r) => r.reason === 'only the receiver can confirm'));
  await add(me, cm, 'settlement_confirmed', { id: 's1' }, 1008);
  st = reduce(evs);
  assert.equal(st.settlements.s1.status, 'confirmed');
  assert.equal(groupNets(st, g)[you.uid], 0);

  // order of the log on disk never matters
  const shuffled = evs.slice().reverse();
  assert.deepEqual(groupNets(reduce(shuffled), g), groupNets(st, g));
});

test('events from people outside the group are ignored', async () => {
  const me = await person('+919876543210', 'Me');
  const stranger = await person('+919811111111', 'Stranger');
  const g = 'gx';
  const evs = [await createEvent({ t: 'group_created', p: { name: 'G' }, g, author: me, clock: createClock(me.dev) })];
  evs.push(await createEvent({ t: 'group_updated', p: { name: 'Hacked' }, g, author: stranger, clock: createClock(stranger.dev) }));
  const st = reduce(evs);
  assert.equal(st.groups[g].name, 'G');
});

test('sample data: balances add up, simplify settles everyone, recurring rent is due', async () => {
  const me = await person('+919876543210', 'Krutik');
  me.vpa = 'krutik@okhdfc';
  const s = await buildSample({ me, now: Date.parse('2026-10-14T10:00:00+05:30') });
  const st = reduce(s.events);
  assert.equal(st.rejected.length, 0, JSON.stringify(st.rejected));
  for (const ev of s.events) {
    const d = st.devices[ev.dev];
    assert.ok(d, 'device known for ' + ev.t);
    assert.ok(await verifyEvent(d, ev), 'signature ok for ' + ev.t);
  }
  for (const gid of Object.values(s.groups)) {
    const nets = groupNets(st, gid);
    assert.equal(Object.values(nets).reduce((a, b) => a + b, 0), 0);
    for (const plan of [simplifyDebts(nets), pairwiseDebts(st, gid)]) {
      const after = { ...nets };
      for (const t of plan) { after[t.from] += t.amt; after[t.to] -= t.amt; }
      assert.ok(Object.values(after).every((v) => v === 0));
    }
    assert.ok(simplifyDebts(nets).length <= pairwiseDebts(st, gid).length);
  }
  const goaNets = groupNets(st, s.groups.goa);
  const flatNets = groupNets(st, s.groups.flat);
  assert.equal(flatNets[me.uid], 31000, 'pending payment is not counted yet');
  const due = dueOccurrences(st, '2026-10-14');
  assert.equal(due.length, 1);
  assert.equal(due[0].date, '2026-10-01');
  const fb = friendBalances(st, me.uid);
  const totals = myTotals(st, me.uid);
  assert.ok(Object.keys(fb).length === 3);
  assert.equal((totals.owed.INR || 0) - (totals.owe.INR || 0), goaNets[me.uid] + flatNets[me.uid]);
});

test('recurring dates', () => {
  assert.equal(monthlyAt('2026-01-31', 1), '2026-02-28');
  assert.equal(monthlyAt('2026-01-31', 2), '2026-03-31');
  assert.equal(monthlyAt('2026-11-15', 2), '2027-01-15');
  assert.deepEqual(occurrencesUntil({ freq: 'weekly', start: '2026-10-01' }, '2026-10-15'), ['2026-10-01', '2026-10-08', '2026-10-15']);
});
