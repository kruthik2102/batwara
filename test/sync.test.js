import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSample, sampleAuthors } from '../src/core/seed.js';
import { generateDeviceKey } from '../src/core/crypto.js';
import { uidFromPhone } from '../src/core/phone.js';
import { reduce } from '../src/core/reduce.js';
import { groupNets } from '../src/core/balances.js';
import { createEvent } from '../src/core/events.js';
import { createClock } from '../src/core/hlc.js';
import { buildBundle, readBundle, openBundle, verifyIncoming, mergeEvents, groupEvents, BundleError } from '../src/core/sync.js';
import { buildExpense } from '../src/core/split.js';
import { groupCsv } from '../src/core/csv.js';

async function setup() {
  const k = await generateDeviceKey();
  const me = { uid: await uidFromPhone('+919876543210'), dev: 'dme12345', priv: k.priv, pub: k.pub, name: 'Krutik', phone: '+919876543210', vpa: '' };
  const authors = await sampleAuthors();
  const s = await buildSample({ me, authors, now: Date.parse('2026-10-14T10:00:00+05:30') });
  return { me, authors, s };
}

test('update file round-trips and merges idempotently', async () => {
  const { me, s } = await setup();
  const gid = s.groups.goa;
  const key = s.keys[gid];
  const evs = groupEvents(s.events, gid);
  const text = await buildBundle({ gid, name: 'Goa trip', events: evs, attachments: {}, key, invite: false, from: me });
  const b = readBundle(text);
  assert.equal(b.kind, 'update');
  assert.equal(b.key, undefined);
  const { events } = await openBundle(b, key);
  const v = await verifyIncoming(events, {}, gid);
  assert.equal(v.rejected.length, 0, JSON.stringify(v.rejected.slice(0, 3)));
  assert.equal(v.valid.length, evs.length);
  const m1 = mergeEvents([], v.valid);
  const m2 = mergeEvents(m1.events, v.valid);
  assert.equal(m2.added.length, 0);
  assert.deepEqual(groupNets(reduce(m1.events), gid), groupNets(reduce(s.events), gid));
});

test('wrong key and tampered events are refused', async () => {
  const { me, s } = await setup();
  const gid = s.groups.goa;
  const text = await buildBundle({ gid, name: 'Goa trip', events: groupEvents(s.events, gid), key: s.keys[gid], invite: true, from: me });
  const b = readBundle(text);
  assert.equal(b.kind, 'invite');
  await assert.rejects(openBundle(b, s.keys[s.groups.flat]), BundleError);
  const { events } = await openBundle(b, b.key);
  const target = events.find((e) => e.t === 'expense_added');
  const tampered = events.map((e) => (e === target ? { ...e, p: { ...e.p, desc: 'Changed in transit' } } : e));
  const v = await verifyIncoming(tampered, {}, gid);
  assert.equal(v.rejected.length, 1);
  assert.equal(v.rejected[0].reason, 'bad signature');
  assert.throws(() => readBundle('{"hello":1}'), BundleError);
  assert.throws(() => readBundle('not json'), BundleError);
});

test('two phones editing offline converge after exchanging files', async () => {
  const { me, authors, s } = await setup();
  const gid = s.groups.goa;
  const base = groupEvents(s.events, gid);
  const aarav = authors.aarav;
  const st0 = reduce(base);
  const members = st0.groups[gid].members;
  // phone A (me) adds an expense; phone B (Aarav) deletes the villa and adds another — independently
  const mine = await createEvent({ t: 'expense_added', g: gid, author: me, clock: createClock(me.dev), now: Date.parse('2026-10-14T12:00:00Z'),
    p: buildExpense({ id: 'xA', desc: 'Parasailing', date: '2026-10-14', cur: 'INR', amount: '3600', pay: { mode: 'single', payer: me.uid }, type: 'equal', include: Object.fromEntries(members.map((u) => [u, true])) }, members, 'INR').expense });
  const villa = Object.values(st0.expenses).find((x) => x.desc === 'Villa booking');
  const theirs = [
    await createEvent({ t: 'expense_deleted', g: gid, author: aarav, clock: createClock(aarav.dev), now: Date.parse('2026-10-14T12:05:00Z'), p: { id: villa.id } }),
  ];
  const phoneA = mergeEvents(base, [mine]).events;
  const phoneB = mergeEvents(base, theirs).events;
  // exchange
  const vA = await verifyIncoming(phoneB, reduce(phoneA).devices, gid);
  const vB = await verifyIncoming(phoneA, reduce(phoneB).devices, gid);
  const finalA = mergeEvents(phoneA, vA.valid).events;
  const finalB = mergeEvents(phoneB, vB.valid).events;
  assert.deepEqual(finalA.map((e) => e.id), finalB.map((e) => e.id));
  assert.deepEqual(groupNets(reduce(finalA), gid), groupNets(reduce(finalB), gid));
  assert.equal(reduce(finalA).expenses[villa.id].deleted, true);
  assert.ok(reduce(finalA).expenses.xA);
});

test('csv export has a header, rows and a balance line', async () => {
  const { s } = await setup();
  const st = reduce(s.events);
  const csv = groupCsv(st, s.groups.goa);
  assert.ok(csv.charCodeAt(0) === 0xfeff && csv.slice(1).startsWith('Date,Description'));
  const lines = csv.trim().split(/\r\n/);
  assert.ok(lines.some((l) => l.includes('Villa booking')));
  assert.ok(lines[lines.length - 1].includes('Balance'));
});
