import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpense, computeOwed, draftFromExpense, itemsTotal } from '../src/core/split.js';
import { formatMoney } from '../src/core/money.js';

const M = ['ua00000001', 'ub00000002', 'uc00000003'];
const fmt = (m) => formatMoney(m);
const all = { [M[0]]: true, [M[1]]: true, [M[2]]: true };
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const base = (over) => ({ id: 'x1', desc: 'Dinner', date: '2026-10-10', cur: 'INR', amount: '100', pay: { mode: 'single', payer: M[1] }, type: 'equal', include: all, values: {}, ...over });

test('equal split gives the odd paisa to the payer', () => {
  const r = buildExpense(base(), M, 'INR');
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.expense.owed, { [M[0]]: 3333, [M[1]]: 3334, [M[2]]: 3333 });
  assert.deepEqual(r.expense.paid, { [M[1]]: 10000 });
});

test('exact split must match the total', () => {
  let r = buildExpense(base({ type: 'exact', values: { [M[0]]: '60', [M[1]]: '30', [M[2]]: '0' } }), M, 'INR');
  assert.equal(r.ok, false);
  assert.match(r.error, /₹10 left to assign/);
  r = buildExpense(base({ type: 'exact', values: { [M[0]]: '60', [M[1]]: '40', [M[2]]: '' } }), M, 'INR');
  assert.ok(r.ok);
  assert.deepEqual(r.expense.owed, { [M[0]]: 6000, [M[1]]: 4000 });
});

test('percent split needs 100%', () => {
  let r = buildExpense(base({ amount: '99.99', type: 'percent', values: { [M[0]]: '33.33', [M[1]]: '33.33', [M[2]]: '33.34' } }), M, 'INR');
  assert.ok(r.ok, r.error);
  assert.equal(sum(r.expense.owed), 9999);
  r = buildExpense(base({ type: 'percent', values: { [M[0]]: '50', [M[1]]: '40' } }), M, 'INR');
  assert.match(r.error, /add up to 90%/);
});

test('shares and adjustments', () => {
  let r = buildExpense(base({ type: 'shares', values: { [M[0]]: '2', [M[1]]: '1', [M[2]]: '0' } }), M, 'INR');
  assert.deepEqual(r.expense.owed, { [M[0]]: 6667, [M[1]]: 3333 });
  r = buildExpense(base({ type: 'adjust', values: { [M[0]]: '0', [M[1]]: '10', [M[2]]: '0' } }), M, 'INR');
  assert.deepEqual(r.expense.owed, { [M[0]]: 3000, [M[1]]: 4000, [M[2]]: 3000 });
  r = buildExpense(base({ type: 'adjust', values: { [M[0]]: '200' } }), M, 'INR');
  assert.equal(r.ok, false);
});

test('itemised split spreads tax by item subtotal', () => {
  const d = base({
    type: 'items',
    items: [
      { name: 'Pizza', price: '600', who: [M[0], M[1]] },
      { name: 'Salad', price: '300', who: [M[2]] },
    ],
    extra: '90',
  });
  assert.equal(itemsTotal(d), 99000);
  const r = buildExpense(d, M, 'INR');
  assert.ok(r.ok, r.error);
  assert.equal(r.expense.amt, 99000);
  assert.deepEqual(r.expense.owed, { [M[0]]: 33000, [M[1]]: 33000, [M[2]]: 33000 });
  const missing = buildExpense(base({ type: 'items', items: [{ name: 'Pizza', price: '600', who: [] }] }), M, 'INR');
  assert.match(missing.error, /Choose who had “Pizza”/);
});

test('several payers must cover the total', () => {
  let r = buildExpense(base({ pay: { mode: 'multi', values: { [M[0]]: '70', [M[2]]: '20' } } }), M, 'INR');
  assert.match(r.error, /₹10 of the total still needs a payer/);
  r = buildExpense(base({ pay: { mode: 'multi', values: { [M[0]]: '70', [M[2]]: '30' } } }), M, 'INR');
  assert.ok(r.ok);
  assert.deepEqual(r.expense.paid, { [M[0]]: 7000, [M[2]]: 3000 });
  assert.equal(r.expense.multi, true);
});

test('foreign currency converts and still adds up exactly', () => {
  const r = buildExpense(base({ cur: 'USD', fx: '88.7', amount: '24' }), M, 'INR');
  assert.ok(r.ok, r.error);
  assert.equal(r.expense.base, 212880);
  assert.equal(sum(r.expense.owed), 212880);
  assert.equal(sum(r.expense.paid), 212880);
  assert.deepEqual(r.expense.owedX, { [M[0]]: 800, [M[1]]: 800, [M[2]]: 800 });
  const odd = buildExpense(base({ cur: 'EUR', fx: '103.217', amount: '10.01' }), M, 'INR');
  assert.equal(sum(odd.expense.owed), odd.expense.base);
});

test('draft round-trip keeps the split', () => {
  const r = buildExpense(base({ type: 'shares', values: { [M[0]]: '2', [M[1]]: '1', [M[2]]: '1' } }), M, 'INR');
  const d = draftFromExpense(r.expense, M);
  const again = buildExpense(d, M, 'INR');
  assert.deepEqual(again.expense.owed, r.expense.owed);
});

test('validation messages', () => {
  assert.match(buildExpense(base({ desc: '  ' }), M, 'INR').error, /description/);
  assert.match(buildExpense(base({ amount: '0' }), M, 'INR').error, /more than zero/);
  assert.match(buildExpense(base({ include: {} }), M, 'INR').error, /at least one person/);
  assert.equal(computeOwed(100, { type: 'equal', include: {} }, M, M[0], fmt).ok, false);
});
