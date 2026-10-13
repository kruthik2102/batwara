import { allocate, parseAmount, formatMoney, convert, toInput, MAX_MINOR } from './money.js';

export const SPLIT_TYPES = [
  { id: 'equal', label: 'Equal' },
  { id: 'exact', label: 'Exact' },
  { id: 'percent', label: '%' },
  { id: 'shares', label: 'Shares' },
  { id: 'adjust', label: 'Adjust' },
  { id: 'items', label: 'Items' },
];

export const SPLIT_NAMES = {
  equal: 'Split equally',
  exact: 'Exact amounts',
  percent: 'By percentage',
  shares: 'By shares',
  adjust: 'Equal with adjustments',
  items: 'Itemised',
};

/** Percent and share inputs accept up to two decimals; they become integer weights ×100. */
export function parseWeight(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return 0;
  if (!/^\d*\.?\d*$/.test(s)) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

function fail(error, field) {
  return { ok: false, error, field };
}

/** Rank used to hand out leftover paise: the payer first, then group order. */
function rankFor(ids, payerId) {
  return ids.map((id, i) => (id === payerId ? -1 : i));
}

/**
 * Work out who owes what, in the expense currency.
 * draft: { type, include: {uid: bool}, values: {uid: string}, items: [{name, price, who: [uid]}], extra }
 * members: ordered uids of the group.
 */
export function computeOwed(total, draft, members, payerId, fmt) {
  const type = draft.type || 'equal';
  if (type === 'items') return computeItems(draft, members, payerId, fmt);
  const ids = members.filter((u) => draft.include?.[u]);
  if (!ids.length) return fail('Choose at least one person to split with.', 'split');
  const rank = rankFor(ids, payerId);
  let parts;
  if (type === 'equal') {
    parts = allocate(total, ids.map(() => 1), rank);
  } else if (type === 'exact') {
    parts = ids.map((u) => parseAmount(draft.values?.[u] ?? '') ?? 0);
    if (parts.some((v) => !Number.isFinite(v) || v < 0)) return fail('Amounts can’t be negative.', 'split');
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== total) {
      const d = total - sum;
      return fail(d > 0 ? `${fmt(d)} left to assign` : `${fmt(-d)} more than the total`, 'split');
    }
  } else if (type === 'percent') {
    const w = ids.map((u) => parseWeight(draft.values?.[u]));
    if (w.some((v) => Number.isNaN(v))) return fail('Percentages must be numbers.', 'split');
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum !== 10000) {
      const shown = (sum / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      return fail(`Percentages add up to ${shown}%. They need to add up to 100%.`, 'split');
    }
    parts = allocate(total, w, rank);
  } else if (type === 'shares') {
    const w = ids.map((u) => parseWeight(draft.values?.[u] === undefined ? '1' : draft.values[u]));
    if (w.some((v) => Number.isNaN(v))) return fail('Shares must be numbers.', 'split');
    if (!(w.reduce((a, b) => a + b, 0) > 0)) return fail('Give at least one person a share.', 'split');
    parts = allocate(total, w, rank);
  } else if (type === 'adjust') {
    const adj = ids.map((u) => parseAmount(draft.values?.[u] ?? '') ?? 0);
    const rest = total - adj.reduce((a, b) => a + b, 0);
    if (rest < 0) return fail('The adjustments add up to more than the total.', 'split');
    const even = allocate(rest, ids.map(() => 1), rank);
    parts = even.map((v, i) => v + adj[i]);
    if (parts.some((v) => v < 0)) return fail('An adjustment leaves someone owing less than nothing.', 'split');
  } else {
    return fail('Unknown split type.', 'split');
  }
  const owed = {};
  ids.forEach((u, i) => { if (parts[i] > 0) owed[u] = parts[i]; });
  if (!Object.keys(owed).length) return fail('Nobody owes anything with this split.', 'split');
  return { ok: true, owed };
}

/** Item total in minor units: Σ prices + extra (tax, tip, service charge). */
export function itemsTotal(draft) {
  let sum = 0;
  for (const it of draft.items || []) {
    const p = parseAmount(it.price);
    if (p && p > 0) sum += p;
  }
  const extra = parseAmount(draft.extra) || 0;
  return sum + Math.max(0, extra);
}

function computeItems(draft, members, payerId, fmt) {
  const items = (draft.items || []).filter((it) => (it.name || '').trim() || (it.price || '').trim());
  if (!items.length) return fail('Add at least one item.', 'items');
  const sub = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const price = parseAmount(it.price);
    const label = (it.name || '').trim() || `Item ${i + 1}`;
    if (!price || price <= 0) return fail(`Add a price for “${label}”.`, 'items');
    const who = members.filter((u) => (it.who || []).includes(u));
    if (!who.length) return fail(`Choose who had “${label}”.`, 'items');
    const parts = allocate(price, who.map(() => 1), rankFor(who, payerId));
    who.forEach((u, k) => { sub[u] = (sub[u] || 0) + parts[k]; });
  }
  const extra = parseAmount(draft.extra) || 0;
  if (extra < 0) return fail('Tax and tip can’t be negative.', 'items');
  const ids = members.filter((u) => sub[u] > 0);
  const extraParts = allocate(extra, ids.map((u) => sub[u]), rankFor(ids, payerId));
  const owed = {};
  ids.forEach((u, i) => { owed[u] = sub[u] + extraParts[i]; });
  return { ok: true, owed };
}

