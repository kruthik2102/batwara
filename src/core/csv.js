import { groupNets } from './balances.js';
import { categoryOf } from './categories.js';
import { decodeHlc } from './hlc.js';

const plain = (minor) => (minor / 100).toFixed(2);

function cell(v, text) {
  let s = v === null || v === undefined ? '' : String(v);
  // Spreadsheet apps run cells that start with these as formulas.
  if (text && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per expense and payment; one column per person with what it did to their balance. */
export function groupCsv(st, gid) {
  const g = st.groups[gid];
  const people = g.everMembers;
  const name = (u) => st.users[u]?.name || st.users[u]?.phone || u;
  const head = ['Date', 'Description', 'Category', 'Currency', 'Amount', `Amount (${g.cur})`, 'Paid by', 'Split', ...people.map(name), 'Notes'];
  const rows = [head.map((h) => cell(h, true))];

  const expenses = Object.values(st.expenses).filter((x) => x.gid === gid && !x.deleted).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.hlc < b.hlc ? -1 : 1));
  for (const x of expenses) {
    const payers = Object.keys(x.paid).map(name).join(' + ');
    rows.push([
      cell(x.date), cell(x.desc, true), cell(categoryOf(x.cat).label, true), cell(x.cur), cell(plain(x.amt)), cell(plain(x.base)),
      cell(payers, true), cell(x.split?.type || 'equal'),
      ...people.map((u) => cell(plain((x.paid[u] || 0) - (x.owed[u] || 0)))),
      cell(x.notes || '', true),
    ]);
  }
  const pays = Object.values(st.settlements).filter((s) => s.gid === gid && s.status === 'confirmed').sort((a, b) => (a.hlc < b.hlc ? -1 : 1));
  for (const s of pays) {
    const d = new Date(decodeHlc(s.hlc).ms);
    const date = s.date || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    rows.push([
      cell(date), cell(`Payment: ${name(s.from)} to ${name(s.to)}`, true), cell('Payment'), cell(g.cur), cell(plain(s.amt)), cell(plain(s.amt)),
      cell(name(s.from), true), cell(s.method),
      ...people.map((u) => cell(plain(u === s.from ? s.amt : u === s.to ? -s.amt : 0))),
      cell(''),
    ]);
  }
  const nets = groupNets(st, gid);
  rows.push([cell(''), cell('Balance'), '', cell(g.cur), '', '', '', '', ...people.map((u) => cell(plain(nets[u] || 0))), '']);
  return '﻿' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}
