import { CURRENCIES } from './money.js';

// Rupees per unit. Approximate fallbacks that ship with the app; the editor always lets you change the rate,
// and "Update rates" replaces these with published reference rates when the phone is online.
export const DEFAULT_INR_RATES = {
  INR: 1,
  USD: 88.7,
  EUR: 103.2,
  GBP: 118.5,
  AED: 24.15,
  SGD: 68.4,
  THB: 2.72,
  MYR: 21.0,
  LKR: 0.293,
  NPR: 0.625,
  AUD: 58.0,
  CAD: 63.5,
  CHF: 110.5,
};

/** Units of `to` per unit of `from`. */
export function rateBetween(table, from, to) {
  if (from === to) return 1;
  const a = table?.[from] ?? DEFAULT_INR_RATES[from];
  const b = table?.[to] ?? DEFAULT_INR_RATES[to];
  if (!a || !b) return null;
  return Math.round((a / b) * 1_000_000) / 1_000_000;
}

/** Turn a reference-rate response ({ base: 'INR', rates: {USD: 0.0113} }) into rupees per unit. */
export function inrTableFromReference(resp) {
  const out = { INR: 1 };
  for (const code of Object.keys(CURRENCIES)) {
    const r = resp?.rates?.[code];
    if (r > 0) out[code] = Math.round((1 / r) * 10000) / 10000;
  }
  return out;
}
