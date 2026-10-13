// Money is always an integer number of minor units (paise, cents).
// Every currency listed here has two decimal places.

export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian rupee', locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', name: 'US dollar', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'en-IE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British pound', locale: 'en-GB' },
  AED: { code: 'AED', symbol: 'AED ', name: 'UAE dirham', locale: 'en-US' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', locale: 'en-US' },
  THB: { code: 'THB', symbol: '฿', name: 'Thai baht', locale: 'en-US' },
  MYR: { code: 'MYR', symbol: 'RM ', name: 'Malaysian ringgit', locale: 'en-US' },
  LKR: { code: 'LKR', symbol: 'Rs ', name: 'Sri Lankan rupee', locale: 'en-US' },
  NPR: { code: 'NPR', symbol: 'Rs ', name: 'Nepalese rupee', locale: 'en-US' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian dollar', locale: 'en-US' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', locale: 'en-US' },
  CHF: { code: 'CHF', symbol: 'CHF ', name: 'Swiss franc', locale: 'en-US' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);
export const MAX_MINOR = 100_000_000_000; // 1,00,00,00,000.00 — a sanity cap

const nfCache = new Map();
function nf(locale, minFrac) {
  const key = locale + minFrac;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: minFrac, maximumFractionDigits: 2 });
    nfCache.set(key, f);
  }
  return f;
}

export function currencySymbol(cur) {
  return (CURRENCIES[cur] || { symbol: cur + ' ' }).symbol;
}

/** formatMoney(123450, 'INR') → "₹1,234.50"; whole amounts drop ".00" unless opts.fixed */
export function formatMoney(minor, cur = 'INR', opts = {}) {
  const c = CURRENCIES[cur] || { symbol: cur + ' ', locale: 'en-US' };
  const n = Number(minor) || 0;
  const a = Math.abs(n);
  const whole = a % 100 === 0;
  const body = nf(c.locale, whole && !opts.fixed ? 0 : 2).format(a / 100);
  const sign = n < 0 ? '−' : opts.plus && n > 0 ? '+' : '';
  return sign + c.symbol + body;
}

/** Parse what a person typed into an integer number of minor units. Returns null when it is not a number. */
export function parseAmount(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/[\s,_]/g, '').replace(/[^\d.\-]/g, '');
  if (!s || s === '.' || s === '-' || s === '-.') return null;
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.includes('-')) return null;
  const parts = s.split('.');
  if (parts.length > 2) return null;
  const [ip, fp = ''] = parts;
  if (!/^\d*$/.test(ip) || !/^\d*$/.test(fp)) return null;
  if (ip.replace(/^0+/, '').length > 11) return null;
  let minor = Number(ip || '0') * 100 + Number((fp + '00').slice(0, 2));
  if (fp.length > 2 && Number(fp[2]) >= 5) minor += 1;
  return neg ? -minor : minor;
}

/** Minor units → plain editable string ("1234.5" style, no grouping). */
export function toInput(minor) {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return '';
  const neg = minor < 0;
  const a = Math.abs(minor);
  const ip = Math.floor(a / 100);
  const fp = a % 100;
  const s = fp === 0 ? String(ip) : `${ip}.${String(fp).padStart(2, '0')}`;
  return (neg ? '-' : '') + s;
}

/**
 * Split an integer total by non-negative integer weights.
 * Each part gets floor(total·w/Σw); leftover units go to the largest remainders,
 * ties broken by `rank` (lower rank first). Parts always add up to `total` exactly.
 */
export function allocate(total, weights, rank) {
  const n = weights.length;
  if (!n) return [];
  const sw = weights.reduce((a, b) => a + b, 0);
  if (!(sw > 0)) return weights.map(() => 0);
  const T = BigInt(total);
  const S = BigInt(sw);
  const base = new Array(n);
  const rem = new Array(n);
  for (let i = 0; i < n; i++) {
    const w = BigInt(weights[i]);
    base[i] = Number((T * w) / S);
    rem[i] = Number((T * w) % S);
  }
  let left = total - base.reduce((a, b) => a + b, 0);
  const r = rank || weights.map((_, i) => i);
  const order = weights.map((_, i) => i).sort((i, j) => rem[j] - rem[i] || r[i] - r[j] || i - j);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) base[order[k]] += 1;
  return base;
}

/** Convert an amount with a decimal rate (target units per source unit). */
export function convert(minor, rate) {
  return Math.round(minor * rate);
}

export function sumValues(obj) {
  let s = 0;
  for (const k in obj) s += obj[k];
  return s;
}
