// Sample groups for trying the app on one phone. The sample people get real device keys, so their
// events are signed and verified exactly like a friend's would be.

import { createEvent } from './events.js';
import { generateDeviceKey, newGroupKey, newId } from './crypto.js';
import { createClock } from './hlc.js';
import { uidFromPhone } from './phone.js';
import { buildExpense } from './split.js';
import { todayISO, addDays } from './recurring.js';

export const SAMPLE_PEOPLE = [
  { key: 'aarav', name: 'Aarav Mehta', phone: '+919000000001', vpa: 'aarav.mehta@okaxis' },
  { key: 'meera', name: 'Meera Iyer', phone: '+919000000002', vpa: 'meera.iyer@oksbi' },
  { key: 'rohan', name: 'Rohan Das', phone: '+919000000003', vpa: '' },
];

export async function sampleAuthors() {
  const out = {};
  for (const p of SAMPLE_PEOPLE) {
    const k = await generateDeviceKey();
    out[p.key] = { uid: await uidFromPhone(p.phone), dev: newId('d', 6), priv: k.priv, pub: k.pub, name: p.name, phone: p.phone, vpa: p.vpa };
  }
  return out;
}

/** me: { uid, dev, priv, pub, name, phone, vpa } */
export async function buildSample({ me, now = Date.now(), authors }) {
  const DAY = 86400000;
  const A = { me, ...(authors || (await sampleAuthors())) };
  const clocks = {};
  const events = [];
  let seq = 0;
  const today = todayISO(new Date(now));
  const ago = (d) => addDays(today, -d);

  async function emit(who, g, t, p, daysAgo, id) {
    const a = A[who];
    const clock = (clocks[a.dev] ||= createClock(a.dev));
    const ev = await createEvent({ t, p, g, author: a, clock, id, now: now - daysAgo * DAY + seq++ * 1000 });
    events.push(ev);
    return ev;
  }
  async function join(who, g, daysAgo) {
    const a = A[who];
    await emit(who, g, 'device_key', { uid: a.uid, x: a.pub.x, y: a.pub.y }, daysAgo);
    await emit(who, g, 'profile', { name: a.name, vpa: a.vpa || '', phone: a.phone }, daysAgo);
  }
  function expense(members, d) {
    const include = {};
    for (const u of members) include[u] = d.only ? d.only.includes(u) : true;
    const r = buildExpense({ id: newId('x'), cat: 'general', type: 'equal', include, values: {}, ...d, pay: { mode: 'single', payer: d.payer } }, members, 'INR');
    if (!r.ok) throw new Error('sample expense: ' + r.error);
    return r.expense;
  }

  // ---- Goa trip --------------------------------------------------------------
  const goa = newId('g');
  const goaKey = newGroupKey();
  const trip = [A.me.uid, A.aarav.uid, A.meera.uid, A.rohan.uid];
  await emit('me', goa, 'group_created', { name: 'Goa trip', kind: 'trip', cur: 'INR', simplify: true }, 8);
  await join('me', goa, 8);
  for (const k of ['aarav', 'meera', 'rohan']) await emit('me', goa, 'member_added', { uid: A[k].uid, name: A[k].name, phone: A[k].phone }, 8);
  for (const k of ['aarav', 'meera', 'rohan']) await join(k, goa, 7.5);

  const villa = expense(trip, { desc: 'Villa booking', cat: 'stay', date: ago(7), amount: '18000', payer: A.aarav.uid });
  await emit('aarav', goa, 'expense_added', villa, 7);
  await emit('meera', goa, 'comment_added', { x: villa.id, text: 'Booked the one with the pool. Check-in is at 2 pm.' }, 6.9);
  await emit('me', goa, 'expense_added', expense(trip, { desc: 'Scooter rental', cat: 'transport', date: ago(6), amount: '2400', payer: A.me.uid }), 6);
  await emit('meera', goa, 'expense_added', expense(trip, { desc: 'Beach shack dinner', cat: 'food', date: ago(5), amount: '3260', payer: A.meera.uid }), 5);
  await emit('rohan', goa, 'expense_added', expense(trip, { desc: 'Airport cab on the layover', cat: 'transport', date: ago(5), amount: '24', cur: 'USD', fx: '88.7', payer: A.rohan.uid, only: [A.me.uid, A.meera.uid, A.rohan.uid] }), 4.8);
  await emit('me', goa, 'expense_added', expense(trip, {
    desc: 'Groceries for the villa', cat: 'groceries', date: ago(4), amount: '1845', payer: A.me.uid, type: 'shares',
    values: { [A.me.uid]: '1', [A.aarav.uid]: '2', [A.meera.uid]: '1', [A.rohan.uid]: '1' },
  }), 4);
  await emit('rohan', goa, 'expense_added', expense(trip, {
    desc: 'Sunset cruise', cat: 'fun', date: ago(3), amount: '5000', payer: A.rohan.uid, type: 'adjust',
    values: { [A.me.uid]: '0', [A.aarav.uid]: '0', [A.meera.uid]: '500', [A.rohan.uid]: '0' },
  }), 3);
  await emit('meera', goa, 'settlement_proposed', { id: newId('s'), from: A.meera.uid, to: A.aarav.uid, amt: 100000, method: 'upi', vpa: A.aarav.vpa, app: 'PhonePe', date: ago(2) }, 2.5);
  const pay1 = events[events.length - 1].p.id;
  await emit('aarav', goa, 'settlement_confirmed', { id: pay1 }, 2.4);
  await emit('aarav', goa, 'expense_added', expense(trip, {
    desc: 'Dinner at Thalassa', cat: 'food', date: ago(1), payer: A.aarav.uid, type: 'items',
    items: [
      { name: 'Prawn curry', price: '780', who: [A.me.uid, A.meera.uid] },
      { name: 'Fish thali', price: '450', who: [A.aarav.uid] },
      { name: 'Veg platter', price: '620', who: [A.rohan.uid, A.me.uid] },
      { name: 'Mocktails', price: '540', who: trip },
    ],
    extra: '239',
  }), 1);

  // ---- Flat 4B ---------------------------------------------------------------
  const flat = newId('g');
  const flatKey = newGroupKey();
  const home = [A.me.uid, A.meera.uid];
  await emit('me', flat, 'group_created', { name: 'Flat 4B', kind: 'home', cur: 'INR', simplify: true }, 40);
  await join('me', flat, 40);
  await emit('me', flat, 'member_added', { uid: A.meera.uid, name: A.meera.name, phone: A.meera.phone }, 40);
  await join('meera', flat, 39);
  const rent = expense(home, { desc: 'Rent', cat: 'rent', date: ago(0), amount: '30000', payer: A.me.uid });
  delete rent.id;
  delete rent.date;
  const start = today.slice(0, 8) + '01';
  await emit('me', flat, 'recurring_set', { id: newId('r'), freq: 'monthly', start: addDays(start, 0) > today ? today : start, template: rent }, 39);
  await emit('me', flat, 'expense_added', expense(home, { desc: 'Electricity bill', cat: 'utilities', date: ago(6), amount: '1420', payer: A.me.uid }), 6);
  await emit('meera', flat, 'expense_added', expense(home, { desc: 'WiFi', cat: 'utilities', date: ago(5), amount: '800', payer: A.meera.uid }), 5);
  await emit('meera', flat, 'settlement_proposed', { id: newId('s'), from: A.meera.uid, to: A.me.uid, amt: 31000, method: 'upi', vpa: me.vpa || '', app: 'Google Pay', date: ago(0) }, 0.2);

  const demo = {};
  for (const k of ['aarav', 'meera', 'rohan']) demo[A[k].uid] = { dev: A[k].dev, priv: A[k].priv, pub: A[k].pub, name: A[k].name, phone: A[k].phone, vpa: A[k].vpa };
  return { events, keys: { [goa]: goaKey, [flat]: flatKey }, demo, groups: { goa, flat } };
}