/** Who paid, in the expense currency. pay: { mode: 'single', payer } | { mode: 'multi', values: {uid: string} } */
export function computePaid(total, pay, members, fmt) {
  if (!pay || pay.mode !== 'multi') {
    if (!pay?.payer || !members.includes(pay.payer)) return fail('Choose who paid.', 'payer');
    return { ok: true, paid: { [pay.payer]: total } };
  }
  const paid = {};
  let sum = 0;
  for (const u of members) {
    const v = parseAmount(pay.values?.[u] ?? '') ?? 0;
    if (v < 0) return fail('Payments can’t be negative.', 'payer');
    if (v > 0) { paid[u] = v; sum += v; }
  }
  if (!sum) return fail('Enter how much each person paid.', 'payer');
  if (sum !== total) {
    const d = total - sum;
    return fail(d > 0 ? `${fmt(d)} of the total still needs a payer` : `Payments are ${fmt(-d)} more than the total`, 'payer');
  }
  return { ok: true, paid };
}

/** Spread `base` (group currency) across keys in proportion to `parts` (expense currency). */
function rebase(parts, base, members, payerId) {
  const ids = members.filter((u) => parts[u] > 0);
  const out = {};
  const alloc = allocate(base, ids.map((u) => parts[u]), rankFor(ids, payerId));
  ids.forEach((u, i) => { if (alloc[i] > 0) out[u] = alloc[i]; });
  return out;
}

/**
 * Build a complete expense payload from what the editor holds.
 * draft: { id, desc, cat, date, cur, fx, amount, pay, type, include, values, items, extra, notes, rc, rid }
 * Returns { ok, error, field, expense }.
 */
export function buildExpense(draft, members, groupCur) {
  const cur = draft.cur || groupCur;
  const fmt = (m) => formatMoney(m, cur);
  const desc = (draft.desc || '').trim();
  if (!desc) return fail('Add a description.', 'desc');
  if (desc.length > 80) return fail('Keep the description under 80 characters.', 'desc');
  const amt = draft.type === 'items' ? itemsTotal(draft) : parseAmount(draft.amount);
  if (amt === null || Number.isNaN(amt)) return fail('Enter an amount.', 'amount');
  if (amt <= 0) return fail('The amount needs to be more than zero.', 'amount');
  if (amt > MAX_MINOR) return fail('That amount is too large.', 'amount');

  const payerId = draft.pay?.mode === 'multi' ? null : draft.pay?.payer;
  const p = computePaid(amt, draft.pay, members, fmt);
  if (!p.ok) return p;
  const o = computeOwed(amt, draft, members, payerId, fmt);
  if (!o.ok) return o;

  let fx = 1;
  let base = amt;
  let paid = p.paid;
  let owed = o.owed;
  if (cur !== groupCur) {
    fx = Number(String(draft.fx ?? '').replace(',', '.'));
    if (!(fx > 0) || fx > 1_000_000) return fail('Enter an exchange rate above zero.', 'fx');
    fx = Math.round(fx * 1_000_000) / 1_000_000;
    base = convert(amt, fx);
    if (base <= 0) return fail('That converts to nothing. Check the exchange rate.', 'fx');
    if (base > MAX_MINOR) return fail('That amount is too large.', 'amount');
    paid = rebase(p.paid, base, members, payerId);
    owed = rebase(o.owed, base, members, payerId);
  }

  const split = { type: draft.type || 'equal' };
  if (split.type === 'items') {
    split.items = (draft.items || [])
      .filter((it) => (it.name || '').trim() || (it.price || '').trim())
      .map((it) => ({ name: (it.name || '').trim(), price: parseAmount(it.price) || 0, who: members.filter((u) => (it.who || []).includes(u)) }));
    split.extra = Math.max(0, parseAmount(draft.extra) || 0);
  } else {
    split.include = members.filter((u) => draft.include?.[u]);
    if (split.type !== 'equal') {
      split.values = {};
      for (const u of split.include) split.values[u] = String(draft.values?.[u] ?? '');
    }
  }

  const expense = {
    id: draft.id,
    desc,
    cat: draft.cat || 'general',
    date: draft.date,
    cur,
    fx,
    amt,
    base,
    paid,
    owed,
    split,
  };
  if (cur !== groupCur) { expense.paidX = p.paid; expense.owedX = o.owed; }
  if (draft.pay?.mode === 'multi') expense.multi = true;
  const notes = (draft.notes || '').trim();
  if (notes) expense.notes = notes.slice(0, 1000);
  if (draft.rc) expense.rc = draft.rc;
  if (draft.rid) expense.rid = draft.rid;
  return { ok: true, expense };
}

/** Rebuild an editor draft from a stored expense, so editing starts where it was left. */
export function draftFromExpense(x, members) {
  const pay = x.multi
    ? { mode: 'multi', payer: Object.keys(x.paid)[0], values: Object.fromEntries(Object.entries(x.paidX || x.paid).map(([k, v]) => [k, toInput(v)])) }
    : { mode: 'single', payer: Object.keys(x.paid)[0], values: {} };
  const type = x.split?.type || 'equal';
  const draft = {
    id: x.id,
    desc: x.desc,
    cat: x.cat,
    date: x.date,
    cur: x.cur,
    fx: String(x.fx ?? 1),
    amount: toInput(x.amt),
    pay,
    type,
    include: {},
    values: {},
    items: [],
    extra: '',
    notes: x.notes || '',
    rc: x.rc || null,
    rid: x.rid || null,
  };
  if (type === 'items') {
    draft.items = (x.split.items || []).map((it, i) => ({ key: 'i' + i, name: it.name, price: toInput(it.price), who: it.who.slice() }));
    draft.extra = x.split.extra ? toInput(x.split.extra) : '';
    for (const u of members) draft.include[u] = true;
  } else {
    const inc = x.split?.include || Object.keys(x.owedX || x.owed);
    for (const u of members) draft.include[u] = inc.includes(u);
    if (x.split?.values) draft.values = { ...x.split.values };
  }
  return draft;
}
