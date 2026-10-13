import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatMoney, allocate, toInput } from '../src/core/money.js';

test('parseAmount reads what people type', () => {
  assert.equal(parseAmount('1,234.5'), 123450);
  assert.equal(parseAmount('₹ 2,400'), 240000);
  assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount('0.005'), 1);
  assert.equal(parseAmount('12.'), 1200);
  assert.equal(parseAmount('.5'), 50);
  assert.equal(parseAmount('-20'), -2000);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1.2.3'), null);
  assert.equal(parseAmount('123456789012'), null);
});

test('formatMoney uses Indian grouping for rupees', () => {
  assert.equal(formatMoney(123456789), '₹12,34,567.89');
  assert.equal(formatMoney(240000), '₹2,400');
  assert.equal(formatMoney(-50), '−₹0.50');
  assert.equal(formatMoney(2400, 'USD'), '$24');
  assert.equal(formatMoney(240000, 'INR', { fixed: true }), '₹2,400.00');
});

test('toInput round-trips', () => {
  for (const v of [0, 5, 50, 1999, 240000, 123450]) assert.equal(parseAmount(toInput(v)), v);
  assert.equal(toInput(123450), '1234.50');
});

test('allocate always adds up and favours rank on ties', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1], [0, 1, 2]), [334, 333, 333]);
  assert.deepEqual(allocate(1000, [1, 1, 1], [1, -1, 2]), [333, 334, 333]);
  assert.deepEqual(allocate(0, [1, 2], [0, 1]), [0, 0]);
  assert.deepEqual(allocate(5, [0, 1], [0, 1]), [0, 5]);
  for (let i = 0; i < 300; i++) {
    const total = Math.floor(Math.random() * 1e9);
    const w = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => Math.floor(Math.random() * 10000));
    if (!w.some((x) => x > 0)) continue;
    const parts = allocate(total, w);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    w.forEach((x, k) => { if (x === 0) assert.equal(parts[k], 0); });
  }
});
